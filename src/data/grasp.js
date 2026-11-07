// The Grasp — Act 1's boss of the Mist Battle (GraspSystem). Art, glyphs,
// paths and tuning, all in one catalogue. Distances are pixels, times seconds,
// speeds px/s unless a name says otherwise.
//
// Glyph exceptions, sanctioned for the Grasp alone (CLAUDE.md, Character
// Encoding Rule): the Clutch are enemies drawn with Unicode hands (☝☟☜☞☚☛),
// and the Fingers are math symbols, Unicode ones included, the way the Great
// Hands are letters.
import { GRID } from '../game/GameConfig.js';

const CS = GRID.CELL_SIZE;

export const GRASP_NAME = 'The Grasp';
export const GRASP_DESCRIPTION = 'Holds the top of the mountain. Lets go of nothing it has.';
export const GRASP_COLOR = '#d8d0c4';
export const GRASP_NAIL_COLOR = '#f4f0ea';
export const GRASP_CREASE_COLOR = '#8a8278';

// ── Great Hands (phase 1) ──────────────────────────────────────────────
// Art rows are drawn top to bottom, one glyph per cell; ' ' is empty. Drawn
// for the LEFT hand, back of the hand up, wrist at the top and the thumb on
// the inner side; the right hand is the mirror (mirrorArt). Every frame
// shares one width and height so a frame swap never moves the hitbox, and a
// hand stays within a quarter of the grid (half its width and height).
//
// Alphanumeric only, and a glyph's class is its part (handGlyphColor):
// uppercase is the skin's outline and the knuckles (B C D), lowercase the
// creases, digits the nails, mismatched. The fingers are single bony
// columns, too long, with one joint too many. The palm cell (bottom center,
// where a grabbed body is pinned) stays empty in every reaching frame and `fist`, so the
// body shows between the fingers. Which frame shows when is GraspDraw's
// (handFrame).
export const HAND_ART = {
  // Knuckles hooked over the North Barrier's lip, nails dug into the rock.
  // Only the bottom rows hang below the top edge.
  grip: [
    '    A   A    ',
    '    A z A    ',
    '   A  z  A   ',
    '   A z  z A  ',
    '  A  z z  Az ',
    '  A z   w  A ',
    ' B    m   zB ',
    ' C D  B C  A ',
    ' A A  A Az z ',
    ' A A  A A A  ',
    ' BzB  BzB 0  ',
    ' A A zA A    ',
    ' z z  z z    ',
    ' 0 6  9 0    ',
  ],
  // The tell: the fingertips come up off the rock and the bottom rows go bare.
  flex: [
    '    A   A    ',
    '    A z A    ',
    '   A  z  A   ',
    '   A z  z A  ',
    '  A  z z  Az ',
    '  A z   w  A ',
    ' B    m   zB ',
    ' C D  B C  A ',
    ' A A  A Az z ',
    ' BzB  BzB A  ',
    ' z z zz z 0  ',
    ' 0 6  9 0    ',
    '             ',
    '             ',
  ],
  // Reaching down at the Trine, fingers and thumb spread. Alternates with
  // `openB` while it reaches, a slow restless twitch.
  open: [
    '    A   A    ',
    '    A z A    ',
    '   A  z  A   ',
    '   A z  z A  ',
    '  A  z z  Az ',
    '  A z   w  AB',
    ' B    m   A A',
    ' C D  B C z A',
    ' A A  A A   z',
    'A  A   A A  0',
    'B zC   D  B  ',
    '0  A   Az A  ',
    '   A    A  0 ',
    '   6    9    ',
  ],
  // The restless twin of `open`: tips curl a cell in, the thumb twitches,
  // the creases crawl.
  openB: [
    '    A   A    ',
    '    A z A    ',
    '   A  z  A   ',
    '   A  z z A  ',
    '  A  z z  Az ',
    '  A z  w   AB',
    ' B   m    A A',
    ' C D  B C z z',
    ' A A  A A  A ',
    'A  A   A A 0 ',
    ' B Cz  D  B  ',
    ' 0 A   zA A  ',
    '  A     A 0  ',
    '  6     9    ',
  ],
  // Almost on its target: every finger stretched as wide as the hand goes.
  splay: [
    '    A   A    ',
    '    A z A    ',
    '   A  z  A   ',
    '   A z  z A  ',
    '  A  z z  Az ',
    '  A z   w  AB',
    ' B    m   A z',
    ' C D  B C  zA',
    'A  A  A A   0',
    'BxA    A A   ',
    'A C     DxBz ',
    'A Ax    A  A ',
    '0 A      A  A',
    '  6      9  0',
  ],
  // Half curled, between a closed hand and `open`; shown only for a moment.
  half: [
    '    A   A    ',
    '    A z A    ',
    '   A  z  A   ',
    '   A z  z A  ',
    '  A  z z  Az ',
    '  A z   w  A ',
    ' B    m    B ',
    ' C D  B C  A ',
    ' A A  A A  z ',
    ' A B  D B A  ',
    ' B A   A z   ',
    '  z z  9     ',
    '   06        ',
    '             ',
  ],
  // Closed on a body: fingers wrap it from the outside, the thumb crosses
  // from the inside, nails turned in.
  fist: [
    '    A   A    ',
    '    A z A    ',
    '   A  z  A   ',
    '   A z  z A  ',
    '  A  z z  Az ',
    '  A z   w zA ',
    ' B    m    B ',
    ' C D  B C  A ',
    ' A Az A A A  ',
    ' A B  D B z  ',
    ' B  zz z  C  ',
    '  z A9 0 A   ',
    '  zA 6  z    ',
    '    0  0     ',
  ],
};
export const HAND_COLS = 13;
export const HAND_ROWS = 14;
// The art row of the knuckle ridge (B C D), which rests on the barrier's rim.
export const HAND_KNUCKLE_ROW = 7;

