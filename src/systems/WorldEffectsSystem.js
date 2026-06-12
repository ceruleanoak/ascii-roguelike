import { GRID } from '../game/GameConfig.js';
import { GooBlob } from '../entities/GooBlob.js';
import { createDebris } from '../entities/Debris.js';

const MAX_GOO_BLOBS = 20;

// Shared transient world-effect ticker — runs in REST and EXPLORE alike.
// Owns the per-frame lifecycle of: ember stack decay + ember contact ignition,
// particles, timed puddles, enemy shockwave rings, goo blobs (incl. slime
// trail stamping + contact goo), and debris physics. The effect arrays
// themselves (game.particles, game.puddles, game.gooBlobs, game.debris,
// game.enemyShockwaves) stay on game — renderers and spawn sites read/write
// them directly, same documented compromise as trap/companion state.
export class WorldEffectsSystem {
  constructor(game) {
    this.game = game;
  }

  update(deltaTime) {
    const game = this.game;

    // Decay ember stacks and cooldowns each frame
    if (game.player) {
      if (game.player.emberStackCooldown > 0) {
        game.player.emberStackCooldown -= deltaTime;
      }
      if (game.player.emberStackTimer > 0) {
        game.player.emberStackTimer -= deltaTime;
        if (game.player.emberStackTimer <= 0) {
          game.player.emberStacks = 0;
          game.player.emberStackTimer = 0;
        }
      }
    }
    if (game.currentRoom && game.currentRoom.enemies) {
      for (const enemy of game.currentRoom.enemies) {
        if ((enemy.emberStackCooldown || 0) > 0) {
          enemy.emberStackCooldown -= deltaTime;
        }
        if ((enemy.emberStacks || 0) > 0) {
          enemy.emberStackTimer -= deltaTime;
          if (enemy.emberStackTimer <= 0) {
            enemy.emberStacks = 0;
            enemy.emberStackTimer = 0;
          }
        }
      }
    }

    // Update particles (dodge trails, explosions, embers, etc.)
    const emberHitEntities = new Set(); // cap to one ember contact per entity per frame
    for (let i = game.particles.length - 1; i >= 0; i--) {
      const particle = game.particles[i];

      if (particle.update) {
        particle.update(deltaTime);
        if (!particle.alive) {
          game.physicsSystem.removeEntity(particle);
          game.particles.splice(i, 1);
        }
      } else {
        // Simple particle objects
        particle.life -= deltaTime;
        if (particle.gravity) particle.vy += particle.gravity * deltaTime;
        particle.x += particle.vx * deltaTime;
        particle.y += particle.vy * deltaTime;

        // Embers accumulate burn stacks — contact must be "successive" within a time window.
        // Grass/objects ignite instantly (handled via obj.ignite). Entities require 3 hits.
        // Immune enemies (fire-type etc.) are skipped entirely.
        if (particle.isEmber && game.player) {
          const alpha = Math.max(0, particle.life / particle.maxLife);

          if (alpha > 0.5) {
            const EMBER_RADIUS = GRID.CELL_SIZE;
            const EMBER_STACK_WINDOW = 2.0; // seconds before stack resets
            const EMBER_THRESHOLD = 5;      // hits needed to ignite

            const EMBER_STACK_COOLDOWN = 0.5; // min seconds between stack gains

            // Player — skipped if fire immune or on cooldown; burnResist does not block ember stacks
            if (!emberHitEntities.has(game.player) && !game.player.fireImmune &&
                game.player.emberStackCooldown <= 0) {
              const pdx = game.player.position.x + GRID.CELL_SIZE / 2 - particle.x;
              const pdy = game.player.position.y + GRID.CELL_SIZE / 2 - particle.y;
              if (Math.sqrt(pdx * pdx + pdy * pdy) < EMBER_RADIUS) {
                emberHitEntities.add(game.player);
                game.player.emberStacks++;
                game.player.emberStackTimer = EMBER_STACK_WINDOW;
                game.player.emberStackCooldown = EMBER_STACK_COOLDOWN;
                if (game.player.emberStacks >= EMBER_THRESHOLD) {
                  game.player.applyBurn(2.0);
                  game.player.emberStacks = 0;
                  game.player.emberStackTimer = 0;
                }
              }
            }

            // Enemies — immune enemies silently skip; all others need 3 stacks with cooldown
            if (game.currentRoom && game.currentRoom.enemies) {
              for (const enemy of game.currentRoom.enemies) {
                if (emberHitEntities.has(enemy)) continue;
                if (!enemy.shouldApplyStatusEffect('burn')) continue;
                if ((enemy.emberStackCooldown || 0) > 0) continue;
                const edx = enemy.position.x + GRID.CELL_SIZE / 2 - particle.x;
                const edy = enemy.position.y + GRID.CELL_SIZE / 2 - particle.y;
                if (Math.sqrt(edx * edx + edy * edy) < EMBER_RADIUS) {
                  emberHitEntities.add(enemy);
                  enemy.emberStacks = (enemy.emberStacks || 0) + 1;
                  enemy.emberStackTimer = EMBER_STACK_WINDOW;
                  enemy.emberStackCooldown = EMBER_STACK_COOLDOWN;
                  if (enemy.emberStacks >= EMBER_THRESHOLD) {
                    enemy.applyStatusEffect('burn', 2.0);
                    enemy.emberStacks = 0;
                    enemy.emberStackTimer = 0;
                  }
                }
              }
            }
          }
        }

        if (particle.life <= 0) {
          game.particles.splice(i, 1);
        }
      }
    }

    // Update puddles — age timed puddles and remove expired ones (persistent puddles tick no-op)
    for (let i = game.puddles.length - 1; i >= 0; i--) {
      const p = game.puddles[i];
      p.update?.(deltaTime);
      if (p.expired) game.puddles.splice(i, 1);
    }

    // Update enemy shockwaves — invisible expanding rings (Cyan-boss pattern).
    // Visual feedback is bg objects shaking as the ring sweeps; damage/knockback applied once per entity.
    if (game.enemyShockwaves.length && game.currentRoom) {
      const C = GRID.CELL_SIZE;
      for (let i = game.enemyShockwaves.length - 1; i >= 0; i--) {
        const sw = game.enemyShockwaves[i];
        const prevRadius = sw.radius;
        sw.radius += sw.speed * deltaTime;

        // Shake background objects newly swept by the ring this frame
        const bgObjs = game.currentRoom.backgroundObjects || [];
        for (const obj of bgObjs) {
          if (obj.destroyed) continue;
          const cx = obj.position.x + C / 2;
          const cy = obj.position.y + C / 2;
          const d = Math.hypot(cx - sw.x, cy - sw.y);
          if (d <= prevRadius || d > sw.radius) continue;
          obj._playAnimation?.('shake');
        }

        // Apply damage / knockback to entities inside the current ring radius (once each via hitEntities Set)
        const apply = (entity) => {
          if (!entity || entity.hp <= 0) return;
          if (sw.hitEntities.has(entity)) return;
          if ((entity.plane ?? 0) !== sw.plane) return;
          const ex = entity.position.x + C / 2;
          const ey = entity.position.y + C / 2;
          const d = Math.hypot(ex - sw.x, ey - sw.y);
          if (d > sw.radius) return;
          sw.hitEntities.add(entity);
          const isSlime = entity.data?.affinities?.includes('goo');
          game.physicsSystem.applyKnockback(entity, sw.x, sw.y, sw.knockback, 0.12);
          if (!isSlime && sw.damage > 0) {
            entity.takeDamage(sw.damage);
            if (entity === game.player) {
              game.combatSystem.createDamageNumber(sw.damage, entity.position.x, entity.position.y, entity.color);
            } else {
              game.combatSystem.createDamageNumber(sw.damage, entity.position.x, entity.position.y, '#ffffff');
            }
          }
        };
        apply(game.player);
        for (const enemy of game.currentRoom.enemies) apply(enemy);

        if (sw.radius >= sw.maxRadius) game.enemyShockwaves.splice(i, 1);
      }
    }

    // Update goo blobs
    const SLIME_TRAIL_DROP_PX = 10;
    const SLIME_TRAIL_DROP_PX_SQ = SLIME_TRAIL_DROP_PX * SLIME_TRAIL_DROP_PX;
    for (const gooBlob of game.gooBlobs) {
      gooBlob.update(deltaTime);

      // Stamp a slime trail along the blob's path (distance-based — stationary blobs don't spam trails)
      const tdx = gooBlob.position.x - gooBlob.trailLastX;
      const tdy = gooBlob.position.y - gooBlob.trailLastY;
      if (tdx * tdx + tdy * tdy >= SLIME_TRAIL_DROP_PX_SQ) {
        game._dropSlimeTrail(gooBlob.position.x, gooBlob.position.y, gooBlob.plane ?? 0);
        gooBlob.trailLastX = gooBlob.position.x;
        gooBlob.trailLastY = gooBlob.position.y;
      }

      // Check collision with player (only if on the same plane)
      if (game.player && (gooBlob.plane ?? 0) === (game.player.plane ?? 0) && gooBlob.isNearEntity(game.player)) {
        game.player.applyStatusEffect('goo', 5.0); // 5 second goo effect
      }

      // Check collision with enemies (slimes are immune, must share plane).
      // Unified slime state: non-slime enemies also get the goo status (slow) — not freeze.
      if (game.currentRoom && game.currentRoom.enemies) {
        for (const enemy of game.currentRoom.enemies) {
          if (enemy.data?.affinities?.includes('goo')) continue; // goo-affinity enemies are immune to goo
          if ((gooBlob.plane ?? 0) === (enemy.plane ?? 0) && gooBlob.isNearEntity(enemy)) {
            enemy.applyStatusEffect('goo', 5.0);
          }
        }
      }
    }

    // Update debris physics
    if (game.debris.length > 0 && game.player) {
      const majorObjects = [game.player];
      if (game.currentRoom && game.currentRoom.enemies) {
        majorObjects.push(...game.currentRoom.enemies);
      }
      game.physicsSystem.updateDebris(game.debris.filter(d => d), majorObjects.filter(o => o));
    }
  }

