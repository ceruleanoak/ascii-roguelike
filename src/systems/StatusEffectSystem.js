// StatusEffectSystem — player damage-over-time ticking + resolution (burn,
// poison), plus the timed status slots (`player.statusEffects`).
//
// The DoT half: Player still owns the burn/poison fields/timers themselves
// (burnDuration/poisonDuration/etc, applyBurn/applyPoison, isBurning/
// isPoisoned) — those are read/written directly by FireSystem,
// PhysicsSystem, ConsumableTriggerSystem and CombatSystem elsewhere, so
// moving the fields themselves would mean chasing every one of those call
// sites. This system only owns the per-frame ticking of those fields and
// turning a fired tick into an actual takeDamage() call — the one thing the
// tick itself can't do, since damage resolution needs the game's
// element-immunity and i-frame machinery that lives outside Player.
//
// The slot half: the `statusEffects` table used to be written out by hand in
// three places inside Player — the constructor, `reset()`, and one countdown
// block per slot in `updateStatusEffects` — with `applyStatusEffect`
// validating against whichever copy happened to be live. That is how #256
// happened: `reset()` was missing `dizzy`, and `isDizzy()` reads
// `.dizzy.active` unguarded, so a reset issued from inside REST crashed the
// next frame. PLAYER_STATUS_SLOTS below is now the single declaration; adding
// a slot is one entry, and no copy can fall behind another.
//
// Freeze is a Pip track (GLOSSARY: Pip, Frozen): pips 1–2 slow, pip 3 is
// Frozen — full immobilization the player struggles out of (struggleFrozen).

import { CHARACTER_TYPES } from '../data/characters.js';

// Every timed status the player can carry, and the constants each slot hands
// to its readers. Burn and poison are deliberately absent — they are DoTs
// with their own duration fields above, not slots. `slow` has no player
// representation at all (see #166).
const PLAYER_STATUS_SLOTS = {
  goo: { slowAmount: 0.8 },        // heavy slow + prevents dodge roll
  freeze: { pips: 0 },             // Pip track — see FREEZE_PIP_SPEED / FROZEN below
  slimeBoost: { speedMult: 2.0 },  // slime puddle while wearing the slime suit; matches the slime enemy's 2x
  dizzy: {}
};

// The immunity flag, if any, that refuses a slot outright.
const SLOT_IMMUNITY = { goo: 'slimeImmune', freeze: 'freezeImmune' };

// Movement multiplier per freeze pip. Pip 1 is the old flat freeze slow;
// pip 3 is Frozen, so no movement at all.
const FREEZE_PIP_SPEED = [1, 0.5, 0.3, 0];

// Frozen outlasts every other player status, but each fresh key press chips
// time off it; a dodge-roll press chips much more, scaled by the character's
// `frozenRollChipMult` (red's roll is a body-slam — it breaks ice twice as hard).
const FROZEN = { duration: 5.0, mashChip: 0.15, rollChip: 0.6 };

// Wet is also a Pip track: pip 1 is plain wet (the 6s wetDuration timer),
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

// One console.error per unknown effect name, not one per frame.
const unsupportedEffectWarned = new Set();

/**
 * A fresh `statusEffects` table. The constructor and `reset()` both build the
 * player's slots from here, so they cannot diverge (#256).
 */
export function createPlayerStatusSlots() {
  const slots = {};
  for (const [name, constants] of Object.entries(PLAYER_STATUS_SLOTS)) {
    slots[name] = { active: false, duration: 0, ...constants };
  }
  return slots;
}
export const StatusEffectSystem = {
  // Called from Player.update() each frame — mutates the player's own
  // timers directly and returns any ticks that fired this frame.
  tickPlayerDot(player, deltaTime) {
    let burnDamage = null;
    if (player.burnDuration > 0) {
      player.burnDuration -= deltaTime;
      player.burnTickTimer -= deltaTime;
      if (player.burnTickTimer <= 0) {
        player.burnTickTimer = player.burnTickRate;
        burnDamage = player.burnDamage;
      }
    } else {
      player.burnTickTimer = 0;
    }

    let poisonDamage = null;
    if (player.poisonDuration > 0) {
      player.poisonDuration -= deltaTime;
      player.poisonTickTimer -= deltaTime;
      if (player.poisonTickTimer <= 0) {
        player.poisonTickTimer = player.poisonTickRate;
        poisonDamage = player.poisonDamage;
      }
    } else {
      player.poisonTickTimer = 0;
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
   * Start (or extend) one timed slot. Loud on an unsupported name (#166):
   * `pips` (freeze only) raises the track to at least that level — the shape
   * for per-frame refreshers (ice puddle) and all-at-once hits (freeze trap).
   * Without it a pip-tracked slot gains one pip per application.
   * this table only holds the slots above — burn routes through applyBurn,
   * poison through applyPoison. A silent early-return here is how four
   * shipped effects no-op'd invisibly, so keep authoring mistakes loud.
   */
  applyPlayerStatusEffect(player, effect, duration = 3.0, pips = null) {
    const slot = player.statusEffects[effect];
    if (!slot) {
      if (!unsupportedEffectWarned.has(effect)) {
        unsupportedEffectWarned.add(effect);
        console.error(
          `[status-effects] Player has no '${effect}' slot — applyStatusEffect('${effect}') no-ops. ` +
          `Route burn→applyBurn / poison→applyPoison; new effects need a slot here or a design call (known-bugs #166).`
        );
      }
      return;
    }

    const immunity = SLOT_IMMUNITY[effect];
    if (immunity && player[immunity]) return;

    slot.active = true;
    slot.duration = Math.max(slot.duration, duration);
    if (slot.pips === undefined) return;

    const wasFrozen = slot.pips >= 3;
    slot.pips = pips == null ? Math.min(3, slot.pips + 1) : Math.max(slot.pips, Math.min(3, pips));
    if (slot.pips >= 3 && !wasFrozen) {
      slot.duration = Math.max(slot.duration, FROZEN.duration);
      player.velocity.vx = 0;
      player.velocity.vy = 0;
    }
  },

  isPlayerFrozen(player) {
    return player.statusEffects.freeze.pips >= 3;
  },

  /** Movement multiplier from the freeze Pip track (1 when not chilled). */
  freezeSpeedMultiplier(player) {
    const freeze = player.statusEffects.freeze;
    return freeze.active ? FREEZE_PIP_SPEED[freeze.pips] : 1;
  },

  /**
   * One struggle input while Frozen: `roll` is a dodge-roll press, anything
   * else a plain mash. Breaking out clears the whole freeze track, not just
   * the Frozen pip — the player has earned their feet back.
   */
  struggleFrozen(player, roll) {
    const freeze = player.statusEffects.freeze;
    if (freeze.pips < 3) return;
    const rollMult = CHARACTER_TYPES[player.characterType]?.frozenRollChipMult ?? 1;
    freeze.duration -= roll ? FROZEN.rollChip * rollMult : FROZEN.mashChip;
    if (freeze.duration <= 0) {
      freeze.active = false;
      freeze.duration = 0;
      freeze.pips = 0;
    }
  },

  /** Count every live slot down, and clear the ones that run out. */
  tickPlayerStatusSlots(player, deltaTime) {
    for (const slot of Object.values(player.statusEffects)) {
      if (!slot.active) continue;
      slot.duration -= deltaTime;
      if (slot.duration <= 0) {
        slot.active = false;
        slot.duration = 0;
        if (slot.pips !== undefined) slot.pips = 0;
      }
    }
  }
};
