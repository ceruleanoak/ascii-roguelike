import { Enemy } from './Enemy.js';
import { GRID } from '../game/GameConfig.js';
import { HoardmawTongue } from './HoardmawTongue.js';

// ─── Tuning (real seconds — bespoke boss clock, TurtleShell precedent) ───────
export const HOARDMAW_MAX_HP = 80;

// Scale field geometry, in cells relative to the body's top-left anchor.
// The field is deliberately modest (3 rows × 6 cols): each damaging melee hit
// chips exactly one scale, so armored-phase length is ~18 clean hits — long
// enough to teach chip-and-claim, short enough to not outlive its welcome.
export const SCALE_ROWS = 3;
export const SCALE_COLS = 6;

// Body block size in cells (the composite mass the renderer draws around).
export const BODY_COLS = 11;
export const BODY_ROWS = 7;

const SLAM_COOLDOWN    = 4.0;
const SLAM_TELEGRAPH   = 1.1;   // ring telegraph before the lid comes down
const SLAM_RADIUS      = GRID.CELL_SIZE * 2.6; // damage ring on slam landing
const INHALE_COOLDOWN  = 7.0;
const INHALE_DURATION  = 1.6;   // vacuum pull window
const INHALE_RANGE     = GRID.CELL_SIZE * 7;
const INHALE_PULL      = 120;   // px/s toward the mouth
const TONGUE_COOLDOWN  = 6.0;
const FAN_COOLDOWN     = 5.0;
const FAN_COUNT        = 7;
const FAN_SPEED        = 150;
const FAN_ARC          = Math.PI / 3;

// Phase-2 glint: the true weak point migrates over three fixed body
// positions (left cheek / keyhole center / right cheek). Fixed cycle, not a
// roll — repeat visits learn it and pre-position (repeat-visit mastery).
export const GLINT_POSITIONS = [
  { dx: -3.5, dy: 2 }, { dx: 0, dy: 3 }, { dx: 3.5, dy: 2 },
];
const GLINT_PULSE_PERIOD = 1.2; // seconds per breath pulse (the rhythm to read)

// Phase-3 bribe: three offers; each refused escalates the convulsion.
const BRIBE_OFFER_COUNT  = 3;
const BRIBE_OFFER_WINDOW = 2.8;  // seconds the mound sits there, tempting
// Choke kill window once the pile is fed back into its own mouth.
const CHOKE_WINDOW       = 4.5;

const MAW_DATA = {
  char: '₮', // internal placeholder only — render fully owned by the composite renderer
  name: 'The Hoardmaw',
  hp:   HOARDMAW_MAX_HP,
  speed: 0,
  damage: 3,
  attackRange: Infinity,
  aggroRange:  Infinity,
  attackCooldown: 999,
  attackWindup:   0,
  attackType: 'melee',
  decisionInterval: 0.1,
  color: '#c9a227',
  drops: [],
};

/**
 * Hoardmaw — green-zone dungeon boss (Layer 2; claudedocs/dungeon-boss-green.md).
 *
 * The treasure you descended for is the thing that eats you. Structural
 * precedents: TurtleShell (bespoke Enemy subclass, source-gated takeDamage,
 * phase transitions driven externally), GooDragon/GooHead (child entity for
 * the grab), BossSystem signal flags (pendingBossAttacks / *Pending fields —
 * DungeonBossSystem consumes them).
 *
 * Damage model:
 *   Phase 1 SCALED   — every intact scale absorbs one melee hit and flies off
 *                      as a `$` pickup (mint +1 coin when collected); ranged
 *                      attacks ricochet for nothing. No HP loss while any
 *                      scale remains. This is ArmorMechanic's contract made
 *                      positional — implemented natively because the chunk
 *                      model can't express a hit-location grid (whip-immunity
 *                      rule carries over: whips never chip).
 *   Phase 2 GLINTING — bare hide; only the pulsing ◉ glint takes damage,
 *                      everything else tings off.
 *   Phase 3 BRIBE    — invulnerable except the choke window after the player
 *                      refuses all three offers and strikes the pile home.
 */
