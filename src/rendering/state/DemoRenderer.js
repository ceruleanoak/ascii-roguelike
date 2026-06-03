/**
 * DemoRenderer — renders the arcade attract-mode demo.
 *
 * Draws the EXPLORE scene (via the shared ExploreRenderer), then overlays
 * the title's "CLICK TO PLAY GAME" button (blinking) and a solid "DEMO"
 * label directly below it. The launch button remains clickable through the
 * demo so the player can start the real game at any time.
 */

import { GRID, COLORS } from '../../game/GameConfig.js';

export class DemoRenderer {
  constructor(renderer, renderController) {
    this.renderer = renderer;
    this.renderController = renderController;
  }

  render(game) {
    // Demo scene
    this.renderController.exploreRenderer.render(game);

    const ctx = this.renderer.fgCtx;
    ctx.save();
    ctx.font = `${GRID.CELL_SIZE}px 'VentureArcade', 'Unifont', monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const centerX = GRID.WIDTH / 2;
    const centerY = GRID.HEIGHT / 2;

    // Keep launch button bounds in sync so clicks register during the demo too.
    const buttonText = 'CLICK TO PLAY GAME';
    if (!game.launchButtonBounds) {
      const textWidth = ctx.measureText(buttonText).width;
      game.launchButtonBounds = {
        x: centerX - textWidth / 2,
        y: centerY - GRID.CELL_SIZE / 2,
        width: textWidth,
        height: GRID.CELL_SIZE,
      };
    }

    // CLICK TO PLAY GAME — blink, same cadence as pre-intro title.
    const blinkOn = Math.floor(Date.now() / 1000) % 2 === 0;
    if (blinkOn) {
      ctx.fillStyle = COLORS.ITEM;
      ctx.fillText(buttonText, centerX, centerY);
    }

    // DEMO — solid (does not blink), directly below the launch button.
    ctx.fillStyle = COLORS.ITEM;
    ctx.fillText('DEMO', centerX, centerY + GRID.CELL_SIZE * 1.5);

    ctx.restore();
  }
}
