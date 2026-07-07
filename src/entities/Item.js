import { GRID, COLORS } from '../game/GameConfig.js';
import { ITEMS, WEAPON_TYPES, resolveWeaponDefaults } from '../data/items.js';

/**
 * Carrier interface (duck-typed)
 *
 * The melee/bow/gun attack-creation methods below (createMeleeAttack, createMeleeArc,
 * createMeleeSweep, createMeleeThrust, createMeleeMultistab, createMeleeSlam,
 * createMeleeHammerRing, createMeleeShockwave, createMeleeWhipcrack, createBullets,
 * createBurstPattern, createRingPattern, createSpiralPattern, createWavePattern,
 * createArrow, createSingleArrow) accept any object shaped like:
 *
 *   { position: {x,y}, facing: {x,y}, width, height, plane,
 *     weaponAffinities? (optional), equippedConsumables? (optional) }
 *
 * Player entities fit this naturally. CampNPC also fits it so the companion can
 * borrow the full sword/bow/gun pipeline. Wand methods are NOT part of this
 * interface — wands remain player-only.
 *
 * The parameter name `player` in these methods is historical; treat it as a
 * generic carrier.
 */

let _nextAttackId = 0;

// Aggregate oilEffect from any equipped consumables. Returns
// { onHit: string|null, arrowSpeedMult: number }. First oil with onHit wins;
// arrowSpeedMult multiplies across all oils (typically just one).
function _readEquippedOilEffect(player) {
  const slots = player?.equippedConsumables;
  if (!slots) return { onHit: null, arrowSpeedMult: 1 };
  let onHit = null;
  let arrowSpeedMult = 1;
  for (const c of slots) {
    const oe = c?.data?.oilEffect;
    if (!oe) continue;
    if (oe.onHit && !onHit) onHit = oe.onHit;
    if (oe.arrowSpeedMult) arrowSpeedMult *= oe.arrowSpeedMult;
  }
  return { onHit, arrowSpeedMult };
}

export class Item {
  constructor(char, x, y) {
    this.char = char;
    this.data = resolveWeaponDefaults(ITEMS[char] || {
      char,
      name: 'Unknown',
      type: 'WEAPON',
      color: COLORS.ITEM
    });

    // Pixel-based position
    this.position = { x, y };
    this.velocity = { vx: 0, vy: 0 };
    this.acceleration = { ax: 0, ay: 0 };

    // Rendering
    this.color = this.data.color;
    this.width = GRID.CELL_SIZE;
    this.height = GRID.CELL_SIZE;

    // Physics flags
    this.hasCollision = false;
    this.boundToGrid = true;
    this.friction = true;

    // Weapon state
    this.cooldownTimer = 0;
    this.windupTimer = 0;
    this.windupActive = false;
    this.pendingPlayer = null; // Store player during windup
    this.attackLockTimer = 0; // Locks movement during attack flash for locksMovement weapons

    // Bow use limit system (resets per room)
    this.maxUses = this.data.maxUses || null; // null = unlimited (for non-bows)
    this.usesRemaining = this.maxUses;

    // Trap charge system — traps only; tracks uses remaining across rooms
    this.charges = this.data.type === 'TRAP' ? (this.data.charges ?? 3) : null;

    // Wand use limit system (resets per room)
    this.maxUsesPerRoom = this.data.maxUsesPerRoom || null; // null = unlimited
    this.wandUsesRemaining = this.maxUsesPerRoom;

    // Bow charging system (hold to charge)
    this.isCharging = false;
    this.chargeTime = 0;
    this.maxChargeTime = 1.5; // 1.5 seconds to reach max charge (2x speed)
    this.chargingPlayer = null;
    this.lastChargeRatio = 0; // Store charge level when fired (for cooldown indicator)

    // Charge-hammer system (Crystal Maul): once-per-room mega-attack via hold-to-charge.
    // Reset to false on room entry.
    this.chargeAttackUsed = false;
  }

  getHitbox() {
    return {
      x: this.position.x,
      y: this.position.y,
      width: this.width,
      height: this.height
    };
  }

  getDisplayName() {
    let name = this.data.name;
    if (this.potionModifier === 'buff') {
      name += ' +';
    } else if (this.potionModifier === 'unstable') {
      name += ' ?';
    }
    return name;
  }

  update(deltaTime) {
    // Update cooldown (recovery after attack, OR reload after mag empties)
    if (this.cooldownTimer > 0) {
      this.cooldownTimer -= deltaTime;

      // Mid-reload: queue per-bullet SFX ticks for mechanical magazines.
      // Energy reload type is handled at the audio layer (single stoppable SFX) — no ticks here.
      if (
        this._reloading &&
        this.data.reloadTime &&
        this.data.reloadType === 'magazine'
      ) {
        const interval = this.data.reloadTime / this.maxUses;
        const elapsed = Math.max(0, this.data.reloadTime - this.cooldownTimer);
        const expected = Math.min(this.maxUses, Math.ceil(elapsed / interval));
        const delta = expected - (this._reloadTicksPlayed || 0);
        if (delta > 0) {
          this._reloadTicksPending = (this._reloadTicksPending || 0) + delta;
          this._reloadTicksPlayed = expected;
        }
      }

      // Phase transition when timer hits zero
      if (this.cooldownTimer <= 0) {
        if (this._reloading) {
          // Reload complete — refill mag
          this.usesRemaining = this.maxUses;
          this._reloading = false;
        } else if (
          this.maxUses !== null &&
          this.usesRemaining <= 0 &&
          this.data.reloadTime &&
          this.data.weaponType === 'GUN'
        ) {
          // Normal post-fire cooldown ended on an empty mag — kick off reload phase
          this._reloading = true;
          this.cooldownTimer = this.data.reloadTime;
          this._reloadTicksPlayed = 0;
          this._reloadTicksPending = 0;
        }
      }
    }

    // Update gem-wand charging (hold to cast). Auto-completion handled by MagicSystem.
    if (this.isCharging && this.data.gemWand) {
      this.chargeTime += deltaTime;
      // Cap at the wand's required charge time (prevents runaway accumulation)
      if (this.chargeTime > this.data.chargeTime) {
        this.chargeTime = this.data.chargeTime;
      }
    }

    // Charge hammer (Crystal Maul): hold-to-charge mega-attack, auto-fires via main.js.
    if (this.isCharging && this.data.chargeHammer) {
      this.chargeTime += deltaTime;
      if (this.chargeTime > this.data.chargeTime) this.chargeTime = this.data.chargeTime;
    }

    // Bat windup: accumulate toward the full 270° charge, capped (BatSystem
    // reads chargeTime/data.chargeTime as the windup ratio).
    if (this.isCharging && this.data.batCharge) {
      this.chargeTime += deltaTime;
      if (this.chargeTime > this.data.chargeTime) this.chargeTime = this.data.chargeTime;
    }

    // Update bow charging (hold to charge) — also applies to guns flagged requiresCharge
    if (this.isCharging && (this.data.weaponType === 'BOW' || this.data.requiresCharge)) {
      this.chargeTime += deltaTime;
      if (this.chargeTime > this.maxChargeTime) {
        this.chargeTime = this.maxChargeTime; // Cap at max charge
      }
    }

    // Tick attack-phase movement lock (locksMovement weapons only)
    if (this.attackLockTimer > 0) {
      this.attackLockTimer -= deltaTime;
    }

    // Update windup (charge-up before attack)
    if (this.windupTimer > 0) {
      this.windupTimer -= deltaTime;

      // Windup complete - execute attack
      if (this.windupTimer <= 0 && this.windupActive && this.pendingPlayer) {
        this.windupActive = false;
        const attack = this.executeAttack(this.pendingPlayer);
        this.pendingPlayer = null;

        // Start recovery cooldown
        this.cooldownTimer = this.data.recovery || this.data.cooldown || 0.5;

        // Lock movement through the attack flash for weapons that opt in
        if (this.data.locksMovement && attack) {
          const hits = Array.isArray(attack) ? attack : [attack];
          this.attackLockTimer = hits.reduce(
            (max, a) => Math.max(max, (a.delay || 0) + (a.duration || 0.15)),
            0
          );
        }

        return attack;
      }
    }

    return null;
  }

