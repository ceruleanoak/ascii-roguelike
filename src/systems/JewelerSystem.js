import { Jeweler } from '../entities/Jeweler.js';
import { Shopkeeper } from '../entities/Shopkeeper.js';
import { inSamePlane } from './PlaneSystem.js';
import { menuIntent } from './MenuInput.js';
import { deliverPurchase } from './purchaseDelivery.js';
import { JEWELER_WARES, JEWELER_DRINKS } from '../data/jewelerWares.js';
import { JewelerOverlay } from '../rendering/ui/JewelerOverlay.js';

/**
 * JewelerSystem — the Jeweler's water hand-off and necklace wares.
 *
 * SPACE near the Jeweler (yellow J room, or behind a Settlement shop counter)
 * opens a PauseSystem modal laid out as the Shop's (ShopSystem):
 *   - Parched, heard out ('WATER...', Jeweler.getDialogueLines), carrying a
 *     Bottle of Water or Health Potion (JEWELER_DRINKS): 'give' mode, one
 *     GIVE row per drink carried. Confirm hands it over: the Jeweler drinks,
 *     `game.jewelerRefreshed` is set for the rest of the run, and they say one
 *     line of thanks. Shift backs out keeping the drink. From then on the J
 *     letter is never offered (ExitSystem) and the Jeweler sits beside the
 *     Shopkeeper in every Settlement (roomFeatures / HutSystem).
 *   - Parched otherwise: not consumed here — DialogueSystem tells the plea.
 *   - Refreshed: the wares.
 *
 * Modes:
 *   'give'   — Up/Down moves giveIndex across the drinks. Confirm gives it and
 *              closes. Shift closes.
 *   'list'   — Up/Down moves rowIndex across JEWELER_WARES. Confirm opens
 *              'barter' for that row. Shift closes. Rows never sell out.
 *   'barter' — the row's cost. Confirm buys it when every gem and coin is on
 *              hand (CONFIRM? shows), else plays the shop error cue. Either
 *              way Shift — or a purchase — returns to 'list'.
 */
export class JewelerSystem {
  constructor(game) {
    this.game = game;
    this.overlay = new JewelerOverlay();
    this.jeweler = null;
    this.mode = 'list';
    this.drinks = [];   // 'give' rows: JEWELER_DRINKS chars the player carries
    this.giveIndex = 0;
    this.rowIndex = 0;
    this.openedAt = 0;
    this.inputReadyAt = 0;
    // PERSUADE: the next ware bought costs nothing. Ends with the wares.
    this.freePurchase = false;
  }

  /** SPACE dispatch — returns true when the press was consumed. */
  trySpacePress() {
    const game = this.game;
    const player = game.player;
    if (!player) return false;

    const npcs = game.interiorManager.activeNpcs();
    const jeweler = npcs.find(n => n instanceof Jeweler);
    if (!jeweler || !inSamePlane(jeweler, player) || !jeweler.isInRange(player)) return false;

    // Behind the Settlement counter the Shopkeeper is in reach too: the
    // nearer of the two answers the press.
    const shopkeeper = npcs.find(n => n instanceof Shopkeeper);
    if (shopkeeper?.isInRange(player) && distance(shopkeeper, player) < distance(jeweler, player)) {
      return false;
    }

    if (game.jewelerRefreshed) {
      this._open(jeweler, 'list');
      return true;
    }
    // Parched: the plea is heard before anything can be given.
    if (!jeweler.spokenOnce) return false;
    const inv = game.inventorySystem;
    const drinks = JEWELER_DRINKS.filter(char => inv.countItemChar(char, player) > 0);
    if (drinks.length === 0) return false;
    this.drinks = drinks;
    this._open(jeweler, 'give');
    return true;
  }

  _giveDrink(jeweler, drink) {
    const game = this.game;
    if (!game.inventorySystem.removeItemChar(drink, game.player)) return;
    game.jewelerRefreshed = true;
    jeweler.refreshed = true;
    game.audioSystem?.playSFX?.('jeweler_drink');
    game.updateUI();
    game.dialogueSystem.open(jeweler, ['AH... THANK YOU. NOW, WHAT FINE STONES YOU CARRY.']);
  }

