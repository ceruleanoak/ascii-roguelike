// Headless Game boot — shared by the tools that drive the real Game in Node
// (check-reset-parity, check-dungeon-warps). Importing this module installs
// just enough browser surface for Game's constructor: canvases render
// nothing, listeners are recorded but never fired, audio/network fail fast
// and quiet. Then loadGame() SSR-loads src/main.js through Vite so
// import.meta.env and the rest of the module graph resolve as in the browser.

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

export const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// ── Browser environment stubs ───────────────────────────────────────────────
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
globalThis.fetch = async () => { throw new Error('headless-game: network disabled'); };
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

// ── Deterministic RNG ──────────────────────────────────────────────────────
function seededRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
let realRandom;
export function seedAll(seed) { realRandom = Math.random; Math.random = seededRandom(seed); }
export function unseed() { Math.random = realRandom; }

// ── Module loading ─────────────────────────────────────────────────────────
// Game is not exported from main.js; a post transform appends the export.
// Every extra module is SSR-loaded through the SAME Vite server before it
// closes — a plain Node import would miss import.meta.env and give a second,
// disconnected copy of shared module state (registries, singletons).
export async function loadGame(extraModules = []) {
  const exposeGame = {
    name: 'expose-game-for-headless',
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
  try {
    const mod = await server.ssrLoadModule('/src/main.js');
    const modules = {};
    for (const path of extraModules) modules[path] = await server.ssrLoadModule(path);
    return { Game: mod.Game, modules };
  } finally {
    await server.close();
  }
}

export function construct(Game, seed) {
  seedAll(seed);
  try { return new Game(); } finally { unseed(); }
}
