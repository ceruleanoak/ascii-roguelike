import { DEATH_CAUSES } from '../data/deathCauses.js';
import { GRID, ROOM_TYPES } from '../game/GameConfig.js';
import { isInteriorActive, activeInteriorFloor } from './PlaneSystem.js';
import { isLavaTile } from './LavaContact.js';

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
const HAMMER_SPEED_MULT  = 2;    // a hammer-rolled rock rolls this much faster; damage stays BOULDER_DAMAGE
// bombBlast's reach is measured to the target's cell center plus half a cell,
// so this radius makes a rock break what it touches at HIT_RADIUS.
const BREAK_RADIUS       = HIT_RADIUS - GRID.CELL_SIZE / 2;

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

// An unbreakable rock the Onyx Hammer (`rollsRock`) knocks loose into a
// rolling rock: a scattered obsidian '0' or a Cavern Rock. Push Rocks and
// Bombable Rocks look the same but are neither, so the hammer does nothing to
// them. Structural and surface-only rock is room architecture (Storm Eye
// pillars, the U room's obsidian ceiling) and stays put.
export function isHammerRollable(obj) {
  if (obj.destroyed || obj.char !== '0' || obj.structural || obj.surfaceOnly) return false;
  return !!(obj.obsidian || obj.data?.hammerRollable);
}

export class BoulderSystem {
  constructor(game) {
    this.game = game;
    // Active single-char rocks. Each one belongs to the space it rolls in
    // (`space`: the surface Room, or a dungeon/hut floor) and only moves while
    // that space is the active one; leaving pauses it rather than losing it,
    // so a Puzzle Room roll the player walked away from is still there.
    this.rocks = [];
    this.pending = [];      // { delay, lateral } rocks waiting to spawn
    this.warnings = [];     // edge arrow indicators
    this.spawnCheckTimer = 0;
    this.roomDirection = null;
    this._lastRoom = null;
  }

  update(deltaTime) {
    const game = this.game;
    if (!game.currentRoom) {
      this._reset();
      return;
    }

    // A new Room drops every rock, its floors' included: a dungeon's floors
    // belong to the Room whose entrance leads into it.
    if (game.currentRoom !== this._lastRoom) {
      this._reset();
      this._lastRoom = game.currentRoom;
      this.roomDirection = DIRECTIONS[Math.floor(Math.random() * DIRECTIONS.length)];
    }

    const space = this._activeSpace();
    if (!space) return;   // the Maze has no rocks to roll
    if (space === game.currentRoom && this._hasRockfall(game.currentRoom)) {
      this._updateRockfall(deltaTime);
    }
    this._updateRocks(deltaTime, space);
  }

  // The red zone's rockfall hazard: edge warnings, then three rocks rolling in.
  // Settlement ('S') is excluded: the red zone's town is a safe-feeling hub
  // of neutral huts and NPCs, and a rockfall sweeping through it reads as
  // the room betraying its own premise. Underground ('U') is excluded too:
  // no rockfall rolls in from the surface edges of a room below ground.
  _hasRockfall(room) {
    return room.zone === 'red' &&
      room.type !== ROOM_TYPES.SETTLEMENT &&
      room.type !== ROOM_TYPES.UNDERGROUND;
  }

  // The space rocks roll in this tick: the dungeon/hut floor the player is
  // on, the surface Room, or null in the Maze.
  _activeSpace() {
    const game = this.game;
    const floor = activeInteriorFloor(game);
    if (floor) return floor;
    return isInteriorActive(game) ? null : game.currentRoom;
  }

  _updateRockfall(deltaTime) {
    const game = this.game;
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

  }

  _updateRocks(deltaTime, space) {
    const game = this.game;
    const { cols, rows, collisionMap } = game.activeGridBounds();
    // The surface border is open sky: rocks roll off it and are gone. A floor's
    // border is its wall, so there the border bounces like any other wall.
    const onSurface = space === game.currentRoom;

    for (let i = this.rocks.length - 1; i >= 0; i--) {
      const r = this.rocks[i];
      if (r.space !== space) continue;

      // Hammer strike ("the right tool") redirects the boulder away from the
      // player and empowers it: ×2 speed, same damage — the same rock the Onyx
      // Hammer knocks loose from rest (rollFromRest). The faster boulder turns
      // the zone's hazard into the player's weapon, routed through deflector
      // rocks into enemies or anything a bomb breaks. Other blunt weapons
      // (flail, staff, bat) knock the boulder back the same way but never
      // empower it — that stays hammer-exclusive.
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
          const away = this._awayFromPlayer(r.x, r.y);
          r.vx = away.vx;
          r.vy = away.vy;
          if (attack.canSmash) r.empowered = true;
          // Grace the striker so the boulder they just hit doesn't instantly recoil into them.
          r.hitCooldowns.set(game.player, HIT_COOLDOWN);
        }
      }

