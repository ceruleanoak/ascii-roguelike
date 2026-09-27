// EnemyStatusEffects — the enemy carrier layer over the shared Status
// Effect core (StatusEffects.js, which owns the declaration table, apply,
// tick and clear for the player and enemies alike). What lives here is only
// what is enemy-specific: DoT ticks landing straight on hp, freeze's frozen/
// shudder sub-states, and the stun/zap jolt that knocks carried items loose.
// The read side (blink color, stack pips) lives in StatusEffectVisuals.js;
// the player's carrier layer is StatusEffectSystem.js.
//
// Every export takes the owning `enemy` as its first argument, matching the
// ElectricConduction.js/AcidWaterSpread.js pattern — Enemy.js keeps thin
// delegating methods (applyStatusEffect/updateStatusEffects) so every
// existing `enemy.applyStatusEffect(...)` call site across the codebase is
// unaffected.

import {
  applyStatusEffect as applySharedStatusEffect,
  tickStatusEffects,
  clearEffectOrder
} from './StatusEffects.js';

// Re-exported so existing imports keep working; it lives in the shared core.
export { clearEffectOrder };

// Applies `effect` through the shared core (activation, pip, duration), then
// the enemy-only consequence: electric shock jolts carried items loose.
// 'zap' is the electric effect; 'stun' kept for legacy stun-source parity
// (this hook predates zap).
export function applyStatusEffect(enemy, effect, duration = 3.0, pips = null) {
  if (!applySharedStatusEffect(enemy, effect, duration, pips)) return;
  if ((effect === 'stun' || effect === 'zap') && enemy.itemUsage && enemy.inventory.length > 0) {
    enemy.shouldDropItems = true;
  }
}

// Scatters an enemy's carried inventory after a stun/zap jolt or a whip
// disarm knocks it loose (both set enemy.shouldDropItems — see
// applyStatusEffect above and CombatSystem's disarm branch). Whip disarm
// additionally flags enemy._disarmed, which this reads to scatter much
// harder and lock out retrieval for a beat: without that distinction the
// enemy stands exactly where the weapon lands and the plain jolt's gentle
// scatter (speed 50-100) barely clears melee range, so it was re-equipping
// almost the instant the weapon hit the ground.
export function getStunDroppedItems(enemy) {
  if (!enemy.shouldDropItems) return [];
  enemy.shouldDropItems = false;

  const disarmed = enemy._disarmed;
  enemy._disarmed = false;
  const minSpeed = disarmed ? 140 : 50;
  const speedRange = disarmed ? 110 : 50;

  const drops = [];
  for (const item of enemy.inventory) {
    item.position.x = enemy.position.x;
    item.position.y = enemy.position.y;
    // Add some velocity to scatter items
    const angle = Math.random() * Math.PI * 2;
    const speed = minSpeed + Math.random() * speedRange;
    item.velocity = {
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed
    };
    drops.push(item);
  }

  enemy.inventory = [];
  enemy.equippedWeapon = null;
  if (disarmed) enemy.itemPickupCooldown = Math.max(enemy.itemPickupCooldown, 1.5);
  enemy.attackType = enemy.data.attackType || 'melee'; // Revert to original attack type
  // Restore original movement archetype (we may have swapped to chaser when
  // equipping a melee weapon).
  if (enemy.data.movementStyle) enemy.movementStyle = enemy.data.movementStyle;
  // Restore native speed (melee equip applied a +30% boost).
  if (enemy._baseSpeed !== undefined) enemy.speed = enemy._baseSpeed;

  return drops;
}

// Combined movement-speed multiplier from every slowing/halting effect
// currently on the enemy — freeze/gooey/dizzy/sleep tiers, rally-boost
// speedup, and gas-attack slow stacks. Split out of Enemy.js (getSpeedMultiplier) to
// keep that file under its architecture budget; stun/zap/knockback/frozen's
// hard-zero cases stay in Enemy.js since they're plain early-return guards
// on the caller's own state, not part of this stacking multiplier.
export function computeSpeedMultiplier(enemy) {
  let m = 1;
  if (enemy.statusEffects.freeze.active) m = 1 - enemy.statusEffects.freeze.slowAmount;
  else if (enemy.isGooey()) m = 1 - enemy.statusEffects.goo.slowAmount;
  else if (enemy.isDizzy()) m = 0.35;
  // Drowse tiers 1-2 slow instead of halting (tier 3 already returns 0 via
  // isFullyAsleep() short-circuiting the AI before this is even called).
  else if (enemy.isSleeping()) m = enemy.statusEffects.sleep.stacks >= 2 ? 0.25 : 0.6;
  // Rally boost: scale chase target velocity so _blendVelocity converges cleanly.
  // (Earlier impl multiplied raw velocity post-blend, which compounded each frame
  // against any large velocity impulse — e.g. the melee leap — into a runaway.)
  if (enemy.rallyBoostTimer > 0) m *= (enemy._rallyBoostMultiplier ?? 1.3);
  if (enemy.gaSlowStacks) m *= Math.max(0.25, 1 - enemy.gaSlowStacks * 0.1);
  return m;
}

// Ticks every status effect down through the shared core. The enemy-only
// parts ride on its hooks: a permanently frozen slime never thaws, a thawing
// enemy shudders for its last 0.6s, and poison running fully out resets the
// Venom Blade counter. DoT ticks bypass invulnerability (minimum 1) and are
// returned for the caller to spawn damage numbers from.
export function updateStatusEffects(enemy, deltaTime) {
  const permanentFreeze = !!enemy.data?.freezePermanent;
  const ticks = tickStatusEffects(enemy, deltaTime, {
    holdsTimer: (effect, slot) => effect === 'freeze' && slot.frozen && permanentFreeze,
    afterCountdown: (effect, slot) => {
      if (effect === 'freeze' && slot.frozen && !permanentFreeze && slot.duration < 0.6) slot.shuddering = true;
    },
    onExpire: (effect) => {
      if (effect === 'poison') enemy.poisonStackCount = 0;
    }
  });

  const damageEvents = [];
  for (const { effect, damage } of ticks) {
    const actualDamage = Math.max(1, Math.ceil(damage));
    enemy.hp = Math.max(0, enemy.hp - actualDamage);
    damageEvents.push({ damage: actualDamage, effect });
  }
  return damageEvents;
}
