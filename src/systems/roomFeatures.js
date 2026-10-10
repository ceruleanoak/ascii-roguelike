import { GRID, BACKGROUND_OBJECT_VARIANTS, WALL_STRUCTURES } from '../game/GameConfig.js';
import { BackgroundObject } from '../entities/BackgroundObject.js';
import { Fisherman } from '../entities/Fisherman.js';
import { Enemy } from '../entities/Enemy.js';
import { Item } from '../entities/Item.js';
import { Ingredient } from '../entities/Ingredient.js';
import { ENEMIES, getZoneRandomEnemy, createBossEnemy, BOSS_ENCOUNTERS } from '../data/enemies.js';
import { ZONES } from '../data/zones.js';
import { ITEM_TYPES } from '../data/items.js';
import { WeaponsMaster } from '../entities/WeaponsMaster.js';
import { HOT_WATER_CHAR } from '../data/alchemy.js';
import { PLANE_TUNNEL } from './PlaneSystem.js';
import { hazardStep } from './ZoneSystem.js';
import { createLightningSpire } from './LightningSpire.js';

// Room-generation feature helpers extracted from RoomGenerator (arch budget).
// Each takes the generator instance (`gen`) for its placement utilities.

/**
 * Derives the compass direction a carved river flows toward, based on the
 * edge its path terminates at. Never returns 'south' — south is the return
 * exit in this generator's convention, not a valid forward-progression
 * direction for the river-follow chase to key off of.
 */
export function deriveRiverFlowDirection(path) {
  const last = path && path[path.length - 1];
  if (!last) return null;
  if (last.row <= 1) return 'north';
  if (last.col <= 1) return 'west';
  if (last.col >= GRID.COLS - 2) return 'east';
  return null;
}

/**
 * Maps the direction the player just exited via to the next room's forced
 * river geometry: the entry wall (opposite the exit direction) is where the
 * river must start, and the allowed flow-out edges exclude both south (never
 * a valid flow direction) and the entry wall itself (flowing back out the
 * way the player came isn't forward progress).
 */
export function buildForcedRiverParams(exitDirection) {
  const ENTRY_EDGE = { north: 'bottom', east: 'left', west: 'right' };
  const startEdge = ENTRY_EDGE[exitDirection];
  if (!startEdge) return null;
  const allowedFlowEdges = ['top', 'left', 'right'].filter(e => e !== startEdge);
  return { startEdge, allowedFlowEdges };
}

/**
 * Carves a river pinned to `forced.startEdge`, retrying each allowed
 * flow-out edge until one actually spans there. Falls back to an
 * unconstrained river (still yellow-zone water, just not guaranteed to
 * match an allowed direction) if the room's geometry can't satisfy the pin.
 */
export function carveForcedRiver(gen, room, forced) {
  const start = gen._pickEdgePoint(forced.startEdge);
  const edgeOrder = [...forced.allowedFlowEdges].sort(() => Math.random() - 0.5);

  let path = null;
  for (const edge of edgeOrder) {
    const end = gen._pickEdgePoint(edge);
    const attempt = gen._buildPath(room, 'river', start, end);
    if (deriveRiverFlowDirection(attempt)) { path = attempt; break; }
  }
  if (!path) path = gen._buildPath(room, 'river');

  const dir = deriveRiverFlowDirection(path);
  if (dir && room.zone === 'yellow') room.riverFlowDirection = dir;
}

/**
 * Yellow zone's per-room water template (stream / river / dry bed /
 * river+river / river+2 streams / pond) — or, while the river-follow chase is
 * active, a forced river pinned to the entry wall. The path carving itself is
 * RoomGenerator._buildPath (see the "Yellow zone: rivers" block there).
 */
export function generateYellowWaterTemplate(gen, room, forced = null) {
  if (forced) {
    carveForcedRiver(gen, room, forced);
    return;
  }

  const templates = ['stream', 'river', 'dry', 'river_river', 'river_streams', 'pond'];
  const choice = templates[Math.floor(Math.random() * templates.length)];

  switch (choice) {
    case 'stream':
      gen._buildPath(room, 'stream');
      break;
    case 'river': {
      const path = gen._buildPath(room, 'river');
      const dir = deriveRiverFlowDirection(path);
      if (dir && room.zone === 'yellow') room.riverFlowDirection = dir;
      break;
    }
    case 'dry':
      gen._buildPath(room, 'dry');
      break;
    case 'river_river': {
      const main = gen._buildPath(room, 'river');
      const dir = deriveRiverFlowDirection(main);
      if (dir && room.zone === 'yellow') room.riverFlowDirection = dir;
      if (main && main.length > 6) {
        const tap = main[Math.floor(main.length / 2)];
        gen._buildPath(room, 'river', tap, gen._pickEdgePoint());
      }
      break;
    }
    case 'river_streams': {
      const main = gen._buildPath(room, 'river');
      const dir = deriveRiverFlowDirection(main);
      if (dir && room.zone === 'yellow') room.riverFlowDirection = dir;
      if (main && main.length > 8) {
        for (let i = 0; i < 2; i++) {
          const j = Math.floor((i + 1) * main.length / 3);
          gen._buildPath(room, 'stream', main[j], gen._pickEdgePoint());
        }
      }
      break;
    }
    case 'pond':
      gen._placePond(room);
      break;
  }

  // Deeper yellow rooms carry more water: one extra stream or pond per hazard
  // step (ZoneSystem.hazardStep), on top of whichever template rolled.
  const extraWater = hazardStep(gen.currentDepth);
  for (let i = 0; i < extraWater; i++) {
    if (Math.random() < 0.5) gen._buildPath(room, 'stream');
    else gen._placePond(room);
  }
}

/**
 * The plane-1 cells just inside each cave entrance (^ row 4, v row 25,
 * > col 25, < col 4; three cells each) shared by underground and the bat
 * belfry — where the player lands on crossing an entrance. The clearings stop
 * at the entrance row, so without this the cell beyond it was ordinary cave:
 * cave walls, glittering rocks, mud, enemies, and sinkhole water could all
 * land there and block an entrance from the cave side. Every placement pass
 * treats these like clearing cells.
 */
const CAVE_ENTRANCE_LANDING_KEYS = new Set([
  ...[14, 15, 16].map(c => `${c},5`),   // below the north ^^^
  ...[14, 15, 16].map(c => `${c},24`),  // above the south vvv
  ...[14, 15, 16].map(r => `24,${r}`),  // left of the east >>>
  ...[14, 15, 16].map(r => `5,${r}`),   // right of the west <<<
]);
export function isCaveEntranceLanding(col, row) {
  return CAVE_ENTRANCE_LANDING_KEYS.has(`${col},${row}`);
}

/**
 * Cellular-automata cave grid. Returns grid[row][col] where 1 = wall, 0 = open.
 * Borders are always wall; `isOpen(col, row)` cells are forced open (clearings).
 * Shared by underground and the bat belfry.
 */
export function cellularCaveGrid(cols, rows, isOpen, seedChance = 0.45, generations = 5) {
  const grid = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => {
      if (c === 0 || c === cols - 1 || r === 0 || r === rows - 1) return 1;
      if (isOpen(c, r)) return 0;
      return Math.random() < seedChance ? 1 : 0;
    })
  );
  const countNeighbors = (g, col, row) => {
    let count = 0;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = row + dr, nc = col + dc;
        if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) { count++; continue; }
        if (g[nr][nc]) count++;
      }
    }
    return count;
  };
  for (let gen = 0; gen < generations; gen++) {
    const next = grid.map(r => [...r]);
    for (let r = 1; r < rows - 1; r++) {
      for (let c = 1; c < cols - 1; c++) {
        if (isOpen(c, r)) { next[r][c] = 0; continue; }
        const n = countNeighbors(grid, c, r);
        next[r][c] = grid[r][c] === 1 ? (n >= 4 ? 1 : 0) : (n === 3 ? 1 : 0);
      }
    }
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) grid[r][c] = next[r][c];
    }
  }
  return grid;
}

/**
 * Low-depth Lake/Ocean rooms: decent chance the water is peaceful — no
 * enemies, just a Fisherman on the shore teaching the fishing loop. The NPC
 * is stored on room.lakeFisherman and pushed into game.neutralCharacters at
 * room entry (pearlFairy pattern in main.js).
 * Returns true when the peaceful roll applied (caller skips exit locking).
 */
export function maybeSpawnPeacefulFishingRoom(gen, room) {
  const isFishingLetter = room.exitLetter === 'L' || room.exitLetter === 'O';
  if (!isFishingLetter || gen.currentDepth > 4 || Math.random() >= 0.35) return false;

  const fisherman = spawnShoreFisherman(gen, room);
  if (!fisherman) return false;

  room.lakeFisherman = fisherman;
  room.enemies = [];
  room.enemiesPlane0 = [];
  room.enemiesPlane1 = [];
  room.exitsLocked = false;
  return true;
}

/**
 * Place a Fisherman at the water's edge. Lake rooms: just outside a lake
 * node's radius. Ocean rooms: on the beach side of the shoreline. Returns
 * null if no valid land cell is found.
 */
export function spawnShoreFisherman(gen, room) {
  const candidates = [];
  const lakeNodes = gen.currentLetterTemplate?.lakeZone?.nodes;
  if (lakeNodes?.length) {
    for (let attempt = 0; attempt < 24; attempt++) {
      const node = lakeNodes[Math.floor(Math.random() * lakeNodes.length)];
      const angle = Math.random() * Math.PI * 2;
      const edgeDist = node.radius + 1 + Math.random();
      candidates.push({
        col: Math.round(node.col + Math.cos(angle) * edgeDist),
        row: Math.round(node.row + Math.sin(angle) * edgeDist)
      });
    }
  } else {
    // Ocean: no nodes — try random cells and keep ones adjacent to water.
    for (let attempt = 0; attempt < 40; attempt++) {
      const col = 2 + Math.floor(Math.random() * (GRID.COLS - 4));
      const row = 2 + Math.floor(Math.random() * (GRID.ROWS - 4));
      if (!hasWaterAdjacent(room, col, row)) continue;
      candidates.push({ col, row });
    }
  }
  for (const { col, row } of candidates) {
    if (!gen.isValidPosition(col, row, room)) continue;
    if (gen.hasObjectAt(room, col * GRID.CELL_SIZE, row * GRID.CELL_SIZE)) continue;
    const fisherman = new Fisherman(col * GRID.CELL_SIZE, row * GRID.CELL_SIZE);
    fisherman.setZone(room.exitLetter === 'O' ? 'ocean' : room.zone);
    return fisherman;
  }
  return null;
}

/**
 * Post-lesson roaming placement for the rescued Alchemist (see
 * AlchemistNPC.js). Once he's taught the Hot Water lesson, he only sits in
 * his hut while the player is currently carrying a Bottle of Hot Water —
 * otherwise he roams one fixed room per zone (Red-L, Yellow-O, Cyan-T)
 * sharing zone-flavored alchemy lore. Only one room ever hosts him at a
 * time, guarded by `!alchemist.placement`; released back to null in
 * main.js applyRoomSwap() when the player leaves that room (fresh combat
 * rooms are generated per visit, never revisited, so without that release
 * he'd be stuck "placed" in a room nothing can reach again).
 * Returns true when he was placed, mirroring maybeSpawnPeacefulFishingRoom's
 * boolean-return convention (though this never overrides room content).
 */
export function maybeSpawnRoamingAlchemist(gen, room) {
  const game = gen.game;
  const alchemist = game?.alchemistNPC;
  if (!alchemist?.rescued || !alchemist.lessonGiven || alchemist.placement) return false;

  const placement =
    (room.exitLetter === 'L' && room.zone === 'red') ? 'red-L' :
    (room.exitLetter === 'O' && room.zone === 'yellow') ? 'yellow-O' :
    (room.exitLetter === 'T' && room.zone === 'cyan') ? 'cyan-T' : null;
  if (!placement) return false;

  const carryingHotWater =
    game.player?.equippedConsumables?.some(it => it?.char === HOT_WATER_CHAR) ||
    game.inventorySystem?.consumableInventory?.some(it => it?.char === HOT_WATER_CHAR);
  if (carryingHotWater) return false;

  // Simple open-floor-cell search (same style as spawnShoreFisherman's ocean
  // fallback) rather than zone-specific placement — T rooms in particular
  // have no lake-node-style config to key off of.
  const pos = gen.getRandomPosition(room.collisionMap, room.enemies, room.playerStartPos, room.backgroundObjects);
  if (!pos) return false;

  alchemist.position.x = pos.x;
  alchemist.position.y = pos.y;
  alchemist.placement = placement;
  alchemist.setLocation(placement);
  room.alchemistNPC = alchemist;
  return true;
}

// ── Zone-specific Tunnel seeding (unified dispatcher) ───────────────────────
// Called from RoomGenerator.generateTunnelRoom() to seed zone-specific payoff
// for walking the tunnel, after the corridor/rocks/entrances and the generic
// background-object pass are already in place. Mirrors seedAscentZone's
// per-zone dispatch shape; yellow/red/cyan are future phases (each teaches
// the same "rocks flank a hidden tunnel" idea differently but need their own
// design pass) and fall through to the existing generic Tunnel content.
export function seedTunnelZone(gen, room) {
  switch (room.zone) {
    case 'green':
      return seedGreenTunnelChest(gen, room);
    default:
      return false;
  }
}

// ── Green Zone Tunnel: chest reward at the tunnel's center ─────────────────
// Green's Tunnel room is the teaching room: the rock-flanked entrances are
// the whole lesson, so the payoff for walking the corridor (rather than
// fighting through the room) is a Chest planted dead center of the tunnel —
// reachable only from inside it, so it rewards noticing the entrance rocks
// and taking the corridor rather than skipping it. (The ends are no good:
// bounds' first/last cells along the corridor are the entrance markers.)
export function seedGreenTunnelChest(gen, room) {
  const { bounds, entrances } = room.tunnel || {};
  if (!bounds || !entrances?.length) return false;

  const col = Math.round((bounds.minCol + bounds.maxCol) / 2);
  const row = Math.round((bounds.minRow + bounds.maxRow) / 2);

  const chest = new BackgroundObject('⊞', col * GRID.CELL_SIZE, row * GRID.CELL_SIZE);
  chest.spawnImmunityTimer = 1.0;
  // Sits inside the tunnel corridor, where the player is on PLANE_TUNNEL (see
  // PhysicsSystem.updatePlane) — without this flag it defaults to plane 0
  // (PlaneSystem.objectOnPlane) and is invisible/unreachable from inside the
  // tunnel, same as the mud patches in generateTunnelRoom().
  chest.data = { ...chest.data, renderOnlyOnPlane: PLANE_TUNNEL };
  room.backgroundObjects.push(chest);
  return true;
}

