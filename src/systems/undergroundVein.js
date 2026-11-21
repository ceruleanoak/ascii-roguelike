import { GRID } from '../game/GameConfig.js';
import { BackgroundObject } from '../entities/BackgroundObject.js';

/**
 * The U room's secret vein: a red '⊙' marker underground (plane 1,
 * indestructible) under a surface rock that looks like the obsidian field
 * around it but mines like a normal rock and drops a Crystal Maul (T4).
 * A hidden trail of the same false obsidian runs to it from the nearest
 * clearing. Both are placed by RoomGenerator.generateUndergroundRoom.
 */

/**
 * Place one secret vein pair on the first candidate passage cell that has a
 * surface rock above it. Candidates are the passage cells not used by
 * glittering rocks or enemies. Returns the vein's cell, or null when none fit.
 */
export function placeSecretVein(room, candidates) {
  for (const cell of candidates) {
    const veinX = cell.col * GRID.CELL_SIZE;
    const veinY = cell.row * GRID.CELL_SIZE;
    // Require a surface rock at this position (placed in the fill loop).
    const surfaceIdx = room.backgroundObjects.findIndex(
      o => o.surfaceOnly && !o.destroyed &&
           o.position.x === veinX && o.position.y === veinY
    );
    if (surfaceIdx === -1) continue;
    // Replace the surface rock with the secret vein rock.
    // Override char/color so it renders identically to the surrounding
    // obsidian field (false obsidian — looks unbreakable, mines like a
    // normal rock). The data-driven hp/indestructible/dropEffect for '@'
    // are left untouched, so it stays mechanically a regular breakable rock.
    const secretSurface = new BackgroundObject('@', veinX, veinY);
    secretSurface.surfaceOnly = true;
    secretSurface.falseObsidian = true;
    secretSurface.char = '0';
    secretSurface.animationChar = '0';
    secretSurface.color = '#333333';
    secretSurface.animationColor = '#333333';
    room.backgroundObjects[surfaceIdx] = secretSurface;
    // Place the underground red marker at the same grid position.
    room.backgroundObjects.push(new BackgroundObject('⊙', veinX, veinY));
    return cell;
  }
  return null;
}

/**
 * Carve a hidden trail of false obsidian through the field: a single-cell-wide
 * path from the nearest clearing's inner edge to the vein. False obsidian
 * renders identically to real obsidian (dark rock, same char) but mines like
 * a normal rock — the route can only be found by mining, never by looking at it.
 */
export function carveFalseObsidianTrail(room, veinCell) {
  const clearingEdges = [
    { col: 15, row: 5 },  // north
    { col: 15, row: 24 }, // south
    { col: 24, row: 15 }, // east
    { col: 5,  row: 15 }  // west
  ];
  const nearestEdge = clearingEdges.reduce((best, edge) => {
    const dist = Math.abs(edge.col - veinCell.col) + Math.abs(edge.row - veinCell.row);
    return (!best || dist < best.dist) ? { edge, dist } : best;
  }, null).edge;

  const trailCells = [];
  let tc = nearestEdge.col, tr = nearestEdge.row;
  while (tc !== veinCell.col) {
    trailCells.push({ col: tc, row: tr });
    tc += tc < veinCell.col ? 1 : -1;
  }
  while (tr !== veinCell.row) {
    trailCells.push({ col: tc, row: tr });
    tr += tr < veinCell.row ? 1 : -1;
  }

  for (const { col, row } of trailCells) {
    const tx = col * GRID.CELL_SIZE, ty = row * GRID.CELL_SIZE;
    // Only convert real obsidian fill rocks — never an entrance cap rock
    // (those are deliberately indestructible and not flagged obsidian).
    const obj = room.backgroundObjects.find(
      o => o.surfaceOnly && !o.destroyed && o.char === '0' && o.obsidian === true &&
           o.position.x === tx && o.position.y === ty
    );
    if (obj) {
      // Breakable again, but keeps the dark obsidian color — false obsidian.
      obj.obsidian = false;
      obj.indestructible = false;
      obj.falseObsidian = true;
    }
  }
}
