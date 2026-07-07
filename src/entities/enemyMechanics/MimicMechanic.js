import { GRID } from '../../game/GameConfig.js';

// Mimic: object-disguise enemy that reveals when the player gets too close,
// re-disguises if the player backs off, and fires a sticky tongue to reel the
// player in. Three call sites in Enemy.update():
//   - updateReveal(): flash → enraged transition; fires from idle
//   - updateRedisguise(): countdown to revert; only ticks while revealed
//   - updateTongue(): cooldown / extend / hooked-pull phases
// All three modify enemy state in place — no suspend signal.

export const MimicMechanic = {
  isEnabled(enemy) {
    return enemy.data.mimicMechanic?.enabled === true;
  },

  init(enemy) {
    const cfg = enemy.data.mimicMechanic;
    const disguiseTable = cfg.disguiseChars;
    enemy.disguisedAs = disguiseTable[Math.floor(Math.random() * disguiseTable.length)];
    enemy.mimicRevealed = false;
    enemy.mimicFlashTimer = 0;
    enemy.redisguiseTimer = cfg.redisguiseCooldown?.redisguiseDuration ?? 3.0;
    enemy.mimicTongueCooldown = 3.0;
    enemy.mimicTongue = null;
  },

  updateReveal(enemy, ctx) {
    const cfg = enemy.data.mimicMechanic;
    if (!cfg?.enabled || enemy.mimicRevealed) return;
    const { deltaTime, distance } = ctx;

    if (enemy.mimicFlashTimer > 0) {
      enemy.mimicFlashTimer -= deltaTime;
      if (enemy.mimicFlashTimer <= 0) enemy.mimicRevealed = true;
    } else if (enemy.target && distance < cfg.revealRadius) {
      enemy.mimicFlashTimer = cfg.revealFlashDuration;
      enemy.enraged = true;
      enemy.state = 'chase';
    }
  },

  updateRedisguise(enemy, ctx) {
    const cfg = enemy.data.mimicMechanic;
    if (!cfg?.enabled || !enemy.mimicRevealed || !enemy.target) return;
    const rdCfg = cfg.redisguiseCooldown;
    if (!rdCfg) return;
    const { deltaTime, distance } = ctx;

    if (distance >= rdCfg.reDisguiseDistance) {
      enemy.redisguiseTimer -= deltaTime;
      if (enemy.redisguiseTimer <= 0) {
        if (enemy.mimicTongue?.phase === 'hooked') {
          enemy.target.hookedByMimic = null;
        }
        enemy.mimicTongue = null;
        enemy.mimicTongueCooldown = 3.0;
        const disguiseTable = cfg.disguiseChars;
        enemy.disguisedAs = disguiseTable[Math.floor(Math.random() * disguiseTable.length)];
        enemy.mimicRevealed = false;
        enemy.mimicFlashTimer = 0;
        enemy.enraged = false;
        enemy.state = 'idle';
        enemy.redisguiseTimer = rdCfg.redisguiseDuration;
      }
    } else {
      // Player within range — reset timer; must fully back off to trigger
      enemy.redisguiseTimer = rdCfg.redisguiseDuration;
    }
  },

  updateTongue(enemy, ctx) {
    const cfg = enemy.data.mimicMechanic;
    if (!cfg?.enabled || !enemy.mimicRevealed || !enemy.target) return;
    const { deltaTime, distance } = ctx;

    const CELL = GRID.CELL_SIZE;
    const player = enemy.target;
    const sx = enemy.position.x + enemy.width / 2;
    const sy = enemy.position.y + enemy.height / 2;
    const px = player.position.x + player.width / 2;
    const py = player.position.y + player.height / 2;

    if (!enemy.mimicTongue) {
      enemy.mimicTongueCooldown -= deltaTime;
      if (enemy.mimicTongueCooldown <= 0) {
        if (distance >= CELL * 2.5 && distance <= CELL * 9) {
          const dx = px - sx;
          const dy = py - sy;
          const dist = Math.sqrt(dx * dx + dy * dy);
          enemy.mimicTongue = {
            phase: 'extending',
            direction: { x: dx / dist, y: dy / dist },
            currentLength: 0,
            maxLength: dist
          };
        }
      }
    } else if (enemy.mimicTongue.phase === 'extending') {
      enemy.mimicTongue.currentLength += 320 * deltaTime;
      const tipX = sx + enemy.mimicTongue.direction.x * enemy.mimicTongue.currentLength;
      const tipY = sy + enemy.mimicTongue.direction.y * enemy.mimicTongue.currentLength;
      const ddx = tipX - px;
      const ddy = tipY - py;
      if (Math.sqrt(ddx * ddx + ddy * ddy) < CELL * 0.8) {
        enemy.mimicTongue.phase = 'hooked';
        player.hookedByMimic = enemy;
      } else if (enemy.mimicTongue.currentLength >= enemy.mimicTongue.maxLength) {
        enemy.mimicTongue = null;
        enemy.mimicTongueCooldown = 6.0;
      }
    } else if (enemy.mimicTongue.phase === 'hooked') {
      const dx = sx - px;
      const dy = sy - py;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < CELL * 0.15) {
        const result = player.takeDamage(5, { isBullet: false, attacker: enemy });
        enemy.game?.physicsSystem?.applyDamageKnockback(player, result, sx, sy);
        player.hookedByMimic = null;
        enemy.mimicTongue = null;
        enemy.mimicTongueCooldown = 8.0;
      } else {
        player.position.x += (dx / dist) * 22 * deltaTime;
        player.position.y += (dy / dist) * 22 * deltaTime;
      }
    }
  }
};
