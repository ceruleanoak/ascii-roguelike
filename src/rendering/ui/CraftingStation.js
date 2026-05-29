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

export class CraftingStation {
  constructor(renderer) {
    this.renderer = renderer;
  }

  /** Called on background pass — draws brackets and static slot contents. */
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
    // Static center slot — only drawn here when NOT cycling (cycling draws on foreground every frame)
    if (state.centerSlot && !state.cycleState) {
      this.renderer.drawCell(CRAFTING.CENTER_SLOT_X + 1, CRAFTING.STATION_Y, state.centerSlot, COLORS.ITEM);
    }
  }

  /** Called every frame on the foreground pass — animates the cycling center slot. */
  renderForeground(game) {
    const state = game.craftingSystem.getState();
    if (!state.cycleState) return;

    const { pool, cyclingStartTime } = state.cycleState;
    const idx = Math.floor((performance.now() - cyclingStartTime) / 100) % pool.length;
    const char = pool[idx];

    const ctx = this.renderer.fgCtx;
    const halfCell = GRID.CELL_SIZE / 2;
    const px = (CRAFTING.CENTER_SLOT_X + 1) * GRID.CELL_SIZE + halfCell;
    const py = CRAFTING.STATION_Y * GRID.CELL_SIZE + halfCell;

    ctx.save();
    ctx.font = `${GRID.CELL_SIZE}px 'Unifont', monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffcc00';
    ctx.fillText(char, px, py);
    ctx.restore();
  }
}
