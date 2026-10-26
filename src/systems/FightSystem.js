import { GRID, GAME_STATES } from '../game/GameConfig.js';
import { buildTerrainGrid, lineWithin, DRY_GROUND } from './steeringTerrain.js';
import { HeldKeySteering } from './heldKeySteering.js';
import { entityCenter } from '../game/Telegraph.js';
import { planeOf } from './PlaneSystem.js';
import { getThrowProfile } from './TrapSystem.js';

const CELL = GRID.CELL_SIZE;

// How close the player closes before swinging, center to center. Melee (and the
// Punch) has to stand on the enemy's doorstep; guns and bows hold off and shoot.
const MELEE_RANGE = CELL * 1.4;
const RANGED_RANGE = CELL * 6;

// After a ranged shot the player moves before shooting again: a dodge roll
// across the line of fire when the target stands this close, a sidestep
// otherwise. While the weapon reloads it backs away to its shooting range.
const ROLL_RANGE = CELL * 3;
const SIDESTEP_DIST = CELL * 1.5;
const SIDESTEP_TIME = 0.4;         // seconds before an unfinished sidestep is given up
const ROLL_HOLD = 0.25;            // seconds the roll direction is held (Green Ranger slides while held)
const ROLL_CLEARANCE = CELL * 2;   // least open ground a roll needs on its side (see _rollReach)

const FRAME = 1 / 60;

// A held trap is thrown from a distance: FIGHT backs off inside TRAP_HOLD_MIN
// and closes in past the trap's throw reach. A wire is thrown in a random
// direction, at a random power, at least WIRE_MIN_THROW out.
const TRAP_HOLD_MIN = CELL * 2.5;
const WIRE_MIN_THROW = CELL * 2;

/**
 * FightSystem — the FIGHT Spell: auto-combat against whichever enemy is nearest,
 * until the player's next keypress.
 *
 * The player is driven, not animated: each frame the steering heading toward
 * the target becomes held WASD keys (HeldKeySteering) fed to the ordinary
 * movement path, so speed, armor, Dizzy, the Rusalka and
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
 * A held trap goes first: FIGHT keeps its distance and throws it through
 * the same charge-and-release SPACE drives (TrapSystem), a trap landing about
 * as far out as the nearest enemy stands, a wire end in a random direction at
 * a random power. One per cast: once a throw has spent a charge, the stack is
 * done for this fight, and the next cast may throw another. Placed Remote
 * Bombs go off once an enemy walks into one's blast.
 *
 * A trap that has thrown its one, or a gun or bow out of ammo for the room,
 * swaps to the next slot through the number-key path: a weapon first, then
 * anything else unspent, then empty hands (the Punch).
 *
 * Damage still lands on the player; the fight is not a Beeline. It re-targets
 * as enemies fall and ends when none are left, or when any key is pressed.
 */
export class FightSystem {
  constructor(game) {
    this.game = game;
    this.active = false;
    // The move between ranged shots: { kind: 'step'|'roll', x, y, timer }
    // (x, y: the sidestep's top-left target, or the roll's unit direction).
    this.reposition = null;
    this.steering = new HeldKeySteering(game);
    // Reticule distance (px) at which the trap/wire throw FIGHT is charging
    // is let go, or null when FIGHT isn't charging one.
    this.throwAt = null;
    // The trap FIGHT last started a throw of and its charges then
    // ({ item, charges }), or null; and whether this cast has spent its one
    // trap (a charge went: at release, or a wire's at its second anchor).
    this.trapThrow = null;
    this.trapSpent = false;
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
    this.trapThrow = null;
    this.trapSpent = false;
    this.steering.resetProgress();
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

    // Swimming (the only way to the target was through deep water, or an edge
    // of the box slipped over a bank): no backing off, sidestepping or
    // standing to throw in the water, just on toward the target, which the
    // steering ends on dry ground.
    if (player.inDeepWater) return this.steering.keysToward(target.position.x, target.position.y);
    if (r?.kind === 'step') return this.steering.keysToward(r.x, r.y);
    if (this._deployingTrap()) {
      if (this.throwAt !== null) return none; // stand still while the throw charges
      if (dist < TRAP_HOLD_MIN) return this._keysAway(p, t, dist);
      const reach = player.heldItem.data.wire ? Infinity : getThrowProfile(player.heldItem).maxDist;
      if (dist > reach) return this.steering.keysToward(target.position.x, target.position.y);
      return none;
    }
    if (player.heldItem?.data?.type === 'TRAP') return none; // thrown its one, nothing to swap to
    if (this._ranged() && this._reloading()) {
      if (dist >= RANGED_RANGE || dist === 0) return none;
      return this._keysAway(p, t, dist);
    }
    if (dist <= this._range()) return none;
    return this.steering.keysToward(target.position.x, target.position.y);
  }

