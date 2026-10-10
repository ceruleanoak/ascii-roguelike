import { GRID } from '../game/GameConfig.js';
import { inSamePlane } from './PlaneSystem.js';

// Walking this far from the speaker closes the box automatically.
const BREAK_RANGE = GRID.CELL_SIZE * 4;

/**
 * DialogueSystem — NPC speech in a boxed, SPACE-driven dialogue panel.
 *
 * Design intent: the narrator/genie voice owns the large center-screen
 * VentureArcade text (spells, notifications). NPC voices are deliberately
 * isolated in a bordered dialogue box so the player never confuses the two.
 *
 * Any NPC that implements `getDialogueLines(game) → string[]` is a speaker;
 * the array is its speech. One interaction tells exactly one line: SPACE near
 * a speaker opens the box on the speech's next line, and SPACE again closes
 * it. The next interaction tells the line after. A speech is asked for again
 * (getDialogueLines is called) only once the last one has been told in full,
 * so a speech's side effects fire once per telling. `npc.spokenOnce` is set
 * when a speech's last line has been told — "heard them out" — which is what
 * trade gates (Fisherman, Weapons Master) wait on. Rendering lives in
 * rendering/ui/DialogueBox.js.
 *
 * The rule is the same for every speaker, NPC systems included: they call
 * talk()/open() and never step lines themselves.
 */
export class DialogueSystem {
  constructor(game) {
    this.game = game;
    this.active = null; // { npc, lines, lineIndex } — the line on screen
    // npc → { lines, lineIndex } for a speech with lines still untold. Weak,
    // so a speaker dropped with its room takes its unfinished speech with it.
    this.speeches = new WeakMap();
  }

  isOpen() {
    return !!this.active;
  }

  getState() {
    return this.active;
  }

  /** True while `npc` has a speech with lines still to tell. */
  isMidSpeech(npc) {
    return this.speeches.has(npc);
  }

  /**
   * Start a new speech from `npc` (replacing any untold remainder) and tell
   * its first line.
   */
  open(npc, lines) {
    if (!Array.isArray(lines) || lines.length === 0) return false;
    this.speeches.delete(npc);
    return this._tell(npc, lines, 0);
  }

  /** One interaction with `npc`: the next line of its speech, or a new speech. */
  talk(npc) {
    const speech = this.speeches.get(npc);
    if (speech) return this._tell(npc, speech.lines, speech.lineIndex);
    return this.open(npc, npc.getDialogueLines(this.game));
  }

  close() {
    this.active = null;
  }

  /** SPACE while open — the line has been told; close the box. */
  advance() {
    if (!this.active) return false;
    this.active = null;
    return true;
  }

  /** SPACE while closed — talk to a speaker in talk range. */
  tryOpenNearby() {
    const game = this.game;
    const player = game.player;
    if (!player) return false;

    for (const npc of game.interiorManager.activeNpcs()) {
      if (typeof npc.getDialogueLines !== 'function') continue;
      if (!inSamePlane(npc, player) || !npc.isInRange(player)) continue;
      if (this.talk(npc)) return true;
    }
    return false;
  }

  /** Auto-close when the player walks away from the speaker. */
  update() {
    if (!this.active) return;
    const player = this.game.player;
    const npc = this.active.npc;
    if (!player || !npc) {
      this.active = null;
      return;
    }
    const dist = Math.hypot(
      player.position.x - npc.position.x,
      player.position.y - npc.position.y
    );
    if (dist > BREAK_RANGE) this.active = null;
  }

  _tell(npc, lines, lineIndex) {
    this.active = { npc, lines, lineIndex };
    if (lineIndex + 1 < lines.length) {
      this.speeches.set(npc, { lines, lineIndex: lineIndex + 1 });
    } else {
      this.speeches.delete(npc);
      npc.spokenOnce = true;
    }
    return true;
  }
}
