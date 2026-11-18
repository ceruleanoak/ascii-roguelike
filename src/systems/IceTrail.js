// An ice trail freezes over where it lies. When a tile of an enemy's ice trail
// (TrailMechanic, trailType 'ice': Glacier Crab, Ice Golem, ...) runs out, it
// does not vanish the way a fire or lava trail does: it leaves a frozen water
// tile on its cell, the same ice a Freeze Trap scatters onto open ground
// (TrapSystem, Freeze Trap burst). The ice is walkable and slippery, so it
// never walls anyone in, and fire thaws it to water like any other ice.
//
// Both puddle expiry paths call this (TrapSystem.updatePuddles counts
// `lifetime` down, WorldEffectsSystem's Puddle.update counts `age` up; bug
// #323), so a tile freezes over whichever path removes it first.

import { GRID } from '../game/GameConfig.js';
import { BackgroundObject } from '../entities/BackgroundObject.js';
import { isInteriorActive } from './PlaneSystem.js';

// Most ice tiles one Background Object list takes from trails. A long chase
// lays dozens of trail tiles; past this the room is ice enough, and the rest
// of the trail vanishes as before. Counted per list (a WeakMap, so a room's
// count dies with the room) rather than as a field on the room.
const MAX_TRAIL_ICE_PER_LIST = 20;
const trailIceCount = new WeakMap();

/**
 * Leave a frozen water tile where an expired ice trail tile lay, if its cell
 * is free. No-op for any other trail type.
 * @param {object} game
 * @param {import('../entities/Puddle.js').Puddle} puddle  the tile just removed
 */
export function freezeExpiredTrailTile(game, puddle) {
  if (puddle.type !== 'ice') return;
  // Plane 1 (underground) has no Background Object layer of its own.
  if ((puddle.plane ?? 0) !== 0) return;
  // The tile must still be on the player's layer: a surface trail expiring
  // while the player is in a hut (or the reverse) would otherwise drop its
  // ice into the wrong space ([layer-leak]).
  if (!!puddle.hutPlane !== isInteriorActive(game)) return;

  const objects = game._activeBackgroundObjects();
  if (!objects) return;
  const placed = trailIceCount.get(objects) ?? 0;
  if (placed >= MAX_TRAIL_ICE_PER_LIST) return;

  const C = GRID.CELL_SIZE;
  const col = Math.floor(puddle.position.x / C);
  const row = Math.floor(puddle.position.y / C);
  const { cols, rows, collisionMap } = game.activeGridBounds();
  if (col < 0 || row < 0 || col >= cols || row >= rows) return;
  if (collisionMap?.[row]?.[col]) return; // wall or blocked cell
  if (cellHasObject(objects, col, row)) return; // already dressed, water included

  const ice = new BackgroundObject('~', col * C, row * C);
  ice.setWaterState('frozen', Infinity); // Infinity: a 0 timer thaws next frame
  objects.push(ice);
  trailIceCount.set(objects, placed + 1);
}

function cellHasObject(objects, col, row) {
  const C = GRID.CELL_SIZE;
  const x = col * C, y = row * C;
  for (const obj of objects) {
    if (obj.destroyed) continue;
    const w = obj.width ?? C, h = obj.height ?? C;
    if (obj.position.x < x + C && obj.position.x + w > x
        && obj.position.y < y + C && obj.position.y + h > y) return true;
  }
  return false;
}
