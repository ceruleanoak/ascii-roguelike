import { GRID } from '../../game/GameConfig.js';

// MistMotes — the field of drifting '~' motes that is mist in this game: the
// Gray zone's mist (GrayZoneSystem) and the clouds round the Zenith once the
// player has climbed above them (ZenithDraw). Each caller owns its field and
// decides each mote's alpha; this module only builds the motes and says where
// one has drifted to.

const MOTE_SKIP_CHANCE = 0.08;  // Sparse gaps so it reads as mist, not a grid
const MOTE_SIZE = 1.15;         // Glyph size × CELL_SIZE — overlapping, thick cover
const MOTE_COLORS = ['#8a8a8e', '#74747a', '#9a9aa0', '#67676d'];

// One '~' mote per grid cell that `covers(col, row)` accepts (minus random
// gaps), each with its own drift phase/speed/amplitude and baked sub-cell
// jitter so the field never reads as a lattice.
export function buildMistMotes(covers = () => true) {
  const motes = [];
  for (let row = 0; row < GRID.ROWS; row++) {
    for (let col = 0; col < GRID.COLS; col++) {
      if (!covers(col, row) || Math.random() < MOTE_SKIP_CHANCE) continue;
      motes.push({
        col, row,
        x: col * GRID.CELL_SIZE + GRID.CELL_SIZE / 2 + (Math.random() * 6 - 3),
        y: row * GRID.CELL_SIZE + GRID.CELL_SIZE / 2 + (Math.random() * 6 - 3),
        phase: Math.random() * Math.PI * 2,
        speedX: 0.4 + Math.random() * 0.5,   // Slow, mist-like idle
        speedY: 0.25 + Math.random() * 0.35,
        ampX: 1.5 + Math.random() * 1.5,     // Mild pixel offsets
        ampY: 1.0 + Math.random() * 1.2,
        breath: 0.04 + Math.random() * 0.05, // Subtle alpha shimmer
        color: MOTE_COLORS[Math.floor(Math.random() * MOTE_COLORS.length)]
      });
    }
  }
  return motes;
}

// Where a mote has drifted to at time t (seconds).
export function motePosition(m, t) {
  return {
    x: m.x + Math.sin(t * m.speedX + m.phase) * m.ampX,
    y: m.y + Math.cos(t * m.speedY + m.phase * 1.7) * m.ampY
  };
}

// A mote's own alpha shimmer at time t, added to whatever alpha the caller gives it.
export function moteShimmer(m, t) {
  return Math.sin(t * 0.8 + m.phase * 3) * m.breath;
}

// Set the context up to draw motes (call inside the caller's save/restore).
export function prepareMoteFont(ctx) {
  ctx.font = `${Math.round(GRID.CELL_SIZE * MOTE_SIZE)}px 'Unifont', monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
}
