## SUPPORTING ENTITIES REVIEW

---

### Method Catalog

| File | Method / Export | Line | Purpose | Issues |
|------|----------------|------|---------|--------|
| BackgroundObject.js | `constructor(char, x, y, options)` | 5 | Initializes all fields; fallback chain for unknown chars | `isCampfire`, `_flickerTimer`, `electricBlinkTimer`, `electricBlinkOn`, `burnt`, `grassImprinted`, `grassResetTimer`, `grassRenderOffset` are never declared here — all lazy-inited at runtime (see §Constructor Field Completeness) |
| BackgroundObject.js | `takeDamage(amount, isBlade)` | 135 | Applies damage via HP system; returns `{destroyed, effect}` | `destroyAfterAnimation` guard prevents double-kill, but when `hp === null` (indestructible check) returns early — grass with `indestructible: false` and no HP would still fall through correctly; no issue |
| BackgroundObject.js | `cutGrass()` | 169 | Transitions `\|` → `,` in-place | Resets `hp` to `null` and `maxHp` to `null`, but doesn't reset `flammability` from the source data — cut grass may retain tall-grass flammability rating briefly |
| BackgroundObject.js | `acceptsInteraction(type)` | 189 | Returns whether this object accepts a given interaction type | Correct |
| BackgroundObject.js | `interact()` | 194 | Non-destructive interaction for shrines, water, etc. | Dereferences `this.data.interactions.default` without null-checking `this.data.interactions` itself — will throw if a background object's data definition omits the `interactions` key entirely (fallback objects from unknown chars line 14–22 have no `interactions` field). Any unknown-char object that gets `interact()` called on it will crash |
| BackgroundObject.js | `_playAnimation(type)` | 206 | Looks up `OBJECT_ANIMATIONS[type]` and starts animation | No-ops silently for unknown animation types — fine |
| BackgroundObject.js | `update(deltaTime)` | 217 | Fire state, water state, campfire flicker, Leshy shaking, animation frame | `isShaking` shakeInterval is recalculated with `Math.random()` every frame even when `shakeTimer < shakeInterval` — the random call is wasted; the interval is effectively randomized-per-frame rather than a fixed random window |
| BackgroundObject.js | `getHitbox()` | 324 | Returns `{x,y,width,height}` collision box | Correct |
| BackgroundObject.js | `getRenderPosition()` | 333 | Returns `{x,y,char,color}` for rendering | Water-state color override is skipped for 'electrified' (by design), but the comment explains it |
| BackgroundObject.js | `handleBulletCollision(bullet)` | 355 | Routes bullet through bulletInteraction enum | `bulletInteraction: 'passthrough'` (no hyphen) in the fallback object at line 19 is a **different string** than `'pass-through'` used in all `GameConfig.js` definitions. The switch at line 386 has no `case 'passthrough'` — these fallback objects silently default to `'block'` behavior (via `bulletBehavior = this.bulletInteraction` then falling out of switch with `shouldDestroyBullet = false` still false from init, but `animation = 'shake'` is played and the default return includes the unrecognized enum value — result is a bullet that passes through but still plays shake animation). Bug: inconsistent spelling causes recipe sign objects to behave unexpectedly on bullet contact |
| BackgroundObject.js | `ignite(duration)` | 436 | Ignites a flammable object | Does not check `destroyed` — a destroyed object can still be ignited |
| BackgroundObject.js | `isWater()` | 446 | Tests if object is a water tile | Uses runtime-set `damaging` and `isDryMud` fields that are never declared in constructor — relies entirely on `undefined` being falsy. Fragile but functional with current call sites |
| BackgroundObject.js | `isLava()` | 454 | Tests if object is lava | Same concern — `damaging` is set externally by RoomGenerator, not in constructor |
| BackgroundObject.js | `solidifyToRock()` | 461 | Converts lava → rock in-place | Correct; updates all relevant fields |
| BackgroundObject.js | `isMud()` | 485 | Tests if object is mud | Same `isDryMud` / `slowing` runtime-set concern |
| BackgroundObject.js | `steamOnFire()` | 493 | Whether fire should produce steam on this tile | Correct |
| BackgroundObject.js | `setWaterState(state, duration)` | 498 | Sets water state; guards non-water objects | `isWater()` guard will also pass for frozen water (since `waterState !== 'frozen'` is not required here) — calling `setWaterState` on a frozen water tile resets it correctly |
| BackgroundObject.js | `getWaterState()` | 505 | Simple getter | Correct |
| BackgroundObject.js | `isFlammable()` | 507 | Returns `flammability !== 'none'` | Correct; does not check `destroyed` |
| BackgroundObject.js | `isConductive()` | 511 | Returns conductivity state accounting for freeze | Correct |
| BackgroundObject.js | `createVariant(typeId, x, y, variantOverrides)` | 522 | Static factory for typed variants | Correct |
| BackgroundObject.js | `burnGrass()` | 544 | Converts burning grass to cut grass with burnt color | Correct |
| BackgroundObject.js | `blocksVision()` | 563 | Whether this object blocks enemy vision | Correct |
| BackgroundObject.js | `slowsMovement()` | 569 | Whether this object slows movement | Returns `data.slowing` (number or `false`) — callers must treat non-`false` values as truthy, not strictly `true` |
| Particle.js | `constructor(x, y, char, color, velocity, lifetime)` | 4 | Core particle init | All fields in constructor. No lazy-init. |
| Particle.js | `update(deltaTime)` | 28 | Decrements lifetime; applies deceleration | Correct; sets `alive = false` at lifetime ≤ 0 |
| Particle.js | `getAlpha()` | 41 | Linear fade 0→1 based on remaining lifetime | Correct |
| Particle.js | `getHitbox()` | 46 | Full-cell hitbox | Particles have `hasCollision = false` so this is informational only |
| Particle.js | `createWetDrop(x, y)` | 57 | Factory: water drip trail | Correct |
| Particle.js | `createSteamPuff(x, y)` | 75 | Factory: steam cloud particle | Correct |
| Particle.js | `createActivationBurst(x, y, color)` | 94 | Factory: consumable use burst (7 particles) | Correct |
| Particle.js | `createExplosion(x, y, count, color)` | 117 | Factory: explosion radial burst | Correct |
| Particle.js | `createChaff(x, y, count)` | 143 | Factory: grass debris from bullets | Correct |
| Particle.js | `createFootstep(x, y)` | 173 | Factory: sprint footstep dot | Correct |
| Particle.js | `createFrostAuraParticle(x, y)` | 184 | Factory: frost robe aura | Correct |
| Particle.js | `createFlameAuraParticle(x, y)` | 202 | Factory: flame robe aura | Correct |
| Particle.js | `createShockAuraParticle(x, y)` | 220 | Factory: shock robe aura | Correct |
| Particle.js | `createAuraParticle(x, y, type)` | 238 | Dispatcher for the three aura types | Falls back to `null` for unknown types — callers must null-check |
| Particle.js | `createDodgeTrail(x, y, color)` | 246 | Factory: dodge roll afterimage trail | Correct |
| Debris.js | `constructor(x, y, char, color)` | 4 | Physics debris piece | All fields in constructor |
| Debris.js | `update(deltaTime)` | 28 | Resets acceleration; ticks push cooldown | Debris never self-destructs. Relies on room-transition clears |
| Debris.js | `applyPushForce(pusherVelocity, pusherMass)` | 42 | Applies momentum from a passing entity | Correct |
| Debris.js | `getHitbox()` | 59 | Half-cell hitbox | Correct |
| Debris.js | `createDebris(x, y, count, color)` | 70 | Factory: scatter debris from death | Correct |
| Puddle.js | `constructor(x, y, radius, type, plane)` | 6 | Floor-area hazard | **No `update()` method** — lifetime is managed externally by TrapSystem. `lifetime` field is NOT initialized in constructor — set externally via `puddle.lifetime = duration` immediately after construction in both call sites |
| Puddle.js | `isEntityOnPuddle(entity)` | 28 | Circle-vs-point overlap test using entity center | Correct |
| RewardObject.js | `constructor(x, y, catchData)` | 13 | Flying catch reward that homes to player | `velocity` is initialized as `{x:0, y:0}` but all other entities use `{vx:0, vy:0}` — inconsistent axis naming; update() sets `velocity.x` / `velocity.y`, which is consistent with itself |
| RewardObject.js | `update(dt, playerPos)` | 26 | Homing movement toward player | Correct; sets `arrived = true` on arrival |
| RewardObject.js | `getRenderX()` | 50 | Cell-center X | Correct |
| RewardObject.js | `getRenderY()` | 55 | Cell-center Y | Correct |
| Captive.js | `constructor(characterType, x, y)` | 5 | Cage entity with 5×5 grid render | Inherits NeutralCharacter; extends `width/height` to 3× for cage. No `alive` or `destroyed` field. |
| Captive.js | `getColorForType(type)` | 25 | Static color lookup | Includes `'green'` type (which has no captive spawn path since green is the starting zone) — vestigial |
| Captive.js | `update(deltaTime)` | 36 | Delegates to super pulse animation | Correct |
| Captive.js | `getHitbox()` | 41 | 3×3-cell hitbox offset by −1 cell | Inconsistent with `NeutralCharacter.getHitbox()` which centers by half-width — Captive's getHitbox does a manual offset. Callers of `getHitbox` that expect the same semantic as NeutralCharacter may get different results |
| Captive.js | `render(ctx, gridToPixel)` | 50 | Full 5×5 cage render or freed state (no-op) | Uses `monospace` not `Unifont` font — violates project font rules (everything non-VentureArcade should use Unifont). No `getHitbox` guard against `freed` state either — hitbox remains active on freed captives |
| Ingredient.js | `constructor(char, x, y)` | 5 | Pickup ingredient entity | All fields initialized |
| Ingredient.js | `getHitbox()` | 31 | Full-cell hitbox | Correct |
| Ingredient.js | `pickup()` | 40 | Sets `pickedUp = true` | Does not set velocity to zero or do any other cleanup — relies on caller to remove from array |
| Bobber.js | `constructor(startX, startY, targetX, targetY, chargeRatio)` | 11 | Cast bobber with parabolic arc | Uses `String.fromCharCode(248)` for `'°'` instead of literal glyph — not a breaking issue but inconsistent with codebase rule against Unicode escapes (though charCode is not technically a Unicode escape) |
| Bobber.js | `update(dt)` | 30 | Parabolic arc flight then bob | Correct |
| Bobber.js | `getRenderX()` | 50 | Cell-center X | Correct |
| Bobber.js | `getRenderY()` | 55 | Bobbing Y offset when settled | Correct; uses sine wave at 4 rad/s |
| FishEntity.js | `constructor(x, y)` | 14 | Ambient decorative fish | All fields initialized including random phase `bobTimer` |
| FishEntity.js | `update(dt)` | 31 | Bob + periodic jump arc | Correct |
| FishEntity.js | `getRenderY()` | 56 | Y with jump offset | Correct |
| FishEntity.js | `getRenderX()` | 61 | Cell-center X | Correct |

