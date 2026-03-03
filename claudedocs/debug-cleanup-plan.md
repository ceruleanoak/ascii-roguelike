# Debug Message Cleanup Plan

## Summary
Found **359 total console statements**. Recommendation: **Keep 59 useful messages**, **Remove 300+ verbose debug messages**.

---

## ✅ KEEP (59 messages) - Useful for General Testing

### Error & Warning Messages (Always Keep)
These catch actual problems and should remain:

```javascript
// src/main.js
873: console.error(`Unknown character type: ${type}`);
998: console.warn('[Leshy Chase] No spawn objects found, chase ended');
1442: console.warn('Effect not implemented:', cd.effect);

// src/entities/Leshy.js
40: console.warn('[Leshy] No exits available!');

// src/systems/NeutralRoomSystem.js
22: console.error(`[NeutralRoomSystem] Script not found: ${scriptName}`);

// src/systems/PersistenceSystem.js
24: console.error('Failed to save state:', e);
36: console.error('Failed to load state:', e);
46: console.error('Failed to clear save:', e);

// src/systems/RoomGenerator.js
1801: console.warn(`[Key Room] No eligible objects found for key drops! Room may be un-completable.`);
1976: console.warn(`[Guaranteed Items] Unknown item pool: ${itemConfig.itemPool}`);

// src/entities/Item.js
902: console.warn(`[WAND] Unknown wand type: ${wandType}`);

// src/systems/AudioSystem.js (all error/warning messages)
97-98, 156, 182, 193, 236, 238, 241, 252, 274, 292, 469
```

### Major State Transitions (Testing-Friendly)
High-level events that help understand game flow:

```javascript
// src/main.js
582: console.log('[Audio] Transitioning from title music to gameplay music');
893: console.log(`Applied character type: ${type} (${charData.name})`);
1514: console.log(`[transitionToNeutralRoom] Entering neutral room: ${scriptName}`);
1833: console.log('[enterNeutralState] Entering neutral room');

// Death/Respawn System
2940-2945: console.log death banner (💀 PLAYER DEATH DETECTED + stats)
2965: console.log('✨ Phoenix Feather activated — death intercepted! HP restored to ' + this.player.hp);
2982: console.log('⚰️  Character died...');
3012: console.log(`🔄 Respawning as ${CHARACTER_TYPES[nextCharacter].name}`);
3022: console.log('💀 All characters have died - GAME OVER');

// Zone/Progression
1653-1658: Zone transition logs (⚡ Zone transition: X → Y)
3241: console.log(`Spawned ${currentZone} captive! (5 rooms cleared in ${currentZone} zone)`);
```

### Critical Game Events
Events that indicate important gameplay milestones:

```javascript
// src/main.js
2706: console.log(`[Secret] Leshy reached ${exitDirection} exit and despawned`);
2764: console.log(`[Secret] Leshy discovered! Fleeing to ${leshy.targetExit} exit`);
2914: console.log(`[POLYMORPH] Enemy transformed into ${outcome}`);
3277: console.log(`[Secret] Pattern matched: ${secret.pattern} - ${secret.message}`);
3287: console.log('[Secret] 3rd chase successful! Entering Leshy Grove...');

// Blessing/Power-ups
4191: console.log(`[Blessing] Applied ${blessing.name}: damage buff +${blessing.effect.value}`);
4198: console.log(`[Blessing] Applied ${blessing.name}: max HP +${blessing.effect.value}`);
4204: console.log(`[Blessing] Applied ${blessing.name}: speed +${blessing.effect.value}`);
```

### Cheat Menu (Debug Tool - Keep All)
All messages in `src/main.js:3893-4219` and `src/systems/CheatMenu.js:106-357` should remain since the cheat menu is explicitly for debugging.

---

## ❌ REMOVE (300+ messages) - Verbose Debug Spam

### Category 1: Redundant State Logging
Messages that spam every time common actions occur:

```javascript
// src/main.js
611: console.log('[enterRestState] Restored quick slots:', this.player.quickSlots);
656: console.log('[enterRestState] Restored', this.ingredients.length, 'saved REST ingredients');
683: console.log('[enterRestState] Created', this.ingredients.length, 'starting ingredients on ground');
1574: console.log(`[enterExploreState] entryDirection=... (ENTIRE STATE DUMP)`);
1626: console.log('[enterExploreState] Restoring saved EXPLORE room');
1665-1675: Zone initialization spam (3 similar messages)
1699: console.log(`[Room Generated] Exits: N=... E=... W=... S=...`);
1718: console.log('[Room Generated] No enemies - exits unlocked immediately');
1752: console.log('[enterExploreState] Trap charges reset...');

// src/systems/InventorySystem.js
145: console.log(`[InventorySystem] Switched to character '${characterType}' inventory`);
908-909: console.log('[bankLoot] Added...', '[bankLoot] Saved quick slots...');
941: console.log('[handleGameOver] Cleared all character inventories');
965: console.log('[saveExploreRoom] Saved EXPLORE room state for anti-cheat');
1010: console.log('[saveRestIngredients] Saved', ingredients.length, 'REST ingredients');

// Exit handling spam
3272: console.log(`[Exit] Took north exit: ${exitObj.letter}...`);
3312: console.log('[Exit] Took south exit...');
3329: console.log('[updateExploreState] Saved EXPLORE room state before returning to REST');
3345: console.log(`[Exit] Took east exit...`);
3382: console.log(`[Exit] Took west exit...`);
```

