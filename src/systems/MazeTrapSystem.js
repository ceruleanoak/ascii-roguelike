import { GRID } from '../game/GameConfig.js';
import { Item } from '../entities/Item.js';
import { BackgroundObject } from '../entities/BackgroundObject.js';
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
 *
 * Flood Panels: dark floor cells (revealed in torch light — MazeInteriorOverlay)
 * that each fire once when the player walks onto one; a dodge roll passes over
 * without firing. The first opens the Wellspring; each later one multiplies
 * the flood's rate. The flood always rises at the Wellspring, never at the
 * panel, and spreads cell by cell along the corridors (a BFS order fixed at
 * seed time) until the Maze is full. Each flooded cell is a deep-water
 * BackgroundObject in mazeInterior.backgroundObjects, so drowning, wet pips,
 * DOUSED and the Lantern all come from the shared physics pipeline. A Maze
 * Torch fixture on a flooded cell is snuffed for good, as a Ghost's touch
 * snuffs it: deep water destroys torches.
 */

const CS = GRID.CELL_SIZE;

export const MAZE_TRAP_MIN_DEPTH = 6;

const FLOOD_PANEL_COUNT    = 3;
const FLOOD_PANEL_MIN_DIST = 4;    // corridor steps from the entrance — not underfoot on arrival
const FLOOD_BASE_RATE      = 2;    // cells flooded per second once the Wellspring opens
const FLOOD_RATE_MULT      = 1.75; // each later Flood Panel multiplies the rate

class FloodPanel {
  constructor(col, row) {
    this.col = col;
    this.row = row;
    this.triggered = false;
  }
}

export class MazeTrapSystem {
  constructor(game) {
    this.game = game;
  }

  /** Seed the traps into a freshly generated (and now entered) Maze. */
  seed(mi, depth) {
    if (depth < MAZE_TRAP_MIN_DEPTH) return;
    mi.wellspring = this._findWellspring(mi);
    if (!mi.wellspring) return;
    this._spawnWellspringTorch(mi.wellspring);
    mi.floodPanels = this._placeFloodPanels(mi);
    mi.flood = { open: false, rate: 0, progress: 0, next: 0, order: this._floodOrder(mi) };
  }

  update(mi, dt) {
    if (!mi.wellspring) return;
    this._checkFloodPanels(mi);
    this._spreadFlood(mi, dt);
  }

  // ─── Flood Panels ──────────────────────────────────────────────────────

  // Random open cells at least FLOOD_PANEL_MIN_DIST steps in, never the
  // Wellspring or a fixture's cell.
  _placeFloodPanels(mi) {
    const startCol = Math.round(mi.spawnPoint.x / CS);
    const startRow = Math.round(mi.spawnPoint.y / CS);
    const blocked = new Set(mi.torches.map(t => `${t.row},${t.col}`));
    blocked.add(`${mi.wellspring.row},${mi.wellspring.col}`);
    const candidates = bfsOrder(mi.collisionMap, startCol, startRow)
      .filter(c => c.dist >= FLOOD_PANEL_MIN_DIST && !blocked.has(`${c.row},${c.col}`));
    const panels = [];
    while (panels.length < FLOOD_PANEL_COUNT && candidates.length > 0) {
      const [cell] = candidates.splice(Math.floor(Math.random() * candidates.length), 1);
      panels.push(new FloodPanel(cell.col, cell.row));
    }
    return panels;
  }

  _checkFloodPanels(mi) {
    const player = this.game.player;
    if (player.dodgeRoll?.active) return; // a roll passes over a panel
    const col = Math.floor((player.position.x + CS / 2) / CS);
    const row = Math.floor((player.position.y + CS / 2) / CS);
    for (const panel of mi.floodPanels) {
      if (panel.triggered || panel.col !== col || panel.row !== row) continue;
      panel.triggered = true;
      const { flood } = mi;
      if (flood.open) {
        flood.rate *= FLOOD_RATE_MULT;
      } else {
        flood.open = true;
        flood.rate = FLOOD_BASE_RATE;
      }
      this.game.audioSystem?.playSFX('maze_flood_panel');
    }
  }

  // ─── Flood ─────────────────────────────────────────────────────────────

  // Every cell the water can reach from the Wellspring, nearest first: open
  // corridor cells and tomb cells (a tomb stands in the water and can still
  // be broken), never walls and never the exit gap in the outer wall.
  _floodOrder(mi) {
    const tombCells = new Set(mi.mazeObjects.map(o => `${o.row},${o.col}`));
    const lastRow = mi.gridRows - 1;
    const passable = (col, row) => row < lastRow
      && (!mi.collisionMap[row][col] || tombCells.has(`${row},${col}`));
    return bfsOrder(mi.collisionMap, mi.wellspring.col, mi.wellspring.row, passable);
  }

  _spreadFlood(mi, dt) {
    const { flood } = mi;
    if (!flood.open || flood.next >= flood.order.length) return;
    flood.progress += flood.rate * dt;
    while (flood.progress >= 1 && flood.next < flood.order.length) {
      flood.progress -= 1;
      this._floodCell(mi, flood.order[flood.next++]);
    }
  }

  _floodCell(mi, { col, row }) {
    mi.backgroundObjects.push(new BackgroundObject('~', col * CS, row * CS, { deepWater: true }));
    for (const torch of mi.torches) {
      if (torch.destroyed || torch.col !== col || torch.row !== row) continue;
      torch.destroyed = true;
      torch.lit = false;
    }
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
