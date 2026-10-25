import { GRID, GAME_STATES, PHYSICS } from '../game/GameConfig.js';
import { steerHeading } from './npcSteering.js';
import { buildTerrainGrid, lineWithin, cellCost, BLOCKED, HAZARD } from './steeringTerrain.js';
import { entityCenter } from '../game/Telegraph.js';
import { planeOf } from './PlaneSystem.js';

const CELL = GRID.CELL_SIZE;

// How close the player closes before swinging, center to center. Melee (and the
// Punch) has to stand on the enemy's doorstep; guns and bows hold off and shoot.
const MELEE_RANGE = CELL * 1.4;
const RANGED_RANGE = CELL * 6;

// A heading component below this is treated as zero when the steering heading
// is turned into held keys, so a near-vertical heading doesn't jitter sideways.
const AXIS_DEADZONE = 0.38;

// After a ranged shot the player moves before shooting again: a dodge roll
// across the line of fire when the target stands this close, a sidestep
// otherwise. While the weapon reloads it backs away to its shooting range.
const ROLL_RANGE = CELL * 3;
const SIDESTEP_DIST = CELL * 1.5;
const SIDESTEP_TIME = 0.4;         // seconds before an unfinished sidestep is given up
const ROLL_HOLD = 0.25;            // seconds the roll direction is held (Green Ranger slides while held)
const ROLL_CLEARANCE = CELL * 2;   // open ground a roll needs on its side

// Lack of progress: when FIGHT has moved the player less than STUCK_PX in
// STUCK_TIME, it eases the player onto the cell grid (the fine-tune). A
// one-cell gap between wall cells only admits a body aligned to within a
// pixel, which held keys with momentum can't land on: Steering asks for a
// sub-pixel recenter, the heading falls under AXIS_DEADZONE, and the player
// drifts beside the gap. Only a cell within FINE_TUNE_PX on both axes is
// eased onto, so the nudge never crosses into a cell the body isn't already
// touching.
const STUCK_TIME = 0.25;
const STUCK_PX = 1;
const FINE_TUNE_PX = CELL * 0.45;
const FRAME = 1 / 60;

/**
 * FightSystem — the FIGHT Spell: auto-combat against whichever enemy is nearest,
 * until the player's next keypress.
 *
 * The player is driven, not animated: each frame the steering heading toward
 * the target (`steerHeading`, the shared NPC steering) becomes held WASD keys
 * fed to the ordinary movement path, so speed, armor, Dizzy, the Rusalka and
 * every movement lock apply exactly as if the player were walking. In
 * range, the player faces the target and attacks through the same entry points
 * SPACE uses — `CombatSystem.tryUseHeldWeapon` when armed, the Punch when not.
 * A charged weapon is held until its charge is full, then let go through the
 * same release SPACE-up runs.
 *
 * A gun or bow shoots from range and repositions between shots: a dodge
 * roll (through the same dodge path the arrow keys drive) across the line
 * of fire when the target is close, a sidestep when it isn't, and a back-away
 * to shooting range while the weapon reloads.
 *
 * Damage still lands on the player; the fight is not a Beeline. It re-targets
 * as enemies fall and idles while none are left, until any key is pressed.
 */
export class FightSystem {
  constructor(game) {
    this.game = game;
    this.active = false;
    // The move between ranged shots: { kind: 'step'|'roll', x, y, timer }
    // (x, y: the sidestep's top-left target, or the roll's unit direction).
    this.reposition = null;
    this.progress = { x: 0, y: 0, timer: 0 };
  }

  isActive() {
    return this.active;
  }

  /**
   * Begin the fight.
   * @returns {string|null} null when the fight starts (silent cast), else the THREE's refusal
   */
  cast() {
    const game = this.game;
    if (game.stateMachine?.getCurrentState() !== GAME_STATES.EXPLORE) return '...NOTHING.';
    if (!game.player || game.animationSystem.isAnimating(game.player)) return '...NOTHING.';
    if (!this._nearestEnemy()) return 'NO ONE.';
    this.active = true;
    this.reposition = null;
    this._resetProgress();
    return null;
  }

