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

import {
  ITEMS,
  ITEM_TYPES,
  AFFINITY_POOLS,
  RARITY,
  RARITY_PROFILES,
  getRandomDrop,
  TREASURE_CHARS,
  TREASURE_OFFERINGS,
  weaponElement,
} from './items.js';
import { findRecipeByResult } from './recipes.js';

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

// ============================================================================
// VALUE TIER (0-3)
// ============================================================================

const RARITY_ORDER = [RARITY.COMMON, RARITY.UNCOMMON, RARITY.RARE, RARITY.EPIC];
const RARITY_TO_TIER = {
  [RARITY.COMMON]: 0,
  [RARITY.UNCOMMON]: 1,
  [RARITY.RARE]: 2,
  [RARITY.EPIC]: 3,
};

/**
 * Reverse-lookup an ingredient char's rarity against AFFINITY_POOLS (scanning
 * all 5 sub-categories per affinity, not just `ingredients` — a char like a
 * gemstone can be the "weapons" or "armor" pool's rare drop for one affinity
 * while being common elsewhere isn't a concern here; the first match wins).
 *
 * Falls back to recursing through the char's own recipe for crafted
 * intermediates (e.g. '⊿' Axe head) that aren't placed in any pool directly —
 * such a char's rarity is the higher of its two components' rarities.
 * Depth-capped so a malformed/cyclical recipe chain can't recurse forever;
 * an unresolvable char reads as common rather than throwing.
 */
export function getIngredientRarity(char, _depth = 0) {
  for (const pool of Object.values(AFFINITY_POOLS)) {
    for (const category of Object.values(pool)) {
      for (const rarity of RARITY_ORDER) {
        if (category[rarity]?.includes(char)) return rarity;
      }
    }
  }

  if (_depth < 6) {
    const recipe = findRecipeByResult(char);
    if (recipe) {
      const leftIdx = RARITY_ORDER.indexOf(getIngredientRarity(recipe.left, _depth + 1));
      const rightIdx = RARITY_ORDER.indexOf(getIngredientRarity(recipe.right, _depth + 1));
      return RARITY_ORDER[Math.max(leftIdx, rightIdx)];
    }
  }

  return RARITY.COMMON;
}

/**
 * Value tier 0-3 for a shop listing. Weapons use their existing `tier` field
 * (1-4 in the data → 0-3 here). Armor and consumables have no tier field —
 * adding one by hand to every item is exactly the manual-edit trap
 * CLAUDE.md's "Architectural Maturity" section warns about — so their tier is
 * the higher of their own real recipe's two ingredient rarities.
 */
function deriveValueTier(itemData, role) {
  if (role === 'WEAPON' && typeof itemData.tier === 'number') {
    return clamp(itemData.tier - 1, 0, 3);
  }
  const recipe = findRecipeByResult(itemData.char);
  if (!recipe) return 0;
  const leftTier = RARITY_TO_TIER[getIngredientRarity(recipe.left)] ?? 0;
  const rightTier = RARITY_TO_TIER[getIngredientRarity(recipe.right)] ?? 0;
  return Math.max(leftTier, rightTier);
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
// (c) TREASURE ASSIGNMENT
// ============================================================================

function elementToGemChar(element) {
  for (const [char, info] of Object.entries(TREASURE_OFFERINGS)) {
    if (info.element === element) return char;
  }
  return null;
}

/**
 * Elemental weapons (weaponElement() returns fire/ice/electric/poison) map to
 * their matching gem via the existing TREASURE_OFFERINGS table. Everything
 * else gets a uniform-random pick from TREASURE_CHARS. 'c' (Coin) is never a
 * candidate — it isn't in TREASURE_CHARS; that's the separate Coins lane.
 */
function pickTreasureChar(itemData, role) {
  if (role === 'WEAPON') {
    const element = weaponElement(itemData);
    const gem = element ? elementToGemChar(element) : null;
    if (gem) return gem;
  }
  const pool = [...TREASURE_CHARS];
  return pool[Math.floor(Math.random() * pool.length)];
}

// ============================================================================
// LISTING / STOCK
// ============================================================================

function buildListing(itemData, role) {
  const recipe = findRecipeByResult(itemData.char); // guaranteed by rollShopStock's filter
  const tier = deriveValueTier(itemData, role);
  const padding = pickPaddingIngredients(tier, [recipe.left, recipe.right]);
  const { baseCoins, coinFloor } = computeCoinPrice(tier, role);

  return {
    char: itemData.char,
    role,                         // 'ARMOR' | 'WEAPON' | 'CONSUMABLE'
    name: itemData.name,
    color: itemData.color,
    tier,
    ingredientCost: [recipe.left, recipe.right, ...padding], // 3-5 chars
    baseCoins,
    coinFloor,
    treasureChar: pickTreasureChar(itemData, role),
    sold: false,
  };
}

function pickN(pool, n) {
  const copy = [...pool];
  const picks = [];
  while (picks.length < n && copy.length > 0) {
    const idx = Math.floor(Math.random() * copy.length);
    picks.push(copy.splice(idx, 1)[0]);
  }
  return picks;
}

/**
 * Rolls one shop's stock: 1 armor / 2 weapons / 3 consumables, drawn only
 * from items with a real, discoverable 2-ingredient recipe (no hand-curated
 * catalog to maintain). Fixed return order (armor, weapon, weapon,
 * consumable×3) is the shop row order ShopSystem/ShopOverlay index into.
 */
export function rollShopStock() {
  const craftablePool = (type) =>
    Object.values(ITEMS).filter(d => d.type === type && findRecipeByResult(d.char));

  const armorPool = craftablePool(ITEM_TYPES.ARMOR);
  const weaponPool = craftablePool(ITEM_TYPES.WEAPON);
  const consumablePool = craftablePool(ITEM_TYPES.CONSUMABLE);

  return [
    ...pickN(armorPool, 1).map(d => buildListing(d, 'ARMOR')),
    ...pickN(weaponPool, 2).map(d => buildListing(d, 'WEAPON')),
    ...pickN(consumablePool, 3).map(d => buildListing(d, 'CONSUMABLE')),
  ];
}