export class Hoardmaw extends Enemy {
  constructor(x, y) {
    super('?', x, y, 0);

    // ── Identity ────────────────────────────────────────────────────────────
    this.char = MAW_DATA.char;
    this.data = MAW_DATA;
    this.hp = HOARDMAW_MAX_HP;
    this.maxHp = HOARDMAW_MAX_HP;
    this.color = MAW_DATA.color;
    this.baseColor = MAW_DATA.color;
    this.isBossEntity = true;
    this.isBossMiddleHead = true; // excluded from normal entity render skip
    this.state = 'boss';

    // ── Body geometry (cells) — the vault's north half is the maw ──────────
    // position.x/y is the body-block CENTER in px (renderer + attacks read
    // from here; the tongue spawns from mouthX/mouthY).
    this.bodyCols = BODY_COLS;
    this.bodyRows = BODY_ROWS;

    // ── Scale field ─────────────────────────────────────────────────────────
    // Map of "row,col" → true while that scale cell is still armored. Anchored
    // so the field centers on the body block's upper rows.
    this.scales = new Set();
    const fieldTop = Math.floor((BODY_ROWS - SCALE_ROWS) / 2);
    const fieldLeft = Math.floor((BODY_COLS - SCALE_COLS) / 2);
    for (let r = 0; r < SCALE_ROWS; r++) {
      for (let c = 0; c < SCALE_COLS; c++) {
        this.scales.add(`${fieldTop + r},${fieldLeft + c}`);
      }
    }
    this.initialScaleCount = this.scales.size;

    // ── Phase state ─────────────────────────────────────────────────────────
    this.bossPhase = 1;            // 1 scaled · 2 glinting · 3 bribe
    this.goldBreathFired = false;  // one-shot curse trigger signal (phase 2)
    this.glintIndex = Math.floor(Math.random() * GLINT_POSITIONS.length);
    this.glintPulseTimer = 0;      // breath rhythm the player reads

    // ── Attack state machine ────────────────────────────────────────────────
    // One attack at a time; idle otherwise. All timings real seconds.
    this.attackState = 'idle';     // idle|slamTele|inhale|fanWindup|tongueLive
    this.attackTimer = 0;
    this.slamCooldown = SLAM_COOLDOWN;
    this.inhaleCooldown = INHALE_COOLDOWN * 0.5; // first inhale comes early
    this.tongueCooldown = TONGUE_COOLDOWN * 0.5;
    this.fanCooldown = FAN_COOLDOWN;
    this.tongue = null;            // live HoardmawTongue child

    // ── Signals polled by DungeonBossSystem ─────────────────────────────────
    this.pendingBossAttacks = [];  // projectiles (scale fan) for CombatSystem
    this.slamLandedAt = null;      // { x, y } — shockwave resolution site
    this.inhaleActive = false;     // system drags ground pickups while true
    this.onSwallowCount = 0;       // player swallowed beats (tongue reached home)

    // ── Phase-3 bribe state ─────────────────────────────────────────────────
    this.bribeOffersMade = 0;
    this.bribeRefusals = 0;        // incremented by the system per expired offer
    this.bribeOfferTimer = 0;
    this.bribesAccepted = false;   // grabbing the mound = punishment beat
    this.chokeTimer = 0;           // >0 during the choke kill window
    this.defeated = false;
  }

  // ── Geometry helpers (renderer + system) ──────────────────────────────────
  bodyRect() {
    const cs = GRID.CELL_SIZE;
    return {
      left: this.position.x - (this.bodyCols * cs) / 2,
      top: this.position.y - (this.bodyRows * cs) / 2,
      cols: this.bodyCols,
      rows: this.bodyRows,
    };
  }

  mouthX() { return this.position.x; }
  mouthY() {
    // Mouth sits at the bottom edge of the body block (facing the player).
    return this.position.y + (this.bodyRows * GRID.CELL_SIZE) / 2;
  }

  /** World-space px of the current true glint (phase 2 weak point). */
  glintPx() {
    const pos = GLINT_POSITIONS[this.glintIndex % GLINT_POSITIONS.length];
    return { x: this.position.x + pos.dx * GRID.CELL_SIZE, y: this.position.y + pos.dy * GRID.CELL_SIZE };
  }

  /** True if a world-space point lands on an intact scale cell. */
  scaleCellAt(px, py) {
    const rect = this.bodyRect();
    const cs = GRID.CELL_SIZE;
    const col = Math.floor((px - rect.left) / cs);
    const row = Math.floor((py - rect.top) / cs);
    return this.scales.has(`${row},${col}`) ? { row, col } : null;
  }

  /** Nearest intact scale to a world-space point (chip target for melee). */
  nearestScale(px, py) {
    let best = null;
    let bestDist = Infinity;
    const cs = GRID.CELL_SIZE;
    const rect = this.bodyRect();
    for (const key of this.scales) {
      const [r, c] = key.split(',').map(Number);
      const sx = rect.left + (c + 0.5) * cs;
      const sy = rect.top + (r + 0.5) * cs;
      const d = Math.hypot(sx - px, sy - py);
      if (d < bestDist) { bestDist = d; best = key; }
    }
    return best;
  }

