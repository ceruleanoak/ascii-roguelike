// Staircase footprint geometry — the cells every dungeon floor keeps for its
// staircases, and the cell a player lands on beside each one.
//
// Pure functions of the footprint contract (footprintContract.json), with no
// imports, so the game (dungeonFloorTemplates.js, DungeonSystem), the dungeon
// editor's CommonJS main process and the plain-Node data gate all share one
// copy instead of mirroring the geometry by hand.

/**
 * The diagonal footprints, NW and NE — the North row's corners. Only a floor
 * whose Dungeon Graph node has a Hidden Descent there keeps one clear, so a
 * template may build over a corner on every other floor; which corners a
 * template can give up is proven per template (dungeonFloorTemplates.js).
 */
export const DIAGONAL_DIRS = ['NW', 'NE'];

/**
 * The 4 single-cell footprints that must stay walkable on every floor/side-
 * room, regardless of which descent footprints that floor activates —
 * up-stairs, North, West, East — plus the cell of each diagonal in
 * `diagonals` the floor uses. Deliberately just the points, no connecting
 * corridor between them (see dungeonFloorTemplates.js's header); the
 * Progression Solver is what proves they connect.
 */
export function reservedFootprintCells(contract, diagonals = []) {
  const { STAIRS_COL, STAIRS_UP_ROW, NORTH_ROW, SPINE_ROW, WEST_COL, EAST_COL } = contract;
  return [
    { row: STAIRS_UP_ROW, col: STAIRS_COL },
    { row: NORTH_ROW,     col: STAIRS_COL },
    { row: SPINE_ROW,     col: WEST_COL },
    { row: SPINE_ROW,     col: EAST_COL },
    ...diagonals.map(dir => footprintCellFor(dir, contract)),
  ];
}

/**
 * The cell a player lands on beside a footprint: one step from the border
 * side the footprint sits on, toward the room's interior. Footprints sit on
 * the top row band, the left and right column bands, and the bottom row band;
 * a diagonal footprint in a top corner lands one step in on the diagonal.
 */
export function landingCellFor(row, col, contract) {
  const { rows, cols } = contract;
  if (row <= 5 && col <= 5) return { row: row + 1, col: col + 1 };         // NW corner → step SE
  if (row <= 5 && col >= cols - 5) return { row: row + 1, col: col - 1 };  // NE corner → step SW
  if (row <= 5) return { row: row + 1, col };          // North side → step south
  if (row >= rows - 5) return { row: row - 1, col };   // South side → step north
  if (col <= 5) return { row, col: col + 1 };          // West side → step east
  if (col >= cols - 5) return { row, col: col - 1 };   // East side → step west
  return { row: row + 1, col };
}

/**
 * The footprint cell for a compass direction on a dungeon floor: N/W/E are
 * the three descent footprints, NW/NE the diagonal corners (Hidden Descents
 * only), S the up-stairs. A Dungeon Graph edge's `dir` names the footprint
 * its descent sits on.
 */
export function footprintCellFor(dir, contract) {
  const { STAIRS_COL, STAIRS_UP_ROW, NORTH_ROW, SPINE_ROW, WEST_COL, EAST_COL } = contract;
  switch (dir) {
    case 'N': return { row: NORTH_ROW,     col: STAIRS_COL };
    case 'S': return { row: STAIRS_UP_ROW, col: STAIRS_COL };
    case 'W': return { row: SPINE_ROW,     col: WEST_COL };
    case 'E': return { row: SPINE_ROW,     col: EAST_COL };
    case 'NW': return { row: NORTH_ROW,    col: WEST_COL };
    case 'NE': return { row: NORTH_ROW,    col: EAST_COL };
    default:  return null;
  }
}

/**
 * Every cell a floor must keep standable and connected: each footprint
 * (`reservedFootprintCells`), the landing beside each one, and the Entrance's
 * arrival cell and the cell beside its exterior door. `arrival` marks the
 * cells a floor is first entered by (the up-stairs, its landing, and the
 * Entrance's two). The Progression Solver proves these connect; the runtime
 * keeps a Push Rock from ever being shoved onto one.
 */
export function floorAnchorCells(contract, diagonals = []) {
  const { STAIRS_COL, EXIT_ROW } = contract;
  const footprints = reservedFootprintCells(contract, diagonals);
  const names = ['Up-stairs', 'North descent', 'West descent', 'East descent',
    ...diagonals.map(dir => `${dir} descent`)];
  const cells = footprints.map((cell, k) => ({ ...cell, what: names[k], arrival: k === 0 }));
  footprints.forEach(({ row, col }, k) => {
    cells.push({ ...landingCellFor(row, col, contract), what: `${names[k]} landing`, arrival: k === 0 });
  });
  cells.push({ row: EXIT_ROW - 2, col: STAIRS_COL, what: 'Entrance arrival', arrival: true });
  cells.push({ row: EXIT_ROW - 1, col: STAIRS_COL, what: 'Entrance door', arrival: true });
  return cells;
}
