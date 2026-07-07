// Letter-based room templates
// Defines how each exit letter modifies room generation (terrain, objects, spawn rules)

export const LETTER_TEMPLATES = {
  A: {
    name: 'Ascent',
    description: 'Central high-ground plateau ringed by sloped terrain that pushes entities outward',

    wallStructures: {
      allow: true
    },

    bgObjectRules: {
      // Keep the central plateau clear of random objects
      clearingZone: {
        centerCol: 15,
        centerRow: 15,
        width: 12,  // covers the inner plateau radius (~5 cells each side)
        height: 12,
        allowGrass: false,
        allowObjects: false
      },
      grassDensity: 0.8
    },

    // Eligible for HuntingSystem's stillness-triggered moose/rabbit encounter.
    huntableGame: true
  },

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
          '%': 3.0, // Heavy shrubs on perimeter
          'Y': 2.5, // Trees on perimeter
          '0': 0.5, // Minimal rocks
          '+': 2.0  // Brambles on perimeter
        }
      },

      // Corner clusters (extra dense)
      cornerClusters: {
        enabled: true,
        clusterSize: 8,  // 8 objects per corner
        clusterRadius: 64, // Tight clustering
        objectTypes: ['%', 'Y', '+'] // Organic only
      },

      // Overall grass density
      grassDensity: 0.2, // 20% normal (sparse grass, mostly on perimeter)

      // No water/lava in the arena — liquid breaks line-of-sight and clutters the fight
      suppressLiquid: true
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
    },

    // Eligible for HuntingSystem's stillness-triggered moose/rabbit encounter.
    huntableGame: true
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
        '%': 0.3,  // Fewer shrubs
        'Y': 0.3   // Fewer trees
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
    },

    // Eligible for HuntingSystem's stillness-triggered moose/rabbit encounter.
    huntableGame: true
  },

  G: {
    name: 'Grass',
    description: 'Overgrown meadow — tall grass conceals ground enemies, items, and the player. Flying enemies remain above the canopy. A Scythe waits in a small clearing.',

    wallStructures: {
      allow: false // Open meadow — no walls
    },

    bgObjectRules: {
      // Small central clearing where the Scythe spawns
      clearingZone: {
        centerCol: 15,
        centerRow: 15,
        width: 9,
        height: 7,
        allowGrass: false,
        allowObjects: false
      },

      // Heavy grass swaths everywhere except the clearing
      grassDensity: 2.5,

      // Sparse trees / rocks / bushes — keep the meadow open
      densityMultiplier: 0.45,
      objectBias: {
        '%': 0.6,  // Few shrubs
        'Y': 0.4,  // Few trees
        '0': 0.3,  // Few rocks
        '+': 0.3   // Few brambles
      },

      // Water breaks the grass coverage — keep it out
      suppressLiquid: true
    },

    // Always drop a Scythe in the clearing
    guaranteedItems: {
      enabled: true,
      position: 'clearing_center',
      itemPool: ['Ƨ'] // Scythe
    },

    // Eligible for HuntingSystem's stillness-triggered moose/rabbit encounter.
    huntableGame: true
  },

  T: {
    name: 'Tunnel Passage',
    description: 'Dual-plane tunnel with entrance-based plane switching',

    // Wall structures disabled (tunnel generates its own walls)
    wallStructures: {
      allow: false
    },

    // Background objects minimal (tunnel walls are the main feature), but
    // rocks are biased up: tunnels are the mining aisle — the reliable place
    // to harvest the zone mineral (see InteractionSystem.getZoneMineral).
    // Combat strategy stays the room's identity; the rocks give a reason to
    // pick the T door when low on minerals.
    bgObjectRules: {
      densityMultiplier: 0.3, // Minimal objects
      grassDensity: 0.2, // Sparse grass
      objectBias: {
        '0': 3.0,  // Rocks dominate what little spawns
        '%': 0.3,
        'Y': 0.2
      }
    },

    // Enemy spawn rules
    enemySpawnRule: {
      spawnMode: 'TUNNEL', // Special flag for tunnel enemy placement
      minEnemies: 2,
      maxEnemies: 4
    },

    // Eligible for HuntingSystem's stillness-triggered moose/rabbit encounter.
    huntableGame: true
  },

  E: {
    name: 'Errand',
    description: 'A mysterious traveler appears after enemies are cleared, seeking an item in trade',

    wallStructures: {
      allow: true
    },

    bgObjectRules: {
      grassDensity: 0.7
    },

    // After room clear, spawn an ErrandCharacter NPC
    neutralAfterClear: true
  },

  I: {
    name: 'Island',
    description: 'Mostly water with a generated land mass in the center - barrels and crates wash ashore',

    wallStructures: {
      allow: false // Water is the environmental boundary
    },

    islandZone: {
      enabled: true,
      islandCenterCol: 15,
      islandCenterRow: 15,
      islandRadius: 5,      // Island land mass radius (cells from center)
      lakeRadius: 12,       // Outer water ring boundary — beyond this is normal land
      edgeNoise: 1.5,       // Noise for organic shorelines (both inner and outer)
      waterDensity: 0.85,   // Water coverage probability within the ring
      barrelMin: 3,         // Min barrels scattered on the island
      barrelMax: 5          // Max barrels scattered on the island
    },

    bgObjectRules: {
      grassDensity: 0.6,
      objectBias: {
        'p': 4.0,  // Heavy barrel weight
        '#': 1.5,  // Some crates
        '%': 0.5,  // Fewer shrubs
        'Y': 0.5,  // Fewer trees
        '0': 0.3   // Fewer rocks
      }
    },

    // Always inject 1-2 frogs that swim in the surrounding water ring
    enemyInjection: {
      char: 'g',
      minCount: 1,
      maxCount: 2,
      preferLiquid: true
    },

    // Eligible for HuntingSystem's stillness-triggered moose/rabbit encounter.
    huntableGame: true
  },

  L: {
    name: 'Lake',
    description: 'A large irregular body of water — fishing available after clearing enemies',

    wallStructures: {
      allow: false
    },

    lakeZone: {
      enabled: true,
      nodes: [
        { col: 11, row: 12, radius: 6 },
        { col: 16, row: 15, radius: 5 },
        { col: 13, row: 19, radius: 4.5 }
      ],
      edgeNoise: 2.2,
      waterDensity: 0.88
    },

    bgObjectRules: {
      grassDensity: 0.5,
      objectBias: { '%': 1.2, '0': 0.8, 'Y': 0.6, 'n': 0.8 }
    },

    // Always inject 1-2 frogs near the lake shore
    enemyInjection: {
      char: 'g',
      minCount: 1,
      maxCount: 2,
      preferLiquid: true
    },

    // Eligible for HuntingSystem's stillness-triggered moose/rabbit encounter.
    huntableGame: true
  },

  L_BOSS: {
    name: 'Lake (Boss)',
    description: 'Large lake arena for The Frosted Maw boss encounter',

    wallStructures: {
      allow: false
    },

    lakeZone: {
      enabled: true,
      nodes: [
        { col: 13, row: 12, radius: 12 },  // upper body
        { col: 16, row: 18, radius: 11 },  // lower body
        { col: 7,  row: 14, radius: 8  },  // left arm
        { col: 22, row: 13, radius: 8  },  // right arm
      ],
      edgeNoise: 2.0,
      waterDensity: 0.93
    },

    bgObjectRules: {
      grassDensity: 0.5,
      objectBias: { '%': 1.2, '0': 0.8, 'Y': 0.6 }
    }
  },

  // Quagmire (Q) — rare green-zone water arena. Dispersed pools (reusing the
  // lakeZone blob carver) host escalating round combat; a Rusalka surfaces after
  // the final clear. Frog-only Ponds are seeded into these pools in a later phase.
  Q: {
    name: 'Quagmire',
    description: 'A rare green mire of scattered pools — combat rises in rounds, then the Rusalka',

    wallStructures: {
      allow: false
    },

    // Several smaller, scattered pools (vs. the L room's few large nodes).
    lakeZone: {
      enabled: true,
      nodes: [
        { col: 8,  row: 9,  radius: 3.5 },
        { col: 20, row: 10, radius: 3.5 },
        { col: 13, row: 15, radius: 4 },
        { col: 7,  row: 20, radius: 3 },
        { col: 22, row: 19, radius: 3 }
      ],
      edgeNoise: 2.2,
      waterDensity: 0.85
    },

    bgObjectRules: {
      grassDensity: 0.45,
      objectBias: { '%': 1.2, '0': 0.8, 'Y': 0.6, 'n': 0.8 }
    },

    // Combat (when present) escalates over 3 rounds — RoundCombatSystem.
    roundCombat: { enabled: true, rounds: 3 },

    // Marks the room a Quagmire for the post-clear Rusalka + (later) Pond seeding.
    quagmire: true,

    // Frogs near the pools, like the Lake room.
    enemyInjection: {
      char: 'g',
      minCount: 1,
      maxCount: 2,
      preferLiquid: true
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
      grassDensity: 0.8,      // Normal grass (except in water zone)
      // Coral grows only here — absolute weight added to the zone table
      objectWeights: { 'C': 0.08 }
    },

    // Exit rules - east exit disabled (ocean blocks passage)
    exitRules: {
      disableEast: true  // No eastern passage through the ocean
    },

    // Enemy spawn rules
    enemySpawnRule: {
      spawnMode: 'OCEAN',      // Avoid water zone
      preventWaterSpawn: true  // Don't spawn enemies in water (except injected water-affinity enemies)
    },

    // Always inject 1-2 sea snakes regardless of zone spawn table
    enemyInjection: {
      char: 's',
      minCount: 1,
      maxCount: 2,
      preferLiquid: true   // Sea snakes spawn in/near water
    },

    // Eligible for HuntingSystem's stillness-triggered moose/rabbit encounter.
    huntableGame: true
  },

  H: {
    name: 'Hut',
    description: 'A small structure from outside — a separate arena within',

    wallStructures: {
      allow: false // Hut generates its own wall structure
    },

    bgObjectRules: {
      grassDensity: 0.7,
      objectBias: {
        '%': 1.2, // Slightly more shrubs
        'Y': 2.0, // Trees cluster around huts
        '0': 0.6
      }
    },

    hutStructure: {
      enabled: true,
      centerCol: 15,
      centerRow: 15,
      exteriorWidth: 5,   // Hut footprint on exterior room (5×5 cells)
      exteriorHeight: 5,
      wallChar: '≡',      // Plank-wall char
      doorChar: '∩',      // Archway entrance char
      doorSide: 'south'   // Door always opens southward (player approaches from south)
    },

    hutKind: 'random' // 'enemy_encounter' | 'neutral_npc' | 'random'
  },

  S: {
    name: 'Settlement',
    description: 'A small cluster of neutral huts — press, wise man, alchemist',

    wallStructures: {
      allow: false // Each hut generates its own wall structure
    },

    bgObjectRules: {
      grassDensity: 0.7,
      objectBias: {
        '%': 1.2,
        'Y': 2.0,
        '0': 0.6
      }
    },

    // Pool of available hut kinds — generateSettlementRoom (roomFeatures.js)
    // picks 2-3 of these at random and places them at random non-overlapping
    // positions, unlike hutStructure's single fixed footprint above.
    settlementHutPool: ['press', 'wise_man', 'alchemy', 'neutral_npc', 'fisherman', 'weapons_master']
  },

  M: {
    name: 'Maze',
    description: 'A crumbling maze — a single winding corridor hiding loot behind cipher-covered objects; one blinks a warning at a time, and if it isn\'t broken open in time it turns into a ghost',

    wallStructures: {
      allow: false // Maze generates its own exterior structure
    },

    bgObjectRules: {
      grassDensity: 0.5,
      objectBias: {
        '8': 1.5, // More bones — abandoned feel
        '0': 1.2,
        '%': 0.4
      }
    },

    hutStructure: {
      enabled: true,
      centerCol: 15,
      centerRow: 15,
      exteriorWidth: 5,
      exteriorHeight: 5,
      wallChar: '≡',
      doorChar: '∩',
      doorSide: 'south'
    }
  },

  D: {
    name: 'Dungeon',
    description: 'A dungeon entrance — a separate interior arena with its own space',

    wallStructures: {
      allow: false // Dungeon generates its own wall structure
    },

    bgObjectRules: {
      grassDensity: 0.4,
      objectBias: {
        '0': 1.5, // More rocks
        '8': 1.2, // More bones
        '%': 0.5
      }
    },

    hutStructure: {
      enabled: true,
      centerCol: 15,
      centerRow: 15,
      exteriorWidth: 5,
      exteriorHeight: 5,
      wallChar: '≡',
      doorChar: '∩',
      doorSide: 'south'
    },

    hutKind: 'enemy_encounter'
  },

  U: {
    name: 'Underground',
    description: 'Dual-plane cave system with aboveground clearings near exits and fog-of-war underground',

    wallStructures: {
      allow: false
    },

    bgObjectRules: {
      clearingZone: {
        centerCol: 15,
        centerRow: 15,
        width: 28,
        height: 28,
        allowGrass: false,
        allowObjects: false
      },
      grassDensity: 0.0
    }
  },

  R: {
    name: 'Ridge',
    description: 'Impassable ravine across the top third; crossable only when bridge is built',

    wallStructures: {
      allow: false
    },

    bgObjectRules: {
      // Full-width clearing over ravine rows 0-9 — no random objects in that zone
      clearingZone: {
        centerCol: 15,
        centerRow: 5,
        width: 30,
        height: 10,
        allowGrass: false,
        allowObjects: false
      },
      grassDensity: 0.6
    }
  },

  F: {
    name: 'Fountain',
    description: 'A large square pool with two waterfalls flanking a central pad — drop a weapon here to summon a fairy upgrade',

    wallStructures: {
      allow: false
    },

    bgObjectRules: {
      // Keep the central fountain footprint free of random objects
      clearingZone: {
        centerCol: 15,
        centerRow: 15,
        width: 12,
        height: 12,
        allowGrass: false,
        allowObjects: false
      },
      grassDensity: 0.5,
      objectBias: {
        '%': 1.2,
        'Y': 0.8,
        '0': 0.5
      }
    },

    fountainStructure: {
      enabled: true,
      centerCol: 15,
      centerRow: 15,
      poolRadius: 4,        // 9×9 pool footprint (radius 4 → 9 cells across)
      padRadius: 0,         // 1×1 walkable center pad (player stands here to offer)
      waterfallCols: [-3, 3] // waterfall columns relative to center
    }
  },

  W: {
    name: 'Well',
    description: 'A small stone well at center — drop an Infused Coin to awaken the magic meter',

    wallStructures: {
      allow: false
    },

    bgObjectRules: {
      // Keep the central well clearing free of random objects
      clearingZone: {
        centerCol: 15,
        centerRow: 15,
        width: 8,
        height: 8,
        allowGrass: false,
        allowObjects: false
      },
      grassDensity: 0.5,
      objectBias: {
        '%': 1.1,
        'Y': 2.0, // Trees cluster around the well
        '0': 0.6
      }
    },

    wellStructure: {
      enabled: true,
      centerCol: 15,
      centerRow: 15,
      ringRadius: 2  // 5x5 footprint with circular ring of stones
    },

    // Eligible for HuntingSystem's stillness-triggered moose/rabbit encounter.
    huntableGame: true
  },

  // ── Stub templates — prevent undefined lookups from RoomGenerator ──────────
  // These rooms exist in EXIT_LETTERS but have no layout content yet.
  // Each stub falls back to generic open-floor generation until real content
  // is designed. RoomGenerator must treat these as valid (non-undefined) entries.

  P: {
    name: 'Puzzle',
    description: 'A zone-specific puzzle room — layout generated by PuzzleSystem from data/puzzles.js',

    wallStructures: {
      allow: false
    },

    bgObjectRules: {
      // Keep the central puzzle arena clear of random objects
      clearingZone: {
        centerCol: 15,
        centerRow: 15,
        width: 14,
        height: 14,
        allowGrass: false,
        allowObjects: false
      },
      grassDensity: 0.4,
      objectBias: {
        '%': 0.8,
        'Y': 0.6,
        '0': 0.4
      }
    }
  },

  C: {
    name: 'Camp',
    description: 'A traveler\'s camp — stub template, open floor with light scatter',

    wallStructures: {
      allow: true
    },

    bgObjectRules: {
      grassDensity: 0.5,
      objectBias: {
        'p': 1.5,  // barrels — camping supplies
        '8': 1.2,  // bones — campfire remnants
        '%': 0.8,
        'Y': 0.6
      }
    }
  },

  '?': {
    name: 'Mystery',
    description: 'A discovery room of unknown type — stub template, open floor',

    wallStructures: {
      allow: true
    },

    bgObjectRules: {
      grassDensity: 0.5
    },

    // Eligible for HuntingSystem's stillness-triggered moose/rabbit encounter.
    huntableGame: true
  },

  X: {
    name: 'Crossroads',
    // Open central clearing where many paths meet; ringed by perch-friendly
    // trees and stumps so a flock of crows has somewhere to settle.
    description: 'Open central clearing ringed by trees — crows hoard shiny things here',

    wallStructures: {
      allow: false // no random walls breaking the converging-paths read
    },

    bgObjectRules: {
      // Keep the center open so the "many paths cross" feel reads cleanly
      clearingZone: {
        centerCol: 15,
        centerRow: 15,
        width: 10,
        height: 10,
        allowGrass: true,
        allowObjects: false
      },
      // Light grass overall, with biased perch objects on the perimeter
      grassDensity: 0.5,
      objectBias: {
        'Y': 1.8, // trees — crow perches
        'ŋ': 1.6, // stumps — crow perches
        '%': 0.6, // sparse bushes
        '0': 0.4  // sparse rocks
      }
    },

    // Eligible for HuntingSystem's stillness-triggered moose/rabbit encounter.
    huntableGame: true
  },

  // ── Blue-zone (Tidefall) tutorial rooms ────────────────────────────────────
  // The four room templates of the secret blue zone. Each pairs a familiar
  // water terrain config (lake / ocean / dry-sand) with an armor pickup
  // placed by RoomGenerator. See main.js blueZoneRoom for progression order.

  '~': {
    name: 'Shallows',
    description: 'Blue-zone entry: a central pool bisects the room; Shark Mask waits on a midwater island',

    wallStructures: { allow: false },

    lakeZone: {
      enabled: true,
      nodes: [
        { col: 15, row: 13, radius: 8 } // single broad central pool
      ],
      edgeNoise: 1.6,
      waterDensity: 0.92
    },

    bgObjectRules: {
      grassDensity: 0.0, // sand floor only
      objectBias: { '0': 0.6 }
    },

    // 2-3 frogs in the water — tutorial targets for the emerge attack
    enemyInjection: {
      char: 'g',
      minCount: 2,
      maxCount: 3,
      preferLiquid: true
    },

    blueZoneArmor: '∆' // Shark Mask placed on the central island
  },

  '⌇': {
    name: 'Reef Walk',
    description: 'Blue-zone reef: wide ocean body with scattered islands; Coral Crown gates the path',

    wallStructures: { allow: false },

    oceanZone: {
      enabled: true,
      waterStartCol: 6,
      waterEndCol: 26,
      sandStartCol: 5,
      sandEndCol: 27,
      waterDensity: 0.85,
      sandDensity: 0.5
    },

    bgObjectRules: {
      grassDensity: 0.0,
      objectBias: { '0': 0.5 }
    },

    // Frogs + sea snakes patrol the water; player can ignore via Coral Crown bridge
    enemyInjection: {
      char: 's',
      minCount: 2,
      maxCount: 3,
      preferLiquid: true
    },

    blueZoneArmor: '𐤕'
  },

  '⌒': {
    name: 'Wake Drift',
    description: 'Blue-zone wake gauntlet: elongated pool spanning the room; pack of enemies test the Stingray Mantle',

    wallStructures: { allow: false },

    lakeZone: {
      enabled: true,
      nodes: [
        { col: 6,  row: 15, radius: 5 },
        { col: 12, row: 15, radius: 5 },
        { col: 18, row: 15, radius: 5 },
        { col: 24, row: 15, radius: 5 }
      ],
      edgeNoise: 1.4,
      waterDensity: 0.9
    },

    bgObjectRules: {
      grassDensity: 0.0,
      objectBias: { '0': 0.4 }
    },

    // Larger pack so the wake mechanic shines (4-5 frogs + sea snakes)
    enemyInjection: {
      char: 'g',
      minCount: 4,
      maxCount: 5,
      preferLiquid: true
    },

    blueZoneArmor: '⚲'
  },

  '◌': {
    name: 'Pearl Cache',
    description: 'Blue-zone reward room: small hand-shaped sand chamber with a pedestal and a one-way return',

    wallStructures: { allow: false },

    bgObjectRules: {
      grassDensity: 0.0,
      objectBias: { '0': 0.3 }
    },

    blueZonePedestal: true // RoomGenerator places the pearl-cache pedestal at center
  }
};
