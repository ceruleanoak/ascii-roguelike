# MAIN.JS REVIEW — PART 2 (lines 3000–5804)

---

## State Update Methods Analysis

### `updateExploreState(deltaTime)` — lines 2839–4615

This is by far the most violated method in the file. It is approximately 1,800 lines long and contains substantial inline logic that belongs in other systems. It does not simply dispatch to systems.

**Legitimate dispatches (correct):**
- `this.magicSystem.update(deltaTime)` (line 2882)
- `this.wellSystem.update(deltaTime)` (line 2898)
- `this.campNPCSystem.update(deltaTime)` (line 2901)
- `this.trapSystem.updateTrapCharge(deltaTime)` (line 3274)
- `this.trapSystem.updateInFlightTraps(deltaTime)` (line 3275)
- `this.trapSystem.checkWeaponTriggers()` (line 3279)
- `this.trapSystem.updatePuddles(deltaTime)` (line 3280)
- `this.enemySpawnSystem.flush()` (line 3527)
- `this.inventorySystem.update(...)` (line 3839)
- `this.hutSystem.update(deltaTime)` (line 3854)
- `this.dungeonSystem.update(deltaTime)` (line 3855)
- `this.mazeSystem.update(deltaTime)` (line 3856)
- `this.polymorphSystem.update(deltaTime, this)` (line 3859)
- `this.interactionSystem.update(...)` (line 3862)
- `this.bossSystem.update(deltaTime)` (line 3865)
- `this.boulderSystem.update(deltaTime)` (line 3868)
- `this.fishingSystem.update(deltaTime, this)` (line 3871)
- `this.combatSystem.update(...)` (line 3601)
- `this.physicsSystem.update(...)` (line 2931)

**Inline logic blocks that do NOT belong in main.js (violations):**

1. **Lava/liquid damage loop** (~lines 2931–3065): 130+ lines of direct entity damage, status effect application, wet-trail timer management. Belongs in `PhysicsSystem` or a dedicated `HazardSystem`.

2. **Rusalka water-touch respawn check** (lines 3067–3079): Should be entirely in `FishingSystem.update()`.

3. **Slime collision distance check** (lines 3083–3094): Enemy-player contact damage. Belongs in `CombatSystem` or `Enemy.js`.

4. **Sprint footstep trail emission** (lines 3096–3118): Particle spawning logic for player movement. Belongs in `Player.js` or a `ParticleSystem`.

5. **Wet trail (player)** (lines 3120–3138): Particle emission based on status. Belongs in `Player.js`.

6. **Wet trail (enemies)** (lines 3140–3158): Same pattern, for enemies. Belongs in `Enemy.js`.

7. **Steam trail (player + enemies)** (lines 3160–3198): Same emission pattern. Belongs in a particle/effect system.

8. **Slow timer on enemies** (lines 3200–3207): Velocity modification. Belongs in `Enemy.js` or `PhysicsSystem`.

9. **Item update (windup completion + auto-attack loop)** (lines 3209–3271): Weapon state machine logic. The check `weapon.data.weaponType !== 'WAND'` etc., belongs in `Item.js` or `CombatSystem`.

10. **Pack behavior sync** (lines 3282–3339): Two distinct pack behavior implementations (old `packBehavior` and new `packCoordination`). 60 lines of AI coordination logic. Belongs in `Enemy.js` or `EnemySpawnSystem`.

11. **Boar charge mechanic** (lines 3358–3419): Wall-stun detection, player contact damage, charge state machine. 60+ lines. Belongs in `Enemy.js` or a `ChargeSystem`.

12. **Shaman buff tick** (lines 3436–3443): Enemy stat buff countdown. Belongs in `Enemy.js`.

13. **Enemy spawn result dispatch** (lines 3341–3481): Handles `updateResult` from `enemy.update()` — fire trails, shaman buffs, siren lures, trap goblin. Partially delegatable to `CombatSystem` or sub-methods.

14. **Goo blob collision / hit checking** (lines 3610–3638): Melee hit detection against goo blobs. Belongs in `CombatSystem` or `GooSystem`.

