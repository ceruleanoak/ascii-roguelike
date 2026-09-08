// Home Zone — where in the world an item first becomes obtainable.
//
// A crafted item's Home Zone is the (Zone, Depth) at which every input its
// recipe chain needs is first available somewhere in the world. It is
// DERIVED, never authored: the chain runs
//
//   Zone -> ZONE_SPAWN_TABLES depth bands -> enemy `affinities`
//        -> AFFINITY_POOLS chars
//   Zone -> objectWeights -> BACKGROUND_OBJECTS dropEffect chars
//        (+ ZONE_MINERALS and rockVariants drop tables for rock harvest)
//   Zone -> l1WeaponPool (the free depth-1 weapon offering)
//
// then recursively resolves each recipe input through RECIPES. A new item,
// recipe, enemy, ingredient or zone is picked up automatically the moment it
// is authored — there is no per-item field to keep current, which is the
// whole point (see CLAUDE.md's "Architectural Maturity" guidance against
// hand-editing >10 definitions).
//
// The Settlement Shop is the first consumer: it stocks only listings whose
// Home Zone the player has actually reached this run (see shopPricing.js's
// rollShopStock).

import { ZONES, ZONE_MINERALS } from './zones.js';
import { ZONE_SPAWN_TABLES, ENEMIES } from './enemies.js';
import { ITEMS, AFFINITY_POOLS, RARITY_PROFILES, RARITY } from './items.js';
import { RECIPES, findRecipeByResult } from './recipes.js';
import { BACKGROUND_OBJECTS } from '../game/GameConfig.js';

// Zone progression order is the authored order of ZONES itself (green, red,
// cyan, yellow, gray, blue) rather than a second ordering invented here — it
// only ever breaks ties between two zones that unlock the same item at the
// same Depth.
const ZONE_ORDER = Object.keys(ZONES);

// The catch-all pool that barrels, crates and chests roll (see
// InteractionSystem's spawnRandom / spawnChestLoot). Deliberately EXCLUDED
// from availability: it is zone-agnostic by design and contains nearly every
// ingredient in the game, so counting it would make every zone's reachable
// set identical and flatten the ladder to nothing. A chest is a lottery, not
// a zone's identity.
const LOTTERY_POOL = 'generic';

// ============================================================================
// VALUE TIER (0-3)
// ============================================================================
//
// Moved here from shopPricing.js when Home Zone started needing it: how
// advanced an item IS belongs next to where it becomes obtainable, and both
// are pure item-data derivations. shopPricing still owns pricing and imports
// these.

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
 * Value tier 0-3 for an item. Weapons use their existing `tier` field (1-4 in
 * the data → 0-3 here). Armor and consumables have no tier field — adding one
 * by hand to every item is exactly the manual-edit trap CLAUDE.md's
 * "Architectural Maturity" section warns about — so their tier is the higher
 * of their own real recipe's two ingredient rarities.
 */
export function deriveValueTier(itemData, role) {
  if (role === 'WEAPON' && typeof itemData.tier === 'number') {
    return Math.min(3, Math.max(0, itemData.tier - 1));
  }
  const recipe = findRecipeByResult(itemData.char);
  if (!recipe) return 0;
  const leftTier = RARITY_TO_TIER[getIngredientRarity(recipe.left)] ?? 0;
  const rightTier = RARITY_TO_TIER[getIngredientRarity(recipe.right)] ?? 0;
  return Math.max(leftTier, rightTier);
}

// ============================================================================
// PER-ZONE AVAILABILITY
// ============================================================================

// A drop is only "available" if the source realistically produces it. Rarity
// is gated through the same RARITY_PROFILES curve the drop roll itself uses:
// a rarity whose weight for that source tier falls below this threshold is a
// lottery ticket, not a supply line. Without this, a depth-3 Goblin counts as
// a source of epic Dragon Scale Armor and the whole ladder collapses into
// "everything is available in green at L3".
//
// At 0.05 the practical reading is: weak sources supply common/uncommon,
// normal sources add rare, and epics need an elite (or boss) source.
const SUPPLY_WEIGHT_THRESHOLD = 0.05;

/**
 * Every char a source can realistically hand out, across all five drop
 * categories, filtered by what `tier`'s rarity profile actually supplies.
 */
