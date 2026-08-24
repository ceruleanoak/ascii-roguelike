import { GRID, COLORS, PHYSICS } from '../game/GameConfig.js';
import { ENEMIES, resolveHitSfx } from '../data/enemies.js';
import { isImmuneToEffect, getElementalModifierFor } from './elementalAffinity.js';
import { Item } from './Item.js';
import { attachTelegraph, meleeAimOffset } from '../game/Telegraph.js';
import { inSamePlane, planeOf, objectOnPlane } from '../systems/PlaneSystem.js';
import { hasLineOfSight, getVisionObstructionPoint, hasVision, spineCanSee } from './enemyVision.js';
import { EXIT_SLOT_POSITIONS } from '../systems/ExitSystem.js';
import { LureMechanic } from './enemyMechanics/LureMechanic.js';
import { ParryMechanic } from './enemyMechanics/ParryMechanic.js';
import { ReflectShieldMechanic } from './enemyMechanics/ReflectShieldMechanic.js';
import { BuffMechanic } from './enemyMechanics/BuffMechanic.js';
import { TrailMechanic } from './enemyMechanics/TrailMechanic.js';
import { TrapLayerMechanic } from './enemyMechanics/TrapLayerMechanic.js';
import { ChargeMechanic } from './enemyMechanics/ChargeMechanic.js';
import { LeapAttackMechanic } from './enemyMechanics/LeapAttackMechanic.js';
import { GooSpewMechanic } from './enemyMechanics/GooSpewMechanic.js';
import { ReformMechanic } from './enemyMechanics/ReformMechanic.js';
import { MimicMechanic } from './enemyMechanics/MimicMechanic.js';
import { LeaderFollowerMechanic } from './enemyMechanics/LeaderFollowerMechanic.js';
import { JumpMechanic } from './enemyMechanics/JumpMechanic.js';
import { SlimeTrailDropMechanic } from './enemyMechanics/SlimeTrailDropMechanic.js';
import { PackBehaviorMechanic } from './enemyMechanics/PackBehaviorMechanic.js';
import { FlockMechanic } from './enemyMechanics/FlockMechanic.js';
import { ShellFormMechanic } from './enemyMechanics/ShellFormMechanic.js';
import { ArmorMechanic } from './enemyMechanics/ArmorMechanic.js';
import { PotionMechanic } from './enemyMechanics/PotionMechanic.js';
import { WindupTelegraphMechanic } from './enemyMechanics/WindupTelegraphMechanic.js';
import { SplitOnDamageMechanic } from './enemyMechanics/SplitOnDamageMechanic.js';
import { RiseAgainMechanic } from './enemyMechanics/RiseAgainMechanic.js';
import { PatrolMechanic } from './enemyMechanics/PatrolMechanic.js';
import { GameAnimalMechanic } from './enemyMechanics/GameAnimalMechanic.js';
import { SniperMechanic } from './enemyMechanics/SniperMechanic.js';
import { RipenMechanic } from './enemyMechanics/RipenMechanic.js';
import { ThiefMechanic } from './enemyMechanics/ThiefMechanic.js';
import { EnemyStateMachine, legacyStateFor } from './EnemyStateMachine.js';
import { statesFor } from '../data/stateDefaults.js';
import { computeBlinkColor, computePipRows } from '../systems/StatusEffectVisuals.js';
import {
  applyStatusEffect as applyStatusEffectImpl,
  clearEffectOrder as clearEffectOrderImpl,
  updateStatusEffects as updateStatusEffectsImpl
} from '../systems/EnemyStatusEffects.js';

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

