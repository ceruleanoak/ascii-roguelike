import { GAME_STATES } from '../game/GameConfig.js';
import { menuIntent } from './MenuInput.js';
import { SlotReplacementOverlay } from '../rendering/ui/SlotReplacementOverlay.js';
import { findRecipeByResult } from '../data/recipes.js';

/**
 * SlotReplacementSystem — paused slot-choice prompt for full quick slots.
 *
 * When the player picks up a quick-slot item (weapon/trap) with all three
 * usable slots occupied, the old behavior silently displaced the active slot
 * — easy to do by accident on a no-combat item like Bread and lose a key
 * loadout piece. Instead, this system opens a PauseSystem modal: the world
 * freezes, a popup shows the three quick slots with a ▼ cursor, plus a
 * STORE IN CHEST option below.
 *
 * Controls (WASD and arrows both supported):
 *   A/D, ←/→        — move cursor between usable slots
 *   S, ↓            — jump to STORE IN CHEST
 *   W, ↑            — back up to the slot row
 *   SPACE / ENTER   — confirm selection
 *   SHIFT           — fast path: store in chest immediately and close
 *
 * The item stays on the ground (game is paused) until a choice is confirmed.
 * Replacing a slot reuses Player.pickupItem so trap-charge affinity and the
 * displaced-item → chest routing match a normal pickup exactly.
 */
export class SlotReplacementSystem {
  constructor(game) {
    this.game = game;
    this.overlay = new SlotReplacementOverlay();
    this.pendingItem = null;
    this.slotType = 'weapon';   // 'weapon' | 'armor' | 'consumable'
    this.selection = 0;
    this.lastSlotSelection = 0;
    this.inputReadyAt = 0;
  }

  get storeIndex() {
    if (this.slotType === 'armor') return 1;
    if (this.slotType === 'consumable') return this.game.inventorySystem.equippedConsumables.length;
    return 3;
  }

  /** DISMANTLE option index — only present when the pending item has a known recipe. */
  get dismantleIndex() {
    if (!this.pendingItem) return -1;
    return findRecipeByResult(this.pendingItem.char) ? this.storeIndex + 1 : -1;
  }

  /** Indices in equippedConsumables currently claimed by the magic meter — not real consumable slots. */
  _reservedManaSlots() {
    const meter = this.game.player.magicMeter;
    return meter?.active ? (meter.slots || []) : [];
  }

  /** Dispatch helper for main.js: opens the prompt when a pickup result asks for it. */
  maybeOpen(result) {
    if (!result?.needsSlotChoice) return false;
    this.open(result.pendingItem, result.slotType || 'weapon');
    return true;
  }

  /** Open the prompt for a ground item. Item is NOT yet removed from the world. */
  open(item, slotType = 'weapon') {
    this.slotType = slotType;
    let start = 0;
    if (slotType === 'weapon') {
      const player = this.game.player;
      start = player.activeSlotIndex;
      if (player.destroyedSlots?.[start]) {
        start = player.quickSlots.findIndex((_, i) => !player.destroyedSlots?.[i]);
        if (start === -1) return;
      }
    } else if (slotType === 'consumable') {
      const reserved = this._reservedManaSlots();
      const equipped = this.game.inventorySystem.equippedConsumables;
      start = equipped.findIndex((_, i) => !reserved.includes(i));
      // Every real slot is a mana slot (e.g. Yellow Mage's single starting
      // slot) — land on STORE IN CHEST, the only real destination.
      if (start === -1) start = this.storeIndex;
    }
    if (!this.game.pauseSystem.openModal(this)) return;
    this.pendingItem = item;
    this.selection = start;
    this.lastSlotSelection = start;
    // Ignore input for a beat so the pickup's own keypress (or any residual
    // held key) can't immediately confirm a slot and replace an item by accident.
    // The overlay fades the options in over this same window so the delay reads
    // as intentional rather than an unresponsive menu.
    this.openedAt = performance.now();
    this.inputReadyAt = this.openedAt + 1000;
  }

  // ── PauseSystem modal contract ───────────────────────────────────────────

  handleKey(key, event) {
    if (event?.repeat) return; // held SPACE/SHIFT from the pickup press must not auto-confirm
    if (performance.now() < this.inputReadyAt) return; // brief lockout guards against accidental replacement
    const intent = menuIntent(event);

    // Number key shortcuts: slots, then STORE IN CHEST, then DISMANTLE (if available)
    if (key >= '1' && key <= '5') {
      const optionIdx = parseInt(key) - 1;
      const maxIdx = this.dismantleIndex !== -1 ? this.dismantleIndex : this.storeIndex;
      if (optionIdx > maxIdx) return;
      const reserved = this.slotType === 'consumable' ? this._reservedManaSlots() : [];
      if (optionIdx < this.storeIndex && reserved.includes(optionIdx)) return;
      this.selection = optionIdx;
      if (optionIdx < this.storeIndex) {
        this.lastSlotSelection = optionIdx;
      }
      // Confirm immediately on number press
      if (optionIdx === this.storeIndex) this._confirmStore();
      else if (optionIdx === this.dismantleIndex) this._confirmDismantle();
      else this._confirmSlot(optionIdx);
      return;
    }

    if (intent === 'shift') {
      this._confirmStore(); // fast path: straight to chest, no navigation
    } else if (intent === 'left') {
      this._moveSlot(-1);
    } else if (intent === 'right') {
      this._moveSlot(1);
    } else if (intent === 'down') {
      if (this.selection === this.storeIndex && this.dismantleIndex !== -1) {
        this.selection = this.dismantleIndex;
      } else if (this.selection !== this.storeIndex && this.selection !== this.dismantleIndex) {
        this.lastSlotSelection = this.selection;
        this.selection = this.storeIndex;
      }
    } else if (intent === 'up') {
      if (this.selection === this.dismantleIndex) {
        this.selection = this.storeIndex;
      } else if (this.selection === this.storeIndex) {
        this.selection = this.lastSlotSelection;
      }
    } else if (intent === 'confirm') {
      if (this.selection === this.storeIndex) this._confirmStore();
      else if (this.selection === this.dismantleIndex) this._confirmDismantle();
      else this._confirmSlot(this.selection);
    }
  }

