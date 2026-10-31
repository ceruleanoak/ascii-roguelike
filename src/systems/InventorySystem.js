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

import { canReachLoot } from './PlaneSystem.js';
import { Item } from '../entities/Item.js';
import { createCharacterLoadout } from './characterLoadout.js';
import { GRID } from '../game/GameConfig.js';
import { addItemToChestArray, removeItemFromChestArray, chestEntryLabel, trapAlreadyEquipped, mergeStackableConsumable as mergeStackableConsumableStack } from './TrapSystem.js';
import { saveExploreRoomState, getSavedExploreRoomState, clearSavedExploreRoomState, saveRestIngredientsState, getSavedRestIngredientsState, clearSavedRestIngredientsState } from './RoomStatePersistence.js';
import { EquipmentEffectsSystem } from './EquipmentEffectsSystem.js';
import { ConsumableWindupEffects } from './ConsumableWindupEffects.js';
import { tickConsumableFlash } from './ConsumableSlotFlash.js';
import { countItemChar, removeItemChar } from './itemCostDispatch.js';
import * as ingredientPile from './IngredientPile.js';

// Consumable slots every run starts with; boss kills and the Bat Belfry
// unlock more, up to 5 (unlockConsumableSlot).
const STARTING_CONSUMABLE_SLOTS = 2;

