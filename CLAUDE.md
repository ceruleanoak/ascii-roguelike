# ASCII Roguelike - Project Instructions

## Project Overview

Browser-based roguelike game built with vanilla JavaScript. Features:
- Procedural room generation with background objects
- Combat system with melee/ranged/magic weapons
- Crafting system with discoverable recipes
- Enemy AI with different attack patterns
- Physics-based interactions (knockback, environmental hazards)

## Design Philosophy (Mission Statement)

This is a **pure roguelike** — death means a full reset. The game has no traditional progression. The "save file" is mental: familiarity with recipes, zone colors, enemy behaviors, and room layouts is the reward.

**Core principles:**
- **Non-instructive UI**: The game should wire the player's brain naturally. Minimal explicit tutorials. Players should feel like they're figuring things out themselves.
- **Mental progression over mechanical progression**: Growing pattern recognition and recipe memory is the loop, not grinding for unlocks.
- **Arcade purity**: Fast, repeatable, accessible. Death is acceptable, not punishing. Reset is part of the experience.
- **Color-coded zone system**: Exit colors are meaningful and part of accumulated player knowledge. Green → Yellow → Red represents increasing danger. Each zone tracks depth independently.

**When adding features**: Ask whether the feature rewards player knowledge/familiarity or shortcuts it. Features that bypass the "figuring out" experience work against the design.

## Known Bugs

See `claudedocs/known-bugs.md` — review at the start of every session before adding new features.

## Game States

The game has two main gameplay states:

- **REST Mode** (`GAME_STATES.REST`): Safe hub area where the player can craft weapons and prepare. No enemies present. Combat system runs with empty enemy arrays. Items and quick slots persist between runs.

- **EXPLORE Mode** (`GAME_STATES.EXPLORE`): Procedurally generated combat rooms with enemies. Progress deeper by clearing rooms and exiting north/east/west. Return to REST by exiting south. Inventory is lost on death, but quick slots persist.

Both modes share the same combat system (`CombatSystem.update()`), physics system, and entity classes.

## Critical UI Requirements

**PRESERVE TOP MENU SINGLE LINE**: The top status bar (HP | DEPTH | INVENTORY | QUICK SLOTS) must remain a single horizontal line. Never break it into multiple rows or add vertical elements. This is a critical layout constraint.

## Font Usage Rules

Two fonts are in use. Do not mix them outside their designated roles:

- **VentureArcade** (`font-family: 'VentureArcade', monospace`): Prominent UI labels and player instructions only — e.g. `HP:`, `L`, `Q`, `E`, `A:`, `C:`, `I:` in the top bar; "GAME OVER" / "Press SPACE to continue"; zone exit letters on the canvas. **VentureArcade has limited glyph coverage — it does not reliably support all ASCII or Unicode characters.** Never use it for item/enemy characters or equippable slots.

- **Unifont** (`font-family: 'Unifont', monospace`): Everything else — weapon/armor/consumable chars, subscript slot placeholders, all canvas entity rendering, any fallback text. Unifont has complete Unicode coverage and is the safe default.

## Critical Technical Constraints

**NO localStorage**: This game does NOT use localStorage for any persistence. All game state resets on page refresh and on death. This is intentional for a true roguelike experience.

- **NEVER implement save/load features** using localStorage, sessionStorage, or IndexedDB
- **PersistenceSystem.js exists but is disabled** - the `saveGameState()` and `loadGame()` functions are no-ops
- All state must be ephemeral and reset on page refresh
- Character unlocks, crafting recipes, and inventory do NOT persist between sessions
- If asked to add persistence, explain this design decision and suggest alternatives (e.g., unlockables within a single session)

**Why this constraint exists**: The game had localStorage persistence that caused bugs with NPCs and captives persisting across sessions. To prevent these issues and maintain true roguelike design, all persistence has been permanently disabled.

## Architectural Maturity & Senior Developer Guidance

