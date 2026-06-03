import { GRID } from '../game/GameConfig.js';

const SCARE_RADIUS = GRID.CELL_SIZE * 1.6;
const FLEE_SPEED = 90;
const RETURN_SPEED = 35;
const FLEE_DURATION = 1.4;
const RETURN_ARRIVE_DIST = 4;
const IDLE_BOB_AMP = 1.5;
const IDLE_BOB_FREQ = 1.8;

// Bread-seeking — crows path toward the loaf and "eat" it on contact.
// Search radius is generous (whole room) since there should only ever be a
// handful of bread items dropped at once.
const BREAD_SEEK_SPEED = 55;
const BREAD_EAT_DIST = GRID.CELL_SIZE * 0.7;

// Companion tuning. Orbit radius is wider for enemies (don't crowd combat)
// and tighter for pickup items (so the visual cue reads clearly).
const COMPANION_FOLLOW_SPEED = 80;
const COMPANION_INGREDIENT_SPEED = 110;
const COMPANION_PICKUP_DIST = GRID.CELL_SIZE * 0.6;
const COMPANION_ORBIT_ANG_SPEED = 3.2; // rad/sec
const COMPANION_ORBIT_RADIUS_ENEMY = GRID.CELL_SIZE * 1.8;
const COMPANION_ORBIT_RADIUS_ITEM = GRID.CELL_SIZE * 1.2;
const COMPANION_SHOULDER_OFFSET = { x: -GRID.CELL_SIZE * 0.55, y: -GRID.CELL_SIZE * 0.5 };
const COMPANION_SHOULDER_SNAP_DIST = GRID.CELL_SIZE * 0.25;

// Idle crow — drops a hoarded shiny if marked, otherwise just a quiet world detail.
// State machine: 'idle' → 'fleeing' (scared by weapon) → 'returning' → 'idle'.
// Background-object chars the crow is happy to settle on/near.
const PERCH_CHARS = new Set(['&', 'Y']); // tree, stump
const PERCH_SEARCH_RADIUS = GRID.CELL_SIZE * 9;
const PERCH_OFFSET = GRID.CELL_SIZE * 0.6; // sit slightly above the tree glyph

// Dive-attack tuning (companions). Coordinated by main.js: only ONE companion
// dives at a time, after a sustained orbit telegraph. Crows keep orbiting
// during the windup so the approach angle varies (indirect feel), then dash.
// Miss rate is rolled at launch — diveDir is offset so the dash whiffs past.
const DIVE_WINDUP = 1.3;            // orbit-while-telegraphing duration
const DIVE_SPEED = 210;             // dash speed — fast strike phase
const DIVE_DURATION = 0.45;
const DIVE_COOLDOWN = 2.4;
const DIVE_HIT_DIST = GRID.CELL_SIZE * 0.7;
const DIVE_MISS_OFFSET = GRID.CELL_SIZE * 1.1;  // perpendicular swerve when missing

// Follower-flock tuning. After a feed event, all room crows (plus existing
// followers) become followers: fly to the eat point first ('interested'),
// then drift around the player at distance, occasionally perching nearby.
const INTEREST_SPEED = 70;
const INTEREST_ARRIVE_DIST = GRID.CELL_SIZE * 0.8;
const FOLLOW_SPEED = 45;
const FOLLOW_TARGET_DIST = GRID.CELL_SIZE * 5;     // preferred orbit radius around player
const FOLLOW_ANG_SPEED = 1.2;                       // rad/sec drift around player
const FOLLOW_TELEPORT_DIST = GRID.CELL_SIZE * 22;   // out-of-room → snap to room edge
const PERCH_CHECK_INTERVAL = 1.2;                   // seconds between landing attempts
const PERCH_CHANCE = 0.45;                          // per check, when player is slow
const PERCH_LEAVE_DIST = GRID.CELL_SIZE * 10;       // if player gets this far, take off
const PLAYER_SLOW_THRESHOLD = 40;                   // px/sec — under this, perches allowed

