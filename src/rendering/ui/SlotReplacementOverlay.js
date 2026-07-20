import { GRID } from '../../game/GameConfig.js';
import { spectaclesTransformString, isSpectaclesActive } from '../../data/cipher.js';

/**
 * SlotReplacementOverlay — centered popup for SlotReplacementSystem.
 *
 * Drawn via the PauseSystem modal render hook, above the frozen frame.
 *
 * COMPLIANCE RULE (non-instructive UI): no key hints, no explanatory labels,
 * no "X → Y" messages. The visuals speak for themselves — the incoming item
 * glyph, the three slot cells, the ▼ cursor, and the STORE IN CHEST / DISMANTLE
 * option labels are the only content allowed. Do not add instructional text here.
 *
 * The options (slots, STORE IN CHEST, DISMANTLE) fade in over the system's
 * input lockout window so the brief unresponsive period reads as an
 * intentional beat rather than a stuck menu. The incoming item glyph is
 * drawn at full opacity immediately — it's the "you picked this up" feedback.
 *
 * Unifont throughout — item glyphs need full Unicode coverage.
 */
export class SlotReplacementOverlay {
  render(renderer, game, state) {
    const item = state.pendingItem;
    if (!item) return;

    const ctx = renderer.uiCtx;
    const cs = GRID.CELL_SIZE;

    const hasDismantle = state.dismantleIndex !== -1;
    const boxW = cs * 12;
    const boxH = cs * (hasDismantle ? 9 : 7.5);
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

    // Fade the selectable options in over the input-lockout window.
    const now = performance.now();
    const openedAt = state.openedAt ?? now;
    const readyAt = state.inputReadyAt ?? now;
    const fadeProgress = readyAt > openedAt
      ? Math.min(1, Math.max(0, (now - openedAt) / (readyAt - openedAt)))
      : 1;
    ctx.globalAlpha = fadeProgress;

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
    const reservedManaSlots = (slotType === 'consumable' && player.magicMeter?.active)
      ? (player.magicMeter.slots || [])
      : [];

    for (let i = 0; i < slots.length; i++) {
      const x = rowX + i * (cellSize + gap);
      const slot = slots[i];
      const destroyed = (slotType === 'weapon' && player.destroyedSlots?.[i])
        || reservedManaSlots.includes(i);
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

      // Small number indicator below slot
      ctx.font = `${cs * 0.5}px 'Unifont', monospace`;
      ctx.fillStyle = '#888888';
      ctx.fillText((i + 1).toString(), x + cellSize / 2, rowY + cellSize + cs * 0.3);
    }

    // STORE IN CHEST option
    const storeIndex = state.slotType === 'armor' ? 1 : state.slotType === 'consumable' ? slots.length : 3;
    const storeSelected = state.selection === storeIndex;
    const storeY = rowY + cellSize + cs * 1.4;
    ctx.font = `${cs}px 'Unifont', monospace`;
    if (storeSelected) {
      ctx.fillStyle = '#ffff00';
      ctx.fillText('▼', boxX + boxW / 2, storeY - cs);
    }
    ctx.fillStyle = storeSelected ? '#ffff00' : '#999999';
    ctx.fillText(spectaclesTransformString('STORE IN CHEST', isSpectaclesActive(game)), boxX + boxW / 2, storeY);

    // Small number indicator for STORE option
    ctx.font = `${cs * 0.5}px 'Unifont', monospace`;
    ctx.fillStyle = '#888888';
    ctx.fillText((storeIndex + 1).toString(), boxX + boxW / 2, storeY + cs * 0.6);

    // DISMANTLE option — only offered when the pending item has a known recipe
    if (hasDismantle) {
      const dismantleIndex = state.dismantleIndex;
      const dismantleSelected = state.selection === dismantleIndex;
      const dismantleY = storeY + cs * 1.5;
      ctx.font = `${cs}px 'Unifont', monospace`;
      if (dismantleSelected) {
        ctx.fillStyle = '#ffff00';
        ctx.fillText('▼', boxX + boxW / 2, dismantleY - cs);
      }
      ctx.fillStyle = dismantleSelected ? '#ffff00' : '#999999';
      ctx.fillText(spectaclesTransformString('DISMANTLE', isSpectaclesActive(game)), boxX + boxW / 2, dismantleY);

      // Small number indicator for DISMANTLE option
      ctx.font = `${cs * 0.5}px 'Unifont', monospace`;
      ctx.fillStyle = '#888888';
      ctx.fillText((dismantleIndex + 1).toString(), boxX + boxW / 2, dismantleY + cs * 0.6);
    }

    ctx.restore();
  }
}
