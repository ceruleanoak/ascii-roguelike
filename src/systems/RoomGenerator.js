import { GRID, ROOM_TYPES, BACKGROUND_OBJECTS, WALL_STRUCTURES, WATER_STRUCTURES } from '../game/GameConfig.js';
import { getRandomEnemy, getZoneRandomEnemy, createBossEnemy } from '../data/enemies.js';
import { RECIPES } from '../data/recipes.js';
import { ZONES } from '../data/zones.js';
import { LETTER_TEMPLATES } from '../data/letterTemplates.js';
import { Enemy } from '../entities/Enemy.js';
import { Item } from '../entities/Item.js';
import { BackgroundObject } from '../entities/BackgroundObject.js';

export class RoomGenerator {
  constructor(exitSystem, zoneSystem = null) {
    this.currentDepth = 0;
    this.currentZoneWeights = null; // Store zone-specific weights
    this.currentEnvironmentColors = null; // Store blended zone colors
    this.currentLetterTemplate = null; // Store current room's letter template
    this.exitSystem = exitSystem; // Exit letter generation system
    this.zoneSystem = zoneSystem; // Zone progression system for color blending
    this.isGeneratingTunnel = false; // Flag to reduce rock formations in tunnel rooms
  }

  setDepth(depth) {
    this.currentDepth = depth;
  }

  // Check if a pixel position is inside the letter template's clearing zone OR vault structure
  isInClearingZone(pixelX, pixelY) {
    const gridX = Math.floor(pixelX / GRID.CELL_SIZE);
    const gridY = Math.floor(pixelY / GRID.CELL_SIZE);

    // Check vault structure bounds (if vault exists)
    if (this.currentVaultInfo) {
      const vault = this.currentVaultInfo;
      if (gridX >= vault.minCol && gridX <= vault.maxCol &&
          gridY >= vault.minRow && gridY <= vault.maxRow) {
        return true; // Inside vault structure - don't place background objects here
      }
    }

    // Check letter template clearing zone
    if (!this.currentLetterTemplate?.bgObjectRules?.clearingZone) {
      return false; // No clearing zone defined
    }

    const zone = this.currentLetterTemplate.bgObjectRules.clearingZone;

    // Check if position is within clearing zone bounds
    const minCol = zone.centerCol - Math.floor(zone.width / 2);
    const maxCol = zone.centerCol + Math.floor(zone.width / 2);
    const minRow = zone.centerRow - Math.floor(zone.height / 2);
    const maxRow = zone.centerRow + Math.floor(zone.height / 2);

    return gridX >= minCol && gridX <= maxCol && gridY >= minRow && gridY <= maxRow;
  }

  generateRoom(type = null, playerStartPos = null, zoneType = 'green', progressionColor = null, exitLetter = null) {
    // Reset vault info for new room (prevents vault bounds from affecting non-vault rooms)
    this.currentVaultInfo = null;

    // Look up letter template if provided
    this.currentLetterTemplate = exitLetter && LETTER_TEMPLATES[exitLetter] ? LETTER_TEMPLATES[exitLetter] : null;


    // CRITICAL: Check if this is a TUNNEL room (letter 'T')
    if (exitLetter === 'T') {
      type = ROOM_TYPES.TUNNEL;
    }

    // Determine room type if not specified
    if (!type) {
      type = this.determineRoomType();
    }

    const zone = ZONES[zoneType];

    const room = {
      type,
      depth: this.currentDepth,
      zone: zoneType,
      borderColor: zone.borderColor,
      collisionMap: this.createCollisionMap(type),
      enemies: [], // Legacy - will be deprecated
      enemiesPlane0: [], // Standard plane enemies (always visible)
      enemiesPlane1: [], // Tunnel plane enemies (only visible in tunnel)
      items: [],
      backgroundObjects: [],
      recipeSign: null, // Visual-only recipe hint (not a BackgroundObject)
      exits: this.exitSystem ? this.exitSystem.generateExits(this.currentDepth, type, zoneType, progressionColor) : { north: false, east: false, west: false, south: true },
      playerStartPos: playerStartPos,  // Store for enemy generation
      letterTemplate: this.currentLetterTemplate // Store template for later event checks
    };

    // Set zone-specific background object weights
    this.currentZoneWeights = zone.objectWeights;

    // Get blended environment colors (current zone + progression)
    if (this.zoneSystem) {
      this.currentEnvironmentColors = this.zoneSystem.getBlendedEnvironmentColors(zoneType);
      this.currentProgressionBlend = this.zoneSystem.getProgressionBlend(); // Store for feature spawning
    } else {
      // Fallback if no zoneSystem (shouldn't happen in normal gameplay)
      this.currentEnvironmentColors = zone.environmentColors;
      this.currentProgressionBlend = null;
    }

    // Generate room contents based on type
    switch (type) {
      case ROOM_TYPES.COMBAT:
        this.generateCombatRoom(room);
        break;
      case ROOM_TYPES.BOSS:
        this.generateBossRoom(room);
        break;
      case ROOM_TYPES.DISCOVERY:
        this.generateDiscoveryRoom(room);
        break;
      case ROOM_TYPES.CAMP:
        this.generateCampRoom(room);
        break;
      case ROOM_TYPES.TUNNEL:
        this.generateTunnelRoom(room);
        break;
    }

    // Generate ocean terrain if ocean template
    if (this.currentLetterTemplate?.oceanZone?.enabled) {
      this.generateOceanTerrain(room);
    }

    // Note: Secret events (shaking bushes) are applied at runtime when room is cleared
    // See main.js updateExploreState() where room.cleared = true

    // Spawn guaranteed items if template defines them (e.g., vault treasure)
    if (this.currentLetterTemplate?.guaranteedItems?.enabled) {
      this.spawnGuaranteedItems(room);
    }

    // Attach vault info if this is a vault room
    if (this.currentVaultInfo) {
      room.vaultInfo = this.currentVaultInfo;
      this.currentVaultInfo = null; // Reset for next room
    }

    return room;
  }

  determineRoomType() {
    const roll = Math.random();

    if (roll < 0.7) return ROOM_TYPES.COMBAT;
    if (roll < 0.8) return ROOM_TYPES.BOSS;
    if (roll < 0.9) return ROOM_TYPES.DISCOVERY;
    return ROOM_TYPES.CAMP;
  }

  // Determine which zone's features to use based on progression blend
  // Uses probabilistic approach: at 50% blend, 50% chance of target zone features
  getEffectiveZoneForFeatures(currentZone) {
    // Special zones (with unique environmental features) always use their own features
    // Don't allow progression to override lava/mud zones with water
    const currentZoneFeatures = ZONES[currentZone]?.environmentalFeatures;
    const currentHasSpecialFeatures = currentZoneFeatures?.liquidType || currentZoneFeatures?.mudBeds;

    if (currentHasSpecialFeatures) {
      return currentZone;
    }

    if (!this.currentProgressionBlend) {
      return currentZone; // No progression, use current zone
    }

    const { targetZone, blendPercent } = this.currentProgressionBlend;

    // Check if TARGET zone has special features (e.g., progressing TO red zone from green)
    const targetZoneFeatures = ZONES[targetZone]?.environmentalFeatures;
    const targetHasSpecialFeatures = targetZoneFeatures?.liquidType || targetZoneFeatures?.mudBeds;

    if (targetHasSpecialFeatures) {
      // If progressing TO a special zone, use target zone features at any blend > 0
      // This prevents water from spawning when transitioning to red zone
      return targetZone;
    }

    // Roll to determine if we use target zone features
    // At 25% blend → 25% chance of target zone
    // At 50% blend → 50% chance of target zone
    // At 100% blend → 100% chance (full transition)
    const useTargetFeatures = Math.random() < blendPercent;
    const effectiveZone = useTargetFeatures ? targetZone : currentZone;

    return effectiveZone;
  }

