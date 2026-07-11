import { GRID } from '../game/GameConfig.js';

const BOULDER_SPEED      = 60;   // px/s
const BOULDER_SPEED_LAVA = 40;   // px/s on lava
const BOULDER_DAMAGE     = 2;
const SPAWN_CHECK_INTERVAL = 2.0;
const WARNING_TIME       = 2.0;  // seconds of warning before first rock spawns
const ROCK_STAGGER       = 0.45; // seconds between each of the 3 rocks
const ROCK_CHARS         = ['O', 'o', '0', 'Q'];
const ROLL_ANIM_INTERVAL = 0.10;
const HIT_COOLDOWN       = 0.5;
const HIT_RADIUS         = GRID.CELL_SIZE * 0.85;
const DEFLECT_RADIUS     = GRID.CELL_SIZE * 1.1;  // hammer reach to redirect a rolling boulder

// Deflector triangles render and collide at cell size, so the visible shape
// and every physics test reference the exact same geometry.
export const DEFLECTOR_HALF_EXTENT = GRID.CELL_SIZE * 0.5;

// Point-inside-right-triangle test for a deflector. (px, py) is in world pixels.
// The triangle is a 2h × 2h right triangle centered on the deflector's cell
// center, with the right-angle corner determined by `elbow`.
export function pointInDeflector(deflector, px, py, h = DEFLECTOR_HALF_EXTENT) {
  const cx = deflector.position.x + GRID.CELL_SIZE / 2;
  const cy = deflector.position.y + GRID.CELL_SIZE / 2;
  const dx = px - cx;
  const dy = py - cy;
  if (dx < -h || dx > h || dy < -h || dy > h) return false;
  switch (deflector.data.deflectorElbow) {
    case 'NE': return dx - dy <= 0;  // RA at SW: inside is dy ≥ dx
    case 'NW': return dx + dy >= 0;  // RA at SE
    case 'SE': return dx + dy <= 0;  // RA at NW
    case 'SW': return dx - dy >= 0;  // RA at NE
    default:   return false;
  }
}

const DIRECTIONS = ['north', 'south', 'east', 'west'];

// Direction names the source edge; vectors point AWAY from that edge.
const DIR_VEC = {
  north: { dx: 0,  dy: 1  },
  south: { dx: 0,  dy: -1 },
  east:  { dx: -1, dy: 0  },
  west:  { dx: 1,  dy: 0  },
};

export class BoulderSystem {
  constructor(game) {
    this.game = game;
    this.rocks = [];        // active single-char rocks
    this.pending = [];      // { delay, lateral } rocks waiting to spawn
    this.warnings = [];     // edge arrow indicators
    this.spawnCheckTimer = 0;
    this.roomDirection = null;
    this._lastRoom = null;
  }

