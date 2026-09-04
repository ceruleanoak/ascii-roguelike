import { Item } from '../entities/Item.js';
import { Shopkeeper } from '../entities/Shopkeeper.js';
import { menuIntent } from './MenuInput.js';
import { ShopOverlay } from '../rendering/ui/ShopOverlay.js';
import { computePawnSellValue } from '../data/shopPricing.js';

/**
 * ShopSystem — the Settlement Shopkeeper's paid barter flow.
 *
 * SPACE near the hut Shopkeeper opens a PauseSystem modal on a front-layer
 * menu choosing WARES (buy) or PAWN (sell) — modes below. Every WARES
 * listing is purchasable up to three ways: toggled real ingredients (padded
 * beyond the item's actual 2-ingredient recipe — a deliberately worse deal
 * than crafting), a shrinking coin balance, or a Treasure substitute — tier
 * 1+ only (row.treasureCount copies of the same gem char; tier 0 listings
 * have no Treasure lane at all). See src/data/shopPricing.js for how each
 * listing's costs are rolled.
 *
 * Modes:
 *   'menu'   — Up/Down (W/S) moves menuIndex across WARES/PAWN. Confirm
 *              enters 'list' or 'pawn'. Shift closes the shop.
 *   'list'   — Up/Down (W/S) moves rowIndex across the 6 fixed rows (armor,
 *              weapon, weapon, consumable×3). Confirm on an unsold row opens
 *              barter mode for it. Shift returns to 'menu'.
 *   'barter' — Left/Right (A/D) moves barterIndex across that row's lane
 *              strip: one lane per ingredient char, then Coins, then
 *              Treasure (only present when row.treasureChar is non-null).
 *              Confirm toggles the highlighted lane — unless the row's cost
 *              is already met, in which case Confirm completes the purchase.
 *              Shift returns to 'list' and clears every toggle on that row.
 *   'pawn'   — Up/Down (W/S) moves pawnIndex across everything the player is
 *              carrying: the weapon quick slots, worn armor and equipped
 *              consumables, plus the banked itemChest and armor/consumable
 *              spares. Never ingredients (their own economy) or key items
 *              (narrative keys are not for sale). Confirm sells the
 *              highlighted item outright for its shown coin value. Shift
 *              returns to 'menu'. An empty list shows EMPTY and auto-returns
 *              to 'menu' after 2s if Shift isn't pressed first.
 *
 * "Cost met" is `treasureToggled || coinsToggled` — toggling ingredients
 * alone only shrinks the coin balance, it never completes a purchase by
 * itself; Coins (at whatever the reduced price is) or Treasure alone always
 * finishes the trade.
 */
export class ShopSystem {
  constructor(game) {
    this.game = game;
    this.overlay = new ShopOverlay();

    this.shopkeeper = null;
    this.mode = 'menu';
    this.menuIndex = 0;   // 0 = WARES, 1 = PAWN
    this.rowIndex = 0;
    this.barterIndex = 0;
    this.currentRow = null;
    this.lanes = [];      // [{type:'ingredient',char}, ..., {type:'coins'}, {type:'treasure',char}]
    this.toggled = [];    // parallel boolean array to lanes
    this.pawnEntries = []; // [{item, source, value}] — built fresh on _enterPawn
    this.pawnIndex = 0;
    this.pawnEmptyAt = null; // timestamp EMPTY was first shown; null when not applicable

    this.openedAt = 0;
    this.inputReadyAt = 0;
  }

  /** SPACE dispatch — returns true when the press was consumed. */
  trySpacePress() {
    const game = this.game;
    const player = game.player;
    if (!player?.inHut || !game.activeFloor) return false;

    const shopkeeper = game.activeFloor.npcs?.find(n => n instanceof Shopkeeper);
    if (!shopkeeper) return false;
    if (!shopkeeper.isInRange(player)) return false;

    this.open(shopkeeper);
    return true;
  }

  open(shopkeeper) {
    if (!this.game.pauseSystem.openModal(this)) return;
    this.shopkeeper = shopkeeper;
    this.mode = 'menu';
    this.menuIndex = 0;
    this.rowIndex = 0;
    this._clearBarter();
    this._clearPawn();
    this.openedAt = performance.now();
    // Brief input lockout, same reasoning + window as SlotReplacementSystem:
    // the SPACE press that opened the shop can't also register as a menu action.
    this.inputReadyAt = this.openedAt + 1000;
  }

  // ── PauseSystem modal contract ───────────────────────────────────────────

  handleKey(key, event) {
    if (event?.repeat) return;
    if (performance.now() < this.inputReadyAt) return;
    const intent = menuIntent(event);
    if (!intent) return;

    if (this.mode === 'menu') this._handleMenuInput(intent);
    else if (this.mode === 'list') this._handleListInput(intent);
    else if (this.mode === 'pawn') this._handlePawnInput(intent);
    else this._handleBarterInput(intent);
  }

