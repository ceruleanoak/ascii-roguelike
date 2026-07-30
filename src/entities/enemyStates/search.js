// Search — pursuing the last known position after losing contact.
//
// One State replacing two memory blocks that disagree with each other. The
// legacy ladder handles "reached the mark" twice: at the out-of-aggro path it
// goes idle and wanders, at the in-aggro path it goes chase and halts. Both are
// reachable, they produce visibly different behavior, and nothing chose between
// them. This keeps the in-aggro behavior — halting — because that is the one the
// `?` tell was written for.
//
// It also gives abandonment a parameter. There is no abandonment concept today
// at all: search ends on a 5.0-second literal written at six separate sites.
// `abandonAfter` counts *marks investigated*, not seconds, which is the unit the
// question was actually asked in.
import { GRID } from '../../game/GameConfig.js';
import { applyStateMovement, moveStill } from '../enemyMovement.js';

export default {
  id: 'search',

  enter(enemy, ctx, machine) {
    const cfg = machine.configFor('search') ?? {};
    machine.marksInvestigated = machine.marksInvestigated ?? 0;
    enemy.memoryMoveDelayTimer = cfg.moveDelay ?? enemy.memoryMoveDelay ?? 0;
    // Store the *target's* plane, not the enemy's. Three of the four legacy
    // write sites store `this.plane`, and the staleness check at Enemy.js:901 is
    // only correct for the fourth — so a mark made by an enemy that then changed
    // planes never went stale.
    enemy.memoryMarkPlane = enemy.target ? enemy.target.plane : enemy.plane;
    enemy.memoryStaleTimer = cfg.staleAfter ?? 2.0;
  },

  update(enemy, ctx, machine) {
    const cfg = machine.configFor('search') ?? {};
    // The pause before setting off. A searcher that starts moving the instant it
    // loses you reads as cheating.
    if (enemy.memoryMoveDelayTimer > 0) {
      enemy.memoryMoveDelayTimer -= ctx.deltaTime;
      moveStill(enemy);
      return;
    }
    const mark = enemy.lastKnownPosition;
    if (!mark) { moveStill(enemy); return; }

    const dx = mark.x - enemy.position.x;
    const dy = mark.y - enemy.position.y;
    if (Math.sqrt(dx * dx + dy * dy) < GRID.CELL_SIZE) {
      // Arrived. Hold — see the header note on which of the two disagreeing
      // legacy behaviors this keeps.
      moveStill(enemy);
      return;
    }
    applyStateMovement(enemy, { movement: 'close', ...cfg }, ctx.speedMultiplier, mark, ctx.deltaTime);
  },

  next(enemy, ctx, machine) {
    const cfg = machine.configFor('search') ?? {};

    if (ctx.canSee && ctx.effectiveDistance <= ctx.effectiveAggroRange) {
      machine.marksInvestigated = 0;
      return { id: 'approach', cause: 'reacquired target' };
    }

    const mark = enemy.lastKnownPosition;
    if (!mark) return { id: 'withdraw', cause: 'no mark to search' };

    const dx = mark.x - enemy.position.x;
    const dy = mark.y - enemy.position.y;
    const atMark = Math.sqrt(dx * dx + dy * dy) < GRID.CELL_SIZE;
    const stale = machine.timer >= (cfg.staleAfter ?? 5.0);

    if (atMark || stale) {
      machine.marksInvestigated = (machine.marksInvestigated ?? 0) + 1;
      enemy.lastKnownPosition = null;
      // Abandonment is a count the enemy carries, not a global constant — which
      // is what the design question asked for. A wolf gives up after two; a
      // hound could be authored to never give up at all.
      if (machine.marksInvestigated >= (cfg.abandonAfter ?? 1)) {
        machine.marksInvestigated = 0;
        enemy.enraged = false;
        return { id: cfg.onAbandon ?? 'withdraw', cause: `abandoned after ${cfg.abandonAfter ?? 1} mark(s)` };
      }
      return { id: 'search', cause: 'mark exhausted, another to try' };
    }
    return null;
  },

  thresholds(enemy) {
    return [{ label: 'vision', px: enemy.visionLength ?? enemy.aggroRange, color: '#8089a0' }];
  },
};