  update(deltaTime) {
    const game = this.game;
    if (!game.currentRoom || game.currentRoom.zone !== 'red') {
      this._reset();
      return;
    }

    if (game.currentRoom !== this._lastRoom) {
      this._lastRoom = game.currentRoom;
      this.roomDirection = DIRECTIONS[Math.floor(Math.random() * DIRECTIONS.length)];
      this.rocks = [];
      this.pending = [];
      this.warnings = [];
      this.spawnCheckTimer = 0;

    }

    // Periodic spawn roll
    this.spawnCheckTimer += deltaTime;
    if (this.spawnCheckTimer >= SPAWN_CHECK_INTERVAL) {
      this.spawnCheckTimer = 0;
      const depth = game.zoneDepths?.red || 0;
      const chance = Math.min(0.20, 0.02 + depth * 0.012);
      if (Math.random() < chance) this._scheduleWarning();
    }

    // Tick warnings
    for (let i = this.warnings.length - 1; i >= 0; i--) {
      this.warnings[i].timer -= deltaTime;
      if (this.warnings[i].timer <= 0) {
        this._queueRocks(this.warnings[i]);
        this.warnings.splice(i, 1);
      }
    }

    // Tick pending rocks → spawn when delay expires
    for (let i = this.pending.length - 1; i >= 0; i--) {
      this.pending[i].delay -= deltaTime;
      if (this.pending[i].delay <= 0) {
        this._spawnRock(this.pending[i]);
        this.pending.splice(i, 1);
      }
    }

    // Update active rocks
    const inHut = game.player.inHut;
    const inMaze = game.player.inMaze;

    for (let i = this.rocks.length - 1; i >= 0; i--) {
      const r = this.rocks[i];

      // Hammer strike ("the right tool") redirects the boulder away from the
      // player and empowers it: ×2 speed and damage. The charged boulder turns
      // the zone's hazard into the player's weapon — routed through deflector
      // rocks into enemies or a blocked cave. Bounces (Phase 2) act on any
      // boulder; only the empowered one carries enough force to break a cave.
      // Other blunt weapons (flail, staff, bat) knock the boulder back the
      // same way but never empower it — that stays hammer-exclusive.
      if (game.combatSystem) {
        for (const attack of game.combatSystem.getMeleeAttacks()) {
          if (!attack.canSmash && !attack.isBlunt) continue;
          const adx = r.x - attack.position.x;
          const ady = r.y - attack.position.y;
          if (adx * adx + ady * ady > DEFLECT_RADIUS * DEFLECT_RADIUS) continue;
          // One deflect per swing — the attack lingers a few frames.
          if (!attack._deflectedRocks) attack._deflectedRocks = new Set();
          if (attack._deflectedRocks.has(r)) continue;
          attack._deflectedRocks.add(r);
          // Snap the new heading to the cardinal axis pointing away from the
          // player, so it reads as "I knocked it that way" and stays grid-true
          // for deterministic deflector-rock bounces.
          const pcx = game.player.position.x + GRID.CELL_SIZE / 2;
          const pcy = game.player.position.y + GRID.CELL_SIZE / 2;
          const rdx = r.x - pcx;
          const rdy = r.y - pcy;
          if (Math.abs(rdx) >= Math.abs(rdy)) { r.vx = Math.sign(rdx) || 1; r.vy = 0; }
          else { r.vx = 0; r.vy = Math.sign(rdy) || 1; }
          if (attack.canSmash) r.empowered = true;
          // Grace the striker so the boulder they just hit doesn't instantly recoil into them.
          r.hitCooldowns.set(game.player, HIT_COOLDOWN);
        }
      }

      // Lava speed check
      const rCol = Math.floor(r.x / GRID.CELL_SIZE);
      const rRow = Math.floor(r.y / GRID.CELL_SIZE);
      let onLava = false;
      for (const obj of game.backgroundObjects) {
        if (obj.char !== '~' || !obj.damaging || !obj.damage) continue;
        if (Math.floor(obj.position.x / GRID.CELL_SIZE) === rCol &&
            Math.floor(obj.position.y / GRID.CELL_SIZE) === rRow) {
          onLava = true;
          break;
        }
      }

      const baseSpeed = onLava ? BOULDER_SPEED_LAVA : BOULDER_SPEED;
      const speed = r.empowered ? baseSpeed * 2 : baseSpeed;
      const prevX = r.x;
      const prevY = r.y;
      r.x += r.vx * speed * deltaTime;
      r.y += r.vy * speed * deltaTime;

      // Deflector triangles bend the boulder via the same shape used for
      // bullets and the player. Hypotenuse → 90°; legs → U-turn. Empowered
      // and normal boulders behave the same way.
      const onDeflector = this.findDeflectorAt(r.x, r.y);
      if (onDeflector) {
        if (r.lastDeflector !== onDeflector) {
          r.lastDeflector = onDeflector;
          const out = this._deflect(onDeflector.data.deflectorElbow, r.vx, r.vy);
          if (out) {
            // Snap to triangle centroid (= cell center) so the turn is grid-true.
            r.x = onDeflector.position.x + GRID.CELL_SIZE / 2;
            r.y = onDeflector.position.y + GRID.CELL_SIZE / 2;
            r.vx = out.vx;
            r.vy = out.vy;
          }
        }
      } else {
        r.lastDeflector = null;
      }

      r.animTimer += deltaTime;
      if (r.animTimer >= ROLL_ANIM_INTERVAL) {
        r.animTimer = 0;
        r.animFrame = (r.animFrame + 1) % ROCK_CHARS.length;
      }

      // Decay hit cooldowns
      for (const [entity, remaining] of r.hitCooldowns) {
        const next = remaining - deltaTime;
        if (next <= 0) r.hitCooldowns.delete(entity);
        else r.hitCooldowns.set(entity, next);
      }

      // Damage player
      if (!inHut && !inMaze && !r.hitCooldowns.has(game.player)) {
        const dx = (game.player.position.x + GRID.CELL_SIZE / 2) - r.x;
        const dy = (game.player.position.y + GRID.CELL_SIZE / 2) - r.y;
        if (dx * dx + dy * dy < HIT_RADIUS * HIT_RADIUS) {
          const dmg = r.empowered ? BOULDER_DAMAGE * 2 : BOULDER_DAMAGE;
          const damageResult = game.player.takeDamage(dmg, { type: 'boulder' });
          if (damageResult === true || (damageResult && damageResult.damaged)) {
            game.combatSystem.createDamageNumber(dmg, game.player.position.x, game.player.position.y, '#ff4400');
          }
          r.hitCooldowns.set(game.player, HIT_COOLDOWN);
          // Knock player in the rock's travel direction (harder when empowered)
          game.physicsSystem.applyKnockbackDir(game.player, r.vx, r.vy, r.empowered ? 400 : 250);
        }
      }

      // Damage enemies
      for (const enemy of game.currentRoom.enemies) {
        if (r.hitCooldowns.has(enemy)) continue;
        if (enemy.isBossEntity) continue;   // boss immune to own summoned boulders
        const dx = (enemy.position.x + GRID.CELL_SIZE / 2) - r.x;
        const dy = (enemy.position.y + GRID.CELL_SIZE / 2) - r.y;
        if (dx * dx + dy * dy < HIT_RADIUS * HIT_RADIUS) {
          const enemyDmg = r.empowered ? BOULDER_DAMAGE * 2 : BOULDER_DAMAGE;
          enemy.takeDamage(enemyDmg, null);
          game.combatSystem.createDamageNumber(enemyDmg, enemy.position.x, enemy.position.y, '#ff4400');
          r.hitCooldowns.set(enemy, HIT_COOLDOWN);
        }
      }

      // Boulders fly past the room border (despawn). Interior solid walls —
      // anything else marked in the collisionMap — reflect them back as flat
      // surfaces.
      const cellCol = Math.floor(r.x / GRID.CELL_SIZE);
      const cellRow = Math.floor(r.y / GRID.CELL_SIZE);
      const oob = cellCol < 0 || cellCol >= GRID.COLS ||
                  cellRow < 0 || cellRow >= GRID.ROWS;
      if (oob) {
        this.rocks.splice(i, 1);
        continue;
      }
      const onBorder = cellCol === 0 || cellCol === GRID.COLS - 1 ||
                       cellRow === 0 || cellRow === GRID.ROWS - 1;
      const intoWall = !onBorder && !!game.currentRoom?.collisionMap?.[cellRow]?.[cellCol];
      if (intoWall) {
        r.x = prevX;
        r.y = prevY;
        r.vx *= -1;
        r.vy *= -1;
        r.lastDeflector = null;
      }
    }
  }

