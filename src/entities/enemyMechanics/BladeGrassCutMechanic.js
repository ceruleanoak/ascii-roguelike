// Blade Grass Cut — an Enemy searching (carrying a mark) with a blade weapon
// cuts the tall grass around it as it goes, the way the player's blade does.
// Extracted from Enemy.update.
import { GRID } from '../../game/GameConfig.js';

// Grass this close to the Enemy is within its blade's reach.
const CUT_REACH = GRID.CELL_SIZE * 1.5;

export const BladeGrassCutMechanic = {
  update(enemy) {
    if (!enemy.aggroMemoryActive || !enemy.backgroundObjects || !enemy.equippedWeapon) return; // layer-guard-ok
    if (!enemy.equippedWeapon.data?.isBlade) return;
    for (const obj of enemy.backgroundObjects) { // layer-guard-ok
      if (obj.destroyed || obj.char !== '|') continue;
      const dx = obj.position.x - enemy.position.x;
      const dy = obj.position.y - enemy.position.y;
      if (Math.sqrt(dx * dx + dy * dy) < CUT_REACH) obj.cutGrass();
    }
  },
};
