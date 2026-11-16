import { GRID, PHYSICS, COLORS } from '../game/GameConfig.js';
import { entityCenter, updateEnemyMeleeAttack, activateWindupVisual } from '../game/Telegraph.js';

const CELL = GRID.CELL_SIZE;

const PUNCH_DAMAGE = 1;
const PUNCH_ACCURACY = 0.5;   // half the punches whiff (CombatSystem shows MISS)

// The Punch is a short jab: no windup, thrown the instant SPACE lands, and
// ready again 0.3 real seconds later. Its clock is the enemy-melee clock
// (ENEMY_TIMER_RATE = 2), so the cooldown is written in double-seconds.
const PUNCH_COOLDOWN = 0.3 * PHYSICS.ENEMY_TIMER_RATE;

// The flash after the jab lands, in double-seconds (0.15 real seconds).
const PUNCH_FLASH = 0.30;

// The jab's reach and fist: a sub-cell box just past the thrower's edge, so it
// touches only what is pressed against the player — one body, not an area.
// Units are cells, in the Telegraph shape contract (offset + length along the
// facing, width across it).
const PUNCH_SHAPE = { kind: 'rect', length: 0.6, width: 0.6, offset: 0.5 };

// The thrower's weight follows the fist: a small forward hop, handed to
// CombatSystem as the attack's `lunge` (the hammer's mechanism). Friction eats
// it within the flash — a step, not a dash (the hammer's is 90).
const PUNCH_LUNGE_SPEED = 50;

/**
 * PunchSystem — SPACE with no weapon held (or a spent one, Item.isSpent): a
 * 1-damage, 50%-accuracy jab in yellow. No windup: the blow lands on the press,
 * the thrower steps into it, and the next jab is ready 0.3 seconds later. The
 * hand then returns to any slot that can still fight.
 *
 * The blow itself is handed to CombatSystem as an ordinary player melee hitbox
 * (a sub-cell box just ahead), which is what lands the damage and rolls the
 * miss. The flash is a Telegraph-shaped record stepped by the Telegraph helpers
 * and drawn by the `punches` Frame Pass.
 */
export class PunchSystem {
  constructor(game) {
    this.game = game;
    // Jab flashes in flight (at most one per body), each a Telegraph-shaped
    // record. One body outside the Mist Battle; each Act 2 body throws its own.
    this.punches = [];
    // Double-seconds until each body's next Punch may start (PUNCH_COOLDOWN),
    // keyed by the body that threw the last one.
    this.cooldowns = new Map();
  }

  /** Is a Punch of this body's still flashing? */
  isPunching(player = this.game.player) {
    return this.punches.some(p => p.owner === player);
  }

  /** Is this body's last Punch still cooling down? */
  isCoolingDown(player = this.game.player) {
    return (this.cooldowns.get(player) ?? 0) > 0;
  }

  /**
   * Start a Punch toward the body's facing (the player's, unless a Mist
   * Battle body is named). Ignored while one is already in flight or cooling
   * down.
   * @returns {boolean} true when a Punch started
   */
  tryPunch(player = this.game.player) {
    if (!player || this.isPunching(player) || this.isCoolingDown(player)) return false;
    // A frog has no fists; otherwise the same gate every weapon swing passes.
    if (player.polymorphed || !player.canAttack()) return false;

    const facing = Math.atan2(player.facing.y, player.facing.x);
    const reach = this._reach(PUNCH_SHAPE);
    const punch = {
      type: 'punch',
      owner: player,
      position: this._hitPosition(player, facing, reach),
      width: CELL,
      height: CELL,
      color: COLORS.ITEM,
      warnShape: PUNCH_SHAPE,
      hitShape: PUNCH_SHAPE,
      facing,
      telegraphPulses: null,
      animation: null,
      animationName: null,
      attackShape: null,
      attackShapeTurn: 0,
      attackShapeCount: 1,
      reach,
      // No windup: the record is activated below, and lives for the flash.
      duration: PUNCH_FLASH,
      windupPhase: true,
      windupDuration: 0,
      windupElapsed: 0,
      alpha: 1.0,
      flashWhite: false,
      flashTimer: 0,
      beatIndex: 0,
      beatElapsed: 0,
      beatElapsedPrev: 0,
      hutPlane: this.game.combatSystem.activeHutPlane(),
    };
    activateWindupVisual(punch);
    this.punches.push(punch);
    // Read now, while the thrower's armor is the one worn (an Act 2 body's
    // gear is only loaded while it acts): Dragon Gauntlets harden the blow.
    this._land(punch, this.game.inventorySystem?.equippedArmor?.data ?? null);
    this.cooldowns.set(player, PUNCH_COOLDOWN);
    return true;
  }

