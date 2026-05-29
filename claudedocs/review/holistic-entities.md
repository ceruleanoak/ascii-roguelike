# Holistic Entities Review — ASCII Roguelike

**Date:** 2026-05-15  
**Scope:** All entity files: Player.js, Item.js, Enemy.js, GooBlob.js, GooDragon.js, GooHead.js, LakeBoss.js, TurtleShell.js, TurtleHead.js, TurtleLeg.js, NeutralCharacter.js, CharacterNPC.js, ErrandCharacter.js, BridgeWorker.js, Leshy.js, Rusalka.js, WiseFellow.js, Witch.js, CampNPC.js, BackgroundObject.js, Particle.js, Debris.js, Puddle.js, RewardObject.js, Captive.js, Ingredient.js, Bobber.js, FishEntity.js  
**Source:** Synthesized from four sub-agent reviews (entities-core.md, entities-enemies.md, entities-npcs.md, entities-support.md)

---

## Entity Health Summary

### Core Entities (Player.js, Item.js) — Needs Work

Player.js is the most consequential file in the codebase and has the most consequential structural problem: `Player.reset()` is systematically incomplete. Over 35 fields initialized in the constructor are not reset on death, including `shieldCharges`, `statusEffects`, `burnDuration`, `activeSappingBats`, `grabbed`/`grabbedBy`, `plane`, `inHut`/`inMaze`, `pendingBlink`, and all armor-derived fields. The file functions correctly in the common path because `enterRestState()` and `enterExploreState()` perform partial cleanup externally, but `reset()` is a public API contract that is badly broken. Item.js has a different problem: the four "special" gun patterns (burst, ring, spiral, wave) are missing 11+ bullet fields vs. the standard path, a missing attack pattern case (`'axe'`), a `createMeleeSlam` that returns a non-array and omits `shooterPlane`, and the Infusion Wand and gem wand spell effects are explicitly incomplete TODOs. Both files work well for their common cases; the problems live at the edges.

### Enemy Entities (Enemy.js + boss entities) — Needs Work

