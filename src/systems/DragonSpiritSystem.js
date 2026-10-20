// DragonSpiritSystem — the Dragon Spirit consumable (Fire Essence + Scale) and
// the Echo it calls up: the player's twin, standing beside them, firing every
// attack the player makes a second time from its own spot.
//
// Shape:
// - The Echo is not a body of its own. It shares the player's HP: an enemy
//   attack that lands on the Echo hurts the player (Player.takeDamage, so
//   armor, i-frames and rolls apply) and breaks the Echo. Enemies never target
//   it; it only widens the space the player can be hit in.
// - The Dragon Spirit is a passive consumable: the Echo stands beside the
//   player while one is equipped in a consumable slot, and never triggers.
//   Unequipping it sends the Echo away.
// - A broken Echo stays broken through every room until the player enters
//   REST, where it returns. Re-equipping does not call it back early.
// - The Echo holds its own copy of the player's held weapon (own cooldown,
//   windup and ammo) and mirrors the press, held-SPACE repeat and release
//   through mirroredWeapon.js — the same shape as the Trine's Flanks. Weapons
//   that can't mirror (canMirror) leave the Echo idle while held.
// - It stands one cell to the right of the player's facing, or to the left if
//   a wall is there. With both sides walled it steps back into the player
//   until there is room again: absent for that moment, neither firing nor
//   hittable.
//
// rest-parity: absent in REST because REST is where a broken Echo returns and
// there is nothing there to fight. NEUTRAL is non-combat.
import { GRID, GAME_STATES } from '../game/GameConfig.js';
import { Item } from '../entities/Item.js';
import { ITEM_TYPES } from '../data/items.js';
import { createExplosion } from '../entities/Particle.js';
import { canMirror, mirrorPress, mirrorRelease, mirrorAutoAttack, tickMirroredWeapon, resolveEnemyHitsOn, reportHit } from './mirroredWeapon.js';

const CELL = GRID.CELL_SIZE;
// How far beside the player the Echo stands, in cells.
const ECHO_SIDE = 1;
const ECHO_COLOR = '#ff4488';

export class DragonSpiritSystem {
  constructor(game) {
    this.game = game;
    this.reset();
  }

  /** Run scope (Reset Registry): death and title return clear the broken flag and the Echo's weapon. */
  reset() {
    this.broken = false;  // hit since the last REST
    this.present = false; // standing beside the player this frame (a free side was found)
    this.carrier = null;
    this.item = null;     // the Echo's own copy of the held weapon
    this.source = null;   // the player's held Item that `item` copies
    this.meleeResolved = new WeakMap();
  }

  /** main.js enterRestState: a broken Echo returns at REST. */
  onEnterRest() {
    this.broken = false;
    this.item?.cancelChargeAndReload?.();
  }

  /** A Dragon Spirit is equipped in a consumable slot. */
  isEquipped() {
    return this.game.inventorySystem.equippedConsumables.some(slot => slot?.data?.dragonSpirit);
  }

  isActive() {
    return !this.broken && this.isEquipped() && this.game.stateMachine.getCurrentState() === GAME_STATES.EXPLORE;
  }

  /** SPACE press, right after the player's attack (main.js handleSpacePress). */
  onAttackPress() {
    if (this.present) mirrorPress(this.carrier, this._fire);
  }

  /** SPACE release, after the player's own release (main.js handleSpaceRelease). */
  onAttackRelease() {
    if (this.present) mirrorRelease(this.carrier, this._fire);
  }

  // The Echo is the player's twin, so its attacks take the player's damage
  // modifier (shrines, Frog Coin, training) just as the player's do.
  _fire = (attack) => {
    if (!attack) return;
    const game = this.game;
    game.combatSystem.createAttack(game.applyGreenDamageModifier(attack), game._activeEnemies());
  };