  // Held keys backing the player three cells straight away from the target
  // (centers p and t, `dist` apart).
  _keysAway(p, t, dist) {
    const player = this.game.player;
    if (dist === 0) return { w: false, a: false, s: false, d: false };
    const back = CELL * 3;
    const ax = (p.x - t.x) / dist, ay = (p.y - t.y) / dist;
    return this.steering.keysToward(
      p.x + ax * back - player.width / 2,
      p.y + ay * back - player.height / 2,
    );
  }

  /** Face and attack the target when it is in range (after movement this frame). */
  update() {
    if (!this.active) return;
    const game = this.game;
    const player = game.player;

    // A trap or wire throw FIGHT is charging: let go at the chosen distance.
    if (this.throwAt !== null) {
      this._tickThrow();
      return;
    }

    // A spent trap or an empty gun/bow hands over to the next slot.
    this._noteTrapSpent();
    if (this._swapFromSpent()) return;
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

    // No one left: the fight is over. Ending here also drops a reposition
    // begun by the shot that felled the last enemy; left standing, its roll
    // direction kept driving the dodge roll every frame.
    const target = this._nearestEnemy();
    if (!target) { this.reset(); return; }
    if (this._remoteBombInReach()) game.trapSystem.detonateRemoteBombs();
    if (this._repositioning(target)) return;
    // Swimming: hold fire and get out (heldKeys). A shot or swing stalls the
    // swim while the wet pips fill toward drowning.
    if (player.inDeepWater) return;

    const p = entityCenter(player);
    const t = entityCenter(target);
    const dx = t.x - p.x, dy = t.y - p.y;
    const dist = Math.hypot(dx, dy);
    if (this._deployingTrap()) {
      this._throwTrap(dx, dy, dist);
      return;
    }
    // A trap this cast is done with, and nothing to swap it for: it isn't a
    // weapon, so there's nothing left to swing.
    if (held?.data?.type === 'TRAP') return;
    if (dist > this._range() || dist === 0) return;

    // Aim only at the moment an attack can start, the way a player aims and
    // presses SPACE. Re-aimed every frame, a windup tracked the target to the
    // end and was no commitment at all; once it starts, locksFacing holds it.
    if (held) {
      if (!player.canAttack() || !held.canUse() || (this._ranged() && this._reloading())) return;
      this._face(dx / dist, dy / dist);
      const before = this._shotState(held);
      game.combatSystem.tryUseHeldWeapon();
      this._afterShot(held, before);
    } else {
      const punch = game.punchSystem;
      if (punch.isPunching() || punch.cooldown > 0) return;
      this._face(dx / dist, dy / dist);
      punch.tryPunch();
    }
  }

  _face(x, y) {
    const facing = this.game.player.facing;
    facing.x = x;
    facing.y = y;
  }

  /**
   * Whether FIGHT's swing holds the player's facing this frame (main.js
   * lockFacing): from a windup's start until it lands, through a charge
   * (a bow's excepted: SPACE lets a drawn bow aim too), and through a Punch.
   * A SPACE-held swing is locked the same way, so a FIGHT step taken mid-
   * windup no longer turns the swing toward the walk.
   */
  locksFacing() {
    if (!this.active) return false;
    const held = this.game.player.heldItem;
    if (held) return !!(held.windupActive || (held.isCharging && held.data.weaponType !== 'BOW'));
    return this.game.punchSystem.isPunching();
  }

