/**
 * AscentRenderHelpers — rendering helpers for zone-specific Ascent (A-room)
 * visuals. Extracted from ExploreRenderer to stay within architecture budget.
 *
 * - Cyan: the Maw Shadow under the Ascent's frozen pond and under the
 *   Aquifer lake arena, both drawn with the Lake Boss's submerged darkening
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
 * The Frosted Maw's two dormant shadows, both the Lake Boss's submerged
 * darkening:
 * - Cyan Ascent: the Maw Shadow under the frozen pond (IceAscentSystem). While
 *   it telegraphs an eruption, cracks flicker on the ice above it.
 * - The Aquifer's cyan lake arena: the Maw Shadow drifting beneath the water
 *   until a fishing cast wakes it (MawShadowSystem).
 * Purely visual, no collision.
 */
export function renderMawShadow(ctx, game) {
  const room = game.currentRoom;
  const lakeShadow = room?.mawShadow;
  if (lakeShadow) drawSubmergedShadow(ctx, room, lakeShadow.x, lakeShadow.y);

  const maw = room?.ascentIce?.mawShadow;
  if (!maw) return;
  drawSubmergedShadow(ctx, room, maw.x, maw.y);
  if (maw.telegraph > 0) drawIceCracks(ctx, maw.x, maw.y);
}

// Cracks crazing the ice over an erupting Maw Shadow — a few pale glyphs
// jittered around its tile, re-rolled every frame so the ice reads as shaking.
function drawIceCracks(ctx, x, y) {
  const cs = GRID.CELL_SIZE;
  const CRACKS = ['/', '\\', 'x', '+'];
  ctx.save();
  ctx.font = `${cs}px 'Unifont', monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ddf4ff';
  for (let i = 0; i < 5; i++) {
    const ox = (Math.random() - 0.5) * cs * 2;
    const oy = (Math.random() - 0.5) * cs * 2;
    ctx.fillText(CRACKS[i % CRACKS.length], x + cs / 2 + ox, y + cs / 2 + oy);
  }
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
