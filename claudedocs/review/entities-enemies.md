## ENEMY ENTITIES REVIEW

_Reviewed: 2026-05-15_
_Files: Enemy.js (3,688 lines), GooBlob.js (83 lines), GooDragon.js (256 lines), GooHead.js (392 lines), LakeBoss.js (406 lines), TurtleShell.js (304 lines), TurtleHead.js (236 lines), TurtleLeg.js (70 lines)_

---

### Enemy.js — Method Catalog

| Method | Line | Purpose | Issues |
|--------|------|---------|--------|
| `constructor(char, x, y, depth)` | 30 | Full entity initialization — stats, AI state, status effects, all mechanic systems | Dual-init pattern for kiter/jumper (legacy `packBehavior`/`jumpBehavior` block + new-style `movementStyle` block). Zombie state possible if `!this.data.movementStyle` check wrongly sets style. |
| `setCollisionMap(map)` | 356 | Injects grid collision array | Trivial. |
| `setBackgroundObjects(objs)` | 360 | Injects background object array | Trivial. |
| `setGame(game)` | 364 | Injects game reference | Required for `this.game.audioSystem`; not set on all construction paths. |
| `setRoom(room)` | 368 | Injects room reference | Rarely read outside navigation. |
| `setSteamClouds(clouds)` | 372 | Injects steam cloud array | Trivial. |
| `setTarget(target)` | 376 | Sets player reference | `target` can be null; all callers must guard before calling `update()`. |
| `getElementalModifier(elementType)` | 380 | Returns damage multiplier for an element | Correct. Returns 1.0 as safe default. |
| `shouldApplyStatusEffect(effect)` | 398 | Gate for immunity check | Only checks immunity list, not whether `statusEffects[effect]` exists — redundant with `applyStatusEffect` guard. |
| `applyStatusEffect(effect, duration)` | 403 | Applies status effect by name | Stacking rule uses `Math.max(existing, new)` — does NOT reset active timer on re-application (desired behavior for DOTs but means burn cannot be "refreshed" to its default 8s if already lower). |
| `updateStatusEffects(deltaTime)` | 418 | Ticks all active status effects, returns DOT damage events | `polymorph` is mentioned in other systems (Witch, Rusalka) but is NOT in the `statusEffects` map — the effect has no handler here. Sleep breaking on damage is handled inside `takeDamage`, not here — works but split logic. |
| `isStunned()` | 529 | Returns stun state | Correct. |
| `isFrozen()` | 533 | Returns full-freeze state | Correctly checks BOTH active and `frozen` sub-flag, which is what hammer shatter needs. |
| `isWet()` | 537 | Returns wet state | Correct. |
| `isSleeping()` | 539 | Returns sleep state | Correct. |
| `isCharmed()` | 541 | Returns charm state | Correct. No charm target-swap is done inside `Enemy.update()` — that happens in `CombatSystem` per-frame override (line ~1157). |
| `isKnockedBack()` | 543 | Returns knockback state | Correct. |
| `isBlind()` | 546 | Returns blind state | Correct. |
| `getEffectiveDamage()` | 549 | Returns 0 if blind, else `this.damage` | Correct; used by all `create*Attack` methods. |
| `getSpeedMultiplier()` | 553 | Stun/freeze/knockback speed multiplier | Returns `0` for stun, knockback, full-freeze; partial for slow-freeze. Order-dependent: stun check runs before knockback check — both produce 0 so order is irrelevant. Correct. |
| `getActiveStatusEffects()` | 561 | Returns array of active effect keys | Utility; not called internally. |
| `calculatePackMovement(playerPos, speedMultiplier)` | 569 | Legacy pack movement for `packBehavior.enabled` kiters | Only called from `_moveKiter` when `this.packBehavior` exists. Not used by new-style `movementConfig`-only kiters. |
| `update(deltaTime)` | 693 | Main AI loop | Very long (~1,010 lines). Returns object `{ dotDamage, [justAggrod], [sapDamage], [itemAttack], [shouldSpawn], [shouldPlaceTrail], [shouldBuff], [shouldLure], [shouldLayTrap] }`. Multiple early-return paths may skip mechanic ticks (trail/buff/lure/trap cannot fire in same frame as sapDamage or shouldSpawn). |
| `_blendVelocity(deltaTime)` | 1708 | Smooth velocity interpolation | Correct; snaps at < 0.5 px/s delta to avoid float drift. |
| `_updateMovement(speedMultiplier, targetPos, deltaTime)` | 1728 | Dispatches to archetype movement | `jumper` is routed to `_moveChaser` here, with jump override applied post-update in the main loop. Correct but non-obvious. |
| `_moveChaser(speedMultiplier, targetPos, deltaTime)` | 1739 | Direct pursuit via vector navigation | Correct. Falls back to direct direction if no collision map. |
| `_moveKeeper(speedMultiplier, targetPos, deltaTime)` | 1762 | Range-maintain + strafe movement | Correctly reads `this.keeperStrafeDir` (set in constructor). Falls through to `_moveChaser` when out of range. |
| `_moveKiter(speedMultiplier, targetPos, deltaTime)` | 1801 | Pack hunt + hover + rush cycle | Two code paths: one for legacy `packBehavior`, one for `movementConfig`. Both paths contain the hover → attack-rush cycle independently. **Duplication risk.** |
| `_moveAmbusher(speedMultiplier, targetPos, deltaTime)` | 1937 | Burst on wake, then chaser | Correct and minimal. Burst direction always toward current target — does not lock direction at wake moment. |
| `_updateWanderMovement(speedMultiplier, deltaTime)` | 1961 | Idle wander; water-aware | Correct. `waterAffinity` enemies steer toward water. 8 attempts max to find non-water direction for non-water enemies. |
| `_applyWindupMovement(speedMultiplier)` | 2023 | Windup movement (stop/advance/retreat) | Correct. 40% speed. |
| `updateVectorNavigation(speedMultiplier, targetOverride, deltaTime)` | 2052 | Pathfinding around obstacles | Has **operator precedence bug** at line 2212 (see Bugs section). |
| `computeNodePath(targetPos, allowFlip)` | 2313 | Builds waypoint chain around obstacles | O(n) where n ≤ 8 nodes × 180 degree search each. Bounded but the inner DDA loop can still be expensive for dense maps. |
| `hasLineOfSight(start, end, maxLength)` | 2449 | DDA grid traversal for navigation | Correct DDA. Uses room-specific `collisionMap.length` for bounds — handles interior grids. |
| `getVisionObstructionPoint(start, end, maxLength)` | 2518 | Debug/visualization only | Uses sample-based `isBlocked` (not DDA). **Inconsistency**: uses `GRID.COLS/GRID.ROWS` (hardcoded global) for bounds instead of dynamic map length like `hasLineOfSight`. Will produce incorrect bounds for hut/dungeon interiors. |
| `hasVision(start, end, maxLength, opts)` | 2601 | Aggro/memory vision check | Uses linear sampling at `CELL_SIZE/2` intervals — O(n) with n ∝ distance. Dense background object loop inside sample loop = O(n × m) where m = background object count. **Performance concern for large rooms with many objects.** |
| `_isOnWater()` | 2714 | Checks if enemy is on a water tile | Named `_isOnWater` but comment above says "isTargetInTallGrass" — **mismatched comment.** |
| `isTargetInTallGrass()` | 2728 | Checks if player overlaps tall grass | Correct. |
| `canAttack()` | 2742 | Whether AI can trigger an attack | Sap type has special guard for target capacity. Correct. |
| `attack()` | 2754 | Legacy simple attack (returns damage int) | Only `this.damage`, ignores `blind`. Likely dead code — `createAttack()` is used by all callers. |
| `createAttack()` | 2760 | Routes to attack-type factory | Switch handles: melee, ranged, magic, fire, sap, tongue. Missing: `rock` and `potion` are handled as sub-cases inside `ranged` via `projectileType` — correct but undocumented in the dispatch. `steam_cloud` is inside `magic` via `steamCloud.enabled` — same. |
| `createRockProjectile()` | 2810 | Pyroclast rock throw | Correct. Leaves `leavesScorch: true` for CombatSystem to handle. |
| `createPotionAttack()` | 2839 | Alchemist potion throw | Reads `this.data.potionMechanic.potionTable` — crashes if `potionMechanic` is missing or `potionTable` is empty. No guard. |
| `createSteamCloudAttack()` | 2871 | Steam Specter cloud | Falls back to `createMagicAttack()` if `cfg` is null. Correct. |
| `getFacingDirection()` | 2903 | Unit vector toward target | No guard for `this.target === null` — crashes if called without target. Used by `createAttack()` which is guarded, but could be called externally. |
| `createMeleeAttack(knockback)` | 2910 | Standard melee hitbox | Correct. Passes `knockbackMultiplier` field. `isImpact` flag forwarded for staff block bypass. |
| `createWindupAttackVisual()` | 2946 | Pre-attack ghost hitbox | Includes `ownerOffsetX/Y` for tracking moving enemies during windup. Correct. Hardcodes `knockback: 300` instead of using `knockbackMultiplier`. **Minor inconsistency.** |
| `createProjectile()` | 2991 | Standard ranged shot | Arrow sub-type handled here. Randomness ±0.05 rad. Correct. |
| `createTongueAttack()` | 3046 | Frog/lizard tongue attack | Returns a compound state-machine object rather than a position/velocity projectile. Clean pattern. |
| `getArrowCharForAngle(angle)` | 3072 | Maps angle to 8-dir arrow char | Correct. |
| `createMagicAttack()` | 3086 | 3-projectile spread | Comment says "Reckless misdirection (applied to all missiles)" but no misdirection code follows — **dead comment, misleading.** |
| `createFireBreath()` | 3129 | 5-projectile fire cone | Same dead "Reckless misdirection" comment. No `onHit: 'burn'` applied — fire projectiles do NOT apply burn status. Contrast with `createMiniFireBreath()` which does. **Bug: fire-type enemies' normal attacks don't burn.** |
| `createMiniFireBreath()` | 3172 | 5-projectile burn cone for lava-state tortoise | Correctly sets `onHit: 'burn'`. |
| `createSapAttack()` | 3210 | Bat sap attachment | Registers bat in `target.activeSappingBats`. Returns null — damage done in update. Correct. |
| `takeDamage(amount, attackId)` | 3225 | Takes damage, handles iframes, sleep, sapping, enrage, windup interrupt | Correct. Per-enemy hit SFX via `data.sfx.hit`. Sleep cleared here, not in `updateStatusEffects`. |
| `isInvulnerable()` | 3313 | Simple iframe check | Correct. |
| `shouldRenderVisible()` | 3317 | Render visibility gate | Always returns `true`; override point for invisible enemies (not currently used). |
| `getIframeFlashColor()` | 3321 | Blink color during iframes | Correct. |
| `getDOTBlinkColor()` | 3327 | Returns color for DOT/status visual | Priority: burn > poison > acid > bleed > stun > sleep > charm > freeze > wet. No blink for `blind` — **blind has no visual indicator from this method** (only `getBlindIndicator` shows an icon). |
| `isWindingUp()` | 3386 | Windup state check | Correct. |
| `getWindupIndicator()` | 3390 | Red `!` above enemy during windup | Correct. |
| `getMemoryIndicator()` | 3401 | Gray/yellow `?` during memory chase | Correct. |
| `getHoverIndicator()` | 3415 | `...` during pack hover | Correct. |
| `getDetectionIndicator()` | 3427 | Yellow/red `!` on detection | `isAttackingRush` check uses `this.packBehavior && this.packBehavior.enabled` — **does not cover new-style kiters that use `movementConfig` only**. New-style kiter attack-rush indicator stays yellow instead of turning red. |
| `getSappingIndicator()` | 3440 | Sap bat indicator position | Layout math correct for 1/2/3 bats. |
| `canSpawn()` | 3465 | Spawn rate-limit checks | Correct. |
| `registerSpawn(enemy)` | 3472 | Record a spawned child | Correct. |
| `notifySpawnDeath(enemy)` | 3479 | Decrement active spawn count | Correct. |
| `getSpawnIndicator()` | 3486 | `+` indicator during spawn windup | Correct. |
| `getBlindIndicator()` | 3493 | `X` icon when blind | Correct. |
| `evaluateItemPickup(items)` | 3500 | Score items for pickup | Correct. Distance-weighted score. |
| `pickupItem(item)` | 3530 | Add item to inventory, auto-equip weapon | Correct. |
| `equipWeapon(item)` | 3544 | Sets attackType and attackRange for wielded weapon | Correct. |
| `shouldUseConsumable()` | 3558 | Decides if enemy should self-heal | Correct. |
| `useConsumable(item)` | 3573 | Applies consumable effect | Only handles `heal` and `maxhp`. Any other consumable type is silently ignored. |
| `convertToEnemyAttack(attack)` | 3594 | Stamps `owner: this` onto an attack | Correct. |
| `dropInventory()` | 3601 | Drops items on death | Correct. |
| `getStunDroppedItems()` | 3618 | Scatters items when stunned by electricity | Also clears `equippedWeapon` and resets `attackType`. Correct. |
| `breakSapping(knockbackForce)` | 3643 | Detaches sapping bat | Correct. Deregisters from target's `activeSappingBats`. |
| `getHitbox()` | 3670 | Returns AABB for collision | Returns `position` as top-left directly. Consistent with how enemies are rendered. |
| `getDrops()` | 3679 | Rolls item drops | Correct. |

