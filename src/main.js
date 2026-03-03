import { GameLoop } from './game/GameLoop.js';
import { GameStateMachine } from './game/GameStateMachine.js';
import { ASCIIRenderer } from './rendering/ASCIIRenderer.js';
import { RenderController } from './rendering/RenderController.js';
import { PhysicsSystem } from './systems/PhysicsSystem.js';
import { CraftingSystem } from './systems/CraftingSystem.js';
import { CombatSystem } from './systems/CombatSystem.js';
import { RoomGenerator } from './systems/RoomGenerator.js';
import { ZoneSystem } from './systems/ZoneSystem.js';
import { ExitSystem } from './systems/ExitSystem.js';
import { PersistenceSystem } from './systems/PersistenceSystem.js';
import { InventorySystem } from './systems/InventorySystem.js';
import { NeutralRoomSystem } from './systems/NeutralRoomSystem.js';
import { CheatMenu } from './systems/CheatMenu.js';
import { AudioSystem } from './systems/AudioSystem.js';
import { Player } from './entities/Player.js';
import { Enemy } from './entities/Enemy.js';
import { Ingredient } from './entities/Ingredient.js';
import { Item } from './entities/Item.js';
import { BackgroundObject } from './entities/BackgroundObject.js';
import { GooBlob } from './entities/GooBlob.js';
import { Particle, createExplosion, createWetDrop, createActivationBurst, createSteamPuff, createChaff, createDodgeTrail } from './entities/Particle.js';
import { createDebris } from './entities/Debris.js';
import { Captive } from './entities/Captive.js';
import { Leshy } from './entities/Leshy.js';
import { CharacterNPC } from './entities/CharacterNPC.js';
import { isIngredient, isItem, ITEM_TYPES, generateEnemyDrops, INGREDIENTS, ITEMS } from './data/items.js';
import { findRecipeByResult } from './data/recipes.js';
import { CHARACTER_TYPES } from './data/characters.js';
import { EXIT_LETTERS } from './data/exitLetters.js';
import { ZONES } from './data/zones.js';
import { GAME_STATES, GRID, CRAFTING, EQUIPMENT, COLORS, INTERACTION_RANGE, OBJECT_ANIMATIONS, ROOM_TYPES, POLYMORPH_OUTCOMES } from './game/GameConfig.js';

class Game {
  constructor() {
    // Get canvas elements
    const bgCanvas = document.getElementById('background-layer');
    const fgCanvas = document.getElementById('foreground-layer');

    // Initialize systems
    this.renderer = new ASCIIRenderer(bgCanvas, fgCanvas);
    this.renderController = new RenderController(this.renderer);
    this.stateMachine = new GameStateMachine();
    this.physicsSystem = new PhysicsSystem();
    this.craftingSystem = new CraftingSystem();
    this.combatSystem = new CombatSystem(this.physicsSystem);
    this.zoneSystem = new ZoneSystem();
    this.exitSystem = new ExitSystem(this.zoneSystem);
    this.roomGenerator = new RoomGenerator(this.exitSystem, this.zoneSystem);
    this.neutralRoomSystem = new NeutralRoomSystem();
    this.cheatMenu = new CheatMenu(this);
    this.persistenceSystem = new PersistenceSystem();
    this.inventorySystem = new InventorySystem();
    this.audioSystem = new AudioSystem();

    // Game state
    this.player = null;
    this.previousPlayerPosition = { x: 0, y: 0 }; // Track previous position for exit zone crossing detection
    this.currentRoom = null;
    this.ingredients = [];
    this.items = [];
    this.placedTraps = []; // Placed trap items { item, tickTimer, activeDuration, affectedEnemies }
    this.activeNoiseSource = null; // Set each frame by updatePlacedTraps if noise-maker is active
    this.backgroundObjects = [];
    this.steamClouds = []; // Steam clouds from fire+water and Steam Vial
    this.particles = []; // Explosion particles
    this.debris = []; // Enemy debris
    this.gooBlobs = []; // Goo blobs from Goo Dispenser
    this.neutralCharacters = []; // Neutral entities (Leshy, NPCs, etc.)

    // Per-zone depth tracking (independent progression)
    this.zoneDepths = {
      green: 0,
      red: 0,
      cyan: 0,
      yellow: 0,
      gray: 0
    };

    this.gameOverWaitingForSpace = false;
    this.gameOverDeathTimer = 0; // Timer for 2-second delay before showing "Press SPACE"
    this.dodgeBlockedFeedbackTimer = 0; // Cooldown for red X feedback
    this.showVectors = false; // Debug: Toggle with 'v' key

    // ALL INVENTORY STATE NOW IN InventorySystem
    // Access via: this.inventorySystem.property

    // Blessings (permanent buffs)
    this.blessingsCollected = [];

    // Room preview state
    this.roomPreviews = {
      north: null,  // { type: ROOM_TYPES.COMBAT, char: 'B', name: 'Combat' }
      east: null,
      west: null,
      south: null
    };

    // Blinking animation state
    this.previewBlinkTimer = 0;
    this.previewBlinkState = false; // true = show preview, false = show arrow
    this.PREVIEW_BLINK_INTERVAL = 0.5; // seconds per blink cycle

    // Secret event particle timers
    this.glitterTimer = 0;
    this.GLITTER_SPAWN_INTERVAL = 3.0; // Spawn glitter particles every 3 seconds

    // WASD inactivity blinking
    this.inactivityTimer = 0;
    this.wasdBlinkTimer = 0;
    this.wasdBlinkState = false; // true = white, false = normal
    this.INACTIVITY_THRESHOLD = 10.0; // seconds before blinking starts
    this.WASD_BLINK_INTERVAL = 0.5; // seconds per blink cycle

    // Item pickup notification with queue system
    this.pickupMessage = null;
    this.pickupMessageTimer = 0;
    this.pickupMessageQueue = []; // Queue for multiple pickups
    this.PICKUP_MESSAGE_DURATION = 2.0; // seconds

    // Path announcement system (for Path Amulet)
    this.pathAnnouncement = null;
    this.pathAnnouncementTimer = 0;
    this.PATH_ANNOUNCEMENT_DURATION = 3.0; // seconds

    // Character system (captives and character types)
    this.exitPathHistory = []; // Track exit letters chosen (future: for Week 4 secret patterns)
    this.unlockedCharacters = ['default']; // All unlocked character types
    this.activeCharacterType = 'default'; // Currently playing as this character
    this.deadCharacters = []; // Characters that have died (can't be used again this run)
    this.captives = []; // Active captives in current room
    this.characterNPCs = []; // Character NPCs in REST mode

    // Input state
    this.keys = {
      w: false, a: false, s: false, d: false,
      space: false, shift: false, i: false,
      q: false, e: false, m: false, v: false
    };
    this.spacePressed = false;
    this.shiftPressed = false;
    this.qPressed = false;
    this.ePressed = false;
    this.mPressed = false;
    this.vPressed = false;
    this.attackSequenceActive = false; // Tracks if attack was initiated by button press (not just hold)

    // Arrow keys for dodge rolling
    this.arrowKeys = {
      ArrowUp: false,
      ArrowDown: false,
      ArrowLeft: false,
      ArrowRight: false
    };

    // UI elements
    this.ui = {
      hp: document.getElementById('hp-value'),
      depth: document.getElementById('depth-value'),
      inventory: document.getElementById('inventory-count'),
      heldItem: document.getElementById('held-item'),
      menu: document.getElementById('menu-overlay'),
      armorChar: document.getElementById('armor-char'),
      consumableChar1: document.getElementById('consumable-char-1'),
      consumableChar2: document.getElementById('consumable-char-2')
    };

    // Menu state
    this.menuOpen = false;
    this.menuItems = [];
    this.selectedMenuIndex = 0;
    this.currentMenuSlot = null; // 'left' or 'right'
    // Multi-column menu support (viewport shows 3 at a time with active centered)
    this.menuColumns = null; // [weaponsList, armorList, ingredientList?, consumableList]
    this.selectedColumn = 2; // Default to ingredients column
    this.disabledColumns = []; // Which columns are disabled

    // Title screen state
    this.titleAnimationTime = 0;
    this.introAnimationStarted = false; // Tracks if user has started the intro
    this.launchButtonBounds = null; // Set by TitleRenderer for click detection

    // Setup
    this.setupInput();
    this.setupStateMachine();
    this.loadGame();

    // Start game loop
    this.gameLoop = new GameLoop(
      (dt) => this.update(dt),
      (alpha) => this.render(alpha)
    );
    this.gameLoop.start();
  }

  setupInput() {
    window.addEventListener('keydown', (e) => {
      // Handle cheat menu toggle (backslash key)
      if (e.key === '\\') {
        this.cheatMenu.toggle();
        e.preventDefault();
        return;
      }

      // Handle cheat menu input
      if (this.cheatMenu.isOpen) {
        const result = this.cheatMenu.handleInput(e.key);
        if (result === 'handled') {
          e.preventDefault();
          return;
        } else if (result && result.action === 'spawn') {
          this.spawnCheatItem(result.item);
          e.preventDefault();
          return;
        } else if (result && result.action === 'teleport_zone') {
          this.handleZoneTeleport(result.zone);
          this.cheatMenu.toggle(); // Close menu after teleport
          e.preventDefault();
          return;
        } else if (result && result.action === 'warp') {
          this.handleRoomWarp(result.roomLetter);
          this.cheatMenu.toggle(); // Close menu after warp
          e.preventDefault();
          return;
        }
      }

      // Handle menu navigation
      if (this.menuOpen) {
        const key = e.key.toLowerCase();

        // A/D or ArrowLeft/Right for column switching (circular navigation)
        if (this.menuColumns && (key === 'a' || e.key === 'ArrowLeft')) {
          // Move left with wrapping, skipping disabled columns
          let newColumn = this.selectedColumn - 1;
          let attempts = 0;
          const maxColumns = this.menuColumns.length;

          while (attempts < maxColumns) {
            if (newColumn < 0) newColumn = maxColumns - 1; // Wrap to end
            if (!this.disabledColumns[newColumn]) break;
            newColumn--;
            attempts++;
          }

          if (attempts < maxColumns) {
            this.selectedColumn = newColumn;
            this.selectedMenuIndex = 0;
            this.menuItems = this.menuColumns[this.selectedColumn];
            this.renderController.menuOverlay.render(this);
          }
          e.preventDefault();
          return;
        }
        if (this.menuColumns && (key === 'd' || e.key === 'ArrowRight')) {
          // Move right with wrapping, skipping disabled columns
          let newColumn = this.selectedColumn + 1;
          let attempts = 0;
          const maxColumns = this.menuColumns.length;

          while (attempts < maxColumns) {
            if (newColumn >= maxColumns) newColumn = 0; // Wrap to start
            if (!this.disabledColumns[newColumn]) break;
            newColumn++;
            attempts++;
          }

          if (attempts < maxColumns) {
            this.selectedColumn = newColumn;
            this.selectedMenuIndex = 0;
            this.menuItems = this.menuColumns[this.selectedColumn];
            this.renderController.menuOverlay.render(this);
          }
          e.preventDefault();
          return;
        }

        // WASD + Arrow key navigation (W/ArrowUp=up, S/ArrowDown=down)
        if (key === 'w' || e.key === 'ArrowUp') {
          this.selectedMenuIndex = Math.max(0, this.selectedMenuIndex - 1);
          this.renderController.menuOverlay.render(this);
          e.preventDefault();
          return;
        }
        if (key === 's' || e.key === 'ArrowDown') {
          this.selectedMenuIndex = Math.min(this.menuItems.length - 1, this.selectedMenuIndex + 1);
          this.renderController.menuOverlay.render(this);
          e.preventDefault();
          return;
        }

        // Space to confirm selection
        if (key === ' ') {
          this.selectMenuItem();
          e.preventDefault();
          return;
        }

        // Shift to close menu
        if (key === 'shift') {
          this.closeMenu();
          e.preventDefault();
          return;
        }

        // Block all other keys when menu is open
        e.preventDefault();
        return;
      }

      const key = e.key.toLowerCase();
      if (key === 'w' || key === 'a' || key === 's' || key === 'd') {
        this.keys[key] = true;
      }
      if (key === 'i') {
        this.keys.i = true;
      }
      if (key === ' ') {
        this.keys.space = true;
        if (!this.spacePressed) {
          this.spacePressed = true;
          this.handleSpacePress();
        }
      }
      if (key === 'shift') {
        this.keys.shift = true;
        if (!this.shiftPressed) {
          this.shiftPressed = true;
          this.handleShiftPress();
        }
      }
      if (key === 'q') {
        this.keys.q = true;
        if (!this.qPressed) {
          this.qPressed = true;
          this.handleCyclePrevious();
        }
      }
      if (key === 'e') {
        this.keys.e = true;
        if (!this.ePressed) {
          this.ePressed = true;
          this.handleCycleNext();
        }
      }
      if (key === 'm') {
        this.keys.m = true;
        if (!this.mPressed) {
          this.mPressed = true;
          this.handleMPress();
        }
      }
      if (key === 'v') {
        this.keys.v = true;
        if (!this.vPressed) {
          this.vPressed = true;
          this.handleVPress();
        }
      }

      // Arrow keys for dodge rolling (works in both REST and EXPLORE)
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown' ||
          e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        this.arrowKeys[e.key] = true;
        e.preventDefault();
      }
    });

    window.addEventListener('keyup', (e) => {
      const key = e.key.toLowerCase();
      if (key === 'w' || key === 'a' || key === 's' || key === 'd') {
        this.keys[key] = false;
      }
      if (key === 'i') {
        this.keys.i = false;
      }
      if (key === ' ') {
        this.keys.space = false;
        this.spacePressed = false;
        this.attackSequenceActive = false; // Reset attack sequence on space release

        // Release charged bow when space is released
        if (this.player && this.player.heldItem && this.player.heldItem.isCharging) {
          // Stop the bowstring charge sound regardless of whether the shot fires
          this.audioSystem.stopSFXByName('charge_bow');
          if (this.player.canAttack()) {
            const attack = this.player.heldItem.releaseBow();
            if (attack) {
              this.combatSystem.createAttack(this.applyGreenDamageModifier(attack), this.currentRoom ? this.currentRoom.enemies : []);
              this.triggerGreenActionCooldown();
            }
          }
        }
      }
      if (key === 'shift') {
        this.keys.shift = false;
        this.shiftPressed = false;
      }
      if (key === 'q') {
        this.keys.q = false;
        this.qPressed = false;
      }
      if (key === 'e') {
        this.keys.e = false;
        this.ePressed = false;
      }
      if (key === 'm') {
        this.keys.m = false;
        this.mPressed = false;
      }
      if (key === 'v') {
        this.keys.v = false;
        this.vPressed = false;
      }

      // Arrow key releases
      if (e.key.startsWith('Arrow')) {
        this.arrowKeys[e.key] = false;
      }
    });

    // Click handler for launch button on title screen
    window.addEventListener('click', (e) => {
      const state = this.stateMachine.getCurrentState();

      // Only handle clicks on title screen
      if (state === GAME_STATES.TITLE && this.launchButtonBounds) {
        // Get canvas position
        const canvas = document.getElementById('foreground-layer');
        const rect = canvas.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const clickY = e.clientY - rect.top;

        // Check if click is within button bounds
        const bounds = this.launchButtonBounds;
        if (clickX >= bounds.x && clickX <= bounds.x + bounds.width &&
            clickY >= bounds.y && clickY <= bounds.y + bounds.height) {
          if (!this.introAnimationStarted) {
            // Start the intro animation and music together
            this.introAnimationStarted = true;
            this.audioSystem.play();
            this.renderer.markBackgroundDirty();
          } else {
            // Animation is playing, skip to REST (music continues)
            this.stateMachine.transition(GAME_STATES.REST);
          }
        }
      }
    });

