// Spawned Items — the run's no-repeat list for world item spawns.
//
// The Camp (C), the Discovery Room (?), the depth-1 weapon offer and the
// dungeon Trap Room reward all draw from this one list, so none of them puts
// down an item that any of them already put down this run. An item counts the
// moment it is placed in a room, whether or not the player ever picks it up.
//
// Left out on purpose: enemy drops, and the unarmed safety net in
// offerL1Weapon. A player with nothing to swing gets a weapon even if it is a
// repeat, and that weapon does not go on the list.
//
// The list lives on `game.spawnedItemChars` (Reset Registry, 'run' scope).

/**
 * Pick from `pool`, skipping chars already spawned this run. Repeated entries
 * in the pool keep their weighting. When every entry has been spawned, the
 * whole pool is open again, so a room always has something to place.
 */
export function pickUnspawnedItem(game, pool) {
  const spawned = game?.spawnedItemChars;
  const fresh = spawned ? pool.filter(char => !spawned.has(char)) : pool;
  const from = fresh.length > 0 ? fresh : pool;
  return from[Math.floor(Math.random() * from.length)];
}

/** Record a char as placed in the world this run. */
export function markItemSpawned(game, char) {
  game?.spawnedItemChars?.add(char);
}
