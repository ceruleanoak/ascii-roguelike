// Bread-seek (wild rat): the dropped-loaf override. While a loaf is on the
// bypassing detection, state machine, and attack creation entirely, so a rat
// can't bite mid-seek (the bread-feed taming economy depends on that window;
// see CompanionSystem's eat/tame side and Enemy.js's setTamed).
//
// Extracted from Enemy.update to its Mechanic file per the composition rule
// (enemy behaviors are mechanics, not inline branches) — same velocity-write
// contract the block always had: position integration stays with
// PhysicsSystem next frame; this only decides the heading.
export const BreadSeekMechanic = {
  /**
   * @param {Enemy} enemy
   * @returns {boolean} true when the seek owns this frame's AI — caller must
   *   skip its remaining update pipeline (and DOT collection mirrors the old
   *   early return shape: `{ dotDamage: [] }`).
   */
  update(enemy) {
    if (!(enemy.seekingBread && enemy.breadTarget)) return false;

    const t = enemy.breadTarget;
    if (t.consumed || t.destroyed) {
      // Loaf gone mid-seek: fall through to default AI.
      enemy.seekingBread = false;
      enemy.breadTarget = null;
      return false;
    }

    const dx = t.position.x - enemy.position.x;
    const dy = t.position.y - enemy.position.y;
    const d = Math.hypot(dx, dy) || 1;
    const speed = enemy.speed;
    // Written to BOTH stores so the canonical tick's blend converges on the
    // seek heading instead of dragging back toward the pre-seek momentum.
    enemy.targetVelocity.vx = (dx / d) * speed;
    enemy.targetVelocity.vy = (dy / d) * speed;
    enemy.velocity.vx = enemy.targetVelocity.vx;
    enemy.velocity.vy = enemy.targetVelocity.vy;
    enemy.state = 'chase';
    // Reset strike cadence so CombatSystem's post-update canAttack/createAttack
    // can't fire mid-seek (kept attacking the player otherwise).
    enemy.windupTimer = 0;
    if (enemy.attackTimer < 0.5) enemy.attackTimer = 0.5;
    return true;
  }
};
