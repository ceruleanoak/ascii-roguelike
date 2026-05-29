# COMBAT & PHYSICS SYSTEMS REVIEW
**Files reviewed:** `src/systems/CombatSystem.js` (~2129 lines), `src/systems/PhysicsSystem.js` (~979 lines)
**Date:** 2026-05-15
**Reviewer:** Claude Sonnet 4.6

---

## CombatSystem.js — Method Catalog

| Method | Line | Purpose | Issues |
|--------|------|---------|--------|
| `constructor(physicsSystem)` | 5 | Initialises all combat arrays; lazy-inits `wandProximityFailures` | `wandProximityFailures` is lazily initialised inside `update()` at line 74 instead of the constructor — inconsistent with every other array |
| `update(dt, player, enemies, backgroundObjects, noiseSource, room)` | 26 | Main per-frame dispatch: roll damage, pending attacks, pending projectiles, damage numbers, AOE timers, chain arcs, player projectiles, player melee, enemy projectiles, enemy melee, enemy AI + DOT, stuck arrows, tongues | ~1375 lines; monolithic; mixes entity-iteration logic with damage application |
| `updateRollDamage(player, enemies, backgroundObjects)` | 1682 | Red Warrior roll damage: hits enemies and smashes bg objects once per roll | No plane check on enemies; roll hits cross-plane enemies. No null guard on `player` (checked, has early return) |
| `applyKnockback(enemy, attack)` | 1732 | Delegates to `physicsSystem.applyKnockback` from attack position | No null guard on `attack.position` for edge cases |
| `updateProjectilePlane(projectile, tunnelData)` | 1744 | Switches projectile plane when crossing tunnel bounds | Uses raw `projectile.plane =` assignment instead of going through PlaneSystem setter (no setter exists, but it bypasses the read-path abstraction) |
| `checkProjectileTunnelEntrance(projectile, bounds, entranceAxis)` | 1774 | Guards plane switch to correct axis only | Uses only `bounds.min/maxCol/Row` edge check; diagonal travel could miss the one-column-wide edge |
| `createChainLightning(source, hitEnemy, enemies)` | 1795 | Linear chain: iterates enemies per hop to find nearest | O(n × maxChains) — fine for current sizes, but no plane filter; chains cross planes |
| `getChainArcs()` | 1853 | Returns `this.chainArcs` array for rendering | — |
| `checkProximity(position, proximityRange, enemies)` | 1857 | Returns true if any enemy is within range | No plane filter; wand wakes enemies on the wrong plane |
| `applyAOEStatus(position, radius, statusType, duration, enemies)` | 1876 | Applies status to all enemies within radius | No plane filter; blind wand affects cross-plane enemies |
| `createExplosion(x, y, radius, damage, enemies, backgroundObjects, damageMin)` | 1892 | Area damage + knockback + bg-object ignition | No plane filter on enemies or bg objects; explosions hit cross-plane targets; `damageMin` default is `0` which is correct, but falloff formula duplicated slightly differently from bg-object branch (lines 1903 vs 1935) |
| `createSplitProjectiles(originalProj)` | 1957 | Spawns spread projectiles on hit | Split projectiles inherit no `onHit`, `knockback`, `pierce`, `lifesteal`, `chain`, `explode`, `owner`, `shooterPlane` from original — they are plain bullets with no properties beyond type/char/position/velocity/damage/color |
| `_applyCritIfLucky(damage, owner)` | 1982 | Crit roll gated by player.critChance or weapon.critChance | `isLucky` flag is set to `critChance > 0` even when only weapon provides the crit (not Lucky Coin / well) — misleads "LUCKY CRIT" label; the comment says "Lucky Coin / well is contributing" but the implementation can't distinguish |
| `createDamageNumber(damage, x, y, color, scale, duration)` | 1999 | Pushes floating text to `this.damageNumbers` | Uses `GRID.CELL_SIZE / 2` horizontal offset unconditionally; overlapping numbers from multiple hits stack at the same pixel |
| `clear()` | 2013 | Resets main arrays on room change | `pendingEnemyProjectiles`, `aoeEffects`, `shockwaveEvents`, `chainArcs`, `polymorphEvents`, `impactEffects`, `newSteamClouds`, `wandProximityFailures`, `objectDestroyEvents` are NOT cleared — stale entries persist across room transitions |
| `getProjectiles()` | 2024 | Returns player projectile array | — |
| `getEnemyProjectiles()` | 2028 | Returns enemy projectile array | — |
| `getMeleeAttacks()` | 2032 | Returns player melee array | — |
| `getEnemyMeleeAttacks()` | 2036 | Returns enemy melee array | — |
| `getDamageNumbers()` | 2040 | Returns damage number array | — |
| `getStuckArrows()` | 2044 | Returns stuck arrow array | — |
| `getTongueAttacks()` | 2048 | Returns tongue attack array | — |
| `cancelPendingAttacksFrom(owner)` | 2052 | Removes pending enemy projectiles by owner | Only cancels `pendingEnemyProjectiles`; does NOT cancel `pendingMeleeAttacks` — an enemy that dies during melee windup can leave orphaned pending melee attacks that reference a dead `owner` |
| `checkProjectileCollision(proj, enemy)` | 1505 | AABB player-projectile vs enemy hitbox | — |
| `checkMeleeCollision(attack, enemy)` | 1521 | AABB melee vs enemy hitbox | Attack `width`/`height` not defaulted; if undefined, all comparisons NaN and no collision |
| `checkMeleeCollisionWithObject(attack, obj)` | 1537 | AABB melee vs bg object | Same width/height default issue |
| `checkRicochet(proj)` | 1553 | Canvas-edge bounce for ricochet projectiles | Checks only canvas bounds (not collisionMap walls); ricochet projectiles phase through wall cells |
| `isOutOfBounds(proj)` | 1583 | Returns true if outside canvas | — |
| `_hitsWall(proj, room)` | 1590 | Tests projectile against room collisionMap | Single-point check at `proj.position` (top-left corner); fast projectiles can skip a wall cell in one frame |
| `createEnemyAttack(attackData)` | 1603 | Routes enemy attack data into correct array | No null guard for `attackData.type` on single-object path — if `type` is undefined, falls through to `enemyProjectiles` push silently |
| `checkProjectileCollisionWithPlayer(proj, player)` | 1645 | AABB enemy-proj vs player with centering offset | Centering offset uses `(GRID.CELL_SIZE - hw) / 2` which is wrong for projectiles wider than CELL_SIZE — offset goes negative, expanding hitbox outward |
| `checkMeleeCollisionWithPlayer(attack, player)` | 1663 | AABB enemy-melee vs player, inset by 50% W / 25% H | Width reduced to 50% but height only 25% — asymmetric and not documented. Player box may be unfairly clipped |
| `addAttack(attackData, enemies)` | 1415 | Routes player attack data into correct array | `chaos_wand`/`blind_wand` return `false`/`true` but other paths return `undefined` — inconsistent return value; callers may misinterpret undefined as success |
| `createAttack(attackData, enemies)` | 1402 | Wraps `addAttack` for single or array input | — |
| `reflectBullet(bullet, obj)` | 2076 | Reverses bullet direction with random spread | Sets `bullet.reflected = true` which skips player collision check; but reflected player bullets can then re-enter `this.projectiles` and still check enemy collisions — so reflection works, but there is a stale TODO comment at line 2089 |
| `conductElectricity(sourceObj, damage, enemies, player)` | 2093 | Electric chain from conductive object to wet entities | Only hits enemies that are already wet (`enemy.isWet()`); does not check plane; can zap cross-plane enemies; player check uses `player.isWet` method but kills call `player.takeDamage` without a `damageSource` object — may trigger wrong reflect/block path |

