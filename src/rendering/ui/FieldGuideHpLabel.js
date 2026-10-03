/**
 * FieldGuideHpLabel - shows an enemy's current HP as "X / X" above it while a
 * Field Guide ('¶') sits in an equipped consumable slot.
 *
 * Called from ExploreRenderer.renderEnemy, which both the surface pass and
 * the interior PiP overlay go through, so the label shows on both planes.
 */

import { GRID } from '../../game/GameConfig.js';

const LABEL_COLOR = '#cccccc';
const LABEL_SCALE = 0.5;
// Above the head-indicator row (detection '!', windup, etc. sit at -1 cell).
const LABEL_OFFSET_Y = -GRID.CELL_SIZE * 1.6;

/** True while the player has a Field Guide in an equipped consumable slot. */
export function fieldGuideEquipped(game) {
  return !!game.player?.equippedConsumables?.some(slot => slot?.data?.fieldGuide);
}

/** Draws "hp / maxHp" centered above the enemy. */
export function drawFieldGuideHpLabel(renderer, enemy) {
  if (enemy.data?.isDummy || !(enemy.maxHp > 0)) return;
  const hp = Math.max(0, Math.ceil(enemy.hp));
  renderer.drawEntityScaled(
    enemy.position.x + GRID.CELL_SIZE / 2,
    enemy.position.y + GRID.CELL_SIZE / 2 + LABEL_OFFSET_Y,
    `${hp} / ${enemy.maxHp}`,
    LABEL_COLOR,
    LABEL_SCALE
  );
}
