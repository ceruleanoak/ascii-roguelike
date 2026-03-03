import { GRID, COLORS } from '../game/GameConfig.js';
import { ENEMIES } from '../data/enemies.js';
import { inSamePlane } from '../systems/PhysicsSystem.js';

const ENEMY_INVULNERABILITY_DURATION = 0.3; // seconds
const ENEMY_BLINK_FREQUENCY = 0.05; // blink every 0.05 seconds
const DOT_BLINK_FREQUENCY = 0.2; // DOT blink every 0.2 seconds (slower than i-frames)

export class Enemy {
  constructor(char, x, y, depth = 0) {
    this.char = char;
    this.data = ENEMIES[char] || {
      char,
      name: 'Unknown',
      hp: 1,
      speed: 60,
      damage: 1,
      attackRange: 16,
      attackCooldown: 1.0,
      color: COLORS.ENEMY,
      drops: []
    };

    // Pixel-based position
    this.position = { x, y };
    this.velocity = { vx: 0, vy: 0 };
    this.acceleration = { ax: 0, ay: 0 };

    // Stats (scale with depth - every 3 rooms, 5% increase)
    const depthMultiplier = 1 + (Math.floor(depth / 3) * 0.05);
    this.hp = Math.ceil(this.data.hp * depthMultiplier);
    this.maxHp = this.hp;
    this.speed = this.data.speed;
    this.damage = Math.ceil(this.data.damage * depthMultiplier);
    this.attackRange = this.data.attackRange;
    this.aggroRange = this.data.aggroRange || GRID.CELL_SIZE * 8;
    this.attackCooldown = this.data.attackCooldown;
    this.attackWindup = this.data.attackWindup || 0.3;
    this.windupImmune = this.data.windupImmune || false;  // Cannot be interrupted during windup
    this.attackType = this.data.attackType || 'melee';
    this.attackTimer = 0;
    this.windupTimer = 0;

    // Invulnerability frames
    this.invulnerabilityTimer = 0;
    this.invulnerabilityDuration = ENEMY_INVULNERABILITY_DURATION;
    this.lastHitAttackId = null; // tracks the burst attackId that triggered the current iframe

    // Rendering
    this.color = this.data.color;
    this.baseColor = this.data.color; // Store original color
    this.width = GRID.CELL_SIZE;
    this.height = GRID.CELL_SIZE;

    // Physics flags
    this.hasCollision = true;
    this.boundToGrid = true;
    this.collisionMap = null;
    this.backgroundObjects = null; // Reference to background objects for vision checks
    this.plane = 0; // 0=normal plane, 1=tunnel plane

    // AI state
    this.target = null;
    this.state = 'idle'; // idle, chase, windup, attack
    this.enraged = false; // Once attacked, always aggro'd

    // Wandering behavior when idle
    this.wanderTimer = Math.random() * 3; // Random initial delay
    this.wanderDirection = { x: 0, y: 0 };
    this.wanderSpeed = this.speed * 0.3; // 30% of normal speed

    // Vector-based navigation
    this.navigationLength = GRID.CELL_SIZE * 3; // Vector length for pathfinding around walls
    this.visionLength = GRID.CELL_SIZE * 8; // Longer vector for vision checks (can see further)
    this.rotationIncrement = 1; // Degrees to rotate when checking for clear path
    this.currentDirection = { x: 0, y: 0 }; // Cached movement direction
    this.stuckTimer = 0; // Track how long we've been stuck
    this.lastPosition = { x, y }; // For stuck detection

    // Memory-based aggro
    this.lastKnownPosition = null; // Last known player position
    this.aggroMemoryActive = false; // Whether pursuing a memory mark
    this.memoryMoveDelayTimer = 0; // Delay before moving to memory mark after losing sight
    this.memoryMoveDelay = 1.0; // 1 second delay before chasing memory
    this.detectionIndicatorTimer = 0; // Show yellow ! when detecting/reacquiring player
    this.detectionIndicatorDuration = 1.0; // Show detection indicator for 1 second

    // Unified AI decision-making (intelligence system)
    this.decisionInterval = this.data.decisionInterval || 0.5; // How often to reassess (smarter = lower)
    this.decisionTimer = Math.random() * this.decisionInterval; // Time until next decision (randomized start)
    this.bruteForceTimer = 0; // Cooldown after applying 45° brute force (prevents immediate recalc)
    this.lastBruteForceAngle = null; // Track last forced angle to avoid repeating

    // Status effects
    this.statusEffects = {
      burn: { active: false, duration: 8, damage: 0.5, tickRate: 2.5, tickTimer: 0 },
      poison: { active: false, duration: 0, damage: 0.3, tickRate: 0.3, tickTimer: 0 },
      acid: { active: false, duration: 0, damage: 0.4, tickRate: 0.4, tickTimer: 0 },
      bleed: { active: false, duration: 0, damage: 0.2, tickRate: 0.5, tickTimer: 0 },
      freeze: { active: false, duration: 0, slowAmount: 0.5 },
      stun: { active: false, duration: 0 },
      sleep: { active: false, duration: 0 },
      charm: { active: false, duration: 0 },
      wet: { active: false, duration: 0 },
      knockback: { active: false, duration: 0 },
      blind: { active: false, duration: 0 } // Attacks miss (0 damage)
    };

    // DOT blink timer
    this.dotBlinkTimer = 0;

    // Wet trail emission timer (mirrors player implementation)
    this.wetDropTimer = 0;

    // Elemental affinity system
    this.elementalAffinity = this.data.elementalAffinity || {
      immunity: [],
      resistance: {},
      weakness: {}
    };

    // Wand system properties
    this.electrified = false; // Electrical infusion on enemy
    this.electrifiedTimer = 0;

    // Spawning system
    this.spawning = this.data.spawning || null;
    if (this.spawning && this.spawning.enabled) {
      this.spawnTimer = this.spawning.spawnCooldown;
      this.spawnWindupTimer = 0;
      this.spawnWindupActive = false;
      this.activeSpawnCount = 0;
      this.lifetimeSpawnCount = 0;
      this.spawnedEnemies = new Set();
    }

    // Item usage system
    this.itemUsage = this.data.itemUsage || null;
    if (this.itemUsage && this.itemUsage.enabled) {
      this.inventory = [];
      this.equippedWeapon = null;
      this.itemUseCooldown = 0;
      this.targetItem = null;
      this.shouldDropItems = false;
    }

    // Sapping system (for bat enemy)
    this.sapping = false;
    this.sappingTarget = null;
    this.sapDamageTimer = 0;
    this.sapDamageInterval = this.data.sapDamageInterval || 1.0;
    this.sapDamage = this.data.sapDamage || 1; // Fixed sap damage (not scaled by depth)

    // Pack behavior system (for wolves and spiders)
    this.packBehavior = this.data.packBehavior || null;
    if (this.packBehavior && this.packBehavior.enabled) {
      this.hoverTimer = 0;
      this.isHovering = false;
      this.hoverLocked = false; // Once locked, hover continues until attack
      this.isAttacking = false; // Aggressive rush state after hovering
      this.attackRushTimer = 0; // Duration of attack rush
      this.packmates = []; // Reference to nearby pack members (updated by game)
    }
  }

  setCollisionMap(collisionMap) {
    this.collisionMap = collisionMap;
  }

  setBackgroundObjects(backgroundObjects) {
    this.backgroundObjects = backgroundObjects;
  }

  setSteamClouds(steamClouds) {
    this.steamClouds = steamClouds;
  }

  setTarget(target) {
    this.target = target;
  }

  getElementalModifier(elementType) {
    if (!elementType || !this.elementalAffinity) return 1.0;

    if (this.elementalAffinity.immunity && this.elementalAffinity.immunity.includes(elementType)) {
      return 0.0;
    }

    if (this.elementalAffinity.resistance && this.elementalAffinity.resistance[elementType] !== undefined) {
      return this.elementalAffinity.resistance[elementType];
    }

    if (this.elementalAffinity.weakness && this.elementalAffinity.weakness[elementType] !== undefined) {
      return this.elementalAffinity.weakness[elementType];
    }

    return 1.0;
  }

  shouldApplyStatusEffect(effect) {
    if (!this.elementalAffinity || !this.elementalAffinity.immunity) return true;
    return !this.elementalAffinity.immunity.includes(effect);
  }

  applyStatusEffect(effect, duration = 3.0) {
    if (!this.statusEffects[effect]) return;

    this.statusEffects[effect].active = true;
    this.statusEffects[effect].duration = Math.max(this.statusEffects[effect].duration, duration);
    if (this.statusEffects[effect].tickTimer !== undefined) {
      this.statusEffects[effect].tickTimer = 0;
    }

    // Drop items when stunned (electric shock effect)
    if (effect === 'stun' && this.itemUsage && this.inventory.length > 0) {
      this.shouldDropItems = true;
    }
  }

