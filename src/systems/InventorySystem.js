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

import { inSamePlane } from './PlaneSystem.js';
import { Item } from '../entities/Item.js';
import { GRID } from '../game/GameConfig.js';
import { addItemToChestArray, removeItemFromChestArray, chestEntryLabel, trapAlreadyEquipped } from './TrapSystem.js';
import { makeAuraParticle } from './WorldEffectsSystem.js';

export class InventorySystem {
  constructor() {
    // SHARED banked ingredients (one pile for all characters — ingredients have
    // no character affinity, so there's no situation where per-character
    // partitioning makes sense). Persists through death; cleared on game over.
    this.restInventory = [];

    // Coins are passive: never enter restInventory or player.inventory. Picked
    // up directly into this wallet, spendable from anywhere (well, NPC, crafting).
    // Persists through banking and death; cleared only on full game over.
    this.coinWallet = 0;

    // PER-CHARACTER REST loadout (quick slots + active slot + mana state).
    // Quick slots stay per-character because each character runs their own
    // weapon loadout.
    this.characterInventories = {
      'default': {
        quickSlots: [null, null, null],  // Weapons only
        activeSlotIndex: 0,   // Persistent active slot index
        manaState: null,      // { slots, current, max } — survives character swaps
        trainedWeapons: {}    // { [weaponCategory]: true } — Weapons Master training, per character
      }
    };

    // Legacy properties - maintained for backward compatibility with existing code
    // These point to the active character's data
    this.restQuickSlots = this.characterInventories['default'].quickSlots;
    this.restActiveSlotIndex = this.characterInventories['default'].activeSlotIndex;

    // Track which character is currently active so bankLoot() can write the
    // activeSlotIndex back to the correct characterInventories entry.
    this._activeCharacterType = 'default';

    this.itemChest = []; // Storage for weapons (shared across all characters)

    // Weapons displaced during EXPLORE pickup buffer here, not in itemChest.
    // Flushed to itemChest by bankLoot() on safe REST return. Discarded on
    // character/run death so EXPLORE-picked-up weapons don't survive a wipe.
    this.pendingChestDeposits = [];

    // EXPLORE inventory (lost on death)
    this.armorInventory = []; // All collected armor
    this.consumableInventory = []; // All collected consumables

    // Equipment slots (lost on death)
    this.equippedArmor = null; // Single armor slot
    this.equippedConsumables = [null]; // 1 consumable slot to start (can expand to 5)
    this.maxConsumableSlots = 1; // Unlockable up to 5; resets on death

    // Consumable HUD feedback state
    this.spentConsumableSlots = [false]; // tracks ONE-SHOT used slots this run
    this.consumableCooldowns = [0]; // cooldown timers for reusable consumables
    this.consumableFlashTimer = 0; // HUD flash duration in seconds (kept for compat)
    this.consumableFlashSlot = -1; // which slot is flashing (-1 = none)
    // Blink animation: alternates solid block ↔ normal char
    this.consumableBlinkSlot = -1;   // slot index being blinked (-1 = none)
    this.consumableBlinkTimer = 0;   // total remaining blink duration
    this.consumableBlinkPhase = 0;   // sub-timer within current half-cycle
    this.consumableBlinkShowBlock = false; // true = show '█', false = show normal char
    this.activeEffectTimers = [0, 0, 0, 0, 0]; // per-slot countdown while effect is active

    // Consumable windup system — every consumable use throws the item into
    // the air before its effect resolves on landing.
    this.consumableWindups = []; // { consumable, slotIndex, timer, maxTimer, x, y }

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

  // ─── Coin wallet ──────────────────────────────────────────────────────────
  addCoin(n = 1) { this.coinWallet += n; }
  removeCoin(n = 1) {
    if (this.coinWallet < n) return false;
    this.coinWallet -= n;
    return true;
  }
  hasCoin(n = 1) { return this.coinWallet >= n; }
  getCoinCount() { return this.coinWallet; }

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

  // First equippedConsumables index that's both unoccupied AND not claimed by
  // the magic meter (magicMeter.slots reserves indices for mana but never
  // writes a non-null value there, so a naive null-check reads them as free).
  firstFreeConsumableSlot(player) {
    const reserved = player?.magicMeter?.active ? (player.magicMeter.slots || []) : [];
    return this.equippedConsumables.findIndex((s, idx) => s === null && !reserved.includes(idx));
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
        quickSlots: [null, null, null],
        activeSlotIndex: 0,
        manaState: null,
        trainedWeapons: {}
      };
    }