export class Crow {
  constructor(x, y, { hoardItem = null } = {}) {
    this.position = { x, y };
    this.homePosition = { x, y };
    this.originalHome = { x, y };
    this.velocity = { vx: 0, vy: 0 };

    this.char = 'v';
    this.color = '#5a5a6a';
    this.width = GRID.CELL_SIZE;
    this.height = GRID.CELL_SIZE;
    this.plane = 0;

    // State machine:
    //   'idle' → 'fleeing' (scared by weapon/player) → 'returning' → 'idle'
    //   'idle'/'returning'/'fleeing' → 'seekingBread' on bread sighted → eats → promoted to companion.
    this.state = 'idle';
    this.fleeTimer = 0;
    this.bobPhase = Math.random() * Math.PI * 2;
    this.wingPhase = Math.random() * Math.PI * 2;

    // hoardItem: ingredient glyph this crow carries (e.g. '●', '1', 'c'), or null.
    // Dropped exactly once on the crow's first scare; the matching-color pixel
    // is constructed by the caller via new Ingredient(glyph, ...).
    this.hoardItem = hoardItem;
    this.droppedHoard = false;

    // Reference to the Item entity this crow is paths toward; cleared on eat
    // or if the target is consumed/removed by something else.
    this.breadTarget = null;

    // Companion mode — set by becomeCompanion() when any crow eats bread.
    // Wild crows live in room.crows; companions live on game.companionCrows
    // and travel across rooms.
    this.mode = 'wild';
    this.companionTask = 'perched';    // 'ingredient' | 'enemy' | 'item' | 'perched'
    this.companionTarget = null;       // ingredient/enemy/item entity
    this.companionOrbitPhase = Math.random() * Math.PI * 2;

    // Follower mode — flock that trails the player after a feeding event.
    // becomeFollower() flips this on; followers live on game.followerCrows.
    // followerSubstate: 'interested' (flying to feed point) → 'follow' (orbit
    // player) → 'perched' (landed on a nearby tree/stump, will resume on player move).
    this.followerSubstate = null;
    this.followerInterestPoint = null;
    this.followerPerchCheckTimer = Math.random() * PERCH_CHECK_INTERVAL;
    this.followerOrbitPhase = Math.random() * Math.PI * 2;

    // Dive-attack state (companions). Coordinated by main.js when 2+ companions
    // are orbiting the same enemy. Mirrors boar charge: windup → charging → cooldown.
    this.diveState = 'idle';
    this.diveTarget = null;
    this.diveDir = { x: 0, y: 0 };
    this.diveWindupTimer = 0;
    this.diveDurationTimer = 0;
    this.diveCooldownTimer = 0;
    this.diveHasHit = false;
    this.diveWillMiss = false;
    this.companionShoulderIndex = 0; // assigned by main.js; spreads multi-perch
    this.bondingTimer = 0;           // becomeCompanion sets this; locks the crow to the shoulder for the duration

    // Physics flags so PhysicsSystem leaves us alone (we manage our own motion).
    this.hasCollision = false;
    this.boundToGrid = false;
    this.friction = false;
  }

  // One-way promotion: wild crow → companion. Caller is responsible for
  // pulling this crow out of room.crows and parking it on game.companionCrows.
  becomeCompanion() {
    this.mode = 'companion';
    this.state = 'idle';
    this.breadTarget = null;
    this.velocity.vx = 0;
    this.velocity.vy = 0;
    this.bondingTimer = 3.0;
  }

  // Shared companion hook: snap to the player on room entry and clear transient
  // state. Each companion type implements its own onRoomEnter so main.js can
  // dispatch all companions through one unified call site.
  onRoomEnter(player) {
    if (!player) return;
    const offset = this._shoulderOffset();
    this.position.x = player.position.x + offset.x;
    this.position.y = player.position.y + offset.y;
    this.velocity.vx = 0;
    this.velocity.vy = 0;
    this.diveState = 'idle';
    this.diveTarget = null;
    this.diveCooldownTimer = 0;
    this.companionTarget = null;
    this.companionTask = 'perched';
  }

