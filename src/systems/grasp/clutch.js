// The Clutch (GraspSystem phase 2): small hands in Galaga formations over the
// climb. Each wave streams in from the top along a bezier into a swaying
// formation block; from there one or two at a time peel off and dive at a
// Trine body, then swing back up to their slot. Every member has its own small
// HP. The glyph tells what a hand is doing: its heading (☝☟☜☞) while it
// travels, ✋ holding formation, ✊ diving to strike.
import { GRID } from '../../game/GameConfig.js';
import {
  GRASP_TUNING as T, CLUTCH_GLYPHS, CLUTCH_FORMATION, CLUTCH_WAVES, CLUTCH_COLOR,
} from '../../data/grasp.js';

const CS = GRID.CELL_SIZE;
const SLOTS = CLUTCH_FORMATION.rows.flatMap(row => CLUTCH_FORMATION.cols.map(col => ({ col, row })));
const OFF_TOP = -2 * CS;
const OFF_BOTTOM = GRID.HEIGHT + CS;

const randIn = ([lo, hi]) => lo + Math.random() * (hi - lo);

export function create() {
  return {
    members: [],
    waveIndex: 0,
    queue: [],          // members waiting to enter: { delay, stream }
    queueTimer: 0,
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

// The next wave enters once the block has room for all of it.
function queueNextWave(grasp) {
  const c = grasp.clutch;
  if (c.queue.length > 0 || c.waveIndex >= CLUTCH_WAVES.length) return;
  const wave = CLUTCH_WAVES[c.waveIndex];
  if (freeSlots(c).length < wave.count) return;
  c.waveIndex++;
  for (let i = 0; i < wave.count; i++) c.queue.push({ wave, mirrored: i % 2 === 1 });
  c.queueTimer = 0;
}

function enter(grasp, { wave, mirrored }) {
  const c = grasp.clutch;
  const slot = freeSlots(c)[0];
  if (!slot) return;
  const flip = (p) => ({ x: (mirrored ? GRID.COLS - 1 - p.x : p.x) * CS, y: p.y * CS });
  const member = {
    hp: T.CLUTCH_HP, slot, state: 'enter', t: 0, flash: 0,
    path: { p0: flip(wave.p0), p1: flip(wave.p1), p2: slotPosition(grasp, slot), time: T.CLUTCH_ENTER_TIME },
    x: 0, y: 0, vx: 0, vy: 0, glyph: CLUTCH_GLYPHS.down,
  };
  member.x = member.path.p0.x;
  member.y = member.path.p0.y;
  member.unit = grasp.addUnit('clutch', member, member.x, member.y, CS, CS);
  c.members.push(member);
}

function headingGlyph(vx, vy) {
  if (Math.abs(vx) > Math.abs(vy)) return vx < 0 ? CLUTCH_GLYPHS.left : CLUTCH_GLYPHS.right;
  return vy < 0 ? CLUTCH_GLYPHS.up : CLUTCH_GLYPHS.down;
}

function startDive(grasp, member) {
  const bodies = grasp.bodies();
  if (bodies.length === 0) return;
  const target = bodies[Math.floor(Math.random() * bodies.length)];
  const swing = (member.x < GRID.WIDTH / 2 ? -1 : 1) * 5 * CS;
  member.state = 'dive';
  member.t = 0;
  member.path = {
    p0: { x: member.x, y: member.y },
    p1: { x: member.x + swing, y: member.y + 6 * CS },
    // Aimed past the body, so a dive that misses carries on through.
    p2: { x: target.position.x, y: target.position.y + 3 * CS },
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
    queueNextWave(grasp);
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
        startDive(grasp, ready.splice(Math.floor(Math.random() * ready.length), 1)[0]);
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
      case 'retreat':
        m.y -= T.CLUTCH_RETREAT_SPEED * dt;
        break;
    }
    m.vx = (m.x - px) / Math.max(dt, 1e-6);
    m.vy = (m.y - py) / Math.max(dt, 1e-6);
    m.glyph = m.state === 'formation' ? CLUTCH_GLYPHS.formation
      : m.state === 'dive' ? CLUTCH_GLYPHS.dive
      : headingGlyph(m.vx, m.vy);
    m.unit.position.x = m.x;
    m.unit.position.y = m.y;
  }

  // Off the top for good (retreat) or off the bottom (a dive gone long:
  // it re-enters from the top).
  for (const m of c.members) {
    if (m.state === 'return' && m.y > OFF_BOTTOM) m.y = OFF_TOP;
  }
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
  grasp.burst(member.x + CS / 2, member.y + CS / 2, 10, CLUTCH_COLOR);
  grasp.removeUnit(member.unit);
  grasp.clutch.members = grasp.clutch.members.filter(m => m !== member);
}

/** A Clutch hand touching any Trine body hurts it. */
export function resolveContact(grasp) {
  for (const m of grasp.clutch.members) {
    if (m.state === 'retreat') continue;
    for (const body of grasp.bodies()) {
      const bw = body.width ?? CS;
      const bh = body.height ?? CS;
      const inset = CS * 0.2;
      if (m.x + inset < body.position.x + bw && m.x + CS - inset > body.position.x &&
          m.y + inset < body.position.y + bh && m.y + CS - inset > body.position.y) {
        grasp.hurt(body, T.CLUTCH_CONTACT_DAMAGE, { x: m.x + CS / 2, y: m.y + CS / 2 });
      }
    }
  }
}
