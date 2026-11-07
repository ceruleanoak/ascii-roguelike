// Great Hands (GraspSystem phase 1): two hands hooked over the North Barrier.
// Each cycles grip → flex (the tell) → reach (toward the nearest Trine body)
// → grab → retract. A reaching hand catches any free body that comes near its
// palm and holds it, out of the Trine (MistBattleSystem.onHeld), squeezing,
// until a blow lands on it; it stays still all the while. With two hands, at
// most two bodies are held at once. A hand can be struck only outside the
// rim — reaching, grabbing or pulling back. Both hands spend one pool,
// GraspSystem.handsHp.
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
const HIT_RECOIL = CS / 2;

const randIn = ([lo, hi]) => lo + Math.random() * (hi - lo);

const palm = (hand) => ({ x: hand.x + W / 2, y: hand.y + H - CS });

export function spawn(grasp) {
  grasp.hands = ['left', 'right'].map((side, i) => {
    const hand = {
      side, state: 'rise', timer: 0,
      x: ANCHOR_X[side], y: OFF_TOP,
      target: null, body: null, squeeze: 0, flash: 0,
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
        const p = palm(hand);
        const bx = body.position.x + CS / 2;
        const by = body.position.y + CS / 2;
        moveToward(hand, hand.x + bx - p.x, hand.y + by - p.y, T.HAND_REACH_SPEED, dt);
        if (Math.hypot(bx - p.x, by - p.y) < T.HAND_SPLAY_DISTANCE) hand.splayed = true;
        // Whoever comes near the palm is caught, the target or not.
        const caught = bodyInPalm(grasp, palm(hand));
        if (caught) grab(grasp, hand, caught);
        break;
      }
      // Held until a blow lands (onHit) or the body goes down.
      case 'grab':
        if (!hand.body || hand.body.hp <= 0) {
          release(grasp, hand);
          startRetract(hand);
          break;
        }
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

/** A blow lands: a grabbing hand lets go (its body rejoins the Trine), a reaching one flinches. */
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
