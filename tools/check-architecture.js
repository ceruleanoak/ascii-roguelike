#!/usr/bin/env node
// Architecture ratchet — enforces per-file line budgets from tools/arch-budgets.json.
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
// - Budgets only move DOWN: after an extraction shrinks a file, run
//   `node tools/check-architecture.js --update` to lock in the new ceiling
//   (current line count + HEADROOM, never above the old budget).
// - HEADROOM exists so legitimate orchestration growth (a new system's
//   import + instantiation + update call in main.js) doesn't trip the gate.
//   A feature blob will blow past it.

import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const HEADROOM = 25;

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const budgetPath = join(root, 'tools', 'arch-budgets.json');
const budgets = JSON.parse(readFileSync(budgetPath, 'utf8'));

const update = process.argv.includes('--update');
let failed = false;
const next = {};

for (const [file, budget] of Object.entries(budgets)) {
  const lines = readFileSync(join(root, file), 'utf8').split('\n').length - 1;
  next[file] = Math.min(budget, lines + HEADROOM);
  if (lines > budget) {
    failed = true;
    console.error(`  FAIL  ${file}: ${lines} lines exceeds budget ${budget} (+${lines - budget})`);
  } else {
    console.log(`  ok    ${file}: ${lines}/${budget}`);
  }
}

if (update) {
  writeFileSync(budgetPath, JSON.stringify(next, null, 2) + '\n');
  console.log('\nBudgets ratcheted to current line counts + headroom.');
  process.exit(0);
}

if (failed) {
  console.error('\nArchitecture budget exceeded.');
  console.error('Route the new logic into a system file (CLAUDE.md "Code Placement Procedure").');
  console.error('Do not raise budgets in tools/arch-budgets.json to make this pass.');
  process.exit(1);
}
