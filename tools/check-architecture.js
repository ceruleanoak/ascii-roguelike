#!/usr/bin/env node
// Architecture ratchet — enforces per-file character budgets from tools/arch-budgets.json.
//
// Why: main.js reached ~8,000 lines because net-new behavior defaulted into the
// orchestrator. Budgets make that drift a build failure instead of a code review
// opinion. See CLAUDE.md "Code Placement Procedure" and
// claudedocs/architecture-governance.md for the policy this enforces.
//
// Rules:
// - `npm run build` runs this check; exceeding any budget fails the build.
// - The fix for a failure is to route the new code into a system file —
//   never to raise the budget by hand.
// - Libraries are NOT budgeted and must not be added to arch-budgets.json.
//   A library grows with the amount of content it catalogues, not with drifting
//   behavior — Item.js, for instance, is an attack-pattern factory whose size
//   tracks the number of weapon patterns, so capping it would only push new
//   patterns somewhere less obvious. Budgets exist to catch behavior defaulting
//   into a file that has no business owning it; that failure mode doesn't apply
//   to a catalogue. Budget orchestrators, systems, renderers and entities that
//   own live state instead.
// - Budgets only move DOWN: after an extraction shrinks a file, run
//   `node tools/check-architecture.js --update` to lock in the new ceiling
//   (current char count + HEADROOM, never above the old budget).
// - HEADROOM exists so legitimate orchestration growth (a new system's
//   import + instantiation + update call in main.js) doesn't trip the gate.
//   A feature blob will blow past it.
// - OVERAGE_TOLERANCE lets a genuinely small miss (a couple of one-line
//   delegated calls) warn instead of fail — it is not an invitation to skip
//   the extraction pass for anything bigger. Budgets still never move up:
//   this only changes whether a small overage blocks the build, not what
//   number is stored in arch-budgets.json.

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const HEADROOM = 1000;
const OVERAGE_TOLERANCE = 300;

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const budgetPath = join(root, 'tools', 'arch-budgets.json');
const budgets = JSON.parse(readFileSync(budgetPath, 'utf8'));

const update = process.argv.includes('--update');
let failed = false;
const next = {};

// ── Combat layer-isolation guard ───────────────────────────────────────────
// Combat/effect code must spawn through game._activeBackgroundObjects() /
// game._activeEnemies() so effects land in whatever layer the player occupies
// (surface / hut / dungeon / maze). Reaching for currentRoom.backgroundObjects,
// currentRoom.enemies, or the game.backgroundObjects surface mirror directly
// leaks effects onto the surface while the player is inside an interior — a
// months-long bug class ([layer-leak]: resolved #107/#135, open #130/#131).
//
// DEFAULT-DENY since 2026-08-24: every file under src/systems and src/entities
// is checked unless exempted below. The original allowlist rotted — new systems
// (ArmorEffectsSystem) shipped after it and were never enrolled, which is
// exactly the drift this guard exists to stop. Generation code legitimately
// builds a specific room and is NOT subject to the rule.
const LAYER_GUARD_DIRS = ['src/systems', 'src/entities'];

// Generation/building code: constructs one specific room or floor and touches
// its arrays directly by design. Runtime combat/effect code does not belong
// here — adding a file here requires a sentence naming what it generates.
const LAYER_GUARD_EXEMPT_FILES = new Set([
  'src/systems/RoomGenerator.js',
  'src/systems/roomFeatures.js',
  'src/systems/HutSystem.js',            // builds hut interiors; interior enemy loop reads its own floor
  'src/systems/DungeonSystem.js',        // floor-stack construction + activation
  'src/systems/DungeonFloorGenerator.js',// dungeon floor content generation
  'src/systems/MazeSystem.js',           // maze layout generation
  'src/systems/InteriorManager.js',      // interior lifecycle host; owns the reset contract
]);

// Line-level escape for the canonical routing accessors themselves (the
// definitions of _activeBackgroundObjects/_activeEnemies necessarily mention
// the fields they abstract over).
const LAYER_GUARD_OK_MARKER = 'layer-guard-ok';

