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
| 6 | `entities/itemMechanics/` composition directory mirroring `enemyMechanics/` — migrate `data?.flag` interpreters (`chargeHammer`, `gemWand`, `callsLightning`, `placesLava`, `mossCloak`, …) opportunistically as each is next touched | main.js / Item.js | new mechanic files | incremental | open |
| 7 | `handleSpacePress()` decomposition to dispatch-only (476 lines) | main.js | owning systems per branch | ~400 | open |
| 8 | `updatePlayerMechanics` (314) + `updateSharedGameElements` (204) — audit for system-owned chunks | main.js | various | partial | open |

Items 2–5 are mechanical moves with no behavior change intended. Item 7 is the riskiest (interleaved input state); do it last, branch by branch.

## Discovered during cleanup

The #4 extraction audit surfaced **bug #88** (see `known-bugs.md`): `updatePlayerMechanics` and `updateExploreState` both run the held-item update pipeline, so weapon cooldowns/windups tick at 2× data values in EXPLORE and hammer shockwaves intermittently drop. Deliberately NOT fixed during refactoring — the game is balanced around the 2× ticking, so the fix is a balance decision, not a cleanup. Both duplicate blocks were left in place verbatim.

## Out of scope (explicitly rejected)

- Splitting `Enemy.js` — the `enemyMechanics/` composition is already the relief valve.
- Physics broadphase, per-frame allocation micro-optimizations — no measured need at current entity counts.
- Moving companion/trap/menu *data* off `game` — documented compromise; renderers read it directly.
