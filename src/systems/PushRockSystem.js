import { GRID } from '../game/GameConfig.js';
import { Item } from '../entities/Item.js';
import { createPushRock } from './PushRock.js';
import { tickTriggers } from './triggerMachine.js';
import { isExitLetterTile } from './ExitSystem.js';
import { isInteriorActive } from './PlaneSystem.js';
import { isCellProtected, occupiedEntityCells } from './roomFeatures.js';

/**
 * Room Push Rocks — the Push Rocks an Explore room sets out on its own, each
 * the answer to one locked thing in that room. A Barricade's rock and a
 * dungeon's rocks are ticked by their own gates (BarricadeSystem,
 * DungeonPuzzleSystem); everything else lives on `room.pushRocks` and is
 * ticked here. Each entry names the lock its rock answers:
 *
 *   flippers  every green Ocean (O) room — the lock is the deep sea, and the
 *             Flippers lie under the rock, uncovered on the cell it left.
 *   vault     a red V room — the Vault's wall gives to brute force, and an
 *             unassuming rock somewhere in the room is one: the push breaks
 *             the wall (InteractionSystem.openVaultByPush).
 *   cavern    a push-seal Cavern (roomFeatures.seedCavern) — the seal is a
 *             Bombable Rock that also gives to a lean, sliding into the hollow
 *             behind it; the door appears on the cell it left
 *             (CavernSystem.revealDoorAt). A bomb still opens it the old way.
 *
 * The rock is placed the way a Barricade places its Push Rock
 * (BarricadeSystem._placeTriggers): the cell is cleared first, then the stock
 * createPushRock() goes down, and it is ticked through triggerMachine with the
 * same world shape. What the room did lives on the room's own objects — an
 * Explore room is never rebuilt, so nothing needs a run record.
 */

// Rows kept clear of the top and bottom walls, so the Ocean rock sits up the
// beach rather than in a corner.
const EDGE_MARGIN_ROWS = 3;

// Cells kept clear around each exit's spawn cell, so an entering player is
// never stood against the Vault rock (mirrors the Cavern's exit clearance).
const EXIT_CLEARANCE = 3;

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

const cellOf = (obj) => {
  const cs = GRID.CELL_SIZE;
  return { col: Math.floor(obj.position.x / cs), row: Math.floor(obj.position.y / cs) };
};

/**
 * Set a Push Rock on one of `candidates` and record it on `room.pushRocks`
 * under `answer`. A candidate must not be a wall or an exit tile and must
 * have open floor on every side (so a lean from any side can move it). A cell
 * with no tall grass on or around it is preferred — the grass blades draw over
 * a rock beside them and all but hide it. Returns the entry, or null when no
 * candidate fits.
 */
export function placeRoomPushRock(room, candidates, answer) {
  const map = room.collisionMap;
  const grassCells = new Set(room.backgroundObjects
    .filter(o => o.char === '|' && !o.destroyed)
    .map(o => { const c = cellOf(o); return `${c.col},${c.row}`; }));
  const nearGrass = (col, row) => {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (grassCells.has(`${col + dc},${row + dr}`)) return true;
      }
    }
    return false;
  };
  const fits = candidates.filter(({ col, row }) => {
    if (map[row]?.[col] !== false || isExitLetterTile(col, row)) return false;
    return !DIRS.some(([dc, dr]) => {
      const cell = map[row + dr]?.[col + dc];
      return cell === undefined || cell;
    });
  });
  if (fits.length === 0) return null;
  const clear = fits.filter(c => !nearGrass(c.col, c.row));
  const pool = clear.length > 0 ? clear : fits;
  const { col, row } = pool[Math.floor(Math.random() * pool.length)];

  const objs = room.backgroundObjects;
  for (let i = objs.length - 1; i >= 0; i--) {
    const c = cellOf(objs[i]);
    if (c.col === col && c.row === row) objs.splice(i, 1);
  }

  const rock = createPushRock(col, row);
  objs.push(rock);
  const entry = { rock, col, row, answer };
  room.pushRocks.push(entry);
  return entry;
}