---

### Constructor Field Completeness

**BackgroundObject** — 7 lazy-initialized fields violate the anti-pattern stated in `CLAUDE.md`:

| Field | Where initialized | Problem |
|-------|-------------------|---------|
| `isCampfire` | `RoomGenerator.js:481` via monkey-patch | Never in constructor — tests with `if (this.isCampfire)` silently pass for all non-campfire objects |
| `_flickerTimer` | `update()` via `(this._flickerTimer \|\| 0)` | Lazy-init in update loop |
| `electricBlinkTimer` | `update()` via `(this.electricBlinkTimer \|\| 0)` | Lazy-init in update loop |
| `electricBlinkOn` | `update()` via `!this.electricBlinkOn` | Lazy-init in update loop (undefined → false flip) |
| `burnt` | `burnGrass()` at line 560 | Set at burn time, never initialized |
| `grassImprinted` | `main.js:4102` | External lazy-init — flagged as anti-pattern in CLAUDE.md Architectural Compromises section |
| `grassResetTimer` | `main.js:4102` | Same |
| `grassRenderOffset` | `main.js:4105` | Same |
| `damaging` | `RoomGenerator.js:2053,2097` | Runtime monkey-patch; used in `isWater()` / `isLava()` — no constructor default |
| `isDryMud` | `PhysicsSystem.js:190` | Runtime mutation; used in `isMud()` / `isWater()` |

