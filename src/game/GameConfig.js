// Game configuration and constants

export const GRID = {
  COLS: 30,
  ROWS: 30,
  CELL_SIZE: 16, // pixels per cell
  WIDTH: 480,    // 30 * 16
  HEIGHT: 480    // 30 * 16
};

export const PHYSICS = {
  PLAYER_SPEED: 180,           // pixels per second (1.5x speed increase)
  PLAYER_ACCELERATION: 600,    // pixels per second squared
  ENEMY_SPEED_BASE: 80,        // base enemy speed
  BULLET_SPEED: 300,           // projectile speed
  ARROW_SPEED: 250,
  ATTRACTION_RADIUS: 100,      // ingredient attraction distance
  ATTRACTION_STRENGTH: 200,    // ingredient acceleration
  PICKUP_RADIUS: 16,           // auto-pickup distance
  FRICTION: 0.9                // velocity damping
};

export const GAME_STATES = {
  TITLE: 'TITLE',
  REST: 'REST',
  EXPLORE: 'EXPLORE',
  COMBAT: 'COMBAT',
  GAME_OVER: 'GAME_OVER'
};

export const ROOM_TYPES = {
  COMBAT: 'COMBAT',
  BOSS: 'BOSS',
  DISCOVERY: 'DISCOVERY',
  CAMP: 'CAMP'
};

export const COLORS = {
  BACKGROUND: '#000000',
  GRID: '#1a1a1a',
  BORDER: '#00ff00',
  PLAYER: '#00ffff',
  ENEMY: '#ff0000',
  ITEM: '#ffff00',
  INGREDIENT: '#ff00ff',
  TEXT: '#00ff00',
  HIGHLIGHT: '#00ff0066'
};

export const CRAFTING = {
  STATION_Y: 15,     // row position of crafting station (centered vertically)
  LEFT_SLOT_X: 13,   // column positions (centered horizontally)
  CENTER_SLOT_X: 15,
  RIGHT_SLOT_X: 17
};

export const EQUIPMENT = {
  // Left side - Storage chest and armor
  CHEST_X: 3,
  CHEST_Y: 10,
  ARMOR_X: 3,
  ARMOR_Y: 13,

  // Right side - Consumables
  CONSUMABLE1_X: 26,
  CONSUMABLE1_Y: 12,
  CONSUMABLE2_X: 26,
  CONSUMABLE2_Y: 14
};

export const PLAYER_STATS = {
  MAX_HP: 10,
  START_HP: 10
};

