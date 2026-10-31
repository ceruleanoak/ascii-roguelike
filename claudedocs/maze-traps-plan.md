# Maze Traps — Plan

Planning session 2026-10-31 (from the planning inbox). Two traps for deep Mazes: **Flood Panels**
that flood the Maze from its far end, and **Rat Nests** that release swimming, poisonous **Maze
Rats**. Mazes spawn in green and cyan only (cyan is home, `exitLetters.js` `M`), and cyan's verb is
*Anticipate*: both traps read before they bite, and the answer to each is seeing it coming.

## Decisions (user, 2026-10-31)

| Question | Decision |
|---|---|
| Gate | Zone depth ≥ 6 (`getCurrentZoneDepth()`, the same read as `MAZE_LOOT_TABLE`). |
| Panel read | Flood Panels render **very dark**. They are fully revealed only inside torch light: a carried torch (`hasTorchLight`) or a lit Maze Torch fixture's `TORCH_LIGHT_RADIUS`. |
| Torch | A Torch item (`♨`) spawns at the **Wellspring**, the open cell furthest from the exit. |
| Flood origin | The flood always rises at the **Wellspring**, never at the panel stepped on. |
| Trigger | Each panel is one-shot. The first one stepped on opens the Wellspring; each later one speeds up the spread. A dodge roll passes over a panel without triggering it. |
| Flood spread | Deep water spreads cell by cell along open corridors (BFS from the Wellspring) until the Maze is full. |
| Deep water destroys torches | A **ground Torch** and a **carried Torch** are both destroyed by deep water. The Lantern (`♁`, `lightsUnderwater`) is exempt; that exemption is the Lantern's selling point. A destroyed equipped torch floats a word over the player. **This is a global rule**, not Maze-only: it applies to every deep-water tile (ocean, Sunken Ship, Quagmire, etc.). |
| Maze Torch fixtures | Deep water snuffs a lit fixture the same way a Ghost does (`destroyed`; it loses its shield and its all-lit contribution). Same rule: deep water destroys torches (user, 2026-10-31). |
| Rats | A real `Enemy` (new `enemies.js` entry, `displayChar: 'r'` per the Rat variant convention). Poison bite. Moves cell by cell with BFS like a Ghost. **Rats swim** (`swimAffinity`): the flood doesn't drown them. |
| Nests | On open corridor (non-dead-end) cells. A nest shakes while the player is near; if the player lingers, it releases 3 Maze Rats, once only. |
| Plumbing | The Maze gets **real lists**: `mazeInterior.backgroundObjects` (deep-water tiles as `BackgroundObject.deepWater`, plus panels/nests if they're objects) and `mazeInterior.enemies`. `InteriorManager.activeBackgroundObjects()`/`activeEnemies()` return them instead of `[]`, so drowning, wet pips, combat and the Lantern all run through the shared pipeline. |

### Ratified names (glossary entries land with the code)

- **Flood Panel**: the dark floor trap.
- **Wellspring**: the open cell furthest from the Maze exit, where the Torch lies and the flood rises.
- **Rat Nest**: the shaking nest.
- **Maze Rat**: the swimming poison rat a Rat Nest releases (`displayChar: 'r'`).
- **DOUSED**: the floating word when deep water destroys an equipped torch.

## Build outline

Phases are ordered so each one is a shippable, verified commit.

1. **Maze joins the shared lists.** Add `backgroundObjects: []` and `enemies: []` to `generateMazeInterior()`. Route them through `InteriorManager.activeBackgroundObjects()`/`activeEnemies()`, and check every reader that assumed `[]` meant "in the Maze". Enemies are then ticked by `EnemyUpdateSystem` (the canonical pipeline: no tick inside MazeSystem). `MazeInteriorOverlay` draws them through the shared helpers/Frame Passes (`check:frames`). Verify `check-reset-parity` (the fields live on `mazeInterior`, which is already reset as a whole).
2. **Deep water destroys torches (global).** Add a data flag on the Torch (proposed: `dousedByDeepWater: true`; the Lantern doesn't carry it). In `PhysicsSystem.applyLiquidResults`, beside lava's `damagingLiquid` destroy: a ground Item with the flag in deep water is removed; a player in deep water loses every quick-slot item with the flag, floating `DOUSED`. In the Maze, a fixture whose cell floods is snuffed (`destroyed = true`, as Ghost contact does), which phase 4 wires in. Needs a playtest note for the existing deep-water rooms.
3. **Wellspring + Torch.** BFS distance from the entrance cell. The Wellspring is the furthest **open** cell (the furthest cells are usually dead ends, and every dead end is a solid tomb), so it's the open cell next to the furthest tomb. Spawn a `♨` there. Depth ≥ 6 only.
4. **Flood Panels + flood.** Pick N open corridor cells (tunable; not the entrance or the Wellspring). Render them very dark; reveal them inside torch light using stepped colors, never alpha gradients (retro alpha quantization). On the first non-rolling step: open the Wellspring and start the corridor BFS fill (tunable cells/sec); every later panel multiplies the rate. Water cells become `BackgroundObject` deep-water tiles in `mazeInterior.backgroundObjects`. Note the existing rule that deep water blocks a dodge roll from *starting* (`PlayerDodgeRollSystem.js:27`): once the flood reaches the remaining panels, the player can't roll over them. That pressure is intended.
5. **Maze Rat + Rat Nest.** Pull the Ghost's BFS (`MazeSystem._bfsPath`/`_chooseGhostNextCell`) into a shared maze-pathing helper. Ghosts and a new `entities/enemyMechanics/` movement mechanic both consume it (extend, don't mirror). New `enemies.js` entry: Maze Rat, `displayChar: 'r'`, poison bite, `swimAffinity`. Rat Nest: 1-2 per Maze on open corridor cells; shakes within ~2 cells; ~3 s lingering releases 3 rats (tunable).
6. **Glossary + docs.** Write the five entries, update the Maze entry (it now holds real lists), and update the `MazeSystem.js` header comment.

## Still open (settle at build time, or ask)

- **Ghosts in the flood.** Recommendation: unaffected (they're immune and pass through by nature).
- **Tombs in the flood.** Still breakable, and their drops bob as water already does.
- **Spectacles.** Unaffected by rats or the flood (the clear condition is "no Ghost ever spawned").
- **Tuning numbers:** panel count, flood rate and multiplier, nest radius and linger time, Maze Rat stats. Start from the values above, then playtest.
