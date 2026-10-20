import { GRID } from '../game/GameConfig.js';
import { BackgroundObject } from '../entities/BackgroundObject.js';
import { ZONES } from '../data/zones.js';
import { PLANE_SURFACE, planeOf, isInteriorActive } from './PlaneSystem.js';

/**
 * MetalPlatformSystem — the Metal Platform that ferries across an Island
 * room's lava lake.
 *
 * Where the Island's zone liquid is lava (red), the lake ring is solid lava
 * and the land mass in the middle is reachable only on the Metal Platform: a
 * 2×2-cell steel plate that shuttles along one straight channel between a
 * dock on the outer shore and a dock on the island, pausing at each end.
 * Anything standing on it rides with it and is standing on metal, not lava —
 * PhysicsSystem ignores the lava tiles under the plate (metalPlatformCovers)
 * and drops all lava contact for an entity whose center is over it
 * (isOnMetalPlatform), so a rider is never burned, and stepping off mid-lake
 * is stepping into lava.
 *
 * The plate lives on `room.metalPlatform` (seeded at generation by
 * seedMetalPlatform), so it is Room-scoped by construction — leaving the
 * room drops it with the room, and the system holds no state of its own.
 * The update runs before physics each EXPLORE frame, so a rider's lava
 * check reads the plate where it has just carried them.
 */

const CS = GRID.CELL_SIZE;
const SIZE_CELLS = 2;          // the plate is SIZE_CELLS × SIZE_CELLS
const SPEED = 2 * CS;          // px/s along the channel
const DOCK_PAUSE = 1.5;        // seconds held at each dock so a walker can board

// Channel direction → unit step along the channel, and the lane offset.
const DIRS = {
  N: { dc: 0, dr: -1 },
  S: { dc: 0, dr: 1 },
  E: { dc: 1, dr: 0 },
  W: { dc: -1, dr: 0 },
};

/** True when the entity's center is over the plate. */
export function isOnMetalPlatform(platform, entity) {
  if (!platform || planeOf(entity) !== PLANE_SURFACE) return false;
  const cx = entity.position.x + (entity.width || CS) / 2;
  const cy = entity.position.y + (entity.height || CS) / 2;
  return cx >= platform.x && cx < platform.x + platform.w &&
         cy >= platform.y && cy < platform.y + platform.h;
}

/**
 * True when a lava tile lies under the plate (its center inside the plate).
 * Covered lava isn't touched at all, so a walker boarding from the dock —
 * whose leading edge reaches the plate before their center does — never
 * burns on the lava beneath it.
 */
export function metalPlatformCovers(platform, obj) {
  const cx = obj.position.x + CS / 2;
  const cy = obj.position.y + CS / 2;
  return cx >= platform.x && cx < platform.x + platform.w &&
         cy >= platform.y && cy < platform.y + platform.h;
}

/**
 * Carve the channel through an Island's lava lake and place the plate,
 * docked on the outer shore. The channel points at the player's entry so the
 * outer dock sits beside where they arrive.
 *
 *   k ≤ islandRadius            island side of the channel: dry land
 *   islandRadius < k < lakeRadius  the lava the plate crosses
 *   k ≥ lakeRadius              outer side of the channel: dry land
 *
 * Both lanes of the channel are cleared of props on their dock cells so a
 * walker can step straight on and off. `makeLava(col, row)` builds one lava tile.
 */
