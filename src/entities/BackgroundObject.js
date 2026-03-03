import { GRID, BACKGROUND_OBJECTS, OBJECT_ANIMATIONS, WATER_COLORS } from '../game/GameConfig.js';
import { ITEMS, INGREDIENTS } from '../data/items.js';

export class BackgroundObject {
  constructor(char, x, y) {
    this.char = char;
    // Handle unknown characters (e.g., item chars in recipe signs)
    // Fallback chain: BACKGROUND_OBJECTS → ITEMS → INGREDIENTS → default
    if (BACKGROUND_OBJECTS[char]) {
      this.data = BACKGROUND_OBJECTS[char];
    } else {
      // For recipe signs: use item/ingredient colors if available
      const itemData = ITEMS[char] || INGREDIENTS[char];
      this.data = {
        name: itemData ? itemData.name : 'Unknown',
        color: itemData ? itemData.color : '#888888',
        solid: false,
        hp: null,
        bulletInteraction: 'passthrough',
        indestructible: true
      };
    }
    this.position = { x, y };
    this.originalChar = char;
    this.color = this.data.color;
    this.destroyed = false;

    this.animationTimer = 0;
    this.currentAnimation = null;
    this.animationOffset = { x: 0, y: 0 };
    this.animationChar = char;
    this.animationColor = this.color;

    this.destroyAfterAnimation = false;

    this.hasCollision = false;

    // Reduce hitbox for ground-level liquids to match ASCII character size
    const isGroundLiquid = char === '=' || char === '~' || char === '!';
    // Circular hitbox for rocks to match round shape
    const isRock = char === '0';
    // Narrow trunk hitbox for trees and stumps (passable but slowing)
    const isTreeOrStump = char === '&' || char === 'Y';

    if (isRock) {
      // Small circular collision (6x12 centered in 16x16 cell)
      this.width = 6;
      this.height = GRID.CELL_SIZE * 0.75;
      this.hitboxOffsetX = 5; // Center the hitbox horizontally
      this.hitboxOffsetY = GRID.CELL_SIZE * 0.125;
    } else if (isGroundLiquid) {
      this.width = GRID.CELL_SIZE * 0.4;
      this.height = GRID.CELL_SIZE * 0.3;
      this.hitboxOffsetX = GRID.CELL_SIZE * 0.25;
      this.hitboxOffsetY = GRID.CELL_SIZE * 0.6;
    } else if (isTreeOrStump) {
      // Narrow trunk hitbox (6x10 centered in 16x16 cell)
      // Used for slowdown detection, not collision (they're passable)
      this.width = 6;
      this.height = 10;
      this.hitboxOffsetX = 5; // Center horizontally
      this.hitboxOffsetY = 3; // Center vertically
    } else {
      // Default: full cell collision
      this.width = GRID.CELL_SIZE;
      this.height = GRID.CELL_SIZE;
      this.hitboxOffsetX = 0;
      this.hitboxOffsetY = 0;
    }

    // Bullet interaction properties
    this.bulletInteraction = this.data.bulletInteraction || 'block';
    this.indestructible = this.data.indestructible || false;
    this.conductivity = this.data.conductivity || 'none';
    this.flammability = this.data.flammability || 'none';
    this.collisionShape = this.data.collisionShape || 'rectangle'; // 'rectangle' or 'ellipse'

    // HP system
    this.maxHp = this.data.hp !== undefined ? this.data.hp : null;
    this.hp = this.maxHp;

    // Fire propagation state
    this.onFire = false;
    this.fireDuration = 0;
    this.fireTimer = 0;

    // Water state (only meaningful when this.char === '~')
    this.waterState = 'normal'; // 'normal' | 'frozen' | 'poisoned' | 'electrified'
    this.waterStateTimer = 0;

    // Drop tracking - prevents duplicate drops from same object
    this.hasDropped = false;

    // Leshy chase event flags (set by RoomGenerator for secret events)
    this.isShaking = false;
    this.leshyBush = false;
    this.shakeTimer = 0;

    // Wand system properties
    this.rock = this.data.rock || false; // Negates magic/elemental effects
    this.electrified = false; // Electrical infusion trap
    this.electrifiedTimer = 0;
  }

