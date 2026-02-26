# Items.js Balance & Metadata Reference

Comprehensive guide for creating and modifying items in `src/data/items.js`.

---

## Table of Contents

1. [Item Types & Constants](#item-types--constants)
2. [Universal Properties](#universal-properties)
3. [Weapon Properties](#weapon-properties)
4. [Armor Properties](#armor-properties)
5. [Consumable Properties](#consumable-properties)
6. [Trap Properties](#trap-properties)
7. [Balance Guidelines](#balance-guidelines)
8. [Status Effects Reference](#status-effects-reference)
9. [Drop Tables & Rarity](#drop-tables--rarity)

---

## Item Types & Constants

### ITEM_TYPES
```javascript
WEAPON      // Combat items (guns, melee, bows)
ARMOR       // Defense items (equipped as armor slot)
CONSUMABLE  // Usable items (heals, buffs, throwables)
INGREDIENT  // Crafting materials
TRAP        // Placeable items (one-time or persistent)
```

### WEAPON_TYPES
```javascript
GUN    // Ranged projectile weapons with cooldown
MELEE  // Close-range weapons with attack patterns
BOW    // Arrow-based weapons with charge mechanic
```

---

## Universal Properties

**Every item requires:**

| Property | Type | Description | Example |
|----------|------|-------------|---------|
| `char` | string | Single ASCII character (0x20-0x7E only) | `'†'` |
| `name` | string | Display name shown to player | `'Sword'` |
| `type` | ITEM_TYPES | Item category | `ITEM_TYPES.WEAPON` |
| `color` | string | Hex color code | `'#ff4400'` or `COLORS.ITEM` |

---

## Weapon Properties

### Required for ALL Weapons

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `weaponType` | WEAPON_TYPES | Yes | `GUN`, `MELEE`, or `BOW` |
| `damage` | number | Yes | Base damage per hit (1-10 typical) |

### GUN-Specific Properties

| Property | Type | Default | Description | Balance Notes |
|----------|------|---------|-------------|---------------|
| `cooldown` | number | Required | Seconds between shots (0.4-2.5) | Lower = faster fire rate |
| `bulletCount` | number | 1 | Number of bullets per shot (1-8) | Shotgun-style spread |
| `bulletSpeed` | number | 250 | Pixels per second (180-400) | Lower = easier to dodge |
| `bulletChar` | string | `-` | Visual character for bullet | Use ASCII only |
| `maxUses` | number | ∞ | Limited ammo (Machine Gun: 30) | For balance on powerful guns |

### MELEE-Specific Properties

| Property | Type | Default | Description | Balance Notes |
|----------|------|---------|-------------|---------------|
| `windup` | number | Required | Attack startup time in seconds (0.2-1.05) | Higher = slower attack |
| `recovery` | number | Required | Attack recovery time in seconds (0.15-1.0) | Time before next attack |
| `attackPattern` | string | Required | Attack animation pattern (see below) | Defines hitbox shape |
| `patternSpeed` | number | Varies | Animation speed (0.02-0.2) | Lower = slower animation |
| `range` | number | Required | Attack reach in pixels (16-40) | Higher = longer reach |
| `weaponSubtype` | string | null | `'blunt'` for hammers/axes | Affects interactions |
| `isBlade` | boolean | false | Whether weapon is a blade | Affects interactions |
| `meleeChar` | string | null | Override attack visual character | For whips, etc. |

**Attack Patterns:**
- `'arc'` - 3-hit sweeping arc (swords) - medium range
- `'sweep'` - 5-position horizontal sweep (axes) - wide area
- `'thrust'` - Linear forward thrust (spears) - long reach
- `'ring'` - Sequential circular sweep (flails) - 360° coverage
- `'shockwave'` - Expanding concentric rings (hammers) - area control
- `'multistab'` - Rapid stabs in same spot (daggers) - burst damage
- `'whipcrack'` - Long linear crack (whips) - maximum range
- `'slam'` - Single massive strike with large hitbox (heavy)
- `'default'` - Simple forward attack (batons)

### BOW-Specific Properties

| Property | Type | Default | Description | Balance Notes |
|----------|------|---------|-------------|---------------|
| `cooldown` | number | Required | Time between shots (1.2-2.5) | Bows slower than guns |
| `maxUses` | number | Required | Arrows per room (5-30) | Critical for balance |
| `arrowChar` | string | `'→'` | Visual character for arrow | Use ASCII only |
| `arrowCount` | number | 1 | Multi-shot arrows (Multi-Shot Bow: 3) | Uses 1 arrow, fires multiple |
| `attackPattern` | string | null | Special patterns (`'burst'` = 3 sequential) | For Burst Bow |

### Special Effect Properties (All Weapon Types)

| Property | Type | Default | Description | Balance Impact |
|----------|------|---------|-------------|----------------|
| `onHit` | string | null | Status effect on hit (see [Status Effects](#status-effects-reference)) | Major power increase |
| `knockback` | number | 0 | Knockback distance in pixels (100-350) | Crowd control |
| `lifesteal` | number | 0 | Heal ratio (0.3-1.0 = 30%-100% of damage) | Sustain mechanic |
| `electric` | boolean | false | Visual lightning effect | Thematic only |
| `explode` | boolean | false | Creates explosion on hit/impact | Major AOE damage |
| `explodeRadius` | number | 40 | Explosion radius in pixels (40-60) | Requires `explode: true` |
| `pierce` | boolean | false | Projectile passes through enemies | Very powerful |
| `chain` | boolean | false | Damage chains to nearby enemies | Requires `chainCount` |
| `chainCount` | number | 1 | Max chain targets (2-3 typical) | Requires `chain: true` |
| `homing` | boolean | false | Projectile tracks nearest enemy | Very powerful for bows |
| `ricochet` | boolean | false | Bullet bounces off walls | Requires `maxRicochets` |
| `maxRicochets` | number | 0 | Max bounce count (1-3) | Requires `ricochet: true` |
| `split` | boolean | false | Arrow splits on impact | Requires `splitCount` |
| `splitCount` | number | 1 | Number of split projectiles (2-3) | Requires `split: true` |

---

## Armor Properties

**All armor requires `defense` value.**

| Property | Type | Default | Description | Balance Notes |
|----------|------|---------|-------------|---------------|
| `defense` | number | Required | Damage reduction (1-5 typical) | Primary armor stat |
| `bulletResist` | number | 0 | % bullet damage reduction (0.0-0.5) | 0.3 = 30% reduction |
| `dodgeChance` | number | 0 | % chance to dodge attacks (0.0-0.15) | 0.15 = 15% chance |
| `speedBoost` | number | 0 | % movement speed increase (0.0-0.2) | 0.2 = 20% faster |
| `speedPenalty` | number | 0 | % movement speed decrease (0.0-0.2) | Heavy armor trade-off |
| `reflectDamage` | number | 0 | % damage reflected to attackers (0.0-0.5) | 0.25 = 25% reflected |
| `slowEnemies` | boolean | false | Enemies move slower near player | Ice Plate effect |
| `fireImmune` | boolean | false | Immune to burn status and fire damage | Elemental immunity |
| `freezeImmune` | boolean | false | Immune to freeze status and ice damage | Elemental immunity |
| `poisonImmune` | boolean | false | Immune to poison status | Elemental immunity |
| `slimeImmune` | boolean | false | Immune to goo/slime status | **NEW** - Slime immunity |

### Armor Balance Guidelines

- **Low Defense (1-2):** Speed-focused, evasion, or elemental
- **Medium Defense (3-4):** Balanced with special properties
- **High Defense (5+):** Heavy, usually with speed penalty

**Immunity Trade-offs:**
- Single immunity: +0 defense value
- Double immunity (Robe): -1 defense value
- Each immunity worth ~1.5 defense points

---

## Consumable Properties

**Base consumable requires `effect` string.**

| Property | Type | Default | Description | Balance Notes |
|----------|------|---------|-------------|---------------|
| `effect` | string | Required | Effect type (see below) | Defines behavior |
| `oneShot` | boolean | false | Consumed permanently (true) or room-based (false) | Dragon Heart vs Bomb |
| `cooldown` | number | null | Recharge time in seconds (5-30) | For reusable items |
| `passive` | boolean | false | Always active when equipped (Path Amulet) | No activation needed |

### Effect-Specific Properties

| Effect Type | Properties | Description | Example |
|-------------|-----------|-------------|---------|
| `'heal'` | `amount` (number) | Restore HP | Health Potion: `amount: 5` |
| `'maxhp'` | `amount` (number) | Permanent max HP increase | Dragon Heart: `amount: 5`, `oneShot: true` |
| `'speed'` | `duration` (number) | Temporary speed boost | Wings: `duration: 30`, `cooldown: 20` |
| `'explode'` | `damage`, `radius` | Area explosion | Bomb: `damage: 5`, `radius: 40` |
| `'revive'` | - | One death save | Phoenix Feather: `oneShot: true` |
| `'curse'` | `damage`, `radius` | Powerful area nuke | Cursed Skull: `damage: 10`, `radius: 60` |
| `'luck'` | `duration` | Better drop rates | Lucky Coin: `duration: 60`, `oneShot: true` |
| `'slow'` | `duration` | Slime Ball - freeze nearest enemy | Slime Ball: `duration: 10`, `cooldown: 12` |
| `'block'` | - | Temporary defense boost | Metal Block: `cooldown: 15` |
| `'poison'` | - | Poison cloud throw | Poison Flask: `cooldown: 10` |
| `'cleanse'` | - | Remove all status effects | Tonic: `cooldown: 8` |
| `'invuln'` | `duration` | Temporary invulnerability | Smoke Bomb: `duration: 3.5`, `cooldown: 25` |
| `'venomcloud'` | - | Poison cloud area | Venom Vial: `cooldown: 12` |
| `'jolt'` | - | Lightning strike | Jolt Jar: `cooldown: 15` |
| `'shield'` | `charges`, `rechargeCooldown` | Bullet shield charges | Shield: `charges: 3`, `rechargeCooldown: 5` |
| `'bulwark'` | `charges`, `rechargeCooldown` | Full shield (melee + bullets) | Tower Shield: `charges: 2`, `rechargeCooldown: 8` |
| `'waterImmunity'` | `duration` | Ignore water hazards | Rubber Boots: `duration: 25`, `cooldown: 30` |
| `'pathTracker'` | `passive: true` | Show path to exit | Path Amulet: `passive: true` |
| `'throwSteam'` | `radius`, `duration` | Steam cloud area | Steam Vial: `radius: 64`, `duration: 8.0` |
| `'platform'` | - | Place climbable platform | Platform |

---

## Trap Properties

**All traps are placeable items (`type: ITEM_TYPES.TRAP`).**

| Property | Type | Default | Description | Balance Notes |
|----------|------|---------|-------------|---------------|
| `oneShot` | boolean | Required | True = triggers once, False = persistent | Affects reusability |
| `triggerRadius` | number | null | Detection radius in pixels (24-32) | For one-shot traps |
| `effectRadius` | number | Required | Effect range in pixels (64-128) | Area of effect |
| `effect` | string | Required | Status effect type | See Status Effects |
| `effectDuration` | number | Varies | Status duration in seconds (6-12) | How long effect lasts |
| `electric` | boolean | false | Visual lightning effect | Thematic only |

### One-Shot Traps (oneShot: true)

**Trigger once when enemy enters triggerRadius, then disappear.**

| Trap | Trigger | Effect | Duration | Effect Radius |
|------|---------|--------|----------|---------------|
| Freeze Trap `[` | 24px | `'freeze'` | 10.0s | 96px |
| Stun Trap `{` | 24px | `'stun'` | 6.0s | 96px |
| Fire Trap `^` | 24px | `'burn'` | 6.0s | 112px |
| Sleep Bomb `;` | 32px | `'sleep'` | 12.0s | 112px |
| Charm Lure `'` | 32px | `'charm'` | 8.0s | 128px |

### Persistent Traps (oneShot: false)

**Remain active for `activeDuration` or until room cleared.**

| Property | Type | Description | Example |
|----------|------|-------------|---------|
| `activeDuration` | number | Lifetime in seconds | Music Box: `20.0` |
| `tickInterval` | number | Damage/effect tick rate | Tesla Coil: `2.5` |
| `damage` | number | Damage per tick | Tesla Coil: `2` |
| `stunDuration` | number | Stun duration per tick | Tesla Coil: `0.8` |

| Trap | Effect | Radius | Special |
|------|--------|--------|---------|
| Music Box `"` | `'sleep'` (6.0s) | 80px | `activeDuration: 20.0` |
| Noise-maker `:` | `'noise'` (attract) | 128px | Continuous |
| Tesla Coil `]` | `'stun'` (0.8s) | 64px | `tickInterval: 2.5`, `damage: 2` |
| Goo Dispenser `,` | `'goo'` | 80px | Spawns goo blobs |

---

## Balance Guidelines

### Damage Balance

**Weapon Damage Ranges by Type:**
- **Guns:** 1-5 damage
  - Fast fire (0.4-0.6s): 1-2 damage
  - Medium fire (0.8-1.0s): 2-3 damage
  - Slow fire (1.2-2.0s): 3-5 damage
- **Melee:** 1-7 damage
  - Fast attack (windup <0.4s): 1-3 damage
  - Medium attack (windup 0.5-0.7s): 3-5 damage
  - Slow attack (windup 0.8-1.1s): 5-7 damage
- **Bows:** 2-4 damage
  - Standard: 2 damage
  - Elemental/Special: 2-3 damage
  - Heavy/Powerful: 3-4 damage

### DPS Calculation

**Gun DPS = damage × (1 / cooldown) × bulletCount**
- Example: Shotgun - `1 × (1/2.0) × 3 = 1.5 DPS`

**Melee DPS = damage × (1 / (windup + recovery))**
- Example: Sword - `2 × (1/(0.3+0.5)) = 2.5 DPS`

**Balance Target:**
- Low-tier: 1.5-2.5 DPS
- Mid-tier: 2.5-4.0 DPS
- High-tier: 4.0-6.0 DPS

### Special Effect Value

**Power Multipliers (add to effective DPS):**
- `onHit` status effect: +30% value
- `pierce`: +50% value
- `explode`: +40% value (AOE)
- `chain`: +20% per chain target
- `lifesteal`: +25% value (sustain)
- `knockback`: +10% value (control)
- `homing`: +35% value (accuracy)

### Resource Management

**Bow Balance (maxUses):**
- Weak bows: 15-30 uses
- Medium bows: 10-15 uses
- Strong bows: 5-10 uses
- Special effect bows: Reduce by 3-5 uses

**Consumable Cooldowns:**
- Minor effects (cleanse, poison): 8-12s
- Medium effects (heal, slow): 12-18s
- Major effects (invuln, shield): 20-30s
- Permanent upgrades: `oneShot: true`

### Armor Balance Formula

**Effective Defense Value:**
```
EDV = defense
    + (bulletResist × 5)      // 0.3 bulletResist = +1.5 EDV
    + (dodgeChance × 10)       // 0.15 dodgeChance = +1.5 EDV
    + (speedBoost × 5)         // 0.2 speedBoost = +1.0 EDV
    - (speedPenalty × 5)       // 0.2 speedPenalty = -1.0 EDV
    + (reflectDamage × 4)      // 0.25 reflectDamage = +1.0 EDV
    + (immunities × 1.5)       // Each immunity = +1.5 EDV
    + (slowEnemies × 2)        // SlowEnemies = +2.0 EDV
```

**Target EDV Ranges:**
- Starter armor: 1.0-2.0 EDV
- Mid-tier armor: 3.0-5.0 EDV
- High-tier armor: 5.0-8.0 EDV
- Legendary armor: 8.0+ EDV

---

## Status Effects Reference

**Valid `onHit` values for weapons and trap effects:**

| Effect | Duration | Description | Visual |
|--------|----------|-------------|--------|
| `'burn'` | 5.0s | Fire DOT: 1 damage per 1.5s tick | Red blink |
| `'freeze'` | 3.0s | 50% movement slow | Blue blink |
| `'poison'` | 6.0s | Poison DOT: 1 damage per 2.0s tick | Green blink |
| `'stun'` | 2.0s | Cannot move or attack | Yellow blink |
| `'acid'` | 4.0s | Acid DOT: Similar to poison | Green/yellow |
| `'bleed'` | 4.0s | Bleed DOT: Similar to burn | Dark red |
| `'sleep'` | Varies | Cannot act, breaks on damage | Purple |
| `'charm'` | Varies | Enemy fights for player | Pink |
| `'goo'` | 5.0s | 80% slow + prevents dodge roll | Green blink |

**Player-Only Status Effects:**
- `'goo'` - Applied by slime enemies and goo blobs
- `'freeze'` - Applied by ice attacks and cold water

**Enemy Status Effect Modifiers:**
Check `src/data/enemies.js` for:
- `elementalWeakness`: Takes 2× damage from element
- `elementalResistance`: Takes 0.5× damage from element
- Element types: `'fire'`, `'ice'`, `'poison'`, `'electric'`, `'physical'`

---

## Drop Tables & Rarity

### Rarity Tiers

| Rarity | Weight | Description | Example Items |
|--------|--------|-------------|---------------|
| `COMMON` | 100 | Basic drops, frequent | Fur, Teeth, Bone Armor |
| `UNCOMMON` | 30 | Better drops, occasional | Fire Essence, Chain Mail |
| `RARE` | 10 | Powerful drops, rare | Eye, Jaw, Dragon Scale Armor |
| `EPIC` | 2 | Legendary drops, very rare | Currently unused |

### Rarity Profiles (Enemy Drop Rates)

**Apply to enemies in `src/data/enemies.js`:**

```javascript
// Example enemy with drops
drops: [
  { char: 'f', chance: 0.7 },        // 70% chance to drop Fur
  { char: 'V', chance: 0.3 }         // 30% chance to drop Fur Vest
]
```

**Or use thematic drop tables:**

| Profile | Common | Uncommon | Rare | Epic | Usage |
|---------|--------|----------|------|------|-------|
| `weak` | 100% | 15% | 2% | 0% | Low-tier enemies |
| `normal` | 100% | 40% | 10% | 1% | Standard enemies |
| `elite` | 80% | 100% | 30% | 5% | Tough enemies |
| `boss` | 50% | 100% | 100% | 20% | Boss enemies |

### Thematic Drop Tables

**Available themes in DROP_TABLES:**
- `undead` - Bone, Ash, Dust, Bone Armor
- `beast` - Fur, Teeth, Meat, Wing, Leather Armor
- `humanoid` - Coin, Metal, String, Chain Mail
- `elemental_fire` - Fire Essence, Ash, Ember Cloak
- `elemental_ice` - Ice, Rock, Ice Plate
- `poison` - Venom, Goo, Herb
- `dragon` - Scale, Fire Essence, Dragon Scale Armor
- `generic` - Mix of all types

**Example usage:**
```javascript
import { generateEnemyDrops, RARITY_PROFILES } from './items.js';

const drops = generateEnemyDrops('beast', 'elite', 2);
// Returns 2 items from beast table using elite rarity weights
```

---

## Quick Reference Tables

### Common Weapon Configurations

| Weapon Style | Damage | Cooldown/Timing | Special | Example |
|--------------|--------|-----------------|---------|---------|
| Fast Pistol | 1 | 0.4-0.6s | - | Dual Pistols |
| Shotgun | 1 | 2.0s | bulletCount: 3-8 | Shotgun |
| Sniper | 3-5 | 1.2-1.5s | bulletSpeed: 400 | Laser Cannon |
| Fast Sword | 2-3 | windup: 0.2-0.4s | arc | Sword |
| Heavy Sword | 4-6 | windup: 0.6-1.0s | arc/sweep | Dragon Blade |
| Spear | 3 | windup: 0.45s | thrust | Spear |
| Hammer | 4-7 | windup: 0.6-1.05s | shockwave, explode | Earthquake Hammer |
| Standard Bow | 2 | 1.5-1.8s | maxUses: 10-15 | Bow |
| Power Bow | 3-4 | 2.0-2.5s | maxUses: 5-12 | Fire Bow |

### Common Armor Configurations

| Armor Style | Defense | Special Properties | Example |
|-------------|---------|-------------------|---------|
| Light | 1-2 | speedBoost: 0.2 | Leather Armor |
| Medium | 2-3 | Balanced, one immunity | Robe |
| Heavy | 4-5 | bulletResist: 0.3-0.5, speedPenalty: 0.2 | Warplate |
| Elemental | 3-4 | immunity, special effect | Ember Cloak |
| Evasive | 2 | dodgeChance: 0.15, poisonImmune | Ninja Garb |

### Common Consumable Configurations

| Consumable Type | Cooldown | Duration | Special | Example |
|-----------------|----------|----------|---------|---------|
| Heal (minor) | 15s | - | amount: 5 | Health Potion |
| Heal (major) | 20s | - | amount: 10 | Heart |
| Buff | 20-30s | 30-60s | - | Wings |
| Permanent | - | - | oneShot: true | Dragon Heart |
| Offensive | 10-15s | - | damage, radius | Bomb |
| Shield | 5-8s | - | charges: 2-3 | Shield |
| Utility | 8-12s | 10-25s | - | Rubber Boots |

---

## File Locations

**Item Definitions:**
- Weapons: `src/data/items.js:20-744`
- Armor: `src/data/items.js:144-219`
- Consumables: `src/data/items.js:221-884`
- Traps: `src/data/items.js:886-986`
- Ingredients: `src/data/items.js:989-1015`

**Related Systems:**
- Combat Logic: `src/systems/CombatSystem.js`
- Item Class: `src/entities/Item.js`
- Enemy Data: `src/data/enemies.js`
- Crafting Recipes: `src/data/recipes.js`

---

## Character Encoding Rule

**CRITICAL:** All `char` values must use **printable 7-bit ASCII only** (code points 0x20–0x7E).

**Valid:** Letters (A-Z, a-z), digits (0-9), punctuation (!"#$%&'()*+,-./:;<=>?@[\]^_`{|}~)
**INVALID:** Unicode symbols (`❄`, `⚡`, `✦`), box-drawing, emoji, escape sequences (`\uXXXX`)

**Note:** The current codebase has Unicode symbols in items.js that violate this rule. These should be replaced with ASCII equivalents for consistency with the rest of the game (background objects, enemies, etc.).

---

## Balance Testing Checklist

When adding/modifying items:

1. **Calculate DPS/EDV** - Does it fit tier targets?
2. **Compare similar items** - Is it balanced with peers?
3. **Test in-game** - Use CheatMenu (press `C`) to spawn
4. **Check multipliers** - Special effects increase power significantly
5. **Verify resource costs** - Ammo/cooldowns appropriate for power?
6. **Consider combos** - Interaction with other items/systems?
7. **Update recipes** - Does it need a crafting recipe?
8. **Update drop tables** - Should enemies drop this?

---

## Version

Last updated: 2026-02-25
Game Version: v0.3 (Week 3: Zone System)
