import { GRID, COLORS, PHYSICS } from '../game/GameConfig.js';
import { ENEMIES } from '../data/enemies.js';
import { inSamePlane } from '../systems/PhysicsSystem.js';

// ─── Enemy AI Debug Logger ─────────────────────────────────────────────────
// Toggle in browser console: window.ENEMY_AI_DEBUG = true
// Filter by enemy char:      window.ENEMY_AI_DEBUG_FILTER = 'g'   (null = all)
let _enemyDebugIdCounter = 0;
const EnemyDebug = {
  log(enemy, category, msg, data) {
    if (!window.ENEMY_AI_DEBUG) return;
    const filter = window.ENEMY_AI_DEBUG_FILTER;
    if (filter && enemy.char !== filter) return;
    const ts = performance.now().toFixed(1);
    const label = `[${ts}ms][${enemy.char}#${enemy._debugId}]`;
    if (data !== undefined) {
      console.log(`${label}[${category}] ${msg}`, data);
    } else {
      console.log(`${label}[${category}] ${msg}`);
    }
  }
};
// ──────────────────────────────────────────────────────────────────────────

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
    this.targetVelocity = { vx: 0, vy: 0 };
    this.acceleration = { ax: 0, ay: 0 };

    // Stats (scale with depth - every 3 rooms, 5% increase)
    const depthMultiplier = 1 + (Math.floor(depth / 3) * 0.05);
    this.hp = Math.ceil(this.data.hp * depthMultiplier);
    this.maxHp = this.hp;
    this.speed = this.data.speed;
    this.accelRate = this.data.acceleration || PHYSICS.ENEMY_ACCELERATION;
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
    this.navigationLength = GRID.CELL_SIZE * 6; // Vector length for pathfinding around walls
    this.visionLength = GRID.CELL_SIZE * 8; // Longer vector for vision checks (can see further)
    this.rotationIncrement = 1; // Degrees to rotate when checking for clear path
    this.currentDirection = { x: 0, y: 0 }; // Cached movement direction
    this.stuckTimer = 0; // Track how long we've been stuck
    this.lastPosition = { x, y }; // For stuck detection
    this.lastDistToTarget = null; // For progress-based stuck detection
    this.navDirection = 0; // Persistent rotation preference: 1=CCW, -1=CW, 0=undecided
    this.navDirectionFlipTimer = 0; // Accumulates when paths fail; flips navDirection when large

    // Node-based pathfinding
    this.pathNodes = []; // Computed waypoints around obstacles
    this.currentNodeIndex = 0;

    // Memory-based aggro
    this.lastKnownPosition = null; // Last known player position
    this.aggroMemoryActive = false; // Whether pursuing a memory mark
    this.memoryMoveDelayTimer = 0; // Delay before moving to memory mark after losing sight
    this.memoryMoveDelay = 1.0; // 1 second delay before chasing memory
    this.detectionIndicatorTimer = 0; // Show yellow ! when detecting/reacquiring player
    this.detectionIndicatorDuration = 1.0; // Show detection indicator for 1 second
    this.hadVisualContact = false; // Set true on first real sighting; gates proximity-only re-aggro
    this.memoryMarkPlane = 0;  // Plane player was on when memory mark was created
    this.memoryStaleTimer = 2.0; // Countdown (sec) before a cross-plane-stale mark expires

    // Unified AI decision-making (intelligence system)
    this.decisionInterval = this.data.decisionInterval || 0.5; // How often to reassess (smarter = lower)
    this.decisionTimer = Math.random() * this.decisionInterval; // Time until next decision (randomized start)
    this.bruteForceTimer = 0; // Cooldown after applying 45° brute force (prevents immediate recalc)
    this.lastBruteForceAngle = null; // Track last forced angle to avoid repeating

    // Debug tracking
    this._debugId = _enemyDebugIdCounter++;
    this._lastPathRecalcTime = null; // performance.now() at last updateVectorNavigation recalc
    this._prevState = 'idle'; // for detecting state transitions
    this._zeroNodeCount = 0; // consecutive 0-node computeNodePath results

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
    this.sapSlot = -1; // Which sap slot this bat occupies on the target (0, 1, or 2)

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

    // Blend velocity toward targetVelocity (smooth accel/decel, skipped during knockback)
    if (!this.isKnockedBack()) {
      this._blendVelocity(deltaTime);
    }

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

    // Gate all detection and range conditions on plane membership.
    // If the player is on a different plane and this enemy isn't already in pursuit
    // (enraged or memory-active), treat the player as infinitely far away so that
    // no new aggro, memory marks, or movement toward the player can occur cross-plane.
    const effectiveDistance = (inSamePlane(this, this.target) || this.enraged || this.aggroMemoryActive)
      ? distance
      : Infinity;

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
      this.targetVelocity.vx = 0;
      this.targetVelocity.vy = 0;
      this.state = 'idle';
      return { dotDamage: dotDamageEvents };
    }

    // Stun overrides all AI
    if (this.isStunned()) {
      this.targetVelocity.vx = 0;
      this.targetVelocity.vy = 0;
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
      this.targetVelocity.vx = 0;
      this.targetVelocity.vy = 0;

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

    // ── Rest state: dormant until player enters close proximity ─────────────
    if (this.state === 'rest') {
      this.targetVelocity = { vx: 0, vy: 0 };
      if (!inSamePlane(this, this.target)) return { dotDamage: dotDamageEvents };
      const REST_WAKE_RADIUS = GRID.CELL_SIZE * 4;
      if (distance < REST_WAKE_RADIUS) {
        this.state = 'chase';
        this.enraged = true;
      } else {
        return { dotDamage: dotDamageEvents };
      }
    }

    let speedMultiplier = this.getSpeedMultiplier();
    if (inSteam) speedMultiplier *= 0.6; // Steam slows enemies (cautious movement)

    // Update AI decision timer
    this.decisionTimer -= deltaTime;

    // Bug 17 fix (part 2): expire memory marks that become stale when the player switches planes.
    // If the mark was created while the player was on planeX, and the player later moves to planeY,
    // the mark is unreachable — expire it after a short window so the enemy stops hunting the wrong plane.
    if (this.aggroMemoryActive && this.lastKnownPosition && this.target) {
      if (this.target.plane !== this.memoryMarkPlane) {
        this.memoryStaleTimer -= deltaTime;
        if (this.memoryStaleTimer <= 0) {
          EnemyDebug.log(this, 'MEMORY', 'Memory mark expired — player switched planes (stale)', {
            memoryMarkPlane: this.memoryMarkPlane,
            playerPlane: this.target.plane
          });
          this.aggroMemoryActive = false;
          this.lastKnownPosition = null;
          this.memoryMoveDelayTimer = 0;
          this.memoryStaleTimer = 2.0;
          this.state = 'idle';
          this.enraged = false;
        }
      } else {
        // Player still on the marked plane — keep the stale window fresh
        this.memoryStaleTimer = 2.0;
      }
    }

    // AI behavior - only engage within aggro range (unless enraged or has memory)
    if (effectiveDistance > this.aggroRange && !this.enraged) {
      // Player left aggro range - activate memory mode if we have a last known position
      if (this.lastKnownPosition && !this.aggroMemoryActive) {
        EnemyDebug.log(this, 'MEMORY', 'Activating memory mode — player left aggro range', {
          distToPlayer: distance.toFixed(1),
          aggroRange: this.aggroRange,
          memoryMark: { x: this.lastKnownPosition.x.toFixed(1), y: this.lastKnownPosition.y.toFixed(1) }
        });
        this.aggroMemoryActive = true;
        this.memoryMoveDelayTimer = this.memoryMoveDelay; // Start delay timer
        this.memoryMarkPlane = this.plane; // Track enemy's plane so stale timer fires if player goes underground
        this.memoryStaleTimer = 2.0;
        // Reset cached direction to force immediate recalculation towards memory mark
        this.currentDirection = { x: 0, y: 0 };

        // Share memory mark with all packmates (pack communication)
        if (this.packmates && this.packmates.length > 0) {
          for (const mate of this.packmates) {
            mate.target = this.target; // Share player target
            mate.lastKnownPosition = { x: this.lastKnownPosition.x, y: this.lastKnownPosition.y };
            mate.aggroMemoryActive = true;
            mate.memoryMoveDelayTimer = this.memoryMoveDelay;
            mate.memoryMarkPlane = this.memoryMarkPlane;
            mate.memoryStaleTimer = 2.0;
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
              EnemyDebug.log(this, 'MEMORY', 'Reacquired player — exiting memory mode', {
                distToPlayer: distance.toFixed(1)
              });
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
            this.targetVelocity.vx = 0;
            this.targetVelocity.vy = 0;
            this.state = 'chase';
          } else {
            // Delay elapsed - start moving

            // Reached memory mark - end aggro for self and packmates
            if (memDistance < GRID.CELL_SIZE) {
              EnemyDebug.log(this, 'MEMORY', 'Reached memory mark — giving up chase (out-of-range branch)', {
                distToPlayer: distance.toFixed(1),
                memDistance: memDistance.toFixed(1)
              });
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
                this.targetVelocity.vx = dirX * this.speed * speedMultiplier;
                this.targetVelocity.vy = dirY * this.speed * speedMultiplier;
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
          const hasWaterAffinity = this.data.waterAffinity === true;
          let chosenAngle = Math.random() * Math.PI * 2;

          if (this.backgroundObjects && this.backgroundObjects.length > 0) {
            if (!hasWaterAffinity) {
              // Avoid wandering into water or puddles - try up to 8 candidate directions
              for (let attempt = 0; attempt < 8; attempt++) {
                const testAngle = Math.random() * Math.PI * 2;
                const lookDist = this.wanderSpeed * 0.5;
                const testX = this.position.x + Math.cos(testAngle) * lookDist;
                const testY = this.position.y + Math.sin(testAngle) * lookDist;
                const wouldHitWater = this.backgroundObjects.some(obj =>
                  (obj.char === '=' || obj.char === '~') &&
                  Math.abs(obj.position.x - testX) < GRID.CELL_SIZE &&
                  Math.abs(obj.position.y - testY) < GRID.CELL_SIZE
                );
                if (!wouldHitWater) {
                  chosenAngle = testAngle;
                  break;
                }
              }
            } else {
              // Water-affinity: drift toward nearest water tile 60% of the time
              let nearestWaterAngle = null;
              let nearestWaterDist = Infinity;
              for (const obj of this.backgroundObjects) {
                if (obj.char === '=' || obj.char === '~') {
                  const wdx = obj.position.x - this.position.x;
                  const wdy = obj.position.y - this.position.y;
                  const wDist = Math.sqrt(wdx * wdx + wdy * wdy);
                  if (wDist < nearestWaterDist) {
                    nearestWaterDist = wDist;
                    nearestWaterAngle = Math.atan2(wdy, wdx);
                  }
                }
              }
              if (nearestWaterAngle !== null && nearestWaterDist < GRID.CELL_SIZE * 12 && Math.random() < 0.6) {
                // Drift toward water with slight variance
                chosenAngle = nearestWaterAngle + (Math.random() - 0.5) * Math.PI * 0.4;
              }
            }
          }

          this.wanderDirection.x = Math.cos(chosenAngle);
          this.wanderDirection.y = Math.sin(chosenAngle);
          // Change direction every 2-4 seconds
          this.wanderTimer = 2 + Math.random() * 2;
        }

        // Move in wander direction
        this.targetVelocity.vx = this.wanderDirection.x * this.wanderSpeed * speedMultiplier;
        this.targetVelocity.vy = this.wanderDirection.y * this.wanderSpeed * speedMultiplier;
      }
    } else if (this.state === 'windup') {
      // Stay still during windup
      this.targetVelocity.vx = 0;
      this.targetVelocity.vy = 0;
    } else if (this.attackType === 'melee' && effectiveDistance < this.attackRange && this.attackTimer > 0 && (this.enraged || effectiveDistance <= this.aggroRange)) {
      // Player is inside melee AOE range while on cooldown — back away so the next
      // attack hits. The enemy retreats until it reaches its natural attack distance.
      this.state = 'chase';
      const dirX = dx / distance;
      const dirY = dy / distance;
      this.targetVelocity.vx = -dirX * this.speed * speedMultiplier;
      this.targetVelocity.vy = -dirY * this.speed * speedMultiplier;
    } else if (effectiveDistance <= this.attackRange && this.attackTimer <= 0) {
      // CRITICAL: Can only attack if aggro'd (enraged) OR within aggro range
      const isAggrod = this.enraged || effectiveDistance <= this.aggroRange;

      if (isAggrod) {
        // In range and aggro'd - check vision before attacking
        const canSeeTarget = this.hasVision(this.position, this.target.position, effectiveVisionLength);

        if (canSeeTarget && this.state !== 'windup' && this.state !== 'attack') {
          this.state = 'windup';
          this.windupTimer = this.attackWindup;
          // Snapshot target position at windup start so attacks aim at where
          // the player WAS, not where they are when the windup completes.
          this.markedTargetPosition = { x: this.target.position.x, y: this.target.position.y };
          this.targetVelocity.vx = 0;
          this.targetVelocity.vy = 0;
        } else if (!canSeeTarget) {
          // Can't see target (wrong plane or obstructed) - go into memory/chase mode
          // Let the chase logic below handle it
          // Do nothing here, fall through to chase condition
        }
      }
      // If not aggro'd, don't attack - fall through to other behaviors
    } else if ((effectiveDistance > this.attackRange && effectiveDistance <= this.aggroRange) || (this.enraged && effectiveDistance > this.attackRange)) {
      // Within aggro range OR enraged and outside attack range
      // But first check if we're on the same plane - can't chase across planes unless already enraged/memory
      const onSamePlane = inSamePlane(this, this.target);
      const canChase = onSamePlane || this.enraged || this.aggroMemoryActive;
      // Hoisted so it's in scope for the memory-vs-direct-chase branch below
      const canSeePlayer = canChase && this.hasVision(this.position, this.target.position, effectiveVisionLength);

      if (!canChase) {
        // Different plane and not already chasing - remain idle
        this.state = 'idle';
      } else {
        // Can chase - either same plane, or already aggro'd/memory from before
        const wasIdle = this.state === 'idle';
        const wasInMemoryMode = this.aggroMemoryActive;
        this.state = 'chase';

        if (canSeePlayer) {
          // Vision is clear - update last known position and deactivate memory
          this.lastKnownPosition = { x: this.target.position.x, y: this.target.position.y };

          // Check if this is a NEW detection (transition from not detecting to detecting)
          const isNewDetection = this.detectionIndicatorTimer <= 0;

          if (isNewDetection) {
            EnemyDebug.log(this, 'AGGRO', 'New detection — player spotted in aggro range', {
              distToPlayer: distance.toFixed(1),
              aggroRange: this.aggroRange,
              enraged: this.enraged
            });
          }

          this.hadVisualContact = true; // confirmed sighting — enable vision-only re-aggro
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
            EnemyDebug.log(this, 'MEMORY', 'Lost vision — activating memory mode (in-range branch)', {
              distToPlayer: distance.toFixed(1),
              aggroRange: this.aggroRange,
              memoryMark: { x: this.target.position.x.toFixed(1), y: this.target.position.y.toFixed(1) }
            });
            // TRANSITION: Just lost vision — place the mark at the player's current position.
            // For same-plane disappearances (wall, tall grass) this is just where they hid.
            // For plane-switch disappearances (tunnel entrance) this lands just past the
            // threshold on the player's side, so the enemy navigates through the entrance
            // rather than stopping at it.  effectiveDistance already prevents non-pursuing
            // enemies from reacting cross-plane, making this safe.
            this.lastKnownPosition = { x: this.target.position.x, y: this.target.position.y };
            // Track the player's plane at mark creation so the stale timer only fires
            // if the player subsequently changes planes (not while enemy is crossing).
            this.memoryMarkPlane = this.target.plane;
            this.memoryStaleTimer = 2.0;

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
                mate.memoryMarkPlane = this.memoryMarkPlane;
                mate.memoryStaleTimer = 2.0;
                mate.currentDirection = { x: 0, y: 0 };
                mate.enraged = true; // Pack member becomes enraged when pack detects player
                mate.state = 'chase'; // Ensure chase state is set
              }
            }
          }
          // If already in memory mode, do nothing here - keep pursuing the existing memory mark
          else if (!this.lastKnownPosition && !this.hadVisualContact) {
            // Never had vision of player (spawned blind behind a wall) — sense by proximity only.
            // Guarded by hadVisualContact: once an enemy has actually seen the player it must
            // re-acquire through vision, not proximity, to prevent oscillation after reaching
            // a stale memory mark and immediately setting a new one at the player's current spot.
            if (distance <= this.aggroRange && inSamePlane(this, this.target)) {
              const closeRange = GRID.CELL_SIZE * 3;
              if (this.isTargetInTallGrass() && distance > closeRange) {
                // Player is hidden in tall grass — idle enemies can't detect by proximity alone.
                // Exception: within close range the player is too near to hide (can't conceal yourself
                // from something standing right next to you).
                this.state = 'idle';
              } else {
                this.lastKnownPosition = { x: this.target.position.x, y: this.target.position.y };
                this.aggroMemoryActive = true;
                this.memoryMoveDelayTimer = this.memoryMoveDelay; // Start delay timer
                this.memoryMarkPlane = this.plane;
                this.memoryStaleTimer = 2.0;
                // Reset cached direction to force immediate recalculation towards memory mark
                this.currentDirection = { x: 0, y: 0 };
              }
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
          this.targetVelocity.vx = 0;
          this.targetVelocity.vy = 0;
          this.state = 'chase';
        } else {
          // Delay elapsed - start moving

          // Reached memory mark but player still hidden - give up for self and packmates
          if (memDistance < GRID.CELL_SIZE) {
            this.aggroMemoryActive = false;
            this.lastKnownPosition = null;
            this.memoryMoveDelayTimer = 0;
            this.state = 'idle';
            this.targetVelocity.vx = 0;
            this.targetVelocity.vy = 0;
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
              this.targetVelocity.vx = dirX * this.speed * speedMultiplier;
              this.targetVelocity.vy = dirY * this.speed * speedMultiplier;
            }
          }
        }
      } else if (canSeePlayer) {
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
                this.targetVelocity.vx = dirX * this.speed * speedMultiplier;
                this.targetVelocity.vy = dirY * this.speed * speedMultiplier;
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
              this.targetVelocity.vx = dirX * this.speed * speedMultiplier * 1.5; // Fast rush
              this.targetVelocity.vy = dirY * this.speed * speedMultiplier * 1.5;
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
              this.targetVelocity.vx = packMovement.vx;
              this.targetVelocity.vy = packMovement.vy;

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
              this.targetVelocity.vx = dirX * this.speed * speedMultiplier;
              this.targetVelocity.vy = dirY * this.speed * speedMultiplier;
            }
          }
        }
      } else {
        // In aggro range but can't see player and no memory mark — stop and wait
        this.state = 'idle';
        this.targetVelocity.vx = 0;
        this.targetVelocity.vy = 0;
      } // Close the canChase else block
    } // Close the aggro range else if block
    else {
      // Between attack range and aggro range, but conditions not met
      this.state = 'idle';
      this.targetVelocity.vx = 0;
      this.targetVelocity.vy = 0;
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

    // State transition logging (only fires when state actually changes)
    if (this.state !== this._prevState) {
      EnemyDebug.log(this, 'STATE', `${this._prevState} → ${this.state}`, {
        distToPlayer: distance.toFixed(1),
        aggroMemoryActive: this.aggroMemoryActive,
        enraged: this.enraged,
        memoryMark: this.lastKnownPosition
          ? { x: this.lastKnownPosition.x.toFixed(1), y: this.lastKnownPosition.y.toFixed(1) }
          : null
      });
      this._prevState = this.state;
    }

    return { dotDamage: dotDamageEvents, justAggrod };
  }

  /**
   * Smoothly blends velocity toward targetVelocity at this.accelRate px/s².
   * Called once per update() when not knocked back.
   */
  _blendVelocity(deltaTime) {
    const dvx = this.targetVelocity.vx - this.velocity.vx;
    const dvy = this.targetVelocity.vy - this.velocity.vy;
    const mag = Math.sqrt(dvx * dvx + dvy * dvy);
    if (mag < 0.5) {
      this.velocity.vx = this.targetVelocity.vx;
      this.velocity.vy = this.targetVelocity.vy;
      return;
    }
    const step = Math.min(this.accelRate * deltaTime, mag);
    this.velocity.vx += (dvx / mag) * step;
    this.velocity.vy += (dvy / mag) * step;
  }

  /**
   * Vector-based navigation system with decision-based throttling
   * Projects a vector toward target and rotates when encountering obstacles
   * Recalculates based on enemy intelligence (decisionTimer) or when stuck
   */
  updateVectorNavigation(speedMultiplier, targetOverride = null, deltaTime = 0.016) {
    if (!this.collisionMap) return;

    const target = targetOverride || (this.target ? this.target.position : null);
    if (!target) return;

    // Update path-recompute cooldown
    if (this.bruteForceTimer > 0) {
      this.bruteForceTimer -= deltaTime;
      if (this.bruteForceTimer < 0) this.bruteForceTimer = 0;
    }

    // === FOLLOW ACTIVE PATH NODES ===
    if (this.pathNodes.length > 0 && this.currentNodeIndex < this.pathNodes.length) {
      const node = this.pathNodes[this.currentNodeIndex];
      const nodeDx = node.x - this.position.x;
      const nodeDy = node.y - this.position.y;
      const nodeDist = Math.sqrt(nodeDx * nodeDx + nodeDy * nodeDy);

      // Stuck detection while following a node: measure progress toward the CURRENT NODE
      // (not target — the path may go sideways/backward to navigate around an obstacle).
      const PROGRESS_THRESHOLD = 3.0; // px/s of closing on the waypoint
      if (this.lastDistToTarget !== null) {
        const progressRate = (this.lastDistToTarget - nodeDist) / Math.max(deltaTime, 0.001);
        if (progressRate < PROGRESS_THRESHOLD) {
          this.stuckTimer += deltaTime;
        } else {
          this.stuckTimer = 0;
        }
      }
      this.lastDistToTarget = nodeDist;

      if (nodeDist < GRID.CELL_SIZE * 0.8) {
        // Reached waypoint — advance to next
        this.currentNodeIndex++;
        this.stuckTimer = 0;
        this.lastDistToTarget = null;
      } else {
        this.targetVelocity.vx = (nodeDx / nodeDist) * this.speed * speedMultiplier;
        this.targetVelocity.vy = (nodeDy / nodeDist) * this.speed * speedMultiplier;

        // Still stuck while following waypoint — invalidate path and recompute
        if (this.stuckTimer > 0.5 && this.bruteForceTimer <= 0) {
          this.pathNodes = [];
          this.currentNodeIndex = 0;
          this.stuckTimer = 0;
          this.lastDistToTarget = null;
          // Fall through to recalculation below
        } else {
          return;
        }
      }
    }

    // === DIRECT NAVIGATION stuck detection ===
    // Direction-alignment: stuck = trying to move but actual displacement diverges from intent.
    // Progress-toward-target was a false positive when chasing a fleeing player in open space.
    {
      const posDx = this.position.x - this.lastPosition.x;
      const posDy = this.position.y - this.lastPosition.y;
      const tvx = this.targetVelocity.vx;
      const tvy = this.targetVelocity.vy;
      const targetSpd = Math.sqrt(tvx * tvx + tvy * tvy);
      if (targetSpd > 5) {
        const actualSpd = Math.sqrt(posDx * posDx + posDy * posDy) / Math.max(deltaTime, 0.001);
        // Dot product of actual vs intended direction; -1 when not moving at all
        const dot = actualSpd > 0.1
          ? ((posDx / Math.max(deltaTime, 0.001)) * tvx + (posDy / Math.max(deltaTime, 0.001)) * tvy) / (actualSpd * targetSpd)
          : -1;
        if (dot < 0.3 || actualSpd < targetSpd * 0.15) {
          this.stuckTimer += deltaTime;
        } else {
          this.stuckTimer = 0;
        }
      } else {
        this.stuckTimer = 0;
      }
    }
    this.lastPosition = { x: this.position.x, y: this.position.y };

    // === DIRECT NAVIGATION (no active path nodes) ===
    const isPursuingStaticMark = this.aggroMemoryActive && this.lastKnownPosition;

    let currentPathObstructed = false;
    if (this.currentDirection.x !== 0 || this.currentDirection.y !== 0) {
      // Cap the test distance to actual target distance — avoids false positives when
      // the target is nearby and the extended vector overshoots into a wall behind it.
      const tDx = target.x - this.position.x;
      const tDy = target.y - this.position.y;
      const distToTarget = Math.sqrt(tDx * tDx + tDy * tDy);
      const testDist = Math.min(this.navigationLength, distToTarget);
      const testPoint = {
        x: this.position.x + this.currentDirection.x * testDist,
        y: this.position.y + this.currentDirection.y * testDist
      };
      currentPathObstructed = !this.hasLineOfSight(this.position, testPoint, testDist);
    }

    const needsRecalc = this.bruteForceTimer <= 0 && (
      (!isPursuingStaticMark && this.decisionTimer <= 0) ||
      this.stuckTimer > 0.3 ||
      (this.currentDirection.x === 0 && this.currentDirection.y === 0) ||
      currentPathObstructed
    );

    if (needsRecalc) {
      const dx = target.x - this.position.x;
      const dy = target.y - this.position.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance === 0) return;

      // --- Debug: log what triggered this recalc and key distances ---
      if (window.ENEMY_AI_DEBUG) {
        const timeSinceLast = this._lastPathRecalcTime !== null
          ? (performance.now() - this._lastPathRecalcTime).toFixed(0) + 'ms'
          : 'first';
        const isMemoryTarget = isPursuingStaticMark;
        const distToActualPlayer = this.target
          ? Math.sqrt(
              (this.target.position.x - this.position.x) ** 2 +
              (this.target.position.y - this.position.y) ** 2
            ).toFixed(1)
          : 'n/a';
        const triggerReasons = [];
        if (!isPursuingStaticMark && this.decisionTimer <= 0) triggerReasons.push('decisionTimer');
        if (this.stuckTimer > 0.3) triggerReasons.push(`stuck(${this.stuckTimer.toFixed(2)}s)`);
        if (this.currentDirection.x === 0 && this.currentDirection.y === 0) triggerReasons.push('noDir');
        if (currentPathObstructed) triggerReasons.push('obstructed');
        EnemyDebug.log(this, 'PATH', `Recalculating — triggered by [${triggerReasons.join(', ')}]`, {
          targetType: isMemoryTarget ? 'MEMORY_MARK' : 'PLAYER',
          distToTarget: distance.toFixed(1),
          distToActualPlayer,
          timeSinceLast,
          stuckTimer: this.stuckTimer.toFixed(2),
          decisionTimer: this.decisionTimer.toFixed(3)
        });
        this._lastPathRecalcTime = performance.now();
      }
      // ---

      const angle = Math.atan2(dy, dx);
      let foundDirection = false;

      if (distance < this.navigationLength * 0.5 && !this.stuckTimer > 0.3) {
        // Target is very close — head directly toward it rather than letting the rotation
        // search pick a 96px test point that may point away from a nearby mark.
        this.currentDirection.x = dx / distance;
        this.currentDirection.y = dy / distance;
        foundDirection = true;
        this.pathNodes = [];
        EnemyDebug.log(this, 'PATH', 'Close target — heading direct');
      } else if (this.hasLineOfSight(this.position, target, this.navigationLength) && this.stuckTimer <= 0.3) {
        // Direct path clear and not stuck — aim straight at target
        this.currentDirection.x = dx / distance;
        this.currentDirection.y = dy / distance;
        foundDirection = true;
        this.pathNodes = [];
        EnemyDebug.log(this, 'PATH', 'Direct path clear — heading straight');
      } else if (this.stuckTimer > 0.3) {
        // Stuck against an obstacle — build a node path curving around it.
        // Allow the fallback direction only after the flip timer has run long enough.
        this.navDirectionFlipTimer += this.stuckTimer;
        const allowFlip = this.navDirectionFlipTimer > 6.0;
        if (allowFlip) this.navDirectionFlipTimer = 0;
        this.computeNodePath(target, allowFlip);
        this.stuckTimer = 0;
        EnemyDebug.log(this, 'PATH', `Node path computed — ${this.pathNodes.length} nodes, allowFlip=${allowFlip}`);
        if (this.pathNodes.length > 0) {
          this._zeroNodeCount = 0;
          this.bruteForceTimer = 2.5;
          const fn = this.pathNodes[0];
          const fnDx = fn.x - this.position.x;
          const fnDy = fn.y - this.position.y;
          const fnDist = Math.sqrt(fnDx * fnDx + fnDy * fnDy);
          if (fnDist > 0) {
            this.targetVelocity.vx = (fnDx / fnDist) * this.speed * speedMultiplier;
            this.targetVelocity.vy = (fnDy / fnDist) * this.speed * speedMultiplier;
          }
        } else {
          // Completely boxed in — no path found around the obstacle.
          this._zeroNodeCount = (this._zeroNodeCount || 0) + 1;
          if (this._zeroNodeCount >= 3 && this.aggroMemoryActive) {
            // Give up on the unreachable memory mark rather than looping forever.
            EnemyDebug.log(this, 'PATH', `Abandoning memory mark — boxed in ${this._zeroNodeCount}x`);
            this.aggroMemoryActive = false;
            this.lastKnownPosition = null;
            this.enraged = false;
            this.state = 'idle';
            this._zeroNodeCount = 0;
            this.bruteForceTimer = 1.0;
            return;
          }
          // Random escape direction — break out of the corner
          const escapeAngle = Math.random() * Math.PI * 2;
          this.currentDirection.x = Math.cos(escapeAngle);
          this.currentDirection.y = Math.sin(escapeAngle);
          this.bruteForceTimer = 1.0;
          EnemyDebug.log(this, 'PATH', `0-node boxed in — random escape (attempt #${this._zeroNodeCount})`);
        }
        return;
      } else {
        // Path obstructed, not stuck yet — fine rotation search
        const increment = this.rotationIncrement * (Math.PI / 180);
        for (let deg = increment; deg <= Math.PI; deg += increment) {
          for (const direction of [1, -1]) {
            const testAngle = angle + (deg * direction);
            const testTarget = {
              x: this.position.x + Math.cos(testAngle) * this.navigationLength,
              y: this.position.y + Math.sin(testAngle) * this.navigationLength
            };
            if (this.hasLineOfSight(this.position, testTarget, this.navigationLength)) {
              this.currentDirection.x = Math.cos(testAngle);
              this.currentDirection.y = Math.sin(testAngle);
              foundDirection = true;
              break;
            }
          }
          if (foundDirection) break;
        }
        if (!foundDirection) {
          EnemyDebug.log(this, 'PATH', 'No clear rotation found — forcing direct direction');
          this.currentDirection.x = dx / distance;
          this.currentDirection.y = dy / distance;
        } else {
          EnemyDebug.log(this, 'PATH', 'Rotation search found clear angle');
        }
      }

    }

    this.targetVelocity.vx = this.currentDirection.x * this.speed * speedMultiplier;
    this.targetVelocity.vy = this.currentDirection.y * this.speed * speedMultiplier;
  }

  /**
   * Build a chain of waypoints curving around an obstacle toward the target.
   * From each waypoint, checks direct visibility to target (early exit).
   * Locks in a rotation direction after the first clear vector for consistent curving.
   */
  /**
   * allowFlip: permit trying the opposite rotation direction if the preferred one
   * fails. Should only be true after the navDirectionFlipTimer threshold is met.
   */
  computeNodePath(targetPos, allowFlip = false) {
    this.pathNodes = [];
    this.currentNodeIndex = 0;

    const MAX_NODES = 8;
    // nodeStep scales with distance so nearby obstacles get tight waypoints and
    // distant ones get proportionally wider hops. Clamped to [CELL_SIZE, 3*CELL_SIZE].
    const totalDist = Math.sqrt(
      (targetPos.x - this.position.x) ** 2 + (targetPos.y - this.position.y) ** 2
    );
    const nodeStep = Math.max(GRID.CELL_SIZE, Math.min(totalDist / 5, GRID.CELL_SIZE * 3));
    let pos = { x: this.position.x, y: this.position.y };

    // If we have no persistent preference yet, pick a direction now and lock it.
    // It persists across calls until allowFlip permits a reversal.
    let lockedDir = this.navDirection !== 0 ? this.navDirection : 1;

    // If the path to the target is already clear, no nodes are needed.
    {
      const dx0 = targetPos.x - pos.x;
      const dy0 = targetPos.y - pos.y;
      const d0 = Math.sqrt(dx0 * dx0 + dy0 * dy0);
      if (d0 < GRID.CELL_SIZE || this.hasLineOfSight(pos, targetPos, d0)) return;
    }

    // === PHASE 1: Dodge-direction determination (no node placed) ===
    // Find the first clear angle away from the immediate wall face and advance pos
    // to that position. This separates "figuring out which way to go" from actual
    // node placement, so the first real node is always past the wall edge.
    {
      const dx0 = targetPos.x - pos.x;
      const dy0 = targetPos.y - pos.y;
      const baseAngle0 = Math.atan2(dy0, dx0);
      const inc = Math.PI / 180;
      const dirsToTry0 = allowFlip ? [lockedDir, -lockedDir] : [lockedDir];
      let foundAngle0 = null;

      outerPhase1: for (const dir of dirsToTry0) {
        for (let deg = 1; deg <= 180; deg++) {
          const testAngle = baseAngle0 + deg * inc * dir;
          const testEnd = {
            x: pos.x + Math.cos(testAngle) * nodeStep,
            y: pos.y + Math.sin(testAngle) * nodeStep
          };
          if (this.hasLineOfSight(pos, testEnd, nodeStep)) {
            foundAngle0 = testAngle;
            if (dir !== lockedDir) lockedDir = dir;
            break outerPhase1;
          }
        }
      }

      if (foundAngle0 === null) return; // completely boxed in — give up
      pos = {
        x: pos.x + Math.cos(foundAngle0) * nodeStep,
        y: pos.y + Math.sin(foundAngle0) * nodeStep
      };
      // pos is now the "dodge anchor" — first node placement begins from here
    }

    // === PHASE 2: Node placement ===
    for (let n = 0; n < MAX_NODES; n++) {
      const dx = targetPos.x - pos.x;
      const dy = targetPos.y - pos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < GRID.CELL_SIZE) break;

      // Can we see the target directly from here? Then this is the last node needed.
      if (this.hasLineOfSight(pos, targetPos, dist + GRID.CELL_SIZE)) {
        this.pathNodes.push({ x: pos.x, y: pos.y });
        break;
      }

      const baseAngle = Math.atan2(dy, dx);
      const inc = Math.PI / 180;
      let foundAngle = null;

      // Always try the committed direction first; only offer opposite if allowFlip.
      const dirsToTry = allowFlip ? [lockedDir, -lockedDir] : [lockedDir];

      outerLoop: for (const dir of dirsToTry) {
        for (let deg = 1; deg <= 180; deg++) {
          const testAngle = baseAngle + deg * inc * dir;
          const testEnd = {
            x: pos.x + Math.cos(testAngle) * nodeStep,
            y: pos.y + Math.sin(testAngle) * nodeStep
          };
          if (this.hasLineOfSight(pos, testEnd, nodeStep)) {
            foundAngle = testAngle;
            if (dir !== lockedDir) lockedDir = dir;
            break outerLoop;
          }
        }
      }

      if (foundAngle === null) break;

      pos = {
        x: pos.x + Math.cos(foundAngle) * nodeStep,
        y: pos.y + Math.sin(foundAngle) * nodeStep
      };
      this.pathNodes.push({ x: pos.x, y: pos.y });
    }

    // Post-pass: if the last placed node still can't see the target directly, try one
    // more hop so the enemy doesn't attempt to walk through the wall on final approach.
    if (this.pathNodes.length > 0) {
      const last = this.pathNodes[this.pathNodes.length - 1];
      const fdx = targetPos.x - last.x;
      const fdy = targetPos.y - last.y;
      const fdist = Math.sqrt(fdx * fdx + fdy * fdy);
      if (fdist > GRID.CELL_SIZE && !this.hasLineOfSight(last, targetPos, fdist)) {
        const baseAngle = Math.atan2(fdy, fdx);
        const inc = Math.PI / 180;
        for (let deg = 1; deg <= 180; deg++) {
          const testAngle = baseAngle + deg * inc * lockedDir;
          const testEnd = {
            x: last.x + Math.cos(testAngle) * nodeStep,
            y: last.y + Math.sin(testAngle) * nodeStep
          };
          if (this.hasLineOfSight(last, testEnd, nodeStep)) {
            this.pathNodes.push({ x: testEnd.x, y: testEnd.y });
            break;
          }
        }
      }
    }

    // Persist the direction used (or chosen) so the next call starts from the same side.
    this.navDirection = lockedDir;
  }

  /**
   * Check if there's a clear line of sight along a vector
   * Uses ray casting to detect collisions
   */
  hasLineOfSight(start, end, maxLength) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance === 0) return true;
    const checkDist = Math.min(distance, maxLength);

    const nx = dx / distance;
    const ny = dy / distance;
    const C = GRID.CELL_SIZE;

    // DDA grid traversal — steps to every grid-line crossing so no cell is skipped,
    // including the diagonal-corner case where uniform sampling misses wall corners.
    let gx = Math.floor(start.x / C);
    let gy = Math.floor(start.y / C);

    const stepX = nx >= 0 ? 1 : -1;
    const stepY = ny >= 0 ? 1 : -1;

    // Distance along the ray to the first vertical / horizontal boundary
    const firstBoundX = nx >= 0 ? (gx + 1) * C : gx * C;
    const firstBoundY = ny >= 0 ? (gy + 1) * C : gy * C;
    let tMaxX = nx !== 0 ? Math.abs((firstBoundX - start.x) / nx) : Infinity;
    let tMaxY = ny !== 0 ? Math.abs((firstBoundY - start.y) / ny) : Infinity;
    const tDeltaX = nx !== 0 ? Math.abs(C / nx) : Infinity;
    const tDeltaY = ny !== 0 ? Math.abs(C / ny) : Infinity;

    // Check each cell the ray enters until checkDist is reached
    for (let safety = 0; safety < 128; safety++) {
      if (gx < 0 || gx >= GRID.COLS || gy < 0 || gy >= GRID.ROWS) return false;
      if (this.collisionMap[gy][gx]) return false;

      const tNext = Math.min(tMaxX, tMaxY);
      if (tNext >= checkDist) break; // Reached the end without hitting anything

      const EPS = 1e-6;
      if (Math.abs(tMaxX - tMaxY) < EPS) {
        // Exact corner: ray hits two cell boundaries simultaneously.
        // Check all three newly entered cells to avoid the diagonal-corner miss.
        const cx = gx + stepX, cy = gy + stepY;
        if (cx < 0 || cx >= GRID.COLS || cy < 0 || cy >= GRID.ROWS) return false;
        // Cross cell
        if (this.collisionMap[gy][cx]) return false;
        if (this.collisionMap[cy][gx]) return false;
        tMaxX += tDeltaX;
        tMaxY += tDeltaY;
        gx = cx;
        gy = cy;
      } else if (tMaxX < tMaxY) {
        tMaxX += tDeltaX;
        gx += stepX;
      } else {
        tMaxY += tDeltaY;
        gy += stepY;
      }
    }

    return true;
  }

  /**
   * Find where line of sight is blocked (for visualization)
   * Returns the point where vision is obstructed, or the end point if clear
   */
  getVisionObstructionPoint(start, end, maxLength) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance === 0) return { x: end.x, y: end.y, blocked: false };
    const checkDist = Math.min(distance, maxLength);

    // Too far to see — return point at vision limit
    if (distance > maxLength) {
      const angle = Math.atan2(dy, dx);
      return {
        x: start.x + Math.cos(angle) * maxLength,
        y: start.y + Math.sin(angle) * maxLength,
        blocked: true
      };
    }

    // DDA traversal (same as hasLineOfSight) for accurate obstruction point.
    const nx = dx / distance;
    const ny = dy / distance;
    const C = GRID.CELL_SIZE;

    let gx = Math.floor(start.x / C);
    let gy = Math.floor(start.y / C);
    const stepX = nx >= 0 ? 1 : -1;
    const stepY = ny >= 0 ? 1 : -1;

    const firstBoundX = nx >= 0 ? (gx + 1) * C : gx * C;
    const firstBoundY = ny >= 0 ? (gy + 1) * C : gy * C;
    let tMaxX = nx !== 0 ? Math.abs((firstBoundX - start.x) / nx) : Infinity;
    let tMaxY = ny !== 0 ? Math.abs((firstBoundY - start.y) / ny) : Infinity;
    const tDeltaX = nx !== 0 ? Math.abs(C / nx) : Infinity;
    const tDeltaY = ny !== 0 ? Math.abs(C / ny) : Infinity;

    const isBlocked = (cgx, cgy) => {
      if (cgx < 0 || cgx >= GRID.COLS || cgy < 0 || cgy >= GRID.ROWS) return true;
      if (this.collisionMap && this.collisionMap[cgy][cgx]) return true;
      if (this.backgroundObjects) {
        for (const obj of this.backgroundObjects) {
          if (obj.destroyed) continue;
          if (Math.floor(obj.position.x / C) === cgx && Math.floor(obj.position.y / C) === cgy) {
            if (obj.bulletInteraction === 'block' ||
                obj.bulletInteraction === 'interact-preserve' ||
                obj.bulletInteraction === 'interact-destroy') return true;
          }
        }
      }
      return false;
    };

    for (let safety = 0; safety < 128; safety++) {
      if (isBlocked(gx, gy)) {
        return { x: start.x + nx * Math.min(tMaxX, tMaxY), y: start.y + ny * Math.min(tMaxX, tMaxY), blocked: true };
      }

      const tNext = Math.min(tMaxX, tMaxY);
      if (tNext >= checkDist) break;

      const EPS = 1e-6;
      if (Math.abs(tMaxX - tMaxY) < EPS) {
        const cx = gx + stepX, cy = gy + stepY;
        if (isBlocked(cx, gy)) return { x: start.x + nx * tMaxX, y: start.y + ny * tMaxX, blocked: true };
        if (isBlocked(gx, cy)) return { x: start.x + nx * tMaxY, y: start.y + ny * tMaxY, blocked: true };
        tMaxX += tDeltaX; tMaxY += tDeltaY;
        gx = cx; gy = cy;
      } else if (tMaxX < tMaxY) {
        tMaxX += tDeltaX; gx += stepX;
      } else {
        tMaxY += tDeltaY; gy += stepY;
      }
    }

    return { x: end.x, y: end.y, blocked: false };
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
              // Grass doesn't block vision at close range — enemy can sense nearby player.
              // 3-cell threshold: you can't hide from something standing right next to you.
              if (distance > GRID.CELL_SIZE * 3) return false;
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

  /**
   * Returns true if the target (player) is currently overlapping a tall grass tile.
   * Used to suppress idle proximity detection — grass conceals the player from unaware enemies.
   */
  isTargetInTallGrass() {
    if (!this.target || !this.backgroundObjects) return false;
    const px = Math.floor(this.target.position.x / GRID.CELL_SIZE);
    const py = Math.floor(this.target.position.y / GRID.CELL_SIZE);
    for (const obj of this.backgroundObjects) {
      if (obj.destroyed || obj.char !== '|') continue;
      if (Math.floor(obj.position.x / GRID.CELL_SIZE) === px &&
          Math.floor(obj.position.y / GRID.CELL_SIZE) === py) {
        return true;
      }
    }
    return false;
  }

  canAttack() {
    // Blind enemies can still attack, but will miss (damage set to 0 in createAttack)

    // Sap attacks can start when within range, not already sapping, and target has room for another bat
    if (this.attackType === 'sap') {
      const targetFull = (this.target?.activeSappingBats?.length ?? 0) >= 3;
      return !this.sapping && !targetFull && this.state === 'attack' && this.attackTimer <= 0 && this.windupTimer <= 0;
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
    const aimPos = this.markedTargetPosition || this.target.position;
    const dx = aimPos.x - this.position.x;
    const dy = aimPos.y - this.position.y;
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

    const aimPos = this.markedTargetPosition || this.target.position;
    const dx = aimPos.x - this.position.x;
    const dy = aimPos.y - this.position.y;
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
    const aimPos = this.markedTargetPosition || this.target.position;
    const dx = aimPos.x - this.position.x;
    const dy = aimPos.y - this.position.y;
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
    const aimPos = this.markedTargetPosition || this.target.position;
    const dx = aimPos.x - this.position.x;
    const dy = aimPos.y - this.position.y;
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
    const aimPos = this.markedTargetPosition || this.target.position;
    const dx = aimPos.x - this.position.x;
    const dy = aimPos.y - this.position.y;
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
    const target = this.target;
    if (target?.activeSappingBats) {
      this.sapSlot = target.activeSappingBats.length; // 0, 1, or 2
      target.activeSappingBats.push(this);
    }
    this.sapping = true;
    this.sappingTarget = target;
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
    if (!this.sapping) return null;

    const total = this.sappingTarget?.activeSappingBats?.length || 1;
    const slot = this.sapSlot;

    let offsetX = 0;
    let offsetY = -GRID.CELL_SIZE;

    if (total === 2) {
      // Two bats: side by side  * *
      offsetX = (slot === 0) ? -GRID.CELL_SIZE : GRID.CELL_SIZE;
    } else if (total >= 3) {
      // Three bats: triangle  * *
      //                         *
      if (slot < 2) {
        offsetX = (slot === 0) ? -GRID.CELL_SIZE : GRID.CELL_SIZE;
      } else {
        offsetY = -GRID.CELL_SIZE * 2; // top center
      }
    }

    return { char: '*', color: '#ff0000', offsetX, offsetY };
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

    // Deregister from target's active sapping list
    if (this.sappingTarget.activeSappingBats) {
      const idx = this.sappingTarget.activeSappingBats.indexOf(this);
      if (idx !== -1) this.sappingTarget.activeSappingBats.splice(idx, 1);
    }

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
    this.sapSlot = -1;
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
