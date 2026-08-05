import { GRID, PHYSICS } from '../game/GameConfig.js';
import { CentipedeUnit } from '../entities/CentipedeUnit.js';
import { BackgroundObject } from '../entities/BackgroundObject.js';

// Tuning placeholders pending playtesting — isolated as named constants for
// easy adjustment.
const CENTIPEDE_BODY_COUNT = 12;
const CENTIPEDE_BASE_SPEED = 180;        // px/s, top speed at 0 attached segments (doubled per playtest feedback)
const CENTIPEDE_SPEED_PER_SEGMENT = 10;  // px/s reduction per attached body part (doubled in lockstep)
const CENTIPEDE_MIN_SPEED = 80;          // px/s floor at 12 segments (doubled in lockstep)
const CENTIPEDE_CONTACT_DAMAGE = 3;
const CENTIPEDE_CONTACT_COOLDOWN = 0.5; // seconds between contact-damage ticks
// "10 frames" per spec means 10 real display frames. Enemy.update() (and thus
// CentipedeUnit's invulnerabilityTimer decrement) runs on a deltaTime already
// scaled by PHYSICS.ENEMY_TIMER_RATE (bug #92's canonical single-tick fix), so
// the stored timer must be pre-scaled by the same factor to actually cover 10
// real frames' worth of decrement.
const CENTIPEDE_SPLIT_IFRAMES = (10 / 60) * PHYSICS.ENEMY_TIMER_RATE;

function rotate90CW(dir) {
  return { dx: -dir.dy, dy: dir.dx };
}

function reverseDir(dir) {
  return { dx: -dir.dx, dy: -dir.dy };
}

// Coordinates a Centipede miniboss encounter: one or more independently-headed
// "chains" of CentipedeUnit entities crawling the arena on strict grid
// movement. Chain position/facing/hp-conversion is owned entirely here —
// CentipedeUnit itself is inert data plus the takeDamage override that routes
// back into handleUnitHit(). State lives on room.centipedeChains, scoped to
// the boss room's own lifecycle exactly like room.enemies.
export class CentipedeSystem {
  constructor(game) {
    this.game = game;
    this._nextChainId = 1;
  }

  // ── Spawn ──────────────────────────────────────────────────────────────
  spawn(room, spawnCell, facing = { dx: 1, dy: 0 }) {
    const cell = GRID.CELL_SIZE;
    const depth = this.game.getCurrentZoneDepth();
    const units = [];

    for (let i = 0; i <= CENTIPEDE_BODY_COUNT; i++) {
      const isHead = i === 0;
      const cx = (spawnCell.x - facing.dx * i) * cell;
      const cy = (spawnCell.y - facing.dy * i) * cell;
      const unit = new CentipedeUnit(cx, cy, depth, {
        isHead,
        chainId: 0,
        contactDamage: CENTIPEDE_CONTACT_DAMAGE,
        game: this.game,
      });
      unit.facing = { ...facing };
      units.push(unit);
      this.game.roomGenerator.addEnemyToRoom(room, unit);
    }
    this.game.wireRoomEnemies(room);

    const trail = units.slice(1).map(u => ({ x: u.position.x, y: u.position.y }));
    const chain = {
      id: 0,
      units,
      trail,
      facing: { ...facing },
      pendingTurn: null,
      currentCell: { ...spawnCell },
      targetCell: null,
      hitCooldowns: new Map(),
    };
    // Set before resolving direction so the cross-chain occupancy check in
    // _resolveNextDirection (which reads room.centipedeChains) has something
    // to read even on the very first call.
    room.centipedeChains = [chain];
    this._nextChainId = 1;
    this._resolveNextDirection(chain, spawnCell, room);
  }

  // ── Frame update ───────────────────────────────────────────────────────
  update(deltaTime) {
    const room = this.game.activeRoom;
    if (!room?.centipedeChains?.length) return;

    for (const chain of room.centipedeChains) {
      this._updateChain(chain, room, deltaTime);
    }
    this._updateContactDamage(room, deltaTime);
  }

  _updateChain(chain, room, deltaTime) {
    const cell = GRID.CELL_SIZE;
    const speed = this._chainSpeed(chain);
    const head = chain.units[0];
    const dist = speed * deltaTime;

    if (chain.facing.dx !== 0) {
      head.position.x += chain.facing.dx * dist;
    } else if (chain.facing.dy !== 0) {
      head.position.y += chain.facing.dy * dist;
    }

    const tx = chain.targetCell.x * cell;
    const ty = chain.targetCell.y * cell;
    const remaining = chain.facing.dx !== 0
      ? (tx - head.position.x) * chain.facing.dx
      : (ty - head.position.y) * chain.facing.dy;
    if (remaining <= 0) this._advanceChain(chain, room);

    for (let i = 1; i < chain.units.length; i++) {
      const target = chain.trail[i - 1];
      if (target) this._glideBodyUnit(chain.units[i], target, speed, deltaTime);
    }
  }