---

### AI Decision Tree Coverage

**States:** `idle`, `rest`, `chase`, `windup`, `attack`, `boss`

**Attack type dispatch in `createAttack()`:**

| Attack type | Handled | Notes |
|-------------|---------|-------|
| `melee` | Yes | Routes to `createMeleeAttack()` or lava mini-breath |
| `ranged` | Yes | Sub-dispatches on `projectileType`: default → projectile, `rock` → rock, `potion` → potion, `arrow` → arrow |
| `magic` | Yes | Sub-dispatches on `steamCloud.enabled`: default → 3-spread, true → steam cloud |
| `fire` | Yes | 5-projectile cone — **no `onHit: 'burn'`** (bug) |
| `sap` | Yes | Attach-and-drain mechanic |
| `tongue` | Yes | State-machine whip attack |
| `item_ranged` / `item_melee` | Yes | Weapon hand-off to `Item.js` |

**Missing attack types referenced elsewhere:**
- `charge` — handled by `chargeMechanic` data field, not as `attackType`. Correct.
- `buff` — handled by `buffMechanic` data field. Correct.

**AI state machine gaps:**
- The `attack` state is set by the windup timer expiry but never directly dispatched in the main `update()` if-else chain (the `canAttack()` gate in the game loop handles it). If `windupTimer` goes negative before game loop polls `canAttack()`, the enemy could linger in `attack` state indefinitely — low probability but possible.
- Charmed enemies: `update()` does NOT redirect `this.target` — charm target reassignment happens outside in `CombatSystem` per-frame. If charm expires mid-frame after CombatSystem runs, the enemy returns to player-targeting without a memory mark, and immediately attacks.

