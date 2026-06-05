// Siren lure: cycles between cooldown and a sung channel. When the channel
// completes with the player inside lureRadius, suspends Enemy.update() and
// returns a pull-force payload for the orchestrator to apply.

export const LureMechanic = {
  isEnabled(enemy) {
    return enemy.data.lureMechanic?.enabled === true;
  },

  init(enemy) {
    enemy.lureChannelTimer = 0;
    enemy.lureCooldownTimer = 0;
    enemy.lureSinging = false;
  },

  update(enemy, ctx) {
    const cfg = enemy.data.lureMechanic;
    if (!cfg?.enabled || !enemy.target) return;
    const { deltaTime, distance, dotDamageEvents } = ctx;

    if (enemy.lureSinging) {
      enemy.lureChannelTimer -= deltaTime;
      if (enemy.lureChannelTimer <= 0) {
        enemy.lureSinging = false;
        enemy.lureCooldownTimer = cfg.lureCooldown;
        const ldx = enemy.position.x - enemy.target.position.x;
        const ldy = enemy.position.y - enemy.target.position.y;
        const ldist = Math.sqrt(ldx * ldx + ldy * ldy);
        if (ldist < cfg.lureRadius && ldist > 0) {
          return {
            suspend: true,
            result: {
              dotDamage: dotDamageEvents,
              shouldLure: true,
              lureData: {
                forceX: (ldx / ldist) * (-cfg.lurePullForce),
                forceY: (ldy / ldist) * (-cfg.lurePullForce)
              }
            }
          };
        }
      }
    } else {
      enemy.lureCooldownTimer -= deltaTime;
      if (enemy.lureCooldownTimer <= 0 && distance < cfg.lureRadius) {
        enemy.lureSinging = true;
        enemy.lureChannelTimer = cfg.lureChannelTime;
      }
    }
  }
};
