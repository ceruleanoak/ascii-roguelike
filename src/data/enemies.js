import { COLORS, GRID } from '../game/GameConfig.js';

// Enemy definitions
// Note: 1 unit = GRID.CELL_SIZE = 16 pixels
export const ENEMIES = {
  'r': {
    char: 'r',
    name: 'Rat',
    hp: 1,
    speed: 50,
    damage: 1,
    attackRange: GRID.CELL_SIZE * 2,  // 2 units
    aggroRange: GRID.CELL_SIZE * 8,   // 8 units detection
    attackCooldown: 1.0,
    attackWindup: 1.0,  // Minimum 1 second telegraph
    attackType: 'melee',
    decisionInterval: 0.4,  // Moderately smart (reassess every 0.4s)
    color: '#888888',
    dropTable: 'beast',
    rarityProfile: 'weak'
  },
  'o': {
    char: 'o',
    name: 'Slime',
    hp: 2,
    speed: 20,
    acceleration: 200,
    damage: 1,
    attackRange: GRID.CELL_SIZE * 2,  // 2 units
    aggroRange: GRID.CELL_SIZE * 6,   // 6 units (slower, shorter range)
    attackCooldown: 1.2,
    attackWindup: 1.0,  // Clear 1-second telegraph
    windupImmune: true,  // Cannot be interrupted
    attackType: 'melee',
    decisionInterval: 0.8,  // Dumb enemy (slow reaction time)
    color: '#00ff00',
    dropTable: 'slime',
    rarityProfile: 'weak'
  },
  'M': {
    char: 'M',
    name: 'Boss Slime',
    hp: 4,
    speed: 40,
    acceleration: 50,
    damage: 2,
    attackRange: GRID.CELL_SIZE * 2.5,
    aggroRange: GRID.CELL_SIZE * 8,
    attackCooldown: 1.2,
    attackWindup: 1.0,
    windupImmune: true,
    attackType: 'melee',
    decisionInterval: 0.7,
    color: '#00cc00',
    spawning: {
      enabled: true,
      spawnChar: 'o',
      spawnCooldown: 5.0,
      maxSpawns: 3,
      maxLifetimeSpawns: 9,
      spawnRange: GRID.CELL_SIZE * 1.5,
      spawnWindup: 0.5,
      spawnCount: 1,
      spawnOnDeath: false
    },
    dropTable: 'slime',
    rarityProfile: 'elite'
  },
  '^': {
    char: '^',
    name: 'Bat',
    hp: 1,
    speed: 70,
    damage: 1,  // Not used for sap attacks
    attackRange: GRID.CELL_SIZE * 1.5,  // 1.5 units (faster, closer)
    aggroRange: GRID.CELL_SIZE * 10,    // 10 units (very aware)
    attackCooldown: 0.8,
    attackWindup: 0.8,  // Quick telegraph before latching
    attackType: 'sap',  // Sapping attack - locks to player
    sapDamage: 1,  // Fixed 1 damage per tick (not scaled by depth)
    sapDamageInterval: 1.0,  // Deal damage every 1 second while sapping
    decisionInterval: 0.4,  // Very smart (fast reactions)
    color: '#444444',
    dropTable: 'beast',
    rarityProfile: 'weak'
  },
  'G': {
    char: 'G',
    name: 'Goblin',
    hp: 3,
    speed: 40,
    damage: 2,
    attackRange: GRID.CELL_SIZE * 5,  // 5 units (ranged)
    aggroRange: GRID.CELL_SIZE * 10,  // 10 units (ranged awareness)
    attackCooldown: 1.5,
    attackWindup: 1.0,  // Minimum 1 second telegraph
    attackType: 'ranged',
    decisionInterval: 0.45,  // Moderately smart
    color: '#00aa00',
    itemUsage: {
      enabled: true,
      canPickup: true,
      pickupRange: GRID.CELL_SIZE * 2,
      preferredItems: [')', 'H'],  // Bows, health
      useRange: GRID.CELL_SIZE * 7,
      useCooldown: 2.0,
      maxItems: 1,
      dropOnDeath: true,
      useConsumablesAt: 0.5
    },
    dropTable: 'humanoid',
    rarityProfile: 'normal'
  },
  'S': {
    char: 'S',
    name: 'Skeleton',
    hp: 4,
    speed: 35,
    damage: 2,
    attackRange: GRID.CELL_SIZE * 2,  // 2 units
    aggroRange: GRID.CELL_SIZE * 8,   // 8 units
    attackCooldown: 1.1,
    attackWindup: 1.0,  // Minimum 1 second telegraph
    attackType: 'melee',
    decisionInterval: 0.5,  // Average intelligence
    color: '#eeeeee',
    dropTable: 'undead',
    rarityProfile: 'weak'
  },
  'O': {
    char: 'O',
    name: 'Ogre',
    hp: 8,
    speed: 25,
    damage: 3,
    attackRange: GRID.CELL_SIZE * 2.5,  // 2.5 units (heavy reach)
    aggroRange: GRID.CELL_SIZE * 7,     // 7 units (slower reaction)
    attackCooldown: 1.5,
    attackWindup: 1.2,  // Slow heavy attack - longer telegraph
    attackType: 'melee',
    decisionInterval: 0.7,  // Dumb brute (slow to react)
    color: '#aa5500',
    itemUsage: {
      enabled: true,
      canPickup: true,
      pickupRange: GRID.CELL_SIZE * 2,
      preferredItems: ['/', '|', 'H'],  // Heavy weapons, health
      useRange: GRID.CELL_SIZE * 3,
      useCooldown: 2.0,
      maxItems: 1,
      dropOnDeath: true,
      useConsumablesAt: 0.3
    },
    dropTable: 'humanoid',
    rarityProfile: 'normal'
  },
  'D': {
    char: 'D',
    name: 'Dragon',
    hp: 20,
    speed: 30,
    damage: 5,
    attackRange: GRID.CELL_SIZE * 7,  // 7 units (long range fire)
    aggroRange: GRID.CELL_SIZE * 12,  // 12 units (boss awareness)
    attackCooldown: 2.0,
    attackWindup: 1.5,  // Long breath windup - boss telegraph
    attackType: 'fire',
    decisionInterval: 0.3,  // Ancient intelligence (boss-level smarts)
    color: '#ff0000',
    dropTable: 'dragon',
    rarityProfile: 'boss'
  },
  'W': {
    char: 'W',
    name: 'Wizard',
    hp: 5,
    speed: 30,
    damage: 3,
    attackRange: GRID.CELL_SIZE * 8,  // 8 units (longest range)
    aggroRange: GRID.CELL_SIZE * 12,  // 12 units (magical senses)
    attackCooldown: 2.5,
    attackWindup: 1.0,  // Minimum 1 second telegraph
    attackType: 'magic',
    decisionInterval: 0.3,  // Highly intelligent (magical awareness)
    color: '#8800ff',
    dropTable: 'humanoid',
    rarityProfile: 'elite'
  },
  'K': {
    char: 'K',
    name: 'Knight',
    hp: 10,
    speed: 33,
    damage: 4,
    attackRange: GRID.CELL_SIZE * 2,  // 2 units
    aggroRange: GRID.CELL_SIZE * 9,   // 9 units (vigilant)
    attackCooldown: 1.3,
    attackWindup: 1.0,  // Minimum 1 second telegraph
    attackType: 'melee',
    decisionInterval: 0.35,  // Trained warrior (tactical)
    color: '#aaaaaa',
    itemUsage: {
      enabled: true,
      canPickup: true,
      pickupRange: GRID.CELL_SIZE * 2,
      preferredItems: ['-', '/', '|', 'H', 'A'],  // Swords, health, armor
      useRange: GRID.CELL_SIZE * 3,
      useCooldown: 1.5,
      maxItems: 2,
      dropOnDeath: true,
      useConsumablesAt: 0.4
    },
    dropTable: 'humanoid',
    rarityProfile: 'elite'
  },
  'T': {
    char: 'T',
    name: 'Troll',
    hp: 12,
    speed: 23,
    damage: 4,
    attackRange: GRID.CELL_SIZE * 2.5,  // 2.5 units (heavy reach)
    aggroRange: GRID.CELL_SIZE * 7,     // 7 units (slow to notice)
    attackCooldown: 1.8,
    attackWindup: 1.2,  // Heavy swing - longer telegraph
    attackType: 'melee',
    decisionInterval: 0.75,  // Dumb brute (very slow reactions)
    color: '#00aa00',
    dropTable: 'beast',
    rarityProfile: 'normal'
  },
  'F': {
    char: 'F',
    name: 'Fire Elemental',
    hp: 6,
    speed: 35,
    damage: 3,
    attackRange: GRID.CELL_SIZE * 5,  // 5 units (ranged fire)
    aggroRange: GRID.CELL_SIZE * 9,   // 9 units
    attackCooldown: 1.5,
    attackWindup: 1.0,  // Minimum 1 second telegraph
    attackType: 'fire',
    decisionInterval: 0.4,
    color: '#ff4400',
    elementalAffinity: {
      immunity: ['burn'],
      resistance: { 'stun': 0.5, 'acid': 0.7 },
      weakness: { 'freeze': 2.0, 'wet': 1.5 }
    },
    dropTable: 'elemental_fire',
    rarityProfile: 'normal'
  },
  'I': {
    char: 'I',
    name: 'Ice Golem',
    hp: 10,
    speed: 20,
    damage: 3,
    attackRange: GRID.CELL_SIZE * 2,  // 2 units (melee)
    aggroRange: GRID.CELL_SIZE * 8,   // 8 units
    attackCooldown: 1.8,
    attackWindup: 1.0,  // Minimum 1 second telegraph
    attackType: 'melee',
    decisionInterval: 0.6,
    color: '#aaddff',
    elementalAffinity: {
      immunity: ['freeze'],
      resistance: { 'stun': 0.6, 'poison': 0.8 },
      weakness: { 'burn': 2.0 }
    },
    dropTable: 'elemental_ice',
    rarityProfile: 'normal'
  },
  'P': {
    char: 'P',
    name: 'Poison Spider',
    hp: 4,
    speed: 45,
    damage: 2,
    attackRange: GRID.CELL_SIZE * 2,  // 2 units (melee with poison)
    aggroRange: GRID.CELL_SIZE * 9,   // 9 units
    attackCooldown: 1.2,
    attackWindup: 1.0,  // Minimum 1 second telegraph
    attackType: 'melee',
    decisionInterval: 0.35,
    color: '#44bb44',
    elementalAffinity: {
      immunity: ['poison'],
      resistance: { 'acid': 0.5 },
      weakness: { 'burn': 1.5, 'freeze': 1.3 }
    },
    dropTable: 'poison',
    rarityProfile: 'weak'
  },
  'N': {
    char: 'N',
    name: 'Necromancer',
    hp: 6,
    speed: 25,
    damage: 2,
    attackRange: GRID.CELL_SIZE * 6,  // 6 units (magic)
    aggroRange: GRID.CELL_SIZE * 10,  // 10 units
    attackCooldown: 2.0,
    attackWindup: 1.0,  // Minimum 1 second telegraph
    attackType: 'magic',
    decisionInterval: 0.4,
    color: '#9944ff',
    spawning: {
      enabled: true,
      spawnChar: 'S',
      spawnCooldown: 8.0,
      maxSpawns: 3,
      maxLifetimeSpawns: 6,
      spawnRange: GRID.CELL_SIZE * 4,
      spawnWindup: 1.5,
      spawnCount: 1,
      spawnOnDeath: false
    },
    dropTable: 'undead',
    rarityProfile: 'elite'  // Same table as Skeleton, better rare drop chance
  },
  'Q': {
    char: 'Q',
    name: 'Queen Spider',
    hp: 8,
    speed: 30,
    damage: 3,
    attackRange: GRID.CELL_SIZE * 3,  // 3 units
    aggroRange: GRID.CELL_SIZE * 10,  // 10 units
    attackCooldown: 1.5,
    attackWindup: 1.0,  // Minimum 1 second telegraph
    attackType: 'melee',
    decisionInterval: 0.45,
    color: '#6633aa',
    spawning: {
      enabled: true,
      spawnChar: 'P',
      spawnCooldown: 10.0,
      maxSpawns: 4,
      maxLifetimeSpawns: 8,
      spawnRange: GRID.CELL_SIZE * 5,
      spawnWindup: 1.2,
      spawnCount: 2,
      spawnOnDeath: true,
      spawnOnDeathCount: 3
    },
    dropTable: 'poison',
    rarityProfile: 'elite'
  },
  'A': {
    char: 'A',
    name: 'Archer Goblin',
    hp: 5,
    speed: 35,
    damage: 2,
    attackRange: GRID.CELL_SIZE * 6,  // 6 units (ranged)
    aggroRange: GRID.CELL_SIZE * 10,  // 10 units
    attackCooldown: 1.8,
    attackWindup: 1.0,  // Minimum 1 second telegraph
    attackType: 'ranged',
    decisionInterval: 0.45,
    color: '#00aa00',
    itemUsage: {
      enabled: true,
      canPickup: true,
      pickupRange: GRID.CELL_SIZE * 3,
      preferredItems: [')', '>', 'H'],  // Bows, health potions
      useRange: GRID.CELL_SIZE * 8,
      useCooldown: 2.0,
      maxItems: 2,
      dropOnDeath: true,
      useConsumablesAt: 0.4
    },
    dropTable: 'humanoid',
    rarityProfile: 'normal'
  },
  'L': {
    char: 'L',
    name: 'Looter',
    hp: 4,
    speed: 50,
    damage: 2,
    attackRange: GRID.CELL_SIZE * 2,  // 2 units (melee)
    aggroRange: GRID.CELL_SIZE * 8,   // 8 units
    attackCooldown: 1.2,
    attackWindup: 1.0,  // Minimum 1 second telegraph
    attackType: 'melee',
    decisionInterval: 0.3,
    color: '#ccaa00',
    itemUsage: {
      enabled: true,
      canPickup: true,
      pickupRange: GRID.CELL_SIZE * 4,
      preferredItems: ['-', '/', '|', 'H', 'c'],  // Weapons, health, coins
      useRange: GRID.CELL_SIZE * 3,
      useCooldown: 1.5,
      maxItems: 3,
      dropOnDeath: true,
      useConsumablesAt: 0.3
    },
    dropTable: 'humanoid',
    rarityProfile: 'normal'
  },

  // === RED ZONE ENEMIES ===

  'f': {
    char: 'f',
    name: 'Fire Bat',
    hp: 3,
    speed: 55,
    damage: 1,
    attackRange: GRID.CELL_SIZE * 4,  // 4 units (ranged fire spit)
    aggroRange: GRID.CELL_SIZE * 8,   // 8 units
    attackCooldown: 2,
    attackWindup: 1,  // Quick windup
    attackType: 'fire',
    decisionInterval: 0.3,  // Erratic, fast reactions
    color: '#ff6622',
    elementalAffinity: {
      immunity: ['burn'],
      weakness: { 'freeze': 1.8, 'wet': 1.5 }
    },
    dropTable: 'beast',
    rarityProfile: 'weak'
  },

  '0': {
    char: '0',
    name: 'Living Rock',
    hp: 8,
    speed: 15,
    damage: 4,
    attackRange: GRID.CELL_SIZE * 2,  // 2 units (melee)
    aggroRange: GRID.CELL_SIZE * 6,   // 6 units (limited vision)
    attackCooldown: 2.5,
    attackWindup: 1.2,  // Slow, heavy attacks
    attackType: 'melee',
    decisionInterval: 0.8,  // Slow thinker
    color: '#996633',
    elementalAffinity: {
      resistance: { 'physical': 0.5, 'poison': 0.8, 'burn': 0.7 },
      weakness: { 'magic': 1.5 }
    },
    dropTable: 'gemstone',
    rarityProfile: 'normal'
  },

  'E': {
    char: 'E',
    name: 'Ember Sprite',
    hp: 2,
    speed: 40,
    damage: 2,
    attackRange: GRID.CELL_SIZE * 2,  // 2 units (melee)
    aggroRange: GRID.CELL_SIZE * 7,   // 7 units
    attackCooldown: 3,
    attackWindup: 1,
    attackType: 'fire',
    decisionInterval: 0.3,  // Fast reactions
    color: '#ffaa44',
    elementalAffinity: {
      immunity: ['burn'],
      weakness: { 'freeze': 2.0, 'wet': 1.8 }
    },
    dropTable: 'elemental_fire',
    rarityProfile: 'weak'
  },

  // === CYAN ZONE ENEMIES ===

  'w': {
    char: 'w',
    name: 'Frost Wolf',
    hp: 3,
    speed: 60,
    damage: 2,
    attackRange: GRID.CELL_SIZE * 2,  // 2 units (melee)
    aggroRange: GRID.CELL_SIZE * 9,   // 9 units (keen senses)
    attackCooldown: 1.2,
    attackWindup: 1,
    attackType: 'melee',
    decisionInterval: 0.3,  // Pack hunter intelligence
    color: '#aaddff',
    packBehavior: {
      enabled: true,
      packRadius: 99999,    // No distance limit - all wolves in room are packmates
      kiteDistance: GRID.CELL_SIZE * 4,   // Maintain 4 units from player
      hoverTime: 2.5,                     // Hover for 2.5s before attacking
      retreatThreshold: GRID.CELL_SIZE * 3 // Retreat if player within 3 units during hover
    },
    elementalAffinity: {
      immunity: ['freeze'],
      weakness: { 'burn': 1.8 }
    },
    dropTable: 'beast',
    rarityProfile: 'weak'
  },

  'y': {
    char: 'y',
    name: 'Yeti',
    hp: 10,
    speed: 18,
    damage: 4,
    attackRange: GRID.CELL_SIZE * 2.5,  // 2.5 units (heavy reach)
    aggroRange: GRID.CELL_SIZE * 7,     // 7 units
    attackCooldown: 2.2,
    attackWindup: 1.2,  // Slow heavy attacks
    attackType: 'melee',
    decisionInterval: 0.7,  // Slow thinker
    color: '#eeffff',
    elementalAffinity: {
      immunity: ['freeze'],
      resistance: { 'physical': 0.6, 'stun': 0.7 },
      weakness: { 'burn': 2.0 }
    },
    dropTable: 'beast',
    rarityProfile: 'normal'
  },

  'X': {
    char: 'X',
    name: 'Ice Wraith',
    hp: 2,
    speed: 45,
    damage: 1,
    attackRange: GRID.CELL_SIZE * 1.5,  // 1.5 units
    aggroRange: GRID.CELL_SIZE * 8,     // 8 units
    attackCooldown: 1,
    attackWindup: 0.8,
    attackType: 'sap',  // Freezing touch - locks to player
    sapDamage: 1,
    sapDamageInterval: 1.2,  // Slower than bat
    decisionInterval: 0.4,
    color: '#88ddff',
    elementalAffinity: {
      immunity: ['freeze'],
      weakness: { 'burn': 2.0, 'magic': 1.5 }
    },
    dropTable: 'elemental_ice',
    rarityProfile: 'weak'
  },

  'C': {
    char: 'C',
    name: 'Cryomancer',
    hp: 5,
    speed: 28,
    damage: 3,
    attackRange: GRID.CELL_SIZE * 6,  // 6 units (ranged ice magic)
    aggroRange: GRID.CELL_SIZE * 10,  // 10 units
    attackCooldown: 2,
    attackWindup: 1,
    attackType: 'magic',
    decisionInterval: 0.35,  // Intelligent caster
    color: '#66ccff',
    elementalAffinity: {
      immunity: ['freeze'],
      weakness: { 'burn': 1.8 }
    },
    spawning: {
      enabled: true,
      spawnChar: 'X',  // Spawns Ice Wraiths
      spawnCooldown: 9.0,
      maxSpawns: 2,
      maxLifetimeSpawns: 4,
      spawnRange: GRID.CELL_SIZE * 4,
      spawnWindup: 1.3,
      spawnCount: 1,
      spawnOnDeath: false
    },
    dropTable: 'elemental_ice',
    rarityProfile: 'elite'
  },

  'U': {
    char: 'U',
    name: 'Frozen Construct',
    hp: 7,
    speed: 22,
    damage: 3,
    attackRange: GRID.CELL_SIZE * 2,  // 2 units (melee)
    aggroRange: GRID.CELL_SIZE * 8,   // 8 units
    attackCooldown: 1.6,
    attackWindup: 1,
    attackType: 'melee',
    decisionInterval: 0.6,
    color: '#99ddff',
    elementalAffinity: {
      immunity: ['freeze', 'poison'],
      resistance: { 'physical': 0.5, 'stun': 0.8 },
      weakness: { 'burn': 2.0, 'magic': 1.3 }
    },
    dropTable: 'elemental_ice',
    rarityProfile: 'normal'
  },

  // === YELLOW ZONE ENEMIES ===

  'e': {
    char: 'e',
    name: 'Spark',
    hp: 2,
    speed: 55,
    damage: 1,
    attackRange: GRID.CELL_SIZE * 3,  // 3 units (ranged zap)
    aggroRange: GRID.CELL_SIZE * 8,   // 8 units
    attackCooldown: 1.5,
    attackWindup: 1,
    attackType: 'magic',  // Lightning bolts
    decisionInterval: 0.25,  // Erratic, fast
    color: '#ffff88',
    elementalAffinity: {
      immunity: ['stun'],
      weakness: { 'wet': 2.0 }
    },
    dropTable: 'elemental_lightning',
    rarityProfile: 'weak'
  },

  'h': {
    char: 'h',
    name: 'Thunder Hawk',
    hp: 4,
    speed: 50,
    damage: 2,
    attackRange: GRID.CELL_SIZE * 5,  // 5 units (diving strike)
    aggroRange: GRID.CELL_SIZE * 12,  // 12 units (aerial view)
    attackCooldown: 1.8,
    attackWindup: 1,
    attackType: 'ranged',  // Lightning dive
    decisionInterval: 0.3,
    color: '#ffee44',
    elementalAffinity: {
      immunity: ['stun'],
      weakness: { 'wet': 1.8 }
    },
    dropTable: 'beast',
    rarityProfile: 'normal'
  },

  'j': {
    char: 'j',
    name: 'Volt Spider',
    hp: 3,
    speed: 48,
    damage: 2,
    attackRange: GRID.CELL_SIZE * 2,  // 2 units (melee)
    aggroRange: GRID.CELL_SIZE * 9,   // 9 units
    attackCooldown: 1.3,
    attackWindup: 1,
    attackType: 'melee',  // Chain lightning on hit
    decisionInterval: 0.3,  // Pack hunter intelligence (same as wolves)
    color: '#dddd00',
    packBehavior: {
      enabled: true,
      packRadius: 99999,    // No distance limit - all spiders in room are packmates
      kiteDistance: GRID.CELL_SIZE * 3.5, // Maintain 3.5 units from player
      hoverTime: 2.0,                     // Hover for 2s before attacking
      retreatThreshold: GRID.CELL_SIZE * 2.5 // Retreat if player within 2.5 units during hover
    },
    elementalAffinity: {
      immunity: ['stun'],
      weakness: { 'wet': 1.8, 'burn': 1.3 }
    },
    dropTable: 'beast',
    rarityProfile: 'weak'
  },

  'V': {
    char: 'V',
    name: 'Voltaic Golem',
    hp: 9,
    speed: 20,
    damage: 3,
    attackRange: GRID.CELL_SIZE * 4,  // 4 units (AOE discharge)
    aggroRange: GRID.CELL_SIZE * 8,   // 8 units
    attackCooldown: 2.5,
    attackWindup: 1.5,  // Long telegraph for AOE
    attackType: 'magic',  // Lightning AOE
    decisionInterval: 0.65,
    color: '#ffaa00',
    elementalAffinity: {
      immunity: ['stun'],
      resistance: { 'physical': 0.5, 'magic': 0.7 },
      weakness: { 'wet': 2.5 }
    },
    dropTable: 'elemental_lightning',
    rarityProfile: 'normal'
  },

  'z': {
    char: 'z',
    name: 'Storm Caller',
    hp: 6,
    speed: 30,
    damage: 3,
    attackRange: GRID.CELL_SIZE * 7,  // 7 units (long range)
    aggroRange: GRID.CELL_SIZE * 11,  // 11 units
    attackCooldown: 2.2,
    attackWindup: 1,
    attackType: 'magic',  // Lightning strikes
    decisionInterval: 0.3,  // Intelligent caster
    color: '#ffcc00',
    elementalAffinity: {
      immunity: ['stun'],
      weakness: { 'wet': 1.8 }
    },
    spawning: {
      enabled: true,
      spawnChar: 'e',  // Spawns Sparks
      spawnCooldown: 10.0,
      maxSpawns: 3,
      maxLifetimeSpawns: 6,
      spawnRange: GRID.CELL_SIZE * 5,
      spawnWindup: 1.4,
      spawnCount: 1,
      spawnOnDeath: true,
      spawnOnDeathCount: 2
    },
    dropTable: 'elemental_lightning',
    rarityProfile: 'elite'
  },

  // === OCEAN ENEMIES ===

  's': {
    char: 's',
    name: 'Sea Snake',
    hp: 3,
    speed: 38,
    damage: 2,
    attackRange: GRID.CELL_SIZE * 2,   // 2 units (bite range)
    aggroRange: GRID.CELL_SIZE * 8,    // 8 units
    attackCooldown: 1.2,
    attackWindup: 1.0,
    attackType: 'melee',
    decisionInterval: 0.4,
    color: '#00bbcc',
    waterAffinity: true,               // Prefers water; never avoids it while wandering
    elementalAffinity: {
      immunity: ['wet'],
      resistance: { 'freeze': 0.6 },
      weakness: { 'burn': 1.5 }
    },
    dropTable: 'beast',
    rarityProfile: 'weak'
  }
};

