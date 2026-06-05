// Giant Slime split-on-damage: damage accumulator (handled in takeDamage)
// spawns child slimes that re-merge via ReformMechanic. This module owns
// only the init for the splitChildren tracking set.

export const SplitOnDamageMechanic = {
  isEnabled(enemy) {
    return enemy.data.splitOnDamage?.enabled === true;
  },

  init(enemy) {
    enemy.splitChildren = new Set();
  }
};
