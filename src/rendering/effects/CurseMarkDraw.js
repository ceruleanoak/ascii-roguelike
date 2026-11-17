import { GRID } from '../../game/GameConfig.js';
import { ZONE_COLORS } from '../../data/zones.js';
import { blendColors } from '../../systems/ZoneSystem.js';

// The Curse Mark (CursedRunSystem.begin) and the Consume Pull (ConsumeSystem)
// — the two draws of power coming into the player.

const MARK_STREAMS = 10;            // spokes the power comes in along
const MARK_DOTS_PER_STREAM = 3;
const MARK_RADIUS = GRID.CELL_SIZE * 4;
const MARK_LAPS = 3;                // times each dot runs the spoke during the pull

/**
 * The Curse Mark's pull: dots stream in along spokes from all around and
 * vanish into the player, white at the rim going gray at the body. The
 * player's glyph goes gray alongside (curseMarkColor, PlayerGlyphDraw).
 */
export function drawCurseMark(renderer, game) {
  const mark = game.cursedRunSystem?.markProgress();
  if (mark?.pull == null) return;
  const player = game.player;
  const cx = player.position.x + GRID.CELL_SIZE / 2;
  const cy = player.position.y + GRID.CELL_SIZE / 2;
  // The streams thin out toward the end of the pull, so it lands rather than stops.
  const strength = 1 - mark.pull * mark.pull;
  for (let i = 0; i < MARK_STREAMS; i++) {
    const angle = (i / MARK_STREAMS) * Math.PI * 2 + mark.pull * 0.6;
    for (let k = 0; k < MARK_DOTS_PER_STREAM; k++) {
      const f = (mark.pull * MARK_LAPS + k / MARK_DOTS_PER_STREAM + i * 0.13) % 1;
      const r = MARK_RADIUS * (1 - f);
      const color = blendColors('#ffffff', ZONE_COLORS.gray, f);
      renderer.drawTextWithAlpha(
        cx + Math.cos(angle) * r,
        cy + Math.sin(angle) * r,
        f > 0.6 ? '*' : '.',
        color,
        strength * (0.4 + 0.6 * f)
      );
    }
  }
}

/** The player's glyph color with the Curse Mark's gray laid over it, if one is playing. */
export function curseMarkColor(game, color) {
  const mark = game.cursedRunSystem?.markProgress();
  if (!mark || mark.gray <= 0 || typeof color !== 'string' || !color.startsWith('#') || color.length !== 7) return color;
  return blendColors(color, ZONE_COLORS.gray, mark.gray);
}

/**
 * Consume Pulls: each consumed enemy's glyph flies into the player, speeding
 * up and shrinking as it nears, with a faint afterimage behind it.
 * @param {boolean} interior — draw the PiP-tagged pulls (floor/maze) or the surface's
 */
export function drawConsumePulls(renderer, game, interior) {
  const system = game.consumeSystem;
  if (!system?.pulls.length || !game.player) return;
  for (const pull of system.pulls) {
    if (!!pull.hutPlane !== interior) continue;
    const trail = system.pullPosition({ ...pull, t: Math.max(0, pull.t - 0.12) });
    renderer.drawTextWithAlpha(trail.x, trail.y, pull.char, pull.color || '#ffffff', 0.3);
    const at = system.pullPosition(pull);
    renderer.drawEntityScaled(at.x, at.y, pull.char, pull.color || '#ffffff', at.scale);
  }
}
