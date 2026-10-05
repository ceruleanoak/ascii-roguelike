/**
 * PlaneSystem — single source of truth for layer/plane interaction permission.
 *
 * The game has three planes:
 *   PLANE_SURFACE   (0) — aboveground / default
 *   PLANE_TUNNEL    (1) — inside a tunnel or underground passage
 *   PLANE_SUBMERGED (2) — underwater (Shark Mask dive). Surface enemies cannot
 *                         see or attack a player on this plane; the player
 *                         re-renders as a fin glyph.
 *
 * Every interaction (attack, vision, collision, pickup, trap effect) must be
 * gated by plane membership. Rather than spreading `entity.plane === other.plane`
 * checks across every system, all such checks go through this module.
 *
 * Two facets of plane membership:
 *
 *   1. ENTITY-TO-ENTITY: two entities can interact only if they share a plane.
 *      Use `canInteract(a, b)` or `inSamePlane(a, b)` at every interaction site.
 *
 *   2. ENTITY-TO-OBJECT: a background object's plane affinity is encoded by flags.
 *      - `obj.data.tunnelWall = true`   → exists only on plane 1 (e.g. tunnel walls)
 *      - `obj.surfaceOnly       = true` → exists only on plane 0 (explicit, redundant with default)
 *      - no flag                        → exists only on plane 0 (DEFAULT)
 *
 *      Plane 0 is the default because the surface (bushes, rocks, grass, water) is
 *      the "real world." Plane 1 is the inside of a tunnel — a separate space whose
 *      only contents are tunnel walls. A player in a tunnel must NOT be able to
 *      cut grass or bump into surface objects.
 *
 *      Use `objectOnPlane(obj, plane)` at every collision/interaction site.
 *
 * Filtering helpers wrap the predicate for the common iteration patterns.
 */

import { GRID } from '../game/GameConfig.js';

export const PLANE_SURFACE = 0;
export const PLANE_TUNNEL = 1;
export const PLANE_SUBMERGED = 2;

/**
 * Read an entity's plane.
 *
 * For live entities (player, enemies, ingredients, items) the plane is stored
 * directly on entity.plane and takes priority.
 *
 * For background objects the plane is encoded in data flags, not in an instance
 * field (BackgroundObject never sets .plane). We mirror the objectOnPlane priority
 * order so planeOf and objectOnPlane always agree:
 *   renderOnlyOnPlane (explicit) > tunnelWall flag > default surface (0)
 */
export function planeOf(entity) {
  if (!entity) return PLANE_SURFACE;
  if (entity.plane !== undefined) return entity.plane;
  if (entity.data?.renderOnlyOnPlane !== undefined) return entity.data.renderOnlyOnPlane;
  if (entity.data?.tunnelWall) return PLANE_TUNNEL;
  return PLANE_SURFACE;
}

/** True when two entities occupy the same plane. */
export function inSamePlane(a, b) {
  return planeOf(a) === planeOf(b);
}

/** Canonical interaction predicate. Currently equivalent to `inSamePlane`. */
export const canInteract = inSamePlane;

/**
 * True when a background object is present on the given plane.
 * Objects default to plane 0 (surface) — the tunnel plane is reserved for tunnel walls.
 *
 * Priority: renderOnlyOnPlane (explicit per-object override) > tunnelWall (tunnel-specific flag)
 * > default (plane 0). All three cases must be consistent for any given object type.
 */
export function objectOnPlane(obj, plane) {
  if (!obj) return false;
  if (obj.data?.renderOnlyOnPlane !== undefined) return plane === obj.data.renderOnlyOnPlane;
  if (obj.data?.tunnelWall) return plane === PLANE_TUNNEL;
  return plane === PLANE_SURFACE;
}

/** True when an observer can interact with a background object (combines affinity + observer plane). */
export function canInteractWithObject(observer, obj) {
  return objectOnPlane(obj, planeOf(observer));
}

/** Return only the entities sharing the observer's plane. */
export function filterByPlane(entities, observer) {
  const p = planeOf(observer);
  return entities.filter(e => planeOf(e) === p);
}

/** Return only the background objects present on the observer's plane. */
export function filterObjectsByPlane(objects, observer) {
  const p = planeOf(observer);
  return objects.filter(o => objectOnPlane(o, p));
}

/**
 * Should a surface-room background object render for the player? Render-side
 * visibility, separate from objectOnPlane (interaction): a tunnel's plane 1
 * runs under an open surface, so most surface objects stay visible from it.
 *   - data.alwaysRender: always visible (e.g. tunnel entrances)
 *   - surfaceOnly: hidden while the player is down in a cave
 *     (`room.underground` — U rooms, Sinkhole caves). A tunnel room has no
 *     `underground`, so its grass stays visible like every other surface
 *     object there.
 *   - data.renderOnlyOnPlane: visible only from that plane (e.g. tunnel walls)
 *   - otherwise: visible from every plane
 */
