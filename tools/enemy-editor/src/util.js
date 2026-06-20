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

// A fresh enemy definition seeded with the core-section defaults only.
// Mechanic sub-fields are written lazily when a mechanic is toggled on.
export function buildDefaultDef() {
  const def = {};
  for (const s of SECTIONS) {
    for (const f of s.fields) {
      setPath(def, f.key, deepClone(f.default));
    }
  }
  return def;
}

// Seed a mechanic's defaults onto the def (called when its toggle is enabled).
export function seedMechanic(def, mechanic) {
  for (const f of mechanic.fields) {
    if (getPath(def, f.key) === undefined) setPath(def, f.key, deepClone(f.default));
  }
  if (mechanic.bareGate) {
    // bare-gate mechanics (spawnEquipment, flockBehavior, riseAgain) have no
    // `.enabled`; their presence is the gate — ensure the root object exists.
    if (getPath(def, mechanic.id) === undefined) setPath(def, mechanic.id, {});
  } else {
    setPath(def, mechanic.gate, true);
  }
}

export function clearMechanic(def, mechanic) {
  deletePath(def, mechanic.id);
}

export function isMechanicOn(def, mechanic) {
  if (mechanic.bareGate) return getPath(def, mechanic.id) !== undefined;
  return getPath(def, mechanic.gate) === true;
}
