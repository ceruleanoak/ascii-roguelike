// Zone color palette
export const ZONE_COLORS = {
  green: '#00ff00',
  red: '#ff4400',
  cyan: '#44ffff',
  yellow: '#ffff44',
  gray: '#888888',
  blue: '#66aaff'
};

// Fresh per-zone depth tracker, derived from the zone list itself so a new
// zone can never be missed at a reset site again (resolved bug #100: three
// hand-written literals dropped the `blue` key).
export function freshZoneDepths() {
  const depths = {};
  for (const zone of Object.keys(ZONES)) depths[zone] = 0;
  return depths;
}

// Zone-flagged combat scaling (`hardMode`: +50% hp/damage). Applied to every
// enemy entering a room — generation, boss encounters, runtime summons, and
// interior spawns alike. The _zoneBuffed guard keeps saved-room restores and
// repeat passes from compounding the buff.
export function applyZoneCombatModifiers(enemy, zoneType) {
  if (!ZONES[zoneType]?.hardMode || enemy._zoneBuffed) return;
  enemy.hp = Math.ceil(enemy.hp * 1.5);
  enemy.maxHp = Math.ceil(enemy.maxHp * 1.5);
  enemy.damage = Math.ceil(enemy.damage * 1.5);
  enemy._zoneBuffed = true;
}

