import { GameLoop } from './game/GameLoop.js';
import { GameStateMachine } from './game/GameStateMachine.js';
import { ASCIIRenderer } from './rendering/ASCIIRenderer.js';
import { RenderController } from './rendering/RenderController.js';
import { PhysicsSystem } from './systems/PhysicsSystem.js';
import { inSamePlane } from './systems/PlaneSystem.js';
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
import { DemoSystem } from './systems/DemoSystem.js';
import { AudioSystem } from './systems/AudioSystem.js';
import { FishingSystem } from './systems/FishingSystem.js';
import { LootSystem } from './systems/LootSystem.js';
import { TrapSystem } from './systems/TrapSystem.js';
import { WireSystem } from './systems/WireSystem.js';
import { InteractionSystem } from './systems/InteractionSystem.js';
import { CharacterSystem } from './systems/CharacterSystem.js';
import { MenuSystem } from './systems/MenuSystem.js';
import { AnimationSystem } from './systems/AnimationSystem.js';
import { EnemySpawnSystem } from './systems/EnemySpawnSystem.js';
import { HutSystem } from './systems/HutSystem.js';
import { PressSystem } from './systems/PressSystem.js';
import { DungeonSystem } from './systems/DungeonSystem.js';
import { MazeSystem } from './systems/MazeSystem.js';
import { BossSystem } from './systems/BossSystem.js';
import { BoulderSystem } from './systems/BoulderSystem.js';
import { SpellSystem } from './systems/SpellSystem.js';
import { RidgeSystem } from './systems/RidgeSystem.js';
import { PolymorphSystem } from './systems/PolymorphSystem.js';
import { MagicSystem } from './systems/MagicSystem.js';
import { WellSystem } from './systems/WellSystem.js';
import { FountainSystem } from './systems/FountainSystem.js';
import { Fairy } from './entities/Fairy.js';
import { CampNPCSystem } from './systems/CampNPCSystem.js';
import { CAMP_NPC_STATE } from './entities/CampNPC.js';
import { Player } from './entities/Player.js';
import { Enemy } from './entities/Enemy.js';
import { Ingredient } from './entities/Ingredient.js';
import { Item } from './entities/Item.js';
import { BackgroundObject } from './entities/BackgroundObject.js';
import { GooBlob } from './entities/GooBlob.js';
import { Crow } from './entities/Crow.js';
import { NPCRat } from './entities/NPCRat.js';
import { Particle, createExplosion, createWetDrop, createActivationBurst, createSteamPuff, createChaff, createDodgeTrail, createFootstep, createEmberBurst, createIceBurst, createFrostAuraParticle, createFlameAuraParticle, createShockAuraParticle } from './entities/Particle.js';
import { createDebris } from './entities/Debris.js';
import { Puddle } from './entities/Puddle.js';
import { Captive } from './entities/Captive.js';
import { Leshy } from './entities/Leshy.js';
import { CharacterNPC } from './entities/CharacterNPC.js';
import { WiseFellow } from './entities/WiseFellow.js';
import { ITEM_TYPES, INGREDIENTS, ITEMS } from './data/items.js';
import { CHARACTER_TYPES } from './data/characters.js';
import { EXIT_LETTERS } from './data/exitLetters.js';
import { ZONES } from './data/zones.js';
import { GAME_STATES, GRID, CRAFTING, INTERACTION_RANGE, ROOM_TYPES } from './game/GameConfig.js';
import { captureDeath, downloadSessionLedger } from './systems/DeathLedgerSystem.js';

// Enemies that play the magical death SFX when no per-enemy sfx.death is set.
// Covers arcane casters and pure elemental beings; element-tinted beasts
// (Fire Bat, Frost Wolf, etc.) keep the generic destroy sound.
const MAGIC_DEATH_NAMES = new Set([
  'Wizard', 'Shaman', 'Necromancer', 'Hex Witch', 'Alchemist',
  'Cryomancer', 'Storm Caller',
  'Ember Sprite', 'Pyroclast', 'Fire Elemental',
  'Breeze Wisp', 'Ice Wraith', 'Frozen Construct', 'Steam Specter',
  'Spark', 'Voltaic Golem', 'Mirror Imp'
]);

// Particle Fireworks (debug toggle): each entry produces one effect at (x, y),
// cycled in order. Mix of bursts (return arrays) and single emitters.
const FIREWORK_FACTORIES = [
  { name: 'WetDrop',        fn: (x, y) => createWetDrop(x, y) },
  { name: 'SteamPuff',      fn: (x, y) => createSteamPuff(x, y) },
  { name: 'ActivationBurst',fn: (x, y) => createActivationBurst(x, y) },
  { name: 'EmberBurst',     fn: (x, y) => createEmberBurst(x, y) },
  { name: 'IceBurst',       fn: (x, y) => createIceBurst(x, y) },
  { name: 'Explosion',      fn: (x, y) => createExplosion(x, y) },
  { name: 'Chaff',          fn: (x, y) => createChaff(x, y) },
  { name: 'Footstep',       fn: (x, y) => createFootstep(x, y) },
  { name: 'FrostAura',      fn: (x, y) => createFrostAuraParticle(x, y) },
  { name: 'FlameAura',      fn: (x, y) => createFlameAuraParticle(x, y) },
  { name: 'ShockAura',      fn: (x, y) => createShockAuraParticle(x, y) },
  { name: 'DodgeTrail',     fn: (x, y) => createDodgeTrail(x, y) }
];

