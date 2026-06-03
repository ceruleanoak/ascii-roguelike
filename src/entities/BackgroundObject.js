import { GRID, BACKGROUND_OBJECTS, BACKGROUND_OBJECT_VARIANTS, OBJECT_ANIMATIONS, WATER_COLORS } from '../game/GameConfig.js';
import { ITEMS, INGREDIENTS } from '../data/items.js';

export class BackgroundObject {
  constructor(char, x, y, options = {}) {
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
        bulletInteraction: 'pass-through',
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

    // Special-case hitboxes for certain char types, then fall through to
    // data-driven hitbox (from BACKGROUND_OBJECTS), then to the render-size default.
    const isGroundLiquid = char === '=' || char === '~' || char === '!';
    const isRock = char === '0';
    const isTreeOrStump = char === '&' || char === 'Y';

    if (isRock) {
      // Narrow elliptical collision — rock is round, not square.
      // collisionShape: 'ellipse' is set in data; semi-axes a=3 b=6.
      this.width = 6;
      this.height = GRID.CELL_SIZE * 0.75;   // 12px
      this.hitboxOffsetX = 5;                // centers 6px box in 16px cell
      this.hitboxOffsetY = GRID.CELL_SIZE * 0.125; // 2px
    } else if (isGroundLiquid) {
      // Ground-level contact region — lower third of cell, centered horizontally.
      // Gives the illusion that the liquid/fire sits on the floor plane.
      this.width = GRID.CELL_SIZE * 0.4;     // 6px
      this.height = GRID.CELL_SIZE * 0.3;    // 5px
      this.hitboxOffsetX = GRID.CELL_SIZE * 0.25; // 4px
      this.hitboxOffsetY = GRID.CELL_SIZE * 0.6;  // 10px (bottom third)
    } else if (isTreeOrStump) {
      // Narrow trunk hitbox — used only for slowdown overlap, not solid blocking.
      this.width = 6;
      this.height = 10;
      this.hitboxOffsetX = 5;
      this.hitboxOffsetY = 3;
    } else if (this.data.hitbox) {
      // Data-driven hitbox: BACKGROUND_OBJECTS entries can declare
      //   hitbox: { w: <widthFraction>, h: <heightFraction> }
      // Offsets are auto-calculated to center the box inside the cell.
      const hb = this.data.hitbox;
      this.width  = Math.round(GRID.CELL_SIZE * hb.w);
      this.height = Math.round(GRID.CELL_SIZE * hb.h);
      this.hitboxOffsetX = Math.floor((GRID.CELL_SIZE - this.width)  / 2);
      this.hitboxOffsetY = Math.floor((GRID.CELL_SIZE - this.height) / 2);
    } else {
      // Default: mirror the rendered glyph footprint.
      // Unifont at 16px renders ASCII glyphs ~8px wide × ~12px tall, centered
      // in the 16×16 cell.  Full-cell collision creates invisible walls; this
      // keeps the collision box flush with what the player actually sees.
      this.width  = Math.round(GRID.CELL_SIZE * 0.5);   // 8px
      this.height = Math.round(GRID.CELL_SIZE * 0.75);  // 12px
      this.hitboxOffsetX = Math.floor((GRID.CELL_SIZE - this.width)  / 2); // 4px
      this.hitboxOffsetY = Math.floor((GRID.CELL_SIZE - this.height) / 2); // 2px
    }

    // Bullet interaction properties
    this.bulletInteraction = this.data.bulletInteraction || 'block';
    this.indestructible = this.data.indestructible || false;
    this.conductivity = this.data.conductivity || 'none';
    this.flammability = this.data.flammability || 'none';

    // Interaction-type enum (see INTERACTION_TYPES in GameConfig). Default
    // omits 'spacebar' so trees/rocks keep harvest-only semantics — only
    // containers opt in to direct player opening.
    this.acceptsInteractions = this.data.acceptsInteractions || ['blade', 'bullet', 'blunt'];

    // Variant identity — decouples behavior from render char
    this.typeId = options.typeId || null;
    this._variantData = null;
    if (this.typeId) {
      const base = BACKGROUND_OBJECT_VARIANTS[this.typeId];
      this._variantData = options.variantOverrides
        ? { ...base, ...options.variantOverrides }
        : base || null;
    }
    this.collisionShape = this.data.collisionShape || 'rectangle'; // 'rectangle' or 'ellipse'

    // HP system
    this.maxHp = this.data.hp !== undefined ? this.data.hp : null;
    this.hp = this.maxHp;

    // Fire propagation state
    this.onFire = false;
    this.fireDuration = 0;
    this.fireTimer = 0;

    // Water state (only meaningful when this.char === '~')
    this.waterState = 'normal'; // 'normal' | 'frozen' | 'poisoned' | 'electrified' | 'crystallized'
    this.waterStateTimer = 0;

    // Drop tracking - prevents duplicate drops from same object
    this.hasDropped = false;

    // Leshy chase event flags (set by RoomGenerator for secret events)
    this.isShaking = false;
    this.leshyBush = false;
    this.fairyGrass = false;
    this.shakeTimer = 0;

    // Wand system properties
    this.rock = this.data.rock || false; // Negates magic/elemental effects
    this.electrified = false; // Electrical infusion trap
    this.electrifiedTimer = 0;

    // Fields that were previously lazy-initialized at runtime; declared here to avoid
    // undefined-vs-false ambiguity and to satisfy the constructor-completeness requirement.
    this.isCampfire = false;        // Set by RoomGenerator for campfire objects
    this._flickerTimer = 0;         // Campfire flicker countdown
    this.fountainWater = false;     // F-room water tile — drives shimmer cycle
    this.fountainWaterfall = false; // F-room waterfall tile — drives downward char cycle
    this._fountainShimmerTimer = 0;
    this._fountainWaterfallTimer = 0;
    this._fountainWaterfallPhase = Math.floor(Math.random() * 4);
    this.electricBlinkTimer = 0;    // Electrified water blink interval timer
    this.electricBlinkOn = false;   // Electrified water blink state
    this.burnt = false;             // Set by burnGrass() after fire burns out
    this.damaging = false;          // Set by RoomGenerator for lava tiles
    this.isDryMud = false;          // Set by PhysicsSystem for drying mud tiles
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

    // Puzzle-signal glitter objects (dungeon glitter_object unlock condition):
    // never destroyed; each hit pulses glitterHit for the lock-condition poll.
    // Distinct from K-room key glitter which IS destroyable (drops a key on death).
    if (this.puzzleSignal) {
      this.glitterHit = true;
      this._playAnimation('shake');
      return { destroyed: false, effect: 'glitterHit' };
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
    this.bulletInteraction = this.data.bulletInteraction || 'block';
    this.hp = null; // Cut grass has no HP
    this.maxHp = null;

    this._playAnimation('cutgrass');
  }

  acceptsInteraction(type) {
    return this.acceptsInteractions.includes('all') || this.acceptsInteractions.includes(type);
  }

  // Non-destructive interact (used by unarmed players, shrines, water, etc.)
  interact() {
    const interaction = this.data?.interactions?.default;
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

    // Tick water state timer (water only)
    if (this.char === '~' && this.waterState !== 'normal' && this.isWater()) {
      this.waterStateTimer -= deltaTime;
      if (this.waterStateTimer <= 0) {
        this.setWaterState('normal', 0);
      }
    }

    // Apply water state color and char (water only)
    if (this.char === '~' && this.isWater()) {
      if (this.waterState === 'frozen') {
        this.animationChar = '=';
        this.animationColor = WATER_COLORS.frozen;
      } else if (this.waterState === 'crystallized') {
        this.animationChar = '◇';
        this.animationColor = WATER_COLORS.crystallized;
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

    // Fountain water shimmer — cycle through wave chars per-tile.
    // Skipped while corrupted/elemental-affected so the underlying state-color shows through.
    if (this.fountainWater && this.waterState === 'normal' && !this.onFire) {
      this._fountainShimmerTimer -= deltaTime;
      if (this._fountainShimmerTimer <= 0) {
        this._fountainShimmerTimer = 0.10 + Math.random() * 0.08;
        const shimmer = ['~', '≈', '˜', '~'];
        this.animationChar = shimmer[Math.floor(Math.random() * shimmer.length)];
      }
    }

    // Fountain waterfall — downward-cycling char animation
    if (this.fountainWaterfall) {
      this._fountainWaterfallTimer -= deltaTime;
      if (this._fountainWaterfallTimer <= 0) {
        this._fountainWaterfallTimer = 0.10;
        const cycle = ['│', '┃', '╿', '╽'];
        this._fountainWaterfallPhase = (this._fountainWaterfallPhase + 1) % cycle.length;
        this.animationChar = cycle[this._fountainWaterfallPhase];
      }
    }

    // Campfire flicker — cycle through flame chars + warm-color jitter
    if (this.isCampfire) {
      this._flickerTimer = (this._flickerTimer || 0) - deltaTime;
      if (this._flickerTimer <= 0) {
        this._flickerTimer = 0.08 + Math.random() * 0.1;
        const chars = ['!', '*', '^', 'i'];
        const colors = ['#ff8822', '#ffaa33', '#ffcc44', '#ff6611'];
        this.animationChar = chars[Math.floor(Math.random() * chars.length)];
        this.animationColor = colors[Math.floor(Math.random() * colors.length)];
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
    if (!this.onFire && this.isWater() && this.waterState !== 'electrified') {
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
    // Arrows pass through grass with slight speed decay — grass is not destroyed
    if (bullet.type === 'arrow' && (this.char === '|' || this.char === ',')) {
      this._playAnimation('shake');
      return {
        bulletBehavior: 'slow',
        speedMultiplier: 0.95,
        shouldDestroyBullet: false,
        effect: null,
        message: null,
        object: this
      };
    }

    // Rocks are nigh-indestructible — bullets ricochet with halved remaining range;
    // arrows simply stop. Neither drops M ingredient (only pickaxe/hammer melee can).
    if (this.char === '0') {
      this._playAnimation('bounce');
      if (bullet.type === 'bullet') {
        return {
          bulletBehavior: 'rockRicochet',
          effect: null,
          shouldDestroyBullet: false,
          message: null,
          object: this
        };
      }
      return {
        bulletBehavior: 'block',
        effect: null,
        shouldDestroyBullet: true,
        message: null,
        object: this
      };
    }

    // Pass-through and pass-through-slow always win, even for indestructible objects
    if (this.bulletInteraction === 'pass-through' || this.bulletInteraction === 'pass-through-slow') {
      // fall through to switch below
    } else if (this.indestructible) {
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
    if (this.onFire) return true; // Already burning — don't reset the timer
    this.onFire = true;
    // Use custom burn duration if defined, otherwise use provided duration
    this.fireDuration = this.data.burnDuration || duration;
    this.fireTimer = 0;
    return true;
  }

  isWater() {
    if (this.destroyed) return false;
    if (this.typeId) return this.typeId === 'water';
    // Legacy: '~' without typeId defaults to water if not lava/mud
    return this.char === '~' && !this.damaging && !this.isDryMud
        && !(this.slowing === true);
  }

  isLava() {
    if (this.destroyed) return false;
    if (this.typeId) return this.typeId === 'lava';
    return this.char === '~' && !!this.damaging;
  }

  // Transform this lava tile into a rock in-place (water quenches lava)
  solidifyToRock() {
    if (!this.isLava()) return;
    this.char = '0';
    this.originalChar = '0';
    this.typeId = null;
    this._variantData = null;
    this.data = BACKGROUND_OBJECTS['0'];
    this.color = '#888888';
    this.animationColor = '#888888';
    this.animationChar = '0';
    this.bulletInteraction = this.data.bulletInteraction || 'interact-preserve';
    this.indestructible = false;
    this.conductivity = 'none';
    this.flammability = 'none';
    this.collisionShape = 'ellipse';
    this.maxHp = 3;
    this.hp = 3;
    // Update hitbox to match rock collision (narrow ellipse, same as constructor)
    this.width = 6;
    this.height = GRID.CELL_SIZE * 0.75;
    this.hitboxOffsetX = 5;
    this.hitboxOffsetY = GRID.CELL_SIZE * 0.125;
  }

  isMud() {
    if (this.destroyed) return false;
    if (this.typeId) return this.typeId === 'mud_dry' || this.typeId === 'mud_wet';
    return this.char === '~' && (!!this.isDryMud || this.slowing === true);
  }

  // Used by CombatSystem to decide whether fire should suppress impact effects
  // and produce steam instead
  steamOnFire() {
    if (this._variantData) return !!this._variantData.steamOnFire;
    return this.isWater(); // legacy
  }

  setWaterState(state, duration) {
    if (!this.isWater()) return; // Only real water supports water states
    this.waterState = state;
    this.waterStateTimer = duration;
    // conductivity handled by isConductive() checking waterState — no mutation needed
  }

  getWaterState() { return this.waterState; }

  isFlammable() {
    return this.flammability !== 'none';
  }

  isConductive() {
    if (this._variantData) {
      if (this._variantData.conductivity === 'none') return false;
      if (this.waterState === 'frozen') return false;
      return true;
    }
    // Legacy: frozen water loses conductivity
    if (this.char === '~' && this.waterState === 'frozen') return false;
    return this.conductivity !== 'none';
  }

  static createVariant(typeId, x, y, variantOverrides = {}) {
    const base = BACKGROUND_OBJECT_VARIANTS[typeId];
    if (!base) {
      console.warn(`BackgroundObject.createVariant: unknown typeId '${typeId}'`);
      return new BackgroundObject('~', x, y);
    }
    const obj = new BackgroundObject(base.char, x, y, {
      typeId,
      variantOverrides: Object.keys(variantOverrides).length ? variantOverrides : undefined
    });
    // Apply any color override to both color slots
    if (variantOverrides.color) {
      obj.color = variantOverrides.color;
      obj.animationColor = variantOverrides.color;
    } else {
      obj.color = base.color;
      obj.animationColor = base.color;
    }
    return obj;
  }

  // Burn grass: keep as cut grass but change color to burned
  burnGrass() {
    if (this.char !== '|' && this.char !== ',') return;

    // Convert to cut grass if tall grass
    if (this.char === '|') {
      this.char = ',';
      this.originalChar = ',';
      this.data = BACKGROUND_OBJECTS[','];
      this.bulletInteraction = this.data.bulletInteraction || 'block';
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
