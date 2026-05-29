## GAME INFRASTRUCTURE REVIEW

**Reviewed files:** `src/game/GameConfig.js`, `src/game/GameLoop.js`, `src/game/GameStateMachine.js`  
**Date:** 2026-05-15

---

### File Inventory

| File | Purpose | Key Exports |
|------|---------|-------------|
| `GameConfig.js` | Central data/constants hub for all game-wide configuration | `GRID`, `PHYSICS`, `GAME_STATES`, `ROOM_TYPES`, `COLORS`, `CRAFTING`, `EQUIPMENT`, `PLAYER_STATS`, `INTERACTION_TYPES`, `BACKGROUND_OBJECTS`, `BACKGROUND_OBJECT_VARIANTS`, `WATER_COLORS`, `WATER_STRUCTURES`, `WALL_STRUCTURES`, `OBJECT_ANIMATIONS`, `INTERACTION_RANGE`, `POLYMORPH_OUTCOMES` |
| `GameLoop.js` | Fixed-timestep game loop with spiral-of-death protection | `GameLoop` (class) — `start()`, `stop()`, `loop()` (arrow fn), `setUpdateCallback()`, `setRenderCallback()` |
| `GameStateMachine.js` | Lightweight state machine with transition and state-entry handlers | `GameStateMachine` (class) — `registerStateHandler()`, `registerTransitionHandler()`, `transition()`, `getCurrentState()`, `getPreviousState()`, `isState()` |

---

### GameConfig.js — BACKGROUND_OBJECTS Schema Audit

> Fields checked: `solid`, `bulletInteraction`, `flammability`, `slowing`, `dropEffect`, `indestructible`, `hp`, and notable special flags.

