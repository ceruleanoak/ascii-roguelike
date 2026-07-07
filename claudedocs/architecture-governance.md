# Architecture Governance — main.js Containment

Established 2026-06-09 after a consultant-style audit found `main.js` at 7,951 lines despite the CLAUDE.md "orchestration only" rule. The conclusion: the bloat is a **governance failure, not a code-quality failure** — the rules described where known code categories belong but gave net-new behavior no default home, no enforcement, and no feedback loop. This document is the risk register and the procedural fixes.

## Risk register

| ID | Risk | Evidence | Severity | Mitigation |
|----|------|----------|----------|------------|
| G1 | **No default home for novel behavior.** The routing table only covers known categories; anything genuinely new (companions, blue-armor ticks) falls through to main.js. | Bread-feed rat/crow companion pipeline grew to ~514 lines inside main.js before extraction. | High | Default inverted: every net-new behavior names an owning system file *before* logic is written; "no home" now means *create a system*, never *inline it*. (CLAUDE.md Code Placement Procedure, step 1–2) |
| G2 | **Input handlers act as logic magnets.** Behavior gets written next to the key event that triggers it. | `handleSpacePress()` is 476 lines; CLAUDE.md had already flagged SHIFT/Tab/M/V handlers but with no rule stopping new accretion. | High | Dispatch-only rule for new input code: a handler branch may only translate input → one system call. (Procedure step 3) |
| G3 | **Pattern mirroring instead of system extension.** Copying a system's lifecycle inline is locally cheap, globally compounding. | Crystal Maul block in `updateExploreState` self-describes as "mirrors MagicSystem pattern for gem wands" — inline. | Medium | "Extend, don't mirror" rule. (Procedure step 4) |
| G4 | **Threshold-based policy invites sub-threshold accretion.** "If >10 items, consider a system" licenses the first nine inline instances. | ~30 `data?.flag` interpreter branches in main.js (`chargeHammer`, `callsLightning`, `placesLava`, `mossCloak`, …). | Medium | Placement thresholds removed: routing happens on day one regardless of count. The >10 rule remains only as a *system-design* prompt, not a placement license. |
| G5 | **No measurement or enforcement.** Size rules were prose; drift was invisible until an audit. | main.js doubled past any documented expectation with zero friction. | High | `tools/check-architecture.js` ratchet, wired into `npm run build` (and therefore `deploy`). Budgets in `tools/arch-budgets.json` only move down (`--update` after extractions; +25-line headroom covers legitimate wiring growth). |
| G6 | **Stale documentation erodes rule authority.** Once one documented number is fiction, all guidance reads as decorative. | CLAUDE.md claimed Enemy.js ~1,200 lines (actual 3,822), Item.js ~1,000 (actual 1,536). | Medium | CLAUDE.md no longer states line counts; the machine-checked budget file is the single source of truth. |

## Enforcement mechanics

- `npm run check:arch` — checks every file in `tools/arch-budgets.json`; exceeding a budget fails (and `build`/`deploy` run it first).
- `node tools/check-architecture.js --update` — after an extraction, ratchets budgets down to current size + 25 headroom. Budgets can never be ratcheted *up* by this command.
- Raising a budget by hand-editing the JSON is the procedural escape hatch; it should appear in a diff, with a reason, and is expected to be rare to never.

## Extraction backlog (bloat / redundancy cleanup)

Ordered by value ÷ risk. Sizes measured 2026-06-09. Each completed row should be followed by `check-architecture.js --update`.