  // Convert/redirect a crow into the player's flock. Caller pulls room crows
  // out of currentRoom.crows on first feed; on subsequent feeds, existing
  // followers get their interest point retargeted to the new feed location.
  // Triggered by any successful feed event (not just promotion).
  becomeFollower(feedX, feedY) {
    this.mode = 'follower';
    this.followerSubstate = 'interested';
    this.followerInterestPoint = { x: feedX, y: feedY };
    this.state = 'idle';
    this.breadTarget = null;
    this.velocity.vx = 0;
    this.velocity.vy = 0;
  }

  scare(fromX, fromY) {
    const wasIdle = this.state === 'idle';

    // Already airborne? Refresh the flee timer and reflag as fleeing,
    // but don't drop a hoard item twice and don't bother repicking direction unless idle.
    if (!wasIdle) {
      this.state = 'fleeing';
      this.fleeTimer = FLEE_DURATION;
      return null;
    }

    const dx = this.position.x - fromX;
    const dy = this.position.y - fromY;
    const len = Math.hypot(dx, dy) || 1;
    // Bias upward — crows take to the air, not sideways along the floor.
    const nx = dx / len;
    const ny = (dy / len) - 0.6;
    const nlen = Math.hypot(nx, ny) || 1;

    this.velocity.vx = (nx / nlen) * FLEE_SPEED + (Math.random() - 0.5) * 40;
    this.velocity.vy = (ny / nlen) * FLEE_SPEED + (Math.random() - 0.5) * 40;

    this.state = 'fleeing';
    this.fleeTimer = FLEE_DURATION;

    const shouldDrop = this.hoardItem && !this.droppedHoard;
    if (shouldDrop) {
      this.droppedHoard = true;
      return this.hoardItem;
    }
    return null;
  }

  update(deltaTime, backgroundObjects = [], otherCrows = [], breadItems = [], onAteBread = null) {
    this.wingPhase += deltaTime * 10;

    // Bread sighting overrides idle/returning. Fleeing crows still finish
    // their flee arc first — getting shot at is a higher signal than food.
    if (breadItems.length && this.state !== 'fleeing' && this.state !== 'seekingBread') {
      const nearest = this._pickClosestBread(breadItems);
      if (nearest) {
        this.breadTarget = nearest;
        this.state = 'seekingBread';
      }
    }

    if (this.state === 'seekingBread') {
      // Target may have been picked up / despawned by something else
      const target = this.breadTarget;
      if (!target || target.consumed || target.destroyed) {
        this.breadTarget = null;
        this.state = 'returning';
      } else {
        const dx = target.position.x - this.position.x;
        const dy = target.position.y - this.position.y;
        const dist = Math.hypot(dx, dy);
        if (dist < BREAD_EAT_DIST) {
          this.breadTarget = null;
          target.consumed = true;
          if (onAteBread) onAteBread(target, this);
          // Settle in place — caller can recycle a perch on next idle cycle.
          this.homePosition = { x: this.position.x, y: this.position.y };
          this.state = 'returning';
        } else {
          const speed = BREAD_SEEK_SPEED;
          this.velocity.vx = (dx / dist) * speed;
          this.velocity.vy = (dy / dist) * speed;
          this.position.x += this.velocity.vx * deltaTime;
          this.position.y += this.velocity.vy * deltaTime;
        }
      }
      return;
    }

    if (this.state === 'idle') {
      this.bobPhase += deltaTime * IDLE_BOB_FREQ;
      // Bob is rendered as an offset — base position stays put so home math is stable.
      return;
    }

    if (this.state === 'fleeing') {
      this.position.x += this.velocity.vx * deltaTime;
      this.position.y += this.velocity.vy * deltaTime;

      // Clamp inside playable area, deflect velocity gently off the walls.
      const minX = GRID.CELL_SIZE * 2;
      const minY = GRID.CELL_SIZE * 2;
      const maxX = GRID.WIDTH - GRID.CELL_SIZE * 2;
      const maxY = GRID.HEIGHT - GRID.CELL_SIZE * 2;
      if (this.position.x < minX) { this.position.x = minX; this.velocity.vx = Math.abs(this.velocity.vx) * 0.6; }
      if (this.position.x > maxX) { this.position.x = maxX; this.velocity.vx = -Math.abs(this.velocity.vx) * 0.6; }
      if (this.position.y < minY) { this.position.y = minY; this.velocity.vy = Math.abs(this.velocity.vy) * 0.6; }
      if (this.position.y > maxY) { this.position.y = maxY; this.velocity.vy = -Math.abs(this.velocity.vy) * 0.6; }

      this.fleeTimer -= deltaTime;
      if (this.fleeTimer <= 0) {
        // Pick a new perch — nearest tree/stump, else nearest wall edge, else original spot.
        this.homePosition = this._choosePerch(backgroundObjects, otherCrows);
        this.state = 'returning';
      }
      return;
    }

    if (this.state === 'returning') {
      const dx = this.homePosition.x - this.position.x;
      const dy = this.homePosition.y - this.position.y;
      const dist = Math.hypot(dx, dy);
      if (dist < RETURN_ARRIVE_DIST) {
        this.position.x = this.homePosition.x;
        this.position.y = this.homePosition.y;
        this.velocity.vx = 0;
        this.velocity.vy = 0;
        this.state = 'idle';
        return;
      }
      const speed = RETURN_SPEED;
      this.velocity.vx = (dx / dist) * speed;
      this.velocity.vy = (dy / dist) * speed;
      this.position.x += this.velocity.vx * deltaTime;
      this.position.y += this.velocity.vy * deltaTime;
    }
  }

