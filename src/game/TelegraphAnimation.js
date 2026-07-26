// Telegraph Animation — the choreography of a Telegraph: how the strike moves
// through the warned area, and (because the animation declares the beats) when
// damage actually lands.
//
// Two halves, and the split between them is the whole design:
//
//   the tell    — the warned area, drawn plainly and blinking in place. It says
//                 *where*, and deliberately nothing else. Every animation shows
//                 the same still shape here, because a warning the player has to
//                 decode is not a warning. It is filled, never outlined, and it
//                 ends the instant the strike begins.
//   the strike  — a stroke a few pixels wide sweeping through that area in one
//                 continuous motion. It says *now*, and it is the only thing on
//                 screen while it runs: the warning has already been read, and
//                 leaving it up buries the one moving mark that matters.
//
// The strike is also the hitbox. The Area is a danger *zone* — the ground the
// player is told to leave — and standing in it costs nothing on its own; what
// damages is the mark passing through, tested where it actually is (see
// `Telegraph.strikeHitsBox`). A `doubleSweep` therefore has to catch the player
// twice with two separate passes to land two hits, which is what the animation
// has always claimed on screen and now what it means. `blink` is the exception
// that proves the rule: it has no travelling mark, so for it the area *is* the
// strike and the whole shape damages.
//
// The strike's *path* is geometry, not glyphs. An earlier version masked the
// character grid and could only ever snap a whole cell at a time, which reads as
// a block stuttering across the shape rather than a blade passing through it.
// Nothing in this module knows about cells: it reports line segments in the
// shape's own local frame and Telegraph.js draws them in pixel space. What rides
// that path is a hairline by default, or — when the enemy declares an Attack
// Shape — a single character stretched to span it. The glyph stretches because
// the mark is the hitbox: a one-cell character sitting at the middle of a strike
// that damages end to end would be a picture of the wrong thing.
//
// The animation is the single source of truth for an attack's rhythm. A
// `doubleSweep` *means* two hits: its beats are compiled into the pulse list
// that CombatSystem resolves damage against, so what the player watches and
// what connects cannot drift apart. Author the rhythm once, in the animation.
//
// Data contract (enemy data, inside the `telegraph` block):
//
//   telegraph: {
//     area: 'box',                    // an AREA_PRESETS name — the warned region
//     size: 'small',                  // 'small' (one cell, the default) | 'big' (the AoE)
//     animation: 'doubleSweep',       // an ANIMATIONS name — declares the beats
//     attackShape: '/',               // optional glyph drawn instead of the strike stroke
//     beatDamage: [1.0, 0.5],         // optional per-beat damage multipliers
//   }
//
// The explicit form still works and is what areas expand into — author
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

// Easing is what separates two strikes that travel the same axis. A slap
// decelerates into the moment it lands; a thrust accelerates out of the enemy.
// The distinction is legible even at a 0.15s pass, and it is the only thing
// distinguishing some otherwise-identical animations — deliberately, because
// "how it moves" is the whole vocabulary once the stroke is thin.
const LINEAR = (p) => p;
const EASE_IN = (p) => p * p;
const EASE_OUT = (p) => 1 - (1 - p) * (1 - p);

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => Math.max(0, Math.min(1, v));

// ── area presets ────────────────────────────────────────────────────────────

