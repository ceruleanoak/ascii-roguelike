import { GRID } from '../../game/GameConfig.js';
import { getItemData } from '../../data/items.js';
import { spectaclesTransformString, isSpectaclesActive } from '../../data/cipher.js';
import { ATTUNEMENT_COLORS } from '../../systems/FountainSystem.js';

/**
 * TreasureOfferingOverlay — centered popup for TreasureOfferingSystem.
 *
 * Drawn via the PauseSystem modal render hook, above the frozen frame. Layout
 * deliberately mirrors SlotReplacementOverlay so the two popups read as the
 * same object: dimmed frame, bordered panel, a glyph up top, a row of cells
 * with a ▼ cursor, and a single bare option label underneath.
 *
 * COMPLIANCE RULE (non-instructive UI): no key hints, no explanatory labels,
 * no "X → Y" messages. Content here is the pool glyph (tinted to the fountain's
 * current attunement), the treasure cards, the ▼ cursor, the ◀ / ▶ overflow
 * marks, the held count under each card, and the bare TOSS label. Nothing may
 * be added that explains rather than shows.
 *
 * Cards fade in over the system's input lockout window, same as
 * SlotReplacementOverlay, so the brief unresponsive beat reads as intentional.
 *
 * Unifont throughout — gem glyphs need full Unicode coverage.
 */

const DEFAULT_WATER_COLOR = '#aaddff';

// How many treasure cards fit across the panel. The system scrolls a window of
// this size and draws ◀ / ▶ when there is more to either side.
export const VISIBLE_CARDS = 3;

export class TreasureOfferingOverlay {
  render(renderer, game, state) {
    const treasures = state.treasures;
    if (!treasures || treasures.length === 0) return;

    const ctx = renderer.uiCtx;
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

    // The pool itself, wearing whatever colour it currently is. Sits where
    // SlotReplacementOverlay puts the incoming item — this is the thing you are
    // handing something to.
    const attunement = game.currentRoom?.fountain?.attunement;
    ctx.font = `${cs * 1.3}px 'Unifont', monospace`;
    ctx.fillStyle = ATTUNEMENT_COLORS[attunement] || DEFAULT_WATER_COLOR;
    ctx.fillText('~', boxX + boxW / 2, boxY + cs * 1.2);

    // Fade the cards in over the input-lockout window.
    const now = performance.now();
    const openedAt = state.openedAt ?? now;
    const readyAt = state.inputReadyAt ?? now;
    const fadeProgress = readyAt > openedAt
      ? Math.min(1, Math.max(0, (now - openedAt) / (readyAt - openedAt)))
      : 1;
    ctx.globalAlpha = fadeProgress;

    const windowStart = state.windowStart || 0;
    const visible = treasures.slice(windowStart, windowStart + VISIBLE_CARDS);
    const cellSize = cs * 2;
    const gap = cs;
    const rowW = cellSize * visible.length + gap * (visible.length - 1);
    const rowX = boxX + (boxW - rowW) / 2;
    const rowY = boxY + cs * 3;

    for (let i = 0; i < visible.length; i++) {
      const x = rowX + i * (cellSize + gap);
      const entry = visible[i];
      const selected = state.selection === windowStart + i;

      ctx.strokeStyle = selected ? '#ffff00' : '#666666';
      ctx.strokeRect(x + 0.5, rowY + 0.5, cellSize, cellSize);

      if (selected) {
        ctx.fillStyle = '#ffff00';
        ctx.font = `${cs}px 'Unifont', monospace`;
        ctx.fillText('▼', x + cellSize / 2, rowY - cs * 0.6);
      }

      ctx.font = `${cs * 1.3}px 'Unifont', monospace`;
      ctx.fillStyle = getItemData(entry.char)?.color || '#ffffff';
      ctx.fillText(entry.char, x + cellSize / 2, rowY + cellSize / 2);

      // How many of this treasure are held. A lone gem needs no count.
      if (entry.count > 1) {
        ctx.font = `${cs * 0.5}px 'Unifont', monospace`;
        ctx.fillStyle = '#888888';
        ctx.fillText(String(entry.count), x + cellSize / 2, rowY + cellSize + cs * 0.3);
      }
    }

    // Overflow marks — there is more treasure off this side of the window.
    ctx.font = `${cs}px 'Unifont', monospace`;
    ctx.fillStyle = '#999999';
    if (windowStart > 0) {
      ctx.fillText('◀', rowX - gap, rowY + cellSize / 2);
    }
    if (windowStart + VISIBLE_CARDS < treasures.length) {
      ctx.fillText('▶', rowX + rowW + gap, rowY + cellSize / 2);
    }

    // TOSS — the one thing this menu does, in the option slot where
    // SlotReplacementOverlay draws STORE IN CHEST.
    const tossY = rowY + cellSize + cs * 1.4;
    ctx.font = `${cs}px 'Unifont', monospace`;
    ctx.fillStyle = '#ffff00';
    ctx.fillText(
      spectaclesTransformString('TOSS', isSpectaclesActive(game)),
      boxX + boxW / 2,
      tossY
    );

    ctx.restore();
  }
}
