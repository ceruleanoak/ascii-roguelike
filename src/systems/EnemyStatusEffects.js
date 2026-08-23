// EnemyStatusEffects — the write side of an enemy's statusEffects: applying
// a fresh hit (activation + generic stack increment) and ticking active
// effects down each frame (DOT damage, expiry, stack/order reset). Split out
// of Enemy.js to keep that file under its architecture budget. The read side
// (blink color, stack pips) lives in the sibling StatusEffectVisuals.js.
// (Named distinctly from systems/StatusEffectSystem.js, which is the
// unrelated player-side DOT ticker — enemies and the player track status
// effects through entirely separate mechanisms.)
//
// Every export takes the owning `enemy` as its first argument, matching the
// ElectricConduction.js/AcidWaterSpread.js pattern — Enemy.js keeps thin
// delegating methods (applyStatusEffect/updateStatusEffects) so every
// existing `enemy.applyStatusEffect(...)` call site across the codebase is
// unaffected.

const MAX_STACKUP = 3; // shared cap for every stackable effect (see Enemy.js's own copy/comment)
const POISON_DECAY_INTERVAL = 3.0; // seconds bought back per stack lost during poison's step-down expiry

// Applies `effect` to `enemy` for `duration`, activating it if it wasn't
// already and — for any of the 10 blink-capable effects (those with a
// `stacks` field) — incrementing a generic stack counter regardless of which
// weapon/oil/source triggered it, capped at MAX_STACKUP. Poison additionally
// recomputes its DOT tick rate from the new stack count; sleep's tier
// behavior (mild slow/severe slow/full sleep) is read elsewhere
// (Enemy.getSpeedMultiplier/isFullyAsleep) rather than computed here.
export function applyStatusEffect(enemy, effect, duration = 3.0) {
  const status = enemy.statusEffects[effect];
  if (!status) return;

  const wasActive = status.active;
  status.active = true;
  if (status.tickTimer !== undefined) {
    status.tickTimer = status.tickRate;
  }

  if (status.stacks !== undefined) {
    status.stacks = Math.min(MAX_STACKUP, status.stacks + 1);
    if (effect === 'poison') {
      status.tickRate = 3.0 / status.stacks;
    }
    if (!wasActive) {
      enemy.effectApplicationOrder.push(effect);
    }
  }

  // Sleep's duration scales with stack count so reaching tier 3 (full sleep)
  // is worth meaningfully more than one hit's worth of time — otherwise
  // Math.max below just keeps the last hit's flat duration and full sleep
  // (the 3-hit payoff) barely outlasts a single stack. Every other effect
  // keeps the plain Math.max behavior (last-hit-wins, not additive).
  const effectiveDuration = (effect === 'sleep' && status.stacks)
    ? duration * status.stacks
    : duration;
  status.duration = Math.max(status.duration, effectiveDuration);

  // Electric shock jolts carried items loose. 'zap' is the electric effect;
  // 'stun' kept for legacy stun-source parity (this hook predates zap).
  if ((effect === 'stun' || effect === 'zap') && enemy.itemUsage && enemy.inventory.length > 0) {
    enemy.shouldDropItems = true;
  }
}

// Removes an effect from the round-robin blink/pip order. Called on every
// expiry path below; StatusEffectVisuals also live-filters by `.active` as
// a defensive backstop against any bypass that flips `.active` directly
// without going through here (e.g. PhysicsSystem.js's water-extinguishes-burn).
export function clearEffectOrder(enemy, effect) {
  const idx = enemy.effectApplicationOrder.indexOf(effect);
  if (idx !== -1) enemy.effectApplicationOrder.splice(idx, 1);
}

