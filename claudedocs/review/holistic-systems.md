# Holistic Systems Analysis
_Synthesized from 7 sub-agent reports. Date: 2026-05-15._

---

## Systems Health Summary

**Combat & Physics** — Needs Work. CombatSystem is functionally complete but carries 19 catalogued bugs, the most severe being the `clear()` method that omits 8 arrays (stale events fire in the wrong room) and split projectiles that inherit no properties. PlaneSystem adoption is partial and inconsistent: the projectile path uses it correctly while 6 other methods in the same file bypass it. PhysicsSystem's O(n²) terrain scan is the dominant per-frame cost driver. Staff block absorbs projectiles silently rather than deflecting them (contradicts CLAUDE.md documentation).

**World & Level** — Needs Work. The single most critical game-breaking bug in the entire codebase lives here: zone bosses (GooDragon, Ancient Turtle, LakeBoss) are unreachable through normal gameplay because `isZoneBossRoom` is stamped on the generator instance and never written to the room object. Four of six secret letter patterns are detected but have no handlers. The `canPlaceSign` crash on undefined `data` fields is a codepath reachable in any room with a recipe sign attempt. RoomGenerator is otherwise solid at 3423 lines.

**Inventory & UI** — Needs Work. Two consumable items (`auto_dodge`, `panic_blind`) are entirely dead in EXPLORE because they fall through the trigger switch. Consumable slots 4–5 are unlockable but cannot be equipped via the menu. The `bankLoot` / `setActiveCharacter` desync means the active slot index is wrong for non-default characters after the first bank cycle. The ingredient loop is duplicated three times across state updates. CraftingSystem itself is clean.

**Character & NPC** — Needs Work. Three of six weapon affinities (Red Warrior melee windup, Yellow Mage gun fire rate, Gray Assassin trap capacity) are dead data — defined in `characters.js` but never consumed. Stage-0 errands are permanently uncomplectable due to `.char` access on strings. The companion (`game.companion`) is never initialized in the constructor and never cleared on death. CampNPCSystem bypasses PlaneSystem entirely.

**Support Systems** — Critical for two entries, otherwise functional. PersistenceSystem is described as "permanently disabled" in CLAUDE.md but is fully operational code that reads/writes localStorage. BossSystem has no Yellow zone boss and silently spawns a GooDragon instead. BoulderSystem's north/south direction vectors are inverted. These three bugs are concrete, confirmable gameplay failures. AudioSystem, SpellSystem, AnimationSystem, and WellSystem (minus one broken method call) are healthy.

**main.js Orchestration** — Critical. At approximately 5,800 lines, `main.js` contains the most severe architectural violations in the project. `updateExploreState` alone is ~1,800 lines with 26 documented inline logic blocks that belong in existing systems. The ingredient attraction loop is triplicated verbatim across three state updaters. The exit-crossing detection is quadruplicated (north/east/west/south). Five cheat methods that are room-generation sequences live in main.js rather than CheatMenu. The `handleSpacePress` GAME_OVER reset block is a 75-line `resetGame()` inlined into an input handler. Four properties are never declared in the constructor (lazy init anti-pattern). Three cheat teleport methods pass `player.x`/`player.y` instead of `player.position.x`/`player.position.y`, breaking all cheat teleports.

---

## Cross-Cutting Patterns

### PlaneSystem Adoption Inconsistency
PlaneSystem was introduced as the canonical predicate but adoption is uneven. Files that **partially or fully bypass it**:
- `CombatSystem.js` — melee loops use `planeOf(enemy) !== (attack.shooterPlane ?? 0)` (raw integer compare) instead of `inSamePlane`. Six area-effect methods (`createChainLightning`, `createExplosion`, `applyAOEStatus`, `checkProximity`, `updateRollDamage`, `conductElectricity`) have **no plane filter at all**.
- `CampNPCSystem.js` — all three plane checks use `(entity.plane ?? 0) !== npc.plane` directly.
- `TrapSystem.js` — four plane checks use raw `.plane` comparisons.
- `PhysicsSystem.js` — has an intent comment referencing PlaneSystem but reads `.plane` directly at multiple lines.
- `main.js` — GooBlob plane check at lines 2350/2359 is a direct comparison. Exit-zone checks at lines 4447–4573 compare `(player.plane ?? 0) === 0` directly.
- `InteractionSystem.js` — captive interaction has **no plane check at all**.

Only `PhysicsSystem.resolveEntityContacts` and the projectile collision path in CombatSystem consistently use the canonical predicates.

### State That Lives on `game` but Belongs in Systems
The following properties are on `game` but should reside in the named system:

