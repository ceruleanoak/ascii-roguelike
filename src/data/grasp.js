// The Grasp — Act 1's boss of the Mist Battle (GraspSystem). Art, glyphs,
// paths and tuning, all in one catalogue. Distances are pixels, times seconds,
// speeds px/s unless a name says otherwise.
//
// Glyph exception: the Clutch are enemies drawn with Unicode hands
// (☝☟☜☞✋✊), not printable ASCII — sanctioned for the Grasp alone
// (CLAUDE.md, Character Encoding Rule).
import { GRID } from '../game/GameConfig.js';

const CS = GRID.CELL_SIZE;

export const GRASP_NAME = 'The Grasp';
export const GRASP_DESCRIPTION = 'Holds the top of the mountain. Lets go of nothing it has.';
export const GRASP_COLOR = '#d8d0c4';
export const GRASP_NAIL_COLOR = '#f4f0ea';
export const GRASP_CREASE_COLOR = '#8a8278';

// ── Great Hands (phase 1) ──────────────────────────────────────────────
// Art rows are drawn top to bottom, one glyph per cell; ' ' is empty. Drawn
// for the LEFT hand; the right hand is the mirror (mirrorArt). Every frame
// shares one width and height so a frame swap never moves the hitbox.
export const HAND_ART = {
  // Knuckles hooked over the North Barrier's lip.
  grip: [
    '  ___  ',
    ' /   \\ ',
    '|     |',
    '|     |>',
    '|_|_|_|',
    '(_(_(_)',
  ],
  // The tell: fingers lift off the rock.
  flex: [
    '  ___  ',
    ' /   \\ ',
    '|     |',
    '|     |>',
    '|/|/|/|',
    ' \' \' \' ',
  ],
  // Reaching down at the Trine, fingers spread.
  open: [
    ' _____ ',
    '|     |',
    '|     |>',
    '\\|||||/',
    ' ||||| ',
    ' vvvvv ',
  ],
  // Closed on a body.
  fist: [
    ' _____ ',
    '/     \\',
    '|     |>',
    '|_____|',
    '(_|_|_)',
    ' \\___/ ',
  ],
};
export const HAND_COLS = 8;
export const HAND_ROWS = 6;

const MIRROR = { '/': '\\', '\\': '/', '(': ')', ')': '(', '<': '>', '>': '<' };
export function mirrorArt(rows, width = HAND_COLS) {
  return rows.map(row => [...row.padEnd(width, ' ')].reverse().map(c => MIRROR[c] ?? c).join(''));
}

// ── North Barrier and Climb Scenery ────────────────────────────────────
export const BARRIER_ROWS = 3;          // rows 1..3 under the top border
export const BARRIER_GLYPHS = ['▲', '▓', '▒'];
export const ROCK_COLOR = '#5c5a60';
export const ROCK_EDGE_COLOR = '#8c8a90';
export const ROCK_GLYPH = '▒';
export const ROCK_CAP_GLYPH = '▲';

// Scenery shapes, in cells. `side` pins a ledge to a wall ('left'/'right'),
// otherwise `col` places it; each shape leaves at least five open columns so
// the Trine always has a way past.
export const SCENERY_SHAPES = {
  clutch: [
    { side: 'left', w: 6, h: 2 },
    { side: 'right', w: 6, h: 2 },
    { side: 'left', w: 9, h: 1 },
    { side: 'right', w: 9, h: 1 },
    { col: 13, w: 3, h: 2 },
    { side: 'left', w: 4, h: 3 },
    { side: 'right', w: 4, h: 3 },
  ],
  // Phase 3 keeps the lanes clear for the Fingers: wall ledges only.
  fingers: [
    { side: 'left', w: 3, h: 1 },
    { side: 'right', w: 3, h: 1 },
    { side: 'left', w: 2, h: 2 },
    { side: 'right', w: 2, h: 2 },
  ],
};
// Distance scrolled between scenery spawns, as [min, max] cells.
export const SCENERY_GAP = { clutch: [5, 9], fingers: [4, 7] };

// Speed streaks: mist drifting past at a multiple of the climb speed.
export const STREAK_GLYPHS = ['|', '¦', '\''];
export const STREAK_COUNT = 14;
export const STREAK_SPEED_MULT = 1.6;
export const STREAK_COLOR = '#b0b0b8';

