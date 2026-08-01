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
 *   Offer a treasure         → SPACE at the pool opens TreasureOfferingSystem's
 *                              menu; the chosen gem is carried in and either
 *                              pays out a permanent blessing or attunes the
 *                              water to an element. Once per visit, and
 *                              independent of the weapon upgrade.
 *   Empty Bottle at the pool → fills with fountain water, flavoured by the
 *                              current attunement. Free and repeatable.
 *   Fishing rod on the pad   → defers to FishingSystem with FOUNTAIN_CATCHES.
 *   Elemental damage to water → every fairy currently in the room transitions
 *                              to 'angered' from its current position and the
 *                              flock herds the player toward the nearest exit.
 *
 * Attunement is the room's gate on elemental power. `_findNextTierChar` refuses
 * to hand back an elemental weapon unless the pool has been attuned to that
 * element first, so the whole elemental tier of a weapon family costs a gem on
 * top of the weapon — see docs/adr/BACKLOG.md for the standing ADR candidate.
 *
 * Fairy spawning from cut fairy-grass and fairy-touch outcomes still live in
 * InteractionSystem because those fire outside fountain rooms.
 */

import { GRID, ROOM_TYPES } from '../game/GameConfig.js';
import { WEAPON_TIERS, TREASURE_OFFERINGS, weaponElement, getItemData } from '../data/items.js';
import { Fairy } from '../entities/Fairy.js';

const AMBIENT_FAIRY_COUNT = 6;

// How far past the pool edge still counts as standing at the fountain, in cells.
const POOL_REACH_CELLS = 1.5;

// Water colour per attunement. Written to BackgroundObject.fountainTint, never
// to waterState — waterState is the corruption signal (see update() below).
// Exported so the offering popup can show the pool in its true current colour.
export const ATTUNEMENT_COLORS = {
  fire:     '#ff5533',
  ice:      '#cceeff',
  electric: '#ffee44',
  poison:   '#66dd44',
};

