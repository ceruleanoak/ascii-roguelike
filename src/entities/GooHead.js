import { Enemy } from './Enemy.js';
import { GRID } from '../game/GameConfig.js';

// ─── Tuning ──────────────────────────────────────────────────────────────────
const ATTACH_ORBIT_RADIUS = GRID.CELL_SIZE * 2;    // small orbit around diamond corner
const MAX_TETHER_DIST     = GRID.CELL_SIZE * 10;    // max distance from body center
const ATTACH_ORBIT_SPEED  = 1.2;                    // rad/s
const GRAB_DURATION       = 2;                    // seconds held before auto-release
const GRAB_COOLDOWN       = 6.0;                    // seconds before the head can grab again

const MAX_LUNGE_DIST      = GRID.CELL_SIZE * 5;    // px before lunge cancels on miss
const LUNGE_SPEED         = 280;                   // px/s – faster than normal speed
const LUNGE_MAX_TIME      = 1.0;                   // seconds before lunge force-exits
const DETACH_SPEED        = 44;                    // px/s – DVD-bounce speed
const DETACH_SHOT_COOLDOWN = 3.0;                  // seconds between goo shots
const DETACH_SHOT_SPEED    = 95;                   // px/s

const HEAD_DATA = {
  char: 'ω',
  name: 'Goo Head',
  hp: 20,
  speed: 90,
  damage: 2,
  attackRange:    GRID.CELL_SIZE * 1.5,
  aggroRange:     Infinity,
  attackCooldown: 3.0,
  attackWindup:   0.2,
  attackType: 'melee',
  decisionInterval: 0.2,
  color: '#118833',
  drops: []
};

export class GooHead extends Enemy {
  constructor(x, y, side) {
    super('?', x, y, 0);

    // ── Identity ──────────────────────────────────────────────────────────────
    this.char      = 'ω';
    this.data      = HEAD_DATA;
    this.hp        = HEAD_DATA.hp;
    this.maxHp     = HEAD_DATA.hp;
    this.speed     = HEAD_DATA.speed;
    this.damage    = HEAD_DATA.damage;
    this.attackRange  = HEAD_DATA.attackRange;
    this.aggroRange   = HEAD_DATA.aggroRange;
    this.attackCooldown = HEAD_DATA.attackCooldown;
    this.color     = HEAD_DATA.color;
    this.baseColor = HEAD_DATA.color;
    this.isBossSideHead = true;
    this.isBossEntity   = true;
    this.ignoreBackgroundCollision = true;
    this.width  = 8;
    this.height = 8;

    // 'left' or 'right' – determines default orbit offset
    this.side = side;

    // ── Attached phase (phases 1–2) ────────────────────────────────────────────
    this.anchorEntity  = null;   // set to GooDragon by BossSystem
    this.orbitAngle    = side === 'left' ? Math.PI / 2 : -Math.PI / 2;
    this.grabTimer     = 0;      // grab damage tick
    this.cornerX       = 0;
    this.cornerY       = 0;
    this.cornerUpdateTimer = Math.random() * 2.0; // stagger initial updates

    // ── Stun state (set by BossSystem on reflected projectile hit) ────────────
    this.bossStunTimer = 0;

    // ── Grab state ─────────────────────────────────────────────────────────────
    this.isGrabbing    = false;
    this.grabbedPlayer = null;
    this.grabCooldown  = 0;
    this.isLunging     = false;
    this.lungeVx       = 0;       // fixed unit vector committed at lunge start
    this.lungeVy       = 0;
    this.lungeStartX   = 0;
    this.lungeStartY   = 0;
    this.lungeTimer    = 0;

    // ── Detached phase (phase 3) ───────────────────────────────────────────────
    this.detached         = false;
    this.invulnerable     = false;  // set true when detached
    this.dvdVx            = 0;
    this.dvdVy            = 0;
    this.shotTimer        = Math.random() * DETACH_SHOT_COOLDOWN;

    // Queued attacks (drained by BossSystem same as GooDragon)
    this.pendingBossAttacks = [];

    this.enraged = true;
    this.state   = 'boss';
  }