| Property | Should be in |
|----------|-------------|
| `currentMusicZone`, `waveSfxTimer`, `_energyReloadItem` | AudioSystem |
| `bossDefeatFlash`, `preBossGateActive` | BossSystem |
| `cleanseWave`, `wishesUsed` | SpellSystem |
| `characterDeathPending`, `pendingNextCharacter`, `characterDeathTimer`, `lastDeathCause`, `tombstoneActive`, `tombstonePopup`, `unlockedCharacters`, `activeCharacterType`, `deadCharacters`, `characterNPCs` | CharacterSystem |
| `exitPathHistory`, `zoneDepths` | ZoneSystem |
| `slotPopup`, `pickupMessage`, `pickupMessageTimer`, `pickupMessageQueue`, `pathAnnouncement`, `pathAnnouncementTimer` | MenuSystem |
| `cureRusalka` | FishingSystem |
| `playerTongueAttacks` | PolymorphSystem |
| `wellCoinAnim`, `wellFlashTimer`, `wellFlashDuration` | WellSystem |
| `dodgeBlockedFeedbackTimer`, `attackSequenceActive` | Player |
| `glitterTimer`, `GLITTER_SPAWN_INTERVAL` | InteractionSystem |
| `inactivityTimer`, `wasdBlinkTimer`, `wasdBlinkState` | RenderController |
| `_savedDestroyedSlots` | InventorySystem |

An estimated 20+ properties that could cleanly migrate to existing systems remain on `game`.

### O(n²) Loops and Performance Clusters
- **PhysicsSystem.update()** terrain scan: every entity × every background object every frame. At 30 entities + 100 objects = 3,000 AABB tests/frame. No spatial partitioning.
- **PhysicsSystem.resolveSolidObjectOverlap()**: 4 passes × same counts. Worst case 12,000 additional tests/frame.
- **Ingredient attraction/separation** in `updateRestState`, `updateNeutralState`, `updateExploreState`: O(n²) loop duplicated verbatim three times (~45 lines each). No extraction into a shared method.
- **CombatSystem projectile × bg objects**: O(P × O) at line 226. With P=20 spread projectiles and O=100 objects: 2,000 checks/frame.
- **Homing targeting**: O(enemies) per homing projectile per frame, with no plane filter. Multiple simultaneous homing missiles multiply cost.
- **Pack behavior sync** (main.js lines 3282–3339): Two implementations running in parallel per frame for every pack enemy; old `potentialMates` computation is dead work.

### Dead Code Across Multiple Systems
- `markRandomBushShaking()` in RoomGenerator — never called; predates secret event system.
- `ZoneSystem.bossRoomPending` — initialized false, set false in `markBossDefeated`, never set true.
- `MazeSystem._ghostCollides()` and `_overlapsCell()` — defined but never called.
- `FishingSystem.findWaterTileAtDistance()` — dead code; charge path changed.
- `PolymorphSystem`: `player._killedByGhost = true` set in MazeSystem, never read.
- `BossSystem._meleeFacingToward()` receives `_atk` parameter but never uses it.
- `main.js` lines 4502 (`escapeRoute`), 4450/4535/4576 (`letterPath`), 3322 (`latestMemoryTime`), 3304 (`potentialMates`), 3257/4910/4962 (wand debug empty blocks): all dead assignments computed every frame.
- `saveGameState()` in main.js — entire body commented out; call site at end of `enterRestState` is a no-op.
- `getRecipeResult()` in `recipes.js` — exported but never used.
- `RoomGenerator.L_BOSS` template — unreachable; no EXIT_LETTERS entry.

### Initialization / Reset Omissions That Survive Death
- `game.companion` never initialized in constructor and never cleared on game-over reset. Stale companion NPC persists into the next run.
- `CraftingSystem.discoveredPairs` and `failedPairs` — never reset on death. Cross-run recipe knowledge leaks implicitly.
- `InventorySystem._auraRollPulseUsed` — never reset between rooms; pulse fires once per run, not once per room.
- `main.js._energyReloadItem` — never declared in constructor; falsy-check passes differently than intended on first frame.
- `main.js.roomEntryGraceTimer` — lazy init at call site.
- `main.js._savedMagicMeter` — set but never declared.
- `main.js.savedExploreState` — set in `transitionToNeutralRoom`, never declared in constructor.
- `main.js.savedExploreEnemies` / `savedExploreBackgroundObjects` / `savedExploreCaptives` — read with spread before first write.
- `enemy.gooTrailTimer` — lazy init at line 3494 instead of Enemy constructor.
- `entity.lavaDamageTimer` — lazy init at damage-application site (line 2987).

### Triplication of Ingredient Loop
The O(n²) ingredient attraction and separation loop appears at:
1. `updateRestState` (~lines 2722–2763) 
2. `updateNeutralState` (~lines 2005–2046)
3. `updateExploreState` (~lines 4289–4333)

All three are byte-for-byte identical. This is the clearest single extraction target in the codebase.

