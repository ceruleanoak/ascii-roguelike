import { GRID } from '../game/GameConfig.js';
import { GooBlob } from '../entities/GooBlob.js';
import { createDebris } from '../entities/Debris.js';
import { createFootstep, createWetDrop, createSteamPuff, createChaff } from '../entities/Particle.js';
import { inSamePlane } from './PlaneSystem.js';

const MAX_GOO_BLOBS = 20;
const IDLE_ECHO_DURATION = 0.5; // seconds — must match the radius/alpha envelope in RestRenderer

// A melee swing bats a settled goo blob along. GOO_BLOB_MAX_SPEED is a ceiling,
// not a target: a blob already travelling faster than it (a death blob still
// carrying the killing blow's momentum) is slowed to it, never sped up to it.
const GOO_BLOB_PUSH_FORCE = 50;   // px/s added per swing
const GOO_BLOB_MAX_SPEED = 300;   // px/s — 480px room, so ~1.6s corner to corner

// Rapidly interpolate `entity._concealmentAlpha` toward 1 (visible) or 0
// (hidden). Smooths the transition when a player or enemy steps in or out
// of grass cover so visibility doesn't pop. ~0.125s for a full transition.
// Pure per-entity timer, not tied to a game instance — exported standalone
// so renderers can call it without routing through the system instance.
export function stepConcealmentAlpha(entity, targetVisible) {
  const now = performance.now() / 1000;
  const FADE_SPEED = 8;
  if (entity._concealmentAlpha === undefined) {
    entity._concealmentAlpha = targetVisible ? 1 : 0;
    entity._concealmentLastT = now;
    return entity._concealmentAlpha;
  }
  const dt = Math.max(0, Math.min(0.1, now - entity._concealmentLastT));
  entity._concealmentLastT = now;
  const target = targetVisible ? 1 : 0;
  const diff = target - entity._concealmentAlpha;
  const maxStep = FADE_SPEED * dt;
  if (Math.abs(diff) <= maxStep) entity._concealmentAlpha = target;
  else entity._concealmentAlpha += Math.sign(diff) * maxStep;
  return entity._concealmentAlpha;
}

