// Great Hands (GraspSystem phase 1): two hands hooked over the North Barrier.
// Each cycles grip → flex (the tell) → reach (toward the nearest Trine body)
// → grab → retract. A reaching hand catches any free body that comes near its
// palm and holds it, out of the Trine (MistBattleSystem.onHeld), squeezing,
// until HAND_HOLD_HITS blows have landed on it; it stays still all the
// while. Only the body dropping, a death save, or the phase ending lets go
// sooner. With two hands, at
// most two bodies are held at once. A hand can be struck only outside the
// rim — reaching, grabbing or pulling back. Both hands spend one pool,
// GraspSystem.handsHp.
import { GRID } from '../../game/GameConfig.js';
import {
  GRASP_TUNING as T, HAND_ART, HAND_COLS, HAND_ROWS, HAND_KNUCKLE_ROW, mirrorArt,
} from '../../data/grasp.js';

const CS = GRID.CELL_SIZE;
const W = HAND_COLS * CS;
const H = HAND_ROWS * CS;
// Gripping, the knuckle row sits on the barrier's rim (row 1) and the
// fingers hang down over the rock into the arena. Each hand hugs its own
// side wall, which leaves a gap down the middle between the two.
const ANCHOR_Y = (1 - HAND_KNUCKLE_ROW) * CS;
const ANCHOR_X = { left: CS, right: (GRID.COLS - 1) * CS - W };
const OFF_TOP = -H - CS;
const HIT_RECOIL = CS / 2;

const randIn = ([lo, hi]) => lo + Math.random() * (hi - lo);

// The grip point: the middle of the bottom row, slid sideways by palmShift
// when the hand is pressed against a wall (see the reach state).
const palm = (hand) => ({ x: hand.x + W / 2 + hand.palmShift, y: hand.y + H - CS });
// A hand's whole art stays inside the side walls, reaching or not.
const MIN_X = CS;
const MAX_X = (GRID.COLS - 1) * CS - W;
// How far the grip point can slide off the middle: to the outermost
// column's center, where the spread fingertips are drawn.
const MAX_PALM_SHIFT = W / 2 - CS / 2;

// ── Frames and the hit area ─────────────────────────────────────────────
// Which frame a hand shows is decided here, not in GraspDraw, because the
// frame is also its hit area (handOverlapsBox).
const HAND_FRAMES = {
  left: HAND_ART,
  right: Object.fromEntries(Object.entries(HAND_ART).map(([k, rows]) => [k, mirrorArt(rows)])),
};
const FRAME_FOR_STATE = { rise: 'grip', grip: 'grip', flex: 'flex', reach: 'open', grab: 'fist', retract: 'open', flee: 'open' };
// A hand passes through `half` for this long as it opens to reach or
// unclenches into a retract.
const HALF_FRAME_TIME = 0.12;
// Reaching, it twitches between `open` and `openB` once per this many seconds.
const RESTLESS_PERIOD = 0.35;

/** Which HAND_ART frame a hand shows this frame, from its state and timer. */
function handFrame(hand) {
  const reaching = hand.state === 'reach';
  if ((reaching || hand.state === 'retract') && hand.timer < HALF_FRAME_TIME) return 'half';
  if (!reaching) return FRAME_FOR_STATE[hand.state] ?? 'grip';
  // Once splayed near its target it holds the splay until the grab.
  if (hand.splayed) return 'splay';
  return Math.floor(hand.timer / RESTLESS_PERIOD) % 2 ? 'openB' : 'open';
}

/** The art rows (one glyph per cell, ' ' empty) a hand shows this frame. */
export function handRows(hand) {
  return HAND_FRAMES[hand.side][handFrame(hand)];
}

// Each art row's filled span, [first, last] column or null, per frame and side.
const ROW_SPANS = Object.fromEntries(Object.entries(HAND_FRAMES).map(([side, frames]) => [side,
  Object.fromEntries(Object.entries(frames).map(([name, rows]) => [name, rows.map((row) => {
    const first = row.search(/\S/);
    return first < 0 ? null : [first, row.trimEnd().length - 1];
  })])),
]));

