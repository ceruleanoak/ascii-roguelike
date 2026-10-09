import { Enemy } from './Enemy.js';
import { GRID, PHYSICS } from '../game/GameConfig.js';

/**
 * The Storm Eye (⛯) — the yellow zone Boss (GLOSSARY: Storm Eye).
 *
 * A Kracko-style eye at the heart of a living storm. Every cycle it draws a
 * Storm Form at random (never the same one twice running) and plays it out:
 *
 *   windup  the mood: a long, readable tell — the glyph's own motion around
 *           its root says which form is coming while the Wind Field ramps up
 *   attack  the channel: the glyph turns ⛭ (pupil gone white), the form
 *           fires, and the wind keeps the player and their shots away
 *   calm    the wind dies, the eye droops — the only window it takes damage
 *
 * Storm Forms and their answers:
 *   cyclone      swirl that walks toward the player; the core strips all
 *                equipped gear and the swirl flings it. Stay out / roll through.
 *   gale         a cone gust that sweeps after the player, debris riding it.
 *                Shelter behind a pillar (wind shadow).
 *   thundercloud the eye rises aloft (untargetable), trails the player in a
 *                lazy squashed ellipse and drops lightning underneath. Keep moving.
 *   blackHole    suction toward the core that a dodge roll does NOT escape;
 *                reaching the core is heavy damage + a fling. Run outward.
 *
 * Boss Phases (66% / 33% HP) replay the same patterns faster: every step's
 * timer scales down and the storm revolves quicker.
 *
 * Like every zone Boss it runs its own cycle (`state = 'boss'`) outside the
 * Enemy State spine. Outputs, drained by BossSystem each frame:
 *   pendingBossAttacks  lightning strikes + gale debris (existing drain)
 *   pendingStormEvents  { type: 'stripGear' | 'blackHoleCatch' | 'sfx' }
 *   windFields          Wind Field specs keyed by id, applied via WindFieldSystem
 *
 * Timing constants below are REAL seconds; update() receives the doubled
 * enemy tick (Enemy.update runs at PHYSICS.ENEMY_TIMER_RATE) and converts.
 */

const CS = GRID.CELL_SIZE;

export const STORM_EYE_MAX_HP = 90;
// Boss Phase thresholds (fraction of max HP)
const PHASE2_FRACTION = 0.66;
const PHASE3_FRACTION = 0.33;
// Per-phase scaling: step durations shrink, the storm revolves faster
const PHASE_TIME_SCALE = { 1: 1.0, 2: 0.8, 3: 0.6 };
const PHASE_REVOLUTION = { 1: 1.0, 2: 1.3, 3: 1.6 };

// Cycle durations (real seconds, phase 1)
const WINDUP_DURATION = 2.4;
const CALM_DURATION   = 2.8;
const ATTACK_DURATION = { cyclone: 4.5, gale: 4.5, thundercloud: 5.5, blackHole: 4.0 };
// After a Black Hole catch the calm starts at once, but only after the fling
// has carried the player clear.
const CATCH_CALM_DELAY = 0.35;

export const STORM_FORMS = ['cyclone', 'gale', 'thundercloud', 'blackHole'];

// Root motion (px/s)
const HOME_RETURN_SPEED = CS * 2.5;   // windup: ease back toward the arena centre
const CYCLONE_DRIFT     = CS * 1.6;   // cyclone attack: walk toward the player

// Cyclone
const CYCLONE_RADIUS       = CS * 6;
const CYCLONE_POWER        = 620;
const CYCLONE_INWARD       = 0.35;
const CYCLONE_CORE_RADIUS  = CS * 1.6;
const CYCLONE_CORE_DAMAGE  = 3;

// Gale
const GALE_RADIUS       = CS * 30;
const GALE_POWER        = 540;
const GALE_CONE         = 0.5;          // half-angle (rad)
const GALE_TURN_RATE    = 0.55;         // rad/s the cone sweeps after the player
const GALE_DEBRIS_EVERY = 0.55;
const GALE_DEBRIS_SPEED = 150;
const GALE_DEBRIS_CHARS = [',', '`', '*', "'"];

