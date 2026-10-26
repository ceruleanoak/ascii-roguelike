import { GRID } from '../../game/GameConfig.js';
import { getItemData } from '../../data/items.js';
import { wearsGoggles } from '../../systems/SunkenGlintSystem.js';
import { darkenColor } from '../../systems/roomFeatures.js';

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
// The Sunken Ship's Slow Glint: the same visible window on a cycle five times
// as long, so it blinks five times less often than any other glint.
export const SLOW_GLINT_CYCLE = CYCLE * 5;
const ACTIVE_WINDOW = 0.6;
const SPIN_START = 0.15;
const SPIN_LENGTH = 0.3;
const SPIN_ARC = Math.PI * 2 / 3;  // ~1/6 rotation across the mid window
const SPARKLE_COLOR = '#ffffcc';
// How much darker a Sunken Glint's find is drawn under the water (Goggles).
const SUBMERGED_DARKEN = 0.55;

export const GRASS_SPARKLE_SPEED = 1;
export const GLITTER_SPARKLE_SPEED = 2;

/**
 * Draws one sparkle centered on (cx, cy), or nothing if this position is
 * currently in the dead part of its cycle. The phase is hashed from the
 * position so neighbouring sparkles never blink in unison, and `speed`
 * multiplies the whole cycle — 2 halves every window above. `cycle`
 * lengthens only the dead air, leaving the visible window as it is.
 */
export function drawSparkle(renderer, cx, cy, speed = 1, cycle = CYCLE) {
  const phase = (((cx * 73856093) ^ (cy * 19349663)) >>> 0) % 1800 / 1000;
  const t = ((performance.now() / 1000 + phase) * speed) % cycle;
  if (t > ACTIVE_WINDOW) return;

  if (t < SPIN_START || t >= SPIN_START + SPIN_LENGTH) {
    // Pixel-sized dot — head and tail of the sparkle.
    renderer.drawEntity(cx, cy, '·', SPARKLE_COLOR);
  } else {
    const angle = ((t - SPIN_START) / SPIN_LENGTH) * SPIN_ARC;
    renderer.drawEntityRotated(cx, cy, '*', SPARKLE_COLOR, angle);
  }
}

/**
 * Glittering Rocks twinkle each frame. The rock glyph itself is baked into
 * the cached background layer, so the glint has to ride the foreground
 * pass — same reason campfires and charged metal are drawn there. It sits
 * up-right of the glyph's center, reading as light caught on a facet rather
 * than as something sitting on top of the rock.
 *
 * Surface pass only, deliberately: '5' rocks are generated into the
 * underground layer of an EXPLORE room (RoomGenerator's two cave passes) and
 * never onto a hut, dungeon or maze floor, so there is no interior PiP pass to
 * ship alongside this one.
 *
 * `shouldRender(obj)` is ExploreRenderer's plane-aware visibility check.
 */
/**
 * Sunken Glints twinkle out in a green Ocean's deep water at the tall-grass
 * tempo — the same "something is hidden here" tell, now behind a swim
 * instead of a cut. Centered on the tile, like the grass sparkle. Never on
 * an interior floor: glints are seeded by generateOceanTerrain and in the
 * Sunken Ship's hold (NeutralRenderer draws those).
 */
export function drawSunkenGlints(renderer, game, shouldRender) {
  const goggles = wearsGoggles(game);
  for (const obj of game.backgroundObjects) {
    if (!obj.sunkenGlint || obj.destroyed) continue;
    if (!shouldRender(obj)) continue;
    // Through Goggles, what the glint hides shows under the water, darkened.
    // The Slow Glint hides no find, so it keeps blinking.
    if (goggles && obj.sunkenContents) {
      const data = getItemData(obj.sunkenContents);
      renderer.drawEntity(
        obj.position.x + GRID.CELL_SIZE / 2,
        obj.position.y + GRID.CELL_SIZE / 2,
        obj.sunkenContents,
        darkenColor(data?.color ?? SPARKLE_COLOR, SUBMERGED_DARKEN)
      );
      continue;
    }
    drawSparkle(
      renderer,
      obj.position.x + GRID.CELL_SIZE / 2,
      obj.position.y + GRID.CELL_SIZE / 2,
      GRASS_SPARKLE_SPEED,
      obj.slowGlint ? SLOW_GLINT_CYCLE : CYCLE
    );
  }
}

export function drawGlitterSparkles(renderer, game, shouldRender) {
  for (const obj of game.backgroundObjects) {
    if (!obj.data?.showsGlitter || obj.destroyed) continue;
    if (!shouldRender(obj)) continue;
    drawSparkle(
      renderer,
      obj.position.x + GRID.CELL_SIZE * 0.75,
      obj.position.y + GRID.CELL_SIZE * 0.25,
      GLITTER_SPARKLE_SPEED
    );
  }
}
