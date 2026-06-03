import { GRID } from '../game/GameConfig.js';

/**
 * NPCRat — bread-tamed companion. Separate class from Enemy so it carries no
 * hostile AI baggage (no enraged state, no packBehavior, no chargeMechanic).
 *
 * State machine:
 *   'idle'      — no target; drifts toward player to stay close
 *   'chase'     — pursuing a hostile enemy
 *   'flee'      — short retreat after each hit (1.5s), then re-engages
 *   'permaFlee' — third hit in a room; runs to nearest exit, despawns on arrival
 *
 * Created by main.js when a wild rat (Enemy) reaches a dropped loaf. Lives on
 * game.tamedRats, persists across room transitions like other companions, and
 * is dispatched through the shared snapAllCompanionsOnRoomEnter pipeline via
 * its own onRoomEnter method.
 *
 * Renders through the existing Enemy render path — exposes the minimum surface
 * (color, char, position, plane, shouldRenderVisible, getIframeFlashColor,
 * getDOTBlinkColor) so drawNonSappingEnemies can iterate it without branching.
 */

const MAX_HP = 5;                          // 3 hits to flee + 2 hp buffer
const HIT_FLEE_DURATION = 1.5;             // short retreat after each hit
const PERMA_FLEE_HIT_THRESHOLD = 3;
const INVULNERABILITY_DURATION = 0.5;

const SPEED = 110;                         // > wild rat (50) so it catches up and disengages cleanly
// Match wild-rat range so closing distance feels honest. No windup (unlike
// the wild rat's 1.0s telegraph) preserves the first-bite advantage — a tamed
// rat reliably lands the opening hit on whatever it engages. Cooldown itself
// is on the long side so DPS stays modest, especially in packs: at 0.35s the
// rats trivialized fights once you had 3+ companions.
const ATTACK_RANGE = GRID.CELL_SIZE * 1.75;
const ATTACK_COOLDOWN = 1.2;
const ATTACK_DAMAGE = 1;
const AGGRO_RANGE = GRID.CELL_SIZE * 9;    // slightly broader than wild rat

const FOLLOW_RADIUS = GRID.CELL_SIZE * 3;  // idle drift target around player
const FOLLOW_SPEED_MULT = 0.6;
const FLEE_SPEED_MULT = 1.4;
const PERMA_FLEE_SPEED = 140;
const PERMA_FLEE_ARRIVE_DIST = 6;

export class NPCRat {
  constructor(x, y) {
    this.position = { x, y };
    this.velocity = { vx: 0, vy: 0 };
    this.targetVelocity = { vx: 0, vy: 0 };

    this.char = 'r';
    this.color = '#ffffff';
    this.baseColor = '#ffffff';
    this.width = GRID.CELL_SIZE;
    this.height = GRID.CELL_SIZE;
    this.plane = 0;

    this.maxHp = MAX_HP;
    this.hp = MAX_HP;
    this.hitsThisRoom = 0;
    this.invulnerabilityTimer = 0;
    this.attackTimer = 0;

    this.state = 'idle';
    this.target = null;
    this.fleeTimer = 0;
    this.fleeTargetPos = null;
    this.fleeReached = false;

    // Physics flags so PhysicsSystem treats us like a normal collide-able mover.
    this.hasCollision = true;
    this.boundToGrid = true;
    this.collisionMap = null;
    this.backgroundObjects = null;

    // Render-path compatibility: drawNonSappingEnemies checks these.
    this.sapping = false;
    this.isBossEntity = false;
    this.isDying = false;
    this.dead = false;
    this.data = { float: false };

    // Wired by game on creation / room entry.
    this.game = null;
    this.room = null;
  }

  setGame(game) { this.game = game; }
  setRoom(room) { this.room = room; }
  setCollisionMap(collisionMap) { this.collisionMap = collisionMap; }
  setBackgroundObjects(backgroundObjects) { this.backgroundObjects = backgroundObjects; }

  // Shared companion hook: snap to a radial slot around the player and reset
  // per-room state. Mirrors Crow.onRoomEnter / CampNPC.onRoomEnter so main.js
  // can dispatch all companions through one unified call site.
  onRoomEnter(player, game, slot = 0, total = 1) {
    if (!player) return;
    const angle = (slot / Math.max(total, 1)) * Math.PI * 2;
    const radius = GRID.CELL_SIZE * 1.1;
    this.position.x = player.position.x + Math.cos(angle) * radius;
    this.position.y = player.position.y + Math.sin(angle) * radius;
    this.velocity.vx = 0;
    this.velocity.vy = 0;
    this.targetVelocity.vx = 0;
    this.targetVelocity.vy = 0;
    this.hp = this.maxHp;
    this.hitsThisRoom = 0;
    this.invulnerabilityTimer = 0;
    this.attackTimer = 0;
    this.state = 'idle';
    this.target = null;
    this.fleeTimer = 0;
    this.fleeTargetPos = null;
    this.fleeReached = false;
    if (game) {
      this.game = game;
      this.room = game.currentRoom;
      this.collisionMap = game.currentRoom?.collisionMap || null;
      this.backgroundObjects = game.currentRoom?.backgroundObjects || null;
    }
  }

