import { Enemy } from './Enemy.js';
import { GRID } from '../game/GameConfig.js';

// ─── Boss tuning constants ────────────────────────────────────────────────────
export const TURTLE_MAX_HP    = 80;
export const TURTLE_PHASE2_HP = 40;   // 50 % — triggers phase transition

const RICOCHET_SPEED_P1   = 80;    // px/s rolling speed phase 1
const RICOCHET_SPEED_P2   = 130;   // px/s rolling speed phase 2

const ROLL_ANIM_INTERVAL  = 0.08;  // seconds between animation frames
export const ROLL_CHARS   = ['O', 'o', '0', 'Q'];  // exported for renderer

const STOP_INTERVAL_MIN   = 2.5;   // seconds of rolling before head reveal
const STOP_INTERVAL_MAX   = 4.5;
export const CHARGE_DURATION    = 3.0;   // seconds to charge flame blast
export const HEAD_OFFSET        = 3.0;   // cells from shell center to head center (exported for BossSystem/Renderer)
const FLAME_WINDUP        = 1.0;   // seconds of warning before flame stream starts
const FLAME_INTERVAL      = 0.10;  // seconds between flame stream bursts
const FLAME_SPREAD        = Math.PI / 18;  // ±10° flame stream spread
const FLAME_SPEED         = 110;   // px/s — short enough to feel like a stream
const CONE_SHOTS          = 14;
const CONE_HALF_SPREAD    = Math.PI / 5;  // ±36° → 72° final burst
const FIRE_PROJ_SPEED     = 130;   // px/s for final burst projectiles

const SHELL_DATA = {
  char: '@',
  name: 'Ancient Shell',
  hp:   TURTLE_MAX_HP,
  speed: 0,
  damage: 3,
  attackRange: Infinity,
  aggroRange:  Infinity,
  attackCooldown: 999,
  attackWindup:   0,
  attackType: 'ranged',
  decisionInterval: 0.1,
  color: '#8B6914',
  drops: []
};

export class TurtleShell extends Enemy {
  constructor(x, y) {
    super('?', x, y, 0);

    // ── Identity ──────────────────────────────────────────────────────────────
    this.char           = '@';
    this.data           = SHELL_DATA;
    this.hp             = TURTLE_MAX_HP;
    this.maxHp          = TURTLE_MAX_HP;
    this.speed          = 0;
    this.damage         = SHELL_DATA.damage;
    this.attackRange    = SHELL_DATA.attackRange;
    this.aggroRange     = SHELL_DATA.aggroRange;
    this.color          = SHELL_DATA.color;
    this.baseColor      = SHELL_DATA.color;
    this.isBossEntity              = true;
    this.isBossMiddleHead          = true;  // excludes from normal entity render skip in ExploreRenderer
    this.ignoreBackgroundCollision = true;  // rolls through rocks/environment
    this.hitFlash          = false;
    this.hasTakenDamage    = false;
    this.invulnerabilityDuration = 0.15;

    // ── Phase state ───────────────────────────────────────────────────────────
    this.bossPhase = 1;
    this.flipped   = false;
    this.state     = 'boss';
    this.enraged   = true;

    // ── Ricochet physics ──────────────────────────────────────────────────────
    // Launch at a random diagonal
    const angle         = Math.random() * Math.PI * 2;
    this.ricochetVx     = Math.cos(angle) * RICOCHET_SPEED_P1;
    this.ricochetVy     = Math.sin(angle) * RICOCHET_SPEED_P1;

    // ── State machine ─────────────────────────────────────────────────────────
    this.shellState     = 'rolling';  // 'rolling' | 'charging'
    this.stopTimer      = STOP_INTERVAL_MIN + Math.random() * (STOP_INTERVAL_MAX - STOP_INTERVAL_MIN);
    this.chargeTimer    = 0;
    this.chargeTargetAngle = 0;

    // ── Roll animation ────────────────────────────────────────────────────────
    this.rollAnimFrame  = 0;
    this.rollAnimTimer  = 0;

    // ── Signals polled by BossSystem ──────────────────────────────────────────
    this.pendingBossAttacks  = [];
    this.headRevealPending   = false;  // BossSystem: trigger boulder rain + extend head
    this.justFired           = false;  // BossSystem: retract head after cone fires
    this.boulderRainPending  = false;  // kept for head-reveal path, cleared immediately
    this.ricochetPending     = null;   // BossSystem (phase 2): { x, y, nx, ny } wall bounce

    // ── Flamethrower stream timer (phase 1 charge) ────────────────────────────
    this.flameStreamTimer = 0;
  }