  // ── Core update ────────────────────────────────────────────────────────────
  update(deltaTime) {
    // Always tick i-frames so hits during stun don't permanently block damage
    if (this.invulnerabilityTimer > 0) {
      this.invulnerabilityTimer = Math.max(0, this.invulnerabilityTimer - deltaTime);
    }

    // Stun: release any grab, freeze all AI
    if (this.bossStunTimer > 0) {
      this.bossStunTimer = Math.max(0, this.bossStunTimer - deltaTime);
      if (this.isGrabbing) this.releaseGrab();
      this._endLunge();
      this.targetVelocity.vx = 0;
      this.targetVelocity.vy = 0;
      this._blendVelocity(deltaTime);
      return { dotDamage: [] };
    }
    this.dotBlinkTimer += deltaTime;
    const dotDamageEvents = this.updateStatusEffects(deltaTime);

    if (!this.isKnockedBack()) {
      this._blendVelocity(deltaTime);
    }
    if (this.attackTimer > 0) {
      this.attackTimer -= deltaTime;
    }

    if (this.detached) {
      this._updateDetached(deltaTime);
    } else {
      this._updateAttached(deltaTime);
    }

    return { dotDamage: dotDamageEvents };
  }

  // ── Attached AI ────────────────────────────────────────────────────────────
  _updateAttached(deltaTime) {
    if (!this.anchorEntity) return;

    // Recompute diamond corner every 2 seconds
    this.cornerUpdateTimer -= deltaTime;
    if (this.cornerUpdateTimer <= 0) {
      this.cornerUpdateTimer = 2.0;
      if (this.target) {
        const dragon = this.anchorEntity;
        const pdx = this.target.position.x - dragon.position.x;
        const pdy = this.target.position.y - dragon.position.y;
        const dist = Math.sqrt(pdx * pdx + pdy * pdy) || 1;
        const mx = (dragon.position.x + this.target.position.x) / 2;
        const my = (dragon.position.y + this.target.position.y) / 2;
        const perpX = -pdy / dist;
        const perpY =  pdx / dist;
        const sign  = this.side === 'left' ? 1 : -1;
        const offset = Math.max(dist / 2, GRID.CELL_SIZE * 2);
        this.cornerX = mx + perpX * offset * sign;
        this.cornerY = my + perpY * offset * sign;
      } else {
        this.cornerX = this.anchorEntity.position.x + (this.side === 'left' ? -GRID.CELL_SIZE * 4 : GRID.CELL_SIZE * 4);
        this.cornerY = this.anchorEntity.position.y;
      }
    }

    // Tick grab cooldown
    if (this.grabCooldown > 0) {
      this.grabCooldown = Math.max(0, this.grabCooldown - deltaTime);
    }

    // Lunge → collision grab (pixel AABB, fixed linear trajectory).
    // Grab + status-effect application is a player-specific interaction —
    // gate on the target supporting applyStatusEffect so companions (camp NPC,
    // tamed rats) don't trigger crashes or get yanked around by it.
    let tx, ty;
    if (!this.isGrabbing) {
      const canGrab = this.grabCooldown <= 0
        && !this.target?.dodgeRoll?.active
        && typeof this.target?.applyStatusEffect === 'function';

      if (this.isLunging) {
        this.lungeTimer += deltaTime;
        // Check hit — respect dodge roll and i-frames (player dodged mid-lunge = miss)
        const targetDodging = this.target?.dodgeRoll?.active || this.target?.invulnerabilityTimer > 0;
        if (this.target && !targetDodging && this._aabbOverlap(this.target, 0)) {
          this._endLunge();
          this._startGrab(this.target);
        } else {
          // Cancel on miss: max distance OR timer expired
          const dx = this.position.x - this.lungeStartX;
          const dy = this.position.y - this.lungeStartY;
          const missedDist  = dx * dx + dy * dy >= MAX_LUNGE_DIST * MAX_LUNGE_DIST;
          const timedOut    = this.lungeTimer >= LUNGE_MAX_TIME;
          if (missedDist || timedOut) {
            this._endLunge();
            this.grabCooldown = GRAB_COOLDOWN;
          } else {
            // Drive velocity directly at lunge speed — bypasses normal speed system
            this.targetVelocity.vx = this.lungeVx * LUNGE_SPEED;
            this.targetVelocity.vy = this.lungeVy * LUNGE_SPEED;
          }
        }
      } else if (this.target && canGrab && this._aabbOverlap(this.target, 64)) {
        // Player entered proximity — commit, lock direction, disable wall collision
        const pdx = this.target.position.x - this.position.x;
        const pdy = this.target.position.y - this.position.y;
        const len  = Math.sqrt(pdx * pdx + pdy * pdy) || 1;
        this.isLunging      = true;
        this.lungeVx        = pdx / len;
        this.lungeVy        = pdy / len;
        this.lungeStartX    = this.position.x;
        this.lungeStartY    = this.position.y;
        this.lungeTimer     = 0;
        this._savedCollisionMap = this.collisionMap;
        this.collisionMap   = null;
        this.targetVelocity.vx = this.lungeVx * LUNGE_SPEED;
        this.targetVelocity.vy = this.lungeVy * LUNGE_SPEED;
      }
    }

    if (tx === undefined) {
      // Normal orbit around diamond corner
      const orbitDir = this.side === 'left' ? 1 : -1;
      this.orbitAngle += ATTACH_ORBIT_SPEED * deltaTime * orbitDir;
      tx = this.cornerX + Math.cos(this.orbitAngle) * ATTACH_ORBIT_RADIUS;
      ty = this.cornerY + Math.sin(this.orbitAngle) * ATTACH_ORBIT_RADIUS;
    }

    // Clamp target to max tether distance from body center
    const body = this.anchorEntity;
    const tdx = tx - body.floatCenterX;
    const tdy = ty - body.floatCenterY;
    const tDist = Math.sqrt(tdx * tdx + tdy * tdy);
    if (tDist > MAX_TETHER_DIST) {
      const scale = MAX_TETHER_DIST / tDist;
      tx = body.floatCenterX + tdx * scale;
      ty = body.floatCenterY + tdy * scale;
    }

    // Move toward target position — skip when lunging (lunge already owns targetVelocity)
    if (!this.isLunging) {
      const dx = tx - this.position.x;
      const dy = ty - this.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 2) {
        this.targetVelocity.vx = (dx / dist) * this.speed;
        this.targetVelocity.vy = (dy / dist) * this.speed;
      } else {
        this.targetVelocity.vx = 0;
        this.targetVelocity.vy = 0;
      }
    }

