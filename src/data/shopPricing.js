// Shop pricing — pure data-library functions, no `game` argument (see
// ShopSystem for the stateful side: toggles, payment, delivery).
//
// The Settlement Shop sells a random roll of 1 armor / 2 weapons / 3
// consumables, each purchasable three ways: a padded ingredient price (more
// than the item's real 2-ingredient recipe — this is deliberately a worse
// deal than crafting), a coin price that shrinks as ingredients are paid in,
// or a single specific Treasure item as a full-price substitute.
//
// Every price is derived algorithmically from data that already exists
// (recipe pairs, ingredient rarity, weapon .tier) rather than a new
// manually-authored field on 25+ items — see CLAUDE.md's "Architectural
// Maturity" guidance against >10-item manual edits.
//
// WHAT the shop may stock is gated the same way: every listing's Home Zone
// (data/homeZone.js) is derived from where in the world its recipe chain
// first becomes obtainable, and rollShopStock only draws from listings the
// run has actually reached. Nothing to author per item, so the gate can't go
// stale as items are added.

import {
  ITEMS,
  ITEM_TYPES,
  INGREDIENTS,
  RARITY,
  TREASURE_CHARS,
  TREASURE_OFFERINGS,
  weaponElement,
} from './items.js';
import { findRecipeByResult } from './recipes.js';
import {
  deriveValueTier,
  getHomeZone,
  getRarity,
  getAdvancement,
  isUnlocked,
  progressRarity,
  RARITY_ORDER,
} from './homeZone.js';

// ============================================================================
// (a) PADDING INGREDIENTS
// ============================================================================

// Padding ingredients per listing, by the item's own rarity. A common item's
// recipe is free: no padding at all.
const PADDING_BY_RARITY = {
  [RARITY.COMMON]: 0,
  [RARITY.UNCOMMON]: 1,
  [RARITY.RARE]: 2,
  [RARITY.EPIC]: 3,
};

// Raw ingredients only: a char with no recipe of its own. Crafted
// intermediates are never drops, so they never pad a price. Coin is currency,
// not a padding pull; a recipe that names coin still lists it as a real input
// (left/right), which pickPaddingIngredients never draws from.
function rawIngredientChars() {
  return Object.keys(INGREDIENTS).filter(char => char !== 'c' && !findRecipeByResult(char));
}

