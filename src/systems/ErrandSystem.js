import { GRID } from '../game/GameConfig.js';
import { ErrandCharacter } from '../entities/ErrandCharacter.js';
import { Item } from '../entities/Item.js';
import { tagLootLayer } from './PlaneSystem.js';
import { Enemy } from '../entities/Enemy.js';
import { applyZoneCombatModifiers } from '../data/zones.js';

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
    // Metal, Teeth, Eye, Fire Essence, Silk, Ice, Slurry, Arrowhead, Axe head,
    // Cloth, Moss (Scale is epic — not a fair ask)
    requestPool: ['M', 't', 'e', 'F', 'k', 'i', '⚗', '△', '⊿', '▤', '❦'],
    rewardPool:  ['‡', 'ᛉ', '⟩', '⊤', 'X', '⛓', '𐤄', '𐤂'],
    isIngredient: true
  },
  {
    // Stage 1: starter weapon (or a plain bottled consumable) for a strong
    // mid-tier weapon or armor
    requestPool: ['¬', '†', ')', '/', '↑', '◐'],  // tier-1 starters, Bottle of Mud
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
 *   8. Attacking the traveler (feature-inbox, Errand-only special case — not
 *      general NeutralCharacter attackability) permanently flips it hostile
 *      for the rest of the run: see checkAttackHit()/_becomeHostile().
 *
 * The same traveler also stands on Settlement ground and in 'neutral_npc'
 * hut floors. Every site builds it through createTraveler(), and every
 * interaction (SPACE trade, Artifact side trade, popup, walk-away close,
 * attack) finds it in `interiorManager.activeNpcs()`, the player's current
 * layer. That keeps the hut, Settlement, and E room behaving the same.
 */
export class ErrandSystem {
  constructor() {
    this.activeErrand = null; // { requestedItem: char, rewardIndex: number, stage: number }
    this.stage = 0;           // 0 | 1 | 2
    this.menuOpen = false;    // Confirm popup gate — mirrors game.bridgeMenuOpen,
                               // but kept internal since ErrandSystem already
                               // owns activeErrand/stage itself rather than on `game`.
    this.hostile = false;     // Attacked the traveler — permanent for the run (resetOnDeath wipes it)
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
    const { x, y } = this._findSafeSpawnPosition(room);
    return this.createTraveler(x, y);
  }

  /**
   * The one way a traveler is built, wherever it stands: E room, Settlement
   * ground, or a hut floor. `seed` starts an errand when none is active
   * (Settlement and hut travelers can be met before any E room is cleared).
   * Built even after a betrayal: hostility is resolved when the player enters
   * the layer (replaceBetrayedTravelers, or the E room branch of
   * spawnRoomNeutralCharacters), so every site turns hostile the same way.
   * The request shown is only a starting value:
   * ErrandCharacter.update re-reads activeErrand every frame, because a
   * Settlement traveler is built at room generation and can outlive a trade
   * made somewhere else.
   */
  createTraveler(x, y, { seed = false, player = null } = {}) {
    if (!this.activeErrand && seed) this._pickRequest(player);
    if (!this.activeErrand) return null;
    return new ErrandCharacter(x, y, this.activeErrand.requestedItem, this.activeErrand.stage);
  }

  /**
   * The traveler in `npcs` (pass `game.interiorManager.activeNpcs()`, the
   * player's current layer) when the player is within `rangeScale` × its talk
   * range, else null. Every SPACE, popup, and attack check goes through this,
   * so a hut traveler and a surface traveler answer identically.
   */
  findTravelerInRange(player, npcs, rangeScale = 1) {
    const traveler = npcs?.find(nc => nc instanceof ErrandCharacter);
    if (!traveler || !player) return null;
    const dist = Math.hypot(
      player.position.x - traveler.position.x,
      player.position.y - traveler.position.y
    );
    return dist <= traveler.getInteractionDistance() * rangeScale ? traveler : null;
  }

  /**
   * Called when the player enters a layer that may hold a traveler built
   * before the betrayal (a cached hut floor, a pre-generated Settlement).
   * Once hostile, each such traveler is swapped for the hostile enemy where
   * it stood, matching what an E room spawns on re-entry.
   */
  replaceBetrayedTravelers(npcs, room, game) {
    if (!this.hostile || !npcs) return;
    for (let i = npcs.length - 1; i >= 0; i--) {
      if (!(npcs[i] instanceof ErrandCharacter)) continue;
      const { x, y } = npcs[i].position;
      npcs.splice(i, 1);
      this.spawnHostileEnemy(room, game, { x, y });
    }
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
   * Non-mutating eligibility check for tryOpenMenu(): does the player
   * currently hold (or carry, for the ingredient stage) the active errand's
   * requested item, within range? Shares _findCarriedRequest() with
   * checkGive(), so the two can't drift.
   */
  canGive(player, neutralCharacters, inventorySystem) {
    if (!this.activeErrand) return false;
    if (!this.findTravelerInRange(player, neutralCharacters)) return false;
    return !!this._findCarriedRequest(player, inventorySystem);
  }

  /**
   * Where the requested item sits on the player, as a `remove()` that hands
   * one over, or null when they don't carry it. Stage 0 spends from the
   * ingredient pile. Item stages search only what the player carries (quick
   * slots, worn armor, carried armor spares, equipped and spare
   * consumables), never the REST chest, since the traveler is met out in
   * the world. A stacked consumable gives up one unit, not the stack.
   */
  _findCarriedRequest(player, inv) {
    const requestedChar = this.activeErrand.requestedItem;

    if (STAGE_CONFIG[this.activeErrand.stage].isIngredient) {
      if (!inv?.hasIngredient(requestedChar)) return null;
      return { remove: () => inv.removeIngredient(requestedChar) };
    }

    const slotIdx = player.quickSlots?.findIndex(slot => slot?.char === requestedChar) ?? -1;
    if (slotIdx !== -1) {
      return {
        remove: () => {
          player.quickSlots[slotIdx] = null;
          if (slotIdx === player.activeSlotIndex) {
            const nextFilled = player.quickSlots.findIndex(
              (slot, idx) => idx !== player.activeSlotIndex && slot !== null
            );
            if (nextFilled !== -1) player.activeSlotIndex = nextFilled;
          }
          return true;
        }
      };
    }
    if (!inv) return null;

    if (inv.equippedArmor?.char === requestedChar) {
      // removeCarriedItem re-projects equipment, so the worn armor's defense
      // leaves with it (same path the Shopkeeper's Pawn sale uses).
      return { remove: () => inv.removeCarriedItem('equippedArmor', -1, player) };
    }
    const spareArmor = inv.armorInventory?.find(a => a.char === requestedChar);
    if (spareArmor) return { remove: () => inv.removeFromArmorInventory(spareArmor) };

    const takeOneFromStack = (item) => {
      if ((item.count || 1) <= 1) return false;
      item.count -= 1;
      return true;
    };
    // Spare consumables first, so handing one over doesn't strip the armed slot
    // while a spare is in the pack (same preference as itemCostDispatch).
    const spareConsumable = inv.consumableInventory?.find(c => c.char === requestedChar);
    if (spareConsumable) {
      return {
        remove: () => takeOneFromStack(spareConsumable) || inv.removeFromConsumableInventory(spareConsumable)
      };
    }
    const consumableSlot = inv.equippedConsumables?.findIndex(c => c?.char === requestedChar) ?? -1;
    if (consumableSlot !== -1) {
      const equipped = inv.equippedConsumables[consumableSlot];
      return {
        remove: () => takeOneFromStack(equipped) || inv.removeCarriedItem('equippedConsumable', consumableSlot, player)
      };
    }
    return null;
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
    const rewardItem = tagLootLayer(game, new Item(giveResult.rewardChar, giveResult.x, giveResult.y));
    game.items.push(rewardItem);
    game.physicsSystem.addEntity(rewardItem);
  }

  /** SHIFT, or walking out of range, while the confirm popup is open: cancel without trading. */
  closeMenu() {
    this.menuOpen = false;
  }

  /** True once the player has wandered far enough that the open confirm popup should auto-close. */
  isOutOfRange(player, neutralCharacters) {
    // 1.5x slack matches RidgeSystem's own walk-away tolerance.
    return !this.findTravelerInRange(player, neutralCharacters, 1.5);
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

    const errandChar = this.findTravelerInRange(player, neutralCharacters);
    if (!errandChar) return null;

    const stageConfig = STAGE_CONFIG[this.activeErrand.stage];
    const carried = this._findCarriedRequest(player, inventorySystem);
    if (!carried?.remove()) return null;
    const givenChar = this.activeErrand.requestedItem;

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
   * Side-trade: hand the traveler an Artifact ⚜ for 3 coins, independent of
   * the active stage errand. Returns spawn data ({coins, x, y}) on success.
   * Active errand is untouched — the player can still complete the stage trade.
   */
  tryGiveArtifact(player, neutralCharacters, inventorySystem) {
    const errandChar = this.findTravelerInRange(player, neutralCharacters);
    if (!errandChar) return null;

    if (!inventorySystem?.removeIngredient('⚜')) return null;

    return {
      coins: 3,
      x: errandChar.position.x,
      y: errandChar.position.y
    };
  }

  /** Wipe errand state on player death (new run starts clean). */
  resetOnDeath() {
    this.activeErrand = null;
    this.stage = 0;
    this.menuOpen = false;
    this.hostile = false;
  }

  // ── Hostility (feature-inbox) ───────────────────────────────────────────────
  // Attacking the traveler is an Errand-only special case (not general
  // NeutralCharacter attackability — a ratified design call, see
  // AskUserQuestion history). A landed hit converts it into a hostile 'E'
  // enemy, permanently for the rest of the run (resetOnDeath wipes it).

  /**
   * Called once per player melee swing from CombatSystem, right alongside
   * its own enemy-hit loop. No-ops once already hostile (nothing left to
   * hit) or when there's no live traveler in range.
   * @param {Object} attack - the player's active melee attack hitbox
   * @param {CombatSystem} combatSystem - for checkMeleeCollision/createDamageNumber
   * @param {Game} game
   * @param {Object} room - current room, passed through from CombatSystem.update
   */
  checkAttackHit(attack, combatSystem, game, room) {
    if (this.hostile || attack.hasHit) return;
    // The player's current layer (hut floor or surface), same list SPACE reads.
    const npcs = game.interiorManager.activeNpcs();
    const errandChar = npcs.find(nc => nc instanceof ErrandCharacter);
    if (!errandChar) return;
    if (!combatSystem.checkMeleeCollision(attack, errandChar)) return;
    this._becomeHostile(errandChar, npcs, combatSystem, game, room);
  }

  /** Removes the traveler from its layer's list and spawns the hostile enemy in its place. */
  _becomeHostile(errandChar, npcs, combatSystem, game, room) {
    this.hostile = true;
    const idx = npcs.indexOf(errandChar);
    if (idx !== -1) npcs.splice(idx, 1);
    combatSystem.createDamageNumber('BETRAYED', errandChar.position.x, errandChar.position.y, '#ff4444');
    if (room) this.spawnHostileEnemy(room, game, errandChar.position);
  }

  /**
   * Spawns the hostile 'E' enemy, fully wired for live play — mirrors
   * RoundCombatSystem._spawnHag's runtime registration (physics, target,
   * room). `uncounted` keeps it out of the room's clear-gate, same as Hag:
   * a permanent hazard shouldn't lock exits behind killing it.
   * Reused by the live conversion above, by spawnRoomNeutralCharacters on any
   * later re-entry into an E room, and by replaceBetrayedTravelers.
   * `room` may be a hut floor: those keep a single `enemies` list (no
   * per-plane lists) and no zone of their own, so the zone comes from the
   * surface room the hut stands in.
   */
  spawnHostileEnemy(room, game, pos = null) {
    const depth = game?.getCurrentZoneDepth?.() ?? 1;
    const spawnPos = pos || this._findSafeSpawnPosition(room);
    const enemy = new Enemy('E', spawnPos.x, spawnPos.y, depth);
    enemy.setCollisionMap(room.collisionMap);
    enemy.setBackgroundObjects(room.backgroundObjects);
    enemy.setSteamClouds?.(game.steamClouds);
    enemy.setTarget?.(game.player);
    enemy.setGame?.(game);
    enemy.setRoom?.(room);
    applyZoneCombatModifiers(enemy, room.zone ?? game.currentRoom?.zone);
    enemy.uncounted = true;
    const planeList = enemy.plane === 1 ? room.enemiesPlane1 : room.enemiesPlane0;
    planeList?.push(enemy);
    room.enemies.push(enemy);
    game.physicsSystem.addEntity(enemy);
    return enemy;
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
