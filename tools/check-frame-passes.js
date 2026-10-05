#!/usr/bin/env node
// Frame Pass gate — keeps every Frame Owner on the one shared draw path.
//
// The bug corpus keeps producing the same render-gap family: a draw pass that
// was wired into one place the player can be (surface, floor PiP, Maze PiP,
// REST, NEUTRAL) and silently missing — or ghosting — in another:
//   - #277  weapon charge-up poses never drew inside any Interior
//   - #376  consumable toss windup missing from the floor PiP
//   - #385  Maze PiP missing windups/poses/traps/wand AoE; facing + known
//           spells missing from every Interior
// Each came from a hand-kept per-owner call list gated by `!playerInInterior`.
// src/rendering/framePasses.js replaced those lists with one registry where
// every pass declares every owner; this gate makes the registry the only path:
//
//   1. The registry's schema is valid (every pass × every owner = true or a
//      written reason) — imported, so it is the same check the game runs.
//   2. Every owner renderer calls drawFramePasses(..., '<itself>', '<layer>')
//      exactly once per layer, and never for another owner.
//   3. No owner renderer hand-rolls an interior gate (`playerInInterior`,
//      `isInteriorActive(`) — owner-only scenery gates with ownsFrame().
//   4. Every ownsFrame() call names a known owner and a string-literal reason.
//   5. No owner renderer calls a registered pass's helper directly — a hand
//      call would bypass the per-owner declaration (the #376 shape).
//
// Limit: a brand-new draw that never enters the registry and needs no gate
// is invisible to static checking; the CLAUDE.md wiring rule covers it.
//
// Run directly: `node tools/check-frame-passes.js` — also wired into
// `npm run build` alongside check:arch and check:data.

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { FRAME_OWNERS, FRAME_LAYERS, validateFramePasses } from '../src/rendering/framePasses.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rel = (p) => join(ROOT, p);

const OWNER_FILES = {
  surface: 'src/rendering/state/ExploreRenderer.js',
  floor:   'src/rendering/ui/HutInteriorOverlay.js',
  maze:    'src/rendering/ui/MazeInteriorOverlay.js',
  rest:    'src/rendering/state/RestRenderer.js',
  neutral: 'src/rendering/state/NeutralRenderer.js',
};
const REGISTRY_FILE = 'src/rendering/framePasses.js';

// Shared helpers that ALSO draw enemies (status pips, parry tell, dizzy
// orbit). Owner files may call them for enemies; only a player-argument call
// counts as bypassing the registry.
const ENTITY_GENERIC = new Set(['drawStatusPips', 'drawParryIndicator', 'drawDizzyOrbitals']);

const errors = [];
const fail = (msg) => errors.push(msg);

const lineOf = (src, index) => src.slice(0, index).split('\n').length;

// ── 1. Registry schema ──────────────────────────────────────────────────────
for (const problem of validateFramePasses()) fail(`${REGISTRY_FILE}: ${problem}`);
for (const owner of FRAME_OWNERS) {
  if (!OWNER_FILES[owner]) fail(`${REGISTRY_FILE}: owner '${owner}' has no renderer in tools/check-frame-passes.js OWNER_FILES`);
}

