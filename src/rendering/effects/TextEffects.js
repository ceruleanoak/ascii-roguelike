/**
 * TextEffects — reusable per-pixel text transition effects for canvas rendering.
 *
 * Effects are stateful objects designed to be instantiated once and updated
 * each render frame. All effects use CSS-pixel coordinates and are safe to
 * use on DPR-scaled canvas contexts (the offscreen canvas is kept at CSS
 * pixel density; drawImage handles the mapping automatically).
 */

// ---------------------------------------------------------------------------
// Bayer 4×4 ordered-dither matrix (values 0–15; threshold = value / 16)
// ---------------------------------------------------------------------------
const BAYER_4x4 = [
  [ 0,  8,  2, 10],
  [12,  4, 14,  6],
  [ 3, 11,  1,  9],
  [15,  7, 13,  5],
];

// ---------------------------------------------------------------------------
// Bayer-indexed ease helper (shared)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// SplitReveal
//
// Renders a "sliding-doors" animation over a single-cell exit gap in the
// border.  Two half-cell panels slide apart to reveal the opening beneath.
//
// axis: 'horizontal' — left & right halves slide out (north / south exits)
//       'vertical'   — top & bottom halves slide out (east  / west  exits)
//
// Usage:
//   const split = new SplitReveal({ speed: 3.5, axis: 'horizontal' });
//
//   // On room change:
//   split.reset();
//
//   // Each frame:
//   split.render(ctx, { x, y, size, color, visible });
// ---------------------------------------------------------------------------
export class SplitReveal {
  /**
   * @param {object} [opts]
   * @param {number} [opts.speed=3.5]    Progress units/second (full open ≈ 1/speed s).
   * @param {'horizontal'|'vertical'} [opts.axis='horizontal']
   */
  constructor({ speed = 3.5, axis = 'horizontal' } = {}) {
    this.speed = speed;
    this.axis = axis;
    this._progress = 0;   // 0 = fully closed, 1 = fully open
    this._lastTime = null;
  }

  /**
   * Start fully open so the closing animation plays from the first frame.
   * Call when entering a new room — the split will animate closed if exits
   * are locked, or stay open if they're already unlocked.
   */
  startOpen() {
    this._progress = 1;
    this._lastTime = performance.now(); // non-null: prevents snap-on-first-call
  }

  /**
   * Draw (or skip) the split-panel overlay for one exit gap cell.
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {object}  opts
   * @param {number}  opts.x       Left edge of the gap cell in CSS pixels.
   * @param {number}  opts.y       Top edge of the gap cell in CSS pixels.
   * @param {number}  opts.size    Cell size (gap is a square: size × size).
   * @param {string}  opts.color   Panel fill color — should match border.
   * @param {boolean} opts.visible true → animate open; false → animate closed.
   * @returns {boolean} Whether anything was drawn.
   */
  render(ctx, { x, y, size, color, visible }) {
    this._step(visible ? 1 : 0);

    if (this._progress >= 1) return false; // Fully open — nothing to overlay

    // Ease-out quadratic: snappy open, smooth settle.
    const p = 1 - (1 - this._progress) * (1 - this._progress);
    const half = size / 2;
    const offset = p * half;

    // Clip to the exact gap-cell bounds so panels never bleed onto adjacent wall cells.
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, size, size);
    ctx.clip();

    ctx.fillStyle = color;
    if (this._progress <= 0) {
      // Fully closed — single solid rectangle (no sliding math needed).
      ctx.fillRect(x, y, size, size);
    } else if (this.axis === 'horizontal') {
      ctx.fillRect(x - offset,        y, half, size); // left half  → slides left
      ctx.fillRect(x + half + offset, y, half, size); // right half → slides right
    } else {
      ctx.fillRect(x, y - offset,        size, half); // top half   → slides up
      ctx.fillRect(x, y + half + offset, size, half); // bottom half → slides down
    }

    ctx.restore();
    return true;
  }

  // -------------------------------------------------------------------------
  _step(target) {
    const now = performance.now();
    if (this._lastTime === null) {
      this._lastTime = now;
      this._progress = target; // Snap on first call (avoids spurious animation)
      return;
    }
    const dt = Math.min((now - this._lastTime) / 1000, 0.1);
    this._lastTime = now;
    if (target > this._progress) {
      this._progress = Math.min(1, this._progress + this.speed * dt);
    } else {
      this._progress = Math.max(0, this._progress - this.speed * dt);
    }
  }
}

