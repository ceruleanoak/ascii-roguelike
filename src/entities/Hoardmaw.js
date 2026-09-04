import { Enemy } from './Enemy.js';
import { GRID, PHYSICS } from '../game/GameConfig.js';
import { HoardmawTongue } from './HoardmawTongue.js';
import { applyEasing } from '../systems/AnimationSystem.js';

// ─── Tuning ─────────────────────────────────────────────────────────────────
// Every constant below is authored in REAL seconds. The maw rides
// floor.enemies like any other interior enemy, so DungeonSystem's loop drives
// it at `dt * PHYSICS.ENEMY_TIMER_RATE` (double-seconds) — update() converts
// once at its boundary and every timer here reads naturally. Do not re-tune
// these to absorb the factor; see [clock-mismatch] in known-bugs.md.
export const HOARDMAW_MAX_HP = 80;

// Scale field geometry, in cells relative to the body's top-left anchor.
// 3 rows × 4 cols: each damaging melee hit chips exactly one scale, so the
// armored phase is 12 clean hits — long enough to teach chip-and-claim,
// short enough to not outlive its welcome once re-armoring starts pushing
// the count back up.
export const SCALE_ROWS = 3;
export const SCALE_COLS = 4;

// Body block size, in body-pitch units (the composite mass the renderer draws
// around). Rows split into a hinged LID and the carcass beneath it:
//   rows 0 … LID_ROWS-1   the lid, hinged along its back edge
//   rows LID_ROWS … end   the chest body, which is what carries the armor
// The split is load-bearing for both halves: the lid is the only part that
// moves independently, and nothing hittable may live on it, or the picture
// and the hit geometry would come apart every time the mouth opened.
export const BODY_COLS = 11;
export const BODY_ROWS = 7;
export const LID_ROWS  = 3;

const SLAM_COOLDOWN    = 4.0;
const SLAM_TELEGRAPH   = 1.1;   // ring telegraph before the lid comes down
// Damage ring on slam landing. Exported because DungeonBossSystem resolves the
// hit — the reach is the attack's property, so it is authored once here rather
// than in the system that happens to test it.
export const SLAM_RADIUS = GRID.CELL_SIZE * 3.2;
const INHALE_COOLDOWN  = 7.0;
const INHALE_DURATION  = 1.6;   // vacuum pull window
const INHALE_RANGE     = GRID.CELL_SIZE * 7;
const INHALE_PULL      = 120;   // px/s toward the mouth
const TONGUE_COOLDOWN  = 6.0;
const FAN_COOLDOWN     = 5.0;
const FAN_COUNT        = 7;
const FAN_SPEED        = 150;
const FAN_ARC          = Math.PI / 3;
const FAN_WINDUP       = 0.55;  // lid cracks and gathers before the spray
const HIT_FLASH_TIME   = 0.12;  // white-out on a landed hit

// Phase-2 glint: the true weak point migrates over three fixed body
// positions (left cheek / keyhole center / right cheek). Fixed cycle, not a
// roll — repeat visits learn it and pre-position (repeat-visit mastery).
// Offsets are from the body CENTER in pitch units, and all three sit on the
// carcass face below the mouth — the "bare hide" the stripped armor exposes.
// Keeping them off the lid means the weak point never rides the animation.
export const GLINT_POSITIONS = [
  { dx: -3, dy: 1 }, { dx: 0, dy: 2 }, { dx: 3, dy: 1 },
];
export const GLINT_PULSE_PERIOD = 1.2; // seconds per breath pulse (the rhythm to read)
// Breaths the glint holds one position before moving on. Every-pulse migration
// would be unreadable and unhittable; three gives a real strike window while
// still keeping the eye moving.
const GLINT_MIGRATE_PULSES = 3;
// Breaths the true glint stays brightened before a grab — the pre-grab tell.
const GLINT_TELL_PULSES = 2;