function affinityChars(affinity, tier, out) {
  const pool = AFFINITY_POOLS[affinity];
  if (!pool) return;
  const profile = RARITY_PROFILES[tier] || RARITY_PROFILES.normal;
  for (const category of Object.values(pool)) {
    for (const [rarity, chars] of Object.entries(category)) {
      if ((profile[rarity] ?? 0) < SUPPLY_WEIGHT_THRESHOLD) continue;
      for (const char of chars) out.add(char);
    }
  }
}

/**
 * Chars a Zone's terrain yields regardless of Depth: the destructible
 * background objects its objectWeights actually place, plus the rock-harvest
 * mineral the zone owns. Depth-independent because terrain is placed by the
 * same objectWeights table at every Depth.
 */
function terrainChars(zone) {
  const def = ZONES[zone] || {};
  const out = new Set();

  for (const objChar of Object.keys(def.objectWeights || {})) {
    const effect = BACKGROUND_OBJECTS[objChar]?.dropEffect;
    if (!effect) continue;

    if (effect.startsWith('destroyObject:spawnIngredient:')) {
      out.add(effect.split(':')[2]);
    } else if (effect.startsWith('destroyObject:spawnMultiple:')) {
      out.add(effect.split(':')[2]);
    } else if (effect.startsWith('destroyObject:spawnWeapon:')) {
      out.add(effect.split(':')[2]);
    } else if (effect === 'destroyObject:rockHarvest') {
      out.add('0');                               // Rock is the guaranteed drop
      for (const mineral of ZONE_MINERALS[zone] || []) out.add(mineral);
    }
    // spawnRandom / spawnChestLoot roll LOTTERY_POOL — intentionally skipped.
  }

  // Zone-formation rocks (Obsidian Boulder, Barrow Stone, …) stack their own
  // drop table on top of the harvest rolls, at the same rarity profiles
  // InteractionSystem's rockHarvest branch rolls them with.
  for (const variant of def.environmentalFeatures?.rockVariants || []) {
    if (variant.dropTable && variant.dropTable !== LOTTERY_POOL) {
      affinityChars(variant.dropTable, variant.dropTable === 'rare_gemstone' ? 'elite' : 'normal', out);
    }
  }

  // The free depth-1 weapon offering — one floating pickup per L1 room.
  for (const char of def.l1WeaponPool || []) out.add(char);

  return out;
}

const terrainCache = new Map();
function cachedTerrainChars(zone) {
  if (!terrainCache.has(zone)) terrainCache.set(zone, terrainChars(zone));
  return terrainCache.get(zone);
}

/** Ascending depth-band thresholds for a zone, as real Depth values (band 0 is L1). */
function zoneBands(zone) {
  const table = ZONE_SPAWN_TABLES[zone];
  if (!table) return [1];
  return Object.keys(table)
    .map(Number)
    .sort((a, b) => a - b)
    .map(threshold => Math.max(1, threshold));
}

/** Everything obtainable in `zone` at or above Depth `depth`. */
function availableChars(zone, depth) {
  const out = new Set(cachedTerrainChars(zone));
  const table = ZONE_SPAWN_TABLES[zone] || {};

  for (const threshold of Object.keys(table).map(Number)) {
    if (threshold > depth) continue;
    for (const enemyChar of table[threshold]) {
      const enemy = ENEMIES[enemyChar];
      for (const affinity of enemy?.affinities || []) {
        if (affinity === LOTTERY_POOL) continue;
        affinityChars(affinity, enemy.tier, out);
      }
    }
  }
  return out;
}

// ============================================================================
// RECIPE REACHABILITY
// ============================================================================

// result char -> every recipe that produces it (a char can have several, e.g.
// Health Potion from Meat+Fire or Base Potion+Meat — any one path suffices).
const RECIPES_BY_RESULT = new Map();
for (const recipe of RECIPES) {
  if (!RECIPES_BY_RESULT.has(recipe.result)) RECIPES_BY_RESULT.set(recipe.result, []);
  RECIPES_BY_RESULT.get(recipe.result).push(recipe);
}

