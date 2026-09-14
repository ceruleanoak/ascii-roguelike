/**
 * CyanRogueIndicator - Visual feedback for the Cyan Rogue's stealth roll
 *
 * The hide roll (`dodgeRoll.type === 'hide'`) only grants invisibility when
 * `invisRecoveryTimer` is at 0 — while that recovery window is active the
 * roll still dodges normally but silently skips the stealth effect, which
 * reads as random without a visible cue. Mirrors GreenRangerIndicator:
 *
 * Shows a cyan bar to the left of the player:
 * - Draining bar (full→empty): currently hidden (stealth window ticking out)
 * - Rising bar (empty→full): recovering before stealth can trigger again
 * - No bar: ready (stealth available on the next roll)
 */

import { GRID } from '../../game/GameConfig.js';

export class CyanRogueIndicator {
  constructor(renderer) {
    this.renderer = renderer;
  }

  render(game) {
    if (!game.player || game.activeCharacterType !== 'cyan') return;

    const player = game.player;
    const dr = player.dodgeRoll;
    const hiding = dr.hideTimer > 0;
    const recovering = !hiding && dr.invisRecoveryTimer > 0;

    if (!hiding && !recovering) return;

    const barHeight = GRID.CELL_SIZE;
    const barX = player.position.x - 8; // Left of player
    const barY = player.position.y;

    // Dim background track
    this.renderer.drawRect(barX, barY, 4, barHeight, '#003333', true);

    if (hiding) {
      // Draining bar anchored at bottom — shrinks from top down as the
      // stealth window ticks out (mirrors recovery below).
      const hideRatio = dr.hideTimer / (dr.hideDuration || 1);
      const filledHeight = Math.max(1, barHeight * hideRatio);
      this.renderer.drawRect(barX, barY + (barHeight - filledHeight), 4, filledHeight, '#44ffff', true);
    } else {
      // Rising bar shows recovery progress (fills bottom-to-top as the
      // stealth cooldown expires) — dimmer than the active-hide fill so
      // "recovering" and "hidden" read as visibly different states.
      const recoveryRatio = 1 - (dr.invisRecoveryTimer / (dr.invisRecoveryDuration || 1));
      const filledHeight = barHeight * recoveryRatio;
      if (filledHeight > 0) {
        this.renderer.drawRect(
          barX,
          barY + (barHeight - filledHeight),
          4,
          filledHeight,
          '#227777',
          true
        );
      }
    }
  }
}