  canUse() {
    const cooldownReady = this.cooldownTimer <= 0 && !this.windupActive;

    // Bows + guns with a magazine: blocked when out of ammo
    if (
      this.maxUses !== null &&
      (this.data.weaponType === 'BOW' || this.data.weaponType === 'GUN')
    ) {
      return cooldownReady && this.usesRemaining > 0;
    }

    return cooldownReady;
  }

  use(player) {
    if (!this.canUse()) return null;

    // Utility items (like vault key) have no attack behavior
    if (this.data.weaponType === 'UTILITY') {
      // Bread: signal main.js to drop a loaf at the player's feet and consume
      // the slot. No attack, no cooldown — the drop IS the use.
      if (this.data.effect === 'dropBread') {
        return { consumed: true, dropBread: true };
      }
      return null;
    }

    // Charge hammer: hold-to-charge mega-attack (once per room), identical lifecycle to gem wands.
    // Release before full charge cancels — no attack. Auto-fires shockwave when complete.
    // If the mega-attack has already been used this room, fall through to the normal melee path.
    if (this.data.chargeHammer && !this.chargeAttackUsed) {
      if (!this.isCharging) {
        this.isCharging = true;
        this.chargeTime = 0;
        this.chargingPlayer = player;
      }
      return null;
    }

    // Flail: hold-to-spin. FlailSystem drives the ramping orbit and applies
    // damage directly while held — no release attack (handleSpaceRelease just
    // stops the spin).
    if (this.data.flailSpin) {
      if (!this.isCharging) {
        this.isCharging = true;
        this.chargeTime = 0;
        this.chargingPlayer = player;
      }
      return null;
    }

    // Bat: hold-to-windup charge. BatSystem drives the rotating windup visual
    // and fires the release sweep on SPACE release (handleSpaceRelease).
    if (this.data.batCharge) {
      if (!this.isCharging) {
        this.isCharging = true;
        this.chargeTime = 0;
        this.chargingPlayer = player;
      }
      return null; // No attack while winding up — release fires the sweep
    }

    // Gem wands: hold-to-charge, auto-cast when chargeTime is reached (driven by MagicSystem).
    if (this.data.gemWand) {
      if (!this.isCharging) {
        this.isCharging = true;
        this.chargeTime = 0;
        this.chargingPlayer = player;
      }
      return null; // No attack while charging — MagicSystem fires it
    }

    // Bows (and chargeable guns) use the hold-to-charge system
    if (this.data.weaponType === 'BOW' || this.data.requiresCharge) {
      if (!this.isCharging) {
        this.isCharging = true;
        this.chargeTime = 0;
        this.chargingPlayer = player;
      }
      return null; // No attack while charging
    }

    // Check if weapon has windup (melee weapons typically do)
    let windup = this.data.windup || 0;

    // Apply melee windup reduction affinity (e.g. Red Warrior: 20% faster melee windup)
    const affinities = player && player.weaponAffinities;
    if (windup > 0 && affinities && affinities['melee'] && affinities['melee'].windupReduction) {
      windup *= (1 - affinities['melee'].windupReduction);
    }

    if (windup > 0) {
      // Start windup, attack will execute after windup completes
      this.windupTimer = windup;
      this.windupActive = true;
      this.pendingPlayer = player;
      return null; // No immediate attack
    } else {
      // No windup - execute immediately
      const attack = this.executeAttack(player);

      // Set cooldown immediately for all weapons (including wands).
      // Proximity-based wands will reset cooldown in main.js if proximity check fails.
      // For guns whose mag just emptied, the reload phase begins automatically
      // when this normal cooldown reaches zero (see update()).
      let cooldown = this.data.recovery || this.data.cooldown || 0.5;
      // Apply gun fire rate bonus affinity (e.g. Yellow Mage: 20% faster gun fire rate)
      if (this.data.weaponType === 'GUN' && affinities && affinities['gun'] && affinities['gun'].fireRateBonus) {
        cooldown *= (1 - affinities['gun'].fireRateBonus);
      }
      this.cooldownTimer = cooldown;

      // Firing a gun dramatically slows the player; refreshed each shot so rapid fire stays slow.
      if (this.data.weaponType === 'GUN') {
        player.firingSlowTimer = Math.max(player.firingSlowTimer || 0, cooldown);
      }

      return attack;
    }
  }

  // Release charged weapon (called when player releases space)
  // Handles both bows and chargeable guns (requiresCharge flag).
  releaseBow() {
    if (!this.isCharging) return null;
    const isBow = this.data.weaponType === 'BOW';
    const isChargeGun = this.data.requiresCharge && this.data.weaponType === 'GUN';
    if (!isBow && !isChargeGun) return null;

    const player = this.chargingPlayer;
    if (!player) {
      this.isCharging = false;
      return null;
    }

    // Calculate charge multiplier (0 to 1, where 1 = max charge = 2x speed)
    const chargeRatio = Math.min(this.chargeTime / this.maxChargeTime, 1.0);

    // Fire arrow with charge multiplier
    const attack = this.executeAttack(player, chargeRatio);

    // Store charge ratio for cooldown indicator
    this.lastChargeRatio = chargeRatio;

    // Reset charge state
    this.isCharging = false;
    this.chargeTime = 0;
    this.chargingPlayer = null;

    // Start cooldown (apply weapon affinity modifiers if player has them)
    let cooldown = this.data.cooldown || 0.5;
    const affinities = player && player.weaponAffinities;
    if (affinities && affinities['bow']) {
      if (affinities['bow'].cooldownReduction) cooldown *= (1 - affinities['bow'].cooldownReduction);
      if (affinities['bow'].cooldownPenalty)   cooldown *= (1 + affinities['bow'].cooldownPenalty);
    }
    // For chargeable guns whose mag just emptied, the reload phase begins
    // automatically when this normal cooldown reaches zero (see update()).
    this.cooldownTimer = cooldown;

    // Charge guns apply the same firing slow as instant guns.
    if (isChargeGun && player) {
      player.firingSlowTimer = Math.max(player.firingSlowTimer || 0, cooldown);
    }

    return attack;
  }

