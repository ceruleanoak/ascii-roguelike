/**
 * AscentRenderHelpers — rendering helpers for zone-specific Ascent (A-room)
 * visuals. Extracted from ExploreRenderer to stay within architecture budget.
 *
 * - Cyan: Frozen Maw shadow under ice (fades downward); also the Aquifer
 *   lake arena's Maw Shadow, drawn with the Lake Boss's submerged darkening
 * - Yellow: Charged-object yellow blink (background objects + ground items)
 */

import { GRID } from '../game/GameConfig.js';

/**
 * Darken the water tiles within 4 cells of (x, y) — something huge moving
 * beneath the surface. Shared by the submerged Lake Boss (BossRenderer) and
 * the dormant Maw Shadow of the Aquifer's cyan arena.
 */
export function drawSubmergedShadow(ctx, room, x, y) {
  const cs  = GRID.CELL_SIZE;
  const R   = cs * 4;
  const RSq = R * R;
  ctx.save();
  ctx.globalAlpha = 0.4;
  ctx.fillStyle   = '#000033';
  for (const obj of room.backgroundObjects) {
    if (obj.destroyed || !obj.isWater || !obj.isWater()) continue;
    const dx = obj.position.x - x, dy = obj.position.y - y;
    if (dx * dx + dy * dy <= RSq)
      ctx.fillRect(obj.position.x, obj.position.y, cs, cs);
  }
  ctx.restore();
}

/**
 * The Frosted Maw's two dormant shadows:
 * - Cyan Ascent: the Frozen Maw under the ice — a large glyph that appears
 *   briefly on room entry, then drifts downward and fades.
 * - The Aquifer's cyan lake arena: the Maw Shadow drifting beneath the water
 *   until a fishing cast wakes it (MawShadowSystem).
 * Purely visual, no collision.
 */
export function renderMawShadow(ctx, game) {
  const lakeShadow = game.currentRoom?.mawShadow;
  if (lakeShadow) drawSubmergedShadow(ctx, game.currentRoom, lakeShadow.x, lakeShadow.y);

  const ice = game.currentRoom?.ascentIce;
  if (!ice?.mawShadow) return;
  const maw = ice.mawShadow;
  if (maw.alpha <= 0) return;

  ctx.save();
  ctx.globalAlpha = maw.alpha;
  ctx.font = `${Math.round(GRID.CELL_SIZE * 2.5)}px 'Unifont', monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#4488aa';
  ctx.fillText(maw.glyph, maw.x, maw.y + maw.yOffset);
  ctx.restore();
}

/**
 * Returns a color override for a charged object (yellow blink), or the
 * original color if not charged. Used by both background-object and item
 * rendering in ExploreRenderer.
 */
export function chargedColor(obj, originalColor) {
  if (!obj.charged) return originalColor;
  const blink = Math.sin(performance.now() / 100) > 0;
  return blink ? '#ffff00' : '#ffaa00';
}

/**
 * Yellow Ascent: draw charged background objects (spire, metal slope grating)
 * on the FOREGROUND each frame.
 *
 * They cannot ride the background pass: `chargedColor` blinks off
 * `performance.now()`, but `ExploreRenderer.renderBackground` early-returns
 * unless `backgroundDirty`, so a charged object baked into the background
 * freezes on whichever half of the blink happened to be current — killing the
 * only cue that the metal is live. Same treatment campfires, burning objects
 * and Sinkholes already get for the same reason.
 *
 * `shouldRender` is ExploreRenderer's plane-aware predicate, passed in so the
 * helper honours the same tunnel/surface visibility rule as the background loop.
 */
export function renderChargedObjects(renderer, game, shouldRender) {
  for (const obj of game.backgroundObjects) {
    if (!obj.charged || obj.destroyed) continue;
    // Water tiles blink through the foreground water pass already.
    if (obj.char === '~') continue;
    if (!shouldRender(obj)) continue;
    renderer.drawEntity(
      obj.position.x + GRID.CELL_SIZE / 2,
      obj.position.y + GRID.CELL_SIZE / 2,
      obj.char,
      chargedColor(obj, obj.color)
    );
  }
}