  // Prefer the nearest tree/stump within search radius; otherwise the nearest wall edge.
  // Falls back to the original spawn position when neither is available. Skips any
  // perch already claimed by another crow (within half a cell of its homePosition)
  // so flocks don't stack on the same branch.
  _choosePerch(backgroundObjects, otherCrows = []) {
    const taken = [];
    for (const other of otherCrows) {
      if (!other || other === this) continue;
      taken.push(other.homePosition);
    }
    const claimDistSq = (GRID.CELL_SIZE * 0.5) ** 2;
    const isTaken = (x, y) => taken.some(p => {
      if (!p) return false;
      const dx = p.x - x;
      const dy = p.y - y;
      return dx * dx + dy * dy < claimDistSq;
    });

    let bestPerch = null;
    let bestDistSq = PERCH_SEARCH_RADIUS * PERCH_SEARCH_RADIUS;

    for (const obj of backgroundObjects) {
      if (!obj || obj.destroyed) continue;
      if (!PERCH_CHARS.has(obj.char)) continue;
      const perchX = obj.position.x;
      const perchY = obj.position.y - PERCH_OFFSET;
      if (isTaken(perchX, perchY)) continue;
      const dx = obj.position.x - this.position.x;
      const dy = obj.position.y - this.position.y;
      const distSq = dx * dx + dy * dy;
      if (distSq < bestDistSq) {
        bestDistSq = distSq;
        bestPerch = { x: perchX, y: perchY };
      }
    }

    if (bestPerch) return bestPerch;

    // No tree nearby — pick the nearest wall edge, one cell inside the border.
    const inset = GRID.CELL_SIZE * 1.5;
    const candidates = [
      { x: inset,                    y: this.position.y },           // west wall
      { x: GRID.WIDTH - inset,       y: this.position.y },           // east wall
      { x: this.position.x,          y: inset },                     // north wall
      { x: this.position.x,          y: GRID.HEIGHT - inset },       // south wall
    ];
    let bestWall = null;
    let bestWallDistSq = Infinity;
    for (const c of candidates) {
      if (isTaken(c.x, c.y)) continue;
      const dx = c.x - this.position.x;
      const dy = c.y - this.position.y;
      const d = dx * dx + dy * dy;
      if (d < bestWallDistSq) { bestWallDistSq = d; bestWall = c; }
    }
    if (bestWall) return bestWall;

    return { x: this.originalHome.x, y: this.originalHome.y };
  }

