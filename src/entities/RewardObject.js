import { GRID } from '../game/GameConfig.js';

const HOME_SPEED = 80;        // px/s toward player
const ARRIVE_RADIUS = GRID.CELL_SIZE * 0.6;
const MESSAGE_DURATION = 2.0; // seconds to show "CAUGHT: NAME"

/**
 * Flying catch reward that homes toward the player after a successful catch.
 * Stops moving once it arrives near the player.
 * Must be hit with a melee attack to yield its ingredient drops.
 */
export class RewardObject {
  constructor(x, y, catchData) {
    this.position = { x, y };
    this.char = catchData.char;
    this.color = catchData.color;
    this.name = catchData.name;
    this.drops = catchData.drops; // array of ingredient chars
    this.alive = true;
    this.canPickUp = false;       // Excluded from magnet / pickup loops
    this.velocity = { x: 0, y: 0 };
    this.arrived = false;
    this.messageTimer = MESSAGE_DURATION;
  }

  update(dt, playerPos) {
    if (!this.alive) return;

    this.messageTimer = Math.max(0, this.messageTimer - dt);

    if (this.arrived || !playerPos) return;

    const dx = playerPos.x - this.position.x;
    const dy = playerPos.y - this.position.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < ARRIVE_RADIUS) {
      this.arrived = true;
      this.velocity.x = 0;
      this.velocity.y = 0;
      return;
    }

    this.velocity.x = (dx / dist) * HOME_SPEED;
    this.velocity.y = (dy / dist) * HOME_SPEED;
    this.position.x += this.velocity.x * dt;
    this.position.y += this.velocity.y * dt;
  }

  getRenderX() {
    return this.position.x + GRID.CELL_SIZE / 2;
  }

  getRenderY() {
    return this.position.y + GRID.CELL_SIZE / 2;
  }
}
