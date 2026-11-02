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

---

## 3. Exteriors

| # | Rule | Test | Status | Source |
|---|------|------|--------|--------|
| E1 | **No two building kinds share an outline.** | Compare solid-fill views of all kinds. A sign, a colour or a letter is not a difference. | Ratified | "the exterior of every building should have distinct and interesting qualities"; `stampHutFootprint` (`src/systems/roomFeatures.js:1517`) gives every hut kind one 5×5 stamp |
| E2 | **The occupant shows.** The building has at least one feature only this occupant would have. | Name who lives here from the feature alone. | Provisional | Witch's legs |
| E3 | **The door stays findable.** However strange the building, its entrance reads as one. | Find the door in a screenshot without being told. Deliberately hidden entries are named here: Cavern (behind a Bombable Rock). | Provisional | Dungeon faces keep `∩` |
| E4 | **Exteriors have no interaction minimum.** | Nothing to test. This stops I2 being applied here. | Ratified | The user's brief |

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

`☰` is full width too, but it's the Sandwich, so G2 rules it out.

---

## 7. Process

| # | Rule | Test | Status |
|---|------|------|--------|
| P1 | **Look before calling it done.** | A cell dump or screenshot exists, with a solid-fill view for anything S4 applies to. | Provisional |
| P2 | **Corrections become rules.** When the user corrects art, the same session adds or amends a rule here, with the date and example. A repeated correction promotes the rule to Ratified. | §10 has an entry for every art correction. | Provisional |
| P3 | **New space, new scorecard row.** | A commit adding a building or room touches §9. | Provisional |

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

Scored 2026-11-01 from code and cell dumps. **Pass**, **Part**, **Fail**; a dash means not
applicable. The I2 number counts separate interactive objects.

**Exteriors**

| Building | Outline | E1 | E2 | E3 | Note |
|----------|---------|----|----|----|------|
| Shop | 5×5 stamp | Fail | Fail | Pass | |
| Alchemy Lab | 5×5 stamp | Fail | Fail | Pass | |
| Press hut | 5×5 stamp | Fail | Fail | Pass | |
| Wise Fellow | 5×5 stamp | Fail | Fail | Pass | |
| Fisherman | 5×5 stamp | Fail | Fail | Pass | |
| Weapons Master | 5×5 stamp | Fail | Fail | Pass | |
| Errand hut | 5×5 stamp | Fail | Fail | Pass | |
| Wizard | 5×5 stamp | Fail | Fail | Pass | |
| Enemy hut | 5×5 stamp | Fail | Fail | Pass | |
| Witch | Stamp on legs (`ⲗ`) | Part | Pass | Pass | Only outline that differs by occupant |
| Shed | 3×3 with `▄` | Part | Fail | Pass | Differs by size, not by anatomy |
| Maze | 19×19 `≡` box | Part | Fail | Pass | A box; the mini-maze is `#3a2255`/`#1a0f2e` decoration |
| Dungeons (5 zones) | Authored per-zone face | Pass | Pass | Pass | Best tier. All 80 ornament cells render gray: bug #517 |
| Cavern | Natural rock cluster | Pass | Part | Exempt | The hidden door is the point |

Not scored: the Aquifer has no building (its entrance is a Whirlpool in the Quagmire). The Jeweler
and Dragon Forge have no building. The Well, Fountain and Vault aren't entered.

**Interiors**

| Space | I1 | I2 | I3 | Note |
|-------|----|----|----|------|
| Alchemy Lab | Fail | 4, Pass | Part | Trough, cauldron, condenser, Alchemist |
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
6. **I1 glyph pass** on Wise Fellow, then on the Alchemy Lab and Shop, whose interactions are
   already there.
7. **Second interactions** for the rooms at 1, one at a time. Each is a design question and not a
   dressing job.

---

## 10. Revision log

| Date | Change | Why |
|------|--------|-----|
| 2026-11-01 | First draft. | The user's brief, plus rulings on I2 (two separate objects) and its scope (huts and neutral rooms). |
