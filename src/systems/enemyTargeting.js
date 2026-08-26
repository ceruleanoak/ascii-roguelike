// Enemy target overrides — the per-frame pre-tick retargeting pass (bugs
// #88/#92: targeting must precede the single canonical enemy tick).
//
// Extracted from CombatSystem per the placement procedure: this is enemy-AI
// targeting, not combat resolution. CombatSystem keeps a thin delegating
// method so the three call sites (EnemyUpdateSystem surface loop,
// HutSystem/DungeonSystem interior loops) are unchanged.
//
//   Charm: fight the nearest other enemy. Noise-maker: keep the formal
//   target on the player but pull aggro memory toward the noise source.
//
// Returns true when it set the target (caller skips its own selection).

/**
 * @param {Enemy} enemy
 * @param {Array} enemies candidates on this loop's tick list (room enemies
 *   plus, on the surface loop, the commanded warband roster)
 * @param {Player} player
 * @param {{x,y,radius}|null} noiseSource active noise event, if any
 */
export function applyTargetOverrides(enemy, enemies, player, noiseSource = null) {
  if (enemy.isCharmed && enemy.isCharmed()) {
    // Charmed: fight the nearest other enemy, charmed or not. Both charm
    // sources (Garnet Staff AOE, Charm Lure trap) hit every enemy in a
    // radius at once, so excluding charmed peers here meant a
    // simultaneously-charmed cluster could never find each other as valid
    // targets and all fell back to attacking the player instead of turning
    // on one another (bug #202).
    let nearestEnemy = null;
    let nearestDist = Infinity;
    for (const other of enemies) {
      if (other === enemy) continue;
      // Commanded units never turn on each other — the warband's hostility
      // is reserved for the unsworn. Temporary charm keeps the original
      // free-for-all.
      if (enemy.commanded && other.commanded) continue;
      const dx = other.position.x - enemy.position.x;
      const dy = other.position.y - enemy.position.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < nearestDist) {
        nearestDist = d;
        nearestEnemy = other;
      }
    }
    // No special player fallback needed for commanded units even when no
    // hostile is present: Enemy.update computes Infinite effectiveDistance
    // to the player for them (the aggro-list removal), so a player-formal
    // target can't produce detection, pursuit, or attacks — it just keeps
    // the full per-frame pipeline (status ticks, blending) alive between
    // fights. CommandSystem steers those idle bodies into its follow ring.
    enemy.setTarget(nearestEnemy ?? player);
    return true;
  }
  // Noise-maker redirect: pull enemy toward noise source instead of player
  if (noiseSource) {
    const dx = noiseSource.x - enemy.position.x;
    const dy = noiseSource.y - enemy.position.y;
    if (Math.sqrt(dx * dx + dy * dy) <= noiseSource.radius) {
      enemy.lastKnownPosition = { x: noiseSource.x, y: noiseSource.y };
      enemy.aggroMemoryActive = true;
      enemy.memoryMoveDelayTimer = 0; // Investigate immediately
      enemy.currentDirection = { x: 0, y: 0 }; // Force direction recalc toward noise
      enemy.setTarget(player); // keep formal target as player, memory pulls to noise
      return true;
    }
  }
  return false;
}
