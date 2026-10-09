/**
 * UnicodeTable — the CLI's full-screen glyph picker: a flat grid of every
 * glyph a crafted item may take (cliTables.craftableGlyphs), scrolled by rows
 * so the selection stays in view. The selected glyph is drawn in yellow on a
 * dim cell. Glyphs Unifont lacks render as its fallback box.
 */

import { GRID } from '../../game/GameConfig.js';
import { GLYPH_COLUMNS } from '../../systems/cliTables.js';

const SELECTED = '#ffff00';
const GLYPH = '#cccccc';
const SELECTED_CELL = '#333333';

export function drawUnicodeTable(ctx, glyphs, index) {
  const cell = GRID.WIDTH / GLYPH_COLUMNS;
  const visibleRows = Math.floor(GRID.HEIGHT / cell);
  const totalRows = Math.ceil(glyphs.length / GLYPH_COLUMNS);
  const selectedRow = Math.floor(index / GLYPH_COLUMNS);
  const firstRow = Math.max(0, Math.min(selectedRow - Math.floor(visibleRows / 2), totalRows - visibleRows));
  const top = (GRID.HEIGHT - visibleRows * cell) / 2;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${Math.round(cell * 0.7)}px 'Unifont', monospace`;
  for (let row = 0; row < visibleRows; row++) {
    for (let col = 0; col < GLYPH_COLUMNS; col++) {
      const i = (firstRow + row) * GLYPH_COLUMNS + col;
      if (i >= glyphs.length) return;
      const x = col * cell;
      const y = top + row * cell;
      if (i === index) {
        ctx.fillStyle = SELECTED_CELL;
        ctx.fillRect(x, y, cell, cell);
      }
      ctx.fillStyle = i === index ? SELECTED : GLYPH;
      ctx.fillText(glyphs[i], x + cell / 2, y + cell / 2);
    }
  }
}