  /** Any keypress after the cast hands control back (main.js keydown). */
  onPlayerInput() {
    this.reset();
  }

  /**
   * The dodge-roll direction FIGHT holds this frame (main.js
   * getDodgeRollDirection), or null when the arrow keys should drive.
   */
  rollDirection() {
    const r = this.reposition;
    if (!this.active || r?.kind !== 'roll') return null;
    return { x: r.x, y: r.y };
  }

  /**
   * The WASD keys FIGHT holds this frame, or null when the player's own keys
   * should drive. Lets go of everything once the target is in range.
   */
  heldKeys() {
    if (!this.active) return null;
    const player = this.game.player;
    const target = this._nearestEnemy();
    const none = { w: false, a: false, s: false, d: false };
    if (!target) return none;

    const p = entityCenter(player);
    const t = entityCenter(target);
    const dist = Math.hypot(t.x - p.x, t.y - p.y);
    const r = this.reposition;
    if (r?.kind === 'roll') return none; // the roll moves the player

    if (r?.kind === 'step') return this._keysToward(r.x, r.y);
    if (this._ranged() && this._reloading()) {
      if (dist >= RANGED_RANGE || dist === 0) return none;
      const back = CELL * 3;
      const ax = (p.x - t.x) / dist, ay = (p.y - t.y) / dist;
      return this._keysToward(
        p.x + ax * back - player.width / 2,
        p.y + ay * back - player.height / 2,
      );
    }
    if (dist <= this._range()) return none;
    return this._keysToward(target.position.x, target.position.y);
  }

