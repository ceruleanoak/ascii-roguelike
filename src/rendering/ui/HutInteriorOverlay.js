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
    if ((!game.player?.inHut && !game.player?.inDungeon) || !game.hutInterior) return;

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

    // ── 3b. Dungeon wall tiles ─────────────────────────────────────────────────
    // Render solid collision-map cells as visible stone walls.
    // Hut interiors are open floor only (10 cols); dungeon interiors are 24 cols.
    if (game.hutInterior.collisionMap && game.hutInterior.gridCols > 12) {
      const CS = GRID.CELL_SIZE;
      const cm = game.hutInterior.collisionMap;
      for (let r = 0; r < cm.length; r++) {
        for (let c = 0; c < (cm[r]?.length ?? 0); c++) {
          if (!cm[r][c]) continue;
          ctx.fillStyle = '#1a1512';
          ctx.fillRect(c * CS, r * CS, CS, CS);
          ctx.fillStyle = '#2e2218';
          ctx.fillText('≡', c * CS + CS / 2, r * CS + CS / 2);
        }
      }
    }

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
      // Key indicator one full cell above hasKey enemies (vault key char '߃')
      if (enemy.hasKey) {
        ctx.fillStyle = '#ffcc00';
        ctx.fillText(
          '߃',
          enemy.position.x + GRID.CELL_SIZE / 2,
          enemy.position.y - GRID.CELL_SIZE
        );
      }
    }

    // ── 8b. Interior NPCs (WiseFellow, Witch) ─────────────────────────────────
    for (const npc of game.hutInterior.npcs) {
      const npcAlpha = npc.getPulseAlpha ? npc.getPulseAlpha() : 1.0;
      this.renderer.drawTextWithAlpha(
        npc.position.x + GRID.CELL_SIZE / 2,
        npc.position.y + GRID.CELL_SIZE / 2,
        npc.char,
        npc.color,
        npcAlpha
      );

      // WiseFellow hint text — fades in on proximity (word per line above NPC)
      if (npc.hintText && npc.hintAlpha > 0.02) {
        const words = npc.hintText.split(' ');
        const lineH = 9;
        ctx.save();
        ctx.globalAlpha = npc.hintAlpha;
        ctx.fillStyle = '#e8c060';
        ctx.font = `8px 'VentureArcade', monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const baseY = npc.position.y - GRID.CELL_SIZE * 1.2 - (words.length - 1) * lineH * 0.5;
        for (let wi = 0; wi < words.length; wi++) {
          ctx.fillText(words[wi], npc.position.x + GRID.CELL_SIZE / 2, baseY + wi * lineH);
        }
        ctx.restore();
        ctx.font = `${GRID.CELL_SIZE}px 'Unifont', monospace`; // restore main font
      }
    }

    // ── 9. Player projectiles (interior coords) ────────────────────────────────
    for (const proj of game.combatSystem.getProjectiles()) {
      const cx = proj.position.x + GRID.CELL_SIZE / 2;
      const cy = proj.position.y + GRID.CELL_SIZE / 2;
      if (proj.drawAngle != null) {
        this.renderer.drawEntityRotated(cx, cy, proj.char, proj.color, proj.drawAngle);
      } else {
        this.renderer.drawEntity(cx, cy, proj.char, proj.color);
      }
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

    // ── 10b. Player tongue attacks (frog form) ─────────────────────────────────
    if (game.playerTongueAttacks?.length) {
      const pctx = ctx;
      for (const tongue of game.playerTongueAttacks) {
        if (tongue.currentLength <= 0) continue;
        const sx = game.player.position.x + GRID.CELL_SIZE / 2;
        const sy = game.player.position.y + GRID.CELL_SIZE / 2;
        const ex = sx + tongue.direction.x * tongue.currentLength;
        const ey = sy + tongue.direction.y * tongue.currentLength;
        pctx.save();
        pctx.strokeStyle = tongue.color;
        pctx.lineWidth = 2.5;
        pctx.lineCap = 'round';
        pctx.beginPath();
        pctx.moveTo(sx, sy);
        pctx.lineTo(ex, ey);
        pctx.stroke();
        pctx.fillStyle = tongue.color;
        pctx.beginPath();
        pctx.arc(ex, ey, 3, 0, Math.PI * 2);
        pctx.fill();
        pctx.restore();
      }
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

    // ── 13b. Chain lightning arcs ─────────────────────────────────────────────
    if (game.combatSystem.getChainArcs) {
      for (const arc of game.combatSystem.getChainArcs()) {
        const alpha = Math.max(0, arc.timer / arc.duration);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = arc.color;
        ctx.lineWidth = 2;
        const dx = arc.x2 - arc.x1;
        const dy = arc.y2 - arc.y1;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const px = -dy / len;
        const py = dx / len;
        const segs = 4;
        ctx.beginPath();
        ctx.moveTo(arc.x1, arc.y1);
        for (let s = 1; s < segs; s++) {
          const t = s / segs;
          const jitter = (Math.random() - 0.5) * 8;
          ctx.lineTo(arc.x1 + dx * t + px * jitter, arc.y1 + dy * t + py * jitter);
        }
        ctx.lineTo(arc.x2, arc.y2);
        ctx.stroke();
        ctx.restore();
      }
    }

    // ── 14. Damage numbers ─────────────────────────────────────────────────────
    for (const dmgNum of game.combatSystem.getDamageNumbers()) {
      const scale = dmgNum.scale || 1;
      ctx.save();
      ctx.globalAlpha = dmgNum.alpha;
      ctx.fillStyle = dmgNum.color;
      ctx.font = `${GRID.CELL_SIZE * scale}px 'Unifont', monospace`;
      ctx.fillText(dmgNum.value.toString(), dmgNum.x, dmgNum.y);
      ctx.restore();
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

    // ── 16b. Camp companion (uses interior coords because it tracks player) ──
    if (game.companion) {
      game.companion.render(ctx, (gx, gy) => ({
        x: gx * GRID.CELL_SIZE,
        y: gy * GRID.CELL_SIZE
      }));
    }

    // ── 17. Bow charge indicator (reads game.player.position — offset applies) ─
    this.renderController.bowChargeIndicator.render(game);

    // ── 18. Green ranger indicator ─────────────────────────────────────────────
    this.renderController.greenRangerIndicator.render(game);

    // ── 19. Item sacrifice slot (dungeon lock condition) ────────────────────────
    const uc = game.hutInterior.unlockCondition;
    if (uc?.type === 'item_slot') {
      const CS = GRID.CELL_SIZE;
      const slotCx = uc.col * CS + CS / 2;
      const slotCy = uc.row * CS + CS / 2;
      const pdx = game.player.position.x + CS / 2 - slotCx;
      const pdy = game.player.position.y + CS / 2 - slotCy;
      const nearSlot = Math.sqrt(pdx * pdx + pdy * pdy) < CS * 2;
      ctx.fillStyle = nearSlot ? '#ffffff' : '#888888';
      ctx.fillText('[', slotCx - CS, slotCy);
      ctx.fillText(']', slotCx, slotCy);
      if (uc.slotItem) {
        ctx.fillStyle = uc.slotItem.color || '#ffcc00';
        ctx.fillText(uc.slotItem.char, slotCx - CS / 2, slotCy);
      } else {
        ctx.fillStyle = '#444444';
        ctx.fillText('?', slotCx - CS / 2, slotCy);
      }
    }

    // ── 20. Staircase prompt ───────────────────────────────────────────────────
    if (game.dungeonSystem) {
      const stairsType = game.dungeonSystem.nearStairsType();
      if (stairsType) {
        const label = stairsType === 'down' ? 'SPACE  DESCEND' : 'SPACE  ASCEND';
        const floor = game.hutInterior;
        const col = stairsType === 'down' ? floor.stairsDownCol : floor.stairsUpCol;
        const row = stairsType === 'down' ? floor.stairsDownRow : floor.stairsUpRow;
        ctx.save();
        ctx.font = `10px 'Unifont', monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ccccaa';
        ctx.fillText(label, col * GRID.CELL_SIZE + GRID.CELL_SIZE / 2, row * GRID.CELL_SIZE - GRID.CELL_SIZE);
        ctx.restore();
        ctx.font = `${GRID.CELL_SIZE}px 'Unifont', monospace`; // restore font
      }
    }

    // ── 21. Interior exit door prompt (hut/dungeon) ───────────────────────────
    {
      const isHut = game.hutInterior.gridCols <= 12;
      const nearExit = isHut
        ? game.hutSystem?.nearInteriorExit?.()
        : game.dungeonSystem?.nearInteriorExit?.();

      if (nearExit) {
        const exitCol = game.hutInterior.exitCol;
        const exitRow = game.hutInterior.exitRow;
        if (exitCol != null && exitRow != null) {
          ctx.save();
          ctx.font = `10px 'Unifont', monospace`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = '#ccccaa';
          ctx.fillText(
            'SPACE  EXIT',
            exitCol * GRID.CELL_SIZE + GRID.CELL_SIZE / 2,
            exitRow * GRID.CELL_SIZE - GRID.CELL_SIZE * 0.75
          );
          ctx.restore();
          ctx.font = `${GRID.CELL_SIZE}px 'Unifont', monospace`;
        }
      }
    }

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
