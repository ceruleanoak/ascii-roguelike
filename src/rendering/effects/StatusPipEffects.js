import { GRID } from '../../game/GameConfig.js';

// StatusPipEffects — small stack-count dots drawn above an entity's glyph,
// one row per active stackable status effect (see systems/StatusEffectVisuals.js
// for what counts as "active" and each effect's color). Shared by Enemy.js
// (computePipRows, stack-driven) and Player.js (computePlayerPipRows,
// fixed 1-dot rows) via the same getStatusPipRows() duck-typed accessor.
// Follows the SniperEffects.js shape: a standalone drawXxx(renderer, entity)
// function rather than living inline in ExploreRenderer.js, which is at its
// architecture budget.

const PIP_RADIUS = 1.5; // matches the existing drawDizzyOrbitals circle convention
const PIP_PITCH = 4; // horizontal spacing between dots in the same row
const ROW_HEIGHT = 6; // vertical spacing between stacked rows

// Rows are left-aligned (not centered) so a 1-stack row and a 3-stack row
// share the same starting x — centering would make single-stack rows jitter
// sideways relative to full ones. Rows stack upward in application order:
// the first effect applied sits in the row closest to the glyph.
export function drawStatusPips(renderer, entity) {
  const rows = entity.getStatusPipRows?.();
  if (!rows || rows.length === 0) return;

  const ctx = renderer.fgCtx;
  const startX = entity.position.x + 2;
  const baseY = entity.position.y + GRID.CELL_SIZE / 2 - GRID.CELL_SIZE - 4;

  ctx.save();
  rows.forEach((row, rowIndex) => {
    const y = baseY - rowIndex * ROW_HEIGHT;
    ctx.fillStyle = row.color;
    for (let i = 0; i < row.stacks; i++) {
      ctx.beginPath();
      ctx.arc(startX + i * PIP_PITCH, y, PIP_RADIUS, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  ctx.restore();
}
