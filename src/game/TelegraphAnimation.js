// Telegraph Animation — the choreography of a Telegraph: how the strike moves
// through the warned area, and (because the animation declares the beats) when
// damage actually lands.
//
// Two halves, and the split between them is the whole design:
//
//   the tell    — the warned area, drawn plainly and blinking in place. It says
//                 *where*, and deliberately nothing else. Every animation shows
//                 the same still shape here, because a warning the player has to
//                 decode is not a warning.
//   the strike  — a stroke a few pixels wide sweeping through that area in one
//                 continuous motion. It says *now*, and it is the only part of a
//                 Telegraph that moves.
//
// The strike is geometry, not glyphs. An earlier version masked the character
// grid and could only ever snap a whole cell at a time, which reads as a block
// stuttering across the shape rather than a blade passing through it. Nothing
// in this module knows about cells: it reports line segments in the shape's own
// local frame and Telegraph.js draws them in pixel space.
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

// ── shape presets ───────────────────────────────────────────────────────────

// Named shapes over the existing rect/ring primitives. Each preset's warn
// shape is deliberately a little larger than its hit shape — a Telegraph aids
// anticipation and is not a 1:1 damage outline (see GLOSSARY "Telegraph").
//
// The ring is the exception worth reading twice: its *hit* inner radius is
// larger than its *warn* inner radius, so the safe disc is bigger than it
// looks. Dodging into the enemy is the answer, and the warning overstates the
// danger inward to make that answer feel like a discovery.
// These are gameplay dimensions, not drawing dimensions: shapes are filled in
// pixel space, so any size draws faithfully and nothing here is rounded up to
// suit the renderer. Tune them against reach and dodge distance alone.
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
//   shapes  — presets this animation is designed for, for authoring validation
//
// `blink` is the default: no stroke at all, so a Telegraph that declares no
// animation keeps the original still-area look end to end.
export const ANIMATIONS = {
  blink: {
    axis: 'across', motion: 'flash', ease: LINEAR,
    shapes: ['basic', 'verticalSlice', 'horizontalSliceThin', 'horizontalSliceThick', 'ring'],
    beats: [{ gap: 0 }],
  },

  // Two strokes close from opposite edges and meet where the hit lands. Easing
  // in means they drift, then snap together — the moment is the meeting.
  clap: {
    axis: 'across', motion: 'converge', ease: EASE_IN,
    shapes: ['basic', 'horizontalSliceThin', 'horizontalSliceThick'],
    beats: [{ gap: 0 }],
  },

  // A flat pass out along the attack direction — the lunge, seen edge-on.
  // "Vertical" is relative to the attack direction, not the screen (see the
  // naming note above).
  vertical: {
    axis: 'along', motion: 'pass', ease: LINEAR,
    shapes: ['basic', 'verticalSlice'],
    beats: [{ gap: 0 }],
  },

  // The palm swings across and decelerates into contact. Same axis as `sweep`;
  // the easing is the difference, and it is what makes one read as a slap and
  // the other as a blade.
  slap: {
    axis: 'across', motion: 'pass', ease: EASE_OUT,
    shapes: ['basic', 'horizontalSliceThin', 'horizontalSliceThick'],
    beats: [{ gap: 0 }],
  },

  // The outline grows out of the enemy — the threat claiming the space rather
  // than crossing it. The only animation whose stroke changes length.
  bloom: {
    axis: 'along', motion: 'grow', ease: LINEAR,
    shapes: ['basic', 'verticalSlice'],
    beats: [{ gap: 0 }],
  },

  // One clean pass across the swing, even speed throughout.
  sweep: {
    axis: 'across', motion: 'pass', ease: LINEAR,
    shapes: ['horizontalSliceThin', 'horizontalSliceThick'],
    beats: [{ gap: 0 }],
  },

  // Across, pause, back — two hits in one commitment. The pause is the tell:
  // a player who dodges the first pass and stops moving eats the return.
  doubleSweep: {
    axis: 'across', motion: 'pass', ease: LINEAR,
    shapes: ['horizontalSliceThin', 'horizontalSliceThick'],
    beats: [
      { gap: 0 },
      { gap: 0.5, reverse: true },
    ],
  },

  // Driven out along the facing axis, accelerating — a stab, not a swing.
  thrust: {
    axis: 'along', motion: 'pass', ease: EASE_IN,
    shapes: ['verticalSlice'],
    beats: [{ gap: 0 }],
  },

  // The same axis pulled the other way: the danger retreats into the enemy,
  // decelerating as it arrives.
  recoil: {
    axis: 'along', motion: 'pass', ease: EASE_OUT, reverse: true,
    shapes: ['verticalSlice'],
    beats: [{ gap: 0 }],
  },

  // Expands outward through the annulus: the danger leaves the centre.
  radiate: {
    axis: 'radius', motion: 'pass', ease: LINEAR,
    shapes: ['ring'],
    beats: [{ gap: 0 }],
  },

  // Contracts inward. Pairs with the ring's inner-safe disc — the danger
  // closes on the place that is actually safe, which is the whole lesson.
  closeIn: {
    axis: 'radius', motion: 'pass', ease: LINEAR, reverse: true,
    shapes: ['ring'],
    beats: [{ gap: 0 }],
  },

  // Travels around the annulus rather than through it.
  revolve: {
    axis: 'angle', motion: 'pass', ease: LINEAR,
    shapes: ['ring'],
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

// ── strike geometry ─────────────────────────────────────────────────────────

// Where the strike is at `progress` through a beat, in the shape's own local
// frame: `along` runs down the facing axis, `across` perpendicular to it, both
// in pixels and both continuous. The caller rotates by facing and translates to
// the owner; nothing here knows where on screen any of it ends up, which is why
// the same numbers serve the game renderer and the editor sandbox.
//
// Returns { lines, circles }: `lines` are [along0, across0, along1, across1]
// segments, `circles` are radii centred on the owner. Both empty means nothing
// travels this frame — that is `blink`, whose strike is the area itself.
export function strikeGeometry(animation, shape, beatIndex, progress) {
  if (!animation || animation.motion === 'flash') return { lines: [], circles: [] };

  const beat = animation.beats[Math.min(beatIndex, animation.beats.length - 1)];
  // The animation sets a base direction and a beat may flip it — that XOR is
  // what lets `doubleSweep` reuse one pass definition for the return trip.
  let t = (animation.ease || LINEAR)(clamp01(progress));
  if (!!animation.reverse !== !!beat?.reverse) t = 1 - t;

  switch (animation.axis) {
    case 'radius': {
      const [lo, hi] = axisSpan(shape, 'radius');
      return { lines: [], circles: [lerp(lo, hi, t)] };
    }
    case 'angle': {
      // A radial spoke swinging around the annulus, drawn from its inner edge
      // to its outer one.
      const [lo, hi] = axisSpan(shape, 'radius');
      const a = -Math.PI + t * 2 * Math.PI;
      const cos = Math.cos(a), sin = Math.sin(a);
      return { lines: [[lo * cos, lo * sin, hi * cos, hi * sin]], circles: [] };
    }
    case 'along': {
      const [lo, hi] = axisSpan(shape, 'along');
      const [c0, c1] = axisSpan(shape, 'across');
      if (animation.motion === 'grow') {
        // Three sides of a box whose far edge advances: the two rails stay put
        // and lengthen while the leading edge does the travelling.
        const head = lerp(lo, hi, t);
        return {
          lines: [[lo, c0, head, c0], [lo, c1, head, c1], [head, c0, head, c1]],
          circles: [],
        };
      }
      const a = lerp(lo, hi, t);
      const [w0, w1] = acrossSpanAt(shape, a, c0, c1);
      return { lines: [[a, w0, a, w1]], circles: [] };
    }
    default: { // 'across'
      const [a0, a1] = axisSpan(shape, 'along');
      // A cone has no flat across-extent — its width is angular, so crossing it
      // means swinging a spoke through its arc rather than sliding a line.
      if (shape.kind === 'cone') {
        const half = (shape.angleDeg * Math.PI / 180) / 2;
        const a = lerp(-half, half, t);
        return { lines: [[0, 0, a1 * Math.cos(a), a1 * Math.sin(a)]], circles: [] };
      }
      const [lo, hi] = axisSpan(shape, 'across');
      if (animation.motion === 'converge') {
        const mid = (lo + hi) / 2;
        const near = lerp(lo, mid, t), far = lerp(hi, mid, t);
        return { lines: [[a0, near, a1, near], [a0, far, a1, far]], circles: [] };
      }
      const c = lerp(lo, hi, t);
      return { lines: [[a0, c, a1, c]], circles: [] };
    }
  }
}

// The shape's extent along one local axis, in pixels.
export function axisSpan(shape, axis) {
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
      return [0, off + shape.length * CELL];
    default: { // 'across'
      if (shape.kind === 'rect') return [-shape.width * CELL / 2, shape.width * CELL / 2];
      if (shape.kind === 'circle') return [-shape.radius * CELL, shape.radius * CELL];
      if (shape.kind === 'ring') return [-shape.outerRadius * CELL, shape.outerRadius * CELL];
      return [-shape.range * CELL, shape.range * CELL];
    }
  }
}

// How wide the shape is at one point down its facing axis. Only a circle
// actually narrows toward its ends; everything else the presets use is a
// constant width, so this is the chord and a passthrough.
function acrossSpanAt(shape, along, c0, c1) {
  if (shape.kind !== 'circle') return [c0, c1];
  const r = shape.radius * CELL;
  const d = along - (shape.offset ?? 0) * CELL;
  const half = Math.sqrt(Math.max(0, r * r - d * d));
  return [-half, half];
}
