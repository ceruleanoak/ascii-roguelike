import { GRID, PHYSICS, COLORS } from '../game/GameConfig.js';
import { ENEMIES } from '../data/enemies.js';
import { resolveTelegraph } from '../game/TelegraphAnimation.js';
import { entityCenter, updateEnemyMeleeAttack, activateWindupVisual } from '../game/Telegraph.js';

const CELL = GRID.CELL_SIZE;

// The Punch borrows the Slime's whole attack: its windup, its cooldown and its
// Telegraph (the one-cell box that blinks). Read straight off the Slime's data
// so the two can never drift apart — the player's bare-handed swing is the
// first attack they learned to read, thrown back.
const SLIME = ENEMIES.o;

const PUNCH_DAMAGE = 1;
const PUNCH_ACCURACY = 0.5;   // half the punches whiff (CombatSystem shows MISS)

/**
 * PunchSystem — SPACE with no weapon held (or a spent one, Item.isSpent): a 1-damage, 50%-accuracy Punch with
 * the Slime's windup and projection, in yellow.
 *
 * The windup is the Slime's Telegraph lifecycle, stepped by the same Telegraph
 * helpers on the same double-second clock as an enemy melee attack, so it
 * blinks and flashes exactly as the Slime's does. When the windup completes the
 * blow itself is handed to CombatSystem as an ordinary player melee hitbox (one
 * cell, where the box sits), which is what lands the damage and rolls the miss.
 *
 * The windup visual lives here, not in CombatSystem's melee list: that list
 * only holds hitboxes that are already live, and a windup never deals damage.
 * Drawn by the `punches` Frame Pass.
 */
export class PunchSystem {
  constructor(game) {
    this.game = game;
    // Windup visuals in flight (at most one), each a Telegraph-shaped attack.
    this.punches = [];
    // Double-seconds until the next Punch may start (the Slime's attackCooldown).
    this.cooldown = 0;
  }

  /** Is a Punch winding up or still flashing? */
  isPunching() {
    return this.punches.length > 0;
  }

  /**
   * Start a Punch toward the player's facing. Ignored while one is already in
   * flight or cooling down.
   * @returns {boolean} true when a Punch started
   */
  tryPunch() {
    const player = this.game.player;
    if (!player || this.isPunching() || this.cooldown > 0) return false;
    // A frog has no fists; otherwise the same gate every weapon swing passes.
    if (player.polymorphed || !player.canAttack()) return false;

    const resolved = resolveTelegraph(SLIME.telegraph, 'Punch');
    const facing = Math.atan2(player.facing.y, player.facing.x);
    const reach = this._reach(resolved.hitShape);
    const windup = SLIME.attackWindup;

    this.punches.push({
      type: 'punch',
      owner: player,
      position: this._hitPosition(player, facing, reach),
      ownerOffsetX: Math.cos(facing) * reach - CELL / 2 + (player.width ?? CELL) / 2,
      ownerOffsetY: Math.sin(facing) * reach - CELL / 2 + (player.height ?? CELL) / 2,
      width: CELL,
      height: CELL,
      color: COLORS.ITEM,
      warnShape: resolved.warnShape,
      hitShape: resolved.hitShape,
      facing,
      telegraphPulses: resolved.pulses,
      animation: resolved.animation,
      animationName: resolved.animationName,
      attackShape: resolved.attackShape,
      attackShapeTurn: resolved.attackShapeTurn,
      attackShapeCount: resolved.attackShapeCount,
      reach,
      // The same lifetime an enemy windup visual gets: windup, then one active window.
      duration: windup + 0.30,
      windupPhase: true,
      windupDuration: windup,
      windupElapsed: 0,
      alpha: 1.0,
      flashWhite: false,
      flashTimer: 0,
      beatIndex: 0,
      beatElapsed: 0,
      beatElapsedPrev: 0,
      hutPlane: this.game.combatSystem.activeHutPlane(),
    });
    return true;
  }

  update(deltaTime) {
    // Enemy-melee clock: the Slime's timings are double-seconds on it.
    const step = deltaTime * PHYSICS.ENEMY_TIMER_RATE;
    if (this.cooldown > 0) this.cooldown = Math.max(0, this.cooldown - step);

    for (let i = this.punches.length - 1; i >= 0; i--) {
      const punch = this.punches[i];
      const expired = updateEnemyMeleeAttack(punch, step);
      if (punch.windupPhase && punch.windupElapsed >= punch.windupDuration) {
        activateWindupVisual(punch);
        this._land(punch);
        this.cooldown = SLIME.attackCooldown;
      }
      if (expired && !punch.windupPhase) this.punches.splice(i, 1);
    }
  }

  /** Drop any Punch in flight (Reset Registry, room scope). */
  reset() {
    this.punches = [];
    this.cooldown = 0;
  }

  // Hand the blow to CombatSystem as a live player melee hitbox on the box's
  // cell. Objects are skipped: an unarmed SPACE beside one interacts with it
  // instead (main.js), so a Punch is only ever thrown at open ground.
  _land(punch) {
    const player = this.game.player;
    this.game.combatSystem.createAttack({
      type: 'melee',
      char: '',
      telegraphDrawn: true,    // the Punch's Frame Pass draws it, not the melee pass
      position: this._hitPosition(player, punch.facing, punch.reach),
      width: CELL,
      height: CELL,
      damage: PUNCH_DAMAGE,
      accuracy: PUNCH_ACCURACY,
      knockback: 0,
      color: punch.color,
      duration: 0.15,          // real seconds: one test frame, then the flash finishes here
      owner: player,
      shooterPlane: player.plane ?? 0,
      hasHitObject: true,
      isBlunt: true,
      isPunch: true,           // interior object passes (MazeSystem tombs) skip it too
    }, this.game._activeEnemies());
  }

  // Distance from the player's center to the middle of the hit cell.
  _reach(shape) {
    return ((shape.offset ?? 0) + shape.length / 2) * CELL;
  }

  // Top-left of the one-cell hitbox, `reach` out from the player's center.
  _hitPosition(player, facing, reach) {
    const c = entityCenter(player);
    return {
      x: c.x + Math.cos(facing) * reach - CELL / 2,
      y: c.y + Math.sin(facing) * reach - CELL / 2,
    };
  }
}