  // Called when space is released before the Crystal Maul charge completes.
  // Tap (<10% charge): treat as a regular melee attack so the weapon is usable
  //   before the mega-attack is committed. Kicks off the standard windup path.
  // Mid-charge release (>=10%): cancel with no attack (same as wand cancel).
  releaseChargeHammer() {
    if (!this.isCharging || !this.data.chargeHammer) return;
    const player = this.chargingPlayer;
    const chargeRatio = this.data.chargeTime > 0
      ? this.chargeTime / this.data.chargeTime
      : 0;
    this.isCharging = false;
    this.chargeTime = 0;
    this.chargingPlayer = null;
    if (chargeRatio < 0.10 && player && !this.windupActive && this.cooldownTimer <= 0) {
      let windup = this.data.windup || 0;
      const affinities = player.weaponAffinities;
      if (windup > 0 && affinities && affinities['melee'] && affinities['melee'].windupReduction) {
        windup *= (1 - affinities['melee'].windupReduction);
      }
      if (windup > 0) {
        this.windupTimer = windup;
        this.windupActive = true;
        this.pendingPlayer = player;
      }
    }
  }

  // Fires the charged mega-attack (shockwave). Called by main.js when chargeTime is complete.
  // Sets chargeAttackUsed so no further mega-attacks this room.
  fireChargeHammerAttack() {
    if (!this.isCharging || !this.data.chargeHammer) return null;
    const player = this.chargingPlayer;
    this.isCharging = false;
    this.chargeTime = 0;
    this.chargingPlayer = null;
    this.chargeAttackUsed = true;
    if (!player) return null;
    // Call the shockwave creator directly — avoids mutating the shared data object.
    // Inject the same subtype props that injectSubtype() would apply in createMeleeAttack,
    // so canSmash, electric, isBlade, isBlunt, isPickaxe, weaponLevel, cyclesExitLetter are preserved.
    const attacks = this.createMeleeShockwave(player);
    const props = {};
    if (this.data.weaponSubtype) props.weaponSubtype = this.data.weaponSubtype;
    if (this.data.electric) props.electric = this.data.electric;
    if (this.data.isBlade) props.isBlade = this.data.isBlade;
    if (this.data.isBlunt) props.isBlunt = this.data.isBlunt;
    if (this.data.canSmash) props.canSmash = this.data.canSmash;
    if (this.data.isPickaxe) props.isPickaxe = this.data.isPickaxe;
    if (this.data.weaponLevel) props.weaponLevel = this.data.weaponLevel;
    if (this.data.cyclesExitLetter) props.cyclesExitLetter = this.data.cyclesExitLetter;
    const result = Array.isArray(attacks)
      ? attacks.map((a, idx) => {
          const merged = { ...a, ...props };
          if (idx > 0) delete merged.cyclesExitLetter;
          return merged;
        })
      : { ...attacks, ...props };
    this.cooldownTimer = this.data.recovery || 0.5;
    return result;
  }

  executeAttack(player, chargeRatio = 0) {
    // Return attack data based on weapon type
    switch (this.data.weaponType) {
      case 'GUN':
        return this.createBullets(player, chargeRatio);
      case 'MELEE':
        return this.createMeleeAttack(player);
      case 'BOW':
        return this.createArrow(player, chargeRatio);
      case 'WAND':
        return this.createWandAttack(player);
      default:
        return null;
    }
  }

  createBullets(player, chargeRatio = 0) {
    const bullets = [];
    const bulletCount = this.data.bulletCount || 1;
    const spread = bulletCount > 1 ? 0.3 : 0;
    const angle = Math.atan2(player.facing.y, player.facing.x);
    // Unique ID for this burst — lets same-burst bullets bypass enemy iframes
    const attackId = `burst_${_nextAttackId++}`;

    // One trigger pull = one ammo, regardless of pellet count or pattern
    if (this.maxUses !== null && this.usesRemaining > 0) {
      this.usesRemaining--;
      // Mag just emptied — clear reload SFX trackers so the next reload plays from tick 0
      if (this.usesRemaining <= 0) {
        this._reloadTicksPlayed = 0;
        this._reloadTicksPending = 0;
      }
    }

    // Charge-scaled chain count: 0% charge = 0 chains, 100% = 3 chains.
    // Only applied when the gun has requiresCharge + chain.
    let scaledChainCount = this.data.chainCount || 3;
    if (this.data.requiresCharge && this.data.chain) {
      scaledChainCount = Math.round(chargeRatio * 3);
    }

    // Special attack patterns
    if (this.data.attackPattern === 'burst') {
      return this.createBurstPattern(player);
    } else if (this.data.attackPattern === 'ring') {
      return this.createRingPattern(player);
    } else if (this.data.attackPattern === 'spiral') {
      return this.createSpiralPattern(player);
    } else if (this.data.attackPattern === 'wave') {
      return this.createWavePattern(player);
    }

    // Standard bullet spread
    for (let i = 0; i < bulletCount; i++) {
      // Add base spread for multi-bullet weapons, plus slight randomness for all bullets
      const baseSpread = (Math.random() - 0.5) * spread;
      const randomness = (Math.random() - 0.5) * (this.data.inaccuracy ?? 0.1);
      const spreadAngle = angle + baseSpread + randomness;

      // Spawn bullets slightly offset from player center (avoids hitting sapping enemies)
      const spawnOffset = 6;
      const spawnX = player.position.x + player.width / 2 + Math.cos(spreadAngle) * spawnOffset;
      const spawnY = player.position.y + player.height / 2 + Math.sin(spreadAngle) * spawnOffset;

      const bullet = {
        type: 'bullet',
        char: this.data.bulletChar || '·',
        drawAngle: spreadAngle,
        weaponChar: this.char,
        position: {
          x: spawnX,
          y: spawnY
        },
        velocity: {
          vx: Math.cos(spreadAngle) * (this.data.bulletSpeed || 300),
          vy: Math.sin(spreadAngle) * (this.data.bulletSpeed || 300)
        },
        damage: this.data.damage,
        color: this.color,
        onHit: this.data.onHit,
        electric: this.data.electric,
        homing: this.data.homing,
        ricochet: this.data.ricochet,
        maxRicochets: this.data.maxRicochets || 3,
        pierce: this.data.pierce,
        split: this.data.split,
        splitCount: this.data.splitCount || 3,
        knockback: this.data.knockback,
        lifesteal: this.data.lifesteal,
        chain: this.data.chain && (!this.data.requiresCharge || scaledChainCount > 0),
        chainCount: scaledChainCount,
        explode: this.data.explode,
        explodeRadius: this.data.explodeRadius || 30,
        accuracy: this.data.accuracy,
        owner: player,
        shooterPlane: player.plane,
        attackId
      };

      // Orbital looping bullet: center advances along firing line, bullet revolves around it.
      // pos(t) = origin + fwd*(ls*t + R - R*cos(ω*t)) + perp*R*sin(ω*t)
      // vel(t) = fwd*(ls + R*ω*sin(ω*t)) + perp*R*ω*cos(ω*t)  →  at t=0: fwd*ls + perp*R*ω
      if (this.data.loopOmega) {
        const fwd = { x: Math.cos(spreadAngle), y: Math.sin(spreadAngle) };
        const perp = { x: -fwd.y, y: fwd.x };
        const R = this.data.loopRadius || 30;
        const ls = this.data.loopLinearSpeed || 130;
        const omega = this.data.loopOmega;
        bullet.velocity.vx = fwd.x * ls + perp.x * R * omega;
        bullet.velocity.vy = fwd.y * ls + perp.y * R * omega;
        bullet.loopOmega = omega;
        bullet.loopRadius = R;
        bullet.loopLinearSpeed = ls;
        bullet.loopForward = fwd;
        bullet.loopPerp = perp;
        bullet.loopTime = 0;
      }

      bullets.push(bullet);
    }

    return bullets;
  }

