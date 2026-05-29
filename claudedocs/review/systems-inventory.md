## INVENTORY & UI SYSTEMS REVIEW

> Reviewed: InventorySystem.js (~1382 lines), LootSystem.js (87 lines), CraftingSystem.js (157 lines), MenuSystem.js (865 lines)
> Date: 2026-05-15

---

### InventorySystem.js — Method Catalog

| Method | Line | Purpose | Issues |
|--------|------|---------|--------|
| `constructor()` | 17 | Initializes all inventory state, legacy pointer aliases | Legacy aliases `restInventory`, `restQuickSlots`, `restActiveSlotIndex` are plain values after construction — they desync when `setActiveCharacter()` is called and the pointer-copy model is used |
| `getRestInventory()` | 74 | Returns `this.restInventory` ref | Safe; returns array reference, not a copy |
| `getRestQuickSlots()` | 79 | Returns `this.restQuickSlots` ref | Same |
| `getRestActiveSlotIndex()` | 83 | Returns scalar | Scalar copy, always stale after `bankLoot()` writes |
| `getArmorInventory()` | 86 | Returns explore armor array | |
| `getConsumableInventory()` | 90 | Returns explore consumable array | |
| `getEquippedArmor()` | 94 | Returns single armor slot | |
| `getEquippedConsumables()` | 98 | Returns 2-5 element array | |
| `getItemChest()` | 102 | Returns chest array | |
| `getSpentConsumableSlots()` | 106 | Returns booleans array | |
| `getConsumableCooldowns()` | 110 | Returns cooldown timers array | |
| `getConsumableFlashTimer()` | 114 | Returns flash timer scalar | |
| `getConsumableFlashSlot()` | 118 | Returns flash slot index | |
| `getConsumableWindups()` | 122 | Returns active windups array | |
| `getSavedExploreRoom()` | 126 | Returns saved room ref | |
| `setActiveCharacter(type)` | 138 | Switches character inventory context, updates legacy aliases | **Bug**: assigns `restActiveSlotIndex` from `characterInventories[type].activeSlotIndex`, but `bankLoot()` at line 1224 writes to `this.restActiveSlotIndex` (the flat scalar), NOT back into `characterInventories[type].activeSlotIndex`. The character's saved active index is never updated after the first bank. |
| `getCharacterInventory(type)` | 160 | Returns raw character data object | Returns internal mutable reference — callers can mutate directly |
| `clearAllCharacterInventories()` | 170 | Resets all character data on game over | Correct; calls `setActiveCharacter('default')` |
| `tryPickupItem(items, placedTraps, player, physicsSystem)` | 195 | Routes item pickup to correct sub-inventory | **Bug**: method returns before the final return block for BLESSING and NEUTRAL types, but for NEUTRAL uses `item.data.name` as the message even though these are meant to be lore-only flavor — same message logic as functional items |
| `openEquipmentMenu(slotType)` | 272 | Builds deduplicated item list for equipment menu | Deduplication by `.char` field means two physically different items with the same char are shown as one entry; equipping via menu always picks the first reference in the array |
| `unlockConsumableSlot()` | 298 | Expands consumable slots up to max 5 | Correct |
| `equipArmor(selectedItem)` | 313 | Swaps armor slot; returns previous armor | Correct; old armor pushed to `armorInventory` before new one removed |
| `equipConsumable(slotIndex, selectedItem)` | 339 | Swaps consumable slot at index; returns previous | Correct; resets `spentConsumableSlots[i]` and `consumableCooldowns[i]` on equip |
| `applyEquipmentEffectsToPlayer(player)` | 369 | Resets player stats then re-applies from armor data | Iterates `equippedConsumables` for luck passive; but reads from `this.equippedConsumables`, not `player.equippedConsumables` — these can diverge |
| `update(dt, player, currentRoom, combatSystem, steamClouds, particles)` | 455 | Main consumable tick: cooldowns → flash → activation → windups → robe aura | |
| `_updateRobeAura(dt, player, currentRoom, particles)` | 472 | Particle emission and roll-pulse logic for elemental robes | `player._auraRollPulseUsed` is never reset between rooms — the pulse fires once per run (not once per room), despite the comment saying "once per room" |
| `_makeAuraParticle(cx, cy, type)` | 530 | Factory for aura particles | Returns `null` for unknown types, silently dropped |
| `updateConsumableCooldowns(dt)` | 625 | Ticks down reusable consumable cooldown timers | |
| `updateConsumableFlash(dt)` | 637 | Ticks flash/blink animation state | Uses `Math.max(0, ...)` which can create exact-zero float — the equality check `=== 0` is safe here due to `Math.max` |
| `checkConsumableActivation(player, currentRoom, combatSystem, steamClouds, particles)` | 667 | Checks and fires auto-trigger for each equipped consumable slot | **Bug**: Reads from `player.equippedConsumables` (copy set by `applyEquipmentEffectsToPlayer`), which can be stale if equip happens without re-applying effects. Also: `steamClouds` guard in `invuln` branch reassigns local variable, not caller's array — `if (!steamClouds) steamClouds = [];` has no effect on the passed-in reference. |
| `_checkTriggerCondition(cd, player, currentRoom, steamClouds)` | 706 | Per-effect trigger logic | See detailed analysis below |
| `_triggerConsumable(slotIndex, consumable, triggerData, player, combatSystem, particles)` | 946 | Fires instant or starts windup | Instant path leaves `player.position.y - 20 * 0.5` — precedence correct (`-10`), but a magic number |
| `updateConsumableWindups(dt, player, currentRoom, combatSystem, steamClouds, particles)` | 1021 | Iterates windups backwards, fires on timer expire | Safe iteration (reverse) |
| `_executeWindupEffect(windup, enemies, combatSystem, steamClouds, particles)` | 1041 | Dispatches effect by type on windup completion | `throwSteam` branch: `if (!steamClouds) steamClouds = [];` same null-reassignment bug as above |
| `_createExplosion(particles, x, y, count, color)` | 1166 | Spawns burst particles | |
| `_createSparkBurst(particles, x, y)` | 1188 | Spawns firecracker spark particles | |
| `bankLoot(playerInventory, playerQuickSlots, playerActiveSlotIndex)` | 1216 | Transfers player run inventory to character's REST inventory | **Bug**: `restActiveSlotIndex` updated as flat scalar (line 1224) but `characterInventories[type].activeSlotIndex` is never updated; on next `setActiveCharacter()` call for the same character the old index is restored |
| `handleGameOver()` | 1232 | Clears all inventory state on death | Correct; calls `clearAllCharacterInventories()` + resets all arrays |
| `saveExploreRoom(...)` | 1274 | Shallow-copies room state to prevent room-cycling cheat | |
| `getSavedExploreRoomData()` | 1290 | Returns copies of saved room arrays | |
| `clearSavedExploreRoom()` | 1307 | Nullifies saved room | |
| `saveRestIngredients(ingredients)` | 1324 | Saves REST-mode ground items | |
| `getSavedRestIngredients()` | 1333 | Returns copy | |
| `clearSavedRestIngredients()` | 1340 | Empties saved list | |
| `addToChest(item)` | 1351 | Pushes item to `itemChest` | No cap; chest is unbounded |
| `retrieveFromChest(item)` | 1361 | Removes item by reference equality | |
| `getChestContents()` | 1375 | Returns menu option objects referencing chest items | |

