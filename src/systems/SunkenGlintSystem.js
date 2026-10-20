import { GRID, INTERACTION_RANGE } from '../game/GameConfig.js';

/**
 * Sunken Glint — something catching the light out in a green Ocean's deep
 * water. It twinkles the same way loot hidden in tall grass does
 * (SparkleEffects.drawSunkenGlints), and nothing says what it is: the player
 * has to swim out, risking drowning, and press SPACE over it to find out.
 * Usually it's a coin.
 *
 * The glint is a flag on a deep '~' BackgroundObject, not an entity of its
 * own: seedSunkenGlints() sets it at room generation, and discovering one
 * clears it, so a room's glints are spent for the rest of the run.
 */

const GLINT_ZONE = 'green';
const COIN_CHANCE = 0.8;

// The rest of the time it's a sea find: the raw ingredients the ocean fishing
// table hauls up (fishingTables.js `ocean`), weighted the same way. Pearl
// itself stays out — the fisherman's legend is its only way in.
const SEA_FINDS = [
  { char: 'p', weight: 12 },  // Pearl Shard (Oyster)
  { char: 'n', weight: 5 },   // Sharkbone
  { char: 'Y', weight: 5 },   // Ray Tail
  { char: 'V', weight: 5 }    // Webbed Foot
];

/**
 * Called at the end of generateOceanTerrain. Flags 1–2 deep-water tiles in a
 * green Ocean room as Sunken Glints, taken from the outer half of the deep
 * band, so reaching one is a real swim rather than a step off the shore.
 */
export function seedSunkenGlints(room, deepStartCol, waterEndCol) {
  if (room.zone !== GLINT_ZONE) return;
  const farCol = deepStartCol + Math.floor((waterEndCol - deepStartCol) / 2);
  const candidates = room.backgroundObjects.filter(obj =>
    obj.deepWater && !obj.destroyed && obj.position.x >= farCol * GRID.CELL_SIZE);

  const count = 1 + Math.floor(Math.random() * 2);
  for (let i = 0; i < count && candidates.length > 0; i++) {
    const [tile] = candidates.splice(Math.floor(Math.random() * candidates.length), 1);
    tile.sunkenGlint = true;
  }
}

function rollSeaFind() {
  const total = SEA_FINDS.reduce((sum, find) => sum + find.weight, 0);
  let roll = Math.random() * total;
  for (const find of SEA_FINDS) {
    roll -= find.weight;
    if (roll < 0) return find.char;
  }
  return SEA_FINDS[0].char;
}

export class SunkenGlintSystem {
  constructor(game) {
    this.game = game;
  }

  /** The nearest undiscovered glint in SPACE range of the player, or null. */
  findNearby() {
    const { game } = this;
    let nearest = null;
    let nearestDistance = INTERACTION_RANGE;
    // Active layer only: from inside a hut or dungeon the sea isn't in reach.
    for (const obj of game._activeBackgroundObjects()) {
      if (!obj.sunkenGlint || obj.destroyed) continue;
      const distance = game.physicsSystem.getDistance(game.player, obj);
      if (distance < nearestDistance) {
        nearest = obj;
        nearestDistance = distance;
      }
    }
    return nearest;
  }

  /**
   * EXPLORE SPACE dispatch. Discovers the glint in range, if there is one:
   * the flag clears and what it hid surfaces as a drop on the tile.
   */
  handleSpacePress() {
    const glint = this.findNearby();
    if (!glint) return false;
    glint.sunkenGlint = false;
    const char = Math.random() < COIN_CHANCE ? 'c' : rollSeaFind();
    this.game.lootSystem.spawnIngredientDrop(char, glint.position.x, glint.position.y, null, glint);
    return true;
  }
}
