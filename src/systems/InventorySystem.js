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

  // ========== PICKUP & DROP LOGIC ==========

  /**
   * Attempt to pick up items near the player
   * Routes items to correct inventory (armor, consumable, weapon/trap)
   *
   * @param {Array} items - Game items array
   * @param {Array} placedTraps - Placed trap entries array
   * @param {Player} player - Player entity
   * @param {PhysicsSystem} physicsSystem - Physics system for distance/entity management
   * @returns {Object} - { success: boolean, droppedItem: Item|null, message: string|null, removedTrap: boolean }
   */
  tryPickupItem(items, placedTraps, player, physicsSystem) {
    // Check placed traps first (SPACE picks them back up into quick slot)
    for (let i = 0; i < placedTraps.length; i++) {
      const trapEntry = placedTraps[i];
      const dx = trapEntry.item.position.x - player.position.x;
      const dy = trapEntry.item.position.y - player.position.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < 20) {
        // Put trap back into quick slot (same path as weapons)
        const droppedItem = player.pickupItem(trapEntry.item);
        placedTraps.splice(i, 1);

        return {
          success: true,
          droppedItem: droppedItem,
          message: trapEntry.item.data.name,
          removedTrap: true
        };
      }
    }

    // Check ground items
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const distance = physicsSystem.getDistance(player, item);

      if (distance < 20) {
        let droppedItem = null;

        // Route items to correct inventory based on type
        if (item.data.type === 'ARMOR') {
          // Add to armor inventory
          this.armorInventory.push(item);
          physicsSystem.removeEntity(item);
          items.splice(i, 1);
        } else if (item.data.type === 'CONSUMABLE') {
          // Add to consumable inventory
          this.consumableInventory.push(item);
          physicsSystem.removeEntity(item);
          items.splice(i, 1);
        } else if (item.data.type === 'WEAPON' || item.data.type === 'TRAP') {
          // Add to quick slots (weapons and traps)
          droppedItem = player.pickupItem(item);
          physicsSystem.removeEntity(item);
          items.splice(i, 1);
        }

        return {
          success: true,
          droppedItem: droppedItem,
          message: item.data.name,
          removedTrap: false
        };
      }
    }

    // No items in range
    return {
      success: false,
      droppedItem: null,
      message: null,
      removedTrap: false
    };
  }

  // ========== EQUIPMENT MENU SYSTEM ==========

  /**
   * Open equipment menu and get available items (deduplicated by char)
   *
   * @param {string} slotType - 'armor', 'consumable1', or 'consumable2'
   * @returns {Array} - Deduplicated array of available items
   */
  openEquipmentMenu(slotType) {
    const availableItems = [];

    if (slotType === 'armor') {
      // Get all armor from armor inventory (deduplicated)
      for (const item of this.armorInventory) {
        if (!availableItems.find(i => i.char === item.char)) {
          availableItems.push(item);
        }
      }
    } else if (slotType === 'consumable1' || slotType === 'consumable2') {
      // Get all consumables from consumable inventory (deduplicated)
      for (const item of this.consumableInventory) {
        if (!availableItems.find(i => i.char === item.char)) {
          availableItems.push(item);
        }
      }
    }

    return availableItems;
  }

  /**
   * Equip armor item
   * Unequips current armor (returns to inventory), removes new armor from inventory
   *
   * @param {Item} selectedItem - Armor item to equip
   * @returns {Item|null} - Previously equipped armor (if any)
   */
  equipArmor(selectedItem) {
    const previousArmor = this.equippedArmor;

    // If there was previously equipped armor, return it to inventory
    if (this.equippedArmor) {
      this.armorInventory.push(this.equippedArmor);
    }

    // Remove selected armor from inventory and equip it
    const armorIndex = this.armorInventory.indexOf(selectedItem);
    if (armorIndex > -1) {
      this.armorInventory.splice(armorIndex, 1);
    }
    this.equippedArmor = selectedItem;

    return previousArmor;
  }

  /**
   * Equip consumable item to specified slot
   * Unequips current consumable (returns to inventory), removes new consumable from inventory
   *
   * @param {number} slotIndex - 0 for consumable1, 1 for consumable2
   * @param {Item} selectedItem - Consumable item to equip
   * @returns {Item|null} - Previously equipped consumable (if any)
   */
  equipConsumable(slotIndex, selectedItem) {
    const previousConsumable = this.equippedConsumables[slotIndex];

    // If there was previously equipped consumable, return it to inventory
    if (this.equippedConsumables[slotIndex]) {
      this.consumableInventory.push(this.equippedConsumables[slotIndex]);
    }

    // Remove selected consumable from inventory and equip it
    const consumableIndex = this.consumableInventory.indexOf(selectedItem);
    if (consumableIndex > -1) {
      this.consumableInventory.splice(consumableIndex, 1);
    }
    this.equippedConsumables[slotIndex] = selectedItem;

    // Reset consumable state for this slot
    this.spentConsumableSlots[slotIndex] = false;
    this.consumableCooldowns[slotIndex] = 0;

    return previousConsumable;
  }

  // ========== ARMOR EFFECTS APPLICATION ==========

  /**
   * Apply equipped armor effects to player
   * Resets player stats, applies armor properties, adds block boost if active
   *
   * @param {Player} player - Player entity to apply effects to
   */
  applyEquipmentEffectsToPlayer(player) {
    // Reset all armor properties
    player.defense = 0;
    player.bulletResist = 0;
    player.dodgeChance = 0;
    player.fireImmune = false;
    player.freezeImmune = false;
    player.poisonImmune = false;
    player.slimeImmune = false;
    player.reflectDamage = 0;
    player.speedBoost = 0;
    player.speedPenalty = 0;
    player.slowEnemies = false;

    // Apply equipped armor properties
    if (this.equippedArmor) {
      player.defense = this.equippedArmor.defense || 0;
      player.bulletResist = this.equippedArmor.bulletResist || 0;
      player.dodgeChance = this.equippedArmor.dodgeChance || 0;
      player.fireImmune = this.equippedArmor.fireImmune || false;
      player.freezeImmune = this.equippedArmor.freezeImmune || false;
      player.poisonImmune = this.equippedArmor.poisonImmune || false;
      player.slimeImmune = this.equippedArmor.slimeImmune || false;
      player.reflectDamage = this.equippedArmor.reflectDamage || 0;
      player.speedBoost = this.equippedArmor.speedBoost || 0;
      player.speedPenalty = this.equippedArmor.speedPenalty || 0;
      player.slowEnemies = this.equippedArmor.slowEnemies || false;
    }

    // Add temporary block boost from Metal Block consumable
    if (player.blockBoostTimer > 0) {
      player.defense += player.blockBoostAmount;
    }

    // Store equipped consumables for condition checking during gameplay
    player.equippedConsumables = [...this.equippedConsumables];
  }
}
