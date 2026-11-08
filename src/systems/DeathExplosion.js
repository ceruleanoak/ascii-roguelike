import { GRID } from '../game/GameConfig.js';
import { planeOf, tagInteriorPlane } from './PlaneSystem.js';
import { createExplosion } from '../entities/Particle.js';
import { createExplosionAftermath } from './WorldEffectsSystem.js';
import { enemyInRadius, enemyVisualAnchor } from './enemyHitTest.js';

// An enemy's `deathExplosion` goes off here, once its death shake/blink
// (deathDelay, ticked in EnemyUpdateSystem.removeDeadEnemies) runs out.
// Two styles:
//   - burst (default): a ring of `projectileCount` projectiles flies out —
//     the player dodges what the corpse throws (Red's React).
//   - 'blast' (working name "Death Blast", pending ratification): the corpse
//     blinks with its `radius` drawn as a warning circle, then the whole area
//     goes off at once — the player reads it and steps out before it lands.
//     A blast hits every living enemy in reach as well as the player, so a
//     player who knows it can lure a crowd onto the corpse. It leaves the
//     room's objects alone: no free gems from a Glittering Rock in reach.
// Nothing lingers: a blast resolves in the frame it fires.

// The color a dying enemy pulses toward and its blast flashes in.
export function deathExplosionColor(de) {
  const element = de.element ?? de.projectileType;
  return element === 'fire' ? '#ff6600'
       : element === 'freeze' ? '#88ccff'
       : element === 'magic' ? '#cc88ff'
       : '#ffcc44';
}

export function detonateDeathExplosion(game, enemy) {
  const de = enemy.data.deathExplosion;
  if (!de?.enabled) return;
  // Wet/frozen fire enemies fizzle instead of detonating — same no-fuel rule
  // as TrailMechanic's trail guard. Death shake, SFX and loot are untouched;
  // only the fire nova is suppressed. Freeze-type novas are unaffected.
  const element = de.element ?? de.projectileType;
  if (element === 'fire' && (enemy.isWet() || enemy.isFrozen())) return;

  const cx = enemy.position.x + GRID.CELL_SIZE / 2;
  const cy = enemy.position.y + GRID.CELL_SIZE / 2;
  if (de.style === 'blast') {
    detonateDeathBlast(game, enemy, de, cx, cy);
    return;
  }

  const spread = (de.spreadAngle || 360) * Math.PI / 180;
  const baseAngle = Math.random() * Math.PI * 2;
  for (let p = 0; p < de.projectileCount; p++) {
    const angle = baseAngle + (spread / de.projectileCount) * p;
    game.combatSystem.createEnemyAttack({
      type: 'enemy_projectile',
      char: de.projectileType === 'fire' ? '·' : '*',
      position: { x: cx, y: cy },
      velocity: { vx: Math.cos(angle) * de.speed, vy: Math.sin(angle) * de.speed },
      damage: de.damage,
      color: deathExplosionColor(de),
      onHit: de.projectileType === 'freeze' ? 'freeze' : undefined,
      owner: enemy,
      shooterPlane: enemy.plane ?? 0
    });
  }
}

function detonateDeathBlast(game, enemy, de, cx, cy) {
  const combat = game.combatSystem;
  const plane = planeOf(enemy);
  const knockback = de.knockback ?? 200;

  const player = game.player;
  if (player && player.hp > 0 && planeOf(player) === plane
      && enemyInRadius(player, cx, cy, de.radius, GRID.CELL_SIZE / 2)) {
    // Staff block, dodge, i-frames and immunity all report through the
    // shared player-damage path; knockback and the element's status ride
    // only a hit that landed.
    combat._applyBlockableEnemyDamage(player, enemy, de.damage, { attacker: enemy }, () => {
      game.physicsSystem.applyKnockback(player, cx, cy, knockback, 0.12);
      if (de.status) player.applyStatusEffect(de.status, de.statusDuration ?? 1.5);
    });
  }

  for (const other of game._activeEnemies()) {
    if (other === enemy || other.hp <= 0 || other.isDying) continue;
    if (planeOf(other) !== plane) continue;
    if (!enemyInRadius(other, cx, cy, de.radius, 'center')) continue;
    const result = other.takeDamage(de.damage);
    if (!result || result.dodged || result.immune) continue;
    const at = enemyVisualAnchor(other);
    combat.createDamageNumber(de.damage, at.x, at.y, '#ffffff');
    game.physicsSystem.applyKnockback(other, cx, cy, knockback);
    if (de.status) other.applyStatusEffect(de.status, de.statusDuration ?? 1.5);
  }

  const color = deathExplosionColor(de);
  for (const p of createExplosion(cx, cy, 24, color)) game.particles.push(tagInteriorPlane(game, p));
  createExplosionAftermath(game, cx, cy, { shake: 6, shakeDuration: 0.3, smoke: 10, spread: de.radius * 0.5 });
}
