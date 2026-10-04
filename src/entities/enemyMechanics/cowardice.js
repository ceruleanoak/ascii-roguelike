// Cowardice — the shared "stop hunting, run" flip used by any Mechanic that
// temporarily turns a hunting Enemy into a coward (ThiefMechanic after a
// theft or a hit; QuiverRechargeMechanic while its bow is empty).
//
// The flip deletes the hunting States from the Enemy's own `declared` map so
// the EnemyStateMachine FALLBACK can no longer resolve them — Alert's sight
// and proximity doors then fall through to Flee instead of Approach/Search.
// Everything touched is snapshotted first, and `leaveCowardice` restores
// exactly that snapshot: a key absent before the flip goes back to absent
// (undeclared), not to an empty `{}`, so an Enemy that never declared
// `lookback`/`withdraw` on its own doesn't gain them permanently just because
// it was cowardly once.

import { WeaponConversion } from './weaponConversion.js';

const SNAPSHOT_KEYS = ['approach', 'search', 'anticipate', 'recover', 'flee', 'lookback', 'withdraw', 'strike'];

/**
 * Flips `enemy` to cowardly flight and returns the pre-flip snapshot the
 * caller must hand back to `leaveCowardice`. `cornered: true` lets Flee fall
 * through to Strike when the target closes in (a cowardly thief still bites
 * back); false means the coward only ever runs.
 */
export function enterCowardice(enemy, ctx, { cornered = false, reason = 'coward flip' } = {}) {
  const declared = enemy.stateMachine.declared;
  const snapshot = {};
  for (const key of SNAPSHOT_KEYS) {
    const value = declared[key];
    snapshot[key] = value && typeof value === 'object' ? { ...value } : value;
  }

  delete declared.approach;
  delete declared.search;
  delete declared.anticipate;
  delete declared.recover;
  if (!enemy.stateMachine.has('flee')) declared.flee = {};
  declared.flee.cornered = cornered;
  if (!enemy.stateMachine.has('lookback')) declared.lookback = {};
  if (!enemy.stateMachine.has('withdraw')) declared.withdraw = { duration: 1.2 };

  enemy.stateMachine.transition(enemy, ctx, 'flee', reason);
  return snapshot;
}

/** Restores the States `enterCowardice` snapshotted and settles into Alert. */
export function leaveCowardice(enemy, ctx, snapshot, reason = 'coward recovered') {
  const declared = enemy.stateMachine.declared;
  const pre = snapshot ?? {};
  for (const key of SNAPSHOT_KEYS) {
    if (pre[key] === undefined) delete declared[key];
    else declared[key] = pre[key];
  }
  // The snapshot predates any weapon picked up mid-flight; re-aim Approach at
  // what the Enemy is holding now.
  WeaponConversion.syncApproachToWeapon(enemy);
  enemy.stateMachine.transition(enemy, ctx, 'alert', reason);
}