15. **Fishing reward object hit checking** (lines 3641–3663): Melee hits against fishing rewards. Belongs in `FishingSystem`.

16. **Polymorph transformation outcomes** (lines 3761–3833): 70-line outcome table (background objects, lesser enemies, item drops, bosses). Belongs in `PolymorphSystem`.

17. **Impact effect particle spawning** (lines 3703–3751): Should be returned as a render event from `CombatSystem` and processed by a particle factory.

18. **Enemy death loop** (lines 3983–4082): Death SFX, explosion, hex witch spell learning, inventory drop, mana drop, debris. This is 100 lines of death-processing logic. Core belongs in `Enemy.js` / `LootSystem` / `CombatSystem`. Currently `spawnLoot(enemy)` is called but the rest is inline.

19. **Dead-enemy room cleanup + fire spread + grass bending** (lines 4091–4225): Background object animation, fire propagation, grass bending. Belongs in `BackgroundObject.js` or `InteractionSystem`.

20. **Direct fire contact stack accumulation** (lines 4227–4253): Player ember stack logic. Belongs in `Player.js`.

21. **Burning arrow ember emission** (lines 4255–4276): Belongs in `CombatSystem` or `Item.js`.

22. **Ingredient attraction + separation loop** (lines 4289–4333): 45-line ingredient physics loop, duplicated verbatim in `updateRestState` and `updateNeutralState`. Belongs in a shared helper or `PhysicsSystem`.

23. **Steam cloud aging** (lines 4344–4356): Belongs in `InteractionSystem` or a dedicated steam system.

24. **Steam cloud → enemy propagation** (lines 4352–3355): Pushing game arrays onto enemy instances each frame is an anti-pattern.

25. **Room clear side effects** (lines 4362–4418): Pre-boss gate injection, errand spawn, bat belfry unlock, captive spawning. Should be delegated to respective systems. Pre-boss gate especially manipulates exit data that should live in `ExitSystem` or `BossSystem`.

26. **Exit zone crossing detection** (lines 4435–4612): 180 lines of copy-pasted north/east/west/south exit detection. Belongs entirely in `ExitSystem.checkExits()`.

### `updateRestState(deltaTime)` — lines 2697–2792

Mostly correct dispatching. Contains one duplication violation:
- **Ingredient attraction loop** (lines 2722–2763): 40-line block copied verbatim from `updateExploreState` and `updateNeutralState`. Should be extracted to a shared method.
- All other dispatches are clean (physics, combat, NPC updates, UI).

### `updateNeutralState(deltaTime)` — lines 1992–2102

Contains the same ingredient attraction loop duplication. Otherwise mostly clean. One concern:
- **South exit transition logic** (lines 2057–2096): Restoring saved explore state and repositioning the player is transition logic that belongs in `enterExploreState`.

### `updateGameOverState(deltaTime)` — lines 2794–2837

Clean — only ticks timers and updates particles/physics. Appropriate for main.js as a dispatcher.

---

## Interior System Pattern Consistency

Three interior systems are implemented: `HutSystem`, `DungeonSystem`, `MazeSystem`. Pattern comparison:

| Concern | HutSystem | DungeonSystem | MazeSystem | Notes |
|---------|-----------|---------------|------------|-------|
| `player.inXxx` flag | `player.inHut` | No `player.inDungeon` | `player.inMaze` | **Dungeon missing flag** — uses `player.inHut` as proxy (line 4640, 5040) |
| `game.xxxInterior` | `game.hutInterior` | Uses `game.dungeonFloors[]` + `game.dungeonCurrentFloor` | `game.mazeInterior` | Different data model for dungeon |
| `game.update()` call | `hutSystem.update(deltaTime)` | `dungeonSystem.update(deltaTime)` | `mazeSystem.update(deltaTime)` | All three wired |
| `handleSpacePress()` | `hutSystem.handleSpacePress()` | `dungeonSystem.handleSpacePress()` | `mazeSystem.handleSpacePress()` | All three wired |
| `handleShiftPress()` | None | `dungeonSystem.handleShiftPress()` | None | Asymmetric |
| Exterior freeze guard | `if (player.inHut || player.inMaze)` | Covered by `player.inHut` proxy | `if (player.inHut || player.inMaze)` | Dungeon incorrectly reuses `inHut` flag |
| PiP reset on REST | `hutInterior = null` | `dungeonFloors = []` / `dungeonCurrentFloor = -1` | `mazeInterior = null` | OK |
| PiP reset on room transition | Same as REST | Same as REST | Same as REST | OK |
| `_activeBackgroundObjects()` | Returns hutInterior.backgroundObjects when `inHut` | Returns hutInterior.backgroundObjects | Returns mazeInterior empty array | Dungeon uses hutInterior array — coupling |
| `_activeEnemies()` | Returns hutInterior enemies when `inHut` | Returns hutInterior enemies when `inHut` | Returns mazeInterior enemies when `inMaze` | Dungeon piggybacks on hutInterior |

**Key inconsistency**: DungeonSystem has no dedicated `player.inDungeon` flag. Instead it reuses `player.inHut = true` when the player enters the dungeon (see line 4640 where `player.inHut && this.dungeonSystem.handleSpacePress()` is checked). This is a semantic leakage — "in dungeon" reads as "in hut" throughout the physics and enemy-freeze logic. If hut and dungeon could both be active (or overlap in the same room), this would break.

---

## System Wiring Audit

All major systems instantiated in the constructor are called in the update loop:

| System | Instantiated | Called in update loop | Notes |
|--------|-------------|----------------------|-------|
| `animationSystem` | line 85 | `isAnimating()` checked in update, not `update()` called | AnimationSystem advances via `animateExitWarp` callback — OK |
| `enemySpawnSystem` | line 86 | `queueRequest()` + `flush()` in updateExploreState | OK |
| `pressSystem` | line 88 | Only `handleSpacePress()` — no `update()` call | Unclear if PressSystem needs a tick |
| `bossSystem` | line 91 | `update(deltaTime)` in updateExploreState | OK |
| `boulderSystem` | line 92 | `update(deltaTime)` in updateExploreState | OK |
| `spellSystem` | line 93 | No `update()` call found in update loop | SpellSystem is event-driven, likely OK |
| `ridgeSystem` | line 94 | Conditionally called only if `currentRoom.type === 'RIDGE'` (line 2916) | OK |
| `polymorphSystem` | line 95 | `update(deltaTime, this)` in updateExploreState | OK |
| `magicSystem` | line 96 | `update(deltaTime)` in updateExploreState | OK |
| `wellSystem` | line 97 | `update(deltaTime)` in updateExploreState | OK |
| `campNPCSystem` | line 98 | `update(deltaTime)` in updateExploreState | OK |
| `craftingSystem` | earlier | No update loop call | Purely reactive (event-driven) — OK |
| `lootSystem` | earlier | No update loop call | Purely reactive — OK |
| `trapSystem` | earlier | Multiple calls in updateExploreState | OK |
| `interactionSystem` | earlier | `update(deltaTime, ...)` in updateExploreState | OK |
| `characterSystem` | earlier | No update loop call | Reactive — OK |
| `menuSystem` | earlier | `updateTombstonePopup` + `updateSlotPopup` in updateRestState | OK |
| `neutralRoomSystem` | earlier | `update()` in updateNeutralState | OK |
| `fishingSystem` | earlier | `update()` in updateExploreState | OK |
| `hutSystem` | earlier | `update()` in updateExploreState | OK |
| `dungeonSystem` | line 89 | `update()` in updateExploreState | OK |
| `mazeSystem` | earlier | `update()` in updateExploreState | OK |
| `planeSystem` | not visible in constructor range | Not confirmed | Cannot verify from this range |

**Notable gap**: `pressSystem` has no `update(dt)` call observed in any state update. If it is purely event-driven this is intentional, but worth confirming it doesn't need a tick.

---

## Render Dispatch Analysis

### `render(alpha)` — lines 5735–5758