    // Mousemove handler for cursor styling on title screen
    window.addEventListener('mousemove', (e) => {
      const state = this.stateMachine.getCurrentState();
      const canvas = document.getElementById('foreground-layer');

      // Only update cursor on title screen
      if (state === GAME_STATES.TITLE && this.launchButtonBounds) {
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // Check if mouse is within button bounds
        const bounds = this.launchButtonBounds;
        if (mouseX >= bounds.x && mouseX <= bounds.x + bounds.width &&
            mouseY >= bounds.y && mouseY <= bounds.y + bounds.height) {
          canvas.style.cursor = 'pointer';
        } else {
          canvas.style.cursor = 'default';
        }
      } else {
        canvas.style.cursor = 'default';
      }
    });
  }

  // Get current dodge roll direction from arrow key state
  getDodgeRollDirection() {
    let dx = 0, dy = 0;

    if (this.arrowKeys.ArrowUp) dy -= 1;
    if (this.arrowKeys.ArrowDown) dy += 1;
    if (this.arrowKeys.ArrowLeft) dx -= 1;
    if (this.arrowKeys.ArrowRight) dx += 1;

    // Normalize for consistent speed in all directions (diagonal = same speed as cardinal)
    const length = Math.sqrt(dx * dx + dy * dy);
    if (length > 0) {
      dx /= length;
      dy /= length;
    }

    return { x: dx, y: dy };
  }

  setupStateMachine() {
    // Register state handlers
    this.stateMachine.registerStateHandler(GAME_STATES.TITLE, () => {
      this.enterTitleState();
    });

    this.stateMachine.registerStateHandler(GAME_STATES.REST, () => {
      this.enterRestState();
    });

    this.stateMachine.registerStateHandler(GAME_STATES.EXPLORE, () => {
      this.enterExploreState();
    });

    this.stateMachine.registerStateHandler(GAME_STATES.NEUTRAL, () => {
      this.enterNeutralState();
    });

    this.stateMachine.registerStateHandler(GAME_STATES.GAME_OVER, () => {
      this.enterGameOverState();
    });
  }

  getNearestInteractiveSlot() {
    if (!this.player) return null;

    const gridPos = this.player.getGridPosition();
    const INTERACTION_DISTANCE = 1.5; // Grid cells

    // Define all interactive slots with their positions
    const slots = [
      { type: 'crafting-left', x: CRAFTING.LEFT_SLOT_X, y: CRAFTING.STATION_Y },
      { type: 'crafting-center', x: CRAFTING.CENTER_SLOT_X, y: CRAFTING.STATION_Y },
      { type: 'crafting-right', x: CRAFTING.RIGHT_SLOT_X, y: CRAFTING.STATION_Y },
      { type: 'equipment-chest', x: EQUIPMENT.CHEST_X, y: EQUIPMENT.CHEST_Y },
      { type: 'equipment-armor', x: EQUIPMENT.ARMOR_X, y: EQUIPMENT.ARMOR_Y },
      { type: 'equipment-consumable1', x: EQUIPMENT.CONSUMABLE1_X, y: EQUIPMENT.CONSUMABLE1_Y },
      { type: 'equipment-consumable2', x: EQUIPMENT.CONSUMABLE2_X, y: EQUIPMENT.CONSUMABLE2_Y }
    ];

    // Find the closest slot within interaction distance
    let nearestSlot = null;
    let minDistance = INTERACTION_DISTANCE;

    for (const slot of slots) {
      const dx = gridPos.x - slot.x;
      const dy = gridPos.y - slot.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < minDistance) {
        minDistance = distance;
        nearestSlot = slot;
      }
    }

    return nearestSlot;
  }

  showPickupMessage(itemName) {
    // Add to queue
    this.pickupMessageQueue.push(itemName.toUpperCase());

    // If no message is currently showing, start showing the first one
    if (!this.pickupMessage) {
      this.showNextPickupMessage();
    }
  }

  showNextPickupMessage() {
    if (this.pickupMessageQueue.length > 0) {
      this.pickupMessage = this.pickupMessageQueue.shift();
      this.pickupMessageTimer = this.PICKUP_MESSAGE_DURATION;
    } else {
      this.pickupMessage = null;
      this.pickupMessageTimer = 0;
    }
  }

  // Zone depth helpers
  getCurrentZoneDepth() {
    const zone = this.zoneSystem.currentZone;
    return this.zoneDepths[zone] || 0;
  }

  incrementZoneDepth() {
    const zone = this.zoneSystem.currentZone;
    if (this.zoneDepths[zone] === 0) {
      this.zoneDepths[zone] = 1; // First entry to zone
    } else {
      this.zoneDepths[zone]++;
    }
  }

  loadGame() {
    // localStorage persistence disabled - always start fresh
    // const savedData = this.persistenceSystem.loadRestState();
    // if (savedData && savedData.characters) {
    //   this.unlockedCharacters = savedData.characters.unlocked || ['default'];
    //   this.activeCharacterType = savedData.characters.active || 'default';
    //   this.deadCharacters = savedData.characters.dead || [];
    //   this.captiveQueue = savedData.characters.queue || ['red', 'cyan', 'yellow', 'gray'];
    //   console.log('[loadGame] Restored unlocked characters:', this.unlockedCharacters);
    //   console.log('[loadGame] Dead characters:', this.deadCharacters);
    // }

    // Clear any persisted save on load - always start fresh on refresh
    this.persistenceSystem.clearSave();

    // All zone depths start at 0 on page load
    this.zoneDepths = {
      green: 0,
      red: 0,
      cyan: 0,
      yellow: 0,
      gray: 0
    };

    // Start in TITLE state
    this.stateMachine.transition(GAME_STATES.TITLE);
  }

  enterTitleState() {
    // No player needed for title screen
    this.player = null;
    this.renderer.markBackgroundDirty();

    // Initialize title animation timer and button bounds
    this.titleAnimationTime = 0;
    this.introAnimationStarted = false; // Start with pre-intro screen
    this.launchButtonBounds = null; // Will be set by TitleRenderer

    // Load title screen music (single track with custom loop point)
    this.audioSystem.loadSingleTrack(`${import.meta.env.BASE_URL}assets/audio/intro-loop.mp3`, 8.998, 0.7);
  }

  enterRestState() {
    // Note: exitPathHistory persists for future secret pattern tracking

    // Clear title screen state
    this.launchButtonBounds = null;

    // Transition from title music to gameplay music (only on first REST entry)
    if (this.audioSystem.mode === 'single') {
      console.log('[Audio] Transitioning from title music to gameplay music');
      this.audioSystem.stop();
      const base = import.meta.env.BASE_URL;
      this.audioSystem.loadMusic(
        `${base}assets/audio/layer1.mp3`,
        `${base}assets/audio/layer2.mp3`,
        0.7
      ).then(() => {
        this.audioSystem.play();
        // Load sound effects
        this.audioSystem.loadSFX('aggro', `${base}assets/audio/sfx-aggro.mp3`);
        this.audioSystem.loadSFX('destroy', `${base}assets/audio/sfx-destroy.mp3`);
        this.audioSystem.loadSFX('roll', `${base}assets/audio/sfx-roll.mp3`);
        this.audioSystem.loadSFX('attack_blade', `${base}assets/audio/sfx-attack-blade.mp3`);
        this.audioSystem.loadSFX('attack_whip', `${base}assets/audio/sfx-attack-whip.mp3`);
        this.audioSystem.loadSFX('charge_bow', `${base}assets/audio/sfx-charge-bow.mp3`);
      });
    }

    // Reset zone system on rest
    this.zoneSystem.resetOnRest();

    // Create player near north entrance
    const centerX = GRID.WIDTH / 2;
    const spawnY = GRID.CELL_SIZE * 3; // Near the north exit
    this.player = new Player(centerX, spawnY);

    // Apply active character type
    this.applyCharacterType(this.activeCharacterType);

    // Restore safe REST inventory and quick slots (not lost on death)
    this.player.inventory = [...this.inventorySystem.restInventory];
    this.player.quickSlots = [...this.inventorySystem.restQuickSlots];
    this.player.activeSlotIndex = this.inventorySystem.restActiveSlotIndex;

    // Create basic REST room with collision map (walls on all borders except north exit)
    const collisionMap = [];
    for (let y = 0; y < GRID.ROWS; y++) {
      collisionMap[y] = [];
      for (let x = 0; x < GRID.COLS; x++) {
        collisionMap[y][x] = false;
      }
    }

    // Add border walls
    for (let x = 0; x < GRID.COLS; x++) {
      collisionMap[0][x] = true; // Top wall
      collisionMap[GRID.ROWS - 1][x] = true; // Bottom wall
    }
    for (let y = 0; y < GRID.ROWS; y++) {
      collisionMap[y][0] = true; // Left wall
      collisionMap[y][GRID.COLS - 1] = true; // Right wall
    }

    // Open north exit (center of top wall)
    const centerGridX = Math.floor(GRID.COLS / 2);
    collisionMap[0][centerGridX] = false;

    // Create minimal REST room object
    this.currentRoom = {
      collisionMap: collisionMap,
      exits: { north: true, south: false, east: false, west: false },
      enemies: [],
      backgroundObjects: []
    };

    // Set player collision map
    this.player.setCollisionMap(collisionMap);

    this.items = [];
    this.placedTraps = [];
    this.activeNoiseSource = null;

    // Restore REST ingredients from saved state (persists between REST visits)
    const savedRestIngredients = this.inventorySystem.getSavedRestIngredients();
    if (savedRestIngredients.length > 0) {
      // Restore previously saved REST ingredients
      this.ingredients = savedRestIngredients;
    } else {
      // First time in REST - create starting ingredients on the ground
      this.ingredients = [];
      const isFirstRun = Object.values(this.zoneDepths).every(depth => depth === 0);
      if (isFirstRun) {
        // Place starting ingredients on the ground (not in player inventory)
        const startX = centerX - 100;
        const startY = GRID.HEIGHT / 2 + 60; // Below crafting slots

        // 2 of each ingredient allows for multiple crafting experiments
        const startingIngredients = [
          { char: '|', x: startX, y: startY },           // Stick
          { char: '|', x: startX + 40, y: startY },      // Farther apart horizontally
          { char: '~', x: startX + 80, y: startY },      // String
          { char: '~', x: startX + 120, y: startY },
          { char: 'g', x: startX, y: startY + 20 },      // Goo
          { char: 'g', x: startX + 40, y: startY + 20 },
          { char: 'f', x: startX + 80, y: startY + 20 }, // Fur
          { char: 'f', x: startX + 120, y: startY + 20 }
        ];

        for (const ing of startingIngredients) {
          const ingredient = new Ingredient(ing.char, ing.x, ing.y);
          this.ingredients.push(ingredient);
        }
      }
    }

    // Spawn character NPCs (other unlocked characters standing around)
    this.spawnCharacterNPCs();

    // Reset physics
    this.physicsSystem.clear();
    this.physicsSystem.addEntity(this.player);

    // Add REST ingredients to physics system
    for (const ingredient of this.ingredients) {
      this.physicsSystem.addEntity(ingredient);
    }

    // Mark background dirty
    this.renderer.markBackgroundDirty();

    // Mute layer 2 (bassline) in REST mode
    this.audioSystem.setLayer2Enabled(false);

    // Save state
    this.saveGameState();

    this.updateUI();
  }

  saveGameState() {
    // localStorage persistence disabled - no saving
    // const characterData = {
    //   unlocked: this.unlockedCharacters,
    //   active: this.activeCharacterType,
    //   dead: this.deadCharacters,
    //   queue: this.captiveQueue
    // };
    // this.persistenceSystem.saveRestState(this.craftingSystem, characterData);
  }

  applyEquipmentEffects() {
    this.inventorySystem.applyEquipmentEffectsToPlayer(this.player);
  }

  canUnlockVault() {
    // Only check in EXPLORE mode with a current room and vault
    const state = this.stateMachine.getCurrentState();
    if (state !== GAME_STATES.EXPLORE || !this.currentRoom || !this.currentRoom.vaultInfo) {
      return false;
    }

    const vault = this.currentRoom.vaultInfo;

    // Check if vault is already unlocked
    if (vault.unlocked) {
      return false;
    }

    // Check if player has the vault key equipped (in active quick slot)
    const hasKey = this.player.heldItem && this.player.heldItem.char === '߃';
    if (!hasKey) {
      return false;
    }

    // Player must be SOUTH (outside) of the bottom wall and horizontally centered
    const playerGridX = Math.floor(this.player.position.x / GRID.CELL_SIZE);
    const playerGridY = Math.floor(this.player.position.y / GRID.CELL_SIZE);

    const isSouthOfVault = playerGridY > vault.bottomWallRow; // Player is below/south of the wall
    const distanceToCenter = Math.abs(playerGridX - vault.centerCol);
    const maxCenterDist = vault.size / 2 + 2; // Lenient horizontal range
    const isNearCenter = distanceToCenter <= maxCenterDist;

    if (isSouthOfVault && isNearCenter) {
      return true;
    } else {
      return false;
    }
  }

  unlockVault() {
    const vault = this.currentRoom.vaultInfo;
    if (!vault || vault.unlocked) return;

    // Remove bottom wall from collision map
    const bottomRow = vault.bottomWallRow;
    for (let col = vault.minCol; col <= vault.maxCol; col++) {
      this.currentRoom.collisionMap[bottomRow][col] = false;
    }

    // Mark vault as unlocked
    vault.unlocked = true;

    // Remove key from active quick slot (consumed)
    if (this.player.heldItem && this.player.heldItem.char === '߃') {
      this.player.quickSlots[this.player.activeSlotIndex] = null;

      // Auto-switch to next filled slot if available
      const nextFilled = this.player.quickSlots.findIndex((slot, idx) =>
        idx !== this.player.activeSlotIndex && slot !== null
      );
      if (nextFilled !== -1) {
        this.player.activeSlotIndex = nextFilled;
      }
    }

    // Mark background dirty to show wall removal
    this.renderer.markBackgroundDirty();

    // Visual feedback - create some debris particles
    const centerX = vault.centerCol * GRID.CELL_SIZE + (GRID.CELL_SIZE / 2);
    const bottomY = bottomRow * GRID.CELL_SIZE + (GRID.CELL_SIZE / 2);

    for (let i = 0; i < 10; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 50 + Math.random() * 50;
      const particle = new Particle(
        centerX,
        bottomY,
        '#',                    // char
        '#888888',              // color
        {                       // velocity
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed
        },
        0.8                     // lifetime
      );
      this.particles.push(particle);
    }
  }

  updateSecretEventEffects(deltaTime) {
    if (!this.currentRoom) return;

    // Update glitter timer
    this.glitterTimer += deltaTime;

    // Spawn glitter particles periodically
    if (this.glitterTimer >= this.GLITTER_SPAWN_INTERVAL) {
      this.glitterTimer = 0;

      // Find all glittering objects
      const glitteringObjects = this.currentRoom.backgroundObjects.filter(obj => obj.isGlittering);

      for (const obj of glitteringObjects) {
        // Spawn 1-2 glitter particles around the object
        const particleCount = Math.random() < 0.5 ? 1 : 2;

        for (let i = 0; i < particleCount; i++) {
          // Random position around object (within 1 cell radius)
          const angle = Math.random() * Math.PI * 2;
          const distance = Math.random() * GRID.CELL_SIZE * 0.5;
          const offsetX = Math.cos(angle) * distance;
          const offsetY = Math.sin(angle) * distance;

          // Upward float with slight horizontal drift
          const vx = (Math.random() - 0.5) * 20; // Small horizontal drift
          const vy = -30 - Math.random() * 20;   // Upward float

          const glitter = new Particle(
            obj.position.x + offsetX,
            obj.position.y + offsetY,
            '*',                        // char
            obj.glitterColor || '#ffaa00', // color
            { vx, vy },                 // velocity object
            0.8 + Math.random() * 0.4   // lifetime
          );

          this.particles.push(glitter);
        }
      }
    }

    // TODO: Add other secret event effects here
    // - Shaking animation for leshy bushes
    // - Pulsing glow for treasure
    // - etc.
  }