  // Companion main loop. Called by main.js once per frame while
  // game.companionCrow exists and the player is in EXPLORE.
  //
  // Priority FSM (recomputed every frame):
  //   1. Path directly to nearest ingredient → auto-pickup.
  //   2. Orbit nearest enemy — waits for it to drop an ingredient (which
  //      promotes back to priority 1 next frame).
  //   3. Orbit nearest player-pickup item (weapon/armor/consumable on the
  //      ground) so the player knows it's there.
  //   4. Perch on the player's shoulder: position locks 1:1 with a tiny offset.
  //
  // ctx: { player, ingredients, enemies, items, addIngredient, room }
  updateAsCompanion(deltaTime, ctx) {
    this.wingPhase += deltaTime * 7;
    if (!ctx || !ctx.player) return;

    // Dive: 'diving' fully overrides the FSM. 'windup' keeps the crow in
    // orbit around its target so the eventual dash angle is whatever orbit
    // position it happens to be at — gives the approach an indirect feel
    // instead of a stand-still-then-teleport-in pattern.
    if (this.diveState === 'diving') return;
    if (this.diveCooldownTimer > 0) this.diveCooldownTimer -= deltaTime;
    if (this.diveState === 'windup' && this.diveTarget) {
      this._orbitTarget(this.diveTarget, COMPANION_ORBIT_RADIUS_ENEMY, deltaTime);
      return;
    }

    // Bonding perch: a freshly-promoted companion rides the player's shoulder
    // for a few seconds so the player feels the moment they joined up.
    // Snaps in place (no fly-in) since they "land" the instant they eat.
    if (this.bondingTimer > 0) {
      this.bondingTimer -= deltaTime;
      this.companionTask = 'perched';
      this.companionTarget = ctx.player;
      const offset = this._shoulderOffset();
      this.position.x = ctx.player.position.x + offset.x;
      this.position.y = ctx.player.position.y + offset.y;
      return;
    }

    // Priority 1: ingredients — grab dropped shinies before anything else.
    const ingredient = this._closestPickable(ctx.ingredients, ctx.player.plane);
    if (ingredient) {
      this.companionTask = 'ingredient';
      this.companionTarget = ingredient;
      const dx = ingredient.position.x - this.position.x;
      const dy = ingredient.position.y - this.position.y;
      const dist = Math.hypot(dx, dy);
      if (dist < COMPANION_PICKUP_DIST) {
        // Full hand-off: routes to inventory, unregisters physics, drops
        // the entity from game.ingredients. Setting `consumed` alone left
        // a ghost on the ground that the crow ignored but never cleaned up.
        ctx.pickupIngredient?.(ingredient);
      } else {
        const s = COMPANION_INGREDIENT_SPEED;
        this.position.x += (dx / dist) * s * deltaTime;
        this.position.y += (dy / dist) * s * deltaTime;
      }
      return;
    }

    // Priority 2: enemies — orbit (dive coordinated by main.js)
    const enemy = this._closestAlive(ctx.enemies, ctx.player.plane);
    if (enemy) {
      this.companionTask = 'enemy';
      this.companionTarget = enemy;
      this._orbitTarget(enemy, COMPANION_ORBIT_RADIUS_ENEMY, deltaTime);
      return;
    }

    // Priority 3: pickup items (weapons, armor, consumables, traps)
    const item = this._closestPickable(ctx.items, ctx.player.plane, it => it.char !== '⌬');
    if (item) {
      this.companionTask = 'item';
      this.companionTarget = item;
      this._orbitTarget(item, COMPANION_ORBIT_RADIUS_ITEM, deltaTime);
      return;
    }

    // Priority 4: perch near the player. With multiple companions, fan out
    // around the player so they don't stack — left shoulder, right shoulder,
    // overhead, alternating outward by index.
    this.companionTask = 'perched';
    this.companionTarget = ctx.player;
    const offset = this._shoulderOffset();
    const tx = ctx.player.position.x + offset.x;
    const ty = ctx.player.position.y + offset.y;
    const dx = tx - this.position.x;
    const dy = ty - this.position.y;
    const dist = Math.hypot(dx, dy);
    if (dist < COMPANION_SHOULDER_SNAP_DIST) {
      this.position.x = tx;
      this.position.y = ty;
    } else {
      const s = COMPANION_FOLLOW_SPEED;
      this.position.x += (dx / dist) * s * deltaTime;
      this.position.y += (dy / dist) * s * deltaTime;
    }
  }

