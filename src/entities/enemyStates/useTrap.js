// Use Trap — the cornered beat once Lookback confirms a barrier separates the
// enemy from its target. Placing the trap itself is not this State's job — a
// State has no return value the outside world can read, so it only holds
// still and waits; TrapLayerMechanic watches for `stateMachine.current ===
// 'useTrap'` and is the one thing that can actually spawn something, since
// only a Mechanic's `{suspend, result}` contract reaches TrapSystem.
import { moveStill } from '../enemyMovement.js';

export default {
  id: 'useTrap',

  enter(enemy) {
    enemy.fleeClearTimer = null;
  },

  update(enemy, ctx, machine) {
    moveStill(enemy);

    if (!enemy.fleeTrapPlaced) return;

    const cfg = machine.configFor('useTrap') ?? {};
    enemy.fleeClearTimer = enemy.fleeClearTimer == null
      ? (cfg.clearAfter ?? 1.0)
      : enemy.fleeClearTimer - ctx.deltaTime;
  },

  next(enemy, ctx, machine) {
    const cfg = machine.configFor('useTrap') ?? {};

    if (enemy.fleeTrapPlaced && enemy.fleeClearTimer != null && enemy.fleeClearTimer <= 0) {
      enemy.fleeing = false;
      return { id: cfg.to ?? 'withdraw', cause: 'trap laid, breaking off' };
    }
    // Safety net — if TrapLayerMechanic never fires (data misconfigured, or
    // this State reached without the Mechanic enabled), don't strand the
    // enemy here forever.
    if (machine.timer >= (cfg.timeout ?? 3.0)) {
      enemy.fleeing = false;
      return { id: cfg.to ?? 'withdraw', cause: 'useTrap timed out without a trap' };
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
