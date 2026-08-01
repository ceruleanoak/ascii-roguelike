// Recover — the window after a strike where the enemy is not yet dangerous again.
//
// Absent today. What looks like recovery in the legacy ladder is a fake: the
// melee back-off branch fires whenever the player is inside attack range *and*
// the cooldown is running, so it is a position correction, not a vulnerability
// window, and it never applies to ranged enemies at all.
//
// Making it a real State is also what makes the keeper's preferred-range band
// reachable. Today every keeper has `preferredRange < attackRange`, so the band
// is dead code — the enemy is always inside attack range when the band would
// apply, and falls into the attack branch instead. With Recover declared, a
// keeper on cooldown holds its band here rather than dropping to idle.
//
// Six named variants, selected by `variant` (default `'retreat'`, the shape
// this State always had before variants existed). `next()` is identical across
// all of them — wait for `duration`, then route by `canSee` — only the per-frame
// movement and enter/exit side effects differ.
import { applyStateMovement, moveStill } from '../enemyMovement.js';

const VARIANTS = {
  // A steady walk backward. Recover's original behavior, unchanged.
  retreat: {
    update(enemy, ctx, cfg) {
      applyStateMovement(enemy, { movement: 'back', speed: cfg.speed ?? 0.5 }, ctx.speedMultiplier, ctx.targetPos, ctx.deltaTime);
    },
  },

  // Holds position. What makes a keeper's preferred-range band reachable — it
  // sits in its band on cooldown instead of getting walked back out of it.
  stationary: {
    update(enemy) {
      moveStill(enemy);
    },
  },

  // A one-shot lunge away rather than a walk — reads as a flinch, not a
  // backpedal. `lungeBack` is `moveLunge` run in reverse (enemyMovement.js).
  jumpBack: {
    update(enemy, ctx, cfg) {
      applyStateMovement(enemy, { movement: 'lungeBack', speed: cfg.speed ?? 1 }, ctx.speedMultiplier, ctx.targetPos, ctx.deltaTime);
    },
  },

  // Self-recoil, no damage dealt. Deliberately does not go through
  // `PhysicsSystem.applyKnockback` / `knockbackTimer` — that path is the hard
  // `knocked` INTERRUPT reserved for *being hit* (EnemyStateMachine.js), and
  // routing a self-inflicted recoil through it would make Recover interruptible
  // by its own exit. Instead this mirrors the ambusher burst / JumpMechanic
  // shape: one direct velocity burst on enter, `targetVelocity` zeroed, and
  // `Enemy._blendVelocity`'s existing friction decays it every frame after —
  // `update` is deliberately empty.
  knockback: {
    enter(enemy, ctx, cfg) {
      const dx = enemy.position.x - ctx.targetPos.x;
      const dy = enemy.position.y - ctx.targetPos.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const speed = cfg.speed ?? enemy.speed * 2;
      enemy.velocity.vx = (dx / dist) * speed;
      enemy.velocity.vy = (dy / dist) * speed;
      enemy.targetVelocity.vx = 0;
      enemy.targetVelocity.vy = 0;
    },
    update() {},
  },

  // Roots the player for the duration. Reuses `grabbed`/`grabbedBy`
  // (Player.js), the pair GooHead's grab already drives — Player.js zeroes
  // acceleration and decays velocity while `grabbed`, but still allows
  // facing/attack input, which is exactly the "rooted, not disabled" feel this
  // variant wants. Unlike GooHead's grab this is a plain timer with no struggle
  // mechanic: `next()` releases it on schedule, and BossSystem's melee-escape
  // check is guarded to skip any `grabbedBy` that isn't a GooHead (see
  // BossSystem.js `_checkGrabEscape`).
  lockPlayer: {
    enter(enemy) {
      if (!enemy.target || enemy.target.grabbed) return;
      enemy.target.grabbed = true;
      enemy.target.grabbedBy = enemy;
    },
    update(enemy) {
      moveStill(enemy);
    },
    exit(enemy) {
      // Only the enemy that set the lock clears it — never steal a release
      // from whatever else (a GooHead) may hold the player right now.
      if (enemy.target && enemy.target.grabbedBy === enemy) {
        enemy.target.grabbed = false;
        enemy.target.grabbedBy = null;
      }
    },
  },

  // Vanishes for the duration — the one variant that inverts Recover's stated
  // purpose. Everywhere else Recover is a vulnerability window; here it is a
  // safety window, intentional for a "hit and vanish" archetype. Reuses the
  // rabbit Burrow's exact mechanism (GameAnimalMechanic.js): `plane = 1` is
  // already untargetable/unrendered everywhere via the PlaneSystem predicate,
  // so hiding needs no new plumbing. Freezes in place and reappears exactly
  // where it went in, same as Burrow.
  hide: {
    enter(enemy) {
      enemy.recoverHiding = true;
      enemy.plane = 1;
      moveStill(enemy);
    },
    update(enemy) {
      moveStill(enemy);
    },
    exit(enemy) {
      enemy.recoverHiding = false;
      enemy.plane = 0;
    },
  },
};

function variantFor(cfg) {
  // Unspecified means "always meant retreat" — every enemy authored before
  // variants existed. Specified-but-wrong falls back to stationary, matching
  // `applyStateMovement`'s own rule that a typo should freeze the enemy in
  // place and be visibly wrong, not silently resolve to a different behavior.
  const name = cfg.variant ?? 'retreat';
  return VARIANTS[name] ?? VARIANTS.stationary;
}

export default {
  id: 'recover',
  committed: false,

  enter(enemy, ctx, machine) {
    const cfg = machine.configFor('recover') ?? {};
    variantFor(cfg).enter?.(enemy, ctx, cfg);
  },

  update(enemy, ctx, machine) {
    const cfg = machine.configFor('recover') ?? {};
    variantFor(cfg).update?.(enemy, ctx, cfg);
  },

  exit(enemy, ctx, machine) {
    const cfg = machine.configFor('recover') ?? {};
    variantFor(cfg).exit?.(enemy, ctx, cfg);
  },

  next(enemy, ctx, machine) {
    const cfg = machine.configFor('recover') ?? {};
    if (machine.timer < (cfg.duration ?? 0)) return null;
    if (!ctx.canSee) {
      return enemy.lastKnownPosition
        ? { id: 'search', cause: 'lost sight while recovering' }
        : { id: 'alert', cause: 'lost sight while recovering, no mark' };
    }
    return { id: 'approach', cause: 'recovered' };
  },
};