---

### Status Effect System Audit

**Effects defined in `statusEffects` map:**
burn, poison, acid, bleed, freeze (with frozen sub-flag), stun, sleep, charm, wet, knockback, blind

**`applyStatusEffect` stacking rule:**
Uses `Math.max(existing.duration, newDuration)` — **duration never resets downward** but also never refreshes upward beyond the max. This means: applying burn with 8s when it already has 7s remaining does nothing. Applying burn with 8s when it has 2s remaining sets it to 8s. This is correct for "don't stack" semantics but means there is no "refresh" path; a second application during the tail of a DOT will not reliably extend it.

**Missing `polymorph` effect:** The Rusalka and Witch entities apply a `polymorph` effect to the player, but this string does not appear in `Enemy.statusEffects` or `updateStatusEffects`. The effect is handled entirely on the `Player` side and was never designed to apply to enemies — this is expected, not a bug.

**Missing `wet` escalation with freeze:** `applyStatusEffect('wet')` and `applyStatusEffect('freeze')` are independent. `CombatSystem` checks `isWet()` at freeze-hit time and applies `statusDuration = 5.0` — this logic lives outside `applyStatusEffect`, which is the correct pattern.

**Sleep vs stun divergence:** Sleep breaks on damage (handled in `takeDamage`) but stun does not — correct behavior. However sleep's timer still counts down while the enemy is sleeping (it expires naturally OR on damage) — this is intended.

