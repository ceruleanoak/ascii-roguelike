import { GRID } from '../game/GameConfig.js';

export class GooBlob {
  constructor(x, y, creationTime, stationary = false) {
    this.position = { x, y };
    this.stationary = stationary;
    this.velocity = {
      vx: stationary ? 0 : (Math.random() - 0.5) * 8, // Slow random drift (unless stationary)
      vy: stationary ? 0 : (Math.random() - 0.5) * 8
    };
    this.radius = 12; // Hitbox radius for slowing effect
    this.char = 'o'; // Green blob character
    this.color = '#00ff00';
    this.creationTime = creationTime; // Used for FIFO queue management

    // Visual effects
    this.pulseTimer = Math.random() * Math.PI * 2; // Random phase for pulsing
    this.baseScale = 1.0;
    this.pulseSpeed = 2.0; // Pulsing speed
    this.pulseAmount = 0.25; // How much it pulses (±15%)
  }

  update(deltaTime) {
    // Update position with slow drift (only if not stationary)
    if (!this.stationary) {
      this.position.x += this.velocity.vx * deltaTime;
      this.position.y += this.velocity.vy * deltaTime;
    }

    // Update pulse animation
    this.pulseTimer += deltaTime * this.pulseSpeed;

    // Keep within room bounds (bounce off walls gently) - only if not stationary
    if (!this.stationary) {
      if (this.position.x < GRID.CELL_SIZE * 2) {
        this.position.x = GRID.CELL_SIZE * 2;
        this.velocity.vx = Math.abs(this.velocity.vx) * 0.5;
      }
      if (this.position.x > GRID.WIDTH - GRID.CELL_SIZE * 2) {
        this.position.x = GRID.WIDTH - GRID.CELL_SIZE * 2;
        this.velocity.vx = -Math.abs(this.velocity.vx) * 0.5;
      }
      if (this.position.y < GRID.CELL_SIZE * 2) {
        this.position.y = GRID.CELL_SIZE * 2;
        this.velocity.vy = Math.abs(this.velocity.vy) * 0.5;
      }
      if (this.position.y > GRID.HEIGHT - GRID.CELL_SIZE * 2) {
        this.position.y = GRID.HEIGHT - GRID.CELL_SIZE * 2;
        this.velocity.vy = -Math.abs(this.velocity.vy) * 0.5;
      }
    }
  }

  getCurrentScale() {
    return this.baseScale + Math.sin(this.pulseTimer) * this.pulseAmount;
  }

  isNearEntity(entity) {
    const dx = entity.position.x - this.position.x;
    const dy = entity.position.y - this.position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    return distance <= this.radius;
  }
}
