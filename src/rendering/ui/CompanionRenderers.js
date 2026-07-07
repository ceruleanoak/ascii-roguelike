/**
 * CompanionRenderers - Render helpers for companion entities that don't
 * carry the full Enemy indicator surface (windup, sapping, hover, etc.)
 * so they can't reuse ExploreRenderer.renderEnemy.
 */

import { GRID } from '../../game/GameConfig.js';

// Minimal NPCRat render: char + color + iframe white-flash.
export function drawTamedRats(renderer, game, shouldRenderEntity) {
  for (const rat of game.tamedRats) {
    if (!shouldRenderEntity(rat, game.player, game.currentRoom)) continue;
    const flash = rat.getIframeFlashColor?.();
    const color = flash !== null && flash !== undefined ? flash : rat.color;
    renderer.drawEntity(
      rat.position.x + GRID.CELL_SIZE / 2,
      rat.position.y + GRID.CELL_SIZE / 2,
      rat.char,
      color
    );
  }
}
