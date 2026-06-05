// Pack behavior init (wolves, spiders). The actual kiter movement that
// reads these fields lives in Enemy._moveKiter / _getKiterVelocity — those
// stay on Enemy because they're tightly coupled to the movement archetype
// system. This module owns init only; deduplicates the legacy
// packBehavior.enabled and new-style movementStyle='kiter' inits.

export const PackBehaviorMechanic = {
  isEnabled(enemy) {
    return enemy.packBehavior?.enabled === true
      || (enemy.movementStyle === 'kiter' && !enemy.packBehavior);
  },

  init(enemy) {
    enemy.hoverTimer = 0;
    enemy.isHovering = false;
    enemy.hoverLocked = false;
    enemy.isAttacking = false;
    enemy.attackRushTimer = 0;
    enemy.packmates = [];
  }
};
