import { GRID, ROOM_TYPES, BACKGROUND_OBJECTS, WALL_STRUCTURES, WATER_STRUCTURES } from '../game/GameConfig.js';
import { ENEMIES, getRandomEnemy, getZoneRandomEnemy, createBossEnemy, BOSS_ENCOUNTERS } from '../data/enemies.js';
import { RECIPES } from '../data/recipes.js';
import { ZONES } from '../data/zones.js';
import { LETTER_TEMPLATES } from '../data/letterTemplates.js';
import { Enemy } from '../entities/Enemy.js';
import { Item } from '../entities/Item.js';
import { BackgroundObject } from '../entities/BackgroundObject.js';
import { BridgeWorker } from '../entities/BridgeWorker.js';
import { getDungeonDesign } from '../data/dungeonDesigns.js';
import { CampNPC } from '../entities/CampNPC.js';
import { Crow } from '../entities/Crow.js';
import { Fairy } from '../entities/Fairy.js';

// Zone-boss arena → letter template key. Boss rooms are entered without a
// letter (cheat warp) or with an arbitrary one (normal progression), so we
// force the dedicated arena template by zone here.
const ZONE_BOSS_TEMPLATES = {
  cyan: 'L_BOSS',
};

export class RoomGenerator {
  constructor(exitSystem, zoneSystem = null, game = null) {
    this.currentDepth = 0;
    this.currentZoneWeights = null; // Store zone-specific weights
    this.currentEnvironmentColors = null; // Store blended zone colors
    this.currentLetterTemplate = null; // Store current room's letter template
    this.exitSystem = exitSystem; // Exit letter generation system
    this.zoneSystem = zoneSystem; // Zone progression system for color blending
    this.isGeneratingTunnel = false; // Flag to reduce rock formations in tunnel rooms
    this.game = game; // Game ref for cheat-flag access (e.g. cheat_forceHutKind)
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

    // Check if this is an ASCENT room (letter 'A')
    if (exitLetter === 'A') {
      type = ROOM_TYPES.ASCENT;
    }

    // Check if this is an UNDERGROUND room (letter 'U')
    if (exitLetter === 'U') {
      type = ROOM_TYPES.UNDERGROUND;
    }

    // Check if this is a HUT room (letter 'H') or DUNGEON room (letter 'D')
    if (exitLetter === 'H') {
      type = ROOM_TYPES.HUT;
    }
    if (exitLetter === 'D') {
      type = ROOM_TYPES.DUNGEON;
    }
    if (exitLetter === 'P') {
      type = ROOM_TYPES.HUT; // Press hut — guaranteed press inside
    }
    if (exitLetter === 'R') {
      type = ROOM_TYPES.RIDGE;
    }
    if (exitLetter === 'M') {
      type = ROOM_TYPES.MAZE;
    }
    if (exitLetter === 'W') {
      type = ROOM_TYPES.WELL;
    }
    if (exitLetter === 'F') {
      type = ROOM_TYPES.FOUNTAIN;
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
      crows: [], // Idle non-combat birds — depth-1 intro room + X (Crossroads) rooms
      backgroundObjects: [],
      recipeSign: null, // Visual-only recipe hint (not a BackgroundObject)
      exits: this.exitSystem ? this.exitSystem.generateExits(this.currentDepth, type, zoneType, progressionColor, exitLetter) : { north: false, east: false, west: false, south: true },
      playerStartPos: playerStartPos,  // Store for enemy generation
      letterTemplate: this.currentLetterTemplate, // Store template for later event checks
      exitLetter: exitLetter // Letter that produced this room (e.g. 'P', 'R', 'H')
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
        room.isZoneBossRoom = !!this.isZoneBossRoom;
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
      case ROOM_TYPES.ASCENT:
        this.generateAscentRoom(room);
        break;
      case ROOM_TYPES.UNDERGROUND:
        this.generateUndergroundRoom(room);
        break;
      case ROOM_TYPES.BAT_BELFRY:
        this.generateBatBelfryRoom(room);
        break;
      case ROOM_TYPES.HUT:
        this.generateHutRoom(room);
        break;
      case ROOM_TYPES.DUNGEON:
        this.generateDungeonRoom(room);
        break;
      case ROOM_TYPES.RIDGE:
        this.generateRidgeRoom(room);
        break;
      case ROOM_TYPES.MAZE:
        this.generateMazeRoom(room);
        break;
      case ROOM_TYPES.WELL:
        this.generateWellRoom(room);
        break;
      case ROOM_TYPES.FOUNTAIN:
        this.generateFountainRoom(room);
        break;
    }

    // Note: Secret events (shaking bushes) are applied at runtime when room is cleared
    // See main.js updateExploreState() where room.cleared = true

    // Spawn guaranteed items if template defines them (e.g., vault treasure)
    if (this.currentLetterTemplate?.guaranteedItems?.enabled) {
      this.spawnGuaranteedItems(room);
    }

    // Blue-zone room post-processing — armor pickup + pedestal + linear exits
    if (this.currentLetterTemplate?.blueZoneArmor || this.currentLetterTemplate?.blueZonePedestal) {
      this.applyBlueZoneTemplate(room);
    }

    // Attach vault info if this is a vault room
    if (this.currentVaultInfo) {
      room.vaultInfo = this.currentVaultInfo;
      this.currentVaultInfo = null; // Reset for next room
    }

    // First-room flourish: a small flock of idle crows in the very first
    // green-zone explore room. Teaches the player that not all motion is hostile.
    // One crow holds a pearl that drops the first time it's scared.
    // Skip BOSS rooms (high-tension first impression would clash).
    const introRoomEligible = type === ROOM_TYPES.COMBAT
      || type === ROOM_TYPES.DISCOVERY
      || type === ROOM_TYPES.CAMP;
    if (this.currentDepth === 1 && zoneType === 'green' && introRoomEligible) {
      // Intro flock: one crow is guaranteed to carry the pearl — that drop
      // gates the blue-zone Ocean exit, so the chance must be 100%.
      this.spawnCrows(room, { guaranteedItem: '●' });
      console.log(`[Crows] spawned ${room.crows.length} in depth-1 ${type} room`);
    }

    // X (Crossroads) rooms: a flock of crows hoards a random shiny.
    // Same mechanic, different pool — gems/coin/pearl all possible.
    // Skip if the intro flock already populated this room (depth-1 green).
    if (exitLetter === 'X' && introRoomEligible && room.crows.length === 0) {
      this.spawnCrows(room, { hoardPool: RoomGenerator.CROW_HOARD_POOL });
      console.log(`[Crows] spawned ${room.crows.length} in X crossroads room`);
    }

    // Bread-fed crows raise the odds of crows appearing in ANY eligible room.
    // 25% per fed crow, capped at 75% (3 fed crows). One small flock — not the
    // full X-room treatment. Only fires if no other rule already populated.
    const fedCount = this.game?.fedCrowCount || 0;
    if (fedCount > 0 && introRoomEligible && room.crows.length === 0) {
      const chance = Math.min(0.75, fedCount * 0.25);
      if (Math.random() < chance) {
        this.spawnCrows(room, { hoardPool: RoomGenerator.CROW_HOARD_POOL, count: 2 });
        console.log(`[Crows] fed-bonus flock (fedCount=${fedCount}, p=${chance.toFixed(2)})`);
      }
    }

    // O (Ocean) + pearl-in-inventory: pre-spawn a guide fairy that gates the
    // hidden blue-zone exit. If the player ignores it through the fight, the
    // fairy reveals a pedestal at room-clear (see main.js updateExploreState).
    if (exitLetter === 'O' && !this.game?.fairiesAngered) {
      const playerInv = this.game?.player?.inventory;
      if (playerInv && playerInv.includes('●')) {
        this.spawnPearlFairy(room);
      }
    }

    return room;
  }

  // Pre-spawn the guide fairy on the dry side of an O room, well clear of the
  // ocean tiles (sand starts at col 18). Stored on room.pearlFairy so main.js
  // can push it into neutralCharacters on entry, and so the room-clear hook
  // can find it later to trigger the pedestal reveal.
  spawnPearlFairy(room) {
    const CS = GRID.CELL_SIZE;
    const col = 8 + Math.floor(Math.random() * 6);   // cols 8-13: dry land, away from water
    const row = 6 + Math.floor(Math.random() * 6);   // rows 6-11: mid vertical band
    const x = col * CS;
    const y = row * CS;
    const fairy = new Fairy(x, y, room.exits || {}, {
      // Don't let it flee mid-fight — we want it tied to room clear, not a timer.
      flutterDuration: 1e9,
      touchImmunity: 1.5
    });
    fairy.pearlGuide = true;
    room.pearlFairy = fairy;
  }

  // Curated corvid hoard — shiny things a crow would snatch.
  // Each glyph is a valid INGREDIENTS key; Ingredient's constructor picks the
  // matching color from data/items.js so the dropped "pixel" matches the gem.
  static CROW_HOARD_POOL = [
    '●', // Pearl
    '1', // Topaz
    '9', // Garnet
    '`', // Emerald
    '_', // Diamond
    '6', // Onyx
    '?', // Ruby
    '(', // Sapphire
    'c'  // Coin
  ];

  // hoardPool: glyphs the carrier crow may pick from (random).
  // guaranteedItem: if set, the carrier always drops this glyph instead of rolling.
  // count: number of crows in the flock.
  spawnCrows(room, { hoardPool = null, guaranteedItem = null, count = 3 } = {}) {
    // Global cap: there are only ever 3 crows in the game at any time
    // (companions + followers + wild crows in the current room). The room
    // being generated starts empty, so the available headroom equals
    // 3 - (companions + followers).
    const existing = (this.game?.companionCrows?.length || 0)
      + (this.game?.followerCrows?.length || 0);
    const headroom = Math.max(0, 3 - existing);
    if (headroom === 0) return;
    const COUNT = Math.min(count, headroom);
    const minDistFromPlayer = GRID.CELL_SIZE * 5;
    const minDistFromOther = GRID.CELL_SIZE * 3;
    const playerStart = room.playerStartPos || { x: GRID.WIDTH / 2, y: (GRID.ROWS - 3) * GRID.CELL_SIZE };

    const isClear = (x, y) => {
      const col = Math.floor(x / GRID.CELL_SIZE);
      const row = Math.floor(y / GRID.CELL_SIZE);
      if (col < 2 || col >= GRID.COLS - 2 || row < 2 || row >= GRID.ROWS - 2) return false;
      if (room.collisionMap[row]?.[col]) return false;
      const px = playerStart.x - x;
      const py = playerStart.y - y;
      if (px * px + py * py < minDistFromPlayer * minDistFromPlayer) return false;
      for (const obj of room.backgroundObjects) {
        if (obj.destroyed) continue;
        const dx = obj.position.x - x;
        const dy = obj.position.y - y;
        if (dx * dx + dy * dy < (GRID.CELL_SIZE * 0.9) ** 2) return false;
      }
      return true;
    };

    // Prefer positions adjacent to trees/stumps; fall back to scattered open ground.
    const candidates = [];
    for (const obj of room.backgroundObjects) {
      if (obj.destroyed) continue;
      if (obj.char !== '&' && obj.char !== 'Y') continue;
      const cx = obj.position.x;
      const cy = obj.position.y - GRID.CELL_SIZE;
      if (isClear(cx, cy)) candidates.push({ x: cx, y: cy });
    }
    // Shuffle for variety
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }

    const pickRandomOpen = () => {
      for (let attempt = 0; attempt < 30; attempt++) {
        const col = 3 + Math.floor(Math.random() * (GRID.COLS - 6));
        const row = 3 + Math.floor(Math.random() * (GRID.ROWS - 6));
        const x = col * GRID.CELL_SIZE;
        const y = row * GRID.CELL_SIZE;
        if (isClear(x, y)) return { x, y };
      }
      return null;
    };

    const positions = [];
    while (positions.length < COUNT) {
      let candidate = candidates.shift() || pickRandomOpen();
      if (!candidate) break;
      const tooClose = positions.some(p => {
        const dx = p.x - candidate.x;
        const dy = p.y - candidate.y;
        return dx * dx + dy * dy < minDistFromOther * minDistFromOther;
      });
      if (tooClose) continue;
      positions.push(candidate);
    }

    if (positions.length === 0) return;

