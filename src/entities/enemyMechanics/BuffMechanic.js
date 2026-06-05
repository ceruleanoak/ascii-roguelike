// Shaman buff: periodic windup → broadcast buff to nearby allies. Initial
// buffTimer is staggered (random fraction of cooldown) so a pack of shamans
// don't all pulse on the same frame. On windup completion, suspends
// Enemy.update() and returns a buff payload for the orchestrator to apply.

export const BuffMechanic = {
  isEnabled(enemy) {
    return enemy.data.buffMechanic?.enabled === true;
  },

  init(enemy) {
    const cfg = enemy.data.buffMechanic;
    enemy.buffTimer = cfg.buffCooldown * Math.random();
    enemy.buffWindupTimer = 0;
    enemy.buffWindupActive = false;
  },

  update(enemy, ctx) {
    const cfg = enemy.data.buffMechanic;
    if (!cfg?.enabled) return;
    const { deltaTime, dotDamageEvents } = ctx;

    if (enemy.buffWindupActive) {
      enemy.buffWindupTimer -= deltaTime;
      if (enemy.buffWindupTimer <= 0) {
        enemy.buffWindupActive = false;
        enemy.buffTimer = cfg.buffCooldown;
        return {
          suspend: true,
          result: {
            dotDamage: dotDamageEvents,
            shouldBuff: true,
            buffData: {
              position: { x: enemy.position.x, y: enemy.position.y },
              radius: cfg.buffRadius,
              buffs: cfg.buffs,
              speedMultiplier: cfg.speedMultiplier,
              damageMultiplier: cfg.damageMultiplier,
              buffDuration: cfg.buffDuration,
              caster: enemy
            }
          }
        };
      }
    } else {
      enemy.buffTimer -= deltaTime;
      if (enemy.buffTimer <= 0 && !enemy.isStunned()) {
        enemy.buffWindupActive = true;
        enemy.buffWindupTimer = cfg.buffWindup;
      }
    }
  }
};
