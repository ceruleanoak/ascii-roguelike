import { GRID, INTERACTION_RANGE } from '../../game/GameConfig.js';

// Sinkhole render helper, split out of ExploreRenderer.js to stay under its
// architecture budget — standalone function taking `renderer`, matching the
// drawSniperIndicators pattern (rendering/effects/).

// Draws every revealed Sinkhole glyph each frame (excluded from
// ExploreRenderer's static background pass — see the '⬤' skip there), using
// its highlightColor while SinkholeSystem reports it as interactable (in
// range + post-reveal cooldown cleared) so the player can see exactly when
// SPACE would trigger a dive.
export function drawSinkholes(renderer, game) {
  const sinkholes = game.currentRoom?.sinkholes;
  if (!sinkholes?.length) return;
  for (const sink of sinkholes) {
    const glyph = sink.glyphObj;
    if (!glyph) continue;
    const highlighted = game.sinkholeSystem?.isInteractable(sink) &&
      game.physicsSystem.getDistance(game.player, glyph) < INTERACTION_RANGE;
    const color = highlighted ? glyph.data.highlightColor : glyph.color;
    renderer.drawEntity(
      glyph.position.x + GRID.CELL_SIZE / 2,
      glyph.position.y + GRID.CELL_SIZE / 2,
      glyph.char,
      color
    );
  }
}
