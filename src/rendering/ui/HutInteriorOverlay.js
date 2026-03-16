import { GRID } from '../../game/GameConfig.js';

/**
 * HutInteriorOverlay — picture-in-picture rendering for both Hut and Dungeon interiors.
 *
 * Canvas: 480×480 (30×30 cells × 16px)
 * Panel size and offset are computed dynamically from game.hutInterior.gridCols/gridRows:
 *   Hut (10×10)    → 160×160 panel, centered at offset (160, 160)
 *   Dungeon (24×24) → 384×384 panel, centered at offset (48, 48)
 *
 * Coordinate contract:
 *   ctx.translate(offsetX, offsetY) is applied before entity rendering so that
 *   interior pixel (x, y) maps to canvas (offsetX+x, offsetY+y).
 */

const BORDER_COLOR = '#c8a96e';
const DIM_ALPHA = 0.55;

export class HutInteriorOverlay {
  constructor(renderer, renderController) {
    this.renderer = renderer;
    this.renderController = renderController;
  }

  render(game) {
    if (!game.player?.inHut || !game.hutInterior) return;

    // Compute panel dimensions from interior grid size (auto-sizes for hut vs dungeon)
    const interiorPxW = game.hutInterior.gridCols * GRID.CELL_SIZE;
    const interiorPxH = game.hutInterior.gridRows * GRID.CELL_SIZE;
    const offsetX = Math.floor((GRID.WIDTH  - interiorPxW) / 2);
    const offsetY = Math.floor((GRID.HEIGHT - interiorPxH) / 2);

    const ctx = this.renderer.fgCtx;
    ctx.save(); // outer save — protects all global canvas state

    // ── 1. Dim exterior (absolute coords) ─────────────────────────────────────
    ctx.fillStyle = `rgba(0,0,0,${DIM_ALPHA})`;
    ctx.fillRect(0, 0, GRID.WIDTH, GRID.HEIGHT);

    // ── 2. Interior background panel ──────────────────────────────────────────
    ctx.fillStyle = '#111108';
    ctx.fillRect(offsetX, offsetY, interiorPxW, interiorPxH);

    // ── 3. Decorative border ──────────────────────────────────────────────────
    ctx.strokeStyle = BORDER_COLOR;
    ctx.lineWidth = 2;
    ctx.strokeRect(offsetX - 1, offsetY - 1, interiorPxW + 2, interiorPxH + 2);

    // ── Apply interior-coordinate offset for all entity rendering ─────────────
    // After this point, drawing at (x, y) appears at canvas (offsetX+x, offsetY+y).
    ctx.translate(offsetX, offsetY);

    ctx.font = `${GRID.CELL_SIZE}px 'Unifont', monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // ── 4. Interior background objects ─────────────────────────────────────────
    for (const obj of game.hutInterior.backgroundObjects) {
      if (obj.destroyed) continue;
      const renderData = obj.getRenderPosition();
      ctx.fillStyle = renderData.color;
      ctx.fillText(
        renderData.char,
        renderData.x + GRID.CELL_SIZE / 2,
        renderData.y + GRID.CELL_SIZE / 2
      );
    }

    // ── 5. Hutplane debris ────────────────────────────────────────────────────
    for (const piece of game.debris) {
      if (!piece.hutPlane) continue;
      this.renderer.drawEntity(
        piece.position.x + GRID.CELL_SIZE / 2,
        piece.position.y + GRID.CELL_SIZE / 2,
        piece.char,
        piece.color
      );
    }

    // ── 6. Hutplane ingredients ───────────────────────────────────────────────
    for (const ingredient of game.ingredients) {
      if (!ingredient.hutPlane) continue;
      const bobY = ingredient.inWater ? Math.sin(ingredient.bobTimer * 4) * 2 : 0;
      this.renderer.drawEntity(
        ingredient.position.x + GRID.CELL_SIZE / 2,
        ingredient.position.y + GRID.CELL_SIZE / 2 + bobY,
        ingredient.char,
        ingredient.color
      );
    }

    // ── 7. Hutplane items ─────────────────────────────────────────────────────
    for (const item of game.items) {
      if (!item.hutPlane) continue;
      this.renderer.drawEntity(
        item.position.x + GRID.CELL_SIZE / 2,
        item.position.y + GRID.CELL_SIZE / 2,
        item.char,
        item.color
      );
    }

    // ── 8. Interior enemies (full indicator rendering) ─────────────────────────
    for (const enemy of game.hutInterior.enemies) {
      this.renderController.exploreRenderer.renderEnemy(game, enemy);
    }

    // ── 9. Player projectiles (interior coords) ────────────────────────────────
    for (const proj of game.combatSystem.getProjectiles()) {
      this.renderer.drawEntity(
        proj.position.x + GRID.CELL_SIZE / 2,
        proj.position.y + GRID.CELL_SIZE / 2,
        proj.char,
        proj.color
      );
    }

    // ── 10. Enemy projectiles (interior coords) ────────────────────────────────
    for (const proj of game.combatSystem.getEnemyProjectiles()) {
      this.renderer.drawEntity(
        proj.position.x + GRID.CELL_SIZE / 2,
        proj.position.y + GRID.CELL_SIZE / 2,
        proj.char,
        proj.color
      );
    }

    // ── 11. Player melee attacks ───────────────────────────────────────────────
    for (const attack of game.combatSystem.getMeleeAttacks()) {
      const cx = attack.position.x + GRID.CELL_SIZE / 2;
      const cy = attack.position.y + GRID.CELL_SIZE / 2;
      if (attack.drawAngle != null) {
        this.renderer.drawEntityRotated(cx, cy, attack.char, attack.color, attack.drawAngle);
      } else {
        this.renderer.drawEntity(cx, cy, attack.char, attack.color);
      }
    }

    // ── 12. Enemy melee attacks ────────────────────────────────────────────────
    for (const attack of game.combatSystem.getEnemyMeleeAttacks()) {
      const displayColor = attack.flashWhite ? '#ffffff' : attack.color;
      const alpha = attack.alpha !== undefined ? attack.alpha : 1.0;
      this.renderer.drawTextWithAlpha(
        attack.position.x + GRID.CELL_SIZE / 2,
        attack.position.y + GRID.CELL_SIZE / 2,
        attack.char,
        displayColor,
        alpha
      );
    }

    // ── 13. Stuck arrows ───────────────────────────────────────────────────────
    for (const arrow of game.combatSystem.getStuckArrows()) {
      this.renderer.drawEntity(
        arrow.position.x + GRID.CELL_SIZE / 2,
        arrow.position.y + GRID.CELL_SIZE / 2,
        arrow.char,
        arrow.color
      );
    }

    // ── 14. Damage numbers ─────────────────────────────────────────────────────
    for (const dmgNum of game.combatSystem.getDamageNumbers()) {
      const scale = dmgNum.scale || 1;
      if (scale !== 1) {
        ctx.save();
        ctx.globalAlpha = dmgNum.alpha;
        ctx.fillStyle = dmgNum.color;
        ctx.font = `${GRID.CELL_SIZE * scale}px 'Unifont', monospace`;
        ctx.fillText(dmgNum.value.toString(), dmgNum.x, dmgNum.y);
        ctx.restore();
      } else {
        this.renderer.drawTextWithAlpha(dmgNum.x, dmgNum.y, dmgNum.value.toString(), dmgNum.color, dmgNum.alpha);
      }
    }

    // ── 15. Particles ─────────────────────────────────────────────────────────
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
        this.renderer.drawTextWithAlpha(particle.x, particle.y, particle.char, particle.color, alpha);
      }
    }

    // ── 16. Player ────────────────────────────────────────────────────────────
    const playerAlpha = game.player.getVisibilityAlpha?.() ?? 1.0;
    const playerColor = game.player.getDisplayColor?.() ?? game.player.color;
    this.renderer.drawTextWithAlpha(
      game.player.position.x + GRID.CELL_SIZE / 2,
      game.player.position.y + GRID.CELL_SIZE / 2,
      game.player.char,
      playerColor,
      playerAlpha
    );

    // ── 17. Bow charge indicator (reads game.player.position — offset applies) ─
    this.renderController.bowChargeIndicator.render(game);

    // ── 18. Green ranger indicator ─────────────────────────────────────────────
    this.renderController.greenRangerIndicator.render(game);

    // ── Restore interior offset ────────────────────────────────────────────────
    ctx.restore(); // removes translate + restores outer state

    // ── 19. Label (absolute coords — drawn after restore) ─────────────────────
    ctx.save();
    ctx.font = `${GRID.CELL_SIZE}px 'Unifont', monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#887755';
    let label;
    if (game.hutInterior.gridCols <= 12) {
      label = '[ HUT ]';
    } else {
      const floorNum = (game.dungeonCurrentFloor ?? 0) + 1;
      label = `[ DUNGEON  FLOOR ${floorNum} ]`;
    }
    ctx.fillText(label, GRID.WIDTH / 2, offsetY + 2);
    ctx.restore();
  }
}
