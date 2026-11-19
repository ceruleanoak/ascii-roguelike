import { GRID } from '../../game/GameConfig.js';
import { commitAttack } from '../enemyDecision.js';

// Grapple Tongue — `data.grappleTongue`: a sticky tongue shot at a player in
// mid range that hooks them and reels them in to the mouth, where it bites.
// First the Mimic's (lifted out of MimicMechanic whole), now any enemy's.
//
// Phases, carried on `enemy.grappleTongue` (null while the tongue is in):
//   cooldown → 'extending' (tip flies toward where the player stood)
//            → 'hooked'    (player.hookedByTongue = enemy; dragged to the mouth)
// A miss retracts on the miss cooldown; landing the reel deals `damage` with
// knockback and starts the hit cooldown. Any damage the enemy takes lets go.
//
// A Mimic's tongue only works while it is revealed — a disguised chest has
// no tongue. Writes enemy/player state in place, no suspend signal.

const DEFAULTS = {
  minRange: 2.5,      // cells — closer than this the tongue doesn't fire
  maxRange: 9,        // cells
  extendSpeed: 320,   // px/s
  pullSpeed: 22,      // px/s the hooked player is dragged
  damage: 5,
  cooldowns: { initial: 3.0, miss: 6.0, hit: 8.0 }
};

function config(enemy) {
  const cfg = enemy.data.grappleTongue;
  return { ...DEFAULTS, ...cfg, cooldowns: { ...DEFAULTS.cooldowns, ...cfg?.cooldowns } };
}

export const GrappleTongueMechanic = {
  isEnabled(enemy) {
    return !!enemy.data?.grappleTongue;
  },

  // The tongue can act (and is drawn) this frame.
  isActive(enemy) {
    if (!this.isEnabled(enemy)) return false;
    if (enemy.data.mimicMechanic?.enabled && !enemy.mimicRevealed) return false;
    return true;
  },

  init(enemy) {
    enemy.grappleTongueCooldown = config(enemy).cooldowns.initial;
    enemy.grappleTongue = null;
  },

  update(enemy, ctx) {
    if (!this.isActive(enemy) || !enemy.target) return;
    const cfg = config(enemy);
    const { deltaTime, distance } = ctx;

    const CELL = GRID.CELL_SIZE;
    const player = enemy.target;
    const sx = enemy.position.x + enemy.width / 2;
    const sy = enemy.position.y + enemy.height / 2;
    const px = player.position.x + player.width / 2;
    const py = player.position.y + player.height / 2;

    if (!enemy.grappleTongue) {
      enemy.grappleTongueCooldown -= deltaTime;
      if (enemy.grappleTongueCooldown <= 0) {
        if (distance >= CELL * cfg.minRange && distance <= CELL * cfg.maxRange && commitAttack(enemy)) {
          const dx = px - sx;
          const dy = py - sy;
          const dist = Math.sqrt(dx * dx + dy * dy);
          enemy.grappleTongue = {
            phase: 'extending',
            direction: { x: dx / dist, y: dy / dist },
            currentLength: 0,
            maxLength: dist
          };
        }
      }
    } else if (enemy.grappleTongue.phase === 'extending') {
      enemy.grappleTongue.currentLength += cfg.extendSpeed * deltaTime;
      const tipX = sx + enemy.grappleTongue.direction.x * enemy.grappleTongue.currentLength;
      const tipY = sy + enemy.grappleTongue.direction.y * enemy.grappleTongue.currentLength;
      const ddx = tipX - px;
      const ddy = tipY - py;
      if (Math.sqrt(ddx * ddx + ddy * ddy) < CELL * 0.8) {
        enemy.grappleTongue.phase = 'hooked';
        player.hookedByTongue = enemy;
      } else if (enemy.grappleTongue.currentLength >= enemy.grappleTongue.maxLength) {
        enemy.grappleTongue = null;
        enemy.grappleTongueCooldown = cfg.cooldowns.miss;
      }
    } else if (enemy.grappleTongue.phase === 'hooked') {
      const dx = sx - px;
      const dy = sy - py;
      const dist = Math.sqrt(dx * dx + dy * dy);
      // Reeled all the way in: the mouth is the body's center, so a bigger
      // body (Body Cells) bites as soon as the player reaches its edge.
      const mouthReach = Math.max(CELL * 0.15, enemy.width / 2 - CELL * 0.5);
      if (dist < mouthReach) {
        const result = player.takeDamage(cfg.damage, { isBullet: false, attacker: enemy });
        enemy.game?.physicsSystem?.applyDamageKnockback(player, result, sx, sy);
        this.release(enemy, cfg.cooldowns.hit);
      } else {
        player.position.x += (dx / dist) * cfg.pullSpeed * deltaTime;
        player.position.y += (dy / dist) * cfg.pullSpeed * deltaTime;
      }
    }
  },

  // Retract the tongue (letting go of a hooked player) and start `cooldown`.
  release(enemy, cooldown) {
    if (enemy.grappleTongue?.phase === 'hooked' && enemy.target?.hookedByTongue === enemy) {
      enemy.target.hookedByTongue = null;
    }
    enemy.grappleTongue = null;
    enemy.grappleTongueCooldown = cooldown;
  },

  // Called from Enemy.takeDamage: any damage taken lets a hooked player go.
  onDamaged(enemy) {
    if (!this.isEnabled(enemy)) return;
    if (enemy.grappleTongue?.phase === 'hooked') this.release(enemy, config(enemy).cooldowns.hit);
  },

  // A Mimic re-disguising pulls its tongue in.
  onRedisguise(enemy) {
    if (!this.isEnabled(enemy)) return;
    this.release(enemy, config(enemy).cooldowns.initial);
  }
};
