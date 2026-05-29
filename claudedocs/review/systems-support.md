# SUPPORT SYSTEMS REVIEW

_Reviewed: 2026-05-15. All 17 system files read in full._

---

## System Completion Status Table

| System | Status | Wired to update loop? | Notes |
|---|---|---|---|
| AudioSystem | Complete | N/A (event-driven) | No missing sounds; one broken SFX name reference |
| TrapSystem | Complete | Yes — update called each frame | Contains one documented lazy-init anti-pattern |
| HutSystem | Complete | Yes — update called in updateExploreState | Fully implements interior pattern |
| MazeSystem | Complete | Yes — update called in updateExploreState | Does NOT cache interior across visits (by design: sealed on exit) |
| FishingSystem | Complete | Yes — update(dt, game) | `findWaterTileAtDistance()` is dead code |
| BossSystem | Partial | Yes — update called in updateExploreState | Yellow zone boss entirely absent; `_grantBossReward` gives same reward for all bosses |
| SpellSystem | Complete | N/A (event-driven) | guard consistency has one gap (see below) |
| EnemySpawnSystem | Complete | Yes — flush() after enemy loop | Simple and correct |
| BoulderSystem | Complete | Yes — update in updateExploreState | DIR_VEC north/south are inverted (bug) |
| RidgeSystem | Complete | Yes — update in updateExploreState | One dead alias method; plank char bug |
| AnimationSystem | Complete | Yes — update in updateExploreState | Highly generic, very reusable |
| WellSystem | Complete | Yes — update in updateExploreState | One missing renderer method call |
| CheatMenu | Complete | N/A (input/render driven) | Yellow boss test is unimplemented stub |
| PersistenceSystem | **Active** (not disabled) | No | CLAUDE.md says disabled but it fully writes/reads localStorage |
| PolymorphSystem | Mostly complete | Yes — update called in updateExploreState | Frog can't interact with items/NPCs; `_killedByGhost` set but never read |
| MagicSystem | Complete | Yes — update called in updateExploreState | `hit` SFX played in MazeSystem but name never loaded; maze layer ignored |
| PressSystem | Complete | N/A (event-driven) | One missing import path concern; oils use emoji chars (renders inconsistently) |

---

## Method Catalog

### AudioSystem (`src/systems/AudioSystem.js`)

| Method | Line | Purpose | Issues |
|---|---|---|---|
| `constructor` | 15 | Initialize all fields | — |
| `loadSingleTrack(audioPath, loopStart, volume)` | 76 | Load title screen single-track music | — |
| `loadMusic(layer1Path, layer2Path, masterVolume)` | 107 | Load dual-layer gameplay music | — |
| `fetchAudioBuffer(path)` | 152 | Fetch raw ArrayBuffer from URL | — |
| `loadSFX(name, path)` | 165 | Load and cache an SFX buffer; create persistent GainNode | — |
| `playSFX(name, volume)` | 198 | One-shot SFX play with concurrent-instance cap | Shared GainNode volume mutation can affect concurrent plays of same SFX at different volumes |
| `playStoppableSFX(name, volume)` | 251 | Play SFX that can be stopped before completion | — |
| `stopSFXByName(name)` | 297 | Stop a named stoppable SFX | — |
| `setSFXVolume(volume)` | 313 | Set master SFX volume | — |
| `play()` | 323 | Route to single or dual play | — |
| `playSingleTrack()` | 336 | Start single-track with loop | — |
| `playDualLayer()` | 365 | Start dual-layer music | — |
| `startDualSources()` | 384 | Create and start both layer sources simultaneously | — |
| `stop()` | 420 | Stop current playback; handle all three modes | — |
| `setLayer2Enabled(enabled)` | 456 | Toggle layer 2 at next loop boundary | — |
| `muteLayer2Immediately()` | 493 | Hard mute layer 2 with short fade | — |
| `isLayer2Enabled()` | 509 | Query layer 2 state | — |
| `switchMusic(layer1Path, layer2Path)` | 519 | Hot-swap dual-layer tracks without restarting context | — |
| `hardResetDualLayers(layer1Path, layer2Path)` | 552 | Full reset on game-over | — |
| `setVolume(volume)` | 569 | Set master volume | Does not update `layer2Gain` when muted (correct), but skips boss-sequence gain nodes |
| `getVolume()` | 584 | Get master volume | — |
| `setupAutoplayUnblock()` | 591 | Listen for first user interaction to unblock autoplay | — |
| `removeAutoplayUnblock()` | 617 | Remove interaction listeners | — |
| `isCurrentlyPlaying()` | 629 | Query play state | — |
| `loadBossTracks(base)` | 639 | Load all 6 boss audio files in parallel | — |
| `startBossAnticipation()` | 660 | Enter mini-loop anticipation mode (tracks 0–1) | — |
| `scheduleBossSequence()` | 687 | Queue transition from anticipation to full 5-track | — |
| `startBossSequence()` | 699 | Immediately start full 5-track boss sequence | — |
| `_beginFullBossSequence()` | 724 | Internal: switch anticipation → full fight | — |
| `_startBossTrack(index)` | 734 | Start specific boss track; connect to `layer1Gain` | Connects boss sequence to `layer1Gain` directly — if `setVolume` is called mid-boss it correctly scales this |
| `_onBossTrackEnded()` | 755 | Auto-advance playlist, handle stinger, handle doom | — |
| `onBossDamaged()` | 792 | Signal boss took damage; queues stinger | — |
| `stopBossMusic()` | 801 | Stop boss music, reset mode to 'dual' | — |
| `dispose()` | 820 | Clean up all resources and close AudioContext | — |

### TrapSystem (`src/systems/TrapSystem.js`)

