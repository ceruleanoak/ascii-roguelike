import { GRID } from '../../game/GameConfig.js';
import { isSpectaclesActive } from '../../data/cipher.js';
import { drawInteriorFrame } from './interiorFrame.js';
import {
  TORCH_LIGHT_RADIUS, TORCH_ALPHA_HIGH, TORCH_ALPHA_LOW,
  TORCH_PULSE_SPEED, TORCH_LIT_COLOR, TORCH_UNLIT_COLOR,
} from '../../systems/MazeSystem.js';
import { drawInteriorVisionFogOverlay } from './torchLight.js';
import { drawFramePasses } from '../framePasses.js';

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
 *   5. Ground Frame Passes (puddles, goo, debris, mazePlane loot, traps)
 *   6. Ghosts
 *   7. Combat Frame Passes (attacks, arcs, damage numbers, particles, steam)
 *   8. Player Frame Passes (torch glow, glyph, pips, poses, throwables)
 *   9. Camp companion
 *  10. Indicator Frame Passes, then blind vision fog
 *
 * Every pass shared with the other Frame Owners runs from the registry in
 * framePasses.js — never a hand call here (npm run check:frames).
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
    drawInteriorFrame(ctx, {
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

    // ── 5. Shared ground Frame Passes ────────────────────────────────────
    drawFramePasses(this.renderController, game, 'maze', 'ground');

    // ── 6. Ghosts ──────────────────────────────────────────────────────────
    for (const ghost of mi.ghosts) {
      ctx.fillStyle = ghost.color;
      ctx.fillText(ghost.char, ghost.position.x + CS / 2, ghost.position.y + CS / 2);
    }

    // ── 7-8. Shared combat + player Frame Passes ─────────────────────────
    drawFramePasses(this.renderController, game, 'maze', 'combat');
    drawFramePasses(this.renderController, game, 'maze', 'player');

    // ── 9. Camp companion (followed the player in; maze coords) ───────────
    if (game.companion) {
      game.companion.render(ctx, (gx, gy) => ({ x: gx * CS, y: gy * CS }));
    }

    // ── 10. Shared indicator Frame Passes ────────────────────────────────
    drawFramePasses(this.renderController, game, 'maze', 'indicators');

    // ── 10b. Blind vision fog (after everything, inside the PiP clip) ───────
    drawInteriorVisionFogOverlay(this.renderer, game);

    // ── Restore interior translate ────────────────────────────────────────
    ctx.restore();
  }
}
