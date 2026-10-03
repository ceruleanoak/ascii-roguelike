/**
 * CursedRecipeReveal - the recipe a just-read cursed recipe scroll shows.
 *
 * Laid out exactly like the REST crafting station — [left] [result] [right] —
 * so it reads as a recipe without a word of explanation. Screen-space UI
 * (centered, like the pickup message), so it has no interior PiP pass.
 * State and timing live in CursedRunSystem.activeScrollReveal().
 */

import { GRID } from '../../game/GameConfig.js';
import { INGREDIENTS, ITEMS } from '../../data/items.js';

const BRACKET_COLOR = '#aa66aa';
const SLOT_GAP_CELLS = 4;          // center-to-center spacing of the three slots
const Y_OFFSET = -GRID.CELL_SIZE * 2;

function glyphColor(char) {
  return INGREDIENTS[char]?.color ?? ITEMS[char]?.color ?? '#ffffff';
}

export function drawCursedRecipeReveal(renderer, game) {
  const recipe = game.cursedRunSystem.activeScrollReveal();
  if (!recipe) return;

  const C = GRID.CELL_SIZE;
  const ctx = renderer.fgCtx;
  const cx = GRID.WIDTH / 2;
  const cy = GRID.HEIGHT / 2 + Y_OFFSET;
  const slots = [recipe.left, recipe.result, recipe.right];

  ctx.save();
  ctx.font = `${C * 1.5}px 'Unifont', monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  slots.forEach((char, i) => {
    const x = cx + (i - 1) * SLOT_GAP_CELLS * C;
    ctx.fillStyle = BRACKET_COLOR;
    ctx.fillText('[', x - C * 1.2, cy);
    ctx.fillText(']', x + C * 1.2, cy);
    ctx.fillStyle = glyphColor(char);
    ctx.fillText(char, x, cy);
  });
  ctx.restore();
}