// ── Post-generation background-object cleanup ───────────────────────────────
// Structure generators register protected regions on the room and mark the
// objects that make up the structure itself with `obj.structural = true`.
// After every generation pass finishes, RoomGenerator runs
// cleanupStrayBackgroundObjects() once: any non-structural background object
// whose cell falls inside a protected region — or on the room's border walls,
// which are always protected — is removed. This is the single net under all
// placement passes, including ones that ignore clearing zones (e.g. yellow
// river templates stamping water across the maze's non-solid decorative
// interior or under witch-hut legs). Wall-block and vault patterns stamped
// into the collision map are covered too: RoomGenerator records the stamped
// cells (pendingWallCells) and registers them as a 'cells' region.

export function protectRegion(room, region) {
  if (!room.protectedRegions) room.protectedRegions = [];
  room.protectedRegions.push(region);
}

// Red Zone's C-room replacement: a caldera. Enemy-free (inherits the CAMP
// room type's "no enemies" behavior), no campfire/CampNPC/weapon drop —
// instead a small hot spring pool (slow passive heal, see PhysicsSystem
// healingLiquid) surrounded by Ember Bushes (drop Fire Berry) and a rare
// outdoor Weapons Master.
export function generateCalderaRoom(gen, room) {
  gen.generateBackgroundObjects(room);

  const C = GRID.CELL_SIZE;
  const centerCol = Math.floor(GRID.COLS / 2);
  const centerRow = Math.floor(GRID.ROWS / 2);
  const R = 3; // hot spring radius in cells

  const isHotWaterAt = (col, row) => room.backgroundObjects.some(o =>
    o.typeId === 'hot_water' && Math.round(o.position.x / C) === col && Math.round(o.position.y / C) === row);

  const poolCells = [];
  for (let dr = -R; dr <= R; dr++) {
    for (let dc = -R; dc <= R; dc++) {
      if (dc * dc + dr * dr > R * R) continue;
      const col = centerCol + dc, row = centerRow + dr;
      if (col < 1 || row < 1 || col >= GRID.COLS - 1 || row >= GRID.ROWS - 1) continue;
      // Wall/obstacle passes upstream of this generator (e.g. placeWallStructures)
      // can stamp over the fixed room center. Force the pool clear, matching the
      // campfire's explicit collision-clear in the non-red camp room path.
      if (room.collisionMap[row]) room.collisionMap[row][col] = false;
      poolCells.push({ col, row });
      if (!isHotWaterAt(col, row)) {
        // gen.generateBackgroundObjects() above already scattered lava/other
        // objects room-wide (unconditional for red zone) — any of them landing
        // on the fixed pool footprint must be evicted so the hot spring always
        // wins here, not silently pre-empted by a same-glyph lava tile.
        room.backgroundObjects = room.backgroundObjects.filter(o =>
          !(Math.round(o.position.x / C) === col && Math.round(o.position.y / C) === row));
        const tile = new BackgroundObject('~', col * C, row * C, { typeId: 'hot_water' });
        tile.color = BACKGROUND_OBJECT_VARIANTS.hot_water.color;
        tile.animationColor = tile.color;
        // Marking poolCells as a protected region (below) makes RoomGenerator's
        // post-pass cleanupStrayBackgroundObjects() strip anything sitting there
        // that isn't flagged structural — same as the campfire in the sibling
        // non-red camp room. Without this the pool tiles delete themselves.
        tile.structural = true;
        room.backgroundObjects.push(tile);
      }
    }
  }
  protectRegion(room, { kind: 'cells', cells: poolCells });

  // Shore cells: the ring of walkable cells immediately surrounding the pool.
  const shoreCells = [];
  for (const { col, row } of poolCells) {
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const sc = col + dc, sr = row + dr;
      if (sc < 1 || sr < 1 || sc >= GRID.COLS - 1 || sr >= GRID.ROWS - 1) continue;
      if (poolCells.some(c => c.col === sc && c.row === sr)) continue;
      if (shoreCells.some(c => c.col === sc && c.row === sr)) continue;
      if (room.collisionMap[sr]?.[sc]) continue;
      shoreCells.push({ col: sc, row: sr });
    }
  }

  // Scatter a handful of Ember Bushes away from the pool and exits.
  const bushCount = 3 + Math.floor(Math.random() * 2); // 3-4
  const bushes = [];
  for (let i = 0; i < bushCount; i++) {
    const pos = gen.getRandomPosition(room.collisionMap, room.enemies, room.playerStartPos, room.backgroundObjects);
    if (!pos) continue;
    const col = Math.round(pos.x / C), row = Math.round(pos.y / C);
    if (poolCells.some(c => c.col === col && c.row === row)) continue;
    const bush = new BackgroundObject('e', pos.x, pos.y);
    room.backgroundObjects.push(bush);
    bushes.push(bush);
  }
  // Every Caldera yields at least one Fire Berry: one random bush skips the
  // dropChance roll. Which one stays unknown, so the rest still read as luck.
  if (bushes.length > 0) {
    bushes[Math.floor(Math.random() * bushes.length)].guaranteedDrop = true;
  }

  // Rare outdoor Weapons Master — same interactions as the Settlement hut version.
  // Spawns on the pool's shore, not anywhere in the room.
  if (Math.random() < 0.12 && shoreCells.length > 0) {
    const { col, row } = shoreCells[Math.floor(Math.random() * shoreCells.length)];
    room.calderaWeaponsMaster = new WeaponsMaster(col * C, row * C);
  }

  // Exits are already generated by ExitSystem in generateRoom()
  // No need to override them here
}

// Red Zone's A-room (Ascent) addition: seeds the mud floor ring outside the
// plateau and captures the slope belt's original glyph/direction so
// LavaAscentSystem can flood both to lava (and revert) over time. Called
// from seedAscentZone() right after stampSlopeBelt(), so slope tiles already
// have their final char/slopeDirection set by the time this runs.
//
// Floor tiles convert in `floorFillOrder`, ascending distance from a
// handful of random seed tiles — the flood spreads from a few sources
// instead of popping at random, which reads as directional and gives the
// player something to route around. Slope tiles are grouped into whole
// radius rings in `slopeFillGroups` (outermost ring first) so a ring floods
// as one unit — "all r=8 tiles turn to lava at once" — rather than
// trickling tile by tile. LavaAscentSystem walks both orderings forward to
// fill and backward to drain.
export function seedMoltenAscentCycle(gen, room, centerCol, centerRow, innerRadius, outerRadius) {
  const C = GRID.CELL_SIZE;
  const floorMudTiles = [];

  for (let col = 1; col < GRID.COLS - 1; col++) {
    for (let row = 1; row < GRID.ROWS - 1; row++) {
      const dx = col - centerCol;
      const dy = row - centerRow;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= outerRadius) continue;
      if (!gen.isValidPosition(col, row, room)) continue;
      const mudTile = BackgroundObject.createVariant('mud_dry', col * C, row * C);
      mudTile._ascentCol = col;
      mudTile._ascentRow = row;
      room.backgroundObjects.push(mudTile);
      floorMudTiles.push(mudTile);
    }
  }

  const seedCount = Math.min(3, floorMudTiles.length);
  const seedPool = [...floorMudTiles];
  const seeds = [];
  for (let i = 0; i < seedCount && seedPool.length; i++) {
    const idx = Math.floor(Math.random() * seedPool.length);
    seeds.push(seedPool.splice(idx, 1)[0]);
  }
  const distToNearestSeed = (tile) =>
    Math.min(...seeds.map(s => Math.hypot(tile._ascentCol - s._ascentCol, tile._ascentRow - s._ascentRow)));
  const floorFillOrder = [...floorMudTiles].sort((a, b) => distToNearestSeed(a) - distToNearestSeed(b));

  const ringGroups = new Map();
  for (const obj of room.backgroundObjects) {
    if (!obj.slope) continue;
    obj.originalSlopeChar = obj.char;
    obj.originalSlopeDirection = obj.slopeDirection;
    const col = Math.round(obj.position.x / C);
    const row = Math.round(obj.position.y / C);
    const dist = Math.sqrt((col - centerCol) ** 2 + (row - centerRow) ** 2);
    const ring = Math.min(outerRadius, Math.max(innerRadius, Math.round(dist)));
    if (!ringGroups.has(ring)) ringGroups.set(ring, []);
    ringGroups.get(ring).push(obj);
  }
  const slopeFillGroups = [...ringGroups.keys()]
    .sort((a, b) => b - a) // outermost radius first
    .map(ring => ringGroups.get(ring));

  room.ascentLava = {
    phase: 'fillingFloor', // fillingFloor -> fillingSlopes -> drainingSlopes -> drainingFloor -> complete
    timer: 0,
    floorFillOrder,
    slopeFillGroups,
    plateau: { centerCol, centerRow, radius: innerRadius }
  };
}

// ── Slopes ──────────────────────────────────────────────────────────────────
// A Slope is a non-solid terrain tile that pushes whatever stands on it in one
// cardinal direction — downhill (PhysicsSystem's slope push). The Ascent is
// built from them: a belt running down off a raised plateau, or a ring running
// down into a Pit.
const SLOPE_COLOR = '#555555';
const SLOPE_CHARS = { up: 'ʌ', down: 'v', left: '<', right: '>' };

function makeSlopeTile(col, row, direction) {
  const C = GRID.CELL_SIZE;
  const tile = new BackgroundObject(SLOPE_CHARS[direction], col * C, row * C);
  // Override the tunnel-entrance properties the slope glyphs carry in
  // BACKGROUND_OBJECTS with slope properties shared by all four directions.
  tile.data = {
    name: `Slope (${direction})`,
    color: SLOPE_COLOR,
    solid: false,
    bulletInteraction: 'pass-through',
    flammability: 'none',
    conductivity: 'none',
    indestructible: true,
    environmental: true, // terrain (push ramp), not a hittable prop — see BackgroundObject.isEnvironmental()
    interactions: { default: { animation: 'none', message: null } }
  };
  tile.slope = true;
  tile.slopeDirection = direction;
  tile.color = SLOPE_COLOR;
  tile.animationColor = SLOPE_COLOR;
  tile.bulletInteraction = 'pass-through';
  tile.indestructible = true;
  return tile;
}

// The cardinal direction of (dx, dy), dominant axis wins (ties go vertical).
function cardinalOf(dx, dy) {
  if (Math.abs(dy) >= Math.abs(dx)) return dy < 0 ? 'up' : 'down';
  return dx < 0 ? 'left' : 'right';
}

// The Ascent's raised plateau: a belt of Slopes from innerRadius to
// outerRadius, each pushing away from the centre, so reaching the flat top
// means climbing against them.
function stampSlopeBelt(gen, room, centerCol, centerRow, innerRadius, outerRadius) {
  const FILL_CHANCE = 0.92;  // high fill so the larger ring reads as a solid circle
  for (let col = 1; col < GRID.COLS - 1; col++) {
    for (let row = 1; row < GRID.ROWS - 1; row++) {
      const dx = col - centerCol;
      const dy = row - centerRow;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < innerRadius || dist > outerRadius) continue;
      if (Math.random() > FILL_CHANCE) continue;
      if (!gen.isValidPosition(col, row, room)) continue;
      room.backgroundObjects.push(makeSlopeTile(col, row, cardinalOf(dx, dy)));
    }
  }
}

// A Pit (see pits.js): the cells within `radius` of the centre cell, with the
// outer ring as Slopes running down into it and a flat floor in the middle.
// Every cell is stamped (no fill gaps) so the rim reads cleanly — the rim is
// the only thing telling the player where cover begins.
export function stampPit(gen, room, centerCol, centerRow, radius) {
  for (let dr = -radius; dr <= radius; dr++) {
    for (let dc = -radius; dc <= radius; dc++) {
      const dist = Math.sqrt(dc * dc + dr * dr);
      if (dist > radius || dist <= radius - 1) continue; // floor cells stay open ground
      const col = centerCol + dc, row = centerRow + dr;
      if (!gen.isValidPosition(col, row, room)) continue;
      const slope = makeSlopeTile(col, row, cardinalOf(-dc, -dr)); // downhill = inward
      slope.structural = true;
      room.backgroundObjects.push(slope);
    }
  }
  if (!room.pits) room.pits = [];
  room.pits.push({ col: centerCol, row: centerRow, radius });
  protectRegion(room, { kind: 'circle', centerCol, centerRow, radius });
}

// ── Zone-specific Ascent seeding (unified dispatcher) ──────────────────────
// Called from RoomGenerator.generateAscentRoom() to lay the Ascent's terrain:
// the zone's own layout, or the standard Slope belt plus the zone's hazard
// tiles. Returns true if the zone handled its own bg objects (caller should
// skip generateBackgroundObjects).
export function seedAscentZone(gen, room, centerCol, centerRow, innerRadius, outerRadius) {
  // Cyan replaces the plateau outright: low ground (Pits), not high ground.
  if (room.zone === 'cyan') {
    seedFrozenAscent(gen, room, centerCol, centerRow);
    return false; // standard bg objects around the pond and Pits
  }
  stampSlopeBelt(gen, room, centerCol, centerRow, innerRadius, outerRadius);
  switch (room.zone) {
    case 'red':
      seedMoltenAscentCycle(gen, room, centerCol, centerRow, innerRadius, outerRadius);
      return true; // mud/lava cycle covers the whole grid
    case 'yellow':
      seedStormAscent(gen, room, centerCol, centerRow, innerRadius, outerRadius);
      return false; // still needs standard bg objects around the spire
    case 'gray':
      seedMistAscent(gen, room, centerCol, centerRow, innerRadius, outerRadius);
      return false; // standard bg objects on the plateau
    default:
      return false; // green: standard bg objects
  }
}

// ── Cyan Zone Ascent: frozen pond + three Pits + the Maw Shadow ─────────────
// Cyan's Ascent teaches the Slope as low ground. The middle is a frozen pond
// with the Maw Shadow drifting beneath it; around it sit three Pits. The
// Shadow's ice volleys (IceAscentSystem) punch holes in the pond and fly
// across the room, and a player down in a Pit is under them — so the room is
// cleared by reading the Shadow and moving between Pits.
const POND_RADIUS = 4;      // cells
const PIT_RADIUS = 2;       // cells
const PIT_DISTANCE = 9;     // cells from the room centre to each Pit's centre

export function seedFrozenAscent(gen, room, centerCol, centerRow) {
  const C = GRID.CELL_SIZE;
  const pondTiles = [];

  for (let col = centerCol - POND_RADIUS; col <= centerCol + POND_RADIUS; col++) {
    for (let row = centerRow - POND_RADIUS; row <= centerRow + POND_RADIUS; row++) {
      if (Math.hypot(col - centerCol, row - centerRow) > POND_RADIUS) continue;
      if (!gen.isValidPosition(col, row, room)) continue;
      const ice = BackgroundObject.createVariant('water', col * C, row * C);
      // Infinity, not 0: BackgroundObject.update ticks waterStateTimer down and
      // thaws back to 'normal' the moment it hits zero, so a 0-second freeze is
      // gone on the first frame. Every other permanent freeze in the codebase
      // (Freeze-Over sweep, ice stream, frost traps) passes Infinity too.
      ice.setWaterState('frozen', Infinity);
      ice.structural = true;
      room.backgroundObjects.push(ice);
      pondTiles.push(ice);
    }
  }
  protectRegion(room, { kind: 'circle', centerCol, centerRow, radius: POND_RADIUS });

  // Three Pits evenly around the pond, rotated at random per room.
  const turn = Math.random() * Math.PI * 2;
  for (let i = 0; i < 3; i++) {
    const angle = turn + i * (Math.PI * 2 / 3);
    stampPit(gen, room,
      Math.round(centerCol + Math.cos(angle) * PIT_DISTANCE),
      Math.round(centerRow + Math.sin(angle) * PIT_DISTANCE),
      PIT_RADIUS);
  }

  // The Maw Shadow, in tile top-left space like the Aquifer arena's
  // (drawSubmergedShadow compares it against tile positions). Kept on
  // `room.ascentIce`, not `room.mawShadow`: that field is the Aquifer's
  // dormant Frosted Maw, which a fishing cast wakes into the Boss fight.
  const x = centerCol * C, y = centerRow * C;
  room.ascentIce = {
    pondTiles,
    mawShadow: { x, y, tx: x, ty: y, volleyTimer: 0, telegraph: 0, erupted: false }
  };
}

