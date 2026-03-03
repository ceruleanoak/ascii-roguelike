import { COLORS } from '../game/GameConfig.js';

// Item types
export const ITEM_TYPES = {
  WEAPON: 'WEAPON',
  ARMOR: 'ARMOR',
  CONSUMABLE: 'CONSUMABLE',
  INGREDIENT: 'INGREDIENT',
  TRAP: 'TRAP'
};

// Weapon behaviors
export const WEAPON_TYPES = {
  GUN: 'GUN',
  MELEE: 'MELEE',
  BOW: 'BOW'
};

// Item definitions
export const ITEMS = {
  // Starting weapons
  '¬': {
    char: '¬',
    name: 'Gun',
    type: ITEM_TYPES.WEAPON,
    weaponType: WEAPON_TYPES.GUN,
    damage: 1,
    cooldown: 1.0,
    color: COLORS.ITEM
  },
  '†': {
    char: '†',
    name: 'Sword',
    type: ITEM_TYPES.WEAPON,
    weaponType: WEAPON_TYPES.MELEE,
    damage: 2,
    windup: 0.3,
    recovery: 0.5,
    attackPattern: 'arc',
    patternSpeed: 0.05,
    range: 20,
    isBlade: true,
    color: COLORS.ITEM
  },

  // Crafted weapons
  '⌂': {
    char: '⌂',
    name: 'Shotgun',
    type: ITEM_TYPES.WEAPON,
    weaponType: WEAPON_TYPES.GUN,
    damage: 1,
    cooldown: 2.0,
    bulletCount: 3,
    color: COLORS.ITEM
  },
  '‡': {
    char: '‡',
    name: 'Flame Sword',
    type: ITEM_TYPES.WEAPON,
    weaponType: WEAPON_TYPES.MELEE,
    damage: 3,
    windup: 0.45,
    recovery: 0.8,
    attackPattern: 'arc',
    patternSpeed: 0.05,
    range: 20,
    isBlade: true,
    onHit: 'burn',
    color: '#ff4400'
  },
  ')': {
    char: ')',
    name: 'Bow',
    type: ITEM_TYPES.WEAPON,
    weaponType: WEAPON_TYPES.BOW,
    damage: 2,
    cooldown: 1.5,
    maxUses: 10,  // 10 arrows per room
    color: COLORS.ITEM
  },
  'X': {
    char: 'X',
    name: 'Dual Pistols',
    type: ITEM_TYPES.WEAPON,
    weaponType: WEAPON_TYPES.GUN,
    damage: 1,
    cooldown: 0.5,
    color: COLORS.ITEM
  },
  '⌘': {
    char: '⌘',
    name: 'Dragon Blade',
    type: ITEM_TYPES.WEAPON,
    weaponType: WEAPON_TYPES.MELEE,
    damage: 5,
    windup: 0.75,
    recovery: 0.25,
    attackPattern: 'arc',
    patternSpeed: 0.05,
    range: 24,
    isBlade: true,
    color: '#ff00ff'
  },
  '⟩': {
    char: '⟩',
    name: 'Fire Bow',
    type: ITEM_TYPES.WEAPON,
    weaponType: WEAPON_TYPES.BOW,
    damage: 3,
    cooldown: 1.8,
    maxUses: 5,  // Very limited - one of the best attacks
    onHit: 'burn',
    color: '#ff4400'
  },
  '⊤': {
    char: '⊤',
    name: 'Bone Axe',
    type: ITEM_TYPES.WEAPON,
    weaponType: WEAPON_TYPES.MELEE,
    weaponSubtype: 'blunt',
    damage: 3,
    windup: 0.6,
    recovery: 0.5,
    attackPattern: 'sweep',
    patternSpeed: 0.04,
    range: 22,
    color: '#cccccc'
  },
  '↑': {
    char: '↑',
    name: 'Spear',
    type: ITEM_TYPES.WEAPON,
    weaponType: WEAPON_TYPES.MELEE,
    damage: 2,
    windup: 0.15,
    recovery: 0.45,
    attackPattern: 'thrust',
    patternSpeed: 0.05,
    range: 28,
    color: COLORS.ITEM
  },
  '/': {
    char: '/',
    name: 'Staff',
    type: ITEM_TYPES.WEAPON,
    weaponType: WEAPON_TYPES.MELEE,
    damage: 1,
    windup: 0.15,
    recovery: 0.45,
    attackPattern: 'thrust',
    patternSpeed: 0.05,
    meleeChar: '|',
    range: 28,
    color: COLORS.ITEM
  },

  // Armor/defense
  'A': {
    char: 'A',
    name: 'Bone Armor',
    type: ITEM_TYPES.ARMOR,
    defense: 2,
    color: '#cccccc'
  },
  'O': {
    char: 'O',
    name: 'Slime Suit',
    type: ITEM_TYPES.ARMOR,
    defense: 1,
    slimeImmune: true,
    color: '#00ff00'
  },
  'V': {
    char: 'V',
    name: 'Fur Vest',
    type: ITEM_TYPES.ARMOR,
    defense: 1,
    color: '#8b4513'
  },
  'L': {
    char: 'L',
    name: 'Leather Armor',
    type: ITEM_TYPES.ARMOR,
    defense: 1,
    speedBoost: 0.2,
    color: '#8b6914'
  },
  '⛓': {
    char: '⛓',
    name: 'Chain Mail',
    type: ITEM_TYPES.ARMOR,
    defense: 3,
    bulletResist: 0.3,
    color: '#aaaaaa'
  },
  'R': {
    char: 'R',
    name: 'Robe',
    type: ITEM_TYPES.ARMOR,
    defense: 1,
    dodgeChance: 0.1,
    fireImmune: true,
    freezeImmune: true,
    color: '#9370db'
  },
  'W': {
    char: 'W',
    name: 'Warplate',
    type: ITEM_TYPES.ARMOR,
    defense: 4,
    bulletResist: 0.5,
    speedPenalty: 0.2,
    color: '#4a4a4a'
  },
  'N': {
    char: 'N',
    name: 'Ninja Garb',
    type: ITEM_TYPES.ARMOR,
    defense: 2,
    poisonImmune: true,
    dodgeChance: 0.15,
    color: '#2f2f2f'
  },
  'E': {
    char: 'E',
    name: 'Ember Cloak',
    type: ITEM_TYPES.ARMOR,
    defense: 3,
    fireImmune: true,
    reflectDamage: 0.25,
    color: '#ff4500'
  },
  'I': {
    char: 'I',
    name: 'Ice Plate',
    type: ITEM_TYPES.ARMOR,
    defense: 4,
    freezeImmune: true,
    slowEnemies: true,
    color: '#87ceeb'
  },

  // Consumables
  '@': {
    char: '@',
    name: 'Bomb',
    type: ITEM_TYPES.CONSUMABLE,
    effect: 'explode',
    damage: 5,
    radius: 40,
    oneShot: true, // Consumed permanently
    color: '#ff0000'
  },
  'H': {
    char: 'H',
    name: 'Health Potion',
    type: ITEM_TYPES.CONSUMABLE,
    effect: 'heal',
    amount: 3,
    oneShot: true,
    autoTriggerHP: 0.4,
    color: '#ff00ff'
  },
  'ᒧ': {
    char: 'ᒧ',
    name: 'Meat Jerky',
    type: ITEM_TYPES.CONSUMABLE,
    effect: 'heal',
    amount: 2,
    oneShot: true,
    autoTriggerHP: 0.3,
    color: '#aa4422'
  },
  'ᐧ': {
    char: 'ᐧ',
    name: 'Bone Dust',
    type: ITEM_TYPES.CONSUMABLE,
    effect: 'panic_blind',
    oneShot: true,
    radius: 96,
    duration: 4.0,
    autoTrigger: {
      condition: 'surrounded_or_critical',
      nearbyEnemies: 3,
      criticalHP: 0.2
    },
    color: '#cccccc'
  },
  'ᐤ': {
    char: 'ᐤ',
    name: 'Fur Cloak',
    type: ITEM_TYPES.CONSUMABLE,
    effect: 'auto_dodge',
    oneShot: true,
    autoTrigger: {
      condition: 'taking_damage',
      dodgeNext: 1
    },
    duration: 10.0,
    color: '#8b6914'
  },
  'ᑕ': {
    char: 'ᑕ',
    name: 'Tooth Necklace',
    type: ITEM_TYPES.CONSUMABLE,
    effect: 'damageBuff',
    passive: true,
    damageBonus: 1,
    color: '#ffffff'
  },

  // Special items
  '♦': {
    char: '♦',
    name: 'Dragon Heart',
    type: ITEM_TYPES.CONSUMABLE,
    effect: 'maxhp',
    amount: 5,
    oneShot: true, // Permanent upgrade
    color: '#ff00ff'
  },
  '∞': {
    char: '∞',
    name: 'Wings',
    type: ITEM_TYPES.CONSUMABLE,
    effect: 'speed',
    duration: 30,
    cooldown: 20, // Reusable with 20s cooldown
    color: '#00ffff'
  },

  // Upgraded weapons
  '☼': {
    char: '☼',
    name: 'Dragon Shotgun',
    type: ITEM_TYPES.WEAPON,
    weaponType: WEAPON_TYPES.GUN,
    damage: 2,
    cooldown: 3,
    bulletCount: 8,
    attackPattern: 'ring',
    color: '#ff00ff'
  },
  '⚔': {
    char: '⚔',
    name: 'Legendary Flame Sword',
    type: ITEM_TYPES.WEAPON,
    weaponType: WEAPON_TYPES.MELEE,
    damage: 6,
    windup: 0.9,
    recovery: 0.7,
    attackPattern: 'arc',
    patternSpeed: 0.05,
    range: 24,
    isBlade: true,
    onHit: 'burn',
    color: '#ffaa00'
  },
  '※': {
    char: '※',
    name: 'Heavy Pistols',
    type: ITEM_TYPES.WEAPON,
    weaponType: WEAPON_TYPES.GUN,
    damage: 2,
    cooldown: 2,
    color: '#aaaaaa'
  },
  '☠': {
    char: '☠',
    name: 'Venom Blade',
    type: ITEM_TYPES.WEAPON,
    weaponType: WEAPON_TYPES.MELEE,
    damage: 5,
    windup: 0.75,
    recovery: 0.15,
    attackPattern: 'arc',
    patternSpeed: 0.05,
    range: 24,
    isBlade: true,
    onHit: 'poison',
    color: '#00ff00'
  },
  '⇒': {
    char: '⇒',
    name: 'Sky Bow',
    type: ITEM_TYPES.WEAPON,
    weaponType: WEAPON_TYPES.BOW,
    damage: 4,
    cooldown: 1.2,
    maxUses: 30,  // Fast bow with more uses
    color: '#00ffff'
  },
  '⚒': {
    char: '⚒',
    name: 'Bone Crusher',
    type: ITEM_TYPES.WEAPON,
    weaponType: WEAPON_TYPES.MELEE,
    weaponSubtype: 'blunt',
    damage: 7,
    windup: 1.05,
    recovery: 0.2,
    attackPattern: 'sweep',
    patternSpeed: 0.04,
    range: 26,
    color: '#ffffff'
  },

  // New special items
  '✦': {
    char: '✦',
    name: 'Phoenix Feather',
    type: ITEM_TYPES.CONSUMABLE,
    effect: 'revive',
    oneShot: true, // One death save
    color: '#ff8800'
  },
  'K': {
    char: 'K',
    name: 'Dragon Scale Armor',
    type: ITEM_TYPES.ARMOR,
    defense: 5,
    color: '#ff00ff'
  },
  '♠': {
    char: '♠',
    name: 'Acid Blade',
    type: ITEM_TYPES.WEAPON,
    weaponType: WEAPON_TYPES.MELEE,
    damage: 4,
    windup: 0.6,
    recovery: 0.15,
    attackPattern: 'arc',
    patternSpeed: 0.05,
    range: 22,
    isBlade: true,
    onHit: 'acid',
    color: '#00ff00'
  },

  // === NEW GUNS (10) ===
  '⌐': {
    char: '⌐',
    name: 'Machine Gun',
    type: ITEM_TYPES.WEAPON,
    weaponType: WEAPON_TYPES.GUN,
    damage: 1,
    cooldown: 0.4,
    maxUses: 30,
    color: '#888888'
  },
  '❄': {
    char: '❄',
    name: 'Freeze Ray',
    type: ITEM_TYPES.WEAPON,
    weaponType: WEAPON_TYPES.GUN,
    damage: 0,
    cooldown: 2,
    bulletSpeed: 150,
    bulletChar: '❄',
    onHit: 'freeze',
    color: '#00ffff'
  },
  'ϟ': {
    char: 'ϟ',
    name: 'Lightning Gun',
    type: ITEM_TYPES.WEAPON,
    weaponType: WEAPON_TYPES.GUN,
    damage: 2,
    cooldown: 0.8,
    chain: true,
    chainCount: 1,
    onHit: 'stun',
    electric: true,
    bulletChar: 'ϟ',
    color: '#ffff00'
  },
  '⊕': {
    char: '⊕',
    name: 'Rocket Launcher',
    type: ITEM_TYPES.WEAPON,
    weaponType: WEAPON_TYPES.GUN,
    damage: 3,
    cooldown: 1.5,
    bulletSpeed: 250,
    explode: true,
    explodeRadius: 30,
    bulletChar: '⁍',
    color: '#ff4400'
  },
  '═': {
    char: '═',
    name: 'Plasma Rifle',
    type: ITEM_TYPES.WEAPON,
    weaponType: WEAPON_TYPES.GUN,
    damage: 2,
    cooldown: 0.7,
    pierce: true,
    bulletChar: '═',
    color: '#00ff88'
  },
  '◙': {
    char: '◙',
    name: 'Laser Cannon',
    type: ITEM_TYPES.WEAPON,
    weaponType: WEAPON_TYPES.GUN,
    damage: 5,
    cooldown: 1.2,
    bulletSpeed: 400,
    bulletChar: '─',
    color: '#ff0088'
  },
  '⊞': {
    char: '⊞',
    name: 'Scatter Gun',
    type: ITEM_TYPES.WEAPON,
    weaponType: WEAPON_TYPES.GUN,
    damage: 1,
    cooldown: 1.0,
    bulletCount: 7,
    color: '#cccccc'
  },
  '☣': {
    char: '☣',
    name: 'Venom Pistol',
    type: ITEM_TYPES.WEAPON,
    weaponType: WEAPON_TYPES.GUN,
    damage: 2,
    cooldown: 0.5,
    onHit: 'poison',
    lifesteal: 0.3,
    bulletChar: '●',
    color: '#88ff00'
  },
  '╬': {
    char: '╬',
    name: 'Stun Gun',
    type: ITEM_TYPES.WEAPON,
    weaponType: WEAPON_TYPES.GUN,
    damage: 1,
    cooldown: 0.9,
    onHit: 'stun',
    electric: true,
    bulletChar: '╬',
    color: '#8888ff'
  },
  '⊿': {
    char: '⊿',
    name: 'Ricochet Rifle',
    type: ITEM_TYPES.WEAPON,
    weaponType: WEAPON_TYPES.GUN,
    damage: 2,
    cooldown: 0.6,
    ricochet: true,
    maxRicochets: 3,
    bulletChar: '○',
    color: '#ff88ff'
  },

  // === NEW MELEE (10) ===
  '☃': {
    char: '☃',
    name: 'Ice Hammer',
    type: ITEM_TYPES.WEAPON,
    weaponType: WEAPON_TYPES.MELEE,
    weaponSubtype: 'blunt',
    damage: 4,
    windup: 0.6,
    recovery: 1.0, // Longer recovery to balance power
    attackPattern: 'shockwave',
    patternSpeed: 0.1,
    range: 24,
    onHit: 'freeze',
    knockback: 250,
    color: '#00ddff'
  },
  '≋': {
    char: '≋',
    name: 'Whip',
    type: ITEM_TYPES.WEAPON,
    weaponType: WEAPON_TYPES.MELEE,
    damage: 1,
    windup: 0.5,
    recovery: 1.0, // Longer recovery to balance range
    attackPattern: 'whipcrack',
    patternSpeed: 0.02,
    range: 40,
    meleeChar: '~',
    color: '#8b4513'
  },
  '○': {
    char: '○',
    name: 'Flail',
    type: ITEM_TYPES.WEAPON,
    weaponType: WEAPON_TYPES.MELEE,
    damage: 2,
    windup: 0.45,
    recovery: 0.15,
    attackPattern: 'ring',
    patternSpeed: 0.2,
    range: 26,
    color: '#aaaaaa'
  },
  '╫': {
    char: '╫',
    name: 'Blood Sword',
    type: ITEM_TYPES.WEAPON,
    weaponType: WEAPON_TYPES.MELEE,
    damage: 4,
    windup: 0.6,
    recovery: 0.15,
    attackPattern: 'arc',
    patternSpeed: 0.05,
    range: 22,
    isBlade: true,
    onHit: 'bleed',
    lifesteal: 0.4,
    color: '#cc0000'
  },
  '⚯': {
    char: '⚯',
    name: 'Thunder Axe',
    type: ITEM_TYPES.WEAPON,
    weaponType: WEAPON_TYPES.MELEE,
    damage: 5,
    windup: 0.75,
    recovery: 0.2,
    attackPattern: 'sweep',
    patternSpeed: 0.04,
    range: 24,
    onHit: 'stun',
    electric: true,
    chain: true,
    chainCount: 2,
    color: '#ffff00'
  },
  '◉': {
    char: '◉',
    name: 'Exploding Mace',
    type: ITEM_TYPES.WEAPON,
    weaponType: WEAPON_TYPES.MELEE,
    weaponSubtype: 'blunt',
    damage: 4,
    windup: 0.6,
    recovery: 0.3,
    attackPattern: 'shockwave',
    patternSpeed: 0.1,
    range: 20,
    explode: true,
    explodeRadius: 45,
    color: '#ff6600'
  },
  '╪': {
    char: '╪',
    name: 'Stun Baton',
    type: ITEM_TYPES.WEAPON,
    weaponType: WEAPON_TYPES.MELEE,
    weaponSubtype: 'blunt',
    damage: 2,
    windup: 0.3,
    recovery: 0.2,
    attackPattern: 'default',
    range: 18,
    onHit: 'stun',
    knockback: 200,
    color: '#0088ff'
  },
  '♣': {
    char: '♣',
    name: 'Vampire Dagger',
    type: ITEM_TYPES.WEAPON,
    weaponType: WEAPON_TYPES.MELEE,
    damage: 3,
    windup: 0.2,
    recovery: 0.4,
    attackPattern: 'multistab',
    patternSpeed: 0.05,
    range: 16,
    isBlade: true,
    lifesteal: 1.0,
    color: '#990000'
  },
  '▼': {
    char: '▼',
    name: 'Earthquake Hammer',
    type: ITEM_TYPES.WEAPON,
    weaponType: WEAPON_TYPES.MELEE,
    weaponSubtype: 'blunt',
    damage: 6,
    windup: 0.9,
    recovery: 0.3,
    attackPattern: 'shockwave',
    patternSpeed: 0.1,
    range: 20,
    knockback: 350,
    explode: true,
    explodeRadius: 60,
    color: '#8b6914'
  },
  '◇': {
    char: '◇',
    name: 'Chaos Blade',
    type: ITEM_TYPES.WEAPON,
    weaponType: WEAPON_TYPES.MELEE,
    damage: 4,
    windup: 0.6,
    recovery: 0.15,
    attackPattern: 'arc',
    patternSpeed: 0.05,
    range: 24,
    isBlade: true,
    onHit: 'burn', // Random effect would need special handling
    color: '#ff00ff'
  },

  // === NEW BOWS (8) ===
  '❅': {
    char: '❅',
    name: 'Ice Bow',
    type: ITEM_TYPES.WEAPON,
    weaponType: WEAPON_TYPES.BOW,
    damage: 2,
    cooldown: 1.8,
    maxUses: 15,  // Fewer uses for elemental bow
    onHit: 'freeze',
    arrowChar: '❅',
    color: '#00ddff'
  },
  '⋙': {
    char: '⋙',
    name: 'Multi-Shot Bow',
    type: ITEM_TYPES.WEAPON,
    weaponType: WEAPON_TYPES.BOW,
    damage: 2,
    cooldown: 2.2,
    maxUses: 12,  // Fewer uses since it fires 3 arrows
    arrowCount: 3,
    color: '#ff8800'
  },
  '⊛': {
    char: '⊛',
    name: 'Explosive Bow',
    type: ITEM_TYPES.WEAPON,
    weaponType: WEAPON_TYPES.BOW,
    damage: 3,
    cooldown: 2.5,
    maxUses: 10,  // Very limited uses for powerful explosive bow
    explode: true,
    explodeRadius: 40,
    arrowChar: '●',
    color: '#ff4400'
  },
  '◈': {
    char: '◈',
    name: 'Homing Bow',
    type: ITEM_TYPES.WEAPON,
    weaponType: WEAPON_TYPES.BOW,
    damage: 3,
    cooldown: 2.0,
    maxUses: 12,  // Limited uses for homing bow
    homing: true,
    arrowChar: '◈',
    color: '#ff00ff'
  },
  '⇶': {
    char: '⇶',
    name: 'Piercing Bow',
    type: ITEM_TYPES.WEAPON,
    weaponType: WEAPON_TYPES.BOW,
    damage: 3,
    cooldown: 1.8,
    maxUses: 18,  // Good uses for piercing bow
    pierce: true,
    arrowChar: '⇶',
    color: '#00ff00'
  },
  '≈': {
    char: '≈',
    name: 'Chain Bow',
    type: ITEM_TYPES.WEAPON,
    weaponType: WEAPON_TYPES.BOW,
    damage: 2,
    cooldown: 2.2,
    maxUses: 12,  // Limited uses for chain lightning bow
    chain: true,
    chainCount: 2,
    onHit: 'stun',
    electric: true,
    arrowChar: '~',
    color: '#ffff00'
  },
  '⋰': {
    char: '⋰',
    name: 'Split Bow',
    type: ITEM_TYPES.WEAPON,
    weaponType: WEAPON_TYPES.BOW,
    damage: 2,
    cooldown: 2.0,
    maxUses: 15,  // Limited uses since arrows split
    split: true,
    splitCount: 3,
    arrowChar: '→',
    color: '#00ffff'
  },
  '⋯': {
    char: '⋯',
    name: 'Burst Bow',
    type: ITEM_TYPES.WEAPON,
    weaponType: WEAPON_TYPES.BOW,
    damage: 2,
    cooldown: 1.8,
    maxUses: 10,  // Very limited uses (fires 3 arrows per use)
    attackPattern: 'burst',
    color: '#ff8888'
  },
  '☠': {
    char: '☠',
    name: 'Cursed Skull',
    type: ITEM_TYPES.CONSUMABLE,
    effect: 'curse',
    damage: 10,
    radius: 60,
    oneShot: true, // Powerful one-time nuke
    color: '#ffffff'
  },
  '♥': {
    char: '♥',
    name: 'Heart',
    type: ITEM_TYPES.CONSUMABLE,
    effect: 'heal',
    amount: 10,
    cooldown: 20, // Reusable with 20s cooldown
    color: '#ff0000'
  },
  '★': {
    char: '★',
    name: 'Lucky Coin',
    type: ITEM_TYPES.CONSUMABLE,
    effect: 'luck',
    duration: 60,
    oneShot: true, // One-time luck buff
    color: '#ffff00'
  },

  // Utility items
  '●': {
    char: '●',
    name: 'Slime Bomb',
    type: ITEM_TYPES.TRAP,
    oneShot: true,
    triggerRadius: 24,
    effectRadius: 80,
    effect: 'slow',
    effectDuration: 8.0,
    color: '#00ff00'
  },
  '■': {
    char: '■',
    name: 'Metal Block',
    type: ITEM_TYPES.CONSUMABLE,
    effect: 'block',
    cooldown: 15, // Reusable with 15s cooldown
    color: '#888888'
  },
  '=': {
    char: '=',
    name: 'Platform',
    type: ITEM_TYPES.CONSUMABLE,
    effect: 'platform',
    color: '#8b4513'
  },
  'P': {
    char: 'P',
    name: 'Poison Flask',
    type: ITEM_TYPES.CONSUMABLE,
    effect: 'poison',
    cooldown: 10, // Reusable with 10s cooldown
    color: '#44ff44'
  },
  'T': {
    char: 'T',
    name: 'Tonic',
    type: ITEM_TYPES.CONSUMABLE,
    effect: 'cleanse',
    cooldown: 8, // Reusable with 8s cooldown
    color: '#aaddff'
  },
  'ω': {
    char: 'ω',
    name: 'Smoke Bomb',
    type: ITEM_TYPES.CONSUMABLE,
    effect: 'invuln',
    duration: 3.5, // 3.5 seconds of invulnerability
    cooldown: 25, // Reusable with 25s cooldown (powerful)
    color: '#aaaaaa'
  },
  'Z': {
    char: 'Z',
    name: 'Venom Vial',
    type: ITEM_TYPES.CONSUMABLE,
    effect: 'venomcloud',
    cooldown: 12, // Reusable with 12s cooldown
    color: '#00ff44'
  },
  'J': {
    char: 'J',
    name: 'Jolt Jar',
    type: ITEM_TYPES.CONSUMABLE,
    effect: 'jolt',
    cooldown: 15, // Reusable with 15s cooldown
    color: '#ffff00'
  },
  'S': {
    char: 'S',
    name: 'Shield',
    type: ITEM_TYPES.CONSUMABLE,
    effect: 'shield',
    charges: 3,
    rechargeCooldown: 5, // Shields recharge, not consumed
    color: '#aaddff'
  },
  'U': {
    char: 'U',
    name: 'Tower Shield',
    type: ITEM_TYPES.CONSUMABLE,
    effect: 'bulwark',
    charges: 2,
    rechargeCooldown: 8, // Shields recharge, not consumed
    color: '#8888ff'
  },
  'r': {
    char: 'r',
    name: 'Rubber Boots',
    type: ITEM_TYPES.CONSUMABLE,
    effect: 'waterImmunity',
    duration: 25,
    cooldown: 30, // Reusable with 30s cooldown
    color: '#ffdd44'
  },
  'o': {
    char: 'o',
    name: 'Path Amulet',
    type: ITEM_TYPES.CONSUMABLE,
    effect: 'pathTracker',
    passive: true, // Passive effect when equipped (no activation)
    color: '#ffaa00'
  },
  'v': {
    char: 'v',
    name: 'Steam Vial',
    type: ITEM_TYPES.CONSUMABLE,
    effect: 'throwSteam',
    radius: 64,
    duration: 8.0,
    cooldown: 10, // Reusable with 10s cooldown
    color: '#aaaaaa'
  },

  // === TRAPS (one-time) ===
  '[': {
    char: '[',
    name: 'Freeze Trap',
    type: ITEM_TYPES.TRAP,
    oneShot: true,
    triggerRadius: 24,
    effectRadius: 96,
    effect: 'freeze',
    effectDuration: 10.0,
    color: '#00ddff'
  },
  '{': {
    char: '{',
    name: 'Stun Trap',
    type: ITEM_TYPES.TRAP,
    oneShot: true,
    triggerRadius: 24,
    effectRadius: 96,
    effect: 'stun',
    electric: true,
    effectDuration: 6.0,
    color: '#ffff00'
  },
  '^': {
    char: '^',
    name: 'Fire Trap',
    type: ITEM_TYPES.TRAP,
    oneShot: true,
    triggerRadius: 24,
    effectRadius: 112,
    effect: 'burn',
    effectDuration: 6.0,
    color: '#ff4400'
  },
  ';': {
    char: ';',
    name: 'Sleep Bomb',
    type: ITEM_TYPES.TRAP,
    oneShot: true,
    triggerRadius: 32,
    effectRadius: 112,
    effect: 'sleep',
    effectDuration: 12.0,
    color: '#9944ff'
  },
  "'": {
    char: "'",
    name: 'Charm Lure',
    type: ITEM_TYPES.TRAP,
    oneShot: true,
    triggerRadius: 32,
    effectRadius: 128,
    effect: 'charm',
    effectDuration: 8.0,
    color: '#ff44ff'
  },

  // === PERSISTENT PLACEABLES ===
  '"': {
    char: '"',
    name: 'Music Box',
    type: ITEM_TYPES.TRAP,
    oneShot: false,
    effectRadius: 80,
    effect: 'sleep',
    effectDuration: 6.0,
    activeDuration: 20.0,
    color: '#9944ff'
  },
  ':': {
    char: ':',
    name: 'Noise-maker',
    type: ITEM_TYPES.TRAP,
    oneShot: false,
    effectRadius: 128,
    effect: 'noise',
    color: '#ffff00'
  },
  ']': {
    char: ']',
    name: 'Tesla Coil',
    type: ITEM_TYPES.TRAP,
    oneShot: false,
    effectRadius: 64,
    effect: 'stun',
    electric: true,
    tickInterval: 2.5,
    damage: 2,
    stunDuration: 0.8,
    color: '#00ffff'
  },
  ',': {
    char: ',',
    name: 'Goo Dispenser',
    type: ITEM_TYPES.TRAP,
    oneShot: false,
    effectRadius: 80,
    effect: 'goo',
    color: '#00ff00'
  },
  '߃': {
    char: '߃',
    name: 'Vault Key',
    type: ITEM_TYPES.WEAPON,
  }
};