**Verdict: Mostly clean.** The method dispatches to `RenderController` per state and adds two post-state overlays (cleanseWave, bossDefeatFlash). This is acceptable orchestration.

**Minor concern**: The post-state overlays are guarded by:
```
if (state !== GAME_STATES.TITLE && state !== GAME_STATES.GAME_OVER)
```
This means if a new state is added (e.g., PAUSE), the developer must remember to add it to these exclusion lists. A more robust pattern would be a flag on the state definition (`state.allowsOverlays`). Not a bug, but a maintenance liability.

**No embedded render logic** — all actual rendering is in `RenderController` and its sub-renderers.

---

## Method Catalog

| Method | Line | Purpose | Belongs in main.js? | Notes |
|--------|------|---------|---------------------|-------|
| `updateRestState(dt)` | 2697 | REST mode tick | Partially | Contains duplicated ingredient loop |
| `updateGameOverState(dt)` | 2794 | GAME_OVER tick | Yes | Clean |
| `updateExploreState(dt)` | 2839 | EXPLORE mode tick | Partially | ~1800 lines, heavy inline logic |
| `enterNeutralState()` | 1982 | NEUTRAL entry setup | Yes | Minimal, clean |
| `updateNeutralState(dt)` | 1992 | NEUTRAL tick | Partially | Ingredient loop duplication, exit restore logic |
| `enterGameOverState()` | 2104 | GAME_OVER entry | Yes | Clean |
| `preloadRoomPreviews()` | 2129 | Delegate to RoomGenerator | Yes (thin wrapper) | OK |
| `_activeBackgroundObjects()` | 2136 | Interior-aware BG object accessor | Yes | Shared accessor, clean |
| `_activeEnemies()` | 2143 | Interior-aware enemy accessor | Yes | Clean |
| `_countedEnemies()` | 2155 | Filter mimics from room-clear check | No | Logic belongs in RoomGenerator or EnemySpawnSystem |
| `_applyShamanBuff()` | 2168 | Apply speed/damage buff to nearby enemies | No | Belongs in Enemy.js or CombatSystem |
| `handleSpacePress()` | 4617 | Input dispatch for SPACE | Partially | Contains inline state logic (REST bundle scatter, GAME_OVER character swap, item spawning) |
| `handleShiftPress()` | 5013 | Input dispatch for SHIFT | Partially | Direct `this.trapSystem` and `this.ridgeSystem` calls are OK; inline inventory clear in GAME_OVER is not |
| `handleSelectSlot()` | 5057 | Slot selection | Yes | Clean |
| `handleMPress()` | 5069 | Maze test room shortcut | No | Should route through CheatMenu |
| `handleVPress()` | 5076 | Toggle vector viz | No | Dev tool, belongs in CheatMenu |
| `spawnCheatItem()` | 5082 | Cheat item spawning | No | Belongs in CheatMenu |
| `handleZoneTeleport()` | 5120 | Cheat: teleport to zone | No | Full room setup logic; belongs in CheatMenu |
| `handleDepthJump()` | 5214 | Cheat: jump to depth | No | Full room setup logic; belongs in CheatMenu |
| `handleBossTest()` | 5268 | Cheat: test boss room | No | Belongs in CheatMenu |
| `handleRoomWarp()` | 5320 | Cheat: warp to room letter | No | Full room setup; belongs in CheatMenu |
| `enterMazeTestRoom()` | 5428 | Dev maze test entry | No | Bypasses state machine, belongs in CheatMenu |
| `tryPickupItem()` | 5485 | Delegate to InventorySystem | Yes (thin wrapper) | Acceptable; handles result side effects |
| `applyBlessing()` | 5517 | Apply permanent blessing buff | No | Direct player stat mutation; belongs in CharacterSystem or Player.js |
| `placeTrap()` | 5547 | Delegate to TrapSystem | Yes (thin wrapper) | 2-line wrapper |
| `updatePlacedTraps()` | 5551 | Delegate to TrapSystem | Yes (thin wrapper) | 2-line wrapper |
| `updateExitCollisions()` | 5555 | Delegate to ExitSystem | Yes (thin wrapper) | 2-line wrapper |
| `findNearbyBackgroundObject()` | 5559 | Delegate to InteractionSystem | Yes (thin wrapper) | 2-line wrapper |
| `interactWithObject()` | 5563 | Delegate + sound event | Yes | Appropriate coordination |
| `handleObjectEffect()` | 5568 | Delegate to InteractionSystem | Yes (thin wrapper) | OK |
| `spawnLoot()` | 5572 | Delegate to LootSystem | Yes (thin wrapper) | OK |
| `spawnIngredientDrop()` | 5576 | Delegate to LootSystem | Yes (thin wrapper) | OK |
| `spawnItemDrop()` | 5580 | Delegate to LootSystem | Yes (thin wrapper) | OK |
| `findSpawnPosition()` | 5585 | Delegate to RoomGenerator | Yes (thin wrapper) | OK |
| `executeCleanse()` | 5593 | CLEANSE wish — clear entities + destroy slot | No | 45-line slot mutation + entity clear; belongs in SpellSystem or WishSystem |
| `executeRevive()` | 5644 | REVIVE wish — restore player, bypass GAME_OVER | No | 80-line player restoration; belongs in SpellSystem or WishSystem |
| `bankLoot()` | 5724 | Delegate to InventorySystem | Yes (thin wrapper) | OK |
| `render(alpha)` | 5735 | Render dispatch | Yes | Clean |
| `updateUI()` | 5767 | Delegate to MenuSystem | Yes (thin wrapper) | OK |
| `openEquipmentMenu()` | 5772 | Delegate to MenuSystem | Yes (thin wrapper) | OK |
| `openChestRetrievalMenu()` | 5776 | Delegate to MenuSystem | Yes (thin wrapper) | OK |
| `openCraftingMenu()` | 5780 | Delegate to MenuSystem | Yes (thin wrapper) | OK |
| `closeMenu()` | 5784 | Delegate to MenuSystem | Yes (thin wrapper) | OK |
| `selectMenuItem()` | 5788 | Delegate to MenuSystem | Yes (thin wrapper) | OK |
| `handleCenterSlotSelection()` | 5792 | Delegate to MenuSystem | Yes (thin wrapper) | OK |
| `getIngredientData()` | 5796 | Direct INGREDIENTS lookup | No | Belongs in a data utility or InventorySystem |

