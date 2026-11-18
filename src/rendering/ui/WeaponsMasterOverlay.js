import { drawModalMenu } from './modalPanel.js';

/**
 * WeaponsMasterOverlay — the Weapons Master's ASK ABOUT menu
 * (WeaponsMasterSystem). Shop front-menu layout under an ASK ABOUT header;
 * rows are bare topic labels. The header is the one label the user ratified
 * as an exception to the non-instructive popup rule.
 */
export class WeaponsMasterOverlay {
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
  }
}
