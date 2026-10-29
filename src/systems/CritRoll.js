// Player crit roll, extracted from CombatSystem._applyCritIfLucky (CombatSystem.js
// was over its architecture budget). Pure: reads the attacking owner and the
// struck enemy, returns the (possibly multiplied) damage.
//
// Returns { damage, isCrit, isLucky }. Only player attacks roll crits, gated
// by player.critChance (Lucky Coin / well ritual) or weapon's own critChance.
// isLucky=true when the Lucky Coin/well is the crit source (shows "LUCKY CRIT");
// isLucky=false when the weapon alone provides the chance (shows "CRIT").
export function rollCrit(damage, owner, enemy) {
  if (!owner?.quickSlots) return { damage, isCrit: false };
  let critChance = owner.critChance || 0;
  const isLucky = critChance > 0; // Lucky Coin or well is contributing
  const activeWeapon = owner.quickSlots[owner.activeSlotIndex];
  if (activeWeapon?.data?.critChance) {
    critChance = Math.max(critChance, activeWeapon.data.critChance);
  }
  // Post-dodge crit window: dagger-class weapons force a guaranteed crit.
  if (activeWeapon?.data?.weaponSubtype === 'dagger' && owner.postDodgeCritTimer > 0) {
    critChance = 1;
  }
  // Punishing a telegraphed swing: a hit that lands in the back half of the
  // enemy's windup is a guaranteed crit.
  if (enemy?.isInCritWindow?.()) {
    critChance = 1;
  }
  if (!(critChance > 0)) return { damage, isCrit: false };
  if (Math.random() >= critChance) return { damage, isCrit: false };
  const critMult = activeWeapon?.data?.weaponSubtype === 'dagger' ? 2 : 1.5;
  return { damage: Math.ceil(damage * critMult), isCrit: true, isLucky };
}