### Interior System Inconsistency
DungeonSystem deviates from the HutSystem/MazeSystem pattern in one critical way: it has no dedicated `player.inDungeon` flag. It reuses `player.inHut = true`. This means "player is in dungeon" is indistinguishable from "player is in hut" throughout physics, enemy-freeze guards, and `_activeEnemies()`. If hut and dungeon ever coexist, behavior will be incorrect. All three systems piggyback interior helpers through `hutInterior` data structures for dungeon — coupling that should be resolved when a fourth interior is added.

### Semantic Leak: `NeutralRoomSystem.currentScript` Exposed to Renderer
`NeutralRenderer.js` reads `game.neutralRoomSystem.currentScript?.onRender` and `currentScript.onRenderBefore` directly rather than going through system methods. This bypasses the public API and forces the renderer to understand internal system state. Pattern appears in one location but is the canonical example of renderer-system coupling that should be avoided.

---

## Consolidated Bug Registry — Systems

All bugs from all seven reports, ranked by severity:

| Rank | Severity | System/File | Bug | Impact |
|------|----------|-------------|-----|--------|
| 1 | P1 | BossSystem / RoomGenerator | Zone boss never activates in normal gameplay — `isZoneBossRoom` set on generator instance, never stamped onto room object; `BossSystem.activate` never called; GooDragon, Ancient Turtle, LakeBoss unreachable | Core endgame feature completely broken |
| 2 | P1 | PersistenceSystem | Described as "permanently disabled" in CLAUDE.md but contains fully operational localStorage read/write. Violates no-persistence design constraint if called from main.js | Design integrity violation; potential cross-run data corruption |
| 3 | P1 | CombatSystem.clear() | 8 arrays not cleared on room change: `pendingEnemyProjectiles`, `pendingMeleeAttacks`, `aoeEffects`, `shockwaveEvents`, `chainArcs`, `polymorphEvents`, `impactEffects`, `newSteamClouds`, `objectDestroyEvents`. Stale events fire in the new room; `objectDestroyEvents` can trigger loot drops in the wrong room | Cross-room event contamination |
| 4 | P1 | InventorySystem / MenuSystem | `auto_dodge` (Fur Cloak) and `panic_blind` (Bone Dust) fall through `_checkTriggerCondition` default. Items equip correctly but never activate | Two items permanently dead in EXPLORE |
| 5 | P1 | MenuSystem | `selectMenuItem()` has no handler for `consumable4` or `consumable5` slots. Players who unlock slots 4–5 cannot equip items to those slots | Unlocked feature non-functional |
| 6 | P1 | ErrandSystem | Stage-0 `checkGive()` calls `.char` on inventory strings (`player.inventory` is `string[]`). `findIndex` always returns -1. Stage-0 errands permanently uncomplectable | Core quest mechanic broken |
| 7 | P1 | CombatSystem (staff block) | Tongue attacks ignore `player.isStaffBlocking` — tongue pierces staff block | Documented ability doesn't protect against a class of attack |
| 8 | P1 | CombatSystem (staff block) | Sap damage applied directly with no staff block or shield check | Same coverage gap as tongue |
| 9 | P1 | CharacterSystem | Red Warrior melee windup reduction, Yellow Mage gun fire rate, Gray Assassin trap capacity affinities all defined in `characters.js` but never consumed anywhere in the codebase | Three character abilities silently broken |
| 10 | P1 | PhysicsSystem | `resolveTunnelWallOverlap` pushes 2px per frame regardless of deltaTime — framerate-dependent; at 30fps entities pushed half as fast as at 60fps | Physics inconsistency on non-60hz displays |
| 11 | P1 | RoomGenerator.canPlaceSign | `bgObj.data.solid` throws if `bgObj.data` is undefined (slope tiles, cave wall chars, glitter markers) — crashes room generation | Crash during room gen in any room with recipe sign attempt |
| 12 | P1 | RoomGenerator.spawnEnemiesFrom | `findSpawnPosition` null return not guarded — `new Enemy(char, null?.x, null?.y)` creates NaN-positioned enemies | Invisible enemies with undefined position join combat |
| 13 | P1 | BossSystem | Yellow zone has no boss; `activate(room, 'yellow')` silently spawns a GooDragon; `_getBossCurrentHp()` returns Infinity for yellow | Boss fight in yellow zone is wrong entity with broken audio |
| 14 | P1 | BoulderSystem | `DIR_VEC` north/south inverted: `north: {dx:0, dy:1}` moves DOWN; `south: {dx:0, dy:-1}` moves UP. Boulders labeled 'north' travel southward | Boulder rain direction is opposite of what labels say |
| 15 | P1 | main.js cheat methods | `handleZoneTeleport`, `handleDepthJump`, `handleBossTest` use `player.x`/`player.y` instead of `player.position.x`/`player.position.y` — undefined values passed to room generation | All three cheat teleport functions broken |
| 16 | P2 | CombatSystem (split projectiles) | Split projectiles inherit no `onHit`, `knockback`, `pierce`, `lifesteal`, `chain`, `explode`, `owner`, `plane` or `shooterPlane` from original. Fire gun split rounds are inert bullets | Weapon mechanic (projectile splitting) loses all properties |
| 17 | P2 | CombatSystem (chain lightning) | No plane filter — chain lightning arcs jump to enemies on wrong plane in U rooms | Cross-plane damage in tunnel rooms |
| 18 | P2 | CombatSystem (explosion) | No plane filter on enemies or bg objects — explosions damage cross-plane enemies | Cross-plane damage |
| 19 | P2 | CombatSystem (wand AOE) | `applyAOEStatus` / `checkProximity` have no plane filter — wand AOE affects cross-plane enemies | Cross-plane effect |
| 20 | P2 | CombatSystem (homing) | Homing target selection has no plane filter — missiles steer toward enemies on wrong plane | Missiles target underground enemies from surface |
| 21 | P2 | CombatSystem (roll damage) | `updateRollDamage` has no plane filter — Red Warrior roll damages wrong-plane enemies | Cross-plane damage |
| 22 | P2 | CombatSystem (electricity) | `conductElectricity` has no plane filter | Cross-plane damage |
| 23 | P2 | CombatSystem | `cancelPendingAttacksFrom` only cancels `pendingEnemyProjectiles`, not `pendingMeleeAttacks`. Dead enemy melee windup fires in next tick | Orphaned attacks from dead enemies |
| 24 | P2 | CombatSystem | Reflected enemy projectile zombie — `reflected=true` projectiles skip all removal logic and travel indefinitely if they don't exit bounds | Permanent zombie projectiles accumulating in long rooms |
| 25 | P2 | CombatSystem | Arrow stuck-to-enemy with no lifetime — if enemy never dies (invulnerable phase), arrow never expires | Memory leak in boss encounters |
| 26 | P2 | CombatSystem | `checkProjectileCollisionWithPlayer` centering offset goes negative for projectiles wider than CELL_SIZE — expands hitbox incorrectly | Unfair damage on oversized boss AOE hitboxes |
| 27 | P2 | CombatSystem | Roll damage bypasses `knockbackResistance` via direct velocity assignment — boss-resistant enemies can be rolled back | Balance inconsistency |
| 28 | P2 | CombatSystem | `_applyCritIfLucky` labels "LUCKY CRIT" when only weapon has critChance, not Lucky Coin/well — misleads player | Incorrect feedback |
| 29 | P2 | CombatSystem | Ricochet projectiles only bounce at canvas edges; do not check collisionMap — ricochet bullets pass through wall cells | Mechanic doesn't respect room geometry |
| 30 | P2 | CombatSystem | `checkMeleeCollision` — `attack.width`/`height` undefined produces silent NaN miss (not crash) | Melee attacks silently never hit if width/height omitted |
| 31 | P2 | RoomGenerator | `getRandomPosition` silent fallback — after 100 failed attempts returns last invalid position without warning | Enemies and items may spawn inside walls or water |
| 32 | P2 | RoomGenerator | Ocean east exit inconsistency — east exit object created then nulled, letter consumed from dedup pool | Minor state inconsistency |
| 33 | P2 | RoomGenerator | `generateOrganicClusters` pre-burned logic never fires — `bgObject.onFire` not defined on BackgroundObject | RED zone pre-burned trees never visually darken |
| 34 | P2 | ZoneSystem | `bossRoomPending` flag set false but never set true — dead state | Dead code on flag that tracks nothing |
| 35 | P2 | ExitSystem | 4 secret patterns (`B-A-D`, `G-O-O-D`, `N-E-W`, `D-E-A-D`) detected but no handler reads `rewardType` — patterns produce no effect | Unimplemented content |
| 36 | P2 | DungeonSystem | `checkStairs()` is an empty stub called in `update()` each frame | Dead method call every frame |
| 37 | P2 | DungeonSystem | Glitter object monkey-patch on `takeDamage` — hardcodes return value, suppresses original effects | Documented anti-pattern actively present |
| 38 | P2 | DungeonSystem | Green dungeon key requirement not enforced — any player can enter any dungeon | Design feature unimplemented |
| 39 | P2 | InventorySystem | `bankLoot()` writes `restActiveSlotIndex` as flat scalar; `setActiveCharacter()` reads from `characterInventories[type].activeSlotIndex` never updated — active slot index wrong after first bank | Character slot index desync |
| 40 | P2 | InventorySystem | `throwSteam` (Steam Vial) has no trigger condition — fires immediately on every cooldown cycle | Consumable spams unconditionally |
| 41 | P2 | InventorySystem | `_auraRollPulseUsed` never reset between rooms — robe pulse fires once per run not once per room | Visual effect regression |
| 42 | P2 | InventorySystem | `steamClouds` local reassignment `if (!steamClouds) steamClouds = [];` cannot affect caller's reference — steam silently dropped when null | Steam consumable silently fails on null parameter |
| 43 | P2 | InventorySystem | `waterImmunityTimer`/`floatTimer` overwrite unconditionally — timer resets instead of extending on re-trigger | Timer regression not extension |
| 44 | P2 | LootSystem | `bonusDrop` passes `enemy.data.dropTable` (may be undefined) to `generateEnemyDrops` — bonus drop silently produces nothing for affinity-based enemies | Luck bonus drops broken for modern enemy types |
| 45 | P2 | LootSystem | `luckMult` only applied in legacy `drops[]` path — affinity-based enemies receive luck bonuses only on drop count, not per-item probability | Asymmetric luck behavior |
| 46 | P2 | CraftingSystem | `discoveredPairs`/`failedPairs` never reset on death — cross-run recipe knowledge leaks | Design intent unclear but implicit persistence exists |
| 47 | P2 | MenuSystem | `game.chestTargetSlot` never cleared in `closeMenu()` — stale slot index lingers | Latent state leak |
| 48 | P2 | CampNPCSystem | `game.companion` never initialized in constructor and never cleared in game-over reset — stale companion persists into next run | Cross-run entity contamination |
| 49 | P2 | CampNPCSystem | Bypasses PlaneSystem for all three plane checks — direct `.plane` comparisons | PlaneSystem contract violation |
| 50 | P2 | InteractionSystem | `checkCaptiveInteraction()` has no plane check — player on plane 1 can free captive on plane 0 through tunnel wall | Cross-plane interaction |
| 51 | P2 | InteractionSystem | `checkCaptiveInteraction()` no duplicate-unlock guard — rapid double-press could push character type twice | Potential duplicate unlock edge case |
| 52 | P2 | InteractionSystem | Shockwave event splice drops all but first event — `splice(0, length)[0]` | Multi-shockwave scenarios lose all but first |
| 53 | P2 | WellSystem | `game.renderer?.markBackgroundDirty?.()` is no-op — method does not exist on renderer | Background not redrawn after well ritual; stale visual |
| 54 | P2 | AudioSystem | `'hit'` SFX called by MazeSystem but never loaded — repeated console warnings during maze play | Missing SFX |
| 55 | P2 | AudioSystem | `'craft'` SFX called by PressSystem but never loaded | Missing SFX |
| 56 | P2 | BossSystem | `_grantBossReward()` gives identical +1 consumable slot for all bosses — no rune delivery | Major design pillar unimplemented |
| 57 | P2 | BossSystem | `_checkReflectedProjectileBossHits()` only handles GooDragon — lake and turtle bosses cannot be stun-reflected | Inconsistent boss mechanic |
| 58 | P2 | MazeSystem | `_ghostCollides()` defined but never called — ghosts can walk through walls (BFS pathing not wall-collision-checked) | Ghost pathfinding can phase through walls |
| 59 | P2 | TrapSystem | `_getActiveEnemies()` ignores `inMaze` — traps in maze act on exterior room enemies | Interior/exterior leak |
| 60 | P2 | MagicSystem | `_activeEnemies()`/`_activeBackgroundObjects()` ignore `inMaze` — wand spells in maze target exterior layer | Interior/exterior leak |
| 61 | P2 | PolymorphSystem | `createTongueAttack()` ignores `inMaze` — tongue targets exterior enemies when inside maze | Interior/exterior leak |
| 62 | P2 | FishingSystem | `spawnAmbientFish()` filters `obj.char === '~'` (puddle) not `'='` (standing water) — fish may not spawn in lake rooms | Core fishing mechanic broken in lake rooms |
| 63 | P2 | RidgeSystem | `_placeBridgeRow()` uses char `'='` (standing water) for planks — crossing triggers puddle physics | Bridge feels like walking on water |
| 64 | P2 | PressSystem | Oil result chars (`🜁 🜂 🜄 🜔`) are U+1F700 alchemical symbols with inconsistent platform rendering | Violates CLAUDE.md character encoding guidance |
| 65 | P2 | NeutralRoomSystem | `currentScript` exposed directly to renderer — semantic leak of internal state | Architecture violation |
| 66 | P2 | main.js | `savedExploreEnemies`/`savedExploreBackgroundObjects`/`savedExploreCaptives` read before declared — spread on undefined throws in edge case | Potential crash on first explore entry if restore path hit |
| 67 | P2 | main.js | `forceZone` only handled on north exit — east and west exits with `forceZone` set won't transition correctly | Zone routing bug for east/west ridge exits |
| 68 | P2 | main.js | DungeonSystem guarded by `player.inHut` — no dedicated `player.inDungeon` flag; dungeon/hut semantics collide | Interior system design flaw |
| 69 | P2 | main.js | Pre-boss gate depth hardcoded to `14` — ignores `ZONES[zone].bossDepth` config; different-depth zones will not gate correctly | Boss gate ignores zone configuration |
| 70 | P2 | main.js | Gray zone enemy buff loop has no boss-check — boss in gray zone gets double-buffed; `hp` and `maxHp` can diverge | Boss balance broken in gray zone |
| 71 | P3 | CombatSystem | `wandProximityFailures` lazy-initialized inside `update()` — not in constructor | Minor inconsistency |
| 72 | P3 | CombatSystem | Melee plane check uses raw `0` literal instead of `PLANE_SURFACE` constant in 2 places | Code style inconsistency |
| 73 | P3 | CombatSystem | `_applyCritIfLucky` returns inconsistent values (`false`/`true`/`undefined`) from different paths | Inconsistent return contract |
| 74 | P3 | ZoneSystem | `toJSON` omits `leshyChaseActive`, `leshyChaseCount`, `defeatedBosses`, `bossRoomPending` | Serialization gap (low risk while persistence disabled) |
| 75 | P3 | AudioSystem | `setVolume()` has no effect during boss-sequence mode — music volume change mid-boss ignored | Volume control regression in boss |
| 76 | P3 | AudioSystem | `craft_cycle` SFX registered but file `sfx-craft-cycle.mp3` absent — silent load failure | Missing asset |
| 77 | P3 | MazeSystem | `_onTimerExpired` docs say "4 cumulative spawns" triggers doom; code triggers at `spawnCount >= 3` | Documentation mismatch |
| 78 | P3 | MazeSystem | `_overlapsCell()` defined but never called | Dead code |
| 79 | P3 | FishingSystem | `findWaterTileAtDistance()` dead code | Dead code |
| 80 | P3 | PolymorphSystem | `player._killedByGhost = true` set but never read | Dead flag |
| 81 | P3 | BossSystem | `_meleeFacingToward()` `_atk` parameter unused | Misleading signature |
| 82 | P3 | RoomGenerator | `L_BOSS` template exists but is unreachable — no EXIT_LETTERS entry | Dead data |
| 83 | P3 | RoomGenerator | `markRandomBushShaking()` never called — predates secret event system | Dead code |
| 84 | P3 | main.js | `escapeRoute`, `letterPath` (×3), `latestMemoryTime`, `potentialMates`, wand debug blocks — dead assignments computed every frame | Unnecessary work per frame |
| 85 | P3 | main.js | `zoneDepths` double-initialized in constructor and `loadGame()` | Redundant initialization |
| 86 | P3 | main.js | `saveGameState()` body commented out; call at end of `enterRestState` is a no-op stub | Dead method with active call site |