This project has reached architectural maturity with well-established patterns, systems, and abstractions. When receiving feature requests:

**Evaluate Complexity vs. Scalability**
- If a requested change seems **laborious or repetitive**, it may signal an opportunity for a **more scalable approach**
- Don't immediately implement tedious solutions—pause and consider architectural alternatives

**Senior Game Programmer Persona**
When you identify a more elegant solution, adopt a senior game programmer voice:
- **Ask clarifying questions**: "I notice this would require touching 15+ weapon definitions. Would you prefer a system-level approach instead?"
- **Suggest alternatives**: "Instead of manually adding X to every enemy, we could create a behavior system that..."
- **Present trade-offs**: "Quick approach: 10 minutes, manual edits. Scalable approach: 20 minutes, future-proof."
- **Gauge user intent**: "Are you looking for a quick prototype or a production-ready system?"

**When to Intervene**
- Manual edits to >10 items/enemies/objects
- Repetitive code patterns emerging
- Feature requires touching multiple unrelated systems
- Request would break existing abstractions
- Solution creates technical debt

**Example Scenarios**
- User: "Add status effect resistance to all 30 enemies"
  - ❌ Don't: Silently edit 30 enemy definitions
  - ✅ Do: "I could add a resistance field to each enemy, but would you prefer a system where enemies inherit resistances based on their element/type? That would scale better for future additions."

- User: "Make fire weapons deal bonus damage to ice enemies"
  - ❌ Don't: Hard-code element checks in damage calculation
  - ✅ Do: "Should I implement a general elemental weakness system that would work for all element pairs, or just fire vs. ice?"

**Collaborative Development**
Frame suggestions as **professional collaboration**, not gatekeeping:
- "As your game programmer, I want to make sure this scales well..."
- "I see two paths forward. Let me explain the trade-offs..."
- "Quick question before I proceed—what's your priority: speed or maintainability?"

This approach respects your time while ensuring the codebase remains clean, scalable, and maintainable as the game grows.

## Rendering Architecture

The game uses a **3-tier rendering architecture** for clean separation of concerns:

```
Game (main.js)
  ├─ Game logic (update, input, state management)
  └─ render(alpha) → dispatcher (12 lines in Game class)
       ↓
RenderController (orchestrator)
  ├─ Manages backgroundDirty optimization
  ├─ Routes to state-specific renderers
  └─ Coordinates UI components
       ↓
StateRenderers + UIComponents
  ├─ TitleRenderer, RestRenderer, ExploreRenderer, GameOverRenderer
  ├─ BowChargeIndicator, ArrowKeyIndicators, CraftingStation
  ├─ EquipmentSlots, InventoryOverlay, MenuOverlay
  └─ All use ASCIIRenderer primitives
```

### Design Principles

1. **Read-Only Views**: Renderers receive the entire `game` instance but only read state, never modify it
2. **Dirty Flag Optimization**: `renderer.backgroundDirty` flag prevents unnecessary background redraws
3. **Composition**: UI components are standalone, reusable across multiple states
4. **Layered Rendering**: Strict z-ordering maintained (background → foreground → UI overlays)

### Modifying Rendering

**To modify state-specific rendering:**
- Title screen: `src/rendering/state/TitleRenderer.js`
- REST hub: `src/rendering/state/RestRenderer.js`
- Combat rooms: `src/rendering/state/ExploreRenderer.js`
- Game over: `src/rendering/state/GameOverRenderer.js`

**To modify UI components:**
- Bow charge bar: `src/rendering/ui/BowChargeIndicator.js`
- Dodge controls: `src/rendering/ui/ArrowKeyIndicators.js`
- Crafting slots: `src/rendering/ui/CraftingStation.js`
- Equipment slots: `src/rendering/ui/EquipmentSlots.js`
- Inventory overlay: `src/rendering/ui/InventoryOverlay.js`
- Selection menus: `src/rendering/ui/MenuOverlay.js`