/**
 * Whether a pixel box touches the hand's drawn art: each row counts from its
 * first glyph to its last (the gaps between fingers fill in, the empty
 * corners around them don't). The unit's rect is the art's whole 13×14
 * frame, of which the glyphs cover about a third, so blows into the empty
 * corners used to land.
 */
export function handOverlapsBox(hand, box) {
  const spans = ROW_SPANS[hand.side][handFrame(hand)];
  const firstRow = Math.max(0, Math.floor((box.y - hand.y) / CS));
  const lastRow = Math.min(HAND_ROWS - 1, Math.ceil((box.y + box.height - hand.y) / CS) - 1);
  for (let r = firstRow; r <= lastRow; r++) {
    const span = spans[r];
    if (!span) continue;
    const left = hand.x + span[0] * CS;
    const right = hand.x + (span[1] + 1) * CS;
    if (box.x < right && box.x + box.width > left) return true;
  }
  return false;
}

/**
 * The palm: the middle of the art's widest row (the knuckles across the
 * back of the hand), as a cell's top-left in pixels. Where a blow's damage
 * number rises from, instead of the frame's empty top-left corner.
 */
export function handPalm(hand) {
  const spans = ROW_SPANS[hand.side][handFrame(hand)];
  let best = 0;
  let width = -1;
  spans.forEach((span, r) => {
    if (span && span[1] - span[0] > width) { width = span[1] - span[0]; best = r; }
  });
  const span = spans[best];
  return { x: hand.x + ((span[0] + span[1]) / 2) * CS, y: hand.y + best * CS };
}

export function spawn(grasp) {
  grasp.hands = ['left', 'right'].map((side, i) => {
    const hand = {
      side, state: 'rise', timer: 0,
      x: ANCHOR_X[side], y: OFF_TOP,
      target: null, body: null, squeeze: 0, flash: 0,
      // Blows landed on this hand since it caught its body (HAND_HOLD_HITS).
      holdHits: 0,
      // Pixels the grip point sits off the middle of the hand: pressed
      // against a wall, the fingers on that side do the catching.
      palmShift: 0,
      // Set once a reaching palm comes within HAND_SPLAY_DISTANCE of its
      // target; the splayed frame then holds until the reach ends.
      splayed: false,
      // The right hand waits a beat longer, so the two never start in step.
      wait: i === 0 ? randIn(T.HAND_GRIP_TIME) : randIn(T.HAND_GRIP_TIME) + 1,
    };
    hand.unit = grasp.addUnit('hand', hand, hand.x, hand.y, W, H);
    return hand;
  });
}

export function isVulnerable(hand) {
  return hand.state === 'reach' || hand.state === 'grab' || hand.state === 'retract';
}

function moveToward(hand, tx, ty, speed, dt) {
  const dx = tx - hand.x;
  const dy = ty - hand.y;
  const dist = Math.hypot(dx, dy);
  const step = speed * dt;
  if (dist <= step) { hand.x = tx; hand.y = ty; return true; }
  hand.x += (dx / dist) * step;
  hand.y += (dy / dist) * step;
  return false;
}

function release(grasp, hand) {
  const body = hand.body;
  hand.body = null;
  if (!body) return;
  if (body.grabbedBy === hand.unit) {
    body.grabbed = false;
    body.grabbedBy = null;
  }
}

function startRetract(hand) {
  hand.state = 'retract';
  hand.timer = 0;
  hand.palmShift = 0;
}

function nearestFree(grasp, from) {
  let best = null;
  let bestDist = Infinity;
  for (const body of grasp.bodies()) {
    if (body.grabbed) continue;
    const d = Math.hypot(body.position.x + CS / 2 - from.x, body.position.y + CS / 2 - from.y);
    if (d < bestDist) { best = body; bestDist = d; }
  }
  return best;
}

