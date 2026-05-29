# CORE ENTITIES REVIEW — Player.js, Item.js

**Reviewed:** 2026-05-15  
**Files:** `src/entities/Player.js` (1027 lines), `src/entities/Item.js` (1308 lines)

---

## Player.js — Method Catalog

| Method | Line | Purpose | Parameters | Returns | Issues |
|--------|------|---------|-----------|---------|--------|
| `constructor(x, y)` | 18 | Initialize all player state | pixel coords | — | See State Initialization Audit below |
| `get heldItem()` | 230 | Accessor for active quick slot | — | `Item\|null` | None |
| `setCollisionMap(collisionMap)` | 234 | Inject collision map reference | collisionMap | — | None |
| `updateInput(inputState, lockFacing)` | 238 | Apply movement input, compute acceleration/velocity | inputState obj, bool | — | `speedBoostTimer` not factored into bat-form max speed correctly (see Bugs); also re-implements max-speed logic that duplicates `startDodgeRoll` — three copies total |
| `getHitbox()` | 347 | 4×4 centered hitbox | — | `{x,y,width,height}` | Hitbox is 4×4 px fixed — extremely small vs CELL_SIZE=16. No null checks. Fine intentionally for tight gap design |
| `getGridPosition()` | 357 | Convert pixel pos to grid coords | — | `{x,y}` | No clamping — can return negative or out-of-bounds grid coords if player is at position <0 |
| `isWet()` | 364 | Check wet status | — | bool | None |
| `applyWet(duration)` | 365 | Apply wet (max-extend) | duration | — | None |
| `isBurning()` | 367 | Check burn status | — | bool | None |
| `applyBurn(duration)` | 368 | Apply burn (max-extend) | duration | — | `burnTickTimer` is NOT reset when a new burn is applied on top of an existing burn. If the existing burn tick fires in the same frame and resets `burnTickTimer = burnTickRate`, then a short `applyBurn` can double-tick at the boundary |
| `applySpeedBoost(duration)` | 370 | Apply speed boost buff | duration | — | None |
| `applyStoneSkin(duration, bonus)` | 371 | Apply stone skin buff | duration, bonus | — | None |
| `applyDamageBuff(duration, bonus)` | 375 | Apply damage buff | duration, bonus | — | None |
| `applyRegen(duration, amount, interval)` | 379 | Apply regeneration | duration, amount, interval | — | Resets `regenTickTimer` to 0 — can cause early tick if `applyRegen` is called mid-interval |
| `applyBlockBoost(duration, amount)` | 385 | Apply block boost | duration, amount | — | None |
| `tryShieldBlock(isBullet)` | 392 | Consume one shield charge | bool | bool | None |
| `applyStatusEffect(effect, duration)` | 402 | Apply goo/freeze/slimeBoost | string, seconds | — | **Only 3 status effects registered** — `burn`, `stun`, `poison`, `polymorph` are not in `statusEffects` dict. Callers that naively pass `'burn'` or `'stun'` silently no-op. Known bug #37/#38 were exactly this. Any future system adding a new effect must know to use `applyBurn()` / `player.poisonImmune` / dedicated fields instead of `applyStatusEffect()` — this is an undocumented trap |
| `updateStatusEffects(deltaTime)` | 412 | Tick goo/freeze/slimeBoost | deltaTime | — | None |
| `isGooey()` | 444 | Check goo status | — | bool | None |
| `isFrozen()` | 448 | Check freeze status | — | bool | None |
| `getStatusSpeedMultiplier()` | 452 | Returns combined speed mod | — | number | **Non-additive priority ladder**: goo wins over freeze, slimeBoost is unreachable while frozen or gooey. If player is simultaneously gooey and slimeBoost (edge case), boost is silently discarded rather than partially applied. Priority order is correct in practice but the logic is fragile — not a chain |
| `getDisplayColor()` | 459 | Color for renderer | — | string | Uses `this.inLiquid` (line 475) which is NOT initialized in the constructor and NOT reset in `reset()`. It is set per-frame by `main.js`. If the Player is ever rendered before the first physics tick, `this.inLiquid` is `undefined` and the check silently evaluates falsy (safe by JS coercion but dirty) |
| `update(deltaTime)` | 479 | Per-frame tick for timers | deltaTime | `{burnDamage}|null` | Returns burn damage payload — caller (`main.js`) applies the actual `takeDamage`. This is an unusual return-value side-effect pattern; callers must not forget to act on it |
| `startDodgeRoll(direction, enemies)` | 565 | Initiate a dodge roll | direction `{x,y}`, enemies array | bool | **Does not guard zero-direction**: if `{x:0,y:0}` is passed (Rusalka/polymorph path guards exist in `main.js` but not here), the roll activates with zero velocity — player freezes for roll duration. Also `getRollSpeed()` duplicates the speed calculation from this method (three-way duplication). |
| `updateDodgeRoll(deltaTime)` | 651 | Advance roll timer/velocity | deltaTime | — | `hidden` flag set for 'hide' roll type (line 689) is never initialized in constructor or reset. Also slope/ice lock zeroes velocity but does not restore it on `slopeLocked` → `active=false` transition, so the player can exit the roll with zero velocity on ice |
| `takeDamage(amount, damageSource)` | 708 | Apply damage with resist/dodge/immunity checks | amount, damageSource obj | bool\|`{damaged,reflect,...}`\|`{dodged}`\|`{blocked}`\|`{immune}` | **Complex return shape with 5 variants** — callers must destructure correctly. `damageSource.isMelee` is the caller's responsibility to set; no default means melee resist silently applies 0 absorb if the caller omits the flag. `damageSource.element === 'burn'` is checked but `burnAbsorb` and `meleeAbsorb` are applied in the same `Math.max(1, ...)` expression — total absorb can exceed damage and floor to 1, which is fine, but both can stack against each other unexpectedly |
| `isInvulnerable()` | 793 | Check iframe state | — | bool | None |
| `canAttack()` | 797 | Check if attacks are allowed | — | bool | Returns `false` during `attackBlockTimer > 0` (cyan rogue extended iframes). Does not check `polymorphed` — frogged player's tongue attack is gated separately in `main.js` |
| `getRollSpeed()` | 804 | Compute roll speed | — | number | Third copy of the speed calculation logic (see `updateInput`, `startDodgeRoll`). Drift risk between the three |
| `getVisibilityAlpha()` | 812 | Alpha during iframes | — | number | None |
| `shouldRenderVisible()` | 820 | Always true (compat stub) | — | bool | Vestigial — always returns `true`. `getVisibilityAlpha()` is the actual signal. Can be removed |
| `heal(amount)` | 825 | Add HP, clamp to maxHp | amount | — | None |
| `addIngredient(ingredient)` | 830 | Push to inventory | ingredient str or obj | — | None |
| `removeIngredient(ingredient)` | 834 | Remove first match | ingredient char str | — | None |
| `pickupItem(item)` | 841 | Insert item into slots or swap | item | dropped item\|null | Logic prefers non-destroyed slots; handles destroyed-slot edge cases. Fine |
| `dropItem()` | 864 | Remove item from active slot | — | item | None |
| `useHeldItem()` | 879 | Call item.use() and consume if needed | — | use result | None |
| `cycleSlotNext()` | 900 | Rotate forward through non-destroyed slots | — | — | Calls `_cancelHeldItemActivity()` on slot change — correct |
| `cycleSlotPrevious()` | 914 | Rotate backward | — | — | Same as above |
| `_cancelHeldItemActivity()` | 928 | Cancel charge/windup on slot switch | — | — | Optional chain on `cancelChargeAndReload` — fine |
| `canUseTrap()` | 932 | Check if active slot is a trap with charges | — | bool | None |
| `markTrapUsed()` | 939 | Decrement trap charge, auto-advance slot | — | — | None |
| `resetTrapsForNewRoom()` | 954 | Restore trap charges on room entry | — | — | None |
| `reset()` | 963 | Death reset | — | — | **Major gaps** — see State Initialization Audit |
| `static getDodgeRollDirection(arrowKeys)` | 1011 | Compute normalized direction from arrow keys | `{ArrowUp,...}` | `{x,y}` | Returns `{x:0,y:0}` when no keys held — callers must guard this. Non-green path does; green path does too. But `startDodgeRoll` itself does not guard |