// Thundercloud
const CLOUD_LIFT          = CS * 1.4;   // px the eye floats above its shadow
const CLOUD_FOLLOW_RATE   = 1.1;        // 1/s — how quickly the anchor trails the player
const CLOUD_ORBIT_RADIUS  = CS * 2.5;
const CLOUD_ORBIT_SPEED   = 1.4;        // rad/s
const CLOUD_ORBIT_SQUASH  = 0.5;        // Y compressed: the cloud is overhead, seen at a slant
const CLOUD_STRIKE_EVERY  = 0.85;
const CLOUD_STRIKE_WARN   = 0.6;
const CLOUD_STRIKE_DAMAGE = 3;
const CLOUD_STRIKE_RADIUS = CS * 1.2;

// Black Hole
const BLACK_HOLE_RADIUS       = CS * 13;
const BLACK_HOLE_POWER        = 600;
const BLACK_HOLE_CORE_RADIUS  = CS * 1.2;

const COLORS = {
  base:         '#ffd84a',
  cyclone:      '#f0e6b8',
  gale:         '#cfe0ee',
  thundercloud: '#c0b0ff',
  blackHole:    '#7a5cc8',
  channel:      '#ffffff',
};

const MOTE_STYLES = {
  cyclone:      { chars: ['·', '.', '`', ',', '~'], colors: ['#e8dca0', '#d9c98a', '#fff4c8'], count: 70 },
  gale:         { chars: ['-', '~', '=', '·'],      colors: ['#cfe0ee', '#e6eef4'],            count: 55 },
  thundercloud: { chars: ['░', '▒', '░', '·'],      colors: ['#8a86a8', '#a8a4c8', '#6e6a8c'], count: 26 },
  blackHole:    { chars: ['·', '.', '°', '*'],      colors: ['#9a7ce0', '#c8b0ff', '#5a3ca8'], count: 60 },
};

const BOSS_DATA = {
  char: '⛯',
  name: 'Storm Eye',
  hp:   STORM_EYE_MAX_HP,
  speed: 0,
  damage: 0,
  attackRange: Infinity,
  aggroRange:  Infinity,
  attackCooldown: 0,
  attackWindup:   0,
  attackType: 'ranged',
  decisionInterval: 0.1,
  color: COLORS.base,
  drops: [],
  affinities: ['storm'],
  sfx: { hit: 'storm_eye_hit', death: ['boss_defeat'] }
};

export class StormEye extends Enemy {
  constructor(x, y) {
    super('⛯', x, y, 0);

    this.char      = '⛯';
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

    // Root: canvas-space centre the eye is anchored to. `position` (cell
    // top-left, read by hitboxes) is re-derived from it every tick, so
    // knockback can never shove the eye off its storm.
    this.home = { x: x + CS / 2, y: y + CS / 2 };
    this.root = { ...this.home };

    // ── Cycle state ─────────────────────────────────────────────────────────
    this.bossPhase  = 1;
    this.form       = null;
    this.cycleStep  = 'windup';   // 'windup' | 'attack' | 'calm'
    this.stepTimer  = 0;
    this.stepDuration = 0;
    this.clock      = 0;          // real seconds since spawn (drives every wobble)

    // ── Personality (read by BossRenderer) ─────────────────────────────────
    this.displayChar = '⛯';
    this.glyphOffset = { x: 0, y: 0 };
    this.moodColor   = COLORS.base;
    this.lift        = 0;         // px above the shadow (Thundercloud)

    // Untargetable overhead while lifted — CombatSystem skips `aloft` enemies.
    this.aloft = false;

    // Per-form attack state
    this.spin          = 1;
    this.galeAngle     = 0;
    this.cadenceTimer  = 0;
    this.cloudAnchor   = { ...this.root };
    this.cloudAngle    = 0;
    this.gearStripped  = false;   // one strip per Cyclone
    this.catchPending  = null;    // seconds until the calm after a Black Hole catch

    // ── Outputs ─────────────────────────────────────────────────────────────
    this.pendingBossAttacks = [];
    this.pendingStormEvents = [];
    this.windFields = new Map();

    this.enraged = true;
    this.state   = 'boss';

    this._pickForm();
    this._enterStep('windup');
    this._syncPosition();
  }