---

### Inventory Slot Management Analysis

**Quick slots (weapons/traps):** Three slots max. `Player.pickupItem()` finds first empty non-destroyed slot; if full, swaps with the current active slot. The dropped item is returned to the caller (`tryPickupItem`), which returns it in `droppedItem`. The caller in `main.js` then drops it to the ground — this chain is correct.

**No overflow protection for armor/consumable inventories:** `armorInventory` and `consumableInventory` are plain arrays with no cap. Items are always pushed regardless of inventory size. There is no "inventory full" feedback for these types; players may accumulate arbitrarily many.

**Ingredient inventory:** Stored in `player.inventory` as a char array (strings). No overflow cap exists there either.

**Chest:** No cap on `itemChest`. Unbounded growth possible in long sessions.

**Off-by-one risk:** None observed. `splice(i, 1)` inside `tryPickupItem`'s loop iterates with `for (let i = 0; i < items.length; i++)` and returns immediately after removing, so post-splice index shift is avoided.

**Deduplication in `openEquipmentMenu`:** Deduplication by `char` field (line 279, 285) means if two items share the same char but are distinct objects (e.g., two Health Potions dropped at different times), only the first is shown in the menu. Equipping via menu calls `indexOf(selectedItem)`, which finds the first reference — the second copy remains stuck in `armorInventory`/`consumableInventory` and is never accessible through the menu. This isn't a duplication exploit, but it is unreachable inventory.

---

### Quick Slot Persistence Mechanism

**How it works (no localStorage):** On returning south to REST, `bankLoot()` is called, which copies `player.quickSlots` (reference array) into `this.restQuickSlots` via `length = 0; push(...playerQuickSlots)`. On death, `handleGameOver()` calls `clearAllCharacterInventories()`, which replaces the arrays entirely.

**Persistence survives death because** `handleGameOver()` is only called on game-over (die in EXPLORE), not on a normal REST→EXPLORE→REST round-trip. `restQuickSlots` and `restInventory` (ingredients) are NOT cleared on death — only on game over. This is correct per design.

