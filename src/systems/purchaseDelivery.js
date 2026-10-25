import { Item } from '../entities/Item.js';
import { tagLootLayer } from './PlaneSystem.js';

/**
 * Hands a bought item to the player from inside a PauseSystem modal (the
 * Settlement Shopkeeper's WARES, the Jeweler's necklaces).
 *
 * Runs the item through InventorySystem.tryPickupItem, the same pipeline a
 * ground pickup uses, against a private one-item scratch array (not
 * game.items, since tryPickupItem returns on the first item within range and
 * a hut's own spawned bread loaf could otherwise get picked up instead).
 *
 * Full quick/armor/consumable slots: SlotReplacementSystem must be the only
 * active modal (PauseSystem allows one at a time), so the seller's modal is
 * closed and the choice handed off. tryPickupItem is a no-op in that branch —
 * nothing was spliced/consumed — so it's safe to have called it first. The
 * player re-opens the seller with SPACE afterward to keep shopping.
 *
 * Returns true when the seller's modal was closed for the hand-off.
 */
export function deliverPurchase(game, char) {
  const player = game.player;
  const scratch = [tagLootLayer(game, new Item(char, player.position.x, player.position.y))];
  const result = game.inventorySystem.tryPickupItem(
    scratch, game.placedTraps, player, game.physicsSystem,
    true, 0, 0, game.renderer
  );

  if (result.needsSlotChoice) {
    game.pauseSystem.closeModal();
    game.slotReplacementSystem.maybeOpen(result);
    return true;
  }

  if (result.success) {
    game.menuSystem.announcePickupResult(result);
    if (result.pickedUpType === 'WEAPON') game.audioSystem.playSFX('weapon_pickup');
    game.updateUI();
  }
  // Borrowed from the well/camp-NPC/fisherman/weapons-master coin arcs for
  // parity — same purchase cue, no visual arc (the menu already confirms
  // the transaction, so there's nothing for an animation to add here).
  game.audioSystem?.playSFX?.('coin_plink');
  return false;
}
