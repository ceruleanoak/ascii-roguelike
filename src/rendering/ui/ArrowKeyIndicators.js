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
    this.renderer.drawCell(
      Math.floor(arrowCenterX / GRID.CELL_SIZE) - 1,
      Math.floor(arrowY / GRID.CELL_SIZE),
      '[',
      COLORS.BORDER
    );
    this.renderer.drawCell(
      Math.floor(arrowCenterX / GRID.CELL_SIZE),
      Math.floor(arrowY / GRID.CELL_SIZE),
      '↑',
      upColor
    );
    this.renderer.drawCell(
      Math.floor(arrowCenterX / GRID.CELL_SIZE) + 1,
      Math.floor(arrowY / GRID.CELL_SIZE),
      ']',
      COLORS.BORDER
    );

    // Arrow LEFT, DOWN, RIGHT (bottom row)
    const arrowBottomRowY = Math.floor(arrowY / GRID.CELL_SIZE) + 1;

    // LEFT
    this.renderer.drawCell(
      Math.floor(arrowCenterX / GRID.CELL_SIZE) - 5,
      arrowBottomRowY,
      '[',
      COLORS.BORDER
    );
    this.renderer.drawCell(
      Math.floor(arrowCenterX / GRID.CELL_SIZE) - 4,
      arrowBottomRowY,
      '←',
      leftColor
    );
    this.renderer.drawCell(
      Math.floor(arrowCenterX / GRID.CELL_SIZE) - 3,
      arrowBottomRowY,
      ']',
      COLORS.BORDER
    );

    // DOWN
    this.renderer.drawCell(
      Math.floor(arrowCenterX / GRID.CELL_SIZE) - 1,
      arrowBottomRowY,
      '[',
      COLORS.BORDER
    );
    this.renderer.drawCell(
      Math.floor(arrowCenterX / GRID.CELL_SIZE),
      arrowBottomRowY,
      '↓',
      downColor
    );
    this.renderer.drawCell(
      Math.floor(arrowCenterX / GRID.CELL_SIZE) + 1,
      arrowBottomRowY,
      ']',
      COLORS.BORDER
    );

    // RIGHT
    this.renderer.drawCell(
      Math.floor(arrowCenterX / GRID.CELL_SIZE) + 3,
      arrowBottomRowY,
      '[',
      COLORS.BORDER
    );
    this.renderer.drawCell(
      Math.floor(arrowCenterX / GRID.CELL_SIZE) + 4,
      arrowBottomRowY,
      '→',
      rightColor
    );
    this.renderer.drawCell(
      Math.floor(arrowCenterX / GRID.CELL_SIZE) + 5,
      arrowBottomRowY,
      ']',
      COLORS.BORDER
    );

    // Draw "D O D G E" label below arrow keys
    this.renderer.fgCtx.save();
    this.renderer.fgCtx.font = `${GRID.CELL_SIZE * 0.7}px 'VentureArcade', 'Unifont', monospace`;
    this.renderer.fgCtx.textBaseline = 'middle';
    this.renderer.fgCtx.textAlign = 'center';
    const labelY = GRID.HEIGHT - GRID.CELL_SIZE * 2;
    this.renderer.fgCtx.fillStyle = COLORS.TEXT;
    this.renderer.fgCtx.fillText('D O D G E', arrowCenterX, labelY);
    this.renderer.fgCtx.restore();
  }
}
