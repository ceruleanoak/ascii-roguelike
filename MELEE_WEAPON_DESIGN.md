# Melee Weapon Design - Attack Patterns & Balance

## Current Melee Weapons (20 total)

### DPS Analysis (from Validation Report)
```
Current Issues:
- Melee avg DPS: 8.7 (TOO HIGH vs gun 3.2, bow 3.1)
- Legendary Flame Sword: 24.0 DPS (BROKEN)
- Dragon Blade: 12.5 DPS (BROKEN)
- Flame Sword: 10.0 DPS (BROKEN)
- Root cause: Too-low cooldowns for high damage
```

### Balance Formula
```
Windup Time = damage * 0.15  (0.3s for 2 dmg, 0.9s for 6 dmg)
Total Attack Time = windup + execution
Cooldown = windup + execution + recovery
Target DPS = 4.5 for melee (1.5x ranged as risk reward)
```

---

## Weapon Categories & Unique Patterns

### 1. SWORDS - Fast, Directional Slashes

**Weapons**: Sword (†), Flame Sword (‡), Legendary Flame Sword (⚔), Blood Sword (╫), Venom Blade (⚡), Acid Blade (♠), Chaos Blade (◇)

**Pattern Type**: **3-hit arc** in facing direction
```
Windup → Slash sequence:
  Position 1: -45° from facing
  Position 2: 0° (straight ahead)
  Position 3: +45° from facing

Timing: 0.05s between hits
Total execution: 0.15s
```

**Visual**:
```
    /  |  \
   /   |   \
  1    2    3
```

**Current Stats → New Stats**:
| Weapon | DMG | Old CD | Windup | Execution | Recovery | New CD | DPS |
|--------|-----|--------|--------|-----------|----------|--------|-----|
| Sword (†) | 2 | 0.3 | 0.3 | 0.15 | 0.15 | 0.6 | 3.3 |
| Flame Sword (‡) | 3 | 0.3 | 0.45 | 0.15 | 0.15 | 0.75 | 4.0 |
| Blood Sword (╫) | 4 | 0.4 | 0.6 | 0.15 | 0.15 | 0.9 | 4.4 |
| Venom Blade (⚡) | 5 | 0.3 | 0.75 | 0.15 | 0.15 | 1.05 | 4.8 |
| Acid Blade (♠) | 4 | 0.35 | 0.6 | 0.15 | 0.15 | 0.9 | 4.4 |
| Legendary Flame (⚔) | 6 | 0.25 | 0.9 | 0.15 | 0.15 | 1.2 | 5.0 |
| Chaos Blade (◇) | 4 | 0.4 | 0.6 | 0.15 | 0.15 | 0.9 | 4.4 |

---

### 2. HEAVY BLADES - Massive Single Strike

**Weapons**: Dragon Blade (⌘)

**Pattern Type**: **Charged slash** with expanding hitbox
```
Windup → Single massive slash
  Position 1: Wide arc (3 cells wide, 2 cells deep)

Timing: Instant (all at once after windup)
Total execution: 0.1s
```

**Visual**:
```
   \ | /
    \|/
    @@@  (3 wide, 2 deep)
```

**Stats**:
| Weapon | DMG | Old CD | Windup | Execution | Recovery | New CD | DPS |
|--------|-----|--------|--------|-----------|----------|--------|-----|
| Dragon Blade (⌘) | 5 | 0.4 | 0.75 | 0.1 | 0.25 | 1.1 | 4.5 |

---

### 3. AXES - Wide Cleave

**Weapons**: Bone Axe (⊤), Thunder Axe (⚯), Bone Crusher (⚒)

**Pattern Type**: **Horizontal sweep** (5 positions)
```
Windup → Sequential left-to-right sweep
  Position 1: Far left (-90°)
  Position 2: Mid left (-45°)
  Position 3: Center (0°)
  Position 4: Mid right (+45°)
  Position 5: Far right (+90°)

Timing: 0.04s between hits
Total execution: 0.2s
```

