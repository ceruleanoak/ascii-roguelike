import { GRID } from '../game/GameConfig.js';
import { planeOf } from './PlaneSystem.js';

// Area-effect combat helpers — extracted from CombatSystem (proximity check,
// AOE status application, explosion damage/knockback/object destruction).
// See CombatSystem.checkProximity/applyAOEStatus/createExplosion for the
// call sites; combatSystem is passed through for the pieces that still need
// its damage-number/physics/ignite helpers.

// Check if at least one enemy is within proximity range.
// position: the query center (e.g. player's center position).
export function checkProximity(position, proximityRange, enemies, sourcePlane = 0) {
  for (const enemy of enemies) {
    if (planeOf(enemy) !== sourcePlane) continue;

    // Calculate enemy center position (enemy.position is top-left)
    const enemyCenterX = enemy.position.x + (enemy.width || GRID.CELL_SIZE) / 2;
    const enemyCenterY = enemy.position.y + (enemy.height || GRID.CELL_SIZE) / 2;

    const dx = enemyCenterX - position.x;
    const dy = enemyCenterY - position.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist <= proximityRange) {
      return true; // At least one enemy in range
    }
  }
  return false; // No enemies in range
}

// Apply status effect to all enemies in radius
export function applyAOEStatus(position, radius, statusType, duration, enemies, sourcePlane = 0) {
  let affectedCount = 0;
  for (const enemy of enemies) {
    if (planeOf(enemy) !== sourcePlane) continue;

    const dx = enemy.position.x - position.x;
    const dy = enemy.position.y - position.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist <= radius) {
      enemy.applyStatusEffect(statusType, duration);
      affectedCount++;
    }
  }
  return affectedCount;
}

export function createExplosion(combatSystem, x, y, radius, damage, enemies, backgroundObjects = [], damageMin = 0, sourcePlane = 0) {
  // Damage enemies in blast radius
  // damageMin: minimum damage multiplier at edge (0 = full falloff, 0.25 = 25% damage at edge)
  for (const enemy of enemies) {
    if (planeOf(enemy) !== sourcePlane) continue;

    const dx = enemy.position.x - x;
    const dy = enemy.position.y - y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist <= radius) {
      // Calculate damage falloff: ranges from 1.0 at center to damageMin at edge
      const falloffRange = 1.0 - damageMin;
      const damageFalloff = damageMin + falloffRange * (1 - dist / radius);
      const explosionDamage = Math.ceil(damage * damageFalloff);

      enemy.takeDamage(explosionDamage);
      combatSystem.createDamageNumber(explosionDamage, enemy.position.x, enemy.position.y, '#ff8800');

      // Knockback and hitstop from explosion center
      if (dist > 0) {
        combatSystem.physicsSystem.applyKnockback(enemy, x, y, 300 * damageFalloff);
      }
      combatSystem.physicsSystem.applyHitstop(enemy, 0.06);
    }
  }

  // Affect background objects in blast radius
  for (const obj of backgroundObjects) {
    if (obj.destroyed || obj.isRecipeSign) continue; // Skip destroyed and recipe signs

    const dx = obj.position.x - x;
    const dy = obj.position.y - y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist <= radius) {
      // Glittering rocks: explosions always destroy and drop gems
      if (obj.data?.glitteringRock) {
        const result = obj.takeDamage(9999);
        if (result.effect) {
          combatSystem.objectDestroyEvents.push({ obj, effect: result.effect });
        }
        continue;
      }

      const damageFalloff = 1 - (dist / radius);
      const explosionDamage = Math.ceil(damage * damageFalloff);

      // Ignite flammable objects (routed through FireSystem)
      if (obj.isFlammable && obj.isFlammable()) {
        combatSystem._ignite(obj);
      }

      // Damage destructible objects
      if (!obj.indestructible && obj.hp !== null) {
        const result = obj.takeDamage(explosionDamage);
        if (result.effect) {
          combatSystem.objectDestroyEvents.push({ obj, effect: result.effect });
        }
      }
    }
  }

  // Create visual effect (you can enhance this later)
  combatSystem.createDamageNumber('BOOM!', x, y, '#ff4400');
}
