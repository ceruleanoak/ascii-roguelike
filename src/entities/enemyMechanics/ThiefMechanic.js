// Thief Mechanic — Rat's coin-grab kit: steal the player's coin instead of
// biting when there's coin to take, and turn cowardly the moment either side
// of the exchange turns against it (the rat gets hurt, or the rat gets what
// it came for). The state-mutation pattern (deleting hunting States from
// `declared` so the EnemyStateMachine FALLBACK can no longer resolve them)
// is RipenMechanic's, run in reverse: Ripen adds hunting States to a passive
// enemy, this removes them from a hunting one. The flip is one-way toward
// flight, not toward helplessness, though: `strike` stays declared and
// flee.js's `cornered` opt-in reaches it, so a cowardly rat still bites back
// if the player corners it — it just never again closes distance on its own.
//
// Cowardice's hunting behavior isn't permanent: a continuous run of lost
// sight — not merely one successful lookback, the general coward's own
// `withdraw`/`alert` settling already covers that — earns the rat its
// hunting states back (`_updateRecovery` / `_unflip`), restoring the exact
// pre-flip config rather than reconstructing archetype defaults, so a Rat
// and a re-authored Rat variant both recover correctly without this file
// needing to know their defaults. Room-clear status IS permanent, though:
// `_unflip` never restores `enemy.uncounted` — see its own comment.
import { hasVision } from '../enemyVision.js';