export const ZONES = {
  'green': {
    name: 'Verdant Wilds',
    spellDescription: 'THE PATH BEGINS.',
    wiseSayings: [
      'BRING A BLADE WHEN YOU FISH.',
      'WHERE DID I PUT MY OIL PRESS?',
      'THE LESHY HIDES IN GREEN THINGS.',
      'THERE ARE MULTIPLE PATHS.',
      'BEWARE THE RUSALKA.',
      'SPEAK AND THE HUT WILL SIT.',
      'GOO IS IMMUNE TO GOO.',
      'THREE HEADS ARE FAR WORSE THAN ONE.'
    ],
    // Rare-tier sayings — unlocked by giving an Artifact ⚜ to the wise fellow.
    // Content should reveal genuinely game-changing info, not flavor.
    rareSayings: [
      'A BUSH DOES NOT FEAR THE WOLF.',
      'STONE GIVES MORE THAN STONE.',
      'THE FAIRY KNOWS THE WAY TO DUST.'
    ],
    borderColor: '#00ff00',
    exitColor: ZONE_COLORS.green,
    alternativeZones: ['red', 'cyan', 'yellow'],
    // Depth-1 weapon offering pool — one floating pickup per L1 room (RoomGenerator).
    l1WeaponPool: ['↾', '†', '⊥', ')', '⊸', '/'], // dagger, sword, hammer, bow, sling, staff
    bossDepth: 15,
    bossPool: ['giant_slime', 'goblin_army'],
    environmentColors: {
      grass: '#559944',
      tree: '#336633',
      background: '#000000'
    },
    // Combat rhythm: "learn the basics" — direct threats mixed with ranged keepers
    // and one pack-kiter type. Player learns melee vs. ranged enemy patterns.
    movementProfiles: ['chaser', 'keeper', 'kiter'],
    spawnTables: ['basic', 'forest'],
    objectWeights: {
      '%': 0.25, // Shrub
      '&': 0.15, // Bush
      'Y': 0.40, // Tree
      '0': 0.20, // Rock
      '=': 0.10, // Water
      'ŋ': 0.15, // Stump
      'n': 0.10, // Mushroom
      '⊞': 0.02  // Chest (rare)
    }
  },
  'red': {
    name: 'Scorched Wastes',
    spellDescription: 'THE BURNING PLACE.',
    wiseSayings: [
      'PREPARE FOR HARSE CONDITIONS.',
      'WATER CAN BE A WEAPON.',
      'TO DESCEND FURTHER, SPEAK THE MAGIC WORD.',
      'GHOSTS CAN BE LAID TO REST WITH FIRE.',
      'SEEK THE PATH OF THE MAGE.',
      'RUBY IS THE STONE OF FLAME.',
      'THE TREES HERE CARRY A RARE SAP.',
      'RESCUE THE BRUTAL WARRIOR.'
    ],
    rareSayings: [
      'THE INFUSED COIN TURNS THE WELL.',
      'OBSIDIAN HIDES THE GEMSTONE.',
      'A QUENCHED FLAME BECOMES A STONE.'
    ],
    borderColor: '#ff4400',
    exitColor: ZONE_COLORS.red,
    alternativeZones: ['green', 'cyan', 'yellow'],
    // Depth-1 weapon offering pool — one floating pickup per L1 room (RoomGenerator).
    l1WeaponPool: ['¬', '¡', '†', '⊥', '⛏'], // gun, bat, sword, hammer, pickaxe
    bossDepth: 15,
    environmentColors: {
      grass: '#664422', // Burned grass
      tree: '#332211', // Charred
      background: '#110000' // Red tint
    },
    // Combat rhythm: "pure aggression" — fast chasers and fire keepers that zone the player.
    // Ambushers (Living Rock) punish careless exploration. No kite/hover — just pressure.
    movementProfiles: ['chaser', 'keeper', 'ambusher'],
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
      'ŋ': 0.15,  // Charred stumps
      '⊞': 0.02   // Chest (rare)
    },
    preSpawnBurned: true // Background objects spawn pre-burned
  },
  'cyan': {
    name: 'Frozen Peaks',
    spellDescription: 'COLD AND ANCIENT.',
    wiseSayings: [
      'THE COLD DOES NOT TIRE.',
      'ICE HIDES BUT NEVER FORGETS.',
      'CRYSTALS HOLD STOLEN WORDS.',
      'STILLNESS IS NOT SAFETY.',
      'WHAT FREEZES CAN BE BROKEN.',
      'LISTEN FOR THE CRACK.',
      'THE PEAKS REMEMBER EVERY STEP.',
      'WARMTH IS A WEAPON HERE.'
    ],
    rareSayings: [
      'FROZEN WATER FORGETS THE SPARK.',
      'THE CRYSTAL ANSWERS THE BULLET.',
      'BREAK ICE TO DRINK THE PEAK.'
    ],
    borderColor: '#44ffff',
    exitColor: ZONE_COLORS.cyan,
    alternativeZones: ['green', 'red', 'yellow'],
    // Depth-1 weapon offering pool — one floating pickup per L1 room (RoomGenerator).
    l1WeaponPool: ['ߒ', ')', '⊸', '↾', '↑'], // fishing pole, bow, sling, dagger, spear
    bossDepth: 15,
    environmentColors: {
      grass: '#aaffff',
      tree: '#6699aa',
      background: '#000011'
    },
    // Combat rhythm: "tactical" — kiter packs force repositioning, keepers punish rush-in.
    // Player must think about spacing on two axes simultaneously.
    movementProfiles: ['kiter', 'keeper', 'chaser'],
    spawnTables: ['ice', 'frost'],
    objectWeights: {
      'i': 0.25, // Ice
      '~': 0.20, // Puddle (frozen)
      '*': 0.15, // Crystal
      '0': 0.25, // Rock
      'Q': 0.15, // Boulder
      '⊞': 0.02  // Chest (rare)
    }
  },
  'yellow': {
    name: 'Stormlands',
    spellDescription: 'THE STORM WATCHES.',
    wiseSayings: [
      'IT STRIKES BEFORE YOU SEE.',
      'METAL CALLS THE SKY.',
      'COUNT BETWEEN FLASH AND ROAR.',
      'THE STORM HAS NO PATIENCE.',
      'SAND REMEMBERS LIGHTNING.',
      'STAND APART FROM IRON.',
      'THE SKY CHOOSES ITS MARK.',
      'WET GROUND CARRIES THE SPARK.'
    ],
    rareSayings: [
      'IRON IN HAND IS IRON IN SKY.',
      'THE BOX CONDUCTS, THE WOOD DOES NOT.',
      'A WET FOE IS A LIT FOE.'
    ],
    borderColor: '#ffff44',
    exitColor: ZONE_COLORS.yellow,
    alternativeZones: ['green', 'red', 'cyan'],
    // Depth-1 weapon offering pool — one floating pickup per L1 room (RoomGenerator).
    l1WeaponPool: ['/', 'Ⲯ', '≋', '¬', '↑'], // staff, thick staff, whip, gun, spear
    bossDepth: 15,
    environmentColors: {
      grass: '#888844',
      tree: '#666633',
      background: '#000800'
    },
    // Combat rhythm: "erratic" — kiter spiders plus fast-darting keepers.
    // Unpredictable timing; enemies don't behave the same way twice.
    movementProfiles: ['kiter', 'keeper', 'jumper'],
    spawnTables: ['lightning', 'storm'],
    objectWeights: {
      '*': 0.20, // Crystal (conductive)
      'B': 0.15, // Metal Box
      '~': 0.15, // Puddle (electrified)
      '0': 0.25, // Rock
      'Y': 0.45, // Tree
      '⊞': 0.02  // Chest (rare)
    }
  },
  'gray': {
    name: 'Realm of the Dead',
    spellDescription: 'LOST IN THE MIST.',
    wiseSayings: [
      'NONE ESCAPE THE MIST.',
      'TEN STEPS AND THEN NOTHING.',
      'THE DEAD WALK BUT DO NOT LEAD.',
      'RETURN IS NOT GIVEN HERE.',
      'FIVE MUST BECOME ONE.',
      'COUNT YOUR STEPS CAREFULLY.',
      'THE MIST KNOWS YOUR NAME.',
      'NO SHRINE ANSWERS HERE.'
    ],
    // Rare-tier sayings — the gray zone's are the run-defining ones: the mist
    // radius, the depth-10 finish line, and the snapshot rule.
    rareSayings: [
      'THE MIST GRANTS TEN PACES. COUNT THEM.',
      'THE TENTH ROOM TAKES THE WALKER.',
      'WHAT THE MIST TAKES, IT KEEPS. CARRY YOUR BEST.'
    ],
    borderColor: '#888888',
    exitColor: ZONE_COLORS.gray,
    alternativeZones: [], // Gray zone has no alternative colors
    // No bossDepth — gray has no zone boss. Its finish line is maxDepth:
    // at depth 10 the mist takes the character (GrayZoneSystem).
    maxDepth: 10,
    bossPool: ['bone_legion', 'grave_tyrant'],
    // Mist: vision is clamped to this many cells around the player
    // ("TEN STEPS AND THEN NOTHING."). Rendered by GrayZoneSystem.
    mist: { radius: 10 },
    environmentColors: {
      grass: '#333333',
      tree: '#222222',
      background: '#050505'
    },
    // Combat rhythm: "relentless" — all direct chasers with keeper necromancers.
    // Overwhelming pressure from every direction; no clever tactics, just endurance.
    movementProfiles: ['chaser', 'keeper'],
    spawnTables: ['undead', 'boss'],
    environmentalFeatures: {
      grassDensity: 0.15,           // Dead land — 15% of green-zone grass
      rockVariants: [
        { char: '0', name: 'Grave Rock', dropTable: 'grave' },
        { char: 'Q', name: 'Barrow Stone', dropTable: 'grave' }
      ]
    },
    objectWeights: {
      '8': 0.40, // Bones (everywhere)
      '$': 0.10, // Shrine
      '0': 0.30, // Rock
      'Q': 0.08, // Barrow Stone (grave goods)
      'ŋ': 0.20, // Stump (dead trees)
      '⊞': 0.02  // Chest (rare) — better gear in = better snapshot out
    },
    hardMode: true, // All enemies +50% stats
    noRest: true // Cannot return to base from gray zone
  },
  'blue': {
    name: 'Tidefall',
    spellDescription: 'THE TIDE HAS PARTED.',
    wiseSayings: [
      'WATER IS A WEAPON, NOT A WALL.',
      'THE FIN STRIKES FROM BELOW.',
      'CRYSTALS CARRY YOUR WEIGHT.',
      'THE WAKE REMEMBERS.'
    ],
    borderColor: '#66aaff',
    exitColor: ZONE_COLORS.blue,
    alternativeZones: [], // Linear pearl-ritual zone; no in-zone color drift.
    // No bossDepth — the zone is exactly 4 rooms (Shallows → Reef Walk → Wake
    // Drift → Pearl Cache) tracked by game.blueZoneRoom; no boss.
    environmentColors: {
      grass: '#3a8fbf',    // wet sand
      tree: '#2a6080',     // weathered seaweed columns
      background: '#04101a' // deep tidal night
    },
    movementProfiles: ['keeper', 'kiter'], // gentle — tutorial zone
    spawnTables: ['basic', 'forest'],       // reuses Frog/Sea Snake injections from terrain templates
    objectWeights: {
      '~': 0.35, // water
      '0': 0.15, // rock
      'C': 0.05, // coral cluster (cuttable, drops Coral Cluster ingredient)
      '%': 0.05, // kelp (visually styled)
      '⊞': 0.00  // no chests in tutorial rooms
    }
  }
};
