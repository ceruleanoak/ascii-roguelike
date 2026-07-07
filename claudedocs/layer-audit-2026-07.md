# Architectural Review — 2026-07-05

Read-only audit per the approved review plan (bug-history classification + 7 scoped
passes). No source files were changed as part of this document. Confirmed live bugs are
logged separately into `known-bugs.md`; this doc records the full audit trail and verdicts
so the reasoning isn't lost.

## Audit 1 — Enemies-list layer-leak sweep

`PlaneSystem.freezeSurfaceRoom()` empties `game.currentRoom.enemies` to `[]` the instant
the player enters a hut/dungeon/maze (real enemies move to `_frozenEnemies`, restored by
`thawSurfaceRoom()` on exit). Any code that reads `currentRoom.enemies` directly while an
interior is active is therefore iterating an empty array — the `[layer-leak]` failure mode
here manifests as "the effect silently whiffs against interior enemies," not "the effect
lands on the surface by mistake." `EnemySpawnSystem.flush()` is worse: it *writes* into that
live frozen array, and `thawSurfaceRoom()` unconditionally overwrites it on exit, silently
orphaning any enemy spawned that way while inside an interior.

**Confirmed LEAK sites** (interior enemies unreachable by this effect):

| File:line | Effect |
|---|---|
| `CombatSystem.js:1703` (`tryUseHeldWeapon`) | Main SPACE-attack resolution — no interior guard in the file |
| `CharacterSystem.js:252` | Dodge-roll "break sapping enemies" |
| `CharacterSystem.js:385` (`triggerDaggerRollAttack`) | Dagger auto-fire on roll completion (sibling call at line 304 already uses `game._activeEnemies()` — this one wasn't migrated) |
| `CharacterSystem.js:404` (`triggerQueuedRollAttack`) | Queued roll attack |
| `CharacterSystem.js:604` | Standard melee/wand SPACE swing |
| `MagicSystem.js:235` (`_updateChargeHammer`) | Crystal Maul charge release — file's own comment at 310-311 documents fixing this exact bug for `_castFireAOE`, but the charge-hammer release was never migrated |
| `WorldEffectsSystem.js:52-53` | Ember stack decay |
| `WorldEffectsSystem.js:117-118` | Ember → fire ignition |
| `WorldEffectsSystem.js:201` | Shockwave enemy damage/knockback (inconsistent with line 163 in the same block, which correctly uses `game._activeBackgroundObjects()` for the object-shake half of the same effect) |
| `WorldEffectsSystem.js:229-230` | Goo blob contact |
| `WorldEffectsSystem.js:242-243` | Debris `majorObjects` physics |
| `InventorySystem.js:588` | Armor "roll pulse" status effect |
| `InventorySystem.js:922` (`updateConsumableWindups`) | Consumable windup damage (e.g. Jolt Jar) |
| `InventorySystem.js:1412` (`_updateStingrayMantle`) | Wake damage tick — see also Audit 2 below |
| `ConsumableTriggerSystem.js:65`, `:33`→`manualTrigger` | Auto-trigger + manual SPACE-triggered consumables read `game.currentRoom` not `game.activeRoom` |
| `GrayZoneSystem.js:149` | Mourner mist pressure |
| `EnemySpawnSystem.js:31,48` (`flush`) | Split-spawn (e.g. Giant Slime) orphaning, not just misfiring — see above |
| `RoomGenerator.js:1840` (`spawnEnemiesFrom`) | Spawn-position overlap search hardcodes `currentRoom.enemies`/`collisionMap` |
| `main.js:2555` (windup-attack completion) | Melee swing landing |
| `main.js:3470` (steamCloud push) | Interior enemies never get vision-blocking steam-cloud state |
| `main.js:4283` (`releaseBow`) | Bow release |
| `main.js:2829` (`propagateKnockAway`) | Runs unguarded immediately after a correctly-guarded sibling line at 2825 |
| `InteractionSystem.js:604,612` (grass-cut beast spawn) | Unverified whether any interior generates cuttable grass; flagged LEAK/UNCLEAR |

**Confirmed SAFE (intentional surface-only, verified by a real interior counterpart or an
explicit guard):** `HuntingSystem.js:61,112` (early-return guard), `BossSystem.js` spawn
sites (generation code, bosses are surface-only by design), `BoulderSystem.js:208`
(surface-only hazard by design — note its sibling player-damage guard at line 195 is
missing `inDungeon`, a narrower bug outside this audit's `enemies` scope),
`EnemyUpdateSystem.js:31` (Hut/DungeonSystem each run their own parallel tick loop over
`activeFloor.enemies`), `main.js:2825,3220-3337,3480,3653/3657,2056,2697-2698,1544,1828`
(each either explicitly guarded or structurally unreachable while an interior is active),
`InteriorManager.js:130` (this *is* the canonical accessor's own surface branch),
`PlaneSystem.js:132-140` (the freeze/thaw mechanism itself).

**Verdict**: this is broader than the original `[layer-leak]` category scope (which was
framed around `backgroundObjects`). The freeze/thaw design means most per-frame combat and
status-effect systems in the game read `currentRoom.enemies` somewhere, and the majority of
sites audited here were never migrated to `game._activeEnemies()`. Practical impact: most
attack types plausibly still land on interior enemies through *some* path (huts/dungeons
are shipped, played content), so before treating this as "combat is broken in interiors,"
it needs a playtest pass to establish which of these call sites are actually load-bearing
vs. dead/superseded code. Logged as a bug for playtest verification rather than asserted as
confirmed-broken outright — see `known-bugs.md` #130.

**Recommended tooling fix**: extend `FORBIDDEN_BG_ACCESS` in `tools/check-architecture.js`
(or add a sibling `FORBIDDEN_ENEMY_ACCESS`) to also flag `currentRoom\.enemies` across
`LAYER_GUARD_FILES` + `entities/enemyMechanics/`, with the same case-by-case exemption
pattern already used for guarded-fallback and generation-code sites.

## Audit 2 — InventorySystem.js layer-guard gap

`InventorySystem.js` has direct `backgroundObjects`/`enemies` access (blue-armor
electricity ticks) but is absent from `LAYER_GUARD_FILES` in `tools/check-architecture.js`.
Confirmed: `updateBlueArmorEffects` (Coral Crown / Stingray Mantle) at lines 1355, 1389,
1393, 1412, 1416 reads/writes `game.currentRoom.backgroundObjects`/`.enemies` directly, and
is called unconditionally from `main.js:2760` inside `updateExploreState` — before the
`inHut`/`inDungeon` guards that appear later in the same function (main.js:2815/2824). A
player wearing Coral Crown or Stingray Mantle standing in water inside a hut/dungeon gets
blue-armor effects applied against the (empty, frozen) surface room instead of the
interior. **Confirmed live bug — logged as `known-bugs.md` #131.**

## Audit 3 — Warp-divergence freshness check

Re-diffed every `currentRoom`-swapping call site against `applyRoomSwap()`. The three known
gaps from #94 (missing `preloadRoomPreviews()`, missing `scheduleBossSequence()`, stale
`setLayer2Enabled`) are still present and still the only diffs in the warp/teleport/cheat
call sites — no new bypass was added since 2026-06-10.

One additional divergence found, outside the original `[warp-divergence]` framing since it
isn't a *warp*: `updateNeutralState` (main.js:2169-2191) hand-restores
`currentRoom`/`items`/`ingredients` from `this.savedExploreState` on NEUTRAL→EXPLORE return,
bypassing `applyRoomSwap` entirely (no `wireRoomEnemies`, no grayZoneSystem hook, no
physics/combat reset), then calls `stateMachine.transition(GAME_STATES.EXPLORE)` — which
runs `enterExploreState(entryDirection=null)`. That function's `shouldRestoreExploreRoom`
check reads a *different* saved-room slot (`inventorySystem.getSavedExploreRoom()`,
populated only on EXPLORE→REST, main.js:3648), which is `null` in the ordinary
EXPLORE→NEUTRAL→EXPLORE case — so `enterExploreState` falls into its "generate a brand-new
room" branch (main.js:1833-1979), **overwriting the room just restored two statements
earlier**. `enterMazeTestRoom` avoids `stateMachine.transition()` for exactly this reason
(explicit comment at main.js:4742). Needs playtest confirmation (visit a neutral room off
an EXPLORE zone, e.g. Oasis, then exit) before being treated as certain — the room-swap
mechanics here are intricate enough that a static read could be missing a compensating
check. **Logged as `known-bugs.md` #132 (needs playtest verification).**

## Audit 4 — Snapshot/reset field-parity audit

Compared reset/capture sites for `Player`/`InventorySystem`/`MagicSystem` state:
constructor defaults, `_resetRunToRest`, demo capture/apply, `enterMazeTestRoom`.

- `enterMazeTestRoom` (main.js:4715-4744, bound to `handleMPress`) reproduces the exact
  field-omission shape as #69/#100/#128: restores only
  `quickSlots`/`activeSlotIndex`/`destroyedSlots`/`hp`, omitting `inventory` and
  `magicMeter` entirely, and never calls `applyCharacterType(...)`. **Not currently live** —
  `handleMPress` has no found keybinding calling it (dead code as of this audit).
- `_resetRunToRest` (main.js:4144): hand-written `magicMeter` literal is missing the 5th
  field `freeSlotGranted` (present in the canonical shape elsewhere). Harmless today because
  `Player.reset()` (main.js:4198) runs immediately after and overwrites the object fully —
  latent risk only if that ordering ever changes.
- `activeEffectTimers` array length mismatch: constructor (`InventorySystem.js:78`)
  initializes length 5; `handleGameOver` (`InventorySystem.js:1196`) resets to length 2,
  inconsistent with the freshly-reset `maxConsumableSlots=1` state right next to it. Masked
  by optional-chaining reads elsewhere; not currently observable.

**Verdict**: no new *live* instance of this family beyond the three already known (#69,
#100, #128) — the two new findings above are latent/dead-code risks, not active bugs. Not
logging new bug rows; noting here so they're visible if either code path is ever reactivated.

## Audit 5 — Shadow-table drift audit

- **Mimic (`'m'`, elite tier) never drops loot**: `enemies.js:781` sets
  `affinities: ['aberration']`, but `'aberration'` is not a key in `AFFINITY_POOLS`
  (`items.js:2499`; valid keys: undead, goo, beast, humanoid, fire, ice, venom, dragon,
  gemstone, rare_gemstone, grave, electric, aquatic, nature, generic). `LootSystem.js:110`
  → `generateEnemyDrops(['aberration'], 'elite', …)` → `mergeAffinityPools` (`items.js:2872`)
  → undefined pool → empty drops, silently, always. **Confirmed live — logged as
  `known-bugs.md` #133.**
- Re-confirmed still-live: `RoomGenerator.js:3110` `dropTable: 'basic'` — `'basic'` is also
  not an `AFFINITY_POOLS` key. This is the existing open bug #90 (same mechanism, different
  call site) — not re-logged, but noted here as evidence for the shared-root-cause
  category proposal below.
- `ITEMS`/`INGREDIENTS` dual-registration pattern (the #114 shape): currently in sync
  (verified programmatically), zero validation anywhere — structurally fragile, not
  currently broken.
- `SPAWN_TABLES`/`ZONE_SPAWN_TABLES`/`BOSS_ENCOUNTERS` (`enemies.js:2123,2133,2260`):
  hand-maintained enemy-char lists that must match `ENEMIES` entries; currently in sync.
  Unlike `WEAPON_TIERS`'s derivable `tier` field, `ENEMIES` has no field these could be
  auto-generated from — a manual-sync risk without an easy structural fix, not an active bug.
- `ExitSystem.js:214` `LUCKY_BOOST` table used via `if (blessed && LUCKY_BOOST[letter])` —
  same truthy-vs-`!==undefined` shape as bug #103, currently harmless (no zero values
  exist), but inconsistent with the same file's correctly-fixed `zoneBoosts` check 12 lines
  above (line 202), which explicitly comments referencing #103. Latent risk if a future
  letter is ever assigned boost `0`.

## Audit 6 — Generic-before-specific ordering audit

`InteractionSystem.handleObjectEffect` (line 509): a generic
`if (obj.dropTable && effect.includes('destroyObject')) { ...; return; }` branch runs
**before** the specific `destroyObject:spawnIngredient:` branch (line 525) and
`spawnMultiple:` branch (line 684). Confirmed affected: Crystal `*`
(`GameConfig.js:293-297`, `dropEffect: 'destroyObject:spawnIngredient:M'`) and Boulder `Q`
(`GameConfig.js:321-327`, `dropEffect: 'destroyObject:spawnMultiple:M:2'`), both assigned a
`dropTable` by `RoomGenerator.generateMineralFormations` (`RoomGenerator.js:3097-3138`,
sourced from `zones.js`). Their dedicated ingredient drops never fire — always intercepted
by the generic branch first. This is the same interception shape already open as bug #90
(only `rockHarvest` at line 471 was correctly moved ahead of the generic check in that
fix) — the Boulder `Q` instance is new evidence, not a new root cause. Not re-logged as a
separate bug; folded into #90's scope (see category proposal below).

## Audit 7 — Budget-ceiling snapshot (2026-07-05)

All 8 budgeted files are at 99.9%+ of ceiling (from `tools/arch-budgets.json`, byte counts,
against `npm run check:arch` output earlier this session — main.js was 218374/218395, 21
characters of headroom). Line counts and largest-method breakdown, gathered directly (no
agent):

| File | Lines | Largest method (lines) |
|---|---|---|
| `main.js` | 5305 | `constructor()` 1051, `setupInput()` 362, `enterRestState()` 323, `enterExploreState(...)` 305, `updateExploreState(dt)` 302 |
| `RoomGenerator.js` | 4522 | `generateUndergroundRoom(room)` 319, `generateRoom(...)` 233, `generateTunnelRoom(room)` 158, `getRandomPosition(...)` 149 |
| `Enemy.js` | 3661 | `update(dt)` 806, `constructor(...)` 314, `updateVectorNavigation(...)` 261, `computeNodePath(...)` 136 |
| `ExploreRenderer.js` | 2785 | `renderForeground(game)` 894, `renderEnemy(game, enemy)` 408, `renderBackground(game)` 115, `_renderBridgePanel(game)` 93 |
| `CombatSystem.js` | 2568 | `update(dt, player, enemies, backgroundObjects, ...)` 1586, `addAttack(...)` 95, `createExplosion(...)` 67, `_tryStructureWallRicochet(...)` 54 |
| `InventorySystem.js` | 1431 | `_executeWindupEffect(...)` 143, `tryPickupItem(...)` 108, `_makeAuraParticle(...)` 95, `applyEquipmentEffectsToPlayer(player)` 94 |
| `Item.js` | 1543 | `use(player)` 109, `createBullets(...)` 108, `update(dt)` 107, `createMeleeAttack(player)` 83 |
| `Player.js` | 1323 | `constructor(x, y)` 257, `reset()` 167, `updateInput(...)` 116, `startDodgeRoll(...)` 104 |

**Extraction candidates** (per the Character Budget Policy's Path A, before the next
feature forces the issue):

- `CombatSystem.update()` at 1586 lines is a single method — over 60% of the entire file.
  It is the strongest single extraction target in the whole codebase: even carving out one
  self-contained sub-phase (e.g. structure/wall ricochet handling, or explosion/AOE
  resolution) as a private helper method would free meaningful headroom without changing
  the file's domain.
- `Enemy.js update()` at 806 lines is the second-largest single method audited. Per
  CLAUDE.md, `Enemy.js` itself is exempted from splitting (single cohesive AI domain), but
  `update()`'s internal phases (status-effect ticking vs. movement vs. attack-decision)
  are candidates for private-method extraction *within* the file, which doesn't violate
  that exemption and still frees budget headroom.
- `ExploreRenderer.renderForeground()` at 894 lines is the largest render method by far;
  `_renderBridgePanel` already demonstrates the pattern of splitting a render pass into a
  named helper — `renderForeground` has several visually-distinct sub-passes (per-entity
  draw loops) that fit the same pattern.
- `main.js constructor()` at 1051 lines is wiring/instantiation, which is legitimate
  orchestration content per CLAUDE.md — not a placement violation, but a candidate for
  breaking into a few `_wireXxxSystems()` private helper calls purely to reduce single-method
  size (no logic changes, no relocation needed).

No extraction was performed — this is a proactive candidate list per the plan, for the user
to prioritize whenever one of these 8 files needs to grow again.

## Proposed categories (not adopted — naming is the user's call)

Per the plan and the repo's Glossary/ADR convention, category *tags* are proposed here for
ratification, not added to `known-bugs.md` directly:

1. **Generic-before-specific interception** — a broad catch-all effect/dispatch branch
   runs before a narrower branch that should take precedence. Confirmed 3+ shared-root-cause
   instances: #90 (Crystal `*` dropTable), Boulder `Q` dropTable (Audit 6, same root, folded
   into #90), #62 (effect queue gated on `destroyed && effect`, discarding non-destructive
   results across 5 call sites).
2. **Shadow-key drift** — a dispatch key or lookup string is typo'd or renamed in one table
   without a corresponding update to the canonical table it's meant to match, and the
   mismatch fails silently (no error, just empty/no-op results). Confirmed instances: #90's
   `'basic'` key, Mimic's `'aberration'` key (#133, this session), #103's zero-boost falsy
   check, #114 (dual `ITEMS`/`INGREDIENTS` registration drift — historical).

## Bugs logged this session

See `known-bugs.md`: #130 (interior combat/effect pipeline needs playtest audit against
`currentRoom.enemies` freeze/thaw), #131 (blue-armor interior leak), #132 (NEUTRAL→EXPLORE
room-restore overwrite, needs playtest verification), #133 (Mimic elite loot dead).
