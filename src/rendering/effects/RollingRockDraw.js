import { GRID } from '../../game/GameConfig.js';

// RollingRockDraw — the rolling rocks of BoulderSystem: the red zone's
// rockfall and every rock a hammer has knocked loose. Each rock belongs to
// one space (a surface Room or a dungeon/hut floor) and draws only while that
// space holds the frame, in the space's own coordinates (the floor PiP
// translates the canvas before Frame Passes run).

const ROCK_COLOR = '#aa7744';
const ROLL_CHARS = ['O', 'o', '0', 'Q'];   // cycled to read as rolling

export function drawRollingRocks(renderer, game) {
  const bs = game.boulderSystem;
  if (!bs) return;
  const { cols, rows } = game.activeGridBounds();
  const cs = GRID.CELL_SIZE;
  for (const r of bs.activeRocks()) {
    // Not over the border ring: rockfall enters from it, and on the surface a
    // rock rolling out of the room should leave behind the wall, not over it.
    if (r.x <= cs || r.x >= (cols - 1) * cs || r.y <= cs || r.y >= (rows - 1) * cs) continue;
    renderer.drawEntity(r.x, r.y, ROLL_CHARS[r.animFrame], ROCK_COLOR);
  }
}
