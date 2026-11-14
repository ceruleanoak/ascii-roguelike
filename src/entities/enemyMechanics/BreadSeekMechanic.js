// Bread-seek (wild rat): the dropped-loaf override. While a loaf is on the
// bypassing detection, state machine, and attack creation entirely, so a rat
// can't bite mid-seek (the bread-feed taming economy depends on that window;
// see CompanionSystem's eat/tame side and Enemy.js's setTamed).
//
// Extracted from Enemy.update to its Mechanic file per the composition rule
// (enemy behaviors are mechanics, not inline branches) — same velocity-write
// contract the block always had: position integration stays with
// PhysicsSystem next frame; this only decides the heading.

import { GRID } from '../../game/GameConfig.js';

// Within this range of the loaf (and in sight of it) the rat steers straight
// at it every frame instead of through navigation's decision cadence.
const ARRIVE_DIST = GRID.CELL_SIZE * 3;

export const BreadSeekMechanic = {
  /**
   * @param {Enemy} enemy
   * @param {number} deltaTime
   * @returns {boolean} true when the seek owns this frame's AI — caller must
   *   skip its remaining update pipeline (and DOT collection mirrors the old
   *   early return shape: `{ dotDamage: [] }`).
   */
  update(enemy, deltaTime) {
    if (!(enemy.seekingBread && enemy.breadTarget)) return false;

    const t = enemy.breadTarget;
    if (t.consumed || t.destroyed) {
      // Loaf gone mid-seek: fall through to default AI.
      enemy.seekingBread = false;
      enemy.breadTarget = null;
      return false;
    }

    enemy.state = 'chase';
    // Reset strike cadence so CombatSystem's post-update canAttack/createAttack
    // can't fire mid-seek (kept attacking the player otherwise).
    enemy.windupTimer = 0;
    if (enemy.attackTimer < 0.5) enemy.attackTimer = 0.5;

    // Route through the same obstacle-aware vector navigation the default
    // chase state uses (path nodes, stuck detection, rotation search around
    // obstructions) instead of a bare straight-line vector (bug #266) — a
    // direct line permanently wedges the rat against any wall or piece of
    // furniture standing between it and the loaf, which is the normal case
    // in a real room and simply didn't exist in the open test room this
    // shipped against. updateVectorNavigation only writes targetVelocity;
    // snap velocity to match (BOTH stores, as before) since this mechanic
    // returns early from Enemy.update() and skips the canonical _blendVelocity
    // smoothing step entirely.
    //
    // This mechanic returns before Enemy.update ticks `decisionTimer`, and
    // navigation only re-aims on a decision frame (or when stuck/obstructed),
    // so the seek keeps that clock running itself. Without it the rat kept the
    // heading of its first seek frame and walked straight past the loaf.
    enemy.decisionTimer -= deltaTime;
    const dx = t.position.x - enemy.position.x;
    const dy = t.position.y - enemy.position.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < ARRIVE_DIST && enemy.hasLineOfSight(enemy.position, t.position, dist)) {
      // Close and unobstructed: home in every frame. Navigation re-aims only
      // a few times a second, which overshoots the tight eat radius
      // (CompanionSystem EAT_DIST_SQ) and orbits the loaf.
      const speed = enemy.speed * enemy.getSpeedMultiplier();
      enemy.targetVelocity.vx = dist > 0 ? (dx / dist) * speed : 0;
      enemy.targetVelocity.vy = dist > 0 ? (dy / dist) * speed : 0;
    } else {
      enemy.updateVectorNavigation(1, { x: t.position.x, y: t.position.y }, deltaTime);
    }
    if (enemy.decisionTimer <= 0) enemy.decisionTimer = enemy.decisionInterval;
    enemy.velocity.vx = enemy.targetVelocity.vx;
    enemy.velocity.vy = enemy.targetVelocity.vy;
    return true;
  }
};