// Phase-3 bribe: three offers; each refused escalates the convulsion.
const BRIBE_OFFER_COUNT  = 3;
export const BRIBE_OFFER_WINDOW = 2.8;  // seconds the mound sits there, tempting
// Choke kill window once the pile is fed back into its own mouth.
const CHOKE_WINDOW       = 4.5;

// ─── Deform tuning ──────────────────────────────────────────────────────────
// It is a chest. Everything here is deliberately restrained: a chest that
// squashes and stretches stops being furniture and starts being a cartoon,
// and the horror only works while the object still looks like a thing you
// could have opened yourself. Total body travel stays close to one cell; all
// the character lives in the lid.

export const LID_REST  = 0.12;  // never fully shut — the sliver of dark IS the menace
export const LID_REAR  = 0.30;  // drawn back before a slam, gathering
export const LID_GAPE  = 0.70;  // inhale / tongue / fan: open and working
export const LID_CHOKE = 0.90;  // jammed open around its own hoard — the kill window

const LID_OPEN_RATE = 1 / 0.30; // units/sec opening — unhurried, readable
const LID_SLAM_RATE = 1 / 0.12; // units/sec shutting — accelerating, heavy

const BREATH_PERIOD  = GLINT_PULSE_PERIOD; // the bob and the glint share one clock
const BREATH_BOB     = 0.15;  // cells — barely there, but the eye reads "alive"
const REAR_LIFT      = 1.10;  // cells it hauls itself up before a slam
const SLAM_DROP      = 0.35;  // cells it drives down through the floor on impact
const SLAM_RECOIL    = 0.28;  // seconds the impact frame decays over
const RECOIL_LIFT    = 0.25;  // cells it flinches back on taking a hit
const CONVULSE_BASE  = 0.06;  // cells of phase-3 tremor per banked refusal
export const DENT_TIME  = 0.20;  // seconds a chipped cell shows its dent
export const DENT_DEPTH = 0.45;  // fraction of a pitch the dented glyph sinks inward

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
  sfx: { hit: 'boss_hit', death: 'boss_defeat' },
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
    // Per-instance clone: the encounter writes nothing back into the shared
    // registry object (#170/#215 family), and the death SFX rides data.sfx
    // like every other enemy rather than a branch in the death loop.
    this.data = { ...MAW_DATA, sfx: { ...MAW_DATA.sfx } };
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
    // Live root offset in px. Every body point is measured from here, so the
    // whole mass moves as one when it breathes, rears, slams or convulses.
    this.anchorX = 0;
    this.anchorY = 0;

    // ── Scale field ─────────────────────────────────────────────────────────
    // Map of "row,col" → true while that scale cell is still armored. Anchored
    // so the field centers on the body block's upper rows.
    this.scales = new Set();
    // Anchored to the top of the CARCASS, never the lid — see LID_ROWS.
    const fieldTop = LID_ROWS;
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
    // Fixed cycle, deterministic start: repeat visits are supposed to be able
    // to learn the order and pre-position (doc: repeat-visit mastery). A random
    // start would make the first position unlearnable.
    this.glintIndex = 0;
    this.glintPulseTimer = 0;      // breath rhythm the player reads
    this.glintPulseCount = 0;      // whole pulses elapsed — drives the migration
    this.glintTellTimer = 0;       // >0 while the glint brightens pre-grab

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
    // Declared here rather than sprung into existence mid-hit: lazy property
    // init on a live entity is a listed anti-pattern (CLAUDE.md).
    this.pendingPhaseTransition = null; // 2 once the last scale falls
    this.scaleChippedAt = null;    // { key, px, py } — system spawns the `$`
    this.ricochetAt = null;        // { px, py } — a hit the armor turned away
    this.swallowedAt = null;       // { px, py } — spit-out site after a swallow
    this.hitFlash = 0;             // seconds of white-out remaining
    this.ambushSnapPending = false; // prologue lid-snap awaiting resolution
    this.hasTakenDamage = false;   // gates the HP bar — Turtle precedent

    // ── Deform state (written by _tickDeform, read by HoardmawRenderer) ─────
    // The renderer is a pure reader, like every other renderer here: it never
    // computes what the body is doing, only draws what the body already
    // decided. That keeps the picture and the hit geometry on one source.
    this.lidOpen = LID_REST;       // 0 shut … 1 gaped wide
    this.breathPhase = 0;          // 0..1 through one breath
    this.slamRecoil = 0;           // seconds left in the impact frame
    this.dents = [];               // { row, col, t } — freshly chipped cells

    // ── Phase-3 bribe state ─────────────────────────────────────────────────
    this.bribeOffersMade = 0;
    this.bribeRefusals = 0;        // incremented by the system per expired offer
    this.bribeOfferTimer = 0;
    this.bribesAccepted = false;   // grabbing the mound = punishment beat
    this.chokeTimer = 0;           // >0 during the choke kill window
    this.defeated = false;
  }

  // ── Geometry: one transform, every consumer ───────────────────────────────
  //
  // The body is drawn and struck on the maw's OWN glyph pitch, anchored to a
  // root that moves (breath, rear-up, slam, convulsion). Hit math, the glint,
  // the mouth and the renderer all resolve through offsetPx()/glyphAt(), so
  // the picture and the hitboxes cannot drift apart. Anything that needs a
  // point on this body asks here — never recomputes from position + CELL_SIZE.

  /** Body root in world px: the block center, plus the live anchor offset. */
  rootX() { return this.position.x + this.anchorX; }
  rootY() { return this.position.y + this.anchorY; }

  /** Body-local offset in pitch units → world px. The one transform. */
  offsetPx(dx, dy) {
    const p = GLYPH_PITCH();
    return { x: this.rootX() + dx * p, y: this.rootY() + dy * p };
  }

  /** Center px of body cell (row, col), indexed from the block's top-left. */
  glyphAt(row, col) {
    return this.offsetPx(col - (this.bodyCols - 1) / 2, row - (this.bodyRows - 1) / 2);
  }

  bodyRect() {
    const p = GLYPH_PITCH();
    return {
      left: this.rootX() - (this.bodyCols * p) / 2,
      top: this.rootY() - (this.bodyRows * p) / 2,
      cols: this.bodyCols,
      rows: this.bodyRows,
      pitch: p,
    };
  }

  /**
   * Combat hitbox spanning the whole drawn body block.
   *
   * Enemy.getHitbox() treats position as a top-left corner and returns one
   * cell — but this boss's position is the body-block CENTER, so the inherited
   * box lands a single cell down-right of center and every hit test runs
   * against ~4% of the visible mass. Most of the scale field and two of the
   * three glints sit outside it, i.e. unhittable. LakeBoss overrides the same
   * way for the same reason: composite bodies must publish their real extent.
   */
  getHitbox() {
    const r = this.bodyRect();
    return {
      x: r.left,
      y: r.top,
      width: r.cols * r.pitch,
      height: r.rows * r.pitch,
    };
  }

  mouthX() { return this.rootX(); }
  mouthY() {
    // Mouth sits at the bottom edge of the body block (facing the player).
    return this.rootY() + (this.bodyRows * GLYPH_PITCH()) / 2;
  }

  /** World-space px of the current true glint (phase 2 weak point). */
  glintPx() {
    const pos = GLINT_POSITIONS[this.glintIndex % GLINT_POSITIONS.length];
    return this.offsetPx(pos.dx, pos.dy);
  }

  /**
   * Nearest intact scale to a world-space point, bounded by reach.
   * Returns { key, row, col, x, y } or null — null meaning the strike landed
   * nowhere near armor, which is a miss rather than a free chip anywhere on
   * the body.
   */
  nearestScale(px, py) {
    let best = null;
    let bestDist = SCALE_REACH();
    for (const key of this.scales) {
      const [row, col] = key.split(',').map(Number);
      const { x, y } = this.glyphAt(row, col);
      const d = Math.hypot(x - px, y - py);
      if (d < bestDist) { bestDist = d; best = { key, row, col, x, y }; }
    }
    return best;
  }

  // ── Core update (replaces Enemy AI) ────────────────────────────────────────
  update(deltaTime) {
    // ── Clock boundary ──────────────────────────────────────────────────────
    // deltaTime arrives on the ENEMY clock (dt × ENEMY_TIMER_RATE), because the
    // maw rides floor.enemies and DungeonSystem's interior loop drives it like
    // any other enemy. Base-class bookkeeping is authored on that clock and
    // keeps the raw value; every bespoke timer below is authored in real
    // seconds and reads `dt`. One conversion, one place — [clock-mismatch].
    if (this.invulnerabilityTimer > 0) {
      this.invulnerabilityTimer = Math.max(0, this.invulnerabilityTimer - deltaTime);
    }
    this.dotBlinkTimer += deltaTime;
    const dotDamageEvents = this.updateStatusEffects(deltaTime);
    const dt = deltaTime / PHYSICS.ENEMY_TIMER_RATE;

    // Static mass: PhysicsSystem must never drift the body.
    this.targetVelocity.vx = 0;
    this.targetVelocity.vy = 0;
    this.velocity.vx = 0;
    this.velocity.vy = 0;

    this.hitFlash = Math.max(0, this.hitFlash - dt);

    // Breath rhythm runs in every phase — it IS the glint tell (phase 2), and
    // the body has to visibly move on it or the tell cannot be read at all.
    this.glintPulseTimer += dt;
    while (this.glintPulseTimer >= GLINT_PULSE_PERIOD) {
      this.glintPulseTimer -= GLINT_PULSE_PERIOD;
      this.glintPulseCount++;
      this._onBreathPulse();
    }

    this._tickDeform(dt);

    // Dormant prologue: scenery until the player crosses the wake line. The
    // bookkeeping above still runs so nothing stalls, but no AI and no breath
    // migration — it is pretending to be furniture.
    if (this.dormant) return { dotDamage: dotDamageEvents };

    // Live child tongue ticks with us (real seconds — its own constants are).
    if (this.tongue) {
      this.tongue.update(dt, this.target);
      if (this.tongue.done) this.tongue = null;
    }

    // Cooldowns tick always.
    this.slamCooldown = Math.max(0, this.slamCooldown - dt);
    this.inhaleCooldown = Math.max(0, this.inhaleCooldown - dt);
    this.tongueCooldown = Math.max(0, this.tongueCooldown - dt);
    this.fanCooldown = Math.max(0, this.fanCooldown - dt);
    this.glintTellTimer = Math.max(0, this.glintTellTimer - dt);

    switch (this.bossPhase) {
      case 1: this._updateScaled(dt); break;
      case 2: this._updateGlinting(dt); break;
      case 3: this._updateBribe(dt); break;
    }

    return { dotDamage: dotDamageEvents };
  }

  /**
   * Body deform: the root's vertical offset and the lid angle, one pose at a
   * time. Poses are exclusive and ordered by urgency — a choking maw is not
   * also flinching — so the body never reads as two things at once.
   *
   * Nothing here moves the maw horizontally. A chest that slides is a chest
   * on wheels; the whole threat is that it does not have to come to you.
   */
  _tickDeform(dt) {
    const cell = GRID.CELL_SIZE;
    this.breathPhase = (this.breathPhase + dt / BREATH_PERIOD) % 1;
    this.slamRecoil = Math.max(0, this.slamRecoil - dt);

    for (let i = this.dents.length - 1; i >= 0; i--) {
      this.dents[i].t -= dt;
      if (this.dents[i].t <= 0) this.dents.splice(i, 1);
    }

    // Dormant it is scenery and holds perfectly still — a pile of coins that
    // breathes gives the ambush away before the player is close enough for it
    // to matter.
    if (this.dormant) {
      this.anchorY = 0;
      this.lidOpen = 0;
      return;
    }

    let poseY = 0;
    let lidTarget = LID_REST;
    let lidRate = LID_OPEN_RATE;
    let lidEase = 'easeOut';

    if (this.chokeTimer > 0) {
      // Jammed open around its own hoard, hauled upright and stuck there.
      poseY = -REAR_LIFT * 0.5 * cell;
      lidTarget = LID_CHOKE;
    } else if (this.slamRecoil > 0) {
      // Impact frame: driven down, lid shut hard, bouncing back out of it.
      const t = this.slamRecoil / SLAM_RECOIL;
      poseY = SLAM_DROP * cell * applyEasing(t, 'easeOut');
      lidTarget = 0;
      lidRate = LID_SLAM_RATE;
      lidEase = 'easeIn';
    } else if (this.attackState === 'slamTele') {
      // Rearing: it needs somewhere to fall from, and the rise is the tell.
      const t = Math.min(1, this.attackTimer / SLAM_TELEGRAPH);
      poseY = -REAR_LIFT * cell * applyEasing(t, 'easeOut');
      lidTarget = LID_REAR;
    } else if (this.attackState === 'inhale' || this.attackState === 'fanWindup'
               || this.attackState === 'tongueLive') {
      lidTarget = LID_GAPE;
    } else if (this.hitFlash > 0) {
      poseY = -RECOIL_LIFT * cell * (this.hitFlash / HIT_FLASH_TIME);
    }

    // Phase 3 shakes underneath whatever pose is running, harder with every
    // refusal banked — the convulsion escalates because the player made it.
    if (this.bossPhase === 3 && this.chokeTimer <= 0) {
      const amp = CONVULSE_BASE * cell * (1 + this.bribeRefusals);
      poseY += Math.sin(this.breathPhase * Math.PI * 2 * 9) * amp;
    }

    // Breath rides on top of everything: the body is never entirely still.
    poseY += Math.sin(this.breathPhase * Math.PI * 2) * BREATH_BOB * cell;

    this.anchorY = poseY;

    // Lid chases its target at the pose's own rate. Opening is unhurried and
    // decelerates; shutting accelerates into the stop, which is what makes a
    // slam read as weight rather than as a sprite swapping frames.
    const gap = lidTarget - this.lidOpen;
    if (Math.abs(gap) > 0.001) {
      const step = lidRate * dt;
      const travel = Math.min(1, step / Math.max(0.001, Math.abs(gap)));
      this.lidOpen += gap * applyEasing(travel, lidEase);
    } else {
      this.lidOpen = lidTarget;
    }
  }

  /**
   * One breath. Phase 2 walks the glint cycle on it — the rhythm IS the tell.
   * The order is fixed and the start deterministic, so a returning player can
   * pre-position and end the phase in seconds (doc: repeat-visit mastery).
   */
  _onBreathPulse() {
    if (this.bossPhase !== 2) return;
    if (this.glintPulseCount % GLINT_MIGRATE_PULSES !== 0) return;
    this.glintIndex = (this.glintIndex + 1) % GLINT_POSITIONS.length;
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
    // Choke window: the earned kill window. The body hangs open and does
    // nothing else — that stillness is what makes the window feel earned.
    if (this.chokeTimer > 0) {
      this.chokeTimer -= deltaTime;
      this.attackState = 'idle';
      return;
    }
    // Offer loop: mound goes out, timer runs; refusals counted by the system
    // (which watches the player's actual behavior — grab vs. stand off).
    this.bribeOfferTimer -= deltaTime;

    // It is still a boss between offers. Without this the "escalating
    // convulsion" is a still image and phase 3 is a waiting room.
    if (this.attackState === 'idle') {
      const pick = this._pickAttack();
      if (pick) this._beginAttack(pick);
    } else {
      this._tickAttack(deltaTime);
    }
  }

  // ── Attack implementations ─────────────────────────────────────────────────
  // Every branch here must name a state _tickAttack knows how to retire, or
  // the machine strands and the boss freezes mid-fight. Keep the two in step.
  _beginAttack(kind) {
    this.attackTimer = 0;
    switch (kind) {
      case 'slam':
        this.attackState = 'slamTele';
        this.slamCooldown = SLAM_COOLDOWN;
        break;
      case 'tongue': {
        this.attackState = 'tongueLive';
        this.tongueCooldown = TONGUE_COOLDOWN;
        // "Brightens two pulses when it reaches to grab" — the reach is the
        // one moment the weak point announces itself.
        this.glintTellTimer = GLINT_PULSE_PERIOD * GLINT_TELL_PULSES;
        const tx = this.target?.position.x ?? this.mouthX();
        const ty = this.target?.position.y ?? this.mouthY();
        this.tongue = new HoardmawTongue(this, this.mouthX(), this.mouthY(), tx, ty);
        break;
      }
      case 'inhale':
        this.attackState = 'inhale';
        this.inhaleCooldown = INHALE_COOLDOWN;
        this.inhaleActive = true;
        break;
      case 'fan':
        this.attackState = 'fanWindup';
        this.fanCooldown = FAN_COOLDOWN;
        break;
      default:
        this.attackState = 'idle';
    }
  }

  _tickAttack(deltaTime) {
    this.attackTimer += deltaTime;
    switch (this.attackState) {
      case 'slamTele':
        if (this.attackTimer >= SLAM_TELEGRAPH) {
          // Lid comes down: shockwave resolves outward from the body edge —
          // the flanks stay safe (proximity rewarded).
          this.slamLandedAt = { x: this.mouthX(), y: this.mouthY() };
          this.slamRecoil = SLAM_RECOIL;
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
      case 'fanWindup':
        // Scales it already lost, thrown back at the thief who took them.
        // Retiring to idle here is not optional: without it the state never
        // ends, the fan re-fires every frame, and no other attack is ever
        // picked again — the same strand shape the default case guards.
        if (this.attackTimer >= FAN_WINDUP) {
          this.fireScaleFan();
          this.attackState = 'idle';
        }
        break;
      case 'tongueLive':
        // Driven by the child entity; ends when it reports done above.
        if (!this.tongue) this.attackState = 'idle';
        break;
      default:
        // Unknown state — retire rather than strand. A frozen boss is a worse
        // failure than a skipped attack.
        this.attackState = 'idle';
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

  /**
   * The tongue reeled the player all the way home. Raises the spit signal —
   * the system owns the damage and the wall throw, because only it knows the
   * arena bounds to spit toward.
   */
  onSwallow() {
    this.onSwallowCount++;
    this.attackState = 'idle';
    this.swallowedAt = { px: this.mouthX(), py: this.mouthY() };
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

  /**
   * A chipped scale was swept back in — the cell it came from re-armors.
   * Restoring the ORIGINAL key (not an arbitrary free cell) is what makes the
   * loss legible: the gap you opened visibly closes again. Only phase 1 can
   * re-armor; once the hide is bare the phase has moved on and a swept scale
   * is just food.
   */
  restoreScale(key) {
    if (this.bossPhase !== 1) return false;
    if (this.scales.has(key)) return false;
    this.scales.add(key);
    return true;
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
  // Signature matches Enemy.takeDamage(amount, attackId, opts) — CombatSystem
  // passes the attack id positionally, so a bespoke `source` second argument
  // silently swallows every hit location. opts carries the strike's identity:
  //   { px, py, kind: 'melee'|'projectile', weaponSubtype? }
  // Returns true when the hit consumed something (callers gate feedback on
  // it — crack vs. ting).

  takeDamage(amount, attackId = null, opts = {}) {
    if (this.defeated) return false;
    if (this.invulnerabilityTimer > 0) return false;

    // An unlocated hit would collapse onto the body center and make both the
    // scale field and the glint decorative. Refuse it rather than grant a
    // free chip anywhere — the whole encounter is positional.
    const px = opts.px;
    const py = opts.py;
    if (!Number.isFinite(px) || !Number.isFinite(py)) return false;

    // Phase 1: scales eat everything. Ranged ricochets outright; whips never
    // chip (ArmorMechanic's hard-counter contract carried over). Both raise a
    // ricochet so the player is told WHY nothing happened — a silent no-op
    // reads as a broken hitbox.
    if (this.bossPhase === 1) {
      if (opts.kind === 'projectile' || opts.weaponSubtype === 'whip') {
        this.ricochetAt = { px, py };
        return false;
      }
      const hit = this.nearestScale(px, py);
      if (!hit) return false;
      this.scales.delete(hit.key);
      this.scaleChippedAt = { key: hit.key, px: hit.x, py: hit.y }; // system spawns the $
      // The armor has to visibly erode, not just stop being drawn: the cell
      // it left sinks inward for a moment before settling as bare hide.
      this.dents.push({ row: hit.row, col: hit.col, t: DENT_TIME });
      this.hitFlash = HIT_FLASH_TIME;
      if (this.scales.size === 0) this.pendingPhaseTransition = 2;
      return true;
    }

    // Phase 2: bare hide — only the glint bleeds.
    if (this.bossPhase === 2) {
      const g = this.glintPx();
      if (Math.hypot(g.x - px, g.y - py) > GLINT_REACH()) {
        this.ricochetAt = { px, py };
        return false;
      }
      return this._wound(amount);
    }

    // Phase 3: invulnerable except the choke window (glint exposed, lid hung).
    if (this.bossPhase === 3) {
      if (this.chokeTimer <= 0) {
        this.ricochetAt = { px, py };
        return false;
      }
      return this._wound(amount);
    }

    return false;
  }

  _wound(amount) {
    this.hp = Math.max(0, this.hp - amount);
    this.invulnerabilityTimer = 0.15;
    this.hasTakenDamage = true;
    this.hitFlash = HIT_FLASH_TIME;
    if (this.hp <= 0) this.markDefeated();
    return true;
  }

  /** Tongue broken by a struck player — let go and go back to idle. */
  releaseGrab() {
    if (this.tongue) {
      this.tongue.broken = true;
      this.tongue = null;
    }
    const p = this.target;
    if (p?.grabbedBy === this) {
      p.grabbed = false;
      p.grabbedBy = null;
    }
    this.attackState = 'idle';
  }
}

// ─── Derived geometry ───────────────────────────────────────────────────────
// Kept as functions rather than constants so they resolve against GRID at call
// time, and so the body's pitch has exactly one definition. Everything that
// measures against the maw's body goes through these.

// Body glyph pitch. The maw is drawn and struck on its own spacing, not the
// arena cell grid — see the geometry block on the class.
// Sub-cell: the body is denser than the arena grid, so an 11-wide chest reads
// as one solid object instead of a sparse dot field spread over 11 cells.
// This number and HoardmawRenderer must only ever move together — hit geometry
// is authored against it.
const GLYPH_PITCH_SCALE = 0.55;
function GLYPH_PITCH() { return GRID.CELL_SIZE * GLYPH_PITCH_SCALE; }

// How near a scale's center a strike must land to chip it.
function SCALE_REACH() { return GLYPH_PITCH() * 1.6; }

// Strike tolerance on the phase-2 glint. Generous enough to be a skill check
// rather than a pixel hunt — the read is the timing, not the aim.
function GLINT_REACH() { return GRID.CELL_SIZE * 1.2; }

// Tongue reach helper kept outside the class so the constant table stays at top.
function TONGUE_REACH() { return GRID.CELL_SIZE * 5.5; }