  updateStatusEffects(deltaTime) {
    const damageEvents = []; // Track DOT damage for damage numbers

    // DoT effects: burn, poison, acid, bleed
    for (const effect of ['burn', 'poison', 'acid', 'bleed']) {
      const status = this.statusEffects[effect];
      if (!status.active) continue;

      status.duration -= deltaTime;
      status.tickTimer -= deltaTime;

      if (status.tickTimer <= 0) {
        // Apply DoT damage (bypasses invulnerability, minimum 1)
        const actualDamage = Math.max(1, Math.ceil(status.damage));
        this.hp -= actualDamage;
        if (this.hp < 0) this.hp = 0;
        status.tickTimer = status.tickRate;

        // Record damage event for damage number
        damageEvents.push({
          damage: actualDamage,
          effect: effect
        });
      }

      if (status.duration <= 0) {
        status.active = false;
        status.duration = 0;
      }
    }

    // Freeze effect (slow movement)
    const freeze = this.statusEffects.freeze;
    if (freeze.active) {
      freeze.duration -= deltaTime;
      if (freeze.duration <= 0) {
        freeze.active = false;
        freeze.duration = 0;
      }
    }

    // Stun effect (disable movement and attacks)
    const stun = this.statusEffects.stun;
    if (stun.active) {
      stun.duration -= deltaTime;
      if (stun.duration <= 0) {
        stun.active = false;
        stun.duration = 0;
      }
    }

    // Sleep effect (like stun but breaks on damage)
    const sleep = this.statusEffects.sleep;
    if (sleep.active) {
      sleep.duration -= deltaTime;
      if (sleep.duration <= 0) {
        sleep.active = false;
        sleep.duration = 0;
      }
    }

    // Charm effect (enemy redirects to fight other enemies)
    const charm = this.statusEffects.charm;
    if (charm.active) {
      charm.duration -= deltaTime;
      if (charm.duration <= 0) {
        charm.active = false;
        charm.duration = 0;
      }
    }

    // Wet (vulnerability modifier - not a DoT)
    const wet = this.statusEffects.wet;
    if (wet.active) {
      wet.duration -= deltaTime;
      if (wet.duration <= 0) { wet.active = false; wet.duration = 0; }
    }

    // Knockback effect (prevents AI from overriding velocity)
    const knockback = this.statusEffects.knockback;
    if (knockback.active) {
      knockback.duration -= deltaTime;
      if (knockback.duration <= 0) {
        knockback.active = false;
        knockback.duration = 0;
      }
    }

    // Blind effect (prevents attacks)
    const blind = this.statusEffects.blind;
    if (blind.active) {
      blind.duration -= deltaTime;
      if (blind.duration <= 0) {
        blind.active = false;
        blind.duration = 0;
      }
    }

    return damageEvents;
  }

  isStunned() {
    return this.statusEffects.stun.active;
  }

  isFrozen() {
    return this.statusEffects.freeze.active;
  }

  isWet() { return this.statusEffects.wet.active; }

  isSleeping() { return this.statusEffects.sleep.active; }

  isCharmed() { return this.statusEffects.charm.active; }

  isKnockedBack() { return this.statusEffects.knockback.active; }


  isBlind() { return this.statusEffects.blind.active; }

  // Get effective damage (0 if blind, normal damage otherwise)
  getEffectiveDamage() {
    return this.isBlind() ? 0 : this.damage;
  }

  getSpeedMultiplier() {
    if (this.isStunned()) return 0;
    if (this.isKnockedBack()) return 0;
    if (this.isFrozen()) return 1 - this.statusEffects.freeze.slowAmount;
    return 1;
  }

  getActiveStatusEffects() {
    return Object.keys(this.statusEffects).filter(effect => this.statusEffects[effect].active);
  }

  /**
   * Calculate pack behavior movement (for wolves and spiders)
   * Returns movement vector and whether to hover
   */
  calculatePackMovement(playerPosition, speedMultiplier) {
    if (!this.packBehavior || !this.packBehavior.enabled) {
      return null;
    }

    const dx = playerPosition.x - this.position.x;
    const dy = playerPosition.y - this.position.y;
    const distanceToPlayer = Math.sqrt(dx * dx + dy * dy);

    // Calculate pack center if there are packmates
    let packCenterX = this.position.x;
    let packCenterY = this.position.y;
    let packCount = 1;

    if (this.packmates && this.packmates.length > 0) {
      for (const mate of this.packmates) {
        packCenterX += mate.position.x;
        packCenterY += mate.position.y;
        packCount++;
      }
      packCenterX /= packCount;
      packCenterY /= packCount;
    }

    // Vector to pack center
    const toPackX = packCenterX - this.position.x;
    const toPackY = packCenterY - this.position.y;
    const distanceToPack = Math.sqrt(toPackX * toPackX + toPackY * toPackY);

    // Separation force - maintain distance from packmates
    let separationX = 0;
    let separationY = 0;
    const separationDistance = GRID.CELL_SIZE * 2; // Minimum distance between pack members

    if (this.packmates && this.packmates.length > 0) {
      for (const mate of this.packmates) {
        const mateDx = this.position.x - mate.position.x;
        const mateDy = this.position.y - mate.position.y;
        const mateDist = Math.sqrt(mateDx * mateDx + mateDy * mateDy);

        // Apply stronger separation when too close
        if (mateDist < separationDistance && mateDist > 0) {
          const force = (separationDistance - mateDist) / separationDistance;
          separationX += (mateDx / mateDist) * force;
          separationY += (mateDy / mateDist) * force;
        }
      }
    }

    // Vector away from player
    const awayX = -dx;
    const awayY = -dy;

    // Determine behavior based on distance to player
    const shouldRetreat = distanceToPlayer < this.packBehavior.retreatThreshold && !this.hoverLocked;
    const isAtKiteDistance = distanceToPlayer >= this.packBehavior.kiteDistance &&
                             distanceToPlayer <= this.packBehavior.kiteDistance + GRID.CELL_SIZE * 2;

    let vx = 0;
    let vy = 0;
    let shouldHover = false;

    // Once hovering is locked, it continues regardless of distance
    if (this.hoverLocked) {
      shouldHover = true;
    }

    if (shouldRetreat) {
      // Player too close - retreat while staying near pack
      // 60% away from player, 20% towards pack, 20% separation
      vx = (awayX * 0.6) + (toPackX * 0.2) + (separationX * 0.2);
      vy = (awayY * 0.6) + (toPackY * 0.2) + (separationY * 0.2);
      this.hoverTimer = 0; // Reset hover timer when retreating
      this.isHovering = false;
      this.hoverLocked = false;
    } else if (isAtKiteDistance || this.hoverLocked) {
      // At ideal kite distance OR hover is locked - hover and circle
      shouldHover = true;

      // Lock hover once we start (prevents reset from player movement)
      if (!this.hoverLocked && isAtKiteDistance) {
        this.hoverLocked = true;
      }

      // Circle strafe: perpendicular to player direction
      const perpX = -dy / (distanceToPlayer || 1);
      const perpY = dx / (distanceToPlayer || 1);

      // 40% circle, 20% pack center, 40% separation (creates hunting circle)
      if (distanceToPack > GRID.CELL_SIZE) {
        vx = (perpX * 0.4) + (toPackX * 0.2) + (separationX * 0.4);
        vy = (perpY * 0.4) + (toPackY * 0.2) + (separationY * 0.4);
      } else {
        // Close to pack - circle with separation
        vx = (perpX * 0.6) + (separationX * 0.4);
        vy = (perpY * 0.6) + (separationY * 0.4);
      }
    } else if (distanceToPlayer > this.packBehavior.kiteDistance + GRID.CELL_SIZE) {
      // Too far - move closer while staying near pack
      // 40% towards player, 40% towards pack, 20% separation
      vx = (dx * 0.4) + (toPackX * 0.4) + (separationX * 0.2);
      vy = (dy * 0.4) + (toPackY * 0.4) + (separationY * 0.2);

      // Don't reset hover if already locked
      if (!this.hoverLocked) {
        this.hoverTimer = 0;
        this.isHovering = false;
      }
    }

    // Normalize and apply speed
    const magnitude = Math.sqrt(vx * vx + vy * vy);
    if (magnitude > 0) {
      vx = (vx / magnitude) * this.speed * speedMultiplier * 0.8; // Slower kiting speed
      vy = (vy / magnitude) * this.speed * speedMultiplier * 0.8;
    }

    return {
      vx,
      vy,
      shouldHover
    };
  }

