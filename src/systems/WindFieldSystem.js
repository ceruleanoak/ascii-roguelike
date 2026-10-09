/**
 * WindFieldSystem — local, transient Wind Fields (GLOSSARY: Wind Field).
 *
 * Where SandstormSystem is one room-global wind vector, a Wind Field is a
 * force source with a position and a shape that its owner (today: the Storm
 * Eye, the yellow zone Boss) moves and reshapes every frame:
 *
 *   swirl    tangential spin around the centre plus a mild inward draw
 *   suction  pull toward the centre, growing stronger near the core
 *   gust     a cone of straight wind out of the centre; solid cells cast a
 *            wind shadow (anything behind collision is sheltered)
 *
 * The forces are analytic and deliberately simple — `forceAt()` is the one
 * definition, sampled by the player, enemies, loose items and projectiles
 * alike. The motes are cosmetic: each one is choreographed per field kind
 * (orbiting, spiralling, streaking) at the field's live strength, so what the
 * player sees revolves the same way the push they feel does without the motes
 * having to be a physical simulation.
 *
 * Owned by BossSystem (`bossSystem.windFieldSystem`, like MawShadowSystem) —
 * the Storm Eye is the only source, so BossSystem.update() ticks it and
 * BossSystem.deactivate() clears it.
 */

import { GRID } from '../game/GameConfig.js';
import { isInteriorActive } from './PlaneSystem.js';

const CS = GRID.CELL_SIZE;

// Projectiles carry no friction, so the same push bends them far harder than
// it moves a walker; this keeps a shot readable rather than instantly reversed.
const PROJECTILE_WIND_SCALE = 0.6;
// Below this distance the swirl/suction direction is undefined (dividing by
// ~0); the core is treated as still air.
const CORE_DEADZONE = 4;
// Wind-shadow ray march step (px).
const SHADOW_STEP = CS / 2;

const MOTE_FONT = `${Math.round(CS * 0.7)}px 'Unifont', monospace`;

/**
 * Field spec (all optional except kind):
 *   kind           'swirl' | 'suction' | 'gust'
 *   x, y           centre (px, canvas space — not cell top-left)
 *   radius         reach (px)
 *   power          px/s² at full strength
 *   strength       0..1 live multiplier (the owner ramps it up and down)
 *   spin           swirl: +1 clockwise, -1 counter-clockwise
 *   inward         swirl: fraction of power drawn toward the centre
 *   spinRate       swirl/suction motes: base revolutions per second
 *   dirX, dirY     gust: unit direction
 *   coneHalfAngle  gust: half-width of the cone (radians)
 *   rollProof      true → a dodge roll does NOT escape the push
 *   moteCount      motes at full strength
 *   moteChars      glyph pool for the motes
 *   moteColors     colour pool for the motes
 */
const FIELD_DEFAULTS = {
  x: 0, y: 0, radius: CS * 6, power: 0, strength: 0,
  spin: 1, inward: 0, spinRate: 0.5,
  dirX: 1, dirY: 0, coneHalfAngle: Math.PI / 6,
  rollProof: false,
  moteCount: 40,
  moteChars: ['·', '.', '`', "'"],
  moteColors: ['#d9c98a', '#e0d8a8'],
};

export class WindFieldSystem {
  constructor(game) {
    this.game = game;
    this.fields = new Map();   // id → field
    this.motes = new Map();    // id → mote[]
  }

  // ── Field lifecycle ────────────────────────────────────────────────────────

  /** Create or update a field by id; omitted keys keep their current value. */
  setField(id, spec) {
    const existing = this.fields.get(id);
    if (existing) {
      const kindChanged = spec.kind && spec.kind !== existing.kind;
      Object.assign(existing, spec);
      if (kindChanged) this.motes.delete(id);
      return existing;
    }
    const field = { ...FIELD_DEFAULTS, ...spec, id };
    this.fields.set(id, field);
    return field;
  }

  clearField(id) {
    this.fields.delete(id);
    this.motes.delete(id);
  }

  reset() {
    this.fields.clear();
    this.motes.clear();
  }

  get active() {
    return this.fields.size > 0;
  }

  // ── Force model ────────────────────────────────────────────────────────────

