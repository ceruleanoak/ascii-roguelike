// Exit letters — the N/E/W signage on an Explore Room's border (south is a
// REST label, RestExitLabel.js). Drawn by ExploreRenderer each frame on the
// foreground layer: key-press flash, Fairy-dust tint, the pre-boss gate's
// pulsing 'B', the Ridge's gray 'R', and the Spectacles cipher. Letters are never stroked or
// outlined (no strokeText, no offset copies): a pixel font smears into a blob.

import { GRID } from '../../game/GameConfig.js';
import { ZONE_COLORS } from '../../data/zones.js';
import { spectaclesTransform, isSpectaclesActive, CIPHER_FONT_SCALE } from '../../data/cipher.js';

export function drawExitLetters(renderer, game, centerX, centerY) {
  // Draw exit letters (if exits are unlocked) - only for north/east/west
  // South is boolean (returns to REST), not a letter
  if (!game.currentRoom.exitsLocked) {
    const FLASH_MS = 220;
    const now = performance.now();
    const flashMap = game.keyFlashMap || {};
    const lightenHex = (hex, t) => {
      const c = hex.replace('#', '');
      const r = Math.round(parseInt(c.slice(0, 2), 16) + t * (255 - parseInt(c.slice(0, 2), 16)));
      const g = Math.round(parseInt(c.slice(2, 4), 16) + t * (255 - parseInt(c.slice(2, 4), 16)));
      const b = Math.round(parseInt(c.slice(4, 6), 16) + t * (255 - parseInt(c.slice(4, 6), 16)));
      return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
    };
    // Per-color lerp toward white — tuned per zone since saturated colors behave differently
    const LIGHTEN_T = {
      '#00ff00': 0.40, // green
      '#ff4400': 0.40, // red
      '#44ffff': 0.30, // cyan
      '#ffff44': 0.75, // yellow — R+G maxed, only B moves so needs larger t
      '#888888': 0.40, // gray
    };
    const litExitColor = (letter, baseColor) => {
      const upper = letter.toUpperCase();
      if (flashMap[upper] !== undefined && (now - flashMap[upper]) < FLASH_MS) {
        const t = LIGHTEN_T[baseColor] ?? 0.40;
        return lightenHex(baseColor, t);
      }
      return baseColor;
    };
    // Fairy-dusted exits use a static pink tint. No animation — animated
    // letters are reserved for keyboard-input prompts (F key, etc.).
    const DUSTED_EXIT_COLOR = '#ffaaff';

    const spectaclesOn = isSpectaclesActive(game);
    // drawEntityVA uses the VentureArcade font, which lacks Greek glyph
    // coverage. Route ciphered letters through drawEntity (Unifont) instead.
    const drawExitLetter = (x, y, letter, color) => {
      if (spectaclesOn) {
        const ctx = renderer.fgCtx;
        ctx.save();
        ctx.font = `${Math.round(GRID.CELL_SIZE * CIPHER_FONT_SCALE)}px 'Unifont', monospace`;
        ctx.fillStyle = color;
        ctx.fillText(spectaclesTransform(letter, true), x, y);
        ctx.restore();
      } else {
        renderer.drawEntityVA(x, y, letter, color);
      }
    };

    // North exit
    if (game.currentRoom.exits.north && game.currentRoom.exits.north.letter) {
      const ex = game.currentRoom.exits.north;
      const { letter } = ex;
      // 'R' is always north and always reads Gray: the Ridge is the way to
      // the gray zone. Only the signage is gray: ex.color stays the Ridge
      // room's own zone, since ZoneSystem.recordExit counts it toward the
      // color streaks, and the Ridge's own north is what crosses into gray.
      const baseColor = letter === 'R' ? ZONE_COLORS.gray : ex.color;
      let displayColor;
      if ((game.preBossGateActive || game.preMinibossGateActive) && letter === 'B') {
        // Sinusoidal orange-to-red pulse (~3s period)
        const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 160);
        displayColor = `rgb(255,${Math.round(80 + 80 * pulse)},0)`;
      } else if (ex.mutated && ex.mutationSource === 'fairyDust') {
        displayColor = DUSTED_EXIT_COLOR;
      } else {
        displayColor = litExitColor(letter, baseColor);
      }
      drawExitLetter(
        centerX * GRID.CELL_SIZE + GRID.CELL_SIZE / 2,
        1 * GRID.CELL_SIZE + GRID.CELL_SIZE / 2,
        letter,
        displayColor
      );
    }

    // East exit
    if (game.currentRoom.exits.east && game.currentRoom.exits.east.letter) {
      const ex = game.currentRoom.exits.east;
      const { letter, color } = ex;
      const displayColor = (ex.mutated && ex.mutationSource === 'fairyDust')
        ? DUSTED_EXIT_COLOR
        : litExitColor(letter, color);
      drawExitLetter(
        (GRID.COLS - 2) * GRID.CELL_SIZE + GRID.CELL_SIZE / 2,
        centerY * GRID.CELL_SIZE + GRID.CELL_SIZE / 2,
        letter,
        displayColor
      );
    }

    // West exit
    if (game.currentRoom.exits.west && game.currentRoom.exits.west.letter) {
      const ex = game.currentRoom.exits.west;
      const { letter, color } = ex;
      const displayColor = (ex.mutated && ex.mutationSource === 'fairyDust')
        ? DUSTED_EXIT_COLOR
        : litExitColor(letter, color);
      drawExitLetter(
        1 * GRID.CELL_SIZE + GRID.CELL_SIZE / 2,
        centerY * GRID.CELL_SIZE + GRID.CELL_SIZE / 2,
        letter,
        displayColor
      );
    }
  }
}
