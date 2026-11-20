/**
 * ZenithSystem — the Z room (green zone).
 *
 * A mountain summit (src/data/zenithSummit.js) with five Zenith Platforms up
 * its trail, one in each character's color, each tied to the summit cairn by a
 * line of pennants. Every rescued character who isn't being played stands on
 * their own platform while the player is in the room; the platform of the
 * character being played stays empty until the player steps onto it. When the
 * player stands on their own platform and the other four stand on theirs, a
 * mote climbs each pennant line to the cairn, the five meet in a burst of all
 * five colors, and every
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
import { BackgroundObject } from '../entities/BackgroundObject.js';
import {
  ZENITH_SUMMIT_MAP, ZENITH_SUMMIT_TILES, ZENITH_STATION_KEYS, ZENITH_CAIRN_GATHERED_COLOR
} from '../data/zenithSummit.js';

export const ZENITH_MAX_HP = 5;

// The climb's order, trailhead to summit: the Gold Hero first, then the zones' danger ramp.
export const ZENITH_ORDER = ['default', 'green', 'yellow', 'red', 'cyan'];

const PLATFORM_REACH = 1.5;       // cells from a platform's spot that still count as standing on it
const CONVERGE_DURATION = 1.4;    // seconds for the five motes to reach the center
const BURST_COUNT = 16;           // burst particles per color at the meeting
const HALO = 1;                   // cells round the massif the room's dressing must also keep off

// Characters still in the run: rescued, not dead, not lost to the mist.
export function livingCharacters(game) {
  return (game.unlockedCharacters ?? []).filter(
    type => !game.deadCharacters?.includes(type) && !game.lostCharacters?.includes(type)
  );
}

// The massif's cells plus a HALO-cell ring round them, so nothing the room grows hugs the cliffs.
function withHalo(cells) {
  const keys = new Set();
  const out = [];
  for (const { col, row } of cells) {
    for (let dr = -HALO; dr <= HALO; dr++) {
      for (let dc = -HALO; dc <= HALO; dc++) {
        const key = `${col + dc},${row + dr}`;
        if (keys.has(key)) continue;
        keys.add(key);
        out.push({ col: col + dc, row: row + dr });
      }
    }
  }
  return out;
}

// The cairn keeps the gathering's gold for the rest of the run.
function markCairn(zenith) {
  const cairn = zenith.cairnObject;
  if (!cairn) return;
  cairn.color = ZENITH_CAIRN_GATHERED_COLOR;
  cairn.animationColor = ZENITH_CAIRN_GATHERED_COLOR;
}

export class ZenithSystem {
  constructor(game) {
    this.game = game;
  }

  /**
   * Lay the summit (src/data/zenithSummit.js) into a freshly generated Z room:
   * cliffs, steps, trail, scree, frost and the cairn as structural background
   * objects, and the five Zenith Platforms where the map puts them.
   */
  generateZenithRoom(gen, room) {
    gen.generateBackgroundObjects(room);

    const CS = GRID.CELL_SIZE;
    const platforms = [];
    const massif = [];
    let cairn = null;
    let cairnObject = null;
    ZENITH_SUMMIT_MAP.forEach((line, row) => {
      [...line].forEach((key, col) => {
        if (key !== ' ') massif.push({ col, row });

        const tile = ZENITH_SUMMIT_TILES[key];
        if (tile) {
          const char = tile.altChar && (col + row) % 2 ? tile.altChar : tile.char;
          const obj = new BackgroundObject(char, col * CS, row * CS, { typeId: tile.typeId });
          obj.structural = true;
          room.backgroundObjects.push(obj);
          if (key === 'A') cairnObject = obj;
        }
        // Cliffs and the cairn are solid as objects, the way rocks and trees
        // are, and stay out of the collision map: a collision cell is painted
        // as a grey wall square, which would box every cliff glyph.
        if (key !== ' ' && room.collisionMap[row]) room.collisionMap[row][col] = false;
        if (key === 'A') cairn = { x: (col + 0.5) * CS, y: (row + 0.5) * CS };

        const characterType = ZENITH_STATION_KEYS[key];
        if (characterType) {
          platforms.push({
            characterType,
            color: CHARACTER_TYPES[characterType].color,
            col, row,
            cx: (col + 0.5) * CS,
            cy: (row + 0.5) * CS
          });
        }
      });
    });
    // Whatever the room grew on the mountain (grass, trees, rocks, water) goes:
    // the massif is only what the map lays there.
    protectRegion(room, { kind: 'cells', cells: withHalo(massif) });
    // Stations in the climb's order (ZENITH_ORDER), not map order.
    platforms.sort((a, b) => ZENITH_ORDER.indexOf(a.characterType) - ZENITH_ORDER.indexOf(b.characterType));

    room.zenith = {
      platforms,
      center: cairn,
      cairnObject,
      // 'waiting' → 'converging' (motes in flight) → 'gathered'.
      phase: this.game.zenithGathered ? 'gathered' : 'waiting',
      t: 0
    };
    if (room.zenith.phase === 'gathered') markCairn(room.zenith);
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
    return this.isOnPlatform(own);
  }

  /** True while the player stands on (or right beside) the platform's spot. */
  isOnPlatform(platform) {
    const player = this.game.player;
    const px = player.position.x + player.width / 2;
    const py = player.position.y + player.height / 2;
    const reach = PLATFORM_REACH * GRID.CELL_SIZE;
    return Math.abs(px - platform.cx) <= reach && Math.abs(py - platform.cy) <= reach;
  }

  _completeGathering(zenith) {
    const game = this.game;
    zenith.phase = 'gathered';
    game.zenithGathered = true;

    for (const platform of zenith.platforms) {
      createBurstParticles(game, game.particles, zenith.center.x, zenith.center.y, BURST_COUNT, platform.color);
    }
    markCairn(zenith);

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