  /**
   * Summed wind force (px/s²) at a canvas point. `opts.rolling` drops fields
   * a dodge roll escapes (every kind but `rollProof` ones).
   */
  forceAt(x, y, opts = {}) {
    let fx = 0, fy = 0;
    for (const f of this.fields.values()) {
      if (f.strength <= 0 || f.power <= 0) continue;
      if (opts.rolling && !f.rollProof) continue;
      const v = this._fieldForce(f, x, y);
      fx += v.fx;
      fy += v.fy;
    }
    return { fx, fy };
  }

  _fieldForce(f, x, y) {
    const dx = x - f.x;
    const dy = y - f.y;
    const d = Math.hypot(dx, dy);
    if (d > f.radius || d < CORE_DEADZONE) return { fx: 0, fy: 0 };
    const nx = dx / d, ny = dy / d;           // outward unit
    const near = 1 - d / f.radius;            // 1 at the core, 0 at the rim
    const mag = f.power * f.strength;

    if (f.kind === 'swirl') {
      // Strongest close in; the tangent is perpendicular to the outward unit.
      const k = mag * (0.35 + 0.65 * near);
      const tx = -ny * f.spin, ty = nx * f.spin;
      return { fx: k * (tx - nx * f.inward), fy: k * (ty - ny * f.inward) };
    }
    if (f.kind === 'suction') {
      const k = mag * (0.3 + 0.7 * near * near + 0.4 * near);
      return { fx: -nx * k, fy: -ny * k };
    }
    if (f.kind === 'gust') {
      const cos = nx * f.dirX + ny * f.dirY;
      if (cos < Math.cos(f.coneHalfAngle)) return { fx: 0, fy: 0 };
      if (this._shadowed(f.x, f.y, x, y)) return { fx: 0, fy: 0 };
      const k = mag * (1 - 0.4 * (d / f.radius));
      return { fx: f.dirX * k, fy: f.dirY * k };
    }
    return { fx: 0, fy: 0 };
  }

