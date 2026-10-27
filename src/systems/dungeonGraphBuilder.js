// Dungeon Graph builder (GLOSSARY.md) — turns a zone's Dungeon Recipe into
// the concrete layout of one visit: which floors exist, and which descent on
// which floor leads where.
//
// Graph shape:
//   nodes: { [id]: { kind, upDir, puzzle?, template?, boss? } }
//   edges: [{ from, dir, to, reveal, hidden? }]
//
//   kind    a Floor Kind (src/systems/dungeonFloorKinds.js)
//   upDir   the footprint of the floor's way back up — always 'S', so every
//           descent footprint (N/W/E) stays free for the graph to use;
//           absent on the Entrance, whose way out is the ∩ door
//   dir     the descent's footprint on the `from` floor: N, W or E, or a
//           diagonal corner (NW/NE) for a Hidden Descent
//   reveal  what opens the descent (a Reveal): 'open' needs nothing; 'key'
//           spends the Skull Key; 'panels' is Green's floor-panel NPC puzzle
//           on the Branch; 'offering' is the Pyramid's Legend of Three;
//           'clear' fires once the floor's enemies and Spawn Vents are gone
//   hidden  a Hidden Descent: not drawn at all until its Reveal fires
//
// Layout (buildDungeonGraph): Entrance → the corridor layer → Branch →
// Pyramid → Vault. The corridor layer is 1-3 corridors, either a chain (each
// leads to the next; the last spends the Skull Key into the Branch) or a
// triangle (the last two corridors, A and B, both lead into the Branch, and A
// also leads to B — A's Branch door takes the key, B's is open, so the long
// way round the loop is the bypass and the key is a shortcut). The
// Trial hangs off a corridor's North; the Trap Room off any free door of a
// floor kind the recipe names. On a `diagonals.chance` roll, one corridor
// also gets a Hidden Descent in a North corner: a shortcut that skips ahead
// (to the Branch, a later corridor, or a side room it doesn't already lead
// to), appearing when its Reveal fires.
//
// Pure (no game state, no imports beyond the Floor Kind table) so check:data,
// the dungeon editor and the game all build and validate graphs the same way.

import { FLOOR_KINDS } from './dungeonFloorKinds.js';

const DIRS = ['N', 'W', 'E'];
const DIAGONALS = ['NW', 'NE'];
const REVEALS = ['open', 'key', 'panels', 'offering', 'clear', 'triggers'];
// What may open a Hidden Descent: a floor event, never a held item — a door
// the player can't see must not ask for a key.
const HIDDEN_REVEALS = ['clear', 'triggers'];
const BRANCH_PUZZLES = ['panels'];
const SHAPES = ['chain', 'triangle'];
const TRAP_ROOM_HOSTS = ['branch', 'corridor'];

// A descent's id names its footprint — what DungeonSystem._ascend matches to
// land the player back on the exact door they took down.
export const DESCENT_ID_FOR = { N: 'north', W: 'west', E: 'east', NW: 'northwest', NE: 'northeast' };

/** Recipe shape errors (empty array when the recipe is usable). */
export function validateRecipe(recipe) {
  const errors = [];
  if (!recipe || typeof recipe !== 'object') return ['recipe is not an object'];
  const [min, max] = recipe.corridors ?? [];
  if (!Number.isInteger(min) || !Number.isInteger(max) || min < 1 || max < min || max > 3) {
    errors.push('corridors must be [min, max] with 1 <= min <= max <= 3');
  }
  const shapes = recipe.shapes ?? {};
  for (const [shape, weight] of Object.entries(shapes)) {
    if (!SHAPES.includes(shape)) errors.push(`unknown shape "${shape}"`);
    if (!(weight >= 0)) errors.push(`shape weight for "${shape}" must be >= 0`);
  }
  if (!((shapes.chain ?? 0) + (shapes.triangle ?? 0) > 0)) errors.push('shapes needs a positive weight');
  if (min < 2 && !(shapes.chain > 0)) errors.push('a recipe that can roll 1 corridor needs a chain weight (a triangle takes 2)');
  if (!BRANCH_PUZZLES.includes(recipe.branchPuzzle)) {
    errors.push(`branchPuzzle must be one of ${BRANCH_PUZZLES.join(', ')}`);
  }
  if (recipe.sideRooms?.trial !== 'corridor') errors.push("sideRooms.trial must be 'corridor'");
  const trapHosts = recipe.sideRooms?.trapRoom;
  if (!Array.isArray(trapHosts) || !trapHosts.length || trapHosts.some(h => !TRAP_ROOM_HOSTS.includes(h))) {
    errors.push(`sideRooms.trapRoom must list host kinds from ${TRAP_ROOM_HOSTS.join(', ')}`);
  }
  if (recipe.diagonals !== undefined) {
    const { chance, reveals } = recipe.diagonals ?? {};
    if (!(chance >= 0 && chance <= 1)) errors.push('diagonals.chance must be between 0 and 1');
    if (!Array.isArray(reveals) || !reveals.length || reveals.some(r => !HIDDEN_REVEALS.includes(r))) {
      errors.push(`diagonals.reveals must list Reveals from ${HIDDEN_REVEALS.join(', ')}`);
    }
  }
  return errors;
}

function pickWeighted(weights, rng) {
  const entries = Object.entries(weights).filter(([, w]) => w > 0);
  let r = rng() * entries.reduce((sum, [, w]) => sum + w, 0);
  for (const [key, w] of entries) {
    if ((r -= w) < 0) return key;
  }
  return entries[entries.length - 1][0];
}

