# MAIN.JS REVIEW — PART 1 (lines 1–3000)

Reviewed: 2026-05-15. Source file is ~5804 lines total.

---

## Constructor Analysis

### Systems Wired (lines 56–288)

All 30+ systems are instantiated in constructor order. Several observations:

1. **`PersistenceSystem` is instantiated but never meaningfully used** (line 74). `loadGame()` calls `this.persistenceSystem.clearSave()` and both `saveGameState()` and `loadGame()` are commented-out stubs. The system exists as dead weight but causes no harm.

2. **`this.campNPCSystem`** and `this.wellSystem` are instantiated but their `update()` calls are only inside `updateExploreState`, not `updateRestState`. If a companion or well is relevant in REST that path is silently missing.

3. **System instantiation order dependency risk**: Several systems (`LootSystem`, `TrapSystem`, `InteractionSystem`, `CharacterSystem`, `MenuSystem`, etc.) receive `this` at construction time, meaning `this.player` is `null` at that point. All of these systems must guard against null player. This is correct and expected, but undocumented — worth noting for future system authors.

4. **`this.bridgeMenuOpen` (line 98) is declared before the state block comment** — it breaks the layout convention; all game-state flags start at line 100. Minor readability issue.

### State Declared on Game (lines 100–287)

| Property | Line | Should stay on game? | Notes |
|---|---|---|---|
| `player` | 101 | Yes — shared by all systems | |
| `previousPlayerPosition` | 102 | Borderline — exit crossing detection | Could be PlayerMovementTracker but fine here |
| `currentRoom` | 103 | Yes | |
| `ingredients` | 104 | Yes — shared entity array | |
| `items` | 105 | Yes — shared entity array | |
| `placedTraps` | 106 | Yes (22+ refs — documented exception) | |
| `wellCoinAnim` | 107 | Should be in WellSystem | Only accessed by WellSystem and renderers; renderers read `game.xxx` so moving it would require renderer changes |
| `wellFlashTimer` / `wellFlashDuration` | 108–109 | Should be in WellSystem | Same issue as above |
| `activeNoiseSource` | 110 | Borderline | Set by TrapSystem each frame |
| `backgroundObjects` | 111 | Yes — shared entity array | |
| `steamClouds` | 112 | Borderline — used across many systems | |
| `soundEvents` | 113 | Should be in AudioSystem or EnemySpawnSystem | Array is populated by `_emitSoundEvent()` and read by Enemy AI — could live on a SoundEventBus |
| `particles` | 114 | Yes — cross-system shared array | |
| `debris` | 115 | Yes | |
| `gooBlobs` | 116 | Could be in a GooSystem | Currently no GooSystem exists |
| `puddles` | 117 | Could be in a PuddleSystem | No system exists |
| `wishesUsed` | 118 | Should be in SpellSystem | Only SpellSystem manages wishes |
| `cleanseWave` | 119 | Should be in SpellSystem | Visual state for CLEANSE spell |
| `bossDefeatFlash` | 120 | Should be in BossSystem | |
| `_savedDestroyedSlots` | 121 | Should be in InventorySystem | Cross-run persistence of slot destruction |
| `neutralCharacters` | 122 | Yes — shared entity array | |
| `cureRusalka` | 123 | Should be in FishingSystem or PolymorphSystem | |
| `playerTongueAttacks` | 124 | Should be in PolymorphSystem | |
| `hutInterior` | 125 | Yes (documented interior exception) | |
| `mazeInterior` | 126 | Yes (documented interior exception) | |
| `dungeonFloors` / `dungeonCurrentFloor` | 127–128 | Yes (documented interior exception) | |
| `currentMusicZone` | 131 | Should be in AudioSystem | Tracks which zone's music is loaded — pure audio state |
| `preBossGateActive` | 134 | Could be in BossSystem | Currently set in enterExploreState, read by audio logic |
| `zoneDepths` | 137–143 | Borderline — should be in ZoneSystem | Declared twice (constructor + loadGame), ZoneSystem has helpers but depth lives on game |
| `knownSpells` | 145 | Borderline — SpellSystem would own it but renderers read it | |
| `gameOverWaitingForSpace` / timers | 147–153 | Could be in GameOverSystem | No system exists for game over |
| `characterDeathPending` / related | 149–153 | Should be in CharacterSystem | |
| `pendingNextCharacter` | 151 | Should be in CharacterSystem | |
| `lastDeathCause` / `tombstoneActive` / `tombstonePopup` | 155–157 | Could be in CharacterSystem or MenuSystem | |
| `slotPopup` | 160 | Should be in MenuSystem | Fully managed by menuSystem already |
| `trapCharging` | 163 | Borderline — also in TrapSystem | Both game and TrapSystem reference this |
| `inFlightTraps` | 164 | Yes (22+ refs — documented exception) | |
| `restBundle` | 165 | Could be in a RestSystem or InventorySystem | |
| `hasLeftRestOnce` | 166 | Could be in a RestSystem | |
| `dodgeBlockedFeedbackTimer` | 167 | Should be on Player | Player-specific UI feedback |
| `showVectors` | 168 | Debug only — fine on game | |
| `blessingsCollected` | 174 | Could be in a BlessingSystem | No system exists |
| `roomPreviews` | 177–182 | Could be in RoomGenerator or ExitSystem | |
| `previewBlinkTimer` / `previewBlinkState` | 185–186 | Pure render state — should be in RenderController | |
| `PREVIEW_BLINK_INTERVAL` | 187 | Magic constant — should be in GameConfig | |
| `waveSfxTimer` | 190 | Should be in AudioSystem | Managed by audio SFX logic |
| `glitterTimer` / `GLITTER_SPAWN_INTERVAL` | 193–194 | Should be in InteractionSystem or a ParticleSystem | |
| `inactivityTimer` / WASD blink timers | 197–201 | Should be in a UISystem or RenderController | |
| `pickupMessage` / queue | 203–207 | Should be in MenuSystem | MenuSystem already has `showPickupMessage()` |
| `pathAnnouncement` / timer | 209–212 | Should be in a PathSystem or UISystem | |
| `exitPathHistory` | 215 | Should be in ZoneSystem | |
| `unlockedCharacters` / `activeCharacterType` / `deadCharacters` | 216–218 | Should be in CharacterSystem | |
| `captives` | 219 | Yes — shared entity array | |
| `characterNPCs` | 220 | Should be in CharacterSystem | |
| `keys` / `keyBuffer` / `keyFlashMap` | 222–234 | Yes — input state belongs on game | |
| `spacePressed` / `shiftPressed` / `vPressed` | 232–234 | Yes — input state | |
| `attackSequenceActive` | 235 | Should be on Player | |
| `arrowKeys` | 238–243 | Yes — input state | |
| `ui` | 245–261 | Yes — DOM references | |
| `menuOpen` / menu state | 264–271 | Yes (documented exception — renderers read game.xxx) | |
| `titleAnimationTime` / `introAnimationStarted` | 274–275 | Could be in TitleSystem | No TitleSystem exists |
| `launchButtonBounds` | 276 | Could be in TitleSystem | |

