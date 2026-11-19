import { GRID } from '../../game/GameConfig.js';

/**
 * DialogueBox — bordered bottom-center panel for NPC speech.
 *
 * Deliberately styled apart from the narrator/genie voice: the narrator owns
 * large center-screen VentureArcade text; NPC lines sit in this framed box in
 * Unifont, led by the speaker's glyph in their own color.
 *
 * Never run through the Spectacles cipher. Spectacles decode what the player
 * SEES (written glyphs, UI text, maze covers) — NPC lines represent speech
 * the player HEARS, so they stay in plain Latin regardless of equip state.
 */
export class DialogueBox {
  constructor(renderer) {
    this.renderer = renderer;
  }

  /**
   * Draws the line on screen. `ctx` defaults to the foreground layer; a modal
   * that answers inside its own menu (the Weapons Master's, `drawsDialogue`)
   * draws it on the UI layer over its dim instead, so the foreground pass
   * skips it while that modal is open.
   */
  render(game, ctx = null) {
    const state = game.dialogueSystem?.getState();
    if (!state) return;
    if (!ctx && game.pauseSystem?.activeModal?.drawsDialogue) return;

    ctx = ctx ?? this.renderer.fgCtx;
    const cs = GRID.CELL_SIZE;
    const boxW = Math.floor(GRID.WIDTH * 0.72);
    const glyphCellW = cs * 2.5;
    const textW = boxW - glyphCellW - cs * 2;

    const npc = state.npc;
    const line = state.lines[state.lineIndex] ?? '';
    const hasMore = state.lineIndex < state.lines.length - 1;

    ctx.save();

    // Wrap first so the box can size to the speech: rows run top-down from
    // TEXT_TOP, and a line longer than three rows grows the box upward
    // instead of spilling over its top edge.
    ctx.font = `${cs}px 'Unifont', monospace`;
    const rows = this.renderer.wrapLines(ctx, line, textW);
    const rowH = cs * 1.2;
    const TEXT_TOP = cs * 1.4;
    const boxH = Math.floor(Math.max(cs * 4.5, TEXT_TOP + (rows.length - 1) * rowH + cs * 1.3));
    const boxX = Math.floor((GRID.WIDTH - boxW) / 2);
    const boxY = GRID.HEIGHT - boxH - Math.floor(cs * 1.5);

    // Panel
    ctx.globalAlpha = 0.88;
    ctx.fillStyle = '#000000';
    ctx.fillRect(boxX, boxY, boxW, boxH);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#888888';
    ctx.lineWidth = 1;
    ctx.strokeRect(boxX + 0.5, boxY + 0.5, boxW - 1, boxH - 1);

    // Speaker glyph in the NPC's own color, boxed at the left edge
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
    rows.forEach((row, i) => ctx.fillText(row, textX, boxY + TEXT_TOP + i * rowH));

    // Continue cue, bottom-right: '>' while more lines remain, '·' on the last
    ctx.textAlign = 'right';
    ctx.fillStyle = '#888888';
    const blink = Math.sin(performance.now() / 250) > 0 ? 1 : 0.35;
    ctx.globalAlpha = blink;
    ctx.fillText(hasMore ? '>' : '·', boxX + boxW - cs * 0.6, boxY + boxH - cs * 0.8);

    ctx.restore();
  }
}
