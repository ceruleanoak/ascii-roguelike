// StatusEffectSystem — the player carrier layer over the shared Status
// Effect core (StatusEffects.js: one declaration table, apply, tick and clear
// for the player and enemies alike). What lives here is only what is
// player-specific: DoT ticks resolving through takeDamage (element immunity
// and i-frames live outside Player), Frozen and the struggle out of it, and
// the pip speed tables.
//
// Burn, poison and wet used to be loose Player fields with their own apply
// methods, beside a separate slot table for everything else — so a source
// written as applyStatusEffect('burn') silently did nothing (#166). They are
// ordinary slots now; `player.statusEffects` is the whole picture.
//
// Freeze is a Pip track (GLOSSARY: Pip, Frozen): pips 1–2 slow, pip 3 is
// Frozen — full immobilization the player struggles out of (struggleLock).
//
// Zap is the same shape on the electric side (GLOSSARY: Zap): pips 1–2 slow,
// pip 3 locks and disarms, and wet holds its timer. Stun locks and disarms
// outright. Frozen, zap pip 3 and stun are the three locks — each stops
// movement, attacks and rolls, and each is struggled out of the same way.

import { DEATH_CAUSES } from '../data/deathCauses.js';
import { CHARACTER_TYPES } from '../data/characters.js';
import { GRID } from '../game/GameConfig.js';
import {
  createStatusEffects, applyStatusEffect, tickStatusEffects,
  MAX_PIPS, ZAP_PIP_SPEED, FREEZE_PIP_SPEED
} from './StatusEffects.js';
import { activeInteriorFloor } from './PlaneSystem.js';

/** A fresh player `statusEffects` table (constructor and reset() share it — #256). */
export function createPlayerStatusSlots() {
  return createStatusEffects('player');
}

// Frozen outlasts every other player status, but each fresh key press chips
// time off it; a dodge-roll press chips much more, scaled by the character's
// `frozenRollChipMult` (red's roll is a body-slam — it breaks ice twice as hard).
const FROZEN = { duration: 5.0, mashChip: 0.15, rollChip: 0.6 };

// A held item knocked loose by a disarm lands this far away, in a random
// direction, and can't be picked back up for this long — the same shape as
// the Thief's snatch (ThiefMechanic), which disarms through here too.
const DISARM_DISTANCE = GRID.CELL_SIZE * 3;
const DISARM_PICKUP_DELAY_MS = 600;

const isZapLock = (player) => {
  const zap = player.statusEffects.zap;
  return zap.active && zap.stacks >= MAX_PIPS;
};

// Wet is also a Pip track: pip 1 is plain wet (the 6s wet slot),
// deep water fills `wetPips` on toward 3, and pip 3 drowns. Each pip is a
// heavier in-water slow — pip 1/2 are the old shallow/deep multipliers, and
// pip 3 takes the same step again.
const WET_PIP_SPEED = [1, 0.5, 0.3, 0.1];

/** Whole wet pips an entity (Player or Enemy) carries right now, 0–3. */
export function wetPipCount(entity) {
  return Math.max(entity.isWet?.() ? 1 : 0, Math.floor(entity.wetPips || 0));
}

/** In-water movement multiplier for `pips` wet pips (at least pip 1 in water). */
export function wetPipSpeed(pips) {
  return WET_PIP_SPEED[Math.min(3, Math.max(1, pips))];
}

