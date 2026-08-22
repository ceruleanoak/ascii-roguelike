import { GRID } from '../game/GameConfig.js';
import { Item } from '../entities/Item.js';
import { Shopkeeper } from '../entities/Shopkeeper.js';
import { menuIntent } from './MenuInput.js';
import { ShopOverlay } from '../rendering/ui/ShopOverlay.js';

const COIN_ARC_DURATION = 0.55; // matches the well/camp-NPC/fisherman/weapons-master coin arcs

/**
 * ShopSystem — the Settlement Shopkeeper's paid barter flow.
 *
 * SPACE near the hut Shopkeeper opens a PauseSystem modal (list/barter state
 * machine below). Every listing is purchasable three ways: toggled real
 * ingredients (padded beyond the item's actual 2-ingredient recipe — a
 * deliberately worse deal than crafting), a shrinking coin balance, or a
 * single specific Treasure item as a full-price substitute. See
 * src/data/shopPricing.js for how each listing's costs are rolled.
 *
 * Modes:
 *   'list'   — Up/Down (W/S) moves rowIndex across the 6 fixed rows (armor,
 *              weapon, weapon, consumable×3). Confirm on an unsold row opens
 *              barter mode for it. Shift closes the shop.
 *   'barter' — Left/Right (A/D) moves barterIndex across that row's lane
 *              strip: one lane per ingredient char, then Coins, then
 *              Treasure. Confirm toggles the highlighted lane — unless the
 *              row's cost is already met, in which case Confirm completes
 *              the purchase. Shift returns to 'list' and clears every toggle
 *              on that row.
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
    this.mode = 'list';
    this.rowIndex = 0;
    this.barterIndex = 0;
    this.currentRow = null;
    this.lanes = [];      // [{type:'ingredient',char}, ..., {type:'coins'}, {type:'treasure',char}]
    this.toggled = [];    // parallel boolean array to lanes

    this.openedAt = 0;
    this.inputReadyAt = 0;
    this.coinAnim = null; // { startX, startY, endX, endY, t, spinPhase, shopkeeper }
  }

  getCoinAnim() {
    return this.coinAnim;
  }

  /** SPACE dispatch — returns true when the press was consumed. */
  trySpacePress() {
    const game = this.game;
    const player = game.player;
    if (!player?.inHut || !game.activeFloor) return false;

    const shopkeeper = game.activeFloor.npcs?.find(n => n instanceof Shopkeeper);
    if (!shopkeeper) return false;
    if (!shopkeeper.isInRange(player)) return false;

    // Purchase anim in progress — swallow the press so SPACE can't reopen the shop.
    if (this.coinAnim) return true;

    this.open(shopkeeper);
    return true;
  }

  open(shopkeeper) {
    if (!this.game.pauseSystem.openModal(this)) return;
    this.shopkeeper = shopkeeper;
    this.mode = 'list';
    this.rowIndex = 0;
    this._clearBarter();
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

    if (this.mode === 'list') this._handleListInput(intent);
    else this._handleBarterInput(intent);
  }

  render(renderer, game) {
    this.overlay.render(renderer, game, this);
  }

  onClose() {
    this.shopkeeper = null;
    this.mode = 'list';
    this._clearBarter();
  }

  // ── List mode ────────────────────────────────────────────────────────────

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
      this.game.pauseSystem.closeModal();
    }
  }

  _enterBarter(row) {
    this.mode = 'barter';
    this.currentRow = row;
    this.barterIndex = 0;
    this.lanes = [
      ...row.ingredientCost.map(char => ({ type: 'ingredient', char })),
      { type: 'coins' },
      { type: 'treasure', char: row.treasureChar },
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
      if (!inv.hasIngredient(lane.char)) {
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
      inv.removeIngredient(row.treasureChar);
    } else {
      for (let i = 0; i < this.lanes.length; i++) {
        if (this.lanes[i].type === 'ingredient' && this.toggled[i]) {
          inv.removeIngredient(this.lanes[i].char);
        }
      }
      inv.removeCoin(this.getRemainingCoinPrice());
    }

    row.sold = true;

    // Capture before closeModal() — onClose() nulls this.shopkeeper.
    const shopkeeper = this.shopkeeper;
    const player = game.player;

    // Close the Shop's own modal first: PauseSystem allows only one active
    // modal, so SlotReplacementSystem.open() would otherwise fail silently
    // if this purchase needs a full-slots prompt.
    game.pauseSystem.closeModal();

    this._deliverItem(row, player);

    this.coinAnim = {
      startX: player.position.x + GRID.CELL_SIZE / 2,
      startY: player.position.y + GRID.CELL_SIZE / 2,
      endX: shopkeeper.position.x + GRID.CELL_SIZE / 2,
      endY: shopkeeper.position.y + GRID.CELL_SIZE / 2,
      t: 0, spinPhase: 0,
      shopkeeper,
    };
    game.audioSystem?.playSFX?.('coin_plink');
  }

  /**
   * Hands over the purchased item via InventorySystem.tryPickupItem, same
   * pipeline a ground pickup uses (full-slots → SlotReplacementSystem
   * handoff included) — but against a private one-item scratch array, not
   * game.items, since tryPickupItem returns on the first item within range
   * and a hut's own spawned bread loaf could otherwise get picked up instead.
   */
  _deliverItem(row, player) {
    const game = this.game;
    const scratch = [new Item(row.char, player.position.x, player.position.y)];
    const result = game.inventorySystem.tryPickupItem(
      scratch, game.placedTraps, player, game.physicsSystem,
      true, 0, 0, game.renderer
    );

    if (game.slotReplacementSystem.maybeOpen(result)) return;

    if (result.success) {
      if (result.message) game.showPickupMessage(result.message);
      if (result.pickedUpType === 'WEAPON') game.audioSystem.playSFX('weapon_pickup');
      game.updateUI();
    }
  }

  /** Post-purchase coin-arc animation, mirrors WeaponsMasterSystem/FishermanDemoSystem. */
  update(dt) {
    if (!this.coinAnim) return;
    const game = this.game;

    const { shopkeeper } = this.coinAnim;
    const stillPresent = game.player?.inHut && game.activeFloor?.npcs?.includes(shopkeeper);
    if (!stillPresent) {
      this.coinAnim = null;
      return;
    }

    this.coinAnim.t += dt;
    this.coinAnim.spinPhase += dt * 12;
    if (this.coinAnim.t >= COIN_ARC_DURATION) this.coinAnim = null;
  }
}
