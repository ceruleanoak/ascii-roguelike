#!/usr/bin/env node
// Reset-parity harness — enforcement for the run-scoped reset contract
// (ADR backlog 2026-08-24; bugs #198/#196/#100/#86/#13 family).
//
// Every field that should die on death/title/room-exit must be cleared by one
// of the hand-maintained reset lists (enterTitleState, _resetRunToRest,
// InteriorManager.reset, ...). Nothing today detects a missed entry — the bug
// corpus shows the misses surface months later as player reports. This tool
// makes the contract mechanical:
//
//   instance A: fresh Game -> snapshot
//   instance B: fresh Game -> driven through REST/EXPLORE + gameplay dirt
//               -> reset path under test -> snapshot
//   diff(A, B): every surviving difference is state the reset failed to clear
//               or nondeterminism; both need triage into either a fix or the
//               documented ignore list below.
//
// Run: node tools/check-reset-parity.mjs [--update-baseline]
// Exit 0 = no unignored drift. Not wired into build (needs a few seconds of
// Vite SSR bootstrapping); intended for pre-commit runs after touching any
// reset path or adding run-scoped state.

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// ── Browser environment stubs ───────────────────────────────────────────────
// Just enough DOM for Game's constructor; canvases render nothing, listeners
// are recorded but never fired, audio/network fail fast and quiet.

function makeElement(id) {
  const el = {
    id,
    width: 480, height: 480,
    clientWidth: 480, clientHeight: 480,
    offsetWidth: 480, offsetHeight: 480,
    parentElement: parentStub,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 480, height: 480 }),
    style: {},
    textContent: '', innerHTML: '',
    classList: { add() {}, remove() {}, toggle() {} },
    getContext: () => makeCtx(el),
    addEventListener() {}, removeEventListener() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 480, height: 480 }),
  };
  return el;
}

const elementCache = new Map();
// Shared stand-in parent so DOM-walking code (MenuSystem._fitStatusBar) finds
// a real clientWidth/getBoundingClientRect chain.
const parentStub = {
  clientWidth: 480, clientHeight: 48,
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 480, height: 48 }),
};
globalThis.document = {
  getElementById: (id) => {
    if (!elementCache.has(id)) elementCache.set(id, makeElement(id));
    return elementCache.get(id);
  },
  createElement: (tag) => makeElement(tag),
  addEventListener() {},
  removeEventListener() {},
  fonts: { ready: Promise.resolve(), add: () => {} },
};

const windowListeners = {};
globalThis.window = {
  addEventListener(type, fn) { (windowListeners[type] ??= []).push(fn); },
  removeEventListener() {},
  dispatchEvent: () => true,
  devicePixelRatio: 1,
  innerWidth: 480, innerHeight: 480,
  location: { href: 'http://localhost/' },
};
globalThis.requestAnimationFrame = () => 1;
globalThis.cancelAnimationFrame = () => {};
globalThis.fetch = async () => { throw new Error('check-reset-parity: network disabled'); };
// ASCIIRenderer monkey-patches alpha quantization onto CanvasRenderingContext2D's
// prototype descriptors; provide a stand-in class so the descriptor reads work.
class StubCanvasRenderingContext2D {
  get globalAlpha() { return this._ga ?? 1; }
  set globalAlpha(v) { this._ga = v; }
}
Object.defineProperty(StubCanvasRenderingContext2D.prototype, 'fillStyle', {
  get() { return this._fs; }, set(v) { this._fs = v; }, configurable: true,
});
Object.defineProperty(StubCanvasRenderingContext2D.prototype, 'strokeStyle', {
  get() { return this._ss; }, set(v) { this._ss = v; }, configurable: true,
});
globalThis.CanvasRenderingContext2D = StubCanvasRenderingContext2D;
// Our ctx proxy instances must inherit from the stub prototype so the
// quantization getters/setters find the underlying accessors.
function makeCtx(canvas) {
  const ctx = new StubCanvasRenderingContext2D();
  ctx.canvas = canvas;
  ctx.measureText = () => ({ width: 8 });
  ctx.createLinearGradient = () => ({ addColorStop: () => {} });
  ctx.createRadialGradient = () => ({ addColorStop: () => {} });
  ctx.getImageData = () => ({ data: new Uint8ClampedArray(4) });
  return new Proxy(ctx, {
    get(t, k) {
      if (k in t) return typeof t[k] === 'function' ? t[k].bind(t) : t[k];
      const desc = Object.getOwnPropertyDescriptor(StubCanvasRenderingContext2D.prototype, k);
      if (desc?.get) return desc.get.call(t);
      return () => undefined; // every draw call is a no-op
    },
    set(t, k, v) {
      const desc = Object.getOwnPropertyDescriptor(StubCanvasRenderingContext2D.prototype, k);
      if (desc?.set && !Object.prototype.hasOwnProperty.call(t, k)) { desc.set.call(t, v); return true; }
      t[k] = v; return true;
    },
  });
}