---

## Player.js — State Initialization Audit

Fields set in constructor that are **missing from `reset()`**:

| Field | Constructor value | In reset()? | Risk |
|-------|-----------------|-------------|------|
| `shieldCharges` | 0 | No | Shield charges from previous run persist through death |
| `shieldMaxCharges` | 0 | No | Same |
| `shieldCooldown` | 0 | No | Same |
| `shieldBlocksAll` | false | No | If a Tower Shield was equipped, this stays true after death until armor is re-applied |
| `invulnerabilityTimer` | 0 | No | Could carry over iframes across death (unlikely but possible in edge cases) |
| `attackBlockTimer` | 0 | No | Same as above |
| `statusEffects` (goo/freeze/slimeBoost) | all inactive | No | Active status effects persist through death |
| `burnDuration` | 0 | No | Player can enter REST still burning |
| `burnTickTimer` | 0 | No | Same |
| `wetDuration` | 0 | No | Wetness persists |
| `emberStacks` | 0 | No | Ember accumulation persists |
| `emberStackTimer` | 0 | No | Same |
| `waterImmunityTimer` | 0 | No | Timer persists |
| `floatTimer` | 0 | No | Float persists |
| `speedBoostTimer` | 0 | No | Speed buff persists |
| `batFormTimer` | 0 | No | Bat form could persist; would skip `char = '@'` restore |
| `blockBoostTimer` | 0 | No | Block boost persists |
| `blockBoostAmount` | 0 | No | Same |
| `regenTickTimer` | 0 | Yes — partially (regenTimer and regenTickTimer reset, but `regenAmount` and `regenInterval` are not reset) | regenAmount/regenInterval keep old consumable values |
| `activeSappingBats` | [] | No | Sapping bat references survive death — likely stale object refs |
| `grabbed` | false | No | Grabbed state persists |
| `grabbedBy` | null | No | Stale reference to dead GooHead |
| `steamTrailTimer` | 0 | No | Cosmetic only, low risk |
| `footstepTimer` | 0 | No | Cosmetic |
| `footstepSide` | 0 | No | Cosmetic |
| `actionCooldown` | 0 | No | Green ranger cooldown persists |
| `actionCooldownMax` | 0 | No | Same |
| `rollCharge` | 0 | No | Green ranger energy persists |
| `continuousRollActive` | false | No | Could enter next run in roll state |
| `pendingBlink` | null | No | Yellow mage blink could fire at run start |
| `greenIdleDamageBonus` | 0 | No | Character-specific bonus persists |
| `greenCombatDamagePenalty` | 0 | No | Same |
| `backstabMultiplier` | 1.0 | No | Cyan rogue multiplier persists (harmless default) |
| `_lastAttacker` | null | No | Stale entity reference |
| `characterType` | 'default' | No | Character type survives death (may be intentional for character persistence) |
| `maxHp` | from config | No | If any system modifies maxHp, it persists |
| `godMode` | false | No | God mode from cheat menu persists (acceptable) |
| `isStaffBlocking` | false | No | Staff blocking state persists |
| `staffSwingHasFired` | false | No | Same |
| `isOnSlope` / `isOnIce` | false | No | PhysicsSystem sets these each frame — low risk |
| `inLiquid` | undefined | No | Not initialized anywhere! Set per-frame by main.js |
| `plane` | 0 | No | Player could enter REST on plane 1 |
| `inHut` / `hutExitPosition` | false/null | No | Interior state could persist |
| `inMaze` / `mazeExitPosition` | false/null | No | Same |
| `slimeImmune` | false | No | Armor effect; re-applied by InventorySystem on equip events, but not on death reset |
| `meleeResist` | 0 | No | Same |
| `burnResist` | 0 | No | Same |
| `massBonus` | 0 | No | Same; `mass` itself is not reset |
| `rollCooldownMult` | 1.0 | No | Same |
| `extraIframes` | 0 | No | Same |
| `dodgeRoll.*` timers | 0/false | No | Cooldown timer survives death |