  _open(jeweler, mode) {
    if (!this.game.pauseSystem.openModal(this)) return;
    this.jeweler = jeweler;
    this.mode = mode;
    this.giveIndex = 0;
    this.rowIndex = 0;
    this.openedAt = performance.now();
    // Brief input lockout, same reasoning + window as ShopSystem: the SPACE
    // press that opened the menu can't also register as a choice.
    this.inputReadyAt = this.openedAt + 1000;
  }

  // ── PERSUADE (InfluenceSystem) ──────────────────────────────────────────────

  /** Parched, the Jeweler has nothing to sell. */
  persuadeRefusal() {
    return this.game.jewelerRefreshed ? null : 'I HAVE NOTHING.';
  }

  /** The wares open, and the one chosen is free. */
  persuade(jeweler) {
    this._open(jeweler, 'list');
    if (this.jeweler) this.freePurchase = true;
  }

  /** True when the player holds every gem and coin `row` costs (or it's free). */
  canAfford(row) {
    if (this.freePurchase) return true;
    return this.hasCoins(row) && this.heldGems(row).every(Boolean);
  }

  hasCoins(row) {
    return this.game.inventorySystem.hasCoin(row.coins);
  }

  /** Per gem in `row.gems`: whether the player carries it (a repeated gem needs a copy each). */
  heldGems(row) {
    const inv = this.game.inventorySystem;
    const used = new Map();
    return row.gems.map(gem => {
      const n = (used.get(gem) || 0) + 1;
      used.set(gem, n);
      return inv.countIngredient(gem) >= n;
    });
  }

  // ── PauseSystem modal contract ───────────────────────────────────────────

  handleKey(key, event) {
    if (event?.repeat) return;
    if (performance.now() < this.inputReadyAt) return;
    const intent = menuIntent(event);
    if (!intent) return;

    if (this.mode === 'give') this._handleGiveInput(intent);
    else if (this.mode === 'list') this._handleListInput(intent);
    else this._handleBarterInput(intent);
  }

  _handleGiveInput(intent) {
    if (intent === 'up') {
      this.giveIndex = Math.max(0, this.giveIndex - 1);
    } else if (intent === 'down') {
      this.giveIndex = Math.min(this.drinks.length - 1, this.giveIndex + 1);
    } else if (intent === 'confirm') {
      const jeweler = this.jeweler;
      const drink = this.drinks[this.giveIndex];
      this.game.pauseSystem.closeModal();
      this._giveDrink(jeweler, drink);
    } else if (intent === 'shift') {
      this.game.pauseSystem.closeModal();
    }
  }

  _handleListInput(intent) {
    if (intent === 'up') {
      this.rowIndex = Math.max(0, this.rowIndex - 1);
    } else if (intent === 'down') {
      this.rowIndex = Math.min(JEWELER_WARES.length - 1, this.rowIndex + 1);
    } else if (intent === 'confirm') {
      this.mode = 'barter';
    } else if (intent === 'shift') {
      this.game.pauseSystem.closeModal();
    }
  }

  _handleBarterInput(intent) {
    if (intent === 'confirm') {
      if (this._buy(JEWELER_WARES[this.rowIndex])) this.mode = 'list';
    } else if (intent === 'shift') {
      this.mode = 'list';
    }
  }

  render(renderer, game) {
    this.overlay.render(renderer, game, this);
  }

  onClose() {
    this.jeweler = null;
    this.mode = 'list';
    this.drinks = [];
    this.giveIndex = 0;
    this.rowIndex = 0;
    this.freePurchase = false;
  }

  _buy(row) {
    const game = this.game;
    if (!this.canAfford(row)) {
      game.audioSystem?.playSFX?.('shop_error');
      return false;
    }
    if (this.freePurchase) {
      this.freePurchase = false;
    } else {
      const inv = game.inventorySystem;
      for (const gem of row.gems) inv.removeIngredient(gem);
      inv.removeCoin(row.coins);
    }
    deliverPurchase(game, row.char);
    return true;
  }
}

function distance(npc, player) {
  return Math.hypot(player.position.x - npc.position.x, player.position.y - npc.position.y);
}
