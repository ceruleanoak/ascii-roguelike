/**
 * drawManaGems — foreground render pass for mana gem background objects.
 * Pulses each gem's color based on its pulseTimer.
 */

import { GRID } from '../../game/GameConfig.js';

const GEM_BASE = {
  red:    [255, 50, 50],
  green:  [50, 200, 50],
  blue:   [50, 100, 255],
  yellow: [255, 200, 50]
};

export function drawManaGems(renderer, game) {
  for (const obj of game.backgroundObjects) {
    if (!obj.data?.manaGem || obj.destroyed) continue;
    if (!renderer.shouldRenderBackgroundObject(obj, game.player)) continue;
    const pulse = Math.sin(obj.pulseTimer * 3) * 0.3 + 0.7;
    const gemColor = obj.manaGemColor || obj.data.manaGemColor;
    const base = GEM_BASE[gemColor];
    const drawColor = base
      ? `rgb(${Math.round(base[0] * pulse)},${Math.round(base[1] * pulse)},${Math.round(base[2] * pulse)})`
      : obj.color;
    renderer.drawEntity(
      obj.position.x + GRID.CELL_SIZE / 2,
      obj.position.y + GRID.CELL_SIZE / 2,
      '◆',
      drawColor
    );
  }
}
