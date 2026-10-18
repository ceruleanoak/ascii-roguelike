/**
 * ArmorEffectsSystem.js
 *
 * Per-frame world effects produced by whatever armor the player is wearing:
 * the elemental robes' particle aura and dodge-roll status pulse, the Moss
 * Cloak's stealth state machine, and the blue-zone water pieces (Coral Crown,
 * Stingray Mantle).
 *
 * These lived on InventorySystem because that is where `equippedArmor` is
 * stored, but they are live behavior — particles, status effects, water-state
 * mutation, damage ticks — not inventory bookkeeping. InventorySystem owns
 * what the player has; this owns what the worn piece does each frame.
 *
 * Every method bails immediately unless the relevant piece is equipped, so all
 * three can be called unconditionally from the EXPLORE update.
 */

import { GRID } from '../game/GameConfig.js';
import { makeAuraParticle } from './WorldEffectsSystem.js';
import { tagInteriorPlane } from './PlaneSystem.js';

// Stingray Mantle on-hit discharge. A cascade loses CHARGE_DECAY_PER_RING (2)
// per ring, so charge 2 dies before the first ring: the wearer's tile only.
const STINGRAY_DISCHARGE_CHARGE = 2;
const STINGRAY_DISCHARGE_DURATION = 0.5;

export class ArmorEffectsSystem {
  constructor(game) {
    this.game = game;
  }

  // Armor Flavor: putting a piece on floats its family's word ('SPEED+',
  // 'HEAVY', 'STURDY') above the player in the family's color, the way a
  // damage number floats. It evokes how the piece feels, never its numbers —
  // the written choice is not to show stat panels (docs/adr/BACKLOG.md).
  // Fired by InventorySystem.equipArmor, the one equip choke point.
  announceFlavor(item) {
    const flavor = item?.data?.flavor;
    const player = this.game.player;
    if (!flavor || !player) return;
    this.game.combatSystem.createDamageNumber(
      flavor.word, player.position.x, player.position.y - GRID.CELL_SIZE, flavor.color, 1, 1.2
    );
  }

  // Splinter: bone armor that a landed melee hit broke (PlayerDamageSystem sets
  // player.splinterPending) is destroyed — gone from the slot, not returned to
  // inventory. 'SPLINTER' floats in the piece's Armor Flavor color.
  updateSplinter() {
    const game = this.game;
    const player = game.player;
    if (!player?.splinterPending) return;
    player.splinterPending = false;

    const inventory = game.inventorySystem;
    const armor = inventory.equippedArmor;
    if (!armor?.data?.splinterChance) return;

    inventory.equippedArmor = null;
    inventory.applyEquipmentEffectsToPlayer(player);
    game.combatSystem.createDamageNumber(
      'SPLINTER', player.position.x, player.position.y - GRID.CELL_SIZE,
      armor.data.flavor?.color ?? armor.data.color, 1, 1.2
    );
    game.audioSystem?.playSFX?.('armor_splinter');
    game.menuSystem?.updateUI?.();
  }

  // Elemental robe aura: ambient particle emission plus a one-per-room status
  // pulse on the first frame of a dodge roll.
  updateRobeAura(deltaTime, player, currentRoom, particles) {
    const armorData = this.game.inventorySystem.equippedArmor?.data;
    const auraType = armorData?.particleAura;
    if (!auraType) return;

    const cx = player.position.x + 8;
    const cy = player.position.y + 8;

    // Ambient particle emission — only while charge is available (or for non-pulse robes)
    const chargeSpent = armorData.rollPulse && player._auraRollPulseUsed;
    if (!chargeSpent) {
      player._auraParticleTimer = (player._auraParticleTimer || 0) + deltaTime;
      const emitInterval = auraType === 'shock' ? 0.07 : auraType === 'shadow' ? 0.12 : 0.10;
      if (player._auraParticleTimer >= emitInterval) {
        player._auraParticleTimer = 0;
        const p = makeAuraParticle(cx, cy, auraType);
        if (p) particles.push(tagInteriorPlane(this.game, p));
      }
    }

    // Roll pulse: triggers on the first frame of a dodge roll, once per room
    if (!armorData.rollPulse || !currentRoom?.enemies) return;

    const isRolling = player.dodgeRoll.active;
    const rollJustStarted = isRolling && !player._lastAuraDodgeActive;

    if (rollJustStarted && !player._auraRollPulseUsed) {
      player._auraRollPulseUsed = true;

      const radius = (armorData.rollPulseRadius || 3) * 16;
      const duration = armorData.rollPulseDuration || 2.0;

      for (const enemy of this.game._activeEnemies()) {
        if (enemy.hp <= 0) continue;
        if (Math.hypot(enemy.position.x + 8 - cx, enemy.position.y + 8 - cy) <= radius) {
          enemy.applyStatusEffect(armorData.rollPulse, duration);
        }
      }

      // Radial blast — particles spread outward in all directions
      const blastCount = 20;
      for (let i = 0; i < blastCount; i++) {
        const angle = (i / blastCount) * Math.PI * 2;
        const speed = 80 + Math.random() * 80;
        const p = makeAuraParticle(cx, cy, auraType);
        if (p) {
          p.vx = Math.cos(angle) * speed;
          p.vy = Math.sin(angle) * speed;
          p.life = 0.4 + Math.random() * 0.3;
          p.maxLife = p.life;
          particles.push(tagInteriorPlane(this.game, p));
        }
      }
    }

    player._lastAuraDodgeActive = isRolling;
  }

