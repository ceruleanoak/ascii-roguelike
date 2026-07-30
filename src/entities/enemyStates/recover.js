// Recover — the window after a strike where the enemy is not yet dangerous again.
//
// Absent today. What looks like recovery in the legacy ladder is a fake: the
// melee back-off branch fires whenever the player is inside attack range *and*
// the cooldown is running, so it is a position correction, not a vulnerability
// window, and it never applies to ranged enemies at all.
//
// Making it a real State is also what makes the keeper's preferred-range band
// reachable. Today every keeper has `preferredRange < attackRange`, so the band
// is dead code — the enemy is always inside attack range when the band would
// apply, and falls into the attack branch instead. With Recover declared, a
// keeper on cooldown holds its band here rather than dropping to idle.
import { applyStateMovement } from '../enemyMovement.js';

export default {
  id: 'recover',
  committed: false,

  update(enemy, ctx, machine) {
    const cfg = machine.configFor('recover') ?? {};
    applyStateMovement(enemy, { movement: 'back', speed: 0.5, ...cfg }, ctx.speedMultiplier, ctx.targetPos, ctx.deltaTime);
  },

  next(enemy, ctx, machine) {
    const cfg = machine.configFor('recover') ?? {};
    if (machine.timer < (cfg.duration ?? 0)) return null;
    if (!ctx.canSee) {
      return enemy.lastKnownPosition
        ? { id: 'search', cause: 'lost sight while recovering' }
        : { id: 'alert', cause: 'lost sight while recovering, no mark' };
    }
    return { id: 'approach', cause: 'recovered' };
  },
};
