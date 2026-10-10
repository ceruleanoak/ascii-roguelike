// Staircase footprint geometry — the cells every dungeon floor keeps for its
// staircases, and the cell a player lands on beside each one.
//
// Pure functions of the footprint contract (footprintContract.json), with no
// imports, so the game (dungeonFloorTemplates.js, DungeonSystem), the dungeon
// editor's CommonJS main process and the plain-Node data gate all share one
// copy instead of mirroring the geometry by hand.

/**
 * The 4 single-cell footprints that must stay walkable on every floor/side-
 * room, regardless of which descent footprints that floor activates —
 * up-stairs, North, West, East. Deliberately just the 4 points, no connecting
 * corridor between them (see dungeonFloorTemplates.js's header); the
 * Progression Solver is what proves they connect.
 */
export function reservedFootprintCells(contract) {
  const { STAIRS_COL, STAIRS_UP_ROW, NORTH_ROW, SPINE_ROW, WEST_COL, EAST_COL } = contract;
  return [
    { row: STAIRS_UP_ROW, col: STAIRS_COL },
    { row: NORTH_ROW,     col: STAIRS_COL },
    { row: SPINE_ROW,     col: WEST_COL },
    { row: SPINE_ROW,     col: EAST_COL },
  ];
}

/**
 * The cell a player lands on beside a footprint: one step from the border
 * side the footprint sits on, toward the room's interior. Footprints sit on
 * the top row band, the left and right column bands, and the bottom row band.
 */
export function landingCellFor(row, col, contract) {
  const { rows, cols } = contract;
  if (row <= 5) return { row: row + 1, col };          // North side → step south
  if (row >= rows - 5) return { row: row - 1, col };   // South side → step north
  if (col <= 5) return { row, col: col + 1 };          // West side → step east
  if (col >= cols - 5) return { row, col: col - 1 };   // East side → step west
  return { row: row + 1, col };
}
