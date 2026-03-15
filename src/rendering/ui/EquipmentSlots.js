/**
 * EquipmentSlots - Renders equipment slots in REST state
 *
 * Responsibilities:
 * - Display three numbered item chests (one per quick slot) — active chest drawn
 *   bright by RestRenderer on the foreground layer each frame
 * - Display armor slot with equipped armor
 * - Display five consumable slots (slot 3 is locked/unlockable)
 */

import { EQUIPMENT } from '../../game/GameConfig.js';

export class EquipmentSlots {
  constructor(renderer) {
    this.renderer = renderer;
  }

  render(game) {
    const DIM_AMBER = '#ff4444';
    const BLUE = '#4488ff';
    const YELLOW = '#ffff00';
    const LOCKED = '#333333';

    // Draw 3 item chests in dim amber (active chest redrawn bright by RestRenderer)
    const chestYs = [EQUIPMENT.CHEST1_Y, EQUIPMENT.CHEST2_Y, EQUIPMENT.CHEST3_Y];
    for (let i = 0; i < 3; i++) {
      const y = chestYs[i];
      const item = game.player ? game.player.quickSlots[i] : null;
      const char = item ? item.char : String(i + 1);

      this.renderer.drawCell(EQUIPMENT.CHEST_X - 1, y, '[', DIM_AMBER);
      this.renderer.drawCell(EQUIPMENT.CHEST_X,     y, char, item ? (item.color || DIM_AMBER) : DIM_AMBER);
      this.renderer.drawCell(EQUIPMENT.CHEST_X + 1, y, ']', DIM_AMBER);
    }

    // Draw armor slot — blue
    this.renderer.drawCell(EQUIPMENT.ARMOR_X - 1, EQUIPMENT.ARMOR_Y, '[', BLUE);
    this.renderer.drawCell(EQUIPMENT.ARMOR_X,     EQUIPMENT.ARMOR_Y, ' ', BLUE);
    this.renderer.drawCell(EQUIPMENT.ARMOR_X + 1, EQUIPMENT.ARMOR_Y, ']', BLUE);

    if (game.inventorySystem.equippedArmor) {
      this.renderer.drawCell(
        EQUIPMENT.ARMOR_X,
        EQUIPMENT.ARMOR_Y,
        game.inventorySystem.equippedArmor.char,
        game.inventorySystem.equippedArmor.color
      );
    }

    // Draw consumable slots 1-5 (slot 3 is locked)
    const consumableXs = [
      EQUIPMENT.CONSUMABLE1_X,
      EQUIPMENT.CONSUMABLE2_X,
      EQUIPMENT.CONSUMABLE3_X,
      EQUIPMENT.CONSUMABLE4_X,
      EQUIPMENT.CONSUMABLE5_X
    ];
    const consumableYs = [
      EQUIPMENT.CONSUMABLE1_Y,
      EQUIPMENT.CONSUMABLE2_Y,
      EQUIPMENT.CONSUMABLE3_Y,
      EQUIPMENT.CONSUMABLE4_Y,
      EQUIPMENT.CONSUMABLE5_Y
    ];

    const maxSlots = game.inventorySystem?.maxConsumableSlots ?? 2;

    for (let i = 0; i < 5; i++) {
      const x = consumableXs[i];
      const y = consumableYs[i];
      const isLocked = (i >= maxSlots); // slots beyond maxSlots are locked/unlockable
      const color = isLocked ? LOCKED : YELLOW;

      this.renderer.drawCell(x - 1, y, '[', color);
      this.renderer.drawCell(x,     y, ' ', color);
      this.renderer.drawCell(x + 1, y, ']', color);

      // Draw equipped consumable for unlocked slots
      if (!isLocked && game.inventorySystem.equippedConsumables[i]) {
        const cons = game.inventorySystem.equippedConsumables[i];
        this.renderer.drawCell(x, y, cons.char, cons.color);
      }
    }
  }
}
