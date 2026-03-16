import { findRecipeByResult } from '../data/recipes.js';
import { CRAFTING, EQUIPMENT, COLORS } from '../game/GameConfig.js';
import { Item } from '../entities/Item.js';
import { isIngredient, isItem } from '../data/items.js';

export class MenuSystem {
  constructor(game) {
    this.game = game;
  }

  getNearestInteractiveSlot() {
    const game = this.game;
    if (!game.player) return null;

    const gridPos = game.player.getGridPosition();
    const INTERACTION_DISTANCE = 1.5;

    const slots = [
      { type: 'crafting-left',   x: CRAFTING.LEFT_SLOT_X,   y: CRAFTING.STATION_Y },
      { type: 'crafting-center', x: CRAFTING.CENTER_SLOT_X, y: CRAFTING.STATION_Y },
      { type: 'crafting-right',  x: CRAFTING.RIGHT_SLOT_X,  y: CRAFTING.STATION_Y },
      { type: 'equipment-chest1', x: EQUIPMENT.CHEST_X, y: EQUIPMENT.CHEST1_Y },
      { type: 'equipment-chest2', x: EQUIPMENT.CHEST_X, y: EQUIPMENT.CHEST2_Y },
      { type: 'equipment-chest3', x: EQUIPMENT.CHEST_X, y: EQUIPMENT.CHEST3_Y },
      { type: 'equipment-armor',       x: EQUIPMENT.ARMOR_X,       y: EQUIPMENT.ARMOR_Y },
      { type: 'equipment-consumable1', x: EQUIPMENT.CONSUMABLE1_X, y: EQUIPMENT.CONSUMABLE1_Y },
      { type: 'equipment-consumable2', x: EQUIPMENT.CONSUMABLE2_X, y: EQUIPMENT.CONSUMABLE2_Y }
    ];

    // Dynamically add unlocked consumable slots 3-5
    const maxSlots = game.inventorySystem?.maxConsumableSlots ?? 2;
    const extraSlotDefs = [
      { type: 'equipment-consumable3', x: EQUIPMENT.CONSUMABLE3_X, y: EQUIPMENT.CONSUMABLE3_Y },
      { type: 'equipment-consumable4', x: EQUIPMENT.CONSUMABLE4_X, y: EQUIPMENT.CONSUMABLE4_Y },
      { type: 'equipment-consumable5', x: EQUIPMENT.CONSUMABLE5_X, y: EQUIPMENT.CONSUMABLE5_Y }
    ];
    for (let i = 0; i < maxSlots - 2; i++) {
      if (extraSlotDefs[i]) slots.push(extraSlotDefs[i]);
    }

    let nearestSlot = null;
    let minDistance = INTERACTION_DISTANCE;

    for (const slot of slots) {
      const dx = gridPos.x - slot.x;
      const dy = gridPos.y - slot.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < minDistance) {
        minDistance = distance;
        nearestSlot = slot;
      }
    }

