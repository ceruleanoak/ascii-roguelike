import { GRID } from '../game/GameConfig.js';
import { SeaSerpentUnit } from '../entities/SeaSerpentUnit.js';
import { Item } from '../entities/Item.js';

/**
 * Sea Serpents — the twin hidden boss of the Sunken Hold, and the Centipede
 * miniboss carried underwater. Each serpent is one head and a dragging tail,
 * all SeaSerpentUnits in `room.enemies` (so they draw and take hits through
 * the generic enemy paths); everything they do is owned here, with the pair's
 * state on `room.seaSerpents`.
 *
 *   - Movement is one closed set of States inside each serpent's single
 *     machine: `orbit` → `anticipate` → `strike` → `recover` → `orbit`.
 *     Orbit is aimless: the head circles a center that drifts, at an angular
 *     rate that floats (two slow sines summed), on a radius that breathes,
 *     with a sideways wobble that makes the path serpentine. Every few
 *     seconds it stops, shivers and brightens (Anticipate), then dashes in a
 *     straight line along the vector it locked onto the player (Strike), and
 *     eases back onto its orbit (Recover).
 *   - The tail follows the leader: each segment is pulled to within SPACING of
 *     the one ahead, from the head backwards, every frame — so it drags and
 *     swings behind the head rather than tracing the head's path.
 *   - The head is the weak point and carries the serpent's HP pool. The tail
 *     can't be hurt (a blow on it is turned aside), but touching any part of
 *     the serpent hurts.
 *
 * Both dead → the Moon Pearl drops, and `game.sunkenShip.serpentsSlain` keeps
 * them dead for the run. A Moon Pearl left on the floor is put back on the
 * next visit until it is picked up.
 */

const CS = GRID.CELL_SIZE;

const TAIL_LENGTH = 10;
const SPACING = CS * 0.8;               // px between consecutive segments
const HEAD_HP = 12;
const HEAD_CONTACT_DAMAGE = 3;
const TAIL_CONTACT_DAMAGE = 2;
const CONTACT_COOLDOWN = 0.6;           // s between contact hits, per serpent
const CONTACT_HITBOX_RATIO = 0.625;     // as CentipedeSystem — brushing past isn't a hit

// Orbit (all in cells / radians / seconds).
const ORBIT_RADIUS = 8;
const ORBIT_RADIUS_SWING = 2.5;         // the radius breathes ±this
const ORBIT_RADIUS_FREQ = 0.31;
const ORBIT_BASE_RATE = 0.45;           // rad/s
const ORBIT_RATE_FLOAT = [[0.22, 0.37], [0.14, 0.91]]; // [amplitude, frequency] sines
const WOBBLE = 0.9;                     // sideways wobble, cells
const WOBBLE_FREQ = 2.1;
const DRIFT = 2.5;                      // the orbit center wanders ±this
const DRIFT_FREQ = [0.13, 0.17];
const ORBIT_FOLLOW = 6;                 // how hard the head holds its orbit point
const RECOVER_FOLLOW = 1.6;             // ... and how gently it eases back on

// Strike cycle (real seconds — this system ticks on the frame's deltaTime).
const STRIKE_INTERVAL = [3, 6];         // orbit time between strikes
const STRIKE_STAGGER = 1.5;             // min gap after the other serpent strikes
const ANTICIPATE_TIME = 0.6;
const ANTICIPATE_JITTER = 2;            // px
const ANTICIPATE_COLOR = '#b8ffe6';
const STRIKE_SPEED = 13 * CS;           // px/s
const STRIKE_TIME = 0.45;
const RECOVER_TIME = 1.4;

// Head iframes after a hit, on the same (doubled) clock as Enemy's own.
const HEAD_IFRAMES = 0.3;

const MOON_PEARL_CHAR = '☾';

export class SeaSerpentSystem {
  constructor(game) {
    this.game = game;
    this._nextId = 1;
  }

  // ── Spawn ──────────────────────────────────────────────────────────────
  /**
   * The Sunken Hold's guardians: two serpents on opposite sides of the same
   * orbit. Called while the room is being generated, before
   * transitionToNeutralRoom wires and registers its enemies; if the pair is
   * already dead this run, only an untaken Moon Pearl is put back.
   */
  spawnPair(room) {
    const state = this.game.sunkenShip;
    room.seaSerpents = [];
    room.moonPearl = null;
    if (state.serpentsSlain) {
      if (!state.moonPearlTaken) this._placeMoonPearl(room, this._arenaCenter(), false);
      return;
    }
    const depth = this.game.getCurrentZoneDepth?.() ?? 0;
    for (let i = 0; i < 2; i++) {
      room.seaSerpents.push(this._spawnSerpent(room, depth, i * Math.PI, i * STRIKE_STAGGER));
    }
  }