---

## Player Attack Pipeline

1. **Input** — Player presses Space/mouse in `main.js handleSpacePress` or auto-fire loop; calls `item.createBullets()`, `item.createArrow()`, or `item.createMeleeAttack()` depending on `weaponType`.
2. **Attack creation** — `Item.js` factory methods produce an attack data object with `type`, `position`, `velocity`/`damage`/`onHit`/`knockback`/`owner`, etc.
3. **`createAttack(data, enemies)`** (line 1402) — dispatches to `addAttack`.
4. **`addAttack(data, enemies)`** (line 1415):
   - `type === 'bullet'|'arrow'|'transmutation_bolt'` → pushed to `this.projectiles` with `plane` inherited from `shooterPlane` (defaults to 0).
   - `type === 'melee'` → if `delay > 0` goes to `pendingMeleeAttacks`; otherwise directly to `meleeAttacks`.
   - `type === 'chaos_wand'|'blind_wand'` → proximity check, then AOE explosion or status.
5. **`update()` — projectile loop** (line 106):
   - Homing behaviour, arrow deceleration, position integration.
   - Wall check via `_hitsWall(proj, room)`.
   - Background object collision.
   - Ricochet check.
   - Out-of-bounds check.
   - Enemy collision: `checkProjectileCollision` → elemental modifier, Green Ranger bonus, crit roll → `enemy.takeDamage(finalDamage, attackId)` → status effects, knockback, hitstop, lifesteal, chain lightning, explosion.
