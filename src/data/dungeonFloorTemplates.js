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
// Every floor (numbered floor or side room) has up to 4 fixed single-cell
// footprints:
//   ^ up-stairs      (STAIRS_COL, STAIRS_UP_ROW)  — floors 1+ only (floor 0
//                     has the exterior exit door instead, see below)
//   v North descent  (STAIRS_COL, NORTH_ROW)
//   v West descent   (WEST_COL,   SPINE_ROW)
//   v East descent   (EAST_COL,   SPINE_ROW)
//   ∩ exit door      (STAIRS_COL, EXIT_ROW)       — floor 0 only, border cell
//
// Not every floor uses all 3 descent footprints (e.g. floor 0 has only North
// active). Inactive footprints render nothing (see paintDescentVisual below)
// — but each footprint's own single cell is still always kept clear,
// regardless of which cells a given floor actually activates, since a later
// state change (e.g. the Companion Gate) can flip one live without moving it.
// Reservation is deliberately just those 4 cells, not a connecting corridor
// between them — a forced-open spine constrained template wall layouts more
// than the walkability guarantee was worth, so a template's walls are free
// to route however the author likes between footprints (including cutting
// one off from another, if that's the intended layout). See
// getReservedFootprintCells() below — the single source of truth, shared by
// DungeonFloorGenerator and the dungeon layout editor (tools/dungeon-editor/,
// which also runs a live reachability check as an authoring aid — advisory
// only, not a save-blocking rule).
//
// ── Data storage (Phase 0.4 of the dungeon-rework plan) ────────────────────
// The footprint numbers below and every named template's grid live in
// git-tracked JSON under src/data/dungeon/ (footprintContract.json,
// floorTemplates/*.json) rather than as JS template literals — that is what
// lets tools/dungeon-editor/ read and write them as plain data files instead
// of parsing JS source. This file's exported function signatures are
// unchanged from before the migration, so no call site elsewhere had to move.

import FOOTPRINT_CONTRACT from './dungeon/footprintContract.json';
import openTemplate from './dungeon/floorTemplates/open.json';
import pillarRowsTemplate from './dungeon/floorTemplates/pillar_rows.json';
import mildMazeTemplate from './dungeon/floorTemplates/mild_maze.json';
import separatedZonesTemplate from './dungeon/floorTemplates/separated_zones.json';
import sewerTemplate from './dungeon/floorTemplates/sewer.json';

export const STAIRS_COL    = FOOTPRINT_CONTRACT.STAIRS_COL;     // vertical spine column (up-stairs, North descent, exit door)
export const STAIRS_UP_ROW = FOOTPRINT_CONTRACT.STAIRS_UP_ROW;  // ^ up-stairs row (floors 1+)
export const NORTH_ROW     = FOOTPRINT_CONTRACT.NORTH_ROW;      // North descent footprint row
export const SPINE_ROW     = FOOTPRINT_CONTRACT.SPINE_ROW;      // horizontal spine row (West/East descent footprints)
export const WEST_COL      = FOOTPRINT_CONTRACT.WEST_COL;
export const EAST_COL      = FOOTPRINT_CONTRACT.EAST_COL;
export const EXIT_ROW      = FOOTPRINT_CONTRACT.EXIT_ROW;       // floor 0 exterior exit door (border row)

/**
 * The 4 single-cell footprints that must stay walkable on every floor/side-
 * room, regardless of which descent footprints that floor activates. Callers
 * pass this straight through to applyTemplateToCollisionMap's reservedCells.
 * Deliberately just the 4 points — see the file header for why no connecting
 * corridor is reserved between them.
 */
export function getReservedFootprintCells() {
  return [
    { row: STAIRS_UP_ROW, col: STAIRS_COL },
    { row: NORTH_ROW,     col: STAIRS_COL },
    { row: SPINE_ROW,     col: WEST_COL },
    { row: SPINE_ROW,     col: EAST_COL },
  ];
}

