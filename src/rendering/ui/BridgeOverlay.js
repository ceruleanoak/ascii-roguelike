import { GRID } from '../../game/GameConfig.js';
import { INGREDIENTS } from '../../data/items.js';
import { BRIDGE_MATERIALS } from '../../systems/RidgeSystem.js';
import { spectaclesTransformString, isSpectaclesActive } from '../../data/cipher.js';

/**
 * BridgeOverlay — the Ridge Bridge Worker's donation popup (RidgeSystem).
 *
 * Drawn via the PauseSystem modal render hook, above the frozen frame, on
 * the same dim + white-bordered panel as ShopOverlay so the world (player,
 * enemies, the chasm) never shows through or draws over it.
 *
 * One row per BRIDGE_MATERIALS entry: the material glyph, then one pip per
 * unit the bridge needs. Given pips are lit in the material's color, the
 * pips the player's pile would give next are yellow, the rest dark. A single
 * DONATE label sits under the rows with the ▼ cursor, dimmed when the pile
 * has nothing the bridge still needs.
 *
 * COMPLIANCE RULE (non-instructive UI): no key hints, no "X → Y", no status
 * sentences. Glyphs, pips, the cursor, one bare label and small dim
 * (#888888) numbers only.
 */

const PIP_W = 4;
const PIP_GAP = 2;
const GIVEN_DONE = '#44bb66';  // a material whose need is met
const PENDING = '#ffff00';     // what the pile would give on DONATE
const EMPTY = '#333333';

export class BridgeOverlay {
  render(renderer, game, state) {
    const room = game.currentRoom;
    if (!room) return;
    const ctx = renderer.uiCtx;
    const cs = GRID.CELL_SIZE;
    const donated = room.bridgeDonated ?? {};
    const have = game.ridgeSystem.getHaveCounts();

    const maxNeed = Math.max(...BRIDGE_MATERIALS.map(m => m.need));
    const barW = maxNeed * (PIP_W + PIP_GAP) - PIP_GAP;
    const rowH = cs * 1.4;
    const numW = cs * 3;

    const glyphX = cs * 1.2;
    const barX = glyphX + cs * 1.5;
    const numX = barX + barW + cs * 0.75;
    const boxW = Math.ceil(numX + numW);
    const boxH = Math.ceil(cs * 1.2 + BRIDGE_MATERIALS.length * rowH + cs * 2.6);
    const boxX = Math.floor((GRID.WIDTH - boxW) / 2);
    const boxY = Math.floor((GRID.HEIGHT - boxH) / 2);

    ctx.save();
    ctx.textBaseline = 'middle';
    this._drawPanel(ctx, boxX, boxY, boxW, boxH);
    ctx.globalAlpha = this._fadeProgress(state);

    let canDonate = false;
    for (let i = 0; i < BRIDGE_MATERIALS.length; i++) {
      const mat = BRIDGE_MATERIALS[i];
      const given = Math.min(donated[mat.key] ?? 0, mat.need);
      const pending = Math.min(have[mat.key] ?? 0, mat.need - given);
      if (pending > 0) canDonate = true;
      const done = given >= mat.need;
      const color = INGREDIENTS[mat.char]?.color ?? '#cccccc';
      const y = boxY + cs * 1.2 + i * rowH + rowH / 2 - cs * 0.3;

      ctx.font = `${cs}px 'Unifont', monospace`;
      ctx.textAlign = 'center';
      ctx.fillStyle = done ? GIVEN_DONE : color;
      ctx.fillText(mat.char, boxX + glyphX, y);

      for (let p = 0; p < mat.need; p++) {
        ctx.fillStyle = p < given ? (done ? GIVEN_DONE : color)
          : p < given + pending ? PENDING
          : EMPTY;
        ctx.fillRect(boxX + barX + p * (PIP_W + PIP_GAP), Math.round(y - cs * 0.3), PIP_W, Math.round(cs * 0.6));
      }

      ctx.font = `${cs * 0.75}px 'Unifont', monospace`;
      ctx.textAlign = 'left';
      ctx.fillStyle = '#888888';
      ctx.fillText(`${given}/${mat.need}`, boxX + numX, y);
    }

    const labelY = boxY + boxH - cs * 1.1;
    const midX = boxX + boxW / 2;
    ctx.textAlign = 'center';
    if (canDonate) {
      ctx.font = `${cs * 0.9}px 'Unifont', monospace`;
      ctx.fillStyle = '#ffff00';
      ctx.fillText('▼', midX, labelY - cs * 0.9);
    }
    ctx.font = `${cs}px 'Unifont', monospace`;
    ctx.fillStyle = canDonate ? '#ffff00' : '#555555';
    ctx.fillText(spectaclesTransformString('DONATE', isSpectaclesActive(game)), midX, labelY);

    ctx.restore();
  }

  _drawPanel(ctx, x, y, w, h) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(0, 0, GRID.WIDTH, GRID.HEIGHT);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.92)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }

  // Fades the contents in across the system's input lockout, as ShopOverlay.
  _fadeProgress(state) {
    const now = performance.now();
    const openedAt = state.openedAt ?? now;
    const readyAt = state.inputReadyAt ?? now;
    return readyAt > openedAt
      ? Math.min(1, Math.max(0, (now - openedAt) / (readyAt - openedAt)))
      : 1;
  }
}
