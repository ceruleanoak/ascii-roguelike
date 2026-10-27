# Dungeon rework: per-zone Dungeon Recipes, generated corridors, fixtures, hidden diagonals, editor

## Context
The planning inbox's "Dungeon rework" entry collects every open dungeon thread. These are your decisions from 2026-10-26.

**Structure**
- Each zone gets its own dungeon design: a flow chart that decides which directional exit leads where.
- Hidden **diagonal** exits (NW/NE) never show as a locked door. They *appear* when the floor is solved.
- Today's hardcoded chain is Green's design: Entrance → Corridor → Branch → Pyramid → Vault, plus the Trap Room and a Puzzle Room.

**Generated corridors**
- Generation grows from 1 corridor to **1-3 corridors** per visit.
- A corridor is either **simple travel** (a buffer between key nodes) or part of a **triangle**: one corridor links to another corridor and to the Branch.
- A triangle loop **is a bypass**. Taking the long way round replaces the Skull Key, so the key becomes a shortcut.

**Key nodes**
- **There is exactly one Branch, and it always holds the Pyramid entrance**, locked behind the zone's puzzle.
- **Reaching the Pyramid is the dungeon's sub-solve.** Green's puzzle is the floor-panel NPC puzzle (`panels`). Each zone will eventually get its own puzzle.
- The Trap Room isn't always on the Branch; it can hang off a corridor.

**Rolled onto corridors each visit**
- The Skull Key gate: one corridor edge into the Branch region, with a per-visit chance of a Push Rock alternative on that same edge.
- The Trial (Puzzle Room) goes on a free corridor North.
- The key drops on a floor that can be reached before the gate.

**Other decisions**
- **Shared vocabulary.** Every floor kind can appear in any zone. The boss stays per zone: only `dungeonBosses/green.js` exists, so every zone still meets the Hoardmaw (unchanged).
- **Reveals are per edge**, and "floor cleared" is one of them.
- **I draft** the Yellow, Red, Cyan and Gray recipes, and you revise them.
- **Numbered floors get fixtures.** Solved triggers open optional reward only, through a new **Trigger Block** tile, and can also reveal an edge.
- **What lies behind a Trigger Block** is template-authored only: Simple Keys and a new `items[]` fixture.
- **The Dungeon Item is in scope**, once you've written the ADR for it.
- **Editor:** extend the Electron editor in place, including a new **Graph mode**. CLI migration is out of scope.

**A gap between the docs and the code has to be closed first.** The Progression Solver only runs at module load, where it filters the random pools; a failing template gets a `console.warn` and nothing else. GLOSSARY says the editor and the data gate run it. The `[softlock]` category and ADR backlog row 88 describe a runtime net in `_activateFloor`. None of these exist, which is why #401 is still open.

### Names to ratify (approving this plan ratifies them)
- **Dungeon Recipe**: a zone's generation rules. It names fixed key nodes, the corridor layer's range and shapes, side rooms that are placed by roll, and the zone puzzle's reveal.
- **Dungeon Graph**: the concrete per-visit layout a recipe produces, rolled at entry.
- **Floor Kind**: a reusable floor type: entrance, corridor, branch, pyramid, vault, trapRoom, puzzleRoom, combat.
- **Reveal**: what opens an edge: `open`, `key`, `push`, `clear`, `triggers`, `panels`, `offering`.
- **Hidden Descent**: an edge that isn't drawn until it's revealed.
- **Trigger Block**: a floor tile that opens once all of the floor's triggers are active.

For the ADR backlog, row 49 ("branching destination graph… no explicit cap") gets an update row: the graph is now generated per visit from a per-zone recipe. You write the ADR.

## Phase 0: Make the softlock contract real (closes #401)
1. `tools/check-data.js` runs `solveTemplate()` over every floor and puzzle template. Tool kits and `solverExempt` handling go through one helper shared with `src/data/dungeonPuzzleTemplates.js:133-144`. An error fails the build.
2. The editor validators in `tools/dungeon-editor/main.js` load the solver the same way `loadTilesModule` loads the tiles. An error refuses the save; warnings go to the advisory readout.
3. A floor generated from a template that failed the solver is marked `solverFailed`. Such floors can only be reached by warp, and `_activateFloor` clears their `stairsUpLocked`.
4. Fix the GLOSSARY Progression Solver entry and the `[softlock]` category text. Move #401 to resolved.

