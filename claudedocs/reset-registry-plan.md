Grounding done: read the PRD, `enterTitleState` (main.js:913-981), `_resetRunToRest` (4061-4174), `enterRestState` (1217+), `applyRoomSwap` (4329+), `_resetEnvironmentalEffects` (2359), `InteriorManager.reset` (85-124), `ZoneSystem.resetOnDeath/resetLeshyChase/resetRiverChase` (437-560), `Player.reset` (965+), `InventorySystem.handleGameOver/clearAllCharacterInventories`, `DungeonBossSystem.resetRunState`, `CommandSystem.clearRunState`, `tools/check-reset-parity.mjs` in full, CLAUDE.md, arch-budgets. Ran `node tools/check-reset-parity.mjs`: **passes today — 0 contract drift on both paths** (47 / 23590 non-contract).

---

# Plan — Declare-Once Reset Registry

Implements `claudedocs/reset-registry-prd.md`. Baseline verified: `node tools/check-reset-parity.mjs` → `enterTitleState: 0 | _resetRunToRest: 0`.

## 0. Headline findings that change the PRD's assumptions

1. **Risk #2 is real and resolves *against* the PRD's phrasing: `enterTitleState` is NOT a superset of `_resetRunToRest` today.** It is an *overlapping* set. ~20 statements are shared, ~14 are title-only, and **~30 run-scoped fields are cleared on death but survive TITLE** (`wishesUsed`, `_savedDestroyedSlots`, `_savedMagicMeter`, `wellCoinAnim`/`wellFlashTimer`/`wellFlashDuration`, `spectaclesObtainedThisRun`, `fairiesAngered`, `chiBladeFound`, `fedCrowCount`, `companionCrows`/`followerCrows`/`tamedRats`/`golems`, `ridgeBridgeBuilt`, `deadCharacters`, `lostCharacters`, `graySnapshots`, `activeCharacterType`, `unlockedCharacters`, `captives`, `characterNPCs`, `companion`, `cheatUsed`, `runId`, `gameOverWaitingForSpace`, the whole `_resetEnvironmentalEffects()` set, `craftingSystem` slots+discoveries, `errandSystem.resetOnDeath()`, `inventorySystem.restQuickSlots`/`restActiveSlotIndex`, and — the big one — the difference between `handleGameOver()` and `clearAllCharacterInventories()`, i.e. TITLE leaves `itemChest`/`armorInventory`/`consumableInventory`/`keyItemInventory`/`coinWallet` intact).
   **Assessment: none of these is intentional title-only-or-run-only state. They are 30 latent gaps in the TITLE path**, invisible because TITLE is only reachable from boot and from the arcade demo, and because the harness's `driveThroughRun()` never dirties them. So the cascade model **holds as designed** — and the migration *makes* `title ⊇ run` true rather than assuming it. Conversely, the *run* path is unchanged by the cascade (run is the narrower tier), which is what makes the risk asymmetric and manageable.
   Two title-only items also look like gaps in the *death* path, not intentional: `blueZoneRoom = 0` and `roomGenerator.setDepth(0)` → both become run-scoped.