### Category 2: Vault Debug Spam (15 messages)
All vault debugging should be removed - feature is stable:

```javascript
// src/main.js:730-765
730: console.log('[VAULT] Failed: not in EXPLORE or no vault');
738: console.log('[VAULT] Failed: vault already unlocked');
744: console.log(`[VAULT] Key check: heldItem=...`);
746: console.log('[VAULT] Failed: no vault key equipped');
759: console.log(`[VAULT] Player(...) VaultBottom:... (COORDINATES)`);
762: console.log('[VAULT] ✓ ALL CHECKS PASSED - UNLOCKING!');
765: console.log('[VAULT] Failed: position check failed');

// src/main.js:3437-3439 (SPACE press debug)
3437-3439: console.log('[DEBUG] SPACE pressed...', '[DEBUG] Player held item...', '[DEBUG] Has vault?...');
```

### Category 3: Wand System Debug Spam (40+ messages)
Wand debugging is extremely verbose - remove all:

```javascript
// src/main.js
2524-2527: console.log(`[MAIN] Passing wand attack...`, `[MAIN] Number of enemies...`, etc.)
2536: console.log(`[WAND] ${weapon.data.name} proximity failed...`);
3646-3648: console.log(`[MAIN REST] Passing wand attack...` x3)
3682-3686: console.log(`[MAIN EXPLORE] Passing wand attack...` x4)

// src/entities/Item.js
869: console.log(`[WAND] ${this.data.name} has no uses remaining...`);
886: console.log(`[WAND] Transmutation Wand has no uses remaining...`);
892: console.log(`[WAND] Transmutation Wand uses: ${this.wandUsesRemaining}...`);
898: console.log('[WAND] Infusion Wand not yet implemented');
913-917: console.log(`[WAND CREATE] Chaos Wand attack...` x5)
938-942: console.log(`[WAND CREATE] Blind Wand attack...` x5)

// src/systems/CombatSystem.js
320: console.log(`[WAND] Transmutation bolt hit enemy...`);
1018: console.log(`[WAND] ${attackData.wandName} proximity requirement not met`);
1051: console.log(`[WAND] Chaos Wand exploded...`);
1070: console.log(`[WAND] Blind Wand applied blind...`);
1347-1365: console.log proximity check spam (6 messages)
1382: console.log(`[WAND] Applied ${statusType}...`);
```

### Category 4: Weapon/Combat Spam (25+ messages)
Remove verbose weapon firing/charging logs:

```javascript
// src/entities/Item.js
68: console.log(`[WEAPON] ${this.data.name} ready to fire!`);
92: console.log(`[WEAPON] ${this.data.name} windup complete, fired...`);
126: console.log(`[BOW] ${this.data.name} charging started`);
139: console.log(`[WEAPON] ${this.data.name} windup started...`);
150: console.log(`[WAND] ${this.data.name} fired...`);
152: console.log(`[WEAPON] ${this.data.name} fired...`);
172: console.log(`[BOW] ${this.data.name} released at...`);
773: console.log(`[BOW] ${this.data.name} - Uses remaining...`);
778: console.log(`[BOW] ${this.data.name} - OUT OF ARROWS!...`);
992: console.log(`[BOW] ${this.data.name} - Uses reset to...`);
998: console.log(`[WAND] ${this.data.name} - Uses reset to...`);

// src/entities/Player.js
334: console.log(`[DAMAGE] BURN DoT tick fired...`);
360: console.log(`[DODGE] Cancelled ${this.heldItem.data.name} windup`);
368: console.log(`[DODGE] Cancelled ${this.heldItem.data.name} charge`);
460: console.log(`[DAMAGE] Blocked by invulnerability frames...`);
468: console.log(`[DAMAGE] DODGED!...`);
475: console.log(`[DAMAGE] BULLET BLOCKED!...`);
483: console.log(`[DAMAGE] FIRE IMMUNE!...`);
487: console.log(`[DAMAGE] FREEZE IMMUNE!...`);
491: console.log(`[DAMAGE] POISON IMMUNE!...`);
508: console.log(`[DAMAGE] ${damageType}${elementInfo}:...`); // Main damage log
518: console.log(`[DAMAGE] Reflected ${reflectedAmount}...`);
```

