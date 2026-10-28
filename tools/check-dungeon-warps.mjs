#!/usr/bin/env node
// Dungeon warp guard — every CheatMenu DUNGEON WARP entry must land on the
// floor it names. The warp crosses three files (DungeonSystem.debugWarpItems
// builds the entry, CheatMenu turns the selection into an action and
// dispatches it, DungeonSystem.debugWarpTo lands it), and a dungeon rework
// once changed one end without the middle: every warp silently aimed at
// nothing. This drives the real menu path headlessly so that shape fails the
// build instead of a playtest.
//
// Run: node tools/check-dungeon-warps.mjs   (part of `npm run build`)
// Exit 0 = every entry lands, from outside the Dungeon and floor-to-floor.

import { loadGame, construct, seedAll, unseed } from './lib/headless-game.mjs';

const ZONES = ['green', 'yellow', 'red', 'cyan'];
const SEED = 20261028;

/** Fresh Game standing in a D room's exterior in `zone`, its visit rolled. */
function gameInDungeonRoom(Game, zone) {
  const game = construct(Game, SEED);
  seedAll(SEED);
  try {
    game.enterRestState();
    game.enterExploreState('north');
    game.currentRoom.zone = zone;
    if (!game.currentRoom.dungeon) game.roomGenerator.generateDungeonRoom(game.currentRoom);
    // Roll the visit under the seed too, so every fresh Game shares one
    // Dungeon Graph and the exterior pass can find the same entries.
    game.dungeonSystem.rollVisit();
  } finally { unseed(); }
  return game;
}

/** The DUNGEON WARP folder exactly as the menu would show it. */
function warpEntries(game) {
  const tree = game.cheatMenu.buildTree();
  return tree.children.find(c => c.name === 'DUNGEON WARP')?.items ?? [];
}

/** Select an entry through the real CheatMenu path; return a failure string or null. */
function warp(game, entry) {
  const result = game.cheatMenu._activateItem(entry);
  if (result?.action !== 'dungeon_warp') return `selection produced ${JSON.stringify(result)}`;
  game.cheatMenu.dispatchAction(result);
  const floor = game.activeFloor;
  if (!game.player.inDungeon) return 'player not in the Dungeon after warp';
  if (floor?.nodeId !== entry.nodeId) return `landed on ${floor?.nodeId ?? 'nothing'}`;
  // The template is the graph node's (generatePuzzleRoom reads it from there).
  const template = game.dungeonSystem.interiorState.graph.nodes[entry.nodeId]?.template;
  if (entry.template && template !== entry.template) {
    return `template ${template ?? 'none'} instead of ${entry.template}`;
  }
  return null;
}

const { Game } = await loadGame();
const failures = [];
let checked = 0;

for (const zone of ZONES) {
  const probe = gameInDungeonRoom(Game, zone);
  const entries = warpEntries(probe);
  if (!entries.length) { failures.push(`${zone}: no DUNGEON WARP folder in a D room`); continue; }

  // From the exterior: each entry on its own fresh Game, as a player standing
  // at the D room door would use it.
  for (const entry of entries) {
    const game = gameInDungeonRoom(Game, zone);
    const fresh = warpEntries(game).find(e => e.name === entry.name);
    const why = fresh ? warp(game, fresh) : 'entry missing on a fresh Game';
    if (why) failures.push(`${zone} exterior → ${entry.name}: ${why}`);
    checked++;
  }

  // Floor to floor: chain every entry on one Game, rebuilding the menu each
  // time as reopening it would.
  const chain = gameInDungeonRoom(Game, zone);
  for (const { name } of entries) {
    const entry = warpEntries(chain).find(e => e.name === name);
    const why = entry ? warp(chain, entry) : 'entry vanished mid-visit';
    if (why) failures.push(`${zone} chained → ${name}: ${why}`);
    checked++;
  }
}

if (failures.length) {
  console.error(`Dungeon warps: ${failures.length} of ${checked} failed`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`Dungeon warps ok (${checked} warps across ${ZONES.join('/')}).`);
process.exit(0);
