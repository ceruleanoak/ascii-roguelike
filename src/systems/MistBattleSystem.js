// MistBattleSystem — the Mist Battle (the false ending). In Act 1 the player
// commands the three lost characters at once, as one Trine; in Act 2 the
// three fight each other with no input, and the mist takes the victor.
//
// Act 1's shape (see claudedocs/zone-cosmology.md, "The False Ending — the
// Mist Battle"):
// - Three real `Player` bodies. `game.player` is the Primary — a pointer, not a
//   fixed body — so every existing Primary-only path (throw/drop, consumables,
//   pickup, interactions, HUD) keeps working untouched. The other two bodies
//   are Flanks, owned here.
// - The Trine is a triangle whose apex (the Primary) points where the Primary
//   faces; Flanks hold the two back corners, each facing its own nearest
//   enemy (_aimFlank).
// - Flanks mirror the Primary: same attack press (each with its own weapon,
//   aimed at its own target), same slot on 1/2/3, and a roll in the same
//   direction with their own character's roll type.
// - Rotate (triple-tap SPACE) turns the Trine clockwise: `game.player` is
//   repointed at the back-left body and the gear slots swap with it.
// - Only the Primary takes damage: enemies target it alone, and nothing hurts
//   a Flank (hurt, _applyDot). A Primary at 0 HP goes Dormant instead of
//   dying: it hands off to an awake Flank, rides along in its corner, and
//   wakes at full HP after DORMANT_TIME. Only a Primary falling with no awake
//   Flank left ends the run.
// - Each body carries its own character type and its own gear. The global
//   InventorySystem gear slots always mirror the Primary; a Flank's passive
//   armor/consumable stats are projected onto it by briefly loading its gear
//   (see _projectGear).
//
// The fight: a warm-up of mixed gray waves (_updateWaves), then the Grasp
// (GraspSystem) — a climb up a mountain that ends at the Summit, where the
// camera closes in and startAct2() begins Act 2.
//
// Act 2 (startAct2, the Act 2 sections below, AI in mistBattle/autoBattle.js):
// - Three fresh bodies, built from the snapshots alone (full HP, snapshotted
//   gear, fixed start points), so how Act 1 went never touches the outcome.
// - Seeded: the battle's generator is seeded from the snapshots' content and
//   swapped in for Math.random through every Act 2 update tick (runTick), so
//   the same three lost characters fight the same fight.
// - Every body uses its own consumables and death saves (_withBody).
// - No input: every key is swallowed (handleKeydown).
// - When one body stands, the mist closes over it (GrayZoneSystem.closeOver)
//   and the run resets to the title. No text, no credits.
//
// Reached two ways: the third character the gray mist takes
// (GrayZoneSystem._finalizeMistOut hands `game.graySnapshots` to enterArena),
// and the CheatMenu BOSSES entries (random snapshots). Both build the arena
// through enterArena.
import { GAME_STATES, GRID, PHYSICS, ROOM_TYPES } from '../game/GameConfig.js';
import { ZONES } from '../data/zones.js';
import { Player } from '../entities/Player.js';
import { Item } from '../entities/Item.js';
import { ITEMS, ITEM_TYPES, WEAPON_TYPES, AFFINITY_POOLS } from '../data/items.js';
import { CHARACTER_TYPES } from '../data/characters.js';
import { PUZZLE_ROOM_TEMPLATES } from '../data/dungeonPuzzleTemplates.js';
import { steerToward } from './npcSteering.js';
import { PlayerInputSystem } from './PlayerInputSystem.js';
import { tryDeathSave } from './DeathSaveSystem.js';
import { createPlayerStatusSlots } from './StatusEffectSystem.js';
import { canMirror, mirrorPress, mirrorRelease, mirrorAutoAttack, tickMirroredWeapon, reportHit } from './mirroredWeapon.js';
import { createExplosion } from '../entities/Particle.js';
import { DEATH_CAUSES } from '../data/deathCauses.js';
import { DemoSystem } from './DemoSystem.js';
import { createBrain, driveBody, resolveRivalHits, facingToward } from './mistBattle/autoBattle.js';

const CELL = GRID.CELL_SIZE;
// Trine geometry, in cells, measured from the Primary along its facing.
const FLANK_BACK = 2;
const FLANK_SIDE = 1.5;
// Flanks run a little faster than the Primary so drift (and later, rolls)
// always closes back up; inside SETTLE_RADIUS they ease in proportionally
// instead of overshooting and jittering around the slot.
const FLANK_SPEED_MULT = 1.2;
const SETTLE_RADIUS = CELL;
const ARRIVE_EPSILON = 1.5;
// How long each body's newly held weapon glyph shows above it after a 1/2/3
// swap (seconds).
const SWAP_FLASH_TIME = 0.6;
// ROTATE_TAPS SPACE presses, each within ROTATE_TAP_WINDOW seconds of the
// last, are a Rotate: the first presses attack, the last one rotates.
const ROTATE_TAPS = 3;
const ROTATE_TAP_WINDOW = 0.25;
// After a Rotate the new Primary glides up into the old apex position over
// this many seconds, so the triangle turns in place instead of the whole
// Trine stepping back a corner with every Rotate.
const ROTATE_GLIDE_TIME = 0.2;
// Warm-up waves: when fewer than WAVE_FLOOR enemies remain, WAVE_SIZE more
// arrive after WAVE_DELAY seconds, until the Grasp turns them off
// (`wavesEnabled`, after its WARMUP_WAVES).
const WAVE_FLOOR = 3;
const WAVE_SIZE = 4;
const WAVE_DELAY = 1.5;
// Mist clearing (mistClearings): each living body clears the mist this many
// times the zone's vision radius, so the whole Trine reads at once.
const BODY_MIST_RADIUS_MULT = 1.5;
// Seconds a Dormant Trine body lies still before it wakes at full HP.
const DORMANT_TIME = 15;

