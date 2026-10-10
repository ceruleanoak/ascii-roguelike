// ExtraOnHitEffects — applies additional onHit effects beyond a weapon
// attack's primary one. `extraOnHit` is the array Item.js populates from
// equipped oils that didn't become the primary effect (see Item.js's
// _readEquippedOilEffect / createMeleeMultistab / createSingleArrow).
// Spending a scarce consumable slot on an oil must never cost the weapon
// its own effect (bug #183) — this module is what lets both land on the
// same swing, and generalizes to any number of stacked oils.
//
// Also exports applyOnHitStatusEffect — the per-effect special cases of a
// weapon hit (full-strength zap) shared verbatim by the projectile and melee
// primary-effect blocks in CombatSystem.js and by the extras loop below, so
// the branch exists once instead of three times.

import { MAX_PIPS } from './StatusEffects.js';

// Applies `effect` to `enemy` for `duration`. `effect` should already be
// past the stun->zap dual-key translation if the caller does one. An ice hit
// is a discrete hit like any other: it adds one freeze pip, and the enemy
// carrier layer turns pip 3 into the Frozen lock (EnemyStatusEffects).
export function applyOnHitStatusEffect(enemy, effect, duration) {
  if (effect === 'zap') {
    // An electric weapon hit is full-strength current: straight to zap pip 3
    // (lock + disarm). Only chains and imbued current carry less.
    enemy.applyStatusEffect('zap', duration, MAX_PIPS);
  } else {
    enemy.applyStatusEffect(effect, duration);
  }
}

// Mirrors the primary effect's per-effect resolution in CombatSystem.js
// (elemental modifier/immunity gate, zap strength, impact effect) but
// resolves each extra independently, with its own elemental-modifier check —
// an extra must not be swallowed just because the primary effect happened to
// be immune-voided on this enemy, nor gated behind Acid Blade's per-room
// charge counter (call sites in CombatSystem.js place this call outside both
// of those gates). Extras use a flat duration; they don't inherit the
// primary's wet-bonus extended durations, which are specific to a weapon's
// own onHit==='stun'/'freeze' combo with isWet.
// durationScale: the attack's `statusDurationScale` ({ effect: multiplier }),
// so a weapon that lengthens one of its effects lengthens it as an extra too.
export function applyExtraOnHitEffects(combatSystem, enemy, extraOnHitList, color, durationScale = null) {
  if (!extraOnHitList || extraOnHitList.length === 0) return;
  const baseDuration = 3.0;

  for (const onHit of extraOnHitList) {
    if (!onHit) continue;

    const elementalMod = enemy.getElementalModifier(onHit);
    // Immune to this extra specifically — a silent no-op augment, no damage
    // number. The primary effect already gives IMMUNE/RESIST feedback for
    // this swing; stacking a second one per extra would just be noise.
    if (elementalMod === 0.0) continue;
    if (!enemy.shouldApplyStatusEffect(onHit)) continue;

    applyOnHitStatusEffect(enemy, onHit, baseDuration * elementalMod * (durationScale?.[onHit] ?? 1));
    combatSystem.impactEffects.push({ x: enemy.position.x, y: enemy.position.y, onHit, color });
  }
}