**`acid` and `bleed` status effects:** Both are declared and tick correctly. No enemies in `enemies.js` currently use `onHit: 'acid'` or `onHit: 'bleed'`. These are implemented but unused as of this review.

**`blind` has no DOT blink:** `getDOTBlinkColor()` does not include blind in its priority chain. Blind enemies have no color indicator — only the `X` icon from `getBlindIndicator()`. This is arguably correct (blind is not a DOT) but inconsistent with how stun/sleep/charm appear.

---

### Movement Archetype Implementations

| Archetype | Implemented | Config path | Notes |
|-----------|-------------|-------------|-------|
| `chaser` | Complete | N/A (default) | `_moveChaser` → `updateVectorNavigation`. Clean. |
| `keeper` | Complete | `movementConfig.preferredRange`, `rangeTolerance` | `keeperStrafeDir` initialized in constructor. Falls through to chaser when out of range. Correct. |
| `kiter` | Complete (two paths) | `movementConfig` or legacy `packBehavior` | **Duplicated hover/rush logic** across both paths. New-style kiter's `isAttacking` rush color doesn't turn red (detection indicator bug). |
| `jumper` | Complete | `movementConfig` or legacy `jumpBehavior` | Jump direction prefers cached `currentDirection` (wall-aware). Water mode uses straight-ish swim. Correct. |
| `ambusher` | Complete | `movementConfig.wakeRadius`, `burstSpeed`, `burstDuration` | Burst direction not locked at wake moment — always re-aims at current player position during burst. This is a design choice but could feel "cheaty" since the burst still tracks. |

**All 5 archetypes are fully implemented.** The main concern is the duplicated kiter path.

---

### Pack Coordination Analysis

**Mechanism:** `this.packmates[]` is set by an external system (main.js/CombatSystem). Coordination is push-based: the first enemy to detect/lose the player synchronously writes into packmates' fields.

