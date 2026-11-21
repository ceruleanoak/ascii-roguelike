/**
 * CraftingStation - Visual representation of the crafting interface
 *
 * Displays three slots: [Left] [Center] [Right]
 * - Left and Right slots: Input ingredients
 * - Center slot: Output result (appears when valid recipe matched)
 * - Cycling animation (gold) when two identical weapons are placed
 * - "CRAFT" label rendered in dark gray below the slots
 */

import { CRAFTING, COLORS, GRID } from '../../game/GameConfig.js';
import { shiverOffset, isAtCraftingSlot } from '../effects/ShiverDraw.js';

// Ember tell (CraftingSystem.emberTell) — REST station only; the forge never raises it.
export const EMBER_TELL_CHAR = '*';
export const EMBER_TELL_COLOR = '#aa4400';

export class CraftingStation {
  constructor(renderer) {
    this.renderer = renderer;
  }

  /**
   * Called every frame on the foreground pass — draws the three slots'
   * brackets and contents. The slot the player stands at shivers (brackets
   * and content together, with the SPACE / SHIFT hints in RestRenderer and
   * ArrowKeyIndicators), so the station reads as the thing those keys act on.
   * Drawn on the foreground rather than the cached background because a cell
   * that moves every frame can't live in a layer that repaints only when dirty.
   */
  renderForeground(game) {
    // REST's chrome goes gray once a Cursed run has run far enough.
    const chrome = game.cursedRunSystem.restChromeColor(game);
    const state = game.craftingSystem.getState();
    const nearestSlot = game.getNearestInteractiveSlot();
    const shiver = isAtCraftingSlot(nearestSlot) ? shiverOffset() : null;

    const ctx = this.renderer.fgCtx;
    ctx.save();
    ctx.font = `${GRID.CELL_SIZE}px 'Unifont', monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    this._drawSlot(ctx, 'crafting-left', CRAFTING.LEFT_SLOT_X, chrome,
      state.leftSlot ? { char: state.leftSlot, color: COLORS.ITEM } : null, nearestSlot, shiver);
    this._drawSlot(ctx, 'crafting-center', CRAFTING.CENTER_SLOT_X, chrome,
      this._centerContent(state), nearestSlot, shiver);
    this._drawSlot(ctx, 'crafting-right', CRAFTING.RIGHT_SLOT_X, chrome,
      state.rightSlot ? { char: state.rightSlot, color: COLORS.ITEM } : null, nearestSlot, shiver);

    ctx.restore();
  }

  /** What the center slot shows this frame: the cycling pool, the result, or the Ember tell. */
  _centerContent(state) {
    if (state.cycleState) {
      const { pool, cyclingStartTime } = state.cycleState;
      const idx = Math.floor((performance.now() - cyclingStartTime) / 100) % pool.length;
      return { char: pool[idx], color: '#ffcc00' };
    }
    if (state.centerSlot) return { char: state.centerSlot, color: COLORS.ITEM };
    // A Forge Recipe pair: a dim, unclaimable ember — needs the Dragon Forge.
    if (state.emberTell) return { char: EMBER_TELL_CHAR, color: EMBER_TELL_COLOR };
    return null;
  }

  /** One `[x]` slot, its left bracket at column `col`; shivers when it is the nearest slot. */
  _drawSlot(ctx, type, col, chrome, content, nearestSlot, shiver) {
    const cs = GRID.CELL_SIZE;
    const lit = shiver && nearestSlot.type === type;
    const dx = lit ? shiver.x : 0;
    const dy = lit ? shiver.y : 0;
    const cy = CRAFTING.STATION_Y * cs + cs / 2 + dy;
    const cellX = (c) => c * cs + cs / 2 + dx;

    ctx.fillStyle = chrome;
    ctx.fillText('[', cellX(col), cy);
    ctx.fillText(']', cellX(col + 2), cy);
    if (content) {
      ctx.fillStyle = content.color;
      ctx.fillText(content.char, cellX(col + 1), cy);
    }
  }
}