// Helper names the registry routes: ExploreRenderer methods (er(rc).drawX),
// imported draw functions, and RenderController indicators (rc.x.render).
const registrySrc = readFileSync(rel(REGISTRY_FILE), 'utf8');
const methodHelpers = new Set([...registrySrc.matchAll(/er\(rc\)\.(\w+)\(/g)].map((m) => m[1]));
const importedHelpers = new Set();
for (const m of registrySrc.matchAll(/^import\s*\{([^}]+)\}\s*from/gm)) {
  for (const name of m[1].split(',').map((n) => n.trim())) {
    if (/^(draw|has)[A-Z]/.test(name)) importedHelpers.add(name);
  }
}
const indicatorHelpers = new Set([...registrySrc.matchAll(/rc\.(\w+)\.render\(/g)].map((m) => m[1]));

// ── 2-5. Owner renderers ────────────────────────────────────────────────────
for (const [owner, file] of Object.entries(OWNER_FILES)) {
  const src = readFileSync(rel(file), 'utf8');
  const lines = src.split('\n');

  // 2. One drawFramePasses call per layer, for this owner only.
  const calls = [...src.matchAll(/drawFramePasses\(\s*[^,]+,\s*[^,]+,\s*'(\w+)'\s*,\s*'(\w+)'\s*\)/g)];
  const anyCall = [...src.matchAll(/drawFramePasses\(/g)].length;
  if (anyCall !== calls.length) fail(`${file}: drawFramePasses() must be called with literal owner + layer strings`);
  for (const layer of FRAME_LAYERS) {
    const n = calls.filter((c) => c[1] === owner && c[2] === layer).length;
    if (n !== 1) fail(`${file}: must call drawFramePasses(rc, game, '${owner}', '${layer}') exactly once (found ${n})`);
  }
  for (const c of calls) {
    if (c[1] !== owner) fail(`${file}:${lineOf(src, c.index)}: draws Frame Passes for '${c[1]}' — this file owns '${owner}'`);
    if (!FRAME_LAYERS.includes(c[2])) fail(`${file}:${lineOf(src, c.index)}: unknown Frame Pass layer '${c[2]}'`);
  }

  // 3. No hand-rolled interior gates.
  lines.forEach((line, i) => {
    if (/\bplayerInInterior\b|\bisInteriorActive\(/.test(line)) {
      fail(`${file}:${i + 1}: hand-rolled interior gate — use ownsFrame(game, '<owner>', '<reason>') or a Frame Pass declaration`);
    }
  });

  // 5. No direct calls to a registered helper.
  lines.forEach((line, i) => {
    // ExploreRenderer's own method definitions (`  drawX(game) {`) are the helpers themselves.
    if (/^ {2}\w+\([^)]*\)\s*\{/.test(line)) return;
    if (/^\s*(\/\/|\*)/.test(line)) return;
    for (const name of methodHelpers) {
      if (new RegExp(`\\b${name}\\(`).test(line)) {
        fail(`${file}:${i + 1}: direct call to Frame Pass helper ${name}() — it runs from the registry in ${REGISTRY_FILE}`);
      }
    }
    for (const name of importedHelpers) {
      if (!new RegExp(`\\b${name}\\(`).test(line)) continue;
      if (ENTITY_GENERIC.has(name) && !/player/.test(line)) continue;
      fail(`${file}:${i + 1}: direct call to Frame Pass helper ${name}() — it runs from the registry in ${REGISTRY_FILE}`);
    }
    for (const name of indicatorHelpers) {
      if (new RegExp(`\\.${name}\\.render\\(`).test(line)) {
        fail(`${file}:${i + 1}: direct ${name}.render() — it runs from the registry's indicators layer`);
      }
    }
  });
}

// ── 4. ownsFrame() declarations, everywhere in the owner renderers ──────────
for (const file of Object.values(OWNER_FILES)) {
  const src = readFileSync(rel(file), 'utf8');
  for (const m of src.matchAll(/ownsFrame\(/g)) {
    if (src.slice(m.index - 9, m.index) === 'function ') continue;
    const call = src.slice(m.index).match(/^ownsFrame\(\s*[^,]+,\s*'(\w+)'\s*,\s*'([^']{12,})'\s*\)/);
    const at = `${file}:${lineOf(src, m.index)}`;
    if (!call) { fail(`${at}: ownsFrame() needs a literal owner and a written string-literal reason (≥12 chars)`); continue; }
    if (!FRAME_OWNERS.includes(call[1])) fail(`${at}: ownsFrame() names unknown owner '${call[1]}'`);
  }
}

if (errors.length) {
  console.error(`check:frames — ${errors.length} problem(s):`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log(`check:frames — ${FRAME_OWNERS.length} Frame Owners × ${FRAME_LAYERS.length} layers wired; ` +
  `${methodHelpers.size + importedHelpers.size + indicatorHelpers.size} registered helpers unbypassed ✓`);
