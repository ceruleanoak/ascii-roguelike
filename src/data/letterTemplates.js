// Letter-based room templates
// Defines how each exit letter modifies room generation (terrain, objects, spawn rules)

export const LETTER_TEMPLATES = {
  B: {
    name: 'Boss Clearing',
    description: 'Open center arena with dense perimeter',

    // Wall structure rules
    wallStructures: {
      allow: false // No random wall structures in boss rooms
    },

    // Background object generation rules
    bgObjectRules: {
      // Center clearing zone (no objects)
      clearingZone: {
        centerCol: 15, // Center of 30x30 grid
        centerRow: 15,
        width: 10,     // 10x10 clearing
        height: 10,
        allowGrass: false,  // No grass in clearing
        allowObjects: false // No objects in clearing
      },

      // Perimeter zone (dense objects)
      perimeterZone: {
        densityMultiplier: 2.0, // 2x normal object count
        objectBias: {
          '%': 3.0, // Heavy bushes on perimeter
          '&': 2.5, // Trees on perimeter
          '0': 0.5, // Minimal rocks
          '+': 2.0  // Brambles on perimeter
        }
      },

      // Corner clusters (extra dense)
      cornerClusters: {
        enabled: true,
        clusterSize: 8,  // 8 objects per corner
        clusterRadius: 64, // Tight clustering
        objectTypes: ['%', '&', '+'] // Organic only
      },

      // Overall grass density
      grassDensity: 0.2 // 20% normal (sparse grass, mostly on perimeter)
    },

    // Enemy spawn rules
    enemySpawnRule: {
      spawnZone: 'center', // Boss spawns in center clearing
      preventPerimeterSpawn: true // Don't spawn in corners
    }
  },

  V: {
    name: 'Vault',
    description: 'Locked cage with rare treasure - no clear way inside',

    // Wall structure rules
    wallStructures: {
      allow: true // Allow structures outside vault
    },

    // Custom collision pattern (hollow square cage)
    vaultStructure: {
      enabled: true,
      centerCol: 15,  // Center of 30x30 grid
      centerRow: 15,
      size: 7,        // 7x7 hollow square
      hollow: true,   // Hollow interior (1-cell thick walls)
      wallChar: '#'   // Visual indicator (uses crate/wall char)
    },

    // Background object generation rules
    bgObjectRules: {
      // Clear zone around vault (2 cells buffer)
      clearingZone: {
        centerCol: 15,
        centerRow: 15,
        width: 11,     // 7 + 2*2 buffer
        height: 11,
        allowGrass: true,   // Allow grass around vault
        allowObjects: false // No objects near vault
      },

      // Overall grass density
      grassDensity: 0.5 // 50% normal (sparse but visible)
    },

    // Guaranteed loot spawn
    guaranteedItems: {
      enabled: true,
      position: 'vault_center', // Spawn in exact center of vault
      itemPool: 'rare_epic'     // Rare/epic weapons and armor only
    },

    // Enemy spawn rules
    enemySpawnRule: {
      spawnZone: 'perimeter',  // Enemies spawn outside vault
      preventVaultSpawn: true  // Never spawn inside vault
    }
  },

  K: {
    name: 'Key Room',
    description: 'Destructible objects contain vault keys',

    // Wall structure rules
    wallStructures: {
      allow: true // Normal structures
    },

    // Background object generation rules
    bgObjectRules: {
      // Favor destructible non-organic objects (barrels, crates, rocks)
      objectBias: {
        'p': 3.0,  // 3x barrels
        '#': 3.0,  // 3x crates
        '0': 2.0,  // 2x rocks
        'B': 2.0,  // 2x metal boxes
        '%': 0.3,  // Fewer bushes
        '&': 0.3   // Fewer trees
      },

      // Overall density boost
      densityMultiplier: 1.5, // 50% more objects than normal

      grassDensity: 0.4 // 40% normal grass (less organic)
    },

    // Special drop behavior
    keyDrops: {
      enabled: true,
      dropChance: 0.4,  // 40% chance per destructible
      keyChar: '߃',     // Key item character (Unicode U+07C3)
      eligibleObjects: ['p', '#', '0', 'B', '8'] // Barrels, crates, rocks, metal boxes, bones
    }
  },

  T: {
    name: 'Tunnel Passage',
    description: 'Dual-plane tunnel with entrance-based plane switching',

    // Wall structures disabled (tunnel generates its own walls)
    wallStructures: {
      allow: false
    },

    // Background objects minimal (tunnel walls are the main feature)
    bgObjectRules: {
      densityMultiplier: 0.3, // Minimal objects
      grassDensity: 0.2 // Sparse grass
    },

    // Enemy spawn rules
    enemySpawnRule: {
      spawnMode: 'TUNNEL', // Special flag for tunnel enemy placement
      minEnemies: 2,
      maxEnemies: 4
    }
  },

  O: {
    name: 'Ocean',
    description: 'Water-filled right third with sandy shore - no eastern passage',

    // Wall structures allowed
    wallStructures: {
      allow: true
    },

    // Ocean zone definition
    oceanZone: {
      enabled: true,
      waterStartCol: 20,  // Water begins at column 20 (right third of 30-col grid)
      waterEndCol: 29,    // Water extends to column 29 (before border)
      sandStartCol: 18,   // Sand transition begins at column 18
      sandEndCol: 21,     // Sand extends to column 21
      waterDensity: 0.8,  // 80% coverage in water zone
      sandDensity: 0.6    // 60% coverage in sand zone
    },

    // Background object generation rules
    bgObjectRules: {
      densityMultiplier: 1.0, // Normal object density
      grassDensity: 0.8       // Normal grass (except in water zone)
    },

    // Exit rules - east exit disabled (ocean blocks passage)
    exitRules: {
      disableEast: true  // No eastern passage through the ocean
    },

    // Enemy spawn rules
    enemySpawnRule: {
      spawnMode: 'OCEAN',      // Avoid water zone
      preventWaterSpawn: true  // Don't spawn enemies in water
    }
  }
};
