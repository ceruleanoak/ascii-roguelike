import { inSamePlane } from './PlaneSystem.js';

// Wet-enemy/player electrical conduction — extracted from CombatSystem so a
// projectile/melee electric hit on a conductive object can chain into anyone
// standing in water nearby. See CombatSystem.conductElectricity for the call sites.
export function conductElectricity(combatSystem, sourceObj, damage, enemies, player = null) {
  const WET_RANGE = 80;
  const WET_MULT = 2.0;

  for (const enemy of enemies) {
    if (!enemy.isWet || !enemy.isWet()) continue;
    if (!inSamePlane(sourceObj, enemy)) continue;

    const dx = enemy.position.x - sourceObj.position.x;
    const dy = enemy.position.y - sourceObj.position.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist <= WET_RANGE) {
      const dmg = Math.ceil(damage * WET_MULT);
      enemy.takeDamage(dmg);
      // 'zap', not 'stun' — electric immobilization with the shake visual;
      // electric-affinity enemies are auto-immune via EFFECT_AFFINITY.
      enemy.applyStatusEffect('zap', 3.5);
      combatSystem.createDamageNumber(dmg, enemy.position.x, enemy.position.y, '#00ffff');
      combatSystem.createDamageNumber('⚡', enemy.position.x, enemy.position.y - 10, '#ffff00');
    }
  }

  // Also damage wet player (they're in the electrical field) — no knockback:
  // this fires every tick the player stands in the field, and a per-frame
  // push would fight the player's own movement instead of reading as a hit.
  if (player && player.isWet && player.isWet()) {
    const dx = player.position.x - sourceObj.position.x;
    const dy = player.position.y - sourceObj.position.y;
    if (Math.sqrt(dx * dx + dy * dy) <= WET_RANGE) {
      const dead = player.takeDamage(Math.ceil(damage * WET_MULT));
      if (dead === true) {
        combatSystem.createDamageNumber(Math.ceil(damage * WET_MULT), player.position.x, player.position.y, player.color);
        return { playerDead: true };
      }
    }
  }

  return null;
}
