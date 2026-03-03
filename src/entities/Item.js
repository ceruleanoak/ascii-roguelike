import { GRID, COLORS } from '../game/GameConfig.js';
import { ITEMS, WEAPON_TYPES } from '../data/items.js';

let _nextAttackId = 0;

export class Item {
  constructor(char, x, y) {
    this.char = char;
    this.data = ITEMS[char] || {
      char,
      name: 'Unknown',
      type: 'WEAPON',
      color: COLORS.ITEM
    };

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

    // Bow use limit system (resets per room)
    this.maxUses = this.data.maxUses || null; // null = unlimited (for non-bows)
    this.usesRemaining = this.maxUses;

    // Wand use limit system (resets per room)
    this.maxUsesPerRoom = this.data.maxUsesPerRoom || null; // null = unlimited
    this.wandUsesRemaining = this.maxUsesPerRoom;

    // Bow charging system (hold to charge)
    this.isCharging = false;
    this.chargeTime = 0;
    this.maxChargeTime = 1.5; // 1.5 seconds to reach max charge (2x speed)
    this.chargingPlayer = null;
    this.lastChargeRatio = 0; // Store charge level when fired (for cooldown indicator)
  }

  getHitbox() {
    return {
      x: this.position.x,
      y: this.position.y,
      width: this.width,
      height: this.height
    };
  }

  update(deltaTime) {
    // Update cooldown (recovery after attack)
    if (this.cooldownTimer > 0) {
      this.cooldownTimer -= deltaTime;
    }

    // Update bow charging (hold to charge)
    if (this.isCharging && this.data.weaponType === 'BOW') {
      this.chargeTime += deltaTime;
      if (this.chargeTime > this.maxChargeTime) {
        this.chargeTime = this.maxChargeTime; // Cap at max charge
      }
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

        return attack;
      }
    }

