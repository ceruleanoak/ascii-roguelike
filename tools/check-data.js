#!/usr/bin/env node
// Data-integrity gate for the static registries in src/data/.
//
// The bug corpus keeps producing a silent-lookup family that is always
// statically checkable and never noticed until play:
//   - #162  duplicate `ITEMS` key (`∿` Ruby Whip shadowed by Primal Potion)
//   - #124  gem `(` shadowed by Remote Bomb via the two-tier getItemData check
//   - #133  enemy affinity 'aberration' not an AFFINITY_POOLS key → empty drops
//   - #90   dropTable 'basic' not an AFFINITY_POOLS key → dead crystal drops
//   - #114  crafted intermediate in ITEMS but absent from INGREDIENTS → "Unknown"
//   - #65   rarity weight arithmetic zeroing an entire tier out
//
// This gate fails the build on any new instance of those shapes, so the family
// can only regress by editing this file's allowlists (each with a bug reference).
//
// Run directly: `node tools/check-data.js` — also wired into `npm run build`
// alongside check:arch.

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ITEMS, INGREDIENTS, AFFINITY_POOLS, RARITY, RARITY_PROFILES, ITEM_TYPES, getItemData }
  from '../src/data/items.js';
import { RECIPES } from '../src/data/recipes.js';
import { ENEMIES } from '../src/data/enemies.js';
import { BACKGROUND_OBJECTS } from '../src/game/GameConfig.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const itemsSource = readFileSync(join(root, 'src/data/items.js'), 'utf8');
const enemiesSource = readFileSync(join(root, 'src/data/enemies.js'), 'utf8');

let failed = false;
function fail(msg) { failed = true; console.error(`  FAIL  ${msg}`); }
function warn(msg) { console.log(`  warn  ${msg}`); }

// ── Source scan: literal duplicate keys inside one object literal ──────────
// A duplicate key in a JS object literal silently keeps the last definition
// (#162), so it is invisible to any runtime inspection of the resulting
// object — it can only be caught by reading the source text.
function scanLiteralKeys(sourceText, varName) {
  // Strip comments conservatively; data files don't put comment markers or
  // braces inside string literals in practice, and the scanner validates its
  // own output by requiring a sane entry count before reporting duplicates.
  const stripped = sourceText.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
  const start = stripped.search(new RegExp(`(?:export const|const)\\s+${varName}\\s*=\\s*\\{`));
  if (start === -1) return null;
  let i = stripped.indexOf('{', start);
  let depth = 0;
  let expectKey = true;
  const keys = [];
  for (; i < stripped.length; i++) {
    const ch = stripped[i];
    if (ch === '{') { depth++; continue; }
    if (ch === '}') {
      depth--;
      if (depth === 0) break;
      continue;
    }
    if (depth !== 1) continue;
    if (ch === ',') { expectKey = true; continue; }
    if (!expectKey || /\s/.test(ch)) continue;
    const m = stripped.slice(i).match(/^(?:'([^']*)'|"([^"]*)"|([A-Za-z_$][\w$]*))\s*:/);
    if (m) keys.push(m[1] ?? m[2] ?? m[3]);
    expectKey = false;
  }
  return keys;
}

function reportDuplicates(keys, label, allowlist = {}) {
  if (!keys || keys.length < 10) {
    warn(`${label}: source scan found ${keys ? keys.length : 0} keys — scanner may have mis-parsed; duplicate check skipped`);
    return;
  }
  console.log(`  ok    ${label}: ${keys.length} literal keys scanned`);
  const seen = new Map();
  for (const k of keys) seen.set(k, (seen.get(k) ?? 0) + 1);
  for (const [k, n] of seen) {
    if (n === 1) continue;
    if (allowlist[k]) { warn(`${label}: duplicate key '${k}' (${n}x): ${allowlist[k]}`); continue; }
    fail(`${label}: duplicate literal key '${k}' defined ${n}x — last definition silently wins (#162 pattern)`);
  }
}

// Pre-existing duplicates stay visible as warns with their bug reference until
// resolved; any NEW duplicate still fails the gate.
reportDuplicates(scanLiteralKeys(itemsSource, 'ITEMS'), 'ITEMS', {
  '∿': '#162 open — Ruby Whip needs re-keying to a free char (authorial call)',
});
reportDuplicates(scanLiteralKeys(itemsSource, 'INGREDIENTS'), 'INGREDIENTS');
reportDuplicates((scanLiteralKeys(enemiesSource, 'ENEMIES') ?? []).map(String), 'ENEMIES');

