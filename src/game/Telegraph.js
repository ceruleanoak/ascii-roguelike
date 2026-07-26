// Telegraph — the projected warning shape of an incoming enemy attack, as
// distinct from the shape that actually deals damage (see GLOSSARY.md).
//
// This module owns the enemy melee windup lifecycle end-to-end so that every
// consumer — CombatSystem (hit resolution), ExploreRenderer (surface/PiP
// drawing), and the enemy-editor sandbox — runs the exact same code. The
// sandbox previously hand-mirrored CombatSystem's windup state machine and
// silently diverged; importing from here is what keeps the editor honest.
//
// Data contract (enemy data, all distances in cells, all times in
// double-seconds like every other enemy timer):
//
//   telegraph: {
//     warnShape: { kind: 'cone', angleDeg: 90, range: 3 },   // what blinks
//     hitShape:  { kind: 'cone', angleDeg: 60, range: 3 },   // what damages (defaults to warnShape)
//     pulses: [                                              // optional multi-hit sequence
//       { delay: 0,   damageMult: 1.0 },                     // pulse 0 = the activation hit
//       { delay: 1.5, damageMult: 0.5 },
//     ],
//   }
//
// Preferred authoring form — a named Area at a Size, plus a Telegraph
// Animation, which declares the beats and therefore compiles its own pulses (see
// TelegraphAnimation.js; that module is the reason a `doubleSweep` cannot show
// two passes and land one hit):
//
//   telegraph: {
//     area: 'trapezoid',
//     size: 'big',
//     animation: 'doubleSweep',
//     attackShape: '/',      // optional: the strike rides this glyph, not a stroke
//     attackShapeTurn: 90,   // optional quarter-turn of that glyph (0|90|180|270)
//     attackShapeCount: 8,   // optional: how many copies of that glyph the strike carries
//     beatDamage: [1.0, 0.5],
//   }
//
// Shape kinds (anchored at the attack owner's center, oriented by `facing`
// radians locked at windup start — the aim snapshot, matching
// markedTargetPosition semantics):
//   rect      { length, width, offset? }  — extends `length` cells along facing,
//                                           `width` cells across it, starting
//                                           `offset` cells out (default 0)
//   trapezoid { length, nearWidth, farWidth, offset? }
//                                         — a rect that widens away from the
//                                           owner: `nearWidth` at `offset`,
//                                           `farWidth` at full extent
//   cone      { angleDeg, range }         — apex at owner, symmetric about facing
//   circle    { radius, offset? }         — centered `offset` cells along facing
//   ring      { innerRadius, outerRadius }— centered on owner; the inner disc is
//                                           the safe zone (dodge *into* the enemy)
//
// Absent `telegraph` data, enemies keep the legacy single-rect windup visual,
// byte-identical to pre-Telegraph behavior.
//
// The warning may be wider than the damage shape on purpose: a Telegraph aids
// anticipation, it is not a 1:1 damage outline.
//
// What damages depends on whether the animation travels:
//
//   travelling  — the strike itself is the hitbox, tested where the mark
//                 actually is on each frame of its pass (`strikeHitsBox`). The
//                 hit shape is the ground the mark crosses, not a region that
//                 damages by containment: standing inside a `doubleSweep` costs
//                 nothing until a pass reaches you, and eating both hits means
//                 being caught by both passes. Each beat still lands at most
//                 once, so the pass is an opportunity window, not a damage tick.
//   `blink`     — nothing travels, so the area *is* the strike and the whole hit
//                 shape damages on its one test frame (the legacy contract).
//   shapeless   — the caller's legacy rect check, unchanged.

import { GRID } from './GameConfig.js';
import {
  resolveTelegraph, strikeGeometry, strikeMarks, spreadMarks, shapeCenter, halfWidthAt,
} from './TelegraphAnimation.js';

const CELL = GRID.CELL_SIZE;

// How thick the strike's mark is, in pixels, measured perpendicular to its own
// path — the half-width, so a hairline spans twice this. Damage and drawing read
// the same numbers on purpose: the player dodges the mark they can see, so there
// is exactly one set of dimensions for what it is.
const STRIKE_WIDTH = 3;   // px. The whole point: a few pixels across, not a cell
const STRIKE_HALF = STRIKE_WIDTH / 2;

// An Attack Shape is a character, so its mark is about a character thick. Short
// of a full cell because ink never fills the em box — a glyph whose band matched
// the font size would hit on whitespace above and below the mark.
const GLYPH_HALF = CELL * 0.35;