| Char | Name | solid | bulletInteraction | flammability | slowing | dropEffect | hp | Notes |
|------|------|-------|------------------|-------------|---------|-----------|-----|-------|
| `%` | Bush | — | pass-through | high | 0.8 | destroyObject | 1 | No `solid` field — not solid by default. No `dropChance`. |
| `⊓` | Press | true | block | none | — | — | — | Indestructible. No `hp`. No `slowing`. |
| `&` | Tree | — | block | high | 0.8 | destroyObject:spawnIngredient:\| | 3 | dropChance: 0.15. Not solid — bullets block but movement passes through. |
| `0` | Rock | true | interact-preserve | none | — | destroyObject:spawnIngredient:M | 3 | collisionShape: 'ellipse'. dropChance: 0.2. Solid. |
| `=` | Water | — | pass-through | none | — | — | — | No `hp`, no `solid`. conductivity: water. No `slowing` despite being traversable liquid — see **schema gap**. |
| `#` | Crate | — | interact-destroy | medium | — | destroyObject:spawnRandom | 2 | acceptsInteractions: all. damagedChar: '-'. Not solid. |
| `+` | Brambles | — | pass-through | high | — | destroyObject:spawnIngredient:~ | 1 | No `slowing`. Drops `~` (puddle ingredient char) — **unusual**: `~` is a background object char, not an ingredient. |
| `Y` | Stump | — | block | medium | 0.5 | destroyObject:spawnIngredient:\| | 2 | dropChance: 0.15. Not solid despite bullet-blocking and heavy slowing. |
| `n` | Mushroom | — | interact-destroy | low | — | destroyObject:spawnIngredient:g | 1 | dropChance: 0.3. No `slowing`. |
| `*` | Crystal | — | interact-preserve | none | — | destroyObject:spawnIngredient:M | 2 | conductivity: metal. dropChance: 0.25. Has weapon-interaction ricochet effect. |
| `B` | Metal Box | — | block | none | — | destroyObject:spawnRandom | 4 | conductivity: metal. acceptsInteractions: all. hitbox: 0.75×0.75. Not declared solid. |
| `Q` | Boulder | — | block | none | — | destroyObject:spawnMultiple:M:2 | 5 | dropChance: 0.3. hitbox: 0.875×0.875. Not declared solid. |
| `~` | Puddle | — | pass-through | none | — | — | — | No `hp`, no `solid`. conductivity: water. See also `BACKGROUND_OBJECT_VARIANTS`. |
| `.` | Sand | — | pass-through | none | — | — | — | indestructible: true, no `hp`. No `slowing` — sand should arguably slow. |
| `i` | Ice | — | pass-through | none | — | destroyObject:spawnIngredient:w | 1 | dropChance: 0.15. No `slowing` despite 'slide' animation — **missing expected mechanic**. |
| `!` | Fire | — | pass-through | none | — | — | — | indestructible: true. Not solid. No `slowing`. |
| `$` | Shrine | — | block | none | — | — | — | indestructible: true. No `hp`. Not declared solid but blocks bullets. |
| `p` | Barrel | — | interact-destroy | high | — | destroyObject:spawnRandom | 2 | acceptsInteractions: all. dropChance: 0.45. damagedChar: 'P'. Comment says "65% empty" but 0.45 means 55% chance to drop — **comment/value mismatch**. |
| `8` | Bones | — | pass-through | none | — | destroyObject:spawnIngredient:b | 1 | dropChance: 0.2. No `slowing`. |
| `\|` | Tall Grass | — | pass-through | high | true | cutGrass | 1 | slowing: true (boolean not numeric). cuttable: true. blocksVision: true. burnDuration: 1.5. |
| `,` | Cut Grass | — | pass-through | high | false | — | — | indestructible: true. slowing: false (boolean). burnDuration: 1.0. No `hp`. |
| `-` | Tunnel Wall (H) | true | block | none | — | — | — | indestructible: true. tunnelWall: true. renderOnlyOnPlane: 1. |
| `I` | Tunnel Wall (V) | true | block | none | — | — | — | indestructible: true. tunnelWall: true. renderOnlyOnPlane: 1. |
| `<` | Tunnel Entrance (L) | false | pass-through | none | — | — | — | tunnelEntrance: true. alwaysRender: true. |
| `>` | Tunnel Entrance (R) | false | pass-through | none | — | — | — | tunnelEntrance: true. alwaysRender: true. **Not listed in CLAUDE.md Background Object Char Map.** |
| `^` | Tunnel Entrance (Up) | false | pass-through | none | — | — | — | **CRITICAL BUG: key `^` defined twice.** First definition is Tunnel Entrance (Up); second (line 611) is Stairs Up. The second silently overwrites the first in the JS object literal. |
| `v` | Tunnel Entrance (Down) | false | pass-through | none | — | — | — | **CRITICAL BUG: key `v` defined twice.** First definition is Tunnel Entrance (Down); second (line 597) is Stairs Down. The second silently overwrites the first. |
| `ʌ` | Slope (Up) | false | pass-through | none | — | — | — | slope: true. slopeDirection: 'up'. Only one slope direction defined — no 'down', 'left', 'right' variants. |
| `}` | Cave Wall | true | block | none | — | — | — | indestructible: true. tunnelWall: true. renderOnlyOnPlane: 1. |
| `≡` | Hut Wall | true | block | none | — | — | — | indestructible: true. hutWall: true. |
| `∩` | Hut Door | false | pass-through | none | — | — | — | indestructible: true. hutEntrance: true. alwaysRender: true. |
| `▓` | Chasm | true | pass-through | none | — | — | — | indestructible: true. chasm: true. Solid but bullets pass through — inconsistent: solid walls typically block bullets. |
| `█` | Hut Interior | true | block | none | — | — | — | indestructible: true. hutInterior: true. |
| `◯` | Well Stone | true | block | none | — | — | — | indestructible: true. wellStone: true. |
| `λ` | Chicken Leg | false | block | none | — | — | — | indestructible: true. chickenLeg: true. Not solid but blocks bullets — inconsistent. |
| `2` | Glittering Rock | true | block | none | — | destroyObject:spawnGemstone | 3 | glitteringRock: true. renderOnlyOnPlane: 1. indestructible: false explicit. tunnelWall: false explicit. |
| `@` | Secret Vein Rock | true | block | none | — | destroyObject:spawnWeapon:⬡ | 3 | glitteringRock: true. No renderOnlyOnPlane — surface only by default. |
| `⊙` | Red Vein Marker | true | block | none | — | — | — | hp: null. indestructible: true. solid: true but comment says "non-solid" — **comment contradicts data**. renderOnlyOnPlane: 1. |