  _spawnSerpent(room, depth, phase, strikeDelay) {
    const id = this._nextId++;
    const serpent = {
      id,
      hp: HEAD_HP,
      state: 'orbit',
      stateTimer: 0,
      nextStrike: this._rollStrikeInterval() + strikeDelay,
      t: 0,
      phase,
      theta: phase,
      head: { x: 0, y: 0 },        // continuous top-left of the head
      hold: null,                  // where Anticipate pinned the head
      strikeDir: null,
      contactCooldown: 0,
      units: [],
    };
    const start = this._orbitPoint(serpent);
    serpent.head = { ...start };

    for (let i = 0; i <= TAIL_LENGTH; i++) {
      const unit = new SeaSerpentUnit(start.x, start.y + i * SPACING, depth, {
        isHead: i === 0,
        serpentId: id,
        contactDamage: i === 0 ? HEAD_CONTACT_DAMAGE : TAIL_CONTACT_DAMAGE,
      });
      if (i === 0) { unit.hp = HEAD_HP; unit.maxHp = HEAD_HP; }
      serpent.units.push(unit);
      // A neutral room keeps a single enemy list (no per-plane arrays).
      room.enemies.push(unit);
    }
    return serpent;
  }

  // ── Frame update ───────────────────────────────────────────────────────
  update(deltaTime) {
    const room = this.game.currentRoom;
    if (!room?.seaSerpents) return;

    // Picked up: the Moon Pearl is the run's.
    if (room.moonPearl && !this.game.items.includes(room.moonPearl)) {
      this.game.sunkenShip.moonPearlTaken = true;
      room.moonPearl = null;
    }

    for (const serpent of room.seaSerpents) {
      this._updateMachine(serpent, room, deltaTime);
      this._dragTail(serpent);
    }
    this._updateContactDamage(room, deltaTime);
  }

  _updateMachine(serpent, room, dt) {
    serpent.t += dt;
    serpent.theta += this._orbitRate(serpent) * dt;
    serpent.stateTimer += dt;
    const head = serpent.units[0];

    switch (serpent.state) {
      case 'orbit': {
        this._follow(serpent, ORBIT_FOLLOW, dt);
        serpent.nextStrike -= dt;
        if (serpent.nextStrike <= 0 && !this._otherStriking(room, serpent)) {
          this._enter(serpent, 'anticipate');
          serpent.hold = { ...serpent.head };
          head.color = ANTICIPATE_COLOR;
        }
        break;
      }
      case 'anticipate': {
        const j = ANTICIPATE_JITTER;
        serpent.head.x = serpent.hold.x + (Math.random() * 2 - 1) * j;
        serpent.head.y = serpent.hold.y + (Math.random() * 2 - 1) * j;
        if (serpent.stateTimer >= ANTICIPATE_TIME) {
          serpent.head = { ...serpent.hold };
          serpent.strikeDir = this._aimAtPlayer(serpent);
          head.color = head.baseColor;
          this._enter(serpent, 'strike');
        }
        break;
      }
      case 'strike': {
        serpent.head.x += serpent.strikeDir.x * STRIKE_SPEED * dt;
        serpent.head.y += serpent.strikeDir.y * STRIKE_SPEED * dt;
        const hitWall = this._clampToArena(serpent.head);
        if (hitWall || serpent.stateTimer >= STRIKE_TIME) this._enter(serpent, 'recover');
        break;
      }
      case 'recover': {
        this._follow(serpent, RECOVER_FOLLOW, dt);
        if (serpent.stateTimer >= RECOVER_TIME) {
          serpent.nextStrike = this._rollStrikeInterval();
          this._enter(serpent, 'orbit');
        }
        break;
      }
    }

    this._clampToArena(serpent.head);
    head.position.x = serpent.head.x;
    head.position.y = serpent.head.y;
  }

  _enter(serpent, state) {
    serpent.state = state;
    serpent.stateTimer = 0;
  }

  // Ease the head toward its moving orbit point; `rate` is how quickly.
  _follow(serpent, rate, dt) {
    const target = this._orbitPoint(serpent);
    const k = Math.min(1, rate * dt);
    serpent.head.x += (target.x - serpent.head.x) * k;
    serpent.head.y += (target.y - serpent.head.y) * k;
  }

  // Where the orbit puts the head right now (top-left, px).
  _orbitPoint(serpent) {
    const { t, theta, phase } = serpent;
    const center = this._arenaCenter();
    const cx = center.x + DRIFT * CS * Math.sin(DRIFT_FREQ[0] * t + phase);
    const cy = center.y + DRIFT * CS * Math.sin(DRIFT_FREQ[1] * t + phase * 0.5);
    const radius = (ORBIT_RADIUS + ORBIT_RADIUS_SWING * Math.sin(ORBIT_RADIUS_FREQ * t + phase)
      + WOBBLE * Math.sin(WOBBLE_FREQ * t)) * CS;
    return { x: cx + radius * Math.cos(theta), y: cy + radius * Math.sin(theta) };
  }

  _orbitRate(serpent) {
    let rate = ORBIT_BASE_RATE;
    for (const [amp, freq] of ORBIT_RATE_FLOAT) rate += amp * Math.sin(freq * serpent.t + serpent.phase);
    return rate;
  }

  _otherStriking(room, serpent) {
    return room.seaSerpents.some(other => other !== serpent && (
      other.state === 'anticipate' || other.state === 'strike'
      || (other.state === 'recover' && other.stateTimer < STRIKE_STAGGER)));
  }

