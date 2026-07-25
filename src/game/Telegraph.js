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
// Preferred authoring form — a named shape preset plus a Telegraph Animation,
// which declares the beats and therefore compiles its own pulses (see
// TelegraphAnimation.js; that module is the reason a `doubleSweep` cannot show
// two passes and land one hit):
//
//   telegraph: {
//     shape: 'horizontalSliceThin',
//     animation: 'doubleSweep',
//     beatDamage: [1.0, 0.5],
//   }
//
// Shape kinds (anchored at the attack owner's center, oriented by `facing`
// radians locked at windup start — the aim snapshot, matching
// markedTargetPosition semantics):
//   rect   { length, width, offset? }  — extends `length` cells along facing,
//                                        `width` cells across it, starting
//                                        `offset` cells out (default 0)
//   cone   { angleDeg, range }         — apex at owner, symmetric about facing
//   circle { radius, offset? }         — centered `offset` cells along facing
//   ring   { innerRadius, outerRadius }— centered on owner; the inner disc is
//                                        the safe zone (dodge *into* the enemy)
//
// Absent `telegraph` data, enemies keep the legacy single-rect windup visual,
// byte-identical to pre-Telegraph behavior.
//
// The warning may be wider than the damage shape on purpose: a Telegraph aids
// anticipation, it is not a 1:1 damage outline. Each pulse tests collision on
// exactly one frame (the legacy melee contract) so positional dodges work.

import { GRID } from './GameConfig.js';
import { resolveTelegraph, strikeGeometry } from './TelegraphAnimation.js';

const CELL = GRID.CELL_SIZE;

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
  // single-beat ones — the first beat is the activation hit itself.
  if (!attack.windupPhase && attack.beatElapsed !== undefined) {
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

// Does this melee attack currently reach the target hitbox? Shaped attacks
// resolve against the hit shape anchored at the owner's live center; legacy
// attacks fall back to the caller's rect check.
export function attackHitsBox(attack, box, legacyCheck) {
  if (attack.hitShape) {
    const origin = attack.owner ? entityCenter(attack.owner) : attack.position;
    return hitTest(attack.hitShape, origin, attack.facing, box);
  }
  return legacyCheck();
}

// ── shared rendering ────────────────────────────────────────────────────────

// Telegraphs are drawn in pixel space, not as characters. The warning is a
// plain filled area and the strike is a thin stroke sweeping through it; both
// are continuous, so neither snaps to the character grid. An earlier version
// masked a cell rasterization and could only move a whole cell at a time, which
// read as blocks stuttering across the shape rather than a blade passing
// through it. Raw-canvas drawing for combat cues is house idiom — see
// BossRenderer's charge cone, which this follows.
const AREA_FILL = 0.25;   // the warning's fill, at full blink brightness
const AREA_EDGE = 0.7;    // its outline — enough to define the boundary crisply
const STRIKE_WIDTH = 3;   // px. The whole point: a few pixels across, not a cell
const TRAIL_STEPS = 3;    // ghosts drawn behind the stroke, for a fluid pass
const TRAIL_SPACING = 0.08;

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
    drawArea(ctx, attack.warnShape, origin, attack.facing, color, AREA_FILL * a, AREA_EDGE * a);
    return true;
  }

  // The strike runs across the beat's active window. Drawing is tied to
  // ACTIVE_DURATION rather than the shorter white-flash timer so a pass gets
  // the whole live window to cross the shape; the flash still decides the
  // colour, so the "now" cue is unchanged.
  const beatProgress = (attack.beatElapsed ?? 0) / ACTIVE_DURATION;
  if (beatProgress <= 1) {
    const strikeColor = (attack.flashWhite && attack.flashTimer > 0) ? '#ffffff' : color;
    const geo = strikeGeometry(attack.animation, attack.hitShape, attack.beatIndex ?? 0, beatProgress);
    const still = geo.lines.length === 0 && geo.circles.length === 0;
    // `blink` has no stroke, so for it the area *is* the strike and has to carry
    // the whole hit on its own. Everything else drops the area back to a hint of
    // context so the stroke is unmistakably the thing that happened.
    drawArea(ctx, attack.hitShape, origin, attack.facing, strikeColor,
      still ? 0.75 : 0.15, still ? 1.0 : 0.4);
    if (!still) drawStrike(ctx, attack, origin, beatProgress, strikeColor);
    return true;
  }

  // Past the strike, still on the attack list: either waiting on a later beat or
  // running out the last frames of the final one. Either way the area stays up,
  // dim — the threat has not left, and dropping it here put a one-frame hole at
  // the tail of every single-beat attack.
  drawArea(ctx, attack.warnShape, origin, attack.facing, color, 0.1, 0.3);
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

// Alphas multiply into whatever the caller already had set, so an outer fade
// (tall-grass concealment, PiP dimming) composes instead of being clobbered —
// the same contract ASCIIRenderer.drawTextWithAlpha honours.
function drawArea(ctx, shape, origin, facing, color, fillAlpha, edgeAlpha) {
  const base = ctx.globalAlpha;
  ctx.save();
  pathShape(ctx, shape, origin, facing);
  ctx.globalAlpha = base * fillAlpha;
  ctx.fillStyle = color;
  ctx.fill();
  ctx.globalAlpha = base * edgeAlpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.stroke();
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
    traceStrike(ctx, strikeGeometry(attack.animation, attack.hitShape, attack.beatIndex ?? 0, p),
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
  ctx.stroke();
}