  update(deltaTime) {
    // Track if this enemy just detected player (for aggro SFX)
    let justAggrod = false;

    if (!this.target) {
      return { dotDamage: [] };
    }

    // Update invulnerability timer
    if (this.invulnerabilityTimer > 0) {
      this.invulnerabilityTimer -= deltaTime;
      if (this.invulnerabilityTimer < 0) {
        this.invulnerabilityTimer = 0;
      }
    }

    // Update DOT blink timer
    this.dotBlinkTimer += deltaTime;

    // Update detection indicator timer
    if (this.detectionIndicatorTimer > 0) {
      this.detectionIndicatorTimer -= deltaTime;
      if (this.detectionIndicatorTimer < 0) {
        this.detectionIndicatorTimer = 0;
      }
    }

    // Update status effects and capture DOT damage events
    const dotDamageEvents = this.updateStatusEffects(deltaTime);

    // Check if enemy is inside a steam cloud (reduces vision and speed)
    const STEAM_VISION_THRESHOLD = GRID.CELL_SIZE * 2;
    let inSteam = false;
    for (const cloud of (this.steamClouds || [])) {
      const sdx = this.position.x - cloud.x, sdy = this.position.y - cloud.y;
      if (sdx * sdx + sdy * sdy <= cloud.radius * cloud.radius) { inSteam = true; break; }
    }
    const effectiveVisionLength = inSteam ? STEAM_VISION_THRESHOLD : this.visionLength;

    const dx = this.target.position.x - this.position.x;
    const dy = this.target.position.y - this.position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Update attack timer
    if (this.attackTimer > 0) {
      this.attackTimer -= deltaTime;
    }

    // Update windup timer
    if (this.windupTimer > 0) {
      this.windupTimer -= deltaTime;
      if (this.windupTimer <= 0) {
        // Windup complete, ready to attack
        this.state = 'attack';
        this.windupTimer = 0;
      }
    }

    // Sleep overrides all AI (like stun, but breaks on damage — see takeDamage)
    if (this.isSleeping()) {
      this.velocity.vx = 0;
      this.velocity.vy = 0;
      this.state = 'idle';
      return { dotDamage: dotDamageEvents };
    }

    // Stun overrides all AI
    if (this.isStunned()) {
      this.velocity.vx = 0;
      this.velocity.vy = 0;
      this.state = 'idle';
      return { dotDamage: dotDamageEvents };
    }

    // Knockback overrides AI (keeps velocity set by knockback)
    if (this.isKnockedBack()) {
      this.state = 'idle';
      return { dotDamage: dotDamageEvents };
    }

    // Sapping behavior (locks to target position and deals periodic damage)
    if (this.sapping && this.sappingTarget) {
      // Lock to target's position
      this.position.x = this.sappingTarget.position.x;
      this.position.y = this.sappingTarget.position.y;
      this.velocity.vx = 0;
      this.velocity.vy = 0;

      // Deal periodic damage (fixed amount, not scaled by depth)
      this.sapDamageTimer -= deltaTime;
      if (this.sapDamageTimer <= 0) {
        this.sapDamageTimer = this.sapDamageInterval;
        return {
          dotDamage: dotDamageEvents,
          sapDamage: { damage: this.sapDamage, target: this.sappingTarget }
        };
      }

      return { dotDamage: dotDamageEvents };
    }

    let speedMultiplier = this.getSpeedMultiplier();
    if (inSteam) speedMultiplier *= 0.6; // Steam slows enemies (cautious movement)

    // Update AI decision timer
    this.decisionTimer -= deltaTime;

    // AI behavior - only engage within aggro range (unless enraged or has memory)
    if (distance > this.aggroRange && !this.enraged) {
      // Player left aggro range - activate memory mode if we have a last known position
      if (this.lastKnownPosition && !this.aggroMemoryActive) {
        this.aggroMemoryActive = true;
        this.memoryMoveDelayTimer = this.memoryMoveDelay; // Start delay timer
        // Reset cached direction to force immediate recalculation towards memory mark
        this.currentDirection = { x: 0, y: 0 };

        // Share memory mark with all packmates (pack communication)
        if (this.packmates && this.packmates.length > 0) {
          for (const mate of this.packmates) {
            mate.target = this.target; // Share player target
            mate.lastKnownPosition = { x: this.lastKnownPosition.x, y: this.lastKnownPosition.y };
            mate.aggroMemoryActive = true;
            mate.memoryMoveDelayTimer = this.memoryMoveDelay;
            mate.currentDirection = { x: 0, y: 0 };
            mate.enraged = true; // Pack member becomes enraged when pack detects player
            mate.state = 'chase'; // Ensure chase state is set
          }
        }
      }

      // Pursue memory mark
      if (this.aggroMemoryActive && this.lastKnownPosition) {
        // Periodically check if player is back in range and visible (decision-based)
        if (this.decisionTimer <= 0) {
          // If player is within aggro range again, check if we can see them
          if (distance <= this.aggroRange) {
            const canSeePlayer = this.hasVision(this.position, this.target.position, effectiveVisionLength);
            if (canSeePlayer) {
              // Regained vision - exit memory mode and resume normal chase
              this.aggroMemoryActive = false;
              this.memoryMoveDelayTimer = 0; // Reset delay timer
              this.lastKnownPosition = { x: this.target.position.x, y: this.target.position.y };
              this.state = 'chase';
              // Show detection indicator (reacquired target!)
              this.detectionIndicatorTimer = this.detectionIndicatorDuration;

              // Share reacquisition with packmates (pack coordination)
              if (this.packmates && this.packmates.length > 0) {
                for (const mate of this.packmates) {
                  mate.target = this.target; // Share player target
                  mate.lastKnownPosition = { x: this.target.position.x, y: this.target.position.y };
                  mate.detectionIndicatorTimer = this.detectionIndicatorDuration;
                  mate.aggroMemoryActive = false;
                  mate.memoryMoveDelayTimer = 0;
                  mate.currentDirection = { x: 0, y: 0 };
                  mate.enraged = true;
                  mate.state = 'chase'; // Ensure chase state is set
                }
              }
            }
          }
        }

        // Continue pursuing memory mark if still in memory mode
        if (this.aggroMemoryActive) {
          const memDx = this.lastKnownPosition.x - this.position.x;
          const memDy = this.lastKnownPosition.y - this.position.y;
          const memDistance = Math.sqrt(memDx * memDx + memDy * memDy);

          // Tick down memory move delay timer
          if (this.memoryMoveDelayTimer > 0) {
            this.memoryMoveDelayTimer -= deltaTime;
            // Stand still during delay
            this.velocity.vx = 0;
            this.velocity.vy = 0;
            this.state = 'chase';
          } else {
            // Delay elapsed - start moving

            // Reached memory mark - end aggro for self and packmates
            if (memDistance < GRID.CELL_SIZE) {
              this.aggroMemoryActive = false;
              this.lastKnownPosition = null;
              this.memoryMoveDelayTimer = 0;
              this.state = 'idle';
              this.enraged = false; // Give up the hunt

              // Clear memory mark for all packmates (pack shares memory)
              if (this.packmates && this.packmates.length > 0) {
                for (const mate of this.packmates) {
                  mate.aggroMemoryActive = false;
                  mate.lastKnownPosition = null;
                  mate.memoryMoveDelayTimer = 0;
                  mate.currentDirection = { x: 0, y: 0 };
                  mate.enraged = false; // Pack gives up together
                  mate.state = 'idle';
                }
              }
            } else {
              // Chase to memory mark using vector navigation
              this.state = 'chase';
              if (this.collisionMap) {
                this.updateVectorNavigation(speedMultiplier, this.lastKnownPosition, deltaTime);
              } else {
                const dirX = memDx / memDistance;
                const dirY = memDy / memDistance;
                this.velocity.vx = dirX * this.speed * speedMultiplier;
                this.velocity.vy = dirY * this.speed * speedMultiplier;
              }
            }
          }
        }
      } else {
        // Too far and not enraged, no memory - wander passively
        this.state = 'idle';

        // Update wander timer
        this.wanderTimer -= deltaTime;
        if (this.wanderTimer <= 0) {
          // Pick new random direction
          const angle = Math.random() * Math.PI * 2;
          this.wanderDirection.x = Math.cos(angle);
          this.wanderDirection.y = Math.sin(angle);
          // Change direction every 2-4 seconds
          this.wanderTimer = 2 + Math.random() * 2;
        }

        // Move in wander direction
        this.velocity.vx = this.wanderDirection.x * this.wanderSpeed * speedMultiplier;
        this.velocity.vy = this.wanderDirection.y * this.wanderSpeed * speedMultiplier;
      }
    } else if (this.state === 'windup') {
      // Stay still during windup
      this.velocity.vx = 0;
      this.velocity.vy = 0;
    } else if (distance <= this.attackRange && this.attackTimer <= 0) {
      // CRITICAL: Can only attack if aggro'd (enraged) OR within aggro range
      const isAggrod = this.enraged || distance <= this.aggroRange;

      if (isAggrod) {
        // In range and aggro'd - check vision before attacking
        const canSeeTarget = this.hasVision(this.position, this.target.position, effectiveVisionLength);

        if (canSeeTarget && this.state !== 'windup' && this.state !== 'attack') {
          this.state = 'windup';
          this.windupTimer = this.attackWindup;
          this.velocity.vx = 0;
          this.velocity.vy = 0;
        } else if (!canSeeTarget) {
          // Can't see target (wrong plane or obstructed) - go into memory/chase mode
          // Let the chase logic below handle it
          // Do nothing here, fall through to chase condition
        }
      }
      // If not aggro'd, don't attack - fall through to other behaviors
    } else if ((distance > this.attackRange && distance <= this.aggroRange) || (this.enraged && distance > this.attackRange)) {
      // Within aggro range OR enraged and outside attack range
      // But first check if we're on the same plane - can't chase across planes unless already enraged/memory
      const onSamePlane = inSamePlane(this, this.target);
      const canChase = onSamePlane || this.enraged || this.aggroMemoryActive;

      if (!canChase) {
        // Different plane and not already chasing - remain idle
        this.state = 'idle';
      } else {
        // Can chase - either same plane, or already aggro'd/memory from before
        const wasIdle = this.state === 'idle';
        const wasInMemoryMode = this.aggroMemoryActive;
        this.state = 'chase';

        // ALWAYS check vision when in aggro range (don't throttle initial detection)
        const canSeePlayer = this.hasVision(this.position, this.target.position, effectiveVisionLength);

        if (canSeePlayer) {
          // Vision is clear - update last known position and deactivate memory
          this.lastKnownPosition = { x: this.target.position.x, y: this.target.position.y };

          // Check if this is a NEW detection (transition from not detecting to detecting)
          const isNewDetection = this.detectionIndicatorTimer <= 0;

          // Always refresh detection indicator when player is in sight (ensures ! overrides ?)
          this.detectionIndicatorTimer = this.detectionIndicatorDuration;

          // Flag for aggro SFX
          if (isNewDetection) {
            justAggrod = true;
          }

          this.aggroMemoryActive = false;
          this.memoryMoveDelayTimer = 0; // Reset delay timer

          // Share NEW detection with packmates (pack coordination)
          if (isNewDetection && this.packmates && this.packmates.length > 0) {
            for (const mate of this.packmates) {
              mate.target = this.target; // Share player target
              mate.lastKnownPosition = { x: this.target.position.x, y: this.target.position.y };
              mate.detectionIndicatorTimer = this.detectionIndicatorDuration;
              mate.aggroMemoryActive = false;
              mate.memoryMoveDelayTimer = 0;
              mate.currentDirection = { x: 0, y: 0 };
              mate.enraged = true;
              mate.state = 'chase'; // Ensure chase state is set
            }
          }
        } else {
          // Lost vision - activate memory mode if not already active
          if (this.lastKnownPosition && !this.aggroMemoryActive) {
            // TRANSITION: Just lost vision - capture CURRENT player position as memory mark
            // This is where they disappeared (tunnel entrance, tall grass, etc.)
            this.lastKnownPosition = { x: this.target.position.x, y: this.target.position.y };
            this.aggroMemoryActive = true;
            this.memoryMoveDelayTimer = this.memoryMoveDelay; // Start delay timer
            // Reset cached direction to force immediate recalculation towards memory mark
            this.currentDirection = { x: 0, y: 0 };

            // Share memory mark with all packmates (pack communication)
            if (this.packmates && this.packmates.length > 0) {
              for (const mate of this.packmates) {
                mate.target = this.target; // Share player target
                mate.lastKnownPosition = { x: this.lastKnownPosition.x, y: this.lastKnownPosition.y };
                mate.aggroMemoryActive = true;
                mate.memoryMoveDelayTimer = this.memoryMoveDelay;
                mate.currentDirection = { x: 0, y: 0 };
                mate.enraged = true; // Pack member becomes enraged when pack detects player
                mate.state = 'chase'; // Ensure chase state is set
              }
            }
          }
          // If already in memory mode, do nothing here - keep pursuing the existing memory mark
          else if (!this.lastKnownPosition) {
            // Never had vision of player (spawned with wall between) - set current position as "last known"
            // This prevents endless chasing through walls when we never actually saw them
            // BUT: Only do this if actually within aggro range AND on same plane
            // Different planes = no detection, like tall grass
            if (distance <= this.aggroRange && inSamePlane(this, this.target)) {
              this.lastKnownPosition = { x: this.target.position.x, y: this.target.position.y };
              this.aggroMemoryActive = true;
              this.memoryMoveDelayTimer = this.memoryMoveDelay; // Start delay timer
              // Reset cached direction to force immediate recalculation towards memory mark
              this.currentDirection = { x: 0, y: 0 };
            }
          }
        }
      }

      // Check if pursuing memory mark while within aggro range
      if (this.aggroMemoryActive && this.lastKnownPosition) {
        // Calculate distance to memory mark
        const memDx = this.lastKnownPosition.x - this.position.x;
        const memDy = this.lastKnownPosition.y - this.position.y;
        const memDistance = Math.sqrt(memDx * memDx + memDy * memDy);

        // Tick down memory move delay timer
        if (this.memoryMoveDelayTimer > 0) {
          this.memoryMoveDelayTimer -= deltaTime;
          // Stand still during delay
          this.velocity.vx = 0;
          this.velocity.vy = 0;
          this.state = 'chase';
        } else {
          // Delay elapsed - start moving

          // Reached memory mark but player still hidden - give up for self and packmates
          if (memDistance < GRID.CELL_SIZE) {
            this.aggroMemoryActive = false;
            this.lastKnownPosition = null;
            this.memoryMoveDelayTimer = 0;
            this.state = 'idle';
            this.velocity.vx = 0;
            this.velocity.vy = 0;
            this.enraged = false; // Give up the hunt

            // Clear memory mark for all packmates (pack shares memory)
            if (this.packmates && this.packmates.length > 0) {
              for (const mate of this.packmates) {
                mate.aggroMemoryActive = false;
                mate.lastKnownPosition = null;
                mate.memoryMoveDelayTimer = 0;
                mate.currentDirection = { x: 0, y: 0 };
                mate.enraged = false; // Pack gives up together
                mate.state = 'idle';
              }
            }
          } else {
            // Still pursuing memory mark
            if (this.collisionMap) {
              this.updateVectorNavigation(speedMultiplier, this.lastKnownPosition, deltaTime);
            } else {
              const dirX = memDx / memDistance;
              const dirY = memDy / memDistance;
              this.velocity.vx = dirX * this.speed * speedMultiplier;
              this.velocity.vy = dirY * this.speed * speedMultiplier;
            }
          }
        }
      } else {
        // Direct chase (can see player)

        // === PACK BEHAVIOR ===
        // Only activate pack tactics if this enemy OR any packmate has detected the player
        const packDetected = this.detectionIndicatorTimer > 0 ||
                            (this.packmates && this.packmates.some(mate => mate.detectionIndicatorTimer > 0));

        if (this.packBehavior && this.packBehavior.enabled && packDetected) {
          // ESCAPE FROM HOVER: If player evades and creates new memory mark, abandon hover
          if (this.isHovering && this.aggroMemoryActive) {
            // Player escaped during hover - reset hover state and pursue memory
            this.isHovering = false;
            this.hoverLocked = false;
            this.hoverTimer = 0;

            // Fall through to normal memory pursuit behavior below
            if (this.collisionMap) {
              this.updateVectorNavigation(speedMultiplier, this.target.position, deltaTime);
            } else {
              const navDx = this.target.position.x - this.position.x;
              const navDy = this.target.position.y - this.position.y;
              const navDistance = Math.sqrt(navDx * navDx + navDy * navDy);

              if (navDistance > 0) {
                const dirX = navDx / navDistance;
                const dirY = navDy / navDistance;
                this.velocity.vx = dirX * this.speed * speedMultiplier;
                this.velocity.vy = dirY * this.speed * speedMultiplier;
              }
            }
          }
          // Check if in aggressive attack rush
          else if (this.isAttacking) {
            this.attackRushTimer -= deltaTime;

            // Fast aggressive movement towards player (1.5x normal speed)
            const navDx = this.target.position.x - this.position.x;
            const navDy = this.target.position.y - this.position.y;
            const navDistance = Math.sqrt(navDx * navDx + navDy * navDy);

            if (navDistance > 0) {
              const dirX = navDx / navDistance;
              const dirY = navDy / navDistance;
              this.velocity.vx = dirX * this.speed * speedMultiplier * 1.5; // Fast rush
              this.velocity.vy = dirY * this.speed * speedMultiplier * 1.5;
            }

            // End attack rush when timer expires or reached attack range
            if (this.attackRushTimer <= 0 || navDistance <= this.attackRange) {
              this.isAttacking = false;
              this.attackRushTimer = 0;
              this.hoverLocked = false;
              this.hoverTimer = 0;
              this.detectionIndicatorTimer = 0; // Clear red indicator
            }
          } else {
            const packMovement = this.calculatePackMovement(this.target.position, speedMultiplier);

            if (packMovement) {
              this.velocity.vx = packMovement.vx;
              this.velocity.vy = packMovement.vy;

              // Update hover timer
              if (packMovement.shouldHover) {
                this.isHovering = true;
                this.hoverTimer += deltaTime;

                // After hovering long enough, commit to aggressive attack
                if (this.hoverTimer >= this.packBehavior.hoverTime) {
                  this.isHovering = false;
                  this.hoverTimer = 0;
                  this.hoverLocked = false;

                  // Enter aggressive attack state
                  this.isAttacking = true;
                  this.attackRushTimer = 2.0; // 2 second aggressive rush
                  this.detectionIndicatorTimer = 2.0; // Show red ! during rush
                }
              } else {
                this.isHovering = false;
              }
            }
          }
        } else {
          // Normal chase behavior (no pack tactics)
          if (this.collisionMap) {
            this.updateVectorNavigation(speedMultiplier, this.target.position, deltaTime);
          } else {
            const navDx = this.target.position.x - this.position.x;
            const navDy = this.target.position.y - this.position.y;
            const navDistance = Math.sqrt(navDx * navDx + navDy * navDy);

            if (navDistance > 0) {
              const dirX = navDx / navDistance;
              const dirY = navDy / navDistance;
              this.velocity.vx = dirX * this.speed * speedMultiplier;
              this.velocity.vy = dirY * this.speed * speedMultiplier;
            }
          }
        }
      } // Close the canChase else block
    } // Close the aggro range else if block
    else {
      // Between attack range and aggro range, but conditions not met
      this.state = 'idle';
      this.velocity.vx = 0;
      this.velocity.vy = 0;
    }

    // Cut grass when searching with blade weapons
    if (this.aggroMemoryActive && this.backgroundObjects && this.equippedWeapon) {
      const weaponData = this.equippedWeapon.data;
      if (weaponData && weaponData.isBlade) {
        // Check if overlapping with tall grass
        for (const obj of this.backgroundObjects) {
          if (obj.destroyed || obj.char !== '|') continue;

          const dx = obj.position.x - this.position.x;
          const dy = obj.position.y - this.position.y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          // Cut grass within melee range
          if (distance < GRID.CELL_SIZE * 1.5) {
            obj.cutGrass();
          }
        }
      }
    }

    // Reset decision timer if expired
    if (this.decisionTimer <= 0) {
      this.decisionTimer = this.decisionInterval;
    }

    // Item usage
    if (this.itemUsage && this.itemUsage.enabled) {
      if (this.itemUseCooldown > 0) {
        this.itemUseCooldown -= deltaTime;
      }

      if (this.equippedWeapon && this.equippedWeapon.update) {
        const itemAttack = this.equippedWeapon.update(deltaTime);
        if (itemAttack) {
          return {
            dotDamage: dotDamageEvents,
            itemAttack: this.convertToEnemyAttack(itemAttack)
          };
        }
      }
    }

    // Spawning logic
    if (this.spawning && this.spawning.enabled) {
      if (this.spawnWindupActive) {
        this.spawnWindupTimer -= deltaTime;
        if (this.spawnWindupTimer <= 0) {
          this.spawnWindupActive = false;
          return {
            dotDamage: dotDamageEvents,
            shouldSpawn: true,
            spawnData: {
              spawnChar: this.spawning.spawnChar,
              spawnCount: this.spawning.spawnCount || 1,
              spawnRange: this.spawning.spawnRange,
              spawnerPosition: { x: this.position.x, y: this.position.y }
            }
          };
        }
      }

      if (!this.spawnWindupActive && this.spawnTimer > 0) {
        this.spawnTimer -= deltaTime;

        if (this.spawnTimer <= 0 && this.canSpawn()) {
          this.spawnWindupActive = true;
          this.spawnWindupTimer = this.spawning.spawnWindup || 1.0;
          this.spawnTimer = this.spawning.spawnCooldown;
        }
      }
    }

    return { dotDamage: dotDamageEvents, justAggrod };
  }