**Summary**: ~15 properties that could cleanly move to existing systems (AudioSystem, BossSystem, SpellSystem, CharacterSystem, PolymorphSystem). Another ~10 are in a grey area where renderers would need updating.

---

## Input Handler Analysis

### `setupInput()` (lines 291–627)

The keydown handler is 200+ lines and contains significant inline logic rather than delegating. Issues by section:

| Handler Block | Line Range | Delegates? | Violation |
|---|---|---|---|
| Cheat menu toggle | 294–351 | Partial — calls `cheatMenu.toggle()` but `toggle_god_mode` rebuilds cheat categories inline | God mode rebuild at 338–340 belongs in CheatMenu |
| `activate_magic_meter` cheat | 343–350 | No — calls `magicSystem?.activateMagicMeter`, rebuilds cheat categories, calls `updateUI` inline | Should be a single `cheatMenu.handleActivateMagicMeter()` call |
| Menu column navigation (A/D) | 367–410 | No | Full column-switching loop with disabled-column skipping lives here — belongs in MenuSystem |
| Menu W/S navigation | 412–424 | No | Index clamping logic inline — belongs in MenuSystem |
| Menu SPACE confirm | 426–430 | Yes — calls `this.selectMenuItem()` | OK |
| Menu SHIFT close | 433–437 | Yes — calls `this.closeMenu()` | OK |
| Spell detection on SPACE/Shift/Enter | 454–463 | Yes — calls `spellSystem.detect()` | OK |
| SPACE keydown | 465–471 | Calls `handleSpacePress()` — not reviewed in part 1 | |
| SHIFT keydown | 472–478 | Calls `handleShiftPress()` — not reviewed in part 1 | |
| V key | 484–490 | Calls `handleVPress()` — not reviewed in part 1 | |

