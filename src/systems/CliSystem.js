/**
 * CliSystem — the CLI (GAME_STATES.CLI), Path to Canon's non-ending.
 *
 * The player types EXIT, answers the THREE's ARE YOU SURE?, and the game
 * closes into this faux command line. Here they stop playing the canon and
 * start authoring it. Canon Edits persist through CanonStore.
 *
 * With nothing open, the CLI is the prompt: the centered `>` with a typed
 * buffer, where ENTER or SPACE submits. `mode` is 'confirm' while the prompt
 * waits on a yes/no answer (FORGET). Everything else is a frame on `stack`,
 * rendered by CliRenderer:
 *   table  — a borderless list of rows (src/systems/cliTables.js). Up/down
 *            move, left/right step a value, SPACE/ENTER selects, SHIFT backs out.
 *   text   — a text edit of one row. ENTER keeps it, Escape drops it (SHIFT
 *            types capitals here, so it can't back out).
 *   glyphs — the Unicode table. Arrows move, SPACE picks, SHIFT backs out.
 *
 * Commands: HELP (the command table), LIST (editable files and
 * executables), FORGET (erase every Canon Edit).
 */

import { menuIntent } from './MenuInput.js';
import { CanonStore } from './CanonStore.js';
import { LIST, GLYPH_COLUMNS, actionRow, stepValue } from './cliTables.js';
import { GAME_STATES } from '../game/GameConfig.js';
import { applyReset } from '../game/resetRegistry.js';

const AFFIRMATIVE = new Set(['YES', 'Y', 'SURE', 'OK', 'AYE']);
const MAX_BUFFER = 24;

export class CliSystem {
  constructor(game) {
    this.game = game;
    this.canon = CanonStore.load();
    this.mode = 'prompt';       // 'prompt' | 'confirm' — the prompt under the stack
    this.buffer = '';
    this.reply = '';            // one dim line under the prompt
    this.pendingConfirm = null; // confirm mode: action run on an affirmative
    this.stack = [];            // open frames, top last
  }

  /** EXIT confirmed: close the game into the CLI. */
  requestExit() {
    const game = this.game;
    if (game.screenFade) return;
    CanonStore.setExited();
    game.screenFadeSystem.start(GAME_STATES.CLI);
  }

  /** State entry (GAME_STATES.CLI handler). The run is over — wipe it as TITLE does. */
  enter() {
    const game = this.game;
    game.audioSystem.stop();
    game.ui.overlay.classList.remove('slide-up');
    game.ui.overlay.classList.add('hidden');
    applyReset(game, 'title');
    game.player = null; // after applyReset — every player.* entry no-ops once null
    game.spellResponse = null;
    game.renderer.markBackgroundDirty();
    this.canon = CanonStore.load();
    this.mode = 'prompt';
    this.buffer = '';
    this.reply = '';
    this.pendingConfirm = null;
    this.stack = [];
  }

  save() {
    CanonStore.save(this.canon);
  }

  // ── Frames ───────────────────────────────────────────────────────────────

  top() {
    return this.stack[this.stack.length - 1] ?? null;
  }

  /** The open table's rows, with its selection kept in range. */
  rows() {
    const frame = this.top();
    if (frame?.kind !== 'table') return [];
    const rows = frame.build(this);
    frame.index = Math.max(0, Math.min(frame.index, rows.length - 1));
    return rows;
  }

  openTable(build) {
    this.reply = '';
    this.stack.push({ kind: 'table', build, index: 0 });
  }

  /** Swap the open table for another, keeping the selection. */
  replaceTable(build) {
    const frame = this.top();
    if (frame?.kind === 'table') frame.build = build;
  }

  openGlyphs(glyphs, onPick) {
    this.stack.push({ kind: 'glyphs', glyphs, index: 0, onPick });
  }

  back() {
    this.stack.pop();
  }

  // ── Input ────────────────────────────────────────────────────────────────

