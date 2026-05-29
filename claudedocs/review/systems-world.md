## WORLD & LEVEL SYSTEMS REVIEW

_Reviewed: 2026-05-15. Files: RoomGenerator.js (~3423 lines), ZoneSystem.js (~400 lines), ExitSystem.js (~207 lines), DungeonSystem.js (~641 lines)._

---

### RoomGenerator.js — Method Catalog

| Method | ~Line | Purpose | Issues |
|--------|-------|---------|--------|
| `constructor` | 14 | Init depth, zone weights, colors, exit system refs | `game` ref used only for cheat flag; ok |
| `setDepth` | 25 | Sets `this.currentDepth` | None |
| `isInClearingZone` | 30 | Checks whether a pixel position falls in the template's clearing zone or vault bounds | Correct |
| `generateRoom` | 59 | Main entry: selects type by letter, builds room object, dispatches to type-specific generator | Letter-to-type mapping is if/else chain (not a map); `BAT_BELFRY` has no letter trigger here — only injected by `main.js` secret pattern |
| `determineRoomType` | 200 | Weighted random room type selection | **Bug**: BOSS has 10% random weight, making it appear frequently in normal traversal before depth threshold. Zone-boss injection in main.js overrides the type, but a randomly-rolled BOSS room goes through `generateBossRoom` (generic `createBossEnemy`) rather than `BossSystem.activate` — no zone boss, no special music, no multi-phase combat |
| `getEffectiveZoneForFeatures` | 211 | Picks current or target zone for liquid/terrain based on progression blend | Correct; lava/mud zones cannot be overridden by progression |
| `createCollisionMap` | 247 | Builds border walls, stamps wall structures, clears exit areas | Vault structure placed before exit clearance; vault corners can cover exit zones if vaultStructure is large |
| `generateCombatRoom` | 333 | Standard combat room: terrain, enemies (1–6 by depth), depth-1 starter weapons | Enemy count formula `min(1 + floor(depth/2), 6)` yields 1 at depth 0–1, max 6 at depth 10; reasonable but flat curve |
| `generateBossRoom` | 400 | One-off boss enemy via `createBossEnemy` | **Critical bug**: This is the *generic* boss room (random enemy with 2× stats, pink color). The zone-specific boss (GooDragon / Ancient Turtle / LakeBoss) is added by `BossSystem.activate`, but `activate` is only called in `main.js` when `this.currentRoom.isZoneBossRoom` is true. `isZoneBossRoom` is set on the *generator instance* (`roomGenerator.isZoneBossRoom = true`) but is **never read inside RoomGenerator** and **never stamped onto the returned room object**. So `this.currentRoom.isZoneBossRoom` is always `undefined`/falsy, and `BossSystem.activate` is never called. Zone bosses silently fall back to a generic pink 2× enemy. |
| `generateDiscoveryRoom` | 431 | No enemies, spawns one rare item from a hard-coded 7-item array | Item pool (`⌂‡)X⌘⟩⊤`) is fixed regardless of zone or depth; no zone-appropriate rare items |
| `generateCampRoom` | 449 | Safe room with campfire and CampNPC | NPC col cleared manually; fragile if centerCol changes |
| `generateTunnelRoom` | 502 | Dual-plane tunnel (horizontal or vertical) with entrance markers | `wallChar = '>'` on horizontal right entrance conflicts with slope char used in ASCENT; rendered as tunnel entrance but ASCENT room uses `>` as a slope marker — same char, two meanings, no disambiguation via `data` field at placement time |
| `generateAscentRoom` | 659 | Central plateau ringed by directional slope tiles | Slope tiles override `data` inline — avoids tunnel plane-switch (good). Uses `<`, `>`, `v`, `ʌ` chars |
| `generateUndergroundRoom` | 738 | Full cellular-automata cave; surface blocked, cave network on plane 1 | **Duplication**: entire cave gen (cellular automata, carvePath, entrances, caps) is copy-pasted verbatim into `generateBatBelfryRoom`. Should be extracted to a shared helper |
| `generateBatBelfryRoom` | 1032 | BAT_BELFRY cave variant with 15 bats instead of random enemies | Full duplication of underground cave gen (see above). No surface-only surface rocks, no secret vein, no spawn zones, no pickaxe — intentional omissions but not documented |
| `_shuffleArray` | 1202 | Fisher-Yates in-place shuffle | Correct |
| `generateIslandTerrain` | 1210 | Annular water ring around island land mass | Up to 200 attempts for barrel placement — acceptable |
| `generateOceanTerrain` | 1289 | Fills east portion with sand + water columns | `disableEast` applied post-exit-generation; east exit may have already been added to room.exits before this strips it (ordering: exits generated in `generateRoom` before `generateCombatRoom` is called, which calls `generateBackgroundObjects`, which calls `generateOceanTerrain`). Exit is disabled in the room data but ExitSystem has already returned an east letter object. Renderer and collision logic may show east exit that isn't usable. |
| `generateLakeTerrain` | 1332 | Blob-node lake with perlin-like edge noise | Correct |
| `preloadRoomPreviews` | 1393 | Pre-generates north/east/west preview data (type, char, name) | Only generates 3 directions; south is always null. Preview uses `determineRoomType()` — can roll BOSS type for preview before actual boss injection |
| `findSpawnPosition` | 1408 | Radial random search, 20 attempts, returns null on fail | **Bug**: callers (`spawnEnemiesFrom`) use result without null check — `new Enemy(char, null?.x, null?.y, depth)` would NaN-position the enemy. Should guard the null return |
| `spawnEnemiesFrom` | 1436 | Spawns enemies from a spawner entity during gameplay (not generation) | `findSpawnPosition` null result not guarded (see above) |
| `hasObjectAt` | 1463 | Pixel-proximity check for object overlap | Threshold is CELL_SIZE/2 — works for grid-aligned but misses sub-cell placed objects |
| `getIslandPosition` | 1472 | Radial enemy/barrel spawning restricted to island land | 200 attempts, fallback to center — safe |
| `getRandomPosition` | 1522 | General position finder with 100-attempt do-while | **Bug**: at attempt 100, returns `{x: x*CELL_SIZE, y: y*CELL_SIZE}` using whatever `x,y` were last in the loop (could be a collision cell, a liquid tile, or an exit zone). No indication of failure to caller — **silent bad position returned**. Should return a fallback center or log a warning |
| `generateBackgroundObjects` | 1657 | Orchestrates grass, recipe sign, clusters, liquids, minerals, depth-objects, corner clusters | Calls `generateLiquidFormation` even in zones with special liquids if `zoneHasSpecialLiquid` + random < 0.5; lava zones can get extra organic lava pools (intentional per comment) |
| `generateGrassSwaths` | 1708 | 4–7 grass clusters of 20–40 blades each | Grass placed at sub-pixel positions (not grid-aligned) — visual-only, no gameplay impact |
| `generateCornerClusters` | 1783 | Organic clusters at 4 room corners | Only runs if `cornerClusters.enabled` in template (B template uses it) |
| `generateOrganicClusters` | 1818 | 2–5 clusters of trees/bushes/brambles/stumps | `preSpawnBurned` check uses `bgObject.onFire !== undefined` but `BackgroundObject` doesn't define `onFire` — condition is always false, burned organic logic silently never runs for RED zone. |
| `generateWaterFormation` | 1866 | Pool, lake, or stream water shapes | Lake sub-type only triggers at `depth >= 5`; stream uses `Math.round(Math.random() * 2) - 1` for perp offset, producing values {-1, 0, 1} — skewed distribution (0 appears ~50%, ±1 each ~25%) |
| `placeWaterStructures` | 1931 | Stamps pre-defined WATER_STRUCTURES patterns into room | Up to 50 placement attempts per structure — correct |
| `_pickWeightedWaterStructure` | 1956 | Weighted selection over eligible structures | Correct |
| `_canPlaceWaterStructure` | 1966 | Exit-aware placement validator for water patterns | Correct |
| `_stampWaterStructure` | 1986 | Places water tiles from pattern | Correct |
| `placeLiquidStructures` | 2001 | Routes to lava or water based on zone features | Correct |
| `placeLavaStructures` | 2016 | Same shape logic as placeWaterStructures but stamps lava | Duplicate of placeWaterStructures logic; only difference is `_stampLavaStructure` call. Could be unified |
| `_stampLavaStructure` | 2042 | Stamps lava tiles with zone-specific color + damage flag | Correct |
| `generateLiquidFormation` | 2062 | Routes to lava or water organic formation | Correct |
| `generateLavaFormation` | 2075 | Circular lava blobs (1–2 formations, radius 2–4) | Correct |
| `generateMineralFormations` | 2108 | 1–3 rock/crystal formations (0–1 in tunnels) | `rockData` fallback only uses `['0']` at depth < 10, then `['0', '*', 'Q']` — crystals/boulders only appear at depth 10+; zone rock variants override correctly |
| `generateDepthBasedObjects` | 2148 | 2–5 random objects from zone weights | Converts `~` to lava properties if in lava zone — correct. Does NOT avoid liquid tiles for non-liquid objects — rocks can be placed on top of water |
| `isValidPosition` | 2182 | Grid-position validity check (bounds, collision, exit clearance) | Correct; used by `islandTerrain` and slope placement |
| `generateMudBeds` | 2218 | 3–7 mud patches (RED zone feature) | Mud beds initialized with `slowing = false` — doesn't match `isDryMud = true` intent where PhysicsSystem presumably checks `slowing`; needs PhysicsSystem confirmation |
| `generateRecipeSign` | 2247 | 13% chance to stamp a recipe sign in a grass cluster | `canPlaceSign` accesses `bgObj.data.solid` without null-guard — crashes if `bgObj.data` is undefined (BackgroundObject constructor may leave `data` undefined for unknown chars). Also, sign is `null`-guarded by grassClusters array but the `attempt < 30` loop gives up silently |
| `canPlaceSign` | 2281 | Checks recipe sign placement validity | **Bug**: `bgObj.data.solid` — no null-guard on `bgObj.data`. If any background object in `room.backgroundObjects` has no `data` (e.g. slope tiles, cave wall `}` objects), this will throw `Cannot read properties of undefined (reading 'solid')` |
| `stampRecipeSign` | 2310 | Writes recipe as earth-colored chars to `room.recipeSign` | Recipe sign is single-row, 9 cells wide (`X + Y = Z` with spacing). Does not create BackgroundObjects — visual only |
| `getObjectWeights` | 2340 | Returns zone-specific or depth-based object weights | Zone weights take priority over depth weights; fallback depth weights are simple tiered tables |
| `weightedRandomChoice` | 2386 | Weighted random key selection | Correct |
| `randInt` | 2400 | Inclusive random integer range | Correct |
| `darkenColor` | 2404 | Darkens a hex color by percentage | Correct; used for pre-burned organic objects |
| `placeWallStructures` | 2430 | Stamps 1–N random wall structures into collision map | Guards against empty structure set with early return + console.warn |
| `placeVaultStructure` | 2462 | Stamps hollow square vault into collision map; stores `currentVaultInfo` | Correct; info used later by `getRandomPosition` to exclude vault interior |
| `getStructuresForRoom` | 2500 | Filters WALL_STRUCTURES to room-type-eligible set | Correct |
| `getStructureCount` | 2524 | Returns structure count per room type | Has explicit case for all current ROOM_TYPES; default returns 0 with console.warn |
| `selectWeightedStructure` | 2546 | Weighted selection of a wall structure | Correct |
| `getRandomStructurePosition` | 2561 | Random position with 2-cell margin from borders | Correct |
| `canPlaceStructure` | 2568 | Checks structure doesn't overlap walls or exit zones | Correct |
| `stampStructure` | 2617 | Writes structure pattern into collision map | Correct |
| `rotatePattern` | 2627 | Rotates boolean grid pattern by 0/90/180/270 degrees | Correct |
| `randomRotation` | 2653 | Returns random rotation from [0, 90, 180, 270] | Correct |
| `getRoomPreview` | 2658 | Returns preview char + name for room type | Only covers BOSS, DISCOVERY, CAMP, default (COMBAT). Other types (TUNNEL, ASCENT, HUT, etc.) fall through to the enemy char default — confusing for the minimap/UI |
| `applyZoneProperties` | 2672 | Applies zone-specific colors and properties to background objects | Only applies tree color to `&`, `%`, `+`, `Y` — same color for all organics. Brambles and stumps get tree color, not their own. |
| `applyKeyDropLogic` | 2707 | Marks object as key dropper based on K-room config | Correct |
| `ensureKeyDroppers` | 2723 | Guarantees at least one key dropper per K room post-generation | Uses `.sort(() => Math.random() - 0.5)` — technically biased shuffle (not Fisher-Yates). Minor |
| `getSecretEventTypes` | 2768 | Returns priority-ordered secret event definitions | Two events defined: `key_glitter` (P10), `leshy_chase` (P5). Comment scaffold for future events |
| `applySecretEvents` | 2825 | Applies highest-priority eligible secret event post-generation | Correct. Called externally (from main.js after room clear); not called during `generateRoom` |
| `markRandomBushShaking` | 2870 | Legacy method (pre-secret-event system) | Now unused per comment; dead code |
| `spawnGuaranteedItems` | 2893 | Spawns vault treasure for V rooms | Item pool `'rare_epic'` hardcoded. `K` (Dragon Scale Armor) appears in pool — uses letter char (legacy violation per CLAUDE.md). `^` (Hammer) is also an enemy char — ambiguous |
| `generateHutRoom` | 2937 | Exterior hut shell + door + optional witch legs; stores `room.hut` | Background clearing zone temporarily overrides template; restored after. Correct |
| `generateRidgeRoom` | 3104 | Ravine solidified in rows 1–9, BridgeWorker spawned, north exit colored gray | `room.exits.north.color` patched after exit object already returned — safe since it's the same object reference |
| `generateWellRoom` | 3178 | Circular well ring + center water + well metadata | Ring-cleanup loop skips `◯` stones by char — correct. Strips any standard bg object inside ring radius |
| `generateDungeonRoom` | 3254 | Exterior dungeon building from design grid; stores `room.dungeon` | No enemy spawns — correct. No background objects except design — design covers full room |
| `generateMazeRoom` | 3308 | 19×19 hollow exterior + decorative DFS mini-maze interior; stores `room.maze` | DFS is recursive with no stack depth limit — 8×8 logical grid = max 64 frames deep; safe in practice |
| `addEnemyToRoom` | 3411 | Routes enemy to `enemiesPlane0` or `enemiesPlane1` + legacy `enemies` array | Correct; plane defaults to 0 if undefined |