// Enemy spawn tables by depth (legacy - used for fallback)
export const SPAWN_TABLES = {
  0: ['r', 'o'],                              // Depth 0-1: Easy enemies
  2: ['r', 'o', '^', 'G'],                    // Depth 2-4: Add bats and goblins (G has item pickup)
  5: ['o', '^', 'G', 'S', 'P', 'L'],          // Depth 5-7: Add poison spider, looter
  8: ['G', 'S', 'O', 'W', 'F', 'N', 'A'],     // Depth 8-10: Add fire elemental, necromancer, archer
  11: ['S', 'O', 'W', 'K', 'I', 'N', 'A'],    // Depth 11-14: Add ice golem, knight (K has item pickup)
  15: ['O', 'W', 'K', 'T', 'D', 'F', 'I', 'N', 'Q', 'A', 'L']  // Depth 15+: All enemies
};

// Zone-specific spawn tables (independent difficulty progression per zone)
export const ZONE_SPAWN_TABLES = {
  'green': {
    // Forest/verdant theme - NO fire/ice/lightning enemies
    0: ['r', 'o'],                              // L1-2: Rats, Slimes
    3: ['r', 'o', '^', 'G'],                    // L3-5: Add Bats, Goblins
    6: ['o', '^', 'G', 'S', 'P', 'M'],          // L6-8: Add Skeletons, Poison Spiders, Boss Slimes
    9: ['G', 'S', 'O', 'A', 'W', 'P', 'M'],     // L9-11: Add Ogres, Archers, Wizards
    12: ['S', 'O', 'A', 'W', 'K', 'T', 'L', 'M'] // L12+: Add Knights, Treants, Looters
  },

  'red': {
    // Fire/scorched theme - NO green/ice enemies
    0: ['E'],                               // L1-2: Ember Sprites (easy starter)
    3: ['E', 'f'],                          // L3-5: Add Fire Bats
    6: ['f', 'R', 'F'],                     // L6-8: Add Living Rocks, Fire Elementals
    9: ['f', 'R', 'F', 'S'],                // L9-11: Add Skeletons (charred bones)
    12: ['R', 'F', 'T', 'O']                // L12+: Add Treants (burning), Ogres
  },

  'cyan': {
    // Ice/frozen theme - NO fire enemies
    0: ['w'],                           // L1-2: Frost Wolves (fast starter)
    3: ['w', 'X'],                      // L3-5: Add Ice Wraiths (sapper)
    6: ['X', 'w', 'U'],                 // L6-8: Add Frozen Constructs
    9: ['w', 'U', 'C', 'I'],            // L9-11: Add Cryomancers (spawner), Ice Golems
    12: ['U', 'C', 'I', 'y']            // L12+: Add Yetis (heavy tank)
  },

  'yellow': {
    // Lightning/storm theme - NO water/wet enemies
    0: ['e'],                           // L1-2: Sparks (fast starter)
    3: ['e', 'j'],                      // L3-5: Add Volt Spiders
    6: ['j', 'e', 'h'],                 // L6-8: Add Thunder Hawks (ranged)
    9: ['j', 'h', 'V'],                 // L9-11: Add Voltaic Golems (AOE tank)
    12: ['h', 'V', 'z']                 // L12+: Add Storm Callers (spawner elite)
  },

  'gray': {
    // Undead theme - Undead enemies only
    0: ['S'],                               // L1-2: Skeletons
    3: ['S', 'N'],                          // L3-5: Add Necromancers
    6: ['S', 'N', 'Q'],                     // L6-8: Add Queen Spiders (undead variant)
    9: ['N', 'Q'],                          // L9-11: Elite undead only
    12: ['N', 'Q']                          // L12+: Boss-tier undead
  }
};