  // Per-frame driver. main.js passes the live hostile-enemies array, the
  // player, and the sibling tamed-rat roster (for separation so rats don't
  // stack into a single linear column on a shared target).
  update(deltaTime, enemies, player, siblings = null) {
    if (this.invulnerabilityTimer > 0) {
      this.invulnerabilityTimer -= deltaTime;
      if (this.invulnerabilityTimer < 0) this.invulnerabilityTimer = 0;
    }
    if (this.attackTimer > 0) this.attackTimer -= deltaTime;

    if (this.state === 'permaFlee') {
      this._updatePermaFlee(deltaTime);
      return null;
    }

    if (this.state === 'flee') {
      this.fleeTimer -= deltaTime;
      if (this.fleeTimer <= 0) {
        this.state = 'idle';
        this.target = null;
      } else if (this.target) {
        this._fleeFromTarget(deltaTime);
        this._applySeparation(siblings);
        return null;
      }
    }

    // Re-acquire nearest hostile each frame so combat priority stays accurate.
    this.target = this._findNearestEnemy(enemies);

    let result = null;
    if (this.target) {
      this.state = 'chase';
      result = this._chaseAndAttack(deltaTime);
    } else {
      this.state = 'idle';
      this._driftTowardPlayer(deltaTime, player);
    }
    this._applySeparation(siblings);
    return result;
  }

  // Boids-style separation: nudge velocity away from any sibling rat that
  // crowds inside a half-cell. Stops a pack from collapsing onto one target
  // along a single line.
  _applySeparation(siblings) {
    if (!siblings || siblings.length < 2) return;
    const RADIUS = GRID.CELL_SIZE * 0.9;
    const RADIUS_SQ = RADIUS * RADIUS;
    const STRENGTH = SPEED * 0.7;
    let pushX = 0;
    let pushY = 0;
    let count = 0;
    for (const other of siblings) {
      if (!other || other === this) continue;
      const dx = this.position.x - other.position.x;
      const dy = this.position.y - other.position.y;
      const dSq = dx * dx + dy * dy;
      if (dSq > 0 && dSq < RADIUS_SQ) {
        const d = Math.sqrt(dSq);
        // Falloff: closer = stronger push.
        const w = (RADIUS - d) / RADIUS;
        pushX += (dx / d) * w;
        pushY += (dy / d) * w;
        count++;
      }
    }
    if (count > 0) {
      this.velocity.vx += pushX * STRENGTH;
      this.velocity.vy += pushY * STRENGTH;
      this.targetVelocity.vx = this.velocity.vx;
      this.targetVelocity.vy = this.velocity.vy;
    }
  }

  // Damage handler — counts hits, triggers flee, returns truthy on damage.
  // 3rd hit kicks the rat into permaFlee; below that, 1.5s short retreat.
  takeDamage(amount) {
    if (this.invulnerabilityTimer > 0) return false;
    if (this.state === 'permaFlee') return false;
    this.hitsThisRoom++;
    this.invulnerabilityTimer = INVULNERABILITY_DURATION;
    this.game?.audioSystem?.playSFX?.('enemy_hit');
    if (this.hitsThisRoom >= PERMA_FLEE_HIT_THRESHOLD) {
      this._startPermaFlee();
    } else {
      this.state = 'flee';
      this.fleeTimer = HIT_FLEE_DURATION;
    }
    return { damaged: true };
  }

  // Render-path compatibility shims.
  shouldRenderVisible() { return true; }

  getIframeFlashColor() {
    // White blink during iframes — same cadence as Enemy renderer expects.
    if (this.invulnerabilityTimer <= 0) return null;
    const blinkCycle = Math.floor(this.invulnerabilityTimer / 0.08);
    return blinkCycle % 2 === 0 ? '#ffffff' : null;
  }

  getDOTBlinkColor() { return null; }

  // ─── Internals ──────────────────────────────────────────────────────────

  _findNearestEnemy(enemies) {
    if (!enemies || enemies.length === 0) return null;
    let best = null;
    let bestDistSq = AGGRO_RANGE * AGGRO_RANGE;
    for (const e of enemies) {
      if (!e || e === this) continue;
      if (e.tamed) continue;
      if (e.hp <= 0 || e.isDying) continue;
      if ((e.plane ?? 0) !== this.plane) continue;
      const dx = e.position.x - this.position.x;
      const dy = e.position.y - this.position.y;
      const d = dx * dx + dy * dy;
      if (d < bestDistSq) { bestDistSq = d; best = e; }
    }
    return best;
  }

