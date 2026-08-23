import { NeutralCharacter } from './NeutralCharacter.js';
import { rollShopStock } from '../data/shopPricing.js';
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
 * Stock is rolled once here and held as `this.stock`. HutSystem's
 * hut.interiorState cache keeps this same Shopkeeper instance (and its
 * stock + each listing's `sold` flag) alive across every re-entry into the
 * hut for the life of the run — the same mechanism WeaponsMaster.spokenOnce
 * already relies on.
 *
 * Stands in a sealed alcove behind an impassable Counter (see HutSystem.
 * generateHutInterior) — the universal "NPC behind a counter" shop
 * convention. isInRange() is overridden so every caller (ShopSystem's SPACE
 * dispatch, the talk indicator) automatically uses the wider counter-gap
 * radius without each call site needing to know about the layout.
 */
export class Shopkeeper extends NeutralCharacter {
  constructor(x, y) {
    super('S', '#e0c060', x, y);
    this.stock = rollShopStock();
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
