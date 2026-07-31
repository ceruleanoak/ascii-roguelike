// Approach — closing, holding, or orbiting, depending on the verb it names.
//
// This State is where the five movement archetypes go. `chaser` is
// `{movement: 'close'}`, `keeper` is `{movement: 'hold', band: [...]}`, `kiter`
// is `{movement: 'orbit'}`, and `jumper` is any of them with a `hop` modifier —
// so the archetype stops being a property of the enemy and becomes a property of
// this one State, which is what lets a single enemy orbit here and close in
// Strike.
import { applyStateMovement } from '../enemyMovement.js';

// Half speed, giving ground rather than fleeing — the enemy wants to be at its
// natural attack distance, not away from you.
const BACK_OFF_SPEED = 0.5;

// Only a swung weapon can be too close to use. A bow or a spell has no arc to
// overshoot, so nothing about point-blank hurts it and it holds its ground.
function backingOff(enemy, ctx) {
  if (enemy.attackType !== 'melee' && enemy.attackType !== 'item_melee') return false;
  if (enemy.attackTimer <= 0) return false;
  return ctx.effectiveDistance < enemy.attackRange
    && (enemy.enraged || ctx.effectiveDistance <= ctx.effectiveAggroRange);
}

export default {
  id: 'approach',

  update(enemy, ctx, machine) {
    const cfg = machine.configFor('approach') ?? {};

    // Approaching something you can see is also how you keep knowing where it
    // is. The mark is refreshed every frame of contact, so the instant sight
    // breaks, Search already has somewhere to go — that continuity is why
    // losing sight reads as "it saw me duck behind here" instead of a reset.
    if (ctx.canSee) {
      enemy.lastKnownPosition = { x: ctx.targetPos.x, y: ctx.targetPos.y };
      enemy.hadVisualContact = true;
      enemy.detectionIndicatorTimer = enemy.detectionIndicatorDuration;
      enemy.aggroMemoryActive = false;
      enemy.memoryMarkSuspected = false;
      enemy.memoryMoveDelayTimer = 0;
    }

    // Standing on top of what you are about to hit is how you miss it: a swing
    // arc is offset by the weapon's reach in the facing direction, so a melee
    // enemy that creeps into overlap whiffs every time. It gives ground while
    // the cooldown runs and closes again when the swing is ready.
    //
    // Reproduced here rather than left as its own State because it is not a
    // phase of anything — it is what Approach *means* for a melee enemy that
    // has already arrived. Recover is the State for the beat after a strike;
    // this is the beat between strikes, and they are not the same beat.
    if (backingOff(enemy, ctx)) {
      applyStateMovement(enemy, { movement: 'back', speed: BACK_OFF_SPEED }, ctx.speedMultiplier, ctx.targetPos, ctx.deltaTime);
      return;
    }

    applyStateMovement(enemy, { movement: 'close', ...cfg }, ctx.speedMultiplier, ctx.targetPos, ctx.deltaTime);
  },

  next(enemy, ctx, machine) {
    if (!enemy.target) return { id: 'search', cause: 'no target' };

    // Leaving the aggro range is tested before sight, because an enemy that
    // walks out of range while fully visible has still disengaged — and testing
    // sight first would keep it approaching forever.
    if (ctx.effectiveDistance > ctx.effectiveAggroRange && !enemy.enraged) {
      return enemy.lastKnownPosition
        ? { id: 'search', cause: 'target left aggro range' }
        : { id: 'alert', cause: 'target left aggro range, no mark' };
    }

    // In band and off cooldown — commit. Anticipate is skipped when undeclared,
    // which resolves straight to Strike and reproduces today's behavior for
    // every enemy that has not been re-authored.
    //
    // Tested *above* losing sight, and against `canStrike` rather than `canSee`,
    // because an enemy that has closed to arm's length is committing whether or
    // not its nose happens to be pointed at you. Ordering this below the sight
    // test would give every keeper and kiter a free pass out of every attack.
    if (ctx.effectiveDistance <= enemy.attackRange && enemy.attackTimer <= 0 && ctx.canStrike) {
      return { id: 'anticipate', cause: 'in attack range, off cooldown' };
    }

    // Losing sight is the only other thing that ends an approach besides
    // arriving. In the legacy ladder this is three different branches that
    // disagree about whether to go idle, halt, or keep the mark.
    if (!ctx.canSee) {
      return enemy.lastKnownPosition
        ? { id: 'search', cause: 'lost sight, have a mark' }
        : { id: 'withdraw', cause: 'lost sight, no mark' };
    }
    return null;
  },

  thresholds(enemy, cfg) {
    const out = [{ label: 'attack', px: enemy.attackRange, color: '#e0664a' }];
    if (cfg?.band) {
      out.push({ label: 'band min', px: cfg.band[0], color: '#6aa9ff' });
      out.push({ label: 'band max', px: cfg.band[1], color: '#6aa9ff' });
    }
    return out;
  },
};
