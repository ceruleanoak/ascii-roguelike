const KEY_TO_ARROWS = {
  q: ['Up', 'Left'],
  e: ['Up', 'Right'],
  z: ['Down', 'Left'],
  c: ['Down', 'Right']
};

export class DiagonalInputSystem {
  constructor(game) {
    const suppressed = () =>
      game.player?.polymorphed || game.cheatMenu?.isOpen || game.menuOpen || game.pauseSystem?.isPaused();

    window.addEventListener('keydown', (e) => {
      const key = e.key.toLowerCase();
      if (suppressed() || !(key in KEY_TO_ARROWS)) return;
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