  // ── Core update (replaces Enemy AI) ──────────────────────────────────────
  update(deltaTime) {
    // Tick i-frames
    if (this.invulnerabilityTimer > 0) {
      this.invulnerabilityTimer = Math.max(0, this.invulnerabilityTimer - deltaTime);
      if (this.invulnerabilityTimer === 0) this.hitFlash = false;
    }

    // Standard DOT/status timers
    this.dotBlinkTimer += deltaTime;
    const dotDamageEvents = this.updateStatusEffects(deltaTime);

    // Keep physics velocity zeroed so PhysicsSystem doesn't add unwanted movement
    this.targetVelocity.vx = 0;
    this.targetVelocity.vy = 0;
    this.velocity.vx       = 0;
    this.velocity.vy       = 0;

    // State machine dispatch
    if (this.shellState === 'rolling') {
      this._updateRolling(deltaTime);
    } else {
      this._updateCharging(deltaTime);
    }

    return { dotDamage: dotDamageEvents };
  }

  _updateRolling(deltaTime) {
    // Bounce bounds: position.x/y treated as visual body center.
    // Body extends ±2 cells horizontally, ±0.5 cells vertically.
    const cs   = GRID.CELL_SIZE;
    const minX = cs * 3;
    const maxX = GRID.WIDTH  - cs * 3;
    const minY = cs * 2;
    const maxY = GRID.HEIGHT - cs * 2;

    // Move
    this.position.x += this.ricochetVx * deltaTime;
    this.position.y += this.ricochetVy * deltaTime;

    // Bounce
    let bounced = false;
    if (this.position.x <= minX) { this.position.x = minX; this.ricochetVx =  Math.abs(this.ricochetVx); bounced = true; }
    if (this.position.x >= maxX) { this.position.x = maxX; this.ricochetVx = -Math.abs(this.ricochetVx); bounced = true; }
    if (this.position.y <= minY) { this.position.y = minY; this.ricochetVy =  Math.abs(this.ricochetVy); bounced = true; }
    if (this.position.y >= maxY) { this.position.y = maxY; this.ricochetVy = -Math.abs(this.ricochetVy); bounced = true; }
    // Phase 2: post-bounce velocity already points into the room — use it directly
    if (bounced && this.bossPhase >= 2) {
      this.ricochetPending = { x: this.position.x, y: this.position.y, vx: this.ricochetVx, vy: this.ricochetVy };
    }

    // Roll animation
    this.rollAnimTimer += deltaTime;
    if (this.rollAnimTimer >= ROLL_ANIM_INTERVAL) {
      this.rollAnimTimer  = 0;
      this.rollAnimFrame  = (this.rollAnimFrame + 1) % ROLL_CHARS.length;
    }

    // Countdown to head reveal (phase 1 only)
    if (this.bossPhase === 1) {
      this.stopTimer -= deltaTime;
      if (this.stopTimer <= 0) {
        // Capture target angle at the moment of stopping
        if (this.target) {
          const dx = this.target.position.x - this.position.x;
          const dy = this.target.position.y - this.position.y;
          this.chargeTargetAngle = Math.atan2(dy, dx);
        }
        // Come to a stop
        this.ricochetVx = 0;
        this.ricochetVy = 0;
        this.chargeTimer       = 0;
        this.shellState        = 'charging';
        this.headRevealPending = true;
      }
    }
  }

  _updateCharging(deltaTime) {
    this.chargeTimer += deltaTime;

    // Continuous flame stream after windup
    if (this.chargeTimer >= FLAME_WINDUP) {
      this.flameStreamTimer -= deltaTime;
      if (this.flameStreamTimer <= 0) {
        this._fireFlameStream();
        this.flameStreamTimer = FLAME_INTERVAL;
      }
    }

    if (this.chargeTimer >= CHARGE_DURATION) {
      // Stream ends — no missile burst; just stop and re-roll
      this.flameStreamTimer = 0;

      // Reset stop timer for next roll cycle
      this.stopTimer = STOP_INTERVAL_MIN + Math.random() * (STOP_INTERVAL_MAX - STOP_INTERVAL_MIN);

      // Re-launch in a random direction
      const speed = this.bossPhase >= 2 ? RICOCHET_SPEED_P2 : RICOCHET_SPEED_P1;
      const angle = Math.random() * Math.PI * 2;
      this.ricochetVx = Math.cos(angle) * speed;
      this.ricochetVy = Math.sin(angle) * speed;

      this.shellState = 'rolling';
      this.justFired  = true;
    }
  }