// Every timer in this module — and every `duration`/`flashTimer` on an entry in
// the enemy melee attack list — runs on the enemy double-second clock: callers
// step it with `deltaTime * PHYSICS.ENEMY_TIMER_RATE`, matching Enemy.update().
// A value here is therefore half as many real seconds. Anything entering that
// list from a real-second source (player-weapon attacks routed through
// Enemy.convertToEnemyAttack) is converted at the boundary, not here.
//
// Duration of the visible "live" hit flash — the legacy active-attack window.
// 0.30 dbl-sec = the same 0.15s real this has always been.
const ACTIVE_DURATION = 0.30;
const FLASH_DURATION = 0.20;

// ── geometry ────────────────────────────────────────────────────────────────

export function entityCenter(entity) {
  return {
    x: entity.position.x + (entity.width ?? CELL) / 2,
    y: entity.position.y + (entity.height ?? CELL) / 2,
  };
}

// Is the point inside the shape anchored at origin, oriented by facing?
export function pointInShape(shape, origin, facing, px, py) {
  const dx = px - origin.x;
  const dy = py - origin.y;
  switch (shape.kind) {
    case 'circle': {
      const off = (shape.offset ?? 0) * CELL;
      const cx = origin.x + Math.cos(facing) * off;
      const cy = origin.y + Math.sin(facing) * off;
      return Math.hypot(px - cx, py - cy) <= shape.radius * CELL;
    }
    case 'ring': {
      const d = Math.hypot(dx, dy);
      return d >= shape.innerRadius * CELL && d <= shape.outerRadius * CELL;
    }
    case 'cone': {
      const d = Math.hypot(dx, dy);
      if (d > shape.range * CELL) return false;
      if (d === 0) return true;
      const half = (shape.angleDeg * Math.PI / 180) / 2;
      let delta = Math.atan2(dy, dx) - facing;
      while (delta > Math.PI) delta -= 2 * Math.PI;
      while (delta < -Math.PI) delta += 2 * Math.PI;
      return Math.abs(delta) <= half;
    }
    case 'rect': {
      // Rotate the point into the facing frame: `along` runs down the facing
      // axis, `across` is perpendicular to it.
      const cos = Math.cos(facing), sin = Math.sin(facing);
      const along = dx * cos + dy * sin;
      const across = -dx * sin + dy * cos;
      const start = (shape.offset ?? 0) * CELL;
      return along >= start && along <= start + shape.length * CELL &&
             Math.abs(across) <= (shape.width * CELL) / 2;
    }
    case 'trapezoid': {
      // Same frame as the rect, but the width is a function of how far out the
      // point is — halfWidthAt owns that taper so hit testing and the strike's
      // own rails cannot disagree about where the edges are.
      const cos = Math.cos(facing), sin = Math.sin(facing);
      const along = dx * cos + dy * sin;
      const across = -dx * sin + dy * cos;
      const start = (shape.offset ?? 0) * CELL;
      if (along < start || along > start + shape.length * CELL) return false;
      return Math.abs(across) <= halfWidthAt(shape, along);
    }
    default:
      return false;
  }
}

// AABB-vs-shape test: sample the box at its corners, edge midpoints, and
// center. At cell scale (boxes ≈ one cell) this is exact enough that no
// analytic per-shape overlap math is warranted.
export function hitTest(shape, origin, facing, box) {
  const xs = [box.x, box.x + box.width / 2, box.x + box.width];
  const ys = [box.y, box.y + box.height / 2, box.y + box.height];
  for (const px of xs) {
    for (const py of ys) {
      if (pointInShape(shape, origin, facing, px, py)) return true;
    }
  }
  return false;
}

// ── strike hit geometry ─────────────────────────────────────────────────────

// Does this attack resolve damage against its travelling mark rather than its
// whole hit shape? Everything that moves does. `blink` does not — it has no mark
// to dodge inside the area, so the area has to carry the hit itself.
export function isSweptStrike(attack) {
  return !!attack.animation && attack.animation.motion !== 'flash';
}

// Half the mark's thickness, perpendicular to its path.
export function strikeHalfThickness(attack) {
  return attack.attackShape ? GLYPH_HALF : STRIKE_HALF;
}

