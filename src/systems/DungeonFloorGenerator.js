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
import { pickWeaponTutorial } from '../data/dungeon/weaponTutorials.js';
import {
  applyPuzzleTemplateToCollisionMap, getPuzzleTemplateWaterCells,
  getPuzzleTemplateExitCell, getPuzzleTemplateTriggers,
} from '../data/dungeonPuzzleTemplates.js';

/**
 * DungeonFloorGenerator — content for every dungeon floor and side room
 * (6-floor rework, plan Phase 0). DungeonSystem owns lifecycle (enter/exit/
 * ascend/descend, input dispatch); this file owns what gets built.
 *
 * Floor map (see plan):
 *   index0 Entrance  — 1 active descent (North → index1)
 *   index1 Corridor  — North → Whip Trial (unlocked, weapon-tutorial side
 *                       room), West → index2 (locked until the skull key is
 *                       spent) — a quick low-tier grab vs. a real key-gated
 *                       choice to delve deeper, rather than two identical doors.
 *   index2 Branch    — North → Trap Room (enemy gauntlet, always open, tier-2
 *                       reward on clear), West retired (inactive, no
 *                       destination — reaching Branch at all is the payoff
 *                       for spending the key), East → Companion Gate (inert
 *                       without a companion; DungeonPuzzleSystem re-polls
 *                       each tick)
 *   index3 Pyramid   — Legend of Three, reached only via the Companion Gate.
 *                       Terminal floor for this build (no floor 5/6 content
 *                       yet — see docs/adr/BACKLOG.md); solving it drops a
 *                       reward directly rather than unlocking a further
 *                       descent, so there is no stub floor to walk into.
 *
 * Side rooms (Whip Trial / Trap Room / Companion Gate) are stored on
 * game.dungeonFloors by string key, not numeric index — InteriorManager.reset()
 * clears them for free by replacing the whole array reference.
 */

const INTERIOR_COLS = 24;
const INTERIOR_ROWS = 24;

// Trap Room reward pool — tier-2 weapons, spanning 3 melee subtypes + one
// bow (mirrors the pre-Whip-Trial pool's type variety). This is the payoff
// for clearing the gauntlet; easy to swap, not load-bearing on any other system.
const TRAP_ROOM_REWARD_POOL = ['‡', '⟘', '↟', '⟩']; // Flame Sword, Maul, Venom Lance, Fire Bow

// Whip Trial's two switches — how long each stays "struck" after a hit
// before reverting, absent a re-strike. Lives here (not DungeonPuzzleSystem)
// because it's authored per-switch data (neutralizeSeconds), same as any
// editor-built puzzle room's timed triggers — see generatePuzzleRoom below
// and DungeonPuzzleSystem._advanceTrigger, the shared state machine both
// this value and editor-authored triggers run through. Short rather than 0
// ("instant") so a genuinely simultaneous two-post crack still counts, per
// the room's intended solve — but still reads as "very fast", not lenient.
const WHIP_TRIAL_STRUCK_WINDOW = 0.25; // seconds

export class DungeonFloorGenerator {
  constructor(game) {
    this.game = game;
  }

  // ── Shared scaffold ────────────────────────────────────────────────────
  // Border + template walls + water channels. Every numbered floor and side
  // room builds on this; only footprint placement, enemy density and reward
  // content differ per room kind. useTemplate:false skips wall generation
  // for rooms whose puzzle assumes a clean playfield (Pyramid, Whip Trial,
  // Companion Gate — the latter's straight-line-only companion pathing
  // can't tolerate a template wall between its two switches; see
  // generateCompanionGate). extraReservedCells lets a room protect its own
  // fixed-position content from ever getting a template wall stamped on top
  // of it, the same way the 4 staircase footprints are protected — no
  // current caller needs it, but it stays available for a future templated
  // room with fixed interior content.
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

