import { GRID, ROOM_TYPES } from '../game/GameConfig.js';
import { NEUTRAL_ROOMS } from '../data/neutralRooms.js';

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
   * @returns {object} - Room object with exits, backgroundObjects, state
   */
  generateNeutralRoom(scriptName) {
    const script = NEUTRAL_ROOMS[scriptName];
    if (!script) {
      console.error(`[NeutralRoomSystem] Script not found: ${scriptName}`);
      return null;
    }

    this.currentScript = script;
    this.state = {}; // Reset state for new room

    // Create base room structure (always has south exit for return)
    const room = {
      type: ROOM_TYPES.DISCOVERY, // Neutral rooms use discovery room type
      depth: 0, // Neutral rooms don't count toward depth
      zone: 'neutral',
      borderColor: '#00ff00',
      collisionMap: this.createCollisionMap(),
      enemies: [],
      items: [],
      backgroundObjects: [],
      exits: { north: false, east: false, west: false, south: true },
      exitsLocked: false,
      cleared: true // Always cleared (no enemies)
    };

    // Call script's onGenerate hook
    if (script.onGenerate) {
      script.onGenerate(room, this.state);
    }

    return room;
  }

  /**
   * Handle player interaction with object in neutral room
   * @param {object} target - The object/entity being interacted with
   * @param {object} player - Player instance
   * @param {object} room - Current room
   * @returns {object|null} - Interaction result (e.g., spawnedItems)
   */
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