2. **Ordering dependencies: only two are real** (§4). No dependency graph or topological sort is needed; declaration order plus one explicitly "late" section covers it. PRD Risk #1 resolved.
3. **Four fields have no declaration site at all** (lazily created — the anti-pattern CLAUDE.md names): `blueZoneRoom`, `grayThreeExitShown` (reset-only), `alchemistNPC`, `savedExploreState` (+ `savedExploreEnemies`/`savedExploreCaptives`/`savedExploreBackgroundObjects`), `_savedMagicMeter`. `savedExploreState`'s family is cleared by **neither** reset path — a genuine bug candidate, log it in `known-bugs.md` when Step 2 fixes it.
4. **`player.magicMeter = {...}` in `_resetRunToRest` (4087-4089) is dead weight**: `Player.reset()` runs later in the same function and overwrites it with `{active:false, slots:[], current:0, max:10, freeSlotGranted:false}` — the inline literal even *lacks* `freeSlotGranted`. Drop it; keep `_savedMagicMeter = null`.
5. **`knownSpells` is the copy-drift shape in miniature**: TITLE does `knownSpells?.clear?.()`, death does `= new Set()`. Verified no module caches the Set (every reader does `game.knownSpells?...`), so one entry `fresh: () => new Set()` is safe.
6. **`main.js` is at budget** (`tools/arch-budgets.json`: 199992 chars). This migration is net-negative on main.js (~-180 lines across Steps 2/3/5) with the table living in an unbudgeted file — run `node tools/check-architecture.js --update` at the end to lock the smaller ceiling.
7. **GLOSSARY**: "reset registry", "reset scope", "reset tier" are new domain terms. Per CLAUDE.md, propose them to the user before they spread into code — don't coin silently.

## 1. Registry API surface

**File: `src/game/resetRegistry.js`** — table *and* consumer in one file so they cannot drift.

Why `src/game/` and not `src/data/`: the table must reference *system methods* (`zoneSystem.resetOnDeath`, `inventorySystem.handleGameOver`). `src/data/*.js` is a content catalogue layer (ITEMS/ENEMIES/RECIPES/zones) and importing `src/systems/*` from it inverts layering. `src/game/` already holds orchestration-level declarations (`GameConfig`, `GameStateMachine`, `inputCapture`) and is not in `arch-budgets.json`. All system access is via `game.*` at call time, so the file imports no systems at all — only `freshZoneDepths`/`newRunId`-style helpers.

```js
export const RESET_SCOPES = ['room', 'run', 'title'];   // narrowest → widest; index = lifetime
export function scopeIncludes(scope)                     // 'title' → ['room','run','title']
export const RESET_REGISTRY = [ /* entries, execution order = array order */ ]
export function applyReset(game, scope, { init = false } = {})
export function initRegisteredState(game)                // = applyReset(game, 'title', { init: true })
export function registeredPaths()                        // Set<string>: every path + every `covers` entry
```

**Entry shape** (exactly one of `value` / `fresh` / `call`):

```js
{
  path: 'wishesUsed',     // dotted from `game`; a 'player.'-prefixed path resolves
                          //   through game.player and is SKIPPED when player is null
  scope: 'run',
  value: 0,               // primitive / immutable literal
  // fresh: () => new Set(),                       // factory — anything mutable, never a shared literal
  // call: (game) => game.zoneSystem.resetOnDeath(game),   // method-backed unit (PRD FR1 `reset`)
  // covers: ['alchemistNPC'],                     // game.* fields this call clears → FR5 traceability
  // init: false,                                  // skip during constructor consumption (Step 5)
  why: 'CLEANSE wishes are per-run (max 3).',       // the end-of-line prose from the old function, preserved
}
```

Deliberate choices:
- **`value` vs `fresh` instead of one `resetTo` that type-sniffs.** Two keys remove the "is this function a factory or the value?" ambiguity *and* force the author to decide about aliasing — which is the #100 failure mode. `value: []` is rejected by a load-time assertion (arrays/objects must use `fresh`).
- **`covers`** is how Risk #3 is answered mechanically: system-internal fields stay owned by the system (Non-Goals), but the `game.*` fields a system reset happens to clear are *declared* so FR5 can trace them. `covers` never lists fields that live inside the system (`zoneSystem.pathHistory` etc.) — those are out of scope by definition.
- **`why`** exists because every current reset line carries load-bearing prose ("the gray '3' call can happen again next run", "a new run is not yet owed anything"). Losing it to a terse table would be a regression; CLAUDE.md forbids golfing comments.

`applyReset` is ~25 lines: filter by `scopeIncludes(scope)`, walk the array in order, resolve owner via dotted path (bail on missing owner), apply, `try/catch` per entry with a `console.error` naming the path (a throwing entry must not abort the rest of a reset mid-way).

