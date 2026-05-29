import { GRID } from '../game/GameConfig.js';

const SCARE_RADIUS = GRID.CELL_SIZE * 1.6;
const FLEE_SPEED = 180;
const RETURN_SPEED = 70;
const FLEE_DURATION = 1.4;
const RETURN_ARRIVE_DIST = 4;
const IDLE_BOB_AMP = 1.5;
const IDLE_BOB_FREQ = 1.8;

// Idle crow — drops a pearl if marked, otherwise just a quiet world detail.
// State machine: 'idle' → 'fleeing' (scared by weapon) → 'returning' → 'idle'.
// Background-object chars the crow is happy to settle on/near.
const PERCH_CHARS = new Set(['&', 'Y']); // tree, stump
const PERCH_SEARCH_RADIUS = GRID.CELL_SIZE * 9;
const PERCH_OFFSET = GRID.CELL_SIZE * 0.6; // sit slightly above the tree glyph

export class Crow {
  constructor(x, y, { hasPearl = false } = {}) {
    this.position = { x, y };
    this.homePosition = { x, y };
    this.originalHome = { x, y };
    this.velocity = { vx: 0, vy: 0 };

    this.char = 'v';
    this.color = '#5a5a6a';
    this.width = GRID.CELL_SIZE;
    this.height = GRID.CELL_SIZE;
    this.plane = 0;

    this.state = 'idle';
    this.fleeTimer = 0;
    this.bobPhase = Math.random() * Math.PI * 2;
    this.wingPhase = Math.random() * Math.PI * 2;

    this.hasPearl = hasPearl;
    this.droppedPearl = false;

    // Physics flags so PhysicsSystem leaves us alone (we manage our own motion).
    this.hasCollision = false;
    this.boundToGrid = false;
    this.friction = false;
  }

  scare(fromX, fromY) {
    const wasIdle = this.state === 'idle';

    // Already airborne? Refresh the flee timer and reflag as fleeing,
    // but don't drop a pearl twice and don't bother repicking direction unless idle.
    if (!wasIdle) {
      this.state = 'fleeing';
      this.fleeTimer = FLEE_DURATION;
      return false;
    }

    const dx = this.position.x - fromX;
    const dy = this.position.y - fromY;
    const len = Math.hypot(dx, dy) || 1;
    // Bias upward — crows take to the air, not sideways along the floor.
    const nx = dx / len;
    const ny = (dy / len) - 0.6;
    const nlen = Math.hypot(nx, ny) || 1;

    this.velocity.vx = (nx / nlen) * FLEE_SPEED + (Math.random() - 0.5) * 40;
    this.velocity.vy = (ny / nlen) * FLEE_SPEED + (Math.random() - 0.5) * 40;

    this.state = 'fleeing';
    this.fleeTimer = FLEE_DURATION;

    const shouldDropPearl = this.hasPearl && !this.droppedPearl;
    if (shouldDropPearl) this.droppedPearl = true;
    return shouldDropPearl;
  }

  update(deltaTime, backgroundObjects = [], otherCrows = []) {
    this.wingPhase += deltaTime * 14;

    if (this.state === 'idle') {
      this.bobPhase += deltaTime * IDLE_BOB_FREQ;
      // Bob is rendered as an offset — base position stays put so home math is stable.
      return;
    }

    if (this.state === 'fleeing') {
      this.position.x += this.velocity.vx * deltaTime;
      this.position.y += this.velocity.vy * deltaTime;

      // Clamp inside playable area, deflect velocity gently off the walls.
      const minX = GRID.CELL_SIZE * 2;
      const minY = GRID.CELL_SIZE * 2;
      const maxX = GRID.WIDTH - GRID.CELL_SIZE * 2;
      const maxY = GRID.HEIGHT - GRID.CELL_SIZE * 2;
      if (this.position.x < minX) { this.position.x = minX; this.velocity.vx = Math.abs(this.velocity.vx) * 0.6; }
      if (this.position.x > maxX) { this.position.x = maxX; this.velocity.vx = -Math.abs(this.velocity.vx) * 0.6; }
      if (this.position.y < minY) { this.position.y = minY; this.velocity.vy = Math.abs(this.velocity.vy) * 0.6; }
      if (this.position.y > maxY) { this.position.y = maxY; this.velocity.vy = -Math.abs(this.velocity.vy) * 0.6; }

      this.fleeTimer -= deltaTime;
      if (this.fleeTimer <= 0) {
        // Pick a new perch — nearest tree/stump, else nearest wall edge, else original spot.
        this.homePosition = this._choosePerch(backgroundObjects, otherCrows);
        this.state = 'returning';
      }
      return;
    }

    if (this.state === 'returning') {
      const dx = this.homePosition.x - this.position.x;
      const dy = this.homePosition.y - this.position.y;
      const dist = Math.hypot(dx, dy);
      if (dist < RETURN_ARRIVE_DIST) {
        this.position.x = this.homePosition.x;
        this.position.y = this.homePosition.y;
        this.velocity.vx = 0;
        this.velocity.vy = 0;
        this.state = 'idle';
        return;
      }
      const speed = RETURN_SPEED;
      this.velocity.vx = (dx / dist) * speed;
      this.velocity.vy = (dy / dist) * speed;
      this.position.x += this.velocity.vx * deltaTime;
      this.position.y += this.velocity.vy * deltaTime;
    }
  }

