// Dungeon Graph builder (GLOSSARY.md) — turns a zone's Dungeon Recipe into
// the concrete layout of one visit: which floors exist, and which descent on
// which floor leads where.
//
// Graph shape:
//   nodes: { [id]: { kind, upDir, puzzle?, template?, boss? } }
//   edges: [{ from, dir, to, reveal }]
//
//   kind    a Floor Kind (src/systems/dungeonFloorKinds.js)
//   upDir   the footprint of the floor's way back up ('S', or the West/East
//           footprint matching the descent that led there — the "matching
//           doors" rule); absent on the Entrance, whose way out is the ∩ door
//   dir     the descent's footprint on the `from` floor: N, W or E
//   reveal  what opens the descent (a Reveal): 'open' needs nothing; 'key'
//           spends the Skull Key; 'panels' is Green's floor-panel NPC puzzle
//           on the Branch; 'offering' is the Pyramid's Legend of Three
//
// Pure (no game state, no imports beyond the Floor Kind table) so check:data,
// the dungeon editor and the game all build and validate graphs the same way.

import { FLOOR_KINDS } from './dungeonFloorKinds.js';

const DIRS = ['N', 'W', 'E'];
const REVEALS = ['open', 'key', 'panels', 'offering'];
const BRANCH_PUZZLES = ['panels'];

// A descent's id names its footprint — what DungeonSystem._ascend matches to
// land the player back on the exact door they took down.
export const DESCENT_ID_FOR = { N: 'north', W: 'west', E: 'east' };

// Where the up-stairs of a floor sits, from the descent that leads into it.
const UP_DIR_FOR = { N: 'S', W: 'W', E: 'E' };

/** Recipe shape errors (empty array when the recipe is usable). */
export function validateRecipe(recipe) {
  const errors = [];
  if (!recipe || typeof recipe !== 'object') return ['recipe is not an object'];
  const [min, max] = recipe.corridors ?? [];
  if (!Number.isInteger(min) || !Number.isInteger(max) || min < 1 || max < min) {
    errors.push('corridors must be [min, max] with 1 <= min <= max');
  }
  if (!recipe.shapes || !(recipe.shapes.chain > 0)) errors.push('shapes.chain must be a positive weight');
  if (!BRANCH_PUZZLES.includes(recipe.branchPuzzle)) {
    errors.push(`branchPuzzle must be one of ${BRANCH_PUZZLES.join(', ')}`);
  }
  if (recipe.sideRooms?.trial !== 'corridor') errors.push("sideRooms.trial must be 'corridor'");
  const trapHosts = recipe.sideRooms?.trapRoom;
  if (!Array.isArray(trapHosts) || !trapHosts.length || trapHosts.some(h => h !== 'branch')) {
    errors.push("sideRooms.trapRoom must list its host kinds (today: ['branch'])");
  }
  return errors;
}

/**
 * Roll one visit's Dungeon Graph from `recipe`. `rng` returns [0, 1).
 *
 * Today every recipe lays the same chain Green has always had —
 * Entrance → Corridor → Branch → Pyramid → Vault, with the Trial off the
 * Corridor's North and the Trap Room off the Branch's North. The corridor
 * count and shape fields are read so their range can widen without a format
 * change.
 */
