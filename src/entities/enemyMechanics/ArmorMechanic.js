// Rockwarden armor: hits chip off chunks before any damage reaches HP. The
// chip logic lives in takeDamage(); this module owns only the init.

export const ArmorMechanic = {
  isEnabled(enemy) {
    return enemy.data.armorMechanic?.enabled === true;
  },

  init(enemy) {
    enemy.armorChunks = enemy.data.armorMechanic.armorChunks;
    enemy.armorBroken = false;
  }
};
