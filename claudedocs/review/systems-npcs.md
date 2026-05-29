## CHARACTER, NPC & INTERACTION SYSTEMS REVIEW

_Review date: 2026-05-15 | Reviewer: Claude Sonnet 4-6_

---

### CharacterSystem.js — Method Catalog + Character Roster

**File:** `src/systems/CharacterSystem.js` (109 lines)

| Line | Method | Parameters | Purpose |
|------|--------|-----------|---------|
| 10 | `applyCharacterType(type)` | `type: string` | Sets all per-character properties on `player`: color, dodge roll params, weapon affinities, action cooldown, damage modifiers, backstab multiplier. Resets green-ranger transient state. |
| 46 | `applyGreenDamageModifier(attack)` | `attack: object\|array` | Applies shrine/consumable flat damage bonus to player attacks. Note: idle/combat bonuses are applied at hit time in CombatSystem, not here. Returns attack (possibly mutated clone). |
| 60 | `triggerGreenActionCooldown()` | — | Sets `player.actionCooldown = actionCooldownMax` for green ranger after an attack. No-ops for GUN weapon (guns use their own cooldown). Only fires when `activeCharacterType === 'green'`. |
| 70 | `spawnCharacterNPCs()` | — | Clears and repopulates `game.characterNPCs` with `CharacterNPC` instances for each unlocked, non-active, non-dead character. Positions them in a centered horizontal row near `y = GRID.CELL_SIZE * 8`. |
| 90 | `swapWithCharacter(newType)` | `newType: string` | Guards against swapping to the active or dead character. Sets `game.activeCharacterType`, calls `game.applyCharacterType(newType)`, respawns CharacterNPCs, and shows a pickup message. |

**Character Roster (`src/data/characters.js`):**

| Key | Name | Roll Type | Notable Ability |
|-----|------|-----------|----------------|
| `default` | Gold Hero | `dodge` | No special abilities; balanced baseline |
| `green` | Green Ranger | `dodge` | Idle damage +2 / combat penalty −1; 25% bow cooldown reduction; action stamina system |
| `red` | Red Warrior | `damage` | Roll damages/knocks back enemies; 20% melee windup reduction; 50% bow cooldown penalty |
| `cyan` | Cyan Rogue | `hide` | Invisible during roll; 2.5× backstab multiplier on undetected enemies |
| `yellow` | Yellow Mage | `blink` | Instant teleport roll; 20% gun fire rate bonus |
| `gray` | Gray Assassin | `dodge` | Fastest dodge stats; +1 trap capacity affinity |

---

### Character Switching Analysis

**Ability apply/remove on switch:**

`applyCharacterType` is called each time a character swap or room entry occurs (`enterExploreState` line 1826, REST enter line 830). It replaces all stored per-character fields, so switching characters is fully applied on every call — there is no "remove old abilities" step because the fields are simply overwritten. This is correct for most abilities.

**Fields reset on every switch (correct):**
- `player.color`, `player.baseColor`
- `player.dodgeRoll.type/duration/cooldown/speed`
- `player.weaponAffinities`
- `player.actionCooldownMax`, `player.actionCooldown` (zeroed)
- `player.rollCharge` (set to `actionCooldownMax`)
- `player.continuousRollActive` (false)
- `player.greenIdleDamageBonus`, `player.greenCombatDamagePenalty`
- `player.backstabMultiplier`

**Quick-slot persistence across switches:**
Each character has a banked inventory via `InventorySystem.characterInventories[type]`. On `applyCharacterType`, `inventorySystem.setActiveCharacter(type)` redirects `restInventory`/`restQuickSlots` pointers. Quick slots ARE preserved per-character as documented. However, this only covers REST-state slots; explore-state item loss on death behaves normally.

**Death handling:**
- Single character death: current character added to `deadCharacters[]`, `livingCharacters` filtered, `pendingNextCharacter` set, `GAME_OVER` state entered, swap completes on SPACE (line 4741).
- All-characters-dead: `livingCharacters.length === 0` → falls through to full game-over reset at line 4795 — `deadCharacters = []`, `activeCharacterType = 'default'`, `unlockedCharacters = ['default']`, errand/zone/boss systems reset.
- The transition to next character restores state via `applyCharacterType` in `enterExploreState`, which correctly re-applies the new character's properties.

**NPC Swaps — what this means:**
`CharacterNPC` instances (distinct from `ErrandCharacter` or `CampNPC`) represent other playable characters who wait in the REST hub. They are rendered as named NPCs the player can walk up to and interact with (SPACE press near them, line 4888). Interacting swaps the active playable character. "NPC swap" is the REST-hub character selection mechanic — walking up to a colored NPC and pressing SPACE switches you to that character.

