import { GRID } from '../game/GameConfig.js';

/**
 * Companion wall clearance — a placed Companion steps out of walls.
 *
 * Companions are placed in a ring around the player on room entry and on
 * dungeon floor entry/exit (CompanionSystem). The ring has no wall check, so
 * a slot can land inside a wall cell or a solid Background Object such as a
 * Barricade's plug. PhysicsSystem then blocks every move the Companion
 * makes, and it stays caught there for the whole room.
 *
 * After placement, a Companion that overlaps something solid moves to the
 * nearest open cell, tested with the same PhysicsSystem.checkCollision its
 * own movement uses (its own collisionMap and Background Objects). If no
 * open cell lies within SEARCH_RADIUS, it takes the player's position,
 * which is always open.
 */

const SEARCH_RADIUS = 6; // cells

const C = GRID.CELL_SIZE;

function blockedAt(game, entity, x, y) {
  const hit = game.physicsSystem.checkCollision(entity, x, y, entity.backgroundObjects || [], game.currentRoom);
  return hit.x || hit.y;
}

/** Move `entity` (placed, collision refs already set) out of anything solid. */
export function stepOutOfWalls(game, entity) {
  const pos = entity?.position;
  if (!pos || !game?.physicsSystem) return;
  // checkCollision tests each axis against the current position on the other
  // axis, so the probe moves the entity to the candidate first.
  const fits = (x, y) => {
    const ox = pos.x, oy = pos.y;
    pos.x = x; pos.y = y;
    const blocked = blockedAt(game, entity, x, y);
    pos.x = ox; pos.y = oy;
    return !blocked;
  };
  if (fits(pos.x, pos.y)) return;

  const w = entity.width || C;
  const h = entity.height || C;
  const col = Math.floor((pos.x + w / 2) / C);
  const row = Math.floor((pos.y + h / 2) / C);
  let best = null;
  let bestDist = Infinity;
  for (let dr = -SEARCH_RADIUS; dr <= SEARCH_RADIUS; dr++) {
    for (let dc = -SEARCH_RADIUS; dc <= SEARCH_RADIUS; dc++) {
      const d = dr * dr + dc * dc;
      if (d >= bestDist) continue;
      const x = (col + dc) * C + (C - w) / 2;
      const y = (row + dr) * C + (C - h) / 2;
      if (fits(x, y)) { bestDist = d; best = { x, y }; }
    }
  }
  const player = game.player;
  const target = best || (player && { x: player.position.x, y: player.position.y });
  if (!target) return;
  pos.x = target.x;
  pos.y = target.y;
}
