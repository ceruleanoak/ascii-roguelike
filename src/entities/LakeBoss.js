import { GRID } from '../game/GameConfig.js';
import { isImmuneToEffect, getElementalModifierFor } from './elementalAffinity.js';

export const LAKE_BOSS_MAX_HP  = 80;
// 40% of max HP. Arms the Freeze-Over; the next slam carries it as its payload.
// Also the enrage tint threshold BossRenderer reads as hp/maxHp < 0.4.
export const LAKE_BOSS_PHASE2_HP_THRESHOLD = 32;
const ICE_STREAM_SHOTS         = 5;
const ICE_STREAM_SPEED         = 110;
const CONE_SPREAD              = Math.PI / 5;   // ±36° total cone
const SHOT_STAGGER             = 0.8;           // seconds between sequential shots
const HAMMER_RANGE_SQ          = (GRID.CELL_SIZE * 3) ** 2;
const HAMMER_COUNTDOWN         = 3.0;
const HAMMER_COUNTDOWN_ON_HIT  = 2.5;  // damage window before slam when struck
const UNDERWATER_SPEED         = 55;
const MOUTH_CYCLE              = 2.0;
const JUMP_RISE_TIME           = 0.75;
const JUMP_FALL_TIME           = 0.40;
const JUMP_HEIGHT_PX           = GRID.CELL_SIZE * 5;

// ── Phase 2 (post Freeze-Over) ──────────────────────────────────────────────
// All Double-seconds, like every other timer here — the boss is stepped on the
// enemy clock (deltaTime * PHYSICS.ENEMY_TIMER_RATE), so halve these to read
// them as real seconds. Starting values, tuned by playtest (see bug #216: they
// were authored against the corrected single-drive clock, not the old 3x one).
const STALK_SPEED              = 78;    // vs UNDERWATER_SPEED 55 — the hunt is faster
const STALK_TIMEOUT            = 16.0;  // force a Breach even if the player is unreachable
const BREACH_RANGE_SQ          = (GRID.CELL_SIZE * 1.2) ** 2;
const BREACH_TELEGRAPH         = 2.4;   // the anticipation window, held under the ice
const SURFACED_WINDOW          = 8.0;   // fixed vulnerable window before submerging again
const LEAD_RADIUS              = GRID.CELL_SIZE * 1.5;  // the sliver of open water a Breach opens

