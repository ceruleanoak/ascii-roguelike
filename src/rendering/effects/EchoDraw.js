// EchoDraw — the Dragon Spirit's Echo (DragonSpiritSystem): the player's own
// glyph and color beside them, drawn fainter so it reads as a spirit twin, not
// a second character. Drawn only while the Echo is present (equipped, unbroken,
// EXPLORE, and a free side to stand on).
import { GRID } from '../../game/GameConfig.js';

const ECHO_ALPHA_MULT = 0.6;

export function drawEcho(renderer, game) {
  const spirit = game.dragonSpiritSystem;
  if (!spirit?.present) return;
  const player = game.player;
  const half = GRID.CELL_SIZE / 2;
  renderer.drawTextWithAlpha(
    spirit.carrier.position.x + half,
    spirit.carrier.position.y + half,
    player.char,
    player.getDisplayColor(),
    player.getVisibilityAlpha() * ECHO_ALPHA_MULT
  );
}