  createBurstPattern(player) {
    // Fires 3 bullets in quick succession (handled by cooldown/timer in actual game)
    // For now, just create the bullets simultaneously
    const bullets = [];
    const angle = Math.atan2(player.facing.y, player.facing.x);
    const attackId = `burst_${_nextAttackId++}`;

    for (let i = 0; i < 3; i++) {
      const randomness = (Math.random() - 0.5) * 0.1; // ±0.05 radians (~3 degrees)
      const finalAngle = angle + randomness;

      // Spawn bullets slightly offset from player center (avoids hitting sapping enemies)
      const spawnOffset = 6;
      const spawnX = player.position.x + player.width / 2 + Math.cos(finalAngle) * spawnOffset;
      const spawnY = player.position.y + player.height / 2 + Math.sin(finalAngle) * spawnOffset;

      bullets.push({
        type: 'bullet',
        char: this.data.bulletChar || '·',
        drawAngle: finalAngle,
        weaponChar: this.char,
        position: {
          x: spawnX,
          y: spawnY
        },
        velocity: {
          vx: Math.cos(finalAngle) * (this.data.bulletSpeed || 300),
          vy: Math.sin(finalAngle) * (this.data.bulletSpeed || 300)
        },
        damage: this.data.damage,
        color: this.color,
        onHit: this.data.onHit,
        electric: this.data.electric,
        homing: this.data.homing,
        ricochet: this.data.ricochet,
        maxRicochets: this.data.maxRicochets || 3,
        pierce: this.data.pierce,
        split: this.data.split,
        splitCount: this.data.splitCount || 3,
        knockback: this.data.knockback,
        lifesteal: this.data.lifesteal,
        chain: this.data.chain,
        chainCount: this.data.chainCount || 3,
        explode: this.data.explode,
        explodeRadius: this.data.explodeRadius || 30,
        accuracy: this.data.accuracy,
        owner: player,
        shooterPlane: player.plane,
        attackId
      });
    }

    return bullets;
  }

  createRingPattern(player) {
    const bullets = [];
    const count = this.data.bulletCount || 8;
    const attackId = `burst_${_nextAttackId++}`;

    for (let i = 0; i < count; i++) {
      const baseAngle = (Math.PI * 2 / count) * i;
      const randomness = (Math.random() - 0.5) * 0.06; // ±0.03 radians (~2 degrees) - smaller for patterns
      const angle = baseAngle + randomness;

      // Spawn bullets slightly offset from player center (avoids hitting sapping enemies)
      const spawnOffset = 6;
      const spawnX = player.position.x + player.width / 2 + Math.cos(angle) * spawnOffset;
      const spawnY = player.position.y + player.height / 2 + Math.sin(angle) * spawnOffset;

      bullets.push({
        type: 'bullet',
        char: this.data.bulletChar || '·',
        drawAngle: angle,
        weaponChar: this.char,
        position: {
          x: spawnX,
          y: spawnY
        },
        velocity: {
          vx: Math.cos(angle) * (this.data.bulletSpeed || 250),
          vy: Math.sin(angle) * (this.data.bulletSpeed || 250)
        },
        damage: this.data.damage,
        color: this.color,
        onHit: this.data.onHit,
        electric: this.data.electric,
        homing: this.data.homing,
        ricochet: this.data.ricochet,
        maxRicochets: this.data.maxRicochets || 3,
        pierce: this.data.pierce,
        split: this.data.split,
        splitCount: this.data.splitCount || 3,
        knockback: this.data.knockback,
        lifesteal: this.data.lifesteal,
        chain: this.data.chain,
        chainCount: this.data.chainCount || 3,
        explode: this.data.explode,
        explodeRadius: this.data.explodeRadius || 30,
        accuracy: this.data.accuracy,
        owner: player,
        shooterPlane: player.plane,
        attackId
      });
    }

    return bullets;
  }

  createSpiralPattern(player) {
    const bullets = [];
    const count = this.data.bulletCount || 5;
    const baseAngle = Math.atan2(player.facing.y, player.facing.x);
    const attackId = `burst_${_nextAttackId++}`;

    for (let i = 0; i < count; i++) {
      const spiralAngle = baseAngle + (i * 0.4);
      const randomness = (Math.random() - 0.5) * 0.06; // ±0.03 radians (~2 degrees)
      const angle = spiralAngle + randomness;

      // Spawn bullets slightly offset from player center (avoids hitting sapping enemies)
      const spawnOffset = 6;
      const spawnX = player.position.x + player.width / 2 + Math.cos(angle) * spawnOffset;
      const spawnY = player.position.y + player.height / 2 + Math.sin(angle) * spawnOffset;

      bullets.push({
        type: 'bullet',
        char: this.data.bulletChar || '·',
        drawAngle: angle,
        weaponChar: this.char,
        position: {
          x: spawnX,
          y: spawnY
        },
        velocity: {
          vx: Math.cos(angle) * (this.data.bulletSpeed || 280),
          vy: Math.sin(angle) * (this.data.bulletSpeed || 280)
        },
        damage: this.data.damage,
        color: this.color,
        onHit: this.data.onHit,
        electric: this.data.electric,
        homing: this.data.homing,
        ricochet: this.data.ricochet,
        maxRicochets: this.data.maxRicochets || 3,
        pierce: this.data.pierce,
        split: this.data.split,
        splitCount: this.data.splitCount || 3,
        knockback: this.data.knockback,
        lifesteal: this.data.lifesteal,
        chain: this.data.chain,
        chainCount: this.data.chainCount || 3,
        explode: this.data.explode,
        explodeRadius: this.data.explodeRadius || 30,
        accuracy: this.data.accuracy,
        owner: player,
        shooterPlane: player.plane,
        attackId
      });
    }

    return bullets;
  }

