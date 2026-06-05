// Jumper archetype (frogs): replaces smooth chase movement with erratic
// zigzag bursts. On land, deterministic perpendicular zigzag (flip each jump).
// In water, swim nearly straight with small wobble. Reads params from
// `movementConfig` (new-style) with fallback to legacy `data.jumpBehavior`.
//
// State and update only apply when `movementStyle === 'jumper'`. Init runs
// for both legacy data.jumpBehavior.enabled and new-style movementConfig
// (the Enemy constructor sets movementStyle from data.jumpBehavior if the
// new field isn't present).

export const JumpMechanic = {
  isEnabled(enemy) {
    return enemy.movementStyle === 'jumper';
  },

  init(enemy) {
    const baseInterval = enemy.jumpBehavior?.jumpInterval
      ?? enemy.movementConfig.jumpInterval
      ?? 1.0;
    enemy.frogJumpTimer = Math.random() * baseInterval;
    enemy.frogJumpActive = false;
    enemy.frogJumpDurationTimer = 0;
    enemy.frogJumpSide = 1;
  },

  update(enemy, ctx) {
    if (enemy.movementStyle !== 'jumper') return;
    if (enemy.isFrozen() || enemy.isStunned() || enemy.isKnockedBack()) return;
    const { deltaTime } = ctx;

    const onWater = enemy._isOnWater();
    const cfg = enemy.movementConfig;
    const jb = enemy.jumpBehavior;
    const jumpInterval = onWater ? (cfg.waterJumpInterval ?? jb?.waterJumpInterval) : (cfg.jumpInterval ?? jb?.jumpInterval);
    const jumpSpeed    = onWater ? (cfg.waterJumpSpeed    ?? jb?.waterJumpSpeed)    : (cfg.jumpSpeed    ?? jb?.jumpSpeed);
    const jumpDuration = onWater ? (cfg.waterJumpDuration ?? jb?.waterJumpDuration) : (cfg.jumpDuration ?? jb?.jumpDuration);

    enemy.frogJumpTimer -= deltaTime;

    if (enemy.frogJumpActive) {
      enemy.frogJumpDurationTimer -= deltaTime;
      if (enemy.frogJumpDurationTimer <= 0) {
        enemy.frogJumpActive = false;
        // targetVelocity stays 0 → _blendVelocity decelerates velocity to a stop
      }
      return;
    }

    if (enemy.state !== 'chase' && enemy.state !== 'idle') return;

    // Between jumps: stand still
    enemy.targetVelocity.vx = 0;
    enemy.targetVelocity.vy = 0;

    if (enemy.frogJumpTimer > 0) return;

    // Jitter: ±30% around base interval
    enemy.frogJumpTimer = jumpInterval * (0.7 + Math.random() * 0.6);
    enemy.frogJumpActive = true;
    enemy.frogJumpDurationTimer = jumpDuration;

    // Chase: jump toward target with zigzag. Idle: jump along wander direction.
    let dirX, dirY;
    if (enemy.state === 'chase' && enemy.target) {
      // Prefer navigation direction (wall-aware) over raw target direction.
      if (enemy.currentDirection.x !== 0 || enemy.currentDirection.y !== 0) {
        dirX = enemy.currentDirection.x;
        dirY = enemy.currentDirection.y;
      } else {
        const jdx = enemy.target.position.x - enemy.position.x;
        const jdy = enemy.target.position.y - enemy.position.y;
        const jdist = Math.sqrt(jdx * jdx + jdy * jdy);
        dirX = jdist > 0 ? jdx / jdist : 0;
        dirY = jdist > 0 ? jdy / jdist : 0;
      }
    } else {
      const wd = enemy.wanderDirection || { x: Math.random() * 2 - 1, y: Math.random() * 2 - 1 };
      const wm = Math.sqrt(wd.x * wd.x + wd.y * wd.y) || 1;
      dirX = wd.x / wm;
      dirY = wd.y / wm;
    }

    if (dirX === 0 && dirY === 0) return;

    const perpX = -dirY;
    const perpY =  dirX;

    let jumpX, jumpY;
    if (onWater) {
      // In water: swim nearly straight, minimal lateral deviation
      const wobble = (Math.random() * 2 - 1) * 0.15;
      jumpX = dirX + perpX * wobble;
      jumpY = dirY + perpY * wobble;
    } else {
      // On land: deterministic zigzag — flip side each jump
      enemy.frogJumpSide *= -1;
      const lateral = enemy.frogJumpSide * (cfg.zigzagStrength ?? jb?.zigzagStrength ?? 0.75);
      jumpX = dirX + perpX * lateral;
      jumpY = dirY + perpY * lateral;
    }

    const jmag = Math.sqrt(jumpX * jumpX + jumpY * jumpY);
    if (jmag > 0) { jumpX /= jmag; jumpY /= jmag; }

    // Directly set velocity for instant burst; targetVelocity = 0 for natural decel
    enemy.velocity.vx = jumpX * jumpSpeed;
    enemy.velocity.vy = jumpY * jumpSpeed;
  }
};
