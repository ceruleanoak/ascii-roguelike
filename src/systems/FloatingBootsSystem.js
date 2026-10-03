// FloatingBootsSystem — owns the Floating Boots (ѡ) charge lifecycle.
//
// The boots are a passive slot item, never thrown or consumed. Their charge
// (seconds of float, `item.floatCharge`) lives on the slot's Item instance so
// it survives slot reorders and travels with the boots. Each frame:
//   - the charge is projected onto `player.floatCharge`, which PhysicsSystem
//     reads to keep the player afloat (and to open 'float' passable zones);
//   - while PhysicsSystem reports the player over liquid (`player.overLiquid`),
//     the charge drains in real seconds — dry ground costs nothing;
//   - at zero the slot reverts to the boots' `spentChar` (plain Boots ꙍ).
//
// Runs from Game.updatePlayerMechanics, so it ticks in every state that moves
// the player (REST / EXPLORE / NEUTRAL) — no per-state wiring needed.
export class FloatingBootsSystem {
  constructor(game) {
    this.game = game;
  }

  update(deltaTime) {
    const { player, inventorySystem } = this.game;
    if (!player) return;

    const slots = player.equippedConsumables ?? [];
    const index = slots.findIndex(item => item?.floatCharge > 0);
    if (index < 0) {
      player.floatCharge = 0;
      return;
    }

    const boots = slots[index];
    if (player.overLiquid) {
      boots.floatCharge = Math.max(0, boots.floatCharge - deltaTime);
      if (boots.floatCharge <= 0) {
        inventorySystem.replaceConsumableSlot(index, boots.data.spentChar);
        inventorySystem.applyEquipmentEffectsToPlayer(player);
        player.floatCharge = 0;
        this.game.updateUI();
        return;
      }
    }
    player.floatCharge = boots.floatCharge;
  }
}
