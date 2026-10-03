// Close-Quarters Mechanic — `data.itemUsage.closeQuarters`: a carried melee
// weapon is a backup for when the target comes close, not a new archetype.
// A Sea Snake shoots fire from the water; one carrying a Trident stabs with
// it once the player stands within the Trident's reach.
//
// Without this flag, equipping a melee weapon converts an enemy for good
// (Enemy.equipWeapon: chaser movement, leap, item_melee). With it, the weapon
// is held in reserve — the enemy keeps its native attack, movement, and range
// — and each frame outside a Strike the attack is picked by distance: the
// weapon inside its reach, the native attack beyond it. Strike reads
// attackType fresh on entry, so a swing already under way is never swapped
// (same rule ThiefMechanic follows). Losing the weapon (dropped, knocked
// away) falls back to the native attack. No suspend signal.

import { GRID } from '../../game/GameConfig.js';

// Same reach Enemy.equipWeapon gives a melee-converted wielder; a weapon
// without its own `range` (spears) falls back to Item.createMeleeAttack's 20.
function weaponReach(weapon) {
  return Math.max(GRID.CELL_SIZE * 1.5, (weapon.data.range ?? 20) * 1.2);
}

export const CloseQuartersMechanic = {
  isEnabled(enemy) {
    return enemy.itemUsage?.closeQuarters === true;
  },

  /**
   * Enemy.equipWeapon hook. True when this melee weapon is held in reserve,
   * telling equipWeapon to skip its melee conversion. Ranged weapons are not
   * close-quarters weapons and go through the normal path.
   */
  holdInReserve(enemy, item) {
    if (!this.isEnabled(enemy)) return false;
    const type = item.data.weaponType;
    if (type === 'GUN' || type === 'BOW') return false;
    // A born ranged attacker was never given a Recover; the swing needs the
    // same overlap protection Enemy.equipWeapon grants melee converts.
    if (!enemy.stateMachine.has('recover')) {
      enemy.stateMachine.declared.recover = { duration: 0.4, variant: 'retreat', speed: 0.5 };
    }
    return true;
  },

  update(enemy, { distance }) {
    if (!this.isEnabled(enemy) || enemy.stateMachine.current === 'strike') return;
    const weapon = enemy.equippedWeapon;
    const reach = weapon ? weaponReach(weapon) : 0;
    if (weapon && distance <= reach) {
      enemy.attackType = 'item_melee';
      enemy.attackRange = reach;
    } else {
      enemy.attackType = enemy.data.attackType || 'melee';
      enemy.attackRange = enemy.data.attackRange;
    }
  },
};
