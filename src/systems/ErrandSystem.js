import { GRID } from '../game/GameConfig.js';
import { ErrandCharacter } from '../entities/ErrandCharacter.js';

/**
 * Three-stage trade progression.
 *
 * Stage 0 — rare ingredient → good item (tier-2 weapon/armor)
 * Stage 1 — low-tier item   → medium-tier item
 * Stage 2 — medium-tier item → legendary item  (repeats indefinitely)
 */
const STAGE_CONFIG = [
  {
    // Stage 0: rare ingredient for a solid tier-2 weapon or armor
    requestPool: ['M', 't', 'e', 's', 'F', 'k'], // Metal, Teeth, Eye, Scale, Fire Essence, Silk
    rewardPool:  ['‡', 'ᛉ', '⟩', '⊤', 'X', '⛓', '𐤄', '𐤂'],
    isIngredient: true
  },
  {
    // Stage 1: starter weapon for a strong mid-tier weapon or armor
    requestPool: ['¬', '†', ')', '/', '↑'],       // tier-1 starters
    rewardPool:  ['⌐', 'ᛁ', '↯', 'ᛞ', 'ᚺ', 'ᛟ', 'ᛏ', '✺', '𐤆'],
    isIngredient: false
  },
  {
    // Stage 2: mid-tier item for legendary — repeats on subsequent trades
    requestPool: ['‡', 'ᛉ', '⟩', '⊤', 'X', '⌐', '𐤄', '⛓', '𐤂', '𐤆'],
    rewardPool:  ['⚔', '⏚', '⚒', 'ᛋ', 'ᚨ', '⟰', '⇒', '✦', '♦', '∞', '𐤓', '𐤉', '𐤏', 'ᚲ'],
    isIngredient: false
  }
];

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
 *   4. Player holds requested item (or ingredient), walks close, presses SPACE →
 *      checkGive(player, neutralCharacters, inventorySystem): removes item, returns reward data.
 *   5. Stage advances (capped at 2); ErrandCharacter requests the next item.
 *   6. Death → resetOnDeath(): wipes state for a clean new run.
 */
export class ErrandSystem {
  constructor() {
    this.activeErrand = null; // { requestedItem: char, rewardIndex: number, stage: number }
    this.stage = 0;           // 0 | 1 | 2
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
    return new ErrandCharacter(centerX, centerY, this.activeErrand.requestedItem, this.activeErrand.stage);
  }

