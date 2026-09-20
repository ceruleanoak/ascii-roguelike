// Declare-Once Reset Registry
//
// Implements Step 1 of claudedocs/reset-registry-plan.md (see that file, and
// claudedocs/reset-registry-prd.md, for the full rationale — this comment
// summarizes only what a future contributor needs to add or audit a row).
//
// PROBLEM THIS SOLVES: reset behavior (what clears on death, what clears
// returning to TITLE, what clears on a room transition) used to be encoded as
// several independently hand-written imperative functions in src/main.js
// (enterTitleState(), _resetRunToRest(), applyRoomSwap()'s resetEntities
// block). Those lists drifted from each other (bug family #198/#196/#100/
// #86/#13) because nothing forced "the run-death reset" and "the title reset"
// to share their overlapping portion. This file is the single declarative
// table those functions are migrated to consume instead.
//
// LAYERING RULE (do not violate): this module imports NOTHING from
// src/systems/*. A table entry that needs to invoke a system method (e.g.
// zoneSystem.resetOnDeath) does so via a `call: (game) => game.zoneSystem
// .resetOnDeath(game)` closure that reaches the system through the `game`
// object handed to it at call time — never via a static import here. This
// keeps the registry a leaf-level orchestration file (like GameConfig.js /
// GameStateMachine.js, its src/game/ siblings) that every system can be
// reset by, without the registry ever depending on a system's module.
//
// STATUS: Steps 1-6 done. RESET_REGISTRY holds the full run-scoped
// inventory (§5.A/§5.B), the title-only inventory (§5.C), the tombstone
// addendum (§5.-1), and — as of Step 6 — the `room` tier (§7 Step 6): most of
// the original §5.C world-teardown set re-labeled down from `title` to
// `room` (it was always correct at the narrower tier; the cascade still
// gives title/run the same reach), plus the interior/polymorph/noise/menu
// backstop entries. One exception: `currentRoom` stayed at `run` scope (see
// its entry in Section B) rather than moving to `room`, because
// applyRoomSwap's own callers assign `this.currentRoom` to the incoming room
// before calling it — a `room`-scope null-out there would clobber that
// assignment with nothing to restore it. Step 4's bug #305 triage also
// landed (the "Bug #305 triage" section below). `_resetRunToRest()` and
// `enterTitleState()` in src/main.js both consume this table via
// applyReset(); `applyRoomSwap()`'s `resetEntities` block now also calls
// applyReset(this, 'room'). Remaining work (plan §7): Step 7 (docs/glossary/
// ADR-backlog cleanup) only.

// ---------------------------------------------------------------------------
// Scope cascade
// ---------------------------------------------------------------------------
//
// Reset scopes are tiers of increasing lifetime, each a superset of the
// narrower ones: a room transition clears the least; returning to TITLE
// clears everything a room transition and a run-death both clear, plus more.
//
//   room  — narrowest. Per-room-transition state (populated by plan Step 6
//           — see plan §3/§7 Step 6: the `applyRoomSwap()` world-teardown
//           set plus interior/polymorph/noise/menu backstop entries).
//   run   — dies on death / game-over (today's _resetRunToRest() surface).
//   title — dies returning to TITLE (today's enterTitleState() surface).
//
// Order in this array is significant: index position is lifetime-narrowest-
// first, and scopeIncludes() relies on it to compute "which scopes are
// narrower-than-or-equal-to X".
export const RESET_SCOPES = ['room', 'run', 'title'];

/**
 * scopeIncludes(scope) — the cascade lookup.
 *
 * Returns the array of scopes that are narrower than or equal to `scope`,
 * i.e. every scope whose entries should run when resetting AT `scope`.
 * Example: scopeIncludes('run') === ['room', 'run'] (a run-death reset
 * clears room-scoped state too, but not title-scoped state). Calling with
 * the widest scope returns every scope: scopeIncludes('title') ===
 * ['room', 'run', 'title'].
 *
 * Throws on an unrecognized scope name rather than silently applying
 * nothing — a typo'd scope string in a call site should fail loudly, not
 * quietly skip an entire reset.
 */
export function scopeIncludes(scope) {
  const index = RESET_SCOPES.indexOf(scope);
  if (index === -1) {
    throw new Error(
      `[resetRegistry] Unknown reset scope "${scope}". Valid scopes: ${RESET_SCOPES.join(', ')}.`
    );
  }
  return RESET_SCOPES.slice(0, index + 1);
}

