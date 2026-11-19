// Mire Lake — the gray zone's Lake. Its liquid is Mire: gray `~` that wets
// like water but climbs wet Pips everywhere (Deep Mire twice as fast), is
// inert to the elements (no freeze, conduction or poison: its typeId isn't
// 'water', so BackgroundObject.isWater() is false), and swallows the lower
// half of the wading player's glyph (PlayerGlyphDraw). One Mire Toad lives
// in it, and fishing it only pulls up another (FishingSystem.resolveCatch).
//
// Owns: the Mire tile test and factory (generateLakeTerrain), and the Mire
// Toad spawn used by fishing.
import { GRID } from '../game/GameConfig.js';
import { BackgroundObject } from '../entities/BackgroundObject.js';
import { Enemy } from '../entities/Enemy.js';

export const MIRE_TOAD_CHAR = 'p';
const DEEP_MIRE_COLOR = '#4a4a4a';

/** True for a Mire tile (shallow or deep). */
export function isMireTile(obj) {
  return obj?.typeId === 'mire';
}

/**
 * stampWaterBlobs' makeLiquid factory for a Mire lake. `isDeep(col, row)` is
 * the lake's deep-water test (roomFeatures.isDeepWaterCell over its nodes),
 * so Deep Mire fills each blob's inner half the way deep water does.
 */
export function makeMire(isDeep) {
  return (col, row) => {
    const deep = isDeep(col, row);
    const obj = BackgroundObject.createVariant('mire', col * GRID.CELL_SIZE, row * GRID.CELL_SIZE,
      deep ? { color: DEEP_MIRE_COLOR } : {});
    obj.deepWater = deep;
    return obj;
  };
}

/** A Mire Toad surfacing mid-room at (x, y) — a fishing catch in the Mire. */
export function spawnMireToad(game, x, y) {
  const room = game.currentRoom;
  const toad = new Enemy(MIRE_TOAD_CHAR, x, y, game.getCurrentZoneDepth());
  // Center the 2×2 body on the catch point.
  toad.position.x = x - toad.width / 2 + GRID.CELL_SIZE / 2;
  toad.position.y = y - toad.height / 2 + GRID.CELL_SIZE / 2;
  toad.setCollisionMap(room.collisionMap);
  toad.setBackgroundObjects(game._activeBackgroundObjects());
  toad.setTarget(game.player);
  toad.setGame(game);
  toad.setRoom(room);
  game.physicsSystem.addEntity(toad);
  game._activeEnemies().push(toad);
  return toad;
}
