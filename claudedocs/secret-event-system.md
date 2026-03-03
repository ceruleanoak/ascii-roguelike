# Secret Event System - Design & Implementation

**Status:** Implemented and Working
**Last Updated:** 2026-03-01

---

## Overview

The **Secret Event System** is a scalable, priority-based system for post-clear room events. It handles visual indicators (glitter, shaking, glowing) that appear after rooms are cleared, creating discovery moments and telegraphing special mechanics.

### Core Principles

1. **Priority-Based**: Only 1 event per room, highest priority wins
2. **Scalable**: Easy to add new event types without touching core logic
3. **Consistent**: All events use same marking + rendering pattern
4. **Discoverable**: Visual effects guide player exploration

---

## Architecture

### Event Flow

```
Room Cleared
  ↓
Check all event types (sorted by priority)
  ↓
For each event type:
  - Check condition (zone, room type, etc.)
  - Get eligible objects (bushes, barrels, etc.)
  - If eligible objects exist → mark one randomly
  - STOP (only 1 event per room)
  ↓
Visual rendering (particle effects in update loop)
```

### File Structure

**`RoomGenerator.js`**
- `getSecretEventTypes()` - Event type definitions
- `applySecretEvents(room)` - Apply events on room clear
- Event marking happens here

**`main.js`**
- `updateSecretEventEffects(deltaTime)` - Particle spawning
- `glitterTimer` - Controls particle spawn rate
- Visual rendering happens here

---

## Event Type Definition

Each event in `getSecretEventTypes()` has:

```javascript
{
  name: 'event_name',           // Unique identifier
  priority: 10,                 // Higher = more important (1-10 scale)

  condition: (room) => {        // When should this event trigger?
    return /* boolean */;
  },

  eligibleObjects: (room) => {  // Which objects can be marked?
    return room.backgroundObjects.filter(obj => /* criteria */);
  },

  mark: (selectedObject) => {   // How to mark the chosen object?
    selectedObject.flagName = true;
    selectedObject.visualData = value;
  }
}
```

---

## Implemented Events

### ✅ **Key Glitter** (Priority 10)

**Purpose:** Show player which destructible contains vault key

**Condition:**
- Must be K room (`keyDrops.enabled === true`)

**Eligible Objects:**
- Background objects with `dropsKey === true`
- (Barrels, crates, rocks, metal boxes, bones in K rooms)

**Marking:**
```javascript
selectedObject.isGlittering = true;
selectedObject.keyObject = true;
selectedObject.glitterColor = '#ffaa00'; // Gold
```

**Visual Effect:**
- Golden sparkle particles (`*` char)
- Spawn every 0.15 seconds
- 1-2 particles per spawn
- Float upward with slight horizontal drift
- Lifetime: 0.8-1.2 seconds

**Implementation:**
- Marked by: `RoomGenerator.applySecretEvents()`
- Rendered by: `Game.updateSecretEventEffects()`

---

### ✅ **Leshy Chase** (Priority 5)

**Purpose:** Telegraphs Leshy encounter (green zone secret)

**Condition:**
- Zone system decides via `shouldSpawnShakingBush()`
- Green zone only, cleared rooms

**Eligible Objects:**
- Bushes (`%`) or trees (`&`)

**Marking:**
```javascript
selectedObject.isShaking = true;
selectedObject.leshyBush = true;
```

**Visual Effect:**
- (Currently no particle effect - future implementation)
- Interaction spawns Leshy NPC

**Implementation:**
- Marked by: `RoomGenerator.applySecretEvents()`
- Interaction by: `main.js` background object handling

---

## Priority Hierarchy

Current event priorities (higher = more important):

| Priority | Event | Why This Priority? |
|----------|-------|-------------------|
| 10 | Key Glitter | Gameplay-critical - player needs keys to progress |
| 5 | Leshy Chase | Optional secret - doesn't block progression |
| (Future) | Treasure Sparkle | Would be priority 8 (valuable but optional) |
| (Future) | Cursed Glow | Would be priority 3 (warning/flavor) |

**Design Principle:** Progression mechanics > Secrets > Flavor

---

## Adding New Event Types

### Example: Treasure Sparkle

```javascript
// In RoomGenerator.getSecretEventTypes(), add to array:
{
  name: 'treasure_sparkle',
  priority: 8,

  condition: (room) => {
    // Rare rooms with loot
    return room.type === 'DISCOVERY' && Math.random() < 0.3;
  },

  eligibleObjects: (room) => {
    // Crates and metal boxes only
    return room.backgroundObjects.filter(obj =>
      obj.char === '#' || obj.char === 'B'
    );
  },

  mark: (selectedObject) => {
    selectedObject.isSparkling = true;
    selectedObject.sparkleColor = '#00ffff'; // Cyan
    console.log(`[Secret Event] Marked ${selectedObject.name} as treasure`);
  }
}
```

