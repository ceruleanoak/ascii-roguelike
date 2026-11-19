// Decision Frame — the one beat per `decisionInterval` on which an Enemy may
// decide to do something (GLOSSARY.md "Decision Frame").
//
// `decisionInterval` is the roster's reaction time. It always paced
// perception (Alert/Search/Approach notice and lose a target only on a
// Decision Frame), but attacks used to fire the moment a cooldown and range
// check passed, so one attack could chain straight into the next — a charge
// ending into a melee swing, a leap landing into another leap — with no beat
// to read between them. Now every attack commit, and every spawn or buff an
// Enemy starts, runs through `commitAttack()`:
//
//   - It only succeeds on a Decision Frame, and only one thing can be
//     decided per frame (a leap and a strike can't commit together).
//   - The decision clock is held at a full interval while an attack is
//     underway (`attackUnderway`), so the next one can't be decided until a
//     whole interval after the last one ends. That beat is the read.
//
// Anticipate is underway for commits (nothing else may start during the tell)
// but does not hold the clock: a pack waiting in Anticipate keeps thinking, so
// each wolf notices on its own frame that its mates are ready
// (anticipate.js `requirePack`).
//
// Not attacks, and so not gated here: a parry's guard and its payoff
// (counterAttack / chargeOnParry, CombatSystem), which answer the player's own
// blow; movement; perception, which reads `ctx.decisionFrame` directly.

// Spine States that are part of an attack. Recover counts: the beat after a
// swing is still the swing.
const ATTACK_STATES = new Set(['anticipate', 'strike', 'recover']);
// Sniper phases past the commit to a shot or a stab.
const SNIPER_COMMITTED = new Set(['telegraph', 'cooldown', 'daggerWindup', 'daggerCooldown']);

function mechanicUnderway(enemy) {
  return enemy.windupTimer > 0
    || enemy.leapWindupActive || enemy.leapAirborneActive
    || (enemy.frostLungePhase != null && enemy.frostLungePhase !== 'idle')
    || (enemy.dartPhase != null && enemy.dartPhase !== 'idle')
    || (enemy.chargeState != null && enemy.chargeState !== 'idle')
    || !!enemy.grappleTongue
    || SNIPER_COMMITTED.has(enemy.sniperState)
    || enemy.spawnWindupActive || enemy.buffWindupActive
    || enemy.spewWindupActive || enemy.trapWindupActive
    || enemy.ripenPrimed
    || !!enemy.equippedWeapon?.windupActive;
}

/** True while any attack, spawn or buff this Enemy committed to is still playing out. */
export function attackUnderway(enemy) {
  return ATTACK_STATES.has(enemy.stateMachine?.current) || mechanicUnderway(enemy);
}

/**
 * Advances the decision clock once per Enemy.update, before anything that
 * can commit. Held at a full interval while an attack is underway
 * (Anticipate excepted — see the header).
 */
export function tickDecision(enemy, deltaTime) {
  const holding = enemy.stateMachine?.current !== 'anticipate' && attackUnderway(enemy);
  if (holding) {
    enemy.decisionTimer = enemy.decisionInterval;
  } else {
    enemy.decisionTimer -= deltaTime;
  }
  enemy._decisionReady = enemy.decisionTimer <= 0;
}

/** Whether this Enemy could commit to an attack right now, without spending the frame. */
export function mayCommitAttack(enemy) {
  return enemy._decisionReady === true && !attackUnderway(enemy);
}

/**
 * Spends this frame's decision on an attack, spawn or buff. Call it as the
 * last condition before the commit, so a false return leaves everything as
 * it was and the commit is simply tried again next frame.
 */
export function commitAttack(enemy) {
  if (!mayCommitAttack(enemy)) return false;
  enemy._decisionReady = false;
  enemy.decisionTimer = enemy.decisionInterval;
  return true;
}
