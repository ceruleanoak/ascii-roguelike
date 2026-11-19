import { GrappleTongueMechanic } from './GrappleTongueMechanic.js';

// Mimic: object-disguise enemy that reveals when the player gets too close or
// lands a blow on it, and re-disguises if the player backs off. Its sticky
// tongue is its `grappleTongue` data (GrappleTongueMechanic), which only acts
// while it is revealed. Two call sites in Enemy.update():
//   - updateReveal(): flash → enraged transition; fires from idle
//   - updateRedisguise(): countdown to revert; only ticks while revealed
// Both modify enemy state in place — no suspend signal.

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
        GrappleTongueMechanic.onRedisguise(enemy);
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

  // Called from Enemy.takeDamage: a blow breaks the disguise at once, with no
  // reveal flash, from any range. (The tongue's release is GrappleTongueMechanic's.)
  onDamaged(enemy) {
    const cfg = enemy.data.mimicMechanic;
    if (cfg?.enabled && !enemy.mimicRevealed) {
      enemy.mimicRevealed = true;
      enemy.mimicFlashTimer = 0;
      enemy.state = 'chase';
      enemy.stateMachine?.transition(enemy, null, 'approach', 'disguise broken by a blow');
    }
    if (cfg?.redisguiseCooldown) enemy.redisguiseTimer = cfg.redisguiseCooldown.redisguiseDuration;
  }
};
