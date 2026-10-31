/**
 * SlopeFlightSystem.js
 *
 * Slopes bend what is in the air the way they push what stands on them: a shot
 * or throw flying downhill carries further, one flying uphill falls short. Only
 * the part of the flight along the Slope counts, so a shot crossing it sideways
 * is untouched, and nothing here changes a direction of flight.
 *
 *   Arrows gain or lose speed.
 *   Bullets gain or lose range (their remaining distance or lifetime).
 *   Thrown weapons shed speed slower or faster.
 *
 * The cell index is rebuilt each tick by refresh(), so Slopes that come and go
 * (the Ascent's rising mud) need no bookkeeping, and a room without Slopes costs
 * one scan.
 */

import { GRID } from '../game/GameConfig.js';

const ARROW_SLOPE_ACCEL = 400;   // px/s², matching the push on anything standing on a Slope
const ARROW_MIN_SPEED = 60;      // an uphill shot stalls out; it never flies backward
const BULLET_SLOPE_REACH = 0.25; // share of the flight over a Slope added to or taken from range
const THROW_SLOPE_DECEL = 0.5;   // share of a throw's deceleration removed downhill, added uphill

const DOWNHILL = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

const cellKey = (col, row) => `${col},${row}`;

export class SlopeFlightSystem {
  constructor(game) {
    this.game = game;
    this.downhillByCell = new Map();
  }

  refresh() {
    this.downhillByCell.clear();
    const C = GRID.CELL_SIZE;
    for (const obj of this.game._activeBackgroundObjects()) {
      if (!obj.slope) continue;
      const key = cellKey(Math.floor(obj.position.x / C), Math.floor(obj.position.y / C));
      this.downhillByCell.set(key, DOWNHILL[obj.slopeDirection]);
    }
  }

  // How much of a flight at (x, y) runs downhill: 1 straight down the Slope,
  // -1 straight up it, 0 across it or away from any Slope.
  _alongSlope(x, y, vx, vy) {
    if (!this.downhillByCell.size) return 0;
    const speed = Math.hypot(vx, vy);
    if (speed === 0) return 0;
    const C = GRID.CELL_SIZE;
    const downhill = this.downhillByCell.get(cellKey(Math.floor(x / C), Math.floor(y / C)));
    if (!downhill) return 0;
    return (vx * downhill.x + vy * downhill.y) / speed;
  }

  // One tick of a projectile in flight. A Boomerang's flight is its own.
  bendProjectile(proj, deltaTime) {
    if (proj.boomerang || (proj.type !== 'arrow' && proj.type !== 'bullet')) return;
    const { vx, vy } = proj.velocity;
    const along = this._alongSlope(proj.position.x, proj.position.y, vx, vy);
    if (along === 0) return;

    const speed = Math.hypot(vx, vy);
    if (proj.type === 'arrow') {
      const bent = speed + along * ARROW_SLOPE_ACCEL * deltaTime;
      const scale = Math.max(bent, Math.min(speed, ARROW_MIN_SPEED)) / speed;
      proj.velocity.vx *= scale;
      proj.velocity.vy *= scale;
    } else if (proj.remainingDistance !== undefined) {
      proj.remainingDistance += along * BULLET_SLOPE_REACH * speed * deltaTime;
    } else if (proj.lifetime !== undefined) {
      proj.lifetime += along * BULLET_SLOPE_REACH * deltaTime;
    }
  }

  // A thrown weapon's deceleration for this tick. It lands where it stops rather
  // than on its aimed target, so a throw that crosses a Slope is marked
  // (slopeBent) for TrapSystem to skip the snap to target.
  throwDecel(t) {
    const along = this._alongSlope(t.x, t.y, t.vx, t.vy);
    if (along === 0) return t.decel;
    t.slopeBent = true;
    return t.decel * (1 - along * THROW_SLOPE_DECEL);
  }
}
