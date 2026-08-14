import { GRID } from '../game/GameConfig.js';
import { BackgroundObject } from '../entities/BackgroundObject.js';
import { Enemy } from '../entities/Enemy.js';
import { Item } from '../entities/Item.js';
import { getZoneRandomEnemy } from '../data/enemies.js';
import { applyZoneCombatModifiers } from '../data/zones.js';
import {
  pickRandomTemplateName, applyTemplateToCollisionMap, getTemplateWaterCells,
  getTemplateSpawnCells, getReservedFootprintCells, paintDescentVisual, paintStairsUpVisual,
  STAIRS_COL, STAIRS_UP_ROW, NORTH_ROW, SPINE_ROW, WEST_COL, EAST_COL, EXIT_ROW,
} from '../data/dungeonFloorTemplates.js';
import { getLegendOfThree } from '../data/legendOfThree.js';

/**
 * DungeonFloorGenerator — content for every dungeon floor and side room
 * (6-floor rework, plan Phase 0). DungeonSystem owns lifecycle (enter/exit/
 * ascend/descend, input dispatch); this file owns what gets built.
 *
 * Floor map (see plan):
 *   index0 Entrance  — 1 active descent (North → index1)
 *   index1 Corridor  — 2 active descents (North + West, both → index2)
 *   index2 Branch    — 3 active descents: North → Trap Room (always open),
 *                       West → Key Vault (locked until the skull key is
 *                       spent), East → Companion Gate (inert without a
 *                       companion; DungeonPuzzleSystem re-polls each tick)
 *   index3 Pyramid   — Legend of Three, reached only via the Companion Gate.
 *                       Terminal floor for this build (no floor 5/6 content
 *                       yet — see docs/adr/BACKLOG.md); solving it drops a
 *                       reward directly rather than unlocking a further
 *                       descent, so there is no stub floor to walk into.
 *
 * Side rooms (Trap Room / Key Vault / Companion Gate) are stored on
 * game.dungeonFloors by string key, not numeric index — InteriorManager.reset()
 * clears them for free by replacing the whole array reference.
 */

const INTERIOR_COLS = 24;
const INTERIOR_ROWS = 24;

// Trap Room reward — reassigned from the old floor-2 tier-3 weapon drop
// (Phase 0 deleted REWARD_BY_FLOOR; plan Phase 2.1).
const TRAP_ROOM_REWARD_POOL = ['⚔', '⚒', '☼'];

// Key Vault reward — picked from the existing rare item pool (delegated to
// implementation by the plan). Homing Bow fits a "guarded vault" payoff
// without new item data.
const KEY_VAULT_REWARD = 'ᛟ';

export class DungeonFloorGenerator {
  constructor(game) {
    this.game = game;
  }

