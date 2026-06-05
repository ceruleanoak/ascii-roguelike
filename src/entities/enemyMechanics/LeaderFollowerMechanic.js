import { GRID } from '../../game/GameConfig.js';

// Two paired behaviors driven by enemy.data:
//   - rallyCall: chief detects the player is too far, plants a red '!' indicator,
//     and applies a speed boost + re-encircle windup to all linked followers.
//   - followLeader: follower orbits its leader (encircle), then settles into a
//     perpendicular line wall between leader and player. Drops the formation
//     pin when the player is within engagement range so this follower can swing.
//
// `_formationState` (wander | encircle | line), `_encircleTimer`, `_orbitAngle`,
// `formationSlot`, `formationCount`, `_rallyBoostMultiplier` are all attached
// post-construction by the Goblin Army encounter spawner; init() only zeroes
// the rally fields when this is a chief.
//
// _steerToSlot is private to this module — it's only used by the formation
// state machine and was never called from elsewhere.

function _steerToSlot(enemy, slotX, slotY) {
  const sdx = slotX - enemy.position.x;
  const sdy = slotY - enemy.position.y;
  const sd = Math.sqrt(sdx * sdx + sdy * sdy);
  if (sd > 2) {
    const vx = (sdx / sd) * enemy.speed;
    const vy = (sdy / sd) * enemy.speed;
    enemy.velocity.vx = vx;
    enemy.velocity.vy = vy;
    enemy.targetVelocity.vx = vx;
    enemy.targetVelocity.vy = vy;
  } else {
    enemy.velocity.vx = 0;
    enemy.velocity.vy = 0;
    enemy.targetVelocity.vx = 0;
    enemy.targetVelocity.vy = 0;
  }
}

export const LeaderFollowerMechanic = {
  // No isEnabled() — runs unconditionally each tick because both rally and
  // follow are opt-in via data fields and bail internally.

  initRally(enemy) {
    enemy.rallyCallCooldown = 0;
    enemy.rallyIndicatorTimer = 0;
  },

  isRallyEnabled(enemy) {
    return enemy.data.rallyCall?.enabled === true;
  },

  update(enemy, ctx) {
    const { deltaTime } = ctx;

    if (enemy.rallyCallCooldown > 0) enemy.rallyCallCooldown -= deltaTime;
    if (enemy.rallyIndicatorTimer > 0) enemy.rallyIndicatorTimer -= deltaTime;
    if (enemy.rallyBoostTimer > 0) enemy.rallyBoostTimer -= deltaTime;

    const rc = enemy.data.rallyCall;
    if (rc?.enabled && enemy.target && enemy.rallyCallCooldown <= 0) {
      const dx = enemy.target.position.x - enemy.position.x;
      const dy = enemy.target.position.y - enemy.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > rc.triggerDistance) {
        enemy.rallyIndicatorTimer = rc.indicatorDuration ?? 1.0;
        enemy.rallyCallCooldown = rc.cooldown ?? 6.0;
        const enemies = enemy.game?.currentRoom?.enemies;
        if (enemies) {
          for (const e of enemies) {
            if (e.leaderRef === enemy) {
              e.rallyBoostTimer = rc.followerBoostDuration ?? 2.0;
              e._rallyBoostMultiplier = rc.followerBoostMultiplier ?? 1.3;
              // Rally call re-triggers the encircle windup so the pack visibly
              // regroups before re-forming the line wall.
              e._formationState = 'encircle';
              e._encircleTimer = rc.indicatorDuration ?? 1.0;
            }
          }
        }
      }
    }

    const fl = enemy.data.followLeader;
    if (fl?.enabled && enemy.leaderRef && enemy.leaderRef.hp > 0 && enemy.target) {
      const ldx = enemy.target.position.x - enemy.leaderRef.position.x;
      const ldy = enemy.target.position.y - enemy.leaderRef.position.y;
      const leaderToPlayer = Math.sqrt(ldx * ldx + ldy * ldy);
      const radius = fl.formationRadius;

      // Formation FSM: wander → encircle (windup) → line (wall)
      if (enemy._formationState === undefined) enemy._formationState = 'wander';
      if (enemy._encircleTimer === undefined) enemy._encircleTimer = 0;
      const ENCIRCLE_DURATION = fl.encircleDuration ?? 1.4;

      if (leaderToPlayer > fl.nearPlayerRange) {
        enemy._formationState = 'wander';
        enemy._encircleTimer = 0;
        enemy.followerRoleActive = false;
      } else {
        enemy.followerRoleActive = true;
        if (enemy._formationState === 'wander') {
          enemy._formationState = 'encircle';
          enemy._encircleTimer = ENCIRCLE_DURATION;
        }
        if (enemy._formationState === 'encircle') {
          enemy._encircleTimer -= deltaTime;
          if (enemy._encircleTimer <= 0) enemy._formationState = 'line';
        }
      }

      // Ranged followers don't get pinned — keeper movement handles their distance.
      const rangedFollower = enemy.attackType === 'item_ranged' || enemy.movementStyle === 'keeper';

      // Engagement release: drop formation pin when player is within striking
      // range so this follower's own chase + windup can fire.
      const pdx_e = enemy.target.position.x - enemy.position.x;
      const pdy_e = enemy.target.position.y - enemy.position.y;
      const distToPlayer = Math.sqrt(pdx_e * pdx_e + pdy_e * pdy_e);
      const engagementRange = Math.max(enemy.attackRange * 3, GRID.CELL_SIZE * 4);
      const engaged = distToPlayer <= engagementRange;

      if (enemy._formationState === 'encircle' && !rangedFollower && !engaged) {
        const orbitSpeed = fl.orbitSpeed ?? 1.2;
        if (enemy._orbitAngle === undefined) {
          const ox = enemy.position.x - enemy.leaderRef.position.x;
          const oy = enemy.position.y - enemy.leaderRef.position.y;
          enemy._orbitAngle = Math.atan2(oy, ox);
        }
        enemy._orbitAngle += orbitSpeed * deltaTime;
        const slotX = enemy.leaderRef.position.x + Math.cos(enemy._orbitAngle) * radius;
        const slotY = enemy.leaderRef.position.y + Math.sin(enemy._orbitAngle) * radius;
        _steerToSlot(enemy, slotX, slotY);
      } else if (enemy._formationState === 'line' && !rangedFollower && !engaged) {
        const ld = leaderToPlayer || 1;
        const dirX = ldx / ld;
        const dirY = ldy / ld;
        const perpX = -dirY;
        const perpY = dirX;
        const anchorDist = Math.min(ld * 0.5, GRID.CELL_SIZE * 6);
        const anchorX = enemy.leaderRef.position.x + dirX * anchorDist;
        const anchorY = enemy.leaderRef.position.y + dirY * anchorDist;
        const spacing = fl.lineSpacing ?? radius;
        const slotIdx = enemy.formationSlot ?? 0;
        const slotCount = enemy.formationCount ?? 1;
        const lateral = slotIdx - (slotCount - 1) / 2;
        const slotX = anchorX + perpX * lateral * spacing;
        const slotY = anchorY + perpY * lateral * spacing;
        _steerToSlot(enemy, slotX, slotY);
      }
    } else {
      // Leader missing/dead — fall back to plain wander so chase AI runs.
      enemy._formationState = 'wander';
      enemy.followerRoleActive = false;
    }

    if (enemy.rallyBoostTimer > 0) {
      const mult = enemy._rallyBoostMultiplier ?? 1.3;
      enemy.velocity.vx *= mult;
      enemy.velocity.vy *= mult;
    }
  }
};
