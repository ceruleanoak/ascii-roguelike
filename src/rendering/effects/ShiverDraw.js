/**
 * The shiver: a sub-cell jitter that marks something the player can act on
 * right now (the THREE room's lit frame). REST's equipped slots use the calmer
 * slotShiverOffset below.
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
 * REST's slot shiver: the equipped slot the player stands at, and the SPACE /
 * SHIFT words, tremble together. One regular sine, horizontal only, snapped to
 * whole pixels: a steady buzz rather than the THREE room's restless beat, and
 * crisp glyphs instead of sub-pixel smear.
 */
const SLOT_SHIVER_HZ = 6;
const SLOT_SHIVER_PX = 1;

/** The REST slot shiver's offset this instant, in whole pixels. */
export function slotShiverOffset(now = performance.now()) {
  const x = Math.round(Math.sin((now / 1000) * SLOT_SHIVER_HZ * 2 * Math.PI) * SLOT_SHIVER_PX);
  return { x, y: 0 };
}

/**
 * True while the player stands at one of REST's numbered equipped slots — the
 * three weapon chests (1-3) or a consumable slot (4-8).
 */
export function isAtEquippedSlot(nearestSlot) {
  return !!nearestSlot && /^equipment-(chest|consumable)\d$/.test(nearestSlot.type);
}

/** The slot shiver while at an equipped slot, else no offset. */
export function equippedSlotShiver(nearestSlot) {
  return isAtEquippedSlot(nearestSlot) ? slotShiverOffset() : { x: 0, y: 0 };
}
