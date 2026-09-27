// LavaContact — what touching lava does to a body, in one place. Two sources
// share it: lava background tiles (PhysicsSystem.applyLiquidResults) and a
// fire-imbued Giant Slime's lava trail (TrapSystem.updatePuddles), so a lava
// trail stamp is exactly as dangerous as a lava tile.
//
// Takes the owning `game` first, matching the ElectricConduction.js pattern.
// Returns true when the tick killed the player, so the caller can end the run
// through its own death path.
export function applyLavaContact(game, entity, damage, deltaTime) {
  // Lava-immune enemies (e.g. Tortoise) survive lava but track their state for
  // behavior changes. A fire affinity — authored or from an Imbue — is the
  // same immunity.
  if (entity.data?.lavaImmune || entity.getAffinities?.().includes('fire')) {
    entity.inLava = true;
    entity.inDamagingLiquid = false; // immune — not actually taking damage, no burn pip
    return false;
  }
  // Wet skin survives lava. Water is scarce wherever lava is — the red
  // zone's own liquidType replaces water with lava outright — so this is
  // a crossing bought somewhere else and carried in, not a standing
  // immunity, and it lasts exactly as long as the 6s wet status does.
  // The yellow lava-moat Barricade is the gate written against it.
  // Player and Enemy both answer isWet(); a companion that answers
  // nothing simply keeps burning.
  if (entity.isWet?.()) {
    entity.inLava = true;
    entity.inDamagingLiquid = false;
    return false;
  }
  // Lava contact reads as "burning" for the status pip (StatusEffectVisuals.js)
  // even though the damage below is lava's own tick, not the burn DOT.
  entity.inDamagingLiquid = true;
  // Apply lava damage (not affected by water immunity)
  if (!entity.takeDamage) return false;
  // Initialize lava damage timer if needed
  if (!entity.lavaDamageTimer) {
    entity.lavaDamageTimer = 0;
  }

  // Only apply damage once per second (not every frame)
  entity.lavaDamageTimer -= deltaTime;
  if (entity.lavaDamageTimer > 0) return false;

  let killedPlayer = false;
  const damageResult = entity.takeDamage(damage);

  // Visual feedback for whichever entity took the hit — player or
  // enemy (enemies used to take lava damage silently, no damage
  // number and no hit flash).
  if (damageResult === true) {
    // Lethal hit
    if (entity === game.player) killedPlayer = true;
    game.combatSystem.createDamageNumber(damage, entity.position.x, entity.position.y, '#ff4400');
    entity.hitFlashTimer = 0.15;
  } else if (damageResult && damageResult.damaged) {
    // Damage was dealt successfully
    game.combatSystem.createDamageNumber(damage, entity.position.x, entity.position.y, '#ff4400');
    entity.hitFlashTimer = 0.15;
  } else if (damageResult && damageResult.dodged) {
    game.combatSystem.createDamageNumber('DODGE', entity.position.x, entity.position.y, '#ffff00');
  } else if (damageResult && damageResult.immune) {
    game.combatSystem.createDamageNumber('IMMUNE', entity.position.x, entity.position.y, '#00ffff');
  }
  // damageResult === false: blocked by invulnerability frames - no visual feedback

  // Reset timer for next damage tick (1 second interval)
  entity.lavaDamageTimer = 1.0;
  return killedPlayer;
}
