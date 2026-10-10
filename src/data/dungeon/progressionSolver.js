// Progression Solver — the static proof that a dungeon template cannot
// softlock (bug #401, category [softlock]).
//
// A softlock is a state the player can reach from which the way on or the way
// back can no longer be reached, and only death gets them out. The solver
// explores every state the player can reach in a template and checks that the
// goal is still reachable from each one:
//
//   floor mode (Interior templates — numbered floors and the Trap Room):
//     every staircase footprint, every landing cell beside one and the
//     Entrance's arrival cell must connect using only the base kit — no tools,
//     no keys. Anything behind a tool tile is optional by contract.
//   puzzle mode (Puzzle Room templates — a sealed room):
//     from the North landing, the player must be able to make every trigger
//     active and reach the Exit ('X') using only the tools the room itself
//     supplies (pedestal weapon, dais Bomb Bag), and no reachable state —
//     a Push Rock shoved the wrong way, a one-way hook across a gap taken too
//     early — may cut that off.
//
// Timing is not proven: timed triggers that can't be struck in one swing get
// a warning when the walk between them looks longer than their timer.
//
// Pure, imports only other pure dungeon data modules, so the editor's
// CommonJS main process, the plain-Node data gate and the game all share it.

import { DUNGEON_TILES } from './tiles.js';
import { reservedFootprintCells, landingCellFor } from './footprints.js';

const CELL_PX = 16;                 // GRID.CELL_SIZE
const WALK_PX_PER_SECOND = 180;     // PLAYER_SPEED
const BASE_STRIKE_CELLS = 1.5;      // a held melee weapon reaches the 8 neighbouring cells
const HOOK_MIN_CELLS = 4;           // hook posts only count a crack segment this far out (generatePuzzleRoom)
const BOMB_BLAST_CELLS = 40 / CELL_PX;
const TORCH_IGNITE_CELLS = 1.2;     // TORCH_INTERACT_RADIUS
// Exploring every order of every trigger is exponential; past this many
// states the proof is abandoned with a warning rather than hanging the editor.
const STATE_CAP = 100000;

const DIRECTIONS_8 = [
  [-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1],
];
const DIRECTIONS_4 = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const DIRECTION_NAMES = { '-1,0': 'north', '1,0': 'south', '0,-1': 'west', '0,1': 'east' };

/**
 * The tools an item gives the Progression Solver: { tag: reach-in-cells | true }.
 * Callers look the item up themselves (pedestal weaponChar → ITEMS) so this
 * module stays free of the item catalogue.
 */
export function toolKitForItem(item) {
  const kit = {};
  if (!item) return kit;
  if (item.weaponSubtype === 'whip') kit.whip = item.whipReach || 5;
  if (item.boomerang) kit.boomerang = item.boomerangMaxCells ?? 5;
  if (item.name === 'Torch') kit.torch = true;
  if (item.effect === 'explode') kit.bomb = true;
  if (item.opensAnyLock) kit.anyLock = true;
  return kit;
}

const cellName = (row, col) => `(${row},${col})`;

/**
 * @param {object} args
 * @param {string[]} args.grid       the template's rows
 * @param {object}   [args.fixtures] { triggers, hookPosts, pedestal, dais } — puzzle mode
 * @param {'floor'|'puzzle'} args.mode
 * @param {object}   args.contract   footprintContract.json
 * @param {object}   [args.suppliedTools] toolKitForItem() of the pedestal item — picked up at the pedestal
 * @returns {{ ok: boolean, errors: string[], warnings: string[], regions: { unreached: {row:number,col:number}[] } }}
 */
export function solveTemplate({ grid, fixtures = {}, mode, contract, suppliedTools = {} }) {
  const errors = [];
  const warnings = [];
  const { rows, cols } = contract;

  for (let r = 0; r < rows; r++) {
    for (const ch of [...(grid[r] ?? '')]) {
      const tile = DUNGEON_TILES[ch];
      if (!tile || !tile.modes.includes(mode)) {
        errors.push(`Row ${r} has "${ch}", which isn't a ${mode} tile.`);
        return { ok: false, errors, warnings, regions: { unreached: [] } };
      }
    }
  }

  const map = buildTileMap(grid, mode, contract);
  const result = mode === 'floor'
    ? solveFloor(map, contract, errors, warnings)
    : solvePuzzle(map, contract, fixtures, suppliedTools, errors, warnings);
  return { ok: errors.length === 0, errors, warnings, regions: result };
}

// ── Tile map ────────────────────────────────────────────────────────────────

