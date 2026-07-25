// Telegraph Animation — the choreography of a Telegraph: which part of the
// shape is lit at each moment, and (because the animation declares the beats)
// when damage actually lands.
//
// The animation is the single source of truth for an attack's rhythm. A
// `doubleSweep` *means* two hits: its beats are compiled into the pulse list
// that CombatSystem resolves damage against, so what the player watches and
// what connects cannot drift apart. Author the rhythm once, in the animation.
//
// Data contract (enemy data, inside the `telegraph` block):
//
//   telegraph: {
//     shape: 'horizontalSliceThin',   // a SHAPE_PRESETS name — expands to warn/hit shapes
//     animation: 'doubleSweep',       // an ANIMATIONS name — declares the beats
//     beatDamage: [1.0, 0.5],         // optional per-beat damage multipliers
//   }
//
// The explicit form still works and is what presets expand into — author
// `warnShape`/`hitShape` directly when no preset fits. An explicit `pulses`
// list alongside an `animation` is an authoring conflict: the animation wins
// and the conflict is reported, because two sources of rhythm is the exact
// drift this module exists to prevent.
//
// Naming note: "vertical" and "horizontal" are relative to the *attack
// direction*, not the screen. An enemy facing right draws its vertical slice
// horizontally on screen. The words describe the swing, not the pixels.

import { GRID } from './GameConfig.js';

const CELL = GRID.CELL_SIZE;

// Everything is lit. Distinct from an empty band list (nothing lit) — the two
// are opposite ends of the same signal, so they must not both be "falsy".
export const FULL = 'full';

// Normalized half-width of a travelling band, as a fraction of the axis it
// runs along. Wide enough to read as a moving slab of danger at cell scale
// rather than a one-cell scanline.
const BAND_HALF = 0.18;

// A band that enters from before the start of the axis and exits past the end,
// so the leading and trailing edges both sweep fully off the shape.
function travel(p, reverse = false) {
  const w = BAND_HALF * 2;
  const t = reverse ? 1 - p : p;
  const center = -w / 2 + t * (1 + w);
  return [[center - w / 2, center + w / 2]];
}

// ── shape presets ───────────────────────────────────────────────────────────

// Named shapes over the existing rect/ring primitives. Each preset's warn
// shape is deliberately a little larger than its hit shape — a Telegraph aids
// anticipation and is not a 1:1 damage outline (see GLOSSARY "Telegraph").
//
// The ring is the exception worth reading twice: its *hit* inner radius is
// larger than its *warn* inner radius, so the safe disc is bigger than it
// looks. Dodging into the enemy is the answer, and the warning overstates the
// danger inward to make that answer feel like a discovery.
// Sizing floor: `rasterizeToCells` keeps a cell only when its *center* falls
// inside the shape, so any dimension thinner than about 1.25 cells can
// rasterize to nothing depending on where the enemy happens to stand. Damage
// would still land (hitTest samples the box, not cell centers) while the strike
// drew nothing — an invisible hit. Every preset dimension below clears that
// floor; keep it that way when tuning.
export const SHAPE_PRESETS = {
  basic: {
    warnShape: { kind: 'rect', length: 2.0, width: 2.5 },
    hitShape: { kind: 'rect', length: 1.75, width: 2.0 },
  },
  verticalSlice: {
    warnShape: { kind: 'rect', length: 3.5, width: 2.0 },
    hitShape: { kind: 'rect', length: 3.0, width: 1.5 },
  },
  horizontalSliceThin: {
    warnShape: { kind: 'rect', length: 1.5, width: 4.5, offset: 0.6 },
    hitShape: { kind: 'rect', length: 1.25, width: 4.0, offset: 0.75 },
  },
  horizontalSliceThick: {
    warnShape: { kind: 'rect', length: 3.0, width: 4.5, offset: 0.4 },
    hitShape: { kind: 'rect', length: 2.5, width: 4.0, offset: 0.5 },
  },
  ring: {
    warnShape: { kind: 'ring', innerRadius: 1.25, outerRadius: 3.25 },
    hitShape: { kind: 'ring', innerRadius: 1.5, outerRadius: 3.0 },
  },
};

// ── animation catalog ───────────────────────────────────────────────────────

