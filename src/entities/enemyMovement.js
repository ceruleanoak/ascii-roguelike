import { GRID } from '../game/GameConfig.js';

// Every way an Enemy can drive its own targetVelocity, in one place.
//
// These are the movement archetypes (data.movementStyle) plus the two movements
// that belong to a state rather than an archetype — the idle wander and the
// windup hold. All of them are pure velocity writers: they read the enemy's
// position, config, and target, and write `enemy.targetVelocity`. None of them
// changes state, spawns, or touches the room. `Enemy._blendVelocity` is what
// turns the target into actual motion, one frame later.
//
// Moved out of Enemy.js unchanged. The one call back into the enemy is
// `updateVectorNavigation`, the wall-routing pathfinder, which stays there
// because it carries its own decision-throttling state.

/**
 * Called from update() when enemy has line-of-sight to player and is chasing.
 * Routes to the correct movement implementation based on movementStyle.
 */
export function updateMovement(enemy, speedMultiplier, targetPos, deltaTime) {
  // Trap Goblin state (windup hold / post-trap flee / proactive flee) is fully
  // handled in the trap-layer block in update() — those overrides run after
  // this dispatch and unconditionally, so they're safe even if updateMovement
  // is skipped (e.g. when vision is lost).

  if (applyShieldPhase(enemy, speedMultiplier, targetPos)) return;

  switch (enemy.movementStyle) {
    case 'keeper':   return moveKeeper(enemy, speedMultiplier, targetPos, deltaTime);
    case 'kiter':    return moveKiter(enemy, speedMultiplier, targetPos, deltaTime);
    case 'ambusher': return moveAmbusher(enemy, speedMultiplier, targetPos, deltaTime);
    case 'jumper':   return moveChaser(enemy, speedMultiplier, targetPos, deltaTime); // jump override applied post-update
    default:         return moveChaser(enemy, speedMultiplier, targetPos, deltaTime);
  }
}

// The Mirror Imp's shield phase: while the shield is up it walks straight
// backwards, whatever else it was doing. Returns true when it took the frame.
//
// This sits beside the archetype dispatch rather than inside it because it is a
// movement *modifier* — the same shape as `burst`, a condition that overrides
// the verb for as long as it holds. Both the legacy dispatch and the State
// spine's `applyStateMovement` call it, so the imp's whole identity ("shield up
// — it retreats and reflects") is described exactly once.
//
// A modifier applies where a State asks for it (`shieldPhase: true`), not
// everywhere. Legacy reaches it only through the chase dispatch, so an imp
// wandering out of aggro range does not back away from a target it has not
// noticed — and an imp that did would look like it was fleeing on sight.
export function applyShieldPhase(enemy, speedMultiplier, targetPos) {
  if (!enemy.shieldActive || !enemy.data.reflectShield?.shieldPhaseMovement) return false;
  const dx = enemy.position.x - targetPos.x;
  const dy = enemy.position.y - targetPos.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist > 0) {
    enemy.targetVelocity.vx = (dx / dist) * enemy.speed * speedMultiplier;
    enemy.targetVelocity.vy = (dy / dist) * enemy.speed * speedMultiplier;
  }
  return true;
}

/** chaser: direct pursuit using vector navigation */
export function moveChaser(enemy, speedMultiplier, targetPos, deltaTime) {
  if (enemy.collisionMap) {
    enemy.updateVectorNavigation(speedMultiplier, targetPos, deltaTime);
  } else {
    const dx = targetPos.x - enemy.position.x;
    const dy = targetPos.y - enemy.position.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 0) {
      enemy.targetVelocity.vx = (dx / dist) * enemy.speed * speedMultiplier;
      enemy.targetVelocity.vy = (dy / dist) * enemy.speed * speedMultiplier;
    }
  }
}

/**
 * keeper: maintain preferred range, sidestep while at range, backpedal if crowded.
 * Ranged/magic enemies use this so they fire from effective distance rather than
 * chasing into melee range.
 *
 * Config (all optional — defaults shown):
 *   preferredRange     = attackRange * 0.8
 *   rangeTolerance     = GRID.CELL_SIZE * 1.5
 */
