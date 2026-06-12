/**
 * SandstormSystem — yellow-zone environmental wind effect.
 *
 * Per room: picks one of 8 wind directions and a mild wind speed. Applies a
 * gentle additive nudge to player + enemy velocities every frame (much weaker
 * than knockback or conveyor) and renders drifting sand motes in the wind
 * direction. Optionally schedules periodic lightning strikes through the
 * existing LightningStrikeSystem.
 *
 * Lifecycle: `bindToRoom(room)` re-rolls per room. `deactivate()` clears
 * particles when leaving yellow zone or entering an interior.
 */

import { GRID } from '../game/GameConfig.js';

const DIRECTIONS = [
  { dx:  0, dy: -1 }, // N
  { dx:  1, dy: -1 }, // NE
  { dx:  1, dy:  0 }, // E
  { dx:  1, dy:  1 }, // SE
  { dx:  0, dy:  1 }, // S
  { dx: -1, dy:  1 }, // SW
  { dx: -1, dy:  0 }, // W
  { dx: -1, dy: -1 }, // NW
];

const PARTICLE_CHARS = ['·', '.', '`', "'"];
const PARTICLE_COLORS = ['#d9c98a', '#c9b870', '#b8a565', '#e0d8a8'];

// Mild push range — well below normal movement speed so it reads as drift, not shove.
const MIN_PUSH = 14;   // px/s² nudge at the low end
const MAX_PUSH = 38;   // px/s² nudge at the high end

// Lightning cadence (seconds between strikes when enabled)
const LIGHTNING_MIN = 5;
const LIGHTNING_MAX = 10;

// 25% of yellow rooms also storm with lightning
const LIGHTNING_ROOM_CHANCE = 0.25;