---

### Character Ability Coverage Matrix

| Character | Ability Defined | Wired / Implemented | Notes |
|-----------|----------------|--------------------|----|
| default | N/A — baseline | ✅ | No special behavior needed |
| green: idle bonus | ✅ `idleDamageBonus: 2` | ✅ CombatSystem lines 750–751, 445–446 | Applied per-hit at damage calc |
| green: combat penalty | ✅ `combatDamagePenalty: 1` | ✅ CombatSystem | Applied at same site |
| green: action stamina system | ✅ `actionCooldownMax: 2.5` | ✅ main.js lines 2487–2544 | Continuous roll consumes charge; regenerates on cooldown |
| green: bow 25% cooldown reduction | ✅ `weaponAffinities.bow.cooldownReduction: 0.25` | ✅ Item.js line 301 | Correctly consumed at bow use |
| red: damage roll | ✅ `rollType: 'damage'` | ⚠️ PARTIAL — see Bugs | roll type stored; damage-on-roll logic exists in main.js but weapon affinities not fully wired |
| red: melee 20% windup reduction | ✅ `weaponAffinities.melee.windupReduction: 0.2` | ❌ NOT CONSUMED | No code reads `affinities['melee']` anywhere |
| red: bow 50% cooldown penalty | ✅ `weaponAffinities.bow.cooldownPenalty: 0.5` | ✅ Item.js line 302 | Correctly consumed |
| cyan: hide roll | ✅ `rollType: 'hide'` | ✅ Player.js line 629 | Invisible during roll |
| cyan: backstab 2.5× | ✅ `backstabMultiplier: 2.5` | ✅ CombatSystem line 758–761 | Applied when enemy `detectionIndicatorTimer <= 0` |
| yellow: blink roll | ✅ `rollType: 'blink'` | ✅ Player.js line 641 | Instant teleport |
| yellow: gun 20% fire rate bonus | ✅ `weaponAffinities.gun.fireRateBonus: 0.2` | ❌ NOT CONSUMED | No code reads `affinities['gun']` anywhere |
| gray: trap +1 capacity | ✅ `weaponAffinities.trap.additionalCharge: 1` | ❌ NOT CONSUMED | No code reads `affinities['trap']` anywhere |

**Summary: 3 out of 6 weapon affinities are dead data (melee windup, gun fire rate, trap capacity).**

---

### ErrandSystem.js — Method Catalog + Lifecycle Analysis

**File:** `src/systems/ErrandSystem.js` (190 lines)

| Line | Method | Parameters | Purpose |
|------|--------|-----------|---------|
| 61 | `onRoomClear(player)` | `player` | Called when first E room is cleared and no active errand exists. Calls `_pickRequest` to initialize `activeErrand`, then returns a new `ErrandCharacter` for the caller to spawn. Returns null if errand already active. |
| 75 | `spawnErrandCharacter()` | — | Creates a new `ErrandCharacter` at room center using `activeErrand.requestedItem` and `activeErrand.stage`. Returns null if no active errand. Used for re-entry into E rooms. |
| 93 | `checkGive(player, neutralCharacters)` | `player`, `neutralCharacters: Array` | Main interaction handler. Checks proximity to errand NPC, validates player holds requested item (inventory for ingredients, active quick slot for items), removes the item, collects reward, advances stage, and picks the next request. Returns `{ rewardChar, x, y }` or null. |
| 150 | `resetOnDeath()` | — | Wipes `activeErrand = null` and `stage = 0`. Called in the true-game-over reset block. |
| 163 | `_pickRequest(player, excludeChar)` | `player`, `excludeChar?: string` | Selects a random item from the current stage's `requestPool`. For item stages, filters out chars already in the player's quick slots. Falls back to allow repeats if pool is exhausted. Sets `this.activeErrand`. |

**Stage Configuration:**
- Stage 0 (`isIngredient: true`): requests rare ingredients (Metal, Teeth, Eye, Scale, Fire Essence, Silk); rewards tier-2 weapons/armor.
- Stage 1 (`isIngredient: false`): requests tier-1 starter weapons; rewards strong mid-tier items.
- Stage 2 (`isIngredient: false`): requests mid-tier items; rewards legendary items. Repeats indefinitely (capped at stage 2).

**Lifecycle — entry points in main.js:**
1. E room cleared → `errandSystem.onRoomClear(player)` (line 4387) → returns `ErrandCharacter`, pushed to `neutralCharacters`
2. Re-entering E room with active errand → `spawnErrandCharacter()` called (line 1901) → returned NPC pushed to `neutralCharacters`
3. Player presses SPACE near traveler with required item → `checkGive()` (line 4690, inside `handleSpacePress`)
4. Run end / death → `resetOnDeath()` (line 4801)