// How far through a pass the strike may advance between two samples. A mark 3px
// wide crossing a 4-cell shape in one active window moves further between two
// frames than it is thick, so testing only where it landed would let it tunnel
// clean through the player. Sub-sampling the slice of travel that happened this
// frame is what makes a thin hitbox honest at any framerate.
const SWEEP_STEP = 0.04;        // progress per sample — ~25 samples per pass
const SWEEP_MAX_STEPS = 32;     // ceiling, so a stalled frame can't run away

// Arc segments are tessellated at this angular step for hit testing; ARC_SWEEP
// is 0.35 rad, so a revolve's mark resolves to three chords.
const ARC_STEP = 0.12;

// Does the strike touch the box anywhere between two points in its pass? The box
// is padded by the mark's half-thickness so the mark itself can be tested as a
// zero-width path — the standard trick, and it keeps every primitive below a
// plain segment/curve test with no thickness of its own to reason about.
export function strikeHitsBox(attack, box, from, to) {
  const origin = attack.owner ? entityCenter(attack.owner) : attack.position;
  const half = strikeHalfThickness(attack);
  const padded = {
    x: box.x - half, y: box.y - half,
    width: box.width + half * 2, height: box.height + half * 2,
  };
  const steps = Math.min(SWEEP_MAX_STEPS,
    Math.max(1, Math.ceil(Math.abs(to - from) / SWEEP_STEP)));
  for (let i = 0; i <= steps; i++) {
    const p = from + (to - from) * (i / steps);
    const geo = strikeGeometry(attack.animation, attack.hitShape, attack.beatIndex ?? 0, p, attack.attackShapeCount);
    if (geometryHitsRect(geo, origin, attack.facing, padded)) return true;
  }
  return false;
}

// One frozen frame of strike geometry against an axis-aligned rect, in world
// space. Mirrors traceStrike's transform exactly — the same numbers that get
// stroked are the ones tested.
function geometryHitsRect(geo, origin, facing, rect) {
  const cos = Math.cos(facing), sin = Math.sin(facing);
  const wx = (a, c) => origin.x + a * cos - c * sin;
  const wy = (a, c) => origin.y + a * sin + c * cos;

  for (const [a0, c0, a1, c1] of geo.lines) {
    if (segmentHitsRect(wx(a0, c0), wy(a0, c0), wx(a1, c1), wy(a1, c1), rect)) return true;
  }
  for (const r of geo.circles) {
    if (circleEdgeHitsRect(origin.x, origin.y, r, rect)) return true;
  }
  for (const { radius, from, to } of geo.arcs) {
    const steps = Math.max(1, Math.ceil(Math.abs(to - from) / ARC_STEP));
    for (let i = 0; i < steps; i++) {
      const t0 = facing + from + (to - from) * (i / steps);
      const t1 = facing + from + (to - from) * ((i + 1) / steps);
      if (segmentHitsRect(
        origin.x + radius * Math.cos(t0), origin.y + radius * Math.sin(t0),
        origin.x + radius * Math.cos(t1), origin.y + radius * Math.sin(t1),
        rect)) return true;
    }
  }
  return false;
}

// Liang–Barsky: clip the segment against the rect's four slabs and see whether
// any of it survives. Exact, branch-cheap, and no sampling to fall between.
function segmentHitsRect(x0, y0, x1, y1, rect) {
  const dx = x1 - x0, dy = y1 - y0;
  const p = [-dx, dx, -dy, dy];
  const q = [x0 - rect.x, rect.x + rect.width - x0, y0 - rect.y, rect.y + rect.height - y0];
  let t0 = 0, t1 = 1;
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return false;   // parallel to this slab and outside it
      continue;
    }
    const t = q[i] / p[i];
    if (p[i] < 0) {
      if (t > t1) return false;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return false;
      if (t < t1) t1 = t;
    }
  }
  return true;
}

// The circle's *outline*, not its disc: the rect has to straddle the rim, so the
// nearest point on it must be no further out than the radius and the furthest
// corner no closer in. A box sitting wholly inside the circle is a miss, which
// is the entire point of an expanding ring.
function circleEdgeHitsRect(cx, cy, radius, rect) {
  const nx = Math.max(rect.x, Math.min(cx, rect.x + rect.width));
  const ny = Math.max(rect.y, Math.min(cy, rect.y + rect.height));
  const near = Math.hypot(cx - nx, cy - ny);
  const fx = Math.max(Math.abs(cx - rect.x), Math.abs(cx - (rect.x + rect.width)));
  const fy = Math.max(Math.abs(cy - rect.y), Math.abs(cy - (rect.y + rect.height)));
  return near <= radius && Math.hypot(fx, fy) >= radius;
}

