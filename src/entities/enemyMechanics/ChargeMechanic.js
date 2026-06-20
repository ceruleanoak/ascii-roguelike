// Boar charge: 4-state FSM (idle → windup → charging → stunned). Once the
// charge launches, direction is locked at windup completion. While in windup
// or charging, the standard melee state machine is forcibly held back to
// 'chase' so the boar isn't doing two attacks at once. No suspend signal —
// it overrides velocity/state in place.
//
// Goblin Chief bash also drives this state machine (tuned via data values),
// so all reads/writes go through `enemy.data.chargeMechanic`.

export const ChargeMechanic = {
  isEnabled(enemy) {
    return enemy.data.chargeMechanic?.enabled === true;
  },

  init(enemy) {
    const cfg = enemy.data.chargeMechanic;
    enemy.chargeTimer = cfg.initialDelay ?? 0.6;
    enemy.chargeWindupTimer = 0;
    enemy.chargeDurationTimer = 0;
    enemy.chargeDir = { x: 0, y: 0 };
    enemy.chargeState = 'idle';
    enemy.chargeStunTimer = 0;
    enemy.chargeHasHit = false;
  },

  update(enemy, ctx) {
    const cfg = enemy.data.chargeMechanic;
    if (!cfg?.enabled) return;
    const { deltaTime, distance, effectiveVisionLength } = ctx;

    // Wet/goo block charging entirely — a soaked or slimed boar can't get
    // traction. Abort an in-progress windup/charge and pay the full cooldown.
    if ((enemy.isWet() || enemy.isGooey())
        && (enemy.chargeState === 'windup' || enemy.chargeState === 'charging')) {
      enemy.chargeState = 'idle';
      enemy.chargeTimer = cfg.cooldown;
    }

    if (enemy.chargeState === 'stunned') {
      enemy.chargeStunTimer -= deltaTime;
      enemy.targetVelocity.vx = 0;
      enemy.targetVelocity.vy = 0;
      enemy.velocity.vx = 0;
      enemy.velocity.vy = 0;
      if (enemy.chargeStunTimer <= 0) enemy.chargeState = 'idle';
    } else if (enemy.chargeState === 'windup') {
      enemy.chargeWindupTimer -= deltaTime;
      enemy.targetVelocity.vx = 0;
      enemy.targetVelocity.vy = 0;
      enemy.velocity.vx = 0;
      enemy.velocity.vy = 0;
      if (enemy.state === 'windup' || enemy.state === 'attack') {
        enemy.state = 'chase';
        enemy.windupTimer = 0;
      }
      if (enemy.chargeWindupTimer <= 0) {
        enemy.chargeState = 'charging';
        enemy.chargeDurationTimer = cfg.chargeDuration;
        enemy.chargeHasHit = false;
        const cdx = enemy.target.position.x - enemy.position.x;
        const cdy = enemy.target.position.y - enemy.position.y;
        const cdist = Math.sqrt(cdx * cdx + cdy * cdy) || 1;
        enemy.chargeDir = { x: cdx / cdist, y: cdy / cdist };
        // Burst directly to top speed — bypass the acceleration ramp so the
        // 0.5s charge actually covers ground rather than spending most of it
        // accelerating.
        enemy.velocity.vx = enemy.chargeDir.x * cfg.chargeSpeed;
        enemy.velocity.vy = enemy.chargeDir.y * cfg.chargeSpeed;
      }
    } else if (enemy.chargeState === 'charging') {
      enemy.chargeDurationTimer -= deltaTime;
      enemy.targetVelocity.vx = enemy.chargeDir.x * cfg.chargeSpeed;
      enemy.targetVelocity.vy = enemy.chargeDir.y * cfg.chargeSpeed;
      if (enemy.state === 'windup' || enemy.state === 'attack') {
        enemy.state = 'chase';
        enemy.windupTimer = 0;
      }
      if (enemy.chargeDurationTimer <= 0) {
        enemy.chargeState = 'idle';
        enemy.chargeTimer = cfg.cooldown;
      }
    } else {
      // idle — count down to next charge whenever a target is engaged
      const engaged = enemy.state !== 'idle' || enemy.aggroMemoryActive || enemy.enraged;
      if (engaged) enemy.chargeTimer -= deltaTime;
      if (enemy.chargeTimer <= 0
          && distance < cfg.chargeRange
          && enemy.target
          && !enemy.isStunned()
          && !enemy.isFrozen()
          && !enemy.isWet()
          && !enemy.isGooey()
          && enemy.hasVision(enemy.position, enemy.target.position, effectiveVisionLength, { ignoreCone: true })) {
        enemy.chargeState = 'windup';
        enemy.chargeWindupTimer = cfg.chargeWindup;
        if (enemy.state === 'windup') {
          enemy.state = 'chase';
          enemy.windupTimer = 0;
        }
      }
    }
  }
};