**Can errands get stuck?**
- Stage 0 requests ingredients the player may never encounter (e.g., `F` Fire Essence is zone-gated). If the player never enters the relevant zone, the errand cannot be completed this run. This is by design (the system repeats the same NPC across E rooms until traded) but there is no timeout or fallback.
- Once `activeErrand` is set, there is no way to cancel it other than death. A player who has never held the requested ingredient is permanently stuck on stage 0 for that run unless they find the item.
- The NPC correctly persists across room re-entries via `spawnErrandCharacter()`.

**Are errand states reset on death?**
Yes — `resetOnDeath()` fully clears `activeErrand` and `stage`. ✅

---

### NeutralRoomSystem.js — Method Catalog + Room Type Coverage

**File:** `src/systems/NeutralRoomSystem.js` (112 lines)

| Line | Method | Parameters | Purpose |
|------|--------|-----------|---------|
| 19 | `generateNeutralRoom(scriptName)` | `scriptName: string` | Looks up script in `NEUTRAL_ROOMS`, resets `this.state`, creates base room object (always south exit, no enemies, `cleared: true`), calls `script.onGenerate(room, state)`. Returns room object. |
| 59 | `handleInteraction(target, player, room)` | `target`, `player`, `room` | Delegates to `script.onInteract(target, player, room, state)`. Returns null if no script or no `onInteract`. |
| 73 | `update(deltaTime, room, player)` | `deltaTime`, `room`, `player` | Calls `script.onUpdate(deltaTime, room, player, state)` each frame. No-ops if no script. |
| 86 | `onExit(room, player)` | `room`, `player` | Calls `script.onExit(room, player, state)`, then clears `currentScript` and `state`. |
| 99 | `createCollisionMap()` | — | Generates a 30×30 boolean map with edges set to 1 (walls). Used as the neutral room's collision source. |

**Room Types Defined in `NEUTRAL_ROOMS`:**

| Script Name | State Managed | onGenerate | onInteract | onUpdate | onRender | onRenderBefore | onExit | Status |
|------------|--------------|-----------|-----------|---------|---------|--------------|-------|--------|
| `leshyGrove` | `cutsRemaining`, `prizes`, `cutClusters`, `clusterCenters`, `celebrationActive/Timer/Time` | ✅ Full forest layout | ✅ Grass cutting + prize spawn | ✅ Celebration timer | ✅ Prize reveal overlay | — | ✅ No-op (correct) | Active/Complete |
| `threeRoom` | None | ✅ Single '3' marker | ✅ Returns null | ✅ Empty | — | — | ✅ No-op | Stub placeholder |
| `drawRoom` | `canvas: Map` | ✅ Sets borderColor, inits canvas Map | ✅ Returns null | ✅ Records roll positions | ✅ Empty no-op | ✅ Renders stroke marks | ✅ No-op | Implemented |

**Transition back to EXPLORE:** Detected in `updateNeutralState` (main.js line 2065–2072). Player walks to bottom edge (south) → `neutralRoomSystem.onExit()` called → saved explore state restored. This is clean.

**Missing hooks:** `NeutralRoomSystem` has no `onRender` or `onRenderBefore` methods — the renderer directly reads `game.neutralRoomSystem.currentScript?.onRender` and `onRenderBefore` (NeutralRenderer.js lines 90, 107). This is a leak of internal system state into the renderer. The system should expose these hooks via methods rather than exposing `currentScript` publicly.

**`createCollisionMap` is hardcoded to `GRID.ROWS × GRID.COLS`** (which is 30×30 matching the config) — this is fine but brittle. It would break if grid dimensions change.

---

### InteractionSystem.js — Method Catalog + Interaction Coverage

**File:** `src/systems/InteractionSystem.js` (353 lines)

| Line | Method | Parameters | Purpose |
|------|--------|-----------|---------|
| 17 | `update(deltaTime, backgroundObjects)` | `deltaTime`, `backgroundObjects: Array` | Two sub-tasks: (1) process shockwave events from CombatSystem — advance ring radius, shake objects and knock back enemies in same plane; (2) throttled lava/water solidification check (every 0.5s). |
| 98 | `findNearbyBackgroundObject()` | — | Scans background objects for the one within `INTERACTION_RANGE` of the player, filtered by plane. Redirects to hut/dungeon interior objects when player is inside. Returns first match or null. |
| 120 | `openContainer(obj)` | `obj` | Spacebar-triggered container opener for barrels/crates. Sets `destroyAfterAnimation`, plays 'crack' animation, calls `handleObjectEffect`. |
| 129 | `interactWithObject(obj)` | `obj` | Delegates to `obj.interact(heldItemChar)`. Handles Leshy spawn event on shaking bush (lazy-spawns a `Leshy` entity, starts zone chase). Calls `handleObjectEffect` with result. |
| 153 | `handleObjectEffect(effect, obj)` | `effect: string`, `obj` | Large switch-style string dispatcher for all object effects. See effect coverage table below. |
| 311 | `checkCaptiveInteraction()` | — | Two-step captive rescue: first SPACE destroys cage (debris + flag), second SPACE frees captive, pushes `captive.characterType` to `game.unlockedCharacters`, calls `game.saveGameState()`. |

