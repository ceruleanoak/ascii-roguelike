# Set Dressing Rulebook

Rulebook, 2026-11-01. **Status: first draft. Rules marked Ratified are the user's own words;
Provisional rules are derived and wait for the user's correction.** This document is meant to
change: see P2 and §10.

Scope: the Exterior of every building, and the Set Dressing of neutral rooms, huts and dungeons
(`GLOSSARY.md`). The goal is new art that starts close to the bar, so it stops needing several
rounds of instruction to get there.

Each rule is stated as a test that can be checked. Where a threshold is a number, it is
Provisional even if the rule around it is Ratified.

---

## 1. The bar

The user's brief, 2026-11-01:

> Rooms have been "very barebones and poor artistic quality... uninteresting and unmemorable."

> "the exterior of every building should have distinct and interesting qualities."

> "interiors should have creative use of ascii and unicode to spark the imagination, since every
> unrecognizable glyph dares interpretation."

> "boolean shapes are the opposite of quality... It meets the criteria of 'ship shaped' but looks
> nothing like a real ship at scale, missing any kind of consideration for the real skeleton of a
> ship and its individual component contributions to the silhouette. Silhouette itself is the
> quality we are speaking of, one of the most important quality components in videogames,
> readability yes but with interest."

Three separate goals follow, and a space can meet one and miss another:

| Goal | Meaning | Applies to | Best example | What it still lacks |
|------|---------|------------|--------------|---------------------|
| Silhouette | The shape reads, and is interesting | Everything | Hoardmaw, Witch's Hut exterior | Both took heavy instruction and several rounds |
| Imagination | Glyphs the player has to interpret | Interiors | Tea Party clutter | Wise Fellow's room is a good foundation that doesn't reach this |
| Interaction | At least two things to do | Huts and neutral rooms | Alchemy Lab, then the shop to a lesser degree | Not required of Exteriors |

Dungeons sit at "a near-ideal tier, though they are still fairly symmetrical" and need "a final
level of polish to feel lived in." That polish is §5. Their skeletons are not the problem.

**Bad example:** the Sunken Ship. It is "ship shaped" and nothing more (§8).

---

## 2. Silhouette (every space)

Silhouette is the outline left when every cell of a thing is one flat colour.

| # | Rule | Test | Status | Source |
|---|------|------|--------|--------|
| S1 | **Anatomy first.** Name the real parts and what each does before placing a cell. | The commit or plan lists at least 5 real components with their function. "Roof, walls, door" is three, and describes every building. | Ratified; the count is Provisional | "the real skeleton of a ship" |
| S2 | **No boolean shapes.** An outline is not a filled primitive, a union of primitives, or one edge offset from another. | Measure the top and bottom edges column by column. If the distance between them is near constant, or both are the same function, it fails. | Ratified | Sunken Ship: `deckRow`/`keelRow` (`src/systems/SunkenShipSystem.js:46-47`) are one step function offset 8 rows, so depth is only ever 7 or 8 |
| S3 | **Real proportions.** Ratios come from the real object, not from the space available. | Name the reference ratio, or say which constraint overrides it and why. | Ratified | "looks nothing like a real ship at scale" |
| S4 | **Solid-fill test.** The thing stays identifiable with every cell filled one colour, and stays distinct from its neighbours. | Render a solid-fill view. Hide the label: can you say what it is? | Provisional | The 5×5 hut stamp fails; Witch's legs pass |
| S5 | **Component contribution.** Every named part earns its place in the outline. | Remove each component in turn. Each removal must change the outline. A part that doesn't is detail: keep it only if §4 or §6 wants it, and don't count it for S1. | Ratified | "individual component contributions to the silhouette" |
| S6 | **Readable, with interest.** Reads at a glance, and holds one thing that raises a question. | Name the first read and the question separately. If there's no question, it's only legible. | Ratified | "readability yes but with interest" |
| S7 | **Positions tell the story.** Where each key thing stands follows from the space's own logic (a climb, a current, a hierarchy), not from even spacing or symmetry round a centre. | For every key placement, say why it stands *there* and not in its mirror spot. "It balances the layout" is not an answer. | Provisional | Zenith: "put some real appeal effort into the positions for memorability" |
| S8 | **The perimeter carries the terrain.** An outline's edge shows the forces that made it: a mountain's foot is ridges and ravines, not a smooth ring. Each notch has a reason inside (a ravine bed running up the slope) and a consequence outside (a fan spilled below it). Walkable dressing past the edge (grass, scree) can carry the shape further without blocking the way. | Walk the outline: count the notches and spurs, and for each say what runs into it and what spills out. A ring whose radius barely changes fails S2 as well. | Provisional | Zenith, 2026-11-20: "the topology doesn't look organic enough… perimeters of the base [should] imply furrows"; "use the green grass pattern… around the base… without restricting player movement" |
| S9 | **Height reads by what falls away.** A raised level shows its height by sinking what lies below it once the player is up there (mist, a veil), not by drawing the high part brighter. The lower ground thins in first at the cliff foot, so the cliffs rise out of it. The reverse holds from below: the top is unseen (not drawn, whoever stands on it included), and only the cliff face that fronts you shows. | Screenshot from each level: from above, the low ground reads as far below; from below, nothing inside the cliff shows. | Provisional | Zenith, 2026-11-20: "use render layers so that the top half of the mountain is surrounded by fog (re-use mist)"; "the inside of the mountain… should be black/not rendered (including player characters) when the player is in layer 0" |
| S10 | **A variant keeps the rhythm.** A variant of a shared element (one kind's Footpath, one zone's fence) changes the glyph or the colour, never the spacing or the density. Thinner or sparser reads as a different thing, or as nothing. | Put the variant beside the plain one: same spacing, same length, same fade? | Ratified | The user, 2026-11-21, on the Wise Fellow's stepping stones laid every other cell: "too spread out. Make it just as frequent as the others." |
| S11 | **Lines make a place.** A fence, rail, road or wall run turns open floor into a kept place for a handful of cells. Reach for a line before adding more scattered props, and give it something to run along or enclose (a road, a yard, a field). | Does the room have a line? Name what each line runs along or encloses. | Ratified | The user, 2026-11-21: "Fences do a lot of work, so use them more, and add them to crossroads (X room)" |