**Shared state written per-frame:** `target`, `lastKnownPosition`, `aggroMemoryActive`, `memoryChaseTimer`, `memoryMoveDelayTimer`, `memoryMarkPlane`, `memoryStaleTimer`, `currentDirection`, `enraged`, `state`, `detectionIndicatorTimer`.

**Race conditions:**
1. **Simultaneous detection:** If two packmates both detect the player in the same frame, each writes into the other's state. The second write "wins" and overwrites the first. In practice this is benign (they agree on the player position) but the ordering depends on iteration order in the game loop.
2. **Memory mark expiry race:** `memoryChaseTimer` is ticked by each individual enemy AND written by packmate communication. If one packmate expires the timer and clears the mark, another packmate may be mid-update and still act on a now-null `lastKnownPosition` before its update runs. Guard exists: `if (this.aggroMemoryActive && this.lastKnownPosition)` — so null-deref is avoided, but the enemy may skip one frame's movement.
3. **Cleanup after mark expires:** When `memoryChaseTimer` hits 0, the expiring enemy iterates `this.packmates` and resets them. If a packmate was already removed from the room (killed mid-combat), iterating a stale reference will set fields on a dead entity — no crash since JS tolerates this, but fields on the dead entity are pointless.
4. **No `memoryMarkSuspected` reset in packmate clear:** Both memory-expiry cleanup blocks (`effectiveDistance > aggroRange` path and in-range path) clear `aggroMemoryActive` on packmates but do NOT reset `memoryMarkSuspected`. Stale `memoryMarkSuspected: true` on a mate could cause wrong `?` color on next detection.

---

### Boss Entity Analysis

#### GooDragon (`Ω`)
- **Status:** Full implementation.
- **Phases:** 3. P1: burst only. P2: alternating burst/spray. P3: faster burst + float center drifts toward player.
- **Sub-entity lifecycle:** Coordinated by BossSystem — GooHead is created externally. GooDragon only queues attacks via `pendingBossAttacks`; BossSystem drains and spawns projectiles. Clean separation.
- **Phase transition:** `transitionToPhase(phase)` sets brief i-frames, doubles reflectable chance from P2+. Correct.
- **SFX:** `data.sfx.hit` and `data.sfx.death` defined in BOSS_DATA. Consistent.
- **`REFLECTABLE_CHANCE` at 0.15 = 15%**, comment says "1 in 10" (10%) — **misleading comment.**
- **`p2AttackToggle`** resets to `false` on phase transition so P2 always starts with a burst, then alternates. Correct.

#### GooHead (`ω`)
- **Status:** Full implementation.
- **Phases:** Attached (P1-2) and Detached (P3).
- **Attached AI:** Orbits a dynamic "diamond corner" point calculated relative to the midpoint between dragon and player. Lunge triggers when player enters a 64px expanded AABB. Lunge committed at a fixed direction (no tracking during lunge). Auto-grabs player on AABB overlap after lunge. Grab held for `GRAB_DURATION=2s`, then auto-released.
- **Detached AI:** DVD-bounce physics. Absorbs knockback into bounce trajectory — player hits deflect the head. Periodically fires projectiles. No i-frame timer reset visible in `_updateDetached`; relies on base class timer.
- **State transition:** `detach()` called by BossSystem on P3 transition. Releases any grab, launches at diagonal. Clean.
- **Grab cooldown bug:** `_startGrab` calls `player.applyStatusEffect('goo', GRAB_DURATION + 1.5)` — but `'goo'` is not in the player's `statusEffects` map (player has different status effects than enemies). This either silently no-ops or throws — **needs cross-reference to Player.js to confirm.**
- **`tx`/`ty` scoping:** In `_updateAttached`, `tx` and `ty` are declared with `let` inside the `if (!this.isGrabbing)` block but used outside it in the orbit code (line 208 checks `if (tx === undefined)`). This relies on `var`-like hoisting behavior — but `let` does NOT hoist. `tx`/`ty` will be `undefined` when read outside that block in all cases where `!this.isGrabbing` is false. **This is a real bug:** when `isGrabbing` is true, `tx` is `undefined`, the `if (tx === undefined)` fires, orbit code runs, and `tx`/`ty` are assigned — so the grab state overrides velocity to zero (line ~249) but then the orbit code below sets new velocity anyway. The grab hold logic at the bottom (lines 242-251) zeros velocity, which runs last, so it "works" by accident. If the ordering changes, this will break.
- **`_savedCollisionMap` cleanup:** On `_endLunge()`, collision map is restored from `_savedCollisionMap`. If `_endLunge` is called twice (e.g., lunge miss + stun), the second call sets `collisionMap = undefined` (since `_savedCollisionMap` was already cleared). **This would disable wall collision permanently.** Guard exists: `if (this._savedCollisionMap !== undefined)` — correct.