  _chaseAndAttack(deltaTime) {
    const t = this.target;
    const dx = t.position.x - this.position.x;
    const dy = t.position.y - this.position.y;
    const dist = Math.hypot(dx, dy) || 1;
    const dirX = dx / dist;
    const dirY = dy / dist;

    if (dist > ATTACK_RANGE) {
      // Approach
      this.targetVelocity.vx = dirX * SPEED;
      this.targetVelocity.vy = dirY * SPEED;
    } else {
      // In range — stand and bite
      this.targetVelocity.vx = 0;
      this.targetVelocity.vy = 0;
      if (this.attackTimer <= 0 && typeof t.takeDamage === 'function') {
        t.takeDamage(ATTACK_DAMAGE);
        this.attackTimer = ATTACK_COOLDOWN;
        return { attacked: t, damage: ATTACK_DAMAGE };
      }
    }
    this.velocity.vx = this.targetVelocity.vx;
    this.velocity.vy = this.targetVelocity.vy;
    return null;
  }

  _fleeFromTarget(deltaTime) {
    const t = this.target;
    if (!t) return;
    const dx = this.position.x - t.position.x;
    const dy = this.position.y - t.position.y;
    const d = Math.hypot(dx, dy) || 1;
    const speed = SPEED * FLEE_SPEED_MULT;
    this.targetVelocity.vx = (dx / d) * speed;
    this.targetVelocity.vy = (dy / d) * speed;
    this.velocity.vx = this.targetVelocity.vx;
    this.velocity.vy = this.targetVelocity.vy;
  }

  _driftTowardPlayer(deltaTime, player) {
    if (!player) {
      this.velocity.vx = 0;
      this.velocity.vy = 0;
      this.targetVelocity.vx = 0;
      this.targetVelocity.vy = 0;
      return;
    }
    const dx = player.position.x - this.position.x;
    const dy = player.position.y - this.position.y;
    const d = Math.hypot(dx, dy);
    if (d > FOLLOW_RADIUS) {
      const s = SPEED * FOLLOW_SPEED_MULT;
      this.targetVelocity.vx = (dx / d) * s;
      this.targetVelocity.vy = (dy / d) * s;
    } else {
      this.targetVelocity.vx = 0;
      this.targetVelocity.vy = 0;
    }
    this.velocity.vx = this.targetVelocity.vx;
    this.velocity.vy = this.targetVelocity.vy;
  }

  _startPermaFlee() {
    this.state = 'permaFlee';
    this.fleeReached = false;
    const exits = this.game?.currentRoom?.exits;
    if (!exits) {
      this.fleeTargetPos = null;
      return;
    }
    const centerX = Math.floor(GRID.COLS / 2);
    const centerY = Math.floor(GRID.ROWS / 2);
    const exitPositions = {
      north: { x: centerX * GRID.CELL_SIZE, y: 2 * GRID.CELL_SIZE },
      east:  { x: (GRID.COLS - 3) * GRID.CELL_SIZE, y: centerY * GRID.CELL_SIZE },
      west:  { x: 2 * GRID.CELL_SIZE, y: centerY * GRID.CELL_SIZE },
      south: { x: centerX * GRID.CELL_SIZE, y: (GRID.ROWS - 3) * GRID.CELL_SIZE }
    };
    const available = ['north', 'east', 'west', 'south'].filter(d => exits[d]);
    let nearest = null;
    let nearestDist = Infinity;
    for (const dir of available) {
      const ep = exitPositions[dir];
      const dx = ep.x - this.position.x;
      const dy = ep.y - this.position.y;
      const d = dx * dx + dy * dy;
      if (d < nearestDist) { nearestDist = d; nearest = ep; }
    }
    this.fleeTargetPos = nearest;
  }

  _updatePermaFlee(deltaTime) {
    if (!this.fleeTargetPos || this.fleeReached) {
      this.velocity.vx = 0;
      this.velocity.vy = 0;
      this.targetVelocity.vx = 0;
      this.targetVelocity.vy = 0;
      return;
    }
    const dx = this.fleeTargetPos.x - this.position.x;
    const dy = this.fleeTargetPos.y - this.position.y;
    const d = Math.hypot(dx, dy);
    if (d < PERMA_FLEE_ARRIVE_DIST) {
      this.fleeReached = true;
      this.velocity.vx = 0;
      this.velocity.vy = 0;
      this.targetVelocity.vx = 0;
      this.targetVelocity.vy = 0;
      return;
    }
    this.targetVelocity.vx = (dx / d) * PERMA_FLEE_SPEED;
    this.targetVelocity.vy = (dy / d) * PERMA_FLEE_SPEED;
    this.velocity.vx = this.targetVelocity.vx;
    this.velocity.vy = this.targetVelocity.vy;
  }
}
