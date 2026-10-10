/**
 * glyphGlobe — the CLI's glyph picker, a full-screen turning globe in the
 * manner of the THREE room's slot globe (ThreeSlotGlobeSystem): the chosen
 * glyph is always the one the globe has turned to the front-center, and there
 * is no cursor. Left/right walk the longitude ring, up/down step latitude
 * bands — but where the slot globe carries a run's handful of glyphs, this one
 * carries every craftable glyph, so its bands scroll: GLOBE_COLUMNS glyphs to
 * a ring, as many rings as the list needs, the selected band at the equator.
 *
 * This module owns the frame's navigation and eased orientation;
 * src/rendering/ui/GlyphGlobe.js draws it.
 */

export const GLOBE_COLUMNS = 40;

// How long the globe takes to bring a newly selected glyph to front-center.
const TURN_MS = 200;

/** A CLI frame for the globe over `glyphs`; SPACE calls onPick(glyph). */
export function openGlobe(glyphs, onPick) {
  return { kind: 'glyphs', glyphs, index: 0, onPick, viewFrom: { row: 0, col: 0 }, viewTo: { row: 0, col: 0 }, turnStart: 0 };
}

/**
 * Where the globe faces now, as fractional (row, col) — eased from where it
 * faced at the last move toward the selection. col is unwrapped (it can run
 * past GLOBE_COLUMNS) so a turn across the seam goes the short way round.
 */
export function globeView(frame, now = performance.now()) {
  const t = Math.min(1, (now - frame.turnStart) / TURN_MS);
  const e = 1 - Math.pow(1 - t, 3); // easeOutCubic
  const { viewFrom: a, viewTo: b } = frame;
  return { row: a.row + (b.row - a.row) * e, col: a.col + (b.col - a.col) * e };
}

/** Move the selection by a menu intent. Returns true when it moved. */
export function moveGlobe(frame, intent) {
  const n = frame.glyphs.length;
  if (!n) return false;
  const rows = Math.ceil(n / GLOBE_COLUMNS);
  let row = Math.floor(frame.index / GLOBE_COLUMNS);
  let col = frame.index % GLOBE_COLUMNS;
  const ringLength = r => Math.min(GLOBE_COLUMNS, n - r * GLOBE_COLUMNS); // the last ring is ragged

  if (intent === 'left' || intent === 'right') {
    col = (col + (intent === 'left' ? -1 : 1) + ringLength(row)) % ringLength(row);
  } else if (intent === 'up' || intent === 'down') {
    row += intent === 'up' ? -1 : 1;
    if (row < 0 || row >= rows) return false;
    col = Math.min(col, ringLength(row) - 1);
  } else {
    return false;
  }

  const now = performance.now();
  const view = globeView(frame, now);
  // Shortest way round the ring from where the globe faces now.
  let delta = (col - view.col) % GLOBE_COLUMNS;
  if (delta > GLOBE_COLUMNS / 2) delta -= GLOBE_COLUMNS;
  if (delta < -GLOBE_COLUMNS / 2) delta += GLOBE_COLUMNS;
  frame.viewFrom = view;
  frame.viewTo = { row, col: view.col + delta };
  frame.turnStart = now;
  frame.index = row * GLOBE_COLUMNS + col;
  return true;
}
