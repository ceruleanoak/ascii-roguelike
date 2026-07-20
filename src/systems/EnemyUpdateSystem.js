import { GRID, PHYSICS } from '../game/GameConfig.js';
import { inSamePlane, tagInteriorPlane } from './PlaneSystem.js';
import { CAMP_NPC_STATE } from '../entities/CampNPC.js';
import { GooBlob } from '../entities/GooBlob.js';

const MAX_GOO_BLOBS = 20;
const SLIME_COLLISION_DISTANCE = 16;
const SLIME_COLLISION_SQ = SLIME_COLLISION_DISTANCE * SLIME_COLLISION_DISTANCE;

/**
 * EnemyUpdateSystem — owns all per-frame enemy preparation and post-tick dispatch
 * that would otherwise live inline in updateExploreState.
 *
 * Runs BEFORE CombatSystem.update() each frame. Handles:
 *   - Slime contact (enemy→player, enemy→enemy, puddle contact)
 *   - Slow timer ticking
 *   - Pack behavior (packmates list + memory-mark sharing)
 *   - Canonical enemy tick (exactly one enemy.update() per frame)
 *   - All update-result handlers (boar charge, goo spew, slime trail, shaman buff, etc.)
 *   - Enemy spawn queue flush
 *   - Enemy item pickup
 */
export class EnemyUpdateSystem {
  constructor(game) {
    this.game = game;
  }

  update(deltaTime) {
    const game = this.game;
    if (!game.currentRoom) return;
    const enemies = game.currentRoom.enemies;
    const player = game.player;

    this._applySlimeContact(player, enemies);
    this._applySlimePuddleContact(player, enemies);
    this._tickSlowTimers(deltaTime, enemies);
    this._updatePackBehavior(enemies);
    this._runEnemyLoop(deltaTime, player, enemies);
    game.enemySpawnSystem.flush();
    this._handleEnemyItemPickup(enemies);
  }

  _applySlimeContact(player, enemies) {
    const slimeEnemies = (player.inMaze || player.inHut || player.inDungeon)
      ? []
      // Mid-leap (windup or airborne) the body isn't on the ground to touch —
      // its lerped position sweeps across the room to the landing target and
      // shouldn't slime anything it passes over.
      : enemies.filter(e => e.data?.affinities?.includes('goo') && !e.leapWindupActive && !e.leapAirborneActive);
    for (const slime of slimeEnemies) {
      const pdx = player.position.x - slime.position.x;
      const pdy = player.position.y - slime.position.y;
      if (pdx * pdx + pdy * pdy < SLIME_COLLISION_SQ) {
        player.applyStatusEffect('goo', 5.0);
      }
      for (const other of enemies) {
        if (other === slime) continue;
        if (other.data?.affinities?.includes('goo')) continue;
        const dx = other.position.x - slime.position.x;
        const dy = other.position.y - slime.position.y;
        if (dx * dx + dy * dy < SLIME_COLLISION_SQ) {
          other.applyStatusEffect('goo', 5.0);
        }
      }
    }
  }

  _applySlimePuddleContact(player, enemies) {
    const game = this.game;
    if (!game.puddles.length || player.inMaze) return;
    const playerPlane = player.plane ?? 0;
    const playerInInterior = !!game.activeFloor;
    const activeEnemies = game._activeEnemies();
    for (const puddle of game.puddles) {
      if (puddle.type !== 'slimeTrail') continue;
      if (!!puddle.hutPlane !== playerInInterior) continue;
      if ((puddle.plane ?? 0) === playerPlane && puddle.isEntityOnPuddle(player)) {
        player.applyStatusEffect(player.slimeImmune ? 'slimeBoost' : 'goo', 5.0);
      }
      for (const enemy of activeEnemies) {
        if (enemy.data?.affinities?.includes('goo')) continue;
        if ((puddle.plane ?? 0) !== (enemy.plane ?? 0)) continue;
        if (puddle.isEntityOnPuddle(enemy)) enemy.applyStatusEffect('goo', 5.0);
      }
    }
  }

  _tickSlowTimers(deltaTime, enemies) {
    for (const enemy of enemies) {
      if (enemy.slowTimer > 0) {
        enemy.slowTimer -= deltaTime;
        enemy.velocity.vx *= 0.5;
        enemy.velocity.vy *= 0.5;
      }
    }
  }