// ---------------------------------------------------------------------------
// The table
// ---------------------------------------------------------------------------
//
// Entry shape (see plan §1 for the full worked example):
//
//   {
//     path:  'wishesUsed',   // dotted accessor from `game`. A path whose
//                            //   first segment is 'player' resolves through
//                            //   game.player instead (see resolveEntryOwner
//                            //   below) and the WHOLE ENTRY is skipped, not
//                            //   thrown, if game.player is null/undefined —
//                            //   this is what lets a single run-scoped
//                            //   player.* row apply safely from contexts
//                            //   (e.g. TITLE, before a player exists) where
//                            //   there is no player instance yet.
//     scope: 'run',          // one of RESET_SCOPES
//
//     // Exactly one of the next three — enforced by the load-time
//     // assertion below, not just by convention:
//     value: 0,                          // primitive / immutable literal
//     fresh: () => new Set(),            // zero-arg factory — REQUIRED for
//                                         //   anything mutable (array,
//                                         //   object, Set, Map, ...) so two
//                                         //   resets never alias the same
//                                         //   reference (the #100 failure
//                                         //   shape: shared literal reused
//                                         //   across resets, later mutated
//                                         //   in place from one call site
//                                         //   and silently visible from
//                                         //   another).
//     call: (game) => game.zoneSystem.resetOnDeath(game),
//                                         // method-backed reset unit — the
//                                         //   entry doesn't own a value at
//                                         //   all, it delegates to a system
//                                         //   method that owns its own
//                                         //   internal reset logic (see
//                                         //   Non-Goals in the PRD: system-
//                                         //   owned reset methods are never
//                                         //   inlined here, only called).
//
//     covers: ['alchemistNPC'],          // optional. game.*/player.* fields
//                                         //   this call/method reaches and
//                                         //   clears as a side effect, for
//                                         //   traceability (FR5 / Step 4)
//                                         //   without registering fields
//                                         //   that live inside a system's
//                                         //   own internal state.
//     init: false,                       // optional, default true. false
//                                         //   means "skip this entry when
//                                         //   applyReset is called with
//                                         //   { init: true }" — for entries
//                                         //   whose call is side-effecting
//                                         //   in a way that doesn't make
//                                         //   sense to run during initial
//                                         //   construction (e.g. clearing a
//                                         //   save file that was never
//                                         //   written yet). This matters
//                                         //   once Step 5 wires
//                                         //   initRegisteredState(this)
//                                         //   into the Game constructor;
//                                         //   today the table is empty so
//                                         //   it's a no-op, but the skip
//                                         //   logic itself must already be
//                                         //   correct.
//     why: 'CLEANSE wishes are per-run (max 3).',
//                                         // required. The load-bearing
//                                         //   prose the old inline reset
//                                         //   functions carried as an
//                                         //   end-of-line comment. Preserve
//                                         //   it verbatim when migrating a
//                                         //   field — losing this to a
//                                         //   terser table would be exactly
//                                         //   the comment-golfing CLAUDE.md
//                                         //   forbids.
//   }
//
// Execution order = array order (see plan §4's ordering-dependency audit —
// two real dependencies exist in the field inventory that Steps 2/3 migrate,
// both expressible as "declare the dependent entry later in the array", not
// as a sort or a dependency graph). This file does not resolve or reorder
// entries at runtime; the array's declared order is exactly the applied
// order.
//
// STEP 2 (this population): the run-scoped inventory — plan §5.A ("shared
// today", inherited by TITLE once Step 3 exists) and §5.B ("run-only today").
// Step 3 adds the title-only rows (plan §5.C) on top of this array; nothing
// here should be edited to make room for that — Step 3 only appends.
import { freshZoneDepths } from '../data/zones.js';
import { newRunId } from '../systems/DeathLedgerSystem.js';