// Ingredients (crafting materials)
export const INGREDIENTS = {
  'f': { char: 'f', name: 'Fur', color: '#8b4513' },
  't': { char: 't', name: 'Teeth', color: '#ffffff' },
  'g': { char: 'g', name: 'Goo', color: '#00ff00' },
  'w': { char: 'w', name: 'Wing', color: '#cccccc' },
  'c': { char: 'c', name: 'Coin', color: '#ffff00' },
  'b': { char: 'b', name: 'Bone', color: '#eeeeee' },
  'm': { char: 'm', name: 'Meat', color: '#ff4444' },
  's': { char: 's', name: 'Scale', color: '#ff00ff' },
  'F': { char: 'F', name: 'Fire Essence', color: '#ff4400' },
  'M': { char: 'M', name: 'Metal', color: '#aaaaaa' },
  '~': { char: '~', name: 'String', color: '#cccccc' },
  '|': { char: '|', name: 'Stick', color: '#8b4513' },
  'a': { char: 'a', name: 'Ash', color: '#888888' },
  'd': { char: 'd', name: 'Dust', color: '#bbbbaa' },
  'e': { char: 'e', name: 'Eye', color: '#ffff00' },
  'h': { char: 'h', name: 'Herb', color: '#44cc44' },
  'i': { char: 'i', name: 'Ice', color: '#aaddff' },
  'j': { char: 'j', name: 'Jaw', color: '#cccccc' },
  'k': { char: 'k', name: 'Silk', color: '#cc88ff' },
  'l': { char: 'l', name: 'Leaf', color: '#33aa33' },
  'o': { char: 'o', name: 'Oil', color: '#886644' },
  'r': { char: 'r', name: 'Root', color: '#996633' },
  'v': { char: 'v', name: 'Venom', color: '#00ff44' },
  '0': { char: '0', name: 'Rock', color: '#888888' }
};

