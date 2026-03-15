# Changelog: v0.1 → v0.3

---

## v0.2

### Dodge Roll
- **Arrow keys now dodge** — tap ↑↓←→ to roll in any direction
- Diagonal and mid-roll direction changes supported
- Invincibility frames for the full roll duration (character fades to 40% opacity)
- Roll speed scales with your current movement speed
- Visual trail particles left behind during roll

### Character Roster & Lives
- **Captives now become playable characters** — find caged survivors after clearing 5 rooms, break the cage (SPACE), then recruit them
- 4 unlockable characters beyond the default, each with a unique dodge and weapon affinity:
  - **Red Warrior** — damage trail roll, melee windup bonus
  - **Cyan Rogue** — invisibility roll, faster bow fire rate
  - **Yellow Mage** — blink teleport, faster gun fire rate
  - **Gray Assassin** — fast dodge, extra trap capacity
- Death rotates to your next living character; game over only when all are gone
- Unlocked characters wait as idle NPCs in the REST hub; swap with SPACE

### Zone Progression
- **5 themed zones** replace the single endless dungeon: Forest → Caves → Crypt → Volcano → Abyss
- Zone exits are marked with letters on the map; direction determines which zone you enter
- Each zone has its own enemy mix and difficulty scaling
- Deeper zones introduce new enemy types (GooBlob, etc.)

### Balance & Fixes
- Gun fire rate halved (less spammy, more deliberate)
- Slime attacks now have a clear 1-second telegraph and can't be interrupted
- Dodge roll collision fixed (properly stops at walls)
- Fast dodge no longer skips through zone exits
- Starting loadout: 8 ingredients (2× Stick, String, Goo, Fur)
- Removed unimplemented Platform recipe

---

## v0.3

### Audio
- **Music and sound effects added** — ambient layered music in REST and EXPLORE, with additional layers activating dynamically
- SFX for: enemy aggro, blade attacks, whip attacks, bow charging, object destruction, dodge roll

### Neutral Rooms
- **New room type** between combat zones — safe spaces with NPCs to interact with
- The Leshy (forest spirit) appears as a neutral character with unique dialogue/interactions
- Neutral rooms break up the pacing and provide a breather before the next zone

### Content Expansion
- Significant new enemy variety across all zones
- New weapons, items, and recipes
- Expanded zone definitions with more distinct spawn tables per depth
- Room generation substantially overhauled — more varied layouts, object placement, and density

### Stability
- Fixed trap duplication bug
- Fixed character inventory consistency on swap/death
- Inventory system fully extracted to its own module (internal refactor, no UX change)