| Method | Line | Purpose | Issues |
|---|---|---|---|
| `constructor(game)` | 41 | Store game reference | — |
| `startTrapCharge()` | 48 | Begin charge; capture throw profile | — |
| `cancelTrapCharge()` | 54 | Cancel charge without throwing | — |
| `updateTrapCharge(deltaTime)` | 59 | Advance charge timer | — |
| `getTrapReticulePos()` | 68 | Compute reticule pixel position | — |
| `releaseTrapThrow()` | 84 | Execute throw on key release; route to trap or weapon | — |
| `updateInFlightTraps(deltaTime)` | 145 | Move in-flight throwables | — |
| `_thrownWeaponDamage(t, speed)` | 182 | Compute velocity-based throw damage | — |
| `_checkThrownWeaponHit(t, speed)` | 191 | Enemy collision for flying weapon | — |
| `_landThrownWeapon(t)` | 223 | Drop thrown weapon as floor pickup | — |
| `_armTrap(t)` | 239 | Place trap at landing position | Lazy-init anti-pattern: `entry.blinkTimer` and `entry.blinkVisible` set here only when `remoteTrigger`; consumed in `updatePlacedTraps` with `|| 0` guard |
| `placeTrap()` | 260 | Place trap at player position (instant) | — |
| `placeTrapAtPosition(x, y, type, plane, owner)` | 292 | Enemy-placed trap (Trap Goblin) | — |
| `_getActiveEnemies()` | 310 | Return correct enemy list (hut or room) | Does NOT check `inMaze` — thrown weapons and traps inside maze use room enemies instead of maze ghosts |
| `updatePlacedTraps(deltaTime)` | 316 | Per-frame trap effects | **Lazy-init anti-pattern**: `entry.gooGenerationTimer === undefined` check at line 425 |
| `_fireOneShotTrap(entry, index, enemies)` | 454 | Fire one-shot trap effect and remove it | burn trap at line 607: calls `obj.isFlammable()` as a function but then branches on `obj.isFlammable` as a property — double call pattern |
| `detonateRemoteBombs()` | 627 | Detonate all placed remote bombs | — |
| `checkWeaponTriggers()` | 643 | Check if player melee/projectile hits placed traps | — |
| `updatePuddles(deltaTime)` | 681 | Per-frame puddle effects | — |
| `_applyFirePuddle(puddle, playerPlane)` | 710 | Apply fire puddle to player/enemies | — |
| `_applyIcePuddle(puddle, playerPlane)` | 727 | Apply ice puddle to player/enemies | — |
| `_applySlimePuddle(puddle, playerPlane)` | 745 | Apply slime puddle to player/enemies | — |
| `dropOrPlaceTrap()` | 774 | Shift+drop handler — persistent traps place, weapons drop | — |

### HutSystem (`src/systems/HutSystem.js`)

| Method | Line | Purpose | Issues |
|---|---|---|---|
| `constructor(game)` | 29 | Store game reference | — |
| `generateHutInterior(hutKind, depth, pressBias)` | 35 | Generate 10×10 interior room object | — |
| `nearExteriorDoor()` | 158 | Check if player near exterior hut door | — |
| `lowerHut(room)` | 175 | Stepped descent animation for raised witch huts | — |
| `nearInteriorExit()` | 293 | Check if player near interior exit door | — |
| `handleSpacePress()` | 308 | SPACE handler: enter or exit hut | — |
| `_enterHut()` | 330 | Teleport player into interior; register enemies with physics | — |
| `_exitHut()` | 371 | Restore exterior position; cleanup interior loot | — |
| `update(dt)` | 411 | Tick cooldown; update interior enemies/NPCs; poll Witch trigger | — |
| `_nearCell(player, cellPixelX, cellPixelY)` | 480 | Distance check against a cell center | — |

### MazeSystem (`src/systems/MazeSystem.js`)

| Method | Line | Purpose | Issues |
|---|---|---|---|
| `constructor(game)` | 96 | Store game reference | — |
| `generateMazeInterior()` | 102 | DFS 19×19 maze; place objects at dead ends | Each entry re-generates (interior not cached — sealed-on-exit design) |
| `_shuffledRewards(depth)` | 171 | Build depth-tiered reward pool | — |
| `nearExteriorDoor()` | 193 | Check proximity to maze exterior door | — |
| `_enterMaze()` | 204 | Teleport into maze; set `inMaze` | Does NOT register physics for anything (ghosts have no physics) |
| `checkInteriorExit()` | 217 | Check if player walked off south border | — |
| `_exitMaze()` | 229 | Restore exterior position; seal door; drop maze loot | — |
| `update(dt)` | 270 | Drive object hits, flash, countdown, ghost AI, ghost damage, exit check | — |
| `_checkObjectHits(mi)` | 315 | Melee/projectile vs maze object hit detection | — |
| `_destroyObject(obj, mi)` | 351 | Destroy maze object; drop ingredient; start timer | — |
| `_onTimerExpired(mi)` | 373 | Spawn ghost from surviving object; on 3rd expiry: doom mode | Comment says "4 cumulative spawns" but code triggers doom at `spawnCount >= 3` (off-by-one vs. docs) |
| `handleSpacePress()` | 413 | SPACE in maze: enter from exterior or punch adjacent object | — |
| `_updateGhost(ghost, dt, mi)` | 454 | Ghost movement: BFS pathing or direct-through-walls | — |
| `_chooseGhostNextCell(ghost, mi)` | 495 | Pick next BFS cell for ghost | — |
| `_bfsPath(startCol, startRow, goalCol, goalRow, mi)` | 509 | BFS through maze grid | — |
| `_ghostCollides(x, y, mi)` | 540 | Four-corner collision test | Defined but never called — ghost wall collision not applied to normal ghost movement |
| `_checkGhostDamage(mi, dt)` | 557 | Ghost contact damage with cooldown | — |
| `_isAdjacentToPlayer(obj)` | 579 | Proximity check for hidden-char reveal | — |
| `_nearCell(player, cellPx, cellPy)` | 587 | Distance check against a cell center | — |
| `_overlapsCell(player, cellPx, cellPy)` | 596 | AABB overlap check | Defined but never called — dead code |

### FishingSystem (`src/systems/FishingSystem.js`)

