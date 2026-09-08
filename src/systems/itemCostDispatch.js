import { isIngredient } from '../data/items.js';

/**
 * Generic char-based cost dispatch (raw ingredient vs crafted item).
 *
 * A recipe pair — and therefore a shop listing's ingredientCost, built
 * directly from one (see shopPricing.js's buildListing) — can name either a
 * raw ingredient (isIngredient() true, lives in InventorySystem's flat
 * `ingredients` pile) or a crafted item (a previous recipe's own result, e.g.
 * Base Potion feeding Health Potion, or Hammer feeding Maul): those live as
 * an owned Item instance somewhere — a quick slot, worn armor, an equipped
 * consumable, or one of the three storage piles — never the ingredient pile.
 * MenuSystem.handleCenterSlotSelection already branches this way by hand for
 * REST crafting; these free functions generalize that dispatch so any caller
 * (ShopSystem's barter lanes included) can spend an arbitrary recipe char
 * without caring which tier it came from. Kept as free functions taking `inv`
 * (an InventorySystem instance) rather than methods on it, same pattern as
 * TrapSystem's chest-array helpers, to keep InventorySystem itself thin.
 */

/** How many of `char` the player holds right now — ingredient or crafted item. */
export function countItemChar(inv, char, player) {
  if (isIngredient(char)) return inv.countIngredient(char);
  return ownedCraftedItems(inv, player).filter(item => item.char === char).length;
}

// Every crafted Item instance currently owned, carried or stored — the same
// reach ShopSystem's Pawn list sells from (see its _buildPawnEntries),
// generalized here since spending a recipe char needs the same union of
// sources.
function ownedCraftedItems(inv, player) {
  const items = [];
  if (player) for (const item of player.quickSlots) if (item) items.push(item);
  if (inv.equippedArmor) items.push(inv.equippedArmor);
  for (const item of inv.equippedConsumables) if (item) items.push(item);
  items.push(...inv.itemChest, ...inv.armorInventory, ...inv.consumableInventory);
  return items;
}

/**
 * Spends one `char`, ingredient or crafted item, wherever it currently
 * lives. Crafted items prefer storage (chest/armorInventory/
 * consumableInventory) over carried gear, so paying a cost doesn't strip
 * something equipped while a spare sits in storage — only reaches into a
 * carried slot when no spare exists. Returns whether a match was removed.
 */
export function removeItemChar(inv, char, player) {
  if (isIngredient(char)) return inv.removeIngredient(char);

  const chestMatch = inv.itemChest.find(item => item.char === char);
  if (chestMatch) { inv.retrieveFromChest(chestMatch); return true; }

  const armorMatch = inv.armorInventory.find(item => item.char === char);
  if (armorMatch) { inv.removeFromArmorInventory(armorMatch); return true; }

  const consumableMatch = inv.consumableInventory.find(item => item.char === char);
  if (consumableMatch) { inv.removeFromConsumableInventory(consumableMatch); return true; }

  if (inv.equippedArmor?.char === char) {
    inv.removeCarriedItem('equippedArmor', -1, player);
    return true;
  }
  const consumableSlot = inv.equippedConsumables.findIndex(item => item?.char === char);
  if (consumableSlot !== -1) {
    inv.removeCarriedItem('equippedConsumable', consumableSlot, player);
    return true;
  }
  if (player) {
    const quickSlot = player.quickSlots.findIndex(item => item?.char === char);
    if (quickSlot !== -1) {
      inv.removeCarriedItem('quick', quickSlot, player);
      return true;
    }
  }
  return false;
}