---

### GameConfig.js — Constants & Magic Numbers

**In GRID:**
- `GRID.COLS = 30`, `GRID.ROWS = 30`, `GRID.CELL_SIZE = 16` — `GRID.WIDTH = 480` and `GRID.HEIGHT = 480` are correctly derived. No magic numbers here.

**In PHYSICS:**
- `PHYSICS.PLAYER_SPEED = 180` — comment says "1.5x speed increase." The baseline this was increased from is not captured. If the multiplier ever changes, the comment will drift.
- `PHYSICS.FRICTION = 0.9` — a per-frame multiplier applied without normalizing for `fixedTimeStep`. At 60 Hz this is `0.9^60 ≈ 0.001` per second, meaning velocity decays to near-zero in ~1 second. This is intentional but the value is meaningless without knowing it's frame-rate dependent.

**In CRAFTING/EQUIPMENT:**
- All position values (`CRAFTING.STATION_Y = 15`, `LEFT_SLOT_X = 12`, etc.) are in grid-cell units. These are not derived from `GRID` constants — if `GRID.COLS` changes, these break silently.
- `EQUIPMENT.CONSUMABLE1_X` through `CONSUMABLE5_X` are all hardcoded `26`. This column position is not expressed as `GRID.COLS - 4` or similar.

**In PLAYER_STATS:**
- `MAX_HP = 10` and `START_HP = 10` are separate but always equal. If START_HP is ever meant to differ from MAX_HP, this is correct; but currently they're redundant constants. No derivation is documented.

**In INTERACTION_RANGE:**
- `INTERACTION_RANGE = 24` pixels = 1.5 cells (`GRID.CELL_SIZE * 1.5`). Not expressed as a multiple of CELL_SIZE — should be `GRID.CELL_SIZE * 1.5` for clarity.

**In BACKGROUND_OBJECTS — `Barrel` entry:**
- `dropChance: 0.45` — comment says "65% of barrels are empty." 1 - 0.45 = 0.55 (55% empty, not 65%). Either the comment or the value is wrong.