// ASCIIRenderer-style quantization aside, AudioSystem constructs a real
// AudioContext lazily on first title-music load; give it a shape-complete
// stub so headless runs stay silent without crashing.
function makeAudioParam() {
  const t = { value: 0 };
  return new Proxy(t, {
    get(o, k) {
      if (k === 'value') return o.value;
      if (k in o && typeof o[k] === 'function') return o[k].bind(o);
      return () => undefined;
    },
    set(o, k, v) { o[k] = v; return true; },
  });
}
function makeAudioNode(extra = {}) {
  const node = {
    connect: (x) => x ?? node,
    disconnect: () => {},
    start: () => {}, stop: () => {},
    ...extra,
  };
  return new Proxy(node, {
    get(o, k) {
      if (k in o) return typeof o[k] === 'function' ? o[k].bind(o) : o[k];
      o[k] = makeAudioParam();
      return o[k];
    },
    set(o, k, v) { o[k] = v; return true; },
  });
}
class StubAudioContext {
  constructor() { this.currentTime = 0; this.state = 'running'; this.sampleRate = 44100; this.destination = makeAudioNode(); }
  resume() { return Promise.resolve(); }
  suspend() { return Promise.resolve(); }
  close() { return Promise.resolve(); }
  createBuffer(channels, length) { return { length, duration: 0, sampleRate: this.sampleRate, getChannelData: () => new Float32Array(length || 1) }; }
  decodeAudioData(buffer) { return Promise.resolve(this.createBuffer(1, 1)); }
  createBufferSource() { return makeAudioNode({ buffer: null, loop: false, onended: null }); }
  createGain() { return makeAudioNode(); }
  createBiquadFilter() { return makeAudioNode(); }
  createDynamicsCompressor() { return makeAudioNode(); }
  createStereoPanner() { return makeAudioNode(); }
  createOscillator() { return makeAudioNode(); }
}
globalThis.window.AudioContext = StubAudioContext;
globalThis.window.webkitAudioContext = StubAudioContext;

// ── Deterministic RNG so both instances see identical generation ───────────
function seededRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
let realRandom;
function seedAll(seed) { realRandom = Math.random; Math.random = seededRandom(seed); }
function unseed() { Math.random = realRandom; }

// ── Snapshot / diff ─────────────────────────────────────────────────────────
const MAX_DEPTH = 8;

function serialize(value, path, depth, seen, out) {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'function') out[path] = '[fn]';
    else out[path] = value;
    return;
  }
  if (depth >= MAX_DEPTH) { out[path] = '[depth]'; return; }
  if (seen.has(value)) { out[path] = '[circular]'; return; }
  seen.add(value);
  if (value instanceof Set) {
    [...value].map((v, i) => serialize(v, `${path}[${i}]`, depth + 1, seen, out));
    return;
  }
  if (value instanceof Map) {
    [...value.entries()].map(([k, v], i) => serialize(v, `${path}[${String(k)}]`, depth + 1, seen, out));
    return;
  }
  // Arrays and plain/class objects alike: enumerate own enumerable keys.
  for (const k of Object.keys(value)) {
    try {
      serialize(value[k], `${path}.${k}`, depth + 1, seen, out);
    } catch {
      out[`${path}.${k}`] = '[throw]';
    }
  }
}

function snapshot(game, label) {
  const flat = {};
  serialize(flattenRoot(game), label, 0, new Set(), flat);
  return flat;
}

// Root fields only (skip the ~90 system instances' full subtrees twice over by
// keeping them but letting depth caps bound work — they hold most state).
function flattenRoot(game) { return game; }

