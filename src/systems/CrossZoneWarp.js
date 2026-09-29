import { GRID } from '../game/GameConfig.js';
import { ZONES } from '../data/zones.js';

const CS = GRID.CELL_SIZE;

/**
 * Seed pathHistory with 3 entries in `zone`'s exit color, so
 * checkZoneTransition() keeps the player in that zone on their next natural
 * exit (mirrors CheatWarpSystem.handleZoneTeleport). Shared by
 * performCrossZoneWarp and hand-offs that reach the target zone through
 * enterExploreState instead (the Aquifer's Oasis redirect).
 */
export function seedZonePath(game, zone) {
  const color = ZONES[zone].exitColor;
  game.zoneSystem.pathHistory = [
    { letter: 'X', color },
    { letter: 'X', color },
    { letter: 'X', color }
  ];
}

/**
 * Cross-zone warp — the shared hand-off for in-room shortcuts that drop the
 * player into a freshly generated Room in another Zone (Sinkhole cross,
 * Aquifer Current branch ends). Lifted out of SinkholeSystem so every
 * shortcut takes the same path through the mandatory `Game.applyRoomSwap`
 * (bug #93 warp-divergence precedent) instead of each re-deriving the
 * zone/depth/pathHistory setup.
 *
 * Deliberately bypasses `enterExploreState` / `resolveForcedRoomType`: the
 * caller names the exact room it wants, so a shortcut never gets silently
 * converted into a forced boss or miniboss room by depth.
 *
 * @param {Game} game
 * @param {object} opts
 * @param {string} opts.zone          — target zone key
 * @param {string} opts.roomType      — ROOM_TYPES value passed to generateRoom
 * @param {string} opts.exitLetter    — letter template to generate from
 * @param {Function} [opts.beforeGenerate] — one-shot generator flags go here
 * @param {Function} [opts.afterGenerate]  — (room) => void; clears those flags,
 *   post-generation room tweaks, and may return an arrival {x,y}
 * @param {{x:number,y:number}} [opts.arrival] — player position fallback
 * @param {number} [opts.plane]       — plane to land on (set AFTER the swap)
 * @returns {object} the new room
 */
export function performCrossZoneWarp(game, opts) {
  const { zone, roomType, exitLetter, beforeGenerate, afterGenerate, arrival, plane } = opts;

  seedZonePath(game, zone);
  game.zoneSystem.currentZone = zone;
  if (game.zoneDepths[zone] === 0) game.zoneDepths[zone] = 1;
  game.roomGenerator.setDepth(game.zoneDepths[zone]);

  beforeGenerate?.();
  const playerPos = { x: game.player.position.x, y: game.player.position.y };
  const newRoom = game.roomGenerator.generateRoom(roomType, playerPos, zone, null, exitLetter);
  newRoom.exitLetter = exitLetter;
  const spawn = afterGenerate?.(newRoom) || arrival ||
    newRoom.spawnZones?.default || { x: 15 * CS, y: 15 * CS };

  game.currentRoom = newRoom;
  game.player.position.x = spawn.x;
  game.player.position.y = spawn.y;
  game.player.setCollisionMap(newRoom.collisionMap);

  // Canonical, mandatory room-swap path — must run after the state above is
  // set, since it doesn't set currentRoom/player position itself. Its
  // resetEntities block DOES reset player.plane to the surface (via
  // interiorManager.reset(), registered room-scope), so a plane assignment
  // must come AFTER this call, not before it — setting it first was silently
  // clobbered here (bug #313: arrival landed on plane 0, stuck in the surface
  // collision map of a room with no plane-0 content).
  game.applyRoomSwap(newRoom);
  if (plane !== undefined) game.player.plane = plane;

  game.audioSystem.switchZoneMusic(zone, import.meta.env.BASE_URL);
  game.updateUI();
  return newRoom;
}
