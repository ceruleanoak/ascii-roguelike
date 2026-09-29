import { GRID } from '../game/GameConfig.js';

/**
 * Aquifer layout — the pure geometry of the Quagmire's plane-1 Aquifer
 * Current. No game state, no entities: AquiferSystem stamps the result onto the
 * room (roomFeatures.stampAquiferLayout) and reads it back every frame to push
 * the player.
 *
 * Shape: an inflow channel runs from the Whirlpool to the Confluence at room
 * center, where the current splits into three branches, each running out to a
 * different room edge. Each branch is tinted by the Zone it carries the player
 * to (yellow → Oasis, red → Caldera, cyan → the Frosted Maw's lake). Channels
 * never touch each other except inside the Confluence, so which branch the
 * player rides is decided there and nowhere else.
 *
 * Coordinates are grid cells. Channels stay inside cells 1..COLS-2 / 1..ROWS-2
 * (row/col 0 and the last row/col are the room border).
 */

const COLS = GRID.COLS;
const ROWS = GRID.ROWS;

export const CONFLUENCE = { col: Math.floor(COLS / 2), row: Math.floor(ROWS / 2), radius: 3 };
// Channels may only meet within this distance of the Confluence center.
const MERGE_RADIUS = CONFLUENCE.radius + 2;
// Half-width of a channel around its center line (1 → 3 cells wide).
const CHANNEL_HALF_WIDTH = 1;
const BRANCH_COLORS = ['yellow', 'red', 'cyan'];
const EDGE_DIRS = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] };
const LAYOUT_ATTEMPTS = 20;

const inBounds = (col, row) => col >= 1 && row >= 1 && col <= COLS - 2 && row <= ROWS - 2;
const distToConfluence = (col, row) => Math.hypot(col - CONFLUENCE.col, row - CONFLUENCE.row);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** The room edge a direction vector points at most directly. */
function edgeNearest(dx, dy) {
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'east' : 'west';
  return dy > 0 ? 'south' : 'north';
}

/** Cell on the playable rim of `edge`, `t` cells along it. */
function edgeCell(edge, t) {
  switch (edge) {
    case 'north': return { col: t, row: 1 };
    case 'south': return { col: t, row: ROWS - 2 };
    case 'west':  return { col: 1, row: t };
    default:      return { col: COLS - 2, row: t };
  }
}

/** Bresenham cells from a to b, inclusive of both ends. */
function rasterLine(a, b) {
  const cells = [];
  let x = a.col, y = a.row;
  const dx = Math.abs(b.col - x), dy = -Math.abs(b.row - y);
  const sx = x < b.col ? 1 : -1, sy = y < b.row ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    cells.push({ col: x, row: y });
    if (x === b.col && y === b.row) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
  return cells;
}

/** Center-line cells through every waypoint in order, without repeats. */
function polyline(points) {
  const cells = [];
  for (let i = 0; i < points.length - 1; i++) {
    const seg = rasterLine(points[i], points[i + 1]);
    cells.push(...(i === 0 ? seg : seg.slice(1)));
  }
  return cells;
}

/**
 * Waypoints from `from` to `to` with `bends` intermediate points pushed
 * sideways by up to `jitter` cells — a wandering channel rather than a ruler
 * line. `jitter` 0 gives the straight line.
 */
function wanderingPoints(from, to, rng, jitter, bends = 2) {
  const points = [from];
  const len = Math.hypot(to.col - from.col, to.row - from.row) || 1;
  const px = -(to.row - from.row) / len, py = (to.col - from.col) / len;
  for (let i = 1; i <= bends; i++) {
    const t = i / (bends + 1);
    const off = (rng() * 2 - 1) * jitter;
    points.push({
      col: clamp(Math.round(from.col + (to.col - from.col) * t + px * off), 2, COLS - 3),
      row: clamp(Math.round(from.row + (to.row - from.row) * t + py * off), 2, ROWS - 3),
    });
  }
  points.push(to);
  return points;
}

/** Every cell within CHANNEL_HALF_WIDTH (Chebyshev) of a center line. */
function widen(centerline) {
  const seen = new Set();
  const cells = [];
  for (const { col, row } of centerline) {
    for (let dr = -CHANNEL_HALF_WIDTH; dr <= CHANNEL_HALF_WIDTH; dr++) {
      for (let dc = -CHANNEL_HALF_WIDTH; dc <= CHANNEL_HALF_WIDTH; dc++) {
        const c = col + dc, r = row + dr;
        if (!inBounds(c, r)) continue;
        const key = r * COLS + c;
        if (seen.has(key)) continue;
        seen.add(key);
        cells.push({ col: c, row: r });
      }
    }
  }
  return cells;
}

/**
 * The no-touch rule: outside the merge zone, no cell of one channel may sit
 * on or beside (8-neighbour) a cell of another, so at least one wall cell
 * always separates them. A center line that leaves the merge zone must also
 * never come back into it — a branch that looped back to the Confluence
 * would be a second decision point.
 */
