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
    armorTraining: { dodge: 0, defense: 0 }, // Armor Training levels (ARMOR_TRAINING), per character
    bossMaxHp: 0,         // max HP this character earned from zone Bosses (BossSystem._grantBossReward)
    // Worn armor + equipped consumables, parked here while another character
    // is active. The live slots are InventorySystem's; see stash/loadEquipment.
    equipment: { armor: null, consumables: [], spent: [], cooldowns: [] }
  };
}

// Fit a character's quick slots to the run's broken slots (spent wishes break
// a slot for every character, game._savedDestroyedSlots). An item sitting in a
// broken slot moves to a free unbroken one, else into the chest (`bank`), and
// the active slot steps off a broken one. Without this a character other than
// the one who wished kept the item in the broken slot (a Starter Weapon sits
// in slot 0, the first wish's), and selecting it lost the item.
export function fitLoadoutToSlots(slots, activeSlotIndex, destroyed, bank) {
  for (let i = 0; i < slots.length; i++) {
    if (!destroyed[i] || !slots[i]) continue;
    const free = slots.findIndex((s, j) => s === null && !destroyed[j]);
    if (free !== -1) slots[free] = slots[i];
    else bank(slots[i]);
    slots[i] = null;
  }
  if (!destroyed[activeSlotIndex]) return activeSlotIndex;
  const next = slots.findIndex((_, i) => !destroyed[i]);
  return next !== -1 ? next : 0;
}

// Make `characterType` the active character on InventorySystem `inv`
// (InventorySystem.setActiveCharacter delegates here). A character's loadout
// is created the first time it becomes active in a run, which is also when
// its Starter Weapon is granted (once per run). It is fitted to the run's
// broken slots (`destroyed`, absent before the Game wires it), then the
// legacy pointers (restQuickSlots / restActiveSlotIndex) point at it. The
// ingredient pile is shared across characters and not touched here.
export function activateCharacterLoadout(inv, characterType, destroyed) {
  if (!inv.characterInventories[characterType]) {
    inv.characterInventories[characterType] = createCharacterLoadout(characterType);
  }
  const entry = inv.characterInventories[characterType];
  if (destroyed) {
    entry.activeSlotIndex = fitLoadoutToSlots(entry.quickSlots, entry.activeSlotIndex, destroyed, item => inv.bankItem(item));
  }
  inv.restQuickSlots = entry.quickSlots;
  inv.restActiveSlotIndex = entry.activeSlotIndex;
  inv._activeCharacterType = characterType;
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
