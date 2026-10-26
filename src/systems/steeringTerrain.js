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
// (unless it can't drown). A route treats lava as a wall. When the target
// can only be reached through it (the player standing in lava), the route
// stops at the nearest safe cell, so a companion waits on the shore the way a
// Lava-Shy enemy does. The start cell is never a hazard, so a body already in
// lava can still route out.
//
// Deep water is a hazard a route may swim, at DEEP_WATER_COST a cell. Lava
// burns on the first overlap; deep water only fills the wet pips over several
// seconds before it drowns, so a short swim is survivable, and waiting on the
// shore is the wrong answer when the water is the only way to the target (an
// enemy on an island). The cost outweighs any dry way round in a room, so a
// route swims only when nothing dry reaches. Straight-line checks (lineWithin)
// keep out of it unless the caller's route already swims. To everything else
// reading the grid through cellCost (where the player may stand, GET's
// reach), deep water stays a HAZARD.

const CELL = GRID.CELL_SIZE;

export const BLOCKED = Infinity;
export const HAZARD = -1;
// What a route pays to swim one cell of deep water. A room is 30 cells
// across, so 100 a cell outweighs any dry detour in it.
export const DEEP_WATER_COST = 100;
// The heaviest ground a straight move off any route may cross: every slow
// ground, never deep water (detours, sidesteps, rolls, the leash).
export const DRY_GROUND = DEEP_WATER_COST - 1;

// objectCost's mark for deep water a body can drown in: a HAZARD in the grid,
// remembered as swimmable unless lava or a wall shares the cell.
const DEEP = Symbol('deep water');

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
// DEEP, or 1 when the object doesn't touch movement.
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
    if (obj.deepWater && !body.drownSafe) return DEEP;
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
 * The cost grid `entity` steers over: `{ cols, rows, cost, swim }`, where
 * `cost[row * cols + col]` is ≥ 1, BLOCKED or HAZARD, and `swim` marks the
 * HAZARD cells that are only deep water (see routeCost). Walls come from the
 * collision map; everything else from the Background Objects on the body's
 * plane.
 */
export function buildTerrainGrid(game, entity, collisionMap) {
  const rows = collisionMap?.length ?? GRID.ROWS;
  const cols = collisionMap?.[0]?.length ?? GRID.COLS;
  const cost = new Float32Array(cols * rows).fill(1);
  const deep = new Uint8Array(cols * rows);      // deep water lies here
  const otherHazard = new Uint8Array(cols * rows); // and lava too: no swimming
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
    const mark = objectCost(obj, body, room);
    if (mark === 1) continue;
    const c = mark === DEEP ? HAZARD : mark;
    const box = obj.getHitbox ? obj.getHitbox() : { x: obj.position.x, y: obj.position.y, width: CELL, height: CELL };
    const c0 = Math.max(0, Math.floor(box.x / CELL));
    const r0 = Math.max(0, Math.floor(box.y / CELL));
    const c1 = Math.min(cols - 1, Math.floor((box.x + Math.max(box.width, 1) - 1) / CELL));
    const r1 = Math.min(rows - 1, Math.floor((box.y + Math.max(box.height, 1) - 1) / CELL));
    for (let r = r0; r <= r1; r++) {
      for (let col = c0; col <= c1; col++) {
        const i = r * cols + col;
        cost[i] = heavier(cost[i], c);
        if (mark === DEEP) deep[i] = 1;
        else if (c === HAZARD) otherHazard[i] = 1;
      }
    }
  }
  const swim = new Uint8Array(cols * rows);
  for (let i = 0; i < swim.length; i++) swim[i] = deep[i] && !otherHazard[i] && cost[i] === HAZARD ? 1 : 0;
  return { cols, rows, cost, swim };
}

/** Cost of cell (col, row); out of bounds is BLOCKED. Deep water is a HAZARD. */
export function cellCost(grid, col, row) {
  if (col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) return BLOCKED;
  return grid.cost[row * grid.cols + col];
}

