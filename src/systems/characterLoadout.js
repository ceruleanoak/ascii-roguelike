/**
 * characterLoadout.js — the shape of one character's REST loadout, owned by
 * InventorySystem.characterInventories. Kept in one factory so the constructor,
 * the lazy per-character creation in setActiveCharacter(), and the game-over
 * wipe can never drift apart again (they used to be three hand-written copies).
 */

import { Item } from '../entities/Item.js';
import { CHARACTER_TYPES } from '../data/characters.js';

// One character's REST loadout. Quick slots, worn armor and equipped
// consumables are all per-character — each character keeps their own gear; a character with a Starter Weapon
// (CHARACTER_TYPES[type].starterWeapon) begins with it in slot 1.
export function createCharacterLoadout(characterType) {
  const starterWeapon = CHARACTER_TYPES[characterType]?.starterWeapon;
  return {
    quickSlots: [starterWeapon ? new Item(starterWeapon, 0, 0) : null, null, null], // Weapons only
    activeSlotIndex: 0,   // Persistent active slot index
    manaState: null,      // { slots, current, max } — survives character swaps
    trainedWeapons: {},   // { [weaponCategory]: true } — Weapons Master training, per character
    // Worn armor + equipped consumables, parked here while another character
    // is active. The live slots are InventorySystem's; see stash/loadEquipment.
    equipment: { armor: null, consumables: [], spent: [], cooldowns: [] }
  };
}

// Park the live equipment slots (InventorySystem.equippedArmor /
// equippedConsumables and their per-slot spent/cooldown state) on the
// outgoing character's loadout entry.
export function stashEquipment(inv, entry) {
  if (!entry) return;
  entry.equipment = {
    armor: inv.equippedArmor,
    consumables: [...inv.equippedConsumables],
    spent: [...inv.spentConsumableSlots],
    cooldowns: [...inv.consumableCooldowns],
  };
}

// Put the incoming character's parked equipment into the live slots. The slot
// count is the run's (maxConsumableSlots grows per boss for everyone), so the
// parked arrays are fitted to it.
export function loadEquipment(inv, entry) {
  const equipment = entry?.equipment;
  if (!equipment) return;
  const slots = inv.maxConsumableSlots;
  const fit = (list, fill) => Array.from({ length: slots }, (_, i) => list[i] ?? fill);
  inv.equippedArmor = equipment.armor;
  inv.equippedConsumables = fit(equipment.consumables, null);
  inv.spentConsumableSlots = fit(equipment.spent, false);
  inv.consumableCooldowns = fit(equipment.cooldowns, 0);
  // A throw still in the air belongs to the character who threw it.
  inv.consumableWindups = [];
}
