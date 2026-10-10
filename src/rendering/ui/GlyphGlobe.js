/**
 * GlyphGlobe — draws the CLI's glyph globe (src/systems/glyphGlobe.js) across
 * the whole screen. As with the THREE room's slot globe
 * (ThreeSlotGlobeOverlay), the sphere is implied only by how the glyphs sit on
 * it: the far hemisphere is culled, and what remains is scaled and dimmed by
 * depth. The selected glyph — always at front-center — is drawn in the CLI's
 * yellow. Unifont throughout; glyphs it lacks render as its fallback box.
 */

import { GRID } from '../../game/GameConfig.js';
import { ITEMS } from '../../data/items.js';
import { GLOBE_COLUMNS, globeView } from '../../systems/glyphGlobe.js';

const SELECTED = '#ffff00';
const GLYPH = '#cccccc';

// Equal steps of longitude and latitude, so glyphs sit evenly at the equator.
const STEP = (Math.PI * 2) / GLOBE_COLUMNS;
// Bands are drawn out to here; past it the rings crowd toward the pole.
const MAX_LAT = Math.PI * 0.42;

const SCALE_FLOOR = 0.3;
const SCALE_RANGE = 0.7;
const ALPHA_FLOOR = 0.15;
const ALPHA_RANGE = 0.85;

export function drawGlyphGlobe(ctx, frame) {
  const { glyphs, index } = frame;
  if (!glyphs.length) return;
  const R = Math.min(GRID.WIDTH, GRID.HEIGHT) / 2 - GRID.CELL_SIZE / 2;
  const cx = GRID.WIDTH / 2;
  const cy = GRID.HEIGHT / 2;
  const cell = R * STEP * 0.85; // a front-center glyph's size
  const view = globeView(frame);
  const rows = Math.ceil(glyphs.length / GLOBE_COLUMNS);
  const span = Math.ceil(MAX_LAT / STEP) + 1;
  const centerRow = Math.round(view.row);

  const visible = [];
  for (let row = Math.max(0, centerRow - span); row <= Math.min(rows - 1, centerRow + span); row++) {
    const lat = (row - view.row) * STEP;
    if (Math.abs(lat) > MAX_LAT) continue;
    for (let col = 0; col < GLOBE_COLUMNS; col++) {
      const i = row * GLOBE_COLUMNS + col;
      if (i >= glyphs.length) break;
      const lon = (col - view.col) * STEP;
      const z = R * Math.cos(lat) * Math.cos(lon);
      if (z <= 0) continue; // far side is never drawn
      visible.push({ i, x: R * Math.cos(lat) * Math.sin(lon), y: R * Math.sin(lat), z });
    }
  }
  visible.sort((a, b) => a.z - b.z); // back to front

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const g of visible) {
    const depth = g.z / R;
    const glyph = glyphs[g.i];
    ctx.globalAlpha = ALPHA_FLOOR + ALPHA_RANGE * depth;
    ctx.font = `${Math.round(cell * (SCALE_FLOOR + SCALE_RANGE * depth))}px 'Unifont', monospace`;
    ctx.fillStyle = g.i === index ? SELECTED : (ITEMS[glyph]?.color || GLYPH);
    ctx.fillText(glyph, cx + g.x, cy + g.y);
  }
  ctx.restore();
}
