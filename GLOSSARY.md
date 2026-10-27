# Glossary — Ubiquitous Language

> One term, one meaning, used everywhere: design notes, code, UI, commits.
> AI assistants must use these exact terms (see CLAUDE.md). New concept → propose a term,
> don't invent silently. No synonyms, no generic substitutes.

This is a **seed**, not a finished dictionary. It codifies vocabulary already established in
the codebase. Grow it deliberately — when a genuinely new concept appears, the AI assistant
proposes a name, the user ratifies it, and the assistant writes and maintains the entry (the
user does not write this file). Keep it lean: define the concepts that carry the game's
identity, not standard programming terms.

## Domain concepts

### Zone
- **Definition:** A color-coded region of the world with its own identity, danger level, and
  independently tracked Depth. Green → Yellow → Red = increasing danger; Cyan and Gray are the
  off-axis / secret zones.
- **In code:** keyed by color string — `'green'`, `'yellow'`, `'red'`, `'cyan'`, `'gray'`.
  Definitions in `src/data/zones.js`; logic in `ZoneSystem`. Each has a flavor name (Verdant
  Wilds, Scorched Wastes, Frozen Peaks, Stormlands, Realm of the Dead).
- **Not:** "level", "world", "area", "biome", "stage".

### Depth
- **Definition:** How deep the player has descended within a Zone. Tracked **per Zone**,
  independently. N/E/W exits go deeper; S returns toward REST.
- **In code:** `ZoneSystem` depth tracking; `bossDepth` is the per-Zone boss threshold.
- **Not:** "floor" (reserved — see Floor), "level", "stage".

### Home Zone
- **Definition:** The (Zone, Depth) at which an item first becomes obtainable — the zone whose
  world first supplies that item's entire recipe chain, at the deeper of the supplying spawn
  band and the item's value tier floor. It is what "the player has progressed far enough to be
  offered this" means, and the Settlement Shop's stock gate is its first consumer.
- **In code:** `src/data/homeZone.js` — `getHomeZone(char)` returns `{ zone, depth }` or `null`.
  Wholly **derived** from existing data (spawn tables, affinities, rarity profiles, terrain drop
  effects, recipes), never an authored per-item field, so it can't go stale as content is added.
  An item with no Home Zone is one the world cannot produce.
