/**
 * CharonDraw — REST pass for Charon (CharonSystem): his glyph at the north
 * exit and the toll glyphs flying from the player into him. REST-only, so
 * there is no interior PiP counterpart.
 */

import { GRID } from '../../game/GameConfig.js';

export function drawCharon(renderer, game) {
  const charon = game.charon;
  if (!charon) return;
  const C = GRID.CELL_SIZE;
  charon.npc.render(renderer.fgCtx, (gx, gy) => ({ x: gx * C, y: gy * C }));

  const toX = charon.npc.position.x + C / 2;
  const toY = charon.npc.position.y + C / 2;
  const ctx = renderer.fgCtx;
  ctx.save();
  ctx.font = `${C}px 'Unifont', monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const f of charon.flights) {
    // Ease-in so the glyph is pulled toward him rather than drifting.
    const k = f.t * f.t;
    const x = f.fromX + (toX - f.fromX) * k;
    // A shallow arc lifts the glyph off the player before it is drawn in.
    const y = f.fromY + (toY - f.fromY) * k - Math.sin(f.t * Math.PI) * C;
    ctx.globalAlpha = 1 - k * 0.6;
    ctx.fillStyle = f.color;
    ctx.fillText(f.char, x, y);
  }
  ctx.restore();
}