**In `OBJECT_ANIMATIONS.cutgrass`:**
- `frames: [{ char: '¦' }, { char: '`.'' }, { char: '¸,¸' }]` — the second and third frame `char` values contain multiple characters (`'`.'` is 3 chars, `'¸,¸'` is 3 chars). All other frame entries with `char` use a single character. This is probably fine if the renderer uses the string directly, but it signals design inconsistency.

**`POLYMORPH_OUTCOMES`:**
- All five outcomes have `weight: 20`. Total weight = 100. This is correct (equal probability), but would silently break if a new entry is added without adjusting weights, because no normalization code is visible here. A `totalWeight` or comment would help future editors.
- `lesserEnemy`, `equivalentEnemy`, and `boss` entries have no `objects` or content arrays — just comments. These are stub entries relying on downstream code to interpret the category name.

---

### GameLoop.js — Timing Analysis

**Fixed-timestep implementation (lines 44–49):**
```
while (this.accumulator >= this.fixedTimeStep) {
  updateCallback(this.fixedTimeStep);
  this.accumulator -= this.fixedTimeStep;
}
```
This is the canonical fixed-timestep pattern (à la Gaffer on Games). It is **correct**.

**Spiral-of-death protection (lines 37–39):**
```
if (deltaTime > this.maxFrameTime) {
  deltaTime = this.maxFrameTime;
}
```
`maxFrameTime = 0.25` (250 ms). At `fixedTimeStep = 1/60 ≈ 0.0167 s`, a 250 ms cap means at most `⌊0.25 / 0.0167⌋ = 14` update ticks per render frame under load. This is a reasonable cap.

**Render interpolation (line 52):**
```
const alpha = this.accumulator / this.fixedTimeStep;
```
`alpha` is in `[0, 1)`. Passed to `renderCallback(alpha)`. The rendering architecture explicitly accepts `alpha` — confirmed correct.

**Drift risk:**
- `this.lastTime = performance.now() / 1000` uses wall-clock time. On systems where `performance.now()` resolution is reduced (Firefox privacy mode: 2 ms resolution), short frames may occasionally produce `deltaTime = 0`. This is safe — the accumulator just doesn't advance.
- No drift correction mechanism (e.g., NTP-style phase lock). For a single-player browser game, this is appropriate and not a concern.

**Issues found:**

1. **`start()` resets `lastTime` but not `accumulator` (line 17).** If `start()` is called after `stop()`, any residual accumulator from the previous session carries over, potentially causing a multi-tick burst on resume. The accumulator should be reset to `0` in `start()`.

2. **`loop` is an arrow function class field (line 29).** This is valid ES2022, but means each `GameLoop` instance allocates a new function object. This is a non-issue for a singleton game loop.

3. **No error boundary inside the update/render callbacks.** If `updateCallback` throws, the `requestAnimationFrame` chain terminates silently. The loop should either wrap callbacks in try/catch or document this limitation.

---

### GameStateMachine.js — State Graph

**States defined in `GAME_STATES` (GameConfig.js):**
- `TITLE`, `REST`, `EXPLORE`, `COMBAT`, `NEUTRAL`, `GAME_OVER`

**GameStateMachine features:**
- `registerStateHandler(state, handler)` — called when a state is **entered**
- `registerTransitionHandler(fromState, toState, handler)` — called during a specific transition
- `transition(newState, data)` — performs the transition

**Issues found:**

1. **`COMBAT` state is defined in `GAME_STATES` but never used as a distinct state in the state machine.** Based on `CLAUDE.md`, combat happens inside `EXPLORE` mode. The `COMBAT` constant is vestigial. If future code accidentally transitions to `'COMBAT'`, it will silently succeed (no guard), entering a state with no registered handler — the game will appear frozen.

2. **No exit hooks.** `transition()` calls the new state's handler on entry but has no mechanism for the exiting state to run cleanup. Current code routes cleanup into transition handlers (`registerTransitionHandler`), but this requires registering a handler for every valid transition pair. If a transition pair is missing its handler registration (e.g., `EXPLORE->GAME_OVER` without a registered transition handler), cleanup is silently skipped.

3. **`transition()` is a no-op if `currentState === newState` (line 21).** This is intentional for idempotency, but means re-entering a state (e.g., restarting REST after REST) never fires the state handler. If a state needs to "refresh" itself (e.g., re-running `enterRestState` on a new run), callers must temporarily transition to a different state first, or call `enterRestState()` directly — which bypasses the state machine entirely. The session memory notes that `game.enterRestState()` is called directly in some places, confirming this pattern is already in use.

4. **No guard/condition system.** Transitions can be triggered by any caller regardless of current state. There is no whitelist of valid transitions. For example, `GAME_OVER -> EXPLORE` is technically possible from any code that calls `this.stateMachine.transition(GAME_STATES.EXPLORE)`. Guards (if implemented) would live in the calling code in `main.js`, not here.

5. **`previousState` tracks only one level of history (line 31).** This is sufficient for the current state graph, but any "return to previous state" pattern (e.g., closing a menu) can only go back one step.

6. **No `isValidTransition()` method.** Callers cannot query whether a transition is allowed before attempting it.

7. **`currentState` starts as `null` (line 5).** The first transition call produces key `null->TITLE`. Any `registerTransitionHandler('null->TITLE', ...)` registration would need to use the string `'null->TITLE'`, which is error-prone. In practice, `main.js` likely never registers a handler for the initial transition.

---

### Bugs & Logic Errors

| Severity | Location | Description |
|----------|----------|-------------|
| **CRITICAL** | `GameConfig.js` line 474 + 596 | **Duplicate key `'v'` in `BACKGROUND_OBJECTS`** — first definition (Tunnel Entrance Down) is silently overwritten by the second (Stairs Down). Tunnel Entrance Down cannot be accessed via `BACKGROUND_OBJECTS['v']`. The `entranceDirection: 'down'` tunnel feature is broken at the config level. |
| **CRITICAL** | `GameConfig.js` line 459 + 610 | **Duplicate key `'^'` in `BACKGROUND_OBJECTS`** — first definition (Tunnel Entrance Up) is silently overwritten by the second (Stairs Up). Tunnel Entrance Up cannot be accessed via `BACKGROUND_OBJECTS['^']`. |
| **Bug** | `GameConfig.js` line 663–673 | **`⊙` (Red Vein Marker) comment says "non-solid" but `solid: true` is set.** This is a collision-behavior bug or a documentation bug. If it's solid, it physically blocks the player underground, which seems unintended for a visual hint marker. |
| **Bug** | `GameConfig.js` line 347 | **Barrel `dropChance: 0.45` comment mismatch** — "65% of barrels are empty" contradicts 1 - 0.45 = 55% empty. |
| **Bug** | `GameLoop.js` line 17 | **`start()` does not reset `accumulator` to 0** — residual accumulator on re-start causes burst of update ticks. |
| **Minor** | `GameConfig.js` line 207 | **Brambles `dropEffect: 'destroyObject:spawnIngredient:~'`** — `~` is the char for the Puddle background object, not a defined ingredient char. Unless `LootSystem` handles this specially, spawning `~` as an ingredient would instantiate a background object char as an item pickup. |

---

### Schema Gaps & Inconsistencies

1. **`slowing` field type is inconsistent:**
   - Most entries use a numeric multiplier (`0.8`, `0.5`) — interpreted as speed fraction.
   - Tall Grass uses `slowing: true` (boolean).
   - Cut Grass uses `slowing: false` (boolean).
   - Ice has `slowing` absent entirely — yet has a 'slide' animation implying it should affect movement.
   - Any consumer code that branches on `if (obj.slowing)` will treat `0` and `false` differently from `undefined`. Code that multiplies by `obj.slowing` will NaN on `true`.

2. **`solid` field absent on many bullet-blocking objects:**
   - Tree (`&`), Stump (`Y`), Metal Box (`B`), Boulder (`Q`), and Shrine (`$`) all have `bulletInteraction: 'block'` but no `solid: true`. This means physics collision treats them as passable while projectile code treats them as walls. Whether this is intentional (player walks through trees but bullets stop) or an oversight varies by object.
   - Chasm (`▓`) and Chicken Leg (`λ`) have `solid: true` but `bulletInteraction: 'pass-through'` — the inverse inconsistency.

3. **`indestructible` absent on many objects lacking `hp`:**
   - Water (`=`), Puddle (`~`), Fire (`!` — has `indestructible: true`), Shrine (`$` — has `indestructible: true`). Water and Puddle have neither `hp` nor `indestructible`. Whether the absence of `hp` is treated as "indestructible" by the interaction system needs confirmation. If the system checks `obj.hp > 0`, then `undefined > 0` is `false` and the object would be treated as destroyed.

4. **`dropChance` absent on several objects with `dropEffect`:**
   - Bush (`%`) has `dropEffect: 'destroyObject'` but no `dropChance`. Since the effect destroys the object without spawning anything, this may be intentional — but it's unclear whether the absence of `dropChance` means "always drop" or "use default."
   - Crate (`#`) has `dropEffect: 'destroyObject:spawnRandom'` but no `dropChance`. Metal Box (`B`) same. If `dropChance` absence means 100% drop rate, this is correct for crates.