  // ── Shared scaffold ────────────────────────────────────────────────────
  // Border + template walls + water channels. Every numbered floor and side
  // room builds on this; only footprint placement, enemy density and reward
  // content differ per room kind. useTemplate:false skips wall generation
  // for rooms whose puzzle assumes a clean playfield (Pyramid). extraReservedCells
  // lets a room protect its own fixed-position content (e.g. Companion Gate's
  // switches) from ever getting a template wall stamped on top of it, the same
  // way the 4 staircase footprints are protected.
  _buildScaffold({ useTemplate = true, extraReservedCells = [] } = {}) {
    const cols = INTERIOR_COLS;
    const rows = INTERIOR_ROWS;
    const collisionMap = [];
    for (let r = 0; r < rows; r++) {
      collisionMap[r] = [];
      for (let c = 0; c < cols; c++) {
        collisionMap[r][c] = (r === 0 || r === rows - 1 || c === 0 || c === cols - 1);
      }
    }

    const reservedCells = [...getReservedFootprintCells(), ...extraReservedCells];
    let templateName = null;
    if (useTemplate) {
      // Excludes templates already used elsewhere this dungeon visit, so no
      // layout repeats within a single dungeon until every named template
      // has appeared once (game.dungeonTemplatesUsedThisRun, reset by
      // InteriorManager.reset() alongside the other run-scoped dungeon flags).
      const used = this.game.dungeonTemplatesUsedThisRun
        ?? (this.game.dungeonTemplatesUsedThisRun = new Set());
      templateName = pickRandomTemplateName(used);
      used.add(templateName);
      applyTemplateToCollisionMap(collisionMap, templateName, reservedCells);
    }

    const backgroundObjects = [];
    let spawnCells = [];
    if (templateName) {
      for (const { row, col } of getTemplateWaterCells(templateName, reservedCells)) {
        if (collisionMap[row]?.[col]) continue;
        backgroundObjects.push(new BackgroundObject('~', col * GRID.CELL_SIZE, row * GRID.CELL_SIZE));
      }
      // Author-marked enemy spawn points ('E' in the template grid) — optional;
      // _spawnEnemies() prefers these before falling back to pickOpenCell's
      // randomness, so a template with none behaves exactly as before this existed.
      spawnCells = getTemplateSpawnCells(templateName, reservedCells)
        .filter(({ row, col }) => !collisionMap[row]?.[col]);
    }

    // Random open cell (not a wall, not a reserved footprint cell, not
    // already holding a background object). Used for decor/enemy/skull
    // placement so templates never trap entities or bury the staircases.
    const pickOpenCell = (minRow, maxRow, minCol, maxCol) => {
      for (let attempt = 0; attempt < 20; attempt++) {
        const r = minRow + Math.floor(Math.random() * (maxRow - minRow + 1));
        const c = minCol + Math.floor(Math.random() * (maxCol - minCol + 1));
        if (collisionMap[r]?.[c]) continue;
        if (reservedCells.some(cell => cell.row === r && cell.col === c)) continue;
        const x = c * GRID.CELL_SIZE;
        const y = r * GRID.CELL_SIZE;
        if (backgroundObjects.some(o => o.position.x === x && o.position.y === y)) continue;
        return { row: r, col: c };
      }
      return null;
    };

    return { cols, rows, collisionMap, backgroundObjects, pickOpenCell, spawnCells };
  }