**Visual**:
```
  1  2  3  4  5
   \  \ | /  /
    \  \|/  /
```

**Stats**:
| Weapon | DMG | Old CD | Windup | Execution | Recovery | New CD | DPS |
|--------|-----|--------|--------|-----------|----------|--------|-----|
| Bone Axe (⊤) | 4 | 0.5 | 0.6 | 0.2 | 0.2 | 1.0 | 4.0 |
| Thunder Axe (⚯) | 5 | 0.6 | 0.75 | 0.2 | 0.2 | 1.15 | 4.3 |
| Bone Crusher (⚒) | 7 | 0.6 | 1.05 | 0.2 | 0.2 | 1.45 | 4.8 |

---

### 4. HAMMERS - Radial Shockwave

**Weapons**: Ice Hammer (☃), Exploding Mace (◉), Earthquake Hammer (▼)

**Pattern Type**: **Expanding rings** from impact point
```
Windup → Impact → Shockwave rings
  Ring 1: 1 cell radius (immediate)
  Ring 2: 2 cell radius (0.1s delay)
  Ring 3: 3 cell radius (0.2s delay)

Timing: 0.1s between rings
Total execution: 0.3s
```

**Visual**:
```
      3 3 3 3 3
    3 2 2 2 2 3
    3 2 1 1 2 3
    3 2 1 @ 1 2 3
    3 2 1 1 2 3
    3 2 2 2 2 3
      3 3 3 3 3
```

**Stats**:
| Weapon | DMG | Old CD | Windup | Execution | Recovery | New CD | DPS |
|--------|-----|--------|--------|-----------|----------|--------|-----|
| Ice Hammer (☃) | 4 | 0.6 | 0.6 | 0.3 | 0.2 | 1.1 | 3.6 |
| Exploding Mace (◉) | 4 | 0.8 | 0.6 | 0.3 | 0.3 | 1.2 | 3.3 |
| Earthquake (▼) | 6 | 1.0 | 0.9 | 0.3 | 0.3 | 1.5 | 4.0 |

---

### 5. SPEARS - Linear Pierce

**Weapons**: Spear (↑)

**Pattern Type**: **Forward thrust** (3 cells in line)
```
Windup → Sequential thrust outward
  Position 1: 1 cell away
  Position 2: 2 cells away
  Position 3: 3 cells away

Timing: 0.05s between positions
Total execution: 0.15s
```

**Visual**:
```
    @  →  1  →  2  →  3
```

**Stats**:
| Weapon | DMG | Old CD | Windup | Execution | Recovery | New CD | DPS |
|--------|-----|--------|--------|-----------|----------|--------|-----|
| Spear (↑) | 3 | 0.4 | 0.45 | 0.15 | 0.15 | 0.75 | 4.0 |

---

### 6. DAGGERS - Rapid Multi-Stab

**Weapons**: Vampire Dagger (♣)

**Pattern Type**: **3 rapid stabs** in facing direction
```
Windup → Rapid stab sequence
  Stab 1: Immediate
  Stab 2: 0.05s delay
  Stab 3: 0.1s delay

Timing: 0.05s between stabs
Total execution: 0.15s
All hit same position (stacking damage)
```

**Visual**:
```
    @ → ††† (triple stab, same spot)
```

**Stats**:
| Weapon | DMG | Old CD | Windup | Execution | Recovery | New CD | DPS |
|--------|-----|--------|--------|-----------|----------|--------|-----|
| Vampire Dagger (♣) | 3 | 0.25 | 0.2 | 0.15 | 0.15 | 0.5 | 6.0 |

**Note**: Dagger intentionally high DPS (risk/reward for close range)

---

### 7. WHIPS - Long Linear Sweep

**Weapons**: Whip (≋)

**Pattern Type**: **Linear crack** (long reach)
```
Windup → Whip extends outward
  Position 1-5: Sequential 1→5 cells away

Timing: 0.02s between positions
Total execution: 0.1s
```

