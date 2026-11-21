import { GRID } from '../../game/GameConfig.js';

// Fence and palisade pieces for Yards (src/data/yards.js). Their glyphs (─ │ ╥ ⍿)
// are half width in Unifont, so a run of them read as dashes and dots (rulebook
// G3). These span the whole cell and meet their neighbours, so a run reads as
// one fence. Filled rects only, no strokes (G5).
//
// (cx, cy) is the cell centre, as for every customSprite.
export function drawFencePiece(ctx, cx, cy, shape, color) {
  const cs = GRID.CELL_SIZE;
  const left = Math.round(cx - cs / 2);
  const top = Math.round(cy - cs / 2);
  const midX = Math.round(cx);
  ctx.save();
  ctx.fillStyle = color;
  switch (shape) {
    case 'fencePost':
      // A post with both rails running through it, so it joins the rails either side.
      ctx.fillRect(midX - 2, top + 3, 4, cs - 4);
      ctx.fillRect(left, top + 6, cs, 2);
      ctx.fillRect(left, top + 11, cs, 2);
      break;
    case 'fenceRail':
      ctx.fillRect(left, top + 6, cs, 2);
      ctx.fillRect(left, top + 11, cs, 2);
      break;
    case 'fenceRailV':
      // A rail seen running away from the viewer: one bar with a cross-piece, so a
      // run reads as a fence and never as two blades of Tall Grass (`||`, rulebook G2).
      ctx.fillRect(midX - 1, top, 3, cs);
      ctx.fillRect(midX - 4, top + 7, 9, 2);
      break;
    case 'palisadeStake':
      // One sharpened log per cell: a stepped point over a body nearly the cell's
      // width, so a run stands as one wall of logs with a thin seam between them.
      ctx.fillRect(midX - 1, top, 2, 2);
      ctx.fillRect(midX - 3, top + 2, 6, 2);
      ctx.fillRect(midX - 5, top + 4, 10, 2);
      ctx.fillRect(left + 1, top + 6, cs - 2, cs - 6);
      break;
  }
  ctx.restore();
}