  // Distribute multiple companion perches around the player. Index 0 = left
  // shoulder (the default), 1 = right shoulder, 2 = overhead, then alternates
  // outward in a small arc.
  _shoulderOffset() {
    const i = this.companionShoulderIndex | 0;
    const C = GRID.CELL_SIZE;
    const base = COMPANION_SHOULDER_OFFSET;
    if (i === 0) return base;
    if (i === 1) return { x: -base.x, y: base.y };       // right shoulder
    if (i === 2) return { x: 0,       y: base.y - C * 0.4 }; // overhead
    // i >= 3: arc above the head, spread ±
    const slot = i - 3;
    const side = slot % 2 === 0 ? 1 : -1;
    const ring = Math.floor(slot / 2) + 1;
    return { x: side * C * (0.55 + ring * 0.3), y: base.y - C * (0.5 + ring * 0.2) };
  }

  // Start a dive on a specific enemy. Caller (main.js) gates this to one
  // companion at a time. `miss` is rolled at launch — a missed dive swerves
  // perpendicular to the approach so the dash visually whiffs past.
  beginDive(target, { miss = false } = {}) {
    if (!target || this.diveCooldownTimer > 0) return;
    this.diveState = 'windup';
    this.diveTarget = target;
    this.diveWindupTimer = DIVE_WINDUP;
    this.diveHasHit = false;
    this.diveWillMiss = miss;
  }

  // Per-frame dive driver. Returns the enemy on a fresh hit so main.js can
  // apply damage + impact particles; null otherwise.
  updateDive(deltaTime) {
    this.wingPhase += deltaTime * 7;
    const target = this.diveTarget;
    if (!target || target.isDead || target.dead || target.hp <= 0) {
      this.diveState = 'idle';
      this.diveTarget = null;
      this.diveCooldownTimer = DIVE_COOLDOWN;
      return null;
    }
    if (this.diveState === 'windup') {
      this.diveWindupTimer -= deltaTime;
      if (this.diveWindupTimer <= 0) {
        const dx = target.position.x - this.position.x;
        const dy = target.position.y - this.position.y;
        const d = Math.hypot(dx, dy) || 1;
        let dirX = dx / d;
        let dirY = dy / d;
        // Missed dive: swerve perpendicular so the dash whiffs past the enemy.
        if (this.diveWillMiss) {
          const side = Math.random() < 0.5 ? 1 : -1;
          const px = -dirY * side;
          const py = dirX * side;
          const offset = DIVE_MISS_OFFSET / DIVE_DURATION / DIVE_SPEED;
          dirX += px * offset;
          dirY += py * offset;
          const nlen = Math.hypot(dirX, dirY) || 1;
          dirX /= nlen;
          dirY /= nlen;
        }
        this.diveDir = { x: dirX, y: dirY };
        this.diveState = 'diving';
        this.diveDurationTimer = DIVE_DURATION;
      }
      return null;
    }
    if (this.diveState === 'diving') {
      this.position.x += this.diveDir.x * DIVE_SPEED * deltaTime;
      this.position.y += this.diveDir.y * DIVE_SPEED * deltaTime;
      this.diveDurationTimer -= deltaTime;
      // Hit check while dashing — missed dives never connect even if
      // the swerve trajectory happens to clip the enemy hitbox.
      const dx = target.position.x - this.position.x;
      const dy = target.position.y - this.position.y;
      const hit = !this.diveWillMiss && !this.diveHasHit && Math.hypot(dx, dy) < DIVE_HIT_DIST;
      if (this.diveDurationTimer <= 0) {
        this.diveState = 'idle';
        this.diveTarget = null;
        this.diveCooldownTimer = DIVE_COOLDOWN;
      }
      return hit ? target : null;
    }
    return null;
  }

