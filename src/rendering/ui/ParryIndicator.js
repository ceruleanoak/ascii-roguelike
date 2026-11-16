/**
 * ParryIndicator - the ']' drawn one cell above a parry holder while its
 * parry window is active. One helper for both holders (enemy parryMechanic
 * and the player's Buckler), so the tell reads the same from either side.
 * Called from ExploreRenderer (surface enemies + player; enemies also reach
 * it through the interior PiP via renderEnemy) and the Hut/Maze interior
 * overlays for the player.
 */

import { GRID } from '../../game/GameConfig.js';
import { isHeldParryUp } from '../../entities/enemyMechanics/ParryMechanic.js';

const DEFAULT_PARRY_COLOR = '#eeeeff';

// How far in front of a held-parry holder its shield is drawn, in cells.
const HELD_GUARD_REACH = 0.6;

/** `cfg` is the holder's parryMechanic config. No-op unless parry is active. */
export function drawParryIndicator(renderer, holder, cfg) {
  if (!holder?.parryActive) return;
  // A held parry (Phalanx) has a front: its ']' stands on the guard side,
  // turned so the bracket's back faces outward. Where it is drawn is where
  // the blow is turned aside.
  if (cfg?.held) {
    if (!isHeldParryUp(holder)) return;
    const cx = holder.position.x + GRID.CELL_SIZE / 2;
    const cy = holder.position.y + GRID.CELL_SIZE / 2;
    const a = holder.guardAngle ?? 0;
    renderer.drawEntityRotated(
      cx + Math.cos(a) * GRID.CELL_SIZE * HELD_GUARD_REACH,
      cy + Math.sin(a) * GRID.CELL_SIZE * HELD_GUARD_REACH,
      ']',
      cfg.parryColor || DEFAULT_PARRY_COLOR,
      a
    );
    return;
  }
  renderer.drawEntity(
    holder.position.x + GRID.CELL_SIZE / 2,
    holder.position.y + GRID.CELL_SIZE / 2 - GRID.CELL_SIZE,
    ']',
    cfg?.parryColor || DEFAULT_PARRY_COLOR
  );
}