  createWavePattern(player) {
    const bullets = [];
    const count = this.data.bulletCount || 5;
    const baseAngle = Math.atan2(player.facing.y, player.facing.x);
    const attackId = `burst_${_nextAttackId++}`;

    for (let i = 0; i < count; i++) {
      const spread = Math.sin(i * 0.5) * 0.6;
      const randomness = (Math.random() - 0.5) * 0.06; // ±0.03 radians (~2 degrees)
      const angle = baseAngle + spread + randomness;

      // Spawn bullets slightly offset from player center (avoids hitting sapping enemies)
      const spawnOffset = 6;
      const spawnX = player.position.x + player.width / 2 + Math.cos(angle) * spawnOffset;
      const spawnY = player.position.y + player.height / 2 + Math.sin(angle) * spawnOffset;

      bullets.push({
        type: 'bullet',
        char: this.data.bulletChar || '·',
        drawAngle: angle,
        weaponChar: this.char,
        position: {
          x: spawnX,
          y: spawnY
        },
        velocity: {
          vx: Math.cos(angle) * (this.data.bulletSpeed || 300),
          vy: Math.sin(angle) * (this.data.bulletSpeed || 300)
        },
        damage: this.data.damage,
        color: this.color,
        onHit: this.data.onHit,
        electric: this.data.electric,
        homing: this.data.homing,
        ricochet: this.data.ricochet,
        maxRicochets: this.data.maxRicochets || 3,
        pierce: this.data.pierce,
        split: this.data.split,
        splitCount: this.data.splitCount || 3,
        knockback: this.data.knockback,
        lifesteal: this.data.lifesteal,
        chain: this.data.chain,
        chainCount: this.data.chainCount || 3,
        explode: this.data.explode,
        explodeRadius: this.data.explodeRadius || 30,
        accuracy: this.data.accuracy,
        owner: player,
        shooterPlane: player.plane,
        attackId
      });
    }

    return bullets;
  }

  createMeleeAttack(player) {
    // Route to pattern-specific generators
    const pattern = this.data.attackPattern || 'default';
    const subtype = this.data.weaponSubtype; // e.g. 'hammer', 'axe', 'sword', etc.

    const injectSubtype = (result) => {
      const props = {};
      if (subtype) props.weaponSubtype = subtype;
      if (this.data.electric) props.electric = this.data.electric;
      if (this.data.isBlade) props.isBlade = this.data.isBlade;
      if (this.data.isBlunt) props.isBlunt = this.data.isBlunt;
      if (this.data.canSmash) props.canSmash = this.data.canSmash;
      if (this.data.isPickaxe) props.isPickaxe = this.data.isPickaxe;
      if (this.data.weaponLevel) props.weaponLevel = this.data.weaponLevel;
      if (this.data.cyclesExitLetter) props.cyclesExitLetter = this.data.cyclesExitLetter;
      if (this.data.poisonStacks) props.poisonStacks = true;
      if (this.data.acidBlade) props.acidBlade = true;
      if (this.data.randomOnHit) props.randomOnHit = this.data.randomOnHit;

      if (Object.keys(props).length === 0) return result;
      if (Array.isArray(result)) {
        return result.map((a, idx) => {
          const merged = { ...a, ...props };
          if (idx > 0) delete merged.cyclesExitLetter;
          return merged;
        });
      }
      return { ...result, ...props };
    };

    switch (pattern) {
      case 'arc':
        return injectSubtype(this.createMeleeArc(player));
      case 'axe':
        return injectSubtype(this.createMeleeSweep(player));
      case 'sweep':
        return injectSubtype(this.createMeleeSweep(player));
      case 'shockwave':
        return injectSubtype(this.createMeleeShockwave(player));
      case 'hammerRing':
        return injectSubtype(this.createMeleeHammerRing(player));
      case 'thrust':
        return injectSubtype(this.createMeleeThrust(player));
      case 'multistab':
        return injectSubtype(this.createMeleeMultistab(player));
      case 'whipcrack':
        return injectSubtype(this.createMeleeWhipcrack(player));
      case 'slam':
        return injectSubtype(this.createMeleeSlam(player));
      default:
        // Default single-hit attack. Fall back to the weapon's own glyph
        // (rather than '█') so the player AND any enemy wielding the same
        // weapon both swing a visually distinct character — keeps player-NPC
        // animation parity while making sword vs. axe vs. spear readable.
        const range = this.data.range || 20;
        const defaultChar = this.data.meleeChar || this.data.char || '█';
        const defaultAngle = Math.atan2(player.facing.y, player.facing.x);
        return injectSubtype({
          type: 'melee',
          char: defaultChar,
          drawAngle: this.getMeleeDrawAngle(defaultChar, defaultAngle),
          position: {
            x: player.position.x + player.facing.x * range,
            y: player.position.y + player.facing.y * range
          },
          width: this.data.attackWidth || GRID.CELL_SIZE,
          height: this.data.attackHeight || GRID.CELL_SIZE,
          damage: this.data.damage,
          duration: this.data.attackDuration || 0.1,
          color: this.color,
          onHit: this.data.onHit,
          electric: this.data.electric,
          knockback: this.data.knockback || 300,
          lifesteal: this.data.lifesteal,
          chain: this.data.chain,
          explode: this.data.explode,
          explodeRadius: this.data.explodeRadius || 40,
          owner: player,
        shooterPlane: player.plane
        });
    }
  }

  createMeleeArc(player) {
    // 3-hit arc slash pattern (swords)
    const attacks = [];
    const baseAngle = Math.atan2(player.facing.y, player.facing.x);
    const distance = this.data.range || 20;
    const patternSpeed = this.data.patternSpeed || 0.05;

    const offsets = [-Math.PI / 4, 0, Math.PI / 4]; // -45°, 0°, +45°

    for (let i = 0; i < 3; i++) {
      const angle = baseAngle + offsets[i];
      const relX = Math.cos(angle) * distance;
      const relY = Math.sin(angle) * distance;

      const knockbackValue = this.data.knockback || 150;
      const meleeChar = this.data.meleeChar || '/';

      const drawScale = this.data.drawScale || 1.0;
      attacks.push({
        type: 'melee',
        char: meleeChar,
        drawAngle: this.getMeleeDrawAngle(meleeChar, angle),
        drawScale,
        position: { x: player.position.x + relX, y: player.position.y + relY },
        relX, relY,
        width: GRID.CELL_SIZE * drawScale,
        height: GRID.CELL_SIZE * drawScale,
        damage: this.data.damage,
        duration: 0.1,
        delay: i * patternSpeed,
        color: this.color,
        onHit: this.data.onHit,
        knockback: knockbackValue,
        lifesteal: this.data.lifesteal,
        owner: player,
        shooterPlane: player.plane
      });
    }

    return attacks;
  }

  createMeleeSweep(player) {
    // 5-position horizontal sweep (axes)
    const attacks = [];
    const baseAngle = Math.atan2(player.facing.y, player.facing.x);
    const distance = this.data.range || 20;
    const patternSpeed = this.data.patternSpeed || 0.04;

    const offsets = [-Math.PI / 2, -Math.PI / 4, 0, Math.PI / 4, Math.PI / 2]; // Left to right

    for (let i = 0; i < 5; i++) {
      const angle = baseAngle + offsets[i];
      const relX = Math.cos(angle) * distance;
      const relY = Math.sin(angle) * distance;
      const meleeChar = this.data.meleeChar || '═';

      attacks.push({
        type: 'melee',
        char: meleeChar,
        drawAngle: this.getMeleeDrawAngle(meleeChar, angle),
        position: { x: player.position.x + relX, y: player.position.y + relY },
        relX, relY,
        width: GRID.CELL_SIZE,
        height: GRID.CELL_SIZE,
        damage: this.data.damage,
        duration: 0.1,
        delay: i * patternSpeed,
        color: this.color,
        onHit: this.data.onHit,
        knockback: this.data.knockback || 300,
        owner: player,
        shooterPlane: player.plane
      });
    }

    return attacks;
  }