export const RESET_REGISTRY = [
  // ── A. Shared today (plan §5.A) — order mirrors _resetRunToRest's
  // original body; these fields/calls are also cleared by enterTitleState
  // today, and once Step 3 exists TITLE inherits them via the cascade
  // instead of repeating them. ──────────────────────────────────────────
  {
    path: 'zoneDepths',
    scope: 'run',
    fresh: freshZoneDepths,
    why: 'Reset all zone depths on death.',
  },
  {
    path: 'zoneSystem.resetOnDeath',
    scope: 'run',
    call: (game) => game.zoneSystem.resetOnDeath(game),
    covers: ['alchemistNPC'],
    why: 'Reset zone system and captive tracking (incl. rescued-Alchemist singleton, bug #196).',
  },
  {
    path: 'dungeonBossSystem.resetRunState',
    scope: 'run',
    call: (game) => game.dungeonBossSystem.resetRunState(),
    covers: ['hoardmawDefeatedThisRun', 'goldBreathCurseActive', 'unlockedRareSayings'],
    why: 'Reset all zone depths on death (Hoardmaw run-state travels with the zone reset).',
  },
  {
    path: 'bossSystem.deactivate',
    scope: 'run',
    call: (game) => game.bossSystem.deactivate(),
    why: 'Clean up any active boss fight.',
  },
  {
    path: 'audioSystem.currentMusicZone',
    scope: 'run',
    value: 'green',
    why: 'Reset all zone depths on death.',
  },
  {
    path: 'preBossGateActive',
    scope: 'run',
    value: false,
    why: 'Reset boss music and pre-boss gate state for new run.',
  },
  {
    path: 'preMinibossGateActive',
    scope: 'run',
    value: false,
    why: 'Reset boss music and pre-boss gate state for new run.',
  },
  {
    path: 'knownSpells',
    scope: 'run',
    fresh: () => new Set(),
    why: 'Reset learned spells for new run.',
  },
  {
    path: 'commandSystem.clearRunState',
    scope: 'run',
    call: (game) => game.commandSystem.clearRunState(),
    covers: ['commandedEnemies'],
    why: 'Commanded warband dies with the run like every companion roster.',
  },
  {
    path: 'runTimerSystem.clear',
    scope: 'run',
    call: (game) => game.runTimerSystem.clear(),
    why: 'New run → clock back to zero; the REST transition at the end restarts it.',
  },
  {
    path: 'threeRoomSystem.hardReset',
    scope: 'run',
    call: (game) => game.threeRoomSystem.hardReset(),
    why: "Three Room run-state: the gray '3' call can happen again next run, and the N×3 streak starts clean.",
  },
  {
    path: 'barricadeSystem.hardReset',
    scope: 'run',
    call: (game) => game.barricadeSystem.hardReset(),
    why: 'Insistence starts over with the run.',
  },
  {
    path: 'cursedRunSystem.hardReset',
    scope: 'run',
    call: (game) => game.cursedRunSystem.hardReset(),
    why: "Three Room run-state: the gray '3' call can happen again next run, and the N×3 streak starts clean.",
  },
  {
    path: 'threeSlotGlobeSystem.hardReset',
    scope: 'run',
    call: (game) => game.threeSlotGlobeSystem.hardReset(),
    why: "The run's touched glyphs die with it too.",
  },
  {
    path: 'grayThreeExitShown',
    scope: 'run',
    value: false,
    why: "The gray '3' call can happen again next run.",
  },
  {
    path: 'cursedRun',
    scope: 'run',
    value: false,
    why: 'A new run is not yet owed anything. Set the moment a Three Room slot cracks, and true for the rest of the run; survives REST on purpose — the curse is a thing REST itself decays under, so enterRestState is deliberately not a reset home for it.',
  },
  {
    path: 'undeadSystem.clear',
    scope: 'run',
    call: (game) => game.undeadSystem.clear(),
    why: "Three Room run-state: the gray '3' call can happen again next run, and the N×3 streak starts clean.",
  },
  {
    path: 'menuSystem.clearPickupFeedback',
    scope: 'run',
    call: (game) => game.menuSystem.clearPickupFeedback(),
    covers: ['pickupMessage', 'pickupMessageTimer', 'pickupMessageQueue'],
    why: 'Same transient-feedback clears as TITLE (bug #198 family).',
  },
  {
    path: 'restBundle',
    scope: 'run',
    value: null,
    why: 'Reset starter bundle so a fresh one spawns on new run. One-time starter bundle object, destroyed on SPACE to drop its ingredients.',
  },
  {
    path: 'hasLeftRestOnce',
    scope: 'run',
    value: false,
    why: 'Reset starter bundle so a fresh one spawns on new run (gates the rest-bundle pickup hint arrow).',
  },

  // ── B. Run-only today (plan §5.B) — TITLE gains these once Step 3 exists;
  // that is a deliberate widening ratified in the plan (§7 risk #1), not
  // this step's concern — this step only needs run-scope behavior to stay
  // exactly as it is today. ─────────────────────────────────────────────
  {
    path: 'currentRoom',
    scope: 'run',
    value: null,
    why: "No room exists between runs (also true of the title screen, which inherits this via the cascade). Deliberately NOT `room` scope despite being part of the §5.C world-teardown set conceptually: both real applyRoomSwap call sites (main.js ~1019/~1036 and ~1885/~2033) assign `this.currentRoom = newRoom` BEFORE calling applyRoomSwap, and nothing re-assigns it afterward inside or after that call — if this entry were scope 'room', applyRoomSwap's own applyReset('room') call (Step 6) would null out the room the caller just set, and callers immediately downstream (e.g. enterExploreState reading `this.currentRoom?.zone` right after the applyRoomSwap call) would see null instead of the new room. Scoping it 'run' instead keeps the intended behavior (nulled on death before REST reassigns it, and on title-return) while never firing from applyRoomSwap's narrower 'room' scope.",
  },
  {
    path: 'gameOverWaitingForSpace',
    scope: 'run',
    value: false,
    why: 'True game over — full reset.',
  },
  {
    path: 'wishesUsed',
    scope: 'run',
    value: 0,
    why: 'CLEANSE wishes are per-run (max 3).',
  },
  {
    path: '_savedDestroyedSlots',
    scope: 'run',
    fresh: () => [false, false, false],
    why: 'Reset wish/slot state for fresh run. Persists across player recreations.',
  },
  {
    path: '_resetEnvironmentalEffects',
    scope: 'run',
    call: (game) => game._resetEnvironmentalEffects(),
    covers: ['gooBlobs', 'puddles', 'enemyShockwaves', 'sniperBeams', 'debris', 'particles', 'steamClouds'],
    why: 'Reset wish/slot state for fresh run (transient world effects die with the run).',
  },
  {
    path: 'inventorySystem.restQuickSlots',
    scope: 'run',
    fresh: () => [null, null, null],
    why: 'Clear held items on death (but keep crafting slots).',
  },
  {
    path: 'inventorySystem.restActiveSlotIndex',
    scope: 'run',
    value: 0,
    why: 'Clear held items on death (but keep crafting slots).',
  },
  {
    path: 'inventorySystem.handleGameOver',
    scope: 'run',
    call: (game) => game.inventorySystem.handleGameOver(),
    covers: [],
    why: 'Clear all inventories and equipment on death (true roguelike).',
  },
  {
    path: '_savedMagicMeter',
    scope: 'run',
    value: null,
    why: 'Reset magic meter — must be re-activated via well or cauldron each run.',
  },
  {
    path: 'wellCoinAnim',
    scope: 'run',
    value: null,
    why: 'Reset well ritual state (any in-flight coin or lingering flash).',
  },
  {
    path: 'wellFlashTimer',
    scope: 'run',
    value: 0,
    why: 'Reset well ritual state (any in-flight coin or lingering flash).',
  },
  {
    path: 'wellFlashDuration',
    scope: 'run',
    value: 0,
    why: 'Reset well ritual state (any in-flight coin or lingering flash).',
  },
  {
    path: 'runId',
    scope: 'run',
    fresh: newRunId,
    why: 'New run → new ledger run id.',
  },
  {
    path: 'cheatUsed',
    scope: 'run',
    call: (game) => { game.cheatUsed = !!game.cheatMenu.godMode; },
    why: 'Cheat flag stays set if god mode is still on, since cheatMenu.godMode persists and is reapplied to the new Player.',
  },
  {
    path: 'spectaclesObtainedThisRun',
    scope: 'run',
    value: false,
    why: 'Reset Spectacles key-item run-flag (Maze clear-without-a-ghost reward).',
  },
  {
    path: 'fairiesAngered',
    scope: 'run',
    value: false,
    why: 'Reset fairy run-flag for new run.',
  },
  {
    path: 'chiBladeFound',
    scope: 'run',
    value: false,
    why: 'Reset fairy run-flag for new run.',
  },
  {
    path: 'fedCrowCount',
    scope: 'run',
    value: 0,
    why: 'Reset fairy run-flag for new run.',
  },
  {
    path: 'companionCrows',
    scope: 'run',
    fresh: () => [],
    why: 'Reset fairy run-flag for new run.',
  },
  {
    path: 'tamedRats',
    scope: 'run',
    fresh: () => [],
    why: 'Reset fairy run-flag for new run.',
  },
  {
    path: 'golems',
    scope: 'run',
    fresh: () => [],
    why: 'Reset fairy run-flag for new run.',
  },
  {
    path: 'ridgeBridgeBuilt',
    scope: 'run',
    value: false,
    why: 'Commanded warband dies with the run like every companion roster.',
  },
  {
    path: 'deadCharacters',
    scope: 'run',
    fresh: () => [],
    why: 'Reset character system for new run.',
  },
  {
    path: 'lostCharacters',
    scope: 'run',
    fresh: () => [],
    why: 'Reset character system for new run.',
  },
  {
    path: 'graySnapshots',
    scope: 'run',
    fresh: () => [],
    why: 'Mist snapshots only count within a single run.',
  },
  {
    path: 'activeCharacterType',
    scope: 'run',
    value: 'default',
    why: 'Reset character system for new run.',
  },
  {
    path: 'unlockedCharacters',
    scope: 'run',
    fresh: () => ['default'],
    why: 'Reset to only default character.',
  },
  {
    path: 'captives',
    scope: 'run',
    fresh: () => [],
    why: 'Clear active captives.',
  },
  {
    path: 'characterNPCs',
    scope: 'run',
    fresh: () => [],
    why: 'Clear character NPCs in REST.',
  },
  {
    path: 'errandSystem.resetOnDeath',
    scope: 'run',
    call: (game) => game.errandSystem.resetOnDeath(),
    why: 'Reset character system for new run.',
  },
  {
    path: 'craftingSystem.setState',
    scope: 'run',
    call: (game) => game.craftingSystem.setState({ leftSlot: null, rightSlot: null, centerSlot: null }),
    why: 'Clear crafting slots and wipe localStorage save.',
  },
  {
    path: 'craftingSystem.resetDiscoveries',
    scope: 'run',
    call: (game) => game.craftingSystem.resetDiscoveries(),
    why: 'Clear crafting slots and wipe localStorage save.',
  },
  {
    path: 'persistenceSystem.clearSave',
    scope: 'run',
    call: (game) => game.persistenceSystem.clearSave(),
    why: 'Clear crafting slots and wipe localStorage save.',
  },
  {
    path: 'companion',
    scope: 'run',
    value: null,
    why: "Clear companion so a stale hired NPC doesn't carry over to the next run. Active camp NPC companion, promoted from room.campNPC.",
  },

  // ── New: previously-uncleared gap (plan §0.3/§5.B) ────────────────────
  // savedExploreState (+ its enemies/captives/backgroundObjects shadow
  // arrays, populated by transitionToNeutralRoom / restored by
  // enterExploreState's shouldRestoreExploreRoom path) was cleared by
  // NEITHER _resetRunToRest nor enterTitleState before this migration —
  // a stale saved-EXPLORE-room snapshot from a previous run could survive
  // into a new one. This closes that gap. (Do not log to known-bugs.md
  // here — that triage is plan Step 7, not this step.)
  {
    path: 'savedExploreState',
    scope: 'run',
    fresh: () => null,
    why: 'Previously-unhandled gap: neither reset path cleared this saved-EXPLORE-room snapshot.',
  },
  {
    path: 'savedExploreEnemies',
    scope: 'run',
    fresh: () => [],
    why: 'Previously-unhandled gap: neither reset path cleared this saved-EXPLORE-room snapshot shadow array.',
  },
  {
    path: 'savedExploreCaptives',
    scope: 'run',
    fresh: () => [],
    why: 'Previously-unhandled gap: neither reset path cleared this saved-EXPLORE-room snapshot shadow array.',
  },
  {
    path: 'savedExploreBackgroundObjects',
    scope: 'run',
    fresh: () => [],
    why: 'Previously-unhandled gap: neither reset path cleared this saved-EXPLORE-room snapshot shadow array.',
  },

  // ── Bug #305 triage (plan §7 Step 4) — the 15 residual fields surfaced
  // by the harness's registry-coverage check, all registered here. ──────
  {
    path: 'trapCharging',
    scope: 'run',
    value: null,
    why: 'Unlike attackSequenceActive (already allowlisted — cleared synchronously within the same input-handler pass), trapCharging has no such guarantee: a death interrupting a mid-charge throw leaves it non-null with a stale timer, which BowChargeIndicator and WeaponPreviewDraw read directly and would render into the next run\'s first frame. Registering closes that staleness gap. Shape: { timer: float } while charging a throw, null otherwise.',
  },
  {
    path: 'blessingsCollected',
    scope: 'run',
    fresh: () => [],
    why: 'Genuine pre-existing bug (bug #305): a pure accumulator (NeutralRoomSystem.applyBlessing pushes into it) with no reset call anywhere — blessings collected in one run persisted into the next. Registering this closes the bug, not just a housekeeping gap.',
  },
  {
    path: 'neutralCharacters',
    scope: 'run',
    fresh: () => [],
    why: 'Backstop clear for neutral-room NPC roster, mirroring the already-registered `captives` pattern: room-transition inline clears (enterRestState, applyRoomSwap) stay in place as the per-room mechanism; this is the run/title-reset backstop.',
  },
  {
    path: 'inFlightTraps',
    scope: 'run',
    fresh: () => [],
    why: "Genuine pre-existing bug (bug #305): unlike sibling `placedTraps` (already registered at title scope), inFlightTraps was cleared at NO site anywhere in the codebase — an in-flight thrown trap/wire could carry across a death or title return. Registering this closes the bug. Shape: [{ x, y, vx, vy, decel, targetX, targetY, char, color, trapData, plane }].",
  },
  {
    path: 'gameOverDeathTimer',
    scope: 'run',
    value: 0,
    why: "Death-screen wait timer (GameOverRenderer). Verified NOT tombstone-shaped despite living in the same death-output family as lastDeathCause/tombstoneActive/tombstonePopup: _resetRunToRest can only execute once this is already <=0 (main.js SPACE-in-GAME_OVER gate), so there is no erase-before-read hazard — by the time a run-reset runs, this field is already at/near zero via its own consumption logic. Registered at run scope as a backstop for any path that reaches title/run-reset without going through that gate (e.g. the CLEANSE wish revival in WishSystem.js, which clears it inline for the same reason).",
  },
  {
    path: 'characterDeathPending',
    scope: 'run',
    value: false,
    why: 'Same death-output family as gameOverDeathTimer above — verified run-scope-safe, not tombstone-shaped. respawnNextCharacter() (CharacterSystem.js) and the CLEANSE wish path (WishSystem.js) already clear this on their own success paths; this is the run/title-reset backstop for every other exit (e.g. quitting to title mid-death-sequence).',
  },
  {
    path: 'characterDeathTimer',
    scope: 'run',
    value: 0,
    why: 'Same death-output family as gameOverDeathTimer above — see that entry\'s reasoning.',
  },
  {
    path: 'pendingNextCharacter',
    scope: 'run',
    value: null,
    why: 'Same death-output family as gameOverDeathTimer above — see that entry\'s reasoning.',
  },
  {
    path: 'characterDeathName',
    scope: 'run',
    value: '',
    why: 'Same death-output family as gameOverDeathTimer above — see that entry\'s reasoning.',
  },
  {
    path: 'spellResponse',
    scope: 'run',
    value: null,
    why: 'Self-clearing ritual/spell-feedback text with a start-time-based auto-expiry (RenderController), same shape as the already-registered wellCoinAnim/wellFlashTimer/wellFlashDuration. Registered anyway as a backstop against a stale message surviving into the next run\'s first frame.',
  },
  {
    path: 'idleEchoes',
    scope: 'run',
    fresh: () => [],
    why: "Minor pre-existing gap: idle-echo particles (InteractionSystem pushes, WorldEffectsSystem ages them out) are self-healing within IDLE_ECHO_DURATION and were never included in _resetEnvironmentalEffects(). Low-severity (echoes are short-lived), but nothing previously cleared them on death/title-return; registering closes the gap.",
  },
  {
    path: 'slotPopup',
    scope: 'run',
    value: null,
    why: 'REST quick-slot interaction popup (MenuSystem). Self-closes within ~0.25s via its own phase timer, and is explicitly dismissed on SPACE in REST — but nothing previously cleared it on a run/title reset reached some other way; registered as a backstop. Shape: { phase, timer, pixelX, pixelY, open: fn } or null.',
  },

  // ── late: whole-entity resets (plan §4, ordering dependency #1) ───────
  // player.reset() rewrites hp/quickSlots/activeSlotIndex/destroyedSlots/
  // magicMeter/buff timers wholesale. It MUST run after every other
  // player.*-touching entry above (there are none left in this table today
  // — the inline `player.magicMeter = {...}` and
  // `player.destroyedSlots = [false, false, false]` literals that used to
  // precede it in _resetRunToRest were dropped as redundant duplicates,
  // plan §5.B/§0.4 — both are fully superseded by player.reset() itself),
  // and this section exists so a FUTURE player.*-literal entry has an
  // obvious place to go: ABOVE this line, never below it.
  {
    path: 'player.reset',
    scope: 'run',
    call: (game) => game.player?.reset(),
    covers: ['player.destroyedSlots', 'player.magicMeter'],
    why: 'Whole-entity reset; must run after every other player.* reset entry.',
  },

  // ── D. Room-scoped (plan §7 Step 6) — narrowest tier. These entries fire
  // on every room transition via `applyReset(this, 'room')` at the top of
  // applyRoomSwap()'s resetEntities block, AND — via the cascade — on every
  // run-death and title-return reset too, since room ⊂ run ⊂ title. Two
  // families:
  //   (1) the original §5.C "world-teardown set" (minus `currentRoom` — see
  //       below), re-labeled down from `title` to `room` — it was always
  //       room-transition behavior (`applyRoomSwap` already cleared these on
  //       every warp; the title registration in Step 3 was the correct
  //       EFFECT but the wrong DECLARED HOME). Re-labeling doesn't remove
  //       them from title's reach — title still gets them via
  //       scopeIncludes('title') including 'room' — it just corrects which
  //       tier owns the declaration. `currentRoom` itself stayed at `run`
  //       scope (declared in Section B) rather than moving to `room`: both
  //       real applyRoomSwap call sites assign `this.currentRoom = newRoom`
  //       BEFORE calling applyRoomSwap, so a `room`-scope null-out would
  //       clobber the room the caller just set, with nothing downstream to
  //       re-assign it. `run`/`title` still null it exactly as before.
  //   (2) fields that were registered at `run` scope as death/title-return
  //       BACKSTOPS in Step 4 (bug #305 triage) for state whose PRIMARY
  //       clear mechanism is inline per-room-transition code (enterRestState/
  //       transitionToNeutralRoom/enterExploreState for cureRusalka and
  //       playerTongueAttacks; applyRoomSwap itself for followerCrows and
  //       soundEvents). Re-scoping these down to `room` makes the registry
  //       entry ALSO be that room-transition mechanism for the one call site
  //       (applyRoomSwap) that didn't already inline-clear them, while the
  //       existing inline clears at the other sites stay exactly as they are
  //       (redundant with this entry there, which is harmless and unchanged
  //       from the pattern Step 4 already established). ────────────────────
  {
    path: 'backgroundObjects',
    scope: 'room',
    fresh: () => [],
    why: 'No room exists between room transitions. The next applyRoomSwap immediately repopulates this with the incoming room\'s own array right after this clear runs — see applyRoomSwap\'s resetEntities block.',
  },
  {
    path: 'items',
    scope: 'room',
    fresh: () => [],
    why: 'No room exists between room transitions. The next applyRoomSwap immediately repopulates this with the incoming room\'s own array right after this clear runs — see applyRoomSwap\'s resetEntities block.',
  },
  {
    path: 'ingredients',
    scope: 'room',
    fresh: () => [],
    why: 'No room exists between room transitions. Ingredient entities lying on the floor of the current room — NOT the player\'s pile; picking one up moves its glyph into the pile via addIngredient(), and the two never hold the same thing.',
  },
  {
    path: 'placedTraps',
    scope: 'room',
    fresh: () => [],
    why: 'No room exists between room transitions. Shape: { item, tickTimer, activeDuration, affectedEnemies }.',
  },
  {
    path: 'physicsSystem.clear',
    scope: 'room',
    call: (game) => game.physicsSystem.clear(),
    why: 'No room exists between room transitions. applyRoomSwap re-registers the player/enemies/items with physics immediately after this clear runs.',
  },
  {
    path: 'combatSystem.clear',
    scope: 'room',
    call: (game) => game.combatSystem.clear(),
    why: 'No room exists between room transitions.',
  },
  {
    path: 'huntingSystem.reset',
    scope: 'room',
    call: (game) => game.huntingSystem.reset(),
    why: 'No room exists between room transitions.',
  },
  {
    path: 'cureRusalka',
    scope: 'room',
    value: null,
    why: "Polymorph-cure flag (PolymorphSystem) is genuinely per-room, not per-run — re-scoped down from 'run' in Step 6 (was a death/title-return backstop for the mechanism, now the mechanism itself covers all three call sites that clear it: this registry entry via applyRoomSwap's applyReset('room'), plus the pre-existing inline nulls at enterRestState/transitionToNeutralRoom/enterExploreState, which stay in place unchanged).",
  },
  {
    path: 'playerTongueAttacks',
    scope: 'room',
    fresh: () => [],
    why: "In-flight rusalka tongue-attack projectiles (PolymorphSystem) — same shape and same Step 6 re-scope as cureRusalka above: genuinely per-room, this entry now covers applyRoomSwap directly while the existing inline clears at the other three room-transition sites stay in place unchanged.",
  },
  {
    path: 'followerCrows',
    scope: 'room',
    fresh: () => [],
    why: "Follower flock is room-scoped by design: bystander crows don't trail the player across rooms (companions still do — see companionCrows, which stays run-scoped). Re-scoped down from 'run' in Step 6 to match applyRoomSwap's actual per-room clear; auto-join reapplies per-room via companionSystem.autoJoinWildCrows().",
  },
  {
    path: 'soundEvents',
    scope: 'room',
    fresh: () => [],
    why: "Per-frame noise-detection queue (read by ExploreRenderer/enemy hearing) — re-scoped down from 'run' in Step 6 to match its actual clear site: applyRoomSwap's resetEntities block, on every room transition, not only on death/title-return.",
  },
  {
    path: 'activeNoiseSource',
    scope: 'room',
    value: null,
    why: "Backstop for the per-frame noise-maker reference (set each frame by updatePlacedTraps when a noise-maker is active — see the constructor default's own comment). Recomputed every tick regardless, but applyRoomSwap explicitly nulls it on every room transition too, to guarantee a stale reference from the departed room can never be read as 'active' during the single frame before the trap system recomputes it in the new room.",
  },
  {
    path: 'bridgeMenuOpen',
    scope: 'room',
    value: false,
    why: "RidgeSystem's bridge-worker menu open/close flag. Auto-closes on distance/interaction during normal play, but applyRoomSwap explicitly closes it on every room transition as a backstop against carrying a stale 'open' state (and its input-capture gate) into a room with no bridge worker at all.",
  },
  {
    path: 'interiorManager.reset',
    scope: 'room',
    call: (game) => game.interiorManager.reset(),
    covers: [
      'activeFloor', 'mazeInterior', 'dungeonFloors', 'dungeonCurrentFloor',
      'dungeonKeySkullFloor', 'dungeonKeyUsedThisRun',
      'dungeonRareItemObtainedThisRun', 'dungeonTemplatesUsedThisRun',
      'player._activeInteriorKind', 'player.hutExitPosition',
      'player.mazeExitPosition', 'player.dungeonExitPosition',
      'player.inAquifer', 'player.aquiferExitPosition', 'player.plane',
      'player.tombSapped', 'player._tombSapTimer', 'player._tombSappingGhost',
    ],
    why: "InteriorManager.reset() is Non-Goals-exempt (PRD: system-owned reset methods keep their internal logic; the registry only guarantees the CALL happens at the right scope). InteriorManager.reset() already runs from its own three direct call sites (enterRestState, transitionToNeutralRoom, enterExploreState) — those are unchanged by this entry. Registering it here at 'room' scope means it ALSO now fires a 4th time via applyRoomSwap's applyReset('room') call (Step 6) — every existing call site to those three functions already runs applyRoomSwap downstream, so this is a same-tick duplicate call, not a new independent trigger. Verified idempotent: every field it writes is a plain null/-1/[]/new-Set() assignment, and its one side-effecting call (inventorySystem.consumeKeyItem('⚿')) is a no-op splice-miss when nothing is held (InventorySystem.js:321-326) — so the duplicate call is inert, not merely 'probably harmless'. Registering it was primarily for FR5 traceability (plan §5.E) so the harness's registry-coverage check accounts for the game.*/player.* fields it reaches via `covers`, without duplicating InteriorManager's own internal reset logic as table entries — the extra call is an accepted side effect of that, not the goal.",
  },

  // ── C. Title-only today (plan §5.C) — STEP 3. These fields/calls, plus
  // everything above (inherited via scopeIncludes('title') === ['room','run',
  // 'title']), are what enterTitleState() now applies via
  // applyReset(game, 'title'). Do not duplicate anything from sections A/B/D
  // here — TITLE gets it for free through the cascade. The original §5.C
  // world-teardown set (backgroundObjects/items/ingredients/placedTraps/
  // physicsSystem.clear/combatSystem.clear/huntingSystem.reset) moved to
  // Section D below in Step 6 — it was always room-scoped behavior, not
  // title-only; TITLE still gets it via the cascade unchanged. `currentRoom`
  // moved to Section B (`run` scope, not `room`) instead — see that entry's
  // `why` for the reason applyRoomSwap's own call sites rule out `room`
  // scope for this one field. TITLE still gets it via the cascade either
  // way. ─────────────────────────────────────────────────────────────────
  {
    path: 'blueZoneRoom',
    scope: 'title',
    value: 0,
    // Plan §5.C notes this also looks like a latent death-path gap (not
    // cleared by _resetRunToRest today), but Step 3's brief is title-only —
    // adding it at run scope too is a separate call, flagged in the Step 3
    // report rather than made unilaterally here.
    why: 'Blue Zone secret-room counter starts over for a fresh title session.',
  },
  {
    path: 'roomGenerator.setDepth',
    scope: 'title',
    call: (game) => game.roomGenerator.setDepth(0),
    // Same latent-death-path-gap note as blueZoneRoom above.
    why: "Room generator depth mirrors zoneDepths' reset for the title screen; enterExploreState re-sets it per room anyway.",
  },
  {
    path: 'titleAnimationTime',
    scope: 'title',
    value: 0,
    why: 'Title screen intro animation starts over each time TITLE is entered.',
  },
  {
    path: 'introAnimationStarted',
    scope: 'title',
    value: false,
    why: 'Start with the pre-intro screen each time TITLE is entered.',
  },
  {
    path: 'launchButtonBounds',
    scope: 'title',
    value: null,
    why: 'Re-set by TitleRenderer on the next render; stale bounds from a prior TITLE visit must not linger.',
  },
  {
    path: 'titleIdleTimer',
    scope: 'title',
    value: 0,
    why: 'Idle timer (drives the arcade-demo trigger) restarts fresh on each TITLE entry.',
  },

  // ── Addendum: death-output fields, title-only (plan §5.-1) ────────────
  // lastDeathCause / tombstoneActive / tombstonePopup are death-path OUTPUT
  // consumed by REST, not run-scoped input to clear on a run reset —
  // _resetRunToRest runs at the exact moment these are freshly populated by
  // the death event (main.js ~3218-3230), immediately before the REST
  // transition that needs to render the tombstone from them. Registering
  // them at scope: 'run' would erase the tombstone before REST ever shows
  // it. They are intentionally ABSENT from section A/B above — do not
  // "fix" that asymmetry by adding them there. Their normal dismissal
  // already has an owner (the bespoke inline check in enterExploreState()
  // when leaving REST for EXPLORE, main.js ~1816-1818) and stays exactly
  // where it is. This title-only entry exists only to close the gap where
  // a title return happens WITHOUT that dismissal ever running (e.g. after
  // a death where the player never re-entered EXPLORE) — verified against
  // every transition(GAME_STATES.TITLE) call site: none of them touch
  // these three fields today.
  {
    path: 'lastDeathCause',
    scope: 'title',
    value: null,
    why: 'Death-output field (plan §5.-1 addendum), deliberately absent from run scope — see the section comment above. Shape: { name, char, color, description } of the killing enemy.',
  },
  {
    path: 'tombstoneActive',
    scope: 'title',
    value: false,
    why: 'Death-output field (plan §5.-1 addendum), deliberately absent from run scope — see the section comment above.',
  },
  {
    path: 'tombstonePopup',
    scope: 'title',
    value: null,
    why: 'Death-output field (plan §5.-1 addendum), deliberately absent from run scope — see the section comment above. Shape: { phase: 0|1|2, timer: float } or null.',
  },
];

