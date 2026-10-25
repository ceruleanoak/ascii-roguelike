import { GRID, GAME_STATES, PHYSICS } from '../game/GameConfig.js';
import { steerHeading } from './npcSteering.js';
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
 * Damage still lands on the player; the fight is not a Beeline. It re-targets
 * as enemies fall and idles while none are left, until any key is pressed.
 */
export class FightSystem {
  constructor(game) {
    this.game = game;
    this.active = false;
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
    return null;
  }

  /** Any keypress after the cast hands control back (main.js keydown). */
  onPlayerInput() {
    this.active = false;
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
    if (Math.hypot(t.x - p.x, t.y - p.y) <= this._range()) return none;

    // Only the heading: the player's velocity comes from the keys below through
    // the ordinary movement path (acceleration, friction, the speed cap), so
    // FIGHT walks exactly as fast as the player does.
    const { heading } = steerHeading(this.game, player, target.position.x, target.position.y, PHYSICS.PLAYER_SPEED);
    return {
      w: heading.y < -AXIS_DEADZONE,
      s: heading.y > AXIS_DEADZONE,
      a: heading.x < -AXIS_DEADZONE,
      d: heading.x > AXIS_DEADZONE,
    };
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
      if (held.chargeTime >= full) game.handleSpaceRelease();
      return;
    }

    const target = this._nearestEnemy();
    if (!target) return;
    const p = entityCenter(player);
    const t = entityCenter(target);
    const dx = t.x - p.x, dy = t.y - p.y;
    const dist = Math.hypot(dx, dy);
    if (dist > this._range() || dist === 0) return;

    player.facing.x = dx / dist;
    player.facing.y = dy / dist;
    if (held) {
      if (player.canAttack()) game.combatSystem.tryUseHeldWeapon();
    } else {
      game.punchSystem.tryPunch();
    }
  }

  /** End the fight (Reset Registry, room scope). */
  reset() {
    this.active = false;
  }

  _range() {
    const type = this.game.player.heldItem?.data?.weaponType;
    return type === 'GUN' || type === 'BOW' ? RANGED_RANGE : MELEE_RANGE;
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
