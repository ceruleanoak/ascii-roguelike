# PRD — Declare-Once Reset Registry

**Status:** Drafted for planning. Not yet an ADR — this is the technical requirements
document; the *why* was decided in conversation (see Decision Context) and should be
written up as an ADR once the design settles, per CLAUDE.md's ADR authorship rule.

**Author:** Claude (drafted at user's direction), decisions ratified by the user in
conversation on 2026-09-20.

## Decision Context (already ratified — do not re-litigate)

- The bug family (#198, #196, #100, #86, #13) plus two later same-shape incidents
  (the ingredient-pile unification, the golem recipe-result overload) all trace to
  the same root cause: run-scoped state has no single source of truth for its own
  reset scope. `tools/check-reset-parity.mjs` (built 2026-08-24) catches drift
  *after the fact* via deep-diff against a fresh instance — it does not prevent it.
- Considered and rejected: an **add-on registry** that only covers newly-added
  fields going forward, coexisting with the current hand-written lists. Rejected
  because the project has "enough decisions left, meaningful chances for major
  changes" that a permanently-split source of truth (some fields in the registry,
  most still in the old lists) was judged the worst of the three options on the
  table (status quo / add-on / full retrofit).
- **Decided: full retrofit.** Migrate the existing reset surfaces onto one
  declarative registry, consumed by one function.
- **The primary justification is inference quality, not correctness.** The harness
  already prevents shipped bugs regardless of this change. The registry's job is
  to make the *first draft* — by a human or by a coding agent — correct more
  often, by replacing "reverse-engineer scope from up to 5 divergent imperative
  functions" with "pattern-match against one declarative table." Do not sell this
  internally as a correctness fix; the harness already owns correctness.
- **Kills copy-drift structurally.** #100 happened because the same rebuild logic
  existed in 3 places and one diverged. Post-migration there is exactly one copy.

## Problem, grounded in the actual code

Two long-hand functions in `src/main.js` currently each independently list which
fields reset and to what:

- `enterTitleState()` (`src/main.js:913`) — ~65 lines, TITLE-scoped reset.
- `_resetRunToRest()` (`src/main.js:4061`) — ~90 lines, death/game-over reset.

They overlap heavily (`zoneDepths`, `zoneSystem.resetOnDeath()`,
`threeRoomSystem.hardReset()`, `barricadeSystem.hardReset()`,
`cursedRunSystem.hardReset()`, `menuSystem.clearPickupFeedback()`, `restBundle`,
`hasLeftRestOnce`, …) but are not identical (`wishesUsed`, `_savedDestroyedSlots`,
`spectaclesObtainedThisRun`, and others exist only in the death path). Nothing
enforces that "TITLE resets a superset appropriate to itself, death resets a
superset appropriate to itself, and the shared portion is one piece of code" — it
is two independently hand-maintained lists that happen to agree today.

Two further reset surfaces exist as system-owned methods rather than inline field
lists: `InteriorManager.reset()` and `ZoneSystem.resetOnDeath()` (which itself
calls `resetLeshyChase()`/`resetRiverChase()`). These are **not** in scope for
replacement — see Non-Goals.

The harness (`tools/check-reset-parity.mjs`) already has a two-tier model
(`IGNORE` regex list, `contractSurface(path)` distinguishing contract-surface
drift from total drift) that any registry design must stay compatible with, and
ideally sharpen.

## Goals

1. **One declarative table** is the single source of truth for which `game.*` /
   `player.*` fields reset at which scope, and to what value.
2. **Declaration lives next to field creation** (constructor / first-assignment
   site), not in a reset function far away — this is the actual inference-quality
   lever; get this wrong and the PRD's stated purpose isn't served.
3. **A cascading scope model** — `title ⊇ run ⊇ room` at minimum (confirm against
   real usage whether a `dungeonVisit` tier is needed as a fourth, distinct from
   `room`, before building it — don't invent a tier nothing currently needs).
4. **One consumer function** (`applyReset(game, scope)` or similar) that both
   `enterTitleState()` and `_resetRunToRest()` call, replacing their inline field
   lists. Method-backed resets (`player.reset()`, `zoneSystem.resetOnDeath()`,
   `*.hardReset()`) are *entries* in the table (a registered field can point at a
   method call, not only a literal/factory), not replaced by it — see Non-Goals.
5. **The harness is updated to consume the registry**, not just kept passing.
   Specifically: it should be able to enumerate every registered field per scope
   and confirm no live `game.*`/`player.*` own-property is unregistered, rather
   than relying solely on deep-diff-and-triage. Keep the deep-diff as the backstop
   for values the registry gets *right in the table but wrong in effect* (e.g. a
   `resetTo` factory with a bug) — the two mechanisms check different failure
   modes and both stay.

## Non-Goals

- **Not replacing system-owned reset methods.** `player.reset()`,
  `zoneSystem.resetOnDeath()`, `InteriorManager.reset()`, every `*.hardReset()` —
  these keep their existing internal logic and ownership. The registry's job is
  to guarantee they get *called* at the right scope, exactly once, from one place
  — not to inline their internals as table entries.
- **Not migrating InteriorManager.reset() or ZoneSystem.resetOnDeath() internals.**
  Their *call sites* move into the registry; their bodies are untouched unless a
  bug is found in the process (out of scope to hunt for one).
- **Not adding a new reset scope nothing currently needs.** If real usage only
  ever needs `title`/`run`/`room`, don't add `dungeonVisit` speculatively — YAGNI
  applies to the scope enum same as anywhere else.
- **Not a general "all state must be declared" enforcement mechanism beyond
  reset scope.** This PRD is about reset, not about e.g. save/load or replay.

## Functional Requirements

### FR1 — Registration API
A field (or a method-backed reset unit) registers itself at the point it's
created, stating:
- `path` — dotted accessor from `game` (or `player`, when the owner is the
  player instance) to the field.
- `scope` — one of the cascading tiers (see FR3).
- Exactly one of:
  - `resetTo`: a literal or zero-arg factory function producing the reset value.
  - `reset`: a function `(game) => void` for method-backed resets
    (`(game) => game.player?.reset()`).

Open question for the plan to resolve: does registration happen via a call
(`registerResetField(...)`) executed at module load / constructor time, or via a
static declarative array consumed once at boot? Either satisfies "declared next
to creation" if placed correctly; pick based on what's least disruptive to
`Game`'s constructor and the systems' own constructors.

### FR2 — Consumer
`applyReset(game, scope)` (exact name TBD by the plan) applies every registered
entry whose scope is ≤ the requested scope per the cascade (FR3), in a stable,
declared order (some entries may have real ordering dependencies — e.g.
`zoneSystem.resetOnDeath(game)` running before or after other zone-adjacent
resets — the plan must audit the current two functions for such dependencies
before assuming order is arbitrary).

### FR3 — Scope cascade
Confirm the tier set against actual usage (this PRD proposes, plan should verify):
- `room` — narrowest; per-room-transition state.
- `run` — dies on death/game-over (`_resetRunToRest`'s surface).
- `title` — dies returning to TITLE (`enterTitleState`'s surface; is a superset
  of `run` today — verify this holds for every field, since if it doesn't, the
  cascade assumption itself is wrong and needs revisiting before building on it).

### FR4 — Migration of the two existing functions
`enterTitleState()` and `_resetRunToRest()` are rewritten to:
1. Call `applyReset(game, 'title')` / `applyReset(game, 'run')` respectively for
   everything that fits the declarative model.
2. Retain only genuinely bespoke, non-reset logic inline (e.g.
   `enterTitleState`'s UI-overlay class toggling, title-music-load guard,
   `enterTitleState`'s "no player needed" special case) — the plan should
   produce a concrete list of what stays inline vs. what migrates, not assume
   100% of either function's body is reset-table material.

### FR5 — Harness integration
Extend `tools/check-reset-parity.mjs` to cross-check the registry: every
own-property the deep-diff finds on a fresh `Game`/`Player` should be traceable
to a registry entry at some scope, or to the documented `IGNORE` list. Decide
(plan's job) whether this is a hard failure or a warning during rollout, given
some fields may legitimately be intentionally-persistent (cheat flags, etc.) and
already sit in `IGNORE`.

## Acceptance Criteria

- `enterTitleState()` and `_resetRunToRest()` no longer contain two independent
  hand-written copies of the same field-clearing logic; shared resets exist once.
- `node tools/check-reset-parity.mjs` passes with no new unignored drift.
- A new run-scoped field added after this migration can be fully wired (declared
  + reset-correct) by touching exactly one location (its creation site), not by
  editing two-to-five separate functions.
- `InteriorManager.reset()` and `ZoneSystem.resetOnDeath()` are unchanged
  internally; only their call sites move.

## Risks / Open Questions for the Plan

1. **Ordering dependencies** between entries in the current two functions may be
   real, not incidental — the plan must audit for them before assuming a
   registry can apply entries in arbitrary/declaration order.
2. **Scope-cascade violation risk**: if any field currently cleared in
   `_resetRunToRest` but *not* in `enterTitleState` (or vice versa) turns out to
   matter, the "title ⊇ run" assumption breaks and the cascade model needs a
   correction before the migration, not after.
3. **Where do system-internal fields live?** (e.g. `ZoneSystem`'s own
   `leshyChaseActive`-style fields, cleared via `resetLeshyChase()`/
   `resetRiverChase()` from inside `resetOnDeath()`). These are arguably already
   correctly owned by `ZoneSystem` and out of scope (Non-Goals) — the plan should
   state explicitly which fields are in-scope-for-registration (game/player
   direct fields) vs. out-of-scope (fields already encapsulated behind a system's
   own reset method).
4. **Migration ordering**: one big pass vs. field-by-field. Given "meaningful
   chances for major changes" ahead per the decision context, a single pass now
   (before more state accretes) is probably right, but the plan should state the
   trade-off explicitly rather than default to it.

## Deliverable Requested

A concrete implementation plan (not code yet): sequenced steps, the exact
registry API surface, the audited field inventory (which of the ~65-90 fields in
each function go where), the ordering-dependency audit result, and the harness
change — sized so the user can decide whether to execute it in one sitting or
split across sessions.
