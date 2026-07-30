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

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const HEADROOM = 1000;

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const budgetPath = join(root, 'tools', 'arch-budgets.json');
const budgets = JSON.parse(readFileSync(budgetPath, 'utf8'));

const update = process.argv.includes('--update');
let failed = false;
const next = {};

// ── Combat layer-isolation guard ───────────────────────────────────────────
// Combat/effect code must spawn through game._activeBackgroundObjects() so effects
// land in whatever layer the player occupies (surface / hut / dungeon). Reaching for
// currentRoom.backgroundObjects (or the game.backgroundObjects surface mirror) directly
// leaks effects onto the surface while the player is inside an interior — a months-long
// bug class. Generation code (RoomGenerator/HutSystem/DungeonSystem/etc.) legitimately
// builds a specific room and is NOT in this list.
const LAYER_GUARD_FILES = [
  'src/systems/CharacterSystem.js',
  'src/systems/MagicSystem.js',
  'src/systems/TrapSystem.js',
  'src/systems/CombatSystem.js',
  'src/systems/WorldEffectsSystem.js',
  'src/systems/FireSystem.js',
];
// Whole directories of composition files, every one of them enrolled. enemyStates
// joins on the same grounds as enemyMechanics: a State runs per-frame against
// whatever layer the enemy is on, and the sandbox's game stub provides
// `backgroundObjects` but not `_activeBackgroundObjects()`, so a State that
// reached for the surface mirror would work in the editor and leak in the game.
const LAYER_GUARD_GLOB_DIRS = ['src/entities/enemyMechanics', 'src/entities/enemyStates'];
const FORBIDDEN_BG_ACCESS = /(currentRoom\.backgroundObjects|(?:game|this)\.backgroundObjects)/;

function checkLayerGuard() {
  let guardFailed = false;
  const files = [...LAYER_GUARD_FILES];
  for (const dir of LAYER_GUARD_GLOB_DIRS) {
    try {
      for (const f of readdirSync(join(root, dir))) {
        if (f.endsWith('.js')) files.push(`${dir}/${f}`);
      }
    } catch { /* dir may not exist */ }
  }

  for (const file of files) {
    let src;
    try { src = readFileSync(join(root, file), 'utf8'); } catch { continue; }
    src.split('\n').forEach((line, i) => {
      if (FORBIDDEN_BG_ACCESS.test(line)) {
        guardFailed = true;
        console.error(`  FAIL  ${file}:${i + 1}  direct surface bg-object access: ${line.trim()}`);
      }
    });
  }
  return guardFailed;
}

for (const [file, budget] of Object.entries(budgets)) {
  const chars = readFileSync(join(root, file), 'utf8').length;
  next[file] = Math.min(budget, chars + HEADROOM);
  if (chars > budget) {
    failed = true;
    console.error(`  FAIL  ${file}: ${chars} chars exceeds budget ${budget} (+${chars - budget})`);
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