// ---------------------------------------------------------------------------
// Load-time shape assertions
// ---------------------------------------------------------------------------
//
// These run once, at module load, against whatever RESET_REGISTRY currently
// contains. With an empty table (today) this loop is a no-op — it exists so
// that Steps 2/3 (which populate the table) get an immediate, clear failure
// on a malformed row instead of a silent misbehavior discovered later via
// tools/check-reset-parity.mjs or, worse, in play.
for (const entry of RESET_REGISTRY) {
  const kindKeys = ['value', 'fresh', 'call'].filter((key) => key in entry);
  if (kindKeys.length !== 1) {
    throw new Error(
      `[resetRegistry] Entry "${entry.path}" (scope: ${entry.scope}) must declare ` +
        `exactly one of value/fresh/call — found: ${kindKeys.length === 0 ? 'none' : kindKeys.join(', ')}.`
    );
  }

  // Anti-aliasing guard: a literal array/object under `value` would be the
  // same object reference reused across every reset that hits this entry —
  // exactly the shared-mutable-literal shape that caused bug #100 (the same
  // rebuild logic diverging because one copy mutated a structure another
  // copy still held a reference to). Mutable values MUST go through `fresh`,
  // a zero-arg factory that manufactures a new instance per reset.
  if (kindKeys[0] === 'value' && entry.value !== null && typeof entry.value === 'object') {
    throw new Error(
      `[resetRegistry] Entry "${entry.path}" (scope: ${entry.scope}) uses "value" with an ` +
        `array/object. Arrays and objects must use "fresh" (a zero-arg factory) instead, so ` +
        `every reset gets an independent instance rather than a shared, aliasable reference.`
    );
  }
}