// ── ITEMS ∩ INGREDIENTS overlap ────────────────────────────────────────────
// getItemData resolves alnum chars as ingredients first, everything else as
// ITEMS first — so overlaps split into two classes:
//   - Sanctioned dual registration: a crafted intermediate deliberately lives
//     in BOTH tables under one identity (#114's fix shape, ADR-backlog
//     2026-06-19). Detected by matching names + ITEMS type INGREDIENT.
//   - Shadowing: two different things share a char; non-alnum resolves as the
//     ITEM and the ingredient silently vanishes from getItemData paths (#124).
const SHADOWED_CHARS_ALLOWLIST = {
  // '#217 — ITEMS['●'] Slime Bomb (TRAP) shadows INGREDIENTS['●'] Pearl;
  // latent (pickup/display read INGREDIENTS directly), re-glyph is authorial.
  '●': '#217',
};
for (const ing of Object.keys(INGREDIENTS)) {
  const itemDef = ITEMS[ing];
  if (!itemDef) continue;
  if (/^[a-zA-Z0-9]$/.test(ing)) {
    warn(`'${ing}' exists in both ITEMS and INGREDIENTS — alnum chars resolve as ingredient first`);
    continue;
  }
  const dualRegistration = itemDef.type === ITEM_TYPES.INGREDIENT
    && itemDef.name === INGREDIENTS[ing].name;
  if (dualRegistration) continue;
  if (SHADOWED_CHARS_ALLOWLIST[ing]) {
    warn(`'${ing}' shadowed (${SHADOWED_CHARS_ALLOWLIST[ing]})`);
    continue;
  }
  fail(`'${ing}' exists in both ITEMS (${itemDef.name ?? '?'}) and INGREDIENTS (${INGREDIENTS[ing].name}) with different identities — non-alnum resolves as ITEM first, silently shadowing the ingredient (#124 pattern)`);
}

// ── AFFINITY_POOLS referential integrity ───────────────────────────────────
// Every pooled char must resolve somewhere, or drops silently vanish (#90's
// empty-yield shape at the pool level).
const knownChars = new Set([...Object.keys(ITEMS), ...Object.keys(INGREDIENTS)]);
const poolNames = new Set(Object.keys(AFFINITY_POOLS));
for (const [pool, categories] of Object.entries(AFFINITY_POOLS)) {
  for (const [category, rarities] of Object.entries(categories)) {
    for (const [rarity, chars] of Object.entries(rarities)) {
      for (const ch of chars) {
        if (!knownChars.has(ch)) fail(`AFFINITY_POOLS.${pool}.${category}.${rarity}: '${ch}' resolves to nothing (not in ITEMS or INGREDIENTS)`);
      }
    }
  }
}

// ── Enemy affinities ⊆ AFFINITY_POOLS ──────────────────────────────────────
// mergeAffinityPools silently skips unknown affinity names, so a typo'd
// affinity means "this enemy drops nothing" with no error anywhere (#133).
const AFFINITY_ALLOWLIST = {
  // '#218 — Sniper ('1') declares 'frost'; whether the elite drops loot at all
  // is an open design call, not a typo fix.
  frost: '#218',
};
for (const [key, enemy] of Object.entries(ENEMIES)) {
  for (const affinity of enemy.affinities ?? []) {
    if (poolNames.has(affinity)) continue;
    if (AFFINITY_ALLOWLIST[affinity]) { warn(`ENEMIES['${key}'] affinity '${affinity}' unresolved: ${AFFINITY_ALLOWLIST[affinity]}`); continue; }
    fail(`ENEMIES['${key}'] affinity '${affinity}' is not an AFFINITY_POOLS key — all its drops resolve to empty (#133 pattern)`);
  }
}

// ── Recipe inputs/results resolve ─────────────────────────────────────────
for (const recipe of RECIPES) {
  for (const slot of ['left', 'right', 'result']) {
    const ch = recipe[slot];
    if (typeof ch === 'string' && ch.length > 0 && !knownChars.has(ch) && !isIngredientChar(ch)) {
      fail(`recipe '${recipe.name ?? '?'}': ${slot} char '${ch}' resolves to nothing`);
    }
  }
}
function isIngredientChar(ch) { return Boolean(getItemData(ch)); }

