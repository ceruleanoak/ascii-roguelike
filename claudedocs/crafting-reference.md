# Crafting System Reference

## Overview
- **Total Recipes**: 90
- **System**: Two-slot crafting (left + right = center result)
- **Order**: Recipes work in both directions (left+right OR right+left)

---

## Ingredients (12 Total)

| Char | Name | Color | Common Sources |
|------|------|-------|----------------|
| `f` | Fur | Brown | Animals |
| `t` | Teeth | White | Predators |
| `g` | Goo | Green | Slimes |
| `w` | Wing | Gray | Flying enemies |
| `c` | Coin | Yellow | Treasure |
| `b` | Bone | White | Skeletons |
| `m` | Meat | Red | Animals |
| `s` | Scale | Magenta | Dragons |
| `F` | Fire Essence | Orange | Fire enemies |
| `M` | Metal | Gray | Mechanical enemies |
| `~` | String | Gray | Spiders |
| `|` | Stick | Brown | Trees/wood |

---

## Recipe Categories

### 1. Basic Weapon Upgrades (4 recipes)

| Left | Right | Result | Name | Type | Notes |
|------|-------|--------|------|------|-------|
| `/` | `M` | `⌂` | Shotgun | Gun | 3-bullet spread, slow |
| `†` | `F` | `‡` | Flame Sword | Melee | Burns enemies |
| `\|` | `~` | `)` | Bow | Bow | Basic ranged |
| `/` | `/` | `X` | Dual Pistols | Gun | Fast fire rate |

### 2. Armor & Defense (3 recipes)

| Left | Right | Result | Name | Defense | Notes |
|------|-------|--------|------|---------|-------|
| `b` | `g` | `A` | Bone Armor | 2 | Basic armor |
| `f` | `f` | `▓` | Fur Coat | 1 | Light armor |
| `s` | `M` | `◘` | Dragon Scale Armor | 5 | Best armor |

### 3. Consumables (9 recipes)

| Left | Right | Result | Name | Effect | Notes |
|------|-------|--------|------|--------|-------|
| `F` | `g` | `@` | Bomb | Explode | 5 damage, 40 radius |
| `m` | `F` | `H` | Health Potion | Heal | +5 HP |
| `s` | `s` | `♦` | Dragon Heart | Max HP | +5 max HP |
| `w` | `w` | `∞` | Wings | Speed | 30s duration |
| `t` | `f` | `◊` | Trophy | Gold | +10 gold |
| `w` | `F` | `✦` | Phoenix Feather | Revive | One-time revive |
| `b` | `F` | `☠` | Cursed Skull | Curse | 10 damage, 60 radius |
| `m` | `~` | `♥` | Heart | Heal | +10 HP |
| `c` | `F` | `★` | Lucky Coin | Luck | 60s duration |

### 4. Advanced Melee Weapons (20 recipes)

#### Tier 1 Advanced
| Left | Right | Result | Name | Damage | Special |
|------|-------|--------|------|--------|---------|
| `†` | `s` | `⌘` | Dragon Blade | 5 | Long range (24) |
| `b` | `M` | `⊤` | Bone Axe | 4 | Medium range (22) |
| `t` | `M` | `↑` | Spear | 3 | Longest range (28) |
| `g` | `M` | `♠` | Acid Blade | 4 | Acid effect |

#### Tier 2 Upgraded Melee
| Left | Right | Result | Name | Damage | Special |
|------|-------|--------|------|--------|---------|
| `‡` | `s` | `⚔` | Legendary Flame Sword | 6 | Fast + burn |
| `⌘` | `g` | `⚡` | Venom Blade | 5 | Poison |
| `⊤` | `b` | `⚒` | Bone Crusher | 7 | Slow but powerful |

