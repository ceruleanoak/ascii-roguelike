/**
 * BowChargeIndicator - Visual feedback for bow charge state, wand uses, and gun reloads
 *
 * Shows 3 states for BOWs:
 * - Out of arrows: Blinking red X
 * - Charging: Growing yellow bar (bottom to top)
 * - Cooldown: Blinking bar at last charge level
 * - Ready: No indicator
 *
 * Shows 1 state for WANDs:
 * - Out of uses: Blinking red X
 *
 * Shows 1 state for GUNs with a magazine:
 * - Reloading: Growing yellow bar (same visual as bow charge)
 */

import { GRID } from '../../game/GameConfig.js';

export class BowChargeIndicator {
  constructor(renderer) {
    this.renderer = renderer;
  }

  render(game) {
    if (!game.player || !game.player.heldItem) {
      return;
    }

    const weapon = game.player.heldItem;
    const weaponType = weapon.data.weaponType;

    const isChargeGun = weaponType === 'GUN' && weapon.data.requiresCharge;
    const isGun = weaponType === 'GUN';

    // Charge hammer (Crystal Maul): cyan charge bar while building up; nothing after used.
    if (weapon.data.chargeHammer) {
      if (weapon.chargeAttackUsed) return; // mega-attack spent — no indicator
      if (!weapon.isCharging) return;      // not charging — no indicator
      const ratio = Math.min(weapon.chargeTime / weapon.data.chargeTime, 1.0);
      const barHeight = GRID.CELL_SIZE;
      const barX = game.player.position.x + GRID.CELL_SIZE * 1.5;
      const barY = game.player.position.y;
      const filledHeight = barHeight * ratio;
      this.renderer.drawRect(barX, barY + (barHeight - filledHeight), 4, filledHeight, '#88eeff', true);
      return;
    }

    // Weapon throw charge bar (SHIFT-hold for non-trap items)
    if (game.trapCharging && weapon.data.type !== 'TRAP') {
      const ratio = Math.min(game.trapCharging.timer / (game.trapCharging.maxTime || 0.7), 1.0);
      const barHeight = GRID.CELL_SIZE;
      const barX = game.player.position.x + GRID.CELL_SIZE * 1.5;
      const barY = game.player.position.y;
      const filledHeight = barHeight * ratio;
      this.renderer.drawRect(barX, barY + (barHeight - filledHeight), 4, filledHeight, '#ffdd44', true);
      return;
    }

    // Only render for BOWs, WANDs, and GUNs
    if (weaponType !== 'BOW' && weaponType !== 'WAND' && !isGun) {
      return;
    }

    const barHeight = GRID.CELL_SIZE; // Player height
    const barX = game.player.position.x + GRID.CELL_SIZE * 1.5; // To the right of player
    const barY = game.player.position.y; // Aligned with player

    // GUN reload bar: only shown during the dedicated reload phase (post-fire
    // cooldown runs first), fills bottom-to-top as reload progresses.
    const isReloading = isGun && weapon._reloading && !!weapon.data.reloadTime;
    if (isReloading) {
      const ratio = 1 - Math.max(0, Math.min(1, weapon.cooldownTimer / weapon.data.reloadTime));
      const filledHeight = barHeight * ratio;
      this.renderer.drawRect(
        barX,
        barY + (barHeight - filledHeight),
        4,
        filledHeight,
        '#ffdd44',
        true
      );
      return;
    }

    // Non-charge regular guns have no further indicator state
    if (isGun && !isChargeGun) return;

    // Wands: Show red X when out of uses
    if (weaponType === 'WAND') {
      if (weapon.wandUsesRemaining !== null && weapon.wandUsesRemaining <= 0) {
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
      return; // Wands only show red X, no charge bar
    }

    // Bows / charge guns: State 0 - Out of arrows - show blinking red X (bows only).
    // Boomerangs skip this — every throw is refunded on catch, so "0 ammo" is just mid-flight state.
    if (!isChargeGun && !weapon.data?.boomerang && weapon.usesRemaining !== null && weapon.usesRemaining <= 0) {
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
