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
import { ErrandSystem } from './systems/ErrandSystem.js';
import { CheatMenu } from './systems/CheatMenu.js';
import { AudioSystem } from './systems/AudioSystem.js';
import { FishingSystem } from './systems/FishingSystem.js';
import { LootSystem } from './systems/LootSystem.js';
import { TrapSystem } from './systems/TrapSystem.js';
import { InteractionSystem } from './systems/InteractionSystem.js';
import { CharacterSystem } from './systems/CharacterSystem.js';
import { MenuSystem } from './systems/MenuSystem.js';
import { EnemySpawnSystem } from './systems/EnemySpawnSystem.js';
import { HutSystem } from './systems/HutSystem.js';
import { DungeonSystem } from './systems/DungeonSystem.js';
import { Player } from './entities/Player.js';
import { Enemy } from './entities/Enemy.js';
import { Ingredient } from './entities/Ingredient.js';
import { Item } from './entities/Item.js';
import { BackgroundObject } from './entities/BackgroundObject.js';
import { GooBlob } from './entities/GooBlob.js';
import { Particle, createExplosion, createWetDrop, createActivationBurst, createSteamPuff, createChaff, createDodgeTrail, createFootstep } from './entities/Particle.js';
import { createDebris } from './entities/Debris.js';
import { Captive } from './entities/Captive.js';
import { Leshy } from './entities/Leshy.js';
import { CharacterNPC } from './entities/CharacterNPC.js';
import { ITEM_TYPES, INGREDIENTS, ITEMS } from './data/items.js';
import { CHARACTER_TYPES } from './data/characters.js';
import { EXIT_LETTERS } from './data/exitLetters.js';
import { ZONES } from './data/zones.js';
import { GAME_STATES, GRID, CRAFTING, INTERACTION_RANGE, ROOM_TYPES } from './game/GameConfig.js';

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
    this.errandSystem = new ErrandSystem();
    this.cheatMenu = new CheatMenu(this);
    this.persistenceSystem = new PersistenceSystem();
    this.inventorySystem = new InventorySystem();
    this.audioSystem = new AudioSystem();
    this.fishingSystem = new FishingSystem();
    // New focused systems (instantiated after core systems so they can receive `this`)
    this.lootSystem = new LootSystem(this);
    this.trapSystem = new TrapSystem(this);
    this.interactionSystem = new InteractionSystem(this);
    this.characterSystem = new CharacterSystem(this);
    this.menuSystem = new MenuSystem(this);
    this.enemySpawnSystem = new EnemySpawnSystem(this);
    this.hutSystem = new HutSystem(this);
    this.dungeonSystem = new DungeonSystem(this);

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
    this.hutInterior = null;       // Active interior state (hut or dungeon floor)
    this.dungeonFloors = [];       // Persistent dungeon floor states for current visit
    this.dungeonCurrentFloor = -1; // -1 = not in dungeon

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
    this.characterDeathPending = false; // True when a character died but others remain
    this.characterDeathTimer = 0; // Like gameOverDeathTimer but for character-death path
    this.pendingNextCharacter = null; // Character type to swap to after space press
    this.characterDeathName = ''; // Name of the character who just died
    this.restBundle = null; // One-time starter bundle object (destroyed on SPACE to drop ingredients)
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
      slotQ: document.getElementById('slot-q'),
      slot1: document.getElementById('slot-1'),
      slot2: document.getElementById('slot-2'),
      slot3: document.getElementById('slot-3'),
      slotE: document.getElementById('slot-e'),
      menu: document.getElementById('menu-overlay'),
      armorChar: document.getElementById('armor-char'),
      consumableChar1: document.getElementById('consumable-char-1'),
      consumableChar2: document.getElementById('consumable-char-2'),
      consumableChar3: document.getElementById('consumable-char-3'),
      consumableChar4: document.getElementById('consumable-char-4'),
      consumableChar5: document.getElementById('consumable-char-5'),
      overlay: document.getElementById('ui-overlay')
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
        } else if (result && result.action === 'change_character') {
          this.swapWithCharacter(result.characterType);
          this.cheatMenu.toggle(); // Close menu after swap
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

        // Release fishing charge when space is released
        if (this.fishingSystem && this.fishingSystem.state === this.fishingSystem.STATES.CHARGING) {
          this.fishingSystem.releaseCharge(this);
        }

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
    return Player.getDodgeRollDirection(this.arrowKeys);
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
    return this.menuSystem.getNearestInteractiveSlot();
  }

  showPickupMessage(itemName) {
    this.menuSystem.showPickupMessage(itemName);
  }

  showNextPickupMessage() {
    this.menuSystem.showNextPickupMessage();
  }

  // Zone depth helpers
  getCurrentZoneDepth() {
    return this.zoneSystem.getCurrentZoneDepth(this.zoneDepths);
  }

  incrementZoneDepth() {
    this.zoneSystem.incrementZoneDepth(this.zoneDepths);
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

    // Show the HUD (hidden until first game start)
    this.ui.overlay.classList.remove('hidden');

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

    // Create player just below the "E X P L O R E" label (text centre = 4.5 * CELL_SIZE)
    const centerX = GRID.WIDTH / 2;
    const spawnY = GRID.CELL_SIZE * 5.5;
    this.player = new Player(centerX, spawnY);

    // Reset fishing system so Rusalka pull/suppression doesn't persist into REST
    this.fishingSystem.resetForNewRoom(this.player);

    // Reset hut/dungeon state on returning to REST
    this.hutInterior = null;
    this.dungeonFloors = [];
    this.dungeonCurrentFloor = -1;

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

    this.particles = [];
    this.gooBlobs = [];
    this.steamClouds = [];
    this.debris = [];
    this.captives = [];
    this.neutralCharacters = [];
    this.items = [];
    this.placedTraps = [];
    this.activeNoiseSource = null;

    // Restore REST ingredients from saved state (persists between REST visits)
    const savedRestIngredients = this.inventorySystem.getSavedRestIngredients();
    if (savedRestIngredients.length > 0) {
      // Restore previously saved REST ingredients
      this.ingredients = savedRestIngredients;
    } else {
      // First time in REST - place a bundle object holding the starting ingredients
      this.ingredients = [];
      const isFirstRun = Object.values(this.zoneDepths).every(depth => depth === 0);
      if (isFirstRun && !this.restBundle) {
        // Place bundle just below "C R A F T" label (row STATION_Y + 4)
        this.restBundle = {
          char: 'ට',
          color: '#cc9944',
          position: {
            x: centerX - GRID.CELL_SIZE / 2,
            y: (CRAFTING.STATION_Y + 4) * GRID.CELL_SIZE
          },
          chars: ['|', '|', '~', '~', 'g', 'g', 'f', 'f']
        };
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
    this.characterSystem.applyCharacterType(type);
  }

  applyGreenDamageModifier(attack) {
    return this.characterSystem.applyGreenDamageModifier(attack);
  }

  triggerGreenActionCooldown() {
    this.characterSystem.triggerGreenActionCooldown();
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
    this.characterSystem.spawnCharacterNPCs();
  }

  swapWithCharacter(newType) {
    this.characterSystem.swapWithCharacter(newType);
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
    return this.interactionSystem.checkCaptiveInteraction();
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

    // Reset fishing system for new room
    this.fishingSystem.resetForNewRoom(this.player);

    // Reset hut/dungeon state on room transition
    this.hutInterior = null;
    this.dungeonFloors = [];
    this.dungeonCurrentFloor = -1;
    if (this.player) {
      this.player.inHut = false;
      this.player.hutExitPosition = null;
    }

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

  enterExploreState(entryDirection = null, exitObj = null, secretPattern = null) {
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
    const _nSlots = this.inventorySystem.maxConsumableSlots;
    this.inventorySystem.spentConsumableSlots = Array(_nSlots).fill(false);
    this.inventorySystem.consumableCooldowns = Array(_nSlots).fill(0); // Reset cooldowns for new room
    this.inventorySystem.consumableFlashTimer = 0;
    this.inventorySystem.consumableFlashSlot = -1;
    this.inventorySystem.consumableBlinkSlot = -1;
    this.inventorySystem.consumableBlinkTimer = 0;
    this.inventorySystem.consumableBlinkPhase = 0;
    this.inventorySystem.consumableBlinkShowBlock = false;
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
      if (secretPattern === 'B-A-T') {
        // B-A-T sequence: generate bat belfry instead of the T tunnel room
        roomType = ROOM_TYPES.BAT_BELFRY;
      } else if (exitObj && exitObj.letter) {
        const letterData = EXIT_LETTERS[exitObj.letter];
        if (letterData && letterData.roomType) {
          roomType = ROOM_TYPES[letterData.roomType];
        }
      }

      this.roomGenerator.setDepth(this.getCurrentZoneDepth());
      this.currentRoom = this.roomGenerator.generateRoom(roomType, { x: startX, y: startY }, currentZone, progressionColor, exitObj?.letter);
      this.currentRoom.exitLetter = exitObj?.letter || null;

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

    // Reset fishing system for new room (cleans up Rusalka, bobber, fish, etc.)
    this.fishingSystem.resetForNewRoom(this.player);

    // Reset hut/dungeon state for new room
    this.hutInterior = null;
    this.dungeonFloors = [];
    this.dungeonCurrentFloor = -1;
    this.player.inHut = false;
    this.player.hutExitPosition = null;

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

      // Errand room: if an errand is active and this is an E-letter room, clear enemies and
      // spawn the traveler immediately (they remember what they wanted last time)
      if (this.errandSystem.activeErrand && this.currentRoom.exitLetter === 'E') {
        this.currentRoom.enemies = [];
        this.currentRoom.enemiesPlane0 = [];
        this.currentRoom.enemiesPlane1 = [];
        this.currentRoom.exitsLocked = false;
        const errandChar = this.errandSystem.spawnErrandCharacter();
        if (errandChar) this.neutralCharacters.push(errandChar);
      }
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

    // Update ingredient attraction, cooldown, and separation (same as EXPLORE/REST mode)
    for (let i = this.ingredients.length - 1; i >= 0; i--) {
      const ingredient = this.ingredients[i];

      if (ingredient.pickupCooldown > 0) {
        ingredient.pickupCooldown = Math.max(0, ingredient.pickupCooldown - deltaTime);
      }

      for (let j = i - 1; j >= 0; j--) {
        const other = this.ingredients[j];
        const dx = ingredient.position.x - other.position.x;
        const dy = ingredient.position.y - other.position.y;
        const distSq = dx * dx + dy * dy;
        const sep = GRID.CELL_SIZE * 1.2;
        if (distSq < sep * sep && distSq > 0.01) {
          const dist = Math.sqrt(distSq);
          const force = (sep - dist) * 40;
          const nx = dx / dist;
          const ny = dy / dist;
          ingredient.velocity.vx += nx * force * deltaTime;
          ingredient.velocity.vy += ny * force * deltaTime;
          other.velocity.vx -= nx * force * deltaTime;
          other.velocity.vy -= ny * force * deltaTime;
        }
      }

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

    // If this is a true game over (not a character-death swap), clear the pending flag
    if (!this.characterDeathPending) {
      this.characterDeathTimer = 0;
      this.pendingNextCharacter = null;
      this.characterDeathName = '';
    }

    // Update UI to show HP at 0
    this.updateUI();
  }

  preloadRoomPreviews() {
    this.roomPreviews = this.roomGenerator.preloadRoomPreviews();
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

      // Check collision with player (only if on the same plane)
      if (this.player && (gooBlob.plane ?? 0) === (this.player.plane ?? 0) && gooBlob.isNearEntity(this.player)) {
        this.player.applyStatusEffect('goo', 5.0); // 5 second goo effect
      }

      // Check collision with enemies (slimes are immune, must share plane)
      if (this.currentRoom && this.currentRoom.enemies) {
        for (const enemy of this.currentRoom.enemies) {
          if (enemy.char === 'o' || enemy.char === 'M') continue; // Slimes are immune to goo

          if ((gooBlob.plane ?? 0) === (enemy.plane ?? 0) && gooBlob.isNearEntity(enemy)) {
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

  // Yellow mage blink: check if a candidate position is free of walls, objects, and exit zones
  _isValidBlinkPosition(x, y) {
    const player = this.player;
    const w = player.width;
    const h = player.height;
    const C = GRID.CELL_SIZE;

    // 3-cell safety margin from all edges — blocks perimeter walls, exit gaps, and exit trigger zones
    const margin = C * 3;
    if (x < margin || x + w > GRID.WIDTH - margin) return false;
    if (y < margin || y + h > GRID.HEIGHT - margin) return false;

    // Wall collision map check
    if (player.collisionMap) {
      const cx1 = Math.floor(x / C);
      const cy1 = Math.floor(y / C);
      const cx2 = Math.floor((x + w - 1) / C);
      const cy2 = Math.floor((y + h - 1) / C);
      for (let cy = cy1; cy <= cy2; cy++) {
        for (let cx = cx1; cx <= cx2; cx++) {
          if (player.collisionMap[cy]?.[cx]) return false;
        }
      }
    }

    // Solid background object check
    const bgObjects = this.currentRoom?.backgroundObjects || [];
    for (const obj of bgObjects) {
      if (obj.destroyed || !obj.data?.solid) continue;
      if (x < obj.position.x + GRID.CELL_SIZE && x + w > obj.position.x &&
          y < obj.position.y + GRID.CELL_SIZE && y + h > obj.position.y) return false;
    }

    return true;
  }

  // Yellow mage blink: find the furthest valid position along the blink direction, emit trail particles, then move
  _resolveBlinkTeleport({ direction, distance }) {
    const player = this.player;
    const C = GRID.CELL_SIZE;
    const step = C / 4; // 4px steps for fine collision resolution

    const originX = player.position.x;
    const originY = player.position.y;

    // Walk forward until collision, keep last valid spot
    let bestX = originX;
    let bestY = originY;
    for (let d = step; d <= distance; d += step) {
      const testX = originX + direction.x * d;
      const testY = originY + direction.y * d;
      if (this._isValidBlinkPosition(testX, testY)) {
        bestX = testX;
        bestY = testY;
      } else {
        break;
      }
    }

    // Center points for trail calculations
    const ox = originX + player.width / 2;
    const oy = originY + player.height / 2;
    const dx = (bestX + player.width / 2) - ox;
    const dy = (bestY + player.height / 2) - oy;
    const trailDist = Math.sqrt(dx * dx + dy * dy);

    // Origin burst
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const speed = 30 + Math.random() * 25;
      this.particles.push({ x: ox, y: oy, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        life: 0.35, maxLife: 0.35, char: '*', color: player.color });
    }

    // Path trail (static dots that fade out)
    if (trailDist > 2) {
      const steps = Math.max(2, Math.floor(trailDist / (C / 2)));
      for (let i = 1; i < steps; i++) {
        const t = i / steps;
        this.particles.push({ x: ox + dx * t, y: oy + dy * t, vx: 0, vy: 0,
          life: 0.25, maxLife: 0.25, char: '.', color: player.color });
      }
    }

    // Destination burst
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const speed = 25 + Math.random() * 30;
      this.particles.push({ x: ox + dx, y: oy + dy, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        life: 0.4, maxLife: 0.4, char: '*', color: player.color });
    }

    // Apply teleport
    player.position.x = bestX;
    player.position.y = bestY;
  }

  // Shared player mechanics for both REST and EXPLORE modes
  updatePlayerMechanics(deltaTime) {
    if (!this.player) return null;

    // Handle dodge rolling (continuous direction updates, supports diagonals and curving)
    // Disabled while Rusalka's charm is active (player cannot break the trance)
    const rusalkaActive = this.fishingSystem?.rusalka?.alive === true;
    const dodgeDirection = rusalkaActive ? { x: 0, y: 0 } : this.getDodgeRollDirection();
    if (this.activeCharacterType === 'green') {
      // Green ranger: hold arrow keys for a continuous slide (no individual roll timers)
      if (dodgeDirection.x !== 0 || dodgeDirection.y !== 0) {
        const attackingWithSpaceGreen = this.keys.space && this.player.heldItem && this.player.heldItem.windupActive;
        if (this.player.actionCooldown <= 0 && !this.player.isGooey() && !attackingWithSpaceGreen) {
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
          // Drain charge while rolling (2 units per second, matching actionCooldownMax scale)
          this.player.rollCharge -= deltaTime * 1.75;
          if (this.player.rollCharge <= 0) {
            // Charge depleted — force end roll with full cooldown
            this.player.rollCharge = 0;
            this.player.continuousRollActive = false;
            this.player.actionCooldown = this.player.actionCooldownMax;
            this.player.velocity.vx = 0;
            this.player.velocity.vy = 0;
          } else {
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
        }
      } else if (this.player.continuousRollActive) {
        // Arrow keys released — cooldown proportional to charge used (longer roll = longer cooldown)
        const chargeUsed = this.player.actionCooldownMax - this.player.rollCharge;
        this.player.continuousRollActive = false;
        this.player.actionCooldown = chargeUsed;
        this.player.velocity.vx = 0;
        this.player.velocity.vy = 0;
      } else if (this.player.actionCooldown <= 0 && this.player.rollCharge < this.player.actionCooldownMax) {
        // Cooldown finished — restore charge to full
        this.player.rollCharge = this.player.actionCooldownMax;
      }
    } else {
      // Standard dodge roll for all other characters
      if (dodgeDirection.x !== 0 || dodgeDirection.y !== 0) {
        if (!this.player.dodgeRoll.active && this.player.dodgeRoll.cooldownTimer <= 0 && !this.keys.space) {
          const enemies = this.currentRoom ? this.currentRoom.enemies : [];
          const rollStarted = this.player.startDodgeRoll(dodgeDirection, enemies);

          if (rollStarted) {
            this.audioSystem.playSFX('roll');
            // Resolve yellow mage blink (deferred for collision checking + trail)
            if (this.player.pendingBlink) {
              this._resolveBlinkTeleport(this.player.pendingBlink);
              this.player.pendingBlink = null;
            }
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
      // Lock movement during fishing cast/wait
      const fishingBlocked = this.player.fishingLocked;
      // Lock facing for non-bow weapons during attack; allow aiming while charging bow
      const lockFacing = this.keys.space && this.player.heldItem && this.player.heldItem.data.weaponType !== 'BOW';
      // Apply Rusalka input suppression (scale keys toward zero)
      const rs = this.player.rusalkaInputScale;
      const rng = () => Math.random() < rs; // probabilistic suppression
      this.player.updateInput({
        up:    fishingBlocked ? false : (rs >= 1.0 ? this.keys.w : rng() && this.keys.w),
        down:  fishingBlocked ? false : (rs >= 1.0 ? this.keys.s : rng() && this.keys.s),
        left:  fishingBlocked ? false : (rs >= 1.0 ? this.keys.a : rng() && this.keys.a),
        right: fishingBlocked ? false : (rs >= 1.0 ? this.keys.d : rng() && this.keys.d)
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

    // Update ingredient attraction, cooldown, and separation (same as EXPLORE mode)
    for (let i = this.ingredients.length - 1; i >= 0; i--) {
      const ingredient = this.ingredients[i];

      if (ingredient.pickupCooldown > 0) {
        ingredient.pickupCooldown = Math.max(0, ingredient.pickupCooldown - deltaTime);
      }

      for (let j = i - 1; j >= 0; j--) {
        const other = this.ingredients[j];
        const dx = ingredient.position.x - other.position.x;
        const dy = ingredient.position.y - other.position.y;
        const distSq = dx * dx + dy * dy;
        const sep = GRID.CELL_SIZE * 1.2;
        if (distSq < sep * sep && distSq > 0.01) {
          const dist = Math.sqrt(distSq);
          const force = (sep - dist) * 40;
          const nx = dx / dist;
          const ny = dy / dist;
          ingredient.velocity.vx += nx * force * deltaTime;
          ingredient.velocity.vy += ny * force * deltaTime;
          other.velocity.vx -= nx * force * deltaTime;
          other.velocity.vy -= ny * force * deltaTime;
        }
      }

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
    // Tick down the death timer (used by both game-over and character-death paths)
    if (this.gameOverDeathTimer > 0) {
      this.gameOverDeathTimer -= deltaTime;
      if (this.gameOverDeathTimer < 0) {
        this.gameOverDeathTimer = 0;
      }
    }
    if (this.characterDeathTimer > 0) {
      this.characterDeathTimer -= deltaTime;
      if (this.characterDeathTimer < 0) {
        this.characterDeathTimer = 0;
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

    // Update physics — redirect to hut interior collision source when inside a hut
    const waterResults = (this.player.inHut && this.hutInterior)
      ? this.physicsSystem.update(deltaTime, this.hutInterior.backgroundObjects, this.hutInterior)
      : this.physicsSystem.update(deltaTime, this.currentRoom.backgroundObjects, this.currentRoom);

    // Track if lava killed the player
    let lavaKilledPlayer = false;

    // Reset per-frame liquid flags before processing
    this.player.inLiquid = false;
    for (const ingredient of this.ingredients) {
      ingredient.inWater = false;
    }

    for (const { entity, inLiquid, liquidState, damagingLiquid } of waterResults) {
      // Ingredients: lava destroys them, water makes them bob
      if (entity.pickupCooldown !== undefined) {
        if (damagingLiquid) {
          const idx = this.ingredients.indexOf(entity);
          if (idx !== -1) {
            this.physicsSystem.removeEntity(entity);
            this.ingredients.splice(idx, 1);
          }
          continue;
        }
        if (inLiquid) {
          entity.inWater = true;
          entity.bobTimer += deltaTime;
        }
        continue;
      }

      // Dropped items (weapons/armor): lava destroys them
      const itemIdx = this.items.indexOf(entity);
      if (itemIdx !== -1) {
        if (damagingLiquid) {
          this.physicsSystem.removeEntity(entity);
          this.items.splice(itemIdx, 1);
        }
        continue;
      }

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

      // Track player liquid state for Rusalka movement
      if (entity === this.player) this.player.inLiquid = true;

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

    // Rusalka water-touch respawn: if a Rusalka has ever appeared this run,
    // stepping into water in any cleared lake room summons a new one
    if (
      this.fishingSystem.rusalkaHasAppeared &&
      !this.fishingSystem.rusalka?.alive &&
      this.fishingSystem.isLakeRoom(this) &&
      this.fishingSystem.roomCleared(this)
    ) {
      const playerWaterResult = waterResults.find(r => r.entity === this.player);
      if (playerWaterResult?.inLiquid) {
        this.fishingSystem.spawnRusalkaAt(this, GRID.WIDTH / 2, GRID.HEIGHT / 2);
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

    // Sprint footstep trail: emit dots while unarmed and moving
    {
      const isSprinting = !this.player.heldItem && !this.player.dodgeRoll.active;
      const speed = Math.sqrt(this.player.velocity.vx ** 2 + this.player.velocity.vy ** 2);
      if (isSprinting && speed > 30) {
        this.player.footstepTimer -= deltaTime;
        if (this.player.footstepTimer <= 0) {
          // Drop dot at current player center; player walks away, leaving trail behind
          const f = this.player.facing;
          const cx = this.player.position.x;
          const cy = this.player.position.y;
          // Offset left/right of the facing direction to alternate feet
          const side = this.player.footstepSide === 0 ? .5 : -.5;
          const ox = -f.y * GRID.CELL_SIZE * 0.3 * side;
          const oy =  f.x * GRID.CELL_SIZE * 0.3 * side;
          this.particles.push(createFootstep(cx + ox, cy + oy));
          this.player.footstepSide = 1 - this.player.footstepSide;
          this.player.footstepTimer = 0.10;
        }
      } else {
        this.player.footstepTimer = 0;
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
    if (this.keys.space && this.attackSequenceActive && this.player.heldItem && this.player.heldItem.data.weaponType !== 'BOW' && this.player.heldItem.data.weaponType !== 'WAND' && this.player.heldItem.data.weaponType !== 'UTILITY' && !this.player.fishingLocked && !this.menuOpen && !this.cheatMenu.isOpen && this.player.canAttack()) {
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
    // Exterior enemies are frozen while player is inside a hut interior
    if (this.player.inHut) {
      // Interior enemy updates handled by HutSystem.update() above
    } else
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
        this.enemySpawnSystem.queueRequest(enemy, updateResult.spawnData);
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
          gooBlob.plane = enemy.plane ?? 0;
          this.gooBlobs.push(gooBlob);

          // FIFO queue management: max 15 goo blobs
          const MAX_GOO_BLOBS = 15;
          if (this.gooBlobs.length > MAX_GOO_BLOBS) {
            this.gooBlobs.shift(); // Remove oldest
          }
        }
      }


    }

    // Process spawn requests
    this.enemySpawnSystem.flush();

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

    // Update combat — redirect to interior enemies/objects when inside a hut
    const activeEnemies = (this.player.inHut && this.hutInterior)
      ? this.hutInterior.enemies
      : this.currentRoom.enemies;
    const activeBackgroundObjects = (this.player.inHut && this.hutInterior)
      ? this.hutInterior.backgroundObjects
      : this.currentRoom.backgroundObjects;
    const combatResult = this.combatSystem.update(
      deltaTime,
      this.player,
      activeEnemies,
      activeBackgroundObjects,
      this.activeNoiseSource,
      this.player.inHut ? this.hutInterior : this.currentRoom
    );

    // Check player attacks hitting goo blobs (destroy on hit, 5% chance to drop goo)
    if (this.gooBlobs.length > 0) {
      for (let bi = this.gooBlobs.length - 1; bi >= 0; bi--) {
        const blob = this.gooBlobs[bi];
        let hit = false;

        // Melee attacks — blades only
        for (const attack of this.combatSystem.meleeAttacks) {
          if (!attack.isBlade) continue;
          const atkR = (attack.radius || GRID.CELL_SIZE) + blob.radius;
          const dx = blob.position.x - attack.position.x;
          const dy = blob.position.y - attack.position.y;
          if (dx * dx + dy * dy < atkR * atkR) { hit = true; break; }
        }

        if (hit) {
          this.gooBlobs.splice(bi, 1);
          if (Math.random() < 0.05) {
            const ing = new Ingredient('g', blob.position.x, blob.position.y);
            this.ingredients.push(ing);
            this.physicsSystem.addEntity(ing);
          }
        }
      }
    }

    // Check melee attacks hitting fishing reward objects
    if (this.fishingSystem.rewardObjects.length > 0) {
      for (const attack of this.combatSystem.meleeAttacks) {
        if (!attack.isBlade) continue; // Only blade weapons can break reward objects

        const atkX = attack.position.x;
        const atkY = attack.position.y;
        const atkR = (attack.radius || GRID.CELL_SIZE) + GRID.CELL_SIZE;

        for (const reward of this.fishingSystem.rewardObjects) {
          if (!reward.alive) continue;
          const dx = reward.position.x + GRID.CELL_SIZE / 2 - atkX;
          const dy = reward.position.y + GRID.CELL_SIZE / 2 - atkY;
          if (dx * dx + dy * dy < atkR * atkR) {
            this.fishingSystem.hitRewardObject(reward, (char, x, y) => {
              const ing = new Ingredient(char, x, y);
              this.ingredients.push(ing);
              this.physicsSystem.addEntity(ing);
            });
          }
        }
      }
    }

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

    // Drive per-frame HUD update while consumable slot is blinking
    if (this.inventorySystem.consumableBlinkTimer > 0) {
      this.updateUI();
    }

    // Update hut/dungeon systems (door entry/exit detection and interior entity logic)
    this.hutSystem.update(deltaTime);
    this.dungeonSystem.update(deltaTime);

    // Update fishing system before death check so Rusalka kills are caught this frame
    this.fishingSystem.update(deltaTime, this);

    // If a heal consumable fired and restored HP, treat the player as alive
    // hp <= 0 catch-all covers Rusalka, burn-through-invuln, and any direct hp writes
    const playerDied = combatResult.playerDead || burnKilledPlayer || lavaKilledPlayer || this.player.hp <= 0;
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
          const diedCharData = CHARACTER_TYPES[diedCharacter];
          const nextCharacter = livingCharacters[0];

          // Set up character-death pause: stay in GAME_OVER to show "[name] lost" then wait for SPACE
          this.characterDeathPending = true;
          this.characterDeathTimer = 2.0;
          this.pendingNextCharacter = nextCharacter;
          this.characterDeathName = diedCharData.name;

          // Clear combat system before transitioning
          this.combatSystem.clear();

          console.log(`⚰️  ${diedCharData.name} lost — waiting for SPACE before switching to ${CHARACTER_TYPES[nextCharacter].name}`);
          this.stateMachine.transition(GAME_STATES.GAME_OVER);
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

        // Handle spawn-on-death and parent spawner notification
        this.enemySpawnSystem.handleEnemyDeath(enemy);

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

      // Grass bending: animate tall grass as player passes through; imprint on dodge roll.
      // Identity check uses cuttable+cutState so bent chars (/ \) don't break the gate.
      if (obj.data && obj.data.cuttable && obj.data.cutState === ',') {
        // Lazy-init grass state
        if (obj.grassImprinted === undefined) {
          obj.grassImprinted = false;
          obj.grassResetTimer = 0;
          if (!obj.grassRenderOffset) obj.grassRenderOffset = { x: 0, y: 0 };
        }

        // Imprinted grass stays bent — dodge-roll footprint, never auto-resets
        if (obj.grassImprinted) {
          // Nothing to do; char and offset remain as stamped
        } else {
          const dx = obj.position.x - this.player.position.x;
          const dy = obj.position.y - this.player.position.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const inRange = dist < GRID.CELL_SIZE * 0.7;

          if (inRange) {
            // Determine bend direction
            let newChar, newOffset;
            if (dx > GRID.CELL_SIZE * 0.25) {
              newChar = '/';
              newOffset = GRID.CELL_SIZE * 0.25;
            } else if (dx < -GRID.CELL_SIZE * 0.25) {
              newChar = '\\';
              newOffset = -GRID.CELL_SIZE * 0.25;
            } else {
              newChar = '|';
              newOffset = 0;
            }

            obj.char = newChar;
            obj.grassRenderOffset.x = newOffset;
            obj.grassResetTimer = 0.18; // brief spring-back delay

            // Stamp imprint if player is dodge rolling
            if (this.player.dodgeRoll.active && newChar !== '|') {
              obj.grassImprinted = true;
            }
          } else if (obj.grassResetTimer > 0) {
            // Spring-back: hold the bent char a moment before snapping straight
            obj.grassResetTimer -= deltaTime;
            if (obj.grassResetTimer <= 0) {
              obj.char = '|';
              obj.grassRenderOffset.x = 0;
            }
          } else {
            obj.char = '|';
            obj.grassRenderOffset.x = 0;
          }
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

    // Update ingredient attraction, cooldown, and separation
    for (let i = this.ingredients.length - 1; i >= 0; i--) {
      const ingredient = this.ingredients[i];

      // Tick pickup cooldown
      if (ingredient.pickupCooldown > 0) {
        ingredient.pickupCooldown = Math.max(0, ingredient.pickupCooldown - deltaTime);
      }

      // Ingredient-ingredient soft separation
      for (let j = i - 1; j >= 0; j--) {
        const other = this.ingredients[j];
        const dx = ingredient.position.x - other.position.x;
        const dy = ingredient.position.y - other.position.y;
        const distSq = dx * dx + dy * dy;
        const sep = GRID.CELL_SIZE * 1.2;
        if (distSq < sep * sep && distSq > 0.01) {
          const dist = Math.sqrt(distSq);
          const force = (sep - dist) * 40;
          const nx = dx / dist;
          const ny = dy / dist;
          ingredient.velocity.vx += nx * force * deltaTime;
          ingredient.velocity.vy += ny * force * deltaTime;
          other.velocity.vx -= nx * force * deltaTime;
          other.velocity.vy -= ny * force * deltaTime;
        }
      }

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

    // (fishing system updated earlier, before death check)

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

        // E-room: spawn the errand traveler after enemies are cleared
        if (this.currentRoom.letterTemplate?.neutralAfterClear) {
          const errandChar = this.errandSystem.onRoomClear(this.player);
          if (errandChar) this.neutralCharacters.push(errandChar);
        }

        // Bat belfry reward: unlock a new consumable slot
        if (this.currentRoom.isBatBelfry) {
          this.inventorySystem.unlockConsumableSlot();
          if (this.player) {
            this.player.equippedConsumables = [...this.inventorySystem.equippedConsumables];
          }
          this.menuSystem.showPickupMessage('NEW CONSUMABLE SLOT');
          this.renderer.markBackgroundDirty();
          this.updateUI();
        }
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

      this.enterExploreState('north', exitObj, secret?.pattern); // Entering from North → spawn at South
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

          this.enterExploreState('east', exitObj, secret?.pattern); // Entering from East → spawn at West
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

            this.enterExploreState('west', exitObj, secret?.pattern); // Entering from West → spawn at East
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

      // Fishing: resolve bite window OR cancel bobbing on space press
      if (
        this.fishingSystem.state === this.fishingSystem.STATES.BITE_WINDOW ||
        this.fishingSystem.state === this.fishingSystem.STATES.BOBBING
      ) {
        this.fishingSystem.onSpacePress(this);
        return;
      }

      // Fishing: start charge if holding fishing rod in lake room
      if (this.fishingSystem.canFish(this)) {
        this.fishingSystem.startCharge(this);
        return;
      }

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
      if (this.characterDeathPending && this.characterDeathTimer <= 0) {
        // A character died but others remain — swap to next character and return to REST
        this.characterDeathPending = false;
        this.gameOverWaitingForSpace = false;
        this.particles = [];
        this.debris = [];
        this.gooBlobs = [];

        // Clear active items lost with the dead character
        this.inventorySystem.restQuickSlots = [null, null, null];
        this.inventorySystem.restActiveSlotIndex = 0;
        this.inventorySystem.equippedArmor = null;
        this.inventorySystem.equippedConsumables = Array(this.inventorySystem.maxConsumableSlots).fill(null);

        // Switch to next character
        this.activeCharacterType = this.pendingNextCharacter;
        this.pendingNextCharacter = null;
        this.characterDeathName = '';
        console.log(`🔄 Respawning as ${CHARACTER_TYPES[this.activeCharacterType].name}`);

        if (this.player) {
          this.player.reset();
        }
        this.stateMachine.transition(GAME_STATES.REST);
      } else if (this.gameOverWaitingForSpace && this.gameOverDeathTimer <= 0 && !this.characterDeathPending) {
        // True game over — full reset
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
        this.errandSystem.resetOnDeath();
        this.zoneSystem.resetOnDeath(); // Reset zone system and captive tracking

        // Clear crafting slots and wipe localStorage save
        this.craftingSystem.setState({ leftSlot: null, rightSlot: null, centerSlot: null });
        this.persistenceSystem.clearSave();

        // Reset starter bundle so a fresh one spawns on new run
        this.restBundle = null;

        if (this.player) {
          this.player.reset();
        }
        this.stateMachine.transition(GAME_STATES.REST);
      }
      return;
    }

    if (state === GAME_STATES.REST) {
      // Bundle world object: destroy and scatter ingredients
      if (this.restBundle) {
        const dist = Math.hypot(
          this.player.position.x - this.restBundle.position.x,
          this.player.position.y - this.restBundle.position.y
        );
        if (dist < GRID.CELL_SIZE * 3) {
          const cx = this.restBundle.position.x;
          const cy = this.restBundle.position.y;
          const count = this.restBundle.chars.length;
          for (let i = 0; i < count; i++) {
            const angle = (i / count) * Math.PI * 2;
            const r = GRID.CELL_SIZE * (1.5 + Math.random());
            const ing = new Ingredient(
              this.restBundle.chars[i],
              cx + Math.cos(angle) * r,
              cy + Math.sin(angle) * r
            );
            ing.pickupCooldown = 0.5;
            this.ingredients.push(ing);
            this.physicsSystem.addEntity(ing);
          }
          this.restBundle = null;
          return;
        }
      }

      const nearestSlot = this.getNearestInteractiveSlot();

      if (nearestSlot) {
        if (nearestSlot.type === 'equipment-armor') { this.openEquipmentMenu('armor'); return; }
        if (nearestSlot.type === 'equipment-consumable1') { this.openEquipmentMenu('consumable1'); return; }
        if (nearestSlot.type === 'equipment-consumable2') { this.openEquipmentMenu('consumable2'); return; }
        if (nearestSlot.type === 'equipment-consumable3') { this.openEquipmentMenu('consumable3'); return; }
        if (nearestSlot.type === 'equipment-chest1') { this.openChestRetrievalMenu(0); return; }
        if (nearestSlot.type === 'equipment-chest2') { this.openChestRetrievalMenu(1); return; }
        if (nearestSlot.type === 'equipment-chest3') { this.openChestRetrievalMenu(2); return; }

        if (nearestSlot.type.startsWith('crafting-')) {
          this.menuSystem.handleCraftingSlotClaim(nearestSlot.type);
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
      // Item pickup has priority over grass interaction (same as EXPLORE)
      const hasNearbyItem = this.items.some(
        item => this.physicsSystem.getDistance(this.player, item) < 20
      );
      if (hasNearbyItem) {
        this.tryPickupItem();
        return;
      }

      // NEUTRAL state: Interact with Leshy grass or other neutral room objects
      const nearbyObject = this.findNearbyBackgroundObject();

      if (nearbyObject && nearbyObject.leshyGrass && nearbyObject.char === '|') {

        // Call neutral room system to handle interaction (grass cutting)
        const result = this.neutralRoomSystem.handleInteraction(nearbyObject, this.player, this.currentRoom);

        // Add spawned entities to game (separate ingredients from items)
        if (result && result.spawnedItems) {
          for (const entity of result.spawnedItems) {
            // Route to appropriate array based on entity type
            if (entity instanceof Ingredient) {
              this.ingredients.push(entity);
            } else {
              this.items.push(entity);
            }
            this.physicsSystem.addEntity(entity);
          }
        }

        // Always redraw background when a cluster is cut (covers cutAllRemaining too)
        if (result) {
          this.renderer.markBackgroundDirty();
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
        if (nearestSlot.type === 'equipment-chest1') { this.menuSystem.handleChestStore(0); return; }
        if (nearestSlot.type === 'equipment-chest2') { this.menuSystem.handleChestStore(1); return; }
        if (nearestSlot.type === 'equipment-chest3') { this.menuSystem.handleChestStore(2); return; }

        if (nearestSlot.type.startsWith('crafting-')) {
          this.menuSystem.handleCraftingSlotPlace(nearestSlot.type);
          return;
        }
      }
    }

    if (state === GAME_STATES.EXPLORE) {
      // Check for errand traveler interaction (SHIFT = give item)
      const giveResult = this.errandSystem.checkGive(this.player, this.neutralCharacters);
      if (giveResult) {
        const rewardItem = new Item(giveResult.rewardChar, giveResult.x, giveResult.y);
        this.items.push(rewardItem);
        this.physicsSystem.addEntity(rewardItem);
        return;
      }

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
        this.trapSystem.dropOrPlaceTrap();
      }
    }

    this.updateUI();
  }

  handleCycleNext() {
    const state = this.stateMachine.getCurrentState();
    if (state !== GAME_STATES.EXPLORE && state !== GAME_STATES.REST && state !== GAME_STATES.NEUTRAL) return;

    this.player.cycleSlotNext();
    this.updateUI();
  }

  handleCyclePrevious() {
    const state = this.stateMachine.getCurrentState();
    if (state !== GAME_STATES.EXPLORE && state !== GAME_STATES.REST && state !== GAME_STATES.NEUTRAL) return;

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
    this.trapSystem.placeTrap();
  }

  updatePlacedTraps(deltaTime) {
    this.trapSystem.updatePlacedTraps(deltaTime);
  }

  updateExitCollisions() {
    this.exitSystem.updateExitCollisions(this.currentRoom, this.player);
  }

  findNearbyBackgroundObject() {
    return this.interactionSystem.findNearbyBackgroundObject();
  }

  interactWithObject(obj) {
    this.interactionSystem.interactWithObject(obj);
  }

  handleObjectEffect(effect, obj) {
    this.interactionSystem.handleObjectEffect(effect, obj);
  }

  spawnLoot(enemy) {
    this.lootSystem.spawnLoot(enemy);
  }

  spawnIngredientDrop(char, x, y, angle = null) {
    return this.lootSystem.spawnIngredientDrop(char, x, y, angle);
  }

  spawnItemDrop(char, x, y, angle = null) {
    return this.lootSystem.spawnItemDrop(char, x, y, angle);
  }


  findSpawnPosition(center, range, collisionMap, enemies) {
    return this.roomGenerator.findSpawnPosition(center, range, collisionMap, enemies);
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
    this.menuSystem.updateUI();
  }


  openEquipmentMenu(slotType) {
    this.menuSystem.openEquipmentMenu(slotType);
  }

  openChestRetrievalMenu(slotIdx = null) {
    this.menuSystem.openChestRetrievalMenu(slotIdx);
  }

  openCraftingMenu(slotType) {
    this.menuSystem.openCraftingMenu(slotType);
  }

  closeMenu() {
    this.menuSystem.closeMenu();
  }

  selectMenuItem() {
    this.menuSystem.selectMenuItem();
  }

  handleCenterSlotSelection(selectedItem) {
    this.menuSystem.handleCenterSlotSelection(selectedItem);
  }

  getIngredientData(char) {
    return INGREDIENTS[char] || { name: 'Unknown' };
  }
}

// Start game when page loads
window.addEventListener('load', () => {
  new Game();
});
