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
//            A parry and an attack never share the screen: the window only
//            opens while the holder is not attacking, any attack starting
//            (a Strike windup, a charge windup or dash) drops it, and a
//            charge waits for it to close (ChargeMechanic). Parry, then
//            windup with the guard down, then the jab.
//   Player — opens when a chasing enemy is within 1.5× THAT enemy's
//            attackRange (a player has no single reach of their own; the
//            threat's reach is the same distance read from the other side).
//            Resolved in PlayerDamageSystem.resolveGuard.
// A catch spends the window: the parry closes on the hit it turns aside and
// the cooldown starts, so a second swing straight after lands — a parry is
// never a wall the attacker can't brute-force through. A stun or knockback
// landing on the holder cancels a window winding up or open the same way
// (cancelParry, called from the status core and PhysicsSystem's knockback).
// No suspend signal — modifies holder state only.
//
// Held parry (`held: true`, the Phalanx): no timed cycle. The holder's own
// mechanic raises and lowers it (holdParry) — raising takes parryWindup, a
// stun or knockback still drops it and parryCooldown runs before it can be
// raised again. It faces the holder's `guardAngle` rather than the attacker,
// so its arc is a real front with a back behind it, and a catch does not
// spend it: a held guard turns every melee blow from the front aside, and
// is beaten by going around it, waiting for it to drop, or by any damage
// that is not a melee hit (projectiles, traps, magic, the Red Warrior's roll).
//
// Every caught blow, from either holder, plays the one parry sound
// (PARRY_SFX).

import { inSamePlane } from '../../systems/PlaneSystem.js';
import { PHYSICS } from '../../game/GameConfig.js';

// Fraction of a parried hit that reflectDamage sends back to the attacker.
export const PARRY_REFLECT_FRACTION = 0.5;

// Distance multiplier on attackRange that opens a parry window.
const PARRY_OPEN_RANGE_MULT = 1.5;

// The player's parry answers the blow it catches: the attacker takes one pip
// of stun (RIPOSTE_STUN real seconds) and is knocked away from the player.
const RIPOSTE_STUN = 1.0;
const RIPOSTE_STUN_PIPS = 1;

// The sound of any parry catching a blow — enemy, player or the Weapons
// Master's lesson.
export const PARRY_SFX = 'parry';

export function playParrySound(game) {
  game?.audioSystem?.playSFX?.(PARRY_SFX);
}

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

// Closes a window winding up or open and starts the cooldown. A holder
// already cooling down (or idle) is left as it is.
export function expendParry(holder, cfg) {
  if (!holder.parryActive && !holder.parryWindupActive) return;
  holder.parryActive = false;
  holder.parryWindupActive = false;
  holder.parryWindupTimer = 0;
  holder.parryTimer = 0;
  holder.parryCooldown = cfg?.parryCooldown ?? 0;
}

// Raises or lowers a held parry (cfg.held). Raising runs the parryWindup
// first; lowering is instant. A cooldown left by cancelParry (a stun or
// knockback) runs out before the guard can come back up.
export function holdParry(holder, cfg, raised, deltaTime) {
  if (holder.parryCooldown > 0) {
    holder.parryCooldown -= deltaTime;
    return;
  }
  if (!raised) {
    holder.parryActive = false;
    holder.parryWindupActive = false;
    holder.parryWindupTimer = 0;
    return;
  }
  if (holder.parryActive) return;
  if (!holder.parryWindupActive) {
    holder.parryWindupActive = true;
    holder.parryWindupTimer = cfg.parryWindup ?? 0;
  }
  holder.parryWindupTimer -= deltaTime;
  if (holder.parryWindupTimer <= 0) {
    holder.parryWindupActive = false;
    holder.parryActive = true;
  }
}

// Whether a held parry is up right now. A holder that cannot act (stunned,
// zapped, asleep, frozen, knocked back) skips the update that would lower
// it, so the guard reads the holder's condition directly instead.
export function isHeldParryUp(holder) {
  if (!holder.parryActive) return false;
  return !(holder.isStunned?.() || holder.isZapped?.() || holder.isFullyAsleep?.()
    || holder.sleepTimer > 0 || holder.isFrozen?.() || holder.isKnockedBack?.());
}

