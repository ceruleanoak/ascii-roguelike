/**
 * EquipmentSlots - Renders equipment slots in REST state
 *
 * Responsibilities:
 * - Display storage chest icon
 * - Display armor slot with equipped armor
 * - Display consumable slots with equipped consumables
 */

import { EQUIPMENT, COLORS } from '../../game/GameConfig.js';

export class EquipmentSlots {
  constructor(renderer) {
    this.renderer = renderer;
  }

  render(game) {
    // Draw storage chest (top left)
    this.renderer.drawCell(EQUIPMENT.CHEST_X - 1, EQUIPMENT.CHEST_Y, '[', COLORS.BORDER);
    this.renderer.drawCell(EQUIPMENT.CHEST_X, EQUIPMENT.CHEST_Y, '#', '#8b4513'); // Chest icon
    this.renderer.drawCell(EQUIPMENT.CHEST_X + 1, EQUIPMENT.CHEST_Y, ']', COLORS.BORDER);

    // Draw armor slot (below chest)
    this.renderer.drawCell(EQUIPMENT.ARMOR_X - 1, EQUIPMENT.ARMOR_Y, '[', COLORS.BORDER);
    this.renderer.drawCell(EQUIPMENT.ARMOR_X, EQUIPMENT.ARMOR_Y, ' ', COLORS.BORDER);
    this.renderer.drawCell(EQUIPMENT.ARMOR_X + 1, EQUIPMENT.ARMOR_Y, ']', COLORS.BORDER);

    // Draw equipped armor
    if (game.equippedArmor) {
      this.renderer.drawCell(EQUIPMENT.ARMOR_X, EQUIPMENT.ARMOR_Y, game.equippedArmor.char, game.equippedArmor.color);
    }

    // Draw consumable slot 1 (right side)
    this.renderer.drawCell(EQUIPMENT.CONSUMABLE1_X - 1, EQUIPMENT.CONSUMABLE1_Y, '[', COLORS.BORDER);
    this.renderer.drawCell(EQUIPMENT.CONSUMABLE1_X, EQUIPMENT.CONSUMABLE1_Y, ' ', COLORS.BORDER);
    this.renderer.drawCell(EQUIPMENT.CONSUMABLE1_X + 1, EQUIPMENT.CONSUMABLE1_Y, ']', COLORS.BORDER);

    // Draw equipped consumable 1
    if (game.equippedConsumables[0]) {
      this.renderer.drawCell(EQUIPMENT.CONSUMABLE1_X, EQUIPMENT.CONSUMABLE1_Y, game.equippedConsumables[0].char, game.equippedConsumables[0].color);
    }

    // Draw consumable slot 2 (right side)
    this.renderer.drawCell(EQUIPMENT.CONSUMABLE2_X - 1, EQUIPMENT.CONSUMABLE2_Y, '[', COLORS.BORDER);
    this.renderer.drawCell(EQUIPMENT.CONSUMABLE2_X, EQUIPMENT.CONSUMABLE2_Y, ' ', COLORS.BORDER);
    this.renderer.drawCell(EQUIPMENT.CONSUMABLE2_X + 1, EQUIPMENT.CONSUMABLE2_Y, ']', COLORS.BORDER);

    // Draw equipped consumable 2
    if (game.equippedConsumables[1]) {
      this.renderer.drawCell(EQUIPMENT.CONSUMABLE2_X, EQUIPMENT.CONSUMABLE2_Y, game.equippedConsumables[1].char, game.equippedConsumables[1].color);
    }
  }
}
