import { Enemy } from './Enemy.js';
import { GRID } from '../game/GameConfig.js';

// ─── Tuning constants ─────────────────────────────────────────────────────────
export const ORBIT_RADIUS       = GRID.CELL_SIZE * 4.0;  // exported for renderer
export const HEAD_FLASH_FREQ    = 0.1;                    // seconds per flash cycle (exported)

const ORBIT_SPEED         = 1.8;   // rad/s orbit — normal
const ORBIT_SPEED_BURST   = 0.35;  // rad/s orbit — slowed during burst
const BURST_DURATION      = 5.0;   // seconds of active firing per cycle
const BURST_COOLDOWN      = 5.0;   // seconds pause between cycles
const BURST_SHOT_INTERVAL = 0.09;  // seconds between shots within a burst
const FIRE_PROJ_SPEED     = 140;   // px/s

const HEAD_DATA = {
  char: 'Θ',
  name: 'Turtle Head',
  hp:   1,   // stub — canonical HP lives on TurtleShell
  speed: 0,
  damage: 2,
  attackRange: Infinity,
  aggroRange:  Infinity,
  attackCooldown: 999,
  attackWindup:   0,
  attackType: 'ranged',
  decisionInterval: 0.1,
  color: '#ff8800',
  drops: [],
  affinities: ['fire'],  // auto-immune to fire-affinity effects (burn, fire traps)
};

export class TurtleHead extends Enemy {
  constructor(x, y) {
    super('?', x, y, 0);

    // ── Identity ──────────────────────────────────────────────────────────────
    this.char          = 'Θ';
    this.data          = HEAD_DATA;
    this.hp            = 1;
    this.maxHp         = 1;
    this.speed         = 0;
    this.damage        = HEAD_DATA.damage;
    this.attackRange   = HEAD_DATA.attackRange;
    this.aggroRange    = HEAD_DATA.aggroRange;
    this.color         = HEAD_DATA.color;
    this.baseColor     = HEAD_DATA.color;
    this.isBossEntity              = true;
    this.isBossSideHead            = true;
    this.ignoreBackgroundCollision = true;
    this.hitFlash      = false;
    this.invulnerabilityDuration = 0.3;
    // 2×2 cell hitbox for the larger head
    this.width  = GRID.CELL_SIZE * 2;
    this.height = GRID.CELL_SIZE * 2;

    // ── Link to canonical HP tracker (set by BossSystem after construction) ──
    this.shellRef = null;

    // ── Phase state ───────────────────────────────────────────────────────────
    this.bossPhase  = 1;
    this.state      = 'boss';
    this.enraged    = true;

    // ── Phase 1: head reveal state ────────────────────────────────────────────
    this.headState  = 'retracted';   // 'retracted' | 'extended'
    this.flashTimer = 0;   // ticks while extended, used for pulsing render

    // ── Phase 2: orbit + burst fire wall ─────────────────────────────────────
    this.orbitAngle        = 0;
    this.gapAngle          = Math.random() * Math.PI * 2;
    this.preFireFlashTimer = 0;   // >0 in the 3 frames before each burst
    // Burst state machine: starts in cooldown so there's a brief pause on entry
    this.burstTimer        = 0;          // counts down while burst is active
    this.burstCooldown     = 2.0;        // short grace period before first burst
    this.burstShotTimer    = 0;          // time until next shot within burst

    // ── Pending attacks drained by BossSystem ─────────────────────────────────
    this.pendingBossAttacks = [];

    // Elemental affinity: fire immune, water (wet) weakness, ice neutral
    this.elementalAffinity = {
      immunity:   ['burn'],
      resistance: {},
      weakness:   { 'wet': 2.0 }
    };
  }

  // Fire-affinity: immune to burn (and any future fire-affinity effect); aquatic weakness.
  getElementalModifier(elementType) {
    if (elementType === 'burn' || elementType === 'fire') return 0.0;
    if (elementType === 'wet'  || elementType === 'aquatic') return 2.0;
    return 1.0;
  }

  // ── Core update ───────────────────────────────────────────────────────────
  update(deltaTime) {
    // Tick i-frames
    if (this.invulnerabilityTimer > 0) {
      this.invulnerabilityTimer = Math.max(0, this.invulnerabilityTimer - deltaTime);
      if (this.invulnerabilityTimer === 0) this.hitFlash = false;
    }

    this.dotBlinkTimer += deltaTime;
    const dotDamageEvents = this.updateStatusEffects(deltaTime);

    // Keep physics velocity zeroed
    this.targetVelocity.vx = 0;
    this.targetVelocity.vy = 0;
    this.velocity.vx       = 0;
    this.velocity.vy       = 0;

    if (this.bossPhase === 1) {
      this._updatePhase1(deltaTime);
    } else {
      this._updatePhase2(deltaTime);
    }

    return { dotDamage: dotDamageEvents };
  }