export const BACKGROUND_OBJECTS = {
  '%': {
    name: 'Bush',
    color: '#228822',
    hp: 1,
    dropEffect: 'destroyObject',
    bulletInteraction: 'pass-through',
    flammability: 'high',
    conductivity: 'none',
    interactions: {
      default: { animation: 'shake', message: null }
    }
  },
  '&': {
    name: 'Tree',
    color: '#336633',
    hp: 3,
    dropEffect: 'destroyObject:spawnIngredient:|',
    dropChance: 0.15,
    bulletInteraction: 'block',
    flammability: 'high',
    conductivity: 'none',
    interactions: {
      default: { animation: 'shake', message: null }
    }
  },
  '0': {
    name: 'Rock',
    color: '#888888',
    hp: 3,
    dropEffect: 'destroyObject:spawnIngredient:M',
    dropChance: 0.2,
    bulletInteraction: 'interact-preserve',
    flammability: 'none',
    conductivity: 'none',
    interactions: {
      default: { animation: 'bounce', message: null },
      '/': { animation: 'flash', message: null, effect: 'spawnIngredient:M' }
    }
  },
  '=': {
    name: 'Water',
    color: '#4444ff',
    bulletInteraction: 'pass-through',
    flammability: 'none',
    conductivity: 'water',
    interactions: {
      default: { animation: 'ripple', message: null }
    }
  },
  '#': {
    name: 'Crate',
    color: '#aa8844',
    hp: 2,
    damagedChar: '-',
    dropEffect: 'destroyObject:spawnRandom',
    bulletInteraction: 'interact-destroy',
    flammability: 'medium',
    conductivity: 'none',
    interactions: {
      default: { animation: 'shake', message: null }
    }
  },
  '+': {
    name: 'Brambles',
    color: '#557733',
    hp: 1,
    dropEffect: 'destroyObject:spawnIngredient:~',
    dropChance: 0.15,
    bulletInteraction: 'pass-through',
    flammability: 'high',
    conductivity: 'none',
    interactions: {
      default: { animation: 'shake', message: null }
    }
  },
  'Y': {
    name: 'Stump',
    color: '#664422',
    hp: 2,
    dropEffect: 'destroyObject:spawnIngredient:|',
    dropChance: 0.15,
    bulletInteraction: 'block',
    flammability: 'medium',
    conductivity: 'none',
    interactions: {
      default: { animation: 'shake', message: null }
    }
  },
  'n': {
    name: 'Mushroom',
    color: '#cc6666',
    hp: 1,
    dropEffect: 'destroyObject:spawnIngredient:g',
    dropChance: 0.3,
    bulletInteraction: 'interact-destroy',
    flammability: 'low',
    conductivity: 'none',
    interactions: {
      default: { animation: 'bounce', message: null }
    }
  },
  '*': {
    name: 'Crystal',
    color: '#00ffff',
    hp: 2,
    dropEffect: 'destroyObject:spawnIngredient:M',
    dropChance: 0.25,
    bulletInteraction: 'interact-preserve',
    flammability: 'none',
    conductivity: 'metal',
    interactions: {
      default: { animation: 'flash', message: null },
      '/': { animation: 'ricochet', message: null, effect: 'reflectBullet' }
    }
  },
  'B': {
    name: 'Metal Box',
    color: '#999999',
    hp: 4,
    dropEffect: 'destroyObject:spawnRandom',
    bulletInteraction: 'block',
    flammability: 'none',
    conductivity: 'metal',
    interactions: {
      default: { animation: 'clang', message: null }
    }
  },
  'Q': {
    name: 'Boulder',
    color: '#666666',
    hp: 5,
    dropEffect: 'destroyObject:spawnMultiple:M:2',
    dropChance: 0.3,
    bulletInteraction: 'block',
    flammability: 'none',
    conductivity: 'none',
    interactions: {
      default: { animation: 'bounce', message: null }
    }
  },
  '~': {
    name: 'Puddle',
    color: '#3366ff',
    bulletInteraction: 'pass-through',
    flammability: 'none',
    conductivity: 'water',
    interactions: {
      default: { animation: 'ripple', message: null }
    }
  },
  'i': {
    name: 'Ice',
    color: '#aaffff',
    hp: 1,
    dropEffect: 'destroyObject:spawnIngredient:w',
    dropChance: 0.15,
    bulletInteraction: 'pass-through',
    flammability: 'none',
    conductivity: 'none',
    interactions: {
      default: { animation: 'slide', message: null }
    }
  },
  '!': {
    name: 'Fire',
    color: '#ff4400',
    bulletInteraction: 'pass-through',
    flammability: 'none',
    conductivity: 'none',
    indestructible: true,
    interactions: {
      default: { animation: 'flicker', message: null }
    }
  },
  '$': {
    name: 'Shrine',
    color: '#ffff00',
    bulletInteraction: 'block',
    flammability: 'none',
    conductivity: 'none',
    indestructible: true,
    interactions: {
      default: { animation: 'glow', message: null }
    }
  },
  'p': {
    name: 'Barrel',
    color: '#8B4513',
    hp: 2,
    damagedChar: 'P',
    dropEffect: 'destroyObject:spawnRandom',
    bulletInteraction: 'interact-destroy',
    flammability: 'high',
    conductivity: 'none',
    interactions: {
      default: { animation: 'shake', message: null }
    }
  },
  '8': {
    name: 'Bones',
    color: '#cccccc',
    hp: 1,
    dropEffect: 'destroyObject:spawnIngredient:b',
    dropChance: 0.2,
    bulletInteraction: 'pass-through',
    flammability: 'none',
    conductivity: 'none',
    interactions: {
      default: { animation: 'rattle', message: null }
    }
  },
  '|': {
    name: 'Tall Grass',
    color: '#559944',
    hp: 1,
    bulletInteraction: 'interact-destroy',
    flammability: 'high',
    burnDuration: 1.5,
    conductivity: 'none',
    blocksVision: true,
    slowing: true,
    cuttable: true,
    cutState: ',',
    dropEffect: 'cutGrass',
    interactions: {
      default: { animation: 'shake', message: null }
    }
  },
  ',': {
    name: 'Cut Grass',
    color: '#667755',
    bulletInteraction: 'pass-through',
    flammability: 'high',
    burnDuration: 1.0,
    conductivity: 'none',
    blocksVision: false,
    slowing: false,
    indestructible: true,
    interactions: {
      default: { animation: 'shake', message: null }
    }
  }
};