export class LakeBoss {
  constructor(x, y, waterTiles = []) {
    this.char   = '~';   // placeholder — skipped by normal render loop
    this.hp     = LAKE_BOSS_MAX_HP;
    this.maxHp  = LAKE_BOSS_MAX_HP;
    this.damage = 3;
    this.mass = 20;
    this.isBossEntity   = true;
    this.isBossLakeBoss = true;
    this._frameUpdateResult = null; // canonical-tick cache, see Enemy.js / bug #92

    this.position = { x, y };
    this.width    = GRID.CELL_SIZE;
    this.height   = GRID.CELL_SIZE;
    this.color    = '#aaffff';

    this.invulnerabilityTimer    = 0;
    this.invulnerabilityDuration = 0.15;
    this.hitFlash = false; // true only when iframes were triggered by player damage
    this.hasTakenDamage = false;
    this.enteredSlamming = false; // one-shot slam-entry signal drained by BossSystem

    // State machine. Phase 1: 'underwater' | 'surfaced' | 'slamming'.
    // Phase 2 replaces the phase-1 loop outright: 'stalking' | 'breaching' | 'surfaced'.
    // This is the boss's own private machine — LakeBoss does not extend Enemy and is
    // not on the Enemy State spine, so these ids do not extend that closed set.
    this.state = 'underwater';

    // Phase 2 — the Freeze-Over rework. `phase` flips only via transitionToPhase(2).
    this.phase           = 1;
    this.freezeOverArmed = false;  // set by BossSystem at the HP threshold
    this.stalkTimer      = 0;
    this.breachTimer     = 0;
    this.surfacedTimer   = 0;
    this.pendingLead     = null;   // { x, y, radius } drained by BossSystem
    this.pendingFreezeOver = false;// one-shot: the slam that flips the board

    // Underwater movement
    this.waterTiles       = waterTiles;
    this.underwaterTarget = null;

    // Ice attack timer (scales with HP)
    this.attackTimer = 2.0;  // initial surface delay before first shot

    // Hammer sequence: null = waiting for player; counting down = triggered
    this.hammerCountdown      = null;
    this._passiveHammerTimer  = 18.0;  // force slam after 18s if player never approaches

    // Slam jump animation
    this.jumpOffset = 0;
    this.jumpPhase  = 'none';  // 'none' | 'rise' | 'fall'
    this.jumpTimer  = 0;

    // Mouth animation
    this.mouthTimer = 0;
    this.mouthPhase = 0;

    // Attack queue drained by BossSystem
    this.pendingBossAttacks = [];

    // Ice-break signal set after slam; cleared by BossSystem
    this.pendingIceBreak = false;
    this.slamPosition    = null;

    this.target   = null;
    this.velocity = { vx: 0, vy: 0 };  // stub for shared loops

    // Shared-loop stubs: CombatSystem inspects these on every melee/projectile
    // hit. LakeBoss exposes a hitbox (most bosses don't), so it reaches those
    // branches. Matches Enemy.js shape so freeze etc. resolve cleanly.
    this.statusEffects = {
      burn:      { active: false, duration: 0, damage: 0.5, tickRate: 2.5, tickTimer: 0 },
      poison:    { active: false, duration: 0, damage: 0.3, tickRate: 0.3, tickTimer: 0 },
      freeze:    { active: false, duration: 0, slowAmount: 0.5, frozen: false, shuddering: false },
      stun:      { active: false, duration: 0 },
      sleep:     { active: false, duration: 0 },
      charm:     { active: false, duration: 0 },
      wet:       { active: false, duration: 0 },
      knockback: { active: false, duration: 0 },
      blind:     { active: false, duration: 0 },
      dizzy:     { active: false, duration: 0 },
      goo:       { active: false, duration: 0, slowAmount: 0.8 }
    };
    this.detectionIndicatorTimer = 0;

    // Ice-affinity boss: immune to freeze, weak to burn. Data-driven so it reads the
    // same as every other enemy's `elementalAffinity` (LakeBoss doesn't extend Enemy,
    // but getElementalModifier/shouldApplyStatusEffect below route through the same
    // shared rules via elementalAffinity.js).
    this.elementalAffinity = {
      immunity:   ['freeze'],
      resistance: {},
      weakness:   { burn: 2.0 }
    };

    this._pickNewTarget();
  }

  // ── Public interface ────────────────────────────────────────────────────────

  setGame(game) { this.game = game; }
  setRoom(room) { this.room = room; }

  get vulnerable() { return this.invulnerabilityTimer <= 0; }

  takeDamage(amount) {
    // Any hit while surfaced starts (or resets) the slam countdown, giving the
    // player a damage window before the boss dives. Clear queued ice shots so
    // nothing fires into that window.
    if (this.state === 'surfaced') {
      this.pendingBossAttacks = [];
      if (this.hammerCountdown === null || this.hammerCountdown > HAMMER_COUNTDOWN_ON_HIT)
        this.hammerCountdown = HAMMER_COUNTDOWN_ON_HIT;
    }

    if (!this.vulnerable) return false;
    this.hp = Math.max(0, this.hp - amount);
    this.invulnerabilityTimer = this.invulnerabilityDuration;
    this.hitFlash = true;
    this.hasTakenDamage = true;
    return amount;
  }

  // Near-death warning: blink dark red at ≤30% HP — same signal as the player
  // and Enemy.getNearDeathBlinkColor (LakeBoss doesn't extend Enemy).
  getNearDeathBlinkColor() {
    if (this.hp <= 0 || this.hp > this.maxHp * 0.3) return null;
    return Math.floor(Date.now() / 250) % 2 === 0 ? '#660000' : null;
  }

