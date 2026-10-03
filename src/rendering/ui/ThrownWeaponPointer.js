/**
 * ThrownWeaponPointer - nudges a player who threw away their last weapon.
 *
 * While `game.thrownLastWeapon` is set (TrapSystem raises it on the throw and
 * clears it once the loadout holds a weapon again):
 * - a weapon still in reach (in flight, or lying on the floor) gets an
 *   animated dotted line from the player to it, encouraging the pickup;
 * - with no weapon in reach, the REST label reads CRAFT (ExploreRenderer) and
 *   a blinking arrow beside the player points at the south exit.
 *
 * Surface only: like the facing indicator, it is skipped while the player is
 * inside an Interior, so the PiP overlay has no matching pass.
 */

import { GRID } from '../../game/GameConfig.js';
import { inSamePlane, lootOnSurface, isInteriorActive } from '../../systems/PlaneSystem.js';

const LINE_COLOR = '#888888';
const DASH = [2, 4];
const DASH_SPEED = 12;            // px/s the dashes march toward the weapon
const ARROW_OFFSET = GRID.CELL_SIZE * 1.4;
const ARROW_BLINK_MS = 500;

/** True while the pointer should show — surface only (see header). */
export function thrownWeaponPointerActive(game) {
  return !!game.thrownLastWeapon && !isInteriorActive(game);
}

/** Pixel center of the closest reachable weapon, in flight or on the floor, or null. */
export function nearestThrownWeaponTarget(game) {
  const player = game.player;
  const C = GRID.CELL_SIZE;
  const px = player.position.x + C / 2;
  const py = player.position.y + C / 2;
  let best = null;
  let bestD2 = Infinity;
  const consider = (x, y) => {
    const d2 = (x - px) ** 2 + (y - py) ** 2;
    if (d2 < bestD2) { bestD2 = d2; best = { x, y }; }
  };
  for (const t of game.inFlightTraps || []) {
    if (t.kind === 'weapon' && !t.interior && (t.plane ?? 0) === (player.plane ?? 0)) consider(t.x, t.y);
  }
  for (const item of game.items || []) {
    if (item.data?.type !== 'WEAPON' || !lootOnSurface(item) || !inSamePlane(player, item)) continue;
    consider(item.position.x + C / 2, item.position.y + C / 2);
  }
  return best;
}

/** Marching dotted line from the player to `target`. */
export function drawThrownWeaponLine(renderer, game, target) {
  const ctx = renderer.fgCtx;
  const C = GRID.CELL_SIZE;
  const px = game.player.position.x + C / 2;
  const py = game.player.position.y + C / 2;
  const dist = Math.hypot(target.x - px, target.y - py);
  if (dist < C) return;
  // Start and stop a little short of both glyphs so the line never overdraws them.
  const ux = (target.x - px) / dist;
  const uy = (target.y - py) / dist;
  const inset = C * 0.6;
  ctx.save();
  ctx.strokeStyle = LINE_COLOR;
  ctx.lineWidth = 1;
  ctx.setLineDash(DASH);
  ctx.lineDashOffset = -(performance.now() / 1000) * DASH_SPEED;
  ctx.beginPath();
  ctx.moveTo(px + ux * inset, py + uy * inset);
  ctx.lineTo(target.x - ux * inset, target.y - uy * inset);
  ctx.stroke();
  ctx.restore();
}

/** Blinking arrow beside the player, aimed at the south exit. */
export function drawCraftArrow(renderer, game) {
  if (Math.floor(performance.now() / ARROW_BLINK_MS) % 2 === 1) return;
  const C = GRID.CELL_SIZE;
  const px = game.player.position.x + C / 2;
  const py = game.player.position.y + C / 2;
  const exitX = Math.floor(GRID.COLS / 2) * C + C / 2;
  const exitY = (GRID.ROWS - 1) * C + C / 2;
  // Angle measured from straight up, matching the '^' glyph's rest orientation.
  const angle = Math.atan2(exitX - px, -(exitY - py));
  const cx = px + Math.sin(angle) * ARROW_OFFSET;
  const cy = py - Math.cos(angle) * ARROW_OFFSET;
  renderer.drawEntityRotated(cx, cy, '^', LINE_COLOR, angle);
}
