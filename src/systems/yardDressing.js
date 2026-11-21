import { GRID } from '../game/GameConfig.js';
import { BackgroundObject } from '../entities/BackgroundObject.js';
import {
  YARD_PROPS, YARDS, YARD_HOSTILE_KINDS, YARD_PEN_KINDS, YARD_PEN_CHANCE_HUT, YARD_ZONE_TINT, YARD_ZONE_PATH, YARD_ZONE_GRASS, COMMONS_MARK,
} from '../data/yards.js';

// Yard dressing for H (Hut) and S (Settlement) rooms. GLOSSARY.md: Yard, Footpath, Commons.
// A lone Hut gets its Yard's 'hut' props and a Footpath toward the south exit.
// A Settlement gets every prop, Footpaths that meet at a Commons, and a zone layer
// (green crop plot, yellow lightning rods, red palisade and cinders).
//
// Runs after the room's scatter is generated and before its enemies are placed.
// Every prop is a non-structural `yard_prop` Background Object. Solid props block
// through `data.solid`, never `collisionMap`, which would paint a grey square
// behind them (rulebook G6).

const CS = GRID.CELL_SIZE;
const COLS = GRID.COLS;
const ROWS = GRID.ROWS;
// Approach cells just inside each exit, for Footpath routing and the reachability check.
export const EXIT_CELLS = {
  south: { c: 15, r: ROWS - 3 }, north: { c: 15, r: 2 }, east: { c: COLS - 3, r: 15 }, west: { c: 2, r: 15 },
};
// Water and lava stay when a Settlement's scatter is cleared round its huts.
const LIQUID_CHARS = new Set(['~', '≈']);

export const key = (c, r) => r * COLS + c;
const cellOf = o => [Math.round(o.position.x / CS), Math.round(o.position.y / CS)];
export const randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

// The four exit lanes, near the edge. No solid prop stands in one.
function inExitLane(c, r) {
  return (c >= 12 && c <= 18 && (r <= 4 || r >= ROWS - 5))
    || (r >= 12 && r <= 18 && (c <= 4 || c >= COLS - 5));
}

// Per-cell route costs, so a Footpath wanders like a worn track instead of drawing L's.
export function trackNoise() {
  return Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => 1 + Math.random() * 1.5));
}

function tintToward(color, tint) {
  if (!tint) return color;
  const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const a = rgb(color);
  const b = rgb(tint);
  return '#' + a.map((v, i) => Math.round(v * 0.7 + b[i] * 0.3).toString(16).padStart(2, '0')).join('');
}

export function dressYards(room, { zone, abundant }) {
  const huts = room.huts ?? (room.hut ? [room.hut] : []);
  if (!huts.length || !room.collisionMap) return;
  const yard = new YardPlacer(room, zone);

  // Random scatter stays out of a 2-cell halo round every Settlement hut, so its
  // Yard reads. A lone Hut's halo is already kept clear by its clearingZone.
  if (abundant) yard.clearHalos(huts);

  const approaches = [];
  for (const hut of huts) {
    const { minCol, minRow, maxCol, maxRow } = hut.exteriorBounds;
    for (const [dc, dr, prop, where] of YARDS[hut.hutKind] ?? []) {
      if (yard.wants(where, abundant)) yard.put(minCol + dc, minRow + dr, prop);
    }
    approaches.push({ c: hut.doorPosition.col, r: hut.doorPosition.row + 1, kind: hut.hutKind });
    if (YARD_PEN_KINDS.has(hut.hutKind) && (abundant || Math.random() < YARD_PEN_CHANCE_HUT)) yard.placePen(hut);
    if (!abundant) continue;
    if (hut.hutKind === 'shed') {
      // Tufts grown up round the Shed, thicker on the west, none on the door side.
      for (let r = minRow - 1; r <= maxRow; r++) {
        for (let c = minCol - 1; c <= maxCol + 1; c++) {
          const outside = c < minCol || c > maxCol || r < minRow;
          if (outside && Math.random() < (c < minCol ? 0.8 : 0.4)) yard.put(c, r, 'tuft');
        }
      }
      continue;
    }
    if (zone === 'yellow') {
      // A lightning rod on every roof, and a bucket under the eaves on either side.
      yard.put(Math.round((minCol + maxCol) / 2) + randInt(-1, 1), minRow - 1, 'rod');
      yard.put(Math.random() < 0.5 ? maxCol + 1 : minCol - 1, maxRow - 1, 'bucket');
    }
    if (zone === 'red' && (hut.hutKind === 'weapons_master' || hut.hutKind === 'press')) {
      // The huts that keep a fire have cinders blown round them.
      for (const [dc, dr] of [[-1, 5], [5, 5], [6, 1]]) {
        if (!yard.placed.has(key(minCol + dc, minRow + dr))) yard.put(minCol + dc, minRow + dr, 'cinders');
      }
    }
  }

  yard.layFootpaths(approaches, abundant);
  if (abundant && zone === 'green') yard.placeCropPlot(huts);
  if (abundant && zone === 'red') yard.placePalisade(huts);
  yard.keepExitsReachable(room, approaches);
}