export function moveKeeper(enemy, speedMultiplier, targetPos, deltaTime) {
  const dx = targetPos.x - enemy.position.x;
  const dy = targetPos.y - enemy.position.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist === 0) return;

  const cfg = enemy.movementConfig;
  const preferred  = cfg.preferredRange  ?? (enemy.attackRange * 0.8);
  const tolerance  = cfg.rangeTolerance  ?? (GRID.CELL_SIZE * 1.5);

  const dirX = dx / dist;
  const dirY = dy / dist;
  // Perpendicular axis for circle-strafing
  const perpX = -dirY * enemy.keeperStrafeDir;
  const perpY =  dirX * enemy.keeperStrafeDir;

  if (dist < preferred - tolerance) {
    // Too close — back away at full speed
    enemy.targetVelocity.vx = -dirX * enemy.speed * speedMultiplier;
    enemy.targetVelocity.vy = -dirY * enemy.speed * speedMultiplier;
  } else if (dist > preferred + tolerance) {
    // Too far — approach using nav system to route around walls
    moveChaser(enemy, speedMultiplier, targetPos, deltaTime);
  } else {
    // In preferred range — sidestep at 60% speed to avoid being a stationary target
    enemy.targetVelocity.vx = perpX * enemy.speed * speedMultiplier * 0.6;
    enemy.targetVelocity.vy = perpY * enemy.speed * speedMultiplier * 0.6;
  }
}

/**
 * kiter: hold kiteDistance and circle-strafe while the core attack cooldown
 * ticks; when the attack is ready, dive straight in and let the core
 * windup → attack states deliver the hit (the windup '!' is the tell).
 * The dive cadence IS attackCooldown — there is no separate hover/rush
 * sub-state. Pack dive desync emerges from per-enemy cooldown timing.
 *
 * Config (all optional — defaults shown):
 *   kiteDistance       = GRID.CELL_SIZE * 4
 *   retreatThreshold   = GRID.CELL_SIZE * 2
 *   dive               = true   (false: never dive — e.g. Trap Goblin)
 */
export function moveKiter(enemy, speedMultiplier, targetPos, deltaTime) {
  // Only activate kite tactics if this enemy or a packmate has detected the player
  const packDetected = enemy.detectionIndicatorTimer > 0 ||
    (enemy.packmates && enemy.packmates.some(m => m.detectionIndicatorTimer > 0));

  if (!packDetected) {
    return moveChaser(enemy, speedMultiplier, targetPos, deltaTime);
  }

  const cfg = enemy.movementConfig;
  const dx = targetPos.x - enemy.position.x;
  const dy = targetPos.y - enemy.position.y;
  const dist = Math.sqrt(dx * dx + dy * dy) || 1;

  // DIVE: attack off cooldown — close in; windup triggers at attackRange
  if (cfg.dive !== false && enemy.attackTimer <= 0) {
    enemy.targetVelocity.vx = (dx / dist) * enemy.speed * speedMultiplier * 1.2;
    enemy.targetVelocity.vy = (dy / dist) * enemy.speed * speedMultiplier * 1.2;
    return;
  }

  // On cooldown: hold the kite ring with packmate separation
  const kiteDistance = cfg.kiteDistance ?? GRID.CELL_SIZE * 4;
  const retreatThreshold = cfg.retreatThreshold ?? GRID.CELL_SIZE * 2;
  let sepX = 0, sepY = 0;
  const sepDist = GRID.CELL_SIZE * 2;
  if (enemy.packmates) {
    for (const mate of enemy.packmates) {
      const mx = enemy.position.x - mate.position.x;
      const my = enemy.position.y - mate.position.y;
      const md = Math.sqrt(mx * mx + my * my);
      if (md < sepDist && md > 0) {
        const f = (sepDist - md) / sepDist;
        sepX += (mx / md) * f;
        sepY += (my / md) * f;
      }
    }
  }

  let vx, vy;
  if (dist < retreatThreshold) {
    // Too close — retreat
    vx = (-dx / dist) * 0.8 + sepX * 0.2;
    vy = (-dy / dist) * 0.8 + sepY * 0.2;
  } else if (dist <= kiteDistance + GRID.CELL_SIZE * 2) {
    // At kite distance — circle-strafe
    vx = (-dy / dist) * 0.6 + sepX * 0.4;
    vy = (dx / dist) * 0.6 + sepY * 0.4;
  } else {
    // Too far — approach player
    vx = (dx / dist) * 0.8 + sepX * 0.2;
    vy = (dy / dist) * 0.8 + sepY * 0.2;
  }

  const mag = Math.sqrt(vx * vx + vy * vy) || 1;
  enemy.targetVelocity.vx = (vx / mag) * enemy.speed * speedMultiplier * 0.8;
  enemy.targetVelocity.vy = (vy / mag) * enemy.speed * speedMultiplier * 0.8;
}