  createCollisionMap(roomType = ROOM_TYPES.COMBAT) {
    // Create empty collision map
    const map = [];
    for (let y = 0; y < GRID.ROWS; y++) {
      map[y] = [];
      for (let x = 0; x < GRID.COLS; x++) {
        map[y][x] = false;
      }
    }

    // Add border walls
    for (let x = 0; x < GRID.COLS; x++) {
      map[0][x] = true;
      map[GRID.ROWS - 1][x] = true;
    }
    for (let y = 0; y < GRID.ROWS; y++) {
      map[y][0] = true;
      map[y][GRID.COLS - 1] = true;
    }

    // Place wall structures (unless template forbids it)
    const allowWallStructures = this.currentLetterTemplate?.wallStructures?.allow !== false;
    if (allowWallStructures) {
      this.placeWallStructures(map, roomType);
    }

    // Place vault structure if template defines it
    if (this.currentLetterTemplate?.vaultStructure?.enabled) {
      this.placeVaultStructure(map);
    }

    // Clear areas near all exits to ensure player can spawn and access exits
    const centerX = Math.floor(GRID.COLS / 2);
    const centerY = Math.floor(GRID.ROWS / 2);
    const clearRadius = 2; // Clear 2 cells in each direction from spawn point

    // Clear North exit area (player spawns at row 2)
    for (let dy = 0; dy <= clearRadius; dy++) {
      for (let dx = -clearRadius; dx <= clearRadius; dx++) {
        const x = centerX + dx;
        const y = 2 + dy;
        if (x > 0 && x < GRID.COLS - 1 && y > 0 && y < GRID.ROWS - 1) {
          map[y][x] = false;
        }
      }
    }

    // Clear South exit area (player spawns at GRID.ROWS - 3)
    for (let dy = -clearRadius; dy <= 0; dy++) {
      for (let dx = -clearRadius; dx <= clearRadius; dx++) {
        const x = centerX + dx;
        const y = (GRID.ROWS - 3) + dy;
        if (x > 0 && x < GRID.COLS - 1 && y > 0 && y < GRID.ROWS - 1) {
          map[y][x] = false;
        }
      }
    }

    // Clear East exit area (player spawns at col GRID.COLS - 3)
    for (let dx = -clearRadius; dx <= 0; dx++) {
      for (let dy = -clearRadius; dy <= clearRadius; dy++) {
        const x = (GRID.COLS - 3) + dx;
        const y = centerY + dy;
        if (x > 0 && x < GRID.COLS - 1 && y > 0 && y < GRID.ROWS - 1) {
          map[y][x] = false;
        }
      }
    }

    // Clear West exit area (player spawns at col 2)
    for (let dx = 0; dx <= clearRadius; dx++) {
      for (let dy = -clearRadius; dy <= clearRadius; dy++) {
        const x = 2 + dx;
        const y = centerY + dy;
        if (x > 0 && x < GRID.COLS - 1 && y > 0 && y < GRID.ROWS - 1) {
          map[y][x] = false;
        }
      }
    }

    return map;
  }




  generateCombatRoom(room) {
    // Spawn 1-6 enemies based on depth
    const enemyCount = Math.min(1 + Math.floor(this.currentDepth / 2), 6);

    for (let i = 0; i < enemyCount; i++) {
      const enemyChar = getZoneRandomEnemy(this.currentDepth, room.zone);
      const pos = this.getRandomPosition(room.collisionMap, room.enemies, room.playerStartPos);
      const enemy = new Enemy(enemyChar, pos.x, pos.y, this.currentDepth);
      enemy.setCollisionMap(room.collisionMap);
      enemy.setBackgroundObjects(room.backgroundObjects);
      this.addEnemyToRoom(room, enemy);
    }

    // Add starting weapons in first room for combat demo
    if (this.currentDepth === 1) {
      // Add gun
      const gunPos = this.getRandomPosition(room.collisionMap, room.enemies, room.playerStartPos);
      const gun = new Item('/', gunPos.x, gunPos.y);
      room.items.push(gun);

      // Add sword
      const swordPos = this.getRandomPosition(room.collisionMap, [...room.enemies, gun], room.playerStartPos);
      const sword = new Item('†', swordPos.x, swordPos.y);
      room.items.push(sword);
    }

    // Generate background objects
    this.generateBackgroundObjects(room);

    // Ensure K rooms have at least one guaranteed key dropper
    this.ensureKeyDroppers(room);

    // Exits are locked until all enemies defeated
    room.exitsLocked = true;
  }

  generateBossRoom(room) {
    // Single boss enemy
    const boss = createBossEnemy(this.currentDepth);
    const pos = this.getRandomPosition(room.collisionMap, room.enemies, room.playerStartPos);
    const enemy = new Enemy(boss.char, pos.x, pos.y, this.currentDepth);
    enemy.hp = boss.hp;
    enemy.damage = boss.damage;
    enemy.color = boss.color;
    enemy.setCollisionMap(room.collisionMap);
    enemy.setBackgroundObjects(room.backgroundObjects);
    this.addEnemyToRoom(room, enemy);

    // Ensure first room always has at least one item
    if (this.currentDepth === 1) {
      const basicItems = ['/', '†'];
      const itemChar = basicItems[Math.floor(Math.random() * basicItems.length)];
      const itemPos = this.getRandomPosition(room.collisionMap, room.enemies, room.playerStartPos);
      const item = new Item(itemChar, itemPos.x, itemPos.y);
      room.items.push(item);
    }

    // Generate background objects
    this.generateBackgroundObjects(room);

    // Ensure K rooms have at least one guaranteed key dropper
    this.ensureKeyDroppers(room);

    // Exits are locked until all enemies defeated
    room.exitsLocked = true;
  }

  generateDiscoveryRoom(room) {
    // No enemies, guaranteed rare item
    const rareItems = ['⌂', '‡', ')', 'X', '⌘', '⟩', '⊤'];
    const itemChar = rareItems[Math.floor(Math.random() * rareItems.length)];
    const pos = this.getRandomPosition(room.collisionMap, room.enemies, room.playerStartPos);
    const item = new Item(itemChar, pos.x, pos.y);
    room.items.push(item);

    // Generate background objects
    this.generateBackgroundObjects(room);

    // Ensure K rooms have at least one guaranteed key dropper
    this.ensureKeyDroppers(room);

    // Exits are already generated by ExitSystem in generateRoom()
    // No need to override them here
  }

  generateCampRoom(room) {
    // No enemies, safe zone
    // Add some basic items
    const basicItems = ['/', '†'];
    const itemChar = basicItems[Math.floor(Math.random() * basicItems.length)];
    const pos = this.getRandomPosition(room.collisionMap, room.enemies, room.playerStartPos);
    const item = new Item(itemChar, pos.x, pos.y);
    room.items.push(item);

    // Generate background objects
    this.generateBackgroundObjects(room);

    // Exits are already generated by ExitSystem in generateRoom()
    // No need to override them here
  }

