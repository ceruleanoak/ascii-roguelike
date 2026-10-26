import { GRID, INTERACTION_RANGE } from '../game/GameConfig.js';

/**
 * Sunken Glint — something catching the light out in a green Ocean's deep
 * water. It twinkles the same way loot hidden in tall grass does
 * (SparkleEffects.drawSunkenGlints), and nothing says what it is. Only with
 * Goggles equipped (a passive consumable) does what it hides show through
 * the water, darkened, and only then can SPACE over it bring it up — the
 * player has to swim out, risking drowning. Usually it's a coin.
 *
 * The glint is a flag on a deep '~' BackgroundObject, not an entity of its
 * own: seedSunkenGlints() sets it at room generation, and discovering one
 * clears it, so a room's glints are spent for the rest of the run.
 *
 * The Sunken Ship's hold seeds its own (SunkenShipSystem), one of which is
 * the Slow Glint (`slowGlint`): it blinks five times less often, and finding
 * it opens the ship's secret south exit.
 */

const GLINT_ZONE = 'green';
const COIN_CHANCE = 0.8;

// The rest of the time it's a sea find: the raw ingredients the ocean fishing
// table hauls up (fishingTables.js `ocean`), weighted the same way. Pearl
// itself stays out — the fisherman's legend is its only way in.
const SEA_FINDS = [
  { char: 'p', weight: 12 },  // Pearl Shard (Oyster)
  { char: 'n', weight: 5 }    // Sharkbone
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

  flagSunkenGlints(candidates, 1 + Math.floor(Math.random() * 2));
}

/**
 * Flags up to `count` of the candidate deep-water tiles as Sunken Glints,
 * picked at random, and returns the flagged tiles. Shared by the green Ocean
 * (seedSunkenGlints) and the Sunken Ship's hold (SunkenShipSystem), which
 * chooses its own candidates.
 */
export function flagSunkenGlints(candidates, count) {
  const pool = [...candidates];
  const flagged = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const [tile] = pool.splice(Math.floor(Math.random() * pool.length), 1);
    tile.sunkenGlint = true;
    tile.sunkenContents = rollContents();
    flagged.push(tile);
  }
  return flagged;
}

/** What a glint hides: a coin, or else a sea find. */
export function rollContents() {
  return Math.random() < COIN_CHANCE ? 'c' : rollSeaFind();
}

/** Are Goggles equipped in a consumable slot? */
export function wearsGoggles(game) {
  return game.inventorySystem.equippedConsumables.some(slot => slot?.data?.goggles);
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
   * EXPLORE / NEUTRAL SPACE dispatch. With Goggles on, discovers the glint
   * in range, if there is one: the flag clears and what it hid surfaces as a
   * drop on the tile. Without them SPACE passes it by. A Slow Glint hides
   * nothing to pick up — what it held was the way south, which
   * SunkenShipSystem opens when it sees the flag go.
   */
  handleSpacePress() {
    if (!wearsGoggles(this.game)) return false;
    const glint = this.findNearby();
    if (!glint) return false;
    glint.sunkenGlint = false;
    if (glint.slowGlint) return true;
    const char = glint.sunkenContents ?? rollContents();
    this.game.lootSystem.spawnIngredientDrop(char, glint.position.x, glint.position.y, null, glint);
    return true;
  }
}
