# Room Review Schematic

How an authored room or set piece gets designed, built and critiqued. Written from the Zenith (Z)
passes on 2026-11-20, and extended for procedural dressing from the Yards and the Crossroads
(2026-11-21), so the same review can be run on any other room. The rules it checks are in
`set-dressing-rulebook.md`; this is the order to apply them in, and what to show at each step.

Run it for a new authored room, and again on an existing one the user calls ugly or flat.

It has three tracks. Most steps are shared; where a track differs, the step says so.

| Track | What | Lessons came from |
|-------|------|-------------------|
| Authored room | A letter room or set piece laid out from a map | The Zenith |
| Procedural dressing | A data table plus a placer, varying each run | The Yards, the Crossroads |
| Hut interior | The floor behind a hut door (`HutSystem.generateHutInterior`) | The Alchemy Lab, the Wise Fellow |

The interior track scores against §4 of the rulebook (I1-I4) as well as §2 and §6.

## 0. Read first

- `zone-cosmology.md`: the zone's word and verb. The room has to belong to its zone.
- `set-dressing-rulebook.md`, all of §2 (Silhouette) and §6 (Glyphs and colour), plus the §10
  revision log for recent corrections.
- The room's GLOSSARY entries, if any.
- `known-bugs.md`: bugs already logged against the room, so they aren't reported as new.
- The user's earlier rulings on this room or its parts. Every reviewer prompt lists them (§9).

## 1. Anatomy (S1, S3)

Name what the place really is and list its parts, each with its job. At least five. For the Zenith:
foot cliff (bounds the mountain), terrace (where the climb happens), upper cliff, summit floor,
steps (the only ways up), trail (the route), scree (ravine beds and fans), frost (the cold top),
cairn (where everything meets).

Write the real-world reference down: "a mountain seen from above, lopsided, peak off centre".

A part reads only in context: a palisade has to enclose something, a fence has to run along
something (a road, a yard, a field). Name what each part is next to, not only what it is.

Fences and other lines do a lot of work for little cost: a run of them turns empty floor into a
kept place. Look for a line first when a room reads as scattered.

**Hut interior.** Name what the occupant does in here, and list the parts by that work. For the
Alchemy Lab: water trough (water in), mud pit (mud in), cauldron (brew), condenser (distill), two
Empty Bottles (so a first visit can start). For the Wise Fellow: the shrine (what he keeps), the
flowers either side of it (tended), the raked sand (his practice), the aisle (the way to him).

- **The inside answers the Yard** (E5). The Yard is the tell from outside, the interior is what
  the tell was about: the Lab's spills outside come from the trough and cauldron inside; the
  Wise Fellow's stepping stones lead to his raked floor. Name the pairing for each Yard prop.
- **Count the interactions first** (I2: two separate objects, each with its own verb; an NPC
  counts once). A room that can't reach two is a design question for the user, not a dressing job.
- **Give every prop a provenance** (I4): who put it there and why, one line per cluster.

## 2. The authored map

Author the layout as an ASCII map in a data file (one character per cell, a legend in the header
comment), not as procedural code. Procedural outlines kept failing on the Zenith: radial and
distance-field versions came out clamped, lost a terrace, or left cliff islands. Hand-authored row
spans, checked by script, worked.

### Procedural dressing instead

Dressing that has to vary run to run (Yards, the Crossroads) is a data table plus a placer, not a
map: the table names each prop, its glyph and colour, and its offset from an anchor (a hut door,
the crossing); the placer (`YardPlacer`, `src/systems/yardDressing.js`) owns the rules every
placement obeys. It never fills water, never stands solid pieces in an exit lane, stops a fence
run at water or a wall, and keeps the room's exits reachable afterwards (`keepExitsReachable`).
New dressing reuses the placer rather than copying its rules.

- Variants of a shared element keep its rhythm and density, and change only the glyph. The Wise
  Fellow's stepping stones were first laid every other cell and stopped short, and read as no
  path at all.
- Any default side or direction with no stated reason is picked at random. Otherwise every room
  leans the same way.
- Where the scatter could hand the placer an obstacle (a pond, a river, lava), say what each part
  does when it meets one: a fence stops at the bank, a road fords and resumes on the far side.

Check the map by script before looking at it in game (BFS from each exit):

- every station / key spot reachable from all four exits;
- the exit lanes stay clear;
- each level is entered only where it should be (the Zenith terrace only through the south steps);
- no key cell sits on a solid one.

For procedural dressing, run the same check over 100 or more generated rooms across all four zones,
twice per room: with the dressing and without it. A room sealed both ways is a pre-existing bug
(log it); one sealed only with the dressing is the dressing's fault.

### Hut interior instead