/**
 * True when `char` can be obtained from `available` — either it drops
 * directly, or some recipe producing it has both inputs reachable.
 * `resolving` breaks recipe cycles (Hammer+Hammer=Maul style self-reference
 * chains) by treating a char already on the current path as unreachable.
 */
function isReachable(char, available, memo, resolving) {
  if (available.has(char)) return true;
  if (memo.has(char)) return memo.get(char);
  if (resolving.has(char)) return false;

  resolving.add(char);
  let reachable = false;
  for (const recipe of RECIPES_BY_RESULT.get(char) || []) {
    if (isReachable(recipe.left, available, memo, resolving) &&
        isReachable(recipe.right, available, memo, resolving)) {
      reachable = true;
      break;
    }
  }
  resolving.delete(char);

  memo.set(char, reachable);
  return reachable;
}

// ============================================================================
// HOME ZONE
// ============================================================================

// Minimum Home Depth per value tier, and the dominant term in the derivation.
//
// Supply alone is far too loose a ladder. The spawn bands are 5 Depths wide,
// terrain is Depth-independent, and gear drops in general are lenient — a
// single normal-tier Goblin at green L3 technically "supplies" every rare
// humanoid weapon, which would bring a Chaos Blade home at green L3 alongside
// a Dagger. Existing drop generosity is therefore NOT the yardstick for what
// counts as advanced; these floors are. Supply says whether an item can come
// home in a zone at all, the tier floor says how deep in.
//
// The bands mirror the shape asked for: staples from Depth 1, then a floor
// every ~5 Depths, with the top tier sitting just short of green's Depth-15
// boss. These four numbers are the shop's pacing dial — retune them, not the
// derivation, after a playtest.
const TIER_MIN_DEPTH = [1, 5, 10, 14];

const homeZoneCache = new Map();

/**
 * The (Zone, Depth) at which `char` first becomes obtainable — the zone whose
 * world first supplies its whole recipe chain, at the deeper of the supplying
 * Depth band and the item's value-tier floor. Null when nothing in the world
 * can produce it (unique puzzle rewards, fountain-only upgrades, alchemy-only
 * fills), in which case the shop simply never stocks it.
 *
 * Ties on Depth go to the earlier zone in ZONE_ORDER.
 */
export function getHomeZone(char) {
  if (homeZoneCache.has(char)) return homeZoneCache.get(char);

  const data = ITEMS[char];
  const tierFloor = data ? TIER_MIN_DEPTH[deriveValueTier(data, data.type)] ?? 1 : 1;

  let best = null;
  for (const zone of ZONE_ORDER) {
    for (const band of zoneBands(zone)) {
      if (!isReachable(char, availableChars(zone, band), new Map(), new Set())) continue;
      const depth = Math.max(band, tierFloor);
      if (!best || depth < best.depth) best = { zone, depth };
      break; // deeper bands in this zone can only be worse
    }
  }

  homeZoneCache.set(char, best);
  return best;
}

/**
 * How advanced a listing is, as a single comparable number: its Home Depth.
 * With strict per-zone gating (see isUnlocked) the zone dimension decides IF
 * an item is available and Depth decides how far in it sits — so a red L3
 * item and a green L3 item are equally advanced, which is the honest reading.
 */
export function getAdvancement(char) {
  return getHomeZone(char)?.depth ?? Infinity;
}

/** True when this run has reached the char's Home Zone at its Home Depth. */
export function isUnlocked(char, zoneDepths) {
  const home = getHomeZone(char);
  if (!home) return false;
  return (zoneDepths?.[home.zone] || 0) >= home.depth;
}

/**
 * Compact string identifying the player's current reach. Consumers (the
 * Shopkeeper) compare it against the signature their stock was rolled at to
 * know when progress has moved and unsold rows deserve a re-roll.
 */
export function progressSignature(zoneDepths) {
  return ZONE_ORDER.map(zone => `${zone}:${zoneDepths?.[zone] || 0}`).join('|');
}

/** Deepest Depth the run has reached in any zone — the player's frontier. */
export function frontierDepth(zoneDepths) {
  let deepest = 0;
  for (const zone of ZONE_ORDER) deepest = Math.max(deepest, zoneDepths?.[zone] || 0);
  return deepest;
}
