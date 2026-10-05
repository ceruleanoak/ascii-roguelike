import { Item } from '../entities/Item.js';

// The Bomb the bag throws, and the Bombs that count as its stock.
export const BOMB_CHAR = '⊗';
// The Bomb Bag itself — placed on the Bomb Trial's dais.
export const BOMB_BAG_CHAR = '⊟';

/**
 * BombBagSystem — the Bomb Bag (⊟), a consumable-slot item earned in the
 * dungeon's Bomb Trial (claudedocs/bomb-bag-plan.md).
 *
 * Ammo model: one free charge, refilled on every room exit (same call sites
 * as TrapSystem.resetTrapsForNewRoom — "just like traps"), thrown first; then
 * the Bombs in the consumable list. There is no hidden counter — the stock IS
 * the Bomb items in `inventorySystem.consumableInventory`, so crafted Bombs
 * show up in the list and stay spendable as crafting ingredients. The bag
 * itself is never spent.
 *
 * Every throw is an ordinary Bomb throw: the bag hands a Bomb item to
 * InventorySystem.startConsumableWindup, so the explosion (damage, radius,
 * cavernSystem.bombBlast) is the Bomb's own and never duplicated here.
 */
export class BombBagSystem {
  constructor(game) {
    this.game = game;
  }

  isBombBag(item) {
    return item?.data?.bombBag === true;
  }

  // Bombs in the consumable list — the bag's stock.
  stockCount() {
    const list = this.game.inventorySystem?.consumableInventory ?? [];
    return list.reduce((sum, item) => (item.char === BOMB_CHAR ? sum + (item.count || 1) : sum), 0);
  }

  ammoCount(bag) {
    return (bag?.freeCharge ?? 0) + this.stockCount();
  }

  equippedBag() {
    const slots = this.game.inventorySystem?.equippedConsumables ?? [];
    return slots.find(item => this.isBombBag(item)) ?? null;
  }

  /**
   * True when `item` is a Bomb and the bag is equipped: the pickup skips the
   * slot choice and lands in the consumable list as the bag's stock
   * (InventorySystem.tryPickupItem).
   */
  claimsPickup(item) {
    return item?.char === BOMB_CHAR && !!this.equippedBag();
  }

  // Room exit: every bag the player carries gets its free charge back.
  refillForNewRoom() {
    const inv = this.game.inventorySystem;
    if (!inv) return;
    for (const item of [...inv.equippedConsumables, ...inv.consumableInventory, ...inv.itemChest]) {
      if (this.isBombBag(item)) item.freeCharge = 1;
    }
  }

  /**
   * Manual throw from the bag in `slotIndex`. Spends the free charge first,
   * then a Bomb from the consumable list; an empty bag refuses to fire.
   * Returns true if a Bomb was thrown.
   */
  throwFrom(slotIndex, bag, player) {
    const inv = this.game.inventorySystem;
    const bomb = this._drawBomb(bag, inv);
    if (!bomb) return false;
    const triggerData = this.game.consumableTriggerSystem.checkTriggerCondition(
      bomb.data, player, this.game.currentRoom, bomb, true);
    inv.startConsumableWindup(slotIndex, bomb, triggerData, player);
    return true;
  }

  _drawBomb(bag, inv) {
    if (bag.freeCharge > 0) {
      bag.freeCharge -= 1;
      return new Item(BOMB_CHAR, 0, 0);
    }
    const stocked = inv.consumableInventory.find(item => item.char === BOMB_CHAR);
    if (!stocked) return null;
    if ((stocked.count || 1) > 1) {
      stocked.count -= 1;
      return new Item(BOMB_CHAR, 0, 0);
    }
    inv.removeFromConsumableInventory(stocked);
    return stocked;
  }
}