| # | Extraction | From | To | ~Lines | Status |
|---|-----------|------|----|--------|--------|
| 1 | Companion pipeline (bread-feed, tamed rats, crow flock/companions) | main.js | `systems/CompanionSystem.js` | 514 | ✅ done 2026-06-09 |
| 2 | Inline liquid/lava damage resolution in `updateExploreState` (per-entity-class branching, hand-rolled `lavaDamageTimer` lazy-init — violates the documented anti-pattern) | main.js | `PhysicsSystem.applyLiquidResults` | ~130 | ✅ done 2026-06-09 (lazy-init timer kept as-is — behavior-preserving move; flagged in code) |
| 3 | Blue-zone armor ticks `_updateCoralCrown` / `_updateStingrayMantle` | main.js | `InventorySystem.updateBlueArmorEffects` | ~95 | ✅ done 2026-06-09 |
| 4 | Green-character weapon helpers: `_isBlockingStaff`, `_releaseStaffBlock`, `_spawnStaffBlockSweepVisual`, `_callLightningStrike`, `_spawnLavaSweep` | main.js | `CharacterSystem` (joins applyGreenDamageModifier there) | ~130 | ✅ done 2026-06-09 |
| 5 | Crystal Maul charge-hammer auto-fire block in `updateExploreState` | main.js | `MagicSystem._updateChargeHammer` | ~25 | ✅ done 2026-06-09 |
| 6 | `data?.flag` interpreter migration — resolved as **standing policy**, not a one-time task: the lifecycle-bearing flags now live in systems (`chargeHammer`/`gemWand` → MagicSystem, `callsLightning`/`placesLava` → CharacterSystem, `mossCloak` → InventorySystem); remaining flags in main.js are one-line predicates, fine inline. New flags follow the Code Placement Procedure on day one. A dedicated `itemMechanics/` directory stays an option if a future flag needs per-item state. | — | — | — | ✅ resolved 2026-06-10 |
| 7 | `handleSpacePress()` decomposition to dispatch-only (476 → 281 lines): armed-attack flow → `CombatSystem.tryUseHeldWeapon`, vault → `InteractionSystem.canUnlockVault/unlockVault`, wise-fellow artifact → `InteractionSystem.tryGiveArtifactToWiseFellow`, bundle scatter → `LootSystem.scatterRestBundle`, NPC swap → `CharacterSystem.trySwapWithNearbyNPC`, GAME_OVER resets → named `_respawnNextCharacter`/`_resetRunToRest` (run-reset is state-transition orchestration, stays in main.js) | main.js | per branch | ~250 | ✅ done 2026-06-10 |
| 8 | `updatePlayerMechanics` + `updateSharedGameElements` audit: dodge dispatch (shark/green/standard + `_sharkEmergeAttack`) → `CharacterSystem.updateDodge`, moss cloak → `InventorySystem.updateMossCloak`, entire shared world-effects ticker → new `WorldEffectsSystem` | main.js | CharacterSystem / InventorySystem / WorldEffectsSystem | ~430 | ✅ done 2026-06-10 |

Items 2–5 are mechanical moves with no behavior change intended. Item 7 is the riskiest (interleaved input state); do it last, branch by branch.

## Discovered during cleanup

The #4 extraction audit surfaced **bug #88**: `updatePlayerMechanics` and `updateExploreState` both ran the held-item update pipeline, so weapon cooldowns/windups ticked at 2× data values in EXPLORE (1× in REST/NEUTRAL) and hammer shockwaves intermittently dropped (the duplicate lacked the shockwave branch). Verified via full static trace + git history (`179bdbb` extracted the pipeline but never deleted the EXPLORE copy).

**Fixed 2026-06-10** behavior-preservingly: duplicate deleted, single source in `updatePlayerMechanics` ticks at `PHYSICS.WEAPON_TIMER_RATE` (= 2). EXPLORE feel unchanged; REST/NEUTRAL gain parity (now also 2×); shockwaves always fire. Weapon timing data remains in "double-seconds" — effective seconds = data value / 2. Normalizing the data (halve all cooldown/windup/recovery/reloadTime/chargeTime AND code-level fallbacks, then delete the constant) is a possible follow-up, but it must be one deliberate pass — the playtesting simulator reads raw data values and is currently 2× optimistic on cooldown-dominated TTK.

## Out of scope (explicitly rejected)

- Splitting `Enemy.js` — the `enemyMechanics/` composition is already the relief valve.
- Physics broadphase, per-frame allocation micro-optimizations — no measured need at current entity counts.
- Moving companion/trap/menu *data* off `game` — documented compromise; renderers read it directly.

## Character Budget Policy

Established 2026-06-20. Supplements G5 (enforcement) and the Code Placement Procedure (routing) with decision rules for when budgets move and when net-new systems are created.

### Decision gate (mandatory before touching any budgeted file)

Before writing logic that lives in a budgeted file, ask: **will this exceed the budget?**

Run `npm run check:arch` to see current headroom. If the answer is yes, choose one path **before writing the code**:

