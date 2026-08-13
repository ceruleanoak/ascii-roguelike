// Dungeon floor interior wall layouts — 24×24 grids.
//
// # = solid wall cell    . = floor (walkable)
// ~ = water channel (walkable; DungeonSystem places a Puddle object on it)
//
// Coordinate contract:
//   The grid is 24 cols × 24 rows. Row 0, row 23, col 0, col 23 are the
//   outer border (always walls — the generator stamps these unconditionally).
//   Templates can override interior cells (rows 1–22, cols 1–22).
//
// ── Staircase footprint contract (6-floor rework) ──────────────────────────
// Every floor (numbered floor or side room) has up to 4 fixed cells, laid out
// in a cross centered on (STAIRS_COL, SPINE_ROW):
//   ^ up-stairs      (STAIRS_COL, STAIRS_UP_ROW)  — floors 1+ only (floor 0
//                     has the exterior exit door instead, see below)
//   v North descent  (STAIRS_COL, NORTH_ROW)
//   v West descent   (WEST_COL,   SPINE_ROW)
//   v East descent   (EAST_COL,   SPINE_ROW)
//   ∩ exit door      (STAIRS_COL, EXIT_ROW)       — floor 0 only, border cell
//
// Not every floor uses all 3 descent footprints (e.g. floor 0 has only North
// active). Inactive footprints still render — as an inert/locked-looking
// placeholder, never absent — so the reservation below is UNCONDITIONAL: the
// full cross (both spines + every footprint's step-off neighbors) is always
// kept clear, regardless of which cells a given floor actually activates.
// This is what makes "every template keeps the staircase area walkable" true
// by construction rather than by per-floor bookkeeping. See
// getReservedFootprintCells() below — the single source of truth, shared by
// DungeonFloorGenerator and (eventually) the dungeon layout editor.
//
// All templates keep the full cross clear to guarantee reachability.

export const STAIRS_COL    = 12;  // vertical spine column (up-stairs, North descent, exit door)
export const STAIRS_UP_ROW = 3;   // ^ up-stairs row (floors 1+)
export const NORTH_ROW     = 4;   // North descent footprint row
export const SPINE_ROW     = 12;  // horizontal spine row (West/East descent footprints)
export const WEST_COL      = 4;
export const EAST_COL      = 19;
export const EXIT_ROW      = 23;  // floor 0 exterior exit door (border row)

/**
 * The full set of cells that must stay walkable on every floor/side-room,
 * regardless of which descent footprints that floor activates. Callers pass
 * this straight through to applyTemplateToCollisionMap's reservedCells.
 */
export function getReservedFootprintCells() {
  const cells = [];
  // Vertical spine: up-stairs down through the exit-door approach.
  for (let r = STAIRS_UP_ROW; r <= EXIT_ROW - 1; r++) cells.push({ row: r, col: STAIRS_COL });
  // Horizontal spine: West footprint through East footprint.
  for (let c = WEST_COL; c <= EAST_COL; c++) cells.push({ row: SPINE_ROW, col: c });
  // Step-off neighbors so the player can leave each footprint tile.
  cells.push({ row: STAIRS_UP_ROW, col: STAIRS_COL - 1 }, { row: STAIRS_UP_ROW, col: STAIRS_COL + 1 });
  cells.push({ row: NORTH_ROW,     col: STAIRS_COL - 1 }, { row: NORTH_ROW,     col: STAIRS_COL + 1 });
  cells.push({ row: SPINE_ROW - 1, col: WEST_COL }, { row: SPINE_ROW + 1, col: WEST_COL });
  cells.push({ row: SPINE_ROW - 1, col: EAST_COL }, { row: SPINE_ROW + 1, col: EAST_COL });
  return cells;
}

