/**
 * Keen aim — an attack flagged `keenAim` goes toward the nearest live enemy
 * on its plane, instead of the way the attacker faces. Aim is fixed at the
 * moment it is taken (not homing): a target that moves afterwards can still
 * step out of the line.
 *
 * Projectiles (Keen Slingshot, Pearl Slingshot): CombatSystem.addAttack aims
 * once per bullet at launch, and CombatSystem's ricochet branch aims again
 * after each wall bounce — both with the active-layer enemy list.
 *
 * Melee (Keen Dagger, Pearl Dagger): updateKeenStrike turns the player's
 * facing toward the nearest enemy within `keenAimCells` while the windup is
 * active, so the swing (which reads facing) lands on it. The dagger-roll
 * auto-stab, which skips windup, aims through aimFacingAtNearestEnemy directly.
 */

import { GRID } from '../game/GameConfig.js';
import { planeOf } from './PlaneSystem.js';

// Nearest live enemy on `plane` within `maxDist` of (x, y), as the offset
// from (x, y) to its center — or null when none is in reach.
function findNearestEnemy(x, y, plane, enemies, maxDist) {
  let target = null;
  let bestDist = maxDist;
  for (const enemy of enemies) {
    if (!(enemy.hp > 0) || planeOf(enemy) !== plane) continue;
    const dx = enemy.position.x + (enemy.width || GRID.CELL_SIZE) / 2 - x;
    const dy = enemy.position.y + (enemy.height || GRID.CELL_SIZE) / 2 - y;
    const dist = Math.hypot(dx, dy);
    if (dist <= bestDist) {
      bestDist = dist;
      target = { dx, dy };
    }
  }
  return target;
}

export function applyKeenAim(proj, enemies) {
  // Only enemies the stone can actually reach count as "nearest"; with none
  // in range the shot keeps its facing direction.
  const range = proj.remainingDistance ?? Infinity;
  const target = findNearestEnemy(proj.position.x, proj.position.y, proj.plane, enemies, range);
  if (!target) return;

  const speed = Math.hypot(proj.velocity.vx, proj.velocity.vy);
  const angle = Math.atan2(target.dy, target.dx);
  proj.velocity.vx = Math.cos(angle) * speed;
  proj.velocity.vy = Math.sin(angle) * speed;
  proj.drawAngle = angle;
}

// Turn the player to face the nearest enemy within maxDist; with none in
// reach, facing is left as the player set it.
export function aimFacingAtNearestEnemy(player, enemies, maxDist) {
  const cx = player.position.x + (player.width || GRID.CELL_SIZE) / 2;
  const cy = player.position.y + (player.height || GRID.CELL_SIZE) / 2;
  const target = findNearestEnemy(cx, cy, planeOf(player), enemies, maxDist);
  if (!target) return;
  const dist = Math.hypot(target.dx, target.dy);
  if (dist === 0) return;
  player.facing.x = target.dx / dist;
  player.facing.y = target.dy / dist;
}

// Reach of a keen melee weapon, in pixels.
export function keenStrikeReach(item) {
  return (item.data.keenAimCells ?? 2) * GRID.CELL_SIZE;
}

// Per-frame: while a keen melee weapon winds up, keep its facing on the
// nearest enemy so movement input during the windup can't pull it off.
export function updateKeenStrike(player, enemies) {
  const item = player.heldItem;
  if (!item?.data?.keenAim || !item.windupActive || item.data.firesBullet) return;
  aimFacingAtNearestEnemy(player, enemies, keenStrikeReach(item));
}