// ── Yellow Zone Ascent: storm spire + charged metal ────────────────────────
// Seeds a central conductive spire on the plateau and electrified puddle patches
// on the floor ring. StormAscentSystem drives the lightning-attraction and
// charged-metal cycle.
export function seedStormAscent(gen, room, centerCol, centerRow, innerRadius, outerRadius) {
  const C = GRID.CELL_SIZE;

  // Central spire — conductive, attracts all lightning
  const spireTile = createLightningSpire(centerCol * C, centerRow * C);
  room.backgroundObjects.push(spireTile);

  // Slope tiles: mark as conductive (metal grating)
  for (const obj of room.backgroundObjects) {
    if (!obj.slope) continue;
    obj.conductive = true;
    obj.originalSlopeChar = obj.char;
    obj.originalSlopeDirection = obj.slopeDirection;
  }

  // Floor ring: sporadic electrified puddles
  const floorTiles = [];
  for (let col = 1; col < GRID.COLS - 1; col++) {
    for (let row = 1; row < GRID.ROWS - 1; row++) {
      const dx = col - centerCol;
      const dy = row - centerRow;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= outerRadius) continue;
      if (!gen.isValidPosition(col, row, room)) continue;
      if (Math.random() > 0.3) continue; // 30% puddle coverage
      const puddle = BackgroundObject.createVariant('water', col * C, row * C);
      puddle.conductive = true;
      room.backgroundObjects.push(puddle);
      floorTiles.push(puddle);
    }
  }

  // Track charged metal objects in the room (weapons on ground, etc.)
  room.ascentStorm = {
    phase: 'idle',
    timer: 0,
    spire: spireTile,
    floorTiles,
    chargedObjects: [], // items on ground that got charged
  };
}

// ── Gray Zone Ascent: bone slopes + mist exemption + plateau shrink ────────
// Marks the plateau as mist-exempt and sets up the bone slope push mechanic.
// MistAscentSystem shrinks the plateau radius on room clear.
export function seedMistAscent(gen, room, centerCol, centerRow, innerRadius, outerRadius) {
  const C = GRID.CELL_SIZE;

  // Slope tiles: bone glyphs with grab-on-push
  for (const obj of room.backgroundObjects) {
    if (!obj.slope) continue;
    obj.originalSlopeChar = obj.char;
    obj.originalSlopeDirection = obj.slopeDirection;
    obj.boneSlope = true; // brief grab on push
  }

  room.ascentMist = {
    plateauCenterCol: centerCol,
    plateauCenterRow: centerRow,
    plateauRadius: innerRadius,
    mistExempt: true // GrayZoneSystem reads this to skip fog over plateau
  };
}

// Quagmire Whirlpool: shape a small round Pond (from '~' bg objects) around one
// of the outer pools and tag its center tile as the Whirlpool — plain-looking
// water until the rounds clear, when AquiferSystem activates it and anyone who
// steps on it rides the Aquifer Current. Outer pools only (≥6 cells from room
// center) so the inflow has room to run before it reaches the Confluence. The
// Pond is shallow throughout: lake centers are deep water, which would drown a
// walker on the way to the Whirlpool.
export function placeWhirlpool(gen, room) {
  const nodes = gen.currentLetterTemplate?.lakeZone?.nodes;
  if (!nodes?.length) return;
  const C = GRID.CELL_SIZE;
  const mid = { col: Math.floor(GRID.COLS / 2), row: Math.floor(GRID.ROWS / 2) };
  const outer = nodes.filter(n => Math.hypot(n.col - mid.col, n.row - mid.row) >= 6);
  const pool = outer.length ? outer : nodes;
  const node = pool[Math.floor(Math.random() * pool.length)];
  const R = 2; // pond radius in cells

  const waterAt = (col, row) => room.backgroundObjects.find(o =>
    o.char === '~' && Math.round(o.position.x / C) === col && Math.round(o.position.y / C) === row);

  // Fill a circular disc of shallow water around the node center.
  for (let dr = -R; dr <= R; dr++) {
    for (let dc = -R; dc <= R; dc++) {
      if (dc * dc + dr * dr > R * R) continue;
      const col = node.col + dc, row = node.row + dr;
      if (col < 1 || row < 1 || col >= GRID.COLS - 1 || row >= GRID.ROWS - 1) continue;
      if (room.collisionMap[row]?.[col]) continue;
      const water = waterAt(col, row);
      if (water) water.deepWater = false;
      else room.backgroundObjects.push(new BackgroundObject('~', col * C, row * C));
    }
  }

  const center = waterAt(node.col, node.row);
  if (!center) return;
  center.whirlpool = true;
  room.whirlpool = center;
}

// Scatters 4-7 dense circular clusters of tall grass across the room (density
// scaled by zone/letter-template rules; pre-burned zones seed cut grass
// instead). Returns the cluster centers/radii so the caller can place the
// recipe sign inside natural cover. Sinkholes (seedSinkholes below) are
// seeded after this, against the grass it places.
export function generateGrassSwaths(gen, room) {
  // Check grass density: template overrides zone (default 100%)
  const zone = ZONES[room.zone];
  const features = zone?.environmentalFeatures;
  let grassDensity = features?.grassDensity !== undefined ? features.grassDensity : 1.0;

  // Letter template grass density overrides zone density
  if (gen.currentLetterTemplate?.bgObjectRules?.grassDensity !== undefined) {
    grassDensity = gen.currentLetterTemplate.bgObjectRules.grassDensity;
  }

  const grassPreburned = features?.grassPreburned || false;

  // Generate 4-7 dense clusters of tall grass (scaled by density)
  const baseSwathCount = gen.randInt(4, 7);
  const swathCount = Math.max(1, Math.round(baseSwathCount * grassDensity));
  const clusters = []; // Track cluster positions for recipe sign placement

  for (let i = 0; i < swathCount; i++) {
    const centerPos = gen.getRandomPosition(room.collisionMap, room.enemies, room.playerStartPos);
    if (!centerPos) continue;
    const baseSwathSize = gen.randInt(20, 40);
    const swathSize = Math.round(baseSwathSize * grassDensity); // Scale by density
    const swathRadius = gen.randInt(32, 64); // Tight clustering

    // Store cluster info
    clusters.push({ center: centerPos, radius: swathRadius });

    for (let j = 0; j < swathSize; j++) {
      const angle = Math.random() * Math.PI * 2;
      // Square root for more even distribution
      const dist = Math.sqrt(Math.random()) * swathRadius;
      const pos = {
        x: centerPos.x + Math.cos(angle) * dist,
        y: centerPos.y + Math.sin(angle) * dist
      };

      // Check bounds
      if (pos.x >= GRID.CELL_SIZE && pos.x < GRID.WIDTH - GRID.CELL_SIZE &&
          pos.y >= GRID.CELL_SIZE && pos.y < GRID.HEIGHT - GRID.CELL_SIZE) {
        // Create grass (use cut grass ',' for pre-burned zones)
        const grassChar = grassPreburned ? ',' : '|';
        const grass1 = new BackgroundObject(grassChar, pos.x, pos.y);
        const grass2 = new BackgroundObject(grassChar, pos.x + 6, pos.y);

        // Hide surface grass when the player descends into a plane-1 cave
        // (Sinkhole dive in a Grass room reuses this same grid — see
        // SinkholeSystem). ExploreRenderer's shouldRenderBackgroundObject
        // defaults to "render on both planes"; without this flag, plane-0
        // grass would draw on top of/inside the plane-1 cave. Same fix
        // already applied to the surface rock layer above dungeon caves.
        grass1.surfaceOnly = true;
        grass2.surfaceOnly = true;

        // Apply zone grass color (or burned color for pre-burned)
        if (grassPreburned) {
          // Burned grass color
          grass1.color = '#443322';
          grass1.animationColor = '#443322';
          grass1.flammability = 'none';
          grass1.burnt = true;
          grass2.color = '#443322';
          grass2.animationColor = '#443322';
          grass2.flammability = 'none';
          grass2.burnt = true;
        } else if (gen.currentEnvironmentColors) {
          // Normal zone grass color
          grass1.color = gen.currentEnvironmentColors.grass;
          grass1.animationColor = gen.currentEnvironmentColors.grass;
          grass2.color = gen.currentEnvironmentColors.grass;
          grass2.animationColor = gen.currentEnvironmentColors.grass;
        }

        // Check clearing zone before placing grass
        if (!gen.isInClearingZone(pos.x, pos.y)) {
          room.backgroundObjects.push(grass1);
          room.backgroundObjects.push(grass2);
        }
      }
    }
  }

  return clusters; // Return cluster positions for recipe sign placement
}

// Seeds at most ONE concealed Sinkhole into a G room's already-placed grass
// swaths. One is a hard structural ceiling, not a balance dial: diving a
// Sinkhole carves its cave directly into this room's own backgroundObjects and
// overwrites room.underground (see SinkholeSystem._generateSinkholeCave), so a
// second hole in the same room lays a second cave over the first — two sets of
// walls in one grid, with each cave's river exit fenced off by the other's
// walls. That is a softlock, since plane 1 has no room exits of its own.
//
// Grass is scattered as continuous pixel positions in circular clusters (not
// grid cells), so adjacency is measured by pixel radius around a randomly
// chosen anchor grass tile rather than an 8-neighborhood grid check. The
// anchor cell itself is ordinary grass pre-reveal — cutting it is no
// different from cutting any neighbor, so it isn't tracked specially.
export function seedSinkholes(gen, room) {
  if (room.exitLetter !== 'G') return;
  room.sinkholes = [];

  const grassObjects = room.backgroundObjects.filter(obj => obj.char === '|');
  if (grassObjects.length < 3) return;

  // Two thirds of G rooms get a site. That is exactly the "at least one"
  // rate the old uniform 0-2 roll produced, so capping the count changes how
  // many holes a room can hold without changing how often one is there.
  if (Math.random() < 1 / 3) return;

  const anchor = grassObjects[Math.floor(Math.random() * grassObjects.length)];
  const adjacencyRadius = GRID.CELL_SIZE * 1.5;

  const adjacentGrass = grassObjects.filter(g => {
    if (g === anchor) return false;
    const dx = g.position.x - anchor.position.x;
    const dy = g.position.y - anchor.position.y;
    return Math.sqrt(dx * dx + dy * dy) <= adjacencyRadius;
  });

  // Too few neighbors to ever reach majority-cut — skip so every seeded
  // Sinkhole is guaranteed revealable.
  if (adjacentGrass.length < 3) return;

  room.sinkholes.push({
    col: anchor.position.x,
    row: anchor.position.y,
    anchor,
    revealed: false,
    adjacentGrass,
    cutSet: new Set(),
    glyphObj: null,
    cave: null
  });
}

// BFS over a cave grid's open cells (0 = passage, 1 = wall) from a start
// cell, returning the farthest reachable cell and the path to it. Unweighted
// BFS visits cells in strict distance order, so the last cell dequeued is
// guaranteed farthest from the start — the standard trick for carving a
// guaranteed river/trail that never crosses a wall (a straight Manhattan
// line, as used elsewhere for the false-obsidian vein trail, can't make that
// guarantee against an irregular cellular-automata cave).
export function bfsFarthestOpenPath(caveGrid, startCol, startRow, isBlockedExtra) {
  const ROWS = caveGrid.length, COLS = caveGrid[0].length;
  const isOpen = (col, row) =>
    row > 0 && row < ROWS - 1 && col > 0 && col < COLS - 1 &&
    caveGrid[row][col] === 0 && !(isBlockedExtra && isBlockedExtra(col, row));

  const key = (c, r) => `${c},${r}`;
  const visited = new Set([key(startCol, startRow)]);
  const prev = new Map();
  const queue = [{ col: startCol, row: startRow }];
  let far = { col: startCol, row: startRow };

  while (queue.length) {
    const cur = queue.shift();
    far = cur;
    const neighbors = [
      { col: cur.col + 1, row: cur.row }, { col: cur.col - 1, row: cur.row },
      { col: cur.col, row: cur.row + 1 }, { col: cur.col, row: cur.row - 1 }
    ];
    for (const n of neighbors) {
      if (!isOpen(n.col, n.row)) continue;
      const k = key(n.col, n.row);
      if (visited.has(k)) continue;
      visited.add(k);
      prev.set(k, cur);
      queue.push(n);
    }
  }

  const path = [];
  let cur = far;
  while (cur && !(cur.col === startCol && cur.row === startRow)) {
    path.push(cur);
    cur = prev.get(key(cur.col, cur.row));
  }
  path.push({ col: startCol, row: startRow });
  path.reverse();

  return { farCell: far, path };
}

