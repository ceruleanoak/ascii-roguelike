import { GRID } from '../game/GameConfig.js';

const JUMP_INTERVAL_MIN = 3.0;
const JUMP_INTERVAL_MAX = 8.0;
const JUMP_DURATION = 0.55; // seconds for full arc
const JUMP_HEIGHT = GRID.CELL_SIZE * 1.8; // peak height above water surface

/**
 * Ambient fish that visually jumps from water tiles.
 * Purely decorative — no collision, no interaction.
 * Spawned by FishingSystem when enemies are cleared in Lake rooms.
 */
export class FishEntity {
  constructor(x, y) {
    this.position = { x, y };
    this.char = 'ծ';
    this.color = '#44aaff';

    // Idle bob
    this.bobTimer = Math.random() * Math.PI * 2;

    // Jump state
    this.jumpActive = false;
    this.jumpTimer = 0;
    this.jumpCooldown = JUMP_INTERVAL_MIN + Math.random() * (JUMP_INTERVAL_MAX - JUMP_INTERVAL_MIN);
    this.jumpOffsetY = 0;

    this.alive = true;
  }

  update(dt) {
    this.bobTimer += dt * 4;

    if (!this.jumpActive) {
      this.jumpCooldown -= dt;
      this.jumpOffsetY = Math.sin(this.bobTimer) * 2; // gentle surface bob

      if (this.jumpCooldown <= 0) {
        this.jumpActive = true;
        this.jumpTimer = 0;
        this.jumpCooldown = JUMP_INTERVAL_MIN + Math.random() * (JUMP_INTERVAL_MAX - JUMP_INTERVAL_MIN);
      }
    } else {
      this.jumpTimer += dt;
      if (this.jumpTimer >= JUMP_DURATION) {
        this.jumpActive = false;
        this.jumpOffsetY = 0;
      } else {
        // Parabolic arc: peaks at t=0.5, returns to 0 at t=1
        const t = this.jumpTimer / JUMP_DURATION;
        this.jumpOffsetY = -Math.sin(t * Math.PI) * JUMP_HEIGHT;
      }
    }
  }

  getRenderY() {
    return this.position.y + GRID.CELL_SIZE / 2 + this.jumpOffsetY;
  }

  getRenderX() {
    return this.position.x + GRID.CELL_SIZE / 2;
  }
}
