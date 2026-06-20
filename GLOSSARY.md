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

### NPC
- **Definition:** A non-hostile character that inhabits NEUTRAL rooms and interacts with the
  player through dialogue or errands. Each NPC has a unique archetype and role.
- **In code:** base class `NeutralCharacter` in `src/entities/NeutralCharacter.js`; subclasses
  include `Leshy`, `Rusalka`, `Witch`, `Fisherman`, `WiseFellow`, `Fairy`, and others. Defined
  in `src/data/neutralRooms.js`; spawned via `NeutralRoomSystem`.
- **Not:** an Enemy (NPCs are non-hostile); not a Companion (NPCs don't follow the player).

### Boss
- **Definition:** An Enemy that appears at a zone-specific depth threshold and must be defeated
  to progress deeper. Bosses have enhanced drops (guaranteed Mana) and special behavior.
- **In code:** `enemy.data.isBoss` flag; checked via `ZoneSystem.isBossReady(zone, depth)`;
  room type `BOSS_ROOM` generated when conditions are met. Boss-spawned enemies carry
  `isBossEntity` flag.
- **Not:** just a difficult Enemy; a Boss is a gated milestone tied to zone depth.

### Status Effect
- **Definition:** A temporary condition applied to a character (player or enemy) that modifies
  behavior, movement, or damage. Effects have a duration and wear off over time.
- **In code:** `Character.applyStatusEffect(name, duration)` in `src/entities/` (Player,
  Enemy). Active effects tracked in `statusEffects` object. Examples: `'burn'`, `'poison'`,
  `'freeze'`, `'stun'`, `'dizzy'`, `'goo'`.
- **Not:** permanent attributes (like health or stats); a temporary modifier only.

### Companion
- **Definition:** A persistent non-player character that follows the player across rooms and
  states. Companions offer passive support and interact with the environment.
- **In code:** managed by `CompanionSystem`; currently crows (`companionCrows`, `followerCrows`);
  also tamed rats (`tamedRats`, fed via bread consumable). State lives on `game`; logic in
  `src/systems/CompanionSystem.js`.
- **Not:** an Enemy; not an NPC (Companions don't initiate dialogue).

### Spell
- **Definition:** A magical effect cast by the player through word input. Spells are discovered
  through gameplay and can be cancelled mid-cast.
- **In code:** `SPELLS` registry in `src/data/spells.js`; cast via `SpellSystem` which reads
  the player's typed word input. Known spells tracked in `game.knownSpells` Set. Entry/effect
  logic defined per spell in the registry.
- **Not:** a Crafted item; never equipped. A transient magical action, not an inventory object.

### Consumable
- **Definition:** A single-use Crafted item that can be equipped in a consumable slot or used
  directly, applying an instant or temporary effect to the player.
- **In code:** `type: ITEM_TYPES.CONSUMABLE` in `src/data/items.js`; subtypes include roles
  (heal, buff, movement, defensive, throwable, utility, oil). Used via `InventorySystem`;
  removed from inventory on consumption.
- **Not:** an Ingredient (raw drop) or an equipped weapon/armor. Consumables are crafted via
  recipes.

### Key Item
- **Definition:** A unique, run-scoped item that unlocks progression and enables access to
  new areas or mechanics. Persists across death within a single run.
- **In code:** tracked via flags on `game` (e.g. `swordDrawnThisRun`, `spectaclesTakenThisRun`);
  managed by `KeyItemSystem`. Visual representation: § (sword, green zone) and ⊙ (spectacles,
  yellow zone). Checked via condition gates in room generation.
- **Not:** a regular Ingredient or Crafted item; not persistent across runs.

### Loot Table
- **Definition:** A zone/enemy-specific definition of what Ingredients drop on enemy defeat and
  at what frequency.
- **In code:** `ZONE_SPAWN_TABLES` per zone in `src/data/enemies.js`; individual enemy data
  references spawn tables. Populated by weighted drop chance (`dropChance` property) and item
  ID. Used by `LootSystem` on death.
- **Not:** inventory (player's bag). Loot is what enemies distribute; Inventory is what the
  player carries.

### Death / Permadeath
- **Definition:** The core roguelike reset mechanic — when the player dies, all Inventory,
  Quick slots (except crafting knowledge), and position are lost. Only run-scoped Key Items
  and mental knowledge (recipes, zone layout) persist.
- **In code:** death triggers `enterGameOverState()` → full game reset via `createNewGame()`;
  `PersistenceSystem` is permanently disabled to enforce full reset. Design philosophy in
  `claudedocs/zone-cosmology.md`.
- **Not:** soft-lock or save-scumming. Death is final and intentional; mental progression is
  the reward, not inventory accumulation.

### Room Type
- **Definition:** The category of surface room (EXPLORE or NEUTRAL) that determines its
  procedural layout, enemy spawn, and mechanics.
- **In code:** `ROOM_TYPES` enum in `src/GameConfig.js` (COMBAT, BOSS, DISCOVERY, CAMP,
  TUNNEL, ASCENT, UNDERGROUND, BAT_BELFRY, RIDGE, WELL, FOUNTAIN, PUZZLE, etc.). Generated
  by `RoomGenerator` based on zone/depth/special conditions.
- **Not:** Interior (which are Hut, Dungeon, Maze) or game State.

### Background Object
- **Definition:** A non-entity environmental object that occupies a room tile, can be destroyed
  (by fire, water, impact), and may have interactive effects or drop items.
- **In code:** class `BackgroundObject` in `src/entities/BackgroundObject.js`; data and
  properties in `src/data/backgroundObjects.js`. Properties include flammability,
  conductivity, interaction type, drop chance/table. Managed by collision and elemental
  systems (FireSystem, ElectricitySystem, WorldEffectsSystem).
- **Not:** an Enemy or Ingredient. Objects are static/semi-static environmental features, not
  autonomous or droppable initially.

### Weapon Timing
- **Definition:** The multi-phase cycle of a melee/ranged weapon attack: Windup (startup delay
  before damage), Recovery (cooldown after impact), and optional Reload/Charge phases for
  certain weapon types. All values are in Double-seconds.
- **In code:** weapon data fields: `windup`, `recovery`, `reload`, `charge` in `src/data/items.js`.
  Weapon ticks at `PHYSICS.WEAPON_TIMER_RATE` (= 2). Compare to playtesting simulator by ÷2.
- **Not:** just damage or accuracy. Timing defines weapon feel and combat rhythm.

### Gemstone
- **Definition:** A special Ingredient that crafts with a base weapon to produce a gem-infused
  Crafted item with enhanced effects (Gem Staves, Gem Whips, etc.).
- **In code:** Gems (Sapphire, Ruby, Topaz, Onyx, Emerald, Garnet, Force Wand) defined in
  `src/data/items.js` as Ingredients; recipes in `src/data/recipes.js` combine gem + base
  weapon.
- **Not:** a regular Ingredient or Crafted item; a special upgrade path for weapons.

### Errand
- **Definition:** An NPC-initiated task that the player can accept and complete (e.g., fetch
  an item, defeat an enemy type). Completion may unlock new zones or grant rewards.
- **In code:** managed by `ErrandSystem`; NPC data includes errand definitions; state tracked
  on `game.activeErrand`. NPCs spawn errand offer messages in NEUTRAL rooms.
- **Not:** a dialogue choice (errands are transactional); not automatic (player must accept).

### Fishing
- **Definition:** An alternative gameplay mode where the player casts a line (Bobber) into
  water, catches fish, and may encounter special NPCs (Rusalka).
- **In code:** triggered in NEUTRAL rooms with water; `FishingSystem` handles Bobber physics
  and catch mechanics. Uses `fishingSpots` data per zone.
- **Not:** combat. Fishing is a non-violent, skill-based mini-game.

### Polymorph
- **Definition:** A special mechanic that temporarily transforms the player or enemies into a
  different form with altered stats, movement, and abilities.
- **In code:** `PolymorphSystem` in `src/systems/PolymorphSystem.js`; transformation state
  tracked on entity. Can be applied by spells or consumables.
- **Not:** a permanent stat change. Polymorph effects wear off or are explicitly reversed.

### Warp
- **Definition:** A mechanic that teleports the player or enemies to a different location
  (room, zone, or special area) instantly, bypassing normal movement.
- **In code:** `WarpSystem` in `src/systems/WarpSystem.js`; triggered by spells, special tiles,
  or NPC interactions. Updates player position and triggers room entry logic.
- **Not:** normal movement or pathfinding. Warp is instantaneous spatial displacement.

## Conventions

- **Casing:** types/classes PascalCase; functions/variables camelCase; constants
  SCREAMING_SNAKE; Game State and Zone string values as defined in `GameConfig.js` /
  `zones.js`.
- Domain terms win over technical defaults. A thing that manages X gets a domain name, not
  `XManager` / `XHandler` / `XHelper`.
- Avoid generic placeholders for concepts that have a term here: `data`, `info`, `process()`,
  `Manager`, `Handler`, `Util`.