---

## Architectural Violations

### Logic in main.js That Belongs in Systems (Consolidated)

**High-severity (substantial inline logic):**
- Ingredient attraction/separation O(n²) loop — triplicated across REST/NEUTRAL/EXPLORE update methods → `PhysicsSystem.updateIngredients()` or `InventorySystem.updateIngredients()`
- Exit crossing detection — 180 lines quadruplicated for north/east/west → `ExitSystem.checkExits(direction)` returning a result object
- Lava/liquid damage loop (~130 lines) in `updateExploreState` → `PhysicsSystem` or `HazardSystem`
- GAME_OVER reset block (75 lines) inline in `handleSpacePress` → `CharacterSystem.handleGameOver()` or `resetGame()`
- Boar charge wall-stun state machine (56 lines) → `Enemy.js`
- Polymorph outcome table (45 lines) → `PolymorphSystem.resolveOutcome()`
- Enemy death loop (100 lines) — SFX, explosion, spell learning, mana drop → `Enemy.js`/`LootSystem`
- Green ranger roll logic (80 lines) → `CharacterSystem.updateGreenRangerRoll()`
- Yellow mage blink teleport → `CharacterSystem.resolveBlink()`
- REST room collision map construction (30 lines manual loops) → `RoomGenerator.generateRestRoom()`
- Staff block release + 8-direction sweep visual → `CombatSystem.releaseStaffBlock()`
- Pack behavior sync (60 lines, two parallel implementations) → `Enemy.js`
- All five cheat teleport methods → `CheatMenu.js`
- `executeCleanse()` / `executeRevive()` (45+80 lines) → `SpellSystem` or `WishSystem`
- `spawnCaptive()` (50-attempt position search) → `CharacterSystem.spawnCaptive()`