export const WATER_COLORS = {
  normal:      '#3366ff',
  frozen:      '#ffffff',
  poisoned:    '#44bb44',
  electrified: '#cccc00'
};

export const WATER_STRUCTURES = {
  CHANNEL: {
    name: 'Channel',
    pattern: [
      [false, false, false],
      [true,  false, false],
      [true,  false, false],
      [true,  false, false],
      [true,  false, false],
      [true,  false, false],
      [true,  false, false],
      [true,  false, false],
      [false, false, false]
    ],
    weight: 1.2,
    roomTypes: ['COMBAT', 'BOSS'],
    allowRotation: true
  },
  MOAT: {
    name: 'Moat',
    pattern: [
      [true, true,  true,  true,  true ],
      [true, false, false, false, true ],
      [true, false, false, false, true ],
      [true, false, false, false, true ],
      [true, true,  true,  true,  true ]
    ],
    weight: 0.7,
    roomTypes: ['BOSS', 'DISCOVERY'],
    allowRotation: false
  },
  TIDE_POOL: {
    name: 'Tide Pool',
    pattern: [
      [true, true,  true,  true ],
      [true, false, false, false],
      [true, false, false, false],
      [true, true,  true,  true ]
    ],
    weight: 1.0,
    roomTypes: ['COMBAT', 'DISCOVERY', 'CAMP'],
    allowRotation: true
  },
  CROSSING: {
    name: 'Crossing',
    pattern: [
      [false, false, true, false, false],
      [false, false, true, false, false],
      [true,  true,  true, true,  true ],
      [false, false, true, false, false],
      [false, false, true, false, false]
    ],
    weight: 0.8,
    roomTypes: ['COMBAT', 'BOSS'],
    allowRotation: false
  },
  WATER_WALL: {
    name: 'Water Wall',
    pattern: [
      [true, true, true, true, true, true, true]
    ],
    weight: 1.0,
    roomTypes: ['COMBAT', 'DISCOVERY'],
    allowRotation: true
  },
  LAKE_SMALL: {
    name: 'Lake Small',
    // ~10x8 oval filled with water: (x/5)^2 + (y/4)^2 <= 1 per cell
    // Grid is 10 cols x 9 rows, center at (4.5, 4)
    pattern: (() => {
      const rows = 9, cols = 10;
      const cx = (cols - 1) / 2, cy = (rows - 1) / 2;
      const rx = 5, ry = 4;
      return Array.from({ length: rows }, (_, r) =>
        Array.from({ length: cols }, (_, c) => {
          const dx = (c - cx) / rx, dy = (r - cy) / ry;
          return dx * dx + dy * dy <= 1.0;
        })
      );
    })(),
    weight: 1.5,
    roomTypes: ['COMBAT', 'DISCOVERY', 'CAMP'],
    allowRotation: false
  },
  LAKE_LARGE: {
    name: 'Lake Large',
    // ~14x11 oval with central 4x3 island gap
    // Grid is 14 cols x 11 rows, center at (6.5, 5)
    pattern: (() => {
      const rows = 11, cols = 14;
      const cx = (cols - 1) / 2, cy = (rows - 1) / 2;
      const rx = 7, ry = 5.5;
      // Island: cols 5-8, rows 4-6 (centered 4x3 block)
      return Array.from({ length: rows }, (_, r) =>
        Array.from({ length: cols }, (_, c) => {
          const dx = (c - cx) / rx, dy = (r - cy) / ry;
          if (dx * dx + dy * dy > 1.0) return false; // outside ellipse
          if (c >= 5 && c <= 8 && r >= 4 && r <= 6) return false; // island
          return true;
        })
      );
    })(),
    weight: 0.9,
    roomTypes: ['BOSS', 'DISCOVERY'],
    allowRotation: false
  },
  RIVER: {
    name: 'River',
    // 3 rows x 14 cols, all water — rotatable to become vertical
    pattern: [
      [true, true, true, true, true, true, true, true, true, true, true, true, true, true],
      [true, true, true, true, true, true, true, true, true, true, true, true, true, true],
      [true, true, true, true, true, true, true, true, true, true, true, true, true, true]
    ],
    weight: 1.1,
    roomTypes: ['COMBAT', 'BOSS', 'DISCOVERY'],
    allowRotation: true
  }
};

