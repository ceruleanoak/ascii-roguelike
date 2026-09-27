/**
 * Nearest-enemy aim — a projectile flagged `aimsAtNearestEnemy` leaves on the
 * exact angle to the nearest live enemy on its plane, instead of the way the
 * shooter faces. Aim is fixed at launch (not homing): a target that moves
 * after the shot can still step out of the line.
 *
 * Used by: Keen Slingshot. CombatSystem.addAttack calls this once per bullet,
 * with the active-layer enemy list.
 */

import { GRID } from '../game/GameConfig.js';
import { planeOf } from './PlaneSystem.js';

export function aimAtNearestEnemy(proj, enemies) {
  // Only enemies the stone can actually reach count as "nearest"; with none
  // in range the shot keeps its facing direction.
  const range = proj.remainingDistance ?? Infinity;
  let target = null;
  let bestDist = range;
  for (const enemy of enemies) {
    if (!(enemy.hp > 0) || planeOf(enemy) !== proj.plane) continue;
    const dx = enemy.position.x + (enemy.width || GRID.CELL_SIZE) / 2 - proj.position.x;
    const dy = enemy.position.y + (enemy.height || GRID.CELL_SIZE) / 2 - proj.position.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= bestDist) {
      bestDist = dist;
      target = { dx, dy };
    }
  }
  if (!target) return;

  const speed = Math.hypot(proj.velocity.vx, proj.velocity.vy);
  const angle = Math.atan2(target.dy, target.dx);
  proj.velocity.vx = Math.cos(angle) * speed;
  proj.velocity.vy = Math.sin(angle) * speed;
  proj.drawAngle = angle;
}
