/**
 * RestExitLabel - the " R E S T" word above an EXPLORE room's south exit.
 *
 * Fades in/out through a PixelatedDissolve as the exit opens and closes, and
 * lights each letter briefly when its key is pressed (game.keyFlashMap). The
 * word itself is the caller's: it reads " C R A F T" while the thrown-weapon
 * pointer has no weapon left to point at (ThrownWeaponPointer.js).
 */

import { GRID } from '../../game/GameConfig.js';
import { ZONE_COLORS } from '../../data/zones.js';
import { spectaclesTransformString, isSpectaclesActive, CIPHER_FONT_SCALE } from '../../data/cipher.js';

export const REST_WORD = ' R E S T';
export const CRAFT_WORD = ' C R A F T';

const LABEL_COLOR = '#666666';
const FLASH_COLOR = '#7a7a7a';
const FLASH_MS = 220;

/**
 * Does the south exit draw open? Open while the room is unlocked, or locked
 * with nothing carried (the escape route), or while the entrance tween still
 * runs (`entering`). Never once Charon's farewell has sealed REST
 * (CursedRunSystem.isRestSealed) — the way back is shut for the run.
 */
export function southExitShowsOpen(game, entering = false) {
  if (game.cursedRunSystem.isRestSealed(game)) return false;
  const room = game.currentRoom;
  return !!(room.exits.south && (!room.exitsLocked || game.playerHasNoItems() || entering));
}

/** The south door panel's color: the wall's own, or gray once REST is sealed. */
export function southDoorColor(game, wallColor) {
  return game.cursedRunSystem.isRestSealed(game) ? ZONE_COLORS.gray : wallColor;
}

// Call every frame the room has a south exit (open or not) so the dissolve
// can animate in both directions — PixelatedDissolve handles the fade-out
// when visible=false.
export function drawRestExitLabel(renderer, game, dissolve, word, visible) {
  // A sealed REST leaves its word standing, gray, over the shut door.
  let color = LABEL_COLOR;
  if (game.cursedRunSystem.isRestSealed(game)) {
    word = REST_WORD;
    visible = true;
    color = ZONE_COLORS.gray;
  }
  const x = GRID.WIDTH / 2;
  const y = (GRID.ROWS - 3) * GRID.CELL_SIZE + GRID.CELL_SIZE / 2;
  const spectaclesOn = isSpectaclesActive(game);
  // VentureArcade has limited glyph coverage; under spectacles fall back to
  // Unifont which renders the Greek substitutes correctly.
  const font = spectaclesOn
    ? `${Math.round(GRID.CELL_SIZE * CIPHER_FONT_SCALE)}px 'Unifont', monospace`
    : `${GRID.CELL_SIZE}px 'VentureArcade', 'Unifont', monospace`;
  const text = spectaclesTransformString(word, spectaclesOn);
  dissolve.render(renderer.fgCtx, { text, font, color, x, y, visible });

  // Overlay lit letters on top of dissolve (one-shot blink)
  if (dissolve.alpha <= 0) return;
  const now = performance.now();
  const flashMap = game.keyFlashMap || {};
  const ctx = renderer.fgCtx;
  ctx.save();
  ctx.globalAlpha = dissolve.alpha;
  ctx.font = font;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const totalW = ctx.measureText(text).width;
  const charW = totalW / text.length;
  let cx = x - totalW / 2;
  for (let i = 0; i < text.length; i++) {
    // Flash lookup uses the original Latin letter so the keypress still lights the right slot.
    const upper = word[i].toUpperCase();
    if (upper !== ' ' && flashMap[upper] !== undefined && (now - flashMap[upper]) < FLASH_MS) {
      ctx.fillStyle = FLASH_COLOR;
      ctx.fillText(text[i], cx, y);
    }
    cx += charW;
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}
