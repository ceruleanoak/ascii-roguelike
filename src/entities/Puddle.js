import { GRID, WATER_COLORS } from '../game/GameConfig.js';

// Persistent floor-level area that applies effects to entities standing on it.
// Designed to be extended for any fluid/hazard type: slime, lava, mud, water, poison, etc.
//
// Optional `opts`:
//   shape:    'circle' (default) — soft round stain
//             'square'           — hard hazard tile (used by slime trails)
//   opaque:   false (default)    — semi-transparent fill (0.28 alpha)
//             true               — solid fill (1.0 alpha)
//   lifetime: Infinity (default) — persistent until external system removes it
//             <number>           — auto-expires after N seconds (no shrink, just vanish)
export class Puddle {
  constructor(x, y, radius, type = 'slime', plane = 0, opts = {}) {
    this.position = { x, y };
    this.radius = radius;
    this.type = type;
    this.plane = plane;
    this.expired = false;

    this.shape = opts.shape ?? 'circle';
    this.opaque = !!opts.opaque;
    this.lifetime = opts.lifetime ?? Infinity;
    this.age = 0;

    const visual = Puddle.VISUALS[type] ?? Puddle.VISUALS.slime;
    this.color = visual.color;
    this.fillColor = visual.fillColor;
    this.char = visual.char;

    // Electric current — conductive types only (Puddle.CONDUCTIVE_TYPES).
    // Mirrors a water tile's 'electrified' state: ElectricitySystem's cascade
    // sets it, the timer decays it, and `electricCurrent` carries the imbued
    // current ({ pips, source }) the way BackgroundObject.electricCurrent does,
    // or null for full-strength current.
    this.electrifiedTimer = 0;
    this.electricCurrent = null;
    this._electricBlinkTimer = 0;
    this._electricBlinkOn = false;

    // Pre-seeded scatter positions for stable per-frame rendering
    this.scatterPoints = [];
    const count = Math.min(Math.floor(Math.PI * radius * radius / 220), 28);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * radius * 0.88;
      this.scatterPoints.push({ dx: Math.cos(angle) * r, dy: Math.sin(angle) * r });
    }
  }

  update(deltaTime) {
    this._updateElectrified(deltaTime);
    if (this.lifetime === Infinity) return;
    this.age += deltaTime;
    if (this.age >= this.lifetime) this.expired = true;
  }

  isConductive() {
    return Puddle.CONDUCTIVE_TYPES.has(this.type);
  }

  isElectrified() {
    return this.electrifiedTimer > 0;
  }

  // Charge this puddle for `duration` seconds. Only conductive types take it.
  electrify(duration, electricCurrent = null) {
    if (!this.isConductive()) return;
    this.electrifiedTimer = duration;
    this.electricCurrent = electricCurrent;
  }

  // Electrified blink: the same yellow/base alternation at the same 0.15s
  // cadence as an electrified water tile (BackgroundObject.update), so live
  // slime reads as the same hazard as live water. Drives fillColor/color
  // directly, so every drawPuddles pass (surface + interior PiP) shows it
  // with no renderer change.
  _updateElectrified(deltaTime) {
    if (this.electrifiedTimer <= 0) return;
    const visual = Puddle.VISUALS[this.type] ?? Puddle.VISUALS.slime;
    this.electrifiedTimer -= deltaTime;
    if (this.electrifiedTimer <= 0) {
      this.electrifiedTimer = 0;
      this.electricCurrent = null;
      this.fillColor = visual.fillColor;
      this.color = visual.color;
      return;
    }
    this._electricBlinkTimer -= deltaTime;
    if (this._electricBlinkTimer <= 0) {
      this._electricBlinkTimer = 0.15;
      this._electricBlinkOn = !this._electricBlinkOn;
    }
    this.fillColor = this._electricBlinkOn ? WATER_COLORS.electrified : visual.fillColor;
    this.color = this._electricBlinkOn ? WATER_COLORS.electrified : visual.color;
  }

  isEntityOnPuddle(entity) {
    const C = GRID.CELL_SIZE / 2;
    const ex = entity.position.x + C;
    const ey = entity.position.y + C;
    if (this.shape === 'square') {
      const r = this.radius;
      return ex >= this.position.x - r && ex <= this.position.x + r
          && ey >= this.position.y - r && ey <= this.position.y + r;
    }
    const dx = ex - this.position.x;
    const dy = ey - this.position.y;
    return (dx * dx + dy * dy) <= this.radius * this.radius;
  }
}

// Puddle types that conduct electricity the way water does (ElectricitySystem
// cascade). Slime trails only: a sticky, wet film. Fire/ice/lava are not
// conductors here — ice already blocks the water cascade, and fire/lava would
// need their own rules.
Puddle.CONDUCTIVE_TYPES = new Set(['slimeTrail']);

// Visual definition per type. Add new types here as they are implemented.
Puddle.VISUALS = {
  slime:      { fillColor: '#00cc44', color: '#00ff66', char: '~' },
  slimeTrail: { fillColor: '#00cc44', color: '#00ff66', char: '~' },
  lava:       { fillColor: '#ff4400', color: '#ff8844', char: '~' },
  mud:        { fillColor: '#664422', color: '#997744', char: '~' },
  water:      { fillColor: '#0055cc', color: '#4499ff', char: '~' },
  poison:     { fillColor: '#880099', color: '#cc44ff', char: '~' },
  fire:       { fillColor: '#cc3300', color: '#ff6622', char: '!' },
  ice:        { fillColor: '#448899', color: '#88ddff', char: 'i' },
};
