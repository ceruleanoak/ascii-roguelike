// Trap Goblin's trap drop — a reaction to the `useTrap` State, not a state of
// its own. `useTrap` (enemyStates/useTrap.js) owns the cornered hold; this
// Mechanic only watches for that State becoming current and, once per visit,
// turns it into an actual trap — the one thing a State can't do itself,
// since only a Mechanic's `{suspend, result}` return reaches TrapSystem (see
// Enemy.js's dispatch chain and EnemyUpdateSystem.js's `shouldLayTrap`
// handling).
export const TrapLayerMechanic = {
  isEnabled(enemy) {
    return enemy.data.trapLayerMechanic?.enabled === true;
  },

  init(enemy) {
    enemy.fleeTrapPlaced = false; // One trap per `useTrap` visit
    enemy.fleeClearTimer = null; // Counts down after placing, before useTrap breaks off
    enemy.ownTrapPositions = []; // This enemy's own traps, so moveFlee can steer around them
  },

  update(enemy, ctx) {
    const cfg = enemy.data.trapLayerMechanic;
    if (!cfg?.enabled) return null;

    // Not currently in the trap-laying State — reset for next visit and do
    // nothing.
    if (enemy.stateMachine.current !== 'useTrap') {
      enemy.fleeTrapPlaced = false;
      return null;
    }

    if (enemy.fleeTrapPlaced) return null;

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
