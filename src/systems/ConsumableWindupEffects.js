/**
 * ConsumableWindupEffects.js
 *
 * Resolves a consumable's windup once its throw lands — the second half of
 * the throw ConsumableTriggerSystem starts. Every consumable use arcs before
 * it resolves; InventorySystem owns the in-flight windup list, tick() here
 * advances it, and each expired entry is turned into damage, status
 * effects, steam clouds and particles.
 *
 * Extracted from InventorySystem — which still owns the windup list, the
 * cooldown/blink/active-effect timers this writes back to, and the sole call
 * site — to keep that file under its architecture budget. Same arrangement
 * as EquipmentEffectsSystem: the InventorySystem instance is passed in as
 * `inv` rather than duplicated state living here.
 *
 * Offensive effects (explode/curse/slow/poison/jolt/waterBalloon/
 * liquidSplash/firecracker/throwSteam) resolve in the switch below. Everything else — heals, buffs,
 * shields, anything that lands on the player — falls through to
 * ConsumableTriggerSystem.applyEffect, which owns those mutations.
 */

import { createBurstParticles, createSparkBurst, createExplosionAftermath } from './WorldEffectsSystem.js';
import { isInteriorActive } from './PlaneSystem.js';
import { detonateBomb } from './ExplosionEffects.js';
import { clearStatusEffect } from './StatusEffects.js';
import { splashLiquid } from './LiquidSplash.js';
import { enemyInRadius } from './enemyHitTest.js';

export class ConsumableWindupEffects {
  // Ticks the in-flight windup list (owned by InventorySystem) and resolves
  // each throw as it lands. Moved here from InventorySystem
  // (updateConsumableWindups) with the auto-trigger scan, for its budget.
  tick(inv, deltaTime, player, combatSystem, steamClouds, particles) {
    // inv.game — a bare `game` here (2026-08-24 layer-guard refactor) threw
    // ReferenceError on every EXPLORE frame, halting the loop on room entry.
    const enemies = inv.game._activeEnemies();

    for (let i = inv.consumableWindups.length - 1; i >= 0; i--) {
      const windup = inv.consumableWindups[i];
      windup.timer -= deltaTime;

      // Targeted throw arc (Jolt Jar, Liquid Splash): interpolate from the
      // player to the locked target, with a small parabolic lift so it reads
      // as a throw.
      if (windup.targetX != null) {
        const t = Math.min(1, Math.max(0, 1 - windup.timer / windup.maxTimer));
        windup.x = windup.startX + (windup.targetX - windup.startX) * t;
        windup.y = windup.startY + (windup.targetY - windup.startY) * t - Math.sin(t * Math.PI) * 22;
      }

      // Windup complete — trigger effect
      if (windup.timer <= 0) {
        this.execute(inv, windup, player, enemies, combatSystem, steamClouds, particles);
        inv.consumableWindups.splice(i, 1);
      }
    }
  }