**keyup handler** (lines 502–572):
| Handler Block | Line Range | Delegates? | Violation |
|---|---|---|---|
| Staff block release | 516–521 | No — calls `_releaseStaffBlock(player)` which lives in main.js | `_releaseStaffBlock` belongs in CombatSystem or Player |
| Fishing charge release | 523–526 | Yes — `fishingSystem.releaseCharge()` | OK |
| Trap throw release on SPACE | 528–531 | Yes — `trapSystem.releaseTrapThrow()` | OK |
| Gem wand cancel on space | 535–537 | Yes — `magicSystem.handleSpaceRelease()` | OK |
| Charge hammer cancel | 538–540 | No — calls `item.releaseChargeHammer()` inline | Acceptable (method on item) |
| Bow release + fire | 542–553 | Partial — attack creation, sound, and combatSystem call inline | Bow-release logic belongs in an `ItemSystem.releaseBow()` or Player method |

**Click handler** (lines 575–601): Thin title-screen routing — acceptable.

**Mousemove handler** (lines 604–626): Thin cursor styling for title — acceptable.

---

## Method Catalog

| Method | Line | Purpose | Belongs in main.js? | Notes |
|---|---|---|---|---|
| `constructor()` | 56 | System wiring, state init | Yes — orchestrator | Many properties that shouldn't be on game |
| `setupInput()` | 291 | Event listener registration | Partially — structure fine, logic blocks inside are violations |  |
| `getDodgeRollDirection()` | 630 | Thin wrapper for Player static | No — pass-through wrapper adds no value; call `Player.getDodgeRollDirection` directly at call site |
| `setupStateMachine()` | 634 | Register state handlers | Yes — thin wiring | OK |
| `getNearestInteractiveSlot()` | 657 | Pass-through to menuSystem | No — unnecessary wrapper; callers can use `this.menuSystem.getNearestInteractiveSlot()` |
| `showPickupMessage()` | 661 | Pass-through to menuSystem | No — unnecessary wrapper |
| `showNextPickupMessage()` | 665 | Pass-through to menuSystem | No — unnecessary wrapper |
| `getCurrentZoneDepth()` | 670 | Pass-through to zoneSystem | No — unnecessary wrapper |
| `incrementZoneDepth()` | 674 | Pass-through to zoneSystem | No — unnecessary wrapper |
| `loadGame()` | 678 | Initialize state + transition to TITLE | Mostly yes | Duplicates zoneDepths init from constructor (line 137 vs 694) |
| `enterTitleState()` | 706 | State transition handler | Yes | OK — thin |
| `enterRestState()` | 720 | REST state initialization | Partially | Collision map construction (lines 839–868) belongs in RoomGenerator or a RestRoomFactory |
| `saveGameState()` | 930 | No-op stub | No — remove it | Dead code; entire body is commented-out |
| `applyEquipmentEffects()` | 941 | Pass-through to inventorySystem | No — unnecessary wrapper |
| `canUnlockVault()` | 945 | Vault key detection logic | No — belongs in InteractionSystem or DungeonSystem | Touches grid math, player position, vault state |
| `unlockVault()` | 981 | Vault opening logic | No — belongs in InteractionSystem or DungeonSystem | Spawns particles inline, modifies collision map |
| `updateSecretEventEffects()` | 1032 | Glitter particle spawning | No — belongs in InteractionSystem or a ParticleSystem | Contains game logic, spawns particles |
| `applyCharacterType()` | 1081 | Pass-through to characterSystem | No — unnecessary wrapper |
| `applyGreenDamageModifier()` | 1085 | Pass-through to characterSystem | No — unnecessary wrapper |
| `_isBlockingStaff()` | 1091 | Staff weapon predicate | No — belongs in CombatSystem or Item | Pure item-data query |
| `_releaseStaffBlock()` | 1099 | Staff block release: push enemies + visual | No — belongs in CombatSystem | Applies knockback, spawns visual attacks |
| `_spawnStaffBlockSweepVisual()` | 1128 | Creates 8-direction sweep attacks | No — belongs in CombatSystem or Item.createMeleeRing | Identical to a melee attack pattern |
| `_spawnLavaSweep()` | 1159 | Places lava tiles when weapon has placesLava | No — belongs in InteractionSystem or a WeaponEffectSystem | Modifies room background objects |
| `triggerGreenActionCooldown()` | 1197 | Pass-through to characterSystem | No — unnecessary wrapper |
| `_emitSoundEvent()` | 1206 | Push to soundEvents array | No — belongs in AudioSystem | Trivially thin, but soundEvents should be AudioSystem-owned |
| `playWeaponAttackSFX()` | 1215 | Weapon SFX dispatch | No — belongs in AudioSystem | Checks weapon data and plays SFX |
| `_updateReloadAudio()` | 1228 | Drive reload SFX lifecycle | No — belongs in AudioSystem | Owns energy reload tracking state (`_energyReloadItem`) on game |
| `spawnCharacterNPCs()` | 1258 | Pass-through to characterSystem | No — unnecessary wrapper |
| `swapWithCharacter()` | 1262 | Pass-through to characterSystem | No — unnecessary wrapper |
| `spawnCaptive()` | 1266 | Captive spawn logic with position search | No — belongs in CharacterSystem | 50-attempt position search loop, structure-interior rejection |
| `markRandomBushShaking()` | 1319 | Mark a bush as shaking for Leshy chase | No — belongs in InteractionSystem | Room background object mutation |
| `checkCaptiveInteraction()` | 1350 | Pass-through to interactionSystem | No — unnecessary wrapper |
| `checkPathAmulet()` | 1354 | Path Amulet UI trigger | No — belongs in InventorySystem | Reads equippedConsumables, writes pathAnnouncement |
| `playerHasNoItems()` | 1369 | Checks quick slot emptiness | No — belongs in InventorySystem | Trivial query on player state |
| `transitionToNeutralRoom()` | 1375 | Saves explore state, generates neutral room, transitions | Partially | State save belongs in a SavedStateSystem; room generation logic is inline |
| `animateExitWarp()` | 1450 | Orchestrates exit animation sequence | Yes — state machine animation coordination | OK — is genuinely cross-system |
| `enterExploreState()` | 1544 | EXPLORE state initialization (~440 lines) | Partially | Most of this method is logic, not coordination — see violations section |
| `enterNeutralState()` | 1982 | NEUTRAL state init | Yes — thin | OK |
| `updateNeutralState()` | 1992 | NEUTRAL state update loop | Partially | Ingredient loop (lines 2005–2046) duplicated from REST and EXPLORE; belongs in InventorySystem.updateIngredientPhysics() |
| `enterGameOverState()` | 2104 | GAME_OVER init | Yes — thin | OK |
| `preloadRoomPreviews()` | 2129 | Pass-through to roomGenerator | No — unnecessary wrapper |
| `_activeBackgroundObjects()` | 2136 | Returns active layer's background objects | Borderline | Utility needed by many systems; acceptable as game-level helper |
| `_activeEnemies()` | 2143 | Returns active layer's enemies | Borderline | Same as above |
| `_isHiddenEnemy()` / `_countedEnemies()` | 2152–2157 | Mimic detection predicate | No — belongs in EnemySpawnSystem or CombatSystem | Pure enemy-data query |
| `_spawnEnemyTrailPuddle()` | 2160 | Creates puddle entity | No — belongs in InteractionSystem or a PuddleSystem | Entity construction in main |
| `_applyShamanBuff()` | 2168 | Apply Shaman speed/damage buff to nearby enemies | No — belongs in CombatSystem or Enemy AI | Mutates enemy.speed and enemy.damage directly |
| `update()` | 2188 | Main update dispatcher | Yes — thin dispatcher | OK |
| `updateTitleState()` | 2230 | Title animation timer | Yes — thin | OK |
| `updateSharedGameElements()` | 2238 | Particle, ember stack, goo blob, debris updates (~140 lines) | No — belongs in a ParticleSystem/EffectsSystem | Contains game logic: ember stack thresholds (5 hits), burn application, goo status effects |
| `_isValidBlinkPosition()` | 2378 | Yellow mage blink position validator | No — belongs in CharacterSystem (yellow character ability) | Reads player.collisionMap and room bgObjects |
| `_resolveBlinkTeleport()` | 2413 | Execute blink teleport with particles | No — belongs in CharacterSystem | Creates particles, teleports player |
| `updatePlayerMechanics()` | 2475 | Shared per-frame player logic (~220 lines) | Partially | Green ranger roll, dodge roll, held item update — all contain character-specific logic. Green ranger block belongs in CharacterSystem. |
| `updateRestState()` | 2697 | REST state update loop | Partially | Ingredient loop duplicated (~40 lines) from EXPLORE/NEUTRAL; exit check has inline calc |
| `updateGameOverState()` | 2794 | GAME_OVER update | Partially | Particle update loop (lines 2810–2836) is a third copy of the same particle update pattern |
| `updateExploreState()` | 2839 | EXPLORE state update loop (~600+ lines beyond line 3000) | Partially | Lava/liquid damage processing (2947–3000+) belongs in PhysicsSystem or CombatSystem |

