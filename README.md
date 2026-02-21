# ASCII Roguelike

An infinite ASCII roguelike with real-time combat, crafting, and risk/reward progression.

## Features

- **Dual-phase gameplay**: REST (crafting) and EXPLORE (combat) phases
- **Real-time arcade combat**: Smooth pixel-based movement, not grid-snapping
- **Discovery-based crafting**: 20+ hidden recipes to discover
- **Ingredient attraction physics**: Loot flies toward you when close
- **Risk/reward banking**: Push deeper for better loot or retreat to keep it safe
- **Procedural rooms**: Combat, Boss, Discovery, and Camp rooms
- **10+ enemy types** with scaling difficulty
- **15+ weapons and items** with unique behaviors

## Controls

### Movement
- **W/A/S/D** - Move player (smooth acceleration)

### REST Phase Actions
- **Spacebar** - Interact with highlighted crafting slot:
  - Empty slot with ingredients → Open ingredient menu
  - Filled slot → Remove ingredient
  - Center slot → Claim crafted item
- **Arrow Up/Down** - Navigate ingredient menu
- **Enter** - Select ingredient from menu
- **Escape** - Close menu

### EXPLORE Phase Actions
- **Spacebar** - Use held weapon / Pick up nearby item
- **Shift** - Drop held item

### Navigation
- **REST Phase**: Walk North (W) to enter EXPLORE phase
- **EXPLORE Phase**: Walk South (S) to bank loot and return to REST

## Gameplay Loop

### REST Phase
- Safe crafting area with 3-cell crafting station
- Place ingredients in left/right slots to discover recipes
- Crafted items appear in center slot when recipe is valid
- Slots persist across runs and deaths (your safe storage)
- Exit North to explore dungeons

### EXPLORE Phase
- Procedurally generated rooms with enemies
- Real-time combat - shoot or slash enemies
- Enemies drop ingredients when defeated
- Ingredients fly toward you when you get close (auto-pickup)
- Items must be picked up manually with spacebar
- Clear all enemies to unlock North/East/West exits
- Push deeper North for harder enemies and better loot
- Return South to bank your loot safely

### Banking & Death
- **Banking (South exit)**: Keep all loot, return to REST, reset depth
- **Death**: Lose inventory BUT crafting slots are safe
- No meta-progression - pure skill and knowledge-based

## Starting Guide

1. **Start in REST phase** - You begin with 4 starter ingredients
2. **Test crafting**:
   - Walk up (W) to the crafting station
   - Stand next to left slot (it will highlight green)
   - Press Spacebar to open ingredient menu
   - Select "Stick" with arrows, press Enter
   - Move to right slot, press Spacebar
   - Select "String", press Enter
   - **Bow appears in center slot!**
   - Move to center, press Spacebar to claim it
3. **Enter EXPLORE**: Walk North (W) to exit and enter first dungeon
4. **Fight & Collect**:
   - Use Spacebar to shoot your Bow
   - Kill enemies, collect ingredients (they fly to you!)
   - Find more weapons like Gun (/) or Sword (†)
5. **Bank or Push**: Walk South to return safely, or North to go deeper
6. **Discover recipes**: Try all ingredient combinations!
   - All recipes are hidden - experimentation is key
7. **Death = Reset**: Die and you lose inventory, but crafting slots are safe storage

## Sample Recipes (Spoilers!)

- Gun (/) + Metal (M) → Shotgun (⌂)
- Sword (†) + Fire Essence (F) → Flame Sword (‡)
- Stick (|) + String (~) → Bow ())
- Gun (/) + Gun (/) → Dual Pistols (X)
- Fire Essence (F) + Goo (g) → Bomb (@)

## Enemy Types

- **Rat (r)** - Fast, weak, drops Fur/Teeth
- **Slime (o)** - Slow, drops Goo
- **Bat (^)** - Very fast, drops Wings
- **Goblin (G)** - Medium, drops Coins/Dagger
- **Skeleton (S)** - Tough, drops Bones/Sword
- **Ogre (O)** - Strong and slow, drops Meat/Metal
- **Dragon (D)** - Boss enemy, drops Scales/Fire Essence

## Development

```bash
npm install
npm run dev
```

Open http://localhost:3000/

## Architecture

- **Vite** - Build tool (following Hanafuda project patterns)
- **Vanilla JavaScript** - No game engine, pure ES6 modules
- **Dual-layer rendering**: Grid-based background + pixel-positioned entities
- **Fixed timestep physics**: 60 FPS with delta time
- **LocalStorage persistence**: Crafting slots survive death

## File Structure

```
ascii-roguelike/
├── src/
│   ├── game/          # Core game loop and state machine
│   ├── systems/       # Physics, crafting, combat, rooms
│   ├── entities/      # Player, enemies, items, ingredients
│   ├── rendering/     # Dual-layer canvas rendering
│   └── data/          # Recipes, items, enemies
├── assets/            # CSS styles
└── index.html         # Entry point
```

## Design Inspirations

- **Visual**: DOS/CLI ASCII aesthetic (like Dwarf Fortress)
- **Gameplay**: Shattered Pixel Dungeon (roguelike patterns)
- **Twist**: Real-time arcade combat + crafting loop

## Tips

1. Experiment with all ingredient combinations
2. Boss rooms (when implemented) give best loot
3. Camp rooms are safe zones - no enemies
4. Discovery rooms guarantee rare items
5. Don't get greedy - bank your loot before pushing too deep!
6. Death loses everything EXCEPT crafting slots
7. Leave valuable items in crafting slots as safe storage
