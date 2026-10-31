// mazePath — breadth-first search over a Maze collision map (true = solid),
// shared by everything that walks the Maze cell by cell: the Ghost's pac-man
// pathing (MazeSystem), the Wellspring's furthest-cell search and the flood's
// spread order (MazeTrapSystem), and the Maze Rat's movement
// (enemyMechanics/MazePathingMechanic). The Maze is a tree carved by DFS, so
// the BFS path is the only path.

const STEPS = [[0, -1], [0, 1], [-1, 0], [1, 0]];

const openCell = (collisionMap) => (col, row) => !collisionMap[row][col];

/**
 * Cells from start (exclusive) to goal (inclusive), or [] when start is goal,
 * or null when the goal can't be reached.
 */
export function bfsPath(collisionMap, startCol, startRow, goalCol, goalRow) {
  if (startCol === goalCol && startRow === goalRow) return [];
  const rows = collisionMap.length, cols = collisionMap[0].length;
  const queue  = [[startCol, startRow]];
  const parent = new Map();
  parent.set(`${startRow},${startCol}`, null);

  while (queue.length > 0) {
    const [col, row] = queue.shift();
    if (col === goalCol && row === goalRow) {
      const path = [];
      let key = `${row},${col}`;
      while (parent.get(key) !== null) {
        const [r, c] = key.split(',').map(Number);
        path.unshift({ col: c, row: r });
        key = parent.get(key);
      }
      return path;
    }
    for (const [dc, dr] of STEPS) {
      const nc = col + dc, nr = row + dr;
      if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
      if (collisionMap[nr][nc]) continue;
      const key = `${nr},${nc}`;
      if (parent.has(key)) continue;
      parent.set(key, `${row},${col}`);
      queue.push([nc, nr]);
    }
  }
  return null;
}

/**
 * Every cell reachable from start, in BFS order, each with its step distance:
 * [{ col, row, dist }]. `passable(col, row)` decides which cells the search
 * enters (default: the open cells of collisionMap); the start is always
 * included.
 */
export function bfsOrder(collisionMap, startCol, startRow, passable = openCell(collisionMap)) {
  const rows = collisionMap.length, cols = collisionMap[0].length;
  const seen = new Set([`${startRow},${startCol}`]);
  const order = [{ col: startCol, row: startRow, dist: 0 }];
  for (let i = 0; i < order.length; i++) {
    const { col, row, dist } = order[i];
    for (const [dc, dr] of STEPS) {
      const nc = col + dc, nr = row + dr;
      if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
      const key = `${nr},${nc}`;
      if (seen.has(key) || !passable(nc, nr)) continue;
      seen.add(key);
      order.push({ col: nc, row: nr, dist: dist + 1 });
    }
  }
  return order;
}
