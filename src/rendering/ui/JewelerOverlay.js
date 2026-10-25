import { GRID } from '../../game/GameConfig.js';
import { getItemData } from '../../data/items.js';
import { JEWELER_WARES } from '../../data/jewelerWares.js';

/**
 * JewelerOverlay — centered popup for JewelerSystem's necklace wares.
 *
 * Drawn via the PauseSystem modal render hook, above the frozen frame. Same
 * panel, cursor and fade as ShopOverlay: renderer.uiCtx, Unifont-only, dim +
 * bordered panel, ▼ selection cursor, fade synced to the 1000ms input
 * lockout.
 *
 * COMPLIANCE RULE (non-instructive UI): glyphs only. Each row is the
 * necklace in brackets, then what it costs — its gem glyphs and a coin
 * count. A row the player can't pay for is drawn dim. No names, no headers,
 * no key hints.
 */

const BRACKET_COLOR = '#ffff00'; // CONSUMABLE role color, as in ShopOverlay
const COIN_COLOR = '#ffcc66';    // matches drawCoinArc's coin frames
const DIM = '#555555';

export class JewelerOverlay {
  render(renderer, game, state) {
    if (!state.jeweler) return;
    const ctx = renderer.uiCtx;
    const cs = GRID.CELL_SIZE;
    const rowH = cs * 1.6;
    const maxGems = Math.max(...JEWELER_WARES.map(r => r.gems.length));

    // Bracketed glyph + gap + the widest cost strip (gems + coin count).
    const boxW = cs * (4 + maxGems + 2);
    const boxH = cs * 1.4 + JEWELER_WARES.length * rowH;
    const boxX = Math.floor((GRID.WIDTH - boxW) / 2);
    const boxY = Math.floor((GRID.HEIGHT - boxH) / 2);

    ctx.save();
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';

    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(0, 0, GRID.WIDTH, GRID.HEIGHT);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.92)';
    ctx.fillRect(boxX, boxY, boxW, boxH);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.strokeRect(boxX + 0.5, boxY + 0.5, boxW - 1, boxH - 1);

    ctx.globalAlpha = this._fadeProgress(state);

    const colX = boxX + cs * 1.5;
    const costX = boxX + cs * 3.5;
    const startY = boxY + cs * 1.4;

    for (let i = 0; i < JEWELER_WARES.length; i++) {
      const row = JEWELER_WARES[i];
      const y = startY + i * rowH;
      const affordable = state.canAfford(row);

      if (state.rowIndex === i) {
        ctx.font = `${cs * 0.9}px 'Unifont', monospace`;
        ctx.fillStyle = '#ffff00';
        ctx.fillText('▼', colX, y - cs * 0.9);
      }

      ctx.font = `${cs}px 'Unifont', monospace`;
      ctx.fillStyle = affordable ? BRACKET_COLOR : DIM;
      ctx.fillText('[', colX - cs * 0.55, y);
      ctx.fillText(']', colX + cs * 0.55, y);
      ctx.fillStyle = affordable ? (getItemData(row.char)?.color || '#ffffff') : DIM;
      ctx.fillText(row.char, colX, y);

      row.gems.forEach((gem, g) => {
        ctx.fillStyle = affordable ? (getItemData(gem)?.color || '#ffffff') : DIM;
        ctx.fillText(gem, costX + g * cs, y);
      });
      const coinX = costX + row.gems.length * cs + cs * 0.5;
      ctx.fillStyle = affordable ? COIN_COLOR : DIM;
      ctx.fillText('c', coinX, y);
      ctx.font = `${cs * 0.6}px 'Unifont', monospace`;
      ctx.fillStyle = affordable ? '#888888' : DIM;
      ctx.fillText(String(row.coins), coinX + cs * 0.6, y + cs * 0.25);
    }

    ctx.restore();
  }

  _fadeProgress(state) {
    const now = performance.now();
    const openedAt = state.openedAt ?? now;
    const readyAt = state.inputReadyAt ?? now;
    return readyAt > openedAt
      ? Math.min(1, Math.max(0, (now - openedAt) / (readyAt - openedAt)))
      : 1;
  }
}
