import { GRID } from '../../game/GameConfig.js';
import { isSpectaclesActive } from '../../data/cipher.js';
import { drawInteriorFrame } from './interiorFrame.js';
import {
  TORCH_LIGHT_RADIUS, TORCH_ALPHA_HIGH, TORCH_ALPHA_LOW,
  TORCH_PULSE_SPEED, TORCH_LIT_COLOR, TORCH_UNLIT_COLOR,
} from '../../systems/MazeSystem.js';
import { RAT_NEST_LINGER } from '../../systems/MazeTrapSystem.js';
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
 *   2a. Flood Panels (dark until torch light), then deep-water tiles, then Rat Nests
 *   2b. Maze torches (fixture glyph + pulsing light when lit)
 *   3. Exit indicator
 *   4. Maze objects (3-hit breakables, hit flash, blink warning)
 *   5. Ground Frame Passes (puddles, goo, debris, mazePlane loot, traps)
 *   6. Ghosts, then Maze enemies (sapping ones again after the player)
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

// Flood Panels read very dark until torch light reaches them
// (MazeSystem.torchLightBand): stepped colors, never an alpha gradient (retro
// alpha quantization) — dark, the light's rim, fully lit. A fired panel never
// drops below the rim shade.
const FLOOD_PANEL_GLYPH = '▭';
const PANEL_COLORS = ['#1c1826', '#4a4258', '#8a80a0'];
const RAT_NEST_GLYPH = '%';
const RAT_NEST_COLOR = '#8a6a4a';
const RAT_NEST_EMPTY_COLOR = '#4a3a2a';
const RAT_NEST_SHAKE_HZ = 10;

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
    // A standing Rat Nest keeps its wall's fill but not its glyph (2a3 draws
    // the nest there); a broken one is drawn as the plain wall it became.
    const nestCells = new Set(mi.ratNests.filter(n => !n.destroyed).map(n => `${n.row},${n.col}`));
    for (let r = 0; r < mi.gridRows; r++) {
      for (let c = 0; c < mi.gridCols; c++) {
        if (!mi.collisionMap[r][c]) continue;
        // Skip exit cell — rendered separately
        if (r === mi.exitRow && c === mi.exitCol) continue;
        ctx.fillStyle = WALL_COLOR;
        ctx.fillRect(c * CS, r * CS, CS, CS);
        if (nestCells.has(`${r},${c}`)) continue;
        ctx.fillStyle = WALL_GLYPH_COLOR;
        ctx.fillText(WALL_GLYPH, c * CS + CS / 2, r * CS + CS / 2);
      }
    }

    // ── 2a. Flood Panels (dark until torch light finds them) ───────────────
    for (const panel of mi.floodPanels) {
      const band = game.mazeSystem.torchLightBand(mi, panel.col * CS, panel.row * CS);
      ctx.fillStyle = PANEL_COLORS[panel.triggered ? Math.max(1, band) : band];
      ctx.fillText(FLOOD_PANEL_GLYPH, panel.col * CS + CS / 2, panel.row * CS + CS / 2);
    }

    // ── 2a2. Maze background objects (the flood's deep-water tiles) ───────
    for (const obj of mi.backgroundObjects) {
      if (obj.destroyed) continue;
      const renderData = obj.getRenderPosition();
      ctx.fillStyle = renderData.color;
      ctx.fillText(renderData.char, renderData.x + CS / 2, renderData.y + CS / 2);
    }

    // ── 2a3. Rat Nests (shake while the player lingers; dim once emptied) ──
    for (const nest of mi.ratNests) {
      if (nest.destroyed) continue;
      // A 1 px side-to-side shake that widens to 2 px past half the linger.
      let dx = 0;
      if (nest.shaking) {
        const amplitude = nest.linger >= RAT_NEST_LINGER / 2 ? 2 : 1;
        dx = (Math.floor(nest.linger * RAT_NEST_SHAKE_HZ) % 2 ? 1 : -1) * amplitude;
      }
      const cx = nest.col * CS + CS / 2;
      const cy = nest.row * CS + CS / 2;
      ctx.fillStyle = nest.hitFlash > 0 ? '#ffffff'
        : nest.released ? RAT_NEST_EMPTY_COLOR : RAT_NEST_COLOR;
      ctx.fillText(RAT_NEST_GLYPH, cx + dx, cy);
      if (nest.hp < nest.maxHp) {
        for (let i = 0; i < nest.maxHp; i++) {
          ctx.fillStyle = i < nest.hp ? RAT_NEST_COLOR : '#333333';
          ctx.fillRect(cx - 4 + i * 4, cy - CS - 2, 3, 3);
        }
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

    // ── 6b. Maze enemies (shared pass; sapping ones redraw over the player) ─
    this.renderController.exploreRenderer.drawNonSappingEnemies(game, mi.enemies);

    // ── 7-8. Shared combat + player Frame Passes ─────────────────────────
    drawFramePasses(this.renderController, game, 'maze', 'combat');
    drawFramePasses(this.renderController, game, 'maze', 'player');

    this.renderController.exploreRenderer.drawSappingEnemies(game, mi.enemies);

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