  /**
   * SPACE with nothing usable in hand. Empty slots stay selectable, but one is
   * a passing choice while another slot can fight: the first press Punches and
   * the hand goes straight back to the weapon.
   */
  handleEmptyHandedPress() {
    this.tryPunch();
    this._returnToFilledSlot();
  }

  // Same search order as FightSystem._swapFromSpent, without its last resort:
  // a weapon first, then anything unspent. No such slot leaves the hand alone,
  // and the Punch stays the attack. Goes through the number-key path
  // (handleSelectSlot), so the old item's charge and reload are cancelled.
  _returnToFilledSlot() {
    const game = this.game;
    const player = game.player;
    if (!player || player.polymorphed) return;
    // A wire end still in flight anchors only while the wire is in hand.
    if (game.wireSystem.flyingEnd) return;
    const slots = player.quickSlots;
    const order = [];
    for (let i = 1; i < slots.length; i++) {
      const idx = (player.activeSlotIndex + i) % slots.length;
      if (slots[idx] && !player.destroyedSlots?.[idx] && !slots[idx].isSpent()) order.push(idx);
    }
    const pick = order.find(i => slots[i].data?.type === 'WEAPON') ?? order[0];
    if (pick !== undefined) game.handleSelectSlot(pick);
  }

  update(deltaTime) {
    // Enemy-melee clock: the Punch's timings are double-seconds on it.
    const step = deltaTime * PHYSICS.ENEMY_TIMER_RATE;
    for (const [body, left] of this.cooldowns) {
      if (left - step > 0) this.cooldowns.set(body, left - step);
      else this.cooldowns.delete(body);
    }

    for (let i = this.punches.length - 1; i >= 0; i--) {
      if (updateEnemyMeleeAttack(this.punches[i], step)) this.punches.splice(i, 1);
    }
  }

  /** Drop any Punch in flight (Reset Registry, room scope). */
  reset() {
    this.punches = [];
    this.cooldowns.clear();
  }

  // Hand the blow to CombatSystem as a live player melee hitbox on the fist's
  // box, carrying the thrower's forward step as its `lunge`. Objects are
  // skipped, a Brick Wall excepted: an unarmed SPACE beside one interacts with
  // it (main.js), and the Punch's damage is not for objects.
  _land(punch, armor) {
    const player = punch.owner;
    // Dragon Gauntlets (or any armor authoring punchDamage/punchKnockback)
    // harden the blow; bare skin is a 1-damage, no-knockback hit.
    const fist = PUNCH_SHAPE.width * CELL;
    const center = entityCenter(player);
    const position = {
      x: center.x + Math.cos(punch.facing) * punch.reach - fist / 2,
      y: center.y + Math.sin(punch.facing) * punch.reach - fist / 2,
    };
    this._strikeBrickWall(this._hitPosition(player, punch.facing, punch.reach));
    this.game.combatSystem.createAttack({
      type: 'melee',
      char: '',
      telegraphDrawn: true,    // the Punch's Frame Pass draws it, not the melee pass
      position,
      width: fist,
      height: fist,
      lunge: {
        vx: Math.cos(punch.facing) * PUNCH_LUNGE_SPEED,
        vy: Math.sin(punch.facing) * PUNCH_LUNGE_SPEED,
      },
      damage: armor?.punchDamage ?? PUNCH_DAMAGE,
      accuracy: PUNCH_ACCURACY,
      knockback: armor?.punchKnockback ?? 0,
      color: punch.color,
      duration: 0.15,          // real seconds: one test frame, then the flash finishes here
      owner: player,
      shooterPlane: player.plane ?? 0,
      hasHitObject: true,
      isBlunt: true,
      isPunch: true,           // interior object passes (MazeSystem tombs) skip it too
    }, this.game._activeEnemies());
  }

  // A Brick Wall is the one object a Punch reaches. No accuracy roll: the Punch
  // is what it asks for, so a thrown one always lands. Read from the active
  // layer so a Punch inside a hut can't reach a wall out on the surface.
  _strikeBrickWall(position) {
    for (const obj of this.game._activeBackgroundObjects()) {
      if (!obj.data?.punchBreakable) continue;
      if (Math.abs(obj.position.x - position.x) >= CELL) continue;
      if (Math.abs(obj.position.y - position.y) >= CELL) continue;
      this.game.barricadeSystem.strikePlug(obj);
      return;
    }
  }

  // Distance from the player's center to the middle of the hit cell.
  _reach(shape) {
    return ((shape.offset ?? 0) + shape.length / 2) * CELL;
  }

  // Top-left of the cell `reach` out from the player's center (the Brick Wall
  // test and the flash's anchor).
  _hitPosition(player, facing, reach) {
    const c = entityCenter(player);
    return {
      x: c.x + Math.cos(facing) * reach - CELL / 2,
      y: c.y + Math.sin(facing) * reach - CELL / 2,
    };
  }
}
