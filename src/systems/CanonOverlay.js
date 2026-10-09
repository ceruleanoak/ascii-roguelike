/**
 * CanonOverlay — applies Canon Edits (what the player authored in the CLI)
 * to the game at boot.
 *
 * The registries are read-only at runtime; the overlay is the one sanctioned
 * write, and it runs in the entry point before the Game is constructed, so
 * nothing has read ITEMS / RECIPES / CHARACTER_TYPES yet. The CLI itself
 * never touches the registries — it edits the stored canon, and ☠ PURE ROGUE
 * relaunches so this overlay re-applies from a clean boot.
 *
 * Stored values are untrusted (the store survives across builds and can be
 * hand-edited), so only the fields the CLI can author are copied, and an
 * authored weapon never replaces an existing registry entry.
 */

import { ITEMS, INGREDIENTS, ITEM_TYPES } from '../data/items.js';
import { RECIPES, findRecipe } from '../data/recipes.js';
import { CHARACTER_TYPES } from '../data/characters.js';

/** The weapon fields the CLI's Weapons table can author. */
export const WEAPON_FIELDS = [
  'name', 'color', 'weaponType', 'weaponSubtype', 'damage',
  'windup', 'recovery', 'patternSpeed', 'range',
  'cooldown', 'maxUses', 'accuracy', 'reloadTime', 'reloadType',
];

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
}

/** Cheats switched on in the CLI start every session switched on. */
export function seedCanonCheats(game, canon) {
  const cheats = canon.cheats || {};
  if (cheats.godMode) game.cheatMenu.godMode = true;
  if (cheats.particleFireworks && !game.particleFireworks) game.particleFireworksTicker.toggle();
  if (cheats.showVectors) game.showVectors = true;
}
