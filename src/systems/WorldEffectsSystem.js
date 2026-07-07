import { GRID } from '../game/GameConfig.js';
import { GooBlob } from '../entities/GooBlob.js';
import { createDebris } from '../entities/Debris.js';
import { createFootstep, createWetDrop, createSteamPuff, createChaff } from '../entities/Particle.js';

const MAX_GOO_BLOBS = 20;
const IDLE_ECHO_DURATION = 0.5; // seconds — must match the radius/alpha envelope in RestRenderer

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

    // Bloom Mantle: a landed hit this frame bursts a pollen smoke screen. Reuses the
    // steam-cloud system (which already blocks enemy sight lines in hasVision), tinted
    // yellow for pollen. Flag is set in Player.takeDamage and consumed here.
    if (game.player?.smokeBurstPending) {
      game.player.smokeBurstPending = false;
      game.steamClouds.push({
        x: game.player.position.x + GRID.CELL_SIZE / 2,
        y: game.player.position.y + GRID.CELL_SIZE / 2,
        radius: GRID.CELL_SIZE * 3,
        timer: 4.0,
        color: '#ffe566',
        hutPlane: !!game.activeFloor
      });
    }

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

    // Update idle echoes (REST "nothing to interact with" feedback ring)
    for (let i = game.idleEchoes.length - 1; i >= 0; i--) {
      game.idleEchoes[i].age += deltaTime;
      if (game.idleEchoes[i].age >= IDLE_ECHO_DURATION) game.idleEchoes.splice(i, 1);
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

        // Shake background objects newly swept by the ring this frame (active layer).
        const bgObjs = game._activeBackgroundObjects() || [];
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
  checkGooBlobHits() {
    const game = this.game;
    if (!game.gooBlobs.length) return;
    const meleeAttacks = game.combatSystem.meleeAttacks;
    for (let bi = game.gooBlobs.length - 1; bi >= 0; bi--) {
      const blob = game.gooBlobs[bi];
      let hit = false;
      for (const attack of meleeAttacks) {
        const atkR = (attack.radius || GRID.CELL_SIZE) + blob.radius;
        const dx = blob.position.x - attack.position.x;
        const dy = blob.position.y - attack.position.y;
        if (dx * dx + dy * dy < atkR * atkR) {
          if (attack.isBlade) hit = true;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          blob.velocity.vx += (dx / dist) * 50;
          blob.velocity.vy += (dy / dist) * 50;
          const speed = Math.sqrt(blob.velocity.vx ** 2 + blob.velocity.vy ** 2);
          if (speed > 150) {
            blob.velocity.vx = (blob.velocity.vx / speed) * 300;
            blob.velocity.vy = (blob.velocity.vy / speed) * 300;
          }
          blob.stationary = false;
          break;
        }
      }
      if (blob.expired) { game.gooBlobs.splice(bi, 1); continue; }
      if (hit && !blob.isInvulnerable()) {
        game.gooBlobs.splice(bi, 1);
        if (Math.random() < 0.05) {
          game.lootSystem.spawnIngredientDrop('g', blob.position.x, blob.position.y, null, null);
        }
      }
    }
  }

  updateEntityTrails(deltaTime) {
    const game = this.game;
    const player = game.player;
    if (!player) return;
    const enemies = game.currentRoom?.enemies ?? [];
    const steamClouds = game.steamClouds;
    const particles = game.particles;

    // Sprint footstep trail: dots while unarmed and moving
    {
      const isSprinting = !player.heldItem && !player.dodgeRoll.active;
      const speed = Math.sqrt(player.velocity.vx ** 2 + player.velocity.vy ** 2);
      if (isSprinting && speed > 30) {
        player.footstepTimer -= deltaTime;
        if (player.footstepTimer <= 0) {
          const f = player.facing;
          const cx = player.position.x, cy = player.position.y;
          const side = player.footstepSide === 0 ? 0.5 : -0.5;
          const ox = -f.y * GRID.CELL_SIZE * 0.3 * side;
          const oy =  f.x * GRID.CELL_SIZE * 0.3 * side;
          particles.push(createFootstep(cx + ox, cy + oy));
          player.footstepSide = 1 - player.footstepSide;
          player.footstepTimer = 0.10;
        }
      } else {
        player.footstepTimer = 0;
      }
    }

    // Wet trail: player
    if (player.isWet()) {
      player.wetDropTimer -= deltaTime;
      if (player.wetDropTimer <= 0) {
        const dropCount = Math.random() < 0.4 ? 2 : 1;
        for (let d = 0; d < dropCount; d++) {
          particles.push(createWetDrop(player.position.x, player.position.y));
        }
        const wet = player.wetDuration;
        player.wetDropTimer = wet > 4 ? 0.10 : wet > 2 ? 0.14 : 0.20;
      }
    } else {
      player.wetDropTimer = 0;
    }

    // Wet trail: enemies
    for (const enemy of enemies) {
      if (enemy.isWet()) {
        enemy.wetDropTimer -= deltaTime;
        if (enemy.wetDropTimer <= 0) {
          const dropCount = Math.random() < 0.4 ? 2 : 1;
          for (let d = 0; d < dropCount; d++) {
            particles.push(createWetDrop(enemy.position.x, enemy.position.y));
          }
          const wet = enemy.statusEffects.wet.duration;
          enemy.wetDropTimer = wet > 4 ? 0.10 : wet > 2 ? 0.14 : 0.20;
        }
      } else {
        enemy.wetDropTimer = 0;
      }
    }

    // Steam trail: player
    {
      let playerInSteam = false;
      const px = player.position.x + GRID.CELL_SIZE / 2;
      const py = player.position.y + GRID.CELL_SIZE / 2;
      for (const cloud of steamClouds) {
        const dx = px - cloud.x, dy = py - cloud.y;
        if (dx * dx + dy * dy <= cloud.radius * cloud.radius) { playerInSteam = true; break; }
      }
      if (playerInSteam) {
        player.steamTrailTimer -= deltaTime;
        if (player.steamTrailTimer <= 0) {
          particles.push(createSteamPuff(player.position.x, player.position.y));
          player.steamTrailTimer = 0.12 + Math.random() * 0.06;
        }
      } else {
        player.steamTrailTimer = 0;
      }
    }

    // Steam trail: enemies
    for (const enemy of enemies) {
      let enemyInSteam = false;
      const ex = enemy.position.x + GRID.CELL_SIZE / 2;
      const ey = enemy.position.y + GRID.CELL_SIZE / 2;
      for (const cloud of steamClouds) {
        const dx = ex - cloud.x, dy = ey - cloud.y;
        if (dx * dx + dy * dy <= cloud.radius * cloud.radius) { enemyInSteam = true; break; }
      }
      if (enemyInSteam) {
        enemy.steamTrailTimer = (enemy.steamTrailTimer || 0) - deltaTime;
        if (enemy.steamTrailTimer <= 0) {
          particles.push(createSteamPuff(enemy.position.x, enemy.position.y));
          enemy.steamTrailTimer = 0.15 + Math.random() * 0.07;
        }
      } else {
        enemy.steamTrailTimer = 0;
      }
    }
  }

  spawnImpactEffects(impactEffects) {
    if (!impactEffects || !impactEffects.length) return;
    const particles = this.game.particles;
    const IMPACT_CHARS = {
      burn:   ['!', '+', '.'],
      stun:   ['+', '*', '.'],
      freeze: ['*', '+', '.'],
      poison: ['+', '.', 'o']
    };
    for (const fx of impactEffects) {
      if (fx.effect === 'chaff') {
        const chaffParticles = createChaff(fx.x + GRID.CELL_SIZE / 2, fx.y + GRID.CELL_SIZE / 2);
        for (const particle of chaffParticles) {
          particles.push({
            x: particle.position.x,
            y: particle.position.y,
            vx: particle.velocity.vx,
            vy: particle.velocity.vy,
            life: particle.lifetime,
            maxLife: particle.maxLifetime,
            char: particle.char,
            color: particle.color,
            isImpact: true
          });
        }
      } else {
        const chars = IMPACT_CHARS[fx.onHit] || ['+', '.'];
        for (let i = 0; i < 5; i++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = 40 + Math.random() * 60;
          const life = 0.2 + Math.random() * 0.3;
          particles.push({
            x: fx.x + GRID.CELL_SIZE / 2,
            y: fx.y + GRID.CELL_SIZE / 2,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life,
            maxLife: life,
            char: chars[Math.floor(Math.random() * chars.length)],
            color: fx.color || '#ffffff',
            isImpact: true
          });
        }
      }
    }
  }

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