// Paths that legitimately differ between two instances or carry no reset
// semantics. Each entry needs a reason; keep this list short and honest.
const IGNORE = [
  /runId$/,                       // newRunId() per run by design
  /\.gameLoop\./,                 // wall-clock loop internals (lastTime/accumulator)
  /_enemyTickFrame$|_lastDriveFrame$|_driveWarningShown$/, // tick-ledger bookkeeping
  /\.keyFlashMap\./,              // performance.now() timestamps
  /runTimerSystem\.(startTime|elapsed)/,                   // wall clock
  /\.demoSystem\.recording/,     // recording buffers accumulate only via cheat UI
  /^x\.roomEntry(X|Y|GraceTimer)$/,        // overwritten by the next applyRoomSwap; self-healing
  /^x\.titleIdleTimer$/,                    // title-screen blink accumulator (wall-time scratch)
  /^x\.inventorySystem\.activeEffectTimers\.\d+$/, // array-length churn beyond equipped slots
];

// ── Registry coverage — Step 4 (plan §6 edit 2) ─────────────────────────────
// UNREGISTERED_ALLOWLIST: sibling to IGNORE, same "each entry needs a reason"
// discipline. This is the FR5 escape hatch for game.*/player.* own-properties
// that are legitimately out of scope for resetRegistry.js (PRD Non-Goals:
// fields already encapsulated behind a system's own reset method, or
// intentionally-persistent state like cheat/debug flags) rather than a real
// registration gap. Populated by actually running checkRegistryCoverage()
// and triaging what it flagged (plan §7 Step 4) — every entry below was
// looked at, not blanket-added.
//
// Class instances whose constructor name ends in System/Manager/Menu/
// Renderer/Machine/Loop/Controller, and UPPER_SNAKE_CASE constant names, are
// matched structurally in checkRegistryCoverage() itself (plan §6 edit 3) —
// they do NOT need an entry here.
const UNREGISTERED_ALLOWLIST = [
  // DOM / live-input handles — not reset state, they're I/O plumbing that
  // outlives any run/title/room boundary by definition.
  /^ui$/,
  /^keys$/,
  /^arrowKeys$/,
  /^keyBuffer$/,
  /^keyFlashMap$/,
  // Raw per-frame input-down booleans — same category as `keys`/`arrowKeys`
  // above (SPACE/SHIFT/V key-down state), not run-scoped data.
  /^spacePressed$/,
  /^shiftPressed$/,
  /^vPressed$/,

  // Generator instances — same Non-Goals category as System/Manager
  // instances (their INTERNAL state is out of scope; only the game.*
  // fields a call reaches via `covers` are in scope). RoomGenerator and
  // DungeonFloorGenerator don't match the System$/Manager$/etc. structural
  // exemption's naming convention, so they need an explicit entry here
  // rather than broadening that regex for two known instances.
  /^roomGenerator$/,
  /^dungeonFloorGenerator$/,

  // Whole-entity Player fields. `player` itself is deliberately NOT registry
  // material (plan §4 ordering-dependency #2: `this.player = null` stays
  // inline in enterTitleState, after applyReset runs, so every player.*
  // entry sees a live owner). Every `player.*` sub-path is likewise out of
  // scope for TWO independent reasons, either of which is sufficient: (1)
  // `player.reset()` is itself a Non-Goals-exempt method-backed reset
  // (PRD Non-Goals explicitly names it alongside zoneSystem.resetOnDeath/
  // InteriorManager.reset/every *.hardReset() — "these keep their existing
  // internal logic and ownership... not to inline their internals as table
  // entries") and verifiably does clear the large majority of Player's own
  // fields (read in full at src/entities/Player.js:965-1130); and (2), more
  // fundamentally, `enterRestState()` UNCONDITIONALLY reconstructs
  // `this.player = new Player(...)` on every entry to REST (main.js:1278) —
  // which every path back to REST (title, death, character swap) passes
  // through — so the OLD Player object (and every field on it) is discarded
  // wholesale regardless of what resetRegistry.js does or doesn't clear on
  // it. Registering the ~140 individual player.* fields would duplicate
  // Player's own constructor/reset() literals for no enforcement benefit.
  /^player$/,
  /^player\..+$/,

  // InteriorManager-owned fields were allowlisted here pending plan Step 6.
  // Step 6 landed: resetRegistry.js now has a room-scoped `interiorManager.reset`
  // entry whose `covers` array lists activeFloor/mazeInterior/dungeonFloors/
  // dungeonCurrentFloor/dungeonKeySkullFloor/dungeonKeyUsedThisRun/
  // dungeonRareItemObtainedThisRun/dungeonTemplatesUsedThisRun (plus the
  // player.* interior fields) — registeredPaths() now exempts them via that
  // `covers` list, so these regexes are redundant and removed.

  // Explicitly documented intentional persistence — main.js:1187: "Note:
  // exitPathHistory persists for future secret pattern tracking." This is
  // the PRD Non-Goals "intentionally-persistent" carve-out in its own words,
  // already written into the code before this harness change existed.
  /^exitPathHistory$/,

  // Death-event output, already nulled by enterGameOverState() (main.js
  // ~2261-2264) at the moment of death — BEFORE _resetRunToRest ever runs.
  // Not reachable-dirty from TITLE either, since TITLE is only reached from
  // boot or the arcade demo (neither sets these) — same "invisible in
  // practice" fact the plan's §0.1 audit already relied on for a different
  // field set.
  /^cleanseWave$/,
  /^bossDefeatFlash$/,
  /^pendingZoneMusicResume$/,

  // Per-frame scratch, recomputed every tick from live world state.
  // `activeNoiseSource` is now registered directly at `room` scope in
  // resetRegistry.js (Step 6), so its allowlist entry is removed — kept here
  // only as a note that it's still per-frame-recomputed in practice, and the
  // registry entry is a defensive room-transition clear on top of that.

  // Menu-state compromise cluster — CLAUDE.md "Architectural Compromises"
  // names this explicitly: menu state lives on `game` and every renderer
  // reads it directly; it is UI-selection scratch re-derived by MenuSystem
  // on the next open, not run-scoped data that needs a clear-on-reset entry.
  // `bridgeMenuOpen` (RidgeSystem's own open/close flag, auto-closed on
  // distance/interaction, main.js:2973/4215) is the same shape but is now
  // registered directly at `room` scope in resetRegistry.js (Step 6), so its
  // allowlist entry is removed.
  /^menuOpen$/,
  /^menuItems$/,
  /^selectedMenuIndex$/,
  /^menuColumns$/,
  /^disabledColumns$/,
  /^currentMenuSlot$/,
  /^selectedWeaponSlotIndex$/,
  /^selectedColumn$/,

  // attackSequenceActive is cleared synchronously within the same
  // input-handler pass that sets it true (handleSpaceRelease zeroes it
  // unconditionally, main.js:4102) — never a multi-frame, let alone
  // multi-run, carry.
  /^attackSequenceActive$/,

  // screenFade — in-flight screen-transition scratch owned/driven by
  // ScreenFadeSystem; self-clearing when the fade completes, not gameplay
  // state that survives across a reset boundary in any meaningful sense.
  /^screenFade$/,

  // roomPreviews — rebuilt wholesale (`this.roomPreviews =
  // this.roomGenerator.preloadRoomPreviews()`, main.js:2291) on demand, the
  // same "regenerable root" shape as currentRoom/items/ingredients (which
  // ARE registered) — but roomPreviews is keyed by exit direction, not a
  // per-room entity list, and every reader already guards with `|| {}`-style
  // fallbacks for the pre-populated state.
  /^roomPreviews$/,

  // Cosmetic/feedback animation timers — every one of these is a
  // self-healing accumulator that free-runs every frame regardless of reset
  // (same category as `titleIdleTimer`, IGNOREd above, and
  // `_hotSpringSteamTimer`/`_sharkLastDodgeInput` below): a stale leftover
  // value only ever shifts *when* the next blink/pulse/hint animation fires,
  // never *whether* gameplay state is correct.
  /^previewBlinkTimer$/,
  /^previewBlinkState$/,
  /^waveSfxTimer$/,
  /^glitterTimer$/,
  /^inactivityTimer$/,
  /^wasdBlinkTimer$/,
  /^wasdBlinkState$/,
  // pathAnnouncement/pathAnnouncementTimer are a paired display-text +
  // countdown: every read site (RestRenderer.js:687) gates on
  // `pathAnnouncementTimer > 0` before ever looking at the text, so a stale
  // `pathAnnouncement` string with an expired timer is unobservable — same
  // self-healing shape as the other timer-paired fields above.
  /^pathAnnouncement$/,
  /^pathAnnouncementTimer$/,
  /^dodgeBlockedFeedbackTimer$/,

  // Debug/cheat toggles — intentionally persistent across resets (the same
  // reason cheatMenu.godMode survives a run reset per resetRegistry.js's
  // `cheatUsed` entry comment); these are player-facing dev conveniences,
  // not gameplay state.
  /^showVectors$/,
  /^particleFireworks$/,
  /^_fwTimer$/,
  /^_fwIndex$/,

  // Per-frame scratch — recomputed every tick from live world state, never
  // read before being written that same frame; nothing "resets" a value
  // that has no meaning between frames.
  /^previousPlayerPosition$/,
  /^_enemyTickFrame$/,
  /^_hotSpringSteamTimer$/,
  /^_sharkLastDodgeInput$/,
  /^captiveInteractionThisFrame$/,
];

