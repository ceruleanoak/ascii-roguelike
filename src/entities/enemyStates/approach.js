// Approach — closing, holding, or orbiting, depending on the verb it names.
//
// This State is where the five movement archetypes go. `chaser` is
// `{movement: 'close'}`, `keeper` is `{movement: 'hold', band: [...]}`, `kiter`
// is `{movement: 'orbit'}`, and `jumper` is any of them with a `hop` modifier —
// so the archetype stops being a property of the enemy and becomes a property of
// this one State, which is what lets a single enemy orbit here and close in
// Strike.
import { applyStateMovement } from '../enemyMovement.js';

export default {
  id: 'approach',

  update(enemy, ctx, machine) {
    const cfg = machine.configFor('approach') ?? {};
    applyStateMovement(enemy, { movement: 'close', ...cfg }, ctx.speedMultiplier, ctx.targetPos, ctx.deltaTime);
  },

  next(enemy, ctx, machine) {
    if (!enemy.target) return { id: 'search', cause: 'no target' };

    // Losing sight is the only thing that ends an approach besides arriving.
    // In the legacy ladder this is three different branches that disagree about
    // whether to go idle, halt, or keep the mark.
    if (!ctx.canSee) {
      return enemy.lastKnownPosition
        ? { id: 'search', cause: 'lost sight, have a mark' }
        : { id: 'withdraw', cause: 'lost sight, no mark' };
    }

    // In band and off cooldown — commit. Anticipate is skipped when undeclared,
    // which resolves straight to Strike and reproduces today's behavior for
    // every enemy that has not been re-authored.
    if (ctx.effectiveDistance <= enemy.attackRange && enemy.attackTimer <= 0) {
      return { id: 'anticipate', cause: 'in attack range, off cooldown' };
    }

    if (ctx.effectiveDistance > ctx.effectiveAggroRange && !enemy.enraged) {
      return { id: 'alert', cause: 'target left aggro range' };
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
