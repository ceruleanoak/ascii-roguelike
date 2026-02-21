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
    attackWindup: 0.4,  // Fast attack
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
    damage: 1,
    attackRange: GRID.CELL_SIZE * 2,  // 2 units
    aggroRange: GRID.CELL_SIZE * 6,   // 6 units (slower, shorter range)
    attackCooldown: 1.2,
    attackWindup: 1.0,  // Clear 1-second telegraph
    windupImmune: true,  // Cannot be interrupted
    attackType: 'melee',
    decisionInterval: 0.8,  // Dumb enemy (slow reaction time)
    color: '#00ff00',
    dropTable: 'generic',
    rarityProfile: 'weak'
  },
  '^': {
    char: '^',
    name: 'Bat',
    hp: 1,
    speed: 70,
    damage: 1,
    attackRange: GRID.CELL_SIZE * 1.5,  // 1.5 units (faster, closer)
    aggroRange: GRID.CELL_SIZE * 10,    // 10 units (very aware)
    attackCooldown: 0.8,
    attackWindup: 0.3,  // Very fast
    attackType: 'melee',
    decisionInterval: 0.25,  // Very smart (fast reactions)
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
    attackWindup: 0.5,  // Draw bow
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
    attackWindup: 0.45,
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
    attackWindup: 0.7,  // Slow heavy attack
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
    attackWindup: 0.9,  // Long breath windup
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
    attackWindup: 0.6,  // Casting time
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
    attackWindup: 0.5,  // Sword swing
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
    attackWindup: 0.7,  // Heavy swing
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
    attackWindup: 0.6,
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
    attackWindup: 0.6,
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
    attackWindup: 0.4,
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
    attackWindup: 0.6,
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
    attackWindup: 0.5,
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
    attackWindup: 0.5,
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
    attackWindup: 0.4,
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
  }
};

// Enemy spawn tables by depth
export const SPAWN_TABLES = {
  0: ['r', 'o'],                              // Depth 0-1: Easy enemies
  2: ['r', 'o', '^', 'G'],                    // Depth 2-4: Add bats and goblins (G has item pickup)
  5: ['o', '^', 'G', 'S', 'P', 'L'],          // Depth 5-7: Add poison spider, looter
  8: ['G', 'S', 'O', 'W', 'F', 'N', 'A'],     // Depth 8-10: Add fire elemental, necromancer, archer
  11: ['S', 'O', 'W', 'K', 'I', 'N', 'A'],    // Depth 11-14: Add ice golem, knight (K has item pickup)
  15: ['O', 'W', 'K', 'T', 'D', 'F', 'I', 'N', 'Q', 'A', 'L']  // Depth 15+: All enemies
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