  render(renderer, game) {
    this._checkPawnAutoReturn();
    this.overlay.render(renderer, game, this);
  }

  // Render is called every frame the modal is open regardless of input, so
  // it's the one reliable per-frame hook available here (the PauseSystem
  // modal contract has no update() — see its header comment). An empty PAWN
  // list auto-backs to the front menu 2s after being shown, unless Shift
  // already returned manually first (which no-ops this by leaving 'pawn').
  _checkPawnAutoReturn() {
    if (this.mode !== 'pawn' || this.pawnEmptyAt === null) return;
    if (performance.now() - this.pawnEmptyAt >= 2000) {
      this.mode = 'menu';
      this._clearPawn();
    }
  }

  onClose() {
    this.shopkeeper = null;
    this.mode = 'menu';
    this.menuIndex = 0;
    this._clearBarter();
    this._clearPawn();
  }

  // ── Front-layer menu (WARES / PAWN) ─────────────────────────────────────

  _handleMenuInput(intent) {
    if (intent === 'up') {
      this.menuIndex = Math.max(0, this.menuIndex - 1);
    } else if (intent === 'down') {
      this.menuIndex = Math.min(1, this.menuIndex + 1);
    } else if (intent === 'confirm') {
      if (this.menuIndex === 0) {
        this.mode = 'list';
        this.rowIndex = 0;
      } else {
        this._enterPawn();
      }
    } else if (intent === 'shift') {
      this.game.pauseSystem.closeModal();
    }
  }

  // ── List mode (WARES) ───────────────────────────────────────────────────

  _handleListInput(intent) {
    const stock = this.shopkeeper.stock;
    if (intent === 'up') {
      this.rowIndex = Math.max(0, this.rowIndex - 1);
    } else if (intent === 'down') {
      this.rowIndex = Math.min(stock.length - 1, this.rowIndex + 1);
    } else if (intent === 'confirm') {
      const row = stock[this.rowIndex];
      if (!row.sold) this._enterBarter(row);
    } else if (intent === 'shift') {
      this.mode = 'menu';
    }
  }

  _enterBarter(row) {
    this.mode = 'barter';
    this.currentRow = row;
    this.barterIndex = 0;
    this.lanes = [
      ...row.ingredientCost.map(char => ({ type: 'ingredient', char })),
      { type: 'coins' },
      // Tier 0 listings have no Treasure lane at all (row.treasureChar is
      // null — see shopPricing.js's TIER_TREASURE_COUNT).
      ...(row.treasureChar ? [{ type: 'treasure', char: row.treasureChar }] : []),
    ];
    this.toggled = this.lanes.map(() => false);
  }

  _clearBarter() {
    this.currentRow = null;
    this.barterIndex = 0;
    this.lanes = [];
    this.toggled = [];
  }

  // ── Barter mode ──────────────────────────────────────────────────────────

  _handleBarterInput(intent) {
    if (intent === 'left') {
      this.barterIndex = Math.max(0, this.barterIndex - 1);
    } else if (intent === 'right') {
      this.barterIndex = Math.min(this.lanes.length - 1, this.barterIndex + 1);
    } else if (intent === 'shift') {
      // Returns to the row list; per spec, also untoggles every cost option on this row.
      this.mode = 'list';
      this._clearBarter();
    } else if (intent === 'confirm') {
      if (this.isCostMet()) this._confirmPurchase();
      else this._toggleLane(this.barterIndex);
    }
  }

  _toggleLane(idx) {
    const lane = this.lanes[idx];
    const inv = this.game.inventorySystem;

    if (this.toggled[idx]) {
      this.toggled[idx] = false;
      return;
    }

    if (lane.type === 'ingredient') {
      // Duplicate-char guard: a few real recipes self-pair (e.g. 'b'+'b' Bone
      // Armor). Count how many OTHER already-toggled lanes share this char —
      // toggling on requires strictly more copies held than that.
      const alreadyToggledSameChar = this.lanes.filter(
        (l, i) => l.type === 'ingredient' && l.char === lane.char && this.toggled[i]
      ).length;
      if (inv.countIngredient(lane.char) <= alreadyToggledSameChar) {
        this._playError();
        return;
      }
      this.toggled[idx] = true;
      // The coin balance just changed — force a re-confirm at the new price.
      const coinsIdx = this.lanes.findIndex(l => l.type === 'coins');
      if (coinsIdx !== -1) this.toggled[coinsIdx] = false;
    } else if (lane.type === 'coins') {
      if (!inv.hasCoin(this.getRemainingCoinPrice())) {
        this._playError();
        return;
      }
      this.toggled[idx] = true;
    } else if (lane.type === 'treasure') {
      // Tier 2/3 listings require multiple copies of the same treasure char
      // (this.currentRow.treasureCount), not just one.
      if (inv.countIngredient(lane.char) < this.currentRow.treasureCount) {
        this._playError();
        return;
      }
      this.toggled[idx] = true;
    }
  }