// The glyph grid as the game stamps it: the outer ring is always wall, and on
// floor templates the footprint cells are always plain floor
// (applyTemplateToCollisionMap and getTemplateWaterCells skip them).
function buildTileMap(grid, mode, contract) {
  const { rows, cols } = contract;
  const reserved = new Set(
    mode === 'floor' ? reservedFootprintCells(contract).map(({ row, col }) => row * cols + col) : []
  );
  const tiles = new Array(rows * cols);
  for (let r = 0; r < rows; r++) {
    const line = [...(grid[r] ?? '')];
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      if (r === 0 || c === 0 || r === rows - 1 || c === cols - 1) tiles[i] = '#';
      else if (reserved.has(i)) tiles[i] = '.';
      else tiles[i] = line[c] ?? '#';
    }
  }
  return { rows, cols, tiles };
}

// Label 4-connected walkable regions. `blocked(i)` decides walkability.
function labelRegions(map, blocked) {
  const { rows, cols } = map;
  const labels = new Int32Array(rows * cols).fill(-1);
  for (let start = 0; start < rows * cols; start++) {
    if (labels[start] !== -1 || blocked(start)) continue;
    // The region's label is its lowest cell index — stable across geometries,
    // so a state key can name "the region containing cell i".
    labels[start] = start;
    const queue = [start];
    while (queue.length) {
      const i = queue.pop();
      const r = Math.floor(i / cols), c = i % cols;
      for (const [dr, dc] of DIRECTIONS_4) {
        const nr = r + dr, nc = c + dc;
        if (nr < 0 || nc < 0 || nr >= rows || nc >= cols) continue;
        const j = nr * cols + nc;
        if (labels[j] !== -1 || blocked(j)) continue;
        labels[j] = start;
        queue.push(j);
      }
    }
  }
  return labels;
}

// ── Floor mode ──────────────────────────────────────────────────────────────

function solveFloor(map, contract, errors, warnings) {
  const { cols, tiles } = map;
  const labels = labelRegions(map, i => DUNGEON_TILES[tiles[i]].solid);
  const { STAIRS_COL, EXIT_ROW } = contract;

  const footprints = reservedFootprintCells(contract);
  const names = ['Up-stairs', 'North descent', 'West descent', 'East descent'];
  const points = footprints.map((cell, k) => ({ ...cell, what: names[k] }));
  // Where the player lands beside each footprint: beside the up-stairs on
  // the way down (DungeonSystem._landingAnchorFor), beside a descent on the
  // way back up (DungeonSystem._ascend).
  for (let k = 0; k < footprints.length; k++) {
    const { row, col } = footprints[k];
    points.push({ ...landingCellFor(row, col, contract), what: `${names[k]} landing` });
  }
  // The Entrance's arrival cell and the cell beside its exterior door.
  points.push({ row: EXIT_ROW - 2, col: STAIRS_COL, what: 'Entrance arrival' });
  points.push({ row: EXIT_ROW - 1, col: STAIRS_COL, what: 'Entrance door' });

  for (const p of points) {
    if (DUNGEON_TILES[tiles[p.row * cols + p.col]].solid) {
      errors.push(`${p.what} ${cellName(p.row, p.col)} is solid — the player would land in a wall.`);
    }
  }
  if (errors.length) return { unreached: [] };

  const anchor = labels[points[0].row * cols + points[0].col];
  for (const p of points) {
    if (labels[p.row * cols + p.col] !== anchor) {
      errors.push(`${p.what} ${cellName(p.row, p.col)} is cut off from the Up-stairs without tools.`);
    }
  }

  const unreached = [];
  let unreachedSpawns = 0;
  for (let i = 0; i < tiles.length; i++) {
    if (labels[i] === -1 || labels[i] === anchor) continue;
    unreached.push({ row: Math.floor(i / cols), col: i % cols });
    if (tiles[i] === 'E') unreachedSpawns++;
  }
  if (unreachedSpawns) {
    warnings.push(`${unreachedSpawns} enemy spawn mark(s) sit in a sealed pocket the player can't reach.`);
  }
  if (unreached.length) {
    warnings.push(`${unreached.length} walkable cell(s) can't be reached from the staircases.`);
  }
  return { unreached };
}

// ── Puzzle mode ─────────────────────────────────────────────────────────────

