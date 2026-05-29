import { GRID, COLORS, PHYSICS } from '../game/GameConfig.js';
import { ENEMIES } from '../data/enemies.js';
import { Item } from './Item.js';
import { inSamePlane, planeOf, objectOnPlane } from '../systems/PlaneSystem.js';

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
    this.mass = this.data.mass ?? 1;
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
    this.facingAngle = Math.random() * Math.PI * 2; // Facing direction (radians), updated from velocity
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
    this.memoryMarkSuspected = false; // true = heard/felt (investigating); false = confirmed sighting
    this.memoryMoveDelayTimer = 0; // Delay before moving to memory mark after losing sight
    this.memoryMoveDelay = 1.0; // 1 second delay before chasing memory
    this.memoryChaseTimer = 0; // Countdown while actively chasing memory mark; gives up at 0
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
      freeze: { active: false, duration: 0, slowAmount: 0.5, frozen: false, shuddering: false },
      stun: { active: false, duration: 0 },
      sleep: { active: false, duration: 0 },
      charm: { active: false, duration: 0 },
      wet: { active: false, duration: 0 },
      knockback: { active: false, duration: 0 },
      blind: { active: false, duration: 0 }, // Attacks miss (0 damage)
      corrosion: { active: false, duration: 0 }, // Acid Blade: +50% damage taken on next hits
      dizzy: { active: false, duration: 0 }
    };

    // Venom Blade stack counter — resets when poison wears off
    this.poisonStackCount = 0;

    // Trident pin duration (seconds); non-zero = pinned to a wall/object
    this.pinnedDuration = 0;

    // Spear throw carry: true while a thrown spear is physically dragging this enemy
    this.carriedBySpear = false;

    // Force Wand AOE: true = pin this enemy on next wall/solid contact
    this.pinOnWallContact = false;

    // Force Wand root/blast: root timer counts down, then enemy is hurled in stored direction
    this.forceRootTimer = 0;
    this.forceBlastDir = null;
    this.forceBlastForce = 0;

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

    // Optional random spawn loadout (e.g. goblins arrive with a basic weapon).
    // Skipped silently if itemUsage isn't enabled or the roll fails.
    if (this.itemUsage && this.itemUsage.enabled && this.data.spawnEquipment) {
      const cfg = this.data.spawnEquipment;
      if (Math.random() < (cfg.chance ?? 1.0) && Array.isArray(cfg.weapons) && cfg.weapons.length > 0) {
        const choice = cfg.weapons[Math.floor(Math.random() * cfg.weapons.length)];
        const weapon = new Item(choice, x, y);
        this.pickupItem(weapon);
      }
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

    // Frog jump behavior system (legacy field — read by jumper archetype)
    this.jumpBehavior = this.data.jumpBehavior || null;
    if (this.jumpBehavior && this.jumpBehavior.enabled) {
      this.frogJumpTimer = Math.random() * this.jumpBehavior.jumpInterval;
      this.frogJumpActive = false;
      this.frogJumpDurationTimer = 0;
      this.frogJumpSide = 1; // Alternates: +1 = right of travel, -1 = left
    }

    // ── Movement Archetype System ────────────────────────────────────────────
    // movementStyle: 'chaser' | 'keeper' | 'kiter' | 'jumper' | 'ambusher'
    // movementConfig: per-archetype parameter object (from enemy data)
    this.movementStyle = this.data.movementStyle || 'chaser';
    this.movementConfig = this.data.movementConfig || {};
    // packCoordination: share memory marks / detection with same-char nearby enemies
    this.packCoordination = this.data.packCoordination !== undefined
      ? this.data.packCoordination
      : !!(this.data.packBehavior?.enabled);
    // idleBehavior: 'wander' (default) | 'stationary'
    this.idleBehavior = this.data.idleBehavior || 'wander';
    // windupMovement: 'stop' (default) | 'advance' | 'retreat'
    this.windupMovement = this.data.windupMovement || 'stop';

    // Derive movementStyle from legacy fields when not explicitly set in data
    if (!this.data.movementStyle) {
      if (this.data.packBehavior?.enabled) this.movementStyle = 'kiter';
      if (this.data.jumpBehavior?.enabled) this.movementStyle = 'jumper';
    }

    // Per-archetype state initialization
    if (this.movementStyle === 'keeper') {
      // Randomly pick strafe direction so grouped keepers orbit in different directions
      this.keeperStrafeDir = Math.random() < 0.5 ? 1 : -1;
    }
    if (this.movementStyle === 'ambusher') {
      this.burstTimer = 0;
      this.burstActive = false;
      this.state = 'rest'; // Ambushers start dormant
    }

    // Shell form (tortoise and shell-armored enemies)
    if (this.data.shellCamouflage) {
      this.inShellForm = true;
      this.shellFormTimer = 0;
      this.knockbackResistance = 0.8; // Shell absorbs most knockback
    }

    // Lava state tracking (for lava-immune enemies that change behavior in lava)
    this.inLava = false;
    // Initialize kiter state when using movementConfig (new-style).
    // Legacy packBehavior.enabled enemies initialize these fields above; new-style must do it here.
    if (this.movementStyle === 'kiter' && !this.packBehavior) {
      this.hoverTimer = 0;
      this.isHovering = false;
      this.hoverLocked = false;
      this.isAttacking = false;
      this.attackRushTimer = 0;
      this.packmates = [];
    }

    // Initialize jumper state when using movementConfig (new-style).
    // Legacy jumpBehavior.enabled enemies initialize these fields above; new-style must do it here.
    if (this.movementStyle === 'jumper' && !this.jumpBehavior) {
      const cfg = this.movementConfig;
      const baseInterval = cfg.jumpInterval ?? 1.0;
      this.frogJumpTimer = Math.random() * baseInterval;
      this.frogJumpActive = false;
      this.frogJumpDurationTimer = 0;
      this.frogJumpSide = 1;
    }

    // ── Charge mechanic (Boar) ───────────────────────────────────────────────
    if (this.data.chargeMechanic?.enabled) {
      // Short initial delay so the boar reacts before charging on first sight
      this.chargeTimer = this.data.chargeMechanic.initialDelay ?? 0.6;
      this.chargeWindupTimer = 0;     // Telegraph before charge launches
      this.chargeDurationTimer = 0;   // Max charge duration
      this.chargeDir = { x: 0, y: 0 };
      this.chargeState = 'idle';      // 'idle' | 'windup' | 'charging' | 'stunned'
      this.chargeStunTimer = 0;
      this.chargeHasHit = false;      // Prevents repeat hits within a single charge
    }

    // ── Mimic mechanic ────────────────────────────────────────────────────────
    if (this.data.mimicMechanic?.enabled) {
      // Pick a random disguise char from the table
      const disguiseTable = this.data.mimicMechanic.disguiseChars;
      this.disguisedAs = disguiseTable[Math.floor(Math.random() * disguiseTable.length)];
      this.mimicRevealed = false;
      this.mimicFlashTimer = 0;
      this.redisguiseTimer = this.data.mimicMechanic.redisguiseCooldown?.redisguiseDuration ?? 3.0;
      // Tongue attack — fires after reveal, pulls player in, releases on damage
      this.mimicTongueCooldown = 3.0; // brief delay before first tongue attempt after reveal
      this.mimicTongue = null;        // null | { phase: 'extending'|'hooked', direction, currentLength, maxLength }
    }

    // ── Buff mechanic (Shaman) ────────────────────────────────────────────────
    if (this.data.buffMechanic?.enabled) {
      this.buffTimer = this.data.buffMechanic.buffCooldown * Math.random(); // Stagger
      this.buffWindupTimer = 0;
      this.buffWindupActive = false;
    }

    // ── Trail mechanic (Magma Slug, Glacier Crab) ─────────────────────────────
    if (this.data.trailMechanic?.enabled) {
      this.trailTimer = 0;
    }

    // ── Death explosion ────────────────────────────────────────────────────────
    // (no timer — fires once on death)

    // ── Armor mechanic (Rockwarden) ───────────────────────────────────────────
    if (this.data.armorMechanic?.enabled) {
      this.armorChunks = this.data.armorMechanic.armorChunks;
      this.armorBroken = false;
    }

    // ── Lure mechanic (Siren) ─────────────────────────────────────────────────
    if (this.data.lureMechanic?.enabled) {
      this.lureChannelTimer = 0;
      this.lureCooldownTimer = 0;
      this.lureSinging = false;
    }

    // ── Parry mechanic (Duelist) ──────────────────────────────────────────────
    if (this.data.parryMechanic?.enabled) {
      this.parryActive = false;
      this.parryTimer = 0;       // Active parry countdown
      this.parryCooldown = 0;    // Cooldown before next parry attempt
      this.parryWindupTimer = 0;
      this.parryWindupActive = false;
    }

    // ── Reflect shield (Mirror Imp) ───────────────────────────────────────────
    if (this.data.reflectShield?.enabled) {
      this.shieldActive = false;
      this.shieldTimer = this.data.reflectShield.shieldDuration;  // Start active
      this.shieldCooldownTimer = 0;
    }

    // ── Trap layer (Trap Goblin) ──────────────────────────────────────────────
    if (this.data.trapLayerMechanic?.enabled) {
      this.trapLayTimer = 0;
      this.postTrapBurstTimer = 0;
    }

    // ── Potion mechanic (Alchemist) ───────────────────────────────────────────
    if (this.data.potionMechanic?.enabled) {
      this.lastPotionThrown = null;
    }

    // ── Hex mechanic (Hex Witch) ──────────────────────────────────────────────
    // (no timer — hex fires as magic attack; spell learned on death)

    // ── Split-on-damage (Giant Slime) ─────────────────────────────────────────
    if (this.data.splitOnDamage?.enabled) {
      this.splitChildren = new Set();
    }

    // ── Goo spew cone (Giant Slime) ────────────────────────────────────────────
    if (this.data.gooSpewCone?.enabled) {
      this.spewDamageAccum = 0;
      this.spewWindupActive = false;
      this.spewWindupTimer = 0;
    }

    // ── Reform behavior (split-child slimes) ──────────────────────────────────
    // parentRef, reformDelay, reformValue are attached post-construction by
    // the Giant Slime split path. Fields default to inactive.
    this.parentRef = null;
    this.reformDelay = 0;
    this.reformValue = 0;
    this.reformReturning = false;

    // ── Follow-leader (Goblin Army followers) ─────────────────────────────────
    // leaderRef, formationRadius, etc. attached post-construction by the
    // Goblin Army encounter spawner. Released by leader rally call when
    // leader is far from player.
    this.leaderRef = null;
    this.followerRoleActive = false;
    this.rallyBoostTimer = 0;

    // ── Rally call (Goblin Chief) ─────────────────────────────────────────────
    if (this.data.rallyCall?.enabled) {
      this.rallyCallCooldown = 0;
      this.rallyIndicatorTimer = 0;
    }

    // (Goblin Chief bash uses the existing chargeMechanic state machine —
    // no separate bashAttack init needed; tuned via data.chargeMechanic values.)

    // ── Knockback multiplier ──────────────────────────────────────────────────
    this.knockbackMultiplier = this.data.knockbackMultiplier ?? 1.0;
  }

  setCollisionMap(collisionMap) {
    this.collisionMap = collisionMap;
  }

  setBackgroundObjects(backgroundObjects) {
    this.backgroundObjects = backgroundObjects;
  }

  setGame(game) {
    this.game = game;
  }

  setRoom(room) {
    this.room = room;
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
        if (effect === 'poison') this.poisonStackCount = 0;
      }
    }

    // Corrosion (Acid Blade debuff — lasts a fixed duration, no DOT)
    const corrosion = this.statusEffects.corrosion;
    if (corrosion.active) {
      corrosion.duration -= deltaTime;
      if (corrosion.duration <= 0) {
        corrosion.active = false;
        corrosion.duration = 0;
      }
    }

    // Freeze effect (slow or full immobilization)
    const freeze = this.statusEffects.freeze;
    if (freeze.active) {
      // Permanent freeze (slime-type enemies): don't tick down
      if (!(freeze.frozen && this.data.freezePermanent)) {
        freeze.duration -= deltaTime;
      }
      // Shudder phase: last 0.6s before breaking free from full freeze
      if (freeze.frozen && !this.data.freezePermanent && freeze.duration < 0.6) {
        freeze.shuddering = true;
      }
      if (freeze.duration <= 0) {
        freeze.active = false;
        freeze.duration = 0;
        freeze.slowAmount = 0.5;
        freeze.frozen = false;
        freeze.shuddering = false;
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

    const dizzy = this.statusEffects.dizzy;
    if (dizzy.active) {
      dizzy.duration -= deltaTime;
      if (dizzy.duration <= 0) { dizzy.active = false; dizzy.duration = 0; }
    }

    return damageEvents;
  }

  isStunned() {
    return this.statusEffects.stun.active;
  }

  isFrozen() {
    return this.statusEffects.freeze.active && this.statusEffects.freeze.frozen;
  }

  isWet() { return this.statusEffects.wet.active; }

  isSleeping() { return this.statusEffects.sleep.active; }

  isCharmed() { return this.statusEffects.charm.active; }

  isKnockedBack() { return this.statusEffects.knockback.active; }


  isBlind() { return this.statusEffects.blind.active; }

  isDizzy() { return this.statusEffects.dizzy.active; }

  // Get effective damage (0 if blind, normal damage otherwise)
  getEffectiveDamage() {
    return this.isBlind() ? 0 : this.damage;
  }

  getSpeedMultiplier() {
    if (this.isStunned()) return 0;
    if (this.isKnockedBack()) return 0;
    if (this.isFrozen()) return 0;
    if (this.statusEffects.freeze.active) return 1 - this.statusEffects.freeze.slowAmount;
    if (this.isDizzy()) return 0.35;
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

    // Cyan rogue hide — actively scrub all detection state so the player can truly slip away.
    // hasVision() already returns false for hidden targets, but lastKnownPosition / memory
    // would otherwise keep this enemy hunting the player's last spot. Clearing here lets the
    // rogue reposition for a backstab (which requires !enraged && !aggroMemoryActive).
    // hadVisualContact intentionally stays true — re-detection still requires line of sight.
    if (this.target.hidden) {
      this.lastKnownPosition = null;
      this.aggroMemoryActive = false;
      this.memoryChaseTimer = 0;
      this.memoryMoveDelayTimer = 0;
      this.memoryMarkSuspected = false;
      this.detectionIndicatorTimer = 0;
      this.enraged = false;
    }

    // Update invulnerability timer
    if (this.invulnerabilityTimer > 0) {
      this.invulnerabilityTimer -= deltaTime;
      if (this.invulnerabilityTimer < 0) {
        this.invulnerabilityTimer = 0;
      }
    }

    // Shell form re-emergence timer (tortoise: exits shell and charges again)
    if (this.inShellForm && this.shellFormTimer > 0) {
      this.shellFormTimer -= deltaTime;
      if (this.shellFormTimer <= 0) {
        this.inShellForm = false;
        this.knockbackResistance = 0;
        if (this.movementStyle === 'ambusher') {
          this.burstActive = true;
          this.burstTimer = this.movementConfig.burstDuration ?? 1.0;
        }
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

    // While being carried by a thrown spear, TrapSystem owns position — skip all movement AI
    if (this.carriedBySpear) {
      this.velocity.vx = 0;
      this.velocity.vy = 0;
      if (this.acceleration) { this.acceleration.ax = 0; this.acceleration.ay = 0; }
      return { dotDamage: dotDamageEvents };
    }

    // Force Wand root: tick timer; on expiry hurl enemy in stored facing direction
    if (this.forceRootTimer > 0) {
      this.forceRootTimer -= deltaTime;
      if (this.forceRootTimer <= 0 && this.forceBlastDir) {
        const resistance = this.knockbackResistance ?? 0;
        const scaledForce = this.forceBlastForce * (1 - resistance);
        this.velocity.vx = this.forceBlastDir.dx * scaledForce;
        this.velocity.vy = this.forceBlastDir.dy * scaledForce;
        this.applyStatusEffect('knockback', 0.35);
        this.pinOnWallContact = true;
        this.forceBlastDir = null;
      }
    }

    // Blend velocity toward targetVelocity (smooth accel/decel, skipped during knockback)
    if (!this.isKnockedBack()) {
      this._blendVelocity(deltaTime);
    }

    // Update facing direction from movement velocity (used by vision cone)
    const _faceSpeed = Math.sqrt(this.velocity.vx ** 2 + this.velocity.vy ** 2);
    if (_faceSpeed > this.speed * 0.1) {
      this.facingAngle = Math.atan2(this.velocity.vy, this.velocity.vx);
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

        // Leap-on-attack: melee-equipped enemies (e.g. goblins with sword/axe)
        // burst forward into the target as the swing lands. Ranged loadouts
        // keep their distance and skip this.
        if (this.leapOnAttack && this.target && !this.isFrozen() && !this.isStunned()) {
          const lx = this.target.position.x - this.position.x;
          const ly = this.target.position.y - this.position.y;
          const ld = Math.sqrt(lx * lx + ly * ly) || 1;
          const leapSpeed = Math.max(this.speed * 3.2, 180);
          this.velocity.vx = (lx / ld) * leapSpeed;
          this.velocity.vy = (ly / ld) * leapSpeed;
        }
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

    // Frozen: full immobilization — cannot move or attack
    if (this.isFrozen()) {
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
      // Ambushers use their configured wakeRadius; others use default 4-cell radius
      const wakeRadius = (this.movementStyle === 'ambusher' && this.movementConfig.wakeRadius)
        ? this.movementConfig.wakeRadius
        : GRID.CELL_SIZE * 4;
      if (distance < wakeRadius) {
        this.state = 'chase';
        this.enraged = true;
        // Trigger burst for ambushers on wake
        if (this.movementStyle === 'ambusher') {
          this.hasBeenActivated = true;
          this.burstActive = true;
          this.burstTimer = this.movementConfig.burstDuration ?? 1.0;
          if (this.inShellForm !== undefined) {
            this.inShellForm = false;     // Emerge from shell
            this.knockbackResistance = 0; // Full knockback when active
          }
        }
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
      if (planeOf(this.target) !== this.memoryMarkPlane) {
        this.memoryStaleTimer -= deltaTime;
        if (this.memoryStaleTimer <= 0) {
          EnemyDebug.log(this, 'MEMORY', 'Memory mark expired — player switched planes (stale)', {
            memoryMarkPlane: this.memoryMarkPlane,
            playerPlane: planeOf(this.target)
          });
          this.aggroMemoryActive = false;
          this.memoryMarkSuspected = false;
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
        // Cancel the mark if it is now beyond vision range (e.g. enemy was knocked far away).
        // Pack members are exempt — they receive marks via communication, not direct sight.
        const markDx = this.lastKnownPosition.x - this.position.x;
        const markDy = this.lastKnownPosition.y - this.position.y;
        const markDist = Math.sqrt(markDx * markDx + markDy * markDy);
        this.memoryMarkSuspected = markDist > effectiveVisionLength;
        EnemyDebug.log(this, 'MEMORY', 'Activating memory mode — player left aggro range', {
          distToPlayer: distance.toFixed(1),
          aggroRange: this.aggroRange,
          suspected: this.memoryMarkSuspected,
          memoryMark: { x: this.lastKnownPosition.x.toFixed(1), y: this.lastKnownPosition.y.toFixed(1) }
        });
        this.aggroMemoryActive = true;
        this.memoryChaseTimer = 5.0; // Give up if mark unreachable within 5 seconds
        this.memoryMoveDelayTimer = this.memoryMoveDelay; // Start delay timer
        this.memoryMarkPlane = this.plane; // Track enemy's plane so stale timer fires if player goes underground
        this.memoryStaleTimer = 2.0;
        // Reset cached direction to force immediate recalculation towards memory mark
        this.currentDirection = { x: 0, y: 0 };

        // Only share confirmed marks with packmates — suspected marks are not communicated
        if (!this.memoryMarkSuspected && this.packmates && this.packmates.length > 0) {
          for (const mate of this.packmates) {
            mate.target = this.target; // Share player target
            mate.lastKnownPosition = { x: this.lastKnownPosition.x, y: this.lastKnownPosition.y };
            mate.aggroMemoryActive = true;
            mate.memoryChaseTimer = 5.0;
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
              this.memoryMarkSuspected = false;
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

            // Tick down the stuck-guard timer; give up if it expires
            this.memoryChaseTimer -= deltaTime;
            if (this.memoryChaseTimer <= 0) {
              this.aggroMemoryActive = false;
              this.lastKnownPosition = null;
              this.memoryMoveDelayTimer = 0;
              this.memoryChaseTimer = 0;
              this.state = 'idle';
              this.enraged = false;
              if (this.packmates && this.packmates.length > 0) {
                for (const mate of this.packmates) {
                  mate.aggroMemoryActive = false;
                  mate.lastKnownPosition = null;
                  mate.memoryMoveDelayTimer = 0;
                  mate.memoryChaseTimer = 0;
                  mate.currentDirection = { x: 0, y: 0 };
                  mate.enraged = false;
                  mate.state = 'idle';
                }
              }
            // Reached the mark — linger and search until memoryChaseTimer expires.
            // Abandoning on arrival made the timer meaningless when the mark was placed
            // close to the enemy (the common case when vision is briefly lost).
            } else if (memDistance < GRID.CELL_SIZE) {
              // Reached the mark — wander while the search timer ticks down.
              // Stationary enemies still hold position; everyone else drifts.
              this.state = 'idle';
              this._updateWanderMovement(speedMultiplier, deltaTime);
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
        // Too far and not enraged, no memory - passive idle behavior
        this.state = 'idle';
        this._updateWanderMovement(speedMultiplier, deltaTime);
      }
    } else if (this.state === 'windup') {
      this._applyWindupMovement(speedMultiplier);
    } else if (this.attackType === 'melee' && effectiveDistance < this.attackRange && this.attackTimer > 0 && (this.enraged || effectiveDistance <= this.aggroRange)) {
      // Player is inside melee AOE range while on cooldown — back away so the next
      // attack hits. The enemy retreats until it reaches its natural attack distance.
      this.state = 'chase';
      const dirX = dx / distance;
      const dirY = dy / distance;
      this.targetVelocity.vx = -dirX * this.speed * speedMultiplier * 0.5;
      this.targetVelocity.vy = -dirY * this.speed * speedMultiplier * 0.5;
    } else if (effectiveDistance <= this.attackRange && this.attackTimer <= 0) {
      // CRITICAL: Can only attack if aggro'd (enraged) OR within aggro range
      const isAggrod = this.enraged || effectiveDistance <= this.aggroRange;

      if (isAggrod) {
        // In range and aggro'd - check vision before attacking.
        // ignoreCone=true: facing direction is for detection, not attack decisions.
        // Keeper enemies sidestep perpendicular to the player and would never attack with cone on.
        const canSeeTarget = this.hasVision(this.position, this.target.position, effectiveVisionLength, { ignoreCone: true });

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
      // Hoisted so it's accessible to all movement branches below (memory, chase, idle fallback)
      const wasIdle = this.state === 'idle';

      if (!canChase) {
        // Different plane and not already chasing - remain idle
        this.state = 'idle';
      } else {
        // Can chase - either same plane, or already aggro'd/memory from before
        const wasInMemoryMode = this.aggroMemoryActive;
        this.state = 'chase';

        EnemyDebug.log(this, 'AI', 'In-range branch entered', {
          wasIdle, canSeePlayer, aggroMemoryActive: this.aggroMemoryActive,
          enraged: this.enraged, lastKnownPosition: !!this.lastKnownPosition,
          hadVisualContact: this.hadVisualContact,
          effectiveDistance: effectiveDistance.toFixed(1), aggroRange: this.aggroRange
        });

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
          this.memoryMarkSuspected = false;
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
            // TRANSITION: Just lost vision — lead the mark by the player's current velocity
            // so it lands "in front of" a fleeing player rather than at their exact
            // disappearance pixel. Cap the lead so high-speed states don't fling the mark
            // an unreasonable distance.
            const _lookahead = 0.35;
            const _maxLead = GRID.CELL_SIZE * 4;
            const _tvx = this.target.velocity ? this.target.velocity.vx : 0;
            const _tvy = this.target.velocity ? this.target.velocity.vy : 0;
            let _leadX = _tvx * _lookahead;
            let _leadY = _tvy * _lookahead;
            const _leadMag = Math.sqrt(_leadX * _leadX + _leadY * _leadY);
            if (_leadMag > _maxLead) {
              _leadX = (_leadX / _leadMag) * _maxLead;
              _leadY = (_leadY / _leadMag) * _maxLead;
            }
            this.lastKnownPosition = {
              x: this.target.position.x + _leadX,
              y: this.target.position.y + _leadY,
            };
            EnemyDebug.log(this, 'MEMORY', 'Lost vision — activating memory mode (in-range branch)', {
              distToPlayer: distance.toFixed(1),
              aggroRange: this.aggroRange,
              memoryMark: { x: this.lastKnownPosition.x.toFixed(1), y: this.lastKnownPosition.y.toFixed(1) },
              lead: { x: _leadX.toFixed(1), y: _leadY.toFixed(1) }
            });
            // Track the player's plane at mark creation so the stale timer only fires
            // if the player subsequently changes planes (not while enemy is crossing).
            this.memoryMarkPlane = this.target.plane;
            this.memoryStaleTimer = 2.0;

            this.aggroMemoryActive = true;
            this.memoryChaseTimer = 5.0;
            this.memoryMoveDelayTimer = this.memoryMoveDelay; // Start delay timer
            // Reset cached direction to force immediate recalculation towards memory mark
            this.currentDirection = { x: 0, y: 0 };

            // Share memory mark with all packmates (pack communication)
            if (this.packmates && this.packmates.length > 0) {
              for (const mate of this.packmates) {
                mate.target = this.target; // Share player target
                mate.lastKnownPosition = { x: this.lastKnownPosition.x, y: this.lastKnownPosition.y };
                mate.aggroMemoryActive = true;
                mate.memoryChaseTimer = 5.0;
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
                this.memoryChaseTimer = 5.0;
                this.memoryMoveDelayTimer = this.memoryMoveDelay; // Start delay timer
                this.memoryMarkPlane = this.plane;
                this.memoryStaleTimer = 2.0;
                // Reset cached direction to force immediate recalculation towards memory mark
                this.currentDirection = { x: 0, y: 0 };
              }
            }
          } else {
            // No vision, no memory mark, and proximity detection is gated off (hadVisualContact).
            // Nothing to pursue — go idle rather than freezing in chase state.
            // Only zero velocity if we were actively chasing; don't interrupt natural idle behavior.
            this.state = 'idle';
            if (!wasIdle) {
              this.targetVelocity.vx = 0;
              this.targetVelocity.vy = 0;
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
          // Delay elapsed - start moving / search

          // Tick the chase timer here too so the mark expires after ~5s whether
          // or not the enemy ever crosses out of aggro range. Path A (out of
          // aggro range) was the only ticker, leaving this branch silent.
          this.memoryChaseTimer -= deltaTime;
          if (this.memoryChaseTimer <= 0) {
            this.aggroMemoryActive = false;
            this.memoryMarkSuspected = false;
            this.lastKnownPosition = null;
            this.memoryMoveDelayTimer = 0;
            this.memoryChaseTimer = 0;
            this.state = 'idle';
            this.targetVelocity.vx = 0;
            this.targetVelocity.vy = 0;
            this.enraged = false;

            if (this.packmates && this.packmates.length > 0) {
              for (const mate of this.packmates) {
                mate.aggroMemoryActive = false;
                mate.lastKnownPosition = null;
                mate.memoryMoveDelayTimer = 0;
                mate.memoryChaseTimer = 0;
                mate.currentDirection = { x: 0, y: 0 };
                mate.enraged = false;
                mate.state = 'idle';
              }
            }
          } else if (memDistance < GRID.CELL_SIZE) {
            // Reached the mark — linger and search until the timer expires.
            this.state = 'chase';
            this.targetVelocity.vx = 0;
            this.targetVelocity.vy = 0;
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
        // Direct chase — dispatch through movement archetype
        this._updateMovement(speedMultiplier, this.target.position, deltaTime);
      } else {
        // In aggro range but can't see player and no memory mark — stop and wait.
        // Only zero velocity on transition from chase; preserve natural idle movement.
        EnemyDebug.log(this, 'STATE', 'No vision, no memory — going idle', {
          wasIdle, canSeePlayer, aggroMemoryActive: this.aggroMemoryActive,
          lastKnownPosition: !!this.lastKnownPosition, hadVisualContact: this.hadVisualContact
        });
        this.state = 'idle';
        if (!wasIdle) {
          this.targetVelocity.vx = 0;
          this.targetVelocity.vy = 0;
        }
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

    // ── Giant Slime: goo spew cone windup → emit ──────────────────────────────
    if (this.data.gooSpewCone?.enabled && this.spewWindupActive) {
      this.spewWindupTimer -= deltaTime;
      if (this.spewWindupTimer <= 0) {
        this.spewWindupActive = false;
        const cfg = this.data.gooSpewCone;
        const tgt = this.target;
        let aimX = 1, aimY = 0;
        if (tgt) {
          const dx = tgt.position.x - this.position.x;
          const dy = tgt.position.y - this.position.y;
          const mag = Math.sqrt(dx * dx + dy * dy) || 1;
          aimX = dx / mag;
          aimY = dy / mag;
        }
        const baseAngle = Math.atan2(aimY, aimX);
        const blobs = [];
        const count = cfg.blobCount;
        for (let i = 0; i < count; i++) {
          const t = count === 1 ? 0 : (i / (count - 1)) - 0.5; // -0.5..0.5
          const angle = baseAngle + t * cfg.coneAngle;
          blobs.push({
            x: this.position.x + GRID.CELL_SIZE / 2,
            y: this.position.y + GRID.CELL_SIZE / 2,
            vx: Math.cos(angle) * cfg.blobSpeed,
            vy: Math.sin(angle) * cfg.blobSpeed,
            decel: cfg.blobDecel,
            plane: this.plane ?? 0
          });
        }
        return { dotDamage: dotDamageEvents, shouldSpewGoo: true, gooSpewData: blobs };
      }
    }

    // ── Giant Slime split-child: reform behavior ──────────────────────────────
    // When reformDelay counts down and parent is alive, the child overrides
    // its movement target to pursue the parent. Contact triggers absorption.
    if (this.parentRef) {
      if (this.parentRef.hp <= 0) {
        // Parent died — child becomes a normal slime
        this.parentRef = null;
      } else {
        if (!this.reformReturning && this.reformDelay > 0) {
          this.reformDelay -= deltaTime;
          if (this.reformDelay <= 0) this.reformReturning = true;
        }
        if (this.reformReturning) {
          // Pull child toward parent each frame; on contact, absorb.
          const dx = this.parentRef.position.x - this.position.x;
          const dy = this.parentRef.position.y - this.position.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const contactDist = GRID.CELL_SIZE * 1.1;
          if (dist <= contactDist) {
            this.parentRef.notifySplitChildGone(this, true);
            const ref = this.parentRef;
            this.parentRef = null;
            this.hp = 0; // Mark for removal next death scan
            return { dotDamage: dotDamageEvents, absorbedBy: ref };
          }
          // Override velocity directly to home toward parent
          const speed = (this.data.speed || 30) * 1.2;
          const inv = dist > 0 ? 1 / dist : 0;
          this.velocity.vx = dx * inv * speed;
          this.velocity.vy = dy * inv * speed;
        }
      }
    }

    // ── Mimic reveal check ────────────────────────────────────────────────────
    if (this.data.mimicMechanic?.enabled && !this.mimicRevealed) {
      if (this.mimicFlashTimer > 0) {
        this.mimicFlashTimer -= deltaTime;
        if (this.mimicFlashTimer <= 0) this.mimicRevealed = true;
      } else if (this.target && distance < this.data.mimicMechanic.revealRadius) {
        this.mimicFlashTimer = this.data.mimicMechanic.revealFlashDuration;
        this.enraged = true;
        this.state = 'chase';
      }
    }

    // ── Mimic re-disguise: player backed off far enough ───────────────────────
    if (this.data.mimicMechanic?.enabled && this.mimicRevealed && this.target) {
      const rdCfg = this.data.mimicMechanic.redisguiseCooldown;
      if (rdCfg) {
        if (distance >= rdCfg.reDisguiseDistance) {
          this.redisguiseTimer -= deltaTime;
          if (this.redisguiseTimer <= 0) {
            // Release any active tongue hook before re-disguising
            if (this.mimicTongue?.phase === 'hooked') {
              this.target.hookedByMimic = null;
            }
            this.mimicTongue = null;
            this.mimicTongueCooldown = 3.0;
            const disguiseTable = this.data.mimicMechanic.disguiseChars;
            this.disguisedAs = disguiseTable[Math.floor(Math.random() * disguiseTable.length)];
            this.mimicRevealed = false;
            this.mimicFlashTimer = 0;
            this.enraged = false;
            this.state = 'idle';
            this.redisguiseTimer = rdCfg.redisguiseDuration;
          }
        } else {
          // Player within range — reset timer; must fully back off to trigger
          this.redisguiseTimer = rdCfg.redisguiseDuration;
        }
      }
    }

    // ── Mimic tongue: fire, extend, hook, pull ────────────────────────────────
    if (this.data.mimicMechanic?.enabled && this.mimicRevealed && this.target) {
      const CELL = GRID.CELL_SIZE;
      const player = this.target;
      const sx = this.position.x + this.width / 2;
      const sy = this.position.y + this.height / 2;
      const px = player.position.x + player.width / 2;
      const py = player.position.y + player.height / 2;

      if (!this.mimicTongue) {
        this.mimicTongueCooldown -= deltaTime;
        if (this.mimicTongueCooldown <= 0) {
          // Fire only when player is mid-range — not point-blank, not too far
          if (distance >= CELL * 2.5 && distance <= CELL * 9) {
            const dx = px - sx;
            const dy = py - sy;
            const dist = Math.sqrt(dx * dx + dy * dy);
            this.mimicTongue = {
              phase: 'extending',
              direction: { x: dx / dist, y: dy / dist },
              currentLength: 0,
              maxLength: dist
            };
          }
        }
      } else if (this.mimicTongue.phase === 'extending') {
        this.mimicTongue.currentLength += 320 * deltaTime;
        const tipX = sx + this.mimicTongue.direction.x * this.mimicTongue.currentLength;
        const tipY = sy + this.mimicTongue.direction.y * this.mimicTongue.currentLength;
        const ddx = tipX - px;
        const ddy = tipY - py;
        if (Math.sqrt(ddx * ddx + ddy * ddy) < CELL * 0.8) {
          // Tip reached player — hook
          this.mimicTongue.phase = 'hooked';
          player.hookedByMimic = this;
        } else if (this.mimicTongue.currentLength >= this.mimicTongue.maxLength) {
          // Missed — cancel and reset cooldown
          this.mimicTongue = null;
          this.mimicTongueCooldown = 6.0;
        }
      } else if (this.mimicTongue.phase === 'hooked') {
        const dx = sx - px;
        const dy = sy - py;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < CELL * 0.15) {
          // Player dragged to exact center — deal 5 damage and release
          player.takeDamage(5, { isBullet: false, attacker: this });
          player.hookedByMimic = null;
          this.mimicTongue = null;
          this.mimicTongueCooldown = 8.0;
        } else {
          // Pull player slowly toward mimic center
          player.position.x += (dx / dist) * 22 * deltaTime;
          player.position.y += (dy / dist) * 22 * deltaTime;
        }
      }
    }

    // ── Trail mechanic ────────────────────────────────────────────────────────
    if (this.data.trailMechanic?.enabled && (this.state === 'chase' || this.state === 'windup' || this.state === 'attack')) {
      this.trailTimer -= deltaTime;
      if (this.trailTimer <= 0) {
        this.trailTimer = this.data.trailMechanic.trailInterval;
        return {
          dotDamage: dotDamageEvents,
          shouldPlaceTrail: true,
          trailData: {
            x: this.position.x + this.width / 2,
            y: this.position.y + this.height / 2,
            type: this.data.trailMechanic.trailType,
            duration: this.data.trailMechanic.trailDuration,
            radius: this.data.trailMechanic.trailRadius
          }
        };
      }
    }

    // ── Buff mechanic (Shaman) ────────────────────────────────────────────────
    if (this.data.buffMechanic?.enabled) {
      if (this.buffWindupActive) {
        this.buffWindupTimer -= deltaTime;
        if (this.buffWindupTimer <= 0) {
          this.buffWindupActive = false;
          this.buffTimer = this.data.buffMechanic.buffCooldown;
          return {
            dotDamage: dotDamageEvents,
            shouldBuff: true,
            buffData: {
              position: { x: this.position.x, y: this.position.y },
              radius: this.data.buffMechanic.buffRadius,
              buffs: this.data.buffMechanic.buffs,
              speedMultiplier: this.data.buffMechanic.speedMultiplier,
              damageMultiplier: this.data.buffMechanic.damageMultiplier,
              buffDuration: this.data.buffMechanic.buffDuration,
              caster: this
            }
          };
        }
      } else {
        this.buffTimer -= deltaTime;
        if (this.buffTimer <= 0 && !this.isStunned()) {
          this.buffWindupActive = true;
          this.buffWindupTimer = this.data.buffMechanic.buffWindup;
        }
      }
    }

    // ── Lure mechanic (Siren) ─────────────────────────────────────────────────
    if (this.data.lureMechanic?.enabled && this.target) {
      if (this.lureSinging) {
        this.lureChannelTimer -= deltaTime;
        if (this.lureChannelTimer <= 0) {
          this.lureSinging = false;
          this.lureCooldownTimer = this.data.lureMechanic.lureCooldown;
          const ldx = this.position.x - this.target.position.x;
          const ldy = this.position.y - this.target.position.y;
          const ldist = Math.sqrt(ldx * ldx + ldy * ldy);
          if (ldist < this.data.lureMechanic.lureRadius && ldist > 0) {
            return {
              dotDamage: dotDamageEvents,
              shouldLure: true,
              lureData: {
                forceX: (ldx / ldist) * (-this.data.lureMechanic.lurePullForce),
                forceY: (ldy / ldist) * (-this.data.lureMechanic.lurePullForce)
              }
            };
          }
        }
      } else {
        this.lureCooldownTimer -= deltaTime;
        if (this.lureCooldownTimer <= 0 && distance < this.data.lureMechanic.lureRadius) {
          this.lureSinging = true;
          this.lureChannelTimer = this.data.lureMechanic.lureChannelTime;
        }
      }
    }

    // ── Parry mechanic (Duelist) ──────────────────────────────────────────────
    if (this.data.parryMechanic?.enabled) {
      if (this.parryWindupActive) {
        this.parryWindupTimer -= deltaTime;
        if (this.parryWindupTimer <= 0) {
          this.parryWindupActive = false;
          this.parryActive = true;
          this.parryTimer = this.data.parryMechanic.parryDuration;
        }
      } else if (this.parryActive) {
        this.parryTimer -= deltaTime;
        if (this.parryTimer <= 0) {
          this.parryActive = false;
          this.parryCooldown = this.data.parryMechanic.parryCooldown;
        }
      } else if (this.parryCooldown > 0) {
        this.parryCooldown -= deltaTime;
      } else if (this.state === 'chase' && !this.isStunned()) {
        // Attempt parry when player is within melee range
        if (distance < this.attackRange * 1.5) {
          this.parryWindupActive = true;
          this.parryWindupTimer = this.data.parryMechanic.parryWindup;
        }
      }
    }

    // ── Reflect shield (Mirror Imp) ───────────────────────────────────────────
    if (this.data.reflectShield?.enabled) {
      if (this.shieldActive) {
        this.shieldTimer -= deltaTime;
        if (this.shieldTimer <= 0) {
          this.shieldActive = false;
          this.shieldCooldownTimer = this.data.reflectShield.shieldCooldown;
        }
      } else {
        this.shieldCooldownTimer -= deltaTime;
        if (this.shieldCooldownTimer <= 0) {
          this.shieldActive = true;
          this.shieldTimer = this.data.reflectShield.shieldDuration;
        }
      }
    }

    // ── Trap layer (Trap Goblin) ──────────────────────────────────────────────
    if (this.data.trapLayerMechanic?.enabled) {
      this.trapLayTimer -= deltaTime;
      if (this.trapLayTimer <= 0) {
        this.trapLayTimer = this.data.trapLayerMechanic.trapCooldown;
        const trapTypes = this.data.trapLayerMechanic.trapTypes;
        const trapType = trapTypes[Math.floor(Math.random() * trapTypes.length)];
        this.postTrapBurstTimer = this.data.trapLayerMechanic.postTrapBurstDuration ?? 1.5;
        return {
          dotDamage: dotDamageEvents,
          shouldLayTrap: true,
          trapData: {
            x: this.position.x + this.width / 2,
            y: this.position.y + this.height / 2,
            type: trapType
          }
        };
      }
    }

    // ── Charge mechanic (Boar) ────────────────────────────────────────────────
    if (this.data.chargeMechanic?.enabled) {
      const chargeCfg = this.data.chargeMechanic;
      if (this.chargeState === 'stunned') {
        this.chargeStunTimer -= deltaTime;
        this.targetVelocity.vx = 0;
        this.targetVelocity.vy = 0;
        this.velocity.vx = 0;
        this.velocity.vy = 0;
        if (this.chargeStunTimer <= 0) this.chargeState = 'idle';
      } else if (this.chargeState === 'windup') {
        // Hold position during the telegraph, regardless of regular state machine.
        this.chargeWindupTimer -= deltaTime;
        this.targetVelocity.vx = 0;
        this.targetVelocity.vy = 0;
        this.velocity.vx = 0;
        this.velocity.vy = 0;
        // Suppress standard melee windup so the boar isn't doing two attacks at once
        if (this.state === 'windup' || this.state === 'attack') {
          this.state = 'chase';
          this.windupTimer = 0;
        }
        if (this.chargeWindupTimer <= 0) {
          // Launch the charge — direction locked at windup completion
          this.chargeState = 'charging';
          this.chargeDurationTimer = chargeCfg.chargeDuration;
          this.chargeHasHit = false;
          const cdx = this.target.position.x - this.position.x;
          const cdy = this.target.position.y - this.position.y;
          const cdist = Math.sqrt(cdx * cdx + cdy * cdy) || 1;
          this.chargeDir = { x: cdx / cdist, y: cdy / cdist };
          // Burst directly to top speed — bypass the acceleration ramp so the
          // 0.5s charge actually covers ground rather than spending most of it
          // accelerating.
          this.velocity.vx = this.chargeDir.x * chargeCfg.chargeSpeed;
          this.velocity.vy = this.chargeDir.y * chargeCfg.chargeSpeed;
        }
      } else if (this.chargeState === 'charging') {
        this.chargeDurationTimer -= deltaTime;
        this.targetVelocity.vx = this.chargeDir.x * chargeCfg.chargeSpeed;
        this.targetVelocity.vy = this.chargeDir.y * chargeCfg.chargeSpeed;
        // Keep the regular state machine out of the way during the dash
        if (this.state === 'windup' || this.state === 'attack') {
          this.state = 'chase';
          this.windupTimer = 0;
        }
        if (this.chargeDurationTimer <= 0) {
          this.chargeState = 'idle';
          this.chargeTimer = chargeCfg.cooldown;
        }
      } else {
        // idle — count down to next charge whenever a target is engaged
        const engaged = this.state !== 'idle' || this.aggroMemoryActive || this.enraged;
        if (engaged) this.chargeTimer -= deltaTime;
        if (this.chargeTimer <= 0
            && distance < chargeCfg.chargeRange
            && this.target
            && !this.isStunned()
            && !this.isFrozen()
            && this.hasVision(this.position, this.target.position, effectiveVisionLength, { ignoreCone: true })) {
          this.chargeState = 'windup';
          this.chargeWindupTimer = chargeCfg.chargeWindup;
          // Cancel any in-progress standard melee windup so the telegraph reads cleanly
          if (this.state === 'windup') {
            this.state = 'chase';
            this.windupTimer = 0;
          }
        }
      }
    }

    // Jumper archetype: replace smooth chase movement with erratic zigzag bursts
    if (this.movementStyle === 'jumper' && !this.isFrozen() && !this.isStunned() && !this.isKnockedBack()) {
      // Detect if jumper is currently on a water tile
      const onWater = this._isOnWater();

      // Read params from movementConfig (new) with fallback to legacy jumpBehavior
      const cfg = this.movementConfig;
      const jumpInterval   = onWater ? (cfg.waterJumpInterval ?? this.jumpBehavior?.waterJumpInterval) : (cfg.jumpInterval ?? this.jumpBehavior?.jumpInterval);
      const jumpSpeed      = onWater ? (cfg.waterJumpSpeed     ?? this.jumpBehavior?.waterJumpSpeed)   : (cfg.jumpSpeed     ?? this.jumpBehavior?.jumpSpeed);
      const jumpDuration   = onWater ? (cfg.waterJumpDuration  ?? this.jumpBehavior?.waterJumpDuration): (cfg.jumpDuration  ?? this.jumpBehavior?.jumpDuration);

      this.frogJumpTimer -= deltaTime;

      if (this.frogJumpActive) {
        this.frogJumpDurationTimer -= deltaTime;
        if (this.frogJumpDurationTimer <= 0) {
          this.frogJumpActive = false;
          // targetVelocity stays 0 → _blendVelocity decelerates velocity to a stop
        }
      } else if (this.state === 'chase' || this.state === 'idle') {
        // Between jumps: stand still
        this.targetVelocity.vx = 0;
        this.targetVelocity.vy = 0;

        if (this.frogJumpTimer <= 0) {
          // Jitter: ±30% around base interval
          this.frogJumpTimer = jumpInterval * (0.7 + Math.random() * 0.6);
          this.frogJumpActive = true;
          this.frogJumpDurationTimer = jumpDuration;

          // Chase: jump toward target with zigzag. Idle: jump along wander direction.
          let dirX, dirY;
          if (this.state === 'chase' && this.target) {
            // Prefer navigation direction (already wall-aware) over raw target direction.
            // currentDirection is set by updateVectorNavigation earlier in this frame.
            if (this.currentDirection.x !== 0 || this.currentDirection.y !== 0) {
              dirX = this.currentDirection.x;
              dirY = this.currentDirection.y;
            } else {
              const jdx = this.target.position.x - this.position.x;
              const jdy = this.target.position.y - this.position.y;
              const jdist = Math.sqrt(jdx * jdx + jdy * jdy);
              dirX = jdist > 0 ? jdx / jdist : 0;
              dirY = jdist > 0 ? jdy / jdist : 0;
            }
          } else {
            // Use wander direction; if not set yet, pick a random one
            const wd = this.wanderDirection || { x: Math.random() * 2 - 1, y: Math.random() * 2 - 1 };
            const wm = Math.sqrt(wd.x * wd.x + wd.y * wd.y) || 1;
            dirX = wd.x / wm;
            dirY = wd.y / wm;
          }

          if (dirX !== 0 || dirY !== 0) {
            // Perpendicular axis for zigzag offset
            const perpX = -dirY;
            const perpY =  dirX;

            let jumpX, jumpY;
            if (onWater) {
              // In water: swim nearly straight, minimal lateral deviation
              const wobble = (Math.random() * 2 - 1) * 0.15;
              jumpX = dirX + perpX * wobble;
              jumpY = dirY + perpY * wobble;
            } else {
              // On land: deterministic zigzag — flip side each jump
              this.frogJumpSide *= -1;
              const lateral = this.frogJumpSide * (cfg.zigzagStrength ?? this.jumpBehavior?.zigzagStrength ?? 0.75);
              jumpX = dirX + perpX * lateral;
              jumpY = dirY + perpY * lateral;
            }

            const jmag = Math.sqrt(jumpX * jumpX + jumpY * jumpY);
            if (jmag > 0) { jumpX /= jmag; jumpY /= jmag; }

            // Directly set velocity for instant burst; targetVelocity = 0 for natural decel
            this.velocity.vx = jumpX * jumpSpeed;
            this.velocity.vy = jumpY * jumpSpeed;
          }
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

    // Follower formation + chief rally call override (Goblin Army encounter).
    // Runs after the regular AI so it can stamp final velocity for formation orbit.
    this._tickLeaderFollowerBehaviors(deltaTime);

    return { dotDamage: dotDamageEvents, justAggrod };
  }

  /**
   * Goblin Army formation logic. Two roles, both opt-in via data fields:
   *
   *   data.followLeader  → this enemy is a follower. While leaderRef is alive and
   *                        the leader is within `nearPlayerRange` of the player,
   *                        orbit the leader at `formationRadius`. Otherwise the
   *                        regular chase AI runs untouched.
   *
   *   data.rallyCall     → this enemy is a chief. When the player is farther than
   *                        `triggerDistance` (and cooldown is ready), plant the
   *                        red `!` indicator and apply a temporary speed boost to
   *                        all linked followers so they can close the gap.
   */
  _tickLeaderFollowerBehaviors(deltaTime) {
    if (this.rallyCallCooldown > 0) this.rallyCallCooldown -= deltaTime;
    if (this.rallyIndicatorTimer > 0) this.rallyIndicatorTimer -= deltaTime;
    if (this.rallyBoostTimer > 0) this.rallyBoostTimer -= deltaTime;

    const rc = this.data.rallyCall;
    if (rc?.enabled && this.target && this.rallyCallCooldown <= 0) {
      const dx = this.target.position.x - this.position.x;
      const dy = this.target.position.y - this.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > rc.triggerDistance) {
        this.rallyIndicatorTimer = rc.indicatorDuration ?? 1.0;
        this.rallyCallCooldown = rc.cooldown ?? 6.0;
        const enemies = this.game?.currentRoom?.enemies;
        if (enemies) {
          for (const e of enemies) {
            if (e.leaderRef === this) {
              e.rallyBoostTimer = rc.followerBoostDuration ?? 2.0;
              e._rallyBoostMultiplier = rc.followerBoostMultiplier ?? 1.3;
              // Rally call re-triggers the encircle windup so the pack visibly
              // regroups before re-forming the line wall.
              e._formationState = 'encircle';
              e._encircleTimer = rc.indicatorDuration ?? 1.0;
            }
          }
        }
      }
    }

    const fl = this.data.followLeader;
    if (fl?.enabled && this.leaderRef && this.leaderRef.hp > 0 && this.target) {
      const ldx = this.target.position.x - this.leaderRef.position.x;
      const ldy = this.target.position.y - this.leaderRef.position.y;
      const leaderToPlayer = Math.sqrt(ldx * ldx + ldy * ldy);
      const radius = fl.formationRadius;

      // ── Formation state machine ────────────────────────────────────────────
      // wander   → leader hasn't sighted the player
      // encircle → brief windup orbit around the leader as the pack reacts
      // line     → settled perpendicular wall between the leader and the player
      if (this._formationState === undefined) this._formationState = 'wander';
      if (this._encircleTimer === undefined) this._encircleTimer = 0;
      const ENCIRCLE_DURATION = fl.encircleDuration ?? 1.4;

      if (leaderToPlayer > fl.nearPlayerRange) {
        this._formationState = 'wander';
        this._encircleTimer = 0;
        this.followerRoleActive = false;
      } else {
        this.followerRoleActive = true;
        if (this._formationState === 'wander') {
          // Rising edge → spin up encircle windup
          this._formationState = 'encircle';
          this._encircleTimer = ENCIRCLE_DURATION;
        }
        if (this._formationState === 'encircle') {
          this._encircleTimer -= deltaTime;
          if (this._encircleTimer <= 0) this._formationState = 'line';
        }
      }

      if (this._formationState === 'encircle') {
        const orbitSpeed = fl.orbitSpeed ?? 1.2;
        if (this._orbitAngle === undefined) {
          const ox = this.position.x - this.leaderRef.position.x;
          const oy = this.position.y - this.leaderRef.position.y;
          this._orbitAngle = Math.atan2(oy, ox);
        }
        this._orbitAngle += orbitSpeed * deltaTime;
        const slotX = this.leaderRef.position.x + Math.cos(this._orbitAngle) * radius;
        const slotY = this.leaderRef.position.y + Math.sin(this._orbitAngle) * radius;
        this._steerToSlot(slotX, slotY);
      } else if (this._formationState === 'line') {
        // Perpendicular wall between leader and player. The anchor sits part
        // way down the leader→player axis; followers spread along the
        // perpendicular at lineSpacing apart so the pack reads as a wall the
        // player has to fight through to reach the chief.
        const ld = leaderToPlayer || 1;
        const dirX = ldx / ld;
        const dirY = ldy / ld;
        const perpX = -dirY;
        const perpY = dirX;
        const anchorDist = Math.min(ld * 0.5, GRID.CELL_SIZE * 6);
        const anchorX = this.leaderRef.position.x + dirX * anchorDist;
        const anchorY = this.leaderRef.position.y + dirY * anchorDist;
        const spacing = fl.lineSpacing ?? radius;
        const slotIdx = this.formationSlot ?? 0;
        const slotCount = this.formationCount ?? 1;
        const lateral = slotIdx - (slotCount - 1) / 2;
        const slotX = anchorX + perpX * lateral * spacing;
        const slotY = anchorY + perpY * lateral * spacing;

        const pdx = this.target.position.x - this.position.x;
        const pdy = this.target.position.y - this.position.y;
        const distToPlayer = Math.sqrt(pdx * pdx + pdy * pdy);

        // Once in attack range, drop the formation override so chase AI takes
        // over and the goblin commits its leap-swing.
        if (distToPlayer > this.attackRange) {
          this._steerToSlot(slotX, slotY);
        }
      }
    } else {
      // Leader missing/dead — fall back to plain wander so the chase AI runs.
      this._formationState = 'wander';
      this.followerRoleActive = false;
    }

    if (this.rallyBoostTimer > 0) {
      const mult = this._rallyBoostMultiplier ?? 1.3;
      this.velocity.vx *= mult;
      this.velocity.vy *= mult;
    }
  }

  // Move toward a formation slot at full speed; snap to rest when essentially
  // on top of it. Shared by both encircle and line-formation slot tracking.
  _steerToSlot(slotX, slotY) {
    const sdx = slotX - this.position.x;
    const sdy = slotY - this.position.y;
    const sd = Math.sqrt(sdx * sdx + sdy * sdy);
    if (sd > 2) {
      const vx = (sdx / sd) * this.speed;
      const vy = (sdy / sd) * this.speed;
      this.velocity.vx = vx;
      this.velocity.vy = vy;
      this.targetVelocity.vx = vx;
      this.targetVelocity.vy = vy;
    } else {
      this.velocity.vx = 0;
      this.velocity.vy = 0;
      this.targetVelocity.vx = 0;
      this.targetVelocity.vy = 0;
    }
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

  // ── Movement Archetype Dispatch ───────────────────────────────────────────

  /**
   * Called from update() when enemy has line-of-sight to player and is chasing.
   * Routes to the correct movement implementation based on movementStyle.
   */
  _updateMovement(speedMultiplier, targetPos, deltaTime) {
    // Post-trap burst: Trap Goblin scuttles away at high speed right after laying a trap
    if (this.postTrapBurstTimer > 0) {
      this.postTrapBurstTimer -= deltaTime;
      const burstMult = this.data.trapLayerMechanic?.postTrapBurstSpeed ?? 1.8;
      const dx = this.position.x - targetPos.x;
      const dy = this.position.y - targetPos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 0) {
        this.targetVelocity.vx = (dx / dist) * this.speed * speedMultiplier * burstMult;
        this.targetVelocity.vy = (dy / dist) * this.speed * speedMultiplier * burstMult;
      }
      return;
    }

    // Shield phase movement: Mirror Imp retreats while its reflect shield is active
    if (this.shieldActive && this.data.reflectShield?.shieldPhaseMovement) {
      const dx = this.position.x - targetPos.x;
      const dy = this.position.y - targetPos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 0) {
        this.targetVelocity.vx = (dx / dist) * this.speed * speedMultiplier;
        this.targetVelocity.vy = (dy / dist) * this.speed * speedMultiplier;
      }
      return;
    }

    switch (this.movementStyle) {
      case 'keeper':   return this._moveKeeper(speedMultiplier, targetPos, deltaTime);
      case 'kiter':    return this._moveKiter(speedMultiplier, targetPos, deltaTime);
      case 'ambusher': return this._moveAmbusher(speedMultiplier, targetPos, deltaTime);
      case 'jumper':   return this._moveChaser(speedMultiplier, targetPos, deltaTime); // jump override applied post-update
      default:         return this._moveChaser(speedMultiplier, targetPos, deltaTime);
    }
  }

  /** chaser: direct pursuit using vector navigation */
  _moveChaser(speedMultiplier, targetPos, deltaTime) {
    if (this.collisionMap) {
      this.updateVectorNavigation(speedMultiplier, targetPos, deltaTime);
    } else {
      const dx = targetPos.x - this.position.x;
      const dy = targetPos.y - this.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 0) {
        this.targetVelocity.vx = (dx / dist) * this.speed * speedMultiplier;
        this.targetVelocity.vy = (dy / dist) * this.speed * speedMultiplier;
      }
    }
  }

  /**
   * keeper: maintain preferred range, sidestep while at range, backpedal if crowded.
   * Ranged/magic enemies use this so they fire from effective distance rather than
   * chasing into melee range.
   *
   * Config (all optional — defaults shown):
   *   preferredRange     = attackRange * 0.8
   *   rangeTolerance     = GRID.CELL_SIZE * 1.5
   */
  _moveKeeper(speedMultiplier, targetPos, deltaTime) {
    const dx = targetPos.x - this.position.x;
    const dy = targetPos.y - this.position.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist === 0) return;

    const cfg = this.movementConfig;
    const preferred  = cfg.preferredRange  ?? (this.attackRange * 0.8);
    const tolerance  = cfg.rangeTolerance  ?? (GRID.CELL_SIZE * 1.5);

    const dirX = dx / dist;
    const dirY = dy / dist;
    // Perpendicular axis for circle-strafing
    const perpX = -dirY * this.keeperStrafeDir;
    const perpY =  dirX * this.keeperStrafeDir;

    if (dist < preferred - tolerance) {
      // Too close — back away at full speed
      this.targetVelocity.vx = -dirX * this.speed * speedMultiplier;
      this.targetVelocity.vy = -dirY * this.speed * speedMultiplier;
    } else if (dist > preferred + tolerance) {
      // Too far — approach using nav system to route around walls
      this._moveChaser(speedMultiplier, targetPos, deltaTime);
    } else {
      // In preferred range — sidestep at 60% speed to avoid being a stationary target
      this.targetVelocity.vx = perpX * this.speed * speedMultiplier * 0.6;
      this.targetVelocity.vy = perpY * this.speed * speedMultiplier * 0.6;
    }
  }

  /**
   * kiter: maintain kiteDistance, circle-strafe, and rush after hoverTime.
   * Supports pack coordination (shared detection via this.packmates).
   *
   * Config (all optional — defaults shown):
   *   kiteDistance       = GRID.CELL_SIZE * 4
   *   retreatThreshold   = GRID.CELL_SIZE * 2
   *   hoverTime          = 2.5
   */
  _moveKiter(speedMultiplier, targetPos, deltaTime) {
    // Only activate kite tactics if this enemy or a packmate has detected the player
    const packDetected = this.detectionIndicatorTimer > 0 ||
      (this.packmates && this.packmates.some(m => m.detectionIndicatorTimer > 0));

    if (!packDetected) {
      return this._moveChaser(speedMultiplier, targetPos, deltaTime);
    }

    const cfg = this.movementConfig;
    const hoverTime = cfg.hoverTime ?? (this.packBehavior?.hoverTime ?? 2.5);

    // ESCAPE: player evaded during hover — reset and pursue
    if (this.isHovering && this.aggroMemoryActive) {
      this.isHovering = false;
      this.hoverLocked = false;
      this.hoverTimer = 0;
      return this._moveChaser(speedMultiplier, targetPos, deltaTime);
    }

    // ATTACK RUSH: committed rush after hover completes
    if (this.isAttacking) {
      this.attackRushTimer -= deltaTime;
      const dx = targetPos.x - this.position.x;
      const dy = targetPos.y - this.position.y;
      const navDist = Math.sqrt(dx * dx + dy * dy);
      if (navDist > 0) {
        this.targetVelocity.vx = (dx / navDist) * this.speed * speedMultiplier * 1.5;
        this.targetVelocity.vy = (dy / navDist) * this.speed * speedMultiplier * 1.5;
      }
      if (this.attackRushTimer <= 0 || navDist <= this.attackRange) {
        this.isAttacking = false;
        this.attackRushTimer = 0;
        this.hoverLocked = false;
        this.hoverTimer = 0;
        this.detectionIndicatorTimer = 0;
      }
      return;
    }

    // KITE MOVEMENT
    const packMovement = this.calculatePackMovement(targetPos, speedMultiplier);
    if (packMovement) {
      this.targetVelocity.vx = packMovement.vx;
      this.targetVelocity.vy = packMovement.vy;

      if (packMovement.shouldHover) {
        this.isHovering = true;
        this.hoverTimer += deltaTime;
        if (this.hoverTimer >= hoverTime) {
          this.isHovering = false;
          this.hoverTimer = 0;
          this.hoverLocked = false;
          this.isAttacking = true;
          this.attackRushTimer = 2.0;
          this.detectionIndicatorTimer = 2.0;
        }
      } else {
        this.isHovering = false;
      }
    } else {
      // No legacy packBehavior — implement kite movement using movementConfig directly
      const cfg = this.movementConfig;
      const kiteDistance = cfg.kiteDistance ?? GRID.CELL_SIZE * 4;
      const retreatThreshold = cfg.retreatThreshold ?? GRID.CELL_SIZE * 2;

      const dx = targetPos.x - this.position.x;
      const dy = targetPos.y - this.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;

      // Separation force from packmates
      let sepX = 0, sepY = 0;
      const sepDist = GRID.CELL_SIZE * 2;
      if (this.packmates) {
        for (const mate of this.packmates) {
          const mx = this.position.x - mate.position.x;
          const my = this.position.y - mate.position.y;
          const md = Math.sqrt(mx * mx + my * my);
          if (md < sepDist && md > 0) {
            const f = (sepDist - md) / sepDist;
            sepX += (mx / md) * f;
            sepY += (my / md) * f;
          }
        }
      }

      let vx = 0, vy = 0;
      if (dist < retreatThreshold && !this.hoverLocked) {
        // Too close — retreat
        vx = (-dx / dist) * 0.8 + sepX * 0.2;
        vy = (-dy / dist) * 0.8 + sepY * 0.2;
        this.hoverTimer = 0;
        this.isHovering = false;
        this.hoverLocked = false;
      } else if ((dist >= kiteDistance - GRID.CELL_SIZE && dist <= kiteDistance + GRID.CELL_SIZE * 2) || this.hoverLocked) {
        // At kite distance — lock hover and circle-strafe
        if (!this.hoverLocked) this.hoverLocked = true;
        this.isHovering = true;
        this.hoverTimer += deltaTime;
        if (this.hoverTimer >= hoverTime) {
          this.isHovering = false;
          this.hoverTimer = 0;
          this.hoverLocked = false;
          this.isAttacking = true;
          this.attackRushTimer = 2.0;
          this.detectionIndicatorTimer = 2.0;
        }
        const perpX = -dy / dist;
        const perpY = dx / dist;
        vx = perpX * 0.6 + sepX * 0.4;
        vy = perpY * 0.6 + sepY * 0.4;
      } else {
        // Too far — approach player
        vx = (dx / dist) * 0.8 + sepX * 0.2;
        vy = (dy / dist) * 0.8 + sepY * 0.2;
        if (!this.hoverLocked) {
          this.hoverTimer = 0;
          this.isHovering = false;
        }
      }

      const mag = Math.sqrt(vx * vx + vy * vy) || 1;
      this.targetVelocity.vx = (vx / mag) * this.speed * speedMultiplier * 0.8;
      this.targetVelocity.vy = (vy / mag) * this.speed * speedMultiplier * 0.8;
    }
  }

  /**
   * ambusher: stays dormant (rest state) until player enters wakeRadius,
   * then bursts at high speed before falling back to chaser behavior.
   *
   * Config (all optional — defaults shown):
   *   wakeRadius         = GRID.CELL_SIZE * 4  (used in rest-state check above)
   *   burstSpeed         = speed * 2.5
   *   burstDuration      = 1.0
   */
  _moveAmbusher(speedMultiplier, targetPos, deltaTime) {
    if (this.burstActive) {
      this.burstTimer -= deltaTime;
      const dx = targetPos.x - this.position.x;
      const dy = targetPos.y - this.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 0) {
        const burstSpeed = this.movementConfig.burstSpeed ?? (this.speed * 2.5);
        this.targetVelocity.vx = (dx / dist) * burstSpeed * speedMultiplier;
        this.targetVelocity.vy = (dy / dist) * burstSpeed * speedMultiplier;
      }
      if (this.burstTimer <= 0) this.burstActive = false;
      return;
    }
    // Post-burst: behave like a normal chaser
    this._moveChaser(speedMultiplier, targetPos, deltaTime);
  }

  /**
   * Idle wander movement. Drives targetVelocity each frame; picks a new direction
   * when wanderTimer expires. Stationary enemies hold position.
   * Player-position-agnostic — safe to call in any non-aggro state, including
   * "lingering at memory mark" so enemies don't freeze waiting for the timer.
   */
  _updateWanderMovement(speedMultiplier, deltaTime) {
    if (this.idleBehavior === 'stationary') {
      this.targetVelocity.vx = 0;
      this.targetVelocity.vy = 0;
      return;
    }

    this.wanderTimer -= deltaTime;
    if (this.wanderTimer <= 0) {
      const hasWaterAffinity = this.data.waterAffinity === true;
      let chosenAngle = Math.random() * Math.PI * 2;

      if (this.backgroundObjects && this.backgroundObjects.length > 0) {
        if (!hasWaterAffinity) {
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
            chosenAngle = nearestWaterAngle + (Math.random() - 0.5) * Math.PI * 0.4;
          }
        }
      }

      this.wanderDirection.x = Math.cos(chosenAngle);
      this.wanderDirection.y = Math.sin(chosenAngle);
      this.wanderTimer = 2 + Math.random() * 2;
    }

    this.targetVelocity.vx = this.wanderDirection.x * this.wanderSpeed * speedMultiplier;
    this.targetVelocity.vy = this.wanderDirection.y * this.wanderSpeed * speedMultiplier;
  }

  /**
   * Handles movement during the windup state.
   * windupMovement: 'stop' (default) | 'advance' | 'retreat'
   */
  _applyWindupMovement(speedMultiplier) {
    if (this.windupMovement === 'stop' || !this.target) {
      this.targetVelocity.vx = 0;
      this.targetVelocity.vy = 0;
      return;
    }
    const dx = this.target.position.x - this.position.x;
    const dy = this.target.position.y - this.position.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist === 0) { this.targetVelocity.vx = 0; this.targetVelocity.vy = 0; return; }
    const dirX = dx / dist;
    const dirY = dy / dist;
    const windupSpeed = this.speed * speedMultiplier * 0.4; // 40% speed during windup
    if (this.windupMovement === 'advance') {
      this.targetVelocity.vx = dirX * windupSpeed;
      this.targetVelocity.vy = dirY * windupSpeed;
    } else if (this.windupMovement === 'retreat') {
      this.targetVelocity.vx = -dirX * windupSpeed;
      this.targetVelocity.vy = -dirY * windupSpeed;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────

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

    // Safety net for memory mode: if currentDirection is pointing into the wrong hemisphere
    // (dot product < -0.5, i.e. more than ~120° off from the mark), force a recalc.
    // This catches any case where direction wasn't reset on memory-mode entry (e.g. external
    // setters). Conservative threshold avoids false-positives during legitimate wall navigation
    // where the angle may deviate up to ~90° from the direct path.
    let memoryMarkMisaligned = false;
    if (isPursuingStaticMark && (this.currentDirection.x !== 0 || this.currentDirection.y !== 0)) {
      const tDx = target.x - this.position.x;
      const tDy = target.y - this.position.y;
      const tDist = Math.sqrt(tDx * tDx + tDy * tDy);
      if (tDist > 0) {
        const dot = (this.currentDirection.x * tDx + this.currentDirection.y * tDy) / tDist;
        memoryMarkMisaligned = dot < -0.5;
      }
    }

    const needsRecalc = this.bruteForceTimer <= 0 && (
      (!isPursuingStaticMark && this.decisionTimer <= 0) ||
      this.stuckTimer > 0.3 ||
      (this.currentDirection.x === 0 && this.currentDirection.y === 0) ||
      currentPathObstructed ||
      memoryMarkMisaligned
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

      if (distance < this.navigationLength * 0.5 && !(this.stuckTimer > 0.3)) {
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
            this.memoryMarkSuspected = false;
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

    // Use actual collision map dimensions so this works for both the 30×30 room grid
    // and smaller interior grids (e.g. 10×10 hut, 24×24 dungeon).
    const mapRows = this.collisionMap.length;
    const mapCols = this.collisionMap[0]?.length ?? GRID.COLS;

    // Check each cell the ray enters until checkDist is reached
    for (let safety = 0; safety < 128; safety++) {
      if (gx < 0 || gx >= mapCols || gy < 0 || gy >= mapRows) return false;
      if (this.collisionMap[gy][gx]) return false;

      const tNext = Math.min(tMaxX, tMaxY);
      if (tNext >= checkDist) break; // Reached the end without hitting anything

      const EPS = 1e-6;
      if (Math.abs(tMaxX - tMaxY) < EPS) {
        // Exact corner: ray hits two cell boundaries simultaneously.
        // Check all three newly entered cells to avoid the diagonal-corner miss.
        const cx = gx + stepX, cy = gy + stepY;
        if (cx < 0 || cx >= mapCols || cy < 0 || cy >= mapRows) return false;
        // Cross cell
        if (cy < 0 || cy >= mapRows || cx >= 0 && cx < mapCols && this.collisionMap[gy][cx]) return false;
        if (cx < 0 || cx >= mapCols || cy >= 0 && cy < mapRows && this.collisionMap[cy][gx]) return false;
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
        const myPlane = planeOf(this);
        for (const obj of this.backgroundObjects) {
          if (obj.destroyed) continue;
          if (!objectOnPlane(obj, myPlane)) continue;
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
  hasVision(start, end, maxLength, { ignoreCone = false } = {}) {
    // Cyan rogue hide roll — target is undetectable
    if (this.target && this.target.hidden) {
      return false;
    }

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

    // ── Vision cone gate ────────────────────────────────────────────────────
    // Non-alerted enemies can only see within ±65° of their facing direction.
    // Alerted enemies (enraged or memory-chasing) have already turned toward the
    // player via velocity, so their cone naturally tracks. ignoreCone bypasses
    // this for sound-based detection (omnidirectional hearing).
    if (!this.enraged && !this.aggroMemoryActive && !ignoreCone) {
      const HALF_CONE_COS = Math.cos(65 * Math.PI / 180); // ~0.423
      const PROXIMITY_OVERRIDE = GRID.CELL_SIZE * 1.5;    // Knife-edge: bypass cone
      if (distance > PROXIMITY_OVERRIDE) {
        const dot = (dx / distance) * Math.cos(this.facingAngle)
                  + (dy / distance) * Math.sin(this.facingAngle);
        if (dot < HALF_CONE_COS) return false;
      }
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
        const myPlane = planeOf(this);
        for (const obj of this.backgroundObjects) {
          if (obj.destroyed) continue;
          // Skip objects not present on this enemy's plane (e.g. surfaceOnly when underground).
          if (!objectOnPlane(obj, myPlane)) continue;

          // Check if this sample point intersects with a background object.
          // Vision-blockers (grass) use a half-cell × half-cell pixel hitbox
          // centered on the grass so dense swaths form a real visual barrier
          // rather than a sparse 1-cell-aligned check.
          const blocksV = obj.blocksVision && obj.blocksVision();
          if (blocksV) {
            const halfExtent = GRID.CELL_SIZE * 0.25;
            const cx = obj.position.x + GRID.CELL_SIZE / 2;
            const cy = obj.position.y + GRID.CELL_SIZE / 2;
            if (Math.abs(checkX - cx) <= halfExtent &&
                Math.abs(checkY - cy) <= halfExtent) {
              // Grass doesn't block vision at close range — enemy can sense nearby player.
              // 3-cell threshold: you can't hide from something standing right next to you.
              if (distance > GRID.CELL_SIZE * 3) return false;
            }
          }

          const objGridX = Math.floor(obj.position.x / GRID.CELL_SIZE);
          const objGridY = Math.floor(obj.position.y / GRID.CELL_SIZE);
          if (objGridX === gridX && objGridY === gridY) {
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
  _isOnWater() {
    if (!this.backgroundObjects) return false;
    const ex = Math.floor(this.position.x / GRID.CELL_SIZE);
    const ey = Math.floor(this.position.y / GRID.CELL_SIZE);
    for (const obj of this.backgroundObjects) {
      if (!obj.isWater || !obj.isWater()) continue;
      if (Math.floor(obj.position.x / GRID.CELL_SIZE) === ex &&
          Math.floor(obj.position.y / GRID.CELL_SIZE) === ey) {
        return true;
      }
    }
    return false;
  }

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

  _dizzyAngleOffset() {
    return this.isDizzy() ? (Math.random() - 0.5) * (Math.PI * 4 / 3) : 0; // ±120°
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
        // Lava-immune enemies (e.g. Tortoise) switch to mini fire breath when standing in lava
        if (this.inLava && this.data?.lavaImmune) {
          return this.createMiniFireBreath();
        }
        return this.createMeleeAttack();
      case 'ranged':
        if (this.data.projectileType === 'rock') return this.createRockProjectile();
        if (this.data.projectileType === 'potion') return this.createPotionAttack();
        return this.createProjectile();
      case 'magic':
        if (this.data.steamCloud?.enabled) return this.createSteamCloudAttack();
        return this.createMagicAttack();
      case 'fire':
        return this.createFireBreath();
      case 'sap':
        return this.createSapAttack();
      case 'tongue':
        return this.createTongueAttack();
      default:
        return null;
    }
  }

  // ── New attack type: rock projectile (Pyroclast) ──────────────────────────
  createRockProjectile() {
    const aimPos = this.markedTargetPosition || this.target.position;
    const dx = aimPos.x - this.position.x;
    const dy = aimPos.y - this.position.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist === 0) return null;

    const angle = Math.atan2(dy, dx) + (Math.random() - 0.5) * 0.15 + this._dizzyAngleOffset();
    return {
      type: 'enemy_projectile',
      char: '0',
      position: {
        x: this.position.x + this.width / 2,
        y: this.position.y + this.height / 2
      },
      velocity: {
        vx: Math.cos(angle) * 150,
        vy: Math.sin(angle) * 150
      },
      damage: this.getEffectiveDamage(),
      color: '#aa6633',
      knockbackForce: 600,   // High knockback to push into hazards
      leavesScorch: true,    // Leaves slow patch on landing
      owner: this,
      shooterPlane: this.plane
    };
  }

  // ── New attack type: potion throw (Alchemist) ─────────────────────────────
  createPotionAttack() {
    const aimPos = this.markedTargetPosition || this.target.position;
    const dx = aimPos.x - this.position.x;
    const dy = aimPos.y - this.position.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist === 0) return null;

    const cfg = this.data.potionMechanic;
    const potion = cfg.potionTable[Math.floor(Math.random() * cfg.potionTable.length)];
    this.lastPotionThrown = potion;
    const angle = Math.atan2(dy, dx) + (Math.random() - 0.5) * 0.2 + this._dizzyAngleOffset();

    return {
      type: 'potion_projectile',
      char: '*',
      position: {
        x: this.position.x + this.width / 2,
        y: this.position.y + this.height / 2
      },
      velocity: {
        vx: Math.cos(angle) * 140,
        vy: Math.sin(angle) * 140
      },
      damage: this.getEffectiveDamage(),
      color: potion.color,
      potionEffect: potion.effect,
      aoeRadius: cfg.aoeRadius,
      owner: this,
      shooterPlane: this.plane
    };
  }

  // ── New attack type: steam cloud (Steam Specter) ──────────────────────────
  createSteamCloudAttack() {
    const cfg = this.data.steamCloud;
    if (!cfg) return this.createMagicAttack();

    const aimPos = this.markedTargetPosition || this.target.position;
    const dx = aimPos.x - this.position.x;
    const dy = aimPos.y - this.position.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist === 0) return null;

    const angle = Math.atan2(dy, dx) + (Math.random() - 0.5) * 0.2 + this._dizzyAngleOffset();
    return {
      type: 'steam_cloud',
      char: '~',
      position: {
        x: this.position.x + this.width / 2,
        y: this.position.y + this.height / 2
      },
      velocity: {
        vx: Math.cos(angle) * 100,
        vy: Math.sin(angle) * 100
      },
      damage: this.getEffectiveDamage(),
      color: '#dddddd',
      cloudRadius: cfg.cloudRadius,
      scaldDuration: cfg.scaldDuration,
      slowDuration: cfg.slowDuration,
      owner: this,
      shooterPlane: this.plane
    };
  }

  getFacingDirection() {
    const dx = this.target.position.x - this.position.x;
    const dy = this.target.position.y - this.position.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    return { x: dx / dist, y: dy / dist };
  }

  createMeleeAttack(knockback = true) {
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
      knockback: knockback ? 300 * (this.knockbackMultiplier ?? 1.0) : 0,
      isImpact: this.data.isImpact === true,
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
      // Offset from owner's position so the hitbox tracks the enemy if it
      // gets knocked back mid-windup (windupImmune enemies like the Slime).
      ownerOffsetX: dirX * attackDistance,
      ownerOffsetY: dirY * attackDistance,
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
    const finalAngle = baseAngle + randomness + this._dizzyAngleOffset();

    if (this.data.projectileType === 'arrow') {
      return {
        type: 'arrow',
        char: this.getArrowCharForAngle(finalAngle),
        position: {
          x: this.position.x + this.width / 2,
          y: this.position.y + this.height / 2
        },
        velocity: {
          vx: Math.cos(finalAngle) * 200,
          vy: Math.sin(finalAngle) * 200
        },
        damage: this.getEffectiveDamage(),
        color: '#c8a46e',
        owner: this,
        shooterPlane: this.plane
      };
    }

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
      owner: this,
      shooterPlane: this.plane
    };
  }

  createTongueAttack() {
    const aimPos = this.markedTargetPosition || this.target.position;
    const dx = aimPos.x - this.position.x;
    const dy = aimPos.y - this.position.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist === 0) return null;

    return {
      type: 'tongue',
      owner: this,
      direction: { x: dx / dist, y: dy / dist },
      maxLength: GRID.CELL_SIZE * 2.5,
      currentLength: 0,
      phase: 'extending',
      extendDuration: 0.10, // 100ms to snap out
      holdDuration:   0.04, // 40ms at full extension
      retractDuration: 0.12, // 120ms to retract
      timer: 0,
      damage: this.getEffectiveDamage(),
      hasHit: false,
      color: '#ff88aa',
      shooterPlane: this.plane
    };
  }

  getArrowCharForAngle(angle) {
    let normalizedAngle = angle % (Math.PI * 2);
    if (normalizedAngle < 0) normalizedAngle += Math.PI * 2;
    const degrees = normalizedAngle * (180 / Math.PI);
    if (degrees >= 337.5 || degrees < 22.5) return '→';
    else if (degrees >= 22.5 && degrees < 67.5) return '↘';
    else if (degrees >= 67.5 && degrees < 112.5) return '↓';
    else if (degrees >= 112.5 && degrees < 157.5) return '↙';
    else if (degrees >= 157.5 && degrees < 202.5) return '←';
    else if (degrees >= 202.5 && degrees < 247.5) return '↖';
    else if (degrees >= 247.5 && degrees < 292.5) return '↑';
    else return '↗';
  }

  createMagicAttack() {
    const aimPos = this.markedTargetPosition || this.target.position;
    const dx = aimPos.x - this.position.x;
    const dy = aimPos.y - this.position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance === 0) return null;

    const dirX = dx / distance;
    const dirY = dy / distance;

    let targetAngle = Math.atan2(dirY, dirX) + this._dizzyAngleOffset();

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
        owner: this,
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

    let targetAngle = Math.atan2(dirY, dirX) + this._dizzyAngleOffset();

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
        onHit: 'burn',
        owner: this,
        shooterPlane: this.plane
      });
    }

    return projectiles;
  }

  createMiniFireBreath() {
    const aimPos = this.markedTargetPosition || this.target.position;
    const dx = aimPos.x - this.position.x;
    const dy = aimPos.y - this.position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance === 0) return null;

    const dirX = dx / distance;
    const dirY = dy / distance;
    const targetAngle = Math.atan2(dirY, dirX) + this._dizzyAngleOffset();

    // 5 burn projectiles matching the Turtle Boss's fire style — same char, color, and onHit
    const projectiles = [];
    for (let i = -2; i <= 2; i++) {
      const baseAngle = targetAngle + (i * 0.13);
      const angle = baseAngle + (Math.random() - 0.5) * 0.05;
      projectiles.push({
        type: 'enemy_projectile',
        char: '*',
        position: {
          x: this.position.x + this.width / 2,
          y: this.position.y + this.height / 2
        },
        velocity: {
          vx: Math.cos(angle) * 145,
          vy: Math.sin(angle) * 145
        },
        damage: this.getEffectiveDamage(),
        color: '#ff4400',
        onHit: 'burn',
        owner: this,
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
    // Shell form: immune to all damage; knockback still applies via physics
    if (this.inShellForm) return false;

    // Block during iframes unless the hit comes from the same attack burst that
    // triggered the iframe (allows multi-bullet weapons to land all their shots).
    if (this.invulnerabilityTimer > 0) {
      const sameBurst = attackId !== null && attackId === this.lastHitAttackId;
      if (!sameBurst) return false;
    }

    this.hp -= amount;
    if (this.hp < 0) this.hp = 0;

    // Per-enemy hit SFX. Death SFX is handled by the enemy-removal loop in
    // main.js so it isn't doubled up here. `sfx.hit` may be a string or an
    // array of strings (random pick).
    if (this.hp > 0) {
      const hitSfx = this.data?.sfx?.hit ?? 'enemy_hit';
      const name = Array.isArray(hitSfx)
        ? hitSfx[Math.floor(Math.random() * hitSfx.length)]
        : hitSfx;
      this.game?.audioSystem?.playSFX(name);
    }

    // ── Giant Slime: split a child off on damage ──────────────────────────────
    if (this.hp > 0 && this.data.splitOnDamage?.enabled) {
      this._trySplitOnDamage();
    }

    // ── Giant Slime: accumulate damage toward goo-spew cone ───────────────────
    if (this.hp > 0 && this.data.gooSpewCone?.enabled) {
      this.spewDamageAccum = (this.spewDamageAccum || 0) + amount;
      const cfg = this.data.gooSpewCone;
      if (!this.spewWindupActive && this.spewDamageAccum >= cfg.damageThreshold) {
        this.spewDamageAccum -= cfg.damageThreshold;
        this.spewWindupActive = true;
        this.spewWindupTimer = cfg.chargeUpTime;
      }
    }

    // Sleep breaks on damage
    if (this.statusEffects.sleep && this.statusEffects.sleep.active) {
      this.statusEffects.sleep.active = false;
      this.statusEffects.sleep.duration = 0;
    }

    // Sapping breaks on damage - enemy gets knocked away
    if (this.sapping) {
      this.breakSapping(200); // Knockback force
    }

    // Mimic tongue releases on any damage taken
    if (this.mimicTongue?.phase === 'hooked' && this.target) {
      this.target.hookedByMimic = null;
      this.mimicTongue = null;
      this.mimicTongueCooldown = 8.0;
    }

    // Become enraged when attacked - never un-aggro
    this.enraged = true;

    // Interrupt windup when taking damage (unless immune)
    if (this.state === 'windup' && !this.windupImmune) {
      this.windupTimer = 0;
    }

    // Lock onto attacker's position for navigation.
    // If the enemy can't see the attacker (ranged hit from concealment), treat the mark
    // as suspected — go investigate rather than entering direct chase.
    if (this.target) {
      const canSeeAttacker = this.hasVision(this.position, this.target.position, this.visionLength);
      this.lastKnownPosition = { x: this.target.position.x, y: this.target.position.y };
      if (canSeeAttacker) {
        this.memoryMarkSuspected = false;
        this.aggroMemoryActive = false;
        this.state = 'chase';
      } else {
        this.memoryMarkSuspected = true;
        this.aggroMemoryActive = true;
        this.memoryChaseTimer = 5.0;
        this.memoryMoveDelayTimer = 0; // No delay — investigate immediately
        this.memoryMarkPlane = this.plane;
        this.memoryStaleTimer = 2.0;
        this.currentDirection = { x: 0, y: 0 };
        this.state = 'chase';
      }
    }

    // Flash ! when hit (overrides ? indicator)
    this.detectionIndicatorTimer = this.detectionIndicatorDuration;

    // Start (or refresh) invulnerability frames and record the triggering burst
    if (this.hp > 0) {
      this.invulnerabilityTimer = this.invulnerabilityDuration;
      this.lastHitAttackId = attackId;
    }

    // Retreat into shell after taking damage (shell-armored enemies)
    if (this.data?.shellCamouflage && this.hp > 0) {
      this.inShellForm = true;
      this.shellFormTimer = 2.5;
      this.knockbackResistance = 0.8; // Restore shell knockback reduction
      this.state = 'idle';
      this.burstActive = false;
    }

    // Return true if dead, or a truthy value if damaged (for damage numbers)
    return this.hp <= 0 ? true : { damaged: true };
  }

  isInvulnerable() {
    return this.invulnerabilityTimer > 0;
  }

  shouldRenderVisible() {
    return true;
  }

  getIframeFlashColor() {
    if (this.invulnerabilityTimer <= 0) return null;
    const blinkCycle = Math.floor(this.invulnerabilityTimer / ENEMY_BLINK_FREQUENCY);
    return blinkCycle % 2 === 0 ? '#ffffff' : null;
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

    // Freeze visual
    if (this.statusEffects.freeze && this.statusEffects.freeze.active) {
      if (this.statusEffects.freeze.frozen) {
        if (this.statusEffects.freeze.shuddering) {
          // Rapid shudder flash between ice-white and ice-blue before breaking free
          const shudderCycle = Math.floor(this.dotBlinkTimer / 0.06);
          return shudderCycle % 2 === 0 ? '#ffffff' : '#aaffff';
        }
        return '#aaffff'; // Solid ice color — fully locked
      }
      // Puddle/slime slow: subtle cyan blink
      const blinkCycle = Math.floor(this.dotBlinkTimer / DOT_BLINK_FREQUENCY);
      return blinkCycle % 2 === 0 ? '#00ffff' : this.baseColor;
    }

    // Wet blink (blue, lowest priority - only shows when no DoT or stun active)
    if (this.statusEffects.wet && this.statusEffects.wet.active) {
      const blinkCycle = Math.floor(this.dotBlinkTimer / DOT_BLINK_FREQUENCY);
      return blinkCycle % 2 === 0 ? '#4488ff' : this.baseColor;
    }
    // Dizzy blink (gold)
    if (this.statusEffects.dizzy?.active) {
      const blinkCycle = Math.floor(this.dotBlinkTimer / DOT_BLINK_FREQUENCY);
      return blinkCycle % 2 === 0 ? '#ddbb00' : this.baseColor;
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
        // Gray = suspected (heard/felt); yellow = confirmed (saw player go somewhere)
        color: this.memoryMarkSuspected ? '#aaaaaa' : '#ffff00',
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

  // ── Giant Slime: split-on-damage ─────────────────────────────────────────────
  _trySplitOnDamage() {
    const cfg = this.data.splitOnDamage;
    if (!cfg?.enabled) return;
    if (!this.splitChildren) this.splitChildren = new Set();
    if (this.hp < cfg.minHpToSplit) return;
    if (this.splitChildren.size >= cfg.maxActiveChildren) return;
    if (!this.game?.enemySpawnSystem) return;

    // Queue a spawn request and tag the resulting child with reform fields
    // once it's created. We rely on the EnemySpawnSystem.flush path that
    // calls roomGenerator.spawnEnemiesFrom for placement; the freshly-spawned
    // enemy is pushed into the room and we link it here by walking the most
    // recent spawns. Simpler: enqueue, then inject linkage on next flush.
    this.game.enemySpawnSystem.queueRequest(this, {
      spawnChar: cfg.spawnChar,
      spawnCount: 1,
      spawnRange: this.data.attackRange ?? 24,
      spawnerPosition: { x: this.position.x, y: this.position.y },
      _splitChildLink: {
        parent: this,
        reformDelay: cfg.reformDelay,
        reformValue: cfg.reformValue
      }
    });
  }

  registerSplitChild(child, cfg) {
    if (!this.splitChildren) this.splitChildren = new Set();
    child.parentRef = this;
    child.reformDelay = cfg.reformDelay;
    child.reformValue = cfg.reformValue;
    child.reformReturning = false;
    this.splitChildren.add(child);
  }

  notifySplitChildGone(child, absorbed) {
    if (!this.splitChildren) return;
    if (this.splitChildren.has(child)) this.splitChildren.delete(child);
    if (absorbed) this.absorbChild(child.reformValue || 0);
  }

  absorbChild(value) {
    if (!value) return;
    const max = this.data.hp;
    this.hp = Math.min(max, this.hp + value);
    this.game?.audioSystem?.playSFX('goo_hit');
  }

  getSpawnIndicator() {
    if (this.spawnWindupActive && this.spawnWindupTimer > 0) {
      return { char: '+', color: '#ff00ff', offsetY: -GRID.CELL_SIZE };
    }
    if (this.spewWindupActive && this.spewWindupTimer > 0) {
      // Pulse between bright and dim green so the windup is unmistakable
      const bright = Math.floor(Date.now() / 120) % 2 === 0;
      return { char: '*', color: bright ? '#88ff88' : '#00ff00', offsetY: -GRID.CELL_SIZE };
    }
    if (this.rallyIndicatorTimer > 0) {
      return { char: '!', color: '#ff3333', offsetY: -GRID.CELL_SIZE };
    }
    return null;
  }

  getBlindIndicator() {
    if (this.isBlind()) {
      return { char: 'X', color: '#ff0000', offsetY: -GRID.CELL_SIZE };
    }
    return null;
  }

  _weaponPower(item) {
    if (!item || item.data?.type !== 'WEAPON') return -1;
    return item.data.damage ?? 0;
  }

  evaluateItemPickup(items) {
    if (!this.itemUsage || !this.itemUsage.canPickup) return null;

    const hasSpace = this.inventory.length < this.itemUsage.maxItems;
    const equippedPower = this._weaponPower(this.equippedWeapon);

    let bestItem = null;
    let bestScore = 0;

    for (const item of items) {
      const distance = Math.hypot(
        item.position.x - this.position.x,
        item.position.y - this.position.y
      );
      if (distance > this.itemUsage.pickupRange) continue;
      if (!this.itemUsage.preferredItems.includes(item.char)) continue;

      const isWeapon = item.data?.type === 'WEAPON';

      if (!hasSpace) {
        // Inventory full → only swap to a strictly stronger weapon
        if (!isWeapon) continue;
        if (this._weaponPower(item) <= equippedPower) continue;
      }

      // Weapon score scales with raw damage so goblins prefer the strongest
      // blade nearby; non-weapons (e.g. health pots) keep a modest baseline.
      let score = isWeapon ? (10 + (item.data.damage ?? 1) * 4) : 5;
      score *= (1.0 - (distance / this.itemUsage.pickupRange));

      if (score > bestScore) {
        bestScore = score;
        bestItem = item;
      }
    }

    return bestItem;
  }

  /**
   * Pick up an item. Returns the displaced inventory item if the enemy had to
   * drop its current weapon to make room (the caller is expected to put that
   * item back into the world), or `null` if no swap happened. Returns `false`
   * if the pickup was rejected entirely.
   */
  pickupItem(item) {
    if (!this.itemUsage) return false;

    const isWeapon = item.data?.type === 'WEAPON';
    let displaced = null;

    if (this.inventory.length >= this.itemUsage.maxItems) {
      // Only swap when the incoming item is a strictly stronger weapon.
      if (!isWeapon) return false;
      if (this._weaponPower(item) <= this._weaponPower(this.equippedWeapon)) return false;

      displaced = this.equippedWeapon;
      if (displaced) {
        const idx = this.inventory.indexOf(displaced);
        if (idx >= 0) this.inventory.splice(idx, 1);
        displaced.position.x = this.position.x;
        displaced.position.y = this.position.y;
        displaced.velocity = { vx: 0, vy: 0 };
        this.equippedWeapon = null;
      }
    }

    this.inventory.push(item);
    if (isWeapon) this.equipWeapon(item);

    return displaced;
  }

  equipWeapon(item) {
    if (item.data.type !== 'WEAPON') return;

    this.equippedWeapon = item;

    if (item.data.weaponType === 'GUN' || item.data.weaponType === 'BOW') {
      this.attackType = 'item_ranged';
      // Restore keeper distance-hold behavior for ranged loadouts.
      if (this.data.movementStyle) this.movementStyle = this.data.movementStyle;
      this.leapOnAttack = false;
      this.attackRange = this.itemUsage.useRange;
    } else {
      this.attackType = 'item_melee';
      // Melee weapon → close the distance instead of holding bow range, then
      // commit a forward leap when the swing fires (see windup → attack
      // transition in update()). attackRange is tightened so melee goblins
      // don't try to swing from across the room. Fall back to the same range
      // default Item.createMeleeAttack uses (20) — spear has no `range` field
      // and would otherwise produce NaN here, leaving the goblin unable to
      // ever register being in attack range.
      this.movementStyle = 'chaser';
      this.leapOnAttack = true;
      const wpnRange = item.data.range ?? 20;
      this.attackRange = Math.max(GRID.CELL_SIZE * 1.5, wpnRange * 1.2);
    }
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
    // Player-style weapons return type:'melee'; route those to the enemy melee
    // path so they land in enemyMeleeAttacks instead of enemyProjectiles (which
    // would crash on the missing velocity field). No other field overrides —
    // the goblin gets whatever Item.createMeleeAttack produces, in parity with
    // a player swinging the same weapon.
    const remap = (a) => {
      const out = { ...a, owner: this, shooterPlane: this.plane };
      if (out.type === 'melee') out.type = 'enemy_melee';
      return out;
    };
    if (Array.isArray(attack)) return attack.map(remap);
    return remap(attack);
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
    // Restore original movement archetype (we may have swapped to chaser when
    // equipping a melee weapon).
    if (this.data.movementStyle) this.movementStyle = this.data.movementStyle;

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