    const carrierIndex = Math.floor(Math.random() * positions.length);
    const pool = hoardPool && hoardPool.length ? hoardPool : null;
    positions.forEach((pos, i) => {
      let hoardItem = null;
      if (i === carrierIndex) {
        if (guaranteedItem) hoardItem = guaranteedItem;
        else if (pool) hoardItem = pool[Math.floor(Math.random() * pool.length)];
      }
      room.crows.push(new Crow(pos.x, pos.y, { hoardItem }));
    });
  }

  determineRoomType() {
    const roll = Math.random();

    // Mini-boss rooms gated to L5+, same threshold as the 'B' exit letter.
    // Below L5 the BOSS slice rolls into COMBAT instead.
    const bossAllowed = this.currentDepth >= 5;
    if (roll < 0.7) return ROOM_TYPES.COMBAT;
    if (roll < 0.8) return bossAllowed ? ROOM_TYPES.BOSS : ROOM_TYPES.COMBAT;
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
    // Generate terrain first so liquid positions are known before enemy placement
    this.generateBackgroundObjects(room);

    // Special terrain overlays — run before enemies so they avoid liquid tiles
    if (this.currentLetterTemplate?.islandZone?.enabled) {
      this.generateIslandTerrain(room);
    }
    if (this.currentLetterTemplate?.oceanZone?.enabled) {
      this.generateOceanTerrain(room);
    }
    if (this.currentLetterTemplate?.lakeZone?.enabled) {
      this.generateLakeTerrain(room);
    }

    // Spawn 1-6 enemies based on depth, avoiding liquid tiles
    const enemyCount = Math.min(1 + Math.floor(this.currentDepth / 2), 6);
    const islandConfig = this.currentLetterTemplate?.islandZone?.enabled ? this.currentLetterTemplate.islandZone : null;

    for (let i = 0; i < enemyCount; i++) {
      const enemyChar = getZoneRandomEnemy(this.currentDepth, room.zone);
      const allowLiquid = ENEMIES[enemyChar]?.waterAffinity === true;
      const pos = islandConfig
        ? this.getIslandPosition(islandConfig, room.collisionMap, room.enemies, room.playerStartPos, room.backgroundObjects)
        : this.getRandomPosition(room.collisionMap, room.enemies, room.playerStartPos, room.backgroundObjects, allowLiquid);
      if (!pos) continue;
      const enemy = new Enemy(enemyChar, pos.x, pos.y, this.currentDepth);
      enemy.setCollisionMap(room.collisionMap);
      enemy.setBackgroundObjects(room.backgroundObjects);
      this.addEnemyToRoom(room, enemy);
    }

    // Inject letter-specific enemies (e.g., sea snakes always present in O rooms)
    if (this.currentLetterTemplate?.enemyInjection) {
      const inj = this.currentLetterTemplate.enemyInjection;
      const injCount = inj.minCount + Math.floor(Math.random() * (inj.maxCount - inj.minCount + 1));
      for (let i = 0; i < injCount; i++) {
        const allowLiquid = inj.preferLiquid === true;
        const pos = islandConfig
          ? this.getIslandPosition(islandConfig, room.collisionMap, room.enemies, room.playerStartPos, room.backgroundObjects)
          : this.getRandomPosition(room.collisionMap, room.enemies, room.playerStartPos, room.backgroundObjects, allowLiquid);
        if (!pos) continue;
        const enemy = new Enemy(inj.char, pos.x, pos.y, this.currentDepth);
        enemy.setCollisionMap(room.collisionMap);
        enemy.setBackgroundObjects(room.backgroundObjects);
        this.addEnemyToRoom(room, enemy);
      }
    }

    // Add starting weapons in first room for combat demo
    if (this.currentDepth === 1) {
      // Add gun
      const gunPos = this.getRandomPosition(room.collisionMap, room.enemies, room.playerStartPos);
      if (gunPos) {
        const gun = new Item('/', gunPos.x, gunPos.y);
        room.items.push(gun);

        // Add sword
        const swordPos = this.getRandomPosition(room.collisionMap, [...room.enemies, gun], room.playerStartPos);
        if (swordPos) {
          const sword = new Item('†', swordPos.x, swordPos.y);
          room.items.push(sword);
        }
      }
    }

    // Ensure K rooms have at least one guaranteed key dropper
    this.ensureKeyDroppers(room);

    // Exits are locked until all enemies defeated
    room.exitsLocked = true;
  }

  generateBossRoom(room) {
    // Zone-boss arena override: each zone boss gets a dedicated terrain template
    // (e.g. cyan's Frosted Maw needs the L_BOSS lake arena). These templates are
    // never reached via exit letters, so we force them here.
    if (this.isZoneBossRoom) {
      const bossTemplate = ZONE_BOSS_TEMPLATES[room.zone];
      if (bossTemplate && LETTER_TEMPLATES[bossTemplate]) {
        this.currentLetterTemplate = LETTER_TEMPLATES[bossTemplate];
        room.letterTemplate = this.currentLetterTemplate;
      }
    }

    // Generate terrain first so liquid positions are known before enemy placement
    this.generateBackgroundObjects(room);

    // Template-driven terrain overlays (same set CombatRoom runs). The boss
    // template's lakeZone is what carves the Frosted Maw arena.
    if (this.currentLetterTemplate?.islandZone?.enabled) {
      this.generateIslandTerrain(room);
    }
    if (this.currentLetterTemplate?.oceanZone?.enabled) {
      this.generateOceanTerrain(room);
    }
    if (this.currentLetterTemplate?.lakeZone?.enabled) {
      this.generateLakeTerrain(room);
    }

    const zone = ZONES[room.zone];
    const pool = zone?.bossPool;
    // Zone boss rooms get their unique encounter from BossSystem.activate() —
    // skip bossPool here so it isn't spawned on top of the zone boss.
    const useMiniBossPool = !this.isZoneBossRoom && pool && pool.length > 0;

    if (useMiniBossPool) {
      const encounterId = pool[Math.floor(Math.random() * pool.length)];
      const encounter = BOSS_ENCOUNTERS[encounterId];
      if (encounter) {
        this.spawnBossEncounter(room, encounter);
      }
    } else if (!this.isZoneBossRoom) {
      // Fallback for zones without a bossPool: single buffed enemy
      const boss = createBossEnemy(this.currentDepth);
      const pos = this.getRandomPosition(room.collisionMap, room.enemies, room.playerStartPos, room.backgroundObjects);
      if (pos) {
        const enemy = new Enemy(boss.char, pos.x, pos.y, this.currentDepth);
        enemy.hp = boss.hp;
        enemy.damage = boss.damage;
        enemy.color = boss.color;
        enemy.setCollisionMap(room.collisionMap);
        enemy.setBackgroundObjects(room.backgroundObjects);
        this.addEnemyToRoom(room, enemy);
      }
    }

    // Ensure first room always has at least one item
    if (this.currentDepth === 1) {
      const basicItems = ['/', '†'];
      const itemChar = basicItems[Math.floor(Math.random() * basicItems.length)];
      const itemPos = this.getRandomPosition(room.collisionMap, room.enemies, room.playerStartPos);
      if (itemPos) {
        const item = new Item(itemChar, itemPos.x, itemPos.y);
        room.items.push(item);
      }
    }

    // Ensure K rooms have at least one guaranteed key dropper
    this.ensureKeyDroppers(room);

    // Exits are locked until all enemies defeated
    room.exitsLocked = true;
  }

  /**
   * Place a boss encounter from BOSS_ENCOUNTERS into a room.
   * - 'center'    : boss placed at room center (single-entity bosses like Giant Slime)
   * - 'formation' : leader at center, followers placed in a ring at the leader's
   *                 followLeader.formationRadius. Followers are linked to their leader
   *                 via enemy.leaderRef so the followLeader behavior can find them.
   *                 Spawns with `equippedWeapon` get the matching Item pre-equipped.
   */
  spawnBossEncounter(room, encounter) {
    const centerX = (GRID.COLS / 2) * GRID.CELL_SIZE;
    const centerY = (GRID.ROWS / 2) * GRID.CELL_SIZE;

    const placedFollowerSpawns = [];
    let leader = null;
    let leaderFormationRadius = GRID.CELL_SIZE * 3;
    let followerOrbitIndex = 0;

    // Count total followers across spawn entries for ring placement
    let totalFollowers = 0;
    for (const spawn of encounter.spawns) {
      if (spawn.role === 'follower') totalFollowers += spawn.count;
    }

    for (const spawn of encounter.spawns) {
      for (let i = 0; i < spawn.count; i++) {
        let x, y;
        let mySlot = -1;

        if (spawn.role === 'boss' || spawn.role === 'leader') {
          x = centerX;
          y = centerY;
        } else if (spawn.role === 'follower' && leader) {
          // Initial placement is a tidy ring; runtime formation state machine
          // takes over from there (encircle → line). Slot index is preserved
          // on the enemy so the line formation can give each follower a stable
          // lateral position in the wall.
          mySlot = followerOrbitIndex;
          const angle = (followerOrbitIndex / Math.max(totalFollowers, 1)) * Math.PI * 2;
          x = leader.position.x + Math.cos(angle) * leaderFormationRadius;
          y = leader.position.y + Math.sin(angle) * leaderFormationRadius;
          followerOrbitIndex++;
        } else {
          // Fallback: random valid position
          const pos = this.getRandomPosition(room.collisionMap, room.enemies, room.playerStartPos, room.backgroundObjects);
          if (!pos) continue;
          x = pos.x;
          y = pos.y;
        }

        const enemy = new Enemy(spawn.char, x, y, this.currentDepth);
        enemy.setCollisionMap(room.collisionMap);
        enemy.setBackgroundObjects(room.backgroundObjects);

        if (spawn.equippedWeapon) {
          const weapon = new Item(spawn.equippedWeapon, x, y);
          if (enemy.itemUsage) {
            // Encounter-scripted equipment overrides any random spawn loadout
            // the constructor rolled (e.g. goblin spawnEquipment).
            enemy.inventory = [];
            enemy.equippedWeapon = null;
            enemy.pickupItem(weapon);
          }
        }

        if (spawn.role === 'leader') {
          leader = enemy;
          if (enemy.data.followLeader?.formationRadius) {
            leaderFormationRadius = enemy.data.followLeader.formationRadius;
          } else if (enemy.data.rallyCall) {
            // Leaders define orbit radius via their followers; fall back to default
            leaderFormationRadius = GRID.CELL_SIZE * 3;
          }
        } else if (spawn.role === 'follower' && leader) {
          enemy.leaderRef = leader;
          // Provisional slot — corrected in the second pass below so the line
          // formation only counts melee followers (ranged ones stand back).
          enemy.formationSlot = mySlot;
          enemy.formationCount = totalFollowers;
        }

        this.addEnemyToRoom(room, enemy);
      }
    }

    // Renumber formation slots for melee followers only; ranged followers
    // (bow/gun) keep their leaderRef but are excluded from the line so we
    // don't end up with gaps in the wall.
    const meleeFollowers = room.enemies.filter(
      e => e.leaderRef === leader && e.attackType !== 'item_ranged' && e.movementStyle !== 'keeper'
    );
    meleeFollowers.forEach((e, idx) => {
      e.formationSlot = idx;
      e.formationCount = meleeFollowers.length;
    });
  }

  generateDiscoveryRoom(room) {
    // No enemies, guaranteed rare item
    const rareItems = ['⌂', '‡', ')', 'X', '⌘', '⟩', '⊤', 'ƒ'];
    const itemChar = rareItems[Math.floor(Math.random() * rareItems.length)];
    const pos = this.getRandomPosition(room.collisionMap, room.enemies, room.playerStartPos);
    if (pos) {
      const item = new Item(itemChar, pos.x, pos.y);
      room.items.push(item);
    }

    // Generate background objects
    this.generateBackgroundObjects(room);

    // Ensure K rooms have at least one guaranteed key dropper
    this.ensureKeyDroppers(room);

    // Exits are already generated by ExitSystem in generateRoom()
    // No need to override them here
  }

  generateCampRoom(room) {
    // No enemies, safe zone
    // Baseline weapon pool: sword (†) and staff (/) most common; spear (↑), bow ()), dagger (↾) less common.
    // Weighting via repetition keeps this dependency-free.
    const basicItems = ['†', '†', '†', '/', '/', '/', '↑', ')', '↾'];
    const itemChar = basicItems[Math.floor(Math.random() * basicItems.length)];
    const pos = this.getRandomPosition(room.collisionMap, room.enemies, room.playerStartPos);
    if (pos) {
      const item = new Item(itemChar, pos.x, pos.y);
      room.items.push(item);
    }

    // Generate background objects
    this.generateBackgroundObjects(room);

    // Place a flickering campfire near the room center and a CampNPC beside it.
    // The campfire is an indestructible '!' fire object; the NPC sits one cell
    // beside it and uses the campfire pos as its tether anchor.
    const centerCol = Math.floor(GRID.COLS / 2);
    const centerRow = Math.floor(GRID.ROWS / 2);
    const fireCol = centerCol;
    const fireRow = centerRow;

    // Clear collision at and around the campfire/NPC tile
    if (room.collisionMap[fireRow]) {
      room.collisionMap[fireRow][fireCol] = false;
      if (room.collisionMap[fireRow][fireCol + 1] !== undefined) {
        room.collisionMap[fireRow][fireCol + 1] = false;
      }
    }

    const fireX = fireCol * GRID.CELL_SIZE;
    const fireY = fireRow * GRID.CELL_SIZE;
    const fire = new BackgroundObject('!', fireX, fireY);
    fire.indestructible = true;
    fire.isCampfire = true; // enables flicker animation in BackgroundObject.update
    room.backgroundObjects.push(fire);

    // Remove any background object that overlaps the NPC's tile so it spawns clear
    const npcCol = fireCol + 1;
    const npcX = npcCol * GRID.CELL_SIZE;
    const npcY = fireRow * GRID.CELL_SIZE;
    room.backgroundObjects = room.backgroundObjects.filter(obj => {
      if (obj === fire) return true;
      const oCol = Math.round(obj.position.x / GRID.CELL_SIZE);
      const oRow = Math.round(obj.position.y / GRID.CELL_SIZE);
      return !(oCol === npcCol && oRow === fireRow);
    });

    const npc = new CampNPC(npcX, npcY, { x: fireX, y: fireY });
    room.campNPC = npc;

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

      // Cap rocks at the four corners where tunnel walls meet the entrance opening.
      // The wall chars (-) are not solid on plane 0, so rocks provide structural blocking.
      // Pattern: 0 < < < 0  (left side) and  0 > > > 0  (right side)
      for (const capCol of [startCol, endCol]) {
        for (const capRow of [startRow, endRow]) {
          const cap = new BackgroundObject('0', capCol * GRID.CELL_SIZE, capRow * GRID.CELL_SIZE);
          cap.indestructible = true;
          room.backgroundObjects.push(cap);
        }
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

      // Cap rocks at the four corners where tunnel walls meet the entrance opening.
      // The wall chars (I) are not solid on plane 0, so rocks provide structural blocking.
      // Pattern: 0 ^ ^ ^ 0  (top side) and  0 v v v 0  (bottom side)
      for (const capCol of [startCol, endCol]) {
        for (const capRow of [startRow, endRow]) {
          const cap = new BackgroundObject('0', capCol * GRID.CELL_SIZE, capRow * GRID.CELL_SIZE);
          cap.indestructible = true;
          room.backgroundObjects.push(cap);
        }
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

    // Spawn 2-4 enemies (some inside tunnel, some outside), avoiding liquid tiles
    const enemyCount = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < enemyCount; i++) {
      const enemyChar = getZoneRandomEnemy(this.currentDepth, room.zone);
      const allowLiquid = ENEMIES[enemyChar]?.waterAffinity === true;
      const pos = this.getRandomPosition(room.collisionMap, room.enemies, room.playerStartPos, room.backgroundObjects, allowLiquid);
      if (!pos) continue;
      const enemy = new Enemy(enemyChar, pos.x, pos.y, this.currentDepth);
      enemy.setCollisionMap(room.collisionMap);
      enemy.setBackgroundObjects(room.backgroundObjects);
      this.addEnemyToRoom(room, enemy);
    }

    // Exits are locked until all enemies defeated
    room.exitsLocked = true;
  }

  generateAscentRoom(room) {
    const CENTER_COL = Math.floor(GRID.COLS / 2);
    const CENTER_ROW = Math.floor(GRID.ROWS / 2);
    // Flat plateau: cells within INNER_RADIUS get no slope tile
    const INNER_RADIUS = 5;
    // Slope ring: INNER_RADIUS to OUTER_RADIUS
    const OUTER_RADIUS = 8;
    const FILL_CHANCE = 0.92;  // high fill so the larger ring reads as a solid circle
    const SLOPE_COLOR = '#555555';

    // Slope data shared by all four directional chars (overrides tunnel entrance data)
    const makeSlopeData = (direction) => ({
      name: `Slope (${direction})`,
      color: SLOPE_COLOR,
      solid: false,
      bulletInteraction: 'pass-through',
      flammability: 'none',
      conductivity: 'none',
      indestructible: true,
      interactions: { default: { animation: 'none', message: null } }
    });

    for (let col = 1; col < GRID.COLS - 1; col++) {
      for (let row = 1; row < GRID.ROWS - 1; row++) {
        const dx = col - CENTER_COL;
        const dy = row - CENTER_ROW;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < INNER_RADIUS || dist > OUTER_RADIUS) continue;
        if (Math.random() > FILL_CHANCE) continue;
        if (!this.isValidPosition(col, row, room)) continue;

        // Determine cardinal direction away from center
        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);
        let slopeChar, slopeDirection;

        if (absDy >= absDx) {
          if (dy < 0) { slopeChar = 'ʌ'; slopeDirection = 'up'; }
          else        { slopeChar = 'v'; slopeDirection = 'down'; }
        } else {
          if (dx < 0) { slopeChar = '<'; slopeDirection = 'left'; }
          else        { slopeChar = '>'; slopeDirection = 'right'; }
        }

        const slopeTile = new BackgroundObject(slopeChar, col * GRID.CELL_SIZE, row * GRID.CELL_SIZE);

        // Override tunnel-entrance properties with slope properties
        slopeTile.data         = makeSlopeData(slopeDirection);
        slopeTile.slope        = true;
        slopeTile.slopeDirection = slopeDirection;
        slopeTile.color        = SLOPE_COLOR;
        slopeTile.animationColor = SLOPE_COLOR;
        slopeTile.bulletInteraction = 'pass-through';
        slopeTile.indestructible = true;

        room.backgroundObjects.push(slopeTile);
      }
    }

    // Standard background objects (grass, trees, rocks) — clearing zone keeps plateau tidy
    this.generateBackgroundObjects(room);

    // Spawn enemies, avoiding liquid tiles
    const enemyCount = Math.min(2 + Math.floor(this.currentDepth / 2), 6);
    for (let i = 0; i < enemyCount; i++) {
      const enemyChar = getZoneRandomEnemy(this.currentDepth, room.zone);
      const allowLiquid = ENEMIES[enemyChar]?.waterAffinity === true;
      const pos = this.getRandomPosition(room.collisionMap, room.enemies, room.playerStartPos, room.backgroundObjects, allowLiquid);
      if (!pos) continue;
      const enemy = new Enemy(enemyChar, pos.x, pos.y, this.currentDepth);
      enemy.setCollisionMap(room.collisionMap);
      enemy.setBackgroundObjects(room.backgroundObjects);
      this.addEnemyToRoom(room, enemy);
    }

    this.ensureKeyDroppers(room);
    room.exitsLocked = true;
  }

  generateUndergroundRoom(room) {
    const COLS = GRID.COLS; // 30
    const ROWS = GRID.ROWS; // 30

    // ── Define 4 clearings near each exit edge ───────────────────────────────
    const clearings = [
      { minCol: 13, maxCol: 17, minRow: 1,  maxRow: 4,  side: 'north' },
      { minCol: 13, maxCol: 17, minRow: 25, maxRow: 28, side: 'south' },
      { minCol: 25, maxCol: 28, minRow: 13, maxRow: 17, side: 'east'  },
      { minCol: 1,  maxCol: 4,  minRow: 13, maxRow: 17, side: 'west'  }
    ];

    const isInClearing = (col, row) =>
      clearings.some(c => col >= c.minCol && col <= c.maxCol && row >= c.minRow && row <= c.maxRow);

    // ── Fill plane 0 with an organic rock wall outside the clearings ─────────
    // The surface is impassable except for the 4 exit clearings; the player
    // must descend via a cave entrance (^v<>) to plane 1 to traverse between
    // clearings. Solid bg objects default to plane 0 only (no tunnelWall flag),
    // so they don't interfere with cave navigation.
    //
    // We mix rock / boulder / crystal chars for visual variety. Positions are
    // grid-aligned (no sub-cell jitter) — earlier jitter caused rocks adjacent
    // to clearings to bleed their hitboxes into the clearing, trapping the
    // player at the moment of plane-1 → plane-0 transition. The south rows
    // below the entrance row are left clear so the REST exit text isn't
    // obscured.
    const isInRestCorridor = (col, row) =>
      row >= 26 && col >= 10 && col <= 20;

    const pickWallChar = () => {
      const r = Math.random();
      if (r < 0.10) return 'Q';   // boulder — large, fills 14×14
      if (r < 0.16) return '*';   // crystal — accent
      return '0';                 // rock — primary
    };

    for (let r = 1; r < ROWS - 1; r++) {
      for (let c = 1; c < COLS - 1; c++) {
        if (isInClearing(c, r)) continue;
        if (isInRestCorridor(c, r)) continue;
        const char = pickWallChar();
        const obj = new BackgroundObject(
          char,
          c * GRID.CELL_SIZE,
          r * GRID.CELL_SIZE
        );
        // Hide the surface wall when the player descends into the cave.
        // (ExploreRenderer's shouldRenderBackgroundObject defaults to "render
        // on both planes" — without this flag, plane-0 rocks would draw on
        // top of the plane-1 cave walls.)
        obj.surfaceOnly = true;
        room.backgroundObjects.push(obj);
      }
    }

    // ── Cellular automata cave generation ────────────────────────────────────
    const SEED_CHANCE = 0.45;
    // caveGrid[row][col] = 1 → wall, 0 → passage
    const caveGrid = Array.from({ length: ROWS }, (_, r) =>
      Array.from({ length: COLS }, (_, c) => {
        if (c === 0 || c === COLS - 1 || r === 0 || r === ROWS - 1) return 1; // border
        if (isInClearing(c, r)) return 0; // clearings are open
        return Math.random() < SEED_CHANCE ? 1 : 0;
      })
    );

    const countNeighbors = (grid, col, row) => {
      let count = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = row + dr, nc = col + dc;
          if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) { count++; continue; }
          if (grid[nr][nc]) count++;
        }
      }
      return count;
    };

    for (let gen = 0; gen < 5; gen++) {
      const next = caveGrid.map(r => [...r]);
      for (let r = 1; r < ROWS - 1; r++) {
        for (let c = 1; c < COLS - 1; c++) {
          if (isInClearing(c, r)) { next[r][c] = 0; continue; }
          const n = countNeighbors(caveGrid, c, r);
          if (caveGrid[r][c] === 1) {
            next[r][c] = (n >= 4) ? 1 : 0; // survival: S45678
          } else {
            next[r][c] = (n === 3) ? 1 : 0; // birth: B3
          }
        }
      }
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          caveGrid[r][c] = next[r][c];
        }
      }
    }

    // ── Carve corridors from center to each clearing entrance ────────────────
    const centerCol = Math.floor(COLS / 2);
    const centerRow = Math.floor(ROWS / 2);

    const carvePath = (fromCol, fromRow, toCol, toRow) => {
      // Manhattan path: first horizontal, then vertical, 2-cell wide
      let c = fromCol, r = fromRow;
      while (c !== toCol) {
        const step = c < toCol ? 1 : -1;
        caveGrid[r][c] = 0;
        if (r + 1 < ROWS - 1) caveGrid[r + 1][c] = 0;
        c += step;
      }
      while (r !== toRow) {
        const step = r < toRow ? 1 : -1;
        caveGrid[r][c] = 0;
        if (c + 1 < COLS - 1) caveGrid[r][c + 1] = 0;
        r += step;
      }
    };

    // Target midpoint of inner edge of each clearing
    carvePath(centerCol, centerRow, 15, 5);  // to north clearing inner edge
    carvePath(centerCol, centerRow, 15, 24); // to south clearing inner edge
    carvePath(centerCol, centerRow, 24, 15); // to east clearing inner edge
    carvePath(centerCol, centerRow, 5, 15);  // to west clearing inner edge

    // ── Entrance markers at clearing inner edges ─────────────────────────────
    const entranceData = [];

    // North: entrance at row 4, player moves DOWN to enter cave
    for (let c = 14; c <= 16; c++) {
      const obj = new BackgroundObject('^', c * GRID.CELL_SIZE, 4 * GRID.CELL_SIZE);
      obj.alwaysRender = true;
      room.backgroundObjects.push(obj);
      entranceData.push({ col: c, row: 4, direction: 'up' });
    }
    // South: entrance at row 25, player moves UP to enter cave
    for (let c = 14; c <= 16; c++) {
      const obj = new BackgroundObject('v', c * GRID.CELL_SIZE, 25 * GRID.CELL_SIZE);
      obj.alwaysRender = true;
      room.backgroundObjects.push(obj);
      entranceData.push({ col: c, row: 25, direction: 'down' });
    }
    // East: entrance at col 25, player moves LEFT to enter cave
    for (let r = 14; r <= 16; r++) {
      const obj = new BackgroundObject('>', 25 * GRID.CELL_SIZE, r * GRID.CELL_SIZE);
      obj.alwaysRender = true;
      room.backgroundObjects.push(obj);
      entranceData.push({ col: 25, row: r, direction: 'right' });
    }
    // West: entrance at col 4, player moves RIGHT to enter cave
    for (let r = 14; r <= 16; r++) {
      const obj = new BackgroundObject('<', 4 * GRID.CELL_SIZE, r * GRID.CELL_SIZE);
      obj.alwaysRender = true;
      room.backgroundObjects.push(obj);
      entranceData.push({ col: 4, row: r, direction: 'left' });
    }

    // ── Cap rocks flanking each entrance row ─────────────────────────────────
    // Mirrors the T-room pattern: surface-plane rocks on either end of the
    // entrance opening so the player can only enter head-on, not by sliding
    // sideways from an adjacent clearing cell. Pattern: 0 ^ ^ ^ 0 (etc.)
    const capPositions = [
      { col: 13, row: 4 },  { col: 17, row: 4 },   // flanks of north (^^^)
      { col: 13, row: 25 }, { col: 17, row: 25 },  // flanks of south (vvv)
      { col: 25, row: 13 }, { col: 25, row: 17 },  // flanks of east (>>>)
      { col: 4,  row: 13 }, { col: 4,  row: 17 }   // flanks of west (<<<)
    ];
    for (const { col, row } of capPositions) {
      const cap = new BackgroundObject('0', col * GRID.CELL_SIZE, row * GRID.CELL_SIZE);
      cap.indestructible = true;
      cap.surfaceOnly = true; // hide when player descends into the cave
      room.backgroundObjects.push(cap);
    }

    // ── Place cave wall bg objects on cave cells ──────────────────────────────
    // Also track open cave passage cells for glittering rock / enemy placement
    const passageCells = [];
    for (let r = 1; r < ROWS - 1; r++) {
      for (let c = 1; c < COLS - 1; c++) {
        if (caveGrid[r][c] === 1) {
          // Skip entrance cells — they must stay traversable
          const isEntrance = entranceData.some(e => e.col === c && e.row === r);
          if (isEntrance) continue;
          const obj = new BackgroundObject('}', c * GRID.CELL_SIZE, r * GRID.CELL_SIZE);
          room.backgroundObjects.push(obj);
        } else if (!isInClearing(c, r)) {
          // Open cave passage (not in clearing) — eligible for rocks / enemy spawns
          const isEntrance = entranceData.some(e => e.col === c && e.row === r);
          if (!isEntrance) passageCells.push({ col: c, row: r });
        }
      }
    }

    // ── Place 5-10 glittering rocks in cave passages ──────────────────────────
    this._shuffleArray(passageCells);
    const rockCount = this.randInt(5, 10);
    let rocksPlaced = 0;
    for (const cell of passageCells) {
      if (rocksPlaced >= rockCount) break;
      const obj = new BackgroundObject('2', cell.col * GRID.CELL_SIZE, cell.row * GRID.CELL_SIZE);
      room.backgroundObjects.push(obj);
      rocksPlaced++;
    }

    // ── Spawn 3-6 enemies in cave with plane 1 + rest state ──────────────────
    // Centralize spawns near the cave center (15, 15) so enemies cluster in the
    // middle rather than ambushing the player at the corridor mouths.
    const enemyCount = this.randInt(3, 6);
    const usedCells = new Set();
    let spawned = 0;
    const CENTER_RADIUS = 5;
    const remainingPassage = passageCells.slice(rockCount);
    const centralCells = remainingPassage.filter(cell =>
      Math.abs(cell.col - centerCol) <= CENTER_RADIUS &&
      Math.abs(cell.row - centerRow) <= CENTER_RADIUS
    );
    // Fallback to all remaining passage cells if not enough cluster around center
    const enemyCandidates = centralCells.length >= enemyCount
      ? centralCells
      : remainingPassage;
    this._shuffleArray(enemyCandidates);
    for (const cell of enemyCandidates) {
      if (spawned >= enemyCount) break;
      const key = `${cell.col},${cell.row}`;
      if (usedCells.has(key)) continue;
      // Keep away from entrances and clearings
      if (isInClearing(cell.col, cell.row)) continue;
      usedCells.add(key);
      const enemyChar = getZoneRandomEnemy(this.currentDepth, room.zone);
      const ex = cell.col * GRID.CELL_SIZE;
      const ey = cell.row * GRID.CELL_SIZE;
      const enemy = new Enemy(enemyChar, ex, ey, this.currentDepth);
      enemy.plane = 1;
      enemy.state = 'rest';
      enemy.setCollisionMap(room.collisionMap);
      enemy.setBackgroundObjects(room.backgroundObjects);
      this.addEnemyToRoom(room, enemy);
      spawned++;
    }

    // ── Spawn one pickaxe in a clearing so the player can find it ─────────────
    const pickaxeClearing = clearings[Math.floor(Math.random() * clearings.length)];
    const pickCol = this.randInt(pickaxeClearing.minCol + 1, pickaxeClearing.maxCol - 1);
    const pickRow = this.randInt(pickaxeClearing.minRow + 1, pickaxeClearing.maxRow - 1);
    const pickaxe = new Item('⛏', pickCol * GRID.CELL_SIZE, pickRow * GRID.CELL_SIZE);
    room.items.push(pickaxe);

    // ── Place 1 secret vein pair: red marker underground + secret rock on surface ──
    // The red '⊙' marker (plane 1, indestructible) appears underground at the same grid
    // position as a golden '@' rock on the surface. Mining the surface rock with a pickaxe
    // drops a Crystal Maul (T4 weapon). Candidate cells are taken from the portion of
    // passageCells not used by glittering rocks or enemies.
    const veinCandidates = passageCells.slice(rockCount + enemyCount);
    for (const cell of veinCandidates) {
      const veinX = cell.col * GRID.CELL_SIZE;
      const veinY = cell.row * GRID.CELL_SIZE;
      // Require a surface rock at this position (placed in the fill loop above).
      const surfaceIdx = room.backgroundObjects.findIndex(
        o => o.surfaceOnly && !o.destroyed &&
             o.position.x === veinX && o.position.y === veinY
      );
      if (surfaceIdx === -1) continue;
      // Replace the surface rock with the secret vein rock.
      // Override char/color so it renders identically to a regular '0' rock.
      const secretSurface = new BackgroundObject('@', veinX, veinY);
      secretSurface.surfaceOnly = true;
      secretSurface.char = '0';
      secretSurface.animationChar = '0';
      secretSurface.color = '#888888';
      secretSurface.animationColor = '#888888';
      room.backgroundObjects[surfaceIdx] = secretSurface;
      // Place the underground red marker at the same grid position.
      room.backgroundObjects.push(new BackgroundObject('⊙', veinX, veinY));
      break;
    }

    // ── Store underground metadata ────────────────────────────────────────────
    room.underground = {
      clearings,
      entrances: entranceData,
      entranceAxis: 'all',
      caveFogRadius: 5,
      caveGrid
    };

    // ── Declare per-direction spawn zones (center of each clearing) ─────────
    // Any system (enterExploreState, debug warps, future warp items) should
    // use these instead of generic edge-based defaults — entering from a side
    // lands the player in the opposite clearing; warps drop them at south.
    const C = GRID.CELL_SIZE;
    room.spawnZones = {
      north:   { x: 15 * C, y: 25 * C }, // entering from north → south clearing
      south:   { x: 15 * C, y:  3 * C }, // entering from south → north clearing
      east:    { x:  3 * C, y: 15 * C }, // entering from east  → west clearing
      west:    { x: 25 * C, y: 15 * C }, // entering from west  → east clearing
      default: { x: 15 * C, y: 25 * C }, // warp / no direction → south clearing
    };

    this.ensureKeyDroppers(room);
    room.exitsLocked = true;
  }

  generateBatBelfryRoom(room) {
    const COLS = GRID.COLS; // 30
    const ROWS = GRID.ROWS; // 30

    // Reuse underground cave generation for the underground atmosphere
    const clearings = [
      { minCol: 13, maxCol: 17, minRow: 1,  maxRow: 4,  side: 'north' },
      { minCol: 13, maxCol: 17, minRow: 25, maxRow: 28, side: 'south' },
      { minCol: 25, maxCol: 28, minRow: 13, maxRow: 17, side: 'east'  },
      { minCol: 1,  maxCol: 4,  minRow: 13, maxRow: 17, side: 'west'  }
    ];

    const isInClearing = (col, row) =>
      clearings.some(c => col >= c.minCol && col <= c.maxCol && row >= c.minRow && row <= c.maxRow);

    // Cellular automata cave generation (same as underground)
    const SEED_CHANCE = 0.45;
    const caveGrid = Array.from({ length: ROWS }, (_, r) =>
      Array.from({ length: COLS }, (_, c) => {
        if (c === 0 || c === COLS - 1 || r === 0 || r === ROWS - 1) return 1;
        if (isInClearing(c, r)) return 0;
        return Math.random() < SEED_CHANCE ? 1 : 0;
      })
    );

    const countNeighbors = (grid, col, row) => {
      let count = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = row + dr, nc = col + dc;
          if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) { count++; continue; }
          if (grid[nr][nc]) count++;
        }
      }
      return count;
    };

    for (let gen = 0; gen < 5; gen++) {
      const next = caveGrid.map(r => [...r]);
      for (let r = 1; r < ROWS - 1; r++) {
        for (let c = 1; c < COLS - 1; c++) {
          if (isInClearing(c, r)) { next[r][c] = 0; continue; }
          const n = countNeighbors(caveGrid, c, r);
          if (caveGrid[r][c] === 1) {
            next[r][c] = (n >= 4) ? 1 : 0;
          } else {
            next[r][c] = (n === 3) ? 1 : 0;
          }
        }
      }
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          caveGrid[r][c] = next[r][c];
        }
      }
    }

    // Carve corridors from center to each clearing
    const centerCol = Math.floor(COLS / 2);
    const centerRow = Math.floor(ROWS / 2);

    const carvePath = (fromCol, fromRow, toCol, toRow) => {
      let c = fromCol, r = fromRow;
      while (c !== toCol) {
        const step = c < toCol ? 1 : -1;
        caveGrid[r][c] = 0;
        if (r + 1 < ROWS - 1) caveGrid[r + 1][c] = 0;
        c += step;
      }
      while (r !== toRow) {
        const step = r < toRow ? 1 : -1;
        caveGrid[r][c] = 0;
        if (c + 1 < COLS - 1) caveGrid[r][c + 1] = 0;
        r += step;
      }
    };

    carvePath(centerCol, centerRow, 15, 5);
    carvePath(centerCol, centerRow, 15, 24);
    carvePath(centerCol, centerRow, 24, 15);
    carvePath(centerCol, centerRow, 5, 15);

    // Entrance markers
    const entranceData = [];
    for (let c = 14; c <= 16; c++) {
      const obj = new BackgroundObject('^', c * GRID.CELL_SIZE, 4 * GRID.CELL_SIZE);
      obj.alwaysRender = true;
      room.backgroundObjects.push(obj);
      entranceData.push({ col: c, row: 4, direction: 'up' });
    }
    for (let c = 14; c <= 16; c++) {
      const obj = new BackgroundObject('v', c * GRID.CELL_SIZE, 25 * GRID.CELL_SIZE);
      obj.alwaysRender = true;
      room.backgroundObjects.push(obj);
      entranceData.push({ col: c, row: 25, direction: 'down' });
    }
    for (let r = 14; r <= 16; r++) {
      const obj = new BackgroundObject('>', 25 * GRID.CELL_SIZE, r * GRID.CELL_SIZE);
      obj.alwaysRender = true;
      room.backgroundObjects.push(obj);
      entranceData.push({ col: 25, row: r, direction: 'right' });
    }
    for (let r = 14; r <= 16; r++) {
      const obj = new BackgroundObject('<', 4 * GRID.CELL_SIZE, r * GRID.CELL_SIZE);
      obj.alwaysRender = true;
      room.backgroundObjects.push(obj);
      entranceData.push({ col: 4, row: r, direction: 'left' });
    }

    // Place cave walls and collect passage cells
    const passageCells = [];
    for (let r = 1; r < ROWS - 1; r++) {
      for (let c = 1; c < COLS - 1; c++) {
        if (caveGrid[r][c] === 1) {
          const isEntrance = entranceData.some(e => e.col === c && e.row === r);
          if (isEntrance) continue;
          const obj = new BackgroundObject('}', c * GRID.CELL_SIZE, r * GRID.CELL_SIZE);
          room.backgroundObjects.push(obj);
        } else if (!isInClearing(c, r)) {
          const isEntrance = entranceData.some(e => e.col === c && e.row === r);
          if (!isEntrance) passageCells.push({ col: c, row: r });
        }
      }
    }

    // A few glittering rocks for atmosphere
    this._shuffleArray(passageCells);
    const rockCount = this.randInt(3, 6);
    let rocksPlaced = 0;
    for (const cell of passageCells) {
      if (rocksPlaced >= rockCount) break;
      const obj = new BackgroundObject('2', cell.col * GRID.CELL_SIZE, cell.row * GRID.CELL_SIZE);
      room.backgroundObjects.push(obj);
      rocksPlaced++;
    }

    // Spawn 15 bats in cave passages (plane 1, rest state — same as underground)
    const batCandidates = passageCells.slice(rockCount);
    this._shuffleArray(batCandidates);
    const usedCells = new Set();
    let batsSpawned = 0;
    for (const cell of batCandidates) {
      if (batsSpawned >= 15) break;
      const key = `${cell.col},${cell.row}`;
      if (usedCells.has(key)) continue;
      if (isInClearing(cell.col, cell.row)) continue;
      usedCells.add(key);
      const bat = new Enemy('^', cell.col * GRID.CELL_SIZE, cell.row * GRID.CELL_SIZE, this.currentDepth);
      bat.plane = 1;
      bat.state = 'rest';
      bat.setCollisionMap(room.collisionMap);
      bat.setBackgroundObjects(room.backgroundObjects);
      this.addEnemyToRoom(room, bat);
      batsSpawned++;
    }

    room.isBatBelfry = true;
    room.underground = {
      clearings,
      entrances: entranceData,
      entranceAxis: 'all',
      caveFogRadius: 5,
      caveGrid
    };

    this.ensureKeyDroppers(room);
    room.exitsLocked = true;
  }

  // Fisher-Yates shuffle (in-place)
  _shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  generateIslandTerrain(room) {
    const config = this.currentLetterTemplate.islandZone;
    const {
      islandCenterCol, islandCenterRow,
      islandRadius, lakeRadius, edgeNoise,
      waterDensity, barrelMin, barrelMax
    } = config;
    const barrelCount = this.randInt(barrelMin, barrelMax);

    // Shoreline transition bands
    const islandInner  = islandRadius - edgeNoise;  // Always land
    const islandOuter  = islandRadius + edgeNoise;  // Island → water transition
    const lakeInner    = lakeRadius   - edgeNoise;  // Water → outer land transition
    const lakeOuter    = lakeRadius   + edgeNoise;  // Always outer land

    // Remove background objects that landed in the water ring
    room.backgroundObjects = room.backgroundObjects.filter(obj => {
      const col = obj.position.x / GRID.CELL_SIZE;
      const row = obj.position.y / GRID.CELL_SIZE;
      const dx = col - islandCenterCol;
      const dy = row - islandCenterRow;
      const dist = Math.sqrt(dx * dx + dy * dy);
      // Keep objects on the island or on the outer land; remove from the water ring
      return dist <= islandOuter || dist >= lakeInner;
    });

    // Flood the lake ring with water tiles
    for (let col = 1; col < GRID.COLS - 1; col++) {
      for (let row = 1; row < GRID.ROWS - 1; row++) {
        if (room.collisionMap[row][col]) continue;
        if (this.hasObjectAt(room, col * GRID.CELL_SIZE, row * GRID.CELL_SIZE)) continue;

        const dx = col - islandCenterCol;
        const dy = row - islandCenterRow;
        const dist = Math.sqrt(dx * dx + dy * dy);

        let waterChance = 0;

        if (dist > islandOuter && dist < lakeInner) {
          // Core water ring — full density
          waterChance = waterDensity;
        } else if (dist > islandInner && dist <= islandOuter) {
          // Island shoreline — smooth fade from land to water
          const t = (dist - islandInner) / (islandOuter - islandInner);
          waterChance = t * waterDensity;
        } else if (dist >= lakeInner && dist < lakeOuter) {
          // Outer shoreline — smooth fade from water to outer land
          const t = 1 - (dist - lakeInner) / (lakeOuter - lakeInner);
          waterChance = t * waterDensity;
        }

        if (waterChance > 0 && Math.random() < waterChance) {
          const water = new BackgroundObject('~', col * GRID.CELL_SIZE, row * GRID.CELL_SIZE);
          room.backgroundObjects.push(water);
        }
      }
    }

    // Scatter barrels on the island
    let placed = 0;
    let attempts = 0;
    while (placed < barrelCount && attempts < 200) {
      attempts++;
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.random() * Math.max(islandInner - 1, 1);
      const col = Math.round(islandCenterCol + Math.cos(angle) * radius);
      const row = Math.round(islandCenterRow + Math.sin(angle) * radius);

      if (this.isValidPosition(col, row, room) &&
          !this.hasObjectAt(room, col * GRID.CELL_SIZE, row * GRID.CELL_SIZE)) {
        const barrel = new BackgroundObject('p', col * GRID.CELL_SIZE, row * GRID.CELL_SIZE);
        this.applyZoneProperties(barrel, room.zone);
        this.applyKeyDropLogic(barrel);
        room.backgroundObjects.push(barrel);
        placed++;
      }
    }
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

  generateLakeTerrain(room) {
    const config = this.currentLetterTemplate.lakeZone;
    const { nodes, edgeNoise, waterDensity } = config;

    // For each grid cell, check if it falls inside any blob node
    for (let col = 1; col < GRID.COLS - 1; col++) {
      for (let row = 1; row < GRID.ROWS - 1; row++) {
        if (room.collisionMap[row][col]) continue;

        // Check if cell is inside any blob (with noise)
        let inAnyBlob = false;
        for (const node of nodes) {
          const dx = col - node.col;
          const dy = row - node.row;
          const dist = Math.sqrt(dx * dx + dy * dy);
          // Perlin-like edge noise: add random offset to threshold per cell
          const noiseOffset = (Math.random() - 0.5) * edgeNoise;
          if (dist < node.radius + noiseOffset) {
            inAnyBlob = true;
            break;
          }
        }

        if (inAnyBlob && Math.random() < waterDensity) {
          // Remove any existing background object at this cell
          const cellX = col * GRID.CELL_SIZE;
          const cellY = row * GRID.CELL_SIZE;
          const halfCell = GRID.CELL_SIZE / 2;

          room.backgroundObjects = room.backgroundObjects.filter(obj =>
            !(Math.abs(obj.position.x - cellX) < halfCell &&
              Math.abs(obj.position.y - cellY) < halfCell)
          );

          // Place water tile
          const water = new BackgroundObject('~', cellX, cellY);
          room.backgroundObjects.push(water);
        }
      }
    }

    // Scatter shoreline decoration (rocks, bushes) at blob edges
    for (const node of nodes) {
      const decCount = Math.floor(node.radius * 1.5);
      for (let i = 0; i < decCount; i++) {
        const angle = Math.random() * Math.PI * 2;
        const edgeDist = node.radius + 0.5 + Math.random() * 1.5;
        const col = Math.round(node.col + Math.cos(angle) * edgeDist);
        const row = Math.round(node.row + Math.sin(angle) * edgeDist);

        if (this.isValidPosition(col, row, room) &&
            !this.hasObjectAt(room, col * GRID.CELL_SIZE, row * GRID.CELL_SIZE)) {
          const decChar = Math.random() < 0.6 ? '%' : '0';
          const decObj = new BackgroundObject(decChar, col * GRID.CELL_SIZE, row * GRID.CELL_SIZE);
          this.applyZoneProperties(decObj, room.zone);
          room.backgroundObjects.push(decObj);
        }
      }
    }
  }

  preloadRoomPreviews() {
    const previews = { north: null, east: null, west: null, south: null };
    const directions = ['north', 'east', 'west'];
    for (const direction of directions) {
      const roomType = this.determineRoomType();
      const preview = this.getRoomPreview(roomType);
      previews[direction] = {
        type: roomType,
        char: preview.char,
        name: preview.name
      };
    }
    return previews;
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

  spawnEnemiesFrom(game, spawner, spawnData) {
    const newEnemies = [];
    const { spawnChar, spawnCount, spawnRange, spawnerPosition } = spawnData;

    for (let i = 0; i < spawnCount; i++) {
      const spawnPos = this.findSpawnPosition(
        spawnerPosition,
        spawnRange,
        game.currentRoom.collisionMap,
        game.currentRoom.enemies
      );

      if (spawnPos) {
        const newEnemy = new Enemy(spawnChar, spawnPos.x, spawnPos.y, game.currentDepth);
        newEnemy.setCollisionMap(game.currentRoom.collisionMap);
        newEnemy.setBackgroundObjects(game.currentRoom.backgroundObjects);
        newEnemy.setSteamClouds(game.steamClouds);
        newEnemy.setTarget(game.player);
        newEnemy.setGame(game);
        newEnemy.setRoom(game.currentRoom);
        newEnemy.enraged = true;
        game.physicsSystem.addEntity(newEnemy);
        newEnemies.push(newEnemy);
      }
    }

    return newEnemies;
  }

  hasObjectAt(room, x, y) {
    // Check if there's already a background object at this pixel position
    const threshold = GRID.CELL_SIZE / 2; // Allow objects within half a cell
    return room.backgroundObjects.some(obj =>
      Math.abs(obj.position.x - x) < threshold &&
      Math.abs(obj.position.y - y) < threshold
    );
  }

  getIslandPosition(islandConfig, collisionMap, existingEnemies = [], playerStartPos = null, backgroundObjects = []) {
    const { islandCenterCol, islandCenterRow, islandRadius, edgeNoise } = islandConfig;
    const islandInner = islandRadius - edgeNoise;
    const spawnRadius = Math.max(islandInner - 1, 1);
    const MIN_SPACING = GRID.CELL_SIZE * 2;
    const PLAYER_BUFFER = GRID.CELL_SIZE * 3;

    for (let attempts = 0; attempts < 200; attempts++) {
      const angle = Math.random() * Math.PI * 2;
      const r = Math.random() * spawnRadius;
      const col = Math.round(islandCenterCol + Math.cos(angle) * r);
      const row = Math.round(islandCenterRow + Math.sin(angle) * r);

      if (col < 1 || col >= GRID.COLS - 1 || row < 1 || row >= GRID.ROWS - 1) continue;
      if (collisionMap[row]?.[col]) continue;

      const pixelX = col * GRID.CELL_SIZE;
      const pixelY = row * GRID.CELL_SIZE;

      if (playerStartPos) {
        const dx = pixelX - playerStartPos.x;
        const dy = pixelY - playerStartPos.y;
        if (Math.sqrt(dx * dx + dy * dy) < PLAYER_BUFFER) continue;
      }

      let tooClose = false;
      for (const e of existingEnemies) {
        const dx = pixelX - e.position.x;
        const dy = pixelY - e.position.y;
        if (Math.sqrt(dx * dx + dy * dy) < MIN_SPACING) { tooClose = true; break; }
      }
      if (tooClose) continue;

      let blocked = false;
      for (const obj of backgroundObjects) {
        if (obj.solid) {
          const dx = pixelX - obj.position.x;
          const dy = pixelY - obj.position.y;
          if (Math.abs(dx) < GRID.CELL_SIZE && Math.abs(dy) < GRID.CELL_SIZE) { blocked = true; break; }
        }
      }
      if (blocked) continue;

      return { x: pixelX, y: pixelY };
    }

    // Fallback to any position on the island center
    return { x: islandCenterCol * GRID.CELL_SIZE, y: islandCenterRow * GRID.CELL_SIZE };
  }

  getRandomPosition(collisionMap, existingEnemies = [], playerStartPos = null, backgroundObjects = [], allowLiquid = false) {
    let x, y;
    let attempts = 0;
    const MIN_SPACING = GRID.CELL_SIZE * 2; // Minimum distance between entities
    const PLAYER_BUFFER = GRID.CELL_SIZE * 3; // Larger buffer around player start
    const EXIT_CLEARANCE = 3; // Grid cells to clear around each exit
    // Liquid chars enemies should never spawn on (water, lava, mud all use '~'; '=' is static water)
    const LIQUID_CHARS = new Set(['~', '=']);

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

      // Reject positions inside the vault interior (only walls are solid; interior must stay enemy-free)
      if (this.currentVaultInfo) {
        const v = this.currentVaultInfo;
        if (x > v.minCol && x < v.maxCol && y > v.minRow && y < v.maxRow) {
          attempts++;
          continue;
        }
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

      // Reject positions on liquid tiles (water/lava/mud) unless enemy has water affinity
      if (!allowLiquid && backgroundObjects.length > 0) {
        const onLiquid = backgroundObjects.some(obj =>
          LIQUID_CHARS.has(obj.char) &&
          Math.abs(obj.position.x - pixelX) < GRID.CELL_SIZE &&
          Math.abs(obj.position.y - pixelY) < GRID.CELL_SIZE
        );
        if (onLiquid) {
          attempts++;
          continue;
        }
      }

      // Reject positions overlapping solid background objects (rocks, boulders, crates, etc.)
      if (backgroundObjects.length > 0) {
        const overlappingSolid = backgroundObjects.some(obj => {
          if (obj.destroyed) return false;
          if (!obj.data) return false;
          if (typeof obj.data.slowing === 'number') return false; // trees/stumps are passable
          const isSolid = obj.data.solid ||
            obj.data.bulletInteraction === 'block' ||
            obj.data.bulletInteraction === 'interact-preserve';
          if (!isSolid) return false;
          const objBox = obj.getHitbox();
          return (
            pixelX < objBox.x + objBox.width &&
            pixelX + GRID.CELL_SIZE > objBox.x &&
            pixelY < objBox.y + objBox.height &&
            pixelY + GRID.CELL_SIZE > objBox.y
          );
        });
        if (overlappingSolid) {
          attempts++;
          continue;
        }
      }

      // Valid position found
      break;
    } while (attempts < 100);

    // Exhausted all attempts without finding a valid position
    if (attempts >= 100) {
      return null;
    }

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
      if (!centerPos) continue;
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
      if (!centerPos) continue;
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

          // Pre-spawn as burned/damaged if zone requires it (only applies to flammable objects)
          if (preSpawnBurned && bgObject.flammability !== 'none') {
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
      if (!centerPos) return;
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
      if (!centerPos) return;
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
      if (!startPos) return;
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
      if (!centerPos) continue;
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
      if (!pos) continue;

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
      if (!bgObj || !bgObj.data) continue;
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
        '~': 0.10,
        '⊞': 0.02
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
        'i': 0.05,
        '⊞': 0.03
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

    // Guard: if no structures are defined for this room type, skip placement.
    // This can happen when a new ROOM_TYPE is added but getStructureCount has
    // no explicit case for it — see the contract comment on getStructureCount.
    if (Object.keys(availableStructures).length === 0 || structureCount === 0) return;

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

  /**
   * Returns the number of random wall structures to stamp into a room.
   *
   * CONTRACT — every entry in ROOM_TYPES must have an explicit case here.
   *
   * When a new room type is added to ROOM_TYPES (GameConfig.js), add a
   * corresponding case below before shipping. The choices are:
   *   • return a count range  → standard wall structures will be placed
   *   • return 0              → room manages its own terrain (e.g. ASCENT,
   *                             TUNNEL), or should stay open by design
   *
   * Failing to add a case causes the default branch to run, which returns a
   * non-zero count. placeWallStructures will then call getStructuresForRoom
   * with the unknown type, receive an empty object, and crash inside
   * selectWeightedStructure when it tries to access entries[0][1].
   * The guard in placeWallStructures prevents the crash, but a console.warn
   * will fire so the missing case is still visible during development.
   */
  getStructureCount(roomType) {
    switch(roomType) {
      case ROOM_TYPES.COMBAT:    return this.randInt(1, 2);
      case ROOM_TYPES.BOSS:      return 1;
      case ROOM_TYPES.DISCOVERY: return this.randInt(2, 3);
      case ROOM_TYPES.CAMP:      return this.randInt(1, 2);
      case ROOM_TYPES.TUNNEL:      return 0; // Tunnel generates its own walls
      case ROOM_TYPES.ASCENT:      return 0; // Slope ring is the environmental feature
      case ROOM_TYPES.UNDERGROUND: return 0; // Underground generates its own cave terrain
      case ROOM_TYPES.HUT:         return 0; // Hut generates its own wall structure
      case ROOM_TYPES.DUNGEON:     return 0; // Dungeon generates its own wall structure
      case ROOM_TYPES.MAZE:        return 0; // Maze generates its own exterior building
      case ROOM_TYPES.RIDGE:       return 0; // Ridge generates its own ravine structure
      case ROOM_TYPES.BAT_BELFRY:  return 0; // Bat belfry generates its own cave terrain
      case ROOM_TYPES.WELL:        return 0; // Well room places its own central structure
      case ROOM_TYPES.FOUNTAIN:    return 0; // Fountain places its own pool + waterfall structure
      default:
        console.warn(`[RoomGenerator] getStructureCount: no case for room type "${roomType}". ` +
          'Add an explicit case to RoomGenerator.getStructureCount(). Returning 0 as safe fallback.');
        return 0;
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
          // Active chase: guaranteed spawn so the Leshy never silently disappears mid-chase.
          // shouldSpawnShakingBush blocks when leshyChaseActive, so check it separately.
          if (this.zoneSystem?.leshyChaseActive) {
            return room.zone === 'green' && roomCleared;
          }
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
      },

      // PRIORITY 3: Fairy Grass (any zone, low chance — only when not angered)
      // The fairy is the player's only path to discovering F (Fountain) rooms.
      // Marks multiple tall-grass tiles ('|') so any one of them releases the
      // fairy when cut. InteractionSystem.cutGrass enforces one-per-room via
      // game.currentRoom.fairySpawned.
      {
        name: 'fairy_grass',
        priority: 3,
        condition: (room) => {
          if (this.game?.fairiesAngered) return false;
          const roomCleared = room.enemies.length === 0;
          if (!roomCleared) return false;
          // 25% per eligible room. Multiple grass tiles marked, so first
          // cut spawns the fairy regardless of which marked tile the player hits.
          return Math.random() < 0.25;
        },
        eligibleObjects: (room) => {
          return room.backgroundObjects.filter(obj => obj.char === '|');
        },
        mark: (selectedObject, eligibleObjects) => {
          // Mark roughly a third of eligible grass tiles (min 3, capped at all).
          const count = Math.min(eligibleObjects.length, Math.max(3, Math.ceil(eligibleObjects.length / 3)));
          // Always include the framework-selected object, then fill from a shuffle.
          const pool = eligibleObjects.filter(o => o !== selectedObject);
          for (let i = pool.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [pool[i], pool[j]] = [pool[j], pool[i]];
          }
          const marked = [selectedObject, ...pool.slice(0, count - 1)];
          for (const obj of marked) {
            obj.fairyGrass = true;
          }
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

      // Mark the object with this event (event may opt to mark additional
      // siblings from `eligibleObjects` — e.g. fairy_grass marks several).
      eventType.mark(selectedObject, eligibleObjects);

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
    if (Array.isArray(itemConfig.itemPool)) {
      itemPool = itemConfig.itemPool;
    } else if (itemConfig.itemPool === 'rare_epic') {
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
    } else if (itemConfig.position === 'clearing_center') {
      // Spawn at the center of the template's clearingZone
      const clearing = this.currentLetterTemplate.bgObjectRules?.clearingZone;
      if (clearing) {
        const centerX = clearing.centerCol * GRID.CELL_SIZE + (GRID.CELL_SIZE / 2);
        const centerY = clearing.centerRow * GRID.CELL_SIZE + (GRID.CELL_SIZE / 2);
        spawnPos = { x: centerX, y: centerY };
      } else {
        spawnPos = this.getRandomPosition(room.collisionMap, room.enemies, room.playerStartPos);
      }
    } else {
      // Fallback to random position
      spawnPos = this.getRandomPosition(room.collisionMap, room.enemies, room.playerStartPos);
    }

    if (!spawnPos) return;

    // Create and add item to room
    const item = new Item(itemChar, spawnPos.x, spawnPos.y);
    room.items.push(item);
  }

  // Blue-zone tutorial rooms: drop the armor pickup (Shallows/Reef/Wake) or the
  // pearl-cache pedestal (Pearl Cache), and clamp exits to a linear N/S spine
  // so the player can only advance forward or retreat. The actual N exit-letter
  // routing (which room comes next) is set in main.js via game.blueZoneRoom.
  applyBlueZoneTemplate(room) {
    const tpl = this.currentLetterTemplate;
    if (!tpl) return;

    // Clear any cell collision at the spawn cell so the player can pick up / step on
    const clearCell = (col, row) => {
      if (!room.collisionMap?.[row]) return;
      room.collisionMap[row][col] = false;
      const cellX = col * GRID.CELL_SIZE;
      const cellY = row * GRID.CELL_SIZE;
      const half = GRID.CELL_SIZE / 2;
      room.backgroundObjects = room.backgroundObjects.filter(o =>
        !(Math.abs(o.position.x - cellX) < half && Math.abs(o.position.y - cellY) < half)
      );
    };

    // Armor pickup: spawn on the south-center dry strip — players enter from
    // south so the item is the first thing they see.
    if (tpl.blueZoneArmor) {
      const armorCol = 15;
      const armorRow = 26;
      clearCell(armorCol, armorRow);
      const x = armorCol * GRID.CELL_SIZE;
      const y = armorRow * GRID.CELL_SIZE;
      const armor = new Item(tpl.blueZoneArmor, x, y);
      room.items.push(armor);
    }

    // Pearl Cache pedestal: BackgroundObject at room center, marked for the
    // SPACE-press handler in main.js. Mirrors the Ocean pearl-pedestal pattern.
    if (tpl.blueZonePedestal) {
      const pCol = 15;
      const pRow = 15;
      clearCell(pCol, pRow);
      const px = pCol * GRID.CELL_SIZE;
      const py = pRow * GRID.CELL_SIZE;
      const pedestal = new BackgroundObject('∏', px, py);
      pedestal.color = '#ccddff';
      pedestal.hasCollision = true;
      pedestal.pearlCachePedestal = true;
      if (room.collisionMap?.[pRow]) {
        room.collisionMap[pRow][pCol] = true;
      }
      room.backgroundObjects.push(pedestal);
      room.pearlCachePedestal = {
        col: pCol, row: pRow,
        x: px + GRID.CELL_SIZE / 2,
        y: py + GRID.CELL_SIZE / 2,
        activated: false,
        obj: pedestal
      };
    }

    // Linear spine — kill east/west exits. North advances, south retreats.
    // Pearl Cache is terminal: no north (no further blue rooms); south returns
    // to Rest. The actual N exit letter for the three combat rooms is wired in
    // main.js where game.blueZoneRoom drives the next room generation.
    room.exits.east = false;
    room.exits.west = false;
    if (tpl.blueZonePedestal) {
      room.exits.north = false;
    }
  }

  generateHutRoom(room) {
    const template = this.currentLetterTemplate?.hutStructure;
    const centerCol = template?.centerCol ?? 15;
    const baseCenterRow = template?.centerRow ?? 15;
    const extW = template?.exteriorWidth ?? 5;   // half-extents
    const extH = template?.exteriorHeight ?? 5;
    const halfW = Math.floor(extW / 2);           // 2
    const halfH = Math.floor(extH / 2);           // 2

    // Roll hut scenario first — witch huts shift the structure up by 2 rows
    // to make room for chicken legs underneath. Cheat override:
    //   game.cheat_forceHutKind = 'witch' | 'enemy_encounter' | 'neutral_npc'
    // forces every subsequent hut roll to that kind.
    // P-rooms (Press Hut) always get a guaranteed press inside, which means
    // the player must be able to reach the door — so we never roll witch.
    const isPressHut = room.exitLetter === 'P';
    const cheatKind = this.game?.cheat_forceHutKind;
    const validKinds = new Set(['enemy_encounter', 'neutral_npc', 'wise_man', 'witch']);
    let hutKind;
    if (cheatKind && validKinds.has(cheatKind)) {
      hutKind = cheatKind;
    } else if (isPressHut) {
      hutKind = Math.random() < 0.5 ? 'enemy_encounter' : 'neutral_npc';
    } else {
      const r = Math.random();
      hutKind =
        r < 0.40 ? 'enemy_encounter' :  // 40% — combat
        r < 0.70 ? 'neutral_npc'      :  // 30% — errand traveler (placeholder)
        r < 0.90 ? 'wise_man'         :  // 20% — wise fellow hint
                   'witch';               // 10% — chicken-leg hut
    }

    const isWitchRaised = hutKind === 'witch';
    const verticalShift = isWitchRaised ? 2 : 0;
    const centerRow = baseCenterRow - verticalShift;

    const minCol = centerCol - halfW;
    const maxCol = centerCol + halfW;
    const minRow = centerRow - halfH;
    const maxRow = centerRow + halfH;

    // The entire hut footprint is solid — walls, door cell, and the interior
    // dark fill cells — so nothing can occupy any cell of the building from
    // the exterior room. Entry is SPACE-only via proximity check.
    const wallObjects = [];
    const interiorObjects = [];
    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        room.collisionMap[row][col] = true;
        const isWall = row === minRow || row === maxRow || col === minCol || col === maxCol;
        if (!isWall) {
          // Interior cell: paint with dark fill so the hut reads as enclosed.
          const fill = new BackgroundObject('█', col * GRID.CELL_SIZE, row * GRID.CELL_SIZE);
          room.backgroundObjects.push(fill);
          interiorObjects.push(fill);
          continue;
        }
        // Door cell: mark solid (above) but skip the wall glyph; door overlays.
        if (row === maxRow && col === centerCol) continue;
        const wallObj = new BackgroundObject('≡', col * GRID.CELL_SIZE, row * GRID.CELL_SIZE);
        room.backgroundObjects.push(wallObj);
        wallObjects.push(wallObj);
      }
    }

    // Place door (∩) at south-center of hut footprint
    const doorCol = centerCol;
    const doorRow = maxRow;
    const doorObj = new BackgroundObject('∩', doorCol * GRID.CELL_SIZE, doorRow * GRID.CELL_SIZE);
    room.backgroundObjects.push(doorObj);

    // Witch huts rest atop two chicken legs: the door is unreachable until the
    // SIT/SITDOWN spell lowers the hut. Legs are passable (player walks under)
    // but bullet-blocking, so they shake when struck.
    const legObjects = [];
    if (isWitchRaised) {
      const legCols = [centerCol - 1, centerCol + 1];
      const legRows = [maxRow + 1, maxRow + 2];
      for (const lc of legCols) {
        for (const lr of legRows) {
          if (lr >= GRID.ROWS - 1) continue;
          const leg = new BackgroundObject('λ', lc * GRID.CELL_SIZE, lr * GRID.CELL_SIZE);
          room.backgroundObjects.push(leg);
          legObjects.push(leg);
        }
      }
    }

    room.hut = {
      exteriorBounds: { minCol, maxCol, minRow, maxRow },
      doorPosition: { col: doorCol, row: doorRow },
      hutKind,
      interiorGenerated: false,
      pressBias: isPressHut, // HutSystem reads this when generating interior
      raised: isWitchRaised,
      verticalShift,
      wallObjects,
      doorObject: doorObj,
      interiorObjects,
      legObjects
    };

    // Press Hut: P-marker glyph on the exterior north wall (above the door
    // alignment) so the player can identify the room from outside.
    if (isPressHut) {
      const marker = new BackgroundObject('P', centerCol * GRID.CELL_SIZE, minRow * GRID.CELL_SIZE);
      marker.color = '#ffd54a';
      marker.indestructible = true;
      room.backgroundObjects.push(marker);
    }

    // Effective vertical bounds include chicken legs for witch huts so that
    // background-object clearing and enemy spacing treat the legs as part
    // of the hut footprint.
    const effectiveMaxRow = maxRow + (isWitchRaised ? 2 : 0);
    const effectiveCenterRow = (minRow + effectiveMaxRow) / 2;
    const effectiveExtH = effectiveMaxRow - minRow + 1;

    // Generate background objects (standard combat room style)
    // Override clearing zone to keep hut perimeter clear
    const prevClearingZone = this.currentLetterTemplate?.bgObjectRules?.clearingZone;
    if (this.currentLetterTemplate?.bgObjectRules) {
      this.currentLetterTemplate.bgObjectRules.clearingZone = {
        centerCol,
        centerRow: effectiveCenterRow,
        width: extW + 4,   // 2-cell buffer around hut
        height: effectiveExtH + 4,
        allowGrass: false,
        allowObjects: false
      };
    }

    this.generateBackgroundObjects(room);

    // Restore original clearing zone setting
    if (this.currentLetterTemplate?.bgObjectRules) {
      this.currentLetterTemplate.bgObjectRules.clearingZone = prevClearingZone;
    }

    // Spawn enemies outside the hut perimeter (including legs for witch huts)
    const enemyCount = this.randInt(2, 4);
    for (let i = 0; i < enemyCount; i++) {
      const enemyChar = getZoneRandomEnemy(this.currentDepth, room.zone);
      if (!enemyChar) continue;
      const pos = this.getRandomPosition(room.collisionMap, room.enemies, room.playerStartPos, room.backgroundObjects);
      if (!pos) continue;
      const gc = Math.floor(pos.x / GRID.CELL_SIZE);
      const gr = Math.floor(pos.y / GRID.CELL_SIZE);
      const tooClose = gc >= minCol - 1 && gc <= maxCol + 1 && gr >= minRow - 1 && gr <= effectiveMaxRow + 1;
      if (tooClose) continue;
      const enemy = new Enemy(enemyChar, pos.x, pos.y, this.currentDepth);
      enemy.setCollisionMap(room.collisionMap);
      enemy.setBackgroundObjects(room.backgroundObjects);
      this.addEnemyToRoom(room, enemy);
    }

    room.exitsLocked = room.enemies.length > 0;
  }

  /**
   * Ridge room ('R') — the entire top 9 rows are an impassable ravine.
   * A BridgeWorker NPC stands south of the cliff; donating sticks/metal/rocks
   * (or casting BRIDGE with a wish) builds planks row-by-row across cols
   * 14-16, opening a 3-cell-wide path to the north exit.
   *
   * The dark cliff visual is painted by ExploreRenderer's ravine gradient
   * (rows 0..ravineRows). Background objects in those rows are stripped so
   * trees/grass don't poke through the ravine fill.
   */
  generateRidgeRoom(room) {
    const CS = GRID.CELL_SIZE;
    const RAVINE_ROW_MAX = 9; // last row of the ravine; player ground starts at row 10

    // Standard background pass for terrain/decor on the player's side.
    this.generateBackgroundObjects(room);

    // Strip any background objects the standard pass dropped into the ravine
    // — the ravine gradient covers them visually but they'd flicker through
    // animations and confuse pathing.
    for (let i = room.backgroundObjects.length - 1; i >= 0; i--) {
      const o = room.backgroundObjects[i];
      const or = Math.floor(o.position.y / CS);
      if (or >= 1 && or <= RAVINE_ROW_MAX) room.backgroundObjects.splice(i, 1);
    }

    // Solidify the entire ravine band (excluding border columns, which are
    // already solid). RidgeSystem._placeBridgeRow opens cols 14-16 of rows
    // 2-9 as planks are placed.
    for (let r = 1; r <= RAVINE_ROW_MAX; r++) {
      for (let c = 1; c < GRID.COLS - 1; c++) {
        room.collisionMap[r][c] = true;
      }
    }

    // Tell ExploreRenderer how tall the ravine is (paints the cliff gradient).
    room.ravineRows = RAVINE_ROW_MAX;

    // North exit always reads as "gray zone" from a Ridge room — the ridge
    // climbs into the misted high country.
    if (room.exits?.north) {
      room.exits.north.color = '#888888';
    }

    // Bridge state — donations + worker reference. main.js reads bridgeWorker
    // on room entry to register the NPC into game.neutralCharacters.
    room.bridgeDonated = { stick: 0, metal: 0, rock: 0 };
    room.bridgeBuilt = false;
    room.bridgeAnimating = false;

    // Place worker south of the cliff lip, on the bridge-approach centerline.
    const workerCol = 15;
    const workerRow = 14;
    room.bridgeWorker = new BridgeWorker(workerCol * CS, workerRow * CS);

    // Spawn zones — keep the player south of the cliff regardless of which
    // direction they warped in from.
    const safeY = (RAVINE_ROW_MAX + 6) * CS; // row 15
    room.spawnZones = {
      north:   { x: 15 * CS, y: safeY }, // bridge approach
      south:   { x: 15 * CS, y: (GRID.ROWS - 3) * CS },
      east:    { x: 2 * CS,  y: safeY },
      west:    { x: (GRID.COLS - 3) * CS, y: safeY },
      default: { x: 15 * CS, y: safeY },
    };

    room.exitsLocked = false;
  }

  generateWellRoom(room) {
    const CS = GRID.CELL_SIZE;
    const template = this.currentLetterTemplate?.wellStructure;
    const centerCol = template?.centerCol ?? 15;
    const centerRow = template?.centerRow ?? 15;
    const ringRadius = template?.ringRadius ?? 2;

    // Background terrain pass first so the standard objects fill the room edges,
    // then the clearingZone in the W template keeps the well's footprint clear.
    this.generateBackgroundObjects(room);

    // Place a circular ring of well stones around the central water cell.
    // Cells inside the ring (excluding the center) stay walkable so the player
    // can approach from any side; corners outside the ring are dropped to
    // soften the silhouette into a circle rather than a square.
    const ringCells = [];
    for (let dr = -ringRadius; dr <= ringRadius; dr++) {
      for (let dc = -ringRadius; dc <= ringRadius; dc++) {
        const dist = Math.sqrt(dr * dr + dc * dc);
        // Outer ring: cells whose distance is within [r-0.5, r+0.5]
        if (dist < ringRadius - 0.5 || dist > ringRadius + 0.5) continue;
        ringCells.push({ r: centerRow + dr, c: centerCol + dc });
      }
    }

    for (const { r, c } of ringCells) {
      if (r < 1 || r >= GRID.ROWS - 1 || c < 1 || c >= GRID.COLS - 1) continue;
      room.collisionMap[r][c] = true;
      const stone = new BackgroundObject('◯', c * CS, r * CS);
      room.backgroundObjects.push(stone);
    }

    // Center water cell — the target of the Infused Coin animation.
    room.collisionMap[centerRow][centerCol] = true;
    const water = new BackgroundObject('=', centerCol * CS, centerRow * CS);
    room.backgroundObjects.push(water);

    // Strip any background objects the standard pass may have placed inside the
    // ring footprint so the well silhouette stays clean.
    for (let i = room.backgroundObjects.length - 1; i >= 0; i--) {
      const o = room.backgroundObjects[i];
      const oc = Math.floor(o.position.x / CS);
      const orow = Math.floor(o.position.y / CS);
      if (o.char === '◯' || (oc === centerCol && orow === centerRow)) continue;
      const dr = orow - centerRow;
      const dc = oc - centerCol;
      if (Math.sqrt(dr * dr + dc * dc) <= ringRadius + 0.5) {
        room.backgroundObjects.splice(i, 1);
      }
    }

    // Spawn 1-2 zone enemies in the rest of the room — keeps it from being
    // a pure safe-zone before activation, but light so the player can focus
    // on the ritual.
    const enemyCount = this.randInt(1, 2);
    for (let i = 0; i < enemyCount; i++) {
      const enemyChar = getZoneRandomEnemy(this.currentDepth, room.zone);
      if (!enemyChar) continue;
      const pos = this.getRandomPosition(room.collisionMap, room.enemies, room.playerStartPos, room.backgroundObjects);
      if (!pos) continue;
      const enemy = new Enemy(enemyChar, pos.x, pos.y, this.currentDepth);
      enemy.setCollisionMap(room.collisionMap);
      enemy.setBackgroundObjects(room.backgroundObjects);
      this.addEnemyToRoom(room, enemy);
    }

    // Per-room well state — WellSystem reads this to detect activation
    // proximity. Once consumed, the well stays inert for the rest of the room.
    room.well = {
      centerCol,
      centerRow,
      centerX: centerCol * CS + CS / 2,
      centerY: centerRow * CS + CS / 2,
      consumed: false
    };
  }

  // F (Fountain) room — large square pool with two waterfall columns and a
  // 1×1 walkable center pad. Throw a weapon into the pool (aim the reticule
  // inside the pool footprint) to offer it for a tier upgrade (FountainSystem).
  // The background-object pass is skipped inside the pool footprint so the
  // water silhouette stays clean.
  generateFountainRoom(room) {
    const CS = GRID.CELL_SIZE;
    const fs = this.currentLetterTemplate?.fountainStructure;
    const centerCol      = fs?.centerCol      ?? 15;
    const centerRow      = fs?.centerRow      ?? 15;
    const poolRadius     = fs?.poolRadius     ?? 4;     // 9×9 pool (radius 4)
    const padRadius      = fs?.padRadius      ?? 0;     // 1×1 walkable center
    const waterfallCols  = fs?.waterfallCols  ?? [-3, 3];
    const waterfallRows  = fs?.waterfallRows  ?? [-poolRadius, poolRadius];

    // Standard background pass first so trees/grass populate the edges; the
    // template's clearingZone keeps the pool footprint clear.
    this.generateBackgroundObjects(room);

    // Place pool water tiles in a square. Tiles use '~' (water) with a
    // shimmer animation flag so the renderer can cycle glyphs per-tile.
    for (let dr = -poolRadius; dr <= poolRadius; dr++) {
      for (let dc = -poolRadius; dc <= poolRadius; dc++) {
        // Carve out the center walkable pad
        if (Math.abs(dr) <= padRadius && Math.abs(dc) <= padRadius) continue;
        const r = centerRow + dr;
        const c = centerCol + dc;
        if (r < 1 || r >= GRID.ROWS - 1 || c < 1 || c >= GRID.COLS - 1) continue;
        room.collisionMap[r][c] = true;
        const water = new BackgroundObject('~', c * CS, r * CS);
        water.color = '#66bbff';
        water.animationColor = '#aaddff';
        water.fountainWater = true; // marker for shimmer animation + corruption detection
        room.backgroundObjects.push(water);
      }
    }

    // Waterfall columns — vertical animated tiles flanking the pool. These
    // sit at the pool's top and bottom edges in the configured columns, and
    // render with a downward-cycling glyph (handled by RenderController).
    for (const dc of waterfallCols) {
      for (const dr of waterfallRows) {
        const r = centerRow + dr;
        const c = centerCol + dc;
        if (r < 1 || r >= GRID.ROWS - 1 || c < 1 || c >= GRID.COLS - 1) continue;
        // Replace the water tile at this slot with a waterfall tile
        for (let i = room.backgroundObjects.length - 1; i >= 0; i--) {
          const o = room.backgroundObjects[i];
          if (Math.floor(o.position.x / CS) === c && Math.floor(o.position.y / CS) === r) {
            room.backgroundObjects.splice(i, 1);
          }
        }
        const fall = new BackgroundObject('│', c * CS, r * CS);
        fall.color = '#aaddff';
        fall.animationColor = '#eeffff';
        fall.fountainWaterfall = true;
        room.collisionMap[r][c] = true;
        room.backgroundObjects.push(fall);
      }
    }

    // Strip any standard objects that landed inside the pool footprint —
    // matches the well-room cleanup pattern.
    for (let i = room.backgroundObjects.length - 1; i >= 0; i--) {
      const o = room.backgroundObjects[i];
      if (o.fountainWater || o.fountainWaterfall) continue;
      const oc = Math.floor(o.position.x / CS);
      const orow = Math.floor(o.position.y / CS);
      if (Math.abs(orow - centerRow) <= poolRadius && Math.abs(oc - centerCol) <= poolRadius) {
        room.backgroundObjects.splice(i, 1);
      }
    }

    // No enemies — fountain room is a sanctuary. The threat is the player's
    // own choice (corrupting it with elemental damage).

    // Per-room fountain state — FountainSystem reads this for proximity,
    // ritual locks, and corruption tracking.
    room.fountain = {
      centerCol,
      centerRow,
      centerX: centerCol * CS + CS / 2,
      centerY: centerRow * CS + CS / 2,
      poolRadius,
      padRadius,
      corrupted: false
    };
  }

  generateDungeonRoom(room) {
    const design = getDungeonDesign(room.zone);
    const { grid, wallColor, doorColor } = design;

    let doorCol = 15, doorRow = 10;
    let minWallCol = 29, maxWallCol = 0, minWallRow = 29, maxWallRow = 0;
    let foundWall = false;

    for (let r = 0; r < grid.length; r++) {
      const row = grid[r];
      for (let c = 0; c < row.length; c++) {
        const ch = row[c];
        if (ch === '#' || ch === '.') continue;

        const px = c * GRID.CELL_SIZE;
        const py = r * GRID.CELL_SIZE;

        if (ch === '≡') {
          room.collisionMap[r][c] = true;
          const wall = new BackgroundObject('≡', px, py);
          wall.color = wallColor;
          wall.animationColor = wallColor;
          room.backgroundObjects.push(wall);
          if (!foundWall || c < minWallCol) minWallCol = c;
          if (!foundWall || c > maxWallCol) maxWallCol = c;
          if (!foundWall || r < minWallRow) minWallRow = r;
          if (!foundWall || r > maxWallRow) maxWallRow = r;
          foundWall = true;
        } else if (ch === '∩') {
          doorCol = c;
          doorRow = r;
          const door = new BackgroundObject('∩', px, py);
          door.color = doorColor;
          door.animationColor = doorColor;
          room.backgroundObjects.push(door);
        } else {
          const deco = new BackgroundObject(ch, px, py);
          room.backgroundObjects.push(deco);
        }
      }
    }

    room.dungeon = {
      exteriorBounds: { minCol: minWallCol, maxCol: maxWallCol, minRow: minWallRow, maxRow: maxWallRow },
      doorPosition: { col: doorCol, row: doorRow },
      hutKind: 'enemy_encounter',
      interiorGenerated: false,
    };

    // No random background objects — design covers the full room
    // No enemies — same as maze room
    room.exitsLocked = false;
  }

  generateMazeRoom(room) {
    // 19×19 hollow exterior shell matching the interior's footprint.
    // The MazeSystem generates the real 19×19 interior on entry.
    const centerCol = 15;
    const centerRow = 14; // shift up slightly so south door has clearance
    const halfW = 9, halfH = 9; // 19×19

    const minCol = centerCol - halfW; // 6
    const maxCol = centerCol + halfW; // 24
    const minRow = centerRow - halfH; // 5
    const maxRow = centerRow + halfH; // 23

    const WALL_COLOR = '#3a2255';
    const DECO_COLOR = '#1a0f2e';

    // ── Exterior perimeter walls ────────────────────────────────────────────
    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        const isWall = row === minRow || row === maxRow || col === minCol || col === maxCol;
        if (!isWall) continue;
        room.collisionMap[row][col] = true;
        const wallObj = new BackgroundObject('≡', col * GRID.CELL_SIZE, row * GRID.CELL_SIZE);
        wallObj.color = WALL_COLOR;
        room.backgroundObjects.push(wallObj);
      }
    }

    // ── Decorative mini-maze inside the exterior (non-solid, visual only) ──
    // Interior is 17×17 cells (minCol+1..maxCol-1, minRow+1..maxRow-1).
    // Run a DFS on an 8×8 logical grid → 17×17 physical cells.
    const DL = 8; // logical size
    const DP = DL * 2 + 1; // 17 physical cells
    const decoVisited = Array.from({ length: DL }, () => new Array(DL).fill(false));
    const decoWall    = Array.from({ length: DP }, () => new Array(DP).fill(true));
    const pR = lr => lr * 2 + 1, pC = lc => lc * 2 + 1;
    const carve = (lr, lc) => {
      decoVisited[lr][lc] = true;
      decoWall[pR(lr)][pC(lc)] = false;
      const dirs = [[-1,0],[1,0],[0,-1],[0,1]].sort(() => Math.random() - 0.5);
      for (const [dr, dc] of dirs) {
        const nr = lr + dr, nc = lc + dc;
        if (nr < 0 || nr >= DL || nc < 0 || nc >= DL || decoVisited[nr][nc]) continue;
        decoWall[pR(lr) + dr][pC(lc) + dc] = false;
        carve(nr, nc);
      }
    };
    carve(0, 0);

    const iCol0 = minCol + 1, iRow0 = minRow + 1;
    for (let dr = 0; dr < DP; dr++) {
      for (let dc = 0; dc < DP; dc++) {
        if (!decoWall[dr][dc]) continue;
        const col = iCol0 + dc, row = iRow0 + dr;
        if (col > maxCol - 1 || row > maxRow - 1) continue; // stay inside perimeter
        const decoObj = new BackgroundObject('≡', col * GRID.CELL_SIZE, row * GRID.CELL_SIZE);
        decoObj.color = DECO_COLOR;
        room.backgroundObjects.push(decoObj);
      }
    }

    // ── South door glyph ────────────────────────────────────────────────────
    const doorObj = new BackgroundObject('∩', centerCol * GRID.CELL_SIZE, maxRow * GRID.CELL_SIZE);
    doorObj.color = WALL_COLOR;
    room.backgroundObjects.push(doorObj);

    // ── Maze metadata (MazeSystem reads this) ───────────────────────────────
    room.maze = {
      exteriorBounds: { minCol, maxCol, minRow, maxRow },
      doorPosition: { col: centerCol, row: maxRow },
      interiorGenerated: false,
      sealed: false,
    };

    // ── Sparse exterior bg objects (no room inside the large shell) ─────────
    const prev = this.currentLetterTemplate?.bgObjectRules?.clearingZone;
    if (this.currentLetterTemplate?.bgObjectRules) {
      this.currentLetterTemplate.bgObjectRules.clearingZone = {
        centerCol, centerRow, width: 23, height: 23,
        allowGrass: false, allowObjects: false,
      };
    }
    this.generateBackgroundObjects(room);
    if (this.currentLetterTemplate?.bgObjectRules) {
      this.currentLetterTemplate.bgObjectRules.clearingZone = prev;
    }

    // No exterior enemy spawns — the maze itself is the encounter.
    const C = GRID.CELL_SIZE;
    room.spawnZones = {
      north:   { x: centerCol * C, y: (maxRow + 3) * C },
      south:   { x: centerCol * C, y: (minRow - 2) * C },
      east:    { x: (minCol - 3) * C, y: centerRow  * C },
      west:    { x: (maxCol + 3) * C, y: centerRow  * C },
      default: { x: centerCol * C, y: (maxRow + 3) * C },
    };

    room.exitsLocked = false;
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
