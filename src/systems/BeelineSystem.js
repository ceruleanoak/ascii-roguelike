import { GRID, GAME_STATES } from '../game/GameConfig.js';

// Beeline speed in px/s — three times the walk (PHYSICS PLAYER_SPEED 180).
const BEELINE_SPEED = 540;

/**
 * BeelineSystem — the Beeline: an invulnerable rapid run in one straight line
 * to an open exit, leaving a trail, cast by the GO / HEAD spells (and by
 * ESCAPE, which first drops every weapon so the way back to REST opens).
 *
 * The Beeline only gets the player there. It ends with the player standing in
 * the exit lane, inside the threshold the per-frame exit check already reads,
 * so on the next frame that check fires animateExitWarp exactly as if the
 * player had walked in — every exit side effect (path history, compass,
 * Barricade traversal, secret patterns, the Three Room) runs from the one
 * place it always has.
 *
 * The run is an AnimationSystem sequence, which is where the invulnerability
 * comes from: PlayerDamageSystem ignores damage while `player._animLock` is
 * set. The run is one straight segment from where the player stands to the
 * exit lane: it phases through Background Objects and walls alike.
 *
 * Refuses (returning a narrator line) when the exit is shut or a Barricade
 * still stands across its lane, solid or passive (the lava moat).
 */
export class BeelineSystem {
  constructor(game) {
    this.game = game;
    // The direction being run toward, or null. Read through isActive().
    this.active = null;
  }

  /** Is a Beeline running this frame? Self-heals if its animation was cancelled. */
  isActive() {
    if (this.active && !this.game.animationSystem.isAnimating(this.game.player)) {
      this.active = null;
    }
    return this.active !== null;
  }

  /**
   * Run for the exit in `direction`.
   * @param {'north'|'east'|'west'|'south'} direction
   * @returns {string|null} null when the Beeline starts (silent cast), else the
   *   THREE's refusal
   */
  cast(direction) {
    const game = this.game;
    const player = game.player;
    const room = game.currentRoom;
    const state = game.stateMachine?.getCurrentState();
    if (!player || !room) return '...NOTHING.';
    if (state !== GAME_STATES.EXPLORE && state !== GAME_STATES.REST) return '...NOTHING.';
    if (game.interiorManager.isActive || game.animationSystem.isAnimating(player)) return '...NOTHING.';

    const open = state === GAME_STATES.REST
      ? this._restExitOpen(room, direction)
      : game.exitSystem.isExitOpen(room, player, direction);
    if (!open) return 'SHUT.';
    if (game.barricadeSystem.standsAcross(room, direction)) return 'SOMETHING BARS THE WAY.';

    const goal = this._laneTarget(state, direction);
    const duration = Math.hypot(goal.x - player.position.x, goal.y - player.position.y) / BEELINE_SPEED;

    this.active = direction;
    game.animationSystem.play(player, [
      { type: 'moveTo', x: goal.x, y: goal.y, duration, easing: 'linear' },
      { type: 'callback', fn: () => { this.active = null; } },
    ]);
    return null;
  }

  /**
   * ESCAPE / FLEE: let go of every weapon first — that is what opens the way
   * back to REST in a locked room (the escape route, ExitSystem.isExitOpen) —
   * then Beeline south, which checks the now-open exit like any GO.
   * @returns {string|null} null when the flight starts, else the THREE's refusal
   */
  escape() {
    const game = this.game;
    const player = game.player;
    const room = game.currentRoom;
    if (!player || !room || game.stateMachine?.getCurrentState() !== GAME_STATES.EXPLORE) return 'ONLY ONE WAY.';
    if (game.interiorManager.isActive || game.animationSystem.isAnimating(player)) return '...NOTHING.';

    game.trapSystem.dropLoadout();
    return this.cast('south');
  }

  /** Clear the run marker (Reset Registry, room scope). */
  reset() {
    this.active = null;
  }

  // REST's own edges: north always leads out, south only on a Cursed run's
  // opened wall. Mirrors what ExitSystem.restExitCrossing will accept.
  _restExitOpen(room, direction) {
    if (direction !== 'north' && direction !== 'south') return false;
    return !!room.exits?.[direction];
  }

  // The player position (top-left) the run ends at: just inside the threshold
  // the exit check reads (main.js EXPLORE exit block / restExitCrossing).
  _laneTarget(state, direction) {
    const C = GRID.CELL_SIZE;
    const cx = Math.floor(GRID.COLS / 2) * C;
    const cy = Math.floor(GRID.ROWS / 2) * C;
    const southY = (GRID.ROWS - 2) * C + 12;
    if (state === GAME_STATES.REST) {
      return direction === 'north' ? { x: cx, y: C } : { x: cx, y: southY };
    }
    switch (direction) {
      case 'north': return { x: cx, y: 2 * C };
      case 'south': return { x: cx, y: southY };
      case 'east':  return { x: (GRID.COLS - 2) * C + 12, y: cy };
      case 'west':  return { x: C, y: cy };
    }
    return null;
  }
}