**Key files:**
- Canvas primitives: `src/rendering/ASCIIRenderer.js` (drawCell, drawEntity, drawRect, etc.)
- Orchestration: `src/rendering/RenderController.js` (routing & dirty flag management)
- Main dispatcher: `src/main.js` render() method (lines ~3685-3700)

**Important**: When adding new rendering logic, place it in the appropriate renderer file, NOT in main.js. The Game class should only contain game logic and state management.

## Directory Structure

```
src/
├── data/           - Game content definitions
│   ├── characters.js   - Character roster definitions
│   ├── enemies.js      - Enemy stats, drops, spawn tables
│   ├── exitLetters.js  - Exit letter mappings for zones
│   ├── items.js        - Weapons, armor, consumables, ingredients
│   ├── recipes.js      - Crafting recipes
│   └── zones.js        - Zone definitions and progression
├── entities/       - Game object classes
│   ├── BackgroundObject.js
│   ├── Captive.js
│   ├── Debris.js
│   ├── Enemy.js
│   ├── Ingredient.js
│   ├── Item.js
│   ├── Particle.js
│   └── Player.js
├── systems/        - Game logic systems
│   ├── CharacterSystem.js   - Character type abilities and NPC swaps
│   ├── CheatMenu.js         - Debug tools
│   ├── CombatSystem.js      - Damage calculations, projectiles
│   ├── CraftingSystem.js    - Recipe matching
│   ├── ExitSystem.js        - Exit handling and zone transitions
│   ├── InteractionSystem.js - Background object and captive interactions
│   ├── InventorySystem.js   - Inventory, equipment, consumable auto-trigger
│   ├── LootSystem.js        - Item/ingredient drop spawning
│   ├── MenuSystem.js        - Menu open/close/select, UI updates, pickup messages
│   ├── PersistenceSystem.js - Save/load (disabled)
│   ├── PhysicsSystem.js     - Collisions, movement
│   ├── RoomGenerator.js     - Level generation
│   ├── TrapSystem.js        - Trap placement and persistent trap updates
│   └── ZoneSystem.js        - Zone management
├── game/           - Core game loop
│   ├── GameConfig.js
│   ├── GameLoop.js
│   └── GameStateMachine.js
├── rendering/      - Rendering architecture (3-tier design)
│   ├── ASCIIRenderer.js     - Low-level canvas primitives
│   ├── RenderController.js  - Orchestrator & state dispatcher
│   ├── state/               - State-specific renderers
│   │   ├── TitleRenderer.js     - Animated title screen
│   │   ├── RestRenderer.js      - REST hub renderer
│   │   ├── ExploreRenderer.js   - Combat room renderer
│   │   └── GameOverRenderer.js  - Game over screen
│   └── ui/                  - Reusable UI components
│       ├── BowChargeIndicator.js   - Bow charge bar
│       ├── ArrowKeyIndicators.js   - Dodge roll controls
│       ├── CraftingStation.js      - Crafting slots
│       ├── EquipmentSlots.js       - Armor/consumables
│       ├── InventoryOverlay.js     - Inventory display
│       └── MenuOverlay.js          - Selection menus
└── main.js         - Entry point & Game class (~4000 lines)
```

## Common Tasks Quick Reference

### Adding New Weapons

**File**: `src/data/items.js`

Add to the `ITEMS` object:
```javascript
'char': {
  char: 'char',
  name: 'Weapon Name',
  type: ITEM_TYPES.WEAPON,
  weaponType: WEAPON_TYPES.GUN | MELEE | BOW,
  damage: 3,
  cooldown: 0.5,  // For ranged weapons
  // For melee:
  windup: 0.3,
  recovery: 0.15,
  attackPattern: 'arc' | 'thrust' | 'sweep' | 'ring',
  range: 20,
  // Special effects:
  onHit: 'burn' | 'freeze' | 'poison' | 'stun',
  color: '#rrggbb'
}
```

**Weapon Types**:
- `GUN`: Projectile weapons with cooldown
- `MELEE`: Close-range with windup/recovery
- `BOW`: Arrows with gravity