  // ── Damage gating ─────────────────────────────────────────────────────────

  /** Only the calm opens the eye; overhead it can't be reached at all. */
  get vulnerable() {
    return this.cycleStep === 'calm' && !this.aloft && this.invulnerabilityTimer <= 0;
  }

  takeDamage(amount, attackId = null) {
    if (!this.vulnerable) return false;
    const result = super.takeDamage(amount, attackId);
    if (result !== false) { this.hitFlash = true; this.hasTakenDamage = true; }
    return result;
  }

  // ── Core update ───────────────────────────────────────────────────────────

  update(deltaTime) {
    const dt = deltaTime / PHYSICS.ENEMY_TIMER_RATE;   // real seconds
    this.clock += dt;

    if (this.invulnerabilityTimer > 0) {
      this.invulnerabilityTimer = Math.max(0, this.invulnerabilityTimer - deltaTime);
      if (this.invulnerabilityTimer === 0) this.hitFlash = false;
    }
    const dotDamageEvents = this.updateStatusEffects(deltaTime);

    this._checkPhase();

    if (this.catchPending !== null) {
      this.catchPending -= dt;
      if (this.catchPending <= 0) { this.catchPending = null; this._enterStep('calm'); }
    }

    this.stepTimer -= dt;
    if (this.stepTimer <= 0 && this.catchPending === null) this._advance();

    if (this.cycleStep === 'windup') this._updateWindup(dt);
    else if (this.cycleStep === 'attack') this._updateAttack(dt);
    else this._updateCalm(dt);

    this._updateFields();
    this._syncPosition();
    return { dotDamage: dotDamageEvents };
  }

  get timeScale()  { return PHASE_TIME_SCALE[this.bossPhase]; }
  get revolution() { return PHASE_REVOLUTION[this.bossPhase]; }
  /** 0 → 1 through the current step. */
  get stepProgress() {
    return this.stepDuration > 0 ? 1 - Math.max(0, this.stepTimer) / this.stepDuration : 1;
  }

  _checkPhase() {
    const next = this.bossPhase === 1 && this.hp <= this.maxHp * PHASE2_FRACTION ? 2
               : this.bossPhase === 2 && this.hp <= this.maxHp * PHASE3_FRACTION ? 3
               : null;
    if (next === null) return;
    this.bossPhase = next;
    this.invulnerabilityTimer = 0.6;   // boss convention on every phase change
    this.hitFlash = false;
    this._sfx('storm_eye_phase');
  }

  _advance() {
    if (this.cycleStep === 'windup') this._enterStep('attack');
    else if (this.cycleStep === 'attack') this._enterStep('calm');
    else { this._pickForm(); this._enterStep('windup'); }
  }

  _pickForm() {
    const choices = STORM_FORMS.filter(f => f !== this.form);
    this.form = choices[Math.floor(Math.random() * choices.length)];
  }

  _enterStep(step) {
    this.cycleStep = step;
    const base = step === 'windup' ? WINDUP_DURATION
               : step === 'attack' ? ATTACK_DURATION[this.form]
               : CALM_DURATION;
    this.stepDuration = base * this.timeScale;
    this.stepTimer = this.stepDuration;

    if (step === 'windup') {
      this.gearStripped = false;
      this.spin = Math.random() < 0.5 ? 1 : -1;
      if (this.form === 'gale') this.galeAngle = this._angleToTarget();
      if (this.form === 'thundercloud') {
        this.cloudAnchor = { ...this.root };
        this.cloudAngle = Math.random() * Math.PI * 2;
      }
      this._sfx('storm_eye_mood');
    } else if (step === 'attack') {
      this.cadenceTimer = 0;
      if (this.form === 'thundercloud') this.aloft = true;
      this._sfx('storm_eye_channel');
    } else {
      // The calm: the storm drops, the eye sinks to the ground where it is.
      this.aloft = false;
      this._sfx('storm_eye_calm');
    }
  }