export function getItemData(char) {
  return ITEMS[char] || INGREDIENTS[char] || null;
}

export function isIngredient(char) {
  return INGREDIENTS[char] !== undefined;
}

export function isItem(char) {
  return ITEMS[char] !== undefined;
}

// ============================================================================
// RARITY SYSTEM
// ============================================================================

export const RARITY = {
  COMMON: 'common',
  UNCOMMON: 'uncommon',
  RARE: 'rare',
  EPIC: 'epic'
};

// Rarity weights for drop calculations
// Higher values = more likely to drop
const RARITY_WEIGHTS = {
  [RARITY.COMMON]: 100,
  [RARITY.UNCOMMON]: 30,
  [RARITY.RARE]: 10,
  [RARITY.EPIC]: 2
};

// ============================================================================
// THEMATIC DROP TABLES
// ============================================================================

// Drop tables organized by theme and rarity
// Each table contains chars for ingredients, items, armor, consumables
export const DROP_TABLES = {
  undead: {
    ingredients: {
      [RARITY.COMMON]: ['b', 'a', 'd'],      // Bone, Ash, Dust
      [RARITY.UNCOMMON]: ['k', 'e'],         // Silk, Eye
      [RARITY.RARE]: ['j']                   // Jaw
    },
    armor: {
      [RARITY.COMMON]: [],                
      [RARITY.UNCOMMON]: ['A'],              // Bone Armor
      [RARITY.RARE]: []
    },
    consumables: {
      [RARITY.COMMON]: ['H'],                // Health Potion
      [RARITY.UNCOMMON]: [],
      [RARITY.RARE]: []
    }
  },

  slime: {
    ingredients: {
      [RARITY.COMMON]: ['g'],                // Goo
      [RARITY.UNCOMMON]: ['b', 'e'],         // Bone, Eye
      [RARITY.RARE]: ['j']                   // Jaw
    },
    armor: {
      [RARITY.COMMON]: [],                
      [RARITY.UNCOMMON]: ['O'],              // Slime Suit
      [RARITY.RARE]: []
    },
    consumables: {
      [RARITY.COMMON]: [],                // Health Potion
      [RARITY.UNCOMMON]: ['@'],             // Bomb (slime bombs)
      [RARITY.RARE]: []
    }
  },

  beast: {
    ingredients: {
      [RARITY.COMMON]: ['f', 't', 'm', 'w'], // Fur, Teeth, Meat, Wing
      [RARITY.UNCOMMON]: ['b', 'j'],         // Bone, Jaw
      [RARITY.RARE]: ['e']                   // Eye
    },
    armor: {
      [RARITY.COMMON]: ['V', 'L'],           // Fur Vest, Leather Armor
      [RARITY.UNCOMMON]: ['N'],              // Ninja Garb
      [RARITY.RARE]: []
    },
    consumables: {
      [RARITY.COMMON]: ['H'],                // Health Potion
      [RARITY.UNCOMMON]: ['∞'],              // Wings (speed boost)
      [RARITY.RARE]: ['♥']                   // Heart (heal)
    }
  },

  humanoid: {
    ingredients: {
      [RARITY.COMMON]: ['c', 'M', '~'],      // Coin, Metal, String
      [RARITY.UNCOMMON]: ['F'],              // Fire Essence
      [RARITY.RARE]: []
    },
    armor: {
      [RARITY.COMMON]: ['L', '⛓'],           // Leather Armor, Chain Mail
      [RARITY.UNCOMMON]: ['W'],              // Warplate
      [RARITY.RARE]: ['K']                   // Dragon Scale Armor
    },
    consumables: {
      [RARITY.COMMON]: ['H'],                // Health Potion
      [RARITY.UNCOMMON]: ['@'],              // Bomb
      [RARITY.RARE]: ['★']                   // Lucky Coin
    }
  },

  elemental_fire: {
    ingredients: {
      [RARITY.COMMON]: ['F', 'a'],           // Fire Essence, Ash
      [RARITY.UNCOMMON]: ['d'],              // Dust
      [RARITY.RARE]: []
    },
    armor: {
      [RARITY.COMMON]: ['E'],                // Ember Cloak
      [RARITY.UNCOMMON]: [],
      [RARITY.RARE]: []
    },
    consumables: {
      [RARITY.COMMON]: [],
      [RARITY.UNCOMMON]: [],
      [RARITY.RARE]: []
    }
  },

  elemental_ice: {
    ingredients: {
      [RARITY.COMMON]: ['i', '0'],           // Ice, Rock
      [RARITY.UNCOMMON]: ['M'],              // Metal
      [RARITY.RARE]: []
    },
    armor: {
      [RARITY.COMMON]: ['I'],                // Ice Plate
      [RARITY.UNCOMMON]: [],
      [RARITY.RARE]: []
    },
    consumables: {
      [RARITY.COMMON]: [],
      [RARITY.UNCOMMON]: [],
      [RARITY.RARE]: []
    }
  },

  poison: {
    ingredients: {
      [RARITY.COMMON]: ['v', '~'],           // Venom, String
      [RARITY.UNCOMMON]: ['g'],              // Goo
      [RARITY.RARE]: ['h']                   // Herb
    },
    armor: {
      [RARITY.COMMON]: [],
      [RARITY.UNCOMMON]: [],
      [RARITY.RARE]: []
    },
    consumables: {
      [RARITY.COMMON]: [],
      [RARITY.UNCOMMON]: [],
      [RARITY.RARE]: []
    }
  },

  dragon: {
    ingredients: {
      [RARITY.COMMON]: ['s'],                // Scale
      [RARITY.UNCOMMON]: ['F'],              // Fire Essence
      [RARITY.RARE]: ['M']                   // Metal
    },
    armor: {
      [RARITY.COMMON]: [],
      [RARITY.UNCOMMON]: ['K'],              // Dragon Scale Armor
      [RARITY.RARE]: []
    },
    consumables: {
      [RARITY.COMMON]: [],
      [RARITY.UNCOMMON]: ['♦'],              // Dragon Heart
      [RARITY.RARE]: []
    }
  },

  // Generic/random drops for crates, barrels, etc.
  generic: {
    ingredients: {
      [RARITY.COMMON]: ['f', 't', 'g', 'w', 'c', 'b', 'm', 's', '|', '~'],
      [RARITY.UNCOMMON]: ['F', 'M', 'a', 'd', 'e', 'h', 'i', 'v'],
      [RARITY.RARE]: ['j', 'k', 'l', 'o', 'r', '0']
    },
    armor: {
      [RARITY.COMMON]: ['A', 'V', 'L'],
      [RARITY.UNCOMMON]: ['C', 'R', 'W', 'N'],
      [RARITY.RARE]: ['E', 'I', 'K']
    },
    consumables: {
      [RARITY.COMMON]: ['H'],
      [RARITY.UNCOMMON]: ['@', '●'],
      [RARITY.RARE]: ['♥', '★', '∞', '♦']
    }
  }
};

