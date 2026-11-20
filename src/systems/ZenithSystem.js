/**
 * ZenithSystem — the Z room (green zone).
 *
 * Five Zenith Platforms in a ring, one in each character's color. Every
 * rescued character who isn't being played stands on their own platform while
 * the player is in the room; the platform of the character being played stays
 * empty until the player steps onto it. When the player stands on their own
 * platform and the other four stand on theirs, a mote leaves each platform for
 * the ring's center, the five meet in a burst of all five colors, and every
 * character gains ZENITH_MAX_HP max HP for the rest of the run (the Zenith
 * Gathering). After that the Z letter is retired for the run
 * (ExitSystem.isLetterRetired).
 *
 * Room state lives on `room.zenith` (Room-scoped); the run-scoped record is
 * `game.zenithGathered` (Reset Registry). The +max HP goes on each of the five
 * characters' loadouts (`zenithMaxHp`), applied every frame by
 * EquipmentEffectsSystem through `player.zenithMaxHpBonus`.
 */

import { GRID, ROOM_TYPES } from '../game/GameConfig.js';
import { CHARACTER_TYPES } from '../data/characters.js';
import { protectRegion } from './roomFeatures.js';
import { createBurstParticles } from './WorldEffectsSystem.js';
import { createCharacterLoadout } from './characterLoadout.js';

export const ZENITH_MAX_HP = 5;

// Ring order, clockwise from the top: the Gold Hero, then the zones' danger ramp.
export const ZENITH_ORDER = ['default', 'green', 'yellow', 'red', 'cyan'];

const RING_CENTER = { col: 15, row: 15 };
const RING_RADIUS = 7;            // cells from the ring center to a platform center
const PLATFORM_HALF = 1;          // platforms are (2 * PLATFORM_HALF + 1) cells square
const CONVERGE_DURATION = 1.4;    // seconds for the five motes to reach the center
const BURST_COUNT = 10;           // burst particles per color at the meeting

// Characters still in the run: rescued, not dead, not lost to the mist.
export function livingCharacters(game) {
  return (game.unlockedCharacters ?? []).filter(
    type => !game.deadCharacters?.includes(type) && !game.lostCharacters?.includes(type)
  );
}

export class ZenithSystem {
  constructor(game) {
    this.game = game;
  }

  /** Lay the ring of platforms into a freshly generated Z room. */
  generateZenithRoom(gen, room) {
    gen.generateBackgroundObjects(room);

    const CS = GRID.CELL_SIZE;
    const platforms = [];
    const cleared = [];
    ZENITH_ORDER.forEach((characterType, i) => {
      const angle = -Math.PI / 2 + (i * 2 * Math.PI) / ZENITH_ORDER.length;
      const col = Math.round(RING_CENTER.col + Math.cos(angle) * RING_RADIUS);
      const row = Math.round(RING_CENTER.row + Math.sin(angle) * RING_RADIUS);
      for (let dr = -PLATFORM_HALF; dr <= PLATFORM_HALF; dr++) {
        for (let dc = -PLATFORM_HALF; dc <= PLATFORM_HALF; dc++) {
          cleared.push({ col: col + dc, row: row + dr });
        }
      }
      platforms.push({
        characterType,
        color: CHARACTER_TYPES[characterType].color,
        col, row,
        // Pixel bounds of the whole platform, and its center.
        x: (col - PLATFORM_HALF) * CS,
        y: (row - PLATFORM_HALF) * CS,
        size: (2 * PLATFORM_HALF + 1) * CS,
        cx: (col + 0.5) * CS,
        cy: (row + 0.5) * CS
      });
    });

    // Keep the platforms and the ring's center open and free of dressing.
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) cleared.push({ col: RING_CENTER.col + dc, row: RING_CENTER.row + dr });
    }
    for (const { col, row } of cleared) {
      if (room.collisionMap[row]?.[col] !== undefined) room.collisionMap[row][col] = false;
    }
    protectRegion(room, { kind: 'cells', cells: cleared });

    room.zenith = {
      platforms,
      center: { x: (RING_CENTER.col + 0.5) * CS, y: (RING_CENTER.row + 0.5) * CS },
      // 'waiting' → 'converging' (motes in flight) → 'gathered'.
      phase: this.game.zenithGathered ? 'gathered' : 'waiting',
      t: 0
    };
  }

  /** The rescued characters standing on their platforms: every living one but the player's. */
  standingCharacters(game = this.game) {
    return livingCharacters(game).filter(type => type !== game.activeCharacterType);
  }

  update(dt) {
    const game = this.game;
    const room = game.currentRoom;
    const zenith = room?.zenith;
    if (!zenith || room.type !== ROOM_TYPES.ZENITH || !game.player) return;

    if (zenith.phase === 'waiting') {
      if (this._allGatheredOnPlatforms(zenith)) {
        zenith.phase = 'converging';
        zenith.t = 0;
        game.audioSystem?.playSFX('zenith_gather');
      }
    } else if (zenith.phase === 'converging') {
      zenith.t += dt;
      if (zenith.t >= CONVERGE_DURATION) this._completeGathering(zenith);
    }
  }

  // True once all five characters are living, and the player stands on their own platform.
  _allGatheredOnPlatforms(zenith) {
    const game = this.game;
    if (game.zenithGathered) return false;
    const living = livingCharacters(game);
    if (!ZENITH_ORDER.every(type => living.includes(type))) return false;
    const own = zenith.platforms.find(p => p.characterType === game.activeCharacterType);
    if (!own) return false;
    const player = game.player;
    const px = player.position.x + player.width / 2;
    const py = player.position.y + player.height / 2;
    return px >= own.x && px < own.x + own.size && py >= own.y && py < own.y + own.size;
  }

  _completeGathering(zenith) {
    const game = this.game;
    zenith.phase = 'gathered';
    game.zenithGathered = true;

    for (const platform of zenith.platforms) {
      createBurstParticles(game, game.particles, zenith.center.x, zenith.center.y, BURST_COUNT, platform.color);
    }
    game.screenFlash = { startTime: performance.now(), duration: 600, color: '#ffffff' };

    // Every character's loadout takes the bonus (created now if that character
    // hasn't been played yet this run: the same loadout activation would make).
    const inv = game.inventorySystem;
    for (const type of ZENITH_ORDER) {
      if (!inv.characterInventories[type]) inv.characterInventories[type] = createCharacterLoadout(type);
      inv.characterInventories[type].zenithMaxHp = ZENITH_MAX_HP;
    }

    // Applied to the active player at once too (EquipmentEffectsSystem keeps it
    // every frame after), with the same amount of current HP, so the gift is
    // felt on the spot.
    const player = game.player;
    player.maxHp += ZENITH_MAX_HP;
    player.zenithMaxHpBonus += ZENITH_MAX_HP;
    player.hp += ZENITH_MAX_HP;
  }

  /** Converging progress 0..1, or null when no motes are in flight. */
  convergeProgress(zenith) {
    if (zenith?.phase !== 'converging') return null;
    return Math.min(1, zenith.t / CONVERGE_DURATION);
  }
}