### Adding New Enemies

**File**: `src/data/enemies.js`

Add to the `ENEMIES` object:
```javascript
'char': {
  char: 'char',
  name: 'Enemy Name',
  hp: 5,
  speed: 40,
  damage: 2,
  attackRange: GRID.CELL_SIZE * 5,
  aggroRange: GRID.CELL_SIZE * 10,
  attackCooldown: 1.5,
  attackWindup: 0.4,
  attackType: 'melee' | 'ranged' | 'magic' | 'fire' | 'sap',
  sapDamageInterval: 1.0,  // For 'sap' type only - damage tick rate
  decisionInterval: 0.5,  // Lower = smarter
  color: '#rrggbb',
  drops: [
    { char: 'ingredient_char', chance: 0.7 }
  ]
}
```

**Then update spawn tables** in `SPAWN_TABLES` by depth range.

### Adding New Recipes

**File**: `src/data/recipes.js`

Add to the `RECIPES` array:
```javascript
{
  left: 'item1_char',
  right: 'item2_char',
  result: 'result_char',
  name: 'Result Name'
}
```

Recipes are bidirectional (order doesn't matter).

### Adding Environmental Objects

**File**: `src/entities/BackgroundObject.js`

Add to `BACKGROUND_TYPES`:
```javascript
'char': {
  char: 'char',
  name: 'Object Name',
  solid: true | false,
  health: 3,  // If destructible
  // Behavior flags:
  burning: false,
  frozen: false,
  slowing: false,
  damaging: false,
  // Visual:
  color: '#rrggbb'
}
```

### Modifying Combat Mechanics

**Projectiles & Damage**: `src/systems/CombatSystem.js`
- `update()`: Main combat loop - projectiles, melee hits, DOT damage
- `createAttack()` / `addAttack()`: Add player attacks to combat system
- `createEnemyAttack()`: Add enemy attacks to combat system
- `createExplosion()`: Area-of-effect damage
- `createChainLightning()`: Chain lightning effect

**Attack Creation**: `src/entities/Item.js`
- `createMeleeAttack()`: Router for melee patterns (line 405)
- `createBullet()`: Gun projectile creation (line 165)
- `createArrow()`: Bow arrow creation with charge (line 729)
- Individual pattern methods: `createMeleeArc()`, `createMeleeSweep()`, etc.

**Status Effects**: `src/entities/Enemy.js`
- `applyStatusEffect()`: Apply burn, freeze, poison, stun, etc.
- `updateStatusEffects()`: Tick down effect durations and apply DOT
- `getElementalModifier()`: Check resistances and weaknesses

### Adjusting Physics

**File**: `src/systems/PhysicsSystem.js`

- Collision detection: `checkCollisions()`
- Movement: `updatePosition()`
- Environmental hazards: Check `BackgroundObject` interactions

### Room Generation

**File**: `src/systems/RoomGenerator.js`

- `generateRoom()`: Main room layout
- `placeBackgroundObjects()`: Object distribution
- `spawnEnemies()`: Enemy placement logic

## Character Encoding Rule

**CRITICAL**: Where possible, game characters should use printable 7-bit ASCII  (code points 0x20–0x7E).

- Due to the limitations of ASCII, Unicode symbols are allowed to avoid conflict with existing character use and for clarity, especially if proffered by the user, but emoji and character box should be avoided
- Never use Unicode escapes (`\uXXXX`, `\u{XXXX}`, `\U...`) for character values
- This applies to: background objects, items, enemies, particles, UI icons, and animation frames

### Background Object Char Map

| Char | Object     |
|------|------------|
| `%`  | Bush       |
| `&`  | Tree       |
| `0`  | Rock       |
| `=`  | Water      |
| `#`  | Crate      |
| `+`  | Brambles   |
| `Y`  | Stump      |
| `n`  | Mushroom   |
| `*`  | Crystal    |
| `B`  | Metal Box  |
| `Q`  | Boulder    |
| `~`  | Puddle     |
| `i`  | Ice        |
| `!`  | Fire       |
| `$`  | Shrine     |
| `p`  | Barrel     |
| `8`  | Bones      |

## Development Patterns

### Adding Status Effects

1. Define effect in `CombatSystem.js`:
   - Add `applyEffectName()` method
   - Add effect duration tracking
   - Update `update()` to tick effects

2. Add visual feedback in `Particle.js` or `Enemy.js`

3. Reference in weapon/item `onHit` property

### Creating Attack Patterns

**Pattern Implementation**: `src/entities/Item.js` → `createMeleeAttack()` (line 405)

Existing patterns:
- `arc`: 3-hit sweeping arc (swords) - line 501
- `sweep`: 5-position horizontal sweep (axes) - line 538
- `thrust`: Linear forward thrust (spears) - line 610
- `ring`: Sequential circular sweep (flails) - line 465
- `shockwave`: Expanding concentric rings (hammers) - line 572
- `multistab`: Rapid stabs in same spot (daggers) - line 641
- `whipcrack`: Long linear crack (whips) - line 673
- `slam`: Single massive strike with large hitbox - line 705

**To add a new pattern:**
1. Add method `createMeleeYourPattern(player)` in `Item.js`
2. Return attack object(s) with position, damage, delay, duration
3. Add case to switch statement in `createMeleeAttack()` (line 421)
4. Reference pattern name in weapon definition's `attackPattern` property

## Testing

Run dev server: `npm run dev`
Build: `npm run build`

Use CheatMenu (press `C` in-game) for:
- Item spawning
- Enemy spawning
- Depth manipulation
- God mode

## Quick File Jumps

Content expansion:
- **Weapons**: `src/data/items.js:20-570`
- **Enemies**: `src/data/enemies.js:5-192`
- **Recipes**: `src/data/recipes.js:4-107`
- **Ingredients**: `src/data/items.js:898-921`
- **Background Objects**: `src/entities/BackgroundObject.js`

Systems:
- **Combat Logic**: `src/systems/CombatSystem.js`
- **Level Gen**: `src/systems/RoomGenerator.js`
- **Physics**: `src/systems/PhysicsSystem.js`

Entity Classes:
- **Player**: `src/entities/Player.js`
- **Enemy AI**: `src/entities/Enemy.js`
- **Items**: `src/entities/Item.js`

## main.js — Orchestration Rules

`src/main.js` is the **entry point and orchestrator only**. It must not house system or entity logic.

### What belongs in main.js
- `constructor()` — system wiring only
- `setupInput()` / `setupStateMachine()` — thin configuration
- `update(dt)` and `render(alpha)` — dispatch to systems, no logic
- `enterXxxState()` / `updateXxxState()` — state machine transitions only
- Shared entity array declarations

### What does NOT belong in main.js

| Category | Correct Location |
|----------|-----------------|
| Item/loot spawning | `LootSystem.js` |
| Trap placement/update | `TrapSystem.js` |
| Object interactions | `InteractionSystem.js` |
| Character type abilities | `CharacterSystem.js` |
| Menu open/close/select | `MenuSystem.js` |
| Consumable effects | `InventorySystem.js` |
| Room spawn helpers | `RoomGenerator.js` |
| Player geometry helpers | `Player.js` |
| Zone depth tracking | `ZoneSystem.js` |

### Rule of Thumb
If a method touches only one system or entity's data → it belongs in that system/entity file.
If a method coordinates two or more systems → it may belong in main.js *only* if it can't go in either system.

### Adding New Systems
When creating a new system:
1. Create `src/systems/NewSystem.js` with a class that takes `game` as constructor arg
2. Instantiate in `Game.constructor()`: `this.newSystem = new NewSystem(this)`
3. Call `update(dt)` in the appropriate `updateXxxState()` method
4. Never add the implementation directly to main.js
