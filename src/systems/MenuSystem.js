import { findRecipe, findRecipeByResult } from '../data/recipes.js';
import { CRAFTING, EQUIPMENT, COLORS, GRID } from '../game/GameConfig.js';
import { Item } from '../entities/Item.js';
import { isIngredient, isItem } from '../data/items.js';

export class MenuSystem {
  constructor(game) {
    this.game = game;

    // When true, any WASD key press signals a movement-exit (e.g. closes tombstone popup).
    // Set to true by popups that want to close on player movement; reset by checkMovementExit.
    this.closeOnMovement = false;
  }

  // ── Menu navigation (driven by menuIntent in main.js setupInput) ─────────

  // Column switching with wrapping, skipping disabled columns. dir = -1 | 1.
  moveColumn(dir) {
    const game = this.game;
    if (!game.menuColumns) return;
    const maxColumns = game.menuColumns.length;
    let newColumn = game.selectedColumn + dir;
    let attempts = 0;

    while (attempts < maxColumns) {
      if (newColumn < 0) newColumn = maxColumns - 1; // Wrap to end
      if (newColumn >= maxColumns) newColumn = 0;    // Wrap to start
      if (!game.disabledColumns[newColumn]) break;
      newColumn += dir;
      attempts++;
    }

    if (attempts < maxColumns) {
      game.selectedColumn = newColumn;
      game.selectedMenuIndex = 0;
      game.menuItems = game.menuColumns[game.selectedColumn];
      game.renderController.menuOverlay.render(game);
    }
  }

  // Move the selection within the current column, clamped. dir = -1 | 1.
  moveSelection(dir) {
    const game = this.game;
    game.selectedMenuIndex = Math.max(
      0,
      Math.min(game.menuItems.length - 1, game.selectedMenuIndex + dir)
    );
    game.renderController.menuOverlay.render(game);
  }

  // Returns true (and resets the flag) if movement-exit is active and a movement key is held.
  checkMovementExit(keys) {
    if (!this.closeOnMovement) return false;
    if (keys.w || keys.a || keys.s || keys.d) {
      this.closeOnMovement = false;
      return true;
    }
    return false;
  }

  // Convert a slot's grid position to canvas pixel center.
  getSlotPixelPos(slot) {
    const C = GRID.CELL_SIZE;
    if (slot.type.startsWith('crafting-')) {
      return { x: (slot.x + 1) * C, y: slot.y * C + C / 2 };
    }
    return { x: slot.x * C + C / 2, y: slot.y * C + C / 2 };
  }

  // Start the animated popup before opening a slot's menu.
  // Returns true if a popup was triggered (caller should return/skip further handling).
  triggerSlotPopup(slot) {
    const game = this.game;
    const pos = this.getSlotPixelPos(slot);

    // Occupied crafting slots remove their item immediately — no animation needed.
    if (slot.type.startsWith('crafting-')) {
      const cs = game.craftingSystem;
      const occupied =
        (slot.type === 'crafting-left'   && cs.leftSlot)   ||
        (slot.type === 'crafting-right'  && cs.rightSlot)  ||
        (slot.type === 'crafting-center' && cs.hasCenterContent());
      if (occupied) {
        this.handleCraftingSlotClaim(slot.type);
        return true;
      }
    }

    // Consumable slot interaction. Slots occupied by the magic meter are
    // display-only and accept no interaction.
    const consumableAction = (idx) => () => {
      const meter = game.player?.magicMeter;
      if (meter?.active && meter.slots?.includes(idx)) return;
      this.openEquipmentMenu(`consumable${idx + 1}`);
    };

    const actions = {
      'equipment-armor':       () => this.openEquipmentMenu('armor'),
      'equipment-consumable1': consumableAction(0),
      'equipment-consumable2': consumableAction(1),
      'equipment-consumable3': consumableAction(2),
      'equipment-consumable4': consumableAction(3),
      'equipment-consumable5': consumableAction(4),
      'equipment-chest1':      () => this.openChestRetrievalMenu(0),
      'equipment-chest2':      () => this.openChestRetrievalMenu(1),
      'equipment-chest3':      () => this.openChestRetrievalMenu(2),
      'crafting-left':         () => this.handleCraftingSlotClaim('crafting-left'),
      'crafting-center':       () => this.handleCraftingSlotClaim('crafting-center'),
      'crafting-right':        () => this.handleCraftingSlotClaim('crafting-right'),
    };

    const open = actions[slot.type];
    if (!open) return false;

    game.slotPopup = { phase: 0, timer: 0.125, pixelX: pos.x, pixelY: pos.y, open };
    return true;
  }