  _aimAtPlayer(serpent) {
    const p = this.game.player.position;
    const dx = p.x - serpent.head.x, dy = p.y - serpent.head.y;
    const len = Math.hypot(dx, dy) || 1;
    return { x: dx / len, y: dy / len };
  }

  _rollStrikeInterval() {
    const [lo, hi] = STRIKE_INTERVAL;
    return lo + Math.random() * (hi - lo);
  }

  _arenaCenter() {
    return { x: Math.floor(GRID.COLS / 2) * CS, y: Math.floor(GRID.ROWS / 2) * CS };
  }

  // Keep a point inside the room's walls; true if it had to be pulled in.
  _clampToArena(p) {
    const min = CS, maxX = (GRID.COLS - 2) * CS, maxY = (GRID.ROWS - 2) * CS;
    const x = Math.min(maxX, Math.max(min, p.x));
    const y = Math.min(maxY, Math.max(min, p.y));
    const moved = x !== p.x || y !== p.y;
    p.x = x; p.y = y;
    return moved;
  }

  // Follow-the-leader: each segment is pulled to within SPACING of the one
  // ahead of it. Slack is left alone, so a still head lets the tail settle.
  _dragTail(serpent) {
    const units = serpent.units;
    for (let i = 1; i < units.length; i++) {
      const lead = units[i - 1].position;
      const seg = units[i].position;
      const dx = seg.x - lead.x, dy = seg.y - lead.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= SPACING) continue;
      seg.x = lead.x + (dx / dist) * SPACING;
      seg.y = lead.y + (dy / dist) * SPACING;
    }
  }

  // ── Hits ───────────────────────────────────────────────────────────────
  // From SeaSerpentUnit.takeDamage. The head spends the serpent's HP; a tail
  // segment turns the blow aside.
  handleUnitHit(unit, amount, attackId, opts) {
    const room = this.game.currentRoom;
    const serpent = room?.seaSerpents?.find(s => s.id === unit.serpentId);
    if (!serpent) return false;

    if (!unit.isHead) {
      if (opts?.kind) {
        this.game.combatSystem.createDamageNumber('DEFLECT', unit.position.x, unit.position.y, '#aaaaaa');
      }
      return false;
    }

    if (unit.invulnerabilityTimer > 0 && !(attackId !== null && attackId === unit.lastHitAttackId)) return false;
    unit.lastHitAttackId = attackId;
    unit.invulnerabilityTimer = HEAD_IFRAMES;

    serpent.hp -= amount;
    if (serpent.hp > 0) {
      unit.hp = serpent.hp;
      return true;
    }
    this._killSerpent(room, serpent);
    return true;
  }

  _killSerpent(room, serpent) {
    const at = { ...serpent.head };
    const dead = new Set(serpent.units);
    room.enemies = room.enemies.filter(e => !dead.has(e));
    room.seaSerpents = room.seaSerpents.filter(s => s !== serpent);
    if (room.seaSerpents.length > 0) return;

    this.game.sunkenShip.serpentsSlain = true;
    this._placeMoonPearl(room, at, true);
  }

  // The pair's reward. `live` = dropped mid-fight into the running room
  // (otherwise the room is still being generated and is about to be wired).
  _placeMoonPearl(room, at, live) {
    const pearl = new Item(MOON_PEARL_CHAR, Math.round(at.x / CS) * CS, Math.round(at.y / CS) * CS);
    room.moonPearl = pearl;
    if (live) {
      this.game.items.push(pearl);
      this.game.physicsSystem.addEntity(pearl);
    } else {
      room.items.push(pearl);
    }
  }

  // ── Contact damage ─────────────────────────────────────────────────────
  // Any part of a serpent hurts on touch — the head more than the tail — on
  // a per-serpent cooldown, the shape of CentipedeSystem's contact pass.
  _updateContactDamage(room, dt) {
    const player = this.game.player;
    if (!player) return;
    const px = player.position.x, py = player.position.y;
    const pw = player.width ?? CS, ph = player.height ?? CS;

    for (const serpent of room.seaSerpents) {
      if (serpent.contactCooldown > 0) { serpent.contactCooldown -= dt; continue; }
      for (const unit of serpent.units) {
        const fw = unit.width ?? CS, fh = unit.height ?? CS;
        const uw = fw * CONTACT_HITBOX_RATIO, uh = fh * CONTACT_HITBOX_RATIO;
        const ux = unit.position.x + (fw - uw) / 2, uy = unit.position.y + (fh - uh) / 2;
        const overlapX = Math.min(px + pw, ux + uw) - Math.max(px, ux);
        const overlapY = Math.min(py + ph, uy + uh) - Math.max(py, uy);
        if (overlapX > 0 && overlapY > 0) {
          const damage = unit.isHead ? HEAD_CONTACT_DAMAGE : TAIL_CONTACT_DAMAGE;
          this.game.combatSystem._applyBlockableEnemyDamage(player, unit, damage, 'sea-serpent-contact');
          serpent.contactCooldown = CONTACT_COOLDOWN;
          break;
        }
      }
    }
  }
}
