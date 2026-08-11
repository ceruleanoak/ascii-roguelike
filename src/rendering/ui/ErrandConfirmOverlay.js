import { GRID } from '../../game/GameConfig.js';
import { ErrandCharacter } from '../../entities/ErrandCharacter.js';
import { getItemData } from '../../data/items.js';

/**
 * ErrandConfirmOverlay — trade confirm popup for the Errand traveler.
 *
 * A simplified version of RidgeSystem's bridge donation panel: floats over
 * the traveler's head instead of screen-centered, and gates a single
 * yes/no trade instead of a multi-material checklist.
 *
 * COMPLIANCE RULE (non-instructive UI): no key hints, no question text.
 * Content is limited to the requested item's glyph and the two bare option
 * labels GIVE / CANCEL — SPACE always confirms, SHIFT always cancels
 * (ErrandSystem.confirmGive / closeMenu), so there's no cursor to move.
 */
export class ErrandConfirmOverlay {
  constructor(renderer) {
    this.renderer = renderer;
  }

  render(game) {
    if (!game.errandSystem?.isMenuOpen()) return;

    const errandChar = game.neutralCharacters.find(nc => nc instanceof ErrandCharacter);
    if (!errandChar) return;

    const ctx = this.renderer.fgCtx;
    const cs = GRID.CELL_SIZE;
    const PAN_W = cs * 5;
    const PAN_H = cs * 4.5;
    const panX = Math.round(errandChar.position.x + cs / 2 - PAN_W / 2);
    const panY = Math.round(errandChar.position.y - PAN_H - cs * 1.2);

    ctx.save();

    ctx.fillStyle = 'rgba(8, 8, 12, 0.92)';
    ctx.fillRect(panX, panY, PAN_W, PAN_H);
    ctx.strokeStyle = '#44ffee';
    ctx.lineWidth = 1;
    ctx.strokeRect(panX + 0.5, panY + 0.5, PAN_W - 1, PAN_H - 1);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Requested item glyph — pure visual feedback, same role as
    // SlotReplacementOverlay's incoming-item glyph.
    const itemData = getItemData(errandChar.requestedItem);
    ctx.font = `${cs * 1.4}px 'Unifont', monospace`;
    ctx.fillStyle = itemData?.color || '#ffffff';
    ctx.fillText(errandChar.requestedItem, panX + PAN_W / 2, panY + cs * 1.3);

    // GIVE (bright — the default SPACE action) / CANCEL (dim — SHIFT)
    ctx.font = `${cs * 0.8}px 'Unifont', monospace`;
    ctx.fillStyle = '#ffff44';
    ctx.fillText('GIVE', panX + PAN_W / 2, panY + cs * 2.7);
    ctx.fillStyle = '#666666';
    ctx.fillText('CANCEL', panX + PAN_W / 2, panY + cs * 3.6);

    ctx.restore();
  }
}