// ── Footprint visual contract (3-state model) ───────────────────────────────
// Shared by DungeonFloorGenerator (initial paint) and DungeonPuzzleSystem
// (repaint on state change — key consumed, companion joins, puzzle solved).
// inactive: footprint isn't live this floor — renders nothing (a blank
// space glyph), same "fades to nothing" idiom as the crack/scatter animation
// frames in GameConfig.js. The cell itself stays reserved/walkable (see
// getReservedFootprintCells above) so a later state flip can activate it in
// place without moving anything.
export const FOOTPRINT_LOCKED_COLOR   = '#cc3333';
export const FOOTPRINT_UNLOCKED_COLOR = '#8b7355';
export const FOOTPRINT_INACTIVE_COLOR = '#333333';

/** Paint a descent footprint tile per its active/locked state. */
export function paintDescentVisual(obj, { active, locked }) {
  let char, color;
  if (!active) { char = ' '; color = FOOTPRINT_INACTIVE_COLOR; }  // renders nothing — see file header
  else if (locked) { char = '⚿'; color = FOOTPRINT_LOCKED_COLOR; }  // squared key — reads as "needs a key"
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

// Named templates, loaded from src/data/dungeon/floorTemplates/*.json. Each
// file is { weight, grid }; weight feeds pickRandomTemplateName below, so
// adding a new template (via the editor or by hand) only needs a JSON file
// plus one import + map entry here — nothing else in the codebase changes.
export const DUNGEON_FLOOR_TEMPLATES = {
  open:             openTemplate.grid,
  pillar_rows:      pillarRowsTemplate.grid,
  mild_maze:        mildMazeTemplate.grid,
  separated_zones:  separatedZonesTemplate.grid,
  sewer:            sewerTemplate.grid,
};

// Selection weights, read from each template's own JSON — 'open' is rare so
// most floors have some structure.
const TEMPLATE_WEIGHTS = [
  { name: 'open',            weight: openTemplate.weight },
  { name: 'pillar_rows',     weight: pillarRowsTemplate.weight },
  { name: 'mild_maze',       weight: mildMazeTemplate.weight },
  { name: 'separated_zones', weight: separatedZonesTemplate.weight },
  { name: 'sewer',           weight: sewerTemplate.weight },
];

const TOTAL_WEIGHT = TEMPLATE_WEIGHTS.reduce((s, t) => s + t.weight, 0);

/**
 * Pick a random template name using the configured weights. `excludeNames`
 * (a Set) is used to keep every floor's layout distinct within one dungeon
 * visit — DungeonFloorGenerator passes the set of templates already used
 * this run, so a repeat only happens once every named template has already
 * appeared (more template-consuming rooms than templates exist).
 */
export function pickRandomTemplateName(excludeNames = null) {
  let pool = TEMPLATE_WEIGHTS;
  if (excludeNames && excludeNames.size > 0) {
    const remaining = TEMPLATE_WEIGHTS.filter(t => !excludeNames.has(t.name));
    if (remaining.length > 0) pool = remaining;
  }
  const total = pool.reduce((s, t) => s + t.weight, 0);
  let r = Math.random() * total;
  for (const t of pool) {
    r -= t.weight;
    if (r < 0) return t.name;
  }
  return pool[0]?.name ?? 'open';
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

/**
 * Interior cells a template marks as a preferred enemy spawn point ('E').
 * Optional per-template authoring — _spawnEnemies() in DungeonFloorGenerator
 * shuffles and prefers these before falling back to its own random open-cell
 * placement, so a template with none of these behaves exactly as before this
 * marker existed.
 */
export function getTemplateSpawnCells(templateName, reservedCells = []) {
  const grid = DUNGEON_FLOOR_TEMPLATES[templateName] ?? DUNGEON_FLOOR_TEMPLATES.open;
  const reserved = new Set(reservedCells.map(({ row, col }) => `${row},${col}`));
  const cells = [];
  for (let r = 0; r < grid.length; r++) {
    const line = grid[r];
    for (let c = 0; c < line.length; c++) {
      if (line[c] !== 'E') continue;
      if (reserved.has(`${r},${c}`)) continue;
      cells.push({ row: r, col: c });
    }
  }
  return cells;
}
