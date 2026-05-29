import { Enemy } from './Enemy.js';
import { GRID } from '../game/GameConfig.js';

// ─── Boss tuning constants ───────────────────────────────────────────────────
export const GOO_DRAGON_MAX_HP  = 60;
export const PHASE2_HP_THRESHOLD = 40; // 66 %
export const PHASE3_HP_THRESHOLD = 20; // 33 %

const BURST_COOLDOWN_P1    = 3.5;   // seconds between cone bursts (phases 1–2)
const BURST_COOLDOWN_P3    = 2.5;   // faster in phase 3
const SPRAY_COOLDOWN       = 2.5;   // goo-spray cooldown (phase 2 only)
const PROJECTILE_SPEED     = 120;   // px/s for cone burst
const SPRAY_SPEED          = PROJECTILE_SPEED * 3;   // px/s for targeted spray
const SPRAY_DECEL          = 2.2;   // deceleration for spray blobs (px/s²)
const REFLECTABLE_CHANCE   = 0.15;  // 1 in 10 burst shots is reflectable

const CONE_SHOTS       = 5;               // projectiles per cone burst
const CONE_HALF_SPREAD = Math.PI / 5;     // ±36° (72° total cone)


const FLOAT_RADIUS = GRID.CELL_SIZE * 1.5;  // hover amplitude
const FLOAT_SPEED  = 0.55;                   // hover cycle (rad/s)

const BOSS_DATA = {
  char: 'Ω',
  name: 'Goo Dragon',
  hp:   GOO_DRAGON_MAX_HP,
  speed: 20,
  damage: 3,
  attackRange: Infinity,
  aggroRange:  Infinity,
  attackCooldown: BURST_COOLDOWN_P1,
  attackWindup:   0.4,
  attackType: 'ranged',
  decisionInterval: 0.1,
  color: '#22cc44',
  drops: [],
  affinities: ['goo'],
  sfx: { hit: 'goo_hit', death: ['goo_death_1', 'goo_death_2'] }
};

export class GooDragon extends Enemy {
  constructor(x, y) {
    super('?', x, y, 0); // dummy char; we override everything below

    // ── Identity ──────────────────────────────────────────────────────────────
    this.char      = 'Ω';
    this.data      = BOSS_DATA;
    this.hp        = BOSS_DATA.hp;
    this.maxHp     = BOSS_DATA.hp;
    this.speed     = BOSS_DATA.speed;
    this.damage    = BOSS_DATA.damage;
    this.attackRange  = BOSS_DATA.attackRange;
    this.aggroRange   = BOSS_DATA.aggroRange;
    this.attackCooldown = BURST_COOLDOWN_P1;
    this.color     = BOSS_DATA.color;
    this.baseColor = BOSS_DATA.color;
    this.isBossMiddleHead = true;
    this.isBossEntity     = true;
    this.invulnerabilityDuration = 0.15; // halved from default 0.3
    this.hitFlash = false; // true only when iframes were triggered by player damage
    this.hasTakenDamage = false;

    // ── Stun state (set by BossSystem on reflected projectile hit) ────────────
    this.bossStunTimer = 0;

    // ── Phase state ───────────────────────────────────────────────────────────
    this.bossPhase          = 1;
    this.p2AttackToggle     = false; // false = burst, true = spray
    this.reflectableChance  = REFLECTABLE_CHANCE;

    // ── Hover movement ────────────────────────────────────────────────────────
    this.floatTimer   = Math.random() * Math.PI * 2;
    this.floatCenterX = x;
    this.floatCenterY = y;

    // ── Attack output – BossSystem drains this each frame ─────────────────────
    this.pendingBossAttacks = [];
    this.mouthOpenTimer = 0; // brief open-mouth flash when firing

    // Always enraged; use a state that won't match normal AI branches
    this.enraged = true;
    this.state   = 'boss';
  }

  // Override takeDamage to track hit-triggered iframes separately from phase-transition iframes
  takeDamage(amount, attackId = null) {
    const result = super.takeDamage(amount, attackId);
    if (result !== false) { this.hitFlash = true; this.hasTakenDamage = true; }
    return result;
  }

