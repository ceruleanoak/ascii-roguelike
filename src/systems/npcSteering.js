import { GRID } from '../game/GameConfig.js';
import { buildTerrainGrid, routeCost, lineWithin, planRoute, DEEP_WATER_COST, DRY_GROUND } from './steeringTerrain.js';

// Shared NPC steering: straight-line movement where the ground is open, a
// terrain-weighted route (steeringTerrain.js) where it isn't, and stuck
// detection with a detour — the primitive every companion/flee path should
// move with instead of hand-rolling bare `velocity = dir * speed`.
//
// Root-cause family this closes (see known-bugs): every prior NPC movement
// was unpathed straight-line steering with zero stuck recovery, so any wall
// between entity and target wedged it permanently (#208 companion flee,
// #157/#60 rat/enemy strands). Escape paths that already terminate by other
// means (GameAnimalMechanic's exit-despawn, ThiefMechanic's scatter jitter)
// deliberately keep their own steering; new NPC movement should default to
// this module.
//
// Per-entity state lives in a WeakMap, not on the entity: no lazy fields,
// nothing to reset between rooms, garbage-collected with the entity.

const CELL = GRID.CELL_SIZE;
const FRAME = 1 / 60;              // called once per frame at the fixed timestep
const STUCK_WINDOW = 0.6;          // seconds of history before judging progress
const DETOUR_DURATION = 0.5;       // seconds to commit to a detour heading
const GRID_REFRESH = 0.25;         // seconds between terrain re-reads (mud wets, lava floods, trees fall)
const ROUTE_REFRESH = 0.5;         // seconds between re-plans toward a moving target
const WAYPOINT_ARRIVE_DIST = CELL * 0.5;
const LOOKAHEAD = 6;               // route waypoints considered for a straight shortcut

const steerStates = new WeakMap();

// Is a heading clear of walls, hazards and deep water for `dist`? Slow
// ground is fine — a detour is an escape from a wedge, not a route, and never
// a swim.
function headingClear(grid, x, y, w, h, dirX, dirY, dist) {
  return lineWithin(grid, x, y, x + dirX * dist, y + dirY * dist, DRY_GROUND, w, h);
}

// The detour heading is held blind for DETOUR_DURATION, so it is checked for
// as far as the body travels in that time (at least 2.5 cells): a shorter
// check let a fast body run off its end into lava or deep water.
function chooseDetourHeading(grid, x, y, w, h, baseAngle, speed) {
  const OFFSETS = [0.5, -0.5, 1.0, -1.0, 1.5, -1.5, 2.1, -2.1];
  const reach = Math.max(CELL * 2.5, speed * DETOUR_DURATION + Math.max(w, h) / 2);
  for (const offset of OFFSETS) {
    const angle = baseAngle + offset;
    const dirX = Math.cos(angle), dirY = Math.sin(angle);
    if (headingClear(grid, x, y, w, h, dirX, dirY, reach)) return { x: dirX, y: dirY };
  }
  return null;
}

function unit(dx, dy) {
  const len = Math.hypot(dx, dy);
  return len > 0.001 ? { x: dx / len, y: dy / len } : { x: 0, y: 0 };
}

// A heading that lands on a point closer than one frame's travel instead of
// stepping past it: a full-length heading toward a point 0.2px away
// overshoots by most of a pixel every frame, which beside a one-cell lava gap
// is a burn.
function landing(dx, dy, speed) {
  const len = Math.hypot(dx, dy);
  const step = speed * FRAME;
  if (step <= 0 || len >= step) return unit(dx, dy);
  return { x: dx / step, y: dy / step };
}

// The furthest of the next LOOKAHEAD waypoints the body's box reaches in a
// straight line over ground no worse than the route itself crosses to get
// there, so a route through open ground is walked as a line rather than cell
// to cell. When even the next waypoint isn't clear for the whole box (the body
// is off-center beside a lava bank or a wall corner), it re-centers in its own
// cell first, which the planner's corner rule guarantees is clear. Deep water
// is crossed only where the route itself swims: on the step into or out of
// it, not by a box clipping a shore it walks beside.
function shortcutWaypoint(grid, route, x, y, w, h) {
  const at = (px, py) => routeCost(grid, Math.floor(px / CELL), Math.floor(py / CELL));
  const swimming = at(x, y) >= DEEP_WATER_COST || at(route[0].x, route[0].y) >= DEEP_WATER_COST;
  if (!lineWithin(grid, x, y, route[0].x, route[0].y, swimming ? Infinity : DRY_GROUND, w, h)) {
    return { x: Math.floor(x / CELL) * CELL + CELL / 2, y: Math.floor(y / CELL) * CELL + CELL / 2, recenter: true };
  }
  let best = route[0];
  let worst = 1; // heaviest cell the route crosses before reaching waypoint k
  const n = Math.min(route.length, LOOKAHEAD);
  for (let k = 1; k < n; k++) {
    const before = route[k - 1];
    worst = Math.max(worst, at(before.x, before.y));
    if (!lineWithin(grid, x, y, route[k].x, route[k].y, worst, w, h)) break;
    best = route[k];
  }
  return best;
}

