import { GRID } from '../game/GameConfig.js';

export class Debris {
  constructor(x, y, char, color) {
    // Pixel-based position
    this.position = { x, y };
    this.velocity = { vx: 0, vy: 0 };
    this.acceleration = { ax: 0, ay: 0 };

    // Visual properties - each debris is a single ASCII character
    this.char = char;
    this.color = color || '#666666';
    this.width = GRID.CELL_SIZE / 2; // Smaller than major objects
    this.height = GRID.CELL_SIZE / 2;

    // Physics flags - debris can be pushed but doesn't block movement
    this.hasCollision = false; // Doesn't block major objects
    this.boundToGrid = true;
    this.friction = true;
    this.isPushable = true; // Can be pushed by major objects
    this.mass = 0.1; // Light, easily pushed

    // Push cooldown (5 frames at 60 FPS = ~0.083 seconds)
    this.pushCooldown = 0;
    this.pushCooldownDuration = 40 / 60; // 40 frames
  }

  update(deltaTime) {
    // Debris persists indefinitely, just needs physics updates
    // Reset acceleration each frame (will be set by push forces)
    this.acceleration = { ax: 0, ay: 0 };

    // Update push cooldown
    if (this.pushCooldown > 0) {
      this.pushCooldown -= deltaTime;
      if (this.pushCooldown < 0) {
        this.pushCooldown = 0;
      }
    }
  }

  applyPushForce(pusherVelocity, pusherMass = 1.0) {
    // Only apply push if cooldown has expired
    if (this.pushCooldown > 0) {
      return false;
    }

    // Apply force based on pusher's velocity and mass
    // Reduced to 15% influence so debris gets left behind with continuous movement
    const forceFactor = (pusherMass / this.mass) * 0.075;
    this.velocity.vx += pusherVelocity.vx * forceFactor;
    this.velocity.vy += pusherVelocity.vy * forceFactor;

    // Start cooldown
    this.pushCooldown = this.pushCooldownDuration;
    return true;
  }

  getHitbox() {
    return {
      x: this.position.x,
      y: this.position.y,
      width: this.width,
      height: this.height
    };
  }
}

// Factory function to create debris from enemy death
export function createDebris(x, y, count = 5, color = '#666666') {
  const debris = [];
  const chars = [',', '"', '.', '`', "'", ';', '_'];

  for (let i = 0; i < count; i++) {
    // Random angle for mild spread
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 1.0;

    // Low velocity for "plop" effect (30-60 pixels/second)
    const speed = 30 + Math.random() * 30;
    const offsetX = Math.cos(angle) * GRID.CELL_SIZE;
    const offsetY = Math.sin(angle) * GRID.CELL_SIZE;

    // Random character
    const char = chars[Math.floor(Math.random() * chars.length)];

    const piece = new Debris(x + offsetX, y + offsetY, char, color);

    // Set initial velocity for mild spread
    piece.velocity.vx = Math.cos(angle) * speed;
    piece.velocity.vy = Math.sin(angle) * speed;

    debris.push(piece);
  }

  return debris;
}
