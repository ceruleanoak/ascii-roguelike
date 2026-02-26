/**
 * CraftingStation - Visual representation of the crafting interface
 *
 * Displays three slots: [Left] [Center] [Right]
 * - Left and Right slots: Input ingredients
 * - Center slot: Output result (appears when valid recipe matched)
 */

import { CRAFTING, COLORS } from '../../game/GameConfig.js';

export class CraftingStation {
  constructor(renderer) {
    this.renderer = renderer;
  }

  render(game) {
    // Draw crafting slot brackets
    this.renderer.drawCell(CRAFTING.LEFT_SLOT_X, CRAFTING.STATION_Y, '[', COLORS.BORDER);
    this.renderer.drawCell(CRAFTING.LEFT_SLOT_X + 1, CRAFTING.STATION_Y, ' ', COLORS.BORDER);
    this.renderer.drawCell(CRAFTING.LEFT_SLOT_X + 2, CRAFTING.STATION_Y, ']', COLORS.BORDER);

    this.renderer.drawCell(CRAFTING.CENTER_SLOT_X, CRAFTING.STATION_Y, '[', COLORS.BORDER);
    this.renderer.drawCell(CRAFTING.CENTER_SLOT_X + 1, CRAFTING.STATION_Y, ' ', COLORS.BORDER);
    this.renderer.drawCell(CRAFTING.CENTER_SLOT_X + 2, CRAFTING.STATION_Y, ']', COLORS.BORDER);

    this.renderer.drawCell(CRAFTING.RIGHT_SLOT_X, CRAFTING.STATION_Y, '[', COLORS.BORDER);
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
  }
}
