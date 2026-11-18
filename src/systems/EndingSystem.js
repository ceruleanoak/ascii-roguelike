import { GAME_STATES } from '../game/GameConfig.js';

/**
 * EndingSystem — which Ending a run closed on, and where SPACE leads from it.
 *
 * Every Ending is a GAME OVER: the same two words on every screen, told apart
 * only by ground, color and glyph (GameOverRenderer draws them from
 * ENDING_SCREENS). This system names the Ending; it never draws it.
 *
 *   fallen          — the last living character died. The plain red GAME OVER.
 *   mist            — the mist took the last living character at gray depth 10
 *                     with fewer than three lost, so no Mist Battle.
 *   crown           — the Mist Battle's crowned victor went into the gray.
 *   deathFulfilled  — Death reached the player once the Library Queue was spent.
 *   deathFallen     — the Death Fight ended before Fulfillment: the player fell
 *                     to its enemies, or Death caught them early.
 *
 * game.ending is set at the moment the run ends, never cleared on the way
 * into GAME_OVER: a wish-revive out of GAME_OVER leaves it stale, and the
 * next ending always writes its own.
 */
export const ENDINGS = Object.freeze({
  FALLEN: 'fallen',
  MIST: 'mist',
  CROWN: 'crown',
  DEATH_FULFILLED: 'deathFulfilled',
  DEATH_FALLEN: 'deathFallen',
});

export class EndingSystem {
  constructor(game) {
    this.game = game;
  }

  /**
   * The last living character died (main.js's death path, or Death's touch in
   * the Three Room). Inside the Death Fight the Ending is Death's: Fulfilled
   * once the queue is spent, Fallen before it. Call before the fight resets.
   */
  markDeath() {
    const fight = this.game.deathFightSystem?.fight;
    if (!fight) this.game.ending = ENDINGS.FALLEN;
    else if (fight.phase === 'fulfillment') this.game.ending = ENDINGS.DEATH_FULFILLED;
    else this.game.ending = ENDINGS.DEATH_FALLEN;
  }

  /**
   * End the run where no death resolved it — the mist closed over the last
   * walker, or over the Mist Battle's victor. The mist is already shut, so the
   * screen goes silent and straight to GAME OVER.
   */
  endInMist(ending) {
    const game = this.game;
    game.ending = ending;
    game.audioSystem?.stop();
    game.combatSystem?.clear();
    game.stateMachine.transition(GAME_STATES.GAME_OVER);
  }

  /** The mist has already closed over these Endings — no gray death swallow. */
  closedInMist() {
    const ending = this.game.ending;
    return ending === ENDINGS.MIST || ending === ENDINGS.CROWN;
  }

  /**
   * SPACE on a true GAME OVER. The crown's Ending leads to the title, as the
   * Mist Battle always has; every other Ending starts the next run at REST.
   */
  leave() {
    const game = this.game;
    if (game.ending === ENDINGS.CROWN) game.stateMachine.transition(GAME_STATES.TITLE);
    else game._resetRunToRest();
  }
}
