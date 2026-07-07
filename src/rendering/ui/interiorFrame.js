import { GRID } from '../../game/GameConfig.js';

/**
 * Shared picture-in-picture frame for every interior overlay (ADR-0001).
 *
 * Draws the dim exterior veil, a centered interior panel, and its border, then
 * translates into interior coordinates (so drawing at (x,y) lands at
 * canvas (offsetX+x, offsetY+y)) and sets the Unifont text draw state. Optionally
 * clips to the panel. One `ctx.save()` is taken here — the caller must
 * `ctx.restore()` it after drawing interior contents.
 *
 * Returns the computed geometry the caller needs for HUD/label placement.
 */
const DIM_ALPHA = 0.55;

export function drawInteriorFrame(ctx, { gridCols, gridRows, panelColor, borderColor, clip = false }) {
  const panelW = gridCols * GRID.CELL_SIZE;
  const panelH = gridRows * GRID.CELL_SIZE;
  const offsetX = Math.floor((GRID.WIDTH  - panelW) / 2);
  const offsetY = Math.floor((GRID.HEIGHT - panelH) / 2);

  ctx.save(); // matched by the caller's ctx.restore()

  // Dim exterior
  ctx.fillStyle = `rgba(0,0,0,${DIM_ALPHA})`;
  ctx.fillRect(0, 0, GRID.WIDTH, GRID.HEIGHT);

  // Interior panel + border
  ctx.fillStyle = panelColor;
  ctx.fillRect(offsetX, offsetY, panelW, panelH);
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 2;
  ctx.strokeRect(offsetX - 1, offsetY - 1, panelW + 2, panelH + 2);

  // Interior-coordinate offset (+ optional clip to the panel)
  ctx.translate(offsetX, offsetY);
  if (clip) {
    ctx.beginPath();
    ctx.rect(0, 0, panelW, panelH);
    ctx.clip();
  }

  ctx.font = `${GRID.CELL_SIZE}px 'Unifont', monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  return { offsetX, offsetY, panelW, panelH };
}
