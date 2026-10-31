import { GRID, COLORS } from '../../game/GameConfig.js';

/**
 * Bottle Shelf — while the player is inside the Alchemy Lab, every carried
 * Bottle (Bottles and equipped slot Bottles alike) stands in a row just above
 * the lab's picture-in-picture panel, stacked by glyph with a small count,
 * so the whole collection is in view while brewing.
 *
 * Drawn by HutInteriorOverlay after its interior translate/clip is restored:
 * the shelf sits outside the panel, where the player never is, so it is not
 * a Frame Pass. Rows grow upward when there are more stacks than fit.
 */

const PITCH = GRID.CELL_SIZE * 2;      // glyph + its count
const ROW_STEP = GRID.CELL_SIZE * 1.25;
const MAX_ROW_WIDTH = GRID.WIDTH - GRID.CELL_SIZE * 2;
const COUNT_SCALE = 0.6;

export function drawBottleShelf(ctx, game, frame) {
  if (game.activeFloor?.hutKind !== 'alchemy') return;

  const stacks = [];
  const byChar = new Map();
  for (const ref of game.bottlesSystem.allRefs()) {
    const item = game.bottlesSystem.itemAt(ref);
    if (!item) continue;
    let stack = byChar.get(item.char);
    if (!stack) {
      stack = { item, count: 0 };
      byChar.set(item.char, stack);
      stacks.push(stack);
    }
    stack.count += item.count || 1;
  }
  if (stacks.length === 0) return;

  const perRow = Math.max(1, Math.floor(MAX_ROW_WIDTH / PITCH));
  const CS = GRID.CELL_SIZE;
  const centerX = frame.offsetX + frame.panelW / 2;
  const baseY = frame.offsetY - CS;

  ctx.save();
  ctx.font = `${CS}px 'Unifont', monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let start = 0, row = 0; start < stacks.length; start += perRow, row++) {
    const rowStacks = stacks.slice(start, start + perRow);
    const left = centerX - (rowStacks.length * PITCH) / 2;
    const y = baseY - row * ROW_STEP;
    rowStacks.forEach(({ item, count }, i) => {
      const x = left + i * PITCH + CS * 0.75;
      ctx.fillStyle = item.data.color || COLORS.ITEM;
      ctx.fillText(item.char, x, y);
      if (count > 1) {
        ctx.save();
        ctx.translate(x + CS * 0.75, y + CS * 0.25);
        ctx.scale(COUNT_SCALE, COUNT_SCALE);
        ctx.fillStyle = COLORS.TEXT;
        ctx.fillText(String(count), 0, 0);
        ctx.restore();
      }
    });
  }
  ctx.restore();
}