  handleKeydown(e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return; // leave browser shortcuts alone
    e.preventDefault();
    const frame = this.top();
    if (!frame) this._promptKey(e);
    else if (frame.kind === 'table') this._tableKey(e, frame);
    else if (frame.kind === 'text') this._textKey(e, frame);
    else this._glyphKey(e, frame);
  }

  _promptKey(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      const word = this.buffer.trim();
      this.buffer = '';
      if (this.mode === 'confirm') this._answerConfirm(word);
      else if (word) this._runCommand(word);
      return;
    }
    if (e.key === 'Backspace') {
      this.buffer = this.buffer.slice(0, -1);
      return;
    }
    if (e.key.length === 1 && this.buffer.length < MAX_BUFFER) {
      this.buffer += e.key.toUpperCase();
    }
  }

  _tableKey(e, frame) {
    const rows = this.rows();
    const row = rows[frame.index];
    const intent = menuIntent(e);
    if (intent === 'up' || intent === 'down') {
      const n = rows.length;
      if (n) frame.index = (frame.index + (intent === 'up' ? -1 : 1) + n) % n;
    } else if ((intent === 'left' || intent === 'right') && row?.kind === 'steps') {
      stepValue(row, intent === 'left' ? -1 : 1);
    } else if (intent === 'confirm' && row) {
      this._selectRow(row);
    } else if (intent === 'shift' || e.key === 'Escape') {
      this.back();
    }
  }

  _selectRow(row) {
    if (row.kind === 'steps') stepValue(row, 1);
    else if (row.kind === 'text') this.stack.push({ kind: 'text', row, buffer: row.get() ?? '' });
    else if (row.kind === 'glyph') row.pick();
    else if (row.kind === 'table') this.openTable(row.build);
    else if (row.kind === 'action') row.run(this);
  }

  _textKey(e, frame) {
    if (e.key === 'Enter') {
      this.back();
      frame.row.set(frame.buffer.trim());
    } else if (e.key === 'Escape') {
      this.back();
    } else if (e.key === 'Backspace') {
      frame.buffer = frame.buffer.slice(0, -1);
    } else if (e.key.length === 1 && frame.buffer.length < frame.row.max) {
      frame.buffer += e.key;
    }
  }

  _glyphKey(e, frame) {
    const n = frame.glyphs.length;
    const intent = menuIntent(e);
    const moves = { left: -1, right: 1, up: -GLYPH_COLUMNS, down: GLYPH_COLUMNS };
    if (moves[intent] && n) {
      frame.index = Math.max(0, Math.min(n - 1, frame.index + moves[intent]));
    } else if (intent === 'confirm' && n) {
      this.back();
      frame.onPick(frame.glyphs[frame.index]);
    } else if (intent === 'shift' || e.key === 'Escape') {
      this.back();
    }
  }

  // ── Prompt commands ──────────────────────────────────────────────────────

  _runCommand(word) {
    const command = COMMANDS[word];
    if (!command) {
      this.reply = `${word}: NOT FOUND`;
      return;
    }
    command(this);
  }

  _answerConfirm(word) {
    const action = this.pendingConfirm;
    this.pendingConfirm = null;
    this.mode = 'prompt';
    this.reply = AFFIRMATIVE.has(word) ? action() : '...';
  }
}

// Each command takes the CliSystem. HELP's rows run the command they name.
const COMMANDS = {
  HELP: (cli) => cli.openTable(() => ['HELP', 'LIST', 'FORGET'].map(label => actionRow(label, () => {
    cli.stack = [];
    COMMANDS[label](cli);
  }))),

  LIST: (cli) => cli.openTable(LIST),

  FORGET: (cli) => {
    cli.stack = [];
    cli.mode = 'confirm';
    cli.reply = 'ARE YOU SURE?';
    cli.pendingConfirm = () => {
      if (!CanonStore.forget()) return '...';
      cli.canon = CanonStore.load();
      return 'FORGOTTEN.';
    };
  },
};
