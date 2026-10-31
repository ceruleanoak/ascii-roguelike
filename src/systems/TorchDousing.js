import { createBurstParticles } from './WorldEffectsSystem.js';

// TorchDousing — deep water destroys torches (maze-traps-plan.md, Phase 2).
// A global rule, not a Maze one: every deep-water tile (ocean, Sunken Ship,
// Quagmire, a flooded Maze) puts out an item whose data carries
// `dousedByDeepWater` — the Torch (♨). The Lantern (♁) is the caged flame
// water can't reach, so it doesn't carry the flag. Called from
// PhysicsSystem.applyLiquidResults on each entity's deep-water frame.
// (A lit Maze Torch fixture is snuffed by the flood itself, MazeTrapSystem.)

const DOUSED_COLOR = '#ff8800';

export function isDousedByDeepWater(item) {
  return !!item?.data?.dousedByDeepWater;
}

// The player stands in deep water: every carried quick-slot torch goes out,
// with one DOUSED word over the player however many it took (the
// Passive-Indicator shape ConsumableSlotBreaks.destroyWetOils uses for its
// DISSOLVED). removeCarriedItem owns the slot clear, the active-slot
// fallback and the equipment reprojection.
export function douseCarriedTorches(game, player) {
  const slots = player.quickSlots;
  if (!slots?.some(isDousedByDeepWater)) return;
  slots.forEach((item, i) => {
    if (!isDousedByDeepWater(item)) return;
    if (game.particles) {
      createBurstParticles(game, game.particles, player.position.x + 8, player.position.y + 8, 8, item.color || DOUSED_COLOR);
    }
    game.inventorySystem.removeCarriedItem('quick', i, player);
  });
  game.combatSystem?.createDamageNumber('DOUSED', player.position.x, player.position.y - 14, DOUSED_COLOR);
}