**Particle** — All fields initialized in constructor. Clean. Ember objects pushed directly into `game.particles` (e.g., lines 4180–4192 in `main.js`) are plain object literals, not `Particle` instances — they have a different shape (`{x, y, vx, vy, life, maxLife, char, color, size, isEmber}`) and lack `update()`, `getAlpha()`, and `alive`. The particle cleanup loop in `main.js` guards with `if (particle.update)` — so ember plain objects are not updated via `Particle.update()`. Their `life` field is not decremented by anything visible in the excerpt (the main.js cleanup loop at line 2340 splices if `!particle.alive`, which ember objects never set). This is a likely memory accumulation bug.

**Debris** — All fields initialized. No self-expiry mechanism — but room transitions clear `this.debris = []` across all entry/exit paths, so no unbounded growth.

**Puddle** — Missing: `lifetime` (set externally post-construction), `update()` method. The `plane` parameter defaults to `0` — correct. `scatterPoints` is seeded from Math.random at construction and never mutated — stable per-frame rendering.

**RewardObject** — All fields declared. `velocity` uses `{x,y}` keys instead of project-standard `{vx,vy}`. No hitbox, no `hasCollision`, no `width`/`height` — these are absent by design (it homes and is hit by melee AABB collision in main.js which does a direct distance check, not `getHitbox()`).