  update(deltaTime) {
    if (this.invulnerabilityTimer > 0) {
      this.invulnerabilityTimer = Math.max(0, this.invulnerabilityTimer - deltaTime);
      if (this.invulnerabilityTimer === 0) this.hitFlash = false;
    }

    switch (this.state) {
      case 'underwater': this._updateUnderwater(deltaTime); break;
      case 'surfaced':   this._updateSurfaced(deltaTime);   break;
      case 'slamming':   this._updateSlamming(deltaTime);   break;
      case 'stalking':   this._updateStalking(deltaTime);   break;
      case 'breaching':  this._updateBreaching(deltaTime);  break;
    }

    // Never let the physics system drift the boss off its water tiles
    this._clampToWater();
    this.velocity.vx = 0;
    this.velocity.vy = 0;

    return { dotDamage: [] };
  }

  setCollisionMap() {}
  setBackgroundObjects() {}
  setTarget(t) { this.target = t; }
  setWaterTiles(tiles) { this.waterTiles = tiles; }

  // Combat loop stubs — boss attacks via BossSystem/_drainPendingAttacks
  canAttack()                { return false; }
  createAttack()             { return null; }
  createWindupAttackVisual() { return null; }
  isWindingUp()              { return false; }
  isCharmed()                { return false; }
  isFrozen()                 { return false; }
  isWet()                    { return false; }
  getHitbox() {
    const cs = GRID.CELL_SIZE;
    // Composite spans 5 chars wide (-2..+2 offX) × 3 chars tall (-2..0 offY)
    // anchored at bx = position.x + cs/2, by = position.y + cs/2 + jumpOffset
    return {
      x:      this.position.x - 1.5 * cs,
      y:      this.position.y - 1.5 * cs + (this.jumpOffset ?? 0),
      width:  5 * cs,
      height: 3 * cs,
    };
  }
  getElementalModifier(elementType) {
    return getElementalModifierFor(this.elementalAffinity, null, elementType);
  }
  shouldApplyStatusEffect(effect) {
    return !isImmuneToEffect(this.elementalAffinity, null, effect);
  }
  applyStatusEffect()     {}
  breakSapping()          {}
  shouldUseConsumable()   { return null; }
  useConsumable()         {}
  getStunDroppedItems()   { return []; }
  evaluateItemPickup()    { return null; }
  pickupItem()            { return false; }
  dropInventory()         { return []; }

  getMouthChars() {
    switch (this.mouthPhase) {
      case 1:  return ['(', '\u2261', '\u2261', '\u2261', ')'];
      case 2:  return ['{', ' ', ' ', ' ', '}'];
      case 3:  return ['{', '\u2261', '\u2261', '\u2261', '}'];
      default: return ['(', '=', '=', '=', ')'];
    }
  }

  // ── State updates ───────────────────────────────────────────────────────────