**Critical subset**: `statusEffects`, `burnDuration`, `shieldCharges`, `activeSappingBats`, `grabbed`, `grabedBy`, `continuousRollActive`, `pendingBlink`, `plane`, `inHut`, `inMaze`. The armor-derived fields (`slimeImmune`, `meleeResist`, etc.) are re-applied by `InventorySystem.applyEquipmentEffectsToPlayer()` on equip events — if no re-equip happens after death, they linger at their old values but the item is gone from the slot.

**Note**: `main.js` likely performs additional resets at the game-over boundary (e.g., `enterRestState`, `enterExploreState`). The incompleteness of `Player.reset()` is therefore partially mitigated. But `Player.reset()` is a public API and should be self-sufficient.

---

## Player.js — Status Effect Coverage

| Effect | Tracked via | Immunity field | Reset on death | Visual feedback |
|--------|-------------|---------------|---------------|----------------|
| Goo | `statusEffects.goo` | `slimeImmune` (gates `applyStatusEffect`) | No | Green blink (getDisplayColor) |
| Freeze | `statusEffects.freeze` | `freezeImmune` (only checked in `takeDamage`, NOT in `applyStatusEffect`) | No | None — freeze has no visual in getDisplayColor |
| SlimeBoost | `statusEffects.slimeBoost` | — | No | None |
| Burn | `burnDuration` + `burnTickTimer` | `fireImmune` (checked in `takeDamage`; also in `main.js` ember path) | No | None in Player — particles in main.js |
| Wet | `wetDuration` | — | No | Blue tint via `inLiquid` (per-frame, not `wetDuration`) |
| Stun | Not in statusEffects — handled in Enemy.js enemy-side only | N/A | N/A | N/A |
| Polymorph | `polymorphed`, `polymorphCursed`, `polymorphCured` | — | Yes | Char change |
| Poison | Not tracked on Player — `poisonImmune` exists for `takeDamage` but no poison DoT | `poisonImmune` | — | None |
| Sap | `activeSappingBats[]` | — | No | White blink |
| Grab | `grabbed`, `grabbedBy` | — | No | Movement lock |

