# Room Review Schematic

How an authored room or set piece gets designed, built and critiqued. Written from the Zenith (Z)
passes on 2026-11-20, and extended for procedural dressing from the Yards and the Crossroads
(2026-11-21), so the same review can be run on any other room. The rules it checks are in
`set-dressing-rulebook.md`; this is the order to apply them in, and what to show at each step.

Run it for a new authored room, and again on an existing one the user calls ugly or flat.

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

## 3. Silhouette and perimeter (S2, S4, S8)

- The outline is not a ring, a rectangle or one edge offset from another (S2).
- The perimeter shows the terrain (S8): for each notch, say what runs into it (a ravine bed) and
  what spills out (a fan). Ridges run out from the high point.
- Walkable dressing past the edge carries the shape further without blocking the way (the Zenith's
  `ʷ` grass skirt, thinning with distance from the cliff).
- Solid-fill view: render every non-space cell one colour. Can you say what it is with the label
  hidden?

## 4. Positions (S7)

For every key placement, say why it stands there and not in its mirror spot. The Zenith's
stations follow the climb in zone order (Gold at the head of the south steps, Cyan on the summit),
so higher means further from home. "It balances the layout" is not a reason.

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

## 8. Look at it (P1)

Headless screenshots, one per state, with a `tools/debug/` script (deleted afterwards): warp in
with `g.stateMachine.transition('EXPLORE'); g.enterExploreState('north', { letter: 'Z' })`, after a
Vite transform that exposes the Game as `window.__game`. For the Zenith: standing below, standing
up (clouds), waiting (energy pulses), converging, gathered. Plus the solid-fill view.

For a feature that only some rolls produce (a pen, a ford, a given hut kind), re-roll the room in the
script until it appears, then take the close-up. Procedural rooms need one screenshot per zone at
least, plus a cell map (`char` per cell) saved beside each, so a reviewer can name cells.

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

Fix what they find, screenshot again, and repeat until neither has a fail that the user hasn't
already ruled on. Bugs they turn up that predate the work are logged in `known-bugs.md`, not fixed
silently or dropped.

## 10. Close out

- Each user correction becomes a rule or amends one, plus a §10 revision-log row (P2).
- The room's §9 scorecard row is added or updated (P3).
- New terms (Yard, Footpath, Commons) are proposed to the user, and get GLOSSARY entries once
  ratified.
- GLOSSARY entries describe what the room now does.
- The payoff (the Zenith's Gathering) is staged: you can see it coming before it happens, and the
  room keeps a mark of it afterwards (the gold cairn).
