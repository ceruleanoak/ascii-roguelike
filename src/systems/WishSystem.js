import { GAME_STATES } from '../game/GameConfig.js';
import { captureDeath } from './DeathLedgerSystem.js';

/** A run holds three wishes; each one spent breaks a quick slot. */
export const MAX_WISHES = 3;

/**
 * WishSystem — the three-wish economy: spending a wish, and the outcomes of
 * the wishes it owns (PURGE, REVIVE).
 *
 * Every Wish Spell spends through spend(), the one place a wish is consumed
 * (claudedocs/three-voice-plan.md §9). Each wish permanently destroys one
 * quick slot — wish 1 takes slot 0, wish 2 slot 1, wish 3 slot 2 — the "give
 * up" layer's core trade: holding-power converted into power.
 *
 * Extracted from main.js (flagged twice in claudedocs/review) so the
 * orchestrator stays dispatch-only.
 */
export class WishSystem {
  /** True while the run still holds an unspent wish. */
  hasWish(game) {
    return game.wishesUsed < MAX_WISHES;
  }

  /**
   * Spend one wish: bump the count and destroy the matching quick slot. Its
   * item moves to an empty slot when one exists; the active slot steps off the
   * destroyed one; the REST-saved copy of the slot is cleared so
   * enterRestState() can't restore an item into it.
   * @returns {boolean} false when no wish was left to spend
   */
  spend(game) {
    if (!this.hasWish(game)) return false;
    const slotIdx = game.wishesUsed; // wish 1 → slot 0, wish 2 → slot 1, wish 3 → slot 2
    game.wishesUsed++;
    game._savedDestroyedSlots[slotIdx] = true;

    const player = game.player;
    if (player) {
      const item = player.quickSlots[slotIdx];
      if (item) {
        const emptySlot = player.quickSlots.findIndex(
          (s, i) => i !== slotIdx && s === null && !player.destroyedSlots[i]
        );
        if (emptySlot !== -1) player.quickSlots[emptySlot] = item;
      }
      player.quickSlots[slotIdx] = null;
      player.destroyedSlots[slotIdx] = true;
      if (player.destroyedSlots[player.activeSlotIndex]) {
        const next = player.quickSlots.findIndex((_, i) => !player.destroyedSlots[i]);
        if (next !== -1) player.activeSlotIndex = next;
      }
    }

    const inv = game.inventorySystem;
    if (inv?.restQuickSlots) inv.restQuickSlots[slotIdx] = null;
    if (inv && game._savedDestroyedSlots[inv.restActiveSlotIndex ?? 0]) {
      const next = game._savedDestroyedSlots.findIndex(d => !d);
      inv.restActiveSlotIndex = next !== -1 ? next : 0;
    }
    game.updateUI?.();
    return true;
  }

  /**
   * Execute a PURGE wish — destroys all non-player, non-background entities.
   * The wish itself was already spent by the Wish Spell (wishSpell, spells.js).
   */
  executePurge(game) {
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
    if (!this.hasWish(game)) return;
    if (game.stateMachine.getCurrentState() !== GAME_STATES.GAME_OVER) return;

    // Ledger: the preceding 'death' record shares this runId — a 'revive'
    // record marks that death as undone, so analysis can tell wish-revived
    // deaths from run-ending ones. Snapshot before slots are destroyed.
    captureDeath(game, { event: 'revive', revivedBy: 'wish' });

    this.spend(game);

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