// Force-injects a guaranteed lake + river trail into a yellow-zone
// underground room, gated by RoomGenerator._forceSinkholeArrival (set only
// by SinkholeSystem's cross-zone hand-off, cleared immediately on read).
// Normal yellow U rooms reached via ordinary exits never call this.
export function injectSinkholeLake(gen, room) {
  const underground = room.underground;
  if (!underground) return;
  const { caveGrid, clearings } = underground;
  const COLS = GRID.COLS, ROWS = GRID.ROWS;
  const isInClearing = (col, row) =>
    clearings.some(c => col >= c.minCol && col <= c.maxCol && row >= c.minRow && row <= c.maxRow);
  const occupied = (col, row) => {
    const x = col * GRID.CELL_SIZE, y = row * GRID.CELL_SIZE;
    return room.backgroundObjects.some(o => !o.surfaceOnly && o.position.x === x && o.position.y === y);
  };
  const canStampWater = (col, row) =>
    caveGrid[row]?.[col] === 0 && !isInClearing(col, row) &&
    !isCaveEntranceLanding(col, row) && !occupied(col, row);

  const openCells = [];
  for (let r = 1; r < ROWS - 1; r++) {
    for (let c = 1; c < COLS - 1; c++) {
      if (canStampWater(c, r)) openCells.push({ col: c, row: r });
    }
  }
  // Too little open cave to safely carve a lake — leave the room as a normal
  // (lakeless) underground room rather than risk stamping into a wall.
  if (openCells.length < 8) return;

  const centerCol = Math.floor(COLS / 2), centerRow = Math.floor(ROWS / 2);
  const lakeCenter = openCells.reduce((best, cell) => {
    const dist = Math.abs(cell.col - centerCol) + Math.abs(cell.row - centerRow);
    return (!best || dist < best.dist) ? { cell, dist } : best;
  }, null).cell;

  const LAKE_RADIUS = 2;
  const lakeKeys = new Set();
  for (let dr = -LAKE_RADIUS; dr <= LAKE_RADIUS; dr++) {
    for (let dc = -LAKE_RADIUS; dc <= LAKE_RADIUS; dc++) {
      if (dc * dc + dr * dr > LAKE_RADIUS * LAKE_RADIUS) continue;
      const col = lakeCenter.col + dc, row = lakeCenter.row + dr;
      if (!canStampWater(col, row)) continue;
      lakeKeys.add(`${col},${row}`);
      room.backgroundObjects.push(new BackgroundObject('≈', col * GRID.CELL_SIZE, row * GRID.CELL_SIZE));
    }
  }

  // River trail: guaranteed-open BFS path from the lake out to the farthest
  // reachable cave cell — that far end is where the player arrives.
  const { farCell, path } = bfsFarthestOpenPath(caveGrid, lakeCenter.col, lakeCenter.row, isInClearing);
  for (const { col, row } of path) {
    const k = `${col},${row}`;
    if (lakeKeys.has(k) || !canStampWater(col, row)) continue;
    lakeKeys.add(k);
    room.backgroundObjects.push(new BackgroundObject('≈', col * GRID.CELL_SIZE, row * GRID.CELL_SIZE));
  }

  room._sinkholeArrivalSpawn = { x: farCell.col * GRID.CELL_SIZE, y: farCell.row * GRID.CELL_SIZE };
}

/** Rotates a 2D boolean/char pattern clockwise by 0/90/180/270 degrees. */
export function rotatePattern(pattern, degrees) {
  if (degrees === 0) return pattern;

  let rotated = pattern;
  const times = degrees / 90;

  for (let i = 0; i < times; i++) {
    const height = rotated.length;
    const width = rotated[0].length;
    const newPattern = [];

    // Rotate 90 degrees clockwise
    for (let x = 0; x < width; x++) {
      const newRow = [];
      for (let y = height - 1; y >= 0; y--) {
        newRow.push(rotated[y][x]);
      }
      newPattern.push(newRow);
    }

    rotated = newPattern;
  }

  return rotated;
}

function cellInRegion(col, row, region) {
  switch (region.kind) {
    case 'rect':
      return col >= region.minCol && col <= region.maxCol &&
             row >= region.minRow && row <= region.maxRow;
    case 'rows':
      return row >= region.minRow && row <= region.maxRow;
    case 'circle': {
      const dc = col - region.centerCol;
      const dr = row - region.centerRow;
      return Math.sqrt(dc * dc + dr * dr) <= region.radius;
    }
    case 'cells':
      return region.cells.some(c => c.col === col && c.row === row);
  }
  return false;
}

/** True when the cell falls inside any of the room's protected regions. */
export function isCellProtected(room, col, row) {
  return (room.protectedRegions || []).some(region => cellInRegion(col, row, region));
}

// Sealed regions are the footprints of structures the player has no walkable
// route into — the Maze shell being the first: its perimeter is solid and the
// only way in is the door, which teleports the player to the separate interior.
// Ordinary movement can never breach one, but a teleport (the Yellow Mage's
// blink) crosses the wall and strands the player inside with no way out. Any
// code that places the player at a position they did not walk to must refuse a
// sealed cell.
/** True when the cell falls inside any of the room's sealed structure regions. */
export function isCellSealed(room, col, row) {
  return (room?.sealedRegions || []).some(region => cellInRegion(col, row, region));
}

// Grass bends up to ±¼ cell at runtime (main.js grass bending), so its
// footprint gets horizontal slop beyond the glyph box.
const GRASS_CHARS = new Set(['|', '\\', '/', ',']);
const GRASS_SWAY_PX = GRID.CELL_SIZE * 0.25;

export function cleanupStrayBackgroundObjects(room) {
  const CS = GRID.CELL_SIZE;
  room.backgroundObjects = room.backgroundObjects.filter(obj => {
    if (obj.structural) return true;
    // Full render mass, not just the anchor cell: glyphs draw in a CELL_SIZE
    // box at position, and grass/cluster objects sit at float pixel positions
    // — an anchor in a legal cell can still bleed onto a wall or structure.
    const slop = GRASS_CHARS.has(obj.char) ? GRASS_SWAY_PX : 0;
    const c0 = Math.floor((obj.position.x - slop) / CS);
    const c1 = Math.floor((obj.position.x + CS - 1 + slop) / CS);
    const r0 = Math.floor(obj.position.y / CS);
    const r1 = Math.floor((obj.position.y + CS - 1) / CS);
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) {
        // Room border walls — always protected, no registration needed.
        if (col <= 0 || col >= GRID.COLS - 1 || row <= 0 || row >= GRID.ROWS - 1) return false;
        if (isCellProtected(room, col, row)) return false;
      }
    }
    return true;
  });
}

// Same adjacency radius InteractionSystem.update() uses for its throttled
// lava/water solidify + lava-ignites-flammable-neighbor checks. Reused here
// so generation resolves a room to the same end state that runtime would
// converge to anyway, instead of the room visibly igniting/solidifying
// within the first 0.5s after the player walks in.
const LAVA_ADJACENT_PX = GRID.CELL_SIZE * 1.5;

function withinLavaRadius(a, b) {
  const dx = a.position.x - b.position.x;
  const dy = a.position.y - b.position.y;
  return dx * dx + dy * dy <= LAVA_ADJACENT_PX * LAVA_ADJACENT_PX;
}

// Final pass: resolve lava that generation placed on/near water or flammable
// background objects — zone-agnostic, since lava can land in a room whose
// room.zone isn't red (effectiveZone blending, W→R depth conversions, etc).
// Mirrors InteractionSystem's runtime rules exactly (water quenches lava;
// lava burns flammable neighbors) so nothing needs to react on room entry.
export function resolveLavaHazards(room) {
  const lavas = room.backgroundObjects.filter(obj => obj.isLava && obj.isLava());
  for (const lava of lavas) {
    const nearWater = room.backgroundObjects.some(other =>
      other !== lava && !other.destroyed &&
      ((other.isWater && other.isWater()) || other.char === '=') &&
      withinLavaRadius(lava, other)
    );
    if (nearWater) lava.solidifyToRock();
  }

  // Re-check isLava() per lava below: solidified ones no longer qualify, so
  // flammable objects only near a solidified (now-rock) tile are spared.
  room.backgroundObjects = room.backgroundObjects.filter(obj => {
    if (obj.structural) return true;
    if (!obj.isFlammable || !obj.isFlammable()) return true;
    return !lavas.some(lava => lava.isLava() && withinLavaRadius(lava, obj));
  });
}

// Darken a hex color by a percentage (0.5 = 50% darker).
export function darkenColor(hexColor, percent) {
  const clean = hexColor.replace('#', '');
  const toHex = (n) => n.toString(16).padStart(2, '0');
  return '#' + [0, 2, 4].map(i => {
    const channel = parseInt(clean.substring(i, i + 2), 16);
    return toHex(Math.round(channel * (1 - percent)));
  }).join('');
}

/** True when any of the 4 neighbor cells holds a water/liquid tile. */
export function hasWaterAdjacent(room, col, row) {
  const liquid = new Set(['~', '=']);
  for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const x = (col + dc) * GRID.CELL_SIZE;
    const y = (row + dr) * GRID.CELL_SIZE;
    if (room.backgroundObjects.some(o =>
      liquid.has(o.char) && o.position.x === x && o.position.y === y)) return true;
  }
  return false;
}

/**
 * Vault interior abundance: the key find earns more than one item — fill the
 * cage with chests and barrels around the center-spawned rare item.
 * Returns staged BackgroundObjects (placeVaultStructure only has the
 * collision map; RoomGenerator flushes these into room.backgroundObjects).
 */
export function buildVaultInteriorLoot(bounds, shuffleFn) {
  const { minCol, maxCol, minRow, maxRow, centerCol, centerRow } = bounds;
  const interiorCells = [];
  for (let row = minRow + 1; row <= maxRow - 1; row++) {
    for (let col = minCol + 1; col <= maxCol - 1; col++) {
      if (row === centerRow && col === centerCol) continue; // rare item cell
      interiorCells.push({ col, row });
    }
  }
  shuffleFn(interiorCells);
  const chestCount = 2;
  const barrelCount = 2 + Math.floor(Math.random() * 2); // 2–3
  const fillChars = [
    ...Array(chestCount).fill('⊞'),
    ...Array(barrelCount).fill('p')
  ];
  const loot = [];
  for (let i = 0; i < fillChars.length && i < interiorCells.length; i++) {
    const { col, row } = interiorCells[i];
    const obj = new BackgroundObject(
      fillChars[i],
      col * GRID.CELL_SIZE,
      row * GRID.CELL_SIZE
    );
    obj.structural = true; // vault-owned — exempt from stray cleanup
    loot.push(obj);
  }
  return loot;
}

/**
 * Spawn non-gravitating coin ingredients inside a vault. Returns an array
 * of Ingredient entities ready to be flushed into game.ingredients.
 */
export function buildVaultCoinAbundance(bounds, shuffleFn, count) {
  const { minCol, maxCol, minRow, maxRow, centerCol, centerRow } = bounds;
  const interiorCells = [];
  for (let row = minRow + 1; row <= maxRow - 1; row++) {
    for (let col = minCol + 1; col <= maxCol - 1; col++) {
      if (row === centerRow && col === centerCol) continue;
      interiorCells.push({ col, row });
    }
  }
  shuffleFn(interiorCells);
  const coins = [];
  const coinCount = Math.min(count, interiorCells.length);
  for (let i = 0; i < coinCount; i++) {
    const { col, row } = interiorCells[i];
    const coin = new Ingredient('c', col * GRID.CELL_SIZE, row * GRID.CELL_SIZE);
    coin.noGravitate = true;
    coin.pickupCooldown = 0;
    coins.push(coin);
  }
  return coins;
}

// Per-zone Vault (V room) unlock method (K room retired 2026-09-20 — see
// bug-inbox and resolved-bugs.md; each zone now guards its Vault a
// different way, matching the zone's own verb rather than one shared key):
//   green  — a key rock stands just south of the cage; break it for the Vault Key
//   gray   — Skull Key ('⚿', shared with the dungeon's own gate) — no drop
//            source exists yet, placeholder until a quest is authored
//   red    — Red Warrior's damage roll, a boulder, or a bomb breaks the wall
//   yellow — no unlock at all; only Yellow Mage's blink (which already
//            ignores collisionMap, see WarpSystem) gets past it
//   cyan   — a switch buried in deep snow just outside the cage
// Missing zones (blue, and any future zone) fall back to 'none' — same as
// yellow, sealed except by blink. InteractionSystem's canUnlockVault/
// unlockVault, tryBreakVaultWall, and canActivateVaultSwitch/
// activateVaultSwitch all read the resulting unlockMethod off vaultInfo.
// `bombable` is a second way in on top of the zone's own method: a Bomb blast
// at the wall opens it (InteractionSystem.tryBombVaultWall). Yellow alone
// stays blink-only, so it is not bombable.
export const VAULT_UNLOCK_BY_ZONE = {
  green: { method: 'key', keyChar: '߃', dropsKeyRock: true, bombable: true },
  gray: { method: 'key', keyChar: '⚿', bombable: true },
  red: { method: 'break', bombable: true },
  cyan: { method: 'switch', bombable: true },
  yellow: { method: 'none' },
};

/**
 * Resolve a Vault's per-zone unlock method and build whatever extra
 * BackgroundObjects it needs (green's key rock, cyan's buried switch, the
 * Bombable Wall row of a bombable Vault).
 * `applyZoneProperties(obj, zone)` is passed in rather than imported, since
 * it's a RoomGenerator instance method. Returns
 * { unlockConfig, extraLoot, switchObject, wallObjects } — extraLoot is
 * pushed onto the vault's pending loot by the caller; switchObject and
 * wallObjects are stored on vaultInfo so InteractionSystem can check
 * `.compacted` and crack the wall row.
 */
export function buildVaultUnlockExtras(zoneType, { centerCol, minCol, maxCol, maxRow }, applyZoneProperties) {
  const unlockConfig = VAULT_UNLOCK_BY_ZONE[zoneType] || { method: 'none' };
  const extraLoot = [];
  let switchObject = null;
  const wallObjects = [];

  // Bombable Vault: its bottom wall is a row of Bombable Walls, the same
  // object the Puzzle Room uses, so it shakes when struck — the tell that a
  // bomb will open it. structural keeps cleanupStrayBackgroundObjects from
  // stripping them off the protected wall cells. InteractionSystem.
  // _openVaultWall cracks the whole row whichever way the Vault opens.
  if (unlockConfig.bombable && maxRow < GRID.ROWS - 1) {
    for (let col = Math.max(minCol, 1); col <= Math.min(maxCol, GRID.COLS - 2); col++) {
      const wall = new BackgroundObject('≡', col * GRID.CELL_SIZE, maxRow * GRID.CELL_SIZE, { typeId: 'bombable_wall' });
      wall.structural = true;
      wallObjects.push(wall);
      extraLoot.push(wall);
    }
  }

  // Green zone: the key rock stands just south of the cage (K room retired
  // — this replaces the separate Key Room letter with a rock right at the
  // Vault door). Same 'dropsKey'/'keyChar' contract as the dungeon's Skull
  // Key bone pile (DungeonFloorGenerator._placeSkullIfDue).
  if (unlockConfig.method === 'key' && unlockConfig.dropsKeyRock) {
    const rockCol = centerCol;
    const rockRow = Math.min(maxRow + 2, GRID.ROWS - 2);
    const keyRock = new BackgroundObject('0', rockCol * GRID.CELL_SIZE, rockRow * GRID.CELL_SIZE);
    applyZoneProperties(keyRock, zoneType);
    keyRock.dropsKey = true;
    keyRock.keyChar = unlockConfig.keyChar;
    extraLoot.push(keyRock);
  }

  // Cyan zone: a switch buried under deep snow just south of the cage.
  // Reuses the existing snow-compaction mechanic (PhysicsSystem — any
  // mass-bearing entity walking over deep snow compacts it) rather than a
  // bespoke digging system; vaultSwitch flags this particular tile for
  // InteractionSystem's canActivateVaultSwitch/activateVaultSwitch.
  if (unlockConfig.method === 'switch') {
    const switchCol = centerCol;
    const switchRow = Math.min(maxRow + 1, GRID.ROWS - 2);
    switchObject = BackgroundObject.createVariant(
      'snow_deep', switchCol * GRID.CELL_SIZE, switchRow * GRID.CELL_SIZE
    );
    switchObject.compacted = false;
    switchObject.compactor = null;
    switchObject.vaultSwitch = true;
    extraLoot.push(switchObject);
  }

  return { unlockConfig, extraLoot, switchObject, wallObjects };
}

