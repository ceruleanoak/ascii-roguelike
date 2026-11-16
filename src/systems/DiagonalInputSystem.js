const KEY_TO_ARROWS = {
  q: ['Up', 'Left'],
  e: ['Up', 'Right'],
  z: ['Down', 'Left'],
  c: ['Down', 'Right']
};

import { isInputCaptured } from '../game/inputCapture.js';

// Q/E/Z/C roll diagonally by holding two arrow keys at once. Off by default:
// the CLI's DIAGONAL ROLLS cheat (a Canon Edit, seedCanonCheats) switches it
// on. Off, the keys do nothing at all here, so a released Q never lets go of
// an arrow the player is still holding.
export class DiagonalInputSystem {
  constructor(game) {
    this.enabled = false;
    window.addEventListener('keydown', (e) => {
      const key = e.key.toLowerCase();
      if (!this.enabled || isInputCaptured(game) || !(key in KEY_TO_ARROWS)) return;
      KEY_TO_ARROWS[key].forEach(dir => game.arrowKeys['Arrow' + dir] = true);
      e.preventDefault();
    });

    window.addEventListener('keyup', (e) => {
      const key = e.key.toLowerCase();
      if (!this.enabled || !(key in KEY_TO_ARROWS)) return;
      KEY_TO_ARROWS[key].forEach(dir => game.arrowKeys['Arrow' + dir] = false);
    });
  }
}