**Unnecessary pass-through wrappers (15 methods that should be removed):**
`getDodgeRollDirection`, `getNearestInteractiveSlot`, `showPickupMessage`, `showNextPickupMessage`, `getCurrentZoneDepth`, `incrementZoneDepth`, `applyEquipmentEffects`, `applyCharacterType`, `applyGreenDamageModifier`, `triggerGreenActionCooldown`, `spawnCharacterNPCs`, `swapWithCharacter`, `checkCaptiveInteraction`, `playerHasNoItems`, `preloadRoomPreviews`

### Systems That Write to Game State They Shouldn't Own
- **CampNPCSystem** writes `game.companion` directly; companion lifecycle not tracked by CharacterSystem or any owning system.
- **WellSystem** writes `game.wellCoinAnim`, `game.wellFlashTimer`, `game.wellFlashDuration` — visual state that should be encapsulated in the system.
- **TrapSystem** reads `game.placedTraps`, `game.inFlightTraps`, `game.trapCharging` — documented exception but creates coupling.
- **PolymorphSystem** writes `game.playerTongueAttacks` — should be system-local state.
- **MazeSystem** calls `playSFX('hit')` — an SFX name that was never registered. Systems should not know SFX names that AudioSystem doesn't own.
- **InteractionSystem** calls `game.saveGameState()` — a no-op stub; but the call implies the system believes state is being persisted.

