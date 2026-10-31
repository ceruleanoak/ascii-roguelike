/**
 * BottlesSystem.js
 *
 * The operations on Bottles — the player's uncapped store of every carried
 * Bottle (`data.bottle`) not equipped in a consumable slot. The array itself
 * lives on InventorySystem (`inventorySystem.bottles`) beside the other
 * carried piles, and dies with them in handleGameOver(); this file owns what
 * is done to a Bottle in it:
 *
 *   - drinking or throwing one straight from Bottles (trigger) — the same
 *     windup throw as a slot, with no slot: `slotIndex: null` on the windup,
 *     so ConsumableWindupEffects skips its per-slot writes;
 *   - turning one Bottle into another in place (replace) — filling an Empty
 *     Bottle at a trough, liquid tile, pool, or bottling a fairy;
 *   - finding an Empty Bottle to fill.
 *
 * Bottles never auto-fire. Equipping a Bottle into a slot is the only way to
 * get the emergency triggers (heal threshold, ⚱ revive, ♔ heal-on-hit) — the
 * slot keeps its full machinery in InventorySystem/ConsumableTriggerSystem.
 *
 * A Bottle Ref names one Bottle wherever it sits, so the fill helpers can
 * write back without caring which store holds it:
 *   { source: 'bottles', item }       — an Item in inventorySystem.bottles
 *   { source: 'slot', index }         — equippedConsumables[index]
 * ConsumableTriggerSystem.armed() returns one for the Armed Consumable.
 */

import { Item } from '../entities/Item.js';

export const EMPTY_BOTTLE_CHAR = 'B';

export class BottlesSystem {
  constructor(game) {
    this.game = game;
  }

  get bottles() {
    return this.game.inventorySystem.bottles;
  }

  /** The Item a Bottle Ref points at, or null when it's gone. */
  itemAt(ref) {
    if (!ref) return null;
    if (ref.source === 'slot') return this.game.player?.equippedConsumables?.[ref.index] ?? null;
    return this.bottles.includes(ref.item) ? ref.item : null;
  }

  /**
   * Turn the Bottle at `ref` into a fresh `newChar` Item where it sits, and
   * return the new Item (callers set per-item state on it, e.g. Hot Water's
   * hotWaterRoomsLeft). A Bottles ref is updated to point at the new Item.
   */
  replaceAt(ref, newChar) {
    const inv = this.game.inventorySystem;
    if (ref?.source === 'slot') {
      if (!inv.replaceConsumableSlot(ref.index, newChar)) return null;
      return inv.equippedConsumables[ref.index];
    }
    const idx = this.bottles.indexOf(ref?.item);
    if (idx === -1) return null;
    const replacement = new Item(newChar, 0, 0);
    this.bottles[idx] = replacement;
    // The armed Bottle follows its contents — a filled bottle stays in hand.
    if (this.game.player?.armedBottle === ref.item) this.game.player.armedBottle = replacement;
    ref.item = replacement;
    return replacement;
  }

  /**
   * A Ref to a carried `char` Bottle, or null. Bottles first — changing one
   * shouldn't strip the copy a player chose to equip.
   */
  findRef(char) {
    const item = this.bottles.find(b => b.char === char);
    if (item) return { source: 'bottles', item };
    const index = this.game.player?.equippedConsumables?.findIndex(s => s?.char === char) ?? -1;
    return index === -1 ? null : { source: 'slot', index };
  }

  /** A Ref to an Empty Bottle to fill, or null. */
  emptyBottleRef() {
    return this.findRef(EMPTY_BOTTLE_CHAR);
  }

  /**
   * One room exit for every Bottle of Hot Water carried: after 3 it reverts to
   * a regular Bottle of Water (caldera / Fireplace fill sets
   * hotWaterRoomsLeft — AlchemySystem.fillHotWaterBottle). Slots and Bottles
   * alike.
   */
  coolHotWater() {
    const refs = this.bottles.map(item => ({ source: 'bottles', item }));
    this.game.player?.equippedConsumables?.forEach((item, index) => {
      if (item) refs.push({ source: 'slot', index });
    });
    for (const ref of refs) {
      const item = this.itemAt(ref);
      if (!item || item.hotWaterRoomsLeft === undefined) continue;
      item.hotWaterRoomsLeft -= 1;
      if (item.hotWaterRoomsLeft <= 0) this.replaceAt(ref, '🜉');
    }
  }

  /**
   * Drink/throw `item` straight from Bottles: start the same windup a slot
   * would, then spend it (one-shot) or put it on its own cooldown (reusable).
   * Checks the readiness gates a slot has — cooldown and an in-flight throw.
   * Returns whether it fired.
   */
  trigger(item, triggerData, player) {
    const inv = this.game.inventorySystem;
    if (!this.bottles.includes(item)) return false;
    if (item.bottleCooldown > 0) return false;
    if (inv.consumableWindups.some(w => w.consumable === item)) return false;

    inv.startConsumableWindup(null, item, triggerData, player);
    if (item.data.oneShot === true) this._spend(item);
    else item.bottleCooldown = item.data.cooldown || 10;
    return true;
  }

  // One-shot use from Bottles: a stack loses one unit; otherwise the Bottle
  // leaves the store and, for a leavesBottle potion, its Empty Bottle takes
  // its place.
  _spend(item) {
    if (item.data.stackable && (item.count || 1) > 1) {
      item.count -= 1;
      return;
    }
    const idx = this.bottles.indexOf(item);
    if (idx === -1) return;
    if (item.data.leavesBottle === true) this.bottles[idx] = new Item(EMPTY_BOTTLE_CHAR, 0, 0);
    else this.bottles.splice(idx, 1);
  }
}
