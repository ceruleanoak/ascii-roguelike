import { GAME_STATES } from '../game/GameConfig.js';

/**
 * Everything that follows a successful ground pickup (an
 * InventorySystem.tryPickupItem result): the blessing, the pickup box, pickup
 * sfx, the Three Room's record of what was held, and a displaced item routed
 * to the chest. Shared by SPACE pickup (Game.tryPickupItem) and the TAKEALL
 * Spell (TakeAllSystem).
 */
export function settlePickup(game, result) {
  // Handle blessing pickup (apply blessing effect)
  if (result.blessing) {
    game.applyBlessing(result.blessing);
  }

  game.menuSystem.announcePickupResult(result);

  if (result.pickedUpType === 'WEAPON' && game.stateMachine.currentState === GAME_STATES.EXPLORE) {
    game.audioSystem.playSFX('weapon_pickup');
  }

  // The Three Room's globe only offers back what this run actually held.
  game.threeSlotGlobeSystem.recordTouched(result.pickedUpChar);

  // Key items (Vault Key / Skull Key) — held-confirmation sfx fires here,
  // at the moment it's actually picked up, not when the carrying object
  // is merely destroyed (InteractionSystem.handleObjectEffect).
  if (result.pickedUpType === 'KEY') {
    game.audioSystem.playSFX(result.pickedUpChar === '⚿' ? 'dungeon_key_pickup' : 'vault_key_pickup');
  }

  // Displaced item routes to REST chest instead of being dropped on the ground.
  // In EXPLORE, deposit is deferred — it only reaches the chest on a safe
  // REST return,
  // discarded on death so displaced weapons don't survive a wipe.
  if (result.droppedItem) {
    if (game.stateMachine.currentState === GAME_STATES.EXPLORE) {
      game.inventorySystem.deferToChest(result.droppedItem);
    } else {
      game.inventorySystem.addToChest(result.droppedItem);
    }
  }

  game.updateUI();
}
