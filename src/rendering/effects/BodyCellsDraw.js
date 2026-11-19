import { GRID } from '../../game/GameConfig.js';

// Body Cells (`data.bodyCells`): an Enemy whose body is N cells on a side
// draws its glyph N times as large, centered on the whole body, so the glyph
// covers the hitbox it is hit by. Keeps the jumper's hop lift.
export function renderBodyCellsEnemy(renderer, enemy, displayColor, shakeX, shakeY, drawMethod) {
  const ctx = renderer.fgCtx;
  ctx.save();
  ctx.font = `${GRID.CELL_SIZE * enemy.data.bodyCells}px 'Unifont', monospace`;
  renderer[drawMethod](
    enemy.position.x + enemy.width / 2 + shakeX,
    enemy.position.y + enemy.height / 2 + shakeY - (enemy.jumpArcLift || 0),
    enemy.displayChar,
    displayColor
  );
  ctx.restore();
}
