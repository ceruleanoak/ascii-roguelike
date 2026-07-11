/**
 * InventoryOverlay - Renders the inventory overlay (I key)
 *
 * Responsibilities:
 * - Display semi-transparent overlay with border
 * - Show title based on game state (INVENTORY or FINDINGS)
 * - List ingredients with counts
 * - List armor items
 * - List consumable items
 */

import { GRID, COLORS, GAME_STATES } from '../../game/GameConfig.js';
import { spectaclesTransformString, isSpectaclesActive } from '../../data/cipher.js';

export class InventoryOverlay {
  constructor(renderer) {
    this.renderer = renderer;
  }

  render(game) {
    const spectaclesOn = isSpectaclesActive(game);
    this.renderer.fgCtx.save();

    // Draw semi-transparent background
    this.renderer.drawRect(
      GRID.CELL_SIZE * 2,
      GRID.CELL_SIZE * 2,
      GRID.WIDTH - GRID.CELL_SIZE * 4,
      GRID.HEIGHT - GRID.CELL_SIZE * 4,
      'rgba(0, 0, 0, 0.8)',
      true
    );

    // Draw border
    this.renderer.drawRect(
      GRID.CELL_SIZE * 2,
      GRID.CELL_SIZE * 2,
      GRID.WIDTH - GRID.CELL_SIZE * 4,
      GRID.HEIGHT - GRID.CELL_SIZE * 4,
      COLORS.BORDER,
      false
    );

    // Draw title (context-dependent)
    const title = game.stateMachine.getCurrentState() === GAME_STATES.EXPLORE ? 'FINDINGS' : 'INVENTORY';
    this.renderer.drawEntity(
      GRID.WIDTH / 2,
      GRID.CELL_SIZE * 3,
      spectaclesTransformString(title, spectaclesOn),
      COLORS.TEXT
    );

    const startY = GRID.CELL_SIZE * 5;
    const lineHeight = GRID.CELL_SIZE * 1.5;
    let index = 0;

    // Active ingredient pool: banked in REST, unbanked carried otherwise.
    const activeIngredients = game.getActiveIngredients();
    const coinCount = game.inventorySystem.getCoinCount();

    // Check if all inventories are empty
    const totalItems = activeIngredients.length + coinCount + game.inventorySystem.armorInventory.length + game.inventorySystem.consumableInventory.length;

    if (totalItems === 0) {
      const emptyMsg = game.stateMachine.getCurrentState() === GAME_STATES.REST
        ? 'explore to gather ingredients'
        : 'Empty';
      this.renderer.drawEntity(
        GRID.WIDTH / 2,
        GRID.HEIGHT / 2,
        spectaclesTransformString(emptyMsg, spectaclesOn),
        COLORS.TEXT
      );
    } else {
      // Draw ingredients section
      if (activeIngredients.length > 0 || coinCount > 0) {
        // Section header
        this.renderer.fgCtx.fillStyle = COLORS.INGREDIENT;
        this.renderer.fgCtx.textAlign = 'left';
        this.renderer.fgCtx.fillText(spectaclesTransformString('INGREDIENTS', spectaclesOn), GRID.CELL_SIZE * 4, startY + index * lineHeight);
        this.renderer.fgCtx.textAlign = 'center';
        index++;

        // Count each ingredient type
        const ingredientCounts = {};
        for (const ingredient of activeIngredients) {
          ingredientCounts[ingredient] = (ingredientCounts[ingredient] || 0) + 1;
        }
        if (coinCount > 0) {
          ingredientCounts['c'] = coinCount;
        }

        // Draw each unique ingredient with count
        for (const [ingredient, count] of Object.entries(ingredientCounts)) {
          const y = startY + index * lineHeight;
          const data = game.getIngredientData(ingredient);

          // Draw ingredient character
          this.renderer.drawEntity(
            GRID.CELL_SIZE * 5,
            y,
            ingredient,
            COLORS.INGREDIENT
          );

          // Draw ingredient name and count
          const text = `${data.name} x${count}`;
          this.renderer.fgCtx.fillStyle = COLORS.TEXT;
          this.renderer.fgCtx.textAlign = 'left';
          this.renderer.fgCtx.fillText(spectaclesTransformString(text, spectaclesOn), GRID.CELL_SIZE * 7, y);
          this.renderer.fgCtx.textAlign = 'center';

          index++;
        }
        index++; // Extra space after section
      }

      // Draw armor section
      if (game.inventorySystem.armorInventory.length > 0) {
        // Section header
        this.renderer.fgCtx.fillStyle = '#aaaaff';
        this.renderer.fgCtx.textAlign = 'left';
        this.renderer.fgCtx.fillText(spectaclesTransformString('ARMOR', spectaclesOn), GRID.CELL_SIZE * 4, startY + index * lineHeight);
        this.renderer.fgCtx.textAlign = 'center';
        index++;

        // Draw armor items
        for (const armor of game.inventorySystem.armorInventory) {
          const y = startY + index * lineHeight;

          // Draw armor character
          this.renderer.drawEntity(
            GRID.CELL_SIZE * 5,
            y,
            armor.char,
            '#aaaaff'  // Blue color for armor
          );

          // Draw armor name
          this.renderer.fgCtx.fillStyle = COLORS.TEXT;
          this.renderer.fgCtx.textAlign = 'left';
          this.renderer.fgCtx.fillText(spectaclesTransformString(armor.data.name, spectaclesOn), GRID.CELL_SIZE * 7, y);
          this.renderer.fgCtx.textAlign = 'center';

          index++;
        }
        index++; // Extra space after section
      }

      // Draw consumables section
      if (game.inventorySystem.consumableInventory.length > 0) {
        // Section header
        this.renderer.fgCtx.fillStyle = '#ffaa00';
        this.renderer.fgCtx.textAlign = 'left';
        this.renderer.fgCtx.fillText(spectaclesTransformString('CONSUMABLES', spectaclesOn), GRID.CELL_SIZE * 4, startY + index * lineHeight);
        this.renderer.fgCtx.textAlign = 'center';
        index++;

        // Draw consumable items
        for (const consumable of game.inventorySystem.consumableInventory) {
          const y = startY + index * lineHeight;

          // Draw consumable character
          this.renderer.drawEntity(
            GRID.CELL_SIZE * 5,
            y,
            consumable.char,
            '#ffaa00'  // Orange color for consumables
          );

          // Draw consumable name
          this.renderer.fgCtx.fillStyle = COLORS.TEXT;
          this.renderer.fgCtx.textAlign = 'left';
          this.renderer.fgCtx.fillText(spectaclesTransformString(consumable.data.name, spectaclesOn), GRID.CELL_SIZE * 7, y);
          this.renderer.fgCtx.textAlign = 'center';

          index++;
        }
      }
    }

    this.renderer.fgCtx.restore();
  }
}
