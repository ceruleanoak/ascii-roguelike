import { GRID } from '../../game/GameConfig.js';

/**
 * drawUndead — the one foreground pass for the Undead (UndeadSystem).
 *
 * A Cursed run puts them in both non-combat states — around the cracked slot
 * and in the graveyard (NEUTRAL), then inside REST once the curse has run far
 * enough — so this is a single shared helper called from both render paths
 * rather than two drawing bodies that will drift apart. Neither state has an
 * enemy pass to hang them off; foreground text is the whole of it.
 *
 * Drawn on the foreground, never baked into the background layer: these move
 * every frame, and a moving background object invalidates that cache every
 * frame.
 */
export function drawUndead(renderer, game) {
  const risen = game.undeadSystem?.undead;
  if (!risen?.length) return;

  const ctx = renderer.fgCtx;
  const cs = GRID.CELL_SIZE;

  ctx.save();
  ctx.font = `${cs}px 'Unifont', monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (const u of risen) {
    ctx.globalAlpha = u.alpha;
    ctx.fillStyle = u.color;
    ctx.fillText(u.char, u.position.x + cs / 2, u.position.y + cs / 2);
  }

  ctx.restore();
}
