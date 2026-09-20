import { planeOf, inSamePlane, objectOnPlane } from './PlaneSystem.js';

/**
 * Red Warrior's damage dodge-roll: smashes enemies and background objects on
 * contact while active. Extracted out of CombatSystem (which still owns the
 * call site and the per-roll hit-tracking sets on itself, `_rollHitEnemies`/
 * `_rollHitObjects`/`_rollWasActive`) purely to keep that file under its
 * architecture budget — this is CombatSystem's own logic, not a shared
 * mechanic other callers reuse.
 */
export function updateRollDamage(combatSystem, player, enemies, backgroundObjects) {
  if (!player || player.dodgeRoll.type !== 'damage') return;

  const rolling = player.dodgeRoll.active;

  // Reset hit-tracking sets at the start of each new roll
  if (rolling && !combatSystem._rollWasActive) {
    combatSystem._rollHitEnemies = new Set();
    combatSystem._rollHitObjects = new Set();
  }
  combatSystem._rollWasActive = rolling;

  if (!rolling) return;

  const hitbox = player.getHitbox();
  const dir = player.dodgeRoll.direction;

  // Red zone Vault: the Red Warrior's damage roll breaks the wall on
  // contact, same as a boulder or bomb. Idempotent (checks vault.unlocked)
  // so no per-roll hit-tracking is needed here.
  combatSystem.game?.interactionSystem?.tryBreakVaultWall(
    hitbox.x + hitbox.width / 2, hitbox.y + hitbox.height / 2,
    Math.max(hitbox.width, hitbox.height) / 2
  );

  // Damage enemies on contact (once per enemy per roll)
  for (const enemy of enemies) {
    if (combatSystem._rollHitEnemies.has(enemy) || enemy.hp <= 0) continue;
    if (!inSamePlane(player, enemy)) continue;
    const eb = enemy.getHitbox();
    if (hitbox.x < eb.x + eb.width && hitbox.x + hitbox.width > eb.x &&
        hitbox.y < eb.y + eb.height && hitbox.y + hitbox.height > eb.y) {
      combatSystem._rollHitEnemies.add(enemy);
      const result = enemy.takeDamage(1);
      if (result) {
        combatSystem.createDamageNumber(1, enemy.position.x, enemy.position.y, '#ff4444');
        // Knockback in the roll direction
        enemy.velocity.vx = dir.x * 300;
        enemy.velocity.vy = dir.y * 300;
        if (enemy.applyStatusEffect) enemy.applyStatusEffect('knockback', 0.25);
      }
    }
  }

  // Smash background objects on contact (once per object per roll)
  for (const obj of backgroundObjects) {
    if (obj.destroyed || obj.isRecipeSign || obj.indestructible || obj.hp === null) continue;
    if (!objectOnPlane(obj, planeOf(player))) continue;
    if (combatSystem._rollHitObjects.has(obj)) continue;
    const ob = obj.getHitbox();
    if (hitbox.x < ob.x + ob.width && hitbox.x + hitbox.width > ob.x &&
        hitbox.y < ob.y + ob.height && hitbox.y + hitbox.height > ob.y) {
      combatSystem._rollHitObjects.add(obj);
      const result = obj.takeDamage(1, false);
      if (result.effect) {
        combatSystem.objectDestroyEvents.push({ obj, effect: result.effect });
      }
    }
  }
}
