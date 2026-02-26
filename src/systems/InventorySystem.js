/**
 * InventorySystem.js
 *
 * Manages all inventory-related state and operations:
 * - Dual-mode persistence (REST hub vs EXPLORE combat)
 * - Equipment management (armor + 2 consumable slots)
 * - Quick slot management (3 weapon slots)
 * - Auto-trigger consumable system with enemy proximity detection
 * - Death mechanics (quick slots persist, equipment clears)
 * - Item chest storage
 * - Room persistence anti-cheat
 */

export class InventorySystem {
  constructor() {
    // REST inventory (persists through death, cleared on game over)
    this.restInventory = []; // Ingredients only
    this.restQuickSlots = [null, null, null]; // Weapons only
    this.restActiveSlotIndex = 0; // Persistent active slot index
    this.itemChest = []; // Storage for weapons

    // EXPLORE inventory (lost on death)
    this.armorInventory = []; // All collected armor
    this.consumableInventory = []; // All collected consumables

    // Equipment slots (lost on death)
    this.equippedArmor = null; // Single armor slot
    this.equippedConsumables = [null, null]; // 2 consumable slots

    // Consumable HUD feedback state
    this.spentConsumableSlots = [false, false]; // tracks ONE-SHOT used slots this run
    this.consumableCooldowns = [0, 0]; // cooldown timers for reusable consumables
    this.consumableFlashTimer = 0; // HUD flash duration in seconds
    this.consumableFlashSlot = -1; // which slot is flashing (-1 = none)

    // Consumable windup system (for offensive items)
    this.consumableWindups = []; // { consumable, slotIndex, timer, maxTimer, x, y, blinkTimer }

    // Room persistence (anti-cheat - prevents room cycling)
    this.savedExploreRoom = null; // Last explore room before returning to REST
    this.savedExploreItems = [];
    this.savedExploreIngredients = [];
    this.savedExplorePlacedTraps = [];
    this.savedExploreEnemies = [];
    this.savedExploreBackgroundObjects = [];
    this.savedExploreCaptives = [];
  }

  // ========== GETTERS (for UI access) ==========

  getRestInventory() {
    return this.restInventory;
  }

  getRestQuickSlots() {
    return this.restQuickSlots;
  }

  getRestActiveSlotIndex() {
    return this.restActiveSlotIndex;
  }

  getArmorInventory() {
    return this.armorInventory;
  }

  getConsumableInventory() {
    return this.consumableInventory;
  }

  getEquippedArmor() {
    return this.equippedArmor;
  }

  getEquippedConsumables() {
    return this.equippedConsumables;
  }

  getItemChest() {
    return this.itemChest;
  }

  getSpentConsumableSlots() {
    return this.spentConsumableSlots;
  }

  getConsumableCooldowns() {
    return this.consumableCooldowns;
  }

  getConsumableFlashTimer() {
    return this.consumableFlashTimer;
  }

  getConsumableFlashSlot() {
    return this.consumableFlashSlot;
  }

  getConsumableWindups() {
    return this.consumableWindups;
  }

  getSavedExploreRoom() {
    return this.savedExploreRoom;
  }
}
