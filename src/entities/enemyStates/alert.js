// Alert — aware of the target but not committed to it.
//
// Half of what `'idle'` means today. The legacy ladder uses one state id for two
// unrelated situations — "nothing is happening, wander" and "something is
// happening but I cannot act on it" — which is why `'idle'` is written at
// fourteen separate sites for reasons that have nothing to do with each other.
// Splitting them is what lets the `!` detection beat belong to a State instead
// of being a free-floating timer (`detectionIndicatorTimer`).
import { applyStateMovement } from '../enemyMovement.js';

export default {
  id: 'alert',

  enter(enemy, ctx, machine) {
    const cfg = machine.configFor('alert') ?? {};
    // The tell is the State's, so it cannot outlive it — the orphan-indicator
    // failure that sank the deleted hover state.
    if (cfg.tell) enemy.detectionIndicatorTimer = enemy.detectionIndicatorDuration;
  },

  update(enemy, ctx, machine) {
    const cfg = machine.configFor('alert') ?? {};
    applyStateMovement(enemy, { movement: 'wander', ...cfg }, ctx.speedMultiplier, ctx.targetPos, ctx.deltaTime);
  },

  next(enemy, ctx, machine) {
    const cfg = machine.configFor('alert') ?? {};
    if (!enemy.target) return null;
    // A declared duration makes Alert a real beat — the enemy notices, holds for
    // a moment, then commits. Without one it commits as soon as it can see, which
    // is today's behavior.
    if (cfg.duration && machine.timer < cfg.duration) return null;
    if (ctx.canSee && ctx.effectiveDistance <= ctx.effectiveAggroRange) {
      return { id: 'approach', cause: 'target sighted in aggro range' };
    }
    if (enemy.enraged && ctx.canSee) return { id: 'approach', cause: 'enraged' };
    return null;
  },

  thresholds(enemy) {
    return [{ label: 'aggro', px: enemy.aggroRange, color: '#5ec46a' }];
  },
};