  // Called by melee attacks (and can be called by any damage source).
  // Returns { destroyed, effect } where effect is the dropEffect string on kill.
  takeDamage(amount, isBlade = false) {
    // Block damage if already queued for destruction (prevents animation spam)
    if (this.destroyAfterAnimation) {
      return { destroyed: false, effect: null };
    }

    if (this.indestructible || this.hp === null) {
      this._playAnimation('shake');
      return { destroyed: false, effect: null };
    }

    // Grass cutting: blade attacks convert tall grass to cut grass
    if (isBlade && this.data.cuttable && this.data.cutState) {
      this.cutGrass();
      return { destroyed: false, effect: 'cutGrass' };
    }

    this.hp = Math.max(0, this.hp - amount);

    if (this.hp <= 0) {
      this.destroyAfterAnimation = true;
      this._playAnimation('crack');
      return { destroyed: true, effect: this.data.dropEffect || null };
    }

    // Visual damage staging: swap to damagedChar at or below 50% hp
    if (this.data.damagedChar && this.hp / this.maxHp <= 0.5) {
      this.animationChar = this.data.damagedChar;
    }
    this._playAnimation('shake');
    return { destroyed: false, effect: null };
  }

  // Cut grass: transition from tall grass to cut grass
  cutGrass() {
    if (!this.data.cutState) return;

    const cutChar = this.data.cutState;
    this.char = cutChar;
    this.originalChar = cutChar;
    this.data = BACKGROUND_OBJECTS[cutChar];
    this.animationChar = cutChar;
    this.color = this.data.color;
    this.animationColor = this.color;

    // Update object properties from new data
    this.indestructible = this.data.indestructible || false;
    this.hp = null; // Cut grass has no HP
    this.maxHp = null;

    this._playAnimation('cutgrass');
  }

  // Non-destructive interact (used by unarmed players, shrines, water, etc.)
  interact() {
    const interaction = this.data.interactions.default;
    if (!interaction) return { message: null, effect: null, object: this };

    this._playAnimation(interaction.animation);
    return {
      message: interaction.message,
      effect: interaction.effect,
      object: this
    };
  }

  _playAnimation(type) {
    const animData = OBJECT_ANIMATIONS[type];
    if (animData) {
      this.currentAnimation = {
        type,
        data: animData,
        elapsed: 0
      };
    }
  }

  update(deltaTime) {
    // Update fire state
    if (this.onFire) {
      this.fireTimer += deltaTime;
      if (this.fireTimer >= this.fireDuration) {
        this.onFire = false;
        this.fireTimer = 0;

        // Grass becomes burned instead of destroyed
        if (this.char === '|' || this.char === ',') {
          this.burnGrass();
        } else {
          this.destroyed = true;
        }
      }
    }

    // Tick water state timer (skip for lava/damaging liquids and mud beds)
    if (this.char === '~' && this.waterState !== 'normal' && !this.damaging && !this.isDryMud && !this.slowing) {
      this.waterStateTimer -= deltaTime;
      if (this.waterStateTimer <= 0) {
        this.setWaterState('normal', 0);
      }
    }

    // Apply water state color and char (skip for lava/damaging liquids and mud beds)
    if (this.char === '~' && !this.damaging && !this.isDryMud && !this.slowing) {
      if (this.waterState === 'frozen') {
        this.animationChar = '=';
        this.animationColor = WATER_COLORS.frozen;
      } else if (this.waterState === 'electrified') {
        this.animationChar = '~';
        // Blink between yellow and blue at 0.15s interval
        this.electricBlinkTimer = (this.electricBlinkTimer || 0) - deltaTime;
        if (this.electricBlinkTimer <= 0) {
          this.electricBlinkTimer = 0.15;
          this.electricBlinkOn = !this.electricBlinkOn;
        }
        this.animationColor = this.electricBlinkOn ? '#cccc00' : '#3366ff';
      } else {
        this.animationChar = '~';
        this.electricBlinkTimer = 0;
        this.electricBlinkOn = false;
        this.animationColor = WATER_COLORS[this.waterState] || WATER_COLORS.normal;
      }
    }

    // Leshy shaking bush animation (periodic shake every 3-5 seconds)
    if (this.isShaking) {
      this.shakeTimer += deltaTime;
      const shakeInterval = 3 + Math.random() * 2; // 3-5 seconds
      if (this.shakeTimer >= shakeInterval) {
        this._playAnimation('shake');
        this.shakeTimer = 0;
      }
    }

    if (!this.currentAnimation) return;

    this.currentAnimation.elapsed += deltaTime;
    const progress = this.currentAnimation.elapsed / this.currentAnimation.data.duration;

    if (progress >= 1.0) {
      this.currentAnimation = null;
      this.animationOffset = { x: 0, y: 0 };
      // Restore original char only if not damaged
      if (!this.data.damagedChar || this.hp === null || this.hp / this.maxHp > 0.5) {
        this.animationChar = this.originalChar;
      }
      this.animationColor = this.color;

      if (this.destroyAfterAnimation) {
        this.destroyed = true;
      }
      return;
    }

    const frames = this.currentAnimation.data.frames || this.currentAnimation.data.colorFrames;
    if (!frames) return;

    const frameIndex = Math.floor(progress * frames.length);
    const frame = frames[Math.min(frameIndex, frames.length - 1)];

    if (frame && frame.x !== undefined) {
      this.animationOffset.x = frame.x;
      this.animationOffset.y = frame.y;
    }
    if (frame && frame.char !== undefined) {
      this.animationChar = frame.char;
    }
    if (typeof frame === 'string') {
      this.animationColor = frame;
    }
  }

