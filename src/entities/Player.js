import { PHYSICS, GRID, COLORS, PLAYER_STATS } from '../game/GameConfig.js';

const INVULNERABILITY_DURATION = 1.0; // seconds
const BLINK_FREQUENCY = 0.1; // blink every 0.1 seconds
const DAGGER_POST_DODGE_CRIT_WINDOW = 0.6; // seconds of guaranteed-crit after a dodge for any dagger

// Additively blend a tint color onto a base hex color. factor 0–1 controls tint intensity.
function additiveTint(base, tint, factor = 0.5) {
  const parse = h => { const n = parseInt(h.replace('#', ''), 16); return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]; };
  const [br, bg, bb] = parse(base);
  const [tr, tg, tb] = parse(tint);
  const r = Math.min(255, br + Math.round(tr * factor));
  const g = Math.min(255, bg + Math.round(tg * factor));
  const b = Math.min(255, bb + Math.round(tb * factor));
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

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
    this.meleeResist = 0;       // 0–1 fraction of melee damage absorbed
    this.dodgeChance = 0;
    this.fireImmune = false;
    this.freezeImmune = false;
    this.poisonImmune = false;
    this.slimeImmune = false;
    this.reflectDamage = 0;
    this.speedBoost = 0;
    this.speedPenalty = 0;
    this.slowEnemies = false;
    this.burnResist = 0;        // 0–1 fraction of burn DoT damage absorbed (stackable with fireImmune)
    this.massBonus = 0;         // added to base mass; higher mass = less knockback received
    this.rollCooldownMult = 1.0; // multiplier on dodge cooldown (< 1 = faster recharge, > 1 = slower)
    this.extraIframes = 0;      // extra seconds of invulnerability granted after a dodge roll

    this.quickSlots = [null, null, null]; // 3-slot loadout
    this.activeSlotIndex = 0; // Currently selected slot (0-2)
    this.destroyedSlots = [false, false, false]; // Slots permanently disabled by wish use

    // Magic meter — converted consumable slot(s) used as a mana gauge.
    // Activated via well/cauldron or cheat menu (per-slot upgrade), or auto-
    // activated for the Yellow Mage (all consumable slots locked to mana on
    // character select). slots holds the indices into equippedConsumables that
    // currently display the mana fill. active is true iff slots.length > 0.
    // Resets on death.
    this.magicMeter = {
      active: false,
      slots: [],
      current: 0,
      max: 10
    };
    this.inventory = []; // Ingredients only
    this.activeSappingBats = []; // Bats currently latched to this player (up to 3)
    this.hookedByMimic = null; // Enemy instance when mimic tongue has grabbed player
    this.facing = { x: 0, y: 1 }; // Direction player is facing

    // Invulnerability frames
    this.godMode = false; // Set via cheat menu — prevents all damage
    this.invulnerabilityTimer = 0;
    this.invulnerabilityDuration = INVULNERABILITY_DURATION;
    this.attackBlockTimer = 0; // Blocks attacks during extended iframe period (cyan rogue)

    // Physics flags
    this.mass = 1; // Affects knockback received. Armor/character type may modify this.
    this.hasCollision = true;
    this.boundToGrid = true;
    this.collisionMap = null; // Set by game state
    this.plane = 0; // 0=normal plane, 1=tunnel plane
    this.inHut = false; // true while inside a hut interior overlay
    this.hutExitPosition = null; // saved exterior position when entering a hut
    this.inMaze = false; // true while inside a maze interior
    this.mazeExitPosition = null; // saved exterior position when entering a maze

    // Polymorph state (managed by PolymorphSystem)
    this.polymorphed = false;      // currently in frog form
    this.polymorphCursed = false;  // true only during witch-curse (forces exits open)
    this.polymorphCured = false;   // true after first Rusalka cure (enables F key toggle)
    this.polymorphSavedState = null; // saved { char, color, baseColor, dodgeChance, rollType }
    // _polymorphSpeedOverride / _polymorphAccelOverride — set/deleted by PolymorphSystem
    // Frog jump movement state (managed by PolymorphSystem._updateFrogMovement)
    this._frogJumpActive = false;
    this._frogJumpTimer = 0;
    this._frogJumpDurationTimer = 0;
    this._frogJumpSide = 1;

    // Boss grab state
    this.grabbed   = false; // true while a GooHead has the player in its grip
    this.grabbedBy = null;  // reference to the GooHead holding the player

    // Interior state
    this.inDungeon = false;        // true while inside a dungeon interior
    this.dungeonExitPosition = null; // saved exterior position when entering a dungeon

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

    // Ember accumulation (cumulative burn resistance — 3 hits within window to ignite)
    this.emberStacks = 0;
    this.emberStackTimer = 0;
    this.emberStackCooldown = 0; // minimum 0.5s between stack gains

    // Water immunity (from Rubber Boots)
    this.waterImmunityTimer = 0;

    // Shark Mask dive state (active only while equipped + in water)
    this.diving = false;
    this.diveTimer = 0;            // seconds remaining in current dive
    this.diveDuration = 3.0;       // max dive length before forced surface

    // Coral Crown / Stingray Mantle per-frame trackers
    this._crystalPlatformCells = []; // recent platform cells [{col,row,timer}], cap 8
    this._wakeEmitTimer = 0;         // throttles wake-tile emission

    // Float (from Floating Boots) — ignores lava, water, and mud
    this.floatTimer = 0;

    // Steam trail emission timer (throttles puff particle emission)
    this.steamTrailTimer = 0;

    // Timed buffs
    this.speedBoostTimer = 0;
    this.speedBoostMultiplier = 1.5;
    this.firingSlowTimer = 0; // Slows movement while/just after firing a gun
    this.batFormTimer = 0; // Shadow Robe: 2-second bat form (char → '^', speed boost)
    // Luck: passive when Lucky Coin is equipped (luckActive), permanent at half-power
    // when Lucky Coin is vested in a well (luckBlessed). Both gate the LootSystem
    // multiplier; luckActive grants crit + dodge; luckBlessed grants half crit + dodge
    // and unlocks lucky exit weighting in ExitSystem.
    this.luckActive = false;
    this.luckBlessed = false;
    this.critChance = 0;        // chance to crit on player→enemy hits
    this.luckDodgeBonus = 0;    // additional dodge chance, distinct from armor dodgeChance
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

    // Staff blocking (basic staves: '/' Staff and 'ߒ' Fishing Pole)
    // Triggered when space remains held past the staff swing cooldown.
    this.isStaffBlocking = false;
    this.staffSwingHasFired = false; // set after a staff swing fires; cleared on space release

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
      hideDuration: 0, // Cyan rogue: how long `hidden` flag persists after roll start (0 = roll-only)
      hideTimer: 0,    // Active countdown of the hide window

      // Slope interaction — see updateDodgeRoll for full mechanic description
      slopeFreeTime: 5 / 60, // seconds of unimpeded roll on a slope (~20 frames at 60fps)
      slopeTimer:    0,        // countdown for the remaining slope-roll window
      slopeActive:   false,    // true once a slope tile was detected during this roll
      slopeLocked:   false     // true during mercy phase: roll velocity zeroed, slope takes over
    };

    // Post-dodge crit window — set when dodge ends if equipped weapon has critAfterDodge.
    // CombatSystem._applyCritIfLucky forces a guaranteed crit while >0.
    this.postDodgeCritTimer = 0;

    // Set by PhysicsSystem each frame; read by updateDodgeRoll (1-frame lag is imperceptible)
    this.isOnSlope = false;
    this.isOnIce   = false;

    // Status effects
    this.statusEffects = {
      goo: { active: false, duration: 0, slowAmount: 0.8 }, // Heavy slow + prevents dodge roll
      freeze: { active: false, duration: 0, slowAmount: 0.5 },
      slimeBoost: { active: false, duration: 0, speedMult: 2.0 }, // Speed boost from slime puddle (slime suit) — matches slime enemy 2x
      dizzy: { active: false, duration: 0 }
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
    this.backstabMultiplier = 1.0; // Cyan Rogue: multiplier applied when hitting undetected enemies

    // Tracks the last enemy entity to deal damage to this player (for tombstone)
    this._lastAttacker = null;
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

    // Frog form: suppress normal input-driven movement; PolymorphSystem drives velocity via jumps
    if (this.polymorphed) {
      if (!lockFacing) {
        if (inputState.left)  this.facing.x = -1;
        if (inputState.right) this.facing.x =  1;
        if (inputState.up)    this.facing.y = -1;
        if (inputState.down)  this.facing.y =  1;
      }
      this.acceleration.ax = 0;
      this.acceleration.ay = 0;
      if (!this._frogJumpActive) {
        // Coast to a stop between jumps
        this.velocity.vx *= 0.75;
        this.velocity.vy *= 0.75;
        if (Math.abs(this.velocity.vx) < 2) this.velocity.vx = 0;
        if (Math.abs(this.velocity.vy) < 2) this.velocity.vy = 0;
      }
      return;
    }

    // Check if charging a bow (for movement slowdown)
    const isChargingBow = this.heldItem && this.heldItem.isCharging;

    // Calculate target acceleration based on input (1.5x acceleration when unarmed)
    // Polymorph speed/accel overrides (set by PolymorphSystem when in frog form)
    const accelBase = this._polymorphAccelOverride
      ?? (this.heldItem ? PHYSICS.PLAYER_ACCELERATION : PHYSICS.PLAYER_ACCELERATION * 1.5);
    const baseAcceleration = accelBase;
    const batAccel = this.batFormTimer > 0 ? 1.8 : 1.0; // Bat form: noticeably faster acceleration
    const acceleration = baseAcceleration * (1 + this.speedBoost - this.speedPenalty) * batAccel;
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

    // Grabbed by boss head: lock movement but allow facing/attack input
    if (this.grabbed) {
      this.acceleration.ax = 0;
      this.acceleration.ay = 0;
      this.velocity.vx *= 0.75;
      this.velocity.vy *= 0.75;
      if (Math.abs(this.velocity.vx) < 4) this.velocity.vx = 0;
      if (Math.abs(this.velocity.vy) < 4) this.velocity.vy = 0;
    // Sapped by ice wraith(s): freeze movement entirely
    } else if (this.activeSappingBats.length > 0) {
      this.acceleration.ax = 0;
      this.acceleration.ay = 0;
      this.velocity.vx *= 0.75;
      this.velocity.vy *= 0.75;
      if (Math.abs(this.velocity.vx) < 4) this.velocity.vx = 0;
      if (Math.abs(this.velocity.vy) < 4) this.velocity.vy = 0;
    // While charging bow: zero acceleration (movement slows to stop) but allow aiming
    } else if (isChargingBow) {
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
    const baseMaxSpeed = this._polymorphSpeedOverride
      ?? (this.heldItem ? PHYSICS.PLAYER_SPEED : PHYSICS.PLAYER_SPEED * 1.5);
    const armorModified = baseMaxSpeed * (1 + this.speedBoost - this.speedPenalty);
    const batMax = this.batFormTimer > 0 ? armorModified * 1.8 : armorModified;
    const boostedMax = this.speedBoostTimer > 0 ? Math.max(batMax, armorModified * this.speedBoostMultiplier) : batMax;
    const firingMult = this.firingSlowTimer > 0 ? 0.35 : 1; // Dramatic ~65% slow while firing a gun
    const finalMax = boostedMax * this.getStatusSpeedMultiplier() * firingMult; // Apply status effect slows (goo, freeze)
    const speed = Math.sqrt(this.velocity.vx ** 2 + this.velocity.vy ** 2);
    if (speed > finalMax) {
      this.velocity.vx = (this.velocity.vx / speed) * finalMax;
      this.velocity.vy = (this.velocity.vy / speed) * finalMax;
    }
  }

  getHitbox() {
    const hw = 2, hh = 2; // 4x4 hitbox, centered
    return {
      x: this.position.x + (this.width / 2) - hw,
      y: this.position.y + (this.height / 2) - hh,
      width: hw * 2,
      height: hh * 2
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
    if (effect === 'freeze' && this.freezeImmune) return;

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

    // Slime boost (speed increase from slime puddle while wearing slime suit)
    const slimeBoost = this.statusEffects.slimeBoost;
    if (slimeBoost.active) {
      slimeBoost.duration -= deltaTime;
      if (slimeBoost.duration <= 0) {
        slimeBoost.active = false;
        slimeBoost.duration = 0;
      }
    }

    const dizzy = this.statusEffects.dizzy;
    if (dizzy.active) {
      dizzy.duration -= deltaTime;
      if (dizzy.duration <= 0) { dizzy.active = false; dizzy.duration = 0; }
    }
  }

  isGooey() {
    return this.statusEffects.goo.active;
  }

  isFrozen() {
    return this.statusEffects.freeze.active;
  }

  isDizzy() { return this.statusEffects.dizzy.active; }

  getStatusSpeedMultiplier() {
    if (this.isGooey()) return 1 - this.statusEffects.goo.slowAmount;
    if (this.isFrozen()) return 1 - this.statusEffects.freeze.slowAmount;
    if (this.statusEffects.slimeBoost.active) return this.statusEffects.slimeBoost.speedMult;
    if (this.isDizzy()) return 0.35;
    return 1;
  }

  getDisplayColor() {
    // Low-HP warning: blink dark red when at 3 or less. Highest-priority signal.
    if (this.hp > 0 && this.hp <= 3) {
      const blinkCycle = Math.floor(this.statusBlinkTimer / 0.25);
      if (blinkCycle % 2 === 0) return '#660000';
    }
    // Blink green when gooey
    if (this.isGooey()) {
      const BLINK_FREQUENCY = 0.3;
      const blinkCycle = Math.floor(this.statusBlinkTimer / BLINK_FREQUENCY);
      return blinkCycle % 2 === 0 ? '#00ff00' : this.baseColor;
    }
    // Blink white when sapped by ice wraith(s)
    if (this.activeSappingBats.length > 0) {
      const BLINK_FREQUENCY = 0.25;
      const blinkCycle = Math.floor(this.statusBlinkTimer / BLINK_FREQUENCY);
      return blinkCycle % 2 === 0 ? '#ffffff' : this.baseColor;
    }
    // Blink gold when dizzy
    if (this.isDizzy()) {
      const blinkCycle = Math.floor(this.statusBlinkTimer / 0.2);
      return blinkCycle % 2 === 0 ? '#ddbb00' : this.baseColor;
    }
    // Red tint when accumulating ember stacks (proximity to fire)
    if (this.emberStacks > 0) return additiveTint(this.color, '#ff2200', 0.5);
    // Blue tint when standing in water (inLiquid resets each frame — distinct from lingering wet status)
    if (this.inLiquid) return additiveTint(this.color, '#2266ff', 0.5);
    return this.color;
  }

  update(deltaTime) {
    // Update status effects
    this.updateStatusEffects(deltaTime);

    // Update status blink timer
    this.statusBlinkTimer += deltaTime;
    // Update dodge roll state
    this.updateDodgeRoll(deltaTime);
    // Update Shark Mask dive (auto-ends on timer expire or leaving water)
    this.updateSharkDive(deltaTime);

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
    if (this.firingSlowTimer > 0) this.firingSlowTimer -= deltaTime;
    if (this.postDodgeCritTimer > 0) this.postDodgeCritTimer -= deltaTime;
    if (this.blockBoostTimer > 0) this.blockBoostTimer -= deltaTime;
    // Shadow Robe bat form — restore char when timer expires
    if (this.batFormTimer > 0) {
      this.batFormTimer -= deltaTime;
      if (this.batFormTimer <= 0) {
        this.batFormTimer = 0;
        if (!this.polymorphed) this.char = '@'; // don't overwrite frog form
      }
    }
    if (this.waterImmunityTimer > 0) this.waterImmunityTimer -= deltaTime;
    if (this.floatTimer > 0) this.floatTimer -= deltaTime;
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
    // Dizzy: deviate roll up to ±54° from intended direction
    if (this.isDizzy()) {
      const baseAngle = Math.atan2(this.dodgeRoll.direction.y, this.dodgeRoll.direction.x);
      const newAngle = baseAngle + (Math.random() - 0.5) * (Math.PI * 0.6);
      this.dodgeRoll.direction = { x: Math.cos(newAngle), y: Math.sin(newAngle) };
    }
    this.dodgeRoll.timer = this.dodgeRoll.duration;
    this.dodgeRoll.cooldownTimer = this.dodgeRoll.cooldown * this.rollCooldownMult;
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
        // Grant i-frames for duration + 0.5s extra, plus any armor bonus
        this.invulnerabilityTimer = this.dodgeRoll.duration + 0.5 + this.extraIframes;
        break;
      case 'hide':
        // Invisible to enemies + extended i-frames (cyan rogue specialty)
        this.hidden = true;
        // Extended i-frames: 0.25s roll + 1.25s = 1.5s total invulnerability
        this.invulnerabilityTimer = this.dodgeRoll.duration + 1.25;
        // Attacks blocked for entire extended iframe duration
        this.attackBlockTimer = this.invulnerabilityTimer;
        // Hide persists past the roll itself — enemies actively forget the player while hidden,
        // giving room to reposition and set up a backstab.
        this.dodgeRoll.hideTimer = this.dodgeRoll.hideDuration || this.invulnerabilityTimer;
        break;
      case 'damage':
        // Minimal i-frames — only for the roll duration itself, no buffer (requires precision)
        this.invulnerabilityTimer = this.dodgeRoll.duration;
        break;
      case 'whirlwind':
        // No i-frames — offensive spin, not defensive evasion
        break;
      case 'blink':
        // Defer teleport to main.js for collision checking, bounds enforcement, and trail particles
        this.pendingBlink = { direction: { x: direction.x, y: direction.y }, distance: this.dodgeRoll.distance };
        this.dodgeRoll.timer = 0; // Instant
        break;
    }

    return true;
  }

  // ── Shark Mask: dive + emerge ─────────────────────────────────────────────
  // Activated by main.js when dodge-roll is pressed in water while Shark Mask
  // is equipped. Player swims at 1.8× speed on plane PLANE_SUBMERGED (= 2),
  // invisible to surface enemies via PlaneSystem.canInteract. Re-rolling
  // during a dive triggers the emerge attack (handled in main.js with access
  // to room enemies + combat system).
  startSharkDive(direction) {
    this.diving = true;
    this.diveTimer = this.diveDuration;
    this.plane = 2; // PLANE_SUBMERGED — surface enemies stop seeing the player
    this.char = '^'; // fin glyph
    // 1.8× speed via existing speedBoost system; resets in updateSharkDive on end.
    this._diveSavedSpeedBoost = this.speedBoost;
    this.speedBoost = 0.8; // additive → +80% (1.8× base)
    // Give the dive an initial directional kick so the player visibly enters.
    const baseMax = (this.heldItem ? 110 : 165) * (1 + this.speedBoost);
    this.velocity.vx = direction.x * baseMax;
    this.velocity.vy = direction.y * baseMax;
    // Brief iframe on entry so contact damage doesn't trigger as the dive starts.
    this.invulnerabilityTimer = Math.max(this.invulnerabilityTimer, 0.3);
    // Brief cooldown so the same press-and-release doesn't immediately emerge.
    this.dodgeRoll.cooldownTimer = 0.2;
  }

  endSharkDive() {
    if (!this.diving) return;
    this.diving = false;
    this.diveTimer = 0;
    this.plane = 0;
    this.char = '@';
    this.speedBoost = this._diveSavedSpeedBoost || 0;
    this._diveSavedSpeedBoost = 0;
  }

  // Tick called from update(). Auto-ends the dive on timer expire or when the
  // player exits water (the fin only swims through liquid).
  updateSharkDive(deltaTime) {
    if (!this.diving) return;
    this.diveTimer -= deltaTime;
    if (this.diveTimer <= 0 || !this.inLiquid) {
      this.endSharkDive();
    }
  }

  updateDodgeRoll(deltaTime) {
    // Cooldown tick
    if (this.dodgeRoll.cooldownTimer > 0) {
      this.dodgeRoll.cooldownTimer -= deltaTime;
    }

    // Hide window tick (cyan rogue) — persists past the roll itself
    if (this.dodgeRoll.hideTimer > 0) {
      this.dodgeRoll.hideTimer -= deltaTime;
      if (this.dodgeRoll.hideTimer <= 0) {
        this.dodgeRoll.hideTimer = 0;
        this.hidden = false;
      }
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
        // Note: hidden flag for 'hide' rolls is driven by hideTimer (which persists past
        // the roll itself); do NOT clear it here.
        // Open post-dodge crit window for dagger-class weapons (subtype behavior).
        const activeWeapon = this.quickSlots?.[this.activeSlotIndex];
        if (activeWeapon?.data?.weaponSubtype === 'dagger') {
          this.postDodgeCritTimer = DAGGER_POST_DODGE_CRIT_WINDOW;
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
    // God mode — absorb all damage
    if (this.godMode) {
      return false;
    }

    // Can't take damage during invulnerability frames
    if (this.invulnerabilityTimer > 0) {
      // Active dodge roll: signal as a roll-dodge so call sites can show DODGE text
      if (this.dodgeRoll.active && this.dodgeRoll.type !== 'whirlwind') {
        return { dodged: true, roll: true };
      }
      return false;
    }

    const hpBefore = this.hp;

    // Dodge check (all damage types). Two independent rolls so the floating-text
    // call site can attribute "LUCKY DODGE" vs plain "DODGE". Luck rolls first
    // so its prefix wins on overlap.
    if (this.luckDodgeBonus > 0 && Math.random() < this.luckDodgeBonus) {
      return { dodged: true, lucky: true };
    }
    if (this.dodgeChance > 0 && Math.random() < this.dodgeChance) {
      return { dodged: true, lucky: false };
    }

    // Bullet resistance check (probabilistic block)
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

    // Melee resistance: flat damage absorption applied before final floor
    const meleeAbsorb = damageSource.isMelee && this.meleeResist > 0
      ? Math.floor(amount * this.meleeResist)
      : 0;

    // Burn resist: partial reduction of fire DoT when not fully immune
    const burnAbsorb = damageSource.element === 'burn' && this.burnResist > 0
      ? Math.floor(amount * this.burnResist)
      : 0;

    const actualDamage = Math.max(1, amount - this.defense - tempDefense - meleeAbsorb - burnAbsorb);

    this.hp -= actualDamage;
    if (this.hp < 0) this.hp = 0;

    // Track last attacker for tombstone
    if (damageSource.attacker) {
      this._lastAttacker = damageSource.attacker;
    }

    // Start invulnerability frames
    if (this.hp > 0) {
      this.invulnerabilityTimer = this.invulnerabilityDuration;
    }

    // Damage reflection
    if (this.reflectDamage > 0 && damageSource.attacker) {
      const reflectedAmount = Math.ceil(actualDamage * this.reflectDamage);
      return this.hp <= 0 ? true : {
        damaged: true,
        actualDamage,
        reflect: reflectedAmount,
        attacker: damageSource.attacker
      };
    }

    // Return true if dead, or a truthy value if damaged (for damage numbers)
    return this.hp <= 0 ? true : { damaged: true, actualDamage };
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
    this.inventory.push(typeof ingredient === 'string' ? ingredient : ingredient.char);
  }

  removeIngredient(ingredient) {
    const index = this.inventory.indexOf(ingredient);
    if (index > -1) {
      this.inventory.splice(index, 1);
    }
  }

  pickupItem(item) {
    // Apply trap capacity affinity (e.g. Gray Assassin: +1 trap charge on pickup)
    if (item && item.data && item.data.type === 'TRAP' && item.charges != null) {
      const trapAffinity = this.weaponAffinities && this.weaponAffinities['trap'];
      if (trapAffinity && trapAffinity.additionalCharge) {
        item.charges += trapAffinity.additionalCharge;
      }
    }

    // Find first empty, non-destroyed slot
    const emptySlotIdx = this.quickSlots.findIndex(
      (slot, i) => slot === null && !this.destroyedSlots[i]
    );

    if (emptySlotIdx !== -1) {
      this.quickSlots[emptySlotIdx] = item;
      return null; // No item dropped
    } else {
      // All usable slots full - swap with active slot (prefer non-destroyed)
      let swapIdx = this.activeSlotIndex;
      if (this.destroyedSlots[swapIdx]) {
        swapIdx = this.quickSlots.findIndex((_, i) => !this.destroyedSlots[i]);
        if (swapIdx === -1) return item; // all slots destroyed, can't pick up
      }
      const droppedItem = this.quickSlots[swapIdx];
      this.quickSlots[swapIdx] = item;
      this.activeSlotIndex = swapIdx;
      return droppedItem;
    }
  }

  dropItem() {
    const item = this.quickSlots[this.activeSlotIndex];
    this.quickSlots[this.activeSlotIndex] = null;

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

    // Dizzy: scramble attack direction ±120° before all weapon types read player.facing
    let savedFacing = null;
    if (this.isDizzy()) {
      const baseAngle = Math.atan2(this.facing.y, this.facing.x);
      const newAngle = baseAngle + (Math.random() - 0.5) * (Math.PI * 4 / 3);
      savedFacing = { x: this.facing.x, y: this.facing.y };
      this.facing.x = Math.cos(newAngle);
      this.facing.y = Math.sin(newAngle);
    }

    const result = this.heldItem.use(this);

    if (savedFacing) {
      this.facing.x = savedFacing.x;
      this.facing.y = savedFacing.y;
    }

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
    const len = this.quickSlots.length;
    let next = (this.activeSlotIndex + 1) % len;
    for (let i = 0; i < len; i++) {
      if (!this.destroyedSlots[next]) {
        if (next !== this.activeSlotIndex) this._cancelHeldItemActivity();
        this.activeSlotIndex = next;
        return;
      }
      next = (next + 1) % len;
    }
    // All slots destroyed — stay put
  }

  cycleSlotPrevious() {
    const len = this.quickSlots.length;
    let prev = (this.activeSlotIndex - 1 + len) % len;
    for (let i = 0; i < len; i++) {
      if (!this.destroyedSlots[prev]) {
        if (prev !== this.activeSlotIndex) this._cancelHeldItemActivity();
        this.activeSlotIndex = prev;
        return;
      }
      prev = (prev - 1 + len) % len;
    }
    // All slots destroyed — stay put
  }

  _cancelHeldItemActivity() {
    this.heldItem?.cancelChargeAndReload?.();
  }

  // Check if active slot has a trap with charges remaining
  canUseTrap() {
    const item = this.heldItem;
    if (!item || !item.data || item.data.type !== 'TRAP') return false;
    return item.charges > 0;
  }

  // Mark trap as used: decrement charge and advance to next filled slot.
  markTrapUsed() {
    const item = this.heldItem;
    if (item?.charges != null) item.charges--;
    // Only advance to next slot when charges are depleted
    if (item?.charges === 0) {
      const nextFilled = this.quickSlots.findIndex((slot, idx) =>
        idx !== this.activeSlotIndex && slot !== null
      );
      if (nextFilled !== -1) {
        this.activeSlotIndex = nextFilled;
      }
    }
  }

  // Reset trap charges for each trap in quick slots (called on room entry).
  resetTrapsForNewRoom() {
    for (const slot of this.quickSlots) {
      if (slot?.data?.type === 'TRAP') {
        slot.charges = slot.data.charges ?? 3;
      }
    }
  }

  reset() {
    this.hp = PLAYER_STATS.START_HP;
    this.maxHp = PLAYER_STATS.MAX_HP;
    this.velocity = { vx: 0, vy: 0 };
    this.acceleration = { ax: 0, ay: 0 };
    this.quickSlots = [null, null, null];
    this.activeSlotIndex = 0;
    this.destroyedSlots = [false, false, false];
    this.inventory = [];
    this.magicMeter = { active: false, slots: [], current: 0, max: 10 };

    // Reset new buff timers
    this.stoneSkinTimer = 0; this.stoneSkinBonus = 0;
    this.damageBonusTimer = 0; this.damageBonusAmount = 0;
    this.regenTimer = 0; this.regenAmount = 1; this.regenInterval = 1.0; this.regenTickTimer = 0;

    // Reset luck (Lucky Coin passive + well-vested blessing)
    this.luckActive = false;
    this.luckBlessed = false;
    this.critChance = 0;
    this.luckDodgeBonus = 0;

    // Reset armor properties
    this.defense = 0;
    this.bulletResist = 0;
    this.meleeResist = 0;
    this.dodgeChance = 0;
    this.fireImmune = false;
    this.freezeImmune = false;
    this.poisonImmune = false;
    this.slimeImmune = false;
    this.reflectDamage = 0;
    this.speedBoost = 0;
    this.speedPenalty = 0;
    this.slowEnemies = false;
    this.burnResist = 0;
    this.massBonus = 0;
    this.mass = 1;
    this.rollCooldownMult = 1.0;
    this.extraIframes = 0;
    this.fishingLocked = false;
    this.rusalkaInputScale = 1.0;

    // Reset status effects
    this.statusEffects = {
      goo: { active: false, duration: 0, slowAmount: 0.8 },
      freeze: { active: false, duration: 0, slowAmount: 0.5 },
      slimeBoost: { active: false, duration: 0, speedMult: 2.0 }
    };

    // Reset burn state
    this.burnDuration = 0;
    this.burnTickTimer = 0;

    // Reset wet state
    this.wetDuration = 0;
    this.wetDropTimer = 0;

    // Reset ember accumulation
    this.emberStacks = 0;
    this.emberStackTimer = 0;
    this.emberStackCooldown = 0;

    // Reset timed buffs
    this.speedBoostTimer = 0;
    this.firingSlowTimer = 0;
    this.batFormTimer = 0;
    this.blockBoostTimer = 0;
    this.blockBoostAmount = 0;
    this.waterImmunityTimer = 0;
    this.floatTimer = 0;
    this.steamTrailTimer = 0;
    this.footstepTimer = 0;
    this.footstepSide = 0;

    // Reset invulnerability/attack block timers
    this.invulnerabilityTimer = 0;
    this.attackBlockTimer = 0;

    // Reset shield charges
    this.shieldCharges = 0;
    this.shieldMaxCharges = 0;
    this.shieldCooldown = 0;
    this.shieldBlocksAll = false;

    // Reset staff blocking state
    this.isStaffBlocking = false;
    this.staffSwingHasFired = false;

    // Reset boss grab state
    this.grabbed = false;
    this.grabbedBy = null;

    // Reset sapping bats
    this.activeSappingBats = [];
    this.hookedByMimic = null;

    // Reset character-specific state
    this.actionCooldown = 0;
    this.actionCooldownMax = 0;
    this.rollCharge = 0;
    this.continuousRollActive = false;
    this.pendingBlink = null;
    this.greenIdleDamageBonus = 0;
    this.greenCombatDamagePenalty = 0;
    this.backstabMultiplier = 1.0;
    this._lastAttacker = null;

    // Reset dodge roll state
    this.dodgeRoll.active = false;
    this.dodgeRoll.cooldownTimer = 0;
    this.dodgeRoll.slopeTimer = 0;
    this.dodgeRoll.slopeActive = false;
    this.dodgeRoll.slopeLocked = false;

    // Reset hide-roll hidden flag
    this.hidden = false;
    this.dodgeRoll.hideTimer = 0;

    // Reset inLiquid (set per-frame by main.js)
    this.inLiquid = false;

    // Reset plane and interior state
    this.plane = 0;
    this.inHut = false;
    this.hutExitPosition = null;
    this.inMaze = false;
    this.mazeExitPosition = null;
    this.inDungeon = false;
    this.dungeonExitPosition = null;

    // Polymorph state
    this.polymorphed = false;
    this.polymorphCursed = false;
    this.polymorphCured = false;
    this.polymorphSavedState = null;
    delete this._polymorphSpeedOverride;
    delete this._polymorphAccelOverride;
    this._frogJumpActive = false;
    this._frogJumpTimer = 0;
    this._frogJumpDurationTimer = 0;
    this._frogJumpSide = 1;

    // Restore display char (may have been overwritten by bat form or frog form)
    this.char = '@';
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
