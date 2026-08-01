import { GRID } from '../../game/GameConfig.js';

// Tripline render helpers, split out of ExploreRenderer.js to stay under its
// architecture budget — a standalone function taking `renderer`, matching the
// SniperEffects/SinkholeEffects pattern.
//
// `interior = true` is the HutInteriorOverlay path: the translate into interior
// coords is already applied to the ctx, so segments come from activeFloor (where
// WireSystem commits them) and player/preview coords — also interior-space —
// need no remapping.

// Segment colour per wire type; an unknown type falls back to the sticky green.
const WIRE_COLORS = { slime: '#88dd88', electric: '#00ffff' };

// The bead marking an end that has bitten into an anchor. Deliberately the same
// green for every wire type — it reads as "this end is attached", not as the
// wire's element, so a half-strung wire is legible at a glance: bead = anchored,
// bare end = still in the player's hand or still in the air.
const ORIGIN_COLOR = '#66ff66';
const ORIGIN_RADIUS = 3;

export function drawWires(renderer, game, interior = false) {
  const ctx = renderer.fgCtx;
  const triplines = (interior ? game.activeFloor?.triplines : game.currentRoom?.triplines) || [];

  const drawSeg = (seg, alpha) => {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = WIRE_COLORS[seg.wireType] || WIRE_COLORS.slime;
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(seg.x1, seg.y1);
    ctx.lineTo(seg.x2, seg.y2);
    ctx.stroke();
    // A committed segment is anchored at both ends and carries no flags; a
    // preview segment sets them per end, so only the settled ones get a bead.
    ctx.fillStyle = ORIGIN_COLOR;
    if (seg.anchored1 !== false) drawOrigin(ctx, seg.x1, seg.y1);
    if (seg.anchored2 !== false) drawOrigin(ctx, seg.x2, seg.y2);
    ctx.restore();
  };

  for (const seg of triplines) drawSeg(seg, 1.0);

  const preview = game.wireSystem?.getPreviewSegment();
  if (preview) drawSeg(preview, 0.7);

  // Red X above player — flashes when SPACE could neither anchor an end nor throw
  // one (mazes). WireSystem sets a brief timer; it ticks down each frame.
  if (game.wireSystem?.redXTimer > 0) {
    ctx.save();
    ctx.font = `${GRID.CELL_SIZE * 0.9}px 'Unifont', monospace`;
    ctx.fillStyle = '#ff0000';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      'X',
      game.player.position.x + game.player.width / 2,
      game.player.position.y - GRID.CELL_SIZE * 0.6
    );
    ctx.restore();
  }
}

function drawOrigin(ctx, x, y) {
  ctx.beginPath();
  ctx.arc(x, y, ORIGIN_RADIUS, 0, Math.PI * 2);
  ctx.fill();
}
