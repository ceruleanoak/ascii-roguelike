import { PHYSICS, GRID, COLORS, PLAYER_STATS } from '../game/GameConfig.js';

const INVULNERABILITY_DURATION = 1.0; // seconds
const BLINK_FREQUENCY = 0.1; // blink every 0.1 seconds

export class Player {
  constructor(x, y) {
    // Pixel-based position (not grid-snapped)
    this.position = { x, y };
    this.velocity = { vx: 0, vy: 0 };
    this.acceleration = { ax: 0, ay: 0 };

    // Character properties
    this.char = '@';
    this.color = COLORS.PLAYER;
    this.width = GRID.CELL_SIZE;
    this.height = GRID.CELL_SIZE;

    // Game state
    this.hp = PLAYER_STATS.START_HP;
    this.maxHp = PLAYER_STATS.MAX_HP;
    this.defense = 0; // Defense from armor

    // Armor special properties
    this.bulletResist = 0;
    this.dodgeChance = 0;
    this.fireImmune = false;
    this.freezeImmune = false;
    this.poisonImmune = false;
    this.slimeImmune = false;
    this.reflectDamage = 0;
    this.speedBoost = 0;
    this.speedPenalty = 0;
    this.slowEnemies = false;

    this.quickSlots = [null, null, null]; // 3-slot loadout
    this.activeSlotIndex = 0; // Currently selected slot (0-2)
    this.inventory = []; // Ingredients only
    this.activeSappingBats = []; // Bats currently latched to this player (up to 3)
    this.facing = { x: 0, y: 1 }; // Direction player is facing

    // Trap usage tracking (resets per room)
    this.trapUsedThisRoom = [false, false, false]; // Track if trap in each slot was used this room

    // Invulnerability frames
    this.invulnerabilityTimer = 0;
    this.invulnerabilityDuration = INVULNERABILITY_DURATION;
    this.attackBlockTimer = 0; // Blocks attacks during extended iframe period (cyan rogue)

    // Physics flags
    this.hasCollision = true;
    this.boundToGrid = true;
    this.collisionMap = null; // Set by game state
    this.plane = 0; // 0=normal plane, 1=tunnel plane
    this.inHut = false; // true while inside a hut interior overlay
    this.hutExitPosition = null; // saved exterior position when entering a hut

    // Wet status
    this.wetDuration = 0;
    this.wetDropTimer = 0; // throttles trail particle emission

    // Sprint footstep trail
    this.footstepTimer = 0; // throttles footstep dot emission
    this.footstepSide = 0;  // alternates 0/1 for left/right foot

    // Burn status
    this.burnDuration = 0;
    this.burnTickTimer = 0;
    this.burnTickRate = 1.5; // deal damage every 1.5s
    this.burnDamage = 1;    // damage per tick

    // Water immunity (from Rubber Boots)
    this.waterImmunityTimer = 0;

    // Steam trail emission timer (throttles puff particle emission)
    this.steamTrailTimer = 0;

    // Timed buffs
    this.speedBoostTimer = 0;
    this.speedBoostMultiplier = 1.5;
    this.luckTimer = 0;
    this.blockBoostTimer = 0;
    this.blockBoostAmount = 0;
    this.stoneSkinTimer = 0;
    this.stoneSkinBonus = 0;
    this.damageBonusTimer = 0;
    this.damageBonusAmount = 0;
    this.regenTimer = 0;
    this.regenAmount = 1;
    this.regenInterval = 1.0;
    this.regenTickTimer = 0;

    // Shield charges (from Shield / Tower Shield consumables)
    this.shieldCharges = 0;
    this.shieldMaxCharges = 0;
    this.shieldCooldown = 0;
    this.shieldCooldownMax = 5;
    this.shieldBlocksAll = false; // true = blocks melee too, false = bullets only

    // Fishing state
    this.fishingLocked = false;       // Movement blocked during fishing cast/wait
    this.rusalkaInputScale = 1.0;     // 1.0 = full control, 0.0 = no control (Rusalka seduction)

    // Input state
    this.inputState = {
      up: false,
      down: false,
      left: false,
      right: false
    };

    // Dodge roll mechanics
    this.dodgeRoll = {
      active: false,
      type: 'dodge', // 'dodge', 'hide', 'damage', 'blink'
      direction: { x: 0, y: 0 },
      duration: 0.15, // seconds
      timer: 0,
      cooldown: 0.5, // seconds between rolls
      cooldownTimer: 0,
      distance: GRID.CELL_SIZE * 2, // roll distance (reduced)
      speed: 200, // pixels per second during roll (1/3 of original 600)
      iframes: true, // invulnerability during roll (for 'dodge' type)

      // Slope interaction — see updateDodgeRoll for full mechanic description
      slopeFreeTime: 5 / 60, // seconds of unimpeded roll on a slope (~20 frames at 60fps)
      slopeTimer:    0,        // countdown for the remaining slope-roll window
      slopeActive:   false,    // true once a slope tile was detected during this roll
      slopeLocked:   false     // true during mercy phase: roll velocity zeroed, slope takes over
    };

    // Set by PhysicsSystem each frame; read by updateDodgeRoll (1-frame lag is imperceptible)
    this.isOnSlope = false;
    this.isOnIce   = false;

    // Status effects
    this.statusEffects = {
      goo: { active: false, duration: 0, slowAmount: 0.8 }, // Heavy slow + prevents dodge roll
      freeze: { active: false, duration: 0, slowAmount: 0.5 }
    };

    // Status visual feedback
    this.statusBlinkTimer = 0;
    this.baseColor = '#ffffff'; // Will be set by character type

    // Character type tracking
    this.characterType = 'default';

    // Green ranger: shared action cooldown (gates both attacks and dodge rolling)
    this.actionCooldown = 0;
    this.actionCooldownMax = 0;
    this.rollCharge = 0;   // Green ranger: energy drained while rolling, restored during cooldown
    this.continuousRollActive = false; // Sustained slide while holding arrow keys
    this.pendingBlink = null; // Yellow mage: deferred teleport resolved in main.js
    this.greenIdleDamageBonus = 0;
    this.greenCombatDamagePenalty = 0;
  }

