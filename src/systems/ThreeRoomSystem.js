import { GRID, GAME_STATES } from '../game/GameConfig.js';
import { BackgroundObject } from '../entities/BackgroundObject.js';
import { captureDeath } from './DeathLedgerSystem.js';

/**
 * ThreeRoomSystem — the source room and its two discoveries.
 *
 * Discovery paths (both route into the neutral `threeRoom` script):
 *   Accidental — three consecutive north traversals. The streak counts real
 *                exits taken; any east/west/south move or REST entry breaks it.
 *   Inevitable — once per run, gray depth 3 replaces the north exit's letter
 *                with '3' (stamped by ExitSystem.generateExits; the exit
 *                object carries `threeRoom: true`, which the north-exit block
 *                in main.js intercepts).
 *
 * Division of labor inside the room: the neutral script builds the static
 * geometry (slots pyramid, shut door); this system owns everything alive —
 * SPACE on the door opens it, and opening releases Death: homing straight at
 * the player through anything, impossible to defeat, slower than a walk so
 * the way south stays open. Contact routes through game._resolveNeutralDeath(),
 * which keeps REVIVE/CONTINUE (the wish-cheat the Voice tempts) live exactly
 * as for any other death.
 */

// North traversals in a row before the world runs out.
const NORTH_STREAK_TRIGGER = 3;

// Death — behind the shut door, beyond naming. Printable ASCII per the
// encoding rule; the room around it does the implying.
const DEATH_CHAR = '&';
const DEATH_COLOR = '#dddddd';

// Slower than the player's walk on purpose: opening the door is survivable,
// outrunning it south is the only answer, and it never stops following.
const DEATH_SPEED = 62;
// Contact distance for the kill — inside a cell's shadow.
const DEATH_KILL_RADIUS = GRID.CELL_SIZE * 0.55;

// ── Remaining design — comments only until built (Phase 3) ──────────────────
//
//   Slot acceptance: the pyramid slots in the neutral threeRoom script refuse
//   everything silently except their two truths. The power-items (Weapon of
//   Instinct / Armor of Experience / Consumable of Convention) feed the
//   Voice; Justice / Truth / Help in the same slots open the way north for
//   real. Full contract, open questions, and item candidates are recorded in
//   the slot comment in src/data/neutralRooms.js (threeRoom.onGenerate).
//
//   South of Rest: liberated by the true-3 pattern — an exit south that ends
//   the run by permission rather than death. Unbuilt; its eventual home is
//   wherever REST's southern suspicion ("always a suspicion of further
//   south", zone-cosmology.md) resolves.
//
//   Death's door is live as of this file: opening it is survivable only by
//   leaving south (Death outruns nothing but never stops) or by cheating —
//   a REVIVE/CONTINUE wish resumes NEUTRAL with Death still coming. Item
//   cheats deliberately do NOT intercept here (hp is set directly, not via
//   takeDamage): items can't buy off Death; only the Voice's own currency
//   can. Veto by routing the kill through player.takeDamage instead.

export class ThreeRoomSystem {
  constructor() {
    this._northStreak = 0;
  }

  // ── Discovery: N×3 ──────────────────────────────────────────────────────────

  /**
   * Record a north traversal. Returns true on the traversal that summons the
   * source room (the caller warps there instead of generating deeper); the
   * streak consumes itself so wandering back and insisting again can re-find it.
   */
  recordNorthTraversal() {
    this._northStreak += 1;
    if (this._northStreak >= NORTH_STREAK_TRIGGER) {
      this._northStreak = 0;
      return true;
    }
    return false;
  }

  /** Any non-north step forgets the insistence. */
  breakStreak() {
    this._northStreak = 0;
  }

  /** Full run-scoped reset — death/title. */
  hardReset() {
    this.breakStreak();
  }

  // ── The door ────────────────────────────────────────────────────────────────

  /**
   * SPACE near the shut door (dispatched from main.js's NEUTRAL branch).
   * Opens it once per visit and releases what is behind it. Returns true when
   * the press was consumed so the caller knows to stop routing SPACE.
   */
  handleDoorPress(game) {
    const room = game.currentRoom;
    const door = room?.backgroundObjects?.find(o => o.threeDoor);
    if (!door || door._opened) return false;

    door._opened = true;
    // The way north stands open.
    door.char = '.';
    door.animationChar = '.';
    door.hasCollision = false;
    const { col, row } = door.threeDoorCell;
    if (room.collisionMap?.[row]) room.collisionMap[row][col] = false;

    // And what was shut away walks out.
    const death = new BackgroundObject(DEATH_CHAR, door.position.x, door.position.y);
    death.isDeath = true;
    death.indestructible = true;
    death.color = DEATH_COLOR;
    death.animationColor = DEATH_COLOR;
    death.hasCollision = false;
    room.backgroundObjects.push(death);

    game.renderer.markBackgroundDirty();
    return true;
  }

  // ── Runtime: Death, released ────────────────────────────────────────────────

  /**
   * Per-frame tick while the player is inside the Three Room. Finds the Death
   * object (if the door was opened) and homes it at the player — straight
   * line, through walls, no leash, no ceiling on how long it follows. Called
   * from updateNeutralState; inert in every other room.
   */
  update(dt, game) {
    const room = game.currentRoom;
    if (!room?.isThreeRoom || !room.backgroundObjects) return;
    const death = room.backgroundObjects.find(o => o.isDeath);
    if (!death) return;
    const p = game.player;
    if (!p || p.hp <= 0) return;

    const dx = p.position.x - death.position.x;
    const dy = p.position.y - death.position.y;
    const dist = Math.hypot(dx, dy) || 1;
    death.position.x += (dx / dist) * DEATH_SPEED * dt;
    death.position.y += (dy / dist) * DEATH_SPEED * dt;

    if (dist < DEATH_KILL_RADIUS) {
      // It cannot be blocked, dodged, or tanked — its touch is the end.
      p.hp = 0;
      this._resolveContactDeath(game);
    }
  }

  /**
   * Death resolution for a kill that lands outside EXPLORE — EXPLORE's
   * hp<=0 catch-all never runs in NEUTRAL, so this is the minimal honest
   * path into GAME_OVER: same audio, same ledger, same transition. Keeps
   * REVIVE/CONTINUE live; the wish-revive routes back to NEUTRAL when the
   * death happened here (WishSystem.executeRevive).
   */
  _resolveContactDeath(game) {
    console.log('💀 Death reached the player.');
    captureDeath(game);
    game.audioSystem.stop();
    game.audioSystem.playSFX('player_death');
    game.combatSystem.clear();
    game.stateMachine.transition(GAME_STATES.GAME_OVER);
  }
}