Then add rendering in `main.js`:

```javascript
// In updateSecretEventEffects():
const sparklingObjects = this.currentRoom.backgroundObjects.filter(
  obj => obj.isSparkling
);

for (const obj of sparklingObjects) {
  // Spawn cyan sparkles
  // ... particle logic ...
}
```

---

## Rendering Pattern

### Particle Spawning

**Timer-Based:**
```javascript
this.glitterTimer += deltaTime;

if (this.glitterTimer >= this.GLITTER_SPAWN_INTERVAL) {
  this.glitterTimer = 0;

  // Spawn particles for all active events
  const markedObjects = this.currentRoom.backgroundObjects.filter(
    obj => obj.eventFlag
  );

  for (const obj of markedObjects) {
    // Create particles at obj.position
    // Push to this.particles array
  }
}
```

**Particle Properties:**
- Position: Around object (random offset)
- Velocity: Upward float with drift
- Lifetime: 0.8-1.2 seconds
- Color: Event-specific
- Char: `*` for sparkles, `~` for smoke, etc.

---

## 1-Event-Per-Room Rule

**Enforcement:**
```javascript
for (const eventType of eventTypes) { // Sorted by priority
  if (eventType.condition(room)) {
    const eligible = eventType.eligibleObjects(room);
    if (eligible.length > 0) {
      eventType.mark(eligible[randomIndex]);
      room.activeSecretEvent = eventType.name;
      return; // STOP - only 1 event per room
    }
  }
}
```

**Why?**
- Prevents visual clutter
- Makes each event feel special
- Forces interesting decisions (key glitter OR leshy, not both)
- Scales well (10 event types won't overwhelm a single room)

---

## Testing Checklist

When adding a new event:

- [ ] Event definition added to `getSecretEventTypes()`
- [ ] Priority set appropriately (consider progression vs flavor)
- [ ] Condition function returns correct boolean
- [ ] Eligible objects filter works correctly
- [ ] Mark function sets correct flags on object
- [ ] Visual rendering added to `updateSecretEventEffects()`
- [ ] Particle color/char chosen and looks good
- [ ] Event overrides lower-priority events correctly
- [ ] Console logs confirm event is triggering
- [ ] Build compiles without errors

---

## Event Examples (Future)

### Potential Event Types

**Treasure Sparkle** (Priority 8)
- Cyan sparkles on crates/boxes with rare loot
- Discovery rooms only
- Helps players find hidden treasures

**Cursed Glow** (Priority 3)
- Purple glow on cursed items
- Warning indicator
- Flavor/atmosphere

**Mysterious Hum** (Priority 2)
- Sound waves from shrines
- Lore/world-building
- Pure flavor

**Blood Trail** (Priority 7)
- Red droplets leading to wounded enemy
- Boss intro mechanic
- Telegraphs encounter

**Ancient Runes** (Priority 6)
- Blue glowing symbols on rocks
- Puzzle/secret unlock
- Zone-specific (gray zone)

---

## Technical Notes

### Performance

- Events only checked once per room (on clear)
- Particle spawning uses timer (0.15s intervals)
- Typical particle count: 1-2 per object per spawn
- No performance impact observed

### Extensibility

System supports:
- Unlimited event types
- Complex conditions (multi-zone, depth-based, etc.)
- Multiple objects per event (future: glitter multiple objects)
- Event chaining (future: event A unlocks event B)
- State persistence (room.activeSecretEvent tracks current)

### Gotchas

- Event priority must be unique (or handle ties)
- Eligible objects must exist (empty array = skip event)
- Particle lifetime should match visual intent (too short = hard to see)
- Don't forget to mark background dirty if events modify visuals

---

## Contact Points in Code

**To add new event:**
1. `RoomGenerator.js:1510` - `getSecretEventTypes()` - Add event definition
2. `main.js:733` - `updateSecretEventEffects()` - Add particle rendering

**To modify priority:**
1. `RoomGenerator.js:1510` - Change `priority` value in event definition

**To debug events:**
1. Check console logs: `[Secret Event] Applied 'event_name'`
2. Inspect room object: `room.activeSecretEvent`
3. Inspect object flags: `obj.isGlittering`, `obj.leshyBush`, etc.

---

## Design Philosophy

**Events should be:**
- **Discoverable**: Visual cues clear and distinct
- **Meaningful**: Indicate something important (key, treasure, danger)
- **Consistent**: Same pattern for all events
- **Optional**: Never block core progression (except key glitter)
- **Delightful**: Small moments of surprise and discovery

**Events should NOT be:**
- Overwhelming (too many particles)
- Confusing (unclear what they mean)
- Annoying (constant spam)
- Required reading (players can ignore and learn naturally)