---

## Orchestration Rule Violations

Ordered by severity:

### Severe — Significant logic in main.js

| Violation | Location | Recommended File |
|---|---|---|
| Ingredient attraction/separation loop — duplicated verbatim in `updateRestState`, `updateNeutralState`, and `updateExploreState` | ~2005–2046, 2723–2764, and repeated beyond line 3000 | `InventorySystem.updateIngredients(deltaTime, ingredients, player)` |
| Particle update loop — duplicated in `updateSharedGameElements` and `updateGameOverState`; also a third instance in EXPLORE beyond line 3000 | 2269–2343, 2809–2836 | `ParticleSystem.update(deltaTime)` |
| Ember stack accumulation and burn-ignition threshold (magic numbers 5, 0.5, 2.0) embedded in particle loop | 2285–2337 | `CombatSystem.updateEmberCollisions()` or `ParticleSystem` |
| Goo blob collision + status effect application | 2346–2364 | `InteractionSystem.updateGooBlobs()` |
| Lava damage to player/enemies/ingredients inside physics waterResults loop | 2947–3000+ | `PhysicsSystem` (already owns water) or `CombatSystem.applyLavaDamage()` |
| `_applyShamanBuff()` — enemy stat mutation | 2168–2186 | `CombatSystem.js` or `Enemy.applyBuff()` |
| `_releaseStaffBlock()` + `_spawnStaffBlockSweepVisual()` — combat attack creation | 1099–1157 | `CombatSystem.releaseStaffBlock()` |
| `_spawnLavaSweep()` — modifies room.backgroundObjects | 1159–1195 | `InteractionSystem.spawnLavaSweep()` |
| `spawnCaptive()` — 50-attempt position search, structure-interior rejection | 1266–1317 | `CharacterSystem.spawnCaptive()` |
| `updateSecretEventEffects()` — particle spawn loop with timer | 1032–1078 | `InteractionSystem.updateSecretEvents()` |
| `unlockVault()` — collision map mutation + particle spawn | 981–1030 | `InteractionSystem.unlockVault()` or `DungeonSystem` |
| `canUnlockVault()` — player/vault position geometry | 945–979 | `InteractionSystem.canUnlockVault()` or `DungeonSystem` |
| `checkPathAmulet()` — reads equippedConsumables, writes announcement state | 1354–1367 | `InventorySystem.checkPathAmulet()` |
| Green ranger dodge roll logic block (~80 lines) | 2482–2545 | `CharacterSystem.updateGreenRangerRoll()` |
| Yellow mage blink `_isValidBlinkPosition` + `_resolveBlinkTeleport` | 2378–2471 | `CharacterSystem.resolveBlink()` |
| `_updateReloadAudio()` with `_energyReloadItem` state on game | 1228–1256 | `AudioSystem.updateReloadAudio(item)` |
| `playWeaponAttackSFX()` weapon-data inspection | 1215–1223 | `AudioSystem.playWeaponAttackSFX(weapon)` |
| Crystal Maul charge-hammer auto-fire block | 2884–2895 | `MagicSystem.updateChargeHammer()` or `Item.js` |
| REST room collision map construction (manual nested loops) | 839–868 | `RoomGenerator.generateRestRoom()` |
| Gray zone enemy buff application (`+50% HP/damage`) | 1764–1775 | `ZoneSystem.applyGrayZoneBuffs()` or `EnemySpawnSystem` |
| Room-entry detection grace period + aggro range zeroing | 1925–1929, 2865–2876 | `EnemySpawnSystem.applyRoomEntryGrace()` |

