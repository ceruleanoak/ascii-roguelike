// Vault walls stop melee reach. A V room Vault's walls exist only as
// collisionMap cells on its perimeter (RoomGenerator.placeVaultStructure), so
// a melee swing's plain box-overlap test reached straight through them and
// opened the chests inside. Projectiles already stop at walls
// (WallRicochetMechanic.hitsWall); this is the melee half.
//
// Scoped to the Vault rather than every collision cell on purpose: dungeon
// gaps, Ridge chasms and Bombable walls are collision cells too, and melee
// across a gap is part of several Trials.

import { GRID } from '../game/GameConfig.js';

// Sample spacing along the reach segment. The perimeter is a closed ring of
// whole cells, so any segment from outside to inside crosses at least a
// quarter-cell of wall — an eighth-cell step cannot step over it.
const SAMPLE_STEP = GRID.CELL_SIZE / 8;

function centerOf(entity) {
  return { x: entity.position.x + GRID.CELL_SIZE / 2, y: entity.position.y + GRID.CELL_SIZE / 2 };
}

function cellOf(point) {
  return { col: Math.floor(point.x / GRID.CELL_SIZE), row: Math.floor(point.y / GRID.CELL_SIZE) };
}

function insideVault(vault, { col, row }) {
  return col > vault.minCol && col < vault.maxCol && row > vault.minRow && row < vault.maxRow;
}

function onVaultPerimeter(vault, { col, row }) {
  if (col < vault.minCol || col > vault.maxCol || row < vault.minRow || row > vault.maxRow) return false;
  return col === vault.minCol || col === vault.maxCol || row === vault.minRow || row === vault.maxRow;
}

/**
 * True when a melee reach from `attacker` to `target` (entities or background
 * objects, measured cell-center to cell-center) crosses a standing wall of
 * the room's Vault — i.e. the target is inside the Vault, the attacker is
 * not, and the line between them still meets wall. A wall cell an unlock has
 * opened (collisionMap cleared, see InteractionSystem) lets the reach through.
 */
export function vaultWallBlocksReach(room, attacker, target) {
  const vault = room?.vaultInfo;
  if (!vault || !room.collisionMap) return false;
  const from = centerOf(attacker), to = centerOf(target);
  if (!insideVault(vault, cellOf(to)) || insideVault(vault, cellOf(from))) return false;

  const dx = to.x - from.x, dy = to.y - from.y;
  const steps = Math.ceil(Math.hypot(dx, dy) / SAMPLE_STEP);
  for (let i = 0; i <= steps; i++) {
    const cell = cellOf({ x: from.x + dx * (i / steps), y: from.y + dy * (i / steps) });
    if (onVaultPerimeter(vault, cell) && room.collisionMap[cell.row]?.[cell.col]) return true;
  }
  return false;
}

/**
 * Hand the Vault RoomGenerator.placeVaultStructure staged for this room over
 * to the room: its vaultInfo, the seal on its floor, and the loot and coins
 * staged inside it. No-op for every room without a Vault.
 *
 * A locked Vault's floor is open but has no walkable route in, so it is a
 * sealed region (roomFeatures.isCellSealed): nothing may place the player
 * there. The return from a neutral room lands on room centre, which is the
 * Vault's centre, and stranded the player inside. Opening the wall lifts the
 * seal (unsealVault).
 */
export function attachVault(generator, room) {
  if (generator.currentVaultInfo) {
    const vault = generator.currentVaultInfo;
    generator.currentVaultInfo = null; // Reset for next room
    room.vaultInfo = vault;
    vault.sealedRegion = { kind: 'rect', minCol: vault.minCol, maxCol: vault.maxCol, minRow: vault.minRow, maxRow: vault.maxRow };
    room.sealedRegions = [...(room.sealedRegions || []), vault.sealedRegion];
  }

  // Interior loot staged by placeVaultStructure
  if (generator.pendingVaultLoot?.length) {
    room.backgroundObjects.push(...generator.pendingVaultLoot);
    generator.pendingVaultLoot = [];
  }

  // Coins (non-gravitating ingredients) go straight into the game
  if (generator.pendingVaultCoins?.length) {
    for (const coin of generator.pendingVaultCoins) {
      generator.game?.ingredients?.push(coin);
      generator.game?.physicsSystem?.addEntity(coin);
    }
    generator.pendingVaultCoins = [];
  }
}

/** The Vault has a way in now: its floor is no longer sealed. */
export function unsealVault(room, vault) {
  room.sealedRegions = (room.sealedRegions || []).filter(region => region !== vault.sealedRegion);
}
