import { GRID } from '../../game/GameConfig.js';
import { isSpectaclesActive, spectaclesTransformString } from '../../data/cipher.js';

/**
 * MazeInteriorOverlay — picture-in-picture renderer for the Maze maze.
 *
 * The maze is 19×19 cells (304×304 px) centered on the 480×480 canvas (88 px offset).
 * Same PiP approach as HutInteriorOverlay; no scrolling required.
 *
 * Rendering layers (all in interior-translated coordinates):
 *   1. Dim exterior + floor panel
 *   2. Wall cells
 *   3. Exit indicator
 *   4. Maze objects (3-hit breakables, hit flash, adjacent reveal)
 *   5. Dropped ingredients / items (mazePlane)
 *   6. Ghosts
 *   7. Player attacks (projectiles, melee, arrows, damage numbers)
 *   8. Particles
 *   9. Player
 *  10. HUD: timer, ghost count, label  (absolute canvas coords)
 */

const CS          = GRID.CELL_SIZE; // 16
const DIM_ALPHA   = 0.55;
const FLOOR_COLOR = '#100d18';
const WALL_COLOR  = '#2a2233';
const WALL_GLYPH  = '#';
const WALL_GLYPH_COLOR = '#3a3040';

export class MazeInteriorOverlay {
  constructor(renderer, renderController) {
    this.renderer         = renderer;
    this.renderController = renderController;
  }

