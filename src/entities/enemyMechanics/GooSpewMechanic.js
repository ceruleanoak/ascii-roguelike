import { GRID } from '../../game/GameConfig.js';

// Giant Slime goo spew cone: damage accumulates via onDamaged() (called from
// takeDamage) until it crosses the threshold and triggers a windup; the windup
// ticks down here and emits a fan of blobs aimed at the target. Suspends
// Enemy.update() and hands the blob list back to the orchestrator so main.js
// can spawn them as projectiles.

export const GooSpewMechanic = {
  isEnabled(enemy) {
    return enemy.data.gooSpewCone?.enabled === true;
  },

  init(enemy) {
    enemy.spewDamageAccum = 0;
    enemy.spewWindupActive = false;
    enemy.spewWindupTimer = 0;
  },

  // takeDamage hook: accumulate damage toward the next spew windup.
  onDamaged(enemy, amount) {
    const cfg = enemy.data.gooSpewCone;
    if (!cfg?.enabled) return;
    enemy.spewDamageAccum = (enemy.spewDamageAccum || 0) + amount;
    if (!enemy.spewWindupActive && enemy.spewDamageAccum >= cfg.damageThreshold) {
      enemy.spewDamageAccum -= cfg.damageThreshold;
      enemy.spewWindupActive = true;
      enemy.spewWindupTimer = cfg.chargeUpTime;
    }
  },

  update(enemy, ctx) {
    const cfg = enemy.data.gooSpewCone;
    if (!cfg?.enabled || !enemy.spewWindupActive) return;
    const { deltaTime, dotDamageEvents } = ctx;

    enemy.spewWindupTimer -= deltaTime;
    if (enemy.spewWindupTimer > 0) return;

    enemy.spewWindupActive = false;
    const tgt = enemy.target;
    let aimX = 1, aimY = 0;
    if (tgt) {
      const dx = tgt.position.x - enemy.position.x;
      const dy = tgt.position.y - enemy.position.y;
      const mag = Math.sqrt(dx * dx + dy * dy) || 1;
      aimX = dx / mag;
      aimY = dy / mag;
    }
    const baseAngle = Math.atan2(aimY, aimX);
    const blobs = [];
    const count = cfg.blobCount;
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0 : (i / (count - 1)) - 0.5;
      const angle = baseAngle + t * cfg.coneAngle;
      blobs.push({
        x: enemy.position.x + GRID.CELL_SIZE / 2,
        y: enemy.position.y + GRID.CELL_SIZE / 2,
        vx: Math.cos(angle) * cfg.blobSpeed,
        vy: Math.sin(angle) * cfg.blobSpeed,
        decel: cfg.blobDecel,
        plane: enemy.plane ?? 0
      });
    }
    return {
      suspend: true,
      result: { dotDamage: dotDamageEvents, shouldSpewGoo: true, gooSpewData: blobs }
    };
  }
};
