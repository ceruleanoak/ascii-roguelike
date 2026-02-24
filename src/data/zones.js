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
    objectWeights: {
      '!': 0.15, // Fire
      'p': 0.10, // Barrel
      '8': 0.15, // Bones
      '0': 0.30, // Rock (scorched)
      'Y': 0.20, // Stump (charred)
      '#': 0.10  // Crate
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