**Captive** — No `alive`, `destroyed`, or `canPickUp` field. The `freed` flag controls skip-logic instead. No issue functionally since captives are array-cleared on room transition.

**Ingredient** — All fields initialized including `bobTimer` and `inWater`. Clean.

**Bobber** — All fields initialized including arc state. `inWater` starts `true` but is not used anywhere in the file or system — it appears to be a vestigial field.

**FishEntity** — All fields initialized with random phase. Clean.

---

### Entity Lifecycle Analysis

**BackgroundObject**
- Created by: `RoomGenerator`, `HutSystem`, `DungeonSystem`, `MazeSystem`
- Updated: each frame via `obj.update(deltaTime)` inside the `_activeBackgroundObjects()` loop in `main.js`
- Destroyed: `obj.destroyed = true` (set in `update()` after fire burns out or after animation completes). Caller filters via `_activeBackgroundObjects()` which strips destroyed objects from render; `backgroundObjects` array itself is only cleared on room transition, not on individual destroy. Destroyed objects accumulate in the array until room change — not a leak since rooms are fully replaced, but could be many stale objects mid-run.

**Particle**
- Created by: factory functions in `Particle.js`; also plain object literals in `main.js` (ember objects)
- Updated: `main.js` update loops (lines 2272–2276 and 2813–2817)
- Cleaned: `particles.splice(i, 1)` when `!particle.alive`
- Bug: ember plain objects pushed into `game.particles` (lines 4180–4192) lack `alive` and `update` properties. The guard `if (particle.update)` skips their update, but the cleanup `if (!particle.alive)` treats `undefined` as falsy (meaning NOT alive = true), so **embers ARE removed when the cleanup path for their array position runs**. Actually: `!undefined === true`, so `particle.alive` being undefined would cause immediate removal. But line 2272 `if (particle.update)` skips the update call for ember objects. After that skip, line 2274 checks `if (!particle.alive)` — for ember objects `alive` is `undefined`, so `!undefined` = `true` — they are immediately spliced. So ember objects are discarded after one frame without any visual. The ember `life` field is never used by the cleanup loop.

**Debris**
- Created by: `createDebris()` factory
- Updated: `main.js` calls `physicsSystem.updateDebris(this.debris.filter(d => d), ...)` — the filter removes falsy entries; Debris has no self-expiry
- Cleaned: `this.debris = []` at room transitions and REST/death resets — correct

**Puddle**
- Created by: `_spawnEnemyTrailPuddle()` in `main.js` and `TrapSystem` slime bomb
- Updated: no `update()` method — all lifecycle in TrapSystem's update loop (splice when `lifetime <= 0`)
- Puddles without `lifetime` set are permanent until the `game.puddles` array is cleared (room/death transition)
- Cleaned: `TrapSystem` splices expired puddles; room transitions presumably clear `game.puddles`

**RewardObject**
- Created by: `FishingSystem.spawnRewardObject()`
- Updated: `FishingSystem.update()` calls `reward.update(dt, playerPos)`; also removes via `splice` when `!reward.alive`
- Cleaned: `FishingSystem.reset()` sets `this.rewardObjects = []` — correct