**`bulletInteraction` value coverage (BackgroundObject system):**
- `'block'` — stops projectile; handled in PhysicsSystem, CombatSystem, Enemy.js ✅
- `'pass-through'` — projectile continues unimpeded ✅
- `'interact-destroy'` — projectile destroys object (e.g., crates) ✅
- `'interact-preserve'` — projectile triggers effect but object survives (e.g., water spreads) ✅
- `'pass-through-slow'` — handled in BackgroundObject.js line 418 but NOT defined in GameConfig for any object. The value exists as a branch but is never used ⚠️
- `'passthrough'` (no hyphen) — BackgroundObject default at line 19 is a typo. The canonical value is `'pass-through'`. Tests against `'pass-through'` (line 370) will miss the default; the effective default after construction is actually overridden by line 85 (`'block'`) so this is masked.

**`handleObjectEffect` — effect string coverage:**
| Effect Pattern | Handler Present | Notes |
|---------------|----------------|-------|
| `destroyObject:spawnIngredient:X` | ✅ | Zone-specific sap logic for trees |
| `destroyObject:spawnRandom` | ✅ | Uses generic drop table |
| `destroyObject` | ✅ | Simple destroy |
| `cutGrass` | ✅ | 15% pollen drop chance |
| `destroyObject:spawnGemstone` | ✅ | Complex mining logic with gem guarantee |
| `destroyObject:spawnWeapon:X` | ✅ | Used for shrine drops |
| `spawnIngredient:X` | ✅ | Non-destructive ingredient spawn |
| `spawnMultiple:X:N` | ✅ | Multi-ingredient spawn |
| `transformObject:newChar` | ✅ | Swaps object in active array; animation lookup may fail (see Bugs) |
| `spawnFire` | ✅ | Adds `!` fire object |
| `spawnCloud:type` | ✅ | Creates particles; but no `spawnCloud:` effect appears in any BACKGROUND_OBJECTS definition in GameConfig — dead handler |
| key drop via `obj.dropsKey` | ✅ | K-room vault key system |
| zone drop table via `obj.dropTable` | ✅ | Rare gemstone drops |

**PlaneSystem usage in InteractionSystem:**
- `findNearbyBackgroundObject`: correctly uses `objectOnPlane(obj, playerPlane)` ✅
- `update` (shockwave): correctly uses `objectOnPlane` for background shake, `inSamePlane` for enemy knockback ✅
- `checkCaptiveInteraction`: **no plane check** — captives are interactable regardless of plane (see Bugs) ⚠️

---

### CampNPCSystem.js — What Is This?

**File:** `src/systems/CampNPCSystem.js` (576 lines)

**Purpose:** Owns all behavior for the mercenary NPC found in C-letter rooms (campfire rooms). This NPC can be hired as a combat companion by offering it a coin after it has picked up a weapon.

**Full Mechanic:**

The `CampNPC` entity has four states:

| State | Description | Transition |
|-------|-------------|-----------|
| `IDLE` | Sits near campfire, no weapon. Coin → hint (zone wise-saying). | → INTERESTED when weapon picked up |
| `INTERESTED` | Armed but tethered to campfire radius. Follows player within tether, shows `?` at limit. Coin → hired as companion. | → COMPANION on coin offering; → FLEEING if damaged to 0 hp |
| `COMPANION` | Full follow + enemy aggro. Uses its weapon to attack enemies. | → FLEEING if hp reaches 0 |
| `FLEEING` | Runs to nearest room exit (Leshy pattern), then despawns. | Removed from `game.companion` on `fleeReached` |

**Weapon pickup system:**
- NPC walks toward any dropped BOW, GUN, or melee-sword within `WEAPON_SCAN_RADIUS` (10 cells).
- On pickup within `WEAPON_PICKUP_RADIUS` (4 cells), old weapon (if any) is dropped, new weapon equipped.
- First pickup transitions IDLE → INTERESTED.
- Accepted weapon types: BOW, GUN, and MELEE with subtype `'sword'` only.

