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
async function loadGameClass() {
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
  await server.close();
  return mod.Game;
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

// Terminal-state baselines: each reset path lands the game somewhere specific,
// so the reference instance is driven to THAT state on a virgin run — otherwise
// every legitimate consequence of "a playable REST exists" reads as drift.
const BASELINES = {
  enterTitleState: (game) => { /* constructor already parks at TITLE */ },
  _resetRunToRest: (game) => { game.enterRestState(); tick(game, 20); },
};

async function main() {
  console.log('Bootstrapping Game via Vite SSR...');
  const Game = await loadGameClass();

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
  console.log('\nSummary:', results.map(r => `${r.resetName}: ${r.count}`).join(' | '));
  if (failing.length) {
    console.error('\nReset drift found. Fix the missed clears (or justify an IGNORE entry in tools/check-reset-parity.mjs).');
    process.exit(1);
  }
  console.log('Reset parity ok.');
}

main().catch(err => { console.error(err); process.exit(1); });
