// Telegraph authoring support for the editor: option lists and authoring
// validation, read straight off the real library (src/game/TelegraphAnimation.js)
// so a new Area or animation appears in the form the moment it is added to the
// catalog — no hand-maintained list to fall behind.
//
// The validation here mirrors what `resolveTelegraph` reports to the console at
// runtime. The point of duplicating the checks is timing, not logic: in the
// editor a mismatch should be visible while you are choosing the Area, not
// after the enemy happens to swing. Both read the same catalogs, so a rule can
// only be stated in one place — the animation's own `areas` list.
import {
  AREA_PRESETS, ANIMATIONS, SIZES, DEFAULT_SIZE, areaIsSized, resolveArea,
  ATTACK_SHAPE_TURNS,
} from '../../../src/game/TelegraphAnimation.js';

// '' = no Area. Authoring an explicit warn/hit shape is the escape hatch when
// no Area fits, and absent both the enemy keeps the legacy rect windup.
export const AREA_OPTIONS = ['', ...Object.keys(AREA_PRESETS)];

// '' = take the default Size, which is `small`. Only the sized Areas (box,
// circle, trapezoid) read this at all; the slices and the ring carry fixed
// dimensions, and `telegraphNotes` says so rather than the field vanishing.
export const SIZE_OPTIONS = ['', ...SIZES];

// '' = declare no animation, which resolves to `blink` (the legacy four-phase
// look). Left blank so an author of an explicit `pulses` list can avoid the
// pulses/animation conflict, which only triggers on a *declared* animation.
export const ANIMATION_OPTIONS = ['', ...Object.keys(ANIMATIONS)];

// '' = no turn, which is the same picture as 0 but leaves the key out of the
// emitted data. Only the quarter-turns are offered: the mark already carries an
// angle of its own, and a free-form second angle would let an author aim the
// glyph away from the stroke it is drawn on.
export const TURN_OPTIONS = ['', ...ATTACK_SHAPE_TURNS.filter(deg => deg !== 0)];

// Each animation declares the Areas it was choreographed for, so that list is
// the valid-pairings map and the dropdown filters on it directly — an author
// picks an Area and then sees only motions that read correctly on it, instead of
// picking a bad pair and being told afterward.
//
// One deliberate escape from the filter: an explicit warn/hit shape has no Area
// to pair against, so every animation stays offered. The current selection is
// also listed even when it does not fit, so the dropdown always shows what the
// data actually says — but `reconcileAnimation` clears that case the moment the
// Area changes, so it can only be reached by hand-authored data.
export function animationOptionsFor(def) {
  const t = def.telegraph;
  const area = t?.area;
  if (!area || !AREA_PRESETS[area]) return ANIMATION_OPTIONS;

  const compatible = Object.keys(ANIMATIONS).filter(
    (name) => ANIMATIONS[name].areas.includes(area) || name === t.animation);
  return ['', ...compatible];
}

// Switching Area used to leave the animation where it was, stranding it on a
// motion the new Area was never choreographed for: box + `slap` switched to
// `ring` kept `slap`, and a straight pass across a ring draws a line over the
// whole area instead of anything ring-shaped. The pairing rule already existed
// — the dropdown filters on it — but nothing applied it to the value already
// held, so the invalid pair survived every render.
//
// The replacement is the first motion the new Area supports rather than a
// mapping from the old one. Any such mapping would be a guess about intent, and
// the correct motion is one dropdown away and now visible in it.
//
// Returns true when it changed something, so the caller knows to re-render.
export function reconcileAnimation(def) {
  const t = def.telegraph;
  if (!t?.area || !AREA_PRESETS[t.area]) return false;
  const anim = ANIMATIONS[t.animation];
  if (!anim || anim.areas.includes(t.area)) return false;
  t.animation = Object.keys(ANIMATIONS).find((name) => ANIMATIONS[name].areas.includes(t.area)) || '';
  return true;
}