// ── windup attack lifecycle (shared system half) ────────────────────────────

// Attach Telegraph fields to a freshly created windup visual. Called from
// Enemy.createWindupAttackVisual when the enemy data declares `telegraph`.
// Facing is locked here — the shape aims where the enemy aimed, and stays
// aimed there for the whole windup (a readable commitment).
export function attachTelegraph(attack, enemy, dirX, dirY) {
  const resolved = resolveTelegraph(enemy.data.telegraph, enemy.data.name || enemy.char);
  if (!resolved) return attack;
  attack.warnShape = resolved.warnShape;
  attack.hitShape = resolved.hitShape;
  attack.facing = Math.atan2(dirY, dirX);
  attack.telegraphPulses = resolved.pulses;
  // The animation drives both what is drawn and — via the pulses compiled from
  // its beats — when damage lands. Held on the attack so every consumer reads
  // the same choreography off the same object.
  attack.animation = resolved.animation;
  attack.animationName = resolved.animationName;
  // The character the strike rides on, or null for the default hairline. Set
  // unconditionally so the field is never introduced lazily later.
  attack.attackShape = resolved.attackShape;
  attack.attackShapeTurn = resolved.attackShapeTurn;
  attack.attackShapeCount = resolved.attackShapeCount;
  return attack;
}

// Per-frame timer/visual update for one enemy melee attack: duration, windup
// alpha blink, owner position tracking, activation flash, and pulse
// re-arming. Returns true when the attack has expired (caller removes it).
export function updateEnemyMeleeAttack(attack, deltaTime) {
  attack.duration -= deltaTime;

  // Update windup alpha (blink effect via transparency)
  if (attack.windupPhase && attack.windupDuration !== undefined) {
    attack.windupElapsed += deltaTime;
    const progress = attack.windupElapsed / attack.windupDuration;

    // Track the owner's position so the hitbox follows knockback during windup.
    if (attack.owner && attack.ownerOffsetX !== undefined) {
      attack.position.x = attack.owner.position.x + attack.ownerOffsetX;
      attack.position.y = attack.owner.position.y + attack.ownerOffsetY;
    }

    // Alpha pattern: 0%=1.0, 25%=0.25, 50%=1.0, 75%=0.25, 100%=white
    if (progress < 0.25) {
      attack.alpha = 1.0; // Fully visible
    } else if (progress < 0.5) {
      attack.alpha = 0.25; // Dimmed (first dip)
    } else if (progress < 0.75) {
      attack.alpha = 1.0; // Fully visible
    } else {
      attack.alpha = 0.25; // Dimmed (second dip)
    }
  }

  // Update flash timer
  if (attack.flashTimer !== undefined && attack.flashTimer > 0) {
    attack.flashTimer -= deltaTime;
    if (attack.flashTimer <= 0) {
      attack.flashWhite = false;
    }
  }

  // Track time within the current beat so an animation's sweep knows how far
  // through its pass it is. Runs for every activated attack, including
  // single-beat ones — the first beat is the activation hit itself. The previous
  // value is kept because the strike's hitbox is swept across the whole slice of
  // travel a frame covers, not sampled at the point it ended on.
  if (!attack.windupPhase && attack.beatElapsed !== undefined) {
    attack.beatElapsedPrev = attack.beatElapsed;
    attack.beatElapsed += deltaTime;
  }

  // Advance the pulse clock on an activated multi-pulse attack: when the next
  // pulse comes due, re-arm the hit for exactly one more test frame.
  if (!attack.windupPhase && attack.pulseQueue && attack.pulseQueue.length > 0) {
    attack.pulseElapsed += deltaTime;
    const next = attack.pulseQueue[0];
    if (attack.pulseElapsed >= next.delay) {
      attack.pulseQueue.shift();
      attack.hasHit = false;
      attack.damage = attack.baseDamage * (next.damageMult ?? 1.0);
      attack.flashWhite = true;
      attack.flashTimer = FLASH_DURATION;
      attack.alpha = 1.0;
      // A new pulse is a new beat: restart the sweep for the next pass.
      attack.beatIndex = (attack.beatIndex ?? 0) + 1;
      attack.beatElapsed = 0;
      attack.beatElapsedPrev = 0;
    }
  }

  return attack.duration <= 0;
}