  _updatePhase1(deltaTime) {
    if (this.headState === 'extended') {
      // Flash timer drives the pulsing visual during charge
      this.flashTimer += deltaTime;
      // Head position is managed by BossSystem._updateRedBoss during P1
    }
    // When retracted, head is invisible — no logic needed
  }

  _updatePhase2(deltaTime) {
    if (!this.shellRef) return;

    const isBursting = this.burstTimer > 0;

    // Orbit slows during burst so the stream direction is more predictable
    this.orbitAngle += (isBursting ? ORBIT_SPEED_BURST : ORBIT_SPEED) * deltaTime;

    // Update head position (top-left of 2×2)
    this.position.x = this.shellRef.position.x
                      + Math.cos(this.orbitAngle) * ORBIT_RADIUS - GRID.CELL_SIZE;
    this.position.y = this.shellRef.position.y
                      + Math.sin(this.orbitAngle) * ORBIT_RADIUS - GRID.CELL_SIZE;

    // Tick pre-fire flash
    if (this.preFireFlashTimer > 0) {
      this.preFireFlashTimer = Math.max(0, this.preFireFlashTimer - deltaTime);
    }

    // ── Burst state machine ───────────────────────────────────────────────
    if (this.burstTimer > 0) {
      // Active burst — fire shots at fast interval
      this.burstTimer     -= deltaTime;
      this.burstShotTimer -= deltaTime;
      if (this.burstShotTimer <= 0) {
        this._fireDirectedShot();
        this.burstShotTimer = BURST_SHOT_INTERVAL;
      }
      // Burst expired — enter cooldown
      if (this.burstTimer <= 0) {
        this.burstCooldown = BURST_COOLDOWN;
      }
    } else if (this.burstCooldown > 0) {
      // Cooldown between bursts
      this.burstCooldown -= deltaTime;
      if (this.burstCooldown <= 0) {
        // Flash warning, then start burst
        this.preFireFlashTimer = HEAD_FLASH_FREQ * 4;
        this.burstTimer        = BURST_DURATION;
        this.burstShotTimer    = 0;   // fire immediately on burst start
      }
    }
  }

  // Fire a single projectile outward in the direction the head is currently facing
  _fireDirectedShot() {
    const hcx = this.position.x + GRID.CELL_SIZE;  // head center
    const hcy = this.position.y + GRID.CELL_SIZE;
    this.pendingBossAttacks.push({
      type:        'projectile',
      position:    { x: hcx, y: hcy },
      velocity:    { vx: Math.cos(this.orbitAngle) * FIRE_PROJ_SPEED,
                     vy: Math.sin(this.orbitAngle) * FIRE_PROJ_SPEED },
      damage:      this.damage,
      onHit:       'burn',
      char:        '*',
      color:       '#ff4400',
      reflectable: false,
      reflected:   false,
      owner:       this,
      width:       3,
      height:      3
    });
  }

  // ── Called by BossSystem when shell stops for head reveal ────────────────
  extendHead(chargeTargetAngle) {
    this.headState   = 'extended';
    this.flashTimer  = 0;
    this._extendAngle = chargeTargetAngle;
  }

  retractHead() {
    this.headState = 'retracted';
  }

  // ── Called by BossSystem on phase transition ──────────────────────────────
  transitionToPhase(phase) {
    this.bossPhase = phase;
    if (phase >= 2) {
      this.orbitAngle        = 0;
      this.gapAngle          = Math.random() * Math.PI * 2;
      this.preFireFlashTimer = 0;
      this.burstTimer        = 0;
      this.burstCooldown     = 2.0;   // grace period before first burst after transition
      this.burstShotTimer    = 0;
      this.headState         = 'extended';  // always visible in P2
    }
  }

  // ── Override: damage routes to shell HP ──────────────────────────────────
  takeDamage(amount, attackId = null) {
    if (this.invulnerabilityTimer > 0) return false;
    if (!this.shellRef) return false;

    // Phase 1: only damageable when head is visible
    if (this.bossPhase === 1 && this.headState !== 'extended') return false;

    // Route to shell as the canonical HP tracker
    this.shellRef.takeDamage(amount, 'head');

    // i-frames on the head to prevent rapid-fire spam registering on shell
    this.invulnerabilityTimer = this.invulnerabilityDuration;
    this.lastHitAttackId = attackId;
    this.hitFlash = true;
    return true;
  }
}