---

## 3. Exteriors

| # | Rule | Test | Status | Source |
|---|------|------|--------|--------|
| E1 | **No two building kinds share an outline.** | Compare solid-fill views of all kinds. A sign, a colour or a letter is not a difference. | Ratified | "the exterior of every building should have distinct and interesting qualities"; `stampHutFootprint` (`src/systems/roomFeatures.js:1517`) gives every hut kind one 5×5 stamp |
| E2 | **The occupant shows.** The building has at least one feature only this occupant would have. | Name who lives here from the feature alone. | Provisional | Witch's legs |
| E3 | **The door stays findable.** However strange the building, its entrance reads as one. | Find the door in a screenshot without being told. Deliberately hidden entries are named here: Cavern (behind a Bombable Rock). | Provisional | Dungeon faces keep `∩` |
| E4 | **Exteriors have no interaction minimum.** | Nothing to test. This stops I2 being applied here. | Ratified | The user's brief |
| E5 | **A Yard teaches what a sign says.** A building kind's Yard props stand outside it wherever it appears, signed or not. In a Settlement the sign is the quick read and the Yard sits beside it; a lone Hut has no sign, so it is read from its Yard alone. A kind may be bare on purpose (the Errand hut). | Name each lone Hut's occupant from its Yard. Its props in an H room are a subset of the same kind's props in an S room. | Ratified | The user, 2026-11-21: "In Settlement, we have letters as quick reads, but including the tells teaches for H room. So keep."; the Errand hut "bare on purpose" |

---

## 4. Interiors

"Interior" here means the player-facing idea of a space inside or apart: huts and neutral rooms.
Where it matters, the glossary's Interior and Neutral Room senses stay separate.

| # | Rule | Test | Status | Source |
|---|------|------|--------|--------|
| I1 | **Glyphs that dare interpretation.** A room carries glyphs the player can't name on sight. | Count distinct dressing glyphs that are not a letter, digit, keyboard symbol or a symbol with an everyday meaning (`$`, `✿`, `♥`). Minimum 3. | Ratified; the count is Provisional | "every unrecognizable glyph dares interpretation"; Wise Fellow's `$ ✿ .` score 0 |
| I2 | **At least two interactions.** Two separate objects in the room, each with its own verb. | Count objects, not menu options. One-shot floor items and random rolls don't count. NPCs count as one object. | Ratified | Alchemy Lab. Ruling, 2026-11-01: menu branches on one object count once |
| I3 | **Composed, not scattered.** Dressing is placed in relation to something. | For each prop, name what it's next to and why. The shared random decor (`HutSystem.js:232`, `_addDecor`) doesn't count. | Provisional | Wise Fellow's raked floor is composed; `['n','*','8','%']` is not |
| I4 | **Provenance.** Every prop answers "who put this here, and why?" | Answer it in one line for each cluster. | Provisional | Tea Party clutter belongs to the table |

