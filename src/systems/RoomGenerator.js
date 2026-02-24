import { GRID, ROOM_TYPES, BACKGROUND_OBJECTS, WALL_STRUCTURES, WATER_STRUCTURES } from '../game/GameConfig.js';
import { getRandomEnemy, createBossEnemy } from '../data/enemies.js';
import { RECIPES } from '../data/recipes.js';
import { ZONES } from '../data/zones.js';
import { Enemy } from '../entities/Enemy.js';
import { Item } from '../entities/Item.js';
import { BackgroundObject } from '../entities/BackgroundObject.js';

export class RoomGenerator {
  constructor(exitSystem) {
    this.currentDepth = 0;
    this.currentZoneWeights = null; // Store zone-specific weights
    this.exitSystem = exitSystem; // Exit letter generation system
  }

  setDepth(depth) {
    this.currentDepth = depth;
  }

  generateRoom(type = null, playerStartPos = null, zoneType = 'green', progressionColor = null) {
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
      enemies: [],
      items: [],
      backgroundObjects: [],
      recipeSign: null, // Visual-only recipe hint (not a BackgroundObject)
      exits: this.exitSystem ? this.exitSystem.generateExits(this.currentDepth, type, zoneType, progressionColor) : { north: false, east: false, west: false, south: true },
      playerStartPos: playerStartPos  // Store for enemy generation
    };

    // Set zone-specific background object weights
    this.currentZoneWeights = zone.objectWeights;

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

    // Place wall structures
    this.placeWallStructures(map, roomType);

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
      const enemyChar = getRandomEnemy(this.currentDepth);
      const pos = this.getRandomPosition(room.collisionMap, room.enemies, room.playerStartPos);
      const enemy = new Enemy(enemyChar, pos.x, pos.y, this.currentDepth);
      enemy.setCollisionMap(room.collisionMap);
      enemy.setBackgroundObjects(room.backgroundObjects);
      room.enemies.push(enemy);
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
    room.enemies.push(enemy);

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

    // Structured water (depth 3+)
    if (this.currentDepth >= 3) {
      this.placeWaterStructures(room);
    }

    // Organic fallback water (shallow depths, or occasional supplement deeper)
    if (this.currentDepth < 3 && Math.random() < 0.3) {
      this.generateWaterFormation(room);
    } else if (this.currentDepth >= 3 && Math.random() < 0.2) {
      this.generateWaterFormation(room);
    }

    // Generate mineral formations (rocks, crystals, boulders)
    this.generateMineralFormations(room);

    // Generate random individual objects based on depth
    this.generateDepthBasedObjects(room);
  }

  generateGrassSwaths(room) {
    // Generate 4-7 dense clusters of tall grass
    const swathCount = this.randInt(4, 7);
    const clusters = []; // Track cluster positions for recipe sign placement

    for (let i = 0; i < swathCount; i++) {
      const centerPos = this.getRandomPosition(room.collisionMap, room.enemies, room.playerStartPos);
      const swathSize = this.randInt(20, 40); // Dense clusters
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
          // Create two adjacent grass objects for double-pipe appearance
          const grass1 = new BackgroundObject('|', pos.x, pos.y);
          const grass2 = new BackgroundObject('|', pos.x + 6, pos.y); // 6 pixels apart for tight spacing
          room.backgroundObjects.push(grass1);
          room.backgroundObjects.push(grass2);
        }
      }
    }

    return clusters; // Return cluster positions for recipe sign placement
  }

  generateOrganicClusters(room) {
    const clusterCount = this.currentDepth < 5 ? this.randInt(2, 3) : this.randInt(3, 5);
    const organicChars = ['%', '&', '+', 'Y'];

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
          room.backgroundObjects.push(bgObject);
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

  generateMineralFormations(room) {
    const formationCount = this.randInt(1, 3);
    const mineralChars = this.currentDepth < 10 ? ['0'] : ['0', '*', 'Q'];

    for (let i = 0; i < formationCount; i++) {
      const centerPos = this.getRandomPosition(room.collisionMap, room.enemies, room.playerStartPos);
      const char = mineralChars[Math.floor(Math.random() * mineralChars.length)];
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
          const bgObject = new BackgroundObject(char, pos.x, pos.y);
          room.backgroundObjects.push(bgObject);
        }
      }
    }
  }

  generateDepthBasedObjects(room) {
    const weights = this.getObjectWeights(this.currentDepth);
    const objectCount = this.randInt(2, 5);

    for (let i = 0; i < objectCount; i++) {
      const char = this.weightedRandomChoice(weights);
      const pos = this.getRandomPosition(room.collisionMap, room.enemies, room.playerStartPos);

      const bgObject = new BackgroundObject(char, pos.x, pos.y);
      room.backgroundObjects.push(bgObject);
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
}