/**
 * ambusher: stays dormant (rest state) until player enters wakeRadius,
 * then bursts at high speed before falling back to chaser behavior.
 *
 * Config (all optional — defaults shown):
 *   wakeRadius         = GRID.CELL_SIZE * 4  (used in the rest-state check in Enemy.update)
 *   burstSpeed         = speed * 2.5
 *   burstDuration      = 1.0
 */
export function moveAmbusher(enemy, speedMultiplier, targetPos, deltaTime) {
  if (enemy.burstActive) {
    enemy.burstTimer -= deltaTime;
    const dx = targetPos.x - enemy.position.x;
    const dy = targetPos.y - enemy.position.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 0) {
      const burstSpeed = enemy.movementConfig.burstSpeed ?? (enemy.speed * 2.5);
      enemy.targetVelocity.vx = (dx / dist) * burstSpeed * speedMultiplier;
      enemy.targetVelocity.vy = (dy / dist) * burstSpeed * speedMultiplier;
    }
    if (enemy.burstTimer <= 0) enemy.burstActive = false;
    return;
  }
  // Post-burst: behave like a normal chaser
  moveChaser(enemy, speedMultiplier, targetPos, deltaTime);
}

/**
 * Idle wander movement. Drives targetVelocity each frame; picks a new direction
 * when wanderTimer expires. Stationary enemies hold position.
 * Player-position-agnostic — safe to call in any non-aggro state, including
 * "lingering at memory mark" so enemies don't freeze waiting for the timer.
 */
export function updateWanderMovement(enemy, speedMultiplier, deltaTime) {
  if (enemy.idleBehavior === 'stationary') {
    enemy.targetVelocity.vx = 0;
    enemy.targetVelocity.vy = 0;
    return;
  }

  enemy.wanderTimer -= deltaTime;
  if (enemy.wanderTimer <= 0) {
    const hasWaterAffinity = enemy.data.waterAffinity === true;
    let chosenAngle = Math.random() * Math.PI * 2;

    if (enemy.backgroundObjects && enemy.backgroundObjects.length > 0) {
      if (!hasWaterAffinity) {
        for (let attempt = 0; attempt < 8; attempt++) {
          const testAngle = Math.random() * Math.PI * 2;
          const lookDist = enemy.wanderSpeed * 0.5;
          const testX = enemy.position.x + Math.cos(testAngle) * lookDist;
          const testY = enemy.position.y + Math.sin(testAngle) * lookDist;
          const wouldHitWater = enemy.backgroundObjects.some(obj =>
            (obj.char === '=' || obj.char === '~') &&
            Math.abs(obj.position.x - testX) < GRID.CELL_SIZE &&
            Math.abs(obj.position.y - testY) < GRID.CELL_SIZE
          );
          if (!wouldHitWater) {
            chosenAngle = testAngle;
            break;
          }
        }
      } else {
        let nearestWaterAngle = null;
        let nearestWaterDist = Infinity;
        for (const obj of enemy.backgroundObjects) {
          if (obj.char === '=' || obj.char === '~') {
            const wdx = obj.position.x - enemy.position.x;
            const wdy = obj.position.y - enemy.position.y;
            const wDist = Math.sqrt(wdx * wdx + wdy * wdy);
            if (wDist < nearestWaterDist) {
              nearestWaterDist = wDist;
              nearestWaterAngle = Math.atan2(wdy, wdx);
            }
          }
        }
        if (nearestWaterAngle !== null && nearestWaterDist < GRID.CELL_SIZE * 12 && Math.random() < 0.6) {
          chosenAngle = nearestWaterAngle + (Math.random() - 0.5) * Math.PI * 0.4;
        }
      }
    }

    enemy.wanderDirection.x = Math.cos(chosenAngle);
    enemy.wanderDirection.y = Math.sin(chosenAngle);
    enemy.wanderTimer = 2 + Math.random() * 2;
  }

  enemy.targetVelocity.vx = enemy.wanderDirection.x * enemy.wanderSpeed * speedMultiplier;
  enemy.targetVelocity.vy = enemy.wanderDirection.y * enemy.wanderSpeed * speedMultiplier;
}

