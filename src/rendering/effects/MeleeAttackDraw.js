import { GRID } from '../../game/GameConfig.js';
import { drawTelegraph } from '../../game/Telegraph.js';

/**
 * MeleeAttackDraw — the two melee passes, the player's and the enemies'.
 *
 * Lifted out of ExploreRenderer, which owned both bodies and needed nothing
 * from itself to run them but the ASCIIRenderer. ExploreRenderer still declares
 * the methods, because the interior PiP overlays call them by name with
 * hutPlane true (the render-helper pattern); what they call now is here.
 *
 * Both passes take the plane flag rather than filtering upstream: an attack
 * belongs to the surface or to an interior, and each pass is run once per plane.
 */

/**
 * The player's melee attacks.
 *
 * Two positions matter and they are not always the same one. `position` is the
 * hitbox; the glyph is normally drawn there, but an attack may set
 * `drawAboveOwner` to have its weapon held over the carrier's head instead,
 * read off the owner's root every frame so it rides the strike hop rather than
 * hanging where the swing started. An attack that does that draws its
 * `strikeChar` at the hitbox as well, so the blow still shows where it lands.
 */
export function drawPlayerMeleeAttacks(renderer, game, hutPlane = false) {
  for (const attack of game.combatSystem.getMeleeAttacks()) {
    if (!!attack.hutPlane !== hutPlane) continue;
    const useDithering = attack.shooterPlane === 1 && game.player.plane === 1;
    const anchor = (attack.drawAboveOwner && attack.owner)
      ? { x: attack.owner.position.x, y: attack.owner.position.y - GRID.CELL_SIZE }
      : attack.position;
    const cx = anchor.x + GRID.CELL_SIZE / 2;
    const cy = anchor.y + GRID.CELL_SIZE / 2;
    const scale = attack.drawScale || 1.0;
    // The hitbox's own mark. An attack whose glyph rides its carrier leaves the
    // struck cell unmarked otherwise, and a blow has to show where it lands,
    // not only who is throwing it.
    if (attack.strikeChar) {
      const strikeMethod = useDithering ? 'drawEntityDithered' : 'drawEntity';
      renderer[strikeMethod](
        attack.position.x + GRID.CELL_SIZE / 2,
        attack.position.y + GRID.CELL_SIZE / 2,
        attack.strikeChar,
        attack.color
      );
    }
    if (attack.drawAngle != null) {
      if (useDithering) {
        renderer.drawEntityRotatedDithered(cx, cy, attack.char, attack.color, attack.drawAngle, scale);
      } else {
        renderer.drawEntityRotated(cx, cy, attack.char, attack.color, attack.drawAngle, scale);
      }
    } else if (scale !== 1.0) {
      renderer.drawEntityScaled(cx, cy, attack.char, attack.color, scale);
    } else {
      const drawMethod = useDithering ? 'drawEntityDithered' : 'drawEntity';
      renderer[drawMethod](cx, cy, attack.char, attack.color);
    }
  }
}

/** The enemies' melee attacks, which carry their own alpha and telegraphs. */
export function drawEnemyMelee(renderer, game, hutPlane = false) {
  for (const attack of game.combatSystem.getEnemyMeleeAttacks()) {
    if (!!attack.hutPlane !== hutPlane) continue;

    // Telegraph-shaped attacks draw themselves in pixel space, off the shared
    // module, so the editor sandbox shows the identical thing.
    if (drawTelegraph(renderer.fgCtx, attack)) continue;

    const displayColor = attack.flashWhite ? '#ffffff' : attack.color;
    const alpha = attack.alpha !== undefined ? attack.alpha : 1.0;
    const cx = attack.position.x + GRID.CELL_SIZE / 2;
    const cy = attack.position.y + GRID.CELL_SIZE / 2;
    const scale = attack.drawScale || 1.0;
    if (attack.drawAngle != null) {
      const ctx = renderer.fgCtx;
      const prevAlpha = ctx.globalAlpha;
      ctx.globalAlpha = alpha;
      renderer.drawEntityRotated(cx, cy, attack.char, displayColor, attack.drawAngle, scale);
      ctx.globalAlpha = prevAlpha;
    } else if (scale !== 1.0) {
      const ctx = renderer.fgCtx;
      const prevAlpha = ctx.globalAlpha;
      ctx.globalAlpha = alpha;
      renderer.drawEntityScaled(cx, cy, attack.char, displayColor, scale);
      ctx.globalAlpha = prevAlpha;
    } else {
      renderer.drawTextWithAlpha(cx, cy, attack.char, displayColor, alpha);
    }
  }
}
