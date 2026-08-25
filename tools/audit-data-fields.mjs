#!/usr/bin/env node
// Dead-data-field audit — REPORT ONLY (not build-gating; heuristic).
//
// Scans the authored registries (ITEMS, ENEMIES) for data fields that are set
// but never read anywhere in src/ outside their own definition file — the
// shape of resolved-in-review bugs #201 (`arrowChar` on six bows, silently
// ignored), #189 (`hitFlashTimer` set, never read), and #90 (`dropTable:
// 'basic'`, unresolvable key).
//
// Known false-negative modes (documented, accepted): dynamic property access
// (`obj[field]`), destructuring-free string building, and fields consumed
// only inside tools/. Known false-positive mode: a field read only via its
// literal name inside the same data file (e.g. computed siblings).
//
// Run: node tools/audit-data-fields.mjs

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ITEMS } from '../src/data/items.js';
import { ENEMIES } from '../src/data/enemies.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Fields every entry legitimately carries for identity/display; never audit.
const BASE_FIELDS = new Set([
  'char', 'name', 'description', 'color', 'type', 'spellDescription', 'glyph',
]);

function collectFields(registry, label) {
  const fields = new Map(); // name -> [registryKeys]
  for (const [key, def] of Object.entries(registry)) {
    if (!def || typeof def !== 'object') continue;
    for (const f of Object.keys(def)) {
      if (BASE_FIELDS.has(f)) continue;
      if (!fields.has(f)) fields.set(f, []);
      fields.get(f).push(key);
    }
  }
  return { label, fields };
}

function loadSources() {
  const sources = [];
  (function walk(dir) {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith('.js')) {
        try { sources.push({ file: full, text: readFileSync(full, 'utf8') }); }
        catch { /* unreadable */ }
      }
    }
  })(join(root, 'src'));
  return sources;
}

const registries = [
  collectFields(ITEMS, 'ITEMS'),
  collectFields(ENEMIES, 'ENEMIES'),
];
const sources = loadSources();

let deadCount = 0;
for (const { label, fields } of registries) {
  for (const [field, keys] of [...fields.entries()].sort()) {
    // Member-access usage outside the defining data file. Requiring a leading
    // dot avoids false "readers" from local variables that merely share the
    // field's name (exactly how `arrowChar` hid: Item.js has a same-named
    // local from getArrowCharForAngle, while this.data.arrowChar is never
    // read — open bug #201).
    const re = new RegExp(`\\.${field}\\b`);
    const externalReaders = sources.filter(s =>
      !s.file.endsWith(`data/${label === 'ITEMS' ? 'items' : 'enemies'}.js`)
      && re.test(s.text));

    if (externalReaders.length > 0) continue;

    deadCount++;
    console.log(`DEAD?  ${label}.${field}  (${keys.length} entr${keys.length === 1 ? 'y' : 'ies'}: ${keys.slice(0, 6).join(' ')}${keys.length > 6 ? '…' : ''})`);
  }
}

console.log(`\n${deadCount} candidate dead field(s). Verify each by hand before deleting —`);
console.log('dynamic access and tools/-only consumers are invisible to this scan.');
