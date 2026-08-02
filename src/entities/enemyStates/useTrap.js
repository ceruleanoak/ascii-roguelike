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
};
