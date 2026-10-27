import { GRID } from '../game/GameConfig.js';
import { BackgroundObject } from '../entities/BackgroundObject.js';
import { setTriggerVisual } from './triggerMachine.js';
import { placeTemplateFixtures } from './dungeonFixtures.js';
import { Enemy } from '../entities/Enemy.js';
import { Item } from '../entities/Item.js';
import { BOMB_BAG_CHAR } from './BombBagSystem.js';
import { SIMPLE_KEY_CHAR } from '../data/items.js';
import { getZoneRandomEnemy } from '../data/enemies.js';
import { applyZoneCombatModifiers } from '../data/zones.js';
import {
  pickRandomTemplateName, applyTemplateToCollisionMap, getTemplateWaterCells, getTemplateBombableCells,
  getTemplateCellsWithGlyph, getTemplateSpawners, getTemplateData,
  getTemplateSpawnCells, getReservedFootprintCells, paintDescentVisual, paintStairsUpVisual,
  STAIRS_COL, STAIRS_UP_ROW, EXIT_ROW,
} from '../data/dungeonFloorTemplates.js';
import { getLegendOfThree } from '../data/legendOfThree.js';
import { SLOT_CHROME } from '../data/slotChrome.js';
import { pickWeaponTutorial } from '../data/dungeon/weaponTutorials.js';
import {
  getPuzzleTemplate, applyPuzzleTemplateToCollisionMap, getPuzzleTemplateWaterCells,
  getPuzzleTemplateBombableCells, getPuzzleTemplateExitCell, getPuzzleTemplatePedestal, getPuzzleTemplateDais,
  getPuzzleTemplateCellsWithGlyph, getPuzzleTemplateSpawners, isPuzzleTemplateProven,
} from '../data/dungeonPuzzleTemplates.js';
import { pickUnspawnedItem, markItemSpawned } from './spawnedItems.js';
import { hasKeyItem } from './keyItems.js';
import FOOTPRINT_CONTRACT from '../data/dungeon/footprintContract.json';
import { footprintCellFor, DIAGONAL_DIRS } from '../data/dungeon/footprints.js';
import { FLOOR_KINDS } from './dungeonFloorKinds.js';
import { edgesFrom, edgeInto, DESCENT_ID_FOR } from './dungeonGraphBuilder.js';

/**
 * DungeonFloorGenerator — content for every dungeon floor and side room
 * (6-floor rework, plan Phase 0). DungeonSystem owns lifecycle (enter/exit/
 * ascend/descend, input dispatch); this file owns what gets built.
 *
 * Which floors exist and where each descent leads is no longer this file's
 * call: the visit's Dungeon Graph (interiorState.graph, rolled by
 * DungeonSystem.rollVisit from the zone's Dungeon Recipe) names every floor
 * as a node with a Floor Kind, and every descent as an edge with a footprint
 * direction and a Reveal. generateNode() looks the node's kind up in
 * FLOOR_KINDS and hands the generator a ctx:
 *
 *   { nodeId, node, depth, zone, edges (descents leaving it), upFrom }
 *
 * Each kind builds its own content (Entrance's ∩ door, Branch's panels, the
 * Pyramid's Legend of Three Slots, the Vault's bare boss arena, the Trap
 * Room's gauntlet, a Puzzle Room's template) and lays its descents from
 * ctx.edges through _makeGraphDescents. A descent starts locked unless its
 * Reveal is 'open'; DungeonPuzzleSystem.revealEdges opens it when the floor
 * emits that Reveal (the panels, the offering, a spent Skull Key).
 *
 * Every floor is stored on interiorState.floors under its node id.
 */

const INTERIOR_COLS = 24;
const INTERIOR_ROWS = 24;

// Trap Room reward pool — tier-2 weapons, spanning 3 melee subtypes + one
// bow (mirrors the pre-Whip-Trial pool's type variety). This is the payoff
// for clearing the gauntlet; easy to swap, not load-bearing on any other system.
// The Vault keeps its up-stairs at the top of the room, where every other
// floor's up-stairs sat before they moved to the South footprint: the
// Hoardmaw's whole encounter (DungeonBossSystem SPAWN_ROW, its wake line, the
// hoard and the sealed south door) is laid out for a player who walks in from
// the north. The Vault uses no template, so the reserved South footprint
// costs it nothing.
const VAULT_STAIRS_UP_ROW = 3;
const TRAP_ROOM_REWARD_POOL = ['‡', '⟘', 'ⲯ', '⇒']; // Flame Sword, Maul, Trident, Sky Bow

// Branch's companion-panel puzzle — position mirrors the pre-rework 5-floor
// system's SWITCH_ROW/SWITCH_A_COL/SWITCH_B_COL (git-archaeology, bug #209).
// Row 11 sits one cell off SPINE_ROW (12) so it doesn't collide with the
// West/East footprints on that row; columns 7/17 clear both WEST_COL (4) and
// EAST_COL (19) with room to spare for the straight-line companion walk
// between them (see _generateBranch's bare-layout comment for why that walk
// must never cross a wall).
const BRANCH_PANEL_ROW = 11;
const BRANCH_PANEL_A_COL = 7;
const BRANCH_PANEL_B_COL = 17;

export class DungeonFloorGenerator {
  constructor(game) {
    this.game = game;
  }