  generateTunnelRoom(room) {
    // Flag to reduce rock formations in tunnel rooms
    this.isGeneratingTunnel = true;

    // Random tunnel orientation
    const orientation = Math.random() < 0.5 ? 'horizontal' : 'vertical';

    // Random tunnel dimensions
    const width = 4 + Math.floor(Math.random() * 3); // 4-6 cells (increased from 3-5)
    const length = 6 + Math.floor(Math.random() * 7); // 6-12 cells

    // Calculate tunnel position (centered in room)
    const centerCol = Math.floor(GRID.COLS / 2);
    const centerRow = Math.floor(GRID.ROWS / 2);

    let tunnelBounds, wallChar, entranceAxis, entrances;

    if (orientation === 'horizontal') {
      // Horizontal tunnel: runs left-right across the room
      const startRow = centerRow - Math.floor(width / 2);
      const endRow = startRow + width - 1;
      const startCol = centerCol - Math.floor(length / 2);
      const endCol = startCol + length - 1;

      tunnelBounds = {
        minRow: startRow + 1, // Inside the tunnel (between walls)
        maxRow: endRow - 1,
        minCol: startCol,
        maxCol: endCol
      };

      wallChar = '-'; // Horizontal wall character
      entranceAxis = 'horizontal'; // Enter from left/right to switch planes

      // Place top and bottom tunnel walls
      for (let col = startCol; col <= endCol; col++) {
        // Top wall
        const topWall = new BackgroundObject(wallChar, col * GRID.CELL_SIZE, startRow * GRID.CELL_SIZE);
        room.backgroundObjects.push(topWall);
        room.collisionMap[startRow][col] = false; // Don't collide in normal plane

        // Bottom wall
        const bottomWall = new BackgroundObject(wallChar, col * GRID.CELL_SIZE, endRow * GRID.CELL_SIZE);
        room.backgroundObjects.push(bottomWall);
        room.collisionMap[endRow][col] = false; // Don't collide in normal plane
      }

      // Place entrance markers at left and right ends
      entrances = [];
      for (let row = tunnelBounds.minRow; row <= tunnelBounds.maxRow; row++) {
        // Left entrance (facing right - enter by moving right)
        const leftEntrance = new BackgroundObject('<', startCol * GRID.CELL_SIZE, row * GRID.CELL_SIZE);
        room.backgroundObjects.push(leftEntrance);
        entrances.push({ col: startCol, row, direction: 'left' });

        // Right entrance (facing left - enter by moving left)
        const rightEntrance = new BackgroundObject('>', endCol * GRID.CELL_SIZE, row * GRID.CELL_SIZE);
        room.backgroundObjects.push(rightEntrance);
        entrances.push({ col: endCol, row, direction: 'right' });
      }
    } else {
      // Vertical tunnel: runs top-bottom
      const startCol = centerCol - Math.floor(width / 2);
      const endCol = startCol + width - 1;
      const startRow = centerRow - Math.floor(length / 2);
      const endRow = startRow + length - 1;

      tunnelBounds = {
        minRow: startRow,
        maxRow: endRow,
        minCol: startCol + 1, // Inside the tunnel (between walls)
        maxCol: endCol - 1
      };

      wallChar = 'I'; // Vertical wall character
      entranceAxis = 'vertical'; // Enter from top/bottom to switch planes

      // Place left and right tunnel walls
      for (let row = startRow; row <= endRow; row++) {
        // Left wall
        const leftWall = new BackgroundObject(wallChar, startCol * GRID.CELL_SIZE, row * GRID.CELL_SIZE);
        room.backgroundObjects.push(leftWall);
        room.collisionMap[row][startCol] = false; // Don't collide in normal plane

        // Right wall
        const rightWall = new BackgroundObject(wallChar, endCol * GRID.CELL_SIZE, row * GRID.CELL_SIZE);
        room.backgroundObjects.push(rightWall);
        room.collisionMap[row][endCol] = false; // Don't collide in normal plane
      }

      // Place entrance markers at top and bottom ends
      entrances = [];
      for (let col = tunnelBounds.minCol; col <= tunnelBounds.maxCol; col++) {
        // Top entrance (facing down - enter by moving down)
        const topEntrance = new BackgroundObject('^', col * GRID.CELL_SIZE, startRow * GRID.CELL_SIZE);
        room.backgroundObjects.push(topEntrance);
        entrances.push({ col, row: startRow, direction: 'up' });

        // Bottom entrance (facing up - enter by moving up)
        const bottomEntrance = new BackgroundObject('v', col * GRID.CELL_SIZE, endRow * GRID.CELL_SIZE);
        room.backgroundObjects.push(bottomEntrance);
        entrances.push({ col, row: endRow, direction: 'down' });
      }
    }

    // Store tunnel metadata on room for plane switching logic
    room.tunnel = {
      orientation,
      bounds: tunnelBounds,
      entranceAxis,
      entrances // Store entrance positions for plane switching logic
    };

    // Generate background objects (grass, trees, etc.) with reduced rocks
    this.generateBackgroundObjects(room);

    // Reset tunnel flag
    this.isGeneratingTunnel = false;

    // Spawn 2-4 enemies (some inside tunnel, some outside)
    const enemyCount = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < enemyCount; i++) {
      const enemyChar = getZoneRandomEnemy(this.currentDepth, room.zone);
      const pos = this.getRandomPosition(room.collisionMap, room.enemies, room.playerStartPos);
      const enemy = new Enemy(enemyChar, pos.x, pos.y, this.currentDepth);
      enemy.setCollisionMap(room.collisionMap);
      enemy.setBackgroundObjects(room.backgroundObjects);
      this.addEnemyToRoom(room, enemy);
    }