**I2 exemptions.** The minimum applies to huts and neutral rooms. Dungeon floors are exempt. Other
exemptions are named here with a reason and are **proposed until the user confirms them**:

| Space | Interactions | Proposed reason |
|-------|--------------|-----------------|
| Enemy hut | 0 | The fight is the room |
| Graveyard | 0 | It's the curse's tally room |
| Sunken Hold | 1 | `interactionsOff` is deliberate |
| Draw Room | 1 | The canvas is the idea |

---

## 5. Dungeons

| # | Rule | Test | Status | Source |
|---|------|------|--------|--------|
| D1 | **Keep the skeleton.** Polish is a wear layer over a hand-crafted floor, not a redesign. | The diff changes no floor template's walls. | Ratified | "near-ideal tier" |
| D2 | **Break visible symmetry without moving walls.** | Flip the floor left-right. At most half the dressing cells may have a mirror twin. | Ratified; the threshold is Provisional | "still fairly symmetrical"; most floors measure 91-100% left-right (§9) |
| D3 | **Dressing never changes the puzzle.** | Paths, sight of puzzle signals and the Progression Solver's result are unchanged. Dressing is walkable or sits on already-solid cells. | Provisional | `_addDecor` scatters solid Rock today |
| D4 | **Evidence of who lived here.** Wear comes in clusters tied to the zone and to something that happened. | Each cluster answers I4. A uniform sprinkle fails. | Ratified | "feel lived in" |

---

## 6. Glyphs and colour

| # | Rule | Test | Status | Source |
|---|------|------|--------|--------|
| G1 | **All of the BMP is open to dressing**, apart from G2 and the no-emoji rule. Box drawing is allowed. | Code point is at or below U+FFFF and not emoji. | Provisional | Replaces the "printable ASCII" line in `CLAUDE.md` for Background Objects |
| G2 | **Reserved glyphs stay out**, so dressing never reads as a pickup or a cipher: Greek (Spectacles cipher), allocated Phoenician, ingredient letters and digits, crafted item glyphs. | `git grep` the glyph in `src/data/` and `src/game/GameConfig.js`. | Provisional | Existing debt, flagged and not to be copied: `Π` `Ω` `Ψ` `χ` |
| G3 | **Verify every new glyph in game.** Unifont is BMP-only, and glyph width varies. | Render it. Check for tofu, and check the advance (table below). | Provisional | Advance measured with canvas `measureText` at 16px |
| G4 | **Every glyph has a chosen colour, and interactive objects outrank dressing in brightness.** | No dressing cell at the `#888888` fallback (`src/entities/BackgroundObject.js:65`). Squint: the interactive thing is the brightest. | Provisional | Bug #517 |
| G5 | **No strokes, no alpha gradients.** | Existing rules: strokes smear pixel fonts, and alpha is quantized to 10% steps. Use stepped bands. | Ratified | Bug #472 |
| G6 | **Markers are glyphs, never boxes.** Code-drawn floor markers, zones and outlines are made of glyphs, not `fillRect`/`strokeRect` squares; a solid object's cell stays out of `collisionMap`, which paints a grey square behind the glyph. A "missing" or "off" state differs in shape (hollow vs filled), not only by a darker hue. | `grep -n "fillRect\|strokeRect" ` the feature's draw file. Render it: no square reads under or round a glyph. | Provisional | Zenith: "ugly and breaks design rules such as using bordered boxes" |
| G7 | **On is colour, off is the floor.** Something that lights (energy on a line, a powered marker) is drawn in its colour when on, and not drawn at all when off. Never show "on" as white or a tint over an already coloured glyph: at 16px the difference doesn't read. Show motion by moving a short lit segment, not by lighting the whole run. | Screenshot the on and off frames side by side at game scale: each lit glyph must be obvious at a glance. | Provisional | Zenith, 2026-11-20: "The 'white on color' approach is not clearly visible, better to simply use off (black as-is) and on (character color), no need to have the whole line filled" |

