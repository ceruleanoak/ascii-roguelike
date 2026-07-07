/**
 * ArrowKeyIndicators - Visual feedback for dodge roll controls
 *
 * Displays arrow keys with bracket styling on right side of REST screen.
 * Shows three states:
 * - Pressed: Yellow (ready color)
 * - Cooldown: Red (dodge roll on cooldown)
 * - Inactive: White blinking after inactivity threshold
 * - Normal: Gray text color
 */

import { GRID, COLORS } from '../../game/GameConfig.js';
import { spectaclesTransformString, isSpectaclesActive, CIPHER_FONT_SCALE } from '../../data/cipher.js';

export class ArrowKeyIndicators {
  constructor(renderer) {
    this.renderer = renderer;
  }

  render(game) {
    // Position: Right quarter of screen, mirroring WASD on left
    const arrowY = GRID.HEIGHT - GRID.CELL_SIZE * 7.5;
    const arrowCenterX = (GRID.WIDTH / 4) * 3; // Right quarter of screen

    const spectaclesOn = isSpectaclesActive(game);

    // Determine inactivity blinking state
    const isInactive = game.inactivityTimer >= game.INACTIVITY_THRESHOLD;
    const blinkWhite = isInactive && game.wasdBlinkState;
    const inactiveColor = blinkWhite ? '#FFFFFF' : COLORS.TEXT;

    // Check if on cooldown for color theming
    const onCooldown = game.player && game.player.dodgeRoll.cooldownTimer > 0;
    const cooldownColor = '#ff6666'; // Dim red when on cooldown
    const readyColor = COLORS.ITEM; // Bright yellow when ready

    // Check if player has an item to throw
    const hasItemToThrow = game.player && game.player.heldItem;

    // Determine font sizes: pressed keys get larger font
    const getArrowStyle = (isPressed, isShift = false) => {
      if (isShift && !hasItemToThrow && isPressed) {
        return { fontSize: GRID.CELL_SIZE * 1.4, color: cooldownColor };
      }
      if (isPressed) {
        return { fontSize: GRID.CELL_SIZE * 1.4, color: readyColor };
      } else if (onCooldown) {
        return { fontSize: GRID.CELL_SIZE, color: cooldownColor };
      } else if (isInactive) {
        return { fontSize: GRID.CELL_SIZE, color: inactiveColor };
      } else {
        return { fontSize: GRID.CELL_SIZE, color: COLORS.TEXT };
      }
    };

    const upStyle = getArrowStyle(game.arrowKeys.ArrowUp);
    const downStyle = getArrowStyle(game.arrowKeys.ArrowDown);
    const leftStyle = getArrowStyle(game.arrowKeys.ArrowLeft);
    const rightStyle = getArrowStyle(game.arrowKeys.ArrowRight);
    const shiftStyle = getArrowStyle(game.keys.shift, true);

    // Draw using foreground context for proper layering with variable font sizes
    const ctx = this.renderer.fgCtx;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const half = GRID.CELL_SIZE / 2;

    const topRow = Math.floor(arrowY / GRID.CELL_SIZE);
    const centerCol = Math.floor(arrowCenterX / GRID.CELL_SIZE);
    const bottomRow = topRow + 1;

    // Brackets (static size)
    ctx.font = `${GRID.CELL_SIZE}px 'Unifont', monospace`;
    ctx.fillStyle = COLORS.BORDER;
    ctx.fillText('[', (centerCol - 1) * GRID.CELL_SIZE + half, topRow * GRID.CELL_SIZE + half);
    ctx.fillText(']', (centerCol + 1) * GRID.CELL_SIZE + half, topRow * GRID.CELL_SIZE + half);

    ctx.fillText('[', (centerCol - 5) * GRID.CELL_SIZE + half, bottomRow * GRID.CELL_SIZE + half);
    ctx.fillText(']', (centerCol - 3) * GRID.CELL_SIZE + half, bottomRow * GRID.CELL_SIZE + half);

    ctx.fillText('[', (centerCol - 1) * GRID.CELL_SIZE + half, bottomRow * GRID.CELL_SIZE + half);
    ctx.fillText(']', (centerCol + 1) * GRID.CELL_SIZE + half, bottomRow * GRID.CELL_SIZE + half);

    ctx.fillText('[', (centerCol + 3) * GRID.CELL_SIZE + half, bottomRow * GRID.CELL_SIZE + half);
    ctx.fillText(']', (centerCol + 5) * GRID.CELL_SIZE + half, bottomRow * GRID.CELL_SIZE + half);

    // Arrow UP (top)
    ctx.font = `${upStyle.fontSize}px 'Unifont', monospace`;
    ctx.fillStyle = upStyle.color;
    ctx.fillText('↑', centerCol * GRID.CELL_SIZE + half, topRow * GRID.CELL_SIZE + half);

    // Arrow LEFT (bottom row)
    ctx.font = `${leftStyle.fontSize}px 'Unifont', monospace`;
    ctx.fillStyle = leftStyle.color;
    ctx.fillText('←', (centerCol - 4) * GRID.CELL_SIZE + half, bottomRow * GRID.CELL_SIZE + half);

    // Arrow DOWN (bottom row)
    ctx.font = `${downStyle.fontSize}px 'Unifont', monospace`;
    ctx.fillStyle = downStyle.color;
    ctx.fillText('↓', centerCol * GRID.CELL_SIZE + half, bottomRow * GRID.CELL_SIZE + half);

    // Arrow RIGHT (bottom row)
    ctx.font = `${rightStyle.fontSize}px 'Unifont', monospace`;
    ctx.fillStyle = rightStyle.color;
    ctx.fillText('→', (centerCol + 4) * GRID.CELL_SIZE + half, bottomRow * GRID.CELL_SIZE + half);

    // Draw "D O D G E" label below arrow keys
    const dodgeY = arrowY + GRID.CELL_SIZE * 2.5;
    ctx.font = spectaclesOn
      ? `${Math.round(GRID.CELL_SIZE * 0.7 * CIPHER_FONT_SCALE)}px 'Unifont', monospace`
      : `${GRID.CELL_SIZE * 0.7}px 'VentureArcade', 'Unifont', monospace`;
    ctx.fillStyle = '#666666';
    ctx.fillText(spectaclesTransformString('D O D G E', spectaclesOn), centerCol * GRID.CELL_SIZE + half, dodgeY);

    // SHIFT key with THROW label (grouped together)
    const shiftY = dodgeY + GRID.CELL_SIZE * 1.5;
    ctx.font = `${GRID.CELL_SIZE}px 'Unifont', monospace`;
    ctx.fillStyle = COLORS.BORDER;
    ctx.fillText('[', (centerCol - 6) * GRID.CELL_SIZE + half, shiftY);
    ctx.fillText(']', (centerCol + 6) * GRID.CELL_SIZE + half, shiftY);
    ctx.font = `${shiftStyle.fontSize}px 'Unifont', monospace`;
    ctx.fillStyle = shiftStyle.color;
    ctx.fillText('SHIFT', centerCol * GRID.CELL_SIZE + half, shiftY);

    // THROW label right below SHIFT
    ctx.font = spectaclesOn
      ? `${Math.round(GRID.CELL_SIZE * 0.7 * CIPHER_FONT_SCALE)}px 'Unifont', monospace`
      : `${GRID.CELL_SIZE * 0.7}px 'VentureArcade', 'Unifont', monospace`;
    ctx.fillStyle = '#666666';
    ctx.fillText(spectaclesTransformString('T H R O W', spectaclesOn), centerCol * GRID.CELL_SIZE + half, shiftY + GRID.CELL_SIZE * 1.3);

    ctx.restore();
  }
}
