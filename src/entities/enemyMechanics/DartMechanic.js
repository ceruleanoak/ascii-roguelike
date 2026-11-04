// Dart Mechanic — `data.dart`: a rapid attack and retreat. The enemy holds
// still for a short tell, darts at the target far faster than it moves, and
// its body is the hitbox for as long as the dart lasts. Touching the target
// (or running out of dart time) turns it straight around into a retreat, and
// it pays its cooldown once it is clear. Between darts the enemy's own State
// spine runs as usual, so a kiter keeps its distance there.
//
//   dart: {
//     triggerRange,  // px — starts a dart only from within this distance
//     tellTime,      // double-seconds held still before the dart
//     speed,         // px/s while darting (homes on the target)
//     dartTime,      // double-seconds before an unlanded dart gives up
//     retreatSpeed,  // px/s straight away from the target
//     retreatTime,   // double-seconds of retreat
//     cooldown,      // double-seconds between darts
//     initialDelay,  // double-seconds before the first dart (default: cooldown)
//     knockback,     // force applied to the target on contact (default 300)
//   }
//
// Phases run in Enemy.update (double-second deltaTime) beside the Frost
// Lunge, returning a suspend payload so no other AI writes velocity while a
// dart is under way. Contact is resolved from EnemyUpdateSystem's per-enemy
// loop, beside charge contact and BumpMechanic, because it needs the player
// and PhysicsSystem. Like every committed attack, a dart never starts or
// continues off-screen, and stun/freeze/zap/sleep/knockback interrupt it.

import { inSamePlane } from '../../systems/PlaneSystem.js';
import { reportDamageResult } from '../../systems/DamageNumberQueue.js';
import { glyphsTouch } from './glyphContact.js';

function stop(enemy) {
  enemy.velocity.vx = enemy.targetVelocity.vx = 0;
  enemy.velocity.vy = enemy.targetVelocity.vy = 0;
}

// Sets velocity toward (sign 1) or away from (sign -1) the target.
function steer(enemy, speed, sign) {
  const dx = enemy.target.position.x - enemy.position.x;
  const dy = enemy.target.position.y - enemy.position.y;
  const angle = Math.atan2(dy, dx) + enemy._dizzyAngleOffset();
  enemy.velocity.vx = enemy.targetVelocity.vx = Math.cos(angle) * speed * sign;
  enemy.velocity.vy = enemy.targetVelocity.vy = Math.sin(angle) * speed * sign;
}

export const DartMechanic = {
  isEnabled(enemy) {
    return !!enemy.data?.dart;
  },

  init(enemy) {
    const cfg = enemy.data.dart;
    enemy.dartPhase = 'idle'; // 'idle' | 'tell' | 'dart' | 'retreat'
    enemy.dartTimer = 0;
    enemy.dartCooldown = cfg.initialDelay ?? cfg.cooldown;
  },

  update(enemy, ctx) {
    const cfg = enemy.data.dart;
    if (!cfg) return;
    const { deltaTime, distance, onScreen, dotDamageEvents } = ctx;
    const hold = { suspend: true, result: { dotDamage: dotDamageEvents } };

    if (enemy.dartPhase !== 'idle' && (!onScreen || !enemy.target)) {
      this.interrupt(enemy);
      return;
    }

    if (enemy.dartPhase === 'tell') {
      stop(enemy);
      enemy.dartTimer -= deltaTime;
      if (enemy.dartTimer > 0) return hold;
      enemy.dartPhase = 'dart';
      enemy.dartTimer = cfg.dartTime;
      return hold;
    }

    if (enemy.dartPhase === 'dart') {
      enemy.dartTimer -= deltaTime;
      if (enemy.dartTimer <= 0) { this.retreat(enemy); return hold; }
      steer(enemy, cfg.speed, 1);
      return hold;
    }

    if (enemy.dartPhase === 'retreat') {
      enemy.dartTimer -= deltaTime;
      if (enemy.dartTimer <= 0) { this.interrupt(enemy); return; }
      steer(enemy, cfg.retreatSpeed, -1);
      return hold;
    }

    if (enemy.dartCooldown > 0) {
      enemy.dartCooldown -= deltaTime;
      return;
    }
    if (!onScreen || !enemy.target || enemy.commanded) return;
    if (distance > cfg.triggerRange || !inSamePlane(enemy, enemy.target)) return;
    enemy.dartPhase = 'tell';
    enemy.dartTimer = cfg.tellTime ?? 0;
    stop(enemy);
    return hold;
  },

  /** Turn a dart around into its retreat. */
  retreat(enemy) {
    enemy.dartPhase = 'retreat';
    enemy.dartTimer = enemy.data.dart.retreatTime;
  },

  /** End a dart at any phase and pay the cooldown. No-op when idle. */
  interrupt(enemy) {
    const cfg = enemy.data?.dart;
    if (!cfg || enemy.dartPhase === 'idle') return;
    enemy.dartPhase = 'idle';
    enemy.dartTimer = 0;
    enemy.dartCooldown = cfg.cooldown;
  },

  /** A darting body that meets the player's glyph damages them once, then retreats. */
  resolveContact(enemy, player, game) {
    if (enemy.dartPhase !== 'dart' || enemy.commanded || enemy.isDying) return;
    if (player.dodgeRoll?.active || !inSamePlane(enemy, player)) return;
    if (!glyphsTouch(enemy, player)) return;

    const damage = enemy.getEffectiveDamage();
    const result = player.takeDamage(damage, { isMelee: true, attacker: enemy });
    reportDamageResult(game.combatSystem, result, damage, player);
    if (result !== false && !result?.dodged && !result?.blocked) {
      game.physicsSystem.applyKnockback(player, enemy.position.x, enemy.position.y, enemy.data.dart.knockback ?? 300);
    }
    this.retreat(enemy);
  },
};
