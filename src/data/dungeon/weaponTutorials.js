import { findRecipeByResult } from '../recipes.js';
import { ITEMS, ITEM_TYPES } from '../items.js';

/**
 * Look up a puzzle-room pedestal's weapon tutorial by the character authored
 * directly on the marker (a puzzle template's `pedestal.weaponChar`, typed
 * freely in the dungeon editor's Pedestal tool — not chosen from a fixed
 * list). The item must exist in ITEMS as a WEAPON — that is what the
 * pedestal grants — with one non-weapon exception: the Bomb Bag, which the
 * Bomb Trial teaches the same way the other Trials teach their weapon.
 *
 * The recipe pair the pedestal displays (grayed, decorative — see
 * DungeonFloorGenerator.js's generatePuzzleRoom pedestal handling and
 * HutInteriorOverlay.js's weaponPedestal render block) is looked up live
 * from recipes.js, the sole source of truth for ingredient pairings, so a
 * recipe rebalance (either ingredient swapped) can never silently desync
 * the pedestal's display from what the recipe actually requires. A weapon
 * with no recipe (found-only, e.g. the Whip since it stopped being
 * craftable) still stands on the pedestal — `recipe` is null and the flank
 * Slots render empty, rather than the whole pedestal vanishing because a
 * recipe was retired.
 *
 * Returns null only if weaponChar isn't a weapon (or the Bomb Bag) in ITEMS — the dungeon
 * editor's save-time validation (tools/dungeon-editor/main.js) checks the
 * same rule so an author catches this before it ever reaches runtime.
 */
export function pickWeaponTutorial(weaponChar) {
  if (!weaponChar) return null;
  const data = ITEMS[weaponChar];
  if (data?.type !== ITEM_TYPES.WEAPON && !data?.bombBag) return null;
  return { weaponChar, recipe: findRecipeByResult(weaponChar) };
}
