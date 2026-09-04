import { GRID } from '../../game/GameConfig.js';

/**
 * Render an enlarged Ice Golem at 2.5× cell size.
 */
export function renderIceGolem(renderer, enemy, displayColor, shakeX, shakeY, drawMethod) {
  renderer.fgCtx.save();
  renderer.fgCtx.font = `${Math.round(GRID.CELL_SIZE * 2.5)}px 'Unifont', monospace`;
  renderer[drawMethod](
    enemy.position.x + GRID.CELL_SIZE / 2 + shakeX,
    enemy.position.y + GRID.CELL_SIZE / 2 + shakeY,
    enemy.char,
    displayColor
  );
  renderer.fgCtx.restore();
}

/**
 * Render a small enemy hidden under deep snow as a subtle pulsing cyan bump.
 * Returns true if rendered (caller should skip normal enemy rendering).
 */
export function renderSmallEnemyUnderSnow(renderer, enemy) {
  const t = Date.now() / 1000;
  const bumpPhase = Math.sin(t * 3 + enemy.position.x * 0.1) * 0.5 + 0.5;
  const bumpAlpha = 0.35 + bumpPhase * 0.3;
  renderer.fgCtx.save();
  renderer.fgCtx.globalAlpha = bumpAlpha;
  renderer.drawEntity(
    enemy.position.x + GRID.CELL_SIZE / 2,
    enemy.position.y + GRID.CELL_SIZE * 0.7,
    '·',
    '#aaeeff'
  );
  renderer.fgCtx.restore();
  return true;
}

/**
 * Render Yeti frenzy visual: red pip above head while frenzy active.
 */
export function renderYetiFrenzyPip(renderer, enemy) {
  const frenzyPipAlpha = 0.6 + 0.4 * Math.sin(Date.now() / 150);
  renderer.fgCtx.save();
  renderer.fgCtx.globalAlpha = frenzyPipAlpha;
  renderer.drawEntity(
    enemy.position.x + GRID.CELL_SIZE / 2,
    enemy.position.y - GRID.CELL_SIZE * 0.3,
    '●',
    '#ff0000'
  );
  renderer.fgCtx.restore();
}

/**
 * Render deep snow background objects as filled white (or compacted cyan) tiles.
 * Call from the background render loop for each snow object.
 */
export function renderSnowBackground(ctx, obj) {
  ctx.fillStyle = obj.compacted ? '#ccffff' : '#ffffff';
  ctx.fillRect(obj.position.x, obj.position.y, GRID.CELL_SIZE, GRID.CELL_SIZE);
}
