import { GRID } from '../../game/GameConfig.js';
import { ITEMS } from '../../data/items.js';

/**
 * ThreeSlotGlobeOverlay — the turning globe of offerings.
 *
 * Drawn through the PauseSystem modal hook, above the frozen frame. The
 * sphere is implied entirely by how the glyphs sit on it: the far hemisphere
 * is culled outright, and what remains is scaled and dimmed by depth, so the
 * curve reads without a single drawn outline.
 *
 * COMPLIANCE RULE (non-instructive UI): no key hints, no headers, no labels.
 * Glyphs and the dark are the whole of it. The Three Room is the most ominous
 * place in the game and the menu is not permitted to explain itself.
 *
 * Unifont throughout — offered glyphs are item chars and need full Unicode
 * coverage.
 */

// Radius of the sphere the glyphs sit on, in cells.
const GLOBE_RADIUS_CELLS = 5.6;

// Depth-to-size mapping. The front of the sphere is full size; the limb
// shrinks toward the floor value, which is what sells the curvature.
const SCALE_FLOOR = 0.42;
const SCALE_RANGE = 0.58;

// Glyphs near the limb also lose light, as if the globe is lit from the front.
const ALPHA_FLOOR = 0.18;
const ALPHA_RANGE = 0.82;

export class ThreeSlotGlobeOverlay {
  render(renderer, game, state) {
    if (!state.slot || state.symbols.length === 0) return;

    const ctx = renderer.uiCtx;
    const cs = GRID.CELL_SIZE;
    const cx = GRID.WIDTH / 2;
    const cy = GRID.HEIGHT / 2;
    const R = cs * GLOBE_RADIUS_CELLS;

    ctx.save();

    // Take the room away almost entirely. This is darker than any other modal
    // in the game on purpose — nothing of the world should read behind it.
    ctx.fillStyle = 'rgba(0, 0, 0, 0.93)';
    ctx.fillRect(0, 0, GRID.WIDTH, GRID.HEIGHT);

    const { rot, tilt } = state.orientation();
    const sinTilt = Math.sin(tilt);
    const cosTilt = Math.cos(tilt);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Project every glyph, keep the near hemisphere, and paint back-to-front
    // so the nearer glyphs overlap the ones behind them correctly. The
    // selection needs no cursor: it is the glyph the globe has turned to the
    // front, which depth alone already draws largest and brightest.
    const visible = [];
    for (let row = 0; row < state.bands; row++) {
      for (let col = 0; col < state.perBand; col++) {
        const idx = state.indexAt(row, col);
        if (idx === -1) continue;

        const { lat, lon } = state.cellAngles(row, col);
        const lonR = lon - rot;

        const x = R * Math.cos(lat) * Math.sin(lonR);
        const y0 = R * Math.sin(lat);
        const z0 = R * Math.cos(lat) * Math.cos(lonR);

        // Tilt about the horizontal axis so the selected band rises to center.
        const y = y0 * cosTilt - z0 * sinTilt;
        const z = z0 * cosTilt + y0 * sinTilt;

        if (z < 0) continue;                        // far side is never drawn

        visible.push({ char: state.symbols[idx], x, y, z });
      }
    }
    visible.sort((a, b) => a.z - b.z);

    for (const g of visible) {
      const depth = g.z / R;                        // 0 at the limb, 1 at the front
      const scale = SCALE_FLOOR + SCALE_RANGE * depth;
      const data = ITEMS[g.char];

      ctx.globalAlpha = ALPHA_FLOOR + ALPHA_RANGE * depth;
      ctx.font = `${(cs * 1.15 * scale).toFixed(2)}px 'Unifont', monospace`;
      ctx.fillStyle = data?.color || '#cfcfcf';
      ctx.fillText(g.char, cx + g.x, cy - g.y);
    }

    ctx.globalAlpha = 1;
    ctx.restore();
  }
}
