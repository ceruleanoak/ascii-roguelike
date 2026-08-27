import { Enemy } from './Enemy.js';
import { GRID, PHYSICS } from '../game/GameConfig.js';

// ─── Boss tuning constants (all in double-seconds) ───────────────────────────
export const PANDORA_MAX_HP           = 80;
export const PANDORA_PHASE2_HP        = 40;  // 50%

// Phase 1 cycle timings (double-seconds — divide by ENEMY_TIMER_RATE for real)
const SPIN_DURATION_P1   = 1.0;   // 0.5s real — column shift animation
const ATTACK_DURATION_P1 = 10.0;  // 5.0s real — bullet-hell pattern
const LULL_DURATION_P1   = 5.0;   // 2.5s real — offensive window

// Phase 2: all halved
const SPIN_DURATION_P2   = 0.5;
const ATTACK_DURATION_P2 = 5.0;
const LULL_DURATION_P2   = 2.5;

// Attack cadences (double-seconds)
const RED_VOLLEY_INTERVAL   = 1.6;   // 0.8s real between spoke volleys
const GREEN_RING_INTERVAL   = 0.6;   // 0.3s real between revolving rings
const BLUE_PULSE_INTERVAL   = 2.0;   // 1.0s real between center pulses
const YELLOW_STRIKE_INTERVAL = 0.6;  // 0.3s real between lightning strikes

const PROJECTILE_SPEED = 120;  // px/s for boss projectiles

// Affinity rotation order
const AFFINITIES = ['red', 'green', 'blue', 'yellow'];

// Affinity colors
const AFFINITY_COLORS = {
  red:    '#ff3333',
  green:  '#33cc33',
  blue:   '#3388ff',
  yellow: '#ffcc00'
};

// Affinity projectile chars
const AFFINITY_CHARS = {
  red:    '|',
  green:  'o',
  blue:   '*',
  yellow: '~'
};

// ── Rock-paper-scissors damage modifier ───────────────────────────────────────
// Returns the multiplier for a projectile with `projAffinity` hitting the box
// while the box shows `boxAffinity`.
export function affinityDamageMultiplier(projAffinity, boxAffinity) {
  if (!projAffinity || !boxAffinity) return 1;
  if (projAffinity === 'yellow' || boxAffinity === 'yellow') return 1; // yellow opts out
  // Red beats green, green beats blue, blue beats red
  const beats = { red: 'green', green: 'blue', blue: 'red' };
  if (beats[projAffinity] === boxAffinity) return 2;   // +2 damage
  if (beats[boxAffinity] === projAffinity) return 0;   // -2 damage (min 1 applied elsewhere)
  return 1; // same affinity or non-participating
}

const BOSS_DATA = {
  char: '☐',
  name: 'Pandora\'s Box',
  hp:   PANDORA_MAX_HP,
  speed: 0,
  damage: 0,
  attackRange: Infinity,
  aggroRange:  Infinity,
  attackCooldown: 0,
  attackWindup:   0,
  attackType: 'ranged',
  decisionInterval: 0.1,
  color: '#8844ff',
  drops: [],
  affinities: ['cosmic'],
  sfx: { hit: 'glass_hit', death: ['boss_defeat'] }
};

export class PandoraBox extends Enemy {
  constructor(x, y) {
    super('☐', x, y, 0);

    this.char      = '☐';
    this.data      = BOSS_DATA;
    this.hp        = BOSS_DATA.hp;
    this.maxHp     = BOSS_DATA.hp;
    this.speed     = 0;
    this.damage    = 0;
    this.color     = BOSS_DATA.color;
    this.baseColor = BOSS_DATA.color;
    this.isBossEntity     = true;
    this.isBossMiddleHead = true;
    this.invulnerabilityDuration = 0.15;
    this.hitFlash = false;
    this.hasTakenDamage = false;

    // ── Cycle state ───────────────────────────────────────────────────────────
    this.bossPhase     = 1;
    this.cyclePhase    = 'spin';   // 'spin' | 'attack' | 'lull'
    this.cycleTimer    = SPIN_DURATION_P1;
    this.affinityIndex = 0;
    this.currentAffinity = AFFINITIES[0];

    // Spin animation
    this.spinFrame     = 0;       // 0-3 column shift frames
    this.spinFrameTimer = 0;
    const cs = GRID.CELL_SIZE;
    this.spinFrameDuration = SPIN_DURATION_P1 / 4;

    // Attack cadence timers per affinity
    this.attackCadenceTimer = 0;

    // Bounce animation
    this.bounceTimer = 0;
    this.bounceOffset = 0;

    // Lull tracking
    this.lullTimer = 0;

    // ── Attack output – BossSystem drains this each frame ─────────────────────
    this.pendingBossAttacks = [];

    // Always enraged; use a state that won't match normal AI branches
    this.enraged = true;
    this.state   = 'boss';
  }

