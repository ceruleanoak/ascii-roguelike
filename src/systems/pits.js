import { GRID } from '../game/GameConfig.js';

// Pits — low ground cut into a room and ringed by Slopes that run down into it.
// A projectile in flight passes over anything standing in a Pit, so a Pit is
// cover: duck in to let the volley pass, step out to shoot back. Melee still
// reaches into a Pit, and a shot hits normally when it was fired from inside
// the same Pit as the target (same floor, nothing to sail over).
//
// A shot's height is fixed when it is fired, not when it lands: the Pit its
// shooter stood in at launch is stamped on the projectile (`launchPit`, via
// tagLaunchPit). Reading the shooter's position at impact instead let a player
// fire from inside a Pit, step out, and watch the shot sail over the enemy it
// was aimed at — and an enemy shot outlived its shooter's move the same way.
//
// A Pit is plain room data — `room.pits = [{ col, row, radius }]`, the centre
// cell and its radius in cells — stamped by the room generator alongside its
// Slope ring (roomFeatures.stampPit). Membership is by cell, so the cover zone
// is exactly the cells the player can see the Pit occupying. The cyan Ascent
// is the first room with Pits; the Sniper fight is meant to reuse them as
// bunkers.
//
// Pure predicates, no per-frame state: the room owns the data and dies with it,
// so nothing here needs a Reset Registry entry.

/** The Pit whose cells contain the pixel point (x, y), or null. */
export function pitAt(room, x, y) {
  const pits = room?.pits;
  if (!pits?.length) return null;
  const col = Math.floor(x / GRID.CELL_SIZE);
  const row = Math.floor(y / GRID.CELL_SIZE);
  for (const pit of pits) {
    if (Math.hypot(col - pit.col, row - pit.row) <= pit.radius) return pit;
  }
  return null;
}

/** The Pit an entity is standing in (by its centre), or null. */
export function pitOf(room, entity) {
  if (!entity?.position) return null;
  const half = GRID.CELL_SIZE / 2;
  return pitAt(room, entity.position.x + half, entity.position.y + half);
}

/**
 * Stamp a projectile with the Pit its shooter is standing in as it is fired
 * (null on open ground). Call at every site that puts a projectile into
 * flight — or re-launches one, like a reflect — so projectileSailsOver judges
 * the shot by where it came from.
 */
export function tagLaunchPit(room, proj, shooter) {
  proj.launchPit = pitOf(room, shooter);
  return proj;
}

/**
 * True when a projectile should pass over `target` instead of hitting it: the
 * target is in a Pit and the shot was not fired from inside that same Pit.
 * `room` is the room the fight is in (`game.activeRoom` — an interior has no
 * Pits, so this is always false inside one). A projectile that was never
 * tagged falls back to its owner's current Pit.
 */
export function projectileSailsOver(room, target, proj) {
  const pit = pitOf(room, target);
  if (!pit) return false;
  const launchPit = proj.launchPit !== undefined ? proj.launchPit : pitOf(room, proj.owner);
  return launchPit !== pit;
}