// Elemental robe aura particle factory — one ambient/blast particle for the
// given aura type (frost/flame/shock/nature/blood/shadow), centered on
// (cx, cy) with a small random offset. Pure per-call factory, not tied to a
// game instance — exported standalone so InventorySystem's robe-aura tick
// can call it without routing through the system instance, same convention
// as stepConcealmentAlpha above.
export function makeAuraParticle(cx, cy, type) {
  const CELL = 16;
  const ox = (Math.random() - 0.5) * CELL * 1.6;
  const oy = (Math.random() - 0.5) * CELL * 1.6;

  if (type === 'frost') {
    const chars = ['*', '+', '.', '*'];
    const colors = ['#aaddff', '#88ccff', '#cceeff', '#ffffff'];
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.4;
    const speed = 10 + Math.random() * 22;
    return {
      x: cx + ox, y: cy + oy,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      life: 0.55 + Math.random() * 0.35, maxLife: 0.9,
      char: chars[Math.floor(Math.random() * chars.length)],
      color: colors[Math.floor(Math.random() * colors.length)],
      decayRate: 0.87
    };
  }
  if (type === 'flame') {
    const chars = ['!', '.', "'", '!'];
    const colors = ['#ff4400', '#ff8800', '#ffcc00', '#ff6600'];
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.9;
    const speed = 20 + Math.random() * 35;
    return {
      x: cx + ox * 0.75, y: cy + oy * 0.5,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      life: 0.3 + Math.random() * 0.25, maxLife: 0.55,
      char: chars[Math.floor(Math.random() * chars.length)],
      color: colors[Math.floor(Math.random() * colors.length)],
      decayRate: 0.90
    };
  }
  if (type === 'shock') {
    const chars = ['|', '-', '+', '.'];
    const colors = ['#00ffff', '#88ffff', '#aaffff', '#ffffff'];
    const angle = Math.random() * Math.PI * 2;
    const speed = 35 + Math.random() * 55;
    return {
      x: cx + ox, y: cy + oy,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      life: 0.15 + Math.random() * 0.2, maxLife: 0.35,
      char: chars[Math.floor(Math.random() * chars.length)],
      color: colors[Math.floor(Math.random() * colors.length)],
      decayRate: 0.78
    };
  }
  if (type === 'nature') {
    const chars = ["'", '.', ',', "'"];
    const colors = ['#44cc44', '#33aa33', '#88dd44', '#66bb44'];
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.6;
    const speed = 8 + Math.random() * 18;
    return {
      x: cx + ox, y: cy + oy,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      life: 0.7 + Math.random() * 0.5, maxLife: 1.2,
      char: chars[Math.floor(Math.random() * chars.length)],
      color: colors[Math.floor(Math.random() * colors.length)],
      decayRate: 0.91
    };
  }
  if (type === 'blood') {
    const chars = ['.', "'", '.', ','];
    const colors = ['#cc2222', '#aa1111', '#dd3333', '#881111'];
    const angle = Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.8; // mostly downward
    const speed = 12 + Math.random() * 22;
    return {
      x: cx + ox * 0.8, y: cy + oy * 0.5,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      life: 0.45 + Math.random() * 0.35, maxLife: 0.8,
      char: chars[Math.floor(Math.random() * chars.length)],
      color: colors[Math.floor(Math.random() * colors.length)],
      decayRate: 0.88
    };
  }
  if (type === 'shadow') {
    const chars = ['.', '·', '.', '-'];
    const colors = ['#444466', '#333355', '#555577', '#222244'];
    const angle = Math.random() * Math.PI * 2;
    const speed = 5 + Math.random() * 15;
    return {
      x: cx + ox, y: cy + oy,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      life: 0.4 + Math.random() * 0.4, maxLife: 0.8,
      char: chars[Math.floor(Math.random() * chars.length)],
      color: colors[Math.floor(Math.random() * colors.length)],
      decayRate: 0.92
    };
  }
  return null;
}

// Generic scatter-burst helpers (plain-object particles, hutPlane-tagged so
// they render on the correct interior/exterior plane) — moved out of
// InventorySystem.js, which used them only for consumable windup effects
// (explosions, spark bursts) and the oil-destroyed-by-water splash, per
// main.js's "transient world effects → WorldEffectsSystem.js" placement rule.
// Distinct from Particle.js's own createExplosion(), which returns Particle
// class instances and doesn't tag hutPlane — not a drop-in replacement here.
export function createBurstParticles(game, particles, x, y, count, color) {
  const chars = ['*', '+', 'x', '.', 'o'];
  const hutPlane = !!game.activeFloor;
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 50 + Math.random() * 50;
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.5 + Math.random() * 0.5,
      maxLife: 1.0,
      char: chars[Math.floor(Math.random() * chars.length)],
      color,
      hutPlane
    });
  }
}