  takeDamage(amount, attackId = null) {
    const result = super.takeDamage(amount, attackId);
    if (result !== false) { this.hitFlash = true; this.hasTakenDamage = true; }
    return result;
  }

  // ── Core update ────────────────────────────────────────────────────────────
  update(deltaTime) {
    // Tick i-frames
    if (this.invulnerabilityTimer > 0) {
      this.invulnerabilityTimer = Math.max(0, this.invulnerabilityTimer - deltaTime);
      if (this.invulnerabilityTimer === 0) this.hitFlash = false;
    }

    // DOT damage (burn, poison, etc.)
    const dotDamageEvents = this.updateStatusEffects(deltaTime);

    // Bounce animation (continuous)
    this.bounceTimer += deltaTime * 3;
    this.bounceOffset = Math.sin(this.bounceTimer) * 3;

    // Cycle state machine
    this.cycleTimer -= deltaTime;

    if (this.cycleTimer <= 0) {
      this._advanceCycle();
    }

    // Per-phase behavior
    if (this.cyclePhase === 'attack') {
      this._updateAttack(deltaTime);
    }

    return { dotDamage: dotDamageEvents };
  }

  _advanceCycle() {
    switch (this.cyclePhase) {
      case 'spin':
        // Spin complete → start attack phase
        this.cyclePhase = 'attack';
        this.cycleTimer = this.bossPhase === 1 ? ATTACK_DURATION_P1 : ATTACK_DURATION_P2;
        this.attackCadenceTimer = 0;
        this.spinFrame = 0;
        break;

      case 'attack':
        // Attack complete → lull (except after yellow, which cycles immediately)
        if (this.currentAffinity === 'yellow') {
          this._startSpin();
        } else {
          this.cyclePhase = 'lull';
          this.cycleTimer = this.bossPhase === 1 ? LULL_DURATION_P1 : LULL_DURATION_P2;
          this.lullTimer = this.cycleTimer;
        }
        break;

      case 'lull':
        // Lull complete → next spin
        this._startSpin();
        break;
    }
  }

  _startSpin() {
    this.cyclePhase = 'spin';
    this.cycleTimer = this.bossPhase === 1 ? SPIN_DURATION_P1 : SPIN_DURATION_P2;
    this.spinFrame = 0;
    this.spinFrameTimer = 0;
    this.affinityIndex = (this.affinityIndex + 1) % AFFINITIES.length;
    this.currentAffinity = AFFINITIES[this.affinityIndex];
  }

  _updateAttack(deltaTime) {
    this.attackCadenceTimer -= deltaTime;
    if (this.attackCadenceTimer > 0) return;

    switch (this.currentAffinity) {
      case 'red':    this._fireRedSpokes();  this.attackCadenceTimer = RED_VOLLEY_INTERVAL;   break;
      case 'green':  this._fireGreenRings(); this.attackCadenceTimer = GREEN_RING_INTERVAL;   break;
      case 'blue':   this._fireBluePulse();  this.attackCadenceTimer = BLUE_PULSE_INTERVAL;   break;
      case 'yellow': this._fireYellowLightning(); this.attackCadenceTimer = YELLOW_STRIKE_INTERVAL; break;
    }
  }

