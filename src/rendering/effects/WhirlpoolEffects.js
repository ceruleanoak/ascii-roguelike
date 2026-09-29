import { GRID } from '../../game/GameConfig.js';

// The Quagmire Whirlpool (AquiferSystem): once the rounds clear, its Pond tile
// darkens and a spiral turns on it — the only tell that the water here now
// goes somewhere. Drawn on the foreground each frame for the spin; the plain
// '~' foreground water pass skips the tile while it is active.
//
// Surface only: the Whirlpool is a plane-0 tile of an EXPLORE room, never an
// interior floor, and on plane 1 the player is already in the current below.

const WHIRLPOOL_GLYPH = '꩜';
const WHIRLPOOL_COLOR = '#66ccff';
const WHIRLPOOL_WATER = '#0a3050';
// Radians per second; negative spins counter-clockwise.
const SPIN_RATE = -4;

export function drawWhirlpool(renderer, game) {
  const whirlpool = game.currentRoom?.whirlpool;
  if (!whirlpool?.whirlpoolActive || game.player?.plane !== 0) return;
  const C = GRID.CELL_SIZE;
  const { x, y } = whirlpool.position;
  renderer.fgCtx.fillStyle = WHIRLPOOL_WATER;
  renderer.fgCtx.fillRect(x, y, C, C);
  const angle = (performance.now() / 1000) * SPIN_RATE;
  renderer.drawEntityRotated(x + C / 2, y + C / 2, WHIRLPOOL_GLYPH, WHIRLPOOL_COLOR, angle);
}
