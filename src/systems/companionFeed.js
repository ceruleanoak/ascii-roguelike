import { GRID } from '../game/GameConfig.js';
import { isFeed } from './feed.js';
import { canReachLoot, tagInteriorPlane } from './PlaneSystem.js';

// A hurt Companion feeds itself: a tamed rat walks to Feed lying near it, a
// golem to Mana (𝑚), and eating it heals the Companion to full. Any Feed or
// Mana on the ground counts — the player doesn't have to put it there — but
// only while the Companion is hurt, so a healthy pack never eats the bread the
// player meant for a wild rat.
//
// CompanionSystem calls feedHurtCompanions once a frame after the rats and
// golems update. Each Companion carries the thing it is walking to on its own
// `feedTarget`; NPCRat/GolemCompanion.update steer to it when nothing hostile
// is in reach and no command holds them elsewhere.

// How far a hurt Companion will notice something to eat.
const FEED_SEEK_RANGE = GRID.CELL_SIZE * 6;
// Centres this close count as eating it — the same tight contact a wild rat
// needs to eat a loaf (CompanionSystem.updateBreadSeekingRats).
const EAT_DIST = GRID.CELL_SIZE * 0.5;

const MANA_CHAR = '𝑚';

function isHurt(companion) {
  return companion.hp < companion.maxHp || (companion.hitsThisRoom ?? 0) > 0;
}

function stillThere(entity) {
  return entity && !entity.consumed && !entity.destroyed && !entity.pickedUp;
}

function nearestWithin(companion, candidates, taken) {
  let best = null;
  let bestDistSq = FEED_SEEK_RANGE * FEED_SEEK_RANGE;
  for (const c of candidates) {
    if (taken.has(c)) continue;
    const dx = c.position.x - companion.position.x;
    const dy = c.position.y - companion.position.y;
    const d = dx * dx + dy * dy;
    if (d < bestDistSq) { bestDistSq = d; best = c; }
  }
  return best;
}

function eatBurst(game, companion) {
  const C = GRID.CELL_SIZE;
  game.particles.push(tagInteriorPlane(game, {
    x: companion.position.x + C / 2, y: companion.position.y - 4,
    vx: 0, vy: -22, life: 0.9, maxLife: 0.9, char: '♥', color: '#ff5577'
  }));
}

function heal(companion) {
  companion.hp = companion.maxHp;
  // A rat flees for good on its third hit in a room (NPCRat); a meal is a
  // fresh start on that count too, or healing it would change nothing.
  if (companion.hitsThisRoom !== undefined) companion.hitsThisRoom = 0;
}

function removeFrom(game, list, entity) {
  const idx = list.indexOf(entity);
  if (idx !== -1) list.splice(idx, 1);
  game.physicsSystem.removeEntity(entity);
}

/**
 * Drive one roster: drop stale or no-longer-needed targets, eat on contact,
 * and hand each hurt, unassigned Companion the nearest free thing to eat.
 */
function feedRoster(game, roster, available, list, canFeed) {
  const taken = new Set();
  for (const companion of roster) {
    const t = companion.feedTarget;
    if (!t) continue;
    if (!canFeed(companion) || !isHurt(companion) || !stillThere(t) || !list.includes(t)) {
      companion.feedTarget = null;
      continue;
    }
    const dx = t.position.x - companion.position.x;
    const dy = t.position.y - companion.position.y;
    if (dx * dx + dy * dy <= EAT_DIST * EAT_DIST) {
      t.consumed = true;
      removeFrom(game, list, t);
      heal(companion);
      eatBurst(game, companion);
      companion.feedTarget = null;
      continue;
    }
    taken.add(t);
  }
  for (const companion of roster) {
    if (companion.feedTarget || !canFeed(companion) || !isHurt(companion)) continue;
    const reachable = available.filter(a => canReachLoot(game, companion, a));
    const meal = nearestWithin(companion, reachable, taken);
    if (meal) {
      companion.feedTarget = meal;
      taken.add(meal);
    }
  }
}

export function feedHurtCompanions(game) {
  const now = performance.now();
  const ready = it => stillThere(it) && !(it.pickupReadyAt && it.pickupReadyAt > now);

  const rats = game.tamedRats ?? [];
  if (rats.length) {
    const feed = game.items.filter(it => it && isFeed(it) && ready(it));
    feedRoster(game, rats, feed, game.items, rat => rat.state !== 'permaFlee');
  }

  const golems = game.golems ?? [];
  if (golems.length) {
    const mana = game.ingredients.filter(ing => ing && ing.char === MANA_CHAR && ready(ing));
    feedRoster(game, golems, mana, game.ingredients, golem => golem.state !== 'dead');
  }
}