- **Not:** "unlock level", "item tier" (see value tier — one of Home Zone's two inputs),
  "native zone", "origin".

### Game State
- **Definition:** The top-level mode the game is in. The three play modes are **REST** (safe
  hub: crafting, prep, no enemies), **EXPLORE** (procedural combat rooms), and **NEUTRAL**
  (scripted rooms: fishing, errands, NPCs — run as Limited Explore). Plus `TITLE`, `COMBAT`,
  `GAME_OVER`, `ARCADE_DEMO`.
- **In code:** `GAME_STATES` enum in `GameConfig.js`; values are the SCREAMING strings
  (`'EXPLORE'`). State-specific rendering lives in `src/rendering/state/`.
- **Not:** "screen", "scene", "mode" (as a code identifier).

### Limited Explore
- **Definition:** What a NEUTRAL room is: the same world as EXPLORE — liquids and drowning,
  enemies, combat, traps, world effects, the death catch-all — limited by what the room's script
  declares, not by a separate mode. A room has no spawns unless its script adds them, and its
  decorations can't be broken unless the script names them as combat objects. Neutral rooms still
  skip room-clear and depth bookkeeping.
- **In code:** `Game._updateRoomWorld(dt, dotKilledPlayer)` is the shared world tick, called by both
  `updateExploreState` and `updateNeutralState`. `Game.registerRoomWorld(room)` rebuilds physics and
  combat for a room swap. A script's `combatObjects(room)` hook
  (`NeutralRoomSystem.combatObjects`) lists the objects swings may hit. Script flags such as
  `room.interactionsOff` limit the SPACE chain.
- **Not:** "non-combat room", "safe room" (REST is the safe hub), or a second physics mode.

### Floor
- **Definition:** The space of the Interior the player currently occupies (hut, Cavern, dungeon
  floor, or Aquifer). Carries `type` + `viewport` metadata, its own collision map, Background
  Objects and NPCs.
- **In code:** `game.activeFloor` (renamed from the older `hutInterior`); read it through
  `activeInteriorFloor(game)` (PlaneSystem), which is null outside an Interior and in a Maze.
- **Not:** "interior slot" as a variable, "level", or Depth.
### Interior
- **Definition:** A self-contained space entered from a surface Room — Hut (incl. Cavern),
  Dungeon, Maze, or Aquifer — during which the **surface Room is frozen** and the Interior owns
  the frame through a PiP panel. A layer is an Interior when **combat does not span the
  layers**; when it does, the layer is a Plane swap instead (see Plane). Every Interior gets the
  same render and interaction separation with no per-kind wiring.
- **In code:** `InteriorManager` (ADR-0001) + `HutSystem` / `DungeonSystem` / `MazeSystem` /
  `AquiferSystem`. Membership is the single field `player._activeInteriorKind`, with `inHut` /
  `inDungeon` / `inMaze` / `inAquifer` as derived accessors. Floor Interiors enter and leave
  through `InteriorManager.enterFloor` / `exitFloor` (freeze/thaw, collision map, floor loot);
  "is the player inside?" is `isInteriorActive(game)`, the live floor is
  `activeInteriorFloor(game)`, the NPCs in reach are `InteriorManager.activeNpcs()`. Overlays
  dispatch through `InteriorOverlay` (shared frame in `interiorFrame.js`). An Interior's own
  state lives on its host Room (`hut.interiorState`, `room.dungeon.interiorState`) and lasts as
  long as that Room — a REST round trip restores both; `InteriorManager.reset()` only detaches
  the live one.
- **Not:** "room" (an Interior contains its own space; a Room is the surface unit); a Plane
  (the other layer keeps simulating there); a hand-listed `inHut || inDungeon || inMaze` check
  (the layer-leak anti-pattern — bug #107); the Frozen status effect.
### Shed
- **Definition:** The tiny 3×3 Hut that can stand in a Settlement (50% of them), with a Frog
  Coin inside. Its door (`▄`, Shed Door) only lets small things through: frog form or a tamed
  rat. Anyone else pressing SPACE at it gets "LOCKED", unless they hold the Shed Key, which
  turns the small door into a full Hut Door (`∩`) for good.
- **In code:** `hutKind: 'shed'`, stamped by `stampShedFootprint` (`src/systems/roomFeatures.js`);
  the hut record's `unlocked` marks a Shed opened by the key. Entry gate in
  `HutSystem._findNearbyHut`, key/LOCKED handling in `HutSystem._tryShedDoor`, door swap in
  `BackgroundObject.becomeHutDoor`. The `▄` entry keeps the generic `smallDoor` physics flag.
- **Not:** "frog hut" or "small hut" (retired names); a Cavern (also a Hut record, but
  revealed by a bomb, not a key).
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
  it toggles red, and every 3 red blinks spend one of its ticks (the 3 HP pips a hit also
  spends). It converts when a blink takes the last tick, so a cover already hit and left
  blinks for less time. Breaking it cancels the threat and starts a cooldown before a
  different object begins blinking.
- **In code:** `MazeObject.blinking`/`blinkOn`/`blinkCount` fields (ticks are `MazeObject.hp`,
  `BLINKS_PER_TICK`); state machine in
  `MazeSystem._selectBlinkCandidate` / `_tickBlink` / `_convertToGhost`.
- **Not:** the on/off toggle used for UI cooldown indicators (`BowChargeIndicator.js`); the
  Yellow Mage's teleport-dash (`WarpSystem.resolveBlinkTeleport`) — unrelated naming collision.

### Pond
- **Definition:** The small round body of shallow water in a Quagmire whose center tile is the
  Whirlpool — plain-looking water until the Quagmire's rounds are cleared.
- **In code:** shaped by `roomFeatures.placeWhirlpool` (disc of `~` objects; the center is tagged
  `whirlpool` and stored as `room.whirlpool`).
- **Not:** the Aquifer below it, nor a Lake (an open-water Room).
### Aquifer
- **Definition:** The underwater Interior below a Quagmire, entered by stepping onto the
  **Whirlpool** (the Pond's center, active once the rounds clear; any form). The **Aquifer
  Current** carries the player to the **Confluence** at the room center, which splits into three
  non-touching branches tinted by destination — yellow (Oasis, then a fresh yellow Room), red
  (Caldera), cyan (the Maw's lake). One-way: the only ways out are the branch ends. A Frog nearly
  swims against the current and can enter the narrow **Offshoots** that hold the loot.
- **In code:** `AquiferSystem` (kind `'aquifer'`; Floor cached on `room.aquifer.floor`, drawn by
  the shared hut overlay with cave-fog lighting); layout from `aquiferLayout.js`; the current is
  `player.aquiferCurrent` (displacement applied in `PhysicsSystem`); branch warps via
  `CrossZoneWarp.js`.
- **Not:** the Pond (its surface entrance); a Plane (combat doesn't span the layers, so it is an
  Interior); an electric current (water/slime electricity).
### Metal Platform
- **Definition:** The 2×2 steel plate that ferries across a red Island Room's lava lake, shuttling
  along one straight channel between a dock on the outer shore (on the player's entry side) and a
  dock on the island, pausing at each end. Riders (player or enemy) move with it and stand on
  metal, not lava; stepping off mid-lake is stepping into lava. A lava Island's lake is the only
  lava in its Room.
- **In code:** `MetalPlatformSystem` (state on `room.metalPlatform`, so Room-scoped; seeded by
  `seedMetalPlatform` from `RoomGenerator.generateIslandTerrain`); `PhysicsSystem` skips lava it
  covers (`metalPlatformCovers`) and clears lava contact for riders (`isOnMetalPlatform`); drawn by
  the `metalPlatform` ground Frame Pass.
- **Not:** the dungeon Platform plank (a carried key item); a bridge (fixed); Floating Boots.
### Sinkhole
- **Definition:** A concealed hole in a Grass (`G`) Room, disguised as ordinary tall grass
  until a majority of the grass tiles touching it have been cut. Once revealed, SPACE dives
  the player to that Room's own plane-1 cave — a guaranteed river leads to a one-way shortcut
  into a freshly generated Room in another Zone, arriving already on plane 1 inside the river's
  trail. SPACE on the hole from inside the cave climbs back out to the same Room's surface;
  the descent is spent once taken, so the hole is then ordinary scenery. At most one Sinkhole
  exists per Room — its cave is carved into that Room's own grid, so a second would overlay
  the first.
- **In code:** `SinkholeSystem`; `room.sinkholes[]` (site + adjacency-cut tracking); reveal
  glyph `⬤`, plane-1 water glyph `≈`.
- **Not:** the Pond (a fixed, always-visible Quagmire entrance) or the Aquifer (the Interior
  below the Whirlpool); the Sinkhole is concealed until earned by cutting
  grass, is entered by the player directly (no Polymorph required), and its plane-1 space is a
  one-way cross-Zone shortcut rather than a self-contained interior loop. Also not a Burrow
  (an enemy hiding mechanic, not a player-enterable space).

### Sunken Glint
- **Definition:** A twinkle out on the deep water of a green-Zone Ocean (`O`) Room, the same
  "something is hidden here" sparkle that loot in tall grass gives off. Reaching it means
  swimming deep enough to risk drowning. What it hides (a coin 80% of the time, otherwise a sea
  find: Pearl Shard, Sharkbone) is rolled when the glint is seeded, and only shows, as a
  darkened glyph in place of the twinkle, through Goggles. Only with Goggles equipped does
  SPACE in range bring it up; without them the glint can't be collected. Every
  green Ocean Room holds 1–2, in the outer half of the deep band. A discovered glint is spent.
  The Sunken Ship's hold holds seven more, one of them the Slow Glint.
- **In code:** `SunkenGlintSystem` (`seedSunkenGlints` from `generateOceanTerrain`, both it and
  SunkenShipSystem flag tiles through `flagSunkenGlints`; `handleSpacePress` from the EXPLORE and
  NEUTRAL SPACE dispatch, gated by `wearsGoggles`); flag `BackgroundObject.sunkenGlint` on a
  deep `~` tile, contents `BackgroundObject.sunkenContents`; drawn by `drawSunkenGlints`
  (SparkleEffects) at `GRASS_SPARKLE_SPEED`, or as the darkened contents glyph under Goggles.
- **Not:** a Glittering Rock (a harvestable rock that advertises itself at double sparkle speed);
  loot hidden in tall grass (a real dropped entity, concealed by the grass rather than by water);
  fishing (a catch from the Fisherman's rod, not a fixed spot).

### Sunken Ship
- **Definition:** The neutral Room behind the Pearl pedestal's east exit in a green Ocean (`O`)
  Room. A strip of beach on the west wall, then deep sea, with a wreck listing in the middle. The
  sea drowns anyone without Flippers; the Room supplies none (they lie under the Ocean's Push
  Rock). The flooded hold holds seven Sunken Glints, one of them the Slow Glint. The Room is
  rebuilt on every entry, but what the run did there (glints spent, south open) holds for the
  run. The secret south leads down into the Sunken Hold.
- **In code:** neutral script `sunkenShip` (`neutralRooms.js`), laid out and ticked by
  `SunkenShipSystem` (`build`, `update` from `updateNeutralState`); `room.isSunkenShip`; hull
  pieces are the `ship_hull` Background Object variant; run record `game.sunkenShip` (Reset
  Registry, run scope). Reached through PearlSystem's `neutralScript: 'sunkenShip'` exit.
- **Not:** the retired blue Zone (Tidefall), which this Room replaces as what lies past the
  Pearl pedestal; a Zone (it has no depth and no exits deeper).

### Slow Glint
- **Definition:** The one Sunken Glint in the Sunken Ship's hold that blinks five times less
  often than the others (same visible window, a cycle five times as long). It hides no find,
  so it keeps blinking even through Goggles (which are still needed to discover it).
  Discovering it opens the ship's secret south exit, with a shockwave and no message.
- **In code:** `BackgroundObject.slowGlint` (set by `SunkenShipSystem._placeGlints`); drawn with
  `SLOW_GLINT_CYCLE` (SparkleEffects); `SunkenShipSystem.update` opens `room.exits.south` when its
  flag clears.
- **Not:** a separate entity or object kind (it is a Sunken Glint with one more flag).

### Sunken Hold
- **Definition:** The Sunken Ship's Inner Room, through the secret south the Slow Glint opens: the
  flooded underside of the wreck. Every cell is deep water and the Room is near-totally dark — the
  player sees about a cell around themself, five with a Lantern, and a Torch gives no light. SPACE
  only swings and picks up; nothing in the Room can be interacted with. Its north exit climbs back
  into the Sunken Ship.
- **In code:** neutral script `sunkenHold` (`neutralRooms.js`), laid out by
  `SunkenShipSystem.buildHold`; `room.isSunkenHold`, `room.underwater` (read by
  `torchLight.underwaterFogRadius`), `room.interactionsOff` (the NEUTRAL SPACE chain).
- **Not:** the ship's hold — the flooded inside of the hull in the Sunken Ship itself, where the
  glints lie; an Interior (the Sunken Ship is not frozen behind it — it is rebuilt on return).

### Sea Serpent
- **Definition:** The Sunken Hold's twin hidden boss — two of them, the red zone's Centipede
  miniboss carried underwater. Each is a head (`S`) and a tail of ten segments (`o`). They circle
  the Hold on opposite sides of one slowly wandering, breathing orbit in a long, readable sway, and
  every few seconds one stops, shivers and brightens for over a second (Anticipate), then dashes straight along the line it locked onto the
  player (Strike) and eases back onto its orbit (Recover); the two never strike together. The tail
  drags behind the head on a distance constraint, swinging rather than tracing the head's path. Any
  segment can be struck, and every blow spends the serpent's one HP pool (one HP bar per serpent,
  over its head); one swing across several segments lands once. Touching any part hurts. Both dead → the Moon Pearl, and they stay dead for the Run.
- **In code:** `SeaSerpentSystem` (`room.seaSerpents`, States `orbit`/`anticipate`/`strike`/
  `recover`, `spawnPair` from `SunkenShipSystem.buildHold`, `handleUnitHit`); `SeaSerpentUnit`
  (`isSeaSerpentUnit`, `isHead`, `serpentId`) in `room.enemies`; `game.sunkenShip.serpentsSlain`;
  bars drawn by `drawSeaSerpentHealthBars` (`SeaSerpentHealthBars.js`).
- **Not:** the Sea Snake (`s`, the green Ocean template's ordinary enemy); a Boss (no boss loot — the Moon Pearl is the whole reward).

### Moon Pearl
- **Definition:** The key item the two Sea Serpents leave in the Sunken Hold. Held, never equipped
  or spent. A Moon Pearl left on the floor is put back on the next visit until it is picked up.
- **In code:** `ITEMS['☾']` (`ITEM_TYPES.KEY`), placed by `SeaSerpentSystem._placeMoonPearl`;
  `game.sunkenShip.moonPearlTaken`.
- **Not:** the Pearl (`●`) that opens the Sunken Ship at the O room pedestal.

### Inner Room
- **Definition:** A neutral Room reached from inside another neutral Room rather than from
  EXPLORE or REST. Stepping in and out of it never touches the Room saved on the way into the outer
  Room, so the outer Room's own return exit still leads where it did. The outer Room is rebuilt
  from its script on the way back, like any neutral Room on entry.
- **In code:** the outer Room declares `room.innerExits = { <edge>: '<script>' }`;
  `NeutralRoomSystem.innerExitAt` / `enterInnerRoom` / `returnToOuterRoom`, dispatched from
  `updateNeutralState`; the inner Room carries `room.outerRoom = { scriptName, entryDirection }`;
  `transitionToNeutralRoom(..., { inner: true })` skips the `savedExploreState` save.
- **Not:** an Interior (no PiP, no frozen surface); the `savedExploreState.returnTo` handshake
  (which drops the saved Room for a fresh one in another Zone).

### Plane
- **Definition:** Which layer of a **live** Room an entity is on — surface (0) or tunnel/cave
  (1). A Plane swap keeps the other plane simulating, because combat spans the layers (T-room
  tunnel, U-room cave, Sinkhole cave). Plane
  membership decides combat, vision, pickup, and collision eligibility.
- **In code:** `PlaneSystem` (`PLANE_SURFACE` / `PLANE_TUNNEL`,
  `inSamePlane`, `objectOnPlane`); route new combat/vision/pickup/collision checks through it.
- **Not:** an Interior (there the surface is frozen and the layer owns the frame); ad-hoc
  per-frame guards (the layer-leak anti-pattern — bug #107).
### Frame Owner
- **Definition:** The one space that owns the frame on a given tick, meaning the place the player
  currently is: the surface Room, a Floor's PiP, the Maze's PiP, REST, or NEUTRAL. There is exactly
  one each frame. A Frame Owner tells you who draws the frame. A Plane tells you which layer of a
  live Room an entity is on, and Planes can share one owner's frame.
- **In code:** `FRAME_OWNERS` (`'surface' | 'floor' | 'maze' | 'rest' | 'neutral'`),
  `resolveFrameOwner(game)` and `ownsFrame(game, owner, reason)` in
  `src/rendering/framePasses.js`. The resolver mirrors InteriorOverlay's dispatch.
- **Not:** a Plane; a Game State (EXPLORE has two to three owners); "scene"; the `!playerInInterior`
  gate it replaces.
### Frame Pass
- **Definition:** A shared draw pass for something that can appear wherever the player is (loot,
  projectiles, particles, the player glyph and its overlays). Every pass declares every Frame
  Owner: it either draws there or gives a written reason why it doesn't. A missing scenario is
  then a load-time error, not a silent gap.
- **In code:** `FRAME_PASSES` (grouped by `FRAME_LAYERS`: ground / combat / player / indicators)
  and `drawFramePasses(rc, game, owner, layer)` in `src/rendering/framePasses.js`.
  `npm run check:frames` (`tools/check-frame-passes.js`) enforces the registry as the only path.
- **Not:** owner content (the scenery of one owner only, such as surface enemies or the Maze
  ghosts, which gate with `ownsFrame`); a hand-kept per-renderer call list (the #376/#385 shape).
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

### Motif
- **Definition:** An Enemy type's own 2- or 4-bar musical phrase. It loops over the music while
  the camera is zoomed in and an Enemy of that type is in the zoomed frame, and it cuts the
  moment the last one leaves the frame or the zoom releases. A Motif comes in at the next bar
  line, in phase with the music (at the music's bar 3, a 4-bar Motif enters at its own bar 3).
  Several types in frame layer their Motifs.
- **In code:** `motif: { name, bars }` on an `ENEMIES` entry → bounce at
  `public/assets/audio/motif-<name>.mp3`. `bars` is authored, not read from the bounce: only
  that many bars ever play, so a 2-bar Motif bounced as 4 bars repeats twice per 4-bar phrase
  and its bars 3–4 are never heard. `EnemyMotifSystem`
  decides which Motifs are wanted each frame; `AudioSystem.startMotif`/`stopMotif`/`tickMotifs`
  play them on the music clock (`_musicPass`).
- **Not:** an SFX (a one-shot `data.sfx` cue), and not a Beat (the combat term).

### Enemy State
- **Definition:** The AI State spine — a single closed, named set of behavioral States
  (Dormant, Alert, Approach, Anticipate, Strike, Recover, Search, Withdraw, Flee, Lookback,
  Use Trap) that every Enemy walks, one State current at a time. An Enemy declares only the
  States it uses; an
  undeclared State is **skipped**, not an error — the runner walks a fallback chain forward until
  it reaches one the Enemy does declare. Movement archetypes (`chaser`/`keeper`/`kiter`/`jumper`/
  `ambusher`) are not Enemy States — they are an authoring preset that expands into a default
  `states` block naming a movement verb (`close`/`hold`/`orbit`/`back`/`still`/`wander`) per
  State, so the archetype survives only as shorthand, not as a behavior of its own. `flee` is an
  eighth verb in that same vocabulary, but State-only — no movement archetype defaults to it, so
  it only appears where an Enemy's own `states` block names it.
- **In code:** `EnemyStateMachine` (`src/entities/EnemyStateMachine.js`) is the runner; `STATES`
  maps ids to the files in `src/entities/enemyStates/`; `FALLBACK` is the skip-forward chain.
  An Enemy's declared block is `data.states`, defaulted from `movementStyle`/`movementConfig`
  by `stateDefaults.js#defaultStates` when absent. Live behind `SPINE.enabled`; parity with the
  legacy ladder it replaces is certified by `tools/debug/fsm-parity.mjs`.
- **Not:** Game State (the top-level game mode — REST/EXPLORE/NEUTRAL; unrelated concept despite
  the shared word); a free-form per-enemy state graph (explicitly rejected — the named set is
  closed, and extending it is authorial, never data-only); a Mechanic (composable behavior
  layered on top of whichever State is current, not a State itself).

### Dormant
- **Definition:** Asleep until something wakes it — damage, or the target coming within a wake
  radius. The one State an interrupt (stun, freeze, knockback, etc.) does not knock an Enemy
  out of, so a stunned ambusher stays asleep instead of the interrupt destroying the ambush.
- **In code:** `src/entities/enemyStates/dormant.js`; wake condition is
  `data.states.dormant.wake` (`onDamage`, `radius`); declared by default only by the `ambusher`
  movement-style preset.
- **Not:** the REST Game State (unrelated); the Sniper's private `hidden` sub-state or the
  Flock's `perch` (candidates to fold in later, not yet migrated).

### Alert
- **Definition:** Aware the target may be nearby but not committed to engaging it — the
  "listening" half of what the legacy `'idle'` state id conflated with "wandering." Holds
  position if the target is within aggro range but undetected; wanders otherwise. Exits toward
  Approach on sight inside aggro range, or toward Search two ways: on sight from the band
  between aggro range and vision length (noticed, not engaged), and on proximity-only detection
  by an Enemy that has never seen the target.
- **In code:** `src/entities/enemyStates/alert.js`; must be declared by every Enemy — it is the
  only State Approach can hand back to when the target leaves aggro range.
- **Not:** the legacy `'idle'` state id, which this and Approach's holding behavior jointly
  replace; Dormant (nothing wakes an Enemy toward Alert — waking is Dormant's own transition).

### Approach
- **Definition:** Closing on, holding a preferred band from, or orbiting the target — whichever
  movement verb (`close`/`hold`/`orbit`) the Enemy's data names. The State every movement
  archetype used to be a property of; now the archetype is only which verb Approach defaults to.
- **In code:** `src/entities/enemyStates/approach.js`; verb comes from
  `data.states.approach.movement`, defaulted per archetype by `stateDefaults.js#APPROACH_VERB`.
  Commits to Anticipate (or straight to Strike, if Anticipate is undeclared) once in range and
  off cooldown.
- **Not:** a movement archetype itself — `chaser`/`keeper`/`kiter`/`jumper`/`ambusher` are
  presets that configure Approach, not States of their own.

### Anticipate
- **Definition:** A visible hesitation before committing to Strike — the tell. Undeclared by
  default, so an un-re-authored Enemy skips straight to Strike, unchanged from today's
  behavior. Not committed by default, so the hesitation is punishable unless an Enemy
  explicitly authors otherwise.
- **In code:** `src/entities/enemyStates/anticipate.js`; `data.states.anticipate.tell` names
  the visual cue, `breakIf` lets the tell be aborted, `requirePack` gates it on packmate
  readiness (the Frost Wolf's use case).
- **Not:** `attackWindup` / the Windup phase of Weapon Timing — that is Strike's own opening
  beat, not a separate hesitation before Strike begins. Conflating the two would change
  behavior across the whole roster.

### Falter
- **Definition:** A chance beat, rolled on an Enemy's decision frames while it is in Approach
  or Flee, during which it stands still and will not commit to Anticipate/Strike (or a
  cornered bite). It puts natural pauses into an approach or a flight. Every Enemy has it by
  default except bosses; leaving the State ends it.
- **In code:** `src/entities/enemyStates/falter.js` (`updateFalter` / `isFaltering` /
  `clearFalter`, `enemy.falterTimer`), called from `approach.js` and `flee.js`. Authored per
  State as `data.states.<approach|flee>.falter`: `false` turns it off, `{ chance, duration }`
  overrides the defaults (15%, one `decisionInterval`).
- **Not:** Anticipate (a declared tell that always comes before a Strike, while a Falter is a
  roll that comes before nothing in particular); a State of its own, or a sub-state beside the
  machine.

### Strike
- **Definition:** The attack itself, from its opening beat through its last — collapses the
  legacy `'windup'` and `'attack'` state ids, two ids for one event. The opening beat (the
  windup) breaks on damage — the Enemy drops back to Approach and the swing never lands —
  unless the Enemy is `windupImmune`. Once the swing is live it is committed: only a hard
  interrupt (stun, freeze, etc.) can cut it short, not damage. `bands` lets the
  attack vary by distance, generalizing the bespoke per-enemy distance checks several bosses
  hardcoded.
- **In code:** `src/entities/enemyStates/strike.js`; the swing's cost (cooldown) is charged by
  `Enemy.resolveStrike()`, called only on the path where the swing actually connects or
  completes — never on exit, so a Strike the target walks out of costs nothing.
- **Not:** Anticipate (the tell that may precede it); the legacy `'windup'`/`'attack'` state ids
  it replaces, still surfaced to renderers via `LEGACY_STATE`'s translation layer.

### Recover
- **Definition:** The window after a Strike where the Enemy is not yet dangerous again — a
  real, timed vulnerability window, unlike the legacy ladder's melee back-off (a positional
  correction with no timer, not a vulnerability window, and never applied to ranged Enemies at
  all). Six named variants (`retreat`, `stationary`, `jumpBack`, `knockback`, `lockPlayer`,
  `hide`) cover everything from a plain backpedal to briefly rooting the player or vanishing.
- **In code:** `src/entities/enemyStates/recover.js`; variant selected by
  `data.states.recover.variant` (default `retreat`); declared by default only for
  `chaser`/`keeper` archetypes (the fix for the Chase-state waggle), opt-in for any archetype
  via `data.recover`.
- **Not:** Recovery, the Weapon Timing phase (`items.js` `recovery` field — a weapon-data
  cooldown-after-impact value). Two different domains — weapon data vs. Enemy State — one
  letter apart; kept distinct on purpose, since the contexts never overlap and neither is a
  code identifier the other could be confused with.

### Search
- **Definition:** Pursuing the target's last known position after losing contact. Leads the
  mark by the target's velocity at the moment contact was lost, then holds at the mark once
  reached rather than resuming any other behavior. Abandons after `abandonAfter` marks
  investigated — a count, not a fixed timeout.
- **In code:** `src/entities/enemyStates/search.js`; sets `enemy.aggroMemoryActive`, which also
  widens vision to omnidirectional (`hasVision` skips the cone check) for the hunt's duration.
- **Not:** Alert (which carries no mark); a fixed 5-second timeout (the literal the legacy
  ladder wrote at six separate sites — replaced by a mark count).

### Withdraw
- **Definition:** Disengaging on purpose, visibly — the answer to "what happens when a Search
  is abandoned," instead of the Enemy just stopping and idling on the spot. Optional:
  undeclared, abandonment resolves straight to Alert, which is every Enemy's current behavior.
- **In code:** `src/entities/enemyStates/withdraw.js`; re-engages back to Approach if the
  target reappears mid-withdrawal.
- **Not:** Search (still actively hunting); permanent disengagement — withdrawal ends at
  `cfg.to ?? 'alert'`.

### Flee
- **Definition:** Running from a memory mark rather than pursuing one — the wildcard State a
  coward Enemy opts into by declaring `flee` and omitting both Approach and Search, so both of
  Alert's transition doors (sight, proximity) resolve through to it instead of hunting. The mark
  is frozen at the position of whatever detection triggered flight, not led by target velocity
  like Search's, and holds until the target is sighted again. Deliberately keeps the detection
  cone active rather than widening to omnidirectional — an Enemy that has turned its back on the
  target should only re-notice it by chance, the point of running rather than hunting.
- **In code:** `src/entities/enemyStates/flee.js`; `moveFlee` (`enemyMovement.js`) is its verb —
  projects a point beyond the Enemy on the far side of the mark and routes to it via the same
  wall-aware navigation Approach uses, so it turns its back and runs rather than strafing. Two
  distinct mechanisms, kept deliberately separate because they answer different questions:
  - **Barrier-seeking** — a *decision*, not a per-frame roll: `moveFlee` holds a locked heading
    (`enemy.fleeHeadingAngle`) and only re-rolls it once per `enemy.decisionInterval`
    (`enemy.fleeHeadingTimer`), matching the cadence `updateVectorNavigation` recalcs on. Fans out
    candidate headings around the (jittered) away direction, but a candidate is only eligible at
    all if it first clears a short self-position `hasVisionBarrier` probe — can the Enemy actually
    step that way, not just "does the mark's view of it happen to be blocked" — before preferring
    the narrowest-deviation candidate that also puts terrain (a wall, tree, or other
    vision-blocking background object, via the pure-geometry `hasVisionBarrier` in
    `enemyVision.js`) between the mark and the Enemy. Falls back to the nearest merely-clear
    candidate when no cover is available, and to the raw jittered heading only when every scanned
    angle is blocked (boxed in). Re-rolling every frame instead of once per decision was the
    original corner-sticking/thrashing bug: a fresh random jitter could get locked in by
    `updateVectorNavigation` at an unrelated instant, and the old scan never checked the Enemy's
    own immediate footing, so near a corner it could readily lock onto a heading aimed straight
    into an adjacent wall. This only steers; it doesn't know whether the steering actually worked.
  - **Lookback** — its own State now, entered on `flee.lookbackInterval` (default 2 dbl-sec ≈
    every ~1 real second); see the **Lookback** entry below.
  - **Scatter** — the away heading `moveFlee` computes gets random angular jitter before
    barrier-seeking or trap-avoidance run, widest right when the flight starts and narrowing over
    `enemy.fleeElapsedTime` (fed each frame from `machine.timer`). Several Enemies fleeing the
    same spot fan out into a scramble instead of stacking on one reciprocal line, settling toward
    straight-away as the flight continues.

  Also sets `enemy.fleeing` (the re-entry guard, playing `aggroMemoryActive`'s role without the
  vision side effect). `FALLBACK.approach` and `FALLBACK.search` both lead with `'flee'` in
  `EnemyStateMachine.js`.
- **Not:** Search (which pursues a led mark with omnidirectional hearing); Withdraw
  (disengagement after a hunt ends, not a reaction to sighting the target); a movement archetype
  — no archetype defaults to declaring it, an Enemy must author it explicitly.

### Lookback
- **Definition:** A deliberate glance back while fleeing, reached only from Flee's own `next()`
  on its `lookbackInterval`. Checks whether the target can *actually* still see the Enemy right
  now, through the real vision system (`hasVision` with the cone ignored) against the target's
  live current position — not the frozen mark, and not a raw line check, so both "obstructed"
  and "simply out of vision range" count as "lost me." Holds still; if the target can still see
  the Enemy, resolves straight back to Flee. If not, holds a `pause` beat — laying a trap should
  read as a decision the Enemy visibly stops for, not an instant reflex the moment sight
  breaks — then resolves to Use Trap.
- **In code:** `src/entities/enemyStates/lookback.js`; sets `enemy.fleeReachedBarrier`
  (the confirmed-lost-sight flag) and `enemy.fleeLookbackFired` (a one-frame edge a reactive
  Mechanic, e.g. `RipenMechanic`, can key off). `FALLBACK.lookback` leads with `'flee'` in
  `EnemyStateMachine.js` — declaring Flee without also declaring Lookback is not a safe
  omission: the fallback resolves back to Flee's own already-current state, which
  `transition()` treats as a no-op, so the glance-back silently never fires. Not
  engine-guarded; the enemy-editor schema warns at authoring time instead (`fleeNotes` in
  `tools/enemy-editor/src/schema.js`).
- **Not:** the continuous barrier-seeking `moveFlee` already does every frame while running
  (that only steers; it doesn't know whether the steering actually worked) — Lookback is the
  discrete sensory check of the result.

### Use Trap
- **Definition:** The cornered beat once Lookback confirms a barrier separates the Enemy from
  its target — holds still and waits. Placing the trap itself is not this State's job: a State
  has no return value the outside world can read, so a reactive Mechanic (`TrapLayerMechanic`)
  watches for this State becoming current and is the one thing that can actually spawn
  something, since only a Mechanic's `{suspend, result}` contract reaches `TrapSystem`. Resolves
  onward once the Mechanic's `clearAfter` beat elapses, or on a `timeout` safety net if no trap
  ever gets placed.
- **In code:** `src/entities/enemyStates/useTrap.js`; paired data lives on
  `data.trapLayerMechanic`. `FALLBACK.useTrap` leads with `'withdraw'` — a confirmed-lost coward
  settles rather than loops, since Lookback's fallback to Use Trap resolves to a State genuinely
  different from Lookback's own current one, so an Enemy with Flee + Lookback but no Use Trap
  (Bomb) gives up and settles into `alert` the same way Trap Goblin's own `useTrap.to: 'withdraw'`
  does once its trap is down — the plain wildcard archetype is that same chain with the
  trap-laying beat skipped, not a different ending.
- **Not:** Lookback (the sensory check that leads here); a general escape-and-hide State — this
  is specifically the trap-laying beat, named for its one shipped user.

### Mechanic
- **Definition:** A composable enemy behavior added by data, not by branching in `Enemy.js`.
  New enemy behaviors are authored as Mechanics.
- **In code:** files in `src/entities/enemyMechanics/` (e.g. `ChargeMechanic`,
  `PackBehaviorMechanic`); selected via enemy `data`.
- **Not:** a `switch` on enemy type inside `Enemy.js`; a one-off meta-state.

### Telegraph
- **Definition:** The projected warning shape of an incoming enemy attack — what the player
  *reads* — as distinct from what actually deals damage. For an Animation with a travelling
  strike, what damages is the mark itself, tested where it is on the frame; the shapes are the
  ground it crosses, and standing on that ground costs nothing until the mark arrives. `blink` is
  the exception that proves the rule: with no travelling mark, its hit shape damages by
  containment on release.
- **In code:** enemy data block `telegraph: { area, size, animation, attackShape, beatDamage }`
  naming an Area and a Telegraph Animation, or `{ warnShape, hitShape, pulses }` written out
  longhand when no Area fits; shared module `src/game/Telegraph.js` (shape descriptors
  `rect`/`trapezoid`/`cone`/`ring`/`circle`, `attackHitsBox` / `strikeHitsBox`, `drawTelegraph`)
  consumed by CombatSystem, ExploreRenderer, and the enemy-editor sandbox.
- **Not:** "windup" (the timing phase of Weapon Timing — a Telegraph is the projected *shape*
  shown during a windup); the legacy single-rect windup visual (which is both warning and
  hitbox at once).

### Area
- **Definition:** The named region a Telegraph warns about — the ground the player is being told
  to leave. The three basic Areas are **box**, **circle**, and **trapezoid** (which widens away
  from the enemy, so its far edge threatens ground its near edge does not). Each comes in two
  **Sizes**: **small** is one cell, the default, and is what an enemy that simply swings at you
  should say; **big** is the AoE, and has to be asked for by name so reaching for it is a
  decision rather than what happens if nobody chooses. The slices and the ring carry fixed
  dimensions instead of Sizes — a specific reach and thickness is their whole identity. An Area
  is always drawn filled and never outlined: the strike is the only line a Telegraph draws.
- **In code:** `AREA_PRESETS` in `src/game/TelegraphAnimation.js`, named in data as
  `telegraph.area` + `telegraph.size`; `resolveArea` / `areaIsSized` / `SIZES` / `DEFAULT_SIZE`
  expand a name into the warn/hit pair. Each Animation lists the Areas it is choreographed for
  in its own `areas`, which is what the editor's Animation dropdown filters on.
- **Not:** "shape" — that word is reserved for the geometric descriptor an Area expands into
  (`warnShape.kind`). Not a hitbox: an Area is the danger *zone*, the ground the strike will
  cross, and being inside one is not by itself being hit.

### Telegraph Animation
- **Definition:** The named choreography of a Telegraph, in two halves: the **tell** — the Area,
  still and blinking in place, which says *where* — and the **strike**, a thin stroke sweeping
  through that Area, which says *now*. Motion belongs to the strike alone. The two halves never
  share the screen: the tell ends the instant the strike begins, because the warning has already
  been read and leaving it up buries the one moving mark that matters. The strike is also the
  hitbox, so a Beat only lands if its pass actually crosses the player: `doubleSweep` damages
  twice only when both passes catch them. Choosing an Animation is therefore a balance decision,
  not an art decision.
- **In code:** the `ANIMATIONS` catalog in `src/game/TelegraphAnimation.js` (`blink`, `clap`,
  `vertical`, `slap`, `bloom`, `sweep`, `doubleSweep`, `thrust`, `recoil`, `radiate`,
  `closeIn`, `revolve`), named in data as `telegraph.animation`; `strikeGeometry` reports the
  stroke in the shape's local frame, `strikeMarks` reduces it to the mark(s) that carry the
  glyph, and `Telegraph.drawTelegraph` draws each half in its phase.
- **Not:** decoration layered over a separately authored rhythm — declaring `pulses` alongside
  an Animation is an authoring conflict, and the Animation wins. Not "sweep" as a generic word
  for Telegraph motion (`sweep` is one specific Animation).

### Beat
- **Definition:** One damage hit within a Telegraph Animation. Beat 0 lands on release; each
  later Beat re-arms the attack after its gap. Beats are the authored rhythm and compile
  directly into the pulses combat resolves against, so what the player watches and what
  connects cannot drift apart.
  A `reverse` Beat is the return trip of the Beat before it, so it also draws its Attack Shape
  mirrored — `doubleSweep` comes home as the same swing turned around, not as a second identical
  one. An Animation whose *base* direction is reversed (`recoil`, `closeIn`) is not returning
  from anywhere and is not mirrored.
- **In code:** `animation.beats[]` (`gap` in double-seconds, `reverse` to flip that Beat's
  direction); `compilePulses` turns them into `attack.telegraphPulses`; per-Beat damage via
  `telegraph.beatDamage[]`; live state `attack.beatIndex` / `attack.beatElapsed`. The mirror
  keys on `beat.reverse` alone (`strikeGeometry`'s `mirrorAll`), never on the animation/beat XOR
  that sets travel direction.
- **Not:** "pulse" — that is the compiled runtime form a Beat becomes; Beat is the authoring
  term. Not a frame or a timer tick.

### Attack Shape
- **Definition:** A single character an enemy's strike carries instead of the default hairline
  stroke — the swing drawn as a glyph rather than as a line. It rides the same path, at the same
  timing, turned to face the swing, so a `/` is the same stroke whichever way the enemy is aimed,
  and **stretched to span the whole mark**, because the mark is the hitbox and a one-cell glyph
  floating in the middle of a strike that damages end to end would be a picture of the wrong
  thing. Where an Animation's marks are mirror halves of each other (`clap`), the far one is
  drawn flipped, so a pair reads as jaws closing rather than as two copies sliding the same way;
  a return-trip Beat (`doubleSweep`'s second stroke) is flipped for the same reason, and the two
  reasons compose — a returning far half is the unflipped glyph again.
  Optional and per-enemy: absent, the strike is the hairline. Two modifiers, both optional: a
  **turn** — a quarter-turn of the character within the mark, for glyphs whose meaning points
  somewhere — and a **count** — how many copies the strike carries, which is what makes a ring
  read as a ring of teeth rather than as one glyph on a spoke. A count never shrinks the glyph:
  on `revolve` it repeats the whole travelling arc around the ring, so five is five full-size
  teeth going round together and all five damage.
- **In code:** `telegraph.attackShape` in enemy data → `attack.attackShape`; drawn by
  `Telegraph.drawAttackShape` / `stampGlyph` along each mark `strikeMarks` reports (its `angle`,
  `length`, and `mirror`), in Unifont. `telegraph.attackShapeTurn` (`0|90|180|270`) rotates the
  character underneath the stretch, so a turned glyph still spans its mark; `attackShapeCount`
  multiplies `strikeGeometry`'s arcs (so the extra teeth are hitboxes, not decoration) and sets
  how densely an already-continuous circle is sampled, and 0 leaves each animation at its own
  natural reading. On `blink` (which has nowhere to travel) it plants at `shapeCenter` over the
  lit area, or spreads round the shape via `spreadMarks` when a count is authored.
- **Not:** the enemy's own char, or an item char — an Attack Shape is a combat cue and is exempt
  from the two-tier Character Encoding Rule. Not a sprite or an animation frame sequence.

### Rage
- **Definition:** A Mechanic state in which an Enemy becomes dramatically more dangerous after
  taking its first hit (or crossing an HP threshold) — punishing reckless engagement and
  rewarding tactical first strikes.
- **In code:** `RageMechanic` gated by `data.rageMechanic`; active state field `rageActive`.
- **Not:** `enraged` (the pre-existing aggro/alert flag on Enemy — an awareness state, not a
  power-up).

### Sprint
- **Definition:** A Mechanic where an alerted Enemy ramps to a sustained speed the player
  cannot outrun — once engaged, disengaging is no longer free. Contests gun/bow self-root and
  reload windows.
- **In code:** `SprintMechanic` gated by `data.sprintMechanic`; continuous ramp, no discrete
  dash state.
- **Not:** Charge (`ChargeMechanic`'s telegraphed straight-line dash FSM).

### Crowder
- **Definition:** A Mechanic where an Enemy deliberately holds sub-melee distance — pressing
  inside the player's weapon minimum range to deny spear-tip crits and the whip band.
- **In code:** `CrowderMechanic` gated by `data.crowderMechanic`; velocity-override, not a
  movement style.
- **Not:** a chaser (which closes to attack range and stops); the Crowder's goal is denial of
  the player's spacing, held continuously.

### Bomb Carrier
- **Definition:** An urgency Mechanic: the Enemy carries a fused bomb with a visible countdown
  overhead and chases the player; on zero it detonates. Forces target prioritization.
- **In code:** `BombCarrierMechanic` gated by `data.bombCarrierMechanic`; detonation reuses
  `deathExplosion` plumbing.
- **Not:** a suicide bomber triggered by proximity — the fuse is time-driven and readable.

### Thief
- **Definition:** An urgency Mechanic: the Enemy steals from the player on contact and
  permanently flips to cowardly flight the moment it succeeds (or is struck first). Rat/
  Plague Rat take every coin on hand; Monkey ejects up to three ingredients (keeping one,
  scattering the rest) plus knocks away the held weapon (3 cells, pickup-cooldown gated).
  Either way, whatever the thief keeps is carried visibly — its glyph above the head plus
  one white pip per item held — and dropped back if it's killed before it escapes; gone
  for good only if it survives.
- **In code:** `ThiefMechanic` gated by `data.thiefMechanic`; `steals: 'satchel'` selects
  the ingredient+weapon variant, unset defaults to coin.
- **Not:** Looter (an Enemy that picks items up off the ground; it never takes from the
  player). Not despawn-on-success — the thief flees and can recover, it doesn't vanish.

### Quiver Recharge
- **Definition:** A Mechanic for an archer Enemy: when its equipped bow runs out of arrows
  (enemy-held bows share the player's per-room magazine), it flips to cowardly flight until a
  recharge clock fills (Goblin: 10 real seconds), then the bow refills and it hunts again.
  Picking up another weapon mid-flight ends the flight early.
- **In code:** `QuiverRechargeMechanic` gated by `data.quiverRecharge` (`rechargeTime` in
  double-seconds). The flip itself is the shared `enterCowardice`/`leaveCowardice`
  (`enemyMechanics/cowardice.js`), the same one Thief uses.
- **Not:** Thief's flip — a recharging archer still counts toward room-clear and never bites
  back when cornered.

### Watcher
- **Definition:** A Mechanic for a wide-vision alarm Enemy: on spotting the player it marks
  them — clearing backstab eligibility — and alerts its roommates. Contests the
  burst-from-stealth economy.
- **In code:** `WatcherMechanic` gated by `data.watcherMechanic`; marking acts through the
  `detectionIndicatorTimer` gate that backstabs check.
- **Not:** a sentry turret or a damage threat in itself; the Watcher's weapon is information.

### Water-Bound
- **Definition:** A Mechanic: the Enemy never leaves the room's water. Movement that would
  carry it ashore is stopped; one spawned on sand starts in the nearest water, and one
  knocked ashore swims straight back. The player chooses whether to come to the shoreline.
- **In code:** `WaterBoundMechanic` gated by `data.waterBound`. "Water" is PhysicsSystem's
  water: a `~` tile that isn't lava/mud/hot water and isn't frozen or crystallized.
- **Not:** a swimmer that merely prefers water, and not a clamp on knockback — a hit can
  still throw it onto the beach.

### Lava-Shy
- **Definition:** A Mechanic, the mirror of Water-Bound: the Enemy never walks onto lava.
  Its route-finding treats lava as a wall, so it paths around a lava river. Movement that
  would step onto lava is stopped at the shore. One already in lava (thrown, spawned, or
  flooded in) walks to the nearest safe cell. Lava becomes the player's refuge from it.
- **In code:** `LavaShyMechanic`. It is on by default for every Enemy lava would hurt
  (not `lavaImmune`, no fire affinity, not `data.float`); `data.lavaShy` overrides that
  default either way. The Bumper is lava-immune but sets `lavaShy: true`. It is consulted
  by `enemyVision.hasLineOfSight` for navigation. "Lava" is `LavaContact.isLavaTile`: a
  `~` tile whose typeId is `lava`, or an untyped damaging `~`.
- **Not:** lava immunity. Taking no lava damage is the separate `lavaImmune` flag. It is
  also not a clamp on knockback, so a hit can still throw it into the lava.

### Bump
- **Definition:** A Mechanic for contact without damage: touching the Enemy flings the
  player hard, on a per-Enemy cooldown. A dodge roll passes through it. The body is the
  threat, and the danger is wherever the shove lands the player.
- **In code:** `BumpMechanic` gated by `data.bump = { force, duration, cooldown }`. It is
  resolved in `EnemyUpdateSystem._runEnemyLoop` beside charge contact. The shove starts a
  **Bump Flight** (`player.bumpFlightTimer`, `duration` real seconds): `Player.updateInput`
  drops input acceleration and the walk-speed cap for its length, so friction alone decays
  the throw. Without it the cap would clip the shove to a single step.
- **Not:** a Charge (no windup, no rush), and not an attack, since it never deals damage.
  It is also not `knockbackTaken`, which scales how far the player's weapon hits shove an
  Enemy (`src/entities/knockbackTaken.js`).

### Hammer Flip
- **Definition:** A Mechanic that lets a hammer blow tip a shelled Enemy (the Tortoise) onto
  its back. The Enemy is knocked out of its shell and stunned for a fixed time. During that
  time it can't launch, charge, or strike, and it doesn't re-tuck when hit, so every weapon
  lands. It rights itself when the stun ends.
- **In code:** `HammerFlipMechanic` is gated by `data.hammerFlip = { duration }` (real seconds),
  and its state is `enemy.flipped`. `Enemy.takeDamage` calls `tryFlip` before the shell-form
  immunity check, so a blow on a tucked shell still flips it. It is drawn upside down.
- **Not:** the Ancient Turtle boss's `TurtleShell.flipped` (its P2 phase change, driven by HP).

### Close Quarters
- **Definition:** A Mechanic for a carried melee weapon held in reserve: the Enemy keeps
  its native attack, movement, and range, and switches to the weapon only while the player
  is inside the weapon's reach. A Sea Snake shoots fire, and stabs with a Trident up close.
- **In code:** `CloseQuartersMechanic` gated by `itemUsage.closeQuarters`; hooks
  `Enemy.equipWeapon` (skips melee conversion) and picks `attackType` outside Strike.
- **Not:** Weapon Conversion, the default pickup, which turns the Enemy into a melee chaser for good.

### Weapon Conversion
- **Definition:** What equipping a weapon does to an item-using Enemy (Goblins). A melee
  weapon converts it into a chaser: it closes to the weapon's reach (Approach verb `close`),
  moves faster, leaps with the swing, and uses the weapon's own windup as its telegraph.
  A ranged weapon restores its native spacing and windup.
- **In code:** `WeaponConversion` (`enemyMechanics/weaponConversion.js`), called from
  `Enemy.equipWeapon`; `syncApproachToWeapon` also runs after `leaveCowardice`, and
  `holdStrikeForWeapon` keeps `attackTimer` from expiring before the weapon is ready.
- **Not:** Close Quarters, which skips the melee conversion and holds the weapon in reserve.

### Scorned Ingredient
- **Definition:** An Ingredient Charon considers beneath him — Stick, Rock, Fur, Goo. His
  toll takes them only once nothing else takeable is left.
- **In code:** `SCORNED_INGREDIENTS` in `CharonSystem.js`.
- **Not:** an ingredient he refuses outright; scorned ones still settle the toll last.

### Ingredient
- **Definition:** A raw drop from enemies/environment. Never crafted.
- **In code:** rendered as a **letter** (`a–z`, `A–Z`) or **digit** (`0–9`).
- **Not:** a Crafted item; never a Unicode symbol.

### Crafted item
- **Definition:** A recipe output — weapon, armor, or consumable.
- **In code:** rendered as a **Unicode symbol** (non-letter, non-digit, no emoji, no pure
  box-drawing, literal glyphs only). Recipes in `src/data/recipes.js`.
- **Not:** an Ingredient; never a letter/digit char.

### Spawned Items
- **Definition:** The run's no-repeat list for world item spawns. The Camp (C), the Discovery
  Room (?), the depth-1 weapon offer and the dungeon Trap Room reward all skip an item any of
  them already placed this run. An item counts as soon as it is placed, picked up or not.
  When a pool has nothing left, it opens up again in full.
- **In code:** `game.spawnedItemChars` (Reset Registry, `run` scope);
  `pickUnspawnedItem` / `markItemSpawned` in `src/systems/spawnedItems.js`.
- **Not:** enemy drops or the unarmed safety net in `offerL1Weapon` (neither reads nor writes
  the list); `announcedItemChars` (items whose name the pickup box has already shown).

### Armor Flavor
- **Definition:** The material family a worn piece belongs to, and the feel that family gives.
  **fur** (Fur / Leather) is light, quick, and slips blows. **metal** is slow and heavy.
  **block** (the shields and Chain Mail) catches the blow rather than slipping it. **bone** is
  sturdy but can Splinter against weapons. Putting a piece on floats its family's word
  ('SPEED+' / 'HEAVY' / 'BLOCK+' / 'STURDY') above the player in the family's color. The word conveys a
  feeling, not a stat.
- **In code:** `ARMOR_FLAVORS` in `src/data/items.js`, referenced per entry as
  `flavor: ARMOR_FLAVORS.<family>`. `ArmorEffectsSystem.announceFlavor(item)` floats the word,
  fired from `InventorySystem.equipArmor` via `onArmorEquipped`.
- **Not:** a stat readout or tooltip. Robes, crowns, and mantles have no family and float nothing.

### Splinter
- **Definition:** Bone armor breaking outright when a melee hit lands on the player. The piece is
  destroyed, not returned to inventory, and 'SPLINTER' floats in its Armor Flavor color. Padded
  Bone is more durable than Bone Armor but can still Splinter.
- **In code:** per-piece `splinterChance` in `src/data/items.js` (Bone Armor 𐤔 0.12, Padded Bone
  𐤊 0.06), projected onto `player.splinterChance` by EquipmentEffectsSystem. `PlayerDamageSystem`
  rolls it on an `isMelee` hit and sets `player.splinterPending`.
  `ArmorEffectsSystem.updateSplinter()` consumes the flag and removes the armor.
- **Not:** the Bat's shatter or the frozen-enemy Shatter. Ranged hits never Splinter.

### Dismantle
- **Definition:** Breaking a Crafted item back into its recipe pair at the REST station. Placing
  the item in the centre slot *stages* it: the pair appears in the side slots and the item
  shows in the centre. Taking a side slot commits the Dismantle. Walking away cancels it and
  hands the item back.
- **In code:** `CraftingSystem.stageDismantle()` / `cancelDismantle()`, with `dismantleItem`
  holding the live staged Item. `MenuSystem.returnCraftingSlotsWhenAway()` cancels. The same
  verb is the DISMANTLE option in SlotReplacementOverlay and the SHIFT label.
- **Not:** a craft (the reverse direction).

### Forge Recipe
- **Definition:** A recipe with Scale as an input. It crafts only at the Dragon Forge. At the
  REST station the pair shows an ember tell in the centre slot: a dim `*` that can't be
  claimed and is recorded as neither discovered nor failed. Dismantling a Scale item at REST
  still works.
- **In code:** `requiresForge(recipe)` / `FORGE_INGREDIENT` in `src/data/recipes.js`; derived
  from the input, so every future Scale recipe is gated with no per-recipe field.
  `CraftingSystem.emberTell` raises the tell.
- **Not:** a failed pair; a cursed recipe; a per-recipe `station` tag.

### Dragon Forge
- **Definition:** The station where Forge Recipes are crafted. It rises in the green zone boss
  room when the Goo Dragon falls and belongs to that room alone. It comes back with the room
  after a REST round-trip and is gone once the player moves on. Its three slots
  (`[left][centre][right]`) take only carried items; the REST chest is out of reach.
- **In code:** `ForgeSystem` (`src/systems/ForgeSystem.js`) with its own
  `CraftingSystem(game, { forge: true })`; `room.dragonForge = { col, row }`; drawn by
  `rendering/effects/DragonForgeDraw.js`.
- **Not:** the REST Combine Station; the Fireplace or other hut stations; a forge anywhere else.

### Tinder
- **Definition:** A Stick lying on the ground that a blade swing has split into a small pile
  (`⋀`). It sits in its cell until fire touches it (a torch or fire-weapon hit, a Fire Trap,
  spreading flames), and then it becomes a campfire that is always lit and works as a Fireplace,
  the same as the C-room campfire.
- **In code:** `TinderSystem` (`src/systems/TinderSystem.js`); `BACKGROUND_OBJECTS['⋀']`. Once
  lit, the object becomes `'!'` with `isCampfire` + `burning`, which `FireplaceSystem` reads.
- **Not:** the Stick ingredient (`|`) itself; a Fire Trap; kindling fed to a Fireplace.

### Lantern
- **Definition:** A Torch in a metal cage (`♁`, Torch + Metal). It does everything a Torch does
  (lights Maze torches and dungeon torch triggers, burns on hit, glows while carried, counts at a
  Fireplace) and one thing more: it stays lit underwater, where a Torch goes out. Carried in any
  quick slot, it widens an underwater Room's dark from about one cell to five.
- **In code:** `ITEMS['♁']` (`weaponSubtype: 'torch'`, `lightsUnderwater: true`); every torch
  read checks `weaponSubtype === 'torch'`, never the name. The underwater radius is
  `underwaterFogRadius` / `isLightingUnderwater` in `torchLight.js`, for a Room flagged
  `underwater`.
- **Not:** a light source of its own kind (no Lantern-only mechanic outside underwater); the
  Fire Berry's passive glow.

### Quick slot
- **Definition:** A persistent equipped-item slot shown in the top status bar. Persists across
  REST.
- **In code:** the QUICK SLOTS segment of the single-line status bar.
- **Not:** "hotbar", "inventory slot" (Inventory is the full bag, lost on death in EXPLORE).

### Starter Weapon
- **Definition:** The weapon an unlocked character's loadout starts with in quick slot 1,
  granted once per run, the first time that character becomes active. Every Starter Weapon
  must have a crafting upgrade path. The Gold Hero has none: a run still opens unarmed.
- **In code:** `CHARACTER_TYPES[type].starterWeapon` (item char); seeded by
  `createCharacterLoadout()` in `characterLoadout.js`.
- **Not:** "default weapon", "starting item", "loadout" (a Loadout is all three quick slots).

### Satchel
- **Definition:** The bundle of starter ingredients (`ට`) lying in REST at the start of a run.
  SPACE beside it bursts it and scatters what was inside; TAKE and TAKEALL burst it from anywhere in REST
  and take what was inside. LOOKHERE lists it (YOU SEE A SATCHEL) until it is opened.
- **In code:** `game.restBundle` (`{char, position, chars}`); burst by
  `LootSystem.scatterRestBundle()` (SPACE, range-checked) or `LootSystem.burstRestBundle()`
  (any range; TAKE and TAKEALL via `TakeAllSystem`).
- **Not:** "rest bundle", "starter pack". Not the Monkey's stolen satchel (ThiefMechanic loot).

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

### Mist Battle
- **Definition:** The true ending, triggered when the third character is lost to the gray
  mist. Two acts: Act 1 is a controlled final battle in which the player fights mixed waves
  with all three lost characters at once as the Trine; after a brief delay, Act 2 has the three
  fight each other with no player input, last one standing → credits.
- **In code:** `MistBattleSystem` (Act 1 only, reachable today from the CheatMenu BOSSES entry
  via `CheatWarpSystem.handleMistBattleTest`). Fed by `game.graySnapshots` /
  `game.lostCharacters` from `GrayZoneSystem`; the mist-out → Mist Battle wiring and Act 2 are
  not built.
- **Not:** a Boss fight; the mist-out itself (the per-character loss at gray depth 10).

### Trine
- **Definition:** The three-body formation the player controls in the Mist Battle's Act 1: the
  Primary at the apex, pointing where the Primary faces, with a Flank behind on each side. The
  three share one attack direction, swap weapons together, and roll together.
- **In code:** `MistBattleSystem.members` (clockwise ring; `primaryIndex` is the apex), formation
  slots `FLANK_BACK` / `FLANK_SIDE`; drawn by `drawTrine` (`src/rendering/effects/TrineDraw.js`).
- **Not:** a party or companion group (every body is a full `Player`); "triad" (that word
  belongs to the Power of Three's experience/instinct/convention).

### Primary
- **Definition:** The Trine body the player is directly controlling, at the apex. Only the
  Primary throws, drops, picks up, or uses consumables, and the HUD and equipped gear are its.
- **In code:** `game.player` points at the Primary's `Player`; `MistBattleSystem.primary`.
  Global gear (`inventorySystem.equippedArmor` / `equippedConsumables`) mirrors it.
- **Not:** "Lead" (a Lead is the hole a Breach punches in the frozen lake); "leader".

### Flank
- **Definition:** Either of the two Trine bodies behind the Primary. A Flank mirrors the
  Primary's attacks and rolls with its own weapons and roll type, drifts back to its formation
  slot, and is hit and targeted by enemies like any character. A Flank that falls leaves the
  Trine.
- **In code:** `MistBattleSystem.flanks()` (living non-Primary members); enemy hits resolved in
  `MistBattleSystem.resolveCombat`; enemy targeting in `EnemyUpdateSystem._selectTarget`.
- **Not:** a Companion or NPC; a follower that acts on its own.

### Rotate
- **Definition:** Changing the Primary: double-tap SPACE and the Trine turns one step
  clockwise, so the back-left Flank becomes the Primary at the apex. A fallen Primary is
  replaced the same way, automatically.
- **In code:** `MistBattleSystem.tryRotate()` (double-tap window `ROTATE_DOUBLE_TAP`), `rotate()`,
  `_promote()` (repoints `game.player`, swaps gear).
- **Not:** a character switch at REST; turning to face a new direction (the apex follows facing
  without a Rotate).

### Dragon Spirit
- **Definition:** The passive consumable (Fire Essence + Scale, either order) that calls up
  the Echo while it is equipped in a consumable slot. It never triggers and is never spent;
  unequipping it sends the Echo away.
- **In code:** `ITEMS['ᛝ']` (`passive: true`, `dragonSpirit: true`), read by
  `DragonSpiritSystem.isEquipped()` from `inventorySystem.equippedConsumables`.
- **Not:** a drunk or timed buff; the Fire Essence or Scale ingredients themselves.

### Echo
- **Definition:** The player's twin, called up by an equipped Dragon Spirit: it stands one cell to
  the side of the player's facing and fires every mirrorable weapon a second time from its own
  spot. It shares the player's HP: an enemy attack landing on it hurts the player and breaks
  it, and a broken Echo returns when the player enters REST. Enemies never target it.
- **In code:** `DragonSpiritSystem` (`isEquipped()` / `broken` / `present`, the `carrier` its attacks
  are built from); drawn by `drawEcho` (`src/rendering/effects/EchoDraw.js`). Mirrors through
  `src/systems/mirroredWeapon.js` (`canMirror`), the same shape as a Flank.
- **Not:** a Flank (no body or HP of its own, never part of the Trine); a Companion.

### NPC
- **Definition:** A non-hostile character that inhabits NEUTRAL rooms and interacts with the
  player through dialogue or errands. Each NPC has a unique archetype and role.
- **In code:** base class `NeutralCharacter` in `src/entities/NeutralCharacter.js`; subclasses
  include `Leshy`, `Rusalka`, `Witch`, `Fisherman`, `WiseFellow`, `Fairy`, and others. Defined
  in `src/data/neutralRooms.js`; spawned via `NeutralRoomSystem`.
- **Not:** an Enemy (NPCs are non-hostile); not a Companion (NPCs don't follow the player).

### Jeweler
- **Definition:** The NPC (`J`) who makes Gem Necklaces and the Rainbow Necklace from the
  player's gems and coins, without a String. First found collapsed in the J Room, begging
  for water. A Bottle of Water or a Health Potion refreshes them for the rest of the run, and
  from then on they sit beside the Shopkeeper in every Settlement.
- **In code:** `Jeweler` (`src/entities/Jeweler.js`, a `NeutralCharacter`). The water hand-off
  and wares modal are in `JewelerSystem`; the wares are `JEWELER_WARES` and the accepted drinks
  `JEWELER_DRINKS` (`src/data/jewelerWares.js`); the overlay is `JewelerOverlay`. Run flag
  `game.jewelerRefreshed` (Reset Registry, `run` scope). Settlement seat: the `shopkeeper`
  branch of `HutSystem.generateHutInterior` (`behindCounter: true`).
- **Not:** the Shopkeeper (fixed necklace wares that never sell out, paid partly in gems); not a
  Gravejumper, which is the enemy that shares the `J` glyph.

### J Room
- **Definition:** The yellow-only exit letter `J`: an enemy-free clearing where the parched
  Jeweler lies. Once the Jeweler is refreshed, J is retired for the run. It is never rolled
  again, and the Sword of the Letter skips it.
- **In code:** `EXIT_LETTERS.J` (`roomType: 'JEWELER'`), `ROOM_TYPES.JEWELER`,
  `generateJewelerRoom` (`src/systems/roomFeatures.js`), template `LETTER_TEMPLATES.J`.
  Retirement is `isLetterRetired` (`src/systems/ExitSystem.js`), read by
  `getLetterWeightsForZone` and `cycleExitLetter`.
- **Not:** a Settlement (S); the J Room has no huts.

### Dig
- **Definition:** A tamed rat with no target walks to a nearby mud tile and digs it for 3s.
  The dig has a 20% chance to unearth one plant Ingredient (Root, Leaf, Herb, Stick, Sap).
  Each tile can be dug once. A hostile coming into range ends the dig.
- **In code:** `NPCRat` state `'dig'` (`_updateDig`, `DIG_*` constants);
  `BackgroundObject.ratDug` marks a dug tile; `CompanionSystem.updateTamedRats` spawns the find.
- **Not:** a harvest (no tool, no player action); not an Enemy State (NPCRat has its own FSM).

### Boss
- **Definition:** An Enemy that appears at a zone-specific depth threshold and must be defeated
  to progress deeper. Bosses have enhanced drops (guaranteed Mana) and special behavior.
- **In code:** `isBoss` flag read off the instance first, shared data second
  (`enemy.isBoss || enemy.data?.isBoss` — #215). Set on the instance by the roomFeatures boss
  spawn paths; the Centipede head ships its own data object with the flag. Checked via
  `ZoneSystem.isBossReady(zone, depth)`; room type `BOSS_ROOM` generated when conditions are
  met. Boss-spawned enemies carry `isBossEntity` flag.
- **Not:** just a difficult Enemy; a Boss is a gated milestone tied to zone depth. Not a
  Dungeon Boss (interior encounter, own system) or a Miniboss (`BOSS_ENCOUNTERS` B-room
  variant).

### Boss Phase
- **Definition:** A Boss's HP-threshold escalation tier. Every zone Boss has one or more; the
  Storm Eye's three phases run the same patterns, faster each time.
- **In code:** `bossPhase` (1-based) on the Boss entity, mirrored on `BossSystem.bossPhase`. The
  Storm Eye crosses at 66% / 33% HP (`StormEye._checkPhase`), grants 0.6s i-frames, and scales
  every step's timer by `PHASE_TIME_SCALE` and field spin by `PHASE_REVOLUTION`.
- **Not:** an Enemy State (Bosses run their own cycle outside the State spine), and not the
  Mist Battle's Acts.

### Storm Eye
- **Definition:** The yellow zone Boss (⛯, a Kracko reference): an eye inside a living storm
  that cycles through Storm Forms. Its glyph carries the personality — an impatient sine wobble
  around its root, a mood windup per form, and ⛭ (pupil turned white) while it channels.
- **In code:** `src/entities/StormEye.js` (Enemy subclass, `state = 'boss'`, `isBossEntity`);
  `BossSystem.stormEye`; arena from `roomFeatures.stampStormEyeArena` (`room.calmWind`).
  Cycle step is `cycleStep` = `'windup' | 'attack' | 'calm'`.
- **Not:** Pandora's Box (the affinity-rotating yellow boss it replaced, 2026-10-08), and not
  the ambient Sandstorm.

### Storm Form
- **Definition:** One of the Storm Eye's four attack identities, drawn at random with no
  immediate repeat: **Cyclone** (swirl; core contact strips all equipped gear and the wind
  carries it), **Gale** (sweeping gust cone; pillars cast a wind shadow), **Thundercloud** (the
  eye rises, trails the player, and strikes underneath), **Black Hole** (suction a dodge roll
  doesn't escape; core contact hits and flings).
- **In code:** `stormEye.form` = `'cyclone' | 'gale' | 'thundercloud' | 'blackHole'`
  (`StormEye._pickForm`).
- **Not:** a Boss Phase — every form appears in every phase.

### Calm
- **Definition:** The Storm Eye's vulnerable window after each Storm Form's attack, when its
  wind dies. The only time it takes damage; each form signals it in its own way.
- **In code:** `stormEye.cycleStep === 'calm'`; `StormEye.vulnerable` (calm, not `aloft`, no
  i-frames) gates `takeDamage`.
- **Not:** Recover (the Enemy State) — Calm is the boss-cycle analogue, outside the State spine.

### Wind Field
- **Definition:** A local, transient force source — swirl, gust, or suction — that pushes the
  player, enemies, floor items and projectiles, drawn as motes that follow the same shape.
  Simplified analytic forces, not a fluid sim.
- **In code:** `src/systems/WindFieldSystem.js`, owned by `BossSystem.windFieldSystem`
  (`setField(id, spec)` / `forceAt` / `pushProjectile`); motes drawn by the `windField` Frame
  Pass. A `rollProof` field still pushes a rolling player. Entities flagged `aloft` (the
  Thundercloud) are over shots and swings.
- **Not:** the Sandstorm (`SandstormSystem` — one room-global direction, pushes only player and
  enemies); a `calmWind` room switches the Sandstorm off.

### Freeze-Over
- **Definition:** The one-shot event that flips the cyan boss arena into its second phase. The
  Frosted Maw runs its own ice-hammer thaw backwards, freezing every water tile on the lake
  permanently and raising a closed ring of Hummocks around the shoreline. The player is left
  standing on the sheet with no exit.
- **In code:** armed at `LAKE_BOSS_PHASE2_HP_THRESHOLD` (40% HP) by
  `BossSystem._checkLakePhaseTransition()`; carried as the payload of the next hammer slam
  (`LakeBoss.pendingFreezeOver`). Fires the existing ice shockwave with `mode: 'freeze'`, then
  `_raiseHummocks()` and `LakeBoss.transitionToPhase(2)`.
- **Not:** an ordinary freeze status effect, and not reversible — the sheet never thaws on its
  own. Declines to fire if the player is standing on land (that would cage them out of the
  arena); the boss stays armed and tries again.

### Stalk
- **Definition:** The Frosted Maw's phase-2 pursuit. The boss tracks the player's live position
  from beneath the frozen sheet, visible only as a shadow under the ice. Replaces phase 1's
  random surfacing — you cannot Anticipate a coin flip.
- **In code:** `LakeBoss` state `'stalking'`, `_updateStalking()`. Moves at `STALK_SPEED`
  toward the player each frame; ends on proximity (`BREACH_RANGE_SQ`) or `STALK_TIMEOUT`.
  Untargetable throughout, via `LakeBoss.isSubmerged()` — the one predicate the renderer (no
  body, just a shadow), `getHitbox()` (nothing to connect with), and the i-frames all read, so
  they cannot drift apart.
- **Not:** an Enemy State. `LakeBoss` is a bespoke entity that does not run
  `EnemyStateMachine`, so `stalking` does not extend the closed State set below.

### Frost Lunge
- **Definition:** How the Ice Wraith closes on a player it could never catch at float speed.
  From 2–6 cells away, with the player in its vision cone (or from any facing once it has been
  hit), it holds still for a beat, looses a **Frost Line** straight at the player (the Wraith's
  damage plus one freeze pip), then rushes them. Reaching attack range mid-rush latches it
  through the ordinary sap.
- **In code:** `src/entities/enemyMechanics/FrostLungeMechanic.js`, configured by
  `ENEMIES['X'].frostLunge`. `frostLungePhase` is `'idle'`, `'windup'` or `'lunge'`. The Frost
  Line is an `enemy_projectile` carrying `statusOnHit: 'freeze'`, which CombatSystem applies.
  Stun, freeze, zap, sleep and knockback call `FrostLungeMechanic.interrupt()`.
- **Not:** an Enemy State; the phases run inside the mechanic and suspend the rest of the AI.
  Not a Charge either: it homes on the player the whole way instead of committing to a line.

### Breach
- **Definition:** The Frosted Maw crashing up through the ice at the player's feet — its whole
  bulk erupting through the floor the player is standing on. Crushes everything within
  `BREACH_RADIUS` (the boss's own half-width plus a cell) for heavy damage, throwing shattered
  sheet outward. A held telegraph precedes it: this is the anticipation window the zone's verb
  asks for, and the attack is meant to be avoided rather than absorbed.
- **In code:** `LakeBoss` state `'breaching'`, `_updateBreaching()` / `_fireBreach()`.
  `BREACH_TELEGRAPH` counts down while `BossRenderer._drawBreachTelegraph` spreads cracks over
  the exact disc, then a `BREACH_DAMAGE` crush box covering the full disc fires alongside two
  staggered rings of zero-damage debris, and a Lead opens across the same radius. Leaves the
  boss Surfaced, enraged, and vulnerable across the water it just opened.
- **Not:** the phase-1 hammer slam, which lands where the boss surfaced rather than where the
  player is standing, and which is a narrow jaw clamp rather than a disc.

### Lead
- **Definition:** The hole a Breach punches in the frozen lake (the polar term for a fissure in
  pack ice). Opens across the full `BREACH_RADIUS`, so it is exactly as wide as the destruction
  the player just watched. Leads never close, so every Breach permanently removes floor — the
  depleting sheet is phase 2's clock. Because a Breach lands on the player, the player authors
  the erosion pattern.
- **In code:** `BackgroundObject.isLead`, set by `BossSystem._openLead()`. Permanence is
  enforced in `BackgroundObject.setWaterState`, which refuses `'frozen'` on a Lead — freezing
  has seven entry points, including the boss's own ice stream, and the guard has to sit at the
  funnel or the boss repairs the floor it is destroying. Thawing a Lead is still allowed.
- **Not:** a Pond or an Aquifer; a Lead is combat-time damage to a frozen surface, cleared with
  the rest of the arena when the boss dies.

### Hummock
- **Definition:** A wall of piled broken ice (the polar term). Raised along the whole shoreline
  by the Freeze-Over to cage the player on the lake for the rest of the fight.
- **In code:** Background Object `'"'` in `BACKGROUND_OBJECTS`; solid and indestructible.
  Placed by `BossSystem._raiseHummocks()`, which replaces any non-solid shoreline decoration
  standing in the ring so the cage is closed, and torn down by `_clearLakeArena()` on defeat.
- **Not:** a Ridge — that name belongs to `RidgeSystem.js`. Not permanent terrain either; a
  Hummock exists only for the duration of the encounter.

### Maw Shadow
- **Definition:** The Frosted Maw seen only as darkness moving beneath water or ice. Two rooms
  show it: the Aquifer's cyan lake arena, where it drifts until a fishing cast wakes the real
  Boss, and the cyan Ascent, where it drifts under the frozen pond and erupts every few seconds:
  the ice above it shakes, breaks to open water, and a cone of freeze shots flies at the player.
  It vanishes when the Ascent is cleared.
- **In code:** Drawn by `drawSubmergedShadow()` (`AscentRenderHelpers.js`), the same darkening
  the submerged Lake Boss uses. Aquifer arena: `room.mawShadow`, driven by `MawShadowSystem`.
  Ascent: `room.ascentIce.mawShadow`, driven by `IceAscentSystem`. The Ascent's Shadow is kept
  off `room.mawShadow` on purpose, because that field is what `FishingSystem` wakes into the
  Boss fight.
- **Not:** an enemy; it has no hitbox and cannot be damaged. The holes it breaks are not Leads.
  They are plain water that any freeze can close again.

### Slope
- **Definition:** A terrain cell that pushes anything standing on it downhill in one cardinal
  direction, drawn as an arrow glyph (`ʌ v < >`). Slopes are how the Ascent reads height: a belt
  of Slopes facing outward is a plateau, and a ring of Slopes facing inward is a Pit.
- **In code:** `BackgroundObject.slope` + `slopeDirection`, built by
  `roomFeatures.makeSlopeTile()`. The push is a constant `SLOPE_ACCEL` in `PhysicsSystem`.
  `stampSlopeBelt()` lays the plateau belt, and `stampPit()` lays a Pit's ring.
- **Not:** the yellow zone's river Current, which also pushes but is water.

### Pit
- **Definition:** Low ground ringed by inward Slopes. Projectiles in flight pass over anyone
  standing in a Pit, so a Pit is cover: drop in to let a volley pass, then step out to shoot
  back. The cover works both ways, so an enemy in a Pit is also safe from the player's shots.
  It does not apply to a shot fired from inside the same Pit as its target, and melee always
  reaches into one. A shot's height is fixed when it is fired: moving after the trigger does
  not change what it sails over. The cyan Ascent has three; the Sniper fight is meant to
  reuse them as bunkers.
- **In code:** `room.pits = [{ col, row, radius }]`, stamped by `roomFeatures.stampPit()`.
  Membership and the pass-over rule live in `src/systems/pits.js` (`pitAt`, `pitOf`,
  `tagLaunchPit`, `projectileSailsOver`). Every launch site stamps `proj.launchPit`;
  `CombatSystem` consults the rule in both projectile-hit loops.
- **Not:** a Sinkhole or any hole you fall into. A Pit is walkable floor; it is only lower.

### Dungeon Boss
- **Definition:** A Layer-2 boss encounter fought inside a Dungeon interior — the delve-capper,
  not a depth-gated surface Boss. Every Dungeon Boss is a three-phase fight whose windows key
  to its zone's Legend-of-Three triad, capped by a temptation finale won by refusing, carrying
  one Game Changer. New zones author data + art, not new systems. The green Dungeon Boss is
  the Hoardmaw.
- **In code:** `DungeonBossSystem` (orchestrator) + per-zone spec in
  `src/data/dungeonBosses/*.js`; composite body entity + dedicated renderer, like the zone
  bosses. The body rides `floor.enemies`, so the Dungeon interior loop is its sole driver and
  CombatSystem hit-tests it like any other enemy; the orchestrator is a pure consumer and
  never ticks the body itself (bug #216). That loop runs on double-seconds, so the entity
  converts once at its own `update()` boundary and its constants stay authored in real
  seconds.
- **Not:** a Boss (surface, `BossSystem`, depth-gated) or a Miniboss (`BOSS_ENCOUNTERS`
  B-room encounter).

### Toss
- **Definition:** Throwing the armed consumable as a ground pickup: keys 4–8 arm a slot, SHIFT
  press begins the throw charge, release flings the item. The staging gesture — pre-laying
  coins beside a seam or bread along a lane before a fight. Tossed items persist on dungeon
  floors for as long as that Dungeon lasts — its D-room, REST round trips included — and wipe
  when a new room replaces it (staging is per-Dungeon effort; the no-persistence law holds).
- **In code:** `TossSystem.startToss()`; charge rides TrapSystem's drop-throw pipeline ('drop'
  mode extended with a source descriptor naming the armed slot). Lands via the standard
  pickup path with its cooldown. Weapon-held SHIFT behavior (drop) is unchanged — the Toss
  exists only with hands free.
- **Not:** the held-item SHIFT drop; a trap deploy (that's SPACE); the Gold Breath coin
  discharge (which reuses the same gesture while cursed).

### Gold Breath
- **Definition:** The Hoardmaw's one-shot curse, exhaled at the Scaled→Glinting transition and
  lasting until the kill. Every consumable quick slot renders `c` wired to the coin tally —
  the slots become coins. SPACE and SHIFT each discharge one coin (throw arc, lands as a
  pickup); consumable use is suspended — your remedies are hoarded too. Stated consequence,
  deliberate.
- **In code:** `game.goldBreathCurseActive` — the contract flag quick-slot rendering
  (`MenuSystem`) and the input consumers (`ConsumableTriggerSystem.fireSelected`,
  `DungeonSystem.handleShiftPress`) read; `DungeonBossSystem.dischargeCoin()` performs the
  discharge. Cleared on defeat and on delve reset.
- **Not:** a damage effect; it gilds nothing itself (companion Gilding triggers on vault
  arrival — one theme, two faces of Greed).

### Gilded
- **Definition:** The HP-less companion state granted on vault arrival: damage intake is
  skipped, death checks are bypassed, and the render turns gold-tinted. Lasts the rest of the
  delve only and reverts on dungeon exit; the surface taming economy is untouched. In-fight,
  gilded companions elevate: the crow dive-pecks the true glint, the rat gnaws the tongue
  root. Solo arrival stays fully viable — a soft bonus, never a gate.
- **In code:** `gilded` flag on companion entities, set at vault floor activation, reverted on
  dungeon exit alongside the collision-map restore; contributions cadence-limited in
  `DungeonBossSystem._tickCompanionElevation`. Pets descend mortal — Gilding is earned by
  escorting them to the vault alive.
- **Not:** player invincibility; a permanent state; a scope beyond dungeon floors (hut/maze
  unchanged — the maze Ghost economy is deliberately pet-free).

### Game Changer
- **Definition:** The rule-bending state each Dungeon Boss earns: the delve itself pays for it,
  reshaping the fight's contract. Green's is twofold — mortal→Gilded escorts, and the
  slot-cursing Gold Breath. Yellow/red/cyan changers are Open (each zone authors its own).
- **In code:** no shared field by design — each changer is its own mechanism under the
  `DungeonBossSystem` template spine (ambush, registers, refusal finale, payout, companion
  hooks).
- **Not:** a power-up or a phase transition; it bends a rule of the run, it doesn't make the
  numbers bigger.

### Status Effect
- **Definition:** A temporary condition applied to a character (player or enemy) that modifies
  behavior, movement, or damage. Effects have a duration and wear off over time.
- **In code:** one model for both sides — `STATUS_EFFECTS` in `src/systems/StatusEffects.js`
  declares every effect and which carrier (player/enemy) can hold it; `createStatusEffects`,
  `applyStatusEffect`, `tickStatusEffects`, `clearStatusEffect` are shared. Entry point is
  `applyStatusEffect(name, duration, pips?)` on Player and Enemy; carrier-specific layers are
  `StatusEffectSystem.js` (player) and `EnemyStatusEffects.js` (enemy). Examples: `'burn'`,
  `'poison'`, `'wet'`, `'freeze'`, `'stun'`, `'dizzy'`, `'goo'`. Every stackable effect is a
  Pip track, with the same stages on the player and enemies (see Pip).
- **Not:** permanent attributes (like health or stats); a temporary modifier only.

### Pip
- **Definition:** One unit of a Status Effect's strength, capped at 3, and the dot that
  shows it above the character. A Pip track is a Status Effect whose pips escalate it: each pip
  is a stronger tier, and pip 3 is its extreme. Wet: pip 1 = wet, deep water fills pips 2–3,
  pip 3 drowns, and each pip slows harder in water. Freeze: pips 1–2 slow, pip 3 = Frozen.
  Blind (player): each pip closes vision in tighter (6 / 4.5 / 3 cells).
  Zap: pips 1–2 slow, pip 3 = no movement + disarm; the pips are a cooldown (see Zap).
  Poison: each pip ticks faster, and pips drain one at a time. Sleep: pips 1–2 slow, pip 3
  sleeps. Goo: each pip slows harder, never to a stop, and pips drain one at a time.
  Everything else (burn, stun, dizzy, charm) has the default stage: each pip
  multiplies the duration (pip 2 lasts twice as long, pip 3 three times).
  A discrete hit adds one pip; a per-frame source (ice puddle) or an all-at-once hit (freeze
  trap) raises the track to a level instead, so lingering never stacks by itself — except
  goo, where every 2s of unbroken slime contact adds a pip (stepping off restarts the count). Electric
  current is all-at-once: a full-strength source lands at zap pip 3, and each chain link or
  imbued hop lands one pip lower.
- **In code:** `statusEffects[x].stacks` on both sides (`MAX_PIPS = 3`, `StatusEffects.js`);
  wet's deep-water fill is `wetPips`, read through `wetPipCount()` (`StatusEffectSystem.js`); drawn
  by `StatusPipEffects.js` from `computePipRows` / `computePlayerPipRows`.
- **Not:** a resource the player spends or banks; the duration (pips are tiers, the timer is
  separate).

### Frozen
- **Definition:** Pip 3 of freeze: full immobilization (no moving, attacking, or rolling)
  that outlasts every other player status. The player breaks out early by mashing: each fresh
  key press chips time off, a dodge-roll press chips much more, and red's roll press chips
  double. Breaking out clears the whole freeze track. Freeze is cyan, on both sides.
- **In code:** `StatusEffectSystem.isPlayerFrozen` / `struggleLock` (`FROZEN` constants — the
  same struggle frees the player from a zap pip 3 or stun), struggle input read in
  `CharacterSystem._struggleLock`; red's multiplier is
  `frozenRollChipMult` in `characters.js`. Enemy side: `Enemy.isFrozen` (freeze pip 3,
  `isEnemyFrozen` / `FROZEN_DURATION` in `EnemyStatusEffects.js`) and the `frozen` hard
  interrupt in `EnemyStateMachine.INTERRUPTS`. Enemies can't struggle, so they thaw on the timer.
- **Not:** the freeze slow tier (pips 1–2); an Enemy State (it's an interrupt that preempts
  the current State without replacing it); Freeze-Over (the Lake Boss's permanent sheet).

### Zap
- **Definition:** The electric Status Effect, on the player and enemies alike — like stun, but
  its own debuff. A Pip track: pips 1–2 slow, pip 3 stops the body and disarms it (the held item
  is knocked loose). The pips are a cooldown: once zapped, a body can't be zapped again until
  they drain — the hit's pip lasts its duration, then one pip drains per second, and effects
  follow the current pip (3 → 2 → 1 → clear). Full-strength current —
  an electric weapon hit, the Stun Trap, the Tesla Coil, a charged object, electrified water, the
  electric wire — lands at pip 3; a chain carries one pip less per link (chain lightning 3 → 2 →
  1, then damage only; water conduction from a struck object lands at 2). Wet holds zap's timer:
  as long as the body stays wet out of the water, zap endures. Standing in water grounds it — the
  zap drains normally there. A zapped body is not a source: it doesn't electrify the water it
  stands in or shock what touches it. The player
  struggles out of zap pip 3 the same way as Frozen (down to pip 2, still draining); enemies wait
  it out. Zap is yellow, on both sides.
- **In code:** `statusEffects.zap` (`StatusEffects.js`, `ZAP_PIP_SPEED`, `ZAP_PIP_DECAY`, the
  slot's `cooldown` flag); enemy `Enemy.isZapped`
  + `shouldDropItems`, player `Player.isZapped` / `isLocked` + `StatusEffectSystem.applyPlayerDisarm`
  / `disarmPlayer`. Item data spells an electric weapon `onHit: 'stun'` + `electric: true`; the
  hit applies `'zap'`. Electric-affinity enemies are immune (they generate current).
- **Not:** plain stun (no electricity, no pips, not held by wet); the Stun Trap
  (a source of zap, named for its effect).

### Imbue
- **Definition:** A timed element — electric, ice, or fire — an enemy takes from its surroundings
  and holds for a fixed duration (10s on the Giant Slime), then loses. While imbued the enemy
  takes the element's affinity, recolors, and its contact lands that element's pip 1 in place of
  its normal contact effect. Electric comes from any zap (the zap is absorbed as the Imbue instead
  of the normal shock reaction); ice and fire come from landing in an Imbue Pool. An Imbue never
  refreshes and never swaps element until it runs out.
- **In code:** opt-in via enemy data `imbue: { enabled, duration }`; per-instance
  `enemy.imbue = { element, timer }`; `applyImbue` / `absorbsZap` in
  `src/systems/ImbuePoolSystem.js`; the element joins affinities through `Enemy.getAffinities()`.
- **Not:** a zap (a status on the body, not an element it holds); an affinity (permanent, authored on
  the enemy's data).

### Imbue Pool
- **Definition:** One of the three pools in yellow's Giant Slime B room — electric (a lightning
  rod on bare ground, no water; the room is always a thunderstorm), ice, and lava. A hit on an un-imbued Giant
  Slime sends its counter-leap into a random intact pool, and landing there grants the pool's
  Imbue. The ice pool breaks under the landing and freezes over again shortly after; it can't be
  picked while broken.
- **In code:** `room.imbuePools = [{ element, tiles, center, brokenTimer }]` and
  `room.lightningRod`, seeded by `seedImbuePools` (`roomFeatures.js`); pool choice and landing in
  `ImbuePoolSystem` (`leapPoolTarget` → `LeapAttackMechanic`).
  The electric pool has no tiles (`tiles: []`): only the strike imbues, and there's no water to
  soak the slime. The ice pool's tiles carry `imbuePoolIce`: broken, their water doesn't soak an
  Imbue-capable slime (PhysicsSystem), though it still wets anyone else.
- **Not:** ordinary water, ice, or lava tiles elsewhere (they don't grant an Imbue by landing).

### Companion
- **Definition:** A persistent non-player character that follows the player across rooms and
  states. Companions offer passive support and interact with the environment.
- **In code:** managed by `CompanionSystem`; currently crows (`companionCrows`, `followerCrows`);
  also tamed rats (`tamedRats`, fed via Feed); also golems (`golems`, summoned by
  combining an ingredient with Mana at the REST Combine Station — see `src/data/golems.js`).
  State lives on `game`; logic in `src/systems/CompanionSystem.js`.
- **Not:** an Enemy; not an NPC (Companions don't initiate dialogue).

### Steering
- **Definition:** How a Companion, an NPC or a Spell-driven player (FIGHT, CHOP/MINE/HARVEST) moves toward a point. It
  walks straight while the line there crosses only open ground. Otherwise it takes the
  cheapest route over the ground, weighing each cell the way PhysicsSystem slows a body in it
  (trees, grass, mud, water, snow) and going around walls and solid objects. A hazard (lava,
  unless the body is lava-immune or floats; deep water, unless it can't drown) is a wall to
  the route, as Lava-Shy makes it for an Enemy. A target only reachable through a hazard is
  waited for at the nearest safe cell (the shore). Stuck detection commits to a short detour
  when something the ground doesn't show holds the body in place. Every Companion movement
  steers: following, chasing, backing off, fleeing and digging.
- **In code:** `src/systems/npcSteering.js` — `steerToward()` (writes velocity),
  `steerHeading()` (heading only, for a body whose velocity comes from elsewhere: a driven
  player's held keys, turned into WASD by `HeldKeySteering` in `src/systems/heldKeySteering.js`,
  which also eases a stalled player onto the cell grid). The ground is `src/systems/steeringTerrain.js` — `buildTerrainGrid()` (cell costs,
  `BLOCKED`, `HAZARD`), `lineWithin()` (swept-box line test), `planRoute()` (A*).
- **Not:** Enemy navigation (`EnemyPathfinding.computeNodePath` + `enemyVision`); not a
  Beeline (which phases through everything).

### Spell
- **Definition:** A word the player types and confirms with SPACE (or Shift/Enter) that the
  THREE answers or acts on. Adventure-style verbs are compound words with no spaces (GOWEST,
  LOOKHERE), at most 9 letters; when one typed word ends in several Spells, the longest wins.
  A Spell either answers in the THREE's voice, acts silently, or refuses with a terse line.
  Some are discovered through gameplay (`knownSpells`); most are always available. Release
  scope and grammar (including glyph targets such as LOOKR): `claudedocs/spell-catalogue.md`.
- **In code:** `SPELLS` registry in `src/data/spells.js` (`response` string/fn/`null` for a
  silent cast, optional `action`, `followUps`, `followUpsActive`); matched by `SpellSystem`
  against `game.keyBuffer`, scanning suffixes longest-first. Learned Spells tracked in the
  `game.knownSpells` Set. Each Spell routes to the system that owns the action (e.g. GO/HEAD →
  `BeelineSystem`).
- **Not:** a Crafted item; never equipped. Not a "command" — that word belongs to
  `CommandSystem` (the CALL/COMMAND true-name charm). Not gem-wand magic (`MagicSystem`).

### Recipe Sign
- **Definition:** A Recipe written in dark gray in the earth as `X + Y = Z`, hidden inside a
  grass cluster and only seen once the grass is cut. Plain glyphs, no cipher. 13% of rooms
  with grass.
- **In code:** `room.recipeSign = { recipe, characters }`, written by `generateRecipeSign`
  (`src/systems/roomSigns.js`), drawn on the background layer by `ExploreRenderer`.
- **Not:** a BackgroundObject (water, fire and physics never touch it), and not a Spell Sign.

### Spell Sign
- **Definition:** A Spell word written in dark gray in the earth in the Greek cipher, hidden in
  grass the same way as a Recipe Sign. Wearing the Spectacles (⊙) shows it in English. It names
  the Spell outright. Rolls on its own at half the Recipe Sign's chance (6.5%), so it never
  changes how often a Recipe Sign appears, and the two never share a cell.
- **In code:** `room.spellSign = { spell, characters }` (glyphs stored Greek), written by
  `generateSpellSign` (`src/systems/roomSigns.js`) from `SPELL_SIGN_SPELLS`
  (`src/data/spells.js`: LOOKHERE, TAKEALL, GOREST, HARVEST, FIGHT). `ExploreRenderer` decodes
  it through `spectaclesTransform` and repaints the background when the Spectacles go on or
  off.
- **Not:** a maze cover (one ciphered ingredient letter). Never holds EXITGAME, CLOSEGAME or
  CLOSE.

### Beeline
- **Definition:** An invulnerable rapid run, leaving a trail, from where the player stands to an
  open exit, cast by GO/HEAD <direction> and by ESCAPE/FLEE; ENTER (nearest door of any kind), EXIT (out of the current hut, Cavern or Maze),
  ENTERHUT/EXITHUT,
  ENTERCAVE/EXITCAVE and ENTERMAZE/EXITMAZE run it to a hut, Cavern or Maze door and go through
  on arrival (ENTERHUT picks the nearest hut that would let the player in, or an opened Cavern
  when the room has no hut); OPENCAVE runs it to the Bombable Rock hiding a Cavern and breaks it
  with a carried Sledgehammer, Onyx Hammer or bomb; TALK runs it beside the nearest speaker
  and tells their next line on arrival. It runs in one straight line,
  phasing through walls and Background Objects alike, and ends in the exit lane so the normal
  exit warp takes over.
  Refused when the exit is shut or a Barricade still stands across that exit's lane, solid or
  passive (lava). ESCAPE/FLEE first drops every weapon at the player's feet, which opens the
  way back to REST, then Beelines south; going to REST deletes whatever the player dropped or had knocked loose
  (`Item.droppedByPlayer`, filtered out in `saveExploreRoomState`).
- **In code:** `src/systems/BeelineSystem.js` — `cast(direction)`, `escape()`, `enter()`, `exit()`, `enterHut()`/`exitHut()`
  (via `HutSystem.roomHuts`/`canEnter`/`enterHut`/`exitHut`), `enterMaze()`/`exitMaze()` (via
  `MazeSystem.exteriorDoorCell`/`enterMaze`/`exitMaze`), `enterCave()`/`exitCave()`/`openCave()` (via
  `CavernSystem.hiddenDoorCell`/`openingForce`/`openHiddenDoor`), `isActive()`
  (drives the dodge trail in main.js), `reset()` (Reset Registry, room scope). Exit openness
  via `ExitSystem.isExitOpen`; Barricade check via `BarricadeSystem.standsAcross`; the drop via
  `TrapSystem.dropLoadout`; the run is an `AnimationSystem` sequence (`_animLock` = no damage).
- **Not:** a dodge roll (player-steered, brief, no pathing); not a "dash" or "auto-run".

### Punch
- **Definition:** The attack SPACE makes in EXPLORE with no weapon held, or with a spent one
  in hand (a trap with no charges left, a gun or bow out of ammo that never reloads): 1 damage at 50%
  accuracy (a miss shows MISS), thrown with the Slime's windup, cooldown and one-cell blinking
  Telegraph, in yellow. Skips Background Objects and a Maze's cover objects (an unarmed SPACE
  beside one interacts instead; a cover object still recovering from a hit swallows the press rather
  than letting a Punch through). Not thrown at REST or in NEUTRAL rooms.
- **In code:** `src/systems/PunchSystem.js` — `tryPunch()` (spent check: `Item.isSpent()`), `update(dt)` (the windup on the
  enemy-melee clock, read straight off `ENEMIES.o`), `reset()` (Reset Registry, room scope).
  The landed blow is a player melee hitbox via `CombatSystem.createAttack` with `accuracy`
  (rolled per swing as `attack.missed`), `telegraphDrawn` and `isPunch` (MazeSystem's cover-object
  hit pass skips it). Drawn by the `punches` Frame Pass.
- **Not:** a weapon or Item; not "unarmed attack" / "fist" / "melee strike".

### Fight
- **Definition:** The auto-combat cast by the FIGHT Spell: the player is driven toward the
  nearest fightable enemy (alive, revealed, not aloft, not charmed, same plane) and attacks it
  with whatever is held (the Punch when nothing is), re-targeting as enemies fall, until none
  are left or the player next presses a letter, SPACE, Shift or Enter. A gun or bow shoots from range and moves between shots: a dodge roll
  across the line of fire when the target is within 3 cells, a sidestep otherwise, and a
  back-away to shooting range while the weapon reloads. When the player stops making progress
  (beside a one-cell gap) it is eased onto the cell grid. Damage still lands. EXPLORE only.
- **In code:** `src/systems/FightSystem.js` — `cast()`, `heldKeys()` (Steering via
  `HeldKeySteering` → held WASD, fed to `PlayerInputSystem.heldMoveInput`, so the player walks at
  its own speed), `rollDirection()` (the roll, read by `Game.getDodgeRollDirection` so every
  character's roll applies), `update()` (face + attack, then the move between ranged shots),
  `onPlayerInput()` (main.js keydown), `reset()` (Reset Registry, room scope).
- **Not:** a Beeline (not invulnerable, no animation); not "auto-battle" (that is the Mist
  Battle's Act 2); not a Companion command.

### Harvest (Spell)
- **Definition:** The CHOP, MINE, OPEN and HARVEST Spells: the player is driven, as in a Fight, to
  the open cell beside each farmable object in turn and swings at it with the tool it takes,
  until none are left or the player next presses a letter, SPACE, Shift or Enter. CHOP fells Trees with an axe; MINE breaks
  Rocks (anything with the rock harvest) with the pickaxe or a hammer; OPEN opens each Barrel,
  Chest, Crate and Metal Box by hand from the cell beside it, as SPACE does (no tool, no swing;
  a Tomb is left shut); HARVEST opens the containers first, then does trees and rocks,
  working the material the held tool serves before swapping tools, then cuts the room's Tall
  Grass with any blade, densest cell first, until every blade is cut, then scoops its Sand with
  any melee weapon but a blunt one. Tools come from the quick
  slots. Barricade material, obsidian, indestructible and yield-nothing objects and other
  planes are skipped; a target the player neither nears nor damages for 4 seconds is given up.
  Enemies are not fought; damage still lands. EXPLORE only; `...NOTHING.` with no tool or
  nothing to farm.
- **In code:** `src/systems/HarvestSystem.js` — `cast(materials)` (`container`/`tree`/`rock`/`grass`/`sand`),
  `heldKeys()` (`HeldKeySteering`), `update()` (tool swap via `handleSelectSlot`, swing via
  `CombatSystem.tryUseHeldWeapon`, a container opened via `InteractionSystem.openContainer`), `onPlayerInput()`, `reset()` (Reset Registry, room scope).
- **Not:** the harvest drop itself (`destroyObject:rockHarvest`, the Tree's Stick roll), which is
  the ordinary result of each swing; not a Fight.

### Craft (Spell)
- **Definition:** The CRAFT Spell: crafts one Recipe chosen at random from every Recipe the
  player can make with what is on hand right now: the ingredient pile, coins, meter Mana,
  carried weapons/armor/consumables, and the Item Chest in REST only. The pair is spent and the
  result is claimed as at the REST station; the pair joins the station's pair memory. Forge
  Recipes are never chosen; golem Recipes are skipped at the golem cap. REST and EXPLORE only;
  `...NOTHING.` when nothing on hand makes anything.
- **In code:** `src/systems/CraftSpellSystem.js` — `cast()`; spends inputs via
  `MenuSystem.takeFromInventory` and claims through a scratch `CraftingSystem` sharing the REST
  station's `pairMemory`, then `MenuSystem.claimCenter`.
- **Not:** a tier-up cycle (duplicate-weapon pairs are not Recipes and never roll); not the
  Dragon Forge.

### Take All (Spell)
- **Definition:** The TAKEALL Spell: once the room is safe (no counted enemy, exits open; REST
  always is), every ingredient and item on the player's layer flies to the player and is taken
  on arrival; in REST the Satchel bursts and what was inside flies too. Where a pickup would ask for a slot choice it stows instead: armor and
  consumables into the carried inventory, a weapon or trap into the Item Chest (deferred in
  the field). Unreachable loot stays put: another plane or layer, vault coins (`noGravitate`),
  a full pile, a Cursed scroll. `NOT YET.` while enemies remain or the exits are shut;
  `...NOTHING.` when there is nothing to take.
- **In code:** `src/systems/TakeAllSystem.js` — `cast()`, `update()` (the pull, ticked beside
  `LootSystem.updateIngredientSeparation`); ingredients via `LootSystem.collectIngredient`,
  items via `InventorySystem.tryPickupItem` on a one-item array, then `settlePickup`
  (`src/systems/pickupSettlement.js`, shared with SPACE pickup).
- **Not:** ingredient attraction (the always-on short-range pull); never opens the slot-choice
  prompt.

### Get (Spell)
- **Definition:** The GETLAVA, GETWATER, GETMUD and GETFAIRY Spells: take that liquid or a fairy
  from anywhere in the room the player could walk to, without touching it (lava doesn't burn,
  water doesn't wet). The liquids fill the first equipped Empty Bottle; GETWATER takes the best
  water in reach: a hot spring, then the fountain's pool, then the hut trough or plain water,
  then electrified water. GETFAIRY needs no bottle: with one equipped the fairy is caught,
  without one it heals the player, or blesses them (+1 max HP) at full health. "Could walk to"
  is a flood over the player's steering terrain: walls, solid objects, lava and deep water stop
  it, so an islet or the far side of a lava moat is out of reach. REST, EXPLORE or NEUTRAL;
  `NO BOTTLE.` (a liquid, none equipped), `...NOTHING.` (nothing in reach).
- **In code:** `src/systems/GetSpellSystem.js` — `cast(kind)`; fills through
  `AlchemySystem.fillLiquidBottle` / `fillHotWaterBottle` / `fillBottle` and
  `FountainSystem.poolBottleChar`; fairies through `InteractionSystem.bottleFairy` /
  `healFromFairy` / `blessFromFairy`; reach from `buildTerrainGrid` (`steeringTerrain.js`).
- **Not:** a walk — the player stays put; not a bottle from the carried inventory (equipped
  slots only, as with the armed-bottle gesture).

### Consumable
- **Definition:** A single-use Crafted item that can be equipped in a consumable slot or used
  directly, applying an instant or temporary effect to the player.
- **In code:** `type: ITEM_TYPES.CONSUMABLE` in `src/data/items.js`; subtypes include roles
  (heal, buff, movement, defensive, throwable, utility, oil). Used via `InventorySystem`;
  removed from inventory on consumption.
- **Not:** an Ingredient (raw drop) or an equipped weapon/armor. Consumables are crafted via
  recipes.

### Exclusive Group
- **Definition:** A set of Consumables that can't be equipped side by side, so only one member
  sits in the consumable slots at a time. Boots, Floating Boots and Rubber Boots form the
  `boots` group: one pair at a time. Equipping a second member (explore pickup, crafting,
  REST slot equip) opens the slot-replace prompt, which offers only the conflicting slot plus
  STORE IN CHEST. The other slots show dimmed.
- **In code:** `data.exclusiveGroup` in `src/data/items.js`.
  `InventorySystem.conflictingConsumableSlot(item, exceptIdx)` finds the clash, and
  `SlotReplacementSystem.lockedSlots` restricts the prompt. REST equip goes through
  `openFromInventory`.
- **Not:** a stack (Stackable consumables merge counts into one slot). It is also not a
  mana-reserved slot.

### Feed
- **Definition:** A Consumable that crows and rats seek out and eat once it lies on the ground.
  Throwing (SHIFT) or dropping Feed is how crows are befriended and rats tamed into
  Companions. Feed can also have its own SPACE effect: Bread (⌬) has none, while the Sandwich
  (☰, Bread + Meat) heals 3 when eaten.
- **In code:** the `feed: true` flag on the item's data in `src/data/items.js`; test it with
  `isFeed(item)` (`src/systems/feed.js`). Never compare against a Bread char. Consumers:
  `CompanionSystem` (rat bread-seek, crow targeting, crow loot exclusion),
  `Crow._closestPickable` exclusion, and `CampNPC.acceptsHeal`.
- **Not:** "bread" as a category (Bread is one Feed item); "bait" or "lure" (Lure is the
  Charm Lure trap, and LureMechanic is an enemy behavior).

### Water Balloon
- **Definition:** A thrown consumable (◒, Bottle of Water + Goo) that bursts over the Bomb's
  radius without a blast: every enemy in the burst gets wet (pip 1, burn put out) and slimes
  take 2 damage. A wet Giant Slime can't leap, not even its counter-leap, and dissolves: each
  wet damage tick is shed as a 1 HP slime that re-merges with it unless killed.
- **In code:** `ITEMS['◒']` (`effect: 'waterBalloon'`, `radius`, `slimeDamage`); thrown through
  `ConsumableTriggerSystem` → `ConsumableWindupEffects` `'waterBalloon'`. Slimes are enemies
  with `data.wetDot`. The leap gate is `LeapAttackMechanic.tryTrigger` (`isWet()`); the
  dissolve is `SplitOnDamageMechanic.onStatusTicks`.
- **Not:** a Bomb (no damage to non-slimes, opens nothing); not a trap.

### Goggles
- **Definition:** A passive consumable (⚇, Empty Bottle + Goo) worn in a consumable slot. While
  equipped, what each Sunken Glint hides shows through the water as a darkened glyph, and the
  glint can be collected; without them it is only a twinkle. Worn alongside Flippers.
- **In code:** `ITEMS['⚇']` (`passive: true`, `goggles: true`); tested by `wearsGoggles(game)`
  (`SunkenGlintSystem`); read by `SunkenGlintSystem.handleSpacePress` and `drawSunkenGlints`.
- **Not:** Flippers (those let the player swim deep water; Goggles only let them see into it).

### Shore Fisherman
- **Definition:** The Fisherman standing on the bank of a peaceful Lake or Ocean Room. Once his
  tips have been heard, a coin buys his one Fishing Pole, set down beside him. Whenever a catch
  that needs a blade lands by the player, he walks over, cuts it open, and walks back to his
  spot. He leaves a Caught Fish alone (a blade would waste it). The hut Fisherman instead sells
  the cutting demonstration.
- **In code:** `room.lakeFisherman` (a `Fisherman` with `sellsRod`, placed by
  `roomFeatures.spawnShoreFisherman`); `ShoreFishermanSystem` (`trySpacePress` from the EXPLORE
  SPACE dispatch, `update` from `updateExploreState`); the cut is
  `FishingSystem.cutRewardObject`, shared with the player's blade; coin arc is the
  `shoreFishermanCoin` Frame Pass.
- **Not:** the hut Fisherman (`FishermanDemoSystem`, a paid demonstration, no rod).

### Bomb Bag
- **Definition:** A consumable-slot item (⊟) that throws Bombs (⊗) and is never spent itself.
  It holds one free Bomb, refilled on every room exit, and throws that first; after that it
  throws the Bombs in the consumable list. With the bag equipped, a Bomb you pick up or craft
  goes into the consumable list (its stock) instead of asking for a slot.
- **In code:** `ITEMS['⊟']` (`bombBag: true`); `BombBagSystem` owns the throw
  (`throwFrom`), stock (`stockCount` = Bombs in `consumableInventory`), pickup claim
  (`claimsPickup`) and the refill (`refillForNewRoom`, beside `resetTrapsForNewRoom`). Free
  charge is `Item.freeCharge`. Throws go through `InventorySystem.startConsumableWindup`, so the
  explosion is the Bomb's own.
- **Not:** a Key Item (it takes a slot and is lost on death), and not a stack counter — the
  stock has no number of its own; it is the Bombs you can see in the list.

### Key Item
- **Definition:** A unique, run-scoped item that unlocks progression and enables access to
  new areas or mechanics. Persists across death within a single run.
- **In code:** held items of type `KEY` live in `inventorySystem.keyItemInventory`, read through
  `hasKeyItem` and spent through `consumeKeyItem` (`src/systems/keyItems.js`) (Vault Key, Skull Key, Shed Key, Simple Key). Some older
  ones are still a flag on `game` (e.g. `spectaclesObtainedThisRun`). Spectacles (⊙)
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

### Shed Key
- **Definition:** The Key Item the Errand traveler gives once every trade tier is done: it
  drops beside the reward of the first final-stage (Stage 2) trade, once per run. Opens every
  Shed's door into a full door and is never spent.
- **In code:** `SHED_KEY_CHAR` (`⟜`) in `src/data/items.js`; granted by
  `ErrandSystem.checkGive` / `_spawnReward` (run flag `shedKeyGiven`, cleared by
  `resetOnDeath`); read with `inventorySystem.hasKeyItem(SHED_KEY_CHAR, game)`.
- **Not:** the Vault Key or Skull Key (both are spent on their lock).

### Death / Permadeath
- **Definition:** The core roguelike reset mechanic — when the player dies, all Inventory,
  Quick slots (except crafting knowledge), and position are lost. Only run-scoped Key Items
  and mental knowledge (recipes, zone layout) persist.
- **In code:** death triggers `enterGameOverState()` → full game reset via `createNewGame()`;
  `PersistenceSystem` is permanently disabled to enforce full reset. Design philosophy in
  `claudedocs/zone-cosmology.md`.
- **Not:** soft-lock or save-scumming. Death is final and intentional; mental progression is
  the reward, not inventory accumulation.

### Death Save
- **Definition:** A lethal hit that something catches before it becomes a Death: HP is
  restored and the run goes on. The equipped saves are spent in a fixed order — Fairy in a
  Bottle (restores the flat fairy heal) before Phoenix Feather (half of max HP) — and each is
  used up by the save. A wish revive is a death save too. Anything marked to break on death
  (Heart `♥`, Dragon Heart `♦`) shatters on every lethal hit, saved or not, before the save
  restores HP, so its max-HP bonus never carries through.
- **In code:** `tryDeathSave(game)` walks `DEATH_SAVES` (`src/systems/DeathSaveSystem.js`),
  called from main.js's death check; `breakOnDeathPassives` (`ConsumableSlotBreaks.js`) runs
  first for every `breaksOnDeath` item. The ledger records a save as `event: 'revive'`.
- **Not:** a Death — no reset happens. Not a heal-on-hit (Fairy King in a Bottle heals hits
  the player survives; it never catches a lethal one).

### Fairy King
- **Definition:** A rare Fairy (1 in 100), deeper pink, that talks instead of healing.
  Touching it does nothing; SPACE in range speaks its one line, pointing the player to the
  fountain's gem offering. It appears wherever wild fairies spawn (fairy grass, fishing,
  Oasis), where it flutters without leaving so it can be found and heard, and as an ambient
  fairy at the Fairy Fountain, where it only talks. An armed Empty Bottle catches a wild one as
  **Fairy King in a Bottle** `♔`: a reusable consumable that heals 3 HP on any hit the player
  survives, then waits out a 20s cooldown; a fairy orbits the player while it is ready.
- **In code:** `FairyKing extends Fairy` (`src/entities/FairyKing.js`; `FAIRY_KING_ODDS`,
  `createWildFairy`, `getDialogueLines`); the bottle catch is in
  `InteractionSystem.tryBottleFairy`. `♔` is `healOnHit: true` in `src/data/items.js`, fired by
  `player.hurtPending` (set by `PlayerDamageSystem`) in `ConsumableTriggerSystem`; the ready orbit is
  `drawFairyKingOrbit` (`src/rendering/effects/FairyKingOrbit.js`).
- **Not:** a Fairy in a Bottle — the King's bottle heals on surviving a hit and is never a
  Death Save. Not a blessing source: touching it grants nothing.

### Reset Registry
- **Definition:** The declare-once table of every run/title/room-scoped `game.*`/`player.*` field
  and how it's cleared. Replaces scattered ad hoc clears duplicated across separate reset
  functions — a field's reset behavior is declared exactly once, at its narrowest correct Reset
  Scope, and every reset path gets it for free through the scope cascade.
- **In code:** `RESET_REGISTRY` in `src/game/resetRegistry.js` — an array of `{path, scope,
  value|fresh|call, covers?, why}` entries. `applyReset(game, scope)` applies every entry at or
  below a scope; `initRegisteredState(game)` seeds the `Game` constructor from it once.
  `enterTitleState()`, `_resetRunToRest()`, and `applyRoomSwap()`'s `resetEntities` block all
  consume it. `tools/check-reset-parity.mjs` hard-fails on any entry whose path doesn't resolve
  (`checkRegistryPathsResolve`) or any live field missing from the registry/allowlist
  (`checkRegistryCoverage`).
- **Not:** the pre-registry shape — clearing a field by hand in up to four separate functions,
  one of which could be missed. That drift is how bug family #198/#196/#100/#86/#13/#307 happened.

### Reset Scope
- **Definition:** How narrow or wide a Reset Registry entry's lifetime is, as one of three tiers
  that cascade narrowest-to-widest: **room** (dies on every room transition), **run** (also dies
  on death/game over — includes everything room clears), **title** (also dies returning to the
  title screen — includes everything run clears). A field declares its narrowest correct scope
  once; wider resets get it automatically through the cascade, never by duplicating the entry.
- **In code:** `RESET_SCOPES` and `scopeIncludes(scope)` in `src/game/resetRegistry.js`; the
  `scope` field on each `RESET_REGISTRY` entry.
- **Not:** Game State (REST/EXPLORE/NEUTRAL/TITLE) — an unrelated top-level-mode concept that
  happens to share the word "state" informally; a Reset Scope is a lifetime tier, not a mode.

### Quagmire
- **Definition:** A rare green-zone Room (exit letter Q): a water-dispersed arena. Mostly not
  generic combat; when combat occurs it runs in escalating rounds, and a Rusalka may appear
  after the final clear. Holds a Pond whose Whirlpool opens into the Aquifer. Variants may instead present the
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
- **In code:** class `BackgroundObject` in `src/entities/BackgroundObject.js`; the
  `BACKGROUND_OBJECTS` catalogue in `src/game/GameConfig.js`. Properties include flammability,
  conductivity, interaction type, drop chance/table. Managed by collision and elemental
  systems (FireSystem, ElectricitySystem, WorldEffectsSystem).
- **Not:** an Enemy or Ingredient. Objects are static/semi-static environmental features, not
  autonomous or droppable initially.

### Brush
- **Definition:** A kind of Background Object, low growth that clears to anything. SPACE
  (armed or not), every melee weapon including blunt ones, and projectiles all destroy it.
  Projectiles stop on it instead of passing over. A blunt or axe strike always clears it in
  one hit. Members: Shrub (`%`) and Brambles (`+`).
- **In code:** `kind: 'brush'` on the `BACKGROUND_OBJECTS` entry, set by spreading the
  `BRUSH` rule set in `src/game/GameConfig.js` (which also carries
  `bulletInteraction: 'interact-destroy'` and `acceptsInteractions: ['all']`). Code asks
  `obj.data.kind === 'brush'`, never a char check. Hp, drop, and `dropChance` stay
  per-entry.
- **Not:** Grass (`|`, `cuttable`, which is choosy about its cutters), Bush (`&`), or
  Stump (`ŋ`). Those may share a look or a placement group in `RoomGenerator`, but not
  Brush's rules.

### Lightweight
- **Definition:** A Background Object light enough that a Rolling rock crushes it and rolls on
  without stopping. Members: Shrub (`%`), Bush (`&`), Brambles (`+`), Mushroom (`n`) and Tall
  Grass (`|`, which is flattened to cut grass rather than destroyed). A crushed object gives
  its usual drop.
- **In code:** `lightweight: true` on the `BACKGROUND_OBJECTS` entry
  (`src/game/GameConfig.js`), read by `BoulderSystem._crushLightweight`.
- **Not:** Brush (a separate rule set about which weapons clear it; the two overlap in
  members only), or anything a bomb breaks (which spends the rock instead).

### Weapon Timing
- **Definition:** The multi-phase cycle of a melee/ranged weapon attack: Windup (startup delay
  before damage), Recovery (cooldown after impact), and optional Reload/Charge phases for
  certain weapon types. All values are in Double-seconds.
- **In code:** weapon data fields: `windup`, `recovery`, `reload`, `charge` in `src/data/items.js`.
  Weapon ticks at `PHYSICS.WEAPON_TIMER_RATE` (= 2). Compare to playtesting simulator by ÷2.
- **Not:** just damage or accuracy. Timing defines weapon feel and combat rhythm.

### Impact Size
- **Definition:** How much ground a shockwave hammer's blow covers: the side, in cells, of the
  square it strikes, centered on the carrier. Everything inside is hit once, at the instant
  of impact. The ring the blow sends out afterwards deals no damage; it only shakes the
  background and knocks back the enemies it sweeps past. The default is 3 (the carrier's
  cell plus one cell all round); Bone Crusher swings 5.
- **In code:** `data.impactSize` (default `DEFAULT_IMPACT_SIZE` in `Item.js`), read by
  `Item.createMeleeShockwave()`, which returns one hit with `triggerShockwave`. The ring is
  `game.playerShockwave` (started by `WeaponEffectsSystem.startShockwave`, advanced by
  `InteractionSystem.update`). Its knockback is `shockwaveKnockback` (default
  `SHOCKWAVE_KNOCKBACK`), and a ring with `knockback: 0` (the Pearl and Sunken Ship reveals) is
  visual only.
- **Not:** a timed AoE. The old three delayed damage rings are gone. Not `range`, which says what
  a weapon can be swung at. Not `explodeRadius`, the burst an `explode` hit adds where it lands.

### Gemstone
- **Definition:** A special Ingredient that crafts with a base weapon to produce a gem-infused
  Crafted item with enhanced effects (Gem Staves, Gem Whips, etc.).
- **In code:** Gems (Sapphire, Ruby, Topaz, Onyx, Emerald, Garnet, Force Wand) defined in
  `src/data/items.js` as Ingredients; recipes in `src/data/recipes.js` combine gem + base
  weapon.
- **Not:** a regular Ingredient or Crafted item; a special upgrade path for weapons.

### Rainbow Necklace
- **Definition:** The four Gem Necklaces in one: a passive consumable (`ᑚ`) that takes −1 off
  burn, freeze and electric damage and halves poison and goo slow. Only the Jeweler makes it,
  from Ruby, Sapphire, Topaz and Emerald plus 3 coins.
- **In code:** `ITEMS['ᑚ']` (`src/data/items.js`): `elementReduction` + `poisonResist` /
  `slimeResist`, summed by `EquipmentEffectsSystem`. No recipe. Sold as the last row of
  `JEWELER_WARES`.
- **Not:** the Rainbow Stone (the forged form with magic damage; unbuilt, see planning inbox).

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

### Three Room
- **Definition:** The source-head of the game — a Neutral Room holding one carved object with
  three slots in it and a shut door to the north. Found only by travelling north three times
  in a row (a zone boss room's north never counts, and it breaks the streak), or through a
  Gray zone `'3'` room. What is placed in the slots decides how the run
  can end.
- **In code:** `threeRoom` script in `src/data/neutralRooms.js`; `room.isThreeRoom`;
  `ThreeRoomSystem` owns the offerings, the music and the door; `ThreeRoomRenderer` draws the
  frames and the Death cinematic. Carrying torch light (`hasTorchLight`) colors each frame
  with its slot's REST role color — apex red, left cyan, right yellow (`FRAME_TORCHLIT_COLORS`).
- **Not:** "Triangle Room" (the superseded cosmology name), "puzzle room" (reserved — that is
  the dungeon side-room authoring pathway), "altar", "shrine".

### Offering
- **Definition:** A symbol placed into one of the Three Room's three slots. Placement is
  one-shot: an offering can never be changed once made.
- **In code:** `ThreeRoomSystem.placeOffering()`; stored on the slot Background Object.
- **Not:** "sacrifice", "sacrifice item", "insert", "deposit".

### Globe of Offerings
- **Definition:** The menu the Three Room's slots are fed from — a slowly turning sphere with
  the run's symbols on its surface, back face never drawn. It offers back only glyphs the run
  actually touched, so the puzzle is unsolvable on some runs by design.
- **In code:** `ThreeSlotGlobeSystem` (state, input, selection) + `ThreeSlotGlobeOverlay`
  (render only); opened through the PauseSystem modal hook.
- **Not:** "symbol menu", "item wheel", "carousel", "picker".

### Power Trio
- **Definition:** The set that satisfies the Three Room by **form** — a weapon in the apex
  slot (Instinct), armor in the left (Experience), a consumable in the right (Convention).
  It opens the north door, and behind the north door is Death.
- **In code:** `SLOT_FORMS` in `ThreeRoomSystem`.
- **Not:** "the three powers", "correct set", "win condition".

### True 3
- **Definition:** The one exact set of offerings the room is looking for — `⬢` Onyx Hammer
  or `⫪` Cinder Hammer, `⊙` Spectacles, `🜛` Mana Potion, in the Instinct / Experience / Convention slots. It is
  spared the north door and instead liberates South of Rest: an ending by permission.
- **In code:** `TRUE_THREE` in `ThreeRoomSystem`. Because those three items are themselves a
  weapon, an armor and a consumable, the True 3 also satisfies the Power Trio's form rule —
  identity is therefore tested first and form is the fallback.
- **Not:** "the right answer", "solution", "correct combination".

### Cracked Slot
- **Definition:** A Three Room slot whose offering was the wrong form for it. The slot goes
  gray and cracked and keeps the wrong glyph — the mistake stays visible. Cracking is what
  curses the run, and a cracked slot still counts as filled for opening the north door.
- **In code:** `threeCracked` flag on the slot Background Object; `FRAME_CRACKED_COLOR`,
  `CRACK_COLOR` and `_drawCracks` in `ThreeRoomRenderer`.
- **Not:** "broken slot", "failed slot", "invalid placement".

### Cursed Run
- **Definition:** The state a run enters the moment a slot cracks. The Three Room can no
  longer be found for the rest of the run, the Graveyard fills as rooms are explored, and REST
  eventually turns gray, stops healing, and starts admitting undead from the south. Charon
  meets it with a cursed line, then stops coming; once REST has given way he returns once to
  say farewell, and from then on EXPLORE's way back to REST is shut, its door gray.
- **In code:** `game.cursedRun`, set in `ThreeRoomSystem._beginCurse`. Everything the flag
  changes outside the Three Room is owned by `CursedRunSystem`, including when REST itself
  gives way (`isRestDecayed`), how Charon meets each REST visit (`charonVisit`), and whether
  his farewell has shut the way back (`isRestSealed`).
  The hut Wise Fellow rolls from the zone's `cursedSayings` (`zones.js`) instead of its
  `wiseSayings` (`WiseFellow.setHint`).
- **Not:** "cursed mode", "bad ending", "hard mode".

### Undead
- **Definition:** The risen figures a Cursed Run fills the world with — around a cracked slot,
  through the Graveyard, and finally inside REST. They shamble and crowd; they do not attack,
  take damage, or drop anything. They borrow the gray zone's letters (`S` Skeleton, `Z` Risen
  and up) because the curse is bending the world toward gray.
- **In code:** `UndeadSystem` (`src/systems/UndeadSystem.js`), drawn by `drawUndead`
  (`src/rendering/ui/UndeadRenderer.js`). Not `Enemy` instances — see the system's header.
- **Not:** "ghosts", "spirits", "mobs", "wanderers".

### Graveyard
- **Definition:** The room south of REST, opened by a Cursed Run — undead milling below a hard
  divider between its top third and its lower two thirds. It fills further with every newly
  explored room.
- **In code:** the `graveyard` Neutral Room script (`src/data/neutralRooms.js`); population and
  growth in `CursedRunSystem`. Reached by REST's south exit, and its return exit goes back to
  REST rather than EXPLORE.
- **Not:** "cemetery", "boneyard", "crypt".

### Graveyard Divider
- **Definition:** The unbroken wall across the Graveyard separating the top third the player
  stands in from the lower two thirds the undead mill in. It has no gap — the point is that the
  crowd can be seen and not reached.
- **In code:** the `graveyard_divider` Background Object variant (`GameConfig.js`), stamped a
  cell at a time across `room.graveyardDividerRow` by the `graveyard` script.
- **Not:** "fence", "barrier", "gate", "partition".

### Barricade
- **Definition:** Something stamped across an exit lane that asks what the run is carrying and
  answers by opening or not. Unlike the Graveyard Divider it is meant to be cleared — by force,
  by tool, by sacrifice, or by neutralizing what it is made of. A room raises at most one, never
  across its south exit, and never before the third room of a zone unless the Three Room approach
  is what raised it.
- **In code:** `BarricadeSystem`, with the `barricades` catalogue holding every one that exists
  and `laneCell`/`laneCells` giving a layout an exit's own frame of reference so it can be
  authored once and raised any direction. Live state is `room.barricade` and never `game.*` — it
  dies with the room. Its objects are flagged `structural` so roomFeatures' stray-object sweep
  leaves them alone.
- **Not:** "gate", "blocker", "wall", "plug", "obstacle". ("Gate" survives only inside the
  authored family names below — a Barricade is never *a* gate on its own. "Plug" stays a
  descriptive word for the part that fills the lane, as in the definition above; it is never a
  name for the Barricade itself.)

### Barricade Family
- **Definition:** The set of Barricades one exit-letter colour can raise, and the kind of question
  they all ask. The colour a player already reads for "where does this go" doubles as "what will
  this ask me for": **craft gates** (green) want a tool used a particular way; **mastery gates**
  (red) want a weapon class carried far enough; **sacrifice gates** (cyan) want meaningful progress
  given away; **mage gates** (yellow) want the run's relationship to affinities and the elements.
  Gray has no family and raises nothing — gray is the Three Room's own signage.
- **In code:** `BARRICADE_FAMILIES` keyed by family name, `FAMILY_BY_COLOR` mapping a `ZONE_COLORS`
  value onto one. An empty family (red, for now) raises nothing rather than borrowing another
  family's question. Cyan's only member so far is the Barricade Target, which asks for a gun or a
  bow rather than a sacrifice.
- **Not:** "barricade type", "gate category", "tier", "colour group".

### Petrified Tree
- **Definition:** Wood already turned to stone — the Barricade plug on the third north.
  Gray, impassable, and openable only by an axe over several swings. It does not burn, so fire
  is not a way around the axe.
- **In code:** the `petrified_tree` Background Object variant (`GameConfig.js`). Shares the
  ordinary Tree's `'Y'` char deliberately, because CombatSystem keys the axe requirement on the
  char; the variant keeps that gate while dropping the Tree's flammability and `slowing`.
- **Not:** "gray tree", "stone tree", "dead tree", "fossil tree".

### Barricade Target
- **Definition:** The cyan Barricade plug: a block of bullseyes (`◎`), each broken by one bullet
  from a gun or one arrow from a bow, and by nothing else. Swings, bombs, rolls, boulders, a
  staff's missile, a boomerang and enemy shots all bounce off it.
- **In code:** the `barricade_target` Background Object variant (`GameConfig.js`), raised by the
  `targets` entry in `barricades.js`. Its `shotOnly` flag is the gate: `BackgroundObject.takeDamage`
  refuses any hit not marked `{ shot: true }`, and `handleBulletCollision` marks only a gun or bow
  shot (`isGunOrBowShot`). Shares `◎` with the hut's Looking Glass; the variant swaps the data.
- **Not:** "target block", "bullseye", "shooting gallery", "target wall".

### Cavern
- **Definition:** Like layer 1 in the U room, but a smaller, hut-sized area meant for secrets.
  Its hidden entrance sits inside a large, conspicuous cluster of unbreakable rocks; Bombs reveal
  it (or OPENCAVE, which breaks the rock the same way with a carried Sledgehammer, Onyx Hammer
  or bomb). It always has 2 lit torches that can be destroyed. The friendly Goblin (`G`) inside says
  "It's a secret to everybody." and drops between 2 and 5 coins.
- **In code:** `room.cavern` (a hut record with `hutKind: 'cavern'`), seeded by `seedCavern()`
  (`roomFeatures.js`) in any room letter where wall structures can spawn, never on top of one.
  Entered and exited through HutSystem; the interior comes from
  `CavernSystem.generateCavernInterior()`. The rocks are the `cavern_rock` Background Object
  variant; the torches are `cavern_torch`. The Goblin is `FriendlyGoblin`.
- **Not:** "cave", "grotto", "secret room", "hidden hut".

### Bombable rock
- **Definition:** A rock that can technically be destroyed, but only by bombs. It hides a
  Cavern's entrance among the unbreakable rocks and looks the same as them.
- **In code:** the `bombable_rock` Background Object variant (`GameConfig.js`, `bombable: true`),
  broken by `CavernSystem.bombBlast()` from the Bomb consumable and the Remote Bomb trap.
- **Not:** "cracked rock", "weak wall", "breakable rock".

### Push Rock
- **Definition:** A rock that looks identical to the unbreakable rocks around it but slides one
  cell when the player leans into it from a side with room. It is never a secret on its own,
  only the answer to a locked thing (in every green Ocean (`O`) Room the lock is the deep sea,
  and the Flippers lie under the rock). Moving it is a trigger. It cannot be moved back and never
  moves again.
- **In code:** the `push_rock` Background Object variant (`GameConfig.js`), built by
  `createPushRock()` and read by `readPushRock()` (`src/systems/PushRock.js`) as triggerMachine
  kind `'push'`, always `activation: 'permanent'`. The caller's `world` (`collisionMap`,
  `backgroundObjects`, `isReserved`, `onMove`) decides which cells it may slide into. It is placed
  by the `push_lock` Barricade (among `cavern_rock` decoys, via `decoyTypeId`), by floor and
  Puzzle Room templates (dungeon editor Push Rock tool; on a numbered floor `isReserved` keeps it
  off every staircase and landing cell, `floorAnchorCells`), as a Dungeon's gate rock (the
  Skull Key's alternative: `floor.gateRock`, set on the footprint of the floor's `push` descent
  by `DungeonFloorGenerator._buildScaffold` among the `cavern_rock`s scattered on every
  Entrance and Corridor floor, ticked by `DungeonPuzzleSystem._updateGateRock`, which emits
  the `push` Reveal once it is shoved off), and on every Ocean Room's sand
  (`OceanPushRockSystem`: `placeOceanPushRock` from `generateOceanTerrain`, `room.oceanPushRock`).
- **Not:** "pushable block", "movable rock", "push block", "boulder".

### Bombable wall
- **Definition:** A dungeon wall cell (Puzzle Room or numbered floor) that only a bomb opens.
  It looks like the ordinary dungeon wall around it, but shakes when struck; a bomb blast breaks
  it and leaves the cell walkable. The Bomb Trial hides its triggers behind them; on a numbered
  floor, whatever one hides is optional (Progression Solver). Every bombable V room Vault (all
  zones but yellow) has a row of them as its bottom wall.
- **In code:** template grid glyph `B` (`src/data/dungeon/tiles.js`, stamped solid by
  `applyPuzzleTemplateToCollisionMap` / `applyTemplateToCollisionMap`) plus a `bombable_wall`
  Background Object variant on each such cell (`GameConfig.js`, `bombable: true`), placed by
  `DungeonFloorGenerator._placeBombableWalls`.
  `CavernSystem.bombBlast()` (a bomb, or a Rolling rock) breaks it and clears the cell's collision. Painted with the
  dungeon editor's Bombable Wall tool. On a Vault, `buildVaultUnlockExtras` places the row
  (`vaultInfo.wallObjects`, `structural`), and `InteractionSystem._openVaultWall` cracks the
  whole row, whichever unlock method opened it.
- **Not:** "cracked wall", "weak wall", "breakable wall", "secret wall".

### Bomb Trial
- **Definition:** The dungeon Puzzle Room that grants the Bomb Bag. A Bomb sits on the pedestal,
  whose flank slots show the Bomb recipe, and the bag sits on the dais. The room's floor panels
  are walled off behind Bombable walls; the stairs out unlock once every panel has been stood on.
  The alcoves are spaced so that each one needs its own bomb.
- **In code:** `src/data/dungeon/puzzleTemplates/bomb_trial.json` (`bomb_trial` in
  `PUZZLE_ROOM_TEMPLATES`, `weight: 1`). It uses the generic Puzzle Room fields: `B` cells,
  `panel` triggers, a `pedestal` with `weaponChar: '⊗'` and a `dais`.
- **Not:** "bomb room", "bomb puzzle", "Bomb Bag room".

### Rolling rock
- **Definition:** A rock rolling along one cardinal axis. It hurts whatever it hits, players
  and enemies alike, and it is spent on anything a bomb breaks (a Bombable Rock or Bombable
  wall, a bombable Vault wall) or on a Puzzle Room switch. It crushes Lightweight objects
  in its path and keeps rolling. It bounces back off walls along the
  same axis and turns at a Deflector. The red zone's rockfall drops them. The Onyx Hammer knocks
  an unbreakable rock loose into one, and any hammer hitting one that is already rolling sends
  it back the way the strike points; both hammer cases give a hammer-rolled rock, with the same
  damage and twice the speed. It works the same way on the surface and on dungeon floors.
- **In code:** a rock record in `BoulderSystem` (`src/systems/BoulderSystem.js`). Each one
  carries its `space` (the room or a dungeon floor) and only moves while the player is in that
  space. `empowered` = hammer-rolled (×2 speed, not ×2 damage). Rocks are started by
  `rollFromRest(attack, obj)` (the weapon flag `rollsRock`; the target must pass
  `isHammerRollable`, i.e. obsidian or `data.hammerRollable` and not `structural`/`surfaceOnly`).
  `_strikeFixtures` handles what they break, `_crushLightweight` what they flatten, and
  `redirectProjectile` handles Deflector turns.
  Drawn by the `rollingRocks` Frame Pass (`src/rendering/effects/RollingRockDraw.js`).
- **Not:** a Push Rock (which slides one cell and ignores the hammer). "Boulder" is the
  code name only.

### Hammer Trial
- **Definition:** The dungeon Puzzle Room that grants the Onyx Hammer. One unbreakable rock sits
  at the end of a channel. Struck east, it rolls down a lava hallway, turns north at a Deflector
  and strikes the switch, which is otherwise out of reach, and that unlocks the exit. A second rock at the foot of a
  one-wide neck, struck south, breaks the Bombable wall in front of the exit. Each rock can only
  be reached from the side that sends it the right way.
- **In code:** `src/data/dungeon/puzzleTemplates/hammer_trial.json` (`weight: 1`,
  `solverExempt: true`). It uses `=` Lava cells (`tiles.js`, puzzle mode only),
  `unbreakableRocks` (placed as `cavern_rock`), `deflectors` (`{ row, col, char }`), one
  `switch` trigger, a `pedestal` with `weaponChar: '⬢'` and a `B` cell. Layout and the
  reasoning behind it: `claudedocs/hammer-trial-layout.md`.
- **Not:** "hammer room", "boulder puzzle", "rock room".

### Dais
- **Definition:** A Puzzle Room fixture: a slot frame on the floor that holds the Bomb Trial's
  Bomb Bag. While the Trial is unsolved, every Bomb that explodes there puts a fresh Bomb back
  on the pedestal, so the room stays solvable without crafting, and a player who brings their
  own bag never has to spend its stock.
- **In code:** template marker `dais: { row, col }` (`getPuzzleTemplateDais`) → `floor.dais`.
  `DungeonFloorGenerator.generatePuzzleRoom` places the Bomb Bag (`BOMB_BAG_CHAR`) on it.
  An explosion calls `DungeonPuzzleSystem.onBombExploded` (sets `floor.bombRestockPending`) and
  `_restockBomb` drops the Bomb on the pedestal. Nothing drops while a Bomb is winding up or
  already lying on the floor. `HutInteriorOverlay` draws the `[ ]` frame. Placed with the
  dungeon editor's Dais tool.
- **Not:** a pedestal (which grants a weapon once and has recipe flanks), and not a "spawner"
  or "refill station".

### Lock Block
- **Definition:** A solid dungeon block that a key opens. SPACE beside it (any of the 8 cells
  around it) while holding a Simple Key opens it and spends the key; a universal key
  (`opensAnyLock`, e.g. the χ-blade) opens it without spending anything. Once open, the cell is
  walkable for the rest of the visit.
- **In code:** template grid glyph `L` (`src/data/dungeon/tiles.js`, `opensWith: 'key'`), stamped
  solid and topped by a `lock_block` Background Object variant (`GameConfig.js`, `▣`,
  `coversWall`) placed by `DungeonFloorGenerator._placeLockBlocks`; opened by
  `DungeonPuzzleSystem._tryOpenLockBlock`. Painted with the dungeon editor's Lock Block tile.
- **Not:** a locked staircase (a descent footprint's `locked` state, opened by the Skull Key);
  "locked door", "key block", "key door".

### Simple Key
- **Definition:** The Key Item a dungeon template places for its Lock Blocks. Each one opens a
  single Lock Block and is spent doing it. The Skeleton Key, found later in the game, is a
  different item.
- **In code:** `SIMPLE_KEY_CHAR` (`⚩`) in `src/data/items.js`; template grid glyph `K`, a real
  `Item` placed by `DungeonFloorGenerator._placeSimpleKeys`; spent by
  `DungeonPuzzleSystem._tryOpenLockBlock`.
- **Not:** the Skull Key (opens the Corridor's West descent), the Skeleton Key, or a universal
  key (`opensAnyLock`).

### Shutter
- **Definition:** A solid dungeon block that opens for good once its floor has no live enemies
  and no standing Spawn Vent. Every Shutter on the floor opens at the same moment. It is the
  "clear the room to go on" gate.
- **In code:** template grid glyph `S` (`src/data/dungeon/tiles.js`, `opensWith: 'clear'`),
  stamped solid and topped by a `shutter` Background Object variant (`GameConfig.js`, `+`);
  opened by `DungeonPuzzleSystem._updateShutters`. The Progression Solver requires every Spawn
  Vent to be reachable before the Shutters it holds shut.
- **Not:** a Lock Block (opened with a key) or a Barricade; "door", "gate", "clear wall".

### Trigger Block
- **Definition:** A solid block on a numbered dungeon floor that opens for good once every
  trigger on its floor (switch, floor panel, torch or Push Rock) is active at the same time.
  Every Trigger Block on the floor opens at once. What it walls off is always optional reward,
  never the way on; the same solve can also fire the floor's `triggers` Reveal.
- **In code:** template grid glyph `T` (`src/data/dungeon/tiles.js`, `opensWith: 'triggers'`,
  floor templates only), stamped solid and topped by a `trigger_block` Background Object variant
  (`GameConfig.js`, `▥`, `coversWall`) placed by `placeTemplateFixtures`
  (`src/systems/dungeonFixtures.js`, the fixture placement numbered floors and Puzzle Rooms
  share); opened by `DungeonPuzzleSystem._updateFloorTriggers`. The reward is template-authored:
  a `K` Simple Key or an entry in the template's `items` list (`{ row, col, char }`, any
  `ITEMS` key). The fixture lists are checked by `validateTemplateFixtures`
  (`src/data/dungeon/fixtureSchema.js`), shared by the dungeon editor and `check:data`.
- **Not:** a Shutter (opened by clearing the floor), a Lock Block, or a Puzzle Room's Exit
  (which the room's triggers open instead).

### Spawn Vent
- **Definition:** A breakable dungeon fixture that keeps producing enemies on its own cell, with
  at most `maxAlive` of its enemies alive at once and one new enemy every `interval` seconds.
  Breaking it stops the spawning; a standing Vent keeps its floor's Shutters shut.
- **In code:** the `spawners` fixture list on floor and puzzle templates
  (`{ row, col, enemyChar|null, maxAlive, interval }`, `null` = a random zone enemy), a
  `spawn_vent` Background Object variant (`GameConfig.js`, `&`), driven by
  `src/systems/SpawnVentSystem.js` from the records in `floor.spawnVents`.
- **Not:** an `E` Enemy Spawn mark (a one-time placement hint for the floor's initial enemies),
  a Nest, or a "spawner"/"generator".

### Progression Solver
- **Definition:** The static proof that a dungeon template cannot softlock. On a numbered floor
  every staircase and landing must connect without tools or keys, so anything behind a
  Bombable wall, Lock Block or Trigger Block is optional, and must stay connected after any
  shove of its Push Rocks and any hook-post pull. In a Puzzle Room the exit must be solvable with only
  what the room supplies, from every state the player can reach: a Push Rock shoved the wrong
  way, a hook taken too early or a Simple Key spent on the wrong Lock Block must not cut it off.
- **In code:** `solveTemplate()` in `src/data/dungeon/progressionSolver.js` (pure).
  `proveTemplate()` beside it supplies the Puzzle Room's tool kit and the `solverExempt`
  skip, and is the one entry point for all three callers: `dungeonFloorTemplates.js` /
  `dungeonPuzzleTemplates.js` keep templates that fail it out of the random pools,
  `npm run check:data` fails the build on one (allowlisted debt carries a bug ref), and the
  dungeon editor refuses to save one. A Puzzle Room the solver can't model (the Hammer
  Trial's rolls) sets `solverExempt: true` and is hand-checked instead. `proveTemplate`'s
  `gateRock` option adds a gate rock on a footprint and requires it can be shoved off from the
  staircases' side; `proveFloorLayout` (`dungeonFloorTemplates.js`) re-proves a floor with the
  generator's scattered `cavern_rock`s added, and a rock that fails it is not placed. The
  shared fixture schema (`fixtureSchema.js`) also refuses any two interactive elements that
  touch, diagonals included (`tooClose`), and the generator spaces what it places at runtime
  by the same rule. The one runtime net:
  `generatePuzzleRoom` seals the player in only behind a template in the proven pool
  (`isPuzzleTemplateProven`), so a CheatMenu warp into a failing one leaves the way back open.
- **Not:** the editor's old advisory reachability check; a per-frame runtime check.

### Dungeon Recipe
- **Definition:** A zone's rules for laying out its Dungeon: how many corridors stand between
  the Entrance and the Branch and how they connect, which floor each side room (the Trial, the
  Trap Room) hangs off, which puzzle on the Branch opens the way to the Pyramid (the zone's
  sub-solve), and which Dungeon Boss waits in the Vault. Every zone's Dungeon is built from the
  same Floor Kinds; the Recipe is what makes each zone's flow chart its own.
- **In code:** one JSON file per zone in `src/data/dungeon/recipes/<zone>.json`, loaded and
  shape-checked by `src/data/dungeonRecipes.js` (`getDungeonRecipe(zone)`, falling back to
  Green's). Fields: `boss`; `corridors: [min, max]` (1-3); `shapes` (weights for `chain` —
  corridors in a row, the last one's Branch door taking the Skull Key — and `triangle` — the
  last two corridors both lead into the Branch and to each other, the first one's Branch door
  keyed and the long way round open, so the loop is the key's bypass); `branchPuzzle`;
  `sideRooms` (`trial: 'corridor'`, `trapRoom`: the Floor Kinds it may hang off); `diagonals`
  (`{ chance, reveals }` — the per-visit chance of one Hidden Descent, and the Reveals that may
  open it); `keyGate` (`{ pushChance }` — the per-visit chance that the Skull Key's door gets a
  Push Rock alternative: a hidden `push` edge from the same floor to the same floor, on another
  footprint, under a gate rock). Every recipe
  is batch-checked by `npm run check:graphs` (`tools/check-dungeon-graphs.mjs`).
- **Not:** a Dungeon Graph (the concrete layout one visit rolls from it); a crafting recipe.

### Dungeon Graph
- **Definition:** The concrete layout of one visit to a Dungeon, rolled from the zone's Dungeon
  Recipe when the player first goes in and kept for as long as the D-room lasts. Each floor is a
  node with a Floor Kind; each descent is an edge naming the footprint it sits on (N/W/E) and
  the Reveal that opens it. Every floor's way back up is its South footprint; a floor with two
  ways in (the Branch of a triangle) climbs back to whichever one the player came down.
- **In code:** `buildDungeonGraph(recipe, rng)` / `validateGraph()` in
  `src/systems/dungeonGraphBuilder.js` (pure); `DungeonSystem.rollVisit()` stores it as
  `room.dungeon.interiorState.graph` along with the Skull Key's floor (`keySkullNode`). Floors
  live on `interiorState.floors` under their node id, descents point at `{ node }`, and
  `game.dungeonCurrentFloor` is the live floor's node id.
- **Not:** a Dungeon Recipe (the rules it was rolled from); the old numbered floor stack
  (`floorIndex` 0-4), which it replaced.

### Hidden Descent
- **Definition:** A Dungeon descent that isn't drawn until its Reveal fires — not a locked door,
  just bare floor, until the floor is solved and it appears. It sits on a diagonal footprint (a
  North corner, NW or NE) and is always a shortcut: every floor stays reachable through the
  descents that are drawn. Only a floor event (`clear`, `triggers`, or the gate rock's `push`)
  may open one, never a held item. The `push` one sits under a gate rock, on any free footprint,
  and leads where the Skull Key's door does.
- **In code:** a Dungeon Graph edge with `hidden: true` and `dir` `NW`/`NE`, rolled by
  `buildDungeonGraph` on the recipe's `diagonals.chance` (or, for `push`, on `keyGate.pushChance`,
  on any free footprint); `descent.hidden` on the floor, painted
  blank by `paintDescentVisual` while locked. A corner is reserved only on a floor that uses it
  (`reservedFootprintCells(contract, diagonals)`), and such a floor draws only templates the
  Progression Solver proved can host that corner (`hosts` in `dungeonFloorTemplates.js`). A
  `triggers` edge asks for a template whose triggers the solver proved reachable
  (`solvesTriggers`); a floor that couldn't get one opens the descent on `clear` instead.
- **Not:** a locked descent (drawn, waiting on its Reveal); a Bombable Wall.

### Floor Kind
- **Definition:** A reusable type of Dungeon floor: Entrance, Corridor, Branch, Pyramid, Vault,
  Trap Room or Puzzle Room. The kinds are one vocabulary shared by every zone. A kind builds
  its floor's content; the Dungeon Graph decides where its descents lead.
- **In code:** `FLOOR_KINDS` in `src/systems/dungeonFloorKinds.js` (each kind's
  `DungeonFloorGenerator` method, and `holdsSkullKey`); `floor.kind` on every generated floor.
- **Not:** a floor template (a wall layout a kind may stamp); a Zone.

### Reveal
- **Definition:** What opens a Dungeon descent. `open` needs nothing; `key` spends the Skull
  Key; `panels` is Green's floor-panel NPC puzzle on the Branch; `offering` is the Pyramid's
  Legend of Three; `clear` fires once the floor holds no counted enemy and no standing Spawn
  Vent (the same moment its Shutters open); `triggers` fires once every trigger on a numbered
  floor is active at once (the same moment its Trigger Blocks open); `push` fires once the
  floor's gate rock is shoved off its footprint. A floor *emits* a Reveal when its puzzle is solved, and every locked descent
  on that floor naming it opens. The puzzle never names which door it opens.
- **In code:** `edge.reveal` on the Dungeon Graph, copied to `descent.reveal`;
  `DungeonPuzzleSystem.revealEdges(floor, reveal)` opens the matching descents.
- **Not:** a Lock Block (a template tile opened by a Simple Key); a Shutter.

## Conventions

- **Casing:** types/classes PascalCase; functions/variables camelCase; constants
  SCREAMING_SNAKE; Game State and Zone string values as defined in `GameConfig.js` /
  `zones.js`.
- Domain terms win over technical defaults. A thing that manages X gets a domain name, not
  `XManager` / `XHandler` / `XHelper`.
- Avoid generic placeholders for concepts that have a term here: `data`, `info`, `process()`,
  `Manager`, `Handler`, `Util`.