  createMeleeHammerRing(player) {
    // Single weapon-glyph flash at the strike point (facing × range).
    // Movement is locked by locksMovement + attackLockTimer for the flash duration.
    const facingAngle = Math.atan2(player.facing.y, player.facing.x);
    const range = this.data.range || GRID.CELL_SIZE * 1.25;

    return {
      type: 'melee',
      char: this.data.char,
      drawAngle: this.getMeleeDrawAngle(this.data.char, facingAngle),
      position: {
        x: player.position.x + Math.cos(facingAngle) * range,
        y: player.position.y + Math.sin(facingAngle) * range,
      },
      width: GRID.CELL_SIZE,
      height: GRID.CELL_SIZE,
      damage: this.data.damage,
      duration: 0.15,
      delay: 0,
      color: this.color,
      onHit: this.data.onHit,
      knockback: this.data.knockback || 300,
      owner: player,
      shooterPlane: player.plane,
    };
  }

  createMeleeShockwave(player) {
    // Expanding concentric rings — hammer augment/special pattern.
    // patternSpeed is hardcoded here so the weapon's data.patternSpeed
    // (used by the tap sweep) doesn't bleed into the shockwave cadence.
    // 0.125s/ring matches the visual ring expansion (8 cells/sec, 1 cell per ring).
    const attacks = [];
    const patternSpeed = 0.4;
    const rings = 3;
    const cx = player.position.x + GRID.CELL_SIZE / 2;
    const cy = player.position.y + GRID.CELL_SIZE / 2;

    for (let ring = 1; ring <= rings; ring++) {
      const radius = ring * GRID.CELL_SIZE;
      const positions = 8;

      const shockwaveChar = this.data.meleeChar || '○';
      for (let i = 0; i < positions; i++) {
        const angle = (Math.PI * 2 / positions) * i;
        const relX = Math.cos(angle) * radius;
        const relY = Math.sin(angle) * radius;

        attacks.push({
          type: 'melee',
          char: shockwaveChar,
          drawAngle: this.getMeleeDrawAngle(shockwaveChar, angle),
          position: { x: player.position.x + relX, y: player.position.y + relY },
          relX, relY,
          width: GRID.CELL_SIZE,
          height: GRID.CELL_SIZE,
          damage: this.data.damage,
          duration: 0.15,
          delay: (ring - 1) * patternSpeed,
          color: this.color,
          onHit: this.data.onHit,
          knockback: this.data.knockback || 150,
          explode: this.data.explode,
          explodeRadius: this.data.explodeRadius,
          owner: player,
          shooterPlane: player.plane,
          ...(ring === 1 && i === 0 ? {
            triggerShockwave: true,
            shockwaveOrigin: { x: cx, y: cy },
            shockwaveColor: this.color,
          } : {}),
        });
      }
    }

    return attacks;
  }

  createMeleeThrust(player) {
    // Linear forward thrust (spears)
    const attacks = [];
    const baseAngle = Math.atan2(player.facing.y, player.facing.x);
    const patternSpeed = this.data.patternSpeed || 0.05;

    const thrustChar = this.data.meleeChar || '→';
    const thrustDrawAngle = this.getMeleeDrawAngle(thrustChar, baseAngle);
    const facingX = Math.cos(baseAngle);
    const facingY = Math.sin(baseAngle);

    for (let i = 1; i <= 3; i++) {
      const distance = i * GRID.CELL_SIZE;
      const relX = facingX * distance;
      const relY = facingY * distance;

      attacks.push({
        type: 'melee',
        char: thrustChar,
        drawAngle: thrustDrawAngle,
        position: { x: player.position.x + relX, y: player.position.y + relY },
        relX, relY,
        width: GRID.CELL_SIZE,
        height: GRID.CELL_SIZE,
        damage: this.data.damage,
        duration: 0.1,
        delay: (i - 1) * patternSpeed,
        color: this.color,
        onHit: this.data.onHit,
        knockback: this.data.knockback || 300,
        facing: { x: facingX, y: facingY },
        distanceCrit: i === 3 && (this.data.distanceCrit || false),
        owner: player,
        shooterPlane: player.plane
      });
    }

    return attacks;
  }

  createMeleeMultistab(player) {
    // Rapid short-range stabs half a cell in front of the player (daggers).
    // Glyph is the weapon's own char rotated to face the attack direction.
    const attacks = [];
    const baseAngle = Math.atan2(player.facing.y, player.facing.x);
    const distance = this.data.range ?? GRID.CELL_SIZE * 0.5;
    const patternSpeed = this.data.patternSpeed || 0.05;
    const stabs = 3;

    // Daggers benefit from oil augments (onHit override only — speed is bow-specific)
    const isDagger = this.data.weaponSubtype === 'dagger';
    const oilOnHit = isDagger ? _readEquippedOilEffect(player).onHit : null;

    const relX = Math.cos(baseAngle) * distance;
    const relY = Math.sin(baseAngle) * distance;
    const multistabChar = this.data.meleeChar || this.char;
    const multistabDrawAngle = this.getMeleeDrawAngle(multistabChar, baseAngle);
    // Combo finisher: only the final stab applies knockback (and full hitstop).
    // The earlier stabs use a light hitstop so they don't eat the finisher's
    // 0.2s knockback window the way 3 full hitstops do.
    for (let i = 0; i < stabs; i++) {
      const isFinisher = (i === stabs - 1);
      attacks.push({
        type: 'melee',
        char: multistabChar,
        drawAngle: multistabDrawAngle,
        position: { x: player.position.x + relX, y: player.position.y + relY },
        relX, relY,
        width: GRID.CELL_SIZE * 0.75,
        height: GRID.CELL_SIZE * 0.75,
        damage: this.data.damage,
        duration: 0.08,
        delay: i * patternSpeed,
        color: this.color,
        onHit: oilOnHit || this.data.onHit,
        knockback: isFinisher ? (this.data.knockback || 350) : 0,
        hitstop: isFinisher ? 0.06 : 0.02,
        lifesteal: this.data.lifesteal,
        owner: player,
        shooterPlane: player.plane
      });
    }

    return attacks;
  }

  createMeleeWhipcrack(player) {
    // Long linear crack (whips)
    const attacks = [];
    const baseAngle = Math.atan2(player.facing.y, player.facing.x);
    const patternSpeed = this.data.patternSpeed || 0.02;
    const reach = 5;

    const whipChar = this.data.meleeChar || '~';
    const whipDrawAngle = this.getMeleeDrawAngle(whipChar, baseAngle);
    for (let i = 1; i <= reach; i++) {
      const distance = i * GRID.CELL_SIZE;
      const relX = Math.cos(baseAngle) * distance;
      const relY = Math.sin(baseAngle) * distance;

      attacks.push({
        type: 'melee',
        char: whipChar,
        drawAngle: whipDrawAngle,
        position: { x: player.position.x + relX, y: player.position.y + relY },
        relX, relY,
        width: GRID.CELL_SIZE * 0.8,
        height: GRID.CELL_SIZE * 0.8,
        damage: this.data.damage,
        duration: 0.08,
        delay: (i - 1) * patternSpeed,
        color: this.color,
        onHit: this.data.onHit,
        knockback: this.data.knockback || 300,
        owner: player,
        shooterPlane: player.plane
      });
    }

    return attacks;
  }