### Moderate — Unnecessary wrappers that add cognitive overhead

The following methods in main.js are pure pass-throughs with no added logic. They should be removed and call sites updated to call the system directly:

`getDodgeRollDirection()`, `getNearestInteractiveSlot()`, `showPickupMessage()`, `showNextPickupMessage()`, `getCurrentZoneDepth()`, `incrementZoneDepth()`, `applyEquipmentEffects()`, `applyCharacterType()`, `applyGreenDamageModifier()`, `triggerGreenActionCooldown()`, `spawnCharacterNPCs()`, `swapWithCharacter()`, `checkCaptiveInteraction()`, `playerHasNoItems()`, `preloadRoomPreviews()`

---

## State-on-Game Audit

### Should move to an existing system

| Property | Move to |
|---|---|
| `currentMusicZone` | `AudioSystem` |
| `waveSfxTimer` | `AudioSystem` |
| `_energyReloadItem` (implicit, set in `_updateReloadAudio`) | `AudioSystem` |
| `bossDefeatFlash` | `BossSystem` |
| `preBossGateActive` | `BossSystem` |
| `cleanseWave` | `SpellSystem` |
| `wishesUsed` | `SpellSystem` |
| `characterDeathPending` / `characterDeathTimer` / `pendingNextCharacter` / `characterDeathName` | `CharacterSystem` |
| `lastDeathCause` / `tombstoneActive` / `tombstonePopup` | `CharacterSystem` |
| `unlockedCharacters` / `activeCharacterType` / `deadCharacters` / `characterNPCs` | `CharacterSystem` |
| `exitPathHistory` | `ZoneSystem` |
| `zoneDepths` | `ZoneSystem` (currently ZoneSystem delegates back to game) |
| `slotPopup` | `MenuSystem` |
| `pickupMessage` / `pickupMessageTimer` / `pickupMessageQueue` | `MenuSystem` |
| `pathAnnouncement` / `pathAnnouncementTimer` | `InventorySystem` or `MenuSystem` |
| `cureRusalka` | `FishingSystem` |
| `playerTongueAttacks` | `PolymorphSystem` |
| `wellCoinAnim` / `wellFlashTimer` / `wellFlashDuration` | `WellSystem` |
| `dodgeBlockedFeedbackTimer` | `Player` |
| `attackSequenceActive` | `Player` |
| `glitterTimer` / `GLITTER_SPAWN_INTERVAL` | `InteractionSystem` |
| `inactivityTimer` / `wasdBlinkTimer` / `wasdBlinkState` | `RenderController` (pure render state) |
| `_savedDestroyedSlots` | `InventorySystem` |