    // Hold grab for GRAB_DURATION, then auto-release
    if (this.isGrabbing && this.grabbedPlayer) {
      this.grabTimer += deltaTime;
      if (this.grabTimer >= GRAB_DURATION) {
        this.releaseGrab();
      } else {
        // Hold position — head already reached the player via lunge, no teleport
        this.targetVelocity.vx = 0;
        this.targetVelocity.vy = 0;
      }
    }
  }

  // Grab contact should not knock the player away — melee hit without knockback
  createAttack() { return this.createMeleeAttack(false); }

  _endLunge() {
    this.isLunging  = false;
    if (this._savedCollisionMap !== undefined) {
      this.collisionMap       = this._savedCollisionMap;
      this._savedCollisionMap = undefined;
    }
  }

  getHitbox() {
    // Center the hitbox on the rendered ω position (drawn at position + cs/2)
    const cs = GRID.CELL_SIZE;
    return {
      x: this.position.x + cs / 2 - this.width / 2,
      y: this.position.y + cs / 2 - this.height / 2,
      width:  this.width,
      height: this.height
    };
  }

  _aabbOverlap(entity, expand) {
    const a = this.getHitbox();
    const b = entity.getHitbox
      ? entity.getHitbox()
      : { x: entity.position.x, y: entity.position.y, width: entity.width, height: entity.height };
    return a.x - expand < b.x + b.width  &&
           a.x + a.width  + expand > b.x &&
           a.y - expand < b.y + b.height &&
           a.y + a.height + expand > b.y;
  }

  _startGrab(player) {
    this.isGrabbing    = true;
    this.grabbedPlayer = player;
    this.grabTimer     = 0;
    player.grabbed   = true;
    player.grabbedBy = this;
    player.applyStatusEffect('goo', GRAB_DURATION + 1.5);
  }

  releaseGrab() {
    if (this.grabbedPlayer) {
      this.grabbedPlayer.grabbed   = false;
      this.grabbedPlayer.grabbedBy = null;
    }
    this.isGrabbing    = false;
    this.grabbedPlayer = null;
    this.grabTimer     = 0;
    this.grabCooldown  = GRAB_COOLDOWN;
    this._endLunge();
  }

  // ── Detached AI (phase 3) — DVD-logo bounce ───────────────────────────────
  _updateDetached(deltaTime) {
    const margin = GRID.CELL_SIZE;
    const minX = margin, maxX = GRID.WIDTH  - margin - GRID.CELL_SIZE;
    const minY = margin, maxY = GRID.HEIGHT - margin - GRID.CELL_SIZE;

    // Absorb any knockback into the DVD trajectory so hits visibly deflect the head
    if (this.isKnockedBack()) {
      this.dvdVx = this.velocity.vx;
      this.dvdVy = this.velocity.vy;
    }

    this.position.x += this.dvdVx * deltaTime;
    this.position.y += this.dvdVy * deltaTime;

    // Bounce off walls
    if (this.position.x <= minX) { this.position.x = minX; this.dvdVx =  Math.abs(this.dvdVx); }
    if (this.position.x >= maxX) { this.position.x = maxX; this.dvdVx = -Math.abs(this.dvdVx); }
    if (this.position.y <= minY) { this.position.y = minY; this.dvdVy =  Math.abs(this.dvdVy); }
    if (this.position.y >= maxY) { this.position.y = maxY; this.dvdVy = -Math.abs(this.dvdVy); }

    this.targetVelocity.vx = 0;
    this.targetVelocity.vy = 0;

    // Grab cooldown + grab check (same as attached phase)
    if (this.grabCooldown > 0) this.grabCooldown = Math.max(0, this.grabCooldown - deltaTime);

    if (this.target && !this.isGrabbing && this.grabCooldown <= 0 && !this.target.dodgeRoll?.active) {
      if (this._aabbOverlap(this.target, 0)) this._startGrab(this.target);
    }

    if (this.isGrabbing && this.grabbedPlayer) {
      this.grabTimer += deltaTime;
      if (this.grabTimer >= GRAB_DURATION) {
        this.releaseGrab();
      }
    }

    // Periodically fire damaging shots at player
    if (this.target) {
      this.shotTimer -= deltaTime;
      if (this.shotTimer <= 0) {
        this._fireDamageShot();
        this.shotTimer = DETACH_SHOT_COOLDOWN + (Math.random() - 0.5) * 0.5;
      }
    }
  }

  _fireDamageShot() {
    if (!this.target) return;
    const dx = this.target.position.x - this.position.x;
    const dy = this.target.position.y - this.position.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    this.pendingBossAttacks.push({
      type:        'projectile',
      position:    { x: this.position.x, y: this.position.y },
      velocity:    { vx: (dx / len) * DETACH_SHOT_SPEED, vy: (dy / len) * DETACH_SHOT_SPEED },
      damage:      this.damage,
      char:        'o',
      color:       '#cc2200',
      reflectable: false,
      reflected:   false,
      owner:       this,
      width:       4,
      height:      4
    });
  }

  shouldApplyStatusEffect(effect) {
    // Detached heads are immune to freeze — player freezing the main body
    // should not also lock down the phase-3 threats
    if (this.detached && effect === 'freeze') return false;
    return super.shouldApplyStatusEffect(effect);
  }

  // ── Detach (called by BossSystem on phase 3 transition) ───────────────────
  detach() {
    this.releaseGrab();
    this.detached = true;
    // Launch at a random diagonal so the two heads go different directions
    const angle = (this.side === 'left' ? Math.PI * 0.75 : Math.PI * 1.75) + (Math.random() - 0.5) * 0.5;
    this.dvdVx = Math.cos(angle) * DETACH_SPEED;
    this.dvdVy = Math.sin(angle) * DETACH_SPEED;
  }
}
