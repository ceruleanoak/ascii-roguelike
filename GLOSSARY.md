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
- **Definition:** A self-contained sub-space entered from the surface — Hut, Dungeon, Maze, or
  Pond. Each is a controller registered with the InteriorManager, which owns the shared
  lifecycle (enter/exit, surface freeze/thaw, reset, active-source accessors, PiP frame).
- **In code:** `InteriorManager` (ADR-0001) + `HutSystem` / `DungeonSystem` / `MazeSystem`
  (+ planned `PondSystem`). Membership is the single field `player._activeInteriorKind`, with
  `inHut` / `inDungeon` / `inMaze` as derived accessors; overlays dispatch through
  `InteriorOverlay` (shared frame in `interiorFrame.js`).
- **Not:** "room" (an Interior contains its own space; a Room is the surface unit); a fourth
  bespoke copy of the lifecycle (the duplication ADR-0001 retired).

### Maze
- **Definition:** An Interior built from a single continuous DFS-generated corridor. Loot hides
  behind cipher-covered breakable objects; one blinks a warning at a time, and letting it
  expire spawns a Ghost. Clearing every object and collecting every dropped Ingredient without
  ever spawning a Ghost grants Spectacles at the maze center.
- **In code:** `MazeSystem` (`generateMazeInterior`, `MazeObject`, `MazeGhost`); interior state
  on `game.mazeInterior` (a deliberate exception to the `activeFloor` convention — see Floor).
  Rendered via `MazeInteriorOverlay`.
- **Not:** the Aquifer or a generic combat Room; re-entry is permanently sealed after exit.

### Ghost
- **Definition:** An immune enemy spawned inside a Maze when a blinking cover object's warning
  expires. Deals contact damage on touch; cannot be fought or destroyed. Once 2 Ghosts have
  spawned in one Maze, every remaining cover object Blinks at once and all Ghosts (existing and
  future) pass through walls.
- **In code:** `MazeGhost` class in `MazeSystem.js` — bespoke, not built on the shared `Enemy`/
  `Mechanic` composition system.
- **Not:** a regular Enemy (immune to damage, no drops); the "ghostly" flavor-text adjective
  used elsewhere in `src/data/enemies.js`.

### Blink
- **Definition:** The warning state of a Maze cover object about to convert into a Ghost —
  toggles visibly 5 times before conversion unless broken open first. Breaking it cancels the
  threat and starts a cooldown before a different object begins blinking.
- **In code:** `MazeObject.blinking`/`blinkOn`/`blinkCount` fields; state machine in
  `MazeSystem._selectBlinkCandidate` / `_tickBlink` / `_convertToGhost`.
- **Not:** the on/off toggle used for UI cooldown indicators (`BowChargeIndicator.js`); the
  Yellow Mage's teleport-dash (`WarpSystem.resolveBlinkTeleport`) — unrelated naming collision.

### Pond
- **Definition:** The **surface entrance** in a Quagmire: a small body of water shaped from
  water background objects with a conspicuous **dark water tile in the middle** that marks the
  frog-only way down. The Pond is the doorway, *not* the space below it.
- **In code:** built by `roomFeatures.placePondEntries` (disc of `~` objects + dark center
  tagged `pondEntry`, stored as `room.pondEntry`). Entered by a Frog (see Polymorph) via SPACE.
- **Not:** the Aquifer it leads to, nor a Lake (an open-water Room).

### Aquifer
- **Definition:** The plane-1 underwater interior reached through a Pond. A **free-form, organic**
  (not square) system of walled passages the frog swims through with **flowing** movement and
  limited vision (lighting parity with the underground/tunnel system). Underwater **platforming**:
  static / simple fixed-pattern hazards (e.g. an eel on a strict point path) deal contact damage;
  passage ends hold discoveries (rare Ingredients + a Key Item).
- **In code:** to be built on the **underground tunnel** render/physics path — walls are
  `tunnelWall` objects (solid on plane 1), lighting is the cave-fog overlay, rendered full-screen
  (no PiP). (The failed first attempt — `PondSystem`/`PondInteriorOverlay`, a square PiP maze with
  no real collision — is being replaced; see `claudedocs/quagmire-handover.md`.)
