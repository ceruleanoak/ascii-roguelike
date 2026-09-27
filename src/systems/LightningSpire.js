/**
 * The Lightning Spire — one mechanic for every spire in the game: the storm
 * spire on the yellow Ascent's plateau, the rod standing in the electric Imbue
 * Pool, and the Lightning Rod the player places (TrapSystem). They are the same
 * object built by the same factory, so a change here changes all three.
 *
 *   - Catch: every lightning strike, from any source, lands on the spire
 *     nearest to where it was going to land (LightningStrikeSystem.scheduleStrike
 *     asks findStrikeSpire before the telegraph is drawn, so the dodge window
 *     is shown on the spire itself).
 *   - Struck: at impact the spire charges the conductive objects around it,
 *     itself included (spireStruck → StormAscentSystem.chargeNearby).
 */

import { GRID, LIGHTNING_SPIRE_CHAR } from '../game/GameConfig.js';
import { BackgroundObject } from '../entities/BackgroundObject.js';
import { planeOf } from './PlaneSystem.js';

// An indestructible conductive rod. Non-solid, so it never walls off a room.
export function createLightningSpire(x, y) {
  const spireTile = new BackgroundObject(LIGHTNING_SPIRE_CHAR, x, y);
  spireTile.data = {
    name: 'Lightning Spire',
    color: '#ccccaa',
    solid: false,
    bulletInteraction: 'pass-through',
    flammability: 'none',
    conductivity: 'high',
    indestructible: true,
    environmental: true,
    interactions: { default: { animation: 'none', message: null } }
  };
  spireTile.conductive = true;
  spireTile.isSpire = true;
  spireTile.charged = false;
  spireTile.chargeTimer = 0;
  return spireTile;
}

/**
 * The spire on the active layer and `plane` nearest (x, y) — the point the
 * strike was going to land — or null when the layer has none.
 */
export function findStrikeSpire(game, x, y, plane = 0) {
  const C = GRID.CELL_SIZE;
  let best = null;
  let bestDist = Infinity;
  for (const obj of game?._activeBackgroundObjects?.() ?? []) {
    if (!obj.isSpire || obj.destroyed || planeOf(obj) !== plane) continue;
    const d = Math.hypot(obj.position.x + C / 2 - x, obj.position.y + C / 2 - y);
    if (d < bestDist) {
      bestDist = d;
      best = obj;
    }
  }
  return best;
}

// A strike has landed on `spire`: energise the conductive objects around it.
export function spireStruck(game, spire) {
  game.stormAscentSystem?.chargeNearby(spire);
}
