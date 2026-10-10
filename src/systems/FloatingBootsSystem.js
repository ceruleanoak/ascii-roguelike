// FloatingBootsSystem — owns the charge lifecycle of the charged boots:
// Floating Boots (ѡ, float) and their sibling Rubber Boots (ѽ, water
// immunity).
//
// Both are passive slot items, never thrown or consumed. Their charge
// (seconds, `item.floatCharge` / `item.waterCharge`) lives on the slot's Item
// instance so it survives slot reorders and travels with the boots. Each frame,
// per pair:
//   - the charge is projected onto the player (`player.floatCharge`, which
//     PhysicsSystem reads to keep the player afloat and to open 'float'
//     passable zones; `player.waterImmunityTimer`, which PhysicsSystem and
//     ElectricitySystem read to skip water's wet status and shock);
//   - while the player is in the boots' medium, the charge drains in real
//     seconds — dry ground costs nothing. Float drains over any liquid
//     (`player.overLiquid`), rubber over water only (`player.inLiquid`);
//   - at zero the slot reverts to the boots' `spentChar` (plain Boots ꙍ).
//
// Runs from Game.updatePlayerMechanics, so it ticks in every state that moves
// the player (REST / EXPLORE / NEUTRAL) — no per-state wiring needed.
const CHARGED_BOOTS = [
  { charge: 'floatCharge', playerField: 'floatCharge',        drains: player => player.overLiquid },
  { charge: 'waterCharge', playerField: 'waterImmunityTimer', drains: player => player.inLiquid },
];

export class FloatingBootsSystem {
  constructor(game) {
    this.game = game;
  }

  update(deltaTime) {
    const { player } = this.game;
    if (!player) return;
    for (const boots of CHARGED_BOOTS) this._updateBoots(player, boots, deltaTime);
  }

  _updateBoots(player, { charge, playerField, drains }, deltaTime) {
    const { inventorySystem } = this.game;
    const slots = player.equippedConsumables ?? [];
    const index = slots.findIndex(item => item?.[charge] > 0);
    if (index < 0) {
      player[playerField] = 0;
      return;
    }

    const boots = slots[index];
    if (drains(player)) {
      boots[charge] = Math.max(0, boots[charge] - deltaTime);
      if (boots[charge] <= 0) {
        inventorySystem.replaceConsumableSlot(index, boots.data.spentChar);
        inventorySystem.applyEquipmentEffectsToPlayer(player);
        player[playerField] = 0;
        this.game.updateUI();
        return;
      }
    }
    player[playerField] = boots[charge];
  }
}
