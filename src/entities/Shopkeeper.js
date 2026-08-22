import { NeutralCharacter } from './NeutralCharacter.js';
import { rollShopStock } from '../data/shopPricing.js';

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
 */
export class Shopkeeper extends NeutralCharacter {
  constructor(x, y) {
    super('S', '#e0c060', x, y);
    this.stock = rollShopStock();
  }

  update(dt, game) {
    super.update(dt); // pulse animation
    this.updateTalkIndicator(game);
  }
}