export class YardPlacer {
  constructor(room, zone) {
    this.room = room;
    this.zone = zone;
    this.tint = YARD_ZONE_TINT[zone];
    this.hasWater = room.backgroundObjects.some(o => o.char === '~');
    this.placed = new Map();   // cell key -> prop name
    this.placedObjs = [];      // in placement order, for the reachability rollback
    this.structural = new Set();
    this.solidScatter = new Set();
    this.liquid = new Set();
    for (const o of room.backgroundObjects) {
      const [c, r] = cellOf(o);
      if (LIQUID_CHARS.has(o.char)) this.liquid.add(key(c, r));
      if (o.structural) this.structural.add(key(c, r));
      else if (o.data?.solid) this.solidScatter.add(key(c, r));
    }
  }

  wants(where, abundant) {
    if (where === 'hut') return true;
    if (where === 'settlement') return abundant;
    if (where === 'water') return this.hasWater;
    if (where === 'dry') return !this.hasWater;
    return false;
  }

  inGrid(c, r) {
    return c >= 1 && r >= 1 && c <= COLS - 2 && r <= ROWS - 2;
  }

  // Walls, structures, and solid things (scatter or Yard) block Footpaths and walkers.
  blocked(c, r) {
    if (!this.inGrid(c, r) || this.room.collisionMap[r]?.[c]) return true;
    const k = key(c, r);
    if (this.structural.has(k) || this.solidScatter.has(k)) return true;
    const prop = this.placed.get(k);
    return !!prop && YARD_PROPS[prop].solid;
  }

  clearCell(c, r) {
    const objs = this.room.backgroundObjects;
    for (let i = objs.length - 1; i >= 0; i--) {
      const o = objs[i];
      if (o.structural) continue;
      const [oc, or] = cellOf(o);
      if (oc === c && or === r) objs.splice(i, 1);
    }
    this.solidScatter.delete(key(c, r));
  }

  clearHalos(huts) {
    const objs = this.room.backgroundObjects;
    for (let i = objs.length - 1; i >= 0; i--) {
      const o = objs[i];
      if (o.structural || LIQUID_CHARS.has(o.char)) continue;
      const [c, r] = cellOf(o);
      const nearHut = huts.some(({ exteriorBounds: b }) =>
        c >= b.minCol - 2 && c <= b.maxCol + 2 && r >= b.minRow - 2 && r <= b.maxRow + 3);
      if (nearHut) {
        objs.splice(i, 1);
        this.solidScatter.delete(key(c, r));
      }
    }
  }

  put(c, r, propName) {
    const prop = YARD_PROPS[propName];
    if (!this.inGrid(c, r) || this.room.collisionMap[r]?.[c] || this.structural.has(key(c, r))) return false;
    if (this.liquid.has(key(c, r))) return false; // a Yard never fills in water
    if (prop.solid && inExitLane(c, r)) return false;
    // A 16px glyph spills into its east neighbour, so that cell must stay clear (rulebook G3),
    // both when the wide prop goes down and when anything later lands beside it.
    if (prop.wide && (this.placed.has(key(c + 1, r)) || this.structural.has(key(c + 1, r)))) return false;
    if (YARD_PROPS[this.placed.get(key(c - 1, r))]?.wide) return false;
    this.removeProp(c, r);
    this.clearCell(c, r);
    if (prop.wide) this.clearCell(c + 1, r);

    const color = propName === 'footpath' ? YARD_ZONE_PATH[this.zone] ?? '#6b5a3e'
      : propName === 'tuft' ? YARD_ZONE_GRASS[this.zone] ?? '#3e6a34'
      : tintToward(prop.color, this.tint);
    const overrides = { name: propName, color, solid: prop.solid };
    if (prop.solid) overrides.bulletInteraction = 'block';
    if (prop.sprite) overrides.customSprite = prop.sprite;
    const obj = new BackgroundObject(prop.char, c * CS, r * CS, { typeId: 'yard_prop', variantOverrides: overrides });
    obj.color = color;
    obj.animationColor = color;
    this.room.backgroundObjects.push(obj);
    this.placed.set(key(c, r), propName);
    this.placedObjs.push({ obj, c, r });
    return true;
  }

