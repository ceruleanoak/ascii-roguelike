// Invisible Approach (Ice Wraith): the enemy is Invisible while it closes in,
// and shows itself to attack.
//
// Invisible is the Sniper's own concealment, generalized: `enemy.invisible`
// is the one flag every reader goes by — ExploreRenderer.renderEnemy fades the
// enemy out through the shared stepConcealmentAlpha, and isConcealedEnemy
// keeps it off offscreen arrows, LOOKHERE, the camera zoom and a keen
// weapon's aim. It stays hittable: a swing that finds it still lands.
//
// The enemy is visible while any attack is under way, and while its target is
// within `revealRange` (so the attack's tell is seen before the attack comes,
// not after):
//   - a Frost Lunge windup or lunge (FrostLungeMechanic's frostLungePhase),
//   - a sap latch (enemy.sapping),
//   - the spine's Anticipate or Strike State, or any running windup.
// Anywhere else — wandering, searching, approaching from across the room — it
// is Invisible.
//
// It deals no damage while Invisible. That holds by construction rather than
// by filtering: every way this enemy hurts (the Frost Line, the sap tick, a
// Strike) is produced only inside one of the attack phases above, and this
// runs from EnemyUpdateSystem right after the enemy's tick, before
// CombatSystem consumes that tick's result, so a damaging frame is always a
// visible frame. A new damage path for an Invisible Approach enemy must be
// added to attackUnderWay or it would break that rule.

import { GRID } from '../../game/GameConfig.js';

const ATTACK_STATES = new Set(['anticipate', 'strike']);

function attackUnderWay(enemy) {
  if (enemy.sapping) return true;
  if (enemy.frostLungePhase && enemy.frostLungePhase !== 'idle') return true;
  if (enemy.windupTimer > 0) return true;
  return ATTACK_STATES.has(enemy.stateMachine?.current);
}

function targetInRevealRange(enemy, revealRange) {
  const target = enemy.target;
  if (!target?.position) return false;
  const dx = target.position.x - enemy.position.x;
  const dy = target.position.y - enemy.position.y;
  return dx * dx + dy * dy <= revealRange * revealRange;
}

export const InvisibleApproachMechanic = {
  isEnabled(enemy) {
    return enemy.data?.invisibleApproach?.enabled === true;
  },

  // Starts Invisible: it enters the room unseen.
  init(enemy) {
    enemy.invisible = true;
  },

  // Once per frame, after the enemy's tick (EnemyUpdateSystem._runEnemyLoop).
  update(enemy) {
    const cfg = enemy.data?.invisibleApproach;
    if (!cfg?.enabled) return;
    const revealRange = cfg.revealRange ?? GRID.CELL_SIZE * 6;
    enemy.invisible = !attackUnderWay(enemy) && !targetInRevealRange(enemy, revealRange);
  },
};
