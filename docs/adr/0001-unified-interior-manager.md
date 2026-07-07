# 0001. Unified interior layer under a single InteriorManager

- **Status:** Accepted
- **Date:** 2026-06-26

## Context

The game has a "second layer" — interiors and sub-planes entered from the surface:
huts, dungeons, mazes, and (soon) frog pond passages. This layer is becoming the
**primary home for advanced content**, not a set of one-off side rooms. Dungeons are
simple today but are expected to grow more complicated; huts, mazes, and underground
layers will each need their own special scenarios; and near-term work adds frog-only
pond passages and rat polymorph/pet scenarios that also live on this layer.

Today each interior is its own system (`HutSystem`, `DungeonSystem`, `MazeSystem`)
that independently reimplements the same lifecycle: generate the interior, enter/exit,
freeze and thaw the surface room, reset on room/state transitions, expose the
"active source" of enemies/objects/bounds, dispatch SPACE, and render a
picture-in-picture overlay. The three are tied together by scattered
`inHut || inDungeon || inMaze` branching across `main.js` (resets, active-source
accessors, input dispatch, per-frame guards) — the exact layer-leak pattern
`PlaneSystem` was introduced to retire, and the source of past bugs (#107).

Two pressures force the decision now:

1. **The fourth copy is imminent.** Pond passages would be a fourth bespoke
   reimplementation of the same lifecycle. CLAUDE.md's "Interior System Pattern"
   already says that at the fourth interior we unify rather than copy again.
2. **Parity is the northstar.** The interiors are diverging in capability while the
   intent is the opposite: a PiP interior should be a *true* gameplay surface, at full
   parity with the overworld. There must be **no discernible difference in player
   behavior** between fighting/moving/interacting on the surface and doing so inside an
   interior. Per-system duplication makes parity something each interior re-earns by
   hand and silently loses; it should be guaranteed by construction.

## Decision

We will extract a single **`InteriorManager`** that owns the interior lifecycle, and
reduce each interior type to a **descriptor/strategy** plugged into it.

- The manager owns: `enter(interior)` / `exit()`, surface freeze/thaw (delegating to
  `PlaneSystem`), per-room/state reset, the active-source accessors
  (`activeRoom` / `_activeBackgroundObjects` / `activeEnemies` / `activeGridBounds`),
  entry-cooldown, and SPACE dispatch.
- Each interior (hut, dungeon, maze, pond, future rat/pet scenarios) supplies only
  what is genuinely its own: generation, viewport/grid dimensions, its overlay
  renderer, and its interaction handlers.
- The scattered `player.inHut` / `inDungeon` / `inMaze` flags collapse into a single
  `player.activeInteriorKind` (thin compatibility getters are acceptable to bound churn).
- **Full gameplay parity is a hard requirement of the manager**, not a per-interior
  feature: combat, movement, pickups, vision, and effects run through the same code
  paths and the same `PlaneSystem` predicate whether the player is on the surface or in
  an interior. New interiors inherit parity by default and must not be able to silently
  opt out of it.
- Hut/Dungeon/Maze migrate onto the manager with **no behavior change**; the migration
  is judged complete only when player-observable behavior is identical to today.

## Alternatives considered

- **Add `PondSystem` as a fourth bespoke system (status quo, extended).** Fastest path
  to frog passages, but it locks in the duplication permanently, adds a fourth branch to
  every `inHut || inDungeon || inMaze` site, and leaves parity as something each new
  interior reinvents. With rat/pet scenarios and richer dungeons coming, this multiplies
  the exact cost we are trying to retire. Rejected.
- **Generalize one existing system** (e.g. grow `HutSystem` into the host for all
  interiors). Avoids a new file but bends a system shaped around one interior's
  assumptions (sizing, decor, NPC spawns) to carry unrelated ones — the "parameterized
  hut sizing" and "multi-hut-per-room" strains already on the backlog show how that
  erodes. Rejected in favor of a purpose-built host.
- **Defer unification until more interiors exist.** The pressure is real but the cost of
  the refactor only grows as the second layer accumulates content, and the frog passages
  need a home now. Deferring means paying the fourth-copy tax and then unifying four
  systems instead of three. Rejected.

## Consequences

- **Easier:** adding an interior becomes writing a descriptor, not a system; gameplay
  parity is guaranteed centrally instead of re-earned per interior; freeze/thaw, reset,
  and active-source logic have one definition; the `inHut || inDungeon || inMaze`
  branching collapses, removing a recurring layer-leak bug surface.
- **Harder / costs accepted:** an upfront refactor of three working systems with the
  bar of *zero* behavior change — risk concentrated in code that currently works.
  The descriptor abstraction adds one layer of indirection over the simplest interior
  (a maze no longer has its lifecycle inline). Architecture budgets
  (`tools/arch-budgets.json`) must be re-baselined after extraction. The compatibility
  getters for the collapsed `in*` flags are interim debt to be removed once call sites
  migrate.
- **Northstar locked in:** "true PiP with full player gameplay parity, no discernible
  behavior difference" becomes an architectural invariant of the interior layer rather
  than an aspiration — future interiors (pond passages, rat polymorph/pet scenarios,
  deeper dungeons) build on it by default.
