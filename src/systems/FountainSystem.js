/**
 * FountainSystem — handles the F-room fountain rituals.
 *
 * On entry, the room is seeded with a small flock of ambient fairies that
 * drift around on slow sine paths. The flock is the visual and mechanical
 * substrate for every fountain interaction:
 *
 *   Throw weapon into pool   → nearest ambient fairy detaches, carries the
 *                              weapon to the pool, and either delivers an
 *                              upgraded weapon (accept) or hands the same one
 *                              right back (refuse).
 *   Fishing rod on the pad   → defers to FishingSystem with FOUNTAIN_CATCHES.
 *   Elemental damage to water → every fairy currently in the room transitions
 *                              to 'angered' from its current position and the
 *                              flock herds the player toward the nearest exit.
 *
 * Fairy spawning from cut fairy-grass and fairy-touch outcomes still live in
 * InteractionSystem because those fire outside fountain rooms.
 */

import { GRID, ROOM_TYPES } from '../game/GameConfig.js';
import { WEAPON_TIERS } from '../data/items.js';
import { Fairy } from '../entities/Fairy.js';

const AMBIENT_FAIRY_COUNT = 6;

export class FountainSystem {
  constructor(game) {
    this.game = game;
  }

  // ── Per-frame ─────────────────────────────────────────────────────────────

  update(dt) {
    const game = this.game;
    const room = game.currentRoom;
    if (!room || room.type !== ROOM_TYPES.FOUNTAIN || !room.fountain) return;

    // Seed the ambient flock once per visit (whenever the entity list is empty
    // and the fountain has not been corrupted this run).
    if (!room.fountain.corrupted && !game.fairiesAngered) {
      this._ensureAmbientFairies(room);
    }

    // Corruption detection: scan flagged water tiles for elemental status.
    // First non-normal state we find triggers a one-shot corruption.
    if (!room.fountain.corrupted) {
      const bgs = game.backgroundObjects || [];
      for (const obj of bgs) {
        if (!obj.fountainWater) continue;
        if (obj.destroyed) continue;
        let element = null;
        if (obj.onFire) element = 'burn';
        else if (obj.waterState === 'electrified') element = 'shock';
        else if (obj.waterState === 'poisoned') element = 'poison';
        else if (obj.waterState === 'frozen') element = 'freeze';
        if (element) {
          this.corruptFountain(element);
          break;
        }
      }
    }
  }

  // ── Ambient flock ─────────────────────────────────────────────────────────

  _ensureAmbientFairies(room) {
    const game = this.game;
    if (!game.neutralCharacters) game.neutralCharacters = [];

    const existing = game.neutralCharacters.filter(c =>
      c instanceof Fairy && !c.consumed
    ).length;
    if (existing > 0) return;

    for (let i = 0; i < AMBIENT_FAIRY_COUNT; i++) {
      const spawn = this._pickAmbientSpawn(room);
      const fairy = new Fairy(spawn.x, spawn.y, room.exits || {}, {
        state: 'ambient',
        touchImmunity: 0,           // ambient fairies don't trigger heal touch
      });
      fairy.fountainAmbient = true;
      game.neutralCharacters.push(fairy);
    }
  }

  _pickAmbientSpawn(room) {
    const C = GRID.CELL_SIZE;
    const f = room.fountain;
    const padding = 3;
    const minX = padding * C;
    const maxX = (GRID.COLS - padding) * C;
    const minY = padding * C;
    const maxY = (GRID.ROWS - padding) * C;
    const exclusionR = ((f?.poolRadius || 4) + 2) * C;
    for (let i = 0; i < 12; i++) {
      const x = minX + Math.random() * (maxX - minX);
      const y = minY + Math.random() * (maxY - minY);
      if (f) {
        const dx = x - f.centerX;
        const dy = y - f.centerY;
        if (dx * dx + dy * dy < exclusionR * exclusionR) continue;
      }
      return { x, y };
    }
    return { x: minX, y: minY };
  }

  // ── Weapon landing handler ────────────────────────────────────────────────

  // Called from TrapSystem._landThrownWeapon when a weapon hits the ground.
  // Returns true if the throw was aimed at the pool and an ambient fairy
  // accepted the carry job (so the caller must NOT place the weapon as a
  // floor item). Returns false otherwise.
  checkWeaponLanding(t) {
    const game = this.game;
    const room = game.currentRoom;

    if (!room || room.type !== ROOM_TYPES.FOUNTAIN) return false;
    if (!room.fountain || room.fountain.corrupted) return false;
    if (room.fountain.upgradeUsed) return false;
    if (room.fountain.activeRitual) return false;

    const C = GRID.CELL_SIZE;
    const f = room.fountain;
    const targetCol = Math.floor(t.targetX / C);
    const targetRow = Math.floor(t.targetY / C);
    if (Math.abs(targetRow - f.centerRow) > f.poolRadius) return false;
    if (Math.abs(targetCol - f.centerCol) > f.poolRadius) return false;

    const item = t.weaponItem;
    if (!item?.data || item.data.type !== 'WEAPON') return false;

    const heldChar = item.data.char;
    const next = this._findNextTierChar(heldChar);

    const fairy = this._pickCarrierFairy(t.x, t.y);
    if (!fairy) return false; // no available fairy — let the weapon land normally

    // Accept locks the room to one upgrade per visit; refuse does not.
    if (next) room.fountain.upgradeUsed = true;
    room.fountain.activeRitual = true;

    fairy.startCarry({
      landingX: t.x,
      landingY: t.y,
      weaponChar: heldChar,
      item,
      kind: next ? 'accept' : 'refuse',
      nextChar: next,
      poolX: f.centerX,
      poolY: f.centerY,
    });

    game.audioSystem?.playSFX?.('coin_plink');
    game.menuSystem?.updateUI?.();
    return true;
  }

