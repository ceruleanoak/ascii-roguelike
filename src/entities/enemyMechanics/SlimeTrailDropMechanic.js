import { GRID } from '../../game/GameConfig.js';

// Slime-affinity enemies stamp a trail puddle every N pixels traveled. Drops
// behind the enemy (opposite the movement vector) so the puddle doesn't land
// directly under the sprite. Does NOT suspend Enemy.update() — the payload is
// merged into the final return so other mechanics can run alongside.

const SLIME_TRAIL_DROP_PX = 5;

export const SlimeTrailDropMechanic = {
  isEnabled(enemy) {
    return enemy.data.elementalAffinity?.immunity?.includes('slime') === true;
  },

  init(enemy) {
    enemy.trailLastDropX = 0;
    enemy.trailLastDropY = 0;
    enemy.trailDropInitialized = false;
  },

  // Returns drop payload or null. Caller merges into final update() return.
  update(enemy) {
    if (!enemy.data.elementalAffinity?.immunity?.includes('slime')) return null;

    if (!enemy.trailDropInitialized) {
      enemy.trailLastDropX = enemy.position.x;
      enemy.trailLastDropY = enemy.position.y;
      enemy.trailDropInitialized = true;
      return null;
    }

    const tdx = enemy.position.x - enemy.trailLastDropX;
    const tdy = enemy.position.y - enemy.trailLastDropY;
    if (tdx * tdx + tdy * tdy < SLIME_TRAIL_DROP_PX * SLIME_TRAIL_DROP_PX) return null;

    // Offset 5 px opposite the movement vector so the puddle lands behind
    // the enemy rather than under it.
    const dist = Math.sqrt(tdx * tdx + tdy * tdy);
    const backX = -(tdx / dist) * SLIME_TRAIL_DROP_PX;
    const backY = -(tdy / dist) * SLIME_TRAIL_DROP_PX;
    const drop = {
      x: enemy.position.x + GRID.CELL_SIZE / 2 + backX,
      y: enemy.position.y + GRID.CELL_SIZE / 2 + backY,
      plane: enemy.plane ?? 0
    };
    enemy.trailLastDropX = enemy.position.x;
    enemy.trailLastDropY = enemy.position.y;
    return drop;
  }
};
