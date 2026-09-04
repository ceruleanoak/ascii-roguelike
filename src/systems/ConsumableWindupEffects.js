/**
 * ConsumableWindupEffects.js
 *
 * Resolves a consumable's windup once its throw lands — the second half of
 * the throw ConsumableTriggerSystem starts. Every consumable use arcs before
 * it resolves; InventorySystem owns the in-flight windup list and ticks it
 * (updateConsumableWindups), and hands each expired entry here to be turned
 * into damage, status effects, steam clouds and particles.
 *
 * Extracted from InventorySystem — which still owns the windup list, the
 * cooldown/blink/active-effect timers this writes back to, and the sole call
 * site — to keep that file under its architecture budget. Same arrangement
 * as EquipmentEffectsSystem: the InventorySystem instance is passed in as
 * `inv` rather than duplicated state living here.
 *
 * Offensive effects (explode/curse/slow/poison/venomcloud/jolt/firecracker/
 * throwSteam) resolve in the switch below. Everything else — heals, buffs,
 * shields, anything that lands on the player — falls through to
 * ConsumableTriggerSystem.applyEffect, which owns those mutations.
 */

import { createBurstParticles, createSparkBurst } from './WorldEffectsSystem.js';

export class ConsumableWindupEffects {
  execute(inv, windup, player, enemies, combatSystem, steamClouds, particles) {
    const cd = windup.consumable.data;
    const px = windup.x;
    const py = windup.y;

    // Execute effect based on type
    switch (windup.effectType) {
      case 'explode': {
        // Bomb explosion
        const aoeRadius = cd.radius * 2;
        for (const enemy of enemies) {
          const dx = (enemy.position.x + 20) - px;
          const dy = (enemy.position.y + 20) - py;
          if (Math.sqrt(dx * dx + dy * dy) <= aoeRadius) {
            enemy.takeDamage(cd.damage);
          }
        }
        // Explosion particles
        createBurstParticles(inv.game, particles, px, py, 20, windup.consumable.color || '#ff4400');
        break;
      }
      case 'curse': {
        // Cursed Skull damage
        for (const enemy of enemies) {
          const dx = (enemy.position.x + 20) - px;
          const dy = (enemy.position.y + 20) - py;
          if (Math.sqrt(dx * dx + dy * dy) <= cd.radius) {
            enemy.takeDamage(cd.damage);
            combatSystem.createDamageNumber(cd.damage, enemy.position.x, enemy.position.y, '#ffffff');
          }
        }
        createBurstParticles(inv.game, particles, px, py, 25, '#9900ff');
        break;
      }
      case 'slow': {
        // Slime Ball - apply freeze effect
        for (const enemy of enemies) {
          const dx = (enemy.position.x + 20) - px;
          const dy = (enemy.position.y + 20) - py;
          if (Math.sqrt(dx * dx + dy * dy) <= 50) {
            enemy.applyStatusEffect('freeze', cd.duration || 10);
            combatSystem.createDamageNumber('~', enemy.position.x, enemy.position.y, '#00ff00');
          }
        }
        createBurstParticles(inv.game, particles, px, py, 15, '#00ff00');
        break;
      }
      case 'poison': {
        // Poison Flask - apply poison
        for (const enemy of enemies) {
          const dx = (enemy.position.x + 20) - px;
          const dy = (enemy.position.y + 20) - py;
          if (Math.sqrt(dx * dx + dy * dy) <= 55) {
            enemy.applyStatusEffect('poison', 8);
            combatSystem.createDamageNumber('☠', enemy.position.x, enemy.position.y, '#44ff44');
          }
        }
        createBurstParticles(inv.game, particles, px, py, 18, '#44ff44');
        break;
      }
      case 'venomcloud': {
        // Venom Vial - damage + poison + slow
        for (const enemy of enemies) {
          const dx = (enemy.position.x + 20) - px;
          const dy = (enemy.position.y + 20) - py;
          if (Math.sqrt(dx * dx + dy * dy) <= 60) {
            enemy.takeDamage(3);
            enemy.applyStatusEffect('poison', 8);
            enemy.applyStatusEffect('freeze', 5);
            combatSystem.createDamageNumber(3, enemy.position.x, enemy.position.y, '#00ff44');
          }
        }
        createBurstParticles(inv.game, particles, px, py, 22, '#00ff44');
        break;
      }
      case 'jolt': {
        // Jolt Jar — impact AoE at the throw target (set when the jar was thrown)
        const ix = windup.targetX != null ? windup.targetX : px;
        const iy = windup.targetY != null ? windup.targetY : py;
        const radius = cd.radius || 80;
        const damage = cd.damage || 4;
        for (const enemy of enemies) {
          const ex = enemy.position.x + 20;
          const ey = enemy.position.y + 20;
          const dx = ex - ix;
          const dy = ey - iy;
          if (Math.sqrt(dx * dx + dy * dy) <= radius) {
            enemy.takeDamage(damage);
            combatSystem.createDamageNumber(damage, enemy.position.x, enemy.position.y, '#ffff00');
          }
        }
        // Spark burst at impact + four ring offsets so the AoE reads "large"
        createSparkBurst(inv.game, particles, ix, iy);
        const ring = radius * 0.55;
        createSparkBurst(inv.game, particles, ix + ring, iy);
        createSparkBurst(inv.game, particles, ix - ring, iy);
        createSparkBurst(inv.game, particles, ix, iy + ring);
        createSparkBurst(inv.game, particles, ix, iy - ring);
        break;
      }
      case 'firecracker': {
        const burnRadius = windup.consumable?.data?.radius || 64;
        for (const enemy of enemies) {
          const dx = (enemy.position.x + 20) - px, dy = (enemy.position.y + 20) - py;
          if (Math.sqrt(dx * dx + dy * dy) <= burnRadius) {
            // Two stacks so the blast reads as a real hit, not a graze —
            // applyStatusEffect increments enemy.statusEffects.burn.stacks
            // by 1 per call (capped at MAX_STACKUP=3 in EnemyStatusEffects.js).
            enemy.applyStatusEffect('burn', 3.0);
            enemy.applyStatusEffect('burn', 3.0);
          }
        }
        createSparkBurst(inv.game, particles, px, py);
        break;
      }
      case 'throwSteam': {
        // Steam Vial — only push when the caller provided a valid array.
        // Rebinding the local parameter has no effect on the caller's reference.
        if (steamClouds) {
          steamClouds.push({
            x: px,
            y: py,
            radius: cd.radius || 20 * 4, // GRID.CELL_SIZE * 4
            timer: cd.duration || 8.0
          });
        }
        createBurstParticles(inv.game, particles, px, py, 25, '#aaaaaa');
        break;
      }
      default: {
        // Self/AoE-around-player consumables (heal, buffs, shields, etc) —
        // ConsumableTriggerSystem owns the per-effect mutation.
        inv.game.consumableTriggerSystem.applyEffect(windup, player, enemies, steamClouds);

        // Landing burst — same feedback the old instant-trigger path showed.
        const burstChars = ['+', '*', 'o', '.'];
        for (let i = 0; i < 10; i++) {
          particles.push({
            x: px + Math.random() * 40 - 20,
            y: py + Math.random() * 40 - 20,
            vx: Math.random() * 60 - 30,
            vy: Math.random() * 60 - 30,
            life: 0.5,
            maxLife: 0.5,
            char: burstChars[Math.floor(Math.random() * burstChars.length)],
            color: windup.consumable.color || '#ffaa00',
            hutPlane: !!inv.game.activeFloor
          });
        }

        // Mark effect as active for the full duration (drives slow bar blink)
        if (cd.duration > 0) {
          inv.activeEffectTimers[windup.slotIndex] = cd.duration;
        }
        break;
      }
    }

    // Blink HUD slot
    inv.consumableBlinkSlot = windup.slotIndex;
    inv.consumableBlinkTimer = 0.4;
    inv.consumableBlinkPhase = 0.1;
    inv.consumableBlinkShowBlock = true;

    // Handle consumption based on one-shot vs reusable
    if (!windup.isOneShot) {
      inv.consumableCooldowns[windup.slotIndex] = cd.cooldown || 10;
    }
  }
}
