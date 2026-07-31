import { GRID } from '../game/GameConfig.js';
import { inSamePlane, planeOf, objectOnPlane } from '../systems/PlaneSystem.js';

// Every question an Enemy asks about what it can see, in one place.
//
// Three ray-casts against the collision map: whether a straight line is clear,
// where it is first blocked, and whether a target is visible given the enemy's
// facing cone. All three are geometry — they read the enemy's position, facing
// and collisionMap and return an answer. None of them changes state, moves
// anything, or spawns.
//
// Moved out of Enemy.js unchanged, for the same reason enemyMovement.js was: a
// ray-cast against a grid is not enemy behavior, and keeping it in the entity
// made the entity the place everything adjacent to it accumulated. Enemy keeps
// three one-line methods so the ~30 `this.hasVision(...)` call sites are
// untouched.
/**
 * Check if there's a clear line of sight along a vector
 * Uses ray casting to detect collisions
 */
export function hasLineOfSight(enemy, start, end, maxLength) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  if (distance === 0) return true;
  const checkDist = Math.min(distance, maxLength);

  const nx = dx / distance;
  const ny = dy / distance;
  const C = GRID.CELL_SIZE;

  // DDA grid traversal — steps to every grid-line crossing so no cell is skipped,
  // including the diagonal-corner case where uniform sampling misses wall corners.
  let gx = Math.floor(start.x / C);
  let gy = Math.floor(start.y / C);

  const stepX = nx >= 0 ? 1 : -1;
  const stepY = ny >= 0 ? 1 : -1;

  // Distance along the ray to the first vertical / horizontal boundary
  const firstBoundX = nx >= 0 ? (gx + 1) * C : gx * C;
  const firstBoundY = ny >= 0 ? (gy + 1) * C : gy * C;
  let tMaxX = nx !== 0 ? Math.abs((firstBoundX - start.x) / nx) : Infinity;
  let tMaxY = ny !== 0 ? Math.abs((firstBoundY - start.y) / ny) : Infinity;
  const tDeltaX = nx !== 0 ? Math.abs(C / nx) : Infinity;
  const tDeltaY = ny !== 0 ? Math.abs(C / ny) : Infinity;

  // Use actual collision map dimensions so this works for both the 30×30 room grid
  // and smaller interior grids (e.g. 10×10 hut, 24×24 dungeon).
  const mapRows = enemy.collisionMap.length;
  const mapCols = enemy.collisionMap[0]?.length ?? GRID.COLS;

  // Check each cell the ray enters until checkDist is reached
  for (let safety = 0; safety < 128; safety++) {
    if (gx < 0 || gx >= mapCols || gy < 0 || gy >= mapRows) return false;
    if (enemy.collisionMap[gy][gx]) return false;

    const tNext = Math.min(tMaxX, tMaxY);
    if (tNext >= checkDist) break; // Reached the end without hitting anything

    const EPS = 1e-6;
    if (Math.abs(tMaxX - tMaxY) < EPS) {
      // Exact corner: ray hits two cell boundaries simultaneously.
      // Check all three newly entered cells to avoid the diagonal-corner miss.
      const cx = gx + stepX, cy = gy + stepY;
      if (cx < 0 || cx >= mapCols || cy < 0 || cy >= mapRows) return false;
      // Cross cell
      if (cy < 0 || cy >= mapRows || cx >= 0 && cx < mapCols && enemy.collisionMap[gy][cx]) return false;
      if (cx < 0 || cx >= mapCols || cy >= 0 && cy < mapRows && enemy.collisionMap[cy][gx]) return false;
      tMaxX += tDeltaX;
      tMaxY += tDeltaY;
      gx = cx;
      gy = cy;
    } else if (tMaxX < tMaxY) {
      tMaxX += tDeltaX;
      gx += stepX;
    } else {
      tMaxY += tDeltaY;
      gy += stepY;
    }
  }

  return true;
}

/**
 * Find where line of sight is blocked (for visualization)
 * Returns the point where vision is obstructed, or the end point if clear
 */
