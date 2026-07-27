// Pack behavior init (wolves, spiders). The kiter movement that reads
// packmates lives in enemyMovement.moveKiter — it stays with the movement
// archetypes because it's tightly coupled to them. This module owns init
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
