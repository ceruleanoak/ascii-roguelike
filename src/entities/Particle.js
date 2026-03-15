import { GRID, COLORS } from '../game/GameConfig.js';

export class Particle {
  constructor(x, y, char, color, velocity, lifetime = 2.0) {
    // Pixel-based position
    this.position = { x, y };
    this.velocity = velocity || { vx: 0, vy: 0 };
    this.acceleration = { ax: 0, ay: 0 };

    // Visual properties
    this.char = char;
    this.color = color;
    this.width = GRID.CELL_SIZE;
    this.height = GRID.CELL_SIZE;

    // Lifetime management
    this.lifetime = lifetime;
    this.maxLifetime = lifetime;
    this.alive = true;

    // Physics flags
    this.hasCollision = false; // Particles pass through everything
    this.boundToGrid = true;
    this.friction = true; // Apply friction for deceleration
    this.decelerationRate = 0.94; // Additional deceleration beyond friction
  }

  update(deltaTime) {
    // Decrease lifetime
    this.lifetime -= deltaTime;
    if (this.lifetime <= 0) {
      this.alive = false;
      return;
    }

    // Apply additional deceleration (particles slow down over time)
    this.velocity.vx *= this.decelerationRate;
    this.velocity.vy *= this.decelerationRate;
  }

  getAlpha() {
    // Fade out as lifetime decreases
    return Math.max(0, Math.min(1, this.lifetime / this.maxLifetime));
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

// Factory function to create a single water drip trail particle
export function createWetDrop(x, y) {
  // Slight random horizontal scatter, slow downward drift then evaporate
  const vx = (Math.random() - 0.5) * 18;
  const vy = 12 + Math.random() * 20; // drips downward
  const lifetime = 0.55 + Math.random() * 0.45;
  const chars = ['·', '▪', '·', '·']; // mostly small dots
  const char = chars[Math.floor(Math.random() * chars.length)];
  // Shift spawn to random pixel within the entity cell for scattered look
  const ox = (Math.random() - 0.5) * GRID.CELL_SIZE * 0.8;
  const oy = (Math.random() - 0.5) * GRID.CELL_SIZE * 0.4 + GRID.CELL_SIZE * 0.3;
  const p = new Particle(x + ox, y + oy, char, '#3399ff', { vx, vy }, lifetime);
  p.decelerationRate = 0.88; // drips decelerate quickly
  p.boundToGrid = false; // don't clamp so they fall off entity feet naturally
  return p;
}

// Factory function to create a single steam puff trail particle
// Emitted while an entity moves through/out of a steam cloud
export function createSteamPuff(x, y) {
  // Drifts upward with slight lateral wobble, then fades
  const vx = (Math.random() - 0.5) * 14;
  const vy = -(8 + Math.random() * 18); // rises upward
  const lifetime = 0.6 + Math.random() * 0.5;
  const chars = ['=', '~', '-', '=', '~'];
  const char = chars[Math.floor(Math.random() * chars.length)];
  // Scatter spawn across the entity cell
  const ox = (Math.random() - 0.5) * GRID.CELL_SIZE * 0.9;
  const oy = (Math.random() - 0.5) * GRID.CELL_SIZE * 0.5;
  const gray = Math.floor(120 + Math.random() * 60); // #787878 – #b4b4b4
  const color = `rgb(${gray},${gray},${gray})`;
  const p = new Particle(x + ox, y + oy, char, color, { vx, vy }, lifetime);
  p.decelerationRate = 0.91; // drifts and slows
  p.boundToGrid = false;
  return p;
}

// Factory function to create activation burst particles (consumable use)
export function createActivationBurst(x, y, color = COLORS.ITEM) {
  const particles = [];
  const chars = ['+', '*', 'o', '.'];
  const count = 7;

  for (let i = 0; i < count; i++) {
    // Upward arc: center angle -PI/2 (up), spread ±PI/2
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI;
    const speed = 60 + Math.random() * 80; // 60–140 px/s
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed;
    const char = chars[Math.floor(Math.random() * chars.length)];
    const lifetime = 0.7 + Math.random() * 0.5; // 0.7–1.2 seconds
    const p = new Particle(x, y, char, color, { vx, vy }, lifetime);
    p.decelerationRate = 0.92;
    p.boundToGrid = false;
    particles.push(p);
  }

  return particles;
}

// Factory function to create explosion particles
export function createExplosion(x, y, count = 20, color = COLORS.PLAYER) {
  const particles = [];
  const chars = ['·', '*', '+', 'x', '•', '○'];

  for (let i = 0; i < count; i++) {
    // Random angle for explosion spread
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;

    // Random velocity magnitude (150-300 pixels/second)
    const speed = 150 + Math.random() * 150;
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed;

    // Random character
    const char = chars[Math.floor(Math.random() * chars.length)];

    // Random lifetime (1.5-2.5 seconds)
    const lifetime = 1.5 + Math.random() * 1.0;

    particles.push(new Particle(x, y, char, color, { vx, vy }, lifetime));
  }

  return particles;
}

// Factory function to create chaff particles (grass debris from bullet impacts)
export function createChaff(x, y, count = 4) {
  const particles = [];
  const chars = [',', '.', "'", '`', '-'];
  const color = '#667755'; // Muted grass color

  for (let i = 0; i < count; i++) {
    // Random spray pattern with upward bias
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.2;
    const speed = 40 + Math.random() * 50; // 40-90 px/s
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed;

    // Random character
    const char = chars[Math.floor(Math.random() * chars.length)];

    // Quick lifetime (0.2-0.45 seconds)
    const lifetime = 0.2 + Math.random() * 0.25;

    const p = new Particle(x, y, char, color, { vx, vy }, lifetime);
    p.decelerationRate = 0.88; // Decelerate quickly
    p.boundToGrid = false;
    particles.push(p);
  }

  return particles;
}

// Factory function to create a sprint footstep dot particle
// Emitted alternating left/right of the player's path while sprinting unarmed.
// x, y: pixel-space center of where the foot landed
export function createFootstep(x, y) {
  // Stationary dot that fades out quickly
  const p = new Particle(x, y, '.', '#666666', { vx: 0, vy: 0 }, 0.55);
  p.decelerationRate = 1.0;
  p.boundToGrid = false;
  return p;
}

// Factory function to create dodge roll trail particles
export function createDodgeTrail(x, y, color = COLORS.PLAYER) {
  const chars = ['-', '=', '~', '.'];
  const char = chars[Math.floor(Math.random() * chars.length)];

  // No velocity - stationary trail
  const vx = 0;
  const vy = 0;

  // Quick fade lifetime
  const lifetime = 0.3;

  // Random slight offset within cell for natural scatter
  const ox = (Math.random() - 0.5) * GRID.CELL_SIZE * 0.4;
  const oy = (Math.random() - 0.5) * GRID.CELL_SIZE * 0.4;

  const p = new Particle(x + ox, y + oy, char, color, { vx, vy }, lifetime);
  p.decelerationRate = 1.0; // No deceleration (already stationary)
  p.boundToGrid = false;

  return p;
}