### Should stay on game (justified)

`player`, `currentRoom`, `ingredients`, `items`, `particles`, `debris`, `gooBlobs`, `puddles`, `steamClouds`, `captives`, `backgroundObjects`, `neutralCharacters`, `placedTraps`, `inFlightTraps`, `hutInterior`, `mazeInterior`, `dungeonFloors`, `dungeonCurrentFloor`, `keys`, `arrowKeys`, `keyBuffer`, `keyFlashMap`, `menuOpen`, `menuItems`, `selectedMenuIndex`, `menuColumns`, `disabledColumns`, `ui`, `soundEvents` (debatable), `roomPreviews`

---

## Bugs & Logic Errors

### B1 — `zoneDepths` double initialization (Medium)
**Lines 137–143 and 694–700**: `zoneDepths` is initialized identically in `constructor()` and again in `loadGame()`. The constructor sets them first; `loadGame()` reinitializes them to the same values. This is harmless today but would silently wipe any future in-constructor modifications before `loadGame()` runs.

### B2 — `savedExploreEnemies` / `savedExploreBackgroundObjects` / `savedExploreCaptives` never initialized (High)
**Lines 1656–1658**: In the `shouldRestoreExploreRoom` branch, `this.savedExploreEnemies`, `this.savedExploreBackgroundObjects`, and `this.savedExploreCaptives` are read with spread operators but are never declared in the constructor. They appear to be set later (lines 1798–1800) only during new room generation. If `shouldRestoreExploreRoom` is true on first load (unlikely but edge-case possible), these would be `undefined` and the spread would throw.

### B3 — `lavaDamageTimer` lazy initialization at call site (Medium)
**Line 2987**: `if (!entity.lavaDamageTimer) entity.lavaDamageTimer = 0;` initializes the timer at the damage-application site. This violates the "no lazy property initialization" anti-pattern documented in CLAUDE.md. If `entity` is a player, timer starts at 0 and immediately decrements to negative, allowing damage the first frame. Should initialize in constructors.

### B4 — `_energyReloadItem` not declared in constructor (Medium)
The `_updateReloadAudio` method (line 1228) reads and writes `this._energyReloadItem` but it is never initialized in the constructor. Comparison `if (this._energyReloadItem !== item)` when undefined and item is non-null will evaluate to `true` on the first frame and start the energy charge SFX. Minor behavior issue (one extra play call) but the property should be declared.