// Character system methods
  applyCharacterType(type) {
    const charData = CHARACTER_TYPES[type];
    if (!charData) {
      console.error(`Unknown character type: ${type}`);
      return;
    }

    // Switch inventory system to this character's banked inventory
    this.inventorySystem.setActiveCharacter(type);

    // Update player visual
    this.player.color = charData.color;
    this.player.baseColor = charData.color; // Store base color for status blinking

    // Update dodge roll properties
    this.player.dodgeRoll.type = charData.rollType;
    this.player.dodgeRoll.duration = charData.rollDuration;
    this.player.dodgeRoll.cooldown = charData.rollCooldown;
    this.player.dodgeRoll.speed = charData.rollSpeed;

    // Apply weapon affinities
    this.player.weaponAffinities = charData.weaponAffinities;

    // Store character type and apply character-specific properties
    this.player.characterType = type;
    this.player.actionCooldownMax = charData.actionCooldownMax || 0;
    this.player.greenIdleDamageBonus = charData.idleDamageBonus || 0;
    this.player.greenCombatDamagePenalty = charData.combatDamagePenalty || 0;
    // Reset green ranger state when switching characters
    this.player.actionCooldown = 0;
    this.player.continuousRollActive = false;

  }

  // Applies green ranger's conditional +2/-1 damage modifier to an attack object or array
  applyGreenDamageModifier(attack) {
    if (this.activeCharacterType !== 'green' || !attack) return attack;
    const enemies = this.currentRoom ? this.currentRoom.enemies : [];
    const bonus = this.player.getCharacterDamageBonus(enemies);
    if (Array.isArray(attack)) {
      return attack.map(a => ({ ...a, damage: Math.max(1, (a.damage || 1) + bonus) }));
    }
    return { ...attack, damage: Math.max(1, (attack.damage || 1) + bonus) };
  }

  // Starts the green ranger's shared action cooldown after an attack fires
  triggerGreenActionCooldown() {
    if (this.activeCharacterType === 'green' && this.player) {
      this.player.actionCooldown = this.player.actionCooldownMax;
    }
  }

  // Play attack SFX based on weapon type (blade or whip)
  playWeaponAttackSFX(weapon) {
    if (!weapon) return;
    if (weapon.data.isBlade) {
      this.audioSystem.playSFX('attack_blade');
    } else if (weapon.data.attackPattern === 'whipcrack') {
      this.audioSystem.playSFX('attack_whip');
    }
  }

  spawnCharacterNPCs() {
    // Clear existing NPCs
    this.characterNPCs = [];

    // Spawn NPC for each unlocked character (except active and dead ones)
    const availableCharacters = this.unlockedCharacters.filter(
      type => type !== this.activeCharacterType && !this.deadCharacters.includes(type)
    );

    // Position NPCs around the room
    const centerX = GRID.WIDTH / 2;
    const baseY = GRID.CELL_SIZE * 8; // Below the crafting area
    const spacing = GRID.CELL_SIZE * 4;

    availableCharacters.forEach((type, index) => {
      const offsetX = (index - (availableCharacters.length - 1) / 2) * spacing;
      const npc = new CharacterNPC(type, centerX + offsetX, baseY);
      this.characterNPCs.push(npc);
    });
  }

  swapWithCharacter(newType) {
    if (newType === this.activeCharacterType) {
      return; // Already this character
    }

    if (this.deadCharacters.includes(newType)) {
      this.showPickupMessage('This character has already died');
      return;
    }

    // Swap characters
    this.activeCharacterType = newType;
    this.applyCharacterType(newType);

    // Respawn character NPCs with new active character excluded
    this.spawnCharacterNPCs();

    const charData = CHARACTER_TYPES[newType];
    this.showPickupMessage(charData.name);
  }

  spawnCaptive(characterType) {
    if (!this.currentRoom) return null;

    // Find a safe spawn position (not too close to player, not in walls)
    const centerX = GRID.WIDTH / 2;
    const centerY = GRID.HEIGHT / 2;
    let spawnX, spawnY;
    let attempts = 0;
    const maxAttempts = 50;

    while (attempts < maxAttempts) {
      // Random position in the center area of the room
      spawnX = centerX + (Math.random() - 0.5) * GRID.WIDTH * 0.5;
      spawnY = centerY + (Math.random() - 0.5) * GRID.HEIGHT * 0.5;

      // Check if position is valid (not in wall, not too close to player)
      const gridX = Math.floor(spawnX / GRID.CELL_SIZE);
      const gridY = Math.floor(spawnY / GRID.CELL_SIZE);

      if (gridX >= 0 && gridX < GRID.COLS && gridY >= 0 && gridY < GRID.ROWS) {
        if (!this.currentRoom.collisionMap[gridY][gridX]) {
          const distToPlayer = Math.hypot(
            this.player.position.x - spawnX,
            this.player.position.y - spawnY
          );

          if (distToPlayer > GRID.CELL_SIZE * 5) {
            // Good position found
            return new Captive(characterType, spawnX, spawnY);
          }
        }
      }

      attempts++;
    }

    // Fallback to center if no good position found
    return new Captive(characterType, centerX, centerY);
  }

  markRandomBushShaking() {
    if (!this.currentRoom || !this.currentRoom.backgroundObjects) return;

    // Find spawn object: bush → tree → rock (fallback chain)
    let selectedObject = null;
    const bushes = this.currentRoom.backgroundObjects.filter(obj => !obj.destroyed && obj.char === '%');
    const trees = this.currentRoom.backgroundObjects.filter(obj => !obj.destroyed && obj.char === '&');
    const rocks = this.currentRoom.backgroundObjects.filter(obj => !obj.destroyed && obj.char === '0');

    if (bushes.length > 0) {
      selectedObject = bushes[Math.floor(Math.random() * bushes.length)];
    } else if (trees.length > 0) {
      selectedObject = trees[Math.floor(Math.random() * trees.length)];
    } else if (rocks.length > 0) {
      selectedObject = rocks[Math.floor(Math.random() * rocks.length)];
    }

    if (!selectedObject) {
        if (this.zoneSystem.leshyChaseActive) {
        console.warn('[Leshy Chase] No spawn objects found, chase ended');
        this.zoneSystem.resetLeshyChase();
      }
      return;
    }

    // Mark as shaking Leshy bush
    selectedObject.isShaking = true;
    selectedObject.leshyBush = true;

  }

  checkCaptiveInteraction() {
    if (!this.captives || this.captives.length === 0) return false;

    for (const captive of this.captives) {
      if (captive.freed) continue;

      const dist = Math.hypot(
        this.player.position.x - captive.position.x,
        this.player.position.y - captive.position.y
      );

      if (dist < INTERACTION_RANGE * 2) { // Larger range for cage
        if (!captive.cageDestroyed) {
          // First interaction: destroy the cage (no message, just visual debris)
          captive.cageDestroyed = true;

          // Create cage debris (yellow fragments) - createDebris returns an array
          const cageDebris = createDebris(
            captive.position.x,
            captive.position.y,
            12, // 12 debris pieces
            '#ffaa00' // Gold cage color
          );
          this.debris.push(...cageDebris);

          // Prevent weapon attack
          this.captiveInteractionThisFrame = true;
          return true;
        } else {
          // Second interaction: recruit the character
          captive.freed = true;
          this.unlockedCharacters.push(captive.characterType);
          const charData = CHARACTER_TYPES[captive.characterType];
          this.showPickupMessage(`${charData.name} obtained`);
          this.saveGameState(); // Save unlocked character

          // Prevent weapon attack by clearing held item temporarily
          this.captiveInteractionThisFrame = true;
          return true;
        }
      }
    }
    return false;
  }

  checkPathAmulet() {
    // Check if Path Amulet is equipped in either consumable slot
    const hasPathAmulet = this.inventorySystem.equippedConsumables.some(consumable =>
      consumable && consumable.char === 'o' && consumable.effect === 'pathTracker'
    );

    if (hasPathAmulet && this.zoneSystem.pathHistory.length > 0) {
      // Display accumulated path (last 10 letters) - extract letters from exit objects
      const letterPath = this.zoneSystem.pathHistory.map(exit => exit.letter);
      const pathDisplay = letterPath.join('-');
      this.pathAnnouncement = pathDisplay;
      this.pathAnnouncementTimer = this.PATH_ANNOUNCEMENT_DURATION;
    }
  }

  playerHasNoItems() {
    // Check if player has no items in quick slots (escape route condition)
    if (!this.player || !this.player.quickSlots) return false;
    return this.player.quickSlots.every(slot => slot === null);
  }

  updateConsumableWindups(deltaTime) {
    // DELEGATED TO InventorySystem
    const enemies = this.currentRoom ? this.currentRoom.enemies : [];

    for (let i = this.inventorySystem.consumableWindups.length - 1; i >= 0; i--) {
      const windup = this.inventorySystem.consumableWindups[i];
      windup.timer -= deltaTime;
      windup.blinkTimer += deltaTime;

      // Windup complete — trigger effect
      if (windup.timer <= 0) {
        const cd = windup.consumable.data;
        const px = windup.x;
        const py = windup.y;

        // Execute effect based on type
        switch (windup.effectType) {
          case 'explode': {
            // Bomb explosion
            const aoeRadius = cd.radius * 2;
            for (const enemy of enemies) {
              const dx = (enemy.position.x + GRID.CELL_SIZE / 2) - px;
              const dy = (enemy.position.y + GRID.CELL_SIZE / 2) - py;
              if (Math.sqrt(dx * dx + dy * dy) <= aoeRadius) {
                enemy.takeDamage(cd.damage);
              }
            }
            const explosion = createExplosion(px, py, 20, windup.consumable.color || '#ff4400');
            this.particles.push(...explosion);
            break;
          }
          case 'curse': {
            // Cursed Skull damage
            for (const enemy of enemies) {
              const dx = (enemy.position.x + GRID.CELL_SIZE / 2) - px;
              const dy = (enemy.position.y + GRID.CELL_SIZE / 2) - py;
              if (Math.sqrt(dx * dx + dy * dy) <= cd.radius) {
                enemy.takeDamage(cd.damage);
                this.combatSystem.createDamageNumber(cd.damage, enemy.position.x, enemy.position.y, '#ffffff');
              }
            }
            // Dark explosion effect
            const curseBurst = createExplosion(px, py, 25, '#9900ff');
            this.particles.push(...curseBurst);
            break;
          }
          case 'slow': {
            // Slime Ball - apply freeze (slow) effect
            for (const enemy of enemies) {
              const dx = (enemy.position.x + GRID.CELL_SIZE / 2) - px;
              const dy = (enemy.position.y + GRID.CELL_SIZE / 2) - py;
              if (Math.sqrt(dx * dx + dy * dy) <= 50) {
                enemy.applyStatusEffect('freeze', cd.duration || 10);
                this.combatSystem.createDamageNumber('~', enemy.position.x, enemy.position.y, '#00ff00');
              }
            }
            // Green goo burst
            const slimeBurst = createExplosion(px, py, 15, '#00ff00');
            this.particles.push(...slimeBurst);
            break;
          }
          case 'poison': {
            // Poison Flask - apply poison status effect
            for (const enemy of enemies) {
              const dx = (enemy.position.x + GRID.CELL_SIZE / 2) - px;
              const dy = (enemy.position.y + GRID.CELL_SIZE / 2) - py;
              if (Math.sqrt(dx * dx + dy * dy) <= 55) {
                enemy.applyStatusEffect('poison', 8);
                this.combatSystem.createDamageNumber('☠', enemy.position.x, enemy.position.y, '#44ff44');
              }
            }
            // Green cloud burst
            const poisonBurst = createExplosion(px, py, 18, '#44ff44');
            this.particles.push(...poisonBurst);
            break;
          }
          case 'venomcloud': {
            // Venom Vial - damage + poison + slow (freeze)
            for (const enemy of enemies) {
              const dx = (enemy.position.x + GRID.CELL_SIZE / 2) - px;
              const dy = (enemy.position.y + GRID.CELL_SIZE / 2) - py;
              if (Math.sqrt(dx * dx + dy * dy) <= 60) {
                enemy.takeDamage(3);
                enemy.applyStatusEffect('poison', 8);
                enemy.applyStatusEffect('freeze', 5); // Slow effect via freeze
                this.combatSystem.createDamageNumber(3, enemy.position.x, enemy.position.y, '#00ff44');
              }
            }
            // Toxic green burst
            const venomBurst = createExplosion(px, py, 22, '#00ff44');
            this.particles.push(...venomBurst);
            break;
          }
          case 'jolt': {
            // Jolt Jar — damages all enemies in room
            for (const enemy of enemies) {
              enemy.takeDamage(4);
              this.combatSystem.createDamageNumber(4, enemy.position.x, enemy.position.y, '#ffff00');
            }
            // Electric burst
            const joltBurst = createExplosion(px, py, 30, '#ffff00');
            this.particles.push(...joltBurst);
            break;
          }
          case 'throwSteam': {
            // Steam Vial
            if (!this.steamClouds) this.steamClouds = [];
            this.steamClouds.push({
              x: px,
              y: py,
              radius: cd.radius || GRID.CELL_SIZE * 4,
              timer: cd.duration || 8.0
            });
            // Steam burst
            const steamBurst = createExplosion(px, py, 25, '#aaaaaa');
            this.particles.push(...steamBurst);
            break;
          }
        }

        // Flash HUD slot
        this.inventorySystem.consumableFlashSlot = windup.slotIndex;
        this.inventorySystem.consumableFlashTimer = 0.5;

        // Handle consumption based on one-shot vs reusable
        if (windup.isOneShot) {
          // Already marked as spent when windup started
        } else {
          // Start cooldown for reusable
          this.inventorySystem.consumableCooldowns[windup.slotIndex] = cd.cooldown || 10;
        }

        // Remove windup
        this.inventorySystem.consumableWindups.splice(i, 1);
        this.saveGameState();
      }
    }
  }

  checkConsumableActivation() {
    if (!this.player.equippedConsumables) return;

    for (let i = 0; i < this.player.equippedConsumables.length; i++) {
      const consumable = this.player.equippedConsumables[i];
      if (!consumable) continue;
      if (this.inventorySystem.spentConsumableSlots[i]) continue; // One-shot consumables already used

      // Skip if on cooldown (reusable consumables)
      if (this.inventorySystem.consumableCooldowns[i] > 0) continue;

      // Skip if already winding up
      if (this.inventorySystem.consumableWindups.some(w => w.slotIndex === i)) continue;

      let shouldTrigger = false;
      let triggerData = null; // Store trigger conditions for offensive items
      // consumable is an Item instance; data properties live on consumable.data
      const cd = consumable.data;

      switch (cd.effect) {
        case 'heal': {
          // Health Potion: HP < 50% maxHp; Heart: HP < 25% maxHp (instant activation)
          const threshold = cd.amount >= 10 ? 0.25 : 0.5;
          if (this.player.hp < this.player.maxHp * threshold) {
            this.player.heal(cd.amount);
            shouldTrigger = true;
          }
          break;
        }
        case 'maxhp': {
          // Dragon Heart: immediately on first active frame (instant activation)
          this.player.maxHp += cd.amount;
          this.player.hp = this.player.maxHp;
          shouldTrigger = true;
          break;
        }
        case 'speed': {
          // Wings: HP < 40% maxHp (instant activation)
          if (this.player.hp < this.player.maxHp * 0.4) {
            this.player.applySpeedBoost(cd.duration);
            shouldTrigger = true;
          }
          break;
        }
        case 'explode': {
          // Bomb: nearest enemy within 60px — START WINDUP
          const enemies = this.currentRoom ? this.currentRoom.enemies : [];
          let nearestDist = Infinity;
          for (const enemy of enemies) {
            const dx = (enemy.position.x + GRID.CELL_SIZE / 2) - (this.player.position.x + GRID.CELL_SIZE / 2);
            const dy = (enemy.position.y + GRID.CELL_SIZE / 2) - (this.player.position.y + GRID.CELL_SIZE / 2);
            nearestDist = Math.min(nearestDist, Math.sqrt(dx * dx + dy * dy));
          }
          if (nearestDist <= 60) {
            shouldTrigger = true;
            triggerData = { windup: 1.5, effectType: 'explode' };
          }
          break;
        }
        case 'curse': {
          // Cursed Skull: 3+ enemies within 80px — START WINDUP
          const enemies = this.currentRoom ? this.currentRoom.enemies : [];
          const px = this.player.position.x + GRID.CELL_SIZE / 2;
          const py = this.player.position.y + GRID.CELL_SIZE / 2;
          let nearbyCount = 0;
          for (const enemy of enemies) {
            const dx = (enemy.position.x + GRID.CELL_SIZE / 2) - px;
            const dy = (enemy.position.y + GRID.CELL_SIZE / 2) - py;
            if (Math.sqrt(dx * dx + dy * dy) <= 80) nearbyCount++;
          }
          if (nearbyCount >= 3) {
            shouldTrigger = true;
            triggerData = { windup: 1.2, effectType: 'curse' };
          }
          break;
        }
        case 'luck': {
          // Lucky Coin: immediately (instant activation)
          this.player.applyLuck(cd.duration);
          shouldTrigger = true;
          break;
        }
        case 'block': {
          // Metal Block: HP < 50% (instant activation)
          if (this.player.hp < this.player.maxHp * 0.5) {
            this.player.applyBlockBoost(8, 5);
            shouldTrigger = true;
          }
          break;
        }
        case 'slow': {
          // Slime Ball: nearest enemy within 50px — START WINDUP
          const enemies = this.currentRoom ? this.currentRoom.enemies : [];
          const px = this.player.position.x + GRID.CELL_SIZE / 2;
          const py = this.player.position.y + GRID.CELL_SIZE / 2;
          let nearestDist = Infinity;
          for (const enemy of enemies) {
            const dx = (enemy.position.x + GRID.CELL_SIZE / 2) - px;
            const dy = (enemy.position.y + GRID.CELL_SIZE / 2) - py;
            nearestDist = Math.min(nearestDist, Math.sqrt(dx * dx + dy * dy));
          }
          if (nearestDist <= 50) {
            shouldTrigger = true;
            triggerData = { windup: 0.8, effectType: 'slow' };
          }
          break;
        }
        case 'poison': {
          // Poison Flask: nearest enemy within 55px — START WINDUP
          const enemies = this.currentRoom ? this.currentRoom.enemies : [];
          const px = this.player.position.x + GRID.CELL_SIZE / 2;
          const py = this.player.position.y + GRID.CELL_SIZE / 2;
          let nearestDist = Infinity;
          for (const enemy of enemies) {
            const dx = (enemy.position.x + GRID.CELL_SIZE / 2) - px;
            const dy = (enemy.position.y + GRID.CELL_SIZE / 2) - py;
            nearestDist = Math.min(nearestDist, Math.sqrt(dx * dx + dy * dy));
          }
          if (nearestDist <= 55) {
            shouldTrigger = true;
            triggerData = { windup: 1.0, effectType: 'poison' };
          }
          break;
        }
        case 'cleanse': {
          // Tonic: player has burn or wet (instant activation)
          if (this.player.burnDuration > 0 || this.player.wetDuration > 0) {
            this.player.burnDuration = 0;
            this.player.wetDuration = 0;
            shouldTrigger = true;
          }
          break;
        }
        case 'invuln': {
          // Smoke Bomb: HP < 25% (instant activation)
          if (this.player.hp < this.player.maxHp * 0.25) {
            const duration = cd.duration || 3.5;
            this.player.invulnerabilityTimer = Math.max(this.player.invulnerabilityTimer, duration);

            // Create smoke cloud using existing steam cloud system
            if (!this.steamClouds) this.steamClouds = [];
            this.steamClouds.push({
              x: this.player.position.x + GRID.CELL_SIZE / 2,
              y: this.player.position.y + GRID.CELL_SIZE / 2,
              radius: GRID.CELL_SIZE * 3.5, // Large smoke cloud
              timer: duration // Lasts as long as invulnerability
            });

            shouldTrigger = true;
          }
          break;
        }
        case 'venomcloud': {
          // Venom Vial: 2+ enemies within 60px — START WINDUP
          const enemies = this.currentRoom ? this.currentRoom.enemies : [];
          const px = this.player.position.x + GRID.CELL_SIZE / 2;
          const py = this.player.position.y + GRID.CELL_SIZE / 2;
          let nearbyCount = 0;
          for (const enemy of enemies) {
            const dx = (enemy.position.x + GRID.CELL_SIZE / 2) - px;
            const dy = (enemy.position.y + GRID.CELL_SIZE / 2) - py;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist <= 60) {
              nearbyCount++;
            }
          }
          if (nearbyCount >= 2) {
            shouldTrigger = true;
            triggerData = { windup: 1.0, effectType: 'venomcloud' };
          }
          break;
        }
        case 'jolt': {
          // Jolt Jar: 2+ enemies in room — START WINDUP
          const enemies = this.currentRoom ? this.currentRoom.enemies : [];
          if (enemies.length >= 2) {
            shouldTrigger = true;
            triggerData = { windup: 1.3, effectType: 'jolt' };
          }
          break;
        }
        case 'shield': {
          // Activates immediately — grants bullet-blocking charges with recharge (instant activation)
          // Only activate if not already active
          if (this.player.shieldMaxCharges === 0) {
            this.player.shieldCharges = cd.charges || 3;
            this.player.shieldMaxCharges = cd.charges || 3;
            this.player.shieldCooldownMax = cd.rechargeCooldown || 5;
            this.player.shieldCooldown = 0;
            this.player.shieldBlocksAll = false;
            shouldTrigger = true;
          }
          break;
        }
        case 'bulwark': {
          // Activates immediately — grants all-hit-blocking charges with recharge (instant activation)
          // Only activate if not already active
          if (this.player.shieldMaxCharges === 0) {
            this.player.shieldCharges = cd.charges || 2;
            this.player.shieldMaxCharges = cd.charges || 2;
            this.player.shieldCooldownMax = cd.rechargeCooldown || 8;
            this.player.shieldCooldown = 0;
            this.player.shieldBlocksAll = true;
            shouldTrigger = true;
          }
          break;
        }
        case 'waterImmunity': {
          // Rubber Boots: always activates immediately (instant activation)
          this.player.waterImmunityTimer = cd.duration;
          shouldTrigger = true;
          break;
        }
        case 'throwSteam': {
          // Steam Vial: creates a steam cloud — START WINDUP
          shouldTrigger = true;
          triggerData = { windup: 0.6, effectType: 'throwSteam' };
          break;
        }
        case 'platform':
          console.warn('Effect not implemented:', cd.effect);
          break;
        default:
          break;
      }

      if (shouldTrigger) {
        // Check if this is a one-shot or reusable consumable
        // Shields are special: they activate once but stay equipped (charge system handles blocking)
        const isShield = cd.effect === 'shield' || cd.effect === 'bulwark';
        const isOneShot = cd.oneShot === true && !isShield;

        // Check if this needs windup (offensive items)
        if (triggerData && triggerData.windup) {
          // Start windup for offensive consumables
          this.inventorySystem.consumableWindups.push({
            consumable: consumable,
            slotIndex: i,
            timer: triggerData.windup,
            maxTimer: triggerData.windup,
            effectType: triggerData.effectType,
            x: this.player.position.x + GRID.CELL_SIZE / 2,
            y: this.player.position.y + GRID.CELL_SIZE / 2,
            blinkTimer: 0,
            isOneShot: isOneShot
          });

          // Handle consumption
          if (isOneShot) {
            // One-shot: remove permanently
            this.inventorySystem.spentConsumableSlots[i] = true;
            this.inventorySystem.equippedConsumables[i] = null;
            this.player.equippedConsumables[i] = null;
          } else {
            // Reusable: start cooldown
            this.inventorySystem.consumableCooldowns[i] = cd.cooldown || 10;
          }
        } else {
          // Instant activation (heal, buff, shield items)
          this.combatSystem.createDamageNumber(
            consumable.char,
            this.player.position.x,
            this.player.position.y - GRID.CELL_SIZE * 0.5,
            consumable.color || COLORS.ITEM
          );
          this.inventorySystem.consumableFlashSlot = i;
          this.inventorySystem.consumableFlashTimer = 0.5;
          const burst = createActivationBurst(this.player.position.x, this.player.position.y, consumable.color || COLORS.ITEM);
          this.particles.push(...burst);

          // Handle consumption
          if (isOneShot) {
            // One-shot: remove permanently
            this.inventorySystem.spentConsumableSlots[i] = true;
            this.inventorySystem.equippedConsumables[i] = null;
            this.player.equippedConsumables[i] = null;
          } else {
            // Reusable: start cooldown
            this.inventorySystem.consumableCooldowns[i] = cd.cooldown || 10;
          }

          this.saveGameState();
        }
      }
    }
  }

  transitionToNeutralRoom(scriptName) {

    // Save current explore state (for return via south exit)
    this.savedExploreState = {
      room: this.currentRoom,
      items: [...this.items],
      ingredients: [...this.ingredients],
      placedTraps: [...this.placedTraps],
      backgroundObjects: [...this.backgroundObjects],
      enemies: [...this.currentRoom.enemies],
      captives: [...this.captives],
      neutralCharacters: [...this.neutralCharacters],
      playerPosition: { x: this.player.position.x, y: this.player.position.y }
    };

    // Generate neutral room via script system
    this.currentRoom = this.neutralRoomSystem.generateNeutralRoom(scriptName);

    // Reset player position to center of room
    this.player.position.x = Math.floor(GRID.COLS / 2) * GRID.CELL_SIZE;
    this.player.position.y = Math.floor(GRID.ROWS / 2) * GRID.CELL_SIZE;
    this.player.velocity = { vx: 0, vy: 0 };

    // Clear transient entities
    this.items = [...this.currentRoom.items]; // Use room's items
    this.ingredients = [];
    this.particles = [];
    this.debris = [];
    this.steamClouds = [];
    this.gooBlobs = [];
    this.neutralCharacters = [];

    // Initialize physics system
    this.physicsSystem.clear();
    this.physicsSystem.addEntity(this.player);
    for (const item of this.items) {
      this.physicsSystem.addEntity(item);
    }

    // Update collision map
    this.updateExitCollisions();

    // Transition to NEUTRAL state
    this.stateMachine.transition(GAME_STATES.NEUTRAL);
  }

  enterExploreState(entryDirection = null, exitObj = null) {
    // Zone depths only reset on death, not when entering from REST
    // Check if continuing in current zone (depth > 0) or starting fresh in this zone (depth === 0)
    const isContinuing = this.getCurrentZoneDepth() > 0;

    // Determine depth update strategy
    // When entryDirection is null, we're coming from REST (via state transition)
    // When entryDirection is set, we're moving between EXPLORE rooms (direct call, not state transition)
    const leavingRest = entryDirection === null; // null = coming from REST, otherwise coming from another EXPLORE room
    const roomTransition = entryDirection !== null; // Has direction = moving between rooms

    // Check if we should restore saved explore room (returning from REST to same room)
    const shouldRestoreExploreRoom = leavingRest && this.inventorySystem.getSavedExploreRoom() !== null;


    // Save player state from previous room
    // Inventory: Always carry ingredients forward (REST or EXPLORE rooms)
    // Quick slots: ALWAYS persist (both from REST and between rooms)
    const savedInventory = this.player ? [...this.player.inventory] : [];
    const savedQuickSlots = this.player ? [...this.player.quickSlots] : [null, null, null]; // Always save quick slots
    const savedActiveSlotIndex = this.player ? this.player.activeSlotIndex : 0; // Always save active slot
    const savedHp = this.player ? this.player.hp : null; // Always save HP

    // Determine player spawn position based on entry direction
    const centerX = GRID.WIDTH / 2;
    const centerY = GRID.HEIGHT / 2;
    let startX, startY;

    switch (entryDirection) {
      case 'north':
        // Exited through North door → spawn at South side of new room
        startX = centerX;
        startY = (GRID.ROWS - 3) * GRID.CELL_SIZE;
        break;
      case 'south':
        // Exited through South door → spawn at North side of new room
        startX = centerX;
        startY = 2 * GRID.CELL_SIZE;
        break;
      case 'east':
        // Exited through East door → spawn at West side of new room
        startX = 2 * GRID.CELL_SIZE;
        startY = centerY;
        break;
      case 'west':
        // Exited through West door → spawn at East side of new room
        startX = (GRID.COLS - 3) * GRID.CELL_SIZE;
        startY = centerY;
        break;
      default:
        // Default (from REST): spawn at South/bottom center
        startX = centerX;
        startY = (GRID.ROWS - 3) * GRID.CELL_SIZE;
    }

    // Reset consumable HUD feedback state for new explore run
    this.inventorySystem.spentConsumableSlots = [false, false];
    this.inventorySystem.consumableCooldowns = [0, 0]; // Reset cooldowns for new room
    this.inventorySystem.consumableFlashTimer = 0;
    this.inventorySystem.consumableFlashSlot = -1;
    this.inventorySystem.consumableWindups = []; // Clear any pending windups

    // Generate or restore room
    if (shouldRestoreExploreRoom) {
      // Restore saved explore room (prevents room cycling cheat)
      const savedData = this.inventorySystem.getSavedExploreRoomData();
      this.currentRoom = savedData.room;
      this.items = savedData.items;
      this.ingredients = savedData.ingredients;
      this.placedTraps = savedData.placedTraps;
      this.currentRoom.enemies = [...this.savedExploreEnemies];
      this.backgroundObjects = [...this.savedExploreBackgroundObjects];
      this.captives = [...this.savedExploreCaptives];

      // Depth stays the same when returning to saved room
    } else {
      // Generate new room
      // Check zone transition FIRST (before updating depth)
      if (roomTransition) {
        this.zoneSystem.incrementRoomCount();
      }
      const currentZone = this.zoneSystem.checkZoneTransition();
      const progressionColor = this.zoneSystem.getProgressionColor();

      // Detect zone changes
      const previousZone = this.zoneSystem.currentZone;
      const zoneChanged = (previousZone !== currentZone);

      // Update current zone
      this.zoneSystem.currentZone = currentZone;

      if (zoneChanged) {
        console.log(`[Zone] ⚡ Zone transition: ${previousZone} → ${currentZone}`);
      }
      if (progressionColor) {
      }

      // Zone depth management: Each zone has independent depth progression
      if (leavingRest && this.getCurrentZoneDepth() === 0) {
        // First time entering this zone from REST → Start at Level 1
        this.zoneDepths[currentZone] = 1;
      } else if (roomTransition) {
        // Check if we just transitioned to a new zone
        if (zoneChanged && this.zoneDepths[currentZone] === 0) {
          // First time entering this zone via zone transition → Start at Level 1
          this.zoneDepths[currentZone] = 1;
        } else {
          // Continuing in same zone → Increment depth
          this.incrementZoneDepth();
        }
      }

      // Determine room type from exit letter (if provided)
      let roomType = null;
      if (exitObj && exitObj.letter) {
        const letterData = EXIT_LETTERS[exitObj.letter];
        if (letterData && letterData.roomType) {
          roomType = ROOM_TYPES[letterData.roomType];
        }
      }

      this.roomGenerator.setDepth(this.getCurrentZoneDepth());
      this.currentRoom = this.roomGenerator.generateRoom(roomType, { x: startX, y: startY }, currentZone, progressionColor, exitObj?.letter);

      // Reset trap charges for new room
      if (this.player) {
        this.player.resetTrapsForNewRoom();
      }

      // Debug: Log generated exits

      // Apply gray zone special mechanics
      if (currentZone === 'gray') {
        // Remove south exit (no escape from gray zone)
        this.currentRoom.exits.south = false;

        // Apply hardmode enemy buffs (+50% HP and damage)
        for (const enemy of this.currentRoom.enemies) {
          enemy.hp = Math.ceil(enemy.hp * 1.5);
          enemy.maxHp = Math.ceil(enemy.maxHp * 1.5);
          enemy.damage = Math.ceil(enemy.damage * 1.5);
        }
      }

      // Unlock exits immediately if room has no enemies (CAMP, DISCOVERY, etc.)
      if (this.currentRoom.enemies.length === 0) {
        this.currentRoom.exitsLocked = false;
      }

      // Clear saved explore room when generating new room (only restore once)
      this.inventorySystem.clearSavedExploreRoom();
      this.savedExploreEnemies = [];
      this.savedExploreBackgroundObjects = [];
      this.savedExploreCaptives = [];
    }

    // Preload room previews for exits
    this.preloadRoomPreviews();

    this.player = new Player(startX, startY);
    this.player.setCollisionMap(this.currentRoom.collisionMap);

    // Apply active character type
    this.applyCharacterType(this.activeCharacterType);

    // Save room entry position for Rope consumable
    this.roomEntryX = startX;
    this.roomEntryY = startY;

    // Restore player state
    this.player.inventory = savedInventory;
    this.player.quickSlots = savedQuickSlots;
    this.player.activeSlotIndex = savedActiveSlotIndex;
    if (savedHp !== null) {
      this.player.hp = savedHp;
    }

    // Reset trap charges when entering from REST or restoring saved room
    if (leavingRest || shouldRestoreExploreRoom) {
      this.player.resetTrapsForNewRoom();
    }

    // Reset bow uses for all equipped weapons (new room = fresh arrows)
    for (const item of this.player.quickSlots) {
      if (item && item.resetUses) {
        item.resetUses();
      }
    }

    // Apply equipment effects
    this.applyEquipmentEffects();

    // Setup room entities (only for new rooms, not when restoring)
    if (!shouldRestoreExploreRoom) {
      this.ingredients = [];
      this.items = this.currentRoom.items || [];
      this.placedTraps = [];
      this.activeNoiseSource = null;
      this.backgroundObjects = this.currentRoom.backgroundObjects || [];
      this.steamClouds = []; // Clear steam clouds when entering new room
      this.debris = []; // Clear debris when entering new room
      this.particles = []; // Clear particles when entering new room
      this.gooBlobs = []; // Clear goo blobs when entering new room
      this.captives = []; // Clear captives when entering new room
      this.neutralCharacters = []; // Clear neutral characters when entering new room
    } else {
      // When restoring, still clear transient effects
      this.activeNoiseSource = null;
      this.steamClouds = [];
      this.debris = [];
      this.particles = [];
      this.gooBlobs = [];
      this.neutralCharacters = [];
    }

    // Set enemy targets
    for (const enemy of this.currentRoom.enemies) {
      enemy.setTarget(this.player);
    }

    // 2-second detection grace period — suppress aggro range so enemies
    // can't spot the player the moment they enter the room
    this.roomEntryGraceTimer = 2.0;
    for (const enemy of this.currentRoom.enemies) {
      enemy._savedAggroRange = enemy.aggroRange;
      enemy.aggroRange = 0;
    }

    // Check for Path Amulet and display path announcement
    this.checkPathAmulet();

    // Reset physics
    this.physicsSystem.clear();
    this.physicsSystem.addEntity(this.player);

    for (const enemy of this.currentRoom.enemies) {
      this.physicsSystem.addEntity(enemy);
    }

    for (const item of this.items) {
      this.physicsSystem.addEntity(item);
    }

    // Reset combat
    this.combatSystem.clear();

    // Leshy chase rooms will get shaking bush AFTER clearing (same as first encounter)

    // Mark background dirty
    this.renderer.markBackgroundDirty();

    // Set layer 2 (bassline) based on enemy presence
    // Always check for enemies, regardless of how we entered EXPLORE
    const hasEnemies = this.currentRoom && this.currentRoom.enemies && this.currentRoom.enemies.length > 0;
    this.audioSystem.setLayer2Enabled(hasEnemies);

    this.updateUI();
  }

  enterNeutralState() {

    // Player velocity reset already handled in transitionToNeutralRoom
    // Just mark background dirty for initial render
    this.renderer.markBackgroundDirty();

    // Mute layer 2 (bassline) in NEUTRAL state (peaceful encounters)
    this.audioSystem.setLayer2Enabled(false);
  }

  updateNeutralState(deltaTime) {
    if (!this.currentRoom) return;

    // Update shared player mechanics
    this.updatePlayerMechanics(deltaTime);

    // Update physics
    this.physicsSystem.update(deltaTime, this.currentRoom.backgroundObjects);

    // Update neutral room system script
    this.neutralRoomSystem.update(deltaTime, this.currentRoom, this.player);

    // Update ingredient attraction (same as EXPLORE/REST mode)
    for (let i = this.ingredients.length - 1; i >= 0; i--) {
      const ingredient = this.ingredients[i];
      const shouldPickup = this.physicsSystem.applyAttraction(ingredient, this.player);

      if (shouldPickup) {
        this.player.addIngredient(ingredient.char);
        this.physicsSystem.removeEntity(ingredient);
        this.ingredients.splice(i, 1);
      }
    }

    // Update items (for prize pickups)
    // NEUTRAL state: No item magnetization - all items require manual pickup with SPACE
    // (Only ingredients magnetize in all game states)

    // Update background objects
    for (const obj of this.currentRoom.backgroundObjects) {
      obj.update(deltaTime);
    }

    // Check for south exit (return to EXPLORE)
    const gridPos = this.player.getGridPosition();
    const prevGridPos = {
      x: Math.floor(this.previousPlayerPosition.x / GRID.CELL_SIZE),
      y: Math.floor(this.previousPlayerPosition.y / GRID.CELL_SIZE)
    };
    const centerX = Math.floor(GRID.COLS / 2);

    const inSouthExit = gridPos.y >= GRID.ROWS - 2 && Math.abs(gridPos.x - centerX) <= 1;
    const crossedSouthExit = prevGridPos.y < GRID.ROWS - 2 && gridPos.y >= GRID.ROWS - 2 && Math.abs(gridPos.x - centerX) <= 1;

    if ((inSouthExit || crossedSouthExit) && this.currentRoom.exits.south) {

      // Call neutral room exit hook
      this.neutralRoomSystem.onExit(this.currentRoom, this.player);

      // Restore saved explore state (no ingredient banking - just restore the room)
      if (this.savedExploreState) {
        this.currentRoom = this.savedExploreState.room;
        this.items = [...this.savedExploreState.items];
        this.ingredients = [...this.savedExploreState.ingredients]; // Ground ingredients NOT banked
        this.placedTraps = [...this.savedExploreState.placedTraps];
        this.backgroundObjects = [...this.savedExploreState.backgroundObjects];
        this.captives = [...this.savedExploreState.captives];
        this.neutralCharacters = [...this.savedExploreState.neutralCharacters];
        this.player.position.x = this.savedExploreState.playerPosition.x;
        this.player.position.y = this.savedExploreState.playerPosition.y;

        // Clear saved state
        this.savedExploreState = null;
      }

      // Update collision map
      this.updateExitCollisions();

      // Transition back to EXPLORE
      this.stateMachine.transition(GAME_STATES.EXPLORE);
    }

    // Store previous position for next frame
    this.previousPlayerPosition.x = this.player.position.x;
    this.previousPlayerPosition.y = this.player.position.y;
  }

  enterGameOverState() {
    // Player died - wait for space to continue
    this.gameOverWaitingForSpace = true;
    this.gameOverDeathTimer = 2.0; // 2-second delay before showing "Press SPACE"

    // Update UI to show HP at 0
    this.updateUI();
  }

  preloadRoomPreviews() {
    this.roomPreviews = { north: null, east: null, west: null, south: null };

    const directions = ['north', 'east', 'west'];
    for (const direction of directions) {
      const roomType = this.roomGenerator.determineRoomType();
      const preview = this.roomGenerator.getRoomPreview(roomType);

      this.roomPreviews[direction] = {
        type: roomType,
        char: preview.char,
        name: preview.name
      };
    }
  }

  update(deltaTime) {
    const state = this.stateMachine.getCurrentState();

    if (state === GAME_STATES.TITLE) {
      this.updateTitleState(deltaTime);
    } else if (state === GAME_STATES.REST) {
      this.updateRestState(deltaTime);
    } else if (state === GAME_STATES.EXPLORE) {
      this.updateExploreState(deltaTime);
    } else if (state === GAME_STATES.NEUTRAL) {
      this.updateNeutralState(deltaTime);
    } else if (state === GAME_STATES.GAME_OVER) {
      this.updateGameOverState(deltaTime);
    }

    // Track player inactivity for WASD blinking (REST, EXPLORE, and NEUTRAL states)
    if ((state === GAME_STATES.REST || state === GAME_STATES.EXPLORE || state === GAME_STATES.NEUTRAL) && this.player) {
      const isPlayerMoving = Math.abs(this.player.velocity.vx) > 1 || Math.abs(this.player.velocity.vy) > 1;

      if (isPlayerMoving) {
        this.inactivityTimer = 0; // Reset timer when moving
      } else {
        this.inactivityTimer += deltaTime; // Accumulate inactivity time
      }

      // Update blink animation when inactive
      if (this.inactivityTimer >= this.INACTIVITY_THRESHOLD) {
        this.wasdBlinkTimer += deltaTime;
        if (this.wasdBlinkTimer >= this.WASD_BLINK_INTERVAL) {
          this.wasdBlinkState = !this.wasdBlinkState;
          this.wasdBlinkTimer = 0;
        }
      }
    }
  }

  updateTitleState(deltaTime) {
    // Only update animation timer if intro has started
    if (this.introAnimationStarted) {
      this.titleAnimationTime += deltaTime;
    }
  }

  // Shared particle and debris updates for all game states
  updateSharedGameElements(deltaTime) {
    // Update particles (dodge trails, explosions, embers, etc.)
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const particle = this.particles[i];

      if (particle.update) {
        particle.update(deltaTime);
        if (!particle.alive) {
          this.physicsSystem.removeEntity(particle);
          this.particles.splice(i, 1);
        }
      } else {
        // Simple particle objects
        particle.life -= deltaTime;
        particle.x += particle.vx * deltaTime;
        particle.y += particle.vy * deltaTime;

        // Embers can burn player/enemies on contact (only if alpha > 50%)
        if (particle.isEmber && this.player) {
          const alpha = Math.max(0, particle.life / particle.maxLife);

          // Only cause damage if ember is still hot (alpha > 50%)
          if (alpha > 0.5) {
            const EMBER_RADIUS = GRID.CELL_SIZE;
            const EMBER_BURN_CHANCE = 0.03;

            const pdx = this.player.position.x + GRID.CELL_SIZE / 2 - particle.x;
            const pdy = this.player.position.y + GRID.CELL_SIZE / 2 - particle.y;
            if (Math.sqrt(pdx * pdx + pdy * pdy) < EMBER_RADIUS && Math.random() < EMBER_BURN_CHANCE) {
              this.player.applyBurn(2.0);
            }

            if (this.currentRoom && this.currentRoom.enemies) {
              for (const enemy of this.currentRoom.enemies) {
                const edx = enemy.position.x + GRID.CELL_SIZE / 2 - particle.x;
                const edy = enemy.position.y + GRID.CELL_SIZE / 2 - particle.y;
                if (Math.sqrt(edx * edx + edy * edy) < EMBER_RADIUS && Math.random() < EMBER_BURN_CHANCE) {
                  enemy.applyStatusEffect('burn', 2.0);
                }
              }
            }
          }
        }

        if (particle.life <= 0) {
          this.particles.splice(i, 1);
        }
      }
    }

    // Update goo blobs
    for (const gooBlob of this.gooBlobs) {
      gooBlob.update(deltaTime);

      // Check collision with player
      if (this.player && gooBlob.isNearEntity(this.player)) {
        this.player.applyStatusEffect('goo', 5.0); // 5 second goo effect
      }

      // Check collision with enemies (slimes are immune)
      if (this.currentRoom && this.currentRoom.enemies) {
        for (const enemy of this.currentRoom.enemies) {
          if (enemy.char === 'o' || enemy.char === 'M') continue; // Slimes are immune to goo

          if (gooBlob.isNearEntity(enemy)) {
            enemy.applyStatusEffect('freeze', 0.5); // Enemies get frozen instead of goo
            enemy.statusEffects.freeze.slowAmount = 0.8; // Heavy slow
          }
        }
      }
    }

    // Update debris physics
    if (this.debris.length > 0 && this.player) {
      const majorObjects = [this.player];
      if (this.currentRoom && this.currentRoom.enemies) {
        majorObjects.push(...this.currentRoom.enemies);
      }
      this.physicsSystem.updateDebris(this.debris.filter(d => d), majorObjects.filter(o => o));
    }
  }

  // Shared player mechanics for both REST and EXPLORE modes
  updatePlayerMechanics(deltaTime) {
    if (!this.player) return null;

    // Handle dodge rolling (continuous direction updates, supports diagonals and curving)
    const dodgeDirection = this.getDodgeRollDirection();
    if (this.activeCharacterType === 'green') {
      // Green ranger: hold arrow keys for a continuous slide (no individual roll timers)
      if (dodgeDirection.x !== 0 || dodgeDirection.y !== 0) {
        if (this.player.actionCooldown <= 0 && !this.player.isGooey()) {
          if (!this.player.continuousRollActive) {
            // Start the continuous roll
            this.player.continuousRollActive = true;
            // Brief iframes at roll start (standard dodge amount)
            this.player.invulnerabilityTimer = this.player.dodgeRoll.duration + 0.5;
            // Cancel active melee windup
            if (this.player.heldItem && this.player.heldItem.windupActive) {
              this.player.heldItem.windupActive = false;
              this.player.heldItem.windupTimer = 0;
              this.player.heldItem.pendingPlayer = null;
            }
            // Cancel bow charging
            if (this.player.heldItem && this.player.heldItem.isCharging) {
              this.audioSystem.stopSFXByName('charge_bow');
              this.player.heldItem.isCharging = false;
              this.player.heldItem.chargeTime = 0;
              this.player.heldItem.chargingPlayer = null;
            }
            // Break any sapping enemies
            const rollEnemies = this.currentRoom ? this.currentRoom.enemies : [];
            for (const enemy of rollEnemies) {
              if (enemy.sapping && enemy.sappingTarget === this.player) {
                enemy.breakSapping(300);
              }
            }
            this.audioSystem.playSFX('roll');
          }
          // Update player facing direction toward roll direction
          if (dodgeDirection.x !== 0) this.player.facing.x = Math.sign(dodgeDirection.x);
          if (dodgeDirection.y !== 0) this.player.facing.y = Math.sign(dodgeDirection.y);
          // Set velocity directly each frame (sustained movement)
          const rollSpeed = this.player.getRollSpeed();
          this.player.velocity.vx = dodgeDirection.x * rollSpeed;
          this.player.velocity.vy = dodgeDirection.y * rollSpeed;
          this.player.acceleration.ax = 0;
          this.player.acceleration.ay = 0;
        }
      } else if (this.player.continuousRollActive) {
        // Arrow keys released — end continuous roll and start shared cooldown
        this.player.continuousRollActive = false;
        this.player.actionCooldown = this.player.actionCooldownMax;
        this.player.velocity.vx = 0;
        this.player.velocity.vy = 0;
      }
    } else {
      // Standard dodge roll for all other characters
      if (dodgeDirection.x !== 0 || dodgeDirection.y !== 0) {
        if (!this.player.dodgeRoll.active && this.player.dodgeRoll.cooldownTimer <= 0) {
          const enemies = this.currentRoom ? this.currentRoom.enemies : [];
          const rollStarted = this.player.startDodgeRoll(dodgeDirection, enemies);

          if (rollStarted) {
            this.audioSystem.playSFX('roll');
          }

          // Show red X if dodge roll blocked by goo (with cooldown to prevent spam)
          if (!rollStarted && this.player.isGooey() && this.dodgeBlockedFeedbackTimer <= 0) {
            this.particles.push({
              x: this.player.position.x + GRID.CELL_SIZE / 2,
              y: this.player.position.y - 10,
              vx: 0,
              vy: -30,
              life: 0.5,
              maxLife: 0.5,
              char: 'X',
              color: '#ff0000',
              isImpact: true
            });
            this.dodgeBlockedFeedbackTimer = 0.5;
          }
        } else if (this.player.dodgeRoll.active) {
          // Update direction during active roll (allows curving)
          this.player.dodgeRoll.direction = dodgeDirection;
        }
      }
    }

    // Update player movement (locked when menu is open, during dodge roll, or continuous rolling)
    if (this.player.continuousRollActive) {
      // Green ranger continuous roll: velocity is managed directly above, skip updateInput
      // (calling updateInput would cap velocity to normal walk speed)
    } else if (!this.menuOpen && !this.player.dodgeRoll.active) {
      // Lock facing for non-bow weapons during attack; allow aiming while charging bow
      const lockFacing = this.keys.space && this.player.heldItem && this.player.heldItem.data.weaponType !== 'BOW';
      this.player.updateInput({
        up: this.keys.w,
        down: this.keys.s,
        left: this.keys.a,
        right: this.keys.d
      }, lockFacing);
    } else {
      // Stop player movement when menu is open or dodge rolling
      this.player.updateInput({
        up: false,
        down: false,
        left: false,
        right: false
      });
    }

    // Update player state (i-frames, dodge roll, wet, burn DoT, etc)
    const playerUpdateResult = this.player.update(deltaTime);

    // Handle burn DoT damage
    let burnKilledPlayer = false;
    if (playerUpdateResult?.burnDamage) {
      const burnDead = this.player.takeDamage(playerUpdateResult.burnDamage, {
        isBullet: false,
        element: 'burn'
      });
      if (burnDead === true) {
        burnKilledPlayer = true;
      }
    }

    // Emit dodge roll trail particles (also during green ranger continuous roll)
    if (this.player.dodgeRoll.active || this.player.continuousRollActive) {
      const trail = createDodgeTrail(
        this.player.position.x + this.player.width / 2,
        this.player.position.y + this.player.height / 2,
        this.player.color
      );
      this.particles.push(trail);
      this.physicsSystem.addEntity(trail);
    }

    // Update pickup message timer
    if (this.pickupMessageTimer > 0) {
      this.pickupMessageTimer -= deltaTime;
      if (this.pickupMessageTimer <= 0) {
        this.showNextPickupMessage();
      }
    }

    // Update path announcement timer
    if (this.pathAnnouncementTimer > 0) {
      this.pathAnnouncementTimer -= deltaTime;
    }

    // Update held item cooldown and check for windup completion
    if (this.player.heldItem && this.player.heldItem.update) {
      const windupAttack = this.player.heldItem.update(deltaTime);
      if (windupAttack) {
        this.playWeaponAttackSFX(this.player.heldItem);
        this.combatSystem.createAttack(this.applyGreenDamageModifier(windupAttack), this.currentRoom ? this.currentRoom.enemies : []);
      }
    }

    return { burnKilledPlayer };
  }

  updateRestState(deltaTime) {
    if (!this.player) return;

    // Store previous position before physics update
    this.previousPlayerPosition.x = this.player.position.x;
    this.previousPlayerPosition.y = this.player.position.y;

    // Update all shared player mechanics
    this.updatePlayerMechanics(deltaTime);

    // Update shared game elements (particles, debris, etc.)
    this.updateSharedGameElements(deltaTime);

    // Update character NPCs (idle animations)
    for (const npc of this.characterNPCs) {
      npc.update(deltaTime);
    }

    // Update ingredient attraction (same as EXPLORE mode)
    for (let i = this.ingredients.length - 1; i >= 0; i--) {
      const ingredient = this.ingredients[i];
      const shouldPickup = this.physicsSystem.applyAttraction(ingredient, this.player);

      if (shouldPickup) {
        this.player.addIngredient(ingredient.char);
        this.physicsSystem.removeEntity(ingredient);
        this.ingredients.splice(i, 1);
      }
    }

    // Update physics system
    this.physicsSystem.update(deltaTime, this.currentRoom ? this.currentRoom.backgroundObjects : []);

    // Update combat system (for weapon previews/attacks in rest mode)
    this.combatSystem.update(deltaTime, this.player, [], []);

    // Check for North exit (detect if player crossed threshold)
    const exitThreshold = GRID.CELL_SIZE * 2;
    const crossedNorthExit = this.previousPlayerPosition.y >= exitThreshold && this.player.position.y < exitThreshold;
    if (this.player.position.y < exitThreshold || crossedNorthExit) {
      // Save REST ingredients before leaving for EXPLORE
      this.inventorySystem.saveRestIngredients(this.ingredients);

      this.stateMachine.transition(GAME_STATES.EXPLORE);
    }

    this.updateUI();
  }

  updateGameOverState(deltaTime) {
    // Tick down the death timer
    if (this.gameOverDeathTimer > 0) {
      this.gameOverDeathTimer -= deltaTime;
      if (this.gameOverDeathTimer < 0) {
        this.gameOverDeathTimer = 0;
      }
    }

    // Update particles (handles both Particle class instances and simple objects)
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const particle = this.particles[i];

      if (particle.update) {
        particle.update(deltaTime);
        if (!particle.alive) {
          this.physicsSystem.removeEntity(particle);
          this.particles.splice(i, 1);
        }
      } else {
        particle.life -= deltaTime;
        particle.x += particle.vx * deltaTime;
        particle.y += particle.vy * deltaTime;
        if (particle.life <= 0) {
          this.particles.splice(i, 1);
        }
      }
    }

    // Update physics for remaining particles
    this.physicsSystem.update(deltaTime, []);

    // Update debris physics
    if (this.debris.length > 0 && this.currentRoom && this.currentRoom.enemies) {
      const majorObjects = [this.player, ...this.currentRoom.enemies].filter(obj => obj);
      this.physicsSystem.updateDebris(this.debris, majorObjects);
    }
  }

  updateExploreState(deltaTime) {
    if (!this.currentRoom) return;

    // Update preview blink animation
    this.previewBlinkTimer += deltaTime;
    if (this.previewBlinkTimer >= this.PREVIEW_BLINK_INTERVAL) {
      this.previewBlinkTimer = 0;
      this.previewBlinkState = !this.previewBlinkState;
    }

    // Update all shared player mechanics
    const playerMechanicsResult = this.updatePlayerMechanics(deltaTime);
    const burnKilledPlayer = playerMechanicsResult?.burnKilledPlayer || false;

    // Tick room-entry detection grace period
    if (this.roomEntryGraceTimer > 0) {
      this.roomEntryGraceTimer -= deltaTime;
      if (this.roomEntryGraceTimer <= 0) {
        for (const enemy of this.currentRoom.enemies) {
          if (enemy._savedAggroRange !== undefined) {
            enemy.aggroRange = enemy._savedAggroRange;
            delete enemy._savedAggroRange;
          }
        }
      }
    }

    // Reapply equipment effects each frame (keeps defense in sync with timed buffs)
    this.applyEquipmentEffects();

    // Tick dodge blocked feedback cooldown
    if (this.dodgeBlockedFeedbackTimer > 0) {
      this.dodgeBlockedFeedbackTimer -= deltaTime;
    }

    // Consumable cooldowns and flash timer are now handled in InventorySystem.update()

    // Vault unlocking is now triggered by SPACE press in handleSpacePress()

    // Update secret event visual effects (glitter, shaking, etc.)
    this.updateSecretEventEffects(deltaTime);

    // Store previous position before physics update (for exit zone crossing detection)
    this.previousPlayerPosition.x = this.player.position.x;
    this.previousPlayerPosition.y = this.player.position.y;

    // Update physics
    const waterResults = this.physicsSystem.update(deltaTime, this.currentRoom.backgroundObjects, this.currentRoom);

    // Track if lava killed the player
    let lavaKilledPlayer = false;

    for (const { entity, inLiquid, liquidState, damagingLiquid } of waterResults) {
      // Check for damaging liquid (lava) FIRST before water effects
      if (damagingLiquid) {
        // Apply lava damage (not affected by water immunity)
        if (entity.takeDamage) {
          // Initialize lava damage timer if needed
          if (!entity.lavaDamageTimer) {
            entity.lavaDamageTimer = 0;
          }

          // Only apply damage once per second (not every frame)
          entity.lavaDamageTimer -= deltaTime;
          if (entity.lavaDamageTimer <= 0) {
            const damageResult = entity.takeDamage(damagingLiquid.damage);

            // Only create visual feedback if damage was actually dealt
            if (entity === this.player) {
              if (damageResult === true) {
                // Player died from lava
                lavaKilledPlayer = true;
                this.combatSystem.createDamageNumber(
                  damagingLiquid.damage,
                  entity.position.x,
                  entity.position.y,
                  '#ff4400'
                );
                entity.hitFlashTimer = 0.15;
              } else if (damageResult && damageResult.damaged) {
                // Damage was dealt successfully
                this.combatSystem.createDamageNumber(
                  damagingLiquid.damage,
                  entity.position.x,
                  entity.position.y,
                  '#ff4400'
                );
                entity.hitFlashTimer = 0.15;
              } else if (damageResult && damageResult.dodged) {
                this.combatSystem.createDamageNumber('DODGE', entity.position.x, entity.position.y, '#ffff00');
              } else if (damageResult && damageResult.immune) {
                this.combatSystem.createDamageNumber('IMMUNE', entity.position.x, entity.position.y, '#00ffff');
              } else if (damageResult === false) {
                // Blocked by invulnerability frames - no visual feedback
              }
            }

            // Reset timer for next damage tick (1 second interval)
            entity.lavaDamageTimer = 1.0;
          }
        }
        // Lava doesn't apply water effects - skip rest of loop
        continue;
      }

      if (!inLiquid) continue;

      // Check water immunity (Rubber Boots) — blocks elemental status effects but not movement slow
      const isImmune = entity === this.player && this.player.waterImmunityTimer > 0;

      // Apply wet status (6s; Math.max in applyWet/applyStatusEffect refreshes while in water)
      if (!isImmune) {
        if (entity.applyWet) {
          entity.applyWet(6.0); // Player
          entity.burnDuration = 0;  // Water extinguishes burn
        } else if (entity.applyStatusEffect) {
          entity.applyStatusEffect('wet', 6.0); // Enemies
          if (entity.statusEffects?.burn) entity.statusEffects.burn.active = false; // Water extinguishes burn
        }
      }

      // Apply water state effects (skip if immune)
      if (!isImmune) {
        if (liquidState === 'poisoned') {
          if (entity.applyStatusEffect) entity.applyStatusEffect('poison', 4.0);
        } else if (liquidState === 'electrified') {
          if (entity.applyStatusEffect) entity.applyStatusEffect('stun', 1.5);
          if (entity.takeDamage) entity.takeDamage(1);
        }
      }
    }

    // Slime enemy collision: apply goo effect on contact
    const SLIME_COLLISION_DISTANCE = 16; // pixels
    for (const enemy of this.currentRoom.enemies) {
      if (enemy.char === 'o' || enemy.char === 'M') { // Slime and Boss Slime enemies
        const dx = this.player.position.x - enemy.position.x;
        const dy = this.player.position.y - enemy.position.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < SLIME_COLLISION_DISTANCE) {
          this.player.applyStatusEffect('goo', 5.0); // 5 second goo effect
        }
      }
    }

    // Wet trail: emit drip particles while player is wet
    if (this.player.isWet()) {
      this.player.wetDropTimer -= deltaTime;
      if (this.player.wetDropTimer <= 0) {
        // Emit 1-2 drops per interval; more frequent when freshly soaked
        const dropCount = Math.random() < 0.4 ? 2 : 1;
        for (let d = 0; d < dropCount; d++) {
          this.particles.push(createWetDrop(
            this.player.position.x,
            this.player.position.y
          ));
        }
        // Interval: 0.10s when soaked (>4s left), longer as they dry out
        const wet = this.player.wetDuration;
        this.player.wetDropTimer = wet > 4 ? 0.10 : wet > 2 ? 0.14 : 0.20;
      }
    } else {
      this.player.wetDropTimer = 0;
    }

    // Wet trail: emit drip particles for wet enemies
    for (const enemy of this.currentRoom.enemies) {
      if (enemy.isWet()) {
        enemy.wetDropTimer -= deltaTime;
        if (enemy.wetDropTimer <= 0) {
          const dropCount = Math.random() < 0.4 ? 2 : 1;
          for (let d = 0; d < dropCount; d++) {
            this.particles.push(createWetDrop(
              enemy.position.x,
              enemy.position.y
            ));
          }
          const wet = enemy.statusEffects.wet.duration;
          enemy.wetDropTimer = wet > 4 ? 0.10 : wet > 2 ? 0.14 : 0.20;
        }
      } else {
        enemy.wetDropTimer = 0;
      }
    }

    // Steam trail: emit puff particles while player is inside a steam cloud
    {
      let playerInSteam = false;
      const px = this.player.position.x + GRID.CELL_SIZE / 2;
      const py = this.player.position.y + GRID.CELL_SIZE / 2;
      for (const cloud of this.steamClouds) {
        const dx = px - cloud.x, dy = py - cloud.y;
        if (dx * dx + dy * dy <= cloud.radius * cloud.radius) { playerInSteam = true; break; }
      }
      if (playerInSteam) {
        this.player.steamTrailTimer -= deltaTime;
        if (this.player.steamTrailTimer <= 0) {
          this.particles.push(createSteamPuff(this.player.position.x, this.player.position.y));
          this.player.steamTrailTimer = 0.12 + Math.random() * 0.06;
        }
      } else {
        this.player.steamTrailTimer = 0;
      }
    }

    // Steam trail: emit puff particles for enemies inside a steam cloud
    for (const enemy of this.currentRoom.enemies) {
      let enemyInSteam = false;
      const ex = enemy.position.x + GRID.CELL_SIZE / 2;
      const ey = enemy.position.y + GRID.CELL_SIZE / 2;
      for (const cloud of this.steamClouds) {
        const dx = ex - cloud.x, dy = ey - cloud.y;
        if (dx * dx + dy * dy <= cloud.radius * cloud.radius) { enemyInSteam = true; break; }
      }
      if (enemyInSteam) {
        enemy.steamTrailTimer = (enemy.steamTrailTimer || 0) - deltaTime;
        if (enemy.steamTrailTimer <= 0) {
          this.particles.push(createSteamPuff(enemy.position.x, enemy.position.y));
          enemy.steamTrailTimer = 0.15 + Math.random() * 0.07;
        }
      } else {
        enemy.steamTrailTimer = 0;
      }
    }

    // Apply slow timer to enemies
    for (const enemy of this.currentRoom.enemies) {
      if (enemy.slowTimer > 0) {
        enemy.slowTimer -= deltaTime;
        enemy.velocity.vx *= 0.5;
        enemy.velocity.vy *= 0.5;
      }
    }

    // Update held item cooldown and check for windup completion
    if (this.player.heldItem && this.player.heldItem.update) {
      const windupAttack = this.player.heldItem.update(deltaTime);
      if (windupAttack) {
        this.playWeaponAttackSFX(this.player.heldItem);
        this.combatSystem.createAttack(this.applyGreenDamageModifier(windupAttack), this.currentRoom ? this.currentRoom.enemies : []);
      }
    }

    // Bow charging: chargeTime is incremented by item.update() while isCharging is true.
    // Charging can only START from handleSpacePress (which guards against pickup/other actions).
    // Nothing needed here — item.update() handles the charge timer.

    // Auto-attack when holding space (guns and melee only - bows use charging, wands require deliberate timing)
    // Only allow auto-attack if attack sequence was initiated by a button press (not just holding)
    // Skip vault key (UTILITY type)
    if (this.keys.space && this.attackSequenceActive && this.player.heldItem && this.player.heldItem.data.weaponType !== 'BOW' && this.player.heldItem.data.weaponType !== 'WAND' && this.player.heldItem.data.weaponType !== 'UTILITY' && !this.menuOpen && !this.cheatMenu.isOpen && this.player.canAttack()) {
      const weapon = this.player.heldItem;
      const attack = this.player.useHeldItem();
      if (attack) {
        // Debug logging for wands
        if (weapon.data.weaponType === 'WAND') {
          const enemies = this.currentRoom ? this.currentRoom.enemies : [];
        }

        const attackSucceeded = this.combatSystem.createAttack(this.applyGreenDamageModifier(attack), this.currentRoom ? this.currentRoom.enemies : []);

        // For wands with proximity requirement, reset cooldown if proximity check failed
        if (weapon.data.weaponType === 'WAND' && attackSucceeded === false) {
          weapon.cooldownTimer = 0; // Reset cooldown (proximity requirement not met)
        } else {
          this.triggerGreenActionCooldown();
        }
      }
    }

    // Update placed traps (sets this.activeNoiseSource for this frame)
    this.updatePlacedTraps(deltaTime);

    // Update pack behavior - find packmates and share memory marks
    for (const enemy of this.currentRoom.enemies) {
      if (enemy.packBehavior && enemy.packBehavior.enabled) {
        // Find nearby packmates (same character type)
        const potentialMates = this.currentRoom.enemies.filter(other => other !== enemy && other.char === enemy.char);

        enemy.packmates = this.currentRoom.enemies.filter(other => {
          if (other === enemy) return false;
          if (other.char !== enemy.char) return false;

          const dx = other.position.x - enemy.position.x;
          const dy = other.position.y - enemy.position.y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          return distance <= enemy.packBehavior.packRadius;
        });


        // Share memory marks across pack (most recent memory mark is shared)
        if (enemy.packmates.length > 0) {
          // Find the most recent memory mark from any pack member
          let sharedMemory = enemy.lastKnownPosition;
          let latestMemoryTime = 0;

          for (const mate of enemy.packmates) {
            if (mate.lastKnownPosition) {
              // Use memory mark if this mate has one (priority to enemies with active memory)
              if (mate.aggroMemoryActive || !sharedMemory) {
                sharedMemory = mate.lastKnownPosition;
              }
            }
          }

          // Share the memory mark with all pack members
          if (sharedMemory && !enemy.lastKnownPosition) {
            enemy.lastKnownPosition = { x: sharedMemory.x, y: sharedMemory.y };
          }
        }
      }
    }

    // Handle enemy spawn requests and item usage (must happen before combat update)
    const spawnRequests = [];
    for (const enemy of this.currentRoom.enemies) {
      // Check consumable usage
      if (enemy.itemUsage && enemy.itemUsage.enabled) {
        const consumable = enemy.shouldUseConsumable();
        if (consumable) {
          enemy.useConsumable(consumable);
          this.combatSystem.createDamageNumber('+', enemy.position.x, enemy.position.y, '#00ff00');
        }
      }

      const updateResult = enemy.update(deltaTime);

      // Handle aggro sound effect
      if (updateResult.justAggrod) {
        this.audioSystem.playSFX('aggro');
      }

      // Handle item attacks
      if (updateResult.itemAttack) {
        this.combatSystem.createEnemyAttack(updateResult.itemAttack);
      }

      if (updateResult.shouldSpawn) {
        spawnRequests.push({ spawner: enemy, spawnData: updateResult.spawnData });
      }

      // Check for stun-dropped items
      const droppedItems = enemy.getStunDroppedItems();
      if (droppedItems.length > 0) {
        this.items.push(...droppedItems);
        for (const item of droppedItems) {
          this.physicsSystem.addEntity(item);
        }
      }

      // Slime trail: slimes leave goo blobs every 3 seconds
      if (enemy.char === 'o' || enemy.char === 'M') { // Slime and Boss Slime enemies
        // Speed boost when touching own goo
        const baseSpeed = enemy.data.speed;
        const GOO_TOUCH_RADIUS = GRID.CELL_SIZE;
        const onGoo = this.gooBlobs.some(blob => {
          const dx = (enemy.position.x + GRID.CELL_SIZE / 2) - blob.position.x;
          const dy = (enemy.position.y + GRID.CELL_SIZE / 2) - blob.position.y;
          return Math.sqrt(dx * dx + dy * dy) < GOO_TOUCH_RADIUS + blob.radius;
        });
        enemy.speed = onGoo ? baseSpeed * 2 : baseSpeed;

        // Initialize goo trail timer if not set
        if (enemy.gooTrailTimer === undefined) {
          enemy.gooTrailTimer = 3.0; // Start with 3 seconds
        }

        // Tick down timer
        enemy.gooTrailTimer -= deltaTime;

        // Generate goo blob every 3 seconds
        if (enemy.gooTrailTimer <= 0) {
          enemy.gooTrailTimer = 3.0; // Reset timer

          // Create stationary goo blob at slime's center
          const gooBlob = new GooBlob(
            enemy.position.x + GRID.CELL_SIZE / 2,
            enemy.position.y + GRID.CELL_SIZE / 2,
            performance.now(),
            true // stationary
          );
          this.gooBlobs.push(gooBlob);

          // FIFO queue management: max 15 goo blobs
          const MAX_GOO_BLOBS = 15;
          if (this.gooBlobs.length > MAX_GOO_BLOBS) {
            this.gooBlobs.shift(); // Remove oldest
          }
        }
      }

      // Boss Slime: spawn a lesser slime every 5 seconds
      if (enemy.char === 'M') {
        if (enemy.slimeSpawnTimer === undefined) enemy.slimeSpawnTimer = 5.0;
        enemy.slimeSpawnTimer -= deltaTime;
        if (enemy.slimeSpawnTimer <= 0) {
          enemy.slimeSpawnTimer = 5.0;
          const offset = GRID.CELL_SIZE * 1.5;
          const angle = Math.random() * Math.PI * 2;
          const spawnX = enemy.position.x + Math.cos(angle) * offset;
          const spawnY = enemy.position.y + Math.sin(angle) * offset;
          const lesserSlime = new Enemy('o', spawnX, spawnY, this.depth || 0);
          lesserSlime.setCollisionMap(this.currentRoom.collisionMap);
          lesserSlime.setBackgroundObjects(this.currentRoom.backgroundObjects);
          if (this.steamClouds) lesserSlime.setSteamClouds(this.steamClouds);
          lesserSlime.setTarget(this.player);
          this.physicsSystem.addEntity(lesserSlime);
          this.currentRoom.enemies.push(lesserSlime);
        }
      }
    }

    // Process spawn requests
    for (const request of spawnRequests) {
      const newEnemies = this.spawnEnemiesFrom(request.spawner, request.spawnData);
      for (const newEnemy of newEnemies) {
        request.spawner.registerSpawn(newEnemy);
      }
      this.currentRoom.enemies.push(...newEnemies);
    }

    // Update captives (pulsing animation)
    for (const captive of this.captives) {
      captive.update(deltaTime);
    }

    // Update neutral characters (Leshy, NPCs, etc.)
    for (let i = this.neutralCharacters.length - 1; i >= 0; i--) {
      const char = this.neutralCharacters[i];
      char.update(deltaTime, this);

      // Check if Leshy reached exit
      if (char instanceof Leshy && char.reachedExit) {
        // Mark exit as chase event
        const exitDirection = char.targetExit;
        if (this.currentRoom.exits[exitDirection]) {
          // Store chase event flag on exit object (will be checked in exit collision handling)
          if (typeof this.currentRoom.exits[exitDirection] === 'object') {
            this.currentRoom.exits[exitDirection].chaseEvent = true;
          } else {
            // If exit is just a boolean, convert to object
            this.currentRoom.exits[exitDirection] = {
              chaseEvent: true,
              letter: this.currentRoom.exits[exitDirection].letter || '?',
              color: this.currentRoom.exits[exitDirection].color || '#00ff00'
            };
          }

          // Update chase tracking with new exit direction
          this.zoneSystem.startLeshyChase(exitDirection);
        }

        // Remove Leshy from array (despawned)
        this.neutralCharacters.splice(i, 1);
      }
    }

    // Handle item pickup for item-using enemies
    for (const enemy of this.currentRoom.enemies) {
      if (enemy.itemUsage && enemy.itemUsage.canPickup) {
        const targetItem = enemy.evaluateItemPickup(this.items);
        if (targetItem) {
          enemy.targetItem = targetItem;

          // Navigate to item
          const dx = targetItem.position.x - enemy.position.x;
          const dy = targetItem.position.y - enemy.position.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < GRID.CELL_SIZE) {
            // Pickup
            const success = enemy.pickupItem(targetItem);
            if (success) {
              const index = this.items.indexOf(targetItem);
              if (index > -1) {
                this.items.splice(index, 1);
                this.physicsSystem.removeEntity(targetItem);
              }
            }
            enemy.targetItem = null;
          }
        }
      }
    }

    // Update combat
    const combatResult = this.combatSystem.update(
      deltaTime,
      this.player,
      this.currentRoom.enemies,
      this.currentRoom.backgroundObjects,
      this.activeNoiseSource,
      this.currentRoom
    );

    // Spawn drops from objects destroyed this frame (by melee or bullets)
    if (combatResult.objectEffects) {
      for (const { obj, effect } of combatResult.objectEffects) {
        // Skip if this object has already been processed (safety check)
        if (obj.hasDropped) continue;

        // Mark as processed immediately to prevent duplicate checks
        obj.hasDropped = true;

        // Leshy spawn event (fallback for destruction before interaction, e.g., ranged attacks)
        if (obj.leshyBush && !obj.leshySpawned && effect && effect.startsWith('destroyObject')) {
          obj.leshySpawned = true; // Mark to prevent multiple spawns
          const leshy = new Leshy(obj.position.x, obj.position.y, this.currentRoom.exits);
          leshy.startFleeing();
          this.neutralCharacters.push(leshy);
          this.zoneSystem.startLeshyChase(leshy.targetExit);
          console.log(`[Secret] Leshy discovered! Fleeing to ${leshy.targetExit} exit`);
        }

        // Key droppers always drop (bypass dropChance)
        if (obj.dropsKey) {
          this.handleObjectEffect(effect, obj);
        } else {
          // Normal drop chance logic
          const chance = obj.data.dropChance;
          if (chance === undefined || Math.random() < chance) {
            this.handleObjectEffect(effect, obj);
          } else {
            // No drop this time — still mark background dirty if object was destroyed
            if (effect && effect.startsWith('destroyObject')) {
              this.renderer.markBackgroundDirty();
            }
          }
        }
      }
    }

    // Spawn elemental impact particles (fire sparks, ice shards, etc.)
    if (combatResult.impactEffects) {
      const IMPACT_CHARS = {
        burn:   ['!', '+', '.'],
        stun:   ['+', '*', '.'],
        freeze: ['*', '+', '.'],
        poison: ['+', '.', 'o'],
        acid:   ['+', '.', 'o'],
        bleed:  ['+', '.', '*']
      };
      for (const fx of combatResult.impactEffects) {
        // Handle chaff VFX (grass debris from bullet impacts)
        if (fx.effect === 'chaff') {
          const chaffParticles = createChaff(fx.x + GRID.CELL_SIZE / 2, fx.y + GRID.CELL_SIZE / 2);
          for (const particle of chaffParticles) {
            this.particles.push({
              x: particle.position.x,
              y: particle.position.y,
              vx: particle.velocity.vx,
              vy: particle.velocity.vy,
              life: particle.lifetime,
              maxLife: particle.maxLifetime,
              char: particle.char,
              color: particle.color,
              isImpact: true
            });
          }
        } else {
          // Regular elemental impact effects
          const chars = IMPACT_CHARS[fx.onHit] || ['+', '.'];
          const count = 5;
          for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 40 + Math.random() * 60;
            const life = 0.2 + Math.random() * 0.3;
            this.particles.push({
              x: fx.x + GRID.CELL_SIZE / 2,
              y: fx.y + GRID.CELL_SIZE / 2,
              vx: Math.cos(angle) * speed,
              vy: Math.sin(angle) * speed,
              life,
              maxLife: life,
              char: chars[Math.floor(Math.random() * chars.length)],
              color: fx.color || '#ffffff',
              isImpact: true
            });
          }
        }
      }
    }

    // Collect new steam clouds from combat (fire+water reactions)
    if (combatResult.newSteamClouds && combatResult.newSteamClouds.length > 0) {
      for (const cloud of combatResult.newSteamClouds) {
        this.steamClouds.push(cloud);
      }
    }

    // Process polymorph transformations (Transmutation Wand)
    if (combatResult.polymorphEvents && combatResult.polymorphEvents.length > 0) {
      for (const event of combatResult.polymorphEvents) {
        const enemy = event.enemy;
        const pos = event.position;

        // Remove the polymorphed enemy
        const enemyIndex = this.currentRoom.enemies.indexOf(enemy);
        if (enemyIndex !== -1) {
          this.currentRoom.enemies.splice(enemyIndex, 1);

          // Create transformation particle effect
          for (let i = 0; i < 20; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 50 + Math.random() * 100;
            this.particles.push({
              x: pos.x + GRID.CELL_SIZE / 2,
              y: pos.y + GRID.CELL_SIZE / 2,
              vx: Math.cos(angle) * speed,
              vy: Math.sin(angle) * speed,
              life: 0.5 + Math.random() * 0.5,
              maxLife: 1.0,
              char: '*',
              color: '#ff00ff',
              isImpact: true
            });
          }

          // Polymorph transformation - weighted random outcome
          const roll = Math.random() * 100; // 0-100
          let outcome = null;

          if (roll < 20) {
            // 20% - Background object (removes enemy)
            const objects = ['%', '&', '0', 'Y', '*', '#', 'p', '=', 'i', '!', 'B', 'Q', '~'];
            const randomObj = objects[Math.floor(Math.random() * objects.length)];
            this.currentRoom.backgroundObjects.push(new BackgroundObject(randomObj, pos.x, pos.y));
            outcome = `background object (${randomObj})`;
          } else if (roll < 40) {
            // 20% - Lesser enemy (weaker enemy spawn)
            const lesserEnemies = ['o', 'g']; // Slime, Goblin (basic enemies)
            const randomEnemy = lesserEnemies[Math.floor(Math.random() * lesserEnemies.length)];
            this.currentRoom.enemies.push(new Enemy(randomEnemy, pos.x, pos.y));
            outcome = `lesser enemy (${randomEnemy})`;
          } else if (roll < 60) {
            // 20% - Item drop (random weapon/armor/consumable)
            const allItems = Object.keys(ITEMS).filter(char =>
              ITEMS[char].type === ITEM_TYPES.WEAPON ||
              ITEMS[char].type === ITEM_TYPES.ARMOR ||
              ITEMS[char].type === ITEM_TYPES.CONSUMABLE
            );
            if (allItems.length > 0) {
              const randomItem = allItems[Math.floor(Math.random() * allItems.length)];
              this.currentRoom.items.push(new Item(randomItem, pos.x, pos.y));
              outcome = `item drop (${ITEMS[randomItem].name})`;
            }
          } else if (roll < 80) {
            // 20% - Equivalent enemy (different enemy of similar strength)
            const equivalentEnemies = ['o', 'g', 's', 'b', 'r', 't', 'w']; // Various enemies
            const randomEnemy = equivalentEnemies[Math.floor(Math.random() * equivalentEnemies.length)];
            this.currentRoom.enemies.push(new Enemy(randomEnemy, pos.x, pos.y));
            outcome = `equivalent enemy (${randomEnemy})`;
          } else {
            // 20% - BOSS! (dangerous outcome)
            const bossEnemies = ['D', 'W', 'G', 'S']; // Dragon, Wizard, Golem, etc.
            const randomBoss = bossEnemies[Math.floor(Math.random() * bossEnemies.length)];
            const boss = new Enemy(randomBoss, pos.x, pos.y);
            this.currentRoom.enemies.push(boss);
            outcome = `BOSS! (${randomBoss})`;
          }

        }
      }
    }

    // Check consumable activation and update windups (delegated to InventorySystem)
    // Check activation AFTER combat so damage-reactive thresholds (heal, speed, block)
    // see the post-hit HP value. "Immediate" consumables (maxhp, luck) also fire here
    // on their first frame — one frame delay is fine.
    this.inventorySystem.update(
      deltaTime,
      this.player,
      this.currentRoom,
      this.combatSystem,
      this.steamClouds,
      this.particles
    );

    // If a heal consumable fired and restored HP, treat the player as alive
    const playerDied = combatResult.playerDead || burnKilledPlayer || lavaKilledPlayer;
    if (playerDied && this.player.hp > 0) {
      // Give brief invuln so the restored player doesn't instantly die again
      this.player.invulnerabilityTimer = Math.max(this.player.invulnerabilityTimer, 1.0);
    }

    if (playerDied && this.player.hp <= 0) {
      console.log(`\n💀 ═══════════════════════════════════════════════════════════`);
      console.log(`💀 PLAYER DEATH DETECTED`);
      console.log(`💀 Final HP: ${this.player.hp}/${this.player.maxHp}`);
      console.log(`💀 Defense: ${this.player.defense}`);
      console.log(`💀 Zone: ${this.zoneSystem.currentZone} | Depth: ${this.getCurrentZoneDepth()}`);
      console.log(`💀 ═══════════════════════════════════════════════════════════\n`);

      // Check for Phoenix Feather death intercept
      const reviveIdx = (this.player.equippedConsumables || []).findIndex(c => c?.data?.effect === 'revive');
      if (reviveIdx !== -1) {
        const feather = this.player.equippedConsumables[reviveIdx];
        this.player.hp = Math.floor(this.player.maxHp * 0.5);
        this.player.invulnerabilityTimer = 2.0;
        this.combatSystem.createDamageNumber(
          feather.char,
          this.player.position.x,
          this.player.position.y - GRID.CELL_SIZE * 0.5,
          feather.color
        );
        const burst = createActivationBurst(this.player.position.x, this.player.position.y, feather.color);
        this.particles.push(...burst);
        this.inventorySystem.equippedConsumables[reviveIdx] = null;
        this.player.equippedConsumables[reviveIdx] = null;
        this.inventorySystem.spentConsumableSlots[reviveIdx] = true;
        this.saveGameState();
        console.log('✨ Phoenix Feather activated — death intercepted! HP restored to ' + this.player.hp);
        // fall through — do NOT transition to GAME_OVER
      } else {
        // Create explosion at player position
        const explosion = createExplosion(
          this.player.position.x + GRID.CELL_SIZE / 2,
          this.player.position.y + GRID.CELL_SIZE / 2,
          20,
          this.player.color
        );
        this.particles.push(...explosion);

        // Add particles to physics system
        for (const particle of explosion) {
          this.physicsSystem.addEntity(particle);
        }

        console.log('⚰️  Character died...');

        // Mark current character as dead
        const diedCharacter = this.activeCharacterType;
        if (!this.deadCharacters.includes(diedCharacter)) {
          this.deadCharacters.push(diedCharacter);
        }

        // Find next available living character
        const livingCharacters = this.unlockedCharacters.filter(
          type => !this.deadCharacters.includes(type)
        );

        if (livingCharacters.length > 0) {
          // Show death message
          const diedCharData = CHARACTER_TYPES[diedCharacter];
          this.showPickupMessage(`${diedCharData.name} is lost`);

          // Clear active items (lost with the dead character)
          // Keep: restInventory (banked ingredients), itemChest, armorInventory, consumableInventory (REST storage persists)
          // Note: Player loses any ingredients collected during current EXPLORE run (in player.inventory)
          // but keeps banked ingredients (in restInventory)
          this.inventorySystem.restQuickSlots = [null, null, null]; // Clear equipped weapons
          this.inventorySystem.restActiveSlotIndex = 0;
          this.inventorySystem.equippedArmor = null; // Clear active armor
          this.inventorySystem.equippedConsumables = [null, null]; // Clear active consumables

          // Respawn as next character
          const nextCharacter = livingCharacters[0];
          this.activeCharacterType = nextCharacter;
          console.log(`🔄 Respawning as ${CHARACTER_TYPES[nextCharacter].name}`);

          // Clear combat system before transitioning
          this.combatSystem.clear();

          // Return to REST with new character
          this.stateMachine.transition(GAME_STATES.REST);
          return;
        } else {
          // All characters dead - game over
          console.log('💀 All characters have died - GAME OVER');

          // Clear combat system before transitioning
          this.combatSystem.clear();

          this.stateMachine.transition(GAME_STATES.GAME_OVER);
          return;
        }
      }
    }

    // Remove dead enemies and spawn loot + debris
    for (let i = this.currentRoom.enemies.length - 1; i >= 0; i--) {
      const enemy = this.currentRoom.enemies[i];
      if (enemy.hp <= 0) {
        // Play destroy sound effect
        this.audioSystem.playSFX('destroy');

        // Check spawn on death
        if (enemy.spawning && enemy.spawning.spawnOnDeath) {
          const deathSpawns = this.spawnEnemiesFrom(enemy, {
            spawnChar: enemy.spawning.spawnChar,
            spawnCount: enemy.spawning.spawnOnDeathCount || 3,
            spawnRange: enemy.spawning.spawnRange,
            spawnerPosition: { x: enemy.position.x, y: enemy.position.y }
          });
          this.currentRoom.enemies.push(...deathSpawns);
        }

        // Notify parent spawner
        if (enemy.spawner) {
          enemy.spawner.notifySpawnDeath(enemy);
        }

        // Drop inventory items
        const itemDrops = enemy.dropInventory();
        this.items.push(...itemDrops);
        for (const item of itemDrops) {
          this.physicsSystem.addEntity(item);
        }

        this.spawnLoot(enemy);

        // Create debris at enemy position
        const enemyDebris = createDebris(
          enemy.position.x + GRID.CELL_SIZE / 2,
          enemy.position.y + GRID.CELL_SIZE / 2,
          4 + Math.floor(Math.random() * 3), // 4-6 pieces
          '#666666'
        );
        this.debris.push(...enemyDebris);

        // Add debris to physics system
        for (const piece of enemyDebris) {
          this.physicsSystem.addEntity(piece);
        }

        this.physicsSystem.removeEntity(enemy);
        this.currentRoom.enemies.splice(i, 1);
      }
    }

    // Mute layer 2 (bassline) when all enemies are cleared
    if (this.currentRoom.enemies.length === 0) {
      this.audioSystem.setLayer2Enabled(false);
    }

    // Update background object animations and fire propagation
    for (const obj of this.currentRoom.backgroundObjects) {
      if (obj.update) {
        obj.update(deltaTime);
      }

      // Grass bending: change grass char based on player position
      // Only affect tall grass (|), not cut grass (,) or other slowing objects
      if (obj.char === '|' && obj.data && obj.data.slowing) {
        const dx = obj.position.x - this.player.position.x;
        const dy = obj.position.y - this.player.position.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Initialize render offset if not present
        if (!obj.grassRenderOffset) {
          obj.grassRenderOffset = { x: 0, y: 0 };
        }

        // Bend grass only when player overlaps or is very close (within 0.8 tiles)
        // This matches the visual collision better
        if (dist < GRID.CELL_SIZE * 0.7) {
          const oldChar = obj.char;
          // Determine bend direction based on horizontal position relative to player
          if (dx > GRID.CELL_SIZE * 0.25) {
            // Grass is significantly to the right of player - bend right
            obj.char = '/';
            obj.grassRenderOffset.x = GRID.CELL_SIZE * 0.25; // Offset right (quarter tile)
          } else if (dx < -GRID.CELL_SIZE * 0.25) {
            // Grass is significantly to the left of player - bend left
            obj.char = '\\';
            obj.grassRenderOffset.x = -GRID.CELL_SIZE * 0.25; // Offset left (quarter tile)
          } else {
            // Grass is directly above/below player - keep straight
            obj.char = '|';
            obj.grassRenderOffset.x = 0; // No offset
          }
        } else {
          // Reset to straight grass when player moves away
          obj.char = '|';
          obj.grassRenderOffset.x = 0;
        }
      }

      // Generate embers from burning objects
      if (obj.onFire && !obj.destroyed) {
        const emberCount = obj.flammability === 'high' ? 3 : 1;
        const emberChance = emberCount * deltaTime;

        if (Math.random() < emberChance) {
          const angle = Math.random() * Math.PI * 2;
          const speed = Math.random() * 50 + 30;
          const travelDist = obj.flammability === 'high' ? 48 : 32;

          const ember = {
            x: obj.position.x + GRID.CELL_SIZE / 2,
            y: obj.position.y + GRID.CELL_SIZE / 2,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 20, // Slight upward bias
            life: travelDist / speed,
            maxLife: travelDist / speed,
            char: '.',
            color: '#ff6600',
            size: 3,
            isEmber: true
          };
          this.particles.push(ember);

          // Check if ember ignites other objects (5% chance)
          if (Math.random() < 0.05) {
            for (const otherObj of this.currentRoom.backgroundObjects) {
              if (otherObj !== obj && !otherObj.destroyed && otherObj.isFlammable()) {
                const dx = otherObj.position.x - ember.x;
                const dy = otherObj.position.y - ember.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < 16) { // Close enough to ignite
                  otherObj.ignite();
                }
              }
            }
          }
        }

        // Check adjacent objects for fire spread (15% chance per second)
        if (Math.random() < 0.15 * deltaTime) {
          for (const otherObj of this.currentRoom.backgroundObjects) {
            if (otherObj !== obj && !otherObj.destroyed && otherObj.isFlammable()) {
              const dx = otherObj.position.x - obj.position.x;
              const dy = otherObj.position.y - obj.position.y;
              const dist = Math.sqrt(dx * dx + dy * dy);

              if (dist < 32) { // Adjacent
                otherObj.ignite();
              }
            }
          }
        }
      }
    }

    // Remove destroyed objects
    this.currentRoom.backgroundObjects = this.currentRoom.backgroundObjects.filter(obj => !obj.destroyed);
    this.backgroundObjects = this.currentRoom.backgroundObjects; // Update local reference
    this.renderer.markBackgroundDirty();

    // Update shared game elements (particles, debris, etc.)
    this.updateSharedGameElements(deltaTime);

    // Update ingredient attraction
    for (let i = this.ingredients.length - 1; i >= 0; i--) {
      const ingredient = this.ingredients[i];
      const shouldPickup = this.physicsSystem.applyAttraction(ingredient, this.player);

      if (shouldPickup) {
        this.player.addIngredient(ingredient.char);
        this.physicsSystem.removeEntity(ingredient);
        this.ingredients.splice(i, 1);
      }
    }

    // EXPLORE state: No item magnetization - all items require manual pickup with SPACE
    // (Only ingredients magnetize in all game states)

    // Update steam clouds (fire+water reaction and Steam Vial)
    for (let i = this.steamClouds.length - 1; i >= 0; i--) {
      this.steamClouds[i].timer -= deltaTime;
      if (this.steamClouds[i].timer <= 0) {
        this.steamClouds.splice(i, 1);
      }
    }

    // Push steam clouds to enemies and combat system for vision checks
    for (const enemy of this.currentRoom.enemies) {
      enemy.steamClouds = this.steamClouds;
    }

    // Check if room cleared
    if (this.currentRoom.enemies.length === 0) {
      // Only process room clear once
      if (!this.currentRoom.cleared) {
        this.currentRoom.cleared = true;

        // Track room clear in current zone (for per-zone captive spawning)
        const currentZone = this.currentRoom.zone || 'green';
        this.zoneSystem.recordRoomClear(currentZone);

        // Check if we should spawn a captive (5 rooms in current colored zone)
        if (this.zoneSystem.shouldSpawnCaptive(currentZone)) {
          const captive = this.spawnCaptive(currentZone); // Spawn captive matching zone
          if (captive) {
            this.captives.push(captive);
            this.zoneSystem.markZoneCleared(currentZone);
            console.log(`Spawned ${currentZone} captive! (5 rooms cleared in ${currentZone} zone)`);
          }
        }

        // Apply secret events (key glitter, leshy chase, etc.)
        // Uses priority system - only 1 event per room
        this.roomGenerator.applySecretEvents(this.currentRoom);
      }

      // Unlock exits (letters are already generated)
      this.currentRoom.exitsLocked = false;
      // Update collision map to open exits
      this.updateExitCollisions();
    }

    // Check for exits (with crossing detection for fast dodge rolls)
    const gridPos = this.player.getGridPosition();
    const prevGridPos = {
      x: Math.floor(this.previousPlayerPosition.x / GRID.CELL_SIZE),
      y: Math.floor(this.previousPlayerPosition.y / GRID.CELL_SIZE)
    };
    const centerX = Math.floor(GRID.COLS / 2);
    const centerY = Math.floor(GRID.ROWS / 2);

    // North exit check (warp zone is at rows 1-2, below the wall)
    const inNorthExit = gridPos.y <= 2 && Math.abs(gridPos.x - centerX) <= 1;
    const crossedNorthExit = prevGridPos.y > 2 && gridPos.y <= 2 && Math.abs(gridPos.x - centerX) <= 1;
    if ((inNorthExit || crossedNorthExit) && this.currentRoom.exits.north && !this.currentRoom.exitsLocked) {
      const exitObj = this.currentRoom.exits.north;
      this.zoneSystem.recordExit(exitObj);
      const letterPath = this.zoneSystem.pathHistory.map(exit => exit.letter).join('-');

      // Check for secret patterns
      const secret = this.exitSystem.checkSecretPattern(this.zoneSystem.pathHistory);
      if (secret) {
        // TODO: Trigger secret room or reward
      }

      // Check for Leshy chase event
      if (exitObj.chaseEvent) {
        const playerFollowed = 'north' === this.zoneSystem.leshyLastExitDirection;
        const result = this.zoneSystem.recordLeshyChase(playerFollowed);

        if (result === 'leshyGrove') {
          console.log('[Secret] 3rd chase successful! Entering Leshy Grove...');
          this.transitionToNeutralRoom('leshyGrove');
          return;
        } else if (result === 'continue') {
          // Fall through to normal room generation
        } else {
          // Fall through to normal room generation
        }
      }

      this.enterExploreState('north', exitObj); // Entering from North → spawn at South
    }
    // South exit check
    else {
      const inSouthExit = gridPos.y >= GRID.ROWS - 2 && Math.abs(gridPos.x - centerX) <= 1;
      const crossedSouthExit = prevGridPos.y < GRID.ROWS - 2 && gridPos.y >= GRID.ROWS - 2 && Math.abs(gridPos.x - centerX) <= 1;

      // South exit opens if: 1) exits unlocked, 2) player has no items (escape route), OR 3) south exit exists
      const canUseSouthExit = this.currentRoom.exits.south && (!this.currentRoom.exitsLocked || this.playerHasNoItems());

      if ((inSouthExit || crossedSouthExit) && canUseSouthExit) {
        // South exit is always boolean (returns to REST), not a letter
        const escapeRoute = this.currentRoom.exitsLocked && this.playerHasNoItems();

        this.bankLoot();

        // Save EXPLORE room state before returning to REST (prevents room cycling cheat)
        this.inventorySystem.saveExploreRoom(
          this.currentRoom,
          this.items,
          this.ingredients,
          this.placedTraps,
          this.currentRoom.enemies,
          this.currentRoom.backgroundObjects,
          this.captives
        );
        this.savedExploreEnemies = [...this.currentRoom.enemies];
        this.savedExploreBackgroundObjects = [...this.backgroundObjects];
        this.savedExploreCaptives = [...this.captives];

        // Clear combat system (projectiles, melee attacks, etc.) before transitioning
        this.combatSystem.clear();

        this.stateMachine.transition(GAME_STATES.REST);
        // Don't reset depth - it should persist to show max depth reached
      }
      // East exit check (right border, centered vertically)
      else {
        const inEastExit = gridPos.x >= GRID.COLS - 2 && Math.abs(gridPos.y - centerY) <= 1;
        const crossedEastExit = prevGridPos.x < GRID.COLS - 2 && gridPos.x >= GRID.COLS - 2 && Math.abs(gridPos.y - centerY) <= 1;
        if ((inEastExit || crossedEastExit) && this.currentRoom.exits.east && !this.currentRoom.exitsLocked) {
          const exitObj = this.currentRoom.exits.east;
          this.zoneSystem.recordExit(exitObj);
          const letterPath = this.zoneSystem.pathHistory.map(exit => exit.letter).join('-');

          // Check for secret patterns
          const secret = this.exitSystem.checkSecretPattern(this.zoneSystem.pathHistory);
          if (secret) {
            // TODO: Trigger secret room or reward
          }

          // Check for Leshy chase event
          if (exitObj.chaseEvent) {
            const playerFollowed = 'east' === this.zoneSystem.leshyLastExitDirection;
            const result = this.zoneSystem.recordLeshyChase(playerFollowed);

            if (result === 'leshyGrove') {
              console.log('[Secret] 3rd chase successful! Entering Leshy Grove...');
              this.transitionToNeutralRoom('leshyGrove');
              return;
            } else if (result === 'continue') {
              // Fall through to normal room generation
            } else {
                  // Fall through to normal room generation
            }
          }

          this.enterExploreState('east', exitObj); // Entering from East → spawn at West
        }
        // West exit check (left border, centered vertically)
        else {
          const inWestExit = gridPos.x <= 1 && Math.abs(gridPos.y - centerY) <= 1;
          const crossedWestExit = prevGridPos.x > 1 && gridPos.x <= 1 && Math.abs(gridPos.y - centerY) <= 1;
          if ((inWestExit || crossedWestExit) && this.currentRoom.exits.west && !this.currentRoom.exitsLocked) {
            const exitObj = this.currentRoom.exits.west;
            this.zoneSystem.recordExit(exitObj);
            const letterPath = this.zoneSystem.pathHistory.map(exit => exit.letter).join('-');

            // Check for secret patterns
            const secret = this.exitSystem.checkSecretPattern(this.zoneSystem.pathHistory);
            if (secret) {
                // TODO: Trigger secret room or reward
            }

            // Check for Leshy chase event
            if (exitObj.chaseEvent) {
              const playerFollowed = 'west' === this.zoneSystem.leshyLastExitDirection;
              const result = this.zoneSystem.recordLeshyChase(playerFollowed);

              if (result === 'leshyGrove') {
                console.log('[Secret] 3rd chase successful! Entering Leshy Grove...');
                this.transitionToNeutralRoom('leshyGrove');
                return;
              } else if (result === 'continue') {
                  // Fall through to normal room generation
              } else {
                      // Fall through to normal room generation
              }
            }

            this.enterExploreState('west', exitObj); // Entering from West → spawn at East
          }
        }
      }
    }

    this.updateUI();
  }

  handleSpacePress() {
    const state = this.stateMachine.getCurrentState();

    if (state === GAME_STATES.TITLE) {
      if (!this.introAnimationStarted) {
        // Start the intro animation and music together
        this.introAnimationStarted = true;
        this.audioSystem.play();
        this.renderer.markBackgroundDirty();
        return;
      } else {
        // Animation is playing, skip to REST (music continues)
        this.stateMachine.transition(GAME_STATES.REST);
        return;
      }
    }

    // EXPLORE: Check vault unlock first (higher priority than traps)
    if (state === GAME_STATES.EXPLORE) {

      // Try to unlock vault if player is in position with key
      if (this.canUnlockVault()) {
        this.unlockVault();
        return;
      }

      // Place trap if holding one and it hasn't been used this room
      if (this.player.canUseTrap()) {
        this.placeTrap();
        return;
      }
    }

    if (state === GAME_STATES.GAME_OVER) {
      // Only allow space press after 2-second delay
      if (this.gameOverWaitingForSpace && this.gameOverDeathTimer <= 0) {
        this.gameOverWaitingForSpace = false;
        this.particles = [];
        this.debris = [];
        this.gooBlobs = [];

        // Reset all zone depths on death
        this.zoneDepths = {
          green: 0,
          red: 0,
          cyan: 0,
          yellow: 0,
          gray: 0
        };

        // Clear held items on death (but keep crafting slots)
        this.inventorySystem.restQuickSlots = [null, null, null];
        this.inventorySystem.restActiveSlotIndex = 0;

        // Clear all inventories and equipment on death (true roguelike)
        this.inventorySystem.handleGameOver();

        // Reset character system for new run
        this.deadCharacters = [];
        this.activeCharacterType = 'default';
        this.unlockedCharacters = ['default']; // Reset to only default character
        this.captives = []; // Clear active captives
        this.characterNPCs = []; // Clear character NPCs in REST
        this.zoneSystem.resetOnDeath(); // Reset zone system and captive tracking

        // Clear crafting slots and wipe localStorage save
        this.craftingSystem.setState({ leftSlot: null, rightSlot: null, centerSlot: null });
        this.persistenceSystem.clearSave();

        if (this.player) {
          this.player.reset();
        }
        this.stateMachine.transition(GAME_STATES.REST);
      }
      return;
    }

    if (state === GAME_STATES.REST) {
      // Get the nearest interactive slot
      const nearestSlot = this.getNearestInteractiveSlot();

      if (nearestSlot) {
        // Handle armor slot - open armor selection menu
        if (nearestSlot.type === 'equipment-armor') {
          this.openEquipmentMenu('armor');
          return;
        }

        // Handle consumable slot 1 - open consumable selection menu
        if (nearestSlot.type === 'equipment-consumable1') {
          this.openEquipmentMenu('consumable1');
          return;
        }

        // Handle consumable slot 2 - open consumable selection menu
        if (nearestSlot.type === 'equipment-consumable2') {
          this.openEquipmentMenu('consumable2');
          return;
        }

        // Handle chest - open retrieval menu
        if (nearestSlot.type === 'equipment-chest') {
          this.openChestRetrievalMenu();
          return;
        }

        // Handle left crafting slot
        if (nearestSlot.type === 'crafting-left') {
          if (this.craftingSystem.leftSlot) {
            // Claim item from slot
            const char = this.craftingSystem.clearLeftSlot();
            if (char) {
              if (isIngredient(char)) {
                // Return ingredient to inventory
                this.player.addIngredient(char);
              } else if (isItem(char)) {
                // Create item entity and route to correct inventory
                const item = new Item(char, this.player.position.x, this.player.position.y);
                if (item.data.type === 'ARMOR') {
                  this.inventorySystem.armorInventory.push(item);
                } else if (item.data.type === 'CONSUMABLE') {
                  this.inventorySystem.consumableInventory.push(item);
                } else if (item.data.type === 'WEAPON' || item.data.type === 'TRAP') {
                  this.player.pickupItem(item);
                }
              }
            }
            this.renderer.markBackgroundDirty();
            this.updateUI();
          } else {
            // Open 3-column crafting menu
            this.openCraftingMenu('left');
          }
          return;
        }

        // Handle right crafting slot
        if (nearestSlot.type === 'crafting-right') {
          if (this.craftingSystem.rightSlot) {
            // Claim item from slot
            const char = this.craftingSystem.clearRightSlot();
            if (char) {
              if (isIngredient(char)) {
                // Return ingredient to inventory
                this.player.addIngredient(char);
              } else if (isItem(char)) {
                // Create item entity and route to correct inventory
                const item = new Item(char, this.player.position.x, this.player.position.y);
                if (item.data.type === 'ARMOR') {
                  this.inventorySystem.armorInventory.push(item);
                } else if (item.data.type === 'CONSUMABLE') {
                  this.inventorySystem.consumableInventory.push(item);
                } else if (item.data.type === 'WEAPON' || item.data.type === 'TRAP') {
                  this.player.pickupItem(item);
                }
              }
            }
            this.renderer.markBackgroundDirty();
            this.updateUI();
          } else {
            // Open 3-column crafting menu
            this.openCraftingMenu('right');
          }
          return;
        }

        // Handle center crafting slot
        if (nearestSlot.type === 'crafting-center') {
          // If center has item, claim it
          if (this.craftingSystem.centerSlot) {
            // Claim item from center slot
            const item = this.craftingSystem.claimCraftedItem(
              this.player.position.x,
              this.player.position.y
            );

            if (item) {
              // Route to correct inventory based on type
              if (item.data.type === 'ARMOR') {
                this.inventorySystem.armorInventory.push(item);
              } else if (item.data.type === 'CONSUMABLE') {
                this.inventorySystem.consumableInventory.push(item);
              } else if (item.data.type === 'WEAPON' || item.data.type === 'TRAP') {
                const droppedItem = this.player.pickupItem(item);
                if (droppedItem) {
                  this.inventorySystem.addToChest(droppedItem);
                }
              }
              this.showPickupMessage(item.data.name);
              this.renderer.markBackgroundDirty();
              this.updateUI();
            }
            return;
          } else if (!this.craftingSystem.leftSlot && !this.craftingSystem.rightSlot) {
            // Center is empty and no ingredients present - open reverse crafting menu
            this.openCraftingMenu('center');
            return;
          }
          // If ingredient slots are occupied, block interaction to prevent overwriting them
          return;
        }
      }

      // Check for character NPC interaction (swap characters)
      let nearbyNPC = null;
      for (const npc of this.characterNPCs) {
        const dist = Math.hypot(
          this.player.position.x - npc.position.x,
          this.player.position.y - npc.position.y
        );
        if (dist < INTERACTION_RANGE) {
          nearbyNPC = npc;
          break;
        }
      }

      if (nearbyNPC) {
        // Swap with this character
        this.swapWithCharacter(nearbyNPC.characterType);
        return;
      }

      // Not near any interactive slot or NPC - allow weapon preview/attack
      if (this.player.heldItem && this.player.canAttack()) {
        this.attackSequenceActive = true; // Mark that attack was initiated by button press (even if windup delays it)
        const attack = this.player.useHeldItem();
        if (attack) {
          // Debug logging for wands
          if (this.player.heldItem.data.weaponType === 'WAND') {
            const enemies = this.currentRoom ? this.currentRoom.enemies : [];
          }
          this.combatSystem.createAttack(this.applyGreenDamageModifier(attack), this.currentRoom ? this.currentRoom.enemies : []);
          this.triggerGreenActionCooldown();
        }
      }
    } else if (state === GAME_STATES.EXPLORE) {
      // Reset captive interaction flag
      this.captiveInteractionThisFrame = false;

      // Captive interaction takes highest priority (prevents all other actions)
      if (this.checkCaptiveInteraction()) {
        return; // Exit immediately, no weapon attack or other actions
      }

      // Item pickup takes priority over attacking (armor, consumables, weapons, placed traps)
      const hasNearbyItem = this.items.some(
        item => this.physicsSystem.getDistance(this.player, item) < 20
      );

      if (hasNearbyItem) {
        // Pick up nearby item (overrides attacking)
        this.tryPickupItem();
        return; // Exit - successful pickup prevents attack
      }

      // If player has a weapon and can attack, attack
      if (this.player.heldItem && !this.captiveInteractionThisFrame && this.player.canAttack()) {
        // Attack — melee AoE handles object damage directly via CombatSystem
        this.attackSequenceActive = true; // Mark that attack was initiated by button press (even if windup delays it)
        const wasBowCharging = this.player.heldItem.data.weaponType === 'BOW' && this.player.heldItem.isCharging;
        const attack = this.player.useHeldItem();
        // Play bow charge SFX when charging begins (use() sets isCharging on first press)
        if (!wasBowCharging && this.player.heldItem && this.player.heldItem.data.weaponType === 'BOW' && this.player.heldItem.isCharging) {
          this.audioSystem.playStoppableSFX('charge_bow');
        }
        if (attack) {
          // Debug logging for wands
          if (this.player.heldItem.data.weaponType === 'WAND') {
            const enemies = this.currentRoom ? this.currentRoom.enemies : [];
          }
          this.combatSystem.createAttack(this.applyGreenDamageModifier(attack), this.currentRoom ? this.currentRoom.enemies : []);
          this.triggerGreenActionCooldown();
        }
      } else {
        // Unarmed and no item nearby: interact with background object if present
        const nearbyObject = this.findNearbyBackgroundObject();
        if (nearbyObject) {
          this.interactWithObject(nearbyObject);
        }
      }
    } else if (state === GAME_STATES.NEUTRAL) {
      // NEUTRAL state: Interact with Leshy grass or other neutral room objects
      const nearbyObject = this.findNearbyBackgroundObject();


      if (nearbyObject && nearbyObject.leshyGrass && nearbyObject.char === '|') {

        // Call neutral room system to handle interaction (grass cutting)
        const result = this.neutralRoomSystem.handleInteraction(nearbyObject, this.player, this.currentRoom);


        // Add spawned entities to game (separate ingredients from items)
        if (result && result.spawnedItems) {

          let ingredientCount = 0;
          let itemCount = 0;

          for (const entity of result.spawnedItems) {
            // Route to appropriate array based on entity type
            if (entity instanceof Ingredient) {
              this.ingredients.push(entity);
              ingredientCount++;
            } else {
              this.items.push(entity);
              itemCount++;
            }
            this.physicsSystem.addEntity(entity);
          }


          // Mark background dirty to update cut grass display
          this.renderer.markBackgroundDirty();
        } else {
        }
      }
    }
  }

  handleShiftPress() {
    const state = this.stateMachine.getCurrentState();

    if (state === GAME_STATES.REST) {
      // Get the nearest interactive slot
      const nearestSlot = this.getNearestInteractiveSlot();

      if (nearestSlot) {
        // Handle chest - store current held item
        if (nearestSlot.type === 'equipment-chest') {
          if (this.player.heldItem) {
            this.inventorySystem.addToChest(this.player.heldItem);
            this.player.quickSlots[this.player.activeSlotIndex] = null;

            // Auto-switch to next filled slot if available
            const nextFilled = this.player.quickSlots.findIndex((slot, idx) =>
              idx !== this.player.activeSlotIndex && slot !== null
            );
            if (nextFilled !== -1) {
              this.player.activeSlotIndex = nextFilled;
            }

            this.saveGameState();
            this.updateUI();
          }
          return;
        }


        // Place held item in crafting slot (if player has held item)
        if (this.player.heldItem) {
          // Handle center crafting slot (reverse crafting)
          if (nearestSlot.type === 'crafting-center' && !this.craftingSystem.centerSlot && !this.craftingSystem.leftSlot && !this.craftingSystem.rightSlot) {
            const itemChar = this.player.heldItem.char;
            const recipe = findRecipeByResult(itemChar);

            if (recipe) {
              // This is a craftable item - populate all three slots
              this.craftingSystem.leftSlot = recipe.left;
              this.craftingSystem.rightSlot = recipe.right;
              this.craftingSystem.centerSlot = itemChar;

              // Remove from active slot
              this.player.quickSlots[this.player.activeSlotIndex] = null;

              this.saveGameState();
              this.renderer.markBackgroundDirty();
              this.updateUI();
            }
            // If not craftable, do nothing (no feedback needed)
            return;
          }

          // Handle left crafting slot
          if (nearestSlot.type === 'crafting-left' && !this.craftingSystem.leftSlot) {
            this.craftingSystem.setLeftSlot(this.player.heldItem.char);
            this.player.quickSlots[this.player.activeSlotIndex] = null;
            this.renderer.markBackgroundDirty();
            this.updateUI();
            return;
          }

          // Handle right crafting slot
          if (nearestSlot.type === 'crafting-right' && !this.craftingSystem.rightSlot) {
            this.craftingSystem.setRightSlot(this.player.heldItem.char);
            this.player.quickSlots[this.player.activeSlotIndex] = null;
            this.renderer.markBackgroundDirty();
            this.updateUI();
            return;
          }
        }
      }
    }

    if (state === GAME_STATES.EXPLORE) {
      // Check for nearby item to swap with
      let nearbyItem = null;
      for (const item of this.items) {
        const distance = this.physicsSystem.getDistance(this.player, item);
        if (distance < INTERACTION_RANGE) {
          nearbyItem = item;
          break;
        }
      }

      if (this.player.heldItem && nearbyItem) {
        // Only allow swapping weapons with weapons
        if (nearbyItem.data.type === 'WEAPON') {
          // Swap weapons
          const droppedItem = this.player.pickupItem(nearbyItem);

          // Show pickup message for swapped item
          this.showPickupMessage(nearbyItem.data.name);

          // Remove picked up item
          const itemIndex = this.items.indexOf(nearbyItem);
          if (itemIndex > -1) {
            this.physicsSystem.removeEntity(nearbyItem);
            this.items.splice(itemIndex, 1);
          }

          // Drop previous item if any
          if (droppedItem) {
            this.items.push(droppedItem);
            this.physicsSystem.addEntity(droppedItem);
          }
        }
        // If nearby item is armor/consumable, do nothing (SHIFT is only for weapon swapping)
      } else if (this.player.heldItem && !nearbyItem) {
        // Drop held item — if it's a persistent TRAP, place and activate it
        const heldData = this.player.heldItem.data || this.player.heldItem;
        if (heldData.type === 'TRAP' && !heldData.oneShot) {
          // Persistent placeables only (Music Box, Noise-maker, Tesla Coil, Goo Dispenser)
          const droppedItem = this.player.dropItem();
          const trapItem = new Item(
            droppedItem.char,
            this.player.position.x,
            this.player.position.y
          );
          trapItem.isPlaced = true;
          const trapData = droppedItem.data || droppedItem;
          this.placedTraps.push({
            item: trapItem,
            tickTimer: trapData.tickInterval || 0,
            activeDuration: trapData.activeDuration != null ? trapData.activeDuration : Infinity,
            affectedEnemies: new Set()
          });
          this.showPickupMessage('trap placed');
        } else {
          // Drop held weapon normally (one-shot traps are placed with spacebar, not Q)
          const droppedItem = this.player.dropItem();
          const item = new Item(
            droppedItem.char,
            this.player.position.x,
            this.player.position.y
          );
          this.items.push(item);
          this.physicsSystem.addEntity(item);
        }
      }
    }

    this.updateUI();
  }

  handleCycleNext() {
    const state = this.stateMachine.getCurrentState();
    if (state !== GAME_STATES.EXPLORE && state !== GAME_STATES.REST) return;

    this.player.cycleSlotNext();
    this.updateUI();
  }

  handleCyclePrevious() {
    const state = this.stateMachine.getCurrentState();
    if (state !== GAME_STATES.EXPLORE && state !== GAME_STATES.REST) return;

    this.player.cycleSlotPrevious();
    this.updateUI();
  }

  handleMPress() {
    const state = this.stateMachine.getCurrentState();
    if (state !== GAME_STATES.REST) return;

    this.enterMazeTestRoom();
  }

  handleVPress() {
    // Toggle vector visualization
    this.showVectors = !this.showVectors;
    console.log(`Vector visualization: ${this.showVectors ? 'ON' : 'OFF'}`);
  }

  spawnCheatItem(itemData) {
    const { char, type, name } = itemData;
    console.log('[CHEAT] Spawning item:', name, type);

    if (type === ITEM_TYPES.INGREDIENT) {
      // Add ingredient to inventory
      const ingredient = new Ingredient(char, 0, 0);
      this.player.addIngredient(ingredient);
      console.log(`[CHEAT] ✓ Added ingredient: ${name}`);
    } else if (type === ITEM_TYPES.WEAPON || type === ITEM_TYPES.TRAP) {
      // Add weapon/trap to item chest
      const item = new Item(char, 0, 0);
      this.inventorySystem.addToChest(item);
      console.log(`[CHEAT] ✓ Added ${type === ITEM_TYPES.TRAP ? 'trap' : 'weapon'} to chest: ${name}`);
    } else if (type === ITEM_TYPES.ARMOR) {
      // Add armor to armor chest (inventory)
      const item = new Item(char, 0, 0);
      if (!this.inventorySystem.armorInventory.some(a => a.char === char)) {
        this.inventorySystem.armorInventory.push(item);
        console.log(`[CHEAT] ✓ Added armor to chest: ${name}`);
      } else {
        console.log(`[CHEAT] ⚠ Already have armor: ${name}`);
      }
    } else if (type === ITEM_TYPES.CONSUMABLE) {
      // Add consumable to consumable chest (inventory)
      const item = new Item(char, 0, 0);
      if (!this.inventorySystem.consumableInventory.some(c => c.char === char)) {
        this.inventorySystem.consumableInventory.push(item);
        console.log(`[CHEAT] ✓ Added consumable to chest: ${name}`);
      } else {
        console.log(`[CHEAT] ⚠ Already have consumable: ${name}`);
      }
    }

    this.saveGameState();
    this.renderer.markBackgroundDirty();
  }

  handleZoneTeleport(targetZone) {
    console.log(`[CHEAT] Teleporting to ${targetZone} zone`);

    // Only allow teleporting during EXPLORE state
    const state = this.stateMachine.getCurrentState();
    if (state !== GAME_STATES.EXPLORE) {
      console.log('[CHEAT] ⚠ Zone teleport only works during EXPLORE mode. Exit REST first (press E on south exit).');
      return;
    }

    // Force zone transition by populating path history with 3 consecutive exits of target zone color
    // This ensures checkZoneTransition() will return the correct zone
    const targetZoneColor = ZONES[targetZone].exitColor;
    this.zoneSystem.pathHistory = [
      { letter: 'X', color: targetZoneColor },
      { letter: 'X', color: targetZoneColor },
      { letter: 'X', color: targetZoneColor }
    ];
    this.zoneSystem.currentZone = targetZone;

    // Set zone depth: if first time in zone, start at 1; otherwise use current depth
    if (this.zoneDepths[targetZone] === 0) {
      this.zoneDepths[targetZone] = 1;
      console.log(`[CHEAT] First time in ${targetZone} zone - starting at Level 1`);
    }

    // Regenerate room with target zone's depth
    this.roomGenerator.setDepth(this.zoneDepths[targetZone]);
    const playerPos = { x: this.player.x, y: this.player.y };
    const newRoom = this.roomGenerator.generateRoom(
      null,
      playerPos,
      targetZone,
      null
    );

    // Replace current room
    this.currentRoom = newRoom;
    this.player.setCollisionMap(newRoom.collisionMap);
    this.backgroundObjects = newRoom.backgroundObjects;

    // Update all entities
    for (const enemy of newRoom.enemies) {
      enemy.setTarget(this.player);
      enemy.setCollisionMap(newRoom.collisionMap);
    }

    // Setup 2-second grace period for enemies
    this.roomEntryGraceTimer = 2.0;
    for (const enemy of newRoom.enemies) {
      enemy._savedAggroRange = enemy.aggroRange;
      enemy.aggroRange = 0;
    }

    // Reset physics system and add all entities
    this.physicsSystem.clear();
    this.physicsSystem.addEntity(this.player);
    for (const enemy of newRoom.enemies) {
      this.physicsSystem.addEntity(enemy);
    }
    for (const item of this.items) {
      this.physicsSystem.addEntity(item);
    }

    // Reset combat system
    this.combatSystem.clear();

    // Mark background dirty for redraw
    this.renderer.markBackgroundDirty();

    // Update UI
    this.updateUI();

    console.log(`[CHEAT] ✓ Teleported to ${targetZone} zone at depth ${this.getCurrentZoneDepth()}`);
  }

  handleRoomWarp(roomLetter) {
    console.log(`[CHEAT] Warping to room type: ${roomLetter}`);

    // Only allow warping during EXPLORE state
    const state = this.stateMachine.getCurrentState();
    if (state !== GAME_STATES.EXPLORE) {
      console.log('[CHEAT] ⚠ Room warp only works during EXPLORE mode. Exit REST first.');
      return;
    }

    // Check if room letter is valid
    const letterData = EXIT_LETTERS[roomLetter];
    if (!letterData) {
      console.log(`[CHEAT] ⚠ Invalid room letter: ${roomLetter}`);
      return;
    }

    // Get current zone and depth
    const currentZone = this.zoneSystem.currentZone;
    const currentDepth = this.getCurrentZoneDepth();
    const progressionColor = this.zoneSystem.getProgressionColor();

    // Get room type from letter
    const roomType = ROOM_TYPES[letterData.roomType] || ROOM_TYPES.COMBAT;

    // Generate new room
    this.roomGenerator.setDepth(currentDepth);
    const playerPos = { x: this.player.position.x, y: this.player.position.y };
    const newRoom = this.roomGenerator.generateRoom(
      roomType,
      playerPos,
      currentZone,
      progressionColor,
      roomLetter
    );

    // Replace current room
    this.currentRoom = newRoom;
    this.player.setCollisionMap(newRoom.collisionMap);
    this.backgroundObjects = newRoom.backgroundObjects || [];
    this.items = newRoom.items || [];
    this.placedTraps = [];
    this.activeNoiseSource = null;
    this.steamClouds = [];
    this.debris = [];
    this.particles = [];
    this.gooBlobs = [];
    this.captives = [];
    this.neutralCharacters = [];

    // Update all enemies
    for (const enemy of newRoom.enemies) {
      enemy.setTarget(this.player);
      enemy.setCollisionMap(newRoom.collisionMap);
    }

    // Setup 2-second grace period for enemies
    this.roomEntryGraceTimer = 2.0;
    for (const enemy of newRoom.enemies) {
      enemy._savedAggroRange = enemy.aggroRange;
      enemy.aggroRange = 0;
    }

    // Reset physics system and add all entities
    this.physicsSystem.clear();
    this.physicsSystem.addEntity(this.player);
    for (const enemy of newRoom.enemies) {
      this.physicsSystem.addEntity(enemy);
    }
    for (const item of this.items) {
      this.physicsSystem.addEntity(item);
    }

    // Reset combat system
    this.combatSystem.clear();

    // Preload room previews for exits
    this.preloadRoomPreviews();

    // Mark background dirty for redraw
    this.renderer.markBackgroundDirty();

    // Update UI
    this.updateUI();

    console.log(`[CHEAT] ✓ Warped to ${letterData.name} (${roomLetter}) - ${letterData.roomType}`);
  }

  enterMazeTestRoom() {
    // Save player state (quick slots, HP)
    const savedQuickSlots = this.player ? [...this.player.quickSlots] : [null, null, null];
    const savedActiveSlotIndex = this.player ? this.player.activeSlotIndex : 0;
    const savedHp = this.player ? this.player.hp : null;

    // Generate maze room first
    const centerX = GRID.WIDTH / 2;
    const startY = (GRID.ROWS - 3) * GRID.CELL_SIZE;
    this.currentRoom = this.roomGenerator.generateRoom(ROOM_TYPES.MAZE, { x: centerX, y: startY });

    // Create player at south entrance
    this.player = new Player(centerX, startY);
    this.player.setCollisionMap(this.currentRoom.collisionMap);

    // Restore state
    this.player.quickSlots = savedQuickSlots;
    this.player.activeSlotIndex = savedActiveSlotIndex;
    if (savedHp !== null) this.player.hp = savedHp;

    // Setup room entities (sync with room's state)
    this.ingredients = [];
    this.items = this.currentRoom.items || [];
    this.placedTraps = [];
    this.activeNoiseSource = null;
    this.backgroundObjects = this.currentRoom.backgroundObjects || [];
    this.debris = [];
    this.particles = [];
    this.gooBlobs = [];

    // Set enemy targets
    for (const enemy of this.currentRoom.enemies) {
      enemy.setTarget(this.player);
    }

    // Reset physics system
    this.physicsSystem.clear();
    this.physicsSystem.addEntity(this.player);
    for (const enemy of this.currentRoom.enemies) {
      this.physicsSystem.addEntity(enemy);
    }
    for (const item of this.items) {
      this.physicsSystem.addEntity(item);
    }

    // Reset combat
    this.combatSystem.clear();

    // Redraw and set state (don't call transition - that would trigger enterExploreState and overwrite our maze!)
    this.renderer.markBackgroundDirty();
    this.stateMachine.currentState = GAME_STATES.EXPLORE;
  }

  tryPickupItem() {
    const result = this.inventorySystem.tryPickupItem(
      this.items,
      this.placedTraps,
      this.player,
      this.physicsSystem
    );

    if (result.success) {
      // Handle blessing pickup (apply blessing effect)
      if (result.blessing) {
        this.applyBlessing(result.blessing);
      }

      if (result.message) {
        this.showPickupMessage(result.message);
      }

      // Drop previous weapon/trap if any
      if (result.droppedItem) {
        this.items.push(result.droppedItem);
        this.physicsSystem.addEntity(result.droppedItem);
      }

      this.updateUI();
    }
  }

  // Apply blessing (permanent buff from Leshy Grove)
  applyBlessing(blessingItem) {
    const blessing = blessingItem.data;

    // Track collected blessing
    this.blessingsCollected.push(blessing.char);

    // Apply permanent buff based on effect type
    switch (blessing.effect.type) {
      case 'damageBuff':
        this.player.damageBuff = (this.player.damageBuff || 0) + blessing.effect.value;
        this.showPickupMessage(`${blessing.name} (+${blessing.effect.value} damage)`);
        break;

      case 'hpBuff':
        this.player.maxHp += blessing.effect.value;
        this.player.hp = Math.min(this.player.hp + blessing.effect.value, this.player.maxHp); // Heal to new max
        this.showPickupMessage(`${blessing.name} (+${blessing.effect.value} HP)`);
        break;

      case 'speedBuff':
        this.player.speed += blessing.effect.value;
        this.showPickupMessage(`${blessing.name} (+${blessing.effect.value} speed)`);
        break;

      default:
        console.warn(`[Blessing] Unknown effect type: ${blessing.effect.type}`);
    }
  }

  // Place trap at player position (spacebar)
  placeTrap() {
    if (!this.player.canUseTrap()) return;

    const trapItem = this.player.heldItem;
    const trapData = trapItem.data;


    // Mark trap as used this room (don't remove from inventory)
    this.player.markTrapUsed();

    // Create placed trap entity at player position
    const placedTrapItem = new Item(
      trapItem.char,
      this.player.position.x,
      this.player.position.y
    );
    placedTrapItem.isPlaced = true;

    // Add to placed traps list for auto-trigger detection
    this.placedTraps.push({
      item: placedTrapItem,
      tickTimer: trapData.tickInterval || 0,
      activeDuration: trapData.activeDuration != null ? trapData.activeDuration : Infinity,
      affectedEnemies: new Set()
    });

    this.showPickupMessage('trap placed');
    this.updateUI();
  }

  updatePlacedTraps(deltaTime) {
    if (!this.currentRoom) return;
    const enemies = this.currentRoom.enemies;
    this.activeNoiseSource = null; // reset each frame

    for (let i = this.placedTraps.length - 1; i >= 0; i--) {
      const entry = this.placedTraps[i];
      const { item } = entry;
      const trapData = item.data;
      const tx = item.position.x;
      const ty = item.position.y;

      if (trapData.oneShot) {
        // One-shot trap: check if enemy is within trigger radius
        let triggered = false;
        for (const enemy of enemies) {
          const dx = enemy.position.x - tx;
          const dy = enemy.position.y - ty;
          if (Math.sqrt(dx * dx + dy * dy) <= trapData.triggerRadius) {
            triggered = true;
            break;
          }
        }

        if (triggered) {
          // Apply effect to all enemies in effectRadius
          for (const enemy of enemies) {
            const dx = enemy.position.x - tx;
            const dy = enemy.position.y - ty;
            if (Math.sqrt(dx * dx + dy * dy) <= trapData.effectRadius) {
              if (trapData.effect === 'burn' && this.currentRoom.backgroundObjects) {
                // Fire Trap: also ignite flammable background objects
                for (const obj of this.currentRoom.backgroundObjects) {
                  if (obj.destroyed || !obj.isFlammable) continue;
                  const odx = obj.position.x - tx;
                  const ody = obj.position.y - ty;
                  if (Math.sqrt(odx * odx + ody * ody) <= trapData.effectRadius) {
                    if (obj.isFlammable()) obj.ignite(5.0);
                  }
                }
              }
              enemy.applyStatusEffect(trapData.effect, trapData.effectDuration);
            }
          }

          // Burst particle effect at trap location
          const burstParticles = createActivationBurst(tx, ty, trapData.color || '#ffffff');
          this.particles.push(...burstParticles);

          // Remove trap from ground
          this.placedTraps.splice(i, 1);
        }
      } else {
        // Persistent placeable
        const effect = trapData.effect;

        if (effect === 'noise') {
          // Noise-maker: redirect enemies toward self; destroyed on enemy contact
          this.activeNoiseSource = { x: tx, y: ty, radius: trapData.effectRadius };
          // Destroy on enemy overlap (< 16 px)
          let destroyed = false;
          for (const enemy of enemies) {
            const dx = enemy.position.x - tx;
            const dy = enemy.position.y - ty;
            if (Math.sqrt(dx * dx + dy * dy) < 16) {
              destroyed = true;
              break;
            }
          }
          if (destroyed) {
            this.placedTraps.splice(i, 1);
          }

        } else if (effect === 'sleep') {
          // Music Box: apply sleep to enemies that enter radius while active
          entry.activeDuration -= deltaTime;
          if (entry.activeDuration > 0) {
            for (const enemy of enemies) {
              const dx = enemy.position.x - tx;
              const dy = enemy.position.y - ty;
              if (Math.sqrt(dx * dx + dy * dy) <= trapData.effectRadius) {
                if (!entry.affectedEnemies.has(enemy)) {
                  entry.affectedEnemies.add(enemy);
                  enemy.applyStatusEffect('sleep', trapData.effectDuration);
                }
              } else {
                // Enemy left radius — allow re-triggering if they re-enter
                entry.affectedEnemies.delete(enemy);
              }
            }
          }

        } else if (effect === 'stun') {
          // Tesla Coil: deal damage + stun every tickInterval seconds
          entry.tickTimer -= deltaTime;
          if (entry.tickTimer <= 0) {
            entry.tickTimer = trapData.tickInterval;
            for (const enemy of enemies) {
              const dx = enemy.position.x - tx;
              const dy = enemy.position.y - ty;
              if (Math.sqrt(dx * dx + dy * dy) <= trapData.effectRadius) {
                enemy.takeDamage(trapData.damage || 2);
                enemy.applyStatusEffect('stun', trapData.stunDuration || 0.8);
                this.combatSystem.createDamageNumber(trapData.damage || 2, enemy.position.x, enemy.position.y, '#00ffff');
                // Lightning particle
                this.particles.push({
                  x: tx,
                  y: ty,
                  vx: (Math.random() - 0.5) * 60,
                  vy: (Math.random() - 0.5) * 60,
                  life: 0.3,
                  maxLife: 0.3,
                  char: '!',
                  color: '#00ffff',
                  isImpact: true
                });
              }
            }
          }

        } else if (effect === 'goo') {
          // Goo Dispenser: generate spreading goo blobs that slow and prevent dodge rolling

          // Initialize generation timer if not set (1 second startup delay)
          if (entry.gooGenerationTimer === undefined) {
            entry.gooGenerationTimer = 1.0; // 1 second delay before first goo
          }

          // Tick down generation timer
          entry.gooGenerationTimer -= deltaTime;

          // Generate goo blob every 1 second after startup delay
          if (entry.gooGenerationTimer <= 0) {
            entry.gooGenerationTimer = 1.0; // Generate every 1 second

            // Create new goo blob at dispenser center
            const gooBlob = new GooBlob(
              tx + GRID.CELL_SIZE / 2,
              ty + GRID.CELL_SIZE / 2,
              performance.now()
            );
            this.gooBlobs.push(gooBlob);

            // FIFO queue management: max 15 goo blobs
            const MAX_GOO_BLOBS = 15;
            if (this.gooBlobs.length > MAX_GOO_BLOBS) {
              // Remove oldest goo blob (first in array)
              this.gooBlobs.shift();
            }
          }
        }
      }
    }
  }

  updateExitCollisions() {
    if (!this.currentRoom || !this.currentRoom.collisionMap) return;

    const centerX = Math.floor(GRID.COLS / 2);
    const centerY = Math.floor(GRID.ROWS / 2);

    // Open north exit in collision map
    if (this.currentRoom.exits.north) {
      this.currentRoom.collisionMap[0][centerX] = false;
    }

    // Open south exit in collision map
    if (this.currentRoom.exits.south) {
      this.currentRoom.collisionMap[GRID.ROWS - 1][centerX] = false;
    }

    // Open east exit in collision map
    if (this.currentRoom.exits.east) {
      this.currentRoom.collisionMap[centerY][GRID.COLS - 1] = false;
    }

    // Open west exit in collision map
    if (this.currentRoom.exits.west) {
      this.currentRoom.collisionMap[centerY][0] = false;
    }

    // Update player's collision map reference
    this.player.setCollisionMap(this.currentRoom.collisionMap);
  }

  findNearbyBackgroundObject() {
    // Use currentRoom.backgroundObjects for all states (including NEUTRAL)
    const objects = this.currentRoom ? this.currentRoom.backgroundObjects : this.backgroundObjects;
    for (const obj of objects) {
      const distance = this.physicsSystem.getDistance(this.player, obj);
      if (distance < INTERACTION_RANGE) {
        return obj;
      }
    }
    return null;
  }

  interactWithObject(obj) {
    const heldItemChar = this.player.heldItem ? this.player.heldItem.char : null;
    const result = obj.interact(heldItemChar);

    // Leshy spawn event: trigger on ANY interaction with shaking bush (not just destruction)
    if (obj.leshyBush && !obj.leshySpawned) {
      obj.leshySpawned = true; // Mark to prevent multiple spawns
      const leshy = new Leshy(obj.position.x, obj.position.y, this.currentRoom.exits);
      leshy.startFleeing();
      this.neutralCharacters.push(leshy);
      this.zoneSystem.startLeshyChase(leshy.targetExit);
      console.log(`[Secret] Leshy discovered! Fleeing to ${leshy.targetExit} exit`);
    }

    if (result.effect) {
      this.handleObjectEffect(result.effect, obj);
    }

    if (result.message) {
      console.log(result.message); // Temporary: log to console
    }
  }

  handleObjectEffect(effect, obj) {
    if (!effect) return;

    // Debug logging for key drop debugging
    if (obj.dropsKey) {
    }

    // Check for key drops in K rooms (vault key system)
    if (obj.dropsKey && effect.includes('destroyObject')) {
      obj.destroyAfterAnimation = true;
      this.renderer.markBackgroundDirty();

      // Spawn the vault key
      const key = new Item(obj.keyChar, obj.position.x, obj.position.y);
      this.items.push(key);
      this.physicsSystem.addEntity(key);
      return; // Stop processing other effects
    }

    // Check for zone-specific drop tables (e.g., gemstones from RED zone rocks)
    if (obj.dropTable && effect.includes('destroyObject')) {
      obj.destroyAfterAnimation = true;
      this.renderer.markBackgroundDirty();

      // Determine rarity profile (gemstone = normal, rare_gemstone = elite)
      const rarityProfile = obj.dropTable === 'rare_gemstone' ? 'elite' : 'normal';
      const drops = generateEnemyDrops(obj.dropTable, rarityProfile, 1);

      for (const drop of drops) {
        if (isIngredient(drop)) {
          const ingredient = new Ingredient(drop, obj.position.x, obj.position.y);
          this.ingredients.push(ingredient);
          this.physicsSystem.addEntity(ingredient);
        }
      }
      return; // Stop processing other effects
    }

    // Handle destroy + spawn combined effects (e.g., "destroyObject:spawnIngredient:|")
    if (effect.startsWith('destroyObject:spawnIngredient:')) {
      const ingredientChar = effect.split(':')[2]; // Get character after "destroyObject:spawnIngredient:"
      obj.destroyAfterAnimation = true;
      this.renderer.markBackgroundDirty();

      const ingredient = new Ingredient(
        ingredientChar,
        obj.position.x,
        obj.position.y
      );
      this.ingredients.push(ingredient);
      this.physicsSystem.addEntity(ingredient);
    } else if (effect === 'destroyObject:spawnRandom') {
      obj.destroyAfterAnimation = true;
      this.renderer.markBackgroundDirty();

      // Use generic drop table with weak rarity profile
      const drops = generateEnemyDrops('generic', 'weak', 1);

      for (const drop of drops) {
        if (isIngredient(drop)) {
          const ingredient = new Ingredient(drop, obj.position.x, obj.position.y);
          this.ingredients.push(ingredient);
          this.physicsSystem.addEntity(ingredient);
        } else if (isItem(drop)) {
          const item = new Item(drop, obj.position.x, obj.position.y);
          this.items.push(item);
          this.physicsSystem.addEntity(item);
        }
      }
    } else if (effect === 'destroyObject') {
      obj.destroyAfterAnimation = true;
      this.renderer.markBackgroundDirty();
    } else if (effect.startsWith('spawnIngredient:')) {
      const ingredientChar = effect.split(':')[1];
      const ingredient = new Ingredient(
        ingredientChar,
        obj.position.x,
        obj.position.y
      );
      this.ingredients.push(ingredient);
      this.physicsSystem.addEntity(ingredient);
    } else if (effect.startsWith('spawnMultiple:')) {
      // Format: spawnMultiple:char:count
      const parts = effect.split(':');
      const ingredientChar = parts[1];
      const count = parseInt(parts[2]) || 2;

      for (let i = 0; i < count; i++) {
        const offsetX = (Math.random() - 0.5) * 20;
        const offsetY = (Math.random() - 0.5) * 20;
        const ingredient = new Ingredient(
          ingredientChar,
          obj.position.x + offsetX,
          obj.position.y + offsetY
        );
        this.ingredients.push(ingredient);
        this.physicsSystem.addEntity(ingredient);
      }
    } else if (effect.startsWith('transformObject:')) {
      // Format: transformObject:newChar
      const newChar = effect.split(':')[1];

      // Find the object in the room's backgroundObjects array and replace it
      const index = this.currentRoom.backgroundObjects.indexOf(obj);
      if (index !== -1) {
        const newObj = new BackgroundObject(newChar, obj.position.x, obj.position.y);
        this.currentRoom.backgroundObjects[index] = newObj;

        // Trigger transition animation on new object
        const animData = OBJECT_ANIMATIONS['freeze'] || OBJECT_ANIMATIONS['melt'];
        if (animData) {
          newObj.currentAnimation = {
            type: 'transform',
            data: animData,
            elapsed: 0
          };
        }

        this.renderer.markBackgroundDirty();
      }
    } else if (effect === 'spawnFire') {
      // Create a fire object at the position
      const fire = new BackgroundObject('!', obj.position.x, obj.position.y);
      this.currentRoom.backgroundObjects.push(fire);
      obj.destroyAfterAnimation = true;
      this.renderer.markBackgroundDirty();
    } else if (effect.startsWith('spawnCloud:')) {
      // Format: spawnCloud:type (poison, smoke, etc.)
      const cloudType = effect.split(':')[1];

      // Create particle cloud effect
      const cloudColor = cloudType === 'poison' ? '#88ff00' : '#888888';
      for (let i = 0; i < 10; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 50 + 30;
        const particle = {
          x: obj.position.x + GRID.CELL_SIZE / 2,
          y: obj.position.y + GRID.CELL_SIZE / 2,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 1.0,
          maxLife: 1.0,
          char: '·',
          color: cloudColor,
          size: 4
        };
        this.particles.push(particle);
      }
    }
  }

  spawnLoot(enemy) {
    const luckMult = (this.player && this.player.luckTimer > 0) ? 1.75 : 1.0;

    // Use new drop table system if enemy has dropTable defined
    let drops = [];
    if (enemy.data.dropTable && enemy.data.rarityProfile) {
      // Generate drops from drop table
      const baseDropCount = enemy.data.isBoss ? 3 : null; // Bosses drop more
      const generatedDrops = generateEnemyDrops(
        enemy.data.dropTable,
        enemy.data.rarityProfile,
        baseDropCount
      );

      // Luck increases drop count chance
      if (luckMult > 1.0 && Math.random() < 0.4) {
        const bonusDrop = generateEnemyDrops(enemy.data.dropTable, enemy.data.rarityProfile, 1);
        generatedDrops.push(...bonusDrop);
      }

      drops = generatedDrops;
    }
    // Fallback to old drops array system (for backwards compatibility)
    else if (enemy.data.drops) {
      for (const drop of enemy.data.drops) {
        const adjustedChance = Math.min(1.0, drop.chance * luckMult);
        if (Math.random() < adjustedChance) {
          drops.push(drop.char);
        }
      }
    }

    // Spawn the drops
    for (const drop of drops) {
      // Check if drop is an ingredient or an item (armor/consumable/weapon)
      if (isIngredient(drop)) {
        const ingredient = new Ingredient(
          drop,
          enemy.position.x,
          enemy.position.y
        );
        this.ingredients.push(ingredient);
        this.physicsSystem.addEntity(ingredient);
      } else if (isItem(drop)) {
        const item = new Item(
          drop,
          enemy.position.x,
          enemy.position.y
        );
        this.items.push(item);
        this.physicsSystem.addEntity(item);
      }
    }
  }

  spawnEnemiesFrom(spawner, spawnData) {
    const newEnemies = [];
    const { spawnChar, spawnCount, spawnRange, spawnerPosition } = spawnData;

    for (let i = 0; i < spawnCount; i++) {
      const spawnPos = this.findSpawnPosition(
        spawnerPosition,
        spawnRange,
        this.currentRoom.collisionMap,
        this.currentRoom.enemies
      );

      if (spawnPos) {
        const newEnemy = new Enemy(spawnChar, spawnPos.x, spawnPos.y, this.currentDepth);
        newEnemy.setCollisionMap(this.currentRoom.collisionMap);
        newEnemy.setBackgroundObjects(this.currentRoom.backgroundObjects);
        newEnemy.setSteamClouds(this.steamClouds);
        newEnemy.setTarget(this.player);
        newEnemy.enraged = true;
        this.physicsSystem.addEntity(newEnemy);
        newEnemies.push(newEnemy);
      }
    }

    return newEnemies;
  }

  findSpawnPosition(center, range, collisionMap, enemies) {
    for (let i = 0; i < 20; i++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.random() * range;
      const x = center.x + Math.cos(angle) * distance;
      const y = center.y + Math.sin(angle) * distance;

      const gridX = Math.floor(x / GRID.CELL_SIZE);
      const gridY = Math.floor(y / GRID.CELL_SIZE);

      if (gridX < 0 || gridX >= GRID.COLS || gridY < 0 || gridY >= GRID.ROWS) continue;
      if (collisionMap[gridY][gridX]) continue;

      let overlaps = false;
      for (const enemy of enemies) {
        const dx = enemy.position.x - x;
        const dy = enemy.position.y - y;
        if (Math.sqrt(dx * dx + dy * dy) < GRID.CELL_SIZE * 2) {
          overlaps = true;
          break;
        }
      }

      if (!overlaps) return { x, y };
    }

    return null;
  }

  bankLoot() {
    // Player successfully returned to REST with loot
    if (this.player) {
      this.inventorySystem.bankLoot(
        this.player.inventory,
        this.player.quickSlots,
        this.player.activeSlotIndex
      );
    }
  }

  render(alpha) {
    const state = this.stateMachine.getCurrentState();

    if (state === GAME_STATES.TITLE) {
      this.renderController.renderTitleState(this);
    } else if (state === GAME_STATES.REST) {
      this.renderController.renderRestState(this);
    } else if (state === GAME_STATES.EXPLORE) {
      this.renderController.renderExploreState(this);
    } else if (state === GAME_STATES.NEUTRAL) {
      this.renderController.renderNeutralState(this);
    } else if (state === GAME_STATES.GAME_OVER) {
      this.renderController.renderGameOverState(this);
    }
  }








  updateUI() {
    if (!this.player) return;

    this.ui.hp.textContent = this.player.hp;
    this.ui.depth.textContent = this.getCurrentZoneDepth();

    // Highlight inventory count when I key is pressed
    const inventoryCount = this.player.inventory.length + this.inventorySystem.armorInventory.length + this.inventorySystem.consumableInventory.length;
    if (this.keys.i) {
      this.ui.inventory.innerHTML = `<span style="color: ${COLORS.ITEM}">${inventoryCount}</span>`;
    } else {
      this.ui.inventory.textContent = inventoryCount;
    }

    // Show all 3 slots with active indicator and Q/E indicators
    // Example: Q [/] · ‡ E  (Gun active, slot 1 empty, Flame Sword in slot 2)
    // Darken used traps (trap used this room)
    const slots = this.player.quickSlots.map((item, idx) => {
      const isActive = idx === this.player.activeSlotIndex;
      const char = item ? item.char : '.';
      const slotText = isActive ? `[${char}]` : ` ${char} `;

      // Darken if it's a used trap
      if (item && item.data && item.data.type === 'TRAP' && this.player.trapUsedThisRoom[idx]) {
        return `<span style="opacity: 0.3">${slotText}</span>`;
      }

      return slotText;
    });

    // Highlight Q and E when pressed
    const qColor = this.keys.q ? COLORS.ITEM : '#ffffff';
    const eColor = this.keys.e ? COLORS.ITEM : '#ffffff';
    this.ui.heldItem.innerHTML = `<span style="color: ${qColor}">Q</span> ${slots.join('')} <span style="color: ${eColor}">E</span>`;

    // Armor display
    const armorChar = this.inventorySystem.equippedArmor ? this.inventorySystem.equippedArmor.char : '.';
    const armorColor = this.inventorySystem.equippedArmor ? (this.inventorySystem.equippedArmor.color || '#aaaaff') : '#444';
    this.ui.armorChar.textContent = armorChar;
    this.ui.armorChar.style.color = armorColor;

    // Consumable display — use player's copy during explore, fall back to this.inventorySystem.equippedConsumables
    const consumables = (this.player && this.player.equippedConsumables)
      ? this.player.equippedConsumables
      : this.inventorySystem.equippedConsumables;
    const consumableEls = [this.ui.consumableChar1, this.ui.consumableChar2];
    for (let i = 0; i < 2; i++) {
      const el = consumableEls[i];
      if (consumables[i]) {
        // Active slot: show item char
        el.textContent = consumables[i].char;

        // Color priority: flash white > cooldown gray > normal color
        if (this.inventorySystem.consumableFlashSlot === i && this.inventorySystem.consumableFlashTimer > 0) {
          // Flash white when activated
          el.style.color = '#ffffff';
        } else if (this.inventorySystem.consumableCooldowns[i] > 0) {
          // Gray when on cooldown (reusable consumables)
          el.style.color = '#666666';
        } else {
          // Normal color when ready
          el.style.color = consumables[i].color || COLORS.ITEM;
        }
      } else if (this.inventorySystem.spentConsumableSlots[i]) {
        // Spent slot: dim indicator (one-shot consumables used)
        el.textContent = '.';
        el.style.color = '#333';
      } else {
        // Empty slot: mid-gray
        el.textContent = '.';
        el.style.color = '#555';
      }
    }
  }


  openEquipmentMenu(slotType) {
    this.menuOpen = true;
    this.currentMenuSlot = slotType;
    this.selectedMenuIndex = 0;

    // Get available items from InventorySystem
    this.menuItems = this.inventorySystem.openEquipmentMenu(slotType);
    this.renderController.menuOverlay.render(this);
  }

  openChestRetrievalMenu() {
    this.menuOpen = true;
    this.currentMenuSlot = 'chest';
    this.selectedMenuIndex = 0;

    // Get chest contents from InventorySystem
    this.menuItems = this.inventorySystem.getChestContents();
    this.renderController.menuOverlay.render(this);
  }

  openCraftingMenu(slotType) {
    this.menuOpen = true;
    this.currentMenuSlot = slotType;
    this.selectedMenuIndex = 0;

    // Populate columns based on slot type
    const weaponsList = [];
    const armorList = [];
    const consumableList = [];

    // Get weapons from chest (deduplicated by char)
    for (const item of this.inventorySystem.itemChest) {
      if (!weaponsList.find(i => i.char === item.char)) {
        weaponsList.push(item);
      }
    }

    // Get armor (deduplicated by char)
    for (const item of this.inventorySystem.armorInventory) {
      if (!armorList.find(i => i.char === item.char)) {
        armorList.push(item);
      }
    }

    // Get consumables (deduplicated by char)
    for (const item of this.inventorySystem.consumableInventory) {
      if (!consumableList.find(i => i.char === item.char)) {
        consumableList.push(item);
      }
    }

    // Get ingredients (deduplicated consistently with other lists)
    const ingredientList = [];
    for (const ingredientChar of this.player.inventory) {
      if (!ingredientList.includes(ingredientChar)) {
        ingredientList.push(ingredientChar);
      }
    }

    // For center slot, exclude ingredients (only craftable items allowed)
    if (slotType === 'center') {
      this.menuColumns = [weaponsList, armorList, consumableList];
      this.disabledColumns = [false, false, false];
      this.selectedColumn = 1; // Start with armor
    } else {
      // For left/right slots, include all columns
      this.menuColumns = [weaponsList, armorList, ingredientList, consumableList];
      this.disabledColumns = [false, false, false, false];
      this.selectedColumn = 2; // Start with ingredients
    }

    this.menuItems = this.menuColumns[this.selectedColumn];

    this.renderController.menuOverlay.render(this);
  }

  closeMenu() {
    this.menuOpen = false;
    this.currentMenuSlot = null;
    this.menuColumns = null;
    this.disabledColumns = [];
    this.ui.menu.classList.add('hidden');
  }


  selectMenuItem() {
    if (!this.menuOpen || this.menuItems.length === 0) return;

    const selectedItem = this.menuItems[this.selectedMenuIndex];


    // Handle chest operations
    if (this.currentMenuSlot === 'chest') {
      if (selectedItem.action === 'retrieve') {
        // Retrieve item from chest to quick slots
        const item = selectedItem.item;
        const droppedItem = this.player.pickupItem(item);

        // Remove from chest
        this.inventorySystem.retrieveFromChest(item);

        // If something was dropped (all slots full), put it back in chest and keep menu open
        if (droppedItem) {
          this.inventorySystem.addToChest(droppedItem);
          // Keep menu open, refresh the list
          this.saveGameState();
          this.updateUI();
          this.openChestRetrievalMenu(); // Refresh menu with updated chest contents
        } else {
          // All good, close menu
          this.saveGameState();
          this.closeMenu();
          this.updateUI();
        }
      }
      return;
    }

    // Handle equipment slots
    if (this.currentMenuSlot === 'armor') {
      this.inventorySystem.equipArmor(selectedItem);
      this.saveGameState();
      this.renderer.markBackgroundDirty();
      this.closeMenu();
      this.updateUI();
      return;
    }

    if (this.currentMenuSlot === 'consumable1') {
      this.inventorySystem.equipConsumable(0, selectedItem);
      // Sync to player
      this.player.equippedConsumables = [...this.inventorySystem.equippedConsumables];
      this.saveGameState();
      this.renderer.markBackgroundDirty();
      this.closeMenu();
      this.updateUI();
      return;
    }

    if (this.currentMenuSlot === 'consumable2') {
      this.inventorySystem.equipConsumable(1, selectedItem);
      // Sync to player
      this.player.equippedConsumables = [...this.inventorySystem.equippedConsumables];
      this.saveGameState();
      this.renderer.markBackgroundDirty();
      this.closeMenu();
      this.updateUI();
      return;
    }

    // Handle center slot (reverse crafting with 3-column menu)
    if (this.currentMenuSlot === 'center') {
      this.handleCenterSlotSelection(selectedItem);
      return;
    }

    // Handle left/right crafting slots (with 3-column menu)
    if (this.currentMenuSlot === 'left' || this.currentMenuSlot === 'right') {
      // Get item char - handle both string (ingredient) and object (equipment) types
      const itemChar = typeof selectedItem === 'string' ? selectedItem : selectedItem.char;

      // Remove item from appropriate inventory
      if (typeof selectedItem === 'string') {
        // Ingredient - remove from player inventory
        this.player.removeIngredient(selectedItem);
      } else if (selectedItem.data.type === 'WEAPON' || selectedItem.data.type === 'TRAP') {
        // Weapon/Trap - remove from chest
        this.inventorySystem.retrieveFromChest(selectedItem);
      } else if (selectedItem.data.type === 'ARMOR') {
        // Armor - remove from armor inventory
        const armorIndex = this.inventorySystem.armorInventory.indexOf(selectedItem);
        if (armorIndex > -1) {
          this.inventorySystem.armorInventory.splice(armorIndex, 1);
        }
      } else if (selectedItem.data.type === 'CONSUMABLE') {
        // Consumable - remove from consumable inventory
        const consumableIndex = this.inventorySystem.consumableInventory.indexOf(selectedItem);
        if (consumableIndex > -1) {
          this.inventorySystem.consumableInventory.splice(consumableIndex, 1);
        }
      }

      // Place in crafting slot
      if (this.currentMenuSlot === 'left') {
        this.craftingSystem.setLeftSlot(itemChar);
      } else if (this.currentMenuSlot === 'right') {
        this.craftingSystem.setRightSlot(itemChar);
      }

      this.saveGameState();
      this.renderer.markBackgroundDirty();
      this.closeMenu();
      this.updateUI();
    }
  }

  handleCenterSlotSelection(selectedItem) {
    // Get item char - handle both string (ingredient) and object (equipment) types
    const itemChar = typeof selectedItem === 'string' ? selectedItem : selectedItem.char;

    // Try reverse recipe lookup
    const recipe = findRecipeByResult(itemChar);

    if (recipe) {
      // This is a craftable item - populate all three slots
      this.craftingSystem.leftSlot = recipe.left;
      this.craftingSystem.rightSlot = recipe.right;
      this.craftingSystem.centerSlot = itemChar;

      // Remove item from appropriate inventory
      if (typeof selectedItem === 'string') {
        // Ingredient - remove from player inventory
        this.player.removeIngredient(selectedItem);
      } else if (selectedItem.data.type === 'WEAPON' || selectedItem.data.type === 'TRAP') {
        // Weapon/Trap - remove from chest
        this.inventorySystem.retrieveFromChest(selectedItem);
      } else if (selectedItem.data.type === 'ARMOR') {
        // Armor - remove from armor inventory
        const armorIndex = this.inventorySystem.armorInventory.indexOf(selectedItem);
        if (armorIndex > -1) {
          this.inventorySystem.armorInventory.splice(armorIndex, 1);
        }
      } else if (selectedItem.data.type === 'CONSUMABLE') {
        // Consumable - remove from consumable inventory
        const consumableIndex = this.inventorySystem.consumableInventory.indexOf(selectedItem);
        if (consumableIndex > -1) {
          this.inventorySystem.consumableInventory.splice(consumableIndex, 1);
        }
      } else if (selectedItem.data.type === 'WEAPON' || selectedItem.data.type === 'TRAP') {
        // Should not happen - weapons/traps placed via SHIFT, not menu
        // But handle anyway - remove from active slot or chest
        const activeSlot = this.player.activeSlotIndex;
        if (this.player.quickSlots[activeSlot] && this.player.quickSlots[activeSlot].char === itemChar) {
          this.player.quickSlots[activeSlot] = null;
        }
      }

      this.saveGameState();
      this.renderer.markBackgroundDirty();
      this.closeMenu();
      this.updateUI();
    } else {
      // Not a craftable result - just close menu (or show error?)
      this.closeMenu();
    }
  }

  getIngredientData(char) {
    return INGREDIENTS[char] || { name: 'Unknown' };
  }
}

// Start game when page loads
window.addEventListener('load', () => {
  new Game();
});
