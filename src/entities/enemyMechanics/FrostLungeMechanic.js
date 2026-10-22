import { inSamePlane } from '../../systems/PlaneSystem.js';

// Frost Lunge (Ice Wraith): windup → frost line → lunge → latch.
//
// The Wraith's sap latch only fires from inside attackRange, and at its float
// speed it never got there — a walking player simply outpaced it. The lunge is
// how it closes: it holds still and telegraphs, looses a Frost Line straight
// at the player (one freeze pip on a hit, so the target is slowed), then
// rushes them far faster than it can drift. Reaching attackRange mid-lunge
// latches immediately through the ordinary sap path (Enemy.createSapAttack);
// running out of lunge time just ends it.
//
// Called once per Enemy.update, after the sap block (a latched Wraith never
// gets here) and before the State spine: while winding up or lunging it
// returns a suspend payload so no other AI writes velocity that frame. Every
// AI override that returns earlier in update (stun, freeze, zap, sleep,
// knockback) calls interrupt() so a frozen lunge doesn't resume afterwards.

function stop(enemy) {
  enemy.velocity.vx = 0;
  enemy.velocity.vy = 0;
  enemy.targetVelocity.vx = 0;
  enemy.targetVelocity.vy = 0;
}

// Same capacity rule as the sap Strike (Enemy.canAttack): three latched
// sappers fill the target.
function canLatch(enemy) {
  return !enemy.sapping && (enemy.target?.activeSappingBats?.length ?? 0) < 3;
}

// A Frost Line glyph for the shot's heading — a streak, not an arrowhead.
function lineCharForAngle(angle) {
  const a = ((angle % Math.PI) + Math.PI) % Math.PI; // direction-agnostic, 0..π
  if (a < Math.PI / 8 || a >= Math.PI * 7 / 8) return '—';
  if (a < Math.PI * 3 / 8) return '\\';
  if (a < Math.PI * 5 / 8) return '|';
  return '/';
}

function frostLine(enemy, cfg) {
  const target = enemy.target.position;
  const angle = Math.atan2(target.y - enemy.position.y, target.x - enemy.position.x)
    + enemy._dizzyAngleOffset();
  return {
    type: 'enemy_projectile',
    char: lineCharForAngle(angle),
    position: {
      x: enemy.position.x + enemy.width / 2,
      y: enemy.position.y + enemy.height / 2
    },
    velocity: {
      vx: Math.cos(angle) * cfg.lineSpeed,
      vy: Math.sin(angle) * cfg.lineSpeed
    },
    damage: enemy.getEffectiveDamage(),
    color: enemy.color,
    // Freeze-immune players take nothing (PlayerDamageSystem); everyone else
    // gains one freeze pip (CombatSystem's statusOnHit).
    onHit: 'freeze',
    statusOnHit: 'freeze',
    owner: enemy,
    shooterPlane: enemy.plane
  };
}

export const FrostLungeMechanic = {
  isEnabled(enemy) {
    return enemy.data.frostLunge?.enabled === true;
  },

  init(enemy) {
    const cfg = enemy.data.frostLunge;
    enemy.frostLungePhase = 'idle'; // 'idle' | 'windup' | 'lunge'
    enemy.frostLungeTimer = 0;
    enemy.frostLungeCooldown = cfg.initialDelay ?? cfg.cooldown;
  },

  update(enemy, ctx) {
    const cfg = enemy.data.frostLunge;
    if (!cfg?.enabled) return;
    const { deltaTime, distance, effectiveVisionLength, onScreen, dotDamageEvents } = ctx;
    const hold = { suspend: true, result: { dotDamage: dotDamageEvents } };

    if (enemy.frostLungePhase === 'windup') {
      // Same rule as every committed windup: no completing it unseen.
      if (!onScreen || !enemy.target) { this.interrupt(enemy); return; }
      stop(enemy);
      enemy.frostLungeTimer -= deltaTime;
      if (enemy.frostLungeTimer > 0) return hold;
      enemy.frostLungePhase = 'lunge';
      enemy.frostLungeTimer = cfg.lungeTime;
      return { suspend: true, result: { dotDamage: dotDamageEvents, itemAttack: frostLine(enemy, cfg) } };
    }

    if (enemy.frostLungePhase === 'lunge') {
      enemy.frostLungeTimer -= deltaTime;
      if (!onScreen || !enemy.target || enemy.frostLungeTimer <= 0) { this.interrupt(enemy); return; }
      if (distance <= enemy.attackRange && canLatch(enemy) && inSamePlane(enemy, enemy.target)) {
        stop(enemy);
        enemy.createSapAttack();
        this.interrupt(enemy);
        return hold;
      }
      // Homes on the player for the whole lunge; a dizzy Wraith veers like
      // every other dizzy attack.
      const angle = Math.atan2(enemy.target.position.y - enemy.position.y,
        enemy.target.position.x - enemy.position.x) + enemy._dizzyAngleOffset();
      enemy.velocity.vx = enemy.targetVelocity.vx = Math.cos(angle) * cfg.lungeSpeed;
      enemy.velocity.vy = enemy.targetVelocity.vy = Math.sin(angle) * cfg.lungeSpeed;
      return hold;
    }

    if (enemy.frostLungeCooldown > 0) {
      enemy.frostLungeCooldown -= deltaTime;
      return;
    }
    if (!onScreen || !enemy.target || !canLatch(enemy)) return;
    if (distance < cfg.triggerRangeMin || distance > cfg.triggerRangeMax) return;
    if (!inSamePlane(enemy, enemy.target)) return;
    // A Wraith that has been hit lunges from any facing; otherwise the player
    // must be inside its vision cone, so sneaking up on one still works.
    const ignoreCone = enemy.enraged || enemy.aggroMemoryActive;
    if (!enemy.hasVision(enemy.position, enemy.target.position, effectiveVisionLength, { ignoreCone })) return;
    enemy.frostLungePhase = 'windup';
    enemy.frostLungeTimer = cfg.windupTime;
    stop(enemy);
    return hold;
  },

  /** End a windup or lunge and pay the cooldown. No-op when idle. */
  interrupt(enemy) {
    const cfg = enemy.data?.frostLunge;
    if (!cfg?.enabled || enemy.frostLungePhase === 'idle') return;
    enemy.frostLungePhase = 'idle';
    enemy.frostLungeTimer = 0;
    enemy.frostLungeCooldown = cfg.cooldown;
  }
};