**Glyph width.** This is a width list, not a free list: run G2 on anything you take from it.

| Advance | Glyphs |
|---------|--------|
| 8px, half cell | `= _ - \| / \ ( ) ≡ ═ ─ ━ │ ║ ╱ ╲ ╳ ╭ ╮ ╰ ╯ ░ ▒ ▓ █ ▀ ▄ ▌ ▐ ▚ ▞ ◣ ◢ ◤ ◥ ⌒ ‿ ∩ ∪ ⊓ ⊔ ⌂ ⣿ ⠿ ⢸ ⡇ ⊞ ⊟ ⊠ ⌗ ⌘ ⍟ ⏚ ⧖ † ‡ ¦ ⁂ ※ ⸸ ᚼ ᛏ ⵔ` |
| 16px, full cell | `☷ ⫽ ⫻ ⎔ ⏛ ⨳ ⩩ ⫴ ꘏ 〓 ㅁ ⼁` |

Half-width glyphs leave a gap between cells, so a wall of them reads as dots. Two fixes exist, and
each works in only one renderer:

- `fillCell` draws a solid cell, but only `ExploreRenderer.js:246` honours it. `NeutralRenderer`
  doesn't.
- `coveredBy` is honoured only by `NeutralRenderer`.
- A `customSprite` (`src/rendering/sprites/customSprites.js`) draws the piece as filled rects
  that span the cell and meet its neighbours. Use it for a run that must read as one thing, such
  as a fence or palisade (`fenceSprite.js`). The glyph stays as the object's `char` for anything
  that reads it.

`☰` is full width too, but it's the Sandwich, so G2 rules it out.

**Dressing glyphs.** Every glyph authored dressing uses, so a new room can see what is taken
before it `git grep`s (G2) and can pair with a Yard on purpose (E5). The source table is the
truth; this index follows it. A room that adds props adds its rows in the same commit, as it
adds its scorecard row. Advance measured in Unifont at 16px (G3). Headless screenshots fall back
to system fonts unless the Unifont face is loaded by hand (`new FontFace(...)` from the
cdnfonts woff); check `measureText` returns 8 or 16 before trusting a screenshot.

| Glyph | Px | Depicts | Where (source) |
|-------|----|---------|----------------|
| `≣` | 8 | woodpile | Yards (`YARD_PROPS`, `src/data/yards.js`) |
| `⊼` | 8 | splitting block | Yards |
| `∴` | 8 | scuffed earth | Yards |
| `∘` | 8 | spill, stain | Yards (stains); Alchemy Lab (spills to the door, `LAB_PROPS`, `src/data/alchemyLab.js`) |
| `⸪` | 8 | glass shards | Yards; Alchemy Lab (a blown flask by the still) |
| `Ʊ` | 8 | bucket | Yards |
| `◌` | 8 | stepping stone | Yards |
| `⍊` | 8 | standing stone | Yards |
| `⌗` | 8 | net | Yards |
| `◠` | 8 | upturned boat | Yards |
| `╱` | 8 | oar | Yards |
| `⦾` | 16 | archery target | Yards |
| `ǁ` | 8 | target post | Yards |
| `ǂ` | 8 | weapon rack | Yards |
| `⏚` | 8 | blade in the ground | Yards |
| `▯` | 8 | crate | Yards |
| `⁚` | 8 | track | Yards |
| `⁞` | 8 | grass tuft | Yards |
| `⫽` | 16 | claw marks | Yards |
| `⁙` | 8 | scraps | Yards; Crossroads post |
| `ᚼ` | 8 | rune | Yards |
| `⸙` | 8 | sprout, herbs | Yards (crop); Alchemy Lab (herbs drying on the east wall) |
| `⊺` | 8 | fishing rod | Yards |
| `∷` | 8 | cinders | Yards |
| `⍙` | 8 | lantern | Yards |
| `╥ ─ │` | 8 | fence post and rails (customSprite) | Yards |
| `⍿` | 8 | palisade stake (customSprite) | Yards |
| `·` | 8 | footpath | Yards |
| `⍜ ⌸ ⍓ ⌺` | 8 | shelved jars | Alchemy Lab, north wall |
| `ꙮ` | 16 | jar of eyes | Alchemy Lab, north wall |
| `⍡` | 8 | pump | Alchemy Lab, west wall |
| `⁝` | 8 | overflow runnel | Alchemy Lab |
| `⁕` | 8 | fire spark | Alchemy Lab, beside the cauldron |
| `─ │ ┘` | 8 | vapour pipe (customSprite `pipeH`/`pipeV`/`pipeElbowWN`) | Alchemy Lab |
| `⧙` | 8 | condenser worm | Alchemy Lab |
| `⍥` | 8 | drip flask | Alchemy Lab |
| `⩌` | 16 | mortar | Alchemy Lab |