// Starter satchel: 3 distinct ingredients from a fixed pool. Metal is always x1;
// everything else drops x2 (per-run randomization for replay variety).
function rollStarterSatchelChars() {
  const pool = ['g', '0', '|', '~', 'f', 'M'];
  const picks = [];
  const remaining = pool.slice();
  for (let i = 0; i < 3; i++) {
    const idx = Math.floor(Math.random() * remaining.length);
    picks.push(remaining.splice(idx, 1)[0]);
  }
  const chars = [];
  for (const c of picks) {
    const count = c === 'M' ? 1 : 2;
    for (let i = 0; i < count; i++) chars.push(c);
  }
  return chars;
}

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
    this.exitSystem = new ExitSystem(this.zoneSystem, this);
    this.roomGenerator = new RoomGenerator(this.exitSystem, this.zoneSystem, this);
    this.neutralRoomSystem = new NeutralRoomSystem();
    this.errandSystem = new ErrandSystem();
    this.cheatMenu = new CheatMenu(this);
    this.persistenceSystem = new PersistenceSystem();
    this.inventorySystem = new InventorySystem();
    this.audioSystem = new AudioSystem();
    this.combatSystem.audioSystem = this.audioSystem;
    this.combatSystem.game = this;
    this.fishingSystem = new FishingSystem();
    // New focused systems (instantiated after core systems so they can receive `this`)
    this.lootSystem = new LootSystem(this);
    this.trapSystem = new TrapSystem(this);
    this.wireSystem = new WireSystem(this);
    this.interactionSystem = new InteractionSystem(this);
    this.characterSystem = new CharacterSystem(this);
    this.menuSystem = new MenuSystem(this);
    this.animationSystem = new AnimationSystem(this);
    this.enemySpawnSystem = new EnemySpawnSystem(this);
    this.hutSystem = new HutSystem(this);
    this.pressSystem = new PressSystem(this);
    this.dungeonSystem = new DungeonSystem(this);
    this.mazeSystem = new MazeSystem(this);
    this.bossSystem = new BossSystem(this);
    this.boulderSystem = new BoulderSystem(this);
    this.spellSystem = new SpellSystem(this);
    this.ridgeSystem = new RidgeSystem(this);
    this.polymorphSystem = new PolymorphSystem();
    this.magicSystem = new MagicSystem(this);
    this.wellSystem = new WellSystem(this);
    this.fountainSystem = new FountainSystem(this);
    this.demoSystem = new DemoSystem(this);
    // Wire InventorySystem back to game so it can mutate player.equippedConsumables
    this.inventorySystem.game = this;
    this.campNPCSystem = new CampNPCSystem(this);
    this.bridgeMenuOpen = false;

    // Game state
    this.player = null;
    this.previousPlayerPosition = { x: 0, y: 0 }; // Track previous position for exit zone crossing detection
    this.currentRoom = null;
    this.ingredients = [];
    this.items = [];
    this.placedTraps = []; // Placed trap items { item, tickTimer, activeDuration, affectedEnemies }
    this.wellCoinAnim = null;       // WellSystem in-flight coin animation state
    this.wellFlashTimer = 0;        // Post-ritual screen flash decay
    this.wellFlashDuration = 0;     // Initial flash duration (used for normalized alpha)
    this.fairiesAngered = false;    // Run-scoped: set when fountain is corrupted; suppresses all fairy spawns
    this.fedCrowCount = 0;          // Run-scoped: bread-fed crows so far (caps at 3); boosts crow spawn odds in new rooms
    this.companionCrows = [];       // Run-scoped: crows that ate bread; act as combat companions across rooms
    this.followerCrows = [];        // Room-scoped: bystander crows that joined a feed event in the current room
    this.tamedRats = [];            // Run-scoped: rats that ate bread; companion mode driven by Enemy.tamed

    // Selectors that return arrays of entities eligible to eat a dropped loaf.
    // SPACE with bread equipped is a no-op unless at least one selector returns
    // a non-empty list. Append more selectors as new feed-able creatures land.
    this.breadTargetSelectors = [
      (game) => game.currentRoom?.crows || [],
      (game) => game.followerCrows || [],
      // Wild rats in the current room are eligible: SPACE drops a loaf and the
      // nearest wild rat paths to it via updateBreadSeekingRats.
      (game) => (game.currentRoom?.enemies || []).filter(e => e.char === 'r' && !e.tamed && e.hp > 0)
    ];
    this.activeNoiseSource = null; // Set each frame by updatePlacedTraps if noise-maker is active
    this.backgroundObjects = [];
    this.steamClouds = []; // Steam clouds from fire+water and Steam Vial
    this.soundEvents = []; // Sound pulses emitted by player attacks/interactions; used for enemy detection
    this.particles = []; // Explosion particles
    this.debris = []; // Enemy debris
    this.gooBlobs = []; // Goo blobs from Goo Dispenser
    this.puddles = []; // Persistent slime puddles from Slime Bomb
    this.enemyShockwaves = []; // Invisible expanding rings from enemy attacks (e.g., Giant Slime leap landing)
    this.wishesUsed = 0; // CLEANSE spell wishes used this run (max 3)
    this.cleanseWave = null; // Active wave animation { startTime, duration }
    this.bossDefeatFlash = null; // White screen flash on boss defeat { startTime, duration }
    this._savedDestroyedSlots = [false, false, false]; // Persists across player recreations
    this.neutralCharacters = []; // Neutral entities (Leshy, NPCs, etc.)
    this.cureRusalka = null;      // Stationary cure Rusalka for polymorph reversal (Lake rooms)
    this.playerTongueAttacks = []; // Player frog-tongue attacks when polymorphed
    this.activeFloor = null;       // Active interior floor (hut or dungeon floor). Null on surface.
    this.mazeInterior = null;   // Active maze interior (MazeSystem)
    this.dungeonFloors = [];       // Persistent dungeon floor states for current visit
    this.dungeonCurrentFloor = -1; // -1 = not in dungeon
    this.companion = null;         // Active camp NPC companion (promoted from room.campNPC)

    // Tracks which zone's music is currently loaded (for zone-specific music switching)
    this.currentMusicZone = 'green';

    // Pre-boss gate: set at depth 14 room clear, cleared on room transition
    this.preBossGateActive = false;

    // Per-zone depth tracking (independent progression)
    this.zoneDepths = {
      green: 0,
      red: 0,
      cyan: 0,
      yellow: 0,
      gray: 0
    };

    this.knownSpells = new Set(); // Spells the player has learned this run (resets on death)

    this.gameOverWaitingForSpace = false;
    this.gameOverDeathTimer = 0; // Timer for 2-second delay before showing "Press SPACE"
    this.characterDeathPending = false; // True when a character died but others remain
    this.characterDeathTimer = 0; // Like gameOverDeathTimer but for character-death path
    this.pendingNextCharacter = null; // Character type to swap to after space press
    this.characterDeathName = ''; // Name of the character who just died

    // Tombstone: appears in REST after death, tracks what killed the player
    this.lastDeathCause = null; // { name, char, color, description } of the killing enemy
    this.tombstoneActive = false; // Show tombstone in REST mode
    this.tombstonePopup = null; // { phase: 0|1|2, timer: float } or null

    // Slot popup: animated expand box before equipment/chest menus open
    this.slotPopup = null; // { phase, timer, pixelX, pixelY, open: fn } or null

    // Trap throw charge state
    this.trapCharging = null; // { timer: float } while player is charging a throw, null otherwise
    this.inFlightTraps = [];  // [{ x, y, vx, vy, decel, targetX, targetY, char, color, trapData, plane }]
    this.restBundle = null; // One-time starter bundle object (destroyed on SPACE to drop ingredients)
    this.particleFireworks = false; // Debug toggle: cycles every particle factory at random screen positions
    this._fwTimer = 0;
    this._fwIndex = -1;
    this.hasLeftRestOnce = false; // Becomes true on first EXPLORE entry; gates the rest-bundle pickup hint arrow
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

    // Ocean (O room) ambient wave SFX timer — counts down to next play.
    this.waveSfxTimer = 0;

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
      space: false, shift: false, tab: false,
      m: false, v: false
    };
    // Rolling keystroke buffer for background word highlighting (up to 9 chars, uppercase)
    this.keyBuffer = [];
    // Per-letter flash timestamps for one-shot blink rendering { 'A': performance.now(), ... }
    this.keyFlashMap = {};
    this.spacePressed = false;
    this.shiftPressed = false;
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
      slot1: document.getElementById('slot-1'),
      slot2: document.getElementById('slot-2'),
      slot3: document.getElementById('slot-3'),
      weaponChar1: document.getElementById('weapon-char-1'),
      weaponChar2: document.getElementById('weapon-char-2'),
      weaponChar3: document.getElementById('weapon-char-3'),
      menu: document.getElementById('menu-overlay'),
      armorChar: document.getElementById('armor-char'),
      consumableChar1: document.getElementById('consumable-char-1'),
      consumableChar2: document.getElementById('consumable-char-2'),
      consumableChar3: document.getElementById('consumable-char-3'),
      consumableChar4: document.getElementById('consumable-char-4'),
      consumableChar5: document.getElementById('consumable-char-5'),
      cslot1: document.getElementById('cslot-1'),
      cslot2: document.getElementById('cslot-2'),
      cslot3: document.getElementById('cslot-3'),
      cslot4: document.getElementById('cslot-4'),
      cslot5: document.getElementById('cslot-5'),
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
    // Arcade attract-mode: after this many seconds of idle on the pre-intro
    // title screen, the demo begins playing behind the launch button.
    this.titleIdleTimer = 0;
    this.TITLE_IDLE_THRESHOLD = 5.0;

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
        if (this.cheatMenu.isOpen) {
          // Clear any held keys / charges so the player stops moving/attacking
          this.keys.w = this.keys.a = this.keys.s = this.keys.d = false;
          this.keys.space = this.keys.shift = this.keys.tab = this.keys.v = false;
          this.spacePressed = false;
          this.shiftPressed = false;
          this.vPressed = false;
          this.attackSequenceActive = false;
          if (this.arrowKeys) {
            this.arrowKeys.ArrowUp = this.arrowKeys.ArrowDown = false;
            this.arrowKeys.ArrowLeft = this.arrowKeys.ArrowRight = false;
          }
        }
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
        } else if (result && result.action === 'spawn_enemy') {
          this.spawnCheatEnemy(result.enemy);
          e.preventDefault();
          return;
        } else if (result && result.action === 'spawn_object') {
          this.spawnCheatObject(result.objChar);
          this.cheatMenu.toggle(); // Close so the player can reposition for the next placement
          e.preventDefault();
          return;
        } else if (result && result.action === 'trigger_boulder') {
          this.boulderSystem?.triggerBoulderRain(1);
          this.cheatMenu.toggle();
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
        } else if (result && result.action === 'boss_test') {
          this.handleBossTest(result.zone);
          this.cheatMenu.toggle();
          e.preventDefault();
          return;
        } else if (result && result.action === 'set_depth') {
          this.handleDepthJump(result.depth);
          this.cheatMenu.toggle();
          e.preventDefault();
          return;
        } else if (result && result.action === 'toggle_god_mode') {
          this.cheatMenu.godMode = !this.cheatMenu.godMode;
          this.player.godMode = this.cheatMenu.godMode;
          this.cheatMenu.rebuild();
          e.preventDefault();
          return;
        } else if (result && result.action === 'activate_magic_meter') {
          this.magicSystem?.activateMagicMeter(this.player);
          this.cheatMenu.rebuild();
          this.updateUI();
          e.preventDefault();
          return;
        } else if (result && result.action === 'toggle_demo_recording') {
          this.toggleDemoRecording();
          this.cheatMenu.rebuild();
          e.preventDefault();
          return;
        } else if (result && result.action === 'toggle_particle_fireworks') {
          this.particleFireworks = !this.particleFireworks;
          this._fwTimer = 0;
          this._fwIndex = -1;  // first tick advances to 0
          this.cheatMenu.rebuild();
          e.preventDefault();
          return;
        } else if (result && result.action === 'download_death_ledger') {
          downloadSessionLedger();
          e.preventDefault();
          return;
        }
        // Menu is open — swallow all unhandled keys so player can't move/attack/roll/drop
        e.preventDefault();
        return;
      }

      // Arcade demo: any keypress aborts playback back to the pre-intro title.
      if (this.stateMachine.getCurrentState() === GAME_STATES.ARCADE_DEMO) {
        this.stateMachine.transition(GAME_STATES.TITLE);
        e.preventDefault();
        return;
      }

      // Demo recording toggle (dev hotkey). Placed after the arcade-demo
      // abort so 'r' during playback still cancels back to title, and before
      // recordEvent so the toggle keystroke isn't captured into the buffer.
      if (e.key === 'r' || e.key === 'R') {
        this.toggleDemoRecording();
        e.preventDefault();
        return;
      }

      // Recording mode: capture keydown for later playback before normal handling.
      if (this.demoSystem.recording) {
        this.demoSystem.recordEvent('keydown', e.key);
      }

      // Handle menu navigation
      if (this.menuOpen) {
        const key = e.key.toLowerCase();

        // Movement-exit: close menu on A/D when flagged (e.g. chest retrieval menu)
        // W/S are reserved for up/down navigation and must not close the menu
        if (this.menuSystem.closeOnMovement && (key === 'a' || key === 'd')) {
          this.menuSystem.closeOnMovement = false;
          this.closeMenu();
          e.preventDefault();
          return;
        }

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
      if (e.key === 'Tab') {
        this.keys.tab = true;
        e.preventDefault();
      }
      // Space/Shift/Enter: detect spell FIRST so spells can preempt game-state handlers
      if (e.key === ' ' || e.key === 'Shift' || e.key === 'Enter') {
        this.spellSystem.detect(this.keyBuffer);
        this.keyBuffer = [];
        this.keyFlashMap = {};
      } else if (e.key.length === 1) {
        const upper = e.key.toUpperCase();
        this.keyBuffer.push(upper);
        if (this.keyBuffer.length > 9) this.keyBuffer.shift();
        this.keyFlashMap[upper] = performance.now();
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
        if (!this.shiftPressed && !this.player?.polymorphed) {
          this.shiftPressed = true;
          this.handleShiftPress();
        }
      }
      if (!this.player?.polymorphed) {
        if (key === '1') this.handleSelectSlot(0);
        if (key === '2') this.handleSelectSlot(1);
        if (key === '3') this.handleSelectSlot(2);
      }
      if (key === 'v') {
        this.keys.v = true;
        if (!this.vPressed) {
          this.vPressed = true;
          this.handleVPress();
        }
      }



      // Arrow keys for dodge rolling — suppressed when polymorphed
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown' ||
          e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        if (!this.player?.polymorphed) this.arrowKeys[e.key] = true;
        e.preventDefault();
      }
    });

    window.addEventListener('keyup', (e) => {
      // Block all player action-release logic while the cheat menu is open
      if (this.cheatMenu.isOpen) {
        e.preventDefault();
        return;
      }
      // Recording mode: capture keyup so playback can release held keys.
      if (this.demoSystem.recording) {
        this.demoSystem.recordEvent('keyup', e.key);
      }
      const key = e.key.toLowerCase();
      if (key === 'w' || key === 'a' || key === 's' || key === 'd') {
        this.keys[key] = false;
      }
      if (e.key === 'Tab') {
        this.keys.tab = false;
      }
      if (key === ' ') {
        this.keys.space = false;
        this.spacePressed = false;
        this.handleSpaceRelease();
      }
      if (key === 'shift') {
        this.keys.shift = false;
        this.shiftPressed = false;
        this.handleShiftRelease();
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

    // Click handler for launch button on title screen (and during demo).
    window.addEventListener('click', (e) => {
      const state = this.stateMachine.getCurrentState();

      if (state !== GAME_STATES.TITLE && state !== GAME_STATES.ARCADE_DEMO) return;
      if (!this.launchButtonBounds) return;

      const canvas = document.getElementById('foreground-layer');
      const rect = canvas.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;

      const bounds = this.launchButtonBounds;
      const inLaunch = clickX >= bounds.x && clickX <= bounds.x + bounds.width &&
                       clickY >= bounds.y && clickY <= bounds.y + bounds.height;
      if (!inLaunch) return;

      // If the demo is playing, end it first so we land cleanly on the title.
      if (state === GAME_STATES.ARCADE_DEMO) {
        this.stateMachine.transition(GAME_STATES.TITLE);
      }

      // Pre-intro click starts the intro animation; post-intro click skips to REST.
      if (!this.introAnimationStarted) {
        this.introAnimationStarted = true;
        this.audioSystem.play();
        this.renderer.markBackgroundDirty();
      } else {
        this.stateMachine.transition(GAME_STATES.REST);
      }
    });

    // Mousemove handler for cursor styling on title screen
    window.addEventListener('mousemove', (e) => {
      const state = this.stateMachine.getCurrentState();
      const canvas = document.getElementById('foreground-layer');

      // Update cursor on title or while demo is playing (launch button stays clickable).
      if ((state === GAME_STATES.TITLE || state === GAME_STATES.ARCADE_DEMO) && this.launchButtonBounds) {
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

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

    this.stateMachine.registerStateHandler(GAME_STATES.ARCADE_DEMO, () => {
      this.enterDemoState();
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
    // Safety: ensure no seeded RNG carries over from a prior demo run.
    this.demoSystem?.stopPlayback();

    // TITLE never shows the HUD. If we're returning here from ARCADE_DEMO
    // (which routed through enterExploreState), the overlay still has
    // slide-up applied — clear it.
    this.ui.overlay.classList.remove('slide-up');
    this.ui.overlay.classList.add('hidden');

    // TITLE is always a "no run in progress" state. Reset every gameplay
    // variable the arcade demo (or anything else) may have touched so the
    // next real run from this title screen starts at L1 in a fresh world.
    // Idempotent on first boot — these fields are already in their initial
    // form set by the constructor.
    this.zoneDepths = { green: 0, red: 0, cyan: 0, yellow: 0, gray: 0, blue: 0 };
    this.zoneSystem.resetOnDeath();
    this.roomGenerator.setDepth(0);
    this.bossSystem.deactivate();
    this.physicsSystem.clear();
    this.combatSystem.clear();
    this.inventorySystem.clearAllCharacterInventories();
    this.currentRoom = null;
    this.backgroundObjects = [];
    this.items = [];
    this.ingredients = [];
    this.placedTraps = [];
    this.currentMusicZone = 'green';
    this.preBossGateActive = false;
    this.knownSpells?.clear?.();
    this.blueZoneRoom = 0;

    // No player needed for title screen
    this.player = null;
    this.renderer.markBackgroundDirty();

    // Initialize title animation timer and button bounds
    this.titleAnimationTime = 0;
    this.introAnimationStarted = false; // Start with pre-intro screen
    this.launchButtonBounds = null; // Will be set by TitleRenderer
    this.titleIdleTimer = 0;

    // Load title screen music (single track with custom loop point).
    // Skip the reload if it's already loaded — re-entering TITLE from the
    // demo would otherwise dispose the loaded buffer and replace it with
    // an in-flight async fetch, leaving audioSystem.play() silent because
    // singleBuffer is null until the fetch resolves.
    const titleTrackLoaded = this.audioSystem.mode === 'single' && this.audioSystem.singleBuffer;
    if (!titleTrackLoaded) {
      this.audioSystem.loadSingleTrack(`${import.meta.env.BASE_URL}assets/audio/intro-loop.mp3`, 8.998, 0.7);
    }
  }

  enterDemoState() {
    // Arcade attract-mode: bootstrap an EXPLORE-style world from the
    // current recording's snapshot, then let DemoSystem drive synthetic
    // input through the explore update loop.
    const recording = this.demoSystem.currentRecording;
    if (!recording) {
      this.stateMachine.transition(GAME_STATES.TITLE);
      return;
    }

    // SFX are normally loaded on first TITLE→REST transition; the demo skips
    // REST, so load them here. Idempotent — no-op once loaded.
    this.audioSystem.loadGameplaySFX(import.meta.env.BASE_URL);

    // Bootstrap player + a default explore room so we have scaffolding to
    // overwrite. This drains the global RNG, which is fine — we reseed
    // afterwards and run the deterministic demo setup from a fresh state.
    this.enterExploreState();

    // Attract-mode is title-screen scenery — the HP/depth/slots HUD must
    // not be visible. enterExploreState slid it up; put it back.
    this.ui.overlay.classList.remove('slide-up');
    this.ui.overlay.classList.add('hidden');

    // Now reseed for deterministic AI / room generation.
    this.demoSystem.installSeededRandom(recording.seed);

    // Generate the demo's room under the seeded RNG.
    this._setupDemoWorld(recording.room, recording.startState);

    // Apply the player startState snapshot (character, hp, loadout, pos).
    this._applyDemoStartState(recording.startState);

    // Overlay enemy snapshot on top of the regenerated room.
    this._applyDemoEnemies(recording.enemies);

    // Begin event playback now that the world matches the recording.
    this.demoSystem.startPlayback();

    // Player must not die mid-demo; godMode is the cleanest safety net.
    if (this.player) this.player.godMode = true;
  }

  // ── Demo room/state setup helpers ───────────────────────────────────────
  //
  // Shared by recording (toggle_demo_recording) and playback (enterDemoState)
  // so the world generation path is identical in both directions. Keeping
  // these in main.js (next to enterDemoState/enterExploreState) makes the
  // orchestration responsibilities obvious; DemoSystem stays focused on
  // event capture/playback.

  /**
   * Toggle the DemoSystem recorder. Shared by the cheat-menu entry and the
   * 'r' global hotkey so both paths build the seeded world identically.
   */
  toggleDemoRecording() {
    if (this.demoSystem.recording) {
      this.demoSystem.stopRecording();
      return;
    }
    // Capture the room spec BEFORE installing the seed so it reflects
    // where the player chose to start the recording.
    const roomSpec = this._buildDemoRoomSpec();
    this.demoSystem.startRecording();
    // Regenerate the current room under the seeded RNG so playback sees
    // the same world the recording captured.
    if (this.stateMachine.getCurrentState() === GAME_STATES.EXPLORE) {
      this._setupDemoWorld(roomSpec, null);
    }
    // Capture player + enemy snapshot AFTER the seeded regen.
    const startState = this._captureDemoStartState();
    const enemies = this._captureDemoEnemies();
    this.demoSystem.setRecordingContext({ roomSpec, startState, enemies });
  }

  /** Read current world state into a roomSpec for the active recording. */
  _buildDemoRoomSpec() {
    const zone = this.zoneSystem.currentZone || 'green';
    const depth = this.zoneDepths[zone] || 1;
    const boss = !!(this.currentRoom && this.currentRoom.isZoneBossRoom);
    return { zone, depth, boss };
  }

  /** Capture the player state needed to reproduce demo conditions. */
  _captureDemoStartState() {
    const p = this.player;
    if (!p) return null;
    return {
      characterType: p.characterType || 'default',
      hp: p.hp,
      quickSlots: p.quickSlots.map(slot => (slot ? slot.char : null)),
      activeSlotIndex: p.activeSlotIndex || 0,
      position: { x: p.position.x, y: p.position.y },
      magicMeter: {
        active: !!p.magicMeter?.active,
        slots: Array.isArray(p.magicMeter?.slots) ? [...p.magicMeter.slots] : [],
        current: p.magicMeter?.current || 0,
        max: p.magicMeter?.max || 10,
      },
    };
  }

  /** Capture room enemies into a plain-data snapshot. */
  _captureDemoEnemies() {
    const enemies = this.currentRoom?.enemies || [];
    return enemies.map(e => ({
      char: e.char,
      x: e.position.x,
      y: e.position.y,
      hp: e.hp,
    }));
  }

  /**
   * Generate the demo's room under whatever RNG is currently installed.
   * Mirrors the cheat-menu warp paths (handleZoneTeleport / handleBossTest)
   * but skipped of side effects we don't need for a demo (music switches,
   * grace timers tied to player progress).
   */
  _setupDemoWorld(roomSpec, _startState) {
    if (!roomSpec) return;
    const zone = roomSpec.zone || 'green';
    const depth = roomSpec.depth || 1;
    const wantBoss = !!roomSpec.boss;

    // Force the zone + depth so room generation is deterministic.
    const zoneColor = ZONES[zone]?.exitColor || '#ffffff';
    this.zoneSystem.pathHistory = [
      { letter: 'X', color: zoneColor },
      { letter: 'X', color: zoneColor },
      { letter: 'X', color: zoneColor },
    ];
    this.zoneSystem.currentZone = zone;
    this.zoneDepths[zone] = depth;
    this.roomGenerator.setDepth(depth);

    // Deactivate any prior boss state before regenerating.
    this.bossSystem.deactivate();

    const playerPos = this.player
      ? { x: this.player.position.x, y: this.player.position.y }
      : { x: GRID.WIDTH / 2, y: (GRID.ROWS - 3) * GRID.CELL_SIZE };

    this.roomGenerator.isZoneBossRoom = wantBoss;
    const roomType = wantBoss ? ROOM_TYPES.BOSS : null;
    const newRoom = this.roomGenerator.generateRoom(roomType, playerPos, zone, null);
    this.roomGenerator.isZoneBossRoom = false;

    this.currentRoom = newRoom;
    this.backgroundObjects = newRoom.backgroundObjects || [];
    this.items = newRoom.items || [];
    this.ingredients = newRoom.ingredients || [];
    this.placedTraps = [];

    if (wantBoss) {
      this.bossSystem.activate(newRoom, zone);
    }

    // Apply room-declared spawn zone so the player isn't stranded in a wall
    // after regeneration.
    if (this.player) {
      if (newRoom.spawnZones?.default) {
        this.player.position.x = newRoom.spawnZones.default.x;
        this.player.position.y = newRoom.spawnZones.default.y;
      }
      this.player.setCollisionMap(newRoom.collisionMap);
    }

    for (const enemy of newRoom.enemies) {
      enemy.setTarget(this.player);
      enemy.setCollisionMap(newRoom.collisionMap);
    }

    // Reset physics + combat so we start clean.
    this.physicsSystem.clear();
    if (this.player) this.physicsSystem.addEntity(this.player);
    for (const enemy of newRoom.enemies) {
      this.physicsSystem.addEntity(enemy);
    }
    for (const item of this.items) {
      this.physicsSystem.addEntity(item);
    }
    this.combatSystem.clear();
    this.renderer.markBackgroundDirty();
  }

  /** Apply a demo startState snapshot onto the active player. */
  _applyDemoStartState(startState) {
    if (!startState || !this.player) return;

    if (startState.characterType && startState.characterType !== this.player.characterType) {
      this.applyCharacterType(startState.characterType);
    }

    if (startState.hp != null) {
      this.player.hp = startState.hp;
    }

    if (startState.position) {
      this.player.position.x = startState.position.x;
      this.player.position.y = startState.position.y;
      this.player.velocity.vx = 0;
      this.player.velocity.vy = 0;
    }

    if (Array.isArray(startState.quickSlots)) {
      this.player.quickSlots = startState.quickSlots.map(char => {
        if (!char) return null;
        return new Item(char, 0, 0);
      });
    }

    if (Number.isInteger(startState.activeSlotIndex)) {
      this.player.activeSlotIndex = Math.max(
        0,
        Math.min(startState.activeSlotIndex, this.player.quickSlots.length - 1)
      );
    }

    // Restore magic meter so wand demos can actually cast.
    if (startState.magicMeter && this.player.magicMeter) {
      const mm = startState.magicMeter;
      this.player.magicMeter.active = !!mm.active;
      this.player.magicMeter.slots = Array.isArray(mm.slots) ? [...mm.slots] : [];
      this.player.magicMeter.max = mm.max || this.player.magicMeter.max;
      this.player.magicMeter.current = Math.min(mm.current || 0, this.player.magicMeter.max);
    }
  }

  /** Replace the current room's enemies with a demo snapshot. */
  _applyDemoEnemies(enemiesSnapshot) {
    if (!Array.isArray(enemiesSnapshot) || enemiesSnapshot.length === 0) return;
    if (!this.currentRoom) return;

    const depth = this.zoneDepths[this.zoneSystem.currentZone] || 1;
    const newEnemies = enemiesSnapshot.map(snap => {
      const e = new Enemy(snap.char, snap.x, snap.y, depth);
      if (snap.hp != null) e.hp = snap.hp;
      e.setCollisionMap(this.currentRoom.collisionMap);
      if (this.player) e.setTarget(this.player);
      return e;
    });

    // Drop previous enemies from physics, then install the snapshot ones.
    for (const old of this.currentRoom.enemies) {
      this.physicsSystem.removeEntity?.(old);
    }
    this.currentRoom.enemies = newEnemies;
    for (const e of newEnemies) {
      this.physicsSystem.addEntity(e);
    }
  }

  enterRestState() {
    // Note: exitPathHistory persists for future secret pattern tracking

    // Cancel any in-progress trap throw
    this.trapSystem.cancelTrapCharge();

    // Reset spell follow-up state on room transition
    this.spellSystem.resetAwaiting();

    // Deactivate boss fight if player exits south mid-fight (edge case)
    this.bossSystem.deactivate();

    // Show the HUD container but slide it down behind the canvas — the
    // status bar isn't needed in REST. enterExploreState slides it back up.
    this.ui.overlay.classList.remove('hidden');
    this.ui.overlay.classList.remove('slide-up');

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
        this.audioSystem.loadGameplaySFX(base);
        // Load boss tracks in background (ready before player reaches depth 14)
        this.audioSystem.loadBossTracks(base);
        // Load red zone tracks in background (ready before player enters red zone)
        this.audioSystem.loadRedTracks(base);
      });
    } else if (this.audioSystem.mode === 'sequence' && this.audioSystem.bossAnticipationActive) {
      // Returned to REST from depth-14 pre-boss room — anticipation mini-loop persists
    } else if (this.audioSystem.mode === 'sequence' && !this.audioSystem.bossAnticipationActive) {
      // Died in boss fight — reset boss music and restore zone music
      this.audioSystem.stopBossMusic(); // mode → 'dual', isPlaying = false
      this.preBossGateActive = false;
      this.currentMusicZone = 'green';
      const base = import.meta.env.BASE_URL;
      this.audioSystem.switchMusic(
        `${base}assets/audio/layer1.mp3`,
        `${base}assets/audio/layer2.mp3`
      ).then(() => this.audioSystem.setLayer2Enabled(false));
    }
    // Note: when entering REST from a non-green zone (cyan, red), the current
    // zone music carries over instead of resetting to green. The death-reset
    // path (hardResetDualLayers, ~line 4908) is the only thing that forces a
    // hard return to green.

    // Reset zone system on rest
    this.zoneSystem.resetOnRest();

    // Capture magic-meter state from prior player before reconstructing.
    // Cleared by the true-game-over reset block, so death wipes it correctly.
    const savedMagicMeter = this.player?.magicMeter
      ? { ...this.player.magicMeter }
      : this._savedMagicMeter ?? null;

    // Create player just below the "E X P L O R E" label (text centre = 4.5 * CELL_SIZE)
    const centerX = GRID.WIDTH / 2;
    const spawnY = GRID.CELL_SIZE * 5.5;
    this.player = new Player(centerX, spawnY);
    this.player.godMode = this.cheatMenu.godMode;
    if (savedMagicMeter) {
      this.player.magicMeter = savedMagicMeter;
      this._savedMagicMeter = savedMagicMeter;
    }

    // Reset fishing system so Rusalka pull/suppression doesn't persist into REST
    this.fishingSystem.resetForNewRoom(this.player);

    // Reset hut/dungeon/maze state on returning to REST
    this.activeFloor = null;
    this.mazeInterior = null;
    this.dungeonFloors = [];
    this.dungeonCurrentFloor = -1;
    this.cureRusalka = null;
    this.playerTongueAttacks = [];

    // Apply active character type
    this.applyCharacterType(this.activeCharacterType);

    // Restore quick slots (not lost on death). Banked ingredients stay in
    // inventorySystem.restInventory (the crafting-table store) and are NOT
    // copied into player.inventory — player.inventory is "unbanked carried"
    // only, so the top-bar "I" count reflects at-risk items.
    this.player.quickSlots = [...this.inventorySystem.restQuickSlots];
    this.player.activeSlotIndex = this.inventorySystem.restActiveSlotIndex;
    this.player.destroyedSlots = [...(this._savedDestroyedSlots ?? [false, false, false])];

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

    this._resetEnvironmentalEffects();
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
          chars: rollStarterSatchelChars()
        };
      }
    }

    // Spawn character NPCs (other unlocked characters standing around)
    this.spawnCharacterNPCs();

    // Carry companions (crows / camp NPC / tamed rats) into REST — they snap
    // to the player and re-register with physics on the rebuild below.
    this.snapAllCompanionsOnRoomEnter();

    // Reset physics
    this.physicsSystem.clear();
    this.physicsSystem.addEntity(this.player);

    // Add REST ingredients to physics system
    for (const ingredient of this.ingredients) {
      this.physicsSystem.addEntity(ingredient);
    }

    this.campNPCSystem?.registerWithPhysics(this.physicsSystem);
    this.registerTamedRatsWithPhysics();

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

  // Basic staves and the fishing pole gain a hold-to-block stance.
  // Excludes gem staves (weaponType: WAND), which keep their charge mechanic.
  _isBlockingStaff(weapon) {
    return !!weapon
      && weapon.data?.weaponType === 'MELEE'
      && weapon.data?.weaponSubtype === 'staff';
  }

  // Exit staff block: push enemies on/adjacent to the player radially outward
  // by ~1 cell, and trigger an 8-direction visual sweep.
  _releaseStaffBlock(player) {
    if (!player.isStaffBlocking) return;
    player.isStaffBlocking = false;

    if (this.currentRoom && this.currentRoom.enemies) {
      const C = GRID.CELL_SIZE;
      const px = player.position.x + C / 2;
      const py = player.position.y + C / 2;
      // "On or adjacent" → up to ~2 cells from center (covers diagonals).
      const radius = C * 2;
      const radiusSq = radius * radius;
      const force = 250; // ~1 cell of knockback at default 0.2s duration

      for (const enemy of this.currentRoom.enemies) {
        if (!enemy || enemy.dead) continue;
        const ex = enemy.position.x + (enemy.width || C) / 2;
        const ey = enemy.position.y + (enemy.height || C) / 2;
        const dx = ex - px;
        const dy = ey - py;
        if (dx * dx + dy * dy > radiusSq) continue;
        this.physicsSystem.applyKnockback(enemy, px, py, force);
      }
    }

    this._spawnStaffBlockSweepVisual(player);
  }

  // 8-direction melee sweep — fires sequentially around the player to telegraph
  // the block release. Damage is per-weapon via data.blockReleaseDamage (default 0).
  _spawnStaffBlockSweepVisual(player) {
    if (!this.combatSystem) return;
    const C = GRID.CELL_SIZE;
    const range = C * 1.25;
    const stepDelay = 0.025;
    const meleeChar = player.heldItem?.data?.meleeChar || '|';
    const color = player.heldItem?.color || '#ffffff';
    const sweepDamage = player.heldItem?.data?.blockReleaseDamage || 0;

    for (let i = 0; i < 8; i++) {
      const angle = (Math.PI * 2 / 8) * i - Math.PI / 2; // start up, go clockwise
      const relX = Math.cos(angle) * range;
      const relY = Math.sin(angle) * range;
      this.combatSystem.addAttack({
        type: 'melee',
        char: meleeChar,
        drawAngle: angle + Math.PI / 2,
        position: { x: player.position.x + relX, y: player.position.y + relY },
        relX, relY,
        width: C,
        height: C,
        damage: sweepDamage,
        duration: 0.08,
        delay: i * stepDelay,
        color,
        owner: player,
        shooterPlane: player.plane
      });
    }
  }

  // Spawn lava background tiles in a 15° forward arc from the player on grid.
  // Called when a weapon flagged with `placesLava` completes its swing.
  _spawnLavaSweep(player, room) {
    if (!room || !room.backgroundObjects) return;
    const C = GRID.CELL_SIZE;
    const baseAngle = Math.atan2(player.facing.y, player.facing.x);
    const sweepHalf = (Math.PI / 12) / 2;  // 15° total → ±7.5°
    const playerCx = player.position.x + C / 2;
    const playerCy = player.position.y + C / 2;

    const samples = [
      { angle: baseAngle - sweepHalf, dist: C * 2 },
      { angle: baseAngle,             dist: C * 2 },
      { angle: baseAngle + sweepHalf, dist: C * 2 },
      { angle: baseAngle,             dist: C * 3 }
    ];

    for (const s of samples) {
      const tx = playerCx + Math.cos(s.angle) * s.dist;
      const ty = playerCy + Math.sin(s.angle) * s.dist;
      const col = Math.floor(tx / C);
      const row = Math.floor(ty / C);
      if (col < 1 || col >= GRID.COLS - 1 || row < 1 || row >= GRID.ROWS - 1) continue;
      if (room.collisionMap?.[row]?.[col]) continue;

      const x = col * C;
      const y = row * C;
      const occupied = room.backgroundObjects.some(obj =>
        !obj.destroyed &&
        Math.abs(obj.position.x - x) < C / 2 &&
        Math.abs(obj.position.y - y) < C / 2
      );
      if (occupied) continue;

      room.backgroundObjects.push(BackgroundObject.createVariant('lava', x, y));
    }
  }

  triggerGreenActionCooldown() {
    this.characterSystem.triggerGreenActionCooldown();
  }

  /**
   * Emit a sound event at the player's current position.
   * Enemies with `setGame(game)` called will hear this within HEARING_RANGE (~7 cells)
   * and use it to trigger detection instead of relying on pure proximity+vision.
   */
  _emitSoundEvent() {
    if (!this.player) return;
    this.soundEvents.push({
      x: this.player.position.x,
      y: this.player.position.y,
      lifetime: 0.5  // Expires after 0.5 s — just long enough for enemies to react
    });
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

  // Drive reload audio for the held weapon:
  // - 'magazine' guns: one short SFX per bullet refilled (queued by Item.update)
  // - 'energy' guns: one long stoppable SFX, started when reload begins, cut when it completes
  _updateReloadAudio(item) {
    if (!item || !this.audioSystem) return;

    // Mechanical magazine ticks
    if (item.consumeReloadTicks) {
      const ticks = item.consumeReloadTicks();
      for (let i = 0; i < ticks; i++) {
        this.audioSystem.playSFX('mag_reload');
      }
    }

    // Energy reload state tracking — only during the reload phase, not the
    // normal post-fire cooldown that precedes it.
    const isEnergyReloading =
      item.data.weaponType === 'GUN' &&
      item.data.reloadType === 'energy' &&
      item._reloading &&
      !!item.data.reloadTime;

    if (isEnergyReloading && this._energyReloadItem !== item) {
      // Stop any prior energy reload (in case of weapon swap mid-charge)
      if (this._energyReloadItem) this.audioSystem.stopSFXByName('energy_charge');
      this.audioSystem.playStoppableSFX('energy_charge');
      this._energyReloadItem = item;
    } else if (!isEnergyReloading && this._energyReloadItem) {
      this.audioSystem.stopSFXByName('energy_charge');
      this._energyReloadItem = null;
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
          // Reject positions inside special structure interiors (hut, maze, dungeon)
          // — their perimeter walls are solid but their interiors are open in collisionMap
          const structureBounds = [
            this.currentRoom.hut?.exteriorBounds,
            this.currentRoom.maze?.exteriorBounds,
            this.currentRoom.dungeon?.exteriorBounds,
          ].filter(Boolean);
          const insideStructure = structureBounds.some(b =>
            gridX >= b.minCol && gridX <= b.maxCol &&
            gridY >= b.minRow && gridY <= b.maxRow
          );
          if (insideStructure) { attempts++; continue; }

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
    this._resetEnvironmentalEffects();
    this.neutralCharacters = [];

    // Reset fishing system for new room
    this.fishingSystem.resetForNewRoom(this.player);

    // Reset hut/dungeon/maze state on room transition
    this.activeFloor = null;
    this.mazeInterior = null;
    this.dungeonFloors = [];
    this.dungeonCurrentFloor = -1;
    this.cureRusalka = null;
    this.playerTongueAttacks = [];
    if (this.player) {
      this.player.inHut = false;
      this.player.hutExitPosition = null;
      this.player.inMaze = false;
      this.player.mazeExitPosition = null;
      this.player.inDungeon = false;
      this.player.dungeonExitPosition = null;
    }

    // Carry companions into the neutral room — snap to player, then re-register
    // with physics on the rebuild below.
    this.snapAllCompanionsOnRoomEnter();

    // Initialize physics system
    this.physicsSystem.clear();
    this.physicsSystem.addEntity(this.player);
    for (const item of this.items) {
      this.physicsSystem.addEntity(item);
    }

    this.campNPCSystem?.registerWithPhysics(this.physicsSystem);
    this.registerTamedRatsWithPhysics();

    // Update collision map
    this.updateExitCollisions();

    // Transition to NEUTRAL state
    this.stateMachine.transition(GAME_STATES.NEUTRAL);
  }

  /**
   * Animate the player through an exit, then perform the warp, then animate
   * them inward from the opposite edge of the new room.
   *
   * @param {string}   direction  'north' | 'south' | 'east' | 'west' — the
   *                              edge the player is leaving through
   * @param {Function} warpFn     callback that performs the actual state /
   *                              room transition (e.g. enterExploreState or
   *                              stateMachine.transition). May replace
   *                              this.player; we retarget the animation.
   */
  animateExitWarp(direction, warpFn) {
    if (this.animationSystem.isAnimating(this.player)) return;

    const C = GRID.CELL_SIZE;
    const cx = (GRID.COLS / 2) * C;
    const cy = (GRID.ROWS / 2) * C;
    const W = GRID.COLS * C;
    const H = GRID.ROWS * C;

    // Edge anchors stay one cell inside the bounds so physics' grid clamp
    // doesn't fight the animation when the player snaps to the entry edge.
    // postTo sits ~5 cells from the entry edge so the inbound walk reads
    // clearly as "entering the room" before control returns.
    const inset = 4;
    const px = this.player.position.x;
    const py = this.player.position.y;
    let alignTo, preTo, postFrom, postTo;
    switch (direction) {
      case 'north':
        alignTo  = { x: cx, y: py };
        preTo    = { x: cx, y: 0 };
        postFrom = { x: cx, y: H - C };
        postTo   = { x: cx, y: (GRID.ROWS - 1 - inset) * C };
        break;
      case 'south':
        alignTo  = { x: cx, y: py };
        preTo    = { x: cx, y: H - C };
        postFrom = { x: cx, y: 0 };
        postTo   = { x: cx, y: inset * C };
        break;
      case 'east':
        alignTo  = { x: px, y: cy };
        preTo    = { x: W - C, y: cy };
        postFrom = { x: 0,     y: cy };
        postTo   = { x: inset * C, y: cy };
        break;
      case 'west':
        alignTo  = { x: px, y: cy };
        preTo    = { x: 0,     y: cy };
        postFrom = { x: W - C, y: cy };
        postTo   = { x: (GRID.COLS - 1 - inset) * C, y: cy };
        break;
      default:
        warpFn();
        return;
    }

    // Scale alignment duration to the perpendicular distance so a centered
    // approach doesn't sit through a fixed pause when there's nothing to move.
    const alignDist = Math.hypot(alignTo.x - px, alignTo.y - py);
    const alignDuration = Math.min(0.5, (alignDist / C) * 0.08);

    const oldPlayer = this.player;
    this.animationSystem.play(this.player, [
      // 1) Align with the exit gap on the perpendicular axis.
      { type: 'moveTo', x: alignTo.x, y: alignTo.y, duration: alignDuration, easing: 'easeOut' },
      // 2) Quick step into the gap.
      { type: 'moveTo', x: preTo.x, y: preTo.y, duration: 0.2, easing: 'linear' },
      { type: 'callback', fn: () => {
          warpFn();
          // enterExploreState / state transitions may rebuild this.player
          if (this.player !== oldPlayer) {
            this.animationSystem.retarget(oldPlayer, this.player);
          }
          // Re-anchor at the entry edge so the post-tween reads from there,
          // and sync prev-pos so the inbound path isn't re-detected as an exit.
          this.player.position.x = postFrom.x;
          this.player.position.y = postFrom.y;
          this.previousPlayerPosition.x = postFrom.x;
          this.previousPlayerPosition.y = postFrom.y;
      }},
      { type: 'moveTo', x: postTo.x, y: postTo.y, duration: 1.10, easing: 'easeOut',
        interruptible: true,
        interruptAfter: 0.5,
        canInterrupt: () => (
          this.keys.w || this.keys.a || this.keys.s || this.keys.d ||
          this.keys.space ||
          this.arrowKeys.ArrowUp || this.arrowKeys.ArrowDown ||
          this.arrowKeys.ArrowLeft || this.arrowKeys.ArrowRight
        ) },
      // Resolve any wall / solid-object overlap the inbound walk landed on.
      { type: 'callback', fn: () => {
          if (!this.player || !this.currentRoom) return;
          this.physicsSystem.resolveCollisionMapOverlap(this.player, this.currentRoom);
          const bgObjects = this._activeBackgroundObjects
            ? this._activeBackgroundObjects()
            : (this.currentRoom.backgroundObjects ?? []);
          this.physicsSystem.resolveSolidObjectOverlap(this.player, bgObjects);
          this.previousPlayerPosition.x = this.player.position.x;
          this.previousPlayerPosition.y = this.player.position.y;
      }},
    ]);
  }

  enterExploreState(entryDirection = null, exitObj = null, secretPattern = null) {
    // Reset spell follow-up state on room transition
    this.spellSystem.resetAwaiting();

    // Slide the HUD up from behind the canvas. Idempotent across room
    // transitions within EXPLORE (no class change → no animation re-trigger).
    this.ui.overlay.classList.remove('hidden');
    this.ui.overlay.classList.add('slide-up');

    // Mark that the player has left REST at least once — gates the rest-bundle pickup hint arrow.
    // Skip in attract-mode: enterDemoState bootstraps through here, but the real player hasn't left yet.
    if (this.stateMachine.getCurrentState() !== GAME_STATES.ARCADE_DEMO) {
      this.hasLeftRestOnce = true;
    }

    // Reset robe aura roll-pulse so it fires once in the new room
    if (this.player) this.player._auraRollPulseUsed = false;

    // Reset Acid Blade charges (3 per room: each swing that hits water or an
    // enemy depletes 1; at 0, swings still land but apply no poison and don't
    // convert water tiles)
    if (this.player) this.player._acidBladeChargesThisRoom = 3;

    // Room-transition mana grant. Once the meter is active (well or cauldron),
    // every room transition adds +2 mana, with a +2 robe bonus (so robes give
    // +4 per room rather than the previous full refill).
    if (this.player?.magicMeter?.active) {
      const isRobe = this.inventorySystem.equippedArmor?.data?.armorClass === 'robe';
      const grant = isRobe ? 4 : 2;
      this.magicSystem.addMana(this.player, grant);
    }

    // Zone depths only reset on death, not when entering from REST
    // Check if continuing in current zone (depth > 0) or starting fresh in this zone (depth === 0)
    const isContinuing = this.getCurrentZoneDepth() > 0;

    // Determine depth update strategy
    // When entryDirection is null, we're coming from REST (via state transition)
    // When entryDirection is set, we're moving between EXPLORE rooms (direct call, not state transition)
    const leavingRest = entryDirection === null; // null = coming from REST, otherwise coming from another EXPLORE room
    const roomTransition = entryDirection !== null; // Has direction = moving between rooms

    // Dismiss tombstone when the player leaves for explore
    if (leavingRest) {
      this.tombstoneActive = false;
      this.menuSystem.closeTombstonePopup();
    }

    // Check if we should restore saved explore room (returning from REST to same room)
    const shouldRestoreExploreRoom = leavingRest && this.inventorySystem.getSavedExploreRoom() !== null;


    // Save player state from previous room
    // Inventory: Always carry ingredients forward (REST or EXPLORE rooms)
    // Quick slots: ALWAYS persist (both from REST and between rooms)
    const savedInventory = this.player ? [...this.player.inventory] : [];
    const savedQuickSlots = this.player ? [...this.player.quickSlots] : [null, null, null]; // Always save quick slots
    const savedActiveSlotIndex = this.player ? this.player.activeSlotIndex : 0; // Always save active slot
    const savedHp = this.player ? this.player.hp : null; // Always save HP
    const savedDestroyedSlots = this.player ? [...this.player.destroyedSlots] : [...this._savedDestroyedSlots];
    // Polymorph state persists across rooms
    const savedPolymorph = this.player
      ? {
          active:  this.player.polymorphed,
          cursed:  this.player.polymorphCursed,
          cured:   this.player.polymorphCured,   // persists even when not currently morphed
        }
      : null;
    // Magic meter persists across rooms (resets only on death)
    const savedMagicMeter = this.player?.magicMeter
      ? { ...this.player.magicMeter }
      : null;

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
        // Deactivate any active boss fight when leaving a room
        this.bossSystem.deactivate();
      }
      // Blue-zone (Tidefall) entry/progression. Any exit tagged secretBlueZone
      // routes into the linear 4-room tutorial sequence. Room counter tracks
      // which room (1=Shallows, 2=Reef Walk, 3=Wake Drift, 4=Pearl Cache).
      if (exitObj?.secretBlueZone) {
        this.zoneSystem.forceNextZone('blue');
        this.blueZoneRoom = (this.blueZoneRoom || 0) + 1;
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
        console.log('[Secret] B-A-T pattern detected → Bat Belfry!');
      } else if (exitObj && exitObj.letter) {
        const letterData = EXIT_LETTERS[exitObj.letter];
        if (letterData && letterData.roomType) {
          roomType = ROOM_TYPES[letterData.roomType];
        }
      }

      // Zone boss injection: override room type when depth threshold is reached
      const zoneBossTriggered = roomTransition &&
        this.zoneSystem.isBossReady(currentZone, this.zoneDepths[currentZone]);
      if (zoneBossTriggered) {
        roomType = ROOM_TYPES.BOSS;
        this.roomGenerator.isZoneBossRoom = true;
        console.log(`[Boss] Zone boss triggered for ${currentZone} at depth ${this.zoneDepths[currentZone]}`);
        // Transition boss music: anticipation mini-loop → full 5-track sequence
        // If anticipation is running, bossSequencePending queues the switch at next track boundary.
        // If entering boss room directly (cheat menu), starts immediately.
        this.audioSystem.scheduleBossSequence();
      }

      // Clear pre-boss gate on any room transition
      this.preBossGateActive = false;

      this.roomGenerator.setDepth(this.getCurrentZoneDepth());
      this.currentRoom = this.roomGenerator.generateRoom(roomType, { x: startX, y: startY }, currentZone, progressionColor, exitObj?.letter);
      this.roomGenerator.isZoneBossRoom = false; // always reset after generation
      this.currentRoom.exitLetter = exitObj?.letter || null;

      // Blue-zone linear progression: north exit always points at the next
      // tutorial room (or stays disabled in Pearl Cache, where RoomGenerator
      // killed it). Tagging secretBlueZone keeps the chain going on next walk.
      if (currentZone === 'blue' && this.currentRoom.exits.north) {
        const BLUE_ROOM_LETTERS = ['⌇', '⌒', '◌'];
        const nextLetter = BLUE_ROOM_LETTERS[(this.blueZoneRoom || 1) - 1];
        if (nextLetter) {
          this.currentRoom.exits.north = {
            letter: nextLetter,
            color: '#66aaff',
            secretBlueZone: true
          };
        }
      }

      // Activate boss system for zone boss rooms
      if (this.currentRoom.isZoneBossRoom) {
        this.bossSystem.activate(this.currentRoom, currentZone);
      }

      // If the room declares its own spawn zones, use them (overrides direction-based defaults).
      // This ensures warps and future entry systems always land in valid positions.
      if (this.currentRoom.spawnZones) {
        const zone = this.currentRoom.spawnZones[entryDirection] ?? this.currentRoom.spawnZones.default;
        if (zone) { startX = zone.x; startY = zone.y; }
      }

      // Reset trap charges for new room
      if (this.player) {
        this.player.resetTrapsForNewRoom();
      }

      // Reset charge-hammer once-per-room usage for new room
      if (this.player) {
        for (const slot of this.player.quickSlots) {
          if (slot?.data?.chargeHammer) {
            slot.chargeAttackUsed = false;
            slot.isCharging = false;
            slot.chargeTime = 0;
          }
        }
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

      // Pass game reference to all enemies (needed for sound detection)
      for (const enemy of this.currentRoom.enemies) {
        enemy.setGame(this);
        enemy.setRoom(this.currentRoom);
      }

      // Clear sound events from any previous room
      this.soundEvents = [];

      // Unlock exits immediately if room has no enemies (CAMP, DISCOVERY, etc.)
      // Hidden mimics don't count — exits stay open until they reveal.
      if (this._countedEnemies(this.currentRoom.enemies).length === 0) {
        this.currentRoom.exitsLocked = false;
      }
      // Witch-curse polymorph: exits always open until cured
      if (this.player?.polymorphCursed) {
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
    this.player.godMode = this.cheatMenu.godMode;
    this.player.setCollisionMap(this.currentRoom.collisionMap);

    // Room transition: dispatch every companion through its own onRoomEnter
    // so each type (crow / camp NPC / tamed rat) handles its own snap+reset
    // without redundant logic at the call site.
    this.snapAllCompanionsOnRoomEnter();

    // Reset fishing system for new room (cleans up Rusalka, bobber, fish, etc.)
    this.fishingSystem.resetForNewRoom(this.player);

    // Reset hut/dungeon/maze state for new room
    this.activeFloor = null;
    this.mazeInterior = null;
    this.dungeonFloors = [];
    this.dungeonCurrentFloor = -1;
    this.cureRusalka = null;
    this.playerTongueAttacks = [];
    this.player.inHut = false;
    this.player.hutExitPosition = null;
    this.player.inMaze = false;
    this.player.mazeExitPosition = null;
    this.player.inDungeon = false;
    this.player.dungeonExitPosition = null;

    // Apply active character type
    this.applyCharacterType(this.activeCharacterType);

    // Restore polymorph across room transition (applyCharacterType ran first so
    // savedState will capture the correct base char/color for this character)
    if (savedPolymorph) {
      if (savedPolymorph.active) {
        this.polymorphSystem.activatePolymorph(this, savedPolymorph.cursed);
      }
      // Always restore cured flag — this is what unlocks the F key toggle
      if (savedPolymorph.cured) this.player.polymorphCured = true;
    }

    // Save room entry position for Rope consumable
    this.roomEntryX = startX;
    this.roomEntryY = startY;

    // Restore player state
    this.player.inventory = savedInventory;
    this.player.quickSlots = savedQuickSlots;
    this.player.activeSlotIndex = savedActiveSlotIndex;
    this.player.destroyedSlots = savedDestroyedSlots;
    if (savedHp !== null) {
      this.player.hp = savedHp;
    }
    if (savedMagicMeter) {
      this.player.magicMeter = savedMagicMeter;
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
      this._resetEnvironmentalEffects();
      this.captives = []; // Clear captives when entering new room
      this.neutralCharacters = []; // Clear neutral characters when entering new room
      this.bridgeMenuOpen = false; // Close bridge menu on room transition

      // Ridge room: attach ridge system and push bridge worker if not yet built
      if (this.currentRoom.type === ROOM_TYPES.RIDGE) {
        this.ridgeSystem.attachToRoom(this.currentRoom);
        if (this.currentRoom.bridgeWorker && !this.currentRoom.bridgeBuilt) {
          this.neutralCharacters.push(this.currentRoom.bridgeWorker);
        }
      }

      // Pearl-guide fairy (O room + pearl in inventory): pre-spawned at room
      // generation. Pushed here so it lives in neutralCharacters alongside the
      // fight, and reveals the pedestal on room clear if still uncollected.
      // Suppressed once the fountain has been corrupted — the run's fairies
      // have all gone hostile.
      if (this.currentRoom.pearlFairy && !this.currentRoom.pearlFairy.consumed && !this.fairiesAngered) {
        this.neutralCharacters.push(this.currentRoom.pearlFairy);
      }

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
      this._resetEnvironmentalEffects();
      this.neutralCharacters = [];
    }

    // Set enemy targets
    for (const enemy of this.currentRoom.enemies) {
      enemy.setTarget(this.player);
    }

    // Follower flock is room-scoped: bystander crows that joined the feed
    // event don't trail the player across rooms (companions still do).
    // Auto-join reputation effect still applies per-room if fedCrowCount ≥ 3.
    if (!shouldRestoreExploreRoom) {
      this.followerCrows = [];
      this.autoJoinWildCrows();
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

    this.campNPCSystem?.registerWithPhysics(this.physicsSystem);
    this.registerTamedRatsWithPhysics();

    // Reset combat
    this.combatSystem.clear();

    // Leshy chase rooms will get shaking bush AFTER clearing (same as first encounter)

    // Mark background dirty
    this.renderer.markBackgroundDirty();

    // Switch music based on zone (covers all entry paths: new room, restore, and leavingRest)
    // Skip when boss sequence mode is active (anticipation or full fight)
    if (this.audioSystem.mode === 'dual' || this.audioSystem.mode === 'red') {
      const roomZone = this.currentRoom?.zone || 'green';
      const base = import.meta.env.BASE_URL;
      if (roomZone === 'red' && this.currentMusicZone !== 'red') {
        if (this.audioSystem.switchToRedSequence()) {
          this.currentMusicZone = 'red';
        }
      } else if (roomZone === 'cyan' && this.currentMusicZone !== 'cyan') {
        this.currentMusicZone = 'cyan';
        this.audioSystem.switchMusic(
          `${base}assets/audio/cyan-layer1.mp3`,
          `${base}assets/audio/cyan-layer2.mp3`
        );
      } else if (roomZone !== 'cyan' && roomZone !== 'red'
                 && (this.currentMusicZone === 'cyan' || this.currentMusicZone === 'red')) {
        this.currentMusicZone = 'green';
        this.audioSystem.switchMusic(
          `${base}assets/audio/layer1.mp3`,
          `${base}assets/audio/layer2.mp3`
        );
      }
    }

    // Set layer 2 (bassline) based on enemy presence
    // Always check for enemies, regardless of how we entered EXPLORE
    const hasEnemies = this.currentRoom && this.currentRoom.enemies && this.currentRoom.enemies.length > 0;
    this.audioSystem.setLayer2Enabled(hasEnemies);

    // Open physical wall gaps for all exits so escape-route south exit (no weapons)
    // is passable from the moment the player enters — not gated on enemy-clear.
    this.updateExitCollisions();

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
      if (ingredient.dropBounceTimer > 0) {
        ingredient.dropBounceTimer = Math.max(0, ingredient.dropBounceTimer - deltaTime);
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
        // Emerald Robe: goo consumed for 1HP heal instead of going to inventory
        if (ingredient.char === 'g' && this.player.gooConsume) {
          this.player.hp = Math.min(this.player.hp + 1, this.player.maxHp);
        } else if (ingredient.char === '𝑚' && this.player.magicMeter?.active) {
          // Mana drop auto-refills the meter once the well/cauldron has
          // activated it; bypass inventory entirely.
          this.magicSystem.addMana(this.player, 2);
        } else {
          this.addIngredient(ingredient.char);
        }
        this.audioSystem?.playSFX('ingredient_pickup');
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

    // Companion crow perches/follows in NEUTRAL too.
    this.updateCompanionCrow(deltaTime);
    this.updateFollowerCrows(deltaTime);

    // Check for south exit (return to EXPLORE)
    const gridPos = this.player.getGridPosition();
    const prevGridPos = {
      x: Math.floor(this.previousPlayerPosition.x / GRID.CELL_SIZE),
      y: Math.floor(this.previousPlayerPosition.y / GRID.CELL_SIZE)
    };
    const centerX = Math.floor(GRID.COLS / 2);

    const inSouthExit = gridPos.y >= GRID.ROWS - 2 && Math.abs(gridPos.x - centerX) <= 1;
    const crossedSouthExit = prevGridPos.y < GRID.ROWS - 2 && gridPos.y >= GRID.ROWS - 2 && Math.abs(gridPos.x - centerX) <= 1;

    if (!this.animationSystem.isAnimating(this.player) &&
        (inSouthExit || crossedSouthExit) && this.currentRoom.exits.south) {

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
        // Spawn at the center of the explore room rather than the saved
        // edge-of-room position (which would re-trigger the south transition).
        this.player.position.x = Math.floor(GRID.COLS / 2) * GRID.CELL_SIZE;
        this.player.position.y = Math.floor(GRID.ROWS / 2) * GRID.CELL_SIZE;

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
    this.cleanseWave = null;
    this.bossDefeatFlash = null;

    // Reset spell follow-up state
    this.spellSystem.resetAwaiting();

    // Deactivate boss fight if one was in progress
    this.bossSystem.deactivate();

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

  // Returns the room the player is currently interacting with — interior takes priority over surface.
  // Maze returns its own interior; hut/dungeon return activeFloor; otherwise the surface currentRoom.
  // Call sites should prefer this over open-coding the three-way ternary.
  get activeRoom() {
    if (this.player?.inMaze && this.mazeInterior) return this.mazeInterior;
    if ((this.player?.inHut || this.player?.inDungeon) && this.activeFloor) return this.activeFloor;
    return this.currentRoom;
  }

  // Returns the background objects for whichever layer the player is currently in.
  // Maze interiors have no background objects; hut/dungeon use activeFloor's array;
  // otherwise use the exterior currentRoom array.
  _activeBackgroundObjects() {
    if (this.player.inMaze && this.mazeInterior) return [];
    if ((this.player.inHut || this.player.inDungeon) && this.activeFloor) return this.activeFloor.backgroundObjects;
    return this.currentRoom ? this.currentRoom.backgroundObjects : [];
  }

  // Returns the enemies for whichever layer the player is currently in.
  _activeEnemies() {
    if (this.player.inMaze && this.mazeInterior) return [];
    if ((this.player.inHut || this.player.inDungeon) && this.activeFloor) return this.activeFloor.enemies;
    return this.currentRoom ? this.currentRoom.enemies : [];
  }

  // Enemies that count toward "room cleared". Hidden mimics are excluded
  // so they don't block exits — the player can't reasonably find them
  // until they reveal themselves on approach.
  _isHiddenEnemy(e) {
    if (e.data?.mimicMechanic?.enabled && !e.mimicRevealed) return true;
    if (e.data?.shellCamouflage && e.inShellForm && !e.hasBeenActivated) return true;
    return false;
  }
  _countedEnemies(enemies) {
    return enemies.filter(e => !this._isHiddenEnemy(e) && !e.isDying);
  }

  // Clear all environmental / transient world-effect arrays (room transitions, deaths, cleanse, etc.).
  // Centralized so adding a new effect array doesn't require touching every reset site.
  _resetEnvironmentalEffects() {
    this.gooBlobs = [];
    this.puddles = [];
    this.enemyShockwaves = [];
    this.debris = [];
    this.particles = [];
    this.steamClouds = [];
  }

  // Stamp a trail tile of `type` at (x, y). Overlapping nearby same-type tiles
  // bump their overlap counter and grow to maxR — moving entities leave a
  // thinning trail, lingering ones accumulate a thicker pool. Lifetime governs
  // decay: 7s for slime, Infinity for lava/ice (cleared on room exit).
  _dropTrailTile(x, y, type, plane = 0, lifetime = 7.0) {
    if (!this.puddles) return;
    const baseR = GRID.CELL_SIZE / 8;          // Quarter-cell side at spawn (thin trail)
    const maxR = GRID.CELL_SIZE / 4;           // Half-cell side at max growth (thick pool)

    // Count visual overlaps with existing same-type tiles on this plane, and
    // bump each touched tile's overlap counter. A tile rendered at half-width
    // snaps to full once its overlap count reaches 2 — so the middle of any
    // continuous trail thickens while the endpoints stay thin.
    let newCount = 0;
    for (const p of this.puddles) {
      if (p.type !== type) continue;
      if ((p.plane ?? 0) !== plane) continue;
      const dx = p.position.x - x;
      const dy = p.position.y - y;
      if (Math.abs(dx) < p.radius + maxR && Math.abs(dy) < p.radius + maxR) {
        p.overlapCount = (p.overlapCount ?? 0) + 1;
        if (p.overlapCount >= 2) p.radius = maxR;
        p.age = 0;
        newCount++;
      }
    }

    const newPuddle = new Puddle(x, y, newCount >= 2 ? maxR : baseR, type, plane, {
      shape: 'square', opaque: true, lifetime
    });
    newPuddle.overlapCount = newCount;
    // Tag with the active interior so the render path filters surface vs interior puddles.
    newPuddle.hutPlane = !!this.activeFloor;
    this.puddles.push(newPuddle);
  }

  _dropSlimeTrail(x, y, plane) {
    this._dropTrailTile(x, y, 'slimeTrail', plane ?? 0, 7.0);
  }

  // Stamp a disk of trail tiles for an enemy's persistent fire/ice trail.
  // Tiles persist until the room is cleared (cleared by _resetEnvironmentalEffects).
  // `radius` controls the disk coverage of each drop event.
  _spawnEnemyTrailPuddle(x, y, type, radius, plane) {
    if (!this.puddles) return;
    const p = plane ?? 0;
    this._dropTrailTile(x, y, type, p, Infinity);
    const RING_TILES = 6;
    const RING_RADIUS = radius * 0.6;
    for (let i = 0; i < RING_TILES; i++) {
      const a = (i / RING_TILES) * Math.PI * 2;
      this._dropTrailTile(x + Math.cos(a) * RING_RADIUS, y + Math.sin(a) * RING_RADIUS, type, p, Infinity);
    }
  }

  // Apply Shaman buff to nearby allied enemies
  _applyShamanBuff(buffData, allEnemies) {
    const { position, radius, buffs, speedMultiplier, damageMultiplier, buffDuration, caster } = buffData;
    const buff = buffs[Math.floor(Math.random() * buffs.length)];

    for (const enemy of allEnemies) {
      if (enemy === caster) continue;
      const dx = enemy.position.x - position.x;
      const dy = enemy.position.y - position.y;
      if (Math.sqrt(dx * dx + dy * dy) > radius) continue;

      if (buff === 'speed') {
        enemy._shamBuff = { type: 'speed', multiplier: speedMultiplier, timer: buffDuration, baseSpeed: enemy.speed };
        enemy.speed = enemy.data.speed * speedMultiplier;
      } else if (buff === 'damage') {
        enemy._shamBuff = { type: 'damage', multiplier: damageMultiplier, timer: buffDuration, baseDamage: enemy.damage };
        enemy.damage = Math.ceil(enemy.data.damage * damageMultiplier);
      }
    }
  }

  update(deltaTime) {
    const state = this.stateMachine.getCurrentState();

    // DemoSystem shares a frame counter with both playback and recording.
    this.demoSystem.tickGlobalFrame();

    // Particle Fireworks (debug): cycle through every effect at ~2.5 bursts/sec
    // at random screen positions. Skips TITLE (no canvas particle pipe there).
    if (this.particleFireworks && state !== GAME_STATES.TITLE) {
      this._fwTimer += deltaTime;
      if (this._fwTimer >= 0.4) {
        this._fwTimer = 0;
        this._fwIndex = (this._fwIndex + 1) % FIREWORK_FACTORIES.length;
        const W = GRID.COLS * GRID.CELL_SIZE;
        const H = GRID.ROWS * GRID.CELL_SIZE;
        const x = 48 + Math.random() * (W - 96);
        const y = 48 + Math.random() * (H - 96);
        const result = FIREWORK_FACTORIES[this._fwIndex].fn(x, y);
        if (Array.isArray(result)) this.particles.push(...result);
        else if (result) this.particles.push(result);
      }
    }

    // Advance any in-flight animations before per-state logic so the new
    // target position is visible to physics, exit detection, and rendering.
    if (state !== GAME_STATES.TITLE) {
      this.animationSystem.update(deltaTime);
    }

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
    } else if (state === GAME_STATES.ARCADE_DEMO) {
      this.updateDemoState(deltaTime);
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

    // Pre-intro idle → arcade attract demo plays behind the title overlay.
    if (!this.introAnimationStarted) {
      this.titleIdleTimer += deltaTime;
      if (this.titleIdleTimer >= this.TITLE_IDLE_THRESHOLD) {
        this.titleIdleTimer = 0;
        this.stateMachine.transition(GAME_STATES.ARCADE_DEMO);
      }
    }
  }

  updateDemoState(deltaTime) {
    // Apply this frame's recorded events to game.keys/arrowKeys/handlers.
    const stillPlaying = this.demoSystem.tickPlayback();

    // Drive the actual explore loop — same systems, same rendering.
    this.updateExploreState(deltaTime);

    if (!stillPlaying) {
      this.stateMachine.transition(GAME_STATES.TITLE);
    }
  }

  // True iff any entity in the current room would eat a dropped loaf.
  // Iterates breadTargetSelectors so new bread-eaters drop in by appending.
  hasBreadEligibleTarget() {
    for (const sel of this.breadTargetSelectors) {
      const list = sel(this);
      if (list && list.length > 0) return true;
    }
    return false;
  }

  // Spawn a Bread Item entity at the player's feet — SPACE path. Wild rats
  // are steered toward it by updateBreadSeekingRats (which scans every frame
  // so SHIFT-thrown loaves are handled the same way without a parallel hook).
  dropBreadAtPlayer() {
    if (!this.player) return;
    const loaf = new Item('⌬', this.player.position.x, this.player.position.y);
    loaf.pickupReadyAt = performance.now() + 1500;
    this.items.push(loaf);
    this.physicsSystem.addEntity(loaf);
  }

  // Wild rats seeking bread: assign unowned loaves → nearest wild rat each
  // frame (so both SPACE-drop and SHIFT-throw work without a separate hook),
  // then check proximity, consume the loaf, remove the wild Enemy, and spawn
  // a fresh NPCRat in its place. Replacing rather than re-skinning keeps the
  // hostile Enemy AI cleanly out of the companion's behavior tree.
  updateBreadSeekingRats() {
    const enemies = this.currentRoom?.enemies;
    if (!enemies || enemies.length === 0) return;

    // Assign loaves to wild rats. A loaf is "owned" once any wild rat is
    // seeking it; other rats stick to their default AI until more bread drops.
    // Hut/maze interiors seed bread into game.items tagged with hutPlane /
    // mazePlane — those positions are in interior grid space (top-left ≈ the
    // outer-room origin) and must be excluded, or surface rats path to the
    // wrong coordinates and "eat" a loaf the player never dropped.
    const loaves = this.items.filter(it =>
      it && it.char === '⌬' && !it.consumed && !it.hutPlane && !it.mazePlane
    );
    if (loaves.length > 0) {
      const claimedLoaves = new Set();
      const claimedRats = new Set();
      for (const e of enemies) {
        if (!e.seekingBread) continue;
        const t = e.breadTarget;
        // Release the rat if its target vanished or is an interior-tagged loaf
        // (covers any stale assignment from before the surface-only filter
        // landed) — otherwise it'd march to the top-left forever.
        if (!t || t.consumed || t.hutPlane || t.mazePlane) {
          e.seekingBread = false;
          e.breadTarget = null;
          continue;
        }
        claimedLoaves.add(t);
        claimedRats.add(e);
      }
      for (const loaf of loaves) {
        if (claimedLoaves.has(loaf)) continue;
        let nearest = null;
        let nearestDistSq = Infinity;
        for (const r of enemies) {
          if (r.char !== 'r') continue;
          if (r.hp <= 0) continue;
          if (claimedRats.has(r)) continue;
          const dx = r.position.x - loaf.position.x;
          const dy = r.position.y - loaf.position.y;
          const d = dx * dx + dy * dy;
          if (d < nearestDistSq) { nearestDistSq = d; nearest = r; }
        }
        if (nearest) {
          nearest.seekingBread = true;
          nearest.breadTarget = loaf;
          nearest.breadSeekStartTime = performance.now();
          claimedRats.add(nearest);
          claimedLoaves.add(loaf);
        }
      }
    }

    // Tight overlap required — at 0.7 cells the white-flip fired while the rat
    // was still visibly approaching. 0.35 puts the centers inside each other's
    // sprite so the eat reads as physical contact.
    const EAT_DIST_SQ = (GRID.CELL_SIZE * 0.35) ** 2;
    // Minimum time between seeking-bread assignment and eat — guarantees a
    // visible "walk to the bread" beat even if the rat was already adjacent.
    const EAT_GRACE_MS = 350;
    const now = performance.now();
    for (let i = enemies.length - 1; i >= 0; i--) {
      const rat = enemies[i];
      if (!rat.seekingBread || !rat.breadTarget) continue;
      const loaf = rat.breadTarget;
      if (loaf.consumed || loaf.destroyed) {
        rat.seekingBread = false;
        rat.breadTarget = null;
        continue;
      }
      if (now - (rat.breadSeekStartTime || 0) < EAT_GRACE_MS) continue;
      const dx = loaf.position.x - rat.position.x;
      const dy = loaf.position.y - rat.position.y;
      if (dx * dx + dy * dy > EAT_DIST_SQ) continue;

      // Eat the loaf
      loaf.consumed = true;
      const lIdx = this.items.indexOf(loaf);
      if (lIdx !== -1) {
        this.physicsSystem.removeEntity(loaf);
        this.items.splice(lIdx, 1);
      }

      // Yank the wild Enemy out of every room.enemies-style cache and physics.
      enemies.splice(i, 1);
      const p0 = this.currentRoom?.enemiesPlane0;
      if (p0) {
        const idx = p0.indexOf(rat);
        if (idx !== -1) p0.splice(idx, 1);
      }
      const p1 = this.currentRoom?.enemiesPlane1;
      if (p1) {
        const idx = p1.indexOf(rat);
        if (idx !== -1) p1.splice(idx, 1);
      }
      this.physicsSystem.removeEntity(rat);

      // Spawn the companion at the wild rat's exact position so the visual
      // hand-off reads as the rat eating the bread and turning friendly.
      const npc = new NPCRat(rat.position.x, rat.position.y);
      npc.plane = rat.plane ?? 0;
      npc.setGame(this);
      npc.setRoom(this.currentRoom);
      npc.collisionMap = this.currentRoom?.collisionMap || null;
      npc.backgroundObjects = this.currentRoom?.backgroundObjects || null;
      this.tamedRats.push(npc);
      this.physicsSystem.addEntity(npc);

      // Promotion burst — small white sparkle so the moment reads visually.
      const ex = npc.position.x + GRID.CELL_SIZE / 2;
      const ey = npc.position.y + GRID.CELL_SIZE / 2;
      for (let k = 0; k < 10; k++) {
        const angle = (k / 10) * Math.PI * 2 + Math.random() * 0.3;
        const speed = 30 + Math.random() * 30;
        this.particles.push({
          x: ex, y: ey,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 15,
          life: 0.5, maxLife: 0.5,
          char: '·', color: '#ffffff'
        });
      }
      this.particles.push({
        x: ex, y: ey - 4, vx: 0, vy: -22,
        life: 0.9, maxLife: 0.9, char: '♥', color: '#ff5577'
      });
    }
  }

  // Per-frame NPCRat driver: run each rat's own update with the live enemies
  // list, surface damage numbers on hits, and despawn perma-fleeing rats that
  // have reached an exit.
  updateTamedRats(deltaTime) {
    if (!this.tamedRats || this.tamedRats.length === 0) return;
    const enemies = this.currentRoom?.enemies || [];
    const siblings = this.tamedRats;
    for (let i = this.tamedRats.length - 1; i >= 0; i--) {
      const rat = this.tamedRats[i];
      if (rat.state === 'permaFlee' && rat.fleeReached) {
        this.physicsSystem.removeEntity(rat);
        this.tamedRats.splice(i, 1);
        continue;
      }
      const result = rat.update(deltaTime, enemies, this.player, siblings);
      if (result?.attacked) {
        const victim = result.attacked;
        this.combatSystem.createDamageNumber?.(result.damage ?? 1,
                                               victim.position.x, victim.position.y,
                                               victim.color || '#ffffff');
      }
    }
  }

  // Apply enemy melee + projectile hits to tamed rats. Mirrors
  // CampNPCSystem._applyEnemyDamage but operates over the multi-instance array.
  applyEnemyDamageToTamedRats() {
    if (!this.tamedRats || this.tamedRats.length === 0) return;
    const cs = this.combatSystem;
    if (!cs) return;

    const projs = cs.enemyProjectiles || [];
    for (const rat of this.tamedRats) {
      if (rat.state === 'permaFlee') continue;
      if (rat.invulnerabilityTimer > 0) continue;
      // Projectiles
      for (let i = projs.length - 1; i >= 0; i--) {
        const p = projs[i];
        if ((p.plane ?? 0) !== rat.plane) continue;
        const cx = rat.position.x + rat.width / 2;
        const cy = rat.position.y + rat.height / 2;
        const dx = p.position.x - cx;
        const dy = p.position.y - cy;
        const r = GRID.CELL_SIZE * 0.6 + Math.min(rat.width, rat.height) / 2;
        if (dx * dx + dy * dy < r * r) {
          rat.takeDamage(p.damage || 1);
          projs.splice(i, 1);
          cs.createDamageNumber?.(p.damage || 1, rat.position.x, rat.position.y, rat.color);
          break;
        }
      }
      if (rat.invulnerabilityTimer > 0) continue;
      // Melee attack hitboxes
      const melee = cs.enemyMeleeAttacks || [];
      for (const m of melee) {
        if (m.windupPhase) continue;
        if (m.hasHit) continue;
        if ((m.plane ?? 0) !== rat.plane) continue;
        const ax = m.position.x;
        const ay = m.position.y;
        const aw = m.width || GRID.CELL_SIZE;
        const ah = m.height || GRID.CELL_SIZE;
        if (
          ax < rat.position.x + rat.width && ax + aw > rat.position.x &&
          ay < rat.position.y + rat.height && ay + ah > rat.position.y
        ) {
          m.hasHit = true;
          rat.takeDamage(m.damage || 1);
          cs.createDamageNumber?.(m.damage || 1, rat.position.x, rat.position.y, rat.color);
          break;
        }
      }
    }
  }

  // Unified companion room-entry dispatch. Each companion type (crow, tamed
  // rat, camp NPC) owns its own onRoomEnter — this just walks the rosters and
  // calls each. Companion crows reuse companionShoulderIndex for their slot;
  // tamed rats pass (index, total) so they radial-spread around the player.
  snapAllCompanionsOnRoomEnter() {
    if (!this.player) return;
    for (const c of this.companionCrows) c.onRoomEnter?.(this.player);
    // Perma-fleeing rats from the previous room don't come back — they've
    // abandoned the player and despawn at the transition.
    if (this.tamedRats?.length) {
      this.tamedRats = this.tamedRats.filter(r => r.state !== 'permaFlee');
    }
    const ratCount = this.tamedRats?.length || 0;
    for (let i = 0; i < ratCount; i++) {
      this.tamedRats[i].onRoomEnter?.(this.player, this, i, ratCount);
    }
    this.companion?.onRoomEnter?.(this.player, this);
  }

  registerTamedRatsWithPhysics() {
    if (!this.tamedRats || this.tamedRats.length === 0) return;
    for (const rat of this.tamedRats) {
      this.physicsSystem.addEntity(rat);
    }
  }

  // Shared particle and debris updates for all game states
  updateCrows(deltaTime) {
    const crows = this.currentRoom?.crows || [];
    const followers = this.followerCrows || [];

    // Pull all on-ground bread loaves so crows can target them.
    const breadItems = this.items.filter(it => it && it.char === '⌬' && !it.consumed);

    // Skip the whole pipeline when nothing eligible can react to bread or
    // threats. Followers without bread are handled by updateFollowerCrows.
    if (crows.length === 0 && !(followers.length > 0 && breadItems.length > 0)) {
      return;
    }

    const bgObjects = this.currentRoom?.backgroundObjects || [];

    // Player-as-threat: scares unfed crows on proximity. Fed crows (already
    // tame) skip this — they only flee actual weapon contact.
    // While bread is on the ground, the player is offering food, not
    // threatening — otherwise SPACE-dropped bread at the player's feet
    // creates a scare loop: crow seeks → enters scare radius → flees →
    // returns → seeks → forever. Weapon attacks below still scare.
    const playerThreat = (this.player && this.player.plane === 0 && breadItems.length === 0)
      ? { x: this.player.position.x, y: this.player.position.y }
      : null;

    // Weapon threats apply to fed and unfed crows alike.
    const weaponThreats = [];
    for (const atk of this.combatSystem.getMeleeAttacks()) {
      weaponThreats.push({ x: atk.position.x, y: atk.position.y });
    }
    for (const proj of this.combatSystem.getProjectiles()) {
      weaponThreats.push({ x: proj.position.x, y: proj.position.y });
    }

    // Eat handler: remove the loaf, promote the eater to companion. Every
    // bread-eat adds one more companion — they accumulate. Other crows in the
    // room join the follower flock, drawn toward the feed point.
    const onAteBread = (loaf, crow) => {
      const idx = this.items.indexOf(loaf);
      if (idx !== -1) {
        this.physicsSystem.removeEntity(loaf);
        this.items.splice(idx, 1);
      }
      const ex = crow.position.x + GRID.CELL_SIZE / 2;
      const ey = crow.position.y + GRID.CELL_SIZE / 2;

      // Other room crows take off toward the feed point and join the flock.
      for (let i = crows.length - 1; i >= 0; i--) {
        const other = crows[i];
        if (other === crow) continue;
        other.becomeFollower(ex, ey);
        this.followerCrows.push(other);
        crows.splice(i, 1);
      }
      // Existing followers redirect interest to the new feed point.
      for (const f of this.followerCrows) {
        f.becomeFollower(ex, ey);
      }

      // Promote the eater. Pull it out of room.crows / follower flock if
      // present. Append to companion list — multiple companions are allowed.
      const cIdx = crows.indexOf(crow);
      if (cIdx !== -1) crows.splice(cIdx, 1);
      const fIdx = this.followerCrows.indexOf(crow);
      if (fIdx !== -1) this.followerCrows.splice(fIdx, 1);
      crow.becomeCompanion();
      crow.companionShoulderIndex = this.companionCrows.length;
      this.companionCrows.push(crow);
      this.fedCrowCount = Math.min(3, (this.fedCrowCount || 0) + 1);

      // Promotion burst: feather puff + golden crumbs + rising heart.
      for (let i = 0; i < 14; i++) {
        const angle = (i / 14) * Math.PI * 2 + Math.random() * 0.3;
        const speed = 35 + Math.random() * 35;
        this.particles.push({
          x: ex, y: ey,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 20,
          life: 0.55, maxLife: 0.55,
          char: i % 2 === 0 ? '*' : '·',
          color: i % 2 === 0 ? '#ffffff' : '#daa520'
        });
      }
      this.particles.push({
        x: ex, y: ey - 4, vx: 0, vy: -22,
        life: 0.9, maxLife: 0.9, char: '♥', color: '#ff5577'
      });
    };

    for (const crow of crows) {
      crow.update(deltaTime, bgObjects, crows, breadItems, onAteBread);

      // Tagged threats: weapon contact counts as an attack and shakes the
      // hoard loose; player proximity only spooks the crow into the air.
      const threats = [];
      if (playerThreat) threats.push({ x: playerThreat.x, y: playerThreat.y, isAttack: false });
      for (const t of weaponThreats) threats.push({ x: t.x, y: t.y, isAttack: true });
      for (const t of threats) {
        if (crow.isWithinScareRange(t.x, t.y)) {
          const droppedGlyph = crow.scare(t.x, t.y, t.isAttack);
          if (droppedGlyph) {
            const drop = new Ingredient(droppedGlyph, crow.position.x, crow.position.y);
            drop.startDropBounce(0.55);
            this.ingredients.push(drop);
            this.physicsSystem.addEntity(drop);
          }
          break;
        }
      }

      if (crow.takeoffPending) {
        const variant = Math.random() < 0.5 ? 'crow_takeoff_1' : 'crow_takeoff_2';
        this.audioSystem?.playSFX(variant);
        crow.takeoffPending = false;
      }
    }

    // Followers break orbit to chase bread. Drives them through the same wild
    // seek/eat state machine; onAteBread promotes the eater to companion and
    // pulls it out of the follower list. updateFollowerCrows skips any that
    // entered 'seekingBread' this frame so they don't double-step.
    if (breadItems.length > 0 && followers.length > 0) {
      for (const f of [...followers]) {
        f.update(deltaTime, bgObjects, followers, breadItems, onAteBread);
      }
    }
  }

  updateCompanionCrow(deltaTime) {
    if (!this.companionCrows || this.companionCrows.length === 0) return;
    const ctx = {
      player: this.player,
      ingredients: this.ingredients,
      enemies: this.currentRoom?.enemies || [],
      items: this.items,
      // Lift the ingredient off the ground but DON'T credit the player —
      // the companion ferries it back and deposits on perch. Returns true if
      // the world removal succeeded so the crow knows the pickup took.
      takeIngredient: (ing) => {
        if (!ing || ing.consumed) return false;
        ing.consumed = true;
        this.physicsSystem.removeEntity(ing);
        const idx = this.ingredients.indexOf(ing);
        if (idx !== -1) this.ingredients.splice(idx, 1);
        return true;
      },
      // Hand-off on perch: credit the player with the carried glyph. Optional
      // delivery pop so the player sees the trade happen.
      depositIngredient: (glyph, crow) => {
        if (!glyph) return;
        this.addIngredient(glyph);
        if (crow) {
          const cx = crow.position.x + GRID.CELL_SIZE / 2;
          const cy = crow.position.y + GRID.CELL_SIZE / 2;
          for (let i = 0; i < 5; i++) {
            const a = (i / 5) * Math.PI * 2;
            this.particles.push({
              x: cx, y: cy,
              vx: Math.cos(a) * 25, vy: Math.sin(a) * 25 - 10,
              life: 0.35, maxLife: 0.35,
              char: '·', color: '#ffffff'
            });
          }
        }
      },
      companionCount: this.companionCrows.length
    };
    for (const c of this.companionCrows) {
      c.updateAsCompanion(deltaTime, ctx);
    }
    this._processCompanionDiveAttacks(deltaTime);
  }

  // Dive-attack coordination: at most ONE companion is in flight at a time.
  // Picks the first eligible orbiter that is off cooldown and launches it
  // with a miss-chance roll. Telegraph (windup, during which the crow keeps
  // orbiting) → dash → cooldown.
  _processCompanionDiveAttacks(deltaTime) {
    // Global one-at-a-time gate: any companion currently winding up or
    // diving blocks new launches this frame.
    const anyEngaged = this.companionCrows.some(c => c.diveState && c.diveState !== 'idle');
    if (!anyEngaged) {
      for (const c of this.companionCrows) {
        if (c.diveCooldownTimer > 0) continue;
        if (c.companionTask !== 'enemy' || !c.companionTarget) continue;
        const t = c.companionTarget;
        if (!t || t.isDead || t.dead || t.hp <= 0) continue;
        // 45% miss rate — keeps dives feeling more like harassment than
        // a guaranteed strike, and gives the enemy room to counter.
        const miss = Math.random() < 0.45;
        c.beginDive(t, { miss });
        break;
      }
    }
    // Drive any in-flight dives and apply hits
    for (const c of this.companionCrows) {
      if (!c.diveState || c.diveState === 'idle') continue;
      const hitEnemy = c.updateDive(deltaTime);
      if (hitEnemy && !c.diveHasHit) {
        c.diveHasHit = true;
        const dmg = 1;
        if (typeof hitEnemy.takeDamage === 'function') {
          hitEnemy.takeDamage(dmg, this);
        }
        this.combatSystem.createDamageNumber(dmg, hitEnemy.position.x, hitEnemy.position.y, '#ffdd66');
        // Small impact burst
        const ix = hitEnemy.position.x + GRID.CELL_SIZE / 2;
        const iy = hitEnemy.position.y + GRID.CELL_SIZE / 2;
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          this.particles.push({
            x: ix, y: iy,
            vx: Math.cos(a) * 50, vy: Math.sin(a) * 50,
            life: 0.35, maxLife: 0.35,
            char: '·', color: '#ffffff'
          });
        }
      }
    }
  }

  // Reputation effect: once the player has fed three crows, every wild crow
  // in a newly-entered room joins the follower flock immediately (no bread
  // needed). The flock still clears on the next room transition.
  autoJoinWildCrows() {
    if ((this.fedCrowCount || 0) < 3) return;
    const crows = this.currentRoom?.crows;
    if (!crows || crows.length === 0) return;
    if (!this.player) return;
    const px = this.player.position.x + GRID.CELL_SIZE / 2;
    const py = this.player.position.y + GRID.CELL_SIZE / 2;
    for (const c of crows) {
      c.becomeFollower(px, py);
      this.followerCrows.push(c);
    }
    crows.length = 0;
  }

  updateFollowerCrows(deltaTime) {
    if (!this.followerCrows || this.followerCrows.length === 0) return;
    const bgObjects = this.currentRoom?.backgroundObjects || [];
    const playerSpeed = this.player
      ? Math.hypot(this.player.velocity.vx, this.player.velocity.vy)
      : 0;
    const ctx = {
      player: this.player,
      backgroundObjects: bgObjects,
      playerSpeed,
      otherFollowers: this.followerCrows
    };
    for (const f of this.followerCrows) {
      // updateCrows already drove this frame's tick for bread-seekers.
      if (f.state === 'seekingBread') continue;
      f.updateAsFollower(deltaTime, ctx);
    }
  }

  updateSharedGameElements(deltaTime) {
    // Decay ember stacks and cooldowns each frame
    if (this.player) {
      if (this.player.emberStackCooldown > 0) {
        this.player.emberStackCooldown -= deltaTime;
      }
      if (this.player.emberStackTimer > 0) {
        this.player.emberStackTimer -= deltaTime;
        if (this.player.emberStackTimer <= 0) {
          this.player.emberStacks = 0;
          this.player.emberStackTimer = 0;
        }
      }
    }
    if (this.currentRoom && this.currentRoom.enemies) {
      for (const enemy of this.currentRoom.enemies) {
        if ((enemy.emberStackCooldown || 0) > 0) {
          enemy.emberStackCooldown -= deltaTime;
        }
        if ((enemy.emberStacks || 0) > 0) {
          enemy.emberStackTimer -= deltaTime;
          if (enemy.emberStackTimer <= 0) {
            enemy.emberStacks = 0;
            enemy.emberStackTimer = 0;
          }
        }
      }
    }

    // Update particles (dodge trails, explosions, embers, etc.)
    const emberHitEntities = new Set(); // cap to one ember contact per entity per frame
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

        // Embers accumulate burn stacks — contact must be "successive" within a time window.
        // Grass/objects ignite instantly (handled via obj.ignite). Entities require 3 hits.
        // Immune enemies (fire-type etc.) are skipped entirely.
        if (particle.isEmber && this.player) {
          const alpha = Math.max(0, particle.life / particle.maxLife);

          if (alpha > 0.5) {
            const EMBER_RADIUS = GRID.CELL_SIZE;
            const EMBER_STACK_WINDOW = 2.0; // seconds before stack resets
            const EMBER_THRESHOLD = 5;      // hits needed to ignite

            const EMBER_STACK_COOLDOWN = 0.5; // min seconds between stack gains

            // Player — skipped if fire immune or on cooldown; burnResist does not block ember stacks
            if (!emberHitEntities.has(this.player) && !this.player.fireImmune &&
                this.player.emberStackCooldown <= 0) {
              const pdx = this.player.position.x + GRID.CELL_SIZE / 2 - particle.x;
              const pdy = this.player.position.y + GRID.CELL_SIZE / 2 - particle.y;
              if (Math.sqrt(pdx * pdx + pdy * pdy) < EMBER_RADIUS) {
                emberHitEntities.add(this.player);
                this.player.emberStacks++;
                this.player.emberStackTimer = EMBER_STACK_WINDOW;
                this.player.emberStackCooldown = EMBER_STACK_COOLDOWN;
                if (this.player.emberStacks >= EMBER_THRESHOLD) {
                  this.player.applyBurn(2.0);
                  this.player.emberStacks = 0;
                  this.player.emberStackTimer = 0;
                }
              }
            }

            // Enemies — immune enemies silently skip; all others need 3 stacks with cooldown
            if (this.currentRoom && this.currentRoom.enemies) {
              for (const enemy of this.currentRoom.enemies) {
                if (emberHitEntities.has(enemy)) continue;
                if (!enemy.shouldApplyStatusEffect('burn')) continue;
                if ((enemy.emberStackCooldown || 0) > 0) continue;
                const edx = enemy.position.x + GRID.CELL_SIZE / 2 - particle.x;
                const edy = enemy.position.y + GRID.CELL_SIZE / 2 - particle.y;
                if (Math.sqrt(edx * edx + edy * edy) < EMBER_RADIUS) {
                  emberHitEntities.add(enemy);
                  enemy.emberStacks = (enemy.emberStacks || 0) + 1;
                  enemy.emberStackTimer = EMBER_STACK_WINDOW;
                  enemy.emberStackCooldown = EMBER_STACK_COOLDOWN;
                  if (enemy.emberStacks >= EMBER_THRESHOLD) {
                    enemy.applyStatusEffect('burn', 2.0);
                    enemy.emberStacks = 0;
                    enemy.emberStackTimer = 0;
                  }
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

    // Update puddles — age timed puddles and remove expired ones (persistent puddles tick no-op)
    for (let i = this.puddles.length - 1; i >= 0; i--) {
      const p = this.puddles[i];
      p.update?.(deltaTime);
      if (p.expired) this.puddles.splice(i, 1);
    }

    // Update enemy shockwaves — invisible expanding rings (Cyan-boss pattern).
    // Visual feedback is bg objects shaking as the ring sweeps; damage/knockback applied once per entity.
    if (this.enemyShockwaves.length && this.currentRoom) {
      const C = GRID.CELL_SIZE;
      for (let i = this.enemyShockwaves.length - 1; i >= 0; i--) {
        const sw = this.enemyShockwaves[i];
        const prevRadius = sw.radius;
        sw.radius += sw.speed * deltaTime;

        // Shake background objects newly swept by the ring this frame
        const bgObjs = this.currentRoom.backgroundObjects || [];
        for (const obj of bgObjs) {
          if (obj.destroyed) continue;
          const cx = obj.position.x + C / 2;
          const cy = obj.position.y + C / 2;
          const d = Math.hypot(cx - sw.x, cy - sw.y);
          if (d <= prevRadius || d > sw.radius) continue;
          obj._playAnimation?.('shake');
        }

        // Apply damage / knockback to entities inside the current ring radius (once each via hitEntities Set)
        const apply = (entity) => {
          if (!entity || entity.hp <= 0) return;
          if (sw.hitEntities.has(entity)) return;
          if ((entity.plane ?? 0) !== sw.plane) return;
          const ex = entity.position.x + C / 2;
          const ey = entity.position.y + C / 2;
          const d = Math.hypot(ex - sw.x, ey - sw.y);
          if (d > sw.radius) return;
          sw.hitEntities.add(entity);
          const isSlime = entity.getElementalModifier?.('slime') === 0;
          this.physicsSystem.applyKnockback(entity, sw.x, sw.y, sw.knockback, 0.12);
          if (!isSlime && sw.damage > 0) {
            entity.takeDamage(sw.damage);
            if (entity === this.player) {
              this.combatSystem.createDamageNumber(sw.damage, entity.position.x, entity.position.y, entity.color);
            } else {
              this.combatSystem.createDamageNumber(sw.damage, entity.position.x, entity.position.y, '#ffffff');
            }
          }
        };
        apply(this.player);
        for (const enemy of this.currentRoom.enemies) apply(enemy);

        if (sw.radius >= sw.maxRadius) this.enemyShockwaves.splice(i, 1);
      }
    }

    // Update goo blobs
    const SLIME_TRAIL_DROP_PX = 10;
    const SLIME_TRAIL_DROP_PX_SQ = SLIME_TRAIL_DROP_PX * SLIME_TRAIL_DROP_PX;
    for (const gooBlob of this.gooBlobs) {
      gooBlob.update(deltaTime);

      // Stamp a slime trail along the blob's path (distance-based — stationary blobs don't spam trails)
      const tdx = gooBlob.position.x - gooBlob.trailLastX;
      const tdy = gooBlob.position.y - gooBlob.trailLastY;
      if (tdx * tdx + tdy * tdy >= SLIME_TRAIL_DROP_PX_SQ) {
        this._dropSlimeTrail(gooBlob.position.x, gooBlob.position.y, gooBlob.plane ?? 0);
        gooBlob.trailLastX = gooBlob.position.x;
        gooBlob.trailLastY = gooBlob.position.y;
      }

      // Check collision with player (only if on the same plane)
      if (this.player && (gooBlob.plane ?? 0) === (this.player.plane ?? 0) && gooBlob.isNearEntity(this.player)) {
        this.player.applyStatusEffect('goo', 5.0); // 5 second goo effect
      }

      // Check collision with enemies (slimes are immune, must share plane).
      // Unified slime state: non-slime enemies also get the goo status (slow) — not freeze.
      if (this.currentRoom && this.currentRoom.enemies) {
        for (const enemy of this.currentRoom.enemies) {
          if (enemy.getElementalModifier('slime') === 0) continue; // Slime-affinity enemies are immune
          if ((gooBlob.plane ?? 0) === (enemy.plane ?? 0) && gooBlob.isNearEntity(enemy)) {
            enemy.applyStatusEffect('goo', 5.0);
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
    const bgObjects = this._activeBackgroundObjects();
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
    // Disabled while Rusalka's charm is active or while polymorphed (frog form has no roll)
    const rusalkaActive = this.fishingSystem?.rusalka?.alive === true;
    let dodgeDirection = (rusalkaActive || this.player.polymorphed || this.player.hookedByMimic) ? { x: 0, y: 0 } : this.getDodgeRollDirection();

    // Shark Mask water dive/emerge — overrides standard dodge for ALL characters
    // (including Green Ranger continuous-roll). Edge detection on dodgeDirection
    // ensures a held arrow doesn't immediately auto-emerge after diving.
    if (this.player.sharkMask && this.player.inLiquid && !this.keys.space && !this.player.isGooey()) {
      const hasDodgeInput = (dodgeDirection.x !== 0 || dodgeDirection.y !== 0);
      const dodgeInputEdge = hasDodgeInput && !this._sharkLastDodgeInput;
      this._sharkLastDodgeInput = hasDodgeInput;

      if (dodgeInputEdge && this.player.diving) {
        // Re-press while diving → emerge burst
        this._sharkEmergeAttack(dodgeDirection);
      } else if (dodgeInputEdge && !this.player.diving &&
                 this.player.dodgeRoll.cooldownTimer <= 0 &&
                 !this.player.dodgeRoll.active &&
                 !this.player.continuousRollActive) {
        this.player.startSharkDive(dodgeDirection);
        this.audioSystem.playSFX('roll');
      }

      // While diving, drive the player ourselves and skip the character-class
      // dispatch entirely (otherwise Green Ranger's slide would override us).
      if (this.player.diving) {
        if (hasDodgeInput) {
          const baseMax = (this.player.heldItem ? 110 : 165) * (1 + this.player.speedBoost);
          this.player.velocity.vx = dodgeDirection.x * baseMax;
          this.player.velocity.vy = dodgeDirection.y * baseMax;
          this.player.acceleration.ax = 0;
          this.player.acceleration.ay = 0;
        }
        return; // skip dodge/movement dispatch this frame
      }
      // Shark Mask equipped + in water but not diving (e.g. dive ended while
      // arrows still held, or cooldown blocks entry). Zero out dodgeDirection
      // so the standard/green-ranger dodge handlers below cannot fire — the
      // dive is the only valid water dodge response when wearing the mask.
      dodgeDirection = { x: 0, y: 0 };
    } else {
      this._sharkLastDodgeInput = false;
    }

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
              this.audioSystem.stopSFXByName('wand_charge');
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
          // Shadow Robe: dodge key triggers bat form (speed boost + char change) instead of rolling
          if (this.player.batTransform && this.player.batFormTimer <= 0) {
            this.player.batFormTimer = 1.2;
            this.player.char = '^';
            this.player.speedBoostTimer = 1.2;
            this.player.speedBoostMultiplier = 2.5;
          }

          // maze returns [] (ghosts aren't enemies); hut/dungeon returns activeFloor.enemies; surface returns currentRoom.enemies
          const enemies = this._activeEnemies();
          const rollStarted = this.player.batTransform
            ? false // bat form replaces the roll
            : this.player.startDodgeRoll(dodgeDirection, enemies);

          if (rollStarted) {
            // Whirlwind Cape: transform roll into a spinning dash — covers distance, dizzies nearby enemies, no iframes
            if (this.player.whirlwindCape) {
              this.player.dodgeRoll.type = 'whirlwind';
              this.player.dodgeRoll.speed *= 1.5;
              const spinRadius = GRID.CELL_SIZE * 2;
              const px = this.player.position.x + GRID.CELL_SIZE / 2;
              const py = this.player.position.y + GRID.CELL_SIZE / 2;
              for (const enemy of enemies) {
                const ex = enemy.position.x + GRID.CELL_SIZE / 2;
                const ey = enemy.position.y + GRID.CELL_SIZE / 2;
                if (Math.hypot(ex - px, ey - py) < spinRadius) {
                  enemy.applyStatusEffect('dizzy', 4.0);
                }
              }
            }
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
    if (this.animationSystem.isAnimating(this.player)) {
      // AnimationSystem owns position this frame — suppress input entirely
      this.player.updateInput({ up: false, down: false, left: false, right: false });
    } else if (this.player.continuousRollActive) {
      // Green ranger continuous roll: velocity is managed directly above, skip updateInput
      // (calling updateInput would cap velocity to normal walk speed)
    } else if (!this.menuOpen && !this.bridgeMenuOpen && !this.player.dodgeRoll.active) {
      // Lock movement during fishing cast/wait
      const fishingBlocked = this.player.fishingLocked;
      // Lock movement during windup and attack flash for weapons that require a planted stance
      const windupLocked = !!(this.player.heldItem?.data?.locksMovement &&
        (this.player.heldItem?.windupActive || this.player.heldItem?.attackLockTimer > 0));
      // Lock facing for non-bow weapons during attack; allow aiming while charging bow; lock during trap charge
      const lockFacing = !!this.trapCharging || (this.keys.space && this.player.heldItem && this.player.heldItem.data.weaponType !== 'BOW');
      // Apply Rusalka input suppression (scale keys toward zero)
      const rs = this.player.rusalkaInputScale;
      const rng = () => Math.random() < rs; // probabilistic suppression
      const dizzy = this.player.isDizzy();
      const moveLocked = fishingBlocked || windupLocked;
      this.player.updateInput({
        up:    moveLocked ? false : (dizzy && Math.random() < 0.15 ? this.keys.s : (rs >= 1.0 ? this.keys.w : rng() && this.keys.w)),
        down:  moveLocked ? false : (dizzy && Math.random() < 0.15 ? this.keys.w : (rs >= 1.0 ? this.keys.s : rng() && this.keys.s)),
        left:  moveLocked ? false : (dizzy && Math.random() < 0.15 ? this.keys.d : (rs >= 1.0 ? this.keys.a : rng() && this.keys.a)),
        right: moveLocked ? false : (dizzy && Math.random() < 0.15 ? this.keys.a : (rs >= 1.0 ? this.keys.d : rng() && this.keys.d))
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

    // Moss Cloak ✿ stealth state machine. Armed by the active→inactive dodge transition;
    // becomes active when the player stops issuing WASD input. Any WASD held cancels.
    const cloakEquipped = this.inventorySystem.equippedArmor?.data?.mossCloak === true;
    if (cloakEquipped) {
      const wasdHeld = this.keys.w || this.keys.a || this.keys.s || this.keys.d;
      if (this.player._lastDodgeActive && !this.player.dodgeRoll.active) {
        this.player.mossCloakArmed = true;
      }
      this.player._lastDodgeActive = this.player.dodgeRoll.active;
      if (wasdHeld || this.player.dodgeRoll.active) {
        this.player.mossCloakArmed = false;
        this.player.mossCloakActive = false;
      } else if (this.player.mossCloakArmed) {
        this.player.mossCloakActive = true;
      }
    } else {
      this.player.mossCloakArmed = false;
      this.player.mossCloakActive = false;
      this.player._lastDodgeActive = this.player.dodgeRoll.active;
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

    // Clear staff-block state if the held weapon is no longer a blocking staff
    if (this.player.isStaffBlocking && !this._isBlockingStaff(this.player.heldItem)) {
      this.player.isStaffBlocking = false;
      this.player.staffSwingHasFired = false;
    }

    // Update held item cooldown and check for windup completion
    if (this.player.heldItem && this.player.heldItem.update) {
      const windupAttack = this.player.heldItem.update(deltaTime);
      if (windupAttack) {
        this.playWeaponAttackSFX(this.player.heldItem);
        this.combatSystem.createAttack(this.applyGreenDamageModifier(windupAttack), this.currentRoom ? this.currentRoom.enemies : []);
        // Directly create the expanding shockwave ring for hammer-type attacks
        const _swHits = Array.isArray(windupAttack) ? windupAttack : [windupAttack];
        const _swTrigger = _swHits.find(a => a?.triggerShockwave);
        if (_swTrigger) {
          this.playerShockwave = {
            x: _swTrigger.shockwaveOrigin.x,
            y: _swTrigger.shockwaveOrigin.y,
            radius: 0, prevRadius: 0,
            maxRadius: GRID.CELL_SIZE * 5,
            speed: GRID.CELL_SIZE * 8,
            color: _swTrigger.shockwaveColor || _swTrigger.color,
          };
        }
        if (this.player.heldItem.data?.placesLava) {
          this._spawnLavaSweep(this.player, this.currentRoom);
        }
        if (this._isBlockingStaff(this.player.heldItem)) {
          this.player.staffSwingHasFired = true;
        }
        this._emitSoundEvent();
      }
      this._updateReloadAudio(this.player.heldItem);
    }

    return { burnKilledPlayer };
  }

  updateRestState(deltaTime) {
    if (!this.player) return;

    // Store previous position before physics update
    this.previousPlayerPosition.x = this.player.position.x;
    this.previousPlayerPosition.y = this.player.position.y;

    // Reapply equipment effects (keeps armor properties like batTransform in sync)
    this.applyEquipmentEffects();

    // Update all shared player mechanics
    this.updatePlayerMechanics(deltaTime);

    // Update shared game elements (particles, debris, etc.)
    this.updateSharedGameElements(deltaTime);

    // Update character NPCs (idle animations)
    for (const npc of this.characterNPCs) {
      npc.update(deltaTime);
    }

    // Animate tombstone and slot popups
    this.menuSystem.updateTombstonePopup(deltaTime);
    this.menuSystem.updateSlotPopup(deltaTime);

    // Update ingredient attraction, cooldown, and separation (same as EXPLORE mode)
    for (let i = this.ingredients.length - 1; i >= 0; i--) {
      const ingredient = this.ingredients[i];

      if (ingredient.pickupCooldown > 0) {
        ingredient.pickupCooldown = Math.max(0, ingredient.pickupCooldown - deltaTime);
      }
      if (ingredient.dropBounceTimer > 0) {
        ingredient.dropBounceTimer = Math.max(0, ingredient.dropBounceTimer - deltaTime);
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
        // Emerald Robe: goo consumed for 1HP heal instead of going to inventory
        if (ingredient.char === 'g' && this.player.gooConsume) {
          this.player.hp = Math.min(this.player.hp + 1, this.player.maxHp);
        } else if (ingredient.char === '𝑚' && this.player.magicMeter?.active) {
          // Mana drop auto-refills the meter once the well/cauldron has
          // activated it; bypass inventory entirely.
          this.magicSystem.addMana(this.player, 2);
        } else {
          // REST pickup routes to banked pool via addIngredient.
          this.addIngredient(ingredient.char);
        }
        this.audioSystem?.playSFX('ingredient_pickup');
        this.physicsSystem.removeEntity(ingredient);
        this.ingredients.splice(i, 1);
      }
    }

    // Update physics system
    this.physicsSystem.update(deltaTime, this.currentRoom ? this.currentRoom.backgroundObjects : []);

    // Update combat system (for weapon previews/attacks in rest mode)
    this.combatSystem.update(deltaTime, this.player, [], []);

    // Check for North exit — gated to the center warp arrows (3-cell-wide column)
    // so other interactives near the top edge (e.g. the gravestone) don't
    // accidentally cross the y-threshold and trigger an exit.
    const exitThreshold = GRID.CELL_SIZE * 2 - 10;
    const centerX = Math.floor(GRID.COLS / 2);
    const gridX = Math.floor(this.player.position.x / GRID.CELL_SIZE);
    const inWarpColumn = gridX >= centerX - 1 && gridX <= centerX + 1;
    const crossedNorthExit = this.previousPlayerPosition.y >= exitThreshold && this.player.position.y < exitThreshold;
    if (!this.animationSystem.isAnimating(this.player) &&
        inWarpColumn &&
        (this.player.position.y < exitThreshold || crossedNorthExit)) {
      // Save REST ingredients before leaving for EXPLORE
      this.inventorySystem.saveRestIngredients(this.ingredients);

      this.animateExitWarp('north', () => {
        this.stateMachine.transition(GAME_STATES.EXPLORE);
      });
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

    // Companion crow perches/follows in REST too.
    this.updateCompanionCrow(deltaTime);
    this.updateFollowerCrows(deltaTime);
  }

  updateExploreState(deltaTime) {
    if (!this.currentRoom) return;

    // Keep the south escape-route wall in sync with the player's inventory:
    // picking up or dropping the last item flips playerHasNoItems(), and the
    // physical wall must match the renderer's open-door visual.
    this.updateExitCollisions();

    // Update preview blink animation
    this.previewBlinkTimer += deltaTime;
    if (this.previewBlinkTimer >= this.PREVIEW_BLINK_INTERVAL) {
      this.previewBlinkTimer = 0;
      this.previewBlinkState = !this.previewBlinkState;
    }

    // Ocean (O room) ambient wave SFX — random variant every 3-5s
    if (this.currentRoom.letterTemplate?.oceanZone?.enabled) {
      this.waveSfxTimer -= deltaTime;
      if (this.waveSfxTimer <= 0) {
        const variant = 1 + Math.floor(Math.random() * 3);
        this.audioSystem.playSFX(`wave_${variant}`);
        this.waveSfxTimer = 3 + Math.random() * 2;
      }
    } else {
      this.waveSfxTimer = 0;
    }

    // Update all shared player mechanics
    const playerMechanicsResult = this.updatePlayerMechanics(deltaTime);
    const burnKilledPlayer = playerMechanicsResult?.burnKilledPlayer || false;

    // Blue-zone water armor tick — Coral Crown crystallizes the tile underfoot,
    // Stingray Mantle drops an electrified wake in vacated cells + damages
    // enemies standing in any electrified water within reach.
    this._updateCoralCrown();
    this._updateStingrayMantle(deltaTime);

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

    // Drive gem-wand auto-cast lifecycle
    this.magicSystem.update(deltaTime);

    // Drive Crystal Maul charge-hammer auto-fire (mirrors MagicSystem pattern for gem wands)
    {
      const weapon = this.player?.heldItem;
      if (weapon?.data?.chargeHammer && weapon.isCharging && !weapon.chargeAttackUsed &&
          weapon.chargeTime >= weapon.data.chargeTime) {
        const attacks = weapon.fireChargeHammerAttack();
        if (attacks) {
          this.combatSystem.createAttack(this.applyGreenDamageModifier(attacks), this.currentRoom ? this.currentRoom.enemies : []);
          this._emitSoundEvent();
          const _cswHits = Array.isArray(attacks) ? attacks : [attacks];
          const _cswTrigger = _cswHits.find(a => a?.triggerShockwave);
          if (_cswTrigger) {
            this.playerShockwave = {
              x: _cswTrigger.shockwaveOrigin.x,
              y: _cswTrigger.shockwaveOrigin.y,
              radius: 0, prevRadius: 0,
              maxRadius: GRID.CELL_SIZE * 5,
              speed: GRID.CELL_SIZE * 8,
              color: _cswTrigger.shockwaveColor || _cswTrigger.color,
            };
          }
        }
      }
    }

    // Drive Infused Coin → well arc animation + post-ritual flash
    this.wellSystem.update(deltaTime);

    // Drive fountain weapon arc + fairy delivery + corruption swarm timers
    this.fountainSystem.update(deltaTime);

    // Drive C-room camp NPC (idle/interested/companion/fleeing)
    this.campNPCSystem.update(deltaTime);

    // Tick dodge blocked feedback cooldown
    if (this.dodgeBlockedFeedbackTimer > 0) {
      this.dodgeBlockedFeedbackTimer -= deltaTime;
    }

    // Consumable cooldowns and flash timer are now handled in InventorySystem.update()

    // Vault unlocking is now triggered by SPACE press in handleSpacePress()

    // Update secret event visual effects (glitter, shaking, etc.)
    this.updateSecretEventEffects(deltaTime);

    // Drive bridge build animation in RIDGE rooms
    if (this.currentRoom?.type === 'RIDGE') {
      this.ridgeSystem.update(deltaTime);
    }

    // Store previous position before physics update (for exit zone crossing detection)
    // Skip while inside a maze/hut/dungeon — their coordinate spaces differ from the room grid
    if (!this.player.inMaze && !this.player.inHut && !this.player.inDungeon) {
      this.previousPlayerPosition.x = this.player.position.x;
      this.previousPlayerPosition.y = this.player.position.y;
    }

    // Update physics — collision source follows activeRoom (interior takes priority)
    const waterResults = this.physicsSystem.update(deltaTime, this._activeBackgroundObjects(), this.activeRoom);

    // Soft contact: gently separate player from overlapping enemies to prevent stacking
    if (!this.player.inHut && !this.player.inDungeon && !this.player.inMaze) {
      this.physicsSystem.resolveEntityContacts(this.player, this.currentRoom.enemies);
    }

    // Track if lava killed the player
    let lavaKilledPlayer = false;

    // Reset per-frame liquid flags before processing
    this.player.inLiquid = false;
    this.player.inDamagingLiquid = false;
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
      // Float (Floating Boots) bypasses all liquid damage — already cleared by PhysicsSystem,
      // but guard here too in case an enemy with float: true passes through this path.
      if (damagingLiquid) {
        // Lava-immune enemies (e.g. Tortoise) survive lava but track their state for behavior changes
        if (entity.data?.lavaImmune) {
          entity.inLava = true;
          continue;
        }
        if (entity === this.player) this.player.inDamagingLiquid = true;
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

      // Clear inLava for lava-immune entities that have left the lava
      if (entity.data?.lavaImmune && entity.inLava) entity.inLava = false;

      if (!inLiquid) continue;

      // Track player liquid state for Rusalka movement
      if (entity === this.player) this.player.inLiquid = true;

      // Check water immunity (Rubber Boots) — blocks elemental status effects but not movement slow
      const isImmune = entity === this.player && this.player.waterImmunityTimer > 0;
      // Stingray Mantle: wearer is immune to shock from electrified water
      // (their own wake or any other source) — they sit at the source of the
      // current, not in its path.
      const isShockImmune = entity === this.player && this.player.stingrayMantle;

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
        } else if (liquidState === 'electrified' && !isShockImmune) {
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

    // Slime enemy contact: apply goo to player and to any non-slime enemy in touch range.
    // Skip when player is inside a PiP interior (maze/hut/dungeon) — positions are in different coordinate spaces
    const SLIME_COLLISION_DISTANCE = 16; // pixels
    const SLIME_COLLISION_SQ = SLIME_COLLISION_DISTANCE * SLIME_COLLISION_DISTANCE;
    const slimeEnemies = (this.player.inMaze || this.player.inHut || this.player.inDungeon)
      ? []
      : this.currentRoom.enemies.filter(e => e.getElementalModifier('slime') === 0);
    for (const slime of slimeEnemies) {
      // Player contact
      const pdx = this.player.position.x - slime.position.x;
      const pdy = this.player.position.y - slime.position.y;
      if (pdx * pdx + pdy * pdy < SLIME_COLLISION_SQ) {
        this.player.applyStatusEffect('goo', 5.0);
      }
      // Non-slime enemy contact
      for (const other of this.currentRoom.enemies) {
        if (other === slime) continue;
        if (other.getElementalModifier('slime') === 0) continue; // skip fellow slimes
        const dx = other.position.x - slime.position.x;
        const dy = other.position.y - slime.position.y;
        if (dx * dx + dy * dy < SLIME_COLLISION_SQ) {
          other.applyStatusEffect('goo', 5.0);
        }
      }
    }

    // Slime trail puddle contact: slime-suited player gets a speed boost, otherwise goo slow. Non-slime enemies on the same plane get goo.
    // Maze still skipped (no puddles spawn in maze interior). Puddles + enemies route by hutPlane / activeRoom — surface and interior both run.
    if (this.puddles.length && !this.player.inMaze) {
      const playerPlane = this.player.plane ?? 0;
      const playerInInterior = !!this.activeFloor;
      const activeEnemies = this._activeEnemies();
      for (const puddle of this.puddles) {
        if (puddle.type !== 'slimeTrail') continue;
        // Skip surface puddles when player is in interior (and vice versa)
        if (!!puddle.hutPlane !== playerInInterior) continue;
        if ((puddle.plane ?? 0) === playerPlane && puddle.isEntityOnPuddle(this.player)) {
          if (this.player.slimeImmune) {
            this.player.applyStatusEffect('slimeBoost', 5.0);
          } else {
            this.player.applyStatusEffect('goo', 5.0);
          }
        }
        for (const enemy of activeEnemies) {
          if (enemy.getElementalModifier('slime') === 0) continue; // slime-affinity immune
          if ((puddle.plane ?? 0) !== (enemy.plane ?? 0)) continue;
          if (puddle.isEntityOnPuddle(enemy)) {
            enemy.applyStatusEffect('goo', 5.0);
          }
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

    // Clear staff-block state if the held weapon is no longer a blocking staff
    if (this.player.isStaffBlocking && !this._isBlockingStaff(this.player.heldItem)) {
      this.player.isStaffBlocking = false;
      this.player.staffSwingHasFired = false;
    }

    // Update held item cooldown and check for windup completion
    if (this.player.heldItem && this.player.heldItem.update) {
      const windupAttack = this.player.heldItem.update(deltaTime);
      if (windupAttack) {
        this.playWeaponAttackSFX(this.player.heldItem);
        this.combatSystem.createAttack(this.applyGreenDamageModifier(windupAttack), this.currentRoom ? this.currentRoom.enemies : []);
        if (this.player.heldItem.data?.placesLava) {
          this._spawnLavaSweep(this.player, this.currentRoom);
        }
        if (this._isBlockingStaff(this.player.heldItem)) {
          this.player.staffSwingHasFired = true;
        }
        this._emitSoundEvent();
      }
      this._updateReloadAudio(this.player.heldItem);
    }

    // Bow charging: chargeTime is incremented by item.update() while isCharging is true.
    // Charging can only START from handleSpacePress (which guards against pickup/other actions).
    // Nothing needed here — item.update() handles the charge timer.

    // Auto-attack when holding space (guns and melee only - bows use charging, wands require deliberate timing)
    // Only allow auto-attack if attack sequence was initiated by a button press (not just holding)
    // Skip vault key (UTILITY type)
    if (this.keys.space && this.attackSequenceActive && this.player.heldItem && this.player.heldItem.data.weaponType !== 'BOW' && this.player.heldItem.data.weaponType !== 'WAND' && this.player.heldItem.data.weaponType !== 'UTILITY' && !this.player.heldItem.data.chargeHammer && !this.player.fishingLocked && !this.menuOpen && !this.bridgeMenuOpen && !this.cheatMenu.isOpen && this.player.canAttack()) {
      const weapon = this.player.heldItem;

      // Staff blocking: cooldown fully elapsed while space still held → enter
      // block instead of starting another swing. weapon.canUse() going true is
      // the precise "ready to re-swing" moment; block hijacks that instant.
      // Already-blocking → suppress new swings.
      if (this._isBlockingStaff(weapon) && this.player.staffSwingHasFired && weapon.canUse()) {
        if (!this.player.isStaffBlocking) {
          this.player.isStaffBlocking = true;
        }
      } else if (this._isBlockingStaff(weapon) && this.player.isStaffBlocking) {
        // Hold sustained — keep blocking, suppress further swings.
      } else {
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
            this._emitSoundEvent();
          }
        }
      }
    }

    // Advance trap throw charge and in-flight traps
    this.trapSystem.updateTrapCharge(deltaTime);
    this.trapSystem.updateInFlightTraps(deltaTime);

    // Update placed traps (sets this.activeNoiseSource for this frame)
    this.updatePlacedTraps(deltaTime);
    this.trapSystem.checkWeaponTriggers();
    this.trapSystem.updatePuddles(deltaTime);
    this.wireSystem.update(deltaTime);

    // Update pack behavior - find packmates and share memory marks
    for (const enemy of this.currentRoom.enemies) {
      if (enemy.packCoordination && !enemy.packBehavior) {
        // New-style kiter with packCoordination — populate packmates from same-char enemies in room
        enemy.packmates = this.currentRoom.enemies.filter(other =>
          other !== enemy && other.char === enemy.char
        );

        // Share memory marks across pack
        if (enemy.packmates.length > 0) {
          let sharedMemory = enemy.lastKnownPosition;
          for (const mate of enemy.packmates) {
            if (mate.lastKnownPosition && (mate.aggroMemoryActive || !sharedMemory)) {
              sharedMemory = mate.lastKnownPosition;
            }
          }
          if (sharedMemory && !enemy.lastKnownPosition) {
            enemy.lastKnownPosition = { x: sharedMemory.x, y: sharedMemory.y };
          }
        }
      } else if (enemy.packBehavior && enemy.packBehavior.enabled) {
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
    // Exterior enemies are frozen while player is inside a hut, dungeon, or maze interior
    if (this.player.inHut || this.player.inDungeon || this.player.inMaze) {
      // Interior enemy/ghost updates handled by HutSystem/DungeonSystem/MazeSystem.update() above
    } else
    for (const enemy of this.currentRoom.enemies) {
      // Skip AI/attacks for enemies in death-shake state
      if (enemy.isDying) continue;

      // Check consumable usage
      if (enemy.itemUsage && enemy.itemUsage.enabled) {
        const consumable = enemy.shouldUseConsumable();
        if (consumable) {
          enemy.useConsumable(consumable);
          this.combatSystem.createDamageNumber('+', enemy.position.x, enemy.position.y, '#00ff00');
        }
      }

      // Target selection: prefer the nearest living entity (player, camp NPC
      // companion, or any tamed rat). Enemies only fight what they can see/
      // reach, so this just tells them WHO to pursue — the aggro-range and
      // vision checks inside Enemy.update() still gate whether they actually
      // chase. Tamed rats join the eligibility list so "takes aggro from
      // player when closer" falls out of nearest-target math (no taunt needed).
      let nearestTarget = this.player;
      let nearestDistSq = (this.player.position.x - enemy.position.x) ** 2
                       + (this.player.position.y - enemy.position.y) ** 2;
      const companion = this.companion;
      if (companion && companion.hp > 0 && companion.state !== CAMP_NPC_STATE.FLEEING) {
        const cDx = companion.position.x - enemy.position.x;
        const cDy = companion.position.y - enemy.position.y;
        const d = cDx * cDx + cDy * cDy;
        if (d < nearestDistSq) { nearestDistSq = d; nearestTarget = companion; }
      }
      for (const rat of this.tamedRats) {
        if (rat.state === 'permaFlee') continue;
        if ((rat.plane ?? 0) !== (enemy.plane ?? 0)) continue;
        const rDx = rat.position.x - enemy.position.x;
        const rDy = rat.position.y - enemy.position.y;
        const d = rDx * rDx + rDy * rDy;
        if (d < nearestDistSq) { nearestDistSq = d; nearestTarget = rat; }
      }
      enemy.setTarget(nearestTarget);

      // Cache the previous-frame charge velocity so we can detect a wall-block
      // (charging speed pinned to ~0 by physics resolution = hit something solid)
      const prevChargeSpeed = enemy.chargeState === 'charging'
        ? Math.sqrt(enemy.velocity.vx ** 2 + enemy.velocity.vy ** 2)
        : null;

      const updateResult = enemy.update(deltaTime);

      // Boss sub-entities (TurtleLeg, etc.) lack `data` and run their own update path —
      // their per-frame work was done by enemy.update above; skip the post-update
      // Enemy side-effect handlers below to avoid undefined access on .data.
      if (!enemy.data) continue;

      // Boar charge: contact damage + knockback on player hit; stun on wall hit.
      if (enemy.data.chargeMechanic?.enabled) {
        // Wall-block detection: was charging last frame but moved too slowly to
        // be unimpeded. Only meaningful after at least one frame of motion.
        if (enemy.chargeState === 'charging' && prevChargeSpeed !== null) {
          const expected = enemy.data.chargeMechanic.chargeSpeed;
          if (prevChargeSpeed < expected * 0.3) {
            enemy.chargeState = 'stunned';
            enemy.chargeDurationTimer = 0;
            enemy.chargeStunTimer = enemy.data.chargeMechanic.wallStunDuration;
            enemy.velocity.vx = 0;
            enemy.velocity.vy = 0;
            enemy.chargeTimer = enemy.data.chargeMechanic.cooldown;
          }
        }
        // Player contact during the dash: deal one melee hit with knockback,
        // then end the charge (the boar barrels past, doesn't grind on top).
        if (enemy.chargeState === 'charging' && !enemy.chargeHasHit
            && inSamePlane(enemy, this.player)) {
          const px = this.player.position.x, py = this.player.position.y;
          const ex = enemy.position.x, ey = enemy.position.y;
          const overlap = Math.abs(px - ex) < GRID.CELL_SIZE
                       && Math.abs(py - ey) < GRID.CELL_SIZE;
          if (overlap) {
            enemy.chargeHasHit = true;
            // Direct contact damage: createMeleeAttack would offset the hitbox
            // ~24px past the player (the boar is already on top of them), so the
            // combat system never registers a hit. Apply damage and knockback here.
            const damage = enemy.getEffectiveDamage();
            const result = this.player.takeDamage(damage, {
              isMelee: true,
              attacker: enemy
            });
            // Death is picked up by the global hp<=0 check later this frame.
            if (result?.dodged) {
              this.combatSystem.createDamageNumber('DODGE', this.player.position.x, this.player.position.y, '#ffff00');
            } else if (result?.blocked) {
              this.combatSystem.createDamageNumber('BLOCK', this.player.position.x, this.player.position.y, '#aaaaaa');
            } else if (result?.immune) {
              this.combatSystem.createDamageNumber('IMMUNE', this.player.position.x, this.player.position.y, '#00ffff');
            } else if (result !== false && result !== true) {
              this.combatSystem.createDamageNumber(damage, this.player.position.x, this.player.position.y, this.player.color);
              const knockback = 450 * (enemy.knockbackMultiplier ?? 1.0);
              this.physicsSystem.applyKnockback(this.player, ex, ey, knockback);
              this.physicsSystem.applyHitstop(this.player, 0.06);
              if (result?.reflect && result.attacker) {
                result.attacker.takeDamage(result.reflect);
                this.combatSystem.createDamageNumber(result.reflect, result.attacker.position.x, result.attacker.position.y, '#ff8800');
              }
            }
            enemy.chargeState = 'idle';
            enemy.chargeDurationTimer = 0;
            enemy.chargeTimer = enemy.data.chargeMechanic.cooldown;
          }
        }
      }

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

      // Giant Slime: emit a fan of GooBlobs into the room.
      if (updateResult.shouldSpewGoo && updateResult.gooSpewData) {
        for (const b of updateResult.gooSpewData) {
          const blob = new GooBlob(b.x, b.y, performance.now(), false, b.vx, b.vy, b.decel);
          blob.plane = b.plane ?? 0;
          blob.hutPlane = !!this.activeFloor;
          this.gooBlobs.push(blob);
        }
        const MAX_GOO_BLOBS = 20;
        while (this.gooBlobs.length > MAX_GOO_BLOBS) this.gooBlobs.shift();
        this.audioSystem?.playSFX('goo_hit');
      }

      // Slime-affinity enemies: stamp a slime trail tile along their path.
      // Giant Slime is ~3 cells wide visually, so it drops a small cluster of
      // tiles around its center — the merge-on-overlap logic in _dropSlimeTrail
      // fuses them into one fat puddle scaled to the boss's footprint.
      if (updateResult.shouldDropSlimeTrail) {
        const t = updateResult.shouldDropSlimeTrail;
        this._dropSlimeTrail(t.x, t.y, t.plane);
        if (enemy.char === 'M') {
          const RING_RADIUS = GRID.CELL_SIZE * 0.4;
          const RING_TILES = 4;
          for (let r = 0; r < RING_TILES; r++) {
            const a = (r / RING_TILES) * Math.PI * 2;
            this._dropSlimeTrail(
              t.x + Math.cos(a) * RING_RADIUS,
              t.y + Math.sin(a) * RING_RADIUS,
              t.plane
            );
          }
        }
      }

      // Giant Slime: leap landing → impact damage + invisible shockwave + landing trail
      if (updateResult.shouldLeapLand && updateResult.leapLandData) {
        const ld = updateResult.leapLandData;
        const cfg = ld.cfg;
        const hitEntities = new Set();
        // Direct impact: damage player if standing in the landing footprint (don't double-hit them with the ring sweep)
        if (this.player && (this.player.plane ?? 0) === ld.plane) {
          const pcx = this.player.position.x + GRID.CELL_SIZE / 2;
          const pcy = this.player.position.y + GRID.CELL_SIZE / 2;
          if (Math.hypot(pcx - ld.x, pcy - ld.y) <= cfg.landRadius) {
            this.player.takeDamage(cfg.landDamage);
            this.combatSystem.createDamageNumber(cfg.landDamage, this.player.position.x, this.player.position.y, this.player.color);
            this.physicsSystem.applyKnockback(this.player, ld.x, ld.y, cfg.landKnockback ?? cfg.shockwaveKnockback, 0.12);
            hitEntities.add(this.player);
          }
        }
        // Spawn an invisible expanding shockwave — visual is bg objects shaking as the ring sweeps past
        this.enemyShockwaves.push({
          x: ld.x,
          y: ld.y,
          plane: ld.plane,
          radius: cfg.landRadius, // start where the direct impact ended
          maxRadius: cfg.shockwaveMaxRadius,
          speed: cfg.shockwaveSpeed,
          damage: cfg.shockwaveDamage,
          knockback: cfg.shockwaveKnockback,
          hitEntities
        });
        // Landing slime splash: drop the central tile plus a ring of tiles around it.
        // The overlap-and-grow logic in _dropSlimeTrail will merge them into one big slime blob.
        if (cfg.trailDropOnLanding) {
          this._dropSlimeTrail(ld.x, ld.y, ld.plane);
          const RING_RADIUS = GRID.CELL_SIZE * 1.4;
          const RING_TILES = 10;
          for (let r = 0; r < RING_TILES; r++) {
            const a = (r / RING_TILES) * Math.PI * 2;
            this._dropSlimeTrail(
              ld.x + Math.cos(a) * RING_RADIUS,
              ld.y + Math.sin(a) * RING_RADIUS,
              ld.plane
            );
          }
        }
        this.audioSystem?.playSFX('goo_hit');
      }

      // Tick down Shaman buff on this enemy
      if (enemy._shamBuff) {
        enemy._shamBuff.timer -= deltaTime;
        if (enemy._shamBuff.timer <= 0) {
          if (enemy._shamBuff.type === 'speed') enemy.speed = enemy._shamBuff.baseSpeed;
          else if (enemy._shamBuff.type === 'damage') enemy.damage = enemy._shamBuff.baseDamage;
          enemy._shamBuff = null;
        }
      }

      // Fire trail / ice trail mechanic — persistent tile trail until room exit.
      if (updateResult.shouldPlaceTrail) {
        const td = updateResult.trailData;
        this._spawnEnemyTrailPuddle(td.x, td.y, td.type, td.radius, enemy.plane ?? 0);
      }

      // Shaman buff mechanic
      if (updateResult.shouldBuff) {
        const bd = updateResult.buffData;
        this._applyShamanBuff(bd, this._activeEnemies());
      }

      // Siren lure mechanic — apply pull force to player
      if (updateResult.shouldLure) {
        const ld = updateResult.lureData;
        this.player.velocity.vx += ld.forceX;
        this.player.velocity.vy += ld.forceY;
      }

      // Trap Goblin — lay a trap at current position
      if (updateResult.shouldLayTrap) {
        const trd = updateResult.trapData;
        if (this.trapSystem) {
          this.trapSystem.placeTrapAtPosition(trd.x, trd.y, trd.type, enemy.plane ?? 0, enemy);
        }
      }

      // Check for stun-dropped items
      const droppedItems = enemy.getStunDroppedItems();
      if (droppedItems.length > 0) {
        this.items.push(...droppedItems);
        for (const item of droppedItems) {
          this.physicsSystem.addEntity(item);
        }
      }

      // Slime speed boost when touching goo or any slime-related puddle.
      // Uses bounding-box overlap (slime body vs puddle footprint) instead of
      // `isEntityOnPuddle`'s strict center-in-square test, so thin trail tiles
      // (CELL_SIZE/8 wide) still register as the slime walks across them.
      if (enemy.getElementalModifier('slime') === 0) {
        const baseSpeed = enemy.data.speed;
        const GOO_TOUCH_RADIUS = GRID.CELL_SIZE;
        const ecx = enemy.position.x + GRID.CELL_SIZE / 2;
        const ecy = enemy.position.y + GRID.CELL_SIZE / 2;
        const halfBody = GRID.CELL_SIZE / 2;
        const onGoo = this.gooBlobs.some(blob => {
          const dx = ecx - blob.position.x;
          const dy = ecy - blob.position.y;
          return Math.sqrt(dx * dx + dy * dy) < GOO_TOUCH_RADIUS + blob.radius;
        }) || this.puddles.some(p => {
          if (p.type !== 'slimeTrail') return false;
          if ((p.plane ?? 0) !== (enemy.plane ?? 0)) return false;
          return Math.abs(ecx - p.position.x) < halfBody + p.radius
              && Math.abs(ecy - p.position.y) < halfBody + p.radius;
        });
        enemy.speed = onGoo ? baseSpeed * 2 : baseSpeed;
      }


    }

    // Process spawn requests
    this.enemySpawnSystem.flush();

    // Update captives (pulsing animation)
    for (const captive of this.captives) {
      captive.update(deltaTime);
    }

    // Close bridge menu when player walks out of interaction range
    if (this.bridgeMenuOpen && this.ridgeSystem.getWorkerDistance() > this.ridgeSystem.CLOSE_RANGE * 1.5) {
      this.ridgeSystem.closeMenu();
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
        continue;
      }

      // Fairy: touch-resolution (heal / bottle-convert) and lifecycle cleanup
      if (char instanceof Fairy) {
        this.interactionSystem.checkFairyTouch?.(char);
        if (char.consumed || char.state === 'exited') {
          this.neutralCharacters.splice(i, 1);
          continue;
        }
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
            // Pickup. pickupItem returns either false (rejected), null (taken
            // into empty slot), or the displaced item (weapon swap — we need to
            // put the old weapon back into the world so the player can grab it).
            const result = enemy.pickupItem(targetItem);
            if (result !== false) {
              const index = this.items.indexOf(targetItem);
              if (index > -1) {
                this.items.splice(index, 1);
                this.physicsSystem.removeEntity(targetItem);
              }
              if (result && typeof result === 'object') {
                this.items.push(result);
                this.physicsSystem.addEntity?.(result);
              }
            }
            enemy.targetItem = null;
          }
        }
      }
    }

    // Update combat — redirect to interior enemies/objects when inside a hut or maze
    const activeEnemies = this._activeEnemies();
    const activeBackgroundObjects = this._activeBackgroundObjects();
    const combatResult = this.combatSystem.update(
      deltaTime,
      this.player,
      activeEnemies,
      activeBackgroundObjects,
      this.activeNoiseSource,
      this.activeRoom
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

        if (blob.expired) {
          this.gooBlobs.splice(bi, 1);
          continue;
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
            this.fishingSystem.hitRewardObject(
              reward,
              (char, x, y) => {
                const ing = new Ingredient(char, x, y);
                this.ingredients.push(ing);
                this.physicsSystem.addEntity(ing);
              },
              (specialKey, x, y) => {
                if (specialKey === 'fairy') {
                  if (this.fairiesAngered) return;
                  const fairy = new Fairy(x, y, this.currentRoom?.exits || {});
                  if (!this.neutralCharacters) this.neutralCharacters = [];
                  this.neutralCharacters.push(fairy);
                  return;
                }
                // Treat as ITEMS key — defer to LootSystem
                this.lootSystem?.spawnItemDrop?.(specialKey, x, y, null, null);
              }
            );
          }
        }
      }
    }

    // Spawn drops from objects destroyed this frame (by melee or bullets)
    if (combatResult.objectEffects) {
      for (const { obj, effect, attack } of combatResult.objectEffects) {
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
          this.handleObjectEffect(effect, obj, attack);
        } else {
          // Normal drop chance logic
          const chance = obj.data.dropChance;
          if (chance === undefined || Math.random() < chance) {
            this.handleObjectEffect(effect, obj, attack);
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
        poison: ['+', '.', 'o']
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
        cloud.hutPlane = !!this.activeFloor;
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

    // Update hut/dungeon/maze systems (door entry/exit and interior entity logic)
    this.hutSystem.update(deltaTime);
    this.dungeonSystem.update(deltaTime);
    this.mazeSystem.update(deltaTime);

    // Update polymorph system (tongue attacks, cure Rusalka contact, Lake room spawn)
    this.polymorphSystem.update(deltaTime, this);

    // Lava adjacent to water → solidify to rock
    this.interactionSystem.update(deltaTime, this._activeBackgroundObjects());

    // Update boss system (phase transitions, reflect checks, grab escape)
    this.bossSystem.update(deltaTime);

    // Update boulder system (red zone rolling boulder hazard)
    this.boulderSystem.update(deltaTime);

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

      // Check for Fairy in a Bottle death intercept (full heal — preferred over Phoenix Feather)
      const bottleIdx = (this.player.equippedConsumables || []).findIndex(c => c?.data?.effect === 'revive_on_death');
      if (bottleIdx !== -1) {
        const bottle = this.player.equippedConsumables[bottleIdx];
        this.player.hp = this.player.maxHp;
        this.player.invulnerabilityTimer = 2.0;
        this.combatSystem.createDamageNumber(
          bottle.char,
          this.player.position.x,
          this.player.position.y - GRID.CELL_SIZE * 0.5,
          bottle.color
        );
        const burst = createActivationBurst(this.player.position.x, this.player.position.y, bottle.color);
        this.particles.push(...burst);
        this.inventorySystem.equippedConsumables[bottleIdx] = null;
        this.player.equippedConsumables[bottleIdx] = null;
        this.inventorySystem.spentConsumableSlots[bottleIdx] = true;
        this.audioSystem?.playSFX?.('pickup');
        this.saveGameState();
        console.log('🧚 Fairy in a Bottle activated — death intercepted! HP fully restored.');
        // fall through — do NOT transition to GAME_OVER
      } else {
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
        // Stop music and play death SFX
        this.audioSystem.stop();
        this.audioSystem.playSFX('player_death');

        // Capture death snapshot for design analysis before any state is cleared
        captureDeath(this);

        // Record what killed the player (for REST tombstone)
        const killer = this.player._lastAttacker;
        if (killer && killer.data) {
          this.lastDeathCause = {
            name: killer.data.name,
            char: killer.char,
            color: killer.color,
            description: killer.data.description || ''
          };
        }
        this.tombstoneActive = true;
        this.tombstonePopup = null;

        // Ghost kills have no death animation
        if (!this.player._killedByGhost) {
          const explosion = createExplosion(
            this.player.position.x + GRID.CELL_SIZE / 2,
            this.player.position.y + GRID.CELL_SIZE / 2,
            20,
            this.player.color
          );
          this.particles.push(...explosion);
          for (const particle of explosion) {
            this.physicsSystem.addEntity(particle);
          }
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
    }

    // Tick dying-shake timers for enemies with deathExplosion deathDelay
    for (const enemy of this.currentRoom.enemies) {
      if (enemy.isDying) {
        enemy.dyingTimer -= deltaTime;
      }
    }

    // Remove dead enemies and spawn loot + debris
    for (let i = this.currentRoom.enemies.length - 1; i >= 0; i--) {
      const enemy = this.currentRoom.enemies[i];
      // deathExplosion enemies shake for deathDelay seconds before truly dying
      if (enemy.hp <= 0 && !enemy.isDying && enemy.data.deathExplosion?.deathDelay) {
        enemy.isDying = true;
        enemy.dyingTimer = enemy.data.deathExplosion.deathDelay;
        enemy.velocity = { vx: 0, vy: 0 };
        continue;
      }
      if (enemy.isDying && enemy.dyingTimer > 0) continue;
      if (enemy.hp <= 0) {
        // Blood Robe: blade kill heals 1HP
        if (enemy.killedByBlade && this.player?.bladeKillHeal) {
          this.player.hp = Math.min(this.player.hp + 1, this.player.maxHp);
        }

        // Per-enemy death SFX (data.sfx.death — string or array for random pick).
        // Pure elementals and arcane casters share a magical death sound; everything
        // else falls back to the generic destroy thud.
        const deathSfx = enemy.data?.sfx?.death;
        if (deathSfx) {
          const name = Array.isArray(deathSfx)
            ? deathSfx[Math.floor(Math.random() * deathSfx.length)]
            : deathSfx;
          this.audioSystem.playSFX(name);
        } else if (MAGIC_DEATH_NAMES.has(enemy.data?.name)) {
          this.audioSystem.playSFX('magic_death');
        } else {
          this.audioSystem.playSFX('destroy');
        }

        // Handle spawn-on-death and parent spawner notification
        this.enemySpawnSystem.handleEnemyDeath(enemy);

        // Death explosion (Magma Slug, Glacier Crab)
        if (enemy.data.deathExplosion?.enabled) {
          const de = enemy.data.deathExplosion;
          const cx = enemy.position.x + GRID.CELL_SIZE / 2;
          const cy = enemy.position.y + GRID.CELL_SIZE / 2;
          const spread = (de.spreadAngle || 360) * Math.PI / 180;
          const baseAngle = Math.random() * Math.PI * 2;
          for (let p = 0; p < de.projectileCount; p++) {
            const angle = baseAngle + (spread / de.projectileCount) * p;
            this.combatSystem.createEnemyAttack({
              type: 'enemy_projectile',
              char: de.projectileType === 'fire' ? '·' : '*',
              position: { x: cx, y: cy },
              velocity: { vx: Math.cos(angle) * de.speed, vy: Math.sin(angle) * de.speed },
              damage: de.damage,
              color: de.projectileType === 'fire' ? '#ff6600' : '#88ccff',
              onHit: de.projectileType === 'freeze' ? 'freeze' : undefined,
              owner: enemy,
              shooterPlane: enemy.plane ?? 0
            });
          }
        }

        // Hex Witch spell learning on death
        if (enemy.data.hexMechanic?.learnSpellOnDeath && this.knownSpells) {
          this.knownSpells.add(enemy.data.hexMechanic.learnSpellOnDeath);
        }

        // Armor mechanic: Rockwarden — spawn debris projectiles when armor chunk breaks
        // (armor chunk breaks are tracked in CombatSystem; see takeDamage override below)

        // Drop inventory items
        const itemDrops = enemy.dropInventory();
        const enemyPlane = enemy.plane ?? 0;
        for (const item of itemDrops) {
          item.plane = enemyPlane;
        }
        this.items.push(...itemDrops);
        for (const item of itemDrops) {
          this.physicsSystem.addEntity(item);
        }

        this.spawnLoot(enemy);

        // Alchemist dropLastThrown: guaranteed drop of the last potion type thrown
        if (enemy.data.potionMechanic?.dropLastThrown && enemy.lastPotionThrown) {
          const effectToIngredient = { burn: 'F', freeze: 'i', poison: 'v', confusion: 'd' };
          const ingredientChar = effectToIngredient[enemy.lastPotionThrown.effect];
          if (ingredientChar) {
            this.lootSystem.spawnIngredientDrop(ingredientChar, enemy.position.x, enemy.position.y, null, enemy);
          }
        }

        // Mana drop — only once the magic meter is active. 75% chance per
        // kill (100% on bosses) to drop a Mana ingredient (𝑚) that auto-refills
        // the meter on pickup. Skipped when the meter is already full so the
        // player isn't tempted to dawdle for waste drops.
        if (this.player?.magicMeter?.active &&
            this.player.magicMeter.current < this.player.magicMeter.max) {
          const manaDropChance = enemy.data?.isBoss ? 1.0 : 0.75;
          if (Math.random() < manaDropChance) {
            this.lootSystem.spawnIngredientDrop('𝑚', enemy.position.x, enemy.position.y, null, enemy);
          }
        }

        // Create debris at enemy position
        const enemyDebris = createDebris(
          enemy.position.x + GRID.CELL_SIZE / 2,
          enemy.position.y + GRID.CELL_SIZE / 2,
          4 + Math.floor(Math.random() * 3), // 4-6 pieces
          '#666666'
        );
        for (const piece of enemyDebris) {
          piece.plane = enemyPlane;
        }
        this.debris.push(...enemyDebris);

        // Add debris to physics system
        for (const piece of enemyDebris) {
          this.physicsSystem.addEntity(piece);
        }

        this.physicsSystem.removeEntity(enemy);
        this.currentRoom.enemies.splice(i, 1);
      }
    }

    // Mute layer 2 (bassline) immediately when all enemies are cleared.
    // Hidden mimics don't count — combat is effectively over from the player's POV.
    if (this._countedEnemies(this.currentRoom.enemies).length === 0) {
      this.audioSystem.muteLayer2Immediately();
    }

    // Update background object animations and fire propagation
    const activeBgObjects = this._activeBackgroundObjects();
    for (const obj of activeBgObjects) {
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
          // Player proximity (highest priority — controls imprint)
          const pdx = obj.position.x - this.player.position.x;
          const pdy = obj.position.y - this.player.position.y;
          const playerInRange = Math.sqrt(pdx * pdx + pdy * pdy) < GRID.CELL_SIZE * 0.7;

          // Find closest enemy in range if player isn't bending this blade
          let bendDx = pdx;
          let entityInRange = playerInRange;
          if (!playerInRange) {
            let closestDist = Infinity;
            for (const enemy of this._activeEnemies()) {
              const edx = obj.position.x - enemy.position.x;
              const edy = obj.position.y - enemy.position.y;
              const eDist = Math.sqrt(edx * edx + edy * edy);
              if (eDist < GRID.CELL_SIZE * 0.7 && eDist < closestDist) {
                closestDist = eDist;
                bendDx = edx;
                entityInRange = true;
              }
            }
          }

          if (entityInRange) {
            // Determine bend direction based on whichever entity is bending this blade
            let newChar, newOffset;
            if (bendDx > GRID.CELL_SIZE * 0.25) {
              newChar = '/';
              newOffset = GRID.CELL_SIZE * 0.25;
            } else if (bendDx < -GRID.CELL_SIZE * 0.25) {
              newChar = '\\';
              newOffset = -GRID.CELL_SIZE * 0.25;
            } else {
              newChar = '|';
              newOffset = 0;
            }

            obj.char = newChar;
            obj.grassRenderOffset.x = newOffset;
            obj.grassResetTimer = 0.18; // brief spring-back delay

            // Stamp imprint only for player dodge roll
            if (playerInRange && this.player.dodgeRoll.active && newChar !== '|') {
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

        if (Math.random() < emberChance && this.particles.length < 200) {
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
            isEmber: true,
            alive: true
          };
          this.particles.push(ember);

          // Check if ember ignites other objects (5% chance)
          if (Math.random() < 0.05) {
            for (const otherObj of activeBgObjects) {
              if (otherObj !== obj && !otherObj.destroyed && !otherObj.onFire && otherObj.isFlammable()) {
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
          for (const otherObj of activeBgObjects) {
            if (otherObj !== obj && !otherObj.destroyed && !otherObj.onFire && otherObj.isFlammable()) {
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

    // Direct fire contact — player overlapping a burning object accumulates ember stacks
    // without relying on emitted particles, which may travel away before reaching threshold.
    if (this.player && !this.player.fireImmune) {
      const EMBER_STACK_COOLDOWN = 0.5;
      const EMBER_STACK_WINDOW  = 2.0;
      const EMBER_THRESHOLD     = 3;
      const px = this.player.position.x + GRID.CELL_SIZE / 2;
      const py = this.player.position.y + GRID.CELL_SIZE / 2;
      if (this.player.emberStackCooldown <= 0) {
        for (const obj of activeBgObjects) {
          if (!obj.onFire || obj.destroyed) continue;
          const cx = obj.position.x + GRID.CELL_SIZE / 2;
          const cy = obj.position.y + GRID.CELL_SIZE / 2;
          if (Math.abs(px - cx) < GRID.CELL_SIZE && Math.abs(py - cy) < GRID.CELL_SIZE) {
            this.player.emberStacks++;
            this.player.emberStackTimer   = EMBER_STACK_WINDOW;
            this.player.emberStackCooldown = EMBER_STACK_COOLDOWN;
            if (this.player.emberStacks >= EMBER_THRESHOLD) {
              this.player.applyBurn(2.0);
              this.player.emberStacks     = 0;
              this.player.emberStackTimer = 0;
            }
            break; // one contact credit per frame regardless of how many tiles are burning
          }
        }
      }
    }

    // Generate embers from burning stuck arrows (same generator as grass fire)
    for (const arrow of this.combatSystem.getStuckArrows()) {
      if (arrow.isBurning && this.particles.length < 200) {
        if (Math.random() < deltaTime) {
          const angle = Math.random() * Math.PI * 2;
          const speed = Math.random() * 50 + 30;
          const travelDist = 32;
          this.particles.push({
            x: arrow.position.x + GRID.CELL_SIZE / 2,
            y: arrow.position.y + GRID.CELL_SIZE / 2,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 20, // Slight upward bias
            life: travelDist / speed,
            maxLife: travelDist / speed,
            char: '.',
            color: '#ff6600',
            size: 3,
            isEmber: true,
            alive: true
          });
        }
      }
    }

    // Remove destroyed objects (exterior always; interior when active)
    this.currentRoom.backgroundObjects = this.currentRoom.backgroundObjects.filter(obj => !obj.destroyed);
    this.backgroundObjects = this.currentRoom.backgroundObjects; // Update local reference
    if (this.activeFloor) {
      this.activeFloor.backgroundObjects = this.activeFloor.backgroundObjects.filter(obj => !obj.destroyed);
    }
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
      if (ingredient.dropBounceTimer > 0) {
        ingredient.dropBounceTimer = Math.max(0, ingredient.dropBounceTimer - deltaTime);
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
        // Emerald Robe: goo consumed for 1HP heal instead of going to inventory
        if (ingredient.char === 'g' && this.player.gooConsume) {
          this.player.hp = Math.min(this.player.hp + 1, this.player.maxHp);
        } else if (ingredient.char === '𝑚' && this.player.magicMeter?.active) {
          // Mana drop auto-refills the meter once the well/cauldron has
          // activated it; bypass inventory entirely.
          this.magicSystem.addMana(this.player, 2);
        } else {
          this.addIngredient(ingredient.char);
        }
        this.audioSystem?.playSFX('ingredient_pickup');
        this.physicsSystem.removeEntity(ingredient);
        this.ingredients.splice(i, 1);
      }
    }

    // EXPLORE state: No item magnetization - all items require manual pickup with SPACE
    // (Only ingredients magnetize in all game states)

    // Update idle crows (first explore room only — array is empty otherwise)
    this.updateCrows(deltaTime);

    // Companion crow: persistent across rooms, runs its own priority FSM.
    this.updateCompanionCrow(deltaTime);
    this.updateFollowerCrows(deltaTime);

    // Tamed rats: wild → bread-seek, then tamed companion movement + flee FSM,
    // then enemy attack collision against them (mirrors camp NPC damage poll).
    this.updateBreadSeekingRats();
    this.updateTamedRats(deltaTime);
    this.applyEnemyDamageToTamedRats();

    // Age and prune sound events (used for global enemy sound detection)
    for (let i = this.soundEvents.length - 1; i >= 0; i--) {
      this.soundEvents[i].lifetime -= deltaTime;
      if (this.soundEvents[i].lifetime <= 0) this.soundEvents.splice(i, 1);
    }

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

    // Check if room cleared. Hidden mimics don't block clear — they're still
    // in the enemies array, so if they reveal post-clear they fight normally,
    // but exits and clear-side effects fire on visible-enemy defeat.
    if (this._countedEnemies(this.currentRoom.enemies).length === 0) {
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

        // Pearl-guide fairy: if it's still around at room clear, the player
        // missed (or skipped) the heal/bottle touch. Reveal the pedestal so
        // they can complete the offering and unlock the blue-zone exit.
        this.revealPearlPedestal();

        // Pre-boss gate: depth 14 cleared → north-only 'B' exit + anticipation music
        const preBossZone = this.currentRoom.zone || 'green';
        const preBossDepth = this.zoneDepths[preBossZone] || 0;
        if (preBossDepth === 14 && !this.zoneSystem.defeatedBosses?.has(preBossZone)) {
          this.preBossGateActive = true;
          this.currentRoom.exits.east = null;
          this.currentRoom.exits.west = null;
          // Color MUST match the current zone's exitColor so recordExit keeps
          // the streak intact in checkZoneTransition. ExploreRenderer paints
          // the pulse from preBossGateActive, not from this stored color.
          this.currentRoom.exits.north = { letter: 'B', color: ZONES[preBossZone].exitColor };
          this.audioSystem.startBossAnticipation();
        }
      }

      // Unlock exits (letters are already generated)
      this.currentRoom.exitsLocked = false;
      // Update collision map to open exits
      this.updateExitCollisions();
    }

    // Don't process room exits while inside a maze, hut, or dungeon interior.
    // UI must still update so HP / quick-slot changes inside interiors render this frame.
    if (this.player.inMaze || this.player.inHut || this.player.inDungeon) {
      this.updateUI();
      return;
    }

    // While an exit-warp animation is running, position is owned by the
    // animation system; the player crossing back across the entry edge
    // during the inbound tween must not re-trigger detection.
    if (this.animationSystem.isAnimating(this.player)) {
      this.updateUI();
      return;
    }

    // Check for exits (with crossing detection for fast dodge rolls)
    const gridPos = this.player.getGridPosition();
    const prevGridPos = {
      x: Math.floor(this.previousPlayerPosition.x / GRID.CELL_SIZE),
      y: Math.floor(this.previousPlayerPosition.y / GRID.CELL_SIZE)
    };
    const centerX = Math.floor(GRID.COLS / 2);
    const centerY = Math.floor(GRID.ROWS / 2);

    // Pixel thresholds are 10px tighter than the row/col cell boundary so the
    // warp animation only fires once the player is well inside the exit lane.
    const northThreshold = GRID.CELL_SIZE * 3 - 10;
    const southThreshold = (GRID.ROWS - 2) * GRID.CELL_SIZE + 10;
    const westThreshold = GRID.CELL_SIZE * 2 - 10;
    const eastThreshold = (GRID.COLS - 2) * GRID.CELL_SIZE + 10;
    const playerPx = this.player.position;
    const prevPx = this.previousPlayerPosition;

    // North exit check (warp zone is at rows 1-2, below the wall)
    const inNorthExit = playerPx.y < northThreshold && gridPos.x === centerX;
    const crossedNorthExit = prevPx.y >= northThreshold && playerPx.y < northThreshold && gridPos.x === centerX;
    if ((inNorthExit || crossedNorthExit) && this.currentRoom.exits.north && (!this.currentRoom.exitsLocked || this.player.polymorphCursed) && (this.player.plane ?? 0) === 0) {
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

      // Secret pattern may route to a neutral room (e.g. D-R-A-W → drawRoom)
      if (secret?.neutralScript) {
        this.transitionToNeutralRoom(secret.neutralScript);
        return;
      }

      // If exit has a neutralScript, route to neutral room instead of explore
      if (exitObj?.neutralScript) {
        this.transitionToNeutralRoom(exitObj.neutralScript);
        return;
      }

      // If exit forces a specific zone (e.g. ridge north → gray zone), prime ZoneSystem
      if (exitObj?.forceZone) {
        this.zoneSystem.forceNextZone(exitObj.forceZone);
      }

      this.animateExitWarp('north', () => {
        this.enterExploreState('north', exitObj, secret?.pattern);
      });
    }
    // South exit check
    else {
      const inSouthExit = playerPx.y >= southThreshold && gridPos.x === centerX;
      const crossedSouthExit = prevPx.y < southThreshold && playerPx.y >= southThreshold && gridPos.x === centerX;

      // South exit opens if: 1) exits unlocked, 2) player has no items (escape route), OR 3) south exit exists
      const canUseSouthExit = this.currentRoom.exits.south && (!this.currentRoom.exitsLocked || this.playerHasNoItems() || this.player.polymorphCursed) && (this.player.plane ?? 0) === 0;

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

        this.animateExitWarp('south', () => {
          this.stateMachine.transition(GAME_STATES.REST);
        });
        // Don't reset depth - it should persist to show max depth reached
      }
      // East exit check (right border, centered vertically)
      else {
        const inEastExit = playerPx.x >= eastThreshold && gridPos.y === centerY;
        const crossedEastExit = prevPx.x < eastThreshold && playerPx.x >= eastThreshold && gridPos.y === centerY;
        if ((inEastExit || crossedEastExit) && this.currentRoom.exits.east && (!this.currentRoom.exitsLocked || this.player.polymorphCursed) && (this.player.plane ?? 0) === 0) {
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

          if (secret?.neutralScript) {
            this.transitionToNeutralRoom(secret.neutralScript);
            return;
          }
          if (exitObj?.neutralScript) {
            this.transitionToNeutralRoom(exitObj.neutralScript);
            return;
          }

          // If exit forces a specific zone, prime ZoneSystem
          if (exitObj?.forceZone) {
            this.zoneSystem.forceNextZone(exitObj.forceZone);
          }

          this.animateExitWarp('east', () => {
            this.enterExploreState('east', exitObj, secret?.pattern);
          });
        }
        // West exit check (left border, centered vertically)
        else {
          const inWestExit = playerPx.x < westThreshold && gridPos.y === centerY;
          const crossedWestExit = prevPx.x >= westThreshold && playerPx.x < westThreshold && gridPos.y === centerY;
          if ((inWestExit || crossedWestExit) && this.currentRoom.exits.west && (!this.currentRoom.exitsLocked || this.player.polymorphCursed) && (this.player.plane ?? 0) === 0) {
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

            if (secret?.neutralScript) {
              this.transitionToNeutralRoom(secret.neutralScript);
              return;
            }
            if (exitObj?.neutralScript) {
              this.transitionToNeutralRoom(exitObj.neutralScript);
              return;
            }

            // If exit forces a specific zone, prime ZoneSystem
            if (exitObj?.forceZone) {
              this.zoneSystem.forceNextZone(exitObj.forceZone);
            }

            this.animateExitWarp('west', () => {
              this.enterExploreState('west', exitObj, secret?.pattern);
            });
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

    // EXPLORE (and ARCADE_DEMO, which drives the explore loop with prerecorded inputs)
    if (state === GAME_STATES.EXPLORE || state === GAME_STATES.ARCADE_DEMO) {

      // Polymorphed frog: SPACE fires tongue attack, all other EXPLORE actions suppressed.
      // Exception: allow interior exit handling so a frogged player can leave a hut/dungeon/maze.
      if (this.player?.polymorphed) {
        if (this.player.inDungeon && this.dungeonSystem?.handleSpacePress()) return;
        if (this.player.inHut && this.hutSystem?.handleSpacePress()) return;
        if (this.player.inMaze && this.mazeSystem?.handleSpacePress()) return;
        this.polymorphSystem.createTongueAttack(this);
        return;
      }

      // Item pickup takes precedence over interior-system interactions.
      // Items can land on top of pressable/spacebar objects (press, well,
      // pedestals) and the player almost always wants to grab the item first.
      // Mirrors the lower-block pickup check at the captive/attack tier.
      const hasNearbyItemTop = this.items.some(
        item => this.physicsSystem.getDistance(this.player, item) < 20
      );
      if (hasNearbyItemTop) {
        this.tryPickupItem();
        return;
      }

      // Interior systems: dungeon entry/exit/staircase/item-slot, hut entry/exit, maze entry/object interaction
      if (this.dungeonSystem?.handleSpacePress()) return;
      if (this.pressSystem?.handleSpacePress()) return;
      if (this.hutSystem?.handleSpacePress()) return;
      if (this.mazeSystem?.handleSpacePress()) return;
      if (this.wellSystem?.handleSpacePress()) return;
      if (this.campNPCSystem?.handleSpacePress()) return;
      if (this.handlePearlPedestalSpace()) return;
      if (this.handlePearlCachePedestalSpace()) return;
      if (this.wireSystem?.handleSpacePress()) return;

      // Bridge donation menu
      if (this.currentRoom?.type === ROOM_TYPES.RIDGE && !this.currentRoom?.bridgeBuilt) {
        if (this.bridgeMenuOpen) {
          // SPACE while menu open: donate then close
          this.ridgeSystem.donateAvailable();
          this.ridgeSystem.closeMenu();
          return;
        }
        if (this.ridgeSystem.getWorkerDistance() < this.ridgeSystem.CLOSE_RANGE) {
          this.ridgeSystem.openMenu();
          return;
        }
      }
      // Safety: close bridge menu if somehow still open outside RIDGE context
      if (this.bridgeMenuOpen) {
        this.ridgeSystem.closeMenu();
        return;
      }

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

      // NPC interactions (errand traveler + wise fellow). Resolve which list
      // to scan once — interior NPCs live on activeFloor.npcs; surface NPCs on
      // neutralCharacters.
      const npcArray = this.player.inHut && this.activeFloor
        ? this.activeFloor.npcs
        : this.neutralCharacters;

      // Artifact → wise fellow: consume ⚱, unlock rare-tier hint for this zone.
      // Checked before the errand path so the wise man (when nearby) wins the
      // give; they're in different rooms in practice so this only matters when
      // both flows exist within the same hut.
      if (npcArray) {
        for (const npc of npcArray) {
          if (!(npc instanceof WiseFellow)) continue;
          const dist = Math.hypot(
            this.player.position.x - npc.position.x,
            this.player.position.y - npc.position.y
          );
          if (dist > GRID.CELL_SIZE * 2) continue;
          const idx = this.player.inventory.indexOf('⚱');
          if (idx === -1) continue;
          this.player.inventory.splice(idx, 1);
          npc.unlockRareHint(this.currentRoom?.zone || 'green');
          return;
        }
      }

      // Artifact → errand traveler: consume ⚱, spawn 2 coin ingredients at NPC.
      // Side trade — does not advance or alter the active stage errand.
      const artifactResult = this.errandSystem.tryGiveArtifact(this.player, npcArray);
      if (artifactResult) {
        for (let i = 0; i < artifactResult.coins; i++) {
          const angle = (i / artifactResult.coins) * Math.PI * 2 + Math.random() * 0.4;
          this.lootSystem.spawnIngredientDrop('c', artifactResult.x, artifactResult.y, angle, null);
        }
        return;
      }

      // Errand traveler interaction (SPACE = give item/ingredient)
      const giveResult = this.errandSystem.checkGive(this.player, npcArray);
      if (giveResult) {
        const rewardItem = new Item(giveResult.rewardChar, giveResult.x, giveResult.y);
        if (this.activeFloor) rewardItem.hutPlane = true;
        this.items.push(rewardItem);
        this.physicsSystem.addEntity(rewardItem);
        return;
      }

      // Try to unlock vault if player is in position with key
      if (this.canUnlockVault()) {
        this.unlockVault();
        return;
      }

      // Detonate any placed remote bombs (takes priority over new throw)
      const hasRemoteBombs = this.placedTraps.some(e => e.item.data.remoteTrigger);
      if (hasRemoteBombs) {
        this.trapSystem.detonateRemoteBombs();
        return;
      }

      // SPACE places/arms the trap at the player's feet. (Wires were already
      // handled earlier via wireSystem.handleSpacePress.) Skip if a ground item
      // is nearby — pickup wins to avoid trapping over a pickup.
      const hasNearbyPickup = this.items.some(
        item => this.physicsSystem.getDistance(this.player, item) < 20
      );
      if (this.player.canUseTrap() && !hasNearbyPickup) {
        this.trapSystem.placeTrap();
        return;
      }
    }

    if (state === GAME_STATES.GAME_OVER) {
      // If a spell just entered awaiting state (e.g. REVIVE waiting for YES), hold off
      if (this.spellSystem.awaitingSpell !== null) return;

      if (this.characterDeathPending && this.characterDeathTimer <= 0) {
        // A character died but others remain — swap to next character and return to REST
        this.characterDeathPending = false;
        this.gameOverWaitingForSpace = false;
        this._resetEnvironmentalEffects();

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
        this.audioSystem.play();
        this.stateMachine.transition(GAME_STATES.REST);
      } else if (this.gameOverWaitingForSpace && this.gameOverDeathTimer <= 0 && !this.characterDeathPending) {
        // True game over — full reset
        this.gameOverWaitingForSpace = false;

        // Reset wish/slot state for fresh run
        this.wishesUsed = 0;
        this._savedDestroyedSlots = [false, false, false];
        if (this.player) this.player.destroyedSlots = [false, false, false];
        this._resetEnvironmentalEffects();

        // Reset all zone depths on death
        this.zoneDepths = {
          green: 0,
          red: 0,
          cyan: 0,
          yellow: 0,
          gray: 0
        };
        this.currentMusicZone = 'green';

        // Clear held items on death (but keep crafting slots)
        this.inventorySystem.restQuickSlots = [null, null, null];
        this.inventorySystem.restActiveSlotIndex = 0;

        // Clear all inventories and equipment on death (true roguelike)
        this.inventorySystem.handleGameOver();

        // Reset learned spells for new run
        this.knownSpells = new Set();

        // Reset magic meter — must be re-activated via well or cauldron each run
        if (this.player?.magicMeter) {
          this.player.magicMeter = { active: false, slots: [], current: 0, max: 10 };
        }
        this._savedMagicMeter = null;

        // Reset well ritual state (any in-flight coin or lingering flash)
        this.wellCoinAnim = null;
        this.wellFlashTimer = 0;
        this.wellFlashDuration = 0;

        // Reset fairy run-flag for new run
        this.fairiesAngered = false;
        this.fedCrowCount = 0;
        this.companionCrows = [];
        this.followerCrows = [];
        this.tamedRats = [];

        // Reset character system for new run
        this.deadCharacters = [];
        this.activeCharacterType = 'default';
        this.unlockedCharacters = ['default']; // Reset to only default character
        this.captives = []; // Clear active captives
        this.characterNPCs = []; // Clear character NPCs in REST
        this.errandSystem.resetOnDeath();
        this.zoneSystem.resetOnDeath(); // Reset zone system and captive tracking
        this.bossSystem.deactivate();   // Clean up any active boss fight
        // Reset boss music and pre-boss gate state for new run
        this.preBossGateActive = false;
        if (this.audioSystem.mode === 'sequence' || this.audioSystem.bossAnticipationActive) {
          this.audioSystem.stopBossMusic();
        }

        // Clear crafting slots and wipe localStorage save
        this.craftingSystem.setState({ leftSlot: null, rightSlot: null, centerSlot: null });
        this.craftingSystem.resetDiscoveries();
        this.persistenceSystem.clearSave();

        // Reset starter bundle so a fresh one spawns on new run
        this.restBundle = null;
        this.hasLeftRestOnce = false;

        // Clear companion so a stale hired NPC doesn't carry over to the next run
        this.companion = null;

        if (this.player) {
          this.player.reset();
        }
        const audioBase = import.meta.env.BASE_URL;
        this.audioSystem.hardResetDualLayers(
          `${audioBase}assets/audio/layer1.mp3`,
          `${audioBase}assets/audio/layer2.mp3`
        );
        this.stateMachine.transition(GAME_STATES.REST);
      }
      return;
    }

    if (state === GAME_STATES.REST) {
      // Close any open popup on SPACE
      if (this.tombstonePopup) {
        this.menuSystem.closeTombstonePopup();
        return;
      }
      if (this.slotPopup) { this.slotPopup = null; return; }

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
            ing.pickupCooldown = 0.25;
            this.ingredients.push(ing);
            this.physicsSystem.addEntity(ing);
          }
          this.restBundle = null;
          return;
        }
      }

      const nearestSlot = this.getNearestInteractiveSlot();

      if (nearestSlot) {
        if (this.menuSystem.triggerSlotPopup(nearestSlot)) return;
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

      // Check tombstone interaction
      if (this.tombstoneActive && this.lastDeathCause) {
        const tombX = (GRID.COLS - 4) * GRID.CELL_SIZE + GRID.CELL_SIZE / 2;
        const tombY = 2 * GRID.CELL_SIZE + GRID.CELL_SIZE / 2;
        const dist = Math.hypot(this.player.position.x - tombX, this.player.position.y - tombY);
        if (dist < GRID.CELL_SIZE * 3) {
          this.menuSystem.triggerTombstonePopup();
          return;
        }
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
          this._emitSoundEvent();
        }
      }
    } else if (state === GAME_STATES.EXPLORE || state === GAME_STATES.ARCADE_DEMO) {
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

      // Spacebar-openable containers (barrels, crates, metal boxes) supersede
      // attacking — opening should work whether or not the player is armed.
      const nearbyContainer = this.findNearbyBackgroundObject();
      if (nearbyContainer && nearbyContainer.acceptsInteraction('spacebar') && nearbyContainer.data.dropEffect) {
        this.interactionSystem.openContainer(nearbyContainer);
        return;
      }

      // If player has a weapon and can attack, attack
      if (this.player.heldItem && !this.captiveInteractionThisFrame && this.player.canAttack()) {
        // Gem wands gate the charge on mana availability before useHeldItem starts charging.
        if (this.player.heldItem.data?.gemWand && !this.magicSystem.tryStartCharge(this.player)) {
          return;
        }
        // Bread is a targeted feed, not a free drop. Without an eligible
        // eater in the current room, SPACE is a no-op (loaf stays in the slot).
        if (this.player.heldItem.data?.effect === 'dropBread'
            && !this.hasBreadEligibleTarget()) {
          return;
        }
        // Attack — melee AoE handles object damage directly via CombatSystem
        this.attackSequenceActive = true; // Mark that attack was initiated by button press (even if windup delays it)
        const wasBowCharging = this.player.heldItem.data.weaponType === 'BOW' && this.player.heldItem.isCharging;
        const wasGemCharging = this.player.heldItem.data?.gemWand && this.player.heldItem.isCharging;
        const attack = this.player.useHeldItem();
        // Play bow charge SFX when charging begins (use() sets isCharging on first press)
        if (!wasBowCharging && this.player.heldItem && this.player.heldItem.data.weaponType === 'BOW' && this.player.heldItem.isCharging) {
          this.audioSystem.playStoppableSFX('charge_bow');
        }
        // Gem-wand charge SFX, stretched to match this wand's chargeTime.
        if (!wasGemCharging && this.player.heldItem?.data?.gemWand && this.player.heldItem.isCharging) {
          this.audioSystem.playStoppableSFXStretched('wand_charge', this.player.heldItem.data.chargeTime);
        }
        if (attack) {
          // Bread "use" is really a drop: spawn the loaf at the player's feet
          // and skip the attack pipeline. The slot was already cleared inside
          // Player.useHeldItem because the result was { consumed: true }.
          if (attack.dropBread) {
            this.dropBreadAtPlayer();
          } else {
            // Debug logging for wands
            if (this.player.heldItem && this.player.heldItem.data.weaponType === 'WAND') {
              const enemies = this.currentRoom ? this.currentRoom.enemies : [];
            }
            this.combatSystem.createAttack(this.applyGreenDamageModifier(attack), this.currentRoom ? this.currentRoom.enemies : []);
            this.triggerGreenActionCooldown();
          }
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

    if (state === GAME_STATES.EXPLORE || state === GAME_STATES.ARCADE_DEMO) {
      // Close bridge menu on SHIFT (no donation)
      if (this.bridgeMenuOpen) {
        this.ridgeSystem.closeMenu();
        return;
      }

      // Dungeon item slot: SHIFT deposits active weapon into sacrifice slot (unlocks stairs)
      if (this.player.inDungeon && this.dungeonSystem?.handleShiftPress()) return;

      const held = this.player.heldItem;
      if (held) {
        // SHIFT charges a throw for any held slot item. Throwing IS dropping —
        // the item leaves the slot and lands on the ground. Traps arm where they
        // land; weapons and wires land as pickups. Placement/arming for traps
        // also happens on SPACE.
        this.trapSystem.startTrapCharge();
      }
    }

    this.updateUI();
  }

  // Mirror of the SPACE keyup release logic, factored out so DemoSystem
  // playback can fire the same effects (bow release, fishing release, trap
  // throw release, staff block release) that the keyboard pipeline does.
  handleSpaceRelease() {
    this.attackSequenceActive = false;

    if (this.player) {
      if (this.player.isStaffBlocking) {
        this._releaseStaffBlock(this.player);
      }
      this.player.staffSwingHasFired = false;
    }

    if (this.fishingSystem && this.fishingSystem.state === this.fishingSystem.STATES.CHARGING) {
      this.fishingSystem.releaseCharge(this);
    }

    if (this.trapCharging && this.player?.heldItem?.data?.type === 'TRAP') {
      this.trapSystem.releaseTrapThrow();
    }

    if (this.player && this.player.heldItem && this.player.heldItem.isCharging) {
      if (this.player.heldItem.data?.gemWand) {
        this.magicSystem.handleSpaceRelease(this.player);
      } else if (this.player.heldItem.data?.chargeHammer) {
        this.player.heldItem.releaseChargeHammer();
      } else {
        this.audioSystem.stopSFXByName('charge_bow');
        if (this.player.canAttack()) {
          const attack = this.player.heldItem.releaseBow();
          if (attack) {
            this.combatSystem.createAttack(this.applyGreenDamageModifier(attack), this.currentRoom ? this.currentRoom.enemies : []);
            this.triggerGreenActionCooldown();
            this._emitSoundEvent();
          }
        }
      }
    }
  }

  // Mirror of the SHIFT keyup release logic — fires the weapon throw that
  // handleShiftPress armed via trapSystem.startTrapCharge().
  handleShiftRelease() {
    if (this.trapCharging && this.player?.heldItem?.data?.type !== 'TRAP') {
      this.trapSystem.releaseTrapThrow();
    }
  }

  handleSelectSlot(index) {
    const state = this.stateMachine.getCurrentState();
    if (state !== GAME_STATES.EXPLORE && state !== GAME_STATES.REST && state !== GAME_STATES.NEUTRAL) return;
    if (this.player.destroyedSlots?.[index]) return; // can't select a destroyed slot

    if (index !== this.player.activeSlotIndex) {
      this.player.heldItem?.cancelChargeAndReload?.();
    }
    this.player.activeSlotIndex = index;
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
      // Add ingredient to active pool (banked in REST, carried in EXPLORE)
      this.addIngredient(char);
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

  // Debug: drop a background object (e.g. a deflector rock) at the player's
  // cell. Runtime-spawned, so it isn't baked into collisionMap — fine for
  // testing boulder routing, which reads game.backgroundObjects directly.
  spawnCheatObject(objChar) {
    if (!this.currentRoom) return;
    const C = GRID.CELL_SIZE;
    const col = Math.floor((this.player.position.x + C / 2) / C);
    const row = Math.floor((this.player.position.y + C / 2) / C);
    const obj = new BackgroundObject(objChar, col * C, row * C);
    this.currentRoom.backgroundObjects.push(obj);
    this.backgroundObjects = this.currentRoom.backgroundObjects;
    this.renderer.markBackgroundDirty();
    console.log(`[CHEAT] Placed object '${objChar}' at cell ${col},${row}`);
  }

  spawnCheatEnemy(enemyData) {
    const state = this.stateMachine.getCurrentState();
    if (state !== GAME_STATES.EXPLORE) {
      console.log('[CHEAT] ⚠ Enemy spawn only works in EXPLORE mode.');
      return;
    }
    const { char, name } = enemyData;
    const room = this.currentRoom;
    const pos = this.findSpawnPosition(
      this.player.position,
      GRID.CELL_SIZE * 6,
      room.collisionMap,
      room.enemies
    );
    if (!pos) {
      console.log(`[CHEAT] ⚠ No spawn position found for ${name}`);
      return;
    }
    const enemy = new Enemy(char, pos.x, pos.y, this.currentDepth);
    enemy.setCollisionMap(room.collisionMap);
    enemy.setBackgroundObjects(room.backgroundObjects);
    enemy.setSteamClouds(this.steamClouds);
    enemy.setTarget(this.player);
    enemy.setGame(this);
    enemy.setRoom(room);
    this.physicsSystem.addEntity(enemy);
    room.enemies.push(enemy);
    console.log(`[CHEAT] ✓ Spawned ${name} (${char})`);
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
    const playerPos = { x: this.player.position.x, y: this.player.position.y };
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
    this.campNPCSystem?.registerWithPhysics(this.physicsSystem);
    this.registerTamedRatsWithPhysics();

    // Reset combat system
    this.combatSystem.clear();

    // Mark background dirty for redraw
    this.renderer.markBackgroundDirty();

    // Switch music if entering/leaving a zone with custom music
    if (this.audioSystem.mode === 'dual' || this.audioSystem.mode === 'red') {
      const base = import.meta.env.BASE_URL;
      if (targetZone === 'red' && this.currentMusicZone !== 'red') {
        if (this.audioSystem.switchToRedSequence()) {
          this.currentMusicZone = 'red';
        }
      } else if (targetZone === 'cyan' && this.currentMusicZone !== 'cyan') {
        this.currentMusicZone = 'cyan';
        this.audioSystem.switchMusic(
          `${base}assets/audio/cyan-layer1.mp3`,
          `${base}assets/audio/cyan-layer2.mp3`
        );
      } else if (targetZone !== 'cyan' && targetZone !== 'red'
                 && (this.currentMusicZone === 'cyan' || this.currentMusicZone === 'red')) {
        this.currentMusicZone = 'green';
        this.audioSystem.switchMusic(
          `${base}assets/audio/layer1.mp3`,
          `${base}assets/audio/layer2.mp3`
        );
      }
    }

    // Update UI
    this.updateUI();

    console.log(`[CHEAT] ✓ Teleported to ${targetZone} zone at depth ${this.getCurrentZoneDepth()}`);
  }

  handleDepthJump(depth) {
    const state = this.stateMachine.getCurrentState();
    if (state !== GAME_STATES.EXPLORE) {
      console.log('[CHEAT] ⚠ Depth jump only works during EXPLORE mode. Exit REST first.');
      return;
    }

    const currentZone = this.zoneSystem.currentZone;
    this.zoneDepths[currentZone] = depth;
    this.roomGenerator.setDepth(depth);
    this.preBossGateActive = false;
    this.bossSystem.deactivate();

    // Generate a fresh room at the target depth (same zone, no forced room type)
    const playerPos = { x: this.player.position.x, y: this.player.position.y };
    const newRoom = this.roomGenerator.generateRoom(null, playerPos, currentZone, null);

    // Replace current room
    this.currentRoom = newRoom;
    this.player.setCollisionMap(newRoom.collisionMap);
    this.backgroundObjects = newRoom.backgroundObjects;

    for (const enemy of newRoom.enemies) {
      enemy.setTarget(this.player);
      enemy.setCollisionMap(newRoom.collisionMap);
    }

    // Grace period so enemies don't immediately attack
    this.roomEntryGraceTimer = 2.0;
    for (const enemy of newRoom.enemies) {
      enemy.graceTimer = this.roomEntryGraceTimer;
    }

    // Reset interior state
    this.player.inHut = false;
    this.player.inMaze = false;
    this.player.inDungeon = false;
    this.activeFloor = null;
    this.mazeInterior = null;
    this.items = [];
    this.captives = [];
    this.neutralCharacters = [];

    this.physicsSystem.clear();
    this.physicsSystem.addEntity(this.player);
    for (const enemy of newRoom.enemies) {
      this.physicsSystem.addEntity(enemy);
    }
    this.campNPCSystem?.registerWithPhysics(this.physicsSystem);
    this.registerTamedRatsWithPhysics();
    this.combatSystem.clear();
    this.renderer.markBackgroundDirty();
    this.updateUI();

    console.log(`[CHEAT] ✓ Depth jump → L${depth} in ${currentZone} zone`);
  }

  handleBossTest(targetZone) {
    const state = this.stateMachine.getCurrentState();
    if (state !== GAME_STATES.EXPLORE) {
      console.log('[CHEAT] ⚠ Boss test only works during EXPLORE mode. Exit REST first.');
      return;
    }

    // Deactivate any existing boss fight
    this.bossSystem.deactivate();

    // Set zone + depth so isBossReady() returns true
    this.zoneSystem.currentZone = targetZone;
    const bossDepth = ZONES[targetZone]?.bossDepth ?? 15;
    this.zoneDepths[targetZone] = bossDepth;
    this.roomGenerator.setDepth(bossDepth);

    // Generate boss room directly
    this.roomGenerator.isZoneBossRoom = true;
    const playerPos = { x: this.player.position.x, y: this.player.position.y };
    const newRoom = this.roomGenerator.generateRoom(ROOM_TYPES.BOSS, playerPos, targetZone, null);
    this.roomGenerator.isZoneBossRoom = false;

    // Replace current room
    this.currentRoom = newRoom;
    this.backgroundObjects = newRoom.backgroundObjects;

    // Activate boss
    this.bossSystem.activate(newRoom, targetZone);

    // Wire up entities
    for (const enemy of newRoom.enemies) {
      enemy.setTarget(this.player);
      enemy.setCollisionMap(newRoom.collisionMap);
    }
    this.player.setCollisionMap(newRoom.collisionMap);

    // Setup grace period
    this.roomEntryGraceTimer = 2.0;

    // Reset systems
    this.physicsSystem.clear();
    this.physicsSystem.addEntity(this.player);
    for (const enemy of newRoom.enemies) {
      this.physicsSystem.addEntity(enemy);
    }
    this.campNPCSystem?.registerWithPhysics(this.physicsSystem);
    this.registerTamedRatsWithPhysics();
    this.combatSystem.clear();
    this.renderer.markBackgroundDirty();
    this.updateUI();

    console.log(`[CHEAT] ✓ Boss test: ${targetZone} zone boss spawned`);
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

    // Apply room-declared spawn zone if present (e.g. underground clearings)
    if (newRoom.spawnZones) {
      const zone = newRoom.spawnZones.default;
      if (zone) {
        this.player.position.x = zone.x;
        this.player.position.y = zone.y;
      }
    }

    this.player.setCollisionMap(newRoom.collisionMap);
    this.backgroundObjects = newRoom.backgroundObjects || [];
    this.items = newRoom.items || [];
    this.placedTraps = [];
    this.activeNoiseSource = null;
    this._resetEnvironmentalEffects();
    this.captives = [];
    this.neutralCharacters = [];
    this.bridgeMenuOpen = false;

    // Ridge room: push bridge worker if not yet built
    if (newRoom.type === ROOM_TYPES.RIDGE) {
      this.ridgeSystem.attachToRoom(newRoom);
      if (newRoom.bridgeWorker && !newRoom.bridgeBuilt) {
        this.neutralCharacters.push(newRoom.bridgeWorker);
      }
    }

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
    this.campNPCSystem?.registerWithPhysics(this.physicsSystem);
    this.registerTamedRatsWithPhysics();

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
    const savedDestroyedSlots = this.player ? [...this.player.destroyedSlots] : [...this._savedDestroyedSlots];

    // Generate maze room first
    const centerX = GRID.WIDTH / 2;
    const startY = (GRID.ROWS - 3) * GRID.CELL_SIZE;
    this.currentRoom = this.roomGenerator.generateRoom(ROOM_TYPES.MAZE, { x: centerX, y: startY });

    // Create player at south entrance
    this.player = new Player(centerX, startY);
    this.player.godMode = this.cheatMenu.godMode;
    this.player.setCollisionMap(this.currentRoom.collisionMap);

    // Restore state
    this.player.quickSlots = savedQuickSlots;
    this.player.activeSlotIndex = savedActiveSlotIndex;
    this.player.destroyedSlots = savedDestroyedSlots;
    if (savedHp !== null) this.player.hp = savedHp;

    // Setup room entities (sync with room's state)
    this.ingredients = [];
    this.items = this.currentRoom.items || [];
    this.placedTraps = [];
    this.activeNoiseSource = null;
    this.backgroundObjects = this.currentRoom.backgroundObjects || [];
    this._resetEnvironmentalEffects();

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
    this.campNPCSystem?.registerWithPhysics(this.physicsSystem);
    this.registerTamedRatsWithPhysics();

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

      if (result.pickedUpType === 'WEAPON' && this.stateMachine.currentState === GAME_STATES.EXPLORE) {
        this.audioSystem.playSFX('weapon_pickup');
      }

      // Displaced item routes to REST chest instead of being dropped on the ground
      if (result.droppedItem) {
        this.inventorySystem.addToChest(result.droppedItem);
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
    // Escape route: south wall must be physically passable when the room is
    // locked but the player has no items (matches the renderer's open-door
    // visual at ExploreRenderer.js — otherwise the player walks into an
    // invisible wall at row ROWS-1 col centerX).
    if (this.currentRoom?.exits?.south && this.currentRoom.exitsLocked && this.playerHasNoItems()) {
      const centerX = Math.floor(GRID.COLS / 2);
      this.currentRoom.collisionMap[GRID.ROWS - 1][centerX] = false;
      if (!this.player.inMaze && !this.player.inHut && !this.player.inDungeon) {
        this.player.setCollisionMap(this.currentRoom.collisionMap);
      }
    }
  }

  findNearbyBackgroundObject() {
    return this.interactionSystem.findNearbyBackgroundObject();
  }

  interactWithObject(obj) {
    this.interactionSystem.interactWithObject(obj);
    this._emitSoundEvent();
  }

  handleObjectEffect(effect, obj, attack = null) {
    this.interactionSystem.handleObjectEffect(effect, obj, attack);
  }

  spawnLoot(enemy) {
    this.lootSystem.spawnLoot(enemy);
  }

  spawnIngredientDrop(char, x, y, angle = null, source = null) {
    return this.lootSystem.spawnIngredientDrop(char, x, y, angle, source);
  }

  spawnItemDrop(char, x, y, angle = null, source = null) {
    return this.lootSystem.spawnItemDrop(char, x, y, angle, source);
  }


  findSpawnPosition(center, range, collisionMap, enemies) {
    return this.roomGenerator.findSpawnPosition(center, range, collisionMap, enemies);
  }

  /**
   * Execute a CLEANSE wish — destroys all non-player, non-background entities,
   * consumes one wish, and permanently destroys the highest available quick slot.
   */
  executeCleanse() {
    if (this.wishesUsed >= 3) return;

    // Consume one wish and destroy the corresponding quick slot (0→1→2 as wishes used)
    const slotIdx = this.wishesUsed; // wish 1 → slot 0, wish 2 → slot 1, wish 3 → slot 2
    this.wishesUsed++;

    this._savedDestroyedSlots[slotIdx] = true;
    if (this.player) {
      // Move item to an empty slot before destroying this one
      const item = this.player.quickSlots[slotIdx];
      if (item) {
        const emptySlot = this.player.quickSlots.findIndex(
          (s, i) => i !== slotIdx && s === null && !this.player.destroyedSlots[i]
        );
        if (emptySlot !== -1) this.player.quickSlots[emptySlot] = item;
      }
      this.player.quickSlots[slotIdx] = null;
      this.player.destroyedSlots[slotIdx] = true;
      // Shift active slot away from any destroyed slot
      if (this.player.destroyedSlots[this.player.activeSlotIndex]) {
        const next = this.player.quickSlots.findIndex((_, i) => !this.player.destroyedSlots[i]);
        if (next !== -1) this.player.activeSlotIndex = next;
      }
    }

    // Clear all non-player, non-background entities
    if (this.currentRoom) {
      this.currentRoom.enemies = [];
    }
    this.combatSystem.clear();
    this._resetEnvironmentalEffects();
    this.items = [];
    this.ingredients = [];

    // Play wave animation
    this.cleanseWave = { startTime: performance.now(), duration: 1400 };

    this.renderController.screenShake.trigger();
    this.updateUI();
  }

  /**
   * Execute a REVIVE wish — consumes a wish and continues the current fight
   * in place without resetting the room. Zone depths, run state, and all
   * living enemies are preserved.
   */
  executeRevive() {
    if (this.wishesUsed >= 3) return;
    if (this.stateMachine.getCurrentState() !== GAME_STATES.GAME_OVER) return;

    // Consume a wish and destroy a slot (same order as CLEANSE: 0→1→2)
    const slotIdx = this.wishesUsed;
    this.wishesUsed++;

    this._savedDestroyedSlots[slotIdx] = true;
    if (this.player) {
      // Move item to an empty slot before destroying this one
      const item = this.player.quickSlots[slotIdx];
      if (item) {
        const emptySlot = this.player.quickSlots.findIndex(
          (s, i) => i !== slotIdx && s === null && !this.player.destroyedSlots[i]
        );
        if (emptySlot !== -1) this.player.quickSlots[emptySlot] = item;
      }
      this.player.quickSlots[slotIdx] = null;
      this.player.destroyedSlots[slotIdx] = true;
      // Shift active slot away from any destroyed slot
      if (this.player.destroyedSlots[this.player.activeSlotIndex]) {
        const next = this.player.quickSlots.findIndex((_, i) => !this.player.destroyedSlots[i]);
        if (next !== -1) this.player.activeSlotIndex = next;
      }
    }
    // Clear the REST-saved slot so enterRestState() won't restore an item into it
    if (this.inventorySystem.restQuickSlots) {
      this.inventorySystem.restQuickSlots[slotIdx] = null;
    }
    // Sanitize restActiveSlotIndex so enterRestState() doesn't restore a destroyed slot as active
    if (this._savedDestroyedSlots[this.inventorySystem.restActiveSlotIndex ?? 0]) {
      const next = this._savedDestroyedSlots.findIndex(d => !d);
      this.inventorySystem.restActiveSlotIndex = next !== -1 ? next : 0;
    }

    // If a character-death swap was pending, undo it — the revived run continues with this character
    if (this.characterDeathPending) {
      const deadIdx = this.deadCharacters.indexOf(this.activeCharacterType);
      if (deadIdx !== -1) this.deadCharacters.splice(deadIdx, 1);
      this.characterDeathPending = false;
      this.characterDeathTimer = 0;
      this.pendingNextCharacter = null;
      this.characterDeathName = '';
    }

    // Restore player at half HP with a brief invulnerability window
    if (this.player) {
      this.player.hp = Math.ceil(this.player.maxHp * 0.5);
      this.player.invulnerabilityTimer = 5.0;
      this.player.velocity.vx = 0;
      this.player.velocity.vy = 0;
      this.player._killedByGhost = false;
    }

    // Clear death screen state
    this.gameOverWaitingForSpace = false;
    this.gameOverDeathTimer = 0;

    // Clear death explosion particles (leave environmental debris)
    this.particles = [];

    // Reactivate boss AI if the player died in a boss room
    if (this.currentRoom?.isBossRoom) {
      this.bossSystem.reactivate(this.currentRoom);
    }

    // Resume music
    this.audioSystem.play();

    // Force background redraw
    this.renderer.markBackgroundDirty();

    // Return to EXPLORE without regenerating the room (bypass the state handler)
    this.stateMachine.currentState = GAME_STATES.EXPLORE;

    this.renderController.screenShake.trigger();
    this.updateUI();
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

  // Active ingredient pool by state:
  //   REST    → banked (inventorySystem.restInventory, the crafting table)
  //   else    → unbanked carried (player.inventory)
  // Crafting/mana menus and the Tab overlay use this so banked ingredients
  // remain available in REST without polluting the unbanked "I" count.
  getActiveIngredients() {
    if (this.stateMachine.getCurrentState() === GAME_STATES.REST) {
      return this.inventorySystem.restInventory;
    }
    return this.player?.inventory ?? [];
  }

  addIngredient(char) {
    // Coins live in a passive wallet, not in either ingredient pool, so they
    // remain spendable at wells / NPCs / crafting even after banking.
    if (char === 'c') {
      this.inventorySystem.addCoin();
      return;
    }
    if (this.stateMachine.getCurrentState() === GAME_STATES.REST) {
      this.inventorySystem.restInventory.push(char);
    } else if (this.player) {
      this.player.addIngredient(char);
    }
  }

  removeIngredient(char) {
    if (char === 'c') {
      this.inventorySystem.removeCoin();
      return;
    }
    const pool = this.getActiveIngredients();
    const idx = pool.indexOf(char);
    if (idx > -1) pool.splice(idx, 1);
  }

  render(alpha) {
    this.renderController.applyShake();
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
    } else if (state === GAME_STATES.ARCADE_DEMO) {
      this.renderController.renderDemoState(this);
    }

    if (state !== GAME_STATES.TITLE && state !== GAME_STATES.GAME_OVER) {
      this.renderController.renderCleanseWave(this);
      this.renderController.renderBossDefeatFlash(this);
    }
    if (state !== GAME_STATES.TITLE) {
      this.renderController.renderSpellResponse(this);
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

  // SPACE while adjacent to a revealed pearl pedestal: consume the pearl from
  // inventory, mark the pedestal activated (pearl glyph appears on top), open
  // the previously-blocked east exit as a blue-zone slot, and dismiss the
  // fairy. Returns true if the press was consumed.
  handlePearlPedestalSpace() {
    const room = this.currentRoom;
    const pedestal = room?.pearlPedestal;
    if (!pedestal || pedestal.activated) return false;
    if (!this.player?.inventory?.includes('●')) return false;

    const CS = GRID.CELL_SIZE;
    const px = this.player.position.x + CS / 2;
    const py = this.player.position.y + CS / 2;
    const dx = px - pedestal.x;
    const dy = py - pedestal.y;
    // Adjacency: within ~1.5 cells of the pedestal center
    if (dx * dx + dy * dy > (CS * 1.5) * (CS * 1.5)) return false;

    this.player.removeIngredient('●');
    pedestal.activated = true;
    // Visually crown the pedestal with the pearl glyph by swapping the bg char.
    if (pedestal.obj) {
      pedestal.obj.char = '●';
      pedestal.obj.color = '#f4f4f8';
    }

    // Open the east exit (normally blocked by the ocean template). Mark it as
    // a hidden blue-zone slot so future zone routing can pick it up. The
    // letter '~' echoes the water motif; color is blue.
    room.exits.east = {
      letter: '~',
      color: '#66aaff',
      secretBlueZone: true
    };
    this.updateExitCollisions();
    this.renderer.markBackgroundDirty();

    // Visual shockwave centered on the freshly opened east exit — sweeps the
    // sand/water tiles around it, producing a rippling reveal.
    const exitCx = (GRID.COLS - 2) * GRID.CELL_SIZE + GRID.CELL_SIZE / 2;
    const exitCy = Math.floor(GRID.ROWS / 2) * GRID.CELL_SIZE + GRID.CELL_SIZE / 2;
    this.playerShockwave = {
      x: exitCx,
      y: exitCy,
      radius: 0, prevRadius: 0,
      maxRadius: GRID.CELL_SIZE * 6,
      speed: GRID.CELL_SIZE * 10,
      color: '#66aaff',
    };

    // Dismiss the guide fairy — its job is done. Send it offscreen east.
    const fairy = room.pearlFairy;
    if (fairy && !fairy.consumed) {
      fairy.state = 'exited';
      fairy.targetPosition = {
        x: GRID.COLS * CS + CS * 2,
        y: pedestal.y
      };
    }

    this.audioSystem?.playSFX?.('pickup');
    this.menuSystem?.showPickupMessage?.('THE PATH OPENS.');
    this.updateUI();
    return true;
  }

  // Pearl Cache pedestal (blue-zone Pearl Cache, '◌' room). SPACE while
  // adjacent drops the recipe-rebundle: 2× Pearl Shard + 1× Sharkbone + 1×
  // Coral Cluster + 1× Stingray Barb. Player can craft any of the three
  // water armors back in Rest. Returns true if the press was consumed.
  handlePearlCachePedestalSpace() {
    const room = this.currentRoom;
    const pedestal = room?.pearlCachePedestal;
    if (!pedestal || pedestal.activated) return false;

    const CS = GRID.CELL_SIZE;
    const px = this.player.position.x + CS / 2;
    const py = this.player.position.y + CS / 2;
    const dx = px - pedestal.x;
    const dy = py - pedestal.y;
    if (dx * dx + dy * dy > (CS * 1.5) * (CS * 1.5)) return false;

    pedestal.activated = true;
    if (pedestal.obj) {
      pedestal.obj.char = '●';
      pedestal.obj.color = '#f4f4f8';
    }

    // Drop the bundle straight into the player's inventory.
    const bundle = ['p', 'p', 'n', 'C', 'Y'];
    for (const ch of bundle) {
      if (this.player.addIngredient) {
        this.player.addIngredient(ch);
      } else {
        this.player.inventory.push(ch);
      }
    }

    this.audioSystem?.playSFX?.('pickup');
    this.menuSystem?.showPickupMessage?.('THE DEEP GIVES.');
    this.updateUI();
    this.renderer.markBackgroundDirty();
    return true;
  }

  // Coral Crown: while wearing the crown and standing on a water tile, that
  // tile becomes 'crystallized' — walkable, blocks contact slowdown, lasts 6s.
  // Tiles auto-expire via BackgroundObject.waterStateTimer.
  _updateCoralCrown() {
    const p = this.player;
    if (!p?.coralCrown || !p.inLiquid || !this.currentRoom) return;
    const CS = GRID.CELL_SIZE;
    const px = p.position.x + CS / 2;
    const py = p.position.y + CS / 2;
    const half = CS / 2;
    for (const obj of this.currentRoom.backgroundObjects) {
      if (obj.destroyed || obj.char !== '~') continue;
      if (obj.waterState !== 'normal') continue;
      const cx = obj.position.x + half;
      const cy = obj.position.y + half;
      if (Math.abs(cx - px) < half && Math.abs(cy - py) < half) {
        obj.setWaterState('crystallized', 6.0);
        break;
      }
    }
  }

  // Stingray Mantle: moving through water leaves an electrified wake. Each
  // vacated water cell flips to 'electrified' for 4s — long enough to form a
  // visible trail behind the player and keep zapping enemies that wander in.
  // While the player is in water, ticks damage on enemies standing on any
  // electrified cell — wet enemies take 2× via the existing wet+shock
  // interaction (we apply the 2× directly here since this is the wake's own
  // damage source).
  _updateStingrayMantle(deltaTime) {
    const p = this.player;
    if (!p?.stingrayMantle || !this.currentRoom) return;
    const CS = GRID.CELL_SIZE;
    const px = p.position.x + CS / 2;
    const py = p.position.y + CS / 2;
    const col = Math.floor(px / CS);
    const row = Math.floor(py / CS);

    if (p.inLiquid) {
      if (p._wakePrevCol === undefined) { p._wakePrevCol = col; p._wakePrevRow = row; }
      if (col !== p._wakePrevCol || row !== p._wakePrevRow) {
        const prevX = p._wakePrevCol * CS;
        const prevY = p._wakePrevRow * CS;
        for (const obj of this.currentRoom.backgroundObjects) {
          if (obj.destroyed || obj.char !== '~') continue;
          if (Math.abs(obj.position.x - prevX) < 4 && Math.abs(obj.position.y - prevY) < 4) {
            if (obj.waterState === 'normal') obj.setWaterState('electrified', 4.0);
            break;
          }
        }
        p._wakePrevCol = col;
        p._wakePrevRow = row;
      }
    } else {
      p._wakePrevCol = undefined;
      p._wakePrevRow = undefined;
    }

    // Damage tick — 0.25s interval
    p._wakeTickTimer = (p._wakeTickTimer || 0) - deltaTime;
    if (p._wakeTickTimer > 0) return;
    p._wakeTickTimer = 0.25;
    const half = CS / 2;
    for (const enemy of this.currentRoom.enemies) {
      if (enemy.hp <= 0) continue;
      const ex = enemy.position.x + half;
      const ey = enemy.position.y + half;
      for (const obj of this.currentRoom.backgroundObjects) {
        if (obj.destroyed || obj.char !== '~') continue;
        if (obj.waterState !== 'electrified') continue;
        const cx = obj.position.x + half;
        const cy = obj.position.y + half;
        if (Math.abs(cx - ex) < half && Math.abs(cy - ey) < half) {
          const wet = (enemy.wetDuration || 0) > 0;
          const dmg = wet ? 2 : 1;
          enemy.takeDamage(dmg);
          this.combatSystem?.createDamageNumber(dmg, enemy.position.x, enemy.position.y, wet ? '#ffff66' : '#88ddff', 1.0, 0.6);
          break;
        }
      }
    }
  }

  // Shark Mask emerge attack: triggered when the player re-rolls during a dive.
  // Deals 3× base melee damage to every enemy within 1.5 cells, ends the dive,
  // produces a big splash via createWetDrop-style particles. Wet enemies eat
  // an additional 2× from any subsequent shock — but we don't apply that here;
  // it's a bonus of subsequent player attacks.
  _sharkEmergeAttack(direction) {
    if (!this.player.diving) return;
    const CS = GRID.CELL_SIZE;
    const radius = CS * 1.5;
    const cx = this.player.position.x + CS / 2;
    const cy = this.player.position.y + CS / 2;
    const enemies = this.currentRoom?.enemies || [];
    const BASE_DAMAGE = 1;
    const EMERGE_DAMAGE = BASE_DAMAGE * 3;
    for (const enemy of enemies) {
      if (enemy.hp <= 0) continue;
      const ex = enemy.position.x + CS / 2;
      const ey = enemy.position.y + CS / 2;
      if (Math.hypot(ex - cx, ey - cy) > radius) continue;
      enemy.takeDamage(EMERGE_DAMAGE);
      this.combatSystem?.createDamageNumber(EMERGE_DAMAGE, enemy.position.x, enemy.position.y, '#88ccff', 1.4, 1.1);
      // Brief stagger so the player can follow up
      enemy.applyStatusEffect?.('freeze', 0.5);
    }
    // Splash particles
    for (let i = 0; i < 14; i++) {
      const ang = Math.random() * Math.PI * 2;
      const speed = 60 + Math.random() * 90;
      this.particles.push({
        x: cx, y: cy,
        vx: Math.cos(ang) * speed,
        vy: Math.sin(ang) * speed,
        life: 0.7, maxLife: 0.7,
        char: Math.random() < 0.5 ? '·' : '▪',
        color: '#88ccff'
      });
    }
    this.audioSystem?.playSFX?.('roll');
    this.player.endSharkDive();
    this.player.dodgeRoll.cooldownTimer = 0.5;
  }

  // O-room pearl path: room cleared with the guide fairy still in play. Place
  // a pedestal in an open dry-side cell and tether the fairy to it so the
  // player has a tangible "press SPACE here" beacon. No pedestal if the fairy
  // was already consumed (heal or bottle) or the player no longer has a pearl.
  revealPearlPedestal() {
    const room = this.currentRoom;
    if (!room) return;
    if (this.fairiesAngered) return; // no fairy to reveal the pedestal
    const fairy = room.pearlFairy;
    if (!fairy || fairy.consumed) return;
    if (room.pearlPedestal) return; // already revealed
    if (!this.player?.inventory?.includes('●')) return;

    const CS = GRID.CELL_SIZE;
    // Search dry-side cells (cols 12-16) for an open, non-water spot near
    // mid-vertical. Walk outward from a preferred center until we find one.
    const preferredCols = [14, 13, 15, 12, 16];
    const preferredRows = [10, 9, 11, 8, 12, 7, 13];
    let placed = null;
    for (const c of preferredCols) {
      for (const r of preferredRows) {
        if (room.collisionMap?.[r]?.[c]) continue;
        const x = c * CS;
        const y = r * CS;
        const occupied = room.backgroundObjects.some(o =>
          !o.destroyed && Math.abs(o.position.x - x) < CS / 2 && Math.abs(o.position.y - y) < CS / 2
        );
        if (occupied) continue;
        placed = { col: c, row: r, x, y };
        break;
      }
      if (placed) break;
    }
    if (!placed) return;

    const pedestal = new BackgroundObject('∏', placed.x, placed.y);
    pedestal.color = '#cccccc';
    pedestal.pearlPedestal = true;
    pedestal.hasCollision = true;
    room.collisionMap[placed.row][placed.col] = true;
    room.backgroundObjects.push(pedestal);
    this.renderer.markBackgroundDirty();

    room.pearlPedestal = {
      col: placed.col,
      row: placed.row,
      x: placed.x + CS / 2,
      y: placed.y + CS / 2,
      activated: false,
      obj: pedestal
    };

    // Anchor the fairy over the pedestal. flutterDuration was set huge at
    // spawn, so it will keep oscillating here until SPACE'd or consumed.
    fairy.anchor.x = placed.x + CS / 2;
    fairy.anchor.y = placed.y - CS * 0.5; // hover slightly above
    fairy.position.x = fairy.anchor.x;
    fairy.position.y = fairy.anchor.y;
    fairy.flutterRadius = 10;
    fairy.flutterElapsed = 0;
  }
}

// Start game when page loads
window.addEventListener('load', () => {
  new Game();
});