---

## Orchestration Rule Violations

### High-severity (logic that should be in a system):

1. **Boar charge wall-stun + player contact damage** (lines 3364–3419): ~56 lines of charge state machine inside the enemy update loop. All state belongs in `Enemy.js`. The contact damage application (`this.player.takeDamage(...)`) performed here bypasses `CombatSystem`.

2. **Polymorph outcome table** (lines 3788–3832): 45-line outcome selection logic (background objects, enemy swaps, item drops, boss spawns). Belongs in `PolymorphSystem.resolveOutcome()`.

3. **Goo blob hit detection** (lines 3610–3638): Iterates `combatSystem.meleeAttacks` directly. Belongs in `CombatSystem` or `GooSystem`.

4. **Fishing reward object hit detection** (lines 3641–3663): Same pattern. Belongs in `FishingSystem`.

5. **Enemy death loop inline logic** (lines 3983–4082): Spell learning on death (lines 4031–4033), mana drop logic (lines 4051–4061), and death explosion creation (lines 4007–4028) all belong in `Enemy.js` or `EnemySpawnSystem.handleEnemyDeath()`.

6. **Room clear side effects** (lines 4362–4418): The pre-boss gate injection (lines 4402–4411) directly mutates `currentRoom.exits` and calls `audioSystem.startBossAnticipation()`. Should be delegated to `BossSystem.checkPreBossGate()`.

7. **Exit crossing detection** (lines 4435–4612): 180 lines of copy-pasted north/east/west detection blocks. Should all be in `ExitSystem.checkExits()` returning a direction + exit object.

