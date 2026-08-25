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

    // Dynamic fallback: naming an entity describes it. Two forms —
    //   LOOK<NAME>   the ritual form (fits names up to 5 letters; the 9-char
    //                buffer cannot hold LOOK plus anything longer)
    //   <NAME>       the bare word, matched against the whole buffer exactly,
    //                so substrings and stray prefixes never half-fire
    // Scans suffixes outward like static detection, so junk letters before
    // LOOK don't block it; registered LOOK* words never reach this path (the
    // loop above already returned on them).
    const enemies = this.game._activeEnemies?.() ?? [];
    if (!enemies.length) return;
    for (let len = 5; len <= keyBuffer.length; len++) {
      const word = keyBuffer.slice(keyBuffer.length - len).join('');
      if (!word.startsWith('LOOK')) continue;
      const text = this._describeEntity(enemies, word.slice(4));
      if (text) {
        this.game.spellResponse = { text, startTime: performance.now() };
      }
      // Whether it resolved or not, a LOOK phrase is answered here once —
      // an unknown name is a wrong guess, not a prompt.
      return;
    }
    const text = this._describeEntity(enemies, keyBuffer.join(''));
    if (text) {
      this.game.spellResponse = { text, startTime: performance.now() };
    }
  }

  /**
   * Resolve a typed name against the given enemies. Both call sites pass a
   * whole fragment (the LOOK-form remainder, or the entire buffer for the
   * bare-word form) and matching is whole-name equality after stripping
   * non-alphanumerics — so substrings never half-fire ("OPERATE" is not RAT).
   *
   * The gate is literacy, not bookkeeping: nothing tracks what the player has
   * "seen" — the word only resolves if an enemy whose name matches is actually
   * in the room right now, and typing it at all requires knowing the name. The
   * player's mental save file does the gating.
   *
   * @param {Array} enemies enemies on the player's active layer
   * @param {string} name typed fragment to resolve
   * @returns {string|null} description text, or null when nothing answers
   */
  _describeEntity(enemies, name) {
    const wanted = name.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!wanted) return null;
    for (const e of enemies) {
      const ename = (e.data?.name ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (ename && ename === wanted) {
        return e.data?.spellDescription || ename + '.';
      }
    }
    return null;
  }
}
