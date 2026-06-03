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
    const arrowY = GRID.HEIGHT - GRID.CELL_SIZE * 5;
    const arrowCenterX = (GRID.WIDTH / 4) * 3; // Right quarter of screen

    // Determine inactivity blinking state
    const isInactive = game.inactivityTimer >= game.INACTIVITY_THRESHOLD;
    const blinkWhite = isInactive && game.wasdBlinkState;
    const inactiveColor = blinkWhite ? '#FFFFFF' : COLORS.TEXT;

    // Check if on cooldown for color theming
    const onCooldown = game.player && game.player.dodgeRoll.cooldownTimer > 0;
    const cooldownColor = '#ff6666'; // Dim red when on cooldown
    const readyColor = COLORS.ITEM; // Bright yellow when ready

    const upColor = game.arrowKeys.ArrowUp ? readyColor : (onCooldown ? cooldownColor : (isInactive ? inactiveColor : COLORS.TEXT));
    const downColor = game.arrowKeys.ArrowDown ? readyColor : (onCooldown ? cooldownColor : (isInactive ? inactiveColor : COLORS.TEXT));
    const leftColor = game.arrowKeys.ArrowLeft ? readyColor : (onCooldown ? cooldownColor : (isInactive ? inactiveColor : COLORS.TEXT));
    const rightColor = game.arrowKeys.ArrowRight ? readyColor : (onCooldown ? cooldownColor : (isInactive ? inactiveColor : COLORS.TEXT));

    // Arrow UP (top)
    const topRow = Math.floor(arrowY / GRID.CELL_SIZE);
    const centerCol = Math.floor(arrowCenterX / GRID.CELL_SIZE);
    this.renderer.drawCell(centerCol - 1, topRow, '[', COLORS.BORDER);
    this.renderer.drawCell(centerCol,     topRow, '↑', upColor);
    this.renderer.drawCell(centerCol + 1, topRow, ']', COLORS.BORDER);

    // Arrow LEFT, DOWN, RIGHT (bottom row)
    const arrowBottomRowY = topRow + 1;

    // LEFT
    this.renderer.drawCell(centerCol - 5, arrowBottomRowY, '[', COLORS.BORDER);
    this.renderer.drawCell(centerCol - 4, arrowBottomRowY, '←', leftColor);
    this.renderer.drawCell(centerCol - 3, arrowBottomRowY, ']', COLORS.BORDER);

    // DOWN
    this.renderer.drawCell(centerCol - 1, arrowBottomRowY, '[', COLORS.BORDER);
    this.renderer.drawCell(centerCol,     arrowBottomRowY, '↓', downColor);
    this.renderer.drawCell(centerCol + 1, arrowBottomRowY, ']', COLORS.BORDER);

    // RIGHT
    this.renderer.drawCell(centerCol + 3, arrowBottomRowY, '[', COLORS.BORDER);
    this.renderer.drawCell(centerCol + 4, arrowBottomRowY, '→', rightColor);
    this.renderer.drawCell(centerCol + 5, arrowBottomRowY, ']', COLORS.BORDER);

    // When an arrow key is in the ready/pressed state (yellow), overlay the
    // glyph at 2× scale on the foreground so the active dodge direction pops.
    // Drawn after the bg pass so it sits cleanly on top of the 1× version.
    const fg = this.renderer.fgCtx;
    fg.save();
    fg.font = `${GRID.CELL_SIZE}px 'Unifont', monospace`;
    fg.textAlign = 'center';
    fg.textBaseline = 'middle';
    const half = GRID.CELL_SIZE / 2;
    if (game.arrowKeys.ArrowUp) {
      this.renderer.drawEntityScaled(centerCol * GRID.CELL_SIZE + half, topRow * GRID.CELL_SIZE + half, '↑', readyColor, 2.0);
    }
    if (game.arrowKeys.ArrowLeft) {
      this.renderer.drawEntityScaled((centerCol - 4) * GRID.CELL_SIZE + half, arrowBottomRowY * GRID.CELL_SIZE + half, '←', readyColor, 2.0);
    }
    if (game.arrowKeys.ArrowDown) {
      this.renderer.drawEntityScaled(centerCol * GRID.CELL_SIZE + half, arrowBottomRowY * GRID.CELL_SIZE + half, '↓', readyColor, 2.0);
    }
    if (game.arrowKeys.ArrowRight) {
      this.renderer.drawEntityScaled((centerCol + 4) * GRID.CELL_SIZE + half, arrowBottomRowY * GRID.CELL_SIZE + half, '→', readyColor, 2.0);
    }
    fg.restore();

    // Draw "D O D G E" label below arrow keys
    const spectaclesOn = isSpectaclesActive(game);
    this.renderer.fgCtx.save();
    this.renderer.fgCtx.font = spectaclesOn
      ? `${Math.round(GRID.CELL_SIZE * 0.7 * CIPHER_FONT_SCALE)}px 'Unifont', monospace`
      : `${GRID.CELL_SIZE * 0.7}px 'VentureArcade', 'Unifont', monospace`;
    this.renderer.fgCtx.textBaseline = 'middle';
    this.renderer.fgCtx.textAlign = 'center';
    const labelY = GRID.HEIGHT - GRID.CELL_SIZE * 2;
    this.renderer.fgCtx.fillStyle = COLORS.TEXT;
    this.renderer.fgCtx.fillText(spectaclesTransformString('D O D G E', spectaclesOn), arrowCenterX, labelY);
    this.renderer.fgCtx.restore();
  }
}
