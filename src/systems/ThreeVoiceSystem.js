import { GAME_STATES } from '../game/GameConfig.js';

/**
 * ThreeVoiceSystem — the Three answering for itself inside the Three Room
 * (claudedocs/three-voice-plan.md §4, §6).
 *
 * Inside the room there is no speaker for TALK to run to, so the Three answers
 * every talk word itself, one fixed line each. A Wish Spell cast there never
 * fires: no wish question, no wish spent, no effect. The Three names what the
 * wish is for instead, by its Wish Kind. Every other Spell acts normally.
 *
 * Stateless: one word, one answer, every time.
 *
 * SpellSystem.detect asks answer() before running a matched Spell; a string
 * back is the whole response.
 */

/** Talk words, each answered by the Three in its room. Elsewhere they are TALK. */
const THREE_TALK_LINES = {
  TALK:  'WE ARE LISTENING.',
  SPEAK: 'WE ARE LISTENING.',
  HELLO: 'HELLO, ONE.',
  GREET: 'HELLO, ONE.',
};

/** What each Wish Kind is for, said instead of granting it. */
const THREE_WISH_COMMENTS = {
  power:     'FOR ENEMIES.',
  gain:      'FOR GLORY.',
  influence: 'FOR CONTROL.',
};

export class ThreeVoiceSystem {
  constructor(game) {
    this.game = game;
  }

  /**
   * True while the Three answers for itself. Death's touch happens in the
   * room, so the death screen is excluded: REVIVE / CONTINUE must still revive
   * there (ThreeRoomSystem._resolveContactDeath keeps that wish live).
   */
  isListening() {
    const game = this.game;
    return !!game.currentRoom?.isThreeRoom &&
      game.stateMachine?.getCurrentState() !== GAME_STATES.GAME_OVER;
  }

  /**
   * The Three's own answer to a matched Spell, or null when the Spell should
   * act as usual.
   * @param {string} word the matched SPELLS key
   * @param {object} spell its SPELLS entry
   * @returns {string|null}
   */
  answer(word, spell) {
    if (!this.isListening()) return null;
    if (THREE_TALK_LINES[word]) return THREE_TALK_LINES[word];
    if (spell.wish) return THREE_WISH_COMMENTS[spell.wish];
    return null;
  }
}