---

## 7. Process

| # | Rule | Test | Status |
|---|------|------|--------|
| P1 | **Look before calling it done.** | A cell dump or screenshot exists, with a solid-fill view for anything S4 applies to. | Provisional |
| P2 | **Corrections become rules.** When the user corrects art, the same session adds or amends a rule here, with the date and example. A repeated correction promotes the rule to Ratified. | §10 has an entry for every art correction. | Provisional |
| P3 | **New space, new scorecard row.** | A commit adding a building or room touches §9. | Provisional |
| P4 | **Authored rooms go through the room review.** An authored letter room, set piece, procedural dressing or hut interior follows `claudedocs/room-review-schematic.md`, from anatomy to screenshots and reviewers, on the track that fits. | The commit's message or plan names which steps it ran. | Provisional |

---

## 8. Worked example: Sunken Ship

**Draft for user critique. Nothing here is in the game.** `=` below stands in for full-width `〓`,
which breaks monospace alignment in Markdown. `:` is hold water. Rows 4-24 of the 30×30 room.

Current (`src/systems/SunkenShipSystem.js`):

```
#....~~~~~~~~~~~~~~~~~~~~~~~~#
#....~~~~~~~~~~~~~~~~~~~~~~~~#
#....~~~~~~~~~~~~~~~|~~~~~~~~#
#....~~~~~~~~~~~~~~~|~~/~~~~~#
#....~~~~~~~~~~~~~~~|~/~~~~~~#
#....~~~~~~~~~~~~~~~|~=====~~#
#....~~~~~~~~~~~~=====::::)~~#
#....~~~~~~~=~~==:::::::::)~~#
#....~~~====::::::::::::::)~~#
#....~~~(:::::::::::::::::)~~#
#....~~~(:::::::::::::::::)~~#
#....~~~(:::::::::::::::::)~~#
#....~~~(:::::::::::::::::)~~#
#....~~~(::::::::::::_____/~~#
#....~~~(:::::::_____~~~~~~~~#
#....~~~(::_____~~~~~~~~~~~~~#
#....~~~\__~~~~~~~~~~~~~~~~~~#
#....~~~~~~~~~~~~~~~~~~~~~~~~#
#....~~~~~~~~~~~~~~~~~~~~~~~~#
#....~~~~~~~~~~~~~~~~~~~~~~~~#
#....~~~~~~~~~~~~~~~~~~~~~~~~#
```

Redraw:

```
#....~~~~~~~~~~~~~~~~~~~~~~~~#
#....~~~~~~~~~~~~~|~~~~~~~~~~#
#....~~~~~~~~~~~~~|\~~~~~~~~~#
#....~~~~~~~~~────|─\~~~~~~~~#
#....~~~~~/~~~~~~~|~~\~~|~~~~#
#....~~~~~~|~~~~~~~|~\~~|~~~/#
#....~~~~~~|~~~~~~~|~~\~|~//~#
#....~~~~~~~|~~~~~~|~~~===)~~#
#....~~====\|~~~~~~|~~=:::)~~#
#....~~(::::==\~~~~|~/::::)~~#
#....~~(:::::::=~~~==:::::)~~#
#....~~~\::::::::::::::::/~~~#
#....~~~\:::::::::::::::/~~~~#
#....~~~|\:::::::::::::/~~~~~#
#....~~~|\::::::::::::/~~~~~~#
#....~~~|~\:::::::====~~~~~~~#
#....~~~~~~=======~~~~~~~~~~~#
#....~~~~~~~~~~~~~~~~~~~~~~~~#
#....~~~~~~~~~~~~~~~~~~~~~~~~#
#....~~~~~~~~~~~~~~~~~~~~~~~~#
#....~~~~~~~~~~~~~~~~~~~~~~~~#
```