// The windup-visual state machine: create the visual while the enemy winds
// up, then either activate it (windup completed) or discard it (interrupted).
// This is the single canonical implementation — CombatSystem and the
// enemy-editor sandbox both call it against their own attack list.
export function syncWindupVisual(enemy, attackList) {
  if (enemy.attackType === 'melee' && enemy.isWindingUp && enemy.isWindingUp()) {
    // Enemy is winding up a melee attack - create/update windup visual
    if (!enemy.windupAttackVisual && enemy.createWindupAttackVisual) {
      const windupVisual = enemy.createWindupAttackVisual();
      if (windupVisual) {
        attackList.push(windupVisual);
        enemy.windupAttackVisual = windupVisual; // Track on enemy
      }
    }
  } else if (enemy.windupAttackVisual) {
    // Windup ended - convert visual to real attack or remove it
    if (enemy.canAttack()) {
      activateWindupVisual(enemy.windupAttackVisual);
      // Set attack cooldown (same as createAttack does)
      enemy.attackTimer = enemy.attackCooldown;
      enemy.state = 'idle';
    } else {
      // Windup was interrupted - remove the visual
      const index = attackList.indexOf(enemy.windupAttackVisual);
      if (index > -1) {
        attackList.splice(index, 1);
      }
    }
    enemy.windupAttackVisual = null;
  }
}

// Flip a windup visual live: it can now deal damage, flashes white as the
// "now" cue, and — if the Telegraph declares pulses — arms the pulse queue.
export function activateWindupVisual(attack) {
  attack.windupPhase = false;
  attack.hasHit = false; // Allow damage
  attack.flashWhite = true; // Flash white on activation
  attack.flashTimer = FLASH_DURATION;
  attack.alpha = 1.0; // Ensure fully visible when activated

  // Beat 0 is the activation hit. Set even for shapeless attacks so the field
  // is never lazily introduced later (see CLAUDE.md anti-patterns).
  attack.beatIndex = 0;
  attack.beatElapsed = 0;
  attack.beatElapsedPrev = 0;

  if (attack.telegraphPulses && attack.telegraphPulses.length > 0) {
    // Pulse 0 is the activation hit itself; later pulses re-arm on delay.
    const [first, ...rest] = attack.telegraphPulses;
    attack.baseDamage = attack.damage;
    attack.damage = attack.damage * (first.damageMult ?? 1.0);
    attack.pulseQueue = rest;
    attack.pulseElapsed = 0;
    const lastDelay = rest.length > 0 ? rest[rest.length - 1].delay : 0;
    attack.duration = lastDelay + ACTIVE_DURATION;
  } else {
    attack.duration = ACTIVE_DURATION; // Reset to normal attack duration
  }
}

// Does this melee attack currently reach the target hitbox? A travelling strike
// resolves against the mark itself, swept across the travel this frame covered;
// a still one (`blink`) resolves against the whole hit shape anchored at the
// owner's live center; legacy attacks fall back to the caller's rect check.
export function attackHitsBox(attack, box, legacyCheck) {
  if (isSweptStrike(attack) && !attack.windupPhase) {
    const from = (attack.beatElapsedPrev ?? 0) / ACTIVE_DURATION;
    if (from > 1) return false;   // the pass is over; the beat is spent
    const to = Math.min((attack.beatElapsed ?? 0) / ACTIVE_DURATION, 1);
    return strikeHitsBox(attack, box, from, to);
  }
  if (attack.hitShape) {
    const origin = attack.owner ? entityCenter(attack.owner) : attack.position;
    return hitTest(attack.hitShape, origin, attack.facing, box);
  }
  return legacyCheck();
}

// One contact test has resolved — decide whether the attack stays armed.
//
// A still attack gets exactly one test frame per beat (the legacy melee
// contract): it fills its whole shape at once, so a second frame could only ever
// find the same answer. A travelling strike is the opposite case — its mark
// covers a sliver of the shape per frame, so latching on the first miss would
// mean nearly every strike whiffed. It stays armed for the rest of its pass and
// latches the moment it connects, which is what keeps a beat to one hit.
export function retireAfterTest(attack, connected) {
  if (connected || !isSweptStrike(attack)) attack.hasHit = true;
}

// ── shared rendering ────────────────────────────────────────────────────────

