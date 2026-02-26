/**
 * BowChargeIndicator - Visual feedback for bow charge state
 *
 * Shows 3 states:
 * - Out of arrows: Blinking red X
 * - Charging: Growing yellow bar (bottom to top)
 * - Cooldown: Blinking bar at last charge level
 * - Ready: No indicator
 */

import { GRID } from '../../game/GameConfig.js';

export class BowChargeIndicator {
  constructor(renderer) {
    this.renderer = renderer;
  }

  render(game) {
    if (!game.player || !game.player.heldItem || game.player.heldItem.data.weaponType !== 'BOW') {
      return;
    }

    const weapon = game.player.heldItem;
    const barHeight = GRID.CELL_SIZE; // Player height
    const barX = game.player.position.x + GRID.CELL_SIZE * 1.5; // To the right of player
    const barY = game.player.position.y; // Aligned with player

    // State 0: Out of arrows - show blinking red X
    if (weapon.usesRemaining !== null && weapon.usesRemaining <= 0) {
      const blinkOn = Math.floor(performance.now() / 1000 * 6) % 2 === 0;
      if (blinkOn) {
        this.renderer.drawEntity(
          barX + 2, // Center the X in the bar position
          barY + barHeight / 2,
          'X',
          '#ff0000'
        );
      }
    }
    // State 1: Charging (hold space) - show growing bar
    else if (weapon.isCharging) {
      const chargeRatio = Math.min(weapon.chargeTime / weapon.maxChargeTime, 1.0);
      const filledHeight = barHeight * chargeRatio;

      // Draw filled portion (charge level) - grows from bottom to top
      this.renderer.drawRect(
        barX,
        barY + (barHeight - filledHeight),
        4,
        filledHeight,
        '#ffdd44',
        true
      );
    }
    // State 2: Cooldown (after firing) - show blinking bar at fired charge level
    else if (weapon.cooldownTimer > 0) {
      const blinkOn = Math.floor(performance.now() / 1000 * 8) % 2 === 0;
      if (blinkOn) {
        const filledHeight = barHeight * weapon.lastChargeRatio;
        this.renderer.drawRect(
          barX,
          barY + (barHeight - filledHeight),
          4,
          filledHeight,
          '#ffdd44',
          true
        );
      }
    }
    // State 3: Ready to attack - indicator disappears
  }
}
