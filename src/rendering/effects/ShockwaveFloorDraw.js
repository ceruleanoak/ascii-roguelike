/**
 * Shockwave floor glow — the floor under an expanding shockwave ring lights
 * dark gray as the ring passes, so the ring reads even across open floor.
 * Without it a ring is seen only through the background objects it shakes,
 * and an empty room or dungeon floor shows nothing at all.
 *
 * Both ring kinds light the floor: the player's (game.playerShockwave — a
 * hammer's shockwave, a Pearl or Sunken Ship ripple) and the enemies'
 * (game.enemyShockwaves — a Slime's leap landing, a Bomb's detonation).
 *
 * Drawn as the first ground Frame Pass, under puddles, loot and everyone
 * standing on the floor. Cells holding a background object or a wall stay
 * unlit: they draw on the cached background canvas underneath this one, so
 * a fill there would cover the glyph the ring is shaking.
 */
import { GRID } from '../../game/GameConfig.js';
import { planeOf } from '../../systems/PlaneSystem.js';

const FLOOR_GLOW_COLOR = '#2a2a2a';
// The lit band trails the ring's edge by this many cells.
const FLOOR_GLOW_BAND = 1;

// Every ring on the player's plane, as { x, y, radius, maxRadius }.
function ringsOnPlayerPlane(game) {
  const plane = planeOf(game.player);
  const rings = [];
  if (game.playerShockwave) rings.push(game.playerShockwave);
  for (const sw of game.enemyShockwaves ?? []) {
    if ((sw.plane ?? 0) === plane) rings.push(sw);
  }
  return rings;
}

export function drawShockwaveFloor(renderer, game) {
  const rings = ringsOnPlayerPlane(game);
  if (rings.length === 0) return;

  const C = GRID.CELL_SIZE;
  const { cols, rows, collisionMap } = game.activeGridBounds();
  const occupied = new Set();
  for (const obj of game._activeBackgroundObjects() ?? []) {
    if (obj.destroyed) continue;
    occupied.add(Math.floor(obj.position.y / C) * cols + Math.floor(obj.position.x / C));
  }

  const ctx = renderer.fgCtx;
  ctx.save();
  ctx.fillStyle = FLOOR_GLOW_COLOR;
  for (const ring of rings) {
    const outer = ring.radius;
    const inner = Math.max(0, outer - FLOOR_GLOW_BAND * C);
    if (outer <= 0) continue;
    // Fades as the ring spends its reach.
    ctx.globalAlpha = Math.max(0.3, 1 - outer / (ring.maxRadius || outer));
    const minCol = Math.max(0, Math.floor((ring.x - outer) / C));
    const maxCol = Math.min(cols - 1, Math.floor((ring.x + outer) / C));
    const minRow = Math.max(0, Math.floor((ring.y - outer) / C));
    const maxRow = Math.min(rows - 1, Math.floor((ring.y + outer) / C));
    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        const d = Math.hypot(col * C + C / 2 - ring.x, row * C + C / 2 - ring.y);
        if (d <= inner || d > outer) continue;
        if (collisionMap?.[row]?.[col]) continue;
        if (occupied.has(row * cols + col)) continue;
        ctx.fillRect(col * C, row * C, C, C);
      }
    }
  }
  ctx.restore();
}