/**
 * Handles movement during the windup state.
 * windupMovement: 'stop' (default) | 'advance' | 'retreat'
 */
export function applyWindupMovement(enemy, speedMultiplier) {
  if (enemy.windupMovement === 'stop' || !enemy.target) {
    enemy.targetVelocity.vx = 0;
    enemy.targetVelocity.vy = 0;
    return;
  }
  const dx = enemy.target.position.x - enemy.position.x;
  const dy = enemy.target.position.y - enemy.position.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist === 0) { enemy.targetVelocity.vx = 0; enemy.targetVelocity.vy = 0; return; }
  const dirX = dx / dist;
  const dirY = dy / dist;
  const windupSpeed = enemy.speed * speedMultiplier * 0.4; // 40% speed during windup
  if (enemy.windupMovement === 'advance') {
    enemy.targetVelocity.vx = dirX * windupSpeed;
    enemy.targetVelocity.vy = dirY * windupSpeed;
  } else if (enemy.windupMovement === 'retreat') {
    enemy.targetVelocity.vx = -dirX * windupSpeed;
    enemy.targetVelocity.vy = -dirY * windupSpeed;
  }
}

// ── Movement verbs ──────────────────────────────────────────────────────────
// The vocabulary a State's `movement` field names. Seven verbs, each usable in
// any State, each taking a speed multiplier — which is where the hardcoded constants
// scattered through the legacy ladder go (0.6× strafe, 0.8× ring, 1.2× dive,
// 0.4× windup, 0.5× back-off, 0.3× wander were all un-tunable literals).
//
// This is what stops the movement archetypes from being archetypes. `close` is
// what a chaser did in every state; now any State can call for it, so a kiter
// can orbit while approaching and close while striking. The archetype survives
// only as an authoring preset that picks the default verb per State.

// Straight back from the target. The legacy ladder open-codes this at 0.5× as
// the melee back-off, where it is reached only while on cooldown.
export function moveBack(enemy, speedMultiplier, targetPos) {
  const dx = targetPos.x - enemy.position.x;
  const dy = targetPos.y - enemy.position.y;
  const dist = Math.sqrt(dx * dx + dy * dy) || 1;
  enemy.targetVelocity.vx = -(dx / dist) * enemy.speed * speedMultiplier;
  enemy.targetVelocity.vy = -(dy / dist) * enemy.speed * speedMultiplier;
}

export function moveStill(enemy) {
  enemy.targetVelocity.vx = 0;
  enemy.targetVelocity.vy = 0;
}

// Straight at the target at an *absolute* speed, ignoring the enemy's own. Split
// out of moveAmbusher, whose burst branch is exactly this: the four ambushers set
// `burstSpeed` to 165/120/160/70, flat values that replace `enemy.speed` rather
// than scaling it, so a speed multiplier could not reproduce them.
//
// Deliberately not routed through vector navigation even when a collisionMap is
// present — a lunge that pathfinds around a corner is not a lunge, and the legacy
// burst went straight too.
//
// `away` negates the direction so the same primitive drives a lunge away from the
// target (Recover's `jumpBack` variant) as well as toward it.
export function moveLunge(enemy, absoluteSpeed, speedMultiplier, targetPos, away = false) {
  const dx = targetPos.x - enemy.position.x;
  const dy = targetPos.y - enemy.position.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist === 0) return;
  const sign = away ? -1 : 1;
  enemy.targetVelocity.vx = sign * (dx / dist) * absoluteSpeed * speedMultiplier;
  enemy.targetVelocity.vy = sign * (dy / dist) * absoluteSpeed * speedMultiplier;
}

