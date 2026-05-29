# DIRECTOR'S BRIEFING — ASCII Roguelike Code Review

**Date:** 2026-05-15  
**Source reviews:** holistic-entities.md, holistic-systems.md, data.md, game.md, rendering.md  
**Total bugs catalogued:** ~175 across all layers (14 P1 systems, 50+ P2 systems, 35+ P1/P2 entities, 30+ data and rendering issues)

---

## Executive Summary

The codebase is architecturally ambitious and mostly coherent. The 3-tier rendering design is sound, the system extraction work from earlier sessions shows meaningful discipline, and the combat, physics, and zone systems are largely functional. The asset pipeline, audio system, and game loop are clean. This is a game that works well for the common path — players can enter rooms, fight enemies, craft weapons, and die. The foundation is solid enough to build on.

However, the review uncovered two categories of problems that collectively constitute a serious risk before any new features are added. First, the roguelike's core promise — death means full reset — is structurally broken. Player.reset() omits 35+ fields, game.companion never clears across runs, and CraftingSystem's discovered/failed recipe pairs persist silently across deaths. Status effects, interior flags, shield charges, plane state, grab references, and staff blocking state all survive death with stale values. This is not a hypothetical problem: a player who dies while grabbed by GooHead starts the next run still grabbed, referencing an entity that no longer exists. Second, the game's flagship endgame content is entirely unreachable through normal gameplay. Zone bosses never activate because isZoneBossRoom is stamped on the generator instance rather than the room object — a single missing assignment that gates all boss encounters, all special boss music, and the entire Bad Ending pillar. These two problems together mean the game's core identity (pure roguelike) and its primary design goals (three endings) are both broken in the current build.

The single most urgent concern is the boss activation gate. It is one line of code that unlocks an entire gameplay tier. Until that line is added, no playtesting of boss content is possible, and the development priorities established in the design session cannot be evaluated.

---

## The Roguelike Contract Is Broken

Death should mean full reset. The following confirmed state survives death that should not.

### Player.reset() — Missing 35+ Fields

The `reset()` method in `Player.js` is the public contract for a clean run start. It is systematically incomplete. Fields that survive death with confirmed gameplay consequences:

| Field | Consequence if not reset |
|-------|--------------------------|
| `statusEffects` (goo, freeze, slimeBoost) | New run starts with active status effects |
| `burnDuration`, `burnTickTimer` | Fire DoT ticks from a dead run |
| `wetDuration` | Wet state persists |
| `shieldCharges`, `shieldMaxCharges`, `shieldBlocksAll` | Shield without armor |
| `activeSappingBats` | Stale entity references; bat update calls on dead objects |
| `grabbed`, `grabbedBy` | GooHead grab on entity that no longer exists — potential crash |
| `plane` | Player starts REST on plane 1 (underground) |
| `inHut`, `inMaze` | Interior flags not cleared; physics may redirect to nonexistent interior |
| `pendingBlink` | Yellow mage blink teleport fires at run start |
| `isStaffBlocking`, `staffSwingHasFired`, `continuousRollActive` | Staff won't swing; block-release sweep fires unexpectedly |
| `meleeResist`, `burnResist`, `slimeImmune`, `massBonus`, `rollCooldownMult`, `extraIframes` | Armor-derived bonuses without armor equipped |

### System-Level Cross-Run Leaks

| State | Location | Consequence |
|-------|----------|-------------|
| `game.companion` | `main.js` constructor + death reset | Never initialized; never cleared on death; stale CampNPC with wrong equipment persists into new run |
| `CraftingSystem.discoveredPairs` / `failedPairs` | `CraftingSystem.js` | Recipe knowledge persists across deaths — implicit persistence that violates roguelike design |
| `InventorySystem._auraRollPulseUsed` | `InventorySystem.js` | Pulse fires once per run instead of once per room |

### Severity Rating

**High.** The most dangerous cases are grab-state persistence (potential crash via stale GooHead reference), plane persistence (player visually underground in REST hub), and interior flag persistence (physics redirected to a room that was garbage-collected). These are not edge-case bugs — any player who dies while grabbed, in a tunnel, or inside a hut will experience them on the very next run. The crafting knowledge leak is subtler but directly undermines the "mental progression" design pillar: players gain recipe memory they didn't earn.

