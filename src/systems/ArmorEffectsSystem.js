/**
 * ArmorEffectsSystem.js
 *
 * Per-frame world effects produced by whatever armor the player is wearing:
 * the elemental robes' particle aura and dodge-roll status pulse, the Moss
 * Cloak's stealth state machine.
 *
 * These lived on InventorySystem because that is where `equippedArmor` is
 * stored, but they are live behavior — particles, status effects, water-state
 * mutation, damage ticks — not inventory bookkeeping. InventorySystem owns
 * what the player has; this owns what the worn piece does each frame.
 *
 * Every method bails immediately unless the relevant piece is equipped, so each
 * can be called unconditionally from the EXPLORE update.
 */

import { GRID } from '../game/GameConfig.js';
import { makeAuraParticle } from './WorldEffectsSystem.js';
import { tagInteriorPlane } from './PlaneSystem.js';

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
  // Any WASD held cancels: the keyboard's, or the keys a Spell holds for the
  // player (FIGHT, CHOP/MINE/HARVEST), which reach the movement path as this
  // frame's player.inputState (set before this runs). Reading the keyboard
  // alone, a FIGHT roll armed the cloak and the walk that followed never
  // cancelled it, so the player crossed the room as a shrub.
  updateMossCloak() {
    const game = this.game;
    const player = game.player;
    const cloakEquipped = game.inventorySystem.equippedArmor?.data?.mossCloak === true;
    if (cloakEquipped) {
      const moving = player.inputState;
      const wasdHeld = game.keys.w || game.keys.a || game.keys.s || game.keys.d
        || moving.up || moving.down || moving.left || moving.right;
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
}
