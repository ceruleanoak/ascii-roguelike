import { GRID } from '../game/GameConfig.js';
import { createActivationBurst } from '../entities/Particle.js';
import { FAIRY_HEAL } from '../entities/Fairy.js';
import { tagInteriorPlane } from './PlaneSystem.js';
import { captureDeath } from './DeathLedgerSystem.js';

// DeathSaveSystem — the equipped-consumable death intercepts, tried in order
// when HP hits 0 in EXPLORE (main.js death check). The free Fairy in a Bottle
// is spent before a crafted Phoenix Feather. Extracted from main.js; the
// GAME_OVER path for an uncaught death still lives there.
//
// Each entry: the consumable `effect` that marks the save, its ledger tag,
// the HP it restores, and whether it plays the pickup chime.
const DEATH_SAVES = [
  { effect: 'revive_on_death', revivedBy: 'fairy_bottle', label: '🧚 Fairy in a Bottle',
    restoreHp: (player) => Math.min(player.maxHp, FAIRY_HEAL), sfx: 'pickup' },
  { effect: 'revive', revivedBy: 'phoenix_feather', label: '✨ Phoenix Feather',
    restoreHp: (player) => Math.floor(player.maxHp * 0.5), sfx: null },
];

/**
 * Spends the first equipped death save, if any. Returns true when the death
 * was intercepted — the caller must then NOT transition to GAME_OVER.
 */
export function tryDeathSave(game) {
  const player = game.player;
  for (const save of DEATH_SAVES) {
    const slotIdx = (player.equippedConsumables || []).findIndex(c => c?.data?.effect === save.effect);
    if (slotIdx === -1) continue;

    // Ledger: record the intercepted death before restoring state
    captureDeath(game, { event: 'revive', revivedBy: save.revivedBy });
    const item = player.equippedConsumables[slotIdx];
    player.hp = save.restoreHp(player);
    player.invulnerabilityTimer = 2.0;
    // Clear movement-locking state so the player isn't frozen post-revive
    // (e.g. died mid-dodge-roll — dodgeRoll.active must be false or
    // updatePlayerMechanics zeroes input every frame; bug #1865).
    game._clearReviveMovementLocks();
    game.combatSystem.createDamageNumber(
      item.char,
      player.position.x,
      player.position.y - GRID.CELL_SIZE * 0.5,
      item.color
    );
    const burst = createActivationBurst(player.position.x, player.position.y, item.color);
    for (const p of burst) tagInteriorPlane(game, p);
    game.particles.push(...burst);
    game.inventorySystem.equippedConsumables[slotIdx] = null;
    player.equippedConsumables[slotIdx] = null;
    game.inventorySystem.spentConsumableSlots[slotIdx] = true;
    if (save.sfx) game.audioSystem?.playSFX?.(save.sfx);
    game.saveGameState();
    console.log(`${save.label} activated — death intercepted! HP restored to ${player.hp}`);
    return true;
  }
  return false;
}
