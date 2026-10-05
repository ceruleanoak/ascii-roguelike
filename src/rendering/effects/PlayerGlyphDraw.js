import { GRID } from '../../game/GameConfig.js';
import { drawFloatPlatform } from './FloatPlatformDraw.js';
import { whirlwindSpinAngle } from './WeaponPreviewDraw.js';

// The player's own glyph — one draw for every Frame Owner (Frame Pass
// `playerGlyph`). Before this lived in five hand-kept copies (surface, floor
// PiP, maze PiP, REST, NEUTRAL) that had drifted apart: REST had no Moss
// Cloak, the interiors had no Whirlwind spin, NEUTRAL ignored status colors.
//
// `concealAlpha` is the surface tall-grass fade (ExploreRenderer
// .playerConcealAlpha); every other owner has no tall grass and passes 1.
export function drawPlayerGlyph(renderer, game, owner, concealAlpha = 1) {
  const player = game.player;
  if (concealAlpha <= 0.005) return;

  // NEUTRAL room scripts drive their own pulse (spawn-in, celebration).
  const alpha = owner === 'neutral'
    ? (player.getPulseAlpha?.() ?? 1.0)
    : (player.getVisibilityAlpha?.() ?? 1.0);
  // Moss Cloak active: the player renders as a bush `%` in moss-green.
  const mossActive = player.mossCloakActive === true;
  const char = mossActive ? '%' : player.char;
  const color = mossActive ? '#228822' : (player.getDisplayColor?.() ?? player.color);
  const x = player.position.x + GRID.CELL_SIZE / 2;
  const y = player.position.y + GRID.CELL_SIZE / 2;

  const ctx = renderer.fgCtx;
  const needsAlpha = concealAlpha < 0.999;
  drawFloatPlatform(renderer, player);
  if (needsAlpha) { ctx.save(); ctx.globalAlpha = concealAlpha; }

  const spinAngle = whirlwindSpinAngle(player);
  if (player.plane === 1) {
    // Tunnel/cave plane: dithered, like everything else down there.
    renderer.drawTextWithAlphaDithered(x, y, char, color, alpha);
  } else if (spinAngle !== null) {
    // Whirlwind Cape dodge: spinning glyph, no alpha (iframes are short).
    renderer.drawEntityRotated(x, y, char, color, spinAngle);
  } else {
    renderer.drawTextWithAlpha(x, y, char, color, alpha);
  }

  if (needsAlpha) ctx.restore();
}
