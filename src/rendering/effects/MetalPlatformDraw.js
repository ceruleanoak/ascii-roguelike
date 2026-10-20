import { GRID } from '../../game/GameConfig.js';

// MetalPlatformDraw — the Metal Platform (MetalPlatformSystem): a steel plate
// drawn over the lava it is crossing, one '=' plate seam per cell so it reads
// as riveted metal at the same grid scale as everything else. A ground Frame
// Pass: under items, enemies and the player standing on it.

const PLATE_COLOR = '#3a3f47';
const SEAM_COLOR = '#a8b0bc';

export function drawMetalPlatform(renderer, game) {
  const platform = game.currentRoom?.metalPlatform;
  if (!platform) return;
  const CS = GRID.CELL_SIZE;
  const ctx = renderer.fgCtx;
  ctx.fillStyle = PLATE_COLOR;
  ctx.fillRect(platform.x, platform.y, platform.w, platform.h);
  ctx.strokeStyle = SEAM_COLOR;
  ctx.lineWidth = 1;
  ctx.strokeRect(platform.x + 0.5, platform.y + 0.5, platform.w - 1, platform.h - 1);
  for (let y = platform.y; y < platform.y + platform.h; y += CS) {
    for (let x = platform.x; x < platform.x + platform.w; x += CS) {
      renderer.drawEntity(x + CS / 2, y + CS / 2, '=', SEAM_COLOR);
    }
  }
}
