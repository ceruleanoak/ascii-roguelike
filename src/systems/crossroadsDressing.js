import { GRID } from '../game/GameConfig.js';
import { YardPlacer, EXIT_CELLS, key, randInt, trackNoise } from './yardDressing.js';

// Crossroads (X) dressing: worn roads in from every exit, meeting at a crossing,
// and fenced fields in the corners between them. The roads are the Footpath prop
// (GLOSSARY.md: Footpath); the rules are the rulebook's S7, S10 and S11.
// Runs after the room's scatter and before its enemies, like the Yards, and uses
// the same placer: nothing fills water, solid pieces never stand in an exit lane,
// and any that would cut the crossing off from an exit are taken back out.

const { COLS, ROWS } = GRID;
// The crossing lies near the middle but rarely on it, so the roads come in with a
// jog and no two Crossroads line up the same way (rulebook S7).
const CROSSING_DRIFT = 3;
// Each corner between two roads is a field: it lies between those two exits.
const FIELDS = [
  { roads: ['north', 'west'], dc: -1, dr: -1 },
  { roads: ['north', 'east'], dc: 1, dr: -1 },
  { roads: ['south', 'west'], dc: -1, dr: 1 },
  { roads: ['south', 'east'], dc: 1, dr: 1 },
];
const FIELD_CHANCE = 0.75;
// The far fence sides weather; the side along the road is kept, with a gate.
const FAR_SIDE_GAPS = 0.15;
// What a field holds, so its fence encloses something. Dealt out without repeats,
// so two fields in one room never look alike.
const FIELD_USES = ['crop', 'overgrown', 'worked'];
// A road fords water rather than stopping at it, but goes round a pond it can.
const FORD_COST = 6;

export function dressCrossroads(room, { zone }) {
  if (!room.collisionMap) return;
  const yard = new YardPlacer(room, zone);
  const exits = Object.keys(EXIT_CELLS).filter(dir => room.exits?.[dir]);
  const crossing = {
    c: Math.floor(COLS / 2) + randInt(-CROSSING_DRIFT, CROSSING_DRIFT),
    r: Math.floor(ROWS / 2) + randInt(-CROSSING_DRIFT, CROSSING_DRIFT),
  };

  // Fences first, so the roads are routed down the lanes between them.
  const fields = FIELDS.filter(f => f.roads.every(dir => exits.includes(dir)));
  const fenced = fields.filter(() => Math.random() < FIELD_CHANCE);
  if (!fenced.length && fields.length) fenced.push(fields[randInt(0, fields.length - 1)]);
  const plots = fenced.map(field => fenceField(yard, crossing, field));

  // Roads: a worn Footpath from every exit to the crossing, unbroken but for fords.
  // One of them is the main road, worn into two ruts: the way most travellers come.
  const noise = trackNoise();
  const road = new Set();
  const main = exits[randInt(0, exits.length - 1)];
  for (const dir of exits) {
    const cells = yard.route(EXIT_CELLS[dir], crossing, noise, FORD_COST) ?? [];
    const across = dir === 'north' || dir === 'south' ? { dc: 1, dr: 0 } : { dc: 0, dr: 1 };
    for (const p of cells) {
      road.add(key(p.c, p.r));
      if (dir === main) road.add(key(p.c + across.dc, p.r + across.dr));
    }
  }
  // The crossing itself is trodden wide.
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) road.add(key(crossing.c + dc, crossing.r + dr));
  for (const k of road) {
    if (!yard.placed.has(k)) yard.put(k % COLS, Math.floor(k / COLS), 'footpath');
  }

  // At a corner of the crossing, a lone post with something left at its foot:
  // many pass it, few look.
  const sc = crossing.c + (Math.random() < 0.5 ? -2 : 2);
  const sr = crossing.r + (Math.random() < 0.5 ? -2 : 2);
  if (yard.put(sc, sr, 'post')) yard.put(sc, sr + 1, 'scraps');

  const uses = [...FIELD_USES].sort(() => Math.random() - 0.5);
  plots.forEach((plot, i) => fillField(yard, plot, uses[i % uses.length]));

  yard.keepExitsReachable(room, [{ ...crossing }]);
}

// One field's fence: a side along each of its two roads, meeting at a post by the
// crossing, and a short return at the far end of one, so it reads as a field and
// not a kerb. Lane widths and lengths differ per field, so no two mirror each other.
// The side along the road has a gate. Returns the field's inside, for fillField.
function fenceField(yard, crossing, { dc, dr }) {
  const corner = { c: crossing.c + dc * randInt(2, 5), r: crossing.r + dr * randInt(2, 5) };
  const alongLen = randInt(5, 9);
  const downLen = randInt(4, 8);
  const backLen = randInt(2, Math.min(4, downLen));
  const along = [];
  const down = [];
  const back = [];
  for (let i = 0; i <= alongLen; i++) along.push({ c: corner.c + dc * i, r: corner.r });
  for (let i = 1; i <= downLen; i++) down.push({ c: corner.c, r: corner.r + dr * i });
  for (let i = 1; i <= backLen; i++) back.push({ c: corner.c + dc * alongLen, r: corner.r + dr * i });
  yard.fenceRun(along, { gate: randInt(2, alongLen - 1) });
  yard.fenceRun(down, { startPost: false, gaps: FAR_SIDE_GAPS });
  yard.fenceRun(back, { startPost: false, gaps: FAR_SIDE_GAPS });
  return { c0: corner.c + dc, r0: corner.r + dr, dc, dr, w: alongLen - 1, h: backLen + 1 };
}

// What the fence keeps: rows of sprouts, ground gone over to tufts, or worked earth
// with a bucket by the fence. Never on a road, water or anything already placed.
function fillField(yard, { c0, r0, dc, dr, w, h }, use) {
  const free = (c, r) => !yard.placed.has(key(c, r)) && !yard.blocked(c, r) && !yard.liquid.has(key(c, r));
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const c = c0 + dc * i;
      const r = r0 + dr * j;
      if (!free(c, r)) continue;
      if (use === 'crop' && j % 2 === 0 && i % 2 === 0) yard.put(c, r, 'sprout');
      else if (use === 'overgrown' && Math.random() < 0.45) yard.put(c, r, 'tuft');
      else if (use === 'worked' && j % 2 === 1 && Math.random() < 0.6) yard.put(c, r, 'scuff');
    }
  }
  if (use === 'worked' && free(c0, r0)) yard.put(c0, r0, 'bucket');
}