**Coin offering ritual (SPACE while holding `c` ingredient):**
1. Player presses SPACE near NPC while holding `c` ingredient.
2. `handleSpacePress()` removes one `c` from inventory, starts arc animation.
3. After `COIN_ARC_DURATION` (0.55s), `_completeCoinOffering()` fires:
   - If NPC is INTERESTED and armed: promotes to companion (`game.companion = npc`), full heal on next room entry.
   - Otherwise: displays a zone wise-saying from `ZONES[zone].wiseSayings` for 3.5s.

**Companion combat AI:**
- Finds nearest enemy within `ENEMY_AGGRO_RANGE` (8 cells) on same plane.
- Moves per weapon archetype: melee → closes in; bow/gun → keeps `KEEPER_PREFERRED_RANGE` (5 cells).
- Attacks via `_tryAttack()`, which routes through `weapon.use(npc)` or `weapon.executeAttack(npc, 0)` depending on weapon type. Bypasses windup for predictable timing. 50% attack speed penalty applied via per-NPC cooldown.
- Hard leash: if companion drifts beyond `COMPANION_MAX_LEASH` (12 cells) from player, teleported closer.
- On room transition: `onRoomEnter()` snaps companion to player's position and restores full HP.

**Damage system:**
- `_applyEnemyDamage()` checks enemy projectiles and melee hitboxes against the NPC using radius/rect collision. NPC has `invulnerabilityTimer` (0.5s) to prevent multi-hit.
- Direct `.plane` comparison (not PlaneSystem) — see Bugs.

**Hint system:**
- `getHintText()` / `getHintText()` used by renderer to display floating text above the campfire area.
- Hint drawn from `ZONES[zone].wiseSayings` — falls back to `'KEEP MOVING.'` if zone has no sayings.

**Method Catalog:**

| Line | Method | Purpose |
|------|--------|---------|
| 47 | `update(dt)` | Main frame loop: tick hint timer, advance coin arc, update room NPC and companion |
| 81 | `_updateNPC(dt, npc, isCompanion)` | Per-NPC tick: runs entity update, ticks attack cooldown, routes to state handlers, applies damage, handles death |
| 124 | `_updateInterested(dt, npc)` | INTERESTED state: follow player within tether; back off toward campfire at tether limit |
| 172 | `_updateCompanion(dt, npc)` | COMPANION state: find enemy target, update facing, call move + attack, enforce leash |
| 228 | `_moveFollow(dt, npc, player)` | Basic follow movement |
| 245 | `_moveCombat(dt, npc, target, distToTarget)` | Weapon-type-aware combat positioning (approach/retreat) |
| 280 | `_tryAttack(npc, target, distToTarget)` | Routes weapon attack by type (BOW/GUN/MELEE); manages per-NPC cooldown |
| 339 | `_idleSeekWeapon(dt, npc)` | IDLE NPC pathfinding toward nearest valid dropped weapon |
| 373 | `_tryWeaponPickup(npc)` | Pickup weapon within radius; drop old weapon; transition IDLE→INTERESTED |
| 414 | `handleSpacePress()` | Coin offering entry point: proximity + inventory check, starts arc animation |
| 448 | `_completeCoinOffering(anim)` | Arc completion: hire companion or display hint |
| 479 | `_applyEnemyDamage(npc)` | Check projectiles and melee hitboxes for NPC hits |
| 512 | `_pointHitsNPC(x, y, npc, radius)` | Circular hit test |
| 520 | `_rectHitsNPC(attack, npc)` | AABB hit test |
| 536 | `snapCompanionToPlayer(offset)` | Teleport companion beside player (room transition helper) |
| 548 | `onRoomEnter()` | Snap companion + full heal on room entry |
| 564 | `getCoinAnim()` | Renderer accessor for arc animation data |
| 570 | `getHintText()` | Renderer accessor for hint text |

---

### PlaneSystem.js — Predicate Signature + Usage Audit

**File:** `src/systems/PlaneSystem.js` (92 lines)

**Exported predicates:**

| Export | Signature | Purpose |
|--------|-----------|---------|
| `PLANE_SURFACE` | constant `0` | Surface plane identifier |
| `PLANE_TUNNEL` | constant `1` | Tunnel plane identifier |
| `planeOf(entity)` | `entity → number` | Reads plane: checks `entity.plane` first, then `entity.data.renderOnlyOnPlane`, then `entity.data.tunnelWall`, defaults to `PLANE_SURFACE` |
| `inSamePlane(a, b)` | `(entity, entity) → bool` | True when both entities share a plane |
| `canInteract` | alias of `inSamePlane` | Semantic alias for interaction gate |
| `objectOnPlane(obj, plane)` | `(BackgroundObject, number) → bool` | True when background object is present on given plane. Priority: `renderOnlyOnPlane` > `tunnelWall` > default surface |
| `canInteractWithObject(observer, obj)` | `(entity, BackgroundObject) → bool` | Combines `objectOnPlane` with `planeOf(observer)` |
| `filterByPlane(entities, observer)` | `(entity[], entity) → entity[]` | Filter entity array to observer's plane |
| `filterObjectsByPlane(objects, observer)` | `(BackgroundObject[], entity) → BackgroundObject[]` | Filter background objects to observer's plane |

