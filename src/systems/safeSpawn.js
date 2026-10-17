import { GRID } from '../game/GameConfig.js';

/**
 * Room centre, nudged off collision/liquid tiles. Mirrors RoomGenerator's
 * getRandomPosition() liquid rejection (water/lava/mud all render as '~';
 * '=' is static water) rather than a fresh check, since a caldera/molten-
 * ascent room can land lava directly on room centre and the traveler has
 * no water/lava immunity of its own. Shared by ErrandSystem (traveler
 * spawn) and NeutralRoomSystem (the player's return from a neutral room,
 * whose restored room can have a rock or wall standing on the centre).
 */
export function findSafeSpawnPosition(room) {
  const C = GRID.CELL_SIZE;
  const centerCol = Math.floor(GRID.COLS / 2);
  const centerRow = Math.floor(GRID.ROWS / 2);
  const collisionMap = room?.collisionMap;
  const backgroundObjects = room?.backgroundObjects || [];
  const LIQUID_CHARS = new Set(['~', '=']);

  const isBlocked = (col, row) => {
    if (collisionMap?.[row]?.[col]) return true;
    return backgroundObjects.some(obj =>
      LIQUID_CHARS.has(obj.char) &&
      Math.round(obj.position.x / C) === col &&
      Math.round(obj.position.y / C) === row
    );
  };

  if (!isBlocked(centerCol, centerRow)) {
    return { x: centerCol * C, y: centerRow * C };
  }

  // Spiral outward ring-by-ring for the nearest clear tile.
  const maxRadius = Math.max(GRID.COLS, GRID.ROWS);
  for (let radius = 1; radius <= maxRadius; radius++) {
    for (let dr = -radius; dr <= radius; dr++) {
      for (let dc = -radius; dc <= radius; dc++) {
        if (Math.max(Math.abs(dr), Math.abs(dc)) !== radius) continue; // ring only
        const col = centerCol + dc;
        const row = centerRow + dr;
        if (col < 1 || row < 1 || col >= GRID.COLS - 1 || row >= GRID.ROWS - 1) continue;
        if (!isBlocked(col, row)) return { x: col * C, y: row * C };
      }
    }
  }

  // Unreachable in practice (rooms always have open floor) — fall back to centre.
  return { x: centerCol * C, y: centerRow * C };
}