// Each animation declares:
//   axis    — the local coordinate a band travels along: 'across' (perpendicular
//             to facing), 'along' (down the facing axis), 'radius', or 'angle'
//   windup  — bands lit while winding up, as a function of windup progress 0→1
//   beats   — one entry per damage hit. `gap` is double-seconds since the
//             previous beat (beat 0 is the activation hit, gap always 0);
//             `sweep` is the band lit across that beat's active window.
//   shapes  — presets this animation is designed for, for authoring validation
//
// `blink` is the default and reproduces the legacy four-phase windup exactly,
// so a Telegraph that declares no animation behaves as it always has.
export const ANIMATIONS = {
  blink: {
    axis: 'across',
    shapes: ['basic', 'verticalSlice', 'horizontalSliceThin', 'horizontalSliceThick', 'ring'],
    windup: () => FULL,
    beats: [{ gap: 0, sweep: () => FULL }],
  },

  // Two bands close in from opposite edges and meet where the hit will land —
  // the shape tells you the place, the closing tells you the moment.
  clap: {
    axis: 'across',
    shapes: ['basic', 'horizontalSliceThin', 'horizontalSliceThick'],
    windup: (p) => {
      const w = BAND_HALF * 2;
      const lead = p * (0.5 - w / 2);
      return [[lead, lead + w], [1 - lead - w, 1 - lead]];
    },
    beats: [{ gap: 0, sweep: () => FULL }],
  },

  // Grows out of the enemy — the threat expanding into the space it will own.
  bloom: {
    axis: 'along',
    shapes: ['basic', 'verticalSlice'],
    windup: (p) => [[0, p]],
    beats: [{ gap: 0, sweep: () => FULL }],
  },

  // One clean pass across the swing.
  sweep: {
    axis: 'across',
    shapes: ['horizontalSliceThin', 'horizontalSliceThick'],
    windup: () => FULL,
    beats: [{ gap: 0, sweep: (p) => travel(p) }],
  },

  // Across, pause, back — two hits in one commitment. The pause is the tell:
  // a player who dodges the first pass and stops moving eats the return.
  doubleSweep: {
    axis: 'across',
    shapes: ['horizontalSliceThin', 'horizontalSliceThick'],
    windup: () => FULL,
    beats: [
      { gap: 0, sweep: (p) => travel(p) },
      { gap: 0.5, sweep: (p) => travel(p, true) },
    ],
  },

  // Held back near the enemy, then driven out along the facing axis.
  thrust: {
    axis: 'along',
    shapes: ['verticalSlice'],
    windup: () => [[0, 0.3]],
    beats: [{ gap: 0, sweep: (p) => travel(p) }],
  },

  // Pulls in before it goes out — the wind-up you can see gathering.
  recoil: {
    axis: 'along',
    shapes: ['verticalSlice'],
    windup: (p) => [[0, 1 - p * 0.75]],
    beats: [{ gap: 0, sweep: (p) => travel(p) }],
  },

  // Expands outward through the annulus: the danger leaves the centre.
  radiate: {
    axis: 'radius',
    shapes: ['ring'],
    windup: () => FULL,
    beats: [{ gap: 0, sweep: (p) => travel(p) }],
  },

  // Contracts inward. Pairs with the ring's inner-safe disc — the danger
  // closes on the place that is actually safe, which is the whole lesson.
  closeIn: {
    axis: 'radius',
    shapes: ['ring'],
    windup: () => FULL,
    beats: [{ gap: 0, sweep: (p) => travel(p, true) }],
  },

  // Travels around the annulus rather than through it.
  revolve: {
    axis: 'angle',
    shapes: ['ring'],
    windup: () => FULL,
    beats: [{ gap: 0, sweep: (p) => travel(p) }],
  },
};

// ── authoring resolution ────────────────────────────────────────────────────

// Expand a `telegraph` data block into the concrete fields the lifecycle
// needs. Returns null when the block declares no usable shape, so callers keep
// their legacy path.
export function resolveTelegraph(t, describe = 'telegraph') {
  if (!t) return null;

  let warnShape = t.warnShape;
  let hitShape = t.hitShape;
  if (t.shape) {
    const preset = SHAPE_PRESETS[t.shape];
    if (!preset) {
      console.error(`[Telegraph] ${describe}: unknown shape preset '${t.shape}'`);
      return null;
    }
    warnShape = t.warnShape || preset.warnShape;
    hitShape = t.hitShape || preset.hitShape;
  }
  if (!warnShape) return null;

  const animName = t.animation || 'blink';
  const animation = ANIMATIONS[animName];
  if (!animation) {
    console.error(`[Telegraph] ${describe}: unknown animation '${animName}'`);
    return null;
  }
  if (t.shape && !animation.shapes.includes(t.shape)) {
    console.error(
      `[Telegraph] ${describe}: animation '${animName}' is not designed for shape ` +
      `'${t.shape}' (expected one of ${animation.shapes.join(', ')})`
    );
  }
  if (t.pulses && t.animation) {
    console.error(
      `[Telegraph] ${describe}: both 'pulses' and 'animation' declared. The animation ` +
      `owns the rhythm — drop 'pulses' and use 'beatDamage' for per-beat damage.`
    );
  }

  return {
    warnShape,
    hitShape: hitShape || warnShape,
    animationName: animName,
    animation,
    // Beats compiled to the pulse contract CombatSystem already resolves:
    // cumulative delay from activation, with an optional per-beat multiplier.
    pulses: t.animation
      ? compilePulses(animation, t.beatDamage)
      : (t.pulses || null),
  };
}