8. **`applyBlessing()`** (line 5517): Direct `this.player.damageBuff`, `this.player.maxHp` mutation. Belongs in `CharacterSystem` or `Player.applyBlessing()`.

9. **`executeCleanse()` / `executeRevive()`** (lines 5593, 5644): Full wish-execution logic including slot destruction, entity clearing, and state bypass. Belongs in a `WishSystem` or `SpellSystem`.

10. **`enterRestState()` builds collision map inline** (lines 839–867): 30-line manual collision map construction that belongs in `RoomGenerator.generateRestRoom()` or a similar factory.

11. **Cheat methods** (`handleZoneTeleport`, `handleDepthJump`, `handleBossTest`, `handleRoomWarp`, `enterMazeTestRoom`): All five contain full room-generation, physics-reset, and entity-wiring sequences. These belong in `CheatMenu.js` with `game` passed as context.

12. **Ingredient attraction loop** (lines 2722–2763, 2004–2046, 4289–4333): Identical 40-line O(n²) physics block duplicated verbatim in all three state updaters. Should be extracted to `updateIngredientAttraction(deltaTime)` in main.js or delegated to `PhysicsSystem`.

### Medium-severity:

13. **`_countedEnemies()`** (line 2155): Filtering logic (hidden mimics) belongs in `EnemySpawnSystem` or `RoomGenerator`.

14. **`_applyShamanBuff()`** (line 2168): Enemy stat mutation. Belongs in `Enemy.js` as `applyShaman(buffData)`.

15. **`_spawnEnemyTrailPuddle()`** (line 2160): Puddle creation on behalf of enemies. Belongs in `TrapSystem.spawnPuddle()` with enemy plane parameter.

16. **Pack behavior sync** (lines 3282–3339): Two parallel pack behavior implementations (old `packBehavior` object, new `packCoordination` boolean). Should consolidate in `Enemy.js`.

17. **`handleSpacePress()` — GAME_OVER character swap** (lines 4725–4829): 100 lines of inventory clearing, character resetting, and run-state resets. The character-death swap block belongs in `CharacterSystem.handleDeath()` and the full game-over reset belongs in a `GameResetSystem` or `handleGameOver()` method.

18. **`handleSpacePress()` — REST bundle scatter** (lines 4841–4865): Item spawning logic (ingredient creation, physics registration) belongs in `InventorySystem` or `LootSystem`.

---

## Bugs & Logic Errors

### Confirmed bugs:

**B1** — `player.x` / `player.y` property access in cheat methods (lines 5148, 5228, 5286):
```js
const playerPos = { x: this.player.x, y: this.player.y };
```
`Player` uses `player.position.x` / `player.position.y`. `player.x` and `player.y` are `undefined`, so `playerPos` is `{ x: undefined, y: undefined }` in all three cheat methods (`handleZoneTeleport`, `handleDepthJump`, `handleBossTest`). Room generation receives undefined spawn positions. This is a confirmed bug affecting all three cheat teleport functions.

**B2** — `escapeRoute` variable assigned but never used (line 4502):
```js
const escapeRoute = this.currentRoom.exitsLocked && this.playerHasNoItems();
```
The variable is computed but never referenced again. The comment implies it was intended to change behavior (e.g., banking or messaging) but doesn't. Dead assignment.

**B3** — `letterPath` variable assigned but never used in three places (lines 4450, 4535, 4576):
```js
const letterPath = this.zoneSystem.pathHistory.map(exit => exit.letter).join('-');
```
In each of the north/east/west exit handlers, `letterPath` is computed but only used via `secret = this.exitSystem.checkSecretPattern(this.zoneSystem.pathHistory)` which takes the raw `pathHistory` array, not `letterPath`. The variable was likely leftover from a refactor where secret pattern checking was moved to `ExitSystem`. Dead computation on every exit.

**B4** — `forceZone` only handled on north exit (line 4484), not east or west:
```js
if (exitObj?.forceZone) {
  this.zoneSystem.forceNextZone(exitObj.forceZone);
}
```
The north exit handler has this block; the east (line 4565) and west (line 4606) handlers do not. If a `forceZone` east or west exit is ever configured, the zone will not be set correctly.