---

### Room Type Coverage

| Type | Letter Trigger | Generation Method | Status |
|------|---------------|-------------------|--------|
| `COMBAT` | X, V, K, E, I, O, L, C (any non-special) | `generateCombatRoom` | Fully implemented |
| `BOSS` | B (and zone-boss injection) | `generateBossRoom` | Partially implemented — generic boss always; zone boss broken (see bugs) |
| `DISCOVERY` | ? | `generateDiscoveryRoom` | Implemented; item pool static |
| `CAMP` | C | `generateCampRoom` | Implemented |
| `TUNNEL` | T | `generateTunnelRoom` | Implemented |
| `ASCENT` | A | `generateAscentRoom` | Implemented |
| `UNDERGROUND` | U | `generateUndergroundRoom` | Implemented |
| `BAT_BELFRY` | (B-A-T secret pattern only) | `generateBatBelfryRoom` | Implemented; no EXIT_LETTERS entry (secret only — correct by design) |
| `HUT` | H, P | `generateHutRoom` | Implemented |
| `DUNGEON` | D | `generateDungeonRoom` | Implemented; DungeonSystem handles interior |
| `MAZE` | M | `generateMazeRoom` | Implemented; MazeSystem handles interior |
| `RIDGE` | R | `generateRidgeRoom` | Implemented |
| `WELL` | W | `generateWellRoom` | Implemented |