**Visual**:
```
    @ → 1 → 2 → 3 → 4 → 5
```

**Stats**:
| Weapon | DMG | Old CD | Windup | Execution | Recovery | New CD | DPS |
|--------|-----|--------|--------|-----------|----------|--------|-----|
| Whip (≋) | 2 | 0.3 | 0.3 | 0.1 | 0.1 | 0.5 | 4.0 |

---

### 8. FLAILS - Circular Sweep

**Weapons**: Flail (○)

**Pattern Type**: **8-direction spin** (already implemented!)
```
Windup → Clockwise sweep
  8 positions around player

Timing: 0.05s between positions
Total execution: 0.4s
```

**Visual**:
```
    2  3  4
    1  @  5
    8  7  6
```

**Stats**:
| Weapon | DMG | Old CD | Windup | Execution | Recovery | New CD | DPS |
|--------|-----|--------|--------|-----------|----------|--------|-----|
| Flail (○) | 3 | 0.7 | 0.45 | 0.4 | 0.15 | 1.0 | 3.0 |

---

### 9. STUN WEAPONS - Control Focus

**Weapons**: Stun Baton (╪)

**Pattern Type**: **Forward jab** with knockback
```
Windup → Single position stun
  Position 1: In facing direction

Timing: Instant
Total execution: 0.1s
```

**Visual**:
```
    @ → ⚡ (single target)
```

**Stats**:
| Weapon | DMG | Old CD | Windup | Execution | Recovery | New CD | DPS |
|--------|-----|--------|--------|-----------|----------|--------|-----|
| Stun Baton (╪) | 2 | 0.5 | 0.3 | 0.1 | 0.2 | 0.6 | 3.3 |

---

## Summary Table - Balanced DPS

| Weapon Category | Avg DMG | Avg CD | Target DPS | Pattern Type |
|-----------------|---------|--------|------------|--------------|
| Daggers | 3 | 0.5 | 6.0 | Rapid multi-hit |
| Swords | 3-6 | 0.6-1.2 | 3.3-5.0 | 3-hit arc |
| Spears | 3 | 0.75 | 4.0 | Linear pierce |
| Whips | 2 | 0.5 | 4.0 | Long linear |
| Axes | 4-7 | 1.0-1.45 | 4.0-4.8 | Wide sweep |
| Hammers | 4-6 | 1.1-1.5 | 3.3-4.0 | Radial shockwave |
| Flails | 3 | 1.0 | 3.0 | Circular sweep |
| Heavy Blades | 5 | 1.1 | 4.5 | Massive slash |
| Stun | 2 | 0.6 | 3.3 | Control |

**Target Melee DPS**: 3.0 - 6.0 (vs Gun 2.0, Bow 2.5)
**Risk/Reward**: Melee ~1.5-2x ranged DPS justified by close range danger

---

## Implementation Plan

### 1. Add Windup System
```javascript
// In Item.js
createMeleeAttack(player) {
  return {
    type: 'melee',
    windup: this.data.windup || 0,
    pattern: this.getAttackPattern(),
    // ... rest
  };
}
```

### 2. Implement Attack Patterns
```javascript
// Pattern types:
- 'arc': 3-hit arc (swords)
- 'sweep': Horizontal sweep (axes)
- 'shockwave': Expanding rings (hammers)
- 'thrust': Linear pierce (spears)
- 'multistab': Rapid same-position (daggers)
- 'whipcrack': Long linear (whips)
- 'ring': Circular sweep (flails) ✅ DONE
- 'slam': Single massive (heavy blades)
```

### 3. Update Items.js
Add to each melee weapon:
```javascript
windup: 0.6,           // Pre-attack delay
attackPattern: 'arc',  // Pattern type
patternSpeed: 0.05,    // Time between hits
```

---

## Next Steps

1. Implement windup delay in CombatSystem
2. Create pattern generators in Item.js
3. Update all 20 melee weapons with new stats
4. Test each pattern visually
5. Balance DPS against target ranges