  // Backward compatibility: heldItem getter returns active slot
  get heldItem() {
    return this.quickSlots[this.activeSlotIndex];
  }

  setCollisionMap(collisionMap) {
    this.collisionMap = collisionMap;
  }

  updateInput(inputState, lockFacing = false) {
    this.inputState = inputState;

    // Check if charging a bow (for movement slowdown)
    const isChargingBow = this.heldItem && this.heldItem.isCharging;

    // Calculate target acceleration based on input (1.5x acceleration when unarmed)
    const baseAcceleration = this.heldItem ? PHYSICS.PLAYER_ACCELERATION : PHYSICS.PLAYER_ACCELERATION * 1.5;
    const acceleration = baseAcceleration * (1 + this.speedBoost - this.speedPenalty);
    let targetAx = 0;
    let targetAy = 0;

    if (inputState.left) targetAx -= acceleration;
    if (inputState.right) targetAx += acceleration;
    if (inputState.up) targetAy -= acceleration;
    if (inputState.down) targetAy += acceleration;

    // Normalize diagonal movement
    if (targetAx !== 0 && targetAy !== 0) {
      const length = Math.sqrt(targetAx * targetAx + targetAy * targetAy);
      targetAx = (targetAx / length) * acceleration;
      targetAy = (targetAy / length) * acceleration;
    }

    // During dodge roll: ignore input acceleration entirely — roll direction drives movement
    if (this.dodgeRoll.active) {
      this.acceleration.ax = 0;
      this.acceleration.ay = 0;
      return;
    }

    // While charging bow: zero acceleration (movement slows to stop) but allow aiming
    if (isChargingBow) {
      this.acceleration.ax = 0;
      this.acceleration.ay = 0;

      // Apply gentle deceleration (friction) to bring player to a stop
      const chargeDeceleration = 0.8; // Lower = faster stop (0.95 = gentle, gradual slowdown)
      this.velocity.vx *= chargeDeceleration;
      this.velocity.vy *= chargeDeceleration;

      // Stop completely when velocity is very small
      if (Math.abs(this.velocity.vx) < 5) this.velocity.vx = 0;
      if (Math.abs(this.velocity.vy) < 5) this.velocity.vy = 0;
    } else {
      this.acceleration.ax = targetAx;
      this.acceleration.ay = targetAy;
    }

    // Update facing direction for aiming (allow while charging, lock during auto-attack)
    if (!lockFacing && (targetAx !== 0 || targetAy !== 0)) {
      this.facing.x = Math.sign(targetAx);
      this.facing.y = Math.sign(targetAy);
    }

    // Cap velocity to max speed (1.5x speed when unarmed, boosted when speed buff active, armor modifiers, status effects)
    const baseMaxSpeed = this.heldItem ? PHYSICS.PLAYER_SPEED : PHYSICS.PLAYER_SPEED * 1.5;
    const armorModified = baseMaxSpeed * (1 + this.speedBoost - this.speedPenalty);
    const boostedMax = this.speedBoostTimer > 0 ? armorModified * this.speedBoostMultiplier : armorModified;
    const finalMax = boostedMax * this.getStatusSpeedMultiplier(); // Apply status effect slows (goo, freeze)
    const speed = Math.sqrt(this.velocity.vx ** 2 + this.velocity.vy ** 2);
    if (speed > finalMax) {
      this.velocity.vx = (this.velocity.vx / speed) * finalMax;
      this.velocity.vy = (this.velocity.vy / speed) * finalMax;
    }
  }

