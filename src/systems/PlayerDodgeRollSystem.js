// PlayerDodgeRollSystem — dodge-roll activation and per-frame roll movement.
// Extracted from Player.startDodgeRoll()/updateDodgeRoll() (Player.js was over
// its architecture budget). Same shape as PlayerDamageSystem: the player still
// owns every field this reads/writes (dodgeRoll, velocity, invulnerabilityTimer,
// hidden, ...); this module is pure logic with no state of its own, operating
// directly on the player it's passed.
import { PHYSICS } from '../game/GameConfig.js';

const DAGGER_POST_DODGE_CRIT_WINDOW = 0.6;

export const PlayerDodgeRollSystem = {
  // Returns true when the roll started, false when it was blocked.
  start(player, direction, enemies = []) {
    // Check if on cooldown
    if (player.dodgeRoll.cooldownTimer > 0) {
      return false;
    }

    // Cannot dodge roll while gooey or locked (Frozen/zapped/stunned)!
    if (player.isGooey() || player.isLocked()) {
      return false;
    }

    // Deep water blocks roll activation outright — frog form and Flippers
    // (deepWaterImmune) are exempt, matching their full deep-water immunity.
    if (player.inDeepWater && !player.polymorphed && !player.deepWaterImmune) {
      return false;
    }

    // Cancel attack windup for melee weapons
    if (player.heldItem && player.heldItem.windupActive) {
      player.heldItem.windupActive = false;
      player.heldItem.windupTimer = 0;
      player.heldItem.pendingPlayer = null;
    }

    // Cancel bow charging
    if (player.heldItem && player.heldItem.isCharging) {
      player.heldItem.isCharging = false;
      player.heldItem.chargeTime = 0;
      player.heldItem.chargingPlayer = null;
    }

    // Break any sapping enemies attached to this player
    for (const enemy of enemies) {
      if (enemy.sapping && enemy.sappingTarget === this) {
        enemy.breakSapping(300); // Stronger knockback from dodge roll
      }
    }

    // Calculate current max movement speed (from updateInput logic)
    const baseMaxSpeed = PHYSICS.PLAYER_SPEED * player.getSprintMultiplier();
    const armorModified = baseMaxSpeed * (1 + player.speedBoost - player.speedPenalty);
    const currentMaxSpeed = player.speedBoostTimer > 0 ? armorModified * player.speedBoostMultiplier : armorModified;

    // Dodge roll speed is 1.1x current max speed (always slightly faster)
    const rollSpeed = currentMaxSpeed * 1.1;

    // Activate roll
    player.dodgeRoll.active = true;
    player.dodgeRoll.direction = direction;
    // Dizzy: deviate roll up to ±54° from intended direction
    if (player.isDizzy()) {
      const baseAngle = Math.atan2(player.dodgeRoll.direction.y, player.dodgeRoll.direction.x);
      const newAngle = baseAngle + (Math.random() - 0.5) * (Math.PI * 0.6);
      player.dodgeRoll.direction = { x: Math.cos(newAngle), y: Math.sin(newAngle) };
    }
    player.dodgeRoll.timer = player.dodgeRoll.duration;
    player.dodgeRoll.cooldownTimer = player.dodgeRoll.cooldown * player.rollCooldownMult;
    player.dodgeRoll.speed = rollSpeed; // Set dynamic speed

    // Reset slope/ice lock state for fresh roll
    player.dodgeRoll.slopeTimer  = 0;
    player.dodgeRoll.slopeActive = false;
    player.dodgeRoll.slopeLocked = false;

    // Zero out velocity for flat dodge roll speed (not additive with movement)
    player.velocity.vx = 0;
    player.velocity.vy = 0;
    player.acceleration.ax = 0;
    player.acceleration.ay = 0;

    // Apply roll-specific effects based on type
    switch (player.dodgeRoll.type) {
      case 'dodge':
        // Roll duration plus this character's brief post-roll tail, plus any
        // armor bonus. A roll with `iframes: false` (sprint) grants none.
        player.invulnerabilityTimer = player.dodgeRoll.iframes
          ? player.dodgeRoll.duration + player.dodgeRoll.postRollIframes + player.extraIframes
          : 0;
        break;
      case 'hide':
        if (player.dodgeRoll.invisRecoveryTimer > 0) {
          // Recovering from a recent invisibility trigger: roll works normally, no invis effect
          player.invulnerabilityTimer = player.dodgeRoll.duration + player.dodgeRoll.postRollIframes + player.extraIframes;
        } else {
          // Invisible to enemies + extended i-frames (cyan rogue specialty)
          player.hidden = true;
          // Extended i-frames: 0.25s roll + 1.25s = 1.5s total invulnerability
          player.invulnerabilityTimer = player.dodgeRoll.duration + 1.25;
          // Attacks blocked for entire extended iframe duration
          player.attackBlockTimer = player.invulnerabilityTimer;
          // Hide persists past the roll itself — enemies actively forget the player while hidden,
          // giving room to reposition and set up a backstab.
          player.dodgeRoll.hideTimer = player.dodgeRoll.hideDuration || player.invulnerabilityTimer;
          // Recovery gate: invisibility can't trigger again for 10s (plain dodge still available)
          player.dodgeRoll.invisRecoveryTimer = player.dodgeRoll.invisRecoveryDuration;
        }
        break;
      case 'damage':
        // Minimal i-frames — only for the roll duration itself, no buffer (requires precision)
        player.invulnerabilityTimer = player.dodgeRoll.duration;
        break;
      case 'whirlwind':
        // No i-frames — offensive spin, not defensive evasion
        break;
      case 'blink':
        // Defer teleport to main.js for collision checking, bounds enforcement, and trail particles
        player.pendingBlink = { direction: { x: direction.x, y: direction.y }, distance: player.dodgeRoll.distance };
        player.dodgeRoll.timer = 0; // Instant
        break;
    }

    return true;
  },

  update(player, deltaTime) {
    // Cooldown tick
    if (player.dodgeRoll.cooldownTimer > 0) {
      player.dodgeRoll.cooldownTimer -= deltaTime;
    }

    // Invisibility recovery tick (cyan rogue) — while active, rolls are dodge-only, no hide
    if (player.dodgeRoll.invisRecoveryTimer > 0) {
      player.dodgeRoll.invisRecoveryTimer -= deltaTime;
    }

    // Hide window tick (cyan rogue) — persists past the roll itself
    if (player.dodgeRoll.hideTimer > 0) {
      player.dodgeRoll.hideTimer -= deltaTime;
      if (player.dodgeRoll.hideTimer <= 0) {
        player.dodgeRoll.hideTimer = 0;
        player.hidden = false;
      }
    }

    // Active roll movement
    if (player.dodgeRoll.active) {
      // Slope / ice lock phase
      // When the player enters a slope or frozen-ice tile during a roll, a
      // free-time window opens (slopeFreeTime ≈ 20 frames).  During that window
      // the roll velocity drives movement as normal ("burst").  Once the window
      // expires, slopeLocked is set: roll velocity is zeroed and the tile's own
      // physics (slope push / ice inertia) take over ("mercy phase").
      const onSpecialTerrain = player.isOnSlope || player.isOnIce;
      if (onSpecialTerrain && player.dodgeRoll.type !== 'blink') {
        if (!player.dodgeRoll.slopeActive) {
          player.dodgeRoll.slopeActive = true; // Start window on first contact
          player.dodgeRoll.slopeTimer  = 0;
        }
        if (!player.dodgeRoll.slopeLocked) {
          player.dodgeRoll.slopeTimer += deltaTime;
          if (player.dodgeRoll.slopeTimer >= player.dodgeRoll.slopeFreeTime) {
            player.dodgeRoll.slopeLocked = true;
          }
        }
      }

      player.dodgeRoll.timer -= deltaTime;

      if (player.dodgeRoll.timer <= 0) {
        // Roll complete — zero out velocity and deactivate
        player.dodgeRoll.active = false;
        player.dodgeRoll.justEnded = true;
        player.velocity.vx = 0;
        player.velocity.vy = 0;
        player.acceleration.ax = 0;
        player.acceleration.ay = 0;
        // Note: hidden flag for 'hide' rolls is driven by hideTimer (which persists past
        // the roll itself); do NOT clear it here.
        // Open post-dodge crit window for dagger-class weapons (subtype behavior).
        const activeWeapon = player.quickSlots?.[player.activeSlotIndex];
        if (activeWeapon?.data?.weaponSubtype === 'dagger') {
          player.postDodgeCritTimer = DAGGER_POST_DODGE_CRIT_WINDOW;
          player.dodgeRoll.daggerAutoFire = true;
        }
      } else if (player.dodgeRoll.type !== 'blink') {
        if (player.dodgeRoll.slopeLocked) {
          // Mercy phase: zero roll velocity so slope push / ice momentum drives
          player.velocity.vx = 0;
          player.velocity.vy = 0;
        } else {
          // Normal roll or within free-time window on special terrain
          player.velocity.vx = player.dodgeRoll.direction.x * player.dodgeRoll.speed;
          player.velocity.vy = player.dodgeRoll.direction.y * player.dodgeRoll.speed;
        }
        player.acceleration.ax = 0;
        player.acceleration.ay = 0;
      }
    }
  },
};