  render(renderer, game) {
    this.overlay.render(renderer, game, this);
  }

  onClose() {
    this.pendingItem = null;
  }

  // ── Internals ────────────────────────────────────────────────────────────

  _moveSlot(dir) {
    if (this.selection === this.storeIndex) return;
    const maxSlot = this.storeIndex - 1;
    if (this.slotType === 'weapon') {
      const destroyed = this.game.player.destroyedSlots || [];
      for (let idx = this.selection + dir; idx >= 0 && idx <= maxSlot; idx += dir) {
        if (!destroyed[idx]) { this.selection = idx; return; }
      }
    } else if (this.slotType === 'consumable') {
      const reserved = this._reservedManaSlots();
      for (let idx = this.selection + dir; idx >= 0 && idx <= maxSlot; idx += dir) {
        if (!reserved.includes(idx)) { this.selection = idx; return; }
      }
    } else {
      const next = this.selection + dir;
      if (next >= 0 && next <= maxSlot) this.selection = next;
    }
  }

  /** Remove the pending item from the world (it stayed on the ground while open). */
  _takeFromWorld() {
    const game = this.game;
    const item = this.pendingItem;
    const idx = game.items.indexOf(item);
    if (idx > -1) game.items.splice(idx, 1);
    game.physicsSystem.removeEntity(item);
    return item;
  }

  _routeToChest(item) {
    const game = this.game;
    if (game.stateMachine.getCurrentState() === GAME_STATES.EXPLORE) {
      game.inventorySystem.deferToChest(item);
    } else {
      game.inventorySystem.addToChest(item);
    }
  }

  _confirmSlot(slotIdx) {
    const game = this.game;
    const item = this._takeFromWorld();

    if (this.slotType === 'armor') {
      const inv = game.inventorySystem;
      // Grab old before equip; null it out so equipArmor won't push it to armorInventory
      const displaced = inv.equippedArmor;
      inv.equippedArmor = null;
      inv.armorInventory.push(item);
      inv.equipArmor(item);
      inv.applyEquipmentEffectsToPlayer(game.player);
      // Displaced armor returns to the armor inventory — NOT the chest, which is
      // weapon-only storage (openCraftingMenu reads it into the weapons column,
      // so a chest-routed armor/consumable would show up under weapons).
      if (displaced) {
        inv.armorInventory.push(displaced);
        game.audioSystem.playSFX('slot_swap');
      }
    } else if (this.slotType === 'consumable') {
      const inv = game.inventorySystem;
      // Grab old before equip; null it out so equipConsumable won't push it to consumableInventory
      const displaced = inv.equippedConsumables[slotIdx];
      inv.equippedConsumables[slotIdx] = null;
      inv.consumableInventory.push(item);
      inv.equipConsumable(slotIdx, item);
      inv.applyEquipmentEffectsToPlayer(game.player);
      // Displaced consumable returns to the consumable inventory, not the chest.
      if (displaced) {
        inv.consumableInventory.push(displaced);
        game.audioSystem.playSFX('slot_swap');
      }
    } else {
      // Weapon/trap: reuse Player.pickupItem
      game.player.activeSlotIndex = slotIdx;
      const displaced = game.player.pickupItem(item);
      if (displaced) {
        this._routeToChest(displaced);
        game.audioSystem.playSFX('slot_swap');
      }
      if (item.data.type === 'WEAPON' && game.stateMachine.getCurrentState() === GAME_STATES.EXPLORE) {
        game.audioSystem.playSFX('weapon_pickup');
      }
    }

    game.showPickupMessage(item.data.name);
    game.updateUI();
    // REST equipment slots draw their glyphs to the background layer, which is
    // only cleared on a dirty mark. Without this, the displaced item's glyph
    // lingers under the newly-equipped one (both render). Mirrors the
    // markBackgroundDirty() every MenuSystem equip path already issues.
    game.renderer.markBackgroundDirty();
    game.pauseSystem.closeModal();
  }

  _confirmStore() {
    // No pickup message — the popup interaction itself is the feedback
    // (non-instructive UI compliance: no "X → Y" text).
    const item = this._takeFromWorld();
    const inv = this.game.inventorySystem;
    if (this.slotType === 'armor') {
      // Armor inventory feeds the armor equipment slot — NOT itemChest (weapon-only).
      inv.armorInventory.push(item);
    } else if (this.slotType === 'consumable') {
      inv.consumableInventory.push(item);
    } else {
      this._routeToChest(item);
    }
    this.game.updateUI();
    this.game.pauseSystem.closeModal();
  }

  /** Break the pending item back down into its recipe ingredients instead of keeping it. */
  _confirmDismantle() {
    const item = this._takeFromWorld();
    const recipe = findRecipeByResult(item.char);
    if (recipe) {
      this.game.addIngredient(recipe.left);
      this.game.addIngredient(recipe.right);
    }
    this.game.updateUI();
    this.game.pauseSystem.closeModal();
  }
}