  // ── Red: Spoke columns alternating odd/even with slight rotation ──────────
  _fireRedSpokes() {
    const useOdd = Math.floor(this.attackCadenceTimer * 3) % 2 === 0;
    const rotationOffset = this.attackCadenceTimer * 0.3; // slight overall rotation

    for (let i = 0; i < 8; i++) {
      const isOdd = i % 2 === 0;
      if (isOdd !== useOdd) continue;

      const angle = (i * Math.PI / 4) + rotationOffset;
      this.pendingBossAttacks.push({
        type: 'projectile',
        position: { x: this.position.x, y: this.position.y },
        velocity: {
          vx: Math.cos(angle) * PROJECTILE_SPEED,
          vy: Math.sin(angle) * PROJECTILE_SPEED
        },
        damage: 2,
        char: AFFINITY_CHARS.red,
        color: AFFINITY_COLORS.red,
        reflectable: false,
        reflected: false,
        owner: this,
        affinity: 'red'
      });
    }
  }

  // ── Green: Multiple circumferences of revolving bullets ───────────────────
  _fireGreenRings() {
    const rings = [0.5, 1.0, 1.5]; // radius multipliers
    const bulletsPerRing = [6, 8, 10];

    for (let r = 0; r < rings.length; r++) {
      const radius = rings[r];
      const count = bulletsPerRing[r];
      const ringAngle = this.attackCadenceTimer * (2 + r); // different rotation speeds

      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2 + ringAngle;
        const speed = PROJECTILE_SPEED * (0.6 + radius * 0.3);
        this.pendingBossAttacks.push({
          type: 'projectile',
          position: { x: this.position.x, y: this.position.y },
          velocity: {
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed
          },
          damage: 2,
          char: AFFINITY_CHARS.green,
          color: AFFINITY_COLORS.green,
          reflectable: false,
          reflected: false,
          owner: this,
          affinity: 'green'
        });
      }
    }
  }

  // ── Blue: Concentric pulses expanding from center ────────────────────────
  _fireBluePulse() {
    const ringCount = 4;
    for (let i = 0; i < ringCount; i++) {
      const angle = (i / ringCount) * Math.PI * 2;
      // Fire in 4 cardinal directions, each ring slightly staggered
      for (const offset of [-0.15, 0, 0.15]) {
        this.pendingBossAttacks.push({
          type: 'projectile',
          position: { x: this.position.x, y: this.position.y },
          velocity: {
            vx: Math.cos(angle + offset) * PROJECTILE_SPEED * 0.8,
            vy: Math.sin(angle + offset) * PROJECTILE_SPEED * 0.8
          },
          damage: 2,
          char: AFFINITY_CHARS.blue,
          color: AFFINITY_COLORS.blue,
          reflectable: false,
          reflected: false,
          owner: this,
          affinity: 'blue',
          delay: i * 0.3 // stagger each ring
        });
      }
    }
  }

  // ── Yellow: Chaotic lightning strikes (high frequency) ───────────────────
  _fireYellowLightning() {
    // Push a "lightning strike" attack that BossSystem/CombatSystem will interpret
    // as a call to LightningStrikeSystem
    this.pendingBossAttacks.push({
      type: 'lightning_strike',
      position: {
        x: this.position.x + (Math.random() - 0.5) * GRID.WIDTH * 0.6,
        y: this.position.y + (Math.random() - 0.5) * GRID.HEIGHT * 0.6
      },
      damage: 4,
      owner: this,
      affinity: 'yellow'
    });
  }

  // ── Phase transition ──────────────────────────────────────────────────────
  transitionToPhase(phase) {
    this.bossPhase = phase;
    this.invulnerabilityTimer = 0.6;
    this.hitFlash = false;
    // Halve all timers for phase 2
    if (phase === 2) {
      this.cycleTimer = Math.min(this.cycleTimer, SPIN_DURATION_P2);
    }
  }

  // True when the boss can take damage
  get vulnerable() {
    return this.invulnerabilityTimer <= 0;
  }

  // ── Rendering helpers (read by BossRenderer) ──────────────────────────────
  get currentFaceColor() {
    return AFFINITY_COLORS[this.currentAffinity] || '#8844ff';
  }

  get spinProgress() {
    // 0-1 progress through the spin animation
    return 1 - (this.cycleTimer / (this.bossPhase === 1 ? SPIN_DURATION_P1 : SPIN_DURATION_P2));
  }

  get isLull() {
    return this.cyclePhase === 'lull';
  }
}
