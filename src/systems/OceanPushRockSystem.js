import { GRID } from '../game/GameConfig.js';
import { Item } from '../entities/Item.js';
import { createPushRock } from './PushRock.js';
import { tickTriggers } from './triggerMachine.js';
import { isExitLetterTile } from './ExitSystem.js';
import { isInteriorActive } from './PlaneSystem.js';

/**
 * Ocean Push Rock — every green Ocean (O) room has one Push Rock up on its
 * sand, and the Flippers are lying under it. The Ocean's east wall of water
 * is what the Flippers answer (and, past the Pearl pedestal, the Sunken
 * Ship's open sea), so the rock is the answer to a locked thing like every
 * other Push Rock: it is never a secret on its own.
 *
 * The rock is placed exactly the way a Barricade places its Push Rock
 * (BarricadeSystem._placeTriggers): the cell is cleared first, then the stock
 * createPushRock() goes down, and it is ticked through triggerMachine with the
 * same world shape. What the room did lives on the room's own objects — an
 * Explore room is never rebuilt, so nothing needs a run record.
 */

// Rows kept clear of the top and bottom walls, so the rock sits up the beach
// rather than in a corner.
const EDGE_MARGIN_ROWS = 3;

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/**
 * Called at the end of generateOceanTerrain. Picks a cell on the dry part of
 * the sand band (sandStartCol up to the column before the water) that is
 * not a wall or exit tile and has open floor on every side (so a lean from
 * any side can move it), clears it, and sets the rock there. A cell with no
 * tall grass on or around it is preferred — the grass blades draw over a rock
 * beside them and all but hide it.
 */
export function placeOceanPushRock(room, oceanConfig) {
  const cs = GRID.CELL_SIZE;
  const map = room.collisionMap;
  const lastDryCol = oceanConfig.waterStartCol - 1;
  const grassCells = new Set(room.backgroundObjects
    .filter(o => o.char === '|' && !o.destroyed)
    .map(o => `${Math.floor(o.position.x / cs)},${Math.floor(o.position.y / cs)}`));
  const nearGrass = (col, row) => {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (grassCells.has(`${col + dc},${row + dr}`)) return true;
      }
    }
    return false;
  };
  const candidates = [];
  for (let col = oceanConfig.sandStartCol; col <= lastDryCol; col++) {
    for (let row = EDGE_MARGIN_ROWS; row < GRID.ROWS - EDGE_MARGIN_ROWS; row++) {
      if (map[row]?.[col] || isExitLetterTile(col, row)) continue;
      if (DIRS.some(([dc, dr]) => {
        const cell = map[row + dr]?.[col + dc];
        return cell === undefined || cell;
      })) continue;
      candidates.push({ col, row });
    }
  }
  if (candidates.length === 0) return;
  const clear = candidates.filter(c => !nearGrass(c.col, c.row));
  const pool = clear.length > 0 ? clear : candidates;
  const { col, row } = pool[Math.floor(Math.random() * pool.length)];

  const objs = room.backgroundObjects;
  for (let i = objs.length - 1; i >= 0; i--) {
    const o = objs[i];
    if (Math.floor(o.position.x / cs) === col && Math.floor(o.position.y / cs) === row) {
      objs.splice(i, 1);
    }
  }

  const rock = createPushRock(col, row);
  objs.push(rock);
  room.oceanPushRock = { rock, col, row };
}

export class OceanPushRockSystem {
  constructor(game) {
    this.game = game;
  }

  /**
   * Per-frame lean check for the current room's Ocean Push Rock. When it
   * lands, the Flippers are uncovered on the cell it left.
   *
   * rest-parity: absent because Ocean rooms exist only in EXPLORE.
   */
  update(deltaTime) {
    const game = this.game;
    const room = game.currentRoom;
    const entry = room?.oceanPushRock;
    if (!entry || entry.rock.active || isInteriorActive(game)) return;
    const world = {
      collisionMap: room.collisionMap,
      backgroundObjects: room.backgroundObjects,
      isReserved: isExitLetterTile,
      onMove: () => game.renderer?.markBackgroundDirty?.()
    };
    if (tickTriggers([entry.rock], deltaTime, game.player, game.companion, world)) {
      const cs = GRID.CELL_SIZE;
      const flippers = new Item('⚷', entry.col * cs, entry.row * cs);
      game.items.push(flippers);
      game.physicsSystem.addEntity(flippers);
    }
  }
}
