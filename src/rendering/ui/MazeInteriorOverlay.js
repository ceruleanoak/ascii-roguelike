import { GRID } from '../../game/GameConfig.js';
import { isSpectaclesActive, spectaclesTransformString } from '../../data/cipher.js';
import { drawInteriorFrame } from './interiorFrame.js';
import {
  TORCH_LIGHT_RADIUS, TORCH_ALPHA_HIGH, TORCH_ALPHA_LOW,
  TORCH_PULSE_SPEED, TORCH_LIT_COLOR, TORCH_UNLIT_COLOR,
} from '../../systems/MazeSystem.js';
import { hasTorchLight, drawPlayerTorchLight } from './torchLight.js';

/**
 * MazeInteriorOverlay — picture-in-picture renderer for the Maze maze.
 *
 * The maze is 19×19 cells (304×304 px) centered on the 480×480 canvas (88 px offset).
 * Same PiP approach as HutInteriorOverlay; no scrolling required.
 *
 * Rendering layers (all in interior-translated coordinates):
 *   1. Dim exterior + floor panel
 *   2. Wall cells
 *   2b. Maze torches (fixture glyph + pulsing light when lit)
 *   3. Exit indicator
 *   4. Maze objects (3-hit breakables, hit flash, blink warning)
 *   5. Dropped ingredients / items (mazePlane)
 *   6. Ghosts
 *   7. Player attacks (projectiles, melee, arrows, damage numbers)
 *   8. Particles
 *   9. Player
 *  10. HUD: label  (absolute canvas coords)
 */

const CS          = GRID.CELL_SIZE; // 16
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

    // Shared PiP frame (no clip — maze walls already bound the content).
    const { offsetY, panelH } = drawInteriorFrame(ctx, {
      gridCols: mi.gridCols,
      gridRows: mi.gridRows,
      panelColor: FLOOR_COLOR,
      borderColor: '#7755aa',
    });

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

    // ── 2b. Maze torches (fixture glyph + pulsing light) ───────────────────
    for (const torch of mi.torches) {
      if (torch.destroyed) continue;
      const cx = torch.col * CS + CS / 2;
      const cy = torch.row * CS + CS / 2;

      if (torch.lit) {
        const s = 0.5 + 0.5 * Math.sin(torch.pulseTimer * TORCH_PULSE_SPEED);
        const alpha = TORCH_ALPHA_LOW + (TORCH_ALPHA_HIGH - TORCH_ALPHA_LOW) * s;
        this.renderer.drawCircle(cx, cy, TORCH_LIGHT_RADIUS, TORCH_LIT_COLOR, true, alpha);
      }

      ctx.fillStyle = torch.lit ? TORCH_LIT_COLOR : TORCH_UNLIT_COLOR;
      ctx.fillText(torch.char, cx, cy);
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

      // Color: white flash on hit, blink warning, else shade by remaining HP
      if (obj.hitFlash > 0) {
        ctx.fillStyle = '#ffffff';
      } else if (obj.blinking && obj.blinkOn) {
        ctx.fillStyle = '#ff4444';
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
      ctx.fillStyle = ghost.color;
      ctx.fillText(ghost.char, ghost.position.x + CS / 2, ghost.position.y + CS / 2);
    }

    // ── 7. Player attacks (shared with surface/hut via hutPlane=true filter;
    //      see render_helper_pattern — keeps maze combat draw in sync with
    //      the surface pass instead of reimplementing an unfiltered copy) ──
    this.renderController.exploreRenderer.drawProjectiles(game, true);
    this.renderController.exploreRenderer.drawEnemyProjectiles(game, true);
    this.renderController.exploreRenderer.drawPlayerTongueAttacks(game, true);
    this.renderController.exploreRenderer.drawEnemyTongues(game);
    this.renderController.exploreRenderer.drawMimicTongues(game);
    this.renderController.exploreRenderer.drawMeleeAttacks(game, true);
    this.renderController.exploreRenderer.drawEnemyMeleeAttacks(game, true);
    this.renderController.exploreRenderer.drawStuckArrows(game, true);
    this.renderController.exploreRenderer.drawDamageNumbers(game, true);

    // ── 8. Particles ───────────────────────────────────────────────────────
    for (const p of game.particles) {
      if (p.getAlpha) {
        this.renderer.drawTextWithAlpha(p.position.x + CS / 2, p.position.y + CS / 2, p.char, p.color, p.getAlpha());
      } else {
        this.renderer.drawTextWithAlpha(p.x, p.y, p.char, p.color, Math.max(0, p.life / p.maxLife));
      }
    }

    // ── 8b. Torch light (cosmetic glow when Torch equipped) ────────────────
    if (hasTorchLight(game)) {
      drawPlayerTorchLight(
        this.renderer,
        game.player.position.x + CS / 2,
        game.player.position.y + CS / 2
      );
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

    // Label
    ctx.textAlign  = 'center';
    ctx.fillStyle  = '#7755aa';
    ctx.fillText(spectaclesTransformString('[ MAZE ]', spectaclesOn), GRID.WIDTH / 2, offsetY + panelH - CS - 2);

    ctx.restore();
  }
}