/**
 * Called at the end of generateOceanTerrain: the Flippers' rock, somewhere on
 * the dry part of the sand band (sandStartCol up to the column before the
 * water).
 */
export function placeOceanPushRock(room, oceanConfig) {
  const candidates = [];
  for (let col = oceanConfig.sandStartCol; col < oceanConfig.waterStartCol; col++) {
    for (let row = EDGE_MARGIN_ROWS; row < GRID.ROWS - EDGE_MARGIN_ROWS; row++) {
      candidates.push({ col, row });
    }
  }
  placeRoomPushRock(room, candidates, 'flippers');
}

/**
 * A red Vault's rock: anywhere in the room but the Vault itself, the ground
 * in front of its wall, a protected structure, an exit's mouth, or a cell
 * already holding an entity or a fixture. Only a Vault whose wall gives to
 * brute force (unlockMethod 'break') gets one. Called once generation has
 * placed everything else, so it can see what it must not land on.
 */
export function placeVaultPushRock(room) {
  const vault = room.vaultInfo;
  if (!vault || vault.unlockMethod !== 'break') return;

  const centerCol = Math.floor(GRID.COLS / 2);
  const centerRow = Math.floor(GRID.ROWS / 2);
  const exitCells = [
    { col: centerCol, row: 2 }, { col: centerCol, row: GRID.ROWS - 3 },
    { col: GRID.COLS - 3, row: centerRow }, { col: 2, row: centerRow },
  ];
  const occupied = occupiedEntityCells(room);
  const fixtures = new Set(room.backgroundObjects
    .filter(o => !o.destroyed && (o.structural || o.data?.indestructible || o.data?.solid))
    .map(o => { const c = cellOf(o); return `${c.col},${c.row}`; }));

  const candidates = [];
  for (let row = 2; row < GRID.ROWS - 2; row++) {
    for (let col = 2; col < GRID.COLS - 2; col++) {
      // The Vault and a ring round it, two rows deep in front of its wall.
      if (col >= vault.minCol - 1 && col <= vault.maxCol + 1 &&
          row >= vault.minRow - 1 && row <= vault.maxRow + 2) continue;
      if (exitCells.some(e => Math.abs(col - e.col) <= EXIT_CLEARANCE && Math.abs(row - e.row) <= EXIT_CLEARANCE)) continue;
      const key = `${col},${row}`;
      if (occupied.has(key) || fixtures.has(key) || isCellProtected(room, col, row)) continue;
      candidates.push({ col, row });
    }
  }
  placeRoomPushRock(room, candidates, 'vault');
}

export class PushRockSystem {
  constructor(game) {
    this.game = game;
  }

  /**
   * Per-frame lean check for the current room's Push Rocks. When one lands,
   * the lock it answers gives.
   *
   * rest-parity: absent because room Push Rocks exist only in EXPLORE rooms.
   */
  update(deltaTime) {
    const game = this.game;
    const room = game.currentRoom;
    const live = room?.pushRocks?.filter(e =>
      !e.rock.active && !e.rock.destroyed && !e.rock.destroyAfterAnimation);
    if (!live?.length || isInteriorActive(game)) return;
    const world = {
      collisionMap: room.collisionMap,
      backgroundObjects: room.backgroundObjects,
      isReserved: isExitLetterTile,
      onMove: () => game.renderer?.markBackgroundDirty?.()
    };
    for (const entry of live) {
      if (tickTriggers([entry.rock], deltaTime, game.player, game.companionSystem.companions(), world)) {
        this._answer(entry);
      }
    }
  }

  _answer(entry) {
    const game = this.game;
    const cs = GRID.CELL_SIZE;
    switch (entry.answer) {
      case 'flippers': {
        const flippers = new Item('⚷', entry.col * cs, entry.row * cs);
        game.items.push(flippers);
        game.physicsSystem.addEntity(flippers);
        break;
      }
      case 'vault':
        game.interactionSystem.openVaultByPush();
        break;
      case 'cavern':
        game.cavernSystem.revealDoorAt(entry.col, entry.row, game._activeBackgroundObjects());
        break;
    }
  }
}