export class Enemy {
  constructor(char, x, y, depth = 0, dataOverride = null) {
    this.char = char;
    // dataOverride: for enemies spawned outside the ENEMIES char registry (e.g. Eel, Moose, Rabbit).
    this.data = dataOverride || ENEMIES[char] || {
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
    // Rendered glyph — defaults to `char`. A tougher variant (e.g. Plague Rat)
    // can set `data.displayChar` to read as its base family's letter, so the
    // player's glyph→family memory carries over; only color signals the tier.
    this.displayChar = this.data.displayChar ?? char;

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
    this.knockbackResistance = this.data.knockbackResistance ?? 0;
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

    // Speed-collision grace: frames (not seconds) to skip enemy-on-enemy speed
    // collision after taking damage — see PhysicsSystem.resolveSpeedCollisions.
    // Prevents a just-hit enemy's still-overlapping hitbox from re-triggering
    // knockback/damage against the same neighbor before it has moved away.
    this.speedCollisionGraceFrames = 0; // set to 2 on hit; see takeDamage()

    // Rendering
    this.color = this.data.color;
    this.baseColor = this.data.color; // Store original color
    this.width = GRID.CELL_SIZE;
    this.height = GRID.CELL_SIZE;

    // Physics flags
    this.isEnemy = true; // lets PhysicsSystem distinguish enemies from player/projectiles without an import
    this.hasCollision = true;
    this.boundToGrid = true;
    this.collisionMap = null;
    this.backgroundObjects = null; // Reference to background objects for vision checks
    this.plane = 0; // 0=normal plane, 1=tunnel plane

    // AI state
    this.target = null;
    // Cached return value of this frame's update(), written by the canonical
    // tick (main.js surface loop / HutSystem / DungeonSystem) and consumed by
    // CombatSystem.update — bug #92: CombatSystem must not re-tick.
    this._frameUpdateResult = null;
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

    // Flee state — running from a memory mark rather than pursuing one.
    this.fleeing = false; // Whether Flee has armed its mark (mirrors aggroMemoryActive's role for Search)
    this.fleeReachedBarrier = false; // Lookback found the player can't currently see this enemy
    this.fleeBarrierPauseTimer = null; // Countdown held at a barrier before whatever reacts to it fires
    this.fleeLookbackTimer = null; // Countdown to the next lookback beat — fleeReachedBarrier only updates on this tick
    this.fleeElapsedTime = 0; // Time spent in the current flight (mirrors machine.timer) — tapers moveFlee's scatter jitter
    this.fleeHeadingTimer = 0; // Countdown to the next heading decision — moveFlee only re-jitters/re-scans on this tick, not every frame
    this.fleeHeadingAngle = null; // Locked heading (radians), held stable between decisions

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
      // `stacks` (capped at 3, see EnemyStatusEffects.js's MAX_STACKUP) counts
      // how many times each of these 10 blink-capable effects has been freshly
      // applied while still active — generic across every effect and every
      // source (weapon, oil, any future onHit), not special-cased per effect
      // name. Drives blink speed uniformly; poison and sleep layer additional
      // stack-driven behavior (tick-rate scaling, tier escalation) elsewhere.
      // knockback/blind aren't blink-capable and don't track stacks.
      burn: { active: false, duration: 5, damage: 1, tickRate: 1.25, tickTimer: 0, stacks: 0 }, // ~4 ticks of 1 over 5s — short, punchy, readable
      poison: { active: false, duration: 0, damage: 1, tickRate: 3.0, tickTimer: 0, stacks: 0 },
      freeze: { active: false, duration: 0, slowAmount: 0.5, frozen: false, shuddering: false, stacks: 0 },
      stun: { active: false, duration: 0, stacks: 0 },
      zap: { active: false, duration: 0, stacks: 0 }, // electric-affinity stun; renders with rapid shake
      sleep: { active: false, duration: 0, stacks: 0 },
      charm: { active: false, duration: 0, stacks: 0 },
      wet: { active: false, duration: 0, stacks: 0 },
      knockback: { active: false, duration: 0 },
      blind: { active: false, duration: 0 }, // Attacks miss (0 damage)
      dizzy: { active: false, duration: 0, stacks: 0 },
      goo: { active: false, duration: 0, slowAmount: 0.8, stacks: 0 }
    };

    // Ordered list of currently-active blink-capable effect names, in the
    // order they most recently transitioned inactive→active. Drives the
    // round-robin blink color and stack-pip rows (StatusEffectVisuals.js) —
    // read side re-filters by .active live, so a bypass that flips `.active`
    // directly (e.g. PhysicsSystem.js's water-extinguishes-burn) can't leak
    // a stale entry into what's actually shown.
    this.effectApplicationOrder = [];

    // Venom Blade stack counter — resets when poison wears off. Deliberately
    // separate from statusEffects.poison.stacks above: this is a
    // weapon-specific 3-hit burst-damage bonus (see CombatSystem.js), not the
    // generic tick-rate/blink stacking every effect now has.
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

    // Sapping system (for bat enemy)
    this.sapping = false;
    this.sappingTarget = null;
    this.sapDamageTimer = 0;
    this.sapDamageInterval = this.data.sapDamageInterval || 1.0;
    this.sapDamage = this.data.sapDamage || 1; // Fixed sap damage (not scaled by depth)
    this.sapSlot = -1; // Which sap slot this bat occupies on the target (0, 1, or 2)

    // packBehavior / jumpBehavior are legacy data-side fields; their mechanics
    // read them as fallbacks for movementConfig. Kept on enemy so other code
    // paths that still check these see the same references.
    this.packBehavior = this.data.packBehavior || null;
    this.jumpBehavior = this.data.jumpBehavior || null;

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
      // Countdown for the optional `strafeFlipInterval` flip (moveKeeper);
      // seeded to the full interval so the first flip lands on cadence.
      this.keeperFlipTimer = this.movementConfig?.strafeFlipInterval ?? 0;
    }
    if (this.movementStyle === 'ambusher') {
      this.burstTimer = 0;
      this.burstActive = false;
      this.state = 'rest'; // Ambushers start dormant
    }

    // The State spine — every enemy's AI, from spawn.
    this.stateMachine = new EnemyStateMachine(this, statesFor(this.data));

    // Optional random spawn loadout (e.g. goblins arrive with a basic weapon).
    // Skipped silently if itemUsage isn't enabled or the roll fails. Must run
    // after stateMachine init — equipWeapon's melee branch reads it.
    if (this.itemUsage && this.itemUsage.enabled && this.data.spawnEquipment) {
      const cfg = this.data.spawnEquipment;
      if (Math.random() < (cfg.chance ?? 1.0) && Array.isArray(cfg.weapons) && cfg.weapons.length > 0) {
        const choice = cfg.weapons[Math.floor(Math.random() * cfg.weapons.length)];
        const weapon = new Item(choice, x, y);
        this.pickupItem(weapon);
      }
    }

    if (ShellFormMechanic.isEnabled(this)) ShellFormMechanic.init(this);

    // Lava state tracking (for lava-immune enemies that change behavior in lava)
    this.inLava = false;

    // Lava contact for non-immune enemies (PhysicsSystem.applyLiquidResults
    // sets this every frame). Lava deals its own damage tick rather than the
    // burn DOT, but reads as "burning" for the status pip — StatusEffectVisuals.js.
    this.inDamagingLiquid = false;

    if (PackBehaviorMechanic.isEnabled(this)) PackBehaviorMechanic.init(this);

    if (JumpMechanic.isEnabled(this)) JumpMechanic.init(this);
    if (FlockMechanic.isEnabled(this)) FlockMechanic.init(this);

    if (ChargeMechanic.isEnabled(this)) ChargeMechanic.init(this);

    if (MimicMechanic.isEnabled(this)) MimicMechanic.init(this);

    if (BuffMechanic.isEnabled(this)) BuffMechanic.init(this);

    if (TrailMechanic.isEnabled(this)) TrailMechanic.init(this);

    // Death explosion + Hex mechanic have no init — they fire once on death /
    // as a magic attack.

    if (ArmorMechanic.isEnabled(this)) ArmorMechanic.init(this);
    if (LureMechanic.isEnabled(this)) LureMechanic.init(this);
    if (ParryMechanic.isEnabled(this)) ParryMechanic.init(this);
    if (ReflectShieldMechanic.isEnabled(this)) ReflectShieldMechanic.init(this);
    if (TrapLayerMechanic.isEnabled(this)) TrapLayerMechanic.init(this);
    if (PotionMechanic.isEnabled(this)) PotionMechanic.init(this);
    if (SplitOnDamageMechanic.isEnabled(this)) SplitOnDamageMechanic.init(this);
    if (RiseAgainMechanic.isEnabled(this)) RiseAgainMechanic.init(this);