/**
 * checkRegistryPathsResolve(game, RESET_REGISTRY) — plan §6 edit 4. For every
 * registry entry, verifies `entry.path` resolves to a real, existing
 * property somewhere on the live Game/Player object graph — catches a typo'd
 * or stale path (a rename that didn't update the table, a field that died
 * with a refactor) that would otherwise silently no-op forever inside
 * applyReset()'s skip-on-missing-owner behavior.
 *
 * Mirrors resetRegistry.js's own resolveEntryOwner() path-walking rules (a
 * leading 'player' segment resolves through game.player) but checks
 * PROPERTY EXISTENCE via the `in` operator rather than "is the current value
 * non-null" — a registered path pointing at a currently-null/false/0 field
 * must not be reported as broken, and `in` also finds prototype methods
 * (e.g. 'zoneSystem.resetOnDeath') that a plain value-walk would miss.
 *
 * Returns an array of { path, reason } for every entry that failed to
 * resolve. An empty array is the only passing result — this check is a HARD
 * FAILURE from day one per the task brief: it can only ever fire on a
 * registry bug (typo, stale rename), never on legitimately-persistent state,
 * so there is no rollout-warning tier for it the way there is for coverage.
 */
function checkRegistryPathsResolve(game, RESET_REGISTRY) {
  const failures = [];
  for (const entry of RESET_REGISTRY) {
    const segments = entry.path.split('.');
    let owner;
    let ownerSegments;
    if (segments[0] === 'player') {
      if (game.player == null) continue; // same skip rule as applyReset itself
      owner = game.player;
      ownerSegments = segments.slice(1);
    } else {
      owner = game;
      ownerSegments = segments;
    }
    if (ownerSegments.length === 0) {
      failures.push({ path: entry.path, reason: 'malformed path: nothing after "player."' });
      continue;
    }
    let broke = false;
    for (let i = 0; i < ownerSegments.length - 1; i++) {
      if (owner == null || !(ownerSegments[i] in owner)) {
        failures.push({
          path: entry.path,
          reason: `missing intermediate owner "${ownerSegments.slice(0, i + 1).join('.')}"`,
        });
        broke = true;
        break;
      }
      owner = owner[ownerSegments[i]];
    }
    if (broke) continue;
    const last = ownerSegments[ownerSegments.length - 1];
    if (owner == null || !(last in owner)) {
      failures.push({ path: entry.path, reason: `property "${last}" does not exist on its owner` });
    }
  }
  return failures;
}

