import { GRID } from '../game/GameConfig.js';
import { Item } from '../entities/Item.js';
import { BackgroundObject } from '../entities/BackgroundObject.js';
import { Enemy } from '../entities/Enemy.js';
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
 *
 * Rat Nests: one or two per Maze, each set into a wall cell that divides two
 * corridors. A nest is a wall to the player, the Ghosts and the flood, and a
 * passage to the rats: Maze Rats walk mazeInterior.ratCollisionMap, the
 * Maze's collision map with every standing nest opened, so their BFS runs
 * through nests as shortcuts between the two corridors. A nest shakes while
 * the player stands within RAT_NEST_RADIUS of it, from either side; staying
 * RAT_NEST_LINGER seconds releases RAT_NEST_BROOD Maze Rats, once (walking
 * away resets the count). SPACE chips it like a tomb (MazeSystem's
 * interaction hit); broken, it is plain wall to everything, rats included.
 * The rats are real Enemies in mazeInterior.enemies, ticked by the shared
 * enemy pipeline; they swim, so the flood doesn't drown them.
 */

const CS = GRID.CELL_SIZE;

export const MAZE_TRAP_MIN_DEPTH = 6;

const FLOOD_PANEL_COUNT    = 3;
const FLOOD_PANEL_MIN_DIST = 4;    // corridor steps from the entrance — not underfoot on arrival
const FLOOD_BASE_RATE      = 2;    // cells flooded per second once the Wellspring opens
const FLOOD_RATE_MULT      = 1.75; // each later Flood Panel multiplies the rate

const RAT_NEST_MAX    = 2;
const RAT_NEST_RADIUS = CS * 2;  // player-centre to nest-centre: it shakes inside this
export const RAT_NEST_LINGER = 3;       // seconds inside the radius before it releases
const RAT_NEST_BROOD  = 3;       // Maze Rats released
const RAT_NEST_HP     = 3;       // SPACE hits to break one (a tomb takes 3)
const MAZE_RAT_CHAR   = '7';     // ENEMIES key of the Maze Rat

class FloodPanel {
  constructor(col, row) {
    this.col = col;
    this.row = row;
    this.triggered = false;
  }
}

class RatNest {
  constructor(col, row) {
    this.col = col;
    this.row = row;
    this.linger = 0;      // seconds the player has stood inside the radius
    this.released = false;
    this.hp = RAT_NEST_HP;
    this.maxHp = RAT_NEST_HP;
    this.hitFlash = 0;
    this.hitCooldown = 0;
    this.destroyed = false;
  }

  get shaking() {
    return !this.destroyed && !this.released && this.linger > 0;
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
    mi.ratNests = this._placeRatNests(mi);
    mi.ratCollisionMap = mi.collisionMap.map(row => row.slice());
    for (const nest of mi.ratNests) mi.ratCollisionMap[nest.row][nest.col] = false;
    mi.trapDepth = depth;
  }