  // ── Shared scaffold ────────────────────────────────────────────────────
  // Border + template walls + water channels. Every numbered floor and side
  // room builds on this; only footprint placement, enemy density and reward
  // content differ per room kind. useTemplate:false skips wall generation
  // for rooms whose puzzle assumes a clean playfield (Pyramid, Whip Trial,
  // Branch — the latter's straight-line-only companion pathing between its
  // two switches can't tolerate a template wall; see _generateBranch).
  // extraReservedCells lets a room protect its own fixed-position content
  // from ever getting a template wall stamped on top
  // of it, the same way the 4 staircase footprints are protected — no
  // current caller needs it, but it stays available for a future templated
  // room with fixed interior content.
  // depth/zone are what the floor's Spawn Vents spawn at — only templated
  // floors can hold one, so untemplated callers may leave them out.
  // `diagonals`: the NW/NE footprints this floor's Hidden Descents sit on —
  // kept clear, and the template drawn from those proven to keep them
  // reachable (bare scaffold when no template can).
  // `wantsTriggers`: the floor has a descent behind its 'triggers' Reveal.
  _buildScaffold({ useTemplate = true, extraReservedCells = [], depth = 1, zone = 'gray', diagonals = [], wantsTriggers = false } = {}) {
    const cols = INTERIOR_COLS;
    const rows = INTERIOR_ROWS;
    const collisionMap = [];
    for (let r = 0; r < rows; r++) {
      collisionMap[r] = [];
      for (let c = 0; c < cols; c++) {
        collisionMap[r][c] = (r === 0 || r === rows - 1 || c === 0 || c === cols - 1);
      }
    }

    const reservedCells = [...getReservedFootprintCells(diagonals), ...extraReservedCells];
    let templateName = null;
    if (useTemplate) {
      // Excludes templates already used elsewhere this dungeon visit, so no
      // layout repeats within a single dungeon until every named template
      // has appeared once (templatesUsed on the D-room's interiorState, so it
      // lives and dies with the Dungeon itself).
      const used = this.game.dungeonSystem.interiorState.templatesUsed;
      // A floor with a descent behind its 'triggers' Reveal draws from the
      // templates whose triggers can all be solved; when none fits, any
      // template will do and generateNode falls those descents back to 'clear'.
      templateName = (wantsTriggers && pickRandomTemplateName(used, diagonals, { triggers: true }))
        || pickRandomTemplateName(used, diagonals);
      if (templateName) {
        used.add(templateName);
        applyTemplateToCollisionMap(collisionMap, templateName, reservedCells);
      }
    }

    const backgroundObjects = [];
    // Items the template itself places (Simple Keys) — every templated
    // generator puts these in its floor's items list.
    const templateItems = [];
    let spawnCells = [];
    if (templateName) {
      for (const { row, col } of getTemplateWaterCells(templateName, reservedCells)) {
        if (collisionMap[row]?.[col]) continue;
        backgroundObjects.push(new BackgroundObject('~', col * GRID.CELL_SIZE, row * GRID.CELL_SIZE));
      }
      this._placeBombableWalls(backgroundObjects, getTemplateBombableCells(templateName, reservedCells));
      this._placeLockBlocks(backgroundObjects, getTemplateCellsWithGlyph(templateName, 'L', reservedCells));
      this._placeSimpleKeys(templateItems, getTemplateCellsWithGlyph(templateName, 'K', reservedCells));
      this._placeShutters(backgroundObjects, getTemplateCellsWithGlyph(templateName, 'S', reservedCells));
      // Author-marked enemy spawn points ('E' in the template grid) — optional;
      // _spawnEnemies() prefers these before falling back to pickOpenCell's
      // randomness, so a template with none behaves exactly as before this existed.
      spawnCells = getTemplateSpawnCells(templateName, reservedCells)
        .filter(({ row, col }) => !collisionMap[row]?.[col]);
    }
    // The fixtures a template authors (dungeonFixtures.js) — the same lists
    // a Puzzle Room takes. Spread onto the floor by every templated generator.
    const fixtures = templateName
      ? placeTemplateFixtures(getTemplateData(templateName), { backgroundObjects, items: templateItems, reservedCells })
      : { triggers: [], hookPosts: [], torches: [], gapCells: null };
    // Set once the floor's triggers are all active at once
    // (DungeonPuzzleSystem._updateFloorTriggers); the anchor cells a Push
    // Rock may never be shoved onto come from `diagonals`.
    fixtures.triggersSolved = false;
    fixtures.diagonals = diagonals;

    // Everything placed on this floor must stand where the player can reach
    // it. A template may wall off a walkable pocket (open.json's sealed
    // pool): an enemy spawned there kept the Trap Room sealed forever, since
    // it only unseals once every enemy is dead (bug #404), and a skull key or
    // Tomb there was simply lost. Measured from the up-stairs footprint,
    // which the Progression Solver checks connects to every other staircase
    // and landing.
    // Solid fixtures (rocks, Deflectors, Push Rocks) wall cells off too.
    const reachable = this._reachableCells(this._withSolidObjects(collisionMap, backgroundObjects),
      rows, cols, STAIRS_UP_ROW, STAIRS_COL);
    spawnCells = spawnCells.filter(({ row, col }) => reachable.has(`${row},${col}`));
    // A vent in a sealed pocket would hold its Shutters shut forever, so it
    // is left out the same way (the Progression Solver rejects that layout).
    const spawnVents = templateName
      ? this._placeSpawnVents(
        backgroundObjects,
        getTemplateSpawners(templateName, reservedCells).filter(({ row, col }) => reachable.has(`${row},${col}`)),
        depth, zone)
      : [];

    // Random open cell (reachable, not a reserved footprint cell, not
    // already holding a background object). Used for decor/enemy/skull
    // placement so templates never trap entities or bury the staircases.
    const pickOpenCell = (minRow, maxRow, minCol, maxCol) => {
      for (let attempt = 0; attempt < 20; attempt++) {
        const r = minRow + Math.floor(Math.random() * (maxRow - minRow + 1));
        const c = minCol + Math.floor(Math.random() * (maxCol - minCol + 1));
        if (!reachable.has(`${r},${c}`)) continue;
        if (reservedCells.some(cell => cell.row === r && cell.col === c)) continue;
        const x = c * GRID.CELL_SIZE;
        const y = r * GRID.CELL_SIZE;
        if (backgroundObjects.some(o => o.position.x === x && o.position.y === y)) continue;
        return { row: r, col: c };
      }
      return null;
    };

    return { cols, rows, collisionMap, backgroundObjects, templateItems, pickOpenCell, spawnCells, spawnVents, fixtures };
  }

