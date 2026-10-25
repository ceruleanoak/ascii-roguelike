import { GRID } from '../game/GameConfig.js';
import { planeOf, objectOnPlane } from './PlaneSystem.js';
import { isLavaTile, isLavaImmune } from './LavaContact.js';
import { metalPlatformCovers } from './MetalPlatformSystem.js';
import { wetPipSpeed } from './StatusEffectSystem.js';

// The ground as npcSteering sees it: one cell grid per steering body, read
// from the same Background Objects PhysicsSystem moves that body through, and
// a route planner over it.
//
// Before this, steering saw only the collision map. Trees, stumps, grass, mud
// and water (which PhysicsSystem slows the body in) and solid objects that
// aren't in the map (rocks, which it stops the body at) were invisible, so a
// companion walked straight into a tree at 10% speed and waited for stuck
// detection, and lava was something to cross. The cell costs below mirror
// PhysicsSystem.updateEntity's terrain branch, so a route weighs ground the
// way movement over it actually goes.
//
// Hazards are what the Lava-Shy Mechanic gives enemies, extended to every
// steered body: lava (unless the body is lava-immune or floats) and deep water
// (unless it can't drown). A route treats a hazard as a wall. When the target
// can only be reached through one (the player standing in lava), the route
// stops at the nearest safe cell, so a companion waits on the shore the way a
// Lava-Shy enemy does. The start cell is never a hazard, so a body already in
// lava can still route out.

const CELL = GRID.CELL_SIZE;

export const BLOCKED = Infinity;
export const HAZARD = -1;

// PhysicsSystem's terrain multipliers, as the cost of crossing one cell
// (1 = open ground, 4 = a quarter of the speed).
const GRASS_COST = 1 / 0.75;     // tall grass, dry mud still activating
const MUD_COST = 1 / 0.35;       // wet mud, deep snow
const COMPACT_SNOW_COST = 1 / 0.8;

// What the body is, as far as the ground cares. Read once per grid build.
function bodyProfile(entity) {
  const floats = !!(entity.data?.float || entity.floatCharge > 0);
  return {
    plane: planeOf(entity),
    floats,
    lavaSafe: floats || isLavaImmune(entity),
    // PhysicsSystem.applyLiquidResults' drown immunity.
    drownSafe: floats || !!(entity.data?.waterAffinity || entity.data?.swimAffinity
      || entity.polymorphed || entity.deepWaterImmune),
    swimsFast: !!(entity.data?.swimAffinity || entity.polymorphed),
    small: !!(entity.isSmall || entity.data?.small),
  };
}

// Cost of standing in a cell that holds `obj`: a number ≥ 1, BLOCKED, HAZARD,
// or 1 when the object doesn't touch movement.
function objectCost(obj, body, room) {
  const data = obj.data || {};
  if (data.tunnelWall) return BLOCKED;

  if (obj.char === '~') {
    if (isLavaTile(obj)) {
      if (room?.metalPlatform && metalPlatformCovers(room.metalPlatform, obj)) return 1;
      return body.lavaSafe ? 1 : HAZARD;
    }
    if (body.floats) return 1;
    const isMud = obj.typeId ? (obj.typeId === 'mud_dry' || obj.typeId === 'mud_wet')
                             : (obj.isDryMud || obj.slowing === true);
    if (isMud) {
      const wet = obj.typeId === 'mud_wet' || (obj.slowing === true && !obj.isDryMud);
      return wet ? MUD_COST : GRASS_COST;
    }
    if (obj.typeId === 'hot_water') return 1;
    if (obj.getWaterState?.() === 'frozen') return 1;
    if (obj.deepWater && !body.drownSafe) return HAZARD;
    return body.swimsFast ? 1 : 1 / wetPipSpeed(1);
  }

  // Deep snow: environmental, slows but never blocks.
  if (obj.char === '█' && obj._variantData?.environmental && obj._variantData?.compactColor) {
    if (body.small) return 1;
    return obj.compacted ? COMPACT_SNOW_COST : MUD_COST;
  }

  if (typeof data.slowing === 'number') return body.floats ? 1 : 1 / Math.max(data.slowing, 0.05);
  if (data.slowing === true) return body.floats ? 1 : GRASS_COST;
  if (obj.slowing === true && !obj.isDryMud) return body.floats ? 1 : MUD_COST;

  // PhysicsSystem.checkBackgroundObjectCollision's solidity.
  const solid = data.solid || data.bulletInteraction === 'block'
    || data.bulletInteraction === 'interact-preserve';
  if (solid && !(data.smallDoor && body.small)) return BLOCKED;
  return 1;
}

