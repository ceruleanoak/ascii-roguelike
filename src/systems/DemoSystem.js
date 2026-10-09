/**
 * DemoSystem — arcade attract-mode playback + dev-only input recorder.
 *
 * Playback: walks DEMO_RECORDINGS in order. Each entry declares its own
 * seed, room spec (zone/depth/boss), player startState, and an enemy
 * snapshot. Math.random is reseeded via mulberry32 so AI choices stay
 * aligned with the recording; the original Math.random is restored on
 * exit. Input is driven through game.keys / game.arrowKeys and the
 * existing handleSpacePress / handleShiftPress so the keyboard pipeline
 * runs untouched.
 *
 * Recording: when active, every keydown/keyup that reaches setupInput is
 * appended to a buffer with the current frame index. toggleRecording
 * captures the room spec, player startState, and enemy snapshot at record
 * start. Stopping prints the payload to console for paste into
 * src/data/demoRecording.js.
 *
 * World setup: setupWorld / applyStartState / applyEnemies rebuild a
 * recording's room, player and enemies. Recording (toggleRecording) and
 * playback (main.js enterDemoState) share them so world generation is
 * identical in both directions.
 */

import { DEMO_RECORDINGS } from '../data/demoRecording.js';
import { ZONES } from '../data/zones.js';
import { GAME_STATES, GRID, ROOM_TYPES } from '../game/GameConfig.js';
import { Item } from '../entities/Item.js';
import { Enemy } from '../entities/Enemy.js';