  // The held item is a trap (or wire) with charges left to spend, and this
  // cast hasn't thrown its one yet.
  _deployingTrap() {
    const held = this.game.player.heldItem;
    return held?.data?.type === 'TRAP' && held.charges > 0 && !this.trapSpent;
  }

  // The throw FIGHT started has spent a charge: this cast's trap is done.
  // Read from the item rather than the release, since a wire spends its
  // charge only when the thrown end anchors (WireSystem), and a stack that
  // ran out has already left the hand.
  _noteTrapSpent() {
    const t = this.trapThrow;
    if (!t || !(t.item.charges < t.charges)) return;
    this.trapSpent = true;
    this.trapThrow = null;
  }

  // Start the throw of the held trap or wire. A trap faces the target and
  // lands about where it stands; a wire end faces a random way at a random
  // power and anchors where it lands (WireSystem.attachThrownEnd). Always a
  // throw, never a bite onto an anchor in reach: standing still beside one,
  // every bite would land on the same spot, which WireSystem swallows.
  _throwTrap(dx, dy, dist) {
    const game = this.game;
    const player = game.player;
    const held = player.heldItem;
    if (game.trapCharging || game.wireSystem.flyingEnd) return; // a throw is already out
    const reach = getThrowProfile(held).maxDist;

    if (held.data.wire) {
      const angle = Math.random() * Math.PI * 2;
      player.facing.x = Math.cos(angle);
      player.facing.y = Math.sin(angle);
      game.trapSystem.startTrapCharge('deploy');
      this.throwAt = WIRE_MIN_THROW + Math.random() * (reach - WIRE_MIN_THROW);
      this.trapThrow = { item: held, charges: held.charges };
      return;
    }
    if (dist > reach || dist === 0) return;
    player.facing.x = dx / dist;
    player.facing.y = dy / dist;
    game.trapSystem.startTrapCharge('deploy');
    this.throwAt = dist;
    this.trapThrow = { item: held, charges: held.charges };
  }

  // Let the throw go once its reticule reaches throwAt (or the charge is full),
  // through the same release SPACE-up runs.
  _tickThrow() {
    const game = this.game;
    const charge = game.trapCharging;
    if (!charge) { this.throwAt = null; return; }
    const reticule = game.trapSystem.getTrapReticulePos();
    const c = entityCenter(game.player);
    const out = reticule ? Math.hypot(reticule.x - c.x, reticule.y - c.y) : Infinity;
    if (out < this.throwAt && charge.timer < charge.maxTime) return;
    this.throwAt = null;
    game.trapSystem.releaseTrapThrow();
  }

  // An enemy stands inside a placed Remote Bomb's blast and the player stands
  // outside every one (the blast hurts the player too, TrapSystem 'remote').
  _remoteBombInReach() {
    const game = this.game;
    const bombs = game.placedTraps.filter(e => e.item.data.remoteTrigger);
    if (!bombs.length) return false;
    const within = (entity, item) => {
      const b = entityCenter(item);
      const c = entityCenter(entity);
      return Math.hypot(c.x - b.x, c.y - b.y) <= (item.data.effectRadius ?? CELL * 2);
    };
    if (bombs.some(({ item }) => within(game.player, item))) return false;
    const foes = this._foes();
    return bombs.some(({ item }) => foes.some(e => within(e, item)));
  }

  // A trap with no charges left, any trap once this cast has thrown its one,
  // a wire in a Maze (nothing to anchor to), or a gun or bow out of ammo for
  // the room (one that reloads never is).
  _spent(item) {
    if (!item) return false;
    if (item.data?.type === 'TRAP') {
      return this.trapSpent || !(item.charges > 0) || (item.data.wire && this.game.player.inMaze);
    }
    return item.isSpent();
  }

