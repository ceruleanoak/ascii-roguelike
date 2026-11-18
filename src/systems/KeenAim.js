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
 *
 * The eye only finds what can be seen: a concealed enemy (isConcealedEnemy —
 * an Invisible one such as a hidden Sniper, one faded into tall grass, a
 * disguised mimic or shelled turtle) is never the nearest, so a keen weapon
 * can't spoil a disguise or point the player at something unseen.
 */

import { GRID } from '../game/GameConfig.js';
import { planeOf } from './PlaneSystem.js';
import { enemyNearestPoint } from './enemyHitTest.js';
import { isConcealedEnemy } from './enemyConcealment.js';

// Nearest live, unconcealed enemy on `plane` within `maxDist` of (x, y), as the offset
// from (x, y) to its center (for a shaped enemy, the nearest point of its
// art — enemyHitTest) — or null when none is in reach.
function findNearestEnemy(x, y, plane, enemies, maxDist) {
  let target = null;
  let bestDist = maxDist;
  for (const enemy of enemies) {
    if (!(enemy.hp > 0) || planeOf(enemy) !== plane || isConcealedEnemy(enemy)) continue;
    const p = enemyNearestPoint(enemy, x, y, 'center', bestDist);
    if (p.dist <= bestDist) {
      bestDist = p.dist;
      target = { dx: p.x - x, dy: p.y - y };
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

// The angle a weapon actually swings or fires at, from the angle its wielder
// wants. Facing is 8-way — the player's keys can only point in whole eighths
// (45°) — so a weapon in an enemy's hands snaps to the nearest eighth too,
// rather than tracking the player at an angle no player could answer with.
// A keen weapon is the exception: the eye is what frees aim from the eighths,
// for whoever holds it, so its angle passes through untouched.
const EIGHTH = Math.PI / 4;
export function weaponAimAngle(item, angle) {
  if (item?.data?.keenAim) return angle;
  return Math.round(angle / EIGHTH) * EIGHTH;
}

// How far an enemy's target sits off the nearest line its weapon can fire
// along, as the step the wielder would take to put it on that line. Only a bow
// asks the question: an arrow loosed at a snapped eighth misses anything not
// on it, while a swing's arc forgives the same error. A keen bow, or no bow,
// has nothing to line up — the step is null.
//
// Measured where the arrow really flies: it spawns at the wielder's centre,
// but its position is read as a box's top-left (hit test and draw alike), so
// it travels half a cell down-right of that centre (bug #578). The target
// side is the player's hitbox centre.
const FIRING_LINE_TOLERANCE = GRID.CELL_SIZE * 0.25;
const ARROW_PATH_OFFSET = GRID.CELL_SIZE / 2; // bug #578
export function firingLineStep(enemy, targetPos) {
  const item = enemy.equippedWeapon;
  if (item?.data?.weaponType !== 'BOW' || item.data.keenAim) return null;
  const dx = (targetPos.x + GRID.CELL_SIZE / 2) - (enemy.position.x + enemy.width / 2 + ARROW_PATH_OFFSET);
  const dy = (targetPos.y + GRID.CELL_SIZE / 2) - (enemy.position.y + enemy.height / 2 + ARROW_PATH_OFFSET);
  const angle = weaponAimAngle(item, Math.atan2(dy, dx));
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const along = dx * ux + dy * uy;
  return { x: dx - along * ux, y: dy - along * uy };
}

// True when the wielder can loose at the target: a bow's arrow would pass
// within reach of it. Anything that isn't a snapping bow is always on line.
export function onFiringLine(enemy, targetPos) {
  const step = firingLineStep(enemy, targetPos);
  return !step || Math.hypot(step.x, step.y) <= FIRING_LINE_TOLERANCE;
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