/**
 * Steering heading for `entity` toward (targetX, targetY) — the same point
 * space as `entity.position` (top-left) — without touching its velocity.
 * Walks straight while the line to the target crosses only open ground, and
 * otherwise follows the cheapest route over the terrain grid
 * (steeringTerrain.js): around walls, solid objects, trees and grass, never
 * into lava, and through deep water only when nothing dry reaches. Stuck detection still commits to a short detour when
 * something the grid can't see (a body, a closing door) holds it in place.
 *
 * For bodies whose velocity is computed elsewhere from a heading (the player,
 * driven by FIGHT through held keys). Everything else wants steerToward.
 * @returns {{ heading: {x:number, y:number}, mode: 'direct'|'route'|'detour'|'shore', next?: {x:number, y:number} }}
 *   heading (0, 0) with mode 'shore' when the target is only reachable
 *   through a hazard and the body already stands at the nearest safe cell.
 *   `next` (route mode, while re-centering in its own cell): the center of
 *   the cell the route goes on to.
 */
export function steerHeading(game, entity, targetX, targetY, speed) {
  const result = chooseHeading(game, entity, targetX, targetY, speed);
  steerStates.get(entity).lastMode = result.mode;
  return result;
}

function chooseHeading(game, entity, targetX, targetY, speed) {
  const w = entity.width ?? CELL, h = entity.height ?? CELL;
  const x = entity.position.x + w / 2, y = entity.position.y + h / 2;
  const tx = targetX + w / 2, ty = targetY + h / 2;
  const dist = Math.hypot(tx - x, ty - y);

  const map = entity.collisionMap
    || game?.activeRoom?.collisionMap
    || game?.currentRoom?.collisionMap
    || null;

  let state = steerStates.get(entity);
  if (!state) {
    state = {
      grid: null, gridMap: null, gridTimer: 0,
      route: null, routeGoal: -1, routeTimer: 0,
      windowTime: 0, lastX: x, lastY: y, detourTimer: 0, detour: null, lastMode: null,
    };
    steerStates.set(entity, state);
  }

  state.gridTimer -= FRAME;
  if (!state.grid || state.gridMap !== map || state.gridTimer <= 0) {
    state.grid = buildTerrainGrid(game, entity, map);
    state.gridMap = map;
    state.gridTimer = GRID_REFRESH;
  }
  const grid = state.grid;

  // Stuck bookkeeping: how far did we actually travel while commanding motion?
  // Waiting at a shore commands none.
  if (state.lastMode === 'shore') {
    state.windowTime = 0;
    state.lastX = x;
    state.lastY = y;
  } else if (state.detourTimer <= 0) {
    state.windowTime += FRAME;
    if (state.windowTime >= STUCK_WINDOW) {
      const moved = Math.hypot(x - state.lastX, y - state.lastY);
      if (dist > CELL && moved < speed * state.windowTime * 0.25) {
        const detour = chooseDetourHeading(grid, x, y, w, h, Math.atan2(ty - y, tx - x), speed);
        if (detour) {
          state.detour = detour;
          state.detourTimer = DETOUR_DURATION;
        }
        state.route = null; // whatever happens next, plan again from here
      }
      state.windowTime = 0;
      state.lastX = x;
      state.lastY = y;
    }
  }

  // Committed detour window.
  if (state.detourTimer > 0 && dist > CELL) {
    state.detourTimer -= FRAME;
    return { heading: state.detour, mode: 'detour' };
  }
  state.detourTimer = 0;

  // Open ground all the way: walk straight at it.
  if (lineWithin(grid, x, y, tx, ty, 1, w, h)) {
    state.route = null;
    return { heading: unit(tx - x, ty - y), mode: 'direct' };
  }

  const col = Math.floor(x / CELL), row = Math.floor(y / CELL);
  const goalCol = Math.floor(tx / CELL), goalRow = Math.floor(ty / CELL);
  const goal = goalRow * grid.cols + goalCol;
  state.routeTimer -= FRAME;
  if (!state.route || state.routeGoal !== goal || state.routeTimer <= 0) {
    state.route = planRoute(grid, col, row, goalCol, goalRow);
    state.routeGoal = goal;
    state.routeTimer = ROUTE_REFRESH;
  }
  const route = state.route;
  if (!route) return { heading: unit(tx - x, ty - y), mode: 'direct' };

  while (route.length && Math.hypot(route[0].x - x, route[0].y - y) < WAYPOINT_ARRIVE_DIST) route.shift();
  if (!route.length) {
    // In the goal cell: close the last stretch. Short of it: this is the
    // shore of a hazard the target stands in — wait here.
    if (col === goalCol && row === goalRow) return { heading: unit(tx - x, ty - y), mode: 'direct' };
    return { heading: { x: 0, y: 0 }, mode: 'shore' };
  }
  const wp = shortcutWaypoint(grid, route, x, y, w, h);
  if (!wp.recenter) return { heading: unit(wp.x - x, wp.y - y), mode: 'route' };
  // Re-centering first: `next` is the cell center the route goes on to, for a
  // key-driven body that can't land a sub-pixel recenter (FIGHT).
  return { heading: landing(wp.x - x, wp.y - y, speed), mode: 'route', next: { x: route[0].x, y: route[0].y } };
}

/**
 * Steer `entity` toward (targetX, targetY) at `speed` px/s by setting its
 * velocity (position integration stays with PhysicsSystem). The heading is
 * steerHeading's.
 *
 * Callers keep ownership of arrival checks and facing; this only decides the
 * per-frame velocity heading. Safe on entities without a collisionMap (the
 * map is read from entity.collisionMap, falling back to the active room's).
 */
export function steerToward(game, entity, targetX, targetY, speed) {
  const result = steerHeading(game, entity, targetX, targetY, speed);
  entity.velocity.vx = result.heading.x * speed;
  entity.velocity.vy = result.heading.y * speed;
  return result;
}
