// Clams are the raw Sea ingredient ('C') every fisherman buys: one coin each,
// the whole carried pile in one SPACE press. Shared by the hut Fisherman
// (FishermanDemoSystem) and the lake Fisherman (ShoreFishermanSystem) so the
// trade reads the same wherever the player meets one.

const CLAM_CHAR = 'C';
const COIN_PER_CLAM = 1;

/**
 * Sell every carried Clam to the fisherman. Returns true when anything sold,
 * so the caller can swallow the SPACE press; false leaves it to the other
 * fisherman interactions.
 */
export function sellClamsToFisherman(game) {
  const inv = game.inventorySystem;
  const count = inv?.countIngredient(CLAM_CHAR) ?? 0;
  if (count <= 0) return false;

  for (let i = 0; i < count; i++) inv.removeIngredient(CLAM_CHAR);
  inv.addCoin(count * COIN_PER_CLAM);
  game.audioSystem?.playSFX?.('coin_plink');
  game.menuSystem?.updateUI?.();
  return true;
}
