const KEY_TO_ARROWS = {
  q: ['Up', 'Left'],
  e: ['Up', 'Right'],
  z: ['Down', 'Left'],
  c: ['Down', 'Right']
};

import { isInputCaptured } from '../game/inputCapture.js';

export class DiagonalInputSystem {
  constructor(game) {
    window.addEventListener('keydown', (e) => {
      const key = e.key.toLowerCase();
      if (isInputCaptured(game) || !(key in KEY_TO_ARROWS)) return;
      KEY_TO_ARROWS[key].forEach(dir => game.arrowKeys['Arrow' + dir] = true);
      e.preventDefault();
    });

    window.addEventListener('keyup', (e) => {
      const key = e.key.toLowerCase();
      if (!(key in KEY_TO_ARROWS)) return;
      KEY_TO_ARROWS[key].forEach(dir => game.arrowKeys['Arrow' + dir] = false);
    });
  }
}
