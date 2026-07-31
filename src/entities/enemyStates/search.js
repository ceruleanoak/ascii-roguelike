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

    // Already searching — Search is re-entered constantly while contact
    // flickers, and none of the below should re-arm on those. Only the entry
    // that actually *begins* a hunt sets it up.
    if (enemy.aggroMemoryActive) return;

    // `aggroMemoryActive` is not bookkeeping. `hasVision` skips the ±65° cone
    // for an enemy carrying this flag (enemyVision.js) on the reasoning that
    // something already hunting you has turned to face you — so a searcher hears
    // in every direction and a merely-alert one does not. Without it a searcher
    // can never re-acquire anything outside the arc it happened to be facing
    // when it lost you, which reads as an enemy that has gone blind rather than
    // one that is looking for you.
    enemy.aggroMemoryActive = true;

    // Lead the mark by where the target was heading, capped so a dodge-rolling
    // player does not fling it across the room. The searcher goes to where you
    // were *going*, not the pixel you vanished on — which is the difference
    // between being hunted and being followed.
    if (enemy.target) {
      const lookahead = 0.35;
      const maxLead = GRID.CELL_SIZE * 4;
      const tv = enemy.target.velocity ?? { vx: 0, vy: 0 };
      let leadX = tv.vx * lookahead;
      let leadY = tv.vy * lookahead;
      const mag = Math.sqrt(leadX * leadX + leadY * leadY);
      if (mag > maxLead) { leadX = (leadX / mag) * maxLead; leadY = (leadY / mag) * maxLead; }
      enemy.lastKnownPosition = { x: enemy.target.position.x + leadX, y: enemy.target.position.y + leadY };
    }

    enemy.memoryMoveDelayTimer = cfg.moveDelay ?? enemy.memoryMoveDelay ?? 0;
    // Force the cached steering direction to be recomputed toward the mark
    // rather than coasting on the heading the chase left behind.
    enemy.currentDirection = { x: 0, y: 0 };
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

    // Something within arm's reach gets hit, hunt or no hunt. The legacy ladder
    // gets this for free by being almost stateless — its attack branch is keyed
    // on distance and cooldown and sits above the chase branch, so it fires no
    // matter what the enemy was doing. A machine has to say it out loud, and
    // saying it here is the difference between a searcher that swings at what it
    // stumbles into and one that walks past you because it is busy looking.
    if (ctx.effectiveDistance <= enemy.attackRange && enemy.attackTimer <= 0 && ctx.canStrike
        && (enemy.enraged || ctx.effectiveDistance <= ctx.effectiveAggroRange)) {
      return { id: 'anticipate', cause: 'searcher walked into attack range' };
    }

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
      // The hunt is over, so the omnidirectional hearing that came with it ends
      // too — leaving the flag set would make an enemy that gave up permanently
      // better at noticing you than one that never started.
      enemy.aggroMemoryActive = false;
      enemy.memoryMarkSuspected = false;
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
