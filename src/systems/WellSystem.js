/**
 * WellSystem — handles the W-room well ritual.
 *
 * The W exit letter generates a ROOM_TYPES.WELL room with a single circular
 * well at its center. The well accepts three offerings:
 *
 *   ¤  Infused Coin (consumable slot)  → activates the magic meter
 *   ★  Lucky Coin   (consumable slot)  → permanent half-power luck blessing
 *   c  Coin         (raw ingredient)    → hollow plink, well stays usable
 *
 * All three offerings play the spinning-arc animation. Slot offerings (¤, ★)
 * land with a flash and consume the well. Raw-coin offerings land with the
 * same plink but no flash, and do NOT consume the well — the player is just
 * probing it.
 */

import { GRID, ROOM_TYPES } from '../game/GameConfig.js';

const PROXIMITY_RADIUS = GRID.CELL_SIZE * 3;     // player must be within 3 cells of well center
const ARC_DURATION = 0.55;                       // total seconds for the coin arc
const ARC_PEAK_HEIGHT = GRID.CELL_SIZE * 4;      // how high the arc peaks above the midpoint
const FLASH_DURATION = 0.6;                      // screen flash fade time

export class WellSystem {
  constructor(game) {
    this.game = game;
  }

  // Per-frame: animate any in-flight coin and tick the screen flash.
  update(dt) {
    const game = this.game;

    if (game.wellCoinAnim) {
      // Abort cleanly if the player warped out mid-arc — the coin is already
      // consumed (room.well.consumed = true) so the well stays inert, but we
      // skip activating the meter in a different room.
      if (game.wellCoinAnim.room && game.wellCoinAnim.room !== game.currentRoom) {
        game.wellCoinAnim = null;
      } else {
        game.wellCoinAnim.t += dt;
        game.wellCoinAnim.spinPhase += dt * 12; // spin speed
        if (game.wellCoinAnim.t >= ARC_DURATION) {
          const anim = game.wellCoinAnim;
          game.wellCoinAnim = null;
          this._completeRitual(anim);
        }
      }
    }

    if (game.wellFlashTimer > 0) {
      game.wellFlashTimer = Math.max(0, game.wellFlashTimer - dt);
    }
  }