| Method | Line | Purpose | Issues |
|---|---|---|---|
| `constructor()` | 32 | Initialize state machine | Does NOT take `game` as arg (inconsistent with all other systems) |
| `isLakeRoom(game)` | 53 | Check if current room is Lake | — |
| `roomCleared(game)` | 57 | Check if no enemies remain | — |
| `holdingFishingRod(game)` | 61 | Check if player holds a fishing rod | — |
| `nearFish(game)` | 64 | Check if any fish within 4-cell threshold | — |
| `canFish(game)` | 76 | Gate: all conditions must be true | — |
| `startCharge(game)` | 88 | Enter CHARGING state; lock player movement | — |
| `releaseCharge(game)` | 94 | Cast to nearest fish; enter BOBBING | — |
| `onSpacePress(game)` | 118 | BOBBING → cancel; BITE_WINDOW → catch | — |
| `cancelFishing(game)` | 135 | Despawn targeted fish; reset state | — |
| `despawnTargetedFish()` | 140 | Remove targeted fish from entity list | — |
| `resetMinigame(game)` | 147 | Clear all transient state; unlock player | — |
| `resolveCatch(game)` | 161 | Rusalka chance then reward table lookup | — |
| `spawnRewardObject(game, catchData)` | 178 | Place RewardObject at bobber position | — |
| `spawnRusalka(game)` | 189 | Spawn Rusalka at bobber position | — |
| `spawnRusalkaAt(game, x, y)` | 194 | Core Rusalka spawn (replaces any existing) | — |
| `update(dt, game)` | 208 | Drive state machine + reward + Rusalka + fish spawning | — |
| `findNearestFish(game)` | 290 | Return closest fish entity to player | — |
| `findWaterTileAtDistance(game, chargeRatio)` | 312 | Find water tile at preferred cast distance | **Dead code** — never called; charge now goes to nearest fish directly |
| `spawnAmbientFish(game)` | 342 | Spawn fish on water tiles with 2+ water neighbors | Looks for `obj.char === '~'` (puddle char) not `'='` (water char) — may find wrong tiles depending on room setup |
| `hitRewardObject(reward, spawnIngredientFn)` | 373 | Melee blade hit on reward object → scatter drops | — |
| `resetForNewRoom(player)` | 387 | Clean all fishing state on room transition | — |
| `get STATES()` | 409 | Expose state enum | — |

### BossSystem (`src/systems/BossSystem.js`)

| Method | Line | Purpose | Issues |
|---|---|---|---|
| `constructor(game)` | 24 | Initialize boss refs and state | Inline comment stub at line 40 (`// Collision damage cooldown per head`) left dangling — no closing brace comment |
| `activate(room, zone)` | 49 | Spawn boss entities into room | **Yellow zone has no boss** — no `if (zone === 'yellow')` branch; falls through to GooDragon path for yellow |
| `deactivate()` | 119 | Null all boss refs | — |
| `_getBossCurrentHp()` | 133 | Route HP query to correct boss entity | Returns `Infinity` for yellow (no dragon/lake/turtle set) — audio damage signal never fires for yellow |
| `reactivate(room)` | 143 | Re-link boss entities after mid-boss revive | — |
| `update(deltaTime)` | 167 | Route to correct boss update per zone | — |
| `_trackBossDamage()` | 197 | Detect HP decrease → signal audio damage stinger | — |
| `_updateLakeBoss(deltaTime)` | 207 | Cyan boss AI: shockwave, projectile cleanup, knockback | — |
| `_onLakeBossDefeated()` | 323 | Remove lake boss; grant reward | — |
| `_checkPhaseTransitions()` | 336 | GooDragon phase 1→2→3 HP thresholds | — |
| `_detachHeads()` | 350 | Phase 3: detach side heads to roam independently | — |
| `_drainPendingAttacks(entity)` | 358 | Transfer boss's pendingBossAttacks → CombatSystem | — |
| `_checkGrabEscape()` | 398 | Player melee while grabbed releases from GooHead | — |
| `_meleeFacingToward(atk, player, head)` | 421 | Dot-product: player facing toward head? | `_atk` parameter unused; method ignores attack position |
| `_atkOverlapsHead(atk, head)` | 430 | AABB test: attack overlaps head? | — |
| `_checkReflectableHits()` | 442 | Mark enemy projectiles as reflected when hit by player melee | — |
| `_checkReflectedProjectileBossHits()` | 466 | Reflected projectiles deal damage + stun to GooDragon | Only implemented for GooDragon; lake and turtle bosses can't be reflected-stunned |
| `applyStun(duration)` | 500 | Apply stun to dragon + heads | — |
| `_projOverlapsEntity(proj, entity)` | 510 | AABB overlap test | — |
| `_atkOverlapsProj(atk, proj)` | 520 | AABB overlap between melee attack and projectile | — |
| `_updateRedBoss(deltaTime)` | 533 | Red boss AI: phase check, head reveal, legs, attacks | — |
| `_checkTurtlePhaseTransition()` | 595 | Turtle phase 1→2 HP threshold | — |
| `_onTurtleDefeated()` | 603 | Remove turtle entities; grant reward | — |
| `_onBossDefeated()` | 617 | GooDragon defeat: release grabs, mark zone, grant reward | — |
| `_grantBossReward()` | 645 | Unlock consumable slot; screen flash; 'boss_defeat' SFX | **Identical reward regardless of which boss** — no rune delivery implemented |

### SpellSystem (`src/systems/SpellSystem.js`)

| Method | Line | Purpose | Issues |
|---|---|---|---|
| `constructor(game)` | 25 | Initialize; set `game.spellResponse = null` | — |
| `resetAwaiting()` | 33 | Clear awaiting-followup state | — |
| `detect(keyBuffer)` | 42 | Scan buffer tail for spell or follow-up match | Spell detection stops on first match (shortest match wins) — documented behavior |

### EnemySpawnSystem (`src/systems/EnemySpawnSystem.js`)

| Method | Line | Purpose | Issues |
|---|---|---|---|
| `constructor(game)` | 11 | Init pending request queue | — |
| `queueRequest(spawner, spawnData)` | 21 | Add spawn request from enemy update | — |
| `flush()` | 29 | Process queued requests up to room cap (10) | Cap check is `>=10` with `break` — only first request is refused when at cap; remaining requests silently dropped (minor) |
| `handleEnemyDeath(enemy)` | 49 | Handle spawn-on-death and notify parent spawner | — |

### BoulderSystem (`src/systems/BoulderSystem.js`)

| Method | Line | Purpose | Issues |
|---|---|---|---|
| `constructor(game)` | 23 | Initialize rock/pending/warning arrays | — |
| `update(deltaTime)` | 34 | Periodic spawn check; tick warnings → pending → rocks; move rocks; damage | **DIR_VEC north/south are inverted**: `north: {dx:0, dy:1}` moves DOWN (south), `south: {dx:0, dy:-1}` moves UP (north). Direction labels are swapped. |
| `getRenderData()` | 147 | Expose render state | — |
| `_scheduleWarning()` | 151 | Push a warning with current room direction | — |
| `_queueRocks(warning)` | 159 | Convert warning → 3 staggered pending rocks | — |
| `_spawnRock(pending)` | 170 | Place rock at edge corresponding to direction | Spawn positions match DIR_VEC incorrectly: 'north' spawns at top row (y=small) but DIR_VEC sends it DOWN — effectively rocks rain southward when labeled 'north' |
| `triggerBoulderRain(count)` | 194 | Boss-triggered multi-direction rain | — |
| `_reset()` | 204 | Clear all rocks/warnings; reset room tracking | — |