// ---------------------------------------------------------------------------
// Path resolution
// ---------------------------------------------------------------------------

/**
 * resolveEntryOwner(game, path) — walks a dotted path against `game` and
 * returns the owning object plus the final property name to read/write, or
 * a skip signal when the path cannot be safely resolved.
 *
 * Two resolution modes:
 *   - A path whose first segment is 'player' (e.g. 'player.magicMeter')
 *     resolves starting from game.player instead of game itself. If
 *     game.player is null or undefined, the ENTIRE ENTRY IS SKIPPED (not
 *     thrown) — this is deliberate: a run-scoped player.* entry must be
 *     harmless to apply from a context where no player instance exists yet
 *     (e.g. very early boot, or a TITLE reset that runs before a run has
 *     ever started), rather than requiring every call site to guard against
 *     player being absent.
 *   - Any other path resolves directly against `game` (e.g.
 *     'inventorySystem.restQuickSlots' walks game.inventorySystem, then
 *     resolves 'restQuickSlots' on it).
 *
 * A missing intermediate owner anywhere along the chain (e.g. a system that
 * hasn't been constructed yet) also produces a skip rather than a throw —
 * applyReset's per-entry try/catch is a second, independent safety net for
 * exceptions raised inside a `fresh`/`call` function itself, not for this
 * resolution step, which is expected to fail gracefully on its own.
 */