// Whether the other hand is already on its way out — below half the pool
// both may be. A hand holding a body doesn't count, so the other can still
// reach for a second.
function otherHandOut(grasp, hand) {
  if (grasp.handsHp <= T.HANDS_HP * T.HANDS_BOTH_REACH_AT) return false;
  return grasp.hands.some(h => h !== hand && (h.state === 'flex' || h.state === 'reach'));
}

// The free body nearest the palm within HAND_GRAB_RADIUS, if any. A rolling
// body slips the grab.
function bodyInPalm(grasp, p) {
  let best = null;
  let bestDist = T.HAND_GRAB_RADIUS;
  for (const body of grasp.bodies()) {
    if (body.grabbed || body.dodgeRoll?.active) continue;
    const d = Math.hypot(body.position.x + CS / 2 - p.x, body.position.y + CS / 2 - p.y);
    if (d < bestDist) { best = body; bestDist = d; }
  }
  return best;
}

// Close on a body: it leaves the Trine, and the rest of the Trine is knocked
// back down, away from the hand.
function grab(grasp, hand, body) {
  hand.state = 'grab';
  hand.timer = 0;
  hand.body = body;
  hand.holdHits = 0;
  hand.squeeze = T.HAND_SQUEEZE_TICK;
  body.grabbed = true;
  body.grabbedBy = hand.unit;
  body.velocity.vx = 0;
  body.velocity.vy = 0;
  grasp.mist.onHeld(body);
  for (const other of grasp.bodies()) {
    if (other !== body) grasp.game.physicsSystem.applyKnockbackDir(other, 0, 1, T.HAND_GRAB_KNOCKBACK);
  }
}

export function update(grasp, dt) {
  for (const hand of grasp.hands) {
    hand.timer += dt;
    if (hand.flash > 0) hand.flash -= dt;
    switch (hand.state) {
      case 'rise':
        if (moveToward(hand, ANCHOR_X[hand.side], ANCHOR_Y, (ANCHOR_Y - OFF_TOP) / T.HAND_RISE_TIME, dt)) {
          hand.state = 'grip';
          hand.timer = 0;
        }
        break;
      case 'grip':
        if (hand.timer < hand.wait) break;
        if (otherHandOut(grasp, hand)) { hand.wait = hand.timer + 0.5; break; }
        hand.state = 'flex';
        hand.timer = 0;
        break;
      case 'flex':
        if (hand.timer >= T.HAND_FLEX_TIME) {
          hand.palmShift = 0;
          hand.target = nearestFree(grasp, palm(hand));
          hand.state = hand.target ? 'reach' : 'grip';
          hand.timer = 0;
          hand.splayed = false;
          hand.wait = randIn(T.HAND_GRIP_TIME);
        }
        break;
      case 'reach': {
        const body = hand.target;
        if (!body || body.hp <= 0 || body.grabbed || hand.timer >= T.HAND_REACH_TIME) { startRetract(hand); break; }
        const midX = hand.x + W / 2;
        const p = palm(hand);
        const bx = body.position.x + CS / 2;
        const by = body.position.y + CS / 2;
        // Toward the body, as far as the walls allow: a body hugging a wall
        // is reached for, but the hand doesn't pass into the wall after it.
        const goalX = Math.min(MAX_X, Math.max(MIN_X, hand.x + bx - midX));
        moveToward(hand, goalX, hand.y + by - p.y, T.HAND_REACH_SPEED, dt);
        // Once the wall stops it, the grip slides toward the body along the
        // fingers on that side, so a body in the columns by a wall can still
        // be caught by the fingertips drawn over it (#544). Only toward the
        // wall that stopped it, and only as far as the art goes.
        const atLeftWall = hand.x <= MIN_X + 0.5 && bx < hand.x + W / 2;
        const atRightWall = hand.x >= MAX_X - 0.5 && bx > hand.x + W / 2;
        hand.palmShift = atLeftWall || atRightWall
          ? Math.max(-MAX_PALM_SHIFT, Math.min(MAX_PALM_SHIFT, bx - (hand.x + W / 2)))
          : 0;
        const reachPalm = palm(hand);
        if (Math.hypot(bx - reachPalm.x, by - reachPalm.y) < T.HAND_SPLAY_DISTANCE) hand.splayed = true;
        // Whoever comes near the palm is caught, the target or not.
        const caught = bodyInPalm(grasp, palm(hand));
        if (caught) grab(grasp, hand, caught);
        break;
      }
      // Held until HAND_HOLD_HITS blows land (onHit) or the body goes down.
      case 'grab':
        if (!hand.body || hand.body.hp <= 0) {
          release(grasp, hand);
          startRetract(hand);
          break;
        }
        // Caught by the outer fingers, the body is drawn into the fist.
        hand.palmShift = Math.sign(hand.palmShift)
          * Math.max(0, Math.abs(hand.palmShift) - T.HAND_REACH_SPEED * dt);
        hand.squeeze -= dt;
        if (hand.squeeze <= 0) {
          hand.squeeze = T.HAND_SQUEEZE_TICK;
          grasp.mist.hurt(hand.body, T.HAND_SQUEEZE_DAMAGE, { isBullet: false, element: null, attacker: hand.unit, ignoresArmor: true }, palm(hand));
        }
        break;
      case 'retract':
        if (moveToward(hand, ANCHOR_X[hand.side], ANCHOR_Y, T.HAND_RETRACT_SPEED, dt)) {
          hand.state = 'grip';
          hand.timer = 0;
        }
        break;
      case 'flee':
        moveToward(hand, hand.x, OFF_TOP, H / T.HAND_RISE_TIME * 1.5, dt);
        break;
    }
    hand.unit.position.x = hand.x;
    hand.unit.position.y = hand.y;
  }
}

