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
// A narrow channel between two parallel walls can trap a chain in an
// infinite reversal loop: reversing flips both facing and turnBias, and
// those two flips cancel out (CW from the new facing lands on the exact
// same perpendicular cell CCW did from the old facing), so the bias toggle
// alone can never break out. A turn forced on a fixed cadence, independent
// of obstacle detection, guarantees an exit within one interval.
const CENTIPEDE_FORCED_TURN_INTERVAL = 20;

function rotate90CW(dir) {
  return { dx: -dir.dy, dy: dir.dx };
}

function rotate90CCW(dir) {
  return { dx: dir.dy, dy: -dir.dx };
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
      turnBias: 1,
      cellMoveCount: 0,
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
  // reimplementation — but only for a genuine hypotenuse hit (a real 90°
  // bounce). A deflector's two flat legs are pre-filtered out by
  // _cellIsOpen below, so the head never steps onto a leg-hit deflector cell
  // in the first place; it routes around it via the same obstacle-turn
  // branch a Rock or Tree would trigger. (BoulderSystem still gives a leg
  // hit a straight U-turn for boulders/bullets — fine for a single point,
  // but for a 13-part chain a U-turn walks the head straight back into its
  // own trailing body and reads as getting stuck in place.)
  // Obstacle/border handling is unified — border walls hit the same
  // _cellIsOpen check as any other blocking object, per spec ("movement
  // logic is the same with border walls"). Also treats every other chain's
  // units as blocking obstacles — without this, two chains' heads (created
  // by a mid-fight split) had no way to notice each other and would walk
  // straight through one another, which in a dense/looping arena read as the
  // pair getting stuck cycling the same handful of cells forever.
  //
  // The obstacle-turn itself alternates handedness (right-turn vs. left-turn)
  // every time it fires, via chain.turnBias — always turning the same way
  // around a static obstacle field can settle into a small closed loop (e.g.
  // bouncing around the same four deflectors forever); flipping the bias
  // each time breaks that periodicity and guarantees the chain keeps
  // covering new ground.
  _resolveNextDirection(chain, cell, room) {
    // arrivedFacing is the direction that actually carried the head into
    // this cell (last resolution's final facing) — the true incoming
    // direction, used for deflector mirroring and as the fallback when a
    // scheduled forced turn can't fire.
    const arrivedFacing = chain.facing;
    const forcedTurn = chain.pendingTurn;
    chain.pendingTurn = null;

    let facing = arrivedFacing;
    const obj = this._objectAt(room, cell.x, cell.y);
    let deflected = false;
    if (obj?.data?.boulderDeflector) {
      const out = this.game.boulderSystem.deflectVelocity(obj.data.deflectorElbow, arrivedFacing.dx, arrivedFacing.dy);
      if (out) {
        facing = { dx: Math.sign(out.vx), dy: Math.sign(out.vy) };
        deflected = true;
      }
    }

    // The scheduled "turn again" from a previous obstacle-turn maneuver
    // fires here, but only if it's actually possible — an impossible forced
    // turn is ignored (continue straight in arrivedFacing) rather than
    // cascading into a fresh obstacle-turn attempt. Without this, a blocked
    // forced turn triggered a second full turn-or-reverse resolution (with
    // its own bias flip) on top of the first, which in a dense obstacle
    // cluster produced rapid direction thrashing that never reached a new
    // row — the maneuver kept re-resolving itself before the head ever
    // committed to the second leg of the original turn.
    if (!deflected && forcedTurn
      && this._cellIsOpen(room, cell.x + forcedTurn.dx, cell.y + forcedTurn.dy, chain, forcedTurn)) {
      facing = forcedTurn;
    }

    if (!this._cellIsOpen(room, cell.x + facing.dx, cell.y + facing.dy, chain, facing)) {
      const turnFn = chain.turnBias > 0 ? rotate90CW : rotate90CCW;
      const turned = turnFn(facing);
      if (this._cellIsOpen(room, cell.x + turned.dx, cell.y + turned.dy, chain, turned)) {
        facing = turned;
        chain.pendingTurn = turnFn(turned);
      } else {
        facing = reverseDir(facing);
      }
      chain.turnBias *= -1;
    }

    // Fixed-cadence anti-loop turn, independent of obstacle detection — see
    // CENTIPEDE_FORCED_TURN_INTERVAL. Applied on top of whatever facing was
    // just resolved; skipped (and the interval just rearms) if the turn
    // isn't currently open.
    chain.cellMoveCount = (chain.cellMoveCount || 0) + 1;
    if (chain.cellMoveCount >= CENTIPEDE_FORCED_TURN_INTERVAL) {
      chain.cellMoveCount = 0;
      const forcedRight = rotate90CW(facing);
      if (this._cellIsOpen(room, cell.x + forcedRight.dx, cell.y + forcedRight.dy, chain, forcedRight)) {
        facing = forcedRight;
        chain.pendingTurn = null;
      }
    }

    chain.facing = facing;
    chain.targetCell = { x: cell.x + facing.dx, y: cell.y + facing.dy };
  }

  _cellIsOpen(room, cellX, cellY, chain, incomingDir) {
    const bounds = this.game.activeGridBounds();
    if (cellX < 0 || cellY < 0 || cellX >= bounds.cols || cellY >= bounds.rows) return false;
    // Room border walls carry no BackgroundObject — collisionMap is the only
    // signal for them (RoomGenerator.createCollisionMap unconditionally sets
    // row/col 0 and ROWS-1/COLS-1 true). Checked here so "movement logic is
    // the same with border walls" (spec) actually holds for the generic
    // obstacle-turn branch below, not just for placed objects.
    if (bounds.collisionMap?.[cellY]?.[cellX]) return false;
    const obj = this._objectAt(room, cellX, cellY);
    if (obj && !obj.destroyed) {
      if (obj.data?.boulderDeflector) {
        if (incomingDir && this._isDeflectorLegHit(obj.data.deflectorElbow, incomingDir)) return false;
      } else {
        return false;
      }
    }
    if (chain && this._cellHeldByOtherChain(room, chain, cellX, cellY)) return false;
    return true;
  }

  // True when approaching a deflector along `dir` would hit one of its two
  // solid legs (flat side) rather than the open hypotenuse — BoulderSystem's
  // _deflect maps a leg hit to the exact reverse of the incoming direction.
  _isDeflectorLegHit(elbow, dir) {
    const out = this.game.boulderSystem.deflectVelocity(elbow, dir.dx, dir.dy);
    return !out || (out.vx === -dir.dx && out.vy === -dir.dy);
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
        turnBias: 1,
        cellMoveCount: 0,
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
        // Contact hitbox is half the unit's full footprint, centered — a
        // segment-length chain brushing past the player shouldn't tag them
        // on every near-miss.
        const fullW = unit.width ?? GRID.CELL_SIZE, fullH = unit.height ?? GRID.CELL_SIZE;
        const uw = fullW / 2, uh = fullH / 2;
        const ux = unit.position.x + (fullW - uw) / 2, uy = unit.position.y + (fullH - uh) / 2;
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
