import { NeutralCharacter } from './NeutralCharacter.js';
import { rollShopStock } from '../data/shopPricing.js';
import { progressSignature } from '../data/homeZone.js';
import { SHOP_INTERACTION_RANGE } from '../game/GameConfig.js';

// Offering the same unpurchased row twice without the player biting means a
// third look at the identical counter — force a fresh roll on that third
// visit rather than dead-ending on wares they've already passed on. See
// offerStock.
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
    this.persuadeOwner = 'shopSystem';
    this.zone = zone;
    this.stockSignature = progressSignature(zoneDepths);
    this.stock = rollShopStock(zoneDepths, zone);
  }

  /**
   * Re-rolls every unsold row when the run's progress has moved since the
   * last roll. Called on every shop open (ShopSystem.open): the moment the
   * player looks is the only moment the stock needs to be current. No-ops
   * when progress hasn't moved.
   */
  refreshStock(zoneDepths = {}) {
    const signature = progressSignature(zoneDepths);
    if (signature === this.stockSignature) return;
    this.stockSignature = signature;
    const rerolled = rollShopStock(zoneDepths, this.zone);
    this.stock = this.stock.map((row, i) => (row.sold ? row : (rerolled[i] ?? row)));
  }

  /**
   * One look at the wares: every unsold row's "offered again" count ticks,
   * and any row offered STALE_VISIT_LIMIT times running with no purchase is
   * re-rolled. ShopSystem calls this once per open, and only when the player
   * actually views the wares — opening the shop to pawn, or re-opening it
   * after a slot choice, is not a look.
   */
  offerStock(zoneDepths = {}) {
    let rerolled = null;
    this.stock = this.stock.map((row, i) => {
      if (row.sold) return row;
      row.staleVisits = (row.staleVisits || 0) + 1;
      if (row.staleVisits < STALE_VISIT_LIMIT) return row;
      rerolled ??= rollShopStock(zoneDepths, this.zone);
      return rerolled[i] ?? row;
    });
  }

  /** A purchase is the player biting: every unsold row's stale count restarts. */
  resetStaleness() {
    for (const row of this.stock) if (!row.sold) row.staleVisits = 0;
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