  _updatePackBehavior(enemies) {
    for (const enemy of enemies) {
      if (enemy.packCoordination && !enemy.packBehavior) {
        enemy.packmates = enemies.filter(o => o !== enemy && o.char === enemy.char);
        this._sharePackMemory(enemy);
      } else if (enemy.packBehavior?.enabled) {
        enemy.packmates = enemies.filter(o => {
          if (o === enemy || o.char !== enemy.char) return false;
          const dx = o.position.x - enemy.position.x;
          const dy = o.position.y - enemy.position.y;
          return Math.sqrt(dx * dx + dy * dy) <= enemy.packBehavior.packRadius;
        });
        this._sharePackMemory(enemy);
      }
    }
  }

  _sharePackMemory(enemy) {
    if (!enemy.packmates?.length) return;
    let sharedMemory = enemy.lastKnownPosition;
    for (const mate of enemy.packmates) {
      if (mate.lastKnownPosition && (mate.aggroMemoryActive || !sharedMemory)) {
        sharedMemory = mate.lastKnownPosition;
      }
    }
    if (sharedMemory && !enemy.lastKnownPosition) {
      enemy.lastKnownPosition = { x: sharedMemory.x, y: sharedMemory.y };
    }
  }

  _runEnemyLoop(deltaTime, player, enemies) {
    const game = this.game;
    if (player.inHut || player.inDungeon || player.inMaze) return;

    for (const enemy of enemies) {
      if (enemy.isDying) continue;

      if (enemy.itemUsage?.enabled) {
        const consumable = enemy.shouldUseConsumable();
        if (consumable) {
          enemy.useConsumable(consumable);
          game.combatSystem.createDamageNumber('+', enemy.position.x, enemy.position.y, '#00ff00');
        }
      }

      if (!game.combatSystem.applyTargetOverrides(enemy, enemies, player, game.activeNoiseSource)) {
        this._selectTarget(enemy, player, enemies);
      }

      const prevChargeSpeed = enemy.chargeState === 'charging'
        ? Math.sqrt(enemy.velocity.vx ** 2 + enemy.velocity.vy ** 2)
        : null;

      const updateResult = enemy.update(deltaTime * PHYSICS.ENEMY_TIMER_RATE);
      enemy._frameUpdateResult = updateResult;

      if (!enemy.data) continue;

      this._handleChargeContact(enemy, player, prevChargeSpeed);
      this._handleUpdateResult(enemy, player, updateResult, deltaTime);
    }
  }

  _selectTarget(enemy, player, enemies) {
    const game = this.game;
    let nearestTarget = player;
    let nearestDistSq = (player.position.x - enemy.position.x) ** 2
                      + (player.position.y - enemy.position.y) ** 2;
    const companion = game.companion;
    if (companion && companion.hp > 0 && companion.state !== CAMP_NPC_STATE.FLEEING) {
      const cDx = companion.position.x - enemy.position.x;
      const cDy = companion.position.y - enemy.position.y;
      const d = cDx * cDx + cDy * cDy;
      if (d < nearestDistSq) { nearestDistSq = d; nearestTarget = companion; }
    }
    for (const rat of game.tamedRats) {
      if (rat.state === 'permaFlee') continue;
      if ((rat.plane ?? 0) !== (enemy.plane ?? 0)) continue;
      const rDx = rat.position.x - enemy.position.x;
      const rDy = rat.position.y - enemy.position.y;
      const d = rDx * rDx + rDy * rDy;
      if (d < nearestDistSq) { nearestDistSq = d; nearestTarget = rat; }
    }
    enemy.setTarget(nearestTarget);
  }