/**
 * checkRegistryCoverage(game, registered) — plan §6 edit 3. Runs once
 * against a REST-baseline fresh instance (so `player` exists and every
 * player.* candidate path is reachable). Enumerates every own-property on
 * `game` plus every own-property on `game.player` (mapped to `player.*`),
 * and reports anything that is neither:
 *   (a) a registered path (registeredPaths() — an entry's own `path`, or a
 *       path listed in some entry's `covers`),
 *   (b) an IGNORE hit (the harness's existing deep-diff ignore list), nor
 *   (c) an UNREGISTERED_ALLOWLIST hit, nor
 *   (d) structurally exempt: a class instance whose constructor name ends in
 *       System/Manager/Menu/Renderer/Machine/Loop/Controller (system/
 *       orchestrator objects — reset behavior for their INTERNALS is out of
 *       scope per the PRD's Non-Goals; only the game.* / player.* fields a
 *       system's call clears via `covers` are in scope), or an
 *       UPPER_SNAKE_CASE constant name (module-level constants, not state).
 *
 * Returns the remainder as unregistered[] — every candidate that isn't one
 * of the above and therefore needs either a new registry row or a reasoned
 * UNREGISTERED_ALLOWLIST entry.
 */
function checkRegistryCoverage(game, registered) {
  const SYSTEM_LIKE = /(System|Manager|Menu|Renderer|Machine|Loop|Controller)$/;
  const UPPER_SNAKE = /^[A-Z][A-Z0-9_]*$/;

  function isExempt(path, value) {
    if (registered.has(path)) return true;
    if (IGNORE.some((re) => re.test(path))) return true;
    if (UNREGISTERED_ALLOWLIST.some((re) => re.test(path))) return true;
    const lastSegment = path.split('.').pop();
    if (UPPER_SNAKE.test(lastSegment)) return true;
    if (value != null && typeof value === 'object' && SYSTEM_LIKE.test(value.constructor?.name ?? '')) return true;
    return false;
  }

  const unregistered = [];
  for (const key of Object.keys(game)) {
    if (!isExempt(key, game[key])) unregistered.push(key);
  }
  if (game.player) {
    for (const key of Object.keys(game.player)) {
      const path = `player.${key}`;
      if (!isExempt(path, game.player[key])) unregistered.push(path);
    }
  }
  return unregistered;
}