### Category 5: Consumable/Item Trigger Spam (20+ messages)
Remove all consumable activation logs:

```javascript
// src/main.js
1205: console.log(`${cd.name} triggered (one-shot consumed)!`);
1209: console.log(`${cd.name} triggered (${cd.cooldown}s cooldown started)!`);
1383: console.log(`Venom Vial: enemy at ${dist.toFixed(1)}px...`);
1386: console.log(`Venom Vial check: ${nearbyCount} enemies...`);
1390: console.log(`✓ Venom Vial TRIGGERED!...`);
1475: console.log(`${cd.name} windup started (one-shot)!`);
1479: console.log(`${cd.name} windup started (${cd.cooldown}s cooldown)!`);
1500: console.log(`Auto-activated ${cd.name} (one-shot)!`);
1504: console.log(`Auto-activated ${cd.name} (${cd.cooldown}s cooldown)!`);

// src/systems/InventorySystem.js
689: console.log(`${cd.name} windup started (one-shot)!`);
692: console.log(`${cd.name} windup started (${cd.cooldown}s cooldown)!`);
725: console.log(`Auto-activated ${cd.name} (one-shot)!`);
728: console.log(`Auto-activated ${cd.name} (${cd.cooldown}s cooldown)!`);
860: console.log(`${cd.name} triggered (one-shot consumed)!`);
863: console.log(`${cd.name} triggered (${cd.cooldown}s cooldown started)!`);
```

### Category 6: Enemy AI Debug Spam (30+ messages)
Remove all enemy pathfinding/pack behavior spam:

```javascript
// src/main.js
2563: console.log(`🐾 [${enemy.data.name}] Pack check:...`);
2568: console.log(`  → Other wolf distance:...`);

// src/entities/Enemy.js
490: console.log(`❌ [${this.data.name}] NO TARGET - returning early...`);
780: console.log(`🐺 [${this.data.name}] NEW DETECTION! Sharing with...`);
782: console.log(`  → Alerting packmate...`);
791: console.log(`  ✓ Packmate now: state=...`);
794: console.log(`🐺 [${this.data.name}] NEW DETECTION but NO PACKMATES...`);
809: console.log(`🔍 [${this.data.name}] LOST VISION...`);
811: console.log(`  → Sharing memory with...`);
819: console.log(`  ✓ Packmate now: state=...`);
830: console.log(`🚨 [${this.data.name}] NEVER HAD VISION...`);
1103: console.log(`[${this.data.name}] STUCK: speed=...`);
1139: console.log(`[${this.data.name}] Recalc check:...`);
1181: console.log(`[${this.data.name}] 🔴 BRUTE FORCE (RETRY):...`);
1183: console.log(`[${this.data.name}] 🔴 BRUTE FORCE: target=...`);
1346: console.log(`[PLANE] Enemy vision blocked:...`);
```

### Category 7: Room Generation Spam (80+ messages)
Extremely verbose - remove all except errors:

```javascript
// src/systems/RoomGenerator.js
63: console.log(`[Room Generation] Applying letter template...`);
68: console.log(`[TUNNEL] Letter 'T' detected...`);
75: console.log(`[OCEAN] Letter 'O' detected...`);
84: console.log(`[Room Generation] Room type determined:...`);
171-210: [DEBUG] zone feature checks (10+ messages)
239: console.log('[Room Generation] Wall structures disabled...');
404-559: [TUNNEL] generation spam (30+ messages with coordinates)
563-615: [OCEAN] generation spam (10+ messages)
749-1330: [DEBUG] liquid/mud generation spam (40+ messages)
1549-1582: [Vault] creation logs
1775-1824: [Key Room] setup logs
1844-1924: [Secret Event] system logs
1949: console.log(`[Secret] Marked ${selectedObject.name}...`);
1958-2002: [Guaranteed Items] spawn logs
2014-2017: [PLANE] enemy plane assignment

// src/data/neutralRooms.js
150-153: console.log('[Leshy Grove] Generated magical forest...' (4 messages)
197-271: Leshy Grove interaction spam (10+ messages)
282: console.log('[Leshy Grove] Exiting grove');
```

### Category 8: Leshy Interaction Spam (20+ messages)
Remove Leshy object interaction debugging:

```javascript
// src/main.js
996: console.log('[Leshy] No bushes, trees, or rocks found...');
1008: console.log(`[Leshy] Marked ${selectedObject.data.name}...`);
1068: console.log(`[Path Amulet] Displaying path:...`);
3702-3739: [LESHY INTERACTION] handling spam (12 messages)
4452: console.log(`[Secret] Leshy discovered! Fleeing to...`); // Duplicate of 2764
4460: console.log(result.message); // Temporary comment says "log to console"
4469-4482: [Key Drop Debug] spam (4 messages)

// src/entities/Leshy.js
48: console.log(`[Leshy] Finding nearest exit from position...`);
56: console.log(`  ${dir}: exit at...`);
64: console.log(`  → Chose ${nearestExit}...`);
```

