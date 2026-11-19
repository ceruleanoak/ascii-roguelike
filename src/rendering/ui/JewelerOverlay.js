import { GRID } from '../../game/GameConfig.js';
import { getItemData } from '../../data/items.js';
import { JEWELER_WARES } from '../../data/jewelerWares.js';
import { spectaclesTransformString, isSpectaclesActive } from '../../data/cipher.js';
import { drawModalPanel, modalFadeProgress, drawModalMenu } from './modalPanel.js';

/**
 * JewelerOverlay — the Jeweler's popup (JewelerSystem), laid out as the
 * Shop's (ShopOverlay): renderer.uiCtx, Unifont-only, dim + bordered panel,
 * ▼ cursor, fade synced to the 1000ms input lockout.
 *
 * Three modes match JewelerSystem's:
 *   'give'   — the Shop's front-menu layout: one GIVE row per drink carried,
 *              the drink's glyph after the label.
 *   'list'   — the Shop's WARES list: each necklace in role-colored brackets,
 *              its name beside the selected row.
 *   'barter' — the necklace's glyph and name (CONFIRM? once it can be paid
 *              for) over its cost: each gem bracketed (yellow when carried),
 *              then the coin with its count.
 *
 * COMPLIANCE RULE (non-instructive UI): glyphs, bare names, GIVE, CONFIRM?,
 * the ▼ cursor and small dim numbers only. Cost is never shown on the list,
 * only once a row is opened.
 */

const BRACKET_COLOR = '#ffff00'; // CONSUMABLE role color, as in ShopOverlay
const COIN_COLOR = '#ffcc66';    // matches drawCoinArc's coin frames
const MISSING = '#666666';       // ShopOverlay's untoggled lane bracket

export class JewelerOverlay {
  render(renderer, game, state) {
    if (!state.jeweler) return;
    const ctx = renderer.uiCtx;
    ctx.save();
    ctx.textBaseline = 'middle';

    if (state.mode === 'give') this._renderGive(ctx, game, state);
    else if (state.mode === 'list') this._renderList(ctx, game, state);
    else this._renderBarter(ctx, game, state);

    ctx.restore();
  }

  _renderGive(ctx, game, state) {
    drawModalMenu(ctx, game, state, {
      rows: state.drinks.map(char => ({
        label: 'GIVE', glyph: char, glyphColor: getItemData(char)?.color
      })),
      index: state.giveIndex
    });
  }

  _renderList(ctx, game, state) {
    const cs = GRID.CELL_SIZE;
    const rowH = cs * 1.6;

    // Width scales to the longest name so names never clip.
    ctx.font = `${cs * 0.85}px 'Unifont', monospace`;
    let maxNameW = 0;
    for (const row of JEWELER_WARES) {
      maxNameW = Math.max(maxNameW, ctx.measureText(wareName(row)).width);
    }

    const boxW = cs * 4.5 + maxNameW;
    const boxH = cs * 1.4 + JEWELER_WARES.length * rowH;
    const boxX = Math.floor((GRID.WIDTH - boxW) / 2);
    const boxY = Math.floor((GRID.HEIGHT - boxH) / 2);

    drawModalPanel(ctx, boxX, boxY, boxW, boxH);
    ctx.globalAlpha = modalFadeProgress(state);

    const colX = boxX + cs * 1.5;
    const nameX = boxX + cs * 3;
    const startY = boxY + cs * 1.4;

    for (let i = 0; i < JEWELER_WARES.length; i++) {
      const row = JEWELER_WARES[i];
      const y = startY + i * rowH;
      const selected = state.rowIndex === i;

      ctx.textAlign = 'center';
      if (selected) {
        ctx.font = `${cs * 0.9}px 'Unifont', monospace`;
        ctx.fillStyle = '#ffff00';
        ctx.fillText('▼', colX, y - cs * 0.9);
      }

      ctx.font = `${cs}px 'Unifont', monospace`;
      ctx.fillStyle = BRACKET_COLOR;
      ctx.fillText('[', colX - cs * 0.55, y);
      ctx.fillText(']', colX + cs * 0.55, y);
      ctx.fillStyle = getItemData(row.char)?.color || '#ffffff';
      ctx.fillText(row.char, colX, y);

      if (selected) {
        ctx.textAlign = 'left';
        ctx.font = `${cs * 0.85}px 'Unifont', monospace`;
        ctx.fillStyle = '#cccccc';
        ctx.fillText(spectaclesTransformString(wareName(row), isSpectaclesActive(game)), nameX, y);
      }
    }

    ctx.globalAlpha = 1;
  }