// Heavier wins: BLOCKED over HAZARD over any slow over open ground.
function heavier(a, b) {
  if (a === BLOCKED || b === BLOCKED) return BLOCKED;
  if (a === HAZARD || b === HAZARD) return HAZARD;
  return Math.max(a, b);
}

/**
 * The cost grid `entity` steers over: `{ cols, rows, cost }`, where
 * `cost[row * cols + col]` is ≥ 1, BLOCKED or HAZARD. Walls come from the
 * collision map; everything else from the Background Objects on the body's
 * plane.
 */
export function buildTerrainGrid(game, entity, collisionMap) {
  const rows = collisionMap?.length ?? GRID.ROWS;
  const cols = collisionMap?.[0]?.length ?? GRID.COLS;
  const cost = new Float32Array(cols * rows).fill(1);
  if (collisionMap) {
    for (let r = 0; r < rows; r++) {
      const row = collisionMap[r];
      for (let c = 0; c < cols; c++) if (row[c]) cost[r * cols + c] = BLOCKED;
    }
  }

  const objects = game?._activeBackgroundObjects?.() ?? game?.currentRoom?.backgroundObjects ?? [];
  const room = game?.activeRoom ?? game?.currentRoom;
  const body = bodyProfile(entity);
  for (const obj of objects) {
    if (obj.destroyed || !obj.position || !objectOnPlane(obj, body.plane)) continue;
    const c = objectCost(obj, body, room);
    if (c === 1) continue;
    const box = obj.getHitbox ? obj.getHitbox() : { x: obj.position.x, y: obj.position.y, width: CELL, height: CELL };
    const c0 = Math.max(0, Math.floor(box.x / CELL));
    const r0 = Math.max(0, Math.floor(box.y / CELL));
    const c1 = Math.min(cols - 1, Math.floor((box.x + Math.max(box.width, 1) - 1) / CELL));
    const r1 = Math.min(rows - 1, Math.floor((box.y + Math.max(box.height, 1) - 1) / CELL));
    for (let r = r0; r <= r1; r++) {
      for (let col = c0; col <= c1; col++) {
        const i = r * cols + col;
        cost[i] = heavier(cost[i], c);
      }
    }
  }
  return { cols, rows, cost };
}

/** Cost of cell (col, row); out of bounds is BLOCKED. */
export function cellCost(grid, col, row) {
  if (col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) return BLOCKED;
  return grid.cost[row * grid.cols + col];
}

// Every cell a segment passes through, in order (grid traversal, so no cell
// is skipped, a clipped corner included). `visit(col, row)` returns false to stop.
function traverse(x0, y0, x1, y1, visit) {
  let col = Math.floor(x0 / CELL), row = Math.floor(y0 / CELL);
  const endCol = Math.floor(x1 / CELL), endRow = Math.floor(y1 / CELL);
  const dx = x1 - x0, dy = y1 - y0;
  const stepC = dx > 0 ? 1 : -1, stepR = dy > 0 ? 1 : -1;
  const tDeltaC = dx !== 0 ? Math.abs(CELL / dx) : Infinity;
  const tDeltaR = dy !== 0 ? Math.abs(CELL / dy) : Infinity;
  let tMaxC = dx !== 0 ? Math.abs(((dx > 0 ? col + 1 : col) * CELL - x0) / dx) : Infinity;
  let tMaxR = dy !== 0 ? Math.abs(((dy > 0 ? row + 1 : row) * CELL - y0) / dy) : Infinity;
  // One step per cell boundary crossed; a step never moves past the end
  // cell on an axis already there, whatever floating point says.
  let n = Math.abs(endCol - col) + Math.abs(endRow - row);
  while (n > 0) {
    if (n >= 2 && col !== endCol && row !== endRow && Math.abs(tMaxC - tMaxR) < 1e-9) {
      // Exactly through a corner: both side cells are touched.
      if (!visit(col + stepC, row) || !visit(col, row + stepR)) return false;
      col += stepC; row += stepR; tMaxC += tDeltaC; tMaxR += tDeltaR; n -= 2;
    } else if (row === endRow || (col !== endCol && tMaxC < tMaxR)) {
      col += stepC; tMaxC += tDeltaC; n--;
    } else {
      row += stepR; tMaxR += tDeltaR; n--;
    }
    if (!visit(col, row)) return false;
  }
  return true;
}

/**
 * Whether a body of `w`×`h` whose center walks straight from (x0, y0) to
 * (x1, y1) stays on ground no worse than `maxCost`, never touching a wall or
 * hazard with any part of its box (PhysicsSystem burns on any overlap, not
 * just the center's). Cells the box already stands in are exempt: the body is
 * there. So is the cost (not the walls or hazards) of the cells the box ends
 * in: every way to a target standing in grass ends in grass.
 */