export function createSparkBurst(game, particles, x, y) {
  const hutPlane = !!game.activeFloor;
  for (let i = 0; i < 12; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 80 + Math.random() * 120;
    particles.push({
      x: x + (Math.random() - 0.5) * 8,
      y: y + (Math.random() - 0.5) * 8,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.2 + Math.random() * 0.2,
      maxLife: 0.4,
      char: Math.random() < 0.5 ? '*' : '.',
      color: Math.random() < 0.6 ? '#ff8800' : '#ffff00',
      hutPlane
    });
  }
}

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

    // Caldera hot spring: occasional ambient steam puff off a random pool tile.
    // Minimal/rare by design — a decorative tell, not a hazard indicator.
    game._hotSpringSteamTimer = (game._hotSpringSteamTimer ?? 3) - deltaTime;
    if (game._hotSpringSteamTimer <= 0) {
      game._hotSpringSteamTimer = 3 + Math.random() * 4;
      const hotWaterTiles = game._activeBackgroundObjects().filter(o => o.typeId === 'hot_water');
      if (hotWaterTiles.length > 0) {
        const tile = hotWaterTiles[Math.floor(Math.random() * hotWaterTiles.length)];
        game.particles.push(createSteamPuff(
          tile.position.x + GRID.CELL_SIZE / 2,
          tile.position.y + GRID.CELL_SIZE / 2
        ));
      }
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
    if (game._activeEnemies().length) {
      for (const enemy of game._activeEnemies()) {
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
            if (game._activeEnemies().length) {
              for (const enemy of game._activeEnemies()) {
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
          // Optional ignite (e.g. Bomb's RipenMechanic detonation) — opt-in via
          // sw.burnDuration so unrelated shockwaves (Giant Slime's leap ring) stay unaffected.
          if (!isSlime && sw.burnDuration > 0) {
            if (entity === game.player) {
              entity.applyBurn(sw.burnDuration);
            } else {
              entity.applyStatusEffect('burn', sw.burnDuration);
            }
          }
        };
        apply(game.player);
        for (const enemy of game._activeEnemies()) apply(enemy);

        if (sw.radius >= sw.maxRadius) game.enemyShockwaves.splice(i, 1);
      }
    }

    // Sniper beam fade — instant-hit line render that ages out over its life window.
    if (game.sniperBeams && game.sniperBeams.length) {
      const now = Date.now();
      for (let i = game.sniperBeams.length - 1; i >= 0; i--) {
        if (now - game.sniperBeams[i].createdAt >= game.sniperBeams[i].life) {
          game.sniperBeams.splice(i, 1);
        }
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
      if (game._activeEnemies().length) {
        for (const enemy of game._activeEnemies()) {
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
      if (game._activeEnemies().length) {
        majorObjects.push(...game._activeEnemies());
      }
      game.physicsSystem.updateDebris(game.debris.filter(d => d), majorObjects.filter(o => o));
    }
  }

  /**
   * Per-frame background object animation tick, plus tall-grass bending: grass
   * bends toward whichever entity (player, or nearest enemy if the player isn't
   * close) is passing through it, springs back after a beat, and imprints
   * permanently on a dodge roll.
   *
   * Grass is plane-0-only (see PlaneSystem) — the bend/imprint sources are each
   * gated on inSamePlane(entity, obj) so a Sinkhole dive (player on plane 1,
   * same room/grid as the surface grass) can't bend or imprint grass it isn't
   * actually standing in. Same layer separation as tunnel/underground.
   */
  updateBackgroundObjects(deltaTime) {
    const game = this.game;
    const activeBgObjects = game._activeBackgroundObjects();
    for (const obj of activeBgObjects) {
      if (obj.update) {
        obj.update(deltaTime);
      }

      // Grass bending: animate tall grass as player passes through; imprint on dodge roll.
      // Identity check uses cuttable+cutState so bent chars (/ \) don't break the gate.
      if (!(obj.data && obj.data.cuttable && obj.data.cutState === ',')) continue;

      // Lazy-init grass state
      if (obj.grassImprinted === undefined) {
        obj.grassImprinted = false;
        obj.grassResetTimer = 0;
        if (!obj.grassRenderOffset) obj.grassRenderOffset = { x: 0, y: 0 };
      }

      // Imprinted grass stays bent — dodge-roll footprint, never auto-resets
      if (obj.grassImprinted) continue; // char and offset remain as stamped

      // Player proximity (highest priority — controls imprint)
      const pdx = obj.position.x - game.player.position.x;
      const pdy = obj.position.y - game.player.position.y;
      const playerInRange = inSamePlane(game.player, obj) &&
        Math.sqrt(pdx * pdx + pdy * pdy) < GRID.CELL_SIZE * 0.7;

      // Find closest enemy in range if player isn't bending this blade
      let bendDx = pdx;
      let entityInRange = playerInRange;
      if (!playerInRange) {
        let closestDist = Infinity;
        for (const enemy of game._activeEnemies()) {
          if (!inSamePlane(enemy, obj)) continue;
          const edx = obj.position.x - enemy.position.x;
          const edy = obj.position.y - enemy.position.y;
          const eDist = Math.sqrt(edx * edx + edy * edy);
          if (eDist < GRID.CELL_SIZE * 0.7 && eDist < closestDist) {
            closestDist = eDist;
            bendDx = edx;
            entityInRange = true;
          }
        }
      }

      if (entityInRange) {
        // Determine bend direction based on whichever entity is bending this blade
        let newChar, newOffset;
        if (bendDx > GRID.CELL_SIZE * 0.25) {
          newChar = '/';
          newOffset = GRID.CELL_SIZE * 0.25;
        } else if (bendDx < -GRID.CELL_SIZE * 0.25) {
          newChar = '\\';
          newOffset = -GRID.CELL_SIZE * 0.25;
        } else {
          newChar = '|';
          newOffset = 0;
        }

        obj.char = newChar;
        obj.grassRenderOffset.x = newOffset;
        obj.grassResetTimer = 0.18; // brief spring-back delay

        // Stamp imprint only for player dodge roll
        if (playerInRange && game.player.dodgeRoll.active && newChar !== '|') {
          obj.grassImprinted = true;
        }
      } else if (obj.grassResetTimer > 0) {
        // Spring-back: hold the bent char a moment before snapping straight
        obj.grassResetTimer -= deltaTime;
        if (obj.grassResetTimer <= 0) {
          obj.char = '|';
          obj.grassRenderOffset.x = 0;
        }
      } else {
        obj.char = '|';
        obj.grassRenderOffset.x = 0;
      }
    }
  }

  /**
   * Melee interaction with loose goo blobs: a swing shoves a blob away from the
   * impact point, and a blade pops it. Both are gated on the blob's spawn
   * invulnerability — during that window a death blob is still flying on the
   * momentum it inherited from the killing blow, and the swing that produced it
   * is usually still alive and overlapping it. Shoving there overwrote the
   * inherited spray with a radial push away from the player's own weapon.
   */
  checkGooBlobHits() {
    const game = this.game;
    if (!game.gooBlobs.length) return;
    const meleeAttacks = game.combatSystem.meleeAttacks;
    for (let bi = game.gooBlobs.length - 1; bi >= 0; bi--) {
      const blob = game.gooBlobs[bi];
      if (blob.expired) { game.gooBlobs.splice(bi, 1); continue; }
      if (blob.isInvulnerable()) continue;

      let hit = false;
      for (const attack of meleeAttacks) {
        const atkR = (attack.radius || GRID.CELL_SIZE) + blob.radius;
        const dx = blob.position.x - attack.position.x;
        const dy = blob.position.y - attack.position.y;
        if (dx * dx + dy * dy < atkR * atkR) {
          if (attack.isBlade) hit = true;
          // One shove per swing, not one per frame the swing is alive.
          if (blob.lastPushAttack !== attack) {
            blob.lastPushAttack = attack;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            blob.velocity.vx += (dx / dist) * GOO_BLOB_PUSH_FORCE;
            blob.velocity.vy += (dy / dist) * GOO_BLOB_PUSH_FORCE;
            const speed = Math.sqrt(blob.velocity.vx ** 2 + blob.velocity.vy ** 2);
            if (speed > GOO_BLOB_MAX_SPEED) {
              blob.velocity.vx = (blob.velocity.vx / speed) * GOO_BLOB_MAX_SPEED;
              blob.velocity.vy = (blob.velocity.vy / speed) * GOO_BLOB_MAX_SPEED;
            }
            blob.stationary = false;
          }
          break;
        }
      }
      if (hit) {
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
      // Reuse the dying enemy's already-resolved collisionMap so pieces get
      // pushed out of border/interior walls in whatever room (surface or
      // interior) the enemy actually died in.
      piece.setCollisionMap(enemy.collisionMap);
      game.debris.push(piece);
      game.physicsSystem.addEntity(piece);
    }
  }
}
