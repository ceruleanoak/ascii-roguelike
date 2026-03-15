import { GRID } from '../game/GameConfig.js';

/**
 * The cast bobber that flies in a parabolic arc from the player to a water tile,
 * then bobs with a sine-wave animation until a bite occurs.
 *
 * chargeRatio (0–1) controls arc height and flight duration:
 *   - Longer charge → farther cast → taller arc, slightly longer flight
 */
export class Bobber {
  constructor(startX, startY, targetX, targetY, chargeRatio = 1.0) {
    this.position = { x: startX, y: startY };
    this.char = String.fromCharCode(248); // '°' degree symbol
    this.color = '#ff4444';
    this.bobTimer = 0;
    this.visible = true;
    this.inWater = true;

    // Arc animation state
    this.flying = true;
    this.startX = startX;
    this.startY = startY;
    this.targetX = targetX;
    this.targetY = targetY;
    this.flyProgress = 0;
    this.flyDuration = 0.25 + chargeRatio * 0.35; // 0.25s (min) to 0.60s (max)
    this.arcHeight = 40 + chargeRatio * 60;        // taller arc for longer casts
  }

  update(dt) {
    if (this.flying) {
      this.flyProgress = Math.min(1.0, this.flyProgress + dt / this.flyDuration);
      const t = this.flyProgress;

      // Lerp X; parabolic arc on Y (negative offset = upward on canvas)
      this.position.x = this.startX + (this.targetX - this.startX) * t;
      this.position.y = this.startY + (this.targetY - this.startY) * t
        - this.arcHeight * 4 * t * (1 - t);

      if (this.flyProgress >= 1.0) {
        this.flying = false;
        this.position.x = this.targetX;
        this.position.y = this.targetY;
      }
    } else {
      this.bobTimer += dt;
    }
  }

  getRenderX() {
    return this.position.x + GRID.CELL_SIZE / 2;
  }

  getRenderY() {
    if (this.flying) return this.position.y + GRID.CELL_SIZE / 2;
    return this.position.y + GRID.CELL_SIZE / 2 + Math.sin(this.bobTimer * 4) * 2;
  }
}