  // Fisher-Yates — used to consume template-authored spawn points in random
  // order rather than always filling them top-to-bottom / left-to-right.
  _shuffled(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  _addDecor(backgroundObjects, pickOpenCell, rows, cols) {
    const decorChars = ['8', '0', '*', '8'];
    const decorCount = 5 + Math.floor(Math.random() * 5);
    for (let i = 0; i < decorCount; i++) {
      const cell = pickOpenCell(6, rows - 5, 2, cols - 3);
      if (!cell) continue;
      const char = decorChars[Math.floor(Math.random() * decorChars.length)];
      backgroundObjects.push(new BackgroundObject(char, cell.col * GRID.CELL_SIZE, cell.row * GRID.CELL_SIZE));
    }
  }

  _spawnEnemies(count, depth, zone, { collisionMap, backgroundObjects, pickOpenCell, rows, cols, spawnCells }) {
    const enemies = [];
    // Author-marked spots (template 'E' cells) go first, shuffled so a
    // template with more marks than the room's enemy count doesn't always
    // fill the same subset; once exhausted, fall back to pickOpenCell's
    // full-random placement — the pre-existing behavior for every template
    // that has no 'E' marks at all.
    const pool = this._shuffled(spawnCells || []);
    for (let i = 0; i < count; i++) {
      const enemyChar = getZoneRandomEnemy(depth, zone);
      if (!enemyChar) continue;
      const cell = pool.length ? pool.pop() : pickOpenCell(7, rows - 5, 3, cols - 4);
      if (!cell) continue;
      const enemy = new Enemy(enemyChar, cell.col * GRID.CELL_SIZE, cell.row * GRID.CELL_SIZE, depth);
      enemy.setCollisionMap(collisionMap);
      enemy.setBackgroundObjects(backgroundObjects);
      applyZoneCombatModifiers(enemy, zone);
      enemies.push(enemy);
    }
    return enemies;
  }

  _makeViewport(cols, rows) {
    const interiorPxW = cols * GRID.CELL_SIZE;
    const interiorPxH = rows * GRID.CELL_SIZE;
    return {
      offsetX: Math.floor((GRID.WIDTH  - interiorPxW) / 2),
      offsetY: Math.floor((GRID.HEIGHT - interiorPxH) / 2),
      gridCols: cols,
      gridRows: rows,
      cellSize: GRID.CELL_SIZE,
    };
  }

  _makeStairsUp(locked) {
    const obj = new BackgroundObject('{', STAIRS_COL * GRID.CELL_SIZE, STAIRS_UP_ROW * GRID.CELL_SIZE);
    paintStairsUpVisual(obj, locked);
    return obj;
  }

  _makeDescent(id, row, col, { active, locked, destination }) {
    const obj = new BackgroundObject('x', col * GRID.CELL_SIZE, row * GRID.CELL_SIZE);
    paintDescentVisual(obj, { active, locked });
    return { id, row, col, obj, active, locked, destination };
  }

  // One key-carrying bone pile ('8', the existing Bones background object —
  // NOT a bespoke glyph; 'Ω' was already claimed by the hut Cauldron, see
  // resolved-bugs.md) per dungeon visit — floor chosen at entry
  // (game.dungeonKeySkullFloor, see DungeonSystem._enterDungeon). Only
  // placed while the key hasn't already been obtained or spent this run. It
  // renders identically to ordinary Bones decor — dropsDungeonKey (set on
  // the instance, mirrors obj.dropsKey's K-room pattern) is what makes THIS
  // one grant the key on destruction, same "which one is it?" find as the K
  // room's vault key.
  _placeSkullIfDue(floorIndex, { backgroundObjects, pickOpenCell, rows, cols }) {
    const game = this.game;
    if (game.dungeonKeyObtainedThisRun || game.dungeonKeyUsedThisRun) return;
    if (game.dungeonKeySkullFloor !== floorIndex) return;
    const cell = pickOpenCell(6, rows - 5, 3, cols - 4);
    if (!cell) return;
    const skull = new BackgroundObject('8', cell.col * GRID.CELL_SIZE, cell.row * GRID.CELL_SIZE);
    skull.dropsDungeonKey = true;
    backgroundObjects.push(skull);
  }

  // ── Numbered floors (0-3) ──────────────────────────────────────────────

  generateFloor(floorIndex, depth) {
    const zone = this.game.currentRoom?.zone || 'gray';
    switch (floorIndex) {
      case 0: return this._generateEntrance(depth, zone);
      case 1: return this._generateCorridor(depth, zone);
      case 2: return this._generateBranch(depth, zone);
      case 3: return this._generatePyramid(depth, zone);
      default: return null;
    }
  }

  _generateEntrance(depth, zone) {
    const { cols, rows, collisionMap, backgroundObjects, pickOpenCell, spawnCells } = this._buildScaffold();
    this._addDecor(backgroundObjects, pickOpenCell, rows, cols);
    this._placeSkullIfDue(0, { backgroundObjects, pickOpenCell, rows, cols });

    backgroundObjects.push(new BackgroundObject('∩', STAIRS_COL * GRID.CELL_SIZE, EXIT_ROW * GRID.CELL_SIZE));

    const north = this._makeDescent('north', NORTH_ROW, STAIRS_COL, {
      active: true, locked: false, destination: { kind: 'numbered', floorIndex: 1 },
    });
    const west = this._makeDescent('west', SPINE_ROW, WEST_COL, { active: false, locked: false, destination: null });
    const east = this._makeDescent('east', SPINE_ROW, EAST_COL, { active: false, locked: false, destination: null });
    backgroundObjects.push(north.obj, west.obj, east.obj);

    const enemies = this._spawnEnemies(2 + Math.floor(Math.random() * 3), depth, zone,
      { collisionMap, backgroundObjects, pickOpenCell, rows, cols, spawnCells });

    return {
      type: 'DUNGEON_FLOOR',
      roomKind: 'numbered',
      floorIndex: 0,
      displayLabel: '[ DUNGEON  FLOOR 1 ]',
      gridCols: cols, gridRows: rows, collisionMap, backgroundObjects, enemies,
      items: [], ingredients: [], npcs: [], doors: [],
      viewport: this._makeViewport(cols, rows),
      exitRow: EXIT_ROW, exitCol: STAIRS_COL,
      stairsUpRow: null, stairsUpCol: null, stairsUpObj: null, stairsUpLocked: false, ascendTo: null,
      descents: [north, west, east],
    };
  }

  _generateCorridor(depth, zone) {
    const { cols, rows, collisionMap, backgroundObjects, pickOpenCell, spawnCells } = this._buildScaffold();
    this._addDecor(backgroundObjects, pickOpenCell, rows, cols);
    this._placeSkullIfDue(1, { backgroundObjects, pickOpenCell, rows, cols });

    const stairsUpObj = this._makeStairsUp(false);
    backgroundObjects.push(stairsUpObj);

    const north = this._makeDescent('north', NORTH_ROW, STAIRS_COL, {
      active: true, locked: false, destination: { kind: 'numbered', floorIndex: 2 },
    });
    const west = this._makeDescent('west', SPINE_ROW, WEST_COL, {
      active: true, locked: false, destination: { kind: 'numbered', floorIndex: 2 },
    });
    const east = this._makeDescent('east', SPINE_ROW, EAST_COL, { active: false, locked: false, destination: null });
    backgroundObjects.push(north.obj, west.obj, east.obj);

    const enemies = this._spawnEnemies(3 + Math.floor(Math.random() * 3), depth, zone,
      { collisionMap, backgroundObjects, pickOpenCell, rows, cols, spawnCells });

    return {
      type: 'DUNGEON_FLOOR',
      roomKind: 'numbered',
      floorIndex: 1,
      displayLabel: '[ DUNGEON  FLOOR 2 ]',
      gridCols: cols, gridRows: rows, collisionMap, backgroundObjects, enemies,
      items: [], ingredients: [], npcs: [], doors: [],
      viewport: this._makeViewport(cols, rows),
      exitRow: null, exitCol: null,
      stairsUpRow: STAIRS_UP_ROW, stairsUpCol: STAIRS_COL, stairsUpObj, stairsUpLocked: false,
      ascendTo: { kind: 'numbered', floorIndex: 0 },
      descents: [north, west, east],
    };
  }

  _generateBranch(depth, zone) {
    const { cols, rows, collisionMap, backgroundObjects, pickOpenCell, spawnCells } = this._buildScaffold();
    this._addDecor(backgroundObjects, pickOpenCell, rows, cols);
    this._placeSkullIfDue(2, { backgroundObjects, pickOpenCell, rows, cols });

    const stairsUpObj = this._makeStairsUp(false);
    backgroundObjects.push(stairsUpObj);

    // North → Trap Room, always open.
    const north = this._makeDescent('north', NORTH_ROW, STAIRS_COL, {
      active: true, locked: false, destination: { kind: 'side', key: 'trapRoom' },
    });
    // West → Key Vault, locked until the skull key is spent (DungeonPuzzleSystem).
    const west = this._makeDescent('west', SPINE_ROW, WEST_COL, {
      active: true, locked: true, destination: { kind: 'side', key: 'keyVault' },
    });
    // East → Companion Gate. Inert (not locked — gate visibility, not
    // solvability) without a companion; DungeonPuzzleSystem re-polls
    // game.companion every tick so recruiting one mid-visit reveals it.
    const east = this._makeDescent('east', SPINE_ROW, EAST_COL, {
      active: !!this.game.companion, locked: false, destination: { kind: 'side', key: 'companionGate' },
    });
    backgroundObjects.push(north.obj, west.obj, east.obj);

    const enemies = this._spawnEnemies(4 + Math.floor(Math.random() * 3), depth, zone,
      { collisionMap, backgroundObjects, pickOpenCell, rows, cols, spawnCells });

    return {
      type: 'DUNGEON_FLOOR',
      roomKind: 'numbered',
      floorIndex: 2,
      displayLabel: '[ DUNGEON  FLOOR 3 ]',
      gridCols: cols, gridRows: rows, collisionMap, backgroundObjects, enemies,
      items: [], ingredients: [], npcs: [], doors: [],
      viewport: this._makeViewport(cols, rows),
      exitRow: null, exitCol: null,
      stairsUpRow: STAIRS_UP_ROW, stairsUpCol: STAIRS_COL, stairsUpObj, stairsUpLocked: false,
      ascendTo: { kind: 'numbered', floorIndex: 1 },
      descents: [north, west, east],
    };
  }

  _generatePyramid(depth, zone) {
    // Static edifice — zero enemies (plan Phase 3), bare playfield.
    const { cols, rows, collisionMap, backgroundObjects } = this._buildScaffold({ useTemplate: false });

    const stairsUpObj = this._makeStairsUp(false);
    backgroundObjects.push(stairsUpObj);

    // Legend of Three slots — top (Justice), bottom-left (Truth), bottom-right (Help).
    const legend = getLegendOfThree(zone);
    const slotDefs = [
      { key: 'justice', row: 8,  col: STAIRS_COL,      itemType: 'consumable' },
      { key: 'truth',   row: 14, col: STAIRS_COL - 4,  itemType: 'weapon' },
      { key: 'help',    row: 14, col: STAIRS_COL + 4,  itemType: 'weapon' },
    ];
    const pyramidSlots = {};
    for (const def of slotDefs) {
      const requiredChar = legend ? legend[def.key] : null;
      const slotObj = new BackgroundObject('□', def.col * GRID.CELL_SIZE, def.row * GRID.CELL_SIZE);
      slotObj.color = '#555555';
      slotObj.animationColor = '#555555';
      slotObj.indestructible = true;
      backgroundObjects.push(slotObj);
      pyramidSlots[def.key] = {
        row: def.row, col: def.col, obj: slotObj,
        requiredChar, itemType: def.itemType, filled: !requiredChar,
      };
    }

    return {
      type: 'DUNGEON_FLOOR',
      roomKind: 'numbered',
      floorIndex: 3,
      displayLabel: '[ DUNGEON  FLOOR 4 ]',
      gridCols: cols, gridRows: rows, collisionMap, backgroundObjects, enemies: [],
      items: [], ingredients: [], npcs: [], doors: [],
      viewport: this._makeViewport(cols, rows),
      exitRow: null, exitCol: null,
      stairsUpRow: STAIRS_UP_ROW, stairsUpCol: STAIRS_COL, stairsUpObj, stairsUpLocked: false,
      ascendTo: { kind: 'side', key: 'companionGate' },
      descents: [], // terminal floor for this build — see file header
      pyramidSlots,
      // Only zones with real legendOfThree.js content are solvable; unauthored
      // zones get a dormant/inert pyramid (same shape as puzzles.js's
      // DORMANT_PUZZLE) rather than an instantly-"solved" or crashing floor.
      legendAuthored: !!legend,
      puzzleSolved: false,
    };
  }

  // ── Side rooms ──────────────────────────────────────────────────────────
  // Stored on game.dungeonFloors by string key (not numeric index) — see
  // file header. originFloorIndex is always the Branch floor (index2) today;
  // threaded through rather than hardcoded so a future branch elsewhere in
  // the tree doesn't require touching these generators.

  generateTrapRoom(depth, originFloorIndex) {
    const zone = this.game.currentRoom?.zone || 'gray';
    const { cols, rows, collisionMap, backgroundObjects, pickOpenCell, spawnCells } = this._buildScaffold();

    // Locked exit until every enemy is cleared — same "all-N-cleared" shape
    // as MazeSystem._checkMazeCleared. DungeonPuzzleSystem unlocks it.
    const stairsUpObj = this._makeStairsUp(true);
    backgroundObjects.push(stairsUpObj);

    const enemies = this._spawnEnemies(5 + Math.floor(Math.random() * 3), depth, zone,
      { collisionMap, backgroundObjects, pickOpenCell, rows, cols, spawnCells });

    const rewardChar = TRAP_ROOM_REWARD_POOL[Math.floor(Math.random() * TRAP_ROOM_REWARD_POOL.length)];
    const rewardItem = Object.assign(
      new Item(rewardChar, STAIRS_COL * GRID.CELL_SIZE, SPINE_ROW * GRID.CELL_SIZE),
      { hutPlane: true }
    );

    return {
      type: 'DUNGEON_FLOOR',
      roomKind: 'trapRoom',
      floorIndex: null,
      displayLabel: '[ DUNGEON  TRAP ROOM ]',
      gridCols: cols, gridRows: rows, collisionMap, backgroundObjects, enemies,
      items: [rewardItem], ingredients: [], npcs: [], doors: [],
      viewport: this._makeViewport(cols, rows),
      exitRow: null, exitCol: null,
      stairsUpRow: STAIRS_UP_ROW, stairsUpCol: STAIRS_COL, stairsUpObj, stairsUpLocked: true,
      ascendTo: { kind: 'numbered', floorIndex: originFloorIndex },
      descents: [],
    };
  }

  generateKeyVault(depth, originFloorIndex) {
    const zone = this.game.currentRoom?.zone || 'gray';
    const { cols, rows, collisionMap, backgroundObjects, pickOpenCell, spawnCells } = this._buildScaffold();

    // Always-open exit — the lock lives on the Branch floor's West descent,
    // not here (plan Phase 2.2).
    const stairsUpObj = this._makeStairsUp(false);
    backgroundObjects.push(stairsUpObj);

    const enemies = this._spawnEnemies(2 + Math.floor(Math.random() * 2), depth, zone,
      { collisionMap, backgroundObjects, pickOpenCell, rows, cols, spawnCells });

    const rewardChar = this.game.dungeonRareItemObtainedThisRun ? null : KEY_VAULT_REWARD;
    const rewardItem = rewardChar
      ? Object.assign(new Item(rewardChar, STAIRS_COL * GRID.CELL_SIZE, SPINE_ROW * GRID.CELL_SIZE), { hutPlane: true })
      : null;

    return {
      type: 'DUNGEON_FLOOR',
      roomKind: 'keyVault',
      floorIndex: null,
      displayLabel: '[ DUNGEON  KEY VAULT ]',
      gridCols: cols, gridRows: rows, collisionMap, backgroundObjects, enemies,
      items: rewardItem ? [rewardItem] : [], ingredients: [], npcs: [], doors: [],
      viewport: this._makeViewport(cols, rows),
      exitRow: null, exitCol: null,
      stairsUpRow: STAIRS_UP_ROW, stairsUpCol: STAIRS_COL, stairsUpObj, stairsUpLocked: false,
      ascendTo: { kind: 'numbered', floorIndex: originFloorIndex },
      descents: [],
    };
  }

  generateCompanionGate(depth, originFloorIndex) {
    const SWITCH_ROW = 11;
    const SWITCH_A_COL = 7;
    const SWITCH_B_COL = 17;
    // Routed through the shared templates like every other room (dungeon
    // editor follow-up — this used to be a hardcoded bare box the editor
    // had no effect on). The two switch cells are reserved the same way the
    // 4 staircase footprints are, so a template's walls/water can never land
    // on top of them regardless of which one gets picked.
    const { cols, rows, collisionMap, backgroundObjects } = this._buildScaffold({
      extraReservedCells: [{ row: SWITCH_ROW, col: SWITCH_A_COL }, { row: SWITCH_ROW, col: SWITCH_B_COL }],
    });

    const stairsUpObj = this._makeStairsUp(false);
    backgroundObjects.push(stairsUpObj);

    const switchAObj = new BackgroundObject('○', SWITCH_A_COL * GRID.CELL_SIZE, SWITCH_ROW * GRID.CELL_SIZE);
    switchAObj.color = '#888888';
    switchAObj.animationChar = '○';
    switchAObj.animationColor = '#888888';
    switchAObj.isPressed = false;
    backgroundObjects.push(switchAObj);

    const switchBObj = new BackgroundObject('○', SWITCH_B_COL * GRID.CELL_SIZE, SWITCH_ROW * GRID.CELL_SIZE);
    switchBObj.color = '#888888';
    switchBObj.animationChar = '○';
    switchBObj.animationColor = '#888888';
    switchBObj.isPressed = false;
    backgroundObjects.push(switchBObj);

    // Onward descent to the Legend of Three pyramid — locked until the
    // switch puzzle is solved (DungeonPuzzleSystem).
    const onward = this._makeDescent('north', NORTH_ROW, STAIRS_COL, {
      active: true, locked: true, destination: { kind: 'numbered', floorIndex: 3 },
    });
    backgroundObjects.push(onward.obj);

    return {
      type: 'DUNGEON_FLOOR',
      roomKind: 'companionGate',
      floorIndex: null,
      displayLabel: '[ DUNGEON  GATE ]',
      gridCols: cols, gridRows: rows, collisionMap, backgroundObjects, enemies: [],
      items: [], ingredients: [], npcs: [], doors: [],
      viewport: this._makeViewport(cols, rows),
      exitRow: null, exitCol: null,
      stairsUpRow: STAIRS_UP_ROW, stairsUpCol: STAIRS_COL, stairsUpObj, stairsUpLocked: false,
      ascendTo: { kind: 'numbered', floorIndex: originFloorIndex },
      descents: [onward],
      switchAObj, switchBObj, puzzleSolved: false,
    };
  }
}