Enemy.js is a 3,688-line file that is mostly correct and well-structured. The AI archetypes are all implemented, pathfinding is sound, and status effects cover the expected range. The main concerns are: an operator-precedence bug in `updateVectorNavigation` that silently breaks a navigation guard, a `createFireBreath()` that omits `onHit: 'burn'` (fire enemies don't apply burn), and a duplicated kiter implementation path. Boss entities are a mixed picture. GooDragon is the most polished boss. GooHead has a real `let` scoping bug (`tx`/`ty` declared inside an `if` block but read outside it) that works by accident due to ordering. LakeBoss has a silent off-by-one that fires only 4 ice shots when 5 are intended. TurtleShell has a dead `_fireCone()` method and a dead `ENRAGED_THRESHOLD` constant. TurtleLeg routes leg hits through the `'head'` source string, accidentally making legs damageable in P1. GooDragon is the only boss with audio (`sfx` fields); every other boss is completely silent on damage.

### NPC Entities — Needs Work

The NPC hierarchy is well-designed for its current scope but carries two significant structural problems. First, `game.companion` (CampNPC companion state) is never initialized in the `main.js` constructor and is not nulled in the death/game-over reset block — a companion carrying weapon state and stale collision references persists into subsequent runs. Second, WiseFellow is fully implemented but completely unreachable: the `'wise_man'` hutKind is never assigned by RoomGenerator, so WiseFellow cannot spawn in any current build. Beyond these, there are two dead neutral room entries (`threeRoom`, `drawRoom`) with no wiring, a hop animation duplication between ErrandCharacter and BridgeWorker, a three-way flee-to-exit duplication (Leshy, CampNPC), and the base class `NeutralCharacter.render()` uses bare `monospace` instead of `Unifont`, violating project font rules for almost every NPC.

### Support Entities (BackgroundObject, Particle, Debris, Puddle, etc.) — Needs Work

BackgroundObject has the most significant factory-pattern violation in the codebase: 10 fields are lazy-initialized at runtime (7 in BackgroundObject itself, 3 more by external monkey-patching from RoomGenerator and main.js). Two of these runtime fields (`damaging`, `isDryMud`) are used by `isWater()` and `isLava()` respectively — if they are read before the external caller sets them, they silently return `undefined`. The most user-visible bug in this group is that ember particles produced by burning objects are silently discarded after one frame because the plain-object ember shape lacks an `alive` field and the cleanup loop immediately splices them — players see no fire embers. There is also a `bulletInteraction: 'passthrough'` spelling mismatch in the fallback object that causes recipe sign objects to behave incorrectly under bullet contact. Particle.js itself is clean. Puddle.js has three of seven defined visual types with no effect handlers and no spawn paths.

---

## Cross-Cutting Patterns

### 1. Lazy Property Initialization Anti-Pattern

Documented in CLAUDE.md as an explicit anti-pattern. Found across:

- **BackgroundObject.js**: `isCampfire`, `_flickerTimer`, `electricBlinkTimer`, `electricBlinkOn`, `burnt`, `grassImprinted`, `grassResetTimer`, `grassRenderOffset`, `damaging`, `isDryMud` — 10 fields never declared in constructor
- **Item.js**: `_reloading`, `_reloadTicksPlayed`, `_reloadTicksPending` — 3 fields, `undefined` until first reload
- **Player.js**: `inLiquid` — not in constructor or `reset()`, set per-frame by main.js
- **GooHead.js**: `invulnerable` — set to `false` in constructor but comment says it should be set `true` on detach; `detach()` never sets it

### 2. `Player.reset()` / Death-State Inconsistency

The single most pervasive structural gap. Over 35 `Player` fields survive death with stale values. The same pattern appears at the system level: `game.companion` is never initialized in the constructor and is not nulled in the death reset block. Fields that persist incorrectly and have gameplay impact:

- `statusEffects` (goo, freeze, slimeBoost), `burnDuration`, `burnTickTimer`, `wetDuration`
- `shieldCharges`, `shieldMaxCharges`, `shieldBlocksAll`
- `activeSappingBats` (stale references to dead entities)
- `grabbed`, `grabbedBy` (stale GooHead reference)
- `plane` (player could start REST on plane 1)
- `inHut`, `inMaze` (interior flags not cleared)
- `pendingBlink` (yellow mage blink could fire at run start)
- `continuousRollActive`, `isStaffBlocking`, `staffSwingHasFired`
- `meleeResist`, `burnResist`, `slimeImmune`, `massBonus`, `rollCooldownMult`, `extraIframes` (armor-derived; not re-applied after death if no re-equip)
- `game.companion` (system-level, same category)

### 3. PlaneSystem Inconsistency

Enemy.js, GooHead.js, and most combat entities correctly use `inSamePlane()`, `planeOf()`, and `objectOnPlane()`. Violations found only in:

- **GooBlob.js**: `isNearEntity()` uses distance-only check, no plane filter — could affect entities on different planes
- **Item.js `createMeleeSlam`**: `shooterPlane` field omitted — all slam attacks behave as plane-0 regardless of player plane, meaning slam hits plane-0 enemies even when the player is on plane 1

### 4. Missing / Wrong `sfx` Fields on Boss Entities

The per-enemy SFX pattern (`data.sfx.hit`, `data.sfx.death`) is established in Enemy.js and correctly implemented in GooDragon. It is absent from:

- **GooHead**: no `sfx` field in HEAD_DATA
- **LakeBoss**: no `sfx` field — damage is completely silent
- **TurtleShell**: no `sfx` field in SHELL_DATA
- **TurtleHead**: no `sfx` field in HEAD_DATA
- **TurtleLeg**: no `sfx` field

Four out of five non-dragon boss entities produce no audio feedback on damage.

### 5. Font Usage Violations

Per CLAUDE.md: all entity rendering must use `'Unifont', monospace`. Violations found in:

- **NeutralCharacter.js `render()`**: uses bare `monospace` — affects all NPC subclasses that call `super.render()`: ErrandCharacter, Leshy, Rusalka, WiseFellow, Witch, CampNPC
- **CharacterNPC.js `render()`**: uses bare `monospace`
- **Captive.js `render()`**: uses bare `monospace` — cage bars and captive char misalign with Unifont entities
- **BridgeWorker.js `render()`**: correctly uses `'Unifont', monospace` — the only NPC subclass that gets it right

The root fix is in `NeutralCharacter.render()`. Fixing the base class would cascade to all subclasses except CharacterNPC and Captive, which override `render()` independently.

### 6. Flee-to-Exit Algorithm Duplication (NPC Layer)

The "find nearest exit, move toward it, set `reachedExit`" pattern appears three times:

- `Leshy.findNearestExit()` + `Leshy.startFleeing()`
- `CampNPC._pickFleeExit()` + `CampNPC._updateFleeing()`
- (Leshy.startFleeing also internally duplicates the exit position map from findNearestExit, making it technically four copies)

If exit geometry ever changes, all copies must be updated in sync. Should be a single `NeutralCharacter.startFleeing(exits, opts)` method.

### 7. Dead Content / Unreachable Features

Multiple implemented features that cannot be reached in the current build:

- **WiseFellow NPC**: fully implemented, zero spawn paths (hutKind `'wise_man'` never assigned)
- **`barrel_room` hutKind**: branch in HutSystem but never assigned by RoomGenerator
- **`threeRoom`, `drawRoom` neutral rooms**: defined in `NEUTRAL_ROOMS`, never wired in main.js or RoomGenerator
- **TurtleShell `_fireCone()`**: method is implemented but never called from anywhere
- **`LakeBoss.ENRAGED_THRESHOLD`**: constant declared, never referenced
- **Infusion Wand** (Item.js): explicit `// TODO: Implement in Phase 6` — returns null
- **Gem wand spell effects**: described as "Phase 2" in code comments — placeholder only
- **`Player.shouldRenderVisible()`**: always returns `true`, never consulted
- **`Enemy.attack()` method at line 2754**: returns raw damage int, ignored by all callers who use `createAttack()` instead
- **Puddle types `mud`, `water`, `poison`, `lava`**: defined in `VISUALS`, no effect handlers, no spawn paths
- **`acid` and `bleed` enemy status effects**: implemented and ticking correctly but no enemy in enemies.js uses `onHit: 'acid'` or `onHit: 'bleed'`

### 8. Return Shape Inconsistency

- **`createMeleeSlam()`**: returns a single object; every other melee pattern returns an array. CombatSystem guards with `Array.isArray()` but callers that assume array shape will fail.
- **`Player.takeDamage()`**: 5 distinct return shapes (`bool`, `{damaged,reflect,...}`, `{dodged}`, `{blocked}`, `{immune}`). Each caller must destructure correctly; omitting the flag propagation is a silent failure mode.
- **`CampNPC.takeDamage()`**: returns `true` on death, `{damaged: true}` on hit — mixed shape.

---

## Consolidated Bug Registry — Entities

| Rank | Severity | Entity | Bug | Impact |
|------|----------|--------|-----|--------|
| 1 | P1 | Player.js | `Player.reset()` missing 35+ fields — status effects, grab state, shield charges, plane, interior flags, armor-derived fields, sapping bat refs, staff blocking state, pending blink all survive death | Previous run's state bleeds into new run; worst cases: grabbed by non-existent entity, still in plane 1, still in hut, armor effects without armor |
| 2 | P1 | NPC layer | `game.companion` never initialized in constructor or nulled in death reset — CampNPC companion persists across runs with stale weapon state and collision map refs | Undefined reference risk at startup; companion with wrong equipment in new run |
| 3 | P1 | Enemy.js | `createFireBreath()` missing `onHit: 'burn'` — fire-type enemies deal raw damage but do not apply burn DoT | Fire enemies do not burn the player; the `fire` attack type's core behavior is absent |
| 4 | P1 | Item.js | `attackPattern: 'axe'` has no case in `createMeleeAttack()` switch — Pickaxe falls through to single-point default hit | Pickaxe deals incorrect damage and pattern; a primary tool weapon is broken |
| 5 | P1 | Item.js | Special gun patterns (burst/ring/spiral/wave) missing 11 bullet fields — `homing`, `ricochet`, `pierce`, `split`, `knockback`, `lifesteal`, `chain`, `explode`, `attackId` all absent | Any gun with these patterns silently loses all special capabilities; `attackId` gap means burst bullets don't share iframe suppression |
| 6 | P1 | BackgroundObject.js | Ember plain objects immediately discarded — `alive = undefined` causes cleanup loop to splice them on frame 1; no visible fire embers at runtime | Fire spread produces no visible ember particles despite the generation code running correctly |
| 7 | P1 | GooHead.js | `let tx, ty` declared inside `if (!this.isGrabbing)` block but read outside via `if (tx === undefined)` — `let` does not hoist; this only avoids ReferenceError because the grab-hold block happens to zero velocity before orbit code runs | Grab-state orbit logic works by accident; any ordering change will produce incorrect velocity during grab |
| 8 | P2 | Player.js | `freezeImmune` not checked in `applyStatusEffect('freeze')` — environmental freeze sources bypass armor immunity | Freeze-immune armor is only effective against damage-source freeze, not environmental freeze |
| 9 | P2 | Player.js | `Player.applyStatusEffect()` only handles 3 effects (goo/freeze/slimeBoost); callers passing `'burn'`, `'stun'`, etc. silently no-op | Already caused two production bugs (#37, #38); fragile API with no documentation of the off-ramp |
| 10 | P2 | Item.js | `createMeleeSlam` missing `shooterPlane` — defaults to 0, so slam attacks always hit plane-0 enemies regardless of player's plane | Player on plane 1 can slam-hit plane-0 enemies; plane-1 enemies immune to player slam in U-rooms |
| 11 | P2 | Item.js | `fireChargeHammerAttack` loses `canSmash`, `electric`, `isBlade`, `isBlunt`, `isPickaxe`, `cyclesExitLetter` flags — only `weaponSubtype` is injected | Crystal Maul charged mega-attack cannot smash rocks; other hammer behaviors also absent |
| 12 | P2 | Item.js | Shockwave damage positions use player top-left corner; visual shockwave is centered — half-cell offset between visual ring and actual damage zone | Players see the ring in one place, hits land offset by ~8px |
| 13 | P2 | Enemy.js | Operator precedence bug in `updateVectorNavigation` (line 2212): `!this.stuckTimer > 0.3` always evaluates `false` — the stuck-bypass branch for close targets is broken | Navigation guard never fires correctly when stuck; enemy pathfinding is less efficient near stuck state |
| 14 | P2 | LakeBoss.js | Ice stream fires 4 shots instead of 5 — `order = [0,1,2,3]` has 4 elements but `ICE_STREAM_SHOTS = 5`; rightmost cone position never reached | Boss fires truncated ice cone; described 5-shot pattern is impossible |
| 15 | P2 | GooHead.js | `player.applyStatusEffect('goo', ...)` in `_startGrab` — `'goo'` is not in Player's statusEffects map; silently no-ops | Grabbed player may not be properly immobilized via the goo path; grab hold relies on `player.grabbed = true` alone |
| 16 | P2 | TurtleLeg.js | Leg hits routed as `'head'` source to TurtleShell — bypasses P1 body immunity; legs are damageable in P1 when they should not be | Player can damage the Turtle boss in P1 via legs without triggering correct feedback |
| 17 | P2 | BackgroundObject.js | `bulletInteraction: 'passthrough'` (no hyphen) in fallback object doesn't match `'pass-through'` in switch — falls through with raw string as `bulletBehavior` | Recipe sign objects behave incorrectly under bullet contact; callers receive an unhandled bulletBehavior string |
| 18 | P2 | BackgroundObject.js | `interact()` crashes on unknown-char objects — `this.data.interactions.default` accessed without null-checking `data.interactions`; fallback objects have no `interactions` field | Any call to `interact()` on a recipe sign or other unknown-char object throws TypeError |
| 19 | P2 | NPC layer | `WiseFellow` unreachable — `'wise_man'` hutKind never assigned by RoomGenerator; hut interior branch is dead | WiseFellow feature is fully implemented but inaccessible in gameplay |
| 20 | P2 | NPC layer | `threeRoom` and `drawRoom` neutral rooms defined but never wired — no code path calls `transitionToNeutralRoom` for either | Dead content |
| 21 | P2 | Enemy.js | `memoryMarkSuspected` not cleared in packmate reset — stale flag causes wrong `?` color on next detection | Minor visual inconsistency in pack enemy aggro indicator |
| 22 | P2 | Player.js | `isStaffBlocking`/`staffSwingHasFired` not in `reset()` — death mid-block-stance carries blocking flag into next run | Next run starts mid-block; staff won't swing until SPACE released; block-release sweep fires unexpectedly |
| 23 | P2 | Enemy.js | `kiter` detection indicator bug — `isAttackingRush` check uses legacy `packBehavior` flag, not new-style `movementConfig` kiters; new-style attack-rush indicator stays yellow instead of turning red | Visual inconsistency for new-style kiter enemies during rush |
| 24 | P2 | All bosses | GooHead, LakeBoss, TurtleShell, TurtleHead, TurtleLeg have no `sfx` fields — all damage is completely silent for 4 of 5 boss entities | Boss fights have no audio feedback on damage |
| 25 | P2 | NeutralCharacter.js | `render()` uses bare `monospace` instead of `'Unifont', monospace` — propagates to ErrandCharacter, Leshy, Rusalka, WiseFellow, Witch, CampNPC | NPC glyphs including ☺/☹ may render with system emoji font |
| 26 | P2 | CharacterNPC.js | `getHitbox()` applies animation `idleOffset` to hitbox Y — hitbox oscillates with bob animation | Interaction checks using getHitbox() will be slightly inconsistent; low impact today |
| 27 | P2 | Captive.js | `render()` uses bare `monospace` instead of Unifont | Cage bars and captive char misalign with Unifont-rendered entities |
| 28 | P2 | BackgroundObject.js | `isShaking` `shakeInterval` recalculated via `Math.random()` every frame — timer can never actually exceed the interval reliably | Leshy bush shake animation fires far more frequently than the intended 3–5 second window |
| 29 | P2 | Captive.js | Freed captive `getHitbox()` has no `freed` guard — freed (invisible) captive still has an active collision AABB | Any system using getHitbox() directly will collide with invisible freed captives |
| 30 | P2 | Item.js | Wand type routing by `this.char` literal in switch — adding a new wand requires modifying the switch rather than a data field | Maintenance hazard; not a runtime bug |
| 31 | P3 | Player.js | Three separate speed calculation copies in `updateInput`, `startDodgeRoll`, `getRollSpeed` — bat-form multiplier included in one, absent from the other two | Modifier drift between copies; bat-form speed bonus not applied during dodge rolls |
| 32 | P3 | Enemy.js | `getVisionObstructionPoint` uses `GRID.COLS/GRID.ROWS` (hardcoded global) for bounds instead of dynamic map length like `hasLineOfSight` — incorrect bounds for hut/dungeon interiors | Vision debug visualization wrong inside interior rooms |
| 33 | P3 | Enemy.js | Dual kiter/jumper initialization in constructor — legacy `packBehavior`/`jumpBehavior` block and new-style `movementStyle` block both fire | Redundant initializations; future additions to either block may diverge |
| 34 | P3 | Enemy.js | `hasVision` is O(n × m) per call — iterates all background objects for each ray sample per frame per enemy | Performance concern in large rooms with many background objects and multiple enemies |
| 35 | P3 | BackgroundObject.js | `ignite()` does not check `destroyed` state | Destroyed objects can be ignited and tick fire updates |
| 36 | P3 | Item.js | `createGemWandAttack` is a "Phase 1 placeholder"; gem wand spell effects (fire AOE, blizzard, chain stun, etc.) are "Phase 2" per comments | Gem wands deal no real spell effects |
| 37 | P3 | Player.js | Poison DoT on player has no canonical path — `poisonImmune` field exists but no `poisonDuration` or tick system | Any system wanting to poison the player has no supported path |
| 38 | P3 | Player.js | Frozen player has no color change in `getDisplayColor` — indistinguishable from normal | Freeze status effect has no player-side visual indicator |
| 39 | P3 | GooBlob.js | No plane awareness in `isNearEntity` | Could theoretically slow entities on different planes |
| 40 | P3 | Puddle.js | `lifetime` not initialized in constructor — set externally; permanent puddles indistinguishable from forgotten `lifetime` assignments | No self-documenting contract for lifetime |
| 41 | P3 | Bobber.js | `inWater` field initialized `true` but never read anywhere | Vestigial field |
| 42 | P3 | NPC layer | Hop animation 100% duplicated between ErrandCharacter and BridgeWorker | Maintenance hazard |
| 43 | P3 | NPC layer | `ALLOWED_WEAPON_TYPES` in CampNPC uses string literals `'BOW'`, `'GUN'` instead of `WEAPON_TYPES.BOW`/`WEAPON_TYPES.GUN` constants | Silent breakage if weapon type enum values change |
| 44 | P3 | GooDragon.js | `REFLECTABLE_CHANCE = 0.15` but comment says "1 in 10" (10%) | Misleading comment |
| 45 | P3 | Enemy.js | Dead comment "Reckless misdirection (applied to all missiles)" in `createMagicAttack` and `createFireBreath` — no misdirection code follows | Misleading |
| 46 | P3 | Enemy.js | `_isOnWater()` has jsdoc describing `isTargetInTallGrass()` | Mismatched comment |
| 47 | P3 | Player.js | `shouldRenderVisible()` always returns `true` and is never consulted | Dead code |
| 48 | P3 | Enemy.js | Legacy `attack()` method returns raw damage int, ignored by all callers | Dead code; misleading |
| 49 | P3 | TurtleShell.js | `_fireCone()` method implemented but never called | Dead code |
| 50 | P3 | LakeBoss.js | `ENRAGED_THRESHOLD = 32` declared but never referenced | Dead constant |

---

## Incomplete / Stub Features

### Partially Implemented Features

| Feature | Entity / File | Status | Gameplay Impact |
|---------|--------------|--------|----------------|
| Infusion Wand | Item.js:1133 | Explicit `// TODO: Phase 6` returning null | Infusion Wand is a complete non-weapon — equipping it does nothing |
| Gem wand spell effects | Item.js:1181 | "Phase 1 placeholder" — `gem_wand_cast` tag returned; actual spell effects (fire AOE, blizzard, chain stun, blind cone) are "Phase 2" | Gem wands cast but produce no meaningful effect beyond mana deduction |
| Poison DoT on player | Player.js | `poisonImmune` field exists but no `poisonDuration`, `poisonTickTimer`, or tick system | No enemy or trap can poison the player via a supported path |
| Player freeze visual | Player.js | `statusEffects.freeze` is tracked but `getDisplayColor` has no freeze color branch | Frozen player looks identical to normal player |
| Burst gun temporal spacing | Item.js:441 | Comment: "For now, just create the bullets simultaneously" — all 3 burst bullets fire at frame 0 | Burst guns fire a simultaneous salvo rather than a staggered burst |
| Magic sparkle / spell cast particles | Particle.js | No factory for spell cast visual | Spells and gem wand casts have no particle feedback |
| Ice shard particles | Particle.js | No factory for freeze shatter | Hammer-shattering frozen enemies has no visual ice burst |
| Blood / hit splat particles | Particle.js | No factory | Enemy hits and player damage have no combat impact particles |
| WiseFellow spawn | HutSystem / RoomGenerator | `'wise_man'` hutKind never assigned | WiseFellow cannot appear in any current run |
| Barrel room spawn | HutSystem / RoomGenerator | `'barrel_room'` hutKind never assigned | Barrel room interiors unreachable |
| `threeRoom` neutral room | NeutralRooms / main.js | Defined in NEUTRAL_ROOMS, no wiring | Unreachable content |
| `drawRoom` neutral room | NeutralRooms / main.js | Defined in NEUTRAL_ROOMS, no wiring | Unreachable content |
| Puddle types mud/water/poison/lava | Puddle.js / TrapSystem | Visual definitions present; no effect handlers, no spawn calls | 4 of 7 puddle types are decorative-only stubs |
| `acid` and `bleed` enemy effects | Enemy.js | Implemented and ticking; no enemy uses them | System is ready but no content exercises it |

---

## Design Consistency Violations

### Two-Tier Character Encoding Violations

Several ingredient chars violate the rule that raw ingredients must use `a–z`, `A–Z`, or `0–9`:

| Char | Ingredient | Violation Type |
|------|-----------|---------------|
| `~` | String | Punctuation; also BackgroundObject char (water/puddle) — dual use |
| `\|` | Stick | Punctuation; also BackgroundObject char (tall grass) — dual use |
| `` ` `` | Emerald | Punctuation; also used in debris char set |
| `_` | Diamond | Punctuation; also used in debris char set |
| `?` | Ruby | Punctuation |
| `(` | Sapphire | Punctuation |
| `𝑚` | Mana | Mathematical Italic Small m (U+1D45A) — not in a–z range |
| `ŝ`, `š`, `ş` | Sap variants | Latin Extended-A letters — technically letters but outside ASCII a–z/A–Z |
| `ł` | Pollen | Latin Extended-A — same |

The dual-use chars (`~`, `\|`, `i`, `0`) are the most problematic: code that must distinguish between an ingredient entity and a background object sharing the same char must resolve which system owns it. Currently handled by separate constructors but creates conceptual confusion and potential rendering conflicts.

### Reset / Death State Inconsistencies

| Field / Object | Survives Death? | Should It? |
|---------------|-----------------|-----------|
| `player.statusEffects` (goo/freeze/slimeBoost) | Yes | No |
| `player.burnDuration`, `burnTickTimer` | Yes | No |
| `player.shieldCharges`, `shieldBlocksAll` | Yes | No — armor is gone |
| `player.activeSappingBats` | Yes | No — stale refs |
| `player.grabbed`, `player.grabbedBy` | Yes | No — stale GooHead ref |
| `player.plane` | Yes | No — should reset to 0 |
| `player.inHut`, `player.inMaze` | Yes | No |
| `player.pendingBlink` | Yes | No |
| `player.isStaffBlocking`, `staffSwingHasFired` | Yes | No |
| `player.continuousRollActive` | Yes | No |
| `player.meleeResist`, `burnResist`, `slimeImmune`, etc. | Yes | No (re-applied by InventorySystem but only on equip event) |
| `game.companion` | Yes (never nulled) | No |
| `player.characterType` | Yes | Intentional — character persists |
| `player.godMode` | Yes | Acceptable |

### Inheritance Misuse

**CampNPC** duplicates the flee-to-exit algorithm from Leshy in full, and duplicates the hop animation from ErrandCharacter. Both behaviors belong in `NeutralCharacter` as opt-in base behaviors.

**Captive extends NeutralCharacter** but overrides `getHitbox()` with different centering semantics (manual `-1 cell` offset vs. centered). Any polymorphic `getHitbox()` call on a mixed array of NeutralCharacters and Captives returns inconsistently centered boxes.

**CharacterNPC** shares no base with NeutralCharacter despite similar rendering and interaction needs. This is intentional for REST-only use but results in duplicated rendering boilerplate.

**Boss entities** (GooHead, TurtleShell, TurtleHead, TurtleLeg) do not inherit from Enemy — they are standalone classes. This is correct for their specialized behavior but means they do not get the `data.sfx` pattern for free. The SFX absence is a direct consequence of this architectural choice.

---

## Priority Recommendations for Entities

### Priority 1 — Fix `Player.reset()` Completeness

**Rationale:** This is the highest-impact correctness issue in the codebase. The roguelike design contract is "death means full reset." At least 12 fields with direct gameplay consequences survive death today. The fix is mechanical (add ~35 field resets to the `reset()` method) but must be done carefully to avoid zeroing fields that legitimately survive runs by design (`characterType`, `godMode`). The armor-derived fields (`meleeResist`, etc.) need their "no armor" baseline values explicitly reset so they're consistent with `Player.constructor()` defaults.

Simultaneously: add `this.companion = null;` to the `main.js` constructor and death reset block.

### Priority 2 — Fix the Three P1 Item.js Bugs

**Rationale:** Three bugs make equipped weapons behave incorrectly with no warning to the player:
1. `attackPattern: 'axe'` (Pickaxe) silently falls to single-hit default.
2. Special gun patterns (burst/ring/spiral/wave) lose all special bullet capabilities.
3. `createMeleeSlam` missing `shooterPlane` causes cross-plane damage in U-rooms.

All three are data-layer gaps solvable with field additions and a switch-case addition. They affect core gameplay (weapon use) and will be hit by any playtester who uses the Pickaxe or a burst/ring/spiral/wave gun in a U-room.

### Priority 3 — Fix Fire Behavior and Boss Audio

**Rationale:** Two behavioral correctness issues that players will notice immediately in boss fights:
1. `createFireBreath()` missing `onHit: 'burn'` — fire enemies don't burn. This is a one-line fix.
2. All non-GooDragon bosses are completely silent on damage — GooHead, LakeBoss, TurtleShell, TurtleHead, TurtleLeg have no `sfx` fields. Boss fights without audio feedback feel broken. Each boss needs hit/death SFX data.

Also fix `LakeBoss` ice stream: change `const order = [0, 1, 2, 3]` to `[0, 1, 2, 3, 4]` (5 elements to match `ICE_STREAM_SHOTS = 5`).

### Priority 4 — Fix Font Violations and BackgroundObject Lazy-Init

**Rationale:** Two structural issues that affect visual consistency and code correctness:
1. Fix `NeutralCharacter.render()` to use `'Unifont', monospace` — one change fixes six NPC subclasses simultaneously.
2. Fix `CharacterNPC.render()` and `Captive.render()` separately.
3. Move the 10 lazy-initialized `BackgroundObject` fields into the constructor with appropriate defaults, and replace the monkey-patched `isCampfire`/`grassImprinted`/`damaging` assignments with constructor arguments or `createVariant()` factory paths. This eliminates the primary lazy-init anti-pattern site in the codebase.

### Priority 5 — Wire WiseFellow and Consolidate NPC Duplication

**Rationale:** WiseFellow is complete, tested work that players cannot access. Adding `'wise_man'` to the `hutKind` pool in `RoomGenerator.generateHRoom()` is a single-line change that unlocks a fully implemented feature. Similarly for `threeRoom`/`drawRoom` neutral rooms — add the wiring call.

Separately: extract the hop animation from ErrandCharacter and BridgeWorker into `NeutralCharacter` as an opt-in behavior (`this.hopEnabled = true`), and consolidate the three flee-to-exit implementations into `NeutralCharacter.startFleeing(exits, opts)`. These are refactors that reduce future maintenance burden and eliminate divergence risk.
