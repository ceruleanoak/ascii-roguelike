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
 * SPACE near the Jeweler (yellow J room, or behind a Settlement shop counter):
 *   - Parched, and the player carries a Bottle of Water or Health Potion
 *     (JEWELER_DRINKS): the Jeweler drinks it, `game.jewelerRefreshed` is set
 *     for the rest of the run, and they say one line of thanks. From then on
 *     the J letter is never offered (ExitSystem) and the Jeweler sits beside
 *     the Shopkeeper in every Settlement (roomFeatures / HutSystem).
 *   - Parched with nothing to drink: not consumed here — DialogueSystem tells
 *     the begging line (Jeweler.getDialogueLines).
 *   - Refreshed: opens the wares, a PauseSystem modal.
 *
 * Wares mode: Up/Down (W/S) moves rowIndex across JEWELER_WARES. Confirm buys
 * the highlighted row when its gems and coins are all on hand, or plays the
 * shop error cue. Shift closes. Rows never sell out.
 */
export class JewelerSystem {
  constructor(game) {
    this.game = game;
    this.overlay = new JewelerOverlay();
    this.jeweler = null;
    this.rowIndex = 0;
    this.openedAt = 0;
    this.inputReadyAt = 0;
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

    if (!game.jewelerRefreshed) return this._tryGiveDrink(jeweler);
    this.open(jeweler);
    return true;
  }

  _tryGiveDrink(jeweler) {
    const game = this.game;
    const inv = game.inventorySystem;
    const drink = JEWELER_DRINKS.find(char => inv.countItemChar(char, game.player) > 0);
    if (!drink) return false;

    inv.removeItemChar(drink, game.player);
    game.jewelerRefreshed = true;
    jeweler.refreshed = true;
    game.audioSystem?.playSFX?.('jeweler_drink');
    game.updateUI();
    game.dialogueSystem.open(jeweler, ['AH... THANK YOU. NOW, WHAT FINE STONES YOU CARRY.']);
    return true;
  }

  open(jeweler) {
    if (!this.game.pauseSystem.openModal(this)) return;
    this.jeweler = jeweler;
    this.rowIndex = 0;
    this.openedAt = performance.now();
    // Brief input lockout, same reasoning + window as ShopSystem: the SPACE
    // press that opened the wares can't also register as a purchase.
    this.inputReadyAt = this.openedAt + 1000;
  }

  /** True when the player holds every gem and coin `row` costs. */
  canAfford(row) {
    const inv = this.game.inventorySystem;
    if (!inv.hasCoin(row.coins)) return false;
    const need = new Map();
    for (const gem of row.gems) need.set(gem, (need.get(gem) || 0) + 1);
    for (const [gem, count] of need) {
      if (inv.countIngredient(gem) < count) return false;
    }
    return true;
  }

  // ── PauseSystem modal contract ───────────────────────────────────────────

  handleKey(key, event) {
    if (event?.repeat) return;
    if (performance.now() < this.inputReadyAt) return;
    const intent = menuIntent(event);
    if (!intent) return;

    if (intent === 'up') {
      this.rowIndex = Math.max(0, this.rowIndex - 1);
    } else if (intent === 'down') {
      this.rowIndex = Math.min(JEWELER_WARES.length - 1, this.rowIndex + 1);
    } else if (intent === 'confirm') {
      this._buy(JEWELER_WARES[this.rowIndex]);
    } else if (intent === 'shift') {
      this.game.pauseSystem.closeModal();
    }
  }

  render(renderer, game) {
    this.overlay.render(renderer, game, this);
  }

  onClose() {
    this.jeweler = null;
    this.rowIndex = 0;
  }

  _buy(row) {
    const game = this.game;
    if (!this.canAfford(row)) {
      game.audioSystem?.playSFX?.('shop_error');
      return;
    }
    const inv = game.inventorySystem;
    for (const gem of row.gems) inv.removeIngredient(gem);
    inv.removeCoin(row.coins);
    deliverPurchase(game, row.char);
  }
}

function distance(npc, player) {
  return Math.hypot(player.position.x - npc.position.x, player.position.y - npc.position.y);
}