  // Prefer the nearest tree/stump within search radius; otherwise the nearest wall edge.
  // Falls back to the original spawn position when neither is available. Skips any
  // perch already claimed by another crow (within half a cell of its homePosition)
  // so flocks don't stack on the same branch.
  _choosePerch(backgroundObjects, otherCrows = []) {
    const taken = [];
    for (const other of otherCrows) {
      if (!other || other === this) continue;
      taken.push(other.homePosition);
    }
    const claimDistSq = (GRID.CELL_SIZE * 0.5) ** 2;
    const isTaken = (x, y) => taken.some(p => {
      if (!p) return false;
      const dx = p.x - x;
      const dy = p.y - y;
      return dx * dx + dy * dy < claimDistSq;
    });

    let bestPerch = null;
    let bestDistSq = PERCH_SEARCH_RADIUS * PERCH_SEARCH_RADIUS;

    for (const obj of backgroundObjects) {
      if (!obj || obj.destroyed) continue;
      if (!PERCH_CHARS.has(obj.char)) continue;
      const perchX = obj.position.x;
      const perchY = obj.position.y - PERCH_OFFSET;
      if (isTaken(perchX, perchY)) continue;
      const dx = obj.position.x - this.position.x;
      const dy = obj.position.y - this.position.y;
      const distSq = dx * dx + dy * dy;
      if (distSq < bestDistSq) {
        bestDistSq = distSq;
        bestPerch = { x: perchX, y: perchY };
      }
    }

    if (bestPerch) return bestPerch;

    // No tree nearby — pick the nearest wall edge, one cell inside the border.
    const inset = GRID.CELL_SIZE * 1.5;
    const candidates = [
      { x: inset,                    y: this.position.y },           // west wall
      { x: GRID.WIDTH - inset,       y: this.position.y },           // east wall
      { x: this.position.x,          y: inset },                     // north wall
      { x: this.position.x,          y: GRID.HEIGHT - inset },       // south wall
    ];
    let bestWall = null;
    let bestWallDistSq = Infinity;
    for (const c of candidates) {
      if (isTaken(c.x, c.y)) continue;
      const dx = c.x - this.position.x;
      const dy = c.y - this.position.y;
      const d = dx * dx + dy * dy;
      if (d < bestWallDistSq) { bestWallDistSq = d; bestWall = c; }
    }
    if (bestWall) return bestWall;

    return { x: this.originalHome.x, y: this.originalHome.y };
  }

  // Renderer reads this to nudge the y position. Idle = subtle bob; flying = wing-flap waver.
  getRenderOffsetY() {
    if (this.state === 'idle') {
      return Math.sin(this.bobPhase) * IDLE_BOB_AMP;
    }
    return Math.sin(this.wingPhase) * 2;
  }

  // True when an attack point is within scare distance.
  isWithinScareRange(x, y) {
    const dx = this.position.x - x;
    const dy = this.position.y - y;
    return (dx * dx + dy * dy) <= SCARE_RADIUS * SCARE_RADIUS;
  }
}

export { SCARE_RADIUS };
