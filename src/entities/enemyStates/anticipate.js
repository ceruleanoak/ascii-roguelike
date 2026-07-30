// Anticipate — visibly committing, before the strike lands.
//
// The State the codebase has been missing. The Frost Wolf's description says it
// "waits for its mates before striking" and nothing in its data has ever made
// that true — its cadence is `attackCooldown` and nothing else. `hoverTime` on
// twelve enemies was reaching for this and was deleted in `baba4f0` for being a
// parallel machine rather than for being a bad idea.
//
// Undeclared by default, so every enemy that has not been re-authored skips
// straight to Strike and behaves exactly as it does today. The old
// `attackWindup` is *not* this State — it is Strike's own opening beat, and
// conflating them is what would change behavior across the whole roster.
import { applyStateMovement } from '../enemyMovement.js';

export default {
  id: 'anticipate',
  // Not committed by default: an enemy that visibly hesitates should be
  // punishable for it. An authored `committed: true` makes the hesitation safe,
  // which is a real design choice and therefore an authored one.
  committed: false,

  enter(enemy, ctx, machine) {
    const cfg = machine.configFor('anticipate') ?? {};
    enemy.stateTell = cfg.tell ?? null;
    // Snapshot where the target was when commitment began, so the strike aims at
    // where they were rather than tracking them through the tell.
    if (enemy.target) {
      enemy.markedTargetPosition = { x: enemy.target.position.x, y: enemy.target.position.y };
    }
  },

  update(enemy, ctx, machine) {
    const cfg = machine.configFor('anticipate') ?? {};
    applyStateMovement(enemy, { movement: 'still', ...cfg }, ctx.speedMultiplier, ctx.targetPos, ctx.deltaTime);
  },

  next(enemy, ctx, machine) {
    const cfg = machine.configFor('anticipate') ?? {};

    // `breakIf` is what keeps an uncommitted tell honest — the enemy can think
    // better of it. The Trap Goblin's `duration: Infinity` is the opposite pole:
    // a State it never leaves, which its deleted comment ("never commits to the
    // kiter rush") describes exactly.
    if (cfg.breakIf?.targetLost && !ctx.canSee) {
      return { id: 'approach', cause: 'lost sight during tell' };
    }
    if (cfg.breakIf?.outOfBand && ctx.effectiveDistance > enemy.attackRange) {
      return { id: 'approach', cause: 'target left the band during tell' };
    }

    // The wolf's headline condition. `packCoordination` currently only shares
    // memory marks; this is the first time it gates a transition, which is why
    // the sandbox has to run the real EnemyUpdateSystem to exercise it.
    if (cfg.requirePack) {
      const ready = (enemy.packmates ?? []).filter(m => !m.dead && m.enraged).length;
      if (ready + 1 < cfg.requirePack) return null;
    }

    const duration = cfg.duration ?? 0;
    if (duration !== Infinity && machine.timer >= duration) {
      return { id: 'strike', cause: `tell elapsed (${duration})` };
    }
    return null;
  },

  exit(enemy) {
    enemy.stateTell = null;
  },
};
