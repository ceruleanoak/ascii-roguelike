// PlayerInputSystem — per-frame translation of held keys into the player's
// acceleration, facing and speed cap. Extracted from Player.updateInput()
// (Player.js was over its architecture budget). Same shape as
// PlayerDodgeRollSystem: the player owns every field this reads/writes
// (velocity, acceleration, facing, the lock timers, ...); this module is pure
// logic with no state of its own, operating directly on the player it's passed.
import { PHYSICS } from '../game/GameConfig.js';

export const PlayerInputSystem = {
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

    // Check if charging a bow (for movement slowdown). Bat/flail charges are
    // exempt from the full stop — reduced speed instead (see mult below).
    const isChargingBow = player.heldItem && player.heldItem.isCharging
      && !player.heldItem.data?.batCharge && !player.heldItem.data?.flailSpin;

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
    const firingMult = player.firingSlowTimer > 0 ? 0.35 : 1; // Dramatic ~65% slow while firing a gun
    // Bat: half speed while charging. Flail: 1/8 speed while spinning up.
    const chargeMult = !player.heldItem?.isCharging ? 1
      : player.heldItem.data?.batCharge ? 0.5
      : player.heldItem.data?.flailSpin ? 0.05 : 1;
    const finalMax = boostedMax * player.getStatusSpeedMultiplier() * firingMult * chargeMult;
    const speed = Math.sqrt(player.velocity.vx ** 2 + player.velocity.vy ** 2);
    if (speed > finalMax && !(player.bumpFlightTimer > 0)) {
      player.velocity.vx = (player.velocity.vx / speed) * finalMax;
      player.velocity.vy = (player.velocity.vy / speed) * finalMax;
    }
  },
};
