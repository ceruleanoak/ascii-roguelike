# NPC ENTITIES REVIEW

Reviewed 2026-05-15. Files examined: `NeutralCharacter.js`, `CharacterNPC.js`, `ErrandCharacter.js`, `BridgeWorker.js`, `Leshy.js`, `Rusalka.js`, `WiseFellow.js`, `Witch.js`, `CampNPC.js`, plus `NeutralRoomSystem.js`, `HutSystem.js`, `CampNPCSystem.js`, `PolymorphSystem.js`, `CharacterSystem.js`, and key sections of `main.js`, `ExploreRenderer.js`, `RoomGenerator.js`.

---

## Inheritance Hierarchy

```
NeutralCharacter  (base)
  ├─ ErrandCharacter    — post-clear errand quest giver; hop animation; item indicator
  ├─ BridgeWorker       — W-room bridge donation NPC; hop animation; material icons
  ├─ Leshy              — green-zone chase event; flee-to-exit AI
  ├─ Rusalka            — fishing-triggered lethal puller; input suppression
  ├─ WiseFellow         — hut interior; proximity hint fade
  ├─ Witch              — hut interior; timed polymorph trigger
  └─ CampNPC            — C-room mercenary; 4-state IDLE/INTERESTED/COMPANION/FLEEING

CharacterNPC      (standalone, no NeutralCharacter base)
  └─ REST-mode only; shows selectable characters with bobbing animation
```

**Note**: `CharacterNPC` is a completely independent class — no shared base with `NeutralCharacter`. This is intentional (REST-only, never in combat rooms) but means it duplicates rendering boilerplate.

---

## Method Catalog

