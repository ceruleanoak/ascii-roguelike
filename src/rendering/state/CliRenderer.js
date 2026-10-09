/**
 * CliRenderer — draws the CLI (GAME_STATES.CLI): a black screen, Unifont,
 * everything centered. The prompt is a prominent `>` with a blinking
 * cursor; tables are borderless text with the selected row in yellow.
 * Non-instructive: no hint footers, no headers — bare labels only.
 */

import { GRID, COLORS } from '../../game/GameConfig.js';
import { rowValue } from '../../systems/cliTables.js';
import { drawUnicodeTable } from '../ui/UnicodeTable.js';

const SELECTED = '#ffff00';
const DIM = '#999999';
const TEXT = '#ffffff';
const VISIBLE_ROWS = 15;

const cursorOn = () => Math.floor(performance.now() / 500) % 2 === 0;

export class CliRenderer {
  constructor(renderer) {
    this.renderer = renderer;
  }

  render(game) {
    const r = this.renderer;
    if (r.backgroundDirty) {
      r.clearBackground(COLORS.BACKGROUND);
      r.backgroundDirty = false;
    }
    r.clearForeground();

    const cli = game.cliSystem;
    const frame = cli.top();
    const ctx = r.fgCtx;
    const cs = GRID.CELL_SIZE;
    ctx.save();
    ctx.textBaseline = 'middle';
    ctx.font = `${cs}px 'Unifont', monospace`;

    if (!frame) this._drawPrompt(ctx, cli, cs);
    else if (frame.kind === 'table') this._drawTable(ctx, cli.rows(), frame.index, cs);
    else if (frame.kind === 'text') this._drawText(ctx, frame, cs);
    else drawUnicodeTable(ctx, frame.glyphs, frame.index);
    ctx.restore();
  }

  _drawPrompt(ctx, cli, cs) {
    const midY = GRID.HEIGHT / 2;
    // Measure with a fixed-width cursor slot so the line doesn't jitter as it blinks.
    const line = `> ${cli.buffer}`;
    const big = cs * 1.5;
    ctx.font = `${big}px 'Unifont', monospace`;
    const width = ctx.measureText(line + '█').width;
    const left = GRID.WIDTH / 2 - width / 2;
    ctx.textAlign = 'left';
    ctx.fillStyle = TEXT;
    ctx.fillText(line, left, midY);
    if (cursorOn()) ctx.fillText('█', left + ctx.measureText(line).width, midY);

    if (cli.reply) {
      ctx.font = `${cs}px 'Unifont', monospace`;
      ctx.textAlign = 'center';
      ctx.fillStyle = DIM;
      ctx.fillText(cli.reply, GRID.WIDTH / 2, midY + big * 1.5);
    }
  }

  /** A window of rows around the selection; a label and its value sit either side of center. */
  _drawTable(ctx, rows, index, cs) {
    const rowH = cs * 1.5;
    const first = Math.max(0, Math.min(index - Math.floor(VISIBLE_ROWS / 2), rows.length - VISIBLE_ROWS));
    const shown = rows.slice(first, first + VISIBLE_ROWS);
    const top = GRID.HEIGHT / 2 - ((shown.length - 1) * rowH) / 2;
    const midX = GRID.WIDTH / 2;
    shown.forEach((row, i) => {
      const y = top + i * rowH;
      const selected = first + i === index;
      const color = selected ? SELECTED : (row.color ?? DIM);
      const value = rowValue(row);
      ctx.fillStyle = color;
      if (row.label && value) {
        ctx.textAlign = 'right';
        ctx.fillText(row.label, midX - cs / 2, y);
        ctx.textAlign = 'left';
        ctx.fillStyle = row.valueColor ?? color;
        ctx.fillText(value, midX + cs / 2, y);
      } else {
        ctx.textAlign = 'center';
        ctx.fillText(row.label || value, midX, y);
      }
    });
  }

  _drawText(ctx, frame, cs) {
    const midY = GRID.HEIGHT / 2;
    if (frame.row.label) {
      ctx.textAlign = 'center';
      ctx.fillStyle = DIM;
      ctx.fillText(frame.row.label, GRID.WIDTH / 2, midY - cs * 2);
    }
    const width = ctx.measureText(frame.buffer + '█').width;
    const left = GRID.WIDTH / 2 - width / 2;
    ctx.textAlign = 'left';
    ctx.fillStyle = TEXT;
    ctx.fillText(frame.buffer, left, midY);
    if (cursorOn()) ctx.fillText('█', left + ctx.measureText(frame.buffer).width, midY);
  }
}