---

## P1 Bugs — Fix Before Any New Features

Ranked by gameplay impact:

| # | Bug | Location | Symptom | Fix Complexity |
|---|-----|----------|---------|----------------|
| 1 | Zone boss never activates | `RoomGenerator.js` | `isZoneBossRoom` stamped on generator instance, not room object; `BossSystem.activate()` never called; GooDragon, Ancient Turtle, LakeBoss unreachable through normal play | S — add one line: `room.isZoneBossRoom = !!this.isZoneBossRoom` before returning from `generateBossRoom` |
| 2 | Player.reset() missing 35+ fields | `Player.js` | Status effects, grab state, shield charges, plane, interior flags, armor bonuses, staff state, pending blink all survive death | M — mechanical but must be done carefully to avoid zeroing intentional survivors (characterType, godMode) |
| 3 | CombatSystem.clear() omits 8 arrays | `CombatSystem.js` | `pendingMeleeAttacks`, `aoeEffects`, `shockwaveEvents`, `chainArcs`, `polymorphEvents`, `impactEffects`, `newSteamClouds`, `objectDestroyEvents` not cleared on room change; stale events fire in new room; `objectDestroyEvents` can spawn loot drops from the previous room | S — add 8 array clears to clear() method |
| 4 | ErrandSystem stage-0 permanently broken | `ErrandSystem.js` | `checkGive()` calls `.char` on strings (`player.inventory` is `string[]`); `findIndex` always returns -1; no stage-0 errand can ever be completed | S — change `ing.char === requestedChar` to `ing === requestedChar` |
| 5 | PersistenceSystem is fully operational | `PersistenceSystem.js` + `main.js` | CLAUDE.md says "permanently disabled" but code contains functional localStorage read/write; if called, will produce cross-run state corruption that is explicitly prohibited by design | M — confirm all call sites are no-ops; consider deleting the implementation body |
| 6 | Consumable slots 4/5 unlockable but not equippable | `MenuSystem.js` | `selectMenuItem()` has no handler for `consumable4` or `consumable5`; players who unlock these slots (a boss reward) cannot use them | S — parametrize the existing consumable1/2/3 handler block |
| 7 | `auto_dodge` and `panic_blind` never activate | `InventorySystem.js` | Both fall through `_checkTriggerCondition` default; items equip correctly but produce no effect in EXPLORE | S — add cases to trigger switch |
| 8 | `ITEMS['╪']` defined twice — Lava Sword unreachable | `items.js` | JS silently takes last key; Lava Sword definition overwritten by Stun Baton; recipe `‡ + a = ╪` produces Stun Baton; WEAPON_TIERS.sword tier 2 points to nonexistent item | S — assign Lava Sword a new unique char and update recipe + tier reference |
| 9 | `BACKGROUND_OBJECTS['^']` and `['v']` silently overwritten | `GameConfig.js` | Tunnel Entrance Up/Down overwritten by Stairs Up/Down; any system using `^`/`v` for tunnel entrances gets stair data; PlaneSystem tunnel entry broken | S — assign Stairs Up/Down to new chars (`↑`/`↓` or similar) |
| 10 | `canPlaceSign` crash on undefined data | `RoomGenerator.js` | `bgObj.data.solid` throws TypeError when `bgObj.data` is undefined (slope tiles, cave wall chars, glitter markers) — crashes room generation | S — add null guard: `bgObj.data?.solid` |
| 11 | Yellow zone has no boss | `BossSystem.js` | `activate(room, 'yellow')` silently spawns a GooDragon; `_getBossCurrentHp()` returns Infinity for yellow; yellow zone ends on wrong entity with broken health tracking | L — requires new entity design and BossSystem wiring |
| 12 | BoulderSystem direction vectors inverted | `BoulderSystem.js` | `DIR_VEC` north: `{dy: 1}` (moves DOWN), south: `{dy: -1}` (moves UP); labeled directions are backwards | S — swap north/south dy values |
| 13 | `findSpawnPosition` null return not guarded | `RoomGenerator.js` | After 100 failed attempts returns last invalid position without guard; `new Enemy(char, null?.x, null?.y)` creates NaN-positioned enemies that join combat invisibly | S — add null check before enemy construction |
| 14 | Three ingredient chars shadowed in `getItemData()` | `items.js` | `'r'` (Root shadowed by Rubber Boots), `'o'` (Oil shadowed by Path Amulet), `'v'` (Venom shadowed by Steam Vial); any crafting code calling `getItemData()` on these chars gets wrong data | M — reassign one of each pair to a non-colliding char; update recipes + drop tables |
| 15 | `game.companion` never initialized or cleared | `main.js` | Stale companion NPC from previous run persists with wrong equipment and stale collision refs | S — add `this.companion = null` to constructor and death reset block |
| 16 | Cheat teleport functions use wrong coordinate path | `main.js` | `handleZoneTeleport`, `handleDepthJump`, `handleBossTest` use `player.x`/`player.y` instead of `player.position.x`/`player.position.y`; all three cheat teleports are broken | S — fix property access path |
| 17 | `attackPattern: 'axe'` missing from Item.js switch | `Item.js` | Pickaxe falls through to single-point default hit; wrong damage, wrong pattern | S — add 'axe' case to `createMeleeAttack()` switch |

