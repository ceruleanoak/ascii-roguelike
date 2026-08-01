import { GRID } from '../game/GameConfig.js';

/**
 * Acid Blade: flood-fill connected water tiles, permanently converting the
 * entire pond to acid (modelled as the existing 'poisoned' waterState with
 * Infinity duration). 4-connected adjacency on the cell grid — hitting one
 * edge of a pond poisons the whole pond, not a single cell.
 *
 * (Electrify is NOT instant like this — shock-on-water routes through
 * ElectricitySystem so the charge spreads tile-by-tile at a fixed rate.)
 *
 * Pure over the background-object list: it reads positions and mutates water
 * state, and holds no combat state of its own. Extracted from CombatSystem for
 * the same reason ElectricConduction was — a self-contained propagation pass
 * that the combat loop only needs to kick off.
 */
export function acidFloodFillWater(startObj, backgroundObjects) {
  const CELL = GRID.CELL_SIZE;
  const key = (x, y) => `${Math.round(x / CELL)},${Math.round(y / CELL)}`;

  const waterMap = new Map();
  for (const obj of backgroundObjects) {
    if (obj.destroyed) continue;
    if (!obj.isWater || !obj.isWater()) continue;
    waterMap.set(key(obj.position.x, obj.position.y), obj);
  }

  const visited = new Set();
  const queue = [startObj];
  visited.add(key(startObj.position.x, startObj.position.y));

  while (queue.length > 0) {
    const obj = queue.shift();
    obj.setWaterState('poisoned', Infinity);

    const cx = Math.round(obj.position.x / CELL);
    const cy = Math.round(obj.position.y / CELL);
    const neighborKeys = [
      `${cx - 1},${cy}`, `${cx + 1},${cy}`,
      `${cx},${cy - 1}`, `${cx},${cy + 1}`
    ];
    for (const nk of neighborKeys) {
      if (visited.has(nk)) continue;
      const neighbor = waterMap.get(nk);
      if (!neighbor) continue;
      visited.add(nk);
      queue.push(neighbor);
    }
  }
}
