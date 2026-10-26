import { GRID, PHYSICS } from '../game/GameConfig.js';
import { steerHeading } from './npcSteering.js';
import { buildTerrainGrid, cellCost, BLOCKED, HAZARD } from './steeringTerrain.js';
import { entityCenter } from '../game/Telegraph.js';

const CELL = GRID.CELL_SIZE;

// A heading component below this is treated as zero when the steering heading
// is turned into held keys, so a near-vertical heading doesn't jitter sideways.
const AXIS_DEADZONE = 0.38;

// Lack of progress: when the player has moved less than STUCK_PX in
// STUCK_TIME, it is eased onto the cell grid (the fine-tune). A one-cell gap
// between wall cells only admits a body aligned to within a pixel, which held
// keys with momentum can't land on: Steering asks for a sub-pixel recenter,
// the heading falls under AXIS_DEADZONE, and the player drifts beside the
// gap. Only a cell within FINE_TUNE_PX on both axes is eased onto, so the
// nudge never crosses into a cell the body isn't already touching.
const STUCK_TIME = 0.25;
const STUCK_PX = 1;
const FINE_TUNE_PX = CELL * 0.45;
const FRAME = 1 / 60;

// How far an axis the keys let go of still coasts: friction keeps
// PHYSICS.FRICTION of the velocity each frame, so the drift totals
// v * FRAME / (1 - FRICTION) (see _brakeDrift).
const COAST_TIME = FRAME / (1 - PHYSICS.FRICTION);

const NO_KEYS = Object.freeze({ w: false, a: false, s: false, d: false });

/**
 * Whether a keydown hands a Spell-driven player (FIGHT, CHOP/MINE/HARVEST)
 * back to the player: a letter (WASD among them, and the start of any typed
 * word), SPACE, Shift or Enter. Every other key (Tab, the arrow keys' dodge
 * roll, the digit slot keys, Escape, modifier keys) leaves the drive running,
 * so a dodge roll thrown with an arrow key lands mid-FIGHT without ending it.
 * @param {KeyboardEvent} e
 */
export function takesBackSpellDrive(e) {
  if (e.repeat) return false;
  if (e.key === ' ' || e.key === 'Shift' || e.key === 'Enter') return true;
  return e.key.length === 1 && /[a-z]/i.test(e.key);
}

/**
 * Steering for a player driven by a Spell (FIGHT, CHOP/MINE/HARVEST): the
 * Steering heading toward a point becomes held WASD keys, fed to the ordinary
 * movement path, so the player walks at its own speed under every movement
 * lock. Owns the fine-tune that eases a stalled player onto the cell grid.
 */
export class HeldKeySteering {
  constructor(game) {
    this.game = game;
    this.progress = { x: 0, y: 0, timer: 0 };
  }

  /** Start a fresh progress window (on cast). */
  resetProgress() {
    const pos = this.game.player?.position;
    this.progress = { x: pos?.x ?? 0, y: pos?.y ?? 0, timer: 0 };
  }

  // Held keys walking the player toward a top-left point. Only the heading:
  // the player's velocity comes from the keys through the ordinary movement
  // path (acceleration, friction, the speed cap), so a driven player walks
  // exactly as fast as the player does.
  keysToward(x, y) {
    const player = this.game.player;
    if (this._stalled() && this._fineTune()) return { ...NO_KEYS };
    const { heading, next } = steerHeading(this.game, player, x, y, PHYSICS.PLAYER_SPEED);
    const keys = {
      w: heading.y < -AXIS_DEADZONE,
      s: heading.y > AXIS_DEADZONE,
      a: heading.x < -AXIS_DEADZONE,
      d: heading.x > AXIS_DEADZONE,
    };
    // A re-center too fine for held keys: hold the one key toward the next
    // route cell instead, and PhysicsSystem's corner slip lines the player up
    // with the gap as it presses in.
    if (next && !(keys.w || keys.s || keys.a || keys.d)) {
      const c = entityCenter(player);
      const dx = next.x - c.x, dy = next.y - c.y;
      if (Math.abs(dx) >= Math.abs(dy)) { keys.a = dx < 0; keys.d = dx > 0; }
      else { keys.w = dy < 0; keys.s = dy > 0; }
    }
    this._brakeDrift(keys);
    return keys;
  }

