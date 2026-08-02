import { GRID } from '../../game/GameConfig.js';

// Bomb's growth/detonation lifecycle: a Flee-type enemy that swells through
// four discrete stages (0-3) — one per successful lookback (see flee.js's
// `fleeLookbackFired`/`fleeReachedBarrier`) or interrupted attack-attempt —
// then permanently flips from prey to predator once fully grown, closes to
// melee, and detonates after a brief blink telegraph.
//
// One file, four entry points (LeapAttackMechanic's shape, not a two-file
// split — this is one continuous lifecycle, not two handed-off concerns):
//   - onDamaged(): reactive to being hit — starts or cancels a growth attempt.
//   - updateGrowth(): reactive to a lookback edge — also starts an attempt,
//     and advances one already in progress. Never suspends; the Bomb keeps
//     fleeing/moving normally while waggling.
//   - tryDetonateTrigger(): once fully grown (permanent chaser), arms the
//     blink countdown on proximity. Suspends.
//   - updateBlink(): advances an armed countdown to detonation. Suspends.
//
// Data contract (enemies.js): ripenMechanic: { enabled, growDuration,
// waggleAngle, waggleCycles, growthScales, blinkDelay, detonateRange,
// detonateDamage, shockwaveMaxRadius, shockwaveSpeed, shockwaveDamage,
// shockwaveKnockback }. Timers are double-seconds, matching every other
// Enemy.js/Mechanic timer (PHYSICS.ENEMY_TIMER_RATE).
//
// Growth stage 0-3 is monotonic — once locked in, an interrupt only cancels
// the *current attempt*, never regresses a stage already banked. The archetype
// flip at stage 3 retroactively declares `approach`/`search` on
// `stateMachine.declared` (the same idiom Enemy.js's equipWeapon() uses once
// for `declared.recover`) and forces `enraged` — both required together, or
// the Flee wildcard's fallback chain and approach.js's disengage guard would
// each independently pull the enemy back into fleeing the moment it next
// loses sight of its target.
export const RipenMechanic = {
  isEnabled(enemy) {
    return enemy.data.ripenMechanic?.enabled === true;
  },

  init(enemy) {
    enemy.ripenGrowth = 0;      // 0-3, permanent — never decreases
    enemy.ripenGrowing = false; // an attempt (waggle+expand) is in progress
    enemy.ripenGrowTimer = 0;
    enemy.ripenPrimed = false;  // fully grown AND in blink countdown
    enemy.ripenBlinkTimer = 0;
  },

  // Called from Enemy.js takeDamage(), inside the `hp > 0` block, right
  // after GooSpewMechanic.onDamaged(this, amount).
  onDamaged(enemy) {
    const cfg = enemy.data.ripenMechanic;
    if (!cfg?.enabled) return;
    if (enemy.ripenPrimed) return;       // committed to detonating — a hit doesn't stop it
    if (enemy.ripenGrowth >= 3) return;  // already a chaser; growth path is inert

    if (enemy.ripenGrowing) {
      // Interrupt: deflate without animation, back to the last locked size.
      // Cuts the in-progress ripen SFX rather than letting it play out over
      // a windup that no longer exists.
      enemy.ripenGrowing = false;
      enemy.ripenGrowTimer = 0;
      enemy.game?.audioSystem?.stopSFXByName('bomb_ripen');
    } else {
      // Being attacked also attempts a growth — same windup a lookback starts.
      enemy.ripenGrowing = true;
      enemy.ripenGrowTimer = 0;
      enemy.game?.audioSystem?.playStoppableSFX('bomb_ripen');
    }
  },

  // Called after stateMachine.update(), alongside TrapLayerMechanic.update()
  // — by then flee.js has already set fleeLookbackFired/fleeReachedBarrier
  // for this frame. Never suspends.
  updateGrowth(enemy, ctx) {
    const cfg = enemy.data.ripenMechanic;
    if (!cfg?.enabled || enemy.ripenGrowth >= 3) return;

    // Lookback success: the player currently can't see the Bomb
    // (fleeReachedBarrier) on the exact frame a lookback just fired
    // (fleeLookbackFired, a one-frame edge). Only starts an attempt if
    // nothing is already in progress; a lookback landing mid-attempt
    // doesn't restart it.
    if (enemy.fleeLookbackFired && enemy.fleeReachedBarrier && !enemy.ripenGrowing) {
      enemy.ripenGrowing = true;
      enemy.ripenGrowTimer = 0;
      enemy.game?.audioSystem?.playStoppableSFX('bomb_ripen');
    }

    if (!enemy.ripenGrowing) return;

    enemy.ripenGrowTimer += ctx.deltaTime;
    const duration = cfg.growDuration ?? 3.0;
    if (enemy.ripenGrowTimer < duration) return;

    enemy.ripenGrowing = false;
    enemy.ripenGrowTimer = 0;
    enemy.ripenGrowth = Math.min(enemy.ripenGrowth + 1, 3);

    if (enemy.ripenGrowth >= 3) {
      // Archetype flip: permanent chaser. `enraged` bypasses approach.js's
      // disengage-on-distance guard; declaring approach/search (rather than
      // just transitioning) is required — a bare transition() call would
      // resolve('approach') straight back to 'flee' via FALLBACK, since
      // declared.approach doesn't exist yet, and silently no-op.
      enemy.enraged = true;
      if (!enemy.stateMachine.has('approach')) enemy.stateMachine.declared.approach = {};
      if (!enemy.stateMachine.has('search')) enemy.stateMachine.declared.search = {};
      enemy.stateMachine.transition(enemy, ctx, 'approach', 'ripen fully grown — turning to chase');
    }
  },

  // Called after effectiveDistance is computed, alongside
  // LeapAttackMechanic.tryTrigger.
  tryDetonateTrigger(enemy, ctx) {
    const cfg = enemy.data.ripenMechanic;
    if (!cfg?.enabled) return;
    if (enemy.ripenGrowth < 3 || enemy.ripenPrimed) return;

    const { effectiveDistance, dotDamageEvents } = ctx;
    if (effectiveDistance <= cfg.detonateRange) {
      enemy.ripenPrimed = true;
      enemy.ripenBlinkTimer = cfg.blinkDelay ?? 1.0;
      enemy.velocity.vx = 0;
      enemy.velocity.vy = 0;
      if (enemy.targetVelocity) { enemy.targetVelocity.vx = 0; enemy.targetVelocity.vy = 0; }
      return { suspend: true, result: { dotDamage: dotDamageEvents } };
    }
  },

  // Called early, alongside RiseAgainMechanic.update.
  updateBlink(enemy, ctx) {
    const cfg = enemy.data.ripenMechanic;
    if (!cfg?.enabled || !enemy.ripenPrimed) return;
    const { deltaTime, dotDamageEvents } = ctx;

    enemy.velocity.vx = 0;
    enemy.velocity.vy = 0;
    if (enemy.targetVelocity) { enemy.targetVelocity.vx = 0; enemy.targetVelocity.vy = 0; }
    enemy.ripenBlinkTimer -= deltaTime;
    if (enemy.ripenBlinkTimer > 0) {
      return { suspend: true, result: { dotDamage: dotDamageEvents } };
    }

    const cx = enemy.position.x + GRID.CELL_SIZE / 2;
    const cy = enemy.position.y + GRID.CELL_SIZE / 2;
    // Self-kill, same idiom as ReformMechanic's direct enemy.hp = 0. Setting
    // it here — before EnemyUpdateSystem's dead-enemy removal loop and
    // WorldEffectsSystem's shockwave sweep both run later this same frame —
    // is what excludes the Bomb from its own blast: it's already spliced out
    // of currentRoom.enemies by the time the shockwave sweeps for targets.
    enemy.hp = 0;
    return {
      suspend: true,
      result: {
        dotDamage: dotDamageEvents,
        shouldExplode: true,
        explodeData: { x: cx, y: cy, plane: enemy.plane ?? 0, cfg }
      }
    };
  }
};