  /**
   * Enemy death detritus: gray debris pieces, or GooBlobs for goo-affinity
   * enemies (slimes). If the killing blow carried knockback, the enemy's
   * launch velocity is still on it (knockback status outlives the hit), so
   * the pieces inherit it and spray in the hit direction.
   * hutPlane: pass true from interior death loops (hut/dungeon) so overlays
   * render the pieces; surface deaths tag the enemy's plane instead.
   */
  spawnDeathDetritus(enemy, { hutPlane = false } = {}) {
    const game = this.game;
    const cx = enemy.position.x + GRID.CELL_SIZE / 2;
    const cy = enemy.position.y + GRID.CELL_SIZE / 2;
    // Half the launch velocity — full knockback speed reads as the pieces
    // outrunning the hit.
    const inheritVelocity =
      enemy.isKnockedBack?.() &&
      Number.isFinite(enemy.velocity?.vx) && Number.isFinite(enemy.velocity?.vy)
        ? { vx: enemy.velocity.vx * 0.5, vy: enemy.velocity.vy * 0.5 }
        : null;
    const count = 4 + Math.floor(Math.random() * 3); // 4-6 pieces

    if (enemy.data?.affinities?.includes('goo')) {
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 1.0;
        const speed = 40 + Math.random() * 30;
        const vx = Math.cos(angle) * speed + (inheritVelocity?.vx ?? 0);
        const vy = Math.sin(angle) * speed + (inheritVelocity?.vy ?? 0);
        const blob = new GooBlob(cx, cy, performance.now(), false, vx, vy, 2.0);
        blob.plane = enemy.plane ?? 0;
        blob.hutPlane = hutPlane;
        game.gooBlobs.push(blob);
      }
      while (game.gooBlobs.length > MAX_GOO_BLOBS) game.gooBlobs.shift();
      return;
    }

    const pieces = createDebris(cx, cy, count, '#666666', inheritVelocity);
    for (const piece of pieces) {
      if (hutPlane) piece.hutPlane = true;
      else piece.plane = enemy.plane ?? 0;
      game.debris.push(piece);
      game.physicsSystem.addEntity(piece);
    }
  }
}
