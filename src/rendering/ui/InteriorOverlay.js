/**
 * InteriorOverlay — single picture-in-picture dispatch point for all interiors
 * (ADR-0001). Routes to the per-kind content overlay based on the active
 * interior, so ExploreRenderer has one call and a new interior plugs in by
 * registering its overlay here rather than adding another `if (player.inX)` block.
 *
 * The per-kind overlays own their content; the shared frame they all draw lives
 * in interiorFrame.js.
 */
export class InteriorOverlay {
  constructor(renderer, renderController) {
    this.renderer = renderer;
    this.renderController = renderController;
    // Hut and dungeon share one overlay (auto-sizes from the active floor).
    this.overlays = {
      hut:     renderController.hutInteriorOverlay,
      dungeon: renderController.hutInteriorOverlay,
      maze:    renderController.mazeInteriorOverlay,
    };
  }

  /** Register a per-kind content overlay. */
  register(kind, overlay) {
    this.overlays[kind] = overlay;
  }

  render(game) {
    const kind = game.interiorManager?.activeKind;
    if (!kind) return;
    this.overlays[kind]?.render(game);
  }
}
