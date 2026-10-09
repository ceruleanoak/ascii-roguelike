/**
 * CliRenderer — draws the CLI (GAME_STATES.CLI): a black screen, Unifont,
 * everything centered. The prompt is a prominent `>` with a blinking
 * cursor; tables are borderless text with the selected row in yellow.
 * Non-instructive: no hint footers, no headers — bare labels only.
 */

import { GRID, COLORS } from '../../game/GameConfig.js';

const SELECTED = '#ffff00';
const DIM = '#999999';
const TEXT = '#ffffff';

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
    const ctx = r.fgCtx;
    const cs = GRID.CELL_SIZE;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${cs}px 'Unifont', monospace`;

    if (cli.view === 'table') {
      const rowH = cs * 1.5;
      const top = GRID.HEIGHT / 2 - ((cli.rows.length - 1) * rowH) / 2;
      cli.rows.forEach((row, i) => {
        ctx.fillStyle = i === cli.index ? SELECTED : DIM;
        ctx.fillText(row.label, GRID.WIDTH / 2, top + i * rowH);
      });
    } else {
      this._drawPrompt(ctx, cli, cs);
    }
    ctx.restore();
  }

  _drawPrompt(ctx, cli, cs) {
    const midY = GRID.HEIGHT / 2;
    const cursorOn = Math.floor(performance.now() / 500) % 2 === 0;
    // Measure with a fixed-width cursor slot so the line doesn't jitter as it blinks.
    const line = `> ${cli.buffer}`;
    const big = cs * 1.5;
    ctx.font = `${big}px 'Unifont', monospace`;
    const width = ctx.measureText(line + '█').width;
    const left = GRID.WIDTH / 2 - width / 2;
    ctx.textAlign = 'left';
    ctx.fillStyle = TEXT;
    ctx.fillText(line, left, midY);
    if (cursorOn) ctx.fillText('█', left + ctx.measureText(line).width, midY);

    if (cli.reply) {
      ctx.font = `${cs}px 'Unifont', monospace`;
      ctx.textAlign = 'center';
      ctx.fillStyle = DIM;
      ctx.fillText(cli.reply, GRID.WIDTH / 2, midY + big * 1.5);
    }
  }
}