const FORBIDDEN_LAYER_ACCESS = [
  /currentRoom\.backgroundObjects/,   // surface list reached past the router (any receiver)
  /(?:game|this)\.backgroundObjects/, // surface mirror (divergent private copies, #107)
  /currentRoom\.enemies/,             // surface enemy list reached past the router (#130)
];

function stripComments(src) {
  // Comment-aware scan: block comments tracked across lines, line comments
  // trimmed — doc text mentioning e.g. currentRoom.enemies must not trip the
  // guard, only executable access should.
  return src.split('\n').map(line => {
    let out = '';
    let i = 0;
    while (i < line.length) {
      if (inBlock && line[i] === '*' && line[i + 1] === '/') { inBlock = false; i += 2; continue; }
      if (inBlock) { i++; continue; }
      if (line[i] === '/' && line[i + 1] === '*') { inBlock = true; i += 2; continue; }
      if (line[i] === '/' && line[i + 1] === '/') break;
      out += line[i];
      i++;
    }
    return out;
  }).join('\n');
}
let inBlock = false;

function checkLayerGuard() {
  let guardFailed = false;
  const files = [];
  const seen = new Set();
  for (const dir of LAYER_GUARD_DIRS) {
    (function walk(d) {
      let entries;
      try { entries = readdirSync(join(root, d)); } catch { return; }
      for (const entry of entries) {
        const full = join(d, entry);
        if (seen.has(full)) continue;
        seen.add(full);
        let st;
        try { st = statSync(join(root, full)); } catch { continue; }
        if (st.isDirectory()) { walk(full); continue; }
        if (!entry.endsWith('.js')) continue;
        if (LAYER_GUARD_EXEMPT_FILES.has(full.replaceAll('\\', '/'))) continue;
        files.push(full);
      }
    })(dir);
  }

  for (const file of files) {
    let src;
    try { src = readFileSync(join(root, file), 'utf8'); } catch { continue; }
    const strippedLines = stripComments(src).split('\n');
    src.split('\n').forEach((line, i) => {
      if (line.includes(LAYER_GUARD_OK_MARKER)) return;
      const code = strippedLines[i];
      if (FORBIDDEN_LAYER_ACCESS.some(re => re.test(code))) {
        guardFailed = true;
        console.error(`  FAIL  ${file}:${i + 1}  direct surface-layer access: ${line.trim()}`);
      }
    });
  }
  return guardFailed;
}

for (const [file, budget] of Object.entries(budgets)) {
  const chars = readFileSync(join(root, file), 'utf8').length;
  next[file] = Math.min(budget, chars + HEADROOM);
  const over = chars - budget;
  if (over > OVERAGE_TOLERANCE) {
    failed = true;
    console.error(`  FAIL  ${file}: ${chars} chars exceeds budget ${budget} (+${over})`);
  } else if (over > 0) {
    console.log(`  warn  ${file}: ${chars}/${budget} (+${over}, within ${OVERAGE_TOLERANCE}-char tolerance)`);
  } else {
    console.log(`  ok    ${file}: ${chars}/${budget}`);
  }
}

if (update) {
  writeFileSync(budgetPath, JSON.stringify(next, null, 2) + '\n');
  console.log('\nBudgets ratcheted to current line counts + headroom.');
  process.exit(0);
}

const layerGuardFailed = checkLayerGuard();

if (failed) {
  console.error('\nArchitecture budget exceeded.');
  console.error('Route the new logic into a system file (CLAUDE.md "Code Placement Procedure").');
  console.error('Do not raise budgets in tools/arch-budgets.json to make this pass.');
}

if (layerGuardFailed) {
  console.error('\nCombat layer-isolation violated.');
  console.error('Combat/effect code must spawn through game._activeBackgroundObjects()');
  console.error('(and game.activeRoom / game.activeGridBounds), never currentRoom.backgroundObjects');
  console.error('directly — otherwise effects leak onto the surface from inside huts/dungeons.');
}

if (failed || layerGuardFailed) process.exit(1);