/**
 * Find a valid spawn position on a circular island. Returns {x, y} pixel
 * coordinates, or the island center as fallback.
 */
export function getIslandPosition(islandConfig, collisionMap, existingEnemies = [], playerStartPos = null, backgroundObjects = []) {
  const { islandCenterCol, islandCenterRow, islandRadius, edgeNoise } = islandConfig;
  const islandInner = islandRadius - edgeNoise;
  const spawnRadius = Math.max(islandInner - 1, 1);
  const MIN_SPACING = GRID.CELL_SIZE * 2;
  const PLAYER_BUFFER = GRID.CELL_SIZE * 3;

  for (let attempts = 0; attempts < 200; attempts++) {
    const angle = Math.random() * Math.PI * 2;
    const r = Math.random() * spawnRadius;
    const col = Math.round(islandCenterCol + Math.cos(angle) * r);
    const row = Math.round(islandCenterRow + Math.sin(angle) * r);

    if (col < 1 || col >= GRID.COLS - 1 || row < 1 || row >= GRID.ROWS - 1) continue;
    if (collisionMap[row]?.[col]) continue;

    const pixelX = col * GRID.CELL_SIZE;
    const pixelY = row * GRID.CELL_SIZE;

    if (playerStartPos) {
      const dx = pixelX - playerStartPos.x;
      const dy = pixelY - playerStartPos.y;
      if (Math.sqrt(dx * dx + dy * dy) < PLAYER_BUFFER) continue;
    }

    let tooClose = false;
    for (const e of existingEnemies) {
      const dx = pixelX - e.position.x;
      const dy = pixelY - e.position.y;
      if (Math.sqrt(dx * dx + dy * dy) < MIN_SPACING) { tooClose = true; break; }
    }
    if (tooClose) continue;

    let blocked = false;
    for (const obj of backgroundObjects) {
      if (obj.solid) {
        const dx = pixelX - obj.position.x;
        const dy = pixelY - obj.position.y;
        if (Math.abs(dx) < GRID.CELL_SIZE && Math.abs(dy) < GRID.CELL_SIZE) { blocked = true; break; }
      }
    }
    if (blocked) continue;

    return { x: pixelX, y: pixelY };
  }

  // Fallback to any position on the island center
  return { x: islandCenterCol * GRID.CELL_SIZE, y: islandCenterRow * GRID.CELL_SIZE };
}

/**
 * Bats spawn as one flock per room: depth-scaled size (max 5), clustered
 * around a single anchor, sharing one roost/flight mode roll. Perched flocks
 * start dormant ('rest') and settle onto trees/stumps via FlockMechanic;
 * airborne flocks swirl as a group that drifts across the player's path.
 * Any flockBehavior enemy (Bat '^', Fire Bat 'f') spawns this way.
 * Returns true when at least one bat spawned (caller skips further picks of that bat).
 */
export function spawnBatFlock(gen, room, clusterAnchors, islandConfig, batChar = '^') {
  const flockSize = Math.min(1 + Math.floor(gen.currentDepth / 2), 5);
  const perched = Math.random() < (ENEMIES[batChar].flockBehavior?.perchChance ?? 0.5);
  const anchor = clusterAnchors.length > 0
    ? clusterAnchors[Math.floor(Math.random() * clusterAnchors.length)]
    : null;
  let spawned = 0;
  for (let i = 0; i < flockSize; i++) {
    let pos = anchor
      ? gen.getClusteredPosition(anchor, room.collisionMap, room.enemies, room.playerStartPos, room.backgroundObjects, false)
      : null;
    if (!pos) {
      pos = islandConfig
        ? getIslandPosition(islandConfig, room.collisionMap, room.enemies, room.playerStartPos, room.backgroundObjects)
        : gen.getRandomPosition(room.collisionMap, room.enemies, room.playerStartPos, room.backgroundObjects, false);
    }
    if (!pos) continue;
    const bat = new Enemy(batChar, pos.x, pos.y, gen.currentDepth);
    bat.flockMode = perched ? 'perch' : 'swirl';
    if (perched) bat.state = 'rest';
    bat.setCollisionMap(room.collisionMap);
    bat.setBackgroundObjects(room.backgroundObjects);
    gen.addEnemyToRoom(room, bat);
    spawned++;
  }
  return spawned > 0;
}

/**
 * Bat Belfry set piece: 15 dormant bats in cave passages (plane 1).
 * flockNoCascade keeps the room's designed pacing — belfry bats wake
 * individually by proximity instead of the flock take-off cascade.
 */
export function spawnBelfryBats(gen, room, batCandidates, isInClearing) {
  const usedCells = new Set();
  let batsSpawned = 0;
  for (const cell of batCandidates) {
    if (batsSpawned >= 15) break;
    const key = `${cell.col},${cell.row}`;
    if (usedCells.has(key)) continue;
    if (isInClearing(cell.col, cell.row)) continue;
    usedCells.add(key);
    const bat = new Enemy('^', cell.col * GRID.CELL_SIZE, cell.row * GRID.CELL_SIZE, gen.currentDepth);
    bat.plane = 1;
    bat.state = 'rest';
    bat.flockMode = 'perch';
    bat.flockNoCascade = true;
    bat.setCollisionMap(room.collisionMap);
    bat.setBackgroundObjects(room.backgroundObjects);
    gen.addEnemyToRoom(room, bat);
    batsSpawned++;
  }
}

/**
 * Stamps one hut's footprint (walls, door, interior dark-fill, optional
 * witch chicken-legs) onto `room` and returns the hut record. Shared by
 * RoomGenerator.generateHutRoom() (single random hut) and
 * generateSettlementRoom() below (fixed press/wise_man/alchemy trio).
 */
export function stampHutFootprint(room, { centerCol, centerRow, hutKind, raised = false }) {
  const halfW = 2;
  const halfH = 2;
  const minCol = centerCol - halfW;
  const maxCol = centerCol + halfW;
  const minRow = centerRow - halfH;
  const maxRow = centerRow + halfH;

  const wallObjects = [];
  const interiorObjects = [];
  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      room.collisionMap[row][col] = true;
      const isWall = row === minRow || row === maxRow || col === minCol || col === maxCol;
      if (!isWall) {
        const fill = new BackgroundObject('█', col * GRID.CELL_SIZE, row * GRID.CELL_SIZE);
        fill.structural = true;
        room.backgroundObjects.push(fill);
        interiorObjects.push(fill);
        continue;
      }
      if (row === maxRow && col === centerCol) continue;
      const wallObj = new BackgroundObject('≡', col * GRID.CELL_SIZE, row * GRID.CELL_SIZE);
      wallObj.structural = true;
      room.backgroundObjects.push(wallObj);
      wallObjects.push(wallObj);
    }
  }

  const doorCol = centerCol;
  const doorRow = maxRow;
  const doorObj = new BackgroundObject('∩', doorCol * GRID.CELL_SIZE, doorRow * GRID.CELL_SIZE);
  doorObj.structural = true;
  room.backgroundObjects.push(doorObj);

  // Witch huts rest atop two chicken legs: door unreachable until SIT/SITDOWN
  // lowers the hut. Legs are passable but bullet-blocking, so they shake when struck.
  const legObjects = [];
  if (raised) {
    const legCols = [centerCol - 1, centerCol + 1];
    const legRows = [maxRow + 1, maxRow + 2];
    for (const lc of legCols) {
      for (const lr of legRows) {
        if (lr >= GRID.ROWS - 1) continue;
        const leg = new BackgroundObject('ⲗ', lc * GRID.CELL_SIZE, lr * GRID.CELL_SIZE);
        leg.structural = true;
        room.backgroundObjects.push(leg);
        legObjects.push(leg);
      }
    }
  }

  return {
    exteriorBounds: { minCol, maxCol, minRow, maxRow },
    doorPosition: { col: doorCol, row: doorRow },
    hutKind,
    interiorGenerated: false,
    raised,
    verticalShift: raised ? 2 : 0,
    wallObjects,
    doorObject: doorObj,
    interiorObjects,
    legObjects
  };
}

function shuffled(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Footprint bounding boxes overlap (or sit closer than `buffer` cells apart).
// Each exit's spawn cell (where an entering player lands) — matches
// getRandomPosition's exit zones in RoomGenerator.
function exitSpawnCells() {
  const centerCol = Math.floor(GRID.COLS / 2);
  const centerRow = Math.floor(GRID.ROWS / 2);
  return [
    { col: centerCol, row: 2 }, { col: centerCol, row: GRID.ROWS - 3 },
    { col: GRID.COLS - 3, row: centerRow }, { col: 2, row: centerRow },
  ];
}

// Cells kept clear of solid structures around each exit spawn cell, so an
// entering player never lands inside or pinned against a footprint.
const STRUCTURE_EXIT_CLEARANCE = 3;

function footprintBlocksExit(bounds) {
  return exitSpawnCells().some(e =>
    e.col >= bounds.minCol - STRUCTURE_EXIT_CLEARANCE && e.col <= bounds.maxCol + STRUCTURE_EXIT_CLEARANCE &&
    e.row >= bounds.minRow - STRUCTURE_EXIT_CLEARANCE && e.row <= bounds.maxRow + STRUCTURE_EXIT_CLEARANCE);
}

function footprintsTooClose(a, b, buffer) {
  return !(a.maxCol + buffer < b.minCol || b.maxCol + buffer < a.minCol ||
           a.maxRow + buffer < b.minRow || b.maxRow + buffer < a.minRow);
}

// Center-position range for randomized hut placement — keeps every
// footprint (half-width 2) well clear of the room border and south exit.
const SETTLEMENT_CENTER_MIN = 4;
const SETTLEMENT_CENTER_SPAN = 22; // centers land in [4, 25]
const SETTLEMENT_HUT_BUFFER = 1; // min empty-cell gap between hut footprints

/**
 * Stamp the Shed: a tiny 3×3 hut with a ▄ Shed Door entrance (only isSmall
 * entities can enter, until the Shed Key opens it — HutSystem._tryShedDoor).
 * Returns a hut record compatible with HutSystem._findNearbyHut.
 */
export function stampShedFootprint(room, { centerCol, centerRow }) {
  const halfW = 1;
  const halfH = 1;
  const minCol = centerCol - halfW;
  const maxCol = centerCol + halfW;
  const minRow = centerRow - halfH;
  const maxRow = centerRow + halfH;

  const wallObjects = [];
  const interiorObjects = [];
  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      room.collisionMap[row][col] = true;
      const isWall = row === minRow || row === maxRow || col === minCol || col === maxCol;
      if (!isWall) {
        const fill = new BackgroundObject('█', col * GRID.CELL_SIZE, row * GRID.CELL_SIZE);
        fill.structural = true;
        room.backgroundObjects.push(fill);
        interiorObjects.push(fill);
        continue;
      }
      // Skip the south-center cell — that's the small door
      if (row === maxRow && col === centerCol) continue;
      const wallObj = new BackgroundObject('≡', col * GRID.CELL_SIZE, row * GRID.CELL_SIZE);
      wallObj.structural = true;
      room.backgroundObjects.push(wallObj);
      wallObjects.push(wallObj);
    }
  }

  // Shed Door (▄) at south-center — only isSmall entities can pass
  const doorCol = centerCol;
  const doorRow = maxRow;
  const doorObj = new BackgroundObject('▄', doorCol * GRID.CELL_SIZE, doorRow * GRID.CELL_SIZE);
  doorObj.structural = true;
  room.backgroundObjects.push(doorObj);

  return {
    exteriorBounds: { minCol, maxCol, minRow, maxRow },
    doorPosition: { col: doorCol, row: doorRow },
    hutKind: 'shed',
    unlocked: false, // the Shed Key turned the small door into a full one
    interiorGenerated: false,
    raised: false,
    verticalShift: 0,
    wallObjects,
    doorObject: doorObj,
    interiorObjects,
    legObjects: []
  };
}

// Odds a Settlement includes the Shopkeeper's hut. Applied before the other
// kinds are drawn, so it is the real appearance rate rather than a weight
// competing with the rest of settlementHutPool.
const SETTLEMENT_SHOP_CHANCE = 0.75;
const SETTLEMENT_SHOP_KIND = 'shopkeeper';

/**
 * Settlement room ('S') — 2-3 neutral huts drawn at random from
 * `template.settlementHutPool`, placed at random non-overlapping positions
 * (never enemy_encounter or witch). Builds `room.huts[]` (plural — see
 * HutSystem._findNearbyHut) and never locks exits since Settlement is
 * always neutral.
 */
export function generateSettlementRoom(gen, room) {
  const pool = gen.currentLetterTemplate?.settlementHutPool ?? [];
  const hutCount = Math.min(pool.length, 2 + Math.floor(Math.random() * 2)); // 2-3

  // The Shopkeeper is drawn first, at its own rate, before the rest of the
  // slots are filled at random. A flat shuffle over a 7-kind pool put the shop
  // in only ~36% of Settlements, which is too rare for a counter whose stock
  // is meant to track the run's progress — the player has to be able to find
  // it again after pushing deeper (see Shopkeeper.refreshStock).
  const wantsShop = pool.includes(SETTLEMENT_SHOP_KIND)
    && Math.random() < SETTLEMENT_SHOP_CHANCE;
  const rest = shuffled(pool.filter(k => k !== SETTLEMENT_SHOP_KIND));
  const chosenKinds = wantsShop
    ? shuffled([SETTLEMENT_SHOP_KIND, ...rest.slice(0, hutCount - 1)])
    : rest.slice(0, hutCount);

  const placedBounds = [];
  room.huts = [];
  for (const hutKind of chosenKinds) {
    let chosenCenter = null;
    for (let attempt = 0; attempt < 40; attempt++) {
      const centerCol = SETTLEMENT_CENTER_MIN + Math.floor(Math.random() * SETTLEMENT_CENTER_SPAN);
      const centerRow = SETTLEMENT_CENTER_MIN + Math.floor(Math.random() * SETTLEMENT_CENTER_SPAN);
      const candidate = { minCol: centerCol - 2, maxCol: centerCol + 2, minRow: centerRow - 2, maxRow: centerRow + 2 };
      if (footprintBlocksExit(candidate)) continue;
      if (placedBounds.some(b => footprintsTooClose(candidate, b, SETTLEMENT_HUT_BUFFER))) continue;
      chosenCenter = { centerCol, centerRow };
      break;
    }
    if (!chosenCenter) continue; // no free spot found — skip rather than overlap

    const hut = stampHutFootprint(room, { ...chosenCenter, hutKind });
    const { minCol, maxCol, minRow, maxRow } = hut.exteriorBounds;
    placedBounds.push({ minCol, maxCol, minRow, maxRow });
    protectRegion(room, { kind: 'rect', minCol, maxCol, minRow, maxRow });
    room.huts.push(hut);
  }

  // 50% chance: a Shed (tiny 3×3, ▄ entrance, Frog Coin inside)
  if (Math.random() < 0.5) {
    for (let attempt = 0; attempt < 40; attempt++) {
      const centerCol = SETTLEMENT_CENTER_MIN + Math.floor(Math.random() * SETTLEMENT_CENTER_SPAN);
      const centerRow = SETTLEMENT_CENTER_MIN + Math.floor(Math.random() * SETTLEMENT_CENTER_SPAN);
      const candidate = { minCol: centerCol - 1, maxCol: centerCol + 1, minRow: centerRow - 1, maxRow: centerRow + 1 };
      if (footprintBlocksExit(candidate)) continue;
      if (placedBounds.some(b => footprintsTooClose(candidate, b, SETTLEMENT_HUT_BUFFER))) continue;
      const shed = stampShedFootprint(room, { centerCol, centerRow });
      const { minCol, maxCol, minRow, maxRow } = shed.exteriorBounds;
      placedBounds.push({ minCol, maxCol, minRow, maxRow });
      protectRegion(room, { kind: 'rect', minCol, maxCol, minRow, maxRow });
      room.huts.push(shed);
      break;
    }
  }

  // Errand NPC: used to require entering a dedicated 'neutral_npc' Settlement
  // hut; now roams the open Settlement ground directly instead, at a roll
  // approximating that hut kind's old odds of landing one of the pool's 2-3
  // slots. Mirrors the lakeFisherman pattern — stored on room.settlementErrand,
  // pushed into game.neutralCharacters at room entry (main.js).
  if (Math.random() < 0.40) {
    const errandSystem = gen.game?.errandSystem;
    if (errandSystem) {
      for (let attempt = 0; attempt < 40; attempt++) {
        const centerCol = SETTLEMENT_CENTER_MIN + Math.floor(Math.random() * SETTLEMENT_CENTER_SPAN);
        const centerRow = SETTLEMENT_CENTER_MIN + Math.floor(Math.random() * SETTLEMENT_CENTER_SPAN);
        const candidate = { minCol: centerCol - 1, maxCol: centerCol + 1, minRow: centerRow - 1, maxRow: centerRow + 1 };
        if (placedBounds.some(b => footprintsTooClose(candidate, b, SETTLEMENT_HUT_BUFFER))) continue;
        // After a betrayal, spawnRoomNeutralCharacters swaps it for the
        // hostile enemy on entry (ErrandSystem.replaceBetrayedTravelers).
        room.settlementErrand = errandSystem.createTraveler(
          centerCol * GRID.CELL_SIZE,
          centerRow * GRID.CELL_SIZE,
          { seed: true, player: gen.game.player }
        );
        if (room.settlementErrand) placedBounds.push(candidate);
        break;
      }
    }
  }

  gen.generateBackgroundObjects(room);
  room.exitsLocked = false;
}