    return nearestSlot;
  }

  showPickupMessage(itemName) {
    const game = this.game;
    // Add to queue
    game.pickupMessageQueue.push(itemName.toUpperCase());

    // If no message is currently showing, start showing the first one
    if (!game.pickupMessage) {
      this.showNextPickupMessage();
    }
  }

  showNextPickupMessage() {
    const game = this.game;
    if (game.pickupMessageQueue.length > 0) {
      game.pickupMessage = game.pickupMessageQueue.shift();
      game.pickupMessageTimer = game.PICKUP_MESSAGE_DURATION;
    } else {
      game.pickupMessage = null;
      game.pickupMessageTimer = 0;
    }
  }

  updateUI() {
    const game = this.game;
    if (!game.player) return;

    game.ui.hp.textContent = game.player.hp;
    game.ui.depth.textContent = game.getCurrentZoneDepth();

    const inventoryCount = game.player.inventory.length + game.inventorySystem.armorInventory.length + game.inventorySystem.consumableInventory.length;
    if (game.keys.i) {
      game.ui.inventory.innerHTML = `<span style="color: ${COLORS.ITEM}">${inventoryCount}</span>`;
    } else {
      game.ui.inventory.textContent = inventoryCount;
    }

    // Q / E cycle key colors
    game.ui.slotQ.style.color = game.keys.q ? COLORS.ITEM : '#ff4444';
    game.ui.slotE.style.color = game.keys.e ? COLORS.ITEM : '#ff4444';

    // Individual slot elements — each pinned to a static position in CSS
    const SUBSCRIPTS = ['\u2081', '\u2082', '\u2083'];
    const slotEls = [game.ui.slot1, game.ui.slot2, game.ui.slot3];

    for (let i = 0; i < 3; i++) {
      const el = slotEls[i];
      const item = game.player.quickSlots[i];
      const isActive = i === game.player.activeSlotIndex;
      const char = item ? item.char : SUBSCRIPTS[i];
      const slotText = isActive ? `[${char}]` : ` ${char} `;
      const color = isActive ? '#ffffff' : '#555555';

      if (item && item.data && item.data.type === 'TRAP' && game.player.trapUsedThisRoom[i]) {
        el.style.opacity = '0.3';
      } else {
        el.style.opacity = '1';
      }
      el.textContent = slotText;
      el.style.color = color;
    }

    // Armor display
    const armorChar = game.inventorySystem.equippedArmor ? game.inventorySystem.equippedArmor.char : '.';
    const armorColor = game.inventorySystem.equippedArmor ? (game.inventorySystem.equippedArmor.color || '#aaaaff') : '#444';
    game.ui.armorChar.textContent = armorChar;
    game.ui.armorChar.style.color = armorColor;

    // Consumable display — slots 1-2 functional, slot 3 locked, slots 4-5 empty
    const consumables = (game.player && game.player.equippedConsumables)
      ? game.player.equippedConsumables
      : game.inventorySystem.equippedConsumables;
    const consumableEls = [
      game.ui.consumableChar1,
      game.ui.consumableChar2,
      game.ui.consumableChar3,
      game.ui.consumableChar4,
      game.ui.consumableChar5
    ];

    const maxConsumableSlots = game.inventorySystem?.maxConsumableSlots ?? 2;

    for (let i = 0; i < 5; i++) {
      const el = consumableEls[i];
      if (!el) continue;

      // Slots beyond maxConsumableSlots are locked
      if (i >= maxConsumableSlots) {
        el.textContent = '.';
        el.style.color = '#333333';
        continue;
      }

      // Functional unlocked slots
      if (consumables[i]) {
        const isBlinking = game.inventorySystem.consumableBlinkSlot === i
          && game.inventorySystem.consumableBlinkTimer > 0;

        if (isBlinking && game.inventorySystem.consumableBlinkShowBlock) {
          el.textContent = '\u2588'; // █ solid block
          el.style.color = consumables[i].color || COLORS.ITEM;
        } else {
          el.textContent = consumables[i].char;
          if (game.inventorySystem.consumableCooldowns[i] > 0) {
            el.style.color = '#666666';
          } else {
            el.style.color = consumables[i].color || COLORS.ITEM;
          }
        }
      } else if (game.inventorySystem.spentConsumableSlots[i]) {
        el.textContent = '.';
        el.style.color = '#333';
      } else {
        el.textContent = '.';
        el.style.color = '#555';
      }
    }
  }

  openEquipmentMenu(slotType) {
    const game = this.game;
    game.menuOpen = true;
    game.currentMenuSlot = slotType;
    game.selectedMenuIndex = 0;

    game.menuItems = game.inventorySystem.openEquipmentMenu(slotType);
    game.renderController.menuOverlay.render(game);
  }

  openChestRetrievalMenu(slotIdx = null) {
    const game = this.game;
    game.menuOpen = true;
    game.currentMenuSlot = 'chest';
    game.chestTargetSlot = slotIdx;
    game.selectedMenuIndex = 0;

    game.menuItems = game.inventorySystem.getChestContents();
    game.renderController.menuOverlay.render(game);
  }

  openCraftingMenu(slotType) {
    const game = this.game;
    game.menuOpen = true;
    game.currentMenuSlot = slotType;
    game.selectedMenuIndex = 0;

    const weaponsList = [];
    const armorList = [];
    const consumableList = [];

    for (const item of game.inventorySystem.itemChest) {
      if (!weaponsList.find(i => i.char === item.char)) {
        weaponsList.push(item);
      }
    }

    for (const item of game.inventorySystem.armorInventory) {
      if (!armorList.find(i => i.char === item.char)) {
        armorList.push(item);
      }
    }

    for (const item of game.inventorySystem.consumableInventory) {
      if (!consumableList.find(i => i.char === item.char)) {
        consumableList.push(item);
      }
    }

    const ingredientList = [];
    for (const ingredientChar of game.player.inventory) {
      if (!ingredientList.includes(ingredientChar)) {
        ingredientList.push(ingredientChar);
      }
    }

    if (slotType === 'center') {
      game.menuColumns = [weaponsList, armorList, consumableList];
      game.disabledColumns = [false, false, false];
      game.selectedColumn = 1;
    } else {
      game.menuColumns = [weaponsList, armorList, ingredientList, consumableList];
      game.disabledColumns = [false, false, false, false];
      game.selectedColumn = 2;
    }

    game.menuItems = game.menuColumns[game.selectedColumn];
    game.renderController.menuOverlay.render(game);
  }

  closeMenu() {
    const game = this.game;
    game.menuOpen = false;
    game.currentMenuSlot = null;
    game.menuColumns = null;
    game.disabledColumns = [];
    game.ui.menu.classList.add('hidden');
  }

  selectMenuItem() {
    const game = this.game;
    if (!game.menuOpen) return;
    if (game.menuItems.length === 0) {
      this.closeMenu();
      return;
    }

    const selectedItem = game.menuItems[game.selectedMenuIndex];

    // Handle chest operations
    if (game.currentMenuSlot === 'chest') {
      if (selectedItem.action === 'retrieve') {
        const item = selectedItem.item;
        const targetIdx = game.chestTargetSlot;

        game.inventorySystem.retrieveFromChest(item);

        if (targetIdx !== null && targetIdx !== undefined) {
          // Place into the specific slot this chest corresponds to
          const displaced = game.player.quickSlots[targetIdx];
          game.player.quickSlots[targetIdx] = item;
          game.player.activeSlotIndex = targetIdx;
          game.player.trapUsedThisRoom[targetIdx] = false;
          if (displaced) {
            game.inventorySystem.addToChest(displaced);
          }
          game.saveGameState();
          game.renderer.markBackgroundDirty();
          game.closeMenu();
          game.updateUI();
        } else {
          // Fallback: first empty slot or active slot swap
          const droppedItem = game.player.pickupItem(item);
          if (droppedItem) {
            game.inventorySystem.addToChest(droppedItem);
            game.saveGameState();
            game.renderer.markBackgroundDirty();
            game.updateUI();
            game.openChestRetrievalMenu(null);
          } else {
            game.saveGameState();
            game.renderer.markBackgroundDirty();
            game.closeMenu();
            game.updateUI();
          }
        }
      }
      return;
    }

    if (game.currentMenuSlot === 'armor') {
      game.inventorySystem.equipArmor(selectedItem);
      game.saveGameState();
      game.renderer.markBackgroundDirty();
      game.closeMenu();
      game.updateUI();
      return;
    }

    if (game.currentMenuSlot === 'consumable1') {
      game.inventorySystem.equipConsumable(0, selectedItem);
      game.player.equippedConsumables = [...game.inventorySystem.equippedConsumables];
      game.saveGameState();
      game.renderer.markBackgroundDirty();
      game.closeMenu();
      game.updateUI();
      return;
    }

    if (game.currentMenuSlot === 'consumable2') {
      game.inventorySystem.equipConsumable(1, selectedItem);
      game.player.equippedConsumables = [...game.inventorySystem.equippedConsumables];
      game.saveGameState();
      game.renderer.markBackgroundDirty();
      game.closeMenu();
      game.updateUI();
      return;
    }

    if (game.currentMenuSlot === 'consumable3') {
      game.inventorySystem.equipConsumable(2, selectedItem);
      game.player.equippedConsumables = [...game.inventorySystem.equippedConsumables];
      game.saveGameState();
      game.renderer.markBackgroundDirty();
      game.closeMenu();
      game.updateUI();
      return;
    }

    if (game.currentMenuSlot === 'center') {
      this.handleCenterSlotSelection(selectedItem);
      return;
    }

    if (game.currentMenuSlot === 'left' || game.currentMenuSlot === 'right') {
      const itemChar = typeof selectedItem === 'string' ? selectedItem : selectedItem.char;

      if (typeof selectedItem === 'string') {
        game.player.removeIngredient(selectedItem);
      } else if (selectedItem.data.type === 'WEAPON' || selectedItem.data.type === 'TRAP') {
        game.inventorySystem.retrieveFromChest(selectedItem);
      } else if (selectedItem.data.type === 'ARMOR') {
        const armorIndex = game.inventorySystem.armorInventory.indexOf(selectedItem);
        if (armorIndex > -1) {
          game.inventorySystem.armorInventory.splice(armorIndex, 1);
        }
      } else if (selectedItem.data.type === 'CONSUMABLE') {
        const consumableIndex = game.inventorySystem.consumableInventory.indexOf(selectedItem);
        if (consumableIndex > -1) {
          game.inventorySystem.consumableInventory.splice(consumableIndex, 1);
        }
      }

      if (game.currentMenuSlot === 'left') {
        game.craftingSystem.setLeftSlot(itemChar);
      } else if (game.currentMenuSlot === 'right') {
        game.craftingSystem.setRightSlot(itemChar);
      }

      game.saveGameState();
      game.renderer.markBackgroundDirty();
      game.closeMenu();
      game.updateUI();
    }
  }

  handleCenterSlotSelection(selectedItem) {
    const game = this.game;
    const itemChar = typeof selectedItem === 'string' ? selectedItem : selectedItem.char;

    const recipe = findRecipeByResult(itemChar);

    if (recipe) {
      game.craftingSystem.leftSlot = recipe.left;
      game.craftingSystem.rightSlot = recipe.right;
      game.craftingSystem.centerSlot = itemChar;

      if (typeof selectedItem === 'string') {
        game.player.removeIngredient(selectedItem);
      } else if (selectedItem.data.type === 'WEAPON' || selectedItem.data.type === 'TRAP') {
        game.inventorySystem.retrieveFromChest(selectedItem);
      } else if (selectedItem.data.type === 'ARMOR') {
        const armorIndex = game.inventorySystem.armorInventory.indexOf(selectedItem);
        if (armorIndex > -1) {
          game.inventorySystem.armorInventory.splice(armorIndex, 1);
        }
      } else if (selectedItem.data.type === 'CONSUMABLE') {
        const consumableIndex = game.inventorySystem.consumableInventory.indexOf(selectedItem);
        if (consumableIndex > -1) {
          game.inventorySystem.consumableInventory.splice(consumableIndex, 1);
        }
      }

      game.saveGameState();
      game.renderer.markBackgroundDirty();
      game.closeMenu();
      game.updateUI();
    } else {
      game.closeMenu();
    }
  }

  // ─── Crafting slot interactions (space press in REST) ───────────────────────

  handleCraftingSlotClaim(slotType) {
    const game = this.game;

    if (slotType === 'crafting-left') {
      if (!game.craftingSystem.leftSlot) {
        game.openCraftingMenu('left');
        return;
      }
      const char = game.craftingSystem.clearLeftSlot();
      if (char) this._returnSlotItemToInventory(char);
      game.renderer.markBackgroundDirty();
      game.updateUI();
      return;
    }

    if (slotType === 'crafting-right') {
      if (!game.craftingSystem.rightSlot) {
        game.openCraftingMenu('right');
        return;
      }
      const char = game.craftingSystem.clearRightSlot();
      if (char) this._returnSlotItemToInventory(char);
      game.renderer.markBackgroundDirty();
      game.updateUI();
      return;
    }

    if (slotType === 'crafting-center') {
      if (game.craftingSystem.centerSlot) {
        const item = game.craftingSystem.claimCraftedItem(
          game.player.position.x,
          game.player.position.y
        );
        if (item) {
          if (item.data.type === 'ARMOR') {
            game.inventorySystem.armorInventory.push(item);
          } else if (item.data.type === 'CONSUMABLE') {
            game.inventorySystem.consumableInventory.push(item);
          } else if (item.data.type === 'WEAPON' || item.data.type === 'TRAP') {
            const dropped = game.player.pickupItem(item);
            if (dropped) game.inventorySystem.addToChest(dropped);
          }
          game.showPickupMessage(item.data.name);
          game.renderer.markBackgroundDirty();
          game.updateUI();
        }
        return;
      } else if (!game.craftingSystem.leftSlot && !game.craftingSystem.rightSlot) {
        game.openCraftingMenu('center');
      }
      // If ingredient slots occupied, block interaction silently
    }
  }

  /** Route a character returned from a crafting slot back to the right inventory. */
  _returnSlotItemToInventory(char) {
    const game = this.game;
    if (isIngredient(char)) {
      game.player.addIngredient(char);
    } else if (isItem(char)) {
      const item = new Item(char, game.player.position.x, game.player.position.y);
      if (item.data.type === 'ARMOR') {
        game.inventorySystem.armorInventory.push(item);
      } else if (item.data.type === 'CONSUMABLE') {
        game.inventorySystem.consumableInventory.push(item);
      } else if (item.data.type === 'WEAPON' || item.data.type === 'TRAP') {
        game.player.pickupItem(item);
      }
    }
  }

  // ─── Shift-press slot interactions (REST) ────────────────────────────────────

  handleChestStore(slotIdx = null) {
    const game = this.game;
    const targetIdx = slotIdx !== null ? slotIdx : game.player.activeSlotIndex;
    const item = game.player.quickSlots[targetIdx];
    if (!item) return;

    game.inventorySystem.addToChest(item);
    game.player.quickSlots[targetIdx] = null;

    // If we stored from the active slot, switch to next filled slot
    if (targetIdx === game.player.activeSlotIndex) {
      const nextFilled = game.player.quickSlots.findIndex(
        (slot, idx) => idx !== targetIdx && slot !== null
      );
      if (nextFilled !== -1) game.player.activeSlotIndex = nextFilled;
    }
    game.saveGameState();
    game.renderer.markBackgroundDirty();
    game.updateUI();
  }

  handleCraftingSlotPlace(slotType) {
    const game = this.game;
    if (!game.player.heldItem) return;

    if (slotType === 'crafting-center' && !game.craftingSystem.centerSlot &&
        !game.craftingSystem.leftSlot && !game.craftingSystem.rightSlot) {
      const itemChar = game.player.heldItem.char;
      const recipe = findRecipeByResult(itemChar);
      if (recipe) {
        game.craftingSystem.leftSlot = recipe.left;
        game.craftingSystem.rightSlot = recipe.right;
        game.craftingSystem.centerSlot = itemChar;
        game.player.quickSlots[game.player.activeSlotIndex] = null;
        game.saveGameState();
        game.renderer.markBackgroundDirty();
        game.updateUI();
      }
      return;
    }

    if (slotType === 'crafting-left' && !game.craftingSystem.leftSlot) {
      game.craftingSystem.setLeftSlot(game.player.heldItem.char);
      game.player.quickSlots[game.player.activeSlotIndex] = null;
      game.renderer.markBackgroundDirty();
      game.updateUI();
      return;
    }

    if (slotType === 'crafting-right' && !game.craftingSystem.rightSlot) {
      game.craftingSystem.setRightSlot(game.player.heldItem.char);
      game.player.quickSlots[game.player.activeSlotIndex] = null;
      game.renderer.markBackgroundDirty();
      game.updateUI();
    }
  }
}