6. **`update()` — melee loop** (line 567):
   - `pendingMeleeAttacks` are timer-decremented and promoted (position recalculated from owner if `relX`/`relY` present).
   - Active melee: duration countdown; exit-letter cycling; bg-object collision (once per `hasHitObject`); enemy collision (once per `hasHit`) — plane checked via `planeOf(enemy) !== (attack.shooterPlane ?? 0)`.
   - On hit: wet/frozen bonuses, backstab, Green Ranger, crit → `enemy.takeDamage()` → status, knockback, chain, explosion.

**Bug noted in step 5:** The projectile loop checks `inSamePlane(proj, enemy)` (line 399) which correctly uses PlaneSystem. The melee loop at line 717 uses a **direct comparison** `planeOf(enemy) !== (attack.shooterPlane ?? 0)` rather than `inSamePlane` — functionally equivalent for plane 0/1 but bypasses the canonical predicate.

---

## Enemy Attack Pipeline

1. **AI decision** — `enemy.update(dt)` inside `CombatSystem.update()` at line 1190 calls the enemy's own update, which tracks `attackTimer`, cooldown, `aggroRange`, state machine.
2. **Windup visual** — If `enemy.isWindingUp()`, a windup visual is created and pushed to `enemyMeleeAttacks` in windup-phase mode. Position is updated each frame using `ownerOffsetX/Y`.
3. **Attack creation** — When `enemy.canAttack()` and no windup in flight, `enemy.createAttack()` returns attack data; `createEnemyAttack(data)` dispatches:
   - Array → each element goes to `pendingEnemyProjectiles` (if `delay>0`) or `enemyProjectiles`.
   - `type === 'tongue'` → `tongueAttacks`.
   - `type === 'enemy_melee'` → `enemyMeleeAttacks`.
   - Single non-melee non-tongue → `enemyProjectiles` / `pendingEnemyProjectiles`.
4. **Pending enemy projectile promotion** (line 31) — `delay` decremented; on expiry, moved to `enemyProjectiles`.
5. **Enemy projectile update** (line 879):
   - Lifetime decrement (for short-lived hitbox projectiles).
   - Position integration.
   - Water freezing pass (ice stream).
   - Wall check via `_hitsWall`.
   - Out-of-bounds check.
   - `inSamePlane(proj, player)` plane gate.
   - `reflected` skip.
   - Player hitbox check → staff block → shield block → `player.takeDamage(damage, {isBullet:true, element, attacker})` → DODGE / BLOCK / IMMUNE / REFLECT handling.
6. **Enemy melee update** (line 1027):
   - Windup alpha animation; owner position tracking during windup.
   - On windup end: attack activated (hasHit=false, flashWhite, duration reset).
   - Active strike: plane check on player; `checkMeleeCollisionWithPlayer` → staff block (isImpact bypass) → shield → `player.takeDamage(damage, {isBullet:false,isMelee:true,...})`.
7. **Sap damage** (line 1200) — returned from `enemy.update()` as `sapDamage`; calls `player.takeDamage` directly without a `damageSource.isBullet`/`isMelee` flag — partial damageSource object may miss reflect/block logic.

---

## Projectile Lifecycle

### Player Projectiles (`this.projectiles`)
- **Creation:** `addAttack()` → pushed with `plane`, `width = CELL_SIZE`, `height = CELL_SIZE`.
- **Update:** Homing steering (no plane filter on target selection — will home across planes), arrow deceleration, position integration.
- **Collision:** wall → splice (arrow creates stuck entry); bg-object → conditional splice; enemy → splice if not pierce.
- **Cleanup:** `isOutOfBounds` → splice; arrow speed < 30 → stuck-arrow entry + splice.
- **Leaks:** `clear()` does NOT reset `pendingMeleeAttacks` or `pendingEnemyProjectiles` — any pending attacks at room transition survive into the next room.

### Enemy Projectiles (`this.enemyProjectiles`)
- **Creation:** `createEnemyAttack()` → `enemyProjectiles` or `pendingEnemyProjectiles`.
- **Update:** Lifetime → splice; position integration; optional water-freezing scan; wall check; out-of-bounds.
- **Collision:** `inSamePlane` gate; `reflected` skip; player hitbox → splice on consume (or pass-through on invulnerable).
- **Zombie risk:** `reflected` projectiles (set in player-projectile-vs-Mirror-Imp path at line 410) re-enter `enemyProjectiles` array with `reflected: true`, skipping the player collision path (line 934). They then travel indefinitely until out-of-bounds or hitting a wall — they do not check enemy collision, so they cannot deal friendly-fire damage and will never be consumed by normal enemy logic. If a wall is never reached, these can linger.