  _advanceChain(chain, room) {
    const cell = GRID.CELL_SIZE;
    const leftCell = chain.currentCell;
    const head = chain.units[0];
    head.position.x = chain.targetCell.x * cell;
    head.position.y = chain.targetCell.y * cell;
    chain.currentCell = { x: chain.targetCell.x, y: chain.targetCell.y };

    chain.trail.unshift({ x: leftCell.x * cell, y: leftCell.y * cell });
    const maxTrail = chain.units.length - 1;
    if (chain.trail.length > maxTrail) chain.trail.length = maxTrail;

    this._resolveNextDirection(chain, chain.currentCell, room);
  }

  _glideBodyUnit(unit, targetPixel, speed, deltaTime) {
    const dx = targetPixel.x - unit.position.x;
    const dy = targetPixel.y - unit.position.y;
    const dist = Math.hypot(dx, dy);
    if (dist === 0) return;
    const step = speed * deltaTime;
    if (step >= dist) {
      unit.position.x = targetPixel.x;
      unit.position.y = targetPixel.y;
    } else {
      unit.position.x += (dx / dist) * step;
      unit.position.y += (dy / dist) * step;
    }
  }

  _chainSpeed(chain) {
    const bodyCount = chain.units.length - 1;
    return Math.max(CENTIPEDE_MIN_SPEED, CENTIPEDE_BASE_SPEED - bodyCount * CENTIPEDE_SPEED_PER_SEGMENT);
  }

  // ── Direction resolution (deflectors, obstacles, borders) ────────────────
  // Called whenever a head arrives at a new cell (or, for a freshly-promoted
  // head, at the moment of promotion). Deflector redirect reuses the real
  // reflector logic (BoulderSystem.deflectVelocity) rather than a
  // reimplementation. Obstacle/border handling is unified — border walls hit
  // the same _cellIsOpen check as any other blocking object, per spec
  // ("movement logic is the same with border walls"). Also treats every
  // other chain's units as blocking obstacles — without this, two chains'
  // heads (created by a mid-fight split) had no way to notice each other and
  // would walk straight through one another, which in a dense/looping arena
  // read as the pair getting stuck cycling the same handful of cells forever.
  _resolveNextDirection(chain, cell, room) {
    let facing = chain.pendingTurn || chain.facing;
    chain.pendingTurn = null;

    const obj = this._objectAt(room, cell.x, cell.y);
    if (obj?.data?.boulderDeflector) {
      const out = this.game.boulderSystem.deflectVelocity(obj.data.deflectorElbow, facing.dx, facing.dy);
      if (out) facing = { dx: Math.sign(out.vx), dy: Math.sign(out.vy) };
    }

    if (!this._cellIsOpen(room, cell.x + facing.dx, cell.y + facing.dy, chain)) {
      const right = rotate90CW(facing);
      if (this._cellIsOpen(room, cell.x + right.dx, cell.y + right.dy, chain)) {
        facing = right;
        chain.pendingTurn = rotate90CW(right);
      } else {
        facing = reverseDir(facing);
      }
    }

    chain.facing = facing;
    chain.targetCell = { x: cell.x + facing.dx, y: cell.y + facing.dy };
  }

  _cellIsOpen(room, cellX, cellY, chain) {
    const bounds = this.game.activeGridBounds();
    if (cellX < 0 || cellY < 0 || cellX >= bounds.cols || cellY >= bounds.rows) return false;
    // Room border walls carry no BackgroundObject — collisionMap is the only
    // signal for them (RoomGenerator.createCollisionMap unconditionally sets
    // row/col 0 and ROWS-1/COLS-1 true). Checked here so "movement logic is
    // the same with border walls" (spec) actually holds for the generic
    // obstacle-turn branch below, not just for placed objects.
    if (bounds.collisionMap?.[cellY]?.[cellX]) return false;
    const obj = this._objectAt(room, cellX, cellY);
    if (obj && !obj.destroyed && !obj.data?.boulderDeflector) return false;
    if (chain && this._cellHeldByOtherChain(room, chain, cellX, cellY)) return false;
    return true;
  }

  // Is (cellX,cellY) currently occupied by a unit belonging to some chain
  // other than `chain`? Own-chain units are never checked — the body always
  // follows the head's exact trail, so a chain can't collide with itself.
  _cellHeldByOtherChain(room, chain, cellX, cellY) {
    for (const other of room.centipedeChains) {
      if (other === chain) continue;
      for (const unit of other.units) {
        const c = this._cellOf(unit.position);
        if (c.x === cellX && c.y === cellY) return true;
      }
    }
    return false;
  }

  _objectAt(room, cellX, cellY) {
    const cell = GRID.CELL_SIZE;
    const px = cellX * cell;
    const py = cellY * cell;
    for (const obj of room.backgroundObjects) {
      if (obj.destroyed) continue;
      if (obj.position.x === px && obj.position.y === py) return obj;
    }
    return null;
  }

  _cellOf(position) {
    const cell = GRID.CELL_SIZE;
    return { x: Math.round(position.x / cell), y: Math.round(position.y / cell) };
  }

