/**
 * AnimationSystem
 *
 * Plays sequences of timed steps on any 2D target (player, NPC, item, etc.).
 * The target is locked for the duration so normal input/AI/physics callers can
 * skip it via isAnimating(target).
 *
 * Step types:
 *   { type: 'moveTo',  x, y, duration, easing? }
 *   { type: 'moveBy',  dx, dy, duration, easing? }
 *   { type: 'wait',    duration }
 *   { type: 'callback', fn }            // fires once, then advances
 *   { type: 'set',     x?, y? }         // instant teleport, then advances
 *
 * Easing: 'linear' | 'easeIn' | 'easeOut' | 'easeInOut'
 *
 * Optional per-step early exit (timed steps only):
 *   interruptible: true
 *   interruptAfter: 0.5          // progress threshold (0..1), default 0.5
 *   canInterrupt: () => boolean  // when true past threshold, step snaps to end
 *
 * Targets must expose either { position: {x,y} } or { x, y }.
 * If the target has .velocity { vx, vy }, it is zeroed on each move tick.
 */
export class AnimationSystem {
  constructor(game) {
    this.game = game;
    this.animations = [];
  }

  play(target, steps, opts = {}) {
    const lockKey = opts.lockKey ?? '_animLock';
    target[lockKey] = true;
    if (target.velocity) { target.velocity.vx = 0; target.velocity.vy = 0; }

    const anim = {
      target,
      steps,
      stepIndex: 0,
      stepElapsed: 0,
      stepFrom: null,
      lockKey,
      onComplete: opts.onComplete || null,
      cancelled: false,
    };
    this.animations.push(anim);

    return {
      cancel: () => this._cancel(anim),
      isActive: () => !anim.cancelled && anim.stepIndex < anim.steps.length,
    };
  }

  isAnimating(target, lockKey = '_animLock') {
    return !!(target && target[lockKey]);
  }

  cancelFor(target, lockKey = '_animLock') {
    for (const anim of this.animations) {
      if (anim.target === target && anim.lockKey === lockKey) {
        this._cancel(anim);
      }
    }
  }

  /**
   * Re-bind any animation currently targeting `oldTarget` to `newTarget`.
   * Required when an action inside a callback step replaces the target
   * entity (e.g. enterExploreState() rebuilds this.player).
   */
  retarget(oldTarget, newTarget, lockKey = '_animLock') {
    if (oldTarget === newTarget) return;
    for (const anim of this.animations) {
      if (anim.target === oldTarget && anim.lockKey === lockKey) {
        oldTarget[lockKey] = false;
        anim.target = newTarget;
        newTarget[lockKey] = true;
        anim.stepFrom = null;
      }
    }
  }

  update(dt) {
    for (let i = this.animations.length - 1; i >= 0; i--) {
      const anim = this.animations[i];
      if (anim.cancelled) { this.animations.splice(i, 1); continue; }

      this._tick(anim, dt);

      if (anim.stepIndex >= anim.steps.length) {
        anim.target[anim.lockKey] = false;
        this.animations.splice(i, 1);
        if (anim.onComplete) anim.onComplete();
      }
    }
  }

  _cancel(anim) {
    if (anim.cancelled) return;
    anim.cancelled = true;
    if (anim.target) anim.target[anim.lockKey] = false;
  }

  _tick(anim, dt) {
    let remaining = dt;
    while (remaining > 0 && anim.stepIndex < anim.steps.length) {
      const step = anim.steps[anim.stepIndex];

      // First touch of this step: snapshot start state and resolve instant types
      if (anim.stepFrom === null) {
        anim.stepFrom = readPos(anim.target);

        if (step.type === 'callback') {
          if (step.fn) step.fn();
          this._advance(anim);
          continue;
        }
        if (step.type === 'set') {
          if (step.x !== undefined) writeX(anim.target, step.x);
          if (step.y !== undefined) writeY(anim.target, step.y);
          this._advance(anim);
          continue;
        }
        if (step.type === 'moveBy') {
          step._toX = anim.stepFrom.x + (step.dx ?? 0);
          step._toY = anim.stepFrom.y + (step.dy ?? 0);
        }
      }

      const duration = Math.max(0, step.duration ?? 0);
      const left = duration - anim.stepElapsed;
      const advance = Math.min(remaining, left);
      anim.stepElapsed += advance;
      remaining -= advance;

      const t = duration > 0 ? Math.min(1, anim.stepElapsed / duration) : 1;
      const e = applyEasing(t, step.easing);

      if (step.type === 'moveTo') {
        writeX(anim.target, lerp(anim.stepFrom.x, step.x, e));
        writeY(anim.target, lerp(anim.stepFrom.y, step.y, e));
        if (anim.target.velocity) { anim.target.velocity.vx = 0; anim.target.velocity.vy = 0; }
      } else if (step.type === 'moveBy') {
        writeX(anim.target, lerp(anim.stepFrom.x, step._toX, e));
        writeY(anim.target, lerp(anim.stepFrom.y, step._toY, e));
        if (anim.target.velocity) { anim.target.velocity.vx = 0; anim.target.velocity.vy = 0; }
      }
      // 'wait' just consumes time

      // Early exit: leave target at its current (partial) position and advance.
      // Checked after the partial-frame write so position reflects where the
      // tween actually got to, not where it was planned to land.
      if (
        step.interruptible && duration > 0 && step.canInterrupt &&
        t >= (step.interruptAfter ?? 0.5) && step.canInterrupt()
      ) {
        this._advance(anim);
        continue;
      }

      if (anim.stepElapsed >= duration) {
        this._advance(anim);
      }
    }
  }

  _advance(anim) {
    anim.stepIndex++;
    anim.stepElapsed = 0;
    anim.stepFrom = null;
  }
}

function readPos(t) {
  return t.position
    ? { x: t.position.x, y: t.position.y }
    : { x: t.x, y: t.y };
}
function writeX(t, x) { if (t.position) t.position.x = x; else t.x = x; }
function writeY(t, y) { if (t.position) t.position.y = y; else t.y = y; }

function lerp(a, b, t) { return a + (b - a) * t; }

function applyEasing(t, kind) {
  switch (kind) {
    case 'easeIn':      return t * t * t;
    case 'easeInQuad':  return t * t;
    case 'easeOut':     return 1 - (1 - t) * (1 - t);
    case 'easeOutCubic': return 1 - Math.pow(1 - t, 3);
    case 'easeInOut':   return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    default:          return t;
  }
}
