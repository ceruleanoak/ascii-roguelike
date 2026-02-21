import { GameLoop } from './game/GameLoop.js';
import { GameStateMachine } from './game/GameStateMachine.js';
import { ASCIIRenderer } from './rendering/ASCIIRenderer.js';
import { PhysicsSystem } from './systems/PhysicsSystem.js';
import { CraftingSystem } from './systems/CraftingSystem.js';
import { CombatSystem } from './systems/CombatSystem.js';
import { RoomGenerator } from './systems/RoomGenerator.js';
import { PersistenceSystem } from './systems/PersistenceSystem.js';
import { CheatMenu } from './systems/CheatMenu.js';
import { Player } from './entities/Player.js';
import { Enemy } from './entities/Enemy.js';
import { Ingredient } from './entities/Ingredient.js';
import { Item } from './entities/Item.js';
import { BackgroundObject } from './entities/BackgroundObject.js';
import { createExplosion, createWetDrop, createActivationBurst, createSteamPuff, createChaff, createDodgeTrail } from './entities/Particle.js';
import { createDebris } from './entities/Debris.js';
import { isIngredient, isItem, ITEM_TYPES, generateEnemyDrops } from './data/items.js';
import { GAME_STATES, GRID, CRAFTING, EQUIPMENT, COLORS, INTERACTION_RANGE, OBJECT_ANIMATIONS, ROOM_TYPES } from './game/GameConfig.js';