### RidgeSystem (`src/systems/RidgeSystem.js`)

| Method | Line | Purpose | Issues |
|---|---|---|---|
| `constructor(game)` | 17 | Init animation state | — |
| `attachToRoom(room)` | 27 | Initialize `bridgeDonated` on room | — |
| `canBuild()` | 33 | Gate: must be RIDGE room and not built yet | — |
| `getWorker()` | 38 | Return room's bridge worker NPC | — |
| `getWorkerDistance()` | 42 | Distance from player to worker | — |
| `_checkMaterials()` | 51 | Audit inventory against remaining need | — |
| `donateAvailable()` | 69 | Donate all currently held matching mats; start animation if complete | — |
| `_startBridgeAnimation(room)` | 103 | Begin row-by-row build; dismiss worker | — |
| `update(deltaTime)` | 128 | Drive build animation: place one row per interval | — |
| `_placeBridgeRow(room, row)` | 145 | Place planks for one row; open collision | **Bug**: plank char is `'='` (water/puddle char) not a plank/bridge char. Players walking across will trigger puddle physics. |
| `_finishBridgeAnimation(room)` | 168 | Mark bridge complete; open border row | — |
| `buildBridge()` | 185 | Spell path: drain all mats then animate | — |
| `buildBridgeViaSpell()` | 200 | Thin alias for `buildBridge()` | **Redundant** — identical body, used only once, should just call `buildBridge()` directly |
| `openMenu()` | 204 | Set `bridgeMenuOpen = true` | — |
| `closeMenu()` | 208 | Set `bridgeMenuOpen = false` | — |

### AnimationSystem (`src/systems/AnimationSystem.js`)

| Method | Line | Purpose | Issues |
|---|---|---|---|
| `constructor(game)` | 26 | Init animations array | — |
| `play(target, steps, opts)` | 31 | Start a sequence; return cancel/isActive handle | — |
| `isAnimating(target, lockKey)` | 54 | Check if target is locked | — |
| `cancelFor(target, lockKey)` | 58 | Cancel all animations for a target | — |
| `retarget(oldTarget, newTarget, lockKey)` | 71 | Rebind animation to new target (post-state-reset) | — |
| `update(dt)` | 83 | Tick all active animations; advance steps; fire onComplete | — |
| `_cancel(anim)` | 98 | Mark cancelled; release lock | — |
| `_tick(anim, dt)` | 104 | Process one animation's current step | — |
| `_advance(anim)` | 167 | Increment step index; reset elapsed | — |

Module-level helpers: `readPos`, `writeX`, `writeY`, `lerp`, `applyEasing`

### WellSystem (`src/systems/WellSystem.js`)

| Method | Line | Purpose | Issues |
|---|---|---|---|
| `constructor(game)` | 23 | Store game reference | — |
| `update(dt)` | 29 | Animate in-flight coin arc; tick flash timer | Room-change abort guard is correct |
| `handleSpacePress()` | 55 | Gate conditions; find offering; start coin arc or plink | — |
| `_findOfferingSlot()` | 118 | Scan consumable slots; infused coin takes priority | — |
| `_completeRitual(anim)` | 132 | Consume offering; activate meter or luck; re-open well if dual-offering | `game.renderer?.markBackgroundDirty?.()` at line 187 — `markBackgroundDirty` does not exist on `renderer`; the correct call is `game.renderer.backgroundDirty = true` |

### CheatMenu (`src/systems/CheatMenu.js`)

| Method | Line | Purpose | Issues |
|---|---|---|---|
| `constructor(game)` | 6 | Init menu state | — |
| `buildItemCategories()` | 22 | Build categorized item list from ITEMS/INGREDIENTS/characters | Yellow boss test entry at line 79 is stub: `{ char: 'Ω', name: 'BOSS (yellow)', type: 'boss_test', zone: 'yellow' }` — no yellow boss exists in BossSystem |
| `flattenCategories()` | 144 | Flatten to linear list with headers | — |
| `toggle()` | 157 | Open/close; rebuild categories on open | — |
| `handleInput(key)` | 177 | Process arrow keys, enter, digits, R warp | — |
| `updateScroll()` | 301 | Keep selected item in view | — |
| `render(renderer)` | 310 | Draw cheat menu overlay | — |

### PersistenceSystem (`src/systems/PersistenceSystem.js`)

| Method | Line | Purpose | Issues |
|---|---|---|---|
| `constructor()` | 1 | Set storage key | — |
| `saveRestState(craftingSystem, characterData)` | 6 | Serialize and write to localStorage | **ACTIVE** — writes localStorage despite CLAUDE.md claiming disabled |
| `loadRestState()` | 29 | Read and parse from localStorage | **ACTIVE** — reads localStorage |
| `clearSave()` | 41 | Remove localStorage entry | — |
| `hasSave()` | 51 | Check if save exists | — |

### PolymorphSystem (`src/systems/PolymorphSystem.js`)

| Method | Line | Purpose | Issues |
|---|---|---|---|
| `constructor` | — | (none — no constructor defined) | Missing constructor; no `this.game` assignment. All methods take `game` as a parameter instead |
| `activatePolymorph(game, cursed)` | 31 | Mutate player into frog form; save original state | — |
| `deactivatePolymorph(game, markCured)` | 73 | Restore player from frog form | — |
| `cureViaWish(game)` | 111 | Cure polymorph via HEAL/UNCURSE spell, costs a wish slot | Mirrors slot-destruction logic from main.js — duplication risk if wish logic changes |
| `spawnCureRusalka(game)` | 144 | Spawn cure Rusalka at room center | — |
| `createTongueAttack(game)` | 159 | Create frog tongue attack object | Does NOT check `inMaze` — tongue uses hut enemies or room enemies, skips maze ghosts |
| `update(dt, game)` | 213 | Tick tongue attacks; frog movement; Rusalka contact cure | Lake room detection uses `exitLetter === 'L'` — may not match all lake room configurations |
| `_updateFrogMovement(dt, game)` | 244 | Discrete jump physics | — |
| `_updatePlayerTongueAttacks(dt, game)` | 283 | Extend/hold/retract tongue phase machine | — |