// Telegraphs are filled in pixel space, so there is no longer a raster floor
// where a shape damages without drawing at all — any size draws faithfully.
// What survives is legibility: the strike stroke is 3px wide, so an area much
// thinner than this (0.25 cell = 4px) reads as a line rather than as ground the
// player is meant to leave.
const LEGIBILITY_FLOOR = 0.25;

// Authoring feedback for the current def's telegraph block, as
// [{ level: 'warn' | 'info', text }]. Empty when there is no block at all.
export function telegraphNotes(def) {
  const t = def.telegraph;
  if (!t) return [];
  const notes = [];

  // Only the melee windup visual carries a Telegraph (Enemy.createWindupAttackVisual
  // is the sole attachTelegraph call site), so an Area on a ranged enemy is
  // data that will never draw.
  if (def.attackType !== 'melee') {
    notes.push({
      level: 'warn',
      text: `Telegraphs draw on melee windups only — attackType is '${def.attackType}', so this block never renders.`,
    });
  }

  const known = t.area ? !!AREA_PRESETS[t.area] : false;
  if (t.area && !known) {
    notes.push({ level: 'warn', text: `Unknown area '${t.area}'.` });
  }
  // An Area with fixed dimensions (the slices, the ring) ignores Size: its reach
  // and thickness are its identity, and an animation sweeps along them.
  if (known && t.size && !areaIsSized(t.area)) {
    notes.push({
      level: 'warn',
      text: `Area '${t.area}' carries fixed dimensions — Size is ignored. Clear it, or switch to box / circle / trapezoid.`,
    });
  }
  const sized = known ? resolveArea(t.area, t.size) : null;
  if (known && !sized) {
    notes.push({
      level: 'warn',
      text: `Unknown size '${t.size}' for area '${t.area}' — expected one of ${SIZES.join(', ')}.`,
    });
  }
  if (sized && areaIsSized(t.area) && !t.size) {
    notes.push({
      level: 'info',
      text: `Size defaults to '${DEFAULT_SIZE}' — one cell of ground. 'big' is the AoE and has to be asked for.`,
    });
  }

  const warnShape = nonEmpty(t.warnShape) || sized?.warnShape;
  const hitShape = nonEmpty(t.hitShape) || sized?.hitShape || warnShape;
  if (!warnShape) {
    notes.push({
      level: 'warn',
      text: 'No shape — the enemy keeps the legacy single-rect windup visual. Pick an Area, or author an explicit warn shape.',
    });
  }

  // The Attack Shape is one character carried by the strike. More than one is
  // the mistake worth catching: fillText draws all of it and the extra glyphs
  // ride along as a word, which is not what "attack shape" means anywhere.
  if (t.attackShape != null && t.attackShape !== '' && [...t.attackShape].length !== 1) {
    notes.push({
      level: 'warn',
      text: `Attack shape must be exactly one character — '${t.attackShape}' is ${[...t.attackShape].length}.`,
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
  if (known && !anim.areas.includes(t.area)) {
    notes.push({
      level: 'warn',
      text: `'${animName}' is not choreographed for area '${t.area}' — designed for: ${anim.areas.join(', ')}.`,
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
      : { level: 'info', text: beatSummary(animName, anim, t.beatDamage, t.attackShape) });
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
  // still measures fine, so that warning survives alongside the legibility note.
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
function beatSummary(name, anim, beatDamage, attackShape) {
  let delay = 0;
  const beats = anim.beats.map((beat, i) => {
    delay += beat.gap;
    const when = i === 0 ? 'on release' : `+${delay.toFixed(2)} dbl-sec (${(delay / 2).toFixed(2)}s)`;
    const mult = beatDamage?.[i];
    return mult != null && mult !== 1 ? `${when} ×${mult}` : when;
  });
  const plural = anim.beats.length === 1 ? 'hit' : 'hits';
  // `flash` has no travelling stroke, so naming an axis for it would describe
  // motion that never happens. With an Attack Shape it has somewhere to put the
  // glyph even so — the centre of the area — and that is worth saying, because
  // otherwise an author pairing the two would expect nothing to draw.
  const still = anim.motion === 'flash';
  const move = still
    ? (attackShape ? `'${attackShape}' plants at the centre of the area` : 'the area flashes in place')
    : `${anim.motion} along ${anim.axis}${attackShape ? `, carrying '${attackShape}'` : ''}`;
  // Which shape damages is the thing an author most needs stated, because the
  // two answers look identical in the data. A travelling strike hits only where
  // its mark is, so the hit shape describes the ground the mark crosses rather
  // than a region that damages by containment; `blink` is the one that damages
  // everywhere inside its shape at once.
  const bites = still
    ? 'the whole hit shape damages on release'
    : `only the ${attackShape ? 'glyph' : 'stroke'} damages — the hit shape is the ground it crosses`;
  return `${name} — ${anim.beats.length} ${plural}: ${beats.join(', ')} · ${move} · ${bites}`;
}

// The dimensions each shape kind must carry to be drawable (and measurable).
const SHAPE_DIMS = {
  rect: ['length', 'width'],
  trapezoid: ['length', 'nearWidth', 'farWidth'],
  cone: ['angleDeg', 'range'],
  circle: ['radius'],
  ring: ['innerRadius', 'outerRadius'],
};

const KIND_LIST = Object.keys(SHAPE_DIMS).join(', ');

function shapeIssues(shape) {
  const issues = [];
  const kind = shape.kind;
  if (!kind) return [`no \`kind\` — needs one of ${KIND_LIST}.`];

  const dims = SHAPE_DIMS[kind];
  if (!dims) return [`unknown kind '${kind}' — use one of ${KIND_LIST}.`];

  for (const d of dims) {
    if (typeof shape[d] !== 'number' || Number.isNaN(shape[d])) {
      issues.push(`${kind} needs a numeric \`${d}\`.`);
    }
  }
  if (issues.length > 0) return issues;

  // Dimensions too thin to read as an area rather than a line.
  const thin = [];
  if (kind === 'rect') {
    if (shape.length < LEGIBILITY_FLOOR) thin.push(`length ${shape.length}`);
    if (shape.width < LEGIBILITY_FLOOR) thin.push(`width ${shape.width}`);
  } else if (kind === 'trapezoid') {
    if (shape.length < LEGIBILITY_FLOOR) thin.push(`length ${shape.length}`);
    // Only the widest end has to clear the floor — a trapezoid that starts as a
    // point and opens up is the intended shape, not a mistake.
    if (Math.max(shape.nearWidth, shape.farWidth) < LEGIBILITY_FLOOR) {
      thin.push(`widest end ${Math.max(shape.nearWidth, shape.farWidth)}`);
    }
  } else if (kind === 'circle') {
    if (shape.radius * 2 < LEGIBILITY_FLOOR) thin.push(`diameter ${shape.radius * 2}`);
  } else if (kind === 'ring') {
    const band = shape.outerRadius - shape.innerRadius;
    if (band < LEGIBILITY_FLOOR) thin.push(`ring band ${band.toFixed(2)}`);
    if (shape.outerRadius <= shape.innerRadius) {
      issues.push('outerRadius must exceed innerRadius.');
    }
  } else if (kind === 'cone') {
    if (shape.range < LEGIBILITY_FLOOR) thin.push(`range ${shape.range}`);
  }
  if (thin.length > 0) {
    issues.push(`${thin.join(', ')} below the ${LEGIBILITY_FLOOR}-cell legibility floor — it will draw as a line, not an area.`);
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
    // The far edge is the widest, so it is the corner that reaches furthest.
    case 'trapezoid': return (shape.offset ?? 0) + shape.length + shape.farWidth / 2;
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