function compilePulses(animation, beatDamage) {
  // A single-beat animation needs no pulse list at all — the activation hit
  // is the whole attack, which is the legacy path and stays on it.
  if (animation.beats.length <= 1) return null;
  let delay = 0;
  return animation.beats.map((beat, i) => {
    delay += beat.gap;
    return { delay, damageMult: beatDamage?.[i] ?? 1.0 };
  });
}

// ── per-frame masking ───────────────────────────────────────────────────────

// Which bands are lit right now. `phase` is 'windup' or 'beat'; `progress` is
// 0→1 within that phase.
export function animationBands(animation, phase, progress, beatIndex = 0) {
  if (!animation) return FULL;
  const p = Math.max(0, Math.min(1, progress));
  if (phase === 'windup') return animation.windup(p);
  const beat = animation.beats[Math.min(beatIndex, animation.beats.length - 1)];
  return beat ? beat.sweep(p) : FULL;
}

// Keep only the cells whose position along the animation's axis falls inside a
// lit band. Cells arrive from Telegraph.rasterizeToCells, so this narrows the
// shape rather than redefining it — the animation can never light a cell the
// shape does not cover.
export function maskCells(cells, bands, animation, shape, origin, facing) {
  if (bands === FULL || !animation) return cells;
  if (!bands || bands.length === 0) return [];
  const axis = animation.axis;
  return cells.filter((cell) => {
    const v = cellAxisValue(shape, axis, origin, facing, cell.x, cell.y);
    for (const [lo, hi] of bands) {
      if (v >= lo && v <= hi) return true;
    }
    return false;
  });
}

// Where a point sits along the given local axis, normalized to 0→1 across the
// shape's own extent, so one animation reads the same on any shape it is
// declared for.
export function cellAxisValue(shape, axis, origin, facing, px, py) {
  const dx = px - origin.x;
  const dy = py - origin.y;
  const cos = Math.cos(facing), sin = Math.sin(facing);

  if (axis === 'angle') {
    return (normalizeAngle(Math.atan2(dy, dx) - facing) + Math.PI) / (2 * Math.PI);
  }
  // A cone has no flat "across" extent — its width is angular, so sweeping
  // across it means sweeping through its arc.
  if (axis === 'across' && shape.kind === 'cone') {
    const half = (shape.angleDeg * Math.PI / 180) / 2;
    const a = normalizeAngle(Math.atan2(dy, dx) - facing);
    return half === 0 ? 0.5 : (a + half) / (2 * half);
  }

  let value;
  if (axis === 'radius') value = Math.hypot(dx, dy);
  else if (axis === 'along') value = dx * cos + dy * sin;
  else value = -dx * sin + dy * cos; // 'across'

  const [lo, hi] = axisRange(shape, axis);
  return hi === lo ? 0.5 : (value - lo) / (hi - lo);
}

function axisRange(shape, axis) {
  const off = (shape.offset ?? 0) * CELL;
  switch (axis) {
    case 'along':
      if (shape.kind === 'rect') return [off, off + shape.length * CELL];
      if (shape.kind === 'cone') return [0, shape.range * CELL];
      if (shape.kind === 'circle') return [off - shape.radius * CELL, off + shape.radius * CELL];
      return [-shape.outerRadius * CELL, shape.outerRadius * CELL];
    case 'radius':
      if (shape.kind === 'ring') return [shape.innerRadius * CELL, shape.outerRadius * CELL];
      if (shape.kind === 'circle') return [0, shape.radius * CELL];
      if (shape.kind === 'cone') return [0, shape.range * CELL];
      return [0, (off + shape.length * CELL)];
    default: { // 'across'
      if (shape.kind === 'rect') return [-shape.width * CELL / 2, shape.width * CELL / 2];
      if (shape.kind === 'circle') return [-shape.radius * CELL, shape.radius * CELL];
      if (shape.kind === 'ring') return [-shape.outerRadius * CELL, shape.outerRadius * CELL];
      return [-shape.range * CELL, shape.range * CELL];
    }
  }
}

function normalizeAngle(a) {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}
