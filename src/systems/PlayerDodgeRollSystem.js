// PlayerDodgeRollSystem — dodge-roll activation and per-frame roll movement.
// Extracted from Player.startDodgeRoll()/updateDodgeRoll() (Player.js was over
// its architecture budget). Same shape as PlayerDamageSystem: the player still
// owns every field this reads/writes (dodgeRoll, velocity, invulnerabilityTimer,
// hidden, ...); this module is pure logic with no state of its own, operating
// directly on the player it's passed.
import { PHYSICS } from '../game/GameConfig.js';
import { stepPoleVault, endPoleVault } from './PoleVault.js';

const DAGGER_POST_DODGE_CRIT_WINDOW = 0.6;

// Roll Combo: a roll in flight chains into a fresh roll when the held roll
// direction turns one step (45°) to an adjacent direction: orthogonal to
// diagonal or diagonal to orthogonal. Up to ROLL_COMBO_MAX_CHAINS chains per
// roll, so → ↗ ↑ ↖ is one roll and three chains (four rolls in all). The
// first chain sets the combo's turn, clockwise or counterclockwise; a step
// back the other way only curves the roll. Each chained roll runs
// ROLL_COMBO_SHORTEN shorter than the roll before it. A turn in the first
// ROLL_COMBO_INPUT_DELAY seconds of a roll is two arrows pressed together for
// one diagonal, not a chain, so it only curves the roll.
const ROLL_COMBO_MAX_CHAINS = 3;
const ROLL_COMBO_INPUT_DELAY = 0.03;
const ROLL_COMBO_SHORTEN = 0.3;

// +1 or -1 for the way `b` turns from `a` (screen space, y down), 0 if neither.
function turnSign(a, b) {
  return Math.sign(a.x * b.y - a.y * b.x);
}

// One 45° step apart, with some slack for a non-arrow direction (FIGHT's
// reposition roll): between 30° and 60°.
function isAdjacentDirection(a, b) {
  const la = Math.hypot(a.x, a.y), lb = Math.hypot(b.x, b.y);
  if (la === 0 || lb === 0) return false;
  const cos = (a.x * b.x + a.y * b.y) / (la * lb);
  return cos < Math.cos(Math.PI / 6) && cos > Math.cos(Math.PI / 3);
}

// Seconds of invulnerability a roll of this type grants as it starts. Shared
// by start() and chain() so a chained roll protects exactly like a fresh one.
// A Cyan 'hide' roll's longer invisible window is start()'s alone: a chain
// never re-triggers invisibility.
// `rollTime` is this roll's own length: a chained roll is shorter than
// `roll.duration` (ROLL_COMBO_SHORTEN).
function rollIframesFor(player, rollTime = player.dodgeRoll.duration) {
  const roll = player.dodgeRoll;
  switch (roll.type) {
    case 'dodge':
    case 'hide':
      return roll.iframes ? rollTime + roll.postRollIframes + player.extraIframes : 0;
    case 'damage':
      return rollTime;
    default:
      return 0;
  }
}

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
      if (enemy.sapping && enemy.sappingTarget === player) {
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
    // A fresh roll starts a fresh Roll Combo.
    player.dodgeRoll.comboChains = 0;
    player.dodgeRoll.comboInput = { x: direction.x, y: direction.y };
    player.dodgeRoll.comboTurn = 0;
    player.dodgeRoll.comboRollTime = player.dodgeRoll.duration;

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
        player.invulnerabilityTimer = rollIframesFor(player);
        break;
      case 'hide':
        if (player.dodgeRoll.invisRecoveryTimer > 0) {
          // Recovering from a recent invisibility trigger: roll works normally, no invis effect
          player.invulnerabilityTimer = rollIframesFor(player);
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
        player.invulnerabilityTimer = rollIframesFor(player);
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

  // Roll Combo: called every frame a roll is in flight with the roll
  // direction held this frame. Returns true when it chained into a fresh
  // roll; false leaves the caller to curve the roll toward `direction`.
  // A chain re-arms the roll's timer (ROLL_COMBO_SHORTEN shorter each
  // chain), cooldown and i-frames and keeps its speed and type (a Whirlwind
  // spin stays a spin). It turns the same way as the combo's first chain.
  // A Pole Vault or a locked/gooey player never chains. The caller plays no
  // roll sound for a chain: the combo sounds once, at its first roll.
  chain(player, direction) {
    const roll = player.dodgeRoll;
    const previous = roll.comboInput;
    roll.comboInput = { x: direction.x, y: direction.y };
    if (!roll.active || roll.vault || roll.type === 'blink') return false;
    if (roll.comboChains >= ROLL_COMBO_MAX_CHAINS) return false;
    if (roll.comboRollTime - roll.timer < ROLL_COMBO_INPUT_DELAY) return false;
    if (player.isGooey() || player.isLocked()) return false;
    if (!previous || !isAdjacentDirection(previous, direction)) return false;
    const turn = turnSign(previous, direction);
    if (roll.comboTurn !== 0 && turn !== roll.comboTurn) return false;

    roll.comboChains++;
    roll.comboTurn = turn;
    roll.comboRollTime = roll.duration * Math.pow(1 - ROLL_COMBO_SHORTEN, roll.comboChains);
    roll.direction = { x: direction.x, y: direction.y };
    roll.timer = roll.comboRollTime;
    roll.cooldownTimer = roll.cooldown * player.rollCooldownMult;
    roll.slopeTimer = 0;
    roll.slopeActive = false;
    roll.slopeLocked = false;
    player.invulnerabilityTimer = Math.max(player.invulnerabilityTimer, rollIframesFor(player, roll.comboRollTime));
    return true;
  },

  // Clear every roll in flight or cooling down, and the hide window a Cyan
  // roll leaves behind (Player.reset). A Pole Vault is dropped where it is,
  // not landed — whoever resets the player also places them.
  reset(player) {
    const roll = player.dodgeRoll;
    roll.active = false;
    roll.vault = null;
    roll.cooldownTimer = 0;
    roll.slopeTimer = 0;
    roll.slopeActive = false;
    roll.slopeLocked = false;
    roll.hideTimer = 0;
    roll.invisRecoveryTimer = 0;
    roll.comboChains = 0;
    roll.comboInput = null;
    roll.comboTurn = 0;
    roll.comboRollTime = 0;
    player.ignoreBackgroundCollision = false;
    player.hidden = false;
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

    // A Pole Vault whose roll was ended from outside (a polymorph, a reset)
    // still lands on its far cell — never left standing in the Chasm.
    if (player.dodgeRoll.vault && !player.dodgeRoll.active) endPoleVault(player);

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
        endPoleVault(player);
        // Applied on finishing, not starting, so the ram itself flies true;
        // only a roll chained while still dizzy veers (start(), above).
        if (player.dodgeRoll.dizzyAfter > 0) {
          player.applyStatusEffect('dizzy', player.dodgeRoll.dizzyAfter);
        }
        // Note: hidden flag for 'hide' rolls is driven by hideTimer (which persists past
        // the roll itself); do NOT clear it here.
        // Open post-dodge crit window for dagger-class weapons (subtype behavior).
        const activeWeapon = player.quickSlots?.[player.activeSlotIndex];
        if (activeWeapon?.data?.weaponSubtype === 'dagger') {
          player.postDodgeCritTimer = DAGGER_POST_DODGE_CRIT_WINDOW;
          player.dodgeRoll.daggerAutoFire = true;
        }
      } else if (player.dodgeRoll.vault) {
        // Pole Vault (PoleVault.js): placed along the jump, not driven.
        stepPoleVault(player);
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
