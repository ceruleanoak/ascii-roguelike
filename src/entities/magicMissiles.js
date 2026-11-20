import { armLoopingBullet } from '../systems/LoopingBullet.js';

/**
 * Magic missiles — an Enemy's native `attackType: 'magic'` shot
 * (Enemy.createMagicAttack).
 *
 * A spread 0.2 rad apart, centred on the target: three missiles (the
 * Wizard's) unless the enemy authors `magicMissileCount` (Spark and
 * Necromancer fire one). An enemy that authors `loopOmega`, with
 * `loopRadius`/`loopLinearSpeed` — the Fester's Gun fields — fires loops
 * instead of straight bolts (LoopingBullet.js).
 */
export function createMagicMissiles(enemy) {
  const aimPos = enemy.markedTargetPosition || enemy.target.position;
  const dx = aimPos.x - enemy.position.x;
  const dy = aimPos.y - enemy.position.y;
  const distance = Math.sqrt(dx * dx + dy * dy);

  if (distance === 0) return null;

  const targetAngle = Math.atan2(dy, dx) + enemy._dizzyAngleOffset();

  const count = enemy.data.magicMissileCount ?? 3;
  const projectiles = [];
  for (let k = 0; k < count; k++) {
    const i = k - (count - 1) / 2;
    const baseAngle = targetAngle + (i * 0.2);
    const randomness = (Math.random() - 0.5) * 0.06; // ±0.03 radians (~2 degrees)
    const angle = baseAngle + randomness;

    const missile = {
      type: 'enemy_projectile',
      char: '*',
      position: {
        x: enemy.position.x + enemy.width / 2,
        y: enemy.position.y + enemy.height / 2
      },
      velocity: {
        vx: Math.cos(angle) * 180,
        vy: Math.sin(angle) * 180
      },
      damage: enemy.getEffectiveDamage(),
      color: '#8800ff',
      owner: enemy,
      shooterPlane: enemy.plane
    };
    if (enemy.data.loopOmega) armLoopingBullet(missile, angle, enemy.data);
    projectiles.push(missile);
  }

  return projectiles;
}
