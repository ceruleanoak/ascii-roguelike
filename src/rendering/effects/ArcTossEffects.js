import { GRID } from '../../game/GameConfig.js';

/**
 * Spinning-toss arc animations: a glyph flies a north-peaked parabola from
 * a source to a destination (donation, well offering, coin trade), spinning
 * through a short frame cycle as it travels. Shared by ExploreRenderer's
 * surface pass and HutInteriorOverlay's PiP path (ctx is already translated
 * to interior coords when called from there).
 */

const ARC_DURATION = 0.55; // must match the driving system's ARC_DURATION (e.g. WellSystem)
const ARC_PEAK = (cs) => cs * 4;

function drawArcFrame(ctx, anim, frames, fillStyle, shadowColor) {
  const t = Math.min(1, anim.t / ARC_DURATION);
  const x = anim.startX + (anim.endX - anim.startX) * t;
  // Parabolic arc peaking northward (negative y is up). 4t(1-t) hits 1 at t=0.5.
  const arcLift = 4 * t * (1 - t);
  const baseY = anim.startY + (anim.endY - anim.startY) * t;
  const y = baseY - ARC_PEAK(GRID.CELL_SIZE) * arcLift;
  const frame = frames[Math.floor(anim.spinPhase) % frames.length];

  ctx.save();
  ctx.font = `${GRID.CELL_SIZE * 1.25}px 'Unifont', monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = fillStyle;
  ctx.shadowColor = shadowColor;
  ctx.shadowBlur = 6;
  ctx.fillText(frame, x, y);
  ctx.restore();
}

/** Camp-NPC donation arc — the offered item's own char, spinning as it travels. */
export function drawDonationArc(renderer, anim) {
  drawArcFrame(renderer.fgCtx, anim, [anim.char, 'O', '|', 'O'], '#ccaa66', '#aa8833');
}

/** Spinning wallet-coin arc (player → recipient): fisherman coin trade, Weapons Master pay. */
export function drawCoinArc(renderer, anim) {
  drawArcFrame(renderer.fgCtx, anim, ['c', 'O', '|', 'O'], '#ffcc66', '#ffaa33');
}

/**
 * Well ritual: spinning Infused/Lucky/raw coin arc + the white flash that
 * fires once the coin reaches the well center.
 */
export function drawWellRitual(renderer, game) {
  const ctx = renderer.fgCtx;
  const anim = game.wellCoinAnim;

  if (anim) {
    // Spin frames + color depend on the offering type. Infused (¤) → warm gold;
    // Lucky (★) → bright yellow with star frames; raw (c) → dull copper.
    let frames, fillStyle, shadowColor;
    if (anim.offeringType === 'lucky') {
      frames = ['★', '✦', '|', '✦'];
      fillStyle = '#ffff66';
      shadowColor = '#ffdd33';
    } else if (anim.offeringType === 'raw') {
      frames = ['c', 'o', '|', 'o'];
      fillStyle = '#cc9955';
      shadowColor = '#aa6633';
    } else {
      frames = ['¤', 'O', '|', 'O'];
      fillStyle = '#ffcc66';
      shadowColor = '#ffaa33';
    }
    drawArcFrame(ctx, anim, frames, fillStyle, shadowColor);
  }

  if (game.wellFlashTimer > 0 && game.wellFlashDuration > 0) {
    const alpha = (game.wellFlashTimer / game.wellFlashDuration) * 0.85;
    ctx.save();
    ctx.fillStyle = `rgba(255, 240, 200, ${alpha})`;
    ctx.fillRect(0, 0, GRID.WIDTH, GRID.HEIGHT);
    ctx.restore();
  }
}
