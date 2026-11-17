import { GRID } from '../game/GameConfig.js';
import { activeInteriorFloor } from './PlaneSystem.js';

/**
 * Loot wall clearance — ground loot slides out of walls.
 *
 * Items and ingredients fly when they drop but have no wall collision
 * (hasCollision false, no collisionMap of their own), and PhysicsSystem's
 * enforceGridBounds only clamps them to the surface GRID. A drop thrown at a
 * wall settles inside it; in an Interior, whose grid is smaller than the
 * surface's, it can settle past the Interior's last column or row entirely.
 * Parked in a corner like that, it sits out of SPACE reach.
 *
 * Every frame, any item or ingredient overlapping a wall cell of its own
 * layer (or lying outside that layer's grid) slides toward the nearest open
 * cell. The layer is read from the loot's own interior tags, not from where
 * the player stands: surface loot stays in game.items while an Interior owns
 * the frame, and must keep reading the surface Room's map.
 */

const SLIDE_SPEED = 120; // px/s — reads as a slide, not a snap
const EPSILON = 1;       // px of overlap ignored, so loot resting on a wall edge stays put
const SEARCH_RADIUS = 8; // cells searched for an open cell

const C = GRID.CELL_SIZE;

/** The grid and collision map of the layer a loot entity lies on, or null. */
function layerOf(game, entity) {
  if (entity.mazePlane) {
    const mi = game.mazeInterior;
    return mi?.collisionMap ? { cols: mi.gridCols, rows: mi.gridRows, map: mi.collisionMap } : null;
  }
  if (entity.hutPlane) {
    const floor = activeInteriorFloor(game);
    return floor?.collisionMap ? { cols: floor.gridCols, rows: floor.gridRows, map: floor.collisionMap } : null;
  }
  const room = game.currentRoom;
  return room?.collisionMap ? { cols: GRID.COLS, rows: GRID.ROWS, map: room.collisionMap } : null;
}

function isWall(layer, col, row) {
  if (col < 0 || row < 0 || col >= layer.cols || row >= layer.rows) return true;
  return !!layer.map[row]?.[col];
}

/** True when the box overlaps a wall cell by more than EPSILON on both axes. */
function overlapsWall(layer, x, y, w, h) {
  const c0 = Math.floor((x + EPSILON) / C);
  const r0 = Math.floor((y + EPSILON) / C);
  const c1 = Math.floor((x + w - EPSILON) / C);
  const r1 = Math.floor((y + h - EPSILON) / C);
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      if (isWall(layer, c, r)) return true;
    }
  }
  return false;
}

/** The open cell whose center is nearest (cx, cy), or null within SEARCH_RADIUS. */
function nearestOpenCell(layer, cx, cy) {
  const col = Math.floor(cx / C);
  const row = Math.floor(cy / C);
  let best = null;
  let bestDist = Infinity;
  for (let dr = -SEARCH_RADIUS; dr <= SEARCH_RADIUS; dr++) {
    for (let dc = -SEARCH_RADIUS; dc <= SEARCH_RADIUS; dc++) {
      const c = col + dc;
      const r = row + dr;
      if (isWall(layer, c, r)) continue;
      const dx = (c + 0.5) * C - cx;
      const dy = (r + 0.5) * C - cy;
      const d = dx * dx + dy * dy;
      if (d < bestDist) { bestDist = d; best = { col: c, row: r }; }
    }
  }
  return best;
}

/** Move one loot entity a step out of the walls it overlaps, if any. */
function slideOff(game, entity, deltaTime) {
  const pos = entity.position;
  if (!pos) return;
  // An ingredient the magnet is pulling is already on its way to the player;
  // sliding it toward a cell on the wall's far side would fight the pull.
  const acc = entity.acceleration;
  if (acc && (acc.ax || acc.ay)) return;
  const layer = layerOf(game, entity);
  if (!layer) return;
  const w = entity.width || C;
  const h = entity.height || C;
  if (!overlapsWall(layer, pos.x, pos.y, w, h)) return;

  const target = nearestOpenCell(layer, pos.x + w / 2, pos.y + h / 2);
  if (!target) return;
  const tx = target.col * C + (C - w) / 2;
  const ty = target.row * C + (C - h) / 2;
  const dx = tx - pos.x;
  const dy = ty - pos.y;
  const dist = Math.hypot(dx, dy);
  // The slide owns the position until the loot is clear; leftover momentum
  // would push it straight back into the wall.
  if (entity.velocity) { entity.velocity.vx = 0; entity.velocity.vy = 0; }
  const step = SLIDE_SPEED * deltaTime;
  if (dist <= step) { pos.x = tx; pos.y = ty; return; }
  pos.x += (dx / dist) * step;
  pos.y += (dy / dist) * step;
}

/** Every state: slide each ground item and ingredient out of its layer's walls. */
export function slideLootOffWalls(game, deltaTime) {
  for (const item of game.items) slideOff(game, item, deltaTime);
  for (const ingredient of game.ingredients) slideOff(game, ingredient, deltaTime);
}
