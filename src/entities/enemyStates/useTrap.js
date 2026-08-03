// Use Trap — the cornered beat once Lookback confirms a barrier separates the
// enemy from its target. Placing the trap itself is not this State's job — a
// State has no return value the outside world can read, so it only holds
// still and waits; TrapLayerMechanic watches for `stateMachine.current ===
// 'useTrap'` and is the one thing that can actually spawn something, since
// only a Mechanic's `{suspend, result}` contract reaches TrapSystem.
//
// Once the trap is down, this State also owns the getaway: a real Flee-style
// path away from the trap (corner-seeking, jittered, same movement as
// flee.js's own run), held until real distance clears the trap's blast
// radius. Not a timer — a timer can't tell "far enough" from "still standing
// on it," and standing on it is exactly what killed this enemy before.
//
// This State never transitions back to `flee`. Reaching it at all already
// required Lookback to confirm the target can't see this enemy, and the only
// way out is forward, to `alert`. That is what makes "flee only re-triggers
// from idle" true structurally, not by convention: nothing between Flee and
// Alert ever reopens the door.
import { moveStill, moveFlee } from '../enemyMovement.js';
import { GRID } from '../../game/GameConfig.js';

export default {
  id: 'useTrap',

  enter(enemy) {
    // Forces moveFlee to pick a fresh heading off the trap position on the
    // first retreat frame, instead of coasting on whatever heading was still
    // active from fleeing the player a moment ago — a stale heading here can
    // point back toward the trap it's meant to be clearing.
    enemy.fleeHeadingAngle = null;
    enemy.fleeHeadingTimer = 0;
  },

  update(enemy, ctx, machine) {
    if (!enemy.fleeTrapPlaced) {
      moveStill(enemy);
      return;
    }

    // Read by moveFlee/computeFleeHeading to taper scatter jitter over the
    // life of this retreat — same convention flee.js uses for its own run.
    enemy.fleeElapsedTime = machine.timer;

    const trapPos = enemy.ownTrapPositions[enemy.ownTrapPositions.length - 1];
    if (trapPos) {
      moveFlee(enemy, ctx.speedMultiplier, trapPos, ctx.deltaTime);
    } else {
      moveStill(enemy);
    }
  },

  next(enemy, ctx, machine) {
    const cfg = machine.configFor('useTrap') ?? {};
    if (!enemy.fleeTrapPlaced) return null; // still waiting on TrapLayerMechanic to fire

    const trapPos = enemy.ownTrapPositions[enemy.ownTrapPositions.length - 1];
    if (trapPos) {
      // Center-to-center, matching TrapSystem's own cx/cy blast math — the
      // margin exists because the trap's fuse can force-fire before this
      // enemy is fully clear, and a hairline pass is not a safe distance.
      const ex = enemy.position.x + enemy.width / 2;
      const ey = enemy.position.y + enemy.height / 2;
      const dist = Math.hypot(ex - trapPos.x, ey - trapPos.y);
      const clearDistance = trapPos.radius + (cfg.clearMargin ?? GRID.CELL_SIZE * 1.5);
      if (dist >= clearDistance) {
        enemy.fleeing = false;
        return { id: cfg.to ?? 'withdraw', cause: 'clear of the trap radius' };
      }
    }
    // Safety net — if TrapLayerMechanic never fires (data misconfigured), or
    // the retreat can't reach clear ground in time (boxed in), don't strand
    // the enemy here forever. TrapSystem's owner-immunity means a timeout
    // here is no longer a death sentence, just an early handoff to Alert.
    // `machine.timer` runs in double-seconds like every other State's timer
    // (flee.js's own `maxDuration ?? 6.0` is the same convention) — 7.0 here
    // is 3.5 real seconds, sized against the largest configured trap radius
    // (Fire Trap, 112px): a headless repro (tools/debug/trapgoblin-repro.mjs)
    // clocked a real retreat at ~70px/s under continuous pursuit, so the old
    // default of 3.5 (1.75 real seconds, ~126px of travel) fell just short of
    // that trap's 136px clear distance and hit this net on nearly every run
    // instead of the real clearance check above — a fallback firing that
    // often isn't a safety net, it's the common case. This value leaves
    // headroom instead.
    if (machine.timer >= (cfg.timeout ?? 7.0)) {
      enemy.fleeing = false;
      return { id: cfg.to ?? 'withdraw', cause: 'useTrap timed out before clearing the blast radius' };
    }
    return null;
  },

  // Reaching this State at all required Lookback to confirm a broken
  // sightline, so leaving it — trap laid or not — is a clean getaway, not a
  // mid-chase pause. Reset detection the same way a freshly-spawned enemy
  // starts: without this, `lastKnownPosition` (the frozen flee mark) and
  // `hadVisualContact` (alert.js's permanent proximity-door slam, set the
  // instant Flee first saw its target) both stay set, closing every one of
  // Alert's re-engage doors at once — sight is cone-gated and this enemy is
  // now facing away from the chase, proximity is slammed shut, and the
  // "already have a mark" door needs `aggroMemoryActive`, which Flee
  // deliberately never sets (flee.js). Trap Goblin's aggro range (12 cells)
  // means the pursuing player almost never leaves Alert's hold-still radius
  // in the meantime, so without this reset the goblin freezes in place,
  // facing the wrong way, until the player simply walks up and kills it —
  // the opposite of "runs at the sight of you."
  exit(enemy) {
    enemy.lastKnownPosition = null;
    enemy.hadVisualContact = false;
  },
};
