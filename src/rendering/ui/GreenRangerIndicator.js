/**
 * GreenRangerIndicator - Visual feedback for the Green Ranger's charge meter
 *
 * Shows a green bar to the left of the player:
 * - Draining bar (full→empty): rolling (charge being consumed)
 * - Rising bar (empty→full): recovering from action cooldown (charge refilling)
 * - No bar: ready (full charge, no cooldown active)
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
      // Draining bar anchored at bottom — shrinks from top down as charge depletes (mirrors recovery)
      const chargeRatio = player.rollCharge / player.actionCooldownMax;
      const filledHeight = Math.max(1, barHeight * chargeRatio);
      this.renderer.drawRect(barX, barY + (barHeight - filledHeight), 4, filledHeight, '#00ff44', true);
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