### Stuck Arrows (`this.stuckArrows`)
- `stuckTo` refers to an enemy or player by reference.
- Dead-target check at line 1286: uses `arrow.stuckTo.hp <= 0 || arrow.stuckTo.destroyed`. No null guard — if `stuckTo` is somehow set to null elsewhere, `arrow.stuckTo.hp` will throw.
- `lifetime` defaults are present for most stuckType paths; `stuckType: 'enemy'` arrows have no `lifetime` in the stuck-to-enemy branch (line 533–548) — they rely only on `stuckTo` death check. If the enemy never dies (immortal NPC, boss sub-entity), the arrow never expires.

---

## Staff Block Implementation

- **Blocking state:** `player.isStaffBlocking` (set by input handler in `main.js`).
- **Speed penalty:** `PhysicsSystem.updateEntity()` line 281 applies `velocityMultiplier *= 0.5` when `entity.isStaffBlocking && !isDodgeRolling`.
- **Deflection — projectile:** `CombatSystem.update()` line 939: if `player.isStaffBlocking`, creates `'BLOCK'` number, splices projectile — **projectile is consumed without being deflected back**. The CLAUDE.md doc says "deflects enemy projectiles" but the code just removes them. No counter-projectile is created.
- **Deflection — melee:** line 1086: if `player.isStaffBlocking && !attack.isImpact`, blocks melee and sets `hasHit = true` — correct.
- **Release sweep:** not visible in CombatSystem; presumably in `main.js _releaseStaffBlock`. CombatSystem only does the block consumption; no sweep logic here.
- **Coverage gaps:**
  - Tongue attacks (line 1355–1376): no staff block check — tongue hits the player even while staff-blocking.
  - Sap damage (line 1200–1228): no staff block check.
  - Roll damage from enemies: enemies' dodge-roll damage path not applicable (player-side), but if an enemy had a roll feature it wouldn't be blocked.

---

## Hammer Shatter Implementation

- **Trigger condition** (line 777): `isFrozen && attack.weaponSubtype === 'hammer'` applies `totalDamage = Math.ceil(totalDamage * 2.5)`.
- **`isFrozen`** (line 766) is read from `enemy.isFrozen()` — presumably checks `enemy.statusEffects.freeze.frozen === true`. This is reliable as long as `isFrozen()` method exists on all enemy types.
- **Freeze flag reliability:** The `frozen` flag is set in the hit path at line 823 (`enemy.statusEffects.freeze.frozen = true`) only when `!enemy.data.freezePermanent` and when not already frozen. If freeze is applied via status effect expiry or other paths, the `.frozen` sub-flag might not be set. If `enemy.statusEffects.freeze` is undefined (enemy was never frozen), `isFrozen()` must guard against it — verify in `Enemy.js`.
- **Projectile path:** No hammer shatter logic exists in the projectile hit loop (lines 441–558). Hammer weapons are melee only by design (`attackPattern: 'shockwave'`), so this is intentional — but if a hammer weapon were ever given a `type: 'bullet'`, shatter would silently not trigger.
- **Visual feedback:** "blunt on frozen" indicator at line 839–841 shows `'*'` in cyan — correct.
- **Death vs shatter:** The 2.5× multiplier does not guarantee a one-shot kill; an enemy with enough HP survives the shatter hit. The CLAUDE.md description "instant kill effect" is not reflected in code — it's just a damage multiplier.

---

## PlaneSystem Violations

Direct `.plane` comparisons in combat code that bypass `planeOf()` / `inSamePlane()`:

| Location | Line | Code | Issue |
|----------|------|------|-------|
| `update()` — melee vs enemy | 717 | `planeOf(enemy) !== (attack.shooterPlane ?? 0)` | Uses `planeOf` for entity but compares to raw integer literal `0` instead of `PLANE_SURFACE` constant; not using `inSamePlane` |
| `update()` — enemy melee vs player | 1079 | `planeOf(player) !== (attack.shooterPlane ?? 0)` | Same pattern |
| `updateProjectilePlane()` | 1760, 1763 | `projectile.plane = targetPlane` | Direct write to `.plane` (no setter, so unavoidable, but it bypasses any future hook) |
| `PhysicsSystem.updatePlane()` | 804, 805, 807 | `entity.plane = 1` / `entity.plane = 0` | Direct writes in underground room branch |
| `checkRicochet()` | (all) | No plane check at all | Ricochet projectiles can bounce off canvas walls and re-enter the game on the wrong plane if plane was set in flight |

The most actionable violation is lines 717 and 1079 which should use `inSamePlane(attack, enemy)` / `inSamePlane(attack, player)` and import `PLANE_SURFACE` for clarity instead of the raw `0` literal.