// ============================================================================
// DROP SELECTION FUNCTIONS
// ============================================================================

/**
 * Get weighted random item from a rarity-organized pool
 * @param {Object} rarityPool - Object with RARITY keys containing char arrays
 * @param {Object} weights - Rarity weight multipliers (e.g., {common: 1.0, rare: 2.0})
 * @returns {string|null} - Selected character or null if pool is empty
 */
export function getWeightedRandomFromPool(rarityPool, weights = {}) {
  // Default weights favor common drops
  const defaultWeights = {
    [RARITY.COMMON]: 1.0,
    [RARITY.UNCOMMON]: 0.3,
    [RARITY.RARE]: 0.1,
    [RARITY.EPIC]: 0.02
  };

  const finalWeights = { ...defaultWeights, ...weights };

  // Build weighted array of all possible drops
  const weightedItems = [];

  for (const [rarity, chars] of Object.entries(rarityPool)) {
    const weight = finalWeights[rarity] || 0;
    const baseWeight = RARITY_WEIGHTS[rarity] || 1;
    const finalWeight = Math.round(baseWeight * weight);

    // Add each char multiple times based on weight
    for (const char of chars) {
      for (let i = 0; i < finalWeight; i++) {
        weightedItems.push(char);
      }
    }
  }

  if (weightedItems.length === 0) return null;
  return weightedItems[Math.floor(Math.random() * weightedItems.length)];
}

