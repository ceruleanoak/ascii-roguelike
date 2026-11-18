import { GRID } from '../../game/GameConfig.js';
import { ENDINGS } from '../../systems/EndingSystem.js';

/**
 * The GAME OVER screen of each Ending (EndingSystem). Text only, no glyphs:
 * GAME OVER never changes; the ground, its color and the line under it do.
 *
 *   ground      — an opaque fill under the death effects, hiding the room.
 *                 The Mist and Crown Endings need none: in gray the closed
 *                 mist field is their ground (GrayZoneSystem.renderMistGameOver).
 *   color       — GAME OVER's color.
 *   line        — the line under GAME OVER, (game) => text. Fallen has none,
 *                 so the line is itself the sign of a unique Ending.
 */
// The Mist Ending counts the heroes the mist took: one or two (a third opens
// the Mist Battle instead).
const COUNT_WORDS = ['', 'One', 'Two', 'Three'];
function heroesTaken(game) {
  const count = game.lostCharacters?.length ?? 0;
  if (count === 1) return 'One Hero Taken';
  return `${COUNT_WORDS[count] ?? count} Heroes Taken`;
}

export const ENDING_SCREENS = Object.freeze({
  [ENDINGS.FALLEN]:          { color: '#ff0000' },
  [ENDINGS.MIST]:            { color: '#b4b4ba', line: heroesTaken },
  [ENDINGS.CROWN]:           { color: '#ffffff', line: () => 'Inheritor Found' },
  [ENDINGS.DEATH_FULFILLED]: { ground: '#000000', color: '#ffffff', line: () => 'The Crown Calls' },
  [ENDINGS.DEATH_FALLEN]:    { ground: '#000000', color: '#ff0000', line: () => 'There is more to learn' },
});

// The Ending's line center, cells below GAME OVER's center.
const LINE_CELLS = 2.5;

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

/**
 * The Ending's line under GAME OVER ('One Hero Taken'), in its color.
 * True when drawn — the SPACE prompt then sits below it.
 */
export function drawEndingLine(ctx, game) {
  const { line, color } = endingScreen(game);
  if (!line) return false;
  ctx.save();
  ctx.font = `${GRID.CELL_SIZE}px 'VentureArcade', monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(line(game), GRID.WIDTH / 2, GRID.HEIGHT / 2 + GRID.CELL_SIZE * LINE_CELLS);
  ctx.restore();
  return true;
}