export const ThiefMechanic = {
  isEnabled(enemy) {
    return enemy.data.thiefMechanic?.enabled === true;
  },

  init(enemy) {
    enemy.ratFlipped = false;
    enemy.ratFlipPending = false;
    enemy.ratRecoverTimer = 0;
  },

  // Taking damage always wins the priority cascade over a theft in progress —
  // flagged here, actually applied on the next update() pass so the flip
  // happens outside of takeDamage()'s own call stack.
  onDamaged(enemy) {
    if (!ThiefMechanic.isEnabled(enemy) || enemy.ratFlipped) return;
    enemy.ratFlipPending = true;
  },

  // Called once a steal attack actually lands (see resolveTheft below) — a
  // successful grab is just as final as taking a hit.
  onCoinAcquired(enemy) {
    if (!ThiefMechanic.isEnabled(enemy) || enemy.ratFlipped) return;
    enemy.ratFlipPending = true;
  },

  update(enemy, ctx) {
    if (!ThiefMechanic.isEnabled(enemy)) return;

    if (enemy.ratFlipped) {
      ThiefMechanic._updateRecovery(enemy, ctx);
      return;
    }

    if (enemy.ratFlipPending) {
      ThiefMechanic._flipToCoward(enemy, ctx);
      return;
    }

    // Never yank the attack type out from under a swing already in motion —
    // Strike reads attackType/attackWindup fresh on entry, not mid-swing.
    if (enemy.stateMachine.current === 'strike') return;

    const hasCoin = enemy.game?.inventorySystem?.hasCoin(1) ?? false;
    enemy.attackType = hasCoin ? 'thief' : (enemy.data.attackType || 'melee');
  },

  _flipToCoward(enemy, ctx) {
    enemy.ratFlipped = true;
    enemy.ratFlipPending = false;
    enemy.ratRecoverTimer = 0;
    enemy.uncounted = true; // no longer blocks room-clear — reads as an NPC now
    enemy.attackType = enemy.data.attackType || 'melee';

    const declared = enemy.stateMachine.declared;
    // Snapshotted before any of the mutations below touch `declared` — the
    // rat's own recovery (`_unflip`) restores exactly this, rather than
    // reconstructing the archetype's defaults from `movementStyle`.
    enemy._ratPreFlipStates = {
      approach: declared.approach,
      search: declared.search,
      anticipate: declared.anticipate,
      recover: declared.recover,
      flee: declared.flee ? { ...declared.flee } : undefined,
      lookback: declared.lookback ? { ...declared.lookback } : undefined,
      withdraw: declared.withdraw ? { ...declared.withdraw } : undefined,
      strike: declared.strike ? { ...declared.strike } : undefined,
    };

    delete declared.approach;
    delete declared.search;
    delete declared.anticipate;
    delete declared.recover;
    // Strike stays declared — a flipped rat no longer hunts, but it isn't
    // defenseless: flee.js's `cornered` branch reaches this same State
    // (undeclared `anticipate`/`recover` fall back through it to `flee`,
    // exactly the path a normal un-flipped bite already resolves through
    // when neither is authored) so the bite fires only when the player
    // closes the distance, never on the rat's own initiative.
    if (!enemy.stateMachine.has('flee')) declared.flee = {};
    declared.flee.cornered = true;
    if (!enemy.stateMachine.has('lookback')) declared.lookback = {};
    if (!enemy.stateMachine.has('withdraw')) declared.withdraw = { duration: 1.2 };
    // Strike's default windup movement is 'still' — correct for the normal
    // approach-then-strike flow, where Approach already turned the enemy to
    // face its target before Strike holds that stance. A flipped rat never
    // runs that approach anymore: it arrives at Strike straight from Flee,
    // so 'still' would hold the away-facing the flight left behind and the
    // bite would read as landing while still running from the player. Safe
    // to set unconditionally rather than gate it on the cornered branch,
    // because Approach is deleted above — the cornered path in flee.js is
    // the only way this rat ever reaches Strike again.
    if (!declared.strike) declared.strike = {};
    declared.strike.movement = 'close';

    enemy.stateMachine.transition(enemy, ctx, 'flee', 'coward flip');
  },

  // Ticks while flipped, regardless of which State the coward wildcard chain
  // (flee → lookback → withdraw → alert, per EnemyStateMachine's FALLBACK)
  // currently has it in — a flipped rat settles into `alert` well before this
  // fires, same as any other coward, but settling isn't recovering: this is
  // the separate, longer clock on the flip itself. Resets on any frame the
  // rat can actually see its target (the same `hasVision`/`ignoreCone` check
  // Lookback uses to decide "lost me"), so only a continuous, uninterrupted
  // stretch out of sight counts — a target that flickers in and out never
  // accumulates toward recovery.
  _updateRecovery(enemy, ctx) {
    if (!enemy.target) return;

    const visionLength = ctx.effectiveVisionLength ?? enemy.visionLength;
    const canSee = hasVision(enemy, enemy.position, enemy.target.position, visionLength, { ignoreCone: true });
    if (canSee) {
      enemy.ratRecoverTimer = 0;
      return;
    }

    const recoverAfter = enemy.data.thiefMechanic?.recoverAfter ?? 4.0; // double-seconds — 2 real seconds
    enemy.ratRecoverTimer = (enemy.ratRecoverTimer ?? 0) + ctx.deltaTime;
    if (enemy.ratRecoverTimer >= recoverAfter) {
      ThiefMechanic._unflip(enemy, ctx);
    }
  },

  // Restores exactly what `_flipToCoward` snapshotted — a key absent before
  // the flip goes back to absent (undeclared), not to an empty `{}`, so an
  // enemy that never declared `lookback`/`withdraw` on its own doesn't gain
  // them permanently just because it was cowardly once.
  _unflip(enemy, ctx) {
    enemy.ratFlipped = false;
    enemy.ratRecoverTimer = 0;
    // `uncounted` stays true — recovery restores hunting/biting behavior but
    // never restores room-clear gating. Every other `uncounted` user in the
    // codebase (Aquifer eel, Quagmire Hag) is one-way for the same reason:
    // once a room's exits have opened on this rat's account, a later change
    // of heart shouldn't re-trap the player behind an already-earned-open
    // door. Bug #195 — recovering rats were re-locking exits mid-flap.

    const declared = enemy.stateMachine.declared;
    const pre = enemy._ratPreFlipStates ?? {};
    for (const key of ['approach', 'search', 'anticipate', 'recover', 'flee', 'lookback', 'withdraw', 'strike']) {
      if (pre[key] === undefined) delete declared[key];
      else declared[key] = pre[key];
    }
    enemy._ratPreFlipStates = null;

    enemy.stateMachine.transition(enemy, ctx, 'alert', 'coward recovered');
  },

  // Runs from CombatSystem once a steal attack actually connects (i.e. after
  // takeDamage() has already resolved dodge/block/i-frames normally) — theft
  // is only "successful" in exactly the same sense a bite landing is.
  resolveTheft(attack, player, combatSystem) {
    const game = combatSystem.game;
    const stolen = game.inventorySystem.getCoinCount();
    if (stolen <= 0) return;

    game.inventorySystem.removeCoin(stolen);
    for (let i = 0; i < stolen; i++) {
      const angle = (i / stolen) * Math.PI * 2 + Math.random() * 0.4;
      game.lootSystem.spawnIngredientDrop('c', player.position.x, player.position.y, angle, null);
    }
    combatSystem.createDamageNumber(`-${stolen}`, player.position.x, player.position.y, '#ffff00');

    if (attack.owner) ThiefMechanic.onCoinAcquired(attack.owner);
  }
};
