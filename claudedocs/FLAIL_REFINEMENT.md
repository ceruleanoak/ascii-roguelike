# Flail Weapon - Sequential Sweep Animation

## Summary

Refined the Flail weapon from a simultaneous 8-direction AOE attack to a **sequential circular sweep** that animates like a real flail spinning around the player.

---

## Changes Made

### 1. Item.js - Modified `createMeleeRing()` Method

**Before**: Created 8 melee attacks all at once
**After**: Creates 8 melee attacks with staggered delays

```javascript
// Key changes:
- sweepDuration: 0.4s total for full circle
- delayPerStep: 0.05s between each position (0.4s / 8 = 0.05s)
- Each attack has delay: i * delayPerStep
- Each attack lasts 0.1s (brief hit zone)
- Changed char to '~' (chain/whip visual)
```

**Attack Pattern**:
```
Position 0: Spawns at t=0.00s    (right side)
Position 1: Spawns at t=0.05s    (diagonal)
Position 2: Spawns at t=0.10s    (up)
Position 3: Spawns at t=0.15s    (diagonal)
Position 4: Spawns at t=0.20s    (left side)
Position 5: Spawns at t=0.25s    (diagonal)
Position 6: Spawns at t=0.30s    (down)
Position 7: Spawns at t=0.35s    (diagonal)
```

### 2. CombatSystem.js - Added Delayed Attack Support

**New Feature**: `pendingMeleeAttacks` queue

**Changes**:
1. Added `this.pendingMeleeAttacks = []` to constructor
2. Added pending attack update logic in `update()` method
3. Modified `addAttack()` to route delayed attacks to pending queue
4. Updated `clear()` to clear pending attacks

**How It Works**:
```javascript
// Attacks with delay > 0 go to pending queue
if (attackData.delay && attackData.delay > 0) {
  this.pendingMeleeAttacks.push(attackData);
}

// Each frame, tick down delays and spawn when ready
pending.delay -= deltaTime;
if (pending.delay <= 0) {
  this.meleeAttacks.push(pending);
}
```

---

## Visual Animation

### Before (Ring Pattern)
```
All 8 attacks spawn simultaneously at t=0:

    2     3     4
     \    |    /
      \   |   /
   1 - @ Player @ - 5
      /   |   \
     /    |    \
    8     7     6

All positions hit at once = AOE blast
```

### After (Sequential Sweep)
```
Attacks spawn one at a time in clockwise rotation:

t=0.00s:          t=0.05s:          t=0.10s:
    .     .     .     .     .     .     .     1     .
     \    |    /       \    |    /       \    |    /
      \   |   /         \   |   /         \   |   /
   . - @ Player @ - 0  . - @ Player @ - .  . - @ Player @ - .
      /   |   \         /   |   \         /   |   \
     /    |    \       /    |    \       /    |    \
    .     .     .     .     .     .     .     .     .

t=0.15s:          t=0.20s:          t=0.25s:
    .     .     2     .     .     3     4     .     .
     \    |    /       \    |    /       \    |    /
      \   |   /         \   |   /         \   |   /
   . - @ Player @ - .  . - @ Player @ - .  . - @ Player @ - .
      /   |   \         /   |   \         /   |   \
     /    |    \       /    |    \       /    |    \
    .     .     .     .     .     .     .     .     .

(continues sweeping around...)
```

**Effect**: Looks like a flail head spinning in a circle around the player, damaging enemies as it passes through each position.

---

## Flail Weapon Stats

**Current Definition** (from `items.js`):
```javascript
'○': {
  char: '○',
  name: 'Flail',
  type: ITEM_TYPES.WEAPON,
  weaponType: WEAPON_TYPES.MELEE,
  damage: 3,
  cooldown: 0.7,
  range: 22,
  attackPattern: 'ring',
  color: '#aaaaaa'
}
```