function solvePuzzle(map, contract, fixtures, suppliedTools, errors, warnings) {
  const { rows, cols, tiles } = map;
  const at = (row, col) => row * cols + col;
  const rowOf = i => Math.floor(i / cols);
  const colOf = i => i % cols;

  const exitIndex = tiles.indexOf('X');
  if (exitIndex === -1) {
    errors.push('No Exit (X) — the room has no way back up.');
    return { unreached: [] };
  }

  const triggers = (fixtures.triggers ?? []).map(t => ({ ...t, index: at(t.row, t.col) }));
  const pushRocks = triggers.filter(t => t.kind === 'push');
  const plainTriggers = triggers.filter(t => t.kind !== 'push');
  const hookPosts = (fixtures.hookPosts ?? []).map(p => at(p.row, p.col));
  const bombables = [];
  for (let i = 0; i < tiles.length; i++) if (tiles[i] === 'B') bombables.push(i);

  // Tool sources: the pedestal holds the supplied weapon, the dais holds the
  // Bomb Bag. A source with no cell is treated as already in hand.
  const sources = [];
  if (Object.keys(suppliedTools).length) {
    sources.push({ index: fixtures.pedestal ? at(fixtures.pedestal.row, fixtures.pedestal.col) : -1, kit: suppliedTools, what: 'the pedestal' });
  }
  if (fixtures.dais) sources.push({ index: at(fixtures.dais.row, fixtures.dais.col), kit: { bomb: true }, what: 'the dais' });

  const kitOf = toolsMask => {
    const kit = {};
    sources.forEach((s, k) => { if (toolsMask & (1 << k)) Object.assign(kit, s.kit); });
    return kit;
  };

  // Every Puzzle Room is entered by a North descent, so the North landing is the only way in.
  const arrival = landingCellFor(contract.NORTH_ROW, contract.STAIRS_COL, contract);
  const arrivalIndex = at(arrival.row, arrival.col);

  // Geometry = which Bombable Walls are open + where each Push Rock sits.
  // rockDirs[k] is -1 (unpushed) or an index into DIRECTIONS_4.
  const rockCell = (k, rockDirs) => {
    const rock = pushRocks[k];
    const d = rockDirs[k];
    return d === -1 ? rock.index : at(rock.row + DIRECTIONS_4[d][0], rock.col + DIRECTIONS_4[d][1]);
  };
  const geometryCache = new Map();
  const geometry = (openMask, rockDirs) => {
    const key = `${openMask}|${rockDirs.join(',')}`;
    let geo = geometryCache.get(key);
    if (geo) return geo;
    const rockCells = new Set(rockDirs.map((_, k) => rockCell(k, rockDirs)));
    const openCells = new Set(bombables.filter((_, k) => openMask & (1 << k)));
    const solid = i => rockCells.has(i) || (DUNGEON_TILES[tiles[i]].solid && !openCells.has(i));
    // A strike passes over gaps and water, never through walls or rocks.
    const stopsStrike = i => rockCells.has(i) || (solid(i) && !DUNGEON_TILES[tiles[i]].reachOver);
    geo = { solid, stopsStrike, labels: labelRegions(map, solid) };
    geometryCache.set(key, geo);
    return geo;
  };

  // Is there a cell in region `label` within `reach` of `target` along one of
  // the 8 directions, with nothing between that stops a strike?
  const struckFrom = (geo, label, target, reach, minReach = 0) => {
    const r0 = rowOf(target), c0 = colOf(target);
    for (const [dr, dc] of DIRECTIONS_8) {
      const step = Math.hypot(dr, dc);
      for (let k = 1; k * step <= reach; k++) {
        const r = r0 + dr * k, c = c0 + dc * k;
        if (r < 0 || c < 0 || r >= rows || c >= cols) break;
        const i = at(r, c);
        if (geo.labels[i] === label && k * step >= minReach) return true;
        if (geo.stopsStrike(i)) break;
      }
    }
    return false;
  };
  const regionWithin = (geo, label, target, radius) => {
    const r0 = rowOf(target), c0 = colOf(target);
    const span = Math.ceil(radius);
    for (let r = r0 - span; r <= r0 + span; r++) {
      for (let c = c0 - span; c <= c0 + span; c++) {
        if (r < 0 || c < 0 || r >= rows || c >= cols) continue;
        if (Math.hypot(r - r0, c - c0) > radius) continue;
        if (geo.labels[at(r, c)] === label) return true;
      }
    }
    return false;
  };

  const canActivate = (trigger, geo, label, kit) => {
    if (trigger.kind === 'panel') return geo.labels[trigger.index] === label;
    if (trigger.kind === 'torch') return !!kit.torch && regionWithin(geo, label, trigger.index, TORCH_IGNITE_CELLS);
    // switch — struck by whatever the player holds
    if (struckFrom(geo, label, trigger.index, BASE_STRIKE_CELLS)) return true;
    if (kit.whip && struckFrom(geo, label, trigger.index, kit.whip)) return true;
    if (kit.boomerang && struckFrom(geo, label, trigger.index, kit.boomerang)) return true;
    return false;
  };

  // ── State search ──
  // A state: the region the player stands in, which plain triggers are
  // active, which Bombable Walls are open, which tool sources are picked up,
  // and where every Push Rock sits.
  const start = {
    label: geometry(0, pushRocks.map(() => -1)).labels[arrivalIndex],
    trig: 0, open: 0, tools: 0, rocks: pushRocks.map(() => -1),
  };
  if (start.label === -1) {
    errors.push(`The North landing ${cellName(arrival.row, arrival.col)} is solid — the player arrives in a wall.`);
    return { unreached: [] };
  }

  const keyOf = s => `${s.label}|${s.trig}|${s.open}|${s.tools}|${s.rocks.join(',')}`;
  const states = [start];
  const parent = [-1];
  const via = [''];
  const index = new Map([[keyOf(start), 0]]);
  const edges = [];      // edges[i] = successor state indices
  const reached = new Set();
  const allTriggersMask = (1 << plainTriggers.length) - 1;

  const isGoal = s => {
    const geo = geometry(s.open, s.rocks);
    return s.trig === allTriggersMask
      && s.rocks.every(d => d !== -1)
      && geo.labels[exitIndex] === s.label;
  };

  let capped = false;
  for (let n = 0; n < states.length; n++) {
    if (states.length > STATE_CAP) { capped = true; break; }
    const s = states[n];
    const geo = geometry(s.open, s.rocks);
    const kit = kitOf(s.tools);
    for (let i = 0; i < geo.labels.length; i++) if (geo.labels[i] === s.label) reached.add(i);
    const out = [];
    const push = (next, action) => {
      const key = keyOf(next);
      let j = index.get(key);
      if (j === undefined) {
        j = states.length;
        index.set(key, j);
        states.push(next);
        parent.push(n);
        via.push(action);
      }
      out.push(j);
    };

    sources.forEach((src, k) => {
      if (s.tools & (1 << k)) return;
      if (src.index === -1 || geo.labels[src.index] === s.label) {
        push({ ...s, tools: s.tools | (1 << k) }, `take ${src.what}`);
      }
    });
    plainTriggers.forEach((t, k) => {
      if (s.trig & (1 << k)) return;
      if (canActivate(t, geo, s.label, kit)) {
        push({ ...s, trig: s.trig | (1 << k) }, `activate ${t.kind} ${cellName(t.row, t.col)}`);
      }
    });
    if (kit.bomb) {
      bombables.forEach((b, k) => {
        if (s.open & (1 << k)) return;
        if (!regionWithin(geo, s.label, b, BOMB_BLAST_CELLS)) return;
        const open = s.open | (1 << k);
        // A region's label is its lowest cell, so it names a cell still in the grown region.
        const label = geometry(open, s.rocks).labels[s.label];
        push({ ...s, open, label }, `bomb ${cellName(rowOf(b), colOf(b))}`);
      });
    }
    if (kit.whip) {
      for (const post of hookPosts) {
        if (geo.solid(post) || geo.labels[post] === s.label) continue;
        if (!struckFrom(geo, s.label, post, kit.whip, HOOK_MIN_CELLS)) continue;
        push({ ...s, label: geo.labels[post] }, `hook to post ${cellName(rowOf(post), colOf(post))}`);
      }
    }
    pushRocks.forEach((rock, k) => {
      if (s.rocks[k] !== -1) return;
      DIRECTIONS_4.forEach(([dr, dc], d) => {
        const from = at(rock.row - dr, rock.col - dc);
        const to = at(rock.row + dr, rock.col + dc);
        if (geo.labels[from] !== s.label) return;
        // PushRock only slides into an open cell, never onto the stairs.
        if (geo.solid(to) || to === exitIndex) return;
        const rocks = s.rocks.slice();
        rocks[k] = d;
        const label = geometry(s.open, rocks).labels[from];
        push({ ...s, rocks, label }, `push rock ${cellName(rock.row, rock.col)} ${DIRECTION_NAMES[`${dr},${dc}`]}`);
      });
    });
    edges[n] = out;
  }

  if (capped) {
    warnings.push(`Solver stopped after ${STATE_CAP} states — too many trigger orders to prove this room safe.`);
  }

  // Which explored states can still reach a goal state?
  const predecessors = states.map(() => []);
  edges.forEach((out, n) => { for (const j of out) predecessors[j].push(n); });
  const alive = new Uint8Array(states.length);
  const queue = [];
  states.forEach((s, n) => { if (edges[n] && isGoal(s)) { alive[n] = 1; queue.push(n); } });
  while (queue.length) {
    const n = queue.pop();
    for (const p of predecessors[n]) if (!alive[p]) { alive[p] = 1; queue.push(p); }
  }

  const traceOf = n => {
    const steps = [];
    for (let k = n; k > 0; k = parent[k]) steps.unshift(via[k]);
    return steps.join(' → ');
  };

  if (!capped && !alive[0]) {
    errors.push('Unsolvable — the exit never unlocks using only what the room supplies'
      + `${missingHint(states, edges, plainTriggers, pushRocks)}.`);
  } else if (!capped) {
    // Report the first few distinct ways in, shortest first (states are in BFS order).
    const seen = new Set();
    for (let n = 0; n < states.length && seen.size < 3; n++) {
      if (alive[n] || !edges[n]) continue;
      const cause = via[n];
      if (seen.has(cause)) continue;
      seen.add(cause);
      errors.push(`Softlock: ${traceOf(n)} leaves no way to the exit.`);
    }
  }

  warnTimedTriggers(map, plainTriggers, suppliedTools, warnings);

  const unreached = [];
  for (let i = 0; i < tiles.length; i++) {
    if (DUNGEON_TILES[tiles[i]].solid || reached.has(i)) continue;
    unreached.push({ row: rowOf(i), col: colOf(i) });
  }
  return { unreached };
}