**Bug — activeSlotIndex desync:** `bankLoot()` updates `this.restActiveSlotIndex` (line 1224) but never writes back to `this.characterInventories[activeType].activeSlotIndex`. `setActiveCharacter()` later reads the stale value from `characterInventories`, not from `restActiveSlotIndex`. So after one REST→EXPLORE→REST cycle with a different active slot, re-entering REST will restore the OLD slot index, not the one the player was on when they left. (The `main.js` lines 4736, 4776, and 5674-5677 sanitize it in some paths, but those are partial fixes for edge cases, not a solution to the underlying model.)

---

### Consumable Auto-Trigger Analysis

**All handled effects:**

| Effect | Trigger condition | One-shot? | Double-trigger guard |
|--------|-----------------|-----------|----------------------|
| `heal` | HP < threshold (0.20–0.50 based on item) | Yes | `spentConsumableSlots[i]` + cooldown |
| `maxhp` (Dragon Heart) | Always on first frame | Yes | `spentConsumableSlots[i]` |
| `speed` (Haste Draught) | HP < 0.40 | Yes | `spentConsumableSlots[i]` |
| `cleanse` (Tonic) | `burnDuration > 0 \|\| wetDuration > 0` | No | cooldown (8s) |
| `block` (Metal Block) | HP < 0.50 | No | cooldown (15s) |
| `invuln` (Smoke Bomb) | HP < 0.25 | No | cooldown (25s) |
| `shield` / `bulwark` | `shieldMaxCharges === 0` | No | `shieldMaxCharges` guard |
| `waterImmunity` | Always | No | cooldown (30s) |
| `float` | Always | No | cooldown (20s) |
| `regen` | HP < 0.50 | Yes | `spentConsumableSlots[i]` |
| `stoneskin` | HP < 0.35 OR ≥2 nearby enemies | Yes | `spentConsumableSlots[i]` |
| `damageBuff` (Battle Elixir) | Nearest enemy within 80px | Yes | `spentConsumableSlots[i]` |
| `explode` (Bomb) | Nearest enemy ≤60px | Yes | `spentConsumableSlots[i]` + windup guard |
| `curse` (Cursed Skull) | ≥3 enemies within 80px | Yes | `spentConsumableSlots[i]` + windup guard |
| `slow` | Nearest enemy ≤50px | No | cooldown + windup guard |
| `poison` (Poison Flask) | Nearest enemy ≤55px | No | cooldown + windup guard |
| `venomcloud` (Venom Vial) | ≥2 enemies within 60px | No | cooldown + windup guard |
| `jolt` (Jolt Jar) | ≥2 enemies in room | No | cooldown + windup guard |
| `throwSteam` (Steam Vial) | **Always fires** — no condition check | No | cooldown + windup guard |
| `firecracker` | Nearest enemy ≤50px | Yes | `spentConsumableSlots[i]` + windup guard |
| `luck` | Never auto-fires (passive) | No | explicit `return false` |
| `oilEffect` | Never auto-fires (passive) | No | explicit `continue` |

**Effects defined in items.js but NOT handled in `_checkTriggerCondition`:**

| Effect | Item | Risk |
|--------|------|------|
| `auto_dodge` | Fur Cloak (ᐤ) | Falls through to `default: return false` — never activates. Item is dead. |
| `panic_blind` | Bone Dust (ᐧ) | Same — falls through `default`, never activates. Item is dead. |
| `pathTracker` | Path Amulet (o) | Passive handled in `main.js` renderer (line 1357); correctly skipped by auto-trigger. |
| `revive` | Phoenix Feather (✦) | Handled by direct death check in `main.js` (line 3890); correctly skipped here. |
| `platform` | Platform (=) | No auto-trigger path at all; no `default` handler — silently drops. |
| `wellOffering` | Infused Coin (¤) | Handled by WellSystem; should never reach auto-trigger. |

**Double-trigger risk:**
- `waterImmunity` and `float` (Rubber Boots, Floating Boots): both are reusable with cooldowns, but when triggered they unconditionally overwrite `player.waterImmunityTimer = cd.duration` (line 883) and `player.floatTimer = cd.duration` (line 888) — no `Math.max` guard. If triggered with time still remaining, they reset the timer rather than extending it. Minor regression but not exploitable.
- `steamCloud / invuln` local re-assignment: `if (!steamClouds) steamClouds = [];` at lines 825 and 1138 re-binds the local variable but cannot affect the caller's array reference. If `steamClouds` is genuinely null/undefined at call site, the steam cloud is silently dropped.
- No double-trigger on windup items: `consumableWindups.some(w => w.slotIndex === i)` (line 679) correctly blocks re-entry while a windup for that slot is active.

