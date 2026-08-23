// Dungeon puzzle-room templates — 24×24 grids plus a trigger list, authored
// via tools/dungeon-editor/ (Puzzle mode). This is a sibling to
// dungeonFloorTemplates.js's numbered-floor templates, but for the puzzle
// side-room family: DungeonFloorGenerator.generatePuzzleRoom() turns a
// template into a live floor, and DungeonPuzzleSystem._updatePuzzleRoom()
// drives it at runtime.
//
// # = solid wall cell    . = floor (walkable)    ~ = water (walkable)
// X = the room's one-way unlockable exit (stairsUp) — exactly one per grid
// G = impassable gap (chasm) — solid like '#' but rendered as a crossable-
//     by-reach-only void (HutInteriorOverlay), not an ordinary wall. Paired
//     with hookPosts (below) to cross it, same shape as the original Whip
//     Trial's hardcoded gap band, generalized to any per-cell arrangement.
//
// Coordinate contract: 24 cols × 24 rows, outer border (row 0, row 23,
// col 0, col 23) always walls — the generator stamps these unconditionally
// same as floor templates, so a template only needs to author interior
// cells (rows 1-22, cols 1-22).
//
// Triggers: { row, col, kind, activation, neutralizeSeconds }
//   kind: 'switch' (strike-triggered, puzzleSignal+glitterHit — same
//         contract as the Whip Trial's switches), 'panel' (occupancy-
//         triggered — same contract as Branch's own switches, just
//         renamed/generalized so it can coexist with 'switch' as a visually
//         distinct element in the same room), or 'torch' (ignite-triggered
//         — same proximity + held-Torch-item contract as a decorative torch
//         fixture below, but this one counts toward the exit-unlock check).
//         A torch-kind trigger is always activation: 'permanent' (a lit
//         torch never reverts) — 'timed' is rejected for this kind.
//   activation: 'permanent' (once triggered, stays active forever) or
//         'timed' (reverts to inactive neutralizeSeconds after the last
//         trigger pulse/occupancy ends — required, > 0, when timed; not
//         valid for kind:'torch', see above).
// The room's exit unlocks once every trigger in the list is active at once
// (DungeonPuzzleSystem._updatePuzzleRoom) — the generalized form of the
// Whip Trial's "both switches struck within the same swing" rule and the
// Branch's own "both switches pressed at once" rule.
//
// hookPosts: [{ row, col }] — manually placed pull fixtures (independent of
//   Gap tiles; an author positions them anywhere). Same puzzleSignal/
//   glitterHit strike contract as a switch, but pulls the player to the
//   post's own position instead of arming a trigger (player.hookedByWhip;
//   PhysicsSystem owns the actual traversal) — the mechanic the original
//   Whip Trial used to cross its gap.
//
// torches: [{ row, col, lit }] — DECORATIVE maze-parity ignite fixtures,
//   unrelated to the trigger system above (contrast kind:'torch' triggers,
//   which look identical but do gate the exit). Unlit until the player
//   approaches while wielding the Torch item, permanent once lit, pulsing
//   glow. `lit` is optional (defaults false) — set true to author a torch
//   that starts already burning. Visual/lighting only — no ghost-shielding,
//   since dungeons have no ghosts (contrast MazeSystem's own MazeTorch).
//
// pedestal: { row, col, weaponChar } | absent — opt-in weapon-tutorial
//   marker. weaponChar is any character an existing recipe produces (typed
//   freely in the dungeon editor's Pedestal tool, checked against
//   recipes.js at save time — not a fixed list). When present,
//   generatePuzzleRoom grants a real pickup-able copy of that weapon (via
//   pickWeaponTutorial()) flanked by decorative recipe-ingredient chrome,
//   anchored on this cell's column (mirrors the original Whip Trial's own
//   hardcoded pedestal, now authorable by any template).
//
// weight: selection weight for the North-descent pool (see
// pickRandomPuzzleTemplateName below) — every named template participates,
// same as dungeonFloorTemplates.js's numbered-floor pool.

import whipTrialTemplate from './dungeon/puzzleTemplates/whip_trial.json';
import boomerangTrialTemplate from './dungeon/puzzleTemplates/boomerang_trial.json';
import torchTrialTemplate from './dungeon/puzzleTemplates/torch_trial.json';

// Named templates, loaded from src/data/dungeon/puzzleTemplates/*.json.
// Adding a new one (via the editor or by hand) needs a JSON file plus one
// import + map entry here — nothing else in the codebase changes (the
// weighted pool below and DungeonSystem.ensureFloorGenerated both discover
// it automatically via this map).
export const PUZZLE_ROOM_TEMPLATES = {
  whip_trial: whipTrialTemplate,
  boomerang_trial: boomerangTrialTemplate,
  torch_trial: torchTrialTemplate,
};

/** Look up a template by name, falling back to Whip Trial if the name is unknown. */
export function getPuzzleTemplate(templateName) {
  return PUZZLE_ROOM_TEMPLATES[templateName] ?? PUZZLE_ROOM_TEMPLATES.whip_trial;
}

// Selection weights, read from each template's own JSON — mirrors
// dungeonFloorTemplates.js's TEMPLATE_WEIGHTS/pickRandomTemplateName exactly.
const TEMPLATE_WEIGHTS = Object.entries(PUZZLE_ROOM_TEMPLATES).map(([name, data]) => ({
  name, weight: data.weight,
}));

/**
 * Pick a random puzzle-room template name using the configured weights.
 * `excludeNames` (a Set) works the same as the floor-template picker's —
 * no current caller needs it (only one puzzle-room descent exists per
 * dungeon visit today), but the signature stays parallel for when a second
 * one is added.
 */
export function pickRandomPuzzleTemplateName(excludeNames = null) {
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
  return pool[0]?.name ?? 'whip_trial';
}

/** Stamp a template's wall cells ('#') and gap cells ('G') onto an existing collisionMap — both solid. */
export function applyPuzzleTemplateToCollisionMap(collisionMap, templateName) {
  const { grid } = getPuzzleTemplate(templateName);
  const rows = collisionMap.length;
  const cols = collisionMap[0]?.length ?? 0;
  for (let r = 1; r < rows - 1; r++) {
    const line = grid[r] ?? '';
    for (let c = 1; c < cols - 1; c++) {
      if (line[c] === '#' || line[c] === 'G') collisionMap[r][c] = true;
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

/** Interior cells a template marks as an impassable gap ('G') — rendering-only metadata; collision is stamped by applyPuzzleTemplateToCollisionMap. */
export function getPuzzleTemplateGapCells(templateName) {
  const { grid } = getPuzzleTemplate(templateName);
  const cells = [];
  for (let r = 0; r < grid.length; r++) {
    const line = grid[r];
    for (let c = 0; c < line.length; c++) {
      if (line[c] === 'G') cells.push({ row: r, col: c });
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

/** The template's authored hook-post list (manual pull fixtures) — optional, defaults to none. */
export function getPuzzleTemplateHookPosts(templateName) {
  return getPuzzleTemplate(templateName).hookPosts ?? [];
}

/** The template's authored torch list (maze-parity ignite fixtures) — optional, defaults to none. */
export function getPuzzleTemplateTorches(templateName) {
  return getPuzzleTemplate(templateName).torches ?? [];
}

/** The template's opt-in weapon-tutorial pedestal marker, or null if this template doesn't grant one. */
export function getPuzzleTemplatePedestal(templateName) {
  return getPuzzleTemplate(templateName).pedestal ?? null;
}
