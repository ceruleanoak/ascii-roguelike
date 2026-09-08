import { NeutralCharacter } from './NeutralCharacter.js';
import { rollShopStock } from '../data/shopPricing.js';
import { progressSignature } from '../data/homeZone.js';
import { SHOP_INTERACTION_RANGE } from '../game/GameConfig.js';

// Offering the same unpurchased row twice without the player biting means a
// third look at the identical counter — force a fresh roll on that third
// visit rather than dead-ending on wares they've already passed on. See
// refreshStock.
const STALE_VISIT_LIMIT = 3;

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
 * alive across every re-entry into the hut for as long as the containing
 * Settlement room stays the current room (rooms are regenerated, not
 * persisted, on the next transition) — the same mechanism WeaponsMaster.
 * spokenOnce already relies on.
 *
 * What may be stocked is gated two ways: `zone` (room.zone, the physical
 * Zone this Settlement sits in) narrows each role's pool to that zone's own
 * wares first (shopPricing.js's zoneCraftablePool), and Home Zone
 * (data/homeZone.js) further limits it to wares the run has actually
 * reached. Because reach grows mid-run, refreshStock() re-rolls the UNSOLD
 * rows whenever the player's progress has moved since the last roll — push
 * deeper, come back, and the counter has better wares on it — and separately
 * force-rerolls any individual row that's gone stale (see STALE_VISIT_LIMIT)
 * even when progress hasn't moved. Sold rows are never re-rolled: a sold-out
 * row is a record of what the player already bought.
 *
 * Stands in a sealed alcove behind an impassable Counter (see HutSystem.
 * generateHutInterior) — the universal "NPC behind a counter" shop
 * convention. isInRange() is overridden so every caller (ShopSystem's SPACE
 * dispatch, the talk indicator) automatically uses the wider counter-gap
 * radius without each call site needing to know about the layout.
 */
export class Shopkeeper extends NeutralCharacter {
  constructor(x, y, zoneDepths = {}, zone = null) {
    super('S', '#e0c060', x, y);
    this.zone = zone;
    this.stockSignature = progressSignature(zoneDepths);
    this.stock = rollShopStock(zoneDepths, zone);
  }

  /**
   * Re-rolls unsold rows against the run's current reach — every unsold row
   * when progress has moved since the last look, or just the individual rows
   * that have gone stale (offered STALE_VISIT_LIMIT times running with no
   * purchase) when it hasn't. Re-opening the shop twice in a row with no
   * progress and no stale rows leaves the counter untouched.
   *
   * Called on every shop open (ShopSystem.open) rather than on a timer: the
   * moment the player looks is the only moment the stock needs to be current,
   * and is also the only moment a row's "offered again" count should tick.
   */
  refreshStock(zoneDepths = {}) {
    const signature = progressSignature(zoneDepths);
    const progressed = signature !== this.stockSignature;
    this.stockSignature = signature;

    const rerolled = rollShopStock(zoneDepths, this.zone);
    this.stock = this.stock.map((row, i) => {
      if (row.sold) return row;
      row.staleVisits = (row.staleVisits || 0) + 1;
      if (progressed || row.staleVisits >= STALE_VISIT_LIMIT) return rerolled[i] ?? row;
      return row;
    });
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