/**
 * Pushes every pre-generated / persistent neutral NPC attached to `room`
 * into `game.neutralCharacters` on room entry (Pearl-guide fairy, shore
 * Fisherman, Settlement errand traveler, caldera Weapons Master, roaming
 * Alchemist), and spawns the Errand room's traveler fresh when applicable.
 * Extracted out of main.js's room-entry path (arch budget) — a growing list
 * of "spawns from room generation, joins the fight" NPCs doesn't belong
 * accreting inline in the orchestrator.
 */
export function spawnRoomNeutralCharacters(game, room) {
  // Pearl-guide fairy (O room + pearl in inventory): pre-spawned at room
  // generation; lives in neutralCharacters alongside the fight. Suppressed
  // once the fountain has been corrupted.
  if (room.pearlFairy && !room.pearlFairy.consumed && !game.fairiesAngered) {
    game.neutralCharacters.push(room.pearlFairy);
  }

  // Peaceful fishing room (low-depth L/O roll): the shore Fisherman joins
  if (room.lakeFisherman) {
    game.neutralCharacters.push(room.lakeFisherman);
  }

  // Settlement errand traveler: roams the open ground rather than
  // requiring a dedicated hut (see generateSettlementRoom).
  // After a betrayal it is swapped for the hostile enemy instead, once: the
  // room keeps that enemy, so the friendly traveler is dropped for good.
  if (room.settlementErrand) {
    game.neutralCharacters.push(room.settlementErrand);
    if (game.errandSystem.hostile) {
      game.errandSystem.replaceBetrayedTravelers(game.neutralCharacters, room, game);
      room.settlementErrand = null;
    }
  }

  // Rare Red Zone caldera Weapons Master
  if (room.calderaWeaponsMaster) {
    game.neutralCharacters.push(room.calderaWeaponsMaster);
  }

  // Roaming Alchemist (Red-L / Yellow-O / Cyan-T, post-lesson) — see
  // maybeSpawnRoamingAlchemist below.
  if (room.alchemistNPC) {
    game.neutralCharacters.push(room.alchemistNPC);
  }

  // Errand room: active errand + E room clears enemies and spawns the
  // traveler immediately (they remember what they wanted last time)
  if (game.errandSystem.activeErrand && room.exitLetter === 'E' && !game.errandSystem.hostile) {
    room.enemies = [];
    room.enemiesPlane0 = [];
    room.enemiesPlane1 = [];
    room.exitsLocked = false;
    const errandChar = game.errandSystem.spawnErrandCharacter(room);
    if (errandChar) game.neutralCharacters.push(errandChar);
  } else if (game.errandSystem.hostile && room.exitLetter === 'E') {
    // Traveler is gone for good (feature-inbox) — re-entering an E room
    // for the rest of the run spawns the hostile enemy it turned into
    // instead of the peaceful trader, until that enemy is killed
    // (spawnHostileEnemy no-ops once ErrandSystem.slain).
    game.errandSystem.spawnHostileEnemy(room, game);
  }
}

// ── Centipede miniboss arena (red zone) ─────────────────────────────────────
// Fixed-grid stamp for the Centipede encounter. Spec requires "a large amount
// of reflectors and other background objects to impede the player and enable
// interesting Centipede direction changes" at fixed (not random) positions,
// using only reflectors, rocks, trees, and Fractured Rock. There's no
// existing literal-grid-stamp precedent to reuse wholesale (LETTER_TEMPLATES'
// 'B'/'V' entries are declarative rule-sets for procedural placement, not
// literal per-cell layouts — closest actual precedent is the {col,row} array
// shape used by PuzzleSystem's three_conductors config), so this composes its
// layout from two small deterministic lattices rather than inventing a new
// generic ascii-grid template DSL for a single consumer.
// Mirrors CentipedeSystem.js's own CENTIPEDE_BODY_COUNT — duplicated rather
// than imported to avoid a roomFeatures.js -> CentipedeSystem.js dependency
// for one shared number; only used here to size the spawn-row reservation.
const CENTIPEDE_BODY_COUNT = 14;
const CENTIPEDE_ARENA_BOUNDS = { minCol: 2, maxCol: 27, minRow: 2, maxRow: 27 };
// Two independent centipedes (item #8) — separate rows, facing away from
// each other so their initial body spans never overlap, wide enough apart
// (10 rows) that neither chain's early wandering immediately runs into the
// other's spawn line.
const CENTIPEDE_SPAWN_POINTS = [
  { cell: { col: 15, row: 10 }, facing: { dx: 1, dy: 0 } },
  { cell: { col: 15, row: 20 }, facing: { dx: -1, dy: 0 } },
];
const CENTIPEDE_DEFLECTOR_CYCLE = ['◣', '◢', '◥', '◤'];
// Playtest feedback: the original layout stamped deflectors/fillers on two
// perfectly regular 4-cell lattices, which (a) reads as visibly uniform and
// (b) tends to hand a chain the exact same bounce cycle every time it enters
// a given lattice cell, so it can end up perpetually retracing a short loop.
// Replaced with a per-cell random roll — still grid-aligned ("fixed grid
// positions" per spec, decided once at generation time, not per-frame — the
// object never moves after placement) but no longer periodic. Density was
// tuned up to ~32% for spread/variety, then halved back down after playtest
// feedback that it was too dense to traverse (the wider spread from the
// randomized roll was the actual win, not the raw count).
const CENTIPEDE_OBJECT_DENSITY = 0.16;
const CENTIPEDE_OBJECT_ROLL_TABLE = [
  { upTo: 0.45, char: null },   // deflector — resolved per-roll below (random elbow)
  { upTo: 0.65, char: '0' },    // Rock
  { upTo: 0.85, char: 'Y' },    // Tree
  { upTo: 1.00, char: '9' },    // Fractured Rock
];

function buildCentipedeArenaLayout() {
  const { minCol, maxCol, minRow, maxRow } = CENTIPEDE_ARENA_BOUNDS;
  const placements = [];

  // Reserve each centipede's spawn cell and full initial body span (body
  // trails opposite its facing) so neither centipede spawns embedded in an
  // obstacle on its first frame.
  const reserved = new Set();
  for (const { cell, facing } of CENTIPEDE_SPAWN_POINTS) {
    for (let i = 0; i <= CENTIPEDE_BODY_COUNT; i++) {
      reserved.add(`${cell.col - facing.dx * i},${cell.row - facing.dy * i}`);
    }
  }

  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      if (reserved.has(`${col},${row}`)) continue;
      if (Math.random() >= CENTIPEDE_OBJECT_DENSITY) continue;

      const roll = Math.random();
      const entry = CENTIPEDE_OBJECT_ROLL_TABLE.find(e => roll < e.upTo);
      const char = entry.char ?? CENTIPEDE_DEFLECTOR_CYCLE[Math.floor(Math.random() * CENTIPEDE_DEFLECTOR_CYCLE.length)];
      placements.push({ col, row, char });
    }
  }

  return placements;
}

// Clears whatever generateBackgroundObjects() already placed inside the arena
// footprint, stamps the fixed Centipede layout on top, and returns each
// centipede's spawn cell + facing for CentipedeSystem.spawn() (one call per
// entry — item #8's 2-centipede room). Mirrors PuzzleSystem's _clearArena
// (filter-by-rounded-cell, preserve structural) for the clear step, and
// stampHutFootprint's "structural = true" convention so the stamped objects
// survive the later cleanupStrayBackgroundObjects generation pass.
export function stampCentipedeArena(room) {
  const CS = GRID.CELL_SIZE;
  const { minCol, maxCol, minRow, maxRow } = CENTIPEDE_ARENA_BOUNDS;

  room.backgroundObjects = room.backgroundObjects.filter(obj => {
    if (obj.structural) return true;
    const col = Math.round(obj.position.x / CS);
    const row = Math.round(obj.position.y / CS);
    return col < minCol || col > maxCol || row < minRow || row > maxRow;
  });

  for (const { col, row, char } of buildCentipedeArenaLayout()) {
    const obj = new BackgroundObject(char, col * CS, row * CS);
    obj.structural = true;
    // Arena obstacle rocks are a unique instance, not normal Rock/Fractured Rock:
    // the player must never get walled in against one for lacking a pickaxe/hammer,
    // so every weapon type (melee or ranged) can break them.
    if (char === '0' || char === '9') {
      obj.allWeaponsDamage = true;
      obj.bulletInteraction = 'interact-destroy';
    }
    room.backgroundObjects.push(obj);
  }

  return CENTIPEDE_SPAWN_POINTS.map(({ cell, facing }) => ({
    spawnCell: { x: cell.col, y: cell.row },
    facing: { ...facing },
  }));
}

// ── Storm Eye arena (yellow zone Boss room) ─────────────────────────────────
// Wide open so the wind has room to work: four short obsidian pillars give the
// Gale a wind shadow to hide in, and a quarter-blob of water fills each corner
// so the corners can't be used to wedge out of the storm.
const STORM_EYE_PILLAR_CELLS = [
  { col: 7, row: 9 },  { col: 8, row: 9 },
  { col: 21, row: 9 }, { col: 22, row: 9 },
  { col: 7, row: 20 }, { col: 8, row: 20 },
  { col: 21, row: 20 }, { col: 22, row: 20 },
];
const STORM_EYE_CORNER_WATER_RADIUS = 4;   // cells, measured from the inner corner cell

export function stampStormEyeArena(room) {
  const CS = GRID.CELL_SIZE;
  const lastCol = GRID.COLS - 2, lastRow = GRID.ROWS - 2;   // inside the border wall

  // Open the floor: drop every non-structural object and clear interior
  // collision that no surviving structural object stands on.
  room.backgroundObjects = room.backgroundObjects.filter(obj => {
    if (obj.structural) return true;
    const col = Math.floor(obj.position.x / CS), row = Math.floor(obj.position.y / CS);
    return col < 1 || col > lastCol || row < 1 || row > lastRow;   // border/exit dressing stays
  });
  const held = new Set(room.backgroundObjects.map(o => `${Math.floor(o.position.x / CS)},${Math.floor(o.position.y / CS)}`));
  for (let row = 1; row <= lastRow; row++) {
    for (let col = 1; col <= lastCol; col++) {
      if (room.collisionMap?.[row] && !held.has(`${col},${row}`)) room.collisionMap[row][col] = false;
    }
  }

  for (const { col, row } of STORM_EYE_PILLAR_CELLS) {
    const pillar = new BackgroundObject('0', col * CS, row * CS, { obsidian: true });
    pillar.structural = true;
    room.backgroundObjects.push(pillar);
    // Solid in the collision map too: the Gale's wind shadow ray-marches it.
    if (room.collisionMap?.[row]) room.collisionMap[row][col] = true;
  }

  const r = STORM_EYE_CORNER_WATER_RADIUS;
  const corners = [
    { col: 1, row: 1, dc: 1, dr: 1 }, { col: lastCol, row: 1, dc: -1, dr: 1 },
    { col: 1, row: lastRow, dc: 1, dr: -1 }, { col: lastCol, row: lastRow, dc: -1, dr: -1 },
  ];
  for (const corner of corners) {
    for (let i = 0; i <= r; i++) {
      for (let j = 0; j <= r; j++) {
        if (i * i + j * j > r * r) continue;
        const col = corner.col + i * corner.dc, row = corner.row + j * corner.dr;
        room.backgroundObjects.push(BackgroundObject.createVariant('water', col * CS, row * CS));
      }
    }
  }

  // The Storm Eye's Wind Fields own all the wind here (SandstormSystem.bindToRoom).
  room.calmWind = true;
}

// Fallback arms for the unarmed safety net in zones that author no
// l1WeaponPool of their own (gray, blue) — the baseline tier-1 spread.
const BASELINE_T1_WEAPONS = ['†', '/', '↾', ')', '⊥']; // sword, staff, dagger, bow, hammer

// True while the player holds no weapon anywhere they could swing it from —
// the quick slots plus the equipped armor/consumable slots, since a weapon
// parked in an equipped slot is still a weapon in hand for this check. Traps
// also live in the quick slots, so an armful of them still counts as unarmed.
function playerIsUnarmed(gen) {
  const player = gen.game?.player;
  if (!player?.quickSlots) return false;
  const inventory = gen.game?.inventorySystem;
  const held = [
    ...player.quickSlots,
    inventory?.equippedArmor,
    ...(inventory?.equippedConsumables || [])
  ];
  return !held.some(slot => slot?.data?.type === ITEM_TYPES.WEAPON);
}