**throwSteam unconditional trigger (Bug):** `case 'throwSteam'` in `_checkTriggerCondition` returns `{ windup: 0.6 }` without any condition check. The Steam Vial will immediately begin a windup on the first frame it becomes active, every cooldown cycle, regardless of context. This is almost certainly unintentional — there is no proximity requirement.

---

### LootSystem.js — Method Catalog

| Method | Line | Purpose | Issues |
|--------|------|---------|--------|
| `constructor(game)` | 7 | Stores game reference | |
| `spawnLoot(enemy)` | 11 | Rolls drops for a dead enemy and spawns them | See analysis below |
| `spawnIngredientDrop(char, x, y, angle, source)` | 59 | Creates an Ingredient entity with velocity | |
| `spawnItemDrop(char, x, y, angle, source)` | 74 | Creates an Item entity with velocity | |

---

### Drop Table Selection Analysis

**Two code paths, inconsistent luck application:**

1. **Affinity/tier path** (lines 23–36): Used when enemy has `affinities` or `dropTable` + `tier`/`rarityProfile`. Calls `generateEnemyDrops()` which uses random category weights (77% ingredients, 10% consumables, 5% weapons, 5% traps, 3% armor). **`luckMult` is not applied here** — it only affects the `bonusChance` for an extra drop. Enemy definitions using the new affinity system get no luck scaling on per-drop probabilities.

2. **Legacy `drops` array path** (lines 37–44): Used when enemy has explicit `drops: [{ char, chance }]`. `luckMult` IS applied to `drop.chance` here. This creates asymmetric luck behavior based on which drop system the enemy uses.

**Bug — `bonusDrop` fallback:** Line 32 calls `generateEnemyDrops(enemy.data.dropTable, enemy.data.rarityProfile, 1)`. If the enemy uses `affinities` instead of `dropTable`, `enemy.data.dropTable` is undefined, causing `generateEnemyDrops` to receive `undefined` as the affinity. The function normalizes `undefined` to `[undefined].filter(Boolean)` which resolves to `[]` and returns an empty array — so the bonus drop silently fails for affinity-based enemies.

**Item vs. ingredient dispatch:** `isIngredient(drop)` and `isItem(drop)` from `items.js` correctly route by char encoding. Items that are neither (unknown chars) are silently discarded (no else branch).

**Spawn position:** Items spawn at the enemy's exact position with a random velocity kick. No collision-free placement — items CAN land inside walls if the enemy dies near a wall. The velocity kick typically moves them clear, but it is not guaranteed.

**Pickup cooldown:** `spawnIngredientDrop` sets `ingredient.pickupCooldown = 0.75` (line 62). `spawnItemDrop` does NOT set `pickupReadyAt` — items dropped from enemies are immediately pickable. The `pickupReadyAt` mechanism exists in `InventorySystem.tryPickupItem` (checked at line 204) but is only set by `TrapSystem` (line 231) and `CampNPCSystem` (line 395). Ingredient `pickupCooldown` appears to be a different field from `pickupReadyAt` and the two systems are not the same mechanism — potential confusion.

---

### CraftingSystem.js — Method Catalog

| Method | Line | Purpose | Issues |
|--------|------|---------|--------|
| `getNextTierPool(char)` | 9 | Returns next weapon tier pool for upgrade crafting | Module-level helper; iterates `WEAPON_TIERS` |
| `constructor()` | 23 | Initializes slot state and discovery maps | |
| `setLeftSlot(item)` | 32 | Sets left slot char, triggers `updateCrafting` | Parameter named `item` but stores a char string |
| `setRightSlot(item)` | 37 | Sets right slot char, triggers `updateCrafting` | Same |
| `clearLeftSlot()` | 42 | Clears left slot, cancels cycling, returns old char | |
| `clearRightSlot()` | 50 | Same for right | |
| `clearCenterSlot()` | 58 | Returns and clears center slot | Does NOT cancel cycling — if cycleState is active, `hasCenterContent()` still returns true even after center clear |
| `_cancelCycling()` | 64 | Nullifies `cycleState` | |
| `updateCrafting()` | 68 | Recomputes center from left + right | |
| `getIdentifiedPartners(char)` | 106 | Returns Set of chars that successfully combine | |
| `getFailedPartners(char)` | 110 | Returns Set of chars that failed to combine | |
| `resetDiscoveries()` | 114 | Clears both maps | Called on game over? Not confirmed. |
| `hasCenterContent()` | 119 | Returns true if center has result or cycling active | |
| `claimCraftedItem(x, y)` | 123 | Creates the result Item, clears all slots | |
| `getState()` | 142 | Returns current slot state for serialization | |
| `setState(state)` | 151 | Restores slot state (cycleState not restored) | |

