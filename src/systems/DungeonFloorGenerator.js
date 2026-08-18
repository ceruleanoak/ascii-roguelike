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

    const stairsUpObj = this._makeStairsUp(false);
    backgroundObjects.push(stairsUpObj);

    // North → Trap Room, always open — sealed enemy gauntlet, tier-2 reward
    // on clear (real risk room; reaching Branch at all was the key-gated cost).
    const north = this._makeDescent('north', NORTH_ROW, STAIRS_COL, {
      active: true, locked: false, destination: { kind: 'side', key: 'trapRoom' },
    });
    // West retired — the Key Vault it used to gate is gone; Corridor's West
    // descent (the skull key) now gates entry into Branch itself.
    const west = this._makeDescent('west', SPINE_ROW, WEST_COL, { active: false, locked: false, destination: null });
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
    const POST_SOUTH_ROW = 17; // south bank
    const SWITCH_A_ROW = 19;
    const SWITCH_B_ROW = 21;
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
    // 2/4 cells south of the south post, matching the Whip's 5 straight-line
    // hitbox segments — one southward crack from the post-landing spot hits
    // both at once.
    // Same unregistered-char indestructible-fallback override as the posts
    // above — '○' isn't in BACKGROUND_OBJECTS either (Companion Gate's
    // switches of the same glyph never hit this path since they're
    // occupancy-based and never call takeDamage()).
    const switchAObj = new BackgroundObject('○', STAIRS_COL * CS, SWITCH_A_ROW * CS);
    switchAObj.color = '#888888';
    switchAObj.animationChar = '○';
    switchAObj.animationColor = '#888888';
    switchAObj.puzzleSignal = true;
    switchAObj.indestructible = false;
    switchAObj.hp = 1;
    switchAObj.maxHp = 1;
    switchAObj.recentlyStruck = false;
    switchAObj._struckTimer = 0;
    backgroundObjects.push(switchAObj);

    const switchBObj = new BackgroundObject('○', STAIRS_COL * CS, SWITCH_B_ROW * CS);
    switchBObj.color = '#888888';
    switchBObj.animationChar = '○';
    switchBObj.animationColor = '#888888';
    switchBObj.puzzleSignal = true;
    switchBObj.indestructible = false;
    switchBObj.hp = 1;
    switchBObj.maxHp = 1;
    switchBObj.recentlyStruck = false;
    switchBObj._struckTimer = 0;
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

    const rewardChar = TRAP_ROOM_REWARD_POOL[Math.floor(Math.random() * TRAP_ROOM_REWARD_POOL.length)];
    const rewardItem = Object.assign(
      new Item(rewardChar, STAIRS_COL * GRID.CELL_SIZE, SPINE_ROW * GRID.CELL_SIZE),
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