  _handleChargeContact(enemy, player, prevChargeSpeed) {
    if (!enemy.data.chargeMechanic?.enabled) return;
    const game = this.game;

    if (enemy.chargeState === 'charging' && prevChargeSpeed !== null) {
      const expected = enemy.data.chargeMechanic.chargeSpeed;
      if (prevChargeSpeed < expected * 0.3) {
        enemy.chargeState = 'stunned';
        enemy.chargeDurationTimer = 0;
        enemy.chargeStunTimer = enemy.data.chargeMechanic.wallStunDuration;
        enemy.velocity.vx = 0;
        enemy.velocity.vy = 0;
        enemy.chargeTimer = enemy.data.chargeMechanic.cooldown;
      }
    }

    if (enemy.chargeState === 'charging' && !enemy.chargeHasHit && inSamePlane(enemy, player)) {
      const ex = enemy.position.x, ey = enemy.position.y;
      if (Math.abs(player.position.x - ex) < GRID.CELL_SIZE &&
          Math.abs(player.position.y - ey) < GRID.CELL_SIZE) {
        enemy.chargeHasHit = true;
        const damage = enemy.getEffectiveDamage();
        const result = player.takeDamage(damage, { isMelee: true, attacker: enemy });
        if (result?.dodged) {
          game.combatSystem.createDamageNumber('DODGE', player.position.x, player.position.y, '#ffff00');
        } else if (result?.blocked) {
          game.combatSystem.createDamageNumber('BLOCK', player.position.x, player.position.y, '#aaaaaa');
        } else if (result?.immune) {
          game.combatSystem.createDamageNumber('IMMUNE', player.position.x, player.position.y, '#00ffff');
        } else if (result !== false && result !== true) {
          game.combatSystem.createDamageNumber(damage, player.position.x, player.position.y, player.color);
          const knockback = 450 * (enemy.knockbackMultiplier ?? 1.0);
          game.physicsSystem.applyKnockback(player, ex, ey, knockback);
          game.physicsSystem.applyHitstop(player, 0.06);
          if (result?.reflect && result.attacker) {
            result.attacker.takeDamage(result.reflect);
            game.combatSystem.createDamageNumber(result.reflect, result.attacker.position.x, result.attacker.position.y, '#ff8800');
          }
        }
        enemy.chargeState = 'idle';
        enemy.chargeDurationTimer = 0;
        enemy.chargeTimer = enemy.data.chargeMechanic.cooldown;
      }
    }
  }

  _handleUpdateResult(enemy, player, updateResult, deltaTime) {
    const game = this.game;

    if (updateResult.justAggrod) {
      game.audioSystem.playSFX(enemy.data?.sfx?.aggro ?? 'aggro');
    }

    if (updateResult.itemAttack) {
      game.combatSystem.createEnemyAttack(updateResult.itemAttack);
    }

    if (updateResult.shouldSpawn) {
      game.enemySpawnSystem.queueRequest(enemy, updateResult.spawnData);
    }

    if (updateResult.shouldSpewGoo && updateResult.gooSpewData) {
      for (const b of updateResult.gooSpewData) {
        const blob = new GooBlob(b.x, b.y, performance.now(), false, b.vx, b.vy, b.decel);
        blob.plane = b.plane ?? 0;
        tagInteriorPlane(game, blob);
        game.gooBlobs.push(blob);
      }
      while (game.gooBlobs.length > MAX_GOO_BLOBS) game.gooBlobs.shift();
      game.audioSystem?.playSFX('goo_hit');
    }

    if (updateResult.sniperGooDrop) {
      const g = updateResult.sniperGooDrop;
      const blob = new GooBlob(g.x, g.y, performance.now(), true);
      blob.plane = g.plane ?? 0;
      tagInteriorPlane(game, blob);
      game.gooBlobs.push(blob);
      while (game.gooBlobs.length > MAX_GOO_BLOBS) game.gooBlobs.shift();
      game.audioSystem?.playSFX('goo_hit');
    }

    if (updateResult.shouldDropSlimeTrail) {
      const t = updateResult.shouldDropSlimeTrail;
      game._dropSlimeTrail(t.x, t.y, t.plane);
      if (enemy.char === 'M') {
        const RING_RADIUS = GRID.CELL_SIZE * 0.4;
        for (let r = 0; r < 4; r++) {
          const a = (r / 4) * Math.PI * 2;
          game._dropSlimeTrail(t.x + Math.cos(a) * RING_RADIUS, t.y + Math.sin(a) * RING_RADIUS, t.plane);
        }
      }
    }

    if (updateResult.shouldLeapLand && updateResult.leapLandData) {
      this._handleLeapLand(player, updateResult.leapLandData);
    }

    if (enemy._shamBuff) {
      enemy._shamBuff.timer -= deltaTime;
      if (enemy._shamBuff.timer <= 0) {
        if (enemy._shamBuff.type === 'speed') enemy.speed = enemy._shamBuff.baseSpeed;
        else if (enemy._shamBuff.type === 'damage') enemy.damage = enemy._shamBuff.baseDamage;
        enemy._shamBuff = null;
      }
    }

    if (updateResult.shouldPlaceTrail) {
      const td = updateResult.trailData;
      game._spawnEnemyTrailPuddle(td.x, td.y, td.type, td.radius, enemy.plane ?? 0, td.duration);
    }

    if (updateResult.shouldBuff) {
      game._applyShamanBuff(updateResult.buffData, game._activeEnemies());
    }

    if (updateResult.shouldLure) {
      player.velocity.vx += updateResult.lureData.forceX;
      player.velocity.vy += updateResult.lureData.forceY;
    }

    if (updateResult.shouldLayTrap && game.trapSystem) {
      const trd = updateResult.trapData;
      game.trapSystem.placeTrapAtPosition(trd.x, trd.y, trd.type, enemy.plane ?? 0, enemy);
    }

    const droppedItems = enemy.getStunDroppedItems();
    if (droppedItems.length > 0) {
      game.items.push(...droppedItems);
      for (const item of droppedItems) game.physicsSystem.addEntity(item);
    }

    if (enemy.data?.affinities?.includes('goo')) {
      const baseSpeed = enemy.data.speed;
      const GOO_TOUCH_RADIUS = GRID.CELL_SIZE;
      const ecx = enemy.position.x + GRID.CELL_SIZE / 2;
      const ecy = enemy.position.y + GRID.CELL_SIZE / 2;
      const halfBody = GRID.CELL_SIZE / 2;
      const onGoo = game.gooBlobs.some(blob => {
        const dx = ecx - blob.position.x, dy = ecy - blob.position.y;
        return Math.sqrt(dx * dx + dy * dy) < GOO_TOUCH_RADIUS + blob.radius;
      }) || game.puddles.some(p => {
        if (p.type !== 'slimeTrail' || (p.plane ?? 0) !== (enemy.plane ?? 0)) return false;
        return Math.abs(ecx - p.position.x) < halfBody + p.radius
            && Math.abs(ecy - p.position.y) < halfBody + p.radius;
      });
      enemy.speed = onGoo ? baseSpeed * 2 : baseSpeed;
    }
  }