    // Exits are locked until all enemies defeated
    room.exitsLocked = true;
  }

  generateOceanTerrain(room) {
    const oceanConfig = this.currentLetterTemplate.oceanZone;

    // Generate sand in transition zone (columns 18-21)
    for (let col = oceanConfig.sandStartCol; col <= oceanConfig.sandEndCol; col++) {
      for (let row = 1; row < GRID.ROWS - 1; row++) {
        // Random placement based on sand density
        if (Math.random() < oceanConfig.sandDensity) {
          const x = col * GRID.CELL_SIZE;
          const y = row * GRID.CELL_SIZE;

          // Check if position is clear (no walls, no existing objects)
          if (!room.collisionMap[row][col] && !this.hasObjectAt(room, x, y)) {
            const sand = new BackgroundObject('.', x, y);
            room.backgroundObjects.push(sand);
          }
        }
      }
    }

    // Generate water in ocean zone (columns 20-29)
    for (let col = oceanConfig.waterStartCol; col <= oceanConfig.waterEndCol; col++) {
      for (let row = 1; row < GRID.ROWS - 1; row++) {
        // Random placement based on water density
        if (Math.random() < oceanConfig.waterDensity) {
          const x = col * GRID.CELL_SIZE;
          const y = row * GRID.CELL_SIZE;

          // Check if position is clear (no walls, no existing objects)
          if (!room.collisionMap[row][col] && !this.hasObjectAt(room, x, y)) {
            const water = new BackgroundObject('~', x, y);
            room.backgroundObjects.push(water);
          }
        }
      }
    }

    // Disable east exit if configured
    if (this.currentLetterTemplate.exitRules?.disableEast) {
      room.exits.east = false;
    }
  }

  hasObjectAt(room, x, y) {
    // Check if there's already a background object at this pixel position
    const threshold = GRID.CELL_SIZE / 2; // Allow objects within half a cell
    return room.backgroundObjects.some(obj =>
      Math.abs(obj.position.x - x) < threshold &&
      Math.abs(obj.position.y - y) < threshold
    );
  }

  getRandomPosition(collisionMap, existingEnemies = [], playerStartPos = null) {
    let x, y;
    let attempts = 0;
    const MIN_SPACING = GRID.CELL_SIZE * 2; // Minimum distance between entities
    const PLAYER_BUFFER = GRID.CELL_SIZE * 3; // Larger buffer around player start
    const EXIT_CLEARANCE = 3; // Grid cells to clear around each exit

    // Calculate exit positions (matching createCollisionMap exit zones)
    const centerX = Math.floor(GRID.COLS / 2);
    const centerY = Math.floor(GRID.ROWS / 2);
    const exitZones = [
      { x: centerX, y: 2 },                    // North exit
      { x: centerX, y: GRID.ROWS - 3 },        // South exit
      { x: GRID.COLS - 3, y: centerY },        // East exit
      { x: 2, y: centerY }                     // West exit
    ];

    do {
      // Generate position avoiding 1-tile border (and 1 extra tile for safety)
      x = Math.floor(Math.random() * (GRID.COLS - 4)) + 2;
      y = Math.floor(Math.random() * (GRID.ROWS - 4)) + 2;

      const pixelX = x * GRID.CELL_SIZE;
      const pixelY = y * GRID.CELL_SIZE;

      // Check collision map
      if (collisionMap[y][x]) {
        attempts++;
        continue;
      }

      // Check distance from all 4 exit zones
      let tooCloseToExit = false;
      for (const exit of exitZones) {
        const distToExitX = Math.abs(x - exit.x);
        const distToExitY = Math.abs(y - exit.y);
        if (distToExitX <= EXIT_CLEARANCE && distToExitY <= EXIT_CLEARANCE) {
          tooCloseToExit = true;
          break;
        }
      }

      if (tooCloseToExit) {
        attempts++;
        continue;
      }

      // Check distance from player start position
      if (playerStartPos) {
        const distToPlayer = Math.sqrt(
          Math.pow(pixelX - playerStartPos.x, 2) +
          Math.pow(pixelY - playerStartPos.y, 2)
        );
        if (distToPlayer < PLAYER_BUFFER) {
          attempts++;
          continue;
        }
      }

      // Check distance from existing enemies
      let tooCloseToEnemy = false;
      for (const enemy of existingEnemies) {
        const distToEnemy = Math.sqrt(
          Math.pow(pixelX - enemy.position.x, 2) +
          Math.pow(pixelY - enemy.position.y, 2)
        );
        if (distToEnemy < MIN_SPACING) {
          tooCloseToEnemy = true;
          break;
        }
      }

      if (tooCloseToEnemy) {
        attempts++;
        continue;
      }

      // Valid position found
      break;
    } while (attempts < 100);

    return {
      x: x * GRID.CELL_SIZE,
      y: y * GRID.CELL_SIZE
    };
  }

  generateBackgroundObjects(room) {
    // Generate tall grass (very common, large swaths)
    const grassClusters = this.generateGrassSwaths(room);

    // Generate recipe sign (10% chance) - positioned within grass clusters for natural obscuration
    this.generateRecipeSign(room, grassClusters);

    // Generate organic clusters (trees, bushes, brambles)
    this.generateOrganicClusters(room);

    // Determine effective zone for feature generation (considering progression)
    const effectiveZone = this.getEffectiveZoneForFeatures(room.zone);
    const zoneHasSpecialLiquid = ZONES[effectiveZone]?.environmentalFeatures?.liquidType;

    // Structured liquid (depth 3+, or always in zones with special liquids like lava)
    if (this.currentDepth >= 3 || zoneHasSpecialLiquid) {
      this.placeLiquidStructures(room, effectiveZone);
    }

    // Organic fallback liquid (shallow depths, or occasional supplement deeper)
    // Always generate in special liquid zones (RED = lava), otherwise use random chance
    const shouldGenerateLiquid = zoneHasSpecialLiquid ||
                                  (this.currentDepth < 3 && Math.random() < 0.3) ||
                                  (this.currentDepth >= 3 && Math.random() < 0.2);

    if (shouldGenerateLiquid && !zoneHasSpecialLiquid) {
      // Only generate fallback if we didn't already generate structured special liquid
      this.generateLiquidFormation(room, effectiveZone);
    } else if (zoneHasSpecialLiquid && Math.random() < 0.5) {
      // 50% chance of additional organic lava formations
      this.generateLiquidFormation(room, effectiveZone);
    }

    // Zone-specific features (mud beds in RED zone)
    const zone = ZONES[effectiveZone];
    if (zone?.environmentalFeatures?.mudBeds) {
      this.generateMudBeds(room, zone.environmentalFeatures);
    }

    // Generate mineral formations (rocks, crystals, boulders)
    this.generateMineralFormations(room);

    // Generate random individual objects based on depth
    this.generateDepthBasedObjects(room, effectiveZone);

    // Letter template: Generate corner clusters if specified
    if (this.currentLetterTemplate?.bgObjectRules?.cornerClusters?.enabled) {
      this.generateCornerClusters(room);
    }
  }

  generateGrassSwaths(room) {
    // Check grass density: template overrides zone (default 100%)
    const zone = ZONES[room.zone];
    const features = zone?.environmentalFeatures;
    let grassDensity = features?.grassDensity !== undefined ? features.grassDensity : 1.0;

    // Letter template grass density overrides zone density
    if (this.currentLetterTemplate?.bgObjectRules?.grassDensity !== undefined) {
      grassDensity = this.currentLetterTemplate.bgObjectRules.grassDensity;
    }

    const grassPreburned = features?.grassPreburned || false;

    // Generate 4-7 dense clusters of tall grass (scaled by density)
    const baseSwathCount = this.randInt(4, 7);
    const swathCount = Math.max(1, Math.round(baseSwathCount * grassDensity));
    const clusters = []; // Track cluster positions for recipe sign placement

    for (let i = 0; i < swathCount; i++) {
      const centerPos = this.getRandomPosition(room.collisionMap, room.enemies, room.playerStartPos);
      const baseSwathSize = this.randInt(20, 40);
      const swathSize = Math.round(baseSwathSize * grassDensity); // Scale by density
      const swathRadius = this.randInt(32, 64); // Tight clustering

      // Store cluster info
      clusters.push({ center: centerPos, radius: swathRadius });

      for (let j = 0; j < swathSize; j++) {
        const angle = Math.random() * Math.PI * 2;
        // Square root for more even distribution
        const dist = Math.sqrt(Math.random()) * swathRadius;
        const pos = {
          x: centerPos.x + Math.cos(angle) * dist,
          y: centerPos.y + Math.sin(angle) * dist
        };

        // Check bounds
        if (pos.x >= GRID.CELL_SIZE && pos.x < GRID.WIDTH - GRID.CELL_SIZE &&
            pos.y >= GRID.CELL_SIZE && pos.y < GRID.HEIGHT - GRID.CELL_SIZE) {
          // Create grass (use cut grass ',' for pre-burned zones)
          const grassChar = grassPreburned ? ',' : '|';
          const grass1 = new BackgroundObject(grassChar, pos.x, pos.y);
          const grass2 = new BackgroundObject(grassChar, pos.x + 6, pos.y);

          // Apply zone grass color (or burned color for pre-burned)
          if (grassPreburned) {
            // Burned grass color
            grass1.color = '#443322';
            grass1.animationColor = '#443322';
            grass1.flammability = 'none';
            grass1.burnt = true;
            grass2.color = '#443322';
            grass2.animationColor = '#443322';
            grass2.flammability = 'none';
            grass2.burnt = true;
          } else if (this.currentEnvironmentColors) {
            // Normal zone grass color
            grass1.color = this.currentEnvironmentColors.grass;
            grass1.animationColor = this.currentEnvironmentColors.grass;
            grass2.color = this.currentEnvironmentColors.grass;
            grass2.animationColor = this.currentEnvironmentColors.grass;
          }

          // Check clearing zone before placing grass
          if (!this.isInClearingZone(pos.x, pos.y)) {
            room.backgroundObjects.push(grass1);
            room.backgroundObjects.push(grass2);
          }
        }
      }
    }

    return clusters; // Return cluster positions for recipe sign placement
  }

  generateCornerClusters(room) {
    const config = this.currentLetterTemplate.bgObjectRules.cornerClusters;
    const corners = [
      { x: 3 * GRID.CELL_SIZE, y: 3 * GRID.CELL_SIZE },                       // Top-left
      { x: (GRID.COLS - 4) * GRID.CELL_SIZE, y: 3 * GRID.CELL_SIZE },        // Top-right
      { x: 3 * GRID.CELL_SIZE, y: (GRID.ROWS - 4) * GRID.CELL_SIZE },        // Bottom-left
      { x: (GRID.COLS - 4) * GRID.CELL_SIZE, y: (GRID.ROWS - 4) * GRID.CELL_SIZE } // Bottom-right
    ];

    for (const cornerPos of corners) {
      for (let i = 0; i < config.clusterSize; i++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * config.clusterRadius;
        const pos = {
          x: cornerPos.x + Math.cos(angle) * dist,
          y: cornerPos.y + Math.sin(angle) * dist
        };

        // Check bounds
        if (pos.x >= GRID.CELL_SIZE && pos.x < GRID.WIDTH - GRID.CELL_SIZE &&
            pos.y >= GRID.CELL_SIZE && pos.y < GRID.HEIGHT - GRID.CELL_SIZE &&
            !this.isInClearingZone(pos.x, pos.y)) {
          const char = config.objectTypes[Math.floor(Math.random() * config.objectTypes.length)];
          const bgObject = new BackgroundObject(char, pos.x, pos.y);
          this.applyZoneProperties(bgObject, room.zone);

          // Mark as key dropper in K rooms
          this.applyKeyDropLogic(bgObject);

          room.backgroundObjects.push(bgObject);
        }
      }
    }
  }

  generateOrganicClusters(room) {
    const clusterCount = this.currentDepth < 5 ? this.randInt(2, 3) : this.randInt(3, 5);
    const organicChars = ['%', '&', '+', 'Y'];
    const zone = ZONES[room.zone];
    const preSpawnBurned = zone?.preSpawnBurned || false;

    for (let i = 0; i < clusterCount; i++) {
      const centerPos = this.getRandomPosition(room.collisionMap, room.enemies, room.playerStartPos);
      const char = organicChars[Math.floor(Math.random() * organicChars.length)];
      const size = this.randInt(3, 6);
      const radius = this.randInt(48, 96);

      for (let j = 0; j < size; j++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * radius;
        const pos = {
          x: centerPos.x + Math.cos(angle) * dist,
          y: centerPos.y + Math.sin(angle) * dist
        };

        // Check bounds
        if (pos.x >= GRID.CELL_SIZE && pos.x < GRID.WIDTH - GRID.CELL_SIZE &&
            pos.y >= GRID.CELL_SIZE && pos.y < GRID.HEIGHT - GRID.CELL_SIZE) {
          const bgObject = new BackgroundObject(char, pos.x, pos.y);
          this.applyZoneProperties(bgObject, room.zone);

          // Pre-spawn as burned/damaged if zone requires it
          if (preSpawnBurned && bgObject.onFire !== undefined) {
            // Set to burned/charred appearance (dark, non-flammable)
            bgObject.flammability = 'none';
            // Darken the color more for burned effect
            const currentColor = bgObject.color;
            bgObject.color = this.darkenColor(currentColor, 0.5); // 50% darker
            bgObject.animationColor = bgObject.color;
          }

          // Check clearing zone before placing object
          if (!this.isInClearingZone(pos.x, pos.y)) {
            // Mark as key dropper in K rooms
            this.applyKeyDropLogic(bgObject);

            room.backgroundObjects.push(bgObject);
          }
        }
      }
    }
  }

  generateWaterFormation(room) {
    const formationType = ['pool', 'lake', 'stream'][Math.floor(Math.random() * 3)];
    let puddleCount;

    if (formationType === 'pool') {
      puddleCount = this.randInt(10, 20);
      const centerPos = this.getRandomPosition(room.collisionMap, room.enemies, room.playerStartPos);
      const radius = this.randInt(40, 80);

      for (let i = 0; i < puddleCount; i++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * radius;
        const pos = {
          x: centerPos.x + Math.cos(angle) * dist,
          y: centerPos.y + Math.sin(angle) * dist
        };

        if (pos.x >= GRID.CELL_SIZE && pos.x < GRID.WIDTH - GRID.CELL_SIZE &&
            pos.y >= GRID.CELL_SIZE && pos.y < GRID.HEIGHT - GRID.CELL_SIZE) {
          const puddle = new BackgroundObject('~', pos.x, pos.y);
          room.backgroundObjects.push(puddle);
        }
      }
    } else if (formationType === 'lake' && this.currentDepth >= 5) {
      puddleCount = this.randInt(30, 60);
      const centerPos = this.getRandomPosition(room.collisionMap, room.enemies, room.playerStartPos);
      const radiusCells = 4;

      for (let i = 0; i < puddleCount; i++) {
        // Grid-cell snapped positions within 4-cell radius for dense coverage
        const offsetCols = Math.round((Math.random() * 2 - 1) * radiusCells);
        const offsetRows = Math.round((Math.random() * 2 - 1) * radiusCells);
        const pos = {
          x: centerPos.x + offsetCols * GRID.CELL_SIZE,
          y: centerPos.y + offsetRows * GRID.CELL_SIZE
        };

        if (pos.x >= GRID.CELL_SIZE && pos.x < GRID.WIDTH - GRID.CELL_SIZE &&
            pos.y >= GRID.CELL_SIZE && pos.y < GRID.HEIGHT - GRID.CELL_SIZE) {
          const puddle = new BackgroundObject('~', pos.x, pos.y);
          room.backgroundObjects.push(puddle);
        }
      }
    } else if (formationType === 'stream') {
      puddleCount = this.randInt(15, 25);
      const startPos = this.getRandomPosition(room.collisionMap, room.enemies, room.playerStartPos);
      const angle = Math.random() * Math.PI * 2;

      for (let i = 0; i < puddleCount; i++) {
        // 3-cell-wide band: ±1 cell perpendicular scatter
        const perpOffset = (Math.round(Math.random() * 2) - 1) * GRID.CELL_SIZE;
        const pos = {
          x: startPos.x + Math.cos(angle) * i * GRID.CELL_SIZE + Math.cos(angle + Math.PI / 2) * perpOffset,
          y: startPos.y + Math.sin(angle) * i * GRID.CELL_SIZE + Math.sin(angle + Math.PI / 2) * perpOffset
        };

        if (pos.x >= GRID.CELL_SIZE && pos.x < GRID.WIDTH - GRID.CELL_SIZE &&
            pos.y >= GRID.CELL_SIZE && pos.y < GRID.HEIGHT - GRID.CELL_SIZE) {
          const puddle = new BackgroundObject('~', pos.x, pos.y);
          room.backgroundObjects.push(puddle);
        }
      }
    }
  }

  placeWaterStructures(room) {
    const eligible = Object.values(WATER_STRUCTURES).filter(s => s.roomTypes.includes(room.type));
    if (!eligible.length) return;

    const maxCount = this.currentDepth < 5 ? 1 : this.currentDepth < 10 ? 2 : 3;
    const count = this.randInt(0, maxCount);

    for (let i = 0; i < count; i++) {
      const structure = this._pickWeightedWaterStructure(eligible);
      const rotations = structure.allowRotation ? this.randInt(0, 3) * 90 : 0;
      const pattern = this.rotatePattern(structure.pattern, rotations);

      let placed = false;
      for (let attempt = 0; attempt < 50 && !placed; attempt++) {
        const col = this.randInt(2, GRID.COLS - 2 - pattern[0].length);
        const row = this.randInt(2, GRID.ROWS - 2 - pattern.length);

        if (this._canPlaceWaterStructure(room.collisionMap, pattern, col, row)) {
          this._stampWaterStructure(room, pattern, col, row);
          placed = true;
        }
      }
    }
  }

  _pickWeightedWaterStructure(eligible) {
    const totalWeight = eligible.reduce((sum, s) => sum + s.weight, 0);
    let roll = Math.random() * totalWeight;
    for (const s of eligible) {
      roll -= s.weight;
      if (roll <= 0) return s;
    }
    return eligible[eligible.length - 1];
  }

  _canPlaceWaterStructure(collisionMap, pattern, startCol, startRow) {
    const clearRadius = 2;
    const midCol = Math.floor(GRID.COLS / 2);
    const midRow = Math.floor(GRID.ROWS / 2);

    for (let py = 0; py < pattern.length; py++) {
      for (let px = 0; px < pattern[py].length; px++) {
        if (!pattern[py][px]) continue;
        const col = startCol + px, row = startRow + py;
        if (collisionMap[row] && collisionMap[row][col]) return false; // on a wall
        // Protect exits
        if (Math.abs(col - midCol) <= clearRadius && row <= clearRadius + 2) return false;
        if (Math.abs(col - midCol) <= clearRadius && row >= GRID.ROWS - clearRadius - 3) return false;
        if (Math.abs(row - midRow) <= clearRadius && col <= clearRadius + 2) return false;
        if (Math.abs(row - midRow) <= clearRadius && col >= GRID.COLS - clearRadius - 3) return false;
      }
    }
    return true;
  }

  _stampWaterStructure(room, pattern, startCol, startRow) {
    for (let py = 0; py < pattern.length; py++) {
      for (let px = 0; px < pattern[py].length; px++) {
        if (pattern[py][px]) {
          const obj = new BackgroundObject('~',
            (startCol + px) * GRID.CELL_SIZE,
            (startRow + py) * GRID.CELL_SIZE
          );
          room.backgroundObjects.push(obj);
        }
      }
    }
  }

  // Zone-aware liquid placement (water in GREEN, lava in RED, etc.)
  placeLiquidStructures(room, effectiveZone = null) {
    const zoneType = effectiveZone || room.zone;

    const zone = ZONES[zoneType];
    const features = zone?.environmentalFeatures;

    if (features && features.liquidType === 'lava') {
      // RED zone: place lava structures
      this.placeLavaStructures(room, features);
    } else {
      // Default: place water structures
      this.placeWaterStructures(room);
    }
  }

  placeLavaStructures(room, features) {
    // Lava uses same structures as water but with different properties
    const eligible = Object.values(WATER_STRUCTURES).filter(s => s.roomTypes.includes(room.type));
    if (!eligible.length) return;

    const maxCount = this.currentDepth < 5 ? 1 : this.currentDepth < 10 ? 2 : 3;
    const count = this.randInt(0, maxCount);

    for (let i = 0; i < count; i++) {
      const structure = this._pickWeightedWaterStructure(eligible);
      const rotations = structure.allowRotation ? this.randInt(0, 3) * 90 : 0;
      const pattern = this.rotatePattern(structure.pattern, rotations);

      let placed = false;
      for (let attempt = 0; attempt < 50 && !placed; attempt++) {
        const col = this.randInt(2, GRID.COLS - 2 - pattern[0].length);
        const row = this.randInt(2, GRID.ROWS - 2 - pattern.length);

        if (this._canPlaceWaterStructure(room.collisionMap, pattern, col, row)) {
          this._stampLavaStructure(room, pattern, col, row, features);
          placed = true;
        }
      }
    }
  }

  _stampLavaStructure(room, pattern, startCol, startRow, features) {
    for (let py = 0; py < pattern.length; py++) {
      for (let px = 0; px < pattern[py].length; px++) {
        if (pattern[py][px]) {
          const obj = new BackgroundObject(
            features.liquidChar,
            (startCol + px) * GRID.CELL_SIZE,
            (startRow + py) * GRID.CELL_SIZE
          );
          obj.color = features.liquidColor;
          obj.animationColor = features.liquidColor;
          obj.damaging = true;
          obj.damage = features.liquidDamage;
          obj.name = 'Lava';
          room.backgroundObjects.push(obj);
        }
      }
    }
  }

  generateLiquidFormation(room, effectiveZone = null) {
    const zoneType = effectiveZone || room.zone;

    const zone = ZONES[zoneType];
    const features = zone?.environmentalFeatures;

    if (features && features.liquidType === 'lava') {
      this.generateLavaFormation(room, features);
    } else {
      this.generateWaterFormation(room);
    }
  }

  generateLavaFormation(room, features) {
    const formations = this.randInt(1, 2);

    for (let i = 0; i < formations; i++) {
      const centerX = this.randInt(4, GRID.COLS - 4);
      const centerY = this.randInt(4, GRID.ROWS - 4);
      const size = this.randInt(2, 4);

      for (let dx = -size; dx <= size; dx++) {
        for (let dy = -size; dy <= size; dy++) {
          if (Math.sqrt(dx * dx + dy * dy) <= size && Math.random() < 0.7) {
            const x = centerX + dx;
            const y = centerY + dy;

            if (this.isValidPosition(x, y, room)) {
              const obj = new BackgroundObject(
                features.liquidChar,
                x * GRID.CELL_SIZE,
                y * GRID.CELL_SIZE
              );
              obj.color = features.liquidColor;
              obj.animationColor = features.liquidColor;
              obj.damaging = true;
              obj.damage = features.liquidDamage;
              obj.name = 'Lava';
              room.backgroundObjects.push(obj);
            }
          }
        }
      }
    }
  }

  generateMineralFormations(room) {
    // Reduce rock formations in tunnel rooms (0-1 instead of 1-3)
    const formationCount = this.isGeneratingTunnel ? this.randInt(0, 1) : this.randInt(1, 3);
    const zone = ZONES[room.zone];
    const features = zone?.environmentalFeatures;

    // Use zone-specific rock variants if available (RED zone has gemstones)
    let rockData = [];
    if (features && features.rockVariants) {
      rockData = features.rockVariants;
    } else {
      // Default rock selection
      const mineralChars = this.currentDepth < 10 ? ['0'] : ['0', '*', 'Q'];
      rockData = mineralChars.map(char => ({ char, dropTable: 'basic' }));
    }

    for (let i = 0; i < formationCount; i++) {
      const centerPos = this.getRandomPosition(room.collisionMap, room.enemies, room.playerStartPos);
      const rockVariant = rockData[Math.floor(Math.random() * rockData.length)];
      const size = this.randInt(2, 4);
      const spacing = this.randInt(24, 48);

      for (let j = 0; j < size; j++) {
        const angle = (j / size) * Math.PI * 2;
        const pos = {
          x: centerPos.x + Math.cos(angle) * spacing,
          y: centerPos.y + Math.sin(angle) * spacing
        };

        if (pos.x >= GRID.CELL_SIZE && pos.x < GRID.WIDTH - GRID.CELL_SIZE &&
            pos.y >= GRID.CELL_SIZE && pos.y < GRID.HEIGHT - GRID.CELL_SIZE) {
          const bgObject = new BackgroundObject(rockVariant.char, pos.x, pos.y);
          bgObject.dropTable = rockVariant.dropTable;  // Set drop table for zone-specific drops
          this.applyZoneProperties(bgObject, room.zone);
          room.backgroundObjects.push(bgObject);
        }
      }
    }
  }

  generateDepthBasedObjects(room, effectiveZone = null) {
    const weights = this.getObjectWeights(this.currentDepth);
    const objectCount = this.randInt(2, 5);

    // Use effectiveZone if provided, otherwise fall back to room.zone
    const zoneType = effectiveZone || room.zone;
    const zone = ZONES[zoneType];
    const features = zone?.environmentalFeatures;

    for (let i = 0; i < objectCount; i++) {
      const char = this.weightedRandomChoice(weights);
      const pos = this.getRandomPosition(room.collisionMap, room.enemies, room.playerStartPos);

      const bgObject = new BackgroundObject(char, pos.x, pos.y);

      // Special handling for liquid objects in zones with special liquids
      if (char === '~' && features?.liquidType === 'lava') {
        // Convert water to lava
        bgObject.color = features.liquidColor;
        bgObject.animationColor = features.liquidColor;
        bgObject.damaging = true;
        bgObject.damage = features.liquidDamage;
        bgObject.name = 'Lava';
      }

      this.applyZoneProperties(bgObject, zoneType);

      // Mark as key dropper in K rooms
      this.applyKeyDropLogic(bgObject);

      room.backgroundObjects.push(bgObject);
    }
  }

  isValidPosition(x, y, room) {
    // Check bounds (not on border walls)
    if (x < 1 || x >= GRID.COLS - 1 || y < 1 || y >= GRID.ROWS - 1) {
      return false;
    }

    // Check collision map
    if (room.collisionMap[y][x]) {
      return false;
    }

    // Check exit clearance zones
    const centerX = Math.floor(GRID.COLS / 2);
    const centerY = Math.floor(GRID.ROWS / 2);
    const clearRadius = 2;

    // North exit
    if (Math.abs(x - centerX) <= clearRadius && Math.abs(y - 2) <= clearRadius) {
      return false;
    }
    // South exit
    if (Math.abs(x - centerX) <= clearRadius && Math.abs(y - (GRID.ROWS - 3)) <= clearRadius) {
      return false;
    }
    // East exit
    if (Math.abs(x - (GRID.COLS - 3)) <= clearRadius && Math.abs(y - centerY) <= clearRadius) {
      return false;
    }
    // West exit
    if (Math.abs(x - 2) <= clearRadius && Math.abs(y - centerY) <= clearRadius) {
      return false;
    }

    return true;
  }

  generateMudBeds(room, features) {
    const mudCount = this.randInt(3, 7);

    for (let i = 0; i < mudCount; i++) {
      const size = this.randInt(4, 8);
      const startX = this.randInt(5, GRID.COLS - 5);
      const startY = this.randInt(5, GRID.ROWS - 5);

      for (let j = 0; j < size; j++) {
        const x = startX + this.randInt(-2, 2);
        const y = startY + this.randInt(-2, 2);

        if (this.isValidPosition(x, y, room)) {
          const mud = new BackgroundObject(
            features.mudChar,
            x * GRID.CELL_SIZE,
            y * GRID.CELL_SIZE
          );
          mud.color = features.mudColorDry;  // Start dry (light brown)
          mud.animationColor = features.mudColorDry;
          mud.isDryMud = true;  // Flag for physics system
          mud.slowing = false;  // Not slowing until walked on
          mud.name = 'Dry Mud';
          room.backgroundObjects.push(mud);
        }
      }
    }
  }

  generateRecipeSign(room, grassClusters) {
    // 13% chance to generate a recipe sign (secret message in the earth)
    if (Math.random() >= 0.13) return;
    if (!grassClusters || grassClusters.length === 0) return; // Need grass to hide the sign

    // Select random recipe
    const recipe = RECIPES[Math.floor(Math.random() * RECIPES.length)];

    // Pick a random grass cluster to place sign within
    const cluster = grassClusters[Math.floor(Math.random() * grassClusters.length)];

    // Place sign near cluster center (within inner 50% of radius for good grass coverage)
    let placed = false;
    for (let attempt = 0; attempt < 30 && !placed; attempt++) {
      // Random position within 50% of cluster radius
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * (cluster.radius * 0.5);
      const signX = cluster.center.x + Math.cos(angle) * dist;
      const signY = cluster.center.y + Math.sin(angle) * dist;

      // Convert to grid position
      const startCol = Math.floor(signX / GRID.CELL_SIZE);
      const startRow = Math.floor(signY / GRID.CELL_SIZE);

      // Check if position is valid (in bounds and no walls)
      if (startRow >= 2 && startRow < GRID.ROWS - 2 &&
          startCol >= 2 && startCol < GRID.COLS - 11 &&
          this.canPlaceSign(room, startRow, startCol)) {
        this.stampRecipeSign(room, recipe, startRow, startCol);
        placed = true;
      }
    }
  }

  canPlaceSign(room, startRow, startCol) {
    const SIGN_HEIGHT = 1;
    const SIGN_WIDTH = 11;

    // Check collision map for walls
    for (let row = startRow; row < startRow + SIGN_HEIGHT; row++) {
      for (let col = startCol; col < startCol + SIGN_WIDTH; col++) {
        if (room.collisionMap[row][col]) {
          return false; // Overlaps with wall
        }
      }
    }

    // Check for overlaps with solid background objects
    for (const bgObj of room.backgroundObjects) {
      if (bgObj.data.solid) {
        const objCol = Math.floor(bgObj.position.x / GRID.CELL_SIZE);
        const objRow = Math.floor(bgObj.position.y / GRID.CELL_SIZE);

        if (objCol >= startCol && objCol < startCol + SIGN_WIDTH &&
            objRow >= startRow && objRow < startRow + SIGN_HEIGHT) {
          return false; // Overlaps with solid object
        }
      }
    }

    return true;
  }

  stampRecipeSign(room, recipe, startRow, startCol) {
    // Secret message in the earth: X + Y = Z
    // Store as simple visual data (NOT BackgroundObject to avoid conflicts with water/etc)
    const EARTH_COLOR = '#333333'; // Dark gray - mysterious writing in the earth

    const pattern = [
      { col: 0, char: recipe.left },   // Recipe left item
      { col: 2, char: '+' },           // Plus operator
      { col: 4, char: recipe.right },  // Recipe right item
      { col: 6, char: '=' },           // Equals operator
      { col: 8, char: recipe.result }  // Recipe result
    ];

    // Store as simple data for rendering
    const characters = [];
    for (const { col, char } of pattern) {
      characters.push({
        char,
        x: (startCol + col) * GRID.CELL_SIZE,
        y: startRow * GRID.CELL_SIZE,
        color: EARTH_COLOR
      });
    }

    room.recipeSign = {
      recipe,
      characters
    };
  }

  getObjectWeights(depth) {
    // Use zone-specific weights if available, otherwise fall back to depth-based
    if (this.currentZoneWeights) {
      return this.currentZoneWeights;
    }

    // Fallback to depth-based weights for backwards compatibility
    if (depth < 5) {
      return {
        '%': 0.25,
        '&': 0.20,
        '0': 0.20,
        '=': 0.10,
        '#': 0.15,
        '+': 0.10
      };
    } else if (depth < 10) {
      return {
        '%': 0.15,
        '&': 0.15,
        '0': 0.10,
        '#': 0.10,
        '+': 0.10,
        'Y': 0.10,
        'n': 0.10,
        '*': 0.05,
        'p': 0.05,
        '~': 0.10
      };
    } else {
      return {
        '0': 0.10,
        '#': 0.05,
        'Y': 0.10,
        'n': 0.10,
        '*': 0.15,
        'B': 0.10,
        'Q': 0.10,
        '~': 0.10,
        'p': 0.10,
        '8': 0.05,
        'i': 0.05
      };
    }
  }

  weightedRandomChoice(weights) {
    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    let random = Math.random() * total;

    for (const [char, weight] of Object.entries(weights)) {
      random -= weight;
      if (random <= 0) {
        return char;
      }
    }

    return Object.keys(weights)[0];
  }

  randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  // Darken a hex color by a percentage (0.5 = 50% darker)
  darkenColor(hexColor, percent) {
    const parseHex = (hex) => {
      const clean = hex.replace('#', '');
      return {
        r: parseInt(clean.substring(0, 2), 16),
        g: parseInt(clean.substring(2, 4), 16),
        b: parseInt(clean.substring(4, 6), 16)
      };
    };

    const rgb = parseHex(hexColor);
    const r = Math.round(rgb.r * (1 - percent));
    const g = Math.round(rgb.g * (1 - percent));
    const b = Math.round(rgb.b * (1 - percent));

    const toHex = (n) => {
      const hex = n.toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    };

    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  // Structure placement methods

  placeWallStructures(collisionMap, roomType) {
    const availableStructures = this.getStructuresForRoom(roomType);
    const structureCount = this.getStructureCount(roomType);

    for (let i = 0; i < structureCount; i++) {
      const structure = this.selectWeightedStructure(availableStructures);
      const rotation = structure.allowRotation ? this.randomRotation() : 0;
      const rotatedPattern = this.rotatePattern(structure.pattern, rotation);

      // Try up to 50 positions
      let placed = false;
      for (let attempt = 0; attempt < 50 && !placed; attempt++) {
        const pos = this.getRandomStructurePosition(
          collisionMap,
          rotatedPattern[0].length,  // width
          rotatedPattern.length       // height
        );

        if (this.canPlaceStructure(collisionMap, rotatedPattern, pos)) {
          this.stampStructure(collisionMap, rotatedPattern, pos);
          placed = true;
        }
      }
      // If placement fails after 50 attempts, skip this structure (room still playable)
    }
  }

  placeVaultStructure(collisionMap) {
    const vault = this.currentLetterTemplate.vaultStructure;
    const centerCol = vault.centerCol;
    const centerRow = vault.centerRow;
    const size = vault.size;

    // Create hollow square (only walls on perimeter)
    const halfSize = Math.floor(size / 2);
    const minCol = centerCol - halfSize;
    const maxCol = centerCol + halfSize;
    const minRow = centerRow - halfSize;
    const maxRow = centerRow + halfSize;

    // Store vault info for key interaction (will be attached to room later)
    this.currentVaultInfo = {
      centerCol,
      centerRow,
      size,
      minCol,
      maxCol,
      minRow,
      maxRow,
      bottomWallRow: maxRow, // Bottom wall is at maxRow
      unlocked: false
    };

    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        // Only place walls on the perimeter (hollow interior)
        const isPerimeter = (row === minRow || row === maxRow || col === minCol || col === maxCol);

        if (isPerimeter && row > 0 && row < GRID.ROWS - 1 && col > 0 && col < GRID.COLS - 1) {
          collisionMap[row][col] = true;
        }
      }
    }
  }

  getStructuresForRoom(roomType) {
    return Object.entries(WALL_STRUCTURES)
      .filter(([_, structure]) => structure.roomTypes.includes(roomType))
      .reduce((obj, [key, value]) => ({ ...obj, [key]: value }), {});
  }

  getStructureCount(roomType) {
    switch(roomType) {
      case ROOM_TYPES.COMBAT: return this.randInt(1, 2);
      case ROOM_TYPES.BOSS: return 1;
      case ROOM_TYPES.DISCOVERY: return this.randInt(2, 3);
      case ROOM_TYPES.CAMP: return this.randInt(1, 2);
      default: return this.randInt(1, 2);
    }
  }

  selectWeightedStructure(structures) {
    const entries = Object.entries(structures);
    const totalWeight = entries.reduce((sum, [_, s]) => sum + s.weight, 0);
    let random = Math.random() * totalWeight;

    for (const [key, structure] of entries) {
      random -= structure.weight;
      if (random <= 0) {
        return structure;
      }
    }

    return entries[0][1]; // Fallback to first structure
  }

  getRandomStructurePosition(collisionMap, width, height) {
    // Keep 2-cell margin from borders
    const x = Math.floor(Math.random() * (GRID.COLS - width - 4)) + 2;
    const y = Math.floor(Math.random() * (GRID.ROWS - height - 4)) + 2;
    return { x, y };
  }

  canPlaceStructure(collisionMap, pattern, pos) {
    const height = pattern.length;
    const width = pattern[0].length;

    // Check bounds
    if (pos.x + width >= GRID.COLS - 1 || pos.y + height >= GRID.ROWS - 1) {
      return false;
    }

    const centerX = Math.floor(GRID.COLS / 2);
    const centerY = Math.floor(GRID.ROWS / 2);
    const clearRadius = 2;

    // Check each cell in pattern
    for (let py = 0; py < height; py++) {
      for (let px = 0; px < width; px++) {
        if (pattern[py][px]) {  // Only check wall cells
          const x = pos.x + px;
          const y = pos.y + py;

          // Check if already occupied
          if (collisionMap[y][x]) {
            return false;
          }

          // Check exit zones (must stay clear)
          // North exit zone
          if (Math.abs(x - centerX) <= clearRadius && Math.abs(y - 2) <= clearRadius) {
            return false;
          }
          // South exit zone
          if (Math.abs(x - centerX) <= clearRadius && Math.abs(y - (GRID.ROWS - 3)) <= clearRadius) {
            return false;
          }
          // East exit zone
          if (Math.abs(x - (GRID.COLS - 3)) <= clearRadius && Math.abs(y - centerY) <= clearRadius) {
            return false;
          }
          // West exit zone
          if (Math.abs(x - 2) <= clearRadius && Math.abs(y - centerY) <= clearRadius) {
            return false;
          }
        }
      }
    }

    return true;
  }

  stampStructure(collisionMap, pattern, pos) {
    for (let py = 0; py < pattern.length; py++) {
      for (let px = 0; px < pattern[py].length; px++) {
        if (pattern[py][px]) {
          collisionMap[pos.y + py][pos.x + px] = true;
        }
      }
    }
  }

  rotatePattern(pattern, degrees) {
    if (degrees === 0) return pattern;

    let rotated = pattern;
    const times = degrees / 90;

    for (let i = 0; i < times; i++) {
      const height = rotated.length;
      const width = rotated[0].length;
      const newPattern = [];

      // Rotate 90 degrees clockwise
      for (let x = 0; x < width; x++) {
        const newRow = [];
        for (let y = height - 1; y >= 0; y--) {
          newRow.push(rotated[y][x]);
        }
        newPattern.push(newRow);
      }

      rotated = newPattern;
    }

    return rotated;
  }

  randomRotation() {
    const rotations = [0, 90, 180, 270];
    return rotations[Math.floor(Math.random() * rotations.length)];
  }

  getRoomPreview(type) {
    switch (type) {
      case ROOM_TYPES.BOSS:
        return { char: 'B', name: 'Boss Room' };
      case ROOM_TYPES.DISCOVERY:
        return { char: '?', name: 'Discovery Room' };
      case ROOM_TYPES.CAMP:
        return { char: 'C', name: 'Camp' };
      default:
        const enemyChar = getRandomEnemy(this.currentDepth);
        return { char: enemyChar, name: 'Combat' };
    }
  }

  // Apply zone-specific material properties to background objects
  applyZoneProperties(obj, zoneType) {
    const zone = ZONES[zoneType];
    if (!zone) return obj;

    // Apply zone-specific colors to organic objects (trees, bushes, etc.)
    if (this.currentEnvironmentColors) {
      if (obj.char === '&') {  // Tree
        obj.color = this.currentEnvironmentColors.tree;
        obj.animationColor = this.currentEnvironmentColors.tree;
      } else if (obj.char === '%' || obj.char === '+' || obj.char === 'Y') {  // Bush, Brambles, Stump
        // Use tree color for organic objects (could add separate colors later)
        obj.color = this.currentEnvironmentColors.tree;
        obj.animationColor = this.currentEnvironmentColors.tree;
      }
    }

    // RED zone: trees and bushes are brittle (1-hit) and non-flammable
    if (zoneType === 'red') {
      if (obj.char === '&') {  // Tree
        obj.hp = 1;
        obj.maxHp = 1;
        obj.flammability = 'none';
        obj.name = 'Charred Tree';
      } else if (obj.char === '%') {  // Bush
        obj.hp = 1;
        obj.maxHp = 1;
        obj.flammability = 'none';
        obj.name = 'Dried Bramble';
      }
    }

    return obj;
  }

  // Apply key drop logic to eligible objects in K rooms
  applyKeyDropLogic(obj) {
    if (!this.currentLetterTemplate?.keyDrops?.enabled) {
      return; // Not a K room
    }

    const keyDropConfig = this.currentLetterTemplate.keyDrops;
    const isEligible = keyDropConfig.eligibleObjects.includes(obj.char);

    if (isEligible && Math.random() < keyDropConfig.dropChance) {
      // Mark this object as a key dropper
      obj.dropsKey = true;
      obj.keyChar = keyDropConfig.keyChar;
    }
  }

  // Ensure K rooms always have at least one key dropper (post-generation guarantee)
  ensureKeyDroppers(room) {
    if (!this.currentLetterTemplate?.keyDrops?.enabled) {
      return; // Not a K room
    }

    const keyDropConfig = this.currentLetterTemplate.keyDrops;

    // Count how many objects are already marked as key droppers
    const keyDroppers = room.backgroundObjects.filter(obj => obj.dropsKey === true);

    if (keyDroppers.length > 0) {
      return; // Already have at least one
    }

    // No key droppers yet - find all eligible objects
    const eligibleObjects = room.backgroundObjects.filter(obj =>
      keyDropConfig.eligibleObjects.includes(obj.char)
    );

    if (eligibleObjects.length === 0) {
      console.warn(`[Key Room] No eligible objects found for key drops! Room may be un-completable.`);
      return;
    }

    // Mark 1 random eligible object as guaranteed key dropper
    const guaranteedCount = 1;
    const shuffled = eligibleObjects.sort(() => Math.random() - 0.5);

    for (let i = 0; i < guaranteedCount; i++) {
      const obj = shuffled[i];
      obj.dropsKey = true;
      obj.keyChar = keyDropConfig.keyChar;
    }
  }

  // ===== Secret Event System =====
  // Scalable system for post-clear room events (key glitter, leshy chase, etc.)
  // Priority-based: only 1 event per room, highest priority wins

  /**
   * Secret event type definitions
   * Each event has: priority, condition, eligibleObjects filter, and marking behavior
   * Events are checked in priority order (higher = more important)
   */
  getSecretEventTypes() {
    return [
      // PRIORITY 1: Key Glitter (overrides all others)
      {
        name: 'key_glitter',
        priority: 10,
        condition: (room) => {
          // Must be K room with key-dropping objects
          return room.letterTemplate?.keyDrops?.enabled === true;
        },
        eligibleObjects: (room) => {
          // Objects that actually drop keys
          return room.backgroundObjects.filter(obj => obj.dropsKey === true);
        },
        mark: (selectedObject) => {
          selectedObject.isGlittering = true;
          selectedObject.keyObject = true;
          selectedObject.glitterColor = '#ffaa00'; // Gold
        }
      },

      // PRIORITY 2: Leshy Chase (green zone shaking bushes)
      {
        name: 'leshy_chase',
        priority: 5,
        condition: (room) => {
          const roomCleared = room.enemies.length === 0;
          return this.zoneSystem?.shouldSpawnShakingBush(room.zone, roomCleared) || false;
        },
        eligibleObjects: (room) => {
          return room.backgroundObjects.filter(obj =>
            obj.char === '%' || obj.char === '&'
          );
        },
        mark: (selectedObject) => {
          selectedObject.isShaking = true;
          selectedObject.leshyBush = true;
        }
      }

      // Future events can be added here with appropriate priorities
      // Examples:
      // - treasure_sparkle (priority 8)
      // - cursed_glow (priority 3)
      // - mysterious_hum (priority 2)
    ];
  }

  /**
   * Apply post-generation secret events to room
   * Uses priority system: only 1 event per room, highest priority wins
   */
  applySecretEvents(room) {
    if (!this.zoneSystem) {
      return;
    }

    const eventTypes = this.getSecretEventTypes();

    // Sort by priority (highest first)
    eventTypes.sort((a, b) => b.priority - a.priority);

    // Try each event type in priority order
    for (const eventType of eventTypes) {
      // Check if this event's condition is met
      const conditionMet = eventType.condition(room);

      if (!conditionMet) {
        continue; // Skip this event
      }

      // Get eligible objects for this event
      const eligibleObjects = eventType.eligibleObjects(room);

      if (eligibleObjects.length === 0) {
        continue; // No valid objects
      }

      // Pick random eligible object
      const randomIndex = Math.floor(Math.random() * eligibleObjects.length);
      const selectedObject = eligibleObjects[randomIndex];

      // Mark the object with this event
      eventType.mark(selectedObject);

      // Store event type on room for rendering reference
      room.activeSecretEvent = eventType.name;

      // Only 1 event per room - stop here
      return;
    }
  }

  /**
   * Legacy method for backwards compatibility
   * Now handled by secret event system
   */
  markRandomBushShaking(room) {
    // Filter background objects to bushes ('%') and trees ('&')
    const bushesAndTrees = room.backgroundObjects.filter(obj =>
      obj.char === '%' || obj.char === '&'
    );

    if (bushesAndTrees.length === 0) {
      return; // No bushes or trees in room
    }

    // Pick random bush/tree
    const randomIndex = Math.floor(Math.random() * bushesAndTrees.length);
    const selectedObject = bushesAndTrees[randomIndex];

    // Mark as shaking Leshy bush
    selectedObject.isShaking = true;
    selectedObject.leshyBush = true;
  }

  /**
   * Spawn guaranteed items for special room templates (e.g., vault treasure)
   * Places items at specific positions defined by the template
   */
  spawnGuaranteedItems(room) {
    const itemConfig = this.currentLetterTemplate.guaranteedItems;

    // Determine item pool based on config
    let itemPool = [];
    if (itemConfig.itemPool === 'rare_epic') {
      // High-tier weapons, armor, and consumables
      itemPool = [
        '⌘', // Dragon Blade (damage 5)
        '☼', // Dragon Shotgun
        '⚔', // Legendary Flame Sword (damage 6)
        '♦', // Dragon Heart (max HP consumable)
        'K', // Dragon Scale Armor (defense 5)
        '^', // Hammer (damage 7)
        '℧', // Ice Hammer (damage 6)
      ];
    }

    if (itemPool.length === 0) {
      console.warn(`[Guaranteed Items] Unknown item pool: ${itemConfig.itemPool}`);
      return;
    }

    // Select random item from pool
    const itemChar = itemPool[Math.floor(Math.random() * itemPool.length)];

    // Determine spawn position
    let spawnPos;
    if (itemConfig.position === 'vault_center') {
      // Spawn in exact center of vault
      const vault = this.currentLetterTemplate.vaultStructure;
      const centerX = vault.centerCol * GRID.CELL_SIZE + (GRID.CELL_SIZE / 2);
      const centerY = vault.centerRow * GRID.CELL_SIZE + (GRID.CELL_SIZE / 2);
      spawnPos = { x: centerX, y: centerY };
    } else {
      // Fallback to random position
      spawnPos = this.getRandomPosition(room.collisionMap, room.enemies, room.playerStartPos);
    }

    // Create and add item to room
    const item = new Item(itemChar, spawnPos.x, spawnPos.y);
    room.items.push(item);
  }

  /**
   * Add enemy to the appropriate plane-specific array based on enemy.plane
   * Also adds to legacy room.enemies for backwards compatibility
   */
  addEnemyToRoom(room, enemy) {
    const plane = enemy.plane !== undefined ? enemy.plane : 0;

    if (plane === 0) {
      room.enemiesPlane0.push(enemy);
    } else if (plane === 1) {
      room.enemiesPlane1.push(enemy);
    }

    // Legacy array for backwards compatibility
    room.enemies.push(enemy);
  }
}
