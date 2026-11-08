import { planeOf, inSamePlane, objectOnPlane } from './PlaneSystem.js';
import { enemyOverlapsBox, enemyVisualAnchor } from './enemyHitTest.js';
import { GRID } from '../game/GameConfig.js';

// What the roll hits for, enemy or object.
const ROLL_DAMAGE = 2;
// A solid object stops the roll where PhysicsSystem stops the player's body
// (position + width/height, far wider than the damage hitbox), so the object
// test measures from the body and reaches this far past it to count that
// stop as contact.
const ROLL_CONTACT_REACH = 2;
// The roll strikes objects as the Flail does — a blunt blow that breaks Rock
// and Glittering Rock (breaksRock) and is refused by everything else that
// answers to a particular tool (InteractionSystem.resolveSmashRefusal).
const ROLL_STRIKE = Object.freeze({ damage: ROLL_DAMAGE, isBlunt: true, breaksRock: true });

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
  const rollCx = hitbox.x + hitbox.width / 2;
  const rollCy = hitbox.y + hitbox.height / 2;
  const rollRadius = Math.max(hitbox.width, hitbox.height) / 2;
  combatSystem.game?.interactionSystem?.tryBreakVaultWall(rollCx, rollCy, rollRadius);
  // Same contact rule for a Shed's small door (HutSystem.tryBreakShedDoor).
  combatSystem.game?.hutSystem?.tryBreakShedDoor(rollCx, rollCy, rollRadius);

  // Damage enemies on contact (once per enemy per roll)
  for (const enemy of enemies) {
    if (combatSystem._rollHitEnemies.has(enemy) || enemy.hp <= 0) continue;
    if (!inSamePlane(player, enemy)) continue;
    if (enemyOverlapsBox(enemy, hitbox)) {
      combatSystem._rollHitEnemies.add(enemy);
      const result = enemy.takeDamage(ROLL_DAMAGE);
      if (result) {
        const at = enemyVisualAnchor(enemy);
        combatSystem.createDamageNumber(ROLL_DAMAGE, at.x, at.y, '#ff4444');
        // Knockback in the roll direction
        enemy.velocity.vx = dir.x * 300;
        enemy.velocity.vy = dir.y * 300;
        if (enemy.applyStatusEffect) enemy.applyStatusEffect('knockback', 0.25);
      }
    }
  }

  // Smash background objects on contact (once per object per roll)
  const interactionSystem = combatSystem.game?.interactionSystem;
  const reach = ROLL_CONTACT_REACH;
  const body = {
    x: player.position.x, y: player.position.y,
    width: player.width || GRID.CELL_SIZE, height: player.height || GRID.CELL_SIZE,
  };
  for (const obj of backgroundObjects) {
    if (obj.destroyed || obj.isRecipeSign || obj.indestructible || obj.hp === null) continue;
    if (!objectOnPlane(obj, planeOf(player))) continue;
    if (combatSystem._rollHitObjects.has(obj)) continue;
    const ob = obj.getHitbox();
    if (body.x - reach < ob.x + ob.width && body.x + body.width + reach > ob.x &&
        body.y - reach < ob.y + ob.height && body.y + body.height + reach > ob.y) {
      combatSystem._rollHitObjects.add(obj);
      const damage = rollDamageTo(interactionSystem, obj);
      if (damage <= 0) {
        combatSystem.createDamageNumber('!', obj.position.x, obj.position.y, '#aaaaaa');
        continue;
      }
      const result = obj.takeDamage(damage, false);
      if (result.effect) {
        combatSystem.objectDestroyEvents.push({ obj, effect: result.effect });
      }
    }
  }
}

// The roll's damage to one object, or 0 when the object refuses it — the
// same answers a Flail swing gets from InteractionSystem.
function rollDamageTo(interactionSystem, obj) {
  if (!interactionSystem) return ROLL_DAMAGE;
  if (obj.data?.glitteringRock) return interactionSystem.resolveGlitteringRockDamage(ROLL_STRIKE, obj);
  if (interactionSystem.resolveSmashRefusal(ROLL_STRIKE, obj)) return 0;
  return interactionSystem.resolveSmashDamage(ROLL_STRIKE, obj);
}
