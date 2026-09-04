/**
 * SparkleEffects — the intermittent "something here catches the light"
 * twinkle: dot → slowly spinning asterisk → dot, then a quiet tail.
 *
 * One implementation, two tempos. Tall grass hiding a dropped item ticks at
 * the base rate, so the tell is easy to miss if you aren't looking; a
 * Glittering Rock runs at double speed, because there the twinkle isn't a
 * secret being leaked — it's the rock advertising what it is.
 */

// Full cycle and the windows inside it, in seconds at speed 1. The cycle is
// mostly dead air: the sparkle is visible for ACTIVE_WINDOW and absent for
// the rest, which is what makes it read as intermittent rather than as an
// animation that happens to loop.
const CYCLE = 1.8;
const ACTIVE_WINDOW = 0.6;
const SPIN_START = 0.15;
const SPIN_LENGTH = 0.3;
const SPIN_ARC = Math.PI * 2 / 3;  // ~1/6 rotation across the mid window
const SPARKLE_COLOR = '#ffffcc';

export const GRASS_SPARKLE_SPEED = 1;
export const GLITTER_SPARKLE_SPEED = 2;

/**
 * Draws one sparkle centered on (cx, cy), or nothing if this position is
 * currently in the dead part of its cycle. The phase is hashed from the
 * position so neighbouring sparkles never blink in unison, and `speed`
 * multiplies the whole cycle — 2 halves every window above.
 */
export function drawSparkle(renderer, cx, cy, speed = 1) {
  const phase = (((cx * 73856093) ^ (cy * 19349663)) >>> 0) % 1800 / 1000;
  const t = ((performance.now() / 1000 + phase) * speed) % CYCLE;
  if (t > ACTIVE_WINDOW) return;

  if (t < SPIN_START || t >= SPIN_START + SPIN_LENGTH) {
    // Pixel-sized dot — head and tail of the sparkle.
    renderer.drawEntity(cx, cy, '·', SPARKLE_COLOR);
  } else {
    const angle = ((t - SPIN_START) / SPIN_LENGTH) * SPIN_ARC;
    renderer.drawEntityRotated(cx, cy, '*', SPARKLE_COLOR, angle);
  }
}
