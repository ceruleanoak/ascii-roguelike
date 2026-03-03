// Zone color palette
export const ZONE_COLORS = {
  green: '#00ff00',
  red: '#ff4400',
  cyan: '#44ffff',
  yellow: '#ffff44',
  gray: '#888888'
};

export const ZONES = {
  'green': {
    name: 'Verdant Wilds',
    borderColor: '#00ff00',
    exitColor: ZONE_COLORS.green,
    alternativeZones: ['red', 'cyan', 'yellow'],
    environmentColors: {
      grass: '#559944',
      tree: '#336633',
      background: '#000000'
    },
    spawnTables: ['basic', 'forest'],
    objectWeights: {
      '%': 0.25, // Bush
      '&': 0.20, // Tree
      '0': 0.20, // Rock
      '=': 0.10, // Water
      'Y': 0.15, // Stump
      'n': 0.10  // Mushroom
    }
  },
  'red': {
    name: 'Scorched Wastes',
    borderColor: '#ff4400',
    exitColor: ZONE_COLORS.red,
    alternativeZones: ['green', 'cyan', 'yellow'],
    environmentColors: {
      grass: '#664422', // Burned grass
      tree: '#332211', // Charred
      background: '#110000' // Red tint
    },
    spawnTables: ['fire', 'demon'],

    // Environmental generation parameters
    environmentalFeatures: {
      liquidType: 'lava',           // Replace water with lava
      liquidChar: '~',              // Lava uses ~ char
      liquidColor: '#ff6600',
      liquidDamage: 2,              // Lava deals damage

      mudBeds: true,                // Enable mud bed generation
      mudChar: '~',                 // Dry mud (reuses ~ but different color)
      mudColorDry: '#aa8855',       // Light brown
      mudColorWet: '#664422',       // Dark brown (after walking)

      grassDensity: 0.3,            // 30% of GREEN zone grass
      grassPreburned: true,         // Grass spawns burned

      rockVariants: [
        { char: '0', name: 'Scorched Rock', dropTable: 'basic' },
        { char: 'Q', name: 'Obsidian Boulder', dropTable: 'gemstone' },
        { char: '*', name: 'Lava Crystal', dropTable: 'rare_gemstone' }
      ]
    },

    objectWeights: {
      '~': 0.20,  // Lava rivers (replaces water)
      '!': 0.15,  // Fire hazards
      'p': 0.10,  // Barrels
      '8': 0.15,  // Bones
      '0': 0.15,  // Scorched rocks
      'Q': 0.05,  // Obsidian boulders
      '*': 0.05,  // Lava crystals
      'Y': 0.15   // Charred stumps
    },
    preSpawnBurned: true // Background objects spawn pre-burned
  },
  'cyan': {
    name: 'Frozen Peaks',
    borderColor: '#44ffff',
    exitColor: ZONE_COLORS.cyan,
    alternativeZones: ['green', 'red', 'yellow'],
    environmentColors: {
      grass: '#aaffff',
      tree: '#6699aa',
      background: '#000011'
    },
    spawnTables: ['ice', 'frost'],
    objectWeights: {
      'i': 0.25, // Ice
      '~': 0.20, // Puddle (frozen)
      '*': 0.15, // Crystal
      '0': 0.25, // Rock
      'Q': 0.15  // Boulder
    }
  },
  'yellow': {
    name: 'Stormlands',
    borderColor: '#ffff44',
    exitColor: ZONE_COLORS.yellow,
    alternativeZones: ['green', 'red', 'cyan'],
    environmentColors: {
      grass: '#888844',
      tree: '#666633',
      background: '#000800'
    },
    spawnTables: ['lightning', 'storm'],
    objectWeights: {
      '*': 0.20, // Crystal (conductive)
      'B': 0.15, // Metal Box
      '~': 0.15, // Puddle (electrified)
      '0': 0.25, // Rock
      '&': 0.25  // Tree
    }
  },
  'gray': {
    name: 'Realm of the Dead',
    borderColor: '#888888',
    exitColor: ZONE_COLORS.gray,
    alternativeZones: [], // Gray zone has no alternative colors
    environmentColors: {
      grass: '#333333',
      tree: '#222222',
      background: '#050505'
    },
    spawnTables: ['undead', 'boss'],
    objectWeights: {
      '8': 0.40, // Bones (everywhere)
      '$': 0.10, // Shrine
      '0': 0.30, // Rock
      'Y': 0.20  // Stump (dead trees)
    },
    hardMode: true, // All enemies +50% stats
    noRest: true // Cannot return to base from gray zone
  }
};