/**
 * Cost of moving through cell (col, row): cellCost, except deep water (and
 * nothing worse) costs DEEP_WATER_COST instead of being a HAZARD.
 */
export function routeCost(grid, col, row) {
  if (col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) return BLOCKED;
  const i = row * grid.cols + col;
  return grid.swim?.[i] ? DEEP_WATER_COST : grid.cost[i];
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
 * in: every way to a target standing in grass ends in grass. Deep water
 * counts at DEEP_WATER_COST (routeCost) and is never exempt as an end cell:
 * a line ending in it is a swim, which only a `maxCost` admitting deep water
 * allows.
 */
export function lineWithin(grid, x0, y0, x1, y1, maxCost = 1, w = 1, h = 1) {
  // The box's corners as PhysicsSystem reads any overlap: [x, x + w) around a
  // top-left origin (terrain contact is an open interval test; wall cells,
  // [x, x + w - 1], are looser on the far edge, so this satisfies both). A
  // softer inset lets a body a tenth of a pixel into a wall row pass this
  // test, then physics blocks it against the wall's corner every frame.
  const EDGE = 0.01;
  const left = w > 1 ? -w / 2 : 0, right = w > 1 ? w / 2 - EDGE : 0;
  const top = h > 1 ? -h / 2 : 0, bottom = h > 1 ? h / 2 - EDGE : 0;
  const point = left === 0 && right === 0 && top === 0 && bottom === 0;
  for (const [ox, oy] of [[0, 0], [left, top], [right, top], [left, bottom], [right, bottom]]) {
    const startCol = Math.floor((x0 + ox) / CELL), startRow = Math.floor((y0 + oy) / CELL);
    const endCol = Math.floor((x1 + ox) / CELL), endRow = Math.floor((y1 + oy) / CELL);
    const ok = traverse(x0 + ox, y0 + oy, x1 + ox, y1 + oy, (col, row) => {
      if (col === startCol && row === startRow) return true;
      const c = routeCost(grid, col, row);
      if (c === BLOCKED || c === HAZARD) return false;
      return c <= maxCost || (col === endCol && row === endRow && c < DEEP_WATER_COST);
    });
    if (!ok) return false;
    if (point) break; // a point: the center ray is the whole test
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
 * Swims deep water at DEEP_WATER_COST a cell (routeCost), so only where
 * nothing dry reaches, and only on the way to dry ground: a goal in deep
 * water (the player swimming, a point off a bank) is a hazard like lava.
 * When the goal can't be reached, routes to the reached cell nearest it
 * instead (the shore). Returns null only when the body can't
 * move at all.
 */
export function planRoute(grid, startCol, startRow, goalCol, goalRow) {
  const { cols, rows } = grid;
  const n = cols * rows;
  if (startCol < 0 || startRow < 0 || startCol >= cols || startRow >= rows) return null;
  goalCol = Math.min(cols - 1, Math.max(0, goalCol));
  goalRow = Math.min(rows - 1, Math.max(0, goalRow));
  const start = startRow * cols + startCol;
  const goal = goalRow * cols + goalCol;
  const swim = grid.swim?.[goal] ? null : grid.swim;
  const terrain = (i) => (swim?.[i] ? DEEP_WATER_COST : grid.cost[i]);
  const passable = (i) => i === start || (terrain(i) !== BLOCKED && terrain(i) !== HAZARD);
  // The start cell counts as open ground, whatever it holds (it may be lava or a wall edge).
  const costOf = (i) => (i === start ? 1 : terrain(i));
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
      // No cutting a corner it can't stand in: a wall, a hazard, or deep water
      // beside a step that neither starts nor ends in the water.
      const dry = !(swim?.[i] || swim?.[j]);
      const cornerOk = (k) => passable(k) && !(dry && swim?.[k]);
      if (dc && dr && (!cornerOk(r * cols + nc) || !cornerOk(nr * cols + c))) continue;
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
