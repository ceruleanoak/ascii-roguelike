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
    const rallyMult = enemy.rallyBoostTimer > 0 ? (enemy._rallyBoostMultiplier ?? 1.3) : 1;
    const vx = (sdx / sd) * enemy.speed * rallyMult;
    const vy = (sdy / sd) * enemy.speed * rallyMult;
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

// The chief commands from the back while his pack is strong. Until more than
// HOLD_BACK_UNTIL_LOST of the pack has fallen he keeps HOLD_BACK_RANGE from
// the player (backing off when crowded, standing his ground otherwise) and
// never starts a Bash; he still swings at anyone who walks into his reach.
// His speed runs from PACK_FULL_SPEED× with the whole pack up to
// rallyCall.packLossSpeedMax× with none, so he is slowest exactly while he
// should be hanging back, and fastest when he's the last one standing.
const HOLD_BACK_UNTIL_LOST = 0.5;
const HOLD_BACK_RANGE = GRID.CELL_SIZE * 7;
const PACK_FULL_SPEED = 0.5;

// Stamped after the regular AI, the way followers' formation slots are, and
// only while Approach owns the movement — a windup, swing or Recover plays
// out untouched.
function _holdBack(enemy) {
  if (enemy.stateMachine?.current !== 'approach' || !enemy.target) return;
  const dx = enemy.target.position.x - enemy.position.x;
  const dy = enemy.target.position.y - enemy.position.y;
  const dist = Math.sqrt(dx * dx + dy * dy) || 1;
  if (dist < HOLD_BACK_RANGE) {
    const speed = enemy.speed * (enemy.packLossSpeedMult ?? 1);
    enemy.targetVelocity.vx = -(dx / dist) * speed;
    enemy.targetVelocity.vy = -(dy / dist) * speed;
  } else {
    enemy.targetVelocity.vx = 0;
    enemy.targetVelocity.vy = 0;
  }
}

export const LeaderFollowerMechanic = {
  // No isEnabled() — runs unconditionally each tick because both rally and
  // follow are opt-in via data fields and bail internally.

  // Called from the Enemy constructor for a chief (rallyCall.enabled), so
  // these are constructor-time fields, only on the Enemies that use them.
  initRally(enemy) {
    enemy.rallyCallCooldown = 0;
    enemy.rallyIndicatorTimer = 0;
    // The chief's own speed-up as its pack dies (rallyCall.packLossSpeedMax);
    // _updatePackLossSpeed writes it, computeSpeedMultiplier reads it.
    enemy.packLossSpeedMult = 1;
    // The largest pack seen; followers are linked after construction.
    enemy._packSizeSeen = 0;
    // True while most of the chief's pack still stands: he keeps his distance
    // and holds his Bash (ChargeMechanic reads it).
    enemy.holdingBack = false;
  },

  isRallyEnabled(enemy) {
    return enemy.data.rallyCall?.enabled === true;
  },

  // The chief moves faster the fewer followers it has left: PACK_FULL_SPEED×
  // with the full pack, rising linearly to rc.packLossSpeedMax× once every
  // follower is dead, and holds back while most of the pack stands (see
  // HOLD_BACK_UNTIL_LOST). The full pack is the largest count seen, since
  // followers are linked after the chief is constructed. A chief that never
  // had a pack is neither slowed nor held back.
  _updatePackLossSpeed(enemy, rc) {
    let alive = 0;
    for (const e of enemy.game?.currentRoom?.enemies ?? []) {
      if (e.leaderRef === enemy && e.hp > 0 && !e.isDying) alive++;
    }
    if (alive > enemy._packSizeSeen) enemy._packSizeSeen = alive;
    if (enemy._packSizeSeen === 0) return;
    const lost = 1 - alive / enemy._packSizeSeen;
    enemy.packLossSpeedMult = PACK_FULL_SPEED + (rc.packLossSpeedMax - PACK_FULL_SPEED) * lost;
    enemy.holdingBack = lost < HOLD_BACK_UNTIL_LOST;
  },

  update(enemy, ctx) {
    const { deltaTime } = ctx;

    if (enemy.rallyCallCooldown > 0) enemy.rallyCallCooldown -= deltaTime;
    if (enemy.rallyIndicatorTimer > 0) enemy.rallyIndicatorTimer -= deltaTime;
    if (enemy.rallyBoostTimer > 0) enemy.rallyBoostTimer -= deltaTime;

    const rc = enemy.data.rallyCall;
    if (rc?.enabled && rc.packLossSpeedMax) LeaderFollowerMechanic._updatePackLossSpeed(enemy, rc);
    if (enemy.holdingBack) _holdBack(enemy);
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

    // Rally boost is consumed via Enemy.getSpeedMultiplier() (scales targetVelocity);
    // no post-blend velocity mult here — that compounded against the melee leap
    // impulse into exponential runaway.
  }
};
