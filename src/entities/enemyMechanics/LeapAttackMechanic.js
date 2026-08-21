import { GRID } from '../../game/GameConfig.js';
import { inSamePlane } from '../../systems/PlaneSystem.js';

// Giant Slime leap: 3-phase sequence (windup → airborne → cooldown). Airborne
// lerps from a snapshot start to a target snapshot taken at windup completion.
// Both windup AND airborne fully suspend Enemy.update() — no other AI runs.
//
// Two call sites in Enemy.update():
//   - updateActive(): early, before status overrides. Handles windup hold and
//     the airborne arc; returns suspend payload while in either phase.
//   - tryTrigger(): after distance calc. If conditions are met (cooldown ready,
//     not spewing, in leap-trigger range, same plane), starts the windup and
//     returns a suspend signal.

export const LeapAttackMechanic = {
  isEnabled(enemy) {
    return enemy.data.leapAttack?.enabled === true;
  },

  init(enemy) {
    enemy.leapCooldown = 2.0; // brief grace at spawn
    enemy.leapWindupActive = false;
    enemy.leapWindupTimer = 0;
    enemy.leapAirborneActive = false;
    enemy.leapAirTimer = 0;
    enemy.leapAirDuration = 0;
    enemy.leapStartX = 0;
    enemy.leapStartY = 0;
    enemy.leapTargetX = 0;
    enemy.leapTargetY = 0;
    enemy.leapArcLift = 0;
  },

  // Early-phase update: cooldown tick + windup/airborne handling.
  updateActive(enemy, ctx) {
    const cfg = enemy.data.leapAttack;
    if (!cfg?.enabled) return;
    const { deltaTime, dotDamageEvents } = ctx;

    if (enemy.leapCooldown > 0) {
      enemy.leapCooldown = Math.max(0, enemy.leapCooldown - deltaTime);
    }

    if (enemy.leapAirborneActive) {
      enemy.leapAirTimer -= deltaTime;
      const dur = enemy.leapAirDuration || cfg.airTime || 0.5;
      const t = Math.min(1, 1 - enemy.leapAirTimer / dur);
      enemy.position.x = enemy.leapStartX + (enemy.leapTargetX - enemy.leapStartX) * t;
      enemy.position.y = enemy.leapStartY + (enemy.leapTargetY - enemy.leapStartY) * t;
      enemy.leapArcLift = Math.sin(t * Math.PI) * (cfg.arcLift || GRID.CELL_SIZE * 1.5);
      enemy.velocity.vx = 0;
      enemy.velocity.vy = 0;
      if (enemy.targetVelocity) { enemy.targetVelocity.vx = 0; enemy.targetVelocity.vy = 0; }
      if (enemy.leapAirTimer <= 0) {
        enemy.leapAirborneActive = false;
        enemy.leapArcLift = 0;
        enemy.position.x = enemy.leapTargetX;
        enemy.position.y = enemy.leapTargetY;
        enemy.leapCooldown = cfg.cooldown;
        return {
          suspend: true,
          result: {
            dotDamage: dotDamageEvents,
            shouldLeapLand: true,
            leapLandData: {
              x: enemy.leapTargetX + GRID.CELL_SIZE / 2,
              y: enemy.leapTargetY + GRID.CELL_SIZE / 2,
              cfg,
              plane: enemy.plane ?? 0
            }
          }
        };
      }
      return { suspend: true, result: { dotDamage: dotDamageEvents } };
    }

    if (enemy.leapWindupActive) {
      // Lost visibility mid-windup — cancel rather than let the leap fire
      // unseen. Free retry (no cooldown charge), same idiom as an aborted
      // Strike windup: nothing was actually spent.
      if (!ctx.onScreen) {
        enemy.leapWindupActive = false;
        enemy.leapWindupTimer = 0;
        return { suspend: true, result: { dotDamage: dotDamageEvents } };
      }
      enemy.leapWindupTimer -= deltaTime;
      enemy.velocity.vx = 0;
      enemy.velocity.vy = 0;
      if (enemy.targetVelocity) { enemy.targetVelocity.vx = 0; enemy.targetVelocity.vy = 0; }
      if (enemy.leapWindupTimer <= 0) {
        enemy.leapWindupActive = false;
        enemy.leapStartX = enemy.position.x;
        enemy.leapStartY = enemy.position.y;
        enemy.leapAirDuration = cfg.airTime;
        enemy.leapAirTimer = enemy.leapAirDuration;
        enemy.leapAirborneActive = true;
        enemy.game?.audioSystem?.playSFX?.('slime_jump');
      }
      return { suspend: true, result: { dotDamage: dotDamageEvents } };
    }
  },

  // Mid-phase trigger: check if conditions are met to start a new leap.
  tryTrigger(enemy, ctx) {
    const cfg = enemy.data.leapAttack;
    if (!cfg?.enabled) return;
    if (enemy.spewWindupActive) return;
    if (enemy.leapCooldown > 0) return;
    if (!inSamePlane(enemy, enemy.target)) return;
    if (!ctx.onScreen) return; // no ambushing from outside the zoomed frame

    const { effectiveDistance, dotDamageEvents } = ctx;
    if (effectiveDistance >= cfg.triggerRangeMin && effectiveDistance <= cfg.triggerRangeMax) {
      // Windup scales down with lost HP — full HP leaps at cfg.windupTime,
      // 0 HP leaps at half that, linear in between. Makes the boss leap
      // noticeably more often as it's worn down instead of at a flat cadence.
      const hpFraction = enemy.maxHp > 0 ? Math.max(0, Math.min(1, enemy.hp / enemy.maxHp)) : 1;
      enemy.leapWindupActive = true;
      enemy.leapWindupTimer = cfg.windupTime * (0.5 + 0.5 * hpFraction);
      enemy.leapTargetX = enemy.target.position.x;
      enemy.leapTargetY = enemy.target.position.y;
      enemy.velocity.vx = 0;
      enemy.velocity.vy = 0;
      if (enemy.targetVelocity) { enemy.targetVelocity.vx = 0; enemy.targetVelocity.vy = 0; }
      return { suspend: true, result: { dotDamage: dotDamageEvents } };
    }
  }
};
