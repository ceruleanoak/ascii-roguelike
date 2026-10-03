// Water-Bound Mechanic — `data.waterBound`: the enemy never leaves the water.
// Sea Snakes keep to the Ocean's water and shoot from it; the player decides
// whether to come to the shoreline.
//
// Runs after the State spine has written targetVelocity for the frame. Any
// axis of motion whose leading edge would cross onto a non-water cell is
// zeroed (velocity included, so the blend doesn't coast it ashore). An enemy
// spawned on the sand is placed in the nearest water cell on its first frame;
// one knocked out of the water later heads straight back for it. Knockback
// itself is never clamped: a hit can still throw it onto the beach.
//
// "Water" is the same tile PhysicsSystem treats as water: a `~` background
// object that isn't lava, mud, or hot water, in a state that isn't frozen or
// crystallized (both are walkable). A room with no water leaves the enemy
// unconfined. No suspend signal — writes velocity only.

import { GRID } from '../../game/GameConfig.js';

// How far past its center the enemy looks along each axis of motion.
const LEADING_EDGE = GRID.CELL_SIZE * 0.6;

function isWaterTile(obj) {
  if (obj.destroyed || obj.char !== '~') return false;
  const isLava = obj.typeId ? obj.typeId === 'lava' : (obj.damaging && obj.damage);
  const isMud = obj.typeId ? (obj.typeId === 'mud_dry' || obj.typeId === 'mud_wet')
                           : (obj.isDryMud || obj.slowing === true);
  if (isLava || isMud || obj.typeId === 'hot_water') return false;
  const state = obj.getWaterState ? obj.getWaterState() : 'normal';
  return state !== 'frozen' && state !== 'crystallized';
}

const cellKey = (col, row) => `${col},${row}`;

export const WaterBoundMechanic = {
  isEnabled(enemy) {
    return enemy.data?.waterBound === true;
  },

  init(enemy) {
    // Cell → `~` object index of the room's water, rebuilt whenever the
    // enemy's background-object list is swapped (room/interior change).
    enemy.waterBoundCells = null;
    enemy.waterBoundSource = null;
  },

  update(enemy) {
    if (!this.isEnabled(enemy) || enemy.isKnockedBack()) return;
    const freshRoom = enemy.waterBoundSource !== enemy.backgroundObjects; // layer-guard-ok: the enemy's own plane list
    const cells = this._waterCells(enemy);
    if (cells.size === 0) return;

    const cx = enemy.position.x + enemy.width / 2;
    const cy = enemy.position.y + enemy.height / 2;
    if (!this._isWaterAt(cells, cx, cy)) {
      // Spawn placement doesn't know about water: on its first frame in a
      // room, an enemy rolled onto the sand starts in the nearest water cell
      // instead of slithering across the beach to reach it.
      if (freshRoom) {
        const water = this._nearestWater(cells, cx, cy);
        if (water) {
          enemy.position.x = water.position.x + (GRID.CELL_SIZE - enemy.width) / 2;
          enemy.position.y = water.position.y + (GRID.CELL_SIZE - enemy.height) / 2;
          return;
        }
      }
      this._headForWater(enemy, cells, cx, cy);
      return;
    }

    const tv = enemy.targetVelocity;
    if (tv.vx !== 0 && !this._isWaterAt(cells, cx + Math.sign(tv.vx) * LEADING_EDGE, cy)) {
      if (Math.sign(enemy.velocity.vx) === Math.sign(tv.vx)) enemy.velocity.vx = 0;
      tv.vx = 0;
    }
    if (tv.vy !== 0 && !this._isWaterAt(cells, cx, cy + Math.sign(tv.vy) * LEADING_EDGE)) {
      if (Math.sign(enemy.velocity.vy) === Math.sign(tv.vy)) enemy.velocity.vy = 0;
      tv.vy = 0;
    }
  },

  _waterCells(enemy) {
    const source = enemy.backgroundObjects; // layer-guard-ok: the enemy's own plane list
    if (enemy.waterBoundCells && enemy.waterBoundSource === source) return enemy.waterBoundCells;
    const cells = new Map();
    for (const obj of source ?? []) {
      if (obj.char !== '~') continue;
      const col = Math.floor((obj.position.x + GRID.CELL_SIZE / 2) / GRID.CELL_SIZE);
      const row = Math.floor((obj.position.y + GRID.CELL_SIZE / 2) / GRID.CELL_SIZE);
      cells.set(cellKey(col, row), obj);
    }
    enemy.waterBoundCells = cells;
    enemy.waterBoundSource = source;
    return cells;
  },

  _isWaterAt(cells, x, y) {
    const obj = cells.get(cellKey(Math.floor(x / GRID.CELL_SIZE), Math.floor(y / GRID.CELL_SIZE)));
    return !!obj && isWaterTile(obj);
  },

  _nearestWater(cells, cx, cy) {
    let best = null;
    let bestDist = Infinity;
    for (const obj of cells.values()) {
      if (!isWaterTile(obj)) continue;
      const dx = obj.position.x + GRID.CELL_SIZE / 2 - cx;
      const dy = obj.position.y + GRID.CELL_SIZE / 2 - cy;
      const d = dx * dx + dy * dy;
      if (d < bestDist) { bestDist = d; best = obj; }
    }
    return best;
  },

  _headForWater(enemy, cells, cx, cy) {
    const water = this._nearestWater(cells, cx, cy);
    if (!water) return;
    const dx = water.position.x + GRID.CELL_SIZE / 2 - cx;
    const dy = water.position.y + GRID.CELL_SIZE / 2 - cy;
    const dist = Math.hypot(dx, dy) || 1;
    enemy.targetVelocity.vx = (dx / dist) * enemy.speed;
    enemy.targetVelocity.vy = (dy / dist) * enemy.speed;
  },
};