  createMeleeSlam(player) {
    // Single massive strike with large hitbox (heavy blades)
    const baseAngle = Math.atan2(player.facing.y, player.facing.x);
    const distance = this.data.range || 24;
    const slamChar = this.data.meleeChar || '█';

    return {
      type: 'melee',
      char: slamChar,
      drawAngle: this.getMeleeDrawAngle(slamChar, baseAngle),
      position: {
        x: player.position.x + Math.cos(baseAngle) * distance,
        y: player.position.y + Math.sin(baseAngle) * distance
      },
      width: GRID.CELL_SIZE * 2,
      height: GRID.CELL_SIZE * 1.5,
      damage: this.data.damage,
      duration: 0.15,
      delay: 0,
      color: this.color,
      onHit: this.data.onHit,
      knockback: this.data.knockback || 300,
      owner: player,
      shooterPlane: player.plane ?? 0
    };
  }

  createArrow(player, chargeRatio = 0) {
    const angle = Math.atan2(player.facing.y, player.facing.x);
    const arrowCount = this.data.arrowCount || 1;
    const arrows = [];

    // Calculate speed multiplier from charge (1x to 2x)
    const speedMultiplier = 1.0 + chargeRatio; // 0% charge = 1x, 100% charge = 2x

    // Special patterns
    if (this.data.attackPattern === 'burst') {
      // Burst bow fires multiple arrows in sequence
      for (let i = 0; i < 3; i++) {
        arrows.push(this.createSingleArrow(player, angle, speedMultiplier));
      }
    } else {
      // Multi-shot or single arrow
      for (let i = 0; i < arrowCount; i++) {
        const spreadAngle = arrowCount > 1 ? angle + (i - Math.floor(arrowCount / 2)) * 0.3 : angle;
        arrows.push(this.createSingleArrow(player, spreadAngle, speedMultiplier));
      }
    }

    // Deplete one use per arrow fired so refunds (via pickup) match expenditure
    if (this.maxUses !== null && this.usesRemaining > 0) {
      this.usesRemaining = Math.max(0, this.usesRemaining - arrows.length);

      // If depleted, set a long cooldown to prevent further use
      if (this.usesRemaining <= 0) {
        this.cooldownTimer = 9999; // Effectively infinite until reset
      }
    }

    return arrows;
  }

  createSingleArrow(player, angle, speedMultiplier = 1.0) {
    // Add slight randomness to arrow direction
    const randomness = (Math.random() - 0.5) * 0.1; // ±0.05 radians (~3 degrees)
    const finalAngle = angle + randomness;

    // Equipped oil augment (Slick = +speed, Fire/Frost/Drowse = onHit override)
    const oil = _readEquippedOilEffect(player);

    // Apply speed multiplier from charge
    const baseSpeed = this.data.arrowSpeed || 250;
    const finalSpeed = baseSpeed * speedMultiplier * oil.arrowSpeedMult;

    // Calculate arrow character based on direction
    const arrowChar = this.getArrowCharForAngle(finalAngle);

    // Spawn arrows slightly offset from player center (avoids hitting sapping enemies)
    const spawnOffset = 6;
    const spawnX = player.position.x + player.width / 2 + Math.cos(finalAngle) * spawnOffset;
    const spawnY = player.position.y + player.height / 2 + Math.sin(finalAngle) * spawnOffset;

    const isBoomerang = !!this.data.boomerang;
    // Outbound travel distance and enemy-to-enemy ricochet budget both scale with
    // bow charge (speedMultiplier = 1 + chargeRatio). Duration is derived from the
    // desired cell-distance divided by the actual flight speed, so the throw
    // distance is exact regardless of charge/oil speed effects on finalSpeed.
    const chargeRatio = Math.max(0, Math.min(1, speedMultiplier - 1));
    const boomerangMinCells = this.data.boomerangMinCells ?? 1;
    const boomerangMaxCells = this.data.boomerangMaxCells ?? 5;
    const boomerangTravelDistance =
      (boomerangMinCells + chargeRatio * (boomerangMaxCells - boomerangMinCells)) * GRID.CELL_SIZE;
    const boomerangTimer = isBoomerang ? boomerangTravelDistance / finalSpeed : 0;
    const boomerangBounces = isBoomerang
      ? Math.round(chargeRatio * (this.data.boomerangMaxRicochets ?? 3))
      : 0;

    return {
      type: 'arrow',
      char: isBoomerang ? this.char : arrowChar,
      weaponChar: this.char,
      position: {
        x: spawnX,
        y: spawnY
      },
      velocity: {
        vx: Math.cos(finalAngle) * finalSpeed,
        vy: Math.sin(finalAngle) * finalSpeed
      },
      damage: this.data.damage,
      color: this.color,
      onHit: oil.onHit || this.data.onHit,
      electric: this.data.electric,
      homing: this.data.homing,
      pierce: this.data.pierce || isBoomerang,  // Boomerang: pierce so wall/single-hit doesn't despawn it
      split: this.data.split,
      splitCount: this.data.splitCount || 3,
      explode: this.data.explode,
      explodeRadius: this.data.explodeRadius || 35,
      chain: this.data.chain,
      chainCount: this.data.chainCount || 2,
      shooterPlane: player.plane,
      owner: player,
      // Boomerang state
      boomerang: isBoomerang,
      boomerangTimer,                                   // counts down to return-mode flip
      boomerangHitDefer: this.data.boomerangHitDefer,
      chainRadius: this.data.chainRadius,
      boomerangReturning: false,
      boomerangHasHitFirst: false,
      boomerangBounceTarget: null,                      // enemy locked by post-hit bounce homing
      boomerangBouncesLeft: boomerangBounces,           // charge-scaled enemy-to-enemy ricochet budget
      drawAngle: isBoomerang ? 0 : undefined
    };
  }

  getMeleeDrawAngle(char, attackAngle) {
    // Maps each char to the attackAngle at which it looks correct without rotation.
    // drawAngle = attackAngle - naturalAngle is then applied as a canvas rotation.
    //
    // Examples:
    //   '|' looks correct (vertical) when attacking up (-π/2) → naturalAngle = -π/2
    //   '→' looks correct (rightward) when attacking right (0) → naturalAngle = 0
    //   '/' looks correct (up-right diagonal) when attacking up-right (-π/4) → naturalAngle = -π/4
    const NATURAL_ANGLES = {
      '|':  -Math.PI / 2,
      '═':  -Math.PI / 2,
      '-':  0,
      '║':  0,
      '/':  -Math.PI / 4,
      '\\': Math.PI / 4,
      '~':  0,
      '→':  0,
      '←':  Math.PI,
      '↑':  -Math.PI / 2,
      '↓':  Math.PI / 2,
      '↾':  -Math.PI / 2,
    };
    const naturalAngle = NATURAL_ANGLES[char];
    return naturalAngle !== undefined ? attackAngle - naturalAngle : null;
  }

