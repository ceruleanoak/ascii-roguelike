// Weapon-vs-status melee damage bonuses: an immobilized/vulnerable enemy takes
// extra damage from the weapon class that exploits it. Kept as one small file
// (rather than inline in CombatSystem.js) so CombatSystem's melee-hit block
// stays a dispatch of named bonuses instead of open-coding each multiplier.
//
// - Blunt (hammer) vs. frozen: 2.5x — the enemy can't brace for impact.
// - Blade vs. snared (Snare Trap, Enemy.isSnared): 2x — pinned and exposed.
//   Gated on isSnared rather than isPinned so a temporary Trident pin doesn't
//   also proc it (see Enemy.isPinned/isSnared).

/** Applies the frozen/hammer and snared/blade multipliers to a melee hit's damage. */
export function applyMeleeStatusDamageBonus(totalDamage, attack, { isFrozen, isSnared }) {
  let damage = totalDamage;
  if (isFrozen && attack.weaponSubtype === 'hammer') {
    damage = Math.ceil(damage * 2.5);
  }
  if (isSnared && attack.isBlade) {
    damage *= 2;
  }
  return damage;
}

/** Damage-number indicator for a landed status-bonus hit, or null if none applies. */
export function getMeleeStatusBonusIndicator(attack, { isFrozen, isSnared }) {
  if (isFrozen && attack.weaponSubtype === 'hammer') return { char: '*', color: '#00ddff' };
  if (isSnared && attack.isBlade) return { char: '*', color: '#8b6914' };
  return null;
}
