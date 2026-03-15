/**
 * GameOverRenderer - Renders the game over screen
 *
 * Responsibilities:
 * - Display the room where player died
 * - Show debris and particle effects
 * - Display "GAME OVER" text
 * - Show "Press SPACE to continue" after delay
 */

import { GRID, COLORS } from '../../game/GameConfig.js';

export class GameOverRenderer {
  constructor(renderer) {
    this.renderer = renderer;
  }

  render(game) {
    if (!game.currentRoom) return;

    // Render background (keep the room visible)
    if (this.renderer.backgroundDirty) {
      this.renderer.clearBackground();

      // Only create holes in border when exits are unlocked
      // Exception: south exit opens if player has no items (escape route)
      const borderExits = game.currentRoom.exitsLocked ?
        { north: false, south: game.currentRoom.exits.south && game.playerHasNoItems(), east: false, west: false } :
        game.currentRoom.exits;
      this.renderer.drawBorder(borderExits, game.currentRoom.borderColor);

      // Draw collision map
      for (let y = 0; y < GRID.ROWS; y++) {
        for (let x = 0; x < GRID.COLS; x++) {
          if (game.currentRoom.collisionMap[y][x]) {
            this.renderer.drawCell(x, y, '█', '#444444');
          }
        }
      }

      // Draw static background objects (water and grass render on foreground)
      for (const obj of game.backgroundObjects) {
        const isGrass = obj.char === '|' || obj.char === '\\' || obj.char === '/' || obj.char === ',';
        if (!obj.currentAnimation && obj.char !== '~' && !isGrass) {
          const x = obj.position.x + GRID.CELL_SIZE / 2;
          const y = obj.position.y + GRID.CELL_SIZE / 2;
          this.renderer.bgCtx.fillStyle = obj.color;
          this.renderer.bgCtx.fillText(obj.char, x, y);
        }
      }

      this.renderer.backgroundDirty = false;
    }

    // Render foreground
    this.renderer.clearForeground();

    // Draw water tiles (dynamic state changes each frame)
    for (const obj of game.backgroundObjects) {
      if (obj.char === '~' && !obj.currentAnimation) {
        const renderData = obj.getRenderPosition();
        this.renderer.drawEntity(
          renderData.x + GRID.CELL_SIZE / 2,
          renderData.y + GRID.CELL_SIZE / 2,
          renderData.char,
          renderData.color
        );
      }
    }

    // Draw grass on foreground (renders over debris)
    for (const obj of game.backgroundObjects) {
      const isGrass = obj.char === '|' || obj.char === '\\' || obj.char === '/' || obj.char === ',';
      if (isGrass && !obj.currentAnimation && !obj.destroyed) {
        const offsetX = obj.grassRenderOffset ? obj.grassRenderOffset.x : 0;
        this.renderer.drawEntity(
          obj.position.x + GRID.CELL_SIZE / 2 + offsetX,
          obj.position.y + GRID.CELL_SIZE / 2,
          obj.char,
          obj.color
        );
      }
    }

    // Draw debris (remains on ground)
    for (const piece of game.debris) {
      this.renderer.drawEntity(
        piece.position.x + GRID.CELL_SIZE / 2,
        piece.position.y + GRID.CELL_SIZE / 2,
        piece.char,
        piece.color
      );
    }

    // Draw particles (explosion and embers)
    for (const particle of game.particles) {
      if (particle.getAlpha) {
        const alpha = particle.getAlpha();
        this.renderer.drawTextWithAlpha(
          particle.position.x + GRID.CELL_SIZE / 2,
          particle.position.y + GRID.CELL_SIZE / 2,
          particle.char,
          particle.color,
          alpha
        );
      } else {
        const alpha = Math.max(0, particle.life / particle.maxLife);
        this.renderer.drawTextWithAlpha(
          particle.x,
          particle.y,
          particle.char,
          particle.color,
          alpha
        );
      }
    }

    // Draw main death text
    const isCharacterDeath = game.characterDeathPending;
    const deathText = isCharacterDeath ? `${game.characterDeathName} lost` : 'GAME OVER';
    const deathColor = isCharacterDeath ? '#ffaa00' : '#ff0000';
    const timerExpired = isCharacterDeath ? game.characterDeathTimer <= 0 : game.gameOverDeathTimer <= 0;

    this.renderer.fgCtx.save();
    this.renderer.fgCtx.font = `${GRID.CELL_SIZE * 2}px 'VentureArcade', monospace`;
    this.renderer.fgCtx.textAlign = 'center';
    this.renderer.fgCtx.textBaseline = 'middle';
    this.renderer.fgCtx.fillStyle = deathColor;
    this.renderer.fgCtx.fillText(deathText, GRID.WIDTH / 2, GRID.HEIGHT / 2);
    this.renderer.fgCtx.restore();

    // Draw "Press SPACE to continue" text (only after 2-second delay)
    if (timerExpired) {
      const continueText = 'Press SPACE to continue';
      this.renderer.fgCtx.save();
      this.renderer.fgCtx.font = `${GRID.CELL_SIZE}px 'VentureArcade', monospace`;
      this.renderer.fgCtx.textAlign = 'center';
      this.renderer.fgCtx.textBaseline = 'middle';
      this.renderer.fgCtx.fillStyle = COLORS.TEXT;
      this.renderer.fgCtx.fillText(continueText, GRID.WIDTH / 2, GRID.HEIGHT / 2 + GRID.CELL_SIZE * 3);
      this.renderer.fgCtx.restore();
    }
  }
}