Unlisted in `generateRoom` switch: None — all ROOM_TYPES have a case. If switch falls through (no match), room is returned with empty backgroundObjects and no enemies, which is a silent fail.

---

### Letter Template System Analysis

Templates in `LETTER_TEMPLATES`: A, B, V, K, T, E, I, L, L_BOSS, O, H, M, D, U, R, W

Letters in `EXIT_LETTERS`: A, B, C, D, E, H, I, K, L, M, O, P, R, T, U, V, W, X, ?

**Mismatches:**
- `L_BOSS` exists in `LETTER_TEMPLATES` but is not a letter in `EXIT_LETTERS` — it is never selected as a template via `exitLetter`. It appears intended for a future "boss on lake" scenario. Currently unreachable.
- `C` (Camp), `X` (Crossroads), `?` (Mystery), `P` (Press Hut) exist in `EXIT_LETTERS` but have no entry in `LETTER_TEMPLATES`. `P` reuses the `H` template via `type = ROOM_TYPES.HUT`. `C`, `X`, `?` receive `null` as their template — rooms proceed with defaults, which is fine.
- Template `E` (Errand) exists but is a COMBAT room type — errand NPC spawns post-clear, not in generation. The template only sets `neutralAfterClear: true` and `grassDensity: 0.7`, which are read by external systems (main.js). The actual template data (`neutralAfterClear`) is never read inside `RoomGenerator`. It is read in `main.js` on room clear event.

