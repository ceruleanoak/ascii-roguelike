import { GRID, COLORS } from '../../game/GameConfig.js';

/**
 * NeutralRenderer - Renders NEUTRAL state (Leshy Grove, future shops/puzzles)
 * Similar to ExploreRenderer but simplified (no enemies, combat, etc.)
 * Scripts can optionally provide onRender hook for custom overlays
 */
export class NeutralRenderer {
  constructor(renderer, renderController) {
    this.renderer = renderer;
    this.renderController = renderController;
  }

  render(game) {
    if (!game.currentRoom || !game.player) return;

    this.renderBackground(game);
    this.renderForeground(game);
  }

  renderBackground(game) {
    // Render background (only if dirty)
    if (!this.renderer.backgroundDirty) return;

    this.renderer.clearBackground('#000000');

    // Draw border with exits (neutral rooms always have exits unlocked)
    this.renderer.drawBorder(game.currentRoom.exits, '#00ff00');

    // Draw static background objects (grass on background layer)
    for (const obj of game.currentRoom.backgroundObjects) {
      if (!obj.destroyed && !obj.currentAnimation) {
        const x = obj.position.x + GRID.CELL_SIZE / 2;
        const y = obj.position.y + GRID.CELL_SIZE / 2;
        this.renderer.bgCtx.fillStyle = obj.color;
        this.renderer.bgCtx.fillText(obj.char, x, y);
      }
    }

    this.renderer.backgroundDirty = false;
  }

  renderForeground(game) {
    this.renderer.clearForeground();

    const centerX = Math.floor(GRID.COLS / 2);
    const centerY = Math.floor(GRID.ROWS / 2);

    // Draw south exit warp zone (always present in neutral rooms)
    if (game.currentRoom.exits.south) {
      const warpZoneColor = 'rgba(100, 150, 255, 0.15)';
      this.renderer.drawRect(
        (centerX - 1) * GRID.CELL_SIZE,
        (GRID.ROWS - 3) * GRID.CELL_SIZE,
        3 * GRID.CELL_SIZE,
        2 * GRID.CELL_SIZE,
        warpZoneColor,
        true
      );
    }

    // Draw animating background objects
    for (const obj of game.currentRoom.backgroundObjects) {
      if (obj.currentAnimation) {
        const renderData = obj.getRenderPosition();
        this.renderer.drawEntity(
          renderData.x + GRID.CELL_SIZE / 2 + obj.animationOffset.x,
          renderData.y + GRID.CELL_SIZE / 2 + obj.animationOffset.y,
          renderData.char,
          renderData.color
        );
      }
    }

    // Draw items (prizes)
    for (const item of game.items) {
      const x = item.position.x + GRID.CELL_SIZE / 2;
      const y = item.position.y + GRID.CELL_SIZE / 2;
      this.renderer.drawEntity(x, y, item.char, item.color);
    }

    // Draw player
    const pulseAlpha = game.player.getPulseAlpha ? game.player.getPulseAlpha() : 1.0;
    this.renderer.drawTextWithAlpha(
      game.player.position.x + GRID.CELL_SIZE / 2,
      game.player.position.y + GRID.CELL_SIZE / 2,
      '@',
      game.player.color,
      pulseAlpha
    );

    // Script-specific rendering (if script provides onRender hook)
    if (game.neutralRoomSystem.currentScript && game.neutralRoomSystem.currentScript.onRender) {
      game.neutralRoomSystem.currentScript.onRender(
        this.renderer,
        game.currentRoom,
        game.player,
        game.neutralRoomSystem.state
      );
    }

    // Draw cuts-remaining counter while minigame is active
    const nrState = game.neutralRoomSystem.state;
    if (nrState && nrState.cutsRemaining !== undefined && !nrState.celebrationActive) {
      const ctx = this.renderer.fgCtx;
      ctx.save();
      ctx.font = `${GRID.CELL_SIZE}px 'Unifont', monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = '#00cc44';
      ctx.globalAlpha = 0.85;
      const label = nrState.cutsRemaining > 0
        ? `[ choose ${nrState.cutsRemaining} ]`
        : `[ done ]`;
      ctx.fillText(label, GRID.WIDTH / 2, GRID.CELL_SIZE * 1.5);
      ctx.restore();
    }

    // Draw pickup message (identical to EXPLORE/REST states)
    if (game.pickupMessage && game.pickupMessageTimer > 0) {
      const ctx = this.renderer.fgCtx;
      ctx.save();
      ctx.font = `${GRID.CELL_SIZE * 2}px 'Unifont', monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = COLORS.ITEM;
      this.renderer.drawWrappedText(ctx, game.pickupMessage, GRID.WIDTH / 2, GRID.HEIGHT / 2, GRID.WIDTH * 0.8, GRID.CELL_SIZE * 2.5);
      ctx.restore();
    }

    // Draw inventory overlay (if player is holding 'i')
    if (game.showInventory) {
      this.renderController.inventoryOverlay.render(game);
    }
  }
}