### Cross-System Coupling That Creates Brittleness
- **DungeonSystem reusing `player.inHut`**: Changes to HutSystem semantics silently affect DungeonSystem behavior.
- **PiP disambiguation by grid size**: `hutInterior.gridCols === INTERIOR_COLS (24)` to detect dungeon vs. hut is fragile — if either system changes grid dimensions, disambiguation breaks.
- **CombatSystem passing `room` into `_hitsWall`**: The caller (updateExploreState) must pass the interior room when the player is inside; if main.js passes the exterior room, interior projectiles escape walls. This is a caller contract that isn't enforced.
- **Steam cloud array pushed to enemy each frame**: `enemy.steamClouds = this.steamClouds` every frame (line 4352–4355) tightly couples Enemy to game's steam array reference.
- **CharacterSystem → game → CharacterSystem round-trip**: `CharacterSystem.swapWithCharacter` calls `game.applyCharacterType(newType)` which delegates back to `characterSystem.applyCharacterType`. Two hops for one operation.

### Interior System Inconsistency
Per the CLAUDE.md documented pattern:

| Requirement | HutSystem | DungeonSystem | MazeSystem |
|------------|-----------|---------------|------------|
| `player.inXxx` dedicated flag | `player.inHut` ✓ | Reuses `player.inHut` ✗ | `player.inMaze` ✓ |
| Dedicated `game.xxxInterior` | `game.hutInterior` ✓ | Multi-floor model (partial) | `game.mazeInterior` ✓ |
| `handleShiftPress()` wired | No | Yes ✗ (asymmetric) | No |
| Physics redirect | Full ✓ | Via hutInterior coupling ✗ | N/A (ghosts) ✓ |

