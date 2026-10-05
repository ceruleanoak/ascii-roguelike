import { PHYSICS, GRID, COLORS, PLAYER_STATS } from '../game/GameConfig.js';
import { StatusEffectSystem, createPlayerStatusSlots } from '../systems/StatusEffectSystem.js';
import { computePlayerPipRows, computePlayerDisplayColor } from '../systems/StatusEffectVisuals.js';
import { PlayerDamageSystem } from '../systems/PlayerDamageSystem.js';
import { PlayerDodgeRollSystem } from '../systems/PlayerDodgeRollSystem.js';
import { initParry } from './enemyMechanics/ParryMechanic.js';

const INVULNERABILITY_DURATION = 1.0;
const BLINK_FREQUENCY = 0.1;
const SPAWN_FADE_DURATION = 0.9;
const EXIT_FADE_DURATION = 0.3;

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
    this.passiveMaxHpBonus = 0; // share of maxHp currently granted by equipped hearts (EquipmentEffectsSystem)
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
    this.parryMechanic = null;  // Buckler: armor's parryMechanic config (ParryMechanic.js)
    initParry(this);            // parry cycle timers, shared with enemy parry
    this.smokeOnHit = false;    // Bloom Mantle: bursts a pollen smoke screen when struck
    this.smokeBurstPending = false; // one-frame signal consumed by main.js to spawn the cloud
    this.hurtPending = false; // survived a hit since the last consumable check (healOnHit; InventorySystem)
    this.speedBoost = 0;
    this.speedPenalty = 0;
    this.slowEnemies = false;
    this.burnResist = 0;        // 0–1 fraction of burn DoT damage absorbed (stackable with fireImmune)
    this.massBonus = 0;         // added to base mass; higher mass = less knockback received
    this.rollCooldownMult = 1.15; // multiplier on dodge cooldown (< 1 = faster recharge, > 1 = slower); baseline nudged up from 1.0 — unarmored rolling was too frequent
    this.extraIframes = 0;      // extra seconds of invulnerability granted after a dodge roll

    this.quickSlots = [null, null, null]; // 3-slot loadout
    this.activeSlotIndex = 0; // Currently selected slot (0-2)
    this.destroyedSlots = [false, false, false]; // Slots permanently disabled by wish use
    this.selectedConsumableIndex = -1; // armed consumable slot; -1 = weapon controls SPACE

    // Magic meter — converted consumable slot(s) used as a mana gauge.
    // slots holds indices into equippedConsumables showing the mana fill.
    // active reflects MagicSystem.effectiveManaSlotCount() (applies the
    // per-character Yellow/Red modifier). Resets on death.
    this.magicMeter = {
      active: false,
      slots: [],
      current: 0,
      max: 10,
      freeSlotGranted: false
    };
    // No ingredient array here. Ingredients live in one pile on InventorySystem
    // (see its constructor) and are reached through game.getIngredients() /
    // hasIngredient() / addIngredient() / removeIngredient(). A carried array on
    // the player was the second half of the old two-pool split, which halved the
    // inventory for every feature that read the wrong one.
    this.activeSappingBats = []; // Bats currently latched to this player (up to 3)
    // Tomb Ghost sap — deliberately NOT added to activeSappingBats. Bat sap
    // breaks on takeDamage() and on the dodge roll (Player.js roll code
    // calls breakSapping() on every entry in that array); Tomb Ghost sap has
    // no such interrupt and no duration — DungeonSystem clears it only on
    // leaving the room (_activateFloor) or the dungeon (_exitDungeon). See
    // DungeonGhostSystem.
    this.tombSapped = false;
    this._tombSapTimer = 0;
    this._tombSappingGhost = null; // TombGhost instance passed as `attacker` to sap-damage calls (reflect target)
    this.hookedByMimic = null; // Enemy instance when mimic tongue has grabbed player
    this.hookedByWhip = null; // {targetX, targetY} when a whip strike (hook post, Stump, or Tree) has grabbed player — see PhysicsSystem.updateEntity
    this.facing = { x: 0, y: 1 }; // Direction player is facing

    // Invulnerability frames
    this.godMode = false; // Set via cheat menu — prevents all damage
    this.invulnerabilityTimer = 0;
    this.invulnerabilityDuration = INVULNERABILITY_DURATION;
    this.attackBlockTimer = 0; // Blocks attacks during extended iframe period (cyan rogue)
    this.spawnFadeTimer = SPAWN_FADE_DURATION;
    this.spawnFadeDuration = SPAWN_FADE_DURATION;
    this.spawnFadeHeld = false;
    // Set by ScreenFadeSystem for the TITLE -> REST fade-in only; cleared in
    // update() once spawnFadeTimer reaches 0 (getVisibilityAlpha() === 1).
    this.titleSpawnMovementLocked = false;
    this.exitFadeTimer = 0;

    // Physics flags
    this.mass = 1; // Affects knockback received. Armor/character type may modify this.
    this.compactsSnow = true; // Wading deep snow leaves a compacted trail (PhysicsSystem), at any mass
    this.hasCollision = true;
    this.boundToGrid = true;
    this.collisionMap = null; // Set by game state
    this.plane = 0; // 0=normal plane, 1=tunnel plane
    this.aquiferCurrent = null; // {x,y} px/s carrier push, set per frame by AquiferSystem
    // Interior membership (ADR-0001); accessors on prototype (InteriorManager.js).
    this._activeInteriorKind = null; // null | 'hut' | 'dungeon' | 'maze' | 'aquifer'
    this.hutExitPosition = null; // saved exterior position when entering a hut
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
    this._frogTongueCooldown = 0; // real seconds until the frog tongue can fire again

    // Boss grab state
    this.grabbed   = false; // true while a GooHead has the player in its grip
    this.grabbedBy = null;  // reference to the GooHead holding the player

    // Gray-zone bone slope lock (brief movement lock from bone slope push)
    this.boneSlopeLock = 0;

    // Interior state (inDungeon derived from _activeInteriorKind; see ADR-0001)
    this.dungeonExitPosition = null; // saved exterior position when entering a dungeon

    this.wetDropTimer = 0; // throttles wet trail particle emission
    this.gooDropTimer = 0; // throttles goo (slimed) trail particle emission

    // Sprint footstep trail
    this.footstepTimer = 0; // throttles footstep dot emission
    this.footstepSide = 0;  // alternates 0/1 for left/right foot

    // Lava contact (PhysicsSystem.applyLiquidResults sets this every frame).
    // Lava deals its own damage tick rather than the burn DoT, but
    // reads as "burning" for the status pip — see StatusEffectVisuals.js.
    this.inDamagingLiquid = false;

    // Deep water (PhysicsSystem sets inDeepWater every frame; applyLiquidResults
    // fills/drains wetPips — the wet Pip track — and ticks drownDamageTimer at 3).
    // deepWaterImmune is armor-derived (Flippers), projected by
    // EquipmentEffectsSystem same as sharkMask/coralCrown/stingrayMantle;
    // frog form's existing `polymorphed` flag grants the same immunity.
    this.inDeepWater = false;
    this.wetPips = 0;
    this.drownDamageTimer = 0;
    this.deepWaterImmune = false;

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

    // Float (from Floating Boots) — ignores lava, water, and mud.
    // floatCharge: seconds of float left in the equipped boots, projected each
    // frame by FloatingBootsSystem (0 = none equipped). overLiquid: raw liquid
    // contact under the player, written by PhysicsSystem before float clears
    // inLiquid. Float is active only while both hold.
    this.floatCharge = 0;
    this.overLiquid = false;

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
    // Emerald Staff grass: recomputed every frame by MagicSystem._updateStaffGrassEffects.
    // inStaffGrass doubles LootSystem's luck multiplier while true;
    // staffGrassHealTimer is a persistent tick-timer (mirrors PhysicsSystem's
    // hot-spring hotWaterHealTimer) for the slow passive heal, deliberately
    // not driven through applyRegen — see that method's per-frame-call warning.
    this.inStaffGrass = false;
    this.staffGrassHealTimer = 0;
    // Well coin blessings — permanent run-flags granted by tossing a raw coin
    // (`c`) into a well. Booleans, so they cannot stack.
    this.wellDamageBlessed = false; // red zone well: +1 damage on all attacks
    this.stealthBlessed = false;    // cyan zone well: enemies detect at reduced radius
    // Fairy fountain treasure blessings — permanent run-flags granted by offering
    // a non-elemental treasure to the pool. Also booleans, also non-stacking.
    this.fountainSprintBlessed = false; // Diamond: unarmed sprint speed even while armed
    this.fountainArmorBonus = 0;        // Onyx: +1 defense, folded in on every equip recompute
    // Boots: unarmed sprint speed even while armed, for as long as they're
    // equipped. Recomputed by EquipmentEffectsSystem on every equip change.
    this.bootsSprint = false;
    this.blockBoostTimer = 0;
    this.blockBoostAmount = 0;
    this.stoneSkinTimer = 0;
    this.damageBonusTimer = 0;
    this.damageBonusAmount = 0;
    this.regenTimer = 0;
    this.regenAmount = 1;
    this.regenInterval = 1.0;
    this.regenTickTimer = 0;

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
      // Does this roll grant invulnerability at all? False for a roll that is
      // movement rather than evasion (Green Ranger's sprint), which gets no
      // i-frames even while the roll is running.
      iframes: true,
      // Seconds of invulnerability that persist AFTER the roll finishes. Per
      // character (characters.js `rollIframes`) — every character's roll is
      // meant to feel different. Keep it well under that character's roll
      // cooldown: if the tail outlasts the cooldown, mashing dodge becomes
      // uninterrupted invulnerability and nothing can punish it.
      postRollIframes: 0.1,
      hideDuration: 0, // Cyan rogue: how long `hidden` flag persists after roll start (0 = roll-only)
      hideTimer: 0,    // Active countdown of the hide window
      invisRecoveryDuration: 10, // Cyan rogue: cooldown before invisibility can trigger again
      invisRecoveryTimer: 0,     // Countdown; while >0 the roll still works but grants no invisibility

      // Slope interaction — see updateDodgeRoll for full mechanic description
      slopeFreeTime: 5 / 60, // seconds of unimpeded roll on a slope (~20 frames at 60fps)
      slopeTimer:    0,        // countdown for the remaining slope-roll window
      slopeActive:   false,    // true once a slope tile was detected during this roll
      slopeLocked:   false,    // true during mercy phase: roll velocity zeroed, slope takes over
      daggerAutoFire: false
    };

    // Post-dodge crit window — set when dodge ends if equipped weapon has critAfterDodge.
    // CombatSystem._applyCritIfLucky forces a guaranteed crit while >0.
    this.postDodgeCritTimer = 0;

    // Moss Cloak 𐤒: armed by dodge-end transition, active while no WASD input.
    // Drives bush-render override and the enemy detection skip in Enemy.update().
    this.mossCloakArmed = false;
    this.mossCloakActive = false;
    this._lastDodgeActive = false;

    // Set by PhysicsSystem each frame; read by updateDodgeRoll (1-frame lag is imperceptible)
    this.isOnSlope = false;
    this.isOnIce   = false;

    // Status Effects (burn, poison, wet, freeze, goo, …). Declared once, in
    // StatusEffects.js's table shared with enemies — reset() builds them from
    // the same factory, which is what keeps the two from drifting.
    this.statusEffects = createPlayerStatusSlots();

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

    // What landed the last hit on this player, for the tombstone: an attacker
    // entity or an environmental death cause. Written by PlayerDamageSystem.
    this._lastDamageCause = null;
  }

  // Backward compatibility: heldItem getter returns active slot
  get heldItem() {
    return this.quickSlots[this.activeSlotIndex];
  }

  setCollisionMap(collisionMap) {
    this.collisionMap = collisionMap;
  }

  // Unarmed sprint multiplier, applied to both acceleration and max speed.
  // Empty hands normally mean 1.5x; a Diamond offered to a fairy fountain
  // (fountainSprintBlessed) or equipped Boots (bootsSprint) keep that speed
  // even with a weapon out. Every speed and roll calculation routes through
  // here so the blessing can't miss a site.
  getSprintMultiplier() {
    return this.isSprinting() ? 1.5 : 1;
  }

  // True whenever the player moves at sprint speed — also drives the sprint
  // footstep trail (WorldEffectsSystem), so every sprint source shows it.
  isSprinting() {
    return !this.heldItem || this.fountainSprintBlessed || this.bootsSprint;
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
      // Coast to a stop between land hops. Not while swimming — the swim gait
      // (PolymorphSystem) carries a glide between strokes, and this per-frame
      // decay would crush it to a crawl (bug #334).
      if (!this._frogJumpActive && !(this.inLiquid || this.inAquifer)) {
        this.velocity.vx *= 0.75;
        this.velocity.vy *= 0.75;
        if (Math.abs(this.velocity.vx) < 2) this.velocity.vx = 0;
        if (Math.abs(this.velocity.vy) < 2) this.velocity.vy = 0;
      }
      return;
    }

    // Check if charging a bow (for movement slowdown). Bat/flail charges are
    // exempt from the full stop — reduced speed instead (see mult below).
    const isChargingBow = this.heldItem && this.heldItem.isCharging
      && !this.heldItem.data?.batCharge && !this.heldItem.data?.flailSpin;

    // Calculate target acceleration based on input (1.5x acceleration when sprinting)
    // Polymorph speed/accel overrides (set by PolymorphSystem when in frog form)
    const accelBase = this._polymorphAccelOverride
      ?? (PHYSICS.PLAYER_ACCELERATION * this.getSprintMultiplier());
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

    // Grabbed by boss head, or mid-flight on a whip pull (hook post/Stump/Tree —
    // PhysicsSystem.updateEntity owns position for the duration): lock movement
    // but allow facing/attack input
    if (this.grabbed || this.hookedByWhip) {
      this.acceleration.ax = 0;
      this.acceleration.ay = 0;
      this.velocity.vx *= 0.75;
      this.velocity.vy *= 0.75;
      if (Math.abs(this.velocity.vx) < 4) this.velocity.vx = 0;
      if (Math.abs(this.velocity.vy) < 4) this.velocity.vy = 0;
    // Locked (Frozen/zapped/stunned): stop movement entirely. Bat sap is a
    // slow, not a lock — see SAP_BAT_SPEED in getStatusSpeedMultiplier().
    } else if (this.isLocked()) {
      this.acceleration.ax = 0;
      this.acceleration.ay = 0;
      this.velocity.vx *= 0.75;
      this.velocity.vy *= 0.75;
      if (Math.abs(this.velocity.vx) < 4) this.velocity.vx = 0;
      if (Math.abs(this.velocity.vy) < 4) this.velocity.vy = 0;
    // Gray-zone bone slope: brief movement lock after push
    } else if (this.boneSlopeLock > 0) {
      this.acceleration.ax = 0;
      this.acceleration.ay = 0;
      this.velocity.vx *= 0.6;
      this.velocity.vy *= 0.6;
      if (Math.abs(this.velocity.vx) < 3) this.velocity.vx = 0;
      if (Math.abs(this.velocity.vy) < 3) this.velocity.vy = 0;
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

    // Cap velocity to max speed (1.5x speed when sprinting, boosted when speed buff active, armor modifiers, status effects)
    const baseMaxSpeed = this._polymorphSpeedOverride
      ?? (PHYSICS.PLAYER_SPEED * this.getSprintMultiplier());
    const armorModified = baseMaxSpeed * (1 + this.speedBoost - this.speedPenalty);
    const batMax = this.batFormTimer > 0 ? armorModified * 1.8 : armorModified;
    const boostedMax = this.speedBoostTimer > 0 ? Math.max(batMax, armorModified * this.speedBoostMultiplier) : batMax;
    const firingMult = this.firingSlowTimer > 0 ? 0.35 : 1; // Dramatic ~65% slow while firing a gun
    // Bat: half speed while charging. Flail: 1/8 speed while spinning up.
    const chargeMult = !this.heldItem?.isCharging ? 1
      : this.heldItem.data?.batCharge ? 0.5
      : this.heldItem.data?.flailSpin ? 0.05 : 1;
    const finalMax = boostedMax * this.getStatusSpeedMultiplier() * firingMult * chargeMult;
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

  isWet() { return this.statusEffects.wet.active; }
  isBurning() { return this.statusEffects.burn.active; }
  isPoisoned() { return this.statusEffects.poison.active; }

  applySpeedBoost(duration) { this.speedBoostTimer = Math.max(this.speedBoostTimer, duration); }
  applyStoneSkin(duration) {
    this.stoneSkinTimer = Math.max(this.stoneSkinTimer, duration);
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

  applyStatusEffect(effect, duration = 3.0, pips = null) {
    StatusEffectSystem.applyPlayerStatusEffect(this, effect, duration, pips);
  }

  // Ticks the whole table; returns burn/poison DoT ticks for applyPlayerDot.
  updateStatusEffects(deltaTime) {
    return StatusEffectSystem.tickPlayer(this, deltaTime);
  }

  isGooey() {
    return this.statusEffects.goo.active;
  }

  isFrozen() { return StatusEffectSystem.isPlayerFrozen(this); }

  isZapped() { return StatusEffectSystem.isPlayerZapped(this); }

  // Frozen, zap pip 3 or stun — no moving, attacking or rolling.
  isLocked() { return StatusEffectSystem.isPlayerLocked(this); }

  isDizzy() { return this.statusEffects.dizzy.active; }

  isBlind() { return this.statusEffects.blind.active; }

  // Stack-count pip rows for StatusPipEffects.js (see computePlayerPipRows —
  // the enemy version of this indicator, extended to the player because the
  // glyph blink alone doesn't surface burn/poison/wet/freeze the way it does
  // for gooey/dizzy).
  getStatusPipRows() { return computePlayerPipRows(this); }

  getStatusSpeedMultiplier() { return StatusEffectSystem.playerSpeedMultiplier(this); }

  // Blink/tint priority chain lives in StatusEffectVisuals.computePlayerDisplayColor
  // (moved out to keep Player.js under its architecture budget — that file
  // already tracked the two in lockstep by comment cross-reference).
  getDisplayColor() {
    return computePlayerDisplayColor(this);
  }

  update(deltaTime) {
    this.dodgeRoll.justEnded = false;
    // Update status effects
    const dotTicks = this.updateStatusEffects(deltaTime);

    // Update status blink timer
    this.statusBlinkTimer += deltaTime;
    // Update dodge roll state
    this.updateDodgeRoll(deltaTime);

    if (!this.spawnFadeHeld) this.spawnFadeTimer = Math.max(0, this.spawnFadeTimer - deltaTime);
    if (this.titleSpawnMovementLocked && this.spawnFadeTimer <= 0) this.titleSpawnMovementLocked = false;
    this.exitFadeTimer = Math.max(0, this.exitFadeTimer - deltaTime);

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
    if (this.stoneSkinTimer > 0) {
      this.stoneSkinTimer -= deltaTime;
      if (this.stoneSkinTimer <= 0) this.stoneSkinTimer = 0;
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

    // Burn/poison DoT ticks from the status tick at the top of update() —
    // damage applied back in main.js via takeDamage, once immunity/i-frames
    // have their say.
    return dotTicks;
  }

  // Activation (cooldown/goo/lock gates, roll speed, per-type i-frames) and
  // per-frame roll movement live in PlayerDodgeRollSystem — extracted for the
  // same reason as PlayerDamageSystem.
  startDodgeRoll(direction, enemies = []) {
    return PlayerDodgeRollSystem.start(this, direction, enemies);
  }

  updateDodgeRoll(deltaTime) {
    PlayerDodgeRollSystem.update(this, deltaTime);
  }

  // Resolution logic (i-frames, dodge, resists, defense, reflect) lives in
  // PlayerDamageSystem.applyDamage — see that file for why it was extracted.
  takeDamage(amount, damageSource = {}) {
    return PlayerDamageSystem.applyDamage(this, amount, damageSource);
  }

  isInvulnerable() {
    return this.invulnerabilityTimer > 0;
  }

  canAttack() {
    if (this.attackBlockTimer > 0 || this.isLocked()) return false;
    if (this.dodgeRoll.justEnded) return false;
    if (this.characterType === 'green' && this.actionCooldown > 0) return false;
    if (this.characterType === 'green' && this.continuousRollActive) return false;
    return true;
  }

  // Returns current roll speed (matching startDodgeRoll calculation)
  getRollSpeed() {
    const baseMaxSpeed = PHYSICS.PLAYER_SPEED * this.getSprintMultiplier();
    const armorModified = baseMaxSpeed * (1 + this.speedBoost - this.speedPenalty);
    const currentMaxSpeed = this.speedBoostTimer > 0 ? armorModified * this.speedBoostMultiplier : armorModified;
    return currentMaxSpeed * 1.1;
  }

  getVisibilityAlpha() {
    const base = this.invulnerabilityTimer > 0 ? 0.4 : 1;
    const p = Math.floor((this.exitFadeTimer > 0 ? this.exitFadeTimer / EXIT_FADE_DURATION : 1 - this.spawnFadeTimer / this.spawnFadeDuration) * 5) / 5;
    return base * p;
  }

  shouldRenderVisible() {
    // Always render (for backward compatibility), but use getVisibilityAlpha() for alpha
    return true;
  }

  heal(amount) {
    this.hp += amount;
    if (this.hp > this.maxHp) this.hp = this.maxHp;
  }

  pickupItem(item, selectedSlotIdx = 0) {
    // Apply trap capacity affinity (e.g. Gray Assassin: +1 trap charge on pickup)
    if (item?.data?.type === 'TRAP' && item.charges != null) {
      const affinity = this.weaponAffinities?.['trap'];
      if (affinity?.additionalCharge) item.charges += affinity.additionalCharge;
    }

    // Prefer selected slot if empty, else first empty
    const empty = (i) => this.quickSlots[i] === null && !this.destroyedSlots[i];
    const targetSlot = (empty(selectedSlotIdx) ? selectedSlotIdx : this.quickSlots.findIndex((_, i) => empty(i)));

    if (targetSlot !== -1) {
      this.quickSlots[targetSlot] = item;
      return null;
    } else {
      let swapIdx = this.activeSlotIndex;
      if (this.destroyedSlots[swapIdx]) {
        swapIdx = this.quickSlots.findIndex((_, i) => !this.destroyedSlots[i]);
        if (swapIdx === -1) return item;
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

  // Destroys `item` if it still occupies a quick slot — unlike dropItem(),
  // nothing is handed back or spawned in the world. Looks the item up by
  // identity rather than assuming activeSlotIndex, since a weapon can shatter
  // from a delayed hit (e.g. Bat's release sweep) after the player has already
  // switched away from it.
  destroyHeldItem(item) {
    const idx = this.quickSlots.indexOf(item);
    if (idx === -1) return false;
    this.quickSlots[idx] = null;
    if (idx === this.activeSlotIndex) {
      const nextFilled = this.quickSlots.findIndex((slot, i) => i !== idx && slot !== null);
      if (nextFilled !== -1) this.activeSlotIndex = nextFilled;
    }
    return true;
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
  reset() {
    this.hp = PLAYER_STATS.START_HP;
    this.maxHp = PLAYER_STATS.MAX_HP;
    this.passiveMaxHpBonus = 0;
    this.hurtPending = false;
    this.velocity = { vx: 0, vy: 0 };
    this.acceleration = { ax: 0, ay: 0 };
    this.quickSlots = [null, null, null];
    this.activeSlotIndex = 0;
    this.destroyedSlots = [false, false, false];
    this.selectedConsumableIndex = -1;
    // Ingredients are not reset here — the pile belongs to InventorySystem, and
    // a character swap deliberately keeps it (game over clears it instead).
    this.magicMeter = { active: false, slots: [], current: 0, max: 10, freeSlotGranted: false };

    // Reset new buff timers
    this.stoneSkinTimer = 0;
    this.damageBonusTimer = 0; this.damageBonusAmount = 0;
    this.regenTimer = 0; this.regenAmount = 1; this.regenInterval = 1.0; this.regenTickTimer = 0;

    // Reset luck (Lucky Coin passive + well-vested blessing)
    this.luckActive = false;
    this.luckBlessed = false;
    this.critChance = 0;
    this.luckDodgeBonus = 0;

    // Reset Emerald Staff grass state
    this.inStaffGrass = false;
    this.staffGrassHealTimer = 0;

    // Reset well coin blessings
    this.wellDamageBlessed = false;
    this.stealthBlessed = false;

    // Reset fairy fountain treasure blessings
    this.fountainSprintBlessed = false;
    this.fountainArmorBonus = 0;
    this.bootsSprint = false;

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
    this.parryMechanic = null;
    initParry(this);
    this.smokeOnHit = false;
    this.speedBoost = 0;
    this.speedPenalty = 0;
    this.slowEnemies = false;
    this.burnResist = 0;
    this.massBonus = 0;
    this.mass = 1;
    this.rollCooldownMult = 1.15;
    this.extraIframes = 0;
    this.fishingLocked = false;
    this.rusalkaInputScale = 1.0;

    // Reset status effects (burn/poison/wet included) — the same factory the
    // constructor uses, so a slot can never go missing from one and not the
    // other (#256: this rebuild had no `dizzy`, and isDizzy() reads
    // `.dizzy.active` unguarded).
    this.statusEffects = createPlayerStatusSlots();
    this.wetDropTimer = 0;
    this.gooDropTimer = 0;

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
    this.floatCharge = 0;
    this.overLiquid = false;
    this.steamTrailTimer = 0;
    this.footstepTimer = 0;
    this.footstepSide = 0;

    // Reset invulnerability/attack block timers
    this.invulnerabilityTimer = 0;
    this.attackBlockTimer = 0;

    // Reset staff blocking state
    this.isStaffBlocking = false;
    this.staffSwingHasFired = false;

    // Reset boss grab state
    this.grabbed = false;
    this.grabbedBy = null;

    // Reset bone slope lock (gray-zone Ascent)
    this.boneSlopeLock = 0;

    // Reset sapping bats
    this.activeSappingBats = [];
    this.hookedByMimic = null;
    this.hookedByWhip = null;

    // Reset character-specific state
    this.actionCooldown = 0;
    this.actionCooldownMax = 0;
    this.rollCharge = 0;
    this.continuousRollActive = false;
    this.pendingBlink = null;
    this.greenIdleDamageBonus = 0;
    this.greenCombatDamagePenalty = 0;
    this.backstabMultiplier = 1.0;
    this._lastDamageCause = null;

    // Reset dodge roll state
    this.dodgeRoll.active = false;
    this.dodgeRoll.cooldownTimer = 0;
    this.dodgeRoll.slopeTimer = 0;
    this.dodgeRoll.slopeActive = false;
    this.dodgeRoll.slopeLocked = false;

    // Reset hide-roll hidden flag
    this.hidden = false;
    this.dodgeRoll.hideTimer = 0;
    this.dodgeRoll.invisRecoveryTimer = 0;

    // Reset inLiquid (set per-frame by main.js)
    this.inLiquid = false;

    // Reset deep-water drowning state
    this.inDeepWater = false;
    this.wetPips = 0;
    this.drownDamageTimer = 0;
    this.deepWaterImmune = false;

    // Reset plane and interior state
    this.plane = 0;
    this.aquiferCurrent = null;
    this._activeInteriorKind = null;
    this.hutExitPosition = null;
    this.mazeExitPosition = null;
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
    this._frogTongueCooldown = 0;

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
