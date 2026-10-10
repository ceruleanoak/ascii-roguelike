/**
 * CanonOverlay — applies Canon Edits (what the player authored in the CLI)
 * to the game at boot.
 *
 * The registries are read-only at runtime; the overlay is the one sanctioned
 * write, and it runs in the entry point before the Game is constructed, so
 * nothing has read ITEMS / RECIPES / CHARACTER_TYPES yet. The CLI itself
 * never touches the registries — it edits the stored canon, and ☠ (PURE ROGUE)
 * relaunches so this overlay re-applies from a clean boot.
 *
 * Stored values are untrusted (the store survives across builds and can be
 * hand-edited), so only the fields the CLI can author are copied, and an
 * authored weapon never replaces an existing registry entry.
 *
 * A Disabled Weapon (switched off in CUSTOMIZE) never appears in a run: its
 * recipes and tier-ladder rungs are cut here, and every other placement —
 * loot pools, room offerings, starting loadouts — gets a stand-in, because
 * Item construction asks canonStandIn() for the glyph it should really be.
 */

import { ITEMS, INGREDIENTS, ITEM_TYPES, WEAPON_TIERS } from '../data/items.js';
import { RECIPES, findRecipe } from '../data/recipes.js';
import { CHARACTER_TYPES } from '../data/characters.js';
import { STYLE_FIELDS } from '../data/weaponStyles.js';

/** The weapon fields the CLI's Weapons table can author (a Weapon Style's included). */
export const WEAPON_FIELDS = [...new Set([
  'name', 'color', 'weaponType', 'weaponSubtype', 'damage',
  'windup', 'recovery', 'patternSpeed', 'range',
  'cooldown', 'maxUses', 'accuracy', 'reloadTime', 'reloadType',
  ...STYLE_FIELDS,
])];

// Disabled Weapon glyph → the enabled weapons that stand in for it. Filled
// once at boot by applyCanonOverlay; empty when nothing is disabled.
const STAND_INS = new Map();

function pickWeaponFields(entry) {
  const fields = {};
  for (const key of WEAPON_FIELDS) {
    if (entry[key] !== undefined) fields[key] = entry[key];
  }
  return fields;
}

export function applyCanonOverlay(canon) {
  for (const [type, name] of Object.entries(canon.names || {})) {
    if (CHARACTER_TYPES[type] && typeof name === 'string' && name) CHARACTER_TYPES[type].name = name;
  }

  for (const [glyph, entry] of Object.entries(canon.weapons || {})) {
    if (!entry || typeof entry !== 'object') continue;
    const fields = pickWeaponFields(entry);
    if (entry.authored) {
      // A weapon the player created: a new registry entry under its glyph.
      if (ITEMS[glyph] || INGREDIENTS[glyph]) continue;
      ITEMS[glyph] = { ...fields, char: glyph, type: ITEM_TYPES.WEAPON };
      const { left, right } = entry.recipe || {};
      if (INGREDIENTS[left] && INGREDIENTS[right] && !findRecipe(left, right)) {
        RECIPES.push({ left, right, result: glyph, name: fields.name });
      }
    } else if (ITEMS[glyph]?.type === ITEM_TYPES.WEAPON) {
      // An edit to an existing weapon: the authored stats override its data.
      Object.assign(ITEMS[glyph], fields);
    }
  }

  disableWeapons(Object.keys(canon.disabled || {}).filter(g => canon.disabled[g] && ITEMS[g]?.type === ITEM_TYPES.WEAPON));
}

const familyOf = data => data.weaponSubtype || data.weaponType;

/**
 * Cut Disabled Weapons out of a run: no recipe crafts them (which also takes
 * them off shop counters — shop stock is the craftable catalogue), no fountain
 * or duplicate upgrade climbs to them, and each gets its stand-ins — enabled
 * weapons of the same family and tier, else the same family, else the same
 * weapon type.
 */
function disableWeapons(glyphs) {
  if (!glyphs.length) return;
  const disabled = new Set(glyphs);

  for (let i = RECIPES.length - 1; i >= 0; i--) {
    if (disabled.has(RECIPES[i].result)) RECIPES.splice(i, 1);
  }
  for (const family of Object.keys(WEAPON_TIERS)) {
    const rungs = WEAPON_TIERS[family].map(rung => rung.filter(g => !disabled.has(g))).filter(rung => rung.length);
    if (rungs.length) WEAPON_TIERS[family] = rungs;
    else delete WEAPON_TIERS[family];
  }

  const enabled = Object.values(ITEMS).filter(d => d.type === ITEM_TYPES.WEAPON && !disabled.has(d.char));
  for (const glyph of glyphs) {
    const data = ITEMS[glyph];
    const sameFamily = enabled.filter(d => familyOf(d) === familyOf(data));
    const candidates = [
      sameFamily.filter(d => d.tier === data.tier),
      sameFamily,
      enabled.filter(d => d.weaponType === data.weaponType),
    ].find(list => list.length);
    if (candidates) STAND_INS.set(glyph, candidates.map(d => d.char));
  }
}

/**
 * The glyph an Item made as `char` should really be: a Disabled Weapon's
 * random stand-in, or `char` itself. With every weapon of its kind disabled,
 * nothing can stand in and the weapon appears as itself.
 */
export function canonStandIn(char) {
  const standIns = STAND_INS.get(char);
  return standIns ? standIns[Math.floor(Math.random() * standIns.length)] : char;
}

/** Cheats switched on in the CLI start every session switched on. */
export function seedCanonCheats(game, canon) {
  const cheats = canon.cheats || {};
  if (cheats.godMode) game.cheatMenu.godMode = true;
  if (cheats.particleFireworks && !game.particleFireworks) game.particleFireworksTicker.toggle();
  if (cheats.showVectors) game.showVectors = true;
}
