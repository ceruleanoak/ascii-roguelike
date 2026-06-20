# ADR Backlog — Candidate Decisions

Architecturally significant decisions that **lack an ADR**. AI appends candidates here when it
notices a gap; you prioritize and write them (the *why* is yours to author). When an ADR is
written, remove the row and add it to the index in `README.md`.

This is a prioritization queue, not a to-do mandate — some candidates may resolve to "not worth
an ADR." Drop those rows. Only hard-to-reverse / architecture-shaping decisions belong here, not
routine choices.

**Priority:** P1 = load-bearing, would cost the most to reconstruct the reasoning for later · P2 = significant but lower urgency.

| Priority | Candidate decision | Where it lives today | Surfaced |
|----------|--------------------|-----------------------|----------|
| P1 | **No persistence — full reset on death/refresh.** No localStorage/sessionStorage/IndexedDB; `PersistenceSystem` permanently disabled. The "save file" is mental. | CLAUDE.md "Critical Technical Constraints"; `PersistenceSystem.js` | 2026-06-13 (seed) |
| P1 | **main.js is orchestration-only; behavior routes to systems.** Enforced budgets via `tools/check-architecture.js`; net-new behavior gets a system, not an inline branch. | CLAUDE.md "main.js — Orchestration Rules" / "architecture-governance.md" | 2026-06-13 (seed) |
| P2 | **Weapon timing in "double-seconds" (WEAPON_TIMER_RATE = 2).** Data values are ÷2 effective seconds; resolved bug #88 tuned everything against this. | CLAUDE.md "Architectural Compromises"; `PHYSICS.WEAPON_TIMER_RATE` | 2026-06-13 (seed) |
| P2 | **Plane predicate centralization (PlaneSystem) over per-frame interior guards.** Combat/vision/pickup/collision route through one predicate; ad-hoc `inHut`/`inMaze`/`inDungeon` checks are the layer-leak anti-pattern. | `PlaneSystem`; CLAUDE.md anti-patterns; bug #107 | 2026-06-13 (seed) |
| P2 | **Enemy behavior via Mechanic composition, not subclassing/branching.** New behaviors are `entities/enemyMechanics/` files selected by data. | CLAUDE.md "Entity Size Norms"; `src/entities/enemyMechanics/` | 2026-06-13 (seed) |
| P2 | **Crafted intermediates require dual registration in `ITEMS` *and* `INGREDIENTS`.** A material that is both a recipe result (type `INGREDIENT`) and a pool ingredient must be entered in both maps; display lookups resolve via `INGREDIENTS[char]` only, so a char in `ITEMS` but absent from `INGREDIENTS` silently renders as "Unknown" in the crafting menu (no validation). Decide: single source of truth / a derive-or-validate step vs. keep the manual parity convention. | `src/data/items.js` (`ITEMS` + `INGREDIENTS`); `isItem`/`isIngredient`; `main.js` getIngredientData (`INGREDIENTS[char] \|\| {name:'Unknown'}`); bug #114 | 2026-06-19 |
