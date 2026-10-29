import { GAME_STATES } from '../game/GameConfig.js';
import { wishSpellNames } from '../data/spells.js';

/**
 * ThreeVoiceSystem — the Three answering for itself inside the Three Room
 * (claudedocs/three-voice-plan.md §4, §6).
 *
 * Inside the room there is no speaker for TALK to run to, so the Three answers
 * every talk word itself, one fixed line each. A Wish Spell cast there never
 * fires: no wish question, no wish spent, no effect. The Three names what the
 * wish is for instead, by its Wish Kind. Every other Spell acts normally.
 *
 * GIVE is the one wish word the room answers by acting (§5): the Three asks
 * which Wish Kind, the answer spends a wish, the kind's slot cracks with
 * nothing in it, and the Three tells the name of a Wish Spell of that kind.
 *
 * Stateless: one word, one answer, every time. What GIVE has already taken
 * is read off the room's slots.
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

/**
 * Each Wish Kind's Three Room slot, in the order GIVE's question names them:
 * POWER the apex (Instinct), INFLUENCE the right (Convention), GAIN the left
 * (Experience). Indices are ThreeRoomSystem's slot order: apex, left, right.
 */
const GIVE_KINDS = [
  { kind: 'power',     word: 'POWER',     slot: 0 },
  { kind: 'influence', word: 'INFLUENCE', slot: 2 },
  { kind: 'gain',      word: 'GAIN',      slot: 1 },
];

// GIVE's white flash, as the slot cracks.
const GIVE_FLASH = { duration: 600, color: '#ffffff' };

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

  // ── GIVE ────────────────────────────────────────────────────────────────────

  /** The kinds whose slot is still empty, in question order. */
  _openKinds() {
    const game = this.game;
    return GIVE_KINDS.filter(k => game.threeRoomSystem.isSlotOpen(game.currentRoom, k.slot));
  }

  /** GIVE may ask its question: in the Three Room, a wish left, a slot open. */
  canGive() {
    return this.isListening() &&
      this.game.wishSystem.hasWish(this.game) &&
      this._openKinds().length > 0;
  }

  /**
   * GIVE's question, built from the open kinds: POWER, INFLUENCE, OR GAIN? /
   * POWER OR GAIN? / GAIN?. NO. when there is nothing left to give for.
   */
  giveQuestion() {
    if (!this.isListening()) return '...NOTHING.';
    if (!this.canGive()) return 'NO.';
    const words = this._openKinds().map(k => k.word);
    if (words.length === 1) return `${words[0]}?`;
    if (words.length === 2) return `${words[0]} OR ${words[1]}?`;
    return `${words.slice(0, -1).join(', ')}, OR ${words[words.length - 1]}?`;
  }

  /**
   * The answer to GIVE's question. A kind that wasn't offered gets NO.;
   * an open one spends the wish (the question was its confirmation), flashes
   * white, cracks the kind's slot and tells a Wish Spell of that kind.
   * @param {'power'|'influence'|'gain'} kind
   * @returns {string}
   */
  give(kind) {
    const game = this.game;
    const entry = this._openKinds().find(k => k.kind === kind);
    if (!entry) return 'NO.';
    const names = wishSpellNames(kind);
    if (!names.length || !game.wishSystem.spend(game)) return 'NO.';

    game.screenFlash = { startTime: performance.now(), ...GIVE_FLASH };
    game.threeRoomSystem.crackSlot(game, entry.slot);
    return `${names[Math.floor(Math.random() * names.length)]}.`;
  }
}
