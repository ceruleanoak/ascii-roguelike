import { GRID } from '../game/GameConfig.js';
import { ErrandCharacter } from '../entities/ErrandCharacter.js';

/**
 * Items the errand traveler may request.
 * Chosen from weapons and consumables the player commonly carries.
 */
const REQUEST_POOL = ['¬', '†', ')', '/', '↑', 'H', '@', '‡', '⊤', 'X', '⌐'];

/**
 * Rewards dispensed after completing an errand.
 * Rare / powerful items that feel worth the trade.
 */
const REWARD_POOL = ['♦', '✦', '∞', '⚔', '⌘', '⇒', '⚒', 'K', '⛓', 'I', 'W', 'E', 'ᑕ'];

/**
 * ErrandSystem
 *
 * Manages the persistent errand quest loop tied to the E exit-letter room type.
 *
 * Lifecycle:
 *   1. Player enters an E room → enemies spawn normally.
 *   2. Room cleared → onRoomClear(player): starts first errand, returns ErrandCharacter.
 *   3. Player re-enters any E room with active errand → main.js calls
 *      spawnErrandCharacter() after clearing enemies from the room.
 *   4. Player holds requested item, walks close, presses SHIFT →
 *      checkGive(player, neutralCharacters): removes item, returns reward data.
 *   5. ErrandCharacter immediately requests next item (loop continues).
 *   6. Death → resetOnDeath(): wipes state for a clean new run.
 */
export class ErrandSystem {
  constructor() {
    this.activeErrand = null; // { requestedItem: char, rewardIndex: number }
  }

  // ── Hooks called by main.js ─────────────────────────────────────────────────

  /**
   * Called when an E room is cleared for the first time (no active errand).
   * Initialises the errand and returns the ErrandCharacter to spawn, or null.
   * @param {Player} player
   * @returns {ErrandCharacter|null}
   */
  onRoomClear(player) {
    if (this.activeErrand) return null; // Already have an active quest

    this._pickRequest(player);
    if (!this.activeErrand) return null;

    return this.spawnErrandCharacter();
  }

  /**
   * Spawn a new ErrandCharacter at room centre using the current request.
   * (Used both by onRoomClear and by main.js on re-entering an E room.)
   * @returns {ErrandCharacter|null}
   */
  spawnErrandCharacter() {
    if (!this.activeErrand) return null;

    const centerX = (GRID.COLS / 2) * GRID.CELL_SIZE;
    const centerY = (GRID.ROWS / 2) * GRID.CELL_SIZE;
    return new ErrandCharacter(centerX, centerY, this.activeErrand.requestedItem);
  }

  /**
   * Called from the SHIFT handler in EXPLORE mode.
   * Checks whether the player is close to the traveler and holds the requested item.
   *
   * @param {Player} player
   * @param {Array}  neutralCharacters  – game.neutralCharacters
   * @returns {{ rewardChar, rewardName, x, y }|null}
   *   Non-null means a give occurred; caller should spawn the reward Item.
   */
  checkGive(player, neutralCharacters) {
    if (!this.activeErrand) return null;

    const errandChar = neutralCharacters.find(nc => nc instanceof ErrandCharacter);
    if (!errandChar) return null;

    const dist = Math.hypot(
      player.position.x - errandChar.position.x,
      player.position.y - errandChar.position.y
    );
    if (dist > errandChar.getInteractionDistance()) return null;

    const heldItem = player.heldItem;
    if (!heldItem || heldItem.char !== this.activeErrand.requestedItem) return null;

    const givenChar = heldItem.char; // capture before slot is nulled

    // Consume item from active quick slot
    player.quickSlots[player.activeSlotIndex] = null;
    const nextFilled = player.quickSlots.findIndex(
      (slot, idx) => idx !== player.activeSlotIndex && slot !== null
    );
    if (nextFilled !== -1) player.activeSlotIndex = nextFilled;

    // Collect reward data before overwriting errand state
    const rewardChar = REWARD_POOL[this.activeErrand.rewardIndex];
    const result = {
      rewardChar,
      x: errandChar.position.x + (Math.random() - 0.5) * GRID.CELL_SIZE * 2,
      y: errandChar.position.y + (Math.random() - 0.5) * GRID.CELL_SIZE * 2
    };

    // Start next errand, excluding the item just handed over
    this._pickRequest(player, givenChar);
    if (this.activeErrand) {
      errandChar.requestedItem = this.activeErrand.requestedItem;
      errandChar.playerIsClose = false; // force indicator refresh
    }

    return result;
  }

  /** Wipe errand state on player death (new run starts clean). */
  resetOnDeath() {
    this.activeErrand = null;
  }

  // ── Internal ────────────────────────────────────────────────────────────────

  /**
   * Choose a random request that the player doesn't already have in quick slots.
   * @param {Player} player
   * @param {string|null} excludeChar  Item that was just handed over — don't repeat it.
   */
  _pickRequest(player, excludeChar = null) {
    const equipped = (player?.quickSlots ?? [])
      .filter(Boolean)
      .map(s => s.char);

    const available = REQUEST_POOL.filter(
      c => !equipped.includes(c) && c !== excludeChar
    );
    if (available.length === 0) return;

    const requestedItem = available[Math.floor(Math.random() * available.length)];
    this.activeErrand = {
      requestedItem,
      rewardIndex: Math.floor(Math.random() * REWARD_POOL.length)
    };
  }
}
