import { GRID, ROOM_TYPES, GAME_STATES } from '../game/GameConfig.js';
import { NEUTRAL_ROOMS } from '../data/neutralRooms.js';

// The edge a neutral room is left through, given the exit taken to reach it.
// 'south' entry (REST → the Graveyard) is the only one that puts the door home
// on the north wall; every other neutral room is entered walking away from REST.
const RETURN_EDGE = { north: 'south', south: 'north', east: 'west', west: 'east' };

// Half-width of the warp band, in cells either side of the edge's midpoint.
const RETURN_BAND_HALF = 1;
// How deep into the room the band reaches from its edge, in cells.
const RETURN_BAND_DEPTH = 2;

/**
 * NeutralRoomSystem - Script executor for NEUTRAL state rooms
 * Handles lifecycle management for neutral room scripts (Leshy Grove, future shops/puzzles)
 */
export class NeutralRoomSystem {
  constructor() {
    this.currentScript = null;
    this.state = {}; // Script-specific state (cuts remaining, inventory, etc.)
  }

  /**
   * Generate a neutral room from script
   * @param {string} scriptName - Name of script in NEUTRAL_ROOMS
   * @param {string} entryDirection - Exit direction taken to reach the room
   *                                  ('north' | 'east' | 'west'); the return
   *                                  exit sits on the edge the player entered
   *                                  through (north→south, east→west, west→east)
   * @param {RoomGenerator} [roomGenerator] - passed through to onGenerate for
   *   scripts that need terrain helpers (e.g. Oasis's stampWaterBlobs) but
   *   have no `game` reference of their own.
   * @returns {object} - Room object with exits, backgroundObjects, state
   */
  generateNeutralRoom(scriptName, entryDirection = 'north', roomGenerator = null) {
    const script = NEUTRAL_ROOMS[scriptName];
    if (!script) {
      console.error(`[NeutralRoomSystem] Script not found: ${scriptName}`);
      return null;
    }

    this.currentScript = script;
    this.state = {}; // Reset state for new room

    // Return exit mirrors the entry: the door home is the edge you walked in from.
    const returnExit = RETURN_EDGE[entryDirection] || 'south';

    const room = {
      type: ROOM_TYPES.DISCOVERY, // Neutral rooms use discovery room type
      depth: 0, // Neutral rooms don't count toward depth
      zone: 'neutral',
      borderColor: '#00ff00',
      collisionMap: this.createCollisionMap(),
      enemies: [],
      items: [],
      backgroundObjects: [],
      exits: { north: false, east: false, west: false, south: false, [returnExit]: true },
      returnExit,
      exitsLocked: false,
      cleared: true // Always cleared (no enemies)
    };

    // Call script's onGenerate hook
    if (script.onGenerate) {
      script.onGenerate(room, this.state, roomGenerator);
    }

    return room;
  }

  /**
   * Is the player inside the return exit's warp band — the strip of floor
   * against whichever edge they entered through?
   *
   * The band is 3 cells wide, centered on the edge's midpoint, and reaches
   * RETURN_BAND_DEPTH cells in from the wall.
   *
   * Extracted from updateNeutralState, where it also carried a separate
   * "crossed the boundary this frame" test. That test was redundant — having
   * crossed inward strictly implies being inside — so only the containment
   * check survives the move. The geometry is the neutral room's, not the
   * orchestrator's, and it grew a fourth edge when the Graveyard became
   * reachable by walking south out of REST.
   */
  isInReturnExit(room, player) {
    const edge = room?.returnExit || 'south';
    if (!room?.exits?.[edge]) return false;

    const grid = player.getGridPosition();
    const near = RETURN_BAND_DEPTH - 1;      // last cell of a band on a low edge
    const farSide = RETURN_BAND_DEPTH;       // first cell of a band on a high edge

    switch (edge) {
      case 'south':
        return Math.abs(grid.x - Math.floor(GRID.COLS / 2)) <= RETURN_BAND_HALF
          && grid.y >= GRID.ROWS - farSide;
      case 'north':
        return Math.abs(grid.x - Math.floor(GRID.COLS / 2)) <= RETURN_BAND_HALF
          && grid.y <= near;
      case 'west':
        return Math.abs(grid.y - Math.floor(GRID.ROWS / 2)) <= RETURN_BAND_HALF
          && grid.x <= near;
      case 'east':
        return Math.abs(grid.y - Math.floor(GRID.ROWS / 2)) <= RETURN_BAND_HALF
          && grid.x >= GRID.COLS - farSide;
      default:
        return false;
    }
  }