  // Follower main loop. Called by main.js once per frame on every entry of
  // game.followerCrows. Substates:
  //   'interested' — fly to the feed point that triggered follower mode
  //   'follow' — orbit the player at FOLLOW_TARGET_DIST; occasionally pick
  //              a tree/stump perch nearby and switch to 'toPerch'
  //   'toPerch' — fly to the claimed perch at RETURN_SPEED (matches wild crow)
  //   'perched' — sit on the perch; take off if player wanders far
  //
  // ctx: { player, backgroundObjects, playerSpeed }
  updateAsFollower(deltaTime, ctx) {
    this.wingPhase += deltaTime * 7;
    if (!ctx || !ctx.player) return;

    // Cross-room teleport: if our position is wildly far from the player
    // (room transition just happened), snap to a random edge of the new room
    // so we "fly in" rather than stay frozen off-screen.
    const playerDx = ctx.player.position.x - this.position.x;
    const playerDy = ctx.player.position.y - this.position.y;
    if (Math.hypot(playerDx, playerDy) > FOLLOW_TELEPORT_DIST) {
      const edge = Math.floor(Math.random() * 4);
      const inset = GRID.CELL_SIZE * 2;
      if (edge === 0)      { this.position.x = inset;                  this.position.y = ctx.player.position.y + (Math.random() - 0.5) * GRID.CELL_SIZE * 4; }
      else if (edge === 1) { this.position.x = GRID.WIDTH - inset;     this.position.y = ctx.player.position.y + (Math.random() - 0.5) * GRID.CELL_SIZE * 4; }
      else if (edge === 2) { this.position.x = ctx.player.position.x + (Math.random() - 0.5) * GRID.CELL_SIZE * 4; this.position.y = inset; }
      else                 { this.position.x = ctx.player.position.x + (Math.random() - 0.5) * GRID.CELL_SIZE * 4; this.position.y = GRID.HEIGHT - inset; }
      this.followerSubstate = 'follow';
      this.followerPerchCheckTimer = PERCH_CHECK_INTERVAL;
    }

    if (this.followerSubstate === 'interested' && this.followerInterestPoint) {
      const dx = this.followerInterestPoint.x - this.position.x;
      const dy = this.followerInterestPoint.y - this.position.y;
      const dist = Math.hypot(dx, dy);
      if (dist < INTEREST_ARRIVE_DIST) {
        this.followerSubstate = 'follow';
        this.followerInterestPoint = null;
      } else {
        this.position.x += (dx / dist) * INTEREST_SPEED * deltaTime;
        this.position.y += (dy / dist) * INTEREST_SPEED * deltaTime;
      }
      return;
    }

    if (this.followerSubstate === 'perched') {
      this.bobPhase += deltaTime * IDLE_BOB_FREQ;
      // Take off if the player gets too far from this perch.
      const dpx = ctx.player.position.x - this.homePosition.x;
      const dpy = ctx.player.position.y - this.homePosition.y;
      if (Math.hypot(dpx, dpy) > PERCH_LEAVE_DIST) {
        this.followerSubstate = 'follow';
        this.followerPerchCheckTimer = PERCH_CHECK_INTERVAL * 0.5;
      }
      return;
    }

    // 'toPerch' — fly to the claimed perch (mirrors the wild 'returning'
    // behavior so landings read as flight, not a teleport).
    if (this.followerSubstate === 'toPerch') {
      const dx = this.homePosition.x - this.position.x;
      const dy = this.homePosition.y - this.position.y;
      const dist = Math.hypot(dx, dy);
      if (dist < RETURN_ARRIVE_DIST) {
        this.position.x = this.homePosition.x;
        this.position.y = this.homePosition.y;
        this.followerSubstate = 'perched';
        return;
      }
      this.position.x += (dx / dist) * RETURN_SPEED * deltaTime;
      this.position.y += (dy / dist) * RETURN_SPEED * deltaTime;
      return;
    }

    // 'follow' — orbit the player at FOLLOW_TARGET_DIST.
    this.followerOrbitPhase += FOLLOW_ANG_SPEED * deltaTime;
    const orbitX = ctx.player.position.x + Math.cos(this.followerOrbitPhase) * FOLLOW_TARGET_DIST;
    const orbitY = ctx.player.position.y + Math.sin(this.followerOrbitPhase) * FOLLOW_TARGET_DIST;
    const dx = orbitX - this.position.x;
    const dy = orbitY - this.position.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 0.5) {
      this.position.x += (dx / dist) * FOLLOW_SPEED * deltaTime;
      this.position.y += (dy / dist) * FOLLOW_SPEED * deltaTime;
    }