**Captive**
- Created by: `main.js` spawn helper (`createCaptiveForRoom`)
- Updated: `main.js` update loop iterates `this.captives` calling `captive.update(deltaTime)`
- **Not removed individually on free** — `captive.freed = true` is set by `InteractionSystem`, but the object stays in `this.captives` indefinitely within the current room visit. The render path skips freed captives (`if (!captive.freed)`). The interaction path skips them too. But `captive.update()` still runs each frame on freed captives — wasted cycles. No memory leak since `this.captives = []` fires on room transitions.

**Ingredient**
- Created by: `LootSystem`, `main.js` (goo blobs, enemy drops, errand rewards, cheat menu)
- Updated: physics and magnet loops in `main.js` — no standalone `update()` called
- Cleaned: `ingredient.pickedUp = true` flags removal; main.js splices picked-up ingredients from `this.ingredients`
- `inWater` is reset to `false` each frame in `main.js` before water processing re-applies it — ephemeral flag, correct

**Bobber**
- Created by: `FishingSystem.cast()`
- Updated: `FishingSystem.update()` calls `this.bobber.update(dt)` while active
- Cleaned: `this.bobber = null` on reel-in / reset — correct. No array management needed.

**FishEntity**
- Created by: `FishingSystem._trySpawnFish()`
- Updated: `FishingSystem.update()` calls `fish.update(dt)` on each entity
- Cleaned: `FishingSystem.reset()` sets `this.fishEntities = []`; on catch, `fishEntities.splice(idx, 1)` removes the targeted fish
- `fish.alive` is never set to `false` — FishEntity never self-destructs; only removed via splice

---

### BackgroundObject Interaction Coverage

**bulletInteraction values (from code):**

| Value | Handled in switch? | shouldDestroyBullet | Notes |
|-------|-------------------|---------------------|-------|
| `'block'` | Yes | true | Plays 'bounce' animation |
| `'pass-through'` | Yes | false | Plays 'shake' animation |
| `'pass-through-slow'` | Yes | false | Returns 'slow' bulletBehavior + 'ripple' animation |
| `'interact-destroy'` | Yes | true | Routes through `takeDamage(1)` |
| `'interact-preserve'` | Yes | true | Crystal reflect or data interactions['/'] effect |
| `'passthrough'` (no hyphen) | **No** | false (falls through) | Bug: fallback objects use this spelling; switch has no case for it. Results in `bulletBehavior = 'passthrough'` returned to caller — likely unhandled upstream |

**Flammability chain:**

The fire spread system (main.js ~4170–4223) differentiates `'high'` vs other flammable ratings only via ember count (3 vs 1) and travel distance (48 vs 32px). The `'medium'` rating produces identical spread behavior to `'low'` — no gradient. The flammability field has three non-'none' values (`'low'`, `'medium'`, `'high'`) but only binary behavior in spread code. Medium and low objects are treated identically.

The `ignite()` method does NOT check `this.destroyed` — a destroyed object can be set on fire, and its fire timer will continue ticking in the update loop (though `burnGrass()` guard checks char, not destroyed). Low risk but inconsistent.

**Conductivity:**

`isConductive()` correctly handles frozen water losing conductivity and variantData override. No observed bugs.

---

### Particle System Coverage

**Implemented factory types:**

| Factory | Effect | Used by |
|---------|--------|---------|
| `createWetDrop` | Water drip trail | (entity movement through water) |
| `createSteamPuff` | Steam cloud particle | Steam contact with fire |
| `createActivationBurst` | Consumable use burst | InventorySystem |
| `createExplosion` | Radial explosion | CombatSystem |
| `createChaff` | Grass debris | Bullet-vs-grass |
| `createFootstep` | Sprint footstep dot | Player sprint |
| `createFrostAuraParticle` | Frost robe aura | Ice Plate / frost robe |
| `createFlameAuraParticle` | Flame robe aura | Ember Cloak |
| `createShockAuraParticle` | Shock robe aura | Shock robe |
| `createDodgeTrail` | Dodge roll afterimage | Player dodge |

**Missing / notable gaps:**

