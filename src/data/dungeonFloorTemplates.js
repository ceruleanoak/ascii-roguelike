// Dungeon floor interior wall layouts — 24×24 grids.
//
// # = solid wall cell    . = floor (walkable)
//
// Coordinate contract:
//   The grid is 24 cols × 24 rows. Row 0, row 23, col 0, col 23 are the
//   outer border (always walls — the generator stamps these unconditionally).
//   Templates can override interior cells (rows 1–22, cols 1–22).
//
// Reserved cells (NEVER stamp as walls — these must remain walkable):
//   Floor 0:        (STAIRS_COL=12, STAIRS_DOWN_ROW=4)  — v stairs
//                   (STAIRS_COL=12, EXIT_ROW=23)        — exit door (on border)
//                   col 12, rows 21..4                  — spawn-to-stairs corridor
//   Floor 1+:       (STAIRS_COL=12, STAIRS_UP_ROW=3)    — ^ stairs
//                   (STAIRS_COL=12, STAIRS_DEEP_ROW=20) — v stairs (non-last floors)
//                   col 12, rows 3..20                  — between-stairs corridor
//
// All templates keep col 12 fully clear to guarantee staircase reachability.
// Companion-puzzle floor (green zone, floor 2) skips templates and uses 'open'.

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

// Narrow vertical channels with cross-passages at rows 6, 13, 19. Col 12 clear.
const TEMPLATE_SEWER = [
  '########################',
  '#......................#',
  '#..##.##.##..##.##.##..#',
  '#..##.##.##..##.##.##..#',
  '#..##.##.##..##.##.##..#',
  '#..##.##.##..##.##.##..#',
  '#......................#',
  '#..##.##.##..##.##.##..#',
  '#..##.##.##..##.##.##..#',
  '#..##.##.##..##.##.##..#',
  '#..##.##.##..##.##.##..#',
  '#..##.##.##..##.##.##..#',
  '#......................#',
  '#..##.##.##..##.##.##..#',
  '#..##.##.##..##.##.##..#',
  '#..##.##.##..##.##.##..#',
  '#..##.##.##..##.##.##..#',
  '#..##.##.##..##.##.##..#',
  '#......................#',
  '#..##.##.##..##.##.##..#',
  '#..##.##.##..##.##.##..#',
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
