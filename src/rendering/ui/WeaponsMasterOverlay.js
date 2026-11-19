import { drawModalMenu } from './modalPanel.js';
import { DialogueBox } from './DialogueBox.js';

/**
 * WeaponsMasterOverlay — the Weapons Master's ASK ABOUT menu
 * (WeaponsMasterSystem). Shop front-menu layout under an ASK ABOUT header;
 * rows are bare topic labels. The header is the one label the user ratified
 * as an exception to the non-instructive popup rule. His answer is drawn
 * over the menu in the usual dialogue box (the menu stays open under it).
 */
export class WeaponsMasterOverlay {
  constructor() {
    // Built on the first render, which is the first time a renderer is in hand.
    this.dialogueBox = null;
  }

  render(renderer, game, state) {
    if (!state.master) return;
    const ctx = renderer.uiCtx;
    ctx.save();
    ctx.textBaseline = 'middle';
    drawModalMenu(ctx, game, state, {
      header: 'ASK ABOUT',
      rows: state.rows,
      index: state.menuIndex
    });
    ctx.restore();
    if (game.dialogueSystem?.getState()?.npc === state.master) {
      if (!this.dialogueBox) this.dialogueBox = new DialogueBox(renderer);
      this.dialogueBox.render(game, ctx);
    }
  }
}
