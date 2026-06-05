// Alchemist potion throw: tracks the last-thrown potion type so the next
// throw can rotate through variants. The throw itself lives in
// createPotionThrowAttack() on Enemy. This module owns only the init.

export const PotionMechanic = {
  isEnabled(enemy) {
    return enemy.data.potionMechanic?.enabled === true;
  },

  init(enemy) {
    enemy.lastPotionThrown = null;
  }
};
