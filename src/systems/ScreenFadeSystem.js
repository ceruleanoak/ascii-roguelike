import { GAME_STATES } from '../game/GameConfig.js';

/**
 * ScreenFadeSystem - Four-stage black fade transition between game states
 *
 * Used for TITLE -> REST: fades to black in four 0.5s steps (25/50/75/100%
 * opacity), performs the pending state transition once fully black, then
 * fades back in over the same four steps in reverse.
 */

const STEP_DURATION = 0.5;
const STEP_COUNT = 4;

export class ScreenFadeSystem {
  constructor(game) {
    this.game = game;
    this._onCompleteCallbacks = [];
  }

  start(pendingState) {
    this.game.screenFade = { direction: 'out', elapsed: 0, opacity: 0, pendingState };
  }

  // Runs callback once the entire fade (out + in) has finished. If no fade
  // is in progress, runs immediately. Used to hold gameplay music until the
  // screen has fully faded back in.
  whenComplete(callback) {
    if (!this.game.screenFade) {
      callback();
    } else {
      this._onCompleteCallbacks.push(callback);
    }
  }

  update(deltaTime) {
    const fade = this.game.screenFade;
    if (!fade) return;

    fade.elapsed += deltaTime;
    const stepIndex = Math.min(Math.floor(fade.elapsed / STEP_DURATION), STEP_COUNT);

    if (fade.direction === 'out') {
      fade.opacity = stepIndex / STEP_COUNT;
      if (stepIndex >= STEP_COUNT) {
        this.game.stateMachine.transition(fade.pendingState);
        // enterRestState() reconstructs game.player synchronously above —
        // hold its spawn fade at fully invisible until the screen has lifted
        // (whenComplete, same trigger as gameplay music start) so the player
        // doesn't pop in while the overlay is still clearing.
        if (fade.pendingState === GAME_STATES.REST && this.game.player) {
          this.game.player.spawnFadeHeld = true;
          this.whenComplete(() => {
            if (this.game.player) this.game.player.spawnFadeHeld = false;
          });
        }
        this.game.screenFade = { direction: 'in', elapsed: 0, opacity: 1.0 };
      }
    } else {
      fade.opacity = 1.0 - stepIndex / STEP_COUNT;
      if (stepIndex >= STEP_COUNT) {
        this.game.screenFade = null;
        const callbacks = this._onCompleteCallbacks;
        this._onCompleteCallbacks = [];
        callbacks.forEach(cb => cb());
      }
    }
  }
}