export function lineWithin(grid, x0, y0, x1, y1, maxCost = 1, w = 1, h = 1) {
  const hx = Math.max(0, w / 2 - 0.5), hy = Math.max(0, h / 2 - 0.5);
  for (const [ox, oy] of [[0, 0], [-hx, -hy], [hx, -hy], [-hx, hy], [hx, hy]]) {
    const startCol = Math.floor((x0 + ox) / CELL), startRow = Math.floor((y0 + oy) / CELL);
    const endCol = Math.floor((x1 + ox) / CELL), endRow = Math.floor((y1 + oy) / CELL);
    const ok = traverse(x0 + ox, y0 + oy, x1 + ox, y1 + oy, (col, row) => {
      if (col === startCol && row === startRow) return true;
      const c = cellCost(grid, col, row);
      if (c === BLOCKED || c === HAZARD) return false;
      return c <= maxCost || (col === endCol && row === endRow);
    });
    if (!ok) return false;
    if (hx === 0 && hy === 0) break; // a point: the center ray is the whole test
  }
  return true;
}

// Minimal binary min-heap of [priority, index] for the planner.
class MinHeap {
  constructor() { this.items = []; }
  get size() { return this.items.length; }
  push(p, i) {
    const a = this.items;
    a.push([p, i]);
    let k = a.length - 1;
    while (k > 0) {
      const parent = (k - 1) >> 1;
      if (a[parent][0] <= a[k][0]) break;
      [a[parent], a[k]] = [a[k], a[parent]];
      k = parent;
    }
  }
  pop() {
    const a = this.items;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let k = 0;
      for (;;) {
        const l = 2 * k + 1, r = l + 1;
        let m = k;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === k) break;
        [a[m], a[k]] = [a[k], a[m]];
        k = m;
      }
    }
    return top;
  }
}

const NEIGHBORS = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
];

/**
 * Cheapest route (A*, 8-connected, no cutting a wall or hazard corner) from
 * one cell to another, as world-space cell centers excluding the start cell.
 * When the goal can't be reached, routes to the reached cell nearest it
 * instead (the shore). Returns null only when the body can't move at all.
 */
export function planRoute(grid, startCol, startRow, goalCol, goalRow) {
  const { cols, rows } = grid;
  const n = cols * rows;
  if (startCol < 0 || startRow < 0 || startCol >= cols || startRow >= rows) return null;
  goalCol = Math.min(cols - 1, Math.max(0, goalCol));
  goalRow = Math.min(rows - 1, Math.max(0, goalRow));
  const start = startRow * cols + startCol;
  const goal = goalRow * cols + goalCol;
  const passable = (i) => i === start || (grid.cost[i] !== BLOCKED && grid.cost[i] !== HAZARD);
  // The start cell counts as open ground, whatever it holds (it may be lava or a wall edge).
  const costOf = (i) => (i === start ? 1 : grid.cost[i]);
  // Octile distance at open-ground cost — never overestimates, since no cell costs below 1.
  const h = (c, r) => {
    const dx = Math.abs(c - goalCol), dy = Math.abs(r - goalRow);
    return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
  };

  const g = new Float32Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const heap = new MinHeap();
  g[start] = 0;
  heap.push(h(startCol, startRow), start);
  let nearest = start;
  let nearestH = h(startCol, startRow);

  while (heap.size) {
    const [f, i] = heap.pop();
    const c = i % cols, r = (i / cols) | 0;
    if (f - h(c, r) > g[i] + 1e-4) continue; // stale entry
    if (i === goal) { nearest = goal; break; }
    const hi = h(c, r);
    if (hi < nearestH) { nearestH = hi; nearest = i; }
    for (const [dc, dr, step] of NEIGHBORS) {
      const nc = c + dc, nr = r + dr;
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
      const j = nr * cols + nc;
      if (!passable(j)) continue;
      if (dc && dr && (!passable(r * cols + nc) || !passable(nr * cols + c))) continue;
      const ng = g[i] + step * (costOf(i) + costOf(j)) / 2;
      if (ng < g[j]) {
        g[j] = ng;
        prev[j] = i;
        heap.push(ng + h(nc, nr), j);
      }
    }
  }

  const path = [];
  for (let cur = nearest; cur !== start && cur !== -1; cur = prev[cur]) {
    path.push({ x: (cur % cols) * CELL + CELL / 2, y: ((cur / cols) | 0) * CELL + CELL / 2 });
  }
  return path.reverse();
}