  _updateUnderwater(deltaTime) {
    if (!this.underwaterTarget) { this._pickNewTarget(); return; }
    const dx = this.underwaterTarget.x - this.position.x;
    const dy = this.underwaterTarget.y - this.position.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 6) {
      this._transitionTo('surfaced');
    } else {
      const s = UNDERWATER_SPEED * deltaTime / dist;
      this.position.x += dx * s;
      this.position.y += dy * s;
    }
  }

  _updateSurfaced(deltaTime) {
    this._tickMouth(deltaTime);
    if (!this.target) return;

    // Phase 2 replaces the phase-1 loop outright: no proximity hammer, no passive
    // slam. The surfaced window is a fixed, vulnerable beat that ends by sinking
    // back under the sheet to Stalk again.
    if (this.phase === 2) {
      if (!this.shockwaveActive) {
        this.attackTimer -= deltaTime;
        if (this.attackTimer <= 0) {
          this._fireIceStream();
          this.attackTimer = this._getAttackCooldown();
        }
      }
      this.surfacedTimer -= deltaTime;
      if (this.surfacedTimer <= 0) this._transitionTo('stalking');
      return;
    }

    if (this.hammerCountdown === null) {
      // Passive safety: slam after 18s even if player never approaches
      this._passiveHammerTimer -= deltaTime;
      if (this._passiveHammerTimer <= 0) {
        this._transitionTo('slamming');
        return;
      }

      // Ice attack stream — only while NOT counting down to slam and no shockwave active
      if (!this.shockwaveActive) {
        this.attackTimer -= deltaTime;
        if (this.attackTimer <= 0) {
          this._fireIceStream();
          this.attackTimer = this._getAttackCooldown();
        }
      }
    }

    // Hammer sequence: start countdown when player enters range
    const dx = this.target.position.x - this.position.x;
    const dy = this.target.position.y - this.position.y;
    const distSq = dx * dx + dy * dy;

    if (this.hammerCountdown === null && distSq <= HAMMER_RANGE_SQ * 1.5) {
      this.hammerCountdown = HAMMER_COUNTDOWN;
    }

    if (this.hammerCountdown !== null) {
      this.hammerCountdown -= deltaTime;
      if (this.hammerCountdown <= 0) {
        this._transitionTo('slamming');
      }
    }
  }

  _updateSlamming(deltaTime) {
    if (this.jumpPhase === 'rise') {
      this.jumpTimer += deltaTime;
      const t = Math.min(this.jumpTimer / JUMP_RISE_TIME, 1.0);
      // Ease-out upward: fast start, slows near apex
      this.jumpOffset = -JUMP_HEIGHT_PX * (1 - (1 - t) * (1 - t));
      if (t >= 1.0) {
        this.jumpPhase = 'fall';
        this.jumpTimer = 0;
      }
    } else if (this.jumpPhase === 'fall') {
      this.jumpTimer += deltaTime;
      const t = Math.min(this.jumpTimer / JUMP_FALL_TIME, 1.0);
      // Ease-in downward: slow start, slams hard
      this.jumpOffset = -JUMP_HEIGHT_PX * (1 - t * t);
      if (t >= 1.0) {
        this.jumpOffset = 0;
        this.jumpPhase  = 'none';
        this._fireHammer();
        this._transitionTo('underwater');
      }
    }
  }

  // ── Phase 2 states ──────────────────────────────────────────────────────────

  // Stalk: hunt the player's live position under the frozen sheet. This is the
  // heart of the rework — phase 1 surfaced at a *random* tile, which cannot be
  // anticipated. A tracked shadow can be, which is cyan's verb.
  _updateStalking(deltaTime) {
    if (!this.target) return;
    this.stalkTimer += deltaTime;

    const dx = this.target.position.x - this.position.x;
    const dy = this.target.position.y - this.position.y;
    const distSq = dx * dx + dy * dy;

    // Close enough to strike, or the player has stayed unreachable too long
    if (distSq <= BREACH_RANGE_SQ || this.stalkTimer >= STALK_TIMEOUT) {
      this._transitionTo('breaching');
      return;
    }

    const dist = Math.sqrt(distSq);
    const s = STALK_SPEED * deltaTime / dist;
    this.position.x += dx * s;
    this.position.y += dy * s;
  }

  // Breach: the held telegraph. The boss stops dead beneath the player and waits.
  // The delay is not mercy — it is the window the player has to slide clear of the
  // spot they are standing on, made hard by the ice they are standing on.
  _updateBreaching(deltaTime) {
    this.breachTimer -= deltaTime;
    if (this.breachTimer <= 0) {
      this._fireBreach();
      this._transitionTo('surfaced');
    }
  }

  // ── Attacks ─────────────────────────────────────────────────────────────────

  // Crash up through the sheet. Opens a Lead — a permanent hole in the floor at
  // the breach point. Because the Breach lands where the player was standing, the
  // player authors the erosion pattern: hug the edge and the holes cluster there;
  // wander the middle and you strand yourself.
  _fireBreach() {
    const cx = this.position.x, cy = this.position.y;

    // Jaw clamp on emergence — same shape as the phase-1 hammer, but this is the
    // attack the player was given the telegraph to avoid.
    this.pendingBossAttacks.push({
      position: {
        x: cx - GRID.CELL_SIZE * 2.5,
        y: cy - GRID.CELL_SIZE * 0.5,
      },
      velocity:    { vx: 0, vy: 0 },
      damage:      5,
      char:        ')',
      color:       '#4488aa',
      onHit:       null,
      reflectable: false,
      reflected:   false,
      owner:       this,
      width:       GRID.CELL_SIZE * 5,
      height:      GRID.CELL_SIZE * 1.5,
      lifetime:    0.25,
    });

    // Signal BossSystem to open the Lead. Radius stays tight — the design is a
    // sliver of water between the player and a vulnerable boss, not a moat.
    this.pendingLead = { x: cx, y: cy, radius: LEAD_RADIUS };
  }

  // Fire 4 shots in a random order, staggered in time
  _fireIceStream() {
    if (!this.target) return;
    const base = Math.atan2(
      this.target.position.y - this.position.y,
      this.target.position.x - this.position.x
    );

    // Shuffle shot indices [0,1,2,3,4]
    const order = [0, 1, 2, 3, 4];
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }

    order.forEach((shotIdx, fireOrder) => {
      const t     = shotIdx / (ICE_STREAM_SHOTS - 1);
      const angle = base - CONE_SPREAD / 2 + t * CONE_SPREAD;
      this.pendingBossAttacks.push({
        position:     { x: this.position.x, y: this.position.y },
        velocity:     { vx: Math.cos(angle) * ICE_STREAM_SPEED,
                        vy: Math.sin(angle) * ICE_STREAM_SPEED },
        damage:       3,
        char:         '*',
        color:        '#88ddff',
        onHit:        'freeze',
        freezesWater: true,
        reflectable:  false,
        reflected:    false,
        owner:        this,
        delay:        fireOrder * SHOT_STAGGER,
      });
    });
  }

  // Jaw clamp hitbox + room-wide shockwave rings
  _fireHammer() {
    // Jaw clamp — large short-lived hitbox
    this.pendingBossAttacks.push({
      position: {
        x: this.position.x - GRID.CELL_SIZE * 2.5,
        y: this.position.y - GRID.CELL_SIZE * 0.5,
      },
      velocity:    { vx: 0, vy: 0 },
      damage:      5,
      char:        ')',
      color:       '#4488aa',
      onHit:       null,
      reflectable: false,
      reflected:   false,
      owner:       this,
      width:       GRID.CELL_SIZE * 5,
      height:      GRID.CELL_SIZE * 1.5,
      lifetime:    0.25,
    });

    // Shockwave rings
    const cx = this.position.x, cy = this.position.y;
    const rings = 3, pts = 8, maxR = GRID.CELL_SIZE * 6;
    for (let ring = 1; ring <= rings; ring++) {
      const r = (ring / rings) * maxR;
      for (let i = 0; i < pts; i++) {
        const angle = (Math.PI * 2 / pts) * i;
        this.pendingBossAttacks.push({
          position: {
            x: cx + Math.cos(angle) * r - GRID.CELL_SIZE / 2,
            y: cy + Math.sin(angle) * r - GRID.CELL_SIZE / 2,
          },
          velocity:    { vx: 0, vy: 0 },
          damage:      0,
          char:        'o',
          color:       '#aaffff',
          onHit:       null,
          reflectable: false,
          reflected:   false,
          owner:       this,
          width:       GRID.CELL_SIZE,
          height:      GRID.CELL_SIZE,
          lifetime:    0.15,
          delay:       (ring - 1) * 0.12,
        });
      }
    }

    // Signal BossSystem to sweep the room's water. Normally this THAWS everything
    // the player has frozen. Once the Freeze-Over is armed the same sweep runs
    // backwards and freezes the whole lake instead — the board flip.
    //
    // BossSystem has the final say on whether the flip commits: it declines if the
    // player is standing on land, because the Hummock cage would then wall the
    // player OUT of the arena. A declined flip is just an ordinary slam, and the
    // boss stays armed for the next one.
    this.pendingIceBreak   = true;
    this.pendingFreezeOver = this.freezeOverArmed;
    this.slamPosition      = { x: cx, y: cy };
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  // Cooldown between ice bursts: 12s at full HP → 7s at 40% → 4s near death
  _getAttackCooldown() {
    const hp_pct = this.hp / this.maxHp;
    if (hp_pct >= 0.4) {
      const t = (hp_pct - 0.4) / 0.6;
      return 7.0 + t * 5.0;
    } else {
      const t = hp_pct / 0.4;
      return 4.0 + t * 3.0;
    }
  }

  _tickMouth(deltaTime) {
    this.mouthTimer += deltaTime;
    const t = this.mouthTimer % MOUTH_CYCLE;
    this.mouthPhase = t < 0.6 ? 0 : t < 0.9 ? 1 : t < 1.5 ? 2 : t < 1.8 ? 3 : 0;
  }

  _transitionTo(state) {
    this.state = state;
    this.hitFlash = false; // state transitions are never damage-triggered iframes
    // Entering the slam is signalled here rather than sampled by BossSystem around
    // the tick, because takeDamage() can trigger it from CombatSystem — outside
    // update() entirely. BossSystem consumes and clears this flag (bug #216).
    if (state === 'slamming') this.enteredSlamming = true;
    if (state === 'underwater') {
      this.hammerCountdown      = null;
      this._passiveHammerTimer  = 18.0;
      this.jumpOffset           = 0;
      this.jumpPhase            = 'none';
      this.invulnerabilityTimer = 9999;  // untouchable while submerged
      this._pickNewTarget();
    } else if (state === 'surfaced') {
      this.attackTimer          = 1.5;   // brief delay before first ice shot
      this.mouthTimer           = 0;
      this.hammerCountdown      = null;  // set by proximity detection; passive timer is fallback
      this._passiveHammerTimer  = 18.0;
      this.invulnerabilityTimer = 0.5;   // brief surface i-frames
    } else if (state === 'slamming') {
      this.jumpPhase            = 'rise';
      this.jumpTimer            = 0;
      this.jumpOffset           = 0;
      this.invulnerabilityTimer = 9999;  // airborne — untouchable
    } else if (state === 'stalking') {
      this.stalkTimer           = 0;
      this.jumpOffset           = 0;
      this.jumpPhase            = 'none';
      this.invulnerabilityTimer = 9999;  // under the sheet — untouchable
    } else if (state === 'breaching') {
      this.breachTimer          = BREACH_TELEGRAPH;
      this.invulnerabilityTimer = 9999;  // still under the sheet through the telegraph
    }

    // Phase 2's surfaced beat is timed rather than proximity-driven; set here so
    // the shared 'surfaced' branch above keeps its phase-1 meaning untouched.
    if (state === 'surfaced' && this.phase === 2) {
      this.surfacedTimer = SURFACED_WINDOW;
    }
  }

  /**
   * Flip to phase 2. Called by BossSystem once the armed slam has landed, which is
   * also the moment the Freeze-Over sweep and the Hummock cage go out.
   * Mirrors GooDragon/TurtleShell's transitionToPhase(n) contract, including the
   * shared 0.6s post-transition invulnerability.
   */
  transitionToPhase(n) {
    if (n !== 2 || this.phase === 2) return;
    this.phase           = 2;
    this.freezeOverArmed = false;
    this._transitionTo('stalking');
    this.invulnerabilityTimer = 0.6;
  }

  _clampToWater() {
    if (!this.waterTiles.length) return;
    const cs  = GRID.CELL_SIZE;
    const cx  = this.position.x, cy = this.position.y;
    const onWater = this.waterTiles.some(t => Math.hypot(t.x - cx, t.y - cy) < cs * 1.5);
    if (onWater) return;
    let best = this.waterTiles[0], bestDist = Infinity;
    for (const t of this.waterTiles) {
      const d = Math.hypot(t.x - cx, t.y - cy);
      if (d < bestDist) { bestDist = d; best = t; }
    }
    this.position.x = best.x;
    this.position.y = best.y;
  }

  _pickNewTarget() {
    if (!this.waterTiles.length) return;
    const MIN_SQ = (GRID.CELL_SIZE * 5) ** 2;
    const far = this.waterTiles.filter(t => {
      const dx = t.x - this.position.x;
      const dy = t.y - this.position.y;
      return dx * dx + dy * dy >= MIN_SQ;
    });
    const pool = far.length ? far : this.waterTiles;
    this.underwaterTarget = pool[Math.floor(Math.random() * pool.length)];
  }
}
