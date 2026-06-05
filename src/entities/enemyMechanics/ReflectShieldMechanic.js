// Mirror Imp reflect shield: simple two-state cycle (active / cooldown). While
// shieldActive=true, projectiles bounce (handled in CombatSystem). Starts
// active so the imp spawns guarded.

export const ReflectShieldMechanic = {
  isEnabled(enemy) {
    return enemy.data.reflectShield?.enabled === true;
  },

  init(enemy) {
    enemy.shieldActive = false;
    enemy.shieldTimer = enemy.data.reflectShield.shieldDuration;
    enemy.shieldCooldownTimer = 0;
  },

  update(enemy, ctx) {
    const cfg = enemy.data.reflectShield;
    if (!cfg?.enabled) return;
    const { deltaTime } = ctx;

    if (enemy.shieldActive) {
      enemy.shieldTimer -= deltaTime;
      if (enemy.shieldTimer <= 0) {
        enemy.shieldActive = false;
        enemy.shieldCooldownTimer = cfg.shieldCooldown;
      }
    } else {
      enemy.shieldCooldownTimer -= deltaTime;
      if (enemy.shieldCooldownTimer <= 0) {
        enemy.shieldActive = true;
        enemy.shieldTimer = cfg.shieldDuration;
      }
    }
  }
};