const ACTION_KEYS = new Set([' ', 'Shift', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

export class DemoSystem {
  constructor(game) {
    this.game = game;

    // Playback state
    this.playing = false;
    this.playFrame = 0;
    this.eventIndex = 0;
    this.currentIndex = 0; // index into DEMO_RECORDINGS; advances each play

    // Recording state
    this.recording = false;
    this.recordBuffer = [];
    this.recordSeed = 0;
    this.recordStartFrame = 0;
    this.recordRoomSpec = null;
    this.recordStartState = null;
    this.recordEnemies = null;
    this.globalFrame = 0;

    this._origRandom = null;
  }

  // ── PRNG ────────────────────────────────────────────────────────────────

  static mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  installSeededRandom(seed) {
    if (this._origRandom) return; // already installed
    this._origRandom = Math.random;
    Math.random = DemoSystem.mulberry32(seed);
  }

  restoreRandom() {
    if (!this._origRandom) return;
    Math.random = this._origRandom;
    this._origRandom = null;
  }

  // ── Playback ────────────────────────────────────────────────────────────

  /** Returns the recording that the next startPlayback() will play. */
  get currentRecording() {
    if (!DEMO_RECORDINGS || DEMO_RECORDINGS.length === 0) return null;
    const idx = this.currentIndex % DEMO_RECORDINGS.length;
    return DEMO_RECORDINGS[idx];
  }

  startPlayback() {
    this.recording = false;
    this.playing = true;
    this.playFrame = 0;
    this.eventIndex = 0;
    this._clearInputs();
    // Seed install is the caller's responsibility (main.js) so it can
    // sequence seed install with room generation.
  }

  stopPlayback() {
    const wasPlaying = this.playing;
    this.playing = false;
    this.playFrame = 0;
    this.eventIndex = 0;
    this.restoreRandom();
    this._clearInputs();
    // Cycle to the next recording on natural end or abort, so the next
    // TITLE idle trigger plays a different demo.
    if (wasPlaying && DEMO_RECORDINGS && DEMO_RECORDINGS.length > 0) {
      this.currentIndex = (this.currentIndex + 1) % DEMO_RECORDINGS.length;
    }
  }

  /** Advance one frame of playback. Returns true while still playing. */
  tickPlayback() {
    if (!this.playing) return false;
    const rec = this.currentRecording;
    if (!rec) return false;

    const events = rec.events;
    while (this.eventIndex < events.length && events[this.eventIndex].f <= this.playFrame) {
      this._applyEvent(events[this.eventIndex]);
      this.eventIndex++;
    }

    this.playFrame++;
    return this.playFrame < rec.durationFrames;
  }

  _applyEvent(ev) {
    const game = this.game;
    const key = ev.key;
    const down = ev.type === 'keydown';
    const lower = key.length === 1 ? key.toLowerCase() : key;

    // Movement WASD
    if (lower === 'w' || lower === 'a' || lower === 's' || lower === 'd') {
      game.keys[lower] = down;
      return;
    }

    // Space — press fires the action handler; release fires the release
    // handler so charged bows / fishing / trap throws / staff blocks all
    // resolve the same way the live keyboard pipeline resolves them.
    if (key === ' ') {
      game.keys.space = down;
      if (down) {
        if (!game.spacePressed) {
          game.spacePressed = true;
          game.handleSpacePress();
        }
      } else {
        game.spacePressed = false;
        game.handleSpaceRelease();
      }
      return;
    }

    // Shift — weapon throws (spear, etc.) charge on press and fire on
    // release. The release call is what was missing; without it, charged
    // throws would never leave the player's hand during playback.
    if (key === 'Shift') {
      game.keys.shift = down;
      if (down) {
        if (!game.shiftPressed) {
          game.shiftPressed = true;
          game.handleShiftPress();
        }
      } else {
        game.shiftPressed = false;
        game.handleShiftRelease();
      }
      return;
    }

    // Arrow keys — dodge roll direction
    if (key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight') {
      if (game.arrowKeys) game.arrowKeys[key] = down;
      return;
    }
  }

  _clearInputs() {
    const g = this.game;
    if (!g.keys) return;
    g.keys.w = g.keys.a = g.keys.s = g.keys.d = false;
    g.keys.space = g.keys.shift = g.keys.tab = false;
    g.spacePressed = false;
    g.shiftPressed = false;
    g.attackSequenceActive = false;
    if (g.arrowKeys) {
      g.arrowKeys.ArrowUp = g.arrowKeys.ArrowDown = false;
      g.arrowKeys.ArrowLeft = g.arrowKeys.ArrowRight = false;
    }
  }

  // ── Recording ───────────────────────────────────────────────────────────

  startRecording(seed = (Math.random() * 0xFFFFFFFF) >>> 0) {
    this.playing = false;
    this.recording = true;
    this.recordSeed = seed;
    this.recordBuffer = [];
    this.recordStartFrame = this.globalFrame;
    this.recordRoomSpec = null;
    this.recordStartState = null;
    this.recordEnemies = null;
    this.installSeededRandom(seed);
    console.log(`[DemoSystem] Recording started with seed=${seed}`);
  }

  /**
   * Called by toggleRecording after it has captured the room spec + player state
   * + enemy snapshot for the recording. Stored fields are emitted in the
   * stopRecording payload.
   */
  setRecordingContext({ roomSpec, startState, enemies }) {
    if (!this.recording) return;
    if (roomSpec !== undefined) this.recordRoomSpec = roomSpec;
    if (startState !== undefined) this.recordStartState = startState;
    if (enemies !== undefined) this.recordEnemies = enemies;
  }

  stopRecording() {
    if (!this.recording) return null;
    this.recording = false;
    const durationFrames = this.globalFrame - this.recordStartFrame;
    const payload = {
      name: 'recorded-' + Date.now().toString(36),
      seed: this.recordSeed,
      durationFrames,
      startState: this.recordStartState,
      room: this.recordRoomSpec,
      enemies: this.recordEnemies || [],
      events: this.recordBuffer,
    };
    this.restoreRandom();
    console.log('[DemoSystem] Recording stopped — paste this into src/data/demoRecording.js:');
    console.log(JSON.stringify(payload, null, 2));
    this.recordBuffer = [];
    this.recordRoomSpec = null;
    this.recordStartState = null;
    this.recordEnemies = null;
    return payload;
  }

  /** Called from setupInput on any keydown/keyup. */
  recordEvent(type, key) {
    if (!this.recording) return;
    // Only record keys we know how to play back.
    const lower = key.length === 1 ? key.toLowerCase() : key;
    const isMovement = (lower === 'w' || lower === 'a' || lower === 's' || lower === 'd');
    const isAction = ACTION_KEYS.has(key);
    if (!isMovement && !isAction) return;
    this.recordBuffer.push({
      f: this.globalFrame - this.recordStartFrame,
      type,
      key,
    });
  }

  /** Called every frame by main.js so recording/playback share a clock. */
  tickGlobalFrame() {
    this.globalFrame++;
  }

  // ── World setup (shared by recording and playback) ──────────────────────

  /**
   * Toggle the recorder (cheat-menu RECORD DEMO). Builds the seeded world
   * the same way playback will.
   */
  toggleRecording() {
    if (this.recording) {
      this.stopRecording();
      return;
    }
    // Capture the room spec BEFORE installing the seed so it reflects
    // where the player chose to start the recording.
    const roomSpec = this._buildRoomSpec();
    this.startRecording();
    // Regenerate the current room under the seeded RNG so playback sees
    // the same world the recording captured.
    if (this.game.stateMachine.getCurrentState() === GAME_STATES.EXPLORE) {
      this.setupWorld(roomSpec);
    }
    // Capture player + enemy snapshot AFTER the seeded regen.
    const startState = this._captureStartState();
    const enemies = this._captureEnemies();
    this.setRecordingContext({ roomSpec, startState, enemies });
  }

  /** Read current world state into a roomSpec for the active recording. */
  _buildRoomSpec() {
    const game = this.game;
    const zone = game.zoneSystem.currentZone || 'green';
    const depth = game.zoneDepths[zone] || 1;
    const boss = !!(game.currentRoom && game.currentRoom.isZoneBossRoom);
    return { zone, depth, boss };
  }

  /** Capture the player state needed to reproduce demo conditions. */
  _captureStartState() {
    const p = this.game.player;
    if (!p) return null;
    return {
      characterType: p.characterType || 'default',
      hp: p.hp,
      quickSlots: p.quickSlots.map(slot => (slot ? slot.char : null)),
      activeSlotIndex: p.activeSlotIndex || 0,
      position: { x: p.position.x, y: p.position.y },
      magicMeter: {
        active: !!p.magicMeter?.active,
        slots: Array.isArray(p.magicMeter?.slots) ? [...p.magicMeter.slots] : [],
        current: p.magicMeter?.current || 0,
        max: p.magicMeter?.max || 10,
      },
    };
  }

  /** Capture room enemies into a plain-data snapshot. */
  _captureEnemies() {
    const enemies = this.game.currentRoom?.enemies || [];
    return enemies.map(e => ({
      char: e.char,
      x: e.position.x,
      y: e.position.y,
      hp: e.hp,
    }));
  }

  /**
   * Generate the demo's room under whatever RNG is currently installed.
   * Mirrors the cheat-menu warp paths (CheatWarpSystem.handleZoneTeleport /
   * handleBossTest) but skips side effects a demo doesn't need (music
   * switches, grace timers tied to player progress).
   */
  setupWorld(roomSpec) {
    if (!roomSpec) return;
    const game = this.game;
    const zone = roomSpec.zone || 'green';
    const depth = roomSpec.depth || 1;
    const wantBoss = !!roomSpec.boss;

    // Force the zone + depth so room generation is deterministic.
    const zoneColor = ZONES[zone]?.exitColor || '#ffffff';
    game.zoneSystem.pathHistory = [
      { letter: 'X', color: zoneColor },
      { letter: 'X', color: zoneColor },
      { letter: 'X', color: zoneColor },
    ];
    game.zoneSystem.currentZone = zone;
    game.zoneDepths[zone] = depth;
    game.roomGenerator.setDepth(depth);

    // Deactivate any prior boss state before regenerating.
    game.bossSystem.deactivate();

    const playerPos = game.player
      ? { x: game.player.position.x, y: game.player.position.y }
      : { x: GRID.WIDTH / 2, y: (GRID.ROWS - 3) * GRID.CELL_SIZE };

    game.roomGenerator.isZoneBossRoom = wantBoss;
    const roomType = wantBoss ? ROOM_TYPES.BOSS : null;
    const newRoom = game.roomGenerator.generateRoom(roomType, playerPos, zone, null);
    game.roomGenerator.isZoneBossRoom = false;

    game.currentRoom = newRoom;

    if (wantBoss) {
      game.bossSystem.activate(newRoom, zone);
    }

    // Apply room-declared spawn zone so the player isn't stranded in a wall
    // after regeneration.
    if (game.player) {
      if (newRoom.spawnZones?.default) {
        game.player.position.x = newRoom.spawnZones.default.x;
        game.player.position.y = newRoom.spawnZones.default.y;
      }
      game.player.setCollisionMap(newRoom.collisionMap);
    }

    // Room-swap core, sans entry grace (demo enemies act immediately)
    game.applyRoomSwap(newRoom, { grace: false });
    // Demo rooms may pre-place ingredients; applyRoomSwap clears them
    game.ingredients = newRoom.ingredients || [];
  }

  /** Apply a demo startState snapshot onto the active player. */
  applyStartState(startState) {
    const game = this.game;
    const player = game.player;
    if (!startState || !player) return;

    if (startState.characterType && startState.characterType !== player.characterType) {
      game.applyCharacterType(startState.characterType);
    }

    if (startState.hp != null) {
      player.hp = startState.hp;
    }

    if (startState.position) {
      player.position.x = startState.position.x;
      player.position.y = startState.position.y;
      player.velocity.vx = 0;
      player.velocity.vy = 0;
    }

    if (Array.isArray(startState.quickSlots)) {
      player.quickSlots = startState.quickSlots.map(char => {
        if (!char) return null;
        return new Item(char, 0, 0);
      });
    }

    if (Number.isInteger(startState.activeSlotIndex)) {
      player.activeSlotIndex = Math.max(
        0,
        Math.min(startState.activeSlotIndex, player.quickSlots.length - 1)
      );
    }

    // Restore magic meter so wand demos can actually cast.
    if (startState.magicMeter && player.magicMeter) {
      const mm = startState.magicMeter;
      player.magicMeter.active = !!mm.active;
      player.magicMeter.slots = Array.isArray(mm.slots) ? [...mm.slots] : [];
      player.magicMeter.current = mm.current || 0;
      game.magicSystem.recalcMax(player.magicMeter);
    }
  }

  /** Replace the current room's enemies with a demo snapshot. */
  applyEnemies(enemiesSnapshot) {
    const game = this.game;
    if (!Array.isArray(enemiesSnapshot) || enemiesSnapshot.length === 0) return;
    if (!game.currentRoom) return;

    const depth = game.zoneDepths[game.zoneSystem.currentZone] || 1;
    const newEnemies = enemiesSnapshot.map(snap => {
      const e = new Enemy(snap.char, snap.x, snap.y, depth);
      if (snap.hp != null) e.hp = snap.hp;
      return e;
    });

    // Drop previous enemies from physics, then install the snapshot ones.
    // Demo rooms are surface rooms built by setupWorld, so the surface list
    // is the right target here (generation code, not combat routing).
    for (const old of game.currentRoom.enemies) { // layer-guard-ok: demo room is a freshly generated surface room
      game.physicsSystem.removeEntity?.(old);
    }
    game.currentRoom.enemies = newEnemies; // layer-guard-ok: demo room is a freshly generated surface room
    game.wireRoomEnemies(game.currentRoom);
    for (const e of newEnemies) {
      game.physicsSystem.addEntity(e);
    }
  }
}
