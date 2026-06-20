// Turns a live enemy def into (a) a paste-ready JS object literal for
// src/data/enemies.js, factoring out GRID.CELL_SIZE on pixel fields and
// pruning noise defaults, and (b) a plain JSON draft for save/load.
import { allFields, getPath } from './util.js';
import { MECHANICS } from './schema.js';

const PX_PATHS = new Set(allFields().filter(f => f.type === 'px').map(f => f.key));
const DEFAULTS = new Map(allFields().map(f => [f.key, f.default]));

// Always emitted at top level even when equal to default.
const REQUIRED = new Set(['char', 'name', 'hp', 'speed', 'damage', 'attackType',
  'attackRange', 'attackCooldown', 'color', 'tier', 'affinities']);

// Top-level emit order; unknown keys appended after in insertion order.
const ORDER = ['char', 'name', 'description', 'spellDescription', 'tier', 'affinities',
  'hp', 'speed', 'damage', 'color', 'attackType', 'attackRange', 'aggroRange',
  'attackCooldown', 'attackWindup', 'projectileType', 'isImpact',
  'mass', 'acceleration', 'knockbackMultiplier',
  'decisionInterval', 'idleBehavior', 'windupMovement', 'windupImmune',
  'movementStyle', 'movementConfig',
  'float', 'lavaImmune', 'grassStealth', 'shellCamouflage', 'waterAffinity',
  'swimAffinity', 'freezePermanent', 'packCoordination', 'mistThicken',
  'sapDamage', 'sapDamageInterval', 'elementalAffinity', 'sfx',
  ...MECHANICS.map(m => m.id)];

const MECH_KEYS = new Set(MECHANICS.map(m => m.id));

function isEmpty(v) {
  if (v == null || v === '') return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === 'object') return Object.keys(v).length === 0;
  return false;
}

function eqDefault(path, v) {
  if (!DEFAULTS.has(path)) return false;
  return JSON.stringify(DEFAULTS.get(path)) === JSON.stringify(v);
}

function quoteKey(k) {
  return /^[A-Za-z_$][\w$]*$/.test(k) ? k : `'${k}'`;
}

function quoteStr(s) {
  return `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function pxExpr(v) {
  if (v === 0) return '0';
  if (v % 16 === 0) {
    const n = v / 16;
    return n === 1 ? 'GRID.CELL_SIZE' : `GRID.CELL_SIZE * ${n}`;
  }
  return String(v);
}

function serialize(value, path, indent, insideMechanic) {
  const pad = '  '.repeat(indent);
  const padIn = '  '.repeat(indent + 1);

  if (typeof value === 'number') {
    return PX_PATHS.has(path) ? pxExpr(value) : String(value);
  }
  if (typeof value === 'string') return quoteStr(value);
  if (typeof value === 'boolean' || value === null) return String(value);

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    const simple = value.every(v => typeof v !== 'object' || v === null);
    if (simple) {
      const inner = value.map(v => serialize(v, path + '[]', 0, insideMechanic)).join(', ');
      if (inner.length <= 60) return `[${inner}]`;
    }
    const items = value.map(v => padIn + serialize(v, path + '[]', indent + 1, insideMechanic));
    return `[\n${items.join(',\n')}\n${pad}]`;
  }

  // object
  const childMech = insideMechanic || MECH_KEYS.has(path);
  const entries = [];
  for (const [k, v] of orderedEntries(value, path)) {
    const childPath = path ? `${path}.${k}` : k;
    if (shouldOmit(childPath, k, v, childMech)) continue;
    const ser = serialize(v, childPath, indent + 1, childMech);
    // Drop objects/arrays that collapsed to empty after pruning their children
    // (e.g. elementalAffinity holding only default-valued maps).
    const required = !childPath.includes('.') && REQUIRED.has(k);
    if (!childMech && !required && (ser === '{}' || ser === '[]')) continue;
    entries.push(`${padIn}${quoteKey(k)}: ${ser}`);
  }
  if (entries.length === 0) return '{}';
  return `{\n${entries.join(',\n')}\n${pad}}`;
}

function shouldOmit(childPath, key, v, insideMechanic) {
  // Inside a mechanic config, keep every knob explicit (don't prune defaults).
  if (insideMechanic) return false;
  // Required top-level fields are always emitted.
  const isTopLevel = !childPath.includes('.');
  if (isTopLevel && REQUIRED.has(key)) return false;
  // Prune empties (e.g. movementConfig: {}, immunity: []) and noise defaults.
  if (isEmpty(v)) return true;
  if (eqDefault(childPath, v)) return true;
  return false;
}

function orderedEntries(obj, path) {
  if (path === '') {
    const keys = Object.keys(obj);
    keys.sort((a, b) => {
      const ia = ORDER.indexOf(a), ib = ORDER.indexOf(b);
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    });
    return keys.map(k => [k, obj[k]]);
  }
  return Object.entries(obj);
}

// Paste-ready entry: `  'r': { ... },` keyed by char, matching enemies.js.
export function toEntryLiteral(def) {
  const char = def.char || '?';
  const body = serialize(def, '', 1, false);
  return `${quoteStr(char)}: ${body},`;
}

// Bare object literal (no key) — for inspecting the full shape.
export function toObjectLiteral(def) {
  return serialize(def, '', 0, false);
}

// Plain JSON for the draft store (lossless round-trip).
export function toDraftJSON(def) {
  return JSON.stringify(def, null, 2);
}

export function fromDraftJSON(text) {
  return JSON.parse(text);
}