      // Lava speed check
      const rCol = Math.floor(r.x / GRID.CELL_SIZE);
      const rRow = Math.floor(r.y / GRID.CELL_SIZE);
      let onLava = false;
      for (const obj of game._activeBackgroundObjects()) {
        if (!isLavaTile(obj)) continue;
        if (Math.floor(obj.position.x / GRID.CELL_SIZE) === rCol &&
            Math.floor(obj.position.y / GRID.CELL_SIZE) === rRow) {
          onLava = true;
          break;
        }
      }

      const baseSpeed = onLava ? BOULDER_SPEED_LAVA : BOULDER_SPEED;
      const speed = r.empowered ? baseSpeed * HAMMER_SPEED_MULT : baseSpeed;
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

      // Damage player — the rock only moves while its space is the player's.
      if (!r.hitCooldowns.has(game.player)) {
        const dx = (game.player.position.x + GRID.CELL_SIZE / 2) - r.x;
        const dy = (game.player.position.y + GRID.CELL_SIZE / 2) - r.y;
        if (dx * dx + dy * dy < HIT_RADIUS * HIT_RADIUS) {
          const dmg = BOULDER_DAMAGE;
          const damageResult = game.player.takeDamage(dmg, { type: 'boulder', cause: DEATH_CAUSES.boulder });
          if (damageResult === true || (damageResult && damageResult.damaged)) {
            game.combatSystem.createDamageNumber(dmg, game.player.position.x, game.player.position.y, '#ff4400');
          }
          r.hitCooldowns.set(game.player, HIT_COOLDOWN);
          // Knock player in the rock's travel direction (harder when empowered)
          game.physicsSystem.applyKnockbackDir(game.player, r.vx, r.vy, r.empowered ? 400 : 250);
        }
      }

      // Damage enemies
      for (const enemy of game._activeEnemies()) {
        if (r.hitCooldowns.has(enemy)) continue;
        if (enemy.isBossEntity) continue;   // boss immune to own summoned boulders
        const dx = (enemy.position.x + GRID.CELL_SIZE / 2) - r.x;
        const dy = (enemy.position.y + GRID.CELL_SIZE / 2) - r.y;
        if (dx * dx + dy * dy < HIT_RADIUS * HIT_RADIUS) {
          const enemyDmg = BOULDER_DAMAGE;
          enemy.takeDamage(enemyDmg, null);
          game.combatSystem.createDamageNumber(enemyDmg, enemy.position.x, enemy.position.y, '#ff4400');
          r.hitCooldowns.set(enemy, HIT_COOLDOWN);
        }
      }

      // A rolling rock breaks anything a bomb breaks (Bombable Rocks and
      // Walls, a bombable Vault wall) and strikes a Puzzle Room switch; either
      // way the rock is spent on what it hit.
      if (this._strikeFixtures(r)) {
        this.rocks.splice(i, 1);
        continue;
      }