export class SandstormSystem {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.activeRoom = null;
    this.dirX = 0;
    this.dirY = 0;
    this.pushForce = 0;        // additive vel/sec applied to entities
    this.particles = [];
    this.particleCount = 70;
    this.lightningEnabled = false;
    this.lightningTimer = 0;
  }

  // Re-roll storm state for a freshly entered room. Idempotent per room ref.
  bindToRoom(room) {
    if (this.activeRoom === room) return;
    this.activeRoom = room;
    if (!room || room.zone !== 'yellow') {
      this.deactivate();
      return;
    }
    this._roll();
  }

  _roll() {
    const dir = DIRECTIONS[Math.floor(Math.random() * DIRECTIONS.length)];
    this.dirX = dir.dx;
    this.dirY = dir.dy;
    const m = Math.sqrt(this.dirX * this.dirX + this.dirY * this.dirY) || 1;
    this.dirX /= m;
    this.dirY /= m;
    this.pushForce = MIN_PUSH + Math.random() * (MAX_PUSH - MIN_PUSH);
    this.active = true;
    this.lightningEnabled = Math.random() < LIGHTNING_ROOM_CHANCE;
    this.lightningTimer = this.lightningEnabled
      ? (LIGHTNING_MIN + Math.random() * (LIGHTNING_MAX - LIGHTNING_MIN))
      : 0;
    this._seedParticles();
  }

  deactivate() {
    this.active = false;
    this.particles = [];
    this.lightningEnabled = false;
    this.lightningTimer = 0;
  }

  reset() {
    this.activeRoom = null;
    this.deactivate();
  }

  _seedParticles() {
    this.particles = [];
    for (let i = 0; i < this.particleCount; i++) {
      this.particles.push(this._makeParticle(true));
    }
  }

  _makeParticle(initial) {
    const speed = this._particleSpeed();
    return {
      x: Math.random() * GRID.WIDTH,
      y: Math.random() * GRID.HEIGHT,
      vx: this.dirX * speed,
      vy: this.dirY * speed,
      char: PARTICLE_CHARS[Math.floor(Math.random() * PARTICLE_CHARS.length)],
      color: PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)],
      life: 2.0 + Math.random() * 3.5
    };
  }

  _particleSpeed() {
    return this.pushForce * 4 + 22 + Math.random() * 30;
  }

  // Per-frame logic. Caller must `bindToRoom` first.
  update(deltaTime) {
    if (!this.active) return;

    const game = this.game;
    const playerInside = !!(game.player && (game.player.inHut || game.player.inDungeon || game.player.inMaze));

    if (!playerInside) {
      const p = game.player;
      // Skip player push when:
      //  - dodge/iframes: dodge owns the velocity vector outright
      //  - in liquid: river current (PhysicsSystem) already drives water motion;
      //    stacking wind on top fights the current and has caused visual desync
      const playerLocked = p?.dodgeRoll?.active || p?.invulnerabilityTimer > 0 || p?.inLiquid;
      if (p?.velocity && !playerLocked) {
        this._pushEntity(p, deltaTime);
      }
      if (game.currentRoom?.enemies) {
        for (const e of game.currentRoom.enemies) {
          if (!e?.velocity || e.isDying) continue;
          // Same exclusion for enemies — anything riding the river current
          // (jumpers swimming, ground enemies wading) is owned by water physics.
          if (e._isOnWater?.() || e.inLiquid) continue;
          this._pushEntity(e, deltaTime);
        }
      }
    }

    for (const p of this.particles) {
      p.x += p.vx * deltaTime;
      p.y += p.vy * deltaTime;
      p.life -= deltaTime;
      if (p.life <= 0 ||
          p.x < -16 || p.x > GRID.WIDTH + 16 ||
          p.y < -16 || p.y > GRID.HEIGHT + 16) {
        this._respawn(p);
      }
    }

    if (this.lightningEnabled && !playerInside) {
      this.lightningTimer -= deltaTime;
      if (this.lightningTimer <= 0) {
        this._strikeRandom();
        this.lightningTimer = LIGHTNING_MIN + Math.random() * (LIGHTNING_MAX - LIGHTNING_MIN);
      }
    }
  }

  _pushEntity(entity, dt) {
    // Lighter mass → drifts more; heavier mass → shrugs it off.
    const mass = entity.mass ?? entity.data?.mass ?? 1;
    const massScale = 1 / Math.max(0.4, mass);
    entity.velocity.vx += this.dirX * this.pushForce * massScale * dt;
    entity.velocity.vy += this.dirY * this.pushForce * massScale * dt;
  }

  _respawn(p) {
    // Random screen position with extra bias toward the upwind edge.
    // Uniform-random respawn prevents clustering when many particles die in the
    // same frame (e.g. after a long update batch during a dodge roll).
    const speed = this._particleSpeed();
    const edgeBias = Math.random() < 0.45;
    if (edgeBias && this.dirX !== 0) {
      p.x = this.dirX > 0 ? -8 + Math.random() * 24 : GRID.WIDTH + 8 - Math.random() * 24;
      p.y = Math.random() * GRID.HEIGHT;
    } else if (edgeBias && this.dirY !== 0) {
      p.x = Math.random() * GRID.WIDTH;
      p.y = this.dirY > 0 ? -8 + Math.random() * 24 : GRID.HEIGHT + 8 - Math.random() * 24;
    } else {
      p.x = Math.random() * GRID.WIDTH;
      p.y = Math.random() * GRID.HEIGHT;
    }
    p.vx = this.dirX * speed;
    p.vy = this.dirY * speed;
    p.char = PARTICLE_CHARS[Math.floor(Math.random() * PARTICLE_CHARS.length)];
    p.color = PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)];
    p.life = 2.0 + Math.random() * 3.5;
  }

  _strikeRandom() {
    const lss = this.game.lightningStrikeSystem;
    if (!lss) return;
    let x, y;
    // Half the storm strikes aim at water when the room has any — rivers are
    // the show: a strike on the channel sends a visible electric cascade
    // downstream (ElectricitySystem). The rest stay fully random.
    const waterTiles = (this.game.currentRoom?.backgroundObjects ?? [])
      .filter(o => !o.destroyed && o.isWater?.());
    if (waterTiles.length > 0 && Math.random() < 0.5) {
      const t = waterTiles[Math.floor(Math.random() * waterTiles.length)];
      x = t.position.x + GRID.CELL_SIZE / 2;
      y = t.position.y + GRID.CELL_SIZE / 2;
    } else {
      const margin = GRID.CELL_SIZE * 2;
      x = margin + Math.random() * (GRID.WIDTH  - margin * 2);
      y = margin + Math.random() * (GRID.HEIGHT - margin * 2);
    }
    lss.scheduleStrike({ x, y, delay: 0.7, hitsPlayer: true, plane: 0 });
  }

  render(ctx) {
    if (!this.active || this.particles.length === 0) return;
    ctx.save();
    ctx.font = `${Math.round(GRID.CELL_SIZE * 0.7)}px 'Unifont', monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = 0.4;
    for (const p of this.particles) {
      ctx.fillStyle = p.color;
      ctx.fillText(p.char, p.x, p.y);
    }
    ctx.restore();
  }
}