**Background object char references in templates:**
All chars referenced (`%`, `&`, `0`, `+`, `Y`, `n`, `p`, `#`, `B`, `8`, `i`, `*`, `~`, `=`) exist in `BACKGROUND_OBJECTS`. No broken references found.

**Enemy injection chars in templates:**
- `I` template: injects `g` (frog). `g` must exist in `ENEMIES` — not checked here, but the pattern is consistent with other frog references in the codebase.
- `L` template: injects `g` (frog).
- `O` template: injects `s` (sea snake). `s` must exist in `ENEMIES`.

---

### Enemy Spawn Distribution Analysis

`getZoneRandomEnemy(depth, zone)` is the primary spawn function. Zone-specific spawn tables defined in `zones.js` via `spawnTables` array (`'basic'`, `'forest'`, `'fire'`, `'demon'`, `'ice'`, `'frost'`, `'lightning'`, `'storm'`, `'undead'`, `'boss'`). The actual mapping of these table names to enemy chars is in `enemies.js`.

**Per-zone observations:**
- **green**: Tables `['basic', 'forest']`. `movementProfiles` lists chaser/keeper/kiter — documented alignment only; enemies are selected by spawn table, not movement profile.
- **red**: Tables `['fire', 'demon']`. Zone uses lava hazards that damage the player but not enemies — creates asymmetric combat pressure.
- **cyan**: Tables `['ice', 'frost']`. `bossDepth: 15` (all zones same threshold).
- **yellow**: Tables `['lightning', 'storm']`. Same bossDepth.
- **gray**: Tables `['undead', 'boss']`. `bossDepth` undefined — `isBossReady` returns false (no `threshold`). **Gray zone boss will never trigger**, consistent with the "endgame spoke" design intent but worth noting explicitly.

**Enemy count per room type:**
- COMBAT: `min(1 + floor(depth/2), 6)` → 1 at depth 0, 6 at depth 10+. Slow ramp.
- BOSS: Always 1 boss (via `createBossEnemy`); zone boss rooms add more via `BossSystem.activate` (but broken, see above).
- TUNNEL: 2–4 randomly.
- ASCENT: Same as COMBAT formula.
- UNDERGROUND: 3–6 (cave-only, plane 1).
- BAT_BELFRY: Always 15 bats (plane 1).
- WELL: 1–2.
- RIDGE: 1–2 (south of ravine only).
- HUT exterior: 2–4 (some skipped by proximity check, actual count may be 0–4).
- CAMP, DISCOVERY, DUNGEON, MAZE: 0 exterior enemies.

**Balance concerns:**
- COMBAT rooms cap at 6 regardless of depth. At depth 20 in gray zone, the count is still 6. Gray zone has `hardMode: true` (+50% stats) which compensates somewhat, but spawn count parity with depth-1 is a missed scaling opportunity.
- DISCOVERY room has no depth scaling on item pool — always the same 7 items regardless of zone or depth.

---

### Boss Room Injection Status

**Designed flow (main.js ~L1714):**
1. Zone depth reaches `ZONES[zone].bossDepth` (15 for green/red/cyan/yellow).
2. `zoneSystem.isBossReady(zone, depth)` returns true.
3. `roomType = ROOM_TYPES.BOSS`.
4. `roomGenerator.isZoneBossRoom = true` (set on generator instance, not room).
5. `generateRoom` calls `generateBossRoom` — produces generic pink 2× enemy.
6. `roomGenerator.isZoneBossRoom = false` (reset).
7. `this.currentRoom.isZoneBossRoom` is checked — **this is always undefined/falsy** because `isZoneBossRoom` was never written to the room object.
8. `bossSystem.activate` is **never called** in the normal boss path.

**Exception: cheat menu path (~L5285)** does call `bossSystem.activate` directly — that path works.

**Result:** Zone bosses (GooDragon, Ancient Turtle, LakeBoss) cannot spawn through normal gameplay. The room generates a generic pink 2× random enemy as the boss.

**Fix required:** Inside `generateBossRoom`, set `room.isZoneBossRoom = this.isZoneBossRoom` so the room object carries the flag. Or stamp it in `generateRoom` after `generateBossRoom` returns.

---

### ZoneSystem.js — Method Catalog + State Analysis