---

### Recipe Matching Analysis

**Bidirectional:** `findRecipe(left, right)` tries `(left, right)` then `(right, left)` — fully bidirectional. Correct.

**Case-sensitive:** Char comparisons use `===` directly on strings. Recipe chars like `'M'`, `'F'`, `'b'` are case-sensitive. This is correct and consistent with the rest of the system.

**Unknown chars:** If `leftSlot` or `rightSlot` contains a char not in `RECIPES` and not equal to each other (for upgrade), the `failedPairs` map records the combination and no crash occurs. Correct.

**Full inventory handling:** `claimCraftedItem()` returns the new `Item` object. `MenuSystem.handleCraftingSlotClaim()` then routes the item to `armorInventory.push()`, `consumableInventory.push()`, or `player.pickupItem()`. The armor and consumable paths have no overflow guard — they always push. The weapon path via `player.pickupItem()` returns a displaced item; if displaced, it goes to `inventorySystem.addToChest()`. The chest also has no cap. So full inventory is never blocked; items always land somewhere.

**Legacy letter-char crafted items handled correctly:** `RECIPES` contains entries like `'O'` (Slime Suit), `'A'` (Bone Armor), `'H'` (Health Potion), etc. `findRecipe` has no special handling — these work identically to Unicode-char items. No bug introduced by legacy chars.

**Duplicate weapon upgrade check (line 87):** `this.leftSlot === this.rightSlot` uses `===` on strings (char chars). Since both slots store char strings (not Item objects), this is a VALUE comparison, which is correct. Both slots containing `'†'` will correctly match.

**`clearCenterSlot` does not cancel cycling (Bug):** If `cycleState` is active and `clearCenterSlot()` is called (e.g., by some external path), `cycleState` remains set. `hasCenterContent()` returns `true`, but `centerSlot` is null. If `claimCraftedItem` is then called, it reads `this.cycleState` first and will produce an item from the cycle pool even though the caller may have expected the center to be empty. In practice, `clearCenterSlot` is only called from `handleCraftingSlotClaim` in the occupied-center path which calls `claimCraftedItem` immediately, so this appears to be low risk in the current code but is a latent bug.

**`discoveredPairs` / `failedPairs` never reset during a run:** `resetDiscoveries()` exists but is not called on death or game over in the reviewed code. Between-run discoveries from a previous life persist into the new run. This may be intentional (knowledge carries over) or a bug depending on design intent — the CLAUDE.md mentions no explicit policy on this.

**`setState` ignores `cycleState`:** Correct; cycleState is transient per the comment.

---

### MenuSystem.js — Method Catalog

| Method | Line | Purpose | Issues |
|--------|------|---------|--------|
| `constructor(game)` | 7 | Stores ref; sets `closeOnMovement = false` | |
| `checkMovementExit(keys)` | 16 | Returns true and resets flag if movement key held | |
| `getSlotPixelPos(slot)` | 26 | Converts slot grid position to pixel center | |
| `triggerSlotPopup(slot)` | 36 | Starts popup animation, routes to open action | `consumableAction` closure captures `idx` at construction time via IIFE — correct |
| `triggerTombstonePopup()` | 87 | Opens tombstone popup, sets movement-exit flag | |
| `closeTombstonePopup()` | 93 | Closes popup | |
| `updateTombstonePopup(dt)` | 99 | Advances popup animation, handles movement exit | |
| `updateSlotPopup(dt)` | 116 | Advances slot popup animation; opens menu at phase 2 | |
| `getNearestInteractiveSlot()` | 132 | Finds nearest slot within 1.5 grid units | Only includes consumable slots 3–5 when `maxConsumableSlots > 2`; `triggerSlotPopup` action map always includes them; mismatch if player somehow reaches those slots without unlocking |
| `showPickupMessage(itemName)` | 179 | Queues pickup message | Always uppercases; correct |
| `showNextPickupMessage()` | 190 | Dequeues and displays next message | |
| `updateUI()` | 201 | Refreshes all HUD elements (HP, depth, slots, armor, consumables) | Inventory count at line 208 excludes equipped armor and equipped consumables — see analysis |
| `_openSlotMenu()` | 322 | Sets `closeOnMovement = true` | All equipment/chest menus set this; crafting menus do NOT — intentional? |
| `openEquipmentMenu(slotType)` | 326 | Opens armor/consumable equipment menu | |
| `openManaConversionMenu(slotIdx)` | 340 | Opens mana conversion menu (WellSystem) | Phase 1 hardcodes `['g']` as available ingredients |
| `openChestRetrievalMenu(slotIdx)` | 376 | Opens chest retrieval menu | |
| `openCraftingMenu(slotType)` | 388 | Builds 3-4 column crafting menu with dedup | |
| `closeMenu()` | 484 | Clears menu state on `game` object | See analysis — `selectedMenuIndex`, `selectedColumn`, `chestTargetSlot`, `menuItems` are NOT cleared |
| `selectMenuItem()` | 498 | Dispatches selection to correct handler | `consumable4` and `consumable5` slots have no handler — falls off end |
| `handleCenterSlotSelection(selectedItem)` | 662 | Places item into center crafting slot via reverse recipe lookup | |
| `handleCraftingSlotClaim(slotType)` | 709 | Claim/clear crafting slot interactions | |
| `_returnSlotItemToInventory(char)` | 767 | Routes cleared crafting slot char back to inventory | |
| `handleChestStore(slotIdx)` | 785 | Stores quick slot item in chest | |
| `handleCraftingSlotPlace(slotType)` | 806 | Places held item into crafting slot (SHIFT-press) | |
| `_manaFillChar(current, max)` | 853 | Module-level helper; renders mana bar block char | |
| `_manaFillColor(current, max)` | 860 | Module-level helper; returns mana bar color | |