| File | Method | Line | Purpose | Issues |
|------|--------|------|---------|--------|
| NeutralCharacter | `constructor(char, color, x, y)` | 8 | Init position, pulse, velocity, indicator | None |
| NeutralCharacter | `update(deltaTime)` | 26 | Tick pulse timer | Does not accept `game` — subclasses must add it |
| NeutralCharacter | `getPulseAlpha()` | 31 | Sine-wave alpha between pulseMin/Max | None |
| NeutralCharacter | `setIndicator(char, color, offsetY)` | 37 | Set indicator glyph above entity | None |
| NeutralCharacter | `clearIndicator()` | 41 | Remove indicator | None |
| NeutralCharacter | `getHitbox()` | 45 | Returns AABB centered on position | None |
| NeutralCharacter | `render(ctx, gridToPixel)` | 54 | Draw char + optional indicator | Font is bare `monospace`, not `'Unifont', monospace` |
| CharacterNPC | `constructor(characterType, x, y)` | 5 | Init '@' glyph, color from CHARACTER_TYPES, bob state | No `velocity` field — not that it needs it, but breaks duck-typing |
| CharacterNPC | `update(deltaTime)` | 21 | Vertical bobbing animation | No `game` param — consistent with REST-only use |
| CharacterNPC | `getHitbox()` | 27 | Returns hitbox at `position.x, position.y + idleOffset` | **Bug**: hitbox shifts vertically with animation offset; interaction checks use a moving hitbox rather than the stable position. Position.x is also uncentered (top-left, not center like NeutralCharacter). |
| CharacterNPC | `render(ctx, gridToPixel)` | 36 | Draw '@' char with bob offset | Font is bare `monospace` |
| ErrandCharacter | `constructor(x, y, requestedItem, stage)` | 11 | Extends NeutralCharacter; hop state, CLOSE_RANGE proximity | Stage defaults 0; STAGE_COLORS array has 3 entries (0–2) |
| ErrandCharacter | `update(deltaTime, game)` | 23 | Player proximity + hop animation | Calls `super.update(deltaTime)` correctly |
| ErrandCharacter | `getInteractionDistance()` | 53 | Returns CLOSE_RANGE | None |
| ErrandCharacter | `render(ctx, gridToPixel)` | 57 | Draw char + hop offset + item indicator when close | Font is bare `monospace` |
| BridgeWorker | `constructor(x, y)` | 9 | Extends NeutralCharacter; hop state | Char 'W' conflicts with Witch's char 'W' (different color, but same glyph) |
| BridgeWorker | `getInteractionDistance()` | 16 | Returns CLOSE_RANGE | None |
| BridgeWorker | `update(deltaTime, game)` | 20 | Player proximity + hop | **Duplicate**: 100% identical hop logic to ErrandCharacter |
| BridgeWorker | `render(ctx, gridToPixel)` | 47 | Draw char + hop + material icons when close | Only BridgeWorker uses `'Unifont', monospace` — others use bare `monospace` |
| Leshy | `constructor(x, y, exits)` | 9 | Extends NeutralCharacter; flee state, exit targeting | None |
| Leshy | `findNearestExit()` | 25 | Finds nearest N/E/W exit from current position | Exit positions computed from constants — **duplicated** in `startFleeing()` |
| Leshy | `startFleeing()` | 66 | Sets flee=true, computes targetPosition, adds '!' indicator | Exit position map duplicated from `findNearestExit()` |
| Leshy | `update(deltaTime, game)` | 90 | Flee movement toward exit, sets `reachedExit` flag | Updates `this.position` directly (bypasses PhysicsSystem); `game` param accepted but unused |
| Rusalka | `constructor(x, y)` | 19 | Extends NeutralCharacter; suppression/pull ramp | Sets custom pulseMin/pulseMax/pulseSpeed correctly |
| Rusalka | `update(dt, game)` | 33 | Contact kill, input suppression ramp, pull force, water drift | Writes directly to `player.velocity` (`.vx`/`.vy`) while PhysicsSystem uses `.vx`/`.vy` — consistent with engine convention |
| Rusalka | `cleanup(player)` | 75 | Restore `player.rusalkaInputScale = 1.0` | None |
| WiseFellow | `constructor(x, y)` | 16 | Extends NeutralCharacter; hintText null until setHint() | None |
| WiseFellow | `setHint(zoneName)` | 23 | Picks random entry from `ZONES[zoneName].wiseSayings` | Falls back to generic text — OK |
| WiseFellow | `update(dt, game)` | 32 | Proximity fade of `hintAlpha` toward 0 or 1 | None |
| Witch | `constructor(x, y)` | 14 | Extends NeutralCharacter; sets `triggered=false`, `entryTimer=null` | Char 'W' same as BridgeWorker |
| Witch | `update(dt, game)` | 21 | 0.5s entry timer → sets `triggered = true` | **Logic gap**: `entryTimer` triggers once then never resets. If already polymorphed, returns early — but `triggered` stays false, so the 0.5s timer would run again on next hut entry (if interior is cached). |
| CampNPC | `constructor(x, y, campfirePos)` | 44 | Extends NeutralCharacter; full carrier interface + 4-state machine | `collisionMap` initialized to null; carrier fields (facing, plane, etc.) are inline |
| CampNPC | `takeDamage(amount, source)` | 89 | Invulnerability-gated damage with kill detection | Return value is ambiguous: `true` on death, `{ damaged: true }` otherwise |
| CampNPC | `isInvulnerable()` | 99 | Timer check | None |
| CampNPC | `setIdle()` | 105 | State transition + clear indicator | None |
| CampNPC | `setInterested()` | 110 | State transition + clear indicator | None |
| CampNPC | `setCompanion()` | 115 | State transition + clear indicator | None |
| CampNPC | `startFleeing(exits)` | 120 | State → FLEEING, char swap to ☹, pick exit | None |
| CampNPC | `static acceptsWeapon(item)` | 131 | Filters weapons the NPC will pick up (sword/bow/gun) | None |
| CampNPC | `_pickFleeExit(exits)` | 141 | Nearest-exit logic (all 4 dirs, including south) | **Duplicate**: nearly identical to `Leshy.findNearestExit()` + `startFleeing()`. Third copy of this pattern. |
| CampNPC | `update(dt, game)` | 169 | Tick cooldowns, weapon update, flee movement | Calls `super.update(dt)` correctly |
| CampNPC | `_updateFleeing(dt)` | 181 | Move toward flee target | Copies position directly; consistent with Leshy |
| CampNPC | `render(ctx, gridToPixel)` | 205 | Super render + weapon icon above head | Calls `super.render()` — inherits base class monospace font issue |

