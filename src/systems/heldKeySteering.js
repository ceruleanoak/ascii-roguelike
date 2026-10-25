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

const NO_KEYS = Object.freeze({ w: false, a: false, s: false, d: false });

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
    return keys;
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