  execute(inv, windup, player, enemies, combatSystem, steamClouds, particles) {
    const cd = windup.consumable.data;
    const px = windup.x;
    const py = windup.y;

    // Execute effect based on type
    switch (windup.effectType) {
      case 'explode': {
        // Bomb explosion. A bomb (or an Explosive Bow arrow — the same
        // detonateBomb) is what opens a Bombable Rock (Cavern entrance).
        detonateBomb(inv.game, px, py, {
          damage: cd.damage, radius: cd.radius * 2, enemies, particles,
          color: windup.consumable.color
        });
        // The Bomb Trial hands back each Bomb it costs.
        inv.game.dungeonPuzzleSystem.onBombExploded();
        break;
      }
      case 'curse': {
        // Cursed Skull damage
        for (const enemy of enemies) {
          if (enemyInRadius(enemy, px, py, cd.radius, 20)) {
            enemy.takeDamage(cd.damage);
            combatSystem.createDamageNumber(cd.damage, enemy.position.x, enemy.position.y, '#ffffff');
          }
        }
        createBurstParticles(inv.game, particles, px, py, 25, '#9900ff');
        break;
      }
      case 'slow': {
        // Slime Ball - a slow: held at freeze pip 1, never escalates to Frozen
        for (const enemy of enemies) {
          if (enemyInRadius(enemy, px, py, 50, 20)) {
            enemy.applyStatusEffect('freeze', cd.duration || 10, 1);
            combatSystem.createDamageNumber('~', enemy.position.x, enemy.position.y, '#00ff00');
          }
        }
        createBurstParticles(inv.game, particles, px, py, 15, '#00ff00');
        break;
      }
      case 'poison': {
        // Poison Flask - apply poison
        for (const enemy of enemies) {
          if (enemyInRadius(enemy, px, py, 55, 20)) {
            if (enemy.shouldApplyStatusEffect('poison')) enemy.applyStatusEffect('poison', 8);
            combatSystem.createDamageNumber('☠', enemy.position.x, enemy.position.y, '#44ff44');
          }
        }
        createBurstParticles(inv.game, particles, px, py, 18, '#44ff44');
        break;
      }
      case 'jolt': {
        // Jolt Jar — impact AoE at the throw target (set when the jar was thrown)
        const ix = windup.targetX != null ? windup.targetX : px;
        const iy = windup.targetY != null ? windup.targetY : py;
        const radius = cd.radius || 80;
        const damage = cd.damage || 4;
        for (const enemy of enemies) {
          if (enemyInRadius(enemy, ix, iy, radius, 20)) {
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
      case 'waterBalloon': {
        // Water Balloon: the Bomb's burst, but water — every enemy in it is
        // soaked (burn put out, as water does), and slimes take slimeDamage.
        const radius = cd.radius * 2;
        for (const enemy of enemies) {
          if (!enemyInRadius(enemy, px, py, radius, 20)) continue;
          if (enemy.shouldApplyStatusEffect('wet')) {
            enemy.applyStatusEffect('wet', 6.0, 1); // wet pip 1; deep water fills the rest
            if (enemy.statusEffects.burn?.active) clearStatusEffect(enemy, 'burn');
          }
          if (enemy.data?.wetDot && enemy.takeDamage(cd.slimeDamage) !== false) {
            combatSystem.createDamageNumber(cd.slimeDamage, enemy.position.x, enemy.position.y, '#4488ff');
          }
        }
        createBurstParticles(inv.game, particles, px, py, 25, windup.consumable.color);
        break;
      }
      case 'liquidSplash':
        // A thrown liquid Bottle lands as a plus of its liquid (LiquidSplash.js).
        splashLiquid(inv.game, windup.consumable, px, py);
        break;
      case 'firecracker': {
        const burnRadius = windup.consumable?.data?.radius || 64;
        for (const enemy of enemies) {
          if (enemyInRadius(enemy, px, py, burnRadius, 20)) {
            // Two stacks so the blast reads as a real hit, not a graze —
            // applyStatusEffect increments enemy.statusEffects.burn.stacks
            // by 1 per call (capped at MAX_PIPS=3 in StatusEffects.js).
            enemy.applyStatusEffect('burn', 3.0);
            enemy.applyStatusEffect('burn', 3.0);
          }
        }
        createSparkBurst(inv.game, particles, px, py);
        createExplosionAftermath(inv.game, px, py, { shake: 0, smoke: 8, spread: burnRadius * 0.4 });
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
            hutPlane: isInteriorActive(inv.game)
          });
        }

        // Mark effect as active for the full duration (drives slow bar blink)
        if (cd.duration > 0 && windup.slotIndex != null) {
          inv.activeEffectTimers[windup.slotIndex] = cd.duration;
        }
        break;
      }
    }

    // A Bottle drunk straight from Bottles has no slot (slotIndex null): no
    // slot to blink, and its cooldown rides on the Item (bottleCooldown,
    // set when it was thrown — BottlesSystem.trigger).
    if (windup.slotIndex == null) return;

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