  getHitbox() {
    return {
      x: this.position.x,
      y: this.position.y,
      width: this.width,
      height: this.height
    };
  }

  getGridPosition() {
    return {
      x: Math.floor(this.position.x / GRID.CELL_SIZE),
      y: Math.floor(this.position.y / GRID.CELL_SIZE)
    };
  }

  isWet() { return this.wetDuration > 0; }
  applyWet(duration) { this.wetDuration = Math.max(this.wetDuration, duration); }

  isBurning() { return this.burnDuration > 0; }
  applyBurn(duration) { this.burnDuration = Math.max(this.burnDuration, duration); }

  applySpeedBoost(duration) { this.speedBoostTimer = Math.max(this.speedBoostTimer, duration); }
  applyLuck(duration) { this.luckTimer = Math.max(this.luckTimer, duration); }
  applyStoneSkin(duration, bonus) {
    this.stoneSkinTimer = Math.max(this.stoneSkinTimer, duration);
    this.stoneSkinBonus = Math.max(this.stoneSkinBonus, bonus);
  }
  applyDamageBuff(duration, bonus) {
    this.damageBonusTimer = Math.max(this.damageBonusTimer, duration);
    this.damageBonusAmount = Math.max(this.damageBonusAmount, bonus);
  }
  applyRegen(duration, amount, interval) {
    this.regenTimer = Math.max(this.regenTimer, duration);
    this.regenAmount = amount;
    this.regenInterval = interval;
    this.regenTickTimer = 0;
  }
  applyBlockBoost(duration, amount) {
    this.blockBoostTimer = Math.max(this.blockBoostTimer, duration);
    this.blockBoostAmount = Math.max(this.blockBoostAmount, amount);
  }

  // Returns true if a shield charge absorbed this hit (bullet always checked;
  // melee only absorbed if shieldBlocksAll is true)
  tryShieldBlock(isBullet = true) {
    if (this.shieldCharges <= 0) return false;
    if (!isBullet && !this.shieldBlocksAll) return false;
    this.shieldCharges--;
    if (this.shieldCharges < this.shieldMaxCharges) {
      this.shieldCooldown = this.shieldCooldownMax;
    }
    return true;
  }

  applyStatusEffect(effect, duration = 3.0) {
    if (!this.statusEffects[effect]) return;

    // Check for immunity
    if (effect === 'goo' && this.slimeImmune) return;

    this.statusEffects[effect].active = true;
    this.statusEffects[effect].duration = Math.max(this.statusEffects[effect].duration, duration);
  }