  getArrowCharForAngle(angle) {
    // Normalize angle to 0-2π range
    let normalizedAngle = angle % (Math.PI * 2);
    if (normalizedAngle < 0) normalizedAngle += Math.PI * 2;

    // Convert to degrees for easier mental mapping
    const degrees = normalizedAngle * (180 / Math.PI);

    // Map angle to 8 directional arrows (45° segments)
    // 0° = right, 90° = down, 180° = left, 270° = up
    if (degrees >= 337.5 || degrees < 22.5) return '→';      // Right
    else if (degrees >= 22.5 && degrees < 67.5) return '↘';  // Down-right
    else if (degrees >= 67.5 && degrees < 112.5) return '↓'; // Down
    else if (degrees >= 112.5 && degrees < 157.5) return '↙'; // Down-left
    else if (degrees >= 157.5 && degrees < 202.5) return '←'; // Left
    else if (degrees >= 202.5 && degrees < 247.5) return '↖'; // Up-left
    else if (degrees >= 247.5 && degrees < 292.5) return '↑'; // Up
    else return '↗'; // Up-right (292.5-337.5)
  }

  createWandAttack(player) {
    // Gem wands route through the magic-meter system, not the per-room use system.
    if (this.data.gemWand) {
      return this.createGemWandAttack(player);
    }

    // Check uses remaining for limited-use wands
    if (this.wandUsesRemaining !== null && this.wandUsesRemaining <= 0) {
      return null; // No attack if out of uses
    }

    // Wand-specific attack creation
    const wandType = this.char;

    switch (wandType) {
      case '\\': // Chaos Wand - proximity AOE damage
        return this.createChaosWandAttack(player);

      case '}': // Blind Wand - proximity AOE blind
        return this.createBlindWandAttack(player);

      case '>': // Transmutation Wand - polymorph bolt
        // Check uses remaining
        if (this.wandUsesRemaining !== null && this.wandUsesRemaining <= 0) {
          return null;
        }
        // Decrement uses
        if (this.wandUsesRemaining !== null) {
          this.wandUsesRemaining--;
        }
        return this.createTransmutationWandAttack(player);

      case '`': // Infusion Wand - electrical infusion missile
        // TODO: Implement in Phase 6
        return null;

      default:
        console.warn(`[WAND] Unknown wand type: ${wandType}`);
        return null;
    }
  }

  createChaosWandAttack(player) {
    // Chaos Wand requires proximity - must be near at least 1 enemy
    // This check will be done by the game/combat system, we just return the attack data
    const centerX = player.position.x + player.width / 2;
    const centerY = player.position.y + player.height / 2;

    return {
      type: 'chaos_wand',
      wandChar: this.char,
      wandName: this.data.name,
      position: { x: centerX, y: centerY },
      damage: this.data.damage,
      blastRadius: this.data.blastRadius,
      damageMin: this.data.damageMin, // Minimum damage at edge (25%)
      proximityRequired: this.data.proximityRequired,
      color: this.color,
      owner: player
    };
  }

  createBlindWandAttack(player) {
    // Blind Wand requires proximity - must be near at least 1 enemy
    const centerX = player.position.x + player.width / 2;
    const centerY = player.position.y + player.height / 2;

    return {
      type: 'blind_wand',
      wandChar: this.char,
      wandName: this.data.name,
      position: { x: centerX, y: centerY },
      effectRadius: this.data.effectRadius,
      effectDuration: this.data.effectDuration,
      proximityRequired: this.data.proximityRequired,
      color: this.color,
      owner: player
    };
  }

  createGemWandAttack(player) {
    // Phase 1: placeholder cast — returns a tagged attack object that MagicSystem
    // intercepts to deduct mana and emit a floating-text effect. Real spell logic
    // (fire AOE, blizzard, chain stun, blind cone, grass circle, charm AOE) lands
    // in Phase 2.
    const centerX = player.position.x + player.width / 2;
    const centerY = player.position.y + player.height / 2;

    return {
      type: 'gem_wand_cast',
      wandChar: this.char,
      wandName: this.data.name,
      spellEffect: this.data.spellEffect,
      manaCost: this.data.manaCost,
      position: { x: centerX, y: centerY },
      facing: { x: player.facing.x, y: player.facing.y },
      color: this.color,
      owner: player
    };
  }

  createTransmutationWandAttack(player) {
    // Transmutation Wand fires a purple polymorph bolt
    const angle = Math.atan2(player.facing.y, player.facing.x);

    // Spawn offset from player center
    const spawnOffset = 6;
    const spawnX = player.position.x + player.width / 2 + Math.cos(angle) * spawnOffset;
    const spawnY = player.position.y + player.height / 2 + Math.sin(angle) * spawnOffset;

    const speed = this.data.projectileSpeed || 180;

    return {
      type: 'transmutation_bolt',
      char: '>',
      wandChar: this.char,
      wandName: this.data.name,
      position: { x: spawnX, y: spawnY },
      velocity: {
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed
      },
      color: this.color,
      owner: player
    };
  }

  // Gem-wand cast: returns attack data once chargeTime has reached data.chargeTime.
  // Caller (MagicSystem) is responsible for the mana check + deduction.
  releaseGemWand() {
    if (!this.isCharging || !this.data.gemWand) return null;
    if (this.chargeTime < this.data.chargeTime) return null;

    const player = this.chargingPlayer;
    if (!player) {
      this.isCharging = false;
      this.chargeTime = 0;
      return null;
    }

    const attack = this.executeAttack(player);

    this.isCharging = false;
    this.chargeTime = 0;
    this.chargingPlayer = null;
    this.cooldownTimer = this.data.recovery || 0.5;

    return attack;
  }

  // Cancel a gem-wand charge in progress (e.g. player released space before completion).
  // No mana cost. Returns true if a charge was in progress and cancelled.
  cancelGemWandCharge() {
    if (!this.isCharging || !this.data.gemWand) return false;
    this.isCharging = false;
    this.chargeTime = 0;
    this.chargingPlayer = null;
    return true;
  }

  // Called when this weapon is being switched away from (player picks a different slot).
  // Cancels charge / windup, and forces any in-progress reload to restart from the beginning
  // when the player switches back.
  cancelChargeAndReload() {
    if (this.isCharging) {
      this.isCharging = false;
      this.chargeTime = 0;
      this.chargingPlayer = null;
    }
    if (this.windupActive) {
      this.windupActive = false;
      this.windupTimer = 0;
      this.pendingPlayer = null;
    }
    // If currently in the reload phase, restart it from the beginning.
    // (If still in the post-fire cooldown phase, leave it alone — the reload
    // will start fresh once that cooldown elapses.)
    if (this._reloading && this.data.reloadTime) {
      this.cooldownTimer = this.data.reloadTime;
      this._reloadTicksPlayed = 0;
      this._reloadTicksPending = 0;
    }
  }

  // Drain pending mechanical reload ticks (audio layer plays one SFX per tick).
  consumeReloadTicks() {
    const n = this._reloadTicksPending || 0;
    this._reloadTicksPending = 0;
    return n;
  }

  // Reset bow and wand uses when entering a new room
  resetUses() {
    // Reset bow uses
    if (this.maxUses !== null) {
      this.usesRemaining = this.maxUses;
      // Also clear the infinite cooldown if bow was depleted
      if (this.cooldownTimer > 1000) {
        this.cooldownTimer = 0;
      }
    }

    // Reset wand uses
    if (this.maxUsesPerRoom !== null) {
      this.wandUsesRemaining = this.maxUsesPerRoom;
    }
  }
}
