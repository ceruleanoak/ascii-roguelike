// Lava-Shy Mechanic — `data.lavaShy`: the enemy never walks onto lava.
// Water-Bound's mirror: where a Sea Snake refuses to leave the water, a
// Bumper refuses to enter the lava, and so the lava becomes the player's
// refuge from it — and the place it shoves the player toward.
//
// Three parts:
//   - Navigation: `isLavaCell` is consulted by enemyVision.hasLineOfSight,
//     the ray every pathing probe uses (EnemyPathfinding + the vector
//     navigation in Enemy.js), so lava reads as a wall to this enemy's
//     route-finding and it paths around a river instead of into it.
//   - Footing: after the State spine writes targetVelocity, any axis whose
//     leading edge would step onto lava is zeroed (velocity included, so the
//     blend doesn't coast it in). This is what holds it at the shore when the
//     player stands in the lava.
//   - Recovery: one already in lava (knocked, spawned, or flooded in) heads
//     for the nearest safe cell — not lava, not a wall. Knockback itself is
//     never clamped: a hit can still throw it into the lava. Taking no lava
//     damage while it's there is `lavaImmune`, a separate data flag.
//
// "Lava" is PhysicsSystem's lava: a `~` tile whose typeId is 'lava' (or an
// untyped damaging `~`). Lava is tested on the live object at query time, so
// a tile that changes type (Ascent floods) is seen as it is now. No suspend
// signal — writes velocity only.

import { GRID } from '../../game/GameConfig.js';
import { planeOf, objectOnPlane } from '../../systems/PlaneSystem.js';

// How far past its center the enemy looks along each axis of motion.
const LEADING_EDGE = GRID.CELL_SIZE * 0.6;
// How many rings out the recovery search looks for a safe cell.
const SAFE_SEARCH_RADIUS = 8;

function isLavaTile(obj) {
  if (obj.destroyed || obj.char !== '~') return false;
  return obj.typeId ? obj.typeId === 'lava' : !!(obj.damaging && obj.damage);
}

const cellKey = (col, row) => `${col},${row}`;

export const LavaShyMechanic = {
  isEnabled(enemy) {
    return enemy.data?.lavaShy === true;
  },

  init(enemy) {
    // Cell → background objects in that cell, rebuilt whenever the enemy's
    // background-object list is swapped or grows/shrinks.
    enemy.lavaShyCells = null;
    enemy.lavaShySource = null;
    enemy.lavaShySourceLength = 0;
  },

  // Whether grid cell (col, row) holds lava this enemy refuses to enter.
  // Always false for an enemy without the Mechanic.
  isLavaCell(enemy, col, row) {
    if (!this.isEnabled(enemy)) return false;
    const objs = this._cells(enemy).get(cellKey(col, row));
    if (!objs) return false;
    const plane = planeOf(enemy);
    return objs.some(obj => isLavaTile(obj) && objectOnPlane(obj, plane));
  },

  update(enemy) {
    if (!this.isEnabled(enemy) || enemy.isKnockedBack()) return;
    const cx = enemy.position.x + enemy.width / 2;
    const cy = enemy.position.y + enemy.height / 2;

    if (this._isLavaAt(enemy, cx, cy)) {
      this._headForSafeGround(enemy, cx, cy);
      return;
    }

    const tv = enemy.targetVelocity;
    if (tv.vx !== 0 && this._isLavaAt(enemy, cx + Math.sign(tv.vx) * LEADING_EDGE, cy)) {
      if (Math.sign(enemy.velocity.vx) === Math.sign(tv.vx)) enemy.velocity.vx = 0;
      tv.vx = 0;
    }
    if (tv.vy !== 0 && this._isLavaAt(enemy, cx, cy + Math.sign(tv.vy) * LEADING_EDGE)) {
      if (Math.sign(enemy.velocity.vy) === Math.sign(tv.vy)) enemy.velocity.vy = 0;
      tv.vy = 0;
    }
  },

  _cells(enemy) {
    const source = enemy.backgroundObjects ?? []; // layer-guard-ok: the enemy's own plane list
    if (enemy.lavaShyCells && enemy.lavaShySource === source
        && enemy.lavaShySourceLength === source.length) {
      return enemy.lavaShyCells;
    }
    const cells = new Map();
    for (const obj of source) {
      const col = Math.floor((obj.position.x + GRID.CELL_SIZE / 2) / GRID.CELL_SIZE);
      const row = Math.floor((obj.position.y + GRID.CELL_SIZE / 2) / GRID.CELL_SIZE);
      const key = cellKey(col, row);
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key).push(obj);
    }
    enemy.lavaShyCells = cells;
    enemy.lavaShySource = source;
    enemy.lavaShySourceLength = source.length;
    return cells;
  },

  _isLavaAt(enemy, x, y) {
    return this.isLavaCell(enemy, Math.floor(x / GRID.CELL_SIZE), Math.floor(y / GRID.CELL_SIZE));
  },

  // A cell the enemy could stand on: inside the map, not a wall, not lava.
  _isSafeCell(enemy, col, row) {
    const map = enemy.collisionMap;
    if (map) {
      if (row < 0 || row >= map.length || col < 0 || col >= (map[0]?.length ?? 0)) return false;
      if (map[row][col]) return false;
    }
    return !this.isLavaCell(enemy, col, row);
  },

  // Nearest safe cell by ring search; within the first ring that has any,
  // the closest by straight-line distance wins.
  _headForSafeGround(enemy, cx, cy) {
    const C = GRID.CELL_SIZE;
    const col0 = Math.floor(cx / C);
    const row0 = Math.floor(cy / C);
    let best = null;
    let bestDist = Infinity;
    for (let r = 1; r <= SAFE_SEARCH_RADIUS && !best; r++) {
      for (let dr = -r; dr <= r; dr++) {
        for (let dc = -r; dc <= r; dc++) {
          if (Math.max(Math.abs(dr), Math.abs(dc)) !== r) continue; // ring only
          const col = col0 + dc, row = row0 + dr;
          if (!this._isSafeCell(enemy, col, row)) continue;
          const tx = col * C + C / 2, ty = row * C + C / 2;
          const d = (tx - cx) ** 2 + (ty - cy) ** 2;
          if (d < bestDist) { bestDist = d; best = { x: tx, y: ty }; }
        }
      }
    }
    if (!best) return; // a sea of lava — nowhere to go, stay put
    const dx = best.x - cx;
    const dy = best.y - cy;
    const dist = Math.hypot(dx, dy) || 1;
    enemy.targetVelocity.vx = (dx / dist) * enemy.speed;
    enemy.targetVelocity.vy = (dy / dist) * enemy.speed;
  },
};
