import { GRID } from '../game/GameConfig.js';

export class GooBlob {
  // vx/vy/decel: optional launch parameters for boss spray blobs.
  // When decel > 0 the blob decelerates each frame and settles to stationary.
  constructor(x, y, creationTime, stationary = false, vx = 0, vy = 0, decel = 0) {
    this.position = { x, y };
    this.decel = decel;
    this.stationary = stationary && decel === 0;
    this.velocity = {
      vx: decel > 0 ? vx : (stationary ? 0 : (Math.random() - 0.5) * 8),
      vy: decel > 0 ? vy : (stationary ? 0 : (Math.random() - 0.5) * 8)
    };
    this.radius = 12; // Hitbox radius for slowing effect
    this.char = 'o'; // Green blob character
    this.color = '#00ff00';
    this.creationTime = creationTime; // Used for FIFO queue management
    this.lifetime = 0;
    this.maxLifetime = 5.0;
    this.expired = false;

    // Visual effects
    this.pulseTimer = Math.random() * Math.PI * 2; // Random phase for pulsing
    this.baseScale = 1.0;
    this.pulseSpeed = 2.0; // Pulsing speed
    this.pulseAmount = 0.25; // How much it pulses (±15%)

    // Slime trail drop tracking (distance-based stamps along the blob's path)
    this.trailLastX = x;
    this.trailLastY = y;
  }

  update(deltaTime) {
    if (!this.stationary) {
      // Apply deceleration for launched blobs
      if (this.decel > 0) {
        const drag = Math.max(0, 1 - this.decel * deltaTime);
        this.velocity.vx *= drag;
        this.velocity.vy *= drag;
        if (Math.sqrt(this.velocity.vx ** 2 + this.velocity.vy ** 2) < 4) {
          this.velocity.vx = 0;
          this.velocity.vy = 0;
          this.stationary = true;
        }
      }
      this.position.x += this.velocity.vx * deltaTime;
      this.position.y += this.velocity.vy * deltaTime;
    }

    this.lifetime += deltaTime;
    if (this.lifetime >= this.maxLifetime) this.expired = true;

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
