// Split shot — a player projectile with `split` breaks into a fan of weaker
// copies on its first hit. Extracted from CombatSystem (architecture budget);
// CombatSystem pushes the returned splits into its player projectile list.

import { GRID } from '../game/GameConfig.js';

export function createSplitProjectiles(originalProj) {
  const splitCount = originalProj.splitCount || 3;
  const angle = Math.atan2(originalProj.velocity.vy, originalProj.velocity.vx);
  const speed = Math.sqrt(originalProj.velocity.vx ** 2 + originalProj.velocity.vy ** 2);
  const splits = [];

  for (let i = 0; i < splitCount; i++) {
    const spreadAngle = angle + (i - Math.floor(splitCount / 2)) * 0.4;

    splits.push({
      // Inherit all special properties from the original projectile
      onHit: originalProj.onHit,
      owner: originalProj.owner,
      plane: originalProj.plane,
      shooterPlane: originalProj.shooterPlane,
      knockback: originalProj.knockback,
      chain: originalProj.chain,
      chainCount: originalProj.chainCount,
      explode: originalProj.explode,
      explodeRadius: originalProj.explodeRadius,
      pierce: originalProj.pierce,
      pierceHitEnemies: new Set(),
      lifesteal: originalProj.lifesteal,
      launchPit: originalProj.launchPit, // splits fly at the parent shot's height
      // Split-specific overrides
      type: originalProj.type,
      char: originalProj.char,
      position: { ...originalProj.position },
      velocity: {
        vx: Math.cos(spreadAngle) * speed * 0.8,
        vy: Math.sin(spreadAngle) * speed * 0.8
      },
      damage: Math.ceil(originalProj.damage * 0.6),
      color: originalProj.color,
      width: GRID.CELL_SIZE,
      height: GRID.CELL_SIZE,
      hasSplit: true // Prevent infinite splitting
    });
  }
  return splits;
}