  // BFS-reachable interior cells from (startRow, startCol), 4-connected,
  // treating any collisionMap-true cell as blocked. Unlike pickOpenCell
  // (which only checks "not a wall"), this guarantees true graph
  // reachability — needed because the Staircase footprint contract
  // deliberately reserves only single cells, not a connecting corridor, so a
  // template's walls/water may legally cut off a whole region (see the
  // contract note in dungeonFloorTemplates.js). Used to keep fixed-position
  // reward content out of a walled-off pocket the player can never reach.
  _reachableCells(collisionMap, rows, cols, startRow, startCol) {
    const visited = new Set();
    if (collisionMap[startRow]?.[startCol]) return visited;
    const key = (r, c) => `${r},${c}`;
    const queue = [[startRow, startCol]];
    visited.add(key(startRow, startCol));
    while (queue.length) {
      const [r, c] = queue.shift();
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nr = r + dr, nc = c + dc;
        if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
        if (collisionMap[nr]?.[nc]) continue;
        const k = key(nr, nc);
        if (visited.has(k)) continue;
        visited.add(k);
        queue.push([nr, nc]);
      }
    }
    return visited;
  }

  // Random cell within bounds that's reachable (per _reachableCells),
  // walkable, not a reserved footprint, and not already holding a background
  // object. Falls back to the BFS start cell if nothing in bounds qualifies
  // (last resort — keeps the caller from ever placing content that's
  // provably unreachable).
  _pickReachableCell(reachable, collisionMap, backgroundObjects, reservedCells, minRow, maxRow, minCol, maxCol, startRow, startCol) {
    const candidates = [];
    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        if (!reachable.has(`${r},${c}`)) continue;
        if (collisionMap[r]?.[c]) continue;
        if (reservedCells.some(cell => cell.row === r && cell.col === c)) continue;
        const x = c * GRID.CELL_SIZE, y = r * GRID.CELL_SIZE;
        if (backgroundObjects.some(o => o.position.x === x && o.position.y === y)) continue;
        candidates.push({ row: r, col: c });
      }
    }
    if (candidates.length === 0) return { row: startRow, col: startCol };
    return candidates[Math.floor(Math.random() * candidates.length)];
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

  // row/col default to the universal north-side up-stairs position — the
  // right choice for every floor entered via a 'north' descent (Corridor,
  // Trap Room, Pyramid). A floor entered via 'west' or 'east' must pass the
  // matching footprint instead, so its up-stairs sits in the same room
  // position as the descent that led there (see _generateBranch,
  // generateCompanionGate) — "matching doors are always in the same room
  // position" is the rule; the universal north point is just its default.
  _makeStairsUp(locked, row = STAIRS_UP_ROW, col = STAIRS_COL) {
    const obj = new BackgroundObject('{', col * GRID.CELL_SIZE, row * GRID.CELL_SIZE);
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
  // room's vault key. keyChar is the real Item it spawns on destruction
  // (InteractionSystem.handleObjectEffect) — '⚿', distinct from the '8'
  // decor char so the held item itself reads as a key, not a bone.
  _placeSkullIfDue(floorIndex, { backgroundObjects, pickOpenCell, rows, cols }) {
    const game = this.game;
    if (game.inventorySystem.hasKeyItem('⚿') || game.dungeonKeyUsedThisRun) return;
    if (game.dungeonKeySkullFloor !== floorIndex) return;
    const cell = pickOpenCell(6, rows - 5, 3, cols - 4);
    if (!cell) return;
    const skull = new BackgroundObject('8', cell.col * GRID.CELL_SIZE, cell.row * GRID.CELL_SIZE);
    skull.dropsDungeonKey = true;
    skull.keyChar = '⚿';
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

    // North → Whip Trial, unlocked. Quick low-tier grab: teaches the Whip's
    // reach and hands over a real weapon without demanding the skull key.
    const north = this._makeDescent('north', NORTH_ROW, STAIRS_COL, {
      active: true, locked: false, destination: { kind: 'side', key: 'whipTrial' },
    });
    // West → Branch, locked until the skull key is spent (DungeonPuzzleSystem).
    // The real choice this floor offers: quick grab vs. deeper delving.
    const west = this._makeDescent('west', SPINE_ROW, WEST_COL, {
      active: true, locked: true, destination: { kind: 'numbered', floorIndex: 2 },
    });
    const east = this._makeDescent('east', SPINE_ROW, EAST_COL, { active: false, locked: false, destination: null });
    backgroundObjects.push(north.obj, west.obj, east.obj);

    const enemies = this._spawnEnemies(3 + Math.floor(Math.random() * 3), depth, zone,
      { collisionMap, backgroundObjects, pickOpenCell, rows, cols, spawnCells });

    return {
      type: 'DUNGEON_FLOOR',
      roomKind: 'numbered',
      floorIndex: 1,
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
    // No _placeSkullIfDue here — the skull key now only rolls onto Entrance
    // or Corridor (dungeonKeySkullFloor ∈ {0,1}), since it gates the door
    // *into* Branch and can't be found past its own lock.

    // Branch is entered via Corridor's West descent (the skull key), not the
    // universal north point — its up-stairs sits at the West footprint to
    // match, so the door you came through is the door you leave through (the
    // "matching doors are always in the same room position" rule). The old
    // Key Vault this footprint used to gate is gone, so there's no longer a
    // separate retired 'west' descent object competing for the same cell.
    const stairsUpObj = this._makeStairsUp(false, SPINE_ROW, WEST_COL);
    backgroundObjects.push(stairsUpObj);

    // North → Trap Room, always open — sealed enemy gauntlet, tier-2 reward
    // on clear (real risk room; reaching Branch at all was the key-gated cost).
    const north = this._makeDescent('north', NORTH_ROW, STAIRS_COL, {
      active: true, locked: false, destination: { kind: 'side', key: 'trapRoom' },
    });
    // East → Companion Gate, always visible — matches the pre-rework 5-floor
    // system, where the two switches sat unconditionally in the open on
    // floor 2 (bug #209 git-archaeology: `SWITCH_A_COL`/`SWITCH_B_COL` on the
    // bare 'open' layout, always rendered regardless of companion). Only
    // *solving* the puzzle needs a companion
    // (DungeonPuzzleSystem._updateCompanionGate); a solo player can walk in,
    // see both switches sitting there, and read the puzzle before recruiting
    // anyone — the same "visible landmark, brain does the rest" contract the
    // non-instructive-UI rule expects. The room used to be gated invisible
    // until a companion was already recruited, which hid the puzzle's very
    // existence — that was the actual defect behind the "pressure plates are
    // nowhere to be seen" report, not the dispatch-stickiness fix (#205)
    // alone.
    const east = this._makeDescent('east', SPINE_ROW, EAST_COL, {
      active: true, locked: false, destination: { kind: 'side', key: 'companionGate' },
    });
    backgroundObjects.push(north.obj, east.obj);

    const enemies = this._spawnEnemies(4 + Math.floor(Math.random() * 3), depth, zone,
      { collisionMap, backgroundObjects, pickOpenCell, rows, cols, spawnCells });

    return {
      type: 'DUNGEON_FLOOR',
      roomKind: 'numbered',
      floorIndex: 2,
      gridCols: cols, gridRows: rows, collisionMap, backgroundObjects, enemies,
      items: [], ingredients: [], npcs: [], doors: [],
      viewport: this._makeViewport(cols, rows),
      exitRow: null, exitCol: null,
      stairsUpRow: SPINE_ROW, stairsUpCol: WEST_COL, stairsUpObj, stairsUpLocked: false,
      ascendTo: { kind: 'numbered', floorIndex: 1 },
      descents: [north, east],
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
  // file header. originFloorIndex varies by room: Whip Trial's origin is
  // Corridor (index1), Trap Room's and Companion Gate's are Branch (index2).
  // Always threaded through as a parameter rather than hardcoded, so a
  // future branch elsewhere in the tree doesn't require touching these
  // generators.

  // Whip Trial — first entry in the Weapon Trial registry (weaponTutorials.js).
  // Teaches the Whip's actual utility (longest reach in the game) rather
  // than handing it over as a stat upgrade: a recipe pedestal shows what the
  // room is about, then a gap only the Whip's reach can bridge (via a
  // hook-post pull) leads to two switches struck simultaneously by one
  // straight-line crack. One-way by design: the entrance (north) has no
  // ascend fixture at all — the only way out is the stairsUp south of the
  // switches, reachable only after crossing and solving. See the plan doc
  // for the full geometry rationale.
  generateWhipTrial(depth, originFloorIndex) {
    const CS = GRID.CELL_SIZE;
    const { cols, rows, collisionMap, backgroundObjects } = this._buildScaffold({ useTemplate: false });

    // Fixed spine-column geometry — no template walls/water to fight around
    // a room this precisely laid out (Pyramid's "clean playfield" mode).
    const PEDESTAL_ROW = 7;
    const GAP_ROW_START = 14;
    const GAP_ROW_END = 16;
    const POST_NORTH_ROW = 13; // north bank — also where the player naturally stands to strike the south post
    const POST_SOUTH_ROW = 17; // south bank — also the switches' row (see below)
    const SWITCH_ROW = POST_SOUTH_ROW;
    const SWITCH_A_COL = STAIRS_COL + 2;
    const SWITCH_B_COL = STAIRS_COL + 4;
    const SOUTH_STAIRS_ROW = 22; // real ascend point — deliberately not the entry row (see header comment)

    // Impassable band spanning the full interior width — must cover every
    // column or the player just walks around it.
    for (let r = GAP_ROW_START; r <= GAP_ROW_END; r++) {
      for (let c = 1; c < cols - 1; c++) collisionMap[r][c] = true;
    }

    // No stairsUp fixture at the entry (north) end — entering via the Branch
    // floor's north descent just lands the player in the room (DungeonSystem's
    // landing-anchor logic), it doesn't drop them on an ascend trigger. The
    // only functioning stairsUp is south of the switches (below), locked
    // until the puzzle is solved.
    const stairsUpObj = new BackgroundObject('{', STAIRS_COL * CS, SOUTH_STAIRS_ROW * CS);
    paintStairsUpVisual(stairsUpObj, true);
    backgroundObjects.push(stairsUpObj);

    // Recipe pedestal — a real, pickup-able weapon flanked by grayed
    // decorative ingredient glyphs. The glyphs are drawn directly by
    // HutInteriorOverlay (weaponPedestal below), not as BackgroundObjects:
    // '~' is real interactive water in BACKGROUND_OBJECTS, so a decorative
    // instance would behave like actual water rather than inert chrome.
    const tutorial = pickWeaponTutorial();
    const weaponItem = Object.assign(
      new Item(tutorial.weaponChar, STAIRS_COL * CS, PEDESTAL_ROW * CS),
      { hutPlane: true }
    );
    // Slot geometry mirrors CraftingStation's shared-divider bracket technique
    // (3 slots, 2-col pitch — each slot is '[' + content + ']', and adjacent
    // slots' touching ']'+'[' land on the same column so the later draw wins,
    // reading as one continuous [x][x][x] frame). Center slot's content column
    // is STAIRS_COL — the real weapon Item's existing x-position, unchanged.
    const weaponPedestal = {
      row: PEDESTAL_ROW,
      leftX: STAIRS_COL - 3, centerX: STAIRS_COL - 1, rightX: STAIRS_COL + 1,
      leftChar: tutorial.recipe.left, rightChar: tutorial.recipe.right,
    };

    // Hook posts — one on each bank of the gap, mirrored. Each is strictly
    // one-directional: striking a post pulls the player to *that post's own
    // position* (DungeonPuzzleSystem reads post.position directly, no
    // separate target data needed). The south post is the intended crossing
    // — required to ever reach the switches. The north post is a pure
    // non-softlock safety valve: nothing in the intended path needs it
    // (the exit is south of the gap, not back at the entrance), but a player
    // who crosses without finishing can always strike it to re-cross back
    // rather than get stuck on the far bank. puzzleSignal so a hit never
    // destroys either post, just pulses glitterHit for one tick.
    // '•' (bullet) — prominent, round, human-readable at a glance; distinct
    // from the switches' ○/● pair so "pull fixture" vs. "strike fixture"
    // read as different symbol families. Unregistered in BACKGROUND_OBJECTS,
    // so BackgroundObject's constructor falls back to synthetic data with
    // indestructible:true, hp:null (src/entities/BackgroundObject.js's
    // unregistered-char branch). takeDamage() checks
    // `this.indestructible || this.hp === null` BEFORE it ever reaches the
    // puzzleSignal/glitterHit branch, so that fallback would silently eat
    // every strike. Registered catalog entries (e.g. '0' Rock, which
    // Listening Stones use — PuzzleSystem.js) default to destructible with
    // real hp, which is why that precedent didn't need this override.
    // minAttackSegment gates on CombatSystem's collision check: the post
    // sits at the player's own natural standing cell, so without this ANY
    // swing (even the near segments) would trigger it by accident — only
    // the whip's farthest 2 of 5 segments (its actual reach) should count.
    const postNorthObj = new BackgroundObject('•', STAIRS_COL * CS, POST_NORTH_ROW * CS);
    postNorthObj.color = '#ddaa55';
    postNorthObj.animationChar = '•';
    postNorthObj.animationColor = '#ddaa55';
    postNorthObj.puzzleSignal = true;
    postNorthObj.indestructible = false;
    postNorthObj.hp = 1;
    postNorthObj.maxHp = 1;
    postNorthObj.minAttackSegment = 4;
    backgroundObjects.push(postNorthObj);

    const postSouthObj = new BackgroundObject('•', STAIRS_COL * CS, POST_SOUTH_ROW * CS);
    postSouthObj.color = '#ddaa55';
    postSouthObj.animationChar = '•';
    postSouthObj.animationColor = '#ddaa55';
    postSouthObj.puzzleSignal = true;
    postSouthObj.indestructible = false;
    postSouthObj.hp = 1;
    postSouthObj.maxHp = 1;
    postSouthObj.minAttackSegment = 4;
    backgroundObjects.push(postSouthObj);

    // Switches — same ○/● glyph language as the Companion Gate, but strike-
    // based (puzzleSignal + glitterHit) rather than occupancy-based. Placed
    // 2/4 cells east of the south post on its own row (horizontal align, not
    // vertical — a player standing at the post-landing spot faces east and
    // one crack hits both at once), matching the Whip's 5 straight-line
    // hitbox segments.
    // Same unregistered-char indestructible-fallback override as the posts
    // above — '○' isn't in BACKGROUND_OBJECTS either (Companion Gate's
    // switches of the same glyph never hit this path since they're
    // occupancy-based and never call takeDamage()).
    // kind/activation/neutralizeSeconds/active/_timer are the generic
    // trigger fields DungeonPuzzleSystem._advanceTrigger drives — the same
    // shared state machine an editor-built Puzzle Room's switches/panels
    // run through (generatePuzzleRoom below). 'timed' with a short window
    // rather than 'permanent': a strike needs to STAY registered only long
    // enough for the other switch to also be struck, not forever off one hit.
    const switchAObj = new BackgroundObject('○', SWITCH_A_COL * CS, SWITCH_ROW * CS);
    switchAObj.color = '#888888';
    switchAObj.animationChar = '○';
    switchAObj.animationColor = '#888888';
    switchAObj.puzzleSignal = true;
    switchAObj.indestructible = false;
    switchAObj.hp = 1;
    switchAObj.maxHp = 1;
    switchAObj.kind = 'switch';
    switchAObj.activation = 'timed';
    switchAObj.neutralizeSeconds = WHIP_TRIAL_STRUCK_WINDOW;
    switchAObj.active = false;
    switchAObj._timer = 0;
    backgroundObjects.push(switchAObj);

    const switchBObj = new BackgroundObject('○', SWITCH_B_COL * CS, SWITCH_ROW * CS);
    switchBObj.color = '#888888';
    switchBObj.animationChar = '○';
    switchBObj.animationColor = '#888888';
    switchBObj.puzzleSignal = true;
    switchBObj.indestructible = false;
    switchBObj.hp = 1;
    switchBObj.maxHp = 1;
    switchBObj.kind = 'switch';
    switchBObj.activation = 'timed';
    switchBObj.neutralizeSeconds = WHIP_TRIAL_STRUCK_WINDOW;
    switchBObj.active = false;
    switchBObj._timer = 0;
    backgroundObjects.push(switchBObj);

    return {
      type: 'DUNGEON_FLOOR',
      roomKind: 'whipTrial',
      floorIndex: null,
      gridCols: cols, gridRows: rows, collisionMap, backgroundObjects, enemies: [],
      items: [weaponItem], ingredients: [], npcs: [], doors: [],
      viewport: this._makeViewport(cols, rows),
      exitRow: null, exitCol: null,
      stairsUpRow: SOUTH_STAIRS_ROW, stairsUpCol: STAIRS_COL, stairsUpObj, stairsUpLocked: true,
      ascendTo: { kind: 'numbered', floorIndex: originFloorIndex },
      descents: [],
      // Consulted by HutInteriorOverlay's wall-tile renderer to draw the gap
      // as a chasm (edge glyphs on the boundary rows, true void between)
      // instead of an ordinary solid wall — the collisionMap band itself is
      // still full solid rows (see above), this is rendering-only metadata.
      gapBand: { rowStart: GAP_ROW_START, rowEnd: GAP_ROW_END },
      weaponPedestal, postNorthObj, postSouthObj, switchAObj, switchBObj, puzzleSolved: false,
    };
  }

  // Trap Room — sealed enemy gauntlet. Exit stays locked until every enemy
  // is cleared (same "all-N-cleared" shape as MazeSystem._checkMazeCleared;
  // DungeonPuzzleSystem unlocks it), rewarding a tier-2 weapon on clear.
  // Reintroduces the pre-Whip-Trial trapRoom shape (see git history, commit
  // 4429455) now that 'trapRoom' names this room instead.
  generateTrapRoom(depth, originFloorIndex) {
    const zone = this.game.currentRoom?.zone || 'gray';
    const { cols, rows, collisionMap, backgroundObjects, pickOpenCell, spawnCells } = this._buildScaffold();

    // Locked exit until every enemy is cleared — DungeonPuzzleSystem unlocks it.
    const stairsUpObj = this._makeStairsUp(true);
    backgroundObjects.push(stairsUpObj);

    const enemies = this._spawnEnemies(5 + Math.floor(Math.random() * 3), depth, zone,
      { collisionMap, backgroundObjects, pickOpenCell, rows, cols, spawnCells });

    // Reward must be reachable from the room's entry point (the up-stairs the
    // player spawns beside on descent into this side room) — templates are
    // free to wall off regions elsewhere, so a fixed (STAIRS_COL, SPINE_ROW)
    // coordinate could land inside a sealed pocket (e.g. a walled-off water
    // pool). Bug report: reward spawned unreachable in exactly that shape.
    const reachable = this._reachableCells(collisionMap, rows, cols, STAIRS_UP_ROW, STAIRS_COL);
    const rewardCell = this._pickReachableCell(
      reachable, collisionMap, backgroundObjects, getReservedFootprintCells(),
      6, rows - 5, 3, cols - 4, STAIRS_UP_ROW, STAIRS_COL
    );
    const rewardChar = TRAP_ROOM_REWARD_POOL[Math.floor(Math.random() * TRAP_ROOM_REWARD_POOL.length)];
    const rewardItem = Object.assign(
      new Item(rewardChar, rewardCell.col * GRID.CELL_SIZE, rewardCell.row * GRID.CELL_SIZE),
      { hutPlane: true }
    );

    return {
      type: 'DUNGEON_FLOOR',
      roomKind: 'trapRoom',
      floorIndex: null,
      gridCols: cols, gridRows: rows, collisionMap, backgroundObjects, enemies,
      items: [rewardItem], ingredients: [], npcs: [], doors: [],
      viewport: this._makeViewport(cols, rows),
      exitRow: null, exitCol: null,
      stairsUpRow: STAIRS_UP_ROW, stairsUpCol: STAIRS_COL, stairsUpObj, stairsUpLocked: true,
      ascendTo: { kind: 'numbered', floorIndex: originFloorIndex },
      descents: [],
    };
  }

  generateCompanionGate(depth, originFloorIndex) {
    const SWITCH_ROW = 11;
    const SWITCH_A_COL = 7;
    const SWITCH_B_COL = 17;
    // Bare layout — the switch puzzle assumes a clean playfield. The
    // companion's dispatch-to-switch movement (DungeonPuzzleSystem.
    // _updateCompanionGate → CampNPCSystem._moveToTarget) is a straight-line
    // walk with no pathfinding, so the two switches (10 cols apart on the
    // same row) must always be reachable in a straight line — a shared wall
    // template can't guarantee that (its reservation contract only keeps the
    // switch cells themselves open, not a connecting corridor; see
    // dungeonFloorTemplates.js's file header). This room briefly used the
    // shared templates (commit 4429455, "template Companion Gate") for
    // visual variety, which silently broke the autonomous companion walk on
    // any template with a wall between the switches — reverted here.
    const { cols, rows, collisionMap, backgroundObjects } = this._buildScaffold({ useTemplate: false });

    // Entered via Branch's East descent, so the up-stairs sits at the East
    // footprint to match (same "matching doors" rule as Branch's own West
    // up-stairs above) rather than the universal north point.
    const stairsUpObj = this._makeStairsUp(false, SPINE_ROW, EAST_COL);
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
      gridCols: cols, gridRows: rows, collisionMap, backgroundObjects, enemies: [],
      items: [], ingredients: [], npcs: [], doors: [],
      viewport: this._makeViewport(cols, rows),
      exitRow: null, exitCol: null,
      stairsUpRow: SPINE_ROW, stairsUpCol: EAST_COL, stairsUpObj, stairsUpLocked: false,
      ascendTo: { kind: 'numbered', floorIndex: originFloorIndex },
      descents: [onward],
      switchAObj, switchBObj, puzzleSolved: false,
    };
  }

  // Puzzle Room — generic template-driven puzzle side room, authored via
  // tools/dungeon-editor/'s Puzzle mode rather than hand-coded geometry
  // (contrast Whip Trial/Trap Room/Companion Gate above, each a bespoke,
  // fully hardcoded layout). A template supplies its own wall/water/exit
  // layout and any number of switches/panels (dungeonPuzzleTemplates.js);
  // this method just instantiates that data as a live floor. No numbered
  // floor or side-room key currently routes a descent to a Puzzle Room —
  // this is authoring + generation infrastructure, ready for a future
  // content decision to wire a specific template into the dungeon graph
  // (call this with an explicit templateName from wherever that's decided).
  //
  // Exit unlock rule: every trigger in the template must be active at once
  // (DungeonPuzzleSystem._updatePuzzleRoom) — the generalized form of the
  // Whip Trial's "both switches struck together" and Companion Gate's "both
  // switches pressed together" rules, extended to any trigger count/mix.
  generatePuzzleRoom(templateName, depth, originFloorIndex) {
    const CS = GRID.CELL_SIZE;
    const { cols, rows, collisionMap, backgroundObjects } = this._buildScaffold({ useTemplate: false });

    applyPuzzleTemplateToCollisionMap(collisionMap, templateName);

    for (const { row, col } of getPuzzleTemplateWaterCells(templateName)) {
      if (collisionMap[row]?.[col]) continue;
      backgroundObjects.push(new BackgroundObject('~', col * CS, row * CS));
    }

    const exitCell = getPuzzleTemplateExitCell(templateName);
    const exitRow = exitCell?.row ?? STAIRS_UP_ROW;
    const exitCol = exitCell?.col ?? STAIRS_COL;
    const stairsUpObj = new BackgroundObject('{', exitCol * CS, exitRow * CS);
    paintStairsUpVisual(stairsUpObj, true);
    backgroundObjects.push(stairsUpObj);

    // Trigger fixtures — 'switch' reuses the Whip Trial's strike contract
    // (puzzleSignal + glitterHit, indestructible override so a hit never
    // destroys it, just pulses); 'panel' is occupancy-only and needs no
    // override at all — its char is unregistered in BACKGROUND_OBJECTS, so
    // BackgroundObject's constructor already falls back to
    // indestructible:true/hp:null (see generateWhipTrial's post/switch
    // comments for the full mechanism), which is exactly right for a
    // floor panel: nothing should ever be able to attack it.
    const triggers = [];
    for (const t of getPuzzleTemplateTriggers(templateName)) {
      const isSwitch = t.kind === 'switch';
      const char = isSwitch ? '○' : '▭';
      const obj = new BackgroundObject(char, t.col * CS, t.row * CS);
      obj.color = '#888888';
      obj.animationChar = char;
      obj.animationColor = '#888888';
      if (isSwitch) {
        obj.puzzleSignal = true;
        obj.indestructible = false;
        obj.hp = 1;
        obj.maxHp = 1;
      }
      obj.kind = t.kind;
      obj.activation = t.activation;
      obj.neutralizeSeconds = t.neutralizeSeconds;
      obj.active = false;
      obj._timer = 0;
      backgroundObjects.push(obj);
      triggers.push(obj);
    }

    return {
      type: 'DUNGEON_FLOOR',
      roomKind: 'puzzleRoom',
      floorIndex: null,
      gridCols: cols, gridRows: rows, collisionMap, backgroundObjects, enemies: [],
      items: [], ingredients: [], npcs: [], doors: [],
      viewport: this._makeViewport(cols, rows),
      exitRow: null, exitCol: null,
      stairsUpRow: exitRow, stairsUpCol: exitCol, stairsUpObj, stairsUpLocked: true,
      ascendTo: { kind: 'numbered', floorIndex: originFloorIndex },
      descents: [],
      triggers, puzzleSolved: false,
    };
  }
}
