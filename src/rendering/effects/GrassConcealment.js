import { GRID } from '../../game/GameConfig.js';
import { stepConcealmentAlpha } from '../../systems/WorldEffectsSystem.js';

/**
 * Grass concealment: which glyphs tall grass hides. Read by ExploreRenderer
 * for the player (Frame Pass `playerGlyph`, via its playerConcealAlpha
 * delegate), enemies, ingredients and items.
 */

function backgroundObjectsOf(game) {
  return game._activeBackgroundObjects
    ? game._activeBackgroundObjects()
    : (game.currentRoom?.backgroundObjects ?? []);
}

// Returns true if (x, y) sits inside a tall-grass cluster dense enough to
// act as cover. RoomGenerator emits two BackgroundObject instances per
// visual blade (6px apart, so each blade can straddle two grid cells), so
// we count raw '|' instances in the standing cell plus its 4 cardinal
// neighbours and require ≥ 6 — ~3 visual blades minimum. Same rule drives
// grassStealth detection and universal player/item/enemy concealment.
// `countBent` also counts blades bent to '/' '\' by something passing
// through — still standing, just leaning — so a hop doesn't thin its own cover.
export function isOnTallGrass(game, x, y, { countBent = false } = {}) {
  const cs = GRID.CELL_SIZE;
  const cx = Math.floor(x / cs);
  const cy = Math.floor(y / cs);
  let onCell = 0;
  let nearby = 0;
  for (const obj of backgroundObjectsOf(game)) {
    if (obj.destroyed) continue;
    const blade = obj.char === '|' || (countBent && isStandingBlade(obj));
    if (!blade) continue;
    const ox = Math.floor(obj.position.x / cs);
    const oy = Math.floor(obj.position.y / cs);
    const dx = Math.abs(ox - cx);
    const dy = Math.abs(oy - cy);
    if (dx === 0 && dy === 0) onCell++;
    if (dx + dy <= 1) nearby++;
  }
  return onCell > 0 && nearby >= 6;
}

// An uncut grass blade, upright '|' or bent '/' '\'. Cutting swaps a blade's
// data to its cut state, so cuttable-with-a-cutState means it still stands.
function isStandingBlade(obj) {
  return obj.data?.cuttable && obj.data?.cutState === ',';
}

// Surface tall-grass fade for the player glyph: fades rapidly in/out so
// stepping into cover doesn't pop the sprite. A frog (isSmall) hides by the
// same blade threshold, counting the blades its own hop has bent.
export function playerConcealAlpha(game) {
  const { player } = game;
  const hidden = isOnTallGrass(game, player.position.x, player.position.y,
    { countBent: player.isSmall === true });
  return stepConcealmentAlpha(player, !hidden);
}