DungeonSystem is the non-conforming member. Adding a fourth interior should follow HutSystem/MazeSystem, not DungeonSystem's pattern.

---

## Feature Completion Status

| System | Status | Notes |
|--------|--------|-------|
| **BossSystem** | Partial | Green (GooDragon), Red (Turtle), Cyan (LakeBoss) complete; Yellow entirely absent; rune delivery not implemented; reward identical for all zones |
| **WellSystem** | Partial | Activation path complete and clean; 25% mana drop post-activation not implemented in this system (reportedly in LootSystem — unverified); background redraw bug |
| **MagicSystem** | Complete | Wand pipeline fully implemented; maze layer not supported in active-enemy accessors |
| **PolymorphSystem** | Mostly Complete | Frog form movement and tongue attack work; NPC/item interaction gates undefined; tongue ignores maze layer; `_killedByGhost` flag is dead |
| **SpellSystem** | Complete | Detection and followup-chain clean; known-spell guards entirely trust-based (no enforcement mechanism) |
| **FishingSystem** | Partial | Core state machine and Rusalka path work; fish don't spawn in lake rooms (wrong char filter); `findWaterTileAtDistance` is dead code |
| **RidgeSystem** | Mostly Complete | Donation, build animation, and BRIDGE spell path functional; plank char is water char (puddle physics triggered); `buildBridgeViaSpell` is an identical-body alias |
| **DungeonSystem** | Partial | Interior generation and multi-floor structure complete; green dungeon key requirement not enforced; `checkStairs()` is empty stub called every frame; monkey-patch anti-pattern present |
| **PressSystem** | Partial | Oil press mechanic functional; oil chars use rendering-inconsistent Unicode block; `'craft'` SFX not loaded; direct render call bypasses render loop |
| **AnimationSystem** | Complete | Fully generic, well-designed; used by HutSystem and exit warp; easing catalog has minor JSDoc gap |

---

## Priority Recommendations for Systems

### 1. Stamp `isZoneBossRoom` onto the room object (Small)
**File:** `RoomGenerator.js` ~line 400 in `generateBossRoom` or `generateRoom`  
**Fix:** Add `room.isZoneBossRoom = !!this.isZoneBossRoom;` before returning. This single line unblocks all zone boss encounters (GooDragon, Ancient Turtle, LakeBoss) through normal gameplay.  
**Rationale:** P1 bug. The entire zone boss pipeline — special music, multi-phase combat, rune reward — is gated on this one missing assignment. It is the highest-leverage single-line fix in the codebase.

