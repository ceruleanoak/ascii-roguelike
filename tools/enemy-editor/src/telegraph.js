// Telegraph authoring support for the editor: option lists and authoring
// validation, read straight off the real library (src/game/TelegraphAnimation.js)
// so a new shape preset or animation appears in the form the moment it is added
// to the catalog — no hand-maintained list to fall behind.
//
// The validation here mirrors what `resolveTelegraph` reports to the console at
// runtime. The point of duplicating the checks is timing, not logic: in the
// editor a mismatch should be visible while you are choosing the shape, not
// after the enemy happens to swing. Both read the same catalogs, so a rule can
// only be stated in one place — the animation's own `shapes` list.
import { SHAPE_PRESETS, ANIMATIONS } from '../../../src/game/TelegraphAnimation.js';

// '' = no preset. Authoring an explicit warn/hit shape is the escape hatch when
// no preset fits, and absent both the enemy keeps the legacy rect windup.
export const SHAPE_OPTIONS = ['', ...Object.keys(SHAPE_PRESETS)];

// '' = declare no animation, which resolves to `blink` (the legacy four-phase
// look). Left blank so an author of an explicit `pulses` list can avoid the
// pulses/animation conflict, which only triggers on a *declared* animation.
export const ANIMATION_OPTIONS = ['', ...Object.keys(ANIMATIONS)];

// rasterizeToCells keeps a cell only when its center is inside the shape, so a
// dimension thinner than this can rasterize to nothing while still dealing
// damage (hitTest samples the AABB) — an invisible hit. Same floor the presets
// are built to clear; see the sizing note in TelegraphAnimation.js.
const RASTER_FLOOR = 1.25;

// Authoring feedback for the current def's telegraph block, as
// [{ level: 'warn' | 'info', text }]. Empty when there is no block at all.
export function telegraphNotes(def) {
  const t = def.telegraph;
  if (!t) return [];
  const notes = [];

  // Only the melee windup visual carries a Telegraph (Enemy.createWindupAttackVisual
  // is the sole attachTelegraph call site), so a shape on a ranged enemy is
  // data that will never draw.
  if (def.attackType !== 'melee') {
    notes.push({
      level: 'warn',
      text: `Telegraphs draw on melee windups only — attackType is '${def.attackType}', so this block never renders.`,
    });
  }

  const preset = t.shape ? SHAPE_PRESETS[t.shape] : null;
  if (t.shape && !preset) {
    notes.push({ level: 'warn', text: `Unknown shape preset '${t.shape}'.` });
  }

  const warnShape = nonEmpty(t.warnShape) || preset?.warnShape;
  const hitShape = nonEmpty(t.hitShape) || preset?.hitShape || warnShape;
  if (!warnShape) {
    notes.push({
      level: 'warn',
      text: 'No shape — the enemy keeps the legacy single-rect windup visual. Pick a preset, or author an explicit warn shape.',
    });
  }

  // Explicit shapes get geometry checks; presets are known-good by construction.
  for (const [label, shape] of [['Warn shape', t.warnShape], ['Hit shape', t.hitShape]]) {
    if (!nonEmpty(shape)) continue;
    for (const issue of shapeIssues(shape)) {
      notes.push({ level: 'warn', text: `${label}: ${issue}` });
    }
  }

  const pulses = nonEmpty(t.pulses);
  const animName = t.animation || 'blink';
  const anim = ANIMATIONS[animName];
  if (!anim) {
    notes.push({ level: 'warn', text: `Unknown animation '${animName}'.` });
    return notes;
  }
  if (t.shape && preset && !anim.shapes.includes(t.shape)) {
    notes.push({
      level: 'warn',
      text: `'${animName}' is not designed for shape '${t.shape}' — designed for: ${anim.shapes.join(', ')}.`,
    });
  }
  if (pulses && t.animation) {
    notes.push({
      level: 'warn',
      text: "Both 'pulses' and an animation are declared. The animation owns the rhythm — clear pulses and use beat damage instead.",
    });
  }

  // Describe whichever source actually owns the rhythm. Without a declared
  // animation a `pulses` list is authoritative and `blink` only supplies the
  // look, so summarizing the animation's single beat would misreport the attack.
  if (warnShape) {
    notes.push(pulses && !t.animation
      ? { level: 'info', text: pulseSummary(pulses, animName) }
      : { level: 'info', text: beatSummary(animName, anim, t.beatDamage) });
  }

  // beatDamage only reaches the pulse list through compiled beats, and a
  // single-beat animation compiles no list at all — the multiplier would be
  // silently dropped.
  if (nonEmpty(t.beatDamage)) {
    if (anim.beats.length <= 1) {
      notes.push({
        level: 'warn',
        text: `'${animName}' has one beat, so beat damage is ignored. Use a multi-beat animation (e.g. doubleSweep) or set base damage.`,
      });
    } else if (t.beatDamage.length !== anim.beats.length) {
      notes.push({
        level: 'warn',
        text: `Beat damage has ${t.beatDamage.length} value(s) for ${anim.beats.length} beats — missing entries default to ×1.`,
      });
    }
  }

  // The warn shape overstating the hit shape is the intended relationship, so
  // only the inverse is worth flagging: a hit reaching past its own warning.
  // Skipped when either shape is unmeasurable, where a reach of 0 would only add
  // noise on top of the real problem already reported above. A sub-floor shape
  // still measures fine, so that warning survives alongside the raster note.
  const measurable = warnShape && hitShape && isMeasurable(warnShape) && isMeasurable(hitShape);
  if (measurable && reach(hitShape) > reach(warnShape) + 0.001) {
    notes.push({
      level: 'warn',
      text: `Hit shape reaches ${reach(hitShape).toFixed(2)} cells past the warn shape's ${reach(warnShape).toFixed(2)} — damage lands outside what the player is shown.`,
    });
  }

  // Problems first, then the summary of what the data compiles to.
  return [...notes.filter(n => n.level === 'warn'), ...notes.filter(n => n.level !== 'warn')];
}