**B5** — `dungeonSystem.handleSpacePress()` guarded by `player.inHut` (lines 4640, 5040):
```js
if (this.player.inHut && this.dungeonSystem?.handleSpacePress()) return;
```
This is logically wrong. DungeonSystem should have its own `player.inDungeon` flag. Currently, "is the player in the dungeon" is expressed as "is `player.inHut` true", which collides with the actual HutSystem. If a dungeon and a hut could ever coexist in the same room (or the semantics diverge), this guard will produce incorrect behavior.

**B6** — Dead variable `latestMemoryTime` (line 3322):
```js
let latestMemoryTime = 0;
```
This variable is declared but never updated or read inside the loop. The intent was to select the *most recent* memory mark, but `aggroMemoryActive` is used instead without any timestamp. Dead code that makes the intent misleading.

**B7** — Dead variable `potentialMates` (line 3304):
```js
const potentialMates = this.currentRoom.enemies.filter(other => other !== enemy && other.char === enemy.char);
```
Computed and never used. The subsequent `enemy.packmates = ...` does the same filter with added distance. Pure dead computation each frame for every pack enemy.

**B8** — Dead debug block in three places (lines 3257, 4910, 4962):
```js
if (weapon.data.weaponType === 'WAND') {
  const enemies = this.currentRoom ? this.currentRoom.enemies : [];
}
```
An empty if-block with a locally scoped unused variable. No-op code. Appears in `updateExploreState` auto-attack, `handleSpacePress` REST attack, and `handleSpacePress` EXPLORE attack.

**B9** — `stateMachine.currentState` directly mutated (lines 5482, 5718):
```js
this.stateMachine.currentState = GAME_STATES.EXPLORE;
```
Both `enterMazeTestRoom()` and `executeRevive()` bypass `stateMachine.transition()`, which means any `enter*State()` hook is skipped. For `executeRevive()`, this is intentional (documented). For `enterMazeTestRoom()`, the comment says "don't call transition — that would trigger enterExploreState and overwrite our maze", but this is an architectural smell: the enter-state handler should be able to accept a pre-generated room.

**B10** — Pre-boss gate uses hardcoded depth `14` (line 4405):
```js
if (preBossDepth === 14 && !this.zoneSystem.defeatedBosses?.has(preBossZone)) {
```
`handleBossTest()` at line 5280 reads `ZONES[targetZone]?.bossDepth ?? 15`, suggesting `bossDepth` is supposed to come from zone config. The pre-boss gate check ignores the zone config and hard-codes `14`. If zones ever have different boss depths, this will not trigger correctly.

**B11** — `gooTrailTimer === undefined` lazy init (line 3494):
```js
if (enemy.gooTrailTimer === undefined) {
  enemy.gooTrailTimer = 3.0;
}
```
Per CLAUDE.md Architectural Compromises, this is explicitly flagged as an anti-pattern. Timer should be initialized in the Enemy constructor or factory, not lazily in the update loop.

---

## Missing Null Checks

**N1** — `this.currentRoom.backgroundObjects` filter after destroyed-object removal (line 4279):
```js
this.currentRoom.backgroundObjects = this.currentRoom.backgroundObjects.filter(obj => !obj.destroyed);
this.backgroundObjects = this.currentRoom.backgroundObjects;
```
No null check on `this.currentRoom`. While `updateExploreState` has an early return `if (!this.currentRoom)` at the top, the filter is near line 4279 — after many code paths that could theoretically transition state. Low risk but worth guarding.

**N2** — `this.hutInterior.backgroundObjects` filter (line 4282):
```js
if (this.hutInterior) {
  this.hutInterior.backgroundObjects = this.hutInterior.backgroundObjects.filter(...);
}
```
This is correctly guarded. Note however that `mazeInterior` and `dungeonFloors` destroyed-object cleanup is not performed in this same block, leaving potential for stale destroyed objects in those interiors.

