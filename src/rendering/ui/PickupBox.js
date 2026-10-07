import { GRID, COLORS } from '../../game/GameConfig.js';

/**
 * PickupBox — the small bordered box, bottom-center, that says what just came
 * to hand (game.pickupMessage, queued by MenuSystem.showPickupMessage /
 * announceItem).
 *
 * An item shows its glyph in its own color, plus its name the first time this
 * run; a plain notice ('FIREPLACE LIT') shows text only. It floats up a few
 * pixels as it arrives and fades over its last beat.
 *
 * Deliberately not center-screen: large center text belongs to the THREE's
 * voice alone (CLAUDE.md, Critical UI Constraints). Never run through the
 * Spectacles cipher — it reports what the player holds, not in-world writing,
 * and equipping Spectacles would otherwise garble its own announcement.
 */
const RISE_PX = 6;
const RISE_S = 0.15;
const FADE_S = 0.3;

export class PickupBox {
  constructor(renderer) {
    this.renderer = renderer;
  }

  render(game) {
    const msg = game.pickupMessage;
    if (!msg || game.pickupMessageTimer <= 0) return;

    // The UI layer, not fg: camera zoom/shake CSS-transform only bg + fg
    // (RenderController.applyCameraEffects), so the box holds still on screen.
    const ctx = this.renderer.uiCtx;
    const cs = GRID.CELL_SIZE;
    const elapsed = (msg.shownFor ?? game.pickupMessageTimer) - game.pickupMessageTimer;
    const rise = Math.min(elapsed / RISE_S, 1);
    const alpha = Math.min(rise, game.pickupMessageTimer / FADE_S, 1);

    ctx.save();
    ctx.font = `${cs}px 'Unifont', monospace`;
    const glyphW = msg.glyph ? cs * 1.5 : 0;
    const textW = msg.text ? ctx.measureText(msg.text).width : 0;
    const gap = msg.glyph && msg.text ? cs * 0.75 : 0;
    const padX = cs * 0.75;
    const boxW = Math.ceil(Math.min(glyphW + gap + textW + padX * 2, GRID.WIDTH * 0.8));
    const boxH = Math.floor(cs * 2.25);
    const boxX = Math.floor((GRID.WIDTH - boxW) / 2);
    // Sits just above the NPC speech panel while one is open, otherwise near
    // the bottom edge where that panel would be.
    const bottom = game.dialogueSystem?.getState()
      ? GRID.HEIGHT - Math.floor(cs * 6.5)
      : GRID.HEIGHT - Math.floor(cs * 1.5);
    const boxY = Math.floor(bottom - boxH + (1 - rise) * RISE_PX);

    ctx.globalAlpha = alpha * 0.88;
    ctx.fillStyle = '#000000';
    ctx.fillRect(boxX, boxY, boxW, boxH);
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = '#888888';
    ctx.lineWidth = 1;
    ctx.strokeRect(boxX + 0.5, boxY + 0.5, boxW - 1, boxH - 1);

    ctx.textBaseline = 'middle';
    const midY = boxY + boxH / 2;
    let x = boxX + padX;
    if (msg.glyph) {
      ctx.font = `${cs * 1.5}px 'Unifont', monospace`;
      ctx.textAlign = 'center';
      ctx.fillStyle = msg.color || COLORS.ITEM;
      ctx.fillText(msg.glyph, x + glyphW / 2, midY);
      x += glyphW + gap;
    }
    if (msg.text) {
      ctx.font = `${cs}px 'Unifont', monospace`;
      ctx.textAlign = 'left';
      ctx.fillStyle = msg.glyph ? '#dddddd' : (msg.color || COLORS.ITEM);
      ctx.fillText(msg.text, x, midY, boxW - (x - boxX) - padX);
    }

    ctx.restore();
  }
}
