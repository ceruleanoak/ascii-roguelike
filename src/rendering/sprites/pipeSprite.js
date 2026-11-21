import { GRID } from '../../game/GameConfig.js';

// Pipe pieces for the Alchemy Lab's vapour pipe (src/data/alchemyLab.js). Box-drawing
// glyphs are half width in Unifont, so a run of them reads as dashes (rulebook G3); these
// span the cell and meet their neighbours, so the run reads as one copper pipe. A collar
// at each cell edge marks the joints. Filled rects only, no strokes (G5).
//
// (cx, cy) is the cell centre, as for every customSprite.
export function drawPipePiece(ctx, cx, cy, shape, color) {
  const cs = GRID.CELL_SIZE;
  const left = Math.round(cx - cs / 2);
  const top = Math.round(cy - cs / 2);
  const midX = Math.round(cx);
  const midY = Math.round(cy);
  ctx.save();
  ctx.fillStyle = color;
  switch (shape) {
    case 'pipeH':
      ctx.fillRect(left, midY - 1, cs, 3);
      ctx.fillRect(left + cs - 2, midY - 2, 2, 5);
      break;
    case 'pipeV':
      ctx.fillRect(midX - 1, top, 3, cs);
      ctx.fillRect(midX - 2, top, 5, 2);
      break;
    case 'pipeElbowWN':
      // In from the west, out to the north, with the bend filled so it doesn't kink.
      ctx.fillRect(left, midY - 1, cs / 2 + 2, 3);
      ctx.fillRect(midX - 1, top, 3, cs / 2 + 2);
      break;
  }
  ctx.restore();
}