## 2. FR1 open question — resolved: **static declarative table**, not `registerResetField()` calls

Grounds, in this repo's terms:
- **Convention match.** Every registry here is a static exported literal consumed by readers (`ITEMS`, `ENEMIES`, `RECIPES`, `ZONES`, `letterTemplates`, `stateDefaults`' `APPROACH_VERB`). `tools/check-data.js` statically validates them. A call-based registry would be the only imperative one.
- **Tooling.** FR5 needs to enumerate entries. A static array can be read without side effects; call-based registration means the harness only sees fields whose modules happened to be imported and whose constructors happened to run — i.e. the tool's coverage silently depends on boot order. Disqualifying.
- **Anti-pattern list.** CLAUDE.md: "Lazy property initialization on plain objects at runtime. Initialize all fields in constructors or factory functions." Call-time registration is the same shape one level up.
- **Zero constructor disruption** in Steps 1-4 (PRD's stated tie-breaker).

**How this still satisfies Goal 2 ("declaration lives next to field creation")** — the strongest available answer: **make the registry entry *be* the creation site.** Step 5 has `Game.constructor` call `initRegisteredState(this)`, deleting the duplicated literals from the constructor. Then the initial value and the reset value are one literal, in one place, and "declare a new run-scoped field" is one table row — Acceptance Criterion #3 satisfied structurally rather than by convention. Optional later refinement (not in this plan): a system may export its own `RESET_ENTRIES` array that the table spreads in, for `game.*` fields the system owns (`DungeonBossSystem`'s three, `InteriorManager`'s eight). Keep composition one-directional (registry imports systems' arrays; systems never import the registry) to avoid cycles.

## 3. Scope cascade — confirmed, with one deferral

`room ⊂ run ⊂ title`. `applyReset(scope)` applies every entry whose tier index ≤ requested index. **No `dungeonVisit` tier**: the dungeon-visit fields (`dungeonKeySkullFloor`, `dungeonKeyUsedThisRun`, `dungeonRareItemObtainedThisRun`, `dungeonTemplatesUsedThisRun`) are all cleared by `InteriorManager.reset()`, which is called on exactly the room/REST-transition boundary — i.e. the `room` tier already is that tier. YAGNI holds.

**`room` tier is declared in the enum in Step 1 but not populated until the optional Step 6.** Reason: `applyRoomSwap` (main.js:4329) is *already* single-sourced (that was bug #93's fix), and its `resetEntities` block interleaves pure clears with room-derived assignment (`items = room.items || []`, `backgroundObjects = room.backgroundObjects || []`) and re-registration. Migrating it buys little and, via the cascade, would newly make the *death* path clear `currentRoom`/`items`/physics before its `stateMachine.transition(REST)`. That is provably safe (the sequence is synchronous — no frame renders between `applyReset` and the transition, and `currentRoom` is in the harness's `REGENERABLE_ROOTS`), but it's a behavior change with no bug behind it, so it gets its own step and its own decision point. Until then the world-teardown set (`currentRoom`, `items`, `ingredients`, `placedTraps`, `backgroundObjects`, `physicsSystem.clear`, `combatSystem.clear`, `huntingSystem.reset`) is **scope `title`**, matching today's behavior exactly.

## 4. Ordering-dependency audit (PRD Risk #1) — result

Two real dependencies; both are positional and expressible as declaration order.

| # | Dependency | Real? | How the plan handles it |
|---|---|---|---|
| 1 | `player.reset()` must run **after** every `player.*` literal entry — it rewrites `hp`, `quickSlots`, `activeSlotIndex`, `destroyedSlots`, `magicMeter`, buff timers | **Yes** (implicit today by sitting at the end of `_resetRunToRest`) | Table has a final `// ── late: whole-entity resets ──` section; `player.reset()` is its last row |
| 2 | `enterTitleState`'s `this.player = null` must run **after** the reset call, or every `player.*` entry silently no-ops | **Yes** (structural) | Stays inline in `enterTitleState`, after `applyReset(game, 'title')` |
| 3 | `applyReset(game,'room')` must precede `items = room.items` / physics re-registration in `applyRoomSwap` | Yes, but Step 6 only | `applyReset` call goes at the top of the `resetEntities` block |

Audited and found **not** dependent (order is arbitrary): `inventorySystem.restQuickSlots = [null×3]` before `handleGameOver()` — read `handleGameOver()`, it clears char inventories + shared inventories + saved explore room + saved rest ingredients and never reads `restQuickSlots`; `zoneSystem.resetOnDeath(game)`'s `game.alchemistNPC = null` — nothing re-derives it during reset; `_resetEnvironmentalEffects()` (self-contained arrays + four system `reset()`s); `craftingSystem.setState()` vs `resetDiscoveries()`; `cheatUsed = !!cheatMenu.godMode` (reads persistent cheat state, never a reset target); `_savedMagicMeter = null` vs the magic-meter clear; `zoneDepths` — the only cross-statement *read* of it is `enterRestState`'s `isFirstRun` check, which happens in a later call, not interleaved.

The bespoke audio conditional (`if (mode === 'sequence' || bossAnticipationActive) stopBossMusic()` then `hardResetDualLayers(...)`) is order-sensitive *within itself* and stays inline as one block — additional reason: it uses `import.meta.env.BASE_URL`, which shouldn't leak into the registry module.

## 5.-1. Addendum — a fourth case the original audit missed: death-output fields

Found during implementation kickoff, before Step 2 started. `lastDeathCause`,
`tombstoneActive`, `tombstonePopup` (main.js:352-354 constructor defaults;
:3218-3229 set at the death event, immediately before `_resetRunToRest()` is
called at :3897; :1816-1817 cleared inline when the player leaves REST for
EXPLORE) are a distinct shape from every category in §5: **death-path output
consumed by REST, not run-scoped input to be cleared by the run reset.**

`_resetRunToRest` runs at the exact moment these three are freshly populated —
registering them as `scope: 'run'` with a clear value would erase the tombstone
before REST ever renders it. **They must never appear in the run-scope
entries.** Their dismissal already has an owner (the explore-departure inline
check at :1814-1817) and stays exactly where it is — not registry material.

They ARE a title-scope gap, though, of the same shape as the ~30 fields in §5.B:
nothing today clears them on any of the five `transition(GAME_STATES.TITLE)`
call sites (main.js:623, 801, 910, 989, 2529), so a title return after a death
where the player never re-entered EXPLORE to dismiss the tombstone would carry
it stale into a future REST session. Add three **title-only** entries:
`lastDeathCause` (`value: null`), `tombstoneActive` (`value: false`),
`tombstonePopup` (`value: null`) — scope `'title'`, absent from `'run'` by
design, with a `why` noting the death-output invariant above so no future
contributor "fixes" the asymmetry by adding them to run scope.

## 5. Field-by-field migration inventory

### A. Shared today → `scope: 'run'` (title inherits) — 20 entries

`zoneDepths` (`fresh: freshZoneDepths`) · `zoneSystem.resetOnDeath(game)` (`call`, `covers: ['alchemistNPC']`) · `dungeonBossSystem.resetRunState()` (`call`, `covers: ['hoardmawDefeatedThisRun','goldBreathCurseActive','unlockedRareSayings']`) · `bossSystem.deactivate()` · `audioSystem.currentMusicZone = 'green'` · `preBossGateActive` · `preMinibossGateActive` · `knownSpells` (`fresh: () => new Set()`) · `commandSystem.clearRunState()` (`covers: ['commandedEnemies']`) · `runTimerSystem.clear()` · `threeRoomSystem.hardReset()` · `barricadeSystem.hardReset()` · `cursedRunSystem.hardReset()` · `threeSlotGlobeSystem.hardReset()` · `grayThreeExitShown` · `cursedRun` · `undeadSystem.clear()` · `menuSystem.clearPickupFeedback()` (`covers: ['pickupMessage','pickupMessageTimer','pickupMessageQueue']`) · `restBundle` · `hasLeftRestOnce`.

### B. Run-only today → `scope: 'run'` (TITLE gains these — see §7 risk) — ~32 entries

`gameOverWaitingForSpace` · `wishesUsed` · `_savedDestroyedSlots` (`fresh`) · `_resetEnvironmentalEffects()` (`call`, `covers: ['gooBlobs','puddles','enemyShockwaves','sniperBeams','debris','particles','steamClouds']`) · `inventorySystem.restQuickSlots` (`fresh`) · `inventorySystem.restActiveSlotIndex` · `inventorySystem.handleGameOver()` (`call`, `covers: []` — all fields are inside InventorySystem) · `_savedMagicMeter` · `wellCoinAnim` · `wellFlashTimer` · `wellFlashDuration` · `runId` (`fresh: newRunId`) · `cheatUsed` (`call: g => { g.cheatUsed = !!g.cheatMenu.godMode; }`) · `spectaclesObtainedThisRun` · `fairiesAngered` · `chiBladeFound` · `fedCrowCount` · `companionCrows` · `followerCrows` · `tamedRats` · `golems` · `ridgeBridgeBuilt` · `deadCharacters` · `lostCharacters` · `graySnapshots` · `activeCharacterType` · `unlockedCharacters` (`fresh: () => ['default']`) · `captives` · `characterNPCs` · `errandSystem.resetOnDeath()` · `craftingSystem.setState({left,right,center:null})` + `craftingSystem.resetDiscoveries()` (two entries) · `persistenceSystem.clearSave()` · `companion` · **new:** `savedExploreState` + `savedExploreEnemies` + `savedExploreCaptives` + `savedExploreBackgroundObjects` (currently reset by nothing — log as a bug when fixed) · **late section:** `player.reset()` (`call: g => g.player?.reset()`, `covers: ['player.destroyedSlots','player.magicMeter']`).

**Dropped as redundant duplicates** (§0.4, §0.1): the inline `player.magicMeter = {...}` and `player.destroyedSlots = [false,false,false]` (both owned by `player.reset()`); `inventorySystem.clearAllCharacterInventories()` (strict subset of `handleGameOver()`).

### C. Title-only today

| Item | Disposition |
|---|---|
| `blueZoneRoom = 0` | → `scope: 'run'` + add a constructor declaration (latent death-path gap) |
| `roomGenerator.setDepth(0)` | → `scope: 'run'` (mirror of `zoneDepths`; `enterExploreState` re-sets it per room anyway) |
| `currentRoom`, `backgroundObjects`, `items`, `ingredients`, `placedTraps`, `physicsSystem.clear()`, `combatSystem.clear()`, `huntingSystem.reset()` | → `scope: 'title'` in Phase 1; re-label to `room` in Step 6 |
| `titleAnimationTime`, `introAnimationStarted`, `launchButtonBounds`, `titleIdleTimer` | → `scope: 'title'` entries (title-screen state). `enterRestState`'s own `launchButtonBounds = null` stays as-is |
| `inventorySystem.clearAllCharacterInventories()` | dropped (subsumed) |
| `player = null` | **stays inline** (FR4; ordering dep #2) |

### D. Stays inline as bespoke, non-reset logic (FR4)

`enterTitleState`: `demoSystem.stopPlayback()` (RNG safety) · the two `ui.overlay.classList` toggles · `renderer.markBackgroundDirty()` · `player = null` · the title-music load guard (`titleTrackLoaded` check + `loadSingleTrack`).
`_resetRunToRest`: the boss-music conditional + `hardResetDualLayers(...)` block · `stateMachine.transition(GAME_STATES.REST)`.

### E. Out of scope per Non-Goals (bodies untouched; only call sites are registry entries)

`InteriorManager.reset()` (its `game.*` writes become its entry's `covers`: `activeFloor`, `mazeInterior`, `dungeonFloors`, `dungeonCurrentFloor`, `dungeonKeySkullFloor`, `dungeonKeyUsedThisRun`, `dungeonRareItemObtainedThisRun`, `dungeonTemplatesUsedThisRun`, plus the `player.*` interior fields — registered at `room` scope in Step 6, since today it is called from `enterRestState`/`transitionToNeutralRoom`/room transitions, *not* from either full-reset path) · `ZoneSystem.resetOnDeath` internals incl. `resetLeshyChase`/`resetRiverChase` · every `*.hardReset()` · `Player.reset()` · `InventorySystem.handleGameOver()` · `CommandSystem.clearRunState()` · `DungeonBossSystem.resetRunState()`. **System-internal fields are never registered** — only `game.*`/`player.*` fields are in scope, and a system reset's `covers` lists only the `game.*` fields it reaches.

Net: ~52 run entries + ~12 title entries ≈ 64 rows; main.js loses ~120 lines in Steps 2-3 and ~60 more in Step 5.

## 6. FR5 — harness integration, concrete diff shape

`tools/check-reset-parity.mjs`, five edits:

1. **`loadGameClass()` → `loadGameAndRegistry()`**: same Vite server, two `ssrLoadModule` calls before `server.close()`:
   ```js
   const mod = await server.ssrLoadModule('/src/main.js');
   const reg = await server.ssrLoadModule('/src/game/resetRegistry.js');
   await server.close();
   return { Game: mod.Game, reg };
   ```
   (SSR-loading it is required, not optional — the registry is ESM that may touch `import.meta.env` transitively.)
2. **New `UNREGISTERED_ALLOWLIST`**, sibling to `IGNORE`, same "each entry needs a reason" discipline. Seeded by Step 4's triage pass. Expected members: `ui` (DOM handle map), `keys`/`arrowKeys`/`keyBuffer`/`keyFlashMap` (live input), `stateMachine`/`gameLoop`/all `*System`/`*Manager` instances (matched structurally, not listed), the menu-state compromise cluster (`menuOpen`, `menuItems`, `selectedMenuIndex`, `menuColumns`, `disabledColumns`, `currentMenuSlot`, `selectedWeaponSlotIndex`, `selectedColumn`), debug toggles (`showVectors`, `particleFireworks`, `_fwTimer`, `_fwIndex`), `previousPlayerPosition`, and per-frame scratch (`captiveInteractionThisFrame`, `_enemyTickFrame`, `_hotSpringSteamTimer`, `_sharkLastDodgeInput`). `UPPER_SNAKE_CASE` names (`PICKUP_MESSAGE_DURATION`, `TITLE_IDLE_THRESHOLD`, `PREVIEW_BLINK_INTERVAL`, `GLITTER_SPAWN_INTERVAL`, `INACTIVITY_THRESHOLD`, `WASD_BLINK_INTERVAL`, `PATH_ANNOUNCEMENT_DURATION`) are auto-exempt by regex — they're constants, not state.
3. **New `checkRegistryCoverage(game, registeredPaths)`** — runs once against the REST-baseline fresh instance (so `player` exists):
   - candidates = `Object.keys(game)` + `Object.keys(game.player)` mapped to `player.*`;
   - drop: values that are class instances whose constructor name matches `/(System|Manager|Menu|Renderer|Machine|Loop|Controller)$/`, `UPPER_SNAKE` names, `IGNORE` hits, `UNREGISTERED_ALLOWLIST` hits;
   - report the remainder as `unregistered[]`.
4. **New reverse check `checkRegistryPathsResolve()`** — every `RESET_REGISTRY` entry's `path` must resolve to an existing own-property on the fresh instance (catches typos and paths that died with a refactor). **Hard fail from day one** — it can only ever fire on a registry bug, never on legitimately-persistent state.
5. **Reporting/exit policy** (FR5's open question, answered by existing repo convention — `check:data`'s "pre-existing debt is allowlisted warns; NEW violations fail"):
   ```
   === registry coverage — 0 unregistered live field(s), 31 allowlisted ===
   ```
   `unregistered.length > 0` → **hard fail**, because the allowlist is the escape hatch and every current field is either registered or allowlisted after Step 4. A new field therefore fails the harness the moment it's added without a table row — which is the enforcement the PRD wants. `--warn-registry` flag for the duration of Steps 2-4 only. The deep-diff stays exactly as-is (PRD Goal 5: the two mechanisms catch different failure modes).

## 7. Migration ordering — one pass, in three sittings

PRD Risk #4: field-by-field would leave the source of truth split for as long as it took, which is precisely the add-on-registry shape the user already rejected. **Single pass**, but split at natural verification boundaries: Steps 1-3 (core, ~1 sitting), Steps 4-5 (enforcement + constructor, ~1 sitting), Steps 6-7 (optional room tier + docs). Each step ends green.

| Step | Files | What | Verification |
|---|---|---|---|
| **1** | `src/game/resetRegistry.js` (new) | Scopes, `scopeIncludes`, `applyReset`, `initRegisteredState`, `registeredPaths`, empty table + shape assertions. No call sites. | `npm run build`; `node tools/check-reset-parity.mjs` (must stay 0/0) |
| **2** | `resetRegistry.js`, `src/main.js` | Populate inventory A + B (~52 run entries, `why` prose carried over verbatim). Rewrite `_resetRunToRest` → `applyReset(this,'run')` + the bespoke audio block + `transition(REST)`. Add constructor declarations for `blueZoneRoom`, `alchemistNPC`, `_savedMagicMeter`, `savedExploreState` family. | Harness: `_resetRunToRest` must stay **0** contract drift (this step is behavior-preserving apart from the four new clears); `npm run build`; in-game: die → REST, confirm inventory/spells/companions/crafting wiped |
| **3** | `resetRegistry.js`, `src/main.js` | Add inventory C title entries. Rewrite `enterTitleState` → 5 bespoke lines + `applyReset(this,'title')` + `this.player = null` + `markBackgroundDirty()` + music guard. **This is where TITLE gains ~30 clears.** | Harness: `enterTitleState` stays 0; `npm run build`; in-game: boot → title → idle into arcade demo → back to title → start a run, confirm a clean L1 (and that the title screen still animates: `titleAnimationTime`/`introAnimationStarted`/`titleIdleTimer` now come from the table) |
| **4** | `tools/check-reset-parity.mjs` | §6 edits 1-4, run with `--warn-registry`, triage the unregistered list into either a new table row or an `UNREGISTERED_ALLOWLIST` entry with a reason, then flip to hard fail. | `node tools/check-reset-parity.mjs` → `0 unregistered`; deliberately delete one table row and confirm it fails |
| **5** | `src/main.js`, `resetRegistry.js` | Constructor consumes the registry: `initRegisteredState(this)` after all systems are constructed, before `setupInput()`; delete the now-duplicated literals from the constructor. Mark side-effecting entries `init: false` (`persistenceSystem.clearSave`, `runTimerSystem.clear`, `menuSystem.clearPickupFeedback`, `player.reset`, `roomGenerator.setDepth` are all harmless/idempotent — audit each; anything touching audio/network is already inline). **This is the step that delivers Goal 2 and Acceptance Criterion #3.** | Harness (fresh-instance snapshot is exactly what this could break — it is the strongest available test); `npm run build`; `node tools/check-architecture.js --update` |
| **6** *(optional, own session)* | `resetRegistry.js`, `src/main.js` | Populate the `room` tier: `applyRoomSwap`'s pure clears + `InteriorManager.reset()`'s entry + `cureRusalka`/`playerTongueAttacks`/`followerCrows`/`soundEvents`/`activeNoiseSource`/`bridgeMenuOpen`; re-label the §5.C teardown set from `title` to `room`; `applyReset(this,'room')` at the top of the `resetEntities` block (ordering dep #3), keeping `items = room.items` after it. **Decision point:** this makes the death path clear `currentRoom`/`items`/physics before its REST transition. | Harness (both paths); `npm run build`; in-game: room transitions, cheat warps, neutral-room round trip, dungeon entry/exit, demo |
| **7** | `CLAUDE.md`, `docs/adr/BACKLOG.md`, `GLOSSARY.md`, `claudedocs/known-bugs.md` | Rewrite the "Run-scoped state declares its reset home at creation" rule to point at the table as the single location. Append the ADR row (PRD says this decision warrants one; the user authors it). Propose the new glossary terms. Log the `savedExploreState` gap as fixed-in-passing. | Read-through |

## 8. Risks / Open Questions — status

**Resolved by grounding:**
- **Risk #1 (ordering)** — audited; two real dependencies, both positional (§4). No sort, no phase graph.
- **Risk #2 (cascade)** — audited; `title ⊇ run` is **false today** and the ~30 differences are latent gaps, not intentional divergence. The cascade is the *fix*, not an assumption. (§0.1)
- **Risk #3 (system-internal fields)** — in-scope = `game.*`/`player.*` own-properties; out-of-scope = anything inside a system. `covers` gives FR5 traceability without registering system internals. (§5.E)
- **Risk #4 (one pass vs incremental)** — one pass, three sittings, each green. (§7)
- **FR1 open question** — static table, and the table becomes the creation site in Step 5. (§2)
- **FR3 tier set** — `room`/`run`/`title`; no `dungeonVisit`. (§3)
- **FR5 hard-fail vs warn** — hard fail with a reasoned `UNREGISTERED_ALLOWLIST`, mirroring `check:data`. (§6.5)

**Still the user's judgment call:**
1. **Step 3's behavior change: TITLE will now do a full run wipe** — including `inventorySystem.handleGameOver()` (chest, armor, consumables, key items, coin wallet), `craftingSystem.resetDiscoveries()`, `unlockedCharacters = ['default']`, `deadCharacters = []`. Unobservable in practice (TITLE is reachable only from boot and the arcade demo, neither of which banks any of it), and it is what "TITLE is always a no-run-in-progress state" already claims in the comment at main.js:923. But it is a semantic widening of what returning to the title screen means. Ratify or carve out exceptions.
2. **Step 6's cascade consequence** — whether the death path should clear `currentRoom`/`items`/physics before transitioning to REST (safe, but new).
3. **`runId = newRunId()` at run scope** means TITLE mints a new run id. Harmless (harness `IGNORE`s it) and arguably right; say so or exclude it.
4. **Whether Step 6 happens at all.** Skipping it leaves the room tier empty and `applyRoomSwap` as-is — the PRD's acceptance criteria are all met without it.
5. **The new glossary terms** ("reset registry", "reset scope/tier") are the user's to name before Step 1 writes them into a filename.

---

### Critical Files for Implementation
- `/Users/thomaslarson/gamedev/ascii-roguelike/src/main.js` (constructor 155-505, `enterTitleState` 913-981, `_resetRunToRest` 4061-4174, `_resetEnvironmentalEffects` 2359, `applyRoomSwap` 4329, `enterRestState` 1217)
- `/Users/thomaslarson/gamedev/ascii-roguelike/src/game/resetRegistry.js` (new — table + `applyReset`)
- `/Users/thomaslarson/gamedev/ascii-roguelike/tools/check-reset-parity.mjs` (FR5)
- `/Users/thomaslarson/gamedev/ascii-roguelike/src/systems/InteriorManager.js` (`reset()` 85-124 — `covers` list, body untouched)
- `/Users/thomaslarson/gamedev/ascii-roguelike/src/systems/ZoneSystem.js` (`resetOnDeath` 437-456 — `covers: ['alchemistNPC']`, body untouched)