// Ticks every status effect down by deltaTime: DOT damage/expiry for
// burn/poison, freeze's frozen/shuddering sub-states, stun/zap/sleep/charm/
// wet/dizzy/goo expiry, and knockback/blind (no stacks, no order tracking).
// Returns DOT damage events for the caller to spawn damage numbers from.
export function updateStatusEffects(enemy, deltaTime) {
  const damageEvents = []; // Track DOT damage for damage numbers

  // DoT effects: burn, poison
  for (const effect of ['burn', 'poison']) {
    const status = enemy.statusEffects[effect];
    if (!status.active) continue;

    status.duration -= deltaTime;
    status.tickTimer -= deltaTime;

    if (status.tickTimer <= 0) {
      // Apply DoT damage (bypasses invulnerability, minimum 1)
      const actualDamage = Math.max(1, Math.ceil(status.damage));
      enemy.hp -= actualDamage;
      if (enemy.hp < 0) enemy.hp = 0;
      status.tickTimer = status.tickRate;

      // Record damage event for damage number
      damageEvents.push({
        damage: actualDamage,
        effect: effect
      });
    }

    if (status.duration <= 0) {
      // Poison declines one stack at a time instead of the whole effect
      // falling off in one shot: each stack's expiry buys another decay
      // window at the new, weaker tier (tickRate already scales with
      // stacks, so the DOT visibly slows as it winds down). Burn and every
      // other DOT-style effect keep the original all-at-once cliff.
      if (effect === 'poison' && status.stacks > 1) {
        status.stacks -= 1;
        status.tickRate = 3.0 / status.stacks;
        status.duration = POISON_DECAY_INTERVAL;
      } else {
        status.active = false;
        status.duration = 0;
        status.stacks = 0;
        clearEffectOrder(enemy, effect);
        if (effect === 'poison') enemy.poisonStackCount = 0;
      }
    }
  }

  // Freeze effect (slow or full immobilization)
  const freeze = enemy.statusEffects.freeze;
  if (freeze.active) {
    // Permanent freeze (slime-type enemies): don't tick down
    if (!(freeze.frozen && enemy.data.freezePermanent)) {
      freeze.duration -= deltaTime;
    }
    // Shudder phase: last 0.6s before breaking free from full freeze
    if (freeze.frozen && !enemy.data.freezePermanent && freeze.duration < 0.6) {
      freeze.shuddering = true;
    }
    if (freeze.duration <= 0) {
      freeze.active = false;
      freeze.duration = 0;
      freeze.slowAmount = 0.5;
      freeze.frozen = false;
      freeze.shuddering = false;
      freeze.stacks = 0;
      clearEffectOrder(enemy, 'freeze');
    }
  }

  // Stun + Zap (both disable movement and attacks; zap is the electric-affinity variant
  // with a rapid-shake visual). Tick down identically.
  for (const key of ['stun', 'zap']) {
    const s = enemy.statusEffects[key];
    if (s.active) {
      s.duration -= deltaTime;
      if (s.duration <= 0) {
        s.active = false;
        s.duration = 0;
        s.stacks = 0;
        clearEffectOrder(enemy, key);
      }
    }
  }

  // Sleep effect (like stun but breaks on damage). Tier (mild slow/severe
  // slow/full sleep) is derived live from sleep.stacks — see
  // getSpeedMultiplier and isFullyAsleep — not tracked as separate state.
  const sleep = enemy.statusEffects.sleep;
  if (sleep.active) {
    sleep.duration -= deltaTime;
    if (sleep.duration <= 0) {
      sleep.active = false;
      sleep.duration = 0;
      sleep.stacks = 0;
      clearEffectOrder(enemy, 'sleep');
    }
  }

  // Charm effect (enemy redirects to fight other enemies)
  const charm = enemy.statusEffects.charm;
  if (charm.active) {
    charm.duration -= deltaTime;
    if (charm.duration <= 0) {
      charm.active = false;
      charm.duration = 0;
      charm.stacks = 0;
      clearEffectOrder(enemy, 'charm');
    }
  }

  // Wet (vulnerability modifier - not a DoT)
  const wet = enemy.statusEffects.wet;
  if (wet.active) {
    wet.duration -= deltaTime;
    if (wet.duration <= 0) {
      wet.active = false;
      wet.duration = 0;
      wet.stacks = 0;
      clearEffectOrder(enemy, 'wet');
    }
  }

  // Knockback effect (prevents AI from overriding velocity)
  const knockback = enemy.statusEffects.knockback;
  if (knockback.active) {
    knockback.duration -= deltaTime;
    if (knockback.duration <= 0) {
      knockback.active = false;
      knockback.duration = 0;
    }
  }

  // Blind effect (prevents attacks)
  const blind = enemy.statusEffects.blind;
  if (blind.active) {
    blind.duration -= deltaTime;
    if (blind.duration <= 0) {
      blind.active = false;
      blind.duration = 0;
    }
  }

  const dizzy = enemy.statusEffects.dizzy;
  if (dizzy.active) {
    dizzy.duration -= deltaTime;
    if (dizzy.duration <= 0) {
      dizzy.active = false;
      dizzy.duration = 0;
      dizzy.stacks = 0;
      clearEffectOrder(enemy, 'dizzy');
    }
  }

  const goo = enemy.statusEffects.goo;
  if (goo.active) {
    goo.duration -= deltaTime;
    if (goo.duration <= 0) {
      goo.active = false;
      goo.duration = 0;
      goo.stacks = 0;
      clearEffectOrder(enemy, 'goo');
    }
  }

  return damageEvents;
}