| Path | When to use | Action |
|------|-------------|--------|
| A — Extract first | New logic fits the file's domain but the file is overfull | Identify an extraction candidate, move it, run `--update`, then add the feature. Net size ≤ 0. |
| B — New system | Logic is behavior-bearing and its concept is separable from this file's core domain | Create `src/systems/XxxSystem.js`. No "too small" threshold applies. |
| C — Raise budget | Logic genuinely expands the file's own domain AND both A and B would be artificial fragmentation | Hand-edit `tools/arch-budgets.json` with a justification. Treat as rare. See criteria below. |

**When unsure between B and C: default to B.** Net-new systems are reversible; budget raises accumulate.

**2026-07-05 revision**: `main.js` previously had a blanket "no raise, ever" rule instead of
a domain criterion like every other file. In practice that made the policy unsustainable —
main.js legitimately grows a little on every new system's wiring (import + instantiate +
one `update()`/dispatch call), and that growth has nowhere else to go; it isn't a Path B
candidate because it isn't a behavior cluster, just glue. The absolute ban meant genuine
wiring growth had no legal path forward. main.js now uses the same Path C mechanism as
every other budgeted file, gated by the same test: does the new code expand the file's own
domain (orchestration) or is it actual behavior that belongs in a system. The bar for "own
domain" is narrower for main.js than any other file (wiring/dispatch only, never logic) —
that's what keeps this from re-opening the original G1-G5 drift.

### Budget raise criteria

A raise is only justified when the new code **expands the file's own legitimate domain**.

| File | Raise ok | Use path B instead |
|------|----------|--------------------|
| `ExploreRenderer.js` | New rendering passes, HUD elements, visual modes | Game logic, state mutation, AI |
| `CombatSystem.js` | New attack resolution, hit detection, damage types | Loot spawning, UI, physics |
| `RoomGenerator.js` | New room layouts, spawn templates, procedural passes | Trap logic, entity AI, crafting |
| `Enemy.js` | AI behaviours, status-effect responses, item usage | Combat resolution (that belongs in CombatSystem) |
| `InventorySystem.js` | Item effect application, slot management, crafting | Rendering, physics, world effects |
| `Item.js` | New attack patterns (pattern count justifies size) | State mutation, UI |
| `Player.js` | Stats, dodge roll, status tracking | Input logic beyond dispatch, game flow |
| `main.js` | Pure orchestration growth: wiring/instantiating a new system, adding a state-transition function, a new dispatch branch that's a single call-out | Any actual behavior — game logic, state mutation, AI, effect resolution (that belongs in a system) |

### Net-new system trigger rules

Create a new `src/systems/XxxSystem.js` when **any** of these are true:

- Behavior has no existing owner in the routing table (CLAUDE.md §main.js rules) and would otherwise land in main.js.
- Adding to an existing file would push it over budget AND the concept is separable.
- A second distinct behavior cluster is being added to the same budgeted file in the same session — even if each individually fits.
- The feature introduces its own per-frame `update(dt)` lifecycle that isn't a sub-call of an existing system.

A 40-line system that keeps main.js clean is correct architecture.

### Pre-implementation planning protocol

Answer these before touching any budgeted file within 5,000 chars of its ceiling:

1. **What is the owning concept?** Name the system or entity class.
2. **What is the current headroom?** (`npm run check:arch`)
3. **Estimated added characters?** (rough: lines × 50)
4. **Will it exceed the budget?** If yes — choose path A, B, or C now.
5. **Does it introduce a new behavior lifecycle?** If yes → new system.
6. **Anything in the target file extractable first?** List candidates before writing.

If question 4 is "yes" and no path is chosen: **stop. Do not write the implementation.**

### `--update` hygiene

| Situation | Run `--update`? |
|-----------|----------------|
| After a successful extraction that shrank a file | YES — lock in the saving |
| After a bug fix that incidentally trims a few chars | NO |
| After a feature addition that stayed within budget | NO |
| After a manual budget raise (path C) | NO — the hand-edit IS the new ceiling |
| After a refactor with no net deletion | NO — wait for real shrinkage |

### Budget raise diff template

When path C is taken, the commit message or PR description must include:

```
budget(<file>): +<N> — <one-sentence domain justification>
```

Example: `budget(ExploreRenderer.js): +12000 — new minimap rendering pass (zoom/pan/fog-of-war)`

No justification = the raise should not have happened.
