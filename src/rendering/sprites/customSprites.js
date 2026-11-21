import { drawFracturedRock } from './fracturedRockSprite.js';
import { drawFencePiece } from './fenceSprite.js';

// Background Objects whose data names a `customSprite` are drawn here instead of
// as a glyph, in both the static background pass and the animated pass
// (ExploreRenderer), so an object never drops to glyph size mid-animation.
// (cx, cy) is the cell centre.
const CUSTOM_SPRITES = {
  fracturedRock: (ctx, cx, cy, obj, color) => drawFracturedRock(ctx, cx, cy, obj.damageStage, color),
  fencePost: (ctx, cx, cy, obj, color) => drawFencePiece(ctx, cx, cy, 'fencePost', color),
  fenceRail: (ctx, cx, cy, obj, color) => drawFencePiece(ctx, cx, cy, 'fenceRail', color),
  fenceRailV: (ctx, cx, cy, obj, color) => drawFencePiece(ctx, cx, cy, 'fenceRailV', color),
  palisadeStake: (ctx, cx, cy, obj, color) => drawFencePiece(ctx, cx, cy, 'palisadeStake', color),
};

/** Draws obj's custom sprite; returns false when it has none, so the caller draws its glyph. */
export function drawCustomSprite(ctx, cx, cy, obj, color) {
  const draw = CUSTOM_SPRITES[obj.data?.customSprite];
  if (!draw) return false;
  draw(ctx, cx, cy, obj, color);
  return true;
}