  removeProp(c, r) {
    const k = key(c, r);
    if (!this.placed.has(k)) return;
    const i = this.placedObjs.findIndex(p => p.c === c && p.r === r);
    if (i >= 0) {
      const objs = this.room.backgroundObjects;
      const at = objs.indexOf(this.placedObjs[i].obj);
      if (at >= 0) objs.splice(at, 1);
      this.placedObjs.splice(i, 1);
    }
    this.placed.delete(k);
  }

  // Dijkstra over open cells. With noise, the route wanders and cuts corners the
  // way a worn track does instead of drawing L's.
  // `fordCost`: a road may cross water at that cost per cell (the Footpath isn't
  // laid on the water, so it resumes on the far bank); without it, water is a wall.
  route(from, to, noise = null, fordCost = 0) {
    const dist = new Map([[key(from.c, from.r), 0]]);
    const prev = new Map();
    const open = [from];
    while (open.length) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) {
        if (dist.get(key(open[i].c, open[i].r)) < dist.get(key(open[bi].c, open[bi].r))) bi = i;
      }
      const cur = open.splice(bi, 1)[0];
      if (cur.c === to.c && cur.r === to.r) break;
      for (const [dc, dr] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
        const n = { c: cur.c + dc, r: cur.r + dr };
        // A Footpath goes round water as it goes round anything solid, unless it may ford.
        const wet = this.liquid.has(key(n.c, n.r));
        if ((this.blocked(n.c, n.r) || (wet && !fordCost)) && !(n.c === to.c && n.r === to.r)) continue;
        const k = key(n.c, n.r);
        const d = dist.get(key(cur.c, cur.r)) + (noise ? noise[n.r][n.c] : 1) + (wet ? fordCost : 0);
        if (!dist.has(k) || d < dist.get(k)) {
          dist.set(k, d);
          prev.set(k, cur);
          open.push(n);
        }
      }
    }
    if (!dist.has(key(to.c, to.r))) return null;
    const cells = [];
    for (let cur = to; cur; cur = prev.get(key(cur.c, cur.r))) cells.push(cur);
    return cells.reverse();
  }

  layFootpaths(approaches, abundant) {
    const noise = trackNoise();
    const pathCells = new Map(); // cell key -> prop name
    const lay = (cells, kind, fadeFrom = Infinity) => {
      if (!cells) return;
      if (YARD_HOSTILE_KINDS.has(kind)) {
        // Gone to ruin: a few broken cells, then nothing, with something cut across it.
        cells.slice(0, 6).forEach((p, i) => { if (i % 2 === 0) pathCells.set(key(p.c, p.r), 'footpath'); });
        if (cells[3]) pathCells.set(key(cells[3].c, cells[3].r), kind === 'witch' ? 'scraps' : 'claw');
        return;
      }
      // The Wise Fellow's Footpath is stepping stones, in the same rhythm as every
      // other Footpath: a variant changes the glyph, never the spacing.
      const prop = kind === 'wise_man' ? 'step' : 'footpath';
      cells.forEach((p, i) => {
        if (i > fadeFrom && i % 2) return; // thins out as it leaves the yard
        if (!pathCells.has(key(p.c, p.r))) pathCells.set(key(p.c, p.r), prop);
      });
    };

    const south = this.room.exits?.south ? EXIT_CELLS.south : null;
    const walkers = approaches.filter(a => a.kind !== 'shed');
    const commons = abundant && walkers.length ? this.findCommons(walkers) : null;
    if (commons) {
      for (const a of approaches) lay(this.route(a, commons, noise), a.kind);
      if (south) lay(this.route(commons, south, noise), 'commons', 5);
      // The Commons is a trampled patch, not a corner in a line.
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (Math.abs(dr) + Math.abs(dc) < 2 || Math.random() < 0.5) pathCells.set(key(commons.c + dc, commons.r + dr), 'footpath');
        }
      }
    } else {
      const target = south ?? Object.entries(EXIT_CELLS).find(([dir]) => this.room.exits?.[dir])?.[1];
      if (target) for (const a of approaches) lay(this.route(a, target, noise), a.kind, 4);
    }
    for (const [k, prop] of pathCells) {
      if (this.placed.has(k)) continue;
      this.put(k % COLS, Math.floor(k / COLS), prop);
    }
    if (commons) this.placeCommonsMark(commons, pathCells);
  }

  // The Commons sits where the huts' doors average out, pulled a third of the way
  // toward the south exit (the way out to REST), on the nearest open 3×3.
  findCommons(walkers) {
    const mc = walkers.reduce((s, a) => s + a.c, 0) / walkers.length;
    const mr = walkers.reduce((s, a) => s + a.r, 0) / walkers.length;
    const tc = Math.round(mc + (EXIT_CELLS.south.c - mc) / 3);
    const tr = Math.round(mr + (EXIT_CELLS.south.r - mr) / 3);
    let best = null;
    for (let r = 4; r < ROWS - 4; r++) {
      for (let c = 4; c < COLS - 4; c++) {
        let open = true;
        for (let dr = -1; dr <= 1 && open; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (this.blocked(c + dc, r + dr) || this.placed.has(key(c + dc, r + dr))) { open = false; break; }
          }
        }
        if (!open) continue;
        const d = Math.abs(c - tc) + Math.abs(r - tr);
        if (!best || d < best.d) best = { c, r, d };
      }
    }
    return best;
  }

  placeCommonsMark(commons, pathCells) {
    const mark = COMMONS_MARK[this.zone];
    if (!mark) return;
    for (const [dc, dr] of [[2, 0], [-2, 0], [0, -2], [2, 1], [-2, 1]]) {
      const c = commons.c + dc;
      const r = commons.r + dr;
      if (this.blocked(c, r) || pathCells.has(key(c, r)) || this.placed.has(key(c, r))) continue;
      if (this.put(c, r, mark)) return;
    }
  }

  // A straight fence run: posts at its ends, rails between. A cell that already
  // holds a prop is left alone, so the run breaks round it; `gaps` drops a few rails
  // more, and `gate` leaves one cell open on purpose. The run stops short at water,
  // a wall, anything solid or an exit lane: a fence ends at the water's edge, it
  // never fills it in.
  fenceRun(cells, { startPost = true, endPost = true, gaps = 0, gate = -1 } = {}) {
    // Fence pieces are solid, so an exit lane stops the run too, and the run still
    // ends on a post rather than a dangling rail.
    const stop = cells.findIndex(({ c, r }) => this.liquid.has(key(c, r)) || this.blocked(c, r) || inExitLane(c, r));
    if (stop >= 0) { cells = cells.slice(0, stop); endPost = true; }
    if (!cells.length) return;
    const horizontal = cells.length < 2 || cells[0].r === cells[1].r;
    cells.forEach(({ c, r }, i) => {
      const post = (i === 0 && startPost) || (i === cells.length - 1 && endPost);
      if (i === gate || (!post && Math.random() < gaps) || this.placed.has(key(c, r))) return;
      this.put(c, r, post ? 'post' : horizontal ? 'rail' : 'vrail');
    });
  }

  // A pen off the side wall where the hut's Yard props stand, so it fences them in:
  // rails out from the wall at the back and the front, a side of rails, a post at
  // each outer corner, and a gate left in the front rail.
  placePen(hut) {
    const { minCol, maxCol, minRow, maxRow } = hut.exteriorBounds;
    const count = (c0, c1) => {
      let n = 0;
      for (let r = minRow; r <= maxRow; r++) for (let c = c0; c <= c1; c++) if (this.placed.has(key(c, r))) n++;
      return n;
    };
    const west = count(minCol - 3, minCol - 1);
    const east = count(maxCol + 1, maxCol + 3);
    const side = west === east ? (Math.random() < 0.5 ? -1 : 1) : (west > east ? -1 : 1);
    const wallCol = side < 0 ? minCol - 1 : maxCol + 1;
    const span = [0, 1, 2, 3].map(i => wallCol + side * i); // from the wall out to the fence side
    const fenceCol = span[3];
    this.fenceRun(span.map(c => ({ c, r: minRow })), { startPost: false });
    const sideCells = [];
    for (let r = minRow + 1; r < maxRow; r++) sideCells.push({ c: fenceCol, r });
    this.fenceRun(sideCells, { startPost: false, endPost: false });
    this.fenceRun([...span].reverse().map(c => ({ c, r: maxRow })), { endPost: false, gate: randInt(1, 3) });
  }

  // Green: a worked plot beside a hut. One rail missing, one corner post down, open to the south.
  placeCropPlot(huts) {
    for (const hut of huts) {
      if (hut.hutKind === 'shed') continue;
      const { minCol, maxCol, minRow } = hut.exteriorBounds;
      // Either side of the hut, whichever fits; neither is preferred.
      const sides = [maxCol + 2, minCol - 8];
      if (Math.random() < 0.5) sides.reverse();
      for (const ox of sides) {
        let fits = true;
        for (let r = minRow; r < minRow + 5 && fits; r++) {
          for (let c = ox; c < ox + 7; c++) {
            if (this.blocked(c, r) || this.placed.has(key(c, r)) || inExitLane(c, r)) { fits = false; break; }
          }
        }
        if (!fits) continue;
        const gapRail = randInt(ox + 1, ox + 5);
        const downPost = Math.random() < 0.5 ? ox : ox + 6;
        for (let r = minRow; r < minRow + 5; r++) {
          for (let c = ox; c < ox + 7; c++) {
            const side = c === ox || c === ox + 6;
            const top = r === minRow;
            const bottom = r === minRow + 4;
            if (top) {
              if (side) this.put(c, r, 'post');
              else if (c !== gapRail) this.put(c, r, 'rail');
            } else if (side) {
              if (!bottom) this.put(c, r, 'vrail');
              else if (c !== downPost) this.put(c, r, 'post');
            } else if (!bottom && (r - minRow) % 2 && Math.random() < 0.85) {
              this.put(c, r, 'sprout');
            }
          }
        }
        return;
      }
    }
  }

  // Red: a palisade facing deeper ground. It runs along the north wall, turns
  // down the west and east walls at both corners, and leaves the north exit lane
  // open as its gate. A few stakes have fallen, and it stands back from the huts.
  placePalisade(huts) {
    const nearHut = (c, r) => huts.some(({ exteriorBounds: b }) =>
      c >= b.minCol - 2 && c <= b.maxCol + 2 && r >= b.minRow - 2 && r <= b.maxRow + 2);
    const line = [];
    for (let c = 2; c <= COLS - 3; c++) line.push([c, 2]);
    for (let r = 3; r <= 9; r++) line.push([2, r], [COLS - 3, r]);
    for (const [c, r] of line) {
      if (Math.random() < 0.08 || nearHut(c, r)) continue;
      this.put(c, r, 'stake');
    }
  }

  // Every open cell reachable from `from` (4-way), as a set of cell keys.
  flood(from) {
    const seen = new Set([key(from.c, from.r)]);
    const stack = [from];
    while (stack.length) {
      const cur = stack.pop();
      for (const [dc, dr] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
        const c = cur.c + dc;
        const r = cur.r + dr;
        const k = key(c, r);
        if (seen.has(k) || this.blocked(c, r)) continue;
        seen.add(k);
        stack.push({ c, r });
      }
    }
    return seen;
  }

  // Every door must still be reachable from every exit. If a solid prop cut a way
  // off, take solid props back out, newest first, until it is open again.
  keepExitsReachable(room, approaches) {
    const exits = Object.entries(EXIT_CELLS).filter(([dir]) => room.exits?.[dir]).map(([, cell]) => cell);
    const allReachable = () => exits.every(e => {
      const seen = this.flood(e);
      return approaches.every(a => seen.has(key(a.c, a.r)));
    });
    if (allReachable()) return;
    for (let i = this.placedObjs.length - 1; i >= 0; i--) {
      const { c, r } = this.placedObjs[i];
      if (!YARD_PROPS[this.placed.get(key(c, r))]?.solid) continue;
      this.removeProp(c, r);
      if (allReachable()) return;
    }
  }
}
