/**
 * GreenRangerIndicator - Visual feedback for the Green Ranger's action cooldown
 *
 * Shows a green rising bar to the left of the player:
 * - Solid full bar: currently in continuous roll
 * - Rising bar (empty→full): recovering from action cooldown
 * - No bar: ready (no cooldown active)
 */

import { GRID } from '../../game/GameConfig.js';

export class GreenRangerIndicator {
  constructor(renderer) {
    this.renderer = renderer;
  }

  render(game) {
    if (!game.player || game.activeCharacterType !== 'green') return;

    const player = game.player;
    const inCooldown = player.actionCooldown > 0;
    const rolling = player.continuousRollActive;

    if (!inCooldown && !rolling) return;

    const barHeight = GRID.CELL_SIZE;
    const barX = player.position.x - 8; // Left of player
    const barY = player.position.y;

    // Dim background track
    this.renderer.drawRect(barX, barY, 4, barHeight, '#003318', true);

    if (rolling) {
      // Solid green bar while sliding
      this.renderer.drawRect(barX, barY, 4, barHeight, '#00ff44', true);
    } else {
      // Rising bar shows recovery progress (fills bottom-to-top as cooldown expires)
      const recoveryRatio = 1 - (player.actionCooldown / player.actionCooldownMax);
      const filledHeight = barHeight * recoveryRatio;
      if (filledHeight > 0) {
        this.renderer.drawRect(
          barX,
          barY + (barHeight - filledHeight),
          4,
          filledHeight,
          '#00ff44',
          true
        );
      }
    }
  }
}
