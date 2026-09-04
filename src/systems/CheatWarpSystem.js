import { EXIT_LETTERS } from '../data/exitLetters.js';
import { ZONES } from '../data/zones.js';
import { GAME_STATES, GRID, ROOM_TYPES } from '../game/GameConfig.js';
import { Player } from '../entities/Player.js';

/**
 * CheatWarpSystem — the destinations the cheat menu can drop the player into.
 *
 * Every entry point here fabricates a room the player never walked to: a zone
 * jump, a depth jump, a boss arena, a specific room letter, or the maze test
 * room. They exist for manual testing only and are reached from the CheatMenu
 * result dispatch in setupInput (plus M in REST for the maze), which stays
 * dispatch-only.
 *
 * All of them share the same shape and the same hazard: a hand-built room is
 * not a naturally entered one, so each must reproduce what natural entry does.
 * `applyRoomSwap` is the shared tail that covers entity arrays, enemy wiring,
 * entry grace, and the physics/combat reset — never skip it. Zone/depth
 * bookkeeping is per-warp because each warp lies to the game about a different
 * thing.
 *
 * The precedent is DungeonSystem.debugWarpTo: a debug destination belongs with
 * the code that owns it, not in the orchestrator.
 */
export class CheatWarpSystem {
  /** Warps only make sense mid-run; REST would be overwritten by its own entry. */
  _requireExplore(game, label) {
    if (game.stateMachine.getCurrentState() === GAME_STATES.EXPLORE) return true;
    console.log(`[CHEAT] ⚠ ${label} only works during EXPLORE mode. Exit REST first.`);
    return false;
  }

  handleZoneTeleport(game, targetZone) {
    console.log(`[CHEAT] Teleporting to ${targetZone} zone`);

    // Only allow teleporting during EXPLORE state
    if (!this._requireExplore(game, 'Zone teleport')) return;

    // Force zone transition by populating path history with 3 consecutive exits of target zone color
    // This ensures checkZoneTransition() will return the correct zone
    const targetZoneColor = ZONES[targetZone].exitColor;
    game.zoneSystem.pathHistory = [
      { letter: 'X', color: targetZoneColor },
      { letter: 'X', color: targetZoneColor },
      { letter: 'X', color: targetZoneColor }
    ];
    game.zoneSystem.currentZone = targetZone;

    // Set zone depth: if first time in zone, start at 1; otherwise use current depth
    if (game.zoneDepths[targetZone] === 0) {
      game.zoneDepths[targetZone] = 1;
      console.log(`[CHEAT] First time in ${targetZone} zone - starting at Level 1`);
    }

    // Regenerate room with target zone's depth
    game.roomGenerator.setDepth(game.zoneDepths[targetZone]);
    const playerPos = { x: game.player.position.x, y: game.player.position.y };
    const newRoom = game.roomGenerator.generateRoom(
      null,
      playerPos,
      targetZone,
      null
    );

    // Replace current room — applyRoomSwap covers entity arrays, enemy
    // wiring, entry grace, and physics/combat reset (shared with natural entry)
    game.currentRoom = newRoom;
    game.player.setCollisionMap(newRoom.collisionMap);
    game.applyRoomSwap(newRoom);

    // Switch music if entering/leaving a zone with custom music
    game.audioSystem.switchZoneMusic(targetZone, import.meta.env.BASE_URL);

    // Update UI
    game.updateUI();

    console.log(`[CHEAT] ✓ Teleported to ${targetZone} zone at depth ${game.getCurrentZoneDepth()}`);
  }

  handleDepthJump(game, depth) {
    if (!this._requireExplore(game, 'Depth jump')) return;

    const currentZone = game.zoneSystem.currentZone;
    game.zoneDepths[currentZone] = depth;
    game.roomGenerator.setDepth(depth);
    game.preBossGateActive = false;
    game.preMinibossGateActive = false;
    game.bossSystem.deactivate();

    // Generate a fresh room at the target depth (same zone, no forced room type)
    const playerPos = { x: game.player.position.x, y: game.player.position.y };
    const newRoom = game.roomGenerator.generateRoom(null, playerPos, currentZone, null);

    // Replace current room — applyRoomSwap covers entity arrays, enemy
    // wiring, entry grace, and physics/combat reset (shared with natural entry)
    game.currentRoom = newRoom;
    game.player.setCollisionMap(newRoom.collisionMap);

    // Reset interior state
    game.interiorManager.reset();

    game.applyRoomSwap(newRoom);
    game.updateUI();

    console.log(`[CHEAT] ✓ Depth jump → L${depth} in ${currentZone} zone`);
  }

