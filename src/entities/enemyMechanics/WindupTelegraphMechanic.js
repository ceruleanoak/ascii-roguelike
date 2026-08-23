// WindupTelegraphMechanic — the enemy-windup indicator surface: whether an
// enemy is mid-windup, the tell shown above it (its equipped weapon's own
// char, or a red '!' when it's fighting bare-handed), the bow-draw bar ratio
// for equipped-bow enemies, and the guaranteed-crit / white-flash back-half
// window. Pulled out of Enemy.js (Entity Size Norms: AI/pathfinding/status/
// item-usage live there; presentation-layer indicator getters do not) so the
// core file stops growing with every new telegraph signal. Enemy.js keeps
// thin wrapper methods (isWindingUp, isInCritWindow, getWindupFlashColor,
// getWindupIndicator, getBowChargeRatio) so LakeBoss's own overrides and
// every existing call site keep working unchanged.
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

  // The windup tell above the enemy's head. An equipped weapon replaces the
  // generic '!' with its own char (in its own color) — the player learns to
  // read "what's above the goblin" as "what's about to hit me" the same way
  // they read their own held item. Bare-handed enemies (Wizard, native
  // melee/ranged with no `equippedWeapon`) keep the plain red '!'.
  getWindupIndicator(enemy) {
    if (this.isWindingUp(enemy)) {
      if (enemy.equippedWeapon) {
        return {
          char: enemy.equippedWeapon.char,
          color: enemy.equippedWeapon.data.color || '#ffffff',
          offsetY: -GRID.CELL_SIZE  // Position above enemy
        };
      }
      return {
        char: '!',
        color: '#ff0000',
        offsetY: -GRID.CELL_SIZE  // Position above enemy
      };
    }
    return null;
  },

  // Bow-draw ratio for an equipped-bow enemy's windup, 0→1 as the windup
  // counts down — the same number BowChargeIndicator turns into a growing
  // bar for the player, so a goblin drawing a bow reads with the exact visual
  // cue the player already knows as "arrow coming." Driven off the windup
  // itself rather than the bow item's own charge state: enemies release their
  // bow at zero charge the instant the windup ends (see Enemy.createAttack's
  // BOW branch), so the windup *is* the draw, not a separate charge-up.
  // Null when there's nothing to show: unarmed, mid-swing of a non-bow
  // weapon, or not winding up at all.
  getBowChargeRatio(enemy) {
    if (enemy.equippedWeapon?.data?.weaponType !== 'BOW') return null;
    if (!this.isWindingUp(enemy)) return null;
    const total = enemy.windupDuration || enemy.attackWindup;
    if (!total) return null;
    return 1 - Math.max(0, Math.min(1, enemy.windupTimer / total));
  }
};