---

## Dead Content Inventory

Features fully implemented but currently unreachable or non-functional:

| Feature | Status | Worth Activating? |
|---------|--------|-------------------|
| **WiseFellow NPC** | Fully implemented; `'wise_man'` hutKind never assigned by RoomGenerator | Yes — single-line change unlocks a complete feature |
| **Yellow zone boss** | No boss entity exists; BossSystem spawns wrong entity (GooDragon) silently | Yes — required for Bad Ending; needs design + entity work first |
| **Four puddle effect types** (mud, water, poison, lava) | Visual definitions present; no effect handlers, no spawn paths | Design decision — define what they do before wiring |
| **`B-A-D`, `G-O-O-D`, `N-E-W`, `D-E-A-D` secret patterns** | Detected by ExitSystem; no handler reads `rewardType`; patterns produce no effect | Yes once reward types are defined; pattern detection works |
| **Red Warrior melee windup, Yellow Mage gun fire rate, Gray Assassin trap capacity** | Defined in `characters.js`; never consumed by any system | Yes — one-time wiring in CharacterSystem; these are core character identities |
| **Pre-burned organic objects in red zone** | `generateOrganicClusters` pre-burned logic checks `bgObject.onFire` which is never defined on BackgroundObject; the visual never fires | Low priority; cosmetic |
| **`threeRoom` and `drawRoom` neutral rooms** | Defined in `NEUTRAL_ROOMS`; no code path calls `transitionToNeutralRoom` for either | `drawRoom` is wired via `D-R-A-W` secret pattern (once that's enabled); `threeRoom` has no trigger |
| **`barrel_room` hutKind** | Branch in HutSystem; never assigned by RoomGenerator | Activate when interior content is designed |
| **`auto_dodge` (Fur Cloak) and `panic_blind` (Bone Dust)** | Items exist and equip; trigger conditions fall through switch | Yes — these are craftable items in the green zone; both are currently dead in EXPLORE |

---

## Stub / Incomplete Features

Features that exist by name but have no meaningful implementation:

| Feature | Location | Distance From Working |
|---------|----------|----------------------|
| **Infusion Wand** | `Item.js` line ~1133 | Zero — explicit `// TODO: Implement in Phase 6` returning null. Equipping does nothing. |
| **Gem wand spell effects** | `Item.js` line ~1181 | Far — "Phase 1 placeholder"; `gem_wand_cast` tag returned but actual effects (fire AOE, blizzard, chain stun, blind cone) are "Phase 2" comments |
| **Rune system** | Nowhere | Not started — no item definition, no data structure, no system file. BossSystem's `_grantBossReward()` gives a generic +1 consumable slot for all zones; no rune delivery exists |
| **Gray zone** | `ZoneSystem.js` | Not implemented — the zone is defined in `zones.js` but there is no gray zone depth tracking, no mist mechanics, no level-10 exit condition, no character snapshot system |
| **Boss rune piece delivery** | `BossSystem.js` | Missing — `_grantBossReward()` is identical for all zones; it gives +1 consumable slot and that's it. No rune piece, no zone-specific reward differentiation |
| **MazeSystem ghost collision** | `MazeSystem.js` | `_ghostCollides()` defined but never called — ghosts use BFS pathing but no wall collision check; ghosts can phase through maze walls |
| **FishingSystem in lake rooms** | `FishingSystem.js` | Broken — `spawnAmbientFish()` filters `obj.char === '~'` (puddle char) not `'='` (standing water); fish never spawn in actual lake rooms |
| **HEX spell learning** | `enemies.js` + call site | Data defines `hexMechanic.learnSpellOnDeath: 'HEX'` but no enemy death handler reads this field; HEX is never learned |
| **`threeRoom` neutral room** | `neutralRooms.js` | Stub — places a single `'3'` marker and does nothing; no `onExit`, no gameplay |
| **Poison DoT on player** | `Player.js` | `poisonImmune` field exists; no `poisonDuration`, no tick system; no enemy can poison the player via a supported path |

**What the designer needs to know:** The Rune system — Pillar 3, True Ending — has zero implementation anywhere in the codebase. There is no item, no data structure, no slot, no system file. This is not a "partial stub"; it doesn't exist yet. Planning for Pillar 3 should treat it as a greenfield feature requiring design-first work before any code is written.

---

## Architecture Risks for Upcoming Features

### Feature 1: Boss Pipeline (Pillar 1 — Bad Ending)

**What's in place:**
- BossSystem exists with three working boss entities (GooDragon, Ancient Turtle, LakeBoss)
- Boss room generation logic is present in RoomGenerator
- Pre-boss gate depth check exists (partially wired)
- Boss defeat flash, music sequencing, and reward pipeline all exist

**Current blockers:**
- `isZoneBossRoom` is never stamped onto the room object (P1 bug #1 above) — the entire activation chain is gated on this one missing line
- Yellow zone has no boss entity at all (P1 bug #11 above)
- `_grantBossReward()` gives +1 consumable slot for all zones; no zone-specific reward differentiation
- Pre-boss gate hardcodes depth `14` instead of reading `ZONES[zone].bossDepth`
- `BossSystem._checkReflectedProjectileBossHits()` only handles GooDragon — Lake and Turtle bosses cannot be stun-reflected

**Architectural work required before implementation:**
1. Fix `isZoneBossRoom` assignment (one line — do this first)
2. Design and implement Yellow zone boss entity
3. Differentiate boss rewards by zone (prerequisite for rune delivery in Pillar 3)

**Risk: Medium.** Three of four bosses are fully implemented. The activation gate is trivially fixed. The Yellow boss requires entity design work but the pipeline to wire it is proven. The main risk is scope creep during Yellow boss design.

---

### Feature 2: Gray Zone + 5-Character Route (Pillar 2 — Good Ending)

**What's in place:**
- Gray zone defined in `zones.js`
- Character system (`CharacterSystem.js`) exists and handles swapping
- `unlockedCharacters`, `deadCharacters`, `characterNPCs` state arrays exist on game
- ZoneSystem has per-zone depth tracking

**Current blockers:**
- Gray zone has no implementation in ZoneSystem — no depth tracking specific to gray, no mist mechanics, no level-10 exit condition
- No character snapshot system — when a character "reaches gray zone level 10," there is nowhere to store their equipment state
- DungeonSystem reuses `player.inHut` flag — if gray zone dungeon content is added, interior disambiguation breaks
- Gray zone enemy buff loop in main.js has no boss-check — a gray zone boss would get double-buffed
- No simultaneous 5-character control system exists at any level

**Architectural work required before implementation:**
1. Add `player.inGray` tracking or extend ZoneSystem with gray-specific depth/exit logic
2. Design character snapshot data structure (equipment state serialized at gray zone exit)
3. Implement 5-snapshot accumulation and final boss trigger condition
4. Design simultaneous control mechanic (novel; requires input system changes)

**Risk: High.** This is the most complex of the three pillars. It requires new state tracking, a novel control mechanic, and coordination of five character systems that currently operate independently. The snapshot concept is simple; the simultaneous control mechanic is architecturally novel and may require more time than estimated. Recommend designing the snapshot system first and deferring simultaneous control until the snapshot path is proven.

---

### Feature 3: Rune + 2nd Quest (Pillar 3 — True Ending)

**What's in place:**
- SpellSystem infrastructure (spell detection, known spells, followup chains)
- Zone boss pipeline (once Pillar 1 is fixed)
- Enemy data supports `learnSpellOnDeath` field (not yet wired)

**Current blockers:**
- Rune system has zero implementation — no item definition, no data structure, no slot, no system file
- Boss reward pipeline delivers wrong reward (consumable slot, not rune piece)
- 2nd Quest global run flag doesn't exist — no transforms are defined
- "Correct rune completion" has no definition anywhere in data or code
- Cursed Mode has no implementation

**Architectural work required before implementation:**
1. Design rune as a new item type (not dropped on death, not consumed by crafting, has slot-fill state)
2. Implement rune item + RuneSystem managing slot state and completion detection
3. Wire boss reward differentiation (Pillar 1 prerequisite)
4. Design 2nd Quest global run flag and enumerate all transforms (enemy AI, letter glyphs, boss weaknesses)
5. Implement Cursed Mode as a run flag with altered mechanics

**Risk: High.** This pillar is the furthest from implementation and the most design-intensive. The 2nd Quest transforms touch every major system (enemy AI, rendering, boss logic). Recommend completing Pillars 1 and 2 before starting Pillar 3 work.

---

## PlaneSystem Adoption Gap

The PlaneSystem predicate (`inSamePlane`, `planeOf`, `objectOnPlane`) was introduced as the canonical plane check but adoption is inconsistently enforced.

### Severity 1 — Confirmed Cross-Plane Damage in Gameplay

| Location | Method | Bypass Type |
|----------|--------|-------------|
| `CombatSystem.js` | `createChainLightning` | No plane filter — chain lightning jumps to enemies on wrong plane in U rooms |
| `CombatSystem.js` | `createExplosion` | No plane filter — explosions damage cross-plane enemies and background objects |
| `CombatSystem.js` | `applyAOEStatus` | No plane filter — wand AOE affects cross-plane enemies |
| `CombatSystem.js` | `checkProximity` | No plane filter |
| `CombatSystem.js` | `updateRollDamage` | No plane filter — Red Warrior roll damages wrong-plane enemies |
| `CombatSystem.js` | `conductElectricity` | No plane filter |
| `CombatSystem.js` (melee loops) | `checkMeleeCollision` | Raw `planeOf(enemy) !== (attack.shooterPlane ?? 0)` integer compare instead of `inSamePlane` |
| `Item.js` | `createMeleeSlam` | `shooterPlane` field omitted — slam always behaves as plane-0 |

### Severity 2 — Architecture Violations

| Location | Method | Bypass Type |
|----------|--------|-------------|
| `CampNPCSystem.js` | All three plane checks | Direct `entity.plane !== npc.plane` comparisons |
| `TrapSystem.js` | Four plane checks | Raw `.plane` comparisons |
| `PhysicsSystem.js` | Multiple lines | Direct `.plane` reads despite intent comment referencing PlaneSystem |
| `main.js` | GooBlob check, exit-zone checks | Direct comparisons |
| `InteractionSystem.js` | `checkCaptiveInteraction` | No plane check at all — player on plane 1 can free captive on plane 0 through wall |
| `GooBlob.js` | `isNearEntity` | Distance-only check, no plane filter |

**Significance for upcoming features:** U-rooms (tunnel rooms with multi-plane enemies) are growing in scope. Every new combat mechanic added to the existing six area-effect methods in CombatSystem inherits the plane-bypass bug automatically. Fixing the six CombatSystem area effects is a single-session mechanical task that prevents a growing surface of cross-plane bugs.

---

## The main.js Problem

`main.js` is approximately 5,800 lines. `updateExploreState` alone is approximately 1,800 lines containing 26 documented inline logic blocks that belong in existing system files.

### Confirmed Inline Violations

The following logic blocks are in `main.js` but have explicit homes in existing systems:

| Block | Approximate lines | Correct home |
|-------|------------------|--------------|
| Ingredient attraction/separation loop | ~45 lines × 3 occurrences = 135 | `PhysicsSystem.updateIngredients()` |
| Exit crossing detection (N/E/W/S) | ~180 lines (quadruplicated) | `ExitSystem.checkExits(direction)` |
| Lava/liquid damage loop | ~130 lines | `PhysicsSystem` or `HazardSystem` |
| GAME_OVER reset block inlined in `handleSpacePress` | ~75 lines | `CharacterSystem.handleGameOver()` or standalone `resetGame()` |
| Boar charge wall-stun state machine | ~56 lines | `Enemy.js` |
| Polymorph outcome table | ~45 lines | `PolymorphSystem.resolveOutcome()` |
| Enemy death loop (SFX, explosion, spell learning, mana drop) | ~100 lines | `Enemy.js` / `LootSystem` |
| Green ranger roll logic | ~80 lines | `CharacterSystem.updateGreenRangerRoll()` |
| Yellow mage blink teleport | ~40 lines | `CharacterSystem.resolveBlink()` |
| Staff block release + sweep visual | ~35 lines | `CombatSystem.releaseStaffBlock()` |
| Pack behavior sync (two parallel implementations) | ~60 lines | `Enemy.js` |
| All five cheat teleport methods | ~150 lines | `CheatMenu.js` |

Additionally, approximately 15 pass-through wrapper methods in main.js (e.g., `getDodgeRollDirection`, `getCurrentZoneDepth`, `showPickupMessage`) exist purely to forward calls to systems that could be called directly.

### Maintenance Burden Assessment

The practical consequence is that any developer debugging a combat issue must read through 1,800 lines of `updateExploreState` to locate the relevant block, because there is no structural guarantee about where logic lives. Bugs like the triplicated ingredient loop (45 lines × 3 copies) mean that fixing the logic in one place may not fix it in the other two — and in fact P2 bugs have already diverged between copies.

### Refactor Options

**Option A — Incremental extraction (recommended):** Extract the highest-value blocks first (ingredient loop, exit crossing detection, GAME_OVER reset). Each extraction is independently testable and reduces the file without destabilizing working systems. Time cost: 2–4 sessions. Risk: Low.

**Option B — Targeted extraction for feature work:** Only extract blocks that directly impede the next planned feature. If building the boss pipeline, extract the enemy death loop and GAME_OVER reset because they intersect with boss defeat handling. Time cost: 1 session per feature. Risk: Very low.

**Option C — Full structural refactor:** Extract all 26 blocks in one session. Time cost: 1–2 weeks. Risk: High — requires regression testing every system simultaneously. Not recommended before feature work.

**Recommendation for the designer:** Frame Option B as the working policy. Every new feature that touches main.js extracts the relevant block as a prerequisite. This keeps the file shrinking without a dedicated refactor sprint.

---

## Rendering & Data Layer Issues

Issues that will produce visible player-facing bugs:

### High Priority (Players will notice)

| Issue | Location | Symptom |
|-------|----------|---------|
| `NeutralRenderer` hardcodes `'@'` as player char | `NeutralRenderer.js` line 101 | Player always appears as `@` in neutral rooms regardless of active character type — character identity is broken in every neutral room |
| `InventoryOverlay` canvas state leak | `InventoryOverlay.js` lines 71–165 | `textAlign` left/center mutations not wrapped in save/restore; inherits into next renderer's fgCtx draw calls — text alignment corruption in any renderer that follows |
| Lava Sword unreachable | `items.js` | Player crafts `‡ + a` expecting Lava Sword; receives Stun Baton; Stun Baton also missing `weaponType` (invisible to melee logic) |
| `getRandomPosition` bad fallback | `RoomGenerator.js` | After 100 failed placement attempts, returns last invalid position silently; enemies and items can spawn inside walls or water |
| Particle draw logic duplicated in 5 files | `ExploreRenderer`, `GameOverRenderer`, `RestRenderer`, `HutInteriorOverlay`, `MazeInteriorOverlay` | Each copy is slightly different; adding a new particle type or fixing a particle behavior requires 5 edits; maintenance multiplier for any particle work |

### Medium Priority (Players notice on specific content)

| Issue | Location | Symptom |
|-------|----------|---------|
| Cyan dungeon grid row length mismatch | `dungeonDesigns.js` | Rows 3 and 11 are 32 chars wide instead of 30; objects placed 2 columns too far right in cyan dungeon; possible out-of-bounds placement |
| `LETTER_TEMPLATES` missing P, C, ? entries | `letterTemplates.js` | Rooms with exit letters P (Press Hut), C (Camp), ? (Mystery) return undefined template; RoomGenerator must fall back silently or crash |
| Unquoted `Unifont` font name in 4 locations | `ExploreRenderer.js` | `Unifont, monospace` without quotes around `Unifont` — falls back to system monospace in strict CSS font parsers; bridge panel, camp NPC, pickup message text may render in wrong font |
| Ember particles immediately discarded | `BackgroundObject.js` | Plain-object embers lack `alive` field; cleanup loop splices them on frame 1; burning objects produce no visible fire embers despite generation code running |
| `showInventory` vs `keys.tab` inconsistency | `NeutralRenderer.js` vs `ExploreRenderer.js` / `RestRenderer.js` | Inventory overlay trigger is inconsistent across states; tab behavior in neutral rooms may differ from other states |

### Lower Priority (Internal / maintenance)

| Issue | Location | Notes |
|-------|----------|-------|
| Barrel dropChance comment/value mismatch | `GameConfig.js` | Comment says "65% empty"; `1-0.45 = 55%` empty — misleads future editors |
| `ROLL_CHARS` variable shadow in ExploreRenderer | `ExploreRenderer.js` line 1170 | Import from TurtleShell shadowed by local boulder array of same name; confuses IDEs and maintainers |
| Dead render methods | `ASCIIRenderer.js` | `drawGrid()`, `gridToPixel()`, `pixelToGrid()` — defined but never called externally |

---

## Sound Design Gap

### Coverage Quantification

- Approximately 42 standard enemies in `enemies.js` have no `sfx` fields. Only a handful of recently added enemies (those added alongside the per-enemy SFX pattern introduction) carry `data.sfx.hit` and `data.sfx.death`.
- **4 of 5 non-GooDragon boss entities are completely silent on damage:** GooHead, LakeBoss, TurtleShell, TurtleHead, TurtleLeg have no `sfx` fields. GooDragon is the only boss with audio feedback on damage.
- `'hit'` SFX called by MazeSystem but never loaded — produces repeated console warnings during all maze play.
- `'craft'` SFX called by PressSystem but never loaded — silent press mechanic.
- `sfx-craft-cycle.mp3` registered in AudioSystem but file is absent from disk — silent load failure every session.

### Design Gap vs. Implementation Gap

This is primarily a **design gap** (sound assets not yet created for most enemies) compounded by a **wiring gap** (the SFX pattern is established and correct but only applied to new enemies, leaving all legacy enemies silent by default). The per-enemy `data.sfx` pattern is well-designed — adding sounds to any enemy is purely a data addition. The missing audio for boss entities is the most player-visible problem: boss fights without damage audio feel broken, not just sparse. The two missing SFX names (`'hit'`, `'craft'`) are implementation gaps — they are called by systems but were never registered with AudioSystem.

---

## Priority Recommendation

The following 10 items are the recommended priority order for the next development sprint, framed as concrete engineering tasks.

**Note:** Items 1–5 are prerequisites for any meaningful playtesting of the game's intended experience. Items 6–10 unlock or unblock the three design pillars.

---

**1. Fix zone boss activation (S — one line)**
Add `room.isZoneBossRoom = !!this.isZoneBossRoom` before returning from `RoomGenerator.generateBossRoom()`. This single line unblocks all three implemented boss encounters and makes the Bad Ending pillar playtestable. Do this before any other work. Prerequisite for: everything in Pillar 1.

**2. Fix Player.reset() completeness (M — mechanical)**
Add the ~35 missing field resets to `Player.reset()`. Cross-reference against the constructor to identify every initialized field. Mark intentional survivors (`characterType`, `godMode`) with comments. Simultaneously: add `this.companion = null` to the `main.js` constructor and death reset block. Prerequisite for: any playtesting that relies on the roguelike reset contract.

**3. Fix CombatSystem.clear() — add 8 missing array clears (S)**
Add `this.pendingMeleeAttacks.length = 0` and 7 equivalent lines to `CombatSystem.clear()`. The `objectDestroyEvents` gap in particular can cause loot drops from previous rooms to appear in new rooms. Prerequisite for: reliable room transitions in any test.

**4. Fix ErrandSystem stage-0 inventory lookup (S)**
Change `ing.char === requestedChar` to `ing === requestedChar` in `ErrandSystem.checkGive()`. This is one character. Stage-0 errands are a primary mid-game mechanic and are permanently off in the current build. Prerequisite for: any NPC quest content.

**5. Fix consumable slots 4/5 equip handler and `auto_dodge`/`panic_blind` triggers (S)**
Two changes in `MenuSystem.selectMenuItem()` and `InventorySystem._checkTriggerCondition`. Slots 4/5 are a boss reward that currently does nothing. `auto_dodge` and `panic_blind` are green-zone craftable items that are dead in EXPLORE. Both are player-facing broken promises.

**6. Fix ITEMS['╪'] duplicate key — Lava Sword (S)**
Assign Lava Sword a unique char (it conflicts with Stun Baton). Update the recipe and WEAPON_TIERS.sword tier 2 reference. The Lava Sword is in the recipe book and players will craft toward it; receiving a Stun Baton silently is a trust-breaking bug. Simultaneous: fix Stun Baton's missing `weaponType` field.

**7. Fix BACKGROUND_OBJECTS duplicate keys `^` and `v` (S)**
Assign Stairs Up/Down to new non-colliding chars. The current collision overwrites Tunnel Entrance Up/Down with Stair data, breaking PlaneSystem tunnel entry detection. With tunnel rooms growing in scope, this is now load-bearing.

**8. Fix the six CombatSystem area-effect plane filters (M)**
Add `inSamePlane(enemy, source)` guards to `createChainLightning`, `createExplosion`, `applyAOEStatus`, `checkProximity`, `updateRollDamage`, and `conductElectricity`. Each is a one-line addition per loop. This closes the cross-plane damage surface before U-room and tunnel content expands. Prerequisite for: any plane-aware combat content.

**9. Wire character weapon affinities — Red Warrior, Yellow Mage, Gray Assassin (S–M)**
The data for these three character abilities is defined in `characters.js` but never consumed. Wire them in `CharacterSystem`. These are core character identities — players who pick Red Warrior or Yellow Mage have no mechanical differentiation today. Prerequisite for: character-specific playtesting in Pillar 2 work.

**10. Design and implement Yellow zone boss (L — design-first)**
BossSystem architecture is proven with three examples. Yellow zone needs a boss entity designed before it can be wired. This is the only Bad Ending prerequisite that requires design work rather than engineering fixes. Start with design document; entity implementation follows the GooDragon/LakeBoss pattern. Prerequisite for: Bad Ending completability.

---

## Appendix: Items Deliberately Not Prioritized

The following confirmed bugs are real but are not in the top 10 because they are lower gameplay impact, lower visibility, or dependent on higher-priority fixes completing first:

- NeutralRenderer `@` hardcode (fix after character system is validated)
- InventoryOverlay textAlign leak (fix as part of any rendering cleanup sprint)
- Ember particle alive-field bug (cosmetic; fix with particle system cleanup)
- Flee-to-exit algorithm duplication in NPCs (refactor; no player impact)
- Font violations in NeutralCharacter base class (one-line fix; schedule with any NPC work)
- BoulderSystem direction inversion (fix with boulder content work)
- FishingSystem water tile char mismatch (fix with fishing content work)
- CraftingSystem discoveredPairs cross-run leak (design decision: intentional or not?)
- PersistenceSystem operational status (verify call sites are no-ops; no active player impact if they are)
- Gray zone Queen Spider thematic mismatch (content decision; minor)

---

*Report synthesized from: holistic-entities.md, holistic-systems.md, data.md, game.md, rendering.md. All bugs cited are confirmed from source code review, not inferred.*
