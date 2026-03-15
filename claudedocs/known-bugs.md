# Known Bugs

Review this list at the start of every session. Mark items resolved with a date when fixed.

---

## P1 — Confirmed Broken

| # | Bug | Source | Status |
|---|-----|--------|--------|
| 1 | **REST area "SPACE or SHIFT" indicator missing** — hover text over player in REST hub was accidentally removed; should prompt space/shift for attack/drop | devlog v0.3→v0.4 | ✅ fixed |
| 2 | **Slime suit protection not applying** — player was inhibited by goo while slime suit was equipped; protection effect not being checked on movement/dodge | devlog v0.3→v0.4 | ✅ fixed — `applyEquipmentEffectsToPlayer` was reading all armor props from `item` instead of `item.data`; defense, immunities, speed mods were all silently failing |
| 3 | **Inventory parity display bug** — fishing pole and bow both appeared simultaneously in the equipment display after weapon swapping | devlog v0.3→v0.4 | ✅ fixed — chest retrieve and chest store in `MenuSystem.js` mutated `quickSlots` without calling `markBackgroundDirty()`; background canvas cached the old item while foreground drew the new one |
| 4 | **Gap/collision regression from canvas resize** — player could no longer squeeze through previously passable gaps; likely collision/hitbox scaling broke during recent resize | devlog v0.3→v0.4 | ✅ fixed |
| 5 | **Tunnel room rendering artifacts** — duplicate rendering and wrong-scale tunnel walls caused by `bgCtx.drawImage(fgCanvas, 0, 0)` during background pass: (a) fgCanvas.width is in physical pixels so the DPR scale transform doubles the drawn size, (b) fgCanvas still holds the previous frame's foreground content at that point, ghosting entities onto the bg layer | devlog v0.3→v0.4 | ✅ fixed — moved tunnel wall rendering entirely to foreground pass using `drawEntityDithered`; removed cross-canvas copy hack |
| 6 | **Consumable particles show "UNDEFINED"** — when consumables trigger, particle text renders the string "UNDEFINED" instead of the effect name or value | devlog v0.3→v0.4 | ✅ fixed |
| 13 | **Entering REST does not clear EXPLORE entities** — goo blobs, particles, and other EXPLORE-spawned entities are not flushed on REST entry; they can persist visually or linger in physics system | parity review 2026-03-09 | ✅ fixed — added `particles`, `gooBlobs`, `steamClouds`, `debris`, `captives`, `neutralCharacters` clears to `enterRestState()` |
| 14 | **Goo blobs rendered twice per frame in EXPLORE** — `ExploreRenderer.renderForeground()` has two identical loops over `game.gooBlobs`; same char/color/alpha/scale drawn twice, making goo appear at near-double opacity | parity review 2026-03-09 | ✅ fixed — removed duplicate loop after particles; kept ground-layer render before enemies |
| 15 | **Path Amulet announcement never visible** — the amulet tracks zone path history and is only meaningful in EXPLORE (where zones exist), but rendering is only implemented in `RestRenderer`; `ExploreRenderer` has no code for `game.pathAnnouncement`, so the display is always dropped at the one moment it matters | parity review 2026-03-09 | open |
| 16 | **Wall tiles do not block enemy vision** — `hasVision()` in `Enemy.js` uses `hasLineOfSight()` which only samples the collision map (room walls), but `getVisionObstructionPoint()` also checks background objects (trees, boulders, etc.). The aggro / memory system calls `hasVision()` so solid wall tiles between enemy and player do NOT prevent detection. Background objects block vision correctly. Fix: unify `hasVision` ray-sampling to use the same background-object check as `getVisionObstructionPoint`. | devlog 2026-03-09 | ✅ fixed — `hasVision()` now checks both collision map and background objects |
| 17 | **Plane-switch memory mark bugs** — When an aggroed enemy is chasing the player and the player switches planes (via `^` or equivalent), the system creates a memory mark at the player's *current* position instead of at the *destination* entry point; the enemy stops at the portal rather than following through. Conversely, if a memory mark already exists when the player switches planes, it should expire quickly (brief timer) since the player has left that plane — currently it persists at full duration, keeping the enemy searching the wrong plane indefinitely. | devlog 2026-03-13 | ✅ fixed — (1) lost-vision mark projected 3 cells past the entrance when player switched planes, so the enemy follows through; (2) `memoryMarkPlane` tracked at mark creation; stale timer ticks when player's plane diverges and expires the mark after 2 s |

---

## P2 — Balance / Missing Implementations

| # | Issue | Source | Status |
|---|-------|--------|--------|
| 7 | **Slime entity count not capped** — goo puddles are capped but spawned slime entities are not; large slimes can flood the room | devlog v0.3→v0.4 | ✅ fixed — spawn requests are skipped when `currentRoom.enemies.length >= 10` |
| 8 | **Flail attack speed too high** — continuous attack while holding down is noted as potentially OP; needs a rate cap | devlog v0.3→v0.4 | open |
| 9 | **Skeletons too easy** — need a difficulty pass; possibly a new attack or increased aggro range | devlog v0.3→v0.4 | open |
| 10 | **Blunt weapons don't break rocks** — flail and other blunt weapons should be able to break rocks; not yet coded | devlog v0.3→v0.4 | open |
| 11 | **Yellow zone content incomplete** — zone exists in progression system and color-coded exits route there, but content/enemies not fully implemented | devlog v0.3→v0.4 | open |
| 12 | **Consumable slot unlock conditions undefined** — additional equipment slots are visible but no mechanism exists for earning them | devlog v0.3→v0.4 | ✅ fixed — B-A-T secret room (Bat Belfry) clears to unlock slot 3; `InventorySystem.maxConsumableSlots` drives the rest |

---

## Resolved

| # | Bug | Resolution |
|---|-----|------------|
| 1 | REST area "SPACE or SHIFT" indicator missing | ✅ fixed — 2026-03-09 |
| 2 | Slime suit protection not applying | ✅ fixed — `applyEquipmentEffectsToPlayer` reading from `item` instead of `item.data` |
| 3 | Inventory parity display bug (fishing pole + bow shown simultaneously) | ✅ fixed — `MenuSystem.js` chest store/retrieve not calling `markBackgroundDirty()` |
| 6 | Consumable particles show "UNDEFINED" | ✅ fixed — `_triggerConsumable`, `_createExplosion`, `_createSparkBurst` in `InventorySystem.js` all pushed plain particle objects without a `.char` property; `ctx.fillText(undefined, ...)` rendered the string "undefined" |
