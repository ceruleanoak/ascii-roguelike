// mirroredWeapon — the shared shape of a body that fires with the player:
// the Mist Battle's Flanks (MistBattleSystem) and the Dragon Spirit's Echo
// (DragonSpiritSystem). Both mirror the player's attack press, held-SPACE
// repeat and release with a weapon of their own, built from their own
// position through the carrier pattern (`body.useHeldItem()` /
// `heldItem.releaseBow()`), and both are hit by enemy attacks that
// CombatSystem only resolves against `game.player`.
//
// A mirroring body needs: `heldItem`, `canAttack()`, `useHeldItem()`,
// `dodgeRoll`, `position`, `getHitbox()` and `plane`. Each caller passes its
// own `fire(attack)`, which decides which modifiers apply (the Trine skips
// the Primary-only damage modifier; the Echo is the player's twin and keeps it).
import { PHYSICS } from '../game/GameConfig.js';
import { WEAPON_TYPES } from '../data/items.js';
import { attackHitsBox, isSweptStrike } from '../game/Telegraph.js';
import { inSamePlane } from './PlaneSystem.js';

// Weapon behavior that lives in player-bound systems (MagicSystem's mana
// meter, the bat-charge and flail-spin tickers in main.js, the charge-hammer
// lifecycle) can't run from a second body, so these weapons never mirror.
export function canMirror(data) {
  if (data.weaponSubtype === 'bat' || data.weaponSubtype === 'flail') return false;
  if (data.chargeHammer || data.gemWand || data.batCharge || data.flailSpin) return false;
  if (data.manaCost) return false;
  return true;
}

/** SPACE press: fire alongside the player's own attack. */
export function mirrorPress(body, fire) {
  if (body.heldItem && body.canAttack()) fire(body.useHeldItem());
}

/** SPACE release: loose a charged bow (mirrors main.js handleSpaceRelease). */
export function mirrorRelease(body, fire) {
  if (body.heldItem?.isCharging && body.canAttack()) fire(body.heldItem.releaseBow());
}

// Held-SPACE repeat for guns and melee, the per-body shape of
// CharacterSystem.handleAutoAttack (charge weapons fire on release instead).
export function mirrorAutoAttack(game, body, fire) {
  const weapon = body.heldItem;
  if (!game.keys.space || !game.attackSequenceActive || !weapon) return;
  const type = weapon.data.weaponType;
  if (type === WEAPON_TYPES.BOW || type === 'WAND' || type === 'UTILITY') return;
  // Held SPACE simply resumes once a roll ends — no roll-queued shot.
  if (!body.dodgeRoll.active && body.canAttack()) fire(body.useHeldItem());
}

// The body's held weapon ticks at the same WEAPON_TIMER_RATE as the player's
// (main.js updatePlayerMechanics); a completed windup lands here.
export function tickMirroredWeapon(game, body, deltaTime, fire) {
  const weapon = body.heldItem;
  if (!weapon?.update) return;
  const windupAttack = weapon.update(deltaTime * PHYSICS.WEAPON_TIMER_RATE);
  if (windupAttack) {
    game.playWeaponAttackSFX(weapon);
    fire(windupAttack);
  }
}

/**
 * Resolve live enemy projectiles and melee attacks against `body`, the same
 * poll-after-combat shape as CompanionSystem.applyEnemyDamageToTamedRats.
 * `takeHit(damage, damageSource, from, knockbackForce)` applies a connecting
 * hit and returns Player.takeDamage's result; `false` means the hit passed
 * through (i-frames), so a projectile flies on. `meleeResolved` (a WeakMap,
 * enemy melee attack → Set of bodies it is done with) is the caller's: a
 * still attack gets one test per body, a travelling strike keeps testing
 * until it connects (Telegraph.retireAfterTest's rule).
 */
export function resolveEnemyHitsOn(game, body, meleeResolved, takeHit) {
  const cs = game.combatSystem;
  const projectiles = cs.enemyProjectiles || [];
  const melee = cs.enemyMeleeAttacks || [];
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const proj = projectiles[i];
    if (proj.reflected || !inSamePlane(proj, body)) continue;
    if (!cs.checkProjectileCollisionWithPlayer(proj, body)) continue;
    const result = takeHit(proj.damage, { isBullet: true, element: proj.onHit, attacker: proj.owner },
      proj.position, proj.knockbackForce || PHYSICS.DEFAULT_DAMAGE_KNOCKBACK);
    if (result === false) continue;
    projectiles.splice(i, 1);
  }
  for (const attack of melee) {
    if (attack.windupPhase || attack.isCharmedAttack) continue;
    if ((attack.shooterPlane ?? 0) !== 0) continue;
    let resolved = meleeResolved.get(attack);
    if (resolved?.has(body)) continue;
    const connected = attackHitsBox(attack, body.getHitbox(), () => cs.checkMeleeCollisionWithPlayer(attack, body));
    if (connected || !isSweptStrike(attack)) {
      if (!resolved) meleeResolved.set(attack, resolved = new Set());
      resolved.add(body);
    }
    if (!connected) continue;
    takeHit(attack.damage, { isBullet: false, isMelee: true, element: attack.onHit, attacker: attack.owner },
      attack.position, attack.knockback);
  }
}

// Damage number + knockback for a landed hit, matching CombatSystem's
// player-hit reporting (dodge/block/immune words, else the damage taken).
// Pass a falsy knockbackForce to skip the shove.
export function reportHit(game, body, result, damage, from, knockbackForce) {
  const cs = game.combatSystem;
  const { x, y } = body.position;
  if (result?.dodged) cs.createDamageNumber(result.lucky ? 'LUCKY DODGE' : 'DODGE', x, y, result.lucky ? '#ffff66' : '#ffff00');
  else if (result?.blocked) cs.createDamageNumber(result.guard ?? 'BLOCK', x, y, '#aaaaaa');
  else if (result?.immune) cs.createDamageNumber('IMMUNE', x, y, '#00ffff');
  else {
    cs.createDamageNumber(result?.actualDamage ?? damage, x, y, body.color);
    if (knockbackForce) game.physicsSystem.applyKnockback(body, from.x, from.y, knockbackForce);
  }
}
