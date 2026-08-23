import { findRecipeByResult } from '../recipes.js';

/**
 * Look up a puzzle-room pedestal's weapon tutorial by the character authored
 * directly on the marker (a puzzle template's `pedestal.weaponChar`, typed
 * freely in the dungeon editor's Pedestal tool — not chosen from a fixed
 * list). The recipe pair the pedestal displays (grayed, decorative — see
 * DungeonFloorGenerator.js's generatePuzzleRoom pedestal handling and
 * HutInteriorOverlay.js's weaponPedestal render block) is looked up live
 * from recipes.js, the sole source of truth for ingredient pairings, so a
 * recipe rebalance (either ingredient swapped) can never silently desync
 * the pedestal's display from what the recipe actually requires.
 *
 * Returns null if no recipe produces weaponChar, since the pedestal has
 * nothing correct to display either way — the dungeon editor's save-time
 * validation (tools/dungeon-editor/main.js) checks the same recipe list so
 * an author catches this before it ever reaches runtime.
 */
export function pickWeaponTutorial(weaponChar) {
  if (!weaponChar) return null;
  const recipe = findRecipeByResult(weaponChar);
  if (!recipe) return null;
  return { weaponChar, recipe };
}