// Which bottle the pool fills, keyed by attunement ('none' when unattuned).
// Electric reuses the existing Bottle of Electrified Water rather than minting
// a near-duplicate item.
const FOUNTAIN_BOTTLES = {
  none:     '🜈',
  fire:     '🜍',
  ice:      '🜗',
  electric: 'ε',
  poison:   '🜩',
};

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

  // ── Treasure offering ─────────────────────────────────────────────────────

  // Is the fountain willing to accept a treasure right now? TreasureOfferingSystem
  // asks before opening its menu, so a spent (or angry) fountain lets SPACE fall
  // through to the rest of the input chain.
  canOffer() {
    const game = this.game;
    const room = game.currentRoom;
    if (!room || room.type !== ROOM_TYPES.FOUNTAIN) return false;
    const f = room.fountain;
    if (!f || f.corrupted || f.offeringUsed || f.activeRitual) return false;
    return !game.fairiesAngered;
  }

  // Is the player standing close enough to the pool to interact with it?
  isPlayerAtPool() {
    const game = this.game;
    const f = game.currentRoom?.fountain;
    const player = game.player;
    if (!f || !player) return false;
    const C = GRID.CELL_SIZE;
    const px = player.position.x + C / 2;
    const py = player.position.y + C / 2;
    const reach = (f.poolRadius + POOL_REACH_CELLS) * C;
    const dx = px - f.centerX;
    const dy = py - f.centerY;
    return dx * dx + dy * dy <= reach * reach;
  }

  // Hand a treasure to the flock. A fairy lifts it from the player, drops it in
  // the pool, and the outcome resolves on arrival. Returns false (leaving the
  // offering unspent) if no fairy is free to carry it.
  startOffering(char) {
    const game = this.game;
    const player = game.player;
    const f = game.currentRoom?.fountain;
    if (!this.canOffer() || !player || !TREASURE_OFFERINGS[char]) return false;

    const fairy = this._pickCarrierFairy(player.position.x, player.position.y);
    if (!fairy) return false;

    f.offeringUsed = true;
    f.activeRitual = true;
    fairy.startCarry({
      landingX: player.position.x,
      landingY: player.position.y,
      weaponChar: char,
      item: null,
      kind: 'offering',
      poolX: f.centerX,
      poolY: f.centerY,
      onComplete: () => this._resolveOffering(char),
    });

    game.audioSystem?.playSFX?.('coin_plink');
    return true;
  }

  _resolveOffering(char) {
    const spec = TREASURE_OFFERINGS[char];
    if (!spec) return;
    const message = spec.element
      ? this._attune(spec.element)
      : this._applyBlessing(spec.blessing);
    this.game.audioSystem?.playSFX?.('fairy_transform');
    // Three of the four blessings are invisible the moment they land — luck has
    // no readout at all, and the pool looks the same afterwards. The narrator
    // line is the only confirmation the offering did anything, same as the
    // well's coin toss (WellSystem._grantCoinBlessing).
    if (message) this.game.menuSystem?.showPickupMessage?.(message);
    this.game.updateUI?.();
  }

  // The four non-affinity treasures. Permanent for the run, and they leave the
  // water exactly as they found it — nothing to come back and use later.
  // Returns the line the narrator says, so a gift that changed nothing (the two
  // booleans, offered twice) still reads as an answer rather than silence.
  _applyBlessing(kind) {
    const game = this.game;
    const player = game.player;
    if (!player) return null;
    const STILL = 'THE WATER IS STILL.';
    switch (kind) {
      case 'luck':
        // Same half-power luck flag the green-zone well grants; a second source
        // simply re-sets it rather than stacking.
        if (player.luckBlessed) return STILL;
        player.luckBlessed = true;
        return 'FEELING LUCKY?';
      case 'maxHp':
        player.maxHp += 1;
        player.hp = player.maxHp;
        return 'FEELING HEARTY?';
      case 'sprint':
        if (player.fountainSprintBlessed) return STILL;
        player.fountainSprintBlessed = true;
        return 'FEELING SWIFT?';
      case 'armor':
        if (player.fountainArmorBonus > 0) return STILL;
        player.fountainArmorBonus = 1;
        // defense is rebuilt from scratch every time equipment changes, so the
        // bonus has to land through that recompute — writing it straight to
        // player.defense here would vanish on the next armor swap.
        game.inventorySystem?.applyEquipmentEffectsToPlayer(player);
        return 'FEELING TOUGH?';
    }
    return null;
  }

  // The four elemental gems. Colouring the pool is the visible half; the useful
  // half is that _findNextTierChar will now hand back weapons of this element.
  _attune(element) {
    const game = this.game;
    const room = game.currentRoom;
    if (!room?.fountain) return null;
    room.fountain.attunement = element;
    const tint = ATTUNEMENT_COLORS[element] || null;
    for (const obj of game.backgroundObjects || []) {
      if (obj.fountainWater || obj.fountainWaterfall) obj.fountainTint = tint;
    }
    game.renderer?.markBackgroundDirty?.();
    // The new colour is the real message; the line just points at the pool so a
    // player standing on the far side of the room looks back at it.
    return 'THE WATER TURNS.';
  }

  // ── Bottling ──────────────────────────────────────────────────────────────

  // Fill an equipped Empty Bottle from the pool. Free and repeatable: it spends
  // neither the attunement nor the one offering per visit, so the only limit is
  // how many Empty Bottles the player is carrying. Returns true if it filled one.
  tryBottleFountainWater(obj) {
    const game = this.game;
    const room = game.currentRoom;
    if (!obj || (!obj.fountainWater && !obj.fountainWaterfall)) return false;
    if (!room || room.type !== ROOM_TYPES.FOUNTAIN || !room.fountain) return false;
    // A corrupted pool is no longer fairy water. Fall through to the ordinary
    // liquid-bottle path so it yields whatever the element turned it into.
    if (room.fountain.corrupted) return false;
    if (game.player?.heldItem?.char !== 'B') return false;

    const slots = game.player.equippedConsumables;
    const slotIndex = slots?.findIndex(s => s?.char === 'B') ?? -1;
    if (slotIndex === -1) return false;

    const bottleChar = FOUNTAIN_BOTTLES[room.fountain.attunement || 'none'];
    game.inventorySystem.replaceConsumableSlot(slotIndex, bottleChar);
    game.menuSystem.showPickupMessage(
      (getItemData(bottleChar)?.name || 'bottle').toUpperCase()
    );
    game.audioSystem?.playSFX?.('pickup');
    game.updateUI();
    return true;
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
  // random char from the next tier. Null if at top tier, not in any family, or
  // if every candidate on that rung is locked behind an attunement we don't have.
  _findNextTierChar(char) {
    const attunement = this.game.currentRoom?.fountain?.attunement || null;
    for (const family of Object.keys(WEAPON_TIERS)) {
      const tiers = WEAPON_TIERS[family];
      for (let t = 0; t < tiers.length; t++) {
        if (!tiers[t].includes(char)) continue;
        const nextTier = tiers[t + 1];
        if (!nextTier || nextTier.length === 0) return null;
        // An unattuned pool only ever hands back a plain weapon. Attuning ADDS
        // its element to the candidates rather than restricting to them, so
        // offering a gem can never close an upgrade path that was already open.
        // A rung that is entirely elemental therefore filters down to nothing,
        // which reads as a refusal — the fairy returns the weapon untouched.
        const allowed = nextTier.filter(c => {
          const element = weaponElement(getItemData(c));
          return element === null || element === attunement;
        });
        if (allowed.length === 0) return null;
        return allowed[Math.floor(Math.random() * allowed.length)];
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
