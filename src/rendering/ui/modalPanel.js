import { GRID } from '../../game/GameConfig.js';
import { spectaclesTransformString, isSpectaclesActive } from '../../data/cipher.js';

/**
 * modalPanel — the drawing pieces every centered PauseSystem popup shares
 * (ShopOverlay, JewelerOverlay, BridgeOverlay, WeaponsMasterOverlay): the
 * dimmed frame + bordered panel, the fade synced to the system's input
 * lockout, and the vertical front menu with its ▼ cursor.
 */

/** Dims the frozen frame, then draws the black bordered panel. */
export function drawModalPanel(ctx, x, y, w, h) {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.fillRect(0, 0, GRID.WIDTH, GRID.HEIGHT);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.92)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}

/** 0→1 across the modal's input lockout (`state.openedAt` → `state.inputReadyAt`). */
export function modalFadeProgress(state) {
  const now = performance.now();
  const openedAt = state.openedAt ?? now;
  const readyAt = state.inputReadyAt ?? now;
  return readyAt > openedAt
    ? Math.min(1, Math.max(0, (now - openedAt) / (readyAt - openedAt)))
    : 1;
}

/**
 * A centered vertical menu of bare labels, the selected one yellow under a ▼
 * (the Shop's WARES/PAWN layer). Each row is `{ label, glyph?, glyphColor? }`:
 * a glyph is drawn after its label. `header`, when given, is a dim label
 * above the rows. `minWidthCells` keeps the panel from shrinking below the
 * Shop's front-menu width.
 */
export function drawModalMenu(ctx, game, state, { rows, index, header = null, minWidthCells = 7 }) {
  const cs = GRID.CELL_SIZE;
  const rowH = cs * 1.8;
  const spectacles = isSpectaclesActive(game);

  ctx.font = `${cs}px 'Unifont', monospace`;
  let maxW = 0;
  for (const row of rows) {
    const w = ctx.measureText(row.label).width + (row.glyph ? cs * 1.5 : 0);
    maxW = Math.max(maxW, w);
  }
  if (header) maxW = Math.max(maxW, ctx.measureText(header).width);

  const headerH = header ? cs * 1.6 : 0;
  const boxW = Math.max(cs * minWidthCells, maxW + cs * 3);
  const boxH = cs * 1.6 + headerH + rows.length * rowH;
  const boxX = Math.floor((GRID.WIDTH - boxW) / 2);
  const boxY = Math.floor((GRID.HEIGHT - boxH) / 2);

  drawModalPanel(ctx, boxX, boxY, boxW, boxH);
  ctx.globalAlpha = modalFadeProgress(state);

  const midX = boxX + boxW / 2;
  ctx.textAlign = 'center';

  if (header) {
    ctx.font = `${cs * 0.85}px 'Unifont', monospace`;
    ctx.fillStyle = '#888888';
    ctx.fillText(spectaclesTransformString(header, spectacles), midX, boxY + cs * 1.1);
  }

  const startY = boxY + cs * 1.6 + headerH;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const y = startY + i * rowH;
    const selected = index === i;

    if (selected) {
      ctx.font = `${cs * 0.9}px 'Unifont', monospace`;
      ctx.fillStyle = '#ffff00';
      ctx.fillText('▼', midX, y - cs * 0.9);
    }

    ctx.font = `${cs}px 'Unifont', monospace`;
    const label = spectaclesTransformString(row.label, spectacles);
    const labelX = row.glyph ? midX - cs * 0.75 : midX;
    ctx.fillStyle = selected ? '#ffff00' : '#cccccc';
    ctx.fillText(label, labelX, y);
    if (row.glyph) {
      ctx.fillStyle = row.glyphColor || '#ffffff';
      ctx.fillText(row.glyph, labelX + ctx.measureText(label).width / 2 + cs * 0.9, y);
    }
  }

  ctx.globalAlpha = 1;
}
