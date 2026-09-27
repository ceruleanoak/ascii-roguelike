import { NeutralCharacter } from './NeutralCharacter.js';

// A single fixed line. Written in the same all-caps voice every other NPC's
// DialogueBox lines use.
const LINES = ["IT'S A SECRET TO EVERYBODY."];

// Coins handed over the first time the player talks to him (inclusive range).
const MIN_COINS = 2;
const MAX_COINS = 5;

/**
 * FriendlyGoblin — the friendly goblin who keeps a Cavern. Not the hostile
 * 'G' Goblin enemy: same letter, a separate class with no combat behavior.
 *
 * Speech goes through the standard DialogueSystem protocol (getDialogueLines
 * + SPACE in talk range) — never the narrator's center-screen voice. The
 * first time he speaks he drops 2–5 coins at his feet; the gift is once per
 * Cavern, because the Cavern's floor (and this instance with it) is cached on
 * the room for the rest of the visit.
 */
export class FriendlyGoblin extends NeutralCharacter {
  constructor(x, y) {
    super('G', '#88cc66', x, y);
    this.coinsGiven = false;
  }

  getDialogueLines(game) {
    if (!this.coinsGiven) {
      this.coinsGiven = true;
      this._dropCoins(game);
    }
    return LINES;
  }

  _dropCoins(game) {
    const count = MIN_COINS + Math.floor(Math.random() * (MAX_COINS - MIN_COINS + 1));
    for (let i = 0; i < count; i++) {
      // Fan the coins out across the south half so they land between the
      // goblin and the player rather than behind him against the wall.
      const angle = Math.PI * (0.15 + 0.7 * (count === 1 ? 0.5 : i / (count - 1)));
      game.lootSystem.spawnIngredientDrop('c', this.position.x, this.position.y, angle, this);
    }
    game.audioSystem?.playSFX('coin_plink');
  }

  update(dt, game) {
    super.update(dt); // pulse animation
    this.updateTalkIndicator(game);
  }
}