  update(mi, dt) {
    if (!mi.wellspring) return;
    this._checkFloodPanels(mi);
    this._spreadFlood(mi, dt);
    this._updateRatNests(mi, dt);
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

  // ─── Rat Nests ─────────────────────────────────────────────────────────

  // Wall cells dividing two corridors: open on two opposite sides, solid on
  // the other two, never the outer wall or a tomb. Both corridor sides sit at
  // least FLOOD_PANEL_MIN_DIST steps in, and neither is a fixture's cell, the
  // Wellspring or a Flood Panel.
  _placeRatNests(mi) {
    const startCol = Math.round(mi.spawnPoint.x / CS);
    const startRow = Math.round(mi.spawnPoint.y / CS);
    const map = mi.collisionMap;
    const dist = new Map(bfsOrder(map, startCol, startRow).map(c => [`${c.row},${c.col}`, c.dist]));
    const blocked = new Set(mi.torches.map(t => `${t.row},${t.col}`));
    blocked.add(`${mi.wellspring.row},${mi.wellspring.col}`);
    for (const panel of mi.floodPanels) blocked.add(`${panel.row},${panel.col}`);
    const tombCells = new Set(mi.mazeObjects.map(o => `${o.row},${o.col}`));
    const side = (col, row) => {
      const key = `${row},${col}`;
      return map[row]?.[col] === false && (dist.get(key) ?? 0) >= FLOOD_PANEL_MIN_DIST && !blocked.has(key);
    };
    const candidates = [];
    for (let row = 1; row < mi.gridRows - 1; row++) {
      for (let col = 1; col < mi.gridCols - 1; col++) {
        if (!map[row][col] || tombCells.has(`${row},${col}`)) continue;
        const across = side(col - 1, row) && side(col + 1, row) && map[row - 1][col] && map[row + 1][col];
        const down   = side(col, row - 1) && side(col, row + 1) && map[row][col - 1] && map[row][col + 1];
        if (across || down) candidates.push({ col, row });
      }
    }
    const count = 1 + Math.floor(Math.random() * RAT_NEST_MAX);
    const nests = [];
    while (nests.length < count && candidates.length > 0) {
      const [cell] = candidates.splice(Math.floor(Math.random() * candidates.length), 1);
      nests.push(new RatNest(cell.col, cell.row));
    }
    return nests;
  }

  _updateRatNests(mi, dt) {
    const player = this.game.player;
    const px = player.position.x + CS / 2;
    const py = player.position.y + CS / 2;
    for (const nest of mi.ratNests) {
      if (nest.destroyed) continue;
      nest.hitFlash = Math.max(0, nest.hitFlash - dt);
      nest.hitCooldown = Math.max(0, nest.hitCooldown - dt);
      if (nest.released) continue;
      const near = Math.hypot(nest.col * CS + CS / 2 - px, nest.row * CS + CS / 2 - py) <= RAT_NEST_RADIUS;
      nest.linger = near ? nest.linger + dt : 0;
      if (nest.linger >= RAT_NEST_LINGER) this._releaseRats(mi, nest);
    }
  }

  // The brood comes out of the nest onto it and the rat-walkable cells
  // nearest it, never the player's own cell.
  _releaseRats(mi, nest) {
    const { game } = this;
    nest.released = true;
    nest.linger = 0;
    const player = game.player;
    const playerKey = `${Math.floor((player.position.y + CS / 2) / CS)},${Math.floor((player.position.x + CS / 2) / CS)}`;
    const cells = bfsOrder(mi.ratCollisionMap, nest.col, nest.row)
      .filter(c => `${c.row},${c.col}` !== playerKey)
      .slice(0, RAT_NEST_BROOD);
    for (let i = 0; i < RAT_NEST_BROOD; i++) {
      const cell = cells[i % cells.length] ?? nest;
      const rat = new Enemy(MAZE_RAT_CHAR, cell.col * CS, cell.row * CS, mi.trapDepth);
      rat.setCollisionMap(mi.ratCollisionMap);
      rat.setBackgroundObjects(mi.backgroundObjects); // layer-guard-ok: the Maze's own list
      mi.enemies.push(rat);
      game.physicsSystem.addEntity(rat);
    }
    game.audioSystem?.playSFX('maze_rat_nest');
  }

  /** Standing Rat Nests within reach of (px, py) — MazeSystem's SPACE hit. */
  nestsInReach(mi, px, py, reach) {
    return (mi.ratNests ?? []).filter(nest => !nest.destroyed
      && Math.hypot(nest.col * CS + CS / 2 - px, nest.row * CS + CS / 2 - py) < reach);
  }

  /** One SPACE chip on a nest; the last one closes it into wall for good. */
  hitRatNest(mi, nest) {
    nest.hp--;
    nest.hitFlash = 0.12;
    nest.hitCooldown = 0.2;
    this.game.audioSystem?.playSFX('hit');
    if (nest.hp > 0) return;
    nest.destroyed = true;
    nest.linger = 0;
    mi.ratCollisionMap[nest.row][nest.col] = true;
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