/** A hand glyph's color by its class: nail (digit), crease (lowercase) or skin. */
export function handGlyphColor(glyph) {
  if (glyph >= '0' && glyph <= '9') return GRASP_NAIL_COLOR;
  if (glyph >= 'a' && glyph <= 'z') return GRASP_CREASE_COLOR;
  return GRASP_COLOR;
}

// The art is alphanumeric, so mirroring is a plain reversal of each row.
export function mirrorArt(rows, width = HAND_COLS) {
  return rows.map(row => [...row.padEnd(width, ' ')].reverse().join(''));
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
// diving to strike (a filled hand, facing the side it swings toward). Only
// the pointing hands U+261A-261F: the open hand and fist (✋✊) have emoji
// presentation and draw as color emoji, whatever the font stack. ☝ can still
// turn emoji when Unifont hasn't loaded and the fallback font decides, so
// every glyph carries the text presentation selector (U+FE0E).
const TEXT_PRESENTATION = String.fromCodePoint(0xFE0E);
export const CLUTCH_GLYPHS = Object.fromEntries(Object.entries({
  up: '☝', down: '☟', left: '☜', right: '☞', formation: '☝', diveLeft: '☚', diveRight: '☛',
}).map(([action, hand]) => [action, hand + TEXT_PRESENTATION]));
export const CLUTCH_COLOR = '#d8d0c4';
// A Clutch hand is drawn and hit as a square this many px on a side (2 cells).
export const CLUTCH_SIZE = 2 * CS;
// Formation slots, in cells (top-left of the unit), swaying as one block.
export const CLUTCH_FORMATION = {
  cols: [6, 9, 12, 15, 18, 21, 24],
  rows: [4, 6],
  swayCells: 2,
  swayPeriod: 3.2,
};
// Each wave enters as two mirrored streams from above the open north edge
// along a quadratic bezier (p0 → p1 → the unit's slot), one unit every
// `stagger` s. Every p0 is off screen, so no hand appears in the open, and
// every p1 inside the side walls, so no path crosses one.
export const CLUTCH_WAVES = [
  { count: 8, stagger: 0.28, p0: { x: 3, y: -2 }, p1: { x: 3, y: 16 } },
  // Swings wide and low along the wall before it rises to its slot.
  { count: 10, stagger: 0.24, p0: { x: 8, y: -2 }, p1: { x: 1, y: 18 } },
  { count: 12, stagger: 0.2, p0: { x: 14, y: -2 }, p1: { x: 2, y: 12 } },
];

// ── Fingers (phase 3) ──────────────────────────────────────────────────
// Four lanes, left column of each, in cells. A Finger is FINGER_COLS wide,
// which leaves a 1-cell gap at each wall and 2 cells between Fingers.
export const FINGER_LANES = [2, 9, 16, 23];
export const FINGER_COLS = 5;
// Math symbols only, as the Great Hands are letters only.
// A Finger is drawn bottom-up from its tip in heavy `+` strokes, the outline
// of a thing too big to fit in the glyphs: the rounded tip, the nail plate,
// then the shaft, banded by a knuckle every FINGER_KNUCKLE_EVERY rows. The
// side columns are always the skin's `+` outline. Inside it, nail rows draw
// in the nail color, knuckle `=` in the crease color, and a '.' is bare
// flesh that may carry a fleck of FINGER_TEXTURE.
export const FINGER_ART = {
  tip: ' +++ ',
  nail: ['+⌊=⌋+', '+| |+', '+⌈-⌉+'],      // bottom row first
  shaft: '+...+',
  knuckle: ['+===+', '+.=.+'],              // bottom row first
};
export const FINGER_KNUCKLE_EVERY = 6;
// Flecks on the bare flesh, fixed to the Finger so they ride with it.
export const FINGER_TEXTURE = ['≠', 'π', '÷', '≈', '√', '×', '∞', '=', '-'];
// Share of bare-flesh cells that carry a fleck.
export const FINGER_TEXTURE_DENSITY = 0.3;

export const GRASP_TUNING = {
  // Warm-up: mixed gray waves before the Grasp shows.
  WARMUP_WAVES: 3,
  RIM_TREMBLE_TIME: 1.6,

  // Great Hands
  HANDS_HP: 80,
  // Taken off every blow on a Great Hand before it reaches the pool, at
  // least 1 getting through: the player's armor rule (PlayerDamageSystem).
  HANDS_DEFENSE: 1,
  HAND_RISE_TIME: 1.2,
  HAND_GRIP_TIME: [1.4, 2.6],
  HAND_FLEX_TIME: 0.7,
  HAND_REACH_SPEED: 150,
  HAND_REACH_TIME: 1.8,
  // A reaching palm this close to its target splays, and stays splayed.
  HAND_SPLAY_DISTANCE: 3 * CS,
  HAND_RETRACT_SPEED: 200,
  // A free body this close to a reaching palm is caught and held. One cell,
  // not the two it was: at two, a body near enough to strike the reaching
  // fingers was nearly always caught first. The hit area (the art) is
  // unchanged.
  HAND_GRAB_RADIUS: 1 * CS,
  // A held body is let go on this many blows on the holding hand, counted
  // from the catch; until then the hand neither lets go nor pulls back.
  HAND_HOLD_HITS: 3,
  // How hard the rest of the Trine is knocked down when one is caught.
  HAND_GRAB_KNOCKBACK: 260,
  // A held body takes this much, through armor, every tick until the hand lets go.
  HAND_SQUEEZE_DAMAGE: 2,
  HAND_SQUEEZE_TICK: 2.0,
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
  // The tell before a dive: the hand shivers this far each way (px), this
  // many steps a second, for this long, in its slot.
  CLUTCH_TELL_TIME: 0.3,
  CLUTCH_TELL_SHIVER: 2,
  CLUTCH_TELL_SHIVER_RATE: 20,
  // A wave that finds the block too full waits this long, then enters into
  // whatever slots are free.
  CLUTCH_WAVE_WAIT: 8,
  // After the last wave settles, survivors linger this long, then retreat.
  CLUTCH_LINGER: 10,
  CLUTCH_RETREAT_SPEED: 160,

  // Fingers
  FINGERS_HP: 120,
  FINGER_REACH_SPEED: 22,
  // The reach speeds up as the pool drains: speed × (1 + this × spent share).
  FINGER_RAGE: 1.0,
  FINGER_KNOCKBACK: 80,
  // Struck, a Finger holds still this long before it reaches again...
  FINGER_STALL_TIME: 1.0,
  // ...and lilts side to side meanwhile: this far each way (px), at this rate
  // (radians/s). Half a cell each way keeps it inside its lane.
  FINGER_LILT: CS / 2,
  FINGER_LILT_RATE: 5,
  FINGER_MIN_TIP: 2 * CS,
  // Any touch of a Finger: armor doesn't soften it, once a second per body.
  FINGER_TOUCH_DAMAGE: 1,
  FINGER_TOUCH_COOLDOWN: 1.0,
  FINGER_WITHDRAW_SPEED: 260,
  // Trap Line: rows above the south edge a tip may reach before it presses.
  TRAP_LINE_ROWS: 7,
  // Pressing, a Finger swells sideways as its tip nears the floor, until at
  // full reach the gaps between Fingers are this many cells wide.
  FINGER_SQUEEZE_GAP: 1,

  // Contact and crush
  CONTACT_COOLDOWN: 0.8,
  CRUSH_DAMAGE: 1,

  // Summit
  SUMMIT_DECEL_TIME: 2.5,
  WALL_BUILD_TIME: 0.8,
  SOUTH_EXPOSED_TIME: 2.5,
  ZOOM_SCALE: 2,
  // The Summit's hold keeps this much room around the bodies on each side,
  // opening the zoom out when they spread too far for ZOOM_SCALE.
  ZOOM_FIT_MARGIN: 2 * CS,

  // Hits on any Grasp unit with no attack id (burn ticks, splash) are spaced
  // this far apart.
  UNTRACKED_HIT_IFRAME: 0.2,
};
