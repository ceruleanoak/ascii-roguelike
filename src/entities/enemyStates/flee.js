// Flee — running from a memory mark, using the same cone-gated detection as
// Alert rather than the omnidirectional hearing Search gets while hunting.
//
// A wildcard state: an enemy that declares `flee` but neither `approach` nor
// `search` has both of Alert's transition doors (sight, proximity) resolve
// through to it instead, via EnemyStateMachine's FALLBACK — "flee instead of
// search" costs nothing beyond declaring the state and omitting the other two.
//
// The mark is frozen at the position of whatever detection triggered flight —
// not led, unlike Search's — and holds until the target is spotted again.
// Deliberately never sets `aggroMemoryActive`: that flag is what makes
// `hasVision` skip the facing cone (enemyVision.js), and an enemy that has
// turned its back on its target should only re-notice it by chance, which is
// the entire point of running rather than hunting.
//
// The periodic glance-back and the cornered trap-laying beat are not this
// State's job anymore — they are their own declared States (`lookback`,
// `useTrap`), reached via the `next()` branch below. This State only owns the
// run itself: freezing/refreshing the mark and moving away from it.
import { applyStateMovement, moveStill } from '../enemyMovement.js';

export default {
  id: 'flee',

  enter(enemy, ctx, machine) {
    // Re-entered constantly while a running enemy flickers in and out of
    // range — only the entry that actually starts a flight arms the mark,
    // mirroring Search's own re-entry guard.
    if (enemy.fleeing) return;

    enemy.fleeing = true;
    enemy.fleeLookbackTimer = null;
    enemy.fleeHeadingTimer = 0;
    enemy.fleeHeadingAngle = null;
    enemy.fleeElapsedTime = 0;

    if (enemy.target) {
      // Frozen, not led — the opposite of Search's velocity-lookahead mark.
      // "Where you were," not "where you were going," because a cowering
      // enemy isn't tracking a heading, it's running from a spot.
      enemy.lastKnownPosition = { x: ctx.targetPos.x, y: ctx.targetPos.y };
      enemy.memoryMarkPlane = enemy.target.plane;
    }
    enemy.currentDirection = { x: 0, y: 0 };
  },

  update(enemy, ctx, machine) {
    const cfg = machine.configFor('flee') ?? {};

    // Re-detected mid-flight — the mark updates, same rule as the initial
    // detection. `ctx.canSee` is cone-gated here (Flee never sets
    // `aggroMemoryActive`), so this fires only when the enemy happens to be
    // facing its target, not on every frame it is merely within range.
    // `hadVisualContact` is Alert's proximity door slam (alert.js) — set
    // only inside Approach's own equivalent block until now, so a
    // flee-wildcard enemy never got it and Alert's door two never closed.
    // This is Flee's own copy of that same statefulness.
    if (ctx.canSee && enemy.target) {
      enemy.lastKnownPosition = { x: ctx.targetPos.x, y: ctx.targetPos.y };
      enemy.memoryMarkPlane = enemy.target.plane;
      enemy.hadVisualContact = true;
    }

    // How long this flight has run — read by moveFlee (enemyMovement.js) to
    // taper its scatter jitter from wide-at-the-start down to a small wobble.
    // Accumulated here rather than mirrored from `machine.timer`: this state
    // is bounced out to `lookback` and back on every glance-back (every
    // `lookbackInterval`), and `machine.timer` resets on every transition —
    // mirroring it re-widened the scatter back to maximum on each bounce,
    // so a sustained chase never converged on a clean away-heading and kept
    // re-rolling wide, reading as exactly the "erratically moving around"
    // the whole fix was for. `enter()` only zeroes this on a genuine new
    // flight (the `if (enemy.fleeing) return` guard above), so it now
    // survives lookback round-trips and narrows for real.
    enemy.fleeElapsedTime = (enemy.fleeElapsedTime ?? 0) + ctx.deltaTime;

    // Ticks down toward the next deliberate glance back (the `lookback`
    // State). Default is double-seconds (ctx.deltaTime already carries
    // ENEMY_TIMER_RATE) — 2.0 reads as "every second" at real speed.
    enemy.fleeLookbackTimer = enemy.fleeLookbackTimer == null
      ? (cfg.lookbackInterval ?? 2.0)
      : enemy.fleeLookbackTimer - ctx.deltaTime;

    const mark = enemy.lastKnownPosition;
    if (!mark) {
      moveStill(enemy);
    } else {
      applyStateMovement(enemy, { movement: 'flee', ...cfg }, ctx.speedMultiplier, mark, ctx.deltaTime);
    }
  },

  next(enemy, ctx, machine) {
    const cfg = machine.configFor('flee') ?? {};

    if (!enemy.target) return { id: cfg.to ?? 'withdraw', cause: 'lost target while fleeing' };

    // A dead end with no barrier ever found would otherwise run forever —
    // bounded the same way Search bounds an unreachable mark, just on time
    // instead of a mark count, since Flee has nothing to count.
    if (machine.timer >= (cfg.maxDuration ?? 6.0)) {
      return { id: cfg.to ?? 'withdraw', cause: 'gave up fleeing' };
    }

    if (enemy.fleeLookbackTimer <= 0) {
      enemy.fleeLookbackTimer = cfg.lookbackInterval ?? 2.0;
      return { id: 'lookback', cause: 'time to glance back' };
    }

    return null;
  },

  thresholds(enemy) {
    return [{ label: 'vision', px: enemy.visionLength ?? enemy.aggroRange, color: '#8089a0' }];
  },
};
