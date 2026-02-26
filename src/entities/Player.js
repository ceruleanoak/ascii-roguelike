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
    this.facing = { x: 0, y: 1 }; // Direction player is facing

    // Trap usage tracking (resets per room)
    this.trapUsedThisRoom = [false, false, false]; // Track if trap in each slot was used this room

    // Invulnerability frames
    this.invulnerabilityTimer = 0;
    this.invulnerabilityDuration = INVULNERABILITY_DURATION;

    // Physics flags
    this.hasCollision = true;
    this.boundToGrid = true;
    this.collisionMap = null; // Set by game state

    // Wet status
    this.wetDuration = 0;
    this.wetDropTimer = 0; // throttles trail particle emission

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

    // Shield charges (from Shield / Tower Shield consumables)
    this.shieldCharges = 0;
    this.shieldMaxCharges = 0;
    this.shieldCooldown = 0;
    this.shieldCooldownMax = 5;
    this.shieldBlocksAll = false; // true = blocks melee too, false = bullets only

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
      iframes: true // invulnerability during roll (for 'dodge' type)
    };

    // Status effects
    this.statusEffects = {
      goo: { active: false, duration: 0, slowAmount: 0.8 }, // Heavy slow + prevents dodge roll
      freeze: { active: false, duration: 0, slowAmount: 0.5 }
    };

    // Status visual feedback
    this.statusBlinkTimer = 0;
    this.baseColor = '#ffffff'; // Will be set by character type
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

    // While charging bow: zero acceleration (movement slows to stop) but allow aiming
    if (isChargingBow) {
      this.acceleration.ax = 0;
      this.acceleration.ay = 0;

      // Apply gentle deceleration (friction) to bring player to a stop
      const chargeDeceleration = 0.95; // Lower = faster stop (0.95 = gentle, gradual slowdown)
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

    if (this.wetDuration > 0) this.wetDuration -= deltaTime;

    // Tick timed buffs
    if (this.speedBoostTimer > 0) this.speedBoostTimer -= deltaTime;
    if (this.luckTimer > 0) this.luckTimer -= deltaTime;
    if (this.blockBoostTimer > 0) this.blockBoostTimer -= deltaTime;
    if (this.waterImmunityTimer > 0) this.waterImmunityTimer -= deltaTime;

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
        console.log(`[DAMAGE] BURN DoT tick fired (${this.burnDamage} damage will be applied)`);
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
      console.log(`[DODGE] Cancelled ${this.heldItem.data.name} windup`);
    }

    // Cancel bow charging
    if (this.heldItem && this.heldItem.isCharging) {
      this.heldItem.isCharging = false;
      this.heldItem.chargeTime = 0;
      this.heldItem.chargingPlayer = null;
      console.log(`[DODGE] Cancelled ${this.heldItem.data.name} charge`);
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
        // Invisible to enemies (will implement in Week 2)
        this.hidden = true;
        break;
      case 'damage':
        // Leave damaging trail (particles created in main.js)
        break;
      case 'blink':
        // Instant teleport
        this.position.x += direction.x * this.dodgeRoll.distance;
        this.position.y += direction.y * this.dodgeRoll.distance;
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
      this.dodgeRoll.timer -= deltaTime;

      if (this.dodgeRoll.timer <= 0) {
        // Roll complete - zero out velocity
        this.dodgeRoll.active = false;
        this.velocity.vx = 0;
        this.velocity.vy = 0;
        this.acceleration.ax = 0;
        this.acceleration.ay = 0;
        if (this.dodgeRoll.type === 'hide') {
          this.hidden = false;
        }
      } else if (this.dodgeRoll.type !== 'blink') {
        // Apply roll movement through velocity (allows PhysicsSystem to handle collisions)
        this.velocity.vx = this.dodgeRoll.direction.x * this.dodgeRoll.speed;
        this.velocity.vy = this.dodgeRoll.direction.y * this.dodgeRoll.speed;
        this.acceleration.ax = 0;
        this.acceleration.ay = 0;
      }
    }
  }

  takeDamage(amount, damageSource = {}) {
    // Can't take damage during invulnerability frames
    if (this.invulnerabilityTimer > 0) {
      console.log(`[DAMAGE] Blocked by invulnerability frames (${this.invulnerabilityTimer.toFixed(2)}s remaining)`);
      return false;
    }

    const hpBefore = this.hp;

    // Dodge check (all damage types)
    if (this.dodgeChance > 0 && Math.random() < this.dodgeChance) {
      console.log(`[DAMAGE] DODGED! (${(this.dodgeChance * 100).toFixed(0)}% chance) - HP: ${this.hp}/${this.maxHp}`);
      return { dodged: true };
    }

    // Bullet resistance check
    if (damageSource.isBullet && this.bulletResist > 0) {
      if (Math.random() < this.bulletResist) {
        console.log(`[DAMAGE] BULLET BLOCKED! (${(this.bulletResist * 100).toFixed(0)}% chance) - HP: ${this.hp}/${this.maxHp}`);
        return { blocked: true };
      }
    }

    // Elemental immunity checks
    if (damageSource.element) {
      if (this.fireImmune && damageSource.element === 'burn') {
        console.log(`[DAMAGE] FIRE IMMUNE! - HP: ${this.hp}/${this.maxHp}`);
        return { immune: true };
      }
      if (this.freezeImmune && damageSource.element === 'freeze') {
        console.log(`[DAMAGE] FREEZE IMMUNE! - HP: ${this.hp}/${this.maxHp}`);
        return { immune: true };
      }
      if (this.poisonImmune && damageSource.element === 'poison') {
        console.log(`[DAMAGE] POISON IMMUNE! - HP: ${this.hp}/${this.maxHp}`);
        return { immune: true };
      }
    }

    // Apply defense (reduce damage, minimum 1)
    const actualDamage = Math.max(1, amount - this.defense);

    this.hp -= actualDamage;
    if (this.hp < 0) this.hp = 0;

    // Log damage details
    const damageType = damageSource.isBullet ? 'BULLET' : 'MELEE';
    const elementInfo = damageSource.element ? ` [${damageSource.element}]` : '';
    const defenseInfo = this.defense > 0 ? ` (${amount} - ${this.defense} defense = ${actualDamage})` : '';
    const isDead = this.hp <= 0;

    console.log(`[DAMAGE] ${damageType}${elementInfo}: ${actualDamage} damage${defenseInfo} | HP: ${hpBefore} → ${this.hp}/${this.maxHp}${isDead ? ' 💀 DEATH' : ''}`);

    // Start invulnerability frames
    if (this.hp > 0) {
      this.invulnerabilityTimer = this.invulnerabilityDuration;
    }

    // Damage reflection
    if (this.reflectDamage > 0 && damageSource.attacker) {
      const reflectedAmount = Math.ceil(actualDamage * this.reflectDamage);
      console.log(`[DAMAGE] Reflected ${reflectedAmount} damage back to attacker (${(this.reflectDamage * 100).toFixed(0)}%)`);
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
  }
}