class Game {
  constructor() {
    // Get canvas elements
    const bgCanvas = document.getElementById('background-layer');
    const fgCanvas = document.getElementById('foreground-layer');

    // Initialize systems
    this.renderer = new ASCIIRenderer(bgCanvas, fgCanvas);
    this.stateMachine = new GameStateMachine();
    this.physicsSystem = new PhysicsSystem();
    this.craftingSystem = new CraftingSystem();
    this.combatSystem = new CombatSystem(this.physicsSystem);
    this.roomGenerator = new RoomGenerator();
    this.cheatMenu = new CheatMenu();
    this.persistenceSystem = new PersistenceSystem();

    // Game state
    this.player = null;
    this.currentRoom = null;
    this.ingredients = [];
    this.items = [];
    this.placedTraps = []; // Placed trap items { item, tickTimer, activeDuration, affectedEnemies }
    this.activeNoiseSource = null; // Set each frame by updatePlacedTraps if noise-maker is active
    this.backgroundObjects = [];
    this.steamClouds = []; // Steam clouds from fire+water and Steam Vial
    this.particles = []; // Explosion particles
    this.debris = []; // Enemy debris
    this.depth = 0;
    this.gameOverWaitingForSpace = false;
    this.gameOverDeathTimer = 0; // Timer for 2-second delay before showing "Press SPACE"
    this.showVectors = false; // Debug: Toggle with 'v' key

    // REST inventory (cleared on death)
    this.restInventory = []; // Ingredients only
    this.restQuickSlots = [null, null, null]; // Weapons only
    this.restActiveSlotIndex = 0; // Persistent active slot index

    // Inventory for armor and consumables (lost on death)
    this.armorInventory = []; // All collected armor
    this.consumableInventory = []; // All collected consumables

    // Equipment slots (lost on death)
    this.equippedArmor = null; // Single armor slot
    this.equippedConsumables = [null, null]; // 2 consumable slots
    this.itemChest = []; // Storage for weapons

    // Consumable HUD feedback state
    this.spentConsumableSlots = [false, false]; // tracks ONE-SHOT used slots this run
    this.consumableCooldowns = [0, 0];          // cooldown timers for reusable consumables
    this.consumableFlashTimer = 0;              // HUD flash duration in seconds
    this.consumableFlashSlot = -1;             // which slot is flashing (-1 = none)

    // Consumable windup system (for offensive items)
    this.consumableWindups = []; // { consumable, slotIndex, timer, maxTimer, x, y, blinkTimer }

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
        }
      }

      // Handle menu navigation
      if (this.menuOpen) {
        const key = e.key.toLowerCase();

        // WASD navigation (W=up, S=down)
        if (key === 'w') {
          this.selectedMenuIndex = Math.max(0, this.selectedMenuIndex - 1);
          this.renderMenu();
          e.preventDefault();
          return;
        }
        if (key === 's') {
          this.selectedMenuIndex = Math.min(this.menuItems.length - 1, this.selectedMenuIndex + 1);
          this.renderMenu();
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

        // Release charged bow when space is released
        if (this.player && this.player.heldItem && this.player.heldItem.isCharging) {
          const attack = this.player.heldItem.releaseBow();
          if (attack) {
            this.combatSystem.createAttack(attack);
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

  loadGame() {
    // Clear any persisted save on load - always start fresh on refresh
    this.persistenceSystem.clearSave();

    // Depth always starts at 0 on page load
    this.depth = 0;

    // Start in TITLE state
    this.stateMachine.transition(GAME_STATES.TITLE);
  }

  enterTitleState() {
    // No player needed for title screen
    this.player = null;
    this.renderer.markBackgroundDirty();

    // Initialize title animation timer
    this.titleAnimationTime = 0;
  }

  enterRestState() {
    // Create player near north entrance
    const centerX = GRID.WIDTH / 2;
    const spawnY = GRID.CELL_SIZE * 3; // Near the north exit
    this.player = new Player(centerX, spawnY);

    // Restore safe REST inventory and quick slots (not lost on death)
    this.player.inventory = [...this.restInventory];
    this.player.quickSlots = [...this.restQuickSlots];
    this.player.activeSlotIndex = this.restActiveSlotIndex;
    console.log('[enterRestState] Restored quick slots:', this.player.quickSlots);

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

    this.ingredients = [];
    this.items = [];
    this.placedTraps = [];
    this.activeNoiseSource = null;

    // Give player starting ingredients (for testing) - only on first entry
    if (this.restInventory.length === 0 && this.depth === 0) {
      this.player.addIngredient('|'); // Stick
      this.player.addIngredient('~'); // String
      this.player.addIngredient('M'); // Metal
      this.player.addIngredient('F'); // Fire Essence
      this.player.addIngredient('F'); // Fire Essence (2nd — enables Chain Bow: Fire Bow + Fire)
      this.player.addIngredient('b'); // Bone — enables Thunder Axe: Bone + Metal → Bone Axe → + Fire
      // Also save to restInventory so they persist
      this.restInventory = [...this.player.inventory];
    }

    // Reset physics
    this.physicsSystem.clear();
    this.physicsSystem.addEntity(this.player);

    // Mark background dirty
    this.renderer.markBackgroundDirty();

    // Save state
    this.saveGameState();

    this.updateUI();
  }

  saveGameState() {
    // Save crafting state only, not equipment, inventories, or depth (true roguelike)
    this.persistenceSystem.saveRestState(this.craftingSystem);
  }

  applyEquipmentEffects() {
    // Reset all armor properties
    this.player.defense = 0;
    this.player.bulletResist = 0;
    this.player.dodgeChance = 0;
    this.player.fireImmune = false;
    this.player.freezeImmune = false;
    this.player.poisonImmune = false;
    this.player.reflectDamage = 0;
    this.player.speedBoost = 0;
    this.player.speedPenalty = 0;
    this.player.slowEnemies = false;

    // Apply equipped armor properties
    if (this.equippedArmor) {
      this.player.defense = this.equippedArmor.defense || 0;
      this.player.bulletResist = this.equippedArmor.bulletResist || 0;
      this.player.dodgeChance = this.equippedArmor.dodgeChance || 0;
      this.player.fireImmune = this.equippedArmor.fireImmune || false;
      this.player.freezeImmune = this.equippedArmor.freezeImmune || false;
      this.player.poisonImmune = this.equippedArmor.poisonImmune || false;
      this.player.reflectDamage = this.equippedArmor.reflectDamage || 0;
      this.player.speedBoost = this.equippedArmor.speedBoost || 0;
      this.player.speedPenalty = this.equippedArmor.speedPenalty || 0;
      this.player.slowEnemies = this.equippedArmor.slowEnemies || false;
    }

    // Add temporary block boost from Metal Block consumable
    if (this.player.blockBoostTimer > 0) {
      this.player.defense += this.player.blockBoostAmount;
    }

    // Store equipped consumables for condition checking during gameplay
    this.player.equippedConsumables = [...this.equippedConsumables];
  }

  updateConsumableWindups(deltaTime) {
    const enemies = this.currentRoom ? this.currentRoom.enemies : [];

    for (let i = this.consumableWindups.length - 1; i >= 0; i--) {
      const windup = this.consumableWindups[i];
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
        this.consumableFlashSlot = windup.slotIndex;
        this.consumableFlashTimer = 0.5;

        // Handle consumption based on one-shot vs reusable
        if (windup.isOneShot) {
          // Already marked as spent when windup started
          console.log(`${cd.name} triggered (one-shot consumed)!`);
        } else {
          // Start cooldown for reusable
          this.consumableCooldowns[windup.slotIndex] = cd.cooldown || 10;
          console.log(`${cd.name} triggered (${cd.cooldown}s cooldown started)!`);
        }

        // Remove windup
        this.consumableWindups.splice(i, 1);
        this.saveGameState();
      }
    }
  }

  checkConsumableActivation() {
    if (!this.player.equippedConsumables) return;

    for (let i = 0; i < this.player.equippedConsumables.length; i++) {
      const consumable = this.player.equippedConsumables[i];
      if (!consumable) continue;
      if (this.spentConsumableSlots[i]) continue; // One-shot consumables already used

      // Skip if on cooldown (reusable consumables)
      if (this.consumableCooldowns[i] > 0) continue;

      // Skip if already winding up
      if (this.consumableWindups.some(w => w.slotIndex === i)) continue;

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
              console.log(`Venom Vial: enemy at ${dist.toFixed(1)}px (${nearbyCount} total)`);
            }
          }
          console.log(`Venom Vial check: ${nearbyCount} enemies within 60px (need 2+)`);
          if (nearbyCount >= 2) {
            shouldTrigger = true;
            triggerData = { windup: 1.0, effectType: 'venomcloud' };
            console.log(`✓ Venom Vial TRIGGERED! ${nearbyCount} enemies within 60px`);
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
          this.consumableWindups.push({
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
            this.spentConsumableSlots[i] = true;
            this.equippedConsumables[i] = null;
            this.player.equippedConsumables[i] = null;
            console.log(`${cd.name} windup started (one-shot)!`);
          } else {
            // Reusable: start cooldown
            this.consumableCooldowns[i] = cd.cooldown || 10;
            console.log(`${cd.name} windup started (${cd.cooldown}s cooldown)!`);
          }
        } else {
          // Instant activation (heal, buff, shield items)
          this.combatSystem.createDamageNumber(
            consumable.char,
            this.player.position.x,
            this.player.position.y - GRID.CELL_SIZE * 0.5,
            consumable.color || COLORS.ITEM
          );
          this.consumableFlashSlot = i;
          this.consumableFlashTimer = 0.5;
          const burst = createActivationBurst(this.player.position.x, this.player.position.y, consumable.color || COLORS.ITEM);
          this.particles.push(...burst);

          // Handle consumption
          if (isOneShot) {
            // One-shot: remove permanently
            this.spentConsumableSlots[i] = true;
            this.equippedConsumables[i] = null;
            this.player.equippedConsumables[i] = null;
            console.log(`Auto-activated ${cd.name} (one-shot)!`);
          } else {
            // Reusable: start cooldown
            this.consumableCooldowns[i] = cd.cooldown || 10;
            console.log(`Auto-activated ${cd.name} (${cd.cooldown}s cooldown)!`);
          }

          this.saveGameState();
        }
      }
    }
  }

  enterExploreState(entryDirection = null) {
    // Depth only resets on death, not when entering from REST
    // Check if continuing from previous explore room (depth > 0) or starting fresh (depth === 0)
    const isContinuing = this.depth > 0;

    // Save player state from previous room
    // Inventory: Starting from REST (depth 0) → EMPTY, continuing through rooms → keep inventory
    // Quick slots: ALWAYS persist (both from REST and between rooms)
    const savedInventory = this.player && isContinuing ? [...this.player.inventory] : [];
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
    this.spentConsumableSlots = [false, false];
    this.consumableCooldowns = [0, 0]; // Reset cooldowns for new room
    this.consumableFlashTimer = 0;
    this.consumableFlashSlot = -1;
    this.consumableWindups = []; // Clear any pending windups

    // Generate new room with player start position
    this.depth++;
    this.roomGenerator.setDepth(this.depth);
    this.currentRoom = this.roomGenerator.generateRoom(null, { x: startX, y: startY });

    // Preload room previews for exits
    this.preloadRoomPreviews();

    this.player = new Player(startX, startY);
    this.player.setCollisionMap(this.currentRoom.collisionMap);

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

    // Reset bow uses for all equipped weapons (new room = fresh arrows)
    for (const item of this.player.quickSlots) {
      if (item && item.resetUses) {
        item.resetUses();
      }
    }

    // Apply equipment effects
    this.applyEquipmentEffects();

    // Setup room entities
    this.ingredients = [];
    this.items = this.currentRoom.items || [];
    this.placedTraps = [];
    this.activeNoiseSource = null;
    this.backgroundObjects = this.currentRoom.backgroundObjects || [];
    this.steamClouds = []; // Clear steam clouds when entering new room
    this.debris = []; // Clear debris when entering new room
    this.particles = []; // Clear particles when entering new room

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

    // Mark background dirty
    this.renderer.markBackgroundDirty();

    this.updateUI();
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
    } else if (state === GAME_STATES.GAME_OVER) {
      this.updateGameOverState(deltaTime);
    }

    // Track player inactivity for WASD blinking (REST and EXPLORE states only)
    if ((state === GAME_STATES.REST || state === GAME_STATES.EXPLORE) && this.player) {
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
    // Update animation timer
    this.titleAnimationTime += deltaTime;
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
    if (dodgeDirection.x !== 0 || dodgeDirection.y !== 0) {
      // Arrow keys pressed - start or update dodge roll direction
      if (!this.player.dodgeRoll.active && this.player.dodgeRoll.cooldownTimer <= 0) {
        // Start new dodge roll
        this.player.startDodgeRoll(dodgeDirection);
      } else if (this.player.dodgeRoll.active) {
        // Update direction during active roll (allows curving)
        this.player.dodgeRoll.direction = dodgeDirection;
      }
    }

    // Update player movement (locked when menu is open or during dodge roll)
    if (!this.menuOpen && !this.player.dodgeRoll.active) {
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

    // Emit dodge roll trail particles
    if (this.player.dodgeRoll.active) {
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

    // Update held item cooldown and check for windup completion
    if (this.player.heldItem && this.player.heldItem.update) {
      const windupAttack = this.player.heldItem.update(deltaTime);
      if (windupAttack) {
        this.combatSystem.createAttack(windupAttack);
      }
    }

    return { burnKilledPlayer };
  }

  updateRestState(deltaTime) {
    if (!this.player) return;

    // Update all shared player mechanics
    this.updatePlayerMechanics(deltaTime);

    // Update shared game elements (particles, debris, etc.)
    this.updateSharedGameElements(deltaTime);

    // Update physics system
    this.physicsSystem.update(deltaTime, this.currentRoom ? this.currentRoom.backgroundObjects : []);

    // Update combat system (for weapon previews/attacks in rest mode)
    this.combatSystem.update(deltaTime, this.player, [], []);

    // Check for North exit
    if (this.player.position.y < GRID.CELL_SIZE * 2) {
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

    // Tick HUD flash timer for consumable slot
    if (this.consumableFlashTimer > 0) {
      this.consumableFlashTimer = Math.max(0, this.consumableFlashTimer - deltaTime);
      if (this.consumableFlashTimer === 0) this.consumableFlashSlot = -1;
    }

    // Tick consumable cooldowns
    for (let i = 0; i < this.consumableCooldowns.length; i++) {
      if (this.consumableCooldowns[i] > 0) {
        this.consumableCooldowns[i] = Math.max(0, this.consumableCooldowns[i] - deltaTime);
      }
    }

    // Update physics
    const waterResults = this.physicsSystem.update(deltaTime, this.currentRoom.backgroundObjects);

    for (const { entity, inLiquid, liquidState } of waterResults) {
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
        this.combatSystem.createAttack(windupAttack);
      }
    }

    // Bow charging (hold space to charge, release to fire)
    if (this.keys.space && this.player.heldItem && this.player.heldItem.data.weaponType === 'BOW' && !this.menuOpen && !this.cheatMenu.isOpen) {
      // Call use() to start/continue charging (doesn't fire)
      this.player.heldItem.use(this.player);
    }

    // Auto-attack when holding space (guns and melee only - bows use charging)
    if (this.keys.space && this.player.heldItem && this.player.heldItem.data.weaponType !== 'BOW' && !this.menuOpen && !this.cheatMenu.isOpen) {
      const weapon = this.player.heldItem;
      const attack = this.player.useHeldItem();
      if (attack) {
        this.combatSystem.createAttack(attack);
      }
    }

    // Update placed traps (sets this.activeNoiseSource for this frame)
    this.updatePlacedTraps(deltaTime);

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
    }

    // Process spawn requests
    for (const request of spawnRequests) {
      const newEnemies = this.spawnEnemiesFrom(request.spawner, request.spawnData);
      for (const newEnemy of newEnemies) {
        request.spawner.registerSpawn(newEnemy);
      }
      this.currentRoom.enemies.push(...newEnemies);
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
      this.activeNoiseSource
    );

    // Spawn drops from objects destroyed this frame (by melee or bullets)
    if (combatResult.objectEffects) {
      for (const { obj, effect } of combatResult.objectEffects) {
        // Skip if this object has already been processed (safety check)
        if (obj.hasDropped) continue;

        // Mark as processed immediately to prevent duplicate checks
        obj.hasDropped = true;

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

    // Check consumable activation AFTER combat so damage-reactive thresholds
    // (heal, speed, block) see the post-hit HP value. "Immediate" consumables
    // (maxhp, luck) also fire here on their first frame — one frame delay is fine.
    this.checkConsumableActivation();

    // Update consumable windups (offensive items with drop animation)
    this.updateConsumableWindups(deltaTime);

    // If a heal consumable fired and restored HP, treat the player as alive
    const playerDied = combatResult.playerDead || burnKilledPlayer;
    if (playerDied && this.player.hp > 0) {
      // Give brief invuln so the restored player doesn't instantly die again
      this.player.invulnerabilityTimer = Math.max(this.player.invulnerabilityTimer, 1.0);
    }

    if (playerDied && this.player.hp <= 0) {
      console.log(`\n💀 ═══════════════════════════════════════════════════════════`);
      console.log(`💀 PLAYER DEATH DETECTED`);
      console.log(`💀 Final HP: ${this.player.hp}/${this.player.maxHp}`);
      console.log(`💀 Defense: ${this.player.defense}`);
      console.log(`💀 Depth: ${this.depth}`);
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
        this.equippedConsumables[reviveIdx] = null;
        this.player.equippedConsumables[reviveIdx] = null;
        this.spentConsumableSlots[reviveIdx] = true;
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

        console.log('⚰️  Transitioning to GAME OVER state...');

        // Clear combat system (projectiles, melee attacks, etc.) before transitioning
        this.combatSystem.clear();

        this.stateMachine.transition(GAME_STATES.GAME_OVER);
        return;
      }
    }

    // Remove dead enemies and spawn loot + debris
    for (let i = this.currentRoom.enemies.length - 1; i >= 0; i--) {
      const enemy = this.currentRoom.enemies[i];
      if (enemy.hp <= 0) {
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

    // Update background object animations and fire propagation
    for (const obj of this.currentRoom.backgroundObjects) {
      if (obj.update) {
        obj.update(deltaTime);
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

    // Update item attraction (armor and consumables auto-pickup)
    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i];

      // Only auto-pickup armor and consumables (weapons are manual with SPACE)
      if (item.data.type === 'ARMOR' || item.data.type === 'CONSUMABLE') {
        const shouldPickup = this.physicsSystem.applyAttraction(item, this.player);

        if (shouldPickup) {
          // Route to correct inventory
          if (item.data.type === 'ARMOR') {
            this.armorInventory.push(item);
          } else if (item.data.type === 'CONSUMABLE') {
            this.consumableInventory.push(item);
          }

          this.showPickupMessage(item.data.name);
          this.physicsSystem.removeEntity(item);
          this.items.splice(i, 1);
        }
      }
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

    // Check if room cleared
    if (this.currentRoom.enemies.length === 0) {
      this.currentRoom.exits.north = true;
      this.currentRoom.exits.east = true;
      this.currentRoom.exits.west = true;
      // Update collision map to open exits
      this.updateExitCollisions();
    }

    // Check for exits
    const gridPos = this.player.getGridPosition();
    const centerX = Math.floor(GRID.COLS / 2);
    const centerY = Math.floor(GRID.ROWS / 2);

    // North exit check (warp zone is at rows 1-2, below the wall)
    if (gridPos.y <= 2 && Math.abs(gridPos.x - centerX) <= 1 && this.currentRoom.exits.north) {
      this.enterExploreState('north'); // Entering from North → spawn at South
    }
    // South exit check
    else if (gridPos.y >= GRID.ROWS - 2 && Math.abs(gridPos.x - centerX) <= 1 && this.currentRoom.exits.south) {
      this.bankLoot();

      // Clear combat system (projectiles, melee attacks, etc.) before transitioning
      this.combatSystem.clear();

      this.stateMachine.transition(GAME_STATES.REST);
      // Don't reset depth - it should persist to show max depth reached
    }
    // East exit check (right border, centered vertically)
    else if (gridPos.x >= GRID.COLS - 2 && Math.abs(gridPos.y - centerY) <= 1 && this.currentRoom.exits.east) {
      this.enterExploreState('east'); // Entering from East → spawn at West
    }
    // West exit check (left border, centered vertically)
    else if (gridPos.x <= 1 && Math.abs(gridPos.y - centerY) <= 1 && this.currentRoom.exits.west) {
      this.enterExploreState('west'); // Entering from West → spawn at East
    }

    this.updateUI();
  }

  handleSpacePress() {
    const state = this.stateMachine.getCurrentState();

    if (state === GAME_STATES.TITLE) {
      // Transition from title screen to REST
      this.stateMachine.transition(GAME_STATES.REST);
      return;
    }

    if (state === GAME_STATES.GAME_OVER) {
      // Only allow space press after 2-second delay
      if (this.gameOverWaitingForSpace && this.gameOverDeathTimer <= 0) {
        this.gameOverWaitingForSpace = false;
        this.particles = [];
        this.debris = [];
        this.depth = 0;

        // Clear held items on death (but keep crafting slots)
        this.restQuickSlots = [null, null, null];
        this.restActiveSlotIndex = 0;

        // Clear all inventories and equipment on death (true roguelike)
        this.restInventory = [];
        this.itemChest = [];
        this.armorInventory = [];
        this.consumableInventory = [];
        this.equippedArmor = null;
        this.equippedConsumables = [null, null];

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
                  this.armorInventory.push(item);
                } else if (item.data.type === 'CONSUMABLE') {
                  this.consumableInventory.push(item);
                } else if (item.data.type === 'WEAPON' || item.data.type === 'TRAP') {
                  this.player.pickupItem(item);
                }
              }
            }
            this.renderer.markBackgroundDirty();
            this.updateUI();
          } else if (this.player.inventory.length > 0) {
            // Open menu to choose from inventory
            this.openIngredientMenu('left');
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
                  this.armorInventory.push(item);
                } else if (item.data.type === 'CONSUMABLE') {
                  this.consumableInventory.push(item);
                } else if (item.data.type === 'WEAPON' || item.data.type === 'TRAP') {
                  this.player.pickupItem(item);
                }
              }
            }
            this.renderer.markBackgroundDirty();
            this.updateUI();
          } else if (this.player.inventory.length > 0) {
            // Open menu to choose from inventory
            this.openIngredientMenu('right');
          }
          return;
        }

        // Handle center crafting slot (claim crafted item)
        if (nearestSlot.type === 'crafting-center') {
          if (this.craftingSystem.centerSlot) {
            const item = this.craftingSystem.claimCraftedItem(
              this.player.position.x,
              this.player.position.y
            );
            if (item) {
              // Route crafted items to correct inventory based on type
              if (item.data.type === 'ARMOR') {
                this.armorInventory.push(item);
                this.showPickupMessage(item.data.name);
              } else if (item.data.type === 'CONSUMABLE') {
                this.consumableInventory.push(item);
                this.showPickupMessage(item.data.name);
              } else if (item.data.type === 'WEAPON' || item.data.type === 'TRAP') {
                const droppedItem = this.player.pickupItem(item);
                this.showPickupMessage(item.data.name);
                // Send displaced weapon to chest instead of the explore floor
                if (droppedItem) {
                  this.itemChest.push(droppedItem);
                  this.showPickupMessage(`${droppedItem.data.name} → chest`);
                }
              }
              this.renderer.markBackgroundDirty();
              this.updateUI();
            }
          }
          return;
        }
      }

      // Not near any interactive slot - allow weapon preview/attack
      if (this.player.heldItem) {
        const attack = this.player.useHeldItem();
        if (attack) this.combatSystem.createAttack(attack);
      }
    } else if (state === GAME_STATES.EXPLORE) {
      // Placed-trap pickup always takes priority — check before weapon use
      const nearbyPlacedTrap = this.placedTraps.some(entry => {
        const dx = entry.item.position.x - this.player.position.x;
        const dy = entry.item.position.y - this.player.position.y;
        return Math.sqrt(dx * dx + dy * dy) < 20;
      });
      if (nearbyPlacedTrap) {
        this.tryPickupItem();
      } else if (this.player.heldItem) {
        // Attack — melee AoE handles object damage directly via CombatSystem
        const attack = this.player.useHeldItem();
        if (attack) this.combatSystem.createAttack(attack);
      } else {
        // Item pickup takes priority over background object interaction
        const hasNearbyItem = this.items.some(
          item => this.physicsSystem.getDistance(this.player, item) < 20
        );
        if (hasNearbyItem) {
          this.tryPickupItem();
        } else {
          // Unarmed and no item nearby: interact with background object if present
          const nearbyObject = this.findNearbyBackgroundObject();
          if (nearbyObject) {
            this.interactWithObject(nearbyObject);
          }
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
            this.itemChest.push(this.player.heldItem);
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

        // Place held item in crafting slot (if player has held item)
        if (this.player.heldItem) {
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
        // Drop held item — if it's a TRAP, place and activate it
        const heldData = this.player.heldItem.data || this.player.heldItem;
        if (heldData.type === 'TRAP') {
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
          this.showPickupMessage(`${trapData.name} placed!`);
        } else {
          // Drop held weapon normally
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
      this.itemChest.push(item);
      console.log(`[CHEAT] ✓ Added ${type === ITEM_TYPES.TRAP ? 'trap' : 'weapon'} to chest: ${name}`);
    } else if (type === ITEM_TYPES.ARMOR) {
      // Add armor to armor chest (inventory)
      const item = new Item(char, 0, 0);
      if (!this.armorInventory.some(a => a.char === char)) {
        this.armorInventory.push(item);
        console.log(`[CHEAT] ✓ Added armor to chest: ${name}`);
      } else {
        console.log(`[CHEAT] ⚠ Already have armor: ${name}`);
      }
    } else if (type === ITEM_TYPES.CONSUMABLE) {
      // Add consumable to consumable chest (inventory)
      const item = new Item(char, 0, 0);
      if (!this.consumableInventory.some(c => c.char === char)) {
        this.consumableInventory.push(item);
        console.log(`[CHEAT] ✓ Added consumable to chest: ${name}`);
      } else {
        console.log(`[CHEAT] ⚠ Already have consumable: ${name}`);
      }
    }

    this.saveGameState();
    this.renderer.markBackgroundDirty();
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
    // Check placed traps first (SPACE picks them back up into quick slot)
    for (let i = 0; i < this.placedTraps.length; i++) {
      const trapEntry = this.placedTraps[i];
      const dx = trapEntry.item.position.x - this.player.position.x;
      const dy = trapEntry.item.position.y - this.player.position.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance < 20) {
        // Put trap back into quick slot (same path as weapons)
        const droppedItem = this.player.pickupItem(trapEntry.item);
        this.showPickupMessage(trapEntry.item.data.name);
        this.placedTraps.splice(i, 1);
        // Drop previous weapon if any
        if (droppedItem) {
          this.items.push(droppedItem);
          this.physicsSystem.addEntity(droppedItem);
        }
        this.updateUI();
        return;
      }
    }

    for (let i = 0; i < this.items.length; i++) {
      const item = this.items[i];
      const distance = this.physicsSystem.getDistance(this.player, item);

      if (distance < 20) {
        // Route items to correct inventory based on type
        if (item.data.type === 'ARMOR') {
          // Add to armor inventory
          this.armorInventory.push(item);
          this.showPickupMessage(item.data.name);
          this.physicsSystem.removeEntity(item);
          this.items.splice(i, 1);
        } else if (item.data.type === 'CONSUMABLE') {
          // Add to consumable inventory
          this.consumableInventory.push(item);
          this.showPickupMessage(item.data.name);
          this.physicsSystem.removeEntity(item);
          this.items.splice(i, 1);
        } else if (item.data.type === 'WEAPON' || item.data.type === 'TRAP') {
          // Add to quick slots (weapons and traps)
          const droppedItem = this.player.pickupItem(item);
          this.showPickupMessage(item.data.name);
          this.physicsSystem.removeEntity(item);
          this.items.splice(i, 1);

          // Drop previous weapon if any
          if (droppedItem) {
            this.items.push(droppedItem);
            this.physicsSystem.addEntity(droppedItem);
          }
        }

        this.updateUI();
        break;
      }
    }
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
        // One-shot trap: scan for trigger radius
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

          // Remove trap
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
          // Goo Dispenser: heavy slow (80%) while in range, reset to 0.5 when out
          for (const enemy of enemies) {
            const dx = enemy.position.x - tx;
            const dy = enemy.position.y - ty;
            if (Math.sqrt(dx * dx + dy * dy) <= trapData.effectRadius) {
              enemy.statusEffects.freeze.slowAmount = 0.8;
              enemy.applyStatusEffect('freeze', 0.5);
            } else if (enemy.statusEffects.freeze.slowAmount === 0.8) {
              // Reset to default slow amount when enemy leaves goo range
              enemy.statusEffects.freeze.slowAmount = 0.5;
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
    for (const obj of this.backgroundObjects) {
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

    if (result.effect) {
      this.handleObjectEffect(result.effect, obj);
    }

    if (result.message) {
      console.log(result.message); // Temporary: log to console
    }
  }

  handleObjectEffect(effect, obj) {
    if (!effect) return;

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
    // REPLACE restInventory with player's current inventory (which includes everything from REST + new loot)
    // Save all quick slots and active index
    if (this.player) {
      this.restInventory = [...this.player.inventory];
      this.restQuickSlots = [...this.player.quickSlots];
      this.restActiveSlotIndex = this.player.activeSlotIndex;
      console.log('[bankLoot] Saved quick slots:', this.restQuickSlots);
    }
  }

  render(alpha) {
    const state = this.stateMachine.getCurrentState();

    if (state === GAME_STATES.TITLE) {
      this.renderTitleState();
    } else if (state === GAME_STATES.REST) {
      this.renderRestState();
    } else if (state === GAME_STATES.EXPLORE) {
      this.renderExploreState();
    } else if (state === GAME_STATES.GAME_OVER) {
      this.renderGameOverState();
    }
  }

  renderBowChargeIndicator() {
    if (!this.player || !this.player.heldItem || this.player.heldItem.data.weaponType !== 'BOW') {
      return;
    }

    const weapon = this.player.heldItem;
    const barHeight = GRID.CELL_SIZE; // Player height
    const barX = this.player.position.x + GRID.CELL_SIZE * 1.5; // To the right of player
    const barY = this.player.position.y; // Aligned with player

    // State 0: Out of arrows - show blinking red X
    if (weapon.usesRemaining !== null && weapon.usesRemaining <= 0) {
      const blinkOn = Math.floor(performance.now() / 1000 * 6) % 2 === 0;
      if (blinkOn) {
        this.renderer.drawEntity(
          barX + 2, // Center the X in the bar position
          barY + barHeight / 2,
          'X',
          '#ff0000'
        );
      }
    }
    // State 1: Charging (hold space) - show growing bar
    else if (weapon.isCharging) {
      const chargeRatio = Math.min(weapon.chargeTime / weapon.maxChargeTime, 1.0);
      const filledHeight = barHeight * chargeRatio;

      // Draw filled portion (charge level) - grows from bottom to top
      this.renderer.drawRect(
        barX,
        barY + (barHeight - filledHeight),
        4,
        filledHeight,
        '#ffdd44',
        true
      );
    }
    // State 2: Cooldown (after firing) - show blinking bar at fired charge level
    else if (weapon.cooldownTimer > 0) {
      const blinkOn = Math.floor(performance.now() / 1000 * 8) % 2 === 0;
      if (blinkOn) {
        const filledHeight = barHeight * weapon.lastChargeRatio;
        this.renderer.drawRect(
          barX,
          barY + (barHeight - filledHeight),
          4,
          filledHeight,
          '#ffdd44',
          true
        );
      }
    }
    // State 3: Ready to attack - indicator disappears
  }

  renderArrowKeyIndicators(baseY, centerX) {
    // Render arrow keys with WASD-style brackets, grouped with WASD
    // Position: Above WASD, same visual style

    const isInactive = this.inactivityTimer >= this.INACTIVITY_THRESHOLD;
    const blinkWhite = isInactive && this.wasdBlinkState;
    const inactiveColor = blinkWhite ? '#FFFFFF' : COLORS.TEXT;

    // Check if on cooldown for color theming
    const onCooldown = this.player && this.player.dodgeRoll.cooldownTimer > 0;
    const cooldownColor = '#ff6666'; // Dim red when on cooldown
    const readyColor = COLORS.ITEM; // Bright yellow when ready

    const upColor = this.arrowKeys.ArrowUp ? readyColor : (onCooldown ? cooldownColor : (isInactive ? inactiveColor : COLORS.TEXT));
    const downColor = this.arrowKeys.ArrowDown ? readyColor : (onCooldown ? cooldownColor : (isInactive ? inactiveColor : COLORS.TEXT));
    const leftColor = this.arrowKeys.ArrowLeft ? readyColor : (onCooldown ? cooldownColor : (isInactive ? inactiveColor : COLORS.TEXT));
    const rightColor = this.arrowKeys.ArrowRight ? readyColor : (onCooldown ? cooldownColor : (isInactive ? inactiveColor : COLORS.TEXT));

    // Arrow UP (directly above WASD W key)
    const arrowTopY = Math.floor(baseY / GRID.CELL_SIZE) - 1;
    this.renderer.drawCell(
      Math.floor(centerX / GRID.CELL_SIZE) - 1,
      arrowTopY,
      '[',
      COLORS.BORDER
    );
    this.renderer.drawCell(
      Math.floor(centerX / GRID.CELL_SIZE),
      arrowTopY,
      '↑',
      upColor
    );
    this.renderer.drawCell(
      Math.floor(centerX / GRID.CELL_SIZE) + 1,
      arrowTopY,
      ']',
      COLORS.BORDER
    );

    // Arrow DOWN, LEFT, RIGHT (bottom row, below WASD S key)
    const arrowBottomY = Math.floor(baseY / GRID.CELL_SIZE) + 2;

    // LEFT
    this.renderer.drawCell(
      Math.floor(centerX / GRID.CELL_SIZE) - 5,
      arrowBottomY,
      '[',
      COLORS.BORDER
    );
    this.renderer.drawCell(
      Math.floor(centerX / GRID.CELL_SIZE) - 4,
      arrowBottomY,
      '←',
      leftColor
    );
    this.renderer.drawCell(
      Math.floor(centerX / GRID.CELL_SIZE) - 3,
      arrowBottomY,
      ']',
      COLORS.BORDER
    );

    // DOWN
    this.renderer.drawCell(
      Math.floor(centerX / GRID.CELL_SIZE) - 1,
      arrowBottomY,
      '[',
      COLORS.BORDER
    );
    this.renderer.drawCell(
      Math.floor(centerX / GRID.CELL_SIZE),
      arrowBottomY,
      '↓',
      downColor
    );
    this.renderer.drawCell(
      Math.floor(centerX / GRID.CELL_SIZE) + 1,
      arrowBottomY,
      ']',
      COLORS.BORDER
    );

    // RIGHT
    this.renderer.drawCell(
      Math.floor(centerX / GRID.CELL_SIZE) + 3,
      arrowBottomY,
      '[',
      COLORS.BORDER
    );
    this.renderer.drawCell(
      Math.floor(centerX / GRID.CELL_SIZE) + 4,
      arrowBottomY,
      '→',
      rightColor
    );
    this.renderer.drawCell(
      Math.floor(centerX / GRID.CELL_SIZE) + 5,
      arrowBottomY,
      ']',
      COLORS.BORDER
    );
  }

  renderTitleState() {
    // Render background (only if dirty)
    if (this.renderer.backgroundDirty) {
      this.renderer.clearBackground();
      this.renderer.backgroundDirty = false;
    }

    // Clear foreground
    this.renderer.clearForeground();

    // Title screen uses 60x30 grid (narrower cells for wider display)
    const TITLE_COLS = 60;
    const TITLE_CELL_WIDTH = GRID.WIDTH / TITLE_COLS; // 480 / 60 = 8px wide cells

    // Define the ASCII art title screen (60 chars wide, 30 rows)
    const titleScreen = [
      ";++xx+:....:::......:$$$&$&$$Xx+:;;;+XXXX$&&&$XXXx+$$XX...",
      "+XXXXXxxXXXx:::....+$$$&+............................&&...",
      ":X+.............++&&...........&&&&&$....................+",
      "..++++++++++++++&&.:.......................................",
      ".;......+++++..+&&.........................................",
      ":XX+.........xx&..........................................",
      "....;XX;;;::.;$&:x...................::::::::&&...........",
      ";XXxXXXX;+xx+++&...::::::........:$$$&&&&&&&&&&&&&:..;:..",
      ".+xx.::::..+++&..;&&&&&&&$xx::::&&&&&&&&&&&&&&&&&&x.x.....",
      ".+::::::;xxxx::&&&&&&$$&&$......&&&&&&$$&&&&&&&&&X........",
      ".:x:XX;XXX+Xxx::&&&&&&&&&.&&&&......$X&&&&&&x:............",
      ":::::::xxxx;xx::$:;;&$...:&&:&&&.....:...........$$$......",
      ":xxXXxx::::+++::&....::...&&::&&:.:.:::.:x;::X+.;;&&.....",
      ";X:.:::++++xxxXX&.::::;:..$&.&&.....;...+&&&&&&&;+......",
      ":xx:::+xxXxx++++xxx&$............:.x.x&&$$&&+&&+........",
      "xxxxxx++xx:+Xxxxx+X&&$XX.;..&..&.$..;:.+:$.&.X:;.......",
      ":::+++;:+::::;+++X&+:&$.$$$.$&$.&&&$.&&+;..&&+.X:........",
      ";;;X::x:++:::x:.:::++++.&&..+&&.+&&..:.....:;&.+x.......",
      ":;:::::::::::...;;;;xxxxx;;;;;;;;;::::::&&&.:X::........",
      ":XXXxxx+++;;+++++x+xx.:xxx&&$:&&$::&&..&&&:.:.:+&.........",
      ".;;xxxXXX+++++XXXXXXx$$..+X$&&$&&&$&&:::...::xx&$........",
      "xxxXXXx:+++xxxxXXXX+$&&::...............::x&X&XX..........",
      "::::::::::::..:XXXX;xx$$&&.....$$...:;&&&x&&X&::..........",
      ":XXXx;::xxxxx+X.::.::::::;$$&&&&&&&&&$$;;;...............",
      "XXx+XXXX+:::::;::::;;;:xxXXXx:+++xxxxXXXx:+++xxx.........",
      ";+;;;;+;:.::.:Xxxx::xxXXXx:+++xxxxxXXXx:+++xxx;;..........",
      "                                                            ",
      "                                                            ",
      "                                                            ",
      "                                                            "
    ];

    // Animation phases
    const SHIMMER_DURATION = 2.0;
    const FADE_START = 2.0;
    const FADE_DURATION = 3.0;
    const TITLE_START = 5.0;
    const TITLE_DURATION = 4.0;
    const PRESS_SPACE_START = 10.0;

    const time = this.titleAnimationTime;

    // Draw each line of the title screen with 60-column layout
    this.renderer.fgCtx.save();
    this.renderer.fgCtx.font = `${GRID.CELL_SIZE}px "Courier New", monospace`;
    this.renderer.fgCtx.textAlign = 'center';
    this.renderer.fgCtx.textBaseline = 'middle';

    for (let row = 0; row < titleScreen.length && row < GRID.ROWS; row++) {
      const line = titleScreen[row];
      for (let col = 0; col < line.length && col < TITLE_COLS; col++) {
        const char = line[col];
        if (char !== ' ') {
          // Calculate position using narrower cells
          const x = col * TITLE_CELL_WIDTH + TITLE_CELL_WIDTH / 2;
          const y = row * GRID.CELL_SIZE + GRID.CELL_SIZE / 2;

          // Base color based on character density
          let baseColor = COLORS.TEXT;

          if (char === '.' || char === ':') {
            baseColor = '#444444'; // Dark
          } else if (char === ';' || char === '+') {
            baseColor = '#666666'; // Medium dark
          } else if (char === 'x' || char === 'X') {
            baseColor = '#999999'; // Medium
          } else if (char === '$' || char === '&') {
            baseColor = '#cccccc'; // Light
          }

          let color = baseColor;
          let alpha = 1.0;
          let renderChar = char;

          // Detect foreground (skull shape) vs background
          // Foreground: dense clusters (part of skull), Background: sparse/isolated chars
          // Check character density: count non-space neighbors
          let neighborCount = 0;
          for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
              if (dr === 0 && dc === 0) continue;
              const nr = row + dr;
              const nc = col + dc;
              if (nr >= 0 && nr < titleScreen.length && nc >= 0 && nc < titleScreen[nr].length) {
                if (titleScreen[nr][nc] !== ' ' && titleScreen[nr][nc] !== '.') {
                  neighborCount++;
                }
              }
            }
          }

          // Foreground = sparse areas (skull outline), Background = dense/scattered areas
          const isForeground = neighborCount < 4;

          // Phase 1: Diagonal shimmer effect with pulsing background (0.0 - 2.0s)
          if (time < SHIMMER_DURATION) {
            // Per-character random offset for non-linearity
            const randomSeed = (row * TITLE_COLS + col) * 0.1;
            const randomOffset = Math.sin(randomSeed) * 0.1;

            // Diagonal progress: top-left (0,0) to bottom-right (59,29)
            const diagonalPos = (col / TITLE_COLS + row / titleScreen.length) / 2 + randomOffset;

            // Shimmer wave position (0 to 1, sweeping across diagonal)
            const shimmerProgress = time / SHIMMER_DURATION;

            // Wave width (wider for foreground = slower rate of change)
            const waveWidth = isForeground ? 0.5 : 0.3;

            // Calculate distance from current shimmer position
            const distanceFromWave = Math.abs(diagonalPos - shimmerProgress);

            if (distanceFromWave < waveWidth) {
              // Within wave: black → dark gray → gray → dark gray → black
              const wavePos = distanceFromWave / waveWidth; // 0 at center, 1 at edge
              const shimmerIntensity = Math.cos(wavePos * Math.PI) * 0.5 + 0.5;

              // Discrete color steps
              if (shimmerIntensity > 0.66) {
                color = '#808080'; // Gray
              } else if (shimmerIntensity > 0.33) {
                color = '#404040'; // Dark gray
              } else {
                color = '#000000'; // Black
              }
            } else if (diagonalPos > shimmerProgress + waveWidth) {
              // Not reached yet: black
              color = '#000000';
            } else {
              // Passed: black
              color = '#000000';
            }

            // Background characters: constant pulsing (size changes)
            if (!isForeground) {
              const pulseSpeed = 3.0; // Fast pulsing
              const pulsePhase = (time * pulseSpeed + randomSeed) % 1.0;

              // Map characters to size variants
              if (char === '.') {
                renderChar = pulsePhase > 0.5 ? ':' : '.';
              } else if (char === ':') {
                renderChar = pulsePhase > 0.5 ? ';' : ':';
              } else if (char === ';') {
                renderChar = pulsePhase > 0.5 ? '+' : ';';
              } else if (char === '+') {
                renderChar = pulsePhase > 0.5 ? 'x' : '+';
              } else if (char === 'x') {
                renderChar = pulsePhase > 0.5 ? 'X' : 'x';
              } else if (char === 'X') {
                renderChar = pulsePhase > 0.5 ? 'x' : 'X';
              }
            }
          }
          // Phase 2: Full fade-in (2.0 - 5.0s)
          else if (time < FADE_START + FADE_DURATION) {
            const fadeProgress = (time - FADE_START) / FADE_DURATION;
            alpha = Math.min(fadeProgress, 1.0);
          }
          // Phase 3 & 4: Full opacity
          else {
            alpha = 1.0;
          }

          // Background pulsing effect (continuous through all phases)
          if (!isForeground && time >= SHIMMER_DURATION) {
            const pulseSpeed = 3.0;
            const randomSeed = (row * TITLE_COLS + col) * 0.1;
            const pulsePhase = (time * pulseSpeed + randomSeed) % 1.0;

            // Map characters to size variants
            if (char === '.') {
              renderChar = pulsePhase > 0.5 ? ':' : '.';
            } else if (char === ':') {
              renderChar = pulsePhase > 0.5 ? ';' : ':';
            } else if (char === ';') {
              renderChar = pulsePhase > 0.5 ? '+' : ';';
            } else if (char === '+') {
              renderChar = pulsePhase > 0.5 ? 'x' : '+';
            } else if (char === 'x') {
              renderChar = pulsePhase > 0.5 ? 'X' : 'x';
            } else if (char === 'X') {
              renderChar = pulsePhase > 0.5 ? 'x' : 'X';
            }
          }

          // Apply alpha to color
          if (alpha < 1.0 && time >= SHIMMER_DURATION) {
            const rgb = this.hexToRgb(baseColor);
            color = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
          }

          this.renderer.fgCtx.fillStyle = color;
          this.renderer.fgCtx.fillText(renderChar, x, y);
        }
      }
    }

    // Phase 3: "PURE ROGUE" title vertical on far right (5.0 - 9.0s)
    if (time >= TITLE_START) {
      const titleProgress = Math.min((time - TITLE_START) / TITLE_DURATION, 1.0);
      const titleText = "PURE ROGUE";
      const titleLength = titleText.length;

      // Number of letters to show
      const lettersToShow = Math.floor(titleProgress * titleLength);

      // Draw letters vertically on far right
      const titleX = GRID.WIDTH - GRID.CELL_SIZE * 2;
      const titleStartY = GRID.HEIGHT / 2 - (titleLength * GRID.CELL_SIZE) / 2;

      for (let i = 0; i < lettersToShow; i++) {
        const letter = titleText[i];
        const letterY = titleStartY + i * GRID.CELL_SIZE;

        // Each letter fades in completely before next starts
        const letterFadeProgress = Math.min((titleProgress * titleLength - i), 1.0);

        this.renderer.fgCtx.fillStyle = `rgba(255, 255, 255, ${letterFadeProgress})`;
        this.renderer.fgCtx.fillText(letter, titleX, letterY);
      }
    }

    // Phase 4: "PRESS SPACE" snaps in (10.0s+) with slow on/off blink
    if (time >= PRESS_SPACE_START) {
      const pressSpaceText = "PRESS SPACE";
      const pressSpaceY = GRID.CELL_SIZE * 27.5; // Row 27
      const pressSpaceX = GRID.WIDTH / 2;

      // Slow on/off blink (1.5 second period)
      const blinkPeriod = 1.5;
      const blinkOn = Math.floor((time - PRESS_SPACE_START) / blinkPeriod) % 2 === 0;

      if (blinkOn) {
        this.renderer.fgCtx.fillStyle = COLORS.ITEM;
        this.renderer.fgCtx.textAlign = 'center';
        this.renderer.fgCtx.fillText(pressSpaceText, pressSpaceX, pressSpaceY);
      }
    }

    this.renderer.fgCtx.restore();
  }

  hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : { r: 255, g: 255, b: 255 };
  }

  renderRestState() {
    // Guard: Make sure player exists
    if (!this.player) {
      return;
    }

    // Render background (only if dirty)
    if (this.renderer.backgroundDirty) {
      this.renderer.clearBackground();
      // REST always has north exit open
      this.renderer.drawBorder({ north: true, south: false, east: false, west: false });

      // Draw crafting station
      this.renderCraftingStation();

      // Draw equipment slots
      this.renderEquipmentSlots();

      this.renderer.backgroundDirty = false;
    }

    // Render foreground
    this.renderer.clearForeground();

    // Draw prominent warp zone indicator for north exit (below the wall)
    const centerX = Math.floor(GRID.COLS / 2);
    const warpZoneColor = 'rgba(100, 200, 255, 0.5)'; // Brighter blue, more opaque

    this.renderer.drawRect(
      (centerX - 1) * GRID.CELL_SIZE,
      1 * GRID.CELL_SIZE,
      3 * GRID.CELL_SIZE,
      2 * GRID.CELL_SIZE,
      warpZoneColor,
      true
    );

    // Add decorative border arrows pointing up to make exit more obvious
    const arrowColor = 'rgba(150, 220, 255, 0.8)';
    for (let i = -1; i <= 1; i++) {
      this.renderer.drawEntity(
        (centerX + i) * GRID.CELL_SIZE + GRID.CELL_SIZE / 2,
        1.5 * GRID.CELL_SIZE,
        '^',
        arrowColor
      );
    }

    // Highlight the nearest interactive slot only (prevents multi-slot highlighting)
    const nearestSlot = this.getNearestInteractiveSlot();

    if (nearestSlot) {
      let highlightX, highlightY;

      // Determine highlight position based on slot type
      if (nearestSlot.type.startsWith('crafting-')) {
        highlightX = (nearestSlot.x + 1) * GRID.CELL_SIZE;
        highlightY = nearestSlot.y * GRID.CELL_SIZE;
      } else {
        highlightX = nearestSlot.x * GRID.CELL_SIZE;
        highlightY = nearestSlot.y * GRID.CELL_SIZE;
      }

      this.renderer.drawRect(
        highlightX,
        highlightY,
        GRID.CELL_SIZE,
        GRID.CELL_SIZE,
        COLORS.HIGHLIGHT,
        true
      );
    }

    // Draw projectiles (for weapon preview)
    for (const proj of this.combatSystem.getProjectiles()) {
      this.renderer.drawEntity(
        proj.position.x + GRID.CELL_SIZE / 2,
        proj.position.y + GRID.CELL_SIZE / 2,
        proj.char,
        proj.color
      );
    }

    // Draw melee attacks (for weapon preview)
    for (const attack of this.combatSystem.getMeleeAttacks()) {
      this.renderer.drawEntity(
        attack.position.x + GRID.CELL_SIZE / 2,
        attack.position.y + GRID.CELL_SIZE / 2,
        attack.char,
        attack.color
      );
    }

    // Draw particles (dodge trails, explosions, etc.)
    for (const particle of this.particles) {
      if (particle.getAlpha) {
        // Particle class instance
        const alpha = particle.getAlpha();
        this.renderer.drawTextWithAlpha(
          particle.position.x + GRID.CELL_SIZE / 2,
          particle.position.y + GRID.CELL_SIZE / 2,
          particle.char,
          particle.color,
          alpha
        );
      } else {
        // Simple particle object
        const alpha = Math.max(0, particle.life / particle.maxLife);
        this.renderer.drawTextWithAlpha(
          particle.x,
          particle.y,
          particle.char,
          particle.color,
          alpha
        );
      }
    }

    // Draw player (with i-frame alpha fade)
    const playerAlpha = this.player.getVisibilityAlpha();
    this.renderer.drawTextWithAlpha(
      this.player.position.x + GRID.CELL_SIZE / 2,
      this.player.position.y + GRID.CELL_SIZE / 2,
      this.player.char,
      this.player.color,
      playerAlpha
    );

    // Draw bow charge indicator (shared between REST and EXPLORE states)
    this.renderBowChargeIndicator();

    // Draw North exit indicator
    this.renderer.drawEntity(
      GRID.WIDTH / 2,
      GRID.CELL_SIZE / 2,
      '↑',
      COLORS.TEXT
    );

    // Draw arrow key indicators (dodge roll) - positioned above WASD
    const wasdY = GRID.HEIGHT - GRID.CELL_SIZE * 6;
    const wasdCenterX = GRID.WIDTH / 2;
    this.renderArrowKeyIndicators(wasdY, wasdCenterX);

    // Draw WASD keyboard indicator

    // Determine colors based on key state (highlight when pressed) and inactivity blinking
    const isInactive = this.inactivityTimer >= this.INACTIVITY_THRESHOLD;
    const blinkWhite = isInactive && this.wasdBlinkState;
    const inactiveColor = blinkWhite ? '#FFFFFF' : COLORS.TEXT;

    const wColor = this.keys.w ? COLORS.ITEM : (isInactive ? inactiveColor : COLORS.TEXT);
    const aColor = this.keys.a ? COLORS.ITEM : (isInactive ? inactiveColor : COLORS.TEXT);
    const sColor = this.keys.s ? COLORS.ITEM : (isInactive ? inactiveColor : COLORS.TEXT);
    const dColor = this.keys.d ? COLORS.ITEM : (isInactive ? inactiveColor : COLORS.TEXT);

    // Temporarily use lighter font for WASD keys
    this.renderer.bgCtx.save();
    this.renderer.bgCtx.font = `${GRID.CELL_SIZE}px "Courier New", monospace`; // Remove bold

    // W key (top)
    this.renderer.drawCell(
      Math.floor(wasdCenterX / GRID.CELL_SIZE) - 1,
      Math.floor(wasdY / GRID.CELL_SIZE),
      '[',
      COLORS.BORDER
    );
    this.renderer.drawCell(
      Math.floor(wasdCenterX / GRID.CELL_SIZE),
      Math.floor(wasdY / GRID.CELL_SIZE),
      'W',
      wColor
    );
    this.renderer.drawCell(
      Math.floor(wasdCenterX / GRID.CELL_SIZE) + 1,
      Math.floor(wasdY / GRID.CELL_SIZE),
      ']',
      COLORS.BORDER
    );

    // A S D keys (bottom row) - increased spacing for visibility
    const bottomRowY = Math.floor(wasdY / GRID.CELL_SIZE) + 1;

    // A key (left)
    this.renderer.drawCell(
      Math.floor(wasdCenterX / GRID.CELL_SIZE) - 5,
      bottomRowY,
      '[',
      COLORS.BORDER
    );
    this.renderer.drawCell(
      Math.floor(wasdCenterX / GRID.CELL_SIZE) - 4,
      bottomRowY,
      'A',
      aColor
    );
    this.renderer.drawCell(
      Math.floor(wasdCenterX / GRID.CELL_SIZE) - 3,
      bottomRowY,
      ']',
      COLORS.BORDER
    );

    // S key (center)
    this.renderer.drawCell(
      Math.floor(wasdCenterX / GRID.CELL_SIZE) - 1,
      bottomRowY,
      '[',
      COLORS.BORDER
    );
    this.renderer.drawCell(
      Math.floor(wasdCenterX / GRID.CELL_SIZE),
      bottomRowY,
      'S',
      sColor
    );
    this.renderer.drawCell(
      Math.floor(wasdCenterX / GRID.CELL_SIZE) + 1,
      bottomRowY,
      ']',
      COLORS.BORDER
    );

    // D key (right)
    this.renderer.drawCell(
      Math.floor(wasdCenterX / GRID.CELL_SIZE) + 3,
      bottomRowY,
      '[',
      COLORS.BORDER
    );
    this.renderer.drawCell(
      Math.floor(wasdCenterX / GRID.CELL_SIZE) + 4,
      bottomRowY,
      'D',
      dColor
    );
    this.renderer.drawCell(
      Math.floor(wasdCenterX / GRID.CELL_SIZE) + 5,
      bottomRowY,
      ']',
      COLORS.BORDER
    );

    // Restore original bold font
    this.renderer.bgCtx.restore();

    // Draw help text at bottom with key highlighting
    this.renderer.fgCtx.save();
    this.renderer.fgCtx.font = `${GRID.CELL_SIZE}px "Courier New", monospace`;
    this.renderer.fgCtx.textBaseline = 'middle';
    const helpY = GRID.HEIGHT - GRID.CELL_SIZE * 2;

    // Measure text widths to position each part
    const useText = 'Use ';
    const spaceText = 'SPACE';
    const andText = ' and ';
    const shiftText = 'SHIFT';
    const keysText = ' keys';

    const useWidth = this.renderer.fgCtx.measureText(useText).width;
    const spaceWidth = this.renderer.fgCtx.measureText(spaceText).width;
    const andWidth = this.renderer.fgCtx.measureText(andText).width;
    const shiftWidth = this.renderer.fgCtx.measureText(shiftText).width;
    const keysWidth = this.renderer.fgCtx.measureText(keysText).width;

    const totalWidth = useWidth + spaceWidth + andWidth + shiftWidth + keysWidth;
    let currentX = (GRID.WIDTH - totalWidth) / 2;

    this.renderer.fgCtx.textAlign = 'left';

    // "Use "
    this.renderer.fgCtx.fillStyle = COLORS.TEXT;
    this.renderer.fgCtx.fillText(useText, currentX, helpY);
    currentX += useWidth;

    // "SPACE" (highlight when pressed)
    this.renderer.fgCtx.fillStyle = this.keys.space ? COLORS.ITEM : COLORS.TEXT;
    this.renderer.fgCtx.fillText(spaceText, currentX, helpY);
    currentX += spaceWidth;

    // " and "
    this.renderer.fgCtx.fillStyle = COLORS.TEXT;
    this.renderer.fgCtx.fillText(andText, currentX, helpY);
    currentX += andWidth;

    // "SHIFT" (highlight when pressed)
    this.renderer.fgCtx.fillStyle = this.keys.shift ? COLORS.ITEM : COLORS.TEXT;
    this.renderer.fgCtx.fillText(shiftText, currentX, helpY);
    currentX += shiftWidth;

    // " keys"
    this.renderer.fgCtx.fillStyle = COLORS.TEXT;
    this.renderer.fgCtx.fillText(keysText, currentX, helpY);

    this.renderer.fgCtx.restore();

    // Draw pickup message if active (crafted items)
    if (this.pickupMessage && this.pickupMessageTimer > 0) {
      this.renderer.fgCtx.save();
      this.renderer.fgCtx.font = `bold ${GRID.CELL_SIZE * 2}px "Courier New", monospace`;
      this.renderer.fgCtx.textAlign = 'center';
      this.renderer.fgCtx.textBaseline = 'middle';
      this.renderer.fgCtx.fillStyle = COLORS.ITEM;
      this.renderer.fgCtx.fillText(this.pickupMessage, GRID.WIDTH / 2, GRID.HEIGHT / 2);
      this.renderer.fgCtx.restore();
    }

    // Draw inventory overlay when 'i' key is held
    if (this.keys.i) {
      this.renderInventoryOverlay();
    }

    // Render cheat menu overlay (if open)
    this.cheatMenu.render(this.renderer);
  }

  renderExploreState() {
    if (!this.currentRoom || !this.player) return;

    // Render background (only if dirty)
    if (this.renderer.backgroundDirty) {
      this.renderer.clearBackground();
      // Draw border with room's exit configuration
      this.renderer.drawBorder(this.currentRoom.exits);

      // Draw collision map
      for (let y = 0; y < GRID.ROWS; y++) {
        for (let x = 0; x < GRID.COLS; x++) {
          if (this.currentRoom.collisionMap[y][x]) {
            this.renderer.drawCell(x, y, '█', '#444444');
          }
        }
      }

      // Draw recipe sign FIRST (under all other background objects)
      if (this.currentRoom.recipeSign) {
        for (const char of this.currentRoom.recipeSign.characters) {
          const x = char.x + GRID.CELL_SIZE / 2;
          const y = char.y + GRID.CELL_SIZE / 2;
          this.renderer.bgCtx.fillStyle = char.color;
          this.renderer.bgCtx.fillText(char.char, x, y);
        }
      }

      // Draw static background objects (non-water tiles only; water drawn on foreground for dynamic state)
      for (const obj of this.backgroundObjects) {
        if (!obj.currentAnimation && obj.char !== '~') {
          // Draw directly to background context (not foreground)
          const x = obj.position.x + GRID.CELL_SIZE / 2;
          const y = obj.position.y + GRID.CELL_SIZE / 2;
          this.renderer.bgCtx.fillStyle = obj.color;
          this.renderer.bgCtx.fillText(obj.char, x, y);
        }
      }

      this.renderer.backgroundDirty = false;
    }

    // Render foreground
    this.renderer.clearForeground();

    // Draw semi-transparent warp zone indicators for all exits
    const centerX = Math.floor(GRID.COLS / 2);
    const centerY = Math.floor(GRID.ROWS / 2);
    const warpZoneColor = 'rgba(100, 150, 255, 0.15)'; // Light blue, semi-transparent

    // North exit warp zone (3 cells wide, 2 cells deep)
    if (this.currentRoom.exits.north) {
      this.renderer.drawRect(
        (centerX - 1) * GRID.CELL_SIZE,
        0 * GRID.CELL_SIZE,
        3 * GRID.CELL_SIZE,
        2 * GRID.CELL_SIZE,
        warpZoneColor,
        true
      );
    }

    // South exit warp zone (3 cells wide, 2 cells deep)
    if (this.currentRoom.exits.south) {
      this.renderer.drawRect(
        (centerX - 1) * GRID.CELL_SIZE,
        (GRID.ROWS - 2) * GRID.CELL_SIZE,
        3 * GRID.CELL_SIZE,
        2 * GRID.CELL_SIZE,
        warpZoneColor,
        true
      );
    }

    // East exit warp zone (2 cells wide, 3 cells tall)
    if (this.currentRoom.exits.east) {
      this.renderer.drawRect(
        (GRID.COLS - 2) * GRID.CELL_SIZE,
        (centerY - 1) * GRID.CELL_SIZE,
        2 * GRID.CELL_SIZE,
        3 * GRID.CELL_SIZE,
        warpZoneColor,
        true
      );
    }

    // West exit warp zone (2 cells wide, 3 cells tall)
    if (this.currentRoom.exits.west) {
      this.renderer.drawRect(
        0 * GRID.CELL_SIZE,
        (centerY - 1) * GRID.CELL_SIZE,
        2 * GRID.CELL_SIZE,
        3 * GRID.CELL_SIZE,
        warpZoneColor,
        true
      );
    }

    // Draw animating background objects
    for (const obj of this.backgroundObjects) {
      if (obj.currentAnimation) {
        const renderData = obj.getRenderPosition();
        this.renderer.drawEntity(
          renderData.x + GRID.CELL_SIZE / 2 + obj.animationOffset.x,
          renderData.y + GRID.CELL_SIZE / 2 + obj.animationOffset.y,
          renderData.char,
          renderData.color
        );
      }
    }

    // Draw water tiles on foreground so state changes (frozen '=', electrified blink) render each frame
    for (const obj of this.backgroundObjects) {
      if (obj.char === '~' && !obj.currentAnimation) {
        const renderData = obj.getRenderPosition();
        this.renderer.drawEntity(
          renderData.x + GRID.CELL_SIZE / 2,
          renderData.y + GRID.CELL_SIZE / 2,
          renderData.char,
          renderData.color
        );
      }
    }

    // Draw debris (enemy remains)
    for (const piece of this.debris) {
      this.renderer.drawEntity(
        piece.position.x + GRID.CELL_SIZE / 2,
        piece.position.y + GRID.CELL_SIZE / 2,
        piece.char,
        piece.color
      );
    }

    // Draw ingredients
    for (const ingredient of this.ingredients) {
      this.renderer.drawEntity(
        ingredient.position.x + GRID.CELL_SIZE / 2,
        ingredient.position.y + GRID.CELL_SIZE / 2,
        ingredient.char,
        ingredient.color
      );
    }

    // Draw items
    for (const item of this.items) {
      this.renderer.drawEntity(
        item.position.x + GRID.CELL_SIZE / 2,
        item.position.y + GRID.CELL_SIZE / 2,
        item.char,
        item.color
      );
    }

    // Draw placed traps
    for (const entry of this.placedTraps) {
      const { item } = entry;
      this.renderer.drawEntity(
        item.position.x + GRID.CELL_SIZE / 2,
        item.position.y + GRID.CELL_SIZE / 2,
        item.char,
        item.color
      );
    }

    // Draw consumable windups (dropped items during charge-up)
    for (const windup of this.consumableWindups) {
      // Blink effect: show/hide every 0.15 seconds, faster as timer runs out
      const blinkSpeed = Math.max(0.1, windup.timer * 0.15);
      const shouldShow = Math.floor(windup.blinkTimer / blinkSpeed) % 2 === 0;

      if (shouldShow) {
        // Draw dropped consumable
        this.renderer.drawEntity(
          windup.x,
          windup.y,
          windup.consumable.char,
          windup.consumable.color
        );

        // Calculate actual AoE radius based on effect type
        const cd = windup.consumable.data;
        let aoeRadius = 0;
        switch (windup.effectType) {
          case 'explode':
            aoeRadius = cd.radius * 2; // Bomb uses 2x radius
            break;
          case 'curse':
            aoeRadius = cd.radius; // Cursed Skull
            break;
          case 'slow':
            aoeRadius = 50; // Slime Ball
            break;
          case 'poison':
            aoeRadius = 55; // Poison Flask
            break;
          case 'venomcloud':
            aoeRadius = 60; // Venom Vial
            break;
          case 'jolt':
            aoeRadius = 999; // Room-wide (show large ring)
            break;
          case 'throwSteam':
            aoeRadius = cd.radius; // Steam Vial
            break;
          default:
            aoeRadius = 40;
        }

        // Draw pulsing ring to show AoE damage radius
        const progress = 1 - (windup.timer / windup.maxTimer);
        const pulse = Math.sin(progress * Math.PI * 6) * 0.15; // Subtle pulse
        const displayRadius = aoeRadius * (1 + pulse);

        this.renderer.fgCtx.save();
        this.renderer.fgCtx.strokeStyle = windup.consumable.color;
        this.renderer.fgCtx.globalAlpha = 0.4 + Math.sin(progress * Math.PI * 8) * 0.2;
        this.renderer.fgCtx.lineWidth = 2;
        this.renderer.fgCtx.beginPath();
        this.renderer.fgCtx.arc(windup.x, windup.y, displayRadius, 0, Math.PI * 2);
        this.renderer.fgCtx.stroke();

        // Draw inner ring at 50% radius for better depth perception
        this.renderer.fgCtx.globalAlpha = 0.2;
        this.renderer.fgCtx.lineWidth = 1;
        this.renderer.fgCtx.beginPath();
        this.renderer.fgCtx.arc(windup.x, windup.y, displayRadius * 0.5, 0, Math.PI * 2);
        this.renderer.fgCtx.stroke();

        this.renderer.fgCtx.restore();
      }
    }

    // Draw enemies (with i-frame blinking, DOT blinking, and windup indicators)
    for (const enemy of this.currentRoom.enemies) {
      if (enemy.shouldRenderVisible()) {
        // Check for DOT blink color, otherwise use normal color
        const dotColor = enemy.getDOTBlinkColor();
        const displayColor = dotColor !== null ? dotColor : enemy.color;

        this.renderer.drawEntity(
          enemy.position.x + GRID.CELL_SIZE / 2,
          enemy.position.y + GRID.CELL_SIZE / 2,
          enemy.char,
          displayColor
        );
      }

      // Draw windup telegraph
      const windupIndicator = enemy.getWindupIndicator();
      if (windupIndicator) {
        this.renderer.drawEntity(
          enemy.position.x + GRID.CELL_SIZE / 2,
          enemy.position.y + GRID.CELL_SIZE / 2 + windupIndicator.offsetY,
          windupIndicator.char,
          windupIndicator.color
        );
      }

      // Draw memory/vision lost indicator
      const memoryIndicator = enemy.getMemoryIndicator();
      if (memoryIndicator) {
        this.renderer.drawEntity(
          enemy.position.x + GRID.CELL_SIZE / 2,
          enemy.position.y + GRID.CELL_SIZE / 2 + memoryIndicator.offsetY,
          memoryIndicator.char,
          memoryIndicator.color
        );
      }

      // Draw detection/aggro indicator
      const detectionIndicator = enemy.getDetectionIndicator();
      if (detectionIndicator) {
        this.renderer.drawEntity(
          enemy.position.x + GRID.CELL_SIZE / 2,
          enemy.position.y + GRID.CELL_SIZE / 2 + detectionIndicator.offsetY,
          detectionIndicator.char,
          detectionIndicator.color
        );
      }

      // Draw spawn indicator (purple + symbol during windup)
      const spawnIndicator = enemy.getSpawnIndicator();
      if (spawnIndicator) {
        this.renderer.drawEntity(
          enemy.position.x + GRID.CELL_SIZE / 2,
          enemy.position.y + GRID.CELL_SIZE / 2 + spawnIndicator.offsetY,
          spawnIndicator.char,
          spawnIndicator.color
        );
      }

      // Draw debug vectors (toggle with 'v' key)
      if (this.showVectors && enemy.target && enemy.state === 'chase') {
        const enemyCenter = {
          x: enemy.position.x + GRID.CELL_SIZE / 2,
          y: enemy.position.y + GRID.CELL_SIZE / 2
        };

        // 1. Draw line of sight to player (yellow) - shortened at obstruction
        const playerCenter = {
          x: enemy.target.position.x + GRID.CELL_SIZE / 2,
          y: enemy.target.position.y + GRID.CELL_SIZE / 2
        };
        const visionPoint = enemy.getVisionObstructionPoint(
          enemyCenter,
          playerCenter,
          enemy.visionLength
        );
        this.renderer.drawLine(
          enemyCenter.x,
          enemyCenter.y,
          visionPoint.x,
          visionPoint.y,
          visionPoint.blocked ? '#ff000088' : '#00ff0088' // Red if blocked, green if clear
        );

        // 2. Draw current pathfinding direction (cyan) - actual movement vector
        if (enemy.currentDirection.x !== 0 || enemy.currentDirection.y !== 0) {
          const dirLength = enemy.navigationLength;
          const dirEndX = enemyCenter.x + enemy.currentDirection.x * dirLength;
          const dirEndY = enemyCenter.y + enemy.currentDirection.y * dirLength;
          this.renderer.drawLine(enemyCenter.x, enemyCenter.y, dirEndX, dirEndY, '#00ffffff');
        }

        // 3. Draw memory mark if pursuing last known position
        if (enemy.aggroMemoryActive && enemy.lastKnownPosition) {
          // Draw line to memory mark (orange)
          this.renderer.drawLine(
            enemyCenter.x,
            enemyCenter.y,
            enemy.lastKnownPosition.x + GRID.CELL_SIZE / 2,
            enemy.lastKnownPosition.y + GRID.CELL_SIZE / 2,
            '#ff880088'
          );

          // Draw memory mark position (orange dot)
          this.renderer.drawEntity(
            enemy.lastKnownPosition.x + GRID.CELL_SIZE / 2,
            enemy.lastKnownPosition.y + GRID.CELL_SIZE / 2,
            'X',
            '#ff8800'
          );
        }

        // 4. Draw mark on player when in sight
        if (!visionPoint.blocked) {
          this.renderer.drawEntity(
            playerCenter.x,
            playerCenter.y,
            '◎',
            '#00ff00'
          );
        }
      }
    }

    // Draw projectiles
    for (const proj of this.combatSystem.getProjectiles()) {
      this.renderer.drawEntity(
        proj.position.x + GRID.CELL_SIZE / 2,
        proj.position.y + GRID.CELL_SIZE / 2,
        proj.char,
        proj.color
      );
    }

    // Draw enemy projectiles
    for (const proj of this.combatSystem.getEnemyProjectiles()) {
      this.renderer.drawEntity(
        proj.position.x + GRID.CELL_SIZE / 2,
        proj.position.y + GRID.CELL_SIZE / 2,
        proj.char,
        proj.color
      );
    }

    // Draw melee attacks
    for (const attack of this.combatSystem.getMeleeAttacks()) {
      this.renderer.drawEntity(
        attack.position.x + GRID.CELL_SIZE / 2,
        attack.position.y + GRID.CELL_SIZE / 2,
        attack.char,
        attack.color
      );
    }

    // Draw enemy melee attacks
    for (const attack of this.combatSystem.getEnemyMeleeAttacks()) {
      this.renderer.drawEntity(
        attack.position.x + GRID.CELL_SIZE / 2,
        attack.position.y + GRID.CELL_SIZE / 2,
        attack.char,
        attack.color
      );
    }

    // Draw stuck arrows (arrows embedded in enemies)
    for (const arrow of this.combatSystem.getStuckArrows()) {
      this.renderer.drawEntity(
        arrow.position.x + GRID.CELL_SIZE / 2,
        arrow.position.y + GRID.CELL_SIZE / 2,
        arrow.char,
        arrow.color
      );
    }

    // Draw damage numbers
    for (const dmgNum of this.combatSystem.getDamageNumbers()) {
      this.renderer.drawTextWithAlpha(
        dmgNum.x,
        dmgNum.y,
        dmgNum.value.toString(),
        dmgNum.color,
        dmgNum.alpha
      );
    }

    // Draw particles (embers, explosions, clouds)
    for (const particle of this.particles) {
      if (particle.getAlpha) {
        // Particle class instance
        const alpha = particle.getAlpha();
        this.renderer.drawTextWithAlpha(
          particle.position.x + GRID.CELL_SIZE / 2,
          particle.position.y + GRID.CELL_SIZE / 2,
          particle.char,
          particle.color,
          alpha
        );
      } else {
        // Simple particle object
        const alpha = Math.max(0, particle.life / particle.maxLife);
        this.renderer.drawTextWithAlpha(
          particle.x,
          particle.y,
          particle.char,
          particle.color,
          alpha
        );
      }
    }

    // Draw steam clouds (fire+water smokescreen)
    for (const cloud of this.steamClouds) {
      const maxTimer = 7.0;
      const alpha = Math.min(0.9, (cloud.timer / maxTimer) * 0.9 + 0.1);
      const steamChars = ['=', '~', '=', '-'];
      for (let s = 0; s < 4; s++) {
        const jx = cloud.x + (Math.random() - 0.5) * cloud.radius * 1.6;
        const jy = cloud.y + (Math.random() - 0.5) * cloud.radius * 1.6;
        const dx = jx - cloud.x, dy = jy - cloud.y;
        if (dx * dx + dy * dy <= cloud.radius * cloud.radius) {
          this.renderer.drawTextWithAlpha(jx, jy, steamChars[s % steamChars.length], '#8c8c8c', alpha);
        }
      }
    }

    // Draw player (with i-frame alpha fade)
    const playerAlpha = this.player.getVisibilityAlpha();
    this.renderer.drawTextWithAlpha(
      this.player.position.x + GRID.CELL_SIZE / 2,
      this.player.position.y + GRID.CELL_SIZE / 2,
      this.player.char,
      this.player.color,
      playerAlpha
    );

    // Draw bow charge indicator (shared between REST and EXPLORE states)
    this.renderBowChargeIndicator();

    // Draw exit indicators with blinking previews
    const directions = [
      { name: 'north', x: GRID.WIDTH / 2, y: GRID.CELL_SIZE * 3, arrow: '↑' },
      { name: 'east', x: GRID.WIDTH - GRID.CELL_SIZE * 3, y: GRID.HEIGHT / 2, arrow: '→' },
      { name: 'west', x: GRID.CELL_SIZE * 3, y: GRID.HEIGHT / 2, arrow: '←' },
      { name: 'south', x: GRID.WIDTH / 2, y: GRID.HEIGHT - GRID.CELL_SIZE * 3, arrow: '↓' }
    ];

    for (const dir of directions) {
      if (this.currentRoom.exits[dir.name]) {
        const preview = this.roomPreviews[dir.name];

        let char, color;
        if (preview && this.previewBlinkState) {
          char = preview.char;
          color = COLORS.ITEM; // Highlight color for previews
        } else {
          char = dir.arrow;
          color = COLORS.TEXT;
        }

        this.renderer.drawEntity(dir.x, dir.y, char, color);
      }
    }

    // Draw pickup message if active
    if (this.pickupMessage && this.pickupMessageTimer > 0) {
      this.renderer.fgCtx.save();
      this.renderer.fgCtx.font = `bold ${GRID.CELL_SIZE * 2}px "Courier New", monospace`;
      this.renderer.fgCtx.textAlign = 'center';
      this.renderer.fgCtx.textBaseline = 'middle';
      this.renderer.fgCtx.fillStyle = COLORS.ITEM;
      this.renderer.fgCtx.fillText(this.pickupMessage, GRID.WIDTH / 2, GRID.HEIGHT / 2);
      this.renderer.fgCtx.restore();
    }

    // Draw inventory overlay when 'i' key is held
    if (this.keys.i) {
      this.renderInventoryOverlay();
    }

    // Render cheat menu overlay (if open)
    this.cheatMenu.render(this.renderer);
  }

  renderGameOverState() {
    if (!this.currentRoom) return;

    // Render background (keep the room visible)
    if (this.renderer.backgroundDirty) {
      this.renderer.clearBackground();
      this.renderer.drawBorder(this.currentRoom.exits);

      // Draw collision map
      for (let y = 0; y < GRID.ROWS; y++) {
        for (let x = 0; x < GRID.COLS; x++) {
          if (this.currentRoom.collisionMap[y][x]) {
            this.renderer.drawCell(x, y, '█', '#444444');
          }
        }
      }

      this.renderer.backgroundDirty = false;
    }

    // Render foreground
    this.renderer.clearForeground();

    // Draw debris (remains on ground)
    for (const piece of this.debris) {
      this.renderer.drawEntity(
        piece.position.x + GRID.CELL_SIZE / 2,
        piece.position.y + GRID.CELL_SIZE / 2,
        piece.char,
        piece.color
      );
    }

    // Draw particles (explosion and embers)
    for (const particle of this.particles) {
      if (particle.getAlpha) {
        const alpha = particle.getAlpha();
        this.renderer.drawTextWithAlpha(
          particle.position.x + GRID.CELL_SIZE / 2,
          particle.position.y + GRID.CELL_SIZE / 2,
          particle.char,
          particle.color,
          alpha
        );
      } else {
        const alpha = Math.max(0, particle.life / particle.maxLife);
        this.renderer.drawTextWithAlpha(
          particle.x,
          particle.y,
          particle.char,
          particle.color,
          alpha
        );
      }
    }

    // Draw "GAME OVER" text
    const gameOverText = 'GAME OVER';
    this.renderer.fgCtx.save();
    this.renderer.fgCtx.font = `bold ${GRID.CELL_SIZE * 2}px "Courier New", monospace`;
    this.renderer.fgCtx.textAlign = 'center';
    this.renderer.fgCtx.textBaseline = 'middle';
    this.renderer.fgCtx.fillStyle = '#ff0000';
    this.renderer.fgCtx.fillText(gameOverText, GRID.WIDTH / 2, GRID.HEIGHT / 2);
    this.renderer.fgCtx.restore();

    // Draw "Press SPACE to continue" text (only after 2-second delay)
    if (this.gameOverDeathTimer <= 0) {
      const continueText = 'Press SPACE to continue';
      this.renderer.fgCtx.save();
      this.renderer.fgCtx.font = `bold ${GRID.CELL_SIZE}px "Courier New", monospace`;
      this.renderer.fgCtx.textAlign = 'center';
      this.renderer.fgCtx.textBaseline = 'middle';
      this.renderer.fgCtx.fillStyle = COLORS.TEXT;
      this.renderer.fgCtx.fillText(continueText, GRID.WIDTH / 2, GRID.HEIGHT / 2 + GRID.CELL_SIZE * 3);
      this.renderer.fgCtx.restore();
    }
  }

  renderInventoryOverlay() {
    // Draw semi-transparent background
    this.renderer.drawRect(
      GRID.CELL_SIZE * 2,
      GRID.CELL_SIZE * 2,
      GRID.WIDTH - GRID.CELL_SIZE * 4,
      GRID.HEIGHT - GRID.CELL_SIZE * 4,
      'rgba(0, 0, 0, 0.8)',
      true
    );

    // Draw border
    this.renderer.drawRect(
      GRID.CELL_SIZE * 2,
      GRID.CELL_SIZE * 2,
      GRID.WIDTH - GRID.CELL_SIZE * 4,
      GRID.HEIGHT - GRID.CELL_SIZE * 4,
      COLORS.BORDER,
      false
    );

    // Draw title (context-dependent)
    const title = this.stateMachine.getCurrentState() === GAME_STATES.EXPLORE ? 'FINDINGS' : 'INVENTORY';
    this.renderer.drawEntity(
      GRID.WIDTH / 2,
      GRID.CELL_SIZE * 3,
      title,
      COLORS.TEXT
    );

    const startY = GRID.CELL_SIZE * 5;
    const lineHeight = GRID.CELL_SIZE * 1.5;
    let index = 0;

    // Check if all inventories are empty
    const totalItems = this.player.inventory.length + this.armorInventory.length + this.consumableInventory.length;

    if (totalItems === 0) {
      this.renderer.drawEntity(
        GRID.WIDTH / 2,
        GRID.HEIGHT / 2,
        'Empty',
        COLORS.TEXT
      );
    } else {
      // Draw ingredients section
      if (this.player.inventory.length > 0) {
        // Section header
        this.renderer.fgCtx.fillStyle = COLORS.INGREDIENT;
        this.renderer.fgCtx.textAlign = 'left';
        this.renderer.fgCtx.fillText('INGREDIENTS', GRID.CELL_SIZE * 4, startY + index * lineHeight);
        this.renderer.fgCtx.textAlign = 'center';
        index++;

        // Count each ingredient type
        const ingredientCounts = {};
        for (const ingredient of this.player.inventory) {
          ingredientCounts[ingredient] = (ingredientCounts[ingredient] || 0) + 1;
        }

        // Draw each unique ingredient with count
        for (const [ingredient, count] of Object.entries(ingredientCounts)) {
          const y = startY + index * lineHeight;
          const data = this.getIngredientData(ingredient);

          // Draw ingredient character
          this.renderer.drawEntity(
            GRID.CELL_SIZE * 5,
            y,
            ingredient,
            COLORS.INGREDIENT
          );

          // Draw ingredient name and count
          const text = `${data.name} x${count}`;
          this.renderer.fgCtx.fillStyle = COLORS.TEXT;
          this.renderer.fgCtx.textAlign = 'left';
          this.renderer.fgCtx.fillText(text, GRID.CELL_SIZE * 7, y);
          this.renderer.fgCtx.textAlign = 'center';

          index++;
        }
        index++; // Extra space after section
      }

      // Draw armor section
      if (this.armorInventory.length > 0) {
        // Section header
        this.renderer.fgCtx.fillStyle = '#aaaaff';
        this.renderer.fgCtx.textAlign = 'left';
        this.renderer.fgCtx.fillText('ARMOR', GRID.CELL_SIZE * 4, startY + index * lineHeight);
        this.renderer.fgCtx.textAlign = 'center';
        index++;

        // Draw armor items
        for (const armor of this.armorInventory) {
          const y = startY + index * lineHeight;

          // Draw armor character
          this.renderer.drawEntity(
            GRID.CELL_SIZE * 5,
            y,
            armor.char,
            '#aaaaff'  // Blue color for armor
          );

          // Draw armor name
          this.renderer.fgCtx.fillStyle = COLORS.TEXT;
          this.renderer.fgCtx.textAlign = 'left';
          this.renderer.fgCtx.fillText(armor.data.name, GRID.CELL_SIZE * 7, y);
          this.renderer.fgCtx.textAlign = 'center';

          index++;
        }
        index++; // Extra space after section
      }

      // Draw consumables section
      if (this.consumableInventory.length > 0) {
        // Section header
        this.renderer.fgCtx.fillStyle = '#ffaa00';
        this.renderer.fgCtx.textAlign = 'left';
        this.renderer.fgCtx.fillText('CONSUMABLES', GRID.CELL_SIZE * 4, startY + index * lineHeight);
        this.renderer.fgCtx.textAlign = 'center';
        index++;

        // Draw consumable items
        for (const consumable of this.consumableInventory) {
          const y = startY + index * lineHeight;

          // Draw consumable character
          this.renderer.drawEntity(
            GRID.CELL_SIZE * 5,
            y,
            consumable.char,
            '#ffaa00'  // Orange color for consumables
          );

          // Draw consumable name
          this.renderer.fgCtx.fillStyle = COLORS.TEXT;
          this.renderer.fgCtx.textAlign = 'left';
          this.renderer.fgCtx.fillText(consumable.data.name, GRID.CELL_SIZE * 7, y);
          this.renderer.fgCtx.textAlign = 'center';

          index++;
        }
      }
    }
  }

  renderCraftingStation() {
    // Draw crafting cells
    this.renderer.drawCell(CRAFTING.LEFT_SLOT_X, CRAFTING.STATION_Y, '[', COLORS.BORDER);
    this.renderer.drawCell(CRAFTING.LEFT_SLOT_X + 1, CRAFTING.STATION_Y, ' ', COLORS.BORDER);
    this.renderer.drawCell(CRAFTING.LEFT_SLOT_X + 2, CRAFTING.STATION_Y, ']', COLORS.BORDER);

    this.renderer.drawCell(CRAFTING.CENTER_SLOT_X, CRAFTING.STATION_Y, '[', COLORS.BORDER);
    this.renderer.drawCell(CRAFTING.CENTER_SLOT_X + 1, CRAFTING.STATION_Y, ' ', COLORS.BORDER);
    this.renderer.drawCell(CRAFTING.CENTER_SLOT_X + 2, CRAFTING.STATION_Y, ']', COLORS.BORDER);

    this.renderer.drawCell(CRAFTING.RIGHT_SLOT_X, CRAFTING.STATION_Y, '[', COLORS.BORDER);
    this.renderer.drawCell(CRAFTING.RIGHT_SLOT_X + 1, CRAFTING.STATION_Y, ' ', COLORS.BORDER);
    this.renderer.drawCell(CRAFTING.RIGHT_SLOT_X + 2, CRAFTING.STATION_Y, ']', COLORS.BORDER);

    // Draw slot contents
    const state = this.craftingSystem.getState();
    if (state.leftSlot) {
      this.renderer.drawCell(CRAFTING.LEFT_SLOT_X + 1, CRAFTING.STATION_Y, state.leftSlot, COLORS.ITEM);
    }
    if (state.rightSlot) {
      this.renderer.drawCell(CRAFTING.RIGHT_SLOT_X + 1, CRAFTING.STATION_Y, state.rightSlot, COLORS.ITEM);
    }
    if (state.centerSlot) {
      this.renderer.drawCell(CRAFTING.CENTER_SLOT_X + 1, CRAFTING.STATION_Y, state.centerSlot, COLORS.ITEM);
    }
  }

  renderEquipmentSlots() {
    // Draw storage chest (top left)
    this.renderer.drawCell(EQUIPMENT.CHEST_X - 1, EQUIPMENT.CHEST_Y, '[', COLORS.BORDER);
    this.renderer.drawCell(EQUIPMENT.CHEST_X, EQUIPMENT.CHEST_Y, '#', '#8b4513'); // Chest icon
    this.renderer.drawCell(EQUIPMENT.CHEST_X + 1, EQUIPMENT.CHEST_Y, ']', COLORS.BORDER);

    // Draw armor slot (below chest)
    this.renderer.drawCell(EQUIPMENT.ARMOR_X - 1, EQUIPMENT.ARMOR_Y, '[', COLORS.BORDER);
    this.renderer.drawCell(EQUIPMENT.ARMOR_X, EQUIPMENT.ARMOR_Y, ' ', COLORS.BORDER);
    this.renderer.drawCell(EQUIPMENT.ARMOR_X + 1, EQUIPMENT.ARMOR_Y, ']', COLORS.BORDER);

    // Draw equipped armor
    if (this.equippedArmor) {
      this.renderer.drawCell(EQUIPMENT.ARMOR_X, EQUIPMENT.ARMOR_Y, this.equippedArmor.char, this.equippedArmor.color);
    }

    // Draw consumable slot 1 (right side)
    this.renderer.drawCell(EQUIPMENT.CONSUMABLE1_X - 1, EQUIPMENT.CONSUMABLE1_Y, '[', COLORS.BORDER);
    this.renderer.drawCell(EQUIPMENT.CONSUMABLE1_X, EQUIPMENT.CONSUMABLE1_Y, ' ', COLORS.BORDER);
    this.renderer.drawCell(EQUIPMENT.CONSUMABLE1_X + 1, EQUIPMENT.CONSUMABLE1_Y, ']', COLORS.BORDER);

    // Draw equipped consumable 1
    if (this.equippedConsumables[0]) {
      this.renderer.drawCell(EQUIPMENT.CONSUMABLE1_X, EQUIPMENT.CONSUMABLE1_Y, this.equippedConsumables[0].char, this.equippedConsumables[0].color);
    }

    // Draw consumable slot 2 (right side)
    this.renderer.drawCell(EQUIPMENT.CONSUMABLE2_X - 1, EQUIPMENT.CONSUMABLE2_Y, '[', COLORS.BORDER);
    this.renderer.drawCell(EQUIPMENT.CONSUMABLE2_X, EQUIPMENT.CONSUMABLE2_Y, ' ', COLORS.BORDER);
    this.renderer.drawCell(EQUIPMENT.CONSUMABLE2_X + 1, EQUIPMENT.CONSUMABLE2_Y, ']', COLORS.BORDER);

    // Draw equipped consumable 2
    if (this.equippedConsumables[1]) {
      this.renderer.drawCell(EQUIPMENT.CONSUMABLE2_X, EQUIPMENT.CONSUMABLE2_Y, this.equippedConsumables[1].char, this.equippedConsumables[1].color);
    }
  }

  updateUI() {
    if (!this.player) return;

    this.ui.hp.textContent = this.player.hp;
    this.ui.depth.textContent = this.depth;

    // Highlight inventory count when I key is pressed
    const inventoryCount = this.player.inventory.length + this.armorInventory.length + this.consumableInventory.length;
    if (this.keys.i) {
      this.ui.inventory.innerHTML = `<span style="color: ${COLORS.ITEM}">${inventoryCount}</span>`;
    } else {
      this.ui.inventory.textContent = inventoryCount;
    }

    // Show all 3 slots with active indicator and Q/E indicators
    // Example: Q [/] · ‡ E  (Gun active, slot 1 empty, Flame Sword in slot 2)
    const slots = this.player.quickSlots.map((item, idx) => {
      const isActive = idx === this.player.activeSlotIndex;
      const char = item ? item.char : '.';
      return isActive ? `[${char}]` : ` ${char} `;
    });

    // Highlight Q and E when pressed
    const qColor = this.keys.q ? COLORS.ITEM : '#ffffff';
    const eColor = this.keys.e ? COLORS.ITEM : '#ffffff';
    this.ui.heldItem.innerHTML = `<span style="color: ${qColor}">Q</span> ${slots.join(' ')} <span style="color: ${eColor}">E</span>`;

    // Armor display
    const armorChar = this.equippedArmor ? this.equippedArmor.char : '.';
    const armorColor = this.equippedArmor ? (this.equippedArmor.color || '#aaaaff') : '#444';
    this.ui.armorChar.textContent = armorChar;
    this.ui.armorChar.style.color = armorColor;

    // Consumable display — use player's copy during explore, fall back to this.equippedConsumables
    const consumables = (this.player && this.player.equippedConsumables)
      ? this.player.equippedConsumables
      : this.equippedConsumables;
    const consumableEls = [this.ui.consumableChar1, this.ui.consumableChar2];
    for (let i = 0; i < 2; i++) {
      const el = consumableEls[i];
      if (consumables[i]) {
        // Active slot: show item char
        el.textContent = consumables[i].char;

        // Color priority: flash white > cooldown gray > normal color
        if (this.consumableFlashSlot === i && this.consumableFlashTimer > 0) {
          // Flash white when activated
          el.style.color = '#ffffff';
        } else if (this.consumableCooldowns[i] > 0) {
          // Gray when on cooldown (reusable consumables)
          el.style.color = '#666666';
        } else {
          // Normal color when ready
          el.style.color = consumables[i].color || COLORS.ITEM;
        }
      } else if (this.spentConsumableSlots[i]) {
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

  openIngredientMenu(slot) {
    this.menuOpen = true;
    this.currentMenuSlot = slot;
    this.selectedMenuIndex = 0;

    // Get unique ingredients from inventory
    const uniqueIngredients = [...new Set(this.player.inventory)];
    this.menuItems = uniqueIngredients;

    this.renderMenu();
  }

  openEquipmentMenu(slotType) {
    this.menuOpen = true;
    this.currentMenuSlot = slotType;
    this.selectedMenuIndex = 0;

    // Get available items based on slot type
    const availableItems = [];

    if (slotType === 'armor') {
      // Get all armor from armor inventory
      for (const item of this.armorInventory) {
        if (!availableItems.find(i => i.char === item.char)) {
          availableItems.push(item);
        }
      }
    } else if (slotType === 'consumable1' || slotType === 'consumable2') {
      // Get all consumables from consumable inventory
      for (const item of this.consumableInventory) {
        if (!availableItems.find(i => i.char === item.char)) {
          availableItems.push(item);
        }
      }
    }

    this.menuItems = availableItems;
    this.renderMenu();
  }

  openChestRetrievalMenu() {
    this.menuOpen = true;
    this.currentMenuSlot = 'chest';
    this.selectedMenuIndex = 0;

    // List all items in chest for retrieval
    const menuOptions = [];

    for (const item of this.itemChest) {
      menuOptions.push({ action: 'retrieve', item: item, label: `${item.char} - ${item.data.name}` });
    }

    this.menuItems = menuOptions;
    this.renderMenu();
  }

  closeMenu() {
    this.menuOpen = false;
    this.currentMenuSlot = null;
    this.ui.menu.classList.add('hidden');
  }

  renderMenu() {
    if (!this.menuOpen) return;

    let title = 'Select Ingredient';
    if (this.currentMenuSlot === 'armor') title = 'Select Armor';
    if (this.currentMenuSlot === 'consumable1' || this.currentMenuSlot === 'consumable2') title = 'Select Consumable';
    if (this.currentMenuSlot === 'chest') title = 'Item Chest';

    let html = `<h3>${title}</h3>`;

    if (this.menuItems.length === 0) {
      html += '<div style="margin: 8px 0; color: #888;">Chest is empty</div>';
    }

    for (let i = 0; i < this.menuItems.length; i++) {
      const item = this.menuItems[i];
      const selected = i === this.selectedMenuIndex ? 'selected' : '';

      // Check if it's a chest menu option (has action and label)
      if (item.action) {
        html += `<div class="menu-item ${selected}">${item.label}</div>`;
      }
      // Check if it's an ingredient (string) or equipment item (object)
      else if (typeof item === 'string') {
        const data = this.getIngredientData(item);
        html += `<div class="menu-item ${selected}">${item} - ${data.name}</div>`;
      } else {
        // Equipment item (has char and data.name)
        html += `<div class="menu-item ${selected}">${item.char} - ${item.data.name}</div>`;
      }
    }

    this.ui.menu.innerHTML = html;
    this.ui.menu.classList.remove('hidden');
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
        const chestIndex = this.itemChest.indexOf(item);
        if (chestIndex > -1) {
          this.itemChest.splice(chestIndex, 1);
        }

        // If something was dropped (all slots full), put it back in chest and keep menu open
        if (droppedItem) {
          this.itemChest.push(droppedItem);
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
      // If there was previously equipped armor, return it to inventory
      if (this.equippedArmor) {
        this.armorInventory.push(this.equippedArmor);
      }

      // Remove selected armor from inventory and equip it
      const armorIndex = this.armorInventory.indexOf(selectedItem);
      if (armorIndex > -1) {
        this.armorInventory.splice(armorIndex, 1);
      }
      this.equippedArmor = selectedItem;

      this.saveGameState();
      this.renderer.markBackgroundDirty();
      this.closeMenu();
      this.updateUI();
      return;
    }

    if (this.currentMenuSlot === 'consumable1') {
      // If there was previously equipped consumable, return it to inventory
      if (this.equippedConsumables[0]) {
        this.consumableInventory.push(this.equippedConsumables[0]);
      }

      // Remove selected consumable from inventory and equip it
      const consumableIndex = this.consumableInventory.indexOf(selectedItem);
      if (consumableIndex > -1) {
        this.consumableInventory.splice(consumableIndex, 1);
      }
      this.equippedConsumables[0] = selectedItem;

      this.saveGameState();
      this.renderer.markBackgroundDirty();
      this.closeMenu();
      this.updateUI();
      return;
    }

    if (this.currentMenuSlot === 'consumable2') {
      // If there was previously equipped consumable, return it to inventory
      if (this.equippedConsumables[1]) {
        this.consumableInventory.push(this.equippedConsumables[1]);
      }

      // Remove selected consumable from inventory and equip it
      const consumableIndex = this.consumableInventory.indexOf(selectedItem);
      if (consumableIndex > -1) {
        this.consumableInventory.splice(consumableIndex, 1);
      }
      this.equippedConsumables[1] = selectedItem;

      this.saveGameState();
      this.renderer.markBackgroundDirty();
      this.closeMenu();
      this.updateUI();
      return;
    }

    // Handle crafting slots (ingredients)
    // Remove from player inventory
    this.player.removeIngredient(selectedItem);

    // Place in crafting slot
    if (this.currentMenuSlot === 'left') {
      this.craftingSystem.setLeftSlot(selectedItem);
    } else if (this.currentMenuSlot === 'right') {
      this.craftingSystem.setRightSlot(selectedItem);
    }

    // Save state
    this.saveGameState();

    // Mark background dirty to re-render
    this.renderer.markBackgroundDirty();

    this.closeMenu();
    this.updateUI();
  }

  getIngredientData(char) {
    const ingredients = {
      'f': { name: 'Fur' },
      't': { name: 'Teeth' },
      'g': { name: 'Goo' },
      'w': { name: 'Wing' },
      'c': { name: 'Coin' },
      'b': { name: 'Bone' },
      'm': { name: 'Meat' },
      's': { name: 'Scale' },
      'F': { name: 'Fire Essence' },
      'M': { name: 'Metal' },
      '~': { name: 'String' },
      '|': { name: 'Stick' }
    };
    return ingredients[char] || { name: 'Unknown' };
  }
}

// Start game when page loads
window.addEventListener('load', () => {
  new Game();
});
