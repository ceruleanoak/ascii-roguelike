// Fingers (GraspSystem phase 3): four massive fingers reach down their lanes
// from the top while the climb runs fast. Any blow drives a Finger far back
// up (FINGER_KNOCKBACK); left alone it keeps coming. A tip past the Trap Line
// presses: the Finger walls its lane off and hurts any body against it. All
// four spend one pool, GraspSystem.fingersHp. A Finger always blocks the Trine
// (it is rock-hard flesh), pressed or not.
import { GRID } from '../../game/GameConfig.js';
import { GRASP_TUNING as T, FINGER_LANES, FINGER_COLS } from '../../data/grasp.js';

const CS = GRID.CELL_SIZE;
const W = FINGER_COLS * CS;
const FLOOR_TOP = (GRID.ROWS - 1) * CS;
export const TRAP_LINE_Y = (GRID.ROWS - 1 - T.TRAP_LINE_ROWS) * CS;
// Where each Finger's tip starts, in cells above the top edge — staggered so
// they never arrive together.
const START_TIPS = [-2, -7, -4, -9];
const PRESS_REACH = 3; // px a pressed Finger reaches past a body's edge to hurt it

export function spawn(grasp) {
  grasp.fingers = FINGER_LANES.map((col, i) => {
    const finger = {
      x: col * CS,
      tipY: START_TIPS[i] * CS,
      pace: 0.8 + Math.random() * 0.4,
      flash: 0,
    };
    finger.unit = grasp.addUnit('finger', finger, finger.x, 0, W, 1);
    syncUnit(finger);
    return finger;
  });
}

// The unit covers the on-screen length of the Finger, top edge to tip.
function syncUnit(finger) {
  const top = Math.min(0, finger.tipY - CS);
  finger.unit.position.x = finger.x;
  finger.unit.position.y = top;
  finger.unit.height = Math.max(1, finger.tipY - top);
}

export const isPressed = (finger) => finger.tipY > TRAP_LINE_Y;

export function update(grasp, dt) {
  const spent = 1 - grasp.fingersHp / T.FINGERS_HP;
  const reach = T.FINGER_REACH_SPEED * (1 + T.FINGER_RAGE * spent);
  for (const f of grasp.fingers) {
    if (f.flash > 0) f.flash -= dt;
    if (grasp.fingersHp <= 0) f.tipY -= T.FINGER_WITHDRAW_SPEED * dt;
    else f.tipY = Math.min(FLOOR_TOP, f.tipY + reach * f.pace * dt);
    syncUnit(f);
  }
}

/** Driven back up, far — never above FINGER_MIN_TIP, so it is never gone. */
export function onHit(grasp, finger) {
  finger.tipY = Math.max(T.FINGER_MIN_TIP, finger.tipY - T.FINGER_KNOCKBACK);
  syncUnit(finger);
  if (grasp.fingersHp <= 0) grasp.game.renderController?.screenShake.trigger(5, 0.5);
}

export function allWithdrawn(grasp) {
  return grasp.fingers.every(f => f.tipY < -CS);
}

/** Pixel rects the Trine can't pass (GraspSystem.resolveContact). */
export function blockers(grasp) {
  return grasp.fingers.filter(f => f.tipY > 0).map(f => ({ x: f.x, y: 0, w: W, h: f.tipY }));
}

/** A pressed Finger hurts every body against it. */
export function resolveContact(grasp) {
  for (const f of grasp.fingers) {
    if (!isPressed(f) || grasp.fingersHp <= 0) continue;
    for (const body of grasp.bodies()) {
      const bw = body.width ?? CS;
      const bh = body.height ?? CS;
      const p = body.position;
      if (p.x < f.x + W + PRESS_REACH && p.x + bw > f.x - PRESS_REACH &&
          p.y < f.tipY + PRESS_REACH && p.y + bh > 0) {
        grasp.hurt(body, T.FINGER_PRESS_DAMAGE, { x: f.x + W / 2, y: p.y + bh / 2 });
      }
    }
  }
}

export function remove(grasp) {
  for (const f of grasp.fingers) grasp.removeUnit(f.unit);
  grasp.fingers = [];
}
