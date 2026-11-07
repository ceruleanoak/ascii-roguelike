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
 * the Slime's windup and projection, in yellow. The hand then returns to any slot that can still fight.
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
    // Windup visuals in flight (at most one per body), each a Telegraph-shaped
    // attack. One body outside the Mist Battle; each Act 2 body throws its own.
    this.punches = [];
    // Double-seconds until each body's next Punch may start (the Slime's
    // attackCooldown), keyed by the body that threw the last one.
    this.cooldowns = new Map();
  }

  /** Is a Punch of this body's winding up or still flashing? */
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
      // Read now, while the thrower's armor is the one worn (an Act 2 body's
      // gear is only loaded while it acts): Dragon Gauntlets harden the blow.
      armor: this.game.inventorySystem?.equippedArmor?.data ?? null,
    });
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
    // Enemy-melee clock: the Slime's timings are double-seconds on it.
    const step = deltaTime * PHYSICS.ENEMY_TIMER_RATE;
    for (const [body, left] of this.cooldowns) {
      if (left - step > 0) this.cooldowns.set(body, left - step);
      else this.cooldowns.delete(body);
    }

    for (let i = this.punches.length - 1; i >= 0; i--) {
      const punch = this.punches[i];
      const expired = updateEnemyMeleeAttack(punch, step);
      if (punch.windupPhase && punch.windupElapsed >= punch.windupDuration) {
        activateWindupVisual(punch);
        this._land(punch);
        this.cooldowns.set(punch.owner, SLIME.attackCooldown);
      }
      if (expired && !punch.windupPhase) this.punches.splice(i, 1);
    }
  }

  /** Drop any Punch in flight (Reset Registry, room scope). */
  reset() {
    this.punches = [];
    this.cooldowns.clear();
  }

  // Hand the blow to CombatSystem as a live player melee hitbox on the box's
  // cell. Objects are skipped, a Brick Wall excepted: an unarmed SPACE beside
  // one interacts with it (main.js), and the Punch's damage is not for objects.
  _land(punch) {
    const player = punch.owner;
    // Dragon Gauntlets (or any armor authoring punchDamage/punchKnockback)
    // harden the blow; bare skin is the Slime's 1-damage, no-knockback hit.
    const armor = punch.armor;
    const position = this._hitPosition(player, punch.facing, punch.reach);
    this._strikeBrickWall(position);
    this.game.combatSystem.createAttack({
      type: 'melee',
      char: '',
      telegraphDrawn: true,    // the Punch's Frame Pass draws it, not the melee pass
      position,
      width: CELL,
      height: CELL,
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

  // Top-left of the one-cell hitbox, `reach` out from the player's center.
  _hitPosition(player, facing, reach) {
    const c = entityCenter(player);
    return {
      x: c.x + Math.cos(facing) * reach - CELL / 2,
      y: c.y + Math.sin(facing) * reach - CELL / 2,
    };
  }
}