// Straight away from a mark, routed around walls, never strafing — Flee's
// verb. Unlike `back` (a steady retreat while still facing the target,
// `keeper`'s crowded-range response) this turns its back entirely: it
// projects a point beyond the enemy on the far side of the mark and hands it
// to `moveChaser`, so a fleeing enemy still routes around obstacles on its
// way out instead of running face-first into them.
//
// Also steers clear of `enemy.ownTrapPositions` (maintained by whatever
// Mechanic drops them, e.g. TrapLayerMechanic) — the direct fix for a trap
// goblin fleeing straight into a trap it just laid.
export function moveFlee(enemy, speedMultiplier, markPos, deltaTime) {
  const dx = enemy.position.x - markPos.x;
  const dy = enemy.position.y - markPos.y;
  const dist = Math.sqrt(dx * dx + dy * dy) || 1;
  let dirX = dx / dist;
  let dirY = dy / dist;

  if (enemy.ownTrapPositions?.length) {
    const avoidRadius = GRID.CELL_SIZE * 3;
    let avoidX = 0, avoidY = 0;
    for (const trap of enemy.ownTrapPositions) {
      const tx = enemy.position.x - trap.x;
      const ty = enemy.position.y - trap.y;
      const td = Math.sqrt(tx * tx + ty * ty);
      if (td > 0 && td < avoidRadius) {
        const strength = (avoidRadius - td) / avoidRadius;
        avoidX += (tx / td) * strength;
        avoidY += (ty / td) * strength;
      }
    }
    if (avoidX !== 0 || avoidY !== 0) {
      dirX += avoidX;
      dirY += avoidY;
      const mag = Math.sqrt(dirX * dirX + dirY * dirY) || 1;
      dirX /= mag;
      dirY /= mag;
    }
  }

  const runDistance = GRID.CELL_SIZE * 20;
  const awayPoint = {
    x: enemy.position.x + dirX * runDistance,
    y: enemy.position.y + dirY * runDistance,
  };
  moveChaser(enemy, speedMultiplier, awayPoint, deltaTime);
}

const VERBS = {
  close:  (enemy, mult, targetPos, dt) => moveChaser(enemy, mult, targetPos, dt),
  hold:   (enemy, mult, targetPos, dt) => moveKeeper(enemy, mult, targetPos, dt),
  orbit:  (enemy, mult, targetPos, dt) => moveKiter(enemy, mult, targetPos, dt),
  back:   (enemy, mult, targetPos) => moveBack(enemy, mult, targetPos),
  still:  (enemy) => moveStill(enemy),
  wander: (enemy, mult, targetPos, dt) => updateWanderMovement(enemy, mult, dt),
  // A sharper `back` — a one-shot lunge away rather than a steady walk. `mult`
  // (speedMultiplier × cfg.speed) applies the same way it does for every other
  // verb; the 2× base is what makes it read as a jump rather than a backpedal.
  lungeBack: (enemy, mult, targetPos) => moveLunge(enemy, enemy.speed * 2, mult, targetPos, true),
  flee: (enemy, mult, targetPos, dt) => moveFlee(enemy, mult, targetPos, dt),
};

// Run a State's movement. `cfg.speed` multiplies the enemy's own speed on top of
// whatever the frame's status/terrain multiplier already is, so a State can be
// slower or faster than the enemy's baseline without touching its stats.
//
// `cfg.burst` is the first movement *modifier*: a one-shot window, armed
// elsewhere and consumed here, that overrides the verb entirely for its duration.
// A modifier composes with any verb in any State, which is the difference between
// this and the archetype it came from — `moveAmbusher` hardcoded both the wake
// and the chase, so only an ambusher could ever burst. `hop` will attach the same
// way.
//
// An unknown verb holds position rather than falling through to a default, so a
// typo in authored data is visible as an enemy that does not move — not as one
// that silently chases.
export function applyStateMovement(enemy, cfg, speedMultiplier, targetPos, deltaTime) {
  if (cfg?.shieldPhase && applyShieldPhase(enemy, speedMultiplier, targetPos)) return;
  if (cfg?.burst && enemy.burstActive) {
    enemy.burstTimer -= deltaTime;
    if (enemy.burstTimer <= 0) enemy.burstActive = false;
    moveLunge(enemy, cfg.burst.speed ?? enemy.speed * 2.5, speedMultiplier, targetPos);
    return;
  }
  const verb = VERBS[cfg?.movement] ?? moveStill;
  verb(enemy, speedMultiplier * (cfg?.speed ?? 1), targetPos, deltaTime);
}