| Method | ~Line | Purpose | Issues |
|--------|-------|---------|--------|
| `constructor` | 31 | Initializes all tracking state | `defeatedBosses` and `bossRoomPending` added; `bossRoomPending` is set false in `markBossDefeated` but **never set true** anywhere — the flag is dead state |
| `recordExit` | 54 | Appends exit object to pathHistory (capped at 10) | Correct |
| `forceNextZone` | 65 | One-shot zone override (used by Ridge north exit) | Correct |
| `checkZoneTransition` | 69 | Determines current zone from pathHistory + counters | **Re-entry cost**: called repeatedly (from `getProgressionColor`, `getProgressionBlend`, `incrementRoomCount`) — each call iterates pathHistory. Fine at 10 entries |
| `getProgressionColor` | 94 | Returns the color currently being progressed toward | Calls `checkZoneTransition` then inspects last 1–2 history entries |
| `getProgressionBlend` | 121 | Returns `{targetZone, blendPercent}` or null | Correct; feeds RoomGenerator color blending |
| `incrementRoomCount` | 179 | Increments room counter, tracks consecutive green rooms | Calls `checkZoneTransition` — adds a second scan per room transition |
| `recordRoomClear` | 193 | Updates zone-specific clear count for captive tracking | Correct |
| `shouldSpawnCaptive` | 209 | Returns true when captive should spawn in cleared zone | 5-room threshold per zone; correct |
| `markZoneCleared` | 228 | Records zone as captive-rescued | Correct |
| `isBossReady` | 238 | Returns true when depth >= zone's bossDepth and not defeated | Gray zone has no `bossDepth` → threshold is `undefined` → returns false (safe, by design) |
| `markBossDefeated` | 245 | Records zone boss killed; clears `bossRoomPending` | `bossRoomPending = false` here — it was never set to true, so this is a no-op state change |
| `isZoneDefeated` | 251 | Used by ExitSystem to suppress defeated zone's color in exits | Correct |
| `resetOnRest` | 255 | Partial reset: room count, green counter, zone, leshy chase | `pathHistory` intentionally preserved; `clearedZones` intentionally preserved |
| `resetOnDeath` | 266 | Full reset for new run | All state cleared including `defeatedBosses` — correct for roguelike |
| `getBlendedEnvironmentColors` | 281 | Returns blended grass/tree/background colors | Correct |
| `startLeshyChase` | 307 | Begins Leshy chase event tracking | Correct |
| `recordLeshyChase` | 317 | Processes player's exit vs. Leshy's exit | `leshyChaseCount >= 3` triggers grove. Counter increments each correct follow — accumulates across rest stops if `resetOnRest` doesn't catch it. **`resetOnRest` does call `resetLeshyChase`** — correct |
| `resetLeshyChase` | 343 | Clears all Leshy chase state | Correct |
| `shouldSpawnShakingBush` | 355 | 20% chance of shaking bush in cleared green zone rooms | Only when not already in active chase — correct |
| `getCurrentZoneDepth` | 364 | Returns depth for current zone from `zoneDepths` map | Takes `zoneDepths` as parameter — architectural mismatch (depth lives on `game`, not `ZoneSystem`) |
| `incrementZoneDepth` | 368 | Increments zone depth, capped at `bossDepth` | **Bug**: capping at `bossDepth` means depth can never exceed 15. At depth 15, increment is skipped. This is intentional for boss gating, but gray zone has no bossDepth cap → gray depth grows unbounded (desirable for the "lost in the mist" design) |
| `toJSON` / `fromJSON` | 379 | Serialization helpers | `defeatedBosses` and `bossRoomPending` are not serialized — lost on save/load. Since persistence is disabled, this is moot, but a risk if persistence is ever re-enabled |

**Zone graph correctness:**
- green → alternativeZones: ['red', 'cyan', 'yellow'] ✓
- red → alternativeZones: ['green', 'cyan', 'yellow'] ✓
- cyan → alternativeZones: ['green', 'red', 'yellow'] ✓
- yellow → alternativeZones: ['green', 'red', 'cyan'] ✓
- gray → alternativeZones: [] ✓ (no colored exits)

All 5 zones defined. **Gray zone IS implemented** — `checkZoneTransition` returns `'gray'` when `consecutiveGreenRooms >= 10`. Zone data exists in `zones.js`. `bossDepth` intentionally absent. `noRest: true` and `hardMode: true` flags present but must be read externally.

**State reset correctness:**
- `resetOnDeath`: All fields explicitly reset ✓
- `resetOnRest`: Intentionally preserves `pathHistory` and `clearedZones` ✓
- `toJSON`: Misses `leshyChaseActive`, `leshyChaseCount`, `leshyLastExitDirection`, `defeatedBosses`, `bossRoomPending` ✓ (persistence disabled, low risk)

---

### Zone Graph Coverage

All zones defined in `zones.js` (`green`, `red`, `cyan`, `yellow`, `gray`) have corresponding implementation coverage in `ZoneSystem`, `ExitSystem`, and `RoomGenerator`. No zone entry in `zones.js` is orphaned.

`ZONE_COLORS` keys match all `zones.js` keys ✓

Exit color assignments in `assignExitColors` reference `ZONE_COLORS[altZone]` — as long as `alternativeZones` only contains valid zone names (they do), no broken references.

---

### ExitSystem.js — Method Catalog + Direction Coverage