/** Roll one visit's Dungeon Graph from `recipe`. `rng` returns [0, 1). */
export function buildDungeonGraph(recipe, rng = Math.random) {
  const pick = list => list[Math.floor(rng() * list.length)];
  const nodes = {};
  const edges = [];
  const addNode = (id, kind, extra = {}) => { nodes[id] = { kind, upDir: 'S', ...extra }; };
  const freeDirs = id => DIRS.filter(dir => !edges.some(e => e.from === id && e.dir === dir));
  const link = (from, to, reveal, dir = pick(freeDirs(from))) => edges.push({ from, dir, to, reveal });

  const [min, max] = recipe.corridors;
  const corridorCount = min + Math.floor(rng() * (max - min + 1));
  const shape = corridorCount >= 2
    ? pickWeighted(recipe.shapes, rng)
    : 'chain';

  nodes.entrance = { kind: 'entrance' };
  const corridors = [];
  for (let i = 1; i <= corridorCount; i++) {
    addNode(`corridor${i}`, 'corridor');
    corridors.push(`corridor${i}`);
  }
  addNode('trial', 'puzzleRoom');
  addNode('branch', 'branch', { puzzle: recipe.branchPuzzle });
  addNode('trapRoom', 'trapRoom');
  addNode('pyramid', 'pyramid');
  addNode('vault', 'vault', { boss: recipe.boss });

  // The Trial claims its North first, so every other door picks around it.
  link(pick(corridors), 'trial', 'open', 'N');

  link('entrance', corridors[0], 'open');
  if (shape === 'triangle') {
    const a = corridors[corridorCount - 2];
    const b = corridors[corridorCount - 1];
    for (let i = 0; i < corridorCount - 2; i++) link(corridors[i], corridors[i + 1], 'open');
    // A's own door into the Branch is the Skull Key's shortcut; the long way
    // round (A → B → Branch) is open — the bypass. Keyed on B's door instead,
    // the open A door would be the shorter route and the key worthless.
    link(a, b, 'open');
    link(a, 'branch', 'key');
    link(b, 'branch', 'open');
  } else {
    for (let i = 0; i < corridorCount - 1; i++) link(corridors[i], corridors[i + 1], 'open');
    link(corridors[corridorCount - 1], 'branch', 'key');
  }

  link('branch', 'pyramid', recipe.branchPuzzle);
  const trapHosts = Object.keys(nodes).filter(id =>
    recipe.sideRooms.trapRoom.includes(nodes[id].kind) && freeDirs(id).length > 0);
  link(pick(trapHosts), 'trapRoom', 'open');
  link('pyramid', 'vault', 'offering');

  if (recipe.diagonals && rng() < recipe.diagonals.chance) {
    const from = pick(corridors);
    const ahead = corridors.slice(corridors.indexOf(from) + 1);
    const targets = [...ahead, 'branch', 'trial', 'trapRoom']
      .filter(to => !edges.some(e => e.from === from && e.to === to));
    if (targets.length) {
      edges.push({ from, dir: pick(DIAGONALS), to: pick(targets), reveal: pick(recipe.diagonals.reveals), hidden: true });
    }
  }

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
 * Nodes reachable from the Entrance through descents whose Reveal is in
 * `reveals` (any descent when null) — e.g. the floors a Skull Key can drop
 * on are the ones reachable through 'open' descents alone.
 */
export function reachableNodes(graph, reveals = null) {
  const seen = new Set(['entrance']);
  const queue = ['entrance'];
  while (queue.length) {
    const id = queue.shift();
    for (const e of edgesFrom(graph, id)) {
      if ((reveals && !reveals.includes(e.reveal)) || seen.has(e.to)) continue;
      seen.add(e.to);
      queue.push(e.to);
    }
  }
  return seen;
}

/** The floors the visit's Skull Key may drop on: before its door, and able to hold it. */
export function skullKeyNodes(graph) {
  return [...reachableNodes(graph, ['open'])].filter(id => FLOOR_KINDS[graph.nodes[id].kind].holdsSkullKey);
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
    if (!DIRS.includes(e.dir) && !(e.hidden && DIAGONALS.includes(e.dir))) {
      errors.push(`edge ${e.from}→${e.to}: bad dir "${e.dir}"`);
    }
    if (!REVEALS.includes(e.reveal)) errors.push(`edge ${e.from}→${e.to}: bad reveal "${e.reveal}"`);
    if (e.hidden && !HIDDEN_REVEALS.includes(e.reveal)) {
      errors.push(`edge ${e.from}→${e.to}: a Hidden Descent can't open with "${e.reveal}"`);
    }
  }
  for (const id of ids) {
    const used = edgesFrom(graph, id).map(e => e.dir);
    if (new Set(used).size !== used.length) errors.push(`${id}: two doors share one footprint`);
  }
  // A Hidden Descent is a shortcut, never the only way: every floor must be
  // reachable through the doors that are drawn.
  const reachable = reachableNodes({ ...graph, edges: graph.edges.filter(e => !e.hidden) });
  for (const id of ids) if (!reachable.has(id)) errors.push(`${id}: unreachable from the Entrance`);
  if (graph.edges.some(e => e.reveal === 'key') && skullKeyNodes(graph).length === 0) {
    errors.push('no floor before the Skull Key door can hold the key');
  }
  const intoPyramid = graph.edges.filter(e => graph.nodes[e.to]?.kind === 'pyramid');
  if (intoPyramid.some(e => e.reveal === 'open')) errors.push('the way to the Pyramid must be puzzle-locked');
  return errors;
}
