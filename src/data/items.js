import { COLORS, GRID } from '../game/GameConfig.js';

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
  BOW: 'BOW',
  WAND: 'WAND',
  FISHING_ROD: 'FISHING_ROD'
};

// Tier pools for duplicate-upgrade crafting. Normal recipes take priority.
// Organized by weaponSubtype so two staffs can't produce a sword result.
// Weapons not listed here (spear, staff, whip, flail, dagger) have no upgrade path.
export const WEAPON_TIERS = {
  GUN: [
    ['¬'],
    ['⌂', 'X'],
    ['⌐', '❄', 'ϟ', '⊕', '═', '◙', '⊞', '☣', '╬', '⊿', '☼']
  ],
  BOW: [
    [')'],
    ['⟩'],
    ['❅', '⋙', '⊛', '◈', '⇶', '≈', '⋰', '⋯']
  ],
  sword: [
    ['†'],
    ['‡', '⌘', '╪'],
    ['⚔', '♠', '◇']
  ],
  axe: [
    ['⛏'],
    ['⊤'],
    ['⚯']
  ],
  hammer: [
    ['⊥'],
    ['☃', '◉'],
    ['▼', '⚒']
  ]
};

// Item definitions
// Item definitions are organized by class → type → tier:
//   WEAPON   → GUN / BOW / MELEE (subtype) → tier
//   ARMOR    → tier (T1 basic / T2 mid / T3 exotic / infused robes)
//   CONSUMABLE → role (heal / buff / movement / defensive / throwable / utility / oil)
//   TRAP     → one-shot / persistent
//
// Tier groupings for upgradable weapon classes mirror WEAPON_TIERS above.
export const ITEMS = {
  // ============================================================================
  // WEAPONS — GUN
  // ============================================================================

  // ── GUN — Tier 1 ──────────────────────────────────────────────────────────
  '¬': {
    char: '¬',
    name: 'Gun',
    type: ITEM_TYPES.WEAPON,
    weaponType: WEAPON_TYPES.GUN,
    damage: 1,
    cooldown: 1.5,
    maxUses: 6,
    accuracy: .85,
    reloadTime: 5,
    reloadType: 'magazine',
    color: COLORS.ITEM
  },
  '⊸': {
    char: '⊸',
    name: 'Sling',
    type: ITEM_TYPES.WEAPON,
    weaponType: WEAPON_TYPES.GUN,
    damage: 1,
    cooldown: 2,
    windup: .5,
    bulletSpeed: 200,
    bulletSize: 0.6,
    bulletRange: 240,
    maxUses: 5,
    accuracy: .9,
    reloadTime: 5,
    reloadType: 'magazine',
    color: '#aaaaaa'
  },

  // ── GUN — Tier 2 ──────────────────────────────────────────────────────────
  '⌂': {
    char: '⌂',
    name: 'Shotgun',
    type: ITEM_TYPES.WEAPON,
    weaponType: WEAPON_TYPES.GUN,
    damage: 1,
    cooldown: 2.0,
    bulletCount: 3,
    bulletRange: 120,
    accuracy: 0.7,
    maxUses: 2,
    reloadTime: 6,
    reloadType: 'magazine',
    color: COLORS.ITEM
  },
  'X': {
    char: 'X',
    name: 'Dual Pistols',
    type: ITEM_TYPES.WEAPON,
    weaponType: WEAPON_TYPES.GUN,
    damage: 1,
    cooldown: 0.8,
    inaccuracy: 0.5,
    accuracy: 0.65,
    maxUses: 12,
    reloadTime: 7,
    reloadType: 'magazine',
    color: COLORS.ITEM
  },
  '※': {
    char: '※',
    name: 'Heavy Pistols',
    type: ITEM_TYPES.WEAPON,
    weaponType: WEAPON_TYPES.GUN,
    damage: 2,
    cooldown: 2,
    maxUses: 8,
    reloadTime: 6,
    reloadType: 'magazine',
    color: '#aaaaaa'
  },
  'ƒ': {
    char: 'ƒ',
    name: "Fester's Gun",
    type: ITEM_TYPES.WEAPON,
    weaponType: WEAPON_TYPES.GUN,
    damage: 2,
    cooldown: 2.0,
    bulletChar: '*',
    bulletRange: 700,
    loopOmega: Math.PI * 4,
    loopRadius: 10,
    loopLinearSpeed: 130,
    accuracy: 0.9,
    maxUses: 6,
    reloadTime: 7,
    reloadType: 'magazine',
    color: '#bb88ff'
  },

  // ── GUN — Tier 3 ──────────────────────────────────────────────────────────
  '⌐': {
    char: '⌐',
    name: 'Machine Gun',
    type: ITEM_TYPES.WEAPON,
    weaponType: WEAPON_TYPES.GUN,
    damage: 1,
    cooldown: 0.4,
    maxUses: 10,
    inaccuracy: 0.3,
    accuracy: 0.55,
    reloadTime: 10,
    reloadType: 'magazine',
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
    maxUses: 4,
    reloadTime: 6,
    reloadType: 'energy',
    color: '#00ffff'
  },
  'ϟ': {
    char: 'ϟ',
    name: 'Lightning Gun',
    type: ITEM_TYPES.WEAPON,
    weaponType: WEAPON_TYPES.GUN,
    damage: 1,
    cooldown: 0.8,
    chain: true,
    chainCount: 1,
    onHit: 'stun',
    electric: true,
    requiresCharge: true,
    bulletChar: 'ϟ',
    maxUses: 5,
    reloadTime: 7,
    reloadType: 'energy',
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
    maxUses: 3,
    reloadTime: 8,
    reloadType: 'magazine',
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
    maxUses: 8,
    reloadTime: 6,
    reloadType: 'energy',
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
    maxUses: 4,
    reloadTime: 8,
    reloadType: 'energy',
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
    accuracy: 0.55,
    maxUses: 3,
    reloadTime: 7,
    reloadType: 'magazine',
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
    accuracy: 0.75,
    maxUses: 10,
    reloadTime: 6,
    reloadType: 'magazine',
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
    maxUses: 6,
    reloadTime: 6,
    reloadType: 'energy',
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
    maxUses: 8,
    reloadTime: 6,
    reloadType: 'magazine',
    color: '#ff88ff'
  },
  '☼': {
    char: '☼',
    name: 'Dragon Shotgun',
    type: ITEM_TYPES.WEAPON,
    weaponType: WEAPON_TYPES.GUN,
    damage: 2,
    cooldown: 3,
    bulletCount: 8,
    attackPattern: 'ring',
    accuracy: 0.65,
    maxUses: 2,
    reloadTime: 8,
    reloadType: 'magazine',
    color: '#ff00ff'
  },

  // ============================================================================
  // WEAPONS — BOW
  // ============================================================================

  // ── BOW — Tier 1 ──────────────────────────────────────────────────────────
  ')': {
    char: ')',
    name: 'Bow',
    type: ITEM_TYPES.WEAPON,
    weaponType: WEAPON_TYPES.BOW,
    damage: 2,
    cooldown: 1.5,
    maxUses: 10,  // 10 arrows per room
    critChance: 0.10,
    color: COLORS.ITEM
  },

  // ── BOW — Tier 2 ──────────────────────────────────────────────────────────
  '⟩': {
    char: '⟩',
    name: 'Fire Bow',
    type: ITEM_TYPES.WEAPON,
    weaponType: WEAPON_TYPES.BOW,
    damage: 3,
    cooldown: 1.8,
    maxUses: 5,  // Very limited - one of the best attacks
    onHit: 'burn',
    critChance: 0.12,
    color: '#ff4400'
  },
  '⇒': {
    char: '⇒',
    name: 'Sky Bow',
    type: ITEM_TYPES.WEAPON,
    weaponType: WEAPON_TYPES.BOW,
    damage: 3,
    cooldown: 1.2,
    maxUses: 10,
    critChance: 0.10,
    color: '#00ffff'
  },
  '⋙': {
    char: '⋙',
    name: 'Multi-Shot Bow',
    type: ITEM_TYPES.WEAPON,
    weaponType: WEAPON_TYPES.BOW,
    damage: 2,
    cooldown: 2.2,
    maxUses: 9,  // 3 trigger pulls × 3 arrows
    arrowCount: 3,
    critChance: 0.12,  // each arrow rolls independently
    color: '#ff8800'
  },

  // ── BOW — Tier 3 ──────────────────────────────────────────────────────────
  '❅': {
    char: '❅',
    name: 'Ice Bow',
    type: ITEM_TYPES.WEAPON,
    weaponType: WEAPON_TYPES.BOW,
    damage: 2,
    cooldown: 1.8,
    maxUses: 5,  // Fewer uses for elemental bow
    onHit: 'freeze',
    critChance: 0.15,
    arrowChar: '❅',
    color: '#00ddff'
  },
  '⊛': {
    char: '⊛',
    name: 'Explosive Bow',
    type: ITEM_TYPES.WEAPON,
    weaponType: WEAPON_TYPES.BOW,
    damage: 3,
    cooldown: 2.5,
    maxUses: 3,  // Very limited uses for powerful explosive bow
    explode: true,
    explodeRadius: 40,
    arrowChar: '●',
    color: '#ff4400'
    // no critChance — AoE + 1.5× damage would be too powerful
  },
  '◈': {
    char: '◈',
    name: 'Homing Bow',
    type: ITEM_TYPES.WEAPON,
    weaponType: WEAPON_TYPES.BOW,
    damage: 3,
    cooldown: 2.0,
    maxUses: 5,
    homing: true,
    critChance: 0.12,  // compensates for the auto-aim skill trade-off
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
    maxUses: 5,
    pierce: true,
    critChance: 0.15,  // crit propagates through pierced enemies
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
    maxUses: 5,  // Limited uses for chain lightning bow
    chain: true,
    chainCount: 2,
    onHit: 'stun',
    electric: true,
    critChance: 0.12,
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
    maxUses: 5,
    split: true,
    splitCount: 3,
    critChance: 0.12,  // each split arrow rolls independently
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
    maxUses: 30,  // 10 trigger pulls × 3 arrows
    attackPattern: 'burst',
    critChance: 0.12,
    color: '#ff8888'
  },
  // Zelda-style boomerang: flies out, returns to player along a straight-line
  // toward their current position (no curve). First enemy hit also chain-damages
  // nearby enemies in a tight radius. One shot per room.
  '↩': {
    char: '↩',
    name: 'Boomerang',
    type: ITEM_TYPES.WEAPON,
    weaponType: WEAPON_TYPES.BOW,
    damage: 1,
    cooldown: 1.5,
    maxUses: 1,
    critChance: 0.10,
    boomerang: true,
    boomerangBaseDuration: 0.45,  // seconds before return triggers (no-charge)
    boomerangChargeBonus: 0.55,   // additional seconds at full charge
    boomerangHitDefer: 0.18,      // seconds added to the return timer per enemy hit
    chainRadius: 32,              // ~1 cell — chain damage radius around first hit
    color: '#ffaa44'
  },

  // ============================================================================
  // WEAPONS — MELEE
  // ============================================================================

  // ── MELEE / sword — Tier 1 ────────────────────────────────────────────────
  '†': {
    char: '†',
    name: 'Sword',
    type: ITEM_TYPES.WEAPON,
    weaponType: WEAPON_TYPES.MELEE,
    weaponSubtype: 'sword',
    damage: 2,
    windup: 0.3,
    recovery: 0.8,
    patternSpeed: 0.05,
    range: 20,
    color: COLORS.ITEM
  },

  // ── MELEE / sword — Legendary (uncraftable) ──────────────────────────────
  // Stats mirror Tier 1 Sword; the unique behavior lives in CombatSystem:
  // striking an exit letter cycles it forward through EXIT_LETTERS.
  '§': {
    char: '§',
    name: 'Sword of the Letter',
    type: ITEM_TYPES.WEAPON,
    weaponType: WEAPON_TYPES.MELEE,
    weaponSubtype: 'sword',
    damage: 2,
    windup: 0.3,
    recovery: 0.5,
    patternSpeed: 0.05,
    range: 20,
    cyclesExitLetter: true,
    color: '#cc88ff'
  },

  // ── MELEE / sword — Tier 2 ────────────────────────────────────────────────
  '⫯': {
    char: '⫯',
    name: 'Longsword',
    type: ITEM_TYPES.WEAPON,
    weaponType: WEAPON_TYPES.MELEE,
    weaponSubtype: 'sword',
    damage: 2,
    windup: 0.5,
    recovery: 1.0,
    patternSpeed: 0.07,
    range: 30,         // 1.5× base sword reach
    drawScale: 1.3,    // strike rendered larger to telegraph the longer reach
    critChance: 0.20,
    color: '#ccccdd'
  },
  '‡': {
    char: '‡',
    name: 'Flame Sword',
    type: ITEM_TYPES.WEAPON,
    weaponType: WEAPON_TYPES.MELEE,
    weaponSubtype: 'sword',
    damage: 3,
    windup: 0.45,
    recovery: 0.8,
    patternSpeed: 0.05,
    range: 20,
    onHit: 'burn',
    color: '#ff4400'
  },
  '⌘': {
    char: '⌘',
    name: 'Dragon Blade',
    type: ITEM_TYPES.WEAPON,
    weaponType: WEAPON_TYPES.MELEE,
    weaponSubtype: 'sword',
    damage: 5,
    windup: 0.75,
    recovery: 0.25,
    patternSpeed: 0.05,
    range: 24,
    color: '#ff00ff'
  },
  '╪': {
    char: '╪',
    name: 'Lava Sword',
    type: ITEM_TYPES.WEAPON,
    weaponType: WEAPON_TYPES.MELEE,
    weaponSubtype: 'sword',
    damage: 3,
    windup: 0.5,
    recovery: 0.85,
    patternSpeed: 0.05,
    range: 20,
    attackPattern: 'arc',
    onHit: 'burn',
    placesLava: true,
    color: '#ff6600'
  },
  'Ϟ': {
    char: 'Ϟ',
    name: 'Lightning Sword',
    type: ITEM_TYPES.WEAPON,
    weaponType: WEAPON_TYPES.MELEE,
    weaponSubtype: 'sword',
    damage: 2,
    windup: 0.4,
    recovery: 0.8,
    patternSpeed: 0.05,
    range: 20,
    callsLightning: true,
    lightningDelay: 0.6,
    lightningDamage: 4,
    lightningRadius: 19,        // ~1.2 cells
    color: '#ffee44'
  },

  // ── MELEE / sword — Tier 3 ────────────────────────────────────────────────
  '⚔': {
    char: '⚔',
    name: 'Legendary Flame Sword',
    type: ITEM_TYPES.WEAPON,
    weaponType: WEAPON_TYPES.MELEE,
    weaponSubtype: 'sword',
    damage: 6,
    windup: 0.9,
    recovery: 0.7,
    patternSpeed: 0.05,
    range: 24,
    onHit: 'burn',
    color: '#ffaa00'
  },
  '☤': {
    char: '☤',
    name: 'Venom Blade',
    type: ITEM_TYPES.WEAPON,
    weaponType: WEAPON_TYPES.MELEE,
    weaponSubtype: 'sword',
    damage: 5,
    windup: 0.75,
    recovery: 0.15,
    patternSpeed: 0.05,
    range: 24,
    onHit: 'poison',
    poisonStacks: true,
    color: '#00ff00'
  },
  '♠': {
    char: '♠',
    name: 'Acid Blade',
    type: ITEM_TYPES.WEAPON,
    weaponType: WEAPON_TYPES.MELEE,
    weaponSubtype: 'dagger',
    damage: 3,
    windup: 0.2,
    recovery: 0.4,
    patternSpeed: 0.05,
    range: 20,
    onHit: 'poison',
    acidBlade: true,
    color: '#44ff00'
  },
  '◇': {
    char: '◇',
    name: 'Chaos Blade',
    type: ITEM_TYPES.WEAPON,
    weaponType: WEAPON_TYPES.MELEE,
    weaponSubtype: 'sword',
    damage: 4,
    windup: 0.6,
    recovery: 0.15,
    patternSpeed: 0.05,
    range: 24,
    randomOnHit: ['burn', 'poison', 'freeze', 'stun'],
    color: '#ff00ff'
  },

  // ── MELEE / axe — Tier 1 ──────────────────────────────────────────────────
  '⛏': {
    char: '⛏',
    name: 'Pickaxe',
    type: ITEM_TYPES.WEAPON,
    weaponType: WEAPON_TYPES.MELEE,
    weaponSubtype: 'pickaxe',
    damage: 1,
    windup: .8,
    recovery: .5,
    attackPattern: 'axe',
    range: 22,
    isPickaxe: true,
    color: '#aaaaaa'
  },

  // ── MELEE / axe — Tier 2 ──────────────────────────────────────────────────
  '⊤': {
    char: '⊤',
    name: 'Bone Axe',
    type: ITEM_TYPES.WEAPON,
    weaponType: WEAPON_TYPES.MELEE,
    weaponSubtype: 'axe',
    damage: 3,
    windup: 0.6,
    recovery: 0.5,
    patternSpeed: 0.04,
    range: 22,
    color: '#cccccc'
  },

  // ── MELEE / axe — Tier 3 ──────────────────────────────────────────────────
  '⚯': {
    char: '⚯',
    name: 'Thunder Axe',
    type: ITEM_TYPES.WEAPON,
    weaponType: WEAPON_TYPES.MELEE,
    weaponSubtype: 'axe',
    damage: 5,
    windup: 0.75,
    recovery: 0.2,
    patternSpeed: 0.04,
    range: 24,
    onHit: 'stun',
    electric: true,
    chain: true,
    chainCount: 2,
    color: '#ffff00'
  },

  // ── MELEE / hammer — Tier 1 ───────────────────────────────────────────────
  '⊥': {
    char: '⊥',
    name: 'Hammer',
    type: ITEM_TYPES.WEAPON,
    weaponType: WEAPON_TYPES.MELEE,
    weaponSubtype: 'hammer',
    damage: 3,
    windup: 0.6,
    recovery: 0.8,
    range: 20,
    attackPattern: 'hammerRing',
    locksMovement: true,
    color: COLORS.ITEM
  },

  // ── MELEE / hammer — Tier 2 ───────────────────────────────────────────────
  '☃': {
    char: '☃',
    name: 'Ice Hammer',
    type: ITEM_TYPES.WEAPON,
    weaponType: WEAPON_TYPES.MELEE,
    weaponSubtype: 'hammer',
    damage: 4,
    windup: 0.6,
    recovery: 1.0,
    patternSpeed: 0.1,
    range: 24,
    onHit: 'freeze',
    knockback: 250,
    color: '#00ddff'
  },
  '◉': {
    char: '◉',
    name: 'Exploding Mace',
    type: ITEM_TYPES.WEAPON,
    weaponType: WEAPON_TYPES.MELEE,
    weaponSubtype: 'hammer',
    damage: 4,
    windup: 0.6,
    recovery: 0.3,
    patternSpeed: 0.1,
    range: 20,
    explode: true,
    explodeRadius: 45,
    color: '#ff6600'
  },

  // ── MELEE / hammer — Tier 3 ───────────────────────────────────────────────
  '▼': {
    char: '▼',
    name: 'Earthquake Hammer',
    type: ITEM_TYPES.WEAPON,
    weaponType: WEAPON_TYPES.MELEE,
    weaponSubtype: 'hammer',
    damage: 6,
    windup: 0.9,
    recovery: 0.3,
    patternSpeed: 0.1,
    range: 20,
    knockback: 350,
    explode: true,
    explodeRadius: 60,
    color: '#8b6914'
  },
  '⚒': {
    char: '⚒',
    name: 'Bone Crusher',
    type: ITEM_TYPES.WEAPON,
    weaponType: WEAPON_TYPES.MELEE,
    weaponSubtype: 'hammer',
    damage: 6,
    windup: 1.05,
    recovery: 0.2,
    attackPattern: 'shockwave',
    patternSpeed: 0.17,
    knockback: 380,
    locksMovement: true,
    range: 26,
    color: '#ffffff'
  },

  // ── MELEE / hammer — Tier 4 (secret vein drop, U room only) ─────────────
  '⬡': {
    char: '⬡',
    name: 'Crystal Maul',
    type: ITEM_TYPES.WEAPON,
    weaponType: WEAPON_TYPES.MELEE,
    weaponSubtype: 'hammer',
    damage: 8,
    windup: 0.4,
    recovery: 0.5,
    attackPattern: 'sweep',          // standard tap: axe-style sweep
    chargeAttackPattern: 'shockwave', // held charge: expanding shockwave ring
    chargeTime: 2.0,                  // seconds to hold for the mega-attack
    chargeHammer: true,               // enables hold-to-charge system in Item.js
    patternSpeed: .2,
    knockback: 480,
    range: 15,
    color: '#88eeff'
  },

  // ── MELEE / scythe ────────────────────────────────────────────────────────
  // Slow, wide reaper sweep. Wide-arc cleave (sweep pattern), modest damage.
  // Guaranteed to spawn in Grass (G) rooms; also craftable. Cuts grass like
  // any blade — that's the trick to revealing what's concealed beneath it.
  'Ƨ': {
    char: 'Ƨ',
    name: 'Scythe',
    type: ITEM_TYPES.WEAPON,
    weaponType: WEAPON_TYPES.MELEE,
    weaponSubtype: 'scythe',
    damage: 2,
    windup: 0.7,
    recovery: 1.1,
    patternSpeed: 0.03,
    range: 26,
    drawScale: 1.25,
    color: '#aabb77'
  },

  // ── MELEE / spear ─────────────────────────────────────────────────────────
  '↑': {
    char: '↑',
    name: 'Spear',
    type: ITEM_TYPES.WEAPON,
    weaponType: WEAPON_TYPES.MELEE,
    weaponSubtype: 'spear',
    damage: 2,
    windup: 0.15,
    recovery: 0.45,
    patternSpeed: 0.05,
    // Needle-thin thrust hitbox — 50% narrower than the default cell.
    attackWidth: GRID.CELL_SIZE * 0.5,
    attackHeight: GRID.CELL_SIZE * 0.5,
    color: COLORS.ITEM
  },

  // ── MELEE / spear — Tier 2 ────────────────────────────────────────────────
  '↟': {
    char: '↟',
    name: 'Venom Lance',
    type: ITEM_TYPES.WEAPON,
    weaponType: WEAPON_TYPES.MELEE,
    weaponSubtype: 'spear',
    damage: 2,
    windup: 0.5,
    recovery: 1.2,
    patternSpeed: 0.04,
    onHit: 'poison',
    color: '#44ff44'
  },

  // ── MELEE / spear — Tier 3 ────────────────────────────────────────────────
  'ψ': {
    char: 'ψ',
    name: 'Trident',
    type: ITEM_TYPES.WEAPON,
    weaponType: WEAPON_TYPES.MELEE,
    weaponSubtype: 'spear',
    damage: 2,
    windup: 0.5,
    recovery: 0.6,
    patternSpeed: 0.05,
    range: 32,
    knockback: 350,
    pinning: true,
    color: '#88aaff'
  },
  '⇑': {
    char: '⇑',
    name: 'War Spear',
    type: ITEM_TYPES.WEAPON,
    weaponType: WEAPON_TYPES.MELEE,
    weaponSubtype: 'spear',
    damage: 4,
    windup: 0.7,
    recovery: 0.5,
    patternSpeed: 0.05,
    range: 34,
    color: '#ddaa44'
  },

  // ── MELEE / staff ─────────────────────────────────────────────────────────
  '/': {
    char: '/',
    name: 'Staff',
    type: ITEM_TYPES.WEAPON,
    weaponType: WEAPON_TYPES.MELEE,
    weaponSubtype: 'staff',
    damage: 1,
    windup: 0.15,
    recovery: 0.45,
    patternSpeed: 0.05,
    meleeChar: '|',
    range: 28,
    color: COLORS.ITEM
  },
  'Ψ': {
    // Identical to Staff — same swing, same block stance, same release sweep —
    // except higher swing damage and the block-release sweep deals 1 dmg.
    char: 'Ψ',
    name: 'Thick Staff',
    type: ITEM_TYPES.WEAPON,
    weaponType: WEAPON_TYPES.MELEE,
    weaponSubtype: 'staff',
    damage: 2,
    windup: 0.15,
    recovery: 0.45,
    patternSpeed: 0.05,
    meleeChar: '|',
    range: 28,
    blockReleaseDamage: 1,
    color: '#aa8855'
  },
  'ߒ': {
    char: 'ߒ',
    name: 'Fishing Pole',
    type: ITEM_TYPES.WEAPON,
    weaponType: WEAPON_TYPES.MELEE,
    weaponSubtype: 'staff',
    isFishingRod: true,           // Enables fishing minigame when conditions are met
    damage: 1,
    windup: 0.35,
    recovery: 0.55,
    range: 32,
    knockback: 25,
    color: '#8b4513'
  },

  // ── WAND / gem-fused (Staff + gemstone) ───────────────────────────────────
  // Gem wands consume mana from the magic meter (set up via cauldron / cheat menu).
  // Charge time is gem-specific; cast deducts manaCost and triggers the spell effect.
  // Placeholder spell logic in Phase 1 — real effects implemented in Phase 2.
  '⚝': {
    char: '⚝',
    name: 'Ruby Staff',
    type: ITEM_TYPES.WEAPON,
    weaponType: WEAPON_TYPES.WAND,
    weaponSubtype: 'wand',
    gemWand: true,
    chargeTime: 3.0,
    manaCost: 4,
    spellEffect: 'fire_aoe',
    color: '#ff2244'
  },
  '⚹': {
    char: '⚹',
    name: 'Sapphire Staff',
    type: ITEM_TYPES.WEAPON,
    weaponType: WEAPON_TYPES.WAND,
    weaponSubtype: 'wand',
    gemWand: true,
    chargeTime: 5.0,
    manaCost: 5,
    spellEffect: 'blizzard',
    color: '#2244ff'
  },
  '⚶': {
    char: '⚶',
    name: 'Topaz Staff',
    type: ITEM_TYPES.WEAPON,
    weaponType: WEAPON_TYPES.WAND,
    weaponSubtype: 'wand',
    gemWand: true,
    chargeTime: 2.0,
    manaCost: 3,
    spellEffect: 'chain_stun',
    color: '#ffcc00'
  },
  '⚸': {
    char: '⚸',
    name: 'Onyx Staff',
    type: ITEM_TYPES.WEAPON,
    weaponType: WEAPON_TYPES.WAND,
    weaponSubtype: 'wand',
    gemWand: true,
    chargeTime: 3.0,
    manaCost: 2,
    spellEffect: 'blind_cone',
    color: '#333344'
  },
  '⚘': {
    char: '⚘',
    name: 'Emerald Staff',
    type: ITEM_TYPES.WEAPON,
    weaponType: WEAPON_TYPES.WAND,
    weaponSubtype: 'wand',
    gemWand: true,
    chargeTime: 2.0,
    manaCost: 1,
    spellEffect: 'grass_circle',
    color: '#00cc44'
  },
  '⚭': {
    char: '⚭',
    name: 'Garnet Staff',
    type: ITEM_TYPES.WEAPON,
    weaponType: WEAPON_TYPES.WAND,
    weaponSubtype: 'wand',
    gemWand: true,
    chargeTime: 3.0,
    manaCost: 3,
    spellEffect: 'charm_aoe',
    color: '#cc2222'
  },
  '⚳': {
    char: '⚳',
    name: 'Force Wand',
    type: ITEM_TYPES.WEAPON,
    weaponType: WEAPON_TYPES.WAND,
    weaponSubtype: 'wand',
    gemWand: true,
    chargeTime: 2.5,
    manaCost: 6,
    spellEffect: 'force_blast',
    color: '#aaddff'
  },

  // ── MELEE / dagger ────────────────────────────────────────────────────────
  '↾': {
    char: '↾',
    name: 'Dagger',
    type: ITEM_TYPES.WEAPON,
    weaponType: WEAPON_TYPES.MELEE,
    weaponSubtype: 'dagger',
    damage: 1,
    windup: 0.1,
    recovery: 0.6,
    range: 20,
    patternSpeed: 0.05,
    color: '#cccccc'
  },
  '♣': {
    char: '♣',
    name: 'Vampire Dagger',
    type: ITEM_TYPES.WEAPON,
    weaponType: WEAPON_TYPES.MELEE,
    weaponSubtype: 'dagger',
    damage: 3,
    windup: 0.2,
    recovery: 0.4,
    range: 20,
    patternSpeed: 0.05,
    lifesteal: 1.0,
    color: '#990000'
  },

  // ── MELEE / whip ──────────────────────────────────────────────────────────
  '≋': {
    char: '≋',
    name: 'Whip',
    type: ITEM_TYPES.WEAPON,
    weaponType: WEAPON_TYPES.MELEE,
    weaponSubtype: 'whip',
    damage: 1,
    windup: 0.5,
    recovery: 1.0,
    patternSpeed: 0.02,
    range: 40,
    meleeChar: '~',
    color: '#8b4513'
  },

  // ── MELEE / flail ─────────────────────────────────────────────────────────
  '○': {
    char: '○',
    name: 'Flail',
    type: ITEM_TYPES.WEAPON,
    weaponType: WEAPON_TYPES.MELEE,
    weaponSubtype: 'flail',
    damage: 2,
    windup: 0.45,
    recovery: 0.15,
    cooldown: 1.0,
    patternSpeed: 0.2,
    range: 26,
    color: '#aaaaaa'
  },

  // ── MELEE / unsubtyped ────────────────────────────────────────────────────
  '⌁': {
    char: '⌁',
    name: 'Stun Baton',
    type: ITEM_TYPES.WEAPON,
    weaponType: WEAPON_TYPES.MELEE,
    damage: 2,
    windup: 0.3,
    recovery: 0.2,
    attackPattern: 'default',
    range: 18,
    onHit: 'stun',
    knockback: 200,
    isBlunt: true,
    color: '#0088ff'
  },

  // ── Misc weapons (no weaponType) ──────────────────────────────────────────
  '߃': {
    char: '߃',
    name: 'Vault Key',
    type: ITEM_TYPES.WEAPON,
  },

  // ============================================================================
  // ARMOR
  // ============================================================================
  // Each armor has a distinct mechanical identity expressed through:
  //   defense        flat damage reduction (min 1 damage always dealt)
  //   meleeResist    0–1  fraction of melee damage absorbed before defense
  //   bulletResist   0–1  chance to completely block a projectile
  //   dodgeChance    0–1  chance to fully evade any hit
  //   burnResist     0–1  fraction of burn DoT absorbed (stacks with fireImmune)
  //   reflectDamage  0–1  fraction of taken damage reflected to attacker
  //   massBonus      +N   added to base mass=1; higher = less knockback received
  //   rollCooldownMult    multiplier to dodge cooldown (< 1 faster, > 1 slower)
  //   extraIframes   +s   extra invulnerability seconds granted after dodge roll
  //   speedBoost / speedPenalty  movement speed modifiers

  // ── Tier 1: common drops / basic crafts ───────────────────────────────────
  'V': {
    char: 'V', name: 'Fur Vest', type: ITEM_TYPES.ARMOR,
    defense: 1,
    speedBoost: 0.1,        // light — slight movement bonus
    rollCooldownMult: 0.75, // fast dodge recharge; rolls feel snappy
    spellDescription: 'SIMPLE AND NIMBLE.',
    color: '#8b4513'
  },
  '2': {
    char: '2', name: 'Stitched Vest', type: ITEM_TYPES.ARMOR,
    defense: 2,
    speedBoost: 0.05,
    rollCooldownMult: 0.8,
    extraIframes: 0.1,      // tighter stitching trains the roll timing
    spellDescription: 'REFINED AGILITY.',
    color: '#aa6633'
  },
  'O': {
    char: 'O', name: 'Slime Suit', type: ITEM_TYPES.ARMOR,
    defense: 1,
    slimeImmune: true,
    meleeResist: 0.2,       // goo coating absorbs blunt and blade impacts
    burnResist: 0.5,        // wet slime suppresses fire damage
    spellDescription: 'SLIPPERY AND MOIST.',
    color: '#00ff00'
  },
  '3': {
    char: '3', name: 'Reinforced Slime Suit', type: ITEM_TYPES.ARMOR,
    defense: 2,
    slimeImmune: true,
    meleeResist: 0.3,
    burnResist: 0.7,
    spellDescription: 'EMBRACE WETNESS.',
    color: '#44ff44'
  },
  'A': {
    char: 'A', name: 'Bone Armor', type: ITEM_TYPES.ARMOR,
    defense: 2,
    meleeResist: 0.25,      // bone plates deflect strikes
    massBonus: 1.0,         // heavier — noticeably less knockback
    rollCooldownMult: 1.25, // rigid and bulky; dodge recharge is slower
    spellDescription: 'STURDY, BUT SLOW.',
    color: '#cccccc'
  },
  '4': {
    char: '4', name: 'Padded Bone Armor', type: ITEM_TYPES.ARMOR,
    defense: 3,
    meleeResist: 0.3,
    massBonus: 1.5,
    rollCooldownMult: 1.35,
    spellDescription: 'NOT EASILY MOVED.',
    color: '#ddddcc'
  },

  // ── Tier 2: craftable mid-game ────────────────────────────────────────────
  'L': {
    char: 'L', name: 'Leather Armor', type: ITEM_TYPES.ARMOR,
    defense: 1,
    speedBoost: 0.2,        // lightest proper armor
    rollCooldownMult: 0.65, // fastest dodge recharge of any armor
    extraIframes: 0.15,     // trained roll technique extends protection window
    dodgeChance: 0.08,      // physical evasion — lower than Robe's magic dodge
    spellDescription: 'TUCK AND ROLL.',
    color: '#8b6914'
  },
  '⛓': {
    char: '⛓', name: 'Chain Mail', type: ITEM_TYPES.ARMOR,
    defense: 3,
    bulletResist: 0.3,      // interlocked rings shed projectiles
    massBonus: 2.0,         // heavy metal — excellent knockback resistance
    rollCooldownMult: 1.5,  // rolling in chain mail is a commitment
    spellDescription: 'ARROW PROTECTION.',
    color: '#aaaaaa'
  },
  'R': {
    char: 'R', name: 'Robe', type: ITEM_TYPES.ARMOR,
    armorClass: 'robe',
    defense: 1,
    dodgeChance: 0.15,      // magically treats luck as defense
    fireImmune: true,
    freezeImmune: true,
    rollCooldownMult: 0.8,  // floaty — decent recharge
    extraIframes: 0.35,     // magical ward extends post-roll protection
    spellDescription: 'LUCK IS ARMOR.',
    color: '#9370db'
  },
  'W': {
    char: 'W', name: 'Warplate', type: ITEM_TYPES.ARMOR,
    defense: 4,
    bulletResist: 0.5,
    meleeResist: 0.3,       // thick plate absorbs all physical damage types
    massBonus: 3.0,         // near-immovable; knockback barely registers
    speedPenalty: 0.2,
    rollCooldownMult: 1.8,  // dodging in full plate is nearly impossible
    spellDescription: 'A WALKING WALL.',
    color: '#4a4a4a'
  },

  // ── Tier 3: exotic / late-game ────────────────────────────────────────────
  'N': {
    char: 'N', name: 'Ninja Garb', type: ITEM_TYPES.ARMOR,
    defense: 2,
    poisonImmune: true,
    dodgeChance: 0.15,
    rollCooldownMult: 0.5,  // fastest dodge recharge in the game — ninja specialty
    extraIframes: 0.3,      // extended post-roll window for precise counters
    spellDescription: 'MOVE IN SHADOW.',
    color: '#2f2f2f'
  },
  'E': {
    char: 'E', name: 'Ember Cloak', type: ITEM_TYPES.ARMOR,
    defense: 3,
    fireImmune: true,
    burnResist: 1.0,        // no burn DoT can penetrate the cloak
    reflectDamage: 0.3,     // residual heat radiates back to attackers
    extraIframes: 0.15,     // cloak flares briefly after each hit
    spellDescription: 'RETURNS PAIN.',
    color: '#ff4500'
  },
  'I': {
    char: 'I', name: 'Ice Plate', type: ITEM_TYPES.ARMOR,
    defense: 4,
    freezeImmune: true,
    slowEnemies: true,      // cold radiates outward, chilling nearby enemies
    meleeResist: 0.25,      // thick frozen plates absorb strikes
    massBonus: 2.5,
    rollCooldownMult: 1.6,  // frozen bulk — slow to recover between rolls
    spellDescription: 'ICY TO TOUCH.',
    color: '#87ceeb'
  },
  'K': {
    char: 'K', name: 'Dragon Scale Armor', type: ITEM_TYPES.ARMOR,
    defense: 5,
    bulletResist: 0.25,     // scales shed projectiles
    meleeResist: 0.3,       // overlapping scales deflect strikes
    burnResist: 0.8,        // dragon scales resist fire by nature
    massBonus: 2.0,
    rollCooldownMult: 1.3,
    spellDescription: 'ELEMENTAL RESISTANCE.',
    color: '#ff00ff'
  },

  // ── Infused robes: Robe + elemental gemstone ──────────────────────────────
  // Pulse triggers on dodge roll, once per room — not a passive timer.
  'ℜ': {
    char: 'ℜ', name: 'Frost Robe', type: ITEM_TYPES.ARMOR,
    armorClass: 'robe',
    defense: 1,
    dodgeChance: 0.18,
    fireImmune: true,
    freezeImmune: true,
    rollCooldownMult: 0.75,
    extraIframes: 0.35,
    particleAura: 'frost',        // ambient ice crystal particles
    rollPulse: 'freeze',          // dodge roll pulses freeze in radius (once per room)
    rollPulseDuration: 5.5,
    rollPulseRadius: 3,           // cells
    spellDescription: 'THE COLD IS ARMOR.',
    color: '#88ddff'
  },
  'ℛ': {
    char: 'ℛ', name: 'Flame Robe', type: ITEM_TYPES.ARMOR,
    armorClass: 'robe',
    defense: 1,
    dodgeChance: 0.18,
    fireImmune: true,
    freezeImmune: true,
    rollCooldownMult: 0.75,
    extraIframes: 0.35,
    particleAura: 'flame',        // rising ember particles
    rollPulse: 'burn',            // dodge roll ignites enemies in radius (once per room)
    rollPulseDuration: 4.0,
    rollPulseRadius: 3,
    spellDescription: 'FIRE FEARS NOTHING.',
    color: '#ff6600'
  },
  'ℝ': {
    char: 'ℝ', name: 'Storm Robe', type: ITEM_TYPES.ARMOR,
    armorClass: 'robe',
    defense: 1,
    dodgeChance: 0.18,
    fireImmune: true,
    freezeImmune: true,
    rollCooldownMult: 0.75,
    extraIframes: 0.35,
    particleAura: 'shock',        // crackling electric spark particles
    rollPulse: 'stun',            // dodge roll discharges stun in radius (once per room)
    rollPulseDuration: 3.0,
    rollPulseRadius: 3,
    spellDescription: 'STATIC IS KARMA.',
    color: '#88ffff'
  },
  'ℰ': {
    char: 'ℰ', name: 'Emerald Robe', type: ITEM_TYPES.ARMOR,
    armorClass: 'robe',
    defense: 1,
    dodgeChance: 0.18,
    freezeImmune: true,
    rollCooldownMult: 0.75,
    extraIframes: 0.35,
    particleAura: 'nature',       // soft green wisps
    gooConsume: true,             // goo pickups heal 1HP instead of going to inventory
    spellDescription: 'THE SWAMP GIVES BACK.',
    color: '#44cc44'
  },
  'ℬ': {
    char: 'ℬ', name: 'Blood Robe', type: ITEM_TYPES.ARMOR,
    armorClass: 'robe',
    defense: 1,
    dodgeChance: 0.18,
    fireImmune: true,
    rollCooldownMult: 0.75,
    extraIframes: 0.35,
    particleAura: 'blood',        // dark crimson droplets
    bladeKillHeal: true,          // heal 1HP when a blade kills an enemy
    spellDescription: 'BLADES REPAY.',
    color: '#cc2222'
  },
  'ℌ': {
    char: 'ℌ', name: 'Shadow Robe', type: ITEM_TYPES.ARMOR,
    armorClass: 'robe',
    defense: 1,
    dodgeChance: 0.25,
    rollCooldownMult: 0.65,
    extraIframes: 0.35,
    particleAura: 'shadow',       // dark drifting specks
    batTransform: true,           // dodge roll becomes rapid bat-form dash
    spellDescription: 'BECOME THE DARK.',
    color: '#555577'
  },

  '⊛': {
    char: '⊛', name: 'Whirlwind Cape', type: ITEM_TYPES.ARMOR,
    defense: 1,
    rollCooldownMult: 0.7,
    whirlwindCape: true,   // dodge roll becomes a spinning attack that dizzies nearby enemies
    spellDescription: 'SPIN. DISRUPT. SURVIVE.',
    color: '#77ddff'
  },

  // ── Blue-zone armor: water-only mechanics (dormant on dry ground) ─────────
  // All three share the armor slot — pick one per run. Effect activates only
  // while player.inLiquid is true; reverts to vanilla on dry tiles.
  '∆': {
    char: '∆', name: 'Shark Mask', type: ITEM_TYPES.ARMOR,
    defense: 1,
    sharkMask: true,       // dodge in water → dive (fin glyph, plane=SUBMERGED, 1.8× speed); re-roll → 3× emerge damage
    spellDescription: 'DIVE AND STRIKE.',
    color: '#88aacc'
  },
  '❖': {
    char: '❖', name: 'Coral Crown', type: ITEM_TYPES.ARMOR,
    defense: 1,
    coralCrown: true,      // standing on water tile → tile becomes crystallized (walkable, blocks bullets, 6s decay, 8-stack cap)
    spellDescription: 'THE TIDE LAYS A PATH.',
    color: '#ff99bb'
  },
  'Ϡ': {
    char: 'Ϡ', name: 'Stingray Mantle', type: ITEM_TYPES.ARMOR,
    defense: 1,
    stingrayMantle: true,  // moving in water → leaves 4s electric wake in vacated cells; wearer is shock-immune; chains 2× shock on wet
    spellDescription: 'LEAVE A LIVE WAKE.',
    color: '#ccddee'
  },

  // ── Moss Cloak: stealth bush transform ────────────────────────────────────
  // After a dodge roll ends, the player becomes "armed". Staying still (no WASD)
  // activates the cloak: player renders as a bush `%`, and enemies that haven't
  // already aggro'd cannot detect the player at any range. Moving cancels it.
  '✿': {
    char: '✿', name: 'Moss Cloak', type: ITEM_TYPES.ARMOR,
    defense: 1,
    mossCloak: true,
    spellDescription: 'STILL AS A BUSH.',
    color: '#5a8a3a'
  },

  // ── Spectacles: cipher decoder, no defense ────────────────────────────────
  // Occupies the armor slot. While equipped, the render hooks in cipher.js
  // toggle the Greek↔Latin substitution OFF wherever the cipher is applied:
  // exit letters, REST label, recipe hints, maze object covers, dungeon
  // ciphered hints. Trades all physical protection for total cipher decoding.
  '⊙': {
    char: '⊙', name: 'Spectacles', type: ITEM_TYPES.ARMOR,
    defense: 0,
    spectacles: true,
    spellDescription: 'SEE THE WORLD RELABELED.',
    color: '#ddccff'
  },

  // ============================================================================
  // CONSUMABLES
  // ============================================================================

  // ── Heal ──────────────────────────────────────────────────────────────────
  'G': {
    char: 'G', name: 'Base Potion', type: ITEM_TYPES.CONSUMABLE,
    effect: 'heal', amount: 1, oneShot: true,
    autoTriggerHP: 0.20, color: '#88aaff',
    leavesBottle: true
  },
  'H': {
    char: 'H',
    name: 'Health Potion',
    type: ITEM_TYPES.CONSUMABLE,
    effect: 'heal',
    amount: 3,
    oneShot: true,
    autoTriggerHP: 0.5,
    color: '#ff00ff',
    leavesBottle: true
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
  'z': {
    char: 'z', name: 'Mending Brew', type: ITEM_TYPES.CONSUMABLE,
    effect: 'regen', regenAmount: 1, regenInterval: 1.0, duration: 5, oneShot: true,
    autoTriggerHP: 0.50, color: '#88ffaa',
    leavesBottle: true
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
  '♦': {
    char: '♦',
    name: 'Dragon Heart',
    type: ITEM_TYPES.CONSUMABLE,
    effect: 'maxhp',
    amount: 5,
    oneShot: true, // Permanent upgrade
    color: '#ff00ff'
  },

  // ── Buffs ─────────────────────────────────────────────────────────────────
  'q': {
    char: 'q', name: 'Haste Draught', type: ITEM_TYPES.CONSUMABLE,
    effect: 'speed', duration: 8, oneShot: true,
    autoTriggerHP: 0.40, color: '#00ffcc',
    leavesBottle: true
  },
  'x': {
    char: 'x', name: 'Stone Skin', type: ITEM_TYPES.CONSUMABLE,
    effect: 'stoneskin', duration: 10, defenseBonus: 3, oneShot: true,
    autoTrigger: { condition: 'low_hp_or_surrounded', criticalHP: 0.35, nearbyEnemies: 2 },
    color: '#aabb88',
    leavesBottle: true
  },
  'u': {
    char: 'u', name: 'Battle Elixir', type: ITEM_TYPES.CONSUMABLE,
    effect: 'damageBuff', damageBonus: 2, duration: 8, oneShot: true,
    autoTrigger: { condition: 'nearest_enemy', range: 80 }, color: '#ff6644',
    leavesBottle: true
  },
  '★': {
    char: '★',
    name: 'Lucky Coin',
    type: ITEM_TYPES.CONSUMABLE,
    effect: 'luck',
    passive: true,        // Bonuses apply while equipped; never auto-fires or oneShots
    luckPassive: true,    // InventorySystem reads this to set player.luckActive
    critChance: 0.10,     // 10% chance to crit (1.5× damage) on player→enemy hits
    dodgeBonus: 0.10,     // Adds 10% dodge as a separate roll from armor dodgeChance
    color: '#ffff00'
  },
  '¤': {
    char: '¤',
    name: 'Infused Coin',
    type: ITEM_TYPES.CONSUMABLE,
    effect: 'wellOffering',  // Consumed by WellSystem when tossed into a W-room well
    color: '#ffcc66'
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

  // ── Movement ──────────────────────────────────────────────────────────────
  '∞': {
    char: '∞',
    name: 'Wings',
    type: ITEM_TYPES.CONSUMABLE,
    effect: 'speed',
    duration: 30,
    cooldown: 20, // Reusable with 20s cooldown
    color: '#00ffff'
  },
  'Ω': {
    char: 'Ω',
    name: 'Floating Boots',
    type: ITEM_TYPES.CONSUMABLE,
    effect: 'float',
    duration: 25,
    oneShot: true,
    color: '#ffaa44'
  },
  'r': {
    char: 'r',
    name: 'Rubber Boots',
    type: ITEM_TYPES.CONSUMABLE,
    effect: 'waterImmunity',
    duration: 25,
    oneShot: true,
    color: '#ffdd44'
  },

  // ── Defensive ─────────────────────────────────────────────────────────────
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
  '■': {
    char: '■',
    name: 'Metal Block',
    type: ITEM_TYPES.CONSUMABLE,
    effect: 'block',
    cooldown: 15, // Reusable with 15s cooldown
    color: '#888888'
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
  'ω': {
    char: 'ω',
    name: 'Smoke Bomb',
    type: ITEM_TYPES.CONSUMABLE,
    effect: 'invuln',
    duration: 3.5, // 3.5 seconds of invulnerability
    cooldown: 25, // Reusable with 25s cooldown (powerful)
    color: '#aaaaaa'
  },

  // ── Throwables ────────────────────────────────────────────────────────────
  'y': {
    char: 'y', name: 'Firecracker', type: ITEM_TYPES.CONSUMABLE,
    effect: 'firecracker', radius: 40, oneShot: true, color: '#ff8800'
  },
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
  'P': {
    char: 'P',
    name: 'Poison Flask',
    type: ITEM_TYPES.CONSUMABLE,
    effect: 'poison',
    cooldown: 10, // Reusable with 10s cooldown
    color: '#44ff44'
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

  // ── Utility ───────────────────────────────────────────────────────────────
  '⇈': {
    char: '⇈',
    name: 'Fletch of Arrows',
    type: ITEM_TYPES.CONSUMABLE,
    effect: 'arrowRefill',
    amount: 5,
    oneShot: true,
    color: '#8b4513'
  },
  '=': {
    char: '=',
    name: 'Platform',
    type: ITEM_TYPES.CONSUMABLE,
    effect: 'platform',
    color: '#8b4513'
  },
  'T': {
    char: 'T',
    name: 'Tonic',
    type: ITEM_TYPES.CONSUMABLE,
    effect: 'cleanse',
    cooldown: 8, // Reusable with 8s cooldown
    color: '#aaddff',
    leavesBottle: true
  },
  'o': {
    char: 'o',
    name: 'Path Amulet',
    type: ITEM_TYPES.CONSUMABLE,
    effect: 'pathTracker',
    passive: true, // Passive effect when equipped (no activation)
    color: '#ffaa00'
  },
  '✦': {
    char: '✦',
    name: 'Phoenix Feather',
    type: ITEM_TYPES.CONSUMABLE,
    effect: 'revive',
    oneShot: true, // One death save
    color: '#ff8800'
  },

  // ── Oils (pressed at hut presses; passive augments for bow/dagger) ────────
  // The oilEffect field marks these as augments — InventorySystem skips
  // auto-trigger; Item.js bow/dagger factories read oilEffect to override
  // arrow speed and onHit.
  '🜁': {
    char: '🜁',
    name: 'Slick Oil',
    type: ITEM_TYPES.CONSUMABLE,
    oilEffect: { arrowSpeedMult: 1.25 },
    color: '#a07040'
  },
  '🜂': {
    char: '🜂',
    name: 'Fire Oil',
    type: ITEM_TYPES.CONSUMABLE,
    oilEffect: { onHit: 'burn' },
    color: '#ff4400'
  },
  '🜄': {
    char: '🜄',
    name: 'Frost Oil',
    type: ITEM_TYPES.CONSUMABLE,
    oilEffect: { onHit: 'freeze' },
    color: '#88ddff'
  },
  '🜔': {
    char: '🜔',
    name: 'Drowse Oil',
    type: ITEM_TYPES.CONSUMABLE,
    oilEffect: { onHit: 'sleep' },
    color: '#ffe566'
  },

  // ── Bottles ───────────────────────────────────────────────────────────────
  // 'B' is the empty bottle: a slot-holding consumable with no active effect.
  // Sources: magic-potion residue (leavesBottle), fishing catch, enemy drop.
  // When equipped and the player touches a fairy at full HP, it converts to
  // 'fairy_in_a_bottle' (handled by Fairy → FountainSystem touch flow).
  // Char is 'B' (uppercase) — 'b' collides with INGREDIENTS['b'] = Bone, which
  // would mis-route through LootSystem.spawnLoot's isIngredient() check.
  'B': {
    char: 'B',
    name: 'Empty Bottle',
    type: ITEM_TYPES.CONSUMABLE,
    effect: 'emptyBottle',
    color: '#aaccee'
  },
  '⚱': {
    char: '⚱',
    name: 'Fairy in a Bottle',
    type: ITEM_TYPES.CONSUMABLE,
    effect: 'revive_on_death',
    oneShot: true,
    color: '#ffaaff'
  },

  // Bread: equippable utility consumable. Use action drops the loaf on the
  // ground (handled in Item.use via effect: 'dropBread'). Idle crows in the
  // room — fed or not — seek the nearest dropped bread; eating it flips them
  // to 'fed' (won't flee player proximity) or, if already fed, to 'companion'.
  // Found commonly in huts and occasionally in chests (see HutSystem, AFFINITY_POOLS).
  '⌬': {
    char: '⌬',
    name: 'Bread',
    type: ITEM_TYPES.WEAPON,
    weaponType: 'UTILITY',
    effect: 'dropBread',
    oneShot: true,
    color: '#daa520'
  },

  // ============================================================================
  // TRAPS
  // ============================================================================

  // ── One-shot traps ────────────────────────────────────────────────────────
  // `affinity` names the canonical elemental class (ice/fire/electric/goo/venom/…) — same
  // taxonomy as `enemy.affinities` and AFFINITY_POOLS. Used by TrapSystem._applyTrapHit
  // to gate damage+status: enemies whose affinities include the trap's affinity are IMMUNE.
  // Sleep/Charm have no elemental class so they omit `affinity` and damage everyone.
  '[': {
    char: '[',
    name: 'Freeze Trap',
    type: ITEM_TYPES.TRAP,
    oneShot: true,
    charges: 3,
    triggerRadius: 24,
    effectRadius: 48,
    effect: 'freeze',
    affinity: 'ice',
    effectDuration: 10.0,
    color: '#00ddff'
  },
  '{': {
    char: '{',
    name: 'Stun Trap',
    type: ITEM_TYPES.TRAP,
    oneShot: true,
    charges: 3,
    triggerRadius: 24,
    effectRadius: 96,
    effect: 'zap',
    affinity: 'electric',
    electric: true,
    effectDuration: 6.0,
    color: '#ffff00'
  },
  '^': {
    char: '^',
    name: 'Fire Trap',
    type: ITEM_TYPES.TRAP,
    oneShot: true,
    charges: 3,
    triggerRadius: 24,
    effectRadius: 112,
    effect: 'burn',
    affinity: 'fire',
    effectDuration: 6.0,
    color: '#ff4400'
  },
  ';': {
    char: ';',
    name: 'Sleep Bomb',
    type: ITEM_TYPES.TRAP,
    oneShot: true,
    charges: 3,
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
    charges: 3,
    triggerRadius: 32,
    effectRadius: 128,
    effect: 'charm',
    effectDuration: 8.0,
    color: '#ff44ff'
  },
  '(': {
    char: '(',
    name: 'Remote Bomb',
    type: ITEM_TYPES.TRAP,
    oneShot: true,
    remoteTrigger: true,
    charges: 3,
    effectRadius: 80,
    effect: 'remote',
    damage: 2,
    color: '#ff6600'
  },
  '●': {
    char: '●',
    name: 'Slime Bomb',
    type: ITEM_TYPES.TRAP,
    oneShot: true,
    charges: 3,
    triggerRadius: 24,
    effectRadius: 48,
    effect: 'slow',
    affinity: 'goo',
    effectDuration: 6.0,
    color: '#00ff00'
  },

  // ── Persistent placeables ─────────────────────────────────────────────────
  '"': {
    char: '"',
    name: 'Music Box',
    type: ITEM_TYPES.TRAP,
    oneShot: false,
    charges: 1,
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
    charges: 1,
    effectRadius: 128,
    effect: 'noise',
    color: '#ffff00'
  },
  ']': {
    char: ']',
    name: 'Tesla Coil',
    type: ITEM_TYPES.TRAP,
    oneShot: false,
    charges: 1,
    effectRadius: 64,
    effect: 'zap',
    affinity: 'electric',
    electric: true,
    tickInterval: 2.5,
    damage: 2,
    stunDuration: 0.8,
    color: '#00ffff'
  },
  // Sticky Tripline: SPACE on an eligible bg object anchors point 1, SPACE on a
  // second anchors point 2. The segment slows entities (goo status). One per room.
  // WireSystem handles placement; uses the standard trap `charges` mechanism so
  // resetTrapsForNewRoom() refills it each new EXPLORE room.
  '⌇': {
    char: '⌇',
    name: 'Sticky Tripline',
    type: ITEM_TYPES.TRAP,
    wire: true,
    wireType: 'slime',
    charges: 1,
    color: '#88dd88'
  },

  // ── Intermediate crafting materials ─────────────────────────────────────────
  '△': {
    char: '△',
    name: 'Arrowhead',
    type: ITEM_TYPES.INGREDIENT,
    color: '#aaaaaa'
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
  '●': { char: '●', name: 'Pearl', color: '#f4f4f8' },
  'r': { char: 'r', name: 'Root', color: '#996633' },
  'v': { char: 'v', name: 'Venom', color: '#00ff44' },
  '0': { char: '0', name: 'Rock', color: '#888888' },
  '1': { char: '1', name: 'Topaz',    color: '#ffcc00' },
  '9': { char: '9', name: 'Garnet',   color: '#cc2222' },
  '`': { char: '`', name: 'Emerald',  color: '#00cc44' },
  '_': { char: '_', name: 'Diamond',  color: '#eeeeff' },
  '6': { char: '6', name: 'Onyx',     color: '#333344' },
  '?': { char: '?', name: 'Ruby',     color: '#ff2244' },
  '(': { char: '(', name: 'Sapphire', color: '#2244ff' },
  '𝑚': { char: '𝑚', name: 'Mana', color: '#8866ff' },

  // Raw oils — pressed at a hut press into oil consumables (bow/dagger augments).
  // Sap variants drop from Trees; the rare red/cyan variants only spawn in
  // their respective zones (resolved in InteractionSystem).
  'ŝ': { char: 'ŝ', name: 'Sap',       color: '#a07040' },
  'š': { char: 'š', name: 'Fire Sap',  color: '#ff4400' },
  'ş': { char: 'ş', name: 'Frost Sap', color: '#88ddff' },
  'ł': { char: 'ł', name: 'Pollen',    color: '#ffe566' },

  // Blue-zone ingredients — shared Pearl Shard base + one rare per armor recipe.
  // Drop sources: 'p' from Ocean fishing (rare), 'n' from Sea Snake (rare),
  // 'C' from Coral Cluster bg objects in Lake rooms, 'Y' from Ocean fishing (rare).
  'p': { char: 'p', name: 'Pearl Shard',    color: '#ddeeff' },
  'n': { char: 'n', name: 'Sharkbone',      color: '#ccd8e8' },
  'C': { char: 'C', name: 'Coral Cluster',  color: '#ff88aa' },
  'Y': { char: 'Y', name: 'Stingray Barb',  color: '#aabbcc' },

  // Rock-harvest ingredients — drop from `0` Rock bg objects (rock harvest table).
  // ⚱ Artifact also drops rarely from chests; trades to errand NPC (2 coins) or
  // wise man (unlocks rare hint tier). ❦ Moss is the only path to Moss Cloak.
  '⚱': { char: '⚱', name: 'Artifact',       color: '#d4af37' },
  '❦': { char: '❦', name: 'Moss',           color: '#5a8a3a' }
};

// Subtype defaults — explicit weapon properties override these
export const SUBTYPE_DEFAULTS = {
  sword:   { attackPattern: 'arc',       isBlade: true },
  axe:     { attackPattern: 'sweep',     isBlade: true },
  scythe:  { attackPattern: 'sweep',     isBlade: true },
  spear:   { attackPattern: 'thrust',    isBlade: true, range: 28, distanceCrit: true },
  dagger:  { attackPattern: 'multistab', isBlade: true, range: 16 },
  hammer:  { attackPattern: 'shockwave', canSmash: true },
  flail:   { attackPattern: 'ring',      isBlunt: true },
  whip:    { attackPattern: 'whipcrack', isBlunt: true, onHit: 'stun' },
  staff:   { attackPattern: 'thrust',    isBlunt: true },
  pickaxe: { attackPattern: 'thrust',    isBlade: false, isBlunt: false },
};

export function resolveWeaponDefaults(data) {
  if (!data.weaponSubtype) return data;
  const defaults = SUBTYPE_DEFAULTS[data.weaponSubtype];
  if (!defaults) return data;
  return { ...defaults, ...data }; // explicit values always win
}

export function getItemData(char) {
  // Two-tier rule: letters and digits are always raw ingredients.
  // Check INGREDIENTS first for letter/digit chars so that 'r' (Root),
  // 'o' (Oil), 'v' (Venom), etc. are not shadowed by same-char ITEMS entries.
  if (INGREDIENTS[char] && /^[a-zA-Z0-9]$/.test(char)) {
    return INGREDIENTS[char];
  }
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

// Drop tables organized by theme and rarity.
// Five categories per table: ingredients, weapons, traps, armor, consumables.
// Design rule: armor is never common. Traps are never common.
// Humanoid weapons CAN be COMMON — humans are the primary weapon-bearing enemies.
// Beasts and goo don't drop weapons (beast → none; goo → fishing pole only).
// Elemental/affinity-themed weapons (incl. matching gem wand) are isolated to their themed pools.
// Crafting is one reliable path to these items; enemy drops are a parallel path of discovery.
export const AFFINITY_POOLS = {
  undead: {
    ingredients: {
      [RARITY.COMMON]:   ['b', 'a', 'd'],    // Bone, Ash, Dust
      [RARITY.UNCOMMON]: ['k', 'e'],         // Silk, Eye
      [RARITY.RARE]:     ['j']               // Jaw
    },
    weapons: {
      [RARITY.UNCOMMON]: ['⊤'],              // Bone Axe
      [RARITY.RARE]:     ['⚸']              // Onyx Staff
    },
    traps: {
      [RARITY.UNCOMMON]: [';'],              // Sleep Bomb
      [RARITY.RARE]:     ['"']              // Music Box
    },
    armor: {
      [RARITY.UNCOMMON]: ['A'],              // Bone Armor
      [RARITY.RARE]:     []
    },
    consumables: {
      [RARITY.COMMON]:   ['G'],              // Base Potion
      [RARITY.UNCOMMON]: [],
      [RARITY.RARE]:     []
    }
  },

  goo: {
    ingredients: {
      [RARITY.COMMON]:   ['g'],              // Goo
      [RARITY.UNCOMMON]: ['b', 'e'],         // Bone, Eye
      [RARITY.RARE]:     ['j']               // Jaw
    },
    weapons: {
      [RARITY.UNCOMMON]: ['ߒ'],              // Fishing Pole (goo's only weapon drop)
      [RARITY.RARE]:     []
    },
    traps: {
      [RARITY.UNCOMMON]: [],
      [RARITY.RARE]:     []
    },
    armor: {
      [RARITY.UNCOMMON]: ['O'],              // Slime Suit
      [RARITY.RARE]:     []
    },
    consumables: {
      [RARITY.COMMON]:   ['G'],              // Base Potion
      [RARITY.UNCOMMON]: ['y', 'B'],         // Firecracker, Empty Bottle
      [RARITY.RARE]:     []
    }
  },

  beast: {
    ingredients: {
      [RARITY.COMMON]:   ['f', 't', 'm', 'w'], // Fur, Teeth, Meat, Wing
      [RARITY.UNCOMMON]: ['b', 'j'],           // Bone, Jaw
      [RARITY.RARE]:     ['e']                 // Eye
    },
    weapons: {
      [RARITY.UNCOMMON]: [],                 // beasts don't carry crafted weapons
      [RARITY.RARE]:     []
    },
    traps: {
      [RARITY.UNCOMMON]: ["'"],              // Charm Lure
      [RARITY.RARE]:     []
    },
    armor: {
      [RARITY.UNCOMMON]: ['V', 'L'],         // Fur Vest, Leather Armor
      [RARITY.RARE]:     ['N']              // Ninja Garb
    },
    consumables: {
      [RARITY.COMMON]:   ['G'],              // Base Potion
      [RARITY.UNCOMMON]: ['∞', 'y'],         // Wings, Firecracker
      [RARITY.RARE]:     ['♥', 'Ω']        // Heart, Floating Boots
    }
  },

  humanoid: {
    ingredients: {
      [RARITY.COMMON]:   ['c', 'M', '~'],    // Coin, Metal, String
      [RARITY.UNCOMMON]: ['F'],              // Fire Essence
      [RARITY.RARE]:     []
    },
    weapons: {
      [RARITY.COMMON]:   ['†', ')', '↑', '≋', '○', '⊥', '⊸'],         // Sword, Bow, Spear, Whip, Flail, Hammer, Sling
      [RARITY.UNCOMMON]: ['¬', '⋙', '⫯', '↟', 'Ψ', 'ߒ'],              // Gun, Multi-Shot Bow, Longsword, Venom Lance, Thick Staff, Fishing Pole
      [RARITY.RARE]:     ['߃', '⇑', '◉', '◈', '⇶', '⌂', '⌐']         // Vault Key, War Spear, Exploding Mace, Homing Bow, Piercing Bow, Shotgun, Machine Gun
    },
    traps: {
      [RARITY.UNCOMMON]: ['{'],              // Stun Trap
      [RARITY.RARE]:     [']']             // Tesla Coil
    },
    armor: {
      [RARITY.UNCOMMON]: ['L', '⛓'],        // Leather Armor, Chain Mail
      [RARITY.RARE]:     ['W'],             // Warplate
      [RARITY.EPIC]:     ['K']             // Dragon Scale Armor
    },
    consumables: {
      [RARITY.COMMON]:   ['G'],              // Base Potion
      [RARITY.UNCOMMON]: ['y'],              // Firecracker
      [RARITY.RARE]:     ['★']             // Lucky Coin
    }
  },

  fire: {
    ingredients: {
      [RARITY.COMMON]:   ['F', 'a'],         // Fire Essence, Ash
      [RARITY.UNCOMMON]: ['d'],              // Dust
      [RARITY.RARE]:     []
    },
    weapons: {
      [RARITY.UNCOMMON]: ['‡'],              // Flame Sword
      [RARITY.RARE]:     ['⊕', '╪', '⚝']  // Rocket Launcher, Lava Sword, Ruby Staff
    },
    traps: {
      [RARITY.UNCOMMON]: ['^'],              // Fire Trap
      [RARITY.RARE]:     [']']             // Tesla Coil
    },
    armor: {
      [RARITY.RARE]:     ['E']             // Ember Cloak
    },
    consumables: {
      [RARITY.UNCOMMON]: ['Ω']             // Floating Boots
    }
  },

  ice: {
    ingredients: {
      [RARITY.COMMON]:   ['i', '0'],         // Ice, Rock
      [RARITY.UNCOMMON]: ['M'],              // Metal
      [RARITY.RARE]:     []
    },
    weapons: {
      [RARITY.UNCOMMON]: ['❄', '☃', '❅'],   // Freeze Ray, Ice Hammer, Ice Bow
      [RARITY.RARE]:     ['⚹']             // Sapphire Staff
    },
    traps: {
      [RARITY.UNCOMMON]: ['['],              // Freeze Trap
      [RARITY.RARE]:     []
    },
    armor: {
      [RARITY.RARE]:     ['I']             // Ice Plate
    },
    consumables: {}
  },

  venom: {
    ingredients: {
      [RARITY.COMMON]:   ['v', '~'],         // Venom, String
      [RARITY.UNCOMMON]: ['g'],              // Goo
      [RARITY.RARE]:     ['h']               // Herb
    },
    weapons: {
      [RARITY.UNCOMMON]: ['☣'],              // Venom Pistol
      [RARITY.RARE]:     ['♣', '☤', '⚭']  // Vampire Dagger, Venom Blade, Garnet Staff
    },
    traps: {
      [RARITY.UNCOMMON]: ["'"],              // Charm Lure
      [RARITY.RARE]:     []
    },
    armor: {},
    consumables: {}
  },

  dragon: {
    ingredients: {
      [RARITY.COMMON]:   ['s'],              // Scale
      [RARITY.UNCOMMON]: ['F'],              // Fire Essence
      [RARITY.RARE]:     ['M']               // Metal
    },
    weapons: {
      [RARITY.UNCOMMON]: ['⌘'],              // Dragon Blade
      [RARITY.RARE]:     ['☼', '◇']        // Dragon Shotgun, Chaos Blade
    },
    traps: {},
    armor: {
      [RARITY.UNCOMMON]: ['K'],              // Dragon Scale Armor
      [RARITY.RARE]:     []
    },
    consumables: {
      [RARITY.UNCOMMON]: ['♦'],              // Dragon Heart
      [RARITY.RARE]:     []
    }
  },

  // Gemstone drops from RED zone boulders and crystal outcrops
  gemstone: {
    ingredients: {
      [RARITY.COMMON]:   ['9', '1'],         // Garnet, Topaz
      [RARITY.UNCOMMON]: ['`', '?', '('],    // Emerald, Ruby, Sapphire
      [RARITY.RARE]:     ['_', '6']          // Diamond, Onyx
    },
    weapons: {},
    traps: {},
    armor: {},
    consumables: {}
  },

  rare_gemstone: {
    ingredients: {
      [RARITY.COMMON]:   ['_', '6'],         // Diamond, Onyx
      [RARITY.UNCOMMON]: ['?'],              // Ruby
      [RARITY.RARE]:     ['`']               // Emerald
    },
    weapons: {},
    traps: {},
    armor: {},
    consumables: {}
  },

  // Yellow zone / lightning enemies
  electric: {
    ingredients: {
      [RARITY.COMMON]:   ['M'],              // Metal (conductor)
      [RARITY.UNCOMMON]: ['1', 'c'],         // Topaz, Coin (conductors)
      [RARITY.RARE]:     ['e'],              // Eye (luminescent orb)
    },
    weapons: {
      [RARITY.UNCOMMON]: ['ϟ', '⚯', '╬'],   // Lightning Gun, Thunder Axe, Stun Gun
      [RARITY.RARE]:     ['≈', '⚶'],       // Chain Bow, Topaz Staff
    },
    traps: {
      [RARITY.UNCOMMON]: ['{'],             // Stun Trap
      [RARITY.RARE]:     [']'],            // Tesla Coil
    },
    armor: {
      [RARITY.RARE]:     ['ℝ'],            // Storm Robe
    },
    consumables: {
      [RARITY.UNCOMMON]: ['J'],             // Jolt Jar
    }
  },

  // Water / wetland enemies
  aquatic: {
    ingredients: {
      [RARITY.COMMON]:   ['g', 'w'],         // Goo, Wing (fins/webbing)
      [RARITY.UNCOMMON]: ['e', 's', 'p'],    // Eye, Scale, Pearl Shard
      [RARITY.RARE]:     ['k', 'n', 'Y'],    // Silk, Sharkbone, Stingray Barb
    },
    weapons: {
      [RARITY.UNCOMMON]: ['≋', 'ψ'],        // Whip (water-lash), Trident
      [RARITY.RARE]:     [],
    },
    traps: {
      [RARITY.UNCOMMON]: [],
      [RARITY.RARE]:     []
    },
    armor: {
      [RARITY.UNCOMMON]: ['O'],             // Slime Suit (water-resistant)
      [RARITY.RARE]:     []
    },
    consumables: {
      [RARITY.UNCOMMON]: ['∞'],             // Wings (float above water)
      [RARITY.RARE]:     []
    }
  },

  // Forest / nature enemies (future use)
  nature: {
    ingredients: {
      [RARITY.COMMON]:   ['l', 'h'],         // Leaf, Herb
      [RARITY.UNCOMMON]: ['r', 'f'],         // Root, Fur
      [RARITY.RARE]:     ['e'],              // Eye
    },
    weapons: {
      [RARITY.UNCOMMON]: [],
      [RARITY.RARE]:     ['⚘']             // Emerald Staff
    },
    traps: {
      [RARITY.UNCOMMON]: ["'"],             // Charm Lure
      [RARITY.RARE]:     []
    },
    armor: {
      [RARITY.UNCOMMON]: ['V'],             // Fur Vest
      [RARITY.RARE]:     ['N'],            // Ninja Garb (forest stealth)
    },
    consumables: {
      [RARITY.COMMON]:   ['G'],
      [RARITY.UNCOMMON]: ['z'],             // Mending Brew
      [RARITY.RARE]:     ['∞'],            // Wings
    }
  },

  // Generic/random drops for crates, barrels, shrines, etc.
  generic: {
    ingredients: {
      [RARITY.COMMON]:   ['f', 't', 'g', 'w', 'c', 'b', 'm', 's', '|', '~'],
      [RARITY.UNCOMMON]: ['F', 'M', 'a', 'd', 'e', 'h', 'i', 'v'],
      [RARITY.RARE]:     ['j', 'k', 'l', 'o', 'r', '0']
    },
    weapons: {
      [RARITY.UNCOMMON]: ['¬', '†', ')'],    // Gun, Sword, Bow
      [RARITY.RARE]:     ['⚳']             // Force Wand (diamond)
    },
    traps: {
      [RARITY.UNCOMMON]: ['[', '{', '^'],    // Freeze, Stun, Fire Trap
      [RARITY.RARE]:     [']', ';']        // Tesla Coil, Sleep Bomb
    },
    armor: {
      [RARITY.UNCOMMON]: ['V', 'A', 'L'],    // Fur Vest, Bone Armor, Leather Armor
      [RARITY.RARE]:     ['W', 'N', 'R'],  // Warplate, Ninja Garb, Robe
      [RARITY.EPIC]:     ['E', 'I', 'K']  // Ember Cloak, Ice Plate, Dragon Scale
    },
    consumables: {
      [RARITY.COMMON]:   ['G', '⌬'],         // Base Potion, Bread
      [RARITY.UNCOMMON]: ['y'],              // Firecracker
      [RARITY.RARE]:     ['♥', '★', '∞', '♦', 'Ω']
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
 * Merge affinity pools into a single combined table.
 * Multiple affinities union their category/rarity arrays with deduplication.
 * @param {string[]} affinityList
 * @returns {Object} merged table with categories as keys
 */
function mergeAffinityPools(affinityList) {
  const categories = ['ingredients', 'weapons', 'traps', 'armor', 'consumables'];
  const rarities = Object.values(RARITY);
  const merged = {};
  for (const category of categories) {
    merged[category] = {};
    for (const rarity of rarities) {
      const seen = new Set();
      const chars = [];
      for (const affinity of affinityList) {
        const pool = AFFINITY_POOLS[affinity];
        for (const char of (pool?.[category]?.[rarity] ?? [])) {
          if (!seen.has(char)) { seen.add(char); chars.push(char); }
        }
      }
      merged[category][rarity] = chars;
    }
  }
  return merged;
}

/**
 * Get random drop from one or more affinity pools.
 * @param {string|string[]} affinities - Affinity name(s) (e.g., 'beast' or ['beast', 'fire'])
 * @param {string} category - 'ingredients', 'weapons', 'traps', 'armor', or 'consumables'
 * @param {Object} rarityWeights - Optional rarity weight multipliers
 * @returns {string|null} - Selected character or null
 */
export function getRandomDrop(affinities, category, rarityWeights = {}) {
  const list = Array.isArray(affinities) ? affinities : [affinities];
  const merged = mergeAffinityPools(list);
  if (!merged[category]) return null;
  return getWeightedRandomFromPool(merged[category], rarityWeights);
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
 * Generate drops for an enemy based on its affinities and difficulty tier.
 *
 * @param {string|string[]} affinities - One or more affinity tags (e.g., ['beast','fire']).
 *   Also accepts a plain string for backward compat with background-object dropTable lookups.
 * @param {string} tier - Difficulty tier: 'weak' | 'normal' | 'elite' | 'boss'
 * @param {number|null} dropCount - Override drop count (null = auto)
 * @returns {string[]} Array of item/ingredient chars to drop
 */
export function generateEnemyDrops(affinities, tier = 'normal', dropCount = null) {
  // Accept string (background-object backward compat) or array
  const affinityList = Array.isArray(affinities) ? affinities : [affinities].filter(Boolean);
  if (affinityList.length === 0) return [];

  const mergedTable = mergeAffinityPools(affinityList);
  const profile = RARITY_PROFILES[tier] || RARITY_PROFILES.normal;

  // Determine drop count. Tiered distributions keep drops as signal rather than noise:
  // weak enemies often drop nothing; elites are generous; bosses always drop 2 (or
  // whatever baseDropCount the caller passed in).
  let count;
  if (dropCount !== null && dropCount !== undefined) {
    count = dropCount;
  } else if (tier === 'boss') {
    count = 2;
  } else {
    const roll = Math.random();
    if (tier === 'elite') {
      count = roll < 0.15 ? 0 : roll < 0.75 ? 1 : 2;
    } else if (tier === 'weak') {
      count = roll < 0.60 ? 0 : roll < 0.98 ? 1 : 2;
    } else { // normal
      count = roll < 0.40 ? 0 : roll < 0.93 ? 1 : 2;
    }
  }

  const drops = [];

  for (let i = 0; i < count; i++) {
    // Weighted category selection: ingredients dominate; crafted items (weapons,
    // traps, armor) are meaningful but uncommon — mirrors the "drop is another
    // path to discovery" design intent. Armor is rarest since it's never common
    // within any affinity pool either.
    const categoryRoll = Math.random();
    let category;
    if      (categoryRoll < 0.77) category = 'ingredients';
    else if (categoryRoll < 0.87) category = 'consumables';
    else if (categoryRoll < 0.92) category = 'weapons';
    else if (categoryRoll < 0.97) category = 'traps';
    else                          category = 'armor';

    const drop = getWeightedRandomFromPool(mergedTable[category] ?? {}, profile);
    if (drop) drops.push(drop);
  }

  return drops;
}