## Phase 1: Recipe/Graph format + exact Green port (no behaviour change)
- **Data**
  - Recipes live in `src/data/dungeon/recipes/<zone>.json`, loaded through `import.meta.glob`.
  - `src/data/dungeonRecipes.js` loads and validates them, and falls back to `green`.
  - In this phase, Green's recipe is pinned to `corridors: [1,1]`, the `chain` shape and today's fixed placement. That reproduces the current layout exactly.
- **Concrete graph**
  - `{ nodes: { id: { kind, template?, boss? } }, edges: [{ from, dir, to, reveal, hidden? }] }`.
  - `dir` is one of `N`, `E`, `W`, `NW`, `NE`.
  - The graph is produced by `buildDungeonGraph(recipe, rng)` in the new `src/systems/dungeonGraphBuilder.js`.
- **Floor Kind registry** (new `src/systems/dungeonFloorKinds.js`)
  - Each kind maps to its existing generator: `_generateEntrance`, `_generateCorridor`, `_generateBranch`, `_generatePyramid`, `_generateVault`, `generateTrapRoom`, `generatePuzzleRoom`, plus a plain `combat` kind.
  - Kinds stop hard-coding which descent they unlock. The Branch panels, the Pyramid offering, the Skull Key spend and the Trap Room clear each **emit their reveal**, and every edge on that floor with the matching `reveal` unlocks.
  - Today those unlocks are hard-coded at `DungeonFloorGenerator.js:522-526, 593-600, 635` and in `DungeonPuzzleSystem._tryUnlockCorridorGate`, with dispatch on `floorIndex===2` at `:43-55`.
  - Corridor and Branch generators take their descent list from the graph instead of building it themselves.
- **Destinations**
  - Destinations become `{ node: id }`, and floors are stored by node id. This replaces numeric `floorIndex` and the string-keyed side rooms on the `game.dungeonFloors` array.
  - `game.dungeonCurrentFloor` becomes a node id or `null`. Update `resetRegistry.js:856` and `InteriorManager.js:112` to match.
  - `_destinationOf`, `sameDestination` and `getFloorByDest` key on node id. `_enteredViaId` stays.
  - About 40 `floorIndex` references move with this.
- **Visit roll**
  - One `rollVisit(interiorState, recipe)` replaces the duplicated rolls in `_enterDungeon` (`DungeonSystem.js:245`) and `debugWarpTo` (`:554`).
  - It builds the graph and stores it as `interiorState.graph`, along with the Skull Key floor and resolved templates.
  - `interiorState` is room-scoped, so no reset-registry entry is needed.
  - The zone comes from `currentRoom.zone`.
- **CheatMenu:** the dungeon warps (`CheatMenu.js:99-107`) list the nodes of the current visit's graph.
- **Proof of no change:** a headless walk of Green before and after, plus `check-reset-parity` (see Verification).