### MagicSystem (`src/systems/MagicSystem.js`)

| Method | Line | Purpose | Issues |
|---|---|---|---|
| `constructor(game)` | 39 | Store game reference | — |
| `activateMagicMeter(player)` | 47 | Set meter active on first non-destroyed slot | — |
| `hasMana(player, cost)` | 62 | Check mana sufficiency | — |
| `spendMana(player, cost)` | 66 | Deduct mana | — |
| `addMana(player, amount)` | 72 | Add mana capped at max | — |
| `convertIngredientToMana(player, ingredientChar)` | 81 | Consume inventory ingredient for mana | — |
| `tryStartCharge(player)` | 97 | Validate pre-charge conditions | — |
| `handleSpaceRelease(player)` | 110 | Cancel incomplete charge on key release | — |
| `update(_dt)` | 121 | Auto-fire when gem-wand charge is complete | `_activeEnemies()` and `_activeBackgroundObjects()` do NOT handle `inMaze` — maze layer is invisible to wand spells |
| `runSpellEffect(attack)` | 144 | Dispatch to concrete spell effect | — |
| `_spawnRingBurst(x, y, radius, count, chars, colors, lifetime)` | 159 | Radial particle burst helper | — |
| `_spawnConeBurst(x, y, facing, reach, count, chars, colors, lifetime)` | 178 | Cone particle burst helper | — |
| `_activeEnemies()` | 201 | Return correct enemy list (hut or room) | Missing `inMaze` branch |
| `_activeBackgroundObjects()` | 208 | Return correct bg object list | Missing `inMaze` branch |
| `_castFireAOE(attack)` | 215 | Ruby staff: fire blast + burn | — |
| `_castBlizzard(attack)` | 237 | Sapphire staff: wide freeze ring | — |
| `_castChainStun(attack)` | 254 | Topaz staff: chain lightning from nearest enemy | Uses `combatSystem.chainArcs?.push` — safe optional chain, but `chainArcs` is not documented in CombatSystem catalog |
| `_castBlindCone(attack)` | 300 | Onyx staff: forward cone blind | — |
| `_castGrassCircle(attack)` | 335 | Emerald staff: fill disc with grass | — |
| `_castCharmAOE(attack)` | 381 | Garnet staff: charm all enemies in radius | — |

### PressSystem (`src/systems/PressSystem.js`)

| Method | Line | Purpose | Issues |
|---|---|---|---|
| `constructor(game)` | 21 | Store game reference | — |
| `nearPress()` | 27 | Check if player adjacent to `⊓` press object in active hut | — |
| `handleSpacePress()` | 44 | SPACE near press → open press menu | — |
| `openPressMenu()` | 50 | Build menu of pressable ingredients; open menu | Direct call to `game.renderController.menuOverlay.render(game)` at line 70 — immediately renders rather than letting the render loop handle it; potentially redundant |
| `commitSelection(rawChar)` | 75 | Consume raw ingredient; add pressed oil to consumable inventory | Pushed to `game.inventorySystem.consumableInventory` — bypasses `inventorySystem.addConsumable()` if that method exists, may miss update hooks |

---

## AudioSystem Analysis

### Sound Files in `assets/audio/`
33 files total. All loaded SFX have matching files on disk, with one exception:

**Loaded via `loadSFX` in main.js (24 entries):**
aggro, destroy, roll, attack_blade, attack_whip, charge_bow, player_death, craft_cycle, mag_reload, energy_charge, enemy_hit, goo_hit, goo_death_1, goo_death_2, ghost_spawn, frog, hut_lower, polymorph, wave_1, wave_2, wave_3, weapon_pickup, boss_defeat, coin_plink

**Missing file on disk:**
- `sfx-craft-cycle.mp3` — loaded as `craft_cycle` but absent from `assets/audio/`. Will fail silently at runtime (AudioSystem catches errors).

**SFX names called via `playSFX` that are NOT loaded:**
- `'hit'` — called by MazeSystem at lines 345 and 447, and in `_checkGhostDamage` at line 572. This name is never registered via `loadSFX`. Will produce a console warn every time a maze object is hit or a ghost damages the player.
- `'craft'` — called by PressSystem at line 87. Not registered. Will warn silently.