**N3** — `this.player?._lastAttacker` null chain (line 3915):
```js
const killer = this.player._lastAttacker;
if (killer && killer.data) { ... }
```
`this.player` is accessed without optional chaining here. While `player` is always expected to exist by this code path, it is inconsistent with patterns elsewhere that use `this.player?.`.

**N4** — `this.zoneSystem.defeatedBosses?.has(preBossZone)` (line 4405): Correct optional chain, but `defeatedBosses` is not initialized in the visible constructor range of `ZoneSystem`. If it is initialized lazily, there is a frame window where this could be undefined without the `?.` guard. Flagged for verification.

**N5** — Enemy `steamClouds` array pushed per frame (lines 4352–4355):
```js
for (const enemy of this.currentRoom.enemies) {
  enemy.steamClouds = this.steamClouds;
}
```
This overwrites enemy.steamClouds with the game's array reference every frame. If `currentRoom.enemies` is null (possible during state transitions), this would throw. No null check.

---

## Dead Code

| Location | Code | Reason |
|----------|------|--------|
| Line 4502 | `const escapeRoute = ...` | Assigned, never read |
| Lines 4450, 4535, 4576 | `const letterPath = ...` | Computed, never used in any branch |
| Line 3322 | `let latestMemoryTime = 0;` | Declared, never incremented or read |
| Line 3304 | `const potentialMates = ...` | Computed, never used |
| Lines 3257, 4910, 4962 | Wand debug if-block with `const enemies = ...` | Empty block, unused local variable |
| Lines 4549–4553 | `else if (result === 'continue') { // Fall through }` / `else { // Fall through }` | Empty branches; Leshy chase east/west handling identical to north but with extra indentation inconsistency |

---

## Cross-Reference Notes

1. **Ingredient attraction O(n²) loop** — duplicated in `updateRestState` (~line 2722), `updateNeutralState` (~line 2005), and `updateExploreState` (~line 4289). A single `_updateIngredientAttraction(deltaTime)` private method would eliminate 120 lines of duplication.

2. **Cheat teleport methods** — all five (`handleZoneTeleport`, `handleDepthJump`, `handleBossTest`, `handleRoomWarp`, `enterMazeTestRoom`) share a common room-setup sequence: generate room → set collision → wire enemies → grace period → reset physics → reset combat → redraw. This sequence is a candidate for `_activateRoom(room, zone)` helper. It is currently repeated 5 times with minor variations.

3. **`executeRevive()` and `executeCleanse()`** share a slot-destruction code block (approximately lines 5596–5616 and 5649–5678). The slot destruction logic is identical and should be extracted to `_destroySlot(slotIdx)`.

4. **Exit handlers** — north/east/west blocks are structurally identical except for the direction string and exit zone. Deduplication into a single `_handleDirectionalExit(direction, exitObj, secret)` call would reduce 180 lines to ~30.

5. **`enterRestState()` builds the REST collision map manually** (lines 839–867). This is the only place in the codebase where a collision map is constructed outside `RoomGenerator`. It is a subtle violation of the room-generation separation of concerns.

6. **`handleSpacePress()` GAME_OVER reset block** (lines 4753–4828): This 75-line block resets zone depths, inventories, known spells, magic meter, well state, character system, bosses, and audio. It is effectively a `resetGame()` method inlined into the input handler. Should be extracted.

7. **Pack behavior: two implementations** — `packBehavior` (old, object-based) and `packCoordination` (new, boolean) run side-by-side in the same loop (lines 3282–3339). The old implementation has a dead variable (`potentialMates`, B7 above) suggesting it was partially refactored. The two systems should be unified or the old one removed.

8. **`_emitSoundEvent()` + `playWeaponAttackSFX()`** — called after attacks in three separate places in `updateExploreState` and once in `updateRestState`. If audio triggering after melee attacks is always the same pair of calls, they should be consolidated inside `CombatSystem.createAttack()` or the weapon item itself.

---

*Review generated: 2026-05-15. Covers lines 3000–5804 of `/Users/thomaslarson/gamedev/ascii-roguelike/src/main.js`.*