A hut floor is small and fixed: 10×10 with an 8×8 walkable middle, the Shed 6×6, the Alchemy Lab
12×12 (`sizeOverride` in `HutSystem._enterHut`). `isHutFloor` stops at 12 columns; anything wider
renders and behaves as a dungeon floor, so a bigger room is a different decision. The exit door is
the middle of the south wall (`exitCol = floor(cols / 2)`), so the player always enters looking
north up the centre column.

- **Draw the layout as an ASCII map in the comment above its branch**, the way
  `SUMMONING_CIRCLE_CELLS` is, and place from offsets against that map rather than scattering
  `Math.random()` calls. Offsets are from the room's size (`cols`, `rows`), so a later size change
  doesn't strand a prop on a wall.
- **Opt out of the shared rolls.** Every hut rolls a Press, a Fireplace, 1-3 random decor glyphs
  (`n * 8 %`) and bread, each gated by its own `hutKind` list. A laid-out hut has to leave all four
  (the Wise Fellow does), or its composition gets a random prop dropped into it. A kind that keeps
  one on purpose (the Press hut's press and fireplace) says so in the branch comment.
- **Place fixed objects before the rolls**, so `cellOccupied()` keeps random items and NPCs off
  them. It also keeps a 2-cell radius clear round every NPC.
- **Reuse a world material for a station where one exists.** The Lab's mud pit is plain
  `mud_wet` terrain, so bottle filling, GETMUD and wading slow all work in it with nothing new
  wired. A new station kind is new code and a new verb to learn; a known material is neither.
- **Stations are found by glyph.** `AlchemySystem` finds the cauldron and condenser by `char`
  (`'Ω'`, `'Ψ'`). Grep a station's glyph before changing it, or its verb silently stops working.

Check the map by script, as above, from the exit door: every station and the NPC's talk range
reachable, the cells between the door and the first prop clear, nothing standing on the exit
lane. For a hut with any random roll left, run it over 100 generated floors.

## 3. Silhouette and perimeter (S2, S4, S8)

- The outline is not a ring, a rectangle or one edge offset from another (S2).
- The perimeter shows the terrain (S8): for each notch, say what runs into it (a ravine bed) and
  what spills out (a fan). Ridges run out from the high point.
- Walkable dressing past the edge carries the shape further without blocking the way (the Zenith's
  `ʷ` grass skirt, thinning with distance from the cliff).
- Solid-fill view: render every non-space cell one colour. Can you say what it is with the label
  hidden?

**Hut interior.** The hut overlay leaves the perimeter wall undrawn, so the outline is always the
picture-in-picture rectangle and S2/S8 have no edge to judge. Apply them to the composition
inside instead: solid-fill the props alone, and the shape they make (a shrine with an aisle up to
it, stations round a cauldron) should still say whose room it is. Full-width bands and mirror
pairs are the interior's boolean shapes: the Wise Fellow's two raked rows span wall to wall, and
the Lab's mud pit mirrors its trough. Each one needs the reason §4 asks for, or it fails.

## 4. Positions (S7)

For every key placement, say why it stands there and not in its mirror spot. The Zenith's
stations follow the climb in zone order (Gold at the head of the south steps, Cyan on the summit),
so higher means further from home. "It balances the layout" is not a reason.

**Hut interior.** The door fixes the first view: the player steps in on the centre column facing
north. The Wise Fellow's shrine stands on that axis because the room is about walking up to him; a
station in the far corner is found last, and that should be on purpose. Say what the player sees
from the door, and what they find second.

## 5. Glyphs and colour (§6)

- Make a glyph sheet: every glyph the room uses, at game size, on the zone's background. Grep it
  against reserved glyphs (G2): ingredient letters, crafted symbols, enemy chars, and the frames
  of animations (a cut-grass frame is reserved too).
- Check look-alikes, not only exact chars. Family and colour decide what a glyph reads as: a crate
  `⊠` next to the Chest `⊞`, an upward arrow read as a weapon, `|` as Tall Grass, anything round
  and orange as a coin.
- Measure every glyph's width in Unifont at game size (in a browser, not by guess). A wide glyph
  spills into its east neighbour, so the placer keeps that cell clear in both directions: no wide
  glyph beside a taken cell, nothing later dropped next to a wide one.
- A half-width glyph meant to join its neighbours (fence rails, palisade stakes) reads as dashes.
  Draw it as a customSprite (`src/rendering/sprites/customSprites.js`) that fills the cell.
- Lay out a value ramp: the low ground darkest, each level up a step lighter, the focus (cairn,
  stations) brightest. A dimmed colour must not land on another part's colour.
- Markers are glyphs, never boxes; solid art stays out of `collisionMap` (G6).
- Off states differ in shape (hollow vs filled), not only hue (G6).
- On is colour, off is the floor (G7): lit things are drawn in their colour when on and not drawn
  when off. Show motion with a short lit segment moving, not a whole lit run.
- Stepped alpha only, no strokes, no gradients (G5).

**Hut interior.**

- I1: at least 3 dressing glyphs the player can't name on sight. The Wise Fellow's `$ ✿ .` score
  0; every glyph is familiar.
- The hut overlay (`HutInteriorOverlay.js`, §4 of its render) draws each object with a plain
  `fillText`: no `customSprite`, no `fillCell`, no `coveredBy`. A half-width run (a rail, a
  counter, a bench) reads as dashes in a hut today. Either keep it out, or make the overlay honour
  `customSprite` first, as its own change.
- The panel is `#111108`, so dark dressing vanishes. Make the glyph sheet on that colour.
- Interactive stations are the brightest things in the room (G4): the Lab's cauldron is white.
- Existing station glyphs `Ω Ψ Π` are G2 debt (§6 of the rulebook). Don't copy them for a new
  station.

## 6. Layers and height (S9)

If the room has levels, the higher one reads as high by what falls away below it once the player
is up there: the Zenith sinks the low ground under the shared mist motes
(`src/rendering/effects/MistMotes.js`) through its own Frame Pass, thin at the cliff foot and
thicker further out, easing in and out over under a second. Find the upper level by flood fill
from the room's edge through everything but cliffs and steps, rather than listing cells by hand.

## 7. Wiring checks

- Every cell the authored art covers is protected from the room's random dressing (`protectRegion`
  with a halo).