  _renderBarter(ctx, game, state) {
    const cs = GRID.CELL_SIZE;
    const row = JEWELER_WARES[state.rowIndex];
    const laneCell = cs * 1.8;
    const gap = cs * 0.5;
    const lanes = row.gems.length + 1; // each gem, then the coin

    ctx.font = `${cs * 0.85}px 'Unifont', monospace`;
    const nameW = ctx.measureText(wareName(row)).width;
    const laneRowW = laneCell * lanes + gap * (lanes - 1);

    const boxW = Math.max(cs * 3 + nameW + cs * 2, laneRowW + cs * 3);
    const boxH = cs * 7;
    const boxX = Math.floor((GRID.WIDTH - boxW) / 2);
    const boxY = Math.floor((GRID.HEIGHT - boxH) / 2);

    drawModalPanel(ctx, boxX, boxY, boxW, boxH);
    ctx.globalAlpha = modalFadeProgress(state);

    // Header: glyph + NAME, or CONFIRM? once it can be paid for.
    const headerY = boxY + cs * 1.6;
    const spectacles = isSpectaclesActive(game);
    if (state.canAfford(row)) {
      ctx.textAlign = 'center';
      ctx.font = `${cs}px 'Unifont', monospace`;
      ctx.fillStyle = '#ffff00';
      ctx.fillText(spectaclesTransformString('CONFIRM?', spectacles), boxX + boxW / 2, headerY);
    } else {
      const glyphX = boxX + boxW / 2 - nameW / 2 - cs;
      ctx.textAlign = 'center';
      ctx.font = `${cs * 1.2}px 'Unifont', monospace`;
      ctx.fillStyle = getItemData(row.char)?.color || '#ffffff';
      ctx.fillText(row.char, glyphX, headerY);
      ctx.textAlign = 'left';
      ctx.font = `${cs * 0.85}px 'Unifont', monospace`;
      ctx.fillStyle = '#cccccc';
      ctx.fillText(spectaclesTransformString(wareName(row), spectacles), glyphX + cs, headerY);
    }

    // Cost strip: each gem, then the coin.
    const rowX = boxX + (boxW - laneRowW) / 2;
    const rowY = boxY + cs * 4;
    const held = state.heldGems(row);
    ctx.textAlign = 'center';
    for (let i = 0; i < lanes; i++) {
      const x = rowX + i * (laneCell + gap) + laneCell / 2;
      const isCoin = i === row.gems.length;
      const have = isCoin ? state.hasCoins(row) : held[i];

      ctx.font = `${cs}px 'Unifont', monospace`;
      ctx.fillStyle = have ? BRACKET_COLOR : MISSING;
      ctx.fillText('[', x - cs * 0.55, rowY);
      ctx.fillText(']', x + cs * 0.55, rowY);
      ctx.fillStyle = isCoin ? COIN_COLOR : (getItemData(row.gems[i])?.color || '#ffffff');
      ctx.fillText(isCoin ? 'c' : row.gems[i], x, rowY);

      if (isCoin) {
        ctx.font = `${cs * 0.5}px 'Unifont', monospace`;
        ctx.fillStyle = '#888888';
        ctx.fillText(String(state.coinCost(row)), x, rowY + cs * 1.1);
      }
    }

    ctx.globalAlpha = 1;
  }
}

function wareName(row) {
  return (getItemData(row.char)?.name || row.char).toUpperCase();
}