**Behavior**:
- **Total sweep time**: 0.4 seconds
- **Positions hit**: 8 (around player in circle)
- **Damage per hit**: 3
- **Max potential damage**: 24 (if enemy stays in all 8 positions)
- **Realistic damage**: 3-9 (enemy typically hit by 1-3 positions as sweep passes)
- **Cooldown**: 0.7s (can't attack again until sweep completes)

---

## Gameplay Impact

### Strategic Implications

**Strengths**:
- ✅ Hits enemies on all sides (360° coverage)
- ✅ Can catch fast-moving enemies as sweep rotates
- ✅ Good for crowd control (multiple enemies around player)
- ✅ Visually satisfying spinning animation

**Weaknesses**:
- ⚠️ Doesn't all hit at once (enemies can dodge)
- ⚠️ Lower single-target damage than other 3-damage weapons
- ⚠️ Requires positioning (stay in center of enemies)
- ⚠️ Longer total attack duration (0.4s sweep + 0.3s remaining cooldown)

### Balance Considerations

**Compared to Other Melee Weapons**:
```
Flail (○):        3 dmg, 0.7s CD, 360° sweep = 4.3 DPS (spread damage)
Sword (†):        2 dmg, 0.3s CD, single dir  = 6.7 DPS (focused)
Bone Axe (⊤):     4 dmg, 0.5s CD, single dir  = 8.0 DPS (focused)
Spear (↑):        3 dmg, 0.4s CD, longer range = 7.5 DPS (focused)
```

**Balance**: Flail has **lower DPS** but **better coverage**. It's a defensive/crowd-control weapon, not a DPS weapon.

**Suggested Use Cases**:
- Surrounded by multiple weak enemies
- Kiting while dealing damage in all directions
- Defensive playstyle (hit enemies before they reach you)

---

## Technical Details

### Delayed Attack System

**Architecture**:
```
Player uses Flail
    ↓
Item.createMeleeRing() generates 8 attacks with delays
    ↓
CombatSystem.addAttack() sorts them:
  - delay > 0 → pendingMeleeAttacks queue
  - delay = 0 → meleeAttacks (immediate)
    ↓
CombatSystem.update() each frame:
  - Tick down pending.delay -= deltaTime
  - When delay <= 0, move to meleeAttacks
    ↓
Attack becomes active and checks for hits
```

**Performance**:
- Minimal overhead (just array iteration)
- Max pending attacks: ~8-16 at once (rare)
- No recursive loops or complex state

**Extensibility**:
The delayed attack system can now be used for:
- Other sequential attack patterns
- Charge-up attacks (spawn after delay)
- Combo attacks (follow-up strikes)
- Timed explosions/mines

---

## Testing Checklist

### Functional Tests
- [x] Build succeeds without errors
- [ ] Flail spawns 8 sequential attacks
- [ ] Attacks appear in clockwise circle
- [ ] Each position spawns ~0.05s apart
- [ ] Total sweep takes ~0.4s
- [ ] Attacks hit enemies in their path
- [ ] No simultaneous hits (all sequential)

### Visual Tests
- [ ] Attack visual shows '~' character
- [ ] Positions are evenly spaced around player
- [ ] Animation looks smooth (not jumpy)
- [ ] Sweep direction is clockwise
- [ ] No visual glitches or overlaps

### Balance Tests
- [ ] Can hit multiple enemies with one sweep
- [ ] Enemies can dodge by moving out of sweep path
- [ ] Total damage is reasonable (3-9 per use)
- [ ] Cooldown prevents spam (0.7s minimum)

### Edge Cases
- [ ] Works when player is moving
- [ ] Works with knockback enemies
- [ ] Works with status effects (freeze, stun)
- [ ] Pending attacks clear on death/room change

---

## Files Modified

1. **`src/entities/Item.js`**
   - Modified `createMeleeRing()` method (lines 272-300)
   - Added delay calculation for sequential spawning
   - Changed attack duration to 0.1s (brief hit zones)
   - Changed visual char to '~' (chain/whip)

2. **`src/systems/CombatSystem.js`**
   - Added `pendingMeleeAttacks` array to constructor
   - Added pending attack update logic in `update()` method
   - Modified `addAttack()` to handle delayed attacks
   - Updated `clear()` method to clear pending attacks

---

## Future Enhancements

### Possible Improvements

1. **Variable Sweep Speed**
   - Fast Flail: 0.2s sweep, less damage
   - Heavy Flail: 0.6s sweep, more damage

2. **Sweep Direction Control**
   - Clockwise by default
   - Counter-clockwise variant
   - Direction based on player movement

3. **Enhanced Visuals**
   - Trail effect (show previous positions)
   - Different characters per position for motion blur
   - Particle effects on hits

4. **Recipe Upgrades**
   - Flail + Metal → Heavy Flail (more damage, slower)
   - Flail + Wing → Quick Flail (less damage, faster)
   - Flail + Fire → Flame Flail (burn effect on sweep)

5. **Advanced Patterns**
   - Figure-8 pattern
   - Spiral outward pattern
   - Double sweep (clockwise then counter-clockwise)

---

## Related Weapons

Other weapons that could use sequential patterns:

- **Whip (≋)**: Already has long range, could add sequential sweep
- **Thunder Axe (⚯)**: Could create sequential lightning strikes
- **Earthquake Hammer (▼)**: Could create expanding shockwave circles

---

## Conclusion

The Flail weapon now has a **unique sequential sweep mechanic** that:
- ✅ Looks visually satisfying (spinning animation)
- ✅ Feels different from other melee weapons
- ✅ Provides strategic trade-off (coverage vs DPS)
- ✅ Opens door for more sequential attack patterns

**Ready for in-game testing!**

Test by:
1. Craft Flail: `String (~) + String (~) → Whip (≋)`
2. Craft Flail: `Metal (M) + String (~) → Flail (○)`
3. Use in combat and observe the spinning sweep animation
4. Verify enemies are hit sequentially, not all at once

---

**Generated**: 2026-02-16
**Status**: ✅ Implemented, Build Verified, Ready for Testing
