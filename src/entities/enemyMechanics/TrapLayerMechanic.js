import { TRAP_TYPE_CHAR } from '../../systems/TrapSystem.js';
import { getItemData } from '../../data/items.js';
import { GRID } from '../../game/GameConfig.js';
import { commitAttack } from '../enemyDecision.js';

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
    enemy.trapWindupActive = false; // Drives the '...' head indicator and,
    // via useTrap.js's moveStill, the visible run-to-stop while charging.
    enemy.trapWindupTimer = 0;
    enemy.ownTrapPositions = []; // This enemy's own traps — {x, y, radius} — so
    // moveFlee can steer around them and useTrap.js can distance-gate its
    // post-placement retreat against the real blast radius.
    enemy.sprungTimer = 0; // > 0 while Sprung (GLOSSARY.md): see `springAll`.
  },

  // The player walked into a Trap Goblin's trap. Every Trap Goblin in `enemies`
  // hears it and turns Sprung for `sprungDuration` (double-seconds): its Flee
  // runs at the player instead of away (flee.js), and the cornered bite that
  // follows ends it.
  springAll(enemies) {
    for (const enemy of enemies) {
      if (!TrapLayerMechanic.isEnabled(enemy) || enemy.hp <= 0) continue;
      enemy.sprungTimer = enemy.data.trapLayerMechanic.sprungDuration ?? 8.0;
    }
  },

  // Called with the State spine's ctx just before the machine runs. Ticks the
  // Sprung window and pulls a Sprung goblin into Flee from any uncommitted
  // State (Alert, Withdraw, Lookback), the way Smitten pulls a rat to Feed.
  // Hearing the trap is perception, so the turn waits for a Decision Frame.
  updateSprung(enemy, ctx) {
    if (!(enemy.sprungTimer > 0)) return;
    enemy.sprungTimer -= ctx.deltaTime;
    const machine = enemy.stateMachine;
    if (enemy.sprungTimer <= 0 || !ctx.samePlane) { enemy.sprungTimer = 0; return; }
    if (machine.current === 'flee' || machine.isCommitted() || !ctx.decisionFrame) return;
    machine.transition(enemy, ctx, 'flee', 'sprung');
  },

  update(enemy, ctx) {
    const cfg = enemy.data.trapLayerMechanic;
    if (!cfg?.enabled) return null;

    // Not currently in the trap-laying State — reset for next visit and do
    // nothing.
    if (enemy.stateMachine.current !== 'useTrap') {
      enemy.fleeTrapPlaced = false;
      enemy.trapWindupActive = false;
      enemy.trapWindupTimer = 0;
      return null;
    }

    if (enemy.fleeTrapPlaced) return null;

    // Charge for `windup` (double-seconds, same convention as State timers)
    // before the trap actually drops. useTrap.js already targets zero
    // velocity here (`moveStill`) the instant this State is entered — without
    // a real windup to hold that target, the mechanic used to fire on the
    // very same frame, so the enemy's own accelRate never got more than one
    // frame to bleed off its flee speed and the drop read as instantaneous
    // rather than a goblin skidding to a stop to plant something.
    // Planting the trap is a decision: the windup starts on a Decision Frame.
    if (!enemy.trapWindupActive && !commitAttack(enemy)) return null;
    enemy.trapWindupActive = true;
    enemy.trapWindupTimer += ctx.deltaTime;
    if (enemy.trapWindupTimer < (cfg.windup ?? 0)) return null;

    enemy.trapWindupActive = false;
    enemy.fleeTrapPlaced = true;
    const x = enemy.position.x + enemy.width / 2;
    const y = enemy.position.y + enemy.height / 2;

    const types = cfg.trapTypes ?? ['slow'];
    const trapType = types[Math.floor(Math.random() * types.length)];
    const trapChar = TRAP_TYPE_CHAR[trapType] ?? '◉';
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
