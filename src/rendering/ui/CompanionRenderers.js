/**
 * CompanionRenderers - Render helpers for companion entities that don't
 * carry the full Enemy indicator surface (windup, sapping, hover, etc.)
 * so they can't reuse ExploreRenderer.renderEnemy.
 */

import { GRID } from '../../game/GameConfig.js';

// Minimal NPCRat render: char + color + iframe white-flash. Gilded rats
// (dungeon-vault reward) render gold instead of white.
export function drawTamedRats(renderer, game, shouldRenderEntity) {
  for (const rat of game.tamedRats) {
    if (!shouldRenderEntity(rat, game.player, game.currentRoom)) continue;
    let color = rat.color;
    if (rat.gilded) {
      color = '#ffd700';
    } else {
      const flash = rat.getIframeFlashColor?.();
      color = flash !== null && flash !== undefined ? flash : rat.color;
    }
    renderer.drawEntity(
      rat.position.x + GRID.CELL_SIZE / 2,
      rat.position.y + GRID.CELL_SIZE / 2,
      rat.char,
      color
    );
  }
}

// Minimal GolemCompanion render: char + type color + iframe white-flash.
// A resurrecting Mud Golem is body-destroyed (shouldRenderVisible() false)
// so it draws nothing until it comes back.
export function drawGolems(renderer, game, shouldRenderEntity) {
  for (const golem of game.golems) {
    if (!shouldRenderEntity(golem, game.player, game.currentRoom)) continue;
    if (!golem.shouldRenderVisible()) continue;
    const flash = golem.getIframeFlashColor?.() ?? golem.getWindupFlashColor?.();
    const color = flash !== null && flash !== undefined ? flash : golem.color;
    renderer.drawEntity(
      golem.position.x + GRID.CELL_SIZE / 2,
      golem.position.y + GRID.CELL_SIZE / 2,
      golem.char,
      color
    );
    // Windup telegraph ('!' above the head) — bug-inbox: golems attacked
    // with no tell. Mirrors ExploreRenderer._drawHeadIndicator for enemies.
    const indicator = golem.getWindupIndicator?.();
    if (indicator) {
      renderer.drawEntity(
        golem.position.x + GRID.CELL_SIZE / 2 + (indicator.offsetX || 0),
        golem.position.y + GRID.CELL_SIZE / 2 + indicator.offsetY,
        indicator.char,
        indicator.color
      );
    }
  }
}
