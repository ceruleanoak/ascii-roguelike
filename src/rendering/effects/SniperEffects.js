import { GRID } from '../../game/GameConfig.js';

// Sniper mini-boss render helpers, split out of ExploreRenderer.js to stay
// under its architecture budget — standalone functions taking `renderer`,
// matching the drawOffscreenEnemyIndicators pattern (rendering/ui/).

// Concealment alpha during the 'hiding' telegraph (the countdown BEFORE
// sniperHidden flips true and SniperMechanic._updateHidden starts moving it).
// Fades out gradually across the countdown instead of standing fully solid
// then popping invisible on the frame it completes — that abrupt pop is what
// read as the Sniper "disappearing too soon" with no warning. Called from
// ExploreRenderer.renderEnemy, which handles the post-vanish (sniperHidden)
// and grass-concealment alpha itself via the shared stepConcealmentAlpha path.
export function sniperHidingConcealAlpha(enemy) {
  const hideDelay = enemy.data?.sniperMechanic?.hideDelay ?? 0.5;
  return hideDelay > 0 ? Math.max(0, Math.min(1, enemy.sniperTimer / hideDelay)) : 1;
}

// '!' telegraph/dagger-windup indicator, drawn in the normal enemy pass (above
// the Sniper itself, not the player, so z-order relative to the player doesn't matter).
export function drawSniperIndicators(renderer, enemy) {
  if (enemy.sniperIndicator) {
    renderer.drawEntity(
      enemy.position.x + GRID.CELL_SIZE / 2,
      enemy.position.y + GRID.CELL_SIZE / 2 + enemy.sniperIndicator.offsetY,
      enemy.sniperIndicator.char,
      enemy.sniperIndicator.color
    );
  }
}

// Reticule (tracks the player while aiming) + a low-opacity aim line back to the
// Sniper. Called AFTER the player draws (see ExploreRenderer's post-player pass,
// same slot as drawSappingEnemies) — the reticule sits on/near the player's own
// position, and the enemy pass it used to draw in runs before the player, so it
// was rendering behind the player sprite and was hard to see.
export function drawSniperReticules(renderer, enemies) {
  for (const enemy of enemies) {
    if (enemy.sniperState !== 'aiming' || !enemy.sniperReticulePos) continue;
    const ex = enemy.position.x + GRID.CELL_SIZE / 2;
    const ey = enemy.position.y + GRID.CELL_SIZE / 2;
    const rx = enemy.sniperReticulePos.x + GRID.CELL_SIZE / 2;
    const ry = enemy.sniperReticulePos.y + GRID.CELL_SIZE / 2;
    renderer.drawLine(ex, ey, rx, ry, '#ff555533');
    renderer.drawEntity(rx, ry, '+', '#ff5555');
  }
}

// Sniper's fired shot: instant red line that fades over its life window.
// Uses ctx.globalAlpha (auto-quantized to 10% steps by installRetroAlphaQuantization)
// rather than a hex alpha suffix, so the fade bands instead of smoothly blending.
export function drawSniperBeams(renderer, game) {
  if (!game.sniperBeams?.length) return;
  const ctx = renderer.fgCtx;
  const now = Date.now();
  for (const beam of game.sniperBeams) {
    const t = 1 - Math.min(1, (now - beam.createdAt) / beam.life);
    if (t <= 0) continue;
    ctx.save();
    ctx.globalAlpha = t;
    ctx.strokeStyle = '#ff2222';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(beam.from.x, beam.from.y);
    ctx.lineTo(beam.to.x, beam.to.y);
    ctx.stroke();
    ctx.restore();
  }
}