// null and undefined both mean "unset" for contract purposes — an explicit
// null write during a consumed transition is not drift.
function sameUnset(a, b) {
  const unset = v => v === undefined || String(v) === 'null' || v === '[fn]';
  return unset(a) && unset(b);
}

function diffSnapshots(a, b, limit = 120) {
  const problems = [];
  const paths = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const p of paths) {
    if (IGNORE.some(re => re.test(p))) continue;
    if (sameUnset(a[p], b[p])) continue;
    if (String(a[p]) !== String(b[p])) problems.push({ path: p, fresh: a[p], postReset: b[p] });
  }
  return problems;
}

// ── Instance construction + driving ────────────────────────────────────────
// loadGameAndRegistry() — Step 4 (plan §6 edit 1): the harness now also needs
// the registry module (registeredPaths/RESET_REGISTRY) to cross-check against
// live Game/Player state. It is SSR-loaded through the SAME Vite dev server
// as Game, before the server closes — required, not optional, because
// resetRegistry.js is ESM that may transitively touch import.meta.env
// (via src/data/zones.js et al.), which only resolves correctly inside Vite's
// module graph, not via a plain Node import.
async function loadGameAndRegistry() {
  const exposeGame = {
    name: 'expose-game-for-parity',
    enforce: 'post',
    transform(code, id) {
      if (id.endsWith('src/main.js')) return `${code}\nexport { Game };`;
      return null;
    },
  };
  const server = await createServer({
    root,
    logLevel: 'error',
    server: { middlewareMode: true },
    plugins: [exposeGame],
  });
  const mod = await server.ssrLoadModule('/src/main.js');
  const registryMod = await server.ssrLoadModule('/src/game/resetRegistry.js');
  await server.close();
  return { Game: mod.Game, registryMod };
}

function construct(Game, seed) {
  seedAll(seed);
  try { return new Game(); } finally { unseed(); }
}

const DT = 1 / 60;
function tick(game, n) {
  for (let i = 0; i < n; i++) {
    try { game.update(DT); } catch (err) { console.error(`[drive] update threw: ${err.message}`); break; }
  }
}

function driveThroughRun(game) {
  // REST: creates the player + hub room, banks nothing yet.
  game.enterRestState();
  tick(game, 20);
  // Real pickup path sets pickupMessage/pickupMessageTimer/pickupMessageQueue
  // (the exact #198 dirt that used to survive TITLE).
  game.menuSystem?.showPickupMessage?.('↑');
  tick(game, 5);
  // EXPLORE: generates a room, spawns enemies/combat machinery, ticks it.
  game.enterExploreState('north');
  tick(game, 45);
  // A second pickup mid-EXPLORE exercises the queue shape.
  game.menuSystem?.showPickupMessage?.('/');
  tick(game, 3);
}