- Anything drawn where the player can be is a Frame Pass (`npm run check:frames`).
- Room state lives on the Room; run state goes in the Reset Registry
  (`node tools/check-reset-parity.mjs`).

**Hut interior.**

- The floor is generated once per room visit and cached on the hut (`hut.interiorState`), so
  broken props and spent stations stay. Anything that should change between visits (whether the
  Alchemist is home) is synced on entry, the way `_syncAlchemistHutPresence` does, not by
  regenerating the floor.
- Items the floor is seeded with (the Lab's two bottles) stay inside on exit
  (`_seededFloorItems`); anything else on the floor goes out of the door with the player. A
  seeded item has to be pushed through the same `breadItems` list to be counted as seeded.
- Nothing is drawn over the interior to explain it. The Lab's Bottle Shelf, a row of the carried
  Bottles above the panel, was removed as confusing (2026-10-31); the TAB Bottles column is the one
  place they show. Popups follow the non-instructive rule in `CLAUDE.md`.

## 8. Look at it (P1)

Headless screenshots, one per state, with a `tools/debug/` script (deleted afterwards): warp in
with `g.stateMachine.transition('EXPLORE'); g.enterExploreState('north', { letter: 'Z' })`, after a
Vite transform that exposes the Game as `window.__game`. For the Zenith: standing below, standing
up (clouds), waiting (energy pulses), converging, gathered. Plus the solid-fill view.

For a feature that only some rolls produce (a pen, a ford, a given hut kind), re-roll the room in the
script until it appears, then take the close-up. Procedural rooms need one screenshot per zone at
least, plus a cell map (`char` per cell) saved beside each, so a reviewer can name cells.

For a hut interior, warp to a room that holds the kind (an S room for a Settlement-only kind like
the Alchemy Lab, else H; re-roll until `g.hutSystem.roomHuts()` has it), then go in with
`g.hutSystem.enterHut(hut)`. Clear `hut.interiorState` to re-roll the floor. Shots: the first
step through the door, each station in use, the NPC home and away where that varies, plus the
solid fill of the props and a cell map. Show the matching Yard beside it so the pairing in §1 can
be checked.

Read every screenshot yourself before showing anything. Check each code comment's stated reason
against what the screenshot shows ("faces the lane", "thins out"): a comment the picture
contradicts is a finding.

## 9. Reviewers

Two reviewer subagents in parallel, each given the screenshots, the cell maps, and the user's
earlier rulings (so they don't reopen a settled question):

1. **Rules**: scores the room against the rulebook, rule by rule, with a pass/fail and the cell or
   line that decides it.
2. **Art and memorability**: what is the first read, what question does it raise (S6), what would
   a player remember about it a week later, and what looks generic.

For a hut interior the Rules reviewer scores I1-I4 with the counts, and the Art reviewer says
whether the inside answers the Yard.

Fix what they find, screenshot again, and repeat until neither has a fail that the user hasn't
already ruled on. Bugs they turn up that predate the work are logged in `known-bugs.md`, not fixed
silently or dropped.

## 10. Close out

- Each user correction becomes a rule or amends one, plus a §10 revision-log row (P2).
- The room's §9 scorecard row is added or updated (P3); a hut interior's goes in the Interiors
  table with its I1 glyph count and I2 object count.
- New terms (Yard, Footpath, Commons) are proposed to the user, and get GLOSSARY entries once
  ratified.
- GLOSSARY entries describe what the room now does.
- The payoff (the Zenith's Gathering) is staged: you can see it coming before it happens, and the
  room keeps a mark of it afterwards (the gold cairn).
