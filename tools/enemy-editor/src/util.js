// Small shared helpers: dotted-path get/set and default-definition assembly.
import { SECTIONS, MECHANICS } from './schema.js';

// A path is dotted, and may index into a list: `potionMechanic.potionTable[2].color`.
// The index form is what lets a list's rows reuse the ordinary field renderer —
// each row hands its item fields a key with the row number baked in, and every
// existing get/set/delete works on it unchanged.
//
// Returns segments as strings and numbers, so a segment's type says which kind
// of container the level above it has to be.
export function parsePath(path) {
  const out = [];
  for (const part of path.split('.')) {
    const name = part.replace(/\[\d+\]/g, '');
    if (name) out.push(name);
    for (const m of part.matchAll(/\[(\d+)\]/g)) out.push(Number(m[1]));
  }
  return out;
}

export function getPath(obj, path) {
  return parsePath(path).reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

export function setPath(obj, path, value) {
  const keys = parsePath(path);
  let o = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (o[keys[i]] == null || typeof o[keys[i]] !== 'object') {
      // The *next* segment decides the container: a number needs an array to
      // index into, a name needs an object.
      o[keys[i]] = typeof keys[i + 1] === 'number' ? [] : {};
    }
    o = o[keys[i]];
  }
  o[keys[keys.length - 1]] = value;
}

export function deletePath(obj, path) {
  const keys = parsePath(path);
  let o = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (o[keys[i]] == null) return;
    o = o[keys[i]];
  }
  // Deleting a list row closes the gap — a hole would emit as a literal
  // `undefined` and break the definition it lands in.
  if (Array.isArray(o) && typeof keys[keys.length - 1] === 'number') o.splice(keys[keys.length - 1], 1);
  else delete o[keys[keys.length - 1]];
}

export function deepClone(v) {
  return v == null ? v : JSON.parse(JSON.stringify(v));
}

// A field's default may be written as a function of the def, for the cases where
// the game's own fallback is derived rather than constant (keeper preferred
// range is `attackRange * 0.8`). Every read of a default goes through here so
// the form, the seeder, and codegen all resolve it the same way.
export function defaultFor(field, def) {
  return typeof field.default === 'function' ? field.default(def ?? {}) : deepClone(field.default);
}

// Whether a field applies to this def at all. A hidden field is not part of the
// enemy — the form skips it and codegen prunes it, rather than emitting an
// archetype's parameters onto an enemy of a different archetype.
export function fieldApplies(field, def) {
  return !field.showIf || field.showIf(def);
}

// Every field descriptor across core sections + mechanics. A list field stands
// for its whole array, so its own descriptor is what the catalog holds — the
// itemFields describe one row and never appear as top-level keys.
export function allFields() {
  const out = [];
  for (const s of SECTIONS) out.push(...s.fields);
  for (const m of MECHANICS) out.push(...m.fields);
  return out;
}

// A fresh row for a list field, every column answered from its own default.
// Unlike the def seeders this writes every column unconditionally: a row that
// omitted a key would read as authored-absent, and the read sites for these
// lists (a potion's colour, a pulse's delay) have no fallback to offer.
export function newListItem(field) {
  const item = {};
  for (const f of field.itemFields) item[f.key] = defaultFor(f, item);
  return item;
}

// A fresh enemy definition seeded with the core-section defaults only. Gated
// blocks — every mechanic, plus optional sections like Telegraph — are written
// lazily when their toggle is enabled, because for those the absence of the key
// is itself meaningful behavior.
export function buildDefaultDef() {
  const def = {};
  for (const s of SECTIONS) {
    if (s.gate) continue;
    // Seeded in declaration order so a derived default (preferred range reads
    // attackRange) sees the fields it depends on already written — and so a
    // `showIf` reading an earlier field in the same section (the movement
    // parameters read movementStyle) is answered against a def that has it.
    for (const f of s.fields) {
      if (!fieldApplies(f, def)) continue;
      setPath(def, f.key, defaultFor(f, def));
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
    // A field the block's own shape excludes (the rabbit-only burrow timer on a
    // moose) is not seeded — it appears, already answered by its runtime
    // fallback, only once the choice that needs it is made.
    if (!fieldApplies(f, def)) continue;
    if (getPath(def, f.key) === undefined) setPath(def, f.key, defaultFor(f, def));
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
