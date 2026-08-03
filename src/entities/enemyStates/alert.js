// Alert — aware of the target but not committed to it.
//
// Half of what `'idle'` means today. The legacy ladder uses one state id for two
// unrelated situations — "nothing is happening, wander" and "something is
// happening but I cannot act on it" — which is why `'idle'` is written at
// fourteen separate sites for reasons that have nothing to do with each other.
// Splitting them is what lets the `!` detection beat belong to a State instead
// of being a free-floating timer (`detectionIndicatorTimer`).
import { GRID } from '../../game/GameConfig.js';
import { applyStateMovement, moveStill } from '../enemyMovement.js';
import { isTargetInTallGrass } from '../enemyVision.js';
import { armPursuitGate, isPursuing } from '../enemyPursuit.js';

// How close the target has to be before tall grass stops concealing it. You
// cannot hide from something standing next to you.
const CLOSE_RANGE = GRID.CELL_SIZE * 3;

export default {
  id: 'alert',

  enter(enemy, ctx, machine) {
    const cfg = machine.configFor('alert') ?? {};
    // The tell is the State's, so it cannot outlive it — the orphan-indicator
    // failure that sank the deleted hover state.
    if (cfg.tell) enemy.detectionIndicatorTimer = enemy.detectionIndicatorDuration;
    // Arm `requirePursuit` below — see enemyPursuit.js for why this is
    // anchored to the enemy's own position rather than a raw distance.
    armPursuitGate(enemy, '_alertPursuitGate');
  },

  update(enemy, ctx, machine) {
    const cfg = machine.configFor('alert') ?? {};
    // The two halves of legacy `'idle'`, finally distinguishable. An enemy with
    // the target inside its aggro range but no way to act on it is not idling —
    // it is listening, and it holds. Wandering is what the *other* half does,
    // and the legacy ladder only ever calls `updateWanderMovement` from its
    // out-of-aggro-range branch for exactly this reason.
    //
    // `requirePursuit` skips the hold even in range: its whole re-engage
    // check (next(), below) is "did the target close distance since this
    // visit began," and a frozen enemy standing at point-blank range has no
    // distance left to close — the gate would deadlock shut forever the
    // moment a pursuer reaches it, instead of the intended "settles down
    // once actually left alone." Wandering keeps the enemy in motion, which
    // keeps that comparison meaningful either way.
    if (!cfg.requirePursuit && ctx.effectiveDistance <= ctx.effectiveAggroRange) {
      moveStill(enemy);
      return;
    }
    applyStateMovement(enemy, { movement: 'wander', ...cfg }, ctx.speedMultiplier, ctx.targetPos, ctx.deltaTime);
  },

  next(enemy, ctx, machine) {
    const cfg = machine.configFor('alert') ?? {};
    if (!enemy.target) return null;
    // A declared duration makes Alert a real beat — the enemy notices, holds for
    // a moment, then commits. Without one it commits as soon as it can see, which
    // is today's behavior.
    if (cfg.duration && machine.timer < cfg.duration) return null;

    // Nothing commits across planes unless it is already engaged. This is the
    // legacy `canChase` guard, which is what makes an enemy on the surface
    // ignore a player in the aquifer below it.
    const canEngage = ctx.samePlane || enemy.enraged || enemy.aggroMemoryActive;
    if (!canEngage) return null;

    const inRange = ctx.effectiveDistance <= ctx.effectiveAggroRange;

    // `requirePursuit`: an enemy fresh off a whole flee episode (Trap Goblin,
    // via `useTrap`/`withdraw`) resets its detection flags to look exactly
    // like a just-spawned enemy — deliberately, so it can still notice a
    // target it isn't facing (see useTrap.js's exit()). But that means both
    // doors below are wide open the instant this Alert visit starts, and a
    // target that is merely still standing nearby — not chasing, just
    // present — re-arms them every time, reading as an enemy that never
    // actually stopped reacting. Gated enemies only re-engage once the
    // target has genuinely closed distance since this visit began, not
    // merely remained visible or in range.
    const pursuing = isPursuing(enemy, '_alertPursuitGate', cfg);

    // Door one: sight.
    if (pursuing && ctx.canSee && (inRange || enemy.enraged)) {
      return { id: 'approach', cause: 'target sighted' };
    }

    // Door two: proximity. An enemy that has never laid eyes on the target — the
    // one that spawned facing a wall — still notices something walk past it, and
    // investigates where it sensed it rather than chasing what it cannot see.
    //
    // `hadVisualContact` slams this door permanently once the enemy has seen the
    // target even once, and that guard is load-bearing: without it an enemy that
    // reaches a stale mark immediately senses the target again, marks its current
    // position, and oscillates forever.
    if (pursuing && inRange && ctx.samePlane && !enemy.lastKnownPosition && !enemy.hadVisualContact) {
      const concealed = isTargetInTallGrass(enemy) && ctx.effectiveDistance > CLOSE_RANGE;
      // Deciding is all this does — the mark, the flags and the hesitation
      // before setting off are Search's to arm, and arming them here as well
      // would leave Search's own entry looking like a re-entry and skipping it.
      if (!concealed) return { id: 'search', cause: 'sensed by proximity' };
    }

    // Already carrying a mark — go work it rather than standing here.
    if (enemy.aggroMemoryActive && enemy.lastKnownPosition) {
      return { id: 'search', cause: 'pursuing an existing mark' };
    }
    return null;
  },

  thresholds(enemy) {
    return [{ label: 'aggro', px: enemy.aggroRange, color: '#5ec46a' }];
  },
};