  // Momentum the keys no longer ask for still carries the player: the tail of
  // a re-center, the old axis after a turn at a corner. Steering plans the
  // heading, not the coast, so along a one-cell causeway the coast alone put
  // an edge of the box over the deep water beside it. On an axis whose key is
  // let go, when the coast would carry the box onto a hazard cell (deep water,
  // lava) it isn't already touching, hold the opposite key to brake. Walls
  // are left to PhysicsSystem, which stops the body at them.
  _brakeDrift(keys) {
    const game = this.game;
    const player = game.player;
    const { vx, vy } = player.velocity;
    const driftY = (vy < 0 && !keys.w) || (vy > 0 && !keys.s);
    const driftX = (vx < 0 && !keys.a) || (vx > 0 && !keys.d);
    if (!driftX && !driftY) return;
    const map = player.collisionMap || game.activeRoom?.collisionMap || game.currentRoom?.collisionMap || null;
    const grid = buildTerrainGrid(game, player, map);
    if (driftY && this._coastsIntoHazard(grid, 0, vy * COAST_TIME)) {
      keys.w = vy > 0;
      keys.s = vy < 0;
    }
    if (driftX && this._coastsIntoHazard(grid, vx * COAST_TIME, 0)) {
      keys.a = vx > 0;
      keys.d = vx < 0;
    }
  }

  // Whether the player's box, moved by (dx, dy), touches a hazard cell it
  // doesn't touch now (the box read as PhysicsSystem reads terrain overlap).
  _coastsIntoHazard(grid, dx, dy) {
    const { position: pos, width: w, height: h } = this.game.player;
    const EDGE = 0.01;
    const cells = (x, y) => ({
      c0: Math.floor(x / CELL), c1: Math.floor((x + w - EDGE) / CELL),
      r0: Math.floor(y / CELL), r1: Math.floor((y + h - EDGE) / CELL),
    });
    const now = cells(pos.x, pos.y);
    const next = cells(pos.x + dx, pos.y + dy);
    for (let r = next.r0; r <= next.r1; r++) {
      for (let c = next.c0; c <= next.c1; c++) {
        if (r >= now.r0 && r <= now.r1 && c >= now.c0 && c <= now.c1) continue;
        if (cellCost(grid, c, r) === HAZARD) return true;
      }
    }
    return false;
  }

  // Whether the driven player has stopped moving (see STUCK_TIME).
  _stalled() {
    const pos = this.game.player.position;
    const pr = this.progress;
    if (Math.hypot(pos.x - pr.x, pos.y - pr.y) >= STUCK_PX) {
      this.resetProgress();
      return false;
    }
    pr.timer += FRAME;
    return pr.timer >= STUCK_TIME;
  }

  // The fine-tune: one frame's ease toward the nearest open cell, at walking
  // speed. True while still easing; false once aligned (or when no open cell
  // is near enough), which hands the keys back to Steering with a fresh
  // progress window.
  _fineTune() {
    const game = this.game;
    const player = game.player;
    const pos = player.position;
    const col = Math.round(pos.x / CELL), row = Math.round(pos.y / CELL);
    const ax = col * CELL, ay = row * CELL;
    const dx = ax - pos.x, dy = ay - pos.y;
    const done = () => { this.resetProgress(); return false; };
    if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return done();
    if (Math.abs(dx) > FINE_TUNE_PX || Math.abs(dy) > FINE_TUNE_PX) return done();
    const map = player.collisionMap || game.activeRoom?.collisionMap || game.currentRoom?.collisionMap || null;
    const cost = cellCost(buildTerrainGrid(game, player, map), col, row);
    if (cost === BLOCKED || cost === HAZARD) return done();

    const step = PHYSICS.PLAYER_SPEED * FRAME;
    const len = Math.hypot(dx, dy);
    const k = Math.min(1, step / len);
    pos.x += dx * k;
    pos.y += dy * k;
    player.velocity.vx = 0;
    player.velocity.vy = 0;
    return true;
  }
}