// Telegraphs are drawn in pixel space, not as characters. The warning is a
// plain filled area and the strike is a thin stroke sweeping through it; both
// are continuous, so neither snaps to the character grid. An earlier version
// masked a cell rasterization and could only move a whole cell at a time, which
// read as blocks stuttering across the shape rather than a blade passing
// through it. Raw-canvas drawing for combat cues is house idiom — see
// BossRenderer's charge cone, which this follows.
//
// The warned area is never outlined. A filled region already states its own
// boundary, and an outline competes with the strike stroke for the reading
// "this is the line that hurts" — the strike is the only line a Telegraph draws.
// Losing the edge costs some crispness at the boundary, which is why the fill
// blinks between two solid values instead of fading toward nothing.
const AREA_FILL = 0.40;      // the warning's fill at the top of the blink
const AREA_FILL_DIM = 0.15;  // ...and at the bottom of the dip
const FLASH_FILL = 0.70;     // a `blink` strike: the area itself, hit-bright
const TRAIL_STEPS = 3;    // ghosts drawn behind the stroke, for a fluid pass
const TRAIL_SPACING = 0.08;

// An Attack Shape needs far less tail than a hairline: a character is already a
// mark, so three ghosts of one read as four glyphs rather than as one in motion.
const GLYPH_TRAIL_STEPS = 1;
const GLYPH_TRAIL_SPACING = 0.10;

// Draw one shaped attack. Returns false for legacy (shapeless) attacks so
// callers fall through to their own rect path. Every consumer — surface, PiP
// overlays, editor sandbox — goes through here, which is what keeps the editor
// showing the game rather than an imitation of it.
export function drawTelegraph(ctx, attack) {
  if (!attack.warnShape) return false;
  const origin = attack.owner ? entityCenter(attack.owner) : attack.position;
  const color = attack.color || '#ff5533';

  // The tell: the area alone, blinking on the shared windup alpha. Nothing
  // moves — motion is what the strike means, and spending it here would spend
  // the one cue the player has for "now".
  if (attack.windupPhase) {
    const a = attack.alpha ?? 1.0;
    drawArea(ctx, attack.warnShape, origin, attack.facing, color,
      AREA_FILL_DIM + (AREA_FILL - AREA_FILL_DIM) * a);
    return true;
  }

  // From release onward the area is gone and the strike is the entire picture.
  // The warning has already been read; leaving it up buries the one moving mark
  // that says the hit is landing now, and the player's attention is on the mark.
  // Nothing draws between the beats of a multi-hit attack for the same reason —
  // the pause is silence on purpose, and re-showing the area there would read as
  // a fresh warning for a commitment already made.
  //
  // Drawing is tied to ACTIVE_DURATION rather than the shorter white-flash timer
  // so a pass gets the whole live window to cross the shape; the flash still
  // decides the colour, so the "now" cue is unchanged.
  const beatProgress = (attack.beatElapsed ?? 0) / ACTIVE_DURATION;
  if (beatProgress > 1) return true;

  const strikeColor = (attack.flashWhite && attack.flashTimer > 0) ? '#ffffff' : color;
  const geo = strikeGeometry(attack.animation, attack.hitShape, attack.beatIndex ?? 0, beatProgress, attack.attackShapeCount);
  const travels = geo.lines.length > 0 || geo.circles.length > 0 || geo.arcs.length > 0;

  if (attack.attackShape) {
    // An authored glyph replaces the stroke wherever the strike is — including
    // on `blink`, which has nowhere to travel and plants it at the centre of the
    // area instead. Authored data that silently drew nothing would be worse than
    // having no glyph at all.
    drawAttackShape(ctx, attack, origin, beatProgress, strikeColor, travels);
  } else if (travels) {
    drawStrike(ctx, attack, origin, beatProgress, strikeColor);
  } else {
    // `blink` has no stroke, so for it the area *is* the strike and has to carry
    // the whole hit on its own — bright, in place, for the live window.
    drawArea(ctx, attack.hitShape, origin, attack.facing, strikeColor, FLASH_FILL);
  }
  return true;
}

