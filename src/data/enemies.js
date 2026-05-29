import { COLORS, GRID } from '../game/GameConfig.js';

// Enemy definitions
// Note: 1 unit = GRID.CELL_SIZE = 16 pixels
export const ENEMIES = {

  // ============================================================
  // GREEN ZONE — forest / verdant
  // ============================================================

  // --- Beast ---

  'r': {
    char: 'r',
    name: 'Rat',
    description: 'Aggressive, but surprisingly social.',
    spellDescription: 'IT WILL SERVE.',
    mass: 0.5,
    hp: 2,
    speed: 50,
    acceleration: 400,  // Darty, reactive — changes direction quickly
    damage: 1,
    attackRange: GRID.CELL_SIZE * 1.75,  // Closes a touch tighter than 2u — was missing too often
    aggroRange: GRID.CELL_SIZE * 8,   // 8 units detection
    attackCooldown: 1.0,
    attackWindup: 1.0,  // Minimum 1 second telegraph
    attackType: 'melee',
    decisionInterval: 0.4,  // Moderately smart (reassess every 0.4s)
    color: '#888888',
    grassStealth: true,  // Invisible in tall grass
    affinities: ['beast'],
    tier: 'weak'
  },

  '^': {
    char: '^',
    name: 'Bat',
    description: 'Latches to flesh and drains steadily.',
    spellDescription: 'DRAINS. HANGS ON.',
    mass: 0.4,
    hp: 2,
    speed: 70,
    acceleration: 600,  // Very snappy — bats dart and change direction instantly
    damage: 1,  // Not used for sap attacks
    attackRange: GRID.CELL_SIZE * 1.5,  // 1.5 units (faster, closer)
    aggroRange: GRID.CELL_SIZE * 10,    // 10 units (very aware)
    attackCooldown: 1.2,
    attackWindup: 1.2,  // Telegraph before latching dive
    attackType: 'sap',  // Sapping attack - locks to player
    sapDamage: 1,  // Fixed 1 damage per tick (not scaled by depth)
    sapDamageInterval: 1.0,  // Deal damage every 1 second while sapping
    decisionInterval: 0.4,  // Very smart (fast reactions)
    color: '#444444',
    float: true,  // Flies — unaffected by lava, water, and mud
    movementStyle: 'kiter',
    movementConfig: {
      kiteDistance: GRID.CELL_SIZE * 3,
      retreatThreshold: GRID.CELL_SIZE * 1.5,
      hoverTime: 1.2   // Orbits then dives — the hover is the tell
    },
    packCoordination: true,   // Multiple bats dive in sequence, not simultaneously
    knockbackMultiplier: 0.4, // Barely moves you — it wants to stick, not knock
    affinities: ['beast'],
    tier: 'weak'
  },

  'g': {
    char: 'g',
    name: 'Frog',
    description: 'Zigzag jumper. Snaps its tongue when close.',
    spellDescription: 'WEAK TO SHOCK.',
    mass: 0.5,
    hp: 5,
    speed: 130,
    acceleration: 800,   // High decel so it stops crisply between jumps
    damage: 1,
    attackRange: GRID.CELL_SIZE * 2.5,  // 2.5 units (must get close for tongue)
    aggroRange: GRID.CELL_SIZE * 10,
    attackCooldown: 2.2,
    attackWindup: 0.5,
    attackType: 'tongue',
    decisionInterval: 0.3,
    color: '#44bb44',
    waterAffinity: true,
    swimAffinity: true,  // Bypasses water speed reduction; uses higher jump speed instead
    grassStealth: true,  // Invisible in tall grass
    movementStyle: 'jumper',
    movementConfig: {
      // Land params
      jumpInterval: 0.85,
      jumpSpeed: 130,
      jumpDuration: 0.17,
      zigzagStrength: 0.75,  // Deterministic left-right alternation strength
      // Water params (faster, longer glide)
      waterJumpInterval: 1.3,
      waterJumpSpeed: 190,
      waterJumpDuration: 0.30
    },
    elementalAffinity: {
      immunity: ['wet'],
      weakness: { 'shock': 2.0 }
    },
    affinities: ['beast', 'aquatic'],
    sfx: { hit: 'frog', death: 'frog' },
    tier: 'weak'
  },

  'T': {
    char: 'T',
    name: 'Troll',
    description: 'Slow and steady. Each blow staggers. It does not tire.',
    spellDescription: 'TIRELESS AND SLOW.',
    mass: 2.5,
    hp: 15,
    speed: 23,
    acceleration: 70,   // Very heavy — once moving it's hard to stop
    damage: 4,
    attackRange: GRID.CELL_SIZE * 2.5,  // 2.5 units (heavy reach)
    aggroRange: GRID.CELL_SIZE * 7,     // 7 units (slow to notice)
    attackCooldown: 1.8,
    attackWindup: 1.2,  // Heavy swing - longer telegraph
    windupMovement: 'advance',  // Shambles forward during the long telegraph
    attackType: 'melee',
    decisionInterval: 0.75,  // Dumb brute (very slow reactions)
    color: '#00aa00',
    affinities: ['beast'],
    tier: 'normal'
  },

  'b': {
    char: 'b',
    name: 'Boar',
    description: 'Charges in a straight line. Stuns itself on walls.',
    spellDescription: 'CHARGES. STUNS ON WALL.',
    mass: 1.5,
    hp: 5,
    speed: 45,
    acceleration: 300,
    damage: 2,
    attackRange: GRID.CELL_SIZE * 2,
    aggroRange: GRID.CELL_SIZE * 8,
    attackCooldown: 2.5,
    attackWindup: 1.0,
    attackType: 'melee',
    decisionInterval: 0.6,
    color: '#995533',
    grassStealth: true,
    chargeMechanic: {
      enabled: true,
      chargeSpeed: 160,       // ~2.5× base speed
      chargeDuration: 0.5,    // Max charge duration before losing steam
      chargeWindup: 0.8,      // Telegraph before charge begins
      cooldown: 3.5,          // Time before it can charge again
      wallStunDuration: 1.5,  // Seconds stunned after hitting a solid
      chargeRange: GRID.CELL_SIZE * 7  // Must be within range to initiate charge
    },
    idleBehavior: 'wander',
    elementalAffinity: {
      resistance: { 'stun': 0.6 },
      weakness: { 'freeze': 1.5 }
    },
    affinities: ['beast'],
    tier: 'normal'
  },


  // --- Venom ---

  'P': {
    char: 'P',
    name: 'Poison Spider',
    description: 'Fast and venomous. One bite starts a slow clock.',
    spellDescription: 'VENOM TICKS DOWN.',
    hp: 6,
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
    affinities: ['venom', 'beast'],
    tier: 'weak'
  },

  'Q': {
    char: 'Q',
    name: 'Queen Spider',
    description: 'The egg-bearer. Her death releases a brood.',
    spellDescription: 'BREEDING ON DEATH.',
    hp: 11,
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
    affinities: ['venom', 'beast'],
    tier: 'elite'
  },


  // --- Goo ---

  'o': {
    char: 'o',
    name: 'Slime',
    description: 'Leaves slime that slows and hinders.',
    spellDescription: 'WEAK TO BLADES.',
    hp: 3,
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
    elementalAffinity: { immunity: ['slime'], weakness: { freeze: 2.0 } },
    freezePermanent: true,
    affinities: ['goo'],
    sfx: { hit: 'goo_hit', death: ['goo_death_1', 'goo_death_2'] },
    tier: 'weak'
  },

  'M': {
    char: 'M',
    name: 'Giant Slime',
    description: 'A bloated mother-slime. Splits when struck and reabsorbs its young.',
    spellDescription: 'SPLITS ON HIT — CHILDREN REFORM — SPEWS GOO.',
    hp: 20,
    speed: 30,
    acceleration: 50,
    damage: 2,
    attackRange: GRID.CELL_SIZE * 2.5,
    aggroRange: GRID.CELL_SIZE * 10,
    attackCooldown: 1.4,
    attackWindup: 1.0,
    windupImmune: true,
    attackType: 'melee',
    decisionInterval: 0.7,
    color: '#00cc00',
    splitOnDamage: {
      enabled: true,
      spawnChar: 'o',
      minHpToSplit: 2,        // Won't split below this HP
      maxActiveChildren: 4,   // Cap concurrent split children
      reformDelay: 4.0,       // Children spend this long pursuing player before returning
      reformValue: 2          // HP restored to parent per absorbed child
    },
    gooSpewCone: {
      enabled: true,
      damageThreshold: 5,     // Trigger after this much cumulative damage
      chargeUpTime: 1.2,      // Telegraph windup before spew
      coneAngle: Math.PI * 0.6,  // ~108° spread
      blobCount: 7,
      blobSpeed: 110,
      blobDecel: 2.0
    },
    elementalAffinity: { immunity: ['slime'], weakness: { freeze: 2.0, blade: 2.0 } },
    freezePermanent: true,
    affinities: ['goo'],
    sfx: { hit: 'goo_hit', death: ['goo_death_1', 'goo_death_2'] },
    tier: 'boss'
  },


  // --- Humanoid ---

  'G': {
    char: 'G',
    name: 'Goblin',
    description: 'Scavenges weapons before closing in. Steals stronger gear off the ground.',
    spellDescription: 'WANTS YOUR LOOT.',
    hp: 5,
    speed: 40,
    damage: 2,
    attackRange: GRID.CELL_SIZE * 5,  // 5 units (ranged)
    aggroRange: GRID.CELL_SIZE * 10,  // 10 units (ranged awareness)
    attackCooldown: 1.5,
    attackWindup: 1.0,  // Minimum 1 second telegraph
    attackType: 'ranged',
    projectileType: 'arrow',
    movementStyle: 'keeper',  // Maintains bow range; swapped to chaser when a melee weapon is equipped
    decisionInterval: 0.45,  // Moderately smart
    color: '#00aa00',
    itemUsage: {
      enabled: true,
      canPickup: true,
      pickupRange: GRID.CELL_SIZE * 2,
      // Goblins covet any weapon, plus health pots. Pickup priority compares
      // weapon damage against current loadout — see evaluateItemPickup.
      preferredItems: [')', '†', '⫯', '⊤', '↑', '↾', 'H'],
      useRange: GRID.CELL_SIZE * 7,
      useCooldown: 2.0,
      maxItems: 1,
      dropOnDeath: true,
      useConsumablesAt: 0.5
    },
    // When spawned as a Brute follower, leaderRef gets set on the instance and
    // this orbits the leader at formationRadius. Standalone goblins have no
    // leaderRef so the block is inert.
    followLeader: {
      enabled: true,
      formationRadius: GRID.CELL_SIZE * 3,
      nearPlayerRange: GRID.CELL_SIZE * 10,
      orbitSpeed: 1.2
    },
    // Per-instance random spawn loadout (RoomGenerator rolls this for standalone
    // goblins so they appear with assorted basic weapons).
    spawnEquipment: {
      chance: 0.55,
      weapons: ['†', '⊤', '↑', '↾', '⫯', ')']
    },
    affinities: ['humanoid'],
    tier: 'normal'
  },

  'B': {
    char: 'B',
    name: 'Goblin Brute',
    description: 'A hulking goblin chief. Bashes with a stone hammer and calls his pack.',
    spellDescription: 'RALLIES. CHARGES. SMASHES.',
    mass: 2,
    hp: 22,
    speed: 22,                       // Slow — the "player is distant" trigger fires often
    acceleration: 70,
    damage: 3,
    attackRange: GRID.CELL_SIZE * 2.5,
    aggroRange: GRID.CELL_SIZE * 12,
    attackCooldown: 1.8,
    attackWindup: 1.2,
    windupMovement: 'advance',
    attackType: 'melee',
    decisionInterval: 0.7,
    color: '#117711',
    chargeMechanic: {
      enabled: true,
      chargeSpeed: 130,              // Bash is the bursty moment
      chargeWindup: 1.0,             // Big telegraph — readable
      chargeDuration: 0.55,
      cooldown: 5.0,
      wallStunDuration: 1.6,
      chargeRange: GRID.CELL_SIZE * 5
    },
    rallyCall: {
      enabled: true,
      triggerDistance: GRID.CELL_SIZE * 10,  // Player must be > this from chief
      cooldown: 6.0,
      indicatorDuration: 1.0,
      indicatorChar: '!',
      indicatorColor: '#ff3333',
      followerBoostMultiplier: 1.3,  // +30% speed
      followerBoostDuration: 2.0
    },
    elementalAffinity: { weakness: { stun: 1.5 } },
    affinities: ['humanoid'],
    tier: 'boss'
  },

  'O': {
    char: 'O',
    name: 'Ogre',
    description: 'A weapon-toting brute. Hits harder than it looks.',
    spellDescription: 'BIG. HITS HARD.',
    mass: 2,
    hp: 11,
    speed: 25,
    acceleration: 80,   // Heavy momentum — slow to start and slow to turn
    damage: 3,
    attackRange: GRID.CELL_SIZE * 2.5,  // 2.5 units (heavy reach)
    aggroRange: GRID.CELL_SIZE * 7,     // 7 units (slower reaction)
    attackCooldown: 1.5,
    attackWindup: 1.2,  // Slow heavy attack - longer telegraph
    windupMovement: 'advance',  // Lumbers forward during telegraph
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
    affinities: ['humanoid'],
    tier: 'normal'
  },

  'A': {
    char: 'A',
    name: 'Archer Goblin',
    description: 'Keeps its distance and fires. Always carries a spare.',
    spellDescription: 'STAYS FAR. FIRES.',
    hp: 7,
    speed: 35,
    damage: 2,
    attackRange: GRID.CELL_SIZE * 6,  // 6 units (ranged)
    aggroRange: GRID.CELL_SIZE * 10,  // 10 units
    attackCooldown: 1.8,
    attackWindup: 1.0,  // Minimum 1 second telegraph
    attackType: 'ranged',
    projectileType: 'arrow',
    movementStyle: 'keeper',  // Maintains arrow range; flees if player closes to melee
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
    affinities: ['humanoid'],
    tier: 'normal'
  },

  'L': {
    char: 'L',
    name: 'Looter',
    description: 'Takes what it finds. Fights with whatever that is.',
    spellDescription: 'LOOTS ON SIGHT.',
    hp: 6,
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
    affinities: ['humanoid'],
    tier: 'normal'
  },

  'd': {
    char: 'd',
    name: 'Duelist',
    description: 'Advances and retreats. Punishes reckless attacks.',
    spellDescription: 'WATCH THE FLASH.',
    hp: 7,
    speed: 44,
    acceleration: 360,
    mass: 0.85,
    damage: 3,
    attackRange: GRID.CELL_SIZE * 2,
    aggroRange: GRID.CELL_SIZE * 9,
    attackCooldown: 1.6,
    attackWindup: 1.0,
    windupMovement: 'advance',  // Steps forward on the swing — closes the gap it created
    attackType: 'melee',
    decisionInterval: 0.30,
    color: '#99aacc',
    movementStyle: 'keeper',
    movementConfig: {
      preferredRange: GRID.CELL_SIZE * 4,  // Wider: retreat creates the gap the riposte crosses
      rangeTolerance: GRID.CELL_SIZE * 1.0
    },
    parryMechanic: {
      enabled: true,
      parryArcDegrees: 100,    // Narrower than original — angling matters
      parryDuration: 0.45,     // Shorter window — less forgiving
      parryCooldown: 2.0,      // More frequent; safe windows are denser too
      parryWindup: 0.25,
      reflectDamage: true,
      counterAttack: true,
      parryColor: '#ffffff',
      chargeOnParry: true,     // Immediately enters charge windup after a successful parry
    },
    chargeMechanic: {
      enabled: true,
      chargeSpeed: 140,        // ~3× base — fast, but not freight-train heavy
      chargeWindup: 0.35,      // Brief en-garde before the lunge
      chargeDuration: 0.4,     // A lunge, not a sustained push
      cooldown: 3.0,
      wallStunDuration: 1.2,
      chargeRange: GRID.CELL_SIZE * 6,
      initialDelay: 1.2
    },
    idleBehavior: 'wander',
    knockbackMultiplier: 0.6,  // Precision fighter — stays in your face, no escape
    elementalAffinity: {
      resistance: { 'stun': 0.4 }  // Reduced: sophisticated ranged play is rewarded
    },
    affinities: ['humanoid'],
    tier: 'normal'
  },

  'W': {
    char: 'W',
    name: 'Wizard',
    description: 'Casts from a distance. Patient and very precise.',
    spellDescription: 'PRECISE FROM AFAR.',
    hp: 8,
    speed: 30,
    damage: 3,
    attackRange: GRID.CELL_SIZE * 8,  // 8 units (longest range)
    aggroRange: GRID.CELL_SIZE * 12,  // 12 units (magical senses)
    attackCooldown: 2.5,
    attackWindup: 1.0,
    windupMovement: 'retreat',  // Backs away while casting — hard to close on
    attackType: 'magic',
    movementStyle: 'keeper',
    movementConfig: {
      preferredRange: GRID.CELL_SIZE * 7,
      rangeTolerance: GRID.CELL_SIZE * 2
    },
    decisionInterval: 0.3,
    color: '#8800ff',
    affinities: ['humanoid'],
    tier: 'elite'
  },

  'K': {
    char: 'K',
    name: 'Knight',
    description: 'Armed, armored, and trained to heal.',
    spellDescription: 'ARMORED. HAS AN ITEM.',
    mass: 1.5,
    hp: 13,
    speed: 33,
    acceleration: 120,  // Heavy armor — not as snappy as light enemies
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
    affinities: ['humanoid'],
    tier: 'elite'
  },

  'a': {
    char: 'a',
    name: 'Shaman',
    description: 'Buffs nearby allies. It flees toward its kin, not away from you.',
    spellDescription: 'EMPOWERS ITS KIN.',
    hp: 5,              // Glass cannon once isolated
    speed: 55,          // Fast enough to actually reach allies before you catch it
    acceleration: 400,  // Snappy — hard to corner
    mass: 0.6,          // Light — knockback disrupts its positioning
    damage: 0,
    attackRange: 0,
    aggroRange: GRID.CELL_SIZE * 12,  // Activates early — starts fleeing before you close in
    attackCooldown: 999,
    attackWindup: 2.0,  // Required ≥1.0; irrelevant (never fires)
    attackType: 'melee',
    decisionInterval: 0.3,
    color: '#cc8800',  // More saturated — reads as "important"
    movementStyle: 'keeper',
    movementConfig: {
      preferredRange: GRID.CELL_SIZE * 9,  // Stays at far edge — behind its pack
      rangeTolerance: GRID.CELL_SIZE * 1   // Tight: always actively repositioning
    },
    buffMechanic: {
      enabled: true,
      buffRadius: GRID.CELL_SIZE * 4,   // Tighter — must physically reach the cluster
      buffCooldown: 4.0,                // Faster cycle = more visible danger windows
      buffWindup: 0.9,
      buffs: ['speed', 'damage'],
      speedMultiplier: 1.6,
      damageMultiplier: 1.5,
      buffDuration: 3.5
    },
    spawning: {
      enabled: true,
      spawnChar: 'r',           // Weak ally on death — the "last rites" pulse
      spawnCooldown: 9999,      // Never spawns during life
      maxSpawns: 1,
      maxLifetimeSpawns: 1,
      spawnRange: GRID.CELL_SIZE * 1.5,
      spawnWindup: 0,
      spawnCount: 1,
      spawnOnDeath: true
    },
    idleBehavior: 'wander',
    knockbackMultiplier: 1.8,  // Light frame — big knockback separates it from allies
    elementalAffinity: {
      weakness: { 'freeze': 2.0 }  // Freeze it mid-run to interrupt the pulse
    },
    affinities: ['humanoid'],
    tier: 'elite'
  },


  // --- Aberration ---

  'm': {
    char: 'm',
    name: 'Mimic',
    description: 'Disguised as a floor item. Re-disguises between attacks.',
    spellDescription: 'WATCH FOR MOVEMENT.',
    mass: 0.9,
    hp: 6,
    speed: 75,
    acceleration: 550,  // Explosive direction changes — hard to track mid-lunge
    damage: 4,
    attackRange: GRID.CELL_SIZE * 2,
    aggroRange: GRID.CELL_SIZE * 12,  // Watches from far — it chose its spot
    attackCooldown: 3.8,  // Long cooldown: the rhythm IS the window
    attackWindup: 1.2,
    windupMovement: 'stop',  // Freezes during windup — looks like a static object
    attackType: 'melee',
    decisionInterval: 0.25,
    color: '#cc8800',
    mimicMechanic: {
      enabled: true,
      revealRadius: GRID.CELL_SIZE * 2.0,   // Tighter — rewards players who pause early
      revealFlashDuration: 0.35,
      disguiseChars: ['⊞'],                   // Always looks like a chest
      redisguiseCooldown: {
        reDisguiseDistance: GRID.CELL_SIZE * 8,  // Player must back off 8 cells
        redisguiseDuration: 2.2                  // Time at distance before re-disguise fires
      }
    },
    movementStyle: 'ambusher',
    movementConfig: {
      wakeRadius: GRID.CELL_SIZE * 2.0,
      burstSpeed: 165,    // Sharp initial lunge
      burstDuration: 0.3  // Stops hard — mimics a stationary object between lunges
    },
    idleBehavior: 'stationary',
    elementalAffinity: {
      weakness: { 'stun': 2.0 },              // Shapeshifter's weakness: locked in one form
      resistance: { 'burn': 0.5, 'freeze': 0.5 }  // Adapts to temperature
    },
    affinities: ['aberration'],
    tier: 'elite'
  },


  // ============================================================
  // RED ZONE — fire / scorched
  // ============================================================

  // --- Fire ---

  'E': {
    char: 'E',
    name: 'Ember Sprite',
    description: 'A small flame-spirit. Easy to miss, hard to ignore.',
    spellDescription: 'SMALL FIRE. FAST.',
    mass: 0.5,
    hp: 3,
    speed: 40,
    damage: 2,
    attackRange: GRID.CELL_SIZE * 2,  // 2 units (melee)
    aggroRange: GRID.CELL_SIZE * 7,   // 7 units
    attackCooldown: 3,
    attackWindup: 1,
    attackType: 'fire',
    decisionInterval: 0.3,  // Fast reactions
    color: '#ffaa44',
    float: true,
    lavaImmune: true,
    movementStyle: 'keeper',
    movementConfig: {
      preferredRange: GRID.CELL_SIZE * 3,
      rangeTolerance: GRID.CELL_SIZE * 1
    },
    deathExplosion: {
      enabled: true,
      projectileCount: 4,
      projectileType: 'fire',
      speed: 70,
      damage: 1,
      deathDelay: 0.8
    },
    elementalAffinity: {
      immunity: ['burn'],
      weakness: { 'freeze': 2.0, 'wet': 1.8 }
    },
    affinities: ['fire'],
    tier: 'weak'
  },

  'l': {
    char: 'l',
    name: 'Magma Slug',
    description: 'Orbits prey in tightening fire rings. Kill it fast, but not here.',
    spellDescription: 'STEP INSIDE THE RING.',
    mass: 1.5,
    hp: 5,
    speed: 38,           // Up from 25 — needs lateral speed to maintain orbit arc
    acceleration: 180,   // Low-ish: momentum-heavy turns, arc has visible inertia
    damage: 2,
    attackRange: GRID.CELL_SIZE * 2,
    aggroRange: GRID.CELL_SIZE * 8,
    attackCooldown: 2.2,
    attackWindup: 1.2,
    windupMovement: 'advance',  // Crashes inward during telegraph — visible commitment
    attackType: 'fire',
    decisionInterval: 0.5,
    color: '#ff4400',
    lavaImmune: true,
    movementStyle: 'kiter',
    movementConfig: {
      kiteDistance: GRID.CELL_SIZE * 3.2,       // Tight orbit: 3 cells, close enough to threaten
      retreatThreshold: GRID.CELL_SIZE * 2.0,   // Retreats if player steps inside 2 cells
      hoverTime: 1.8                            // Commits to orbit, then dashes inward
    },
    trailMechanic: {
      enabled: true,
      trailType: 'fire',
      trailInterval: 0.5,       // Fewer, deliberate puddles — ring segments, not smear
      trailDuration: 5.0,       // Lasts one full orbit before fading
      trailRadius: GRID.CELL_SIZE * 1.0
    },
    deathExplosion: {
      enabled: true,
      projectileCount: 6,
      projectileType: 'fire',
      speed: 90,
      damage: 1,
      deathDelay: 0.8
    },
    elementalAffinity: {
      immunity: ['burn'],
      weakness: { 'freeze': 2.5, 'wet': 1.8 }
    },
    affinities: ['fire'],
    tier: 'weak'
  },

  'p': {
    char: 'p',
    name: 'Pyroclast',
    description: 'Lobs molten rocks in rapid bursts. Erupts after long silence.',
    spellDescription: 'BURST ROCKS. KNOW THE RELOAD.',
    mass: 0.8,
    hp: 5,
    speed: 32,
    acceleration: 220,
    damage: 2,
    attackRange: GRID.CELL_SIZE * 6,
    aggroRange: GRID.CELL_SIZE * 9,
    attackCooldown: 4.5,   // Longer cycle: windup + burst + reload gap
    attackWindup: 1.6,     // Extended telegraph for burst preparation
    attackType: 'ranged',
    projectileType: 'rock',
    movementStyle: 'keeper',
    movementConfig: {
      preferredRange: GRID.CELL_SIZE * 5,
      rangeTolerance: GRID.CELL_SIZE * 2
    },
    decisionInterval: 0.5,
    color: '#cc6622',
    // ⚠️ NEW MECHANIC (burstFireMechanic — fires 3 rocks with 0.25s delays):
    // burstFireMechanic: { enabled: true, projectileCount: 3, projectileDelay: 0.25, reloadCooldown: 2.0 }
    elementalAffinity: {
      immunity: ['burn'],
      weakness: { 'freeze': 1.5, 'wet': 1.3 }
    },
    affinities: ['fire'],
    tier: 'weak'
  },

  'F': {
    char: 'F',
    name: 'Fire Elemental',
    description: 'Flame given purpose. Burns everything including you.',
    spellDescription: 'FLAME WITH INTENT.',
    hp: 9,
    speed: 35,
    damage: 3,
    attackRange: GRID.CELL_SIZE * 5,  // 5 units (ranged fire)
    aggroRange: GRID.CELL_SIZE * 9,   // 9 units
    attackCooldown: 1.5,
    attackWindup: 1.0,  // Minimum 1 second telegraph
    attackType: 'fire',
    movementStyle: 'keeper',  // Stays at flame range; too close and it backs off
    decisionInterval: 0.4,
    color: '#ff4400',
    elementalAffinity: {
      immunity: ['burn'],
      resistance: { 'stun': 0.5, 'acid': 0.7 },
      weakness: { 'freeze': 2.0, 'wet': 1.5 }
    },
    affinities: ['fire'],
    tier: 'normal'
  },


  // --- Beast ---

  'f': {
    char: 'f',
    name: 'Fire Bat',
    description: 'Wreathed in flame. Spits fire from range, leaves a trail overhead.',
    spellDescription: 'SPITS FIRE. QUICK.',
    mass: 0.6,
    hp: 5,
    speed: 55,
    damage: 1,
    attackRange: GRID.CELL_SIZE * 4,
    aggroRange: GRID.CELL_SIZE * 8,
    attackCooldown: 2,
    attackWindup: 1.2,
    attackType: 'fire',
    movementStyle: 'kiter',
    movementConfig: {
      kiteDistance: GRID.CELL_SIZE * 4,
      retreatThreshold: GRID.CELL_SIZE * 2.5,
      hoverTime: 1.5
    },
    acceleration: 500,
    decisionInterval: 0.3,
    color: '#ff6622',
    float: true,
    lavaImmune: true,
    trailMechanic: {
      enabled: true,
      trailType: 'fire',
      trailInterval: 0.6,
      trailDuration: 3.0,
      trailRadius: GRID.CELL_SIZE * 0.7
    },
    deathExplosion: {
      enabled: true,
      projectileCount: 4,
      projectileType: 'fire',
      speed: 75,
      damage: 1,
      deathDelay: 0.8
    },
    elementalAffinity: {
      immunity: ['burn'],
      weakness: { 'freeze': 1.8, 'wet': 1.5 }
    },
    affinities: ['beast', 'fire'],
    tier: 'weak'
  },

  't': {
    char: 't',
    name: 'Tortoise',
    description: 'Hides as a rock until you get close. Retreats into its shell when struck. In lava, breathes fire.',
    spellDescription: 'SHELL. FIRE. LAVA.',
    mass: 2.0,
    hp: 8,
    speed: 55,
    acceleration: 120,
    damage: 3,
    attackRange: GRID.CELL_SIZE * 3,
    aggroRange: GRID.CELL_SIZE * 5,
    attackCooldown: 2.0,
    attackWindup: 1.0,  // Fixed: was 0.8, below minimum 1.0
    attackType: 'melee',
    decisionInterval: 0.6,
    color: '#886633',
    grassStealth: true,
    shellCamouflage: true,
    lavaImmune: true,
    movementStyle: 'ambusher',
    movementConfig: {
      wakeRadius: GRID.CELL_SIZE * 4,
      burstSpeed: 120,  // Up from 100 — ~2.2× base, distinct from Living Rock
      burstDuration: 0.6
    },
    idleBehavior: 'stationary',
    elementalAffinity: {
      immunity: ['burn'],
      resistance: { 'physical': 0.4 },
      weakness: { 'freeze': 1.5, 'wet': 1.5 }
    },
    affinities: ['beast', 'fire'],
    tier: 'normal'
  },


  // --- Gemstone ---

  '0': {
    char: '0',
    name: 'Living Rock',
    description: 'Indistinguishable from scenery — until it moves. Charges like a boulder; stuns on walls.',
    spellDescription: 'STONE THAT MOVES.',
    mass: 4.0,
    hp: 11,
    speed: 50,
    acceleration: 40,  // Lower: harder to stop, punishes impatience
    damage: 4,
    attackRange: GRID.CELL_SIZE * 2,
    aggroRange: GRID.CELL_SIZE * 8,  // Wider: wakes earlier
    attackCooldown: 2.5,
    attackWindup: 1.2,
    windupMovement: 'advance',
    attackType: 'melee',
    decisionInterval: 0.8,
    color: '#996633',
    grassStealth: true,   // Hides in tall grass until triggered
    movementStyle: 'ambusher',
    movementConfig: {
      wakeRadius: GRID.CELL_SIZE * 3,
      burstSpeed: 160,  // 3.2× base — burst into chargeMechanic territory
      burstDuration: 0.9
    },
    idleBehavior: 'stationary',
    chargeMechanic: {
      enabled: true,
      chargeSpeed: 160,
      chargeWindup: 0.6,   // Quick — commits to charge fast after reveal
      chargeDuration: 1.2, // Sustained push across the room
      cooldown: 4.0,
      wallStunDuration: 2.0,  // Longer than Boar — heavier stone = longer vulnerability
      chargeRange: GRID.CELL_SIZE * 5
    },
    deathExplosion: {
      enabled: true,
      projectileCount: 3,
      projectileType: 'rock',
      speed: 60,
      damage: 1,
      deathDelay: 0.8
    },
    elementalAffinity: {
      resistance: { 'physical': 0.5, 'poison': 0.8, 'burn': 0.7 },
      weakness: { 'magic': 1.5 }
    },
    affinities: ['gemstone'],
    tier: 'normal'
  },

  'R': {
    char: 'R',
    name: 'Rockwarden',
    description: 'Sleeps as a boulder until you cross it. Charges like a landslide. On death, it erupts.',
    spellDescription: 'MAGIC SHATTERS IT.',
    mass: 5.0,
    hp: 18,
    speed: 22,
    acceleration: 50,
    damage: 6,
    attackRange: GRID.CELL_SIZE * 3,
    aggroRange: GRID.CELL_SIZE * 10,
    attackCooldown: 2.2,
    attackWindup: 1.6,
    windupMovement: 'advance',
    attackType: 'melee',
    decisionInterval: 0.9,
    color: '#aa8855',
    shellCamouflage: true,   // Indistinguishable from '0' rock object when stationary
    movementStyle: 'ambusher',
    movementConfig: {
      wakeRadius: GRID.CELL_SIZE * 5,
      burstSpeed: 70,
      burstDuration: 0.9
    },
    idleBehavior: 'stationary',
    chargeMechanic: {
      enabled: true,
      chargeSpeed: 200,          // ~9× base — genuine freight-train moment
      chargeDuration: 0.65,      // Crosses real estate before stopping
      chargeWindup: 1.8,         // Long shudder telegraph — boss weight earns it
      cooldown: 5.0,
      wallStunDuration: 2.5,     // Generous safe window — primary counterplay
      chargeRange: GRID.CELL_SIZE * 10,
      initialDelay: 1.2
    },
    deathExplosion: {
      enabled: true,
      projectileCount: 8,
      projectileType: 'rock',
      speed: 110,
      damage: 2,
      deathDelay: 0.8
    },
    elementalAffinity: {
      resistance: { 'physical': 0.5, 'burn': 0.6 },
      weakness: { 'magic': 2.0, 'wet': 1.5 }
    },
    affinities: ['gemstone'],
    tier: 'boss'
  },


  // --- Humanoid ---

  'k': {
    char: 'k',
    name: 'Miner',
    description: 'Heavy pickaxe blow. Sends you flying into hazards.',
    spellDescription: 'HIGH KNOCKBACK HIT.',
    mass: 2.0,
    hp: 7,
    speed: 28,
    acceleration: 100,
    damage: 4,
    attackRange: GRID.CELL_SIZE * 2.5,
    aggroRange: GRID.CELL_SIZE * 7,
    attackCooldown: 1.8,
    attackWindup: 1.2,
    windupMovement: 'advance',
    attackType: 'melee',
    decisionInterval: 0.6,
    color: '#888866',
    knockbackMultiplier: 3.5,   // Very high knockback on hit
    isImpact: true,             // Heavy blow — bypasses staff block
    elementalAffinity: {
      resistance: { 'physical': 0.6, 'stun': 0.8 },
      weakness: { 'magic': 1.5 }
    },
    affinities: ['humanoid'],
    tier: 'normal'
  },


  // --- Dragon ---

  'D': {
    char: 'D',
    name: 'Dragon',
    description: 'Ancient. Breathes fire from far away. It waited for you.',
    spellDescription: 'IT HAS WAITED.',
    hp: 20,
    speed: 30,
    damage: 5,
    attackRange: GRID.CELL_SIZE * 7,  // 7 units (long range fire)
    aggroRange: GRID.CELL_SIZE * 12,  // 12 units (boss awareness)
    attackCooldown: 2.0,
    attackWindup: 1.5,
    windupMovement: 'stop',  // Holds still for the full fire breath — readable commitment
    attackType: 'fire',
    movementStyle: 'keeper',
    decisionInterval: 0.3,
    color: '#ff0000',
    lavaImmune: true,
    trailMechanic: {
      enabled: true,
      trailType: 'fire',
      trailInterval: 0.4,
      trailDuration: 3.5,
      trailRadius: GRID.CELL_SIZE * 0.9
    },
    affinities: ['dragon', 'fire'],
    tier: 'boss'
  },


  // ============================================================
  // CYAN ZONE — ice / frozen
  // ============================================================

  // --- Ice ---

  'c': {
    char: 'c',
    name: 'Breeze Wisp',
    description: 'Its touch pushes you, not wounds you. Groups chain-push.',
    spellDescription: 'PUSHES, NOT STABS.',
    mass: 0.3,
    hp: 3,
    speed: 55,           // Fast enough to orbit and reposition between pushes
    acceleration: 600,   // Snappy — ghostly direction changes
    damage: 1,
    attackRange: GRID.CELL_SIZE * 2,
    aggroRange: GRID.CELL_SIZE * 10,  // Wide: pack needs to form from across the room
    attackCooldown: 2.0,  // Longer: each push is an event, not spam
    attackWindup: 1.2,    // Wisp brightens before releasing gust
    attackType: 'melee',
    decisionInterval: 0.35,
    color: '#aaeeff',
    movementStyle: 'kiter',
    movementConfig: {
      kiteDistance: GRID.CELL_SIZE * 3.5,    // Orbiting radius — just outside melee
      retreatThreshold: GRID.CELL_SIZE * 2,  // Scoots back if player rushes
      hoverTime: 1.5                         // Hover, then commit to push rush
    },
    packCoordination: true,   // Wisps triangulate from different angles — chain-push emerges naturally
    knockbackMultiplier: 5.0,
    isImpact: true,           // Wind can't be blocked by staff
    float: true,              // Stands on ice tiles it pushes you toward
    elementalAffinity: {
      immunity: ['freeze'],
      weakness: { 'burn': 2.0 }
    },
    affinities: ['ice'],
    tier: 'weak'
  },

  'X': {
    char: 'X',
    name: 'Ice Wraith',
    description: 'A pale ghost of cold. Latches on and chills from within.',
    spellDescription: 'CLINGS AND CHILLS.',
    mass: 0.5,
    hp: 3,
    speed: 45,
    acceleration: 450,  // Light and ghostly — quick direction changes
    damage: 1,
    attackRange: GRID.CELL_SIZE * 1.5,  // 1.5 units
    aggroRange: GRID.CELL_SIZE * 8,     // 8 units
    attackCooldown: 1.2,
    attackWindup: 1.0,  // Fixed: was 0.8, below minimum 1.0
    attackType: 'sap',  // Freezing touch - locks to player
    sapDamage: 1,
    sapDamageInterval: 1.2,  // Slower than bat
    decisionInterval: 0.4,
    color: '#88ddff',
    float: true,  // Ghostly — drifts over ground hazards
    packCoordination: true,  // Multiple wraiths coordinate latching to exhaust the player
    elementalAffinity: {
      immunity: ['freeze'],
      weakness: { 'burn': 2.0, 'magic': 1.5 }
    },
    affinities: ['ice', 'undead'],
    tier: 'weak'
  },

  'I': {
    char: 'I',
    name: 'Ice Golem',
    description: 'A walking frost construct. Resistant to most things.',
    spellDescription: 'COLD. RESISTANT.',
    mass: 3,
    hp: 13,
    speed: 20,
    acceleration: 60,   // Glacial inertia — an ice golem moving is hard to stop
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
    affinities: ['ice'],
    tier: 'normal'
  },

  'U': {
    char: 'U',
    name: 'Frozen Construct',
    description: 'An ice shell with purpose. Immune to cold and most tricks.',
    spellDescription: 'IMMUNE TO COLD.',
    mass: 2,
    hp: 9,
    speed: 22,
    acceleration: 75,   // Heavy construct — deliberate movement
    damage: 3,
    attackRange: GRID.CELL_SIZE * 2,  // 2 units (melee)
    aggroRange: GRID.CELL_SIZE * 8,   // 8 units
    attackCooldown: 1.6,
    attackWindup: 1.2,
    windupMovement: 'advance',
    attackType: 'melee',
    decisionInterval: 0.6,
    color: '#99ddff',
    trailMechanic: {
      enabled: true,
      trailType: 'ice',
      trailInterval: 0.5,
      trailDuration: 5.5,
      trailRadius: GRID.CELL_SIZE * 1.0
    },
    deathExplosion: {
      enabled: true,
      projectileCount: 5,
      projectileType: 'freeze',
      speed: 60,
      damage: 1,
      spreadAngle: 360,
      deathDelay: 0.8
    },
    elementalAffinity: {
      immunity: ['freeze', 'poison'],
      resistance: { 'physical': 0.5, 'stun': 0.8 },
      weakness: { 'burn': 2.0, 'magic': 1.3 }
    },
    affinities: ['ice'],
    tier: 'normal'
  },

  'u': {
    char: 'u',
    name: 'Glacier Crab',
    description: 'Lays ice as it moves. Charges across its own frozen ground. Shatters into shards on death.',
    spellDescription: 'ICE TRAIL. ICE SHARDS.',
    mass: 2.0,
    hp: 8,
    speed: 28,            // Slow baseline — danger only when charging
    acceleration: 90,     // Low: heavy-body feel between charges
    damage: 2,
    attackRange: GRID.CELL_SIZE * 2.5,
    aggroRange: GRID.CELL_SIZE * 8,
    attackCooldown: 2.0,
    attackWindup: 1.2,
    windupMovement: 'stop',
    attackType: 'melee',
    decisionInterval: 0.65,
    color: '#88ccff',
    movementStyle: 'chaser',   // Between charges: simple pursuit, no kiting
    idleBehavior: 'stationary',
    chargeMechanic: {
      enabled: true,
      chargeSpeed: 110,         // ~4× base speed — perceptibly faster, distinct from Boar
      chargeDuration: 0.6,
      chargeWindup: 0.6,        // Quicker than Boar — scarier in tight rooms
      cooldown: 5.0,
      wallStunDuration: 2.0,    // Longer than Boar — heavier body, bigger payoff
      chargeRange: GRID.CELL_SIZE * 7,
      initialDelay: 0.8
    },
    trailMechanic: {
      enabled: true,
      trailType: 'ice',
      trailInterval: 0.4,
      trailDuration: 7.0,       // Long-lived — accumulates as fight drags on
      trailRadius: GRID.CELL_SIZE * 1.1
    },
    deathExplosion: {
      enabled: true,
      projectileCount: 6,
      projectileType: 'freeze',
      speed: 65,
      damage: 1,
      spreadAngle: 360,
      deathDelay: 0.8
    },
    elementalAffinity: {
      immunity: ['freeze'],
      weakness: { 'burn': 2.0, 'stun': 1.5 }
    },
    affinities: ['ice', 'aquatic'],
    tier: 'normal'
  },


  // --- Beast ---

  'w': {
    char: 'w',
    name: 'Frost Wolf',
    description: 'A pack hunter. It waits for its mates before striking.',
    spellDescription: 'HUNTS WITH OTHERS.',
    hp: 4,
    speed: 60,
    damage: 2,
    attackRange: GRID.CELL_SIZE * 2,  // 2 units (melee)
    aggroRange: GRID.CELL_SIZE * 9,   // 9 units (keen senses)
    attackCooldown: 1.2,
    attackWindup: 1,
    attackType: 'melee',
    decisionInterval: 0.3,  // Pack hunter intelligence
    color: '#aaddff',
    movementStyle: 'kiter',
    movementConfig: {
      kiteDistance: GRID.CELL_SIZE * 4,     // Maintain 4 units from player
      retreatThreshold: GRID.CELL_SIZE * 3, // Retreat if player within 3 units during hover
      hoverTime: 2.5                        // Hover for 2.5s before committing to attack rush
    },
    packCoordination: true,  // Shares detection & memory marks with all wolves in room
    elementalAffinity: {
      immunity: ['freeze'],
      weakness: { 'burn': 1.8 }
    },
    affinities: ['beast', 'ice'],
    tier: 'weak'
  },

  'y': {
    char: 'y',
    name: 'Yeti',
    description: 'Massive and relentless. Its fists freeze on contact.',
    spellDescription: 'FISTS THAT FREEZE.',
    mass: 2.5,
    hp: 13,
    speed: 18,
    acceleration: 65,   // Massive inertia — slow to start, hard to stop
    damage: 4,
    attackRange: GRID.CELL_SIZE * 2.5,  // 2.5 units (heavy reach)
    aggroRange: GRID.CELL_SIZE * 7,     // 7 units
    attackCooldown: 2.2,
    attackWindup: 1.2,  // Slow heavy attacks
    windupMovement: 'advance',  // Crashes forward during telegraph
    attackType: 'melee',
    decisionInterval: 0.7,  // Slow thinker
    color: '#eeffff',
    chargeMechanic: {
      enabled: true,
      chargeSpeed: 100,
      chargeWindup: 1.0,
      chargeDuration: 0.7,
      cooldown: 5.0,
      wallStunDuration: 2.0,
      chargeRange: GRID.CELL_SIZE * 6
    },
    trailMechanic: {
      enabled: true,
      trailType: 'ice',
      trailInterval: 0.6,
      trailDuration: 5.0,
      trailRadius: GRID.CELL_SIZE * 1.0
    },
    elementalAffinity: {
      immunity: ['freeze'],
      resistance: { 'physical': 0.6, 'stun': 0.7 },
      weakness: { 'burn': 2.0 }
    },
    affinities: ['beast', 'ice'],
    tier: 'normal'
  },


  // --- Humanoid ---

  'C': {
    char: 'C',
    name: 'Cryomancer',
    description: 'A caster of ice. Summons wraiths while it still lives.',
    spellDescription: 'CASTS AND SUMMONS.',
    hp: 8,
    speed: 28,
    damage: 3,
    attackRange: GRID.CELL_SIZE * 6,  // 6 units (ranged ice magic)
    aggroRange: GRID.CELL_SIZE * 10,  // 10 units
    attackCooldown: 2,
    attackWindup: 1,
    attackType: 'magic',
    movementStyle: 'kiter',
    movementConfig: {
      kiteDistance: GRID.CELL_SIZE * 5,
      retreatThreshold: GRID.CELL_SIZE * 3,
      hoverTime: 2.5
    },
    decisionInterval: 0.35,
    color: '#66ccff',
    trailMechanic: {
      enabled: true,
      trailType: 'ice',
      trailInterval: 0.55,
      trailDuration: 5.0,
      trailRadius: GRID.CELL_SIZE * 0.9
    },
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
    affinities: ['ice', 'humanoid'],
    tier: 'elite'
  },


  // --- Fire ---

  'x': {
    char: 'x',
    name: 'Steam Specter',
    description: 'Dives close to burst steam, then retreats through the cloud.',
    spellDescription: 'CLOUD LINGERS. DODGE OUT.',
    mass: 0.4,
    hp: 5,
    speed: 45,
    acceleration: 350,
    damage: 2,
    attackRange: GRID.CELL_SIZE * 2.5,  // Must close to near-melee to burst
    aggroRange: GRID.CELL_SIZE * 9,
    attackCooldown: 3.0,   // Long cooldown: dive → burst → retreat → hover → repeat
    attackWindup: 1.2,
    windupMovement: 'advance',  // Visibly surges forward — clear "incoming" signal
    attackType: 'magic',
    decisionInterval: 0.4,
    color: '#dddddd',
    float: true,
    movementStyle: 'kiter',
    movementConfig: {
      kiteDistance: GRID.CELL_SIZE * 5,       // Retreat distance after burst
      retreatThreshold: GRID.CELL_SIZE * 2,
      hoverTime: 2.0                          // Hovers at kite distance before next approach
    },
    steamCloud: {
      enabled: true,
      cloudRadius: GRID.CELL_SIZE * 3.0,  // Larger: the lingering cloud is the primary danger
      scaldDuration: 3.0,
      slowDuration: 4.0,                   // Slow outlasts the scald — hazard zone persists
      clearIceTiles: true                  // Melts Glacier Crab ice patches on burst
    },
    elementalAffinity: {
      immunity: ['burn', 'freeze'],
      weakness: { 'wet': 1.8 }
    },
    affinities: ['fire', 'ice'],
    tier: 'normal'
  },


  // --- Aquatic ---

  'v': {
    char: 'v',
    name: 'Siren',
    description: 'Its song pulls you toward the water. Reach it and it will tear you apart.',
    spellDescription: 'SONG PULLS YOU IN.',
    mass: 0.5,
    hp: 5,
    speed: 0,
    acceleration: 0,
    damage: 3,              // Punishing melee if pulled into range
    attackRange: GRID.CELL_SIZE * 1.5,
    aggroRange: GRID.CELL_SIZE * 10,
    attackCooldown: 1.5,
    attackWindup: 1.0,
    windupMovement: 'stop',
    attackType: 'melee',
    decisionInterval: 0.5,
    color: '#66ccdd',
    movementStyle: 'keeper',
    movementConfig: {
      preferredRange: GRID.CELL_SIZE * 999,
      rangeTolerance: GRID.CELL_SIZE * 999
    },
    idleBehavior: 'stationary',
    lureMechanic: {
      enabled: true,
      lureRadius: GRID.CELL_SIZE * 9,     // Slightly larger — harder to stay outside
      lurePullForce: 90,
      lureChannelTime: 1.5,               // Shorter channel — snappier, more legible beats
      lureCooldown: 2.5,                  // 2.5s silent window — enough to close and hit once
      lureIndicatorChar: '~'
    },
    elementalAffinity: {
      immunity: ['wet'],
      weakness: { 'burn': 2.0, 'stun': 2.0 }  // stun: interrupt the song mid-channel
    },
    affinities: ['aquatic'],
    tier: 'normal'
  },


  // ============================================================
  // YELLOW ZONE — lightning / storm
  // ============================================================

  // --- Electric ---

  'e': {
    char: 'e',
    name: 'Spark',
    description: 'A jittering ball of lightning. Teleports in zigzags — hard to read.',
    spellDescription: 'PURE VOLTAGE.',
    mass: 0.5,
    hp: 3,
    speed: 90,            // High base — the jump speed feels electric
    damage: 1,
    attackRange: GRID.CELL_SIZE * 2,
    aggroRange: GRID.CELL_SIZE * 9,
    attackCooldown: 1.5,
    attackWindup: 1.0,
    attackType: 'magic',
    movementStyle: 'jumper',
    movementConfig: {
      jumpInterval: 0.5,
      jumpSpeed: 180,
      jumpDuration: 0.1,
      zigzagStrength: 0.85   // Strong deterministic zigzag — chaotic but learnable
    },
    acceleration: 700,
    decisionInterval: 0.2,
    color: '#ffff88',
    float: true,
    deathExplosion: {
      enabled: true,
      projectileCount: 4,
      projectileType: 'magic',
      speed: 100,
      damage: 1,
      deathDelay: 0.8
    },
    elementalAffinity: {
      immunity: ['stun'],
      weakness: { 'wet': 2.0 }
    },
    affinities: ['electric'],
    tier: 'weak'
  },

  'V': {
    char: 'V',
    name: 'Voltaic Golem',
    description: 'Towers over everything. Discharges in all directions.',
    spellDescription: 'WIDE DISCHARGE.',
    mass: 2.5,
    hp: 12,
    speed: 20,
    acceleration: 70,   // Heavy metal construct — slow to change direction
    damage: 3,
    attackRange: GRID.CELL_SIZE * 4,  // 4 units (AOE discharge)
    aggroRange: GRID.CELL_SIZE * 8,   // 8 units
    attackCooldown: 2.5,
    attackWindup: 1.5,
    windupMovement: 'advance',
    attackType: 'magic',
    movementStyle: 'keeper',
    movementConfig: {
      preferredRange: GRID.CELL_SIZE * 3,
      rangeTolerance: GRID.CELL_SIZE * 1.5
    },
    decisionInterval: 0.65,
    color: '#ffaa00',
    chargeMechanic: {
      enabled: true,
      chargeSpeed: 120,
      chargeWindup: 1.2,
      chargeDuration: 0.6,
      cooldown: 6.0,
      wallStunDuration: 1.8,
      chargeRange: GRID.CELL_SIZE * 7
    },
    elementalAffinity: {
      immunity: ['stun'],
      resistance: { 'physical': 0.5, 'magic': 0.7 },
      weakness: { 'wet': 2.5 }
    },
    affinities: ['electric'],
    tier: 'normal'
  },

  'i': {
    char: 'i',
    name: 'Mirror Imp',
    description: 'Shield down — it advances. Shield up — it retreats and reflects.',
    spellDescription: 'RUSH WHILE IT BACKS AWAY.',
    mass: 0.7,
    hp: 6,
    speed: 42,
    acceleration: 320,
    damage: 3,
    attackRange: GRID.CELL_SIZE * 2,
    aggroRange: GRID.CELL_SIZE * 9,
    attackCooldown: 1.5,
    attackWindup: 1.2,
    windupMovement: 'stop',
    attackType: 'melee',
    movementStyle: 'keeper',
    movementConfig: {
      preferredRange: GRID.CELL_SIZE * 5,   // Shield-UP: back away to reflect range
      rangeTolerance: GRID.CELL_SIZE * 1.5
    },
    decisionInterval: 0.35,
    color: '#ccddff',
    reflectShield: {
      enabled: true,
      arcDegrees: 160,            // Wide arc: the retreat makes facing reliable
      shieldDuration: 2.2,        // Up: long enough to back off and hold position
      shieldCooldown: 1.8,        // Up: meaningful open window — commit to rush it
      shieldColor: '#ffffff',
      reflectDamageBonus: 0.5,
      shieldPhaseMovement: true   // Retreats directly away from player while shield is up
    },
    elementalAffinity: {
      immunity: ['stun'],
      weakness: { 'burn': 1.5, 'freeze': 1.3 }
    },
    affinities: ['electric'],
    tier: 'elite'
  },

  'z': {
    char: 'z',
    name: 'Storm Caller',
    description: 'Commands lightning from afar. Calls sparks to defend itself.',
    spellDescription: 'COMMANDS SPARKS.',
    hp: 9,
    speed: 30,
    damage: 3,
    attackRange: GRID.CELL_SIZE * 7,  // 7 units (long range)
    aggroRange: GRID.CELL_SIZE * 11,  // 11 units
    attackCooldown: 2.2,
    attackWindup: 1,
    attackType: 'magic',  // Lightning strikes
    movementStyle: 'keeper',  // Calls storms from max range; summons sparks as shields
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
    affinities: ['electric', 'humanoid'],
    tier: 'elite'
  },


  // --- Beast ---

  'j': {
    char: 'j',
    name: 'Volt Spider',
    description: 'Hunts in packs. Its bite arcs between nearby targets.',
    spellDescription: 'BITE ARCS BETWEEN.',
    hp: 5,
    speed: 48,
    damage: 2,
    attackRange: GRID.CELL_SIZE * 2,  // 2 units (melee)
    aggroRange: GRID.CELL_SIZE * 9,   // 9 units
    attackCooldown: 1.3,
    attackWindup: 1,
    attackType: 'melee',  // Chain lightning on hit
    decisionInterval: 0.3,  // Pack hunter intelligence (same as wolves)
    color: '#dddd00',
    movementStyle: 'kiter',
    movementConfig: {
      kiteDistance: GRID.CELL_SIZE * 3.5,     // Maintain 3.5 units from player
      retreatThreshold: GRID.CELL_SIZE * 2.5, // Retreat if player within 2.5 units during hover
      hoverTime: 2.0                          // Hover for 2s before committing to attack rush
    },
    packCoordination: true,  // Shares detection & memory marks with all spiders in room
    elementalAffinity: {
      immunity: ['stun'],
      weakness: { 'wet': 1.8, 'burn': 1.3 }
    },
    affinities: ['beast', 'electric'],
    tier: 'weak'
  },

  'h': {
    char: 'h',
    name: 'Thunder Hawk',
    description: 'A predator that dives like a bolt from above.',
    spellDescription: 'DIVES FROM ABOVE.',
    hp: 6,
    speed: 50,
    damage: 2,
    attackRange: GRID.CELL_SIZE * 5,  // 5 units (diving strike)
    aggroRange: GRID.CELL_SIZE * 12,  // 12 units (aerial view)
    attackCooldown: 1.8,
    attackWindup: 1,
    attackType: 'ranged',  // Lightning dive
    movementStyle: 'keeper',  // Keeps dive range; strafes laterally when at distance
    decisionInterval: 0.3,
    color: '#ffee44',
    float: true,
    movementStyle: 'kiter',
    movementConfig: {
      kiteDistance: GRID.CELL_SIZE * 6,
      retreatThreshold: GRID.CELL_SIZE * 4,
      hoverTime: 2.0
    },
    chargeMechanic: {
      enabled: true,
      chargeSpeed: 180,          // Dive at 3.6× base — aerial predator
      chargeWindup: 1.2,
      chargeDuration: 0.4,
      cooldown: 3.5,
      wallStunDuration: 1.0,
      chargeRange: GRID.CELL_SIZE * 8
    },
    knockbackMultiplier: 2.0,
    isImpact: true,              // Diving strike bypasses staff block
    elementalAffinity: {
      immunity: ['stun'],
      weakness: { 'wet': 1.8 }
    },
    affinities: ['beast', 'electric'],
    tier: 'normal'
  },


  // --- Humanoid ---

  'n': {
    char: 'n',
    name: 'Trap Goblin',
    description: 'Circles you. The floor behind it is the danger.',
    spellDescription: 'TRAPS THE PATH.',
    mass: 0.6,
    hp: 4,
    speed: 58,
    acceleration: 380,
    damage: 1,
    attackRange: GRID.CELL_SIZE * 2,
    aggroRange: GRID.CELL_SIZE * 10,
    attackCooldown: 3.5,   // Prefers to orbit indefinitely over attacking
    attackWindup: 1.2,
    windupMovement: 'retreat',  // Backs away while winding up — creates distance then swings
    attackType: 'melee',
    movementStyle: 'kiter',
    movementConfig: {
      kiteDistance: GRID.CELL_SIZE * 6,    // Wider orbit — seeding more trap arc per circuit
      retreatThreshold: GRID.CELL_SIZE * 3,
      hoverTime: 2.5   // Full orbit committed — readable encirclement, not erratic fleeing
    },
    decisionInterval: 0.25,
    color: '#ccaa00',
    trapLayerMechanic: {
      enabled: true,
      trapTypes: ['slow', 'slow', 'fire'],  // 2:1 bias: slow sets up, fire punishes stopping
      trapCooldown: 5.0,            // One trap every 5s — deliberate, not a minefield
      trapWindup: 0.5,
      trapOnlyWhileFleeing: false,
      postTrapBurstDuration: 1.5,   // Scuttles away fast immediately after dropping
      postTrapBurstSpeed: 1.8       // Speed multiplier during burst retreat
    },
    idleBehavior: 'wander',
    elementalAffinity: {
      immunity: ['burn'],
      weakness: { 'freeze': 1.5 }
    },
    affinities: ['humanoid'],
    tier: 'weak'
  },

  'q': {
    char: 'q',
    name: 'Alchemist',
    description: 'Circles at range. The color it throws tells you what it\'s carrying.',
    spellDescription: 'KILL FOR THE POTION.',
    hp: 6,
    speed: 38,
    acceleration: 260,
    mass: 0.7,
    damage: 2,
    attackRange: GRID.CELL_SIZE * 6,
    aggroRange: GRID.CELL_SIZE * 9,
    attackCooldown: 2.4,     // Longer: the circle is the danger window
    attackWindup: 1.2,
    windupMovement: 'retreat',  // Backs away while holding the bottle — visible commit
    attackType: 'ranged',
    projectileType: 'potion',
    movementStyle: 'kiter',
    movementConfig: {
      kiteDistance: GRID.CELL_SIZE * 5.5,   // One unit outside AOE radius
      retreatThreshold: GRID.CELL_SIZE * 3.5,
      hoverTime: 2.0   // Circles for 2s before committing to throw
    },
    decisionInterval: 0.4,
    color: '#ddaa00',
    potionMechanic: {
      enabled: true,
      potionTable: [
        { color: '#ff4400', effect: 'burn',      label: 'fire'      },
        { color: '#4488ff', effect: 'freeze',    label: 'freeze'    },
        { color: '#44cc44', effect: 'poison',    label: 'poison'    },
        { color: '#aa44cc', effect: 'confusion', label: 'confusion' }
      ],
      aoeRadius: GRID.CELL_SIZE * 2.5,
      dropLastThrown: true,     // On death: drops ingredient matching last thrown potion type
    },
    elementalAffinity: {
      immunity: ['burn']
    },
    affinities: ['humanoid'],
    tier: 'normal'
  },

  'H': {
    char: 'H',
    name: 'Hex Witch',
    description: 'Curses and retreats. She waits for confusion to do the work.',
    spellDescription: 'CHASE HER AFTER THE CURSE LANDS.',
    hp: 8,
    speed: 38,
    acceleration: 260,
    damage: 3,
    attackRange: GRID.CELL_SIZE * 4,   // Down from 5: must close to curse range
    aggroRange: GRID.CELL_SIZE * 11,   // Spots player first, plans approach
    attackCooldown: 2.5,
    attackWindup: 1.2,
    windupMovement: 'advance',  // Walks into curse range during windup — the approach IS the telegraph
    attackType: 'magic',
    movementStyle: 'kiter',
    movementConfig: {
      kiteDistance: GRID.CELL_SIZE * 6,
      retreatThreshold: GRID.CELL_SIZE * 3,
      hoverTime: 3.5   // Waits 3.5s — nearly matches 4s curse duration, returns just as curse expires
    },
    decisionInterval: 0.3,
    color: '#cc44cc',
    hexMechanic: {
      enabled: true,
      curseTypes: ['invert', 'dim', 'silence'],
      curseDuration: 4.0,
      learnSpellOnDeath: 'HEX'
    },
    elementalAffinity: {
      resistance: { 'magic': 0.5 },
      weakness: { 'freeze': 1.5 }
    },
    affinities: ['humanoid'],
    tier: 'elite'
  },


  // ============================================================
  // GRAY ZONE — undead
  // ============================================================

  // --- Undead ---

  'S': {
    char: 'S',
    name: 'Skeleton',
    description: 'Reassembled from old violence. It remembers.',
    spellDescription: 'WAS ALIVE ONCE.',
    hp: 6,
    speed: 35,
    damage: 2,
    attackRange: GRID.CELL_SIZE * 2,  // 2 units
    aggroRange: GRID.CELL_SIZE * 8,   // 8 units
    attackCooldown: 1.1,
    attackWindup: 1.0,  // Minimum 1 second telegraph
    attackType: 'melee',
    decisionInterval: 0.5,  // Average intelligence
    color: '#eeeeee',
    affinities: ['undead'],
    tier: 'weak'
  },

  'N': {
    char: 'N',
    name: 'Necromancer',
    description: 'Raises the dead. Kill it before its army grows.',
    spellDescription: 'KILLS YOUR KILLS.',
    hp: 9,
    speed: 25,
    damage: 2,
    attackRange: GRID.CELL_SIZE * 6,  // 6 units (magic)
    aggroRange: GRID.CELL_SIZE * 10,  // 10 units
    attackCooldown: 2.0,
    attackWindup: 1.0,  // Minimum 1 second telegraph
    attackType: 'magic',
    movementStyle: 'keeper',  // Retreats to casting range while summoning reinforcements
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
    affinities: ['undead', 'humanoid'],
    tier: 'elite'  // Same table as Skeleton, better rare drop chance
  },


  // ============================================================
  // ROOM-SPECIFIC
  // ============================================================

  // --- Ocean ---

  's': {
    char: 's',
    name: 'Sea Snake',
    description: 'A water-dweller. Bites and retreats to the deep.',
    spellDescription: 'LOVES THE WATER.',
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
    affinities: ['venom', 'aquatic'],
    tier: 'weak'
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
    0: ['r', 'o'],                                     // L1-2: Rats, Slimes
    3: ['r', 'o', '^', 'G', 'g', 'b'],                // L3-5: Add Bats, Goblins, Frogs, Boars
    6: ['o', '^', 'G', 'S', 'P', 'g', 'b', 'm'],      // L6-8: Add Skeletons, Poison Spiders, Mimics ('M' Giant Slime is now boss-only)
    9: ['G', 'S', 'O', 'A', 'W', 'P', 'g', 'a', 'd'], // L9-11: Add Ogres, Archers, Wizards, Shamans, Duelists
    12: ['S', 'O', 'A', 'W', 'K', 'T', 'L', 'a', 'd'] // L12+: Add Knights, Trolls, Looters, Shamans, Duelists
  },

  // Blue zone (Tidefall) — tutorial zone. Only Frogs + Sea Snakes; injected
  // counts in letterTemplates dominate the encounter design.
  'blue': {
    0: ['g', 's']
  },

  'red': {
    // Fire/scorched theme - NO green/ice enemies
    0: ['E', 'l'],                            // L1-2: Ember Sprites, Magma Slugs (intro trail mechanic)
    3: ['E', 'f', 't', 'p', 'l'],             // L3-5: Add Fire Bats, Tortoises, Pyroclasts, Magma Slugs
    6: ['f', '0', 'F', 't', 'k', 'p', 'l'],  // L6-8: Add Living Rocks, Fire Elementals, Miners, Pyroclasts
    9: ['f', '0', 'F', 'S', 't', 'k', 'l'],  // L9-11: Add Skeletons (charred bones), Miners
    12: ['0', 'F', 'T', 'O', 't', 'k', 'R']  // L12+: Living Rocks, Trolls, Ogres, Miners, Rockwardens
  },

  'cyan': {
    // Ice/frozen theme - NO fire enemies
    0: ['w', 'c'],                          // L1-2: Frost Wolves, Breeze Wisps (intro push)
    3: ['w', 'X', 'c', 'v'],               // L3-5: Add Ice Wraiths, Sirens
    6: ['X', 'w', 'U', 'u', 'v'],          // L6-8: Add Frozen Constructs, Glacier Crabs, Sirens
    9: ['w', 'U', 'C', 'I', 'u', 'x'],     // L9-11: Add Cryomancers, Ice Golems, Steam Specters
    12: ['U', 'C', 'I', 'y', 'u', 'x']     // L12+: Add Yetis, Glacier Crabs, Steam Specters
  },

  'yellow': {
    // Lightning/storm theme - NO water/wet enemies
    0: ['e', 'n'],                          // L1-2: Sparks, Trap Goblins (intro trap reading)
    3: ['e', 'j', 'n', 'q'],               // L3-5: Add Volt Spiders, Alchemists
    6: ['j', 'e', 'h', 'q', 'n'],          // L6-8: Add Thunder Hawks, Alchemists, Trap Goblins
    9: ['j', 'h', 'V', 'q', 'i', 'H'],     // L9-11: Add Voltaic Golems, Mirror Imps, Hex Witches
    12: ['h', 'V', 'z', 'i', 'H']          // L12+: Storm Callers, Mirror Imps, Hex Witches
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

// ============================================================
// BOSS ENCOUNTERS — picked from zone.bossPool by RoomGenerator
// ============================================================
// Each encounter specifies a list of spawns. Each spawn has:
//   char        — ENEMIES key
//   count       — how many of this enemy to spawn
//   role        — 'boss' | 'leader' | 'follower' (used by spawnBossEncounter for placement)
//   equippedWeapon (optional) — pre-equip a weapon char (Item.js key)
// arenaSpacing controls placement: 'center' (single boss), 'formation' (leader at
// center with followers in a ring at the leader's formationRadius).
export const BOSS_ENCOUNTERS = {
  giant_slime: {
    spawns: [
      { char: 'M', count: 1, role: 'boss' }
    ],
    arenaSpacing: 'center'
  },
  goblin_army: {
    // Followers are regular Goblins (G), each scavenged a different weapon.
    // The leaderRef + followLeader behavior (configured on G data) makes them
    // orbit the Brute while the player is in range.
    spawns: [
      { char: 'B', count: 1, role: 'leader' },
      { char: 'G', count: 1, role: 'follower', equippedWeapon: '†' },   // Sword
      { char: 'G', count: 1, role: 'follower', equippedWeapon: '⊤' },   // Bone axe
      { char: 'G', count: 1, role: 'follower', equippedWeapon: '↑' },   // Spear
      { char: 'G', count: 1, role: 'follower', equippedWeapon: '↾' },   // Dagger
      { char: 'G', count: 1, role: 'follower', equippedWeapon: '⫯' }    // Longsword
    ],
    arenaSpacing: 'formation'
  }
};
