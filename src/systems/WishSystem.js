import { GAME_STATES } from '../game/GameConfig.js';
import { captureDeath } from './DeathLedgerSystem.js';

/**
 * WishSystem — executes the three-wish economy's outcomes.
 *
 * A wish is spent by typing CLEANSE or REVIVE/CONTINUE (and by HEAL/UNCURSE
 * curing the frog polymorph, which mirrors the slot destruction in
 * PolymorphSystem.cureViaWish). Each wish permanently destroys one quick
 * slot — wish 1 takes slot 0, wish 2 slot 1, wish 3 slot 2 — the "give up"
 * layer's core trade: holding-power converted into power.
 *
 * Extracted from main.js (flagged twice in claudedocs/review) so the
 * orchestrator stays dispatch-only.
 */
export class WishSystem {
  /**
   * Execute a CLEANSE wish — destroys all non-player, non-background entities,
   * consumes one wish, and permanently destroys the highest available quick slot.
   */
  executeCleanse(game) {
    if (game.wishesUsed >= 3) return;

    // Consume one wish and destroy the corresponding quick slot (0→1→2 as wishes used)
    const slotIdx = game.wishesUsed; // wish 1 → slot 0, wish 2 → slot 1, wish 3 → slot 2
    game.wishesUsed++;

    game._savedDestroyedSlots[slotIdx] = true;
    if (game.player) {
      // Move item to an empty slot before destroying this one
      const item = game.player.quickSlots[slotIdx];
      if (item) {
        const emptySlot = game.player.quickSlots.findIndex(
          (s, i) => i !== slotIdx && s === null && !game.player.destroyedSlots[i]
        );
        if (emptySlot !== -1) game.player.quickSlots[emptySlot] = item;
      }
      game.player.quickSlots[slotIdx] = null;
      game.player.destroyedSlots[slotIdx] = true;
      // Shift active slot away from any destroyed slot
      if (game.player.destroyedSlots[game.player.activeSlotIndex]) {
        const next = game.player.quickSlots.findIndex((_, i) => !game.player.destroyedSlots[i]);
        if (next !== -1) game.player.activeSlotIndex = next;
      }
    }

    // Clear all non-player, non-background entities — interior-aware via
    // activeRoom, so a cleanse inside a hut/dungeon clears that floor rather
    // than leaking onto the frozen surface room.
    const room = game.activeRoom;
    if (room) {
      room.enemies = [];
    }
    game.combatSystem.clear();
    game._resetEnvironmentalEffects();
    game.items = [];
    game.ingredients = [];

    // Play wave animation
    game.cleanseWave = { startTime: performance.now(), duration: 1400 };

    game.renderController.screenShake.trigger();
    game.updateUI();
  }

  /**
   * Execute a REVIVE wish — consumes a wish and continues the current fight
   * in place without resetting the room. Zone depths, run state, and all
   * living enemies are preserved.
   */
  executeRevive(game) {
    if (game.wishesUsed >= 3) return;
    if (game.stateMachine.getCurrentState() !== GAME_STATES.GAME_OVER) return;

    // Ledger: the preceding 'death' record shares this runId — a 'revive'
    // record marks that death as undone, so analysis can tell wish-revived
    // deaths from run-ending ones. Snapshot before slots are destroyed.
    captureDeath(game, { event: 'revive', revivedBy: 'wish' });

    // Consume a wish and destroy a slot (same order as CLEANSE: 0→1→2)
    const slotIdx = game.wishesUsed;
    game.wishesUsed++;

    game._savedDestroyedSlots[slotIdx] = true;
    if (game.player) {
      // Move item to an empty slot before destroying this one
      const item = game.player.quickSlots[slotIdx];
      if (item) {
        const emptySlot = game.player.quickSlots.findIndex(
          (s, i) => i !== slotIdx && s === null && !game.player.destroyedSlots[i]
        );
        if (emptySlot !== -1) game.player.quickSlots[emptySlot] = item;
      }
      game.player.quickSlots[slotIdx] = null;
      game.player.destroyedSlots[slotIdx] = true;
      // Shift active slot away from any destroyed slot
      if (game.player.destroyedSlots[game.player.activeSlotIndex]) {
        const next = game.player.quickSlots.findIndex((_, i) => !game.player.destroyedSlots[i]);
        if (next !== -1) game.player.activeSlotIndex = next;
      }
    }
    // Clear the REST-saved slot so enterRestState() won't restore an item into it
    if (game.inventorySystem.restQuickSlots) {
      game.inventorySystem.restQuickSlots[slotIdx] = null;
    }
    // Sanitize restActiveSlotIndex so enterRestState() doesn't restore a destroyed slot as active
    if (game._savedDestroyedSlots[game.inventorySystem.restActiveSlotIndex ?? 0]) {
      const next = game._savedDestroyedSlots.findIndex(d => !d);
      game.inventorySystem.restActiveSlotIndex = next !== -1 ? next : 0;
    }

    // If a character-death swap was pending, undo it — the revived run continues with this character
    if (game.characterDeathPending) {
      const deadIdx = game.deadCharacters.indexOf(game.activeCharacterType);
      if (deadIdx !== -1) game.deadCharacters.splice(deadIdx, 1);
      game.characterDeathPending = false;
      game.characterDeathTimer = 0;
      game.pendingNextCharacter = null;
      game.characterDeathName = '';
    }

    // Restore player at half HP with a brief invulnerability window
    if (game.player) {
      game.player.hp = Math.ceil(game.player.maxHp * 0.5);
      game.player.invulnerabilityTimer = 5.0;
      game.player.velocity.vx = 0;
      game.player.velocity.vy = 0;
      game.player._killedByGhost = false;

      // Clear any movement-locking state the player died in — dodge roll,
      // grab, whip hook, sapping bats, fishing. Without this, a mid-roll
      // death leaves dodgeRoll.active=true and the player frozen on revive
      // because updatePlayerMechanics zeroes input while rolling (bug #1865).
      game._clearReviveMovementLocks();
    }

    // Clear death screen state
    game.gameOverWaitingForSpace = false;
    game.gameOverDeathTimer = 0;

    // Clear death explosion particles (leave environmental debris)
    game.particles = [];

    // Reactivate boss AI if the player died in a boss room
    if (game.currentRoom?.isBossRoom) {
      game.bossSystem.reactivate(game.currentRoom);
    }

    // Resume music
    game.audioSystem.play();

    // Force background redraw
    game.renderer.markBackgroundDirty();

    // Return without regenerating the room (bypass the state handler).
    // A wish-revived death inside the Three Room resumes NEUTRAL, not
    // EXPLORE — the room you cheated Death in is still around you.
    game.stateMachine.currentState = game.currentRoom?.isThreeRoom
      ? GAME_STATES.NEUTRAL
      : GAME_STATES.EXPLORE;

    game.renderController.screenShake.trigger();
    game.updateUI();
  }
}