  getRenderData() {
    return { rocks: this.rocks, warnings: this.warnings };
  }

  // Find a deflector whose 1.5× triangle contains the given pixel point.
  // Shared by projectile / boulder / thrown-weapon systems so they all hit
  // the same visible shape.
  findDeflectorAt(pixelX, pixelY) {
    const game = this.game;
    if (!game.backgroundObjects) return null;
    for (const obj of game.backgroundObjects) {
      if (!obj.data?.boulderDeflector || obj.destroyed) continue;
      if (pointInDeflector(obj, pixelX, pixelY)) return obj;
    }
    return null;
  }

  // Public helper: deflect an arbitrary velocity vector off a deflector. The
  // direction is quantized to the dominant cardinal axis (matching the boulder
  // model the player has already internalized), then redirected via _deflect.
  // Original speed magnitude is preserved. Returns { vx, vy } or null if there
  // is no defined response for that input.
  deflectVelocity(elbow, vx, vy) {
    const speed = Math.hypot(vx, vy);
    if (speed === 0) return null;
    const cardX = Math.abs(vx) >= Math.abs(vy) ? Math.sign(vx) : 0;
    const cardY = cardX === 0 ? Math.sign(vy) : 0;
    const out = this._deflect(elbow, cardX, cardY);
    if (!out) return null;
    return { vx: out.vx * speed, vy: out.vy * speed };
  }