#### LakeBoss (`~`)
- **Status:** Full implementation. Does NOT extend `Enemy` — standalone class.
- **Phases:** Not HP-based phases but behavioral: `underwater` → `surfaced` → `slamming` cycle. HP influences ice-stream cooldown rate.
- **`ENRAGED_THRESHOLD = 32` (40% HP):** Defined as a constant but **never referenced anywhere in the file** — dead constant. The comment says "used only for color change" but no color change code exists.
- **Ice stream count mismatch:** `ICE_STREAM_SHOTS = 5` but the shuffle array is `[0, 1, 2, 3]` (4 elements). The `t` calculation uses `shotIdx / (ICE_STREAM_SHOTS - 1)` where `shotIdx` comes from the 4-element array. Maximum `shotIdx = 3`, so `t = 3/4 = 0.75` — the 5th shot position (t=1.0) is never reached. **The cone is always truncated: only 4 of 5 spread positions are fired.** This is a silent logic error — the boss always fires 4 ice shots not 5 despite the constant name.
- **`shockwaveActive` set externally:** `LakeBoss` reads `this.shockwaveActive` (line 195) but never initializes it in the constructor. BossSystem sets `boss.shockwaveActive = !!this._iceShockwave` each frame. If BossSystem hasn't run yet in a frame (ordering edge case), this is `undefined`, and `!undefined === true`, which correctly suppresses ice firing. Low risk but fragile.
- **`_clampToWater()`:** Linear scan over all water tiles every frame for nearest-tile fallback — O(n). Acceptable for small rooms. The `onWater` check uses 1.5-cell radius which may be too loose for diagonal approaches.
- **No `sfx` field:** LakeBoss has no hit/death SFX data. `takeDamage` never calls any audio. **Silent damage.**

#### TurtleShell (`@`)
- **Status:** Full implementation.
- **Phases:** 2. P1: ricochet + head-reveal charge cycle, body immune to direct hits. P2: faster ricochet + whole body vulnerable (flipped).
- **`_fireCone()`:** Method exists (line 239) but is **never called anywhere in the file or BossSystem**. The charge sequence ends with `justFired = true` and enters rolling — the cone burst was apparently removed from the charge flow but the method was left behind. **Dead code.**
- **Phase 2 rolling:** `stopTimer` in P2 rolls never triggers `headRevealPending` (the countdown-to-head-reveal block is gated on `this.bossPhase === 1`). In P2 the shell rolls indefinitely at higher speed with only boulder rain breaking the pattern. This appears intentional (TurtleHead handles P2 combat) but is not documented.
- **`flipped` flag:** Set to `true` on phase transition. Read by renderer. Never reset.
- **SFX:** No `sfx` field in `SHELL_DATA`. **Silent damage.**

#### TurtleHead (`Θ`)
- **Status:** Full implementation.
- **Phases:** P1 uses extend/retract from BossSystem. P2 orbits and fires burst projectile walls.
- **`shellRef`:** Set by BossSystem post-construction. `takeDamage` returns `false` if `shellRef` is null — safe. If BossSystem fails to set it, head is effectively invulnerable.
- **HP proxy:** TurtleHead HP = 1 (stub). All damage routes to `shellRef.takeDamage(amount, 'head')`. Correct.
- **`headState` in P1:** Only set by `extendHead()`/`retractHead()` which are called by BossSystem. `_updatePhase1` only ticks `flashTimer` when extended. If BossSystem doesn't call `extendHead`, the head stays `retracted` forever. Clean contract.
- **`gapAngle`:** Set in constructor and `transitionToPhase(2)` but **never read in this file**. Likely consumed by the renderer for the "safe gap" in the orbit wall pattern — needs renderer cross-reference.
- **`preFireFlashTimer`:** Set to `HEAD_FLASH_FREQ * 4 = 0.4s` before burst starts. Not read in this file — consumed by renderer.
- **SFX:** No `sfx` field in `HEAD_DATA`. **Silent damage.**

#### TurtleLeg (`/`, `\`)
- **Status:** Minimal scaffold — no AI.
- **Purpose:** Visual-only hitbox panel (4 legs) that routes damage to TurtleShell HP via `shellRef.takeDamage(amount, 'head')`. Note it passes `'head'` as the source string even though it's a leg — this means leg hits count as "head" hits and bypass TurtleShell's P1 body-immunity. **Design question: should legs be damageable in P1?** Currently they are (unintentionally).
- **`update()`:** Ticks iframes and DOT timers only. No movement or AI.
- **SFX:** No `sfx` field. **Silent damage.**