// Name what was never achieved in any explored state, so an unsolvable room
// says which trigger is out of reach.
function missingHint(states, edges, plainTriggers, pushRocks) {
  let trig = 0;
  const pushed = new Set();
  states.forEach((s, n) => {
    if (!edges[n]) return;
    trig |= s.trig;
    s.rocks.forEach((d, k) => { if (d !== -1) pushed.add(k); });
  });
  const missing = [];
  plainTriggers.forEach((t, k) => { if (!(trig & (1 << k))) missing.push(`${t.kind} ${cellName(t.row, t.col)}`); });
  pushRocks.forEach((t, k) => { if (!pushed.has(k)) missing.push(`push rock ${cellName(t.row, t.col)}`); });
  return missing.length ? ` (never reached: ${missing.join(', ')})` : ' (the exit itself is out of reach)';
}

// Rule 5 — timing is a warning, not a proof. Timed switches that one strike
// line can cover are fine; otherwise compare the walk between the farthest
// pair against the shortest timer.
function warnTimedTriggers(map, plainTriggers, suppliedTools, warnings) {
  const timed = plainTriggers.filter(t => t.activation === 'timed');
  if (timed.length < 2) return;
  const { rows, cols, tiles } = map;
  const reach = Math.max(BASE_STRIKE_CELLS, suppliedTools.whip ?? 0, suppliedTools.boomerang ?? 0);
  if (timed.every(t => t.kind === 'switch')) {
    const targets = new Set(timed.map(t => t.row * cols + t.col));
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (DUNGEON_TILES[tiles[r * cols + c]].solid) continue;
        for (const [dr, dc] of DIRECTIONS_8) {
          const step = Math.hypot(dr, dc);
          let hit = 0;
          for (let k = 1; k * step <= reach; k++) {
            const nr = r + dr * k, nc = c + dc * k;
            if (nr < 0 || nc < 0 || nr >= rows || nc >= cols) break;
            const i = nr * cols + nc;
            if (targets.has(i)) hit++;
            if (DUNGEON_TILES[tiles[i]].solid && !DUNGEON_TILES[tiles[i]].reachOver) break;
          }
          if (hit === targets.size) return;
        }
      }
    }
  }
  let farthest = 0;
  for (const a of timed) for (const b of timed) {
    farthest = Math.max(farthest, Math.abs(a.row - b.row) + Math.abs(a.col - b.col));
  }
  const seconds = farthest * CELL_PX / WALK_PX_PER_SECOND;
  const timer = Math.min(...timed.map(t => t.neutralizeSeconds ?? 0));
  if (seconds > timer) {
    warnings.push(`Timed triggers are up to ${farthest} cells apart (~${seconds.toFixed(2)}s on foot) `
      + `but revert after ${timer}s and no single strike covers them all.`);
  }
}
