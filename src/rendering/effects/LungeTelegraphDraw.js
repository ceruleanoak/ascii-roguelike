import { GRID, PHYSICS } from '../../game/GameConfig.js';

// The line an Enemy draws across the ground it is about to cross, during the
// windup of a charge (ChargeMechanic) or a leap (LeapAttackMechanic). Standalone
// functions taking `renderer`, called from ExploreRenderer.renderEnemy.
//
// The line is the tell only: it fades in across the windup and is gone the
// instant the dash or the leap begins, the same rule a Telegraph Animation
// keeps (the tell never shares the screen with the strike it warned about).

const LINE_COLOR = '#ff5533';

// Alpha byte for windup progress t (0 → 1): dim at the start, bright at launch.
function windupAlpha(t) {
  const clamped = Math.max(0, Math.min(1, t));
  return Math.floor(60 + 180 * clamped).toString(16).padStart(2, '0');
}

function drawWindupLine(renderer, enemy, toX, toY, t) {
  const ex = enemy.position.x + GRID.CELL_SIZE / 2;
  const ey = enemy.position.y + GRID.CELL_SIZE / 2;
  renderer.drawLine(ex, ey, toX, toY, LINE_COLOR + windupAlpha(t));
}

// Charge windup: a line toward the target, as long as the dash will run.
// chargeDuration is double-seconds (enemy timer clock), and PhysicsSystem's
// friction damps the held chargeSpeed once per frame, so the dash moves at
// speed × FRICTION.
export function drawChargeTelegraph(renderer, enemy) {
  const cfg = enemy.data?.chargeMechanic;
  if (!cfg?.enabled || !enemy.target || enemy.chargeState !== 'windup') return;
  const dx = enemy.target.position.x - enemy.position.x;
  const dy = enemy.target.position.y - enemy.position.y;
  const dist = Math.hypot(dx, dy) || 1;
  const length = cfg.chargeSpeed * PHYSICS.FRICTION * cfg.chargeDuration / PHYSICS.ENEMY_TIMER_RATE;
  const ex = enemy.position.x + GRID.CELL_SIZE / 2;
  const ey = enemy.position.y + GRID.CELL_SIZE / 2;
  const t = 1 - enemy.chargeWindupTimer / cfg.chargeWindup;
  drawWindupLine(renderer, enemy, ex + dx / dist * length, ey + dy / dist * length, t);
}

// Leap windup: a line to the cell the leap is aimed at (leapTargetX/Y, set
// when the windup starts). A thief's leap re-aims at takeoff
// (LeapAttackMechanic), so the line shows the aim it holds while squatting.
export function drawLeapTelegraph(renderer, enemy) {
  if (!enemy.data?.leapAttack?.enabled || !enemy.leapWindupActive) return;
  const duration = enemy.leapWindupDuration || 1;
  const t = 1 - enemy.leapWindupTimer / duration;
  drawWindupLine(
    renderer, enemy,
    enemy.leapTargetX + GRID.CELL_SIZE / 2,
    enemy.leapTargetY + GRID.CELL_SIZE / 2,
    t
  );
}