export function objectVisibleToPlayer(obj, player, room) {
  if (obj.data?.alwaysRender) return true;
  const playerPlane = player.plane ?? PLANE_SURFACE;
  if (obj.surfaceOnly && room?.underground) return playerPlane === PLANE_SURFACE;
  if (obj.data?.renderOnlyOnPlane !== undefined) return playerPlane === obj.data.renderOnlyOnPlane;
  return true;
}

/**
 * True when the player is inside a hut/dungeon/maze interior (a PiP overlay
 * layer, distinct from the surface/tunnel/submerged plane system above).
 * Canonical replacement for the scattered `player.inHut || player.inDungeon ||
 * player.inMaze` boolean chains — use this everywhere a system needs to know
 * whether the surface room is the active layer.
 */
export function isInteriorActive(game) {
  const p = game?.player;
  // Canonical single field (ADR-0001) — covers hut/dungeon/maze/pond.
  return !!(p && p._activeInteriorKind != null);
}

/**
 * The active Interior's floor — the hut / dungeon / Aquifer space whose content
 * lives on `game.activeFloor` — or null on the surface and in the Maze (whose
 * content is its own arrays on `game.mazeInterior`). Use this, never an
 * `inHut || inDungeon` list, wherever a system needs "the floor the player is
 * on", so a new Interior kind is covered without touching the call site.
 */
export function activeInteriorFloor(game) {
  if (!isInteriorActive(game) || game.player.inMaze) return null;
  return game.activeFloor ?? null;
}

/**
 * True while GAME_OVER's 2-second death delay is still showing the death in
 * place on a layer other than the surface — inside an Interior (PiP) or on a
 * non-surface Plane (U-room cave, T-room tunnel). Once the delay
 * expires the view cuts to the surface room for the GAME OVER text. Shared by
 * GameOverRenderer (what to draw) and CameraZoomSystem (hold the zoom) so the
 * scene and the camera release on the same frame.
 */
export function isDeathHeldOffSurface(game) {
  const timer = game.characterDeathPending ? game.characterDeathTimer : game.gameOverDeathTimer;
  if (!(timer > 0)) return false;
  return isInteriorActive(game) || planeOf(game.player) !== PLANE_SURFACE;
}

/**
 * Tag a transient effect/entity (particle, puddle, goo blob, steam cloud, ...)
 * with the interior plane it was spawned on, so render filtering (hutPlane)
 * matches the layer the player was in at spawn time. Call this at every
 * effect-creation site instead of writing `entity.hutPlane = !!game.activeFloor`
 * by hand — a missed manual tag is exactly what caused the dodge-trail leak
 * (bug #107).
 */
export function tagInteriorPlane(game, entity) {
  entity.hutPlane = isInteriorActive(game);
  return entity;
}

/**
 * True when a loot entity (ingredient or item) lies on the layer the player is
 * standing on, so it can be attracted and picked up.
 *
 * Loot carries one of two interior tags, set at its spawn site: `mazePlane`
 * for the Maze (whose loot is drawn by MazeInteriorOverlay) and `hutPlane` for
 * the floor Interiors (hut / dungeon / Aquifer, drawn by the shared hut
 * overlay); untagged loot is on the surface. The reach rule has to read both
 * tags — comparing `hutPlane` against `isInteriorActive` alone called every
 * Maze drop "wrong layer", since the Maze is an active Interior whose loot is
 * never hutPlane (#342).
 */
export function lootOnActiveLayer(game, entity) {
  if (game?.player?.inMaze) return !!entity.mazePlane;
  return !entity.mazePlane && !!entity.hutPlane === isInteriorActive(game);
}

/**
 * True when `observer` can reach a loot entity: it shares the observer's Plane
 * AND lies on the layer the player is standing on. The one reach rule for
 * every pickup that happens alongside the player — SPACE item pickup, the
 * boomerang fetch, companions. Reading the Plane alone is not enough: an
 * Interior's coordinates overlap the surface Room's, so loot lying on the
 * frozen surface would be takeable from inside (and unseen while it happens).
 */
export function canReachLoot(game, observer, entity) {
  return inSamePlane(observer, entity) && lootOnActiveLayer(game, entity);
}

/**
 * True for loot lying in the surface Room — it carries neither Interior tag.
 * The reach rule for entities that never leave the surface (wild and follower
 * crows), whatever layer the player happens to be on.
 */
export function lootOnSurface(entity) {
  return !entity.hutPlane && !entity.mazePlane;
}

