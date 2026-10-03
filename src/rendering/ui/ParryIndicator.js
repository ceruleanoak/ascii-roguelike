/**
 * ParryIndicator - the ']' drawn one cell above a parry holder while its
 * parry window is active. One helper for both holders (enemy parryMechanic
 * and the player's Buckler), so the tell reads the same from either side.
 * Called from ExploreRenderer (surface enemies + player; enemies also reach
 * it through the interior PiP via renderEnemy) and the Hut/Maze interior
 * overlays for the player.
 */

import { GRID } from '../../game/GameConfig.js';

const DEFAULT_PARRY_COLOR = '#eeeeff';

/** `cfg` is the holder's parryMechanic config. No-op unless parry is active. */
export function drawParryIndicator(renderer, holder, cfg) {
  if (!holder?.parryActive) return;
  renderer.drawEntity(
    holder.position.x + GRID.CELL_SIZE / 2,
    holder.position.y + GRID.CELL_SIZE / 2 - GRID.CELL_SIZE,
    ']',
    cfg?.parryColor || DEFAULT_PARRY_COLOR
  );
}