export const StatusEffectSystem = {
  /**
   * Count the player's whole table down (Player.updateStatusEffects, once a
   * frame). Returns any DoT ticks that fired as { burnDamage, poisonDamage }
   * for applyPlayerDot, or null.
   */
  tickPlayer(player, deltaTime) {
    let burnDamage = null;
    let poisonDamage = null;
    // Wet holds zap's timer: as long as the player is wet, the charge stays.
    const hooks = { holdsTimer: (effect) => effect === 'zap' && player.isWet() };
    for (const { effect, damage } of tickStatusEffects(player, deltaTime, hooks)) {
      if (effect === 'burn') burnDamage = damage;
      else if (effect === 'poison') poisonDamage = damage;
    }
    return (burnDamage || poisonDamage) ? { burnDamage, poisonDamage } : null;
  },

  // Called from main.js right after Player.update() — turns any reported
  // ticks into real damage, respecting takeDamage's immunity/i-frame checks.
  applyPlayerDot(game, playerUpdateResult) {
    let dotKilledPlayer = false;
    if (playerUpdateResult?.burnDamage) {
      const burnDead = game.player.takeDamage(playerUpdateResult.burnDamage, { isBullet: false, element: 'burn', cause: DEATH_CAUSES.burn });
      if (burnDead === true) dotKilledPlayer = true;
    }
    if (playerUpdateResult?.poisonDamage) {
      const poisonDead = game.player.takeDamage(playerUpdateResult.poisonDamage, { isBullet: false, element: 'poison', cause: DEATH_CAUSES.poison });
      if (poisonDead === true) dotKilledPlayer = true;
    }
    return dotKilledPlayer;
  },

  /**
   * Apply through the shared core, then the player-only consequences of
   * entering a lock: it stops the player dead, Frozen lasts at least
   * FROZEN.duration, and a zap pip 3 or stun marks the held item to be
   * knocked loose (applyPlayerDisarm, next frame).
   */
  applyPlayerStatusEffect(player, effect, duration = 3.0, pips = null) {
    const wasLocked = this.isPlayerLocked(player);
    const slot = applyStatusEffect(player, effect, duration, pips);
    if (!slot) return;
    const locks = effect === 'stun'
      || (effect === 'zap' && slot.stacks >= MAX_PIPS)
      || (effect === 'freeze' && slot.stacks >= MAX_PIPS);
    if (!locks || wasLocked) return;
    if (effect === 'freeze') slot.duration = Math.max(slot.duration, FROZEN.duration);
    else slot.disarm = true;
    player.velocity.vx = 0;
    player.velocity.vy = 0;
  },

  isPlayerFrozen(player) {
    return player.statusEffects.freeze.stacks >= MAX_PIPS;
  },

  isPlayerZapped(player) {
    return isZapLock(player);
  },

  /** Frozen, zap pip 3, or stun: no moving, attacking or rolling. */
  isPlayerLocked(player) {
    return this.isPlayerFrozen(player) || isZapLock(player) || player.statusEffects.stun.active;
  },

  /**
   * The player's combined status movement multiplier: 0 while locked,
   * otherwise the strongest slow (goo, freeze pips, dizzy) or the slime
   * boost, scaled by zap pips 1–2.
   */
  playerSpeedMultiplier(player) {
    if (this.isPlayerLocked(player)) return 0;
    const fx = player.statusEffects;
    let m = 1;
    if (fx.goo.active) m = 1 - fx.goo.slowAmount;
    else if (fx.freeze.active) m = this.freezeSpeedMultiplier(player);
    else if (fx.slimeBoost.active) m = fx.slimeBoost.speedMult;
    else if (fx.dizzy.active) m = 0.35;
    if (fx.zap.active) m *= ZAP_PIP_SPEED[fx.zap.stacks];
    return m;
  },

  /** Movement multiplier from the freeze Pip track (1 when not chilled). */
  freezeSpeedMultiplier(player) {
    const freeze = player.statusEffects.freeze;
    return freeze.active ? FREEZE_PIP_SPEED[freeze.stacks] : 1;
  },

  /**
   * One struggle input while locked: `roll` is a dodge-roll press, anything
   * else a plain mash. Every lock holding the player is chipped. Breaking out
   * clears that whole track, not just its lock pip — the player has earned
   * their feet back. Struggle chips even while wet holds zap's timer, so
   * standing zapped in water is never a lock the player can't leave.
   */
  struggleLock(player, roll) {
    const rollMult = CHARACTER_TYPES[player.characterType]?.frozenRollChipMult ?? 1;
    const chip = roll ? FROZEN.rollChip * rollMult : FROZEN.mashChip;
    const held = [];
    if (this.isPlayerFrozen(player)) held.push('freeze');
    if (isZapLock(player)) held.push('zap');
    if (player.statusEffects.stun.active) held.push('stun');
    // Only chip the time; the tick expires the lock next frame. Freeze and
    // stun end there, while a zap drains to pip 2 like any other of its pips.
    for (const effect of held) player.statusEffects[effect].duration -= chip;
  },

  /**
   * Knock the held item loose if a zap/stun lock marked it (once a frame,
   * from CharacterSystem.updateDodge — the apply itself has no world to drop
   * into).
   */
  applyPlayerDisarm(game) {
    const fx = game.player.statusEffects;
    if (!fx.zap.disarm && !fx.stun.disarm) return;
    fx.zap.disarm = false;
    fx.stun.disarm = false;
    disarmPlayer(game);
  }
};

/**
 * Disarm: knock the player's held item out of their hand onto the ground
 * nearby, on the player's own plane. Returns the item, or null if the hand
 * was empty. Shared by the zap/stun lock and the Thief's snatch.
 */
export function disarmPlayer(game, pickupDelayMs = DISARM_PICKUP_DELAY_MS) {
  const player = game.player;
  const item = player.dropItem();
  if (!item) return null;
  const angle = Math.random() * Math.PI * 2;
  item.position.x = player.position.x + Math.cos(angle) * DISARM_DISTANCE;
  item.position.y = player.position.y + Math.sin(angle) * DISARM_DISTANCE;
  item.velocity = { vx: 0, vy: 0 };
  item.pickupReadyAt = performance.now() + pickupDelayMs;
  item.plane = player.plane ?? 0;
  item.hutPlane = activeInteriorFloor(game) !== null;
  item.mazePlane = player.inMaze === true;
  game.items.push(item);
  game.physicsSystem.addEntity(item);
  game.updateUI();
  return item;
}