// ── Clutch (phase 2) ───────────────────────────────────────────────────
// Glyph by action: heading (dominant axis of travel), holding formation, or
// diving to strike.
export const CLUTCH_GLYPHS = {
  up: '☝', down: '☟', left: '☜', right: '☞', formation: '✋', dive: '✊',
};
export const CLUTCH_COLOR = '#d8d0c4';
// Formation slots, in cells (top-left of the unit), swaying as one block.
export const CLUTCH_FORMATION = {
  cols: [6, 9, 12, 15, 18, 21, 24],
  rows: [4, 6],
  swayCells: 2,
  swayPeriod: 3.2,
};
// Each wave enters as two mirrored streams from the top corners along a
// quadratic bezier (p0 → p1 → the unit's slot), one unit every `stagger` s.
export const CLUTCH_WAVES = [
  { count: 8, stagger: 0.28, p0: { x: 3, y: -2 }, p1: { x: 3, y: 16 } },
  { count: 10, stagger: 0.24, p0: { x: 1, y: 10 }, p1: { x: 14, y: 20 } },
  { count: 12, stagger: 0.2, p0: { x: 14, y: -2 }, p1: { x: 2, y: 12 } },
];

// ── Fingers (phase 3) ──────────────────────────────────────────────────
// Four lanes, left column of each, in cells. A Finger is FINGER_COLS wide.
export const FINGER_LANES = [3, 10, 17, 24];
export const FINGER_COLS = 4;
// A Finger is drawn bottom-up from its tip: the nail rows first, then the
// shaft, with a knuckle crease every FINGER_CREASE_EVERY rows.
export const FINGER_ART = {
  tip: ['\\__/', '|()|', '|  |'],   // bottom row first
  shaft: '|  |',
  crease: '|--|',
};
export const FINGER_CREASE_EVERY = 4;

export const GRASP_TUNING = {
  // Warm-up: mixed gray waves before the Grasp shows.
  WARMUP_WAVES: 3,
  RIM_TREMBLE_TIME: 1.6,

  // Great Hands
  HANDS_HP: 80,
  HAND_RISE_TIME: 1.2,
  HAND_GRIP_TIME: [1.4, 2.6],
  HAND_FLEX_TIME: 0.7,
  HAND_REACH_SPEED: 150,
  HAND_REACH_TIME: 1.8,
  HAND_RETRACT_SPEED: 200,
  HAND_GRAB_TIME: 1.8,
  HAND_SQUEEZE_DAMAGE: 1,
  HAND_SQUEEZE_TICK: 0.6,
  HAND_SWIPE_DAMAGE: 2,
  // Below this share of the pool both hands may reach at once.
  HANDS_BOTH_REACH_AT: 0.5,

  // Flee + the climb
  FLEE_TIME: 2.0,
  CLIMB_SPEED: 60,
  CLIMB_SPEED_FAST: 110,
  SCROLL_ACCEL: 45,

  // Clutch
  CLUTCH_HP: 2,
  CLUTCH_CONTACT_DAMAGE: 1,
  CLUTCH_ENTER_TIME: 1.6,
  CLUTCH_RETURN_SPEED: 140,
  CLUTCH_DIVE_TIME: 1.5,
  CLUTCH_DIVE_INTERVAL: [0.9, 1.8],
  CLUTCH_DIVERS: 2,
  // After the last wave settles, survivors linger this long, then retreat.
  CLUTCH_LINGER: 10,
  CLUTCH_RETREAT_SPEED: 160,

  // Fingers
  FINGERS_HP: 120,
  FINGER_REACH_SPEED: 22,
  // The reach speeds up as the pool drains: speed × (1 + this × spent share).
  FINGER_RAGE: 1.0,
  FINGER_KNOCKBACK: 80,
  FINGER_MIN_TIP: 2 * CS,
  FINGER_PRESS_DAMAGE: 1,
  FINGER_WITHDRAW_SPEED: 260,
  // Trap Line: rows above the south edge a tip may reach before it presses.
  TRAP_LINE_ROWS: 7,

  // Contact and crush
  CONTACT_COOLDOWN: 0.8,
  CRUSH_DAMAGE: 1,

  // Summit
  SUMMIT_DECEL_TIME: 2.5,
  WALL_BUILD_TIME: 0.8,
  SOUTH_EXPOSED_TIME: 2.5,
  ZOOM_SCALE: 2,

  // Hits on any Grasp unit with no attack id (burn ticks, splash) are spaced
  // this far apart.
  UNTRACKED_HIT_IFRAME: 0.2,
};