### Category 9: Audio System Verbose Logs (15+ messages)
Keep errors, remove info logs:

```javascript
// src/systems/AudioSystem.js
73: console.log(`[Audio] Looping: ${this.audioElement.currentTime}...`);
82: console.log('[Audio] Track ended, looping to', this.loopStartTime);
90-92: console.log loaded/duration/loop point (3 messages)
101: console.log('[Audio] Single-track mode initialized');
123: console.log('[Audio] Loading dual-layer music...');
135-136: console.log layer 1/2 loaded
153: console.log('[Audio] Dual-layer mode ready');
190: console.log(`[Audio] SFX loaded:...`);
271: console.log('[Audio] Single-track playback started');
331: console.log('[Audio] Dual-layer playback started...');
335: console.log(`[Audio] Applying pending layer 2 state:...`);
363: console.log('[Audio] Playback stopped');
378: console.log(`[Audio] Layer 2 state pending:...`);
404: console.log(`[Audio] Layer 2 will unmute in...`);
413: console.log(`[Audio] Layer 2 will mute in...`);
465: console.log('[Audio] Single-track started after user interaction');
476: console.log('[Audio] Dual-layer started after user interaction');
```

### Category 10: Physics/Collision Spam (10+ messages)
Remove tunnel collision debugging:

```javascript
// src/systems/PhysicsSystem.js
267: console.log(`[COLLISION] Tunnel wall passable...`);
271: console.log(`[COLLISION] Tunnel wall SOLID...`);
429: console.log(`[TUNNEL] Pushing entity DOWN...`);
433: console.log(`[TUNNEL] Pushing entity UP...`);
443: console.log(`[TUNNEL] Pushing entity RIGHT...`);
447: console.log(`[TUNNEL] Pushing entity LEFT...`);
541: console.log(`[PLANE] ✓ Player SWITCHED PLANE:...`);

// src/main.js
2329: console.log('[LAVA] Dealing', damagingLiquid.damage, 'damage from', damagingLiquid.name);
```

### Category 11: Zone System Logs (10+ messages)
Remove zone tracking spam:

```javascript
// src/main.js
1712: console.log('[Gray Zone] Enemies buffed to hard mode!');
1695: console.log('[Room Generated] Trap charges reset for new room');

// src/systems/ZoneSystem.js
170: console.log(`[ZoneSystem] Consecutive green rooms:...`);
175: console.log(`[ZoneSystem] Left green zone, resetting...`);
188: console.log(`[ZoneSystem] Entered new zone:...`);
195: console.log(`[ZoneSystem] Rooms cleared in ${currentZone}...`);
198: console.log(`[ZoneSystem] Room cleared in gray zone...`);
215: console.log(`[ZoneSystem] ${currentZone} zone already cleared...`);
224: console.log(`[ZoneSystem] Marked ${currentZone} zone as cleared...`);
```

### Category 12: Misc Debug Spam
Other scattered debug messages:

```javascript
// src/systems/NeutralRoomSystem.js
49: console.log(`[NeutralRoomSystem] Generated room:...`, this.state);

// src/main.js
1685: console.log(`[Room Generation] Exit letter '${exitObj.letter}'...`);
1888: console.log('[NEUTRAL] Taking south exit - returning to EXPLORE');
4219: console.log(`[TRAP] Placing ${trapData.name} at player position`);
```

---

## Recommended Action Plan

### Phase 1: Remove All Debug Spam (Safe - No Loss of Functionality)
Remove all 300+ messages in Categories 1-12 above. These are verbose logging that clutters console output and provides no value for general testing.

### Phase 2: Keep Critical Messages Only
Retain the 59 messages that provide:
1. **Error detection** (console.error, console.warn)
2. **Major state transitions** (death, respawn, zone changes)
3. **Critical gameplay events** (secret patterns, Leshy discovery)
4. **Cheat menu output** (intentional debug tool)

### Phase 3: Optional - Convert Some to Conditional Debug Mode
If you want to preserve some detailed logging for future debugging, consider:

```javascript
// Add to GameConfig.js
DEBUG_MODE: {
  COMBAT: false,
  ROOM_GEN: false,
  ENEMY_AI: false,
  PHYSICS: false,
  AUDIO: false
}

// Then conditionally log:
if (DEBUG_MODE.COMBAT) console.log('[WAND] ...');
```

This way you can enable specific subsystem debugging when needed without console spam during normal gameplay.

---

## Summary

**Current**: 359 console statements
**Recommended**: 59 statements (84% reduction)
**Benefit**: Cleaner console, easier debugging, better performance
