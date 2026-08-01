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

export class ArmorEffectsSystem {
  constructor(game) {
    this.game = game;
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
        if (p) particles.push(p);
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

      for (const enemy of currentRoom.enemies) {
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
          particles.push(p);
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
    this._updateStingrayMantle(deltaTime);
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
    for (const obj of game.currentRoom.backgroundObjects) {
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

  // Stingray Mantle: moving through water leaves an electrified wake. Each
  // vacated water cell flips to 'electrified' for 4s — long enough to form a
  // visible trail behind the player and keep zapping enemies that wander in.
  // While the player is in water, ticks damage on enemies standing on any
  // electrified cell — wet enemies take 2× via the existing wet+shock
  // interaction (we apply the 2× directly here since this is the wake's own
  // damage source).
  _updateStingrayMantle(deltaTime) {
    const game = this.game;
    const p = game.player;
    if (!p?.stingrayMantle || !game.currentRoom) return;
    const CS = GRID.CELL_SIZE;
    const px = p.position.x + CS / 2;
    const py = p.position.y + CS / 2;
    const col = Math.floor(px / CS);
    const row = Math.floor(py / CS);

    if (p.inLiquid) {
      if (p._wakePrevCol === undefined) { p._wakePrevCol = col; p._wakePrevRow = row; }
      if (col !== p._wakePrevCol || row !== p._wakePrevRow) {
        const prevX = p._wakePrevCol * CS;
        const prevY = p._wakePrevRow * CS;
        for (const obj of game.currentRoom.backgroundObjects) {
          if (obj.destroyed || obj.char !== '~') continue;
          if (Math.abs(obj.position.x - prevX) < 4 && Math.abs(obj.position.y - prevY) < 4) {
            if (obj.waterState === 'normal') {
              game.electricitySystem?.seedFromArmor(obj, game.currentRoom.backgroundObjects,
                p.heldItem?.data, { tileDuration: 4.0 });
            }
            break;
          }
        }
        p._wakePrevCol = col;
        p._wakePrevRow = row;
      }
    } else {
      p._wakePrevCol = undefined;
      p._wakePrevRow = undefined;
    }

    // Damage tick — 0.25s interval
    p._wakeTickTimer = (p._wakeTickTimer || 0) - deltaTime;
    if (p._wakeTickTimer > 0) return;
    p._wakeTickTimer = 0.25;
    const half = CS / 2;
    for (const enemy of game.currentRoom.enemies) {
      if (enemy.hp <= 0) continue;
      const ex = enemy.position.x + half;
      const ey = enemy.position.y + half;
      for (const obj of game.currentRoom.backgroundObjects) {
        if (obj.destroyed || obj.char !== '~') continue;
        if (obj.waterState !== 'electrified') continue;
        const cx = obj.position.x + half;
        const cy = obj.position.y + half;
        if (Math.abs(cx - ex) < half && Math.abs(cy - ey) < half) {
          const wet = (enemy.wetDuration || 0) > 0;
          const dmg = wet ? 2 : 1;
          enemy.takeDamage(dmg);
          game.combatSystem?.createDamageNumber(dmg, enemy.position.x, enemy.position.y, wet ? '#ffff66' : '#88ddff', 1.0, 0.6);
          break;
        }
      }
    }
  }
}