**Files that import PlaneSystem:**

| File | Imports Used |
|------|-------------|
| `InteractionSystem.js` | `inSamePlane`, `planeOf`, `objectOnPlane` |
| `CombatSystem.js` | `planeOf`, `inSamePlane`, `objectOnPlane` |
| `PhysicsSystem.js` | (comment only — "new code should import from PlaneSystem") |

**PlaneSystem bypass audit — direct `.plane` comparisons that bypass predicates:**

| File | Line | Pattern | Risk |
|------|------|---------|------|
| `main.js` | 2350, 2359 | `(gooBlob.plane ?? 0) === (this.player.plane ?? 0)` | Should use `inSamePlane` |
| `main.js` | 4447, 4498, 4532, 4573 | `(this.player.plane ?? 0) === 0` | Exit checks require plane 0 — direct check is intentional and correct, but inconsistently styled |
| `CampNPCSystem.js` | 183 | `(e.plane ?? 0) !== npc.plane` | Should use `inSamePlane(e, npc)` |
| `CampNPCSystem.js` | 488 | `(p.plane ?? 0) !== npc.plane` | Should use `inSamePlane(p, npc)` |
| `CampNPCSystem.js` | 502 | `(m.plane ?? 0) !== npc.plane` | Should use `inSamePlane(m, npc)` |
| `TrapSystem.js` | 200, 718, 736, 759 | `(enemy.plane ?? 0) !== playerPlane` | Should use `inSamePlane` |
| `RoomGenerator.js` | 962, 3412 | `enemy.plane = 1` / `enemy.plane !== undefined` | Assignment is correct; read is ok but could use `planeOf` |
| `PhysicsSystem.js` | 325, 330, 804, 806, 812 | Direct `.plane` reads/writes | Plane transitions (804–812) must write `.plane` directly — acceptable. Reads at 325/330 should use `planeOf`. |
| `CombatSystem.js` | 196, 717, 931, 1079 | `proj.plane !== undefined`, `planeOf(player) !== (attack.shooterPlane ?? 0)` | Mixed: some use `planeOf` correctly, some compare raw `.plane` |
| `ExploreRenderer.js` | 336, 346, 399–415, 429 | Raw `.plane` reads | Rendering is acceptable — renderers read plane for visual layer, not interaction |

**Assessment:** `CombatSystem.js` is the most consistent adopter. `CampNPCSystem.js` bypasses PlaneSystem entirely for all its plane checks. `TrapSystem.js` uses raw `.plane` throughout. `PhysicsSystem.js` has a comment noting the intent but still uses raw reads.

---

### Bugs & Logic Errors

**B1 — P1 — ErrandSystem stage-0 inventory lookup always fails**

`checkGive()` line 111: `player.inventory.findIndex(ing => ing.char === requestedChar)`

`player.inventory` stores **strings** (via `Player.addIngredient` line 831: `this.inventory.push(typeof ingredient === 'string' ? ingredient : ingredient.char)`). The lambda accesses `.char` on a string — `'M'.char` is `undefined`. The `findIndex` always returns `-1`, making stage-0 errands permanently uncomplectable. The fix: `ing === requestedChar` (direct string compare).

Compare with `CampNPCSystem.handleSpacePress` line 432: `player.inventory.includes('c')` — correct because it treats inventory as string array.

**B2 — P2 — `game.companion` not initialized in Game constructor, not reset on death**

`game.companion` is set by `CampNPCSystem._completeCoinOffering()` via `game.companion = npc` (line 461) but is never declared as `this.companion = null` in `Game.constructor`. The death reset block (lines 4795–4827) never nullifies it. If the companion is alive when the player dies, it survives into the next run, referencing a stale NPC from a previous room. `game.companion = null` should be added to both the constructor and the full game-over reset block.

**B3 — P2 — CampNPCSystem bypasses PlaneSystem for all plane checks**

