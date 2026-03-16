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
import { HutInteriorOverlay } from './ui/HutInteriorOverlay.js';

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

    // State renderers (pass renderController for component access)
    this.titleRenderer = new TitleRenderer(renderer);
    this.gameOverRenderer = new GameOverRenderer(renderer);
    this.restRenderer = new RestRenderer(renderer, this);
    this.exploreRenderer = new ExploreRenderer(renderer, this);
    this.neutralRenderer = new NeutralRenderer(renderer, this);
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
}