export const WALL_STRUCTURES = {
  // Small structures (3x3 to 5x5) - Quick navigation challenges

  PILLAR_CLUSTER: {
    name: 'Pillar Cluster',
    pattern: [
      [true, false, true],
      [false, false, false],
      [true, false, true]
    ],
    weight: 1.0,
    roomTypes: ['COMBAT', 'BOSS', 'DISCOVERY', 'CAMP'],
    allowRotation: false
  },

  CROSS: {
    name: 'Cross',
    pattern: [
      [false, false, true, false, false],
      [false, false, true, false, false],
      [true, true, true, true, true],
      [false, false, true, false, false],
      [false, false, true, false, false]
    ],
    weight: 1.0,
    roomTypes: ['COMBAT', 'BOSS'],
    allowRotation: false
  },

  DIAGONAL_LINE: {
    name: 'Diagonal Line',
    pattern: [
      [true, false, false, false, false],
      [false, true, false, false, false],
      [false, false, true, false, false],
      [false, false, false, true, false],
      [false, false, false, false, true]
    ],
    weight: 1.0,
    roomTypes: ['COMBAT', 'DISCOVERY', 'CAMP'],
    allowRotation: true
  },

  CHECKERBOARD: {
    name: 'Checkerboard',
    pattern: [
      [true, false, true, false, true],
      [false, true, false, true, false],
      [true, false, true, false, true]
    ],
    weight: 0.8,
    roomTypes: ['COMBAT', 'DISCOVERY'],
    allowRotation: false
  },

  // Medium structures (5x5 to 7x7) - Room dividers

  L_CORNER: {
    name: 'L-Corner',
    pattern: [
      [true, true, true, false],
      [true, false, false, false],
      [true, false, false, false],
      [false, false, false, false]
    ],
    weight: 1.0,
    roomTypes: ['COMBAT', 'DISCOVERY', 'CAMP'],
    allowRotation: true
  },

  T_JUNCTION: {
    name: 'T-Junction',
    pattern: [
      [true, true, true, true, true],
      [false, false, true, false, false],
      [false, false, true, false, false],
      [false, false, true, false, false]
    ],
    weight: 1.0,
    roomTypes: ['COMBAT', 'BOSS'],
    allowRotation: true
  },

  U_SHAPE: {
    name: 'U-Shape',
    pattern: [
      [true, false, false, false, true],
      [true, false, false, false, true],
      [true, false, false, false, true],
      [true, true, true, true, true]
    ],
    weight: 0.9,
    roomTypes: ['COMBAT', 'BOSS'],
    allowRotation: true
  },

  ZIGZAG: {
    name: 'Zigzag',
    pattern: [
      [true, true, false, false],
      [false, true, true, false],
      [false, false, true, true],
      [false, false, false, true]
    ],
    weight: 1.0,
    roomTypes: ['COMBAT', 'DISCOVERY', 'CAMP'],
    allowRotation: true
  },

  // Large structures (7x7+) - Major room features

  HOLLOW_SQUARE: {
    name: 'Hollow Square',
    pattern: [
      [true, true, true, true, true, true, true],
      [true, false, false, false, false, false, true],
      [true, false, false, false, false, false, true],
      [true, false, false, false, false, false, true],
      [true, false, false, false, false, false, true],
      [true, false, false, false, false, false, true],
      [true, true, true, true, true, true, true]
    ],
    weight: 0.6,
    roomTypes: ['BOSS'],
    allowRotation: false
  },

  PLUS: {
    name: 'Plus',
    pattern: [
      [false, false, false, true, true, false, false, false],
      [false, false, false, true, true, false, false, false],
      [false, false, false, true, true, false, false, false],
      [true, true, true, true, true, true, true, true],
      [true, true, true, true, true, true, true, true],
      [false, false, false, true, true, false, false, false],
      [false, false, false, true, true, false, false, false],
      [false, false, false, true, true, false, false, false]
    ],
    weight: 0.5,
    roomTypes: ['BOSS'],
    allowRotation: false
  },

  CORRIDOR: {
    name: 'Corridor',
    pattern: [
      [true, false, true, false, true, false, true, false, true],
      [false, false, false, false, false, false, false, false, false],
      [true, false, true, false, true, false, true, false, true]
    ],
    weight: 0.8,
    roomTypes: ['COMBAT', 'DISCOVERY'],
    allowRotation: true
  },

  ALCOVE: {
    name: 'Alcove',
    pattern: [
      [true, true, true, true, true],
      [true, false, false, false, true],
      [true, false, false, false, true],
      [true, true, false, true, true]
    ],
    weight: 1.0,
    roomTypes: ['DISCOVERY', 'CAMP'],
    allowRotation: true
  }
};

