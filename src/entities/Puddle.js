import { GRID } from '../game/GameConfig.js';

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
    if (this.lifetime === Infinity) return;
    this.age += deltaTime;
    if (this.age >= this.lifetime) this.expired = true;
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
