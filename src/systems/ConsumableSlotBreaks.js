import { createBurstParticles } from './WorldEffectsSystem.js';

// ConsumableSlotBreaks — a world event destroys an equipped consumable in
// place: water washes oils off, HP hitting 0 shatters hearts. Free functions
// over InventorySystem (which still owns the slot arrays), same shape as
// IngredientPile.js. Each break clears the slot to null exactly like a spent
// non-leavesBottle consumable and bursts particles in the item's colour —
// that burst is the only feedback, per the non-instructive UI rule.

function shatterSlot(inventorySystem, player, slotIndex, fallbackColor) {
  const item = inventorySystem.equippedConsumables[slotIndex];
  const game = inventorySystem.game;
  if (game?.particles) {
    createBurstParticles(game, game.particles, player.position.x + 20, player.position.y + 20, 10, item.color || fallbackColor);
  }
  inventorySystem.equippedConsumables[slotIndex] = null;
  if (player.equippedConsumables) player.equippedConsumables[slotIndex] = null;
  inventorySystem.spentConsumableSlots[slotIndex] = true;
}

// Water washes any equipped Oil augment (oilEffect) off the bow/dagger it's
// coating — called by PhysicsSystem.applyLiquidResults on the player's
// dry→wet transition. Oils never carry leavesBottle; the `wet` status pip
// (StatusEffectVisuals.js/StatusPipEffects.js) tells the player why.
export function destroyWetOils(inventorySystem, player) {
  inventorySystem.equippedConsumables.forEach((item, i) => {
    if (item?.data?.oilEffect) shatterSlot(inventorySystem, player, i, '#a07040');
  });
}

// HP hit 0: every equipped breaksOnDeath item (Heart, Dragon Heart) shatters.
// Called before any death save resolves (main.js death check,
// ThreeRoomSystem._resolveContactDeath), so a revive keeps the player alive
// but not the heart — and the revive HP lands against the already-reduced
// max. Reprojects equipment afterwards so the lost maxHpBonus comes off.
export function breakOnDeathPassives(inventorySystem, player) {
  let broke = false;
  inventorySystem.equippedConsumables.forEach((item, i) => {
    if (!item?.data?.breaksOnDeath) return;
    shatterSlot(inventorySystem, player, i, '#ff0000');
    broke = true;
  });
  if (broke) inventorySystem.applyEquipmentEffectsToPlayer(player);
}
