// Key Items (GLOSSARY.md) — held, never equipped. The held list lives on
// InventorySystem (`keyItemInventory`, run-scoped like the rest of the
// inventory); these are the only reads and the only spend of it, so every
// door/gate check asks the same question the same way.

/**
 * Is a key item with this char currently held? The single source of truth
 * for every door/gate check (Vault door, dungeon Key Vault descent) — read
 * this instead of re-deriving a parallel boolean flag.
 *
 * Optional `game` param: when passed, also returns true if the player has
 * a universal-key weapon (data.opensAnyLock, e.g. the χ-blade) equipped in
 * a quick slot — "opens any lock" bypasses the per-char held-key check
 * entirely. Never consumed by consumeKeyItem (it isn't in
 * keyItemInventory), so it keeps opening locks for the rest of the run.
 */
export function hasKeyItem(inventory, char, game = null) {
  if (inventory?.keyItemInventory?.some(item => item.char === char)) return true;
  return holdsUniversalKey(game);
}

/**
 * Is a universal-key weapon (data.opensAnyLock) equipped in a quick slot?
 * For locks that spend an ordinary key but not a universal one (Lock
 * Blocks), so the caller knows whether to consumeKeyItem.
 */
export function holdsUniversalKey(game) {
  return !!game?.player?.quickSlots?.some(item => item?.data?.opensAnyLock);
}

/**
 * Spend a held key item, e.g. on unlocking the door it opens. Returns
 * true if one was found and removed, false if the player wasn't holding it.
 */
export function consumeKeyItem(inventory, char) {
  const held = inventory?.keyItemInventory;
  const idx = held ? held.findIndex(item => item.char === char) : -1;
  if (idx === -1) return false;
  held.splice(idx, 1);
  return true;
}