Lines 183, 488, 502 compare `(entity.plane ?? 0) !== npc.plane` directly. `npc.plane` starts as `0` (CampNPC constructor line 50). This will work for plane 0 cases but is inconsistent with the PlaneSystem contract and will silently misbehave if `npc.plane` is ever not set (undefined — `(e.plane ?? 0) !== undefined` is always `true`). Should use `inSamePlane(e, npc)`.

**B4 — P2 — `checkCaptiveInteraction()` has no plane check**

`InteractionSystem.checkCaptiveInteraction()` (line 311) compares only Euclidean distance. A player on plane 1 (inside a tunnel) could interact with a captive on plane 0 through the tunnel wall if close enough. Should gate the interaction with `inSamePlane(game.player, captive)`.

**B5 — P2 — `checkCaptiveInteraction()` does not guard against duplicate unlock**

Line 341: `game.unlockedCharacters.push(captive.characterType)` has no `.includes()` guard. If the captive interaction is triggered twice in quick succession (two SPACE presses in a single frame — `captiveInteractionThisFrame` flag prevents this within one update cycle, but edge cases exist), the character type could be pushed twice. Should add a guard: `if (!game.unlockedCharacters.includes(captive.characterType))`.

**B6 — P2 — InteractionSystem shockwave event splice drops all but first event**

Line 21: `const ev = swEvents.splice(0, swEvents.length)[0]`. This removes all queued shockwave events and only processes `[0]`. If two bone-crusher shockwaves are queued in the same frame (rapid attack edge case), only the first fires. Should be a queue — process each event in a loop.

**B7 — P2 — `transformObject:` effect breaks if animation name is not found**

Line 271–278: `const animData = OBJECT_ANIMATIONS['freeze'] || OBJECT_ANIMATIONS['melt']`. If neither 'freeze' nor 'melt' is defined in `OBJECT_ANIMATIONS`, `animData` is falsy and no animation is set — silent failure. This is cosmetic but leaves the transformed object unanimated.

**B8 — P2 — NeutralRoomSystem exposes internal `currentScript` to renderer**

`NeutralRenderer.js` reads `game.neutralRoomSystem.currentScript?.onRender` and `currentScript.onRenderBefore` directly (lines 90, 107). This bypasses the system's public API and forces the renderer to know about internal state. The system should expose `renderBefore(renderer, room, player)` and `render(renderer, room, player)` methods.

**B9 — P2 — ErrandSystem comment says SHIFT triggers give; actually SPACE does**

`ErrandSystem` JSDoc line 44: "Player holds requested item (or ingredient), walks close, presses **SHIFT**". But `checkGive` is called from `handleSpacePress` (main.js line 4690), not `handleShiftPress`. The comment is wrong.

**B10 — P1 — Red Warrior melee windup, Yellow Mage gun fire rate, Gray Assassin trap capacity affinities are dead data**

`CHARACTER_TYPES.red.weaponAffinities.melee.windupReduction`, `yellow.weaponAffinities.gun.fireRateBonus`, and `gray.weaponAffinities.trap.additionalCharge` are defined in `characters.js` but never read anywhere in the codebase. Players playing Red Warrior get no melee speed bonus, Yellow Mage gets no gun rate bonus, and Gray Assassin gets no extra trap capacity.

**B11 — P2 — BackgroundObject default `bulletInteraction` is `'passthrough'` (no hyphen) at line 19**

`BackgroundObject.js` line 19 sets the fallback data to `bulletInteraction: 'passthrough'`. The canonical value is `'pass-through'`. Line 370 checks for `'pass-through'` (and `'pass-through-slow'`), not `'passthrough'`. Since line 85 overwrites with `this.bulletInteraction = this.data.bulletInteraction || 'block'`, the fallback data value is unused in normal object construction — masked but a latent inconsistency if the fallback data is ever accessed directly.

---

### Missing / Incomplete Features

**M1 — Green Ranger `rollCharge` UI display**
`GreenRangerIndicator.js` renders a charge bar, but the `rollCharge` mechanic (lines 2515–2544 in main.js) is coupled to `actionCooldownMax` in a non-obvious way. The charge bar may not reflect the charge accurately during `continuousRollActive`. Needs explicit testing.

**M2 — NeutralRoomSystem has no `onRender` / `onRenderBefore` encapsulation**
The `leshyGrove` script has both hooks; `threeRoom` and `drawRoom` only partially implement them. If a new script author forgets to add `onRender`, the renderer silently skips it — no default no-op in `NeutralRoomSystem`.

**M3 — `threeRoom` is a stub**
The Three Room neutral script (line 356) only places a single `'3'` marker. Per design intent ("the view from the ridge, a centered '3' marker hints at the three zones ahead"), this is a placeholder. No interaction, no lore, no gameplay content.