/**
 * A blow lands: a reaching hand flinches; a grabbing one counts it, and on
 * the HAND_HOLD_HITS-th lets go (its body rejoins the Trine). The blows
 * before that show only as any blow on the Grasp does: the flash, the sound
 * and the number.
 */
export function onHit(grasp, hand) {
  if (hand.state === 'grab') {
    hand.holdHits += 1;
    if (hand.holdHits < T.HAND_HOLD_HITS) return;
    const body = hand.body;
    release(grasp, hand);
    startRetract(hand);
    if (body) grasp.game.physicsSystem.applyKnockback(body, hand.x + W / 2, hand.y, 160);
  } else if (hand.state === 'reach') {
    hand.y -= HIT_RECOIL;
  }
}

/** Pin every grabbed body in its hand's palm (after physics). */
export function resolveGrabs(grasp) {
  for (const hand of grasp.hands) {
    const body = hand.body;
    if (!body) continue;
    if (body.hp <= 0) { release(grasp, hand); continue; }
    const p = palm(hand);
    body.position.x = p.x - CS / 2;
    body.position.y = p.y - CS / 2;
    body.velocity.vx = 0;
    body.velocity.vy = 0;
  }
}

/** A revived body slips the grip: whichever hand holds it lets go and pulls back. */
export function letGoOf(grasp, body) {
  for (const hand of grasp.hands) {
    if (hand.body !== body) continue;
    release(grasp, hand);
    startRetract(hand);
  }
}

/** End of phase 1: every hand lets go and rises off the top. */
export function letGo(grasp) {
  for (const hand of grasp.hands) {
    release(grasp, hand);
    hand.state = 'flee';
    hand.timer = 0;
  }
}

export function remove(grasp) {
  for (const hand of grasp.hands) {
    release(grasp, hand);
    grasp.removeUnit(hand.unit);
  }
  grasp.hands = [];
}
