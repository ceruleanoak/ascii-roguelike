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
const FAN_COOLDOWN     = 5.0;   // phase-1 only — "victory lap" once the armor's gone
const FAN_COUNT        = 7;
const FAN_SPEED        = 150;
const FAN_ARC          = Math.PI / 3;
const FAN_WINDUP       = 0.55;  // lid cracks and gathers before the spray
const HIT_FLASH_TIME   = 0.12;  // white-out on a landed hit

// ── Hoard Reveal ────────────────────────────────────────────────────────────
// Replaces both the interior's static dressing and the scrapped "feed coins
// through the seam" Justice mechanic. Own cooldown, phase-1 rotation only.
const HOARD_REVEAL_COOLDOWN  = 8.0;
const HOARD_LEAN_TIME        = 0.9;   // lean-forward tell before the spill
export const HOARD_TREASURE_COUNT = 6;
const HOARD_SPILL_WINDOW     = 2.4;   // spilled treasure is hittable this long
const HOARD_RETRIEVE_TIME    = 1.6;   // retrieval pull duration (Inhale's job now)
const HOARD_RETRIEVE_PULL    = 140;   // px/s treasure is pulled back at
const HOARD_SCATTER_SPEED    = 210;   // px/s a piece spills out at
const HOARD_DECAY_RATE       = 0.88;  // per-tick-at-60fps velocity decay (WorldEffectsSystem shape)
const HOARD_TREASURE_HP      = 2;     // hits to destroy one spilled piece
// Exposed and waiting: the spill is a response to being struck, not a timer
// firing on its own — "hitting the hoard" is what spills it. The timeout is
// a fallback only, so a player who disengages doesn't stall the boss forever.
const HOARD_WAIT_TIMEOUT     = 3.0;
const HOARD_MAX_CYCLES       = 2;     // spill→retrieve repetitions per reveal
// How close a strike on the open mouth must land, during the tongue's
// pre-sweep telegraph, to count as the brave-attack interrupt.
const MOUTH_STRIKE_REACH     = GRID.CELL_SIZE * 1.6;

// ── Tongue ───────────────────────────────────────────────────────────────
const TONGUE_COOLDOWN       = 6.0;
const TONGUE_TELEGRAPH_TIME = 0.85;  // fixed-area filled/blinking lane tell

// ── Vulnerable / Endurance cycle (phase 2) ──────────────────────────────────
// Fixed, non-hit-reset punish window: "inevitable — it's a matter of how many
// times the player lets the punish run," not a race against a re-armed timer.
export const VULNERABLE_WINDOW_DURATION = 5.0;
const ENDURANCE_COIN_INTERVAL = 0.9;   // seconds between bounced coins
const ENDURANCE_COIN_SPEED    = 190;   // px/s, fixed — not the old randomized fan spread
const ENDURANCE_COIN_LIFETIME = 8.0;   // safety despawn if never touched

// ── Temptation (phase 3, ≤10% HP) ───────────────────────────────────────────
export const TEMPTATION_HP_THRESHOLD = HOARDMAW_MAX_HP * 0.10;
export const TEMPTATION_PILE_SELF_DAMAGE = 10;

// ─── Deform tuning ──────────────────────────────────────────────────────────
// It is a chest. Everything here is deliberately restrained: a chest that
// squashes and stretches stops being furniture and starts being a cartoon,
// and the horror only works while the object still looks like a thing you
// could have opened yourself. Total body travel stays close to one cell; all
// the character lives in the lid.

export const LID_REST   = 0.12;  // never fully shut — the sliver of dark IS the menace
export const LID_REAR   = 0.30;  // drawn back before a slam, gathering
export const LID_GAPE   = 0.70;  // inhale / tongue / fan: open and working
export const LID_REVEAL = 0.97;  // Hoard Reveal's lean — the mouth dominates the frame
export const LID_EXHAUSTED = 0.55; // Temptation's resting sag — hanging open, not working

const LID_OPEN_RATE = 1 / 0.30; // units/sec opening — unhurried, readable
const LID_SLAM_RATE = 1 / 0.12; // units/sec shutting — accelerating, heavy
const EXHAUST_SAG   = 0.22;     // cells the body settles down onto in Temptation