#### Tier 3 Specialized Melee
| Left | Right | Result | Name | Damage | Special |
|------|-------|--------|------|--------|---------|
| `⊤` | `g` | `☃` | Ice Hammer | 4 | Freeze + knockback 250 |
| `~` | `~` | `≋` | Whip | 2 | Long range (40) |
| `M` | `~` | `○` | Flail | 3 | Ring attack |
| `†` | `m` | `╫` | Blood Sword | 4 | Bleed + 40% lifesteal |
| `⊤` | `F` | `⚯` | Thunder Axe | 5 | Chain to 2 enemies |
| `⊤` | `@` | `◉` | Exploding Mace | 4 | 45 radius explosion |
| `↑` | `w` | `╪` | Stun Baton | 2 | Stun + knockback 200 |
| `‡` | `m` | `♣` | Vampire Dagger | 3 | Fast + 60% lifesteal |
| `⚒` | `M` | `▼` | Earthquake Hammer | 6 | 60 radius + knockback 350 |
| `⌘` | `F` | `◇` | Chaos Blade | 4 | Burn effect |

### 5. Gun Weapons (20 recipes)

#### Tier 1 Basic Guns
| Left | Right | Result | Name | Damage | Special |
|------|-------|--------|------|--------|---------|
| `/` | `M` | `⌂` | Shotgun | 1 | 3 bullets |
| `/` | `/` | `X` | Dual Pistols | 1 | Fast (0.25s) |

#### Tier 2 Advanced Guns
| Left | Right | Result | Name | Damage | Special |
|------|-------|--------|------|--------|---------|
| `⌂` | `s` | `☼` | Dragon Shotgun | 2 | 5 bullets |
| `X` | `M` | `※` | Heavy Pistols | 2 | Slow pistols |

#### Tier 3 Specialized Guns
| Left | Right | Result | Name | Damage | Special |
|------|-------|--------|------|--------|---------|
| `/` | `M` | `⌐` | Machine Gun | 1 | Burst, very fast (0.15s) |
| `/` | `g` | `❄` | Freeze Ray | 1 | Freeze effect |
| `/` | `F` | `⚛` | Lightning Gun | 2 | Chain to 3 enemies |
| `⌂` | `F` | `⊕` | Rocket Launcher | 3 | 50 radius explosion |
| `/` | `s` | `═` | Plasma Rifle | 2 | Pierce through enemies |
| `⌐` | `F` | `◙` | Laser Cannon | 5 | Very fast bullets |
| `⌂` | `M` | `⊞` | Scatter Gun | 1 | 7 bullets |
| `X` | `g` | `☣` | Venom Pistol | 2 | Poison + 30% lifesteal |
| `/` | `w` | `╬` | Stun Gun | 1 | Stun effect |
| `※` | `M` | `⊿` | Ricochet Rifle | 2 | 3 ricochets |

### 6. Bow Weapons (11 recipes)

#### Tier 1 Basic Bows
| Left | Right | Result | Name | Damage | Special |
|------|-------|--------|------|--------|---------|
| `\|` | `~` | `)` | Bow | 2 | Basic bow |
| `)` | `F` | `⟩` | Fire Bow | 3 | Burn effect |

#### Tier 2 Advanced Bows
| Left | Right | Result | Name | Damage | Special |
|------|-------|--------|------|--------|---------|
| `⟩` | `w` | `⇒` | Sky Bow | 4 | Faster (0.6s) |

#### Tier 3 Specialized Bows
| Left | Right | Result | Name | Damage | Special |
|------|-------|--------|------|--------|---------|
| `)` | `g` | `❅` | Ice Bow | 2 | Freeze effect |
| `)` | `~` | `⋙` | Multi-Shot Bow | 2 | 3 arrows |
| `)` | `@` | `⊛` | Explosive Bow | 3 | 40 radius explosion |
| `)` | `w` | `◈` | Homing Bow | 3 | Homing arrows |
| `)` | `M` | `⇶` | Piercing Bow | 3 | Pierce enemies |
| `⟩` | `F` | `≈` | Chain Bow | 2 | Chain to 2 enemies |
| `)` | `s` | `⋰` | Split Bow | 2 | Split into 3 |
| `⇒` | `F` | `⋯` | Burst Bow | 2 | Fast burst (0.6s) |

