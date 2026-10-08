/**
 * characterLoadout.js — the shape of one character's REST loadout, owned by
 * InventorySystem.characterInventories. Kept in one factory so the constructor,
 * the lazy per-character creation in setActiveCharacter(), and the game-over
 * wipe can never drift apart again (they used to be three hand-written copies).
 */

import { Item } from '../entities/Item.js';
import { CHARACTER_TYPES } from '../data/characters.js';

// One character's REST loadout. Quick slots stay per-character because each
// character runs their own weapon loadout; a character with a Starter Weapon
// (CHARACTER_TYPES[type].starterWeapon) begins with it in slot 1.
export function createCharacterLoadout(characterType) {
  const starterWeapon = CHARACTER_TYPES[characterType]?.starterWeapon;
  return {
    quickSlots: [starterWeapon ? new Item(starterWeapon, 0, 0) : null, null, null], // Weapons only
    activeSlotIndex: 0,   // Persistent active slot index
    manaState: null,      // { slots, current, max } — survives character swaps
    trainedWeapons: {}    // { [weaponCategory]: true } — Weapons Master training, per character
  };
}
