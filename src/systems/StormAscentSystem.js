/**
 * StormAscentSystem — drives the yellow-zone Ascent (A room) storm cycle.
 *
 * `RoomGenerator.generateAscentRoom()` seeds `room.ascentStorm` when
 * `room.zone === 'yellow'`: a central conductive spire sits on the plateau,
 * and the floor ring has sporadic electrified puddles.
 *
 * Lightning attraction: all lightning strikes (SandstormSystem, Lightning Sword,
 * Topaz Staff, enemy attacks) are redirected to the spire position. The bolt
 * renders traveling from sky → spire, and all effects happen on the spire.
 *
 * Charged metal: after a lightning strike at the spire, nearby conductive
 * objects (weapons on ground, slope tiles, metal boxes) become charged —
 * yellow blinking, damage + stun on contact. Electrified water also charges
 * conductive objects touching it. If the player is stunned while holding a
 * metal weapon, the weapon drops to the ground and becomes charged (can't
 * be retrieved while charged).
 *
 * Metal detection: weaponSubtype in [sword, dagger, axe, hammer, spear,
 * pickaxe, scythe, flail, whip, bat, metal_bat] is conductive.
 */

import { GRID } from '../game/GameConfig.js';

// Metal weapon subtypes that conduct electricity
const METAL_SUBTYPES = new Set([
  'sword', 'dagger', 'axe', 'hammer', 'spear', 'pickaxe',
  'scythe', 'flail', 'whip', 'bat'
]);

const CHARGE_DURATION = 4;     // seconds a charged object stays charged
const CHARGE_STUN_DURATION = 2; // seconds of zap stun from charged contact
const CHARGE_DAMAGE = 3;
const STRIKE_FLASH_DURATION = 0.3;

export class StormAscentSystem {
  constructor(game) {
    this.game = game;
  }

  isActive(room) { return !!room?.ascentStorm; }

  update(dt) {
    const room = this.game.currentRoom;
    if (!room || !this.isActive(room)) return;
    const storm = room.ascentStorm;
    if (!storm) return;

    // Decrement strike flash
    if (storm.strikeFlash > 0) storm.strikeFlash -= dt;

    // Tick charged object timers
    this._tickCharges(storm, dt);

    // Electrified water charges conductive objects touching it
    this._chargeFromWater(storm, room);

    // Check player contact with charged objects
    this._checkPlayerContact(storm, room);

    // Check enemy contact with charged objects
    this._checkEnemyContact(storm, room);
  }

  /** Called by SandstormSystem/LightningStrikeSystem to redirect strike to spire. */
  redirectStrike(strike) {
    const room = this.game.currentRoom;
    if (!room?.ascentStorm?.spire) return false;
    const spire = room.ascentStorm.spire;
    strike.x = spire.position.x + GRID.CELL_SIZE / 2;
    strike.y = spire.position.y + GRID.CELL_SIZE / 2;
    // Flash and charge ride the IMPACT hook, not schedule time. The strike
    // carries a 0.7s telegraph that is the player's whole dodge window —
    // energising the metal while the warning is still drawn makes the tell a
    // lie, and burns 0.7s off every CHARGE_DURATION besides.
    strike.onResolve = () => {
      room.ascentStorm.strikeFlash = STRIKE_FLASH_DURATION;
      this._chargeNearby(spire, room);
    };
    return true;
  }

  /** Mark an item on the ground as charged (e.g. dropped by stunned player). */
  chargeGroundItem(item) {
    if (!this._isMetalWeapon(item)) return;
    item.charged = true;
    item.chargeTimer = CHARGE_DURATION;
    const storm = this.game.currentRoom?.ascentStorm;
    if (storm) storm.chargedObjects.push(item);
  }

  _chargeNearby(spire, room) {
    const radius = GRID.CELL_SIZE * 3;
    for (const obj of room.backgroundObjects) {
      if (obj.destroyed) continue;
      const dx = obj.position.x - spire.position.x;
      const dy = obj.position.y - spire.position.y;
      if (Math.sqrt(dx * dx + dy * dy) <= radius) {
        if (obj.conductive && !obj.charged) this._setCharged(obj, true);
      }
    }
  }

