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

// Every timed status the player can carry, and the constants each slot hands
// to its readers. Burn and poison are deliberately absent — they are DoTs
// with their own duration fields above, not slots. `slow` has no player
// representation at all (see #166).
const PLAYER_STATUS_SLOTS = {
  goo: { slowAmount: 0.8 },        // heavy slow + prevents dodge roll
  freeze: { slowAmount: 0.5 },
  slimeBoost: { speedMult: 2.0 },  // slime puddle while wearing the slime suit; matches the slime enemy's 2x
  dizzy: {}
};

// The immunity flag, if any, that refuses a slot outright.
const SLOT_IMMUNITY = { goo: 'slimeImmune', freeze: 'freezeImmune' };

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
   * this table only holds the slots above — burn routes through applyBurn,
   * poison through applyPoison. A silent early-return here is how four
   * shipped effects no-op'd invisibly, so keep authoring mistakes loud.
   */
  applyPlayerStatusEffect(player, effect, duration = 3.0) {
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
  },

  /** Count every live slot down, and clear the ones that run out. */
  tickPlayerStatusSlots(player, deltaTime) {
    for (const slot of Object.values(player.statusEffects)) {
      if (!slot.active) continue;
      slot.duration -= deltaTime;
      if (slot.duration <= 0) {
        slot.active = false;
        slot.duration = 0;
      }
    }
  }
};