  // Swap off a spent held item to the next slot that can still fight: a
  // weapon first, then anything unspent (another trap), then empty hands for
  // the Punch. True when it swapped. Goes through the number-key path
  // (handleSelectSlot), so the old item's charge and reload are cancelled.
  _swapFromSpent() {
    const game = this.game;
    const player = game.player;
    if (!this._spent(player.heldItem)) return false;
    // A wire end still in flight anchors only while the wire is in hand.
    if (game.wireSystem.flyingEnd) return false;
    const slots = player.quickSlots;
    const order = [];
    for (let i = 1; i < slots.length; i++) {
      const idx = (player.activeSlotIndex + i) % slots.length;
      if (!player.destroyedSlots?.[idx]) order.push(idx);
    }
    const pick = order.find(i => slots[i]?.data?.type === 'WEAPON' && !slots[i].isSpent())
      ?? order.find(i => slots[i] && !this._spent(slots[i]))
      ?? order.find(i => slots[i] === null);
    if (pick === undefined) return false;
    game.handleSelectSlot(pick);
    this.reposition = null;
    return true;
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
  // it isn't. Nothing when both sides are walled. The side must be dry for
  // the whole move: a roll or sidestep is never a swim.
  _startReposition() {
    const game = this.game;
    const player = game.player;
    const target = this._nearestEnemy();
    if (!target || player.inDeepWater) return; // swimming: just get out (heldKeys)
    const p = entityCenter(player);
    const t = entityCenter(target);
    const dist = Math.hypot(t.x - p.x, t.y - p.y);
    if (dist === 0) return;
    const roll = dist <= ROLL_RANGE;
    const reach = roll ? this._rollReach() : SIDESTEP_DIST;

    const map = player.collisionMap || game.activeRoom?.collisionMap || game.currentRoom?.collisionMap || null;
    const grid = buildTerrainGrid(game, player, map);
    const perp = { x: -(t.y - p.y) / dist, y: (t.x - p.x) / dist };
    const sides = Math.random() < 0.5 ? [1, -1] : [-1, 1];
    for (const side of sides) {
      const dir = { x: perp.x * side, y: perp.y * side };
      if (!lineWithin(grid, p.x, p.y, p.x + dir.x * reach, p.y + dir.y * reach, DRY_GROUND, player.width, player.height)) continue;
      this.reposition = roll
        ? { kind: 'roll', x: dir.x, y: dir.y, timer: ROLL_HOLD }
        : { kind: 'step', x: player.position.x + dir.x * reach, y: player.position.y + dir.y * reach, timer: SIDESTEP_TIME };
      return;
    }
  }

  // How far a roll can carry the player: its roll speed over the roll, plus
  // ROLL_HOLD more for the Green Ranger, who slides on while the direction is
  // held. Never less than ROLL_CLEARANCE.
  _rollReach() {
    const player = this.game.player;
    const slide = player.characterType === 'green' ? ROLL_HOLD : 0;
    return Math.max(ROLL_CLEARANCE, player.getRollSpeed() * (player.dodgeRoll.duration + slide));
  }

  /** End the fight (Reset Registry, room scope). */
  reset() {
    if (this.throwAt !== null) this.game.trapSystem.cancelTrapCharge();
    this.active = false;
    this.reposition = null;
    this.throwAt = null;
    this.trapThrow = null;
    this.trapSpent = false;
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
    const p = entityCenter(this.game.player);
    let best = null;
    let bestDist = Infinity;
    for (const e of this._foes()) {
      const c = entityCenter(e);
      const d = Math.hypot(c.x - p.x, c.y - p.y);
      if (d < bestDist) { bestDist = d; best = e; }
    }
    return best;
  }

  // Every enemy FIGHT may target (see _nearestEnemy).
  _foes() {
    const game = this.game;
    const player = game.player;
    return (game._activeEnemies() || []).filter(e =>
      !(e.hp <= 0 || e.dead || e.aloft)
      && !game._isHiddenEnemy(e) && !e.isCharmed?.()
      && planeOf(e) === planeOf(player));
  }
}