### 2. Fix ErrandSystem stage-0 inventory lookup (Small)
**File:** `ErrandSystem.js` line 111  
**Fix:** Change `ing.char === requestedChar` from `ing` being treated as an object to a direct string compare: `ing === requestedChar`.  
**Rationale:** P1 bug. Stage-0 errands are permanently uncomplectable. The errand system is designed to be a primary mid-game progression mechanic; it is functionally off.

### 3. Fix `CombatSystem.clear()` — add 8 missing array clears (Small)
**File:** `CombatSystem.js` ~line 2013  
**Fix:** Add `this.pendingMeleeAttacks.length = 0; this.aoeEffects.length = 0; this.shockwaveEvents.length = 0; this.chainArcs.length = 0; this.polymorphEvents.length = 0; this.impactEffects.length = 0; this.newSteamClouds.length = 0; this.objectDestroyEvents.length = 0;` to the `clear()` method.  
**Rationale:** P1 bug. Stale events fire in the wrong room. The `objectDestroyEvents` path is the most dangerous — it can trigger loot drops from the previous room in the new room.

### 4. Fix consumable slots 4–5 in `selectMenuItem()` (Small)
**File:** `MenuSystem.js` ~line 582  
**Fix:** Replace the three identical `consumable1/2/3` blocks with a single parametric handler: `const idx = parseInt(game.currentMenuSlot.replace('consumable','')) - 1; if (idx >= 0 && idx < 5) { inventorySystem.equipConsumable(idx, selectedItem); }`.  
**Rationale:** P1 bug. Unlocking consumable slots 4–5 is a boss reward; the feature they gate is broken.

### 5. Extract ingredient attraction loop into shared method (Medium)
**Files:** `main.js` lines ~2722, ~2005, ~4289  
**Fix:** Create `_updateIngredientAttraction(deltaTime)` in main.js (or delegate to `PhysicsSystem.updateIngredients()`). Replace all three occurrences with a single call.  
**Rationale:** 120 lines of O(n²) duplication that must be maintained in three places simultaneously. Also the clearest single architectural improvement to `updateExploreState` without touching cross-system dependencies.

### 6. Fix the plane-filter holes in CombatSystem area effects (Medium)
**Files:** `CombatSystem.js` — `createChainLightning`, `createExplosion`, `applyAOEStatus`, `checkProximity`, `updateRollDamage`, `conductElectricity`  
**Fix:** Add `planeOf(enemy) === planeOf(source)` / `inSamePlane(enemy, attacker)` guard to each enemy iteration in these six methods.  
**Rationale:** 6 combat methods allow cross-plane damage in U rooms. Since U rooms are mid-to-late game content, players will encounter this. The fix is mechanical (add one filter per loop) and consistent with the established pattern in the projectile path.

### 7. Fix `game.companion` lifecycle (Small)
**Files:** `main.js` constructor (~line 100 block), game-over reset block  
**Fix:** Add `this.companion = null;` to constructor; add `this.companion = null;` to the game-over reset block alongside other entity clears.  
**Rationale:** P2 bug. A companion from a previous run survives into the next run, referencing a stale NPC in a room that no longer exists. Can produce phantom update calls on dead entities.

### 8. Fix `WellSystem._completeRitual` background dirty call (Small)
**File:** `WellSystem.js` line 187  
**Fix:** Change `game.renderer?.markBackgroundDirty?.()` to `game.renderer.backgroundDirty = true`.  
**Rationale:** P2 bug. The background is not redrawn after the well ritual completes, leaving a visual artifact. One-line fix.

### 9. Fix BoulderSystem north/south direction inversion (Small)
**File:** `BoulderSystem.js` — `DIR_VEC` definition  
**Fix:** Swap `north` and `south` dy values: `north: {dx:0, dy:-1}`, `south: {dx:0, dy:1}`.  
**Rationale:** P1 bug. Boulders labeled 'north' travel southward. The direction logic in `_spawnRock` matches the inverted vectors, so only the `DIR_VEC` labels need correcting.

### 10. Add Yellow zone boss (Large)
**Files:** `BossSystem.js` — `activate()`, `_getBossCurrentHp()`, `update()`, `_updateYellowBoss()` (new); plus a new Yellow boss entity  
**Fix:** Design and implement a yellow zone boss entity and wire it into the existing three-zone boss pipeline in BossSystem. The cheat menu already has a stub entry; the BossSystem architecture is proven with three working examples.  
**Rationale:** P1 for completeness. Yellow zone boss is entirely absent — the zone ends on nothing. This is also a prerequisite for the "Bad Ending" game pillar (all zone bosses defeated). Scope is large because it requires a new entity, not just system wiring.

---

_End of holistic systems review. Total bugs catalogued: 86 (14 P1, 57 P2, 15 P3). Total systems reviewed: 28 system files + main.js (5,804 lines)._