---

### Menu State Management

`closeMenu()` clears these fields on `game`:
`menuOpen`, `currentMenuSlot`, `menuColumns`, `disabledColumns`, `identifiedMenuItems`, `failedMenuItems`, `ingredientCounts`, `equippedMenuItems`, `manaConversionSlot`

**NOT cleared by `closeMenu()`:**
- `game.selectedMenuIndex` — retains last cursor position; reset to 0 on every `openXxxMenu()` call, so harmless in practice
- `game.selectedColumn` — retains last column; reset on every `openCraftingMenu()` call, harmless
- `game.menuItems` — retains stale item array; not read after `menuOpen = false` because `selectMenuItem()` guards on `game.menuOpen`
- `game.chestTargetSlot` — **actual bug**: set in `openChestRetrievalMenu()` (line 380), never cleared in `closeMenu()`. If player re-opens a non-chest menu after a chest interaction, `game.chestTargetSlot` still has the old value. Inside `selectMenuItem()`, the `chest` handler reads `game.chestTargetSlot` directly, so a stale value is only dangerous if `game.currentMenuSlot === 'chest'` — but since `currentMenuSlot` IS cleared in `closeMenu()`, this is not currently reachable. Still a latent leak.

**`closeMenu` is called two ways:**
- `this.menuSystem.closeMenu()` (via `game.closeMenu()`) — goes through `MenuSystem.closeMenu()`
- `game.closeMenu()` called from inside `MenuSystem.selectMenuItem()` — this calls `game.closeMenu()` which delegates back to `this.menuSystem.closeMenu()`. All paths lead to the same method.

**Crafting menus do NOT set `closeOnMovement`:** `openCraftingMenu()` does not call `_openSlotMenu()`. Equipment/chest menus do. This means WASD movement does NOT close crafting menus, but DOES close equipment menus. Whether this is intentional is unclear from the code; no comment explains the asymmetry.

---

### Scroll / Pagination Analysis

**No pagination exists.** The menu renders all `game.menuItems` in a vertical list. Navigation uses `selectedMenuIndex` clamped to `[0, menuItems.length - 1]`. In `openCraftingMenu`, items are passed as raw arrays without any page-slicing. For large inventories (e.g., 50+ ingredients), all items are present and the menu renders a scroll. The renderer (`MenuOverlay`) is responsible for visual clipping — this review did not audit `MenuOverlay.js` but the data layer has no pagination cap.

**Column navigation** skips disabled columns correctly (lines 376, 398 in main.js). But `disabledColumns` is always `[false, false, false, false]` in `openCraftingMenu` — no columns are ever actually disabled. The disabled column mechanism exists but is unused.

**Column boundary wrapping:** The wrapping loop in main.js (`let newColumn = ...; while (disabledColumns[newColumn]) newColumn = (newColumn +/- 1 + max) % max`) would infinite-loop if ALL columns were disabled. Not currently reachable but a theoretical issue.

---

### Item Duplication / Exploit Paths

**No crafting duplication found.** The sequence is:
1. Item removed from source (quickSlot nulled, armor array spliced, etc.) before `craftingSystem.setLeftSlot(char)` records the char.
2. `claimCraftedItem()` clears both slots before returning the Item.
3. No path allows claiming center twice; `hasCenterContent()` returns false after claim.