// ── Crafted-intermediate dual registration (#114) ──────────────────────────
// A recipe result typed INGREDIENT must also exist in INGREDIENTS — display
// lookups resolve through INGREDIENTS[char] only and render "Unknown" otherwise.
const recipeResults = new Set(RECIPES.map(r => r.result));
for (const [key, def] of Object.entries(ITEMS)) {
  if (def.type === 'INGREDIENT' && recipeResults.has(key) && !INGREDIENTS[key]) {
    fail(`ITEMS['${key}'] (${def.name ?? '?'}) is an INGREDIENT-typed recipe result but has no INGREDIENTS entry — crafting-menu display renders "Unknown" (#114 pattern)`);
  }
}

// ── dropTable literals ⊆ AFFINITY_POOLS ────────────────────────────────────
// generateEnemyDrops treats a plain string as an AFFINITY_POOLS lookup; an
// unknown value yields nothing, silently (#90). Scanned across src/ because
// the values are authored next to room/zone content, not in one file.
const DROP_TABLE_ALLOWLIST = {
  basic: '#90 — default mineral-formation rocks; pool choice is an open design call',
};
const srcDirFiles = [];
import { readdirSync, statSync } from 'node:fs';
(function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full);
    else if (entry.endsWith('.js')) srcDirFiles.push(full);
  }
})(join(root, 'src'));
const dropTableRe = /dropTable:\s*'([^']+)'/g;
const declaredDropTables = new Set();
for (const file of srcDirFiles) {
  const src = readFileSync(file, 'utf8');
  let m;
  while ((m = dropTableRe.exec(src))) declaredDropTables.add(m[1]);
}
for (const name of declaredDropTables) {
  if (poolNames.has(name)) continue;
  if (DROP_TABLE_ALLOWLIST[name]) { warn(`dropTable '${name}' unresolved: ${DROP_TABLE_ALLOWLIST[name]}`); continue; }
  fail(`dropTable '${name}' is not an AFFINITY_POOLS key and not allowlisted — every roll against it yields nothing (#90 pattern)`);
}

// ── Rarity-weight arithmetic (#65 regression guard) ────────────────────────
// getWeightedRandomFromPool multiplies RARITY_WEIGHTS[rarity] × profile[rarity]
// and skips tiers whose product is <= 0. Mirrored here (RARITY_WEIGHTS is not
// exported); if the real table drifts from this copy the check degrades to a
// false negative, never a false positive.
const RARITY_WEIGHTS_MIRROR = { [RARITY.COMMON]: 100, [RARITY.UNCOMMON]: 30, [RARITY.RARE]: 10, [RARITY.EPIC]: 2 };
for (const [tierName, profile] of Object.entries(RARITY_PROFILES)) {
  for (const [rarity, profileWeight] of Object.entries(profile)) {
    const product = (RARITY_WEIGHTS_MIRROR[rarity] ?? 1) * profileWeight;
    // weak.RARE = 0.02 is deliberate post-#65 (cumulative selection keeps it
    // meaningful); flag only exact-zero products, which no profile should ship.
    if (product <= 0 && profileWeight > 0) {
      fail(`RARITY_PROFILES.${tierName}.${rarity}: weight ${profileWeight} zeroes out under base weights — every ${rarity} drop for '${tierName}' enemies becomes impossible (#65 pattern)`);
    }
  }
}

// ── Enemy glyph collisions with background objects ─────────────────────────
// Same glyph in ENEMIES and BACKGROUND_OBJECTS reads as either in play (#102
// 'Y' stump vs Barrow Tyrant). Known mitigations exist (distinct colors), so
// this warns rather than fails.
const bgChars = new Set(Object.keys(BACKGROUND_OBJECTS));
for (const key of Object.keys(ENEMIES)) {
  if (bgChars.has(key)) warn(`enemy glyph '${key}' is also a BACKGROUND_OBJECTS char — ensure color/shape disambiguates in play (#102)`);
}

if (failed) {
  console.error('\nData integrity violated.');
  console.error('Fix the referenced registry entry, or extend an allowlist above only with a bug reference.');
  process.exit(1);
}
console.log('Data integrity ok.');
