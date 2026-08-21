// Dungeon puzzle-room templates — 24×24 grids plus a trigger list, authored
// via tools/dungeon-editor/ (Puzzle mode). This is a sibling to
// dungeonFloorTemplates.js's numbered-floor templates, but for the puzzle
// side-room family: DungeonFloorGenerator.generatePuzzleRoom() turns a
// template into a live floor, and DungeonPuzzleSystem._updatePuzzleRoom()
// drives it at runtime.
//
// # = solid wall cell    . = floor (walkable)    ~ = water (walkable)
// X = the room's one-way unlockable exit (stairsUp) — exactly one per grid
//
// Coordinate contract: 24 cols × 24 rows, outer border (row 0, row 23,
// col 0, col 23) always walls — the generator stamps these unconditionally
// same as floor templates, so a template only needs to author interior
// cells (rows 1-22, cols 1-22).
//
// Triggers: { row, col, kind, activation, neutralizeSeconds }
//   kind: 'switch' (strike-triggered, puzzleSignal+glitterHit — same
//         contract as the Whip Trial's switches) or 'panel' (occupancy-
//         triggered — same contract as the Companion Gate's switches,
//         just renamed/generalized so it can coexist with 'switch' as a
//         visually distinct element in the same room).
//   activation: 'permanent' (once triggered, stays active forever) or
//         'timed' (reverts to inactive neutralizeSeconds after the last
//         trigger pulse/occupancy ends — required, > 0, when timed).
// The room's exit unlocks once every trigger in the list is active at once
// (DungeonPuzzleSystem._updatePuzzleRoom) — the generalized form of the
// Whip Trial's "both switches struck within the same swing" rule and the
// Companion Gate's "both switches pressed at once" rule.
//
// Unlike floor templates, puzzle templates carry no `weight` — nothing
// currently picks among multiple puzzle templates at random (each is
// selected by name where it's wired into a specific side room), so a
// selection-weight field would be speculative. Add one if/when a caller
// needs it.

import sampleTwoTriggersTemplate from './dungeon/puzzleTemplates/sample_two_triggers.json';

// Named templates, loaded from src/data/dungeon/puzzleTemplates/*.json.
// Adding a new one (via the editor or by hand) needs a JSON file plus one
// import + map entry here — nothing else in the codebase changes.
export const PUZZLE_ROOM_TEMPLATES = {
  sample_two_triggers: sampleTwoTriggersTemplate,
};

/** Look up a template by name, falling back to the bundled sample if the name is unknown. */
export function getPuzzleTemplate(templateName) {
  return PUZZLE_ROOM_TEMPLATES[templateName] ?? PUZZLE_ROOM_TEMPLATES.sample_two_triggers;
}

/** Stamp a template's wall cells ('#', interior only) onto an existing collisionMap. */
export function applyPuzzleTemplateToCollisionMap(collisionMap, templateName) {
  const { grid } = getPuzzleTemplate(templateName);
  const rows = collisionMap.length;
  const cols = collisionMap[0]?.length ?? 0;
  for (let r = 1; r < rows - 1; r++) {
    const line = grid[r] ?? '';
    for (let c = 1; c < cols - 1; c++) {
      if (line[c] === '#') collisionMap[r][c] = true;
    }
  }
}

/** Interior cells a template marks as water ('~'). Walkable — the generator places a Puddle on each. */
export function getPuzzleTemplateWaterCells(templateName) {
  const { grid } = getPuzzleTemplate(templateName);
  const cells = [];
  for (let r = 0; r < grid.length; r++) {
    const line = grid[r];
    for (let c = 0; c < line.length; c++) {
      if (line[c] === '~') cells.push({ row: r, col: c });
    }
  }
  return cells;
}

/** The template's single exit cell ('X') — where the room's locked stairsUp fixture is built. */
export function getPuzzleTemplateExitCell(templateName) {
  const { grid } = getPuzzleTemplate(templateName);
  for (let r = 0; r < grid.length; r++) {
    const c = grid[r].indexOf('X');
    if (c >= 0) return { row: r, col: c };
  }
  return null;
}

/** The template's authored trigger list (switches + floor panels). */
export function getPuzzleTemplateTriggers(templateName) {
  return getPuzzleTemplate(templateName).triggers ?? [];
}
