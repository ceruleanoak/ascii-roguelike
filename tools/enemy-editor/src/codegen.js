// Turns a live enemy def into (a) a paste-ready JS object literal for
// src/data/enemies.js, factoring out GRID.CELL_SIZE on pixel fields and
// pruning noise defaults, and (b) a plain JSON draft for save/load.
import { allFields, defaultFor, fieldApplies } from './util.js';
import { MECHANICS, SECTIONS, GRID_CELL } from './schema.js';

const PX_PATHS = new Set(allFields().filter(f => f.type === 'px').map(f => f.key));
const FIELDS = new Map(allFields().map(f => [f.key, f]));

// The def currently being serialized. A derived default (keeper preferred range
// = attackRange × 0.8) and a `showIf` both need the whole enemy, not the value
// at hand, and threading it through every serialize() frame would touch each
// recursive call for one shallow read.
let emitting = null;

// Always emitted at top level even when equal to default.
const REQUIRED = new Set(['char', 'name', 'hp', 'speed', 'damage', 'attackType',
  'attackRange', 'attackCooldown', 'color', 'tier', 'affinities']);

// Top-level emit order; unknown keys appended after in insertion order.
const ORDER = ['char', 'name', 'description', 'spellDescription', 'tier', 'affinities',
  'hp', 'speed', 'damage', 'color', 'attackType', 'attackRange', 'aggroRange',
  'attackCooldown', 'attackWindup', 'projectileType', 'isImpact', 'telegraph',
  'mass', 'acceleration', 'knockbackMultiplier', 'knockbackResistance',
  'decisionInterval', 'idleBehavior', 'windupMovement', 'windupImmune',
  'movementStyle', 'movementConfig',
  'pacifist', 'isDummy',
  'float', 'lavaImmune', 'grassStealth', 'shellCamouflage', 'waterAffinity',
  'swimAffinity', 'freezePermanent', 'packCoordination', 'mistThicken',
  'sapDamage', 'sapDamageInterval', 'elementalAffinity', 'drops', 'sfx',
  ...MECHANICS.map(m => m.id)];

const MECH_KEYS = new Set(MECHANICS.map(m => m.id));

// Sections whose keys are emitted even when they equal their default. Inside an
// optional block a default is load-bearing: pruning `telegraph.area: 'box'`
// would leave `telegraph: {}`, which resolves to no shape at all and silently
// reverts the enemy to the legacy windup visual.
const EXPLICIT_BLOCKS = new Set(SECTIONS.filter(s => s.emitDefaults).map(s => s.id));

function isEmpty(v) {
  if (v == null || v === '') return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === 'object') return Object.keys(v).length === 0;
  return false;
}

function eqDefault(path, v) {
  const field = FIELDS.get(path);
  if (!field) return false;
  return JSON.stringify(defaultFor(field, emitting)) === JSON.stringify(v);
}

function quoteKey(k) {
  return /^[A-Za-z_$][\w$]*$/.test(k) ? k : `'${k}'`;
}

function quoteStr(s) {
  return `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function pxExpr(v) {
  if (v === 0) return '0';
  // Halves read as cells too — a 1.5-cell tolerance is authored that way in
  // enemies.js, and rounding it to a bare pixel count hides the intent.
  const n = v / GRID_CELL;
  if (Number.isInteger(n)) return n === 1 ? 'GRID.CELL_SIZE' : `GRID.CELL_SIZE * ${n}`;
  if (Number.isInteger(n * 2)) return `GRID.CELL_SIZE * ${n}`;
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
  const field = FIELDS.get(childPath);
  // A field its `showIf` excludes belongs to a different archetype, so it is not
  // this enemy's to carry — drop it whatever it holds. Without this, the jumper
  // parameters below (which must never be pruned when they *do* apply) would
  // leak onto every keeper and chaser.
  if (field && !fieldApplies(field, emitting)) return true;
  // Inside a mechanic config, keep every knob explicit (don't prune defaults).
  if (insideMechanic) return false;
  // Required top-level fields are always emitted.
  const isTopLevel = !childPath.includes('.');
  if (isTopLevel && REQUIRED.has(key)) return false;
  // Prune empties (e.g. movementConfig: {}, immunity: []) and noise defaults.
  if (isEmpty(v)) return true;
  // An explicit block still drops unset keys, but keeps default-valued ones.
  if (EXPLICIT_BLOCKS.has(childPath.split('.')[0])) return false;
  // The game reads this key with no fallback of its own — pruning it to match a
  // default would hand the runtime `undefined`, not the default.
  if (field?.noPrune) return false;
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
  const body = emit(def, 1);
  return `${quoteStr(char)}: ${body},`;
}

// Bare object literal (no key) — for inspecting the full shape.
export function toObjectLiteral(def) {
  return emit(def, 0);
}

// Single entry point for a whole-def serialization, so the def every derived
// default and `showIf` reads is always the one being written.
function emit(def, indent) {
  emitting = def;
  try {
    return serialize(def, '', indent, false);
  } finally {
    emitting = null;
  }
}

// Plain JSON for the draft store (lossless round-trip).
export function toDraftJSON(def) {
  return JSON.stringify(def, null, 2);
}

export function fromDraftJSON(text) {
  return JSON.parse(text);
}
