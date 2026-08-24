import { GRID } from '../game/GameConfig.js';

// Shared NPC steering: straight-line movement with obstacle awareness, stuck
// detection, and a BFS fallback — the primitive every companion/flee path
// should move with instead of hand-rolling bare `velocity = dir * speed`.
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
const STUCK_WINDOW = 0.6;          // seconds of history before judging progress
const DETOUR_DURATION = 0.5;       // seconds to commit to a detour heading
const BFS_AFTER_FAILED_DETOURS = 2;
const WAYPOINT_ARRIVE_DIST = CELL * 0.6;

const steerStates = new WeakMap();

function cellBlocked(collisionMap, col, row) {
  if (!collisionMap) return false;
  const r = collisionMap[row];
  if (!r || col < 0 || col >= r.length) return true; // out of bounds = solid
  return !!r[col];
}

function worldToCol(x) { return Math.floor(x / CELL); }
function worldToRow(y) { return Math.floor(y / CELL); }

// Raycast in CELL/2 steps: is the direct heading clear for ~2.5 cells?
function headingClear(collisionMap, x, y, dirX, dirY, dist) {
  if (!collisionMap) return true;
  const step = CELL / 2;
  for (let d = step; d <= dist; d += step) {
    if (cellBlocked(collisionMap, worldToCol(x + dirX * d), worldToRow(y + dirY * d))) return false;
  }
  return true;
}

function chooseDetourHeading(collisionMap, x, y, baseAngle) {
  const OFFSETS = [0.5, -0.5, 1.0, -1.0, 1.5, -1.5, 2.1, -2.1];
  for (const offset of OFFSETS) {
    const angle = baseAngle + offset;
    const dirX = Math.cos(angle), dirY = Math.sin(angle);
    if (headingClear(collisionMap, x, y, dirX, dirY, CELL * 2.5)) return { x: dirX, y: dirY };
  }
  return null;
}

// BFS over walkable cells; returns array of {x, y} waypoints (world coords,
// cell centers) excluding the start cell, or null when unreachable.
function bfsPath(collisionMap, startCol, startRow, endCol, endRow) {
  if (!collisionMap) return null;
  const rows = collisionMap.length;
  const cols = collisionMap[0]?.length ?? 0;
  const key = (c, r) => r * cols + c;
  const prev = new Map();
  const queue = [[startCol, startRow]];
  prev.set(key(startCol, startRow), null);
  while (queue.length) {
    const [c, r] = queue.shift();
    if (c === endCol && r === endRow) {
      const path = [];
      let cur = key(c, r);
      while (prev.get(cur) !== null) {
        path.push({ x: (cur % cols) * CELL + CELL / 2, y: Math.floor(cur / cols) * CELL + CELL / 2 });
        cur = prev.get(cur);
      }
      return path.reverse();
    }
    for (const [dc, dr] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const nc = c + dc, nr = r + dr;
      if (nc < 0 || nr < 0 || nr >= rows || nc >= cols) continue;
      if (cellBlocked(collisionMap, nc, nr)) continue;
      const k = key(nc, nr);
      if (prev.has(k)) continue;
      prev.set(k, key(c, r));
      queue.push([nc, nr]);
    }
  }
  return null;
}

/**
 * Steer `entity` toward (targetX, targetY) at `speed` px/s by setting its
 * velocity (position integration stays with PhysicsSystem). Falls back to a
 * detour heading, then a BFS path, when progress stalls against geometry.
 *
 * Callers keep ownership of arrival checks and facing; this only decides the
 * per-frame velocity heading. Safe on entities without a collisionMap (the
 * map is read from entity.collisionMap, falling back to the active room's).
 */
export function steerToward(game, entity, targetX, targetY, speed) {
  const dx = targetX - entity.position.x;
  const dy = targetY - entity.position.y;
  const dist = Math.hypot(dx, dy);

  let state = steerStates.get(entity);
  if (!state) {
    state = { windowTime: 0, lastX: entity.position.x, lastY: entity.position.y, detourTimer: 0, detour: null, failedDetours: 0, path: null };
    steerStates.set(entity, state);
  }

  const map = entity.collisionMap
    || game?.activeRoom?.collisionMap
    || game?.currentRoom?.collisionMap
    || null;

  // Stuck bookkeeping: how far did we actually travel while commanding motion?
  if (state.detourTimer <= 0 && !state.path) {
    state.windowTime += 1 / 60; // called once per frame at the fixed timestep
    const moved = Math.hypot(entity.position.x - state.lastX, entity.position.y - state.lastY);
    if (state.windowTime >= STUCK_WINDOW) {
      const expected = speed * state.windowTime;
      if (dist > CELL && moved < expected * 0.25) {
        const baseAngle = Math.atan2(dy, dx);
        const detour = chooseDetourHeading(map, entity.position.x, entity.position.y, baseAngle);
        if (detour) {
          state.detour = detour;
          state.detourTimer = DETOUR_DURATION;
        } else {
          // Boxed in on every probe — try the graph.
          state.failedDetours++;
          state.path = state.failedDetours > BFS_AFTER_FAILED_DETOURS
            ? bfsPath(map, worldToCol(entity.position.x), worldToRow(entity.position.y),
                      worldToCol(targetX), worldToRow(targetY))
            : null;
        }
      }
      state.windowTime = 0;
      state.lastX = entity.position.x;
      state.lastY = entity.position.y;
    }
  }

  // BFS waypoint following outranks everything until consumed or invalidated.
  if (state.path && state.path.length) {
    const wp = state.path[0];
    const wdx = wp.x - entity.position.x;
    const wdy = wp.y - entity.position.y;
    const wdist = Math.hypot(wdx, wdy);
    if (wdist < WAYPOINT_ARRIVE_DIST) {
      state.path.shift();
      if (!state.path.length) state.failedDetours = 0;
    } else {
      entity.velocity.vx = (wdx / wdist) * speed;
      entity.velocity.vy = (wdy / wdist) * speed;
      return { heading: { x: wdx / wdist, y: wdy / wdist }, mode: 'bfs' };
    }
  } else if (state.path && !state.path.length) {
    state.path = null;
  }

  // Committed detour window.
  if (state.detourTimer > 0 && dist > CELL) {
    state.detourTimer -= 1 / 60;
    entity.velocity.vx = state.detour.x * speed;
    entity.velocity.vy = state.detour.y * speed;
    if (state.detourTimer <= 0) {
      state.detour = null;
      state.failedDetours++; // a detour that expired without unsticking counts as failed
    }
    return { heading: state.detour, mode: 'detour' };
  }

  // Default: direct heading.
  const len = Math.max(dist, 0.001);
  entity.velocity.vx = (dx / len) * speed;
  entity.velocity.vy = (dy / len) * speed;
  return { heading: { x: dx / len, y: dy / len }, mode: 'direct' };
}