---

## Interaction Pattern Consistency

How each NPC triggers its effect:

| NPC | Trigger Mechanism | Consistent? |
|-----|------------------|-------------|
| **ErrandCharacter** | Player presses SHIFT while within `CLOSE_RANGE` → `ErrandSystem.checkGive()` in `handleShiftPress()` | Ad-hoc: checked via `instanceof ErrandCharacter` inside `ErrandSystem.checkGive` |
| **BridgeWorker** | Player presses SPACE within `CLOSE_RANGE` → `RidgeSystem.openMenu()` in `handleSpacePress()` | Ad-hoc: proximity read via `ridgeSystem.getWorkerDistance()` |
| **Leshy** | Shaking bush destroyed/interacted → spawned into `neutralCharacters`; auto-runs on its own (no player prompt) | Distinct: no player action to trigger dialogue |
| **Rusalka** | Spawned by FishingSystem on catch → auto-updates (no player action needed) | Distinct: no player prompt |
| **WiseFellow** | Proximity-driven; hint fades in automatically. No input required | Distinct: fully passive |
| **Witch** | Entry timer; no player action required | Distinct: fully passive, fires on room entry |
| **CampNPC** | SPACE near companion for coin → `CampNPCSystem.handleSpacePress()` | Ad-hoc via `campNPCSystem.handleSpacePress()` |
| **CharacterNPC** | Player walks into NPC's hitbox → `CharacterSystem.swapWithCharacter()` checked in REST update | Ad-hoc: direct position overlap in `updateRestState()` |

**Finding**: There is no unified interaction dispatcher. Each NPC type has a bespoke trigger wired into a different site in `main.js` or its owning system. This is manageable at the current count but will require a pattern decision as NPC count grows.

---

## State Management Audit