---

## Performance Concerns

| Location | Complexity | Description |
|----------|-----------|-------------|
| `update()` — projectile × enemy | O(P × E) per frame | Inner loop at line 398: every player projectile checks every enemy. With P=20 bullets (spread shot, split) and E=15 enemies, 300 checks/frame — acceptable but will hurt with boss phases that spawn many projectiles |
| `update()` — projectile × bg objects | O(P × O) per frame | Line 226: every projectile checks every background object. With P=20 and O=100 objects in a dense room, 2000 checks/frame |
| `update()` — melee × enemies | O(M × E) per frame | Line 716: every melee attack checks every enemy. Flail/sweep patterns spawn 5+ simultaneous attacks, so M × E can reach 75 checks |
| `update()` — enemy melee × player | O(A) per frame | Only one player — fine |
| `createChainLightning()` | O(maxChains × E) | Line 1804: nested while + for. With maxChains=3 and E=15, 45 iterations — fine at current cap |
| `createExplosion()` | O(E + O) | Single pass each — fine |
| `conductElectricity()` | O(E) | Iterates all enemies — fine |
| `applyAOEStatus()` | O(E) | Iterates all enemies — fine |
| Homing: | O(E) per projectile per frame | Line 114: all homing projectiles scan all enemies. Multiple homing bullets (e.g. chaos wand scatter) multiplies this |
| `updateRollDamage()` | O(E + O) | Hit-tracking sets prevent re-checks — efficient |
| `PhysicsSystem.update()` — terrain scan | O(entities × bg objects) | Line 154: every entity scans every bg object for terrain overlap; no spatial partitioning. At 30 entities + 100 objects = 3000 AABB tests/frame |
| `PhysicsSystem.resolveSolidObjectOverlap()` | O(4 × entities × objects) | 4 passes × same counts; worst case 12000 additional tests; no early exit until no overlap |

**Frame-drop risk:** The combination of `PhysicsSystem.update()` terrain scan + `checkBackgroundObjectCollision()` means each entity does up to 200+ AABB tests per frame. With 20 enemies + player + ingredients, this is ~5000 tests/frame. At 60fps this is ~300k tests/sec — likely fine in JS but no spatial indexing means any room expansion compounds cost linearly.

---

## PhysicsSystem.js — Method Catalog

| Method | Line | Purpose | Issues |
|--------|------|---------|--------|
| `constructor()` | 13 | Initialises empty `entities` array | — |
| `addEntity(entity)` | 18 | Push entity if not already present | O(n) `includes` check every call |
| `removeEntity(entity)` | 24 | Splice entity by indexOf | O(n) indexOf — fine for current sizes |
| `clear()` | 30 | Reset entities to `[]` | — |
| `applyKnockback(entity, sourceX, sourceY, force, duration)` | 39 | Knock entity away from source point | No null guard on entity — though caller (CombatSystem) usually guards |
| `applyKnockbackDir(entity, dirX, dirY, force, duration)` | 52 | Knock entity along explicit direction | — |
| `applyHitstop(entity, duration)` | 61 | Freeze entity position integration briefly | Null guard present (line 62) |
| `applyImpulse(entity, dirX, dirY, force)` | 70 | Additive velocity nudge, mass-scaled | No null guard on `entity.velocity` — will throw if called on entity without velocity |
| `resolveEntityContacts(player, enemies)` | 82 | Soft separation between player and overlapping enemies | Correctly skips sapping enemies, boss entities, charging enemies, cross-plane; uses `inSamePlane` |
| `_applyKnockbackForce(entity, nx, ny, force, duration)` | 103 | Internal: apply scaled knockback with resistance | `entity.mass` defaulted to 1 correctly; calls `entity.applyStatusEffect?.('knockback', duration)` — optional chain is correct |
| `update(deltaTime, backgroundObjects, room)` | 113 | Iterate all tracked entities, call `updateEntity` | No plane grouping — all entities get full bg-object scan even if cross-plane. Return value `waterResults` is consumed by caller |
| `updateEntity(entity, deltaTime, backgroundObjects, room)` | 122 | Per-entity physics: hitstop, acceleration, terrain detection, friction, slope, float, velocity multiplier, position, collision, bounds, overlap resolution, plane update | Long method (~220 lines); most of the complexity is terrain classification which is correct but verbose |
| `checkCollision(entity, newX, newY, backgroundObjects, room)` | 342 | Combines grid-bounds, collisionMap, bg-object collision | Delegates correctly to axis-separated helpers |
| `_isCellConditionallyPassable(row, col, entity, room)` | 409 | Checks passable zone conditions (float, small) | — |
| `checkAxisCollision(collisionMap, testX, testY, width, height, axis, entity, room)` | 425 | Per-axis collisionMap sweep | — |
| `resolveCollisionMapOverlap(entity, room)` | 448 | 2-pass eject from collisionMap wall cells | Nested loop breaks on first overlapping cell per pass; corner cases in tight corridors handled by 2-pass |
| `checkBackgroundObjectCollision(entity, newX, newY, backgroundObjects)` | 506 | Per-entity, per-object AABB (with SKIN=1px) and ellipse support | O(n) per entity per frame; SKIN comment is well-documented |
| `checkEllipseRectCollision(ellipseBox, rectBox)` | 592 | Ellipse vs AABB via closest-point test | Correct implementation |
| `enforceGridBounds(entity)` | 614 | Clamp entity to grid bounds | Uses `getHitbox()` if available, fallback to width/height — but if neither exists, defaults to 0 hitbox size; position could go negative in pathological case |
| `resolveTunnelWallOverlap(entity, tunnelData, backgroundObjects)` | 634 | Push entity away from tunnel walls | 2px push per frame is framerate-dependent — at high fps, push is slow; at low fps, jerky. Should be `push * deltaTime`-scaled or use a minimum-penetration approach like `resolveSolidObjectOverlap` |
| `updatePlane(entity, tunnelData)` | 698 | Switch entity plane at tunnel/underground entrances | Uses AABB 60% overlap threshold — correct. Direct `entity.plane = n` writes instead of going through any abstraction |
| `applyAttraction(ingredient, target)` | 818 | Ingredient magnet physics toward target | Uses `inSamePlane` correctly |
| `checkEntityCollision(entity1, entity2)` | 853 | Generic AABB check | Fallbacks to `entity.width` or `CELL_SIZE` — defensive |
| `getDistance(entity1, entity2)` | 875 | Euclidean distance between entity positions | — |
| `checkDebrisPush(debris, majorObjects)` | 882 | Apply push force from moving entities to debris | — |
| `updateDebris(debrisList, majorObjects)` | 901 | Iterate debris for push | — |
| `resolveSolidObjectOverlap(entity, backgroundObjects)` | 912 | 4-pass eject from solid bg objects | 4 passes × O(objects) per entity per frame — potentially expensive; no early plane-based skip before per-object loop |