/**
 * Get random drop from a thematic drop table
 * @param {string} tableName - Name of drop table (e.g., 'undead', 'beast')
 * @param {string} category - 'ingredients', 'armor', or 'consumables'
 * @param {Object} rarityWeights - Optional rarity weight multipliers
 * @returns {string|null} - Selected character or null
 */
export function getRandomDrop(tableName, category, rarityWeights = {}) {
  const table = DROP_TABLES[tableName];
  if (!table || !table[category]) return null;

  return getWeightedRandomFromPool(table[category], rarityWeights);
}

/**
 * Predefined rarity weight profiles for different enemy types
 */
export const RARITY_PROFILES = {
  // Basic enemies - mostly common drops
  weak: {
    [RARITY.COMMON]: 1.0,
    [RARITY.UNCOMMON]: 0.15,
    [RARITY.RARE]: 0.02,
    [RARITY.EPIC]: 0.0
  },

  // Standard enemies - balanced drops
  normal: {
    [RARITY.COMMON]: 1.0,
    [RARITY.UNCOMMON]: 0.4,
    [RARITY.RARE]: 0.1,
    [RARITY.EPIC]: 0.01
  },

  // Elite enemies - better rare chance
  elite: {
    [RARITY.COMMON]: 0.8,
    [RARITY.UNCOMMON]: 1.0,
    [RARITY.RARE]: 0.3,
    [RARITY.EPIC]: 0.05
  },

  // Boss enemies - favor rare/epic
  boss: {
    [RARITY.COMMON]: 0.5,
    [RARITY.UNCOMMON]: 1.0,
    [RARITY.RARE]: 1.0,
    [RARITY.EPIC]: 0.2
  }
};