**Anatomy (S1), and what each part does:**

| Part | Cells on the outline | Job |
|------|----------------------|-----|
| Keel | 15 | Spine. Flat amidships, rising to the bow |
| Stem | 4 | Curves the bow up to the foc'sle |
| Sternpost | 4 | Rakes the stern down to the rudder |
| Transom | 2 | Flat back of the stern |
| Rudder | 3 | Hangs off the sternpost, under the waterline |
| Poop | 5 | Highest aft deck |
| Quarterdeck | 2 | The step down from the poop |
| Waist | 2 | Low middle deck, where the breach is |
| Foc'sle | 2 | Raised forward deck |
| Bowsprit | 3 | Projects past the bow |
| Mainmast | 8 | Tallest vertical, with a list |
| Main yard | 5 | Crossing spar, the strongest "ship" read |
| Shrouds | 3 | Stay running from mast to bow |
| Mizzen | 4, plus 1 for the snapped top | Broken, with the top drifting clear |
| Foremast | 3 | A stump |

**Against the rules:**

| Rule | Current | Redraw |
|------|---------|--------|
| S1 | Hull, mast and a spar | 15 named parts |
| S2 | Depth is 7 or 8 at every hull column | Depth runs 4-8 over cols 9-25 and is 0 through the breach; deck and keel are different profiles |
| S3 | No sheer, no rake | Sheer, stem rake and a 1-in-5 list. Length to depth is about 2.5:1, stubbier than a real ship, because the room is 30 cells and the beach and south lane are kept |
| S4 | A parallelogram with a stick on it | Reads as a wrecked sailing ship in solid fill |
| S5 | Removing the mast changes the outline; nothing else exists to remove | Every part above changes the outline by at least 1 cell |
| S6 | Reads, raises no question | Question: the snapped mizzen top and the hole in the waist, which ask what hit it |

**Mechanics kept** (checked by script on the grid above): 30×30; 86 hold cells, all reachable from
the beach through the breach at cols 16-18, row 14; at least 7 glint cells (the code asks for 7);
the south lane at cols 14-16, rows 21-28 is clear.

**Known limits of this draft:**

- Half-width `( ) / \ |` hull sides are faint next to `〓`, so the solid-fill view flatters the
  outline more than the glyph view does. This is the same `fillCell`/`NeutralRenderer` gap as §6.
- Masts and rigging are assumed to be non-solid dressing. Today every `ship_hull` cell is solid.
- The redraw needs per-cell authored glyphs, which is the format question in `docs/adr/BACKLOG.md`.

---

## 9. Scorecard

Scored 2026-11-01 from code and cell dumps. Exterior E2 rescored 2026-11-21 for the Yards
(`src/data/yards.js`), from H and S room screenshots and a Rules and Art review. **Pass**, **Part**, **Fail**; a dash means not
applicable. The I2 number counts separate interactive objects.

**Exteriors**

| Building | Outline | E1 | E2 | E3 | Note |
|----------|---------|----|----|----|------|
| Shop | 5×5 stamp | Fail | Part | Pass | Yard: delivery crates `▯` on one side. Reads as storage, not yet as a shop |
| Alchemy Lab | 5×5 stamp | Fail | Pass | Pass | Yard: coloured spills `∘` down from the door, shards, a rinse bucket |
| Press hut | 5×5 stamp | Fail | Pass | Pass | Yard: woodpile `≣` off the west wall, splitting block `⊼` |
| Wise Fellow | 5×5 stamp | Fail | Pass | Pass | Yard: stepping-stone Footpath `◌` with a standing stone `⍊` beside it |
| Fisherman | 5×5 stamp | Fail | Part | Pass | Yard: nets `⌗`; the boat `◠◠` only beside water. Dry rooms get an oar, which is weak |
| Weapons Master | 5×5 stamp | Fail | Pass | Pass | Yard: target `⦾` and practice post `ǁ` on one row off the door step |
| Errand hut | 5×5 stamp | Fail | Exempt | Pass | Bare on purpose (user, 2026-11-21) |
| Wizard | 5×5 stamp | Fail | Pass | Pass | Yard: a ring of runes `ᚼ` round an empty centre |
| Enemy hut | 5×5 stamp | Fail | Pass | Pass | Yard: claw marks `⫽` trailing off from the door, a ruined Footpath |
| Witch | Stamp on legs (`ⲗ`) | Part | Pass | Pass | Only outline that differs by occupant. Its Yard is one heap of scraps; the legs carry E2 |
| Shed | 3×3 with `▄` | Part | Part | Pass | Differs by size, not by anatomy. Yard: cart tracks `⁚`; in a Settlement, grown over `⁞` |
| Maze | 19×19 `≡` box | Part | Fail | Pass | A box; the mini-maze is `#3a2255`/`#1a0f2e` decoration |
| Dungeons (5 zones) | Authored per-zone face | Pass | Pass | Pass | Best tier. All 80 ornament cells render gray: bug #517 |
| Cavern | Natural rock cluster | Pass | Part | Exempt | The hidden door is the point |