  /** True when a solid cell lies on the line from the gust origin to (x, y). */
  _shadowed(ox, oy, x, y) {
    const map = this.game.activeRoom?.collisionMap ?? this.game.currentRoom?.collisionMap;
    if (!map) return false;
    const d = Math.hypot(x - ox, y - oy);
    const steps = Math.floor(d / SHADOW_STEP);
    const targetCol = Math.floor(x / CS), targetRow = Math.floor(y / CS);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const col = Math.floor((ox + (x - ox) * t) / CS);
      const row = Math.floor((oy + (y - oy) * t) / CS);
      if (col === targetCol && row === targetRow) break;
      if (map[row]?.[col]) return true;
    }
    return false;
  }

  // ── Per-frame application ──────────────────────────────────────────────────

  update(dt) {
    if (!this.active) return;
    const game = this.game;

    // Surface-only, like the Sandstorm: interiors and the Aquifer plane are
    // out of the wind.
    if (!isInteriorActive(game) && game.player?.plane !== 1) {
      const p = game.player;
      if (p?.velocity && !p.inLiquid) {
        const rolling = !!p.dodgeRoll?.active;
        this._push(p, this._center(p), dt, { rolling });
      }
      for (const e of game._activeEnemies?.() ?? []) {
        if (!e?.velocity || e.isDying || e.isBossEntity) continue;
        if (e._isOnWater?.() || e.inLiquid) continue;
        this._push(e, this._center(e), dt);
      }
      for (const item of game.items ?? []) {
        if (!item?.velocity || item.plane === 1 || item.hutPlane || item.mazePlane) continue;
        this._push(item, this._center(item), dt);
      }
    }

    this._updateMotes(dt);
  }

  /** Bend a projectile in flight (CombatSystem, before it integrates position). */
  pushProjectile(proj, dt) {
    if (!this.active || !proj?.velocity || proj.plane === 1) return;
    const { fx, fy } = this.forceAt(proj.position.x, proj.position.y);
    proj.velocity.vx += fx * PROJECTILE_WIND_SCALE * dt;
    proj.velocity.vy += fy * PROJECTILE_WIND_SCALE * dt;
  }

  _push(entity, c, dt, opts) {
    const { fx, fy } = this.forceAt(c.x, c.y, opts);
    if (fx === 0 && fy === 0) return;
    // Same mass scaling as SandstormSystem._pushEntity.
    const mass = entity.mass ?? entity.data?.mass ?? 1;
    const massScale = 1 / Math.max(0.4, mass);
    entity.velocity.vx += fx * massScale * dt;
    entity.velocity.vy += fy * massScale * dt;
  }

  _center(entity) {
    return { x: entity.position.x + CS / 2, y: entity.position.y + CS / 2 };
  }

  // ── Motes (cosmetic) ───────────────────────────────────────────────────────

  _updateMotes(dt) {
    for (const f of this.fields.values()) {
      let pool = this.motes.get(f.id);
      if (!pool) {
        pool = [];
        for (let i = 0; i < f.moteCount; i++) pool.push(this._spawnMote(f, true));
        this.motes.set(f.id, pool);
      }
      for (const m of pool) this._stepMote(f, m, dt);
    }
  }

  _spawnMote(f, initial) {
    const m = {
      angle: Math.random() * Math.PI * 2,
      r: f.radius * (initial ? 0.15 + Math.random() * 0.85 : 0.85 + Math.random() * 0.15),
      along: initial ? Math.random() * f.radius : Math.random() * CS * 1.5,
      lateral: (Math.random() - 0.5) * 2,     // gust: -1..1 across the cone
      speedJitter: 0.7 + Math.random() * 0.6,
      char: f.moteChars[Math.floor(Math.random() * f.moteChars.length)],
      color: f.moteColors[Math.floor(Math.random() * f.moteColors.length)],
      x: f.x, y: f.y,
      hidden: false,
    };
    this._placeMote(f, m);
    return m;
  }

  _stepMote(f, m, dt) {
    const s = f.strength;
    if (f.kind === 'swirl') {
      // Faster in close, like a real vortex; radius breathes a little.
      const near = 1 - m.r / f.radius;
      m.angle += f.spin * Math.PI * 2 * f.spinRate * (0.6 + 1.4 * near) * m.speedJitter * s * dt;
      m.r += Math.sin(m.angle * 3) * CS * 0.4 * dt - f.inward * CS * 0.8 * s * dt;
      if (m.r < CS * 0.6) m.r = f.radius * (0.7 + Math.random() * 0.3);
    } else if (f.kind === 'suction') {
      // Spiral in, accelerating toward the core; reborn at the rim.
      const near = 1 - m.r / f.radius;
      m.angle += Math.PI * 2 * f.spinRate * (0.4 + 2.2 * near) * m.speedJitter * s * dt;
      m.r -= CS * (1.5 + 9 * near * near) * m.speedJitter * s * dt;
      if (m.r < CS * 0.4) { m.r = f.radius * (0.85 + Math.random() * 0.15); m.angle = Math.random() * Math.PI * 2; }
    } else if (f.kind === 'gust') {
      m.along += CS * 14 * m.speedJitter * s * dt;
      if (m.along > f.radius) { m.along = Math.random() * CS * 1.5; m.lateral = (Math.random() - 0.5) * 2; }
    }
    this._placeMote(f, m);
    // Strength thins the pool so the ramp-up and die-down are visible; gust
    // motes that fly into a wind shadow vanish there.
    m.hidden = m.speedJitter - 0.7 > s * 0.6 + (s > 0 ? 0.05 : -1)
      || (f.kind === 'gust' && this._shadowed(f.x, f.y, m.x, m.y));
  }

  _placeMote(f, m) {
    if (f.kind === 'gust') {
      // Perpendicular to the gust direction, widening with distance.
      const px = -f.dirY, py = f.dirX;
      const spread = Math.tan(f.coneHalfAngle) * m.along * m.lateral;
      m.x = f.x + f.dirX * m.along + px * spread;
      m.y = f.y + f.dirY * m.along + py * spread;
    } else {
      m.x = f.x + Math.cos(m.angle) * m.r;
      m.y = f.y + Math.sin(m.angle) * m.r;
    }
  }

  render(ctx) {
    if (!this.active) return;
    ctx.save();
    ctx.font = MOTE_FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const [id, pool] of this.motes) {
      const f = this.fields.get(id);
      if (!f || f.strength <= 0) continue;
      ctx.globalAlpha = 0.3 + 0.5 * f.strength;
      for (const m of pool) {
        if (m.hidden) continue;
        ctx.fillStyle = m.color;
        ctx.fillText(m.char, m.x, m.y);
      }
    }
    ctx.restore();
  }
}