    // Update legacy property pointers to active character's data.
    // restInventory (ingredients) is shared across characters and not touched here.
    this.restQuickSlots = this.characterInventories[characterType].quickSlots;
    this.restActiveSlotIndex = this.characterInventories[characterType].activeSlotIndex;
    this._activeCharacterType = characterType;
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
        quickSlots: [null, null, null],
        activeSlotIndex: 0,
        manaState: null,
        trainedWeapons: {}
      }
    };

    // Clear shared ingredients pile (in-place so external references stay valid).
    this.restInventory.length = 0;

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
   * @param {boolean} allowSlotChoice - When true, a weapon/trap pickup with all
   *   usable quick slots full returns { needsSlotChoice, pendingItem } instead
   *   of auto-displacing the active slot (caller opens SlotReplacementSystem)
   * @param {number} selectedWeaponSlotIdx - Currently selected weapon slot (0-2)
   * @returns {Object} - { success: boolean, droppedItem: Item|null, message: string|null, removedTrap: boolean }
   */
  tryPickupItem(items, placedTraps, player, physicsSystem, allowSlotChoice = false, _unused = 0, selectedWeaponSlotIdx = 0, renderer = null) {
    // NOTE: Placed traps (activated with SPACE) are NOT pickable - they're active traps
    // Only dropped traps (swapped from quick slots) in the items array can be picked up

    // Check ground items
    const now = performance.now();
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!inSamePlane(player, item)) continue; // Cross-plane items are unreachable
      if (item.pickupReadyAt && item.pickupReadyAt > now) continue; // Recently swapped — wait
      const distance = physicsSystem.getDistance(player, item);

      if (distance < 20) {
        let droppedItem = null;
        let customMessage = null;

        // Route items to correct inventory based on type
        if (item.data.type === 'ARMOR') {
          if (allowSlotChoice && this.equippedArmor !== null) return { success: false, needsSlotChoice: true, slotType: 'armor', pendingItem: item, droppedItem: null, message: null, removedTrap: false };
          this.armorInventory.push(item);
          this.equipArmor(item);
          this.applyEquipmentEffectsToPlayer(player);
          physicsSystem.removeEntity(item);
          items.splice(i, 1);
        } else if (item.data.type === 'CONSUMABLE') {
          if (allowSlotChoice) {
            const emptySlot = this.firstFreeConsumableSlot(player);
            if (emptySlot === -1) return { success: false, needsSlotChoice: true, slotType: 'consumable', pendingItem: item, droppedItem: null, message: null, removedTrap: false };
            this.consumableInventory.push(item);
            this.equipConsumable(emptySlot, item);
          } else this.consumableInventory.push(item);
          physicsSystem.removeEntity(item);
          items.splice(i, 1);
        } else if (item.data.type === 'WEAPON' || item.data.type === 'TRAP') {
          // Already-equipped trap stacks into held count; skip slot-choice.
          if (trapAlreadyEquipped(player, item)) {
            physicsSystem.removeEntity(item);
            items.splice(i, 1);
            return { success: true, droppedItem: item, message: item.data.name, removedTrap: false, pickedUpType: item.data.type };
          }
          // Full quick slots: don't silently displace the loadout — signal the
          // caller to open the paused slot-choice prompt (SlotReplacementSystem).
          // The item stays on the ground until the player confirms a destination.
          if (allowSlotChoice) {
            const hasEmptyUsable = player.quickSlots.some(
              (slot, idx) => slot === null && !player.destroyedSlots?.[idx]
            );
            const anyUsable = player.quickSlots.some((_, idx) => !player.destroyedSlots?.[idx]);
            if (!hasEmptyUsable && anyUsable) {
              return {
                success: false,
                needsSlotChoice: true,
                pendingItem: item,
                droppedItem: null,
                message: null,
                removedTrap: false
              };
            }
          }
          // Add to quick slots (weapons and traps)
          droppedItem = player.pickupItem(item, selectedWeaponSlotIdx);
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

        // REST equipment slots draw glyphs to the background layer, which only
        // clears on a dirty mark — without this, the empty slot's number
        // placeholder lingers under the newly-picked-up item's glyph.
        renderer?.markBackgroundDirty();

        return {
          success: true,
          droppedItem: droppedItem,
          message: customMessage || item.data.name,
          removedTrap: false,
          pickedUpType: item.data.type
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
    this.activeEffectTimers.push(0);
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
    if (slotIndex >= this.maxConsumableSlots) return null;

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
    player.meleeResist = 0;
    player.dodgeChance = 0;
    player.fireImmune = false;
    player.freezeImmune = false;
    player.poisonImmune = false;
    player.slimeImmune = false;
    player.reflectDamage = 0;
    player.smokeOnHit = false;
    player.speedBoost = 0;
    player.speedPenalty = 0;
    player.slowEnemies = false;
    player.burnResist = 0;
    player.massBonus = 0;
    player.rollCooldownMult = 1.15;
    player.extraIframes = 0;
    player.gooConsume = false;
    player.bladeKillHeal = false;
    player.batTransform = false;
    player.whirlwindCape = false;
    player.sharkMask = false;
    player.coralCrown = false;
    player.stingrayMantle = false;

    // Apply equipped armor properties
    if (this.equippedArmor) {
      const a = this.equippedArmor.data;
      player.defense = a.defense || 0;
      player.bulletResist = a.bulletResist || 0;
      player.meleeResist = a.meleeResist || 0;
      player.dodgeChance = a.dodgeChance || 0;
      player.fireImmune = a.fireImmune || false;
      player.freezeImmune = a.freezeImmune || false;
      player.poisonImmune = a.poisonImmune || false;
      player.slimeImmune = a.slimeImmune || false;
      player.reflectDamage = a.reflectDamage || 0;
      player.smokeOnHit = a.smokeOnHit || false;
      player.speedBoost = a.speedBoost || 0;
      player.speedPenalty = a.speedPenalty || 0;
      player.slowEnemies = a.slowEnemies || false;
      player.burnResist = a.burnResist || 0;
      player.massBonus = a.massBonus || 0;
      player.rollCooldownMult = a.rollCooldownMult || 1.15;
      player.extraIframes = a.extraIframes || 0;
      player.gooConsume = a.gooConsume || false;
      player.bladeKillHeal = a.bladeKillHeal || false;
      player.batTransform = a.batTransform || false;
      player.whirlwindCape = a.whirlwindCape || false;
      player.sharkMask = a.sharkMask || false;
      player.coralCrown = a.coralCrown || false;
      player.stingrayMantle = a.stingrayMantle || false;
    }

    player.mass = 1 + player.massBonus; // base mass + massBonus, read by PhysicsSystem

    // Add temporary block boost from Metal Block consumable
    if (player.blockBoostTimer > 0) {
      player.defense += player.blockBoostAmount;
    }

    // Apply passive consumable bonuses (Lucky Coin). luckBlessed (well ritual) is separate, untouched here.
    player.luckActive = false;
    player.critChance = 0;
    player.luckDodgeBonus = 0;
    player.fireBerryLit = false;
    this.equippedConsumables.forEach((slot, idx) => {
      const cd = slot?.data;
      if (!cd) return;
      if (cd.luckPassive) {
        player.luckActive = true;
        player.critChance = Math.max(player.critChance, cd.critChance || 0);
        player.luckDodgeBonus = Math.max(player.luckDodgeBonus, cd.dodgeBonus || 0);
      }
      // Fire Berry: passive torch-light while equipped and unspent. Consuming
      // it (SPACE) empties the slot, which naturally stops the light.
      if (cd.fireBerryLight && !this.spentConsumableSlots[idx]) {
        player.fireBerryLit = true;
      }
    });

    // Store equipped consumables for condition checking during gameplay
    player.equippedConsumables = [...this.equippedConsumables];
  }

  // ========== CONSUMABLE AUTO-TRIGGER SYSTEM ==========

  /**
   * Apply a permanent blessing buff (Leshy Grove) to the player, track it in
   * the caller's blessingsCollected array, and return the pickup message.
   *
   * @param {Player} player - Player entity to buff
   * @param {Item} blessingItem - Blessing item picked up
   * @param {Array} blessingsCollected - Caller's collected-blessing tracker
   * @returns {string|null} Pickup message, or null for an unknown effect type
   */
  applyBlessing(player, blessingItem, blessingsCollected) {
    const blessing = blessingItem.data;
    blessingsCollected.push(blessing.char);

    switch (blessing.effect.type) {
      case 'damageBuff':
        player.damageBuff = (player.damageBuff || 0) + blessing.effect.value;
        return `${blessing.name} (+${blessing.effect.value} damage)`;

      case 'hpBuff':
        player.maxHp += blessing.effect.value;
        player.hp = Math.min(player.hp + blessing.effect.value, player.maxHp); // Heal to new max
        return `${blessing.name} (+${blessing.effect.value} HP)`;

      case 'speedBuff':
        player.speed += blessing.effect.value;
        return `${blessing.name} (+${blessing.effect.value} speed)`;

      default:
        console.warn(`[Blessing] Unknown effect type: ${blessing.effect.type}`);
        return null;
    }
  }

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
    this.checkConsumableActivation(player, currentRoom);

    // Update active windups
    this.updateConsumableWindups(deltaTime, player, currentRoom, combatSystem, steamClouds, particles);

    // Elemental robe aura: particle emission + contact status pulses
    this._updateRobeAura(deltaTime, player, currentRoom, particles);
  }

  _updateRobeAura(deltaTime, player, currentRoom, particles) {
    const armorData = this.equippedArmor?.data;
    const auraType = armorData?.particleAura;
    if (!auraType) return;

    const cx = player.position.x + 8;
    const cy = player.position.y + 8;

    // Ambient particle emission — only while charge is available (or for non-pulse robes)
    const chargeSpent = armorData.rollPulse && player._auraRollPulseUsed;
    if (!chargeSpent) {
      player._auraParticleTimer = (player._auraParticleTimer || 0) + deltaTime;
      const emitInterval = auraType === 'shock' ? 0.07 : auraType === 'shadow' ? 0.12 : 0.10;
      if (player._auraParticleTimer >= emitInterval) {
        player._auraParticleTimer = 0;
        const p = makeAuraParticle(cx, cy, auraType);
        if (p) particles.push(p);
      }
    }

    // Roll pulse: triggers on the first frame of a dodge roll, once per room
    if (!armorData.rollPulse || !currentRoom?.enemies) return;

    const isRolling = player.dodgeRoll.active;
    const rollJustStarted = isRolling && !player._lastAuraDodgeActive;

    if (rollJustStarted && !player._auraRollPulseUsed) {
      player._auraRollPulseUsed = true;

      const radius = (armorData.rollPulseRadius || 3) * 16;
      const duration = armorData.rollPulseDuration || 2.0;

      for (const enemy of currentRoom.enemies) {
        if (enemy.hp <= 0) continue;
        if (Math.hypot(enemy.position.x + 8 - cx, enemy.position.y + 8 - cy) <= radius) {
          enemy.applyStatusEffect(armorData.rollPulse, duration);
        }
      }

      // Radial blast — particles spread outward in all directions
      const blastCount = 20;
      for (let i = 0; i < blastCount; i++) {
        const angle = (i / blastCount) * Math.PI * 2;
        const speed = 80 + Math.random() * 80;
        const p = makeAuraParticle(cx, cy, auraType);
        if (p) {
          p.vx = Math.cos(angle) * speed;
          p.vy = Math.sin(angle) * speed;
          p.life = 0.4 + Math.random() * 0.3;
          p.maxLife = p.life;
          particles.push(p);
        }
      }
    }

    player._lastAuraDodgeActive = isRolling;
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

    // Tick active-effect timers (drive slow blink in top bar while effect lasts)
    let anyActive = false;
    for (let i = 0; i < this.activeEffectTimers.length; i++) {
      if (this.activeEffectTimers[i] > 0) {
        this.activeEffectTimers[i] = Math.max(0, this.activeEffectTimers[i] - deltaTime);
        anyActive = true;
      }
    }
    return anyActive;
  }

  /**
   * Check if equipped consumables should activate based on conditions
   */
  checkConsumableActivation(player, currentRoom) {
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

      // Oils are passive augments — they apply to bow/dagger attacks via Item.js
      // and never auto-trigger on their own.
      if (cd.oilEffect) continue;

      // Tactical items (proximity/count-gated) auto-trigger is for emergencies
      // only; manualOnly items only fire via ConsumableTriggerSystem.manualTrigger (SPACE).
      if (cd.manualOnly) continue;

      // Check trigger condition based on effect type
      shouldTrigger = this.game.consumableTriggerSystem.checkTriggerCondition(cd, player, currentRoom, consumable);
      if (shouldTrigger && shouldTrigger.windup) {
        triggerData = shouldTrigger;
        shouldTrigger = true;
      }

      if (shouldTrigger) {
        this._triggerConsumable(i, consumable, triggerData, player);
      }
    }
  }

  /**
   * Trigger a consumable (instant or start windup)
   * @private
   */
  // Replace a consumable slot with another item (used by leavesBottle path
  // when a magic potion is consumed, and by external systems like the
  // FountainSystem fairy-bottle conversion). Writes to both InventorySystem
  // and player slot arrays so the UI stays in sync.
  replaceConsumableSlot(slotIndex, newChar) {
    if (slotIndex < 0 || slotIndex >= this.equippedConsumables.length) return false;
    const replacement = new Item(newChar, 0, 0);
    this.equippedConsumables[slotIndex] = replacement;
    if (this.game?.player?.equippedConsumables) {
      this.game.player.equippedConsumables[slotIndex] = replacement;
    }
    // Slot is no longer spent — the replacement is a fresh item the player
    // can equip/use normally.
    if (this.spentConsumableSlots) this.spentConsumableSlots[slotIndex] = false;
    return true;
  }

  // Centralized slot-consumption for one-shot consumables. Honors leavesBottle:
  // magic potions tagged with leavesBottle: true convert the spent slot to an
  // Empty Bottle ('B') instead of clearing to null. Sources: magic-potion
  // residue (per design: any "potion such as haste draught").
  _consumeOneShotSlot(slotIndex, consumable, player) {
    const leavesBottle = consumable?.data?.leavesBottle === true;
    if (leavesBottle) {
      const bottle = new Item('B', 0, 0);
      this.equippedConsumables[slotIndex] = bottle;
      if (player.equippedConsumables) player.equippedConsumables[slotIndex] = bottle;
      // Not spent — bottle is a real item in the slot
      this.spentConsumableSlots[slotIndex] = false;
    } else {
      this.spentConsumableSlots[slotIndex] = true;
      this.equippedConsumables[slotIndex] = null;
      player.equippedConsumables[slotIndex] = null;
    }
  }

  _triggerConsumable(slotIndex, consumable, triggerData, player) {
    const cd = consumable.data;

    // Check if this is a one-shot or reusable consumable
    const isShield = cd.effect === 'shield' || cd.effect === 'bulwark';
    const isOneShot = cd.oneShot === true && !isShield;

    // Every consumable use is a throw — arc up and land before the effect
    // resolves. `triggerData.windup` is always set by checkTriggerCondition
    // when it approves a trigger (see ConsumableTriggerSystem).
    const startX = player.position.x + 20;
    const startY = player.position.y + 20;
    this.consumableWindups.push({
      consumable: consumable,
      slotIndex: slotIndex,
      timer: triggerData.windup,
      maxTimer: triggerData.windup,
      effectType: triggerData.effectType,
      x: startX,
      y: startY,
      startX,
      startY,
      targetX: triggerData.targetX ?? null,
      targetY: triggerData.targetY ?? null,
      isOneShot: isOneShot
    });

    if (isOneShot) {
      this._consumeOneShotSlot(slotIndex, consumable, player);
    } else {
      this.consumableCooldowns[slotIndex] = cd.cooldown || 10;
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

      // Jolt Jar throw arc: interpolate jar position from player to target,
      // with a small parabolic lift so it reads as a throw.
      if (windup.effectType === 'jolt' && windup.targetX != null) {
        const t = Math.min(1, Math.max(0, 1 - windup.timer / windup.maxTimer));
        windup.x = windup.startX + (windup.targetX - windup.startX) * t;
        windup.y = windup.startY + (windup.targetY - windup.startY) * t - Math.sin(t * Math.PI) * 22;
      }

      // Windup complete — trigger effect
      if (windup.timer <= 0) {
        this._executeWindupEffect(windup, player, enemies, combatSystem, steamClouds, particles);
        this.consumableWindups.splice(i, 1);
      }
    }
  }

  /**
   * Execute windup effect when timer completes
   * @private
   */
  _executeWindupEffect(windup, player, enemies, combatSystem, steamClouds, particles) {
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
        // Jolt Jar — impact AoE at the throw target (set when the jar was thrown)
        const ix = windup.targetX != null ? windup.targetX : px;
        const iy = windup.targetY != null ? windup.targetY : py;
        const radius = cd.radius || 80;
        const damage = cd.damage || 4;
        for (const enemy of enemies) {
          const ex = enemy.position.x + 20;
          const ey = enemy.position.y + 20;
          const dx = ex - ix;
          const dy = ey - iy;
          if (Math.sqrt(dx * dx + dy * dy) <= radius) {
            enemy.takeDamage(damage);
            combatSystem.createDamageNumber(damage, enemy.position.x, enemy.position.y, '#ffff00');
          }
        }
        // Spark burst at impact + four ring offsets so the AoE reads "large"
        this._createSparkBurst(particles, ix, iy);
        const ring = radius * 0.55;
        this._createSparkBurst(particles, ix + ring, iy);
        this._createSparkBurst(particles, ix - ring, iy);
        this._createSparkBurst(particles, ix, iy + ring);
        this._createSparkBurst(particles, ix, iy - ring);
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
        // Steam Vial — only push when the caller provided a valid array.
        // Rebinding the local parameter has no effect on the caller's reference.
        if (steamClouds) {
          steamClouds.push({
            x: px,
            y: py,
            radius: cd.radius || 20 * 4, // GRID.CELL_SIZE * 4
            timer: cd.duration || 8.0
          });
        }
        this._createExplosion(particles, px, py, 25, '#aaaaaa');
        break;
      }
      default: {
        // Self/AoE-around-player consumables (heal, buffs, shields, etc) —
        // ConsumableTriggerSystem owns the per-effect mutation.
        this.game.consumableTriggerSystem.applyEffect(windup, player, enemies, steamClouds);

        // Landing burst — same feedback the old instant-trigger path showed.
        const burstChars = ['+', '*', 'o', '.'];
        for (let i = 0; i < 10; i++) {
          particles.push({
            x: px + Math.random() * 40 - 20,
            y: py + Math.random() * 40 - 20,
            vx: Math.random() * 60 - 30,
            vy: Math.random() * 60 - 30,
            life: 0.5,
            maxLife: 0.5,
            char: burstChars[Math.floor(Math.random() * burstChars.length)],
            color: windup.consumable.color || '#ffaa00',
            hutPlane: !!this.game.activeFloor
          });
        }

        // Mark effect as active for the full duration (drives slow bar blink)
        if (cd.duration > 0) {
          this.activeEffectTimers[windup.slotIndex] = cd.duration;
        }
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
    const hutPlane = !!this.game.activeFloor;
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
        color: color,
        hutPlane
      });
    }
  }

  /**
   * Create spark burst particles for firecracker effect
   * @private
   */
  _createSparkBurst(particles, x, y) {
    const hutPlane = !!this.game.activeFloor;
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
        color: Math.random() < 0.6 ? '#ff8800' : '#ffff00',
        hutPlane
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
    // Clear the player-carried inventory — items are now banked. Without this,
    // re-entering REST after another EXPLORE run would double-bank everything.
    playerInventory.length = 0;

    // Save quick slots and active index to active character.
    // restQuickSlots is a live reference to the character's array, so length/push
    // writes through correctly. restActiveSlotIndex is a scalar copy, so we must
    // also write back to the canonical characterInventories entry.
    this.restQuickSlots.length = 0;
    this.restQuickSlots.push(...playerQuickSlots);
    this.restActiveSlotIndex = playerActiveSlotIndex;
    if (this._activeCharacterType && this.characterInventories[this._activeCharacterType]) {
      this.characterInventories[this._activeCharacterType].activeSlotIndex = playerActiveSlotIndex;
    }

    // Flush deferred EXPLORE chest deposits — survived the run, now banked.
    if (this.pendingChestDeposits.length > 0) {
      this.pendingChestDeposits.forEach((item) => this.addToChest(item));
      this.pendingChestDeposits.length = 0;
    }
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
    this.pendingChestDeposits = [];
    this.armorInventory = [];
    this.consumableInventory = [];
    this.coinWallet = 0;
    this.equippedArmor = null;
    this.equippedConsumables = [null];

    // Clear consumable state and reset unlocked slots
    this.maxConsumableSlots = 1;
    this.spentConsumableSlots = [false];
    this.consumableCooldowns = [0];
    this.consumableFlashTimer = 0;
    this.consumableFlashSlot = -1;
    this.consumableBlinkSlot = -1;
    this.consumableBlinkTimer = 0;
    this.consumableBlinkPhase = 0;
    this.consumableBlinkShowBlock = false;
    this.activeEffectTimers = [0, 0];
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

  // Traps merge into an existing same-char stack instead of a new chest slot.
  addToChest(item) {
    addItemToChestArray(this.itemChest, item);
  }

  // EXPLORE-time deferred deposit; flushed to itemChest by bankLoot().
  deferToChest(item) {
    addItemToChestArray(this.pendingChestDeposits, item);
  }

  // Removes one unit of `item`; returns the instance to use, or null if absent.
  retrieveFromChest(item) {
    return removeItemFromChestArray(this.itemChest, item);
  }

  getChestContents() {
    return this.itemChest.map((item) => ({ action: 'retrieve', item, label: chestEntryLabel(item) }));
  }

  // Moss Cloak 𐤒 stealth state machine. Armed by the active→inactive dodge
  // transition; becomes active when the player stops issuing WASD input.
  // Any WASD held cancels.
  updateMossCloak() {
    const game = this.game;
    const player = game.player;
    const cloakEquipped = this.equippedArmor?.data?.mossCloak === true;
    if (cloakEquipped) {
      const wasdHeld = game.keys.w || game.keys.a || game.keys.s || game.keys.d;
      if (player._lastDodgeActive && !player.dodgeRoll.active) {
        player.mossCloakArmed = true;
      }
      player._lastDodgeActive = player.dodgeRoll.active;
      if (wasdHeld || player.dodgeRoll.active) {
        player.mossCloakArmed = false;
        player.mossCloakActive = false;
      } else if (player.mossCloakArmed) {
        player.mossCloakActive = true;
      }
    } else {
      player.mossCloakArmed = false;
      player.mossCloakActive = false;
      player._lastDodgeActive = player.dodgeRoll.active;
    }
  }

  // ── Blue-zone armor world-effects ──────────────────────────────────────────
  // Per-frame EXPLORE ticks for water-interaction armor. Called from
  // updateExploreState; both bail unless the relevant piece is equipped.

  updateBlueArmorEffects(deltaTime) {
    this._updateCoralCrown();
    this._updateStingrayMantle(deltaTime);
  }

  // Coral Crown: while wearing the crown and standing on a water tile, that
  // tile becomes 'crystallized' — walkable, blocks contact slowdown, lasts 6s.
  // Tiles auto-expire via BackgroundObject.waterStateTimer.
  _updateCoralCrown() {
    const game = this.game;
    const p = game.player;
    if (!p?.coralCrown || !p.inLiquid || !game.currentRoom) return;
    const CS = GRID.CELL_SIZE;
    const px = p.position.x + CS / 2;
    const py = p.position.y + CS / 2;
    const half = CS / 2;
    for (const obj of game.currentRoom.backgroundObjects) {
      if (obj.destroyed || obj.char !== '~') continue;
      if (obj.waterState !== 'normal') continue;
      const cx = obj.position.x + half;
      const cy = obj.position.y + half;
      if (Math.abs(cx - px) < half && Math.abs(cy - py) < half) {
        obj.setWaterState('crystallized', 6.0);
        break;
      }
    }
  }

  // Stingray Mantle: moving through water leaves an electrified wake. Each
  // vacated water cell flips to 'electrified' for 4s — long enough to form a
  // visible trail behind the player and keep zapping enemies that wander in.
  // While the player is in water, ticks damage on enemies standing on any
  // electrified cell — wet enemies take 2× via the existing wet+shock
  // interaction (we apply the 2× directly here since this is the wake's own
  // damage source).
  _updateStingrayMantle(deltaTime) {
    const game = this.game;
    const p = game.player;
    if (!p?.stingrayMantle || !game.currentRoom) return;
    const CS = GRID.CELL_SIZE;
    const px = p.position.x + CS / 2;
    const py = p.position.y + CS / 2;
    const col = Math.floor(px / CS);
    const row = Math.floor(py / CS);

    if (p.inLiquid) {
      if (p._wakePrevCol === undefined) { p._wakePrevCol = col; p._wakePrevRow = row; }
      if (col !== p._wakePrevCol || row !== p._wakePrevRow) {
        const prevX = p._wakePrevCol * CS;
        const prevY = p._wakePrevRow * CS;
        for (const obj of game.currentRoom.backgroundObjects) {
          if (obj.destroyed || obj.char !== '~') continue;
          if (Math.abs(obj.position.x - prevX) < 4 && Math.abs(obj.position.y - prevY) < 4) {
            if (obj.waterState === 'normal') {
              game.electricitySystem?.seedFromArmor(obj, game.currentRoom.backgroundObjects,
                p.heldItem?.data, { tileDuration: 4.0 });
            }
            break;
          }
        }
        p._wakePrevCol = col;
        p._wakePrevRow = row;
      }
    } else {
      p._wakePrevCol = undefined;
      p._wakePrevRow = undefined;
    }

    // Damage tick — 0.25s interval
    p._wakeTickTimer = (p._wakeTickTimer || 0) - deltaTime;
    if (p._wakeTickTimer > 0) return;
    p._wakeTickTimer = 0.25;
    const half = CS / 2;
    for (const enemy of game.currentRoom.enemies) {
      if (enemy.hp <= 0) continue;
      const ex = enemy.position.x + half;
      const ey = enemy.position.y + half;
      for (const obj of game.currentRoom.backgroundObjects) {
        if (obj.destroyed || obj.char !== '~') continue;
        if (obj.waterState !== 'electrified') continue;
        const cx = obj.position.x + half;
        const cy = obj.position.y + half;
        if (Math.abs(cx - ex) < half && Math.abs(cy - ey) < half) {
          const wet = (enemy.wetDuration || 0) > 0;
          const dmg = wet ? 2 : 1;
          enemy.takeDamage(dmg);
          game.combatSystem?.createDamageNumber(dmg, enemy.position.x, enemy.position.y, wet ? '#ffff66' : '#88ddff', 1.0, 0.6);
          break;
        }
      }
    }
  }
}
