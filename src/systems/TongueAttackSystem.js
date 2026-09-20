import { GRID } from '../game/GameConfig.js';

// Frog tongue attacks: extend → hold → retract. Extracted out of
// CombatSystem.js (which still owns spawning via createEnemyAttack and all
// other combat entity arrays) so the tongue's own hit resolution — the
// miss chance and the slow-not-lock effect on connect — has a home instead
// of growing CombatSystem's already-large per-frame update() further.
export class TongueAttackSystem {
  constructor(combatSystem) {
    this.combatSystem = combatSystem;
    this.tongueAttacks = []; // { owner, direction, maxLength, currentLength, phase, ... }
  }

  spawn(attackData) {
    this.tongueAttacks.push(attackData);
  }

  reset() {
    this.tongueAttacks = [];
  }

  // Returns { playerDead: true, ...splice results } on a killing hit, else null.
  update(deltaTime, player) {
    const cs = this.combatSystem;
    for (let i = this.tongueAttacks.length - 1; i >= 0; i--) {
      const tongue = this.tongueAttacks[i];
      tongue.timer += deltaTime;

      if (tongue.phase === 'extending') {
        const t = Math.min(tongue.timer / tongue.extendDuration, 1);
        tongue.currentLength = tongue.maxLength * t;
        if (tongue.timer >= tongue.extendDuration) {
          tongue.currentLength = tongue.maxLength;
          tongue.phase = 'hold';
          tongue.timer = 0;

          // Collision check at full extension — damage whatever the frog is
          // actually snapping at. EnemyUpdateSystem._selectTarget can aim a
          // frog at a golem or tamed rat, not only the player (bug: frogs
          // couldn't hit golems because this check was hardcoded to
          // player.getHitbox()). Player keeps its full resolution (block/
          // miss-chance/dodge/knockback/freeze); a golem or rat target gets
          // the same plain takeDamage() path applyEnemyDamageToGolems/
          // applyEnemyDamageToTamedRats use for melee/projectile hits —
          // anything else (game.companion, a dead/out-of-range target) falls
          // back to the player check, unchanged from before this fix.
          if (!tongue.hasHit) {
            const owner = tongue.owner;
            const game = cs.game;
            const ownerTarget = owner.target;
            const isGolemTarget = ownerTarget && ownerTarget !== player && game?.golems?.includes(ownerTarget);
            const isRatTarget = ownerTarget && ownerTarget !== player && game?.tamedRats?.includes(ownerTarget);
            const target = (isGolemTarget || isRatTarget) ? ownerTarget : player;

            const sx = owner.position.x + GRID.CELL_SIZE / 2;
            const sy = owner.position.y + GRID.CELL_SIZE / 2;
            const tipX = sx + tongue.direction.x * tongue.maxLength;
            const tipY = sy + tongue.direction.y * tongue.maxLength;
            const targetBox = target === player ? target.getHitbox() : {
              x: target.position.x, y: target.position.y,
              width: target.width || GRID.CELL_SIZE, height: target.height || GRID.CELL_SIZE
            };
            const half = GRID.CELL_SIZE * 0.5;
            if (tipX + half > targetBox.x && tipX - half < targetBox.x + targetBox.width &&
                tipY + half > targetBox.y && tipY - half < targetBox.y + targetBox.height) {
              if (target !== player) {
                if (target.invulnerabilityTimer > 0) { tongue.hasHit = true; continue; }
                const result = target.takeDamage(tongue.damage, owner);
                if (result) {
                  cs.createDamageNumber?.(tongue.damage, target.position.x, target.position.y, target.color);
                  if (isGolemTarget && result.died && !result.resurrecting) {
                    game.physicsSystem.removeEntity(target);
                    const idx = game.golems.indexOf(target);
                    if (idx >= 0) game.golems.splice(idx, 1);
                  }
                }
                tongue.hasHit = true;
                continue;
              }
              if (player.isStaffBlocking) {
                cs.createDamageNumber('BLOCK', player.position.x, player.position.y, '#aaaaaa');
                tongue.hasHit = true;
                continue;
              }
              // The snap itself is unreliable — half the time the tongue doesn't
              // quite find its grip, independent of the player's own dodge stat.
              if (Math.random() < 0.5) {
                cs.createDamageNumber('MISS', player.position.x, player.position.y, '#aaaaaa');
                tongue.hasHit = true;
                continue;
              }
              const result = player.takeDamage(tongue.damage, { isBullet: false, attacker: owner });
              if (result === true) {
                this.tongueAttacks.splice(i, 1);
                return { playerDead: true, objectEffects: cs.objectDestroyEvents.splice(0), impactEffects: cs.impactEffects.splice(0), newSteamClouds: cs.newSteamClouds.splice(0), polymorphEvents: cs.polymorphEvents.splice(0) };
              }
              if (result?.dodged) {
                cs.createDamageNumber(result.lucky ? 'LUCKY DODGE' : 'DODGE',
                                        player.position.x, player.position.y,
                                        result.lucky ? '#ffff66' : '#ffff00');
              } else if (result !== false) {
                cs.createDamageNumber(result.actualDamage ?? tongue.damage, player.position.x, player.position.y, player.color);
                cs.physicsSystem.applyDamageKnockback(player, result, sx, sy);
                // Slows instead of stopping — frog's recover no longer hard-locks the player (see enemies.js).
                player.applyStatusEffect?.('freeze', 0.5);
              }
              tongue.hasHit = true;
            }
          }
        }
      } else if (tongue.phase === 'hold') {
        if (tongue.timer >= tongue.holdDuration) {
          tongue.phase = 'retracting';
          tongue.timer = 0;
        }
      } else if (tongue.phase === 'retracting') {
        const t = Math.min(tongue.timer / tongue.retractDuration, 1);
        tongue.currentLength = tongue.maxLength * (1 - t);
        if (tongue.timer >= tongue.retractDuration) {
          this.tongueAttacks.splice(i, 1);
        }
      }
    }
    return null;
  }
}