- **Not:** the Pond (its surface entrance), a PiP panel, a square maze, or open collision-free water.

### Sinkhole
- **Definition:** A concealed hole in a Grass (`G`) Room, disguised as ordinary tall grass
  until a majority of the grass tiles touching it have been cut. Once revealed, SPACE dives
  the player to that Room's own plane-1 cave — a guaranteed river leads to a one-way shortcut
  into a freshly generated Room in another Zone, arriving already on plane 1 inside the river's
  trail.
- **In code:** `SinkholeSystem`; `room.sinkholes[]` (site + adjacency-cut tracking); reveal
  glyph `⬤`, plane-1 water glyph `≈`.
- **Not:** the Pond (a fixed, always-visible Quagmire entrance reached by a Frog only) or the
  Aquifer (Pond's underwater destination); the Sinkhole is concealed until earned by cutting
  grass, is entered by the player directly (no Polymorph required), and its plane-1 space is a
  one-way cross-Zone shortcut rather than a self-contained interior loop. Also not a Burrow
  (an enemy hiding mechanic, not a player-enterable space).

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
- **In code:** tracked via a flag on `game` (e.g. `spectaclesObtainedThisRun`). Spectacles (⊙)
  are obtained by clearing a Maze — breaking every cover object and collecting every dropped
  Ingredient — without ever letting a Ghost spawn; granted via `MazeSystem._checkMazeCleared`.
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

### Quagmire
- **Definition:** A rare green-zone Room (exit letter Q): a water-dispersed arena. Mostly not
  generic combat; when combat occurs it runs in escalating rounds, and a Rusalka may appear
  after the final clear. Holds Ponds (Frog-only Interiors). Variants may instead present the
  Witch as a roaming enemy or a witch's hut.
- **In code:** exit letter `'Q'` in `src/data/exitLetters.js` (green-only weighting); template
  in `letterTemplates.js`; built via `RoomGenerator`. (Phase 1+, planned.)
- **Not:** a Lake (L — open water + fishing), a generic combat Room, or a Hut (H).

### Game (Animal)
- **Definition:** A huntable, non-hostile wild animal — Moose or Rabbit — that appears in a
  huntable-game-eligible Room (see `letterTemplates.js` `huntableGame: true`) once a Hunt
  triggers. Never attacks; flees, or Burrows (Rabbit only), once it detects the player.
- **In code:** `MOOSE` / `RABBIT` non-registry entries in `src/data/enemies.js` (`data.gameAnimal`
  config, EEL-style — not in the letter/digit `ENEMIES` registry); behavior in
  `GameAnimalMechanic`.
- **Not:** an Enemy in the combat sense (zero damage, zero aggro range for attack); not a
  Companion.

### Hunt
- **Definition:** The encounter in a huntable-game-eligible Room: as soon as the room has no live
  enemies (never had any, or just cleared), one Game animal spawns immediately, already idling in
  the open — it flees or hides only once it gets line of sight on the player. One Hunt resolves
  per room visit. Not restricted to any single zone or letter — any Room whose letter template
  sets `huntableGame: true` qualifies.
- **In code:** `HuntingSystem`; eligibility gated on `LETTER_TEMPLATES[exitLetter]?.huntableGame`
  plus zero live enemies; resolution tracked via `currentRoom.huntResolved` (same shape as
  `fairySpawned`). The player-stillness timer (grid-cell diffed via `player.getGridPosition()`)
  no longer gates the spawn — it only feeds the Rabbit's post-Burrow re-emergence check.
- **Not:** a fixed/guaranteed spawn or a Boss encounter; the animal flees/hides on sight
  regardless of whether the player is moving.

### Burrow
- **Definition:** The Rabbit's pre-damage evasion: on detecting the player it runs directly
  away for one second, then digs in and disappears at that spot, re-emerging there once the
  player is still again. Ends permanently the first time the Rabbit takes damage — from then on
  it flees toward an exit like a Moose instead.
- **In code:** `GameAnimalMechanic._updateRabbitBurrow` / `_fleeFromPlayer`; hidden via
  `enemy.plane = 1` (see Plane); reappearance gated on `HuntingSystem.stillnessTimer`.
- **Not:** death or despawn — the rabbit persists, just hidden and non-interactable.

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