  _playError() {
    this.game.audioSystem?.playSFX?.('shop_error');
  }

  /** Even, remainder-distributed share of (baseCoins - coinFloor) per ingredient lane. */
  _ingredientShares() {
    const row = this.currentRow;
    const ingredientLaneCount = this.lanes.filter(l => l.type === 'ingredient').length;
    const reducible = row.baseCoins - row.coinFloor;
    const base = Math.floor(reducible / ingredientLaneCount);
    const remainder = reducible % ingredientLaneCount;

    const shares = {};
    let ordinal = 0;
    for (let i = 0; i < this.lanes.length; i++) {
      if (this.lanes[i].type !== 'ingredient') continue;
      shares[i] = base + (ordinal < remainder ? 1 : 0);
      ordinal++;
    }
    return shares;
  }

  /** Current coin price after toggled-ingredient reductions (never below coinFloor). */
  getRemainingCoinPrice() {
    const row = this.currentRow;
    const shares = this._ingredientShares();
    let price = row.baseCoins;
    for (let i = 0; i < this.lanes.length; i++) {
      if (this.lanes[i].type === 'ingredient' && this.toggled[i]) price -= shares[i];
    }
    return Math.max(row.coinFloor, price);
  }

  isCostMet() {
    const treasureIdx = this.lanes.findIndex(l => l.type === 'treasure');
    const coinsIdx = this.lanes.findIndex(l => l.type === 'coins');
    return (treasureIdx !== -1 && this.toggled[treasureIdx]) || (coinsIdx !== -1 && this.toggled[coinsIdx]);
  }

  _confirmPurchase() {
    const game = this.game;
    const inv = game.inventorySystem;
    const row = this.currentRow;
    const treasureIdx = this.lanes.findIndex(l => l.type === 'treasure');
    const usingTreasure = treasureIdx !== -1 && this.toggled[treasureIdx];

    if (usingTreasure) {
      for (let i = 0; i < row.treasureCount; i++) inv.removeIngredient(row.treasureChar);
    } else {
      for (let i = 0; i < this.lanes.length; i++) {
        if (this.lanes[i].type === 'ingredient' && this.toggled[i]) {
          inv.removeIngredient(this.lanes[i].char);
        }
      }
      inv.removeCoin(this.getRemainingCoinPrice());
    }

    row.sold = true;
    const player = game.player;
    const result = this._tryDeliverItem(row, player);

    // Full quick/armor/consumable slots: SlotReplacementSystem must be the
    // only active modal (PauseSystem allows one at a time), so close the
    // shop and hand off. tryPickupItem is a no-op in this branch — nothing
    // was spliced/consumed — so it's safe to have called it before closing.
    // The player re-opens the shop with SPACE afterward to keep shopping.
    if (result.needsSlotChoice) {
      game.pauseSystem.closeModal();
      game.slotReplacementSystem.maybeOpen(result);
      return;
    }

    if (result.success) {
      if (result.message) game.showPickupMessage(result.message);
      if (result.pickedUpType === 'WEAPON') game.audioSystem.playSFX('weapon_pickup');
      game.updateUI();
    }
    // Borrowed from the well/camp-NPC/fisherman/weapons-master coin arcs for
    // parity — same purchase cue, no visual arc (the menu already confirms
    // the transaction, so there's nothing for an animation to add here).
    game.audioSystem?.playSFX?.('coin_plink');

    // Shop stays open for additional purchases — back to the row list with
    // this row now marked sold, rather than closing after every buy.
    this.mode = 'list';
    this._clearBarter();
  }

  /**
   * Runs the purchased item through InventorySystem.tryPickupItem, same
   * pipeline a ground pickup uses, against a private one-item scratch array
   * (not game.items, since tryPickupItem returns on the first item within
   * range and a hut's own spawned bread loaf could otherwise get picked up
   * instead). Returns the raw result — _confirmPurchase decides what to do
   * with it, since a needsSlotChoice result has to close the shop's own
   * modal first.
   */
  _tryDeliverItem(row, player) {
    const game = this.game;
    const scratch = [new Item(row.char, player.position.x, player.position.y)];
    return game.inventorySystem.tryPickupItem(
      scratch, game.placedTraps, player, game.physicsSystem,
      true, 0, 0, game.renderer
    );
  }