// ── Contract-surface classification ────────────────────────────────────────
// TIER 1 (must match fresh after a completed reset): run-scoped fields on the
// Game root plus the shallow state of systems whose whole job is owning
// run/player state (InventorySystem, ZoneSystem, CharacterSystem,
// InteriorManager). Everything else is TIER 2 (counted, informational):
//   - session/scratch subsystems (render caches, audio buffers, physics
//     scratch, generator caches recomputed per room)
//   - regenerable world containers (currentRoom and floor-entity lists) —
//     every state entry rebuilds them with fresh RNG, so they can never
//     byte-match a seeded fresh instance even when correctly cleared.
const SESSION_SYSTEMS = new Set([
  'renderer', 'renderController', 'audioSystem', 'gameLoop', 'physicsSystem',
  'roomGenerator', 'cameraZoomSystem', 'demoSystem', 'menuSystem', 'cheatMenu',
  'persistenceSystem', 'ui', 'exitSystem', 'runTimerSystem', 'huntingSystem',
]);
const CONTRACT_OWNERS = new Set([
  'inventorySystem', 'zoneSystem', 'characterSystem', 'interiorManager',
]);
// Root fields rebuilt wholesale on every state entry — surviving one reset is
// meaningless because entry overwrites them anyway.
const REGENERABLE_ROOTS = new Set([
  'currentRoom', 'items', 'ingredients', 'captives', 'characterNPCs',
  'neutralCharacters', 'placedTraps', 'inFlightTraps', 'playerTongueAttacks',
]);

function contractSurface(path) {
  const parts = path.split('.');
  const head = parts[1];
  if (!head || /^[0-9]+$/.test(head)) return false;
  // Session/scratch churn anywhere along the path disqualifies (e.g.
  // combatSystem.audioSystem._musicLoadId — audio rides inside combatSystem).
  if (parts.some(seg => SESSION_SYSTEMS.has(seg))) return false;
  if (REGENERABLE_ROOTS.has(head)) return false;
  if (CONTRACT_OWNERS.has(head)) return parts.length <= 4;
  return parts.length <= 2; // plain root field (incl. scalar-object roots like roomPreviews)
}

const LIMIT = 120;
const VERBOSE = process.argv.includes('--verbose');
// --warn-registry: downgrade checkRegistryCoverage() from hard-fail to a
// printed-but-non-fatal warning. Plan §6 edit 5 / §7 Step 4: this exists for
// the triage pass itself (Step 4) so the list can be inspected without the
// harness refusing to finish; once the coverage list is fully triaged (every
// live field either registered or in UNREGISTERED_ALLOWLIST), the default
// (no flag) hard-fails, matching checkRegistryPathsResolve's day-one hard
// failure and the repo's check:data convention ("pre-existing debt is
// allowlisted warns; NEW violations fail").
const WARN_REGISTRY = process.argv.includes('--warn-registry');

// Terminal-state baselines: each reset path lands the game somewhere specific,
// so the reference instance is driven to THAT state on a virgin run — otherwise
// every legitimate consequence of "a playable REST exists" reads as drift.
const BASELINES = {
  enterTitleState: (game) => { /* constructor already parks at TITLE */ },
  _resetRunToRest: (game) => { game.enterRestState(); tick(game, 20); },
};

