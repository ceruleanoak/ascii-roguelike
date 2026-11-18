import { GRID } from '../../game/GameConfig.js';
import { CHARACTER_TYPES } from '../../data/characters.js';
import { ENDINGS } from '../../systems/EndingSystem.js';

/**
 * The GAME OVER screen of each Ending (EndingSystem). The words never change;
 * the ground, their color and the glyph above them do.
 *
 *   ground      — an opaque fill under the death effects, hiding the room.
 *                 The Mist and Crown Endings need none: in gray the closed
 *                 mist field is their ground (GrayZoneSystem.renderMistGameOver).
 *   color       — GAME OVER's color.
 *   glyph       — drawn above GAME OVER, in glyphColor.
 *   lostHeroes  — one '@' above GAME OVER for every character the mist took,
 *                 in that character's color, dim.
 *   word        — the name line under GAME OVER: '[name] <word>', the name
 *                 game.endingCharacter's. Fallen has none, so a name line is
 *                 itself the sign of a unique Ending.
 */
export const ENDING_SCREENS = Object.freeze({
  [ENDINGS.FALLEN]:          { color: '#ff0000' },
  [ENDINGS.MIST]:            { color: '#b4b4ba', lostHeroes: true, word: 'taken' },
  [ENDINGS.CROWN]:           { color: '#ffffff', glyph: '♛', glyphColor: '#ffffff', word: 'crowned' },
  [ENDINGS.DEATH_FULFILLED]: { ground: '#000000', color: '#ffffff', glyph: '☠', glyphColor: '#ffffff', word: 'fulfilled' },
  [ENDINGS.DEATH_FALLEN]:    { ground: '#000000', color: '#ff0000', glyph: '☠', glyphColor: '#444444', word: 'fallen' },
});

const LOST_HERO_ALPHA = 0.5;
// Glyph row center, cells above GAME OVER's center.
const GLYPH_ROW_CELLS = 3;
// Cells between one lost hero and the next.
const LOST_HERO_SPACING_CELLS = 3;
// Name line center, cells below GAME OVER's center.
const NAME_LINE_CELLS = 2.5;

/** The screen for the run's Ending; a run with none falls back to Fallen. */
export function endingScreen(game) {
  return ENDING_SCREENS[game.ending] ?? ENDING_SCREENS[ENDINGS.FALLEN];
}

/** The Ending's ground over the whole foreground, or nothing. True when drawn. */
export function drawEndingGround(ctx, game) {
  const { ground } = endingScreen(game);
  if (!ground) return false;
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.fillStyle = ground;
  ctx.fillRect(0, 0, GRID.WIDTH, GRID.HEIGHT);
  ctx.restore();
  return true;
}

/** The glyph row above GAME OVER (the Ending's glyph, or its lost heroes). */
export function drawEndingGlyphs(ctx, game) {
  const screen = endingScreen(game);
  const y = GRID.HEIGHT / 2 - GRID.CELL_SIZE * GLYPH_ROW_CELLS;

  ctx.save();
  ctx.font = `${GRID.CELL_SIZE * 2}px 'Unifont', monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (screen.glyph) {
    ctx.fillStyle = screen.glyphColor;
    ctx.fillText(screen.glyph, GRID.WIDTH / 2, y);
  }

  if (screen.lostHeroes) {
    const lost = game.lostCharacters || [];
    const spacing = GRID.CELL_SIZE * LOST_HERO_SPACING_CELLS;
    ctx.globalAlpha = LOST_HERO_ALPHA;
    lost.forEach((type, i) => {
      const x = GRID.WIDTH / 2 + (i - (lost.length - 1) / 2) * spacing;
      ctx.fillStyle = CHARACTER_TYPES[type]?.color ?? screen.color;
      ctx.fillText('@', x, y);
    });
  }

  ctx.restore();
}

/**
 * The name line under GAME OVER ('Gold Hero taken'), in the Ending's color.
 * True when drawn — the SPACE prompt then sits below it.
 */
export function drawEndingNameLine(ctx, game) {
  const { word, color } = endingScreen(game);
  const name = CHARACTER_TYPES[game.endingCharacter]?.name;
  if (!word || !name) return false;
  ctx.save();
  ctx.font = `${GRID.CELL_SIZE}px 'VentureArcade', monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(`${name} ${word}`, GRID.WIDTH / 2, GRID.HEIGHT / 2 + GRID.CELL_SIZE * NAME_LINE_CELLS);
  ctx.restore();
  return true;
}