5. **`conductivity` absent on several objects:**
   - Bush (`%`) has `conductivity: 'none'` (explicit). All objects with fire/water interactions have it. But several indestructible objects (`$`, `≡`, `∩`, `▓`, `█`, etc.) omit it. If lightning/electrify code iterates objects and reads `conductivity`, undefined will fail a string comparison.

6. **`BACKGROUND_OBJECT_VARIANTS` and `BACKGROUND_OBJECTS['~']` (Puddle):**
   - There are two separate Puddle definitions: the static entry in `BACKGROUND_OBJECTS` and a `water` variant in `BACKGROUND_OBJECT_VARIANTS`. The variant has additional fields (`makesWet`, `steamOnFire`, `damaging`, `damage`) that the static entry lacks. It's unclear which system uses which. The `lava` and `mud_dry`/`mud_wet` variants have no corresponding entries in `BACKGROUND_OBJECTS` at all. These may be unused/planned features.

7. **`POLYMORPH_OUTCOMES` stubs:**
   - `lesserEnemy`, `equivalentEnemy`, and `boss` outcomes contain only a `weight` property and a comment. No `objects`, `enemyPool`, or `spawnFn` field exists. Downstream code reading these must handle the missing fields or will crash.

8. **Slope object (`ʌ`) missing paired directions:**
   - Only `slopeDirection: 'up'` is defined. If the ASCENT or RIDGE room types need slopes in other directions, those chars are not configured.

