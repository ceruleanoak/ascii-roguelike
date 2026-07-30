// Withdraw — disengaging on purpose.
//
// Absent today, and the answer to "should there be an optional state triggered
// when a search is abandoned". Optional is the operative word: an enemy that
// does not declare it resolves through to Alert on abandonment, which is exactly
// what every enemy does now, so adding the State to the spine changes nothing
// until someone authors it.
//
// The difference it buys is that giving up becomes visible. Today an enemy that
// abandons a search simply stops and starts wandering on the spot, which reads
// as a bug rather than as a decision.
import { applyStateMovement } from '../enemyMovement.js';

export default {
  id: 'withdraw',

  enter(enemy) {
    enemy.enraged = false;
    enemy.aggroMemoryActive = false;
    enemy.lastKnownPosition = null;
  },

  update(enemy, ctx, machine) {
    const cfg = machine.configFor('withdraw') ?? {};
    applyStateMovement(enemy, { movement: 'back', ...cfg }, ctx.speedMultiplier, ctx.targetPos, ctx.deltaTime);
  },

  next(enemy, ctx, machine) {
    const cfg = machine.configFor('withdraw') ?? {};
    // Re-engaging mid-withdrawal is allowed: walking away is a decision, not a
    // commitment, and an enemy that ignored the player reappearing in front of
    // it would read as broken.
    if (ctx.canSee && ctx.effectiveDistance <= ctx.effectiveAggroRange && enemy.target) {
      return { id: 'approach', cause: 'target reappeared during withdrawal' };
    }
    if (machine.timer >= (cfg.duration ?? 0)) {
      return { id: cfg.to ?? 'alert', cause: 'withdrawal complete' };
    }
    return null;
  },
};