  // ── Windup: the mood ──────────────────────────────────────────────────────

  _updateWindup(dt) {
    const p = this.stepProgress;
    const t = this.clock;
    // Ease back home so the next storm starts from open ground — except the
    // Thundercloud, which rises from wherever the eye sits.
    if (this.form !== 'thundercloud') this._moveRootToward(this.home, HOME_RETURN_SPEED * dt);

    const wobble = this._impatientWobble();
    let ox = wobble.x, oy = wobble.y;
    if (this.form === 'cyclone') {
      // Circles its root, faster and faster.
      const a = t * (4 + 14 * p) * this.spin;
      ox += Math.cos(a) * (2 + 3 * p);
      oy += Math.sin(a) * (2 + 3 * p);
    } else if (this.form === 'gale') {
      // Leans back (the inhale), then sways side to side.
      this.galeAngle = this._turnToward(this.galeAngle, this._angleToTarget(), GALE_TURN_RATE * 2 * dt);
      const lean = Math.min(1, p * 2) * 5;
      const sway = Math.sin(t * 9) * 3 * p;
      const dx = Math.cos(this.galeAngle), dy = Math.sin(this.galeAngle);
      ox += -dx * lean + -dy * sway;
      oy += -dy * lean + dx * sway;
    } else if (this.form === 'thundercloud') {
      // Bobs, rising.
      this.lift = CLOUD_LIFT * p;
      oy += Math.sin(t * 6) * 2;
    } else if (this.form === 'blackHole') {
      // A tight tremor, darkening.
      ox += (Math.random() - 0.5) * 3 * p;
      oy += (Math.random() - 0.5) * 3 * p;
    }
    this.glyphOffset.x = ox;
    this.glyphOffset.y = oy;
    this.displayChar = '⛯';
    this.moodColor = this._mix(COLORS.base, COLORS[this.form], p);
  }

  // ── Attack: the channel ───────────────────────────────────────────────────

  _updateAttack(dt) {
    this.displayChar = '⛭';
    this.moodColor = COLORS.channel;
    this.glyphOffset.x = (Math.random() - 0.5) * 2;
    this.glyphOffset.y = (Math.random() - 0.5) * 2;
    if (this.catchPending !== null) return;   // caught: holding still until the calm

    const target = this._targetCenter();
    const d = target ? Math.hypot(target.x - this.root.x, target.y - this.root.y) : Infinity;

    if (this.form === 'cyclone') {
      if (target) this._moveRootToward(target, CYCLONE_DRIFT * this.revolution * dt);
      if (!this.gearStripped && d < CYCLONE_CORE_RADIUS && this._targetExposed()) {
        this.gearStripped = true;
        this.pendingStormEvents.push({ type: 'stripGear', x: this.root.x, y: this.root.y, damage: CYCLONE_CORE_DAMAGE });
      }
    } else if (this.form === 'gale') {
      if (target) this.galeAngle = this._turnToward(this.galeAngle, this._angleToTarget(), GALE_TURN_RATE * this.revolution * dt);
      this.cadenceTimer -= dt;
      if (this.cadenceTimer <= 0) {
        this.cadenceTimer = GALE_DEBRIS_EVERY * this.timeScale;
        this._fireDebris();
      }
    } else if (this.form === 'thundercloud') {
      this.lift = CLOUD_LIFT;
      this._trailTarget(dt);
      this.glyphOffset.y += Math.sin(this.clock * 3) * 2;
      this.cadenceTimer -= dt;
      if (this.cadenceTimer <= 0) {
        this.cadenceTimer = CLOUD_STRIKE_EVERY * this.timeScale;
        this.pendingBossAttacks.push({
          type: 'lightning_strike',
          position: { x: this.root.x + (Math.random() - 0.5) * CS, y: this.root.y + (Math.random() - 0.5) * CS * 0.5 },
          delay: CLOUD_STRIKE_WARN * this.timeScale,
          damage: CLOUD_STRIKE_DAMAGE,
          radius: CLOUD_STRIKE_RADIUS,
          owner: this,
        });
      }
    } else if (this.form === 'blackHole') {
      if (d < BLACK_HOLE_CORE_RADIUS && this._targetExposed()) {
        this.pendingStormEvents.push({ type: 'blackHoleCatch', x: this.root.x, y: this.root.y });
        this.catchPending = CATCH_CALM_DELAY;
      }
    }
  }