/**
 * Generate drops for an enemy based on its drop table and rarity profile
 * @param {string} dropTableName - Name of the drop table (e.g., 'undead')
 * @param {string} rarityProfileName - Name of rarity profile (e.g., 'weak', 'elite')
 * @param {number} dropCount - Number of items to drop (default: 1-2)
 * @returns {Array<string>} - Array of item/ingredient chars to drop
 */
export function generateEnemyDrops(dropTableName, rarityProfileName = 'normal', dropCount = null) {
  const table = DROP_TABLES[dropTableName];
  const profile = RARITY_PROFILES[rarityProfileName] || RARITY_PROFILES.normal;

  if (!table) return [];

  // Determine how many items to drop (1-2 by default, more for bosses)
  const count = dropCount || (rarityProfileName === 'boss' ? 2 : Math.random() < 0.6 ? 1 : 2);

  const drops = [];

  for (let i = 0; i < count; i++) {
    // Weighted category selection: 80% ingredients, 10% armor, 10% consumables
    const categoryRoll = Math.random();
    let category;
    if (categoryRoll < 0.8) category = 'ingredients';
    else if (categoryRoll < 0.9) category = 'armor';
    else category = 'consumables';

    const drop = getRandomDrop(dropTableName, category, profile);
    if (drop) drops.push(drop);
  }

  return drops;
}
