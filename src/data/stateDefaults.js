// The bridge between `movementStyle` and the State spine.
//
// Every enemy that has not been re-authored still declares its behavior the old
// way — one archetype name plus a `movementConfig` blob — and this expands that
// into the States block the runner reads. That expansion is what makes the
// migration behavior-identical: the archetype does not disappear, it becomes an
// authoring preset that names a default verb for one State.
//
// This is a catalogue, not an owner of behavior. It holds no timers and runs
// nothing; the four functions below are pure and return fresh objects. Per
// CLAUDE.md, `src/data/*.js` is deliberately unbudgeted for exactly this reason —
// it grows with the number of presets, not with drifting logic.

// Which verb an archetype means, in the one State the archetype ever described.
//
// The table being this short is the point of the whole exercise. Four of the five
// archetypes differ only in which verb their Approach uses, and the fifth
// (ambusher) differs by declaring one extra State — so `movementStyle` was never
// five behaviors, it was one field doing two unrelated jobs.
const APPROACH_VERB = {
  chaser:   'close',
  keeper:   'hold',
  kiter:    'orbit',
  // Jumping was never an archetype. A jumper closes like a chaser and JumpMechanic
  // stamps an impulse over the top of it — which is why it maps to the same verb
  // and will differ only by carrying a `hop` modifier once that lands.
  jumper:   'close',
  // An ambusher closes too. Everything that made it feel different — the sleep,
  // the wake radius, the lunge — lives in the Dormant State and the burst
  // modifier added below, not in how it moves once it is awake.
  ambusher: 'close',
};

/**
 * The States an enemy walks when its data says nothing about States.
 *
 * The set is exactly the four every enemy uses today, plus Dormant for ambushers.
 * Which States are *absent* matters as much as which are present, because absence
 * is what reproduces current behavior:
 *
 *   - No `anticipate` — nothing hesitates before striking today, so Approach
 *     resolves the skip straight through to Strike.
 *   - `recover` declared for chaser/keeper and for any enemy whose attack is
 *     melee, regardless of archetype — a melee ambusher or kiter overlaps and
 *     whiffs on cooldown exactly the same way a chaser does, and Approach no
 *     longer carries a fallback for that (see approach.js history: it used to
 *     have its own inline back-off branch, removed once Recover was made to
 *     hold through the full cooldown rather than a fixed animation length).
 *     Non-melee kiters/keepers/jumpers (bow, spell, breath) get no default
 *     Recover; Strike resolves straight back to Approach for them, same as
 *     before — nothing about a ranged attack can be too close to use.
 *   - No `withdraw` — abandoning a Search resolves to Alert and the enemy wanders,
 *     which is precisely what it does now.
 *
 * `alert` on the other hand must be declared. It is half of what `'idle'` means
 * today (the wandering half), and without it an enemy leaving aggro range would
 * resolve forward to Approach — the State it is already in — and never stop
 * chasing.
 */