  // A copy of collisionMap with every solid background object's cell marked
  // blocked — for reachability, since a template's rocks and Deflectors are
  // solid objects rather than stamped collision.
  _withSolidObjects(collisionMap, backgroundObjects) {
    const map = collisionMap.map(row => row.slice());
    for (const obj of backgroundObjects) {
      if (!obj.data?.solid || obj.destroyed) continue;
      const row = Math.round(obj.position.y / GRID.CELL_SIZE);
      const col = Math.round(obj.position.x / GRID.CELL_SIZE);
      if (map[row]) map[row][col] = true;
    }
    return map;
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

  // Bombable Wall cells ('B', numbered floors and Puzzle Rooms alike) —
  // collision is already stamped solid by the template, so the overlay's wall
  // pass draws them as ordinary wall; the object on top is what a bomb blast
  // finds and breaks (CavernSystem.bombBlast clears the collision cell when
  // it does).
  _placeBombableWalls(backgroundObjects, cells) {
    for (const { row, col } of cells) {
      backgroundObjects.push(new BackgroundObject('≡', col * GRID.CELL_SIZE, row * GRID.CELL_SIZE, { typeId: 'bombable_wall' }));
    }
  }

  // Lock Block cells ('L') — collision is already stamped solid by the
  // template; the object is what DungeonPuzzleSystem._tryOpenLockBlock finds
  // and removes when a key opens it.
  _placeLockBlocks(backgroundObjects, cells) {
    for (const { row, col } of cells) {
      backgroundObjects.push(new BackgroundObject('▣', col * GRID.CELL_SIZE, row * GRID.CELL_SIZE, { typeId: 'lock_block' }));
    }
  }

  // Shutter cells ('S') — collision is already stamped solid by the
  // template; DungeonPuzzleSystem._updateShutters removes every Shutter
  // object (and clears its cell) once the floor's enemies and Spawn Vents
  // are gone.
  _placeShutters(backgroundObjects, cells) {
    for (const { row, col } of cells) {
      backgroundObjects.push(new BackgroundObject('+', col * GRID.CELL_SIZE, row * GRID.CELL_SIZE, { typeId: 'shutter' }));
    }
  }

  // Spawn Vents (the template's `spawners` list) — a breakable spawn_vent
  // object on each cell, plus the record SpawnVentSystem ticks: what it
  // spawns (null = a zone-random enemy), how many may be alive at once, and
  // how many seconds apart. Returned as the floor's `spawnVents`.
  _placeSpawnVents(backgroundObjects, spawners, depth, zone) {
    return spawners.map(({ row, col, enemyChar, maxAlive, interval }) => {
      const obj = new BackgroundObject('&', col * GRID.CELL_SIZE, row * GRID.CELL_SIZE, { typeId: 'spawn_vent' });
      backgroundObjects.push(obj);
      return { obj, enemyChar: enemyChar ?? null, maxAlive, interval, timer: 0, alive: [], depth, zone };
    });
  }

  // Simple Key cells ('K') — a real key Item on each, picked up into the key
  // item inventory like the Skull Key.
  _placeSimpleKeys(items, cells) {
    for (const { row, col } of cells) {
      items.push(Object.assign(new Item(SIMPLE_KEY_CHAR, col * GRID.CELL_SIZE, row * GRID.CELL_SIZE), { hutPlane: true }));
    }
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

  // One Tomb ('T' — stateful container, see BackgroundObject.openTomb and
  // InteractionSystem's 'openTomb' effect branch) per eligible floor.
  // Unconditional placement, same "always exactly one" shape as
  // _placeSkullIfDue's single bone pile, but every eligible floor gets one
  // rather than one per dungeon visit. Called from the same 3 numbered-floor
  // generators that call _addDecor (Entrance/Corridor/Branch) — Pyramid is a
  // bare static edifice with zero enemies (_generatePyramid) and the side
  // rooms (Trap Room/Puzzle Room) are bespoke authored layouts, so neither
  // calls _addDecor either; Tomb placement follows that same footprint.
  _addTombs(backgroundObjects, pickOpenCell, rows, cols) {
    const cell = pickOpenCell(6, rows - 5, 2, cols - 3);
    if (!cell) return;
    backgroundObjects.push(new BackgroundObject('T', cell.col * GRID.CELL_SIZE, cell.row * GRID.CELL_SIZE));
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
      // Random placement keeps 2 rows clear above the South up-stairs, where
      // a player descending North lands (DungeonSystem._landingAnchorFor).
      const cell = pool.length ? pool.pop() : pickOpenCell(4, rows - 7, 3, cols - 4);
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

  /**
   * One cell of a Slot's [glyph] frame. Color is painted explicitly (both
   * `color` and `animationColor`) because none of '[', ']' or an item glyph is
   * a registered BACKGROUND_OBJECT — they all land on BackgroundObject's
   * generic fallback, which is inert and non-solid (exactly what masonry
   * wants, and what the Pyramid's old '□' relied on) but carries a default
   * gray that would otherwise show through.
   */
  _makeSlotCell(col, row, char, color) {
    const obj = new BackgroundObject(char, col * GRID.CELL_SIZE, row * GRID.CELL_SIZE);
    obj.color = color;
    obj.animationColor = color;
    obj.indestructible = true;
    return obj;
  }

  // row/col default to the South footprint (STAIRS_UP_ROW), where every
  // graph floor's way up sits (node.upDir is always 'S', leaving N/W/E free
  // for descents); the Vault passes its own row (VAULT_STAIRS_UP_ROW).
  _makeStairsUp(locked, row = STAIRS_UP_ROW, col = STAIRS_COL) {
    const obj = new BackgroundObject('{', col * GRID.CELL_SIZE, row * GRID.CELL_SIZE);
    paintStairsUpVisual(obj, locked);
    return obj;
  }

  _makeDescent(id, row, col, { active, locked, hidden = false, destination }) {
    const obj = new BackgroundObject('x', col * GRID.CELL_SIZE, row * GRID.CELL_SIZE);
    paintDescentVisual(obj, { active, locked, hidden });
    return { id, row, col, obj, active, locked, hidden, destination };
  }

  /**
   * One descent per Dungeon Graph edge leaving this floor, each on the
   * footprint its edge's dir names. Locked until its Reveal fires, unless the
   * Reveal is 'open'; a Hidden Descent paints as bare floor until then.
   * Pushes each descent's tile into backgroundObjects.
   */
  _makeGraphDescents(ctx, backgroundObjects) {
    return ctx.edges.map(edge => {
      const { row, col } = footprintCellFor(edge.dir, FOOTPRINT_CONTRACT);
      const descent = this._makeDescent(DESCENT_ID_FOR[edge.dir], row, col, {
        active: true, locked: edge.reveal !== 'open', hidden: !!edge.hidden, destination: { node: edge.to },
      });
      descent.reveal = edge.reveal;
      backgroundObjects.push(descent.obj);
      return descent;
    });
  }

  /**
   * The floor's up-stairs, on the footprint the graph gives its node
   * (node.upDir — the South footprint).
   */
  _makeGraphStairsUp(ctx, locked) {
    const { row, col } = footprintCellFor(ctx.node.upDir, FOOTPRINT_CONTRACT);
    return { row, col, obj: this._makeStairsUp(locked, row, col) };
  }

  /** The way back up from a floor: the node the graph first reaches it from. */
  _ascendToFor(ctx) {
    return ctx.upFrom ? { node: ctx.upFrom } : null;
  }

  // One key-carrying bone pile ('8', the existing Bones background object —
  // NOT a bespoke glyph; 'Ω' was already claimed by the hut Cauldron, see
  // resolved-bugs.md) per dungeon visit — floor chosen at entry
  // (interiorState.keySkullNode, see DungeonSystem.rollVisit). Only
  // placed while the key hasn't already been obtained or spent this run. It
  // renders identically to ordinary Bones decor — dropsDungeonKey (set on
  // the instance, mirrors obj.dropsKey's K-room pattern) is what makes THIS
  // one grant the key on destruction, same "which one is it?" find as the K
  // room's vault key. keyChar is the real Item it spawns on destruction
  // (InteractionSystem.handleObjectEffect) — '⚿', distinct from the '8'
  // decor char so the held item itself reads as a key, not a bone.
  _placeSkullIfDue(nodeId, { backgroundObjects, pickOpenCell, rows, cols }) {
    const game = this.game;
    const state = game.dungeonSystem.interiorState;
    if (hasKeyItem(game.inventorySystem, '⚿') || state.keyUsed) return;
    if (state.keySkullNode !== nodeId) return;
    const cell = pickOpenCell(6, rows - 5, 3, cols - 4);
    if (!cell) return;
    const skull = new BackgroundObject('8', cell.col * GRID.CELL_SIZE, cell.row * GRID.CELL_SIZE);
    skull.dropsDungeonKey = true;
    skull.keyChar = '⚿';
    backgroundObjects.push(skull);
  }

  // ── Floors by node ─────────────────────────────────────────────────────

  /**
   * Build the floor for one node of the visit's Dungeon Graph. Every floor
   * comes back stamped with its Floor Kind and node id — the identity the
   * rest of the Dungeon dispatches on.
   */
  generateNode(nodeId, depth) {
    const graph = this.game.dungeonSystem.interiorState.graph;
    const node = graph?.nodes[nodeId];
    if (!node) return null;
    const ctx = {
      nodeId, node, depth,
      zone: this.game.currentRoom?.zone || 'gray',
      edges: edgesFrom(graph, nodeId),
      upFrom: edgeInto(graph, nodeId)?.from ?? null,
    };
    ctx.diagonals = ctx.edges.filter(e => DIAGONAL_DIRS.includes(e.dir)).map(e => e.dir);
    ctx.wantsTriggers = ctx.edges.some(e => e.reveal === 'triggers');
    const floor = FLOOR_KINDS[node.kind].generate(this, ctx);
    // A 'triggers' Reveal needs triggers that can all be solved. A floor that
    // drew no such template (none hosts its diagonals, or the kind is
    // untemplated) opens those descents when it is cleared instead, so a
    // Hidden Descent always has a way to appear.
    if (ctx.wantsTriggers && !floor.triggers?.length) {
      for (const d of floor.descents) if (d.reveal === 'triggers') d.reveal = 'clear';
    }
    return Object.assign(floor, { kind: node.kind, nodeId });
  }

  _generateEntrance(ctx) {
    const { depth, zone } = ctx;
    const { cols, rows, collisionMap, backgroundObjects, templateItems, pickOpenCell, spawnCells, spawnVents, fixtures } = this._buildScaffold({ depth, zone, diagonals: ctx.diagonals, wantsTriggers: ctx.wantsTriggers });
    this._addDecor(backgroundObjects, pickOpenCell, rows, cols);
    this._addTombs(backgroundObjects, pickOpenCell, rows, cols);
    this._placeSkullIfDue(ctx.nodeId, { backgroundObjects, pickOpenCell, rows, cols });

    backgroundObjects.push(new BackgroundObject('∩', STAIRS_COL * GRID.CELL_SIZE, EXIT_ROW * GRID.CELL_SIZE));

    const descents = this._makeGraphDescents(ctx, backgroundObjects);

    const enemies = this._spawnEnemies(2 + Math.floor(Math.random() * 3), depth, zone,
      { collisionMap, backgroundObjects, pickOpenCell, rows, cols, spawnCells });

    return {
      type: 'DUNGEON_FLOOR',
      gridCols: cols, gridRows: rows, collisionMap, backgroundObjects, enemies,
      items: templateItems, ingredients: [], npcs: [], doors: [], tombGhosts: [], spawnVents,
      viewport: this._makeViewport(cols, rows),
      exitRow: EXIT_ROW, exitCol: STAIRS_COL,
      stairsUpRow: null, stairsUpCol: null, stairsUpObj: null, stairsUpLocked: false, ascendTo: null,
      descents,
      ...fixtures,
    };
  }

  _generateCorridor(ctx) {
    const { depth, zone } = ctx;
    const { cols, rows, collisionMap, backgroundObjects, templateItems, pickOpenCell, spawnCells, spawnVents, fixtures } = this._buildScaffold({ depth, zone, diagonals: ctx.diagonals, wantsTriggers: ctx.wantsTriggers });
    this._addDecor(backgroundObjects, pickOpenCell, rows, cols);
    this._addTombs(backgroundObjects, pickOpenCell, rows, cols);
    this._placeSkullIfDue(ctx.nodeId, { backgroundObjects, pickOpenCell, rows, cols });

    const up = this._makeGraphStairsUp(ctx, false);
    backgroundObjects.push(up.obj);

    // Descents come from the graph: the next corridor, the Branch (behind
    // the Skull Key, or open on a triangle's bypass side), and possibly the
    // visit's Trial (North, open — a quick low-tier grab) or the Trap Room.
    const descents = this._makeGraphDescents(ctx, backgroundObjects);

    const enemies = this._spawnEnemies(3 + Math.floor(Math.random() * 3), depth, zone,
      { collisionMap, backgroundObjects, pickOpenCell, rows, cols, spawnCells });

    return {
      type: 'DUNGEON_FLOOR',
      gridCols: cols, gridRows: rows, collisionMap, backgroundObjects, enemies,
      items: templateItems, ingredients: [], npcs: [], doors: [], tombGhosts: [], spawnVents,
      viewport: this._makeViewport(cols, rows),
      exitRow: null, exitCol: null,
      stairsUpRow: up.row, stairsUpCol: up.col, stairsUpObj: up.obj, stairsUpLocked: false,
      ascendTo: this._ascendToFor(ctx),
      descents,
      ...fixtures,
    };
  }

  _generateBranch(ctx) {
    const { depth, zone } = ctx;
    // Bare 'open' layout — no wall template. Matches the pre-rework 5-floor
    // system's floor 2 (git-archaeology, bug #209: "companion-panel floor
    // uses the bare 'open' layout — its puzzle assumes a clean playfield"),
    // and is a hard requirement, not just fidelity: the companion's dispatch
    // walk between the two panels (DungeonPuzzleSystem._updateBranchPanels
    // → CampNPCSystem._moveToTarget) is a straight-line, unpathed walk with
    // no obstacle avoidance, so a template wall between the panels would
    // silently strand it (the exact failure a shared-template experiment hit
    // and reverted — see BRANCH_PANEL_ROW/COL comment below for the columns
    // this preserves clearance for).
    const { cols, rows, collisionMap, backgroundObjects, pickOpenCell, spawnCells } = this._buildScaffold({ useTemplate: false });
    this._addDecor(backgroundObjects, pickOpenCell, rows, cols);
    this._addTombs(backgroundObjects, pickOpenCell, rows, cols);
    // No _placeSkullIfDue here — the Skull Key only drops on a floor kind
    // that holds it (FLOOR_KINDS.holdsSkullKey) and is reachable before the
    // door it opens, which leads *into* the Branch.

    const up = this._makeGraphStairsUp(ctx, false);
    backgroundObjects.push(up.obj);

    // Companion-panel puzzle — always visible, sitting directly in Branch
    // alongside the Trap Room door (bug #209: previously relocated into an
    // invisible-until-companion-recruited side room, which hid the puzzle's
    // very existence; the pre-rework implementation always rendered these).
    // Only *solving* it needs a companion (_updateBranchPanels); a solo
    // player can walk in, see both panels, and read the puzzle before
    // recruiting anyone. Row/cols mirror the original floor 2 constants.
    const panelAObj = new BackgroundObject('▭', BRANCH_PANEL_A_COL * GRID.CELL_SIZE, BRANCH_PANEL_ROW * GRID.CELL_SIZE);
    panelAObj.kind = 'panel';
    setTriggerVisual(panelAObj, false);
    backgroundObjects.push(panelAObj);

    const panelBObj = new BackgroundObject('▭', BRANCH_PANEL_B_COL * GRID.CELL_SIZE, BRANCH_PANEL_ROW * GRID.CELL_SIZE);
    panelBObj.kind = 'panel';
    setTriggerVisual(panelBObj, false);
    backgroundObjects.push(panelBObj);

    // Descents come from the graph: the Pyramid, visible but locked until the
    // panel puzzle emits the 'panels' Reveal (DungeonPuzzleSystem.
    // _updateBranchPanels), and possibly the Trap Room (open — a sealed enemy
    // gauntlet with a tier-2 reward on clear).
    const descents = this._makeGraphDescents(ctx, backgroundObjects);

    const enemies = this._spawnEnemies(4 + Math.floor(Math.random() * 3), depth, zone,
      { collisionMap, backgroundObjects, pickOpenCell, rows, cols, spawnCells });

    return {
      type: 'DUNGEON_FLOOR',
      gridCols: cols, gridRows: rows, collisionMap, backgroundObjects, enemies,
      items: [], ingredients: [], npcs: [], doors: [], tombGhosts: [], spawnVents: [],
      viewport: this._makeViewport(cols, rows),
      exitRow: null, exitCol: null,
      stairsUpRow: up.row, stairsUpCol: up.col, stairsUpObj: up.obj, stairsUpLocked: false,
      ascendTo: this._ascendToFor(ctx),
      descents,
      // The zone's sub-solve on this floor (Dungeon Recipe branchPuzzle).
      puzzle: ctx.node.puzzle,
      panelAObj, panelBObj, puzzleSolved: false,
    };
  }

  _generatePyramid(ctx) {
    const { zone } = ctx;
    // Static edifice — zero enemies (plan Phase 3), bare playfield.
    const { cols, rows, collisionMap, backgroundObjects } = this._buildScaffold({ useTemplate: false });

    const up = this._makeGraphStairsUp(ctx, false);
    backgroundObjects.push(up.obj);

    // Descent to the Vault, visible but locked until the Legend of Three
    // offering emits the 'offering' Reveal (DungeonPuzzleSystem.
    // _checkPyramidComplete). The dungeon boss layer's arena lives down there.
    const descents = this._makeGraphDescents(ctx, backgroundObjects);

    // Legend of Three Slots — top (Justice), bottom-left (Truth), bottom-right
    // (Help). Each is built in the game's ubiquitous Slot shape: '[' + the
    // wanted item's glyph + ']', in the same masonry the Puzzle Room's weapon
    // pedestal uses (SLOT_CHROME). The glyph sits dimmed in PENDING until the
    // offering lands, so each register states its own requirement without a
    // word of instruction — DungeonPuzzleSystem._fillPyramidSlot repaints it
    // in the item's own color on deposit.
    //
    // Columns are 4 apart around STAIRS_COL (12), so the three 3-cell frames
    // (7-9, 11-13, 15-17) never touch.
    const legend = getLegendOfThree(zone);
    const slotDefs = [
      { key: 'justice', row: 8,  col: STAIRS_COL,      itemType: 'consumable' },
      { key: 'truth',   row: 14, col: STAIRS_COL - 4,  itemType: 'weapon' },
      { key: 'help',    row: 14, col: STAIRS_COL + 4,  itemType: 'weapon' },
    ];
    const pyramidSlots = {};
    for (const def of slotDefs) {
      const requiredChar = legend ? legend[def.key] : null;
      // An unauthored zone's Pyramid still shows its three frames, just empty —
      // dormant masonry rather than a missing edifice.
      const slotObj = this._makeSlotCell(def.col, def.row, requiredChar ?? ' ', SLOT_CHROME.PENDING);
      backgroundObjects.push(
        this._makeSlotCell(def.col - 1, def.row, SLOT_CHROME.BRACKET_LEFT,  SLOT_CHROME.STONE),
        slotObj,
        this._makeSlotCell(def.col + 1, def.row, SLOT_CHROME.BRACKET_RIGHT, SLOT_CHROME.STONE),
      );
      pyramidSlots[def.key] = {
        row: def.row, col: def.col, obj: slotObj,
        requiredChar, itemType: def.itemType, filled: !requiredChar,
      };
    }

    return {
      type: 'DUNGEON_FLOOR',
      gridCols: cols, gridRows: rows, collisionMap, backgroundObjects, enemies: [],
      items: [], ingredients: [], npcs: [], doors: [], tombGhosts: [], spawnVents: [],
      viewport: this._makeViewport(cols, rows),
      exitRow: null, exitCol: null,
      stairsUpRow: up.row, stairsUpCol: up.col, stairsUpObj: up.obj, stairsUpLocked: false,
      ascendTo: this._ascendToFor(ctx),
      descents, // the offering unlocks the descent into the Vault
      pyramidSlots,
      // Only zones with real legendOfThree.js content are solvable; unauthored
      // zones get a dormant/inert pyramid (same shape as puzzles.js's
      // DORMANT_PUZZLE) rather than an instantly-"solved" or crashing floor.
      legendAuthored: !!legend,
      puzzleSolved: false,
    };
  }

  // Vault — terminal arena beyond the Pyramid, reached via
  // its North descent once the Legend of Three offering completes. The
  // dungeon boss layer's home: content here is owned by DungeonBossSystem
  // (per-zone spec), not by this generator — the floor itself is a bare
  // authored chamber with zero ambient enemies, no decor/tombs/skull rolls
  // (contrast every other numbered floor), because the boss encounter owns
  // everything the player sees and fights. `isVault` is the marker the boss
  // system and the gilded-companion trigger key off; `gildedTriggered`
  // guards that trigger so re-activating a cached floor doesn't re-fire it.
  _generateVault(ctx) {
    const { cols, rows, collisionMap, backgroundObjects } = this._buildScaffold({ useTemplate: false });

    // Entered via the Pyramid's North descent — up-stairs at the top of the
    // room (VAULT_STAIRS_UP_ROW, not the South footprint). Locked for the
    // whole encounter (mirrors the Trap Room's "all cleared" gate): the boss
    // body sits right on top of this point, and an unlocked ascend trigger here fired an unintended
    // mid-fight floor transition whenever a pull/knockback landed the player
    // on it (bug: player/boss ending up back in the Pyramid room). Unlocked
    // in DungeonBossSystem._defeat().
    const stairsUpObj = this._makeStairsUp(true, VAULT_STAIRS_UP_ROW, STAIRS_COL);
    backgroundObjects.push(stairsUpObj);

    // The sealed inner-vault door, set into the south wall behind the hoard.
    // It never opens, has no key, and is wired to nothing — a dead end by
    // design. South is the freedom axis, so the deepest room in the delve
    // ends on the suspicion that it is not actually the deepest room. Two
    // leaves so the seam shows; the seam is what makes it read as shut.
    const doorRow = rows - 1;
    const doorCol = Math.floor(cols / 2) - 1;
    backgroundObjects.push(
      new BackgroundObject('[', doorCol * GRID.CELL_SIZE, doorRow * GRID.CELL_SIZE),
      new BackgroundObject(']', (doorCol + 1) * GRID.CELL_SIZE, doorRow * GRID.CELL_SIZE),
    );

    return {
      type: 'DUNGEON_FLOOR',
      isVault: true,
      gridCols: cols, gridRows: rows, collisionMap, backgroundObjects, enemies: [],
      items: [], ingredients: [], npcs: [], doors: [], tombGhosts: [], spawnVents: [],
      viewport: this._makeViewport(cols, rows),
      exitRow: null, exitCol: null,
      stairsUpRow: VAULT_STAIRS_UP_ROW, stairsUpCol: STAIRS_COL, stairsUpObj, stairsUpLocked: true,
      ascendTo: this._ascendToFor(ctx),
      descents: this._makeGraphDescents(ctx, backgroundObjects), // none in any recipe yet — the delve ends here
      gildedTriggered: false,
    };
  }

  // ── Side rooms ──────────────────────────────────────────────────────────
  // Floors hung off a corridor or the Branch rather than on the way to the
  // Vault. Which floor each hangs off is the graph's call (ctx.upFrom), so
  // the generators never name their origin.

  // Trap Room — sealed enemy gauntlet. Exit stays locked until every enemy
  // is cleared (same "all-N-cleared" shape as MazeSystem._checkMazeCleared;
  // DungeonPuzzleSystem unlocks it), rewarding a tier-2 weapon on clear.
  // Reintroduces the pre-Whip-Trial trapRoom shape (see git history, commit
  // 4429455) now that 'trapRoom' names this room instead.
  generateTrapRoom(ctx) {
    const { depth, zone } = ctx;
    const { cols, rows, collisionMap, backgroundObjects, templateItems, pickOpenCell, spawnCells, spawnVents, fixtures } = this._buildScaffold({ depth, zone, diagonals: ctx.diagonals, wantsTriggers: ctx.wantsTriggers });

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
    const reachable = this._reachableCells(this._withSolidObjects(collisionMap, backgroundObjects),
      rows, cols, STAIRS_UP_ROW, STAIRS_COL);
    const rewardCell = this._pickReachableCell(
      reachable, collisionMap, backgroundObjects, getReservedFootprintCells(ctx.diagonals),
      6, rows - 5, 3, cols - 4, STAIRS_UP_ROW, STAIRS_COL
    );
    // Shares the Spawned Items list with the surface rooms (spawnedItems.js).
    const rewardChar = pickUnspawnedItem(this.game, TRAP_ROOM_REWARD_POOL);
    markItemSpawned(this.game, rewardChar);
    const rewardItem = Object.assign(
      new Item(rewardChar, rewardCell.col * GRID.CELL_SIZE, rewardCell.row * GRID.CELL_SIZE),
      { hutPlane: true }
    );

    return {
      type: 'DUNGEON_FLOOR',
      gridCols: cols, gridRows: rows, collisionMap, backgroundObjects, enemies,
      items: [rewardItem, ...templateItems], ingredients: [], npcs: [], doors: [], tombGhosts: [], spawnVents,
      viewport: this._makeViewport(cols, rows),
      exitRow: null, exitCol: null,
      stairsUpRow: STAIRS_UP_ROW, stairsUpCol: STAIRS_COL, stairsUpObj, stairsUpLocked: true,
      ascendTo: this._ascendToFor(ctx),
      descents: [],
      ...fixtures,
    };
  }

  // Puzzle Room — generic template-driven puzzle side room, authored via
  // tools/dungeon-editor/'s Puzzle mode rather than hand-coded geometry
  // (contrast Trap Room above and Branch's own in-room switch puzzle in
  // _generateBranch, each a bespoke, fully hardcoded layout). A template
  // supplies its own wall/water/gap/exit layout, any number of
  // switches/panels, and optionally hook posts / torches / a weapon-tutorial
  // pedestal (dungeonPuzzleTemplates.js); this method just instantiates that
  // data as a live floor. Every named template (including the original Whip
  // Trial, now authored as whip_trial.json) is reachable this way, picked by
  // weighted random per dungeon visit — DungeonSystem.rollVisit writes the
  // pick onto the graph node (ctx.node.template).
  //
  // Exit unlock rule: every trigger in the template must be active at once
  // (DungeonPuzzleSystem._updatePuzzleRoom) — the generalized form of the
  // original Whip Trial's "both switches struck together" and Branch's
  // "both switches pressed together" rules, extended to any trigger count/mix.
  generatePuzzleRoom(ctx) {
    const { depth } = ctx;
    const templateName = ctx.node.template;
    const CS = GRID.CELL_SIZE;
    const { cols, rows, collisionMap, backgroundObjects } = this._buildScaffold({ useTemplate: false });

    applyPuzzleTemplateToCollisionMap(collisionMap, templateName);

    for (const { row, col } of getPuzzleTemplateWaterCells(templateName)) {
      if (collisionMap[row]?.[col]) continue;
      backgroundObjects.push(new BackgroundObject('~', col * CS, row * CS));
    }

    // Lava, Hammer Trial rocks and Deflectors, Gaps, triggers, hook posts
    // and torches — the fixtures every templated floor shares
    // (dungeonFixtures.js). Items the template authors land in `items`.
    const items = [];
    const { triggers, hookPosts, torches, gapCells } =
      placeTemplateFixtures(getPuzzleTemplate(templateName), { backgroundObjects, items });

    this._placeBombableWalls(backgroundObjects, getPuzzleTemplateBombableCells(templateName));
    this._placeLockBlocks(backgroundObjects, getPuzzleTemplateCellsWithGlyph(templateName, 'L'));
    this._placeShutters(backgroundObjects, getPuzzleTemplateCellsWithGlyph(templateName, 'S'));
    const spawnVents = this._placeSpawnVents(backgroundObjects, getPuzzleTemplateSpawners(templateName),
      depth, this.game.currentRoom?.zone || 'gray');

    const exitCell = getPuzzleTemplateExitCell(templateName);
    const exitRow = exitCell?.row ?? STAIRS_UP_ROW;
    const exitCol = exitCell?.col ?? STAIRS_COL;
    const stairsUpObj = new BackgroundObject('Ʌ', exitCol * CS, exitRow * CS);
    // Runtime softlock net ([softlock], #401): a Puzzle Room seals the player
    // in only when its template is proven solvable. One the Progression
    // Solver rejects never joins the random pool, but a CheatMenu warp by name
    // still reaches it — that copy leaves its way back open.
    const sealed = isPuzzleTemplateProven(templateName);
    paintStairsUpVisual(stairsUpObj, sealed);
    backgroundObjects.push(stairsUpObj);

    // Weapon-tutorial pedestal — opt-in per template (generalized from the
    // original Whip Trial's own hardcoded version): a real pickup-able
    // weapon flanked by grayed decorative recipe-ingredient chrome, drawn
    // directly by HutInteriorOverlay (not a BackgroundObject — '~' is real
    // interactive water in BACKGROUND_OBJECTS, so a decorative instance
    // would behave like actual water). leftX/centerX/rightX mirror
    // CraftingStation's shared-divider bracket technique (3 slots, 2-col
    // pitch — each slot is '[' + content + ']', and adjacent slots'
    // touching ']'+'[' land on the same column so the later draw wins,
    // reading as one continuous [x][x][x] frame), anchored on the marker's
    // own column so any template can place it anywhere.
    const pedestalMarker = getPuzzleTemplatePedestal(templateName);
    this._placeSimpleKeys(items, getPuzzleTemplateCellsWithGlyph(templateName, 'K'));
    let weaponPedestal = null;
    if (pedestalMarker) {
      // Character authored directly on the marker (dungeon editor's Pedestal
      // tool — free text, not a dropdown), resolved against recipes.js
      // rather than an id-indirection registry — see weaponTutorials.js.
      const tutorial = pickWeaponTutorial(pedestalMarker.weaponChar);
      if (tutorial) {
        const weaponItem = Object.assign(
          new Item(tutorial.weaponChar, pedestalMarker.col * CS, pedestalMarker.row * CS),
          { hutPlane: true }
        );
        items.push(weaponItem);
        weaponPedestal = {
          row: pedestalMarker.row, col: pedestalMarker.col,
          leftX: pedestalMarker.col - 3, centerX: pedestalMarker.col - 1, rightX: pedestalMarker.col + 1,
          // Uncraftable (found-only) weapon: no recipe, flank Slots stay empty.
          leftChar: tutorial.recipe?.left ?? null, rightChar: tutorial.recipe?.right ?? null,
        };
      } else {
        console.warn(`[DungeonFloorGenerator] puzzle template "${templateName}" has a pedestal with weaponChar "${pedestalMarker.weaponChar}" that isn't a weapon (or the Bomb) in ITEMS — skipping weapon grant.`);
      }
    }

    // Bomb Trial dais — the Bomb Bag the Trial awards, opposite the Bomb on
    // the pedestal (whose flank Slots teach the Bomb recipe).
    const dais = getPuzzleTemplateDais(templateName);
    if (dais) {
      items.push(Object.assign(new Item(BOMB_BAG_CHAR, dais.col * CS, dais.row * CS), { hutPlane: true }));
    }

    return {
      type: 'DUNGEON_FLOOR',
      // Which puzzle-pool template this room was built from.
      templateName,
      gridCols: cols, gridRows: rows, collisionMap, backgroundObjects, enemies: [],
      items, ingredients: [], npcs: [], doors: [], tombGhosts: [], spawnVents,
      viewport: this._makeViewport(cols, rows),
      exitRow: null, exitCol: null,
      stairsUpRow: exitRow, stairsUpCol: exitCol, stairsUpObj, stairsUpLocked: sealed,
      ascendTo: this._ascendToFor(ctx),
      descents: [],
      triggers, hookPosts, torches, weaponPedestal, gapCells, puzzleSolved: false,
      // Bomb Trial dais cell ({ row, col } or null) — holds the Bomb Bag.
      dais,
      // Set when a Bomb explodes on this floor; DungeonPuzzleSystem._restockBomb
      // consumes it by dropping a fresh Bomb on the pedestal.
      bombRestockPending: false,
    };
  }
}