function isValid(paths) {
  const owner = new Map();
  for (let i = 0; i < paths.length; i++) {
    for (const { col, row } of paths[i].channel) {
      if (distToConfluence(col, row) <= MERGE_RADIUS) continue;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const other = owner.get((row + dr) * COLS + (col + dc));
          if (other !== undefined && other !== i) return false;
        }
      }
      owner.set(row * COLS + col, i);
    }
  }
  for (const path of paths) {
    // Inflow runs toward the Confluence, branches away from it; normalize to
    // "outward" order before checking for a re-entry.
    const outward = path.kind === 'inflow' ? [...path.centerline].reverse() : path.centerline;
    let left = false;
    for (const { col, row } of outward) {
      const inside = distToConfluence(col, row) <= MERGE_RADIUS;
      if (left && inside) return false;
      if (!inside) left = true;
    }
  }
  return true;
}

/** Build inflow + three branches; `jitter` 0 is the straight fallback. */
function buildPaths(whirlpool, branchEdges, colors, rng, jitter) {
  const center = { col: CONFLUENCE.col, row: CONFLUENCE.row };
  const paths = [{
    kind: 'inflow',
    centerline: polyline(wanderingPoints(whirlpool, center, rng, jitter)),
  }];
  branchEdges.forEach((edge, i) => {
    // Straight fallback exits at the edge midpoint; otherwise anywhere along
    // the edge that keeps a few cells off the corners.
    const span = edge === 'north' || edge === 'south' ? COLS : ROWS;
    const t = jitter === 0 ? Math.floor(span / 2) : 5 + Math.floor(rng() * (span - 10));
    const end = edgeCell(edge, t);
    paths.push({
      kind: 'branch',
      color: colors[i],
      edge,
      centerline: polyline(wanderingPoints(center, end, rng, jitter)),
    });
  });
  for (const path of paths) path.channel = widen(path.centerline);
  return paths;
}

/**
 * Mouth of a path: the center-line cell where it crosses out of the merge
 * zone. The Confluence steers toward branch mouths, and recognises the
 * inflow's side by its mouth.
 */
function mouthOf(path) {
  const outward = path.kind === 'inflow' ? [...path.centerline].reverse() : path.centerline;
  return outward.find(({ col, row }) => distToConfluence(col, row) > MERGE_RADIUS)
    ?? outward[outward.length - 1];
}

/**
 * Generate the Aquifer Current's layout for a Whirlpool at `whirlpool`
 * ({col,row}). Branches go to the three edges other than the one the inflow
 * arrives from; zone colors are dealt to them at random.
 *
 * @param {{col:number,row:number}} whirlpool
 * @param {() => number} [rng]
 * @returns {{
 *   confluence: {col,row,radius},
 *   whirlpool: {col,row},
 *   paths: Array<{kind:'inflow'|'branch', color?, edge?, centerline, channel, mouth}>,
 *   mask: boolean[][],               // [row][col] → cell is channel
 *   near: Array<Array<{p:number,k:number}|null>>  // nearest center-line point per channel cell
 * }}
 */
export function generateAquiferLayout(whirlpool, rng = Math.random) {
  const inflowEdge = edgeNearest(whirlpool.col - CONFLUENCE.col, whirlpool.row - CONFLUENCE.row);
  const branchEdges = Object.keys(EDGE_DIRS).filter(e => e !== inflowEdge);
  const colors = [...BRANCH_COLORS];
  for (let i = colors.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [colors[i], colors[j]] = [colors[j], colors[i]];
  }

  let paths = null;
  for (let attempt = 0; attempt < LAYOUT_ATTEMPTS && !paths; attempt++) {
    const candidate = buildPaths(whirlpool, branchEdges, colors, rng, 4);
    if (isValid(candidate)) paths = candidate;
  }
  // Straight lines to the edge midpoints: the three branch edges are 90°
  // apart and the inflow sits within 45° of the fourth, so this holds the
  // channels apart without needing validation.
  if (!paths) paths = buildPaths(whirlpool, branchEdges, colors, rng, 0);

  for (const path of paths) path.mouth = mouthOf(path);

  const mask = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
  const near = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  const confluenceCells = [];
  for (let r = 1; r <= ROWS - 2; r++) {
    for (let c = 1; c <= COLS - 2; c++) {
      if (distToConfluence(c, r) <= CONFLUENCE.radius + 0.5) confluenceCells.push({ col: c, row: r });
    }
  }
  const allCells = [...confluenceCells, ...paths.flatMap(p => p.channel)];
  for (const { col, row } of allCells) mask[row][col] = true;

  // Nearest center-line point for every channel cell. Channels never touch
  // outside the merge zone, so outside it the nearest line is always the
  // cell's own channel.
  for (const { col, row } of allCells) {
    if (near[row][col]) continue;
    let best = null, bestD = Infinity;
    paths.forEach((path, p) => {
      path.centerline.forEach((pt, k) => {
        const d = (pt.col - col) ** 2 + (pt.row - row) ** 2;
        if (d < bestD) { bestD = d; best = { p, k }; }
      });
    });
    near[row][col] = best;
  }

  return {
    confluence: { ...CONFLUENCE },
    whirlpool: { col: whirlpool.col, row: whirlpool.row },
    paths,
    mask,
    near,
  };
}

/** True when a cell lies inside the Confluence disc, where the current steers. */
export function inConfluence(col, row) {
  return distToConfluence(col, row) <= CONFLUENCE.radius + 0.5;
}
