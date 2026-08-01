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
// Placing a trap when a barrier appears between the mark and the current
// position is not this State's job — a State has no return value the outside
// world can read. It sets flags (`fleeReachedBarrier`, `fleeBarrierPauseTimer`,
// `fleeTrapPlaced`) that a reactive Mechanic (TrapLayerMechanic) reads, because
// only a Mechanic's `{suspend, result}` contract can actually spawn something.
import { applyStateMovement, moveStill } from '../enemyMovement.js';
import { hasLineOfSight } from '../enemyVision.js';

export default {
  id: 'flee',

  enter(enemy, ctx, machine) {
    // Re-entered constantly while a running enemy flickers in and out of
    // range — only the entry that actually starts a flight arms the mark,
    // mirroring Search's own re-entry guard.
    if (enemy.fleeing) return;

    enemy.fleeing = true;
    enemy.fleeReachedBarrier = false;
    enemy.fleeBarrierPauseTimer = null;

    if (enemy.target) {
      // Frozen, not led — the opposite of Search's velocity-lookahead mark.
      // "Where you were," not "where you were going," because a cowering
      // enemy isn't tracking a heading, it's running from a spot.
      enemy.lastKnownPosition = { x: ctx.targetPos.x, y: ctx.targetPos.y };
      enemy.memoryMarkPlane = enemy.target.plane;
    }
    enemy.currentDirection = { x: 0, y: 0 };
  },

  exit(enemy) {
    enemy.fleeing = false;
    enemy.fleeBarrierPauseTimer = null;
  },

  update(enemy, ctx, machine) {
    const cfg = machine.configFor('flee') ?? {};

    // Re-detected mid-flight — the mark updates, same rule as the initial
    // detection. `ctx.canSee` is cone-gated here (Flee never sets
    // `aggroMemoryActive`), so this fires only when the enemy happens to be
    // facing its target, not on every frame it is merely within range.
    if (ctx.canSee && enemy.target) {
      enemy.lastKnownPosition = { x: ctx.targetPos.x, y: ctx.targetPos.y };
      enemy.memoryMarkPlane = enemy.target.plane;
    }

    const mark = enemy.lastKnownPosition;
    const visionLength = ctx.effectiveVisionLength ?? enemy.visionLength;
    enemy.fleeReachedBarrier = !!(mark && enemy.collisionMap &&
      !hasLineOfSight(enemy, mark, enemy.position, visionLength));

    // Only one trap per flee episode — once placed, the barrier pause never
    // re-arms, so reaching a second barrier later in the same flight is inert.
    if (enemy.fleeReachedBarrier && !enemy.fleeTrapPlaced) {
      enemy.fleeBarrierPauseTimer = enemy.fleeBarrierPauseTimer == null
        ? (cfg.barrierPause ?? 0.4)
        : enemy.fleeBarrierPauseTimer - ctx.deltaTime;
    } else if (!enemy.fleeTrapPlaced) {
      enemy.fleeBarrierPauseTimer = null;
    }

    if (enemy.fleeTrapPlaced) {
      enemy.fleeClearTimer = enemy.fleeClearTimer == null
        ? (cfg.clearAfter ?? 1.0)
        : enemy.fleeClearTimer - ctx.deltaTime;
    }

    // Held at the barrier for the pause beat — a placement reads as a
    // decision when the enemy visibly stops for it, not as an instant reflex
    // the moment sight breaks.
    const holding = enemy.fleeBarrierPauseTimer != null && enemy.fleeBarrierPauseTimer > 0;
    if (holding || !mark) {
      moveStill(enemy);
    } else {
      applyStateMovement(enemy, { movement: 'flee', ...cfg }, ctx.speedMultiplier, mark, ctx.deltaTime);
    }
  },

  next(enemy, ctx, machine) {
    const cfg = machine.configFor('flee') ?? {};

    if (!enemy.target) return { id: cfg.to ?? 'withdraw', cause: 'lost target while fleeing' };

    if (enemy.fleeTrapPlaced && enemy.fleeClearTimer != null && enemy.fleeClearTimer <= 0) {
      return { id: cfg.to ?? 'withdraw', cause: 'trap laid, breaking off' };
    }

    // A dead end with no barrier ever found would otherwise run forever —
    // bounded the same way Search bounds an unreachable mark, just on time
    // instead of a mark count, since Flee has nothing to count.
    if (machine.timer >= (cfg.maxDuration ?? 6.0)) {
      return { id: cfg.to ?? 'withdraw', cause: 'gave up fleeing' };
    }

    return null;
  },

  thresholds(enemy) {
    return [{ label: 'vision', px: enemy.visionLength ?? enemy.aggroRange, color: '#8089a0' }];
  },
};
