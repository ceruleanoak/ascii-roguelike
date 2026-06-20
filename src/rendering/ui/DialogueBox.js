import { GRID } from '../../game/GameConfig.js';
import { spectaclesTransformString, isSpectaclesActive } from '../../data/cipher.js';

/**
 * DialogueBox — bordered bottom-center panel for NPC speech.
 *
 * Deliberately styled apart from the narrator/genie voice: the narrator owns
 * large center-screen VentureArcade text; NPC lines sit in this framed box in
 * Unifont, led by the speaker's glyph in their own color.
 */
export class DialogueBox {
  constructor(renderer) {
    this.renderer = renderer;
  }

  render(game) {
    const state = game.dialogueSystem?.getState();
    if (!state) return;

    const ctx = this.renderer.fgCtx;
    const cs = GRID.CELL_SIZE;
    const boxW = Math.floor(GRID.WIDTH * 0.72);
    const boxH = Math.floor(cs * 4.5);
    const boxX = Math.floor((GRID.WIDTH - boxW) / 2);
    const boxY = GRID.HEIGHT - boxH - Math.floor(cs * 1.5);

    const npc = state.npc;
    const line = spectaclesTransformString(
      state.lines[state.lineIndex] ?? '',
      isSpectaclesActive(game)
    );
    const hasMore = state.lineIndex < state.lines.length - 1;

    ctx.save();

    // Panel
    ctx.globalAlpha = 0.88;
    ctx.fillStyle = '#000000';
    ctx.fillRect(boxX, boxY, boxW, boxH);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#888888';
    ctx.lineWidth = 1;
    ctx.strokeRect(boxX + 0.5, boxY + 0.5, boxW - 1, boxH - 1);

    // Speaker glyph in the NPC's own color, boxed at the left edge
    const glyphCellW = cs * 2.5;
    ctx.strokeRect(boxX + 0.5, boxY + 0.5, glyphCellW, boxH - 1);
    ctx.font = `${cs * 1.6}px 'Unifont', monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = npc?.color || '#ffffff';
    ctx.fillText(npc?.char ?? '?', boxX + glyphCellW / 2, boxY + boxH / 2);

    // Speech line (Unifont — never the narrator's VentureArcade)
    ctx.font = `${cs}px 'Unifont', monospace`;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#dddddd';
    const textX = boxX + glyphCellW + cs;
    const textW = boxW - glyphCellW - cs * 2;
    this.renderer.drawWrappedText(ctx, line, textX, boxY + cs * 1.4, textW, cs * 1.2);

    // Continue cue, bottom-right: '>' while more lines remain, '·' on the last
    ctx.textAlign = 'right';
    ctx.fillStyle = '#888888';
    const blink = Math.sin(performance.now() / 250) > 0 ? 1 : 0.35;
    ctx.globalAlpha = blink;
    ctx.fillText(hasMore ? '>' : '·', boxX + boxW - cs * 0.6, boxY + boxH - cs * 0.8);

    ctx.restore();
  }
}
