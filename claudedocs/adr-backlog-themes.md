# ADR Backlog — Themes for Future Discussion

Captured 2026-09-20, reading `docs/adr/BACKLOG.md` in full (75 rows) while the reset-registry
migration (row 29) was mid-implementation. This is a synthesis for conversation, not a decision —
per CLAUDE.md, the *why* behind any of these is the user's to author. Purpose: don't lose the shape
of what's still open once the reset-registry work lands.

## The one already in motion

**Row 29 — run-scoped reset contract.** Being implemented now via `claudedocs/reset-registry-prd.md`
+ `claudedocs/reset-registry-plan.md`. Not discussed further here.

## Recurring cross-cutting questions (same question, asked by ≥3 unrelated rows)

**1. Derived vs. authored gates — the backlog's most repeated open question.**
Rows 38 (Fountain Attunement filters `WEAPON_TIERS` by run state), 66 (exit-letter *color* now
selects which Barricade family can spawn — an empty family, e.g. red, is silently barren), 67
(weapon-class vulnerability — should it become per-enemy data, or stay hardcoded conditionals),
69 (`homeZone.js` — item availability *computed* by walking spawn tables/affinities/rarity rather
than an authored unlock field). Every one of these asks the same thing in a different costume: when
a gate can be either *derived* from existing data (cheap, self-maintaining, invisible at the
call site) or *authored* explicitly (visible, maintainable, another field to keep in sync) — which
wins, and does the answer generalize or stay per-mechanic? Row 69 states the trade-off most
plainly. Worth a single ADR that all four rows cite, rather than four independent answers.