  /**
   * Handle player interaction with object in neutral room
   * @param {object} target - The object/entity being interacted with
   * @param {object} player - Player instance
   * @param {object} room - Current room
   * @returns {object|null} - Interaction result (e.g., spawnedItems)
   */
  /**
   * Walk back out of a neutral room into the room that was saved on the way in.
   *
   * Room CONTENTS only — the ingredient pile survives room transitions on its
   * own. The saved state also carries where the return leads: almost always
   * EXPLORE, but the Graveyard is the one neutral room entered by walking out
   * of REST, and it goes back to REST.
   *
   * The state machine is set directly rather than transitioned, because the
   * registered handler for either target rebuilds its room from scratch.
   * enterExploreState would read this as a fresh arrival from REST and
   * generate over the room just reinstated, stranding the player somewhere
   * unrelated; enterRestState would rebuild the hub and hand out a free heal
   * for the round trip.
   *
   * Bypassing them is also why the background is invalidated by hand here:
   * those handlers are the only places that do it, and the background layer is
   * cached, so the room being left would otherwise keep painting underneath
   * the room being restored.
   */
  returnToSavedRoom(game) {
    const saved = game.savedExploreState;

    if (saved) {
      game.currentRoom = saved.room;
      game.items = [...saved.items];
      game.ingredients = [...saved.ingredients];   // floor entities, not the pile
      game.placedTraps = [...saved.placedTraps];
      // The surface mirror main.js keeps beside currentRoom. Marked
      // layer-guard-ok because this is a room-swap restore, not a combat
      // spawn: no interior is ever live on this path, since a neutral room
      // has no hut, dungeon or maze to have been standing inside of.
      game.backgroundObjects = [...saved.backgroundObjects];   // layer-guard-ok
      game.captives = [...saved.captives];
      game.neutralCharacters = [...saved.neutralCharacters];

      // The center of the restored room, not the saved edge-of-room position,
      // which sits in the warp band that was just walked out of.
      game.player.position.x = Math.floor(GRID.COLS / 2) * GRID.CELL_SIZE;
      game.player.position.y = Math.floor(GRID.ROWS / 2) * GRID.CELL_SIZE;

      game.savedExploreState = null;
    }

    game.updateExitCollisions();
    game.renderer.markBackgroundDirty();
    game.stateMachine.currentState = saved?.returnState || GAME_STATES.EXPLORE;
  }

  handleInteraction(target, player, room) {
    if (!this.currentScript || !this.currentScript.onInteract) {
      return null;
    }

    return this.currentScript.onInteract(target, player, room, this.state);
  }

  /**
   * Update neutral room logic (called each frame)
   * @param {number} deltaTime - Time since last frame
   * @param {object} room - Current room
   * @param {object} player - Player instance
   */
  update(deltaTime, room, player) {
    if (!this.currentScript || !this.currentScript.onUpdate) {
      return;
    }

    this.currentScript.onUpdate(deltaTime, room, player, this.state);
  }

  /**
   * Called when exiting neutral room (cleanup)
   * @param {object} room - Current room
   * @param {object} player - Player instance
   */
  onExit(room, player) {
    if (this.currentScript && this.currentScript.onExit) {
      this.currentScript.onExit(room, player, this.state);
    }

    // Reset script and state
    this.currentScript = null;
    this.state = {};
  }

  /**
   * Create collision map for neutral room (empty 30x30 grid with walls)
   */
  createCollisionMap() {
    const map = [];
    for (let y = 0; y < GRID.ROWS; y++) {
      const row = [];
      for (let x = 0; x < GRID.COLS; x++) {
        // Walls on edges
        const isWall = x === 0 || x === GRID.COLS - 1 || y === 0 || y === GRID.ROWS - 1;
        row.push(isWall ? 1 : 0);
      }
      map.push(row);
    }
    return map;
  }
}