  updateStatusEffects(deltaTime) {
    // Goo effect (heavy slow + prevents dodge roll)
    const goo = this.statusEffects.goo;
    if (goo.active) {
      goo.duration -= deltaTime;
      if (goo.duration <= 0) {
        goo.active = false;
        goo.duration = 0;
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
  }

  isGooey() {
    return this.statusEffects.goo.active;
  }

  isFrozen() {
    return this.statusEffects.freeze.active;
  }

  getStatusSpeedMultiplier() {
    if (this.isGooey()) return 1 - this.statusEffects.goo.slowAmount;
    if (this.isFrozen()) return 1 - this.statusEffects.freeze.slowAmount;
    return 1;
  }

  getDisplayColor() {
    // Blink green when gooey
    if (this.isGooey()) {
      const BLINK_FREQUENCY = 0.3;
      const blinkCycle = Math.floor(this.statusBlinkTimer / BLINK_FREQUENCY);
      return blinkCycle % 2 === 0 ? '#00ff00' : this.baseColor;
    }
    return this.color;
  }

  update(deltaTime) {
    // Update status effects
    this.updateStatusEffects(deltaTime);

    // Update status blink timer
    this.statusBlinkTimer += deltaTime;
    // Update dodge roll state
    this.updateDodgeRoll(deltaTime);

    // Update invulnerability timer
    if (this.invulnerabilityTimer > 0) {
      this.invulnerabilityTimer -= deltaTime;
      if (this.invulnerabilityTimer < 0) {
        this.invulnerabilityTimer = 0;
      }
    }

    // Update attack block timer
    if (this.attackBlockTimer > 0) {
      this.attackBlockTimer -= deltaTime;
      if (this.attackBlockTimer < 0) {
        this.attackBlockTimer = 0;
      }
    }

    if (this.wetDuration > 0) this.wetDuration -= deltaTime;

    // Tick timed buffs
    if (this.speedBoostTimer > 0) this.speedBoostTimer -= deltaTime;
    if (this.luckTimer > 0) this.luckTimer -= deltaTime;
    if (this.blockBoostTimer > 0) this.blockBoostTimer -= deltaTime;
    if (this.waterImmunityTimer > 0) this.waterImmunityTimer -= deltaTime;
    if (this.stoneSkinTimer > 0) {
      this.stoneSkinTimer -= deltaTime;
      if (this.stoneSkinTimer <= 0) { this.stoneSkinTimer = 0; this.stoneSkinBonus = 0; }
    }
    if (this.damageBonusTimer > 0) this.damageBonusTimer -= deltaTime;
    if (this.regenTimer > 0) {
      this.regenTimer -= deltaTime;
      this.regenTickTimer -= deltaTime;
      if (this.regenTickTimer <= 0) {
        this.regenTickTimer = this.regenInterval;
        this.heal(this.regenAmount);
      }
    }

    // Tick green ranger action cooldown
    if (this.actionCooldown > 0) {
      this.actionCooldown -= deltaTime;
      if (this.actionCooldown < 0) this.actionCooldown = 0;
    }

    // Recharge shield charges on cooldown
    if (this.shieldCooldown > 0) {
      this.shieldCooldown -= deltaTime;
      if (this.shieldCooldown <= 0 && this.shieldCharges < this.shieldMaxCharges) {
        this.shieldCharges++;
        if (this.shieldCharges < this.shieldMaxCharges) {
          this.shieldCooldown = this.shieldCooldownMax;
        }
      }
    }

    // Burn DoT — returns damage amount if a tick fired (damage applied in main.js via takeDamage)
    if (this.burnDuration > 0) {
      this.burnDuration -= deltaTime;
      this.burnTickTimer -= deltaTime;
      if (this.burnTickTimer <= 0) {
        this.burnTickTimer = this.burnTickRate;
        return { burnDamage: this.burnDamage };
      }
    } else {
      this.burnTickTimer = 0;
    }

    return null;
  }

  startDodgeRoll(direction, enemies = []) {
    // Check if on cooldown
    if (this.dodgeRoll.cooldownTimer > 0) {
      return false;
    }

    // Cannot dodge roll while gooey!
    if (this.isGooey()) {
      return false;
    }

    // Cancel attack windup for melee weapons
    if (this.heldItem && this.heldItem.windupActive) {
      this.heldItem.windupActive = false;
      this.heldItem.windupTimer = 0;
      this.heldItem.pendingPlayer = null;
    }

    // Cancel bow charging
    if (this.heldItem && this.heldItem.isCharging) {
      this.heldItem.isCharging = false;
      this.heldItem.chargeTime = 0;
      this.heldItem.chargingPlayer = null;
    }

    // Break any sapping enemies attached to this player
    for (const enemy of enemies) {
      if (enemy.sapping && enemy.sappingTarget === this) {
        enemy.breakSapping(300); // Stronger knockback from dodge roll
      }
    }

    // Calculate current max movement speed (from updateInput logic)
    const baseMaxSpeed = this.heldItem ? PHYSICS.PLAYER_SPEED : PHYSICS.PLAYER_SPEED * 1.5;
    const armorModified = baseMaxSpeed * (1 + this.speedBoost - this.speedPenalty);
    const currentMaxSpeed = this.speedBoostTimer > 0 ? armorModified * this.speedBoostMultiplier : armorModified;

    // Dodge roll speed is 1.1x current max speed (always slightly faster)
    const rollSpeed = currentMaxSpeed * 1.1;

    // Activate roll
    this.dodgeRoll.active = true;
    this.dodgeRoll.direction = direction;
    this.dodgeRoll.timer = this.dodgeRoll.duration;
    this.dodgeRoll.cooldownTimer = this.dodgeRoll.cooldown;
    this.dodgeRoll.speed = rollSpeed; // Set dynamic speed

    // Reset slope/ice lock state for fresh roll
    this.dodgeRoll.slopeTimer  = 0;
    this.dodgeRoll.slopeActive = false;
    this.dodgeRoll.slopeLocked = false;

    // Zero out velocity for flat dodge roll speed (not additive with movement)
    this.velocity.vx = 0;
    this.velocity.vy = 0;
    this.acceleration.ax = 0;
    this.acceleration.ay = 0;

    // Apply roll-specific effects based on type
    switch (this.dodgeRoll.type) {
      case 'dodge':
        // Grant i-frames for duration + 0.5s extra (0.15s roll + 0.5s = 0.65s total)
        this.invulnerabilityTimer = this.dodgeRoll.duration + 0.5;
        break;
      case 'hide':
        // Invisible to enemies + extended i-frames (cyan rogue specialty)
        this.hidden = true;
        // Extended i-frames: 0.25s roll + 1.25s = 1.5s total invulnerability
        this.invulnerabilityTimer = this.dodgeRoll.duration + 1.25;
        // Attacks blocked for entire extended iframe duration
        this.attackBlockTimer = this.invulnerabilityTimer;
        break;
      case 'damage':
        // Minimal i-frames — only for the roll duration itself, no buffer (requires precision)
        this.invulnerabilityTimer = this.dodgeRoll.duration;
        break;
      case 'blink':
        // Defer teleport to main.js for collision checking, bounds enforcement, and trail particles
        this.pendingBlink = { direction: { x: direction.x, y: direction.y }, distance: this.dodgeRoll.distance };
        this.dodgeRoll.timer = 0; // Instant
        break;
    }

    return true;
  }

  updateDodgeRoll(deltaTime) {
    // Cooldown tick
    if (this.dodgeRoll.cooldownTimer > 0) {
      this.dodgeRoll.cooldownTimer -= deltaTime;
    }

    // Active roll movement
    if (this.dodgeRoll.active) {
      // ── Slope / ice lock phase ─────────────────────────────────────────────
      // When the player enters a slope or frozen-ice tile during a roll, a
      // free-time window opens (slopeFreeTime ≈ 20 frames).  During that window
      // the roll velocity drives movement as normal ("burst").  Once the window
      // expires, slopeLocked is set: roll velocity is zeroed and the tile's own
      // physics (slope push / ice inertia) take over ("mercy phase").
      const onSpecialTerrain = this.isOnSlope || this.isOnIce;
      if (onSpecialTerrain && this.dodgeRoll.type !== 'blink') {
        if (!this.dodgeRoll.slopeActive) {
          this.dodgeRoll.slopeActive = true; // Start window on first contact
          this.dodgeRoll.slopeTimer  = 0;
        }
        if (!this.dodgeRoll.slopeLocked) {
          this.dodgeRoll.slopeTimer += deltaTime;
          if (this.dodgeRoll.slopeTimer >= this.dodgeRoll.slopeFreeTime) {
            this.dodgeRoll.slopeLocked = true;
          }
        }
      }
      // ──────────────────────────────────────────────────────────────────────

      this.dodgeRoll.timer -= deltaTime;

      if (this.dodgeRoll.timer <= 0) {
        // Roll complete — zero out velocity and deactivate
        this.dodgeRoll.active = false;
        this.velocity.vx = 0;
        this.velocity.vy = 0;
        this.acceleration.ax = 0;
        this.acceleration.ay = 0;
        if (this.dodgeRoll.type === 'hide') {
          this.hidden = false;
        }
      } else if (this.dodgeRoll.type !== 'blink') {
        if (this.dodgeRoll.slopeLocked) {
          // Mercy phase: zero roll velocity so slope push / ice momentum drives
          this.velocity.vx = 0;
          this.velocity.vy = 0;
        } else {
          // Normal roll or within free-time window on special terrain
          this.velocity.vx = this.dodgeRoll.direction.x * this.dodgeRoll.speed;
          this.velocity.vy = this.dodgeRoll.direction.y * this.dodgeRoll.speed;
        }
        this.acceleration.ax = 0;
        this.acceleration.ay = 0;
      }
    }
  }

  takeDamage(amount, damageSource = {}) {
    // Can't take damage during invulnerability frames
    if (this.invulnerabilityTimer > 0) {
      return false;
    }

    const hpBefore = this.hp;

    // Dodge check (all damage types)
    if (this.dodgeChance > 0 && Math.random() < this.dodgeChance) {
      return { dodged: true };
    }

    // Bullet resistance check
    if (damageSource.isBullet && this.bulletResist > 0) {
      if (Math.random() < this.bulletResist) {
        return { blocked: true };
      }
    }

    // Elemental immunity checks
    if (damageSource.element) {
      if (this.fireImmune && damageSource.element === 'burn') {
        return { immune: true };
      }
      if (this.freezeImmune && damageSource.element === 'freeze') {
        return { immune: true };
      }
      if (this.poisonImmune && damageSource.element === 'poison') {
        return { immune: true };
      }
    }

    // Apply defense (reduce damage, minimum 1)
    const tempDefense = this.stoneSkinTimer > 0 ? this.stoneSkinBonus : 0;
    const actualDamage = Math.max(1, amount - this.defense - tempDefense);

    this.hp -= actualDamage;
    if (this.hp < 0) this.hp = 0;

    // Start invulnerability frames
    if (this.hp > 0) {
      this.invulnerabilityTimer = this.invulnerabilityDuration;
    }

    // Damage reflection
    if (this.reflectDamage > 0 && damageSource.attacker) {
      const reflectedAmount = Math.ceil(actualDamage * this.reflectDamage);
      return this.hp <= 0 ? true : {
        damaged: true,
        reflect: reflectedAmount,
        attacker: damageSource.attacker
      };
    }

    // Return true if dead, or a truthy value if damaged (for damage numbers)
    return this.hp <= 0 ? true : { damaged: true };
  }

  isInvulnerable() {
    return this.invulnerabilityTimer > 0;
  }

  canAttack() {
    if (this.attackBlockTimer > 0) return false;
    if (this.characterType === 'green' && this.actionCooldown > 0) return false;
    if (this.characterType === 'green' && this.continuousRollActive) return false;
    return true;
  }

  // Returns current roll speed (matching startDodgeRoll calculation)
  getRollSpeed() {
    const baseMaxSpeed = this.heldItem ? PHYSICS.PLAYER_SPEED : PHYSICS.PLAYER_SPEED * 1.5;
    const armorModified = baseMaxSpeed * (1 + this.speedBoost - this.speedPenalty);
    const currentMaxSpeed = this.speedBoostTimer > 0 ? armorModified * this.speedBoostMultiplier : armorModified;
    return currentMaxSpeed * 1.1;
  }

  getVisibilityAlpha() {
    // Fade to 40% alpha during invulnerability frames (instead of blinking)
    if (this.invulnerabilityTimer > 0) {
      return 0.4;
    }
    return 1.0;
  }

  shouldRenderVisible() {
    // Always render (for backward compatibility), but use getVisibilityAlpha() for alpha
    return true;
  }

  heal(amount) {
    this.hp += amount;
    if (this.hp > this.maxHp) this.hp = this.maxHp;
  }

  addIngredient(ingredient) {
    this.inventory.push(ingredient);
  }

  removeIngredient(ingredient) {
    const index = this.inventory.indexOf(ingredient);
    if (index > -1) {
      this.inventory.splice(index, 1);
    }
  }

  pickupItem(item) {
    // Find first empty slot
    const emptySlotIdx = this.quickSlots.findIndex(slot => slot === null);

    if (emptySlotIdx !== -1) {
      // Fill empty slot and switch to it
      this.quickSlots[emptySlotIdx] = item;
      this.activeSlotIndex = emptySlotIdx;
      // Reset trap usage for this slot when picking up new item
      this.trapUsedThisRoom[emptySlotIdx] = false;
      return null; // No item dropped
    } else {
      // All slots full - swap with active slot
      const droppedItem = this.quickSlots[this.activeSlotIndex];
      this.quickSlots[this.activeSlotIndex] = item;
      // Reset trap usage for this slot when swapping item
      this.trapUsedThisRoom[this.activeSlotIndex] = false;
      return droppedItem;
    }
  }

  dropItem() {
    const item = this.quickSlots[this.activeSlotIndex];
    this.quickSlots[this.activeSlotIndex] = null;
    // Reset trap usage for this slot when dropping item
    this.trapUsedThisRoom[this.activeSlotIndex] = false;

    // Auto-switch to next filled slot if available
    const nextFilled = this.quickSlots.findIndex((slot, idx) =>
      idx !== this.activeSlotIndex && slot !== null
    );
    if (nextFilled !== -1) {
      this.activeSlotIndex = nextFilled;
    }

    return item;
  }

  useHeldItem() {
    if (!this.heldItem || !this.heldItem.use) return null;

    const result = this.heldItem.use(this);

    // Handle consumable items - remove from slot if consumed
    if (result && result.consumed) {
      this.quickSlots[this.activeSlotIndex] = null;

      // Auto-switch to next filled slot if available
      const nextFilled = this.quickSlots.findIndex((slot, idx) =>
        idx !== this.activeSlotIndex && slot !== null
      );
      if (nextFilled !== -1) {
        this.activeSlotIndex = nextFilled;
      }
    }

    return result;
  }

  cycleSlotNext() {
    // Cycle through all slots (including empty ones for faster movement)
    this.activeSlotIndex = (this.activeSlotIndex + 1) % this.quickSlots.length;
  }

  cycleSlotPrevious() {
    // Cycle through all slots (including empty ones for faster movement)
    this.activeSlotIndex = (this.activeSlotIndex - 1 + this.quickSlots.length) % this.quickSlots.length;
  }

  // Reset trap usage for new room (called when entering new room)
  resetTrapsForNewRoom() {
    this.trapUsedThisRoom = [false, false, false];
  }

  // Check if active slot has a trap and if it can be used
  canUseTrap() {
    const item = this.heldItem;
    if (!item || !item.data || item.data.type !== 'TRAP') return false;
    return !this.trapUsedThisRoom[this.activeSlotIndex];
  }

  // Mark trap as used in current room
  markTrapUsed() {
    this.trapUsedThisRoom[this.activeSlotIndex] = true;
  }

  reset() {
    this.hp = PLAYER_STATS.START_HP;
    this.velocity = { vx: 0, vy: 0 };
    this.acceleration = { ax: 0, ay: 0 };
    this.quickSlots = [null, null, null];
    this.activeSlotIndex = 0;
    this.inventory = [];
    this.trapUsedThisRoom = [false, false, false];

    // Reset new buff timers
    this.stoneSkinTimer = 0; this.stoneSkinBonus = 0;
    this.damageBonusTimer = 0; this.damageBonusAmount = 0;
    this.regenTimer = 0; this.regenTickTimer = 0;

    // Reset armor properties
    this.defense = 0;
    this.bulletResist = 0;
    this.dodgeChance = 0;
    this.fireImmune = false;
    this.freezeImmune = false;
    this.poisonImmune = false;
    this.reflectDamage = 0;
    this.speedBoost = 0;
    this.speedPenalty = 0;
    this.slowEnemies = false;
    this.fishingLocked = false;
    this.rusalkaInputScale = 1.0;
  }

  static getDodgeRollDirection(arrowKeys) {
    let dx = 0, dy = 0;

    if (arrowKeys.ArrowUp) dy -= 1;
    if (arrowKeys.ArrowDown) dy += 1;
    if (arrowKeys.ArrowLeft) dx -= 1;
    if (arrowKeys.ArrowRight) dx += 1;

    const length = Math.sqrt(dx * dx + dy * dy);
    if (length > 0) {
      dx /= length;
      dy /= length;
    }

    return { x: dx, y: dy };
  }
}
