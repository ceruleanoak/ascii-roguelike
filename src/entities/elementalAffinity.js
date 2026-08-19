// Elemental affinity model — shared immunity/resistance/weakness rules for anything
// that can take a `proj.onHit`/`attack.onHit` hit: Enemy (via the instance methods
// that forward to these), and any entity that doesn't subclass Enemy. LakeBoss is a
// standalone class and calls these directly so it authors immunities as
// `elementalAffinity` data instead of hand-rolled method overrides, same as every
// other enemy. Composite boss parts (TurtleHead, TurtleLeg, GooHead) DO extend Enemy
// and get this for free — they should never override getElementalModifier/
// shouldApplyStatusEffect to duplicate what `elementalAffinity` data already
// expresses; GooHead's detached-head freeze exception is the correct pattern for a
// genuine one-off (calls super rather than replacing the logic).
//
// Two independent immunity paths, both consulted by isImmuneToEffect:
//   - Explicit `elementalAffinity.immunity: [effect, ...]` blocks specific effects by
//     name. This is the "give this boss an explicit onHit immunity" lever — works for
//     any effect, including affinity-less ones (stun, sleep, charm, dizzy, blind,
//     knockback) that have no entry below.
//   - Affinity auto-immunity: if the effect maps to an affinity here and the entity's
//     `affinities` list includes that affinity, the effect is blocked. A fire-affinity
//     enemy is auto-immune to burn (and any future fire-affinity effect) with no
//     per-effect data needed.
// Resistance/weakness lookups (getElementalModifierFor) are keyed by effect name too,
// never by affinity name — every call site (CombatSystem, TrapSystem) passes onHit/
// effect values like 'burn', 'freeze', 'shock', 'blade', never 'fire' or 'ice'.
export const EFFECT_AFFINITY = {
  burn:   'fire',
  freeze: 'ice',
  zap:    'electric',
  poison: 'venom',
  wet:    'aquatic',
  goo:    'goo',
};

export function isImmuneToEffect(elementalAffinity, affinities, effect) {
  if (!effect) return false;
  if (elementalAffinity?.immunity?.includes(effect)) return true;
  const affinity = EFFECT_AFFINITY[effect];
  if (affinity && affinities?.includes(affinity)) return true;
  return false;
}

export function getElementalModifierFor(elementalAffinity, affinities, elementType) {
  if (!elementType) return 1.0;
  if (isImmuneToEffect(elementalAffinity, affinities, elementType)) return 0.0;
  if (!elementalAffinity) return 1.0;
  if (elementalAffinity.resistance?.[elementType] !== undefined) {
    return elementalAffinity.resistance[elementType];
  }
  if (elementalAffinity.weakness?.[elementType] !== undefined) {
    return elementalAffinity.weakness[elementType];
  }
  return 1.0;
}
