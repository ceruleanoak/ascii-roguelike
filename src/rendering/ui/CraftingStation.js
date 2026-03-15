/**
 * CraftingStation - Visual representation of the crafting interface
 *
 * Displays three slots: [Left] [Center] [Right]
 * - Left and Right slots: Input ingredients
 * - Center slot: Output result (appears when valid recipe matched)
 * - "CRAFT" label rendered in dark gray below the slots
 */

import { CRAFTING, COLORS, GRID } from '../../game/GameConfig.js';

export class CraftingStation {
  constructor(renderer) {
    this.renderer = renderer;
  }

  render(game) {
    // Draw crafting slot brackets
    this.renderer.drawCell(CRAFTING.LEFT_SLOT_X,     CRAFTING.STATION_Y, '[', COLORS.BORDER);
    this.renderer.drawCell(CRAFTING.LEFT_SLOT_X + 1, CRAFTING.STATION_Y, ' ', COLORS.BORDER);
    this.renderer.drawCell(CRAFTING.LEFT_SLOT_X + 2, CRAFTING.STATION_Y, ']', COLORS.BORDER);

    this.renderer.drawCell(CRAFTING.CENTER_SLOT_X,     CRAFTING.STATION_Y, '[', COLORS.BORDER);
    this.renderer.drawCell(CRAFTING.CENTER_SLOT_X + 1, CRAFTING.STATION_Y, ' ', COLORS.BORDER);
    this.renderer.drawCell(CRAFTING.CENTER_SLOT_X + 2, CRAFTING.STATION_Y, ']', COLORS.BORDER);

    this.renderer.drawCell(CRAFTING.RIGHT_SLOT_X,     CRAFTING.STATION_Y, '[', COLORS.BORDER);
    this.renderer.drawCell(CRAFTING.RIGHT_SLOT_X + 1, CRAFTING.STATION_Y, ' ', COLORS.BORDER);
    this.renderer.drawCell(CRAFTING.RIGHT_SLOT_X + 2, CRAFTING.STATION_Y, ']', COLORS.BORDER);

    // Draw slot contents
    const state = game.craftingSystem.getState();
    if (state.leftSlot) {
      this.renderer.drawCell(CRAFTING.LEFT_SLOT_X + 1, CRAFTING.STATION_Y, state.leftSlot, COLORS.ITEM);
    }
    if (state.rightSlot) {
      this.renderer.drawCell(CRAFTING.RIGHT_SLOT_X + 1, CRAFTING.STATION_Y, state.rightSlot, COLORS.ITEM);
    }
    if (state.centerSlot) {
      this.renderer.drawCell(CRAFTING.CENTER_SLOT_X + 1, CRAFTING.STATION_Y, state.centerSlot, COLORS.ITEM);
    }

    // Draw "C R A F T" label below slots in dark gray
    const labelCenterX = GRID.WIDTH / 2;
    const labelY = (CRAFTING.STATION_Y + 2) * GRID.CELL_SIZE + GRID.CELL_SIZE / 2;

    this.renderer.bgCtx.save();
    this.renderer.bgCtx.font = `${GRID.CELL_SIZE}px 'VentureArcade', 'Unifont', monospace`;
    this.renderer.bgCtx.textAlign = 'center';
    this.renderer.bgCtx.textBaseline = 'middle';
    this.renderer.bgCtx.fillStyle = '#666666';
    this.renderer.bgCtx.fillText(' C R A F T', labelCenterX, labelY);
    this.renderer.bgCtx.restore();

  }
}
