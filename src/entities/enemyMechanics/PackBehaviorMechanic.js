// Pack behavior init (wolves, spiders). The kiter movement that reads
// packmates lives in Enemy._moveKiter — it stays on Enemy because it's
// tightly coupled to the movement archetype system. This module owns init
// only; deduplicates the legacy packBehavior.enabled and new-style
// movementStyle='kiter' inits.

export const PackBehaviorMechanic = {
  isEnabled(enemy) {
    return enemy.packBehavior?.enabled === true
      || (enemy.movementStyle === 'kiter' && !enemy.packBehavior);
  },

  init(enemy) {
    enemy.packmates = [];
  }
};