  // Trigger the tombstone popup animation when player interacts with the tombstone.
  triggerTombstonePopup() {
    this.game.tombstonePopup = { phase: 0, timer: 0.125 };
    this.closeOnMovement = true;
  }

  // Close the tombstone popup (on SPACE dismiss or state change).
  closeTombstonePopup() {
    this.game.tombstonePopup = null;
    this.closeOnMovement = false;
  }

  // Advance tombstone popup animation each frame.
  updateTombstonePopup(deltaTime) {
    const game = this.game;
    if (!game.tombstonePopup) return;
    if (this.checkMovementExit(game.keys)) {
      game.tombstonePopup = null;
      return;
    }
    if (game.tombstonePopup.phase < 2) {
      game.tombstonePopup.timer -= deltaTime;
      if (game.tombstonePopup.timer <= 0) {
        game.tombstonePopup.phase++;
        game.tombstonePopup.timer = 0.125;
      }
    }
  }

  // Advance the slot popup animation each frame and open the menu at phase 2.
  updateSlotPopup(deltaTime) {
    const game = this.game;
    if (!game.slotPopup) return;

    game.slotPopup.timer -= deltaTime;
    if (game.slotPopup.timer <= 0) {
      game.slotPopup.phase++;
      if (game.slotPopup.phase >= 2) {
        game.slotPopup.open();
        game.slotPopup = null;
      } else {
        game.slotPopup.timer = 0.125;
      }
    }
  }