  // ── Pawn mode ────────────────────────────────────────────────────────────
  //
  // Sells everything the player is carrying — the weapon quick slots, worn
  // armor and equipped consumables — plus their banked storage (itemChest,
  // armorInventory, consumableInventory). Carried gear is in the list on
  // purpose: mid-run the banked piles are usually empty (a picked-up weapon
  // goes straight to a quick slot, and equipping armor splices it OUT of
  // armorInventory), so a banked-only list showed the player nothing they
  // owned. Selling your last weapon is allowed and is the player's call.
  //
  // Still excluded: the ingredient pile (a separate, much larger economy
  // already spent at the press/cauldron) and keyItemInventory (narrative
  // keys are never for sale). A unique, much simpler scrollable list than
  // the REST crafting screen — one flat row per owned Item instance, no
  // ingredient pairing or recipe lookups involved.

  _enterPawn() {
    this.mode = 'pawn';
    this.pawnIndex = 0;
    this.pawnEntries = this._buildPawnEntries();
    this.pawnEmptyAt = this.pawnEntries.length === 0 ? performance.now() : null;
  }

  // Carried first, banked after — the loadout is what the player is thinking
  // about when they walk up to the counter. `slot` is only meaningful for the
  // indexed sources ('quick', 'equippedConsumable'); _sellPawnEntry reads it
  // back to know which slot to empty.
  _buildPawnEntries() {
    const inv = this.game.inventorySystem;
    const player = this.game.player;
    const entries = [];

    (player?.quickSlots || []).forEach((item, slot) => {
      if (item) entries.push({ item, source: 'quick', slot });
    });
    const worn = inv.getEquippedArmor();
    if (worn) entries.push({ item: worn, source: 'equippedArmor', slot: -1 });
    (inv.getEquippedConsumables() || []).forEach((item, slot) => {
      // A spent one-shot slot still holds its Item for the HUD to grey out —
      // it's already used up, so there's nothing left to sell.
      if (item && !inv.getSpentConsumableSlots()?.[slot]) {
        entries.push({ item, source: 'equippedConsumable', slot });
      }
    });

    for (const item of inv.getItemChest()) entries.push({ item, source: 'chest' });
    for (const item of inv.getArmorInventory()) entries.push({ item, source: 'armor' });
    for (const item of inv.getConsumableInventory()) entries.push({ item, source: 'consumable' });

    for (const entry of entries) entry.value = computePawnSellValue(entry.item.data);
    return entries;
  }

  _clearPawn() {
    this.pawnEntries = [];
    this.pawnIndex = 0;
    this.pawnEmptyAt = null;
  }

  _handlePawnInput(intent) {
    if (intent === 'up') {
      this.pawnIndex = Math.max(0, this.pawnIndex - 1);
    } else if (intent === 'down') {
      this.pawnIndex = Math.min(this.pawnEntries.length - 1, this.pawnIndex + 1);
    } else if (intent === 'confirm') {
      this._sellPawnEntry(this.pawnIndex);
    } else if (intent === 'shift') {
      this.mode = 'menu';
      this._clearPawn();
    }
  }

  /**
   * Sells one entry outright: removes it from whichever source it came from,
   * credits its coin value, then drops the row from the list. A row is one
   * full sale, never a partial stack peel — a stacked trap (item.count > 1)
   * sits behind a single entry whether it's in the chest or a quick slot, so
   * both pay out per unit and clear the whole stack.
   *
   * Carried sources route through InventorySystem.removeCarriedItem, which
   * empties the slot and re-projects equipment onto the player (selling worn
   * armor has to give its defense back); banked sources use the plain
   * array-removal helpers, which have no player-facing stat to undo.
   */
  _sellPawnEntry(idx) {
    const entry = this.pawnEntries[idx];
    if (!entry) return;
    const inv = this.game.inventorySystem;
    const units = entry.item.count || 1;

    if (entry.source === 'chest') {
      for (let i = 0; i < units; i++) inv.retrieveFromChest(entry.item);
      inv.addCoin(entry.value * units);
    } else if (entry.source === 'armor' || entry.source === 'consumable') {
      if (entry.source === 'armor') inv.removeFromArmorInventory(entry.item);
      else inv.removeFromConsumableInventory(entry.item);
      inv.addCoin(entry.value);
    } else {
      inv.removeCarriedItem(entry.source, entry.slot, this.game.player);
      inv.addCoin(entry.value * units);
    }

    this.pawnEntries.splice(idx, 1);
    this.pawnIndex = Math.min(this.pawnIndex, this.pawnEntries.length - 1);
    // Selling the last item empties the list same as entering with nothing —
    // starts the same EMPTY + 2s auto-return as _enterPawn.
    if (this.pawnEntries.length === 0) this.pawnEmptyAt = performance.now();

    this.game.updateUI();
    this.game.audioSystem?.playSFX?.('coin_plink');
  }
}