  /** The cloud's anchor lags behind the player; the cloud circles it lazily. */
  _trailTarget(dt) {
    const target = this._targetCenter();
    if (target) {
      const k = 1 - Math.exp(-CLOUD_FOLLOW_RATE * this.revolution * dt);
      this.cloudAnchor.x += (target.x - this.cloudAnchor.x) * k;
      this.cloudAnchor.y += (target.y - this.cloudAnchor.y) * k;
    }
    this.cloudAngle += CLOUD_ORBIT_SPEED * this.revolution * this.spin * dt;
    this.root.x = this._clampX(this.cloudAnchor.x + Math.cos(this.cloudAngle) * CLOUD_ORBIT_RADIUS);
    this.root.y = this._clampY(this.cloudAnchor.y + Math.sin(this.cloudAngle) * CLOUD_ORBIT_RADIUS * CLOUD_ORBIT_SQUASH);
  }

  _fireDebris() {
    const a = this.galeAngle + (Math.random() - 0.5) * GALE_CONE * 1.4;
    this.pendingBossAttacks.push({
      type: 'projectile',
      position: { x: this.root.x - CS / 2, y: this.root.y - CS / 2 },
      velocity: { vx: Math.cos(a) * GALE_DEBRIS_SPEED, vy: Math.sin(a) * GALE_DEBRIS_SPEED },
      damage: 1,
      char: GALE_DEBRIS_CHARS[Math.floor(Math.random() * GALE_DEBRIS_CHARS.length)],
      color: '#c8b88a',
      reflectable: false,
      reflected: false,
      owner: this,
    });
  }

  // ── Calm: the opening ─────────────────────────────────────────────────────

  _updateCalm(dt) {
    // Sinks to the ground, droops, and sways slowly — each form leaves its own
    // tell (the Thundercloud's eye wobbles dizzily as it lands).
    this.lift = Math.max(0, this.lift - CLOUD_LIFT * 4 * dt);
    const t = this.clock;
    const dizzy = this.form === 'thundercloud';
    this.glyphOffset.x = dizzy ? Math.cos(t * 5) * 3 : Math.sin(t * 1.2) * 3;
    this.glyphOffset.y = 2 + (dizzy ? Math.sin(t * 5) * 1.5 : 0);
    this.displayChar = '⛯';
    this.moodColor = this._mix(COLORS.base, '#000000', 0.4);
  }

  // ── Wind Field specs ──────────────────────────────────────────────────────