### 7. Utility Items (6 recipes)

| Left | Right | Result | Name | Effect |
|------|-------|--------|------|--------|
| `f` | `~` | `R` | Rope | Utility |
| `c` | `c` | `$` | Gold | +100 currency |
| `g` | `g` | `●` | Slime Ball | Slow for 10s |
| `M` | `M` | `■` | Metal Block | Block |
| `\|` | `\|` | `=` | Platform | Platform |

---

## Crafting Trees

### Gun Progression Path
```
/ (Gun)
├─ + M → ⌂ (Shotgun)
│  ├─ + s → ☼ (Dragon Shotgun)
│  ├─ + F → ⊕ (Rocket Launcher)
│  └─ + M → ⊞ (Scatter Gun)
│
├─ + / → X (Dual Pistols)
│  ├─ + M → ※ (Heavy Pistols)
│  │  └─ + M → ⊿ (Ricochet Rifle)
│  └─ + g → ☣ (Venom Pistol)
│
├─ + M → ⌐ (Machine Gun)
│  └─ + F → ◙ (Laser Cannon)
│
├─ + g → ❄ (Freeze Ray)
├─ + F → ⚛ (Lightning Gun)
├─ + s → ═ (Plasma Rifle)
└─ + w → ╬ (Stun Gun)
```

### Melee Progression Path
```
† (Sword)
├─ + F → ‡ (Flame Sword)
│  ├─ + s → ⚔ (Legendary Flame Sword)
│  └─ + m → ♣ (Vampire Dagger)
│
├─ + s → ⌘ (Dragon Blade)
│  ├─ + g → ⚡ (Venom Blade)
│  └─ + F → ◇ (Chaos Blade)
│
└─ + m → ╫ (Blood Sword)

b (Bone)
└─ + M → ⊤ (Bone Axe)
   ├─ + b → ⚒ (Bone Crusher)
   │  └─ + M → ▼ (Earthquake Hammer)
   ├─ + g → ☃ (Ice Hammer)
   ├─ + F → ⚯ (Thunder Axe)
   └─ + @ → ◉ (Exploding Mace)
```

### Bow Progression Path
```
| + ~ → ) (Bow)
├─ + F → ⟩ (Fire Bow)
│  ├─ + w → ⇒ (Sky Bow)
│  │  └─ + F → ⋯ (Burst Bow)
│  └─ + F → ≈ (Chain Bow)
│
├─ + g → ❅ (Ice Bow)
├─ + ~ → ⋙ (Multi-Shot Bow)
├─ + @ → ⊛ (Explosive Bow)
├─ + w → ◈ (Homing Bow)
├─ + M → ⇶ (Piercing Bow)
└─ + s → ⋰ (Split Bow)
```

---

## Recipe Quick Lookup

### By Ingredient: Fire Essence (F)
- `F` + `g` → `@` (Bomb)
- `m` + `F` → `H` (Health Potion)
- `†` + `F` → `‡` (Flame Sword)
- `)` + `F` → `⟩` (Fire Bow)
- `w` + `F` → `✦` (Phoenix Feather)
- `b` + `F` → `☠` (Cursed Skull)
- `c` + `F` → `★` (Lucky Coin)
- `/` + `F` → `⚛` (Lightning Gun)
- `⌂` + `F` → `⊕` (Rocket Launcher)
- `⌐` + `F` → `◙` (Laser Cannon)
- `⊤` + `F` → `⚯` (Thunder Axe)
- `⌘` + `F` → `◇` (Chaos Blade)
- `⟩` + `F` → `≈` (Chain Bow)
- `⇒` + `F` → `⋯` (Burst Bow)