  getHitbox() {
    return {
      x: this.position.x + this.hitboxOffsetX,
      y: this.position.y + this.hitboxOffsetY,
      width: this.width,
      height: this.height
    };
  }

  getRenderPosition() {
    let color = this.onFire ? '#ff4400' : this.animationColor;
    // Water state color override (in case animationColor was reset by animation end)
    // Electrified is excluded: its per-frame blink value lives in animationColor and must not be replaced
    // Damaging liquids (lava) and mud beds excluded: they use their custom colors, not water colors
    if (!this.onFire && this.char === '~' && this.waterState !== 'electrified' && !this.damaging && !this.isDryMud && !this.slowing) {
      color = WATER_COLORS[this.waterState] || WATER_COLORS.normal;
      // Frozen water also overrides the char for the static (non-animating) path
      if (this.waterState === 'frozen' && this.animationChar === this.originalChar) {
        return { x: this.position.x, y: this.position.y, char: '=', color };
      }
    }

    return {
      x: this.position.x,
      y: this.position.y,
      char: this.animationChar,
      color
    };
  }

  // Used by projectiles (bullets/arrows) — keeps existing bullet interaction logic.
  handleBulletCollision(bullet) {
    if (this.indestructible) {
      return {
        bulletBehavior: 'block',
        effect: null,
        shouldDestroyBullet: true,
        message: null
      };
    }

    let animation = 'shake';
    let effect = null;
    let bulletBehavior = this.bulletInteraction;
    let shouldDestroyBullet = false;

    switch (this.bulletInteraction) {
      case 'pass-through':
        shouldDestroyBullet = false;
        animation = 'shake';
        break;

      case 'block':
        shouldDestroyBullet = true;
        animation = 'bounce';
        break;

      case 'interact-destroy': {
        shouldDestroyBullet = true;
        // Route through HP system so bullets respect HP too
        const result = this.takeDamage(1);
        if (result.destroyed) {
          effect = result.effect;
        }
        return { bulletBehavior, effect, shouldDestroyBullet, message: null, object: this };
      }

      case 'interact-preserve':
        shouldDestroyBullet = true;
        animation = 'flash';
        if (this.char === '*') { // Crystal
          effect = 'reflectBullet';
        } else {
          const interaction = this.data.interactions['/'];
          if (interaction) effect = interaction.effect;
        }
        break;

      case 'pass-through-slow':
        shouldDestroyBullet = false;
        bulletBehavior = 'slow';
        animation = 'ripple';
        break;
    }

    this._playAnimation(animation);

    return {
      bulletBehavior,
      effect,
      shouldDestroyBullet,
      message: null,
      object: this
    };
  }

  ignite(duration = 5.0) {
    if (this.flammability === 'none') return false;
    this.onFire = true;
    // Use custom burn duration if defined, otherwise use provided duration
    this.fireDuration = this.data.burnDuration || duration;
    this.fireTimer = 0;
    return true;
  }

  setWaterState(state, duration) {
    if (this.char !== '~') return;
    this.waterState = state;
    this.waterStateTimer = duration;
    // Frozen water loses conductivity so electricity won't chain through ice
    this.conductivity = (state === 'frozen') ? 'none' : 'water';
  }

  getWaterState() { return this.waterState; }

  isWater() { return this.char === '~' && !this.destroyed; }

  isFlammable() {
    return this.flammability !== 'none';
  }

  isConductive() {
    return this.conductivity !== 'none';
  }

  // Burn grass: keep as cut grass but change color to burned
  burnGrass() {
    if (this.char !== '|' && this.char !== ',') return;

    // Convert to cut grass if tall grass
    if (this.char === '|') {
      this.char = ',';
      this.originalChar = ',';
      this.data = BACKGROUND_OBJECTS[','];
    }

    // Set burned color and make non-flammable
    this.color = '#443322';
    this.animationColor = '#443322';
    this.animationChar = ',';
    this.flammability = 'none'; // Burnt grass cannot ignite again
    this.burnt = true; // Mark as burnt for clarity
  }

  // Check if this object blocks vision
  blocksVision() {
    return this.data.blocksVision || false;
  }

  // Check if this object slows movement
  slowsMovement() {
    return this.data.slowing || false;
  }
}
