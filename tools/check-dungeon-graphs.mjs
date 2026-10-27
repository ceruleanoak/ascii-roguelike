#!/usr/bin/env node
// Dungeon Graph gate (runs inside `npm run build`): for every Dungeon Recipe
// in src/data/dungeon/recipes/, checks the recipe's shape, then rolls a
// seeded batch of graphs from it and runs the shared graph validator over
// each — the same buildDungeonGraph/validateGraph the game calls at dungeon
// entry. A recipe that can roll even one unsound graph (an unreachable
// floor, no place for the Skull Key, an open way to the Pyramid) fails the
// build. Seeded, so a failure reproduces: the report names the seed.
//
//   node tools/check-dungeon-graphs.mjs [--count N]

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDungeonGraph, validateGraph, validateRecipe } from '../src/systems/dungeonGraphBuilder.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const recipeDir = join(root, 'src/data/dungeon/recipes');
const countArg = process.argv.indexOf('--count');
const COUNT = countArg > 0 ? Number(process.argv[countArg + 1]) : 500;

// mulberry32 — the same small seeded PRNG DemoSystem uses.
function seededRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A short name for the corridor layer a graph rolled, for the coverage line.
function layerName(graph) {
  const corridors = Object.values(graph.nodes).filter(n => n.kind === 'corridor').length;
  const intoBranch = graph.edges.filter(e => e.to === 'branch' && !e.hidden).length;
  const hidden = graph.edges.some(e => e.hidden && e.reveal !== 'push') ? '+hidden' : '';
  const push = graph.edges.some(e => e.reveal === 'push') ? '+push' : '';
  return `${corridors} ${intoBranch > 1 ? 'triangle' : 'chain'}${hidden}${push}`;
}

let failed = false;
for (const file of readdirSync(recipeDir).filter(f => f.endsWith('.json')).sort()) {
  const zone = file.replace(/\.json$/, '');
  const recipe = JSON.parse(readFileSync(join(recipeDir, file), 'utf8'));
  const recipeErrors = validateRecipe(recipe);
  if (recipeErrors.length) {
    failed = true;
    for (const err of recipeErrors) console.log(`FAIL  ${zone}: ${err}`);
    continue;
  }
  const layers = {};
  let bad = 0;
  for (let seed = 1; seed <= COUNT; seed++) {
    const graph = buildDungeonGraph(recipe, seededRng(seed));
    const errors = validateGraph(graph);
    layers[layerName(graph)] = (layers[layerName(graph)] ?? 0) + 1;
    if (errors.length) {
      bad++;
      if (bad <= 5) console.log(`FAIL  ${zone} seed ${seed}: ${errors.join('; ')}`);
    }
  }
  if (bad) failed = true;
  const coverage = Object.entries(layers).sort().map(([k, n]) => `${k}×${n}`).join(', ');
  console.log(`${bad ? 'FAIL' : 'ok  '}  ${zone}: ${COUNT - bad}/${COUNT} sound (${coverage})`);
}

if (failed) {
  console.log('\ncheck:graphs FAILED — a Dungeon Recipe can roll an unsound Dungeon Graph.');
  process.exit(1);
}