    return null;
  }

  canUse() {
    const cooldownReady = this.cooldownTimer <= 0 && !this.windupActive;

    // Check bow use limit (if applicable)
    if (this.data.weaponType === 'BOW' && this.maxUses !== null) {
      return cooldownReady && this.usesRemaining > 0;
    }

    return cooldownReady;
  }

  use(player) {
    if (!this.canUse()) return null;

    // Utility items (like vault key) have no attack behavior
    if (this.data.weaponType === 'UTILITY') {
      return null;
    }

    // Bows use charging system (hold to charge)
    if (this.data.weaponType === 'BOW') {
      if (!this.isCharging) {
        this.isCharging = true;
        this.chargeTime = 0;
        this.chargingPlayer = player;
      }
      return null; // No attack while charging
    }

    // Check if weapon has windup (melee weapons typically do)
    const windup = this.data.windup || 0;

    if (windup > 0) {
      // Start windup, attack will execute after windup completes
      this.windupTimer = windup;
      this.windupActive = true;
      this.pendingPlayer = player;
      return null; // No immediate attack
    } else {
      // No windup - execute immediately
      const attack = this.executeAttack(player);

      // Set cooldown immediately for all weapons (including wands)
      // Proximity-based wands will reset cooldown in main.js if proximity check fails
      this.cooldownTimer = this.data.recovery || this.data.cooldown || 0.5;

      return attack;
    }
  }

  // Release charged bow (called when player releases space)
  releaseBow() {
    if (!this.isCharging || this.data.weaponType !== 'BOW') return null;

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

    // Start cooldown
    this.cooldownTimer = this.data.cooldown || 0.5;

    return attack;
  }

  executeAttack(player, chargeRatio = 0) {
    // Return attack data based on weapon type
    switch (this.data.weaponType) {
      case 'GUN':
        return this.createBullets(player);
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

  createBullets(player) {
    const bullets = [];
    const bulletCount = this.data.bulletCount || 1;
    const spread = bulletCount > 1 ? 0.3 : 0;
    const angle = Math.atan2(player.facing.y, player.facing.x);
    // Unique ID for this burst — lets same-burst bullets bypass enemy iframes
    const attackId = `burst_${_nextAttackId++}`;

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
      const randomness = (Math.random() - 0.5) * 0.1; // ±0.05 radians (~3 degrees)
      const spreadAngle = angle + baseSpread + randomness;

      // Spawn bullets slightly offset from player center (avoids hitting sapping enemies)
      const spawnOffset = 6;
      const spawnX = player.position.x + player.width / 2 + Math.cos(spreadAngle) * spawnOffset;
      const spawnY = player.position.y + player.height / 2 + Math.sin(spreadAngle) * spawnOffset;

      bullets.push({
        type: 'bullet',
        char: this.data.bulletChar || '·',
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
        chain: this.data.chain,
        chainCount: this.data.chainCount || 3,
        explode: this.data.explode,
        explodeRadius: this.data.explodeRadius || 30,
        owner: player,
        shooterPlane: player.plane,
        attackId
      });
    }

    return bullets;
  }

  createBurstPattern(player) {
    // Fires 3 bullets in quick succession (handled by cooldown/timer in actual game)
    // For now, just create the bullets simultaneously
    const bullets = [];
    const angle = Math.atan2(player.facing.y, player.facing.x);

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
        owner: player,
        shooterPlane: player.plane
      });
    }

    return bullets;
  }

  createRingPattern(player) {
    const bullets = [];
    const count = this.data.bulletCount || 8;

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
        owner: player,
        shooterPlane: player.plane
      });
    }

    return bullets;
  }

  createSpiralPattern(player) {
    const bullets = [];
    const count = this.data.bulletCount || 5;
    const baseAngle = Math.atan2(player.facing.y, player.facing.x);

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
        electric: this.data.electric,
        color: this.color,
        onHit: this.data.onHit,
        owner: player,
        shooterPlane: player.plane
      });
    }

    return bullets;
  }

  createWavePattern(player) {
    const bullets = [];
    const count = this.data.bulletCount || 5;
    const baseAngle = Math.atan2(player.facing.y, player.facing.x);

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
        owner: player,
        shooterPlane: player.plane
      });
    }

    return bullets;
  }

  createMeleeAttack(player) {
    // Route to pattern-specific generators
    const pattern = this.data.attackPattern || 'default';
    const subtype = this.data.weaponSubtype; // e.g. 'blunt' for hammers, batons, axes

    const injectSubtype = (result) => {
      const props = {};
      if (subtype) props.weaponSubtype = subtype;
      if (this.data.electric) props.electric = this.data.electric;
      if (this.data.isBlade) props.isBlade = this.data.isBlade;

      if (Object.keys(props).length === 0) return result;
      if (Array.isArray(result)) return result.map(a => ({ ...a, ...props }));
      return { ...result, ...props };
    };

    switch (pattern) {
      case 'arc':
        return injectSubtype(this.createMeleeArc(player));
      case 'sweep':
        return injectSubtype(this.createMeleeSweep(player));
      case 'shockwave':
        return injectSubtype(this.createMeleeShockwave(player));
      case 'thrust':
        return injectSubtype(this.createMeleeThrust(player));
      case 'multistab':
        return injectSubtype(this.createMeleeMultistab(player));
      case 'whipcrack':
        return injectSubtype(this.createMeleeWhipcrack(player));
      case 'ring':
        return injectSubtype(this.createMeleeRing(player));
      case 'slam':
        return injectSubtype(this.createMeleeSlam(player));
      default:
        // Default single-hit attack
        const range = this.data.range || 20;
        return injectSubtype({
          type: 'melee',
          char: this.data.meleeChar || '█',
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

  createMeleeRing(player) {
    // Create sequential circular sweep attack (like a spinning flail)
    const attacks = [];
    const count = 8;
    const sweepDuration = 0.4; // Total time for full circle sweep
    const delayPerStep = sweepDuration / count;

    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 / count) * i;
      const distance = this.data.range || 20;
      const relX = Math.cos(angle) * distance;
      const relY = Math.sin(angle) * distance;

      attacks.push({
        type: 'melee',
        char: this.data.meleeChar || '~',
        position: {
          x: player.position.x + relX,
          y: player.position.y + relY
        },
        relX, relY,
        width: GRID.CELL_SIZE,
        height: GRID.CELL_SIZE,
        damage: this.data.damage,
        duration: 0.1,
        delay: i * delayPerStep,
        color: this.color,
        onHit: this.data.onHit,
        knockback: this.data.knockback || 300,
        owner: player,
        shooterPlane: player.plane
      });
    }

    return attacks;
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

      attacks.push({
        type: 'melee',
        char: this.data.meleeChar || '/',
        position: { x: player.position.x + relX, y: player.position.y + relY },
        relX, relY,
        width: GRID.CELL_SIZE,
        height: GRID.CELL_SIZE,
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

      attacks.push({
        type: 'melee',
        char: this.data.meleeChar || '═',
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

  createMeleeShockwave(player) {
    // Expanding concentric rings (hammers)
    const attacks = [];
    const patternSpeed = this.data.patternSpeed || 0.1;
    const rings = 3;

    for (let ring = 1; ring <= rings; ring++) {
      const radius = ring * GRID.CELL_SIZE;
      const positions = 8; // 8 positions per ring

      for (let i = 0; i < positions; i++) {
        const angle = (Math.PI * 2 / positions) * i;
        const relX = Math.cos(angle) * radius;
        const relY = Math.sin(angle) * radius;

        attacks.push({
          type: 'melee',
          char: this.data.meleeChar || '○',
          position: { x: player.position.x + relX, y: player.position.y + relY },
          relX, relY,
          width: GRID.CELL_SIZE,
          height: GRID.CELL_SIZE,
          damage: this.data.damage,
          duration: 0.15,
          delay: (ring - 1) * patternSpeed,
          color: this.color,
          onHit: this.data.onHit,
          knockback: this.data.knockback || 300,
          explode: this.data.explode,
          explodeRadius: this.data.explodeRadius,
          owner: player,
        shooterPlane: player.plane
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

    for (let i = 1; i <= 3; i++) {
      const distance = i * GRID.CELL_SIZE;
      const relX = Math.cos(baseAngle) * distance;
      const relY = Math.sin(baseAngle) * distance;

      attacks.push({
        type: 'melee',
        char: this.data.meleeChar || '→',
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
        owner: player,
        shooterPlane: player.plane
      });
    }

    return attacks;
  }

  createMeleeMultistab(player) {
    // Rapid multiple stabs in same position (daggers)
    const attacks = [];
    const baseAngle = Math.atan2(player.facing.y, player.facing.x);
    const distance = this.data.range || 16;
    const patternSpeed = this.data.patternSpeed || 0.05;
    const stabs = 3;

    const relX = Math.cos(baseAngle) * distance;
    const relY = Math.sin(baseAngle) * distance;
    for (let i = 0; i < stabs; i++) {
      attacks.push({
        type: 'melee',
        char: this.data.meleeChar || '†',
        position: { x: player.position.x + relX, y: player.position.y + relY },
        relX, relY,
        width: GRID.CELL_SIZE * 0.75,
        height: GRID.CELL_SIZE * 0.75,
        damage: this.data.damage,
        duration: 0.08,
        delay: i * patternSpeed,
        color: this.color,
        onHit: this.data.onHit,
        knockback: this.data.knockback || 300,
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

    for (let i = 1; i <= reach; i++) {
      const distance = i * GRID.CELL_SIZE;
      const relX = Math.cos(baseAngle) * distance;
      const relY = Math.sin(baseAngle) * distance;

      attacks.push({
        type: 'melee',
        char: this.data.meleeChar || '~',
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

    return {
      type: 'melee',
      char: this.data.meleeChar || '█',
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
      owner: player
    };
  }

  createArrow(player, chargeRatio = 0) {
    const angle = Math.atan2(player.facing.y, player.facing.x);
    const arrowCount = this.data.arrowCount || 1;
    const arrows = [];

    // Calculate speed multiplier from charge (1x to 2x)
    const speedMultiplier = 1.0 + chargeRatio; // 0% charge = 1x, 100% charge = 2x

    // Decrement use count for bows with limited uses
    if (this.maxUses !== null && this.usesRemaining > 0) {
      this.usesRemaining--;

      // If depleted, set a long cooldown to prevent further use
      if (this.usesRemaining <= 0) {
        this.cooldownTimer = 9999; // Effectively infinite until reset
      }
    }

    // Special patterns
    if (this.data.attackPattern === 'burst') {
      // Burst bow fires multiple arrows in sequence
      for (let i = 0; i < 3; i++) {
        arrows.push(this.createSingleArrow(player, angle, speedMultiplier));
      }
      return arrows;
    }

    // Multi-shot or single arrow
    for (let i = 0; i < arrowCount; i++) {
      const spreadAngle = arrowCount > 1 ? angle + (i - Math.floor(arrowCount / 2)) * 0.3 : angle;
      arrows.push(this.createSingleArrow(player, spreadAngle, speedMultiplier));
    }

    return arrows;
  }

  createSingleArrow(player, angle, speedMultiplier = 1.0) {
    // Add slight randomness to arrow direction
    const randomness = (Math.random() - 0.5) * 0.1; // ±0.05 radians (~3 degrees)
    const finalAngle = angle + randomness;

    // Apply speed multiplier from charge
    const baseSpeed = this.data.arrowSpeed || 250;
    const finalSpeed = baseSpeed * speedMultiplier;

    // Calculate arrow character based on direction
    const arrowChar = this.getArrowCharForAngle(finalAngle);

    // Spawn arrows slightly offset from player center (avoids hitting sapping enemies)
    const spawnOffset = 6;
    const spawnX = player.position.x + player.width / 2 + Math.cos(finalAngle) * spawnOffset;
    const spawnY = player.position.y + player.height / 2 + Math.sin(finalAngle) * spawnOffset;

    return {
      type: 'arrow',
      char: arrowChar,
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
      onHit: this.data.onHit,
      electric: this.data.electric,
      homing: this.data.homing,
      pierce: this.data.pierce,
      split: this.data.split,
      splitCount: this.data.splitCount || 3,
      explode: this.data.explode,
      explodeRadius: this.data.explodeRadius || 35,
      chain: this.data.chain,
      chainCount: this.data.chainCount || 2,
      shooterPlane: player.plane,
      owner: player
    };
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
