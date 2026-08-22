import { GRID } from '../../game/GameConfig.js';
import { getItemData } from '../../data/items.js';
import { spectaclesTransformString, isSpectaclesActive } from '../../data/cipher.js';

/**
 * ShopOverlay — centered popup for ShopSystem (Settlement Shopkeeper).
 *
 * Drawn via the PauseSystem modal render hook, above the frozen frame.
 * Structural clone of SlotReplacementOverlay: renderer.uiCtx, Unifont-only,
 * dim+bordered panel, ▼ selection cursor, fadeProgress synced to the
 * system's 1000ms input lockout.
 *
 * COMPLIANCE RULE (non-instructive UI): no key hints, no explanatory labels,
 * no "X → Y" messages. Content is limited to glyphs, role-colored brackets,
 * the ▼ cursor, bare item names, SOLD / CONFIRM?, and small dim (#888888)
 * numbers. Row cost is never shown on mere list-cursor highlight — only
 * once a row is opened into barter mode does its lane strip appear.
 */

// Role-bracket colors, duplicated from EquipmentSlots.js (method-local
// consts there, not exported) — "colors match REST slots."
const BRIGHT_AMBER = '#ffaa44';  // WEAPON
const BRIGHT_BLUE = '#aaccff';   // ARMOR
const YELLOW = '#ffff00';        // CONSUMABLE

function roleColor(role) {
  if (role === 'WEAPON') return BRIGHT_AMBER;
  if (role === 'ARMOR') return BRIGHT_BLUE;
  return YELLOW;
}

function laneGlyph(lane) {
  if (lane.type === 'coins') return { char: 'c', color: '#ffcc66' }; // matches drawCoinArc's coin frames
  const data = getItemData(lane.char);
  return { char: lane.char, color: data?.color || '#ffffff' };
}

export class ShopOverlay {
  render(renderer, game, state) {
    if (!state.shopkeeper) return;

    const ctx = renderer.uiCtx;
    ctx.save();
    ctx.textBaseline = 'middle';

    if (state.mode === 'list') this._renderList(ctx, game, state);
    else this._renderBarter(ctx, game, state);

    ctx.restore();
  }