**Unused file on disk (loaded but never `playSFX`'d with that name):**
- `sfx-wave-01.wav`, `sfx-wave-03.wav`, `sfx-wave-05.wav` — loaded as `wave_1/2/3`. These are played in main.js at line 2854 conditionally, so they ARE used.

**Boss music:** 6 files (`boss-1` through `boss-5` + `boss-loop`), all present. Cyan zone music (`cyan-layer1/2.mp3`) present; loaded via `switchMusic` in ZoneSystem.

**Music layer management:** The `setVolume()` method at line 569 does not update the gain nodes for boss-sequence mode (`this.mode === 'sequence'`). A volume change mid-boss fight has no effect on music level.

---

## TrapSystem Analysis

### Lazy Initialization Anti-Pattern Locations

Per CLAUDE.md, lazy property initialization on plain objects at runtime is an anti-pattern.

**Location 1 — `_armTrap()`, line 251–254:**
```js
if (t.trapData.remoteTrigger) {
  entry.blinkTimer = 0;
  entry.blinkVisible = true;
}
```
`blinkTimer` and `blinkVisible` are conditionally set at arm-time. `updatePlacedTraps` reads them with `entry.blinkTimer || 0` (line 331) to guard against undefined. Fields should be initialized in `_armTrap` unconditionally or in `placeTrapAtPosition`.

**Location 2 — `updatePlacedTraps()`, line 425:**
```js
if (entry.gooGenerationTimer === undefined) {
  entry.gooGenerationTimer = 1.0;
}
```
This is the textbook lazy-init anti-pattern documented in CLAUDE.md. `gooGenerationTimer` should be initialized in `_armTrap` (for thrown goo dispensers) and in `dropOrPlaceTrap` (for dropped persistent traps) and `placeTrap`.

**State management correctness:** `game.placedTraps`, `game.inFlightTraps`, `game.trapCharging` all stay on `game` by design. The system correctly routes active-enemy queries through `_getActiveEnemies()` but that helper does NOT check `inMaze`, meaning traps inside the maze act on exterior room enemies.

---

## Interior System Pattern Compliance

### Pattern Requirements vs. Implementation

| Requirement | HutSystem | MazeSystem |
|---|---|---|
| `generateXxxInterior()` creates room-like object stored on `game` | ✅ `generateHutInterior()` → `game.hutInterior` | ✅ `generateMazeInterior()` → `game.mazeInterior` |
| `checkDoorEntry()` / `nearExteriorDoor()` | ✅ `nearExteriorDoor()` + `handleSpacePress()` | ✅ `nearExteriorDoor()` + `handleSpacePress()` |
| `checkXxxExit()` | ✅ `nearInteriorExit()` + `_exitHut()` | ✅ `checkInteriorExit()` + `_exitMaze()` |
| Physics redirect on entry | ✅ `physicsSystem.addEntity()` for all interior enemies | Partial — ghosts have no physics (intentional) |
| Physics unregister on exit | ✅ `physicsSystem.removeEntity()` for all enemies | N/A — no physics registered |
| `player.inXxx` initialized in Player constructor | ✅ `player.inHut` | ✅ `player.inMaze` |
| `player.xxxExitPosition` initialized in Player constructor | ✅ `player.hutExitPosition` | ✅ `player.mazeExitPosition` |
| Interior reset in `enterRestState()` | Needs verification in main.js | Needs verification in main.js |
| Interior reset in `enterExploreState()` | Needs verification in main.js | Needs verification in main.js |
| Interior reset on room transitions | Needs verification in main.js | Needs verification in main.js |

**MazeSystem-specific gaps:**
- `_ghostCollides()` is defined (line 540) but never called. Normal (non-phasing) ghost movement uses BFS cell targeting with no explicit collision check between ghost and walls.
- `_overlapsCell()` (line 596) is defined but never called — dead code.
- `handleSpacePress()` inside the maze deals a fixed −1 HP to the nearest object. No `SPACE` SFX is played on this hit.

---

## BossSystem Analysis

### Zone Boss Coverage

| Zone | Boss Entity | Status |
|---|---|---|
| green | GooDragon + GooHeads | ✅ Fully implemented: 3 phases, grab/escape, reflectable projectiles |
| red | TurtleShell + TurtleHead + TurtleLegs | ✅ Fully implemented: 2 phases, head reveal, boulder rain |
| cyan | LakeBoss | ✅ Fully implemented: ice shockwave, projectile purge, phased AI |
| yellow | None | ❌ No yellow boss entity exists. `activate()` falls through to GooDragon path, instantiating a GooDragon for the yellow zone. |

### Phase Management
- GooDragon: 3 phases. `PHASE2_HP_THRESHOLD` and `PHASE3_HP_THRESHOLD` imported from `GooDragon.js`. Phase 3 detaches heads. Complete.
- TurtleShell: 2 phases. `TURTLE_PHASE2_HP` imported from `TurtleShell.js`. Complete.
- LakeBoss: Phase management internal to `LakeBoss.js`. BossSystem defers to `boss.update()`. Unclear if multi-phase is implemented in that entity.

### Rune Delivery
`_grantBossReward()` at line 645 gives: +1 consumable slot, screen flash, `showPickupMessage('Your power has grown')`, `boss_defeat` SFX. There is no rune piece delivery, no zone-locking (zone lock is done separately via `markBossDefeated`), and no differentiation by zone. The design doc mentions rune slot items delivered on boss defeat; this is not implemented.

---

## SpellSystem Analysis

### Buffer Detection
Linear scan from tail, shortest match wins. Correct and documented. The `detect()` method cleanly handles follow-up chains with `awaitingSpell` state. `resetAwaiting()` is called on room/state transitions.

### Known Spell Guard Consistency
From CLAUDE.md: guarded spells must check `game.knownSpells?.has('WORD')` in `response` and `action`. Only `FROG` is a learnable spell. Verification of all spell definitions in `spells.js` is outside this review scope, but the system itself enforces nothing — it is entirely up to individual spell definitions. No enforcement mechanism in SpellSystem.

**Gap:** If a spell's `followUpsActive` guard returns false, the system does NOT set `awaitingSpell` but still fires the main response. The player sees the response text but gets no follow-up prompt. Whether this is intentional "silent failure" vs. a missing fallback-message is unclear.

---

## MagicSystem + PolymorphSystem Analysis

### Wand Pipeline (MagicSystem)
1. Player holds gem wand; `tryStartCharge()` validates mana ≥ cost.
2. `Item.use()` sets `wand.isCharging = true`, starts accumulating `wand.chargeTime`.
3. `MagicSystem.update()` fires each frame: when `chargeTime >= data.chargeTime`, calls `wand.releaseGemWand()` → gets attack object, spends mana, calls `runSpellEffect()`.
4. If player releases key before charge completes: `handleSpaceRelease()` cancels.

Integration with `Item.js` wand subtype: The `gemWand: true` flag on item data is the contract. `tryStartCharge` checks `wand.data.gemWand`. This is correct per the wand subtype description.

**Gap:** `_activeEnemies()` and `_activeBackgroundObjects()` in MagicSystem only check `inHut`. Casting wand spells inside the maze will target room enemies (not inside maze) and affect room background objects (not visible in the maze overlay).

### Frog Form Gameplay Gaps (PolymorphSystem)

| Capability | Works in frog form? | Notes |
|---|---|---|
| Movement | ✅ | Discrete jumps via `_updateFrogMovement` |
| Tongue attack (SPACE) | ✅ | `createTongueAttack()` |
| Weapon attacks | ❌ | No weapon is held in frog form; SPACE fires tongue |
| Item pickup | Unknown | Player position still valid; pickup logic not gated on polymorph |
| Fishing | ❌ | `holdingFishingRod()` checks `heldItem.data.isFishingRod` — no held item in frog form means fishing impossible |
| Crafting | ❌ | No explicit gate but crafting station in REST mode; frog form only in EXPLORE |
| NPC interaction | Unknown | No gate in hut NPC interaction or well SPACE handler |
| Inventory/consumables | Unknown | No gate visible in PolymorphSystem |
| Maze exit interaction | Partial | Ghost damage works, but maze exit detection (`checkInteriorExit`) is position-based, so frog can exit |
| Trap throwing | ❌ | `releaseTrapThrow()` calls `player.heldItem` — null in frog form; safe (early return) |

**Bug:** `MazeSystem._checkGhostDamage` sets `player._killedByGhost = true` at line 572 when ghost damage kills the player. This flag is set but never read anywhere in the codebase — it has no effect.

**Design gap:** No gate prevents frog-polymorphed player from picking up items, interacting with NPCs inside huts, or using the well. Whether these should be blocked is a design decision but worth flagging.

---

## WellSystem Analysis

### Magic Meter Activation
The activation path:
1. Player holds `¤` (Infused Coin) in a consumable slot.
2. Player is within 3 cells of a `ROOM_TYPES.WELL` room's well center.
3. SPACE press → coin arc animation starts (0.55s).
4. `_completeRitual()` fires: `game.magicSystem.activateMagicMeter(player)`, then tops off meter to max.

This is correct and clean. The 25% mana drop post-activation mentioned in MEMORY.md is NOT in WellSystem — it is presumably handled elsewhere (enemy death loot tables or room transition hooks).

### Mana Drop Rate
Not implemented in WellSystem. Per MEMORY.md "25% mana drops post-activation" — likely in LootSystem. WellSystem is not responsible for this.

### Bug
`game.renderer?.markBackgroundDirty?.()` at line 187 in `_completeRitual`. The method `markBackgroundDirty()` does not exist on the renderer object. The correct pattern used everywhere else is `game.renderer.backgroundDirty = true`. This call silently no-ops, so the background is not redrawn after the well ritual completes. Visual artifact: well may still appear unconsumed until next frame triggers redraw via another path.

---

## PressSystem — What Is This?

PressSystem manages an **oil press** (`⊓` glyph) that appears inside huts (either always in `pressBias` huts, or with 10% chance in other huts).

**Mechanic:**
- Player walks up to the press inside a hut and presses SPACE.
- A menu opens showing which raw sap ingredients the player has that can be pressed.
- Player selects one; the raw ingredient is consumed from inventory and a pressed oil is added to the consumable inventory slot.

**Conversion table (`PRESS_TABLE`):**
| Raw Ingredient | Result |
|---|---|
| `ŝ` Sap | `🜁` Slick Oil |
| `š` Fire Sap | `🜂` Fire Oil |
| `ş` Frost Sap | `🜄` Frost Oil |
| `ł` Pollen | `🜔` Drowse Oil |

**Issue with oil chars:** The result characters (`🜁`, `🜂`, `🜄`, `🜔`) are alchemical Unicode symbols in the U+1F700 block. Per CLAUDE.md: "Avoid emoji and pure box-drawing characters — they render inconsistently across platforms." These alchemical symbols fall in a range with inconsistent cross-platform rendering and are NOT in the standard Unifont coverage for all platforms. This is a known rendering risk.

**Integration:** `commitSelection()` pushes directly to `game.inventorySystem.consumableInventory` — bypasses any `addConsumable()` method if one exists. The item is created as a new `Item(oilChar, ...)` at the player's position, which is fine since position is only used as a spawn point for floor items, not for consumables stored in slots.

**Menu integration:** `openPressMenu()` calls `game.renderController.menuOverlay.render(game)` directly at line 70, forcing an immediate render before the normal loop fires. This is inconsistent with how other menus work and may cause a double-render on the frame the menu opens.

**No SFX named `'craft'` loaded:** PressSystem calls `game.audioSystem?.playSFX?.('craft')` at line 87, but `'craft'` is never registered with `loadSFX` in main.js. Will warn silently on every successful press.

---

## AnimationSystem — Generality Assessment

AnimationSystem is well-designed and fully generic. Assessment:

**Strengths:**
- Targets are any object with `{position: {x,y}}` or plain `{x, y}` — no entity coupling.
- 5 step types cover all current needs: `moveTo`, `moveBy`, `wait`, `callback`, `set`.
- `lockKey` parameter allows multiple concurrent independent animations on same target.
- `retarget()` handles the specific case where state resets destroy and rebuild the player entity mid-animation.
- `interruptible` / `canInterrupt` / `interruptAfter` for early-exit tweens.
- `onComplete` callback for post-animation logic.
- Easing catalog includes 6 variants.

**Hardcoded assumptions (minimal):**
- Velocity zeroing on each move tick (`target.velocity.vx = 0`) assumes `target.velocity` follows `{vx, vy}` shape. Any target with a differently shaped velocity object would be skipped (safe).
- `_animLock` is the default lock key — collision only if same system accidentally shares keys.

**Missing easing variants** (minor): `easeInQuad` and `easeOutCubic` are implemented but not listed in the JSDoc step-type comment at the top. Documentation gap only.

**Reuse:** Currently used by HutSystem (hut lowering + player push), and the exit-warp animation per MEMORY.md. Any future cutscene or NPC movement can use it directly.

---

## Disabled/Stub Systems

### PersistenceSystem
**CLAUDE.md states this is permanently disabled with no-op functions.** This is incorrect. The actual file contains fully operational `saveRestState()`, `loadRestState()`, `clearSave()`, and `hasSave()` methods that read/write `localStorage` with key `'ascii-roguelike-save'`. Whether it is called from main.js is a separate question, but the system is NOT disabled — it is live code.

**Risk:** If main.js does call these methods anywhere (e.g. at session start for character data), real data will be persisted, violating the no-localStorage design constraint. This needs audit in main.js.

### Yellow Boss (BossSystem)
The CheatMenu lists a yellow boss test entry, and `activate()` has no yellow branch, silently spawning a GooDragon for the yellow zone. This is a stub, not a disabled system.

---

## Bugs & Logic Errors

| # | System | Severity | Description |
|---|---|---|---|
| 1 | BoulderSystem | P1 | `DIR_VEC` north/south are inverted: `north: {dx:0, dy:1}` moves down (south direction in screen coords). Boulders labeled 'north' actually travel south, and vice versa. |
| 2 | RidgeSystem | P2 | `_placeBridgeRow()` uses char `'='` for planks. `'='` is the standing-water char, which likely triggers puddle physics. Should use a dedicated bridge/plank char. |
| 3 | WellSystem | P2 | `game.renderer?.markBackgroundDirty?.()` is a no-op — method doesn't exist. Background not redrawn after well ritual. Should be `game.renderer.backgroundDirty = true`. |
| 4 | AudioSystem | P2 | `'hit'` SFX name called by MazeSystem (lines 345, 447, 572) but never loaded. Produces repeated console warnings during maze play. |
| 5 | PressSystem | P2 | `'craft'` SFX name called but never loaded. Produces console warning on every successful press. |
| 6 | AudioSystem | P3 | `setVolume()` skips boss-sequence mode — no effect on music volume during boss fight. |
| 7 | AudioSystem | P3 | `craft_cycle` SFX is registered (`loadSFX('craft_cycle', ...)`) but file `sfx-craft-cycle.mp3` does not exist in `assets/audio/`. Will fail silently at load time. |
| 8 | BossSystem | P2 | Yellow zone has no boss implementation. `activate(room, 'yellow')` silently spawns a GooDragon. |
| 9 | MazeSystem | P2 | `_ghostCollides()` defined but never called. Non-phasing ghosts can walk through walls because BFS pathing is not protected by a per-frame collision guard. |
| 10 | MazeSystem | P3 | `_onTimerExpired` doc comment says "4 cumulative ghost spawns" triggers phasing but code triggers doom at `spawnCount >= 3` (3rd expiry, not 4th). Comment is wrong. |
| 11 | MazeSystem | P3 | `_overlapsCell()` defined but never called — dead code. |
| 12 | TrapSystem | P2 | `_getActiveEnemies()` does not check `player.inMaze` — traps inside maze act on exterior room enemies, not maze ghosts. |
| 13 | FishingSystem | P3 | `findWaterTileAtDistance()` is dead code — charge path was changed to use nearest fish directly. |
| 14 | FishingSystem | P2 | `spawnAmbientFish()` filters `obj.char === '~'` (puddle) for water tiles. Lake rooms likely use `'='` (standing water) not `'~'`. Fish may not spawn. |
| 15 | PolymorphSystem | P3 | `player._killedByGhost = true` set in MazeSystem but never read anywhere. Dead state flag. |
| 16 | MagicSystem | P2 | `_activeEnemies()` and `_activeBackgroundObjects()` ignore `inMaze` — wand spells inside maze target wrong layer. |
| 17 | BossSystem | P3 | `_meleeFacingToward()` receives `_atk` parameter but never uses it (only uses player and head positions). Misleading signature. |
| 18 | PersistenceSystem | P1 | Described as "permanently disabled" in CLAUDE.md but contains fully operational localStorage read/write code. If called anywhere in main.js, it violates the no-persistence design constraint. |
| 19 | PressSystem | P2 | Oil result chars (`🜁 🜂 🜄 🜔`) are U+1F700-block alchemical symbols with inconsistent cross-platform rendering — violates CLAUDE.md character encoding guidance. |
| 20 | BossSystem | P2 | `_grantBossReward()` grants identical +1 consumable slot reward for all three bosses. No rune piece delivery implemented. |

---

## Missing / Incomplete

| System | Missing Element |
|---|---|
| BossSystem | Yellow zone boss entity entirely absent. `activate()` for yellow silently reuses GooDragon. |
| BossSystem | Rune piece delivery on boss defeat (design doc Pillar 1) not implemented. |
| BossSystem | `_checkReflectedProjectileBossHits()` only handles GooDragon; lake boss and turtle boss cannot be reflected-stunned. |
| MagicSystem | Maze layer support in `_activeEnemies()` / `_activeBackgroundObjects()`. |
| TrapSystem | Maze layer support in `_getActiveEnemies()`. |
| PolymorphSystem | `inMaze` check in `createTongueAttack()` — tongue targets exterior enemies when inside maze. |
| PolymorphSystem | No design decision on whether frog can interact with NPCs, pick up items, or use the well. |
| SpellSystem | No enforcement mechanism for `knownSpells` guards — entirely trust-based per-spell. |
| MazeSystem | Wall collision not enforced on normal (non-phasing) ghost movement — `_ghostCollides()` exists but is disconnected. |
| AudioSystem | No per-zone or per-state music transition for yellow zone (cyan zone has its own `cyan-layer1/2.mp3`). |
| WellSystem | 25% mana drop implementation post-activation (supposedly in LootSystem, unverified). |
| PressSystem | `commitSelection()` bypasses `inventorySystem.addConsumable()` — may skip UI update hooks. |

---

## Cross-Reference Notes

- **`'hit'` SFX**: MazeSystem assumes this name is loaded. It is not. The closest loaded name is `'enemy_hit'`. MazeSystem was likely written expecting a generic `'hit'` SFX to be added, or was copied from a context where it existed.

- **`'craft'` SFX**: PressSystem assumes this is loaded. `'craft_cycle'` is loaded (and missing its file). Neither serves as a general craft sound.

- **FishingSystem constructor**: All other systems take `game` as constructor arg (`new XxxSystem(this)`). FishingSystem takes no args (`new FishingSystem()`) and receives `game` as a parameter on every method call. This is an inconsistency but not a bug — it means FishingSystem can theoretically be reused across game instances.

- **PolymorphSystem constructor**: Has no constructor at all. Unlike all other systems it does not store `this.game`. All methods accept `game` as a positional argument. This works but is the only system with this pattern.

- **`campNPCSystem`**: Referenced in HutSystem at lines 365 and 397 (`game.campNPCSystem?.snapCompanionToPlayer?.()`). This system is not in the file listing provided — either it is not yet implemented (optional-chained so safe) or is a system not included in this review scope.

- **`player.luckBlessed`**: Set by WellSystem when `★` Lucky Coin is offered. Flag exists but downstream effects (LootSystem, exit table hooks) are outside this review — verify those hooks actually read the flag.

- **`game.wellFlashDuration`**: Set in `WellSystem._completeRitual()` alongside `wellFlashTimer`. This field is only set here but never read in this file. It is presumably read by a renderer for the flash animation. If the renderer reads `wellFlashTimer / wellFlashDuration` for normalized progress, the assignment is correct.

- **BoulderSystem and boss**: `BoulderSystem.update()` calls `_reset()` when zone is not 'red'. This means boulders only spawn in red-zone rooms. However the `triggerBoulderRain()` path (called from BossSystem for the turtle boss) pushes warnings even when `_lastRoom` reset hasn't cleared them — the two paths are independent and correct.

- **`gooBlobs` cap**: TrapSystem caps at 15 goo blobs (line 443) via `shift()`. BossSystem caps at 20 goo blobs (line 373) via `shift()`. These share the same `game.gooBlobs` array with different caps — whichever runs last sets the effective cap.
