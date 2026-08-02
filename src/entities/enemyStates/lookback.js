// Lookback — a deliberate glance back, not the continuous barrier-seeking
// `moveFlee` already does every frame while running (enemyMovement.js). Where
// that steers toward cover, this is the sensory check of whether it worked:
// can the target, right now, actually see this enemy? Only reachable from
// Flee's own `next()`, on the interval it tracks (`flee.lookbackInterval`).
//
// Runs through the real vision system (hasVision) rather than a raw line
// check, against the target's actual current position rather than the frozen
// mark — obstruction and simply having run out of vision range both count as
// "lost me," and the cone is ignored because turning to look is the entire
// point of a lookback.
import { hasVision } from '../enemyVision.js';
import { moveStill } from '../enemyMovement.js';

export default {
  id: 'lookback',

  enter(enemy, ctx, machine) {
    // One-frame edge for a reactive Mechanic (RipenMechanic) — cleared at the
    // top of next() below, so it reads true for exactly the frames between
    // entering this State and its first next() call.
    enemy.fleeLookbackFired = true;
    enemy.fleeBarrierPauseTimer = null;

    const visionLength = ctx.effectiveVisionLength ?? enemy.visionLength;
    enemy.fleeReachedBarrier = !!(enemy.target &&
      !hasVision(enemy, enemy.position, enemy.target.position, visionLength, { ignoreCone: true }));
  },

  update(enemy, ctx, machine) {
    moveStill(enemy);

    if (!enemy.fleeReachedBarrier) return;

    // Held at the barrier for the pause beat — laying a trap reads as a
    // decision when the enemy visibly stops for it, not as an instant reflex
    // the moment sight breaks.
    const cfg = machine.configFor('lookback') ?? {};
    enemy.fleeBarrierPauseTimer = enemy.fleeBarrierPauseTimer == null
      ? (cfg.pause ?? 0.4)
      : enemy.fleeBarrierPauseTimer - ctx.deltaTime;
  },

  next(enemy, ctx, machine) {
    enemy.fleeLookbackFired = false;

    if (!enemy.fleeReachedBarrier) {
      return { id: 'flee', cause: 'lookback found the target can still see it' };
    }
    if (enemy.fleeBarrierPauseTimer != null && enemy.fleeBarrierPauseTimer <= 0) {
      return { id: 'useTrap', cause: 'barrier confirmed, hold beat elapsed' };
    }
    return null;
  },
};