export function seedMetalPlatform(room, config, makeLava) {
  const { islandCenterCol: cc, islandCenterRow: cr, islandRadius, lakeRadius } = config;
  const dir = channelDirection(room.playerStartPos, cc, cr);
  const { dc, dr } = DIRS[dir];
  // Lane 0/1 sit on either side of the center line, perpendicular to travel.
  const cellAt = (k, lane) => ({
    col: cc + dc * k + (dc === 0 ? lane - 1 : 0),
    row: cr + dr * k + (dr === 0 ? lane - 1 : 0),
  });
  const inside = ({ col, row }) => col > 0 && col < GRID.COLS - 1 && row > 0 && row < GRID.ROWS - 1;

  const laneCells = [];   // every channel cell, tagged with its k
  for (let k = islandRadius - 1; k < GRID.COLS; k++) {
    for (let lane = 0; lane < 2; lane++) {
      const cell = cellAt(k, lane);
      if (inside(cell)) laneCells.push({ ...cell, k });
    }
  }
  const key = (col, row) => `${col},${row}`;
  const laneKeys = new Set(laneCells.map(c => key(c.col, c.row)));

  // Clear the channel: nothing (lava or prop) survives on it except
  // structural pieces, then refill the crossing with clean lava.
  room.backgroundObjects = room.backgroundObjects.filter(obj => {
    if (obj.structural) return true;
    const col = Math.floor((obj.position.x + CS / 2) / CS);
    const row = Math.floor((obj.position.y + CS / 2) / CS);
    return !laneKeys.has(key(col, row));
  });
  for (const c of laneCells) {
    if (c.k > islandRadius && c.k < lakeRadius && !room.collisionMap[c.row][c.col]) {
      room.backgroundObjects.push(makeLava(c.col, c.row));
    }
  }

  // Dock positions: the plate's top-left corner when it covers channel cells
  // kStart..kStart+1 — against the island, and against the outer shore.
  const plateRect = (kStart) => {
    const a = cellAt(kStart, 0);
    const b = cellAt(kStart + SIZE_CELLS - 1, 1);
    return { x: Math.min(a.col, b.col) * CS, y: Math.min(a.row, b.row) * CS };
  };
  const inner = plateRect(islandRadius + 1);
  const outer = plateRect(lakeRadius - SIZE_CELLS);

  room.metalPlatform = {
    x: outer.x, y: outer.y, w: SIZE_CELLS * CS, h: SIZE_CELLS * CS,
    outer, inner,
    target: 'inner',       // the dock it leaves for once the pause is up
    pause: DOCK_PAUSE,
  };
}

// The channel points from the island toward the player's entry side; a room
// with no recorded entry gets the south channel (the REST-side default).
function channelDirection(start, cc, cr) {
  if (!start) return 'S';
  const dx = start.x / CS - cc;
  const dy = start.y / CS - cr;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'E' : 'W';
  return dy < 0 ? 'N' : 'S';
}

export class MetalPlatformSystem {
  constructor(game) {
    this.game = game;
  }

  update(dt) {
    const game = this.game;
    const platform = game.currentRoom?.metalPlatform;
    // The surface room freezes while an Interior owns the frame; so does the plate.
    if (!platform || isInteriorActive(game)) return;

    if (platform.pause > 0) {
      platform.pause -= dt;
      return;
    }

    const dest = platform[platform.target];
    const dx = dest.x - platform.x;
    const dy = dest.y - platform.y;
    const dist = Math.hypot(dx, dy);
    const step = Math.min(SPEED * dt, dist);
    const mx = dist > 0 ? (dx / dist) * step : 0;
    const my = dist > 0 ? (dy / dist) * step : 0;

    // Riders are read before the plate moves, then carried by its step.
    for (const rider of this._riders(platform)) {
      rider.position.x += mx;
      rider.position.y += my;
    }
    platform.x += mx;
    platform.y += my;

    if (step >= dist) {
      platform.x = dest.x;
      platform.y = dest.y;
      platform.target = platform.target === 'inner' ? 'outer' : 'inner';
      platform.pause = DOCK_PAUSE;
    }
  }

  // The player and every live enemy over the plate (update() has already
  // bailed while an Interior is active, so the active enemies are the surface's).
  _riders(platform) {
    const game = this.game;
    const riders = [];
    const p = game.player;
    if (p && isOnMetalPlatform(platform, p)) riders.push(p);
    for (const e of game._activeEnemies()) {
      if (e.hp > 0 && isOnMetalPlatform(platform, e)) riders.push(e);
    }
    return riders;
  }
}

/**
 * The Island's lake is its zone's liquid. Returns the zone's environmental
 * features when that liquid is lava (an Island room in red), else null. A
 * lava Island's lake is the only lava in the room: RoomGenerator skips the
 * zone's usual lava pools and formations for it.
 */
export function islandLavaFeatures(room, letterTemplate) {
  if (!letterTemplate?.islandZone?.enabled) return null;
  const features = ZONES[room.zone]?.environmentalFeatures;
  return features?.liquidType === 'lava' ? features : null;
}

/** One lava tile in the zone's own lava color (see RoomGenerator.generateIslandTerrain). */
export function makeZoneLava(features) {
  return (col, row) => BackgroundObject.createVariant('lava', col * CS, row * CS, { color: features.liquidColor });
}
