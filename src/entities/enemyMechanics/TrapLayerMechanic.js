import { TRAP_TYPE_CHAR } from '../../systems/TrapSystem.js';
import { getItemData } from '../../data/items.js';
import { GRID } from '../../game/GameConfig.js';

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
    enemy.ownTrapPositions = []; // This enemy's own traps — {x, y, radius} — so
    // moveFlee can steer around them and useTrap.js can distance-gate its
    // post-placement retreat against the real blast radius.
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

    const types = cfg.trapTypes ?? ['slow'];
    const trapType = types[Math.floor(Math.random() * types.length)];
    const trapChar = TRAP_TYPE_CHAR[trapType] ?? '●';
    const radius = getItemData(trapChar)?.effectRadius ?? GRID.CELL_SIZE * 2;

    enemy.ownTrapPositions.push({ x, y, radius });
    if (enemy.ownTrapPositions.length > 5) enemy.ownTrapPositions.shift();

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