export function getVisionObstructionPoint(enemy, start, end, maxLength) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  if (distance === 0) return { x: end.x, y: end.y, blocked: false };
  const checkDist = Math.min(distance, maxLength);

  // Too far to see — return point at vision limit
  if (distance > maxLength) {
    const angle = Math.atan2(dy, dx);
    return {
      x: start.x + Math.cos(angle) * maxLength,
      y: start.y + Math.sin(angle) * maxLength,
      blocked: true
    };
  }

  // DDA traversal (same as hasLineOfSight) for accurate obstruction point.
  const nx = dx / distance;
  const ny = dy / distance;
  const C = GRID.CELL_SIZE;

  let gx = Math.floor(start.x / C);
  let gy = Math.floor(start.y / C);
  const stepX = nx >= 0 ? 1 : -1;
  const stepY = ny >= 0 ? 1 : -1;

  const firstBoundX = nx >= 0 ? (gx + 1) * C : gx * C;
  const firstBoundY = ny >= 0 ? (gy + 1) * C : gy * C;
  let tMaxX = nx !== 0 ? Math.abs((firstBoundX - start.x) / nx) : Infinity;
  let tMaxY = ny !== 0 ? Math.abs((firstBoundY - start.y) / ny) : Infinity;
  const tDeltaX = nx !== 0 ? Math.abs(C / nx) : Infinity;
  const tDeltaY = ny !== 0 ? Math.abs(C / ny) : Infinity;

  const mapRows = enemy.collisionMap ? enemy.collisionMap.length : GRID.ROWS;
  const mapCols = enemy.collisionMap?.[0]?.length ?? GRID.COLS;
  const isBlocked = (cgx, cgy) => {
    // Use actual collision-map dimensions so interior maps (24×24, 10×10) bound correctly.
    if (cgx < 0 || cgx >= mapCols || cgy < 0 || cgy >= mapRows) return true;
    if (enemy.collisionMap && enemy.collisionMap[cgy][cgx]) return true;
    if (enemy.backgroundObjects) {
      const myPlane = planeOf(enemy);
      for (const obj of enemy.backgroundObjects) {
        if (obj.destroyed) continue;
        if (!objectOnPlane(obj, myPlane)) continue;
        if (Math.floor(obj.position.x / C) === cgx && Math.floor(obj.position.y / C) === cgy) {
          if (obj.bulletInteraction === 'block' ||
              obj.bulletInteraction === 'interact-preserve' ||
              obj.bulletInteraction === 'interact-destroy') return true;
        }
      }
    }
    return false;
  };

  for (let safety = 0; safety < 128; safety++) {
    if (isBlocked(gx, gy)) {
      return { x: start.x + nx * Math.min(tMaxX, tMaxY), y: start.y + ny * Math.min(tMaxX, tMaxY), blocked: true };
    }

    const tNext = Math.min(tMaxX, tMaxY);
    if (tNext >= checkDist) break;

    const EPS = 1e-6;
    if (Math.abs(tMaxX - tMaxY) < EPS) {
      const cx = gx + stepX, cy = gy + stepY;
      if (isBlocked(cx, gy)) return { x: start.x + nx * tMaxX, y: start.y + ny * tMaxX, blocked: true };
      if (isBlocked(gx, cy)) return { x: start.x + nx * tMaxY, y: start.y + ny * tMaxY, blocked: true };
      tMaxX += tDeltaX; tMaxY += tDeltaY;
      gx = cx; gy = cy;
    } else if (tMaxX < tMaxY) {
      tMaxX += tDeltaX; gx += stepX;
    } else {
      tMaxY += tDeltaY; gy += stepY;
    }
  }

  return { x: end.x, y: end.y, blocked: false };
}

/**
 * Check if enemy can see the target (vision check)
 * More restrictive than hasLineOfSight - includes background objects
 * Used for aggro/memory system, NOT navigation
 * PLANE-AWARE: Returns false if target is in different plane
 */