  /**
   * Rebuilds the form's Wind Field spec every tick. Strength ramps up through
   * the windup, holds through the attack, and dies across the first moments of
   * the calm — the motes visibly thinning is the "now" tell.
   */
  _updateFields() {
    const p = this.stepProgress;
    // A Black Hole catch drops the suction at once so the fling carries clear.
    const strength = this.catchPending !== null ? 0
                   : this.cycleStep === 'windup' ? p * 0.6
                   : this.cycleStep === 'attack' ? 1
                   : Math.max(0, 1 - p * 4);
    const style = MOTE_STYLES[this.form];
    const base = {
      x: this.root.x, y: this.root.y, strength,
      moteCount: style.count, moteChars: style.chars, moteColors: style.colors,
    };
    this.windFields.clear();
    if (strength <= 0) return;

    if (this.form === 'cyclone') {
      this.windFields.set('stormEye', { ...base, kind: 'swirl', radius: CYCLONE_RADIUS,
        power: CYCLONE_POWER, inward: CYCLONE_INWARD, spin: this.spin, spinRate: 0.6 * this.revolution });
    } else if (this.form === 'gale') {
      this.windFields.set('stormEye', { ...base, kind: 'gust', radius: GALE_RADIUS,
        power: GALE_POWER, dirX: Math.cos(this.galeAngle), dirY: Math.sin(this.galeAngle),
        coneHalfAngle: GALE_CONE });
    } else if (this.form === 'thundercloud') {
      // Mostly visual: a slow churning cloud overhead with only a breath of push.
      this.windFields.set('stormEye', { ...base, kind: 'swirl', radius: CS * 2.2,
        power: 60, inward: 0.6, spin: this.spin, spinRate: 0.25 * this.revolution,
        y: this.root.y - this.lift });
    } else if (this.form === 'blackHole') {
      this.windFields.set('stormEye', { ...base, kind: 'suction', radius: BLACK_HOLE_RADIUS,
        power: BLACK_HOLE_POWER, spinRate: 0.4 * this.revolution, rollProof: true });
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  _impatientWobble() {
    const t = this.clock * this.revolution;
    return { x: Math.sin(t * 2.3) * 2.5, y: Math.sin(t * 3.1 + 1) * 1.5 };
  }

  _targetCenter() {
    const p = this.target;
    if (!p?.position) return null;
    return { x: p.position.x + CS / 2, y: p.position.y + CS / 2 };
  }

  /** A rolling or freshly-hit player passes through the Cyclone core; the Black Hole ignores the roll. */
  _targetExposed() {
    const p = this.target;
    if (!p || p.hp <= 0) return false;
    if (p.invulnerabilityTimer > 0) return false;
    if (this.form === 'cyclone' && p.dodgeRoll?.active) return false;
    return true;
  }

  _angleToTarget() {
    const t = this._targetCenter();
    return t ? Math.atan2(t.y - this.root.y, t.x - this.root.x) : this.galeAngle;
  }

  _turnToward(from, to, maxStep) {
    let diff = Math.atan2(Math.sin(to - from), Math.cos(to - from));
    diff = Math.max(-maxStep, Math.min(maxStep, diff));
    return from + diff;
  }

  _moveRootToward(pt, step) {
    const dx = pt.x - this.root.x, dy = pt.y - this.root.y;
    const d = Math.hypot(dx, dy);
    if (d <= step || d === 0) { this.root.x = pt.x; this.root.y = pt.y; return; }
    this.root.x = this._clampX(this.root.x + dx / d * step);
    this.root.y = this._clampY(this.root.y + dy / d * step);
  }

  _clampX(x) { return Math.max(CS * 2, Math.min(GRID.WIDTH - CS * 2, x)); }
  _clampY(y) { return Math.max(CS * 2, Math.min(GRID.HEIGHT - CS * 2, y)); }

  _syncPosition() {
    this.position.x = this.root.x - CS / 2;
    this.position.y = this.root.y - CS / 2;
    if (this.velocity) { this.velocity.vx = 0; this.velocity.vy = 0; }
  }

  _sfx(name) {
    this.pendingStormEvents.push({ type: 'sfx', name });
  }

  _mix(hexA, hexB, t) {
    const a = parseInt(hexA.slice(1), 16), b = parseInt(hexB.slice(1), 16);
    const ch = (shift) => Math.round(((a >> shift) & 255) * (1 - t) + ((b >> shift) & 255) * t);
    return `#${[16, 8, 0].map(s => ch(s).toString(16).padStart(2, '0')).join('')}`;
  }
}