  handleBossTest(game, targetZone) {
    if (!this._requireExplore(game, 'Boss test')) return;

    // Deactivate any existing boss fight
    game.bossSystem.deactivate();

    // Set zone + depth so isBossReady() returns true
    game.zoneSystem.currentZone = targetZone;
    const bossDepth = ZONES[targetZone]?.bossDepth ?? 15;
    game.zoneDepths[targetZone] = bossDepth;
    game.roomGenerator.setDepth(bossDepth);

    // Generate boss room directly
    game.roomGenerator.isZoneBossRoom = true;
    const playerPos = { x: game.player.position.x, y: game.player.position.y };
    const newRoom = game.roomGenerator.generateRoom(ROOM_TYPES.BOSS, playerPos, targetZone, null);
    game.roomGenerator.isZoneBossRoom = false;

    // Replace current room — applyRoomSwap covers entity arrays, enemy
    // wiring, entry grace, and physics/combat reset (shared with natural entry)
    game.currentRoom = newRoom;
    game.player.setCollisionMap(newRoom.collisionMap);

    // Activate boss BEFORE the swap so any boss entities it adds to
    // newRoom.enemies get wired and physics-registered too
    game.bossSystem.activate(newRoom, targetZone);

    game.applyRoomSwap(newRoom);
    game.updateUI();

    console.log(`[CHEAT] ✓ Boss test: ${targetZone} zone boss spawned`);
  }

  handleRoomWarp(game, roomLetter) {
    console.log(`[CHEAT] Warping to room type: ${roomLetter}`);

    // Only allow warping during EXPLORE state
    if (!this._requireExplore(game, 'Room warp')) return;

    // Check if room letter is valid
    const letterData = EXIT_LETTERS[roomLetter];
    if (!letterData) {
      console.log(`[CHEAT] ⚠ Invalid room letter: ${roomLetter}`);
      return;
    }

    // Get current zone and depth
    const currentZone = game.zoneSystem.currentZone;
    const currentDepth = game.getCurrentZoneDepth();
    const progressionColor = game.zoneSystem.getProgressionColor();

    // Get room type from letter
    const roomType = ROOM_TYPES[letterData.roomType] || ROOM_TYPES.COMBAT;

    // Generate new room
    game.roomGenerator.setDepth(currentDepth);
    const playerPos = { x: game.player.position.x, y: game.player.position.y };
    const newRoom = game.roomGenerator.generateRoom(
      roomType,
      playerPos,
      currentZone,
      progressionColor,
      roomLetter
    );

    // Replace current room — applyRoomSwap covers entity arrays + room
    // attachments, enemy wiring, entry grace, and physics/combat reset
    // (shared with natural entry)
    game.currentRoom = newRoom;
    // Natural entry records the exit letter for letter-gated behaviors
    // (e.g. errand rooms check exitLetter === 'E')
    newRoom.exitLetter = roomLetter;

    // Apply room-declared spawn zone if present (e.g. underground clearings)
    if (newRoom.spawnZones) {
      const zone = newRoom.spawnZones.default;
      if (zone) {
        game.player.position.x = zone.x;
        game.player.position.y = zone.y;
      }
    }

    game.player.setCollisionMap(newRoom.collisionMap);
    game.applyRoomSwap(newRoom);

    // Preload room previews for exits
    game.preloadRoomPreviews();

    // Update UI
    game.updateUI();

    console.log(`[CHEAT] ✓ Warped to ${letterData.name} (${roomLetter}) - ${letterData.roomType}`);
  }

  /**
   * M in REST. Unlike the warps above this rebuilds the Player, so the loadout
   * has to be carried across the reconstruction by hand.
   */
  enterMazeTestRoom(game) {
    // Save player state (quick slots, HP)
    const savedQuickSlots = game.player ? [...game.player.quickSlots] : [null, null, null];
    const savedActiveSlotIndex = game.player ? game.player.activeSlotIndex : 0;
    const savedHp = game.player ? game.player.hp : null;
    const savedDestroyedSlots = game.player ? [...game.player.destroyedSlots] : [...game._savedDestroyedSlots];

    // Generate maze room first
    const centerX = GRID.WIDTH / 2;
    const startY = (GRID.ROWS - 3) * GRID.CELL_SIZE;
    game.currentRoom = game.roomGenerator.generateRoom(ROOM_TYPES.MAZE, { x: centerX, y: startY });

    // Create player at south entrance
    game.player = new Player(centerX, startY);
    game.player.godMode = game.cheatMenu.godMode;
    game.player.setCollisionMap(game.currentRoom.collisionMap);

    // Restore state
    game.player.quickSlots = savedQuickSlots;
    game.player.activeSlotIndex = savedActiveSlotIndex;
    game.player.destroyedSlots = savedDestroyedSlots;
    if (savedHp !== null) game.player.hp = savedHp;

    // Room-swap core: entity arrays, enemy wiring, entry grace, physics/combat
    // reset (shared with natural entry and all warp paths)
    game.applyRoomSwap(game.currentRoom);

    // Set state directly (don't call transition - that would trigger enterExploreState and overwrite our maze!)
    game.stateMachine.currentState = GAME_STATES.EXPLORE;
  }
}
