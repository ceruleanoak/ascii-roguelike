/**
 * OffscreenEnemyIndicators - Edge-of-screen '^' pointers toward enemies
 * hidden by CameraZoomSystem's clipping when zoomed in.
 *
 * When zoomed (CameraZoomSystem scale > 1), the CSS transform crops the
 * canvas to a sub-region around the player, so enemies outside that region
 * simply aren't drawn. This draws a small rotated glyph, inset from the
 * screen border, pointing toward each such enemy — on the zoom-exempt UI
 * layer so the indicator itself stays fixed at the border rather than
 * scaling/drifting with the zoom transform.
 */

import { GRID, COLORS } from '../../game/GameConfig.js';

const INSET = 10;

export function drawOffscreenEnemyIndicators(renderer, game, enemies) {
  const scale = game.cameraZoomSystem.getScale();
  if (scale <= 1) return;

  const origin = game.cameraZoomSystem.getOriginPercent();
  const ox = (origin.x / 100) * GRID.WIDTH;
  const oy = (origin.y / 100) * GRID.HEIGHT;

  const minB = INSET;
  const maxB = GRID.WIDTH - INSET;

  for (const enemy of enemies) {
    if (enemy.hp !== undefined && enemy.hp <= 0) continue;
    if (enemy.sapping || enemy.isBossEntity) continue;

    // Don't spoil enemies the surface render is actively concealing: fully
    // faded into tall grass (renderEnemy sets _concealmentAlpha before this
    // runs), shell-camouflaged turtles disguised as a rock, or a mimic still
    // disguised as an item. The arrow should only ever point at threats the
    // player could otherwise perceive as enemies.
    if (enemy._concealmentAlpha !== undefined && enemy._concealmentAlpha < 0.005) continue;
    if (enemy.data?.shellCamouflage && enemy.inShellForm) continue;
    if (enemy.data?.mimicMechanic?.enabled && !enemy.mimicRevealed) continue;

    const ex = enemy.position.x + (enemy.width ?? GRID.CELL_SIZE) / 2;
    const ey = enemy.position.y + (enemy.height ?? GRID.CELL_SIZE) / 2;
    const dx = ex - ox;
    const dy = ey - oy;
    if (dx === 0 && dy === 0) continue;

    // Enemy's screen-space position under the current zoom transform.
    // Skip it if that position already falls within the visible viewport.
    const screenX = ox + dx * scale;
    const screenY = oy + dy * scale;
    if (screenX >= 0 && screenX <= GRID.WIDTH && screenY >= 0 && screenY <= GRID.HEIGHT) continue;

    const edge = rayToInsetBoxEdge(ox, oy, dx, dy, minB, minB, maxB, maxB);
    const angle = Math.atan2(dx, -dy);
    renderer.drawUIEntityRotated(edge.x, edge.y, '^', COLORS.ENEMY, angle);
  }
}

// Casts a ray from (px,py) in direction (dx,dy) and returns where it
// crosses the given axis-aligned box's boundary.
function rayToInsetBoxEdge(px, py, dx, dy, minX, minY, maxX, maxY) {
  let tBest = Infinity;
  if (dx > 0) {
    const t = (maxX - px) / dx;
    const y = py + t * dy;
    if (t > 0 && y >= minY && y <= maxY) tBest = Math.min(tBest, t);
  } else if (dx < 0) {
    const t = (minX - px) / dx;
    const y = py + t * dy;
    if (t > 0 && y >= minY && y <= maxY) tBest = Math.min(tBest, t);
  }
  if (dy > 0) {
    const t = (maxY - py) / dy;
    const x = px + t * dx;
    if (t > 0 && x >= minX && x <= maxX) tBest = Math.min(tBest, t);
  } else if (dy < 0) {
    const t = (minY - py) / dy;
    const x = px + t * dx;
    if (t > 0 && x >= minX && x <= maxX) tBest = Math.min(tBest, t);
  }
  if (!isFinite(tBest)) {
    return {
      x: Math.min(maxX, Math.max(minX, px)),
      y: Math.min(maxY, Math.max(minY, py))
    };
  }
  return { x: px + tBest * dx, y: py + tBest * dy };
}