---

## Collision Coverage Matrix

| Entity Type | collisionMap walls | BG objects | Enemy-enemy | Player-enemy | Projectile-player | Projectile-enemy | Melee-player | Melee-enemy |
|-------------|-------------------|------------|------------|-------------|------------------|-----------------|-------------|------------|
| Player | ✅ | ✅ | via resolveEntityContacts | — | ✅ | — | ✅ | — |
| Enemy | ✅ | ✅ | via resolveEntityContacts (soft) | via resolveEntityContacts | — | — | — | ✅ |
| Ingredient | ✅ | ✅ | ❌ (not tracked) | via applyAttraction | — | — | — | — |
| Item (dropped) | ✅ if hasCollision | ✅ if hasCollision | ❌ | proximity pickup | — | — | — | — |
| Puddle | none (floor object) | — | — | via PhysicsSystem.update waterResults | — | — | — | — |
| Captive | ✅ if hasCollision | ✅ | ❌ | proximity | — | — | — | ❌ (melee does not check captives) |
| NeutralCharacter | ✅ if hasCollision | ✅ | ❌ | proximity | — | — | — | ❌ |
| GooBlob | ✅ | ✅ | ❌ | overlap | — | — | — | ❌ (not in enemies array) |
| Debris | ❌ (has no collisionMap ref) | via checkDebrisPush | — | — | — | — | — | — |

**Missing pairs:**
- Captives and neutral characters are not in the `enemies` array, so melee attacks and projectiles skip them entirely.
- GooBlob is not in `enemies`; it appears in its own array. If player projectiles should damage goo blobs, they currently do not.
- Debris: `updateDebris` only handles push from major objects; debris does not collide with the collisionMap (no `collisionMap` reference on Debris entity).

---

## Interior Physics Handling

