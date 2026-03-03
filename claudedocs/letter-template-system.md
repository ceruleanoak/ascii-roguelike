# Letter Template System - Design & Implementation Guide

**Status:** Phase 4 Complete (Boss + Vault + Key + Secret Event System)
**Last Updated:** 2026-03-01

---

## Overview

The **Letter Template System** ties exit letters to visible terrain features, creating:
- **Immediate visual feedback** (player learns "B = Boss clearing" by seeing it)
- **Strategic choices** (terrain affects combat style, loot, hazards)
- **Future-proof for secret words** (FIRE, ROOT, VAULT, etc.)

---

## Design Philosophy

### Core Principle: Letters → Visible Terrain

**Problem with old system:**
- Letters were semantically arbitrary ("D" = Descent, "V" = Valley)
- No player feedback loop (can't tell what letter meant)
- No strategic incentive (all combat rooms felt identical)

**New system:**
- Letters correlate to **BACKGROUND OBJECTS** or **STRUCTURES**
- Three categories:
  - **Literal**: Direct object correlation (G = Grass heavy)
  - **Structures**: Unique terrain patterns (T = Tunnel, V = Vault cage)
  - **Cryptic**: Reward indicators (X = treasure, ? = discovery)

### Vowel Strategy

**Vowels (A, E, I, O, U) = Common rooms** (~60-70% spawn rate)
- Enables future secret word spellings (FIRE, ROOT, ESCAPE, VOID, GOLD, DOOM)
- Should represent density/structure archetypes that work in ALL zones

**Consonants = Specific features** (rarer, zone-biased)
- Terrain-specific (G = Grassy, W = Watery, R = Rocky, F = Fiery)
- Structural (T = Tunnel, V = Vault)
- Special (B = Boss, C = Camp, X = Crossroads treasure)

---

## Technical Architecture

### File Structure

```
src/data/
  ├── exitLetters.js        - Letter selection (weights, room types, secret patterns)
  └── letterTemplates.js    - Room generation (terrain rules, NEW!)

src/systems/
  └── RoomGenerator.js      - Applies templates during generation
```

**Separation of concerns:**
- `exitLetters.js` → "What letters can spawn and when?"
- `letterTemplates.js` → "How does each letter modify room generation?"

### Template Definition Format

```javascript
export const LETTER_TEMPLATES = {
  X: {
    name: 'Template Name',
    description: 'Short gameplay description',

    // Tier 1: Wall structures
    wallStructures: {
      allow: true/false  // Can random wall structures spawn?
    },

    // Tier 2: Background object rules
    bgObjectRules: {
      // Grass density modifier (0.0-1.0, overrides zone density)
      grassDensity: 0.5,  // 50% normal grass

      // Clearing zone (no objects/grass allowed)
      clearingZone: {
        centerCol: 15,      // Grid cell coordinates
        centerRow: 15,
        width: 10,          // Grid cells
        height: 10,
        allowGrass: false,
        allowObjects: false
      },

      // Perimeter density (TODO: not implemented yet)
      perimeterZone: {
        densityMultiplier: 2.0,  // 2x objects in outer ring
        objectBias: {
          '%': 3.0,  // 3x bushes
          '&': 2.0,  // 2x trees
          '0': 0.5   // 0.5x rocks
        }
      },

      // Corner clusters (dense object groups in 4 corners)
      cornerClusters: {
        enabled: true,
        clusterSize: 8,         // Objects per corner
        clusterRadius: 64,      // Pixels
        objectTypes: ['%', '&', '+']  // Allowed chars
      }
    },

    // Tier 3: Enemy spawn rules (TODO: not implemented yet)
    enemySpawnRule: {
      spawnZone: 'center',     // 'center' | 'perimeter' | 'random'
      preventPerimeterSpawn: true
    }
  }
};
```

### Generation Order (3-Tier System)

```
generateRoom(letter) {
  ├─ 1. createCollisionMap()
  │    ├─ Add border walls
  │    ├─ applyLetterTemplate(letter) ← Tier 1: Primary template
  │    │    └─ Check wallStructures.allow
  │    ├─ placeWallStructures() ← Tier 2: Secondary structures (if allowed)
  │    └─ Clear exit zones
  │
  └─ 2. generateBackgroundObjects() ← Tier 3: Organic fill
       ├─ Apply grassDensity modifier
       ├─ Check clearingZone before placing objects
       ├─ Generate cornerClusters if enabled
       └─ Respect all template constraints
```

---

## Implemented Letters

### ✅ **B - Boss Clearing** (Complete)

**Terrain Identity:**
- Open center clearing (10x10 grid cells)
- Dense corner clusters (32 total objects: 4 corners × 8 each)
- Sparse grass (20% normal)
- No random wall structures

**Gameplay Impact:**
- Boss spawns in center (visible, no hiding)
- Corner cover for player (ranged kiting)
- Open arena favors mobility

**Implementation notes:**
- `wallStructures.allow: false` → disables random structures
- `grassDensity: 0.2` → 80% grass reduction
- `clearingZone` → 10x10 center blocked via `isInClearingZone()` helper
- `cornerClusters` → generated via `generateCornerClusters()` function

### ✅ **V - Vault** (Complete)

**Terrain Identity:**
- Hollow square cage structure (7x7 grid cells) in center
- No objects near vault (11x11 clearing zone)
- Sparse grass (50% normal)
- Random wall structures allowed outside vault

**Gameplay Impact:**
- Guaranteed rare/epic item inside vault (Dragon Blade, Dragon Shotgun, etc.)
- No clear way to enter - player must find way to warp/teleport inside
- Creates puzzle element and risk/reward decision
- Enemies spawn outside vault perimeter

**Implementation notes:**
- `vaultStructure` → custom collision pattern via `placeVaultStructure()`
- Hollow square created by placing walls only on perimeter
- `guaranteedItems` → spawned via `spawnGuaranteedItems()` function
- Item pool: `['⌘', '☼', '⚔', '♦', 'K', '^', '℧']` (high-tier weapons/armor)
- Spawn weight: 0.05 (5% chance, rare)
- Zone boosts: gray (3x), red (2x)
- **Vault unlocking:** Requires vault key from K rooms - see below

### ✅ **K - Key Room** (Complete)

**Terrain Identity:**
- Heavy destructible objects (barrels, crates, rocks, metal boxes, bones)
- 50% more objects than normal rooms
- Reduced organic objects (fewer bushes/trees)
- Less grass (40% normal)

**Gameplay Impact:**
- Destructible objects have 40% chance to drop vault key ('k')
- Key spawns from non-organic objects only
- Keys are required to unlock V (Vault) rooms
- Fairly common spawn rate to support vault progression

**Implementation notes:**
- `objectBias` → 3x barrels/crates, 2x rocks/metal boxes, 0.3x organic
- `keyDrops` → 40% drop chance from eligible objects (p, #, 0, B, 8)
- Objects marked with `dropsKey: true` flag on creation
- Key spawned as Item on object destruction via `handleObjectEffect()`
- Spawn weight: 0.08 (8% chance, fairly common)
- Zone boosts: green (2x), cyan (1.5x) - more common early game

**Vault Key System:**
- Key item: '߃' (Unicode U+07C3 - NKo letter, gold color #ffaa00)
- Unlocks vault by removing bottom wall when player approaches with key
- Auto-detection: Player within 2 cells of vault bottom wall triggers unlock
- Key consumed on use (one-time unlock per key)
- Visual feedback: Wall debris particles on unlock
- `checkVaultKeyInteraction()` runs every frame in EXPLORE state
- `unlockVault()` removes collision map cells and marks vault as unlocked

---

## Proposed Letter Lexicon (For Future Implementation)

### Vowels (Common Archetypes)

| Letter | Name | Terrain Identity | Gameplay Impact |
|--------|------|------------------|-----------------|
| **A** | Arena | Open, sparse objects | Ranged combat, mobility, kiting |
| **E** | Enclosed | Wall structures, tight corridors | Melee, ambushes, close quarters |
| **I** | Irregular | Mixed objects, chaotic placement | Unpredictable tactics |
| **O** | Overgrown | Dense trees, bushes, organic clutter | Heavy cover, fire spread, ingredients |
| **U** | Underground | Mushrooms, stumps, dark/damp | Foraging, claustrophobic |

### Common Consonants (Specific Features)

| Letter | Name | Terrain Identity | Gameplay Impact |
|--------|------|------------------|-----------------|
| **G** | Grassy | Dense tall grass swaths | Ingredient farming, obscured vision, recipe signs |
| **W** | Watery | Puddles/water/lava | Slowing terrain (or damage in red zone) |
| **R** | Rocky | Heavy rock/boulder formations | Destructible cover, gemstone drops |
| **T** | Tunnel | 2-wall corridor structure | Linear combat, choke points, ambushes |
| **S** | Shrine | Contains shrine object | Safe-ish, lore/buff potential |
| **F** | Fiery | Fire hazards, burning objects | DOT damage, fire spread mechanics |

### Special/Cryptic Rooms

| Letter | Name | Terrain Identity | Gameplay Impact |
|--------|------|------------------|-----------------|
| **C** | Camp | Minimal enemies, safe zone | Rest/regroup, basic loot |
| **B** | Boss | ✅ Clearing + perimeter | High difficulty, good loot |
| **X** | Crossroads | Hidden treasure chest | Reward hunting, exploration |
| **?** | Mystery | Unknown/discovery | Rare item, unpredictable |
| **D** | Debris | Crates, barrels, destructibles | Breakable cover, loot containers |
| **M** | Muddy | Mud beds (red zone specialty) | Slowing terrain, footprints |
| **V** | Vault | Locked cage with treasure | Gated reward, puzzle element |

---

## Implementation Checklist

### ✅ Phase 1: Infrastructure (Complete)
- [x] Create `src/data/letterTemplates.js`
- [x] Import LETTER_TEMPLATES in RoomGenerator
- [x] Modify `generateRoom()` to accept `exitLetter` parameter
- [x] Store template in `this.currentLetterTemplate`
- [x] Pass letter from `main.js` to RoomGenerator

### ✅ Phase 2: Boss Room (Complete)
- [x] Template definition for B (Boss)
- [x] Wall structures toggle (`allowWallStructures` check)
- [x] Grass density modifier
- [x] Clearing zone helper (`isInClearingZone()`)
- [x] Apply clearing zone to grass generation
- [x] Apply clearing zone to organic clusters
- [x] Corner clusters generation (`generateCornerClusters()`)

### ⬜ Phase 3: Next Letters (TODO)

**Simple implementations (10-15 min each):**
- [ ] **G - Grassy**: Just bump grassDensity to 2.0, no other changes
- [ ] **R - Rocky**: Increase rock objectBias, reduce organic objects
- [ ] **W - Watery**: Increase water structure spawn rate
- [ ] **F - Fiery**: Spawn fire hazards (`!` char), increase lava in red zone

**Medium complexity (30-45 min each):**
- [ ] **A - Arena**: Sparse objects, wide spacing, no clusters
- [ ] **O - Overgrown**: Dense organic clusters, heavy grass, trees
- [ ] **D - Debris**: Crates/barrels (`#`, `p`), destructible focus

**Complex implementations (1+ hour each):**
- [ ] **T - Tunnel**: New collision pattern (2 parallel walls), corridor logic
- [x] **V - Vault**: Cage structure in center, guaranteed rare item inside, requires cage pattern ✅
- [ ] **X - Crossroads**: 4-way intersection structure, treasure spawn logic

### ⬜ Phase 4: Refinements (TODO)
- [ ] Perimeter density multiplier (2x objects in outer ring beyond corners)
- [ ] Boss center spawn positioning (`enemySpawnRule.spawnZone: 'center'`)
- [ ] Zone-specific letter biasing (green favors G/O, red favors F/M)
- [ ] Secret word patterns UI feedback ("2/4 letters toward FIRE")

---

## Example: How to Add a New Letter

### Example: **G - Grassy** (Simple)

```javascript
// In letterTemplates.js
G: {
  name: 'Grasslands',
  description: 'Dense grass fields with hidden recipe signs',

  wallStructures: {
    allow: true  // Normal wall structures OK
  },

  bgObjectRules: {
    grassDensity: 2.0,  // 2x normal grass (very dense)

    // Bias toward organic objects
    objectBias: {
      '%': 1.5,  // More bushes
      '&': 1.2,  // More trees
      '0': 0.7   // Fewer rocks
    }
  }
}
```

**Implementation needed:**
1. Add template to `letterTemplates.js`
2. Apply `objectBias` in `generateDepthBasedObjects()` (weighted selection)
3. Test in green zone

---

## Example: How to Add a Structural Template

### Example: **V - Vault** (Complex)

```javascript
// In letterTemplates.js
V: {
  name: 'Vault',
  description: 'Locked cage with rare treasure inside',

  wallStructures: {
    allow: true  // Can have structures outside cage
  },

  // NEW: Collision pattern (like WALL_STRUCTURES)
  collisionPattern: {
    type: 'hollow_square_cage',
    centerCol: 15,
    centerRow: 15,
    size: 7,  // 7x7 cage
    gaps: true  // 1-cell gaps in walls (see inside, can't enter)
  },

  bgObjectRules: {
    forbiddenZones: [
      { col: 12, row: 12, width: 7, height: 7 }  // Clear around cage
    ]
  },

  guaranteedObjects: [
    { type: 'item', char: 'rare', position: 'cage_center' }
  ]
}
```

**Implementation needed:**
1. Add cage pattern to `GameConfig.js` (new CAGE_STRUCTURES)
2. Modify `createCollisionMap()` to apply `collisionPattern`
3. Implement `guaranteedObjects` spawn logic
4. Add vault unlock mechanic (destroy walls? find key?)

---

## Design Questions to Consider

### 1. Template Flexibility
- **Strict** (always exact dimensions) or **Parameterized** (randomize width/orientation)?
- Current: Strict (Boss = always 10x10 clearing)
- Future: Could randomize clearing size (8-12 grid cells)

### 2. Zone-Specific Letter Biasing
Should zones heavily favor certain letters?
- Green zone: More **G** (Grassy), **O** (Overgrown)
- Red zone: More **F** (Fiery), **M** (Muddy), **R** (Rocky/gemstones)
- Cyan zone: More **W** (Watery/frozen), **I** (Icy)
- Yellow zone: More **A** (Arena/open for lightning)
- Gray zone: More **B** (Boss), **S** (Shrine), rare secret letters

**Implementation:** Add `zoneBoosts` to letter templates (mirror exitLetters.js)

### 3. Secret Word Patterns
With vowels common, we can spell:
- **F-I-R-E** (fire zone progression)
- **R-O-O-T** (nature/organic path)
- **V-O-I-D** (enter gray zone)
- **G-O-L-D** (treasure reward)
- **D-O-O-M** (cursed path)

**Should these:**
- Be discovered organically (no hints)?
- Be hinted through lore (NPC dialogue, shrine messages)?
- Show progress UI ("2/4 letters toward FIRE")?

---

## Technical Notes

### Helper Functions Added

**`isInClearingZone(pixelX, pixelY)`** - RoomGenerator.js:22
- Checks if pixel position is inside template's clearing zone
- Used in `generateGrassSwaths()` and `generateOrganicClusters()`
- Returns boolean

**`generateCornerClusters(room)`** - RoomGenerator.js:548
- Generates dense object clusters in 4 corners
- Uses template config: `clusterSize`, `clusterRadius`, `objectTypes`
- Respects clearing zone

### Modified Functions

**`generateGrassSwaths(room)`** - RoomGenerator.js:472
- Now checks `currentLetterTemplate.bgObjectRules.grassDensity`
- Template density overrides zone density
- Applies clearing zone check before pushing grass

**`generateOrganicClusters(room)`** - RoomGenerator.js:577
- Applies clearing zone check before pushing objects

**`createCollisionMap(roomType)`** - RoomGenerator.js:163
- Checks `currentLetterTemplate.wallStructures.allow`
- Skips `placeWallStructures()` if template forbids it

---

## Future Enhancements

### Short-term (Next Session)
1. Implement **G** (Grassy) - simplest next template
2. Implement **R** (Rocky) - test objectBias system
3. Add zone-specific letter biasing to `ExitSystem.js`

### Medium-term
4. Implement **V** (Vault) - first structural template
5. Implement **T** (Tunnel) - corridor system
6. Add perimeter density multiplier to Boss template
7. Implement boss center spawn positioning

### Long-term
8. Secret word pattern UI feedback system
9. Hint system for secret patterns (shrine messages)
10. Dynamic template parameters (randomized sizes)
11. Template combinations (e.g., Grassy + Fiery = burning fields)

---

## Testing Checklist

When implementing a new letter template:

- [ ] Template definition added to `letterTemplates.js`
- [ ] Test in green zone (baseline)
- [ ] Test in red zone (zone features should work)
- [ ] Test in cyan zone (color blending works)
- [ ] Compare with non-templated rooms (difference is visible)
- [ ] Check clearing zones work (if applicable)
- [ ] Check object bias works (if applicable)
- [ ] Verify wall structures respect template rules
- [ ] Console logs show template application
- [ ] No errors in browser console

---

## Contact Points in Code

**To modify letter selection:**
- `src/data/exitLetters.js` - weights, room types, zone boosts

**To modify room generation:**
- `src/data/letterTemplates.js` - template definitions
- `src/systems/RoomGenerator.js` - generation logic

**To modify how letters are passed:**
- `src/main.js:1451` - passes `exitObj?.letter` to RoomGenerator

**To add new structure types:**
- `src/game/GameConfig.js` - WALL_STRUCTURES, WATER_STRUCTURES

---

## Notes from Discussion

- Boss room working and looks great ✅
- Architecture supports 3 tiers: template → wall structures → organic fill
- Vowels should be common (enables secret words)
- Letters should tie to visible terrain (immediate feedback)
- Templates can be simple (just density modifiers) or complex (unique structures)
- System is extensible - easy to add new letters incrementally

**Next time: Start with simple letters (G, R, W, F) before tackling structural ones (T, V, X)**