export function getEnemyData(char) {
  return ENEMIES[char] || null;
}

export function getSpawnTable(depth) {
  // Find the highest depth threshold that's <= current depth
  const thresholds = Object.keys(SPAWN_TABLES)
    .map(Number)
    .sort((a, b) => b - a);

  for (const threshold of thresholds) {
    if (depth >= threshold) {
      return SPAWN_TABLES[threshold];
    }
  }

  return SPAWN_TABLES[0];
}

export function getRandomEnemy(depth) {
  const table = getSpawnTable(depth);
  const char = table[Math.floor(Math.random() * table.length)];
  return char;
}

// Get random enemy for specific zone (zone-aware spawning)
export function getZoneRandomEnemy(depth, zoneType) {
  const zoneTables = ZONE_SPAWN_TABLES[zoneType];
  if (!zoneTables) {
    // Fallback to legacy depth-based spawning for unknown zones
    return getRandomEnemy(depth);
  }

  // Find highest depth threshold <= current depth
  const thresholds = Object.keys(zoneTables)
    .map(Number)
    .sort((a, b) => b - a);

  let table = zoneTables[0];
  for (const threshold of thresholds) {
    if (depth >= threshold) {
      table = zoneTables[threshold];
      break;
    }
  }

  return table[Math.floor(Math.random() * table.length)];
}

// Boss enemies (2x stats)
export function createBossEnemy(depth) {
  const baseChar = getRandomEnemy(depth);
  const baseData = getEnemyData(baseChar);

  return {
    ...baseData,
    hp: baseData.hp * 2,
    damage: baseData.damage * 2,
    isBoss: true,
    color: '#ff00ff'
  };
}