  _drawPanel(ctx, x, y, w, h) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(0, 0, GRID.WIDTH, GRID.HEIGHT);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.92)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }

  _fadeProgress(state) {
    const now = performance.now();
    const openedAt = state.openedAt ?? now;
    const readyAt = state.inputReadyAt ?? now;
    return readyAt > openedAt
      ? Math.min(1, Math.max(0, (now - openedAt) / (readyAt - openedAt)))
      : 1;
  }

  _renderList(ctx, game, state) {
    const cs = GRID.CELL_SIZE;
    const stock = state.shopkeeper.stock;
    const rowH = cs * 1.6;

    // Width scales to the longest label so item names never clip.
    ctx.font = `${cs * 0.85}px 'Unifont', monospace`;
    let maxNameW = 0;
    for (const row of stock) {
      const text = row.sold ? 'SOLD' : row.name.toUpperCase();
      maxNameW = Math.max(maxNameW, ctx.measureText(text).width);
    }

    const boxW = cs * 4.5 + maxNameW;
    const boxH = cs * 1.4 + stock.length * rowH;
    const boxX = Math.floor((GRID.WIDTH - boxW) / 2);
    const boxY = Math.floor((GRID.HEIGHT - boxH) / 2);

    this._drawPanel(ctx, boxX, boxY, boxW, boxH);
    ctx.globalAlpha = this._fadeProgress(state);

    const colX = boxX + cs * 1.5;
    const nameX = boxX + cs * 3;
    const startY = boxY + cs * 1.4;

    for (let i = 0; i < stock.length; i++) {
      const row = stock[i];
      const y = startY + i * rowH;
      const selected = state.rowIndex === i;
      const bracketColor = row.sold ? '#555555' : roleColor(row.role);

      ctx.textAlign = 'center';

      if (selected) {
        ctx.font = `${cs * 0.9}px 'Unifont', monospace`;
        ctx.fillStyle = '#ffff00';
        ctx.fillText('▼', colX, y - cs * 0.9);
      }

      ctx.font = `${cs}px 'Unifont', monospace`;
      ctx.fillStyle = bracketColor;
      ctx.fillText('[', colX - cs * 0.55, y);
      ctx.fillText(']', colX + cs * 0.55, y);
      ctx.fillStyle = row.sold ? '#555555' : row.color;
      ctx.fillText(row.char, colX, y);

      if (row.sold || selected) {
        ctx.save();
        ctx.textAlign = 'left';
        ctx.font = `${cs * 0.85}px 'Unifont', monospace`;
        ctx.fillStyle = row.sold ? '#555555' : '#cccccc';
        ctx.fillText(
          spectaclesTransformString(row.sold ? 'SOLD' : row.name.toUpperCase(), isSpectaclesActive(game)),
          nameX, y
        );
        ctx.restore();
      }
    }

    ctx.globalAlpha = 1;
  }

  _renderBarter(ctx, game, state) {
    const cs = GRID.CELL_SIZE;
    const row = state.currentRow;
    const lanes = state.lanes;
    const laneCell = cs * 1.8;
    const gap = cs * 0.5;

    ctx.font = `${cs * 0.85}px 'Unifont', monospace`;
    const headerNameW = ctx.measureText(row.name.toUpperCase()).width;
    const laneRowW = laneCell * lanes.length + gap * (lanes.length - 1);

    const boxW = Math.max(cs * 3 + headerNameW + cs * 2, laneRowW + cs * 3);
    const boxH = cs * 7;
    const boxX = Math.floor((GRID.WIDTH - boxW) / 2);
    const boxY = Math.floor((GRID.HEIGHT - boxH) / 2);

    this._drawPanel(ctx, boxX, boxY, boxW, boxH);
    ctx.globalAlpha = this._fadeProgress(state);

    // Header: glyph + NAME, or CONFIRM? once the cost is met.
    const headerY = boxY + cs * 1.6;
    if (state.isCostMet()) {
      ctx.textAlign = 'center';
      ctx.font = `${cs}px 'Unifont', monospace`;
      ctx.fillStyle = '#ffff00';
      ctx.fillText(spectaclesTransformString('CONFIRM?', isSpectaclesActive(game)), boxX + boxW / 2, headerY);
    } else {
      const glyphX = boxX + boxW / 2 - headerNameW / 2 - cs;
      ctx.textAlign = 'center';
      ctx.font = `${cs * 1.2}px 'Unifont', monospace`;
      ctx.fillStyle = row.color;
      ctx.fillText(row.char, glyphX, headerY);

      ctx.textAlign = 'left';
      ctx.font = `${cs * 0.85}px 'Unifont', monospace`;
      ctx.fillStyle = '#cccccc';
      ctx.fillText(
        spectaclesTransformString(row.name.toUpperCase(), isSpectaclesActive(game)),
        glyphX + cs, headerY
      );
    }

    // Lane strip
    const rowX = boxX + (boxW - laneRowW) / 2;
    const rowY = boxY + cs * 4;

    for (let i = 0; i < lanes.length; i++) {
      const lane = lanes[i];
      const x = rowX + i * (laneCell + gap) + laneCell / 2;
      const on = state.toggled[i];
      const { char, color } = laneGlyph(lane);

      ctx.textAlign = 'center';

      if (state.barterIndex === i) {
        ctx.font = `${cs * 0.9}px 'Unifont', monospace`;
        ctx.fillStyle = '#ffff00';
        ctx.fillText('▼', x, rowY - cs);
      }

      const bracketColor = on ? '#ffff00' : '#666666';
      ctx.font = `${cs}px 'Unifont', monospace`;
      ctx.fillStyle = bracketColor;
      ctx.fillText('[', x - cs * 0.55, rowY);
      ctx.fillText(']', x + cs * 0.55, rowY);
      ctx.fillStyle = color;
      ctx.fillText(char, x, rowY);

      if (lane.type === 'coins') {
        ctx.font = `${cs * 0.5}px 'Unifont', monospace`;
        ctx.fillStyle = '#888888';
        ctx.fillText(state.getRemainingCoinPrice().toString(), x, rowY + cs * 1.1);
      }
    }

    ctx.globalAlpha = 1;
  }
}