  /**
   * EXPLORE frame, right after CombatSystem.update and before the death check
   * (an Echo hit can be the killing blow): place the Echo, tick and repeat
   * its weapon, then resolve enemy attacks against it.
   */
  update(deltaTime) {
    this.present = false;
    if (!this.isActive()) return;
    const game = this.game;
    const carrier = this._carrierFor(game.player);
    if (!this._place(carrier)) return;
    this.present = true;
    this._syncWeapon(game.player.heldItem);
    tickMirroredWeapon(game, carrier, deltaTime, this._fire);
    mirrorAutoAttack(game, carrier, this._fire);
    resolveEnemyHitsOn(game, carrier, this.meleeResolved, this._takeHit);
  }

  // A landed hit hurts the player. Only a hit that actually does harm breaks
  // the Echo — a dodge, block or immunity leaves it standing.
  _takeHit = (damage, source, from) => {
    if (this.broken) return false;
    const game = this.game;
    const result = game.player.takeDamage(damage, source);
    if (result === false) return false;
    reportHit(game, this.carrier, result, damage, from, 0);
    if (!result?.dodged && !result?.blocked && !result?.immune) this._break();
    return result;
  };

  _break() {
    const game = this.game;
    const { x, y } = this.carrier.position;
    this.broken = true;
    this.present = false;
    this.item?.cancelChargeAndReload?.();
    const burst = createExplosion(x + CELL / 2, y + CELL / 2, 16, ECHO_COLOR);
    game.particles.push(...burst);
    for (const particle of burst) game.physicsSystem.addEntity(particle);
  }

  // The carrier is what Item.use() builds the Echo's attacks from: a view of
  // the player (Object.create, so character, affinities, training, plane and
  // roll state read through live) with its own position, velocity and held
  // weapon. hp reads and writes through to the player, so lifesteal and
  // heal-on-kill from the Echo's hits heal the player — the HP is shared.
  // Rebuilt whenever game.player is a different body (character switch).
  _carrierFor(player) {
    if (this.carrier && Object.getPrototypeOf(this.carrier) === player) return this.carrier;
    const carrier = Object.create(player);
    carrier.position = { x: player.position.x, y: player.position.y };
    carrier.velocity = { vx: 0, vy: 0 };
    Object.defineProperty(carrier, 'heldItem', { get: () => this.item });
    Object.defineProperty(carrier, 'hp', {
      get: () => player.hp,
      set: (value) => { player.hp = value; },
    });
    this.carrier = carrier;
    this.source = null; // the new body's weapon is re-copied below
    return carrier;
  }

  // Stand ECHO_SIDE cells to the right of the player's facing, else to the
  // left. Returns false when both sides are walled.
  _place(carrier) {
    const player = this.game.player;
    const len = Math.hypot(player.facing.x, player.facing.y) || 1;
    // Right of facing is (-fy, fx).
    const rx = -player.facing.y / len;
    const ry = player.facing.x / len;
    for (const side of [1, -1]) {
      const x = player.position.x + rx * side * ECHO_SIDE * CELL;
      const y = player.position.y + ry * side * ECHO_SIDE * CELL;
      if (this._isOpen(player, x, y)) {
        carrier.position.x = x;
        carrier.position.y = y;
        return true;
      }
    }
    return false;
  }

  _isOpen(player, x, y) {
    const width = player.width || CELL;
    const height = player.height || CELL;
    if (x < 0 || y < 0 || x + width > GRID.WIDTH || y + height > GRID.HEIGHT) return false;
    if (!player.collisionMap) return true;
    return !this.game.physicsSystem.checkAxisCollision(player.collisionMap, x, y, width, height, 'y', player, this.game.activeRoom);
  }

  // Keep the Echo's weapon a copy of whatever the player holds. Only weapons
  // that can mirror are copied; anything else (a consumable, a bat) leaves
  // the Echo empty-handed. The copy carries the held item's own data, so a
  // tiered-up weapon echoes at its tier.
  _syncWeapon(held) {
    if (held === this.source) return;
    this.item?.cancelChargeAndReload?.();
    this.source = held;
    this.item = null;
    if (!held || held.data?.type !== ITEM_TYPES.WEAPON || !canMirror(held.data)) return;
    const copy = new Item(held.char, this.carrier.position.x, this.carrier.position.y);
    copy.data = held.data;
    copy.color = held.color;
    this.item = copy;
  }
}