9. **`renderOnlyOnPlane` vs `alwaysRender` field naming:**
   - Tunnel walls use `renderOnlyOnPlane: 1` (numeric plane index).
   - Tunnel entrances use `alwaysRender: true`.
   - Hut Door uses `alwaysRender: true`.
   - These are parallel mechanisms for the same concern (rendering visibility rules) but use different field names and semantics. A unified `renderRule: 'always' | 'plane0' | 'plane1'` field would be cleaner.

---

### Cross-Reference Notes

**For the main.js / systems review team:**

1. **`GAME_STATES.COMBAT` is a dead constant.** Any state machine transition to `'COMBAT'` in main.js would silently succeed with no registered handler. Confirm it is never used, then remove it or add a guard.

2. **`GameStateMachine` has no exit hooks.** All state cleanup must be wired via `registerTransitionHandler` pairs. If main.js calls `enterRestState()` or similar directly (bypassing `stateMachine.transition()`), the state machine's `currentState` and `previousState` will be out of sync. The session memory confirms this pattern exists.

3. **`GameLoop.accumulator` not reset on `start()`** — if the game ever calls `gameLoop.stop()` followed by `gameLoop.start()` (e.g., on death/restart without page reload), the first few frames after restart will run extra update ticks equal to the residual accumulator. For a game that resets all state on death this is likely harmless but worth fixing.

4. **`BACKGROUND_OBJECTS['^']` and `BACKGROUND_OBJECTS['v']` are Stairs Up/Down (not Tunnel Entrances Up/Down)** due to the duplicate-key overwrite. Any system that uses `'^'` to represent a tunnel entrance is receiving the Stairs Up definition instead. This affects: `PlaneSystem`, `TrapSystem`, physics collision, any room generator that places `^`/`v` as cave entrances.

5. **`Brambles dropEffect` drops `~`** — verify that `LootSystem` interprets `~` as the Puddle background object variant (i.e., spawns a floor puddle) rather than trying to instantiate it as an `Item`. If it's treated as an item char, the drop is likely invisible or broken.

6. **`slowing: true` on Tall Grass** — verify that `PhysicsSystem` handles both boolean and numeric `slowing` values. If it does `player.speed *= obj.slowing`, then `speed *= true` produces `speed * 1` (no slow), which is the opposite of the intended mechanic.

7. **`⊙` Red Vein Marker `solid: true`** — if PhysicsSystem treats it as solid, it blocks player movement underground at the location of a surface secret vein. Confirm whether this is intentional (force the player to stay away from the marker) or a bug.

8. **`INTERACTION_RANGE = 24` is 1.5 × `GRID.CELL_SIZE`** — if `GRID.CELL_SIZE` ever changes (e.g., to support different screen resolutions), this constant will become inconsistent. Recommend expressing as `GRID.CELL_SIZE * 1.5`.