  /**
   * Called from the SHIFT handler in EXPLORE mode.
   * Checks whether the player is close to the traveler and holds (or carries as ingredient)
   * the requested item.
   *
   * @param {Player} player
   * @param {Array}  neutralCharacters  – game.neutralCharacters
   * @param {InventorySystem} inventorySystem  – needed to check/consume equipped
   *   or carried armor for stage 1-2 armor requests (not reachable via quickSlots)
   * @returns {{ rewardChar, x, y }|null}
   *   Non-null means a give occurred; caller should spawn the reward Item.
   */
  checkGive(player, neutralCharacters, inventorySystem) {
    if (!this.activeErrand) return null;

    const errandChar = neutralCharacters.find(nc => nc instanceof ErrandCharacter);
    if (!errandChar) return null;

    const dist = Math.hypot(
      player.position.x - errandChar.position.x,
      player.position.y - errandChar.position.y
    );
    if (dist > errandChar.getInteractionDistance()) return null;

    const stageConfig = STAGE_CONFIG[this.activeErrand.stage];
    const requestedChar = this.activeErrand.requestedItem;
    let givenChar;

    if (stageConfig.isIngredient) {
      // Stage 0: consume from player.inventory (current EXPLORE run) or, failing
      // that, restInventory (banked REST-mode ingredients) — the errand doesn't
      // care which pool the ingredient came from.
      const idx = player.inventory.findIndex(ing => ing === requestedChar);
      if (idx !== -1) {
        player.inventory.splice(idx, 1);
      } else {
        const restIdx = inventorySystem?.restInventory.findIndex(ing => ing === requestedChar) ?? -1;
        if (restIdx === -1) return null;
        inventorySystem.restInventory.splice(restIdx, 1);
      }
      givenChar = requestedChar;
    } else {
      // Stages 1-2: item can be in any quick slot (not just the active one),
      // equipped as armor, or sitting in the carried armor spares — scan all
      // of them rather than only the active held item.
      const slotIdx = player.quickSlots.findIndex(slot => slot?.char === requestedChar);
      if (slotIdx !== -1) {
        givenChar = requestedChar;
        player.quickSlots[slotIdx] = null;
        if (slotIdx === player.activeSlotIndex) {
          const nextFilled = player.quickSlots.findIndex(
            (slot, idx) => idx !== player.activeSlotIndex && slot !== null
          );
          if (nextFilled !== -1) player.activeSlotIndex = nextFilled;
        }
      } else if (inventorySystem?.equippedArmor?.char === requestedChar) {
        givenChar = requestedChar;
        inventorySystem.equippedArmor = null;
      } else {
        const armorIdx = inventorySystem?.armorInventory?.findIndex(a => a.char === requestedChar) ?? -1;
        if (armorIdx === -1) return null;
        givenChar = requestedChar;
        inventorySystem.armorInventory.splice(armorIdx, 1);
      }
    }

    // Collect reward before advancing stage
    const rewardChar = stageConfig.rewardPool[this.activeErrand.rewardIndex];
    const result = {
      rewardChar,
      x: errandChar.position.x + (Math.random() - 0.5) * GRID.CELL_SIZE * 2,
      y: errandChar.position.y + (Math.random() - 0.5) * GRID.CELL_SIZE * 2
    };

    // Advance stage (cap at 2 so legendary trades continue indefinitely)
    this.stage = Math.min(this.stage + 1, STAGE_CONFIG.length - 1);

    // Start next errand at new stage, excluding the item just handed over
    this._pickRequest(player, givenChar);
    if (this.activeErrand) {
      errandChar.requestedItem = this.activeErrand.requestedItem;
      errandChar.stage = this.activeErrand.stage;
      errandChar.playerIsClose = false; // force indicator refresh
    }

    return result;
  }

  /**
   * Side-trade: hand the traveler an Artifact ⚜ for 2 coins, independent of
   * the active stage errand. Returns spawn data ({coins, x, y}) on success.
   * Active errand is untouched — the player can still complete the stage trade.
   */
  tryGiveArtifact(player, neutralCharacters) {
    const errandChar = neutralCharacters?.find(nc => nc instanceof ErrandCharacter);
    if (!errandChar) return null;

    const dist = Math.hypot(
      player.position.x - errandChar.position.x,
      player.position.y - errandChar.position.y
    );
    if (dist > errandChar.getInteractionDistance()) return null;

    const idx = player.inventory.indexOf('⚜');
    if (idx === -1) return null;
    player.inventory.splice(idx, 1);

    return {
      coins: 2,
      x: errandChar.position.x,
      y: errandChar.position.y
    };
  }

  /** Wipe errand state on player death (new run starts clean). */
  resetOnDeath() {
    this.activeErrand = null;
    this.stage = 0;
  }

  // ── Internal ────────────────────────────────────────────────────────────────

  /**
   * Choose a random request from the current stage's pool.
   * For item stages, filters out chars already in the player's quick slots.
   * @param {Player} player
   * @param {string|null} excludeChar  Item/ingredient just handed over — don't repeat it.
   */
  _pickRequest(player, excludeChar = null) {
    const config = STAGE_CONFIG[this.stage];

    let available;
    if (config.isIngredient) {
      // Any ingredient from the pool is fair game; just avoid immediate repeat
      available = config.requestPool.filter(c => c !== excludeChar);
    } else {
      const equipped = (player?.quickSlots ?? []).filter(Boolean).map(s => s.char);
      available = config.requestPool.filter(
        c => !equipped.includes(c) && c !== excludeChar
      );
    }

    if (available.length === 0) {
      // Fallback: allow repeat if pool is exhausted by exclusions
      available = config.requestPool.filter(c => c !== excludeChar);
    }
    if (available.length === 0) available = config.requestPool;

    const requestedItem = available[Math.floor(Math.random() * available.length)];
    this.activeErrand = {
      requestedItem,
      rewardIndex: Math.floor(Math.random() * config.rewardPool.length),
      stage: this.stage
    };
  }
}