export const OBJECT_ANIMATIONS = {
  shake: { duration: 0.3, frames: [{ x: 2, y: 0 }, { x: -2, y: 0 }, { x: 1, y: 0 }, { x: -1, y: 0 }] },
  bounce: { duration: 0.4, frames: [{ x: 0, y: -3 }, { x: 0, y: -5 }, { x: 0, y: -3 }, { x: 0, y: 0 }] },
  flash: { duration: 0.2, colorFrames: ['#ffffff', '#ffff00', '#ffffff'] },
  ripple: { duration: 0.5, frames: [{ scale: 1.0 }, { scale: 1.2 }, { scale: 1.1 }, { scale: 1.0 }] },
  crack: { duration: 0.4, frames: [{ char: '#' }, { char: '+' }, { char: '.' }, { char: ' ' }] },
  chip: { duration: 0.3, frames: [{ x: 1, y: -1 }, { x: -1, y: 1 }, { x: 0, y: 0 }] },
  clang: { duration: 0.2, colorFrames: ['#ffffff', '#aaaaaa', '#999999'] },
  ricochet: { duration: 0.3, colorFrames: ['#ffff00', '#ffffff', '#ffff00'] },
  pierce: { duration: 0.2, frames: [{ x: 2, y: 0 }, { x: -2, y: 0 }] },
  electrify: { duration: 0.3, colorFrames: ['#00ffff', '#ffff00', '#00ffff'] },
  spark: { duration: 0.2, colorFrames: ['#ffff00', '#ffffff', '#ffff00'] },
  melt: { duration: 0.6, colorFrames: ['#aaffff', '#6699ff', '#3366ff'] },
  freeze: { duration: 0.6, colorFrames: ['#3366ff', '#6699ff', '#aaffff'] },
  rattle: { duration: 0.3, frames: [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 0 }] },
  scatter: { duration: 0.4, frames: [{ x: 2, y: -2 }, { x: -2, y: 2 }, { char: '.' }, { char: ' ' }] },
  flicker: { duration: 0.3, colorFrames: ['#ff4400', '#ff8800', '#ff4400'] },
  glow: { duration: 0.4, colorFrames: ['#ffff00', '#ffffff', '#ffff00'] },
  slide: { duration: 0.3, frames: [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 0 }] }
};

export const INTERACTION_RANGE = 24; // pixels
