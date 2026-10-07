// Glyph contact — do two grid entities' rendered glyphs touch?
//
// Players and enemies draw as half-width Unifont glyphs: half a cell wide and
// a full cell tall, centered in their cell. Body-contact effects (a Bumper's
// shove, a charger's ram) test this box instead of a circle or a full cell so
// the hit lands only when the visible bodies meet. The small horizontal slack
// lets a graze register.

import { GRID } from '../../game/GameConfig.js';

const CONTACT_X = GRID.CELL_SIZE * 0.6;
const CONTACT_Y = GRID.CELL_SIZE * 1.0;

export function glyphsTouch(a, b) {
  return Math.abs(a.position.x - b.position.x) < CONTACT_X
    && Math.abs(a.position.y - b.position.y) < CONTACT_Y;
}
