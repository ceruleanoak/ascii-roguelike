// The Clutch (GraspSystem phase 2): small hands in Galaga formations over the
// climb. Each wave streams in from the top along a bezier into a swaying
// formation block; from there one or two at a time shiver in their slot (the
// tell), peel off and dive at a Trine body, then swing back up to their slot.
// A returning hand is spent and harmless: it flies straight back on a line
// nothing warned of, so only the told dive (and a hand still streaming in or
// holding formation) hurts. Every member has its own small HP. The glyph
// tells what a hand is doing: its heading (☝☟☜☞) while it travels, ☝ holding
// formation, ☚☛ telling and diving to strike (the open hand and fist, ✋✊,
// draw as color emoji).
import { GRID } from '../../game/GameConfig.js';
import {
  GRASP_TUNING as T, CLUTCH_GLYPHS, CLUTCH_FORMATION, CLUTCH_WAVES, CLUTCH_COLOR, CLUTCH_SIZE,
} from '../../data/grasp.js';

const CS = GRID.CELL_SIZE;
const SIZE = CLUTCH_SIZE;
const SLOTS = CLUTCH_FORMATION.rows.flatMap(row => CLUTCH_FORMATION.cols.map(col => ({ col, row })));
const OFF_TOP = -2 * CS;
// The box a dive stays in: inside the side walls, down to the floor row.
const DIVE_LEFT = CS;
const DIVE_RIGHT = (GRID.COLS - 1) * CS - SIZE;
const DIVE_BOTTOM = (GRID.ROWS - 1) * CS - SIZE;
const clampX = (x) => Math.min(DIVE_RIGHT, Math.max(DIVE_LEFT, x));

const randIn = ([lo, hi]) => lo + Math.random() * (hi - lo);

export function create() {
  return {
    members: [],
    waveIndex: 0,
    queue: [],          // members waiting to enter: { delay, stream }
    queueTimer: 0,
    waveWait: 0,        // s since the last wave finished entering
    diveTimer: 0,
    lingerTimer: 0,
  };
}

function bezier(p0, p1, p2, t) {
  const u = 1 - t;
  return {
    x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
    y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
  };
}

function slotPosition(grasp, slot) {
  const f = CLUTCH_FORMATION;
  const sway = f.swayCells * Math.sin((grasp.clock / f.swayPeriod) * Math.PI * 2);
  return { x: (slot.col + sway) * CS, y: slot.row * CS };
}

function freeSlots(c) {
  const taken = new Set(c.members.map(m => m.slot));
  return SLOTS.filter(s => !taken.has(s));
}

export function start(grasp) {
  grasp.clutch = create();
  grasp.clutch.diveTimer = randIn(T.CLUTCH_DIVE_INTERVAL) + T.CLUTCH_ENTER_TIME;
}

// The next wave enters once the block has room for all of it, or once it
// has waited CLUTCH_WAVE_WAIT for that room — then only into the slots that
// are free. The waves (and so the linger, and the phase) always arrive, even
// for a Trine that never strikes a hand: 14 slots can't hold 8 + 10 + 12.
function queueNextWave(grasp, dt) {
  const c = grasp.clutch;
  if (c.queue.length > 0 || c.waveIndex >= CLUTCH_WAVES.length) return;
  c.waveWait += dt;
  const wave = CLUTCH_WAVES[c.waveIndex];
  const free = freeSlots(c).length;
  if (free < wave.count && c.waveWait < T.CLUTCH_WAVE_WAIT) return;
  c.waveIndex++;
  c.waveWait = 0;
  const count = Math.min(wave.count, free);
  for (let i = 0; i < count; i++) c.queue.push({ wave, mirrored: i % 2 === 1 });
  c.queueTimer = 0;
}

function enter(grasp, { wave, mirrored }) {
  const c = grasp.clutch;
  const slot = freeSlots(c)[0];
  if (!slot) return;
  // Mirrors the unit's whole square, not its top-left cell: COLS - 1 - x
  // set a mirrored hand one cell right of true, into the east wall at x = 1.
  const flip = (p) => ({ x: (mirrored ? GRID.COLS - SIZE / CS - p.x : p.x) * CS, y: p.y * CS });
  const member = {
    hp: T.CLUTCH_HP, slot, state: 'enter', t: 0, flash: 0,
    path: { p0: flip(wave.p0), p1: flip(wave.p1), p2: slotPosition(grasp, slot), time: T.CLUTCH_ENTER_TIME },
    x: 0, y: 0, vx: 0, vy: 0, glyph: CLUTCH_GLYPHS.down,
  };
  member.x = member.path.p0.x;
  member.y = member.path.p0.y;
  member.unit = grasp.addUnit('clutch', member, member.x, member.y, SIZE, SIZE);
  c.members.push(member);
}

function headingGlyph(vx, vy) {
  if (Math.abs(vx) > Math.abs(vy)) return vx < 0 ? CLUTCH_GLYPHS.left : CLUTCH_GLYPHS.right;
  return vy < 0 ? CLUTCH_GLYPHS.up : CLUTCH_GLYPHS.down;
}

// The tell: the hand shivers in its slot, already showing the dive glyph
// for the side it will swing toward, for CLUTCH_TELL_TIME before it goes.
function startTell(member) {
  member.state = 'tell';
  member.t = 0;
}

const swingSide = (member) => (member.x < GRID.WIDTH / 2 ? -1 : 1);