Not scored: the Aquifer has no building (its entrance is a Whirlpool in the Quagmire). The Jeweler
and Dragon Forge have no building. The Well, Fountain and Vault aren't entered.

**Authored letter rooms**

| Room | S1 | S2 | S4 | S6 | S7 | G4 | Note |
|------|----|----|----|----|----|----|------|
| Zenith (Z) | Pass | Pass | Part | Part | Pass | Pass | Summit map in `src/data/zenithSummit.js`: foot cliff with ridges and ravines (scree beds, fans), upper cliff, steps, trail, frost, cairn, a grass skirt below the foot (S8). Stations climb from the head of the south steps to the summit in zone order; clouds sink the low ground once the player is up (S9). S4 still Part: the solid fill reads as a furrowed massif, but its two levels only separate in game, by the clouds |
| Crossroads (X) | Pass | Part | Part | Part | Pass | Pass | Procedural (`src/systems/crossroadsDressing.js`), reviewed 2026-11-21. Parts: roads from every exit, a main road worn into two ruts, a crossing trodden wide and set off centre, fenced fields (two sides along the roads, a short return, a gate on the road side) holding crops, tufts or worked earth with a bucket, and a lone post at the crossing with scraps at its foot. S2/S4: every field is the same L-and-return shape. S6: the post and scraps are a small question; what they answer is still open. 3 of 100 green rooms have an exit sealed by the scatter alone (#593) |

**Interiors**

| Space | I1 | I2 | I3 | Note |
|-------|----|----|----|------|
| Alchemy Lab | Pass, 13 | 5, Pass | Pass | Authored map (`src/data/alchemyLab.js`), reviewed 2026-11-21: a wet west side (pump, trough, runnel, mud pit) and a hot east side (pipe, condenser, worm, flask, shards, mortar, herbs), the cauldron between them on the door axis. S6: the jar of eyes. E5: spills and shards answer the Yard, a shade darker indoors. The trough stays a 2×2 block (S2 Part): every rule that names it, poisoning among them, counts four cells |
| Press hut | Fail | 2, Pass | Fail | Press and Fireplace, both guaranteed |
| Three Room | Fail | 2, Pass | Pass | Slots and door |
| Shop | Fail | 1, or 2 with the Jeweler | Part | Conditional. The Counter is inert |
| Wise Fellow | Fail, 0 | 1, Fail | Pass | Shrine only glows. Composed, but every glyph is familiar |
| Tea Party | Pass | 1, Fail | Pass | `◑ ◎ ✧ ⊔`. Hatter counts; the potion is a floor item and the table is inert |
| Leshy Grove | Fail | 1, Fail | Pass | About 94 props, but `Y % n + * ŋ` are the stock set. One interaction kind: 9 grass clusters |
| Sunken Ship | Fail | 1, Fail | Part | 7 glints, one kind |
| Oasis | Fail | 1, Fail | Part | Fairies. The consumable is a floor pickup |
| Fisherman | Fail | 1, Fail | Fail | |
| Weapons Master | Fail | 1, Fail | Fail | |
| Errand hut | Fail | 1, Fail | Fail | |
| Witch | Fail | 1, Fail | Fail | |
| Wizard | Fail | 1, Fail | Part | The circle isn't touched directly; the menu is on the NPC |
| Shed | Fail | 1, Fail | Fail | Frog Coin |
| Cavern | Fail | 1, Fail | Fail | |
| Enemy hut | Fail | Exempt | Fail | Proposed |
| Graveyard | Fail | Exempt | Pass | Proposed |
| Sunken Hold | Fail | Exempt | Part | Proposed |
| Draw Room | Fail | Exempt | Part | Proposed |

The Maze and Aquifer are outside the I2 scope. They're Interiors, but they aren't huts or neutral
rooms.

**Dungeon floors**

Left-right symmetry of walls, measured from the templates. Polish (D2-D4) is missing everywhere:
templates have no `decor[]`, and `_addDecor` (`src/systems/DungeonFloorGenerator.js:409`) places
5-9 of `8 0 *` on Entrance, Corridor and Branch floors only.

| Templates | Symmetry | D2 |
|-----------|----------|----|
| bombable, chambers, crossroads, face, open, pillar_rows, separated, sewer, twin_halls | 99-100% | Fail |
| barred_cache, separated_zones, scatter_blocks, ribs | 91-95% | Fail |
| mild_maze | 74% left-right, 74% top-bottom, 99% rotational | Part |
| Puzzles: boomerang, torch, whip | 100% | Fail |
| Puzzle: bomb | 95% | Fail |
| Puzzle: hammer | 63% | Part |

Wall symmetry isn't itself a fault, since D1 keeps the walls. It sets how much the wear layer has
to do.

**Fix order**

1. **Bug #517, gray dungeon facades.** The smallest change with the largest gain: the best
   Exteriors in the game are losing their colour.
2. **Sunken Ship redraw**, once the user has critiqued §8. It's the named bad example, and it tests
   whether the format below is sufficient.
3. **Authored stamp format** (`docs/adr/BACKLOG.md`). Per-kind Exteriors and dungeon wear both
   depend on it, so items 4 and 5 wait here.
4. **Per-kind hut Exteriors**, starting with the kinds the player visits most: Shop, Alchemy Lab,
   Wise Fellow.
5. **Dungeon wear layer**, replacing `_addDecor` with zone clusters.
6. **I1 glyph pass** on Wise Fellow, then on the Shop, whose interactions are already there.
   The Alchemy Lab's passed in its room review (2026-11-21).
7. **Second interactions** for the rooms at 1, one at a time. Each is a design question and not a
   dressing job.

---

## 10. Revision log

| Date | Change | Why |
|------|--------|-----|
| 2026-11-01 | First draft. | The user's brief, plus rulings on I2 (two separate objects) and its scope (huts and neutral rooms). |
| 2026-11-20 | Amended S9: from below, the top inside the cliff is unseen. | The user: "the inside of the mountain… should be black/not rendered (including player characters) when the player is in layer 0". |
| 2026-11-20 | Added S8 (the perimeter carries the terrain), S9 (height reads by what falls away), G7 (on is colour, off is the floor) and P4 (authored rooms go through `room-review-schematic.md`). | The user on the Zenith's second pass: the base not organic enough, fog for the upper level, the white-on-colour energy not visible, grass dressing round the base. |
| 2026-11-20 | Added S7 (positions tell the story) and G6 (markers are glyphs, never boxes; "off" states differ in shape). Added the Authored letter rooms scorecard, which brings authored set pieces in EXPLORE letter rooms into scope for §2 and §6. | The user on the Zenith's first build: "this room is ugly and breaks design rules such as using bordered boxes", and "put some real appeal effort into the positions for memorability". |
| 2026-11-21 | Added E5 (a Yard teaches what a sign says). Added `customSprite` as the third fix for half-width runs. | The user on the Hut and Settlement Yards: per-kind tells stay in both rooms; "Fences can be fixed by creating a custom sprite"; the Errand hut is bare on purpose; snow drifts are not wanted. |
| 2026-11-21 | Added S10 (a variant keeps the rhythm) and S11 (lines make a place). | The user on the Yards: the Wise Fellow's stepping-stone path was "too spread out"; "Fences do a lot of work, so use them more". |
| 2026-11-21 | P4 covers hut interiors; the room review gains a hut interior track. | The user: the room review should be lifted for hut interiors, from the Alchemy Lab and Wise Fellow work. |
| 2026-11-21 | Added the Dressing glyphs index to §6. Alchemy Lab rescored after its room review (I1 Pass, I3 Pass). | The user asked for the decoration inventory to be kept for reference; the Lab review found a glyph (`⸙`) shared with a Yard only by `git grep`. |