// The Area is the ground a Telegraph warns about: a named region built over the
// rect/trapezoid/circle/ring primitives. Each Area's warn shape is deliberately
// a little larger than its hit shape — a Telegraph aids anticipation and is not
// a 1:1 damage outline (see GLOSSARY "Telegraph").
//
// The three basic Areas — `box`, `circle`, `trapezoid` — come in two Sizes.
// `small` is one cell, the original single-cell windup box, and the default: one
// cell of ground taken away is already a complete instruction, and it is what an
// enemy that simply swings at you should say. `big` is the AoE, ~2.5 cells
// across, and has to be asked for by name so that reaching for it is a decision
// rather than what happens if nobody chooses. The trapezoid widens as it leaves
// the enemy, so its far edge threatens ground its near edge does not — the Area
// to reach for when backing straight up should not be the answer.
//
// At `small` the warn and hit shapes are identical. One cell is too little
// ground to overstate: a warning larger than the cell it warns about would be
// pointing at the cell next door.
//
// The slices and the ring carry fixed dimensions instead of Sizes — their whole
// identity is a specific reach and thickness, which is what an animation sweeps
// along. The ring is the one worth reading twice: its *hit* inner radius is
// larger than its *warn* inner radius, so the safe disc is bigger than it looks.
// Dodging into the enemy is the answer, and the warning overstates the danger
// inward to make that answer feel like a discovery.
//
// These are gameplay dimensions, not drawing dimensions: shapes are filled in
// pixel space, so any size draws faithfully and nothing here is rounded up to
// suit the renderer. Tune them against reach and dodge distance alone.
export const AREA_PRESETS = {
  // One cell of ground, a cell's reach out along the swing — where the legacy
  // windup box sat, which is why `small` reads as "the same attack as always".
  box: {
    sizes: {
      small: {
        warnShape: { kind: 'rect', length: 1.0, width: 1.0, offset: 0.6 },
        hitShape: { kind: 'rect', length: 1.0, width: 1.0, offset: 0.6 },
      },
      big: {
        warnShape: { kind: 'rect', length: 2.0, width: 2.5 },
        hitShape: { kind: 'rect', length: 1.75, width: 2.0 },
      },
    },
  },
  // Same footprint as the box at each Size, with the corners taken off: it
  // threatens straight ahead and forgives the diagonals.
  circle: {
    sizes: {
      small: {
        warnShape: { kind: 'circle', radius: 0.5, offset: 1.1 },
        hitShape: { kind: 'circle', radius: 0.5, offset: 1.1 },
      },
      big: {
        warnShape: { kind: 'circle', radius: 1.25, offset: 1.0 },
        hitShape: { kind: 'circle', radius: 1.0, offset: 1.0 },
      },
    },
  },
  // Narrow at the enemy, wide where it lands. Stepping sideways close in beats
  // it; sideways at the far edge does not.
  trapezoid: {
    sizes: {
      small: {
        warnShape: { kind: 'trapezoid', length: 1.0, nearWidth: 0.5, farWidth: 1.0, offset: 0.6 },
        hitShape: { kind: 'trapezoid', length: 1.0, nearWidth: 0.5, farWidth: 1.0, offset: 0.6 },
      },
      big: {
        warnShape: { kind: 'trapezoid', length: 2.25, nearWidth: 0.75, farWidth: 3.0, offset: 0.2 },
        hitShape: { kind: 'trapezoid', length: 2.0, nearWidth: 0.6, farWidth: 2.5, offset: 0.25 },
      },
    },
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

// Sizes, smallest first. `small` is the default everywhere — an Area that says
// nothing about its size means the single cell, never the AoE.
export const SIZES = ['small', 'big'];
export const DEFAULT_SIZE = 'small';

// Does this Area come in Sizes, or are its dimensions its identity?
export function areaIsSized(name) {
  return !!AREA_PRESETS[name]?.sizes;
}

// An Area name + Size to the warn/hit pair it stands for. Fixed Areas ignore
// the Size; a sized Area given an unknown one returns null so the caller can
// report it rather than silently drawing the default.
export function resolveArea(name, size) {
  const area = AREA_PRESETS[name];
  if (!area) return null;
  if (!area.sizes) return area;
  return area.sizes[size || DEFAULT_SIZE] || null;
}

// ── animation catalog ───────────────────────────────────────────────────────

// Each animation declares:
//   axis    — the local coordinate the stroke travels along: 'across'
//             (perpendicular to facing), 'along' (down the facing axis),
//             'radius', or 'angle'
//   motion  — how the stroke occupies that axis:
//               'pass'     one line crossing the shape
//               'converge' two lines closing on the centre
//               'grow'     an outline expanding out of the enemy
//               'flash'    nothing travels; the area itself is the strike
//   ease    — the speed curve of the pass (see the easing note above)
//   reverse — run the axis backwards (inward, or right-to-left)
//   beats   — one entry per damage hit. `gap` is double-seconds since the
//             previous beat (beat 0 is the activation hit, gap always 0);
//             `reverse` flips that beat against the animation's direction.
//   areas   — Areas this animation is choreographed for, for authoring
//             validation (and the editor's animation list filters on it)
//
// `blink` is the default: no stroke at all, so a Telegraph that declares no
// animation keeps the original still-area look end to end.
export const ANIMATIONS = {
  blink: {
    axis: 'across', motion: 'flash', ease: LINEAR,
    areas: ['box', 'circle', 'trapezoid', 'verticalSlice', 'horizontalSliceThin',
            'horizontalSliceThick', 'ring'],
    beats: [{ gap: 0 }],
  },

  // Two strokes close from opposite edges and meet where the hit lands. Easing
  // in means they drift, then snap together — the moment is the meeting.
  clap: {
    axis: 'across', motion: 'converge', ease: EASE_IN,
    areas: ['box', 'circle', 'trapezoid', 'horizontalSliceThin', 'horizontalSliceThick'],
    beats: [{ gap: 0 }],
  },

  // A flat pass out along the attack direction — the lunge, seen edge-on.
  // "Vertical" is relative to the attack direction, not the screen (see the
  // naming note above).
  vertical: {
    axis: 'along', motion: 'pass', ease: LINEAR,
    areas: ['box', 'circle', 'trapezoid', 'verticalSlice'],
    beats: [{ gap: 0 }],
  },

  // The palm swings across and decelerates into contact. Same axis as `sweep`;
  // the easing is the difference, and it is what makes one read as a slap and
  // the other as a blade.
  slap: {
    axis: 'across', motion: 'pass', ease: EASE_OUT,
    areas: ['box', 'circle', 'trapezoid', 'horizontalSliceThin', 'horizontalSliceThick'],
    beats: [{ gap: 0 }],
  },

  // The outline grows out of the enemy — the threat claiming the space rather
  // than crossing it. The only animation whose stroke changes length.
  bloom: {
    axis: 'along', motion: 'grow', ease: LINEAR,
    areas: ['box', 'circle', 'trapezoid', 'verticalSlice'],
    beats: [{ gap: 0 }],
  },

  // One clean pass across the swing, even speed throughout.
  sweep: {
    axis: 'across', motion: 'pass', ease: LINEAR,
    areas: ['horizontalSliceThin', 'horizontalSliceThick'],
    beats: [{ gap: 0 }],
  },

  // Across, pause, back — two hits in one commitment. The pause is the tell:
  // a player who dodges the first pass and stops moving eats the return.
  doubleSweep: {
    axis: 'across', motion: 'pass', ease: LINEAR,
    areas: ['horizontalSliceThin', 'horizontalSliceThick'],
    beats: [
      { gap: 0 },
      { gap: 0.5, reverse: true },
    ],
  },

  // Driven out along the facing axis, accelerating — a stab, not a swing.
  thrust: {
    axis: 'along', motion: 'pass', ease: EASE_IN,
    areas: ['verticalSlice'],
    beats: [{ gap: 0 }],
  },

  // The same axis pulled the other way: the danger retreats into the enemy,
  // decelerating as it arrives.
  recoil: {
    axis: 'along', motion: 'pass', ease: EASE_OUT, reverse: true,
    areas: ['verticalSlice'],
    beats: [{ gap: 0 }],
  },

  // Expands outward through the annulus: the danger leaves the centre.
  radiate: {
    axis: 'radius', motion: 'pass', ease: LINEAR,
    areas: ['ring'],
    beats: [{ gap: 0 }],
  },

  // Contracts inward. Pairs with the ring's inner-safe disc — the danger
  // closes on the place that is actually safe, which is the whole lesson.
  closeIn: {
    axis: 'radius', motion: 'pass', ease: LINEAR, reverse: true,
    areas: ['ring'],
    beats: [{ gap: 0 }],
  },

  // Travels around the annulus rather than through it.
  revolve: {
    axis: 'angle', motion: 'pass', ease: LINEAR,
    areas: ['ring'],
    beats: [{ gap: 0 }],
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
  if (t.area) {
    if (!AREA_PRESETS[t.area]) {
      console.error(`[Telegraph] ${describe}: unknown area '${t.area}'`);
      return null;
    }
    if (t.size && !areaIsSized(t.area)) {
      console.error(
        `[Telegraph] ${describe}: area '${t.area}' carries fixed dimensions — 'size' is ignored.`
      );
    }
    const sized = resolveArea(t.area, t.size);
    if (!sized) {
      console.error(
        `[Telegraph] ${describe}: unknown size '${t.size}' for area '${t.area}' ` +
        `(expected one of ${SIZES.join(', ')})`
      );
      return null;
    }
    warnShape = t.warnShape || sized.warnShape;
    hitShape = t.hitShape || sized.hitShape;
  }
  if (!warnShape) return null;

  const animName = t.animation || 'blink';
  const animation = ANIMATIONS[animName];
  if (!animation) {
    console.error(`[Telegraph] ${describe}: unknown animation '${animName}'`);
    return null;
  }
  if (t.area && !animation.areas.includes(t.area)) {
    console.error(
      `[Telegraph] ${describe}: animation '${animName}' is not choreographed for area ` +
      `'${t.area}' (expected one of ${animation.areas.join(', ')})`
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
    // The glyph the strike rides on, when one is authored. Null keeps the
    // default hairline stroke.
    attackShape: t.attackShape || null,
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

// ── strike geometry ─────────────────────────────────────────────────────────

// Where the strike is at `progress` through a beat, in the shape's own local
// frame: `along` runs down the facing axis, `across` perpendicular to it, both
// in pixels and both continuous. The caller rotates by facing and translates to
// the owner; nothing here knows where on screen any of it ends up, which is why
// the same numbers serve the game renderer and the editor sandbox.
//
// Returns { lines, circles, arcs, markLines?, mirrorFrom? }: `lines` are
// [along0, across0, along1, across1] segments, `circles` are radii centred on
// the owner, `arcs` are { radius, from, to } stretches of a circumference
// (angles measured off facing). All three empty means nothing travels this
// frame — that is `blink`, whose strike is the area itself.
//
// The two optional fields only matter to an Attack Shape glyph (see
// `strikeMarks`), because a hairline has neither a preferred side nor anything
// to leave out:
//   markLines  — indices of the lines that carry a glyph, when not all of them
//                should. A `grow` outline is three sides but only one advancing
//                edge, and the mark belongs on that edge rather than smeared
//                one-per-side.
//   mirrorFrom — the index from which marks are the reflected half of a pair.
//                Two strokes closing on each other are one shape and its mirror;
//                drawing the same glyph twice reads as one chasing the other.
export function strikeGeometry(animation, shape, beatIndex, progress) {
  if (!animation || animation.motion === 'flash') return EMPTY_GEOMETRY;

  const beat = animation.beats[Math.min(beatIndex, animation.beats.length - 1)];
  // The animation sets a base direction and a beat may flip it — that XOR is
  // what lets `doubleSweep` reuse one pass definition for the return trip.
  let t = (animation.ease || LINEAR)(clamp01(progress));
  if (!!animation.reverse !== !!beat?.reverse) t = 1 - t;

  switch (animation.axis) {
    case 'radius': {
      const [lo, hi] = axisSpan(shape, 'radius');
      return { lines: [], circles: [lerp(lo, hi, t)], arcs: [] };
    }
    case 'angle': {
      // Around the annulus rather than across it, riding the circumference
      // through the middle of the band — the line the eye follows when a ring
      // sweeps. A radial spoke was the earlier reading and it was wrong: a spoke
      // covers the whole band at once and so has nowhere left to travel.
      const [lo, hi] = axisSpan(shape, 'radius');
      const radius = (lo + hi) / 2;
      const a = -Math.PI + t * 2 * Math.PI;
      const half = ARC_SWEEP / 2;
      return { lines: [], circles: [], arcs: [{ radius, from: a - half, to: a + half }] };
    }
    case 'along': {
      const [lo, hi] = axisSpan(shape, 'along');
      const [c0, c1] = axisSpan(shape, 'across');
      if (animation.motion === 'grow') {
        // Three sides of a box whose far edge advances: the rails follow the
        // shape's own taper (they diverge on a trapezoid, bulge on a circle,
        // stay parallel on a rect) while the leading edge does the travelling.
        const head = lerp(lo, hi, t);
        const [n0, n1] = acrossSpanAt(shape, lo, c0, c1);
        const [h0, h1] = acrossSpanAt(shape, head, c0, c1);
        return {
          lines: [[lo, n0, head, h0], [lo, n1, head, h1], [head, h0, head, h1]],
          circles: [], arcs: [],
          // The rails are where the threat has already been; the leading edge is
          // the threat. Only it carries the mark.
          markLines: [2],
        };
      }
      const a = lerp(lo, hi, t);
      const [w0, w1] = acrossSpanAt(shape, a, c0, c1);
      return { lines: [[a, w0, a, w1]], circles: [], arcs: [] };
    }
    default: { // 'across'
      const [a0, a1] = axisSpan(shape, 'along');
      // A cone has no flat across-extent — its width is angular, so crossing it
      // means swinging a spoke through its arc rather than sliding a line.
      if (shape.kind === 'cone') {
        const half = (shape.angleDeg * Math.PI / 180) / 2;
        const a = lerp(-half, half, t);
        return { lines: [[0, 0, a1 * Math.cos(a), a1 * Math.sin(a)]], circles: [], arcs: [] };
      }
      const [lo, hi] = axisSpan(shape, 'across');
      if (animation.motion === 'converge') {
        const mid = (lo + hi) / 2;
        const near = lerp(lo, mid, t), far = lerp(hi, mid, t);
        return {
          lines: [[a0, near, a1, near], [a0, far, a1, far]],
          circles: [], arcs: [],
          // The far half is the near half seen in a mirror — that is what makes
          // a pair of Attack Shapes read as jaws closing rather than as two
          // copies of one glyph sliding the same way.
          mirrorFrom: 1,
        };
      }
      const c = lerp(lo, hi, t);
      return { lines: [[a0, c, a1, c]], circles: [], arcs: [] };
    }
  }
}

const EMPTY_GEOMETRY = { lines: [], circles: [], arcs: [] };

// How much of a ring's circumference the travelling mark occupies, in radians.
// Long enough to read as a blade with a direction, short enough that most of the
// band is still empty ground the player can be standing on.
const ARC_SWEEP = 0.35;

// The strike broken into marks — one per piece of it an Attack Shape glyph can
// be laid onto, in the shape's local frame:
//
//   { along, across, angle, length, mirror }
//
// `along`/`across` is the mark's midpoint, `angle` the direction it runs
// (measured off facing, so the caller adds its own rotation), `length` how far
// it spans, and `mirror` whether it is the reflected half of a pair. A glyph
// stretched to `length` covers exactly the ground the stroke covers, which is
// the ground that damages — the whole reason marks carry a span at all.
export function strikeMarks(geo) {
  const marks = [];
  const mirrorFrom = geo.mirrorFrom ?? Infinity;
  const indices = geo.markLines ?? geo.lines.map((_, i) => i);
  for (const i of indices) {
    const [a0, c0, a1, c1] = geo.lines[i];
    marks.push({
      along: (a0 + a1) / 2, across: (c0 + c1) / 2,
      angle: Math.atan2(c1 - c0, a1 - a0),
      length: Math.hypot(a1 - a0, c1 - c0),
      mirror: i >= mirrorFrom,
    });
  }
  // An arc is short enough to read as one mark, so it takes one glyph laid along
  // its chord and turned tangent to the curve.
  for (const { radius, from, to } of geo.arcs) {
    const mid = (from + to) / 2;
    marks.push({
      along: radius * Math.cos(mid), across: radius * Math.sin(mid),
      angle: mid + Math.PI / 2,
      length: 2 * radius * Math.sin(Math.abs(to - from) / 2),
      mirror: false,
    });
  }
  // A circle damages the whole way round, so it gets marks the whole way round —
  // one glyph on the facing spoke would leave the rest of a band that hurts
  // completely unlabelled. Spaced about a character apart, laid tangentially.
  for (const r of geo.circles) {
    const count = Math.max(6, Math.round((2 * Math.PI * r) / CELL));
    const chord = 2 * r * Math.sin(Math.PI / count);
    for (let i = 0; i < count; i++) {
      const a = (i / count) * 2 * Math.PI;
      marks.push({
        along: r * Math.cos(a), across: r * Math.sin(a),
        angle: a + Math.PI / 2, length: chord, mirror: false,
      });
    }
  }
  return marks;
}

// The centre of a shape along its own facing axis — where a still strike (an
// Attack Shape on `blink`, which has no travel) plants its mark.
export function shapeCenter(shape) {
  const [lo, hi] = axisSpan(shape, 'along');
  return [(lo + hi) / 2, 0];
}

// The shape's extent along one local axis, in pixels.
export function axisSpan(shape, axis) {
  const off = (shape.offset ?? 0) * CELL;
  switch (axis) {
    case 'along':
      if (shape.kind === 'rect') return [off, off + shape.length * CELL];
      if (shape.kind === 'trapezoid') return [off, off + shape.length * CELL];
      if (shape.kind === 'cone') return [0, shape.range * CELL];
      if (shape.kind === 'circle') return [off - shape.radius * CELL, off + shape.radius * CELL];
      return [-shape.outerRadius * CELL, shape.outerRadius * CELL];
    case 'radius':
      if (shape.kind === 'ring') return [shape.innerRadius * CELL, shape.outerRadius * CELL];
      if (shape.kind === 'circle') return [0, shape.radius * CELL];
      if (shape.kind === 'cone') return [0, shape.range * CELL];
      if (shape.kind === 'trapezoid') return [0, off + shape.length * CELL];
      return [0, off + shape.length * CELL];
    default: { // 'across'
      if (shape.kind === 'rect') return [-shape.width * CELL / 2, shape.width * CELL / 2];
      // The widest the trapezoid ever gets — its far edge. Anything travelling
      // between the two ends narrows to the local width via acrossSpanAt.
      if (shape.kind === 'trapezoid') {
        const half = Math.max(shape.nearWidth, shape.farWidth) * CELL / 2;
        return [-half, half];
      }
      if (shape.kind === 'circle') return [-shape.radius * CELL, shape.radius * CELL];
      if (shape.kind === 'ring') return [-shape.outerRadius * CELL, shape.outerRadius * CELL];
      return [-shape.range * CELL, shape.range * CELL];
    }
  }
}

// Half the shape's width at one point down its facing axis, in pixels, or null
// for the kinds with no flat across-extent (ring, cone). A trapezoid widens
// linearly away from the enemy and a circle narrows toward its ends; a rect is
// the same width the whole way out.
export function halfWidthAt(shape, along) {
  switch (shape.kind) {
    case 'rect':
      return shape.width * CELL / 2;
    case 'trapezoid': {
      const start = (shape.offset ?? 0) * CELL;
      const t = clamp01((along - start) / (shape.length * CELL));
      return lerp(shape.nearWidth, shape.farWidth, t) * CELL / 2;
    }
    case 'circle': {
      const r = shape.radius * CELL;
      const d = along - (shape.offset ?? 0) * CELL;
      return Math.sqrt(Math.max(0, r * r - d * d));
    }
    default:
      return null;
  }
}

// The chord the shape spans at one point down its facing axis — a passthrough of
// the caller's full extent for the kinds that have no local width.
function acrossSpanAt(shape, along, c0, c1) {
  const half = halfWidthAt(shape, along);
  return half == null ? [c0, c1] : [-half, half];
}