function startDive(grasp, member) {
  const bodies = grasp.bodies();
  if (bodies.length === 0) return;
  const target = bodies[Math.floor(Math.random() * bodies.length)];
  const swing = swingSide(member) * 5 * CS;
  member.state = 'dive';
  member.t = 0;
  // Every control point inside the walls keeps the whole curve inside them
  // (a bezier stays within its control points' hull): a hand never swings
  // through a side wall or dives out past the floor.
  member.path = {
    p0: { x: member.x, y: member.y },
    p1: { x: clampX(member.x + swing), y: member.y + 6 * CS },
    // Aimed past the body, so a dive that misses carries on through — as
    // far as the floor.
    p2: { x: clampX(target.position.x), y: Math.min(DIVE_BOTTOM, target.position.y + 3 * CS) },
    time: T.CLUTCH_DIVE_TIME,
  };
}

function steer(member, tx, ty, speed, dt) {
  const dx = tx - member.x;
  const dy = ty - member.y;
  const dist = Math.hypot(dx, dy);
  const step = speed * dt;
  if (dist <= step) return true;
  member.x += (dx / dist) * step;
  member.y += (dy / dist) * step;
  return false;
}

export function update(grasp, dt) {
  const c = grasp.clutch;
  if (grasp.phase === 'clutch') {
    queueNextWave(grasp, dt);
    if (c.queue.length > 0) {
      c.queueTimer -= dt;
      if (c.queueTimer <= 0) {
        enter(grasp, c.queue.shift());
        c.queueTimer = c.queue[0]?.wave.stagger ?? 0;
      }
    }
    c.diveTimer -= dt;
    if (c.diveTimer <= 0) {
      c.diveTimer = randIn(T.CLUTCH_DIVE_INTERVAL);
      const ready = c.members.filter(m => m.state === 'formation');
      for (let i = 0; i < T.CLUTCH_DIVERS && ready.length > 0; i++) {
        startTell(ready.splice(Math.floor(Math.random() * ready.length), 1)[0]);
      }
    }
    if (c.waveIndex >= CLUTCH_WAVES.length && c.queue.length === 0) c.lingerTimer += dt;
  }

  for (const m of c.members) {
    const px = m.x;
    const py = m.y;
    if (m.flash > 0) m.flash -= dt;
    switch (m.state) {
      case 'enter':
      case 'dive': {
        m.t += dt / m.path.time;
        const at = bezier(m.path.p0, m.path.p1, m.path.p2, Math.min(1, m.t));
        m.x = at.x;
        m.y = at.y;
        if (m.t >= 1) m.state = 'return';
        break;
      }
      case 'return': {
        const slot = slotPosition(grasp, m.slot);
        if (steer(m, slot.x, slot.y, T.CLUTCH_RETURN_SPEED, dt)) m.state = 'formation';
        break;
      }
      case 'formation': {
        const slot = slotPosition(grasp, m.slot);
        m.x = slot.x;
        m.y = slot.y;
        break;
      }
      case 'tell': {
        const slot = slotPosition(grasp, m.slot);
        m.t += dt;
        // A hard two-step shake, not a sine: the pixel art reads it as a shiver.
        const shiver = Math.floor(m.t * T.CLUTCH_TELL_SHIVER_RATE) % 2 === 0 ? 1 : -1;
        m.x = slot.x + shiver * T.CLUTCH_TELL_SHIVER;
        m.y = slot.y;
        if (m.t >= T.CLUTCH_TELL_TIME) startDive(grasp, m);
        break;
      }
      case 'retreat':
        m.y -= T.CLUTCH_RETREAT_SPEED * dt;
        break;
    }
    m.vx = (m.x - px) / Math.max(dt, 1e-6);
    m.vy = (m.y - py) / Math.max(dt, 1e-6);
    m.glyph = m.state === 'formation' ? CLUTCH_GLYPHS.formation
      : m.state === 'tell' ? (swingSide(m) < 0 ? CLUTCH_GLYPHS.diveLeft : CLUTCH_GLYPHS.diveRight)
      : m.state === 'dive' ? (m.vx < 0 ? CLUTCH_GLYPHS.diveLeft : CLUTCH_GLYPHS.diveRight)
      : headingGlyph(m.vx, m.vy);
    m.unit.position.x = m.x;
    m.unit.position.y = m.y;
  }

  // Off the top for good (retreat).
  const gone = c.members.filter(m => m.state === 'retreat' && m.y < OFF_TOP);
  for (const m of gone) grasp.removeUnit(m.unit);
  if (gone.length) c.members = c.members.filter(m => !gone.includes(m));
}

/** Every wave has entered, and the block is beaten or has lingered too long. */
export function isDone(grasp) {
  const c = grasp.clutch;
  if (c.waveIndex < CLUTCH_WAVES.length || c.queue.length > 0) return false;
  return c.members.length === 0 || c.lingerTimer >= T.CLUTCH_LINGER;
}

export function retreatAll(grasp) {
  for (const m of grasp.clutch.members) m.state = 'retreat';
}

export function onHit(grasp, member, amount) {
  member.hp -= amount;
  if (member.hp > 0) return;
  grasp.burst(member.x + SIZE / 2, member.y + SIZE / 2, 10, CLUTCH_COLOR);
  grasp.removeUnit(member.unit);
  grasp.clutch.members = grasp.clutch.members.filter(m => m !== member);
}

/** A Clutch hand touching any Trine body hurts it — unless it is spent (returning or retreating). */
export function resolveContact(grasp) {
  for (const m of grasp.clutch.members) {
    if (m.state === 'retreat' || m.state === 'return') continue;
    for (const body of grasp.bodies()) {
      const bw = body.width ?? CS;
      const bh = body.height ?? CS;
      const inset = SIZE * 0.2;
      if (m.x + inset < body.position.x + bw && m.x + SIZE - inset > body.position.x &&
          m.y + inset < body.position.y + bh && m.y + SIZE - inset > body.position.y) {
        grasp.hurt(body, T.CLUTCH_CONTACT_DAMAGE, { x: m.x + SIZE / 2, y: m.y + SIZE / 2 });
      }
    }
  }
}
