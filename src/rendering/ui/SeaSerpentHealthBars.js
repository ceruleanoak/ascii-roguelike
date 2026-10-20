/**
 * SeaSerpentHealthBars — one HP bar per Sea Serpent, riding above its head.
 * Every segment of a serpent spends the same pool (SeaSerpentSystem), so the
 * pool is drawn once per serpent rather than per segment. Bar shape follows
 * the boss bars in BossRenderer / HoardmawRenderer.
 */

import { GRID } from '../../game/GameConfig.js';

const BAR_W = GRID.CELL_SIZE * 3;
const BAR_H = 4;
const BAR_BACK = '#333333';
const BAR_FILL = '#2fbf8f';

/** Draws each live serpent's HP bar over its head. `room.seaSerpents` only. */
export function drawSeaSerpentHealthBars(renderer, room) {
  if (!room?.seaSerpents?.length) return;
  const ctx = renderer.fgCtx;
  const cs = GRID.CELL_SIZE;
  for (const serpent of room.seaSerpents) {
    const head = serpent.units[0].position;
    const barX = head.x + cs / 2 - BAR_W / 2;
    const barY = head.y - cs * 0.6;
    ctx.fillStyle = BAR_BACK;
    ctx.fillRect(barX, barY, BAR_W, BAR_H);
    ctx.fillStyle = BAR_FILL;
    ctx.fillRect(barX, barY, BAR_W * Math.max(0, serpent.hp / serpent.maxHp), BAR_H);
  }
}
