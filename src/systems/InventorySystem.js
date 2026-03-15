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
    // PER-CHARACTER REST inventory (persists through death, cleared on game over)
    // Each character has their own separate banked inventory and quick slots
    this.characterInventories = {
      'default': {
        inventory: [],        // Ingredients only
        quickSlots: [null, null, null],  // Weapons only
        activeSlotIndex: 0    // Persistent active slot index
      }
    };

    // Legacy properties - maintained for backward compatibility with existing code
    // These point to the active character's data
    this.restInventory = this.characterInventories['default'].inventory;
    this.restQuickSlots = this.characterInventories['default'].quickSlots;
    this.restActiveSlotIndex = this.characterInventories['default'].activeSlotIndex;

    this.itemChest = []; // Storage for weapons (shared across all characters)

    // EXPLORE inventory (lost on death)
    this.armorInventory = []; // All collected armor
    this.consumableInventory = []; // All collected consumables

    // Equipment slots (lost on death)
    this.equippedArmor = null; // Single armor slot
    this.equippedConsumables = [null, null]; // 2 consumable slots (can expand to 5)
    this.maxConsumableSlots = 2; // Unlockable up to 5; resets on death

    // Consumable HUD feedback state
    this.spentConsumableSlots = [false, false]; // tracks ONE-SHOT used slots this run
    this.consumableCooldowns = [0, 0]; // cooldown timers for reusable consumables
    this.consumableFlashTimer = 0; // HUD flash duration in seconds (kept for compat)
    this.consumableFlashSlot = -1; // which slot is flashing (-1 = none)
    // Blink animation: alternates solid block ↔ normal char
    this.consumableBlinkSlot = -1;   // slot index being blinked (-1 = none)
    this.consumableBlinkTimer = 0;   // total remaining blink duration
    this.consumableBlinkPhase = 0;   // sub-timer within current half-cycle
    this.consumableBlinkShowBlock = false; // true = show '█', false = show normal char

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

    // REST mode persistence
    this.savedRestIngredients = []; // Ingredients on the ground in REST mode
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

  // ========== CHARACTER INVENTORY MANAGEMENT ==========

  /**
   * Set the active character and update legacy property pointers
   * Creates character inventory slot if it doesn't exist
   *
   * @param {string} characterType - Character type (e.g., 'default', 'red', 'cyan')
   */
  setActiveCharacter(characterType) {
    // Ensure character inventory exists
    if (!this.characterInventories[characterType]) {
      this.characterInventories[characterType] = {
        inventory: [],
        quickSlots: [null, null, null],
        activeSlotIndex: 0
      };
    }

    // Update legacy property pointers to active character's data
    this.restInventory = this.characterInventories[characterType].inventory;
    this.restQuickSlots = this.characterInventories[characterType].quickSlots;
    this.restActiveSlotIndex = this.characterInventories[characterType].activeSlotIndex;
  }

  /**
   * Get character's inventory data
   *
   * @param {string} characterType - Character type
   * @returns {Object} - { inventory, quickSlots, activeSlotIndex }
   */
  getCharacterInventory(characterType) {
    if (!this.characterInventories[characterType]) {
      return null;
    }
    return this.characterInventories[characterType];
  }

  /**
   * Clear all character inventories (game over)
   */
  clearAllCharacterInventories() {
    this.characterInventories = {
      'default': {
        inventory: [],
        quickSlots: [null, null, null],
        activeSlotIndex: 0
      }
    };

    // Reset legacy pointers to default
    this.setActiveCharacter('default');
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
    // NOTE: Placed traps (activated with SPACE) are NOT pickable - they're active traps
    // Only dropped traps (swapped from quick slots) in the items array can be picked up

    // Check ground items
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const distance = physicsSystem.getDistance(player, item);

      if (distance < 20) {
        let droppedItem = null;
        let customMessage = null;

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
        } else if (item.data.type === 'BLESSING') {
          // Blessings are handled by caller (applyBlessing in main.js)
          physicsSystem.removeEntity(item);
          items.splice(i, 1);
          return {
            success: true,
            droppedItem: null,
            message: null,
            removedTrap: false,
            blessing: item // Return blessing item for caller to apply
          };
        } else if (item.data.type === 'NEUTRAL') {
          // Neutral items just show message (lore/flavor)
          customMessage = item.data.name;
          physicsSystem.removeEntity(item);
          items.splice(i, 1);
        }

        return {
          success: true,
          droppedItem: droppedItem,
          message: customMessage || item.data.name,
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
    } else if (slotType.startsWith('consumable')) {
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
   * Unlock one additional consumable slot (max 5).
   * Expands the equippedConsumables, spentConsumableSlots, and consumableCooldowns arrays.
   */
  unlockConsumableSlot() {
    if (this.maxConsumableSlots >= 5) return;
    this.maxConsumableSlots++;
    this.equippedConsumables.push(null);
    this.spentConsumableSlots.push(false);
    this.consumableCooldowns.push(0);
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
      const a = this.equippedArmor.data;
      player.defense = a.defense || 0;
      player.bulletResist = a.bulletResist || 0;
      player.dodgeChance = a.dodgeChance || 0;
      player.fireImmune = a.fireImmune || false;
      player.freezeImmune = a.freezeImmune || false;
      player.poisonImmune = a.poisonImmune || false;
      player.slimeImmune = a.slimeImmune || false;
      player.reflectDamage = a.reflectDamage || 0;
      player.speedBoost = a.speedBoost || 0;
      player.speedPenalty = a.speedPenalty || 0;
      player.slowEnemies = a.slowEnemies || false;
    }

    // Add temporary block boost from Metal Block consumable
    if (player.blockBoostTimer > 0) {
      player.defense += player.blockBoostAmount;
    }

    // Store equipped consumables for condition checking during gameplay
    player.equippedConsumables = [...this.equippedConsumables];
  }

  // ========== CONSUMABLE AUTO-TRIGGER SYSTEM ==========

  /**
   * Main update loop for consumable system
   * Call this from Game.update() in EXPLORE state
   *
   * @param {number} deltaTime - Frame delta time
   * @param {Player} player - Player entity
   * @param {Object} currentRoom - Current room with enemies array
   * @param {CombatSystem} combatSystem - Combat system for damage numbers
   * @param {Array} steamClouds - Steam clouds array
   * @param {Array} particles - Particles array
   */
  update(deltaTime, player, currentRoom, combatSystem, steamClouds, particles) {
    // Tick cooldowns
    this.updateConsumableCooldowns(deltaTime);

    // Tick HUD flash timer
    this.updateConsumableFlash(deltaTime);

    // Check if consumables should activate
    this.checkConsumableActivation(player, currentRoom, combatSystem, steamClouds, particles);

    // Update active windups
    this.updateConsumableWindups(deltaTime, player, currentRoom, combatSystem, steamClouds, particles);
  }

  /**
   * Tick down consumable cooldown timers
   */
  updateConsumableCooldowns(deltaTime) {
    for (let i = 0; i < this.consumableCooldowns.length; i++) {
      if (this.consumableCooldowns[i] > 0) {
        this.consumableCooldowns[i] = Math.max(0, this.consumableCooldowns[i] - deltaTime);
      }
    }
  }

  /**
   * Tick down HUD flash/blink timers for consumable slot.
   * Returns true while a blink is in progress (caller should updateUI this frame).
   */
  updateConsumableFlash(deltaTime) {
    // Legacy flash timer (color-only flash, used by windup completion)
    if (this.consumableFlashTimer > 0) {
      this.consumableFlashTimer = Math.max(0, this.consumableFlashTimer - deltaTime);
      if (this.consumableFlashTimer === 0) {
        this.consumableFlashSlot = -1;
      }
    }

    // Block-blink animation: 4 half-cycles at 0.1s each = 0.4s total
    if (this.consumableBlinkTimer > 0) {
      this.consumableBlinkTimer = Math.max(0, this.consumableBlinkTimer - deltaTime);
      this.consumableBlinkPhase -= deltaTime;
      if (this.consumableBlinkPhase <= 0) {
        // Toggle solid block vs normal char
        this.consumableBlinkShowBlock = !this.consumableBlinkShowBlock;
        this.consumableBlinkPhase = 0.1; // 100ms per half-cycle
      }
      if (this.consumableBlinkTimer === 0) {
        this.consumableBlinkSlot = -1;
        this.consumableBlinkShowBlock = false;
      }
      return true; // HUD needs refresh this frame
    }
    return false;
  }

  /**
   * Check if equipped consumables should activate based on conditions
   */
  checkConsumableActivation(player, currentRoom, combatSystem, steamClouds, particles) {
    if (!player.equippedConsumables) return;

    for (let i = 0; i < player.equippedConsumables.length; i++) {
      const consumable = player.equippedConsumables[i];
      if (!consumable) continue;
      if (this.spentConsumableSlots[i]) continue; // One-shot consumables already used

      // Skip if on cooldown (reusable consumables)
      if (this.consumableCooldowns[i] > 0) continue;

      // Skip if already winding up
      if (this.consumableWindups.some(w => w.slotIndex === i)) continue;

      let shouldTrigger = false;
      let triggerData = null; // Store trigger conditions for offensive items
      const cd = consumable.data;

      // Check trigger condition based on effect type
      shouldTrigger = this._checkTriggerCondition(cd, player, currentRoom, steamClouds);
      if (shouldTrigger && shouldTrigger.windup) {
        triggerData = shouldTrigger;
        shouldTrigger = true;
      }

      if (shouldTrigger) {
        this._triggerConsumable(i, consumable, triggerData, player, combatSystem, particles);
      }
    }
  }

  /**
   * Check if consumable trigger condition is met
   * @private
   */
  _checkTriggerCondition(cd, player, currentRoom, steamClouds) {
    const enemies = currentRoom ? currentRoom.enemies : [];

    switch (cd.effect) {
      case 'heal': {
        // Use item's autoTriggerHP if defined; otherwise fall back to amount-based threshold
        const threshold = cd.autoTriggerHP !== undefined
          ? cd.autoTriggerHP
          : (cd.amount >= 10 ? 0.25 : 0.5);
        if (player.hp < player.maxHp * threshold) {
          player.heal(cd.amount);
          return true;
        }
        return false;
      }
      case 'maxhp': {
        // Dragon Heart: immediately on first active frame
        player.maxHp += cd.amount;
        player.hp = player.maxHp;
        return true;
      }
      case 'speed': {
        const threshold = cd.autoTriggerHP !== undefined ? cd.autoTriggerHP : 0.4;
        if (player.hp < player.maxHp * threshold) {
          player.applySpeedBoost(cd.duration);
          return true;
        }
        return false;
      }
      case 'explode': {
        // Bomb: nearest enemy within 60px — START WINDUP
        let nearestDist = Infinity;
        for (const enemy of enemies) {
          const dx = (enemy.position.x + 20) - (player.position.x + 20);
          const dy = (enemy.position.y + 20) - (player.position.y + 20);
          nearestDist = Math.min(nearestDist, Math.sqrt(dx * dx + dy * dy));
        }
        if (nearestDist <= 60) {
          return { windup: 1.5, effectType: 'explode' };
        }
        return false;
      }
      case 'curse': {
        // Cursed Skull: 3+ enemies within 80px — START WINDUP
        const px = player.position.x + 20;
        const py = player.position.y + 20;
        let nearbyCount = 0;
        for (const enemy of enemies) {
          const dx = (enemy.position.x + 20) - px;
          const dy = (enemy.position.y + 20) - py;
          if (Math.sqrt(dx * dx + dy * dy) <= 80) nearbyCount++;
        }
        if (nearbyCount >= 3) {
          return { windup: 1.2, effectType: 'curse' };
        }
        return false;
      }
      case 'luck': {
        // Lucky Coin: immediately
        player.applyLuck(cd.duration);
        return true;
      }
      case 'block': {
        // Metal Block: HP < 50%
        if (player.hp < player.maxHp * 0.5) {
          player.applyBlockBoost(8, 5);
          return true;
        }
        return false;
      }
      case 'slow': {
        // Slime Ball: nearest enemy within 50px — START WINDUP
        const px = player.position.x + 20;
        const py = player.position.y + 20;
        let nearestDist = Infinity;
        for (const enemy of enemies) {
          const dx = (enemy.position.x + 20) - px;
          const dy = (enemy.position.y + 20) - py;
          nearestDist = Math.min(nearestDist, Math.sqrt(dx * dx + dy * dy));
        }
        if (nearestDist <= 50) {
          return { windup: 0.8, effectType: 'slow' };
        }
        return false;
      }
      case 'poison': {
        // Poison Flask: nearest enemy within 55px — START WINDUP
        const px = player.position.x + 20;
        const py = player.position.y + 20;
        let nearestDist = Infinity;
        for (const enemy of enemies) {
          const dx = (enemy.position.x + 20) - px;
          const dy = (enemy.position.y + 20) - py;
          nearestDist = Math.min(nearestDist, Math.sqrt(dx * dx + dy * dy));
        }
        if (nearestDist <= 55) {
          return { windup: 1.0, effectType: 'poison' };
        }
        return false;
      }
      case 'cleanse': {
        // Tonic: player has burn or wet
        if (player.burnDuration > 0 || player.wetDuration > 0) {
          player.burnDuration = 0;
          player.wetDuration = 0;
          return true;
        }
        return false;
      }
      case 'invuln': {
        // Smoke Bomb: HP < 25%
        if (player.hp < player.maxHp * 0.25) {
          const duration = cd.duration || 3.5;
          player.invulnerabilityTimer = Math.max(player.invulnerabilityTimer, duration);

          // Create smoke cloud
          if (!steamClouds) steamClouds = [];
          steamClouds.push({
            x: player.position.x + 20,
            y: player.position.y + 20,
            radius: 20 * 3.5, // GRID.CELL_SIZE * 3.5
            timer: duration
          });

          return true;
        }
        return false;
      }
      case 'venomcloud': {
        // Venom Vial: 2+ enemies within 60px — START WINDUP
        const px = player.position.x + 20;
        const py = player.position.y + 20;
        let nearbyCount = 0;
        for (const enemy of enemies) {
          const dx = (enemy.position.x + 20) - px;
          const dy = (enemy.position.y + 20) - py;
          if (Math.sqrt(dx * dx + dy * dy) <= 60) nearbyCount++;
        }
        if (nearbyCount >= 2) {
          return { windup: 1.0, effectType: 'venomcloud' };
        }
        return false;
      }
      case 'jolt': {
        // Jolt Jar: 2+ enemies in room — START WINDUP
        if (enemies.length >= 2) {
          return { windup: 1.3, effectType: 'jolt' };
        }
        return false;
      }
      case 'shield': {
        // Activates immediately — grants bullet-blocking charges
        if (player.shieldMaxCharges === 0) {
          player.shieldCharges = cd.charges || 3;
          player.shieldMaxCharges = cd.charges || 3;
          player.shieldCooldownMax = cd.rechargeCooldown || 5;
          player.shieldCooldown = 0;
          player.shieldBlocksAll = false;
          return true;
        }
        return false;
      }
      case 'bulwark': {
        // Activates immediately — grants all-hit-blocking charges
        if (player.shieldMaxCharges === 0) {
          player.shieldCharges = cd.charges || 2;
          player.shieldMaxCharges = cd.charges || 2;
          player.shieldCooldownMax = cd.rechargeCooldown || 8;
          player.shieldCooldown = 0;
          player.shieldBlocksAll = true;
          return true;
        }
        return false;
      }
      case 'waterImmunity': {
        // Rubber Boots: always activates immediately
        player.waterImmunityTimer = cd.duration;
        return true;
      }
      case 'throwSteam': {
        // Steam Vial: creates a steam cloud — START WINDUP
        return { windup: 0.6, effectType: 'throwSteam' };
      }
      case 'firecracker': {
        const px = player.position.x + 20, py = player.position.y + 20;
        for (const enemy of enemies) {
          const dx = (enemy.position.x + 20) - px, dy = (enemy.position.y + 20) - py;
          if (Math.sqrt(dx * dx + dy * dy) <= 50) return { windup: 0.5, effectType: 'firecracker' };
        }
        return false;
      }
      case 'stoneskin': {
        const px = player.position.x + 20, py = player.position.y + 20;
        let nearbyCount = 0;
        for (const enemy of enemies) {
          const dx = (enemy.position.x + 20) - px, dy = (enemy.position.y + 20) - py;
          if (Math.sqrt(dx * dx + dy * dy) <= 80) nearbyCount++;
        }
        if (player.hp < player.maxHp * (cd.autoTrigger?.criticalHP ?? 0.35) || nearbyCount >= (cd.autoTrigger?.nearbyEnemies ?? 2)) {
          player.applyStoneSkin(cd.duration || 10, cd.defenseBonus || 3);
          return true;
        }
        return false;
      }
      case 'regen': {
        const threshold = cd.autoTriggerHP ?? 0.50;
        if (player.hp < player.maxHp * threshold) {
          player.applyRegen(cd.duration || 5, cd.regenAmount || 1, cd.regenInterval || 1.0);
          return true;
        }
        return false;
      }
      case 'damageBuff': {
        if (cd.duration && !cd.passive) {
          const px = player.position.x + 20, py = player.position.y + 20;
          for (const enemy of enemies) {
            const dx = (enemy.position.x + 20) - px, dy = (enemy.position.y + 20) - py;
            if (Math.sqrt(dx * dx + dy * dy) <= (cd.autoTrigger?.range ?? 80)) {
              player.applyDamageBuff(cd.duration, cd.damageBonus || 2);
              return true;
            }
          }
        }
        return false;
      }
      default:
        return false;
    }
  }

  /**
   * Trigger a consumable (instant or start windup)
   * @private
   */
  _triggerConsumable(slotIndex, consumable, triggerData, player, combatSystem, particles) {
    const cd = consumable.data;

    // Check if this is a one-shot or reusable consumable
    const isShield = cd.effect === 'shield' || cd.effect === 'bulwark';
    const isOneShot = cd.oneShot === true && !isShield;

    if (triggerData && triggerData.windup) {
      // Start windup for offensive consumables
      this.consumableWindups.push({
        consumable: consumable,
        slotIndex: slotIndex,
        timer: triggerData.windup,
        maxTimer: triggerData.windup,
        effectType: triggerData.effectType,
        x: player.position.x + 20, // GRID.CELL_SIZE / 2
        y: player.position.y + 20,
        blinkTimer: 0,
        isOneShot: isOneShot
      });

      // Handle consumption
      if (isOneShot) {
        this.spentConsumableSlots[slotIndex] = true;
        this.equippedConsumables[slotIndex] = null;
        player.equippedConsumables[slotIndex] = null;
      } else {
        this.consumableCooldowns[slotIndex] = cd.cooldown || 10;
      }
    } else {
      // Instant activation — show consumable char at 2x size above player
      combatSystem.createDamageNumber(
        consumable.char,
        player.position.x,
        player.position.y - 20 * 0.5,
        consumable.color || '#ffaa00',
        2
      );
      // Start slot blink: 4 half-cycles × 100ms = 0.4s
      this.consumableBlinkSlot = slotIndex;
      this.consumableBlinkTimer = 0.4;
      this.consumableBlinkPhase = 0.1;
      this.consumableBlinkShowBlock = true; // start with solid block

      // Import createActivationBurst dynamically - assume particles array accepts it
      // Note: This requires createActivationBurst import at top of file
      // For now, create simple particles
      const burstChars = ['+', '*', 'o', '.'];
      for (let i = 0; i < 10; i++) {
        particles.push({
          x: player.position.x + Math.random() * 40 - 20,
          y: player.position.y + Math.random() * 40 - 20,
          vx: Math.random() * 60 - 30,
          vy: Math.random() * 60 - 30,
          life: 0.5,
          maxLife: 0.5,
          char: burstChars[Math.floor(Math.random() * burstChars.length)],
          color: consumable.color || '#ffaa00'
        });
      }

      // Handle consumption
      if (isOneShot) {
        this.spentConsumableSlots[slotIndex] = true;
        this.equippedConsumables[slotIndex] = null;
        player.equippedConsumables[slotIndex] = null;
      } else {
        this.consumableCooldowns[slotIndex] = cd.cooldown || 10;
      }
    }
  }

  /**
   * Update active consumable windups
   */
  updateConsumableWindups(deltaTime, player, currentRoom, combatSystem, steamClouds, particles) {
    const enemies = currentRoom ? currentRoom.enemies : [];

    for (let i = this.consumableWindups.length - 1; i >= 0; i--) {
      const windup = this.consumableWindups[i];
      windup.timer -= deltaTime;
      windup.blinkTimer += deltaTime;

      // Windup complete — trigger effect
      if (windup.timer <= 0) {
        this._executeWindupEffect(windup, enemies, combatSystem, steamClouds, particles);
        this.consumableWindups.splice(i, 1);
      }
    }
  }

  /**
   * Execute windup effect when timer completes
   * @private
   */
  _executeWindupEffect(windup, enemies, combatSystem, steamClouds, particles) {
    const cd = windup.consumable.data;
    const px = windup.x;
    const py = windup.y;

    // Execute effect based on type
    switch (windup.effectType) {
      case 'explode': {
        // Bomb explosion
        const aoeRadius = cd.radius * 2;
        for (const enemy of enemies) {
          const dx = (enemy.position.x + 20) - px;
          const dy = (enemy.position.y + 20) - py;
          if (Math.sqrt(dx * dx + dy * dy) <= aoeRadius) {
            enemy.takeDamage(cd.damage);
          }
        }
        // Explosion particles
        this._createExplosion(particles, px, py, 20, windup.consumable.color || '#ff4400');
        break;
      }
      case 'curse': {
        // Cursed Skull damage
        for (const enemy of enemies) {
          const dx = (enemy.position.x + 20) - px;
          const dy = (enemy.position.y + 20) - py;
          if (Math.sqrt(dx * dx + dy * dy) <= cd.radius) {
            enemy.takeDamage(cd.damage);
            combatSystem.createDamageNumber(cd.damage, enemy.position.x, enemy.position.y, '#ffffff');
          }
        }
        this._createExplosion(particles, px, py, 25, '#9900ff');
        break;
      }
      case 'slow': {
        // Slime Ball - apply freeze effect
        for (const enemy of enemies) {
          const dx = (enemy.position.x + 20) - px;
          const dy = (enemy.position.y + 20) - py;
          if (Math.sqrt(dx * dx + dy * dy) <= 50) {
            enemy.applyStatusEffect('freeze', cd.duration || 10);
            combatSystem.createDamageNumber('~', enemy.position.x, enemy.position.y, '#00ff00');
          }
        }
        this._createExplosion(particles, px, py, 15, '#00ff00');
        break;
      }
      case 'poison': {
        // Poison Flask - apply poison
        for (const enemy of enemies) {
          const dx = (enemy.position.x + 20) - px;
          const dy = (enemy.position.y + 20) - py;
          if (Math.sqrt(dx * dx + dy * dy) <= 55) {
            enemy.applyStatusEffect('poison', 8);
            combatSystem.createDamageNumber('☠', enemy.position.x, enemy.position.y, '#44ff44');
          }
        }
        this._createExplosion(particles, px, py, 18, '#44ff44');
        break;
      }
      case 'venomcloud': {
        // Venom Vial - damage + poison + slow
        for (const enemy of enemies) {
          const dx = (enemy.position.x + 20) - px;
          const dy = (enemy.position.y + 20) - py;
          if (Math.sqrt(dx * dx + dy * dy) <= 60) {
            enemy.takeDamage(3);
            enemy.applyStatusEffect('poison', 8);
            enemy.applyStatusEffect('freeze', 5);
            combatSystem.createDamageNumber(3, enemy.position.x, enemy.position.y, '#00ff44');
          }
        }
        this._createExplosion(particles, px, py, 22, '#00ff44');
        break;
      }
      case 'jolt': {
        // Jolt Jar — damages all enemies
        for (const enemy of enemies) {
          enemy.takeDamage(4);
          combatSystem.createDamageNumber(4, enemy.position.x, enemy.position.y, '#ffff00');
        }
        this._createExplosion(particles, px, py, 30, '#ffff00');
        break;
      }
      case 'firecracker': {
        const burnRadius = windup.consumable?.data?.radius || 40;
        for (const enemy of enemies) {
          const dx = (enemy.position.x + 20) - px, dy = (enemy.position.y + 20) - py;
          if (Math.sqrt(dx * dx + dy * dy) <= burnRadius) {
            enemy.applyStatusEffect('burn', 3.0);
          }
        }
        this._createSparkBurst(particles, px, py);
        break;
      }
      case 'throwSteam': {
        // Steam Vial
        if (!steamClouds) steamClouds = [];
        steamClouds.push({
          x: px,
          y: py,
          radius: cd.radius || 20 * 4, // GRID.CELL_SIZE * 4
          timer: cd.duration || 8.0
        });
        this._createExplosion(particles, px, py, 25, '#aaaaaa');
        break;
      }
    }

    // Blink HUD slot
    this.consumableBlinkSlot = windup.slotIndex;
    this.consumableBlinkTimer = 0.4;
    this.consumableBlinkPhase = 0.1;
    this.consumableBlinkShowBlock = true;

    // Handle consumption based on one-shot vs reusable
    if (!windup.isOneShot) {
      this.consumableCooldowns[windup.slotIndex] = cd.cooldown || 10;
    }
  }

  /**
   * Create simple explosion particles
   * @private
   */
  _createExplosion(particles, x, y, count, color) {
    const chars = ['*', '+', 'x', '.', 'o'];
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 50 + Math.random() * 50;
      particles.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.5 + Math.random() * 0.5,
        maxLife: 1.0,
        char: chars[Math.floor(Math.random() * chars.length)],
        color: color
      });
    }
  }

  /**
   * Create spark burst particles for firecracker effect
   * @private
   */
  _createSparkBurst(particles, x, y) {
    for (let i = 0; i < 12; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 80 + Math.random() * 120;
      particles.push({
        x: x + (Math.random() - 0.5) * 8,
        y: y + (Math.random() - 0.5) * 8,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.2 + Math.random() * 0.2,
        maxLife: 0.4,
        char: Math.random() < 0.5 ? '*' : '.',
        color: Math.random() < 0.6 ? '#ff8800' : '#ffff00'
      });
    }
  }

  // ========== DEATH & BANKING MECHANICS ==========

  /**
   * Bank loot when returning from EXPLORE to REST
   * Transfers player inventory (ingredients) to the active character's REST inventory
   * Saves quick slots and active slot index for the active character
   *
   * @param {Array} playerInventory - Player's inventory (ingredients)
   * @param {Array} playerQuickSlots - Player's quick slots (weapons)
   * @param {number} playerActiveSlotIndex - Active slot index
   */
  bankLoot(playerInventory, playerQuickSlots, playerActiveSlotIndex) {
    // ADD collected ingredients to active character's REST inventory
    // Note: restInventory points to the active character's inventory
    this.restInventory.push(...playerInventory);

    // Save quick slots and active index to active character
    this.restQuickSlots.length = 0;
    this.restQuickSlots.push(...playerQuickSlots);
    this.restActiveSlotIndex = playerActiveSlotIndex;
  }

  /**
   * Handle full game over (death in EXPLORE)
   * Clears ALL inventories including ALL character REST inventories
   * This is the "true roguelike" full reset
   */
  handleGameOver() {
    // Clear ALL character inventories (true roguelike reset)
    this.clearAllCharacterInventories();

    // Clear shared inventories and equipment
    this.itemChest = [];
    this.armorInventory = [];
    this.consumableInventory = [];
    this.equippedArmor = null;
    this.equippedConsumables = [null, null];

    // Clear consumable state and reset unlocked slots
    this.maxConsumableSlots = 2;
    this.spentConsumableSlots = [false, false];
    this.consumableCooldowns = [0, 0];
    this.consumableFlashTimer = 0;
    this.consumableFlashSlot = -1;
    this.consumableBlinkSlot = -1;
    this.consumableBlinkTimer = 0;
    this.consumableBlinkPhase = 0;
    this.consumableBlinkShowBlock = false;
    this.consumableWindups = [];

    // Clear saved EXPLORE room
    this.clearSavedExploreRoom();

    // Clear saved REST ingredients
    this.clearSavedRestIngredients();
  }

  /**
   * Save EXPLORE room state before returning to REST
   * Prevents room cycling cheat
   *
   * @param {Object} currentRoom - Current room object
   * @param {Array} items - Items array
   * @param {Array} ingredients - Ingredients array
   * @param {Array} placedTraps - Placed traps array
   * @param {Array} enemies - Enemies array (optional)
   * @param {Array} backgroundObjects - Background objects array (optional)
   * @param {Array} captives - Captives array (optional)
   */
  saveExploreRoom(currentRoom, items, ingredients, placedTraps, enemies = [], backgroundObjects = [], captives = []) {
    this.savedExploreRoom = currentRoom;
    this.savedExploreItems = [...items];
    this.savedExploreIngredients = [...ingredients];
    this.savedExplorePlacedTraps = [...placedTraps];
    this.savedExploreEnemies = [...enemies];
    this.savedExploreBackgroundObjects = [...backgroundObjects];
    this.savedExploreCaptives = [...captives];
  }

  /**
   * Get saved EXPLORE room data for restoration
   * Returns null if no saved room
   *
   * @returns {Object|null} - { room, items, ingredients, placedTraps, enemies, backgroundObjects, captives }
   */
  getSavedExploreRoomData() {
    if (!this.savedExploreRoom) return null;

    return {
      room: this.savedExploreRoom,
      items: [...this.savedExploreItems],
      ingredients: [...this.savedExploreIngredients],
      placedTraps: [...this.savedExplorePlacedTraps],
      enemies: [...this.savedExploreEnemies],
      backgroundObjects: [...this.savedExploreBackgroundObjects],
      captives: [...this.savedExploreCaptives]
    };
  }

  /**
   * Clear saved EXPLORE room (called when generating new room or on death)
   */
  clearSavedExploreRoom() {
    this.savedExploreRoom = null;
    this.savedExploreItems = [];
    this.savedExploreIngredients = [];
    this.savedExplorePlacedTraps = [];
    this.savedExploreEnemies = [];
    this.savedExploreBackgroundObjects = [];
    this.savedExploreCaptives = [];
  }

  // ========== REST MODE PERSISTENCE ==========

  /**
   * Save REST mode ground ingredients when leaving for EXPLORE
   *
   * @param {Array} ingredients - Ingredients array from REST mode
   */
  saveRestIngredients(ingredients) {
    this.savedRestIngredients = [...ingredients];
  }

  /**
   * Get saved REST ingredients for restoration
   *
   * @returns {Array} - Copy of saved REST ingredients
   */
  getSavedRestIngredients() {
    return [...this.savedRestIngredients];
  }

  /**
   * Clear saved REST ingredients (called on game over)
   */
  clearSavedRestIngredients() {
    this.savedRestIngredients = [];
  }

  // ========== CHEST SYSTEM ==========

  /**
   * Add item to chest storage
   *
   * @param {Item} item - Weapon/trap item to store
   */
  addToChest(item) {
    this.itemChest.push(item);
  }

  /**
   * Remove item from chest storage
   *
   * @param {Item} item - Item to remove from chest
   * @returns {boolean} - True if item was found and removed
   */
  retrieveFromChest(item) {
    const chestIndex = this.itemChest.indexOf(item);
    if (chestIndex > -1) {
      this.itemChest.splice(chestIndex, 1);
      return true;
    }
    return false;
  }

  /**
   * Get chest contents formatted for menu display
   *
   * @returns {Array} - Menu options array
   */
  getChestContents() {
    const menuOptions = [];
    for (const item of this.itemChest) {
      menuOptions.push({ action: 'retrieve', item: item, label: `${item.char} - ${item.data.name}` });
    }
    return menuOptions;
  }
}
