import { Item } from '../entities/Item.js';
import { GooBlob } from '../entities/GooBlob.js';
import { createActivationBurst } from '../entities/Particle.js';
import { GRID } from '../game/GameConfig.js';

export class TrapSystem {
  constructor(game) {
    this.game = game;
  }

  placeTrap() {
    const game = this.game;
    if (!game.player.canUseTrap()) return;

    const trapItem = game.player.heldItem;
    const trapData = trapItem.data;

    // Mark trap as used this room (don't remove from inventory)
    game.player.markTrapUsed();

    // Create placed trap entity at player position
    const placedTrapItem = new Item(
      trapItem.char,
      game.player.position.x,
      game.player.position.y
    );
    placedTrapItem.isPlaced = true;
    placedTrapItem.plane = game.player.plane ?? 0;

    // Add to placed traps list for auto-trigger detection
    game.placedTraps.push({
      item: placedTrapItem,
      tickTimer: trapData.tickInterval || 0,
      activeDuration: trapData.activeDuration != null ? trapData.activeDuration : Infinity,
      affectedEnemies: new Set()
    });

    game.showPickupMessage('trap placed');
    game.updateUI();
  }

  updatePlacedTraps(deltaTime) {
    const game = this.game;
    if (!game.currentRoom) return;
    const enemies = game.currentRoom.enemies;
    game.activeNoiseSource = null; // reset each frame

    for (let i = game.placedTraps.length - 1; i >= 0; i--) {
      const entry = game.placedTraps[i];
      const { item } = entry;
      const trapData = item.data;
      const tx = item.position.x;
      const ty = item.position.y;

      if (trapData.oneShot) {
        // One-shot trap: check if enemy is within trigger radius
        let triggered = false;
        for (const enemy of enemies) {
          const dx = enemy.position.x - tx;
          const dy = enemy.position.y - ty;
          if (Math.sqrt(dx * dx + dy * dy) <= trapData.triggerRadius) {
            triggered = true;
            break;
          }
        }

        if (triggered) {
          // Apply effect to all enemies in effectRadius
          for (const enemy of enemies) {
            const dx = enemy.position.x - tx;
            const dy = enemy.position.y - ty;
            if (Math.sqrt(dx * dx + dy * dy) <= trapData.effectRadius) {
              if (trapData.effect === 'burn' && game.currentRoom.backgroundObjects) {
                // Fire Trap: also ignite flammable background objects
                for (const obj of game.currentRoom.backgroundObjects) {
                  if (obj.destroyed || !obj.isFlammable) continue;
                  const odx = obj.position.x - tx;
                  const ody = obj.position.y - ty;
                  if (Math.sqrt(odx * odx + ody * ody) <= trapData.effectRadius) {
                    if (obj.isFlammable()) obj.ignite(5.0);
                  }
                }
              }
              enemy.applyStatusEffect(trapData.effect, trapData.effectDuration);
            }
          }

          // Burst particle effect at trap location
          const burstParticles = createActivationBurst(tx, ty, trapData.color || '#ffffff');
          game.particles.push(...burstParticles);

          // Remove trap from ground
          game.placedTraps.splice(i, 1);
        }
      } else {
        // Persistent placeable
        const effect = trapData.effect;

        if (effect === 'noise') {
          // Noise-maker: redirect enemies toward self; destroyed on enemy contact
          game.activeNoiseSource = { x: tx, y: ty, radius: trapData.effectRadius };
          // Destroy on enemy overlap (< 16 px)
          let destroyed = false;
          for (const enemy of enemies) {
            const dx = enemy.position.x - tx;
            const dy = enemy.position.y - ty;
            if (Math.sqrt(dx * dx + dy * dy) < 16) {
              destroyed = true;
              break;
            }
          }
          if (destroyed) {
            game.placedTraps.splice(i, 1);
          }

        } else if (effect === 'sleep') {
          // Music Box: apply sleep to enemies that enter radius while active
          entry.activeDuration -= deltaTime;
          if (entry.activeDuration > 0) {
            for (const enemy of enemies) {
              const dx = enemy.position.x - tx;
              const dy = enemy.position.y - ty;
              if (Math.sqrt(dx * dx + dy * dy) <= trapData.effectRadius) {
                if (!entry.affectedEnemies.has(enemy)) {
                  entry.affectedEnemies.add(enemy);
                  enemy.applyStatusEffect('sleep', trapData.effectDuration);
                }
              } else {
                // Enemy left radius — allow re-triggering if they re-enter
                entry.affectedEnemies.delete(enemy);
              }
            }
          }

        } else if (effect === 'stun') {
          // Tesla Coil: deal damage + stun every tickInterval seconds
          entry.tickTimer -= deltaTime;
          if (entry.tickTimer <= 0) {
            entry.tickTimer = trapData.tickInterval;
            for (const enemy of enemies) {
              const dx = enemy.position.x - tx;
              const dy = enemy.position.y - ty;
              if (Math.sqrt(dx * dx + dy * dy) <= trapData.effectRadius) {
                enemy.takeDamage(trapData.damage || 2);
                enemy.applyStatusEffect('stun', trapData.stunDuration || 0.8);
                game.combatSystem.createDamageNumber(trapData.damage || 2, enemy.position.x, enemy.position.y, '#00ffff');
                // Lightning particle
                game.particles.push({
                  x: tx,
                  y: ty,
                  vx: (Math.random() - 0.5) * 60,
                  vy: (Math.random() - 0.5) * 60,
                  life: 0.3,
                  maxLife: 0.3,
                  char: '!',
                  color: '#00ffff',
                  isImpact: true
                });
              }
            }
          }

        } else if (effect === 'goo') {
          // Goo Dispenser: generate spreading goo blobs
          if (entry.gooGenerationTimer === undefined) {
            entry.gooGenerationTimer = 1.0;
          }

          entry.gooGenerationTimer -= deltaTime;

          if (entry.gooGenerationTimer <= 0) {
            entry.gooGenerationTimer = 1.0;

            const gooBlob = new GooBlob(
              tx + GRID.CELL_SIZE / 2,
              ty + GRID.CELL_SIZE / 2,
              performance.now()
            );
            gooBlob.plane = item.plane ?? 0;
            game.gooBlobs.push(gooBlob);

            const MAX_GOO_BLOBS = 15;
            if (game.gooBlobs.length > MAX_GOO_BLOBS) {
              game.gooBlobs.shift();
            }
          }
        }
      }
    }
  }

  /** Handle shift+drop in EXPLORE: persistent traps activate, weapons drop normally. */
  dropOrPlaceTrap() {
    const game = this.game;
    const droppedItem = game.player.dropItem();
    if (!droppedItem) return;

    const trapData = droppedItem.data || droppedItem;
    if (trapData.type === 'TRAP' && !trapData.oneShot) {
      // Persistent placeables (Music Box, Noise-maker, Tesla Coil, Goo Dispenser)
      const trapItem = new Item(droppedItem.char, game.player.position.x, game.player.position.y);
      trapItem.isPlaced = true;
      game.placedTraps.push({
        item: trapItem,
        tickTimer: trapData.tickInterval || 0,
        activeDuration: trapData.activeDuration != null ? trapData.activeDuration : Infinity,
        affectedEnemies: new Set()
      });
      game.showPickupMessage('trap placed');
    } else {
      // Drop held weapon normally
      const item = new Item(droppedItem.char, game.player.position.x, game.player.position.y);
      game.items.push(item);
      game.physicsSystem.addEntity(item);
    }
  }
}