  // Moss Cloak 𐤒 stealth state machine. Armed by the active→inactive dodge
  // transition; becomes active when the player stops issuing WASD input.
  // Any WASD held cancels.
  updateMossCloak() {
    const game = this.game;
    const player = game.player;
    const cloakEquipped = game.inventorySystem.equippedArmor?.data?.mossCloak === true;
    if (cloakEquipped) {
      const wasdHeld = game.keys.w || game.keys.a || game.keys.s || game.keys.d;
      if (player._lastDodgeActive && !player.dodgeRoll.active) {
        player.mossCloakArmed = true;
      }
      player._lastDodgeActive = player.dodgeRoll.active;
      if (wasdHeld || player.dodgeRoll.active) {
        player.mossCloakArmed = false;
        player.mossCloakActive = false;
      } else if (player.mossCloakArmed) {
        player.mossCloakActive = true;
      }
    } else {
      player.mossCloakArmed = false;
      player.mossCloakActive = false;
      player._lastDodgeActive = player.dodgeRoll.active;
    }
  }

  // ── Blue-zone armor world-effects ──────────────────────────────────────────
  // Per-frame EXPLORE ticks for water-interaction armor. Called from
  // updateExploreState; both bail unless the relevant piece is equipped.

  updateBlueArmorEffects(deltaTime) {
    this._updateCoralCrown();
    this._updateStingrayMantle();
  }

  // Coral Crown: while wearing the crown and standing on a water tile, that
  // tile becomes 'crystallized' — walkable, blocks contact slowdown, lasts 6s.
  // Tiles auto-expire via BackgroundObject.waterStateTimer.
  _updateCoralCrown() {
    const game = this.game;
    const p = game.player;
    if (!p?.coralCrown || !p.inLiquid || !game.currentRoom) return;
    const CS = GRID.CELL_SIZE;
    const px = p.position.x + CS / 2;
    const py = p.position.y + CS / 2;
    const half = CS / 2;
    for (const obj of game._activeBackgroundObjects()) {
      if (obj.destroyed || obj.char !== '~') continue;
      if (obj.waterState !== 'normal') continue;
      const cx = obj.position.x + half;
      const cy = obj.position.y + half;
      if (Math.abs(cx - px) < half && Math.abs(cy - py) < half) {
        obj.setWaterState('crystallized', 6.0);
        break;
      }
    }
  }

  // Stingray Mantle: a landed hit on the wearer releases the smallest
  // discharge — if they're standing in water, only the tile under them
  // flips to 'electrified', briefly, shocking whatever shares it. Out of
  // water there's nothing to carry it. (Was a continuous wake, an ambient
  // re-seed, and its own damage tick that together kept whole pools live.)
  _updateStingrayMantle() {
    const game = this.game;
    const p = game.player;
    if (!p?.stingrayDischargePending) return;
    p.stingrayDischargePending = false;
    if (!p.stingrayMantle || !p.inLiquid) return;
    const CS = GRID.CELL_SIZE;
    game.electricitySystem?.seedAt(p.position.x + CS / 2, p.position.y + CS / 2,
      { initialCharge: STINGRAY_DISCHARGE_CHARGE, tileDuration: STINGRAY_DISCHARGE_DURATION });
  }
}