  // ── Core update (replaces Enemy AI) ────────────────────────────────────────
  update(deltaTime) {
    // i-frames + status timers (Enemy-standard bookkeeping)
    if (this.invulnerabilityTimer > 0) {
      this.invulnerabilityTimer = Math.max(0, this.invulnerabilityTimer - deltaTime);
    }
    this.dotBlinkTimer += deltaTime;
    const dotDamageEvents = this.updateStatusEffects(deltaTime);

    // Static mass: PhysicsSystem must never drift the body.
    this.targetVelocity.vx = 0;
    this.targetVelocity.vy = 0;
    this.velocity.vx = 0;
    this.velocity.vy = 0;

    // Breath rhythm runs in every phase — it IS the glint tell (phase 2).
    this.glintPulseTimer = (this.glintPulseTimer + deltaTime) % GLINT_PULSE_PERIOD;

    // Live child tongue ticks with us.
    if (this.tongue) {
      this.tongue.update(deltaTime, this.target);
      if (this.tongue.done) this.tongue = null;
    }

    // Cooldowns tick always.
    this.slamCooldown = Math.max(0, this.slamCooldown - deltaTime);
    this.inhaleCooldown = Math.max(0, this.inhaleCooldown - deltaTime);
    this.tongueCooldown = Math.max(0, this.tongueCooldown - deltaTime);
    this.fanCooldown = Math.max(0, this.fanCooldown - deltaTime);

    switch (this.bossPhase) {
      case 1: this._updateScaled(deltaTime); break;
      case 2: this._updateGlinting(deltaTime); break;
      case 3: this._updateBribe(deltaTime); break;
    }

    return { dotDamage: dotDamageEvents };
  }

  _pickAttack() {
    // Rotation preference: slam → tongue → inhale → fan. Whatever is off
    // cooldown first fires; all close-range by design (no kiting exists).
    if (this.slamCooldown <= 0) return 'slam';
    if (this.tongueCooldown <= 0 && this.target
        && this._distToTarget() < TONGUE_REACH()) return 'tongue';
    if (this.inhaleCooldown <= 0) return 'inhale';
    if (this.fanCooldown <= 0) return 'fan';
    return null;
  }

  _distToTarget() {
    if (!this.target) return Infinity;
    return Math.hypot(this.target.position.x - this.position.x,
                      this.target.position.y - this.mouthY());
  }

  _updateScaled(deltaTime) {
    if (this.attackState === 'idle') {
      const pick = this._pickAttack();
      if (pick) this._beginAttack(pick);
    } else {
      this._tickAttack(deltaTime);
    }
  }

  _updateGlinting(deltaTime) {
    // Gold Breath fires exactly once at phase entry (signal → system applies
    // the coin-slot curse). Kept as a poll flag so the entity stays decoupled.
    if (!this.goldBreathFired) this.goldBreathFired = true;

    if (this.attackState === 'idle') {
      const pick = this._pickAttack();
      if (pick) this._beginAttack(pick);
    } else {
      this._tickAttack(deltaTime);
    }
  }

  _updateBribe(deltaTime) {
    // Choke window: the earned kill window. Nothing else happens while it runs.
    if (this.chokeTimer > 0) {
      this.chokeTimer -= deltaTime;
      return;
    }
    // Offer loop: mound goes out, timer runs; refusals counted by the system
    // (which watches the player's actual behavior — grab vs. stand off).
    this.bribeOfferTimer -= deltaTime;
  }

  // ── Attack implementations ─────────────────────────────────────────────────
  _beginAttack(kind) {
    this.attackState = kind === 'slam' ? 'slamTele' : kind;
    this.attackTimer = 0;
    if (kind === 'slam') this.slamCooldown = SLAM_COOLDOWN;
    if (kind === 'tongue') {
      this.tongueCooldown = TONGUE_COOLDOWN;
      const tx = this.target?.position.x ?? this.mouthX();
      const ty = this.target?.position.y ?? this.mouthY();
      this.tongue = new HoardmawTongue(this, this.mouthX(), this.mouthY(), tx, ty);
    }
    if (kind === 'inhale') {
      this.inhaleCooldown = INHALE_COOLDOWN;
      this.inhaleActive = true;
    }
    if (kind === 'fan') this.fanCooldown = FAN_COOLDOWN;
  }