async function main() {
  console.log('Bootstrapping Game via Vite SSR...');
  const { Game, registryMod } = await loadGameAndRegistry();
  const { RESET_REGISTRY, registeredPaths } = registryMod;

  const results = [];
  for (const [resetName, baselineDrive] of Object.entries(BASELINES)) {
    seedAll(1337); unseed(); // warm RNG-independent caches identically
    const fresh = construct(Game, 20260824);
    const dirty = construct(Game, 20260824);
    baselineDrive(fresh);
    baselineDrive(dirty);
    driveThroughRun(dirty);
    seedAll(99); // deterministic-ish during reset itself
    try { dirty[resetName](); } finally { unseed(); }

    const a = snapshot(fresh, 'x');
    const b = snapshot(dirty, 'x');
    const problems = diffSnapshots(a, b);

    // Two tiers: the reset CONTRACT SURFACES (run-scoped fields on game +
    // its state-owning systems) must be identical; deeper subsystem churn
    // (render caches, physics scratch, audio buffers) is counted only.
    const contract = problems.filter(({ path }) => contractSurface(path));
    console.log(`\n=== reset path: ${resetName}() — ${contract.length} contract-surface drift(s), ${problems.length} total ===`);
    for (const { path, fresh: f, postReset: r } of contract.slice(0, LIMIT)) {
      const fmt = v => (typeof v === 'string' ? JSON.stringify(v).slice(0, 70) : String(v)?.slice(0, 70));
      console.log(`  ${path}\n      fresh=${fmt(f)}  postReset=${fmt(r)}`);
    }
    if (contract.length > LIMIT) console.log(`  ...and ${contract.length - LIMIT} more`);
    if (VERBOSE && problems.length) {
      const rest = problems.filter(p => !contractSurface(p.path)).map(p => p.path);
      console.log('  [non-contract drift, informational:]');
      for (const path of rest.slice(0, 60)) console.log(`    · ${path}`);
      if (rest.length > 60) console.log(`    ...and ${rest.length - 60} more`);
    }
    results.push({ resetName, count: contract.length });
  }

  const failing = results.filter(r => r.count > 0);

  // ── Registry cross-checks — Step 4 (plan §6) ──────────────────────────────
  // Run once against a fresh instance driven to the same REST baseline used
  // above for _resetRunToRest, so `game.player` exists and every `player.*`
  // registry path / candidate is reachable.
  seedAll(1337); unseed();
  const regInstance = construct(Game, 20260824);
  regInstance.enterRestState();
  tick(regInstance, 20);

  const pathFailures = checkRegistryPathsResolve(regInstance, RESET_REGISTRY);
  console.log(`\n=== registry paths resolve — ${pathFailures.length} broken entr${pathFailures.length === 1 ? 'y' : 'ies'} ===`);
  for (const { path, reason } of pathFailures) {
    console.log(`  ${path}\n      ${reason}`);
  }
  const pathsOk = pathFailures.length === 0;

  const registered = registeredPaths();
  const unregistered = checkRegistryCoverage(regInstance, registered);
  console.log(`\n=== registry coverage — ${unregistered.length} unregistered live field(s), ${UNREGISTERED_ALLOWLIST.length} allowlisted ===`);
  for (const path of unregistered.slice(0, LIMIT)) console.log(`  · ${path}`);
  if (unregistered.length > LIMIT) console.log(`  ...and ${unregistered.length - LIMIT} more`);
  const coverageOk = unregistered.length === 0;

  console.log(
    '\nSummary:',
    results.map(r => `${r.resetName}: ${r.count}`).join(' | '),
    `| registryPathsResolve: ${pathsOk ? 'ok' : `${pathFailures.length} broken`}`,
    `| registryCoverage: ${coverageOk ? 'ok' : `${unregistered.length} unregistered${WARN_REGISTRY ? ' (warn)' : ''}`}`
  );

  // checkRegistryPathsResolve is a hard failure unconditionally (task brief:
  // "not a soft warning" — it can only fire on an actual registry bug).
  if (!pathsOk) {
    console.error('\nRegistry path(s) do not resolve against a live Game/Player instance. Fix the stale/typo\'d path(s) in src/game/resetRegistry.js.');
  }
  // checkRegistryCoverage hard-fails by default (plan §6 edit 5); --warn-registry
  // downgrades it to informational for the Step 4 triage pass only.
  if (!coverageOk && !WARN_REGISTRY) {
    console.error('\nUnregistered live field(s) found. Add a resetRegistry.js entry, or a reasoned UNREGISTERED_ALLOWLIST entry in tools/check-reset-parity.mjs (or pass --warn-registry to triage without failing).');
  } else if (!coverageOk && WARN_REGISTRY) {
    console.warn('\n[--warn-registry] Unregistered live field(s) found (see above) — not failing the build while this flag is set.');
  }

  if (failing.length || !pathsOk || (!coverageOk && !WARN_REGISTRY)) {
    if (failing.length) {
      console.error('\nReset drift found. Fix the missed clears (or justify an IGNORE entry in tools/check-reset-parity.mjs).');
    }
    process.exit(1);
  }
  console.log('Reset parity ok.');
  // Explicit exit: stubbed systems schedule real Node timers (audio stall
  // watchdog etc.) that would otherwise hold the event loop open.
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