  // ── Hit / split ────────────────────────────────────────────────────────
  // Called from CentipedeUnit.takeDamage(). The struck unit converts to a
  // Fractured Rock and every other live unit (across every chain, not just
  // the hit chain) gets a brief invulnerability window. The hit chain splits
  // in two around the struck unit: the surviving front half keeps its head
  // and facing untouched, while the back half's first unit promotes to a new
  // head and reverses direction — including the bare-head terminal case,
  // which simply yields no new chain and can end the fight.
  handleUnitHit(unit, attackId) {
    const room = this.game.activeRoom;
    if (!room?.centipedeChains) return false;
    const chainIndex = room.centipedeChains.findIndex(c => c.units.includes(unit));
    if (chainIndex === -1) return false;
    const chain = room.centipedeChains[chainIndex];
    const index = chain.units.indexOf(unit);

    this._broadcastInvulnerability(room, unit);
    this._convertToRock(unit, room);
    this._removeUnitFromRoom(room, unit);

    const left = chain.units.slice(0, index);
    const right = chain.units.slice(index + 1);
    const survivors = [];

    if (left.length > 0) {
      chain.units = left;
      chain.trail.length = Math.max(0, left.length - 1);
      survivors.push(chain);
    }

    if (right.length > 0) {
      const newHead = right[0];
      newHead.isHead = true;
      newHead.displayChar = '4';
      newHead.char = '4';

      const newChain = {
        id: this._nextChainId++,
        units: right,
        trail: right.slice(1).map(u => ({ x: u.position.x, y: u.position.y })),
        facing: reverseDir(chain.facing),
        pendingTurn: null,
        currentCell: this._cellOf(newHead.position),
        targetCell: null,
        hitCooldowns: new Map(),
      };
      this._resolveNextDirection(newChain, newChain.currentCell, room);
      survivors.push(newChain);
    }

    room.centipedeChains = room.centipedeChains.filter((c, i) => i !== chainIndex).concat(survivors);

    if (room.centipedeChains.length === 0) {
      this._onCentipedeDefeated(room, { x: unit.position.x, y: unit.position.y });
    }

    return true;
  }

  _broadcastInvulnerability(room, hitUnit) {
    for (const chain of room.centipedeChains) {
      for (const u of chain.units) {
        if (u !== hitUnit) u.invulnerabilityTimer = CENTIPEDE_SPLIT_IFRAMES;
      }
    }
  }

  _convertToRock(unit, room) {
    const cell = GRID.CELL_SIZE;
    const cx = Math.round(unit.position.x / cell) * cell;
    const cy = Math.round(unit.position.y / cell) * cell;
    const rock = new BackgroundObject('9', cx, cy);
    room.backgroundObjects.push(rock);
  }

  _removeUnitFromRoom(room, unit) {
    room.enemies = room.enemies.filter(e => e !== unit);
    if (room.enemiesPlane0) room.enemiesPlane0 = room.enemiesPlane0.filter(e => e !== unit);
    if (room.enemiesPlane1) room.enemiesPlane1 = room.enemiesPlane1.filter(e => e !== unit);
  }

  // ── Defeat ─────────────────────────────────────────────────────────────
  _onCentipedeDefeated(room, position) {
    room.centipedeDefeated = true;
    const stand = {
      position,
      data: { isBoss: true, affinities: ['beast'], tier: 'boss' },
    };
    this.game.lootSystem.spawnLoot(stand);
  }

  // ── Contact damage ─────────────────────────────────────────────────────
  // Head and body both deal contact damage on touch — mirrors BoulderSystem's
  // per-source hitCooldowns Map pattern to prevent multi-hit-per-frame spam,
  // scoped per-chain since a chain is the natural cooldown-sharing unit here.
  _updateContactDamage(room, deltaTime) {
    const player = this.game.player;
    if (!player) return;
    const px = player.position.x, py = player.position.y;
    const pw = player.width ?? GRID.CELL_SIZE, ph = player.height ?? GRID.CELL_SIZE;

    for (const chain of room.centipedeChains) {
      for (const [entity, remaining] of chain.hitCooldowns) {
        const next = remaining - deltaTime;
        if (next <= 0) chain.hitCooldowns.delete(entity);
        else chain.hitCooldowns.set(entity, next);
      }
      if (chain.hitCooldowns.has(player)) continue;

      for (const unit of chain.units) {
        const ux = unit.position.x, uy = unit.position.y;
        const uw = unit.width ?? GRID.CELL_SIZE, uh = unit.height ?? GRID.CELL_SIZE;
        const overlapX = Math.min(px + pw, ux + uw) - Math.max(px, ux);
        const overlapY = Math.min(py + ph, uy + uh) - Math.max(py, uy);
        if (overlapX > 0 && overlapY > 0) {
          this.game.combatSystem._applyBlockableEnemyDamage(player, unit, CENTIPEDE_CONTACT_DAMAGE, 'centipede-contact');
          chain.hitCooldowns.set(player, CENTIPEDE_CONTACT_COOLDOWN);
          break;
        }
      }
    }
  }
}
