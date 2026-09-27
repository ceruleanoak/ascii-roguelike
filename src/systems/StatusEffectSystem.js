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
// Frozen — full immobilization the player struggles out of (struggleFrozen).

import { CHARACTER_TYPES } from '../data/characters.js';
import { createStatusEffects, applyStatusEffect, clearStatusEffect, tickStatusEffects } from './StatusEffects.js';

/** A fresh player `statusEffects` table (constructor and reset() share it — #256). */
export function createPlayerStatusSlots() {
  return createStatusEffects('player');
}

// Movement multiplier per freeze pip. Pip 1 is the old flat freeze slow;
// pip 3 is Frozen, so no movement at all.
const FREEZE_PIP_SPEED = [1, 0.5, 0.3, 0];

// Frozen outlasts every other player status, but each fresh key press chips
// time off it; a dodge-roll press chips much more, scaled by the character's
// `frozenRollChipMult` (red's roll is a body-slam — it breaks ice twice as hard).
const FROZEN = { duration: 5.0, mashChip: 0.15, rollChip: 0.6 };

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
    for (const { effect, damage } of tickStatusEffects(player, deltaTime)) {
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
      const burnDead = game.player.takeDamage(playerUpdateResult.burnDamage, { isBullet: false, element: 'burn' });
      if (burnDead === true) dotKilledPlayer = true;
    }
    if (playerUpdateResult?.poisonDamage) {
      const poisonDead = game.player.takeDamage(playerUpdateResult.poisonDamage, { isBullet: false, element: 'poison' });
      if (poisonDead === true) dotKilledPlayer = true;
    }
    return dotKilledPlayer;
  },

  /**
   * Apply through the shared core, then the player-only consequence: the
   * freeze track reaching pip 3 is Frozen — it lasts at least FROZEN.duration
   * and stops the player dead.
   */
  applyPlayerStatusEffect(player, effect, duration = 3.0, pips = null) {
    const wasFrozen = effect === 'freeze' && this.isPlayerFrozen(player);
    const slot = applyStatusEffect(player, effect, duration, pips);
    if (effect !== 'freeze' || !slot || wasFrozen || slot.stacks < 3) return;
    slot.duration = Math.max(slot.duration, FROZEN.duration);
    player.velocity.vx = 0;
    player.velocity.vy = 0;
  },

  isPlayerFrozen(player) {
    return player.statusEffects.freeze.stacks >= 3;
  },

  /** Movement multiplier from the freeze Pip track (1 when not chilled). */
  freezeSpeedMultiplier(player) {
    const freeze = player.statusEffects.freeze;
    return freeze.active ? FREEZE_PIP_SPEED[freeze.stacks] : 1;
  },

  /**
   * One struggle input while Frozen: `roll` is a dodge-roll press, anything
   * else a plain mash. Breaking out clears the whole freeze track, not just
   * the Frozen pip — the player has earned their feet back.
   */
  struggleFrozen(player, roll) {
    const freeze = player.statusEffects.freeze;
    if (freeze.stacks < 3) return;
    const rollMult = CHARACTER_TYPES[player.characterType]?.frozenRollChipMult ?? 1;
    freeze.duration -= roll ? FROZEN.rollChip * rollMult : FROZEN.mashChip;
    if (freeze.duration <= 0) clearStatusEffect(player, 'freeze');
  }
};
