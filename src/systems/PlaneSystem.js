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