// ── Footprint visual contract (3-state model) ───────────────────────────────
// Shared by DungeonFloorGenerator (initial paint) and DungeonPuzzleSystem
// (repaint on state change — key consumed, companion joins, puzzle solved).
// inactive: footprint isn't live this floor, but still rendered (never
// absent — non-instructive "show don't tell": players see all 3 possible
// branch positions even when only some are usable).
export const FOOTPRINT_LOCKED_COLOR   = '#cc3333';
export const FOOTPRINT_UNLOCKED_COLOR = '#8b7355';
export const FOOTPRINT_INACTIVE_COLOR = '#333333';

/** Paint a descent footprint tile per its active/locked state. */
export function paintDescentVisual(obj, { active, locked }) {
  let char, color;
  if (!active) { char = 'x'; color = FOOTPRINT_INACTIVE_COLOR; }
  else if (locked) { char = 'x'; color = FOOTPRINT_LOCKED_COLOR; }
  else { char = 'v'; color = FOOTPRINT_UNLOCKED_COLOR; }
  obj.char = char;
  obj.color = color;
  obj.animationChar = char;
  obj.animationColor = color;
}

/** Paint an up-stairs tile's locked/unlocked color (side rooms with a lockable exit). */
export function paintStairsUpVisual(obj, locked) {
  const color = locked ? FOOTPRINT_LOCKED_COLOR : FOOTPRINT_UNLOCKED_COLOR;
  obj.color = color;
  obj.animationColor = color;
}

const TEMPLATE_OPEN = [
  '########################',
  '#......................#',
  '#......................#',
  '#......................#',
  '#......................#',
  '#......................#',
  '#......................#',
  '#......................#',
  '#......................#',
  '#......................#',
  '#......................#',
  '#......................#',
  '#......................#',
  '#......................#',
  '#......................#',
  '#......................#',
  '#......................#',
  '#......................#',
  '#......................#',
  '#......................#',
  '#......................#',
  '#......................#',
  '#......................#',
  '########################',
];

// Single-cell pillars in a regular grid, col 12 kept clear.
const TEMPLATE_PILLAR_ROWS = [
  '########################',
  '#......................#',
  '#......................#',
  '#......................#',
  '#......................#',
  '#...#...#...#...#...#..#',
  '#......................#',
  '#......................#',
  '#......................#',
  '#...#...#...#...#...#..#',
  '#......................#',
  '#......................#',
  '#......................#',
  '#...#...#...#...#...#..#',
  '#......................#',
  '#......................#',
  '#......................#',
  '#...#...#...#...#...#..#',
  '#......................#',
  '#......................#',
  '#......................#',
  '#......................#',
  '#......................#',
  '########################',
];

// Short L-shaped wall segments, leaving open ground for combat. Col 12 clear.
const TEMPLATE_MILD_MAZE = [
  '########################',
  '#......................#',
  '#..###.........###.....#',
  '#....#.........#.......#',
  '#....#.........#.......#',
  '#......................#',
  '#.......####.####......#',
  '#..........#.#.........#',
  '#..........#.#.........#',
  '#......................#',
  '#..####..........####..#',
  '#.....#..........#.....#',
  '#.....#..........#.....#',
  '#......................#',
  '#..........#.#.........#',
  '#..........#.#.........#',
  '#.......####.####......#',
  '#......................#',
  '#....#.........#.......#',
  '#....#.........#.......#',
  '#..###.........###.....#',
  '#......................#',
  '#......................#',
  '########################',
];

// Horizontal wall splits the room in two; col-12 gap connects halves.
const TEMPLATE_SEPARATED_ZONES = [
  '########################',
  '#......................#',
  '#......................#',
  '#......................#',
  '#......................#',
  '#......................#',
  '#......................#',
  '#......................#',
  '#......................#',
  '#......................#',
  '#......................#',
  '############.###########',
  '#......................#',
  '#......................#',
  '#......................#',
  '#......................#',
  '#......................#',
  '#......................#',
  '#......................#',
  '#......................#',
  '#......................#',
  '#......................#',
  '#......................#',
  '########################',
];

