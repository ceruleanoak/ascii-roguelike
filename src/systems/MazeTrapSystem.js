import { GRID } from '../game/GameConfig.js';
import { Item } from '../entities/Item.js';
import { bfsOrder } from './mazePath.js';

/**
 * MazeTrapSystem — the deep Maze's traps (claudedocs/maze-traps-plan.md).
 * A MazeSystem subsystem: seeded once per Maze from MazeSystem._enterMaze,
 * ticked from MazeSystem.update while the player is inside. All state lives
 * on the mazeInterior, so it goes when the Maze does.
 *
 * Gated on zone depth ≥ MAZE_TRAP_MIN_DEPTH (the same depth read as the
 * Maze's loot table). Below it a Maze has no Wellspring and no traps.
 *
 * Wellspring: the open cell furthest from the entrance, by BFS along the
 * corridors. Every dead end is a solid tomb, so it's the open cell beside the
 * furthest tomb. A Torch (♨) lies there.
 */

const CS = GRID.CELL_SIZE;

export const MAZE_TRAP_MIN_DEPTH = 6;

export class MazeTrapSystem {
  constructor(game) {
    this.game = game;
  }

  /** Seed the traps into a freshly generated (and now entered) Maze. */
  seed(mi, depth) {
    if (depth < MAZE_TRAP_MIN_DEPTH) return;
    mi.wellspring = this._findWellspring(mi);
    if (mi.wellspring) this._spawnWellspringTorch(mi.wellspring);
  }

  // Furthest open room cell from the entrance (the player's spawn cell).
  // Room cells sit on odd coordinates; the open cells between them are the
  // carved passages. A Maze Torch fixture's cell is skipped so the Torch
  // never lies under one.
  _findWellspring(mi) {
    const startCol = Math.round(mi.spawnPoint.x / CS);
    const startRow = Math.round(mi.spawnPoint.y / CS);
    const fixtureCells = new Set(mi.torches.map(t => `${t.row},${t.col}`));
    let best = null;
    for (const cell of bfsOrder(mi.collisionMap, startCol, startRow)) {
      if (cell.col % 2 !== 1 || cell.row % 2 !== 1) continue;
      if (fixtureCells.has(`${cell.row},${cell.col}`)) continue;
      if (!best || cell.dist > best.dist) best = cell;
    }
    return best ? { col: best.col, row: best.row } : null;
  }

  // The Torch is Maze-plane loot like a tomb's drop, but it isn't part of
  // the Maze's clear condition (MazeSystem._checkMazeCleared skips
  // `wellspringTorch`): Spectacles never wait on it.
  _spawnWellspringTorch(cell) {
    const { game } = this;
    const torch = new Item('♨', cell.col * CS, cell.row * CS);
    torch.mazePlane = true;
    torch.wellspringTorch = true;
    game.items.push(torch);
    game.physicsSystem.addEntity(torch);
  }
}
