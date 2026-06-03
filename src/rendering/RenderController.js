/**
 * RenderController - Orchestrates rendering across game states
 *
 * 3-Tier Architecture:
 * Game (main.js) → RenderController → StateRenderers + UI Components
 *
 * Responsibilities:
 * - Route render calls to state-specific renderers
 * - Manage background dirty flag optimization
 * - Coordinate UI component rendering
 */

import { BowChargeIndicator } from './ui/BowChargeIndicator.js';
import { GreenRangerIndicator } from './ui/GreenRangerIndicator.js';
import { ArrowKeyIndicators } from './ui/ArrowKeyIndicators.js';
import { CraftingStation } from './ui/CraftingStation.js';
import { MenuOverlay } from './ui/MenuOverlay.js';
import { EquipmentSlots } from './ui/EquipmentSlots.js';
import { InventoryOverlay } from './ui/InventoryOverlay.js';
import { TitleRenderer } from './state/TitleRenderer.js';
import { GameOverRenderer } from './state/GameOverRenderer.js';
import { RestRenderer } from './state/RestRenderer.js';
import { ExploreRenderer } from './state/ExploreRenderer.js';
import { NeutralRenderer } from './state/NeutralRenderer.js';
import { DemoRenderer } from './state/DemoRenderer.js';
import { HutInteriorOverlay } from './ui/HutInteriorOverlay.js';
import { MazeInteriorOverlay } from './ui/MazeInteriorOverlay.js';
import { PixelatedDissolve, ScreenShake } from './effects/TextEffects.js';
import { GRID } from '../game/GameConfig.js';

export class RenderController {
  constructor(renderer) {
    this.renderer = renderer;

    // UI components (must be initialized before state renderers that use them)
    this.bowChargeIndicator = new BowChargeIndicator(renderer);
    this.greenRangerIndicator = new GreenRangerIndicator(renderer);
    this.arrowKeyIndicators = new ArrowKeyIndicators(renderer);
    this.craftingStation = new CraftingStation(renderer);
    this.menuOverlay = new MenuOverlay(renderer);
    this.equipmentSlots = new EquipmentSlots(renderer);
    this.inventoryOverlay = new InventoryOverlay(renderer);

    // Hut interior overlay (needs renderController for renderEnemy access)
    this.hutInteriorOverlay = new HutInteriorOverlay(renderer, this);

    // Maze interior overlay (scrolling viewport)
    this.mazeInteriorOverlay = new MazeInteriorOverlay(renderer, this);

    // State renderers (pass renderController for component access)
    this.titleRenderer = new TitleRenderer(renderer);
    this.gameOverRenderer = new GameOverRenderer(renderer, this);
    this.restRenderer = new RestRenderer(renderer, this);
    this.exploreRenderer = new ExploreRenderer(renderer, this);
    this.neutralRenderer = new NeutralRenderer(renderer, this);
    this.demoRenderer = new DemoRenderer(renderer, this);

    // Spell response overlay state
    this._spellText = null;
    this._spellDissolves = [];

    // Screen shake
    this.screenShake = new ScreenShake();
  }

  /** Apply horizontal screen shake by CSS-translating both canvas layers. */
  applyShake() {
    const offsetX = this.screenShake.getOffsetX();
    const transform = offsetX ? `translateX(${offsetX.toFixed(2)}px)` : '';
    this.renderer.bgCanvas.style.transform = transform;
    this.renderer.fgCanvas.style.transform = transform;
  }

  renderTitleState(game) {
    this.titleRenderer.render(game);
  }

  renderRestState(game) {
    this.restRenderer.render(game);
  }

  renderExploreState(game) {
    this.exploreRenderer.render(game);
  }

  renderNeutralState(game) {
    this.neutralRenderer.render(game);
  }

  renderGameOverState(game) {
    this.gameOverRenderer.render(game);
  }

  renderDemoState(game) {
    this.demoRenderer.render(game);
  }