**Potential race: rapid space-press on center slot.** `triggerSlotPopup` starts an animation, then calls `claimCraftedItem` at phase 2 (~0.25s later). If the player presses SPACE multiple times before the popup resolves, `updateSlotPopup` processes one phase per frame and will not re-fire the action until the popup completes. A second SPACE during the popup does nothing because `slotPopup` is already set — `triggerSlotPopup` doesn't check if one is already running, but `handleCraftingSlotClaim` in the occupied-center path returns immediately via `handleCraftingSlotClaim` check. **Low risk, no confirmed dupe path.**

**`handleCenterSlotSelection` (reverse recipe from center):** This path sets `craftingSystem.centerSlot = itemChar` directly, bypasses `updateCrafting()`, and removes the item from its source. No ingredients are consumed — this is an "uncraft" view-mode, not an actual crafting step. The ingredients needed (`recipe.left`, `recipe.right`) are set on `leftSlot`/`rightSlot` but are NOT deducted from inventory at this point; they're only consumed when the player places them into crafting slots from their inventory. This is correct design behavior but may confuse: placing a finished item on center shows its recipe ingredients but does not auto-consume them.

**Duplicate weapon upgrade (same char both slots):** Uses char string equality (`===`), which is correct. Both slots are consumed by `claimCraftedItem` → `leftSlot = null; rightSlot = null`. The source items (from quickSlots or chest) were already removed when the player placed them in the slot via `openCraftingMenu` → `selectMenuItem`. One weapon is consumed per slot placement; net: 2 in, 1 out. No dupe.

---

### Bugs & Logic Errors

| # | Bug | Location | Severity |
|---|-----|----------|----------|
| 1 | `bankLoot()` writes `restActiveSlotIndex` as flat scalar but `setActiveCharacter()` reads from `characterInventories[type].activeSlotIndex` which is never updated. Active slot index is lost for non-default characters across bank cycles. | `InventorySystem.js:1224`, `setActiveCharacter:151` | P2 |
| 2 | `auto_dodge` (Fur Cloak) and `panic_blind` (Bone Dust) effects fall through `_checkTriggerCondition`'s `default: return false`. Both items equip correctly but never activate. They are dead items in EXPLORE. | `InventorySystem.js:937` | P1 |
| 3 | `throwSteam` (Steam Vial) has no trigger condition — fires immediately on every cooldown cycle without any enemy proximity or context requirement. | `InventorySystem.js:891-893` | P2 |
| 4 | `steamClouds` re-assignment inside `_checkTriggerCondition` case `'invuln'` (line 825) and `_executeWindupEffect` case `'throwSteam'` (line 1138): `if (!steamClouds) steamClouds = [];` only rebinds local variable, cannot affect the caller's null reference. Steam cloud silently dropped if caller passes null. | `InventorySystem.js:825, 1138` | P2 |
| 5 | `waterImmunityTimer` and `floatTimer` are overwritten unconditionally on re-trigger (no `Math.max`). Timer resets instead of extending if triggered while active. | `InventorySystem.js:883, 888` | P2 |
| 6 | `_auraRollPulseUsed` is never reset between rooms. Roll-pulse fires once per run, not once per room. | `InventorySystem.js:499` | P2 |
| 7 | `clearCenterSlot()` does not cancel `cycleState`. Calling it while cycling leaves `hasCenterContent()` returning true. | `CraftingSystem.js:58-61` | P2 (low risk currently) |
| 8 | `discoveredPairs` and `failedPairs` in `CraftingSystem` are never reset on death/game-over. Knowledge carries over between runs implicitly. | `CraftingSystem.js:114`, no caller in reset path | P2 (design ambiguity) |
| 9 | `game.chestTargetSlot` is never cleared in `closeMenu()`. Stale slot index lingers (currently safe because `currentMenuSlot` guards it, but fragile). | `MenuSystem.js:484-496` | P2 (latent) |
| 10 | `selectMenuItem()` handles `consumable1`, `consumable2`, `consumable3` explicitly but has no case for `consumable4` or `consumable5`. Players who unlock slots 4–5 via `unlockConsumableSlot()` cannot equip items to those slots via the menu. | `MenuSystem.js:582-611` | P1 |
| 11 | Inventory count in `updateUI()` (line 208) counts `player.inventory.length + armorInventory.length + consumableInventory.length` — does NOT count equipped armor, equipped consumables, or chest items. The displayed number understates actual held items. | `MenuSystem.js:208` | P2 |
| 12 | In `LootSystem.spawnLoot()`, `bonusDrop` on line 32 passes `enemy.data.dropTable` (may be undefined for affinity-only enemies) as the first arg to `generateEnemyDrops`. Bonus drop silently produces nothing for affinity-based enemies. | `LootSystem.js:32` | P2 |
| 13 | `luckMult` is only applied in the legacy `drops[]` path (lines 37-44). Affinity/tier-based enemies receive luck bonuses only on drop count (bonusChance), not per-item probability. Luck is weaker than intended for modern enemies. | `LootSystem.js:17-44` | P2 |