function resolveEntryOwner(game, path) {
  const segments = path.split('.');

  let owner;
  let ownerSegments;
  if (segments[0] === 'player') {
    if (game.player == null) {
      return { skip: true };
    }
    owner = game.player;
    ownerSegments = segments.slice(1);
  } else {
    owner = game;
    ownerSegments = segments;
  }

  if (ownerSegments.length === 0) {
    // A bare 'player' path with nothing after it is malformed — there is no
    // property to read or write.
    return { skip: true };
  }

  const property = ownerSegments[ownerSegments.length - 1];
  for (let i = 0; i < ownerSegments.length - 1; i++) {
    if (owner == null) {
      return { skip: true };
    }
    owner = owner[ownerSegments[i]];
  }
  if (owner == null) {
    return { skip: true };
  }

  return { skip: false, owner, property };
}

// ---------------------------------------------------------------------------
// Consumer
// ---------------------------------------------------------------------------

/**
 * applyReset(game, scope, { init }) — the single function both
 * enterTitleState() and _resetRunToRest() are migrated to call (plan §1,
 * FR2/FR4). Filters RESET_REGISTRY down to every entry whose scope is
 * narrower-than-or-equal-to the requested scope (via scopeIncludes), then
 * walks the filtered list IN DECLARED ARRAY ORDER — order is a real
 * ordering-dependency mechanism here, not an implementation detail (see the
 * table comment above and plan §4).
 *
 * For each entry:
 *   - Resolve its owner via resolveEntryOwner. A skip (missing owner, or a
 *     player.* path with no player instance) silently moves on to the next
 *     entry — this is expected, routine behavior, not a failure.
 *   - Otherwise apply exactly one of value / fresh() / call(game).
 *   - The whole per-entry application is wrapped in try/catch: one bad
 *     entry (a throwing factory, a call that throws) is logged via
 *     console.error naming the entry's path and scope, and the loop
 *     continues — a single malformed row must never abort the rest of a
 *     reset partway through, which would leave the game in a worse,
 *     partially-reset state than either not resetting or fully resetting.
 *
 * `init` (default false) additionally skips any entry explicitly marked
 * `init: false` in its declaration — see initRegisteredState below.
 */