### B5 — `savedExploreState` not declared in constructor (Medium)
**Line 1378**: `this.savedExploreState` is assigned in `transitionToNeutralRoom()` and read in `updateNeutralState()` (line 2075). It is not declared in the constructor. If `updateNeutralState` is called before any neutral transition (e.g. edge case after game restart), the `if (this.savedExploreState)` guard protects against the read, but the property itself being undeclared is a pattern violation.

### B6 — Wave SFX timer resets to 0 when not in ocean zone (Medium)
**Lines 2857–2858**: When not in an ocean room, `this.waveSfxTimer = 0` is set every frame. This means entering an ocean room would fire a wave SFX on the very first frame (waveSfxTimer starts at 0, immediately hits `<= 0` condition). Should initialize to a positive value like `3.0` on room entry.

### B7 — Gray zone applies enemy buffs to ALL enemies including bosses (Low)
**Lines 1764–1775**: The gray zone +50% HP/damage loop runs on `this.currentRoom.enemies` without checking for boss enemies or checking if buffs were already applied. If a boss is in a gray zone room, it gets double-buffed (RoomGenerator may have already set boss HP/damage). `enemy.maxHp` is also set but `enemy.hp` is set to `Math.ceil(hp * 1.5)` separately — these could diverge if called twice.

### B8 — `previewBlinkTimer` / `previewBlinkState` updated in EXPLORE but declared for any state (Low)
**Line 2843**: `previewBlinkTimer` increments in `updateExploreState`. It is never reset when entering REST or NEUTRAL states. On return to EXPLORE, it picks up from wherever it was which is correct, but the blink state (`previewBlinkState`) may be in an arbitrary phase. Minor visual artifact.

### B9 — `markRandomBushShaking()` has misaligned indentation in the if-block (Low)
**Lines 1337–1340**: The `if (this.zoneSystem.leshyChaseActive)` console.warn block is indented as if it is outside the `if (!selectedObject)` block, but is inside it. This is a readability issue, not a logic bug (the logic is correct).

### B10 — `canUnlockVault()` returns `false` from a non-obvious fallthrough (Low)
**Lines 973–978**: The final `if/else` returns `true` or `false` but could be simplified to `return isSouthOfVault && isNearCenter`. The current form is verbose but correct.

---

## Dead Code

### D1 — `saveGameState()` (line 930)
Entire body is commented out. The method exists, is called at end of `enterRestState()`, but does nothing. Safe to remove the call and method, or at minimum document why the stub exists.

### D2 — `loadGame()` commented-out block (lines 680–688)
The entire persistence-restore block is commented out. The comment overhead is significant (9 lines). Could be replaced with a single comment: `// localStorage persistence disabled — see CLAUDE.md`.

### D3 — `progressionColor` computed but not used (lines 1670–1683)
```javascript
const progressionColor = this.zoneSystem.getProgressionColor();
// ...
if (progressionColor) {
  // empty block
}
```
`progressionColor` is computed and the empty `if` block suggests future use, but currently does nothing. The empty if-block is dead code.

### D4 — TODO comment in `updateSecretEventEffects()` (line 1074)
```
// TODO: Add other secret event effects here
```
Represents a real functional gap (shaking leshy bushes are referenced in design docs). This is P2-level missing content.

### D5 — `bridgeMenuOpen` reset (line 1884)
`this.bridgeMenuOpen = false` is set in `enterExploreState()` in the `!shouldRestoreExploreRoom` branch. There is no matching `bridgeMenuOpen = true` visible in lines 1–3000 (would be in later lines). The flag is referenced at line 2605 as a movement lock. Worth verifying it is actually set to `true` somewhere — may be dead if RidgeSystem doesn't set it.

---

## Magic Numbers

