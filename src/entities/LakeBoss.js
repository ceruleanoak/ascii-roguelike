import { GRID } from '../game/GameConfig.js';

export const LAKE_BOSS_MAX_HP  = 80;
const ENRAGED_THRESHOLD        = 32;     // 40% — used only for color change
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

export class LakeBoss {
  constructor(x, y, waterTiles = []) {
    this.char   = '~';   // placeholder — skipped by normal render loop
    this.hp     = LAKE_BOSS_MAX_HP;
    this.maxHp  = LAKE_BOSS_MAX_HP;
    this.damage = 3;
    this.mass = 20;
    this.isBossEntity   = true;
    this.isBossLakeBoss = true;

    this.position = { x, y };
    this.width    = GRID.CELL_SIZE;
    this.height   = GRID.CELL_SIZE;
    this.color    = '#aaffff';

    this.invulnerabilityTimer    = 0;
    this.invulnerabilityDuration = 0.15;
    this.hitFlash = false; // true only when iframes were triggered by player damage
    this.hasTakenDamage = false;

    // State machine: 'underwater' | 'surfaced' | 'slamming'
    this.state = 'underwater';

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

    this._pickNewTarget();
  }

  // ── Public interface ────────────────────────────────────────────────────────

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

  update(deltaTime) {
    if (this.invulnerabilityTimer > 0) {
      this.invulnerabilityTimer = Math.max(0, this.invulnerabilityTimer - deltaTime);
      if (this.invulnerabilityTimer === 0) this.hitFlash = false;
    }

    switch (this.state) {
      case 'underwater': this._updateUnderwater(deltaTime); break;
      case 'surfaced':   this._updateSurfaced(deltaTime);   break;
      case 'slamming':   this._updateSlamming(deltaTime);   break;
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
  // Ice-affinity boss: immune to ice-affinity effects (freeze), weak to fire-affinity (burn).
  // Aligns with the EFFECT_AFFINITY model — accepts both effect names and affinity names.
  getElementalModifier(elementType) {
    if (elementType === 'freeze' || elementType === 'ice')  return 0;    // immune
    if (elementType === 'burn'   || elementType === 'fire') return 2.0;  // weak
    return 1;
  }
  shouldApplyStatusEffect(effect) {
    return effect !== 'freeze';
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

  // ── Attacks ─────────────────────────────────────────────────────────────────

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

    // Signal BossSystem to break ALL frozen water in the room
    this.pendingIceBreak = true;
    this.slamPosition    = { x: cx, y: cy };
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
    }
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