  renderCleanseWave(game) {
    if (!game.cleanseWave) return;

    const { startTime, duration } = game.cleanseWave;
    const elapsed = performance.now() - startTime;
    const t = Math.min(elapsed / duration, 1);

    if (t >= 1) {
      game.cleanseWave = null;
      return;
    }

    const ctx = this.renderer.fgCtx;
    const SQ = GRID.CELL_SIZE * 2;                        // 32px large squares
    const COLS = Math.ceil(GRID.WIDTH  / SQ);             // 15 across
    const TOTAL_ROWS = Math.ceil(GRID.HEIGHT / SQ) + 4;   // a few rows past bottom
    const BAND_H = SQ * 3;                                 // fade trail: 3 rows tall

    // Leading edge sweeps from off-screen-top to off-screen-bottom
    const leadY = t * (GRID.HEIGHT + BAND_H) - BAND_H;

    ctx.save();
    for (let row = 0; row < TOTAL_ROWS; row++) {
      const ry = row * SQ;
      const distFromLead = ry - leadY; // positive = ahead of (below) lead
      if (distFromLead < 0 || distFromLead > BAND_H) continue;

      const alpha = 1 - distFromLead / BAND_H; // 1 at lead edge, 0 at trail
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#ffffff';
      for (let col = 0; col < COLS; col++) {
        ctx.fillRect(col * SQ + 1, ry + 1, SQ - 2, SQ - 2);
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  renderBossDefeatFlash(game) {
    if (!game.bossDefeatFlash) return;

    const { startTime, duration } = game.bossDefeatFlash;
    const elapsed = performance.now() - startTime;
    const t = Math.min(elapsed / duration, 1);

    if (t >= 1) {
      game.bossDefeatFlash = null;
      return;
    }

    const ctx = this.renderer.fgCtx;
    const peak = 0.85;
    const alpha = t < 0.25 ? (t / 0.25) * peak : peak * (1 - (t - 0.25) / 0.75);

    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, GRID.WIDTH, GRID.HEIGHT);
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  renderSpellResponse(game) {
    if (!game.spellResponse) return;

    const { text, startTime } = game.spellResponse;
    const elapsed = performance.now() - startTime;

    const CHAR_DELAY_MS = 120;
    const CHAR_SPEED    = 8;   // ~125 ms per dissolve transition
    const HOLD_MS       = 2200;
    const charDuration  = 1000 / CHAR_SPEED;
    const totalRevealMs = (text.length - 1) * CHAR_DELAY_MS + charDuration;
    const holdEnd       = totalRevealMs + HOLD_MS;

    // Reinitialise dissolves when text changes
    if (text !== this._spellText) {
      this._spellText = text;
      this._spellDissolves = Array.from(
        { length: text.length },
        () => new PixelatedDissolve({ speed: CHAR_SPEED, blockSize: 4 })
      );
    }

    // After hold, visible=false triggers the retro dissolve-out on all chars.
    // Auto-clear once every dissolve has fully faded.
    const holding = elapsed < holdEnd;
    if (!holding && this._spellDissolves.every(d => d.alpha <= 0)) {
      game.spellResponse = null;
      this._spellText = null;
      this._spellDissolves = [];
      return;
    }

    const ctx = this.renderer.fgCtx;
    const MAX_TEXT_W = GRID.WIDTH * 0.92;

    // Start at 2× cell size, scale down if the text would overflow the canvas.
    let fontSize = GRID.CELL_SIZE * 2;
    ctx.save();
    ctx.font = `${fontSize}px 'VentureArcade', 'Unifont', monospace`;
    let totalW = ctx.measureText(text).width;
    if (totalW > MAX_TEXT_W) {
      fontSize = Math.floor(fontSize * MAX_TEXT_W / totalW);
      ctx.font = `${fontSize}px 'VentureArcade', 'Unifont', monospace`;
      totalW = ctx.measureText(text).width;
    }
    const font  = ctx.font;
    const charW = totalW / text.length;
    const baseX = GRID.WIDTH  / 2 - totalW / 2 + charW / 2;
    const textY = GRID.HEIGHT / 2;

    for (let i = 0; i < text.length; i++) {
      this._spellDissolves[i].render(ctx, {
        text:    text[i],
        font,
        color:   '#888888',
        x:       baseX + i * charW,
        y:       textY,
        visible: holding && elapsed >= i * CHAR_DELAY_MS,
      });
    }

    ctx.restore();
  }
}
