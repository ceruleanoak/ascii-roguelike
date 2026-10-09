/**
 * CliSystem — the CLI (GAME_STATES.CLI), Path to Canon's non-ending.
 *
 * The player types EXIT, answers the THREE's ARE YOU SURE?, and the game
 * closes into this faux command line. Here they stop playing the canon and
 * start authoring it. Canon Edits persist through CanonStore.
 *
 * Views (one at a time; rendered by CliRenderer):
 *   prompt  — the centered `>` with a typed buffer. ENTER or SPACE submits.
 *   table   — a borderless list of rows. Up/down move, SPACE/ENTER selects,
 *             SHIFT returns to the prompt.
 *   confirm — the prompt again, waiting on a yes/no answer (FORGET).
 *
 * Commands: HELP (the command table), LIST (editable files and
 * executables), FORGET (erase every Canon Edit). ☠ PURE ROGUE in LIST
 * relaunches the game; a page reload is a real relaunch, so the Canon
 * Overlay re-applies from a clean boot and the game lands on the title.
 */

import { menuIntent } from './MenuInput.js';
import { CanonStore } from './CanonStore.js';
import { GAME_STATES } from '../game/GameConfig.js';
import { applyReset } from '../game/resetRegistry.js';

const AFFIRMATIVE = new Set(['YES', 'Y', 'SURE', 'OK', 'AYE']);
const MAX_BUFFER = 24;

export class CliSystem {
  constructor(game) {
    this.game = game;
    this.view = 'prompt';
    this.buffer = '';
    this.reply = '';      // one dim line under the prompt
    this.rows = [];       // table view: [{ label, run }]
    this.index = 0;
    this.pendingConfirm = null; // confirm view: action run on an affirmative
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
    this.view = 'prompt';
    this.buffer = '';
    this.reply = '';
    this.rows = [];
    this.index = 0;
    this.pendingConfirm = null;
  }

  handleKeydown(e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return; // leave browser shortcuts alone
    e.preventDefault();
    if (this.view === 'table') this._tableKey(e);
    else this._promptKey(e);
  }

  _promptKey(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      const word = this.buffer.trim();
      this.buffer = '';
      if (this.view === 'confirm') this._answerConfirm(word);
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

  _tableKey(e) {
    const intent = menuIntent(e);
    if (intent === 'up' || intent === 'down') {
      const n = this.rows.length;
      this.index = (this.index + (intent === 'up' ? -1 : 1) + n) % n;
    } else if (intent === 'confirm') {
      this.rows[this.index]?.run();
    } else if (intent === 'shift' || e.key === 'Escape') {
      this._showPrompt('');
    }
  }

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
    this.view = 'prompt';
    this.reply = AFFIRMATIVE.has(word) ? action() : '...';
  }

  _showPrompt(reply) {
    this.view = 'prompt';
    this.reply = reply;
    this.rows = [];
    this.index = 0;
  }

  _showTable(rows) {
    this.view = 'table';
    this.reply = '';
    this.rows = rows;
    this.index = 0;
  }
}

// Each command takes the CliSystem. HELP's rows run the command they name.
const COMMANDS = {
  HELP: (cli) => cli._showTable(['HELP', 'LIST', 'FORGET'].map(label => ({
    label,
    run: () => { cli._showPrompt(''); COMMANDS[label](cli); },
  }))),

  LIST: (cli) => cli._showTable([
    { label: '☠ PURE ROGUE', run: () => window.location.reload() },
  ]),

  FORGET: (cli) => {
    cli.view = 'confirm';
    cli.reply = 'ARE YOU SURE?';
    cli.pendingConfirm = () => (CanonStore.forget() ? 'FORGOTTEN.' : '...');
  },
};
