import { GRID, GAME_STATES } from '../game/GameConfig.js';
import { buildTerrainGrid, cellCost, BLOCKED, HAZARD } from './steeringTerrain.js';
import { entityCenter } from '../game/Telegraph.js';
import { FairyKing } from '../entities/FairyKing.js';
import { planeOf, objectOnPlane } from './PlaneSystem.js';

const CELL = GRID.CELL_SIZE;

const EMPTY_BOTTLE_CHAR = 'B';

// A source counts as reached when the player could stand on its cell or on
// one beside it (left, right, above, below): the one-cell reach of the
// armed-bottle gesture (AlchemySystem's LIQUID_SOURCE_RADIUS).
const BESIDE = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]];

/**
 * GETLAVA / GETWATER / GETMUD / GETFAIRY Spells — take a liquid or a fairy
 * from anywhere in the room the player could walk to, without touching it:
 * lava doesn't burn, water doesn't wet, mud doesn't slow. The outcome is the
 * armed-bottle gesture's own (AlchemySystem.tryFillArmedBottle,
 * InteractionSystem.tryBottleFairy), so the pickup box answers.
 *
 * The liquids fill the first equipped Empty Bottle. GETWATER takes the best
 * water in reach: a hot spring, then the fountain's pool (fairy water,
 * flavoured by attunement), then the hut trough or plain water, then
 * electrified water. GETFAIRY needs no bottle: with one equipped the fairy is
 * caught in it; without one it heals the player, or at full health blesses
 * them (+1 max HP), as touch and the full-health SPACE do. The Fairy King
 * only goes into a bottle.
 *
 * "Could walk to" is a flood over the player's steering terrain
 * (buildTerrainGrid): walls, solid objects, lava and deep water stop it, so a
 * source behind them (an islet, the far side of a lava moat) is out of reach.
 * REST, EXPLORE or NEUTRAL.
 */
export class GetSpellSystem {
  constructor(game) {
    this.game = game;
  }

  /**
   * @param {'lava'|'water'|'mud'|'fairy'} kind
   * @returns {string|null} null when something was taken (silent cast), else the THREE's refusal
   */
  cast(kind) {
    const game = this.game;
    const state = game.stateMachine?.getCurrentState();
    if (state !== GAME_STATES.REST && state !== GAME_STATES.EXPLORE && state !== GAME_STATES.NEUTRAL) return '...NOTHING.';
    if (!game.player) return '...NOTHING.';

    const slot = game.player.equippedConsumables?.findIndex(s => s?.char === EMPTY_BOTTLE_CHAR) ?? -1;
    if (kind === 'fairy') return this._getFairy(slot, this._reachedCells());

    if (slot === -1) return 'NO BOTTLE.';
    const reached = this._reachedCells();
    const plane = planeOf(game.player);
    const tiles = game._activeBackgroundObjects().filter(obj => !obj.destroyed && objectOnPlane(obj, plane));
    for (const source of this._liquidSources(kind)) {
      const tile = tiles.find(obj => source.is(obj) && this._reaches(reached, obj));
      if (!tile) continue;
      source.fill(slot);
      if (game.player.selectedConsumableIndex === slot) game.player.selectedConsumableIndex = -1;
      return null;
    }
    return '...NOTHING.';
  }

  // Where each liquid comes from, best first, and how it fills the bottle.
  _liquidSources(kind) {
    const game = this.game;
    const alchemy = game.alchemySystem;
    const bottleOf = obj => alchemy.liquidBottleFor(obj);
    const fillWith = char => slot => alchemy.fillLiquidBottle(slot, char);
    switch (kind) {
      case 'lava': return [{ is: obj => bottleOf(obj) === '◆', fill: fillWith('◆') }];
      case 'mud':  return [{ is: obj => bottleOf(obj) === '◐', fill: fillWith('◐') }];
      case 'water': {
        const poolBottle = game.fountainSystem?.poolBottleChar();
        return [
          { is: obj => obj.typeId === 'hot_water', fill: slot => alchemy.fillHotWaterBottle(slot) },
          { is: obj => !!poolBottle && !!obj.fountainWater, fill: fillWith(poolBottle) },
          { is: obj => game.player.inHut && obj.char === '≈', fill: slot => alchemy.fillBottle(slot) },
          { is: obj => bottleOf(obj) === '🜉', fill: fillWith('🜉') },
          { is: obj => bottleOf(obj) === 'ε', fill: fillWith('ε') },
        ];
      }
      default: return [];
    }
  }

  // The nearest catchable fairy in reach: into the bottle if one is
  // equipped, else the heal (hurt) or the blessing (full health).
  _getFairy(slot, reached) {
    const game = this.game;
    const interaction = game.interactionSystem;
    const p = entityCenter(game.player);
    const fairies = (game.neutralCharacters || [])
      .filter(c => interaction.isCatchableFairy(c) && this._reaches(reached, c))
      .filter(c => slot !== -1 || !(c instanceof FairyKing))
      .sort((a, b) => {
        const ca = entityCenter(a), cb = entityCenter(b);
        return Math.hypot(ca.x - p.x, ca.y - p.y) - Math.hypot(cb.x - p.x, cb.y - p.y);
      });
    const fairy = fairies[0];
    if (!fairy) return '...NOTHING.';
    if (slot !== -1) interaction.bottleFairy(fairy, slot);
    else if (game.player.hp < game.player.maxHp) interaction.healFromFairy(fairy);
    else interaction.blessFromFairy(fairy);
    return null;
  }

  // Every cell the player could walk to from where they stand, as a
  // Uint8Array over the steering grid plus the grid itself.
  _reachedCells() {
    const game = this.game;
    const player = game.player;
    const map = player.collisionMap || game.activeGridBounds()?.collisionMap || null;
    const grid = buildTerrainGrid(game, player, map);
    const reached = new Uint8Array(grid.cols * grid.rows);
    const c = entityCenter(player);
    const startCol = Math.floor(c.x / CELL), startRow = Math.floor(c.y / CELL);
    if (startCol < 0 || startRow < 0 || startCol >= grid.cols || startRow >= grid.rows) return { grid, reached };

    // The start cell is open whatever it holds (the player may stand in mud
    // or at a wall edge), as in planRoute.
    const queue = [startRow * grid.cols + startCol];
    reached[queue[0]] = 1;
    for (let head = 0; head < queue.length; head++) {
      const i = queue[head];
      const col = i % grid.cols, row = (i - col) / grid.cols;
      for (const [dc, dr] of BESIDE) {
        const nc = col + dc, nr = row + dr;
        const cost = cellCost(grid, nc, nr);
        if (cost === BLOCKED || cost === HAZARD) continue;
        const ni = nr * grid.cols + nc;
        if (reached[ni]) continue;
        reached[ni] = 1;
        queue.push(ni);
      }
    }
    return { grid, reached };
  }

  // Whether the player could stand on `entity`'s cell or beside it.
  _reaches({ grid, reached }, entity) {
    const c = entityCenter(entity);
    const col = Math.floor(c.x / CELL), row = Math.floor(c.y / CELL);
    return BESIDE.some(([dc, dr]) => {
      const nc = col + dc, nr = row + dr;
      if (nc < 0 || nr < 0 || nc >= grid.cols || nr >= grid.rows) return false;
      return reached[nr * grid.cols + nc] === 1;
    });
  }
}
