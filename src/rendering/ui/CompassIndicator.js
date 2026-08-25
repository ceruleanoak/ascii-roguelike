/**
 * CompassIndicator — persistent bottom-right HUD dial for the Compass (⌖).
 *
 * Unlike OffscreenEnemyIndicators (edge-of-screen pointers that appear only
 * when a target is clipped by zoom), this is a fixed dial that's always in
 * the same spot while the Compass is held and a room exit is marked — a
 * needle whose angle is recomputed every frame from the live player-to-
 * target vector, drawn on the zoom-exempt UI layer so it never drifts with
 * CameraZoomSystem's transform.
 *
 * Only relevant to the Explore-mode directional arrow (CompassSystem) —
 * dungeon interiors have their own beep-only Compass behavior
 * (DungeonPuzzleSystem), so this widget is gated off whenever an interior
 * PiP is active.
 */

import { GRID } from '../../game/GameConfig.js';
import { isInteriorActive } from '../../systems/PlaneSystem.js';

const MARGIN = 16;
const DIAL_RADIUS = 11;

export class CompassIndicator {
  constructor(renderer) {
    this.renderer = renderer;
  }

  render(game) {
    if (isInteriorActive(game)) return;

    const compass = game.compassSystem;
    const player = game.player;
    if (!compass || !player) return;

    const holding = (player.quickSlots || []).some(it => it?.char === '⌖');
    if (!holding) return;

    const target = compass.getMarkedTargetPosition();
    if (!target) return;

    const cx = GRID.WIDTH - MARGIN;
    const cy = GRID.HEIGHT - MARGIN;
    const px = player.position.x + (player.width ?? GRID.CELL_SIZE) / 2;
    const py = player.position.y + (player.height ?? GRID.CELL_SIZE) / 2;
    const dx = target.x - px;
    const dy = target.y - py;
    if (dx === 0 && dy === 0) return;

    // Bearing convention matches OffscreenEnemyIndicators: angle 0 = glyph's
    // natural "up" orientation, positive rotates clockwise toward east.
    const angle = Math.atan2(dx, -dy);

    const ctx = this.renderer.uiCtx;
    ctx.save();
    ctx.globalAlpha = 0.8;
    ctx.strokeStyle = '#66ccff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, DIAL_RADIUS, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // '^' — printable-ASCII UI glyph (see CLAUDE.md Character Encoding
    // Rule), same needle glyph OffscreenEnemyIndicators already established.
    this.renderer.drawUIEntityRotated(cx, cy, '^', '#66ccff', angle, 1.1);
  }
}
