/**
 * PauseSystem — generic modal pause for the game loop.
 *
 * Any feature can freeze gameplay by opening a "modal": an object that owns
 * input and drawing while the world is suspended. main.js consults
 * `isPaused()` at the top of update() to skip all state updates (rendering
 * keeps running so the modal can draw over the frozen frame) and routes
 * keydown events here while a modal is open. Keyup events still clear held-key
 * flags in main.js so nothing is "stuck held" on resume, but release side
 * effects (charge throws, attack releases) are suppressed.
 *
 * Modal contract — pass any object with these methods to openModal():
 *   handleKey(key, event)   — receives every keydown while open
 *   render(renderer, game)  — drawn after the state render each frame
 *   onClose()               — optional cleanup when the modal closes
 *
 * One modal at a time; openModal() returns false if another is active.
 * First consumer: SlotReplacementSystem (full-quick-slot pickup prompt).
 */
export class PauseSystem {
  constructor(game) {
    this.game = game;
    this.activeModal = null;
  }

  isPaused() {
    return this.activeModal !== null;
  }

  openModal(modal) {
    if (this.activeModal) return false;
    this.activeModal = modal;
    return true;
  }

  closeModal() {
    const modal = this.activeModal;
    this.activeModal = null;
    modal?.onClose?.();
  }

  handleKeydown(e) {
    this.activeModal?.handleKey(e.key, e);
  }

  /**
   * Keyup while paused: clear held-key flags so nothing is stuck held on
   * resume, but suppress release side effects (charge throws, attack
   * releases) — the press that pairs with this release never reached gameplay.
   */
  handleKeyup(e) {
    const game = this.game;
    const key = e.key.toLowerCase();
    if (key === 'w' || key === 'a' || key === 's' || key === 'd') game.keys[key] = false;
    if (e.key === 'Tab') game.keys.tab = false;
    if (key === ' ') { game.keys.space = false; game.spacePressed = false; }
    if (key === 'shift') { game.keys.shift = false; game.shiftPressed = false; }
    if (key === 'v') { game.keys.v = false; game.vPressed = false; }
    if (e.key.startsWith('Arrow')) game.arrowKeys[e.key] = false;
  }

  render(renderer) {
    this.activeModal?.render(renderer, this.game);
  }
}