| Value | Location | Should Be |
|---|---|---|
| `2.0` (game over death delay) | Line 2116 | `GameConfig.GAME_OVER_DELAY` |
| `0.5` (sound event lifetime) | Line 1211 | `GameConfig.SOUND_EVENT_LIFETIME` |
| `0.5` (EMBER_STACK_COOLDOWN) | Line 2295 | `GameConfig.EMBER_STACK_COOLDOWN` |
| `5` (EMBER_THRESHOLD) | Line 2297 | `GameConfig.EMBER_THRESHOLD` |
| `2.0` (EMBER_STACK_WINDOW) | Line 2294 | `GameConfig.EMBER_STACK_WINDOW` |
| `GRID.CELL_SIZE * 1.2` (ingredient separation) | Lines 2018, 2736 | `GameConfig.INGREDIENT_SEPARATION_FACTOR` |
| `40` (separation force) | Lines 2022, 2740 | `GameConfig.INGREDIENT_SEPARATION_FORCE` |
| `2.0` (room entry grace period) | Line 1925 | `GameConfig.ROOM_ENTRY_GRACE_PERIOD` |
| `1.5` (gray zone HP/damage multiplier) | Lines 1771, 1773 | `GameConfig.GRAY_ZONE_ENEMY_MULTIPLIER` |
| `250` (staff block knockback force) | Line 1110 | `GameConfig.STAFF_BLOCK_KNOCKBACK` |
| `C * 2` (staff block radius, `radius = C * 2`) | Line 1107 | `GameConfig.STAFF_BLOCK_RADIUS` |
| `0.025` (staff sweep step delay) | Line 1131 | Inline constant — fine for now |
| `GRID.CELL_SIZE * 3` (blink safety margin) | Line 2386 | `GameConfig.BLINK_MARGIN_CELLS` |
| `0.5, 1.10` (warp animation durations) | Lines 1507, 1521 | AnimationConfig constants |
| `10.0` (INACTIVITY_THRESHOLD) | Line 200 | Already named `this.INACTIVITY_THRESHOLD` — OK |
| `0.5` (WASD_BLINK_INTERVAL) | Line 201 | Already named — OK |
| `3.0` (PATH_ANNOUNCEMENT_DURATION) | Line 213 | Already named — OK |
| `8.998` (title track loop point) | Line 717 | AudioConfig or comment explaining why |
| `5.5` (REST player spawn row) | Line 809 | `GameConfig.REST_PLAYER_SPAWN_ROW` |
| `4.5` (referenced in comment but actual value is 5.5) | Line 808 | Comment inconsistency |

---

## Cross-Reference Notes

1. **`enterExploreState()` is ~440 lines** (1544–1980). This is the largest method in the first 3000 lines and contains the most logic violations. Room generation, zone depth management, enemy setup, music switching, and state restoration are all interleaved. Splitting into well-named sub-methods would be the highest-impact refactor in this range.

2. **Ingredient physics loop is triplicated**: Identical O(n²) separation logic appears in `updateRestState`, `updateNeutralState`, and `updateExploreState`. This is the clearest candidate for extraction into `InventorySystem.updateIngredients()`.

3. **The `waterResults` lava-damage loop** (beginning at line 2947) is a major logic block inside `updateExploreState`. It handles ingredient destruction, item destruction, lava-immune enemy tracking, player lava death, and general entity lava damage — all in main.js. This should be in PhysicsSystem (which already owns water collision) or a new `LiquidSystem`.

4. **`_savedMagicMeter` (line 815)** — set as `this._savedMagicMeter = savedMagicMeter` but never declared in the constructor. This is a lazy property initialization (anti-pattern listed in CLAUDE.md).

5. **Green ranger and yellow mage character-specific logic** lives entirely in main.js (`updatePlayerMechanics`, `_resolveBlinkTeleport`, etc.). If more character types are added with special movement, this will grow unboundedly. CharacterSystem is the natural home.

6. **`this.roomEntryGraceTimer`** (line 1925) is not declared in the constructor — lazy initialization anti-pattern.

7. **Audio SFX loading in `enterRestState()`** (lines 750–776): All SFX are loaded on first REST entry via the `audioSystem.mode === 'single'` branch. If a new SFX is added, it must be added here. This is a hidden coupling: `AudioSystem` doesn't know about its own assets list. A self-contained `audioSystem.loadGameSFX(base)` method would consolidate this.

8. **`knownSpells` reset location**: The reset is described in CLAUDE.md as happening "in the true-game-over reset block alongside zone depths." This block is not visible in lines 1–3000 (likely in the game-over handler post-space-press, beyond line 3000). Consistent with documentation.

9. **`_savedDestroyedSlots` vs. `player.destroyedSlots`**: There are two places where destroyed slot state is maintained — on game (`_savedDestroyedSlots`) and on player. The game copy is set from player at one point and restored at another. If the save/restore cycle has any ordering bug, slot destruction state could be wrong after a character death. The pattern is fragile.

10. **`handleSpacePress()` is called from the keydown handler** (line 469) but is defined beyond line 3000. This is the critical input dispatch method and likely contains the most logic violations. The partner agent reviewing lines 3000–5804 should prioritize it.