## Phase 2: Generated corridor layer (1-3 corridors, chain or triangle)
- **Recipe fields** (with Green's values)
  - `corridors: [1,3]`
  - `shapes: { chain: w, triangle: w }`: weights. A triangle needs at least 2 corridors.
  - `branchPuzzle: 'panels'`: the reveal on Branch → Pyramid.
  - `sideRooms: { trial: 'corridor', trapRoom: ['branch','corridor'] }`
  - `keyGate: { pushChance: 1/3 }`
- **`buildDungeonGraph`**
  - Lays out Entrance → corridor layer → Branch, then fixes Branch → Pyramid (`reveal: branchPuzzle`) → Vault.
  - **Chain:** corridors run in sequence. The last corridor's edge into the Branch is the key gate (`reveal: key`).
  - **Triangle:** corridor A links to both corridor B and the Branch, and corridor B also links to the Branch. One of A's or B's edges into the Branch is the key gate; the other route around the loop is `open`. This is the bypass, as you specified.
  - **Side rooms:**
    - The Trial goes on a free corridor `N`.
    - The Trap Room goes on a free direction of the Branch or of a corridor.
    - Diagonals stay free for Hidden Descents (Phase 3).
  - **Skull Key:** drops on a floor the player can reach from Entrance without crossing the key edge.
  - **Directions:** every edge gets a free `dir` on both ends. Going down is N/E/W/NW/NE; the up-stairs is always the South footprint.
- **Graph validator** (shared by `check:data`, the runtime builder assert, and the editor)
  - Every node is reachable from Entrance using edges whose reveal needs no tool, or through the key once the key's floor is reachable.
  - Exactly one Branch, which holds the Pyramid edge.
  - Exactly one Vault.
  - No two edges on one node share a `dir`.
- **`tools/check-dungeon-graphs.mjs`** (wired into `build`): for each recipe, builds 500 seeded graphs and runs the validator on every one.

## Phase 3: Diagonal footprints + Hidden Descents
- **Contract:** `footprintContract.json` and `footprints.js` gain NW at (NORTH_ROW, WEST_COL) and NE at (NORTH_ROW, EAST_COL). Each gets a landing cell one step inward on the diagonal.
- **Reserved only when used:** `reservedFootprintCells(dirs)` reserves a corner only on floors whose graph node uses it, so templates don't have to keep their corners empty.
  - Each template records, at registration, which directions it can host by running the solver per direction set.
  - The builder only hands a node a template that fits its directions.
- **Painting:** in `paintDescentVisual` (`dungeonFloorTemplates.js:90-103`), a hidden descent paints as plain floor until revealed, then as an open `v` with a reveal flash and SFX. No text, keeping the UI non-instructive.
- **`clear` reveal:** opens when no enemies are alive and no Spawn Vent is standing, at the same moment `_updateShutters` fires.
- **Recipe:** `diagonals: { chance, reveals: ['clear', 'triggers', ...] }` lets the builder add hidden shortcut edges, for example corridor → Branch, or corridor → Trial skipping a floor.

## Phase 4: Fixtures on numbered floors + Trigger Block
- **Tiles:**
  - `tiles.js`: Gap `G` and Lava `=` gain `'floor'` mode.
  - New tile `T`: Trigger Block, `solid`, `opensWith: 'triggers'`, `modes: ['floor']`.
  - The Exit `X`, pedestal and dais stay puzzle-only.
- **Floor template fields:** `triggers[]`, `hookPosts`, `torches`, `unbreakableRocks`, `deflectors`, and `items: [{row,col,char}]`. Document them beside the puzzle schema at `dungeonPuzzleTemplates.js:29-106`.
- **Shared fixture placement:**
  - Move `generatePuzzleRoom`'s fixture code (`DungeonFloorGenerator.js` ~826-1012) into a shared `placeTemplateFixtures` in the new `src/systems/dungeonFixtures.js`. Both the numbered-floor scaffold and puzzle rooms call it.
  - Add a `trigger_block` variant in `GameConfig.js`. Its glyph is printable ASCII and differs from `+`, `▣` and `≡`.
  - After the extraction, run `check-architecture --update`.
- **`DungeonPuzzleSystem`:**
  - Hook posts and torches run on any floor.
  - New `_updateFloorTriggers`. When it fires, a puzzle room opens its Exit; a numbered floor opens its Trigger Blocks **and** emits the `triggers` reveal.
  - `world.isReserved` covers every active footprint and landing cell.
- **Solver, floor mode:**
  - `T` is closed in the base kit.
  - **Push-rock safety:** every reachable rock configuration keeps all footprints and landings connected. This reuses puzzle mode's rock model (`progressionSolver.js` ~305-311, 476-489).
  - Warns on a `T` with no triggers, a trigger out of reach, and an item out of reach.
- **Editor:** Interior mode turns on those fixture buttons; `validateFloorTemplate` (`main.js:200-237`) accepts them; the trigger sidebar works in both modes.
- **Content and glossary:**
  - Author one floor template that uses a Trigger Block.
  - GLOSSARY: Trigger Block, Dungeon Recipe, Dungeon Graph, Floor Kind, Reveal, Hidden Descent.
  - Update the Push Rock and Progression Solver entries.

## Phase 5: Push Rock alternative on the key gate
- When `keyGate.pushChance` rolls in, a Push Rock sits on that edge's footprint, and that floor's template must pass `canHostFootprintRock(grid, dir)`.
- The rock's `onMove` emits `push` once it leaves the footprint, so the edge opens with either the key or the push.
- The footprint is reserved, so the rock can't be pushed back onto it. If no fitting template exists, the push alternative is dropped for that visit.
- Remove part (2) from the planning-inbox entry.

## Phase 6: Draft recipes for Yellow, Red, Cyan and Gray (for you to revise)
- **Recipes:** draft `recipes/<zone>.json` from the zone paths in `claudedocs/zone-cosmology.md`: Power (Yellow), Glory (Red), Knowledge (Cyan), and Gray's mist. Each draft sets corridor range, shape weights, side-room placement and diagonal reveals.
- **Rationale:** write it up in `claudedocs/dungeon-recipes.md`. For each zone, a sample flow chart with the floor order and the hidden diagonals.
- **Placeholders until you design them:**
  - Every zone's `branchPuzzle` stays `panels` until you design its unique puzzle. It's marked as a placeholder in both the data and the doc.
  - The boss stays `green`.
- Stop for your revisions.

## Phase 7: Editor Graph mode
- **Mode:** a fourth editor mode for **recipes**. Pick a zone to edit the recipe fields.
- **Preview:** a **Reroll** button calls `buildDungeonGraph` with a fresh seed and draws the resulting flow chart: nodes from Entrance, with edges labelled by `dir` and `reveal`. You can see what the recipe produces.
- **Saving:** writes `recipes/<zone>.json` with `writeJSONAtomic`, gated by the shared graph validator over a seeded batch.
- **IPC:** follows the existing per-kind pattern in `preload.js`.

## Phase 8: Dungeon Item (blocked on your ADR)
Starts after you write the ADR for the backlog row "Trial rolls at dungeon entry…".
- `rollVisit` already resolves the Trial template at entry. The Dungeon Item is that template's `pedestal.weaponChar`.
- Floor templates get a `dungeonItems: [char]` field. `pickRandomTemplateName` (`dungeonFloorTemplates.js:147`) multiplies their weight by the factor set in the ADR.
- The editor gets a multi-select for `dungeonItems`, and `check:data` validates the field.
- GLOSSARY: Trial, Dungeon Item.

## Out of scope
- CLI migration.
- Boss designs for the other zones (backlog row 61).
- The unique zone puzzles for Yellow, Red, Cyan and Gray. Their recipes reserve the `branchPuzzle` slot.
- Bugs #462, #463 and #466.

## Critical files
- **Dungeon data:** `src/data/dungeon/{tiles.js,progressionSolver.js,footprints.js,footprintContract.json}`, new `src/data/dungeon/recipes/*.json`, new `src/data/dungeonRecipes.js`, `src/data/dungeon{Floor,Puzzle}Templates.js`.
- **Systems:** `src/systems/{DungeonSystem,DungeonFloorGenerator,DungeonPuzzleSystem,PushRock,triggerMachine,InteriorManager,CheatMenu}.js`, new `src/systems/{dungeonGraphBuilder,dungeonFloorKinds,dungeonFixtures}.js`.
- **Config and reset:** `src/game/resetRegistry.js`, `GameConfig.js`.
- **Tools:** `tools/check-data.js`, new `tools/check-dungeon-graphs.mjs`, `tools/dungeon-editor/*`.
- **Docs:** `GLOSSARY.md`, `docs/adr/BACKLOG.md`, `claudedocs/{known-bugs,resolved-bugs,planning-inbox,dungeon-recipes}.md`.

## Verification
- **Every step:** run `npm run build`. It includes `check:arch`, `check:data` (now with the solver), `check:frames`, and the new graph batch check.
- **Solver:** run `tools/debug/solver-check.mjs`. Seed failures on purpose and confirm the build and the editor both refuse them:
  - a rock that blocks a footprint;
  - an `X` in a floor template;
  - a recipe whose graph can strand the Vault.
- **Phase 1 no-change proof:**
  - A headless Playwright script (`tools/debug/`, `window.game`, see `claudedocs/playwright-debugging.md`) walks Green on HEAD and after the change: Entrance → Corridor → key → Branch panels → Pyramid offering → Vault. The two walks match.
  - `node tools/check-reset-parity.mjs` passes.
- **Generated layouts:**
  - Seed a 3-corridor chain and a triangle.
  - Walk the bypass route without the key and reach the Branch.
  - Solve the panels and reach the Pyramid.
  - Climb back and land on the descent the player used.
  - Force a hidden diagonal with the `clear` reveal, and a Push Rock on the key gate.
  - Solve a Trigger Block template.
  - Enter a Yellow D-room and confirm it uses Yellow's recipe.
- **Manual:** use the CheatMenu warps (built from the visit's graph) to check the visuals.

**Commits:** one per numbered step, pushed after each build passes, staging explicit paths only.
