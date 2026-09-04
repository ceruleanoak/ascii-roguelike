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
  trail. SPACE on the hole from inside the cave climbs back out to the same Room's surface;
  the descent is spent once taken, so the hole is then ordinary scenery. At most one Sinkhole
  exists per Room — its cave is carved into that Room's own grid, so a second would overlay
  the first.
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
  Approach on sight, or toward Search on proximity-only detection.
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

### Strike
- **Definition:** The attack itself, from its opening beat through its last — collapses the
  legacy `'windup'` and `'attack'` state ids, two ids for one event. Committed: once entered,
  only a hard interrupt (stun, freeze, etc.) can cut it short, not damage. `bands` lets the
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

### Watcher
- **Definition:** A Mechanic for a wide-vision alarm Enemy: on spotting the player it marks
  them — clearing backstab eligibility — and alerts its roommates. Contests the
  burst-from-stealth economy.
- **In code:** `WatcherMechanic` gated by `data.watcherMechanic`; marking acts through the
  `detectionIndicatorTimer` gate that backstabs check.
- **Not:** a sentry turret or a damage threat in itself; the Watcher's weapon is information.

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
- **In code:** `isBoss` flag read off the instance first, shared data second
  (`enemy.isBoss || enemy.data?.isBoss` — #215). Set on the instance by the roomFeatures boss
  spawn paths; the Centipede head ships its own data object with the flag. Checked via
  `ZoneSystem.isBossReady(zone, depth)`; room type `BOSS_ROOM` generated when conditions are
  met. Boss-spawned enemies carry `isBossEntity` flag.
- **Not:** just a difficult Enemy; a Boss is a gated milestone tied to zone depth. Not a
  Dungeon Boss (interior encounter, own system) or a Miniboss (`BOSS_ENCOUNTERS` B-room
  variant).

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
  floors while cached within a delve and wipe on delve reset (staging is per-delve effort; the
  no-persistence law holds).
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
- **In code:** class `BackgroundObject` in `src/entities/BackgroundObject.js`; the
  `BACKGROUND_OBJECTS` catalogue in `src/game/GameConfig.js`. Properties include flammability,
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

### Three Room
- **Definition:** The source-head of the game — a Neutral Room holding one carved object with
  three slots in it and a shut door to the north. Found only by travelling north three times
  in a row, or through a Gray zone `'3'` room. What is placed in the slots decides how the run
  can end.
- **In code:** `threeRoom` script in `src/data/neutralRooms.js`; `room.isThreeRoom`;
  `ThreeRoomSystem` owns the offerings, the music and the door; `ThreeRoomRenderer` draws the
  frames and the Death cinematic.
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
- **Definition:** The one exact set of offerings the room is looking for — `⊥` Hammer,
  `⊙` Spectacles, `🜛` Mana Potion, in the Instinct / Experience / Convention slots. It is
  spared the north door and instead liberates South of Rest: an ending by permission.
- **In code:** `TRUE_THREE` in `ThreeRoomSystem`. Because those three items are themselves a
  weapon, an armor and a consumable, the True 3 also satisfies the Power Trio's form rule —
  identity is therefore tested first and form is the fallback.
- **Not:** "the right answer", "solution", "correct combination".

### Cracked Slot
- **Definition:** A Three Room slot whose offering was the wrong form for it. The slot goes
  gray and cracked and keeps the wrong glyph — the mistake stays visible. Cracking is what
  curses the run, and a cracked slot still counts as filled for opening the north door.
- **In code:** `cracked` flag on the slot Background Object; `SLOT_CRACKED_COLOR` and
  `_drawCracks` in `ThreeRoomRenderer`.
- **Not:** "broken slot", "failed slot", "invalid placement".

### Cursed Run
- **Definition:** The state a run enters the moment a slot cracks. The Three Room can no
  longer be found for the rest of the run, the Graveyard fills as rooms are explored, and REST
  eventually turns gray, stops healing, and starts admitting undead from the south.
- **In code:** `game.cursedRun`, set in `ThreeRoomSystem._beginCurse`.
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
- **In code:** planned Neutral Room script (not yet built).
- **Not:** "cemetery", "boneyard", "crypt".

## Conventions

- **Casing:** types/classes PascalCase; functions/variables camelCase; constants
  SCREAMING_SNAKE; Game State and Zone string values as defined in `GameConfig.js` /
  `zones.js`.
- Domain terms win over technical defaults. A thing that manages X gets a domain name, not
  `XManager` / `XHandler` / `XHelper`.
- Avoid generic placeholders for concepts that have a term here: `data`, `info`, `process()`,
  `Manager`, `Handler`, `Util`.