// Depth-1 weapon offering: place a single floating pickup drawn from the zone's
// l1WeaponPool (zones.js). One item per L1 room — the player's first choice of arm.
//
// The same offering doubles as the unarmed safety net: a player carrying no
// weapon at all (walked past the L1 offering, or lost every weapon slot) gets
// one at any depth and in any zone, so a run can never stall for want of
// something to swing. Zones with no l1WeaponPool of their own (gray, blue)
// fall back to the baseline tier-1 arms.
export function offerL1Weapon(gen, room) {
  const unarmed = playerIsUnarmed(gen);
  if (gen.currentDepth !== 1 && !unarmed) return;
  const pool = ZONES[room.zone]?.l1WeaponPool || (unarmed ? BASELINE_T1_WEAPONS : null);
  if (!pool || pool.length === 0) return;
  const itemChar = pool[Math.floor(Math.random() * pool.length)];
  const pos = gen.getRandomPosition(room.collisionMap, room.enemies, room.playerStartPos);
  if (pos) {
    room.items.push(new Item(itemChar, pos.x, pos.y));
  }
}

// Centipede arena is a long horizontal gauntlet that rewards a ranged option —
// guarantee a Gun pickup ('¬') regardless of depth, independent of the
// offerL1Weapon roll in generateBossRoom (which only fires at depth 1, or at
// any depth for an unarmed player).
export function spawnCentipedeGunDrop(gen, room) {
  const pos = gen.getRandomPosition(room.collisionMap, room.enemies, room.playerStartPos, room.backgroundObjects);
  if (pos) {
    room.items.push(new Item('¬', pos.x, pos.y));
  }
}

// ── Miniboss ('B' room) content selection ───────────────────────────────────
// Called by RoomGenerator.generateBossRoom (after terrain) whenever the room
// isn't the zone-ending boss arena. Picks the room's enemy content from one
// of three sources, in priority order:
//   1. An undefeated zone.bossPool encounter (per-run lockout via ZoneSystem —
//      a beaten miniboss like Giant Slime won't be re-rolled, but a sibling
//      like Goblin Army still can be).
//   2. The generic fallback boss (single buffed common enemy) — reserved for
//      zones with NO bossPool defined at all (e.g. yellow). Zones that HAVE a
//      bossPool never fall back once it's exhausted: ExitSystem stops
//      offering the 'B' exit letter instead (isMinibossPoolExhausted), so
//      this path only ever fires for pool-less zones.
//   3. A defensive plain-combat spawn, for the case where a pool-having zone's
//      room still got generated after every encounter was already beaten
//      (stale exit, cheat warp) — never an empty arena or a "beaten" miniboss.
export function spawnMinibossOrFallback(gen, room) {
  const pool = ZONES[room.zone]?.bossPool;
  // Encounters already beaten this run are filtered out so a defeated
  // miniboss can't be re-rolled from a multi-entry pool that still has an
  // unbeaten sibling. Zones with no zoneSystem ref (shouldn't happen outside
  // tests) fall back to the full static pool.
  const availablePool = gen.game?.zoneSystem
    ? gen.game.zoneSystem.getAvailableBossPool(room.zone)
    : (pool || []);

  if (availablePool.length > 0) {
    const encounterId = availablePool[Math.floor(Math.random() * availablePool.length)];
    room.bossEncounterId = encounterId; // Read on room-clear to lock this encounter out
    if (encounterId === 'centipede') {
      // Bespoke multi-instance encounter — outside the single/formation
      // BOSS_ENCOUNTERS data model, so it gets its own arena stamp + system
      // spawn rather than a BOSS_ENCOUNTERS entry.
      const spawnPoints = stampCentipedeArena(room);
      for (const { spawnCell, facing } of spawnPoints) {
        gen.game.centipedeSystem.spawn(room, spawnCell, facing);
      }
      spawnCentipedeGunDrop(gen, room);
    } else {
      const encounter = BOSS_ENCOUNTERS[encounterId];
      // Yellow's Giant Slime fights beside its three Imbue Pools. Seeded before
      // the spawn so the pool cells are settled terrain when the boss arrives.
      if (encounterId === 'giant_slime' && room.zone === 'yellow') seedImbuePools(room);
      if (encounter) spawnBossEncounter(gen, room, encounter);
    }
    return;
  }

  if (!pool || pool.length === 0) {
    const boss = createBossEnemy(gen.currentDepth, room.zone);
    const pos = gen.getRandomPosition(room.collisionMap, room.enemies, room.playerStartPos, room.backgroundObjects);
    if (pos) {
      const enemy = new Enemy(boss.char, pos.x, pos.y, gen.currentDepth);
      // maxHp must track the buffed hp (constructor set it from base data); isBoss drives the near-death blink
      Object.assign(enemy, { hp: boss.hp, maxHp: boss.hp, damage: boss.damage, color: boss.color, isBoss: true });
      enemy.setCollisionMap(room.collisionMap);
      enemy.setBackgroundObjects(room.backgroundObjects);
      gen.addEnemyToRoom(room, enemy);
    }
    return;
  }

  const enemyCount = Math.max(1, Math.ceil(Math.min(1 + Math.floor(gen.currentDepth / 2), 6) / 2));
  for (let i = 0; i < enemyCount; i++) {
    const enemyChar = getZoneRandomEnemy(gen.currentDepth, room.zone);
    const pos = gen.getRandomPosition(room.collisionMap, room.enemies, room.playerStartPos, room.backgroundObjects);
    if (!pos) continue;
    const enemy = new Enemy(enemyChar, pos.x, pos.y, gen.currentDepth);
    enemy.setCollisionMap(room.collisionMap);
    enemy.setBackgroundObjects(room.backgroundObjects);
    gen.addEnemyToRoom(room, enemy);
  }
}

// ── Imbue Pools (yellow miniboss room) ─────────────────────────────────────
// Three 3×3 pools in a triangle inside the B template's 10×10 clearing
// (cols/rows 10–19, boss at the centre): electric water with a Lightning Spire
// at the top, ice at bottom-left, lava at bottom-right. The room is always a
// thunderstorm (room.forceLightning) and every strike lands on the spire, so
// the electric pool is live on a cadence. ImbuePoolSystem drives the fight.
const IMBUE_POOL_LAYOUT = [
  { element: 'electric', col: 15, row: 11 },
  { element: 'ice',      col: 11, row: 18 },
  { element: 'fire',     col: 19, row: 18 }
];

export function seedImbuePools(room) {
  const C = GRID.CELL_SIZE;
  room.imbuePools = [];
  for (const { element, col, row } of IMBUE_POOL_LAYOUT) {
    const cells = [];
    for (let dc = -1; dc <= 1; dc++) {
      for (let dr = -1; dr <= 1; dr++) cells.push({ col: col + dc, row: row + dr });
    }
    const inPool = (o) => cells.some(c => Math.floor(o.position.x / C) === c.col && Math.floor(o.position.y / C) === c.row);
    room.backgroundObjects = room.backgroundObjects.filter(o => !inPool(o));
    for (const c of cells) {
      if (room.collisionMap?.[c.row]) room.collisionMap[c.row][c.col] = false;
    }

    const tiles = cells.map(c => {
      const tile = BackgroundObject.createVariant(element === 'fire' ? 'lava' : 'water', c.col * C, c.row * C);
      if (element === 'electric') tile.conductive = true;
      if (element === 'ice') tile.setWaterState('frozen', Infinity);
      room.backgroundObjects.push(tile);
      return tile;
    });

    if (element === 'electric') {
      room.lightningRod = createLightningSpire(col * C, row * C);
      room.backgroundObjects.push(room.lightningRod);
    }

    room.imbuePools.push({
      element,
      tiles,
      center: { x: col * C, y: row * C }, // top-left of the centre cell — same space as enemy.position
      brokenTimer: 0                     // ice only: > 0 while the broken ice reforms
    });
  }
  room.forceLightning = true;
}

/**
 * Place a boss encounter from BOSS_ENCOUNTERS into a room.
 * - 'center'    : boss placed at room center (single-entity bosses like Giant Slime)
 * - 'formation' : leader at center, followers placed in a ring at the leader's
 *                 followLeader.formationRadius. Followers are linked to their leader
 *                 via enemy.leaderRef so the followLeader behavior can find them.
 *                 Spawns with `equippedWeapon` get the matching Item pre-equipped.
 */
export function spawnBossEncounter(gen, room, encounter) {
  const centerX = (GRID.COLS / 2) * GRID.CELL_SIZE;
  const centerY = (GRID.ROWS / 2) * GRID.CELL_SIZE;

  let leader = null;
  let leaderFormationRadius = GRID.CELL_SIZE * 3;
  let followerOrbitIndex = 0;

  // Count total followers across spawn entries for ring placement
  let totalFollowers = 0;
  for (const spawn of encounter.spawns) {
    if (spawn.role === 'follower') totalFollowers += spawn.count;
  }

  for (const spawn of encounter.spawns) {
    for (let i = 0; i < spawn.count; i++) {
      let x, y;
      let mySlot = -1;

      if (spawn.role === 'boss' || spawn.role === 'leader') {
        x = centerX;
        y = centerY;
      } else if (spawn.role === 'follower' && leader) {
        // Initial placement is a tidy ring; runtime formation state machine
        // takes over from there (encircle → line). Slot index is preserved
        // on the enemy so the line formation can give each follower a stable
        // lateral position in the wall.
        mySlot = followerOrbitIndex;
        const angle = (followerOrbitIndex / Math.max(totalFollowers, 1)) * Math.PI * 2;
        x = leader.position.x + Math.cos(angle) * leaderFormationRadius;
        y = leader.position.y + Math.sin(angle) * leaderFormationRadius;
        followerOrbitIndex++;
      } else {
        // Fallback: random valid position
        const pos = gen.getRandomPosition(room.collisionMap, room.enemies, room.playerStartPos, room.backgroundObjects);
        if (!pos) continue;
        x = pos.x;
        y = pos.y;
      }

      const enemy = new Enemy(spawn.char, x, y, gen.currentDepth);
      // Boss/leader entities carry the boss flag on the INSTANCE (never the
      // shared ENEMIES data — these chars also spawn as ordinary mobs):
      // drives boss-tier drops (#215), guaranteed mana, and the near-death
      // blink, matching the generic fallback Miniboss above. Followers stay
      // regular mobs — a triple-drop skeleton ring would be absurd.
      if (spawn.role === 'boss' || spawn.role === 'leader') enemy.isBoss = true;
      enemy.setCollisionMap(room.collisionMap);
      enemy.setBackgroundObjects(room.backgroundObjects);

      if (spawn.equippedWeapon) {
        const weapon = new Item(spawn.equippedWeapon, x, y);
        if (enemy.itemUsage) {
          // Encounter-scripted equipment overrides any random spawn loadout
          // the constructor rolled (e.g. goblin spawnEquipment).
          enemy.inventory = [];
          enemy.equippedWeapon = null;
          enemy.pickupItem(weapon);
        }
      }

      if (spawn.role === 'leader') {
        leader = enemy;
        if (enemy.data.followLeader?.formationRadius) {
          leaderFormationRadius = enemy.data.followLeader.formationRadius;
        } else if (enemy.data.rallyCall) {
          // Leaders define orbit radius via their followers; fall back to default
          leaderFormationRadius = GRID.CELL_SIZE * 3;
        }
      } else if (spawn.role === 'follower' && leader) {
        enemy.leaderRef = leader;
        // Provisional slot — corrected in the second pass below so the line
        // formation only counts melee followers (ranged ones stand back).
        enemy.formationSlot = mySlot;
        enemy.formationCount = totalFollowers;
      }

      gen.addEnemyToRoom(room, enemy);
    }
  }

  // Renumber formation slots for melee followers only; ranged followers
  // (bow/gun) keep their leaderRef but are excluded from the line so we
  // don't end up with gaps in the wall.
  const meleeFollowers = room.enemies.filter(
    e => e.leaderRef === leader && e.attackType !== 'item_ranged' && e.movementStyle !== 'keeper'
  );
  meleeFollowers.forEach((e, idx) => {
    e.formationSlot = idx;
    e.formationCount = meleeFollowers.length;
  });
}

// Cyan zone: deep snow fields — large swaths of full-block white terrain.
// Called from RoomGenerator.generateBackgroundObjects for cyan rooms.
// Each hazard step (ZoneSystem.hazardStep) adds a snow cluster, thickens every
// cluster, and freezes another patch of ice (generateIcePatches).
export function generateSnowFields(gen, room) {
  const step = hazardStep(gen.currentDepth);
  const clusterCount = gen.randInt(3, 6) + step;

  for (let i = 0; i < clusterCount; i++) {
    const size = gen.randInt(5, 10) + 2 * step;
    const startX = gen.randInt(4, GRID.COLS - 4);
    const startY = gen.randInt(4, GRID.ROWS - 4);

    for (let j = 0; j < size; j++) {
      const x = startX + gen.randInt(-2, 2);
      const y = startY + gen.randInt(-2, 2);

      if (gen.isValidPosition(x, y, room)) {
        const snow = BackgroundObject.createVariant(
          'snow_deep',
          x * GRID.CELL_SIZE,
          y * GRID.CELL_SIZE
        );
        snow.compacted = false;
        snow.compactor = null; // entity wading it; compacts when it steps off (PhysicsSystem)
        room.backgroundObjects.push(snow);
      }
    }
  }

  generateIcePatches(gen, room, step);
}

// Cyan zone: `count` rough-circle patches of permanently frozen water, laid
// after the snow fields. Same freeze as the cyan Ascent's
// pond (seedFrozenAscent) — Infinity, so the timer never thaws it.
function generateIcePatches(gen, room, count) {
  const C = GRID.CELL_SIZE;
  for (let i = 0; i < count; i++) {
    const centerCol = gen.randInt(4, GRID.COLS - 5);
    const centerRow = gen.randInt(4, GRID.ROWS - 5);
    const radius = gen.randInt(1, 2);
    for (let dr = -radius; dr <= radius; dr++) {
      for (let dc = -radius; dc <= radius; dc++) {
        if (dc * dc + dr * dr > radius * radius + 1) continue;
        const col = centerCol + dc, row = centerRow + dr;
        if (!gen.isValidPosition(col, row, room)) continue;
        const ice = BackgroundObject.createVariant('water', col * C, row * C);
        ice.setWaterState('frozen', Infinity);
        room.backgroundObjects.push(ice);
      }
    }
  }
}

/**
 * Letter-template guaranteed item drop — the one item a template promises will
 * be in the room, placed at whatever anchor the template names (vault centre,
 * clearing centre) or dropped anywhere walkable if it names none.
 */