  getNearestInteractiveSlot() {
    const game = this.game;
    if (!game.player) return null;

    // Use the player's visual center (position is top-left of sprite) so the
    // nearest-slot test matches what the player actually sees on screen.
    const playerCenterX = (game.player.position.x + GRID.CELL_SIZE / 2) / GRID.CELL_SIZE;
    const playerCenterY = (game.player.position.y + GRID.CELL_SIZE / 2) / GRID.CELL_SIZE;
    const INTERACTION_DISTANCE = 1.5;

    const slots = [
      { type: 'crafting-left',   x: CRAFTING.LEFT_SLOT_X,   y: CRAFTING.STATION_Y, range: 1.0 },
      { type: 'crafting-center', x: CRAFTING.CENTER_SLOT_X, y: CRAFTING.STATION_Y, range: 1.0 },
      { type: 'crafting-right',  x: CRAFTING.RIGHT_SLOT_X,  y: CRAFTING.STATION_Y, range: 1.0 },
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

    // Filter out consumable slots that are occupied by the magic meter — those
    // are display-only and must not accept SPACE / show the proximity highlight.
    const meter = game.player?.magicMeter;
    const meterSlots = (meter?.active && Array.isArray(meter.slots)) ? new Set(meter.slots) : null;
    const filteredSlots = meterSlots
      ? slots.filter(s => {
          const m = s.type.match(/^equipment-consumable(\d)$/);
          if (!m) return true;
          return !meterSlots.has(parseInt(m[1], 10) - 1);
        })
      : slots;

    let nearestSlot = null;
    let minDistance = Infinity;

    for (const slot of filteredSlots) {
      const range = slot.range ?? INTERACTION_DISTANCE;
      // Crafting slots: measure from the char column (x+1), not the bracket column (x)
      const measureX = slot.type.startsWith('crafting-') ? slot.x + 1 : slot.x;
      const dx = playerCenterX - measureX;
      const dy = playerCenterY - slot.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < range && distance < minDistance) {
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
    // Low-HP warning: blink dark red on the HP value (matches player char blink)
    if (game.player.hp > 0 && game.player.hp <= 3) {
      const blinkCycle = Math.floor(game.player.statusBlinkTimer / 0.25);
      game.ui.hp.style.color = blinkCycle % 2 === 0 ? '#660000' : '';
    } else if (game.ui.hp.style.color) {
      game.ui.hp.style.color = '';
    }
    game.ui.depth.textContent = game.getCurrentZoneDepth();

    const inventoryCount = game.player.inventory.length + game.inventorySystem.armorInventory.length + game.inventorySystem.consumableInventory.length;
    if (game.keys.tab) {
      game.ui.inventory.innerHTML = `<span style="color: ${COLORS.ITEM}">${inventoryCount}</span>`;
    } else if (inventoryCount > 20) {
      // Over-capacity warning: blink yellow to hint the player should bank by returning to REST.
      const blinkCycle = Math.floor((game.player.statusBlinkTimer ?? 0) / 0.35);
      const color = blinkCycle % 2 === 0 ? COLORS.ITEM : '#665500';
      game.ui.inventory.innerHTML = `<span style="color: ${color}">${inventoryCount}</span>`;
    } else {
      game.ui.inventory.textContent = inventoryCount;
    }

    // Individual slot elements — each pinned to a static position in CSS
    const slotEls  = [game.ui.slot1, game.ui.slot2, game.ui.slot3];
    const charEls  = [game.ui.weaponChar1, game.ui.weaponChar2, game.ui.weaponChar3];
    const SUBSCRIPTS = ['₁', '₂', '₃'];
    const INACTIVE_WEAPON = '#aa3333'; // dim red, matches canvas inactive chest tone

    for (let i = 0; i < 3; i++) {
      const el     = slotEls[i];
      const charEl = charEls[i];
      if (!el || !charEl) continue;
      const isDestroyed = game.player.destroyedSlots?.[i];

      if (isDestroyed) {
        charEl.textContent = 'X';
        charEl.style.color = '';
        el.style.color = INACTIVE_WEAPON;
        el.style.opacity = '1';
        continue;
      }

      const item = game.player.quickSlots[i];
      const isActive = i === game.player.activeSlotIndex;
      const color = isActive ? '#ffffff' : INACTIVE_WEAPON;

      charEl.textContent = item ? item.char : SUBSCRIPTS[i];
      charEl.style.color = item ? (item.color || '') : '';
      el.style.opacity = (item?.data?.type === 'TRAP' && item.charges === 0) ? '0.3' : '1';
      el.style.color = color;
    }

    // Armor display
    const armorChar = game.inventorySystem.equippedArmor ? game.inventorySystem.equippedArmor.char : ' ';
    const armorColor = game.inventorySystem.equippedArmor ? (game.inventorySystem.equippedArmor.color || '#aaaaff') : '#4488ff';
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
    const cslotEls = [
      game.ui.cslot1, game.ui.cslot2, game.ui.cslot3,
      game.ui.cslot4, game.ui.cslot5
    ];

    const meter = game.player?.magicMeter;
    for (let i = 0; i < 5; i++) {
      const el      = consumableEls[i];
      const cslotEl = cslotEls[i];
      if (!el) continue;

      // Magic-meter slot: render a mana fill block instead of a consumable char
      if (meter?.active && meter.slots?.includes(i)) {
        if (cslotEl) cslotEl.style.color = '#9966cc';
        el.textContent = _manaFillChar(meter.current, meter.max);
        el.style.color = _manaFillColor(meter.current, meter.max);
        el.style.opacity = '1';
        continue;
      }

      // Slots beyond maxConsumableSlots are locked — grey brackets and char
      if (i >= maxConsumableSlots) {
        if (cslotEl) cslotEl.style.color = '#333333';
        el.textContent = ' ';
        el.style.color = '#333333';
        el.style.opacity = '1';
        continue;
      }

      // Functional slot — reset bracket color to CSS default (yellow)
      if (cslotEl) cslotEl.style.color = '';

      // Functional unlocked slots
      if (consumables[i]) {
        const isBlinking = game.inventorySystem.consumableBlinkSlot === i
          && game.inventorySystem.consumableBlinkTimer > 0;
        const isEffectActive = (game.inventorySystem.activeEffectTimers?.[i] ?? 0) > 0;

        // Oils only fire on bow/dagger. Dim the slot when an oil is held
        // but the active weapon can't use it.
        const isOilInert = (() => {
          if (!consumables[i].data?.oilEffect) return false;
          const weapon = game.player?.quickSlots?.[game.player.activeSlotIndex];
          if (!weapon?.data) return true;
          return !(weapon.data.weaponType === 'BOW' || weapon.data.weaponSubtype === 'dagger');
        })();

        if (isBlinking && game.inventorySystem.consumableBlinkShowBlock) {
          el.textContent = '\u2588'; // █ solid block
          el.style.color = consumables[i].color || COLORS.ITEM;
          el.style.opacity = '1';
        } else {
          el.textContent = consumables[i].char;
          if (game.inventorySystem.consumableCooldowns[i] > 0) {
            el.style.color = '#666666';
            el.style.opacity = '1';
          } else if (isEffectActive) {
            // Slow pulse (800ms) while the consumable effect is running
            const blinkOn = (performance.now() % 800) < 400;
            el.style.color = consumables[i].color || COLORS.ITEM;
            el.style.opacity = blinkOn ? '1' : '0.25';
          } else {
            el.style.color = consumables[i].color || COLORS.ITEM;
            el.style.opacity = isOilInert ? '0.4' : '1';
          }
        }
      } else if (game.inventorySystem.spentConsumableSlots[i]) {
        el.textContent = ' ';
        el.style.color = '#333';
        el.style.opacity = '1';
      } else {
        el.textContent = ' ';
        el.style.color = '#555';
        el.style.opacity = '1';
      }
    }
  }

  // Open a slot menu and flag it to close on any movement key press.
  // Used for all equipment and chest slot menus (not crafting).
  _openSlotMenu() {
    this.closeOnMovement = true;
  }

  openEquipmentMenu(slotType) {
    const game = this.game;
    game.menuOpen = true;
    game.currentMenuSlot = slotType;
    game.selectedMenuIndex = 0;

    game.menuItems = game.inventorySystem.openEquipmentMenu(slotType);
    game.renderController.menuOverlay.render(game);
    this._openSlotMenu();
  }

  // Mana conversion menu: opens when player presses SPACE next to the
  // magic-meter slot. Lists ingredients in inventory whose mana values are
  // exposed in this phase (Phase 1: Goo only). Each entry converts one unit.
  openManaConversionMenu(slotIdx) {
    const game = this.game;
    const player = game.player;
    if (!player) return;

    // Phase 1: only Goo ('g') is exposed. Phase 2 expands to scale, fire
    // essence, ash, eye, herb, root, venom, gems.
    const PHASE_1_INGREDIENTS = ['g'];

    const counts = new Map();
    for (const ch of game.getActiveIngredients()) {
      counts.set(ch, (counts.get(ch) ?? 0) + 1);
    }

    const items = [];
    for (const ch of PHASE_1_INGREDIENTS) {
      const count = counts.get(ch) ?? 0;
      if (count === 0) continue;
      const data = game.getIngredientData(ch);
      const yieldAmount = 1; // Phase 1: 1 goo = 1 mana
      items.push({
        action: 'convert',
        char: ch,
        label: `${ch} - ${data?.name ?? ch} (x${count})  →  +${yieldAmount} mana`
      });
    }

    game.menuOpen = true;
    game.currentMenuSlot = 'mana-conversion';
    game.manaConversionSlot = slotIdx;
    game.selectedMenuIndex = 0;
    game.menuItems = items;
    game.renderController.menuOverlay.render(game);
    this._openSlotMenu();
  }

  openChestRetrievalMenu(slotIdx = null) {
    const game = this.game;
    game.menuOpen = true;
    game.currentMenuSlot = 'chest';
    game.chestTargetSlot = slotIdx;
    game.selectedMenuIndex = 0;

    game.menuItems = game.inventorySystem.getChestContents();
    game.renderController.menuOverlay.render(game);
    this._openSlotMenu();
  }

  openCraftingMenu(slotType) {
    const game = this.game;
    game.menuOpen = true;
    game.currentMenuSlot = slotType;
    game.selectedMenuIndex = 0;

    const weaponsList = [];
    const armorList = [];
    const consumableList = [];
    const equippedMenuItems = new Set();

    // Equipped weapons first (dedup priority), then chest
    for (const item of game.player.quickSlots) {
      if (item && !weaponsList.find(i => i.char === item.char)) {
        weaponsList.push(item);
        equippedMenuItems.add(item);
      }
    }
    for (const item of game.inventorySystem.itemChest) {
      if (!weaponsList.find(i => i.char === item.char)) {
        weaponsList.push(item);
      }
    }

    // Equipped armor first, then armor inventory
    const equippedArmor = game.inventorySystem.equippedArmor;
    if (equippedArmor && !armorList.find(i => i.char === equippedArmor.char)) {
      armorList.push(equippedArmor);
      equippedMenuItems.add(equippedArmor);
    }
    for (const item of game.inventorySystem.armorInventory) {
      if (!armorList.find(i => i.char === item.char)) {
        armorList.push(item);
      }
    }

    // Equipped consumables first, then consumable inventory
    for (const item of game.inventorySystem.equippedConsumables) {
      if (item && !consumableList.find(i => i.char === item.char)) {
        consumableList.push(item);
        equippedMenuItems.add(item);
      }
    }
    for (const item of game.inventorySystem.consumableInventory) {
      if (!consumableList.find(i => i.char === item.char)) {
        consumableList.push(item);
      }
    }

    game.equippedMenuItems = equippedMenuItems;

    const ingredientCounts = new Map();
    const ingredientList = [];
    for (const ingredientChar of game.getActiveIngredients()) {
      ingredientCounts.set(ingredientChar, (ingredientCounts.get(ingredientChar) ?? 0) + 1);
      if (!ingredientList.includes(ingredientChar)) {
        ingredientList.push(ingredientChar);
      }
    }
    // Coins live in the passive wallet, not in any ingredient pool. Surface
    // them here so recipes that consume `c` are still selectable.
    const coinCount = game.inventorySystem?.getCoinCount?.() ?? 0;
    if (coinCount > 0) {
      ingredientList.push('c');
      ingredientCounts.set('c', coinCount);
    }
    game.ingredientCounts = ingredientCounts;

    // Sort identified partners to top when opposite slot is filled
    const cs = game.craftingSystem;
    const otherSlot = slotType === 'left' ? cs.rightSlot : cs.leftSlot;
    if (otherSlot) {
      const partnerChars = cs.getIdentifiedPartners(otherSlot);
      const identifiedMap = new Map();
      for (const partnerChar of partnerChars) {
        const recipe = findRecipe(otherSlot, partnerChar);
        identifiedMap.set(partnerChar, recipe?.name ?? '');
      }
      game.identifiedMenuItems = identifiedMap;
      game.failedMenuItems = cs.getFailedPartners(otherSlot);
      ingredientList.sort((a, b) => {
        const rank = x => identifiedMap.has(x) ? 0 : game.failedMenuItems.has(x) ? 2 : 1;
        return rank(a) - rank(b);
      });
    } else {
      game.identifiedMenuItems = null;
      game.failedMenuItems = null;
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
    game.identifiedMenuItems = null;
    game.failedMenuItems = null;
    game.ingredientCounts = null;
    game.equippedMenuItems = null;
    game.manaConversionSlot = null;
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

    // Handle mana conversion (ingredient → magic meter)
    if (game.currentMenuSlot === 'mana-conversion') {
      if (selectedItem.action === 'convert') {
        const added = game.magicSystem?.convertIngredientToMana(game.player, selectedItem.char) ?? 0;
        if (added > 0) {
          game.audioSystem?.playSFX?.('pickup', 0.6);
          // Refresh menu so updated counts (or removal of empty entries) show
          this.openManaConversionMenu(game.manaConversionSlot ?? 0);
          game.updateUI();
        } else {
          // Either inventory empty for this char or meter is full — close
          this.closeMenu();
          game.updateUI();
        }
      }
      return;
    }

    // Handle press operations (oil press inside huts)
    if (game.currentMenuSlot === 'press') {
      const rawChar = typeof selectedItem === 'string' ? selectedItem : selectedItem.char;
      game.pressSystem?.commitSelection(rawChar);
      return;
    }

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

    if (game.currentMenuSlot === 'consumable4') {
      game.inventorySystem.equipConsumable(3, selectedItem);
      game.player.equippedConsumables = [...game.inventorySystem.equippedConsumables];
      game.saveGameState();
      game.renderer.markBackgroundDirty();
      game.closeMenu();
      game.updateUI();
      return;
    }

    if (game.currentMenuSlot === 'consumable5') {
      game.inventorySystem.equipConsumable(4, selectedItem);
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
        game.removeIngredient(selectedItem);
      } else {
        const quickSlotIdx = game.player.quickSlots.indexOf(selectedItem);
        if (quickSlotIdx !== -1) {
          game.player.quickSlots[quickSlotIdx] = null;
        } else if (game.inventorySystem.equippedArmor === selectedItem) {
          game.inventorySystem.equippedArmor = null;
        } else {
          const consumableIdx = game.inventorySystem.equippedConsumables.indexOf(selectedItem);
          if (consumableIdx !== -1) {
            game.inventorySystem.equippedConsumables[consumableIdx] = null;
            game.player.equippedConsumables = [...game.inventorySystem.equippedConsumables];
          } else if (selectedItem.data.type === 'WEAPON' || selectedItem.data.type === 'TRAP') {
            game.inventorySystem.retrieveFromChest(selectedItem);
          } else if (selectedItem.data.type === 'ARMOR') {
            const armorIndex = game.inventorySystem.armorInventory.indexOf(selectedItem);
            if (armorIndex > -1) game.inventorySystem.armorInventory.splice(armorIndex, 1);
          } else if (selectedItem.data.type === 'CONSUMABLE') {
            const consumableIndex = game.inventorySystem.consumableInventory.indexOf(selectedItem);
            if (consumableIndex > -1) game.inventorySystem.consumableInventory.splice(consumableIndex, 1);
          }
        }
      }

      if (game.currentMenuSlot === 'left') {
        game.craftingSystem.setLeftSlot(itemChar);
      } else if (game.currentMenuSlot === 'right') {
        game.craftingSystem.setRightSlot(itemChar);
      }

      if (game.craftingSystem.cycleState) {
        game.audioSystem.playStoppableSFX('craft_cycle', 0.6);
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
        game.removeIngredient(selectedItem);
      } else {
        const quickSlotIdx = game.player.quickSlots.indexOf(selectedItem);
        if (quickSlotIdx !== -1) {
          game.player.quickSlots[quickSlotIdx] = null;
        } else if (game.inventorySystem.equippedArmor === selectedItem) {
          game.inventorySystem.equippedArmor = null;
        } else {
          const consumableIdx = game.inventorySystem.equippedConsumables.indexOf(selectedItem);
          if (consumableIdx !== -1) {
            game.inventorySystem.equippedConsumables[consumableIdx] = null;
            game.player.equippedConsumables = [...game.inventorySystem.equippedConsumables];
          } else if (selectedItem.data.type === 'WEAPON' || selectedItem.data.type === 'TRAP') {
            game.inventorySystem.retrieveFromChest(selectedItem);
          } else if (selectedItem.data.type === 'ARMOR') {
            const armorIndex = game.inventorySystem.armorInventory.indexOf(selectedItem);
            if (armorIndex > -1) game.inventorySystem.armorInventory.splice(armorIndex, 1);
          } else if (selectedItem.data.type === 'CONSUMABLE') {
            const consumableIndex = game.inventorySystem.consumableInventory.indexOf(selectedItem);
            if (consumableIndex > -1) game.inventorySystem.consumableInventory.splice(consumableIndex, 1);
          }
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
      game.audioSystem.stopSFXByName('craft_cycle');
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
      game.audioSystem.stopSFXByName('craft_cycle');
      const char = game.craftingSystem.clearRightSlot();
      if (char) this._returnSlotItemToInventory(char);
      game.renderer.markBackgroundDirty();
      game.updateUI();
      return;
    }

    if (slotType === 'crafting-center') {
      if (game.craftingSystem.hasCenterContent()) {
        game.audioSystem.stopSFXByName('craft_cycle');
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
          } else if (item.data.type === 'INGREDIENT') {
            game.addIngredient(item.char);
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
      game.addIngredient(char);
    } else if (isItem(char)) {
      const item = new Item(char, game.player.position.x, game.player.position.y);
      if (item.data.type === 'ARMOR') {
        game.inventorySystem.armorInventory.push(item);
      } else if (item.data.type === 'CONSUMABLE') {
        game.inventorySystem.consumableInventory.push(item);
      } else if (item.data.type === 'WEAPON' || item.data.type === 'TRAP') {
        const dropped = game.player.pickupItem(item);
        if (dropped) game.inventorySystem.addToChest(dropped);
      } else if (item.data.type === 'INGREDIENT') {
        game.addIngredient(char);
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
      if (game.craftingSystem.cycleState) {
        game.audioSystem.playStoppableSFX('craft_cycle', 0.6);
      }
      game.renderer.markBackgroundDirty();
      game.updateUI();
      return;
    }

    if (slotType === 'crafting-right' && !game.craftingSystem.rightSlot) {
      game.craftingSystem.setRightSlot(game.player.heldItem.char);
      game.player.quickSlots[game.player.activeSlotIndex] = null;
      if (game.craftingSystem.cycleState) {
        game.audioSystem.playStoppableSFX('craft_cycle', 0.6);
      }
      game.renderer.markBackgroundDirty();
      game.updateUI();
    }
  }
}

// ─── Magic meter helpers ───────────────────────────────────────────────────

const MANA_FILL_BLOCKS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];

function _manaFillChar(current, max) {
  if (max <= 0) return '▁';
  const ratio = Math.max(0, Math.min(1, current / max));
  const idx = Math.round(ratio * (MANA_FILL_BLOCKS.length - 1));
  return MANA_FILL_BLOCKS[idx];
}

function _manaFillColor(current, max) {
  if (current <= 0) return '#553377';
  if (current >= max) return '#ffaaff';
  return '#cc66ff';
}
