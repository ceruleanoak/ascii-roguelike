// TrineDraw — the Mist Battle's Flank bodies (MistBattleSystem). The Primary
// is game.player and draws through the normal player path; this draws the two
// Flanks as full characters ('@' in their own character color), never as
// companions, a step dimmer than the Primary so the one you steer reads at a
// glance. After a 1/2/3 swap every body (Primary included) briefly shows its
// newly held weapon glyph half a cell above it.
//
// Surface-plane only: the Mist Battle arena is a plain gray combat room with no
// Interior, so there is no PiP pass to share this with.
import { GRID } from '../../game/GameConfig.js';

const FLANK_ALPHA_MULT = 0.7;

export function drawTrine(renderer, game) {
  const mist = game.mistBattleSystem;
  if (!mist?.active) return;
  const half = GRID.CELL_SIZE / 2;
  for (const { body, swapFlash } of mist.members) {
    const weapon = body.heldItem;
    if (swapFlash <= 0 || !weapon || body.hp <= 0) continue;
    renderer.drawTextWithAlpha(
      body.position.x + half,
      body.position.y + half - GRID.CELL_SIZE,
      weapon.char,
      weapon.color,
      1
    );
  }
  for (const { body } of mist.flanks()) {
    renderer.drawTextWithAlpha(
      body.position.x + half,
      body.position.y + half,
      body.char,
      body.getDisplayColor(),
      body.getVisibilityAlpha() * FLANK_ALPHA_MULT
    );
  }
}
