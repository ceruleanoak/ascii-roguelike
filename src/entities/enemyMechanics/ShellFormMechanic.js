// Shell form (tortoise + shell-armored enemies). Starts in shell with 80%
// knockback resistance. Damage handler elsewhere triggers re-emergence; the
// timer here counts down to drop the shell. For ambushers, exiting the shell
// also triggers a burst.

export const ShellFormMechanic = {
  isEnabled(enemy) {
    return enemy.data.shellCamouflage === true;
  },

  init(enemy) {
    enemy.inShellForm = true;
    enemy.shellFormTimer = 0;
    enemy.knockbackResistance = 0.8;
  },

  update(enemy, ctx) {
    if (!enemy.inShellForm || enemy.shellFormTimer <= 0) return;
    const { deltaTime } = ctx;

    enemy.shellFormTimer -= deltaTime;
    if (enemy.shellFormTimer > 0) return;

    enemy.inShellForm = false;
    enemy.knockbackResistance = 0;
    if (enemy.movementStyle === 'ambusher') {
      enemy.burstActive = true;
      enemy.burstTimer = enemy.movementConfig.burstDuration ?? 1.0;
    }
  }
};