| Method | ~Line | Purpose | Issues |
|--------|-------|---------|--------|
| `cycleExitLetter` (export fn) | 15 | Advances to next valid EXIT_LETTERS letter alphabetically | Correct; fallback returns `currentLetter` unchanged if no letters defined |
| `constructor` | 25 | Stores zoneSystem + game refs | `game` used for `player.luckBlessed` check |
| `generateExits` | 30 | Produces `{north, east, west, south}` exit object | `south` is always boolean (`true` unless gray zone). Up to 50 attempts per letter dedup. **Bug**: `i === 2` check for Ocean west exclusion uses index of the letter array during building — index 2 is west, correct. But the check inside the while condition duplicates the check outside it — redundant but harmless |
| `selectExitLetter` | 71 | Delegates to weighted letter selection for zone | Correct |
| `assignExitColors` | 76 | Assigns 2× current zone + 1× random alternative | Only one alternative color per room — the design intent is "mostly current zone, one hint of where you came from or where you're going" |
| `getLetterWeightsForZone` | 106 | Builds weights from EXIT_LETTERS + zone boosts + depth boss boost + luck boost + recency penalty | Recency penalty uses the last 5 exits from `pathHistory`. Boss weight doubled at depth ≥ 5. **Note**: `LUCKY_BOOST` boosts V (Vault) by 2.5× but V's EXIT_LETTERS entry marks it as COMBAT room type — the vault room is the COMBAT room with vault template, not a separate type. Correct. |
| `weightedRandomChoice` | 151 | Weighted random from letter map | Fallback to `'X'` (Crossroads) — correct |
| `checkSecretPattern` | 162 | Scans last N letters of pathHistory for known patterns | Patterns defined: `B-A-T`, `B-A-D`, `G-O-O-D`, `N-E-W`, `D-E-A-D`, `D-R-A-W`. Only `B-A-T` and `D-R-A-W` have active handling in main.js. `B-A-D`, `G-O-O-D`, `N-E-W`, `D-E-A-D` return pattern data but no handler reads `rewardType` — **these 4 secret patterns are detected but have no effect** |
| `updateExitCollisions` | 182 | Opens border cells at exit positions | Only opens `collisionMap[0][centerX]` (north), `[ROWS-1][centerX]` (south), `[centerY][COLS-1]` (east), `[centerY][0]` (west). Does NOT update player's collisionMap while inside maze/hut interiors ✓ |

**Direction coverage:**
- North: Opens row 0, col centerX ✓
- South: Opens row ROWS-1, col centerX ✓
- East: Opens row centerY, col COLS-1 ✓
- West: Opens row centerY, col 0 ✓

All four directions handled. South exit is boolean in `generateExits` but collision logic treats it same as others — consistent.

**Gray zone south exit:** `exits.south = zoneType !== 'gray'` → false in gray. `updateExitCollisions` checks `room.exits.south` before opening — south border stays solid in gray. Player cannot return to REST from gray zone. This matches `noRest: true` design intent.

**Zone-locked state after boss defeat:** `isZoneDefeated(zone)` filters `alternativeZones` in `assignExitColors`. After a zone boss is killed, that zone's color no longer appears as an alternative in exits. But since zone boss activation is broken (see above), `markBossDefeated` is never called through normal gameplay, so zone lockout never applies.

---

### DungeonSystem.js — Interior Pattern Compliance

**Comparison with HutSystem pattern (from CLAUDE.md):**

| Pattern element | HutSystem | DungeonSystem | Status |
|-----------------|-----------|---------------|--------|
| `generateXxxInterior` | `_generateHutInterior()` | `generateFloor(floorIndex, depth)` | ✓ Present (multi-floor variant) |
| `checkDoorEntry` | `nearExteriorDoor()` + `handleSpacePress` | `nearExteriorDoor()` + `handleSpacePress` | ✓ Symmetric |
| `checkXxxExit` | `nearInteriorExit()` + `handleSpacePress` | `nearInteriorExit()` + `handleSpacePress` | ✓ Symmetric |
| Physics redirect | `player.setCollisionMap(hutInterior.collisionMap)` | `_activateFloor` does same | ✓ Symmetric |
| `player.inHut` flag | Set/cleared on entry/exit | Reuses same flag (`inHut`) | ✓ Reuse (by design) |
| `player.hutExitPosition` | Saved on entry, restored on exit | Saved in `_enterDungeon`, restored in `_exitDungeon` | ✓ Symmetric |
| PiP rendering | `HutInteriorOverlay` | Same overlay (dungeon detected by `gridCols === INTERIOR_COLS`) | ✓ Disambiguated by `gridCols` |
| `enterRestState` reset | `hutInterior = null` | `dungeonFloors = []`, `dungeonCurrentFloor = -1`, `hutInterior = null` | ✓ |
| `enterExploreState` reset | `hutInterior = null` | Same | ✓ |
| Room transition reset | In room-enter block | Same | ✓ |
| Entry cooldown | `player._hutEntryCooldown` | Same field | ✓ Reuse |

**DungeonSystem-specific deviations (intentional extensions of the pattern):**
- Multi-floor: uses `game.dungeonFloors[]` array and `game.dungeonCurrentFloor` index — new state not in HutSystem. Correctly initialized in main.js constructor and all reset points.
- PiP disambiguation uses `hutInterior.gridCols === INTERIOR_COLS` (24) vs. hut interior cols — clever but fragile. If INTERIOR_COLS ever matches a hut interior size, the overlay would misidentify the room type.