export function buildDungeonGraph(recipe, rng = Math.random) {
  const nodes = {};
  const edges = [];
  const addNode = (id, kind, extra = {}) => { nodes[id] = { kind, ...extra }; };
  const link = (from, dir, to, reveal) => {
    edges.push({ from, dir, to, reveal });
    nodes[to].upDir = UP_DIR_FOR[dir];
  };

  const [min, max] = recipe.corridors;
  const corridorCount = min + Math.floor(rng() * (max - min + 1));

  addNode('entrance', 'entrance');
  const corridorIds = [];
  for (let i = 1; i <= corridorCount; i++) {
    const id = `corridor${i}`;
    addNode(id, 'corridor');
    corridorIds.push(id);
  }
  addNode('trial', 'puzzleRoom');
  addNode('branch', 'branch', { puzzle: recipe.branchPuzzle });
  addNode('trapRoom', 'trapRoom');
  addNode('pyramid', 'pyramid');
  addNode('vault', 'vault', { boss: recipe.boss });

  // The corridor layer: a chain North from the Entrance. The last corridor
  // spends the Skull Key on its West descent into the Branch.
  let previous = 'entrance';
  for (const id of corridorIds) {
    link(previous, 'N', id, 'open');
    previous = id;
  }
  const lastCorridor = corridorIds[corridorIds.length - 1];
  link(lastCorridor, 'W', 'branch', 'key');
  link(lastCorridor, 'N', 'trial', 'open');

  link('branch', 'N', 'trapRoom', 'open');
  link('branch', 'E', 'pyramid', recipe.branchPuzzle);
  link('pyramid', 'N', 'vault', 'offering');

  return { nodes, edges };
}

/** The descents leaving `nodeId`, in graph order. */
export function edgesFrom(graph, nodeId) {
  return graph.edges.filter(e => e.from === nodeId);
}

/** The descent that first leads into `nodeId` (null for the Entrance). */
export function edgeInto(graph, nodeId) {
  return graph.edges.find(e => e.to === nodeId) ?? null;
}

/**
 * Nodes reachable from the Entrance without crossing a descent whose Reveal
 * is in `blockedReveals` — e.g. the floors a Skull Key can drop on are the
 * ones reachable before the 'key' edge it opens.
 */
export function reachableNodes(graph, blockedReveals = []) {
  const seen = new Set(['entrance']);
  const queue = ['entrance'];
  while (queue.length) {
    const id = queue.shift();
    for (const e of edgesFrom(graph, id)) {
      if (blockedReveals.includes(e.reveal) || seen.has(e.to)) continue;
      seen.add(e.to);
      queue.push(e.to);
    }
  }
  return seen;
}

/** Structural errors in a built graph (empty array when it is sound). */
export function validateGraph(graph) {
  const errors = [];
  const ids = Object.keys(graph.nodes);
  if (graph.nodes.entrance?.kind !== 'entrance') errors.push('no Entrance node');
  for (const id of ids) {
    if (!FLOOR_KINDS[graph.nodes[id].kind]) errors.push(`${id}: unknown floor kind "${graph.nodes[id].kind}"`);
  }
  const ofKind = kind => ids.filter(id => graph.nodes[id].kind === kind);
  if (ofKind('branch').length !== 1) errors.push('exactly one Branch required');
  if (ofKind('vault').length !== 1) errors.push('exactly one Vault required');
  const [branch] = ofKind('branch');
  if (branch && !edgesFrom(graph, branch).some(e => graph.nodes[e.to]?.kind === 'pyramid')) {
    errors.push('the Branch must hold the Pyramid descent');
  }
  for (const e of graph.edges) {
    if (!graph.nodes[e.from] || !graph.nodes[e.to]) errors.push(`edge ${e.from}→${e.to}: unknown node`);
    if (!DIRS.includes(e.dir)) errors.push(`edge ${e.from}→${e.to}: bad dir "${e.dir}"`);
    if (!REVEALS.includes(e.reveal)) errors.push(`edge ${e.from}→${e.to}: bad reveal "${e.reveal}"`);
  }
  for (const id of ids) {
    const used = edgesFrom(graph, id).map(e => e.dir);
    const upDir = graph.nodes[id].upDir;
    if (upDir && upDir !== 'S') used.push(upDir);
    if (new Set(used).size !== used.length) errors.push(`${id}: two doors share one footprint`);
  }
  const reachable = reachableNodes(graph);
  for (const id of ids) if (!reachable.has(id)) errors.push(`${id}: unreachable from the Entrance`);
  return errors;
}
