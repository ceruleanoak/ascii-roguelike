// Charm hit resolution — lets a charmed enemy's attack land on the enemy it
// is fighting instead of only ever testing the player (bugs #203/#222).
//
// enemyTargeting.js points a charmed enemy at the nearest other enemy; this
// module is the other half: whatever the attack is (melee swing, projectile,
// tongue), it resolves against that target. A charmed attack never hurts the
// player — the same rule the melee branch has followed since charm shipped.
//
// Extracted from CombatSystem per the placement procedure (charm-specific
// resolution, not general combat); CombatSystem and TongueAttackSystem call in.

import { planeOf } from './PlaneSystem.js';
import { attackHitsBox } from '../game/Telegraph.js';

// The enemy a charmed owner is fighting, or null when the owner isn't
// charmed or its target is the player (no hostile found — the fallback in
// applyTargetOverrides) or already down.
export function charmTargetOf(owner, player) {
  if (!owner?.isCharmed?.()) return null;
  const target = owner.target;
  if (!target || target === player || target.isDying || target.hp <= 0) return null;
  return target;
}

// Stamps a freshly spawned enemy projectile with its owner's charm target, so
// the shot resolves against that enemy for its whole flight even if the charm
// wears off mid-air. Melee attacks are stamped at creation (Enemy.js).
export function tagCharmedProjectile(proj, player) {
  const target = charmTargetOf(proj.owner, player);
  if (target) {
    proj.isCharmedAttack = true;
    proj.charmedTarget = target;
  }
}

function landCharmedHit(combatSystem, target, damage) {
  target.takeDamage(damage);
  combatSystem.createDamageNumber(damage, target.position.x, target.position.y, '#ff44ff');
}

// Charmed melee swing. Returns whether it connected; a target on another
// plane (or already down) can't be reached.
export function resolveCharmedMelee(combatSystem, attack) {
  const target = attack.charmedTarget;
  if (target.isDying || target.hp <= 0 || planeOf(target) !== (attack.shooterPlane ?? 0)) return false;
  const connected = attackHitsBox(attack, target.getHitbox(),
                                  () => combatSystem.checkMeleeCollision(attack, target));
  if (connected) landCharmedHit(combatSystem, target, attack.damage);
  return connected;
}

// Charmed projectile. Returns 'hit' (consume the shot), or 'flying' (keep it
// moving — it skips the player either way).
export function resolveCharmedProjectile(combatSystem, proj) {
  const target = proj.charmedTarget;
  if (target.isDying || target.hp <= 0 || planeOf(target) !== planeOf(proj)) return 'flying';
  if (!combatSystem.checkProjectileCollisionWithPlayer(proj, target)) return 'flying';
  landCharmedHit(combatSystem, target, proj.damage);
  return 'hit';
}