export function applyReset(game, scope, { init = false } = {}) {
  const applicableScopes = scopeIncludes(scope);

  for (const entry of RESET_REGISTRY) {
    if (!applicableScopes.includes(entry.scope)) {
      continue;
    }
    if (init && entry.init === false) {
      continue;
    }

    try {
      const resolved = resolveEntryOwner(game, entry.path);
      if (resolved.skip) {
        continue;
      }

      if ('call' in entry) {
        entry.call(game);
      } else if ('fresh' in entry) {
        resolved.owner[resolved.property] = entry.fresh();
      } else {
        resolved.owner[resolved.property] = entry.value;
      }
    } catch (err) {
      console.error(
        `[resetRegistry] Failed to apply reset entry "${entry.path}" (scope: ${entry.scope}):`,
        err
      );
    }
  }
}

/**
 * initRegisteredState(game) — applies the widest scope ('title', which by
 * the cascade includes 'run' and 'room' too) with { init: true }, so entries
 * marked `init: false` are skipped.
 *
 * This is the function Step 5 of the plan wires into the Game constructor
 * (initRegisteredState(this), after systems are constructed, before
 * setupInput()) so that a field's registry row becomes its creation site as
 * well as its reset definition — see plan §2 for why this is how Goal 2
 * ("declaration lives next to field creation") is actually satisfied by a
 * static table rather than call-based registration. With RESET_REGISTRY
 * empty today, calling this is a harmless no-op; nothing calls it yet.
 */
export function initRegisteredState(game) {
  applyReset(game, 'title', { init: true });
}

/**
 * registeredPaths() — the set of every dotted path this registry knows
 * about: each entry's own `path`, plus every path listed in any entry's
 * `covers` array (fields a call/method reset reaches as a side effect
 * without being a registry entry itself).
 *
 * This is what tools/check-reset-parity.mjs's registry-coverage check (plan
 * §6, Step 4) cross-references against a fresh Game/Player instance's own
 * properties to find fields that reset behavior doesn't account for at all.
 * With an empty table today, this correctly returns an empty Set — there is
 * nothing yet for the harness to check against, which is expected until
 * Step 4.
 */
export function registeredPaths() {
  const paths = new Set();
  for (const entry of RESET_REGISTRY) {
    paths.add(entry.path);
    if (Array.isArray(entry.covers)) {
      for (const coveredPath of entry.covers) {
        paths.add(coveredPath);
      }
    }
  }
  return paths;
}