**2. Closed vocabulary + declared-variant, with an escape hatch that reopens the question of
closure.** Rows 40 (Enemy State spine — closed states, but a `flee` wildcard fallback now exists,
used twice), 41 (movement verbs), 42 (Recover's six variants), 43 (mechanic precedence), 54/57
(key items — closed `KEY_ITEM_DEFS` shape, then a universal any-lock key breaks the one-key-per-lock
model it generalizes), 66 (Barricade families). This is close to being the house style — closed
enumeration, per-entity data selects a variant, an explicit escape hatch for the case that doesn't
fit — but it has never been named or written down as a pattern, so each new instance re-derives it
from scratch and re-litigates whether the escape hatch is principled or a one-off. Candidate: name
it in CLAUDE.md once, stop treating each occurrence as a fresh decision.

**3. A bespoke mechanic graduates into general world vocabulary, informally.**
Rows 52 (Whip Trial's hook-pull generalizes onto ordinary Stump/Tree scenery — any room with one
near a gap now implicitly offers whip-traversal, unauthored), 55 (trigger machine reaches Barricades
as a second consumer; authoring didn't generalize with it — dungeon side is template JSON, Barricade
side is plain descriptor objects), 49-51 (Compass forks into three contexts — dungeon beep, Explore
arrow, dungeon-boss glint-pulse — none of which actually dispatch through the one `effect` field
meant to unify them). Same shape each time: a mechanic built for one room quietly becomes
load-bearing everywhere, and the glossary/authoring-contract catches up late or not at all. Worth
asking whether "graduation" should require a checklist (glossary entry + authoring contract updated
same-commit) rather than happening by accretion.

**4. What a recipe/inventory-slot "result" even is.**
Rows 39 (one ingredient pile, no banking step), 54 (key items with no `Item`/inventory-slot backing
at all — existence is a predicate function), 74 (golem companions as a recipe result that's a pure
sentinel, intercepted before ever becoming an `Item`). Three different departures from "recipe
result = something the player holds or equips," each solved locally. `check:data`'s recipe-resolves
gate can't tell a sentinel from a real item. No taxonomy exists for "kinds of thing a recipe can
produce" even though there are now at least three.

## The largest single cluster — boss-as-access-lock (rows 59-65, 2026-08-23 through 09-01)

Seven consecutive rows, all downstream of one ratified principle (`claudedocs/boss-design.md`):
**a Boss is a closed door with a visible lock, not an HP bar.** This is the closest thing in the
backlog to a settled cosmology-tier doctrine, but it has real unresolved edges that matter most
right now given the stated goal of reaching meaningful endings:

- Does "access, not attrition" bind on **every** required stage, or only bespoke zone Bosses? The
  depth-9 Minibosses and yellow's fallback boss are explicitly named as failing the test today.
- The Dungeon Boss tier (row 60) is a third tier being built now, templated on three soft register
  windows + a Game Changer — still asks whether each tier shares reward plumbing.
- Arena mutation (row 62, Frosted Maw's Freeze-Over) and sub-cell glyph pitch (row 65, Hoardmaw) are
  both asked as "general boss capability worth a shared substrate, or bespoke per-boss" — with more
  Dungeon Bosses about to be authored against whichever answer wins.
- The warband/Command roster (row 64) converges with the gilded-companion-escort row (61) on the
  same open question from two directions: do permanent combat-roster mechanics extend into interior
  spaces, and does that roster follow into dungeons.

This cluster is the one most worth a real ADR pass before more zone bosses/dungeon bosses get
built, since every new one is authored against whatever answer these rows land on by default.

## Canon-level and highest-priority-tag items

- **Row 63 (P1) — The Three room resolves two ways.** Settled by the author on 09-04 (power trio →
  north → Death; true 3 → liberates South of Rest), but the implementer's own two-level
  form-vs-identity judging split is flagged as still wanting ratification — the one place in the
  backlog where the *mechanism* under an author-stated *meaning* is explicitly unconfirmed.
- **Row 59 (P1)** and **Row 60 (P1)** — the boss doctrine and its Dungeon Boss extension — see cluster
  above.
- **Row 72 — Blue-zone access dropped to a 50/50 coin flip**, deliberately, with no backup guarantee.
  Small in code, large in player-facing consequence (a rarity axis on reaching a whole zone) — worth
  flagging precisely because it's easy to forget it was a deliberate trade, not an oversight, if a
  future session finds "some runs can't reach blue zone" and reads it as a bug.

## Smaller, concretely actionable pairs (good candidates for a quick decision, not a large ADR)

- **Rows 70 + 71 (both 2026-09-19)** — hazard-vs-invulnerability. Row 70 asks whether environmental
  hazards should be exempt from dodge-roll i-frames categorically (today: no exceptions anywhere).
  Row 71's deep-water drowning meter is the *first* hazard proposed to block dodge-roll activation
  outright rather than pierce it after the fact — the rows explicitly ask to be decided together
  rather than accumulating two independent answers to "what can a hazard do to dodge-roll." Also
  opens a third un-homed "what's an enemy immune to" axis alongside `data.resistance` and the
  weapon-class-vulnerability row (67).
- **Row 73** — enemy-wielded weapons never actually drive enemy attacks (`item_*` attackType is dead
  code). Two fix shapes named with genuinely different blast radii (visual-only glyph fix vs. a real
  balance change requiring simulator retuning) — low ambiguity, just needs a pick.
- **Row 75** — the Errand-hostile conversion + enemy dodge-chance pair, freshest rows (2026-09-20),
  already flagged by the user as newly surfaced (see recent commit `1b36b1e`).

## Glossary debt already accumulated (GLOSSARY.md entries named "pending" in the backlog itself)

Rows 38 (Attunement), 39 (Inventory), 55 (Puzzle Room / Switch / Panel / Trigger / Activation /
Neutralize / Gap / Torch / Hook Post), 59/60 (the three boss tiers still need names), 66 (Barricade /
Barricade Family). Several of these terms are already load-bearing in code and conversation despite
never being formally named — row 55 explicitly notes the debt "moves from pending to load-bearing"
once a mechanic gets a second unrelated consumer. Worth a single glossary-catchup pass rather than
letting each row's "(pending)" tag age further.

---

*Not covered here: rows that read as settled/narrow enough not to need a themed discussion (e.g.
53, 65's narrower sibling rows, 56-58's shop/key mechanics) — still individually available in
`docs/adr/BACKLOG.md` if one of them turns out to matter more than it looks.*
