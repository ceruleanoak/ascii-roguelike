// ExtraOnHitEffects — applies additional onHit effects beyond a weapon
// attack's primary one. `extraOnHit` is the array Item.js populates from
// equipped oils that didn't become the primary effect (see Item.js's
// _readEquippedOilEffect / createMeleeMultistab / createSingleArrow).
// Spending a scarce consumable slot on an oil must never cost the weapon
// its own effect (bug #183) — this module is what lets both land on the
// same swing, and generalizes to any number of stacked oils.
//
// Also exports applyOnHitStatusEffect — the freeze-escalation special case
// (second ice hit while fully frozen -> stun) shared verbatim by the
// projectile and melee primary-effect blocks in CombatSystem.js and by the
// extras loop below, so the branch exists once instead of three times.

// Applies `effect` to `enemy` for `duration`, handling freeze-escalation:
// a second ice hit while already fully frozen converts to a stun instead of
// re-applying/extending freeze. `effect` should already be past the
// stun->zap dual-key translation if the caller does one — freeze itself is
// never translated, so checking it here post-translation is safe.
export function applyOnHitStatusEffect(enemy, effect, duration, elementalMod) {
  if (effect === 'freeze') {
    if (enemy.isFrozen()) {
      enemy.applyStatusEffect('stun', 2.5 * elementalMod);
    } else {
      const dur = enemy.data.freezePermanent ? Infinity : 8.0 * elementalMod;
      enemy.applyStatusEffect('freeze', dur);
      enemy.statusEffects.freeze.frozen = true;
    }
  } else {
    enemy.applyStatusEffect(effect, duration);
  }
}

// Mirrors the primary effect's per-effect resolution in CombatSystem.js
// (elemental modifier/immunity gate, freeze-escalation, impact effect) but
// resolves each extra independently, with its own elemental-modifier check —
// an extra must not be swallowed just because the primary effect happened to
// be immune-voided on this enemy, nor gated behind Acid Blade's per-room
// charge counter (call sites in CombatSystem.js place this call outside both
// of those gates). Extras use a flat duration; they don't inherit the
// primary's wet-bonus extended durations, which are specific to a weapon's
// own onHit==='stun'/'freeze' combo with isWet.
export function applyExtraOnHitEffects(combatSystem, enemy, extraOnHitList, color) {
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

    applyOnHitStatusEffect(enemy, onHit, baseDuration * elementalMod, elementalMod);
    combatSystem.impactEffects.push({ x: enemy.position.x, y: enemy.position.y, onHit, color });
  }
}