---

### Redundancies

| # | Redundancy | Location |
|---|-----------|----------|
| R1 | `restInventory`, `restQuickSlots`, `restActiveSlotIndex` are alias properties that shadow the canonical data in `characterInventories`. This split creates the activeSlotIndex desync bug (Bug #1) and adds complexity with no benefit over directly accessing `characterInventories[active]`. | `InventorySystem.js:30-32` |
| R2 | `consumableFlashTimer` / `consumableFlashSlot` (legacy flash) and `consumableBlinkSlot` / `consumableBlinkTimer` / `consumableBlinkPhase` / `consumableBlinkShowBlock` (block-blink) are two parallel animation systems for the same HUD slot. The legacy flash is only used by the windup completion path; the blink is used by both instant and windup. They could be unified. | `InventorySystem.js:46-54` |
| R3 | `openEquipmentMenu()` in `InventorySystem` (line 272) and `openEquipmentMenu()` in `MenuSystem` (line 326) have similar names and related but distinct roles. The `InventorySystem` version builds a list; `MenuSystem` version sets game state and renders. Naming suggests they're the same operation. | `InventorySystem.js:272`, `MenuSystem.js:326` |
| R4 | `disabledColumns` is initialized and passed in `openCraftingMenu()` but never set to true. The column-skipping logic in `main.js` (lines 376, 398) is dead code for crafting menus. | `MenuSystem.js:472-476` |
| R5 | `selectMenuItem()` handles `consumable1`, `consumable2`, `consumable3` with three nearly-identical `if` blocks (lines 582-611), each with `equipConsumable(N, ...)` calls. These could be a single handler: `const idx = parseInt(game.currentMenuSlot.replace('consumable', '')) - 1`. | `MenuSystem.js:582-611` |
| R6 | `handleCenterSlotSelection()` (line 662) and the `crafting-center` branch of `handleCraftingSlotPlace()` (line 810) both perform the same "find recipe by result, set leftSlot/rightSlot, remove item from source" pattern with nearly duplicated code. | `MenuSystem.js:662-705, 810-824` |
| R7 | `getRecipeResult(leftChar, rightChar)` in `recipes.js` (line 181) is exported but never used; all callers use `findRecipe()` directly and access `.result`. | `recipes.js:181` |

---

### Cross-Reference Notes

- **`player.equippedConsumables` vs `inventorySystem.equippedConsumables`:** Two copies exist. `applyEquipmentEffectsToPlayer()` syncs them via `player.equippedConsumables = [...this.equippedConsumables]`. `checkConsumableActivation()` reads from `player.equippedConsumables`. Any equip action in `MenuSystem.selectMenuItem()` does the sync explicitly (`game.player.equippedConsumables = [...game.inventorySystem.equippedConsumables]`). If `equipConsumable()` is ever called without the manual sync, `player.equippedConsumables` is stale until next `applyEquipmentEffectsToPlayer()` call.

- **`slowSteam` / `slow` case in `_checkTriggerCondition`:** The `slow` case references the Slime Ball consumable, but searching `items.js` finds no consumable with `effect: 'slow'` — only a TRAP (Slime Bomb) has that effect. The `slow` consumable trigger appears to be dead code without a corresponding item definition.

- **`_returnSlotItemToInventory(char)`:** When returning a non-ingredient item to inventory from a crafting slot, it creates a NEW `Item` instance at the player's position rather than using the original object. This is fine for armor/consumables (no identity tracking needed), but for weapons, calling `player.pickupItem(newItem)` may displace a different equipped weapon, and the original Item reference is lost.

- **`handleCraftingSlotClaim` center path (line 739-762):** Calls `claimCraftedItem()` which returns a new `Item`; this item is then added to `armorInventory`, `consumableInventory`, or via `player.pickupItem()`. If the item is a WEAPON and all quick slots are full, it goes to `itemChest`. The pickup message (`showPickupMessage(item.data.name)`) fires in all cases — correct. But `updateUI()` is called after `markBackgroundDirty()` within the center claim path but NOT in the `else if (!leftSlot && !rightSlot)` path that opens the center menu (that's handled by the menu open itself). Correct.

- **`openEquipmentMenu` deduplication is by `char`, not by item identity:** Two identical items in `armorInventory` are collapsed to one menu entry. If the player picks the entry and equips it via `armorIndex = indexOf(selectedItem)`, they get the first instance. The second is permanently invisible in the UI and never accessible unless the first is unequipped (pushing it back) and re-entered. This is unreachable inventory for same-char duplicates.
