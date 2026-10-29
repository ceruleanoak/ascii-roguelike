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

import { inSamePlane } from './PlaneSystem.js';

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
      // A downed foe or one on another plane can't be fought — skipping it
      // lets a charmed enemy move on to the next live hostile.
      if (other.isDying || other.hp <= 0 || !inSamePlane(enemy, other)) continue;
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
    // A wish-charmed enemy (CHARM, InfluenceSystem) answers for the whole
    // room, not just a cluster: its aggro memory is pulled to its foe the way
    // a noise source pulls an enemy, so it hunts one out of aggro range.
    if (enemy.wishCharmed && nearestEnemy) {
      if (!enemy.aggroMemoryActive) enemy.memoryMoveDelayTimer = 0;
      enemy.lastKnownPosition = { x: nearestEnemy.position.x, y: nearestEnemy.position.y };
      enemy.aggroMemoryActive = true;
    }
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

/**
 * The distance an Enemy's detection and range checks see to its target.
 *
 * Gate all detection and range conditions on plane membership.
 * If the player is on a different plane and this enemy isn't already in pursuit
 * (enraged or memory-active), treat the player as infinitely far away so that
 * no new aggro, memory marks, or movement toward the player can occur cross-plane.
 * Commanded units are unconditionally infinitely far from the player — that is
 * what "removed from the aggro list" means mechanically (CommandSystem): no
 * detection, windup, leap/charge-at-player, or memory mark can ever resolve.
 * A wish-charmed enemy is the same toward the player only — it still has
 * to close on the enemy it fights. (Every enemy-like target answers
 * isCharmed(); the player doesn't.)
 */
export function effectiveTargetDistance(enemy, distance) {
  const wishSparesPlayer = enemy.wishCharmed && typeof enemy.target?.isCharmed !== 'function';
  if (enemy.commanded || wishSparesPlayer) return Infinity;
  return (inSamePlane(enemy, enemy.target) || enemy.enraged || enemy.aggroMemoryActive)
    ? distance
    : Infinity;
}
