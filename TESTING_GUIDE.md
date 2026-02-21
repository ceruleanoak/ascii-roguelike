# Testing Guide

## Quick Start Testing

1. Open http://localhost:3000/
2. Game starts in REST phase at center of screen
3. You start with 4 ingredients: Stick, String, Metal, Fire Essence

## Test 1: REST Phase Crafting

### Cell Highlighting
1. Move with WASD towards the crafting station (top of screen)
2. Approach any of the 3 crafting cells (left, center, right)
3. ✅ **Expected**: Cell should highlight with green overlay when you're close

### Ingredient Placement
1. Move close to the LEFT crafting slot (press W to go up)
2. Press SPACEBAR when cell is highlighted
3. ✅ **Expected**: Ingredient menu appears with Arrow Keys navigation
4. Use Arrow Up/Down to select an ingredient (e.g., Stick "|")
5. Press ENTER to confirm
6. ✅ **Expected**: Ingredient appears in left slot, menu closes

### Recipe Testing
1. Place Stick (|) in left slot (if not already)
2. Move to RIGHT slot
3. Press SPACEBAR
4. Select String (~) from menu
5. Press ENTER
6. ✅ **Expected**: Bow ()) appears in CENTER slot automatically!

### Claiming Crafted Item
1. Move to CENTER slot (with the Bow)
2. Press SPACEBAR
3. ✅ **Expected**:
   - Bow is picked up
   - "Held: Bow" shows in UI
   - Left and right slots clear
   - Center slot clears

### Try More Recipes
Test these combinations:
- Metal (M) + Fire Essence (F) = (nothing - not a valid recipe)
- Try discovering new recipes!

## Test 2: EXPLORE Phase Entry

1. From REST, move NORTH (press W) until you hit the top
2. ✅ **Expected**: Screen transitions to EXPLORE phase with new room

## Test 3: Combat & Movement

### Movement Physics
1. In EXPLORE, move with WASD
2. ✅ **Expected**:
   - Smooth acceleration/deceleration
   - Not grid-snapping
   - Can't walk through walls (grey █ blocks)

### Finding Weapons
1. Look for Gun (/) or Sword (†) in the room
2. Move close to the item
3. Press SPACEBAR
4. ✅ **Expected**: "Held: Gun" or "Held: Sword" in UI

### Combat with Gun
1. Hold the Gun (/)
2. Face an enemy (move towards it with WASD)
3. Press SPACEBAR to shoot
4. ✅ **Expected**: Bullet (·) flies in facing direction
5. ✅ **Expected**: Enemy takes damage (disappears after 1-2 hits)

### Combat with Sword
1. Hold the Sword (†)
2. Get close to enemy
3. Press SPACEBAR to slash
4. ✅ **Expected**: Brief flash (█) appears in front of you
5. ✅ **Expected**: Enemy takes damage if in range

### Loot Collection
1. Kill an enemy
2. ✅ **Expected**: Ingredients drop (f, t, g, etc.)
3. Move close to ingredients
4. ✅ **Expected**: Ingredients FLY TOWARDS YOU (attraction physics!)
5. ✅ **Expected**: Auto-pickup when touching
6. ✅ **Expected**: Inventory count increases in UI

## Test 4: Banking System

### Successful Return
1. Kill all enemies in room
2. Move SOUTH (press S) to bottom exit
3. ✅ **Expected**: Return to REST phase
4. ✅ **Expected**: Keep all collected ingredients
5. ✅ **Expected**: Depth resets to 0

## Test 5: Death Mechanics

### Getting Hit
1. In EXPLORE, let an enemy touch you
2. ✅ **Expected**: HP decreases in UI
3. Let HP reach 0
4. ✅ **Expected**: Return to REST phase
5. ✅ **Expected**: Inventory CLEARED
6. ✅ **Expected**: Crafting slots PRESERVED (if you left items there)

## Test 6: Persistence

### Save Test
1. Place ingredients in crafting slots
2. Close browser tab
3. Reopen http://localhost:3000/
4. ✅ **Expected**: Crafting slots still have your items!

### Death Persistence
1. Place valuable item in crafting slot
2. Go to EXPLORE and die
3. ✅ **Expected**: Item still in crafting slot when you return

## Test 7: Depth Progression

### Going Deeper
1. Enter EXPLORE phase (North from REST)
2. Kill all enemies
3. Go NORTH again to next room
4. ✅ **Expected**: Depth increases to 1
5. ✅ **Expected**: Enemies slightly harder
6. Continue North to test scaling

## Common Issues

### Issue: Menu not opening
- **Fix**: Make sure you're standing next to an EMPTY crafting slot
- **Fix**: Make sure you have ingredients in inventory (UI shows count)

### Issue: Can't pick up item
- **Fix**: Make sure you're close enough (within 1-2 cells)
- **Fix**: Can only hold ONE item at a time - press Shift to drop current

### Issue: Recipe not working
- **Fix**: Make sure both left AND right slots are filled
- **Fix**: Try reverse order (swap left/right)
- **Fix**: Not all combinations are valid recipes!

### Issue: Enemies not spawning
- **Fix**: This is a Discovery or Camp room (safe zone)
- **Fix**: Go North/East/West to find Combat rooms

### Issue: Can't see player
- **Fix**: Player is @ symbol, starts at center
- **Fix**: Background might be rendering over foreground (refresh page)

## Performance Tests

1. Go 5+ rooms deep
2. Let 10+ ingredients pile up
3. ✅ **Expected**: Still 60 FPS, no lag
4. Check browser console (F12) for errors

## Browser Console Checks

Press F12 to open DevTools, check Console tab:
- ✅ **Expected**: No red errors
- ✅ **Expected**: Game loads without warnings

## Quick Recipe Reference (Spoilers!)

For testing crafting:
- Stick (|) + String (~) = Bow ())
- Gun (/) + Metal (M) = Shotgun (⌂)  [Need to find Gun in EXPLORE first]
- Sword (†) + Fire Essence (F) = Flame Sword (‡)  [Need to find Sword in EXPLORE first]

## Success Criteria

✅ Game loads without errors
✅ Player can move smoothly in REST
✅ Crafting cells highlight when close
✅ Ingredient menu opens with spacebar
✅ Recipes craft automatically
✅ Can claim crafted items
✅ Can transition to EXPLORE
✅ Combat works (guns, swords, bullets)
✅ Enemies drop loot with attraction physics
✅ Can return to REST and keep loot
✅ Death clears inventory but keeps crafting slots
✅ Persistence works across sessions