  // Held keys walking the player toward a top-left point. Only the heading:
  // the player's velocity comes from the keys through the ordinary movement
  // path (acceleration, friction, the speed cap), so FIGHT walks exactly as
  // fast as the player does.
  _keysToward(x, y) {
    const player = this.game.player;
    if (this._stalled() && this._fineTune()) return { w: false, a: false, s: false, d: false };
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

  // Whether FIGHT has stopped moving the player (see STUCK_TIME).
  _stalled() {
    const pos = this.game.player.position;
    const pr = this.progress;
    if (Math.hypot(pos.x - pr.x, pos.y - pr.y) >= STUCK_PX) {
      this._resetProgress();
      return false;
    }
    pr.timer += FRAME;
    return pr.timer >= STUCK_TIME;
  }

  _resetProgress() {
    const pos = this.game.player?.position;
    this.progress = { x: pos?.x ?? 0, y: pos?.y ?? 0, timer: 0 };
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
    const done = () => { this._resetProgress(); return false; };
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

  /** Face and attack the target when it is in range (after movement this frame). */
  update() {
    if (!this.active) return;
    const game = this.game;
    const player = game.player;
    const held = player.heldItem;

    // A charge started by an earlier swing: let go once it is full.
    if (held?.isCharging) {
      const full = held.data.chargeTime ?? held.maxChargeTime ?? 0;
      if (held.chargeTime >= full) {
        const before = this._shotState(held);
        game.handleSpaceRelease();
        this._afterShot(held, before);
      }
      return;
    }

    const target = this._nearestEnemy();
    if (!target) return;
    if (this._repositioning(target)) return;

    const p = entityCenter(player);
    const t = entityCenter(target);
    const dx = t.x - p.x, dy = t.y - p.y;
    const dist = Math.hypot(dx, dy);
    if (dist > this._range() || dist === 0) return;

    player.facing.x = dx / dist;
    player.facing.y = dy / dist;
    if (held) {
      if (!player.canAttack() || (this._ranged() && this._reloading())) return;
      const before = this._shotState(held);
      game.combatSystem.tryUseHeldWeapon();
      this._afterShot(held, before);
    } else {
      game.punchSystem.tryPunch();
    }
  }

  // Ticks the move between ranged shots; true while it still holds fire.
  _repositioning(target) {
    const r = this.reposition;
    if (!r) return false;
    const player = this.game.player;
    r.timer -= FRAME;
    if (r.kind === 'roll') {
      if (r.timer > 0 || player.dodgeRoll.active || player.continuousRollActive) return true;
    } else {
      const arrived = Math.hypot(player.position.x - r.x, player.position.y - r.y) < CELL * 0.25;
      if (!arrived && r.timer > 0 && !target.dead) return true;
    }
    this.reposition = null;
    return false;
  }

  // What a shot changes on the held weapon, read before and after an attack.
  _shotState(held) {
    return { uses: held.usesRemaining, cooldown: held.cooldownTimer ?? 0 };
  }

  // A ranged weapon that just fired starts the move before the next shot.
  _afterShot(held, before) {
    if (!this._ranged() || this.game.player.heldItem !== held) return;
    const fired = (held.usesRemaining ?? 0) < (before.uses ?? 0)
      || (held.cooldownTimer ?? 0) > before.cooldown;
    if (fired) this._startReposition();
  }

  // Across the line of fire, to a random side (the other side when that one
  // is walled): a roll when the target is within ROLL_RANGE, a sidestep when
  // it isn't. Nothing when both sides are walled.
  _startReposition() {
    const game = this.game;
    const player = game.player;
    const target = this._nearestEnemy();
    if (!target) return;
    const p = entityCenter(player);
    const t = entityCenter(target);
    const dist = Math.hypot(t.x - p.x, t.y - p.y);
    if (dist === 0) return;
    const roll = dist <= ROLL_RANGE;
    const reach = roll ? ROLL_CLEARANCE : SIDESTEP_DIST;

    const map = player.collisionMap || game.activeRoom?.collisionMap || game.currentRoom?.collisionMap || null;
    const grid = buildTerrainGrid(game, player, map);
    const perp = { x: -(t.y - p.y) / dist, y: (t.x - p.x) / dist };
    const sides = Math.random() < 0.5 ? [1, -1] : [-1, 1];
    for (const side of sides) {
      const dir = { x: perp.x * side, y: perp.y * side };
      if (!lineWithin(grid, p.x, p.y, p.x + dir.x * reach, p.y + dir.y * reach, Infinity, player.width, player.height)) continue;
      this.reposition = roll
        ? { kind: 'roll', x: dir.x, y: dir.y, timer: ROLL_HOLD }
        : { kind: 'step', x: player.position.x + dir.x * reach, y: player.position.y + dir.y * reach, timer: SIDESTEP_TIME };
      return;
    }
  }

  /** End the fight (Reset Registry, room scope). */
  reset() {
    this.active = false;
    this.reposition = null;
  }

  _ranged() {
    const type = this.game.player.heldItem?.data?.weaponType;
    return type === 'GUN' || type === 'BOW';
  }

  // The held gun or bow is mid-reload (Item.update's reload phase).
  _reloading() {
    const held = this.game.player.heldItem;
    return !!(held?._reloading && held.data.reloadTime);
  }

  _range() {
    return this._ranged() ? RANGED_RANGE : MELEE_RANGE;
  }

  // Nearest enemy the player could fight on their own plane: alive, revealed,
  // not overhead, and not on the player's side (charmed / commanded).
  _nearestEnemy() {
    const game = this.game;
    const player = game.player;
    const p = entityCenter(player);
    let best = null;
    let bestDist = Infinity;
    for (const e of game._activeEnemies() || []) {
      if (e.hp <= 0 || e.dead || e.aloft) continue;
      if (game._isHiddenEnemy(e) || e.isCharmed?.()) continue;
      if (planeOf(e) !== planeOf(player)) continue;
      const c = entityCenter(e);
      const d = Math.hypot(c.x - p.x, c.y - p.y);
      if (d < bestDist) { bestDist = d; best = e; }
    }
    return best;
  }
}
