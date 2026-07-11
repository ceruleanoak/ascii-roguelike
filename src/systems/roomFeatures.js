import { GRID, BACKGROUND_OBJECT_VARIANTS } from '../game/GameConfig.js';
import { BackgroundObject } from '../entities/BackgroundObject.js';
import { Fisherman } from '../entities/Fisherman.js';
import { Enemy } from '../entities/Enemy.js';
import { ENEMIES } from '../data/enemies.js';
import { WeaponsMaster } from '../entities/WeaponsMaster.js';

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
 * Cellular-automata cave grid. Returns grid[row][col] where 1 = wall, 0 = open.
 * Borders are always wall; `isOpen(col, row)` cells are forced open (clearings,
 * dive pockets). Shared by underground, bat belfry, and the Aquifer.
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
  for (let i = 0; i < bushCount; i++) {
    const pos = gen.getRandomPosition(room.collisionMap, room.enemies, room.playerStartPos, room.backgroundObjects);
    if (!pos) continue;
    const col = Math.round(pos.x / C), row = Math.round(pos.y / C);
    if (poolCells.some(c => c.col === col && c.row === row)) continue;
    room.backgroundObjects.push(new BackgroundObject('e', pos.x, pos.y));
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

// Quagmire Pond: shape a small round body of water (from '~' bg objects) at the
// largest pool's center with a conspicuous dark water tile in the middle — the
// frog-only Pond entrance. AquiferSystem reads room.pondEntry to dive.
export function placePondEntries(gen, room) {
  const nodes = gen.currentLetterTemplate?.lakeZone?.nodes;
  if (!nodes?.length) return;
  const C = GRID.CELL_SIZE;
  const node = nodes.reduce((a, b) => (b.radius > a.radius ? b : a));
  const R = 2; // pond radius in cells

  const waterAt = (col, row) => room.backgroundObjects.find(o =>
    o.char === '~' && Math.round(o.position.x / C) === col && Math.round(o.position.y / C) === row);

  // Fill a circular disc of water around the node center.
  for (let dr = -R; dr <= R; dr++) {
    for (let dc = -R; dc <= R; dc++) {
      if (dc * dc + dr * dr > R * R) continue;
      const col = node.col + dc, row = node.row + dr;
      if (col < 1 || row < 1 || col >= GRID.COLS - 1 || row >= GRID.ROWS - 1) continue;
      if (room.collisionMap[row]?.[col]) continue;
      if (!waterAt(col, row)) {
        room.backgroundObjects.push(new BackgroundObject('~', col * C, row * C));
      }
    }
  }

  // Dark water in the middle = the unique entrance.
  const center = waterAt(node.col, node.row);
  if (!center) return;
  center.pondEntry = true;
  center.color = '#0a3050';
  center.animationColor = '#0a3050';
  room.pondEntry = center;
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
 * Bats spawn as one flock per room: depth-scaled size (max 5), clustered
 * around a single anchor, sharing one roost/flight mode roll. Perched flocks
 * start dormant ('rest') and settle onto trees/stumps via FlockMechanic;
 * airborne flocks swirl as a group that drifts across the player's path.
 * Returns true when at least one bat spawned (caller skips further '^' picks).
 */
export function spawnBatFlock(gen, room, clusterAnchors, islandConfig) {
  const flockSize = Math.min(1 + Math.floor(gen.currentDepth / 2), 5);
  const perched = Math.random() < (ENEMIES['^'].flockBehavior?.perchChance ?? 0.5);
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
        ? gen.getIslandPosition(islandConfig, room.collisionMap, room.enemies, room.playerStartPos, room.backgroundObjects)
        : gen.getRandomPosition(room.collisionMap, room.enemies, room.playerStartPos, room.backgroundObjects, false);
    }
    if (!pos) continue;
    const bat = new Enemy('^', pos.x, pos.y, gen.currentDepth);
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
 * Settlement room ('S') — 2-3 neutral huts drawn at random from
 * `template.settlementHutPool`, placed at random non-overlapping positions
 * (never enemy_encounter or witch). Builds `room.huts[]` (plural — see
 * HutSystem._findNearbyHut) and never locks exits since Settlement is
 * always neutral.
 */
export function generateSettlementRoom(gen, room) {
  const pool = gen.currentLetterTemplate?.settlementHutPool ?? [];
  const hutCount = Math.min(pool.length, 2 + Math.floor(Math.random() * 2)); // 2-3
  const chosenKinds = shuffled(pool).slice(0, hutCount);

  const placedBounds = [];
  room.huts = [];
  for (const hutKind of chosenKinds) {
    let chosenCenter = null;
    for (let attempt = 0; attempt < 40; attempt++) {
      const centerCol = SETTLEMENT_CENTER_MIN + Math.floor(Math.random() * SETTLEMENT_CENTER_SPAN);
      const centerRow = SETTLEMENT_CENTER_MIN + Math.floor(Math.random() * SETTLEMENT_CENTER_SPAN);
      const candidate = { minCol: centerCol - 2, maxCol: centerCol + 2, minRow: centerRow - 2, maxRow: centerRow + 2 };
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

  gen.generateBackgroundObjects(room);
  room.exitsLocked = false;
}