    if (GooSpewMechanic.isEnabled(this)) GooSpewMechanic.init(this);

    if (PatrolMechanic.isEnabled(this)) PatrolMechanic.init(this);

    GameAnimalMechanic.init(this);

    if (LeapAttackMechanic.isEnabled(this)) LeapAttackMechanic.init(this);
    if (SniperMechanic.isEnabled(this)) SniperMechanic.init(this);
    if (RipenMechanic.isEnabled(this)) RipenMechanic.init(this);
    if (ThiefMechanic.isEnabled(this)) ThiefMechanic.init(this);

    if (SlimeTrailDropMechanic.isEnabled(this)) SlimeTrailDropMechanic.init(this);

    // ── Reform behavior (split-child slimes) ──────────────────────────────────
    // parentRef, mergeCooldownTimer, reformValue are attached post-construction
    // by the Giant Slime split path. Fields default to inactive.
    this.parentRef = null;
    this.mergeCooldownTimer = 0;
    this.reformValue = 0;

    // ── Follow-leader (Goblin Army followers) ─────────────────────────────────
    // leaderRef, formationRadius, etc. attached post-construction by the
    // Goblin Army encounter spawner. Released by leader rally call when
    // leader is far from player.
    this.leaderRef = null;
    this.followerRoleActive = false;
    this.rallyBoostTimer = 0;

    if (LeaderFollowerMechanic.isRallyEnabled(this)) LeaderFollowerMechanic.initRally(this);

    // (Goblin Chief bash uses the existing chargeMechanic state machine —
    // no separate bashAttack init needed; tuned via data.chargeMechanic values.)

    // ── Knockback multiplier ──────────────────────────────────────────────────
    this.knockbackMultiplier = this.data.knockbackMultiplier ?? 1.0;

    // Bread-seek (wild rat → dropped loaf). Set by main.js when bread lands
    // in the room (SPACE drop or SHIFT throw). The Enemy AI uses these to
    // redirect movement toward the loaf; main.js replaces the wild rat with
    // an NPCRat instance on contact. `breadSeekStartTime` gates the eat so
    // a rat already adjacent to the bread can't be tamed in a single frame
    // — the visible "walk to bread" beat is required for the eat to read.
    this.seekingBread = false;
    this.breadTarget = null;
    this.breadSeekStartTime = 0;
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

  // Immunity model (see elementalAffinity.js for the actual rules):
  //   - Explicit `elementalAffinity.immunity: [effect, ...]` blocks specific effects by name.
  //   - Affinity auto-immunity: if the effect maps to an affinity (EFFECT_AFFINITY) and the
  //     enemy's `data.affinities` includes that affinity, the effect is blocked. This way a
  //     fire-affinity enemy is auto-immune to burn (and any future fire-affinity effect) with
  //     no per-effect data needed.
  //   - Resistance/weakness lookup is keyed by effect name (not affinity).
  _isImmuneToEffect(effect) {
    return isImmuneToEffect(this.elementalAffinity, this.data?.affinities, effect);
  }

  getElementalModifier(elementType) {
    return getElementalModifierFor(this.elementalAffinity, this.data?.affinities, elementType);
  }

  shouldApplyStatusEffect(effect) {
    return !this._isImmuneToEffect(effect);
  }

  // Activation + generic stack increment; ticking/expiry lives alongside it
  // in EnemyStatusEffects.js (write side of statusEffects — the read side,
  // blink color and stack pips, is StatusEffectVisuals.js). Kept as a thin
  // delegating method so every existing `enemy.applyStatusEffect(...)` call
  // site across the codebase is unaffected.
  applyStatusEffect(effect, duration = 3.0) {
    applyStatusEffectImpl(this, effect, duration);
  }

  // Removes an effect from the round-robin blink/pip order. See
  // EnemyStatusEffects.js's clearEffectOrder for the full explanation.
  _clearEffectOrder(effect) {
    clearEffectOrderImpl(this, effect);
  }

  updateStatusEffects(deltaTime) {
    return updateStatusEffectsImpl(this, deltaTime);
  }

  isStunned() {
    return this.statusEffects.stun.active;
  }

  // Zap = electric-affinity immobilization. Mechanically blocks movement/attacks like stun;
  // visually distinct (rapid shake render). Affinity gating means electric enemies are auto-immune.
  isZapped() {
    return this.statusEffects.zap.active;
  }

  isFrozen() {
    return this.statusEffects.freeze.active && this.statusEffects.freeze.frozen;
  }

  isWet() { return this.statusEffects.wet.active; }

  isSleeping() { return this.statusEffects.sleep.active; }

  // Drowse tiers: 1 stack = mild slow, 2 = severe slow (both still moving —
  // see getSpeedMultiplier), 3 = fully asleep (AI halted). Only tier 3 halts
  // the AI; isSleeping() above stays "any tier" for API parity.
  isFullyAsleep() { return this.statusEffects.sleep.active && this.statusEffects.sleep.stacks >= 3; }

  isCharmed() { return this.statusEffects.charm.active; }

  isKnockedBack() { return this.statusEffects.knockback.active; }


  isBlind() { return this.statusEffects.blind.active; }

  isDizzy() { return this.statusEffects.dizzy.active; }

  isGooey() { return this.statusEffects.goo.active; }

  // Get effective damage (0 if blind, normal damage otherwise)
  getEffectiveDamage() {
    return this.isBlind() ? 0 : this.damage;
  }

  getSpeedMultiplier() {
    if (this.isStunned() || this.isZapped()) return 0;
    if (this.isKnockedBack()) return 0;
    if (this.isFrozen()) return 0;
    let m = 1;
    if (this.statusEffects.freeze.active) m = 1 - this.statusEffects.freeze.slowAmount;
    else if (this.isGooey()) m = 1 - this.statusEffects.goo.slowAmount;
    else if (this.isDizzy()) m = 0.35;
    // Drowse tiers 1-2 slow instead of halting (tier 3 already returns 0 via
    // isFullyAsleep() short-circuiting the AI before this is even called).
    else if (this.isSleeping()) m = this.statusEffects.sleep.stacks >= 2 ? 0.25 : 0.6;
    // Rally boost: scale chase target velocity so _blendVelocity converges cleanly.
    // (Earlier impl multiplied raw velocity post-blend, which compounded each frame
    // against any large velocity impulse — e.g. the melee leap — into a runaway.)
    if (this.rallyBoostTimer > 0) m *= (this._rallyBoostMultiplier ?? 1.3);
    if (this.gaSlowStacks) m *= Math.max(0.25, 1 - this.gaSlowStacks * 0.1);
    return m;
  }