  /**
   * Vector-based navigation system with decision-based throttling
   * Projects a vector toward target and rotates when encountering obstacles
   * Recalculates based on enemy intelligence (decisionTimer) or when stuck
   */
  updateVectorNavigation(speedMultiplier, targetOverride = null, deltaTime = 0.016) {
    if (!this.collisionMap) return;

    // Determine target position (live player or memory mark)
    const target = targetOverride || (this.target ? this.target.position : null);
    if (!target) return;

    // Update brute force cooldown timer
    if (this.bruteForceTimer > 0) {
      this.bruteForceTimer -= deltaTime;
      if (this.bruteForceTimer < 0) this.bruteForceTimer = 0;
    }

    // Detect if stuck using velocity-based check (absolute threshold, not percentage)
    const currentSpeed = Math.sqrt(this.velocity.vx * this.velocity.vx + this.velocity.vy * this.velocity.vy);
    const expectedSpeed = this.speed * speedMultiplier;
    const STUCK_THRESHOLD = 5.0; // Absolute speed threshold (units per second)

    // If moving slower than 5 units/sec, consider stuck (works for all enemy speeds)
    if (currentSpeed < STUCK_THRESHOLD) {
      this.stuckTimer += deltaTime;
    } else {
      this.stuckTimer = 0;
    }

    this.lastPosition = { x: this.position.x, y: this.position.y };

    // Check if current cached direction is obstructed
    // Test if moving along the cached direction would hit an obstacle
    let currentPathObstructed = false;
    if (this.currentDirection.x !== 0 || this.currentDirection.y !== 0) {
      const testPoint = {
        x: this.position.x + this.currentDirection.x * this.navigationLength,
        y: this.position.y + this.currentDirection.y * this.navigationLength
      };
      currentPathObstructed = !this.hasLineOfSight(this.position, testPoint, this.navigationLength);
    }

    // Check if pursuing a static target (memory mark) vs dynamic target (live player)
    const isPursuingStaticMark = this.aggroMemoryActive && this.lastKnownPosition;

    // Recalculate if:
    // 1. Decision timer expired (intelligence-based reassessment) - SKIP for static marks
    // 2. Stuck in place for too long (>0.3s triggers brute force)
    // 3. No direction cached yet (initialization)
    // 4. Current path became obstructed (dynamic obstacle avoidance)
    // BUT: Don't recalc if brute force cooldown is active (let sliding collision work)
    const needsRecalc = this.bruteForceTimer <= 0 && (
      (!isPursuingStaticMark && this.decisionTimer <= 0) ||  // Skip decision timer for static marks
      this.stuckTimer > 0.3 ||
      (this.currentDirection.x === 0 && this.currentDirection.y === 0) ||
      currentPathObstructed
    );

    if (needsRecalc) {
      const dx = target.x - this.position.x;
      const dy = target.y - this.position.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance === 0) return;

      // Initial direction vector toward target
      let angle = Math.atan2(dy, dx);
      let foundDirection = false;

      // Check if direct path is clear (using navigation length for collision avoidance)
      if (this.hasLineOfSight(this.position, target, this.navigationLength)) {
        // Clear path - move directly
        this.currentDirection.x = dx / distance;
        this.currentDirection.y = dy / distance;
        foundDirection = true;
      } else if (this.stuckTimer > 0.3) {
        // BRUTE FORCE: Stuck on corner - snap to FURTHEST 45° angle and COMMIT
        // Don't check if blocked - let sliding collision handle it!
        const PI_4 = Math.PI / 4; // 45 degrees

        // Normalize angle to [0, 2π]
        const normalizedAngle = ((angle % (Math.PI * 2)) + (Math.PI * 2)) % (Math.PI * 2);

        // Find the two adjacent 45° snaps
        const lowerSnap = Math.floor(normalizedAngle / PI_4) * PI_4;
        const upperSnap = lowerSnap + PI_4;

        // Calculate distances to each snap
        const distToLower = Math.abs(normalizedAngle - lowerSnap);
        const distToUpper = Math.abs(normalizedAngle - upperSnap);

        // Pick the FURTHEST snap, but if we just tried it, use the OTHER one
        let snapAngle = distToLower > distToUpper ? lowerSnap : upperSnap;

        // If we tried this angle last time and we're still stuck, try the other adjacent snap
        if (this.lastBruteForceAngle !== null && Math.abs(snapAngle - this.lastBruteForceAngle) < 0.1) {
          snapAngle = distToLower > distToUpper ? upperSnap : lowerSnap;
        }

        // FORCE this direction - no checking, just do it!
        this.currentDirection.x = Math.cos(snapAngle);
        this.currentDirection.y = Math.sin(snapAngle);
        this.bruteForceTimer = 1.0; // Commit to this direction for 1 second
        this.lastBruteForceAngle = snapAngle; // Remember this angle
        foundDirection = true;
      } else {
        // Path obstructed but not stuck yet - use fine rotation search
        const maxRotation = 180; // Maximum degrees to search
        const increment = this.rotationIncrement * (Math.PI / 180); // Convert to radians

        for (let deg = increment; deg <= maxRotation * (Math.PI / 180); deg += increment) {
          // Alternate between clockwise and counterclockwise
          for (const direction of [1, -1]) {
            const testAngle = angle + (deg * direction);
            const testTarget = {
              x: this.position.x + Math.cos(testAngle) * this.navigationLength,
              y: this.position.y + Math.sin(testAngle) * this.navigationLength
            };

            if (this.hasLineOfSight(this.position, testTarget, this.navigationLength)) {
              // Found clear path at this angle
              this.currentDirection.x = Math.cos(testAngle);
              this.currentDirection.y = Math.sin(testAngle);
              foundDirection = true;
              break;
            }
          }

          if (foundDirection) break;
        }

        // If no clear path found, use direct direction as last resort
        if (!foundDirection) {
          this.currentDirection.x = dx / distance;
          this.currentDirection.y = dy / distance;
        }
      }

      // Reset stuck timer only if we found a direction
      if (foundDirection) {
        this.stuckTimer = 0;
      }
    }

