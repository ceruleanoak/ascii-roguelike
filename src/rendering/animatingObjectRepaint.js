/**
 * Background-cache invalidation for animating Background Objects.
 *
 * The cached background layer (ExploreRenderer / NeutralRenderer
 * `renderBackground`) leaves out any object with a `currentAnimation`; the
 * foreground draws that object live instead, offset by its `animationOffset`
 * (the hit shake). The cache is only repainted when `backgroundDirty` is set,
 * though, so without a repaint the still copy baked in before the hit stays
 * on the background under the moving one, and the shake reads as a smear
 * rather than a shake. The same goes for the moment the animation ends: the
 * object has to go back into the cache.
 *
 * `animatingSetChanged` compares the objects animating this frame against
 * the set tracked last frame and reports whether it changed (an animation
 * started or ended, or an animating object left the list), updating `tracked`
 * in place. A caller marks the background dirty when it returns true.
 *
 * @param {Set<object>} tracked  the renderer's own set, carried frame to frame
 * @param {Iterable<object>} objects  the Background Objects the cache draws
 * @returns {boolean} true when the animating set differs from last frame's
 */
export function animatingSetChanged(tracked, objects) {
  let count = 0;
  let changed = false;
  for (const obj of objects) {
    if (!obj.currentAnimation) continue;
    count++;
    if (!tracked.has(obj)) changed = true;
  }
  // Every animating object already tracked and the same count means the same set.
  if (!changed && count === tracked.size) return false;

  tracked.clear();
  for (const obj of objects) {
    if (obj.currentAnimation) tracked.add(obj);
  }
  return true;
}