  getActiveStatusEffects() {
    return Object.keys(this.statusEffects).filter(effect => this.statusEffects[effect].active);
  }

  update(deltaTime) {
    // Mid exit-despawn walk (EnemyUpdateSystem._beginExitDespawn) — AnimationSystem
    // owns position exclusively until the walk completes and the enemy is removed,
    // so every AI branch below must be skipped rather than fighting it.
    if (this._animLock) return { dotDamage: [] };

    // Track if this enemy just detected player (for aggro SFX)
    let justAggrod = false;

    // ── Bread-seek (wild rat) ────────────────────────────────────────────────
    // Overrides default chase: pull the rat directly toward a dropped loaf.
    // Eating happens in main.js (proximity check + setTamed). Falls through
    // to default AI if the loaf was consumed or destroyed by something else.
    // Sets velocity directly so physics moves the rat next frame, and resets
    // state/attack timers so the post-update canAttack/createAttack in
    // CombatSystem can't fire mid-seek (kept attacking the player otherwise).
    if (this.seekingBread && this.breadTarget) {
      const t = this.breadTarget;
      if (t.consumed || t.destroyed) {
        this.seekingBread = false;
        this.breadTarget = null;
      } else {
        const dx = t.position.x - this.position.x;
        const dy = t.position.y - this.position.y;
        const d = Math.hypot(dx, dy) || 1;
        const speed = this.speed;
        this.targetVelocity.vx = (dx / d) * speed;
        this.targetVelocity.vy = (dy / d) * speed;
        this.velocity.vx = this.targetVelocity.vx;
        this.velocity.vy = this.targetVelocity.vy;
        this.state = 'chase';
        this.windupTimer = 0;
        if (this.attackTimer < 0.5) this.attackTimer = 0.5;
        return { dotDamage: [] };
      }
    }

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

    // Whether this enemy currently falls inside the zoomed viewport. Committed,
    // timing-critical actions (strike, leap, charge, ranged windups) must not
    // start or complete while the player has no rendered telegraph to read —
    // see CameraZoomSystem.isEntityOnScreen.
    const onScreen = this.game?.cameraZoomSystem?.isEntityOnScreen(this) ?? true;

    ShellFormMechanic.update(this, { deltaTime });

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

    const leapActive = LeapAttackMechanic.updateActive(this, { deltaTime, dotDamageEvents, onScreen });
    if (leapActive?.suspend) return leapActive.result;

    // While being carried by a thrown spear, TrapSystem owns position — skip all movement AI
    if (this.carriedBySpear) {
      this.velocity.vx = 0;
      this.velocity.vy = 0;
      if (this.acceleration) { this.acceleration.ax = 0; this.acceleration.ay = 0; }
      return { dotDamage: dotDamageEvents };
    }

    // Collapsed Risen pile: AI suspended until it rises; DoTs above still burn it out
    const collapsedResult = RiseAgainMechanic.update(this, { deltaTime, dotDamageEvents });
    if (collapsedResult?.suspend) return collapsedResult.result;

    // Primed Bomb: AI suspended while it holds still and blinks toward detonation
    const ripenBlinkResult = RipenMechanic.updateBlink(this, { deltaTime, dotDamageEvents });
    if (ripenBlinkResult?.suspend) return ripenBlinkResult.result;

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
    // Cyan well blessing shrinks the aggro radius (boss parts use Infinity aggro — unaffected)
    const effectiveAggroRange = this.target?.stealthBlessed ? this.aggroRange * 0.65 : this.aggroRange;

    const leapTrigger = LeapAttackMechanic.tryTrigger(this, { effectiveDistance, dotDamageEvents, onScreen });
    if (leapTrigger?.suspend) return leapTrigger.result;

    const ripenDetonateTrigger = RipenMechanic.tryDetonateTrigger(this, { effectiveDistance, dotDamageEvents });
    if (ripenDetonateTrigger?.suspend) return ripenDetonateTrigger.result;

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

    // Full sleep (tier 3) overrides all AI (like stun, but breaks on damage —
    // see takeDamage). Tiers 1-2 fall through to normal AI and are handled as
    // a plain speed slow instead (getSpeedMultiplier).
    if (this.isFullyAsleep()) {
      this.targetVelocity.vx = 0;
      this.targetVelocity.vy = 0;
      this.state = 'idle';
      return { dotDamage: dotDamageEvents };
    }

    // Stun/Zap override all AI
    if (this.isStunned() || this.isZapped()) {
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

    // Pacifist designation: never enters the combat aggro/chase/attack state
    // machine below — movement is fully owned by the enemy's own mechanic(s)
    // (e.g. GameAnimalMechanic's flee/burrow for Moose/Rabbit).
    if (this.data.pacifist) {
      GameAnimalMechanic.update(this, { deltaTime });
      return { dotDamage: dotDamageEvents };
    }

    // Sniper: fully owns movement/state while enabled — vision-gated ranged
    // attacker that never chases, so it must never reach the aggro/chase/attack
    // state machine below.
    const sniperActive = SniperMechanic.updateActive(this, { deltaTime, distance, effectiveDistance, dotDamageEvents, onScreen });
    if (sniperActive?.suspend) return sniperActive.result;

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

    // Roost upkeep must run before the rest-state early-return below
    FlockMechanic.updateRoost(this);

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

    // AI behavior — the State spine.
    this.stateMachine.update(this, deltaTime, {
      distance,
      effectiveDistance,
      effectiveAggroRange,
      effectiveVisionLength,
      canSee: spineCanSee(this, this.stateMachine.current, this.target.position, effectiveVisionLength),
      // Deciding to swing is not the same question as deciding to give chase,
      // and the roster depends on the difference: facing is a detection
      // concept, so a keeper that sidesteps perpendicular to its target would
      // never once be facing it at the moment it is finally in range. Both
      // checks are carried because both are asked.
      canStrike: this.hasVision(this.position, this.target.position, effectiveVisionLength, { ignoreCone: true }),
      samePlane: inSamePlane(this, this.target),
      speedMultiplier,
      deltaTime,
      targetPos: this.target.position,
      onScreen,
    });
    // Everything still reading `enemy.state` — the renderer's indicator picker,
    // TrailMechanic, Telegraph — keeps working through the translation.
    this.state = legacyStateFor(this.stateMachine, this);

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
          // Weapon windup just resolved — the swing is firing this frame, so
          // burst forward in sync with it.
          this._executeLeapAttack();
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

    const gooSpewResult = GooSpewMechanic.update(this, { deltaTime, dotDamageEvents, onScreen });
    if (gooSpewResult?.suspend) return gooSpewResult.result;

    const reformResult = ReformMechanic.update(this, { deltaTime, dotDamageEvents });
    if (reformResult?.suspend) return reformResult.result;

    MimicMechanic.updateReveal(this, { deltaTime, distance });
    MimicMechanic.updateRedisguise(this, { deltaTime, distance });
    MimicMechanic.updateTongue(this, { deltaTime, distance });

    const trailResult = TrailMechanic.update(this, { deltaTime, dotDamageEvents });
    if (trailResult?.suspend) return trailResult.result;

    const buffResult = BuffMechanic.update(this, { deltaTime, dotDamageEvents });
    if (buffResult?.suspend) return buffResult.result;

    const lureResult = LureMechanic.update(this, { deltaTime, distance, dotDamageEvents });
    if (lureResult?.suspend) return lureResult.result;

    ParryMechanic.update(this, { deltaTime, distance });
    ReflectShieldMechanic.update(this, { deltaTime });

    const trapResult = TrapLayerMechanic.update(this, { deltaTime, dotDamageEvents });
    if (trapResult?.suspend) return trapResult.result;

    RipenMechanic.updateGrowth(this, { deltaTime, dotDamageEvents });
    ThiefMechanic.update(this, { deltaTime, dotDamageEvents, targetPos: this.target?.position, effectiveVisionLength });

    ChargeMechanic.update(this, { deltaTime, distance, effectiveVisionLength, onScreen });

    JumpMechanic.update(this, { deltaTime });

    FlockMechanic.updateSwirl(this, { deltaTime });

    PatrolMechanic.update(this, { deltaTime });

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
    LeaderFollowerMechanic.update(this, { deltaTime });

    const shouldDropSlimeTrail = SlimeTrailDropMechanic.update(this);

    return { dotDamage: dotDamageEvents, justAggrod, shouldDropSlimeTrail };
  }

  /**
   * Returns a velocity vector that pushes this enemy radially away from any
   * open room exit within `radius` pixels. Magnitude scales linearly with
   * proximity, reaching `this.speed` at the exit center. Intended for fleeing
   * enemies that would otherwise hide in doorways; opt-in per movement style.
   */
  _exitRepulsionVector(radius = GRID.CELL_SIZE * 3) {
    const room = this.game?.currentRoom;
    if (!room?.exits) return { vx: 0, vy: 0 };
    const gx = this.position.x + GRID.CELL_SIZE / 2;
    const gy = this.position.y + GRID.CELL_SIZE / 2;
    let vx = 0, vy = 0;
    for (const dir of ['north', 'east', 'west']) {
      if (!room.exits[dir]?.letter) continue;
      const slot = EXIT_SLOT_POSITIONS[dir];
      const ex = slot.col * GRID.CELL_SIZE + GRID.CELL_SIZE / 2;
      const ey = slot.row * GRID.CELL_SIZE + GRID.CELL_SIZE / 2;
      const dx = gx - ex;
      const dy = gy - ey;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > 0 && d < radius) {
        const strength = (radius - d) / radius;
        vx += (dx / d) * this.speed * strength;
        vy += (dy / d) * this.speed * strength;
      }
    }
    return { vx, vy };
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

  // ── Movement ──────────────────────────────────────────────────────────────
  // The archetype movements, the idle wander, and the windup hold live in
  // enemyMovement.js: they only ever write targetVelocity, so none of them has
  // any business being a method with access to the whole enemy. What stays here
  // is the navigation they call into (updateVectorNavigation, below) and the
  // pack memory they don't touch.

  /** Clears shared memory marks across the pack and stands everyone down to idle. */
  _resetPackMemory() {
    if (!this.packmates) return;
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
   * Vision lives in enemyVision.js — see the header there for why. These three
   * keep the ~30 `this.hasVision(...)` call sites across the codebase working.
   */
  hasLineOfSight(start, end, maxLength) {
    return hasLineOfSight(this, start, end, maxLength);
  }

  getVisionObstructionPoint(start, end, maxLength) {
    return getVisionObstructionPoint(this, start, end, maxLength);
  }

  hasVision(start, end, maxLength, opts) {
    return hasVision(this, start, end, maxLength, opts);
  }

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


  canAttack() {
    // Blind enemies can still attack, but will miss (damage set to 0 in createAttack)

    // Off-screen: nothing this enemy does should be able to actually land while
    // the player has no rendered telegraph to read. Covers every attack path —
    // melee (Telegraph.syncWindupVisual discards the swing when this goes
    // false), ranged/magic/fire/sap/tongue/thief, and equipped-weapon use
    // (createAttack's bow path) — since they all funnel through this one gate.
    if (this.game?.cameraZoomSystem && !this.game.cameraZoomSystem.isEntityOnScreen(this)) {
      return false;
    }

    // Sap attacks can start when within range, not already sapping, and target has room for another bat.
    // Strike is `committed: true` (enemyStates/strike.js), so nothing rechecks distance between the
    // windup starting and this firing — without an explicit gate here, a bat that committed at point-blank
    // still latches on even if the player sprinted clear across the room during the windup, because
    // createSapAttack() doesn't spawn a hitbox the player has to be under (unlike melee/tongue, whose
    // range is naturally enforced by their attack landing in a box near the enemy) — it just grabs
    // `this.target` and teleports onto it. Re-checking real distance at this state change is the fix:
    // out of range here means the strike whiffs instead of guaranteeing a hit no matter where the
    // player ran.
    if (this.attackType === 'sap') {
      const targetFull = (this.target?.activeSappingBats?.length ?? 0) >= 3;
      let inRange = true;
      if (this.target) {
        const dx = this.target.position.x - this.position.x;
        const dy = this.target.position.y - this.position.y;
        inRange = (dx * dx + dy * dy) <= (this.attackRange * this.attackRange);
      }
      return !this.sapping && !targetFull && inRange && this.state === 'attack' && this.attackTimer <= 0 && this.windupTimer <= 0;
    }
    // Can only attack after windup completes
    return this.state === 'attack' && this.attackTimer <= 0 && this.windupTimer <= 0;
  }

  // The end of a Strike: the attack has left the enemy's hands, so the cooldown
  // starts and the attack state is over.
  //
  // Every path that fires an attack ends here. It used to end in three places
  // that did not agree. A melee swing closed inside `Telegraph.syncWindupVisual`
  // — outside the enemy entirely, and only for `attackType: 'melee'`. Everything
  // else charged its cooldown inside `createAttack()` and never left `'attack'`
  // on its own; it sat there until some unrelated ladder branch happened to
  // overwrite the field, which is why a bow enemy reads as attacking on frames
  // it is plainly just walking. And `attack()`, the one that did both correctly,
  // was called by nobody at all.
  resolveStrike() {
    this.attackTimer = this.attackCooldown;
    // Only the legacy ladder reads this. The State spine writes `state` from its
    // own current State every frame and reads it for nothing, so under the spine
    // this line is stomped a frame later and costs nothing; it is here so the
    // ladder sees the same ending, and it goes when the ladder does.
    this.state = 'idle';
  }

  _dizzyAngleOffset() {
    return this.isDizzy() ? (Math.random() - 0.5) * (Math.PI * 4 / 3) : 0; // ±120°
  }

  // Burst forward into the target at the instant a melee swing fires. Called
  // from both the equipped-weapon swing path (Item.update returns an attack)
  // and the native createMeleeAttack path so the leap is always coupled to
  // the actual moment of impact, not the earlier Enemy windup → attack state
  // transition (which fires before Item.windup on equipped melee).
  _executeLeapAttack() {
    if (!this.leapOnAttack || !this.target) return;
    if (this.isFrozen() || this.isStunned() || this.isZapped()) return;
    // Knockback freezes _blendVelocity decay, so stamping a leap on top would
    // glide for the full knockback window. Bail out and let the hit reaction play.
    if (this.isKnockedBack()) return;
    const lx = this.target.position.x - this.position.x;
    const ly = this.target.position.y - this.position.y;
    const ld = Math.sqrt(lx * lx + ly * ly);
    if (ld < 1) return;
    // Distance-clamped impulse: speed scales toward a 1-cell hop so the burst
    // can never carry past the target. Friction (~0.9/frame) then decays it.
    const MAX_LEAP_TRAVEL = GRID.CELL_SIZE * 1.25;
    const desiredTravel = Math.min(ld, MAX_LEAP_TRAVEL);
    const leapSpeed = Math.min(desiredTravel * 6, 130); // ≈ friction-integrated travel of `desiredTravel`
    this.velocity.vx = (lx / ld) * leapSpeed;
    this.velocity.vy = (ly / ld) * leapSpeed;
  }

  // Builds the attack; it does not end the Strike. The cooldown it used to charge
  // here is `resolveStrike()`'s, so that a swing costs the same whether it left
  // as a telegraphed melee visual or as an arrow — see `resolveEnemyAttack` in
  // Telegraph.js, which is the only thing that calls this in play.
  createAttack() {
    if (!this.canAttack() || !this.target) return null;

    // Use equipped weapon if available
    if (this.equippedWeapon && this.attackType.startsWith('item_')) {
      if (this.itemUseCooldown > 0) return null;

      const fakePlayer = {
        position: this.position,
        facing: this.getFacingDirection(),
        width: this.width,
        height: this.height
      };

      // Bows use the player's hold-to-charge mechanic, but enemies have no
      // input cycle to release the draw. Release at zero charge so the arrow
      // fires at base speed — full-charge release gave a 2x velocity bonus
      // that made archer goblins nearly undodgeable.
      if (this.equippedWeapon.data.weaponType === 'BOW') {
        this.equippedWeapon.use(fakePlayer); // starts the draw
        if (this.equippedWeapon.isCharging) {
          const released = this.equippedWeapon.releaseBow();
          if (released) {
            this.itemUseCooldown = this.itemUsage.useCooldown;
            return this.convertToEnemyAttack(released);
          }
        }
        return null;
      }

      const attack = this.equippedWeapon.use(fakePlayer);
      if (attack) {
        this.itemUseCooldown = this.itemUsage.useCooldown;
        // Item.use returns null when a windup is starting; if we got an
        // actual attack here, the swing is firing this frame — leap with it.
        this._executeLeapAttack();
        return this.convertToEnemyAttack(attack);
      }
      return null;
    }

    let nativeAttack = null;
    switch (this.attackType) {
      case 'melee':
        // Lava-immune enemies (e.g. Tortoise) switch to mini fire breath when standing in lava
        if (this.inLava && this.data?.lavaImmune) {
          nativeAttack = this.createMiniFireBreath();
        } else {
          nativeAttack = this.createMeleeAttack();
          // Native melee swing fires immediately — leap with it.
          if (nativeAttack) this._executeLeapAttack();
        }
        return nativeAttack;
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
      case 'thief':
        return this.createStealAttack();
      default:
        return null;
    }
  }

  // ── Attack type: rock projectile (ranged mineral throwers) ────────────────
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
    const aim = meleeAimOffset(this);
    if (!aim) return null;
    const { dirX, dirY, attackDistance } = aim;
    // Strike's picked band (strike.js `enter()`), if the enemy authors bands —
    // a band overrides damage/knockback/duration the same way it already
    // overrides windup, so distance can change what the swing IS, not just
    // how long it takes to arrive.
    const band = this.stateMachine?.band;

    return {
      type: 'enemy_melee',
      char: '█',
      position: {
        x: this.position.x + dirX * attackDistance,
        y: this.position.y + dirY * attackDistance
      },
      width: GRID.CELL_SIZE,
      height: GRID.CELL_SIZE,
      damage: band?.damage ?? this.getEffectiveDamage(),
      duration: band?.duration ?? 0.30, // dbl-sec (enemy melee list clock) = 0.15s real
      color: this.color,
      knockback: knockback ? (band?.knockback ?? 300 * (this.knockbackMultiplier ?? 1.0)) : 0,
      isImpact: this.data.isImpact === true,
      owner: this,
      isCharmedAttack: this.isCharmed(),
      charmedTarget: this.isCharmed() ? this.target : null,
      shooterPlane: this.plane,
      onHit: this.data.onHit,
      poisonDuration: this.data.poisonDuration
    };
  }

  // Steal attack (ThiefMechanic) — a zero-damage melee swing that lands like
  // any other hit (dodge/block/i-frames all resolve normally through
  // takeDamage) but triggers a theft instead of a damage number — coin, or
  // Monkey's satchel grab, per `data.thiefMechanic.steals`. See
  // ThiefMechanic.resolveTheft, called from CombatSystem once this attack
  // actually connects.
  createStealAttack() {
    const aim = meleeAimOffset(this);
    if (!aim) return null;
    const { dirX, dirY, attackDistance } = aim;

    return {
      type: 'enemy_melee',
      char: '█',
      position: {
        x: this.position.x + dirX * attackDistance,
        y: this.position.y + dirY * attackDistance
      },
      width: GRID.CELL_SIZE,
      height: GRID.CELL_SIZE,
      damage: 0,
      steal: true,
      duration: 0.30,
      color: this.color,
      knockback: 0,
      owner: this,
      shooterPlane: this.plane
    };
  }

  // Create windup attack visual (shown during windup, before damage can be dealt)
  createWindupAttackVisual() {
    if (!this.target) return null;

    const aim = meleeAimOffset(this);
    if (!aim) return null;
    const { dirX, dirY, attackDistance } = aim;
    // strike.js `enter()` already resolved the picked band into windupDuration
    // before this can be called (isWindingUp() requires windupTimer > 0, which
    // only holds after that assignment), so it — not attackWindup — is the
    // band-aware windup length for this swing.
    const band = this.stateMachine?.band;
    const windup = this.windupDuration ?? this.attackWindup;

    // If the enemy data declares a Telegraph, attachTelegraph adds the shape
    // fields (warnShape/hitShape/facing/pulses); shapeless enemies keep the
    // legacy single-rect visual unchanged.
    return attachTelegraph({
      type: 'enemy_melee',
      char: '█',
      position: {
        x: this.position.x + dirX * attackDistance,
        y: this.position.y + dirY * attackDistance
      },
      width: GRID.CELL_SIZE,
      height: GRID.CELL_SIZE,
      damage: band?.damage ?? this.getEffectiveDamage(),
      // Windup + actual attack duration. Both terms are now double-seconds on
      // the same clock the melee list is stepped with, so this is a true
      // "windup then one active window" lifetime rather than a loose upper bound.
      duration: windup + (band?.duration ?? 0.30),
      color: this.color,
      knockback: band?.knockback ?? 300,
      owner: this,
      isCharmedAttack: this.isCharmed(),
      charmedTarget: this.isCharmed() ? this.target : null,
      windupPhase: true, // Mark as windup - cannot deal damage yet
      hasHit: true, // Prevent damage during windup
      windupDuration: windup, // Store total windup time
      windupElapsed: 0, // Track time elapsed in windup
      alpha: 1.0, // Start at full visibility
      // Offset from owner's position so the hitbox tracks the enemy if it
      // gets knocked back mid-windup (windupImmune enemies like the Slime).
      ownerOffsetX: dirX * attackDistance,
      ownerOffsetY: dirY * attackDistance,
      shooterPlane: this.plane
    }, this, dirX, dirY);
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

  takeDamage(amount, attackId = null, opts = {}) {
    // Training dummy: indestructible, but still runs the hit SFX/blink pipeline below.
    if (this.data?.isDummy) amount = 0;

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

    // 2-frame grace from enemy-on-enemy speed collisions — see field comment
    // in the constructor and PhysicsSystem.resolveSpeedCollisions.
    this.speedCollisionGraceFrames = 2;

    // Risen: first lethal hit collapses into a bone pile (no iframes — smashable); collapsed dies for real
    if (this.hp <= 0 && this.data.riseAgain && !this.riseUsed && !this.collapsed) {
      RiseAgainMechanic.collapse(this);
      return { damaged: true };
    }

    // Per-enemy hit SFX. Death SFX is handled by the enemy-removal loop in
    // main.js so it isn't doubled up here. `sfx.hit` may be a string or an
    // array of strings (random pick).
    if (this.hp > 0) {
      const hitSfx = this.data?.sfx?.hit ?? resolveHitSfx(this.data);
      const name = Array.isArray(hitSfx)
        ? hitSfx[Math.floor(Math.random() * hitSfx.length)]
        : hitSfx;
      this.game?.audioSystem?.playSFX(name);
    }

    // Giant Slime on-damage hooks: child split (one blob per HP lost — see
    // SplitOnDamageMechanic.onDamaged) and goo-spew damage accumulation (GooSpewMechanic).
    if (this.hp > 0) {
      SplitOnDamageMechanic.onDamaged(this, amount);
      GooSpewMechanic.onDamaged(this, amount);
      RipenMechanic.onDamaged(this);
      ThiefMechanic.onDamaged(this);
    }

    // Sleep breaks on damage — full reset, not a tier step-down. Skipped when
    // this same hit's onHit/extraOnHit is about to reapply sleep this frame
    // (opts.reapplyingSleep, set by CombatSystem from attack.onHit/extraOnHit
    // before calling takeDamage) — otherwise this wake-clear fires first every
    // time (takeDamage always runs before the onHit block), capping Drowse
    // Oil's stacks at 1 no matter how many consecutive hits land.
    if (this.statusEffects.sleep && this.statusEffects.sleep.active && !opts.reapplyingSleep) {
      this.statusEffects.sleep.active = false;
      this.statusEffects.sleep.duration = 0;
      this.statusEffects.sleep.stacks = 0;
      this._clearEffectOrder('sleep');
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

    // Flash ! when hit (overrides ? indicator) — skip for the training dummy,
    // which never detects/aggroes and shouldn't show a combat reaction.
    if (!this.data?.isDummy) {
      this.detectionIndicatorTimer = this.detectionIndicatorDuration;
    }

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

  // Boss/miniboss low-HP warning: blink dark red at ≤30% HP — same near-death
  // signal as the player (Player.getDisplayColor). Date.now() keeps all parts
  // of a composite boss blinking in phase.
  getNearDeathBlinkColor() {
    if (!(this.isBoss || this.isBossEntity || this.data?.tier === 'boss')) return null;
    if (this.hp <= 0 || this.hp > this.maxHp * 0.3) return null;
    return Math.floor(Date.now() / 250) % 2 === 0 ? '#660000' : null;
  }

  // Goo-affinity render scale: Slime and Giant Slime render at a size that
  // tracks current HP — a Giant Slime split child (registerSplitChild sets
  // its hp to the damage the boss just took, uncapped by maxHp) reads as a
  // chunk sized to match the hit that knocked it off. 1-2 HP is the original
  // design size (never smaller); every HP above that scales the glyph up.
  // sqrt keeps rendered AREA roughly proportional to HP rather than just
  // glyph height; capped so an outlier one-hit chunk doesn't blow out the layout.
  getGooRenderScale() {
    if (!this.data?.affinities?.includes('goo')) return 1;
    const hp = Math.max(0, this.hp);
    return Math.min(2.5, Math.max(1, Math.sqrt(hp / 2)));
  }

  // Round-robins the glyph blink color across every currently-active
  // blink-capable effect (burn/poison/zap/stun/sleep/charm/freeze/wet/dizzy/goo)
  // instead of a fixed priority chain — so e.g. Acid Blade poison and Drowse
  // Oil sleep landing on the same swing both get visible time, not just
  // whichever came first. See StatusEffectVisuals.js for the implementation.
  getDOTBlinkColor() {
    return computeBlinkColor(this);
  }

  // Stack-count pip rows for on-glyph display (StatusPipEffects.js) — one row
  // per active effect with stacks >= 1, in application order.
  getStatusPipRows() {
    return computePipRows(this);
  }

  isWindingUp() {
    return WindupTelegraphMechanic.isWindingUp(this);
  }

  isInCritWindow() {
    return WindupTelegraphMechanic.isInCritWindow(this);
  }

  getWindupFlashColor() {
    return WindupTelegraphMechanic.getWindupFlashColor(this);
  }

  getWindupIndicator() {
    return WindupTelegraphMechanic.getWindupIndicator(this);
  }

  getBowChargeRatio() {
    return WindupTelegraphMechanic.getBowChargeRatio(this);
  }

  getStolenItemIndicator() {
    return ThiefMechanic.getCarriedItemIndicator(this);
  }

  getMemoryIndicator() {
    if (this.aggroMemoryActive && this.state === 'chase' &&
        this.detectionIndicatorTimer <= 0) {
      return {
        char: '?',
        // Gray = suspected (heard/felt); yellow = confirmed (saw player go somewhere)
        color: this.memoryMarkSuspected ? '#aaaaaa' : '#ffff00',
        offsetY: -GRID.CELL_SIZE  // Position above enemy
      };
    }
    return null;
  }

  getTrapLayerIndicator() {
    // Trap Goblin: '...' while charging a trap, yellow '!' while scuttling away after.
    if (this.trapWindupActive) {
      return { char: '...', color: '#ccaa00', offsetY: -GRID.CELL_SIZE };
    }
    if (this.postTrapBurstTimer > 0) {
      return { char: '!', color: '#ffff00', offsetY: -GRID.CELL_SIZE };
    }
    return null;
  }

  getDetectionIndicator() {
    if (this.detectionIndicatorTimer > 0 && !this.aggroMemoryActive) {
      return {
        char: '!',
        color: '#ffff00',
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

    // Capture native speed once so melee/ranged swaps can toggle the boost cleanly.
    if (this._baseSpeed === undefined) this._baseSpeed = this.speed;

    if (item.data.weaponType === 'GUN' || item.data.weaponType === 'BOW') {
      this.attackType = 'item_ranged';
      // Restore keeper distance-hold behavior for ranged loadouts.
      if (this.data.movementStyle) this.movementStyle = this.data.movementStyle;
      this.leapOnAttack = false;
      this.attackRange = this.itemUsage.useRange;
      this.speed = this._baseSpeed;
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
      // Melee-wielders get a +30% speed boost so they can actually close the
      // gap and commit a swing. Without this, ranged-archetype enemies who
      // grabbed a melee weapon kept their original (slower) chase speed and
      // were trivially kited.
      this.speed = this._baseSpeed * 1.3;
      // The state machine's declared States are fixed at construction from
      // this enemy's original archetype (stateDefaults.js), so a kiter/jumper/
      // ambusher whose native attack isn't melee was never given a Recover —
      // there was nothing to overlap and whiff on. Now that it is wielding a
      // swung weapon, it needs the exact same overlap protection a born
      // melee enemy gets, and there is no later point that re-derives
      // declared States to pick it up on its own.
      if (!this.stateMachine.has('recover')) {
        this.stateMachine.declared.recover = { duration: 0.4, variant: 'retreat', speed: 0.5 };
      }
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
      if (out.type === 'melee') {
        out.type = 'enemy_melee';
        // Unit boundary: Item.createMeleeAttack authors `duration` against the
        // player melee list, which is stepped with raw deltaTime. The enemy
        // melee list runs on the double-second clock, so convert here or the
        // swing would live half as long in the goblin's hands as in the
        // player's.
        if (out.duration !== undefined) out.duration *= PHYSICS.ENEMY_TIMER_RATE;
      }
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
    // Restore native speed (melee equip applied a +30% boost).
    if (this._baseSpeed !== undefined) this.speed = this._baseSpeed;

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