    // Apply cached direction to velocity
    this.velocity.vx = this.currentDirection.x * this.speed * speedMultiplier;
    this.velocity.vy = this.currentDirection.y * this.speed * speedMultiplier;
  }

  /**
   * Check if there's a clear line of sight along a vector
   * Uses ray casting to detect collisions
   */
  hasLineOfSight(start, end, maxLength) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const checkDistance = Math.min(distance, maxLength);

    // Sample points along the vector
    const samples = Math.ceil(checkDistance / (GRID.CELL_SIZE / 2));

    for (let i = 1; i <= samples; i++) {
      const t = i / samples;
      const checkX = start.x + dx * t;
      const checkY = start.y + dy * t;

      // Convert to grid coordinates
      const gridX = Math.floor(checkX / GRID.CELL_SIZE);
      const gridY = Math.floor(checkY / GRID.CELL_SIZE);

      // Check if out of bounds or collision
      if (gridX < 0 || gridX >= GRID.COLS || gridY < 0 || gridY >= GRID.ROWS) {
        return false;
      }

      if (this.collisionMap[gridY][gridX]) {
        return false; // Collision detected
      }
    }

    return true; // Clear path
  }

  /**
   * Find where line of sight is blocked (for visualization)
   * Returns the point where vision is obstructed, or the end point if clear
   */
  getVisionObstructionPoint(start, end, maxLength) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const checkDistance = Math.min(distance, maxLength);

    // Too far to see
    if (distance > maxLength) {
      // Return point at max vision length
      const angle = Math.atan2(dy, dx);
      return {
        x: start.x + Math.cos(angle) * maxLength,
        y: start.y + Math.sin(angle) * maxLength,
        blocked: true
      };
    }

    // Sample points along the vector
    const samples = Math.ceil(checkDistance / (GRID.CELL_SIZE / 2));

    for (let i = 1; i <= samples; i++) {
      const t = i / samples;
      const checkX = start.x + dx * t;
      const checkY = start.y + dy * t;

      // Convert to grid coordinates
      const gridX = Math.floor(checkX / GRID.CELL_SIZE);
      const gridY = Math.floor(checkY / GRID.CELL_SIZE);

      // Check if out of bounds
      if (gridX < 0 || gridX >= GRID.COLS || gridY < 0 || gridY >= GRID.ROWS) {
        return { x: checkX, y: checkY, blocked: true };
      }

      // Check collision map (solid walls)
      if (this.collisionMap && this.collisionMap[gridY][gridX]) {
        return { x: checkX, y: checkY, blocked: true };
      }

      // Check background objects (trees, boulders, etc.)
      if (this.backgroundObjects) {
        for (const obj of this.backgroundObjects) {
          if (obj.destroyed) continue;

          const objGridX = Math.floor(obj.position.x / GRID.CELL_SIZE);
          const objGridY = Math.floor(obj.position.y / GRID.CELL_SIZE);

          if (objGridX === gridX && objGridY === gridY) {
            if (obj.bulletInteraction === 'block' ||
                obj.bulletInteraction === 'interact-preserve' ||
                obj.bulletInteraction === 'interact-destroy') {
              return { x: checkX, y: checkY, blocked: true };
            }
          }
        }
      }
    }

    return { x: end.x, y: end.y, blocked: false }; // Clear vision to target
  }

  /**
   * Check if enemy can see the target (vision check)
   * More restrictive than hasLineOfSight - includes background objects
   * Used for aggro/memory system, NOT navigation
   * PLANE-AWARE: Returns false if target is in different plane
   */
  hasVision(start, end, maxLength) {
    // CRITICAL: Check if target is in same plane
    // If target has a position property, it's likely the player object
    if (this.target && !inSamePlane(this, this.target)) {
      return false;
    }

    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const checkDistance = Math.min(distance, maxLength);

    // Too far to see
    if (distance > maxLength) {
      return false;
    }

    // Sample points along the vector
    const samples = Math.ceil(checkDistance / (GRID.CELL_SIZE / 2));

    for (let i = 1; i <= samples; i++) {
      const t = i / samples;
      const checkX = start.x + dx * t;
      const checkY = start.y + dy * t;

      // Convert to grid coordinates
      const gridX = Math.floor(checkX / GRID.CELL_SIZE);
      const gridY = Math.floor(checkY / GRID.CELL_SIZE);

      // Check if out of bounds
      if (gridX < 0 || gridX >= GRID.COLS || gridY < 0 || gridY >= GRID.ROWS) {
        return false;
      }

      // Check collision map (solid walls)
      if (this.collisionMap && this.collisionMap[gridY][gridX]) {
        return false; // Wall blocks vision
      }

      // Check background objects (trees, boulders, tall grass, etc.)
      if (this.backgroundObjects) {
        for (const obj of this.backgroundObjects) {
          if (obj.destroyed) continue;

          // Check if this sample point intersects with a background object
          const objGridX = Math.floor(obj.position.x / GRID.CELL_SIZE);
          const objGridY = Math.floor(obj.position.y / GRID.CELL_SIZE);

          if (objGridX === gridX && objGridY === gridY) {
            // Block vision if object has blocksVision property or blocks bullets
            if (obj.blocksVision && obj.blocksVision()) {
              return false; // Tall grass blocks vision
            }
            if (obj.bulletInteraction === 'block' ||
                obj.bulletInteraction === 'interact-preserve') {
              return false; // Solid object blocks vision
            }
          }
        }
      }

      // Check steam clouds (block vision through steam)
      if (this.steamClouds) {
        for (const cloud of this.steamClouds) {
          const sdx = checkX - cloud.x, sdy = checkY - cloud.y;
          if (sdx * sdx + sdy * sdy <= cloud.radius * cloud.radius) {
            return false;
          }
        }
      }
    }

    return true; // Clear vision
  }

  canAttack() {
    // Blind enemies can still attack, but will miss (damage set to 0 in createAttack)

    // Sap attacks can start when within range and not already sapping
    if (this.attackType === 'sap') {
      return !this.sapping && this.state === 'attack' && this.attackTimer <= 0 && this.windupTimer <= 0;
    }
    // Can only attack after windup completes
    return this.state === 'attack' && this.attackTimer <= 0 && this.windupTimer <= 0;
  }

  attack() {
    this.attackTimer = this.attackCooldown;
    this.state = 'idle'; // Reset to idle after attack
    return this.damage;
  }

  createAttack() {
    if (!this.canAttack() || !this.target) return null;

    this.attackTimer = this.attackCooldown;

    // Use equipped weapon if available
    if (this.equippedWeapon && this.attackType.startsWith('item_')) {
      if (this.itemUseCooldown > 0) return null;

      const fakePlayer = {
        position: this.position,
        facing: this.getFacingDirection(),
        width: this.width,
        height: this.height
      };

      const attack = this.equippedWeapon.use(fakePlayer);
      if (attack) {
        this.itemUseCooldown = this.itemUsage.useCooldown;
        return this.convertToEnemyAttack(attack);
      }
      return null;
    }

    switch (this.attackType) {
      case 'melee':
        return this.createMeleeAttack();
      case 'ranged':
        return this.createProjectile();
      case 'magic':
        return this.createMagicAttack();
      case 'fire':
        return this.createFireBreath();
      case 'sap':
        return this.createSapAttack();
      default:
        return null;
    }
  }

  getFacingDirection() {
    const dx = this.target.position.x - this.position.x;
    const dy = this.target.position.y - this.position.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    return { x: dx / dist, y: dy / dist };
  }

  createMeleeAttack() {
    const dx = this.target.position.x - this.position.x;
    const dy = this.target.position.y - this.position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance === 0) return null;

    let dirX = dx / distance;
    let dirY = dy / distance;

    // Create attack zone extending toward player (full attack range)
    // Position it 1 unit away from enemy, extending to attack range
    const attackDistance = GRID.CELL_SIZE + (this.attackRange - GRID.CELL_SIZE) * 0.5;

    return {
      type: 'enemy_melee',
      char: '█',
      position: {
        x: this.position.x + dirX * attackDistance,
        y: this.position.y + dirY * attackDistance
      },
      width: GRID.CELL_SIZE,
      height: GRID.CELL_SIZE,
      damage: this.getEffectiveDamage(),
      duration: 0.15,
      color: this.color,
      knockback: 300,
      owner: this,
      isCharmedAttack: this.isCharmed(),
      charmedTarget: this.isCharmed() ? this.target : null,
      shooterPlane: this.plane
    };
  }

  // Create windup attack visual (shown during windup, before damage can be dealt)
  createWindupAttackVisual() {
    if (!this.target) return null;

    const dx = this.target.position.x - this.position.x;
    const dy = this.target.position.y - this.position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance === 0) return null;

    const dirX = dx / distance;
    const dirY = dy / distance;

    const attackDistance = GRID.CELL_SIZE + (this.attackRange - GRID.CELL_SIZE) * 0.5;

    return {
      type: 'enemy_melee',
      char: '█',
      position: {
        x: this.position.x + dirX * attackDistance,
        y: this.position.y + dirY * attackDistance
      },
      width: GRID.CELL_SIZE,
      height: GRID.CELL_SIZE,
      damage: this.getEffectiveDamage(),
      duration: this.attackWindup + 0.15, // Windup + actual attack duration
      color: this.color,
      knockback: 300,
      owner: this,
      isCharmedAttack: this.isCharmed(),
      charmedTarget: this.isCharmed() ? this.target : null,
      windupPhase: true, // Mark as windup - cannot deal damage yet
      hasHit: true, // Prevent damage during windup
      windupDuration: this.attackWindup, // Store total windup time
      windupElapsed: 0, // Track time elapsed in windup
      alpha: 1.0, // Start at full visibility
      shooterPlane: this.plane
    };
  }

  createProjectile() {
    const dx = this.target.position.x - this.position.x;
    const dy = this.target.position.y - this.position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance === 0) return null;

    const dirX = dx / distance;
    const dirY = dy / distance;

    // Calculate base angle
    const baseAngle = Math.atan2(dirY, dirX);

    // Normal slight randomness for projectile aim
    const randomness = (Math.random() - 0.5) * 0.1; // ±0.05 radians (~3 degrees)
    const finalAngle = baseAngle + randomness;

    return {
      type: 'enemy_projectile',
      char: '·',
      position: {
        x: this.position.x + this.width / 2,
        y: this.position.y + this.height / 2
      },
      velocity: {
        vx: Math.cos(finalAngle) * 200,
        vy: Math.sin(finalAngle) * 200
      },
      damage: this.getEffectiveDamage(),
      color: this.color,
      owner: 'enemy',
      shooterPlane: this.plane
    };
  }

  createMagicAttack() {
    const dx = this.target.position.x - this.position.x;
    const dy = this.target.position.y - this.position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance === 0) return null;

    const dirX = dx / distance;
    const dirY = dy / distance;

    let targetAngle = Math.atan2(dirY, dirX);

    // Reckless misdirection (applied to all missiles)

    // Wizard shoots 3 magic missiles in a spread
    const projectiles = [];
    for (let i = -1; i <= 1; i++) {
      const baseAngle = targetAngle + (i * 0.2);
      const randomness = (Math.random() - 0.5) * 0.06; // ±0.03 radians (~2 degrees)
      const angle = baseAngle + randomness;

      projectiles.push({
        type: 'enemy_projectile',
        char: '*',
        position: {
          x: this.position.x + this.width / 2,
          y: this.position.y + this.height / 2
        },
        velocity: {
          vx: Math.cos(angle) * 180,
          vy: Math.sin(angle) * 180
        },
        damage: this.getEffectiveDamage(),
        color: '#8800ff',
        owner: 'enemy',
        shooterPlane: this.plane
      });
    }

    return projectiles;
  }

  createFireBreath() {
    const dx = this.target.position.x - this.position.x;
    const dy = this.target.position.y - this.position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance === 0) return null;

    const dirX = dx / distance;
    const dirY = dy / distance;

    let targetAngle = Math.atan2(dirY, dirX);

    // Reckless misdirection (applied to all fire projectiles)

    // Dragon shoots 5 fire projectiles in a cone
    const projectiles = [];
    for (let i = -2; i <= 2; i++) {
      const baseAngle = targetAngle + (i * 0.15);
      const randomness = (Math.random() - 0.5) * 0.06; // ±0.03 radians (~2 degrees)
      const angle = baseAngle + randomness;

      projectiles.push({
        type: 'enemy_projectile',
        char: '♦',
        position: {
          x: this.position.x + this.width / 2,
          y: this.position.y + this.height / 2
        },
        velocity: {
          vx: Math.cos(angle) * 220,
          vy: Math.sin(angle) * 220
        },
        damage: this.getEffectiveDamage(),
        color: '#ff4400',
        owner: 'enemy',
        shooterPlane: this.plane
      });
    }

    return projectiles;
  }

  createSapAttack() {
    // Start sapping - lock onto target and deal periodic damage
    this.sapping = true;
    this.sappingTarget = this.target;
    this.sapDamageTimer = this.sapDamageInterval;
    this.attackTimer = 0; // No cooldown while sapping
    this.state = 'idle';
    return null; // No attack object created - damage dealt in update()
  }

  takeDamage(amount, attackId = null) {
    // Block during iframes unless the hit comes from the same attack burst that
    // triggered the iframe (allows multi-bullet weapons to land all their shots).
    if (this.invulnerabilityTimer > 0) {
      const sameBurst = attackId !== null && attackId === this.lastHitAttackId;
      if (!sameBurst) return false;
    }

    this.hp -= amount;
    if (this.hp < 0) this.hp = 0;

    // Sleep breaks on damage
    if (this.statusEffects.sleep && this.statusEffects.sleep.active) {
      this.statusEffects.sleep.active = false;
      this.statusEffects.sleep.duration = 0;
    }

    // Sapping breaks on damage - enemy gets knocked away
    if (this.sapping) {
      this.breakSapping(200); // Knockback force
    }

    // Become enraged when attacked - never un-aggro
    this.enraged = true;

    // Interrupt windup when taking damage (unless immune)
    if (this.state === 'windup' && !this.windupImmune) {
      this.windupTimer = 0;
    }

    // Immediately lock onto attacker's position so the enemy can
    // navigate even if it was wandering or in memory mode
    if (this.target) {
      this.lastKnownPosition = { x: this.target.position.x, y: this.target.position.y };
      this.aggroMemoryActive = false;
      this.state = 'chase';
    }

    // Flash ! when hit (overrides ? indicator)
    this.detectionIndicatorTimer = this.detectionIndicatorDuration;

    // Start (or refresh) invulnerability frames and record the triggering burst
    if (this.hp > 0) {
      this.invulnerabilityTimer = this.invulnerabilityDuration;
      this.lastHitAttackId = attackId;
    }

    // Return true if dead, or a truthy value if damaged (for damage numbers)
    return this.hp <= 0 ? true : { damaged: true };
  }

  isInvulnerable() {
    return this.invulnerabilityTimer > 0;
  }

  shouldRenderVisible() {
    // Blink during invulnerability frames
    if (this.invulnerabilityTimer > 0) {
      const blinkCycle = Math.floor(this.invulnerabilityTimer / ENEMY_BLINK_FREQUENCY);
      return blinkCycle % 2 === 0;
    }
    return true;
  }

  getDOTBlinkColor() {
    // DOT effect colors (priority order: burn > poison > acid > bleed)
    const DOT_COLORS = {
      burn: '#ff4400',
      poison: '#88ff00',
      acid: '#00ff00',
      bleed: '#cc0000'
    };

    // Find first active DOT effect
    for (const effect of ['burn', 'poison', 'acid', 'bleed']) {
      if (this.statusEffects[effect].active) {
        // Blink between base color and DOT color
        const blinkCycle = Math.floor(this.dotBlinkTimer / DOT_BLINK_FREQUENCY);
        return blinkCycle % 2 === 0 ? DOT_COLORS[effect] : this.baseColor;
      }
    }

    // Stun blink (yellow) — shows when stunned and no DoT active
    if (this.statusEffects.stun && this.statusEffects.stun.active) {
      const blinkCycle = Math.floor(this.dotBlinkTimer / DOT_BLINK_FREQUENCY);
      return blinkCycle % 2 === 0 ? '#ffff00' : this.baseColor;
    }

    // Sleep blink (purple)
    if (this.statusEffects.sleep && this.statusEffects.sleep.active) {
      const blinkCycle = Math.floor(this.dotBlinkTimer / DOT_BLINK_FREQUENCY);
      return blinkCycle % 2 === 0 ? '#9944ff' : this.baseColor;
    }

    // Charm blink (pink)
    if (this.statusEffects.charm && this.statusEffects.charm.active) {
      const blinkCycle = Math.floor(this.dotBlinkTimer / DOT_BLINK_FREQUENCY);
      return blinkCycle % 2 === 0 ? '#ff44ff' : this.baseColor;
    }

    // Freeze blink (cyan/ice blue)
    if (this.statusEffects.freeze && this.statusEffects.freeze.active) {
      const blinkCycle = Math.floor(this.dotBlinkTimer / DOT_BLINK_FREQUENCY);
      return blinkCycle % 2 === 0 ? '#00ffff' : this.baseColor;
    }

    // Wet blink (blue, lowest priority - only shows when no DoT or stun active)
    if (this.statusEffects.wet && this.statusEffects.wet.active) {
      const blinkCycle = Math.floor(this.dotBlinkTimer / DOT_BLINK_FREQUENCY);
      return blinkCycle % 2 === 0 ? '#4488ff' : this.baseColor;
    }
    return null; // No active DOT
  }

  isWindingUp() {
    return this.state === 'windup' && this.windupTimer > 0;
  }

  getWindupIndicator() {
    if (this.isWindingUp()) {
      return {
        char: '!',
        color: '#ff0000',
        offsetY: -GRID.CELL_SIZE  // Position above enemy
      };
    }
    return null;
  }

  getMemoryIndicator() {
    // Only show ? when in memory mode AND not hovering (hover takes priority)
    if (this.aggroMemoryActive && this.state === 'chase' &&
        this.detectionIndicatorTimer <= 0 && !this.isHovering) {
      return {
        char: '?',
        color: '#ffff00',
        offsetY: -GRID.CELL_SIZE  // Position above enemy
      };
    }
    return null;
  }

  getHoverIndicator() {
    // Show ... when pack hunting and hovering (distinct state - overrides memory)
    if (this.isHovering && this.detectionIndicatorTimer <= 0) {
      return {
        char: '...',
        color: '#aaaaaa',
        offsetY: -GRID.CELL_SIZE  // Position above enemy
      };
    }
    return null;
  }

  getDetectionIndicator() {
    if (this.detectionIndicatorTimer > 0 && !this.aggroMemoryActive) {
      // Red indicator during aggressive attack rush, yellow otherwise
      const isAttackingRush = this.isAttacking && this.packBehavior && this.packBehavior.enabled;
      return {
        char: '!',
        color: isAttackingRush ? '#ff0000' : '#ffff00',
        offsetY: -GRID.CELL_SIZE  // Position above enemy
      };
    }
    return null;
  }

  getSappingIndicator() {
    if (this.sapping) {
      return {
        char: '*',
        color: '#ff0000',
        offsetY: -GRID.CELL_SIZE  // Position above enemy
      };
    }
    return null;
  }

  canSpawn() {
    if (!this.spawning || !this.spawning.enabled) return false;
    if (this.activeSpawnCount >= this.spawning.maxSpawns) return false;
    if (this.lifetimeSpawnCount >= this.spawning.maxLifetimeSpawns) return false;
    return true;
  }

  registerSpawn(spawnedEnemy) {
    this.spawnedEnemies.add(spawnedEnemy);
    this.activeSpawnCount++;
    this.lifetimeSpawnCount++;
    spawnedEnemy.spawner = this;
  }

  notifySpawnDeath(spawnedEnemy) {
    if (this.spawnedEnemies.has(spawnedEnemy)) {
      this.spawnedEnemies.delete(spawnedEnemy);
      this.activeSpawnCount--;
    }
  }

  getSpawnIndicator() {
    if (this.spawnWindupActive && this.spawnWindupTimer > 0) {
      return { char: '+', color: '#ff00ff', offsetY: -GRID.CELL_SIZE };
    }
    return null;
  }

  getBlindIndicator() {
    if (this.isBlind()) {
      return { char: 'X', color: '#ff0000', offsetY: -GRID.CELL_SIZE };
    }
    return null;
  }

  evaluateItemPickup(items) {
    if (!this.itemUsage || !this.itemUsage.canPickup) return null;
    if (this.inventory.length >= this.itemUsage.maxItems) return null;

    let bestItem = null;
    let bestScore = 0;

    for (const item of items) {
      const distance = Math.hypot(
        item.position.x - this.position.x,
        item.position.y - this.position.y
      );

      if (distance > this.itemUsage.pickupRange) continue;

      let score = 1.0;
      if (this.itemUsage.preferredItems.includes(item.char)) {
        score = 10.0;
      }
      score *= (1.0 - (distance / this.itemUsage.pickupRange));

      if (score > bestScore) {
        bestScore = score;
        bestItem = item;
      }
    }

    return bestItem;
  }

  pickupItem(item) {
    if (!this.itemUsage || this.inventory.length >= this.itemUsage.maxItems) {
      return false;
    }

    this.inventory.push(item);

    if (item.data.type === 'WEAPON') {
      this.equipWeapon(item);
    }

    return true;
  }

  equipWeapon(item) {
    if (item.data.type !== 'WEAPON') return;

    this.equippedWeapon = item;

    if (item.data.weaponType === 'GUN' || item.data.weaponType === 'BOW') {
      this.attackType = 'item_ranged';
    } else {
      this.attackType = 'item_melee';
    }

    this.attackRange = this.itemUsage.useRange;
  }

  shouldUseConsumable() {
    if (!this.itemUsage) return null;

    const healthPercent = this.hp / this.maxHp;
    if (healthPercent > this.itemUsage.useConsumablesAt) return null;

    for (const item of this.inventory) {
      if (item.data.effect === 'heal' || item.data.effect === 'maxhp') {
        return item;
      }
    }

    return null;
  }

  useConsumable(item) {
    if (!item || item.data.type !== 'CONSUMABLE') return false;

    switch (item.data.effect) {
      case 'heal':
        this.hp = Math.min(this.hp + item.data.amount, this.maxHp);
        break;
      case 'maxhp':
        this.maxHp += item.data.amount;
        this.hp += item.data.amount;
        break;
    }

    const index = this.inventory.indexOf(item);
    if (index > -1) {
      this.inventory.splice(index, 1);
    }

    return true;
  }

  convertToEnemyAttack(attack) {
    if (Array.isArray(attack)) {
      return attack.map(a => ({ ...a, owner: 'enemy', enemyOwner: this }));
    }
    return { ...attack, owner: 'enemy', enemyOwner: this };
  }

  dropInventory() {
    if (!this.itemUsage || !this.itemUsage.dropOnDeath) return [];

    const drops = [];
    for (const item of this.inventory) {
      item.position.x = this.position.x;
      item.position.y = this.position.y;
      item.velocity = { vx: 0, vy: 0 };
      drops.push(item);
    }

    this.inventory = [];
    this.equippedWeapon = null;

    return drops;
  }

  getStunDroppedItems() {
    if (!this.shouldDropItems) return [];
    this.shouldDropItems = false;

    const drops = [];
    for (const item of this.inventory) {
      item.position.x = this.position.x;
      item.position.y = this.position.y;
      // Add some velocity to scatter items
      const angle = Math.random() * Math.PI * 2;
      const speed = 50 + Math.random() * 50;
      item.velocity = {
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed
      };
      drops.push(item);
    }

    this.inventory = [];
    this.equippedWeapon = null;
    this.attackType = this.data.attackType || 'melee'; // Revert to original attack type

    return drops;
  }

  breakSapping(knockbackForce = 200) {
    if (!this.sapping || !this.sappingTarget) return;

    // Calculate knockback direction (away from target)
    const dx = this.position.x - this.sappingTarget.position.x;
    const dy = this.position.y - this.sappingTarget.position.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;

    // Apply knockback
    this.velocity.vx = (dx / dist) * knockbackForce;
    this.velocity.vy = (dy / dist) * knockbackForce;
    this.applyStatusEffect('knockback', 0.3);

    // Clear sapping state
    this.sapping = false;
    this.sappingTarget = null;
    this.sapDamageTimer = 0;
    this.attackTimer = this.attackCooldown; // Reset attack cooldown
  }

  getHitbox() {
    return {
      x: this.position.x,
      y: this.position.y,
      width: this.width,
      height: this.height
    };
  }

  getDrops() {
    const drops = [];
    for (const drop of this.data.drops) {
      if (Math.random() < drop.chance) {
        drops.push(drop.char);
      }
    }
    return drops;
  }
}