  // Continuous narrow-spread flame stream during charge — spawns from head center
  _fireFlameStream() {
    const headDist = HEAD_OFFSET * GRID.CELL_SIZE;
    const originX  = this.position.x + Math.cos(this.chargeTargetAngle) * headDist;
    const originY  = this.position.y + Math.sin(this.chargeTargetAngle) * headDist;
    for (let i = 0; i < 2; i++) {
      const spread = (Math.random() - 0.5) * 2 * FLAME_SPREAD;
      const angle  = this.chargeTargetAngle + spread;
      this.pendingBossAttacks.push({
        type:        'projectile',
        position:    { x: originX, y: originY },
        velocity:    { vx: Math.cos(angle) * FLAME_SPEED, vy: Math.sin(angle) * FLAME_SPEED },
        damage:      1,
        onHit:       'burn',
        char:        '*',
        color:       Math.random() > 0.5 ? '#ff4400' : '#ff8800',
        reflectable: false,
        reflected:   false,
        owner:       this,
        width:       2,
        height:      2
      });
    }
  }

  _fireCone() {
    // Final burst spawns from head center, same as stream
    const headDist = HEAD_OFFSET * GRID.CELL_SIZE;
    const originX  = this.position.x + Math.cos(this.chargeTargetAngle) * headDist;
    const originY  = this.position.y + Math.sin(this.chargeTargetAngle) * headDist;
    for (let i = 0; i < CONE_SHOTS; i++) {
      const t     = i / (CONE_SHOTS - 1);
      const angle = this.chargeTargetAngle - CONE_HALF_SPREAD + t * CONE_HALF_SPREAD * 2;
      this.pendingBossAttacks.push({
        type:        'projectile',
        position:    { x: originX, y: originY },
        velocity:    { vx: Math.cos(angle) * FIRE_PROJ_SPEED,
                       vy: Math.sin(angle) * FIRE_PROJ_SPEED },
        damage:      this.damage,
        onHit:       'burn',
        char:        '*',
        color:       '#ff6600',
        reflectable: false,
        reflected:   false,
        owner:       this,
        width:       3,
        height:      3
      });
    }
  }

  // Called by BossSystem when HP crosses TURTLE_PHASE2_HP
  transitionToPhase(phase) {
    this.bossPhase = phase;
    this.flipped   = true;

    // Scale ricochet up to phase 2 speed (preserving direction)
    const mag = Math.sqrt(this.ricochetVx ** 2 + this.ricochetVy ** 2) || 1;
    this.ricochetVx = (this.ricochetVx / mag) * RICOCHET_SPEED_P2;
    this.ricochetVy = (this.ricochetVy / mag) * RICOCHET_SPEED_P2;

    // If stopped mid-charge, launch in random direction at P2 speed
    if (this.ricochetVx === 0 && this.ricochetVy === 0) {
      const a = Math.random() * Math.PI * 2;
      this.ricochetVx = Math.cos(a) * RICOCHET_SPEED_P2;
      this.ricochetVy = Math.sin(a) * RICOCHET_SPEED_P2;
    }

    // Flesh-colored — whole body is now vulnerable in P2
    this.color             = '#ffaa66';
    this.boulderRainTimer  = P2_BOULDER_INTERVAL;
    this.invulnerabilityTimer = 0.6;
    this.hitFlash          = false;
  }

  // P1: immune to direct hits — only head damage routes through.
  // P2: whole body exposed (flipped over), accepts direct hits too.
  takeDamage(amount, source) {
    if (source !== 'head' && this.bossPhase < 2) return false;
    if (this.invulnerabilityTimer > 0) return false;
    this.hp = Math.max(0, this.hp - amount);
    this.invulnerabilityTimer = this.invulnerabilityDuration;
    this.hitFlash = true;
    this.hasTakenDamage = true;
    return true;
  }

  get vulnerable() {
    return this.invulnerabilityTimer <= 0;
  }
}
