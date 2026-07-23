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

const CELL = GRID.CELL_SIZE;

// Duration of the visible "live" hit flash — the legacy active-attack window.
const ACTIVE_DURATION = 0.15;
const FLASH_DURATION = 0.1;

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

// Cells (pixel centers) covered by the shape, for ASCII rendering. Bounded by
// the shape's own reach so the scan never walks the whole grid.
export function rasterizeToCells(shape, origin, facing) {
  const reach = shapeReach(shape) * CELL;
  const minCol = Math.max(0, Math.floor((origin.x - reach) / CELL));
  const maxCol = Math.min(GRID.COLS - 1, Math.floor((origin.x + reach) / CELL));
  const minRow = Math.max(0, Math.floor((origin.y - reach) / CELL));
  const maxRow = Math.min(GRID.ROWS - 1, Math.floor((origin.y + reach) / CELL));
  const cells = [];
  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      const cx = col * CELL + CELL / 2;
      const cy = row * CELL + CELL / 2;
      if (pointInShape(shape, origin, facing, cx, cy)) cells.push({ col, row, x: cx, y: cy });
    }
  }
  return cells;
}

function shapeReach(shape) {
  switch (shape.kind) {
    case 'circle': return (shape.offset ?? 0) + shape.radius;
    case 'ring': return shape.outerRadius;
    case 'cone': return shape.range;
    case 'rect': return (shape.offset ?? 0) + shape.length + shape.width / 2;
    default: return 0;
  }
}

// ── windup attack lifecycle (shared system half) ────────────────────────────

// Attach Telegraph fields to a freshly created windup visual. Called from
// Enemy.createWindupAttackVisual when the enemy data declares `telegraph`.
// Facing is locked here — the shape aims where the enemy aimed, and stays
// aimed there for the whole windup (a readable commitment).
export function attachTelegraph(attack, enemy, dirX, dirY) {
  const t = enemy.data.telegraph;
  if (!t || !t.warnShape) return attack;
  attack.warnShape = t.warnShape;
  attack.hitShape = t.hitShape || t.warnShape;
  attack.facing = Math.atan2(dirY, dirX);
  attack.telegraphPulses = t.pulses || null;
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

// ── shared render data ──────────────────────────────────────────────────────

// What a shaped attack should draw this frame, resolved once so every
// renderer (surface, PiP overlays, editor sandbox) shows the same thing:
//   windup           → warn shape, blinking alpha
//   pulse flash      → hit shape, white
//   between pulses   → warn shape, dim steady (the threat is still live)
// Returns null for legacy (shapeless) attacks — callers keep their rect path.
export function telegraphRenderCells(attack) {
  if (!attack.warnShape) return null;
  const origin = attack.owner ? entityCenter(attack.owner) : attack.position;
  if (attack.windupPhase) {
    return {
      cells: rasterizeToCells(attack.warnShape, origin, attack.facing),
      char: '▒',
      color: attack.color,
      alpha: attack.alpha ?? 1.0,
    };
  }
  if (attack.flashWhite && attack.flashTimer > 0) {
    return {
      cells: rasterizeToCells(attack.hitShape, origin, attack.facing),
      char: '█',
      color: '#ffffff',
      alpha: 1.0,
    };
  }
  // Activated, waiting on a later pulse.
  if (attack.pulseQueue && attack.pulseQueue.length > 0) {
    return {
      cells: rasterizeToCells(attack.warnShape, origin, attack.facing),
      char: '▒',
      color: attack.color,
      alpha: 0.25,
    };
  }
  return { cells: [], char: '▒', color: attack.color, alpha: 0 };
}
