import { GRID } from '../game/GameConfig.js';

// Projectile-vs-wall collision: hit detection against room.collisionMap, the
// interior-structure-wall ricochet regular bullets get, and the border-wall
// bounce used by ricochet-flagged weapons (e.g. Ricochet Rifle). Composition
// module for CombatSystem — all hooks are called from the projectile update
// loops; `combat` is the CombatSystem instance (audioSystem access).
export const WallRicochetMechanic = {
  // Returns true if `proj` occupies a solid cell in `room.collisionMap`, or is outside
  // the map's grid boundaries. Works for both normal rooms (30×30) and interior rooms
  // (hut 10×10, dungeon 24×24). Returns false when room has no collisionMap.
  hitsWall(proj, room) {
    if (!room?.collisionMap) return false;
    // proj.position is the cell top-left of the glyph; the visible bullet sits
    // at +CELL_SIZE/2. Check the wall under the bullet's visual center so
    // collisions are symmetric on all four sides (left/right/top/bottom).
    const cs = GRID.CELL_SIZE;
    const col = Math.floor((proj.position.x + cs / 2) / cs);
    const row = Math.floor((proj.position.y + cs / 2) / cs);
    const map = room.collisionMap;
    if (row < 0 || row >= map.length) return true;
    const rowArr = map[row];
    return !rowArr || col < 0 || col >= rowArr.length || rowArr[col] === true;
  },

  isOutOfBounds(proj) {
    return proj.position.x < 0 ||
           proj.position.y < 0 ||
           proj.position.x > GRID.WIDTH ||
           proj.position.y > GRID.HEIGHT;
  },

  // Ricochet bullets off interior structure walls. Border-wall cells and
  // out-of-grid positions return false so the caller falls through to destroy.
  tryStructureWallRicochet(proj, room, deltaTime, combat) {
    const map = room?.collisionMap;
    if (!map) return false;
    const cs = GRID.CELL_SIZE;
    const rows = map.length;
    const cols = map[0]?.length || 0;

    // Use the bullet's visual center so left/right and top/bottom collide
    // symmetrically. proj.position is the cell top-left.
    const centerX = proj.position.x + cs / 2;
    const centerY = proj.position.y + cs / 2;
    const col = Math.floor(centerX / cs);
    const row = Math.floor(centerY / cs);

    // Out-of-grid → treat as border
    if (row < 0 || row >= rows || col < 0 || col >= cols) return false;
    // Border-wall cell → no ricochet
    if (row === 0 || row === rows - 1 || col === 0 || col === cols - 1) return false;
    // Not actually a wall cell (defensive) → no ricochet
    if (!map[row][col]) return false;

    // Reconstruct the bullet's pre-move position (also center) to determine the surface normal.
    const prevX = centerX - proj.velocity.vx * deltaTime;
    const prevY = centerY - proj.velocity.vy * deltaTime;
    const prevCol = Math.floor(prevX / cs);
    const prevRow = Math.floor(prevY / cs);

    const enteredFromFreeCol = prevCol !== col && prevCol >= 0 && prevCol < cols && !map[row]?.[prevCol];
    const enteredFromFreeRow = prevRow !== row && prevRow >= 0 && prevRow < rows && !map[prevRow]?.[col];

    let flipX = enteredFromFreeCol;
    let flipY = enteredFromFreeRow;
    // Pure diagonal entry through a corner — flip both
    if (!flipX && !flipY) {
      flipX = true;
      flipY = true;
    }

    if (flipX) proj.velocity.vx = -proj.velocity.vx;
    if (flipY) proj.velocity.vy = -proj.velocity.vy;

    // Step back to the previously-free cell so the bullet doesn't re-collide
    // next frame. prevX/Y are in center-space; subtract the cell half to convert
    // back to the top-left convention proj.position uses.
    proj.position.x = prevX - cs / 2;
    proj.position.y = prevY - cs / 2;

    if (proj.drawAngle != null) {
      proj.drawAngle = Math.atan2(proj.velocity.vy, proj.velocity.vx);
    }
    combat.audioSystem?.playSFX?.('ricochet', 0.6);
    return true;
  },

  // Bounces the bullet off the inner face of the room's border wall, derived from
  // room.collisionMap so this scales correctly to interior rooms (hut/dungeon/maze)
  // instead of the main 30x30 room's fixed pixel size. Falls back to the full
  // canvas bounds when no room/collisionMap is available (e.g. transient states).
  checkRicochet(proj, room = null) {
    let bounced = false;
    const cs = GRID.CELL_SIZE;
    const map = room?.collisionMap;
    const cols = map?.[0]?.length ?? GRID.COLS;
    const rows = map?.length ?? GRID.ROWS;

    // proj.position is the cell top-left; the visible bullet sits at +cs/2, so
    // bounce off the border wall's inner face using the bullet's visual center
    // (matches hitsWall/tryStructureWallRicochet's convention).
    const leftFace   = cs;
    const rightFace  = (cols - 1) * cs;
    const topFace    = cs;
    const bottomFace = (rows - 1) * cs;
    const centerX = proj.position.x + cs / 2;
    const centerY = proj.position.y + cs / 2;

    if (centerX < leftFace) {
      proj.position.x = leftFace - cs / 2;
      proj.velocity.vx = Math.abs(proj.velocity.vx);
      bounced = true;
    } else if (centerX > rightFace) {
      proj.position.x = rightFace - cs / 2;
      proj.velocity.vx = -Math.abs(proj.velocity.vx);
      bounced = true;
    }

    if (centerY < topFace) {
      proj.position.y = topFace - cs / 2;
      proj.velocity.vy = Math.abs(proj.velocity.vy);
      bounced = true;
    } else if (centerY > bottomFace) {
      proj.position.y = bottomFace - cs / 2;
      proj.velocity.vy = -Math.abs(proj.velocity.vy);
      bounced = true;
    }

    if (bounced && proj.drawAngle != null) {
      proj.drawAngle = Math.atan2(proj.velocity.vy, proj.velocity.vx);
    }

    return bounced;
  }
};
