# Glossary — Ubiquitous Language

> One term, one meaning, used everywhere: design notes, code, UI, commits.
> AI assistants must use these exact terms (see CLAUDE.md). New concept → propose a term,
> don't invent silently. No synonyms, no generic substitutes.

This is a **seed**, not a finished dictionary. It codifies vocabulary already established in
the codebase. Grow it deliberately — when a genuinely new concept appears, *you* name it and
add the entry. Keep it lean: define the concepts that carry the game's identity, not standard
programming terms.

## Domain concepts

### Zone
- **Definition:** A color-coded region of the world with its own identity, danger level, and
  independently tracked Depth. Green → Yellow → Red = increasing danger; Cyan, Gray, and Blue
  are the off-axis / secret zones.
- **In code:** keyed by color string — `'green'`, `'yellow'`, `'red'`, `'cyan'`, `'gray'`,
  `'blue'`. Definitions in `src/data/zones.js`; logic in `ZoneSystem`. Each has a flavor name
  (Verdant Wilds, Scorched Wastes, Frozen Peaks, Stormlands, Realm of the Dead, Tidefall).
- **Not:** "level", "world", "area", "biome", "stage".

### Depth
- **Definition:** How deep the player has descended within a Zone. Tracked **per Zone**,
  independently. N/E/W exits go deeper; S returns toward REST.
- **In code:** `ZoneSystem` depth tracking; `bossDepth` is the per-Zone boss threshold.
- **Not:** "floor" (reserved — see Floor), "level", "stage".

### Game State
- **Definition:** The top-level mode the game is in. The three play modes are **REST** (safe
  hub: crafting, prep, no enemies), **EXPLORE** (procedural combat rooms), and **NEUTRAL**
  (non-combat rooms: fishing, errands, NPCs). Plus `TITLE`, `COMBAT`, `GAME_OVER`,
  `ARCADE_DEMO`.
- **In code:** `GAME_STATES` enum in `GameConfig.js`; values are the SCREAMING strings
  (`'EXPLORE'`). State-specific rendering lives in `src/rendering/state/`.
- **Not:** "screen", "scene", "mode" (as a code identifier).

### Floor
- **Definition:** The canonical interior the player currently occupies (hut, dungeon, or
  maze interior). Carries `type` + `viewport` metadata.
- **In code:** `game.activeFloor` (renamed from the older `hutInterior`).
- **Not:** "interior slot" as a variable, "level", or Depth.

### Interior
- **Definition:** A self-contained sub-space entered from the surface — Hut, Dungeon, or Maze.
  Each follows the shared Interior System Pattern (`generateXxxInterior` / door entry /
  PiP overlay).
- **In code:** `HutSystem`, `DungeonSystem`, `MazeSystem`; `player.inHut` / `inDungeon` /
  `inMaze`; overlays in `src/rendering/ui/XxxInteriorOverlay.js`.
- **Not:** "room" (an Interior contains its own space; a Room is the surface unit).

### Plane
- **Definition:** Which interaction layer an entity lives on — surface (0) vs. interior (1).
  The single predicate that decides combat, vision, pickup, and collision eligibility.
- **In code:** `PlaneSystem`; route new combat/vision/pickup/collision checks through it.
- **Not:** ad-hoc `inHut || inMaze || inDungeon` guards scattered per-frame (the layer-leak
  anti-pattern — bug #107).

### Room
- **Definition:** One procedurally generated surface space in EXPLORE/NEUTRAL. Has a type
  from the room-type registry.
- **In code:** `ROOM_TYPES` in `GameConfig.js`; `RoomGenerator`; `game.currentRoom`. Combat
  spawns route through `game.activeRoom` / `_activeBackgroundObjects()`, never raw
  `currentRoom.backgroundObjects`.
- **Not:** "Interior", "Floor", "Zone".

### Enemy
- **Definition:** Any autonomous hostile actor. Behaviors are composed, not subclassed.
- **In code:** `Enemy` base in `src/entities/`; data in `src/data/enemies.js`.
- **Not:** "foe", "hostile", "mob", "monster", "NPC" (an NPC is non-hostile and distinct).

### Mechanic
- **Definition:** A composable enemy behavior added by data, not by branching in `Enemy.js`.
  New enemy behaviors are authored as Mechanics.
- **In code:** files in `src/entities/enemyMechanics/` (e.g. `ChargeMechanic`,
  `PackBehaviorMechanic`); selected via enemy `data`.
- **Not:** a `switch` on enemy type inside `Enemy.js`; a one-off meta-state.

### Ingredient
- **Definition:** A raw drop from enemies/environment. Never crafted.
- **In code:** rendered as a **letter** (`a–z`, `A–Z`) or **digit** (`0–9`).
- **Not:** a Crafted item; never a Unicode symbol.

### Crafted item
- **Definition:** A recipe output — weapon, armor, or consumable.
- **In code:** rendered as a **Unicode symbol** (non-letter, non-digit, no emoji, no pure
  box-drawing, literal glyphs only). Recipes in `src/data/recipes.js`.
- **Not:** an Ingredient; never a letter/digit char.

### Quick slot
- **Definition:** A persistent equipped-item slot shown in the top status bar. Persists across
  REST.
- **In code:** the QUICK SLOTS segment of the single-line status bar.
- **Not:** "hotbar", "inventory slot" (Inventory is the full bag, lost on death in EXPLORE).

### Double-seconds
- **Definition:** The timing unit for weapon data. Held items tick at `WEAPON_TIMER_RATE`
  (= 2), so a weapon's effective cooldown/windup/reload in real seconds is its data value ÷ 2.
- **In code:** `PHYSICS.WEAPON_TIMER_RATE`; the playtesting simulator reads raw values (÷2 to
  compare to real-game TTK).
- **Not:** real seconds. Don't strip the multiplier without halving all timing data in the
  same pass.

### Power of Three
- **Definition:** The top cosmology layer — the design lens of experience/instinct/convention,
  the three Zones / three endings / three pillars, plus the hidden canon. The decision filter
  for all new content.
- **In code:** not a runtime construct; lives in `claudedocs/zone-cosmology.md`.
- **Not:** surfaced in-world text (the hidden canon is never spoken in-game).

## Conventions

- **Casing:** types/classes PascalCase; functions/variables camelCase; constants
  SCREAMING_SNAKE; Game State and Zone string values as defined in `GameConfig.js` /
  `zones.js`.
- Domain terms win over technical defaults. A thing that manages X gets a domain name, not
  `XManager` / `XHandler` / `XHelper`.
- Avoid generic placeholders for concepts that have a term here: `data`, `info`, `process()`,
  `Manager`, `Handler`, `Util`.
