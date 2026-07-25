// Small shared helpers: dotted-path get/set and default-definition assembly.
import { SECTIONS, MECHANICS } from './schema.js';

export function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

export function setPath(obj, path, value) {
  const keys = path.split('.');
  let o = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (o[keys[i]] == null || typeof o[keys[i]] !== 'object') o[keys[i]] = {};
    o = o[keys[i]];
  }
  o[keys[keys.length - 1]] = value;
}

export function deletePath(obj, path) {
  const keys = path.split('.');
  let o = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (o[keys[i]] == null) return;
    o = o[keys[i]];
  }
  delete o[keys[keys.length - 1]];
}

export function deepClone(v) {
  return v == null ? v : JSON.parse(JSON.stringify(v));
}

// Every field descriptor across core sections + mechanics.
export function allFields() {
  const out = [];
  for (const s of SECTIONS) out.push(...s.fields);
  for (const m of MECHANICS) out.push(...m.fields);
  return out;
}

// A fresh enemy definition seeded with the core-section defaults only. Gated
// blocks — every mechanic, plus optional sections like Telegraph — are written
// lazily when their toggle is enabled, because for those the absence of the key
// is itself meaningful behavior.
export function buildDefaultDef() {
  const def = {};
  for (const s of SECTIONS) {
    if (s.gate) continue;
    for (const f of s.fields) {
      setPath(def, f.key, deepClone(f.default));
    }
  }
  return def;
}

// A "block" is any gated group of fields: a mechanic, or a section that can be
// absent entirely (Telegraph). Both carry { id, gate, bareGate, fields }, so one
// set of toggle helpers serves both.

// Seed a block's defaults onto the def (called when its toggle is enabled).
export function seedBlock(def, block) {
  for (const f of block.fields) {
    if (getPath(def, f.key) === undefined) setPath(def, f.key, deepClone(f.default));
  }
  if (block.bareGate) {
    // bare-gate blocks (spawnEquipment, flockBehavior, riseAgain, telegraph)
    // have no `.enabled`; their presence is the gate — ensure the root exists.
    if (getPath(def, block.id) === undefined) setPath(def, block.id, {});
  } else {
    setPath(def, block.gate, true);
  }
}

export function clearBlock(def, block) {
  deletePath(def, block.id);
}

export function isBlockOn(def, block) {
  if (block.bareGate) return getPath(def, block.id) !== undefined;
  return getPath(def, block.gate) === true;
}