export function defaultStates(data) {
  const style = data.movementStyle ?? 'chaser';
  const cfg = data.movementConfig ?? {};

  const states = {
    // The wander. `updateWanderMovement` already honors `idleBehavior:
    // 'stationary'` on its own, so the eleven stationary enemies need nothing
    // declared here to keep standing still.
    alert: { movement: 'wander' },
    approach: { movement: APPROACH_VERB[style] ?? 'close' },
    // Empty: Strike's own defaults read `attackRange`, `attackWindup` and
    // `attackCooldown` off the enemy, which is where every un-re-authored enemy
    // still keeps them. `bands` stays absent until an enemy is authored to vary
    // its attack by distance.
    strike: {},
    // Empty likewise. The State's defaults carry the 5.0s staleness the legacy
    // ladder wrote as a literal at six sites, and `abandonAfter: 1` — one mark,
    // then give up — which is the current behavior stated as a number for the
    // first time.
    search: {},
  };

  // The actual fix for the Chase-state waggle: melee enemies get a real timed
  // Recover instead of resolving straight back to Approach. 0.4s retreat @
  // 0.5x matches the legacy back-off's own feel — just as a committed window
  // instead of a bare distance flip that re-triggers itself. Gated on the
  // attack being melee (chaser/keeper defaults to melee same as Enemy.js's
  // own `data.attackType || 'melee'` fallback), not on archetype — a melee
  // ambusher or kiter needs the exact same overlap protection a chaser does.
  //
  // `data.recover` lets any enemy opt into one of the other named variants
  // (jumpBack/knockback/lockPlayer/hide) regardless of archetype — the same
  // "read a semantic field off the data" shape as `reflectShield` below,
  // rather than requiring a full hand-authored `states` block just to change
  // one State.
  const isMeleeAttacker = (data.attackType ?? 'melee') === 'melee';
  if (data.recover) {
    states.recover = { duration: 0.4, variant: 'retreat', speed: 0.5, ...data.recover };
  } else if (style === 'chaser' || style === 'keeper' || isMeleeAttacker) {
    states.recover = { duration: 0.4, variant: 'retreat', speed: 0.5 };
  }

  // The other four shorthands, same shape as `data.recover` above but with no
  // non-empty baseline to merge onto — `anticipate` and `withdraw` are absent
  // until opted into (nothing hesitates or disengages on purpose today), and
  // `search`/`strike` are already the empty object every enemy gets, so
  // authoring the shorthand simply replaces it with the tuned one. This is what
  // lets the enemy editor's dedicated State sections write somewhere real: a
  // form field with nowhere for its value to land is worse than no field at
  // all, because it looks authorable and silently isn't.
  if (data.anticipate) states.anticipate = { ...data.anticipate };
  if (data.search) states.search = { ...data.search };
  if (data.withdraw) states.withdraw = { ...data.withdraw };
  if (data.strike) states.strike = { ...data.strike };

  // The Mirror Imp's shield phase overrides the verb while the shield is up.
  // Declared on Approach alone because that is the only place legacy reaches it —
  // an imp that has not noticed you has nothing to back away from.
  if (data.reflectShield?.shieldPhaseMovement) states.approach.shieldPhase = true;

  if (style === 'ambusher') {
    // The two halves of an ambush, finally separate: when it wakes, and how it
    // moves once woken.
    states.dormant = { wake: { radius: cfg.wakeRadius } };
    states.approach.burst = { speed: cfg.burstSpeed, duration: cfg.burstDuration };
  }

  return states;
}

/**
 * The States block for an enemy, however it declares one.
 *
 * An authored `states` block wins outright rather than merging over the preset.
 * Merging would make "this enemy has no Anticipate" impossible to say — the
 * preset would keep putting States back — and the presence of a State is the
 * whole skip semantics. Authoring States is therefore all-or-nothing per enemy,
 * which also means the re-authored four can be read without cross-referencing
 * this file.
 *
 * Always returns a fresh top-level object, even for an authored `states`
 * block. `EnemyStateMachine` treats the object it's given (`declared`) as its
 * own private, mutable set — Enemy.js's `equipWeapon()` and RipenMechanic's
 * archetype flip both add keys to it after construction (`declared.recover
 * = {...}`, `declared.approach = {}`). `data.states` is the shared catalogue
 * entry every instance of that enemy type reads from; handing it out by
 * reference let one enemy's runtime mutation corrupt every future spawn of
 * the same type for the rest of the session (surfaced by Bomb: one Bomb
 * flipping to its permanent-chaser state retroactively declared `approach`/
 * `search` on the shared object, so freshly spawned Bombs afterward skipped
 * Flee entirely). The clone is shallow — nested state configs (e.g.
 * `states.flee`) are still shared, which is fine since nothing mutates them
 * in place, only adds sibling top-level keys.
 */
export function statesFor(data) {
  return data.states ? { ...data.states } : defaultStates(data);
}
