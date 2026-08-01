// WindupTelegraphMechanic — the enemy-windup indicator surface: whether an
// enemy is mid-windup, the red '!' tell shown above it, and the
// guaranteed-crit / white-flash back-half window. Pulled out of Enemy.js
// (Entity Size Norms: AI/pathfinding/status/item-usage live there;
// presentation-layer indicator getters do not) so the core file stops
// growing with every new telegraph signal. Enemy.js keeps thin wrapper
// methods (isWindingUp, isInCritWindow, getWindupFlashColor,
// getWindupIndicator) so LakeBoss's own overrides and every existing call
// site keep working unchanged.
import { GRID } from '../../game/GameConfig.js';

export const WindupTelegraphMechanic = {
  isWindingUp(enemy) {
    return enemy.state === 'windup' && enemy.windupTimer > 0;
  },

  // Guaranteed-crit / white-flash window: only the back half of the windup,
  // scaled to this swing's own windup length (a 2s heavy telegraph and a
  // 0.2s jab both punish over their back half, not a fixed span).
  // `windupDuration` is the value windupTimer started this windup at.
  isInCritWindow(enemy) {
    if (!this.isWindingUp(enemy)) return false;
    const total = enemy.windupDuration || enemy.attackWindup;
    return enemy.windupTimer <= total / 2;
  },

  // Solid white for the crit window — the same color the hit-flash uses,
  // but steady rather than blinking, so the punishable half of a
  // telegraphed swing reads as "hit this now" right where the guaranteed
  // crit applies.
  getWindupFlashColor(enemy) {
    return this.isInCritWindow(enemy) ? '#ffffff' : null;
  },

  getWindupIndicator(enemy) {
    if (this.isWindingUp(enemy)) {
      return {
        char: '!',
        color: '#ff0000',
        offsetY: -GRID.CELL_SIZE  // Position above enemy
      };
    }
    return null;
  }
};
