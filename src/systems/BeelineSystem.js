import { GRID, GAME_STATES } from '../game/GameConfig.js';
import { inSamePlane } from './PlaneSystem.js';

// Beeline speed in px/s — three times the walk (PHYSICS PLAYER_SPEED 180).
const BEELINE_SPEED = 540;

/**
 * BeelineSystem — the Beeline: an invulnerable rapid run in one straight line
 * to an open exit, leaving a trail, cast by the GO / HEAD spells (and by
 * ESCAPE, which first drops every weapon so the way back to REST opens).
 * ENTERHUT / EXITHUT, ENTERCAVE / EXITCAVE and ENTERMAZE / EXITMAZE run
 * the same way to a hut, Cavern or Maze door and go through it on arrival;
 * OPENCAVE runs to the rock hiding a Cavern and breaks it open. TALK runs
 * to the nearest person who speaks and talks to them on arrival.
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
    // What is being run toward — an exit direction, 'hut', 'cave', 'maze' or
    // 'talk' — or null. Read through isActive().
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

    this._runTo(direction, this._laneTarget(state, direction));
    return null;
  }

  /**
   * ENTERHUT: Beeline to the nearest hut door the player could go in by
   * (in a Settlement, the closest of its huts), then go in. A room with no
   * hut but an opened Cavern sends the player into the Cavern instead.
   * @returns {string|null} null when the Beeline starts, else the THREE's refusal
   */
  enterHut() {
    const refusal = this._surfaceRefusal();
    if (refusal) return refusal;
    const all = this.game.hutSystem.roomHuts();
    const huts = all.filter(hut => hut.hutKind !== 'cavern');
    return this._runIntoNearest(this._hutDoors(huts.length ? huts : all));
  }

  /**
   * ENTER: go in by the nearest door the room offers — any hut, an opened
   * Cavern or the Maze — the same run as ENTERHUT / ENTERCAVE / ENTERMAZE.
   * A Cavern still behind its rock is not a door yet.
   * @returns {string|null} null when the Beeline starts, else the THREE's refusal
   */
  enter() {
    const game = this.game;
    const refusal = this._surfaceRefusal();
    if (refusal) return refusal;
    const doors = this._hutDoors(game.hutSystem.roomHuts());
    const maze = game.currentRoom.maze;
    if (maze?.doorPosition) {
      doors.push({
        cell: maze.doorPosition,
        target: 'maze',
        open: !!game.mazeSystem.exteriorDoorCell(),
        enter: () => game.mazeSystem.enterMaze(),
      });
    }
    return this._runIntoNearest(doors);
  }

  /**
   * ENTERCAVE: Beeline to the room's opened Cavern door and go in. A Cavern
   * still behind its Bombable Rock is shut until OPENCAVE (or a bomb) breaks it.
   * @returns {string|null} null when the Beeline starts, else the THREE's refusal
   */
  enterCave() {
    const refusal = this._surfaceRefusal();
    if (refusal) return refusal;
    if (!this.game.currentRoom.cavern) return '...NOTHING.';
    if (this.game.cavernSystem.hiddenDoorCell()) return 'SHUT.';
    return this._runIntoNearest(this._hutDoors(this.game.hutSystem.roomHuts().filter(hut => hut.hutKind === 'cavern')));
  }

  /**
   * OPENCAVE: with a Sledgehammer or Onyx Hammer in a quick slot, or a bomb
   * to spend, Beeline to the Bombable Rock hiding the room's Cavern and break
   * it open. ENTERCAVE goes in after.
   * @returns {string|null} null when the Beeline starts, else the THREE's refusal
   */
  openCave() {
    const game = this.game;
    const refusal = this._surfaceRefusal();
    if (refusal) return refusal;
    const cell = game.cavernSystem.hiddenDoorCell();
    if (!cell) return '...NOTHING.';
    if (!game.cavernSystem.openingForce()) return 'TOO HARD.';
    this._runTo('cave', this._doorstep(cell), () => game.cavernSystem.openHiddenDoor());
    return null;
  }

  /**
   * EXITHUT: from inside a hut (a Cavern counts), Beeline to its door and step out.
   * @returns {string|null} null when the Beeline starts, else the THREE's refusal
   */
  exitHut() {
    return this._runOutOfHut(false);
  }

  /**
   * EXIT: leave whichever hut, Cavern or Maze the player is in — EXITHUT or
   * EXITMAZE, as fits.
   * @returns {string|null} null when the Beeline starts, else the THREE's refusal
   */
  exit() {
    if (this.game.player?.inMaze) return this.exitMaze();
    return this._runOutOfHut(false);
  }

  /**
   * EXITCAVE: EXITHUT, but only from inside a Cavern.
   * @returns {string|null} null when the Beeline starts, else the THREE's refusal
   */
  exitCave() {
    return this._runOutOfHut(true);
  }

  /**
   * ENTERMAZE: Beeline to the room's Maze door and go in. A Maze once left is
   * sealed for good, so its door no longer answers.
   * @returns {string|null} null when the Beeline starts, else the THREE's refusal
   */
  enterMaze() {
    const game = this.game;
    const refusal = this._surfaceRefusal();
    if (refusal) return refusal;
    if (!game.currentRoom?.maze) return '...NOTHING.';
    const door = game.mazeSystem.exteriorDoorCell();
    if (!door) return 'SHUT.';
    this._runTo('maze', this._doorstep(door), () => game.mazeSystem.enterMaze());
    return null;
  }

  /**
   * EXITMAZE: from inside the Maze, Beeline to its south exit and leave —
   * refused while the exits are sealed.
   * @returns {string|null} null when the Beeline starts, else the THREE's refusal
   */
  exitMaze() {
    const game = this.game;
    const mi = game.mazeInterior;
    if (!game.player?.inMaze || !mi || game.animationSystem.isAnimating(game.player)) return '...NOTHING.';
    if (mi.exitsSealed) return 'SHUT.';
    const C = GRID.CELL_SIZE;
    this._runTo('maze', { x: mi.exitCol * C, y: mi.exitRow * C }, () => game.mazeSystem.exitMaze());
    return null;
  }

  /**
   * TALK: Beeline beside the nearest speaker on the player's layer and plane
   * (any NPC with getDialogueLines) and talk to them — one line, as SPACE
   * beside them tells (DialogueSystem.talk).
   *
   * The talk waits for the run's end even when the player already stands in
   * range: the SPACE that cast TALK goes on to handleSpacePress, which talks to
   * a speaker in range itself, so on arrival the box opening (or the game
   * pausing) means that SPACE already spoke and TALK says nothing more.
   * @returns {string|null} null when the run starts, else the THREE's refusal
   */
  talk() {
    const game = this.game;
    const player = game.player;
    const state = game.stateMachine?.getCurrentState();
    if (!player || !game.currentRoom || game.animationSystem.isAnimating(player)) return '...NOTHING.';
    if (state !== GAME_STATES.EXPLORE && state !== GAME_STATES.REST && state !== GAME_STATES.NEUTRAL) return '...NOTHING.';

    const speakers = game.interiorManager.activeNpcs()
      .filter(npc => typeof npc.getDialogueLines === 'function' && inSamePlane(npc, player));
    if (speakers.length === 0) return 'NO ONE.';
    const { x, y } = player.position;
    const distance = npc => Math.hypot(npc.position.x - x, npc.position.y - y);
    const npc = speakers.reduce((best, s) => (distance(s) < distance(best) ? s : best));

    const C = GRID.CELL_SIZE;
    const goal = npc.isInRange?.(player)
      ? { x, y }
      : this._doorstep({ col: Math.round(npc.position.x / C), row: Math.round(npc.position.y / C) }, game.activeRoom?.collisionMap);
    this._runTo('talk', goal, () => {
      if (game.dialogueSystem.isOpen() || game.pauseSystem.isPaused()) return;
      game.dialogueSystem.talk(npc);
    });
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

  /**
   * GOREST: in EXPLORE, south is the way back to REST, so this is GOSOUTH.
   * Anywhere else there is no REST to run back to.
   * @returns {string|null} null when the Beeline starts, else the THREE's refusal
   */
  goRest() {
    if (this.game.stateMachine?.getCurrentState() !== GAME_STATES.EXPLORE) return '...NOTHING.';
    return this.cast('south');
  }

  /**
   * EXPLORE: in REST, north is the way out to EXPLORE, so this is GONORTH.
   * Anywhere else the player is already out.
   * @returns {string|null} null when the Beeline starts, else the THREE's refusal
   */
  goExplore() {
    if (this.game.stateMachine?.getCurrentState() !== GAME_STATES.REST) return '...NOTHING.';
    return this.cast('north');
  }

  // Each hut record as a door to run into: its cell, whether it would let the
  // player in right now, and what going in does.
  _hutDoors(huts) {
    const hutSystem = this.game.hutSystem;
    return huts.map(hut => ({
      cell: hut.doorPosition,
      target: hut.hutKind === 'cavern' ? 'cave' : 'hut',
      open: hutSystem.canEnter(hut),
      enter: () => hutSystem.enterHut(hut),
    }));
  }

  // Run into the nearest open one of `doors` and go in on arrival.
  // '...NOTHING.' when there are none, 'SHUT.' when every one is closed.
  _runIntoNearest(doors) {
    if (doors.length === 0) return '...NOTHING.';
    const open = doors.filter(door => door.open);
    if (open.length === 0) return 'SHUT.';
    const C = GRID.CELL_SIZE;
    const { x, y } = this.game.player.position;
    const distance = d => Math.hypot(d.cell.col * C - x, d.cell.row * C - y);
    const door = open.reduce((best, d) => (distance(d) < distance(best) ? d : best));
    this._runTo(door.target, this._doorstep(door.cell), door.enter);
    return null;
  }

  // Run to the hut floor's exit door and step out; `caveOnly` refuses on any
  // floor but a Cavern's.
  _runOutOfHut(caveOnly) {
    const game = this.game;
    const cell = game.hutSystem.interiorExitCell();
    if (!cell || game.animationSystem.isAnimating(game.player)) return '...NOTHING.';
    if (caveOnly && game.activeFloor.hutKind !== 'cavern') return '...NOTHING.';
    const C = GRID.CELL_SIZE;
    this._runTo('hut', { x: cell.col * C, y: cell.row * C }, () => game.hutSystem.exitHut());
    return null;
  }

  // The run itself: one straight invulnerable segment to `goal`, then
  // `onArrive` (door runs) — exit runs have the per-frame exit check instead.
  _runTo(target, goal, onArrive = null) {
    const player = this.game.player;
    const duration = Math.hypot(goal.x - player.position.x, goal.y - player.position.y) / BEELINE_SPEED;
    this.active = target;
    this.game.animationSystem.play(player, [
      { type: 'moveTo', x: goal.x, y: goal.y, duration, easing: 'linear' },
      { type: 'callback', fn: () => { this.active = null; onArrive?.(); } },
    ]);
  }

  // Why a door run can't start on the surface, or null when it can.
  _surfaceRefusal() {
    const game = this.game;
    if (!game.player || !game.currentRoom) return '...NOTHING.';
    if (game.stateMachine?.getCurrentState() !== GAME_STATES.EXPLORE) return '...NOTHING.';
    if (game.interiorManager.isActive || game.animationSystem.isAnimating(game.player)) return '...NOTHING.';
    return null;
  }

  // The open cell beside a door to stand on (top-left px): the door's
  // walkable neighbour nearest the player, so the way back out of the
  // interior lands somewhere walkable. Falls back to the cell below. `map`
  // is the surface room's unless given (TALK passes the live layer's).
  _doorstep(door, map = this.game.currentRoom.collisionMap) {
    const C = GRID.CELL_SIZE;
    const { x, y } = this.game.player.position;
    const open = [[0, 1], [0, -1], [1, 0], [-1, 0]]
      .map(([dc, dr]) => ({ col: door.col + dc, row: door.row + dr }))
      .filter(({ col, row }) => map?.[row] && map[row][col] === false);
    const cells = open.length ? open : [{ col: door.col, row: door.row + 1 }];
    const best = cells.reduce((a, b) =>
      Math.hypot(a.col * C - x, a.row * C - y) <= Math.hypot(b.col * C - x, b.row * C - y) ? a : b);
    return { x: best.col * C, y: best.row * C };
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
