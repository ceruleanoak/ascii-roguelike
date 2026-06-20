import { GRID } from '../../game/GameConfig.js';

// Trap Goblin — self-contained state machine + custom movement. The trap block
// fully owns the goblin's velocity each frame; it can't share targetVelocity
// with the kiter because the kiter's hover band has no radial-stability force,
// so any drift accumulates until the goblin coasts into safe range and aborts
// the windup. Writes velocity AND targetVelocity directly so _blendVelocity
// has nothing to lag behind and the kiter's earlier writes are obliterated.

export const TrapLayerMechanic = {
  isEnabled(enemy) {
    return enemy.data.trapLayerMechanic?.enabled === true;
  },

  init(enemy) {
    enemy.trapLayTimer = 0;
    enemy.trapWindupActive = false;
    enemy.trapWindupTimer = 0;
    enemy.postTrapBurstTimer = 0;
  },

  update(enemy, ctx) {
    const cfg = enemy.data.trapLayerMechanic;
    if (!cfg?.enabled) return;
    const { deltaTime, dotDamageEvents } = ctx;

    const safeRange = cfg.trapSafeRange ?? GRID.CELL_SIZE * 5;
    const kiteDistance = enemy.movementConfig?.kiteDistance ?? GRID.CELL_SIZE * 7;
    let playerDx = 0, playerDy = 0, playerDist = Infinity;
    let playerTooClose = false;
    let seesPlayer = false;
    if (enemy.target) {
      playerDx = enemy.position.x - enemy.target.position.x;
      playerDy = enemy.position.y - enemy.target.position.y;
      playerDist = Math.sqrt(playerDx * playerDx + playerDy * playerDy);
      playerTooClose = playerDist < safeRange;
      seesPlayer = enemy.hasVision(enemy.position, enemy.target.position, enemy.visionLength, { ignoreCone: true });
    }

    if (enemy.postTrapBurstTimer > 0) {
      enemy.postTrapBurstTimer = Math.max(0, enemy.postTrapBurstTimer - deltaTime);
    }

    let trapDropResult = null;
    if (enemy.trapWindupActive) {
      if (playerTooClose) {
        enemy.trapWindupActive = false;
        enemy.trapWindupTimer = 0;
        enemy.trapLayTimer = 0;
      } else {
        enemy.trapWindupTimer -= deltaTime;
        if (enemy.trapWindupTimer <= 0) {
          enemy.trapWindupActive = false;
          enemy.trapLayTimer = cfg.trapCooldown;
          enemy.postTrapBurstTimer = cfg.postTrapBurstDuration ?? 1.5;
          const trapType = cfg.trapTypes[Math.floor(Math.random() * cfg.trapTypes.length)];
          trapDropResult = {
            suspend: true,
            result: {
              dotDamage: dotDamageEvents,
              shouldLayTrap: true,
              trapData: {
                x: enemy.position.x + enemy.width / 2,
                y: enemy.position.y + enemy.height / 2,
                type: trapType
              }
            }
          };
        }
      }
    } else if (enemy.postTrapBurstTimer <= 0) {
      const cooldownSpeed = seesPlayer ? (cfg.trapCooldownVisibleMult ?? 0.4) : 1.0;
      enemy.trapLayTimer = Math.max(0, enemy.trapLayTimer - deltaTime / cooldownSpeed);
      if (enemy.trapLayTimer <= 0 && !playerTooClose && enemy.target) {
        enemy.trapWindupActive = true;
        enemy.trapWindupTimer = cfg.trapWindup ?? 0.5;
      }
    }

    // Custom movement — overrides kiter writes. Velocity is set directly so
    // _blendVelocity has nothing to lag behind.
    let vx = 0, vy = 0;
    if (enemy.trapWindupActive) {
      vx = 0; vy = 0;
    } else if (enemy.target && playerDist > 0) {
      if (enemy.postTrapBurstTimer > 0 || playerTooClose) {
        const fleeMult = enemy.postTrapBurstTimer > 0
          ? (cfg.postTrapBurstSpeed ?? 1.8)
          : (cfg.fleeSpeedMult ?? 1.8);
        const fleeSpeed = enemy.speed * fleeMult;
        vx = (playerDx / playerDist) * fleeSpeed;
        vy = (playerDy / playerDist) * fleeSpeed;
      } else {
        const radialErr = playerDist - kiteDistance;
        const goblinToPlayerX = -playerDx / playerDist;
        const goblinToPlayerY = -playerDy / playerDist;
        const perpX = -playerDy / playerDist;
        const perpY = playerDx / playerDist;
        const tangentialSpeed = enemy.speed * 0.75;
        const radialSpeed = Math.max(-enemy.speed, Math.min(enemy.speed, radialErr * 3.0));
        vx = perpX * tangentialSpeed + goblinToPlayerX * radialSpeed;
        vy = perpY * tangentialSpeed + goblinToPlayerY * radialSpeed;
        const mag = Math.sqrt(vx * vx + vy * vy);
        if (mag > enemy.speed) { vx = (vx / mag) * enemy.speed; vy = (vy / mag) * enemy.speed; }
      }

      const repel = enemy._exitRepulsionVector();
      vx += repel.vx;
      vy += repel.vy;
    }
    const speedMult = enemy.getSpeedMultiplier();
    enemy.velocity.vx = vx * speedMult;
    enemy.velocity.vy = vy * speedMult;
    enemy.targetVelocity.vx = enemy.velocity.vx;
    enemy.targetVelocity.vy = enemy.velocity.vy;

    return trapDropResult;
  }
};