    // Periodic perch attempt: only when player is moving slowly. Picks the
    // nearest free tree/stump and switches to 'perched' if one is in range.
    this.followerPerchCheckTimer -= deltaTime;
    if (this.followerPerchCheckTimer <= 0) {
      this.followerPerchCheckTimer = PERCH_CHECK_INTERVAL;
      const playerSpeed = ctx.playerSpeed || 0;
      if (playerSpeed < PLAYER_SLOW_THRESHOLD && Math.random() < PERCH_CHANCE) {
        const perch = this._choosePerch(ctx.backgroundObjects || [], ctx.otherFollowers || []);
        // Only commit if the perch is reasonably close to the player too — no
        // perching halfway across the map.
        const ppx = ctx.player.position.x - perch.x;
        const ppy = ctx.player.position.y - perch.y;
        if (Math.hypot(ppx, ppy) < PERCH_LEAVE_DIST * 0.8) {
          this.homePosition = perch;
          this.followerSubstate = 'toPerch';
        }
      }
    }
  }

  _orbitTarget(target, radius, deltaTime) {
    this.companionOrbitPhase += COMPANION_ORBIT_ANG_SPEED * deltaTime;
    const tx = target.position.x + Math.cos(this.companionOrbitPhase) * radius;
    const ty = target.position.y + Math.sin(this.companionOrbitPhase) * radius;
    const dx = tx - this.position.x;
    const dy = ty - this.position.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.5) {
      this.position.x = tx;
      this.position.y = ty;
      return;
    }
    const s = COMPANION_FOLLOW_SPEED;
    this.position.x += (dx / dist) * s * deltaTime;
    this.position.y += (dy / dist) * s * deltaTime;
  }

  _closestPickable(list, plane, extraFilter = null) {
    if (!list || !list.length) return null;
    let best = null;
    let bestDistSq = Infinity;
    for (const e of list) {
      if (!e || e.consumed || e.destroyed) continue;
      if (e.pickupReadyAt && e.pickupReadyAt > performance.now()) continue;
      if (e.plane !== undefined && plane !== undefined && e.plane !== plane) continue;
      if (extraFilter && !extraFilter(e)) continue;
      const dx = e.position.x - this.position.x;
      const dy = e.position.y - this.position.y;
      const d = dx * dx + dy * dy;
      if (d < bestDistSq) { bestDistSq = d; best = e; }
    }
    return best;
  }

  _closestAlive(list, plane) {
    if (!list || !list.length) return null;
    let best = null;
    let bestDistSq = Infinity;
    for (const e of list) {
      if (!e || e.isDead || e.dead || e.hp <= 0) continue;
      if (e.plane !== undefined && plane !== undefined && e.plane !== plane) continue;
      const dx = e.position.x - this.position.x;
      const dy = e.position.y - this.position.y;
      const d = dx * dx + dy * dy;
      if (d < bestDistSq) { bestDistSq = d; best = e; }
    }
    return best;
  }

  _pickClosestBread(breadItems) {
    let best = null;
    let bestDistSq = Infinity;
    for (const it of breadItems) {
      if (!it || it.consumed || it.destroyed) continue;
      const dx = it.position.x - this.position.x;
      const dy = it.position.y - this.position.y;
      const d = dx * dx + dy * dy;
      if (d < bestDistSq) { bestDistSq = d; best = it; }
    }
    return best;
  }

  // Renderer reads this to nudge the y position. Idle = subtle bob; flying = wing-flap waver.
  // Companion perched on the player's shoulder rides 1:1 with the player —
  // an idle bob would visually decouple the crow from its perch.
  getRenderOffsetY() {
    if (this.mode === 'companion' && this.companionTask === 'perched') return 0;
    if (this.state === 'idle' || this.followerSubstate === 'perched') {
      return Math.sin(this.bobPhase) * IDLE_BOB_AMP;
    }
    return Math.sin(this.wingPhase) * 2;
  }

  // True when an attack point is within scare distance.
  isWithinScareRange(x, y) {
    const dx = this.position.x - x;
    const dy = this.position.y - y;
    return (dx * dx + dy * dy) <= SCARE_RADIUS * SCARE_RADIUS;
  }
}

export { SCARE_RADIUS };
