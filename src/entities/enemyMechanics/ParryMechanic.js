// Duelist parry: a cooldown-gated counter window. When the player is within
// 1.5× attackRange during chase, the duelist briefly windups then becomes
// parry-active. While parryActive=true, incoming attacks are deflected
// (handled in CombatSystem). No suspend signal — modifies enemy state only.

export const ParryMechanic = {
  isEnabled(enemy) {
    return enemy.data.parryMechanic?.enabled === true;
  },

  init(enemy) {
    enemy.parryActive = false;
    enemy.parryTimer = 0;
    enemy.parryCooldown = 0;
    enemy.parryWindupTimer = 0;
    enemy.parryWindupActive = false;
  },

  update(enemy, ctx) {
    const cfg = enemy.data.parryMechanic;
    if (!cfg?.enabled) return;
    const { deltaTime, distance } = ctx;

    if (enemy.parryWindupActive) {
      enemy.parryWindupTimer -= deltaTime;
      if (enemy.parryWindupTimer <= 0) {
        enemy.parryWindupActive = false;
        enemy.parryActive = true;
        enemy.parryTimer = cfg.parryDuration;
      }
    } else if (enemy.parryActive) {
      enemy.parryTimer -= deltaTime;
      if (enemy.parryTimer <= 0) {
        enemy.parryActive = false;
        enemy.parryCooldown = cfg.parryCooldown;
      }
    } else if (enemy.parryCooldown > 0) {
      enemy.parryCooldown -= deltaTime;
    } else if (enemy.state === 'chase' && !enemy.isStunned()) {
      if (distance < enemy.attackRange * 1.5) {
        enemy.parryWindupActive = true;
        enemy.parryWindupTimer = cfg.parryWindup;
      }
    }
  }
};
