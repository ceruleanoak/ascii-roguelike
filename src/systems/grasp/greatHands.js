// Great Hands (GraspSystem phase 1): two hands hooked over the North Barrier.
// Each cycles grip → flex (the tell) → reach (toward the nearest Trine body)
// → grab (holds it, squeezing) → retract. A hand can be struck only outside
// the rim — reaching, grabbing or pulling back — and any hit on a grabbing
// hand lets its body go. Both hands spend one pool, GraspSystem.handsHp.
import { GRID } from '../../game/GameConfig.js';
import { GRASP_TUNING as T, HAND_COLS, HAND_ROWS, HAND_KNUCKLE_ROW } from '../../data/grasp.js';

const CS = GRID.CELL_SIZE;
const W = HAND_COLS * CS;
const H = HAND_ROWS * CS;
// Gripping, the knuckle row sits on the barrier's rim (row 1) and the
// fingers hang down over the rock into the arena. Each hand hugs its own
// side wall, which leaves a gap down the middle between the two.
const ANCHOR_Y = (1 - HAND_KNUCKLE_ROW) * CS;
const ANCHOR_X = { left: CS, right: (GRID.COLS - 1) * CS - W };
const OFF_TOP = -H - CS;
const GRAB_RADIUS = CS * 0.9;
const HIT_RECOIL = CS / 2;

const randIn = ([lo, hi]) => lo + Math.random() * (hi - lo);

const palm = (hand) => ({ x: hand.x + W / 2, y: hand.y + H - CS });

export function spawn(grasp) {
  grasp.hands = ['left', 'right'].map((side, i) => {
    const hand = {
      side, state: 'rise', timer: 0,
      x: ANCHOR_X[side], y: OFF_TOP,
      body: null, squeeze: 0, flash: 0,
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

// Whether the other hand is already out — below half the pool both may be.
function otherHandOut(grasp, hand) {
  if (grasp.handsHp <= T.HANDS_HP * T.HANDS_BOTH_REACH_AT) return false;
  return grasp.hands.some(h => h !== hand && (h.state === 'flex' || h.state === 'reach' || h.state === 'grab'));
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
          hand.target = nearestFree(grasp, palm(hand));
          hand.state = hand.target ? 'reach' : 'grip';
          hand.timer = 0;
          hand.wait = randIn(T.HAND_GRIP_TIME);
        }
        break;
      case 'reach': {
        const body = hand.target;
        if (!body || body.hp <= 0 || body.grabbed || hand.timer >= T.HAND_REACH_TIME) { startRetract(hand); break; }
        const p = palm(hand);
        const bx = body.position.x + CS / 2;
        const by = body.position.y + CS / 2;
        moveToward(hand, hand.x + bx - p.x, hand.y + by - p.y, T.HAND_REACH_SPEED, dt);
        // A rolling body slips the grab.
        if (Math.hypot(bx - p.x, by - p.y) < GRAB_RADIUS && !body.dodgeRoll?.active) {
          hand.state = 'grab';
          hand.timer = 0;
          hand.body = body;
          hand.squeeze = T.HAND_SQUEEZE_TICK;
          body.grabbed = true;
          body.grabbedBy = hand.unit;
          body.velocity.vx = 0;
          body.velocity.vy = 0;
        }
        break;
      }
      case 'grab':
        if (!hand.body || hand.body.hp <= 0 || hand.timer >= T.HAND_GRAB_TIME) {
          release(grasp, hand);
          startRetract(hand);
          break;
        }
        hand.squeeze -= dt;
        if (hand.squeeze <= 0) {
          hand.squeeze = T.HAND_SQUEEZE_TICK;
          grasp.mist.hurt(hand.body, T.HAND_SQUEEZE_DAMAGE, { isBullet: false, element: null, attacker: hand.unit }, palm(hand));
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

/** A blow lands: a grabbing hand lets go, a reaching one flinches. */
export function onHit(grasp, hand) {
  if (hand.state === 'grab') {
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