- **Hut** (`player.inHut`): collision source is redirected to `hutInterior` collision map; `PhysicsSystem.updateEntity` reads `entity.collisionMap` which is the interior's map — correct if the entity's `collisionMap` reference is swapped on entry.
- **Dungeon** (`player.inHut` reused): same pattern.
- **Maze** (`player.inMaze`): same pattern.
- **Enemy physics inside interior:** enemies' `collisionMap` reference must also be swapped on interior entry. If not (or only player's is swapped), enemies walk through interior walls.
- **CombatSystem interior projectile handling:** `_hitsWall(proj, room)` passes `room` from the `update()` caller. The caller must pass the *interior* room object when the player is inside — if main.js passes the exterior room, interior projectiles escape through walls (this was bug #45, now fixed per known-bugs.md).
- **`isOutOfBounds`** (line 1583) still checks full canvas dimensions (480×480) regardless of interior. Interior projectiles that reach the canvas edge but are still inside interior bounds are incorrectly removed. In practice `_hitsWall` should catch wall collisions first, so this is a latent edge case only.

---

## Knockback / Push-through Bugs

1. **`_applyKnockbackForce` overrides velocity** (PhysicsSystem line 108): sets `entity.velocity.vx = nx * scaledForce` rather than adding to it. A second knockback hit in the same frame replaces the first instead of accumulating. This can cause erratic movement for multi-hit attacks (flail sweep, shockwave ring).

2. **`resolveTunnelWallOverlap` fixed 2px push** (line 662): not scaled by deltaTime. At 120fps this pushes at 240px/sec; at 30fps at 60px/sec. Should use `deltaTime` multiplier or minimum-penetration like `resolveSolidObjectOverlap`.

3. **Knockback into walls:** `_applyKnockbackForce` sets velocity; the next `updateEntity` call moves along that velocity, then `checkCollision` zeros the velocity and `resolveCollisionMapOverlap` ejects. For large forces (300+ px/s), one frame at 16ms = 4.8px movement. A wall cell is 16px wide, so multi-frame tunnelling is unlikely, but not mathematically impossible at extreme knockback values (800+).

4. **Roll damage knockback** (line 1709): directly sets `enemy.velocity.vx/vy = dir.x * 300` — bypasses `_applyKnockbackForce` entirely, ignoring `knockbackResistance`. Boss-resistant enemies can be knocked back by rolls.

---

## Bugs & Logic Errors

| # | Severity | Location | Description |
|---|----------|----------|-------------|
| B1 | P1 | `createSplitProjectiles` (line 1957) | Split projectiles inherit none of: `onHit`, `knockback`, `pierce`, `lifesteal`, `chain`, `explode`, `owner`, `plane`, `shooterPlane`. A fire gun shooting split rounds produces inert bullets with no burn. |
| B2 | P1 | `clear()` (line 2013) | 8 arrays not cleared on room change: `pendingEnemyProjectiles`, `pendingMeleeAttacks`, `aoeEffects`, `shockwaveEvents`, `chainArcs`, `polymorphEvents`, `impactEffects`, `newSteamClouds`, `objectDestroyEvents`. Stale events from a dead room can fire in the new room. `objectDestroyEvents` is most dangerous — it can trigger loot drops in the wrong room. |
| B3 | P1 | Staff block vs tongue (line 1355) | `tongue.phase === 'extending'` collision check at full extension does not check `player.isStaffBlocking`. Tongue pierces the staff block. |
| B4 | P1 | Staff block vs sap (line 1200) | Sap damage from enemy `updateResult.sapDamage` is applied directly to the player with no staff block or shield check. |
| B5 | P2 | `_applyCritIfLucky` (line 1989) | `isLucky` is `critChance > 0` at the time of reading — even if only the weapon provides critChance and the player has no Lucky Coin/well bonus. Result: "LUCKY CRIT" label can appear when the weapon alone has a crit chance, misleading the player. |
| B6 | P2 | `cancelPendingAttacksFrom` (line 2052) | Only cancels `pendingEnemyProjectiles`. Does not cancel `pendingMeleeAttacks`. A melee enemy that dies during windup leaves an orphaned pending melee attack referencing the dead owner. |
| B7 | P2 | `checkRicochet` (line 1553) | Ricochet projectiles only bounce at canvas edges; they do not check `room.collisionMap`. A ricochet bullet can pass through interior wall cells. |
| B8 | P2 | Homing (line 110) | No plane filter on homing target selection. Homing missiles will steer toward enemies on the wrong plane (underground enemies visible to surface bullets). |
| B9 | P2 | `createChainLightning` (line 1808) | No plane filter. Chain lightning arcs jump to enemies on the wrong plane in U rooms. |
| B10 | P2 | `createExplosion` (line 1892) | No plane filter on enemies or bg objects. Explosions damage cross-plane enemies. |
| B11 | P2 | `applyAOEStatus` / `checkProximity` (lines 1877, 1857) | No plane filter. Wand AOE effects apply to cross-plane enemies. |
| B12 | P2 | `updateRollDamage` (line 1700) | No plane filter on enemy iteration. Red Warrior roll damages enemies on the wrong plane in U rooms. |
| B13 | P2 | `conductElectricity` (line 2098) | No plane filter. Electric conduction can zap underground enemies from surface electric hit. |
| B14 | P2 | Arrow stuck-to-enemy with no lifetime (line 533) | Enemy-stuck arrows have no `lifetime` field set. If enemy never dies (e.g. invulnerable sub-boss phase), arrow never expires and accumulates. |
| B15 | P2 | `checkProjectileCollisionWithPlayer` centering offset (line 1649) | Offset formula `(GRID.CELL_SIZE - hw) / 2` produces negative offset for oversized projectiles (e.g. boss AOE hitboxes with `width > CELL_SIZE`), expanding hitbox incorrectly. |
| B16 | P2 | `wandProximityFailures` lazy init (line 74) | Initialized to `[]` inside `update()` if falsy, not in constructor. On the very first frame before first update, accessing `this.wandProximityFailures` from a renderer would return `undefined`. |
| B17 | P2 | Roll damage ignores `knockbackResistance` (line 1709) | Direct `enemy.velocity` assignment bypasses `_applyKnockbackForce` resistance scaling. |
| B18 | P1 | `resolveTunnelWallOverlap` not deltaTime-scaled (line 662) | Fixed 2px push per frame — framerate-dependent. At 30fps tunnels push half as hard as at 60fps; at high refresh rates (120hz) entities are pushed faster and may oscillate. |
| B19 | P2 | Reflected enemy projectile zombie (line 934) | `reflected = true` projectiles skip player collision but no other removal condition is added. They travel until OOB or wall. If their trajectory does not exit the room (e.g. bounces off wall), they can accumulate as permanent zombie projectiles consuming update cycles indefinitely. |

---

## Missing Null Checks

| Location | Line | Risk |
|----------|------|------|
| `stuckArrow.stuckTo.hp` | 1286 | `stuckTo` could be null if code elsewhere nulls it mid-frame; would throw |
| `checkMeleeCollision` — `attack.width/height` | 1525 | If undefined, AABB comparison produces NaN (always false) — silent miss, not a crash |
| `checkMeleeCollisionWithObject` — `attack.width/height` | 1541 | Same |
| `enemy.update(dt)` return value | 1190 | `updateResult` is read at lines 1193, 1201 with `if (updateResult && ...)` — guarded; correct |
| `createEnemyAttack` single-object path | 1631 | No check for `attackData.type`; if undefined, data gets pushed to `enemyProjectiles` silently as a non-projectile object |
| `applyImpulse` — `entity.velocity` | 73 | No guard; will throw if entity has no velocity object (e.g. bg objects passed inadvertently) |
| `_applyCritIfLucky` `owner.quickSlots[owner.activeSlotIndex]` | 1991 | `quickSlots` could be sparse (undefined slot); `activeWeapon?.data?.critChance` correctly optional-chains — safe |

---

## Cross-Reference Notes

- **Known-bug #27** (U room projectiles/melee collide across both planes) was fixed by adding `_isObjectOnPlane` and `objectOnPlane` calls to bg-object loops. However, **enemy iteration** loops in `createExplosion`, `createChainLightning`, `applyAOEStatus`, `checkProximity`, `updateRollDamage`, and `conductElectricity` were **not** updated. These are new plane-violation instances that did not exist in the bug's scope.

- **Known-bug #45** (interior projectiles escape walls) was fixed by `_hitsWall`. The fix is solid but the single-point check (top-left corner of projectile) means a fast projectile moving more than one cell per frame can skip a one-cell-wide wall. This is unlikely at current speeds but theoretically possible.

- **CLAUDE.md staff block description** ("deflects enemy projectiles") does not match the code. The code **absorbs** (removes) the projectile — it does not create a reflected counter-projectile. This is a documentation-code discrepancy.

- **CLAUDE.md hammer description** says "instant kill effect" — the code does `totalDamage *= 2.5`. Not an instant kill. Documentation overstates the effect.

- **`PhysicsSystem.resolveEntityContacts`** correctly uses `inSamePlane` (line 90) — one of the few places where the canonical PlaneSystem predicate is used for entity-entity contact.

- **`PhysicsSystem.updateEntity` mud detection** uses dual-path: `typeId`-based (new) and legacy `isDryMud`/`slowing` flags (old). Both must be maintained in parallel unless all mud objects are migrated to `typeId`. This is a maintenance fragility — any new mud variant must be added to both branches.

- **`enforceGridBounds`** (line 614): if `entity.getHitbox` returns `{width: 0, height: 0}` (degenerate entity), bounds are clamped as if the entity has zero size; position `x + 0 > GRID.WIDTH` fires at pixel 480 which is correct, but the entity's actual rendered size is not accounted for.