export function hasVision(enemy, start, end, maxLength, { ignoreCone = false } = {}) {
  // Cyan rogue hide roll — target is undetectable
  if (enemy.target && enemy.target.hidden) {
    return false;
  }

  // Moss Cloak 𐤒 — non-aggro enemies cannot see the player at any range.
  // Already-aggro'd enemies (enraged or chasing memory) keep their vision.
  if (enemy.target && enemy.target.mossCloakActive && !enemy.enraged && !enemy.aggroMemoryActive) {
    return false;
  }

  // CRITICAL: Check if target is in same plane
  // If target has a position property, it's likely the player object
  if (enemy.target && !inSamePlane(enemy, enemy.target)) {
    return false;
  }

  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const checkDistance = Math.min(distance, maxLength);

  // Too far to see
  if (distance > maxLength) {
    return false;
  }

  // ── Vision cone gate ────────────────────────────────────────────────────
  // Non-alerted enemies can only see within ±65° of their facing direction.
  // Alerted enemies (enraged or memory-chasing) have already turned toward the
  // player via velocity, so their cone naturally tracks. ignoreCone bypasses
  // this for sound-based detection (omnidirectional hearing).
  if (!enemy.enraged && !enemy.aggroMemoryActive && !ignoreCone) {
    const HALF_CONE_COS = Math.cos(65 * Math.PI / 180); // ~0.423
    const PROXIMITY_OVERRIDE = GRID.CELL_SIZE * 1.5;    // Knife-edge: bypass cone
    if (distance > PROXIMITY_OVERRIDE) {
      const dot = (dx / distance) * Math.cos(enemy.facingAngle)
                + (dy / distance) * Math.sin(enemy.facingAngle);
      if (dot < HALF_CONE_COS) return false;
    }
  }

  // Sample points along the vector
  const samples = Math.ceil(checkDistance / (GRID.CELL_SIZE / 2));

  for (let i = 1; i <= samples; i++) {
    const t = i / samples;
    const checkX = start.x + dx * t;
    const checkY = start.y + dy * t;

    // Convert to grid coordinates
    const gridX = Math.floor(checkX / GRID.CELL_SIZE);
    const gridY = Math.floor(checkY / GRID.CELL_SIZE);

    // Check if out of bounds — use the actual collision map dimensions so dungeon/hut
    // interiors (24×24, 10×10) bound correctly instead of falling through to GRID.COLS/ROWS
    // and hitting undefined cells (which evaluate falsy and silently skip the wall check).
    const mapRows = enemy.collisionMap ? enemy.collisionMap.length : GRID.ROWS;
    const mapCols = enemy.collisionMap?.[0]?.length ?? GRID.COLS;
    if (gridX < 0 || gridX >= mapCols || gridY < 0 || gridY >= mapRows) {
      return false;
    }

    // Check collision map (solid walls)
    if (enemy.collisionMap && enemy.collisionMap[gridY][gridX]) {
      return false; // Wall blocks vision
    }

    // Check background objects (trees, boulders, tall grass, etc.)
    if (enemy.backgroundObjects) {
      const myPlane = planeOf(enemy);
      for (const obj of enemy.backgroundObjects) {
        if (obj.destroyed) continue;
        // Skip objects not present on this enemy's plane (e.g. surfaceOnly when underground).
        if (!objectOnPlane(obj, myPlane)) continue;

        // Check if this sample point intersects with a background object.
        // Vision-blockers (grass) use a half-cell × half-cell pixel hitbox
        // centered on the grass so dense swaths form a real visual barrier
        // rather than a sparse 1-cell-aligned check.
        const blocksV = obj.blocksVision && obj.blocksVision();
        if (blocksV) {
          const halfExtent = GRID.CELL_SIZE * 0.25;
          const cx = obj.position.x + GRID.CELL_SIZE / 2;
          const cy = obj.position.y + GRID.CELL_SIZE / 2;
          if (Math.abs(checkX - cx) <= halfExtent &&
              Math.abs(checkY - cy) <= halfExtent) {
            // Grass doesn't block vision at close range — enemy can sense nearby player.
            // 3-cell threshold: you can't hide from something standing right next to you.
            if (distance > GRID.CELL_SIZE * 3) return false;
          }
        }

        const objGridX = Math.floor(obj.position.x / GRID.CELL_SIZE);
        const objGridY = Math.floor(obj.position.y / GRID.CELL_SIZE);
        if (objGridX === gridX && objGridY === gridY) {
          if (obj.bulletInteraction === 'block' ||
              obj.bulletInteraction === 'interact-preserve') {
            return false; // Solid object blocks vision
          }
        }
      }
    }

    // Check steam clouds (block vision through steam)
    if (enemy.steamClouds) {
      for (const cloud of enemy.steamClouds) {
        const sdx = checkX - cloud.x, sdy = checkY - cloud.y;
        if (sdx * sdx + sdy * sdy <= cloud.radius * cloud.radius) {
          return false;
        }
      }
    }
  }

  return true; // Clear vision
}
