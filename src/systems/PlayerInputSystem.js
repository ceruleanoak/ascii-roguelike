// PlayerInputSystem — per-frame translation of held keys into the player's
// acceleration, facing and speed cap. Extracted from Player.updateInput()
// (Player.js was over its architecture budget). Same shape as
// PlayerDodgeRollSystem: the player owns every field this reads/writes
// (velocity, acceleration, facing, the lock timers, ...); this module is pure
// logic with no state of its own, operating directly on the player it's passed.
import { PHYSICS } from '../game/GameConfig.js';

// Speed fraction while a melee weapon charges (a bat) or holds its windup.
const CHARGING_MELEE_SPEED = 0.25;

// Dizzy turns a body's keys around: each second, each axis has this chance
// to start reading reversed, and stays reversed for DIZZY_FLIP_SECONDS.
const DIZZY_FLIP_RATE = 0.35;
const DIZZY_FLIP_SECONDS = 0.5;
// Dizzy at the end of a windup: the chance the swing goes off in another
// direction, one to three eighths of a turn either way.
const DIZZY_SWING_VEER_CHANCE = 0.5;

// Count an axis's flip down, or start one. Returns whether it's reversed.
function tickDizzyFlip(slot, field, deltaTime) {
  if (slot[field] > 0) {
    slot[field] -= deltaTime;
    return true;
  }
  if (Math.random() < DIZZY_FLIP_RATE * deltaTime) {
    slot[field] = DIZZY_FLIP_SECONDS;
    return true;
  }
  return false;
}

