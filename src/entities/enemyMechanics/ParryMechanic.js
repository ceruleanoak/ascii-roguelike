// Parry: a cooldown-gated counter window, shared by enemies (Duelist,
// data.parryMechanic) and the player (Buckler armor, armor.parryMechanic).
// One config shape, one cycle, one catch rule — the holder only decides what
// opens the window:
//   windup (parryWindup) → active (parryDuration) → cooldown (parryCooldown)
// While parryActive, a melee hit from within parryArcDegrees of the holder's
// facing is turned aside: reflectDamage sends half of it back to the
// attacker, counterAttack swings back (enemy holders only — CombatSystem).
//   Enemy  — opens when the player is within 1.5× its attackRange during
//            chase. Faces its target, so the arc always covers the player.
//   Player — opens when a chasing enemy is within 1.5× THAT enemy's
//            attackRange (a player has no single reach of their own; the
//            threat's reach is the same distance read from the other side).
//            Resolved in PlayerDamageSystem.resolveGuard.
// No suspend signal — modifies holder state only.

import { inSamePlane } from '../../systems/PlaneSystem.js';

// Fraction of a parried hit that reflectDamage sends back to the attacker.
export const PARRY_REFLECT_FRACTION = 0.5;

// Distance multiplier on attackRange that opens a parry window.
const PARRY_OPEN_RANGE_MULT = 1.5;

export function initParry(holder) {
  holder.parryActive = false;
  holder.parryTimer = 0;
  holder.parryCooldown = 0;
  holder.parryWindupTimer = 0;
  holder.parryWindupActive = false;
}

// Advances the windup → active → cooldown cycle. `shouldOpen` is only
// consulted when the cycle is idle (not winding up, active, or cooling down).
export function tickParry(holder, cfg, deltaTime, shouldOpen) {
  if (holder.parryWindupActive) {
    holder.parryWindupTimer -= deltaTime;
    if (holder.parryWindupTimer <= 0) {
      holder.parryWindupActive = false;
      holder.parryActive = true;
      holder.parryTimer = cfg.parryDuration;
    }
  } else if (holder.parryActive) {
    holder.parryTimer -= deltaTime;
    if (holder.parryTimer <= 0) {
      holder.parryActive = false;
      holder.parryCooldown = cfg.parryCooldown;
    }
  } else if (holder.parryCooldown > 0) {
    holder.parryCooldown -= deltaTime;
  } else if (shouldOpen()) {
    holder.parryWindupActive = true;
    holder.parryWindupTimer = cfg.parryWindup;
  }
}

// True when an active parry catches a hit coming from `attackerPos`.
// `facing` is the holder's facing vector; arcs of 360 (or missing) cover all
// directions, as does a zero-length facing or a coincident attacker.
export function parryCatches(holder, cfg, facing, attackerPos) {
  if (!holder.parryActive) return false;
  const arc = cfg.parryArcDegrees ?? 360;
  if (arc >= 360 || !attackerPos) return true;
  const fx = facing?.x ?? 0, fy = facing?.y ?? 0;
  const dx = attackerPos.x - holder.position.x;
  const dy = attackerPos.y - holder.position.y;
  const flen = Math.hypot(fx, fy), dlen = Math.hypot(dx, dy);
  if (flen === 0 || dlen === 0) return true;
  const cos = (fx * dx + fy * dy) / (flen * dlen);
  return cos >= Math.cos((arc / 2) * Math.PI / 180);
}

export const ParryMechanic = {
  isEnabled(enemy) {
    return enemy.data.parryMechanic?.enabled === true;
  },

  init(enemy) {
    initParry(enemy);
  },

  update(enemy, ctx) {
    const cfg = enemy.data.parryMechanic;
    if (!cfg?.enabled) return;
    const { deltaTime, distance } = ctx;
    tickParry(enemy, cfg, deltaTime, () =>
      enemy.state === 'chase' && !enemy.isStunned()
        && distance < enemy.attackRange * PARRY_OPEN_RANGE_MULT);
  },

  // An enemy holder faces its target, so its arc is measured toward `target`.
  // Called for every melee-hit enemy, including data-less bosses (LakeBoss),
  // so `data` is optional here — no data means no parry.
  catches(enemy, attackerPos, target) {
    const cfg = enemy.data?.parryMechanic;
    if (!cfg) return false;
    const facing = target
      ? { x: target.position.x - enemy.position.x, y: target.position.y - enemy.position.y }
      : null;
    return parryCatches(enemy, cfg, facing, attackerPos);
  }
};

// Player holder (Buckler). The cycle ticks from Game.updatePlayerMechanics
// in every state; with no enemies (REST) it simply never opens.
export const PlayerParry = {
  update(player, enemies, deltaTime) {
    const cfg = player.parryMechanic;
    if (!cfg?.enabled) {
      if (player.parryActive || player.parryWindupActive) initParry(player);
      return;
    }
    tickParry(player, cfg, deltaTime, () => (enemies ?? []).some(e =>
      e.hp > 0 && e.state === 'chase' && inSamePlane(e, player)
        && Math.hypot(e.position.x - player.position.x, e.position.y - player.position.y)
           < (e.attackRange ?? 0) * PARRY_OPEN_RANGE_MULT));
  },

  catches(player, attackerPos) {
    return parryCatches(player, player.parryMechanic, player.facing, attackerPos);
  }
};