  _handleLeapLand(player, ld) {
    const game = this.game;
    const cfg = ld.cfg;
    const hitEntities = new Set();
    if (player && (player.plane ?? 0) === ld.plane) {
      const pcx = player.position.x + GRID.CELL_SIZE / 2;
      const pcy = player.position.y + GRID.CELL_SIZE / 2;
      if (Math.hypot(pcx - ld.x, pcy - ld.y) <= cfg.landRadius) {
        player.takeDamage(cfg.landDamage);
        game.combatSystem.createDamageNumber(cfg.landDamage, player.position.x, player.position.y, player.color);
        game.physicsSystem.applyKnockback(player, ld.x, ld.y, cfg.landKnockback ?? cfg.shockwaveKnockback, 0.12);
        hitEntities.add(player);
      }
    }
    game.enemyShockwaves.push({
      x: ld.x, y: ld.y, plane: ld.plane,
      radius: cfg.landRadius, maxRadius: cfg.shockwaveMaxRadius,
      speed: cfg.shockwaveSpeed, damage: cfg.shockwaveDamage,
      knockback: cfg.shockwaveKnockback, hitEntities
    });
    if (cfg.trailDropOnLanding) {
      game._dropSlimeTrail(ld.x, ld.y, ld.plane);
      const RING_RADIUS = GRID.CELL_SIZE * 1.4;
      for (let r = 0; r < 10; r++) {
        const a = (r / 10) * Math.PI * 2;
        game._dropSlimeTrail(ld.x + Math.cos(a) * RING_RADIUS, ld.y + Math.sin(a) * RING_RADIUS, ld.plane);
      }
    }
    game.audioSystem?.playSFX('goo_hit');
  }

  _handleEnemyItemPickup(enemies) {
    const game = this.game;
    for (const enemy of enemies) {
      if (!enemy.itemUsage?.canPickup) continue;
      const targetItem = enemy.evaluateItemPickup(game.items);
      if (!targetItem) continue;
      enemy.targetItem = targetItem;
      const dx = targetItem.position.x - enemy.position.x;
      const dy = targetItem.position.y - enemy.position.y;
      if (Math.sqrt(dx * dx + dy * dy) < GRID.CELL_SIZE) {
        const result = enemy.pickupItem(targetItem);
        if (result !== false) {
          const index = game.items.indexOf(targetItem);
          if (index > -1) {
            game.items.splice(index, 1);
            game.physicsSystem.removeEntity(targetItem);
          }
          if (result && typeof result === 'object') {
            game.items.push(result);
            game.physicsSystem.addEntity?.(result);
          }
        }
        enemy.targetItem = null;
      }
    }
  }
}
