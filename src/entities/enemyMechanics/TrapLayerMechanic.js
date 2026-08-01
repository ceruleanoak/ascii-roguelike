// Trap Goblin's trap drop — a reaction to the Flee State, not a state of its
// own. Flee (enemyStates/flee.js) fully owns the goblin's movement and
// decides when a barrier separates it from its memory mark; this Mechanic
// only watches the flags Flee sets and, once, turns them into an actual
// trap — the one thing a State can't do itself, since only a Mechanic's
// `{suspend, result}` return reaches TrapSystem (see Enemy.js's dispatch
// chain and EnemyUpdateSystem.js's `shouldLayTrap` handling).
export const TrapLayerMechanic = {
  isEnabled(enemy) {
    return enemy.data.trapLayerMechanic?.enabled === true;
  },

  init(enemy) {
    enemy.fleeTrapPlaced = false; // One trap per flee episode
    enemy.fleeClearTimer = null; // Counts down after placing, before Flee breaks off
    enemy.ownTrapPositions = []; // This enemy's own traps, so moveFlee can steer around them
  },

  update(enemy, ctx) {
    const cfg = enemy.data.trapLayerMechanic;
    if (!cfg?.enabled) return null;

    // Not currently fleeing — reset for next time and do nothing.
    if (!enemy.fleeing) {
      enemy.fleeTrapPlaced = false;
      return null;
    }

    if (!enemy.fleeReachedBarrier || enemy.fleeTrapPlaced) return null;
    if (enemy.fleeBarrierPauseTimer == null || enemy.fleeBarrierPauseTimer > 0) return null;

    enemy.fleeTrapPlaced = true;
    const x = enemy.position.x + enemy.width / 2;
    const y = enemy.position.y + enemy.height / 2;
    enemy.ownTrapPositions.push({ x, y });
    if (enemy.ownTrapPositions.length > 5) enemy.ownTrapPositions.shift();

    const types = cfg.trapTypes ?? ['slow'];
    const trapType = types[Math.floor(Math.random() * types.length)];

    return {
      suspend: true,
      result: {
        dotDamage: ctx.dotDamageEvents,
        shouldLayTrap: true,
        trapData: { x, y, type: trapType },
      },
    };
  },
};
