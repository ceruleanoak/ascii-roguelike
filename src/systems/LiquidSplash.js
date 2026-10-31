import { GRID, HEATED_WATER_DURATION } from '../game/GameConfig.js';
import { BackgroundObject } from '../entities/BackgroundObject.js';
import { planeOf, PLANE_SURFACE, isInteriorActive } from './PlaneSystem.js';
import { createBurstParticles } from './WorldEffectsSystem.js';

const C = GRID.CELL_SIZE;

// The landing cell and the four beside it.
const PLUS = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]];

// What each liquid Bottle's `splash` lays down: the tile variant, and the
// state a water tile takes (Heated Water, electrified) once it is placed.
const SPLASH_TILES = {
  water:       { typeId: 'water' },
  heated:      { typeId: 'water', waterState: 'heated' },
  electrified: { typeId: 'water', electrified: true },
  lava:        { typeId: 'lava' },
  mud:         { typeId: 'mud_wet' },
};

// How long a splashed electrified patch stays charged (s) — the same as an
// electric weapon's strike on water (CombatSystem's melee water branch).
const ELECTRIFIED_TILE_DURATION = 4.0;

/**
 * Liquid Splash — a thrown liquid Bottle (🜉 🜊 ε ◆ ◐, `splash` on its ITEMS
 * entry) lands as a plus of that liquid: its landing cell and the four beside
 * it, each only where the floor is open (inside the grid, no wall, no live
 * background object). The Bottle itself leaves an Empty Bottle
 * (leavesBottle), so the throw resolves to tiles alone. Lands on the
 * player's active layer (activeRoom: the surface, or the hut/dungeon floor
 * they are in); a throw from a tunnel puffs and places nothing, because
 * the tiles would be surface objects.
 *
 * Called by ConsumableWindupEffects when a 'liquidSplash' windup lands.
 * @returns {number} how many tiles were placed
 */
export function splashLiquid(game, consumable, x, y) {
  createBurstParticles(game, game.particles, x, y, 18, consumable.color);
  const spec = SPLASH_TILES[consumable.data.splash];
  const room = game.activeRoom;
  if (!spec || !room?.backgroundObjects || planeOf(game.player) !== PLANE_SURFACE) return 0;

  const { cols, rows, collisionMap } = game.activeGridBounds();
  const occupied = new Set(
    room.backgroundObjects
      .filter(o => !o.destroyed)
      .map(o => `${Math.floor(o.position.x / C)},${Math.floor(o.position.y / C)}`)
  );
  const col0 = Math.floor(x / C), row0 = Math.floor(y / C);
  const placed = [];
  for (const [dc, dr] of PLUS) {
    const col = col0 + dc, row = row0 + dr;
    if (col < 0 || row < 0 || col >= cols || row >= rows) continue;
    if (collisionMap?.[row]?.[col]) continue;
    if (occupied.has(`${col},${row}`)) continue;
    const tile = BackgroundObject.createVariant(spec.typeId, col * C, row * C);
    if (spec.waterState) tile.setWaterState(spec.waterState, HEATED_WATER_DURATION);
    room.backgroundObjects.push(tile);
    placed.push(tile);
  }

  // Electrified Water: charge the patch through the cascade, so it shocks and
  // spreads into any water it touched, the same as an electric strike would.
  if (spec.electrified && placed.length) {
    game.electricitySystem?.seedFromObject(placed[0], room.backgroundObjects,
      { tileDuration: ELECTRIFIED_TILE_DURATION, hutPlane: isInteriorActive(game) });
  }
  return placed.length;
}