// ---------------------------------------------------------------------------
// PixelatedDissolve
//
// Renders a piece of text with an ordered-dither dissolve in/out transition.
//
// Usage:
//   const effect = new PixelatedDissolve({ speed: 3.0 });
//
//   // Each frame:
//   effect.render(ctx, {
//     text,
//     font,
//     color,
//     x,           // canvas x (textAlign = 'center')
//     y,           // canvas y (textBaseline = 'middle')
//     visible,     // boolean — true fades in, false fades out
//   });
//
// The effect returns `true` if it drew anything (useful to skip an early-out).
// ---------------------------------------------------------------------------
export class PixelatedDissolve {
  /**
   * @param {object} [opts]
   * @param {number} [opts.speed=3.0]    Dissolve speed in alpha units/second (full in/out ≈ 1/speed s).
   * @param {number} [opts.blockSize=1]  Pixel block size for the dither pattern.
   *                                     1 = per-pixel (smooth), 4+ = chunky/blocky.
   */
  constructor({ speed = 3.0, blockSize = 1 } = {}) {
    this.speed = speed;
    this.blockSize = Math.max(1, Math.floor(blockSize));
    this._alpha = 0;
    this._lastTime = null;
    this._offscreen = null;
    this._offCtx = null;
  }

  /** Current dissolve alpha (0 = fully hidden, 1 = fully visible). Read-only. */
  get alpha() { return this._alpha; }

  /**
   * Renders the text to `ctx` with a pixelated dissolve effect.
   *
   * @param {CanvasRenderingContext2D} ctx   Target (possibly DPR-scaled) canvas context.
   * @param {object} opts
   * @param {string}  opts.text     Text string to render.
   * @param {string}  opts.font     CSS font string (e.g. `"24px 'VentureArcade', monospace"`).
   * @param {string}  opts.color    CSS fill color for the text.
   * @param {number}  opts.x        Horizontal centre of the text in canvas CSS pixels.
   * @param {number}  opts.y        Vertical centre of the text in canvas CSS pixels.
   * @param {boolean} opts.visible  Whether the text should be fully visible (true) or hidden (false).
   * @returns {boolean} Whether anything was drawn.
   */
  render(ctx, { text, font, color, x, y, visible }) {
    this._step(visible ? 1 : 0);

    if (this._alpha <= 0) return false;

    ctx.save();
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (this._alpha >= 1) {
      // Fully visible — draw directly, no offscreen pass needed.
      ctx.fillStyle = color;
      ctx.fillText(text, x, y);
      ctx.restore();
      return true;
    }

    // --- Offscreen dissolve pass ---
    const metrics = ctx.measureText(text);
    const pad = 4;
    const w = Math.ceil(metrics.width) + pad * 2;
    const h = parseInt(font, 10) + pad * 2;  // parse leading number from font string

    this._ensureOffscreen(w, h);

    // Draw text onto offscreen canvas.
    const off = this._offCtx;
    off.clearRect(0, 0, w, h);
    off.font = font;
    off.textAlign = 'center';
    off.textBaseline = 'middle';
    off.fillStyle = color;
    off.fillText(text, w / 2, h / 2);

    // Apply Bayer ordered-dither threshold per pixel.
    const imageData = off.getImageData(0, 0, w, h);
    const d = imageData.data;
    const a = this._alpha;

    const bs = this.blockSize;
    for (let py = 0; py < h; py++) {
      const row = BAYER_4x4[Math.floor(py / bs) & 3];
      for (let px = 0; px < w; px++) {
        const i = (py * w + px) * 4;
        if (d[i + 3] === 0) continue;                         // already transparent
        if (row[Math.floor(px / bs) & 3] / 16 >= a) d[i + 3] = 0; // threshold: hide block
      }
    }

    off.putImageData(imageData, 0, 0);

    // Composite offscreen canvas onto the (potentially DPR-scaled) target context.
    // drawImage coordinates are in CSS pixels, matching how text would be drawn directly.
    ctx.drawImage(this._offscreen, x - w / 2, y - h / 2);
    ctx.restore();
    return true;
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /** Advance `_alpha` toward `target` based on elapsed wall-clock time. */
  _step(target) {
    const now = performance.now();
    if (this._lastTime === null) {
      this._lastTime = now;
      this._alpha = target;
      return;
    }
    const dt = Math.min((now - this._lastTime) / 1000, 0.1);
    this._lastTime = now;

    if (target > this._alpha) {
      this._alpha = Math.min(target, this._alpha + this.speed * dt);
    } else {
      this._alpha = Math.max(target, this._alpha - this.speed * dt);
    }
  }

  /** Create or resize the offscreen canvas. */
  _ensureOffscreen(w, h) {
    if (!this._offscreen) {
      this._offscreen = document.createElement('canvas');
      this._offCtx = this._offscreen.getContext('2d');
    }
    if (this._offscreen.width !== w || this._offscreen.height !== h) {
      this._offscreen.width = w;
      this._offscreen.height = h;
    }
  }
}