- No **blood / hit splat** particle — enemy hits and player damage have no visual gore particle. Combat feels less tactile.
- No **magic sparkle** or **spell cast** particle — spells and magic attacks lack distinct particle types.
- No **ice shard** particle for freeze shatter (hammer-on-frozen-enemy effect).
- No **poison drip** particle for poisoned enemies.
- No **death burst** particle distinguished by element/type — all enemy deaths share the generic `createExplosion` (or debris).
- Embers are **plain object literals** pushed into `game.particles`, not `Particle` instances — as documented above, they are silently discarded after one frame by the cleanup loop treating `alive = undefined` as falsy. This means burning objects produce no visible ember particles at runtime despite the ember generation code firing regularly. This is effectively a silent visual bug.

---

### Puddle System Analysis

**Defined puddle types in `Puddle.VISUALS`:**

| Type | fillColor | color | char |
|------|-----------|-------|------|
| slime | #00cc44 | #00ff66 | ~ |
| lava | #ff4400 | #ff8844 | ~ |
| mud | #664422 | #997744 | ~ |
| water | #0055cc | #4499ff | ~ |
| poison | #880099 | #cc44ff | ~ |
| fire | #cc3300 | #ff6622 | ! |
| ice | #448899 | #88ddff | i |

**Types actually created at runtime:**

| Type | Created where |
|------|--------------|
| slime | `TrapSystem._applySlimeTrap` (slime bomb) |
| fire | `main.js._spawnEnemyTrailPuddle` (Magma Slug trail) |
| ice | `main.js._spawnEnemyTrailPuddle` (Glacier Crab trail) |

**Types with effect handlers in TrapSystem:**

| Type | Handler | Status |
|------|---------|--------|
| slime | `_applySlimePuddle` | Implemented |
| fire | `_applyFirePuddle` | Implemented |
| ice | `_applyIcePuddle` | Implemented |
| mud | (none) | **No handler** — type exists in VISUALS and could be created, but TrapSystem switch has no `case 'mud'` |
| water | (none) | **No handler** — same |
| poison | (none) | **No handler** — same |
| lava | (none) | **No handler** — lava as a Puddle entity is never created (BackgroundObject handles lava tiles separately via the `~` char + `damaging` flag) |

**Persistence:** Puddles have no `update()` method. Lifetime is managed by TrapSystem's update loop. Puddles without a `lifetime` field are permanent. Neither `main.js` nor TrapSystem initializes `lifetime` in the constructor — it is set post-construction at both call sites. If a call site forgets to set `lifetime`, the puddle becomes permanent.

**Entity interaction:** `isEntityOnPuddle()` uses entity center (adding `GRID.CELL_SIZE / 2` to position). This is correct for entities whose `position` is the top-left corner. However if an entity's `position` is already the center (as some NeutralCharacter subclasses may be), the center offset would be wrong — double-offsetting. Worth verifying for each entity type passed to this check.

---

### Character Encoding Audit

Per the two-tier rule: raw ingredients must be letters or digits; crafted items must be Unicode symbols.

**INGREDIENTS that violate the rule (non-letter, non-digit chars):**

