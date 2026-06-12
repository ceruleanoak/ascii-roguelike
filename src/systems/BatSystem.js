import { GRID } from '../game/GameConfig.js';

// Bat weapons (data.batCharge — Bat, Rubber Bat): hold-to-windup swing.
//
// Hold SPACE: the weapon's vertical swing glyph rotates slowly clockwise,
// starting 45° counter-clockwise of the facing direction at charge start
// (the player moves at half speed while winding up). At 270° it stops and
// blinks white — full charge. Release: a rapid counter-clockwise sweep back
// through the wound arc. Sweep segments carry batLaunch — CombatSystem launches
// non-heavy enemies along the contact angle (see the melee hit path there).
// Damage and launch force scale with the windup ratio at release.
//
// Charge state (isCharging / chargeTime) lives on the Item like every other
// hold-to-charge weapon; this system owns the visual and the release sweep.

const FULL_WINDUP = Math.PI * 1.5; // 270°
const BLINK_PERIOD = 0.09;         // full-charge white blink cadence (seconds)
const MIN_LAUNCH_RATIO = 0.3;      // a tap still launches a little

export class BatSystem {
  constructor(game) {
    this.game = game;
    this.windupVisual = null;  // mutated in place each frame; lives in combatSystem.meleeAttacks
    this.chargingWeapon = null;
    this.startAngle = 0;       // facing angle locked at charge start
    this.blinkTimer = 0;
  }

  isBatWeapon(weapon) {
    return !!weapon?.data?.batCharge;
  }

  chargeRatio(weapon) {
    const full = weapon.data.chargeTime || 1;
    return Math.min(weapon.chargeTime / full, 1.0);
  }

  // Called every frame from updatePlayerMechanics (all states).
  update(deltaTime) {
    const player = this.game.player;
    const weapon = player?.heldItem;
    const charging = this.isBatWeapon(weapon) && weapon.isCharging;

    // Held weapon changed mid-windup (slot switch, throw): cancel the stale charge.
    if (this.chargingWeapon && this.chargingWeapon !== weapon) {
      this._resetCharge(this.chargingWeapon);
    }

    if (!charging) {
      this._removeVisual();
      return;
    }

    // Charge just started — lock the windup's start angle to 45° counter-
    // clockwise of the current facing (y-down screen coords: CCW = -angle),
    // so the swing winds across and past the facing direction.
    if (this.chargingWeapon !== weapon) {
      this.chargingWeapon = weapon;
      this.startAngle = Math.atan2(player.facing.y, player.facing.x) - Math.PI / 4;
      this.blinkTimer = 0;
    }

    this.blinkTimer += deltaTime;
    this._updateWindupVisual(player, weapon);
  }

  // SPACE released while winding up: fire the counter-clockwise release sweep.
  release(player) {
    const weapon = player?.heldItem;
    if (!this.isBatWeapon(weapon) || !weapon.isCharging) return;

    const ratio = this.chargeRatio(weapon);
    const startAngle = this.startAngle;
    const sweptAngle = ratio * FULL_WINDUP;

    this._resetCharge(weapon);
    this._removeVisual();
    weapon.cooldownTimer = weapon.data.recovery || 0.5;

    if (sweptAngle < 0.05) return; // released before any visible windup

    // Damage scales with windup; the Rubber Bat (damage 0) never deals damage.
    const maxDamage = weapon.data.damage || 0;
    const damage = maxDamage > 0 ? Math.max(1, Math.round(maxDamage * ratio)) : 0;
    const launchForce = (weapon.data.launchForce || 1100) * Math.max(ratio, MIN_LAUNCH_RATIO);

    // Sweep counter-clockwise from the wound-up angle back to the start angle:
    // one segment per ~22.5°, fired in rapid sequence (full arc in ~0.15s).
    const C = GRID.CELL_SIZE;
    const range = weapon.data.range || 20;
    const count = Math.max(2, Math.ceil(sweptAngle / (Math.PI / 8)) + 1);
    const delayPerStep = (0.04 + 0.11 * ratio) / count;
    const meleeChar = weapon.data.meleeChar || '|';

    for (let i = 0; i < count; i++) {
      const angle = startAngle + sweptAngle * (1 - i / (count - 1));
      const relX = Math.cos(angle) * range;
      const relY = Math.sin(angle) * range;
      this.game.combatSystem.addAttack({
        type: 'melee',
        char: meleeChar,
        drawAngle: angle + Math.PI / 2,
        position: { x: player.position.x + relX, y: player.position.y + relY },
        relX, relY,
        width: C,
        height: C,
        damage,
        duration: 0.07,
        delay: i * delayPerStep,
        color: weapon.color,
        knockback: 0,          // heavy enemies hold their ground; launch handles the rest
        batLaunch: true,
        launchAngle: angle,
        launchForce,
        weaponSubtype: 'bat',
        isBlunt: true,
        owner: player,
        shooterPlane: player.plane
      });
    }

    this.game.playWeaponAttackSFX(weapon);
  }