// Trace a shape's outline into the current path, oriented by facing.
function pathShape(ctx, shape, origin, facing) {
  const cos = Math.cos(facing), sin = Math.sin(facing);
  const wx = (along, across) => origin.x + along * cos - across * sin;
  const wy = (along, across) => origin.y + along * sin + across * cos;

  ctx.beginPath();
  switch (shape.kind) {
    case 'rect': {
      const start = (shape.offset ?? 0) * CELL;
      const end = start + shape.length * CELL;
      const half = (shape.width * CELL) / 2;
      ctx.moveTo(wx(start, -half), wy(start, -half));
      ctx.lineTo(wx(end, -half), wy(end, -half));
      ctx.lineTo(wx(end, half), wy(end, half));
      ctx.lineTo(wx(start, half), wy(start, half));
      ctx.closePath();
      break;
    }
    case 'trapezoid': {
      const start = (shape.offset ?? 0) * CELL;
      const end = start + shape.length * CELL;
      const near = (shape.nearWidth * CELL) / 2;
      const far = (shape.farWidth * CELL) / 2;
      ctx.moveTo(wx(start, -near), wy(start, -near));
      ctx.lineTo(wx(end, -far), wy(end, -far));
      ctx.lineTo(wx(end, far), wy(end, far));
      ctx.lineTo(wx(start, near), wy(start, near));
      ctx.closePath();
      break;
    }
    case 'cone': {
      const half = (shape.angleDeg * Math.PI / 180) / 2;
      ctx.moveTo(origin.x, origin.y);
      ctx.arc(origin.x, origin.y, shape.range * CELL, facing - half, facing + half);
      ctx.closePath();
      break;
    }
    case 'circle': {
      const off = (shape.offset ?? 0) * CELL;
      ctx.arc(wx(off, 0), wy(off, 0), shape.radius * CELL, 0, Math.PI * 2);
      break;
    }
    case 'ring': {
      // Wound in opposite directions so the nonzero fill rule punches the inner
      // disc out — that hole is the safe ground, and it has to look empty.
      const inner = shape.innerRadius * CELL;
      ctx.arc(origin.x, origin.y, shape.outerRadius * CELL, 0, Math.PI * 2, false);
      ctx.moveTo(origin.x + inner, origin.y);
      ctx.arc(origin.x, origin.y, inner, 0, Math.PI * 2, true);
      break;
    }
  }
}