const BREATH_PERIOD  = 1.2;   // seconds per breath — the body's idle rhythm
const BREATH_BOB     = 0.15;  // cells — barely there, but the eye reads "alive"
const REAR_LIFT       = 1.10;  // cells it hauls itself up before a slam
const SLAM_DROP       = 0.35;  // cells it drives down through the floor on impact
const SLAM_RECOIL     = 0.28;  // seconds the impact frame decays over
const RECOIL_LIFT     = 0.25;  // cells it flinches back on taking a hit
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
 *   Phase 1 SCALED       — every intact scale absorbs one melee hit and flies
 *                          off as a `$` pickup (mint +1 coin when collected);
 *                          ranged attacks ricochet for nothing. No HP loss
 *                          while any scale remains. This is ArmorMechanic's
 *                          contract made positional — implemented natively
 *                          because the chunk model can't express a hit-
 *                          location grid (whip-immunity rule carries over).
 *   Phase 2 VULNERABLE/  — the whole body is damageable during a fixed-
 *          ENDURANCE       duration Vulnerable Window (not reset by landed
 *                          hits). On expiry the shield reforms (Endurance):
 *                          impervious again, emitting bouncing coins the
 *                          player must melee-redirect back into the boss to
 *                          reopen a fresh Vulnerable Window. Repeats until HP
 *                          crosses the Temptation threshold.
 *   Phase 3 TEMPTATION   — fully passive: no attacks, no shield, damageable
 *                          everywhere. A coin pile in a room corner punishes
 *                          greed (self-damage explosion); ignoring it and
 *                          finishing the boss is the win.
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
    this.bossPhase = 1;            // 1 scaled · 2 vulnerable/endurance · 3 temptation
    this.goldBreathFired = false;  // one-shot curse trigger signal (phase 2 entry)
    // Phase-2 substate: 'vulnerable' (full body hittable, fixed countdown) or
    // 'endurance' (shield reformed, bouncing coins, impervious except redirect).
    this.enduranceState = null;
    this.vulnerableTimer = 0;
    this.enduranceCoinTimer = 0;
    this.enduranceCoins = [];      // self-managed { x, y, vx, vy, redirected, life }

    // ── Attack state machine ────────────────────────────────────────────────
    // One attack at a time; idle otherwise. All timings real seconds.
    // idle | slamTele | tongueTelegraph | tongueLive | fanWindup |
    // hoardLean | hoardWait | hoardSpill | hoardRetrieve
    this.attackState = 'idle';
    this.attackTimer = 0;
    this.hoardCycle = 0;           // spill/retrieve repetitions this reveal
    this.slamCooldown = SLAM_COOLDOWN;
    this.tongueCooldown = TONGUE_COOLDOWN * 0.5;
    this.fanCooldown = FAN_COOLDOWN;
    this.hoardRevealCooldown = HOARD_REVEAL_COOLDOWN * 0.4; // an early first reveal
    this.tongue = null;            // live HoardmawTongue child

    // ── Hoard Reveal state ───────────────────────────────────────────────────
    // Self-managed spilled treasure — plain objects, not world Items: this is
    // boss-body-local content, drawn only by HoardmawRenderer (already gated
    // on isVault), same precedent as the tongue child.
    this.spilledTreasure = [];     // { x, y, vx, vy, hp, alive, char, color }

    // ── Signals polled by DungeonBossSystem ─────────────────────────────────
    this.pendingBossAttacks = [];  // projectiles (scale fan) for CombatSystem
    this.slamLandedAt = null;      // { x, y } — shockwave resolution site
    this.onSwallowCount = 0;       // player swallowed beats (tongue reached home)
    // Declared here rather than sprung into existence mid-hit: lazy property
    // init on a live entity is a listed anti-pattern (CLAUDE.md).
    this.pendingPhaseTransition = null; // 2 once the last scale falls
    this.scaleChippedAt = null;    // { key, px, py } — system spawns the `$`
    this.ricochetAt = null;        // { px, py } — a hit the armor turned away
    this.blockedAt = null;         // { px, py } — same beat, floating "BLOCKED" text
    this.swallowedAt = null;       // { px, py } — spit-out site after a swallow
    this.enduranceKnockbackAt = null; // { x, y } — shove as the shield reforms
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

    this.defeated = false;
  }

  // ── Geometry: one transform, every consumer ───────────────────────────────
  //
  // The body is drawn and struck on the maw's OWN glyph pitch, anchored to a
  // root that moves (breath, rear-up, slam). Hit math, the mouth and the
  // renderer all resolve through offsetPx()/glyphAt(), so the picture and the
  // hitboxes cannot drift apart. Anything that needs a point on this body
  // asks here — never recomputes from position + CELL_SIZE.

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
   * against ~4% of the visible mass. Most of the scale field sits outside it,
   * i.e. unhittable. LakeBoss overrides the same way for the same reason:
   * composite bodies must publish their real extent.
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
    this.breathPhase = (this.breathPhase + dt / BREATH_PERIOD) % 1;

    this._tickDeform(dt);

    // Dormant prologue: scenery until the player crosses the wake line. The
    // bookkeeping above still runs so nothing stalls, but no AI at all — it
    // is pretending to be furniture.
    if (this.dormant) return { dotDamage: dotDamageEvents };

    // Live child tongue ticks with us (real seconds — its own constants are).
    if (this.tongue) {
      this.tongue.update(dt, this.target);
      if (this.tongue.done) this.tongue = null;
    }

    this._tickSpilledTreasure(dt);
    if (this.bossPhase === 2) this._tickEndurance(dt);

    // Cooldowns tick always (phase 1 only meaningfully gates on them).
    this.slamCooldown = Math.max(0, this.slamCooldown - dt);
    this.tongueCooldown = Math.max(0, this.tongueCooldown - dt);
    this.fanCooldown = Math.max(0, this.fanCooldown - dt);
    this.hoardRevealCooldown = Math.max(0, this.hoardRevealCooldown - dt);

    switch (this.bossPhase) {
      case 1: this._updateScaled(dt); break;
      case 2: this._updateVulnerableEndurance(dt); break;
      case 3: this._updateTemptation(dt); break;
    }

    return { dotDamage: dotDamageEvents };
  }

  /**
   * Body deform: the root's vertical offset and the lid angle, one pose at a
   * time. Poses are exclusive and ordered by urgency, so the body never reads
   * as two things at once.
   *
   * Nothing here moves the maw horizontally. A chest that slides is a chest
   * on wheels; the whole threat is that it does not have to come to you.
   */
  _tickDeform(dt) {
    const cell = GRID.CELL_SIZE;
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

    if (this.slamRecoil > 0) {
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
    } else if (this.attackState === 'hoardLean' || this.attackState === 'hoardWait'
               || this.attackState === 'hoardSpill' || this.attackState === 'hoardRetrieve') {
      // Lean forward: the mouth dominates the frame. No horizontal travel —
      // the "lean" reads entirely through the fully-driven-open lid.
      lidTarget = LID_REVEAL;
    } else if (this.attackState === 'fanWindup' || this.attackState === 'tongueTelegraph'
               || this.attackState === 'tongueLive') {
      lidTarget = LID_GAPE;
    } else if (this.hitFlash > 0) {
      poseY = -RECOIL_LIFT * cell * (this.hitFlash / HIT_FLASH_TIME);
    } else if (this.bossPhase === 3) {
      // Temptation: spent. The mouth hangs open loosely rather than working —
      // no attack left in it, no reason to hold the jaw at a working angle.
      lidTarget = LID_EXHAUSTED;
      lidRate = LID_OPEN_RATE * 0.35;
      poseY = EXHAUST_SAG * cell;
    }

    // Breath rides on top of everything: the body is never entirely still.
    // Exhausted breathing is shallower than the idle rhythm.
    const breathAmp = this.bossPhase === 3 ? BREATH_BOB * 0.4 : BREATH_BOB;
    poseY += Math.sin(this.breathPhase * Math.PI * 2) * breathAmp * cell;

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

  _pickAttack() {
    // Rotation preference: slam → tongue → hoard reveal → fan. Whatever is
    // off cooldown first fires; all close-range by design (no kiting exists).
    if (this.slamCooldown <= 0) return 'slam';
    if (this.tongueCooldown <= 0 && this.target
        && this._distToTarget() < TONGUE_REACH()) return 'tongue';
    if (this.hoardRevealCooldown <= 0) return 'hoardReveal';
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

  /**
   * Phase 2: alternates a fixed-duration Vulnerable Window (full body
   * damageable, countdown never reset by landed hits) with an Endurance
   * phase (shield reformed, bouncing coins — see _tickEndurance). No other
   * attack continues into this phase: it is a focused two-state loop.
   */
  _updateVulnerableEndurance(deltaTime) {
    // Gold Breath fires exactly once at phase entry (signal → system applies
    // the coin-slot curse). Kept as a poll flag so the entity stays decoupled.
    if (!this.goldBreathFired) this.goldBreathFired = true;

    if (this.enduranceState === 'vulnerable') {
      // Fixed countdown — NOT reset by landed hits. Punish is inevitable; the
      // only variable is how many hits the player lands before it runs out.
      this.vulnerableTimer = Math.max(0, this.vulnerableTimer - deltaTime);
      if (this.vulnerableTimer <= 0) this._enterEndurance();
    }
    // Endurance itself is ticked in update() via _tickEndurance every frame
    // regardless of bossPhase dispatch ordering, so nothing else runs here.
  }

  _updateTemptation() {
    // Fully passive: no attacks, no shield. Stillness is the "right choice"
    // being visibly available at every moment.
    this.attackState = 'idle';
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
      case 'tongue':
        // Telegraph first: a fixed-area, filled, blinking lane across the
        // room (house Telegraph rule — no growth, no outline). The live
        // tongue only spawns once the telegraph resolves (_tickAttack).
        this.attackState = 'tongueTelegraph';
        this.tongueCooldown = TONGUE_COOLDOWN;
        break;
      case 'hoardReveal':
        this.attackState = 'hoardLean';
        this.hoardRevealCooldown = HOARD_REVEAL_COOLDOWN;
        this.hoardCycle = 0;
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
      case 'tongueTelegraph':
        if (this.attackTimer >= TONGUE_TELEGRAPH_TIME) {
          const tx = this.target?.position.x ?? this.mouthX();
          const ty = this.target?.position.y ?? this.mouthY();
          this.tongue = new HoardmawTongue(this, this.mouthX(), this.mouthY(), tx, ty);
          this.attackState = 'tongueLive';
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
      case 'hoardLean':
        // Lean finishes into an exposed wait, NOT an automatic spill — the
        // spill is a response to being struck (takeDamage's hoardWait
        // branch). The timeout below is only a fallback for a player who
        // disengages entirely.
        if (this.attackTimer >= HOARD_LEAN_TIME) {
          this.attackState = 'hoardWait';
          this.attackTimer = 0;
        }
        break;
      case 'hoardWait':
        if (this.attackTimer >= HOARD_WAIT_TIMEOUT) {
          this._spillTreasure();
          this.attackState = 'hoardSpill';
          this.attackTimer = 0;
        }
        break;
      case 'hoardSpill':
        // Ends early once every spilled piece is destroyed, or on the window
        // timing out — whichever comes first.
        if (this.spilledTreasure.length === 0 || this.attackTimer >= HOARD_SPILL_WINDOW) {
          this.attackState = 'hoardRetrieve';
          this.attackTimer = 0;
        }
        break;
      case 'hoardRetrieve':
        // Ends early once everything is gone (destroyed or retrieved), or on
        // the timeout — whichever comes first. What's left alive gets pulled
        // back in; then, if the reveal hasn't run its full cycle count yet,
        // the mouth stays open for another wait→spill→retrieve pass instead
        // of snapping shut — the breathing loop the fight was missing.
        if (this.spilledTreasure.length === 0 || this.attackTimer >= HOARD_RETRIEVE_TIME) {
          this.spilledTreasure.length = 0;
          this.hoardCycle++;
          if (this.hoardCycle < HOARD_MAX_CYCLES) {
            this.attackState = 'hoardWait';
          } else {
            this.attackState = 'idle';
          }
          this.attackTimer = 0;
        }
        break;
      default:
        // Unknown state — retire rather than strand. A frozen boss is a worse
        // failure than a skipped attack.
        this.attackState = 'idle';
    }
  }

  /** Fan of chipped scales — its lost wealth turned weapon. Phase 1 only. */
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

  /** Spill treasure outward from the mouth with decaying velocity (Hoard Reveal). */
  _spillTreasure() {
    this.spilledTreasure = [];
    for (let i = 0; i < HOARD_TREASURE_COUNT; i++) {
      const angle = (-Math.PI / 2) + (Math.random() - 0.5) * Math.PI * 0.8;
      const speed = HOARD_SCATTER_SPEED * (0.6 + Math.random() * 0.6);
      this.spilledTreasure.push({
        x: this.mouthX(), y: this.mouthY(),
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 40,
        hp: HOARD_TREASURE_HP,
        alive: true,
        char: Math.random() < 0.5 ? '$' : 'o',
        color: '#ffd700',
      });
    }
  }

  /**
   * Decaying-velocity scatter, then a pull-back retrieval — the same shape
   * WorldEffectsSystem's particle families author (decayRate constants),
   * reused here rather than inventing new physics.
   */
  _tickSpilledTreasure(dt) {
    if (!this.spilledTreasure.length) return;
    const decay = Math.pow(HOARD_DECAY_RATE, dt * 60);
    const retrieving = this.attackState === 'hoardRetrieve';
    const mx = this.mouthX();
    const my = this.mouthY();

    for (let i = this.spilledTreasure.length - 1; i >= 0; i--) {
      const t = this.spilledTreasure[i];
      if (!t.alive) { this.spilledTreasure.splice(i, 1); continue; }

      if (retrieving) {
        // Retrieval: pulled back in — Inhale's sole remaining job, same pull
        // math LureMechanic uses, retargeted from the player to treasure.
        const dx = mx - t.x, dy = my - t.y;
        const d = Math.hypot(dx, dy) || 1;
        if (d < GRID.CELL_SIZE * 0.6) { this.spilledTreasure.splice(i, 1); continue; }
        t.x += (dx / d) * HOARD_RETRIEVE_PULL * dt;
        t.y += (dy / d) * HOARD_RETRIEVE_PULL * dt;
      } else {
        t.vx *= decay;
        t.vy *= decay;
        t.x += t.vx * dt;
        t.y += t.vy * dt;
      }
    }
  }

  /**
   * A spilled piece was struck. Un-spilled (interior dressing) treasure is
   * never a target — this is only ever called against `spilledTreasure`
   * entries, which is the whole point: only spilled treasure is vulnerable.
   */
  strikeTreasure(px, py) {
    if (this.attackState !== 'hoardSpill') return false;
    for (const t of this.spilledTreasure) {
      if (!t.alive) continue;
      if (Math.hypot(t.x - px, t.y - py) > GRID.CELL_SIZE * 1.2) continue;
      t.hp--;
      if (t.hp <= 0) t.alive = false;
      return true;
    }
    return false;
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

  // ── Vulnerable / Endurance cycle ────────────────────────────────────────────

  /**
   * Shield reforms: impervious again, and coins start bouncing off the mouth.
   * Hesitation is punished twice over — first the shove that buys the armor
   * room to close, then the endurance gauntlet itself.
   */
  _enterEndurance() {
    this.enduranceState = 'endurance';
    this.enduranceCoinTimer = 0.3; // a quick first coin
    this.enduranceKnockbackAt = { x: this.mouthX(), y: this.mouthY() };
  }

  /** A coin was redirected home, or the window is opened fresh (phase entry). */
  _enterVulnerable() {
    this.enduranceState = 'vulnerable';
    this.vulnerableTimer = VULNERABLE_WINDOW_DURATION;
    this.enduranceCoins.length = 0;
  }

  /** Melee-redirected a coin all the way into the boss — ends Endurance. */
  breakEndurance() {
    if (this.enduranceState !== 'endurance') return;
    this._enterVulnerable();
  }

  /**
   * Bouncing coin projectiles, fixed velocity + specific vector (toward the
   * target at spawn, not a randomized spread). Bounces off a fixed arena
   * rectangle around the body — the vault's north half. DungeonBossSystem
   * checks these against live melee attacks each tick to detect the
   * redirect; this entity owns only their flight physics.
   */
  _tickEndurance(dt) {
    if (this.enduranceState !== 'endurance') return;

    this.enduranceCoinTimer -= dt;
    if (this.enduranceCoinTimer <= 0 && this.target) {
      this.enduranceCoinTimer = ENDURANCE_COIN_INTERVAL;
      const angle = Math.atan2(this.target.position.y - this.mouthY(),
                               this.target.position.x - this.mouthX());
      this.enduranceCoins.push({
        x: this.mouthX(), y: this.mouthY(),
        vx: Math.cos(angle) * ENDURANCE_COIN_SPEED,
        vy: Math.sin(angle) * ENDURANCE_COIN_SPEED,
        redirected: false,
        life: ENDURANCE_COIN_LIFETIME,
      });
    }

    const bounds = this._enduranceBounds();
    for (let i = this.enduranceCoins.length - 1; i >= 0; i--) {
      const c = this.enduranceCoins[i];
      c.life -= dt;
      if (c.life <= 0) { this.enduranceCoins.splice(i, 1); continue; }

      if (c.redirected) {
        // Homing back into the boss — arrival is resolved by the system
        // (which already ended Endurance the instant it redirected the hit).
        const dx = this.mouthX() - c.x, dy = this.mouthY() - c.y;
        const d = Math.hypot(dx, dy) || 1;
        c.x += (dx / d) * ENDURANCE_COIN_SPEED * dt;
        c.y += (dy / d) * ENDURANCE_COIN_SPEED * dt;
        if (d < GRID.CELL_SIZE * 0.6) this.enduranceCoins.splice(i, 1);
        continue;
      }

      c.x += c.vx * dt;
      c.y += c.vy * dt;
      if (c.x < bounds.left || c.x > bounds.right) c.vx = -c.vx;
      if (c.y < bounds.top || c.y > bounds.bottom) c.vy = -c.vy;
      c.x = Math.min(bounds.right, Math.max(bounds.left, c.x));
      c.y = Math.min(bounds.bottom, Math.max(bounds.top, c.y));
    }
  }

  /** Fixed bounce rectangle around the body — the vault's north-half arena. */
  _enduranceBounds() {
    const cell = GRID.CELL_SIZE;
    return {
      left: this.mouthX() - cell * 6.5,
      right: this.mouthX() + cell * 6.5,
      top: this.rootY() - cell * 5,
      bottom: this.mouthY() + cell * 7,
    };
  }

  // ── Phase transitions (driven by DungeonBossSystem) ────────────────────────

  /** All scales stripped → Vulnerable/Endurance. Low HP → Temptation. */
  transitionToPhase(phase) {
    this.bossPhase = phase;
    this.attackState = 'idle';
    this.tongue = null;
    this.spilledTreasure.length = 0;
    if (phase === 2) {
      this._enterVulnerable();
    } else if (phase === 3) {
      this.enduranceState = null;
      this.enduranceCoins.length = 0;
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

    // An unlocated hit would collapse onto the body center and make the
    // scale field decorative. Refuse it rather than grant a free chip
    // anywhere — the whole encounter is positional.
    const px = opts.px;
    const py = opts.py;
    if (!Number.isFinite(px) || !Number.isFinite(py)) return false;

    // Brave-attack interrupt: a hit on the open mouth during the tongue's
    // pre-sweep telegraph triggers Hoard Reveal early — a deliberate
    // risk/reward tie between the two attacks. Checked ahead of the phase
    // branches below since it can fire in phase 1 regardless of scale state.
    if (this.attackState === 'tongueTelegraph'
        && Math.hypot(this.mouthX() - px, this.mouthY() - py) < MOUTH_STRIKE_REACH) {
      this.attackState = 'hoardLean';
      this.attackTimer = 0;
      this.tongue = null;
      return true;
    }

    // The hoard's own wait beat: exposed and sitting open, it spills in
    // response to being struck rather than on a timer — "hitting the hoard"
    // is what spills it (the fallback timeout in _tickAttack only covers a
    // player who has disengaged entirely).
    if (this.attackState === 'hoardWait'
        && Math.hypot(this.mouthX() - px, this.mouthY() - py) < MOUTH_STRIKE_REACH) {
      this._spillTreasure();
      this.attackState = 'hoardSpill';
      this.attackTimer = 0;
      return true;
    }

    // Phase 1: scales eat everything. Ranged ricochets outright; whips never
    // chip (ArmorMechanic's hard-counter contract carried over). Both raise a
    // ricochet (+ a floating "BLOCKED" text) so the player is told WHY
    // nothing happened — a silent no-op reads as a broken hitbox.
    if (this.bossPhase === 1) {
      if (opts.kind === 'projectile' || opts.weaponSubtype === 'whip') {
        this.ricochetAt = { px, py };
        this.blockedAt = { px, py };
        return false;
      }
      // Hoard Reveal's spilled treasure takes priority over the scale field
      // while it's out — the whole point of the state is that IT is what's
      // hittable, not the armor underneath it.
      if (this.attackState === 'hoardSpill' && this.strikeTreasure(px, py)) {
        return true;
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

    // Phase 2: Vulnerable Window = whole body damageable. Endurance = shield
    // reformed, impervious to direct damage (the coin redirect is the only
    // way through, handled by DungeonBossSystem via breakEndurance()).
    if (this.bossPhase === 2) {
      if (this.enduranceState === 'vulnerable') {
        return this._wound(amount);
      }
      this.ricochetAt = { px, py };
      this.blockedAt = { px, py };
      return false;
    }

    // Phase 3: fully passive and damageable everywhere.
    if (this.bossPhase === 3) {
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

// Tongue reach helper kept outside the class so the constant table stays at top.
function TONGUE_REACH() { return GRID.CELL_SIZE * 5.5; }
