import { NeutralCharacter } from './NeutralCharacter.js';
import { rollShopStock } from '../data/shopPricing.js';
import { progressSignature } from '../data/homeZone.js';
import { SHOP_INTERACTION_RANGE } from '../game/GameConfig.js';

/**
 * Shopkeeper — Settlement hut NPC who sells a random roll of 1 armor /
 * 2 weapons / 3 consumables for a mix of padded ingredients, coins, and
 * treasure (see ShopSystem for the full barter flow).
 *
 * Deliberately has no getDialogueLines() — DialogueSystem.tryOpenNearby()
 * skips any NPC lacking that method, so SPACE near this NPC is owned
 * entirely by ShopSystem and never opens a plain dialogue box.
 *
 * Stock is held as `this.stock`. HutSystem's hut.interiorState cache keeps
 * this same Shopkeeper instance (and its stock + each listing's `sold` flag)
 * alive across every re-entry into the hut for the life of the run — the same
 * mechanism WeaponsMaster.spokenOnce already relies on.
 *
 * What may be stocked is gated by Home Zone (data/homeZone.js): only wares
 * the run has actually reached. Because that reach grows mid-run,
 * refreshStock() re-rolls the UNSOLD rows whenever the player's progress has
 * moved since the last roll — push deeper, come back, and the counter has
 * better wares on it. Sold rows are never re-rolled: a sold-out row is a
 * record of what the player already bought.
 *
 * Stands in a sealed alcove behind an impassable Counter (see HutSystem.
 * generateHutInterior) — the universal "NPC behind a counter" shop
 * convention. isInRange() is overridden so every caller (ShopSystem's SPACE
 * dispatch, the talk indicator) automatically uses the wider counter-gap
 * radius without each call site needing to know about the layout.
 */
export class Shopkeeper extends NeutralCharacter {
  constructor(x, y, zoneDepths = {}) {
    super('S', '#e0c060', x, y);
    this.stockSignature = progressSignature(zoneDepths);
    this.stock = rollShopStock(zoneDepths);
  }

  /**
   * Re-rolls every unsold row against the run's current reach, but only when
   * that reach has actually changed — otherwise re-opening the shop twice in a
   * row would reshuffle the counter under the player for no reason.
   *
   * Called on every shop open (ShopSystem.open) rather than on a timer: the
   * moment the player looks is the only moment the stock needs to be current.
   */
  refreshStock(zoneDepths = {}) {
    const signature = progressSignature(zoneDepths);
    if (signature === this.stockSignature) return;
    this.stockSignature = signature;

    const rerolled = rollShopStock(zoneDepths);
    this.stock = this.stock.map((row, i) => (row.sold ? row : rerolled[i] ?? row));
  }

  isInRange(player, range = SHOP_INTERACTION_RANGE) {
    return super.isInRange(player, range);
  }

  update(dt, game) {
    super.update(dt); // pulse animation
    // Explicit range: updateTalkIndicator's own default param would otherwise
    // pass the base NPC_INTERACTION_RANGE straight through to isInRange(),
    // bypassing the override above.
    this.updateTalkIndicator(game, SHOP_INTERACTION_RANGE);
  }
}
