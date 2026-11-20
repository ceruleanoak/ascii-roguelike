# Room Review Schematic

How an authored room or set piece gets designed, built and critiqued. Written from the Zenith (Z)
passes on 2026-11-20 so the same review can be run on any other room. The rules it checks are in
`set-dressing-rulebook.md`; this is the order to apply them in, and what to show at each step.

Run it for a new authored room, and again on an existing one the user calls ugly or flat.

## 0. Read first

- `zone-cosmology.md`: the zone's word and verb. The room has to belong to its zone.
- `set-dressing-rulebook.md`, all of §2 (Silhouette) and §6 (Glyphs and colour), plus the §10
  revision log for recent corrections.
- The room's GLOSSARY entries, if any.

## 1. Anatomy (S1, S3)

Name what the place really is and list its parts, each with its job. At least five. For the Zenith:
foot cliff (bounds the mountain), terrace (where the climb happens), upper cliff, summit floor,
steps (the only ways up), trail (the route), scree (ravine beds and fans), frost (the cold top),
cairn (where everything meets).

Write the real-world reference down: "a mountain seen from above, lopsided, peak off centre".

## 2. The authored map

Author the layout as an ASCII map in a data file (one character per cell, a legend in the header
comment), not as procedural code. Procedural outlines kept failing on the Zenith: radial and
distance-field versions came out clamped, lost a terrace, or left cliff islands. Hand-authored row
spans, checked by script, worked.

Check the map by script before looking at it in game (BFS from each exit):

- every station / key spot reachable from all four exits;
- the exit lanes stay clear;
- each level is entered only where it should be (the Zenith terrace only through the south steps);
- no key cell sits on a solid one.

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
  against reserved glyphs (G2): ingredient letters, crafted symbols, enemy chars.
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

Read every screenshot yourself before showing anything.

## 9. Reviewers

Two reviewer subagents in parallel, each given the screenshots and the map:

1. **Rules**: scores the room against the rulebook, rule by rule, with a pass/fail and the cell or
   line that decides it.
2. **Art and memorability**: what is the first read, what question does it raise (S6), what would
   a player remember about it a week later, and what looks generic.

Fix what they find, screenshot again, and repeat until neither has a fail that the user hasn't
already ruled on.

## 10. Close out

- Each user correction becomes a rule or amends one, plus a §10 revision-log row (P2).
- The room's §9 scorecard row is added or updated (P3).
- GLOSSARY entries describe what the room now does.
- The payoff (the Zenith's Gathering) is staged: you can see it coming before it happens, and the
  room keeps a mark of it afterwards (the gold cairn).