| Char | Name | Codepoint | Violation |
|------|------|-----------|-----------|
| `~` | String | U+007E | Punctuation/operator — also used as BackgroundObject char for water/puddle; collision with rendering |
| `\|` | Stick | U+007C | Punctuation — also used as BackgroundObject char for tall grass; collision |
| `` ` `` | Emerald | U+0060 | Punctuation — also used in debris char set |
| `_` | Diamond | U+005F | Punctuation — also used in debris char set |
| `?` | Ruby | U+003F | Punctuation |
| `(` | Sapphire | U+0028 | Punctuation |
| `𝑚` | Mana | U+1D45A | Mathematical Italic Small m — this is a **Unicode symbol, not a letter** — it is in the Mathematical Alphanumeric Symbols block, not Basic Latin. The two-tier rule states raw ingredients must be "single letter (a–z, A–Z) or digit (0–9)". Mathematical italic characters are not in those ranges. **Rule violation.** |
| `ŝ` | Sap | U+015D | Latin Extended-A letter — technically a letter but outside a–z/A–Z range |
| `š` | Fire Sap | U+0161 | Latin Extended-A letter — same concern |
| `ş` | Frost Sap | U+015F | Latin Extended-A letter — same |
| `ł` | Pollen | U+0142 | Latin Extended-A letter — same |

**Dual-use char conflicts (ingredient char = background object char):**

| Char | As ingredient | As BackgroundObject |
|------|--------------|---------------------|
| `~` | String | Water/puddle tile |
| `\|` | Stick | Tall grass |
| `i` | Ice (ingredient) | Ice floor tile |
| `0` | Rock (ingredient) | Rock background object |

The `i` and `0` dual-use is the most problematic: `INGREDIENTS['i']` and `BACKGROUND_OBJECTS['i']` both exist. Code that resolves a char to either item data or background object must pick one. The BackgroundObject constructor's fallback chain (line 9–22) checks `BACKGROUND_OBJECTS` first, so background `i` objects are correctly identified. But inventory code using `INGREDIENTS['i']` to get ice ingredient data would also succeed — the chars coexist. This is workable but creates conceptual confusion.

---

### Memory Leak Risks

1. **Freed captives in `this.captives` array** — `captive.freed = true` does not remove the object from `this.captives`. The update loop still calls `captive.update(deltaTime)` on freed captives every frame within that room visit. Minor CPU waste, no actual leak since the array is cleared on room transition.

2. **Ember plain objects in `game.particles`** — As analyzed above: ember objects have `alive = undefined`, so the cleanup condition `if (!particle.alive)` is immediately true, and they are discarded after one frame. Net effect: no leak, but also no visible embers.

3. **BackgroundObject `destroyed` objects in room arrays** — Destroyed background objects (fire burnout, cracked rocks) are not spliced from `backgroundObjects`; they remain with `destroyed = true` until room transition. The active filter `_activeBackgroundObjects()` skips them for update/render, but they remain referenced. In a long room with many destructibles this could accumulate tens of stale objects mid-run — not a true leak (bounded by room lifespan) but wasteful.

4. **No reference from Puddle back to its parent room** — Puddles hold no back-reference to any entity. On room transition, if `game.puddles` is not explicitly cleared, puddles from the previous room would persist into the next (with stale plane numbers and positions). Should verify that all room-entry paths clear `game.puddles`.

---

### Bugs & Logic Errors

**B1 — `bulletInteraction: 'passthrough'` spelling mismatch (BackgroundObject.js:19)**
The fallback object for unknown chars uses the value `'passthrough'` (no hyphen). The switch in `handleBulletCollision` (line 386) has no case for this value. Result: unknown-char objects that are hit by bullets execute no case, `shouldDestroyBullet` remains `false`, and `bulletBehavior` is set to the raw string `'passthrough'` which callers may not handle. Recipe sign objects are the primary unknown-char objects and could be hit by stray projectiles.

**B2 — `interact()` crashes on objects without `data.interactions` (BackgroundObject.js:195)**
`this.data.interactions.default` is accessed without null-checking `this.data.interactions`. The fallback object created for unknown chars (lines 14–22) has no `interactions` field. If `InteractionSystem` calls `obj.interact()` on a recipe sign or other unknown-char object, it will throw `TypeError: Cannot read properties of undefined (reading 'default')`.

**B3 — Ember objects silently discarded after one frame (main.js ~4180–4192, Particle.js cleanup)**
Ember plain objects pushed into `game.particles` lack the `alive` field. The cleanup loop treats `!particle.alive` as `!undefined = true` and immediately splices them. Fire spread generates visual embers that never actually display for more than one frame (and physics update is skipped since they lack `update`). Players see no embers from burning objects.

**B4 — `ignite()` does not guard `destroyed` state (BackgroundObject.js:436)**
A destroyed object (after `burnGrass()` or `takeDamage` completing) can be ignited. The fire timer will then tick in `update()`, which will call `burnGrass()` or set `this.destroyed = true` again on a previously-destroyed object. Low-risk but produces double-destroy semantics.

**B5 — `isShaking` shakeInterval recalculated every frame (BackgroundObject.js:279)**
`const shakeInterval = 3 + Math.random() * 2;` is declared inside the `if (this.isShaking)` block that runs every frame. The random interval is re-evaluated each frame and compared to the timer — the shakeTimer can never actually exceed the interval in practice because the interval keeps changing. The shake animation may fire far more frequently than intended (whenever `shakeTimer` happens to exceed the new random value, which could be as low as 3.0s but resets `shakeTimer = 0`). The logic works but the interval is not actually 3–5 seconds — it depends on randomized frame comparisons.

**B6 — Captive `render()` uses `monospace` font instead of `Unifont` (Captive.js:59)**
The project font rules specify Unifont for all canvas entity rendering. `ctx.font = \`${GRID.CELL_SIZE}px monospace\`` in Captive.render() violates this — cage bars and the `@` captive character use system-default monospace, which may misalign with Unifont-rendered entities in the same frame.

**B7 — Captive hitbox remains active after `freed = true` (Captive.js)**
`getHitbox()` has no `freed` guard. InteractionSystem checks `captive.freed` before interaction, so freed captives cannot be interacted with. But any collision or proximity check that uses `getHitbox()` directly without checking `freed` would still collide with the freed (invisible) captive.

**B8 — `Puddle.lifetime` not initialized in constructor (Puddle.js)**
`lifetime` is set by callers post-construction. If a call site creates a Puddle without setting `lifetime`, it is permanent. The TrapSystem check `if (puddle.lifetime !== undefined)` explicitly handles this by only decrementing defined lifetimes — permanent puddles are intentional. However there is no way to tell a permanent puddle from a forgotten `lifetime` assignment.

**B9 — `Bobber.inWater` field initialized `true` but never used (Bobber.js:17)**
The field `this.inWater = true` is set in the constructor but never read or modified in Bobber.js or FishingSystem.js. It is vestigial.

---

### Redundancies

**R1 — Duplicate ingredient magnet/pickup loops in `main.js`**
Based on grep output, there are three separate blocks in main.js (lines ~2008, ~2726, ~4294) that contain nearly identical ingredient pickup/magnetization code. These are the EXPLORE, NEUTRAL, and dungeon/hut interior paths respectively. All three share the same logic pattern (pickupCooldown tick, repulsion, goo auto-consume, mana auto-consume, addIngredient). This is the kind of duplication that should live in a single method called from each state's update path.

**R2 — `Captive.getColorForType` includes `'green'` with no captive spawn path**
The `'green'` color entry in `getColorForType` is never exercised — the starting zone has no captive mechanic. Vestigial.

**R3 — `Puddle.VISUALS` defines `'mud'`, `'water'`, `'lava'`, `'poison'` types with no corresponding TrapSystem handlers or creation paths**
Four of seven puddle types are fully defined visually but have no effect implementation and no spawn calls. They are dead weight in the enum.

**R4 — `RewardObject.velocity` uses `{x,y}` naming while all other entities use `{vx,vy}`**
RewardObject is the only entity with `velocity.x` / `velocity.y`. Not a bug since the fields are consistent within the class, but adds cognitive overhead for any developer reading cross-entity physics code.

---

### Cross-Reference Notes

- **BackgroundObject `isWater()` vs `Puddle` type `'water'`** — these are two separate systems. BackgroundObject water tiles (char `~`, no `damaging`, no `isDryMud`) are handled by PhysicsSystem and the waterState system. `Puddle` type `'water'` is a separate entity with no behavior handlers. They do not interact.

- **BackgroundObject `char: 'i'` (Ice floor) vs `INGREDIENTS['i']` (Ice ingredient)** — dual-use char. The `BackgroundObject` constructor resolves `'i'` to `BACKGROUND_OBJECTS['i']` (ice floor tile) correctly. `Ingredient` constructor resolves `'i'` to `INGREDIENTS['i']` (ice ingredient). No collision in practice — entities are separate — but the shared char means a stray `getItemData('i')` would return the ingredient, not the background object config.

- **BackgroundObject `char: '~'` (Water tile) vs `INGREDIENTS['~']` (String ingredient)** — same dual-use issue. Additionally, `Puddle` also uses `char: '~'` in its VISUALS for most types. Three systems claim the same glyph for different entities.

- **Captive extends NeutralCharacter but overrides `getHitbox()`** with different centering semantics — any code that polymorphically calls `getHitbox()` on a mixed array of NeutralCharacters and Captives will receive differently-centered boxes.

- **FishEntity has `alive = true` field but never sets it to `false`** — FishingSystem uses `fishEntities.splice(idx, 1)` rather than a flag to remove caught fish. The `alive` field is redundant.

- **Puddle.scatterPoints** uses `Math.sqrt(Math.random())` for uniform disk distribution — this is the correct formula for unbiased point distribution in a circle (avoids center clustering). No issue.