### By Ingredient: Metal (M)
- `/` + `M` → `⌂` (Shotgun)
- `b` + `M` → `⊤` (Bone Axe)
- `t` + `M` → `↑` (Spear)
- `M` + `M` → `■` (Metal Block)
- `X` + `M` → `※` (Heavy Pistols)
- `s` + `M` → `◘` (Dragon Scale Armor)
- `g` + `M` → `♠` (Acid Blade)
- `/` + `M` → `⌐` (Machine Gun)
- `⌂` + `M` → `⊞` (Scatter Gun)
- `※` + `M` → `⊿` (Ricochet Rifle)
- `M` + `~` → `○` (Flail)
- `⚒` + `M` → `▼` (Earthquake Hammer)
- `)` + `M` → `⇶` (Piercing Bow)

### By Ingredient: Goo (g)
- `F` + `g` → `@` (Bomb)
- `b` + `g` → `A` (Bone Armor)
- `g` + `g` → `●` (Slime Ball)
- `⌘` + `g` → `⚡` (Venom Blade)
- `g` + `M` → `♠` (Acid Blade)
- `/` + `g` → `❄` (Freeze Ray)
- `X` + `g` → `☣` (Venom Pistol)
- `⊤` + `g` → `☃` (Ice Hammer)
- `)` + `g` → `❅` (Ice Bow)

### By Ingredient: Scale (s)
- `s` + `s` → `♦` (Dragon Heart)
- `†` + `s` → `⌘` (Dragon Blade)
- `⌂` + `s` → `☼` (Dragon Shotgun)
- `‡` + `s` → `⚔` (Legendary Flame Sword)
- `s` + `M` → `◘` (Dragon Scale Armor)
- `/` + `s` → `═` (Plasma Rifle)
- `)` + `s` → `⋰` (Split Bow)

### By Ingredient: Wing (w)
- `w` + `w` → `∞` (Wings)
- `⟩` + `w` → `⇒` (Sky Bow)
- `w` + `F` → `✦` (Phoenix Feather)
- `/` + `w` → `╬` (Stun Gun)
- `↑` + `w` → `╪` (Stun Baton)
- `)` + `w` → `◈` (Homing Bow)

---

## Stats Summary

### Weapon Type Distribution
- **Guns**: 20 recipes (22%)
- **Melee**: 20 recipes (22%)
- **Bows**: 11 recipes (12%)
- **Consumables**: 9 recipes (10%)
- **Armor**: 3 recipes (3%)
- **Utility**: 6 recipes (7%)

### Damage Tiers
**Melee:**
- Low (2-3): Whip, Stun Baton, Vampire Dagger
- Medium (4-5): Most melee weapons
- High (6-7): Legendary Flame Sword, Bone Crusher, Earthquake Hammer

**Guns:**
- Low (1): Machine Gun, Shotgun variants, utility guns
- Medium (2): Most specialized guns
- High (3-5): Rocket Launcher, Laser Cannon

**Bows:**
- Standard (2-3): Most bows
- High (4): Sky Bow

### Special Effects Coverage
- **Burn**: 6 weapons
- **Freeze**: 3 weapons
- **Poison**: 3 weapons
- **Stun**: 2 weapons
- **Chain**: 3 weapons
- **Explosion**: 5 weapons
- **Pierce**: 2 weapons
- **Lifesteal**: 3 weapons
- **Knockback**: 3 weapons

---

## Design Notes

### Ingredient Balance
- Most recipes use 2 ingredients
- Some ingredients are more versatile (F, M, g used in many recipes)
- Rare ingredients (s, w) create powerful items
- Self-combinations create special items (s+s, g+g, etc.)

### Progression Balance
- 3-tier weapon progression: Basic → Advanced → Legendary
- Each weapon type has multiple specializations
- Consumables provide strategic options
- Utility items add gameplay variety

### Missing Combinations
Potential gaps for future recipes:
- `t` + `~` (Teeth + String)
- `m` + `b` (Meat + Bone)
- `c` + `M` (Coin + Metal)
- `f` + `m` (Fur + Meat)
- More armor recipes (only 3 total)