  _tickAttack(deltaTime) {
    this.attackTimer += deltaTime;
    switch (this.attackState) {
      case 'slamTele':
        if (this.attackTimer >= SLAM_TELEGRAPH) {
          // Lid comes down: shockwave resolves outward from the body edge —
          // the flanks stay safe (proximity rewarded).
          this.slamLandedAt = { x: this.mouthX(), y: this.mouthY() };
          this.attackState = 'idle';
        }
        break;
      case 'inhale':
        // Pull strength read by DungeonBossSystem each frame while active.
        if (this.attackTimer >= INHALE_DURATION) {
          this.inhaleActive = false;
          this.attackState = 'idle';
        }
        break;
      case 'tongueLive':
        // Driven by the child entity; ends when it reports done above.
        if (!this.tongue) this.attackState = 'idle';
        break;
    }
  }

  /** Fan of chipped scales — its lost wealth turned weapon. */
  fireScaleFan() {
    if (!this.target) return;
    const base = Math.atan2(this.target.position.y - this.mouthY(),
                            this.target.position.x - this.mouthX());
    for (let i = 0; i < FAN_COUNT; i++) {
      const t = FAN_COUNT === 1 ? 0.5 : i / (FAN_COUNT - 1);
      const angle = base - FAN_ARC / 2 + t * FAN_ARC;
      this.pendingBossAttacks.push({
        type: 'projectile',
        position: { x: this.mouthX(), y: this.mouthY() },
        velocity: { vx: Math.cos(angle) * FAN_SPEED, vy: Math.sin(angle) * FAN_SPEED },
        damage: 1,
        char: '$',
        color: '#ffd700',
        reflectable: false,
        reflected: false,
        owner: this,
        width: 2,
        height: 2,
      });
    }
    this.attackState = 'idle';
  }

  onSwallow() {
    this.onSwallowCount++;
    this.attackState = 'idle';
  }

  // ── Phase transitions (driven by DungeonBossSystem) ────────────────────────

  /** All scales stripped — bare hide, the glint cycle begins. */
  transitionToPhase(phase) {
    this.bossPhase = phase;
    this.attackState = 'idle';
    this.tongue = null;
    if (phase === 3) {
      this.bribeOfferTimer = BRIBE_OFFER_WINDOW;
      this.chokeTimer = 0;
    }
  }

  /** Refusal recorded; three unlocks the strike-the-pile opportunity. */
  recordBribeRefusal() {
    this.bribeRefusals++;
    this.bribesAccepted = false;
    if (this.bribeRefusals >= BRIBE_OFFER_COUNT) {
      // Next player action: strike the offered pile into the mouth → choke.
      this.bribeOfferTimer = 0;
      return true;
    }
    this.bribeOfferTimer = BRIBE_OFFER_WINDOW;
    return false;
  }

  /** Player struck the pile home — choke opens the kill window. */
  beginChoke() {
    this.chokeTimer = CHOKE_WINDOW;
  }

  markDefeated() {
    this.defeated = true;
  }

  // ── Damage routing ─────────────────────────────────────────────────────────
  //
  // source: { kind: 'melee'|'projectile'|'head', weaponSubtype?, px, py }
  // Returns true when the hit actually consumed something (callers gate
  // feedback on this — `ting` vs crack).

  takeDamage(amount, source = {}) {
    if (this.defeated) return false;
    if (this.invulnerabilityTimer > 0) return false;

    const px = source.px ?? this.position.x;
    const py = source.py ?? this.position.y;

    // Phase 1: scales eat everything. Ranged ricochets outright; whips never
    // chip (ArmorMechanic's hard-counter contract carried over).
    if (this.bossPhase === 1) {
      if (source.kind === 'projectile') return false;
      if (source.weaponSubtype === 'whip') return false;
      const cellKey = this.nearestScale(px, py);
      if (!cellKey) return false;
      this.scales.delete(cellKey);
      this.scaleChippedAt = { key: cellKey, px, py }; // system spawns the $ pickup
      if (this.scales.size === 0) this.pendingPhaseTransition = 2;
      return true;
    }

    // Phase 2: bare hide — only the glint bleeds.
    if (this.bossPhase === 2) {
      const g = this.glintPx();
      if (Math.hypot(g.x - px, g.y - py) > GRID.CELL_SIZE * 0.9) return false;
      this.hp = Math.max(0, this.hp - amount);
      this.invulnerabilityTimer = 0.15;
      if (this.hp <= 0) this.markDefeated();
      return true;
    }

    // Phase 3: invulnerable except the choke window (glint exposed, lid hung).
    if (this.bossPhase === 3) {
      if (this.chokeTimer <= 0) return false;
      this.hp = Math.max(0, this.hp - amount);
      this.invulnerabilityTimer = 0.15;
      if (this.hp <= 0) this.markDefeated();
      return true;
    }

    return false;
  }
}

// Tongue reach helper kept outside the class so the constant table stays at top.
function TONGUE_REACH() { return GRID.CELL_SIZE * 5.5; }
