import { GRID } from '../game/GameConfig.js';
import { ErrandCharacter } from '../entities/ErrandCharacter.js';
import { Item } from '../entities/Item.js';

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
 *   2. Room cleared → onRoomClear(player, room): starts first errand, returns ErrandCharacter.
 *   3. Player re-enters any E room with active errand → main.js calls
 *      spawnErrandCharacter(room) after clearing enemies from the room.
 *   4. Player without the requested item, close enough to talk → SPACE opens
 *      ErrandCharacter's dialogue (flavor text naming the request).
 *   5. Player holding the requested item (or ingredient), close, presses SPACE →
 *      tryOpenMenu() opens a bare confirm popup instead of trading immediately
 *      (simplified version of RidgeSystem's bridge-donation confirm). SPACE
 *      again (menu open) → confirmGive(): removes item, returns reward data.
 *      SHIFT, or walking out of range, → closeMenu(): cancels, no trade.
 *   6. Stage advances (capped at 2); ErrandCharacter requests the next item.
 *   7. Death → resetOnDeath(): wipes state for a clean new run.
 */
export class ErrandSystem {
  constructor() {
    this.activeErrand = null; // { requestedItem: char, rewardIndex: number, stage: number }
    this.stage = 0;           // 0 | 1 | 2
    this.menuOpen = false;    // Confirm popup gate — mirrors game.bridgeMenuOpen,
                               // but kept internal since ErrandSystem already
                               // owns activeErrand/stage itself rather than on `game`.
  }

  // ── Hooks called by main.js ─────────────────────────────────────────────────

  /**
   * Called when an E room is cleared for the first time (no active errand).
   * Initialises the errand and returns the ErrandCharacter to spawn, or null.
   * @param {Player} player
   * @returns {ErrandCharacter|null}
   */
  onRoomClear(player, room) {
    if (this.activeErrand) return null; // Already have an active quest

    this._pickRequest(player);
    if (!this.activeErrand) return null;

    return this.spawnErrandCharacter(room);
  }

  /**
   * Spawn a new ErrandCharacter at (or near) room centre using the current
   * request. (Used both by onRoomClear and by main.js on re-entering an E
   * room.)
   * @param {object} [room] Current room — used to steer the spawn off
   *   liquid/collision tiles (e.g. lava landing on room centre in RED zone).
   *   Falls back to the raw centre point when omitted.
   * @returns {ErrandCharacter|null}
   */
  spawnErrandCharacter(room) {
    if (!this.activeErrand) return null;

    const { x, y } = this._findSafeSpawnPosition(room);
    return new ErrandCharacter(x, y, this.activeErrand.requestedItem, this.activeErrand.stage);
  }

  /**
   * Room centre, nudged off collision/liquid tiles. Mirrors RoomGenerator's
   * getRandomPosition() liquid rejection (water/lava/mud all render as '~';
   * '=' is static water) rather than a fresh check, since a caldera/molten-
   * ascent room can land lava directly on room centre and the traveler has
   * no water/lava immunity of its own.
   */
  _findSafeSpawnPosition(room) {
    const C = GRID.CELL_SIZE;
    const centerCol = Math.floor(GRID.COLS / 2);
    const centerRow = Math.floor(GRID.ROWS / 2);
    const collisionMap = room?.collisionMap;
    const backgroundObjects = room?.backgroundObjects || [];
    const LIQUID_CHARS = new Set(['~', '=']);

    const isBlocked = (col, row) => {
      if (collisionMap?.[row]?.[col]) return true;
      return backgroundObjects.some(obj =>
        LIQUID_CHARS.has(obj.char) &&
        Math.round(obj.position.x / C) === col &&
        Math.round(obj.position.y / C) === row
      );
    };

    if (!isBlocked(centerCol, centerRow)) {
      return { x: centerCol * C, y: centerRow * C };
    }

    // Spiral outward ring-by-ring for the nearest clear tile.
    const maxRadius = Math.max(GRID.COLS, GRID.ROWS);
    for (let radius = 1; radius <= maxRadius; radius++) {
      for (let dr = -radius; dr <= radius; dr++) {
        for (let dc = -radius; dc <= radius; dc++) {
          if (Math.max(Math.abs(dr), Math.abs(dc)) !== radius) continue; // ring only
          const col = centerCol + dc;
          const row = centerRow + dr;
          if (col < 1 || row < 1 || col >= GRID.COLS - 1 || row >= GRID.ROWS - 1) continue;
          if (!isBlocked(col, row)) return { x: col * C, y: row * C };
        }
      }
    }

    // Unreachable in practice (rooms always have open floor) — fall back to centre.
    return { x: centerCol * C, y: centerRow * C };
  }

  // ── Confirm-menu gate ───────────────────────────────────────────────────────
  // A simplified version of RidgeSystem's bridge-donation confirm: SPACE opens
  // a bare popup instead of trading immediately, a second SPACE confirms.
  // Unlike Ridge's multi-material checklist, this is a single yes/no gate, so
  // there's no on-screen cursor to move — SPACE always means "give", SHIFT (or
  // walking away) always means "cancel". See ExploreRenderer._renderErrandConfirmPanel
  // for the non-instructive-compliant rendering (glyph + bare labels, no key hints).

  isMenuOpen() {
    return this.menuOpen;
  }

  /**
   * Non-mutating eligibility check shared by tryOpenMenu() and main.js's
   * walk-away auto-close — does the player currently hold (or carry, for the
   * ingredient stage) the active errand's requested item, within range?
   * Mirrors checkGive()'s own lookup but doesn't consume anything; keep the
   * two in sync if the request/give rules change.
   */
  canGive(player, neutralCharacters, inventorySystem) {
    if (!this.activeErrand) return false;
    const errandChar = neutralCharacters?.find(nc => nc instanceof ErrandCharacter);
    if (!errandChar) return false;

    const dist = Math.hypot(
      player.position.x - errandChar.position.x,
      player.position.y - errandChar.position.y
    );
    if (dist > errandChar.getInteractionDistance()) return false;

    const stageConfig = STAGE_CONFIG[this.activeErrand.stage];
    const requestedChar = this.activeErrand.requestedItem;

    if (stageConfig.isIngredient) {
      return !!inventorySystem?.hasIngredient(requestedChar);
    }
    if (player.quickSlots?.some(slot => slot?.char === requestedChar)) return true;
    if (inventorySystem?.equippedArmor?.char === requestedChar) return true;
    if (inventorySystem?.armorInventory?.some(a => a.char === requestedChar)) return true;
    return false;
  }

  /**
   * SPACE near the traveler while eligible: opens the confirm popup instead of
   * trading immediately. Returns whether the press was consumed (menu opened)
   * — false leaves the press to fall through to dialogue (nothing to give yet).
   */
  tryOpenMenu(player, neutralCharacters, inventorySystem) {
    if (this.menuOpen) return false; // already open — caller routes SPACE to confirmGive() instead
    if (!this.canGive(player, neutralCharacters, inventorySystem)) return false;
    this.menuOpen = true;
    return true;
  }

  /** SPACE while the confirm popup is open: perform the trade and close either way. */
  confirmGive(player, neutralCharacters, inventorySystem) {
    this.menuOpen = false;
    return this.checkGive(player, neutralCharacters, inventorySystem);
  }

  /**
   * main.js SPACE-handler entry point for the confirm popup. Owns SPACE
   * outright while the popup is open — checked before the wise-fellow/
   * artifact flows in main.js so a stray press can't slip past it. Returns
   * false (unconsumed) when the popup isn't open, letting the press fall
   * through to those checks.
   */
  handleConfirmMenuSpacePress(game, npcArray) {
    if (!this.menuOpen) return false;
    const giveResult = this.confirmGive(game.player, npcArray, game.inventorySystem);
    if (giveResult) this._spawnReward(game, giveResult);
    return true;
  }

  /**
   * main.js SPACE-handler entry point for the Artifact ⚜ → coins side trade.
   * Returns whether the press was consumed.
   */
  handleArtifactGiveSpacePress(game, npcArray) {
    const artifactResult = this.tryGiveArtifact(game.player, npcArray, game.inventorySystem);
    if (!artifactResult) return false;
    for (let i = 0; i < artifactResult.coins; i++) {
      const angle = (i / artifactResult.coins) * Math.PI * 2 + Math.random() * 0.4;
      game.lootSystem.spawnIngredientDrop('c', artifactResult.x, artifactResult.y, angle, null);
    }
    return true;
  }

  /** Spawns the reward Item from a checkGive() result — shared glue for handleConfirmMenuSpacePress(). */
  _spawnReward(game, giveResult) {
    const rewardItem = new Item(giveResult.rewardChar, giveResult.x, giveResult.y);
    if (game.activeFloor) rewardItem.hutPlane = true;
    game.items.push(rewardItem);
    game.physicsSystem.addEntity(rewardItem);
  }

  /** SHIFT, or walking out of range, while the confirm popup is open: cancel without trading. */
  closeMenu() {
    this.menuOpen = false;
  }

  /** True once the player has wandered far enough that the open confirm popup should auto-close. */
  isOutOfRange(player, neutralCharacters) {
    const errandChar = neutralCharacters?.find(nc => nc instanceof ErrandCharacter);
    if (!errandChar || !player) return true;
    const dist = Math.hypot(
      player.position.x - errandChar.position.x,
      player.position.y - errandChar.position.y
    );
    return dist > errandChar.getInteractionDistance() * 1.5; // matches RidgeSystem's own 1.5x slack
  }

  /**
   * Executes the trade: removes the requested item, advances the stage, and
   * returns the reward spawn data. Called only from confirmGive() — the
   * confirm popup is what SPACE opens first; this is the actual exchange.
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
      // Stage 0: spend the ingredient out of the one pile. Where the player
      // picked it up — this run or an earlier one — never mattered to the
      // errand, and now there is nowhere else it could be.
      if (!inventorySystem?.removeIngredient(requestedChar)) return null;
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
  tryGiveArtifact(player, neutralCharacters, inventorySystem) {
    const errandChar = neutralCharacters?.find(nc => nc instanceof ErrandCharacter);
    if (!errandChar) return null;

    const dist = Math.hypot(
      player.position.x - errandChar.position.x,
      player.position.y - errandChar.position.y
    );
    if (dist > errandChar.getInteractionDistance()) return null;

    if (!inventorySystem?.removeIngredient('⚜')) return null;

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
    this.menuOpen = false;
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
