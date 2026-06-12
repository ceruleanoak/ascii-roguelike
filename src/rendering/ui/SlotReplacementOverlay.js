import { GRID } from '../../game/GameConfig.js';

/**
 * SlotReplacementOverlay — centered popup for SlotReplacementSystem.
 *
 * Drawn via the PauseSystem modal render hook, above the frozen frame.
 *
 * COMPLIANCE RULE (non-instructive UI): no key hints, no explanatory labels,
 * no "X → Y" messages. The visuals speak for themselves — the incoming item
 * glyph, the three slot cells, the ▼ cursor, and the STORE IN CHEST option
 * label are the only content allowed. Do not add instructional text here.
 *
 * Unifont throughout — item glyphs need full Unicode coverage.
 */
export class SlotReplacementOverlay {
  render(renderer, game, state) {
    const item = state.pendingItem;
    if (!item) return;

    const ctx = renderer.fgCtx;
    const cs = GRID.CELL_SIZE;

    const boxW = cs * 12;
    const boxH = cs * 7.5;
    const boxX = Math.floor((GRID.WIDTH - boxW) / 2);
    const boxY = Math.floor((GRID.HEIGHT - boxH) / 2);

    ctx.save();

    // Dim the frozen frame, then draw the panel
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(0, 0, GRID.WIDTH, GRID.HEIGHT);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.92)';
    ctx.fillRect(boxX, boxY, boxW, boxH);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.strokeRect(boxX + 0.5, boxY + 0.5, boxW - 1, boxH - 1);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Incoming item glyph
    ctx.font = `${cs * 1.3}px 'Unifont', monospace`;
    ctx.fillStyle = item.data?.color || '#ffffff';
    ctx.fillText(item.char, boxX + boxW / 2, boxY + cs * 1.2);

    const slotType = state.slotType || 'weapon';
    const cellSize = cs * 2;
    const gap = cs;

    // Build the slot data array for whichever slot type we're displaying
    let slots;
    if (slotType === 'armor') {
      slots = [game.inventorySystem.equippedArmor];
    } else if (slotType === 'consumable') {
      slots = [...game.inventorySystem.equippedConsumables];
    } else {
      slots = [...game.player.quickSlots];
    }

    const rowW = cellSize * slots.length + gap * (slots.length - 1);
    const rowX = boxX + (boxW - rowW) / 2;
    const rowY = boxY + cs * 3;
    const player = game.player;

    for (let i = 0; i < slots.length; i++) {
      const x = rowX + i * (cellSize + gap);
      const slot = slots[i];
      const destroyed = slotType === 'weapon' && player.destroyedSlots?.[i];
      const selected = state.selection === i;

      ctx.strokeStyle = selected ? '#ffff00' : '#666666';
      ctx.strokeRect(x + 0.5, rowY + 0.5, cellSize, cellSize);

      if (selected) {
        ctx.fillStyle = '#ffff00';
        ctx.font = `${cs}px 'Unifont', monospace`;
        ctx.fillText('▼', x + cellSize / 2, rowY - cs * 0.6);
      }

      ctx.font = `${cs * 1.3}px 'Unifont', monospace`;
      if (destroyed) {
        ctx.fillStyle = '#553333';
        ctx.fillText('x', x + cellSize / 2, rowY + cellSize / 2);
      } else if (slot) {
        ctx.fillStyle = slot.data?.color || '#ffffff';
        ctx.fillText(slot.char, x + cellSize / 2, rowY + cellSize / 2);
      }
    }

    // STORE IN CHEST option
    const storeSelected = state.selection === 3;
    const storeY = rowY + cellSize + cs * 1.4;
    ctx.font = `${cs}px 'Unifont', monospace`;
    if (storeSelected) {
      ctx.fillStyle = '#ffff00';
      ctx.fillText('▼', boxX + boxW / 2, storeY - cs);
    }
    ctx.fillStyle = storeSelected ? '#ffff00' : '#999999';
    ctx.fillText('STORE IN CHEST', boxX + boxW / 2, storeY);

    ctx.restore();
  }
}
