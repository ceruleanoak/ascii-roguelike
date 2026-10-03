import { GRID } from '../../game/GameConfig.js';

// FloatPlatformDraw — the thin white oval under a player floating on
// Floating Boots: reads as a platform the glyph stands on, rooted at the
// glyph's bottom edge. Drawn only while the float is actually holding the
// player up (charged boots AND liquid underfoot — see FloatingBootsSystem /
// PhysicsSystem), and blinks once the charge is nearly spent. One helper,
// called before the player glyph at every player draw site (surface,
// interiors, NEUTRAL, REST) so the platform reads identically on every plane.

const RADIUS_X = GRID.CELL_SIZE * 0.55;
const RADIUS_Y = 1.5;
const WARN_CHARGE = 5;      // seconds of float left when the blink starts
const BLINK_PERIOD = 0.15;  // seconds per on/off half-cycle

export function drawFloatPlatform(renderer, player) {
  if (!(player.floatCharge > 0) || !player.overLiquid) return;
  if (player.floatCharge <= WARN_CHARGE && Math.floor(player.statusBlinkTimer / BLINK_PERIOD) % 2 === 1) return;

  const ctx = renderer.fgCtx;
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(
    player.position.x + GRID.CELL_SIZE / 2,
    player.position.y + GRID.CELL_SIZE - RADIUS_Y,
    RADIUS_X, RADIUS_Y, 0, 0, Math.PI * 2
  );
  ctx.fill();
  ctx.restore();
}