// A stun or knockback on any holder cancels its parry. Safe on entities that
// never parry (no window is ever open on them).
export function cancelParry(entity) {
  if (!entity?.parryActive && !entity?.parryWindupActive) return;
  expendParry(entity, entity.parryMechanic ?? entity.data?.parryMechanic);
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

// An enemy mid-attack: a Strike winding up or swinging, or a charge winding
// up or dashing. Its timed parry is down for all of it.
function isAttacking(enemy) {
  return enemy.state === 'windup' || enemy.state === 'attack'
    || enemy.chargeState === 'windup' || enemy.chargeState === 'charging';
}

export const ParryMechanic = {
  isEnabled(enemy) {
    return enemy.data.parryMechanic?.enabled === true;
  },

  init(enemy) {
    initParry(enemy);
    // The way a held parry faces (radians). Its holder's mechanic turns it.
    enemy.guardAngle = enemy.facingAngle ?? 0;
  },

  update(enemy, ctx) {
    const cfg = enemy.data.parryMechanic;
    if (!cfg?.enabled) return;
    // A held parry is raised and lowered by its holder's own mechanic
    // (holdParry), never by the timed cycle.
    if (cfg.held) return;
    const { deltaTime, distance } = ctx;
    if (isAttacking(enemy)) {
      expendParry(enemy, cfg);
      if (enemy.parryCooldown > 0) enemy.parryCooldown -= deltaTime;
      return;
    }
    tickParry(enemy, cfg, deltaTime, () =>
      enemy.state === 'chase' && !enemy.isStunned()
        && distance < enemy.attackRange * PARRY_OPEN_RANGE_MULT);
  },

  // An enemy holder faces its target, so its arc is measured toward `target`
  // — except a held parry, which faces its `guardAngle`.
  // Called for every melee-hit enemy, including data-less bosses (LakeBoss),
  // so `data` is optional here — no data means no parry. A catch spends the
  // window (expendParry) unless the parry is held: call it once per hit, as
  // the hit resolves.
  catches(enemy, attackerPos, target) {
    const cfg = enemy.data?.parryMechanic;
    if (!cfg) return false;
    let facing = null;
    if (cfg.held) {
      if (!isHeldParryUp(enemy)) return false;
      facing = { x: Math.cos(enemy.guardAngle), y: Math.sin(enemy.guardAngle) };
    } else if (target) {
      facing = { x: target.position.x - enemy.position.x, y: target.position.y - enemy.position.y };
    }
    if (!parryCatches(enemy, cfg, facing, attackerPos)) return false;
    if (!cfg.held) expendParry(enemy, cfg);
    playParrySound(enemy.game);
    return true;
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
    // A dizzy player can't parry: a window winding up or open when the
    // Dizzy lands closes (its cooldown, if any, keeps running), and none
    // opens until it wears off. catches() refuses too, for the frame between.
    if (player.isDizzy?.()) {
      player.parryWindupActive = false;
      player.parryActive = false;
      if (player.parryCooldown > 0) player.parryCooldown -= deltaTime;
      return;
    }
    tickParry(player, cfg, deltaTime, () => (enemies ?? []).some(e =>
      e.hp > 0 && e.state === 'chase' && inSamePlane(e, player)
        && Math.hypot(e.position.x - player.position.x, e.position.y - player.position.y)
           < (e.attackRange ?? 0) * PARRY_OPEN_RANGE_MULT));
  },

  // A catch spends the window (expendParry): call it once per hit.
  catches(player, attackerPos) {
    if (player.isDizzy?.()) return false;
    if (!parryCatches(player, player.parryMechanic, player.facing, attackerPos)) return false;
    expendParry(player, player.parryMechanic);
    return true;
  },

  // The answer to a caught blow: one pip of stun on the attacker, and a
  // knockback straight away from the player. Enemy status time runs at
  // ENEMY_TIMER_RATE, so the stun is scaled to last RIPOSTE_STUN real seconds.
  riposte(player, attacker) {
    // The attacker is a room enemy, which carries the game (wireRoomEnemies).
    playParrySound(attacker?.game);
    if (!attacker || attacker.hp <= 0) return;
    attacker.applyStatusEffect?.('stun', RIPOSTE_STUN * PHYSICS.ENEMY_TIMER_RATE, RIPOSTE_STUN_PIPS);
    attacker.game?.physicsSystem?.applyKnockback(
      attacker, player.position.x, player.position.y, PHYSICS.DEFAULT_DAMAGE_KNOCKBACK);
  }
};