| NPC | Held State | Reset on Room Clear | Reset on Death/REST |
|-----|-----------|--------------------|--------------------|
| ErrandCharacter | `requestedItem`, `stage`, `hopCycleTimer`, `hopOffset`, `playerIsClose` | Removed from `neutralCharacters[]` on room transition | ErrandSystem.resetOnDeath() called at death |
| BridgeWorker | `hopCycleTimer`, `hopOffset`, `playerIsClose` | Persists on `room.bridgeWorker` reference; re-pushed to `neutralCharacters` on re-entry if bridge not built | `bridgeWorker` lives on room object; rooms are discarded between zones |
| Leshy | `exits`, `speed`, `targetExit`, `targetPosition`, `reachedExit`, `fleeing` | Removed from `neutralCharacters[]` when `reachedExit` | Spliced from array; no lingering reference |
| Rusalka | `inputSuppression`, `pullRamp`, `alive`, `pulseTimer` | `FishingSystem.resetForNewRoom()` calls `cleanup()` on room exit/REST entry | `cureRusalka` nulled in `enterRestState()` and death path |
| WiseFellow | `hintText`, `hintAlpha`, `pulseTimer` | Lives in `game.hutInterior.npcs[]`; interior cached per room (bug #36 fixed) | `hutInterior` nulled in `enterRestState()` and death path |
| Witch | `triggered`, `entryTimer`, `pulseTimer` | Same as WiseFellow — interior cached | Same as WiseFellow |
| CampNPC (room) | `state`, `weapon`, `hp`, `hopOffset`, `_pickupCooldown` | Room's `campNPC` field is per-room; discarded with room | No explicit death-path clear seen — see bug note below |
| CampNPC (companion) | All of above + `fleeTargetExit`, `fleeTargetPosition`, `fleeReached` | Carried across rooms via `game.companion` | **`game.companion` is never initialized in `main.js` constructor and is not nulled in the death/game-over reset block** |
| CharacterNPC | `characterType`, `idleTimer`, `idleOffset` | `game.characterNPCs = []` in death reset and REST entry | Cleared in death reset at line 4800 |

---

## Special NPC Analysis

### Rusalka — FROG Spell Path

The path is fully implemented and correct:

1. `FishingSystem.update()` calls `spawnRusalkaAt()` when `rusalkaChance` rolls true in green zone
2. `Rusalka.update()` sets `player.hp = 0` on contact → player dies OR
3. Separately: `Witch` (hut) calls `polymorphSystem.activatePolymorph(game, true)` → player becomes a frog
4. Player enters an 'L' (Lake) room while polymorphed → `PolymorphSystem.update()` calls `spawnCureRusalka()`, creating a plain `NeutralCharacter` (not `Rusalka`) on `game.cureRusalka`
5. Player walks into cure Rusalka (within `CURE_CONTACT_RANGE`) → `deactivatePolymorph(game, true)` → `game.knownSpells.add('FROG')` at line 100
6. Alternatively: HEAL/UNCURSE spell + wish → `cureViaWish()` → same `deactivatePolymorph(game, true)` call

**Correct and complete.** The cure Rusalka is a `NeutralCharacter` instance (not a `Rusalka` instance), which is correct — it is benign.

### WiseFellow

Fully implemented. `HutSystem.generateHutInterior()` creates a WiseFellow only for `hutKind === 'wise_man'`. **Problem**: `'wise_man'` is never assigned in `RoomGenerator.generateHRoom()`. The valid hutKinds generated are `'enemy_encounter'`, `'neutral_npc'`, and `'witch'`. The `'wise_man'` and `'barrel_room'` branches in `HutSystem.generateHutInterior()` are dead code — WiseFellow can never spawn in the current build.

### Witch

Implemented and functional. `Witch.update()` starts a 0.5s `entryTimer`, then sets `triggered = true`. `HutSystem.update()` polls `npc.triggered` and calls `polymorphSystem.activatePolymorph(game, true)`. The polymorph guard (`if (game.player.polymorphed) return`) prevents double-application.

**Edge case**: `triggered` is never reset to `false`. If the player exits and re-enters the same hut (interior is cached per bug-36 fix), the already-triggered Witch will not fire again because the Witch's `update()` early-returns when `this.triggered` is true. That is correct. However, if the player was cured and re-enters the same hut, `triggered` is still `true` and `HutSystem` will re-fire `activatePolymorph` on the next frame — but `activatePolymorph` guards `if (player.polymorphed) return`, so it will only re-polymorph if the player was cured. This is a design question rather than a hard bug, but the behavior may be surprising.

### Leshy

Fully implemented chase-event chain. Three sightings (player follows Leshy through the same exit direction three times) transitions to `NEUTRAL` state `leshyGrove`. The Leshy entity itself is simple and correct. The grove content is in `neutralRooms.js` and is feature-complete (3 cuts, prize reveal, celebration).

### CampNPC

The most complex NPC. Architecture is well-designed. The companion carrier interface (duck-typing Player) is clean. See bug section for the death-reset gap.

---

## Missing NPC Types

| `neutral_npc` hutKind | Description | Status |
|-----------------------|-------------|--------|
| `'neutral_npc'` | HutSystem `generateHutInterior()` fallthrough — interior is left empty | Intentional stub labeled `// 'neutral_npc': interior left clear (fallthrough)`. No NPC spawns. |
| `'wise_man'` | Spawns WiseFellow | **Dead code path** — RoomGenerator never assigns this hutKind. WiseFellow is unreachable. |
| `'barrel_room'` | Spawns 3–5 barrels | **Dead code path** — same issue. |

**Neutral rooms** (from `neutralRooms.js`):

| Room Key | Referenced by | NPC spawned |
|----------|--------------|------------|
| `leshyGrove` | `main.js` Leshy chase path | No NPC (Leshy is rendered as a stand-alone entity in `onRender`) |
| `threeRoom` | Not found in `main.js` or `RoomGenerator` | Stub — no NPC, no wiring |
| `drawRoom` | Not found in `main.js` or `RoomGenerator` | Stub — no NPC, no wiring |

`threeRoom` and `drawRoom` are defined in `NEUTRAL_ROOMS` but no code path calls `transitionToNeutralRoom('threeRoom')` or `transitionToNeutralRoom('drawRoom')`. They are unreachable stubs.

---

## Base Class vs. Subclass Logic Distribution

### Should move to `NeutralCharacter`

**1. Hop animation (highest priority)**
`ErrandCharacter` and `BridgeWorker` duplicate 100% of their hop animation logic — same constants (`HOP_PERIOD = 2.2`, `HOP_ACTIVE = 0.38`), same timer/offset math, same proximity check pattern. This belongs in the base as an opt-in behavior, e.g. `this.hopEnabled = true`, `this.hopOffset = 0`.

**2. Flee-to-exit logic (high priority)**
`Leshy.findNearestExit()`, `Leshy.startFleeing()`, `CampNPC._pickFleeExit()`, and `CampNPC._updateFleeing()` are three near-identical implementations of "find nearest available exit, move toward it, set reachedExit." The only differences: Leshy excludes south; CampNPC includes south. A base `startFleeing(exits, includeSouth)` method would eliminate the duplication.

**3. Font declaration**
`render()` in the base class uses `monospace`. BridgeWorker overrides to `'Unifont', monospace`. All NPC chars should be rendered via Unifont (per CLAUDE.md font rules — Unifont for all entity chars). The base class `render()` should use `'Unifont', monospace` and BridgeWorker's override would become unnecessary.

**4. `getInteractionDistance()` stub**
ErrandCharacter and BridgeWorker define this method. It should have a default implementation on the base class returning `null` or 0, so callers don't need to guard `typeof npc.getInteractionDistance === 'function'`.

---

## Bugs & Logic Errors

### Bug 1 — `game.companion` not initialized or reset on death
**Severity: P1 (potential undefined reference)**
`game.companion` is assigned in `CampNPCSystem` but never declared in `main.js` constructor. If `CampNPCSystem` reads `game.companion` before any C-room is visited, it reads `undefined` (not `null`), which evaluates falsy — so the `if (companion)` guard at line 70 of `CampNPCSystem.js` happens to save it from crashing. However, `ExploreRenderer._renderCampNPCs()` reads `game.companion` directly and relies on truthiness as well. More critically: the death/game-over reset block (main.js ~4780–4827) does not null `game.companion`. A companion that survives to game-over will persist into the next run, carrying weapon state and a reference to the previous room's enemy arrays via its `collisionMap` field.

**Fix**: Add `this.companion = null;` to the game constructor, and add `this.companion = null;` to the death reset block alongside `this.captives = []`.

### Bug 2 — `CharacterNPC.getHitbox()` applies animation offset to position
**Severity: P2 (minor interaction jitter)**
`getHitbox()` returns `{ x: this.position.x, y: this.position.y + this.idleOffset, ... }`. The hitbox oscillates ±2px vertically with the bob animation. The interaction check in `updateRestState()` reads position directly (not via `getHitbox()`), so this is low impact today — but if any system ever uses `getHitbox()` for CharacterNPC overlap, the result will be wrong.

### Bug 3 — `WiseFellow` is unreachable (hutKind mismatch)
**Severity: P2 (dead feature)**
`RoomGenerator.generateHRoom()` only assigns `hutKind` from `['enemy_encounter', 'neutral_npc', 'witch']`. `HutSystem.generateHutInterior()` has `wise_man` and `barrel_room` branches that can only be reached if the caller passes those strings — but no caller does. WiseFellow is fully implemented but cannot appear in gameplay without a hutKind entry point.

### Bug 4 — `threeRoom` and `drawRoom` are unreachable neutral rooms
**Severity: P2 (dead content)**
`NEUTRAL_ROOMS` defines `threeRoom` and `drawRoom`. Neither `main.js` nor `RoomGenerator` calls `transitionToNeutralRoom('threeRoom')` or `transitionToNeutralRoom('drawRoom')`. They are stubs with no wiring.

### Bug 5 — `Leshy.startFleeing()` duplicates exit position map from `findNearestExit()`
**Severity: P2 (maintenance hazard)**
Both methods declare the same `exitPositions` object. If exit geometry changes (e.g., GRID.COLS changes), one copy could be updated without the other, causing the Leshy to target a different position than the one it computed as "nearest."

### Bug 6 — `NeutralCharacter.render()` uses bare `monospace` font
**Severity: P2 (visual inconsistency)**
The base class `render()` at line 61 sets `ctx.font = \`${GRID.CELL_SIZE}px monospace\``. Per CLAUDE.md, entity rendering must use Unifont. Most NPC glyphs are ASCII letters, so the visual difference is typically invisible — but NPC chars like `☺` (CampNPC) and `☹` (CampNPC fleeing) rendered via `super.render()` may fall back to a system emoji font rather than Unifont, causing inconsistent glyph sizing.

### Bug 7 — `Witch.entryTimer` never resets after cure
**Severity: P2 (minor design edge case)**
If the player is cured (e.g., via HEAL spell), exits the hut, then re-enters the same hut in the same room visit, `triggered` is already `true` and the Witch's `update()` returns immediately after the `this.triggered` check — so the timer does not restart. `HutSystem` will immediately poll `npc.triggered === true` and call `activatePolymorph` again on the very next frame. `activatePolymorph` guards `if (player.polymorphed) return` so it won't double-apply, but it also means the cure is immediately undone on re-entry. Whether this is intended game design or a bug depends on intent.

---

## Redundancies

### R1 — Hop animation (ErrandCharacter vs BridgeWorker)
The entire hop update block (constants `HOP_PERIOD`, `HOP_ACTIVE`, timer loop, parabolic offset) and the corresponding render offset logic are copy-pasted. 100% duplicate, no divergence. Should be extracted to base class or a shared mixin.

### R2 — Flee-to-exit (Leshy + CampNPC)
`Leshy.findNearestExit()`, `Leshy.startFleeing()`, and `CampNPC._pickFleeExit()` + `CampNPC._updateFleeing()` implement the same algorithm three times. The only behavioral difference is that CampNPC includes south as a valid exit. Could be unified as `NeutralCharacter.startFleeing(exits, { includeSouth: false })`.

### R3 — Font string in every render override
Each NPC that overrides `render()` re-declares `ctx.font`. If the base class used the correct font, only BridgeWorker (currently the only correct one) would need no override.

### R4 — Double NPC update loop in `HutSystem.update()`
Lines 464–474 iterate `game.hutInterior.npcs` twice — once for `npc.update()` and once for Witch trigger polling. A single loop could handle both.

---

## Cross-Reference Notes

- **`player.inLiquid`**: Set by water collision detection in `main.js` each frame (line 3040). `Rusalka.update()` reads it correctly. No issues.
- **`player.rusalkaInputScale`**: Initialized on `Player` at line 167. Reset in `player.reset()` at line 996. Also reset by `Rusalka.cleanup()`. All paths clean.
- **`knownSpells` lifecycle**: Created as `new Set()` in constructor (line 146), reset at death (line 4782), and written by `PolymorphSystem.deactivatePolymorph(game, true)` (line 100) and by enemy `learnSpellOnDeath` (line 4032 for HEX). Consistent.
- **Rusalka vs. Cure Rusalka naming collision**: The lethal fishing Rusalka is a `Rusalka` class instance living in `fishingSystem.rusalka`. The benign cure Rusalka is a plain `NeutralCharacter` instance living in `game.cureRusalka`. They share the same char ('R') and color ('#88ffee') but are structurally different. The shared appearance is intentional (they look identical to create a mystery), but the naming of `game.cureRusalka` could mislead contributors into thinking it's a `Rusalka` class instance.
- **BridgeWorker char 'W' and Witch char 'W'**: Both use 'W' as their glyph but differ in color (`#cc9933` vs `#9955cc`). They never appear in the same context (one is in EXPLORE rooms, the other is inside hut interiors), so no collision in practice. Still worth noting for future char map documentation.
- **`ALLOWED_WEAPON_TYPES` in CampNPC**: Uses string `'BOW'` and `'GUN'` instead of `WEAPON_TYPES.BOW` / `WEAPON_TYPES.GUN` constants. If weapon type enum values ever change, this will silently break weapon pickup.
- **`neutralRooms.js` uses `renderer.drawTextWithAlpha`**: The `onRenderBefore` callback in `drawRoom` and `onRender` in `leshyGrove` call `renderer.drawTextWithAlpha()`. NeutralRenderer passes `this.renderer` (the `ASCIIRenderer` instance) as the first argument to these hooks. `ASCIIRenderer.drawTextWithAlpha` exists (line 204). No issue.
