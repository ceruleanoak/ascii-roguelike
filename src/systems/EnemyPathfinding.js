/**
 * EnemyPathfinding.js
 *
 * Moved out of Enemy.js (computeNodePath) to stay under its architecture
 * budget — see CLAUDE.md "Code Placement Procedure". Self-contained
 * line-of-sight waypoint algorithm: sweeps outward from a locked direction
 * to find the next clear hop toward a target, one MAX_NODES-capped node at
 * a time. `enemy` is the Enemy instance — still needs its position,
 * pathNodes/currentNodeIndex/navDirection fields, and hasLineOfSight().
 */
import { GRID } from '../game/GameConfig.js';

export function computeNodePath(enemy, targetPos, allowFlip = false) {
  enemy.pathNodes = [];
  enemy.currentNodeIndex = 0;

  const MAX_NODES = 8;
  // nodeStep scales with distance so nearby obstacles get tight waypoints and
  // distant ones get proportionally wider hops. Clamped to [CELL_SIZE, 3*CELL_SIZE].
  const totalDist = Math.sqrt(
    (targetPos.x - enemy.position.x) ** 2 + (targetPos.y - enemy.position.y) ** 2
  );
  const nodeStep = Math.max(GRID.CELL_SIZE, Math.min(totalDist / 5, GRID.CELL_SIZE * 3));
  let pos = { x: enemy.position.x, y: enemy.position.y };

  // If we have no persistent preference yet, pick a direction now and lock it.
  // It persists across calls until allowFlip permits a reversal.
  let lockedDir = enemy.navDirection !== 0 ? enemy.navDirection : 1;

  // If the path to the target is already clear, no nodes are needed.
  {
    const dx0 = targetPos.x - pos.x;
    const dy0 = targetPos.y - pos.y;
    const d0 = Math.sqrt(dx0 * dx0 + dy0 * dy0);
    if (d0 < GRID.CELL_SIZE || enemy.hasLineOfSight(pos, targetPos, d0)) return;
  }

  // === PHASE 1: Dodge-direction determination (no node placed) ===
  // Find the first clear angle away from the immediate wall face and advance pos
  // to that position. This separates "figuring out which way to go" from actual
  // node placement, so the first real node is always past the wall edge.
  {
    const dx0 = targetPos.x - pos.x;
    const dy0 = targetPos.y - pos.y;
    const baseAngle0 = Math.atan2(dy0, dx0);
    const inc = Math.PI / 180;
    const dirsToTry0 = allowFlip ? [lockedDir, -lockedDir] : [lockedDir];
    let foundAngle0 = null;

    outerPhase1: for (const dir of dirsToTry0) {
      for (let deg = 1; deg <= 180; deg++) {
        const testAngle = baseAngle0 + deg * inc * dir;
        const testEnd = {
          x: pos.x + Math.cos(testAngle) * nodeStep,
          y: pos.y + Math.sin(testAngle) * nodeStep
        };
        if (enemy.hasLineOfSight(pos, testEnd, nodeStep)) {
          foundAngle0 = testAngle;
          if (dir !== lockedDir) lockedDir = dir;
          break outerPhase1;
        }
      }
    }

    if (foundAngle0 === null) return; // completely boxed in — give up
    pos = {
      x: pos.x + Math.cos(foundAngle0) * nodeStep,
      y: pos.y + Math.sin(foundAngle0) * nodeStep
    };
    // pos is now the "dodge anchor" — first node placement begins from here
  }

  // === PHASE 2: Node placement ===
  for (let n = 0; n < MAX_NODES; n++) {
    const dx = targetPos.x - pos.x;
    const dy = targetPos.y - pos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < GRID.CELL_SIZE) break;

    // Can we see the target directly from here? Then this is the last node needed.
    if (enemy.hasLineOfSight(pos, targetPos, dist + GRID.CELL_SIZE)) {
      enemy.pathNodes.push({ x: pos.x, y: pos.y });
      break;
    }

    const baseAngle = Math.atan2(dy, dx);
    const inc = Math.PI / 180;
    let foundAngle = null;

    // Always try the committed direction first; only offer opposite if allowFlip.
    const dirsToTry = allowFlip ? [lockedDir, -lockedDir] : [lockedDir];

    outerLoop: for (const dir of dirsToTry) {
      for (let deg = 1; deg <= 180; deg++) {
        const testAngle = baseAngle + deg * inc * dir;
        const testEnd = {
          x: pos.x + Math.cos(testAngle) * nodeStep,
          y: pos.y + Math.sin(testAngle) * nodeStep
        };
        if (enemy.hasLineOfSight(pos, testEnd, nodeStep)) {
          foundAngle = testAngle;
          if (dir !== lockedDir) lockedDir = dir;
          break outerLoop;
        }
      }
    }

    if (foundAngle === null) break;

    pos = {
      x: pos.x + Math.cos(foundAngle) * nodeStep,
      y: pos.y + Math.sin(foundAngle) * nodeStep
    };
    enemy.pathNodes.push({ x: pos.x, y: pos.y });
  }

  // Post-pass: if the last placed node still can't see the target directly, try one
  // more hop so the enemy doesn't attempt to walk through the wall on final approach.
  if (enemy.pathNodes.length > 0) {
    const last = enemy.pathNodes[enemy.pathNodes.length - 1];
    const fdx = targetPos.x - last.x;
    const fdy = targetPos.y - last.y;
    const fdist = Math.sqrt(fdx * fdx + fdy * fdy);
    if (fdist > GRID.CELL_SIZE && !enemy.hasLineOfSight(last, targetPos, fdist)) {
      const baseAngle = Math.atan2(fdy, fdx);
      const inc = Math.PI / 180;
      for (let deg = 1; deg <= 180; deg++) {
        const testAngle = baseAngle + deg * inc * lockedDir;
        const testEnd = {
          x: last.x + Math.cos(testAngle) * nodeStep,
          y: last.y + Math.sin(testAngle) * nodeStep
        };
        if (enemy.hasLineOfSight(last, testEnd, nodeStep)) {
          enemy.pathNodes.push({ x: testEnd.x, y: testEnd.y });
          break;
        }
      }
    }
  }

  // Persist the direction used (or chosen) so the next call starts from the same side.
  enemy.navDirection = lockedDir;
}
