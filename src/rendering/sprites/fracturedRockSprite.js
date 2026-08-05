import { GRID } from '../../game/GameConfig.js';

// Five hand-authored polygon stages for the Fractured Rock — a callback to the
// original arcade Centipede's stage-damaged mushrooms. Stage 0 reads like the
// ordinary Rock silhouette; each later stage bites another chunk out of the
// edge so the object visibly crumbles as it takes damage, bottoming out at a
// small jagged shard right before it breaks. Vertices are unit offsets from
// the cell center, scaled by half the cell size at draw time — same technique
// as ExploreRenderer._drawDeflectorTriangle.
const FRACTURED_ROCK_STAGES = [
  // Stage 0 — intact boulder: rounded octagon.
  [
    [-0.45, -0.85], [0.45, -0.85], [0.85, -0.45], [0.85, 0.45],
    [0.45, 0.85], [-0.45, 0.85], [-0.85, 0.45], [-0.85, -0.45],
  ],
  // Stage 1 — first chip: top-right corner bitten off.
  [
    [-0.45, -0.85], [0.15, -0.85], [0.0, -0.5], [0.85, -0.45], [0.85, 0.45],
    [0.45, 0.85], [-0.45, 0.85], [-0.85, 0.45], [-0.85, -0.45],
  ],
  // Stage 2 — second chip: bottom-left corner also bitten, silhouette shrinks.
  [
    [-0.45, -0.85], [0.15, -0.85], [0.0, -0.5], [0.85, -0.45], [0.75, 0.35],
    [0.45, 0.75], [-0.15, 0.85], [-0.4, 0.5], [-0.85, 0.45], [-0.85, -0.45],
  ],
  // Stage 3 — heavily cracked: jagged, noticeably smaller chunk.
  [
    [-0.35, -0.65], [0.1, -0.7], [0.05, -0.35], [0.6, -0.3], [0.5, 0.25],
    [0.2, 0.55], [-0.15, 0.6], [-0.4, 0.3], [-0.55, -0.1],
  ],
  // Stage 4 — near-collapse: small jagged shard, about to crumble.
  [
    [-0.2, -0.35], [0.15, -0.4], [0.3, -0.05], [0.15, 0.3],
    [-0.15, 0.35], [-0.35, 0.05],
  ],
];

export function drawFracturedRock(ctx, cx, cy, stage, color) {
  const stageIndex = Math.max(0, Math.min(FRACTURED_ROCK_STAGES.length - 1, stage || 0));
  const verts = FRACTURED_ROCK_STAGES[stageIndex];
  const h = GRID.CELL_SIZE * 0.5;
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx + verts[0][0] * h, cy + verts[0][1] * h);
  for (let i = 1; i < verts.length; i++) {
    ctx.lineTo(cx + verts[i][0] * h, cy + verts[i][1] * h);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
