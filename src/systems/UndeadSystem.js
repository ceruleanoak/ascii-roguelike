import { GRID } from '../game/GameConfig.js';
import { steerToward } from './npcSteering.js';
import { getEnemyData } from '../data/enemies.js';

/**
 * UndeadSystem — the Undead: risen figures that fill a Cursed run.
 *
 * They are a portent, not a fight. They shamble, they crowd, they get between
 * the player and the room; they do not attack, take damage, drop anything, or
 * end a run. Their whole job is to be seen, and to keep being seen in more of
 * the world the longer the curse runs — around a cracked slot first, then the
 * graveyard south of REST, and finally inside REST itself.
 *
 * Deliberately NOT `Enemy` instances. NEUTRAL and REST have no enemy update or
 * render path at all (`NeutralRenderer` says so on line 6, and REST's combat
 * tick passes empty lists), so making these Enemies would mean building a
 * combat pipeline into two non-combat states to host something that never
 * fights. They borrow only the gray zone's alphabet — 'S' Skeleton, 'Z' Risen
 * and up — so a cursed run reads in the same letters as the zone it is bending
 * the world toward.
 *
 * Deliberately NOT `BackgroundObject`s either: background objects are baked
 * into a cached canvas layer, and something that moves every frame would
 * invalidate that cache every frame. They are drawn on the foreground instead,
 * by `drawUndead` (`src/rendering/ui/UndeadRenderer.js`) — one helper shared by
 * the NEUTRAL and REST render passes, per the both-passes-same-commit rule.
 *
 * Movement is `steerToward()` per the standing NPC rule; position integration
 * lives here because PhysicsSystem never sees these. The plan's
 * `WanderMechanic` in `entities/enemyMechanics/` would have been the right home
 * for wander on an Enemy — these aren't Enemies, so the wander is here instead.
 */

// A shamble. Slower than the Risen's own 22, because nothing here is hunting.
const UNDEAD_SPEED = 18;

// How far from where it rose an undead will drift before turning back. Small
// enough that a crowd stays a crowd.
const ROAM_RADIUS = GRID.CELL_SIZE * 3.5;
const ARRIVE_DIST = GRID.CELL_SIZE * 0.6;

// The beat spent standing still between drifts, so the crowd never reads as a
// uniform flock all moving at once.
const PAUSE_MIN = 0.7;
const PAUSE_MAX = 2.4;

// Coming up out of the ground: held in place, fading in, for this long.
const RISE_DURATION = 1.1;

// The bands the gray zone raises, reused so the curse speaks in gray's letters.
const EARLY_UNDEAD = ['S', 'Z'];

export class UndeadSystem {
  constructor() {
    /** @type {Array<object>} live figures in the room the player is standing in */
    this.undead = [];
  }

  /** Nothing risen. Room changes and full resets both land here. */
  clear() {
    this.undead.length = 0;
  }

  get count() {
    return this.undead.length;
  }

  /**
   * Raise `count` undead in a ring around a world point. The ring is what makes
   * them read as having come up *around* something rather than wandered in;
   * each one then keeps that spot as the center of its own drift.
   *
   * @param {object} game
   * @param {number} centerX world px
   * @param {number} centerY world px
   * @param {number} count how many to raise
   * @param {object} [opts] `radius` px for the ring, `chars` to override the band
   */
  rise(game, centerX, centerY, count, opts = {}) {
    const radius = opts.radius ?? GRID.CELL_SIZE * 3;
    const chars = opts.chars ?? EARLY_UNDEAD;
    const map = game?.currentRoom?.collisionMap || null;
    const startAngle = Math.random() * Math.PI * 2;

    for (let i = 0; i < count; i++) {
      // Even spacing plus a jitter: a ring the eye reads as a ring, without the
      // clock-face regularity that would read as decoration.
      const angle = startAngle + (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
      const dist = radius * (0.75 + Math.random() * 0.45);
      const x = this._clamp(centerX + Math.cos(angle) * dist, GRID.WIDTH);
      const y = this._clamp(centerY + Math.sin(angle) * dist, GRID.HEIGHT);
      this.undead.push(this._make(chars[i % chars.length], x, y, map));
    }

    game?.audioSystem?.playSFX('bone_rise');
  }

  /** One figure, standing where it came up. */
  _make(char, x, y, collisionMap) {
    const data = getEnemyData(char);
    return {
      char,
      color: data?.color || '#eeeeee',
      position: { x, y },
      velocity: { vx: 0, vy: 0 },
      collisionMap,
      homeX: x,
      homeY: y,
      target: null,
      pauseTimer: Math.random() * PAUSE_MAX,
      riseTimer: RISE_DURATION,
      alpha: 0
    };
  }

  /** Keep a spawn or a drift target off the border ring and inside the room. */
  _clamp(v, extent) {
    const margin = GRID.CELL_SIZE * 1.5;
    return Math.max(margin, Math.min(extent - margin, v));
  }

  // ── Runtime ─────────────────────────────────────────────────────────────────

  /**
   * Per-frame shamble. Called from the NEUTRAL and REST update paths; inert
   * with nothing risen, which is every room on an uncursed run.
   */
  update(dt, game) {
    if (!this.undead.length) return;

    for (const u of this.undead) {
      if (u.riseTimer > 0) {
        // Still coming up — held in place while it fades in.
        u.riseTimer -= dt;
        u.alpha = 1 - Math.max(u.riseTimer, 0) / RISE_DURATION;
        continue;
      }
      u.alpha = 1;

      if (u.pauseTimer > 0) {
        u.pauseTimer -= dt;
        u.velocity.vx = 0;
        u.velocity.vy = 0;
        continue;
      }

      if (!u.target) u.target = this._pickDrift(u);

      const reached = Math.hypot(u.target.x - u.position.x, u.target.y - u.position.y) < ARRIVE_DIST;
      if (reached) {
        u.target = null;
        u.pauseTimer = PAUSE_MIN + Math.random() * (PAUSE_MAX - PAUSE_MIN);
        u.velocity.vx = 0;
        u.velocity.vy = 0;
        continue;
      }

      steerToward(game, u, u.target.x, u.target.y, UNDEAD_SPEED);
      this._integrate(u, dt);
    }
  }

  /** A new spot to drift to, somewhere inside this one's roam radius. */
  _pickDrift(u) {
    const angle = Math.random() * Math.PI * 2;
    const dist = ROAM_RADIUS * (0.3 + Math.random() * 0.7);
    return {
      x: this._clamp(u.homeX + Math.cos(angle) * dist, GRID.WIDTH),
      y: this._clamp(u.homeY + Math.sin(angle) * dist, GRID.HEIGHT)
    };
  }

  /**
   * Move by the velocity steerToward just set, one axis at a time so a wall
   * on one axis doesn't cancel progress on the other. PhysicsSystem owns this
   * for every entity it knows about; it does not know about these.
   */
  _integrate(u, dt) {
    const nx = u.position.x + u.velocity.vx * dt;
    if (!this._blocked(u.collisionMap, nx, u.position.y)) u.position.x = nx;

    const ny = u.position.y + u.velocity.vy * dt;
    if (!this._blocked(u.collisionMap, u.position.x, ny)) u.position.y = ny;
  }

  _blocked(map, x, y) {
    if (!map) return false;
    const col = Math.floor(x / GRID.CELL_SIZE);
    const row = Math.floor(y / GRID.CELL_SIZE);
    const r = map[row];
    if (!r || col < 0 || col >= r.length) return true; // out of bounds is solid
    return !!r[col];
  }
}
