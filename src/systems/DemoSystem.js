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
 * appended to a buffer with the current frame index. main.js captures the
 * room spec, player startState, and enemy snapshot at record start and
 * passes them in via setRecordingContext. Stopping prints the payload to
 * console for paste into src/data/demoRecording.js.
 */

import { DEMO_RECORDINGS } from '../data/demoRecording.js';

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
    g.keys.space = g.keys.shift = g.keys.tab = g.keys.v = false;
    g.spacePressed = false;
    g.shiftPressed = false;
    g.vPressed = false;
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
   * Called by main.js after it has captured the room spec + player state
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
}
