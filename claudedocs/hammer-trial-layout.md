# Hammer Trial — Puzzle Room layout

The Onyx Hammer's Puzzle Room (planning inbox: "Rework Onyx Hammer"). The name was ratified on
2026-10-18 (see GLOSSARY "Hammer Trial"). It is implemented as
`src/data/dungeon/puzzleTemplates/hammer_trial.json`, and a headless run on 2026-10-18 confirmed
that both rocks solve it.

## Rules this room teaches

- The Onyx Hammer knocks an unbreakable rock into a rolling rock. It is the same rolling
  rock the red zone spawns, with the same damage but a faster roll.
- A rolling rock breaks anything a bomb breaks (here, the Bombable Wall in front of the Exit).
- A rolling rock turns at a Deflector.
- A Push Rock does nothing when the hammer hits it. No Push Rocks appear in this room.

## Grid (24×24)

Arrival is fixed for every Puzzle Room: North footprint (4,12), landing (5,12).
The Exit therefore sits at the bottom.

```
     012345678901234567890123
  0  ########################
  1  #..............#########
  2  #..............#########
  3  #..............#########
  4  #..............#########    (4,12) North footprint, arrival lands at (5,12)
  5  #..............#########
  6  #..............######*##    * switch (6,21)
  7  #......P.......######=##    P Onyx Hammer pedestal (7,7)
  8  #..............######=##
  9  #..............######=##
 10  #................R===◢##    R rock A (10,17), ◢ Deflector NW (10,21): east → north
 11  #..............#########
 12  #..............#########
 13  #..............#########
 14  ############.###########
 15  ############.###########
 16  ############R###########    R rock B (16,12)
 17  ############.###########
 18  ############B###########    B Bombable Wall (18,12)
 19  ##########.....#########
 20  ##########.....#########
 21  ##########..X..#########    X Exit (21,12)
 22  ########################
 23  ########################
```

Legend (the template fields these use are given in parentheses):
`R` unbreakable rock the hammer can roll (`unbreakableRocks`, placed as `cavern_rock`) · `=` lava
(`tiles.js`, puzzle mode only) · `◢` Deflector (`deflectors: [{ row, col, char }]`)
· `*` the switch, a `triggers` entry (`kind: 'switch'`, permanent) · `B` Bombable Wall · `X` Exit · `P` pedestal (`weaponChar: '⬢'`).

## How it solves

1. Take the Onyx Hammer from the pedestal.
2. **Rock A:** walk into the 1-wide channel at (10,15)–(10,16) and hit east. The rock rolls
   down the lava hallway, turns north at the Deflector and hits the switch, so the Exit unlocks.
3. **Rock B:** walk down the 1-wide neck to (14,12)–(15,12) and hit south. The rock rolls
   into the Bombable Wall and breaks it. The Exit is open.

The two rocks can be solved in either order.

## Failsafe: wrong-axis strikes are impossible

A strike sends the rock along the cardinal axis pointing away from the player. The axis is
picked by the larger of |dx| and |dy|, and a tie goes horizontal (BoulderSystem's redirect rule).

- **Rock A** has wall above and below it, and the channel cells next to it are walled above and below
  too. The nearest open-hall cells are three columns away, and any of them that would pick the
  vertical axis are well out of hammer reach. The lava side can't be reached at all, because
  the rock itself plugs the only way in. So rock A can only ever be struck east.
- **Rock B** sits at the bottom of a 1-wide neck. From the closest hall cells (row 13,
  cols 10–14), the vertical axis always wins until the cells are far out of reach. The
  Exit side is sealed by the Bombable Wall. So rock B can only ever be struck south.
- **Backstop:** row 10 and column 12 stay clear of fixtures across the hall (the
  pedestal is at (7,7) for this reason). If a rock ever leaves the right way, it bounces
  off the far wall and comes back along the same line. A rock that is still rolling can also be re-aimed
  with the hammer (the existing redirect), so a stray roll can't cause a softlock.

Line of sight: the switch is around the corner from the only opening, and rock A blocks
the hallway until it rolls. No melee strike or straight shot can reach the switch first.

## Decisions (2026-10-18)

- **One hammer roll.** Hitting a rock that is already rolling and hitting an unbreakable rock at rest give the
  same result: one hammer-rolled rock, with base `BOULDER_DAMAGE` and ×2 speed. Today's
  `empowered` flag (BoulderSystem) doubles speed, damage and player knockback (400 vs 250).
  It now means speed only, and both strike paths set it. The knockback boost (400 vs. 250)
  is kept for now.
- **Dungeon support, with parity.** Rolling rocks work on dungeon floors, either as a new
  similar object or as a feature inside BoulderSystem that behaves the same everywhere. It
  is drawn as a Frame Pass and uses the interior collision source.
- **Breaking things.** A rolling rock breaks anything a bomb breaks, via
  `CavernSystem.bombBlast` (Bombable Rocks/Walls and the bombable Vault wall). Any rolling rock
  does this, not only an empowered one. It does not do generic explosion damage to trees or
  other objects.
- **No softlock proof.** This room is hand-checked, and the Progression Solver isn't
  extended to model rolls. Catch: the puzzle pool only takes templates the solver passes
  (`dungeonPuzzleTemplates.js` TEMPLATE_WEIGHTS), so an unmodelled room is silently
  left out of the pool, and only the CheatMenu can warp into it. The template opts out with
  `solverExempt: true`, which the filter honours.
- **Switch vs. projectiles:** the switch at (6,21) is walled on three sides, and the only way
  in is the lava hallway, which rock A plugs until it rolls. No bow or boomerang line reaches it.

## Known gap

The dungeon editor saves a template's data whole, so `unbreakableRocks`, `deflectors` and
`solverExempt` survive a re-save. It has no tools for them, though, and doesn't draw the rocks or
the Deflector, so they can only be moved by editing the JSON. The `=` Lava tile comes from
`tiles.js`, so the editor can already paint it.
