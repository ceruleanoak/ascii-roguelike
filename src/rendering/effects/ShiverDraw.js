/**
 * The shiver: a sub-cell jitter that marks something the player can act on
 * right now (the THREE room's lit frame, the REST crafting slot under the
 * player, and the SPACE / SHIFT hints that act on it).
 *
 * Two incommensurate sines per axis rather than one. A single sine reads as a
 * decorative wobble, where a beat that never quite repeats reads as something
 * not holding still. Roughly a pixel and a half at full swing, which at a 16px
 * cell is a tremor and not a bounce.
 */
const SHIVER_X = [{ rate: 37.1, amp: 0.9 }, { rate: 23.7, amp: 0.6 }];
const SHIVER_Y = [{ rate: 41.3, amp: 0.7 }, { rate: 19.1, amp: 0.5 }];

/** The shiver's offset this instant, in pixels. */
export function shiverOffset(now = performance.now()) {
  const t = now / 1000;
  const sum = (terms) => terms.reduce((a, s) => a + Math.sin(t * s.rate) * s.amp, 0);
  return { x: sum(SHIVER_X), y: sum(SHIVER_Y) };
}

/**
 * True while the player stands at a REST crafting slot — the moment the
 * station, and the SPACE / SHIFT hints that act on it, shiver together.
 */
export function isAtCraftingSlot(nearestSlot) {
  return !!nearestSlot && nearestSlot.type.startsWith('crafting-');
}