**Asymmetric issues:**
- `nearInteriorExit` early-returns if `hutInterior.gridCols !== INTERIOR_COLS` — this is the dungeon guard, ensuring hut interiors don't accidentally trigger dungeon exit logic. But it means `nearInteriorExit` is a DungeonSystem-specific method despite being named generically. Could cause confusion if a third interior system is added.
- `checkStairs()` at line 248 is an empty stub with a comment saying staircase transitions are triggered by `handleSpacePress`. The method is called inside `update()` at line 521. This is a dead call — the method body is empty. Should be removed.

---

### Dungeon Layer System

Per `CLAUDE.md`: "Top layer (risky items), bottom layer (green dungeon key required)."

**What is implemented:**
- 3 floors (index 0, 1, 2), defined by `MAX_FLOOR_INDEX = 2`.
- Each floor has a `stairsLocked` flag and `unlockCondition` of type `key_enemy`, `glitter_object`, or `item_slot`.
- Last floor (index 2) has no stairs, no unlock condition.
- Reward items scale by floor tier: floor 0 gets 3–4 dmg weapons, floor 1–2 gets 5–6 dmg, floor 3+ gets top tier (unreachable since MAX_FLOOR_INDEX is 2).

**What is NOT implemented:**
- **Green dungeon key requirement**: No check for a "green key" item before allowing dungeon entry. Any player can enter any dungeon at any time. The design doc mentioned "bottom layer (green dungeon key required)" — this is not enforced anywhere in `DungeonSystem`, `HutSystem`, or `main.js` entrance checks.
- **Layer 2 (bottom layer) as a distinct zone**: The current implementation has three sequential floors of the same dungeon rather than a top/bottom conceptual split. If the CLAUDE.md design means "the deeper dungeon system requires a key to access," this is unbuilt.

---

### Glitter Object Monkey-Patch Anti-Pattern

Confirmed at `DungeonSystem.js:159–165`:

```js
const origTakeDamage = target.takeDamage.bind(target);
target.takeDamage = (amount, isBlade) => {
  origTakeDamage(amount, isBlade);
  target.hp = target.maxHp; // restore — object never dies
  target.glitterHit = true;
  return { destroyed: false, effect: null };
};
```

Per CLAUDE.md: "Monkey-patching `takeDamage()` on live entities at runtime (see DungeonSystem glitter objects). Use flags or state fields instead."

This is confirmed present and matches the documented anti-pattern. The return value `{ destroyed: false, effect: null }` is hardcoded regardless of what `origTakeDamage` computed, which means any effect triggered by `BackgroundObject.takeDamage` (sparks, message, etc.) is suppressed. Additionally, if the object is in the `candidates` filter (`o.hp !== null && o.maxHp !== null`) but `takeDamage` is defined differently on a subclass, the binding may produce unexpected behavior.

---

### Infinite Loop / Spawn Risks

| Location | Risk | Severity |
|----------|------|----------|
| `getRandomPosition` | do-while capped at 100 attempts — **returns last invalid position silently** at cap | Medium — enemies or items may spawn on walls/water/exit zones |
| `findSpawnPosition` | 20 attempts, returns `null` — callers in `spawnEnemiesFrom` do not null-check result | Medium — `new Enemy(char, null?.x, null?.y)` → NaN position, enemy stuck at (NaN, NaN) |
| `generateIslandTerrain` (barrel placement) | 200 attempts with valid fallback to center | Low — center fallback is safe |
| `getIslandPosition` | 200 attempts with fallback to island center | Low — safe |
| `generateRecipeSign` | 30 attempts, silent fail if no valid position | Low — just no sign |
| `placeWallStructures` | 50 attempts per structure, skips if fail | Low — safe skip |
| `placeWaterStructures` / `placeLavaStructures` | 50 attempts per structure, skips if fail | Low — safe skip |
| `ExitSystem.generateExits` | 50 attempts per letter dedup — could loop if EXIT_LETTERS has only 3 entries | Theoretical — EXIT_LETTERS has 20+ entries |
| `generateMazeRoom` DFS recursive carve | Max 64 stack frames (8×8 grid) | Low — no risk |
| `generateUndergroundRoom` cellular automata | 5 fixed iterations | No risk |

**Summary:** `getRandomPosition` is the most impactful risk — it silently returns a potentially invalid position when 100 attempts are exhausted. No caller checks for validity after the call.

---

### Bugs & Logic Errors

**P1 — Zone boss never activates in normal gameplay**
- `roomGenerator.isZoneBossRoom` is set on the generator instance but never read inside `RoomGenerator.js` and never stamped onto `room`.
- `this.currentRoom.isZoneBossRoom` at `main.js:1735` is always `undefined`.
- `BossSystem.activate` is never called through normal gameplay.
- GooDragon, Ancient Turtle, LakeBoss are unreachable without cheats.
- Fix: In `generateRoom` or `generateBossRoom`, set `room.isZoneBossRoom = !!this.isZoneBossRoom`.

**P1 — `canPlaceSign` crashes on background objects with undefined `data`**
- `bgObj.data.solid` at line 2296 will throw if `bgObj.data` is undefined.
- Objects without a matching BACKGROUND_OBJECTS entry (e.g. slope tiles using `<`, `>`, `v`, `ʌ` chars, cave wall `}` objects, glitter `⊙` markers) may have undefined `data`.
- This can crash during room generation in any room that has a recipe sign placement attempt.
- Fix: Add `bgObj.data?.solid` null-safe access.