export function spawnGuaranteedItems(gen, room) {
  const itemConfig = gen.currentLetterTemplate.guaranteedItems;

  // Determine item pool based on config
  let itemPool = [];
  if (Array.isArray(itemConfig.itemPool)) {
    itemPool = itemConfig.itemPool;
  } else if (itemConfig.itemPool === 'rare_epic') {
    // High-tier weapons, armor, and consumables
    itemPool = [
      'ᛖ', // Dragon Blade (damage 5)
      'ᚲ', // Dragon Shotgun
      '⚔', // Legendary Flame Sword (damage 6)
      '♦', // Dragon Heart (max HP consumable)
      '𐤓', // Dragon Scale Armor (defense 5)
      '^', // Hammer (damage 7)
      'ᛜ', // Ice Hammer (damage 6)
    ];
  }

  if (itemPool.length === 0) {
    console.warn(`[Guaranteed Items] Unknown item pool: ${itemConfig.itemPool}`);
    return;
  }

  // Select random item from pool
  const itemChar = itemPool[Math.floor(Math.random() * itemPool.length)];

  // Determine spawn position
  let spawnPos;
  if (itemConfig.position === 'vault_center') {
    // Spawn in exact center of vault
    const vault = gen.currentLetterTemplate.vaultStructure;
    const centerX = vault.centerCol * GRID.CELL_SIZE + (GRID.CELL_SIZE / 2);
    const centerY = vault.centerRow * GRID.CELL_SIZE + (GRID.CELL_SIZE / 2);
    spawnPos = { x: centerX, y: centerY };
  } else if (itemConfig.position === 'clearing_center') {
    // Spawn at the center of the template's clearingZone
    const clearing = gen.currentLetterTemplate.bgObjectRules?.clearingZone;
    if (clearing) {
      const centerX = clearing.centerCol * GRID.CELL_SIZE + (GRID.CELL_SIZE / 2);
      const centerY = clearing.centerRow * GRID.CELL_SIZE + (GRID.CELL_SIZE / 2);
      spawnPos = { x: centerX, y: centerY };
    } else {
      spawnPos = gen.getRandomPosition(room.collisionMap, room.enemies, room.playerStartPos);
    }
  } else {
    // Fallback to random position
    spawnPos = gen.getRandomPosition(room.collisionMap, room.enemies, room.playerStartPos);
  }

  if (!spawnPos) return;

  // Create and add item to room
  const item = new Item(itemChar, spawnPos.x, spawnPos.y);
  room.items.push(item);
}

// Deep-water depth check shared by RoomGenerator.stampWaterBlobs (lake/oasis
// blobs) and generateOceanTerrain (ocean band). A cell reads as deep when
// it's within the inner half of a blob node's radius (near the node center,
// away from the noisy shoreline) — see deep-water feature-inbox spec:
// darker-tinted '~' tiles that drown non-immune entities.
export function isDeepWaterCell(col, row, nodes) {
  for (const node of nodes) {
    const dx = col - node.col;
    const dy = row - node.row;
    if (Math.sqrt(dx * dx + dy * dy) < node.radius * 0.5) return true;
  }
  return false;
}

// Moved out of RoomGenerator.js to stay within its architecture budget (see
// CLAUDE.md Code Placement Procedure). `gen` is the RoomGenerator instance —
// still needs its helper methods (hasObjectAt, isValidPosition, etc.).
export function generateOceanTerrain(gen, room) {
  const oceanConfig = gen.currentLetterTemplate.oceanZone;

  // Generate sand in transition zone (columns 18-21)
  for (let col = oceanConfig.sandStartCol; col <= oceanConfig.sandEndCol; col++) {
    for (let row = 1; row < GRID.ROWS - 1; row++) {
      // Random placement based on sand density
      if (Math.random() < oceanConfig.sandDensity) {
        const x = col * GRID.CELL_SIZE;
        const y = row * GRID.CELL_SIZE;

        // Check if position is clear (no walls, no existing objects)
        if (!room.collisionMap[row][col] && !gen.hasObjectAt(room, x, y)) {
          const sand = new BackgroundObject('.', x, y);
          room.backgroundObjects.push(sand);
        }
      }
    }
  }

  // Generate water in ocean zone (columns 20-29). Deep water covers most of
  // the band — only a shallow strip nearest the sand stays normal depth.
  // Tall-grass swaths are seeded before this overlay runs, so clear any that
  // landed in the water band first — otherwise they stand in the sea as
  // vision blockers, and a Sea Snake can't see a player on the shore past
  // them (only a player wading within 3 cells slips under the grass rule).
  const waterEdgeX = (oceanConfig.waterStartCol - 0.5) * GRID.CELL_SIZE;
  room.backgroundObjects = room.backgroundObjects.filter(obj =>
    !((obj.char === '|' || obj.char === ',') && obj.position.x >= waterEdgeX));

  const oceanWaterSpan = oceanConfig.waterEndCol - oceanConfig.waterStartCol;
  const oceanShallowCols = Math.max(1, Math.round(oceanWaterSpan * 0.2));
  for (let col = oceanConfig.waterStartCol; col <= oceanConfig.waterEndCol; col++) {
    const isDeep = col > oceanConfig.waterStartCol + oceanShallowCols;
    for (let row = 1; row < GRID.ROWS - 1; row++) {
      // Random placement based on water density
      if (Math.random() < oceanConfig.waterDensity) {
        const x = col * GRID.CELL_SIZE;
        const y = row * GRID.CELL_SIZE;

        // Check if position is clear (no walls, no existing objects)
        if (!room.collisionMap[row][col] && !gen.hasObjectAt(room, x, y)) {
          const water = new BackgroundObject('~', x, y, { deepWater: isDeep });
          room.backgroundObjects.push(water);
        }
      }
    }
  }

  // Disable east exit if configured
  if (gen.currentLetterTemplate.exitRules?.disableEast) {
    room.exits.east = false;
  }
}

// Moved out of RoomGenerator.js to stay within its architecture budget.
// Blob-fill + shoreline decoration; shared by generateLakeTerrain and Oasis.
export function stampWaterBlobs(gen, room, nodes, edgeNoise, waterDensity) {
  // For each grid cell, check if it falls inside any blob node
  for (let col = 1; col < GRID.COLS - 1; col++) {
    for (let row = 1; row < GRID.ROWS - 1; row++) {
      if (room.collisionMap[row][col]) continue;

      // Check if cell is inside any blob (with noise)
      let inAnyBlob = false;
      for (const node of nodes) {
        const dx = col - node.col;
        const dy = row - node.row;
        const dist = Math.sqrt(dx * dx + dy * dy);
        // Perlin-like edge noise: add random offset to threshold per cell
        const noiseOffset = (Math.random() - 0.5) * edgeNoise;
        if (dist < node.radius + noiseOffset) {
          inAnyBlob = true;
          break;
        }
      }

      if (inAnyBlob && Math.random() < waterDensity) {
        // Remove any existing background object at this cell
        const cellX = col * GRID.CELL_SIZE;
        const cellY = row * GRID.CELL_SIZE;
        const halfCell = GRID.CELL_SIZE / 2;

        room.backgroundObjects = room.backgroundObjects.filter(obj =>
          !(Math.abs(obj.position.x - cellX) < halfCell &&
            Math.abs(obj.position.y - cellY) < halfCell)
        );

        // Deep water fills each blob's inner half (near its node center);
        // the outer half (near the noisy shoreline) stays normal depth.
        const water = new BackgroundObject('~', cellX, cellY, { deepWater: isDeepWaterCell(col, row, nodes) });
        room.backgroundObjects.push(water);
      }
    }
  }

  // Scatter shoreline decoration (rocks, bushes) at blob edges
  for (const node of nodes) {
    const decCount = Math.floor(node.radius * 1.5);
    for (let i = 0; i < decCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const edgeDist = node.radius + 0.5 + Math.random() * 1.5;
      const col = Math.round(node.col + Math.cos(angle) * edgeDist);
      const row = Math.round(node.row + Math.sin(angle) * edgeDist);

      if (gen.isValidPosition(col, row, room) &&
          !gen.hasObjectAt(room, col * GRID.CELL_SIZE, row * GRID.CELL_SIZE)) {
        const decChar = Math.random() < 0.6 ? '%' : '0';
        const decObj = new BackgroundObject(decChar, col * GRID.CELL_SIZE, row * GRID.CELL_SIZE);
        gen.applyZoneProperties(decObj, room.zone);
        room.backgroundObjects.push(decObj);
      }
    }
  }
}

// ─── Cavern ──────────────────────────────────────────────────────────────────
// A Cavern is a small secret interior hidden behind a Bombable Rock set in a
// large, conspicuous cluster of Cavern Rocks. Only a bomb opens the Bombable
// Rock; its cell then holds the Cavern's door (CavernSystem.bombBlast), and
// HutSystem enters the Cavern like any hut via the `room.cavern` record.

// Chance an eligible room hides a Cavern. Rare on purpose: the cluster is a
// secret the player learns to recognise, not furniture.
const CAVERN_SPAWN_CHANCE = 0.08;

// Cluster shape, read top-down: 'R' Cavern Rock, 'B' the Bombable Rock (always
// the bottom-centre cell, facing south), '.' left open. A low mound, wider at
// the base, so it reads as one deliberate pile rather than scattered rocks.
const CAVERN_CLUSTER_PATTERN = [
  '..RRR..',
  '.RRRRR.',
  'RRRRRRR',
  'RRRBRRR',
];

// Mirrors getRandomPosition's exit clearance: nothing of the Cavern may sit
// within this many cells of an exit's spawn cell.
const CAVERN_EXIT_CLEARANCE = 3;
const CAVERN_PLACEMENT_ATTEMPTS = 40;

// Caverns spawn wherever wall structures can: the letter template must not
// forbid them, and the room type must be one some wall structure targets.
function roomAllowsCavern(room) {
  if (room.letterTemplate?.wallStructures?.allow === false) return false;
  return Object.values(WALL_STRUCTURES).some(s => s.roomTypes.includes(room.type));
}

// Objects a Cavern may never displace. Everything else in its footprint is
// ordinary scenery (grass, bushes, trees, loose rocks) and is cleared so no
// background object overlaps the Cavern.
function blocksCavern(obj) {
  return obj.structural || obj.indestructible || obj.isEnvironmental?.() ||
    obj.conductivity === 'water' || obj.dropsKey || obj.dropsDungeonKey || obj.puzzleSignal;
}

// Cells holding anything generation already placed that isn't a background
// object — enemies, items, crows, NPCs, recipe-sign glyphs, the player start.
// Scans every collection on the room so a new one can't be silently missed.
function occupiedEntityCells(room) {
  const CS = GRID.CELL_SIZE;
  const cells = new Set();
  const mark = (x, y) => {
    if (typeof x !== 'number' || typeof y !== 'number') return;
    cells.add(`${Math.round(x / CS)},${Math.round(y / CS)}`);
  };
  const markEntity = (entity) => {
    if (!entity || typeof entity !== 'object') return;
    if (entity.position) mark(entity.position.x, entity.position.y);
    else mark(entity.x, entity.y);
  };
  for (const [key, value] of Object.entries(room)) {
    if (key === 'backgroundObjects' || key === 'collisionMap' || key === 'protectedRegions') continue;
    if (Array.isArray(value)) value.forEach(markEntity);
    else if (value?.position) markEntity(value);
  }
  for (const glyph of room.recipeSign?.characters ?? []) mark(glyph.x, glyph.y);
  if (room.playerStartPos) mark(room.playerStartPos.x, room.playerStartPos.y);
  return cells;
}

/**
 * Rolls a Cavern into an eligible room: a Cavern Rock cluster with a Bombable
 * Rock at its bottom-centre, recorded on `room.cavern` (a hut record that
 * stays hidden until CavernSystem.bombBlast reveals its door). Runs at the end
 * of RoomGenerator.generateRoom, after every other placement pass, so it can
 * see — and refuse — wall structures, protected structures and entities.
 */
export function seedCavern(room) {
  if (!roomAllowsCavern(room)) return;
  if (Math.random() >= CAVERN_SPAWN_CHANCE) return;

  const CS = GRID.CELL_SIZE;
  const height = CAVERN_CLUSTER_PATTERN.length;
  const width = CAVERN_CLUSTER_PATTERN[0].length;
  const exitCells = exitSpawnCells();
  const occupied = occupiedEntityCells(room);
  const cellKey = (obj) => `${Math.round(obj.position.x / CS)},${Math.round(obj.position.y / CS)}`;

  for (let attempt = 0; attempt < CAVERN_PLACEMENT_ATTEMPTS; attempt++) {
    // Bounding box plus a one-cell ring (the ring's bottom row holds the
    // approach cell in front of the Bombable Rock), kept off the border.
    const minCol = 2 + Math.floor(Math.random() * (GRID.COLS - width - 4));
    const minRow = 2 + Math.floor(Math.random() * (GRID.ROWS - height - 4));

    // Every cell of the footprint and its ring must be open ground: no wall
    // structure, no protected structure region, no exit lane, no entity, and
    // no background object a Cavern may not displace. The open ring keeps the
    // cluster from ever sealing a corridor between wall structures.
    const ringCells = new Set();
    for (let row = minRow - 1; row <= minRow + height; row++) {
      for (let col = minCol - 1; col <= minCol + width; col++) ringCells.add(`${col},${row}`);
    }
    let ok = true;
    for (const key of ringCells) {
      const [col, row] = key.split(',').map(Number);
      if (room.collisionMap[row]?.[col] !== false ||
          isCellProtected(room, col, row) ||
          occupied.has(key) ||
          exitCells.some(e => Math.abs(col - e.col) <= CAVERN_EXIT_CLEARANCE && Math.abs(row - e.row) <= CAVERN_EXIT_CLEARANCE)) {
        ok = false;
        break;
      }
    }
    if (ok) ok = !room.backgroundObjects.some(o => !o.destroyed && ringCells.has(cellKey(o)) && blocksCavern(o));
    if (!ok) continue;

    // Clear scenery from the cluster and the approach cell, then build.
    const doorCol = minCol + CAVERN_CLUSTER_PATTERN[height - 1].indexOf('B');
    const doorRow = minRow + height - 1;
    const footprint = [{ col: doorCol, row: doorRow + 1 }];
    for (let dy = 0; dy < height; dy++) {
      for (let dx = 0; dx < width; dx++) {
        if (CAVERN_CLUSTER_PATTERN[dy][dx] !== '.') footprint.push({ col: minCol + dx, row: minRow + dy });
      }
    }
    const inFootprint = new Set(footprint.map(c => `${c.col},${c.row}`));
    room.backgroundObjects = room.backgroundObjects.filter(o => !inFootprint.has(cellKey(o)));

    for (let dy = 0; dy < height; dy++) {
      for (let dx = 0; dx < width; dx++) {
        const mark = CAVERN_CLUSTER_PATTERN[dy][dx];
        if (mark === '.') continue;
        const typeId = mark === 'B' ? 'bombable_rock' : 'cavern_rock';
        const rock = new BackgroundObject('0', (minCol + dx) * CS, (minRow + dy) * CS, { typeId });
        rock.structural = true;
        room.backgroundObjects.push(rock);
      }
    }

    // Protected so cleanupStrayBackgroundObjects strips anything else that
    // lands on the Cavern (its own rocks are structural, so they are exempt).
    protectRegion(room, { kind: 'cells', cells: footprint });

    room.cavern = {
      hutKind: 'cavern',
      doorPosition: { col: doorCol, row: doorRow },
      revealed: false,
      interiorState: null,
      interiorGenerated: false,
    };
    return;
  }
}