  // Right-triangle deflection in screen-space (vx,vy ∈ {0,±1}). `elbow` names
  // the open pair of sides — equivalently, the right-angle corner sits in the
  // opposite corner (NE open ↔ right angle at SW), with the two legs along the
  // solid sides and the hypotenuse forming the 45° face on the open pair.
  // Hypotenuse hits: 90° turn. Leg hits: 180° U-turn back the way it came.
  _deflect(elbow, vx, vy) {
    const MAP = {
      // Right angle at SW: legs S+W, hypotenuse NW→SE
      NE: { '0,1':  { vx: 1, vy: 0 },  '-1,0': { vx: 0, vy: -1 },
            '0,-1': { vx: 0, vy: 1 },  '1,0':  { vx: -1, vy: 0 } },
      // Right angle at SE: legs S+E, hypotenuse NE→SW
      NW: { '0,1':  { vx: -1, vy: 0 }, '1,0':  { vx: 0, vy: -1 },
            '0,-1': { vx: 0, vy: 1 },  '-1,0': { vx: 1, vy: 0 } },
      // Right angle at NW: legs N+W, hypotenuse SW→NE
      SE: { '0,-1': { vx: 1, vy: 0 },  '-1,0': { vx: 0, vy: 1 },
            '0,1':  { vx: 0, vy: -1 }, '1,0':  { vx: -1, vy: 0 } },
      // Right angle at NE: legs N+E, hypotenuse SE→NW
      SW: { '0,-1': { vx: -1, vy: 0 }, '1,0':  { vx: 0, vy: 1 },
            '0,1':  { vx: 0, vy: -1 }, '-1,0': { vx: 1, vy: 0 } },
    };
    return MAP[elbow]?.[`${vx},${vy}`] || null;
  }

  _scheduleWarning() {
    const dir = this.roomDirection;
    const innerMinPx = 2 * GRID.CELL_SIZE;
    const innerMaxPx = (GRID.COLS - 3) * GRID.CELL_SIZE;
    const lateralPx = innerMinPx + Math.random() * (innerMaxPx - innerMinPx);
    this.warnings.push({ timer: WARNING_TIME, direction: dir, lateralPx });
  }

  _queueRocks(warning) {
    const innerMinPx = 2 * GRID.CELL_SIZE;
    const innerMaxPx = (GRID.COLS - 3) * GRID.CELL_SIZE;
    const spreadPx = 2 * GRID.CELL_SIZE; // ±2 cells in pixels
    for (let i = 0; i < 3; i++) {
      const offset = (Math.random() * 2 - 1) * spreadPx;
      const lateralPx = Math.max(innerMinPx, Math.min(innerMaxPx, warning.lateralPx + offset));
      this.pending.push({ delay: i * ROCK_STAGGER, lateralPx, direction: warning.direction });
    }
  }

  _spawnRock(pending) {
    const { lateralPx, direction } = pending;
    let x, y;
    if (direction === 'north') {
      x = lateralPx;
      y = GRID.CELL_SIZE + GRID.CELL_SIZE / 2;
    } else if (direction === 'south') {
      x = lateralPx;
      y = (GRID.ROWS - 2) * GRID.CELL_SIZE + GRID.CELL_SIZE / 2;
    } else if (direction === 'west') {
      x = GRID.CELL_SIZE + GRID.CELL_SIZE / 2;
      y = lateralPx;
    } else {
      x = (GRID.COLS - 2) * GRID.CELL_SIZE + GRID.CELL_SIZE / 2;
      y = lateralPx;
    }
    const vec = DIR_VEC[direction];
    this.rocks.push({ x, y, direction, vx: vec.dx, vy: vec.dy, empowered: false, lastDeflector: null, animFrame: 0, animTimer: 0, hitCooldowns: new Map() });

  }

  /**
   * Immediately schedule `count` boulder warnings from distinct random directions.
   * Used by BossSystem to create boss-summoned boulder rains.
   */
  triggerBoulderRain(count) {
    const dirs = ['north', 'south', 'east', 'west'].sort(() => Math.random() - 0.5);
    for (let i = 0; i < count && i < dirs.length; i++) {
      const innerMinPx = 2 * GRID.CELL_SIZE;
      const innerMaxPx = (GRID.COLS - 3) * GRID.CELL_SIZE;
      const lateralPx  = innerMinPx + Math.random() * (innerMaxPx - innerMinPx);
      this.warnings.push({ timer: WARNING_TIME, direction: dirs[i], lateralPx });
    }
  }

  _reset() {
    this.rocks = [];
    this.pending = [];
    this.warnings = [];
    this.spawnCheckTimer = 0;
    this._lastRoom = null;
    this.roomDirection = null;
  }
}