#### GooBlob
- **Status:** Complete standalone entity — not an Enemy subclass.
- **Purpose:** Environmental/boss-spawned slowing hazard.
- **No PlaneSystem awareness:** `isNearEntity` checks purely by distance with no plane filter. A GooBlob could theoretically slow an enemy on a different plane (tunnel vs. surface). In practice BossSystem likely only spawns blobs on the surface, but this is fragile.
- **Wall bouncing:** Uses `GRID.WIDTH/HEIGHT` constants directly — doesn't respect interior room boundaries (hut/dungeon). Boss fight rooms are full-size so this is acceptable.

---

### PlaneSystem Violations

No direct `.plane === 0` or `.plane === 1` comparisons found in any enemy entity file. Enemy.js correctly imports and uses `inSamePlane`, `planeOf`, and `objectOnPlane` from PlaneSystem at lines 3, 764, 869, 1069, 1194, 2556, 2558, 2609, 2662. **No PlaneSystem violations in enemy entities.**

One fragility: `hasVision` calls `planeOf(this)` inside a per-sample loop (line 2662) — `planeOf` is presumably a cheap lookup, but calling it once before the loop would be cleaner.

---

### Anti-Patterns Found

1. **Dual initialization for `kiter` and `jumper`** (constructor lines 199-214 and 259-277): legacy `packBehavior`/`jumpBehavior` blocks and new-style `movementStyle` blocks initialize the same state fields. If both paths fire (which they can if `packBehavior.enabled` is true AND `movementStyle = 'kiter'`), the second block overwrites the first with identical values. Redundant but harmless. Future additions should use only the new-style block.

2. **`let tx, ty` inside conditional block, read outside** (GooHead `_updateAttached`, line ~164-213): As described in the GooHead analysis — `tx`/`ty` declared with `let` inside `if (!this.isGrabbing)`, then read in the orbit code via `if (tx === undefined)` outside that block. `let` does not hoist to block scope boundary, so when `isGrabbing` is true, `tx` is a ReferenceError on access. The code appears to work because the grab-hold block (which runs when `isGrabbing` is true) zeroes velocity before the orbit code can apply its target. This is a fragile accident.

3. **Dead constant `ENRAGED_THRESHOLD` in LakeBoss** (line 4): Declared, never used.

4. **Dead method `_fireCone()` in TurtleShell** (line 239): Method is fully implemented but never called. The boss fires a continuous stream instead of a cone burst at the end of the charge sequence.

5. **`attack()` method at line 2754**: Returns raw damage int and resets state but doesn't go through `getEffectiveDamage()`. Likely dead code — all callers use `createAttack()`. Should be removed to avoid confusion.

6. **Dead comments in `createMagicAttack` and `createFireBreath`**: "Reckless misdirection (applied to all missiles)" appears before empty space where code presumably was removed. Misleading.

7. **`_isOnWater` comment mismatch** (line 2714): The jsdoc above this method reads "Returns true if the target (player) is currently overlapping a tall grass tile" — this describes `isTargetInTallGrass()`, not `_isOnWater()`. The comment was not updated when the method was renamed.

---

### Bugs & Logic Errors

**B1 — Operator precedence in `updateVectorNavigation` (line 2212):**
```js
if (distance < this.navigationLength * 0.5 && !this.stuckTimer > 0.3) {
```
`!this.stuckTimer` evaluates first (boolean negation of a number — truthy for 0, falsy for any positive value), then `> 0.3` compares a boolean to 0.3. This condition is always `false` (boolean `> 0.3` is never true). The intended condition was `!(this.stuckTimer > 0.3)` or `this.stuckTimer <= 0.3`. The "target is very close — head directly" branch fires inconsistently when stuck: it was supposed to be bypassed when stuck, but the guard is broken so it always fires when `distance < navigationLength * 0.5`. Low-impact since the fallback is "head directly toward nearby target" which is usually correct, but wastes the guard's intent.

**B2 — Ice stream fires 4 shots instead of 5 (LakeBoss `_fireIceStream`, line 256):**
`const order = [0, 1, 2, 3]` has 4 elements but `ICE_STREAM_SHOTS = 5`. The iteration covers indices 0–3 only. The 5th cone position (t = 1.0, rightmost spread) is never fired. Boss fires a truncated ice cone.

**B3 — `createFireBreath()` missing `onHit: 'burn'` (Enemy.js, line 3129):**
The `fire` attack type creates a 5-projectile cone but does NOT include `onHit: 'burn'` on any projectile. `createMiniFireBreath()` (the lava-tortoise version) correctly includes it. Fire-type enemies (e.g., any enemy with `attackType: 'fire'`) deal raw damage but do not apply the burn DOT. The attack type is named `fire`, players expect it to burn.