  // ── Core update (replaces Enemy AI; reuses timer helpers) ─────────────────
  update(deltaTime) {
    // Always tick i-frames so hits during stun don't permanently block damage
    if (this.invulnerabilityTimer > 0) {
      this.invulnerabilityTimer = Math.max(0, this.invulnerabilityTimer - deltaTime);
      if (this.invulnerabilityTimer === 0) this.hitFlash = false;
    }

    // Stun: freeze all AI, decelerate to stop
    if (this.bossStunTimer > 0) {
      this.bossStunTimer = Math.max(0, this.bossStunTimer - deltaTime);
      this.targetVelocity.vx = 0;
      this.targetVelocity.vy = 0;
      this._blendVelocity(deltaTime);
      return { dotDamage: [] };
    }
    // DOT / detection indicator timers
    this.dotBlinkTimer += deltaTime;
    if (this.detectionIndicatorTimer > 0) {
      this.detectionIndicatorTimer = Math.max(0, this.detectionIndicatorTimer - deltaTime);
    }

    const dotDamageEvents = this.updateStatusEffects(deltaTime);

    if (!this.isKnockedBack()) {
      this._blendVelocity(deltaTime);
    }

    if (this.attackTimer > 0) {
      this.attackTimer -= deltaTime;
    }
    if (this.mouthOpenTimer > 0) {
      this.mouthOpenTimer = Math.max(0, this.mouthOpenTimer - deltaTime);
    }

    // Phase 3: float center drifts toward the player
    if (this.bossPhase === 3 && this.target) {
      const dx = this.target.position.x - this.floatCenterX;
      const dy = this.target.position.y - this.floatCenterY;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const drift = 5.6; // px/s — mild pursuit
      this.floatCenterX += (dx / dist) * drift * deltaTime;
      this.floatCenterY += (dy / dist) * drift * deltaTime;
    }

    // Organic hover around a point 2 cells toward the player from body center
    let headAnchorX = this.floatCenterX;
    let headAnchorY = this.floatCenterY;
    if (this.target) {
      const dx = this.target.position.x - this.floatCenterX;
      const dy = this.target.position.y - this.floatCenterY;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      headAnchorX = this.floatCenterX + (dx / dist) * GRID.CELL_SIZE * 2;
      headAnchorY = this.floatCenterY + (dy / dist) * GRID.CELL_SIZE * 2;
    }
    this.floatTimer += deltaTime * FLOAT_SPEED;
    this.position.x = headAnchorX + Math.cos(this.floatTimer) * FLOAT_RADIUS;
    this.position.y = headAnchorY + Math.sin(this.floatTimer * 0.7) * FLOAT_RADIUS;

    // Generate attacks when timer allows
    if (this.target && this.attackTimer <= 0) {
      this._generateAttack();
    }

    return { dotDamage: dotDamageEvents };
  }

  _generateAttack() {
    if (this.bossPhase === 1) {
      this._fireBurst();
      this.attackTimer = BURST_COOLDOWN_P1;

    } else if (this.bossPhase === 2) {
      if (!this.p2AttackToggle) {
        this._fireBurst();
        this.attackTimer = BURST_COOLDOWN_P1;
      } else {
        this._fireSpray();
        this.attackTimer = SPRAY_COOLDOWN;
      }
      this.p2AttackToggle = !this.p2AttackToggle;

    } else { // phase 3
      this._fireBurst();
      this.attackTimer = BURST_COOLDOWN_P3;
    }
  }

  _fireBurst() {
    if (!this.target) return;
    this.mouthOpenTimer = 0.5;
    const dx = this.target.position.x - this.position.x;
    const dy = this.target.position.y - this.position.y;
    const baseAngle = Math.atan2(dy, dx);

    for (let i = 0; i < CONE_SHOTS; i++) {
      const t = i / (CONE_SHOTS - 1);
      const angle = baseAngle - CONE_HALF_SPREAD + t * CONE_HALF_SPREAD * 2;
      const isReflectable = Math.random() < this.reflectableChance;
      this.pendingBossAttacks.push({
        type: 'projectile',
        position: { x: this.position.x, y: this.position.y },
        velocity: {
          vx: Math.cos(angle) * PROJECTILE_SPEED,
          vy: Math.sin(angle) * PROJECTILE_SPEED
        },
        damage:      this.damage,
        char:        isReflectable ? '●' : 'o',
        color:       isReflectable ? '#ffee00' : '#cc2200',
        reflectable: isReflectable,
        reflected:   false,
        owner:       this,
        width:       2,
        height:      2
      });
    }
  }

  _fireSpray() {
    if (!this.target) return;
    this.mouthOpenTimer = 0.5;
    const dx = this.target.position.x - this.position.x;
    const dy = this.target.position.y - this.position.y;
    const baseAngle = Math.atan2(dy, dx);

    for (const spread of [-0.15, 0, 0.15]) {
      const angle = baseAngle + spread;
      this.pendingBossAttacks.push({
        type: 'gooBlob',
        position: { x: this.position.x, y: this.position.y },
        velocity: {
          vx: Math.cos(angle) * SPRAY_SPEED,
          vy: Math.sin(angle) * SPRAY_SPEED
        },
        damage:      0,
        decel:       SPRAY_DECEL,
        char:        'o',
        color:       '#00ff00',
        reflectable: false,
        reflected:   false,
        owner:       this,
        width:       GRID.CELL_SIZE * 0.4,
        height:      GRID.CELL_SIZE * 0.4
      });
    }
  }

  // Called by BossSystem on each phase transition
  transitionToPhase(phase) {
    this.bossPhase        = phase;
    this.p2AttackToggle   = false;
    if (phase >= 2) {
      this.reflectableChance = REFLECTABLE_CHANCE * 2;
    }
    // Brief invulnerability window during transition animation (not damage-triggered)
    this.invulnerabilityTimer = 0.6;
    this.hitFlash = false;
  }

  // True when the boss can take damage (no active i-frames)
  get vulnerable() {
    return this.invulnerabilityTimer <= 0;
  }
}