function shuffled(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Picks up to `count` raw ingredient chars of `rarity` (the rarity the zone's
 * depth progress unlocks), deduped against the recipe pair. A rarity with no
 * raw ingredients left steps down to the next lower one.
 */
function pickPaddingIngredients(count, rarity, excludeChars) {
  const excluded = new Set(excludeChars);
  const raw = rawIngredientChars().filter(char => !excluded.has(char));
  for (let i = RARITY_ORDER.indexOf(rarity); i >= 0; i--) {
    const pool = raw.filter(char => getRarity(char) === RARITY_ORDER[i]);
    if (pool.length > 0) return shuffled(pool).slice(0, count);
  }
  return [];
}

/**
 * The padding rarity for one shop: its own zone's depth progress, or the
 * furthest Depth banked anywhere when the Settlement has no zone.
 */
function paddingRarityFor(zoneDepths, zone) {
  const depth = zone ? (zoneDepths[zone] ?? 0) : Math.max(0, ...Object.values(zoneDepths));
  return progressRarity(depth);
}

// ============================================================================
// (b) COIN PRICE
// ============================================================================

// Coin price = exactly SHOP_COIN_MARKUP times what the Pawn side pays for the
// same item, so the two counters can't disagree. Priced from the whole-coin
// payout, never the fractional worth under it: a Sling worth 1.1 pawns for 1,
// and marking up the 1.1 charged 3. Padding raises a listing's ingredient lanes,
// not its coins.
const SHOP_COIN_MARKUP = 2;

// Nothing in the shop sells for less, however cheap or discounted.
const SHOP_MIN_COINS = 2;

/**
 * baseCoins is the full coin price with zero ingredients toggled in.
 * coinFloor is the minimum it can shrink to — ingredients alone never pay a
 * listing below SHOP_MIN_COINS. ShopSystem computes the live remaining price by
 * taking one coin off per toggled ingredient lane.
 */
function computeCoinPrice(itemData) {
  const baseCoins = Math.max(SHOP_MIN_COINS, computePawnSellValue(itemData) * SHOP_COIN_MARKUP);
  const coinFloor = Math.max(SHOP_MIN_COINS, Math.ceil(baseCoins * 0.2));
  return { baseCoins, coinFloor };
}

// ============================================================================
// PAWN SELL VALUE
// ============================================================================

// What the Shopkeeper's Pawn side pays for one owned Item (selling FROM the
// player's own loadout and storage — quick slots, worn armor, itemChest plus
// its not-yet-flushed deferred deposits, armorInventory, consumableInventory —
// see ShopSystem's 'pawn' mode). Ingredients are never pawned; their `value`
// is the currency an item's worth is accumulated from.

// Values are floats, so sums and products can land a hair off a whole number
// (2.9999999999999996, 2.0000000000000004). Round to 1e-9 before any round or
// ceil so a whole-coin total isn't pushed to the wrong coin.
function roundFloat(n) {
  return Math.round(n * 1e9) / 1e9;
}

/**
 * Fractional worth of one unit of `char`, accumulated down its whole recipe
 * chain: an Ingredient is its explicit `value` (missing counts as 0 — check:data
 * fails on it), a crafted Item is the worth of its recipe inputs, so a Flame
 * Sword carries the Sword it was forged from. An Item no recipe builds (a found
 * Sword, a Compass) has no inputs to add up, so it is worth its value tier,
 * 1-based.
 *
 * Every Item is worth at least a coin, and so is the raw half of each crafting
 * step: Goo is worth 0.2 alone, but Boots + Goo is one more step of work, so
 * Rubber Boots land above Boots instead of rounding back down to them. Weapons
 * and armor also never fall below their tier: a Maul is still a T2 weapon.
 * Anything else is worth 0.
 */
function ingredientWorth(char, visiting = new Set()) {
  const ingredient = INGREDIENTS[char];
  if (ingredient) return ingredient.value ?? 0;
  const item = ITEMS[char];
  if (!item || visiting.has(char)) return 0;
  const tierWorth = deriveValueTier(item, item.type) + 1;
  const recipe = findRecipeByResult(char);
  if (!recipe) return tierWorth;

  visiting.add(char);
  const inputs = [recipe.left, recipe.right];
  const rawInputs = inputs.filter(input => INGREDIENTS[input]);
  const rawWorth = rawInputs.reduce((sum, input) => sum + ingredientWorth(input), 0);
  const itemWorth = inputs
    .filter(input => !INGREDIENTS[input])
    .reduce((sum, input) => sum + ingredientWorth(input, visiting), 0);
  visiting.delete(char);

  const worth = itemWorth + (rawInputs.length > 0 ? Math.max(1, rawWorth) : 0);
  const isGear = item.type === ITEM_TYPES.WEAPON || item.type === ITEM_TYPES.ARMOR;
  return Math.max(isGear ? tierWorth : 1, worth);
}

/**
 * Coins paid out for selling one owned Item (weapon/armor/consumable/trap).
 * An item's own `pawnValue` overrides the computed value — the Empty Bottle and
 * the raw liquid Bottles are free to fill from the world, so pawning them at
 * 1+ coin turned every Bottle drop into a coin. Otherwise the payout is the
 * item's accumulated worth, rounded to the nearest whole coin.
 */
export function computePawnSellValue(itemData) {
  if (itemData.pawnValue !== undefined) return itemData.pawnValue;
  return Math.round(roundFloat(ingredientWorth(itemData.char)));
}

// ============================================================================
// (c) TREASURE ASSIGNMENT
// ============================================================================

function elementToGemChar(element) {
  for (const [char, info] of Object.entries(TREASURE_OFFERINGS)) {
    if (info.element === element) return char;
  }
  return null;
}

// TREASURE_CHARS minus Artifact (⚜). Artifact lives in TREASURE_CHARS purely
// for Tab-overlay display grouping, but it isn't a precious gem — it's not
// in TREASURE_OFFERINGS (no fountain element/blessing), and it already has
// its own modest economy (~3 coins via ErrandSystem.tryGiveArtifact, a Wise
// Fellow hint trade). Full-price collateral in this lane should be an actual
// gem, so Artifact is excluded from the pool the shop draws from.
const SHOP_TREASURE_CHARS = [...TREASURE_CHARS].filter(c => c !== '⚜');

/**
 * Elemental weapons (weaponElement() returns fire/ice/electric/poison) map to
 * their matching gem via the existing TREASURE_OFFERINGS table. Everything
 * else gets a uniform-random pick from SHOP_TREASURE_CHARS. 'c' (Coin) is
 * never a candidate — it isn't in TREASURE_CHARS; that's the separate Coins
 * lane.
 *
 * Which gem gets picked doesn't track the item's rarity — how many copies are
 * required does (see buildListing's treasureCount and TREASURE_COUNT_BY_RARITY
 * below). Scaling quantity instead of hunting for a rarer gem per rarity keeps
 * this to one rarity axis instead of inventing a second one across only 8
 * treasure chars.
 */
function pickTreasureChar(itemData, role) {
  if (role === 'WEAPON') {
    const element = weaponElement(itemData);
    const gem = element ? elementToGemChar(element) : null;
    if (gem) return gem;
  }
  return SHOP_TREASURE_CHARS[Math.floor(Math.random() * SHOP_TREASURE_CHARS.length)];
}

// How many copies of the same treasure char a listing's Treasure lane
// requires, by the item's rarity. Common has no Treasure lane at all — see
// buildListing: a single gem is disproportionate collateral for the most
// common items.
const TREASURE_COUNT_BY_RARITY = {
  [RARITY.COMMON]: 0,
  [RARITY.UNCOMMON]: 1,
  [RARITY.RARE]: 2,
  [RARITY.EPIC]: 3,
};

// ============================================================================
// LISTING / STOCK
// ============================================================================

function buildListing(itemData, role, paddingRarity) {
  const recipe = findRecipeByResult(itemData.char); // guaranteed by rollShopStock's filter
  const tier = deriveValueTier(itemData, role);
  const padding = pickPaddingIngredients(
    PADDING_BY_RARITY[getRarity(itemData.char)],
    paddingRarity,
    [recipe.left, recipe.right],
  );

  // Common has no Treasure lane at all (see TREASURE_COUNT_BY_RARITY); uncommon,
  // rare and epic require 1/2/3 copies of the same picked treasure char.
  // A listing whose ingredient price already holds a gem (a gem recipe like
  // Infused Whip + Ruby, or a gem rolled as padding) gets no Treasure lane either:
  // the outright gem buy would undercut the listing's own recipe — Ruby ×1
  // for a Ruby Whip costs less than the Infused Whip + Ruby.
  // Shuffled so the lanes don't show which two chars are the real recipe.
  const ingredientCost = shuffled([recipe.left, recipe.right, ...padding]);
  const { baseCoins, coinFloor } = computeCoinPrice(itemData);
  const gemInPrice = ingredientCost.some(char => TREASURE_CHARS.has(char));
  const treasureCount = gemInPrice ? 0 : TREASURE_COUNT_BY_RARITY[getRarity(itemData.char)];
  const treasureChar = treasureCount > 0 ? pickTreasureChar(itemData, role) : null;

  return {
    char: itemData.char,
    role,                         // 'ARMOR' | 'WEAPON' | 'CONSUMABLE'
    name: itemData.name,
    color: itemData.color,
    tier,
    home: getHomeZone(itemData.char),  // {zone, depth} — why this row is stockable
    ingredientCost,               // recipe pair + 0-3 padding, shuffled
    baseCoins,
    coinFloor,
    treasureChar,
    treasureCount,
    sold: false,
    // How many times this exact row has been offered (shop opened) without a
    // purchase — Shopkeeper.refreshStock force-rerolls a stale unsold row
    // once this crosses STOCK_STALE_VISIT_LIMIT, so standing pat never dead-
    // ends the counter on wares the player has already passed on twice.
    staleVisits: 0,
  };
}

/**
 * The craftable catalogue for one role: items with a real, discoverable
 * 2-ingredient recipe (no hand-curated list to maintain) that also have a
 * derivable Home Zone. Items with no Home Zone — alchemy-only fills, puzzle
 * rewards, anything the world can't supply through drops and recipes — are
 * never shop stock.
 */
function craftablePool(type) {
  return Object.values(ITEMS).filter(
    d => d.type === type && findRecipeByResult(d.char) && getHomeZone(d.char)
  );
}

/**
 * craftablePool narrowed to one physical Zone's own wares (Home Zone match) —
 * a Settlement's counter should read as local to where it's standing, not a
 * single catalogue shared identically by every Settlement in the game. Falls
 * back to the full unzoned catalogue when the zone has nothing of this role
 * (e.g. Blue/Gray, which are light on lootable gear by design) so the shop
 * never goes bare over a zone-purity rule.
 */
function zoneCraftablePool(type, zone) {
  const pool = craftablePool(type);
  if (!zone) return pool;
  const zoned = pool.filter(d => getHomeZone(d.char)?.zone === zone);
  return zoned.length > 0 ? zoned : pool;
}

/**
 * The slice of a role's catalogue this run has unlocked, restricted to the
 * shop's own zone first (see zoneCraftablePool). Falls back to the
 * shallowest-Home-Depth items when nothing qualifies (a shop reached before
 * any Depth was banked) so the counter is never bare — an empty shop reads as
 * a bug to the player, not as a gate.
 */
function unlockedPool(type, zoneDepths, zone) {
  const pool = zoneCraftablePool(type, zone);
  const unlocked = pool.filter(d => isUnlocked(d.char, zoneDepths));
  if (unlocked.length > 0) return unlocked;

  const shallowest = Math.min(...pool.map(d => getAdvancement(d.char)));
  return pool.filter(d => getAdvancement(d.char) === shallowest);
}

/**
 * Weighted pick favouring the player's frontier: an item's weight is its Home
 * Depth, so the deepest wares a run has earned are the likeliest to appear
 * while shallow staples stay possible. Early on every candidate is Home
 * Depth 1 and this degrades to the uniform pick it replaced.
 */
function pickAdvanced(pool, n) {
  const copy = [...pool];
  const picks = [];
  while (picks.length < n && copy.length > 0) {
    const weights = copy.map(d => Math.max(1, getAdvancement(d.char)));
    const total = weights.reduce((sum, w) => sum + w, 0);
    let roll = Math.random() * total;
    let idx = weights.findIndex(w => (roll -= w) < 0);
    if (idx === -1) idx = copy.length - 1;
    picks.push(copy.splice(idx, 1)[0]);
  }
  return picks;
}

/**
 * Rolls one shop's stock: 1 armor / 2 weapons / 3 consumables, drawn from
 * whatever this run has unlocked and biased toward its frontier. Fixed return
 * order (armor, weapon, weapon, consumable×3) is the shop row order
 * ShopSystem/ShopOverlay index into.
 *
 * @param {Object} zoneDepths - game.zoneDepths: deepest Depth reached per Zone
 *   this run. Resets on death with the rest of the run, so a fresh run walks
 *   up to a beginner's counter again.
 * @param {string|null} zone - the Zone this Settlement physically sits in
 *   (room.zone). Narrows each role's pool to that zone's own wares first (see
 *   zoneCraftablePool) — a Green Settlement and a Red Settlement stock
 *   different counters instead of drawing from one shared catalogue.
 */
export function rollShopStock(zoneDepths = {}, zone = null) {
  const paddingRarity = paddingRarityFor(zoneDepths, zone);
  return [
    ...pickAdvanced(unlockedPool(ITEM_TYPES.ARMOR, zoneDepths, zone), 1).map(d => buildListing(d, 'ARMOR', paddingRarity)),
    ...pickAdvanced(unlockedPool(ITEM_TYPES.WEAPON, zoneDepths, zone), 2).map(d => buildListing(d, 'WEAPON', paddingRarity)),
    ...pickAdvanced(unlockedPool(ITEM_TYPES.CONSUMABLE, zoneDepths, zone), 3).map(d => buildListing(d, 'CONSUMABLE', paddingRarity)),
  ];
}
