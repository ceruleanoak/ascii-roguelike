# ASCII Roguelike - Project Instructions

## Project Overview

Browser-based roguelike game built with vanilla JavaScript. Features:
- Procedural room generation with background objects
- Combat system with melee/ranged/magic weapons
- Crafting system with discoverable recipes
- Enemy AI with different attack patterns
- Physics-based interactions (knockback, environmental hazards)

## Game States

The game has two main gameplay states:

- **REST Mode** (`GAME_STATES.REST`): Safe hub area where the player can craft weapons and prepare. No enemies present. Combat system runs with empty enemy arrays. Items and quick slots persist between runs.

- **EXPLORE Mode** (`GAME_STATES.EXPLORE`): Procedurally generated combat rooms with enemies. Progress deeper by clearing rooms and exiting north/east/west. Return to REST by exiting south. Inventory is lost on death, but quick slots persist.

Both modes share the same combat system (`CombatSystem.update()`), physics system, and entity classes.

## Critical UI Requirements

**PRESERVE TOP MENU SINGLE LINE**: The top status bar (HP | DEPTH | INVENTORY | QUICK SLOTS) must remain a single horizontal line. Never break it into multiple rows or add vertical elements. This is a critical layout constraint.

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

## Directory Structure

```
src/
├── data/           - Game content definitions
│   ├── enemies.js  - Enemy stats, drops, spawn tables
│   ├── items.js    - Weapons, armor, consumables, ingredients
│   └── recipes.js  - Crafting recipes
├── entities/       - Game object classes
│   ├── Player.js
│   ├── Enemy.js
│   ├── Item.js
│   ├── Particle.js
│   ├── Debris.js
│   ├── Ingredient.js
│   └── BackgroundObject.js
├── systems/        - Game logic systems
│   ├── CombatSystem.js      - Damage, attacks, AI
│   ├── RoomGenerator.js     - Level generation
│   ├── PhysicsSystem.js     - Collisions, movement
│   ├── CraftingSystem.js    - Recipe matching
│   ├── CheatMenu.js         - Debug tools
│   └── PersistenceSystem.js - Save/load
├── game/           - Core game loop
│   ├── GameLoop.js
│   ├── GameStateMachine.js
│   └── GameConfig.js
├── rendering/
│   └── ASCIIRenderer.js
└── main.js         - Entry point
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
  attackType: 'melee' | 'ranged' | 'magic' | 'fire',
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

**File**: `src/systems/CombatSystem.js`

Key areas:
- `fireBullet()`: Projectile creation
- `swingMelee()`: Melee attack patterns
- `fireArrow()`: Bow mechanics
- `dealDamage()`: Damage calculation
- Status effects: `applyBurn()`, `applyFreeze()`, etc.

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

**CRITICAL**: All game characters must use printable 7-bit ASCII only (code points 0x20–0x7E).

- Never use Unicode symbols, box-drawing characters, or emoji for game object identifiers
- Never use Unicode escapes (`\uXXXX`, `\u{XXXX}`, `\U...`) for character values
- This applies to: background objects, items, enemies, particles, UI icons, and animation frames
- Valid chars: letters (A-Z, a-z), digits (0-9), and punctuation (! " # $ % & ' ( ) * + , - . / : ; < = > ? @ [ \ ] ^ _ ` { | } ~)

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

**File**: `src/systems/CombatSystem.js` → `swingMelee()`

Existing patterns:
- `arc`: Sweeping arc in front
- `thrust`: Forward stab
- `sweep`: Wide horizontal swing
- `ring`: 360° area attack
- `shockwave`: Expanding wave
- `multistab`: Multi-hit combo

Add new pattern in switch statement with angle calculations.

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