/**
 * Tag a loot entity (ingredient or item) at spawn with the Interior it was
 * created in: `mazePlane` in the Maze, `hutPlane` on a floor Interior, nothing
 * on the surface. Every loot spawn site calls this rather than writing the
 * tags by hand — untagged loot created inside an Interior draws on the frozen
 * surface instead of the overlay and fails lootOnActiveLayer.
 */
export function tagLootLayer(game, entity) {
  if (game.player?.inMaze) entity.mazePlane = true;
  else if (isInteriorActive(game)) entity.hutPlane = true;
  return entity;
}

/**
 * Freeze the surface room's enemies on interior entry: unregister them from
 * PhysicsSystem (so velocity/knockback/friction stop integrating, not just AI)
 * and empty currentRoom.enemies (so the many loops that iterate it directly
 * naturally no-op). Object references are preserved, not destroyed — thaw
 * restores the exact same instances with all state intact.
 */
export function freezeSurfaceRoom(game) {
  if (!game.currentRoom || game.currentRoom._frozenEnemies) return;
  // layer-guard-ok: this IS the routing mechanism - freezing the surface
  // list while an interior owns the frame is this function's entire job.
  // layer-guard-ok: this IS the routing mechanism - freezing the surface
  // list while an interior owns the frame is this function's entire job.
  game.currentRoom._frozenEnemies = game.currentRoom.enemies; // layer-guard-ok
  for (const e of game.currentRoom.enemies) game.physicsSystem.removeEntity(e); // layer-guard-ok
  game.currentRoom.enemies = []; // layer-guard-ok
}

export function thawSurfaceRoom(game) {
  if (!game.currentRoom?._frozenEnemies) return;
  // layer-guard-ok: thaw restores exactly what freezeSurfaceRoom stashed.
  // layer-guard-ok: thaw restores exactly what freezeSurfaceRoom stashed.
  game.currentRoom.enemies = game.currentRoom._frozenEnemies; // layer-guard-ok
  for (const e of game.currentRoom.enemies) game.physicsSystem.addEntity(e); // layer-guard-ok
  game.currentRoom._frozenEnemies = null;
}

// ── Projectile tunnel crossing ──────────────────────────────────────────────
// Moved from CombatSystem: a projectile's plane follows the tunnel it flies
// into, which is plane membership, not combat resolution.

/**
 * Update projectile's plane based on tunnel boundaries
 * Projectiles switch planes when crossing tunnel boundaries from the correct axis
 */
export function updateProjectileTunnelPlane(projectile, tunnelData) {
  const { bounds, entranceAxis } = tunnelData;

  // Convert projectile position to grid coordinates
  const projGridX = Math.floor(projectile.position.x / GRID.CELL_SIZE);
  const projGridY = Math.floor(projectile.position.y / GRID.CELL_SIZE);

  // Check if projectile is inside tunnel bounds
  const inTunnelBounds =
    projGridX >= bounds.minCol && projGridX <= bounds.maxCol &&
    projGridY >= bounds.minRow && projGridY <= bounds.maxRow;

  // Determine target plane based on position
  const targetPlane = inTunnelBounds ? 1 : 0;

  // Only switch planes if entering from the correct axis
  if (targetPlane !== projectile.plane) {
    const crossingFromCorrectAxis = enteringTunnelFromAxis(projectile, bounds, entranceAxis);

    if (crossingFromCorrectAxis) {
      projectile.plane = targetPlane;
    }
  }
}

/**
 * Check if projectile is entering tunnel from the correct axis
 * For horizontal tunnels: must enter from left/right edges
 * For vertical tunnels: must enter from top/bottom edges
 */
function enteringTunnelFromAxis(projectile, bounds, entranceAxis) {
  const projGridX = Math.floor(projectile.position.x / GRID.CELL_SIZE);
  const projGridY = Math.floor(projectile.position.y / GRID.CELL_SIZE);

  if (entranceAxis === 'horizontal') {
    // Horizontal tunnel: check if entering from left or right edge
    const atLeftEdge = projGridX === bounds.minCol;
    const atRightEdge = projGridX === bounds.maxCol;
    const withinVerticalBounds = projGridY >= bounds.minRow && projGridY <= bounds.maxRow;

    return (atLeftEdge || atRightEdge) && withinVerticalBounds;
  } else {
    // Vertical tunnel: check if entering from top or bottom edge
    const atTopEdge = projGridY === bounds.minRow;
    const atBottomEdge = projGridY === bounds.maxRow;
    const withinHorizontalBounds = projGridX >= bounds.minCol && projGridX <= bounds.maxCol;

    return (atTopEdge || atBottomEdge) && withinHorizontalBounds;
  }
}