**P1 — `findSpawnPosition` null not guarded in `spawnEnemiesFrom`**
- `spawnEnemiesFrom` at line 1447 proceeds to `new Enemy(spawnChar, spawnPos.x, spawnPos.y, ...)` without checking if `spawnPos` is null.
- At high enemy density with a full collision map, `findSpawnPosition` returns null after 20 tries.
- NaN-positioned enemies are added to `game.physicsSystem` and participate in combat with invisible positions.
- Fix: `if (!spawnPos) continue;`

**P2 — `generateBossRoom` fallback creates generic boss, not zone boss**
- When `determineRoomType` randomly rolls BOSS (10% chance), `generateBossRoom` is called but `isZoneBossRoom` is false — a generic 2× pink enemy is produced. The letter on the exit will be `B`, but the room uses the same `generateBossRoom` as the zone-boss injection path.
- This means `B` rooms in early game (before depth 5 where boss weight doubles) can appear and contain a generically buffed random enemy, not a proper boss encounter.

**P2 — Ocean east exit added then stripped — inconsistent state**
- `generateOceanTerrain` at line 1327 sets `room.exits.east = false` after exits are generated.
- The east exit letter object was already created by `ExitSystem.generateExits` and returned in the initial exits object. Setting it to `false` makes the east exit non-functional but the letter was counted in the "3 unique letters" dedup loop.
- Downstream code that reads `room.exits.east` correctly sees `false`, so the player cannot use it. But the letter is "consumed" from the uniqueness pool — minor waste.

**P2 — `generateOrganicClusters` pre-burned logic never fires**
- `if (preSpawnBurned && bgObject.onFire !== undefined)` — `BackgroundObject` does not define `onFire` property.
- Burned trees/bushes in RED zone never receive the 50% color darkening.
- `preSpawnBurned: true` in RED zone's config has no visible effect.

**P2 — `bossRoomPending` is dead state**
- `ZoneSystem.bossRoomPending` is initialized to `false`, set to `false` in `markBossDefeated`, and never set to `true` anywhere. The flag exists but is never used.

**P2 — 4 secret patterns have no handlers**
- `B-A-D` (cursed_chest), `G-O-O-D` (holy_chest), `N-E-W` (rare_ingredient), `D-E-A-D` (gray_zone_hint) are detected by `checkSecretPattern` but `rewardType` is never acted upon in `main.js`. Pattern is returned, passed to `enterExploreState` as `secret?.pattern`, but only `B-A-T` and `D-R-A-W` have explicit handling. The other 4 produce no effect.

**P2 — `markRandomBushShaking` is dead code**
- Method at line 2870 is never called. It predates the secret event system. Safe to remove.

**P2 — `toJSON` in ZoneSystem omits new state fields**
- `leshyChaseActive`, `leshyChaseCount`, `leshyLastExitDirection`, `defeatedBosses`, `bossRoomPending` not serialized.
- Persistence is disabled so this is currently harmless, but breaks if persistence is re-enabled.

**P2 — `getRandomPosition` silent fallback on exhaustion**
- After 100 failed attempts, returns the last `x,y` from the loop body. That last position failed all checks — it may be a wall cell, liquid cell, or exit zone. No log emitted.
- Could be improved: return a known-safe center position or emit a console.warn.

---

### Cross-Reference Notes

1. **`BAT_BELFRY` has no EXIT_LETTERS entry** — correct by design (secret pattern only). It is never selectable as a random exit letter.

2. **`L_BOSS` template is unreachable** — `LETTER_TEMPLATES.L_BOSS` exists but `EXIT_LETTERS` has no `L_BOSS` key. It is never loaded as `this.currentLetterTemplate`. It was presumably designed for a future boss variant of the Lake room. Until an `L_BOSS` letter is added to `EXIT_LETTERS` and a trigger exists (e.g. depth threshold injection), this template is unused dead data.

3. **`determineRoomType` ignores letter template** — when `exitLetter` is set, `generateRoom` overrides the type via the if/else chain before calling `determineRoomType` only as a fallback. The type override chain at the top of `generateRoom` is authoritative. `determineRoomType` is only reached when no letter-based override matches. Correct.

4. **Gray zone south exit behavior** — `exits.south = zoneType !== 'gray'` produces `false` in gray. `updateExitCollisions` conditions south border opening on `room.exits.south`. `main.js` south exit check conditions on `this.currentRoom.exits.south`. So gray south exits are correctly blocked at all three layers. Consistent.

5. **DungeonSystem grid size disambiguation** — `hutInterior.gridCols === INTERIOR_COLS (24)` is used to detect dungeon vs. hut interior. Hut interiors (HutSystem) use a different `INTERIOR_COLS` (also defined in HutSystem). If both use the same value, disambiguation breaks. Actual values need cross-check between the two systems. (Not read in this review scope; flagged for verification.)

6. **`updateExitCollisions` called in player movement loop** — opens border cell collisions every frame. If called before room generation completes, could open cells prematurely. Structurally, it's called in `updateExploreState` which runs after room is established — safe.

7. **Vault structure placed before exit clearance in `createCollisionMap`** — `placeVaultStructure` runs before the exit-clear loops (lines 283–325). If vault walls land exactly at an exit cell (unlikely but possible with very specific vault config), the exit clear loop would then set them to `false`, inadvertently creating a wall gap in the vault. The vault template hardcodes `centerCol: 15, centerRow: 15, size: 7` — vault occupies cols 12–18, rows 12–18, well away from exit zones (exits at rows 0/27, cols 0/27, center cols/rows). No practical risk with current config, but fragile if vault params are changed.
