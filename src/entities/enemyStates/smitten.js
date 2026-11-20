// Smitten — drawn to the Feed the player is carrying (GLOSSARY.md "Smitten").
//
// Declared by every Enemy that can be tamed with Feed (`tameableByBread`, see
// stateDefaults.js). SmittenMechanic decides when it starts; this State owns
// what it is and when it ends. It never leads to Strike, so nothing is bitten
// or stolen while it runs — the loop closes itself: carry Feed and the
// creature follows, stop carrying it and it is a wild thing again.
import { GRID } from '../../game/GameConfig.js';
import { applyStateMovement, moveStill } from '../enemyMovement.js';
import { carriesFeed, floatSmittenHeart, SMITTEN_HEART_INTERVAL } from '../../systems/smitten.js';

// Follows to here and stops — close enough to read as following, not so close
// it sits on the player.
const FOLLOW_DISTANCE = GRID.CELL_SIZE * 1.5;

export default {
  id: 'smitten',

  enter(enemy, ctx, machine) {
    // No `!` — it noticed the bread, not a target.
    enemy.detectionIndicatorTimer = 0;
    machine.heartTimer = SMITTEN_HEART_INTERVAL;
    floatSmittenHeart(enemy.game, enemy);
  },

  exit(enemy, ctx, machine) {
    machine.heartTimer = 0;
  },

  update(enemy, ctx, machine) {
    machine.heartTimer -= ctx.deltaTime;
    if (machine.heartTimer <= 0) {
      machine.heartTimer = SMITTEN_HEART_INTERVAL;
      floatSmittenHeart(enemy.game, enemy);
    }
    if (ctx.distance > FOLLOW_DISTANCE) {
      applyStateMovement(enemy, { movement: 'close' }, ctx.speedMultiplier, ctx.targetPos, ctx.deltaTime);
    } else {
      moveStill(enemy);
    }
  },

  next(enemy, ctx) {
    if (enemy.heartbroken) return { id: 'alert', cause: 'heartbroken' };
    if (!carriesFeed(enemy.game?.player)) return { id: 'alert', cause: 'feed gone' };
    if (!ctx.samePlane) return { id: 'alert', cause: 'player left the plane' };
    return null;
  },
};
