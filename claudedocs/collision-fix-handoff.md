# Collision Fix Handoff — Unresolved Session

## The Actual Problem (Clarified Late)

The user wants **wall structure collision** to mirror render dimensions. Wall structures are the procedurally placed patterns (pillars, corridors, zigzags, etc.) from `WALL_STRUCTURES` in `GameConfig.js`. They render as `'█'` blocks and currently use **full 16×16 grid-cell collision**, which creates invisible walls around them.

## Architecture — Two Entirely Separate Collision Systems

### 1. Wall Structures → `collisionMap` → `checkAxisCollision`
- `placeWallStructures()` in `RoomGenerator.js` calls `stampStructure()` which sets `collisionMap[row][col] = true`
- No `BackgroundObject` is created for these cells — they are rendered directly by `ExploreRenderer.renderBackground()` as `'█'` at `#444444`
- Player collision against these cells goes through `PhysicsSystem.checkAxisCollision()` (`PhysicsSystem.js:275`)
- `checkAxisCollision` uses full-cell Y blocking; for X it already has a partial inset: only the inner `CELL_SIZE/4` to `CELL_SIZE - CELL_SIZE/4` region (px 4–12 of a 16px cell) is solid horizontally

### 2. Individual Background Objects → `backgroundObjects` array → `checkBackgroundObjectCollision`
- Rocks, boulders, metal boxes, crystals, shrines etc. are placed into `room.backgroundObjects`
- These use `obj.getHitbox()` which reads `this.width`, `this.height`, `this.hitboxOffsetX`, `this.hitboxOffsetY` from the `BackgroundObject` constructor
- A data-driven `hitbox: { w, h }` property was added to `BACKGROUND_OBJECTS` entries in `GameConfig.js` this session, and the constructor reads it — this system works correctly for individual objects

## What Was Done This Session (Some Useful, Some Noise)

### Useful — Background object hitboxes (correct direction, wrong target)
- `BackgroundObject.js` constructor now has priority chain: rock special-case → ground liquid special-case → tree/stump special-case → `this.data.hitbox` (data-driven) → default render-size (`CELL_SIZE*0.5 × CELL_SIZE*0.75`, centered)
- `BACKGROUND_OBJECTS['B']` (Metal Box): `hitbox: { w: 0.75, h: 0.75 }` → 12×12
- `BACKGROUND_OBJECTS['Q']` (Boulder): `hitbox: { w: 0.875, h: 0.875 }` → 14×14
- SKIN=1 fix added to `checkBackgroundObjectCollision` for sticky-corners (still unverified for wall structures)

### Not the Fix — Wall structures are unaffected by all of the above
The `hitbox` property, `BackgroundObject` changes, and `checkBackgroundObjectCollision` SKIN fix have zero effect on wall structure collision because wall structures never touch that code path.

## What Needs to Be Done

Fix `checkAxisCollision` in `PhysicsSystem.js` (line 275) so that wall-structure cells use a hitbox that mirrors the `'█'` glyph's render footprint rather than the full 16×16 cell.

Currently the X-axis already has a partial inset (inner 8px of 16px). The Y-axis uses full-cell.

**Target behavior (Zelda standard):**
- Both X and Y axes: treat the solid region as roughly `CELL_SIZE * 0.5` wide / `CELL_SIZE * 0.75` tall, centered in the cell
- Expressed as pixel boundaries per axis:
  - X solid zone: `cx*16 + 4` to `cx*16 + 12` (already partially done for X)
  - Y solid zone: `cy*16 + 2` to `cy*16 + 14`

The `checkAxisCollision` method signature:
```js
checkAxisCollision(collisionMap, testX, testY, width, height, axis = 'y')
// PhysicsSystem.js:275
```

For `axis === 'y'`, currently returns `true` for ANY overlap with a `true` cell. It needs the same inset treatment as `axis === 'x'` already has, but on the Y dimension.

## Sticky Corners (Still Unresolved for Wall Structures)

The user's second complaint ("push against a wall then can't move up/down") is also caused by `checkAxisCollision`, not `checkBackgroundObjectCollision`. The SKIN=1 fix added to `checkBackgroundObjectCollision` does NOT fix this for wall structures. The same skin-width concept needs to be applied inside `checkAxisCollision`:
- When checking X-axis movement, inset the Y bounds by 1px
- When checking Y-axis movement, inset the X bounds by 1px

This is the standard fix but it needs to be inside `checkAxisCollision`'s grid-cell math, not in the AABB background-object check.

## Key File Locations
- `src/systems/PhysicsSystem.js:275` — `checkAxisCollision` — needs the fix
- `src/rendering/state/ExploreRenderer.js:52` — renders collisionMap cells as `'█'`
- `src/systems/RoomGenerator.js:2028` — `stampStructure` — stamps collisionMap
- `src/systems/RoomGenerator.js:1848` — `placeWallStructures` — calls stampStructure
- `src/game/GameConfig.js` — `WALL_STRUCTURES` patterns, `BACKGROUND_OBJECTS` hitbox data
- `src/entities/BackgroundObject.js:38` — hitbox constructor logic (already updated)