export class InventorySystem {
  constructor() {
    // THE ingredient pile — every raw ingredient the player is holding, in one
    // array, in every game state. One pile for all characters (ingredients have
    // no character affinity) and one pile across REST and EXPLORE.
    //
    // This used to be two arrays — a REST-side `restInventory` here and a
    // carried `player.inventory` on the entity — with a state switch picking
    // which one a given feature could see. That split had no mechanical stake
    // behind it (game over wipes both, so the stored half was never the safer
    // half) and it
    // silently halved the player's inventory for anything that read the wrong
    // one: the cauldron, the press, and the fairy fountain's treasure offering
    // all did. Everything reads this array now, and nothing else stores
    // ingredients. Do not reintroduce a second pool.
    this.ingredients = [];

    // Coins are passive: they never enter the ingredient pile. Picked up
    // directly into this wallet, spendable from anywhere (well, NPC, crafting).
    // Survives the walk home and character death; cleared only on full game over.
    this.coinWallet = 0;

    // PER-CHARACTER REST loadout (quick slots + active slot + mana state).
    // Quick slots stay per-character because each character runs their own
    // weapon loadout.
    this.characterInventories = {
      'default': createCharacterLoadout('default')
    };

    // Legacy properties - maintained for backward compatibility with existing code
    // These point to the active character's data
    this.restQuickSlots = this.characterInventories['default'].quickSlots;
    this.restActiveSlotIndex = this.characterInventories['default'].activeSlotIndex;

    // Track which character is currently active so saveRestLoadout() can write
    // the activeSlotIndex back to the correct characterInventories entry.
    this._activeCharacterType = 'default';

    this.itemChest = []; // Storage for weapons (shared across all characters)

    // Recomputes player stat fields from equipped armor/consumables — see
    // applyEquipmentEffectsToPlayer, the sanctioned call point.
    this.equipmentEffectsSystem = new EquipmentEffectsSystem();
    this.consumableWindupEffects = new ConsumableWindupEffects();

    // Weapons displaced during EXPLORE pickup buffer here, not in itemChest.
    // Flushed to itemChest by saveRestLoadout() on safe REST return. Discarded on
    // character/run death so EXPLORE-picked-up weapons don't survive a wipe.
    this.pendingChestDeposits = [];

    // EXPLORE inventory (lost on death)
    this.armorInventory = []; // All collected armor
    this.consumableInventory = []; // Unequipped non-Bottle consumables
    // Bottles: every carried Bottle (data.bottle) not equipped in a slot.
    // Uncapped and never routed through consumableInventory or the
    // SlotReplacement prompt — a Bottle is used straight from here (armed via
    // the TAB Bottles column) and only enters a slot when the player equips
    // it, which is what buys it auto-fire. stashUnequipped/removeUnequipped
    // pick the right pile for any consumable.
    this.bottles = [];

    // Narrative/puzzle keys (Vault Key, Skull Key) — held, not equipped.
    // Real Items, populated by tryPickupItem's KEY branch below; never a
    // quick/equip slot. keyItems.js (hasKeyItem/consumeKeyItem) is the only sanctioned
    // way to read or spend one — do not re-derive a parallel boolean flag.
    this.keyItemInventory = [];

    // Equipment slots (lost on death)
    this.equippedArmor = null; // Single armor slot
    this.onArmorEquipped = null; // Game wires: Armor Flavor word on equip
    this.equippedConsumables = Array(STARTING_CONSUMABLE_SLOTS).fill(null); // can expand to 5
    this.maxConsumableSlots = STARTING_CONSUMABLE_SLOTS; // Unlockable up to 5; resets on death

    // Consumable HUD feedback state
    this.spentConsumableSlots = Array(STARTING_CONSUMABLE_SLOTS).fill(false); // tracks ONE-SHOT used slots this run
    this.consumableCooldowns = Array(STARTING_CONSUMABLE_SLOTS).fill(0); // cooldown timers for reusable consumables
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

  // ─── Ingredient pile ──────────────────────────────────────────────────────
  // The whole pile, live. Callers may read and iterate it; mutate through the
  // methods below so there is one place to look when a count goes wrong.
  // Logic lives in IngredientPile.js (free functions taking `this`), same
  // pattern as itemCostDispatch.js below.
  getIngredients() {
    return ingredientPile.getIngredients(this);
  }

  hasIngredient(char) {
    return ingredientPile.hasIngredient(this, char);
  }

  countIngredient(char) {
    return ingredientPile.countIngredient(this, char);
  }

  addIngredient(char) {
    return ingredientPile.addIngredient(this, char);
  }

  removeIngredient(char) {
    return ingredientPile.removeIngredient(this, char);
  }

  removeRandomIngredient() {
    return ingredientPile.removeRandomIngredient(this);
  }

  // Generic char-based cost dispatch (raw ingredient vs crafted item) — full
  // logic lives in itemCostDispatch.js (free functions taking `this`), same
  // pattern as the TrapSystem chest-array helpers below. See that file's
  // header for why a recipe/shop-listing char can name either tier.
  countItemChar(char, player) {
    return countItemChar(this, char, player);
  }
  removeItemChar(char, player) {
    return removeItemChar(this, char, player);
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

  isBottle(item) {
    return item?.data?.bottle === true;
  }

  // The unequipped pile an item belongs to: Bottles for a Bottle, the
  // consumable pile for everything else.
  unequippedPileFor(item) {
    return this.isBottle(item) ? this.bottles : this.consumableInventory;
  }

  // Put an unequipped consumable on its pile (Bottles or consumableInventory).
  stashUnequipped(item) {
    this.unequippedPileFor(item).push(item);
  }

  // Take an unequipped consumable off whichever pile holds it. Returns whether
  // it was present.
  removeUnequipped(item) {
    for (const pile of [this.bottles, this.consumableInventory]) {
      const idx = pile.indexOf(item);
      if (idx > -1) { pile.splice(idx, 1); return true; }
    }
    return false;
  }

  // Every unequipped consumable, Bottles included — for readers that search
  // what the player carries but hasn't equipped (costs, errands, pawn lists).
  allUnequippedConsumables() {
    return [...this.consumableInventory, ...this.bottles];
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

  // The equipped consumable slot whose item shares `item`'s Exclusive Group
  // (data.exclusiveGroup — e.g. every pair of boots), or -1. `exceptIdx` skips
  // the slot about to be overwritten anyway. Every equip path that would add
  // a second member routes to the SlotReplacementSystem prompt instead, which
  // then only offers the conflicting slot.
  // A consumable also conflicts with its own twin (same char — a second Bomb),
  // so one consumable never fills two slots. SlotReplacementSystem.open()
  // resolves a twin without showing the prompt: the new copy takes the twin's
  // slot and the old one goes to the consumable pile. Stackables never get
  // here with a twin equipped; mergeStackableConsumable folds them in first.
  // Heals are the exception: two Health Potions in two slots is carrying two
  // heals, not doubling one effect, so a heal's twin takes a free slot like
  // any other pickup (bug-inbox 2026-10-22).
  conflictingConsumableSlot(item, exceptIdx = -1) {
    const group = item?.data?.exclusiveGroup;
    const twinsAllowed = item?.data?.effect === 'heal';
    return this.equippedConsumables.findIndex((s, idx) =>
      idx !== exceptIdx && s && s !== item &&
      ((!twinsAllowed && s.char === item?.char) || (group && s.data?.exclusiveGroup === group)));
  }

  // A Bottle that comes to hand (pickup, craft, bake) joins Bottles and, when
  // a consumable slot is free, is equipped into it — a free slot is never
  // left empty beside a Bottle. Full slots: it stays in Bottles, no prompt
  // (Bottles are uncapped). Returns the slot index it took, or -1.
  stowBottle(item, player) {
    this.bottles.push(item);
    return this.equipBottleIntoFreeSlot(item, player);
  }

  // Moves `item` from Bottles into the first free consumable slot (not one
  // reserved by the magic meter, not one whose Exclusive Group is taken).
  // Returns the slot index, or -1 when no slot can take it.
  equipBottleIntoFreeSlot(item, player) {
    if (!this.bottles.includes(item)) return -1;
    const emptySlot = this.firstFreeConsumableSlot(player);
    if (emptySlot === -1 || this.conflictingConsumableSlot(item) !== -1) return -1;
    if (player?.armedBottle === item) player.armedBottle = null;
    this.equipConsumable(emptySlot, item);
    this.applyEquipmentEffectsToPlayer(player);
    return emptySlot;
  }

  // A consumable made in place (Fireplace bake, Press oil) goes where a
  // pickup would: onto its stack, else into the first free slot, and only
  // into the consumable pile when no slot can take it. Returns the merged
  // stack, or null. Pushing straight onto the pile hid the item behind the
  // equipment menu while slots sat empty (bug-inbox 2026-10-28, Meat Jerky).
  stowConsumable(item, player) {
    if (this.isBottle(item)) { this.stowBottle(item, player); return null; }
    const stacked = this.mergeStackableConsumable(item);
    if (stacked) return stacked;
    this.consumableInventory.push(item);
    const emptySlot = this.firstFreeConsumableSlot(player);
    if (emptySlot !== -1 && this.conflictingConsumableSlot(item) === -1) {
      this.equipConsumable(emptySlot, item);
      this.applyEquipmentEffectsToPlayer(player);
    }
    return null;
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
    // A character's loadout is created the first time it becomes active in a
    // run — which is also when its Starter Weapon is granted (once per run).
    if (!this.characterInventories[characterType]) {
      this.characterInventories[characterType] = createCharacterLoadout(characterType);
    }

    // Update legacy property pointers to active character's data.
    // The ingredient pile is shared across characters and not touched here.
    this.restQuickSlots = this.characterInventories[characterType].quickSlots;
    this.restActiveSlotIndex = this.characterInventories[characterType].activeSlotIndex;
    this._activeCharacterType = characterType;
  }

  /**
   * Get a character's stored quick slots.
   *
   * Quick slots are the only thing kept per character — the ingredient pile is
   * shared by all of them and lives in `this.ingredients`.
   *
   * @param {string} characterType - Character type
   * @returns {Object} - { quickSlots, activeSlotIndex }
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
      'default': createCharacterLoadout('default')
    };

    // Clear shared ingredients pile (in-place so external references stay valid).
    this.ingredients.length = 0;

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
  // Ground-item proximity check — dedup of 5 identical inline checks in main.js.
  hasNearbyGroundItem(items, player, physicsSystem, radius = 20) {
    return items.some(item => canReachLoot(this.game, player, item) && physicsSystem.getDistance(player, item) < radius);
  }

  tryPickupItem(items, placedTraps, player, physicsSystem, allowSlotChoice = false, _unused = 0, selectedWeaponSlotIdx = 0, renderer = null) {
    // NOTE: Placed traps (activated with SPACE) are NOT pickable - they're active traps
    // Only dropped traps (swapped from quick slots) in the items array can be picked up

    // Every branch below that actually removes an item sets `item.consumed = true`
    // alongside the splice. Companion AI (Crow bread/loot seeking, wild rat bread
    // seeking) grabs a direct object reference to a ground item and re-checks
    // `.consumed`/`.destroyed` each frame to notice it's gone — splicing it out of
    // `items` alone leaves those stale references looking perfectly valid, so a
    // crow/rat already inbound to a loaf the player just picked up would arrive at
    // its last position and "eat" the phantom, wrongly promoting/taming (bug: bread
    // picked back up before a crow reached it still resulted in the crow taming).

    // Check ground items
    const now = performance.now();
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!canReachLoot(this.game, player, item)) continue; // Other-Plane / other-layer items are unreachable
      if (item.pickupReadyAt && item.pickupReadyAt > now) continue; // Recently swapped — wait
      const distance = physicsSystem.getDistance(player, item);

      if (distance < 20) {
        let droppedItem = null;
        let customMessage = null;
        let stackCount = null; // set when a consumable merged into a stack (MenuSystem.announceStack)

        // Route items to correct inventory based on type
        if (item.data.type === 'ARMOR') {
          if (allowSlotChoice && this.equippedArmor !== null) return { success: false, needsSlotChoice: true, slotType: 'armor', pendingItem: item, droppedItem: null, message: null, removedTrap: false };
          this.armorInventory.push(item);
          this.equipArmor(item);
          this.applyEquipmentEffectsToPlayer(player);
          item.consumed = true;
          physicsSystem.removeEntity(item);
          items.splice(i, 1);
        } else if (item.data.type === 'CONSUMABLE' && this.isBottle(item)) {
          // A Bottle takes a free slot, else waits in Bottles — never the
          // slot-choice prompt (its count is uncapped).
          this.stowBottle(item, player);
          item.consumed = true;
          physicsSystem.removeEntity(item);
          items.splice(i, 1);
        } else if (item.data.type === 'CONSUMABLE') {
          // Stackable consumables (Meat Jerky, Bread, Firecracker, ...) merge
          // into an existing same-char stack instead of contesting a slot —
          // see mergeStackableConsumable.
          const stacked = this.mergeStackableConsumable(item);
          if (stacked) {
            stackCount = stacked.count;
          } else if (allowSlotChoice && !this.game?.bombBagSystem?.claimsPickup(item)) {
            const emptySlot = this.firstFreeConsumableSlot(player);
            if (emptySlot === -1 || this.conflictingConsumableSlot(item) !== -1) return { success: false, needsSlotChoice: true, slotType: 'consumable', pendingItem: item, droppedItem: null, message: null, removedTrap: false };
            this.consumableInventory.push(item);
            this.equipConsumable(emptySlot, item);
            // Re-project onto the player: the HUD and the passive consumable
            // effects read player.equippedConsumables, a copy that would
            // otherwise stay stale until the next projection (bug #335 — a
            // shop purchase stayed invisible while the shop modal held the
            // update loop paused).
            this.applyEquipmentEffectsToPlayer(player);
          } else this.consumableInventory.push(item); // incl. a Bomb the equipped Bomb Bag claims as stock
          item.consumed = true;
          physicsSystem.removeEntity(item);
          items.splice(i, 1);
        } else if (item.data.type === 'WEAPON' || item.data.type === 'TRAP') {
          // Already-equipped trap stacks into held count; skip slot-choice.
          if (trapAlreadyEquipped(player, item)) {
            item.consumed = true;
            physicsSystem.removeEntity(item);
            items.splice(i, 1);
            return { success: true, droppedItem: item, message: item.data.name, removedTrap: false, pickedUpType: item.data.type, pickedUpChar: item.char };
          }
          // Full quick slots: don't silently displace the loadout — signal the
          // caller to open the paused slot-choice prompt (SlotReplacementSystem).
          // The item stays on the ground until the player confirms a destination.
          if (allowSlotChoice) {
            if (player.quickSlotsFull()) {
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
          item.consumed = true;
          physicsSystem.removeEntity(item);
          items.splice(i, 1);
        } else if (item.data.type === 'KEY') {
          // Held, not equipped — never touches a quick/equip slot. See
          // keyItems.js.
          this.keyItemInventory.push(item);
          item.consumed = true;
          physicsSystem.removeEntity(item);
          items.splice(i, 1);
        } else if (item.data.type === 'BLESSING') {
          // Blessings are handled by caller (applyBlessing in main.js)
          item.consumed = true;
          physicsSystem.removeEntity(item);
          items.splice(i, 1);
          return {
            success: true,
            droppedItem: null,
            message: null,
            removedTrap: false,
            pickedUpChar: item.char,
            blessing: item // Return blessing item for caller to apply
          };
        } else if (item.data.type === 'NEUTRAL') {
          // Neutral items just show message (lore/flavor)
          customMessage = item.data.name;
          item.consumed = true;
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
          pickedUpType: item.data.type,
          pickedUpChar: item.char,
          stackCount
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
      // Get all consumables from the unequipped piles (deduplicated)
      for (const item of this.allUnequippedConsumables()) {
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
    this.onArmorEquipped?.(selectedItem);

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
    // Mana slots are display-only for the magic meter (see
    // MagicSystem.evictReservedConsumables) — every caller already routes
    // around a reserved index via firstFreeConsumableSlot or a UI-level
    // filter, but this is the one choke point every equip path funnels
    // through, so refuse here too rather than trusting each call site.
    const meter = this.game?.player?.magicMeter;
    if (meter?.active && meter.slots?.includes(slotIndex)) return null;

    const previousConsumable = this.equippedConsumables[slotIndex];

    // If there was previously equipped consumable, return it to its pile
    if (this.equippedConsumables[slotIndex]) {
      this.stashUnequipped(this.equippedConsumables[slotIndex]);
    }

    // Remove selected consumable from its pile and equip it
    this.removeUnequipped(selectedItem);
    this.equippedConsumables[slotIndex] = selectedItem;

    // Reset consumable state for this slot
    this.spentConsumableSlots[slotIndex] = false;
    this.consumableCooldowns[slotIndex] = 0;

    return previousConsumable;
  }

  // Removes `item` from armorInventory outright (not equipping it anywhere) —
  // used by the Shopkeeper's Pawn sell flow. Returns whether it was present.
  removeFromArmorInventory(item) {
    const idx = this.armorInventory.indexOf(item);
    if (idx === -1) return false;
    this.armorInventory.splice(idx, 1);
    return true;
  }

  // Same as removeFromArmorInventory, for the unequipped consumable piles
  // (consumableInventory or Bottles).
  removeFromConsumableInventory(item) {
    return this.removeUnequipped(item);
  }

  // Stackable-consumable merge: see mergeStackableConsumable in TrapSystem.js
  // (shares the TRAP chest-stacking helpers there) for the actual logic.
  mergeStackableConsumable(item) {
    return mergeStackableConsumableStack(this.equippedConsumables, this.consumableInventory, item);
  }

  // Strips an item the player is actively CARRYING rather than one sitting in
  // a storage pile — the Shopkeeper's Pawn list sells the whole loadout, not
  // just spares (see ShopSystem's pawn-mode header). `source` names which
  // carried store the item came out of, matching the pawn entry's own field:
  //
  //   'equippedArmor'      — the single worn armor slot
  //   'equippedConsumable' — equippedConsumables[slotIndex]; the slot goes
  //                          empty rather than spent, so it can be refilled
  //   'quick'              — player.quickSlots[slotIndex], the weapon loadout
  //
  // Always re-projects equipment onto the player afterwards: selling worn
  // armor or an equipped consumable changes defense/resists/procs, and
  // applyEquipmentEffectsToPlayer is the one sanctioned way to recompute them.
  removeCarriedItem(source, slotIndex, player) {
    if (source === 'equippedArmor') {
      this.equippedArmor = null;
    } else if (source === 'equippedConsumable') {
      this.equippedConsumables[slotIndex] = null;
      this.spentConsumableSlots[slotIndex] = false;
      this.consumableCooldowns[slotIndex] = 0;
      // Selling the armed slot disarms it — SPACE must not fire what's gone.
      if (player.selectedConsumableIndex === slotIndex) player.selectedConsumableIndex = -1;
    } else if (source === 'quick') {
      player.quickSlots[slotIndex] = null;
      // Selling the weapon in hand: fall back to whatever slot still holds
      // one, mirroring Player.dropItem's own auto-switch.
      if (player.activeSlotIndex === slotIndex) {
        const nextFilled = player.quickSlots.findIndex(slot => slot !== null);
        if (nextFilled !== -1) player.activeSlotIndex = nextFilled;
      }
    } else {
      return false;
    }
    this.applyEquipmentEffectsToPlayer(player);
    return true;
  }

  // ========== ARMOR EFFECTS APPLICATION ==========

  /**
   * Apply equipped armor effects to player
   * Resets player stats, applies armor properties, adds block boost if active
   *
   * @param {Player} player - Player entity to apply effects to
   */
  // Recomputes player.defense/resists/immunities/etc. from currently-equipped
  // armor + consumables. Logic lives in EquipmentEffectsSystem (extracted to
  // stay under this file's architecture budget) — this stays the sanctioned
  // call point so every caller keeps going through InventorySystem.
  applyEquipmentEffectsToPlayer(player) {
    this.equipmentEffectsSystem.apply(player, this);
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
    tickConsumableFlash(this, deltaTime);

    // Check if consumables should activate
    this.game.consumableTriggerSystem.checkAutoTriggers(this, player, currentRoom);
    // A hit only counts for the check that follows it — a healOnHit item still
    // on cooldown must not fire later off a stale hit.
    player.hurtPending = false;

    // Update active windups
    this.consumableWindupEffects.tick(this, deltaTime, player, combatSystem, steamClouds, particles);

    // Drive per-frame HUD update while consumable slot is blinking
    if (this.consumableBlinkTimer > 0) this.game.updateUI();
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
    for (const bottle of this.bottles) {
      if (bottle.bottleCooldown > 0) bottle.bottleCooldown = Math.max(0, bottle.bottleCooldown - deltaTime);
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
  // potions tagged with leavesBottle: true leave an Empty Bottle ('B') in
  // Bottles and free the slot. Sources: magic-potion residue (per design: any
  // "potion such as haste draught").
  _consumeOneShotSlot(slotIndex, consumable, player) {
    // Stacked consumable (data.stackable, count > 1): using one unit
    // decrements the stack instead of clearing the slot — the item stays
    // equipped until the last unit is spent. See mergeStackableConsumable.
    if (consumable?.data?.stackable && (consumable.count || 1) > 1) {
      consumable.count -= 1;
      return;
    }
    const leavesBottle = consumable?.data?.leavesBottle === true;
    if (leavesBottle) {
      // The Empty Bottle goes to Bottles and the slot frees up for the next
      // equip — a slot holds a Bottle only while it's worth auto-firing.
      this.bottles.push(new Item('B', 0, 0));
      this.equippedConsumables[slotIndex] = null;
      if (player.equippedConsumables) player.equippedConsumables[slotIndex] = null;
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
    const isOneShot = cd.oneShot === true;

    this.startConsumableWindup(slotIndex, consumable, triggerData, player);

    if (isOneShot) {
      this._consumeOneShotSlot(slotIndex, consumable, player);
    } else {
      this.consumableCooldowns[slotIndex] = cd.cooldown || 10;
    }
  }

  // Every consumable use is a throw — arc up and land before the effect
  // resolves. `triggerData.windup` is always set by checkTriggerCondition
  // when it approves a trigger (see ConsumableTriggerSystem). Starts the
  // throw only — slot consumption/cooldown is the caller's (the Bomb Bag
  // throws a Bomb from its slot without spending the bag; BombBagSystem).
  startConsumableWindup(slotIndex, consumable, triggerData, player) {
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
      isOneShot: consumable.data.oneShot === true
    });
  }

  // ========== DEATH & LOADOUT MECHANICS ==========

  /**
   * Commit the surviving loadout to the active character's record, on the walk
   * home from EXPLORE to REST.
   *
   * This is the write half of a round trip. enterRestState discards the Player
   * entity and builds a new one, then refills its quick slots from
   * restQuickSlots — so whatever is not written here is not what the player
   * walks back into REST holding. Death is the case that never reaches this
   * call and has the record cleared out from under it instead, which is how
   * one restore line gives both outcomes.
   *
   * Ingredients do not pass through: there is one pile and the player has been
   * adding to it all along, so arriving in REST transfers nothing.
   *
   * @param {Array} playerQuickSlots - Player's quick slots (weapons)
   * @param {number} playerActiveSlotIndex - Active slot index
   */
  saveRestLoadout(playerQuickSlots, playerActiveSlotIndex) {
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

    // Flush deferred EXPLORE chest deposits — they survived the run, so they
    // land in the chest now.
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
    this.bottles = [];
    this.keyItemInventory = [];
    this.coinWallet = 0;
    this.equippedArmor = null;
    this.equippedConsumables = Array(STARTING_CONSUMABLE_SLOTS).fill(null);

    // Clear consumable state and reset unlocked slots
    this.maxConsumableSlots = STARTING_CONSUMABLE_SLOTS;
    this.spentConsumableSlots = Array(STARTING_CONSUMABLE_SLOTS).fill(false);
    this.consumableCooldowns = Array(STARTING_CONSUMABLE_SLOTS).fill(0);
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

  // Room/ingredient anti-cheat snapshots — logic lives in
  // RoomStatePersistence.js (extracted to stay under the architecture
  // budget); these are thin wrappers so every external call site is
  // unchanged. See that file for the full behavior doc.
  saveExploreRoom(currentRoom, items, ingredients, placedTraps, enemies = [], backgroundObjects = [], captives = []) {
    saveExploreRoomState(this, currentRoom, items, ingredients, placedTraps, enemies, backgroundObjects, captives);
  }

  getSavedExploreRoomData() {
    return getSavedExploreRoomState(this);
  }

  clearSavedExploreRoom() {
    clearSavedExploreRoomState(this);
  }

  // ========== REST MODE PERSISTENCE ==========

  saveRestIngredients(ingredients) {
    saveRestIngredientsState(this, ingredients);
  }

  getSavedRestIngredients() {
    return getSavedRestIngredientsState(this);
  }

  clearSavedRestIngredients() {
    clearSavedRestIngredientsState(this);
  }

  // ========== CHEST SYSTEM ==========

  // Traps merge into an existing same-char stack instead of a new chest slot.
  addToChest(item) {
    addItemToChestArray(this.itemChest, item);
  }

  // EXPLORE-time deferred deposit; flushed to itemChest by saveRestLoadout().
  deferToChest(item) {
    addItemToChestArray(this.pendingChestDeposits, item);
  }

  // Removes one unit of `item`; returns the instance to use, or null if absent.
  retrieveFromChest(item) {
    return removeItemFromChestArray(this.itemChest, item);
  }

  // Removes one unit of `item` from the deferred deposits (not yet flushed to
  // itemChest — see deferToChest); same contract as retrieveFromChest. Lets
  // the Settlement shop's PAWN list sell a weapon swapped out this trip.
  retrieveFromPendingChest(item) {
    return removeItemFromChestArray(this.pendingChestDeposits, item);
  }

  getChestContents() {
    return this.itemChest.map((item) => ({ action: 'retrieve', item, label: chestEntryLabel(item) }));
  }
}