      // Boulders fly past the surface room's border (despawn). Interior solid
      // walls — anything else marked in the collisionMap — reflect them back
      // as flat surfaces.
      const cellCol = Math.floor(r.x / GRID.CELL_SIZE);
      const cellRow = Math.floor(r.y / GRID.CELL_SIZE);
      const oob = cellCol < 0 || cellCol >= cols ||
                  cellRow < 0 || cellRow >= rows;
      if (oob) {
        this.rocks.splice(i, 1);
        continue;
      }
      const onBorder = cellCol === 0 || cellCol === cols - 1 ||
                       cellRow === 0 || cellRow === rows - 1;
      const intoWall = !(onSurface && onBorder) && !!collisionMap?.[cellRow]?.[cellCol];
      if (intoWall) {
        // Red zone Vault: a boulder into the wall breaks it instead of
        // deflecting — the boulder is spent on the break.
        if (onSurface && game.interactionSystem?.tryBreakVaultWall(r.x, r.y, GRID.CELL_SIZE / 2)) {
          this.rocks.splice(i, 1);
          continue;
        }
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

  // Rocks rolling in the space the player is in — what a renderer draws.
  activeRocks() {
    const space = this._activeSpace();
    return space ? this.rocks.filter(r => r.space === space) : [];
  }

  /**
   * Onyx Hammer (`attack.rollsRock`) on an unbreakable rock at rest: the rock
   * leaves its cell as a hammer-rolled rock (×2 speed, same damage — the same
   * result as any hammer on a rock already rolling), heading along the
   * cardinal axis away from the player. Returns true when the swing rolled it,
   * so the melee loop treats the hit as spent. Hitting a Push Rock or a
   * Bombable Rock returns false: they only look like unbreakable rock.
   */
  rollFromRest(attack, obj) {
    if (!attack.rollsRock || !isHammerRollable(obj)) return false;
    const space = this._activeSpace();
    if (!space) return false;
    const game = this.game;
    const x = obj.position.x + GRID.CELL_SIZE / 2;
    const y = obj.position.y + GRID.CELL_SIZE / 2;
    const away = this._awayFromPlayer(x, y);
    const rock = this._makeRock(x, y, null, away.vx, away.vy, space);
    rock.empowered = true;
    // Grace the striker, and mark this swing as having moved the rock so the
    // redirect pass doesn't strike it a second time while the swing lingers.
    rock.hitCooldowns.set(game.player, HIT_COOLDOWN);
    if (!attack._deflectedRocks) attack._deflectedRocks = new Set();
    attack._deflectedRocks.add(rock);
    this.rocks.push(rock);

    obj.destroyed = true;
    game.renderer?.markBackgroundDirty?.();
    return true;
  }

  // Cardinal unit heading pointing away from the player, by the larger of
  // |dx|/|dy| (a tie goes horizontal). Shared by both hammer strikes so a
  // rolled rock always reads as "I knocked it that way", grid-true for
  // deterministic deflector bounces.
  _awayFromPlayer(x, y) {
    const p = this.game.player.position;
    const rdx = x - (p.x + GRID.CELL_SIZE / 2);
    const rdy = y - (p.y + GRID.CELL_SIZE / 2);
    if (Math.abs(rdx) >= Math.abs(rdy)) return { vx: Math.sign(rdx) || 1, vy: 0 };
    return { vx: 0, vy: Math.sign(rdy) || 1 };
  }

  // What a rolling rock breaks or sets off by touching it. Returns true when
  // it hit something, which spends the rock.
  _strikeFixtures(r) {
    const game = this.game;
    if (game.cavernSystem?.bombBlast(r.x, r.y, BREAK_RADIUS)) return true;
    for (const obj of game._activeBackgroundObjects()) {
      if (!obj.puzzleSignal || obj.destroyed) continue;
      const dx = (obj.position.x + GRID.CELL_SIZE / 2) - r.x;
      const dy = (obj.position.y + GRID.CELL_SIZE / 2) - r.y;
      if (dx * dx + dy * dy >= HIT_RADIUS * HIT_RADIUS) continue;
      obj.takeDamage(1);   // a puzzleSignal object pulses glitterHit, never breaks
      return true;
    }
    return false;
  }

  _makeRock(x, y, direction, vx, vy, space) {
    return { x, y, direction, vx, vy, space, empowered: false, lastDeflector: null, animFrame: 0, animTimer: 0, hitCooldowns: new Map() };
  }

  // Find a deflector whose 1.5× triangle contains the given pixel point.
  // Shared by projectile / boulder / thrown-weapon systems so they all hit
  // the same visible shape.
  findDeflectorAt(pixelX, pixelY) {
    const game = this.game;
    if (!game._activeBackgroundObjects()?.length) return null;
    for (const obj of game._activeBackgroundObjects()) {
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

  // Redirect a projectile off a deflector triangle by cell occupancy, through
  // the same elbow table rolling rocks use. Called from CombatSystem's player
  // and enemy projectile loops. Returns true if redirected. Tracks
  // `_lastDeflectorObj` so the projectile doesn't re-deflect on the same tile
  // every frame.
  redirectProjectile(proj) {
    // proj.position is the cell top-left; the deflector test wants the bullet's
    // visual center so the triangle interior test lines up with the rendered glyph.
    const cs = GRID.CELL_SIZE;
    const deflector = this.findDeflectorAt(proj.position.x + cs / 2, proj.position.y + cs / 2);
    if (!deflector) {
      if (proj._lastDeflectorObj) proj._lastDeflectorObj = null;
      return false;
    }
    if (proj._lastDeflectorObj === deflector) return false;
    const out = this.deflectVelocity(deflector.data.deflectorElbow, proj.velocity.vx, proj.velocity.vy);
    if (!out) return false;
    // Update velocity in place — no snap. The bullet continues from its actual
    // hit point inside the triangle and exits naturally on the next frames.
    proj.velocity.vx = out.vx;
    proj.velocity.vy = out.vy;
    if (proj.drawAngle != null) proj.drawAngle = Math.atan2(out.vy, out.vx);
    proj._lastDeflectorObj = deflector;
    proj.reflected = true;
    this.game.audioSystem?.playSFX?.('ricochet', 0.5);
    return true;
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
    this.rocks.push(this._makeRock(x, y, direction, vec.dx, vec.dy, this.game.currentRoom));
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