  _pickCarrierFairy(x, y) {
    const game = this.game;
    let best = null;
    let bestDist = Infinity;
    for (const c of game.neutralCharacters || []) {
      if (!(c instanceof Fairy)) continue;
      if (c.consumed) continue;
      if (c.state !== 'ambient') continue;
      const dx = c.position.x - x;
      const dy = c.position.y - y;
      const d = dx * dx + dy * dy;
      if (d < bestDist) { bestDist = d; best = c; }
    }
    return best;
  }

  // ── Corruption ────────────────────────────────────────────────────────────

  // Called when an elemental effect touches fountain water. The current flock
  // turns hostile in-place — no new fairies are spawned, no entities vanish.
  corruptFountain(element = 'burn') {
    const game = this.game;
    const player = game.player;
    const room = game.currentRoom;
    if (!player || !room || room.type !== ROOM_TYPES.FOUNTAIN) return;
    if (room.fountain?.corrupted) return;
    if (room.fountain) room.fountain.corrupted = true;
    game.fairiesAngered = true;

    const exitDir = this._nearestExitDirFromPoint(
      player.position.x, player.position.y, room.exits
    );

    const fairies = (game.neutralCharacters || []).filter(c =>
      c instanceof Fairy && !c.consumed
    );
    const count = fairies.length;
    fairies.forEach((fairy, i) => {
      // If the fairy was mid-carry, drop the weapon at its feet so it isn't lost.
      if (fairy.carriedItem) {
        const item = fairy.carriedItem;
        item.position.x = fairy.position.x - GRID.CELL_SIZE / 2;
        item.position.y = fairy.position.y - GRID.CELL_SIZE / 2;
        item.velocity = { vx: 0, vy: 0 };
        item.pickupReadyAt = performance.now() + 400;
        if (!game.items) game.items = [];
        game.items.push(item);
        game.physicsSystem?.addEntity?.(item);
        fairy.carriedItem = null;
      }
      fairy.clearIndicator?.();
      fairy.state = 'angered';
      fairy.color = '#ff6688';
      fairy.targetExitDir = exitDir;
      fairy.angerIndex = i;
      fairy.angerCount = count;
      fairy.anchor = { x: fairy.position.x, y: fairy.position.y };
      fairy.speed = 90;
      fairy.carryPhase = null;
      fairy.carryTarget = null;
    });

    game.audioSystem?.playSFX?.('boss_defeat');
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  // Walks WEAPON_TIERS to find the family that contains `char` and returns a
  // random char from the next tier. Null if at top tier or not in any family.
  _findNextTierChar(char) {
    for (const family of Object.keys(WEAPON_TIERS)) {
      const tiers = WEAPON_TIERS[family];
      for (let t = 0; t < tiers.length; t++) {
        if (tiers[t].includes(char)) {
          const nextTier = tiers[t + 1];
          if (!nextTier || nextTier.length === 0) return null;
          return nextTier[Math.floor(Math.random() * nextTier.length)];
        }
      }
    }
    return null;
  }

  _nearestExitDirFromPoint(x, y, exits) {
    if (!exits) return null;
    const candidates = ['north', 'east', 'west'].filter(dir => {
      const ex = exits[dir];
      return ex && (typeof ex === 'object' ? ex.letter : true);
    });
    if (candidates.length === 0) return null;
    let best = null;
    let bestDist = Infinity;
    for (const dir of candidates) {
      const p = this._exitPixelCenter(dir);
      const dx = p.x - x;
      const dy = p.y - y;
      const d = dx * dx + dy * dy;
      if (d < bestDist) { bestDist = d; best = dir; }
    }
    return best;
  }

  _exitPixelCenter(direction) {
    const centerCol = Math.floor(GRID.COLS / 2);
    const centerRow = Math.floor(GRID.ROWS / 2);
    switch (direction) {
      case 'north': return { x: centerCol * GRID.CELL_SIZE, y: 1 * GRID.CELL_SIZE };
      case 'east':  return { x: (GRID.COLS - 2) * GRID.CELL_SIZE, y: centerRow * GRID.CELL_SIZE };
      case 'west':  return { x: 1 * GRID.CELL_SIZE, y: centerRow * GRID.CELL_SIZE };
      default:      return { x: 0, y: 0 };
    }
  }
}
