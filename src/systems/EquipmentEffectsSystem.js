/**
 * EquipmentEffectsSystem.js
 *
 * Projects the player's currently-equipped armor and consumables onto their
 * live stat fields (defense, resists, immunities, movement/roll modifiers,
 * passive procs). Extracted from InventorySystem — which still owns the
 * equipment slots (equippedArmor / equippedConsumables) as the source data —
 * to keep that file under its architecture budget. This file owns only the
 * "equipment state → player stat fields" projection, nothing else.
 *
 * Sole entry point: InventorySystem.applyEquipmentEffectsToPlayer(player),
 * which delegates to apply() below. Callers should keep going through that
 * method rather than reaching in here directly, so InventorySystem stays the
 * one documented place that "recompute my stats" is triggered from.
 */
export class EquipmentEffectsSystem {
  /**
   * Reset every armor/consumable-derived stat field on `player`, then
   * reapply from `inventorySystem`'s current equipment. Idempotent — safe to
   * call after any equip/unequip/dequip/blessing change; each call fully
   * recomputes from current equipment rather than accumulating deltas.
   */
  apply(player, inventorySystem) {
    // Reset all armor properties
    player.defense = 0;
    player.bulletResist = 0;
    player.meleeResist = 0;
    player.dodgeChance = 0;
    player.fireImmune = false;
    player.freezeImmune = false;
    player.poisonImmune = false;
    player.slimeImmune = false;
    player.reflectDamage = 0;
    player.smokeOnHit = false;
    player.speedBoost = 0;
    player.speedPenalty = 0;
    player.slowEnemies = false;
    player.burnResist = 0;
    player.massBonus = 0;
    player.rollCooldownMult = 1.15;
    player.extraIframes = 0;
    player.gooConsume = false;
    player.bladeKillHeal = false;
    player.batTransform = false;
    player.whirlwindCape = false;
    player.sharkMask = false;
    player.coralCrown = false;
    player.stingrayMantle = false;

    // Apply equipped armor properties
    if (inventorySystem.equippedArmor) {
      const a = inventorySystem.equippedArmor.data;
      player.defense = a.defense || 0;
      player.bulletResist = a.bulletResist || 0;
      player.meleeResist = a.meleeResist || 0;
      player.dodgeChance = a.dodgeChance || 0;
      player.fireImmune = a.fireImmune || false;
      player.freezeImmune = a.freezeImmune || false;
      player.poisonImmune = a.poisonImmune || false;
      player.slimeImmune = a.slimeImmune || false;
      player.reflectDamage = a.reflectDamage || 0;
      player.smokeOnHit = a.smokeOnHit || false;
      player.speedBoost = a.speedBoost || 0;
      player.speedPenalty = a.speedPenalty || 0;
      player.slowEnemies = a.slowEnemies || false;
      player.burnResist = a.burnResist || 0;
      player.massBonus = a.massBonus || 0;
      player.rollCooldownMult = a.rollCooldownMult || 1.15;
      player.extraIframes = a.extraIframes || 0;
      player.gooConsume = a.gooConsume || false;
      player.bladeKillHeal = a.bladeKillHeal || false;
      player.batTransform = a.batTransform || false;
      player.whirlwindCape = a.whirlwindCape || false;
      player.sharkMask = a.sharkMask || false;
      player.coralCrown = a.coralCrown || false;
      player.stingrayMantle = a.stingrayMantle || false;
    }

    player.mass = 1 + player.massBonus; // base mass + massBonus, read by PhysicsSystem

    // Add temporary block boost from Metal Block consumable
    if (player.blockBoostTimer > 0) {
      player.defense += player.blockBoostAmount;
    }

    // Onyx offered to a fairy fountain. Folded in here rather than written once
    // at the pool, because this function zeroes defense on every equip — a bonus
    // set outside this function is erased the next time armor changes.
    player.defense += player.fountainArmorBonus;

    // Apply passive consumable bonuses (Lucky Coin). luckBlessed (well ritual) is separate, untouched here.
    player.luckActive = false;
    player.critChance = 0;
    player.luckDodgeBonus = 0;
    player.fireBerryLit = false;
    inventorySystem.equippedConsumables.forEach((slot, idx) => {
      const cd = slot?.data;
      if (!cd) return;
      if (cd.luckPassive) {
        player.luckActive = true;
        player.critChance = Math.max(player.critChance, cd.critChance || 0);
        player.luckDodgeBonus = Math.max(player.luckDodgeBonus, cd.dodgeBonus || 0);
      }
      // Fire Berry: passive torch-light while equipped and unspent. Consuming
      // it (SPACE) empties the slot, which naturally stops the light.
      if (cd.fireBerryLight && !inventorySystem.spentConsumableSlots[idx]) {
        player.fireBerryLit = true;
      }
    });

    // Store equipped consumables for condition checking during gameplay
    player.equippedConsumables = [...inventorySystem.equippedConsumables];
  }
}