**Gaps:**
- `freezeImmune` is checked in `takeDamage` for elemental damage but NOT checked in `applyStatusEffect('freeze')` — a freeze DoT that calls `applyStatusEffect` directly will still apply even with freeze armor.
- Player `freeze` has no visual color in `getDisplayColor` — frozen player looks identical to normal.
- Poison has defensive field (`poisonImmune`) but no player DoT state — any system wanting to poison the player has no canonical path.
- Burn has no visual in `getDisplayColor` (only particles in main.js).

---

## Item.js — Method Catalog

| Method | Line | Purpose | Parameters | Returns | Issues |
|--------|------|---------|-----------|---------|--------|
| `_readEquippedOilEffect(player)` | 29 | Module-level fn: aggregate oil augment effects | player carrier | `{onHit, arrowSpeedMult}` | Returns safe defaults on null player. Fine |
| `constructor(char, x, y)` | 44 | Initialize item state | char, pixel coords | — | `_reloading`, `_reloadTicksPlayed`, `_reloadTicksPending` are lazy-initialized (set on first use, not in constructor). Accessing them before first reload returns `undefined`. Safe with `||0` defaults in `consumeReloadTicks` but fragile |
| `getHitbox()` | 97 | Full cell hitbox | — | `{x,y,width,height}` | Uses full `CELL_SIZE` box even for items on the ground — not the tight hitbox player uses. Minor |
| `update(deltaTime)` | 106 | Tick cooldowns, charging, windup | deltaTime | attack object or null | Complex: manages reload phase state machine, gem-wand charge, charge-hammer, bow charge, melee windup all in one method. Correct but dense |
| `canUse()` | 192 | Check if weapon is ready | — | bool | Does not check windup phase on guns (`windupActive` only checked via `cooldownTimer <= 0 && !this.windupActive`) — guns with a windup would be blocked correctly. Fine |
| `use(player)` | 206 | Attempt weapon use | player carrier | attack or null | `UTILITY` type returns null without consuming uses — correct. Charge-hammer, gem-wand, bow all return null while charging |
| `releaseBow()` | 271 | Fire charged bow/charge-gun | — | attack or null | **Missing null guard on `this.chargingPlayer`** — handled by early return (line 279) but only after checking `isBow || isChargeGun`. Safe |
| `releaseChargeHammer()` | 313 | Cancel Crystal Maul charge | — | — | None |
| `fireChargeHammerAttack()` | 322 | Fire Crystal Maul mega-attack | — | attacks or null | Calls `createMeleeShockwave` but injects `weaponSubtype` via spread — does NOT inject `isBlade`, `isBlunt`, `canSmash`, `electric`, `isPickaxe`, `cyclesExitLetter`. The hammer's `canSmash` flag is lost on the mega-attack |
| `executeAttack(player, chargeRatio)` | 339 | Route to weapon type | player, chargeRatio | attack | None |
| `createBullets(player, chargeRatio)` | 355 | Standard/special gun bullets | player, chargeRatio | bullet array | See pattern comparison notes below |
| `createBurstPattern(player)` | 441 | 3-bullet burst (gun) | player | bullet array | Missing fields vs standard: `homing`, `ricochet`, `maxRicochets`, `pierce`, `split`, `splitCount`, `knockback`, `lifesteal`, `chain`, `chainCount`, `explode`, `explodeRadius`, `attackId`. Any gun with `attackPattern: 'burst'` silently loses all these capabilities |
| `createRingPattern(player)` | 481 | 8-bullet ring (gun) | player | bullet array | Same missing fields as burst. Also missing `weaponChar`, `drawAngle` |
| `createSpiralPattern(player)` | 520 | N-bullet spiral (gun) | player | bullet array | Same missing fields. Also missing `weaponChar` |
| `createWavePattern(player)` | 560 | N-bullet wave (gun) | player | bullet array | Same missing fields. Also missing `weaponChar` |
| `createMeleeAttack(player)` | 600 | Route melee to pattern | player | attack(s) | `'axe'` attackPattern (used by the Pickaxe item, line 628 in items.js) falls through to `default` case. This is incorrect: `'axe'` is not a registered case in the switch |
| `createMeleeRing(player)` | 668 | Flail ring sweep | player | attack array | Missing `lifesteal`, `chain`, `explode`, `explodeRadius` |
| `createMeleeArc(player)` | 707 | Sword arc (3-hit) | player | attack array | None |
| `createMeleeSweep(player)` | 749 | Axe sweep (5-hit) | player | attack array | Missing `lifesteal`, `chain`, `explode`, `explodeRadius` |
| `createMeleeShockwave(player)` | 786 | Hammer shockwave rings | player | attack array | Uses `player.position.x` for origin (top-left corner), then adds `GRID.CELL_SIZE/2` for visual origin `cx/cy` — but attack positions use raw `player.position.x + relX`. Shockwave visual (triggerShockwave) origin is centered but the damage ring positions are not — 8 ring positions start from top-left corner of player cell, not center |
| `createMeleeThrust(player)` | 835 | Spear thrust (3-hit linear) | player | attack array | Missing `lifesteal`, `chain`, `explode`, `explodeRadius` |
| `createMeleeMultistab(player)` | 870 | Dagger multistab (3-hit) | player | attack array | See Dagger section below. Oil onHit override is applied correctly to all 3 stabs |
| `createMeleeWhipcrack(player)` | 910 | Whip crack (5-hit linear) | player | attack array | Missing `lifesteal`, `chain`, `explode`, `explodeRadius` |
| `createMeleeSlam(player)` | 946 | Heavy blade slam (1-hit) | player | single attack object | **Returns single object, not array.** All other melee patterns return arrays. `createMeleeAttack → injectSubtype` handles this correctly via `Array.isArray()`. `addAttack` in CombatSystem also normalizes — but callers that assume array will fail. Also missing `owner` plane (`shooterPlane`) |
| `createArrow(player, chargeRatio)` | 972 | Route bow to single/burst | player, chargeRatio | arrow array | Burst bow fires 3 arrows and deducts 3 uses from `usesRemaining`. Correct behavior for arrow expenditure, but any bow with `maxUses` (like the Short Bow) firing burst mode will deplete 3x faster than the player expects |
| `createSingleArrow(player, angle, speedMultiplier)` | 1007 | Build one arrow object | player, angle, speed | arrow object | Missing `gravity` flag (CombatSystem adds it lazily on first frame via `initialSpeed` — OK but implicit). Missing `knockback` field (bullets have it; arrows don't). Arrow `ricochet` not included either |
| `getMeleeDrawAngle(char, attackAngle)` | 1056 | Angle offset for rendering | char, angle | number or null | Returns `null` for unknown chars — renderer must handle null |
| `getArrowCharForAngle(angle)` | 1081 | 8-direction arrow char | angle | char string | None |
| `createWandAttack(player)` | 1101 | Route wand subtype | player | attack or null | `'`` ` (Infusion Wand) has a `// TODO: Implement in Phase 6` comment — returns null. Left incomplete |
| `createChaosWandAttack(player)` | 1143 | Chaos Wand proximity AOE | player | chaos_wand attack | Relies on CombatSystem proximity check. Data fields `damageMin` and `proximityRequired` may be undefined if item data doesn't set them — no defaults provided |
| `createBlindWandAttack(player)` | 1163 | Blind Wand AOE blind | player | blind_wand attack | Same — `effectRadius`, `effectDuration`, `proximityRequired` have no fallback defaults |
| `createGemWandAttack(player)` | 1181 | Gem wand cast placeholder | player | gem_wand_cast attack | Comment says "Phase 1 placeholder" — real spell effects (fire AOE, blizzard, etc.) described as "Phase 2". Phase 2 appears not yet delivered |
| `createTransmutationWandAttack(player)` | 1202 | Polymorph bolt | player | transmutation_bolt | `this.data.projectileSpeed` used but field may not exist on item data (no fallback in items.js for this wand) — defaults to 180 inline |
| `releaseGemWand()` | 1230 | Fire gem wand on charge complete | — | attack or null | None |
| `cancelGemWandCharge()` | 1253 | Cancel gem wand charge | — | bool | None |
| `cancelChargeAndReload()` | 1264 | Cancel charge/windup/reload on slot switch | — | — | None |
| `consumeReloadTicks()` | 1286 | Drain pending audio reload ticks | — | number | None |
| `resetUses()` | 1293 | Restore bow/wand uses on room entry | — | — | Uses `cooldownTimer > 1000` heuristic to detect infinite-cooldown state. Magic number — fragile but works with the `9999` sentinel value used in `createArrow` |

---

## Item.js — Attack Pattern Coverage Matrix

| Pattern name | Implemented in switch? | Consistent return shape? | Notes |
|-------------|----------------------|------------------------|-------|
| `arc` | Yes | Array | Includes `drawScale`, `lifesteal` |
| `sweep` | Yes | Array | Missing `lifesteal`, `chain`, `explode` |
| `shockwave` | Yes | Array | Visual origin vs. damage origin mismatch (see above) |
| `thrust` | Yes | Array | Missing `lifesteal`, `chain`, `explode` |
| `multistab` | Yes | Array | Oil onHit injected correctly |
| `whipcrack` | Yes | Array | Missing `lifesteal`, `chain`, `explode` |
| `ring` (melee) | Yes | Array | Missing `lifesteal`, `chain`, `explode` |
| `slam` | Yes | **Single object** | Only pattern to return non-array; missing `shooterPlane` |
| `burst` (gun) | Yes (routed before switch) | Array | Missing 11 bullet fields vs standard path |
| `ring` (gun) | Yes (routed before switch) | Array | Missing 11 fields; also missing `weaponChar`, `drawAngle` |
| `spiral` (gun) | Yes (routed before switch) | Array | Missing 11 fields; also missing `weaponChar` |
| `wave` (gun) | Yes (routed before switch) | Array | Missing 11 fields; also missing `weaponChar` |
| `axe` | **No** — falls to `default` | default single-hit | `attackPattern: 'axe'` used by the Pickaxe item in items.js; no case in switch |
| `default` | Yes | Single object | Fallback; reasonable defaults |

---

## Weapon Subtype Behavior Verification

### Staff (`weaponSubtype: 'staff'`)

State machine: `staffSwingHasFired` → hold SPACE → `isStaffBlocking = true` → `_releaseStaffBlock` on release → `_spawnStaffBlockSweepVisual`

**Implemented:** Yes, in `main.js` (`_isBlockingStaff`, `_releaseStaffBlock`, `_spawnStaffBlockSweepVisual`, lines ~1091–1150). Half-speed while blocking is in `PhysicsSystem.js:281`. Projectile deflection in `CombatSystem.js:939,1086`. Block release sweep in `CombatSystem.js`.

**Issues:**
- `isStaffBlocking` and `staffSwingHasFired` live on Player but are not initialized by `reset()` — a death mid-block stance will carry the blocking flag into the next run.
- `blockReleaseDamage` referenced in CLAUDE.md as `data.blockReleaseDamage || 0` — this field must be in the staff item definition; not validated here but confirm it's set.
- The staff blocking logic sits entirely in `main.js` (not in a system file) — violates the orchestration rules listed in CLAUDE.md. Flagged as "input handler logic that belongs in respective system."

### Dagger (`weaponSubtype: 'dagger'`)

Oil augment: `_readEquippedOilEffect(player)` in `createMeleeMultistab` at line 879–880. The `onHit` override is applied to all 3 stabs via `oilOnHit || this.data.onHit`.

**Implemented:** Yes. Oil speed multiplier (`arrowSpeedMult`) is read but not used in melee — correct, it only applies to arrows.

**Issues:**
- `_readEquippedOilEffect` reads `player?.equippedConsumables`. The `equippedConsumables` array lives on `InventorySystem` and is mirrored to `player.equippedConsumables` via `applyEquipmentEffectsToPlayer`. If a carrier object (e.g., a CampNPC) calls `createMeleeAttack`, it has no `equippedConsumables` — `_readEquippedOilEffect` returns `{onHit: null}` safely. Fine.
- If the dagger's base `onHit` is set AND an oil augment is equipped, the oil wins (correct by design). If both are null, all stabs have no `onHit`. Fine.

### Hammer (`weaponSubtype: 'hammer'`)

Shatter frozen: CombatSystem at lines 777 and 839: `if (isFrozen && attack.weaponSubtype === 'hammer')` — 2.5x damage, visual indicator.

**Implemented:** Yes.

**Issues:**
- `isFrozen` in CombatSystem checks `enemy.statusEffects.freeze.frozen` (enemy-side frozen flag). This is set at "fully frozen" (second ice hit), not just any freeze duration. A hammer hit on an enemy with `freeze.active = true` but `freeze.frozen = false` (first hit only) does NOT get the bonus — the condition is correct per design intent but the distinction is non-obvious.
- Crystal Maul `fireChargeHammerAttack()` (line 322) calls `createMeleeShockwave` directly and injects only `weaponSubtype`. The `canSmash` flag — which allows destroying rocks/objects — is lost on the mega-attack shockwave. Hammer's canSmash behavior would not apply to the charged attack.

### Wand (`weaponSubtype: 'wand'`)

**Implemented:** Partially. Gem wands (`data.gemWand: true`) have a hold-to-charge lifecycle via MagicSystem. `createGemWandAttack` is labeled a "Phase 1 placeholder" and returns a `gem_wand_cast` tagged object. MagicSystem intercepts this, deducts mana, and emits text. The actual spell effects (fire AOE, blizzard, chain stun, blind cone, grass circle, charm AOE) are described as "Phase 2" and appear absent.

The non-gem wands (`\`, `}`, `>`, `` ` ``) each have their own `createXxxWandAttack` implementations. The Infusion Wand (`` ` ``) is explicitly stubbed with a TODO.

**Issues:**
- `createGemWandAttack` is described as a placeholder — confirm whether Phase 2 is complete or intentionally deferred.
- The Infusion Wand TODO at line 1134 is a real functional gap (P2).

---

## Bugs & Logic Errors

1. **`freeze` immunity not checked in `applyStatusEffect`** (Player.js:402–410): `freezeImmune` is only consulted in `takeDamage` (for elemental damage). `applyStatusEffect('freeze', ...)` is the direct path for environmental freeze (ice puddles, cold zones). A player with freeze-immune armor can still be frozen by environment sources. The `goo` case has a matching guard; freeze does not.

2. **`attackPattern: 'axe'` has no case in `createMeleeAttack` switch** (Item.js:620–666): The Pickaxe item in `items.js` uses `attackPattern: 'axe'` (line 628). This hits the `default` branch, producing a single center-point hit rather than the axe sweep. The Pickaxe should be using `'sweep'` or have its own case — or `items.js` should be corrected to `attackPattern: 'sweep'` (the subtype default for `axe` in `SUBTYPE_DEFAULTS` is `'sweep'`, but `pickaxe` overrides it with `'axe'`).

3. **`createMeleeSlam` missing `shooterPlane`** (Item.js:952–970): Every other melee pattern includes `shooterPlane: player.plane`. `createMeleeSlam` omits it. CombatSystem defaults missing `shooterPlane` to 0 (`attack.shooterPlane ?? 0`), meaning slam attacks always behave as plane-0 — they will hit plane-0 enemies even when the player is on plane 1 in U rooms.

4. **Special gun patterns (burst/ring/spiral/wave) missing critical fields** (Item.js:441–598): These 4 patterns omit `homing`, `ricochet`, `maxRicochets`, `pierce`, `split`, `splitCount`, `knockback`, `lifesteal`, `chain`, `chainCount`, `explode`, `explodeRadius`, `attackId`. Any gun item using these patterns silently loses those capabilities. `attackId` missing means burst bullets are treated as separate bursts — iframe bypass between same-burst hits does not apply.

5. **`fireChargeHammerAttack` loses `canSmash` and other flags** (Item.js:322–337): The mega-attack injects only `weaponSubtype`. The `injectSubtype` helper used in `createMeleeAttack` also injects `electric`, `isBlade`, `isBlunt`, `canSmash`, `isPickaxe`, `cyclesExitLetter`. The direct path in `fireChargeHammerAttack` skips all of these.

6. **`isStaffBlocking` and `staffSwingHasFired` not reset in `Player.reset()`**: If the player dies while blocking, the next run starts mid-block-stance. Symptoms: staff won't swing until SPACE is released; block-release sweep fires unexpectedly at run start.

7. **`hidden` flag in dodge roll 'hide' type never initialized** (Player.js:689): `this.hidden = true` is set when entering a 'hide' roll, and `this.hidden = false` when it ends. But `this.hidden` is not in the constructor and not in `reset()`. Before the first roll it is `undefined`, which evaluates falsy — fine. After death it could be `true` if the player died mid-hide-roll.

8. **`inLiquid` uninitialized in constructor** (Player.js:475): Referenced in `getDisplayColor` but never declared in constructor or reset. Set per-frame by `main.js`. JS coercion to falsy makes this safe but it should be declared.

9. **Shockwave damage positions use player top-left, not center** (Item.js:792): `cx/cy` (the visual shockwave origin) are centered correctly at `player.position.x + GRID.CELL_SIZE/2`. But the damage hit positions are `player.position.x + relX` — starting from the top-left of the player cell. The visual shockwave and the damage zone are offset by half a cell. Players will see the ring centered but hits land shifted.

10. **`applyRegen` resets `regenTickTimer = 0`** (Player.js:383): If a regen consumable is re-applied mid-interval, the tick resets, potentially delaying healing by up to `regenInterval` seconds. Not a crash but unintuitive.

11. **Roll speed triplication** (Player.js:598–603, 806–809, 338–343): Three copies of the speed calculation `baseMaxSpeed × armorModified × boost`. If a new modifier is added (e.g., bat-form during roll), all three must be updated. Currently `startDodgeRoll` does not include `batFormTimer` in its speed calculation but `updateInput` does — divergence.

---

## Missing / Incomplete

1. **Poison DoT on player**: `poisonImmune` exists but no `poisonDuration` or poison tick system. Any enemy or trap wanting to poison the player has no canonical path.

2. **Freeze visual feedback**: Frozen player has no color change in `getDisplayColor`. Burn also has no tint in `getDisplayColor` (only external particles in main.js). This inconsistency with goo (which has a blink) and sap (which has a blink) makes status effects visually unclear.

3. **Infusion Wand unimplemented** (Item.js:1133–1135): `// TODO: Implement in Phase 6`. Returns `null`.

4. **Gem wand spell effects as placeholders** (Item.js:1181–1199): `createGemWandAttack` comment says real effects (fire AOE, blizzard, etc.) land in "Phase 2". Confirm status.

5. **`shouldRenderVisible()`** (Player.js:820): Always returns `true`, never consulted. Dead code.

6. **`createSingleArrow` missing `knockback`**: Bullet objects carry `knockback: this.data.knockback`. Arrow objects do not. Arrows cannot knock back enemies via the standard knockback field.

7. **`createSingleArrow` missing `ricochet`**: Bullets support `ricochet` + `maxRicochets`. Arrow data doesn't forward this field even though `this.data.ricochet` could exist.

---

## Suboptimal Implementation

1. **Three-way speed calculation duplication** (`updateInput` line 334–343, `startDodgeRoll` line 598–603, `getRollSpeed` line 806–809): Should be a single private method `_computeBaseMaxSpeed()`. All three copies are subtly different — `startDodgeRoll` omits bat-form multiplier; `getRollSpeed` omits bat-form multiplier; `updateInput` includes it.

2. **`applyStatusEffect` is a leaky abstraction**: The method only handles 3 effects but any string can be passed. Callers must know the off-ramp for burn (`applyBurn`), freeze-immunity check path, and polymorph. This has already caused two production bugs (#37, #38). A `switch` or `Set` of supported effects with an explicit `warn()` for unknown keys would catch future mistakes.

3. **`getStatusSpeedMultiplier` is not a true multiplier chain**: It returns the first matching modifier in priority order — slimeBoost is unreachable while gooey. If a design wants stacked effects (e.g., freeze + slimeBoost = 0.5 * 2.0 = 1.0), this would need to be restructured.

4. **Wand type routing by `this.char`** (Item.js:1113–1140): `createWandAttack` routes by character literal (`case '\\'`, `case '}'`, `case '>'`). Adding a new wand requires modifying this switch. More maintainable to route by `this.data.wandEffect` or a field on the wand data definition.

5. **`createBurstPattern` comment** (Item.js:441): "For now, just create the bullets simultaneously" — suggests this was intended to be temporal but was never implemented. All 3 bullets fire at the same timestamp.

6. **Lazy initialization of `_reloading`, `_reloadTicksPlayed`, `_reloadTicksPending`** (Item.js): These are `undefined` until first use, then set. Should be initialized in the constructor alongside `cooldownTimer`.

7. **`resetUses` magic-number heuristic** (Item.js:1298): `cooldownTimer > 1000` to detect infinite sentinel. The sentinel itself is `9999` (line 1000). Both are magic numbers — a named constant `BOW_DEPLETED_SENTINEL = 9999` and a check `cooldownTimer >= BOW_DEPLETED_SENTINEL - 1` would be safer.

8. **`Player.reset()` does not reset armor-derived fields**: `meleeResist`, `burnResist`, `slimeImmune`, `massBonus`, `rollCooldownMult`, `extraIframes` are only set by `InventorySystem.applyEquipmentEffectsToPlayer`. If the player dies while these are active, and the next room entry doesn't immediately re-apply equipment (because slots are empty), these properties carry forward from the dead run. `reset()` should zero them to match the "no armor" baseline.

---

## Cross-Reference Notes

**For CombatSystem team:**
- `createMeleeSlam` returns a single object, not an array — `addAttack` must handle both shapes (it does via spread, but callers that iterate the result must guard).
- `attack.shooterPlane` missing from `createMeleeSlam` — all U-room plane filtering defaults to plane 0 for slam attacks.
- Hammer mega-attack via `fireChargeHammerAttack` does not carry `canSmash` — rocks will not be smashed by the charged attack.
- Special gun patterns (burst/ring/spiral/wave) do not carry `attackId` — same-burst iframe bypass does not apply to these patterns.

**For PhysicsSystem team:**
- `Player.mass` is set to `1 + massBonus` by InventorySystem. If `reset()` is called and `massBonus` is not zeroed, `mass` retains the old armor value but the armor is gone.
- `player.isOnSlope` and `player.isOnIce` are set by PhysicsSystem and read by `updateDodgeRoll` — one-frame lag is documented and acceptable.

**For rendering team:**
- `getDisplayColor` uses `this.inLiquid` (uninitialized). `this.color` is different from `this.baseColor` — renderers must use `getDisplayColor()` for the animated/tinted version, not `player.color` directly.
- Frozen player has no color change — if a freeze visual is ever desired, it must be added to `getDisplayColor`.
- `shouldRenderVisible()` is always `true` — use `getVisibilityAlpha()` instead.
- `getMeleeDrawAngle` returns `null` for unknown chars — renderers must handle `null` drawAngle (skip rotation).

**For InventorySystem team:**
- `equippedConsumables` is mirrored to `player.equippedConsumables` by InventorySystem, but `Player.reset()` does not clear `player.equippedConsumables`. After death, `player.equippedConsumables` retains old references until InventorySystem re-syncs. Oil effect reads during the gap after death but before equip-sync will still apply old oils.

**For ZoneSystem / PlaneSystem team:**
- `player.plane` is not reset in `Player.reset()` — player could enter REST on plane 1. This should be `0` on death.