// The animation-less form: the hand-authored pulse list is the rhythm, and the
// animation named here only supplies the look.
function pulseSummary(pulses, animName) {
  const hits = pulses.map((pulse, i) => {
    const delay = pulse.delay ?? 0;
    const when = i === 0 && delay === 0
      ? 'on release'
      : `+${delay.toFixed(2)} dbl-sec (${(delay / 2).toFixed(2)}s)`;
    const mult = pulse.damageMult;
    return mult != null && mult !== 1 ? `${when} ×${mult}` : when;
  });
  const plural = pulses.length === 1 ? 'hit' : 'hits';
  return `pulses — ${pulses.length} ${plural}: ${hits.join(', ')} · drawn with ${animName}`;
}

// One line describing the rhythm the animation compiles: how many hits land,
// when, and how hard. This is the authoring payoff of declaring an animation —
// the beats ARE the pulses, so what you read here is what will connect.
function beatSummary(name, anim, beatDamage) {
  let delay = 0;
  const beats = anim.beats.map((beat, i) => {
    delay += beat.gap;
    const when = i === 0 ? 'on release' : `+${delay.toFixed(2)} dbl-sec (${(delay / 2).toFixed(2)}s)`;
    const mult = beatDamage?.[i];
    return mult != null && mult !== 1 ? `${when} ×${mult}` : when;
  });
  const plural = anim.beats.length === 1 ? 'hit' : 'hits';
  return `${name} — ${anim.beats.length} ${plural}: ${beats.join(', ')} · sweeps along ${anim.axis}`;
}

// The dimensions each shape kind must carry to be drawable (and measurable).
const SHAPE_DIMS = {
  rect: ['length', 'width'],
  cone: ['angleDeg', 'range'],
  circle: ['radius'],
  ring: ['innerRadius', 'outerRadius'],
};

function shapeIssues(shape) {
  const issues = [];
  const kind = shape.kind;
  if (!kind) return ['no `kind` — needs one of rect, cone, circle, ring.'];

  const dims = SHAPE_DIMS[kind];
  if (!dims) return [`unknown kind '${kind}' — use rect, cone, circle, or ring.`];

  for (const d of dims) {
    if (typeof shape[d] !== 'number' || Number.isNaN(shape[d])) {
      issues.push(`${kind} needs a numeric \`${d}\`.`);
    }
  }
  if (issues.length > 0) return issues;

  // Sub-floor dimensions damage without drawing — the invisible hit.
  const thin = [];
  if (kind === 'rect') {
    if (shape.length < RASTER_FLOOR) thin.push(`length ${shape.length}`);
    if (shape.width < RASTER_FLOOR) thin.push(`width ${shape.width}`);
  } else if (kind === 'circle') {
    if (shape.radius * 2 < RASTER_FLOOR) thin.push(`diameter ${shape.radius * 2}`);
  } else if (kind === 'ring') {
    const band = shape.outerRadius - shape.innerRadius;
    if (band < RASTER_FLOOR) thin.push(`ring band ${band.toFixed(2)}`);
    if (shape.outerRadius <= shape.innerRadius) {
      issues.push('outerRadius must exceed innerRadius.');
    }
  } else if (kind === 'cone') {
    if (shape.range < RASTER_FLOOR) thin.push(`range ${shape.range}`);
  }
  if (thin.length > 0) {
    issues.push(`${thin.join(', ')} below the ${RASTER_FLOOR}-cell raster floor — it will damage without drawing.`);
  }
  return issues;
}

// A known kind with all of its dimensions present — the precondition for
// `reach` returning a number that means anything.
function isMeasurable(shape) {
  const dims = SHAPE_DIMS[shape.kind];
  if (!dims) return false;
  return dims.every(d => typeof shape[d] === 'number' && !Number.isNaN(shape[d]));
}

// How far the shape reaches from the enemy's center, in cells (mirrors
// Telegraph.shapeReach — kept local so this module stays render-free).
function reach(shape) {
  switch (shape.kind) {
    case 'circle': return (shape.offset ?? 0) + shape.radius;
    case 'ring': return shape.outerRadius;
    case 'cone': return shape.range;
    case 'rect': return (shape.offset ?? 0) + shape.length + shape.width / 2;
    default: return 0;
  }
}

// A json field left blank reads back as null; an object/array with no keys is
// equally "unset" as far as authoring intent goes.
function nonEmpty(v) {
  if (v == null) return null;
  if (Array.isArray(v)) return v.length > 0 ? v : null;
  if (typeof v === 'object') return Object.keys(v).length > 0 ? v : null;
  return v;
}
