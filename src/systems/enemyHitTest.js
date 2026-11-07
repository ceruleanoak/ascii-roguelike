import { GRID } from '../game/GameConfig.js';

// The one test every damage path asks of an enemy: does this box touch it,
// and how far is this point from it. Every path that picks or aims at an
// enemy (homing, keen aim, auto-fired consumables, trap triggers, companion
// chases) asks the same question, so it picks by and aims at the art too.
//
// An enemy whose drawn shape doesn't fill its rect declares `overlapsBox(box)`
// (a Great Hand counts only where its art is — GraspUnit). Every path that
// can hurt an enemy goes through here so that shape holds for all of them,
// not just the projectile and melee tests: an explosion, a strike or a chain
// into the empty corner of a Great Hand's frame misses, the same as a sword.
//
// An enemy without `overlapsBox` keeps exactly the point each area effect
// has always measured from (`anchor`), so nothing else changes.

const CS = GRID.CELL_SIZE;

/**
 * Whether a pixel box touches the enemy: its hitbox rect, refined by its
 * `overlapsBox` when it has one.
 */
export function enemyOverlapsBox(enemy, box) {
  const e = enemy.getHitbox();
  return box.x < e.x + e.width && box.x + box.width > e.x &&
         box.y < e.y + e.height && box.y + box.height > e.y &&
         (enemy.overlapsBox?.(box) ?? true);
}

// Where an area effect measures an ordinary enemy from. 'corner' is its
// position (the hitbox's top-left), 'center' the middle of its width/height,
// 'hitbox' the middle of its getHitbox() rect (the boomerang's seek), a
// number an offset added to both axes of the position (the consumables'
// historic +20).
function anchorPoint(enemy, anchor) {
  if (anchor === 'hitbox') {
    const box = enemy.getHitbox();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }
  if (anchor === 'center') {
    return {
      x: enemy.position.x + (enemy.width || CS) / 2,
      y: enemy.position.y + (enemy.height || CS) / 2,
    };
  }
  const off = typeof anchor === 'number' ? anchor : 0;
  return { x: enemy.position.x + off, y: enemy.position.y + off };
}

// The nearest point of a box to (x, y).
function nearestInBox(box, x, y) {
  return {
    x: Math.max(box.x, Math.min(x, box.x + box.width)),
    y: Math.max(box.y, Math.min(y, box.y + box.height)),
  };
}

/**
 * The point of the enemy an area effect at (x, y) reaches first, and its
 * distance: for a shaped enemy (`overlapsBox`) the nearest point of the
 * nearest cell of its hitbox that the shape covers; for any other enemy its
 * anchor point. Returns { x, y, dist }; dist is Infinity when a shaped enemy
 * covers no cell at all. `maxDist` lets a shaped enemy's scan stop early
 * when its rect is already out of reach.
 */
export function enemyNearestPoint(enemy, x, y, anchor = 'corner', maxDist = Infinity) {
  if (!enemy.overlapsBox) {
    const p = anchorPoint(enemy, anchor);
    return { x: p.x, y: p.y, dist: Math.hypot(p.x - x, p.y - y) };
  }
  const rect = enemy.getHitbox();
  const onRect = nearestInBox(rect, x, y);
  if (Math.hypot(onRect.x - x, onRect.y - y) > maxDist) return { x: onRect.x, y: onRect.y, dist: Infinity };
  let best = { x: onRect.x, y: onRect.y, dist: Infinity };
  for (let cy = rect.y; cy < rect.y + rect.height; cy += CS) {
    for (let cx = rect.x; cx < rect.x + rect.width; cx += CS) {
      const cell = { x: cx, y: cy, width: Math.min(CS, rect.x + rect.width - cx), height: Math.min(CS, rect.y + rect.height - cy) };
      const p = nearestInBox(cell, x, y);
      const dist = Math.hypot(p.x - x, p.y - y);
      if (dist < best.dist && enemy.overlapsBox(cell)) best = { x: p.x, y: p.y, dist };
    }
  }
  return best;
}

/** Distance from (x, y) to the enemy, as enemyNearestPoint measures it. */
export function enemyDistance(enemy, x, y, anchor = 'corner') {
  return enemyNearestPoint(enemy, x, y, anchor).dist;
}

/** Whether an area effect of `radius` at (x, y) reaches the enemy. */
export function enemyInRadius(enemy, x, y, radius, anchor = 'corner') {
  return enemyNearestPoint(enemy, x, y, anchor, radius).dist <= radius;
}

/**
 * Where a visual tied to the enemy is drawn: a damage number, a status word,
 * a burst, a drip, a chain arc's end. An ordinary enemy gets exactly its
 * anchor point (as above: 'corner' = position, 'center', 'hitbox', or a
 * number added to both axes of the position), so every spawn point stays
 * where it was.
 *
 * An enemy that names where its damage numbers rise (`damageNumberAnchor`,
 * a cell's top-left) gets that cell instead, since its position can be
 * nowhere near its art (a Great Hand's is the empty top-left corner of its
 * frame, a Finger's the top edge it hangs from): 'corner' is the cell's
 * top-left, and any anchor into the body (center, hitbox, an offset) is the
 * cell's middle. A caller's own nudge (a word raised 14px above the number)
 * is added after, the same for both.
 */
export function enemyVisualAnchor(enemy, anchor = 'corner') {
  const cell = enemy.damageNumberAnchor?.();
  if (!cell) return anchorPoint(enemy, anchor);
  const off = anchor === 'corner' || anchor === 0 ? 0 : CS / 2;
  return { x: cell.x + off, y: cell.y + off };
}

/**
 * Where an effect that spreads from a struck enemy starts: the next hop of a
 * chain-lightning arc, the boomerang's splash, a shatter's freeze. An
 * ordinary enemy gives exactly its anchor point (as anchorPoint above), so
 * each effect reaches as far as it always has.
 *
 * An enemy that names where its damage numbers rise (`damageNumberAnchor`)
 * spreads from the middle of that cell instead: a Great Hand's position is
 * the empty top-left corner of its frame, so a chain hopping off its palm
 * searched from a point nowhere near the hand.
 */
export function enemyEffectSource(enemy, anchor = 'corner') {
  const cell = enemy.damageNumberAnchor?.();
  if (!cell) return anchorPoint(enemy, anchor);
  return { x: cell.x + CS / 2, y: cell.y + CS / 2 };
}
