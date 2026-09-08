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
// (recipe pairs, AFFINITY_POOLS rarity, weapon .tier) rather than a new
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
  AFFINITY_POOLS,
  RARITY_PROFILES,
  getRandomDrop,
  TREASURE_CHARS,
  TREASURE_OFFERINGS,
  weaponElement,
} from './items.js';
import { findRecipeByResult } from './recipes.js';
import {
  deriveValueTier,
  getHomeZone,
  getAdvancement,
  isUnlocked,
} from './homeZone.js';

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

// ============================================================================
// (a) PADDING INGREDIENTS
// ============================================================================

// T → RARITY_PROFILES key: reuses the same weak/normal/elite/boss weighting
// curve enemy drops already use (see generateEnemyDrops), skewed toward the
// listing's own tier rather than reimplementing a weighting scheme.
const TIER_PROFILE = ['weak', 'normal', 'elite', 'boss'];

/**
 * Picks `clamp(T, 1, 3)` padding ingredient chars, deduped against the real
 * recipe pair and each other, drawn across every affinity's ingredient pool
 * (padding is a generic "resources" sink, not themed to one affinity).
 * Combined with the real 2-ingredient recipe pair, totals run 3/3/4/5 across
 * T0-T3 — always ≥3, matching the "3-5" spec exactly.
 */
function pickPaddingIngredients(T, excludeChars) {
  const count = clamp(T, 1, 3);
  const profile = RARITY_PROFILES[TIER_PROFILE[T]] || RARITY_PROFILES.normal;
  const affinities = Object.keys(AFFINITY_POOLS);
  const excluded = new Set(excludeChars);
  const picks = [];

  // Bounded retry loop, not a while(true): a bad roll (duplicate/excluded
  // char) just retries a capped number of times rather than risking an
  // infinite loop if the pool is nearly exhausted of eligible chars.
  let attempts = 0;
  while (picks.length < count && attempts < count * 20) {
    attempts++;
    const char = getRandomDrop(affinities, 'ingredients', profile);
    if (char && !excluded.has(char)) {
      picks.push(char);
      excluded.add(char);
    }
  }
  return picks;
}

// ============================================================================
// (b) COIN PRICE
// ============================================================================

// Every existing coin-spend in the game is a flat 1, occasionally 2 — this is
// the game's first real multi-coin price ladder. Sized deliberately per the
// "significantly more resources" framing; these four constants are isolated
// and trivial to retune after a playtest.
const BASE_COIN = { WEAPON: 4, ARMOR: 5, CONSUMABLE: 2 };
const COIN_PER_TIER = { WEAPON: 3, ARMOR: 3, CONSUMABLE: 2 };

/**
 * baseCoins is the full coin price with zero ingredients toggled in.
 * coinFloor is the minimum it can shrink to — ingredients alone never pay a
 * listing down to zero coins. ShopSystem computes the live remaining price by
 * shaving an even share of (baseCoins - coinFloor) off per toggled ingredient
 * lane.
 */
function computeCoinPrice(T, role) {
  const baseCoins = BASE_COIN[role] + T * COIN_PER_TIER[role];
  const coinFloor = Math.max(1, Math.ceil(baseCoins * 0.2));
  return { baseCoins, coinFloor };
}

// ============================================================================
// PAWN SELL VALUE
// ============================================================================

// Flat per-tier coin payout for the Shopkeeper's Pawn side (selling FROM the
// player's own itemChest/armorInventory/consumableInventory — see ShopSystem's
// 'pawn' mode), as opposed to the WARES buy side above. One flat scale
// regardless of role: a payout doesn't need the WARES side's per-role skew,
// just "worth more if rarer."
const PAWN_SELL_BASE = 1;
const PAWN_SELL_PER_TIER = 1;

/** Coins paid out for selling one owned Item (weapon/armor/consumable/trap). */
export function computePawnSellValue(itemData) {
  const tier = deriveValueTier(itemData, itemData.type);
  return PAWN_SELL_BASE + tier * PAWN_SELL_PER_TIER;
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
 * Which gem gets picked doesn't track the listing's tier — how much of it is
 * required does (see buildListing's treasureCount, and TIER_TREASURE_COUNT
 * below). Scaling quantity instead of hunting for a rarer gem per tier keeps
 * this to one rarity axis (the existing ingredient rarities) instead of
 * inventing a second one across only 8 treasure chars.
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
// requires, indexed by tier. Tier 0 has no entry — see buildListing, which
// omits the Treasure lane entirely below tier 1: a single gem is
// disproportionate collateral for the cheapest items, so there's nothing to
// require a copy count of.
const TIER_TREASURE_COUNT = [0, 1, 2, 3];

// ============================================================================
// LISTING / STOCK
// ============================================================================

function buildListing(itemData, role) {
  const recipe = findRecipeByResult(itemData.char); // guaranteed by rollShopStock's filter
  const tier = deriveValueTier(itemData, role);
  const padding = pickPaddingIngredients(tier, [recipe.left, recipe.right]);
  const { baseCoins, coinFloor } = computeCoinPrice(tier, role);

  // Tier 0 has no Treasure lane at all (see TIER_TREASURE_COUNT); tier 1-3
  // require 1/2/3 copies of the same picked treasure char respectively.
  const treasureCount = TIER_TREASURE_COUNT[tier] ?? 0;
  const treasureChar = treasureCount > 0 ? pickTreasureChar(itemData, role) : null;

  return {
    char: itemData.char,
    role,                         // 'ARMOR' | 'WEAPON' | 'CONSUMABLE'
    name: itemData.name,
    color: itemData.color,
    tier,
    home: getHomeZone(itemData.char),  // {zone, depth} — why this row is stockable
    ingredientCost: [recipe.left, recipe.right, ...padding], // 3-5 chars
    baseCoins,
    coinFloor,
    treasureChar,
    treasureCount,
    sold: false,
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
 * The slice of a role's catalogue this run has unlocked. Falls back to the
 * shallowest-Home-Depth items when nothing qualifies (a shop reached before
 * any Depth was banked) so the counter is never bare — an empty shop reads as
 * a bug to the player, not as a gate.
 */
function unlockedPool(type, zoneDepths) {
  const pool = craftablePool(type);
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
 */
export function rollShopStock(zoneDepths = {}) {
  return [
    ...pickAdvanced(unlockedPool(ITEM_TYPES.ARMOR, zoneDepths), 1).map(d => buildListing(d, 'ARMOR')),
    ...pickAdvanced(unlockedPool(ITEM_TYPES.WEAPON, zoneDepths), 2).map(d => buildListing(d, 'WEAPON')),
    ...pickAdvanced(unlockedPool(ITEM_TYPES.CONSUMABLE, zoneDepths), 3).map(d => buildListing(d, 'CONSUMABLE')),
  ];
}
