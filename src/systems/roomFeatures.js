import { GRID } from '../game/GameConfig.js';
import { BackgroundObject } from '../entities/BackgroundObject.js';
import { Fisherman } from '../entities/Fisherman.js';

// Room-generation feature helpers extracted from RoomGenerator (arch budget).
// Each takes the generator instance (`gen`) for its placement utilities.

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