/** How many characters the gray mist takes before the Mist Battle begins. */
export const MIST_BATTLE_LOST = 3;
// Act 2: the three bodies start on a triangle this many cells around the
// room center, apex up, each facing the center.
const ACT2_START_RADIUS = 3;
// Seconds the victor stands before the mist starts to close.
const VICTOR_HOLD = 1.5;
// A fight still going after this many seconds is ended by the mist anyway;
// the body with the largest share of its HP left is the one it takes last.
const STALEMATE_TIME = 90;

// FNV-1a over the snapshots' content: the Act 2 seed. Same three lost
// characters with the same gear → same seed → same fight.
function snapshotSeed(snapshots) {
  let hash = 0x811c9dc5;
  const text = JSON.stringify(snapshots);
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

// Weapons that can't mirror (canMirror: bat, charge hammer, gem wand,
// mana weapons) stay out of all three loadouts: Rotate can promote any body
// to Primary, so every body draws from the same pools. A real mist-out
// snapshot can still carry one; _makeWeapon leaves that slot empty.

// Utility = the weapon families the dungeon puzzle rooms teach on their
// pedestals (whip, boomerang, torch today). Derived from the templates rather
// than a hand-kept list so a new trial's weapon joins the pool automatically.
// A pedestal weapon expands to its whole family: a boomerang to every
// `boomerang` item, anything else to every item sharing its weaponSubtype.
function isUtilityWeapon(data, pedestalData) {
  return pedestalData.some(p =>
    (p.boomerang && data.boomerang) ||
    (p.weaponSubtype && p.weaponSubtype === data.weaponSubtype)
  );
}

function buildLoadoutPools() {
  const pedestalData = Object.values(PUZZLE_ROOM_TEMPLATES)
    .map(t => t.pedestal?.weaponChar && ITEMS[t.pedestal.weaponChar])
    .filter(Boolean);

  const pools = { melee: [], ranged: [], utility: [], armor: [], consumables: [] };
  for (const [char, data] of Object.entries(ITEMS)) {
    if (data.type !== ITEM_TYPES.WEAPON || !canMirror(data)) continue;
    if (isUtilityWeapon(data, pedestalData)) pools.utility.push(char);
    else if (data.weaponType === WEAPON_TYPES.MELEE) pools.melee.push(char);
    else if (data.weaponType === WEAPON_TYPES.GUN || data.weaponType === WEAPON_TYPES.BOW) pools.ranged.push(char);
  }

  // Armor and consumables come from the drop pools — the gear a character
  // could actually have been carrying — not every authored entry.
  const armor = new Set();
  const consumables = new Set();
  for (const affinity of Object.values(AFFINITY_POOLS)) {
    for (const chars of Object.values(affinity.armor || {})) chars.forEach(c => armor.add(c));
    for (const chars of Object.values(affinity.consumables || {})) chars.forEach(c => consumables.add(c));
  }
  pools.armor = [...armor].filter(c => ITEMS[c]?.type === ITEM_TYPES.ARMOR);
  pools.consumables = [...consumables].filter(c => ITEMS[c]?.type === ITEM_TYPES.CONSUMABLE);
  return pools;
}

const pick = (list) => list[Math.floor(Math.random() * list.length)];

function shuffled(list) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export class MistBattleSystem {
  constructor(game) {
    this.game = game;
    this.pools = null; // built lazily on first start — ITEMS is static, so once is enough
    this.reset();
  }

  /** True while a Trine exists in the current room. */
  get active() {
    return this.members.length > 0;
  }

  // Room-scoped teardown (RESET_REGISTRY `mistBattleSystem.reset`): leaving the
  // arena ends the battle. Flank bodies are dropped from physics here; the
  // room-scope physicsSystem.clear also covers them, but a re-start inside the
  // same room (re-selecting the cheat entry) must not leave stale bodies.
  reset() {
    for (const member of this.members || []) {
      if (member.body !== this.game.player) this.game.physicsSystem?.removeEntity(member.body);
    }
    // Clockwise ring order. members[(primaryIndex + k) % 3] holds Trine slot k:
    // 0 = apex (Primary), 1 = back-right, 2 = back-left — clockwise when the
    // apex points up.
    this.members = [];
    this.primaryIndex = 0;
    // Last frame's Primary roll state, for the mirrored-dodge edge (_mirrorDodge).
    this.leadRollCooldown = 0;
    this.leadSliding = false;
    // Game-time clock for the Rotate tap window (deterministic, pauses with the game).
    this.clock = 0;
    this.lastSpacePress = -Infinity;
    this.spaceTaps = 0;
    this.glide = null; // { x, y, timer } — the new Primary's run to the old apex
    this.waveTimer = 0;
    // The Grasp ends the warm-up by turning the waves off once it has counted
    // enough of them.
    this.wavesEnabled = true;
    this.wavesSpawned = 0;
    // 1 = the Trine's fight; 2 = the lost characters' auto-battle (startAct2).
    this.act = 1;
    // The snapshots this battle was built from (start); Act 2 rebuilds its
    // bodies from them.
    this.snapshots = null;
    // Act 2: the seeded generator runTick swaps in, the arena center goals
    // are leashed to, the fight clock, rival attack → bodies it is done with,
    // and the ending ({ timer, closing, closed }) once one body stands.
    this.rng = null;
    this.arena = null;
    this.act2Clock = 0;
    this.rivalResolved = new WeakMap();
    this.ending = null;
  }

  /**
   * Random lost-character snapshots for the test entry: three distinct
   * character types, each with 1 melee + 1 ranged + 1 utility weapon, one
   * armor and one consumable. Same shape as a `game.graySnapshots` entry.
   */
  rollTestSnapshots() {
    this.pools ??= buildLoadoutPools();
    const p = this.pools;
    return shuffled(Object.keys(CHARACTER_TYPES)).slice(0, 3).map(characterType => ({
      characterType,
      quickSlots: [pick(p.melee), pick(p.ranged), pick(p.utility)].map(char => ({ char })),
      armor: { char: pick(p.armor) },
      consumables: [{ char: pick(p.consumables) }],
    }));
  }

  /**
   * Build the Trine from three snapshots. The existing `game.player` becomes
   * the first member (and Primary) so its wiring (godMode, physics, collision
   * map) carries over; the other two are fresh Flank bodies standing on it —
   * they steer out to their corners, which keeps a spawn inside wall geometry
   * from ever trapping one.
   */
  start(snapshots = null) {
    snapshots ??= this.rollTestSnapshots(); // null as well as omitted
    const game = this.game;
    this.reset();
    this.snapshots = snapshots.slice(0, 3);

    const primary = game.player;
    snapshots.slice(0, 3).forEach((snap, i) => {
      let body = primary;
      if (i > 0) {
        body = new Player(primary.position.x, primary.position.y);
        body.godMode = primary.godMode;
        body.setCollisionMap(primary.collisionMap);
        game.physicsSystem.addEntity(body);
      }
      game.characterSystem.applyCharacterTypeTo(body, snap.characterType);
      body.quickSlots = snap.quickSlots.map(s => this._makeWeapon(s, body));
      body.activeSlotIndex = 0;
      body.destroyedSlots = [false, false, false];
      body.hp = body.maxHp;
      this.members.push({
        body,
        characterType: snap.characterType,
        swapFlash: 0,
        gear: this._makeGear(snap, body),
        brain: createBrain(),
        fallen: false,
        dormant: 0, // seconds left Dormant (Act 1); 0 = awake
      });
    });

    this.primaryIndex = 0;
    game.activeCharacterType = this.members[0].characterType;
    for (const member of this.members) this._projectGear(member);
    this._loadGear(this.members[this.primaryIndex]);
    game.updateUI();
    game.graspSystem.begin(game.currentRoom);
  }

  /** Every awake body, the Primary first (Dormant bodies are not counted). */
  livingBodies() {
    const lead = this.primary;
    if (!lead) return [];
    const out = lead.body.hp > 0 ? [lead.body] : [];
    for (const { body } of this.flanks()) out.push(body);
    return out;
  }

  /**
   * Every body still in the arena, awake or Dormant: what the mist parts
   * around and the climb's rock blocks.
   */
  presentBodies() {
    return this.members.filter(m => m.body.hp > 0 || m.dormant > 0).map(m => m.body);
  }

  /**
   * Damage on a Trine body from a source CombatSystem doesn't resolve (the
   * Grasp). Only the Primary and Held bodies take damage: a hit on a Flank
   * passes through (returns false). Goes through Player.takeDamage, so armor,
   * i-frames and the roll apply; a Primary that drops is caught by
   * _catchPrimaryDeath, and a Held body that drops goes Dormant.
   */
  hurt(body, damage, source, from) {
    if (this.act === 1 && body !== this.game.player && !this.isHeld(body)) return false;
    const result = body.takeDamage(damage, source);
    if (result !== false) reportHit(this.game, body, result, damage, from, 0);
    if (body !== this.game.player && body.hp <= 0) {
      const member = this.members.find(m => m.body === body);
      if (member && this.act === 1) this._goDormant(member);
      else if (member) this._fall(member);
    }
    return result;
  }

  /**
   * Open the Mist Battle arena: a gray combat room holding a Trine built from
   * `snapshots` (random test loadouts when omitted or null). Depth is pinned below
   * ZONES.gray.maxDepth so applyRoomSwap's grayZoneSystem.onRoomEnter doesn't
   * arm the mist-out. The Trine is built AFTER applyRoomSwap — the swap's
   * room-scope reset clears physics and the previous Trine, so building it
   * first would lose the Flanks. `graspPhase` (optional, test entries) skips
   * the warm-up straight to a Grasp phase.
   */
  enterArena(snapshots = null, graspPhase = null) {
    snapshots ??= this.rollTestSnapshots();
    const game = this.game;
    game.bossSystem.deactivate();
    const zone = 'gray';
    game.zoneSystem.currentZone = zone;
    const depth = Math.max(1, (ZONES[zone]?.maxDepth ?? 10) - 1);
    game.zoneDepths[zone] = depth;
    game.roomGenerator.setDepth(depth);

    // Generate around the south spawn (one of the cells createCollisionMap
    // guarantees clear), then move the Primary to a spot with room for the
    // whole Trine — the back corners would sit in the south wall otherwise.
    // The south spawn stays the fallback.
    const southSpawn = { x: Math.floor(GRID.COLS / 2) * CELL, y: (GRID.ROWS - 3) * CELL };
    const newRoom = game.roomGenerator.generateRoom(ROOM_TYPES.COMBAT, southSpawn, zone, null);
    const spawnPos = this.findSpawnAnchor(newRoom) ?? southSpawn;

    game.currentRoom = newRoom;
    game.player.position.x = spawnPos.x;
    game.player.position.y = spawnPos.y;
    game.player.facing = { x: 0, y: -1 };
    game.player.setCollisionMap(newRoom.collisionMap);
    game.interiorManager.reset();
    game.applyRoomSwap(newRoom);

    this.start(snapshots);
    if (graspPhase) game.graspSystem.skipTo(graspPhase);
    game.audioSystem.switchZoneMusic(zone, import.meta.env.BASE_URL);
  }

  // ── Act 2 ─────────────────────────────────────────────────────────────

  /**
   * The Summit: the camera has closed in and Act 1 is over. The Trine's
   * bodies leave and three fresh ones are built from the snapshots on fixed
   * start points; from here the battle runs itself, seeded.
   */
  startAct2() {
    const game = this.game;
    this.act = 2;
    for (const k of ['w', 'a', 's', 'd', 'space', 'shift', 'tab']) game.keys[k] = false;
    for (const k of Object.keys(game.arrowKeys)) game.arrowKeys[k] = false;
    game.consumableTriggerSystem.disarm();

    // Whatever Act 1 left in the arena goes: its enemies, its attacks, and
    // the rock the climb left standing (shattered, the way breakLoose
    // shatters the room). The fight starts on open ground every time.
    const room = game.currentRoom;
    room.enemies.length = 0;
    game.combatSystem.clear();
    const grasp = game.graspSystem;
    for (const piece of grasp.climb.scenery) {
      grasp.burst(piece.x + piece.w / 2, piece.y + piece.h / 2, 6);
    }
    grasp.climb.scenery = [];

    // The Act 1 bodies leave; the fresh ones take their places in the ring.
    const old = this.members.map(m => m.body);
    for (const body of old) game.physicsSystem.removeEntity(body);
    const collisionMap = game.player.collisionMap;
    this.arena = { x: (GRID.COLS / 2) * CELL, y: (GRID.ROWS / 2) * CELL };
    this.rng = DemoSystem.mulberry32(snapshotSeed(this.snapshots));
    this.act2Clock = 0;
    this.rivalResolved = new WeakMap();
    this.ending = null;
    this.glide = null;

    this.members = this.snapshots.map((snap, i) => {
      const angle = -Math.PI / 2 + (Math.PI * 2 * i) / this.snapshots.length;
      const cx = this.arena.x + Math.cos(angle) * ACT2_START_RADIUS * CELL;
      const cy = this.arena.y + Math.sin(angle) * ACT2_START_RADIUS * CELL;
      const body = new Player(Math.round(cx - CELL / 2), Math.round(cy - CELL / 2));
      body.setCollisionMap(collisionMap);
      game.physicsSystem.addEntity(body);
      game.characterSystem.applyCharacterTypeTo(body, snap.characterType);
      body.quickSlots = snap.quickSlots.map(s => this._makeWeapon(s, body));
      body.activeSlotIndex = 0;
      body.destroyedSlots = [false, false, false];
      body.hp = body.maxHp;
      body.facing = { x: Math.sign(Math.round(-Math.cos(angle))), y: Math.sign(Math.round(-Math.sin(angle))) };
      return {
        body, characterType: snap.characterType, swapFlash: 0,
        gear: this._makeGear(snap, body), brain: createBrain(), fallen: false, dormant: 0,
      };
    });

    this.primaryIndex = 0;
    game.player = this.members[0].body;
    game.activeCharacterType = this.members[0].characterType;
    for (const member of this.members) this._projectGear(member);
    this._loadGear(this.primary);
    game.updateUI();
  }

  /** Whether Act 2 holds the bodies (main.js movement lock: no WASD). */
  holdsTrine() {
    return this.active && this.act === 2;
  }

  /**
   * Run one update tick (main.js's GameLoop callback). During Act 2 the
   * battle's seeded generator stands in for Math.random for the whole tick,
   * so every random draw the fight makes — AI choices, accuracy rolls,
   * dodges, crits — comes from the seed. Rendering runs outside the tick and
   * keeps the real Math.random.
   */
  runTick(tick) {
    if (!this.rng || this.act !== 2) return tick();
    const realRandom = Math.random;
    Math.random = this.rng;
    try {
      tick();
    } finally {
      Math.random = realRandom;
    }
    // The mist has closed over the victor (_updateEnding). TITLE drops
    // game.player, so it waits until the tick that closed the mist has run.
    if (this.ending?.closed) this.game.stateMachine.transition(GAME_STATES.TITLE);
  }

  /** Act 2 takes no input: every key is swallowed. True when consumed. */
  handleKeydown(e) {
    if (!this.holdsTrine()) return false;
    e.preventDefault();
    return true;
  }

  // Run `fn` with `member` standing in as game.player and its gear loaded in
  // the global slots, so player-bound paths (consumable auto-triggers and
  // windups, death saves) act on that body. Raw slot swaps, not a
  // projection: re-projecting every frame would re-arm per-room passives.
  _withBody(member, fn) {
    const game = this.game;
    const primary = this.primary;
    if (member === primary) return fn();
    this._stashGear(primary);
    this._loadSlots(member);
    game.player = member.body;
    try {
      return fn();
    } finally {
      game.player = primary.body;
      this._stashGear(member);
      this._loadSlots(primary);
    }
  }

  // Each frame of Act 2, after combat: rival hits, then every body at 0 HP
  // gets its death save or falls. A fallen game.player hands the pointer to
  // the next living body. One body (or none) left starts the ending.
  _resolveAct2() {
    const game = this.game;
    const living = this.members.filter(m => m.body.hp > 0);
    for (const member of living) {
      const rivals = living.filter(m => m !== member).map(m => m.body);
      resolveRivalHits(game, member.body, rivals, this.rivalResolved);
    }
    for (const member of this.members) {
      const body = member.body;
      if (body.hp > 0 || member.fallen) continue;
      if (this._withBody(member, () => tryDeathSave(game))) continue;
      member.fallen = true;
      if (member === this.primary) {
        const next = this.members.findIndex(m => m.body.hp > 0);
        if (next >= 0) this._promote(next);
        this.glide = null;
      }
      this._fall(member);
    }
    if (!this.ending && this.livingBodies().length <= 1) this._beginEnding();
  }

  // One body stands (or none): it holds still a moment, then the mist closes
  // over it and the run ends at the title.
  _beginEnding() {
    this.ending = { timer: VICTOR_HOLD, closing: false, closed: false };
    for (const body of this.livingBodies()) {
      body.heldItem?.cancelChargeAndReload?.();
      body.velocity.vx = 0;
      body.velocity.vy = 0;
    }
  }

  // The stalemate cap: the mist ends the fight with the body holding the
  // largest share of its HP as the one left standing.
  _endStalemate() {
    const living = this.members.filter(m => m.body.hp > 0);
    if (living.length === 0) return this._beginEnding();
    const share = (m) => m.body.hp / m.body.maxHp;
    const victor = living.reduce((best, m) => (share(m) > share(best) ? m : best), living[0]);
    for (const member of living) {
      if (member === victor) continue;
      member.fallen = true;
      member.body.hp = 0;
      this._fall(member);
    }
    const index = this.members.indexOf(victor);
    if (index !== this.primaryIndex) this._promote(index);
    this.glide = null;
    this._beginEnding();
  }

  _updateEnding(deltaTime) {
    const ending = this.ending;
    for (const body of this.livingBodies()) {
      body.velocity.vx = 0;
      body.velocity.vy = 0;
    }
    if (ending.closing) return;
    ending.timer -= deltaTime;
    if (ending.timer > 0) return;
    ending.closing = true;
    this.game.grayZoneSystem.closeOver(() => { ending.closed = true; });
  }

  // rest-parity: absent because the Mist Battle only exists in its EXPLORE arena.
  _updateAct2(deltaTime) {
    const game = this.game;
    this.act2Clock += deltaTime;
    for (const member of this.members) {
      if (member.swapFlash > 0) member.swapFlash = Math.max(0, member.swapFlash - deltaTime);
    }
    if (!this.ending && this.act2Clock >= STALEMATE_TIME) this._endStalemate();

    const living = this.members.filter(m => m.body.hp > 0);
    for (const member of living) {
      const body = member.body;
      // game.player's own tick (Player.update, DoT, held weapon, consumables)
      // runs in main.js; the other two tick here.
      if (body !== game.player) {
        this._applyDot(member, body.update(deltaTime));
        tickMirroredWeapon(game, body, deltaTime, this._fire);
        this._withBody(member, () => game.inventorySystem.update(
          deltaTime, body, game.currentRoom, game.combatSystem, game.steamClouds, game.particles));
      }
      if (this.ending || body.hp <= 0) continue;
      const rivals = living.filter(m => m !== member && m.body.hp > 0).map(m => m.body);
      driveBody(game, member, rivals, this.arena, deltaTime, { fire: this._fire, onSlotSwitch: this._flashSwap });
    }
    if (this.ending) this._updateEnding(deltaTime);
  }

  _flashSwap = (member) => {
    member.swapFlash = SWAP_FLASH_TIME;
  };

  /**
   * A spawn cell for an apex-up Trine: the cell nearest the room center whose
   * whole footprint (apex row plus the rows behind it, FLANK_SIDE either side)
   * is free of walls and background objects. A canonical exit spawn alone
   * isn't enough — the south one sits two rows off the wall, exactly where the
   * back corners land. Returns top-left pixel coords, or null when no cell
   * fits (the caller keeps its own spawn).
   */
  findSpawnAnchor(room) {
    const map = room.collisionMap;
    if (!map) return null;
    const rows = map.length;
    const cols = map[0]?.length ?? 0;
    const occupied = new Set();
    for (const obj of room.backgroundObjects || []) {
      occupied.add(`${Math.floor(obj.position.x / CELL)},${Math.floor(obj.position.y / CELL)}`);
    }
    const halfWidth = Math.ceil(FLANK_SIDE);
    const clear = (c, r) => {
      for (let row = r - 1; row <= r + FLANK_BACK + 1; row++) {
        for (let col = c - halfWidth; col <= c + halfWidth; col++) {
          if (row < 0 || row >= rows || col < 0 || col >= cols) return false;
          if (map[row][col] || occupied.has(`${col},${row}`)) return false;
        }
      }
      return true;
    };
    const centerCol = Math.floor(cols / 2);
    const centerRow = Math.floor(rows / 2);
    const maxRing = Math.max(rows, cols);
    for (let ring = 0; ring < maxRing; ring++) {
      for (let dr = -ring; dr <= ring; dr++) {
        for (let dc = -ring; dc <= ring; dc++) {
          if (Math.max(Math.abs(dr), Math.abs(dc)) !== ring) continue;
          const c = centerCol + dc;
          const r = centerRow + dr;
          if (clear(c, r)) return { x: c * CELL, y: r * CELL };
        }
      }
    }
    return null;
  }

  _makeItem(char, body) {
    return new Item(char, body.position.x, body.position.y);
  }

  // A quick slot from a snapshot. A weapon that can't mirror would sit dead
  // in a Flank's hands and in every Act 2 body's, so the slot is left empty
  // instead. The snapshot itself is untouched: the Act 2 seed is hashed from
  // it, and the same snapshots still build the same bodies.
  _makeWeapon(slot, body) {
    if (!slot) return null;
    const data = ITEMS[slot.char];
    if (data?.type === ITEM_TYPES.WEAPON && !canMirror(data)) return null;
    return this._makeItem(slot.char, body);
  }

  // A member's own gear, from its snapshot. `windups` holds its consumables'
  // pending throws (InventorySystem.consumableWindups while loaded).
  _makeGear(snap, body) {
    const consumables = snap.consumables || [];
    return {
      armor: snap.armor ? this._makeItem(snap.armor.char, body) : null,
      consumables: consumables.map(c => (c ? this._makeItem(c.char, body) : null)),
      spent: consumables.map(() => false),
      cooldowns: consumables.map(() => 0),
      windups: [],
    };
  }

  /**
   * Where the mist parts, for GrayZoneSystem.renderMist: a circle around every
   * living body, `radius` (the zone's current vision radius, in pixels) ×
   * BODY_MIST_RADIUS_MULT, plus the Grasp's parts, scaled by `scale` (the
   * radius's share of its base) so a closing mist closes over them too.
   * Empty when no battle is running — the mist parts around the player alone.
   */
  mistClearings(radius, scale) {
    if (!this.active) return [];
    const out = [];
    for (const body of this.presentBodies()) {
      out.push({ x: body.position.x + CELL / 2, y: body.position.y + CELL / 2, r: radius * BODY_MIST_RADIUS_MULT });
    }
    out.push(...this.game.graspSystem.mistClearings(scale));
    return out;
  }

  /** The member whose body is `game.player`. */
  get primary() {
    return this.members[this.primaryIndex] ?? null;
  }

  /**
   * Every awake non-Primary member in the Trine, in ring order. Dormant
   * members are skipped, and so are Held ones.
   */
  flanks() {
    const out = [];
    for (let k = 1; k < this.members.length; k++) {
      const member = this.members[(this.primaryIndex + k) % this.members.length];
      if (member.body.hp > 0 && !this.isHeld(member.body)) out.push(member);
    }
    return out;
  }

  /**
   * Whether a Great Hand holds this body. A Held body is out of the Trine: it
   * neither mirrors the Primary nor holds its corner, and can't be Rotated to,
   * until the hand lets it go and it runs back to its slot.
   */
  isHeld(body) {
    return body.grabbedBy?.isGraspUnit === true;
  }

  /**
   * A Great Hand has just caught `body` (greatHands.grab). If it was the
   * Primary, control passes to the next free body; with none free, the
   * Primary stays held.
   */
  onHeld(body) {
    if (body !== this.game.player) return;
    body.acceleration.ax = 0;
    body.acceleration.ay = 0;
    // The new Primary holds its ground: gliding to the old apex would run it
    // straight into the hand.
    if (this.rotate()) this.glide = null;
  }

  // Put a member's gear into the global InventorySystem slots. Those slots are
  // the Primary's by contract (HUD, SPACE-armed consumables, death saves all
  // read them), so this is only ever left loaded for the Primary.
  _loadGear(member) {
    this._loadSlots(member);
    this.game.inventorySystem.applyEquipmentEffectsToPlayer(member.body);
  }

  // The slot swap alone, without projecting stats onto the body.
  _loadSlots(member) {
    const inv = this.game.inventorySystem;
    const slots = inv.maxConsumableSlots;
    const fit = (list, fill) => Array.from({ length: slots }, (_, i) => list[i] ?? fill);
    inv.equippedArmor = member.gear.armor;
    inv.equippedConsumables = fit(member.gear.consumables, null);
    inv.spentConsumableSlots = fit(member.gear.spent, false);
    inv.consumableCooldowns = fit(member.gear.cooldowns, 0);
    inv.consumableWindups = member.gear.windups;
  }

  // Project a Flank's passive gear stats (defense, resists, passives) onto its
  // body by loading its gear through the one sanctioned path,
  // EquipmentEffectsSystem.apply, then putting the Primary's gear back.
  _projectGear(member) {
    this._loadGear(member);
    const primary = this.primary;
    if (primary && primary !== member) this._loadGear(primary);
  }

  /** Trine slot k's target position (top-left of the body), relative to the Primary. */
  _slotPosition(k) {
    const lead = this.game.player;
    const fx = lead.facing.x;
    const fy = lead.facing.y;
    const len = Math.hypot(fx, fy) || 1;
    const nx = fx / len;
    const ny = fy / len;
    if (k === 0) return { x: lead.position.x, y: lead.position.y };
    // Right of facing is (-ny, nx); slot 1 = back-right, slot 2 = back-left.
    const side = k === 1 ? 1 : -1;
    return {
      x: lead.position.x - nx * FLANK_BACK * CELL + -ny * side * FLANK_SIDE * CELL,
      y: lead.position.y - ny * FLANK_BACK * CELL + nx * side * FLANK_SIDE * CELL,
    };
  }

  // ── Mirrored attacks ──────────────────────────────────────────────────
  // Flanks fire with the Primary, Galaga-style: the same press, the same
  // facing, each with its own held weapon. A Flank's weapon runs the carrier
  // pattern (CampNPCSystem._tryAttack): `use(body)` / `releaseBow()` build the
  // attack from that body's position, and CombatSystem resolves it. The
  // Primary-only damage modifier (shrines, Frog Coin, training — all read
  // `game.player`) is deliberately not applied to Flank attacks. The press,
  // repeat, release and tick shapes are shared with the Dragon Spirit's Echo
  // (mirroredWeapon.js).

  _fire = (attack) => {
    if (attack) this.game.combatSystem.createAttack(attack, this.game._activeEnemies());
  };

  /** SPACE press, right after the Primary's attack (main.js handleSpacePress). */
  onAttackPress() {
    if (!this.active) return;
    for (const { body } of this.flanks()) mirrorPress(body, this._fire);
  }

  /** SPACE release: loose every charged Flank bow (mirrors handleSpaceRelease). */
  onAttackRelease() {
    if (!this.active) return;
    for (const { body } of this.flanks()) mirrorRelease(body, this._fire);
  }

  /**
   * 1/2/3 select the slot on every body at once, and each body flashes its
   * newly held weapon above it so the three loadouts read at a glance.
   * Called after main.js has switched the Primary's slot.
   */
  onSelectSlot(index) {
    if (!this.active) return;
    for (const member of this.members) {
      const body = member.body;
      if (body.hp <= 0) continue;
      if (body !== this.game.player && !body.destroyedSlots?.[index]) {
        if (index !== body.activeSlotIndex) body.heldItem?.cancelChargeAndReload?.();
        body.activeSlotIndex = index;
      }
      member.swapFlash = SWAP_FLASH_TIME;
    }
  }

  // ── Rotate ────────────────────────────────────────────────────────────
  // Triple-tap SPACE turns the Trine clockwise one slot: the back-left Flank
  // becomes the Primary at the apex, the old Primary drops to back-right. The
  // first two taps attack as usual; the third rotates instead.

  /**
   * Called on every SPACE press, ahead of every other SPACE use (pickup,
   * containers, the attack), so each tap counts toward the triple-tap.
   * Returns true when the press completed one and Rotated (the press is
   * consumed). Outside EXPLORE (GAME_OVER after the Trine falls) no tap counts.
   */
  tryRotate() {
    if (!this.active || this.game.stateMachine.getCurrentState() !== GAME_STATES.EXPLORE) return false;
    if (this.act === 2) return true; // Act 2 takes no input: SPACE does nothing
    const inWindow = this.clock - this.lastSpacePress <= ROTATE_TAP_WINDOW;
    this.spaceTaps = inWindow ? this.spaceTaps + 1 : 1;
    this.lastSpacePress = this.clock;
    if (this.spaceTaps < ROTATE_TAPS) return false;
    this.spaceTaps = 0; // the next tap starts a fresh run
    this.lastSpacePress = -Infinity;
    return this.rotate();
  }

  /** Promote the next living member clockwise (back-left first) to Primary. */
  rotate() {
    const n = this.members.length;
    let next = -1;
    for (let k = n - 1; k >= 1; k--) { // back-left (n-1) before back-right
      const idx = (this.primaryIndex + k) % n;
      const body = this.members[idx].body;
      if (body.hp > 0 && !this.isHeld(body)) { next = idx; break; }
    }
    if (next < 0) return false;
    this._promote(next);
    return true;
  }

  _promote(index) {
    const game = this.game;
    const outgoing = this.primary;
    this._stashGear(outgoing);
    // The outgoing body stops answering input; formation steering takes over.
    outgoing.body.acceleration.ax = 0;
    outgoing.body.acceleration.ay = 0;
    outgoing.body.heldItem?.cancelChargeAndReload?.();

    this.glide = { x: outgoing.body.position.x, y: outgoing.body.position.y, timer: ROTATE_GLIDE_TIME };
    this.primaryIndex = index;
    const incoming = this.primary;
    // Keep the Trine's heading: the new apex faces where the old one did.
    incoming.body.facing.x = outgoing.body.facing.x;
    incoming.body.facing.y = outgoing.body.facing.y;
    game.player = incoming.body;
    game.activeCharacterType = incoming.characterType;
    this._loadGear(incoming);
    this.leadRollCooldown = incoming.body.dodgeRoll.cooldownTimer;
    this.leadSliding = incoming.body.continuousRollActive;
    game.updateUI();
  }

  // Copy the global gear slots (the Primary's live gear — consumables may
  // have been spent or cooled down since they were loaded) back onto the member.
  _stashGear(member) {
    const inv = this.game.inventorySystem;
    member.gear.armor = inv.equippedArmor;
    member.gear.consumables = [...inv.equippedConsumables];
    member.gear.spent = [...inv.spentConsumableSlots];
    member.gear.cooldowns = [...inv.consumableCooldowns];
    member.gear.windups = inv.consumableWindups;
  }

  _updateGlide(deltaTime, minSpeed) {
    const glide = this.glide;
    if (!glide) return;
    const body = this.game.player;
    glide.timer -= deltaTime;
    const dist = Math.hypot(glide.x - body.position.x, glide.y - body.position.y);
    if (body.dodgeRoll.active) {
      this.glide = null; // a roll takes over the body
      return;
    }
    if (glide.timer <= 0 || dist < ARRIVE_EPSILON) {
      // Stop on the mark — the glide's speed would otherwise coast past it.
      body.velocity.vx = 0;
      body.velocity.vy = 0;
      this.glide = null;
      return;
    }
    steerToward(this.game, body, glide.x, glide.y, Math.max(minSpeed, dist / glide.timer));
  }

  // ── Mirrored dodge ────────────────────────────────────────────────────
  // When the Primary rolls, every Flank rolls the same way with its OWN
  // character's roll (hide, blink, damage, sprint...). Detected as an edge on
  // the Primary's state rather than hooked into CharacterSystem.updateDodge,
  // so every way a roll starts is covered: a standard roll re-arms
  // dodgeRoll.cooldownTimer (blink included — it is instant, so `active`
  // alone can miss it), and Green Ranger's continuous slide raises
  // continuousRollActive instead.
  _mirrorDodge() {
    const lead = this.game.player;
    const rolled = lead.dodgeRoll.cooldownTimer > this.leadRollCooldown;
    const slid = lead.continuousRollActive && !this.leadSliding;
    this.leadRollCooldown = lead.dodgeRoll.cooldownTimer;
    this.leadSliding = lead.continuousRollActive;

    let direction = null;
    if (rolled) direction = lead.dodgeRoll.direction;
    else if (slid) direction = this._unit(lead.velocity.vx, lead.velocity.vy) ?? lead.facing;
    if (direction) {
      const enemies = this.game._activeEnemies();
      for (const { body } of this.flanks()) {
        if (body.dodgeRoll.active) continue;
        if (!body.startDodgeRoll({ x: direction.x, y: direction.y }, enemies)) continue;
        if (body.pendingBlink) {
          this.game.warpSystem.resolveBlinkTeleport(body.pendingBlink, body);
          body.pendingBlink = null;
        }
      }
    }

    // A roll curves with held input (CharacterSystem.updateDodge); Flanks
    // curve with the Primary's so the Trine keeps its shape mid-roll.
    if (lead.dodgeRoll.active) {
      for (const { body } of this.flanks()) {
        if (body.dodgeRoll.active) body.dodgeRoll.direction = lead.dodgeRoll.direction;
      }
    }
  }

  _unit(x, y) {
    const len = Math.hypot(x, y);
    return len > 0 ? { x: x / len, y: y / len } : null;
  }

  // ── Combat against the Trine ──────────────────────────────────────────
  // Only the Primary takes damage. CombatSystem already resolves enemy attacks
  // against `game.player` alone, so enemy hits need nothing here; the Grasp's
  // own damage goes through hurt(), which passes over the Flanks.

  /**
   * Called from main.js right after CombatSystem.update, before the death
   * check. Returns true when the Primary fell and the Trine caught it (a death
   * save fired or a living Flank was promoted) — main.js must then skip its
   * death path this frame.
   */
  resolveCombat() {
    if (!this.active) return false;
    if (this.act === 2) {
      // Act 2 owns every fall, the last one included: main.js's death path
      // never runs here.
      this._resolveAct2();
      return true;
    }
    this.game.graspSystem.resolveContact();
    return this._catchPrimaryDeath();
  }

  // The Primary is down. With a Flank still awake the Trine doesn't end:
  // an equipped death save gets its normal chance first, then the next awake
  // body is promoted and the old Primary goes Dormant in its corner. With
  // every other body Dormant, the Primary dies through main.js's normal path.
  _catchPrimaryDeath() {
    const primary = this.primary;
    if (!primary || primary.body.hp > 0 || this.flanks().length === 0) return false;
    if (tryDeathSave(this.game)) return true;
    this.rotate();
    this._goDormant(primary);
    this.glide = null; // the new Primary holds its ground; the apex is empty
    return true;
  }

  // A body at 0 HP lies Dormant: it stays in physics and keeps its corner of
  // the Trine, but does nothing else (flanks(), rotate() and the Grasp's
  // targeting all skip hp <= 0) until _updateDormant wakes it. Its Status
  // Effects end here, the way death ends them: a body that wakes at full HP
  // wakes clean, not still burning from the blow that put it down.
  _goDormant(member) {
    const body = member.body;
    body.hp = 0;
    body.velocity.vx = 0;
    body.velocity.vy = 0;
    body.heldItem?.cancelChargeAndReload?.();
    body.statusEffects = createPlayerStatusSlots();
    body.emberStacks = 0;
    body.emberStackTimer = 0;
    member.dormant = DORMANT_TIME;
  }

  /** How far a Dormant member is toward waking, 0 → 1 (drawTrine's fade). */
  dormantRecovery(member) {
    return 1 - member.dormant / DORMANT_TIME;
  }

  _updateDormant(deltaTime) {
    for (const member of this.members) {
      if (member.dormant <= 0) continue;
      member.dormant = Math.max(0, member.dormant - deltaTime);
      if (member.dormant === 0) member.body.hp = member.body.maxHp;
    }
  }

  // A member leaves the fight: burst, out of physics, out of every roster
  // (flanks(), rotate() and the draw all skip hp <= 0).
  _fall(member) {
    const game = this.game;
    const body = member.body;
    body.hp = 0;
    body.velocity.vx = 0;
    body.velocity.vy = 0;
    body.heldItem?.cancelChargeAndReload?.();
    game.physicsSystem.removeEntity(body);
    const burst = createExplosion(body.position.x + CELL / 2, body.position.y + CELL / 2, 20, body.color);
    game.particles.push(...burst);
    for (const particle of burst) game.physicsSystem.addEntity(particle);
  }

  // Keep the arena fed: mixed gray-zone enemies, topped up through the
  // Quagmire's live wave spawner.
  _updateWaves(deltaTime) {
    const room = this.game.currentRoom;
    if (!this.wavesEnabled) return;
    if (!room || room.enemies.length >= WAVE_FLOOR) {
      this.waveTimer = WAVE_DELAY;
      return;
    }
    this.waveTimer -= deltaTime;
    if (this.waveTimer > 0) return;
    this.waveTimer = WAVE_DELAY;
    this.game.roundCombatSystem.spawnWave(room, WAVE_SIZE);
    this.wavesSpawned++;
  }

  // Burn/poison ticks a non-Primary body's own Player.update reports (the
  // Primary's go through StatusEffectSystem.applyPlayerDot, which is
  // game.player-bound). Act 2 only: in Act 1 only the Primary takes damage,
  // so a Flank carrying a burn from its turn at the apex doesn't tick it.
  // A body burned to 0 HP falls in _resolveAct2, after its death save.
  _applyDot(member, tick) {
    if (!tick || this.act === 1) return;
    const body = member.body;
    if (tick.burnDamage) body.takeDamage(tick.burnDamage, { isBullet: false, element: 'burn', cause: DEATH_CAUSES.burn });
    if (tick.poisonDamage) body.takeDamage(tick.poisonDamage, { isBullet: false, element: 'poison', cause: DEATH_CAUSES.poison });
  }

  // A Flank faces its nearest living enemy that can be hurt (eight
  // directions, the Act 2 bodies' facingToward), so its mirrored attacks
  // fly at its own target.
  // With nothing to aim at it keeps the Primary's facing. A swing keeps the
  // facing it started with, as the Primary's does while SPACE is held.
  _aimFlank(body, lead) {
    if (PlayerInputSystem.swingHoldsFacing(body.heldItem)) return;
    const cx = body.position.x + CELL / 2;
    const cy = body.position.y + CELL / 2;
    let best = null;
    let bestDist = Infinity;
    for (const enemy of this.game._activeEnemies()) {
      if (enemy.hp <= 0 || enemy.isDying || enemy.graspRemoved || (enemy.plane ?? 0) !== 0) continue;
      // A part no blow can hurt right now (a Great Hand rising or holding)
      // isn't worth facing.
      if (enemy.isVulnerable?.() === false) continue;
      const box = enemy.getHitbox?.() ?? { x: enemy.position.x, y: enemy.position.y, width: CELL, height: CELL };
      const dx = box.x + box.width / 2 - cx;
      const dy = box.y + box.height / 2 - cy;
      const dist = Math.hypot(dx, dy);
      if (dist < bestDist) { bestDist = dist; best = { dx, dy }; }
    }
    const facing = best ? facingToward(best.dx, best.dy) : null;
    if (facing && (facing.x !== 0 || facing.y !== 0)) {
      body.facing.x = facing.x;
      body.facing.y = facing.y;
    } else {
      body.facing.x = lead.facing.x;
      body.facing.y = lead.facing.y;
    }
  }

  // rest-parity: absent because the Mist Battle only exists in its EXPLORE arena.
  update(deltaTime) {
    if (!this.active) return;
    if (this.act === 2) {
      this._updateAct2(deltaTime);
      return;
    }
    const game = this.game;
    const lead = game.player;
    const flankSpeed = PHYSICS.PLAYER_SPEED * FLANK_SPEED_MULT;
    this.clock += deltaTime;

    for (const member of this.members) {
      if (member.swapFlash > 0) member.swapFlash = Math.max(0, member.swapFlash - deltaTime);
    }
    this._updateDormant(deltaTime);
    this._mirrorDodge();
    this._updateGlide(deltaTime, flankSpeed);

    this._updateWaves(deltaTime);
    game.graspSystem.update(deltaTime);

    for (let k = 1; k < this.members.length; k++) {
      const member = this.members[(this.primaryIndex + k) % this.members.length];
      const body = member.body;
      const dormant = member.dormant > 0;
      if (body.hp <= 0 && !dormant) continue;
      if (!dormant) {
        this._applyDot(member, body.update(deltaTime));
        // Held, it's out of the Trine: no aiming, no mirrored attacks.
        if (!this.isHeld(body)) {
          this._aimFlank(body, lead);
          tickMirroredWeapon(game, body, deltaTime, this._fire);
          mirrorAutoAttack(game, body, this._fire);
        }
      }
      // A Dormant body is carried along in its corner so the Trine keeps its shape.
      if (body.dodgeRoll.active) continue; // the roll owns velocity; drift back afterward
      if (body.grabbed) continue; // a Great Hand holds it (GraspSystem)

      const slot = this._slotPosition(k);
      const dist = Math.hypot(slot.x - body.position.x, slot.y - body.position.y);
      if (dist < ARRIVE_EPSILON) {
        body.velocity.vx = 0;
        body.velocity.vy = 0;
        continue;
      }
      const speed = dist < SETTLE_RADIUS ? flankSpeed * (dist / SETTLE_RADIUS) : flankSpeed;
      steerToward(game, body, slot.x, slot.y, speed);
    }
  }
}