**B4 — `player.applyStatusEffect('goo', ...)` in `GooHead._startGrab()` (line 294):**
`'goo'` is not defined in the player's status effect map. This silently no-ops if `Player.applyStatusEffect` guards with an existence check, or it throws if it doesn't. Cross-reference to Player.js needed to confirm severity. The intent (immobilize grabbed player) may be achieved by other means (`player.grabbed = true`).

**B5 — TurtleLeg routes damage as `'head'` source (TurtleLeg.js, line 64):**
`this.shellRef.takeDamage(amount, 'head')` makes leg hits bypass TurtleShell P1 body immunity. Legs are probably not intended to be damageable in P1 (the whole point is the player must hit the head), but this makes them damageable without triggering any visual feedback that the right target was hit.

**B6 — `memoryMarkSuspected` not cleared on packmate reset:**
Both memory-expiry loops iterate packmates and clear `aggroMemoryActive`, `lastKnownPosition`, and related fields but skip `memoryMarkSuspected`. A packmate that had `memoryMarkSuspected: true` retains that stale flag and will display a gray `?` on next detection instead of yellow.

**B7 — GooBlob has no plane awareness in `isNearEntity`:**
Distance-only check. Could slow entities on a different plane in theory.

---

### Suboptimal / Performance Issues

**P1 — `hasVision` is O(n × m) per call** (line 2639):
For each sample along the ray (n ≈ distance / (CELL_SIZE/2)), it iterates all background objects (m). With 30+ background objects in a room and vision range of 8 cells, this is ~16 samples × m objects per `hasVision` call. Called multiple times per enemy per frame (aggro check, attack check, memory check). Could be mitigated by spatial bucketing (grid-aligned lookup by cell) instead of linear scan.

**P2 — `_clampToWater` linear scan (LakeBoss, line 380):**
Called every frame. Iterates all water tiles to find nearest. A pre-sorted or spatially bucketed tile list would avoid re-scanning.

**P3 — `computeNodePath` inner loop up to 180 iterations per node** (line 2393):
Maximum 8 nodes × 180 degree search = 1,440 `hasLineOfSight` calls per node path computation. Each `hasLineOfSight` is a DDA traversal (up to 128 steps). Worst case ~184,320 operations. Only fires when stuck, so not per-frame, but could cause frame spikes in dense maps.

**P4 — `planeOf(this)` called inside `hasVision` sample loop** (line 2662):
Should be hoisted before the loop since `this.plane` doesn't change mid-call.

**P5 — `packmates` array iterated 3–4 times per frame per enemy in pack**:
Detection sharing, memory-mark sharing, expiry cleanup all loop over `packmates` separately. Could be unified into a single pass.

---

### Cross-Reference Notes

- **`GooDragon.sfx`** is defined in `BOSS_DATA` and used correctly via `takeDamage → this.data.sfx.hit`. GooDragon is the only boss with SFX data. GooHead, TurtleShell, TurtleHead, TurtleLeg, and LakeBoss all lack `sfx` fields — damage is silent for these bosses.
- **`GooHead.invulnerable`** field (line 83) is set to `false` in constructor but never set to `true` in the file. The comment says "set true when detached" — but `detach()` does not set it. If this was intended to gate damage on detached heads, the gate is absent.
- **Hammer shatter path:** `CombatSystem` checks `isFrozen()` (which checks `statusEffects.freeze.frozen`) for hammer shattering. `Enemy.isFrozen()` correctly requires BOTH `active` AND `frozen` sub-flag. CombatSystem sets `frozen = true` explicitly when applying freeze — the full chain works correctly.
- **`TurtleShell.transitionToPhase()`** re-launches with P2 speed if the shell was stopped mid-charge (zero velocity check). The magnitude calculation (`Math.sqrt(vx**2 + vy**2) || 1`) — if both components are exactly zero, the division by 1 produces zeros, then the conditional fires and assigns P2 speed. Correct.
- **`GooDragon` float position** (line 149-150) uses Lissajous-like motion: `cos(t)` on X, `sin(0.7t)` on Y. This gives the dragon a non-repeating figure-eight pattern. Correct and intentional.
- **`GooHead.cornerUpdateTimer`** initial value is `Math.random() * 2.0` (line 65) — staggers the left and right heads so their orbit corners don't update simultaneously. Good.
- **Sleep and charm status effects have no tick behavior** beyond duration countdown in `updateStatusEffects`. The behavioral effect (AI override for sleep, target-swap for charm) is implemented outside Enemy.js — sleep in `update()` (early return), charm in `CombatSystem` per-frame override. This split is flagged in CLAUDE.md as an architectural compromise. The status effect map serves as the shared flag between these two sites.
