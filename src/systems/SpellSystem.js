import { SPELLS } from '../data/spells.js';

/**
 * SpellSystem — detects typed spells from the keystroke buffer.
 *
 * Detection scans linearly from the most recently entered key outward.
 * The first (shortest) match wins. "FIND" fires; "FINDE" does not.
 *
 * When a spell has followUps, the system enters an awaiting state after it
 * fires. On the next buffer submission, follow-up words are checked first.
 * If matched, the follow-up response is shown and the state clears. If no
 * follow-up matches, normal spell detection runs as a fallback.
 *
 * The awaiting state resets on any room/state transition via resetAwaiting().
 *
 * Usage:
 *   this.spellSystem = new SpellSystem(this);
 *   // On buffer-clear trigger:
 *   this.spellSystem.detect(this.keyBuffer);
 *   // On room/state transition:
 *   this.spellSystem.resetAwaiting();
 *
 * Result written to game.spellResponse: { text, startTime } | null
 */
export class SpellSystem {
  constructor(game) {
    this.game = game;
    game.spellResponse = null;
    this.awaitingSpell = null; // { followUps: {...} } when waiting for a follow-up word
  }

  /** Reset the awaiting state — call on any room or state transition. */
  resetAwaiting() {
    this.awaitingSpell = null;
  }

  /**
   * Scan keyBuffer from the end for a matching spell or follow-up.
   * Call before clearing the buffer.
   * @param {string[]} keyBuffer
   */
  detect(keyBuffer) {
    // If waiting for a follow-up, check that list first.
    if (this.awaitingSpell) {
      const { followUps } = this.awaitingSpell;
      for (let len = 1; len <= keyBuffer.length; len++) {
        const word = keyBuffer.slice(keyBuffer.length - len).join('');
        const entry = followUps[word];
        if (entry !== undefined) {
          let text, action;
          if (entry !== null && typeof entry === 'object' && !Array.isArray(entry) && (entry.text !== undefined || entry.action !== undefined)) {
            text = typeof entry.text === 'function' ? entry.text(this.game) : entry.text;
            action = entry.action;
          } else {
            text = typeof entry === 'function' ? entry(this.game) : entry;
          }
          if (text) {
            this.awaitingSpell = null;
            this.game.spellResponse = { text, startTime: performance.now() };
            if (action) action(this.game);
            return;
          }
        }
      }
      // No follow-up matched.
      this.awaitingSpell = null;
      this.game.spellResponse = { text: '...NOTHING.', startTime: performance.now() };
      return;
    }

    // Normal spell detection.
    for (let len = 1; len <= keyBuffer.length; len++) {
      const word = keyBuffer.slice(keyBuffer.length - len).join('');
      const spell = SPELLS[word];
      if (spell) {
        if (spell.followUps) {
          const active = spell.followUpsActive ? spell.followUpsActive(this.game) : true;
          if (active) {
            this.awaitingSpell = { followUps: spell.followUps };
          }
        }
        const text = typeof spell.response === 'function' ? spell.response(this.game) : spell.response;
        this.game.spellResponse = { text, startTime: performance.now() };
        if (spell.action) spell.action(this.game);
        return;
      }
    }
  }
}