  // Returns true if it consumed the SPACE press (well + offering in range).
  handleSpacePress() {
    const game = this.game;
    const player = game.player;
    const room = game.currentRoom;

    if (!player || !room) return false;
    if (room.type !== ROOM_TYPES.WELL) return false;
    if (!room.well) return false;
    if (game.wellCoinAnim) return true; // ritual in progress, swallow input

    const wellCx = room.well.centerX;
    const wellCy = room.well.centerY;
    const px = player.position.x + GRID.CELL_SIZE / 2;
    const py = player.position.y + GRID.CELL_SIZE / 2;
    const dx = px - wellCx;
    const dy = py - wellCy;
    if (dx * dx + dy * dy > PROXIMITY_RADIUS * PROXIMITY_RADIUS) return false;

    // Slot offerings (¤, ★) require the well to still be usable.
    if (!room.well.consumed) {
      const offering = this._findOfferingSlot();
      if (offering) {
        // Skip if this offering is redundant for the current state.
        if (offering.type === 'infused' && player.magicMeter?.active) return false;
        if (offering.type === 'lucky'   && player.luckBlessed)        return false;

        game.wellCoinAnim = {
          startX: px,
          startY: py,
          endX: wellCx,
          endY: wellCy,
          t: 0,
          spinPhase: 0,
          slotIndex: offering.index,
          offeringType: offering.type,   // 'infused' | 'lucky'
          room                            // anim aborts if player warps out
        };

        // Lock the well immediately so a second SPACE during the arc can't re-fire.
        room.well.consumed = true;
        return true;
      }
    }

    // Raw coin probe (`c` ingredient): always available, doesn't consume the well.
    // Plays the spinning arc + hollow plink — the well's indifferent response
    // that nudges the player toward crafting the real offering.
    if (game.inventorySystem?.hasCoin()) {
      game.inventorySystem.removeCoin();
      game.wellCoinAnim = {
        startX: px,
        startY: py,
        endX: wellCx,
        endY: wellCy,
        t: 0,
        spinPhase: 0,
        slotIndex: -1,
        offeringType: 'raw',
        room
      };
      return true;
    }

    return false;
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  // Returns the first slot holding a recognized offering, or null. Infused Coin
  // takes priority when both are equipped (the magic meter is the more central
  // ritual; players who want the lucky blessing can move the coins around).
  _findOfferingSlot() {
    const inv = this.game.inventorySystem;
    if (!inv) return null;
    const slots = inv.equippedConsumables || [];
    let luckyIndex = -1;
    for (let i = 0; i < slots.length; i++) {
      const ch = slots[i]?.data?.char;
      if (ch === '¤') return { index: i, type: 'infused' };
      if (ch === '★' && luckyIndex < 0) luckyIndex = i;
    }
    if (luckyIndex >= 0) return { index: luckyIndex, type: 'lucky' };
    return null;
  }

  _completeRitual(anim) {
    const game = this.game;
    const player = game.player;
    const inv = game.inventorySystem;
    if (!player || !inv) return;

    // The coin lands. Same plink for ¤ and ★ — the well's voice doesn't
    // distinguish offerings, only the player's reward does.
    game.audioSystem?.playSFX?.('coin_plink');

    // Raw-coin probe: plink + message only. No slot consumption, no flash,
    // no meter activation. The `c` ingredient was already removed at SPACE press.
    if (anim.offeringType === 'raw') {
      game.menuSystem?.showPickupMessage?.('THE WELL IS QUIET.');
      game.menuSystem?.updateUI?.();
      return;
    }

    // Consume the offering coin from its slot.
    const slotIndex = anim.slotIndex;
    const expectedChar = anim.offeringType === 'lucky' ? '★' : '¤';
    if (inv.equippedConsumables[slotIndex]?.data?.char === expectedChar) {
      inv.equippedConsumables[slotIndex] = null;
    }
    if (player.equippedConsumables && player.equippedConsumables[slotIndex]?.data?.char === expectedChar) {
      player.equippedConsumables[slotIndex] = null;
    }

    if (anim.offeringType === 'lucky') {
      // Permanent half-power luck blessing for the rest of the run. Loot/exit
      // hooks read player.luckBlessed; the next applyEquipmentEffectsToPlayer
      // pass will leave the flag intact since it lives outside the recompute.
      player.luckBlessed = true;
      // Placeholder fanfare — reusing boss_defeat until a dedicated lucky cue exists.
      game.audioSystem?.playSFX?.('boss_defeat');
      game.menuSystem?.showPickupMessage?.('FEELING LUCKY.');
    } else {
      // Activate the magic meter on the slot we just cleared.
      game.magicSystem?.activateMagicMeter(player, slotIndex);

      // Top off the meter so the player can immediately try a wand if they have
      // one, and so the ritual feels rewarding rather than like they've taken on
      // a chore.
      if (player.magicMeter?.active) {
        player.magicMeter.current = player.magicMeter.max;
      }
      game.menuSystem?.showPickupMessage?.('THE WELL ANSWERS.');
    }

    // If another valid offering is still equipped, re-open the well so the
    // player can sequence both rituals (e.g. ¤ then ★ in the same visit).
    const next = this._findOfferingSlot();
    if (next) {
      const redundant =
        (next.type === 'infused' && player.magicMeter?.active) ||
        (next.type === 'lucky'   && player.luckBlessed);
      if (!redundant) anim.room.well.consumed = false;
    }

    game.wellFlashTimer = FLASH_DURATION;
    game.wellFlashDuration = FLASH_DURATION;
    game.menuSystem?.updateUI?.();
    game.renderer.backgroundDirty = true;
  }
}