**M4 — CampNPC companion does not persist across REST entries**
When the player returns to REST (`enterRestState`), `game.companion` is not cleared or re-linked. `campNPCSystem.onRoomEnter()` is called only in `enterExploreState` (line 1921). If a player enters REST with a companion, the companion still exists on `game.companion` but is not updated, rendered in REST, or snapped to position. On re-entering EXPLORE it snaps beside the player — which is arguably correct behavior, but REST rendering shows no companion, which is inconsistent.

**M5 — ErrandSystem has no visual feedback when player lacks the requested item**
When `checkGive` returns null (player doesn't have the item), there is no UI message or indicator. The player has no clear feedback that the trade failed. The errand NPC shows a `requestedItem` character, but there's no "you need X to trade" message.

**M6 — `spawnCloud:` effect handler in InteractionSystem is dead code**
No `BACKGROUND_OBJECTS` entry in GameConfig uses a `dropEffect` or `interactions` effect of `spawnCloud:*`. The handler at InteractionSystem line 287 is unreachable.

**M7 — `pass-through-slow` bulletInteraction value is defined in BackgroundObject but unused in data**
`BackgroundObject.js` line 418 has a case for `'pass-through-slow'` in its bullet behavior switch. No GameConfig entry uses it.

---

### Redundancies

**R1 — `game.applyCharacterType` / `game.spawnCharacterNPCs` are thin wrappers**
`main.js` lines 1081–1083, 1258–1260 are one-line delegates to `characterSystem`. These wrappers exist because `CharacterSystem.swapWithCharacter` calls `game.applyCharacterType(newType)` and `game.spawnCharacterNPCs()`, creating a round-trip: CharacterSystem → Game → CharacterSystem. The system should call `this.applyCharacterType(type)` directly, not route through the game wrapper.

**R2 — CampNPCSystem exports `COIN_ARC_PEAK_HEIGHT_EXPORT` and `COIN_ARC_DURATION_EXPORT`**
Lines 575–576: redundant named re-exports of module-level constants that are already accessible as module imports. Likely added for renderer use — check if these are actually imported anywhere.

**R3 — `interactWithObject` and `openContainer` in InteractionSystem are redundant code paths**
Both call `handleObjectEffect`. `openContainer` bypasses HP/damage and forces crack animation; `interactWithObject` uses the full `obj.interact()` path. The distinction is documented but the separation is not enforced — any caller can call either method on any object. A guard or method naming convention would clarify intent.

**R4 — `NeutralRoomSystem.createCollisionMap()` duplicates logic in `RoomGenerator.createCollisionMap()`**
The neutral room creates its own 30×30 walled map using the same edge-detection logic as RoomGenerator. Should use a shared utility or call the room generator's method.

---

### Cross-Reference Notes

**XR1 — `saveGameState()` call in `InteractionSystem.checkCaptiveInteraction()` is a no-op**
Line 344: `game.saveGameState()` — this method (main.js line 930) is fully commented out and does nothing. The call is harmless but misleading — it implies state is being persisted when it is not.

**XR2 — Errand NPC (`ErrandCharacter`) lives in `neutralCharacters` array**
`ErrandCharacter` instances are pushed to `game.neutralCharacters` (not a dedicated array). `checkGive` finds the NPC with `neutralCharacters.find(nc => nc instanceof ErrandCharacter)`. This works but means the errand NPC competes with other neutral characters (Leshy, Rusalka, etc.) for the same array. If multiple ErrandCharacter instances exist (edge case: multiple E rooms cleared?), only the first is found.

**XR3 — `onRoomClear` guards `if (this.activeErrand) return null`**
Only one errand can be active at a time. If a second E room is cleared while an errand is active, no new NPC spawns — this is correct by design but not documented.

**XR4 — Character `rollType: 'damage'` for Red Warrior**
The `'damage'` roll type is listed in `characters.js` and stored in `player.dodgeRoll.type`. The Player switch statement at line 624 handles `'hide'` and `'blink'` but falls through to default for `'damage'`. The damage-on-roll logic appears to be implemented in main.js directly (not in Player), checking `this.player.dodgeRoll.type === 'damage'`. Verify this is actually wired.

**XR5 — CampNPC plane is hardcoded to `0`**
`CampNPC` constructor sets `this.plane = 0` (line 50). If a C room is ever generated in a tunnel context, the companion would be stuck on plane 0 regardless of the room type. Not a current issue (C rooms are normal combat rooms) but worth noting.

**XR6 — `errandSystem.checkGive` is called in EXPLORE `handleSpacePress`, not SHIFT**
The ErrandSystem docstring says "presses SHIFT" (line 43). The actual key binding is SPACE. This will mislead future developers maintaining the system.
