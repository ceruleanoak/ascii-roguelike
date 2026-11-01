// What every fisherman buys: Clams (the raw Sea ingredient 'C') and whole Fish,
// one coin each, everything carried in one SPACE press. Shared by the hut
// Fisherman (FishermanDemoSystem) and the lake Fisherman (ShoreFishermanSystem)
// so the trade reads the same wherever the player meets one.

const CLAM_CHAR = 'C';
const FISH_CHAR = '∝';
const COIN_PER_CATCH = 1;

// Takes every carried Clam from the ingredient pile; returns how many.
function takeClams(inv) {
  const count = inv.countIngredient(CLAM_CHAR);
  for (let i = 0; i < count; i++) inv.removeIngredient(CLAM_CHAR);
  return count;
}

// Takes every carried Fish, stacks in consumable slots and loose ones alike;
// returns how many.
function takeFish(inv, player) {
  let count = 0;
  inv.equippedConsumables.forEach((item, slotIndex) => {
    if (item?.char !== FISH_CHAR) return;
    count += item.count ?? 1;
    inv.removeCarriedItem('equippedConsumable', slotIndex, player);
  });
  for (const item of inv.allUnequippedConsumables()) {
    if (item.char !== FISH_CHAR) continue;
    count += item.count ?? 1;
    inv.removeUnequipped(item);
  }
  return count;
}

/**
 * Sell every carried Clam and Fish to the fisherman. Returns true when
 * anything sold, so the caller can swallow the SPACE press; false leaves it to
 * the other fisherman interactions.
 */
export function sellCatchToFisherman(game) {
  const inv = game.inventorySystem;
  if (!inv) return false;
  const count = takeClams(inv) + takeFish(inv, game.player);
  if (count <= 0) return false;

  inv.addCoin(count * COIN_PER_CATCH);
  game.audioSystem?.playSFX?.('coin_plink');
  game.menuSystem?.updateUI?.();
  return true;
}