export const PlayerInputSystem = {
  // How a body's own swing caps its speed: a gun firing drops it to about a
  // third, a charging bat or a held windup (the Exploding Mace and every other
  // AoE swing that holds SPACE, Item.holdsWindup) to a quarter. The Crystal
  // Maul's charge and a drawn bow are full stops, handled by the caller.
  // Shared with the Act 2 bodies (autoBattle), which walk by the same rules.
  attackSpeedMultiplier(body) {
    const firingMult = body.firingSlowTimer > 0 ? 0.35 : 1;
    const held = body.heldItem;
    const chargeMult = held?.isCharging
      ? (held.data?.batCharge ? CHARGING_MELEE_SPEED : 1)
      : (held?.windupActive && held.holdsWindup() ? CHARGING_MELEE_SPEED : 1);
    return firingMult * chargeMult;
  },

  // Whether the held weapon plants the body's feet: a planted-stance weapon
  // (data.locksMovement) through its windup and its attack flash.
  plantsFeet(body) {
    const held = body.heldItem;
    return !!(held?.data?.locksMovement && (held.windupActive || held.attackLockTimer > 0));
  },

  // Whether the held weapon's swing holds the body's facing: from a windup's
  // start until it lands, and through a charge (a bow's excepted: a drawn bow
  // still aims). Read by FIGHT (FightSystem.locksFacing) and the Act 2 bodies.
  swingHoldsFacing(held) {
    return !!(held && (held.windupActive || (held.isCharging && held.data.weaponType !== 'BOW')));
  },

  // The held WASD keys as this frame's movement input, after everything that
  // gets between the player and their keys: a movement lock, the Rusalka's
  // song (each key registers only with probability rusalkaInputScale) and
  // Dizzy (an axis now and then reads reversed for DIZZY_FLIP_SECONDS). The
  // flip is held on the dizzy slot: a reversal rolled fresh each frame lasted
  // one frame, and the keys put the player straight back on course (#550).
  // Lifted from main.js.
  heldMoveInput(player, keys, locked, deltaTime) {
    if (locked) return { up: false, down: false, left: false, right: false };
    const rs = player.rusalkaInputScale;
    const dizzy = player.isDizzy() ? player.statusEffects.dizzy : null;
    const flipX = !!dizzy && tickDizzyFlip(dizzy, 'flipX', deltaTime);
    const flipY = !!dizzy && tickDizzyFlip(dizzy, 'flipY', deltaTime);
    const read = (key, opposite, flipped) => {
      const k = flipped ? opposite : key;
      return rs >= 1.0 ? keys[k] : (Math.random() < rs && keys[k]);
    };
    return {
      up: read('w', 's', flipY), down: read('s', 'w', flipY),
      left: read('a', 'd', flipX), right: read('d', 'a', flipX),
    };
  },

  // A windup just ended on `body`: if it's dizzy, the swing may go off in a
  // new direction (DIZZY_SWING_VEER_CHANCE), as an enemy's Dizzy aim does
  // (Enemy._dizzyAngleOffset). Facing is 8-way, so the turn is whole eighths.
  // An enemy's held weapon fires from a position-only stand-in with no
  // isDizzy; its aim is already scrambled where the stand-in is built.
  veerDizzySwing(body) {
    if (!body?.isDizzy?.() || Math.random() >= DIZZY_SWING_VEER_CHANCE) return;
    const eighths = (1 + Math.floor(Math.random() * 3)) * (Math.random() < 0.5 ? -1 : 1);
    const angle = Math.atan2(body.facing.y, body.facing.x) + eighths * Math.PI / 4;
    body.facing.x = Math.round(Math.cos(angle));
    body.facing.y = Math.round(Math.sin(angle));
  },

  update(player, inputState, lockFacing = false) {
    player.inputState = inputState;

    // Frog form: suppress normal input-driven movement; PolymorphSystem drives velocity via jumps
    if (player.polymorphed) {
      // Set both axes together from the held keys, like the normal path below.
      // Writing one axis per key never zeroed the other, so after any turn
      // facing stuck on a diagonal (the indicator only ever showed diagonals).
      if (!lockFacing) {
        const fx = (inputState.right ? 1 : 0) - (inputState.left ? 1 : 0);
        const fy = (inputState.down ? 1 : 0) - (inputState.up ? 1 : 0);
        if (fx !== 0 || fy !== 0) { player.facing.x = fx; player.facing.y = fy; }
      }
      player.acceleration.ax = 0;
      player.acceleration.ay = 0;
      // Coast to a stop between land hops. Not while swimming — the swim gait
      // (PolymorphSystem) carries a glide between strokes, and this per-frame
      // decay would crush it to a crawl (bug #334).
      if (!player._frogJumpActive && !(player.inLiquid || player.inAquifer)) {
        player.velocity.vx *= 0.75;
        player.velocity.vy *= 0.75;
        if (Math.abs(player.velocity.vx) < 2) player.velocity.vx = 0;
        if (Math.abs(player.velocity.vy) < 2) player.velocity.vy = 0;
      }
      return;
    }

    // Check if charging a bow (for movement slowdown). Bat charges are
    // exempt from the full stop — reduced speed instead (see mult below).
    const isChargingBow = player.heldItem && player.heldItem.isCharging
      && !player.heldItem.data?.batCharge;

    // Calculate target acceleration based on input (1.5x acceleration when sprinting)
    // Polymorph speed/accel overrides (set by PolymorphSystem when in frog form)
    const accelBase = player._polymorphAccelOverride
      ?? (PHYSICS.PLAYER_ACCELERATION * player.getSprintMultiplier());
    const baseAcceleration = accelBase;
    const batAccel = player.batFormTimer > 0 ? 1.8 : 1.0; // Bat form: noticeably faster acceleration
    const acceleration = baseAcceleration * (1 + player.speedBoost - player.speedPenalty) * batAccel;
    let targetAx = 0;
    let targetAy = 0;

    if (inputState.left) targetAx -= acceleration;
    if (inputState.right) targetAx += acceleration;
    if (inputState.up) targetAy -= acceleration;
    if (inputState.down) targetAy += acceleration;

    // Normalize diagonal movement
    if (targetAx !== 0 && targetAy !== 0) {
      const length = Math.sqrt(targetAx * targetAx + targetAy * targetAy);
      targetAx = (targetAx / length) * acceleration;
      targetAy = (targetAy / length) * acceleration;
    }

    // During dodge roll: ignore input acceleration entirely — roll direction drives movement
    if (player.dodgeRoll.active) {
      player.acceleration.ax = 0;
      player.acceleration.ay = 0;
      return;
    }

    // Grabbed by boss head, or mid-flight on a whip pull (hook post/Stump/Tree —
    // PhysicsSystem.updateEntity owns position for the duration): lock movement
    // but allow facing/attack input
    if (player.grabbed || player.hookedByWhip) {
      player.acceleration.ax = 0;
      player.acceleration.ay = 0;
      player.velocity.vx *= 0.75;
      player.velocity.vy *= 0.75;
      if (Math.abs(player.velocity.vx) < 4) player.velocity.vx = 0;
      if (Math.abs(player.velocity.vy) < 4) player.velocity.vy = 0;
    // Locked (Frozen/zapped/stunned): stop movement entirely. Bat sap is a
    // slow, not a lock — see SAP_BAT_SPEED in getStatusSpeedMultiplier().
    } else if (player.isLocked()) {
      player.acceleration.ax = 0;
      player.acceleration.ay = 0;
      player.velocity.vx *= 0.75;
      player.velocity.vy *= 0.75;
      if (Math.abs(player.velocity.vx) < 4) player.velocity.vx = 0;
      if (Math.abs(player.velocity.vy) < 4) player.velocity.vy = 0;
    // Gray-zone bone slope: brief movement lock after push
    } else if (player.boneSlopeLock > 0) {
      player.acceleration.ax = 0;
      player.acceleration.ay = 0;
      player.velocity.vx *= 0.6;
      player.velocity.vy *= 0.6;
      if (Math.abs(player.velocity.vx) < 3) player.velocity.vx = 0;
      if (Math.abs(player.velocity.vy) < 3) player.velocity.vy = 0;
    // Bump Flight: no steering mid-throw; PhysicsSystem friction decays it
    } else if (player.bumpFlightTimer > 0) {
      player.acceleration.ax = 0;
      player.acceleration.ay = 0;
    // While charging bow: zero acceleration (movement slows to stop) but allow aiming
    } else if (isChargingBow) {
      player.acceleration.ax = 0;
      player.acceleration.ay = 0;

      // Apply gentle deceleration (friction) to bring player to a stop
      const chargeDeceleration = 0.8; // Lower = faster stop (0.95 = gentle, gradual slowdown)
      player.velocity.vx *= chargeDeceleration;
      player.velocity.vy *= chargeDeceleration;

      // Stop completely when velocity is very small
      if (Math.abs(player.velocity.vx) < 5) player.velocity.vx = 0;
      if (Math.abs(player.velocity.vy) < 5) player.velocity.vy = 0;
    } else {
      player.acceleration.ax = targetAx;
      player.acceleration.ay = targetAy;
    }

    // Update facing direction for aiming (allow while charging, lock during auto-attack)
    if (!lockFacing && (targetAx !== 0 || targetAy !== 0)) {
      player.facing.x = Math.sign(targetAx);
      player.facing.y = Math.sign(targetAy);
    }

    // Cap velocity to max speed (1.5x speed when sprinting, boosted when speed buff active, armor modifiers, status effects)
    const baseMaxSpeed = player._polymorphSpeedOverride
      ?? (PHYSICS.PLAYER_SPEED * player.getSprintMultiplier());
    const armorModified = baseMaxSpeed * (1 + player.speedBoost - player.speedPenalty);
    const batMax = player.batFormTimer > 0 ? armorModified * 1.8 : armorModified;
    const boostedMax = player.speedBoostTimer > 0 ? Math.max(batMax, armorModified * player.speedBoostMultiplier) : batMax;
    const finalMax = boostedMax * player.getStatusSpeedMultiplier() * PlayerInputSystem.attackSpeedMultiplier(player);
    const speed = Math.sqrt(player.velocity.vx ** 2 + player.velocity.vy ** 2);
    if (speed > finalMax && !(player.bumpFlightTimer > 0)) {
      player.velocity.vx = (player.velocity.vx / speed) * finalMax;
      player.velocity.vy = (player.velocity.vy / speed) * finalMax;
    }
  },
};