  render(game) {
    if (!game.player?.inMaze || !game.mazeInterior) return;

    const mi  = game.mazeInterior;
    const ctx = this.renderer.fgCtx;

    // Panel size / offset (auto-sized from grid dimensions, same as HutInteriorOverlay)
    const panelW  = mi.gridCols * CS; // 304
    const panelH  = mi.gridRows * CS; // 304
    const offsetX = Math.floor((GRID.WIDTH  - panelW) / 2); // 88
    const offsetY = Math.floor((GRID.HEIGHT - panelH) / 2); // 88

    ctx.save();

    // ── 1. Dim exterior ────────────────────────────────────────────────────
    ctx.fillStyle = `rgba(0,0,0,${DIM_ALPHA})`;
    ctx.fillRect(0, 0, GRID.WIDTH, GRID.HEIGHT);

    // Interior background
    ctx.fillStyle = FLOOR_COLOR;
    ctx.fillRect(offsetX, offsetY, panelW, panelH);

    // Border
    ctx.strokeStyle = '#7755aa';
    ctx.lineWidth   = 2;
    ctx.strokeRect(offsetX - 1, offsetY - 1, panelW + 2, panelH + 2);

    // Translate so interior pixel (x, y) → canvas (offsetX+x, offsetY+y)
    ctx.translate(offsetX, offsetY);
    ctx.font        = `${CS}px 'Unifont', monospace`;
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'middle';

    // ── 2. Wall cells ──────────────────────────────────────────────────────
    for (let r = 0; r < mi.gridRows; r++) {
      for (let c = 0; c < mi.gridCols; c++) {
        if (!mi.collisionMap[r][c]) continue;
        // Skip exit cell — rendered separately
        if (r === mi.exitRow && c === mi.exitCol) continue;
        ctx.fillStyle = WALL_COLOR;
        ctx.fillRect(c * CS, r * CS, CS, CS);
        ctx.fillStyle = WALL_GLYPH_COLOR;
        ctx.fillText(WALL_GLYPH, c * CS + CS / 2, r * CS + CS / 2);
      }
    }

    // ── 3. Exit indicator ──────────────────────────────────────────────────
    {
      const ex = mi.exitCol * CS + CS / 2;
      const ey = mi.exitRow * CS + CS / 2;
      ctx.fillStyle = '#446644';
      ctx.fillText('∩', ex, ey);
    }

    // ── 4. Maze objects ─────────────────────────────────────────────────
    const spectaclesOn = isSpectaclesActive(game);
    for (const obj of mi.mazeObjects) {
      if (obj.destroyed) continue;

      const cx = obj.col * CS + CS / 2;
      const cy = obj.row * CS + CS / 2;

      // Color: white flash on hit, shade by remaining HP otherwise
      if (obj.hitFlash > 0) {
        ctx.fillStyle = '#ffffff';
      } else {
        const t = (obj.hp - 1) / (obj.maxHp - 1); // 1.0=full, 0.0=last hp
        ctx.fillStyle = obj.hp < obj.maxHp
          ? `hsl(290,40%,${35 + t * 25}%)`
          : obj.color;
      }
      // Spectacles decode the cover to its hidden ingredient char.
      ctx.fillText(spectaclesOn && obj.hiddenChar ? obj.hiddenChar : obj.char, cx, cy);

      // HP pip dots above object
      for (let i = 0; i < obj.maxHp; i++) {
        ctx.fillStyle = i < obj.hp ? '#cc88ff' : '#333333';
        ctx.fillRect(cx - 4 + i * 4, cy - CS - 2, 3, 3);
      }

      // Adjacent reveal: ghost-like preview of the hidden ingredient
      if (obj.revealed && obj.hiddenChar) {
        ctx.save();
        ctx.globalAlpha = 0.75;
        ctx.fillStyle   = '#ffee88';
        ctx.font        = `${CS * 0.75}px 'Unifont', monospace`;
        ctx.fillText(obj.hiddenChar, cx + CS * 0.85, cy - CS * 0.7);
        ctx.restore();
        ctx.font = `${CS}px 'Unifont', monospace`;
      }
    }

    // ── 5. Maze-plane loot ──────────────────────────────────────────────
    for (const ing of game.ingredients) {
      if (!ing.mazePlane) continue;
      const bobY = ing.inWater ? Math.sin(ing.bobTimer * 4) * 2 : 0;
      this.renderer.drawEntity(ing.position.x + CS / 2, ing.position.y + CS / 2 + bobY, ing.char, ing.color);
    }
    for (const item of game.items) {
      if (!item.mazePlane) continue;
      this.renderer.drawEntity(item.position.x + CS / 2, item.position.y + CS / 2, item.char, item.color);
    }

    // ── 6. Ghosts ──────────────────────────────────────────────────────────
    for (const ghost of mi.ghosts) {
      if (ghost.phasesWalls) {
        ctx.save();
        ctx.globalAlpha = 0.7;
        ctx.fillStyle   = ghost.color;
        ctx.fillText(ghost.char, ghost.position.x + CS / 2, ghost.position.y + CS / 2);
        ctx.restore();
        ctx.font = `${CS}px 'Unifont', monospace`;
      } else {
        ctx.fillStyle = ghost.color;
        ctx.fillText(ghost.char, ghost.position.x + CS / 2, ghost.position.y + CS / 2);
      }
    }

    // ── 7. Player attacks ──────────────────────────────────────────────────
    for (const proj of game.combatSystem.getProjectiles()) {
      const cx = proj.position.x + CS / 2;
      const cy = proj.position.y + CS / 2;
      if (proj.drawAngle != null) {
        this.renderer.drawEntityRotated(cx, cy, proj.char, proj.color, proj.drawAngle);
      } else {
        this.renderer.drawEntity(cx, cy, proj.char, proj.color);
      }
    }
    for (const atk of game.combatSystem.getMeleeAttacks()) {
      const cx2 = atk.position.x + CS / 2, cy2 = atk.position.y + CS / 2;
      atk.drawAngle != null
        ? this.renderer.drawEntityRotated(cx2, cy2, atk.char, atk.color, atk.drawAngle)
        : this.renderer.drawEntity(cx2, cy2, atk.char, atk.color);
    }
    for (const arrow of game.combatSystem.getStuckArrows()) {
      this.renderer.drawEntity(arrow.position.x + CS / 2, arrow.position.y + CS / 2, arrow.char, arrow.color);
    }
    for (const dmg of game.combatSystem.getDamageNumbers()) {
      this.renderer.drawTextWithAlpha(dmg.x, dmg.y, dmg.value.toString(), dmg.color, dmg.alpha);
    }

    // ── 8. Particles ───────────────────────────────────────────────────────
    for (const p of game.particles) {
      if (p.getAlpha) {
        this.renderer.drawTextWithAlpha(p.position.x + CS / 2, p.position.y + CS / 2, p.char, p.color, p.getAlpha());
      } else {
        this.renderer.drawTextWithAlpha(p.x, p.y, p.char, p.color, Math.max(0, p.life / p.maxLife));
      }
    }

    // ── 9. Player ──────────────────────────────────────────────────────────
    const playerAlpha = game.player.getVisibilityAlpha?.() ?? 1.0;
    const mossActive = game.player.mossCloakActive === true;
    const playerChar = mossActive ? '%' : game.player.char;
    const playerColor = mossActive
      ? '#228822'
      : (game.player.getDisplayColor?.() ?? game.player.color);
    this.renderer.drawTextWithAlpha(
      game.player.position.x + CS / 2,
      game.player.position.y + CS / 2,
      playerChar, playerColor, playerAlpha
    );

    this.renderController.bowChargeIndicator.render(game);
    this.renderController.greenRangerIndicator.render(game);

    // ── Restore interior translate ────────────────────────────────────────
    ctx.restore();

    // ── 10. HUD (absolute canvas coords) ──────────────────────────────────
    ctx.save();
    ctx.font        = `${CS}px 'Unifont', monospace`;
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'top';

    // Countdown timer — turns red as it depletes
    if (mi.timer.active) {
      const frac     = Math.max(0, mi.timer.time / 5.0);
      const timeLeft = Math.ceil(mi.timer.time);
      const g        = Math.round(frac * 200);
      ctx.fillStyle  = `rgb(255,${g},0)`;
      // U+FE0E forces text presentation so the hourglass renders as a
      // monochrome glyph instead of the system color-emoji fallback.
      ctx.fillText(`⌛︎ ${timeLeft}`, GRID.WIDTH / 2, offsetY + 4);
    }

    // Label
    ctx.textAlign  = 'center';
    ctx.fillStyle  = '#7755aa';
    ctx.fillText(spectaclesTransformString('[ MAZE ]', spectaclesOn), GRID.WIDTH / 2, offsetY + panelH - CS - 2);

    ctx.restore();
  }
}