  _chargeFromWater(storm, room) {
    for (const tile of storm.floorTiles) {
      if (tile.destroyed || !tile.isWater?.()) continue;
      if (tile.waterState !== 'electrified') continue;
      // Check nearby background objects for conductive materials
      for (const obj of room.backgroundObjects) {
        if (obj.destroyed || obj === tile) continue;
        if (!obj.conductive) continue;
        const dx = obj.position.x - tile.position.x;
        const dy = obj.position.y - tile.position.y;
        if (Math.sqrt(dx * dx + dy * dy) <= GRID.CELL_SIZE) {
          if (!obj.charged) this._setCharged(obj, true);
        }
      }
    }
  }

  _tickCharges(storm, dt) {
    const toRemove = [];
    for (const obj of storm.chargedObjects) {
      obj.chargeTimer -= dt;
      if (obj.chargeTimer <= 0) {
        obj.charged = false;
        toRemove.push(obj);
      }
    }
    for (const obj of toRemove) {
      const idx = storm.chargedObjects.indexOf(obj);
      if (idx !== -1) storm.chargedObjects.splice(idx, 1);
    }

    // Also tick background objects
    for (const obj of this.game.currentRoom?.backgroundObjects || []) {
      if (obj.charged && obj.chargeTimer !== undefined) {
        obj.chargeTimer -= dt;
        if (obj.chargeTimer <= 0) this._setCharged(obj, false);
      }
    }
  }

  /**
   * Flip a background object's charge on or off.
   *
   * The repaint is the point: charged objects are skipped by the background
   * pass and blinked on the foreground instead, so both edges have to dirty
   * the background — switching on, to erase the static glyph already baked in;
   * switching off, to bake it back.
   */
  _setCharged(obj, on) {
    obj.charged = on;
    obj.chargeTimer = on ? CHARGE_DURATION : 0;
    this.game.renderer?.markBackgroundDirty();
  }

  _checkPlayerContact(storm, room) {
    const player = this.game.player;
    if (!player || player.invulnerabilityTimer > 0) return;

    for (const obj of room.backgroundObjects) {
      if (obj.destroyed || !obj.charged) continue;
      const dx = player.position.x - obj.position.x;
      const dy = player.position.y - obj.position.y;
      if (Math.sqrt(dx * dx + dy * dy) <= GRID.CELL_SIZE * 0.8) {
        const result = player.takeDamage(CHARGE_DAMAGE);
        // The iframe check above is not the whole gate — god mode and a few
        // other states also make takeDamage a no-op — so the stun, knockback
        // and numbers all hang off the result rather than off the attempt
        // ([damage-number-desync]).
        if (result !== false) {
          // 'zap' is an ENEMY-only slot: on the player it hits the bug-#166
          // guard and no-ops loudly. `dizzy` is the player's disorientation
          // effect (scrambled inputs + gold blink, same gold as the arc) and is
          // the closest shipped representation of a shock stun.
          player.applyStatusEffect('dizzy', CHARGE_STUN_DURATION);
          this.game.physicsSystem.applyDamageKnockback(player, result, obj.position.x, obj.position.y);
          this.game.combatSystem.createDamageNumber(CHARGE_DAMAGE, player.position.x, player.position.y, '#ffff00');
          this.game.combatSystem.createDamageNumber('\u26A1', player.position.x, player.position.y - 12, '#ffff00');
        }
        break; // one hit per frame
      }
    }
  }

  _checkEnemyContact(storm, room) {
    const enemies = room.enemies || [];
    for (const enemy of enemies) {
      if (enemy.hp <= 0 || enemy.collapsed) continue;
      for (const obj of room.backgroundObjects) {
        if (obj.destroyed || !obj.charged) continue;
        const dx = enemy.position.x - obj.position.x;
        const dy = enemy.position.y - obj.position.y;
        if (Math.sqrt(dx * dx + dy * dy) <= GRID.CELL_SIZE * 0.8) {
          // Contact is tested every frame with no per-enemy cooldown here, so
          // the post-hit iframes inside Enemy.takeDamage are what actually
          // paces this. Unchecked, that made a standing enemy spray a damage
          // number per frame for damage it wasn't taking ([damage-number-desync]).
          const hit = enemy.takeDamage(CHARGE_DAMAGE);
          if (hit !== false) {
            enemy.applyStatusEffect('zap', CHARGE_STUN_DURATION);
            this.game.combatSystem.createDamageNumber(CHARGE_DAMAGE, enemy.position.x, enemy.position.y, '#ffff00');
          }
          break;
        }
      }
    }
  }

  _isMetalWeapon(item) {
    if (!item?.data) return false;
    const subtype = item.data.weaponSubtype;
    return METAL_SUBTYPES.has(subtype);
  }
}