// A fill and nothing else — see the no-outline note above. Alpha multiplies into
// whatever the caller already had set, so an outer fade (tall-grass concealment,
// PiP dimming) composes instead of being clobbered — the same contract
// ASCIIRenderer.drawTextWithAlpha honours.
function drawArea(ctx, shape, origin, facing, color, fillAlpha) {
  const base = ctx.globalAlpha;
  ctx.save();
  pathShape(ctx, shape, origin, facing);
  ctx.globalAlpha = base * fillAlpha;
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

// The stroke, plus a short tail of dimmer thinner samples taken from earlier in
// the same pass. The tail is what makes a 0.15s crossing read as one continuous
// motion instead of a line teleporting — it costs three extra strokes and does
// the entire job of "fluid".
function drawStrike(ctx, attack, origin, progress, color) {
  const base = ctx.globalAlpha;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = color;
  // Back to front, so the head draws over its own tail.
  for (let i = TRAIL_STEPS; i >= 0; i--) {
    const p = progress - i * TRAIL_SPACING;
    if (p < 0) continue;
    ctx.globalAlpha = base * (i === 0 ? 1.0 : 0.4 - (i - 1) * 0.12);
    ctx.lineWidth = Math.max(1, STRIKE_WIDTH - i);
    traceStrike(ctx, strikeGeometry(attack.animation, attack.hitShape, attack.beatIndex ?? 0, p, attack.attackShapeCount),
      origin, attack.facing);
  }
  ctx.restore();
}

// Strike geometry arrives in the shape's local frame; rotate it onto the screen.
function traceStrike(ctx, geo, origin, facing) {
  const cos = Math.cos(facing), sin = Math.sin(facing);
  ctx.beginPath();
  for (const [a0, c0, a1, c1] of geo.lines) {
    ctx.moveTo(origin.x + a0 * cos - c0 * sin, origin.y + a0 * sin + c0 * cos);
    ctx.lineTo(origin.x + a1 * cos - c1 * sin, origin.y + a1 * sin + c1 * cos);
  }
  for (const r of geo.circles) {
    // Move to the circle's own start point first, or the path drags a line in
    // from wherever the previous segment ended.
    ctx.moveTo(origin.x + r, origin.y);
    ctx.arc(origin.x, origin.y, r, 0, Math.PI * 2);
  }
  for (const { radius, from, to } of geo.arcs) {
    // Arc angles are measured off facing, so the stretch turns with the enemy
    // exactly like every other piece of local-frame geometry here.
    const a0 = facing + from, a1 = facing + to;
    ctx.moveTo(origin.x + radius * Math.cos(a0), origin.y + radius * Math.sin(a0));
    ctx.arc(origin.x, origin.y, radius, a0, a1);
  }
  ctx.stroke();
}

// The Attack Shape: a single authored character carried by the strike instead of
// the hairline. Same path, same timing, same marks — only the mark changes, so an
// enemy can swing a '/' without any of the choreography knowing about it.
function drawAttackShape(ctx, attack, origin, progress, color, travels) {
  const base = ctx.globalAlpha;
  ctx.save();
  // Unifont, per the font rules: complete coverage, so any authored glyph draws.
  ctx.font = `${CELL}px 'Unifont', monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;

  if (!travels) {
    // `blink` has nowhere to carry a mark, so the area is both the strike and the
    // hitbox. It is drawn bright underneath the glyph — the glyph alone would be
    // one cell of picture for a shape that damages several cells wide.
    drawArea(ctx, attack.hitShape, origin, attack.facing, color, FLASH_FILL);
    // With a count authored, the glyph spreads round the shape the way a radial
    // animation's does — the same picture, held still.
    const spread = spreadMarks(attack.hitShape, attack.attackShapeCount);
    if (spread.length === 0) {
      const [along, across] = shapeCenter(attack.hitShape);
      spread.push({ along, across, angle: 0, length: 0, mirror: false });
    }
    for (const mark of spread) {
      stampGlyph(ctx, attack.attackShape, origin, attack.facing, mark, attack.attackShapeTurn);
    }
    ctx.restore();
    return;
  }

  // Back to front, so the head stamps over its own ghost.
  for (let i = GLYPH_TRAIL_STEPS; i >= 0; i--) {
    const p = progress - i * GLYPH_TRAIL_SPACING;
    if (p < 0) continue;
    ctx.globalAlpha = base * (i === 0 ? 1.0 : 0.3);
    const geo = strikeGeometry(attack.animation, attack.hitShape, attack.beatIndex ?? 0, p, attack.attackShapeCount);
    for (const mark of strikeMarks(geo, attack.attackShapeCount)) {
      stampGlyph(ctx, attack.attackShape, origin, attack.facing, mark, attack.attackShapeTurn);
    }
  }
  ctx.restore();
}

// One character laid onto a mark: turned to run along it, stretched to span its
// full length, and flipped when the mark is the reflected half of a pair.
//
// The stretch is what makes the glyph an honest picture of the hitbox. A strike
// across a big box damages the whole width of the box; an unstretched character
// sitting at the middle of that span shows the player a mark narrower than the
// thing about to hit them, and they dodge the picture, not the data.
//
// Turning with the mark (and so with `facing`) means a '/' is the same stroke
// whichever way the enemy is aimed — the glyph reads as part of the attack
// rather than as a symbol sitting on top of it.
//
// `turn` is the author's own quarter-turn of the character within that mark, in
// degrees, for glyphs whose meaning points somewhere: a '{' on a horizontal
// slap opens left or right by default and may want to open up or down instead.
// It is applied last — that is, innermost, underneath the stretch — so a turned
// glyph still spans the mark rather than being stretched off it.
function stampGlyph(ctx, glyph, origin, facing, mark, turn = 0) {
  const cos = Math.cos(facing), sin = Math.sin(facing);
  ctx.save();
  ctx.translate(origin.x + mark.along * cos - mark.across * sin,
                origin.y + mark.along * sin + mark.across * cos);
  ctx.rotate(facing + mark.angle);
  if (mark.mirror) ctx.scale(1, -1);
  if (mark.length > 0) {
    const extent = glyphExtentAlongMark(ctx, glyph, turn);
    if (extent > 0) ctx.scale(mark.length / extent, 1);
  }
  if (turn) ctx.rotate(turn * Math.PI / 180);
  ctx.fillText(glyph, 0, 0);
  ctx.restore();
}

// How much of the mark the glyph covers before stretching — the divisor that
// makes the stretch exact. Upright and upside-down, that is the character's own
// advance; on its side, the mark runs along what was the character's height, so
// the two measurements are not interchangeable and using width for both would
// stretch a quarter-turned glyph by the wrong factor.
//
// measureText is unaffected by the current transform, so both readings are the
// glyph's untransformed size at the current font.
function glyphExtentAlongMark(ctx, glyph, turn) {
  const metrics = ctx.measureText(glyph);
  if (turn % 180 === 0) return metrics.width;
  const height = (metrics.actualBoundingBoxAscent || 0) + (metrics.actualBoundingBoxDescent || 0);
  // Not every canvas implementation reports the bounding box; one cell is the
  // font size, which is the right order of magnitude when it does not.
  return height > 0 ? height : CELL;
}