  // Called from CombatSystem's melee hit path for batLaunch sweep segments.
  // Heavy = mass ≥ 2 or boss — they take the hit but hold their ground
  // (consistent with the ≥50% mass-based knockback resistance at that mass).
  applyLaunch(enemy, attack) {
    const isHeavy = (enemy.data.mass ?? 1) >= 2 || enemy.data.isBoss || enemy.isBossEntity;
    if (isHeavy) return;
    this.game.physicsSystem.applyKnockbackDir(
      enemy,
      Math.cos(attack.launchAngle),
      Math.sin(attack.launchAngle),
      attack.launchForce,
      0.45
    );
  }

  _resetCharge(weapon) {
    weapon.isCharging = false;
    weapon.chargeTime = 0;
    weapon.chargingPlayer = null;
    this.chargingWeapon = null;
  }

  // Single rotating glyph orbiting the player. Lives in combatSystem.meleeAttacks
  // for rendering only — hasHit/hasHitObject keep it out of every collision
  // check, and we refresh duration each frame so the expiry sweep never eats it.
  _updateWindupVisual(player, weapon) {
    const ratio = this.chargeRatio(weapon);
    const angle = this.startAngle + ratio * FULL_WINDUP; // y-down: +angle = clockwise on screen
    const C = GRID.CELL_SIZE;
    const range = weapon.data.range || 20;

    // Full charge: stop (ratio capped at 1) and blink white.
    const blinkWhite = ratio >= 1 && Math.floor(this.blinkTimer / BLINK_PERIOD) % 2 === 0;

    if (!this.windupVisual) {
      this.windupVisual = {
        type: 'melee',
        char: weapon.data.meleeChar || '|',
        damage: 0,
        width: C,
        height: C,
        duration: 1,
        hasHit: true,
        hasHitObject: true,
        position: { x: 0, y: 0 },
        owner: player,
        shooterPlane: player.plane
      };
    }

    const v = this.windupVisual;
    v.position.x = player.position.x + Math.cos(angle) * range;
    v.position.y = player.position.y + Math.sin(angle) * range;
    v.drawAngle = angle + Math.PI / 2;
    v.color = blinkWhite ? '#ffffff' : weapon.color;
    v.duration = 1; // refreshed every frame; removed explicitly on release/cancel
    v.shooterPlane = player.plane;

    // Room transitions clear combatSystem.meleeAttacks — re-add if we got swept.
    const list = this.game.combatSystem.getMeleeAttacks();
    if (!list.includes(v)) list.push(v);
  }

  _removeVisual() {
    if (!this.windupVisual) return;
    const list = this.game.combatSystem.getMeleeAttacks();
    const idx = list.indexOf(this.windupVisual);
    if (idx !== -1) list.splice(idx, 1);
    this.windupVisual = null;
  }
}