// Narrow vertical water channels running between the block pairs, with dry
// cross-passages at rows 6, 12, 18 (the water flows through them — step over).
// Col 12 stair corridor stays dry. The '~' cells are what make it a sewer.
const TEMPLATE_SEWER = [
  '########################',
  '#......................#',
  '#..##~##~##..##~##~##..#',
  '#..##~##~##..##~##~##..#',
  '#..##~##~##..##~##~##..#',
  '#..##~##~##..##~##~##..#',
  '#....~..~......~..~....#',
  '#..##~##~##..##~##~##..#',
  '#..##~##~##..##~##~##..#',
  '#..##~##~##..##~##~##..#',
  '#..##~##~##..##~##~##..#',
  '#..##~##~##..##~##~##..#',
  '#....~..~......~..~....#',
  '#..##~##~##..##~##~##..#',
  '#..##~##~##..##~##~##..#',
  '#..##~##~##..##~##~##..#',
  '#..##~##~##..##~##~##..#',
  '#..##~##~##..##~##~##..#',
  '#....~..~......~..~....#',
  '#..##~##~##..##~##~##..#',
  '#..##~##~##..##~##~##..#',
  '#......................#',
  '#......................#',
  '########################',
];

export const DUNGEON_FLOOR_TEMPLATES = {
  open:             TEMPLATE_OPEN,
  pillar_rows:      TEMPLATE_PILLAR_ROWS,
  mild_maze:        TEMPLATE_MILD_MAZE,
  separated_zones:  TEMPLATE_SEPARATED_ZONES,
  sewer:            TEMPLATE_SEWER,
};

// Selection weights — 'open' is rare so most floors have some structure.
const TEMPLATE_WEIGHTS = [
  { name: 'open',            weight: 1 },
  { name: 'pillar_rows',     weight: 3 },
  { name: 'mild_maze',       weight: 3 },
  { name: 'separated_zones', weight: 2 },
  { name: 'sewer',           weight: 2 },
];

const TOTAL_WEIGHT = TEMPLATE_WEIGHTS.reduce((s, t) => s + t.weight, 0);

/** Pick a random template name using the configured weights. */
export function pickRandomTemplateName() {
  let r = Math.random() * TOTAL_WEIGHT;
  for (const t of TEMPLATE_WEIGHTS) {
    r -= t.weight;
    if (r < 0) return t.name;
  }
  return 'open';
}

/**
 * Apply a template's interior wall pattern to an existing collisionMap.
 * The map's outer border (row 0/last, col 0/last) is left unchanged — templates
 * are responsible only for interior cells. Cells listed in `reservedCells` are
 * never stamped, guaranteeing reachability of staircases and the spawn corridor.
 */
export function applyTemplateToCollisionMap(collisionMap, templateName, reservedCells = []) {
  const grid = DUNGEON_FLOOR_TEMPLATES[templateName] ?? DUNGEON_FLOOR_TEMPLATES.open;
  const reserved = new Set(reservedCells.map(({ row, col }) => `${row},${col}`));
  const rows = collisionMap.length;
  const cols = collisionMap[0]?.length ?? 0;
  for (let r = 1; r < rows - 1; r++) {
    const line = grid[r] ?? '';
    for (let c = 1; c < cols - 1; c++) {
      if (line[c] !== '#') continue;
      if (reserved.has(`${r},${c}`)) continue;
      collisionMap[r][c] = true;
    }
  }
}

/**
 * Interior cells a template marks as water ('~'). Walkable — the generator
 * places a Puddle background object on each. Reserved cells are excluded so
 * stair corridors always stay dry.
 */
export function getTemplateWaterCells(templateName, reservedCells = []) {
  const grid = DUNGEON_FLOOR_TEMPLATES[templateName] ?? DUNGEON_FLOOR_TEMPLATES.open;
  const reserved = new Set(reservedCells.map(({ row, col }) => `${row},${col}`));
  const cells = [];
  for (let r = 0; r < grid.length; r++) {
    const line = grid[r];
    for (let c = 0; c < line.length; c++) {
      if (line[c] !== '~') continue;
      if (reserved.has(`${r},${c}`)) continue;
      cells.push({ row: r, col: c });
    }
  }
  return cells;
}
