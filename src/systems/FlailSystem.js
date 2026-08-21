import { GRID } from '../game/GameConfig.js';

// Flail weapon (data.flailSpin): hold-to-spin.
//
// Hold SPACE: a single hit point orbits the player, ramping angular speed
// linearly from 0 up to the weapon's spinMaxSpeed over spinRampTime. Below
// half top speed the hit point is a pure visual — no collision check runs,
// so it passes through enemies untouched. From half top speed up to top
// speed, damage scales continuously with current speed (0 at half speed,
// full damage only once top speed is reached) — a fast-approaching enemy
// still has a window to close in before the spin does meaningful damage.
// The instant it lands a hit, the ramp drops back to 0 (plus a brief
// spinStagger pause) and must build back up from scratch, even though
// SPACE is still held. This is what keeps the flail from walling off a
// crowd the old one-shot 360° ring could: every connect buys the rest of
// the room a re-approach window.
//
// Charge state (isCharging) lives on the Item like every other hold-to-charge
// weapon; this system owns the ramp, the orbiting hitbox, and the visual.

export class FlailSystem {
  constructor(game) {
    this.game = game;
    this.spinAttack = null;   // mutated in place each frame; lives in combatSystem.meleeAttacks
    this.spinningWeapon = null;
    this.angle = 0;
    this.rampTime = 0;        // seconds held at the current ramp (reset on hit)
    this.staggerTimer = 0;    // post-hit pause before the ramp can resume
  }

  isFlailWeapon(weapon) {
    return !!weapon?.data?.flailSpin;
  }

  // Called every frame from updatePlayerMechanics (all states), before
  // CombatSystem.update so a freshly-armed hasHit is checked the same frame.
  update(deltaTime) {
    const player = this.game.player;
    const weapon = player?.heldItem;
    const active = this.isFlailWeapon(weapon) && weapon.isCharging;

    // Held weapon changed mid-spin (slot switch, throw): cancel the stale spin.
    if (this.spinningWeapon && this.spinningWeapon !== weapon) {
      this._resetSpin(this.spinningWeapon);
    }

    if (!active) {
      this._removeVisual();
      return;
    }

    if (this.spinningWeapon !== weapon) {
      this.spinningWeapon = weapon;
      this.angle = Math.atan2(player.facing.y, player.facing.x);
      this.rampTime = 0;
      this.staggerTimer = 0;
    }

    // Last frame's hit (CombatSystem ran after us) — reset the ramp.
    if (this.spinAttack && this.spinAttack.hitConnected) {
      this.spinAttack.hitConnected = false;
      this.rampTime = 0;
      this.staggerTimer = weapon.data.spinStagger ?? 0.15;
    }

    if (this.staggerTimer > 0) {
      this.staggerTimer = Math.max(0, this.staggerTimer - deltaTime);
      this._updateVisual(player, weapon, false, 0, 0);
      return;
    }

    const rampDuration = weapon.data.spinRampTime || 0.45;
    this.rampTime = Math.min(rampDuration, this.rampTime + deltaTime);
    // Linear ramp: angular speed is a straight fraction of elapsed hold time,
    // so "half top speed" genuinely means halfway through the windup — no
    // front-loaded curve that reaches the damage threshold almost instantly.
    const ratio = this.rampTime / rampDuration;
    const maxSpeed = weapon.data.spinMaxSpeed || 6;
    this.angle += ratio * maxSpeed * deltaTime;

    // No damage (and no collision at all — see hasHit below) below half top
    // speed. From half speed to top speed, damage scales continuously with
    // current speed: 0 right at the threshold, full damage at top speed.
    const damaging = ratio >= 0.5;
    const damageRatio = damaging ? (ratio - 0.5) / 0.5 : 0;
    this._updateVisual(player, weapon, damaging, damageRatio, ratio);
  }

  // SPACE released while spinning: just stops — no release attack. Also
  // called on slot switch / room clear.
  release(player) {
    const weapon = player?.heldItem;
    if (!this.isFlailWeapon(weapon)) return;
    this._resetSpin(weapon);
    this._removeVisual();
  }

  _resetSpin(weapon) {
    weapon.isCharging = false;
    weapon.chargeTime = 0;
    weapon.chargingPlayer = null;
    this.spinningWeapon = null;
    this.rampTime = 0;
    this.staggerTimer = 0;
  }

  // Single orbiting glyph, mutated in place each frame. hasHit is re-armed
  // (set false) only on frames where the spin is damaging — that's what
  // gives CombatSystem's one-shot-per-frame melee check a fresh look every
  // frame instead of the usual "check once, then done" lifecycle.
  _updateVisual(player, weapon, damaging, damageRatio = 1, ratio = 1) {
    const C = GRID.CELL_SIZE;
    const baseRange = weapon.data.range || 16;
    // Orbit radius grows with spin speed: 0.5x base at a standstill up to
    // 1.5x base at full ramp — a slow start reads as a tight, controlled
    // swing while a fully wound-up flail visibly reaches farther.
    const range = baseRange * (0.5 + ratio);
    const relX = Math.cos(this.angle) * range;
    const relY = Math.sin(this.angle) * range;

    if (!this.spinAttack) {
      this.spinAttack = {
        type: 'melee',
        char: weapon.data.meleeChar || '~',
        weaponSubtype: 'flail',
        isBlunt: true,
        width: C,
        height: C,
        duration: 1,
        hasHit: true,
        hasHitObject: true,
        hitConnected: false,
        position: { x: 0, y: 0 },
        owner: player,
        shooterPlane: player.plane
      };
    }

    const a = this.spinAttack;
    a.relX = relX;
    a.relY = relY;
    a.position.x = player.position.x + relX;
    a.position.y = player.position.y + relY;
    a.drawAngle = this.angle; // '~' (default meleeChar) renders correctly with no rotation offset
    a.damage = weapon.data.damage * damageRatio;
    a.knockback = weapon.data.knockback || 300;
    a.color = damaging ? '#ffffff' : weapon.color;
    a.duration = 1; // refreshed every frame; removed explicitly on release/cancel
    a.shooterPlane = player.plane;
    a.hasHit = !damaging; // arm exactly one fresh collision check on damaging frames

    const list = this.game.combatSystem.getMeleeAttacks();
    if (!list.includes(a)) list.push(a);
  }

  _removeVisual() {
    if (!this.spinAttack) return;
    const list = this.game.combatSystem.getMeleeAttacks();
    const idx = list.indexOf(this.spinAttack);
    if (idx !== -1) list.splice(idx, 1);
    this.spinAttack = null;
  }
}
