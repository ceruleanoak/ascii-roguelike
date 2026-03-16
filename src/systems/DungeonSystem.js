import { GRID } from '../game/GameConfig.js';
import { BackgroundObject } from '../entities/BackgroundObject.js';
import { Enemy } from '../entities/Enemy.js';
import { getZoneRandomEnemy } from '../data/enemies.js';
import { createDebris } from '../entities/Debris.js';

/**
 * DungeonSystem — multi-floor dungeon interior system.
 *
 * Uses the shared game.hutInterior / player.inHut state so the existing
 * physics redirect, combat redirect, and HutInteriorOverlay all work unchanged.
 *
 * Floor layout
 * ────────────
 * Floor 0 (entrance):
 *   ∩ exit door  at (STAIRS_COL, EXIT_ROW=23) → exit to exterior
 *   v stairs     at (STAIRS_COL, STAIRS_DOWN_ROW=4) → descend to floor 1
 *   Player enters at row 21 (near exit door)
 *
 * Floor 1+ (deeper floors):
 *   ^ stairs     at (STAIRS_COL, STAIRS_UP_ROW=3) → ascend to floor above
 *   v stairs     at (STAIRS_COL, STAIRS_DEEP_ROW=20) → descend to floor below
 *   Player enters from above at row STAIRS_UP_ROW+1
 *   Player enters from below at row STAIRS_DEEP_ROW-1
 *
 * Floor data persists in game.dungeonFloors[] for the duration of the visit.
 * Cleared when player exits to exterior or the room changes.
 */

const INTERIOR_COLS = 24;
const INTERIOR_ROWS = 24;

const STAIRS_COL      = 12;
const STAIRS_DOWN_ROW = 4;   // v stairs row on floor 0
const STAIRS_UP_ROW   = 3;   // ^ stairs row on floor 1+
const STAIRS_DEEP_ROW = 20;  // v stairs row on floor 1+
const EXIT_ROW        = 23;  // ∩ door row (floor 0 exit to exterior)

export class DungeonSystem {
  constructor(game) {
    this.game = game;
  }

  // ─── Floor Generation ─────────────────────────────────────────────────────

  generateFloor(floorIndex, depth) {
    const cols = INTERIOR_COLS;
    const rows = INTERIOR_ROWS;

    // Border cells solid, interior open
    const collisionMap = [];
    for (let r = 0; r < rows; r++) {
      collisionMap[r] = [];
      for (let c = 0; c < cols; c++) {
        collisionMap[r][c] = (r === 0 || r === rows - 1 || c === 0 || c === cols - 1);
      }
    }

    const backgroundObjects = [];

    // Sparse dungeon decor (bones, rocks, crystals)
    const decorChars = ['8', '0', '*', '8'];
    const decorCount = 5 + Math.floor(Math.random() * 5);
    for (let i = 0; i < decorCount; i++) {
      const col = 2 + Math.floor(Math.random() * (cols - 4));
      const row = 6 + Math.floor(Math.random() * (rows - 10));
      const char = decorChars[Math.floor(Math.random() * decorChars.length)];
      backgroundObjects.push(new BackgroundObject(char, col * GRID.CELL_SIZE, row * GRID.CELL_SIZE));
    }

    // Floor 0: ∩ exit door at south border + v stairs near top
    // Floor 1+: ^ stairs near top + v stairs near bottom (no ∩ door)
    if (floorIndex === 0) {
      // Exit door (∩) — opening already in collisionMap border
      collisionMap[EXIT_ROW][STAIRS_COL] = false;
      const exitDoor = new BackgroundObject('∩', STAIRS_COL * GRID.CELL_SIZE, EXIT_ROW * GRID.CELL_SIZE);
      backgroundObjects.push(exitDoor);
    } else {
      // Stairs up (^)
      const stairsUp = new BackgroundObject('^', STAIRS_COL * GRID.CELL_SIZE, STAIRS_UP_ROW * GRID.CELL_SIZE);
      backgroundObjects.push(stairsUp);
    }

    // Stairs down (v) — on all floors that aren't the max depth
    const stairsDown = new BackgroundObject('v', STAIRS_COL * GRID.CELL_SIZE, (floorIndex === 0 ? STAIRS_DOWN_ROW : STAIRS_DEEP_ROW) * GRID.CELL_SIZE);
    backgroundObjects.push(stairsDown);

    // Enemies — scale count and difficulty with floor depth
    const enemies = [];
    const spawnCount = 2 + floorIndex + Math.floor(Math.random() * 3);
    for (let i = 0; i < spawnCount; i++) {
      const zone = this.game.currentRoom?.zone || 'gray';
      const enemyChar = getZoneRandomEnemy(depth + floorIndex, zone);
      if (!enemyChar) continue;
      // Keep enemies away from staircase areas
      const col = 3 + Math.floor(Math.random() * (cols - 6));
      const row = 7 + Math.floor(Math.random() * (rows - 12));
      const enemy = new Enemy(enemyChar, col * GRID.CELL_SIZE, row * GRID.CELL_SIZE, depth + floorIndex);
      enemy.setCollisionMap(collisionMap);
      enemy.setBackgroundObjects(backgroundObjects);
      enemies.push(enemy);
    }

    return {
      floorIndex,
      gridCols: cols,
      gridRows: rows,
      collisionMap,
      backgroundObjects,
      enemies,
      items: [],
      npcs: [],
      doors: [],
      // Positions used by checkStairs / checkInteriorExit
      exitRow: floorIndex === 0 ? EXIT_ROW : null,
      exitCol: floorIndex === 0 ? STAIRS_COL : null,
      stairsDownRow: floorIndex === 0 ? STAIRS_DOWN_ROW : STAIRS_DEEP_ROW,
      stairsDownCol: STAIRS_COL,
      stairsUpRow: floorIndex === 0 ? null : STAIRS_UP_ROW,
      stairsUpCol: floorIndex === 0 ? null : STAIRS_COL,
    };
  }

  // ─── Entry Detection (exterior → floor 0) ────────────────────────────────

  checkDoorEntry() {
    const { game } = this;
    if (!game.player || game.player.inHut) return;
    if (!game.currentRoom?.dungeon) return;
    if ((game.player._hutEntryCooldown ?? 0) > 0) return;

    const dungeon = game.currentRoom.dungeon;
    const { doorPosition } = dungeon;
    if (!doorPosition) return;

    const doorPixelX = doorPosition.col * GRID.CELL_SIZE;
    const doorPixelY = doorPosition.row * GRID.CELL_SIZE;

    if (this._overlapsCell(game.player, doorPixelX, doorPixelY)) {
      game.player.hutExitPosition = {
        x: game.player.position.x,
        y: game.player.position.y
      };

      if (!game.dungeonFloors[0]) {
        const depth = game.getCurrentZoneDepth ? game.getCurrentZoneDepth() : 1;
        game.dungeonFloors[0] = this.generateFloor(0, depth);
      }

      // Enter from exterior: spawn near the ∩ door (row EXIT_ROW - 2)
      const spawn = {
        x: STAIRS_COL * GRID.CELL_SIZE,
        y: (EXIT_ROW - 2) * GRID.CELL_SIZE
      };
      this._activateFloor(0, spawn);
    }
  }

  // ─── Staircase Detection (within dungeon) ─────────────────────────────────

  checkStairs() {
    const { game } = this;
    if (!game.player?.inHut || !game.hutInterior) return;
    if (game.hutInterior.gridCols !== INTERIOR_COLS) return;
    if ((game.player._hutEntryCooldown ?? 0) > 0) return;

    const floor = game.hutInterior;
    const player = game.player;

    // Exit door (floor 0 only) — walk south to ∩
    if (floor.exitRow !== null && player.position.y >= floor.exitRow * GRID.CELL_SIZE) {
      this._exitDungeon();
      return;
    }

    // Stairs down (v)
    if (floor.stairsDownRow !== null) {
      const sxPx = floor.stairsDownCol * GRID.CELL_SIZE;
      const syPx = floor.stairsDownRow * GRID.CELL_SIZE;
      if (this._overlapsCell(player, sxPx, syPx)) {
        this._descendFloor();
        return;
      }
    }

    // Stairs up (^) — floor 1+ only
    if (floor.stairsUpRow !== null) {
      const sxPx = floor.stairsUpCol * GRID.CELL_SIZE;
      const syPx = floor.stairsUpRow * GRID.CELL_SIZE;
      if (this._overlapsCell(player, sxPx, syPx)) {
        this._ascendFloor();
        return;
      }
    }
  }

  // ─── Floor Transitions ────────────────────────────────────────────────────

  /**
   * Activate a floor, positioning the player at the provided spawn point.
   * Spawn is computed by the caller based on travel direction so the player
   * always lands on the correct side of the arrival staircase.
   */
  _activateFloor(floorIndex, spawn) {
    const { game } = this;
    const floor = game.dungeonFloors[floorIndex];

    // Swap physics entities
    if (game.hutInterior?.enemies) {
      for (const e of game.hutInterior.enemies) game.physicsSystem.removeEntity(e);
    }
    for (const e of floor.enemies) game.physicsSystem.addEntity(e);

    game.hutInterior = floor;
    game.dungeonCurrentFloor = floorIndex;

    game.player.setCollisionMap(floor.collisionMap);
    game.player.position.x = spawn.x;
    game.player.position.y = spawn.y;

    // Cooldown prevents the staircase we just came from from re-triggering
    game.player._hutEntryCooldown = 0.5;

    if (!game.player.inHut) game.player.inHut = true;

    game.renderer.backgroundDirty = true;
  }

  _descendFloor() {
    const { game } = this;
    const nextFloorIndex = game.dungeonCurrentFloor + 1;

    if (!game.dungeonFloors[nextFloorIndex]) {
      const depth = game.getCurrentZoneDepth ? game.getCurrentZoneDepth() : 1;
      game.dungeonFloors[nextFloorIndex] = this.generateFloor(nextFloorIndex, depth);
    }

    /**
     * Spawn position depends on which v stairs were used:
     *
     * Floor 0's v stairs are at the TOP (row STAIRS_DOWN_ROW=4).
     * The player pressed UP (north) to reach them → they arrive on floor 1
     * still moving north → spawn NORTH of ^ stairs (row STAIRS_UP_ROW-1=2).
     * Continuing north takes them away from ^ stairs. ✓
     *
     * Floor 1+'s v stairs are at the BOTTOM (row STAIRS_DEEP_ROW=20).
     * The player pressed DOWN (south) to reach them → they arrive on the
     * next floor still moving south → spawn SOUTH of ^ stairs (row STAIRS_UP_ROW+1=4).
     * Continuing south takes them away from ^ stairs. ✓
     */
    const isFromFloor0 = game.dungeonCurrentFloor === 0;
    const spawnRow = isFromFloor0
      ? STAIRS_UP_ROW - 1   // north of ^ stairs (row 2)
      : STAIRS_UP_ROW + 1;  // south of ^ stairs (row 4)

    this._activateFloor(nextFloorIndex, {
      x: STAIRS_COL * GRID.CELL_SIZE,
      y: spawnRow * GRID.CELL_SIZE
    });
  }

  _ascendFloor() {
    const { game } = this;
    const prevFloorIndex = game.dungeonCurrentFloor - 1;

    if (prevFloorIndex < 0) {
      this._exitDungeon();
      return;
    }

    /**
     * ^ stairs are always at the TOP (row STAIRS_UP_ROW=3).
     * The player pressed UP (north) to reach them → they arrive on the
     * floor above still moving north → spawn NORTH of that floor's v stairs.
     *
     * Floor 0's v stairs: row STAIRS_DOWN_ROW=4 → spawn row 3 (north of v).
     * Floor 1+'s v stairs: row STAIRS_DEEP_ROW=20 → spawn row 19 (north of v).
     * Continuing north takes them away from v stairs in both cases. ✓
     */
    const prevFloor = game.dungeonFloors[prevFloorIndex];
    const prevStairsRow = prevFloorIndex === 0 ? STAIRS_DOWN_ROW : STAIRS_DEEP_ROW;

    this._activateFloor(prevFloorIndex, {
      x: STAIRS_COL * GRID.CELL_SIZE,
      y: (prevStairsRow - 1) * GRID.CELL_SIZE
    });
  }

  _exitDungeon() {
    const { game } = this;

    // Remove current floor enemies from physics
    if (game.hutInterior?.enemies) {
      for (const e of game.hutInterior.enemies) game.physicsSystem.removeEntity(e);
    }

    // Restore exterior position
    if (game.player.hutExitPosition) {
      game.player.position.x = game.player.hutExitPosition.x;
      game.player.position.y = game.player.hutExitPosition.y;
    }

    // Restore exterior collision map
    if (game.currentRoom?.collisionMap) {
      game.player.setCollisionMap(game.currentRoom.collisionMap);
    }

    game.player.inHut = false;
    game.player._hutEntryCooldown = 0.5;

    // Clear hutPlane loot
    game.ingredients = game.ingredients.filter(i => !i.hutPlane);
    game.items = game.items.filter(i => !i.hutPlane);

    // Clear floor stack
    game.dungeonFloors = [];
    game.dungeonCurrentFloor = -1;
    game.hutInterior = null;

    game.renderer.backgroundDirty = true;
  }

  // ─── Update ───────────────────────────────────────────────────────────────

  update(dt) {
    const { game } = this;
    if (!game.player) return;

    // Tick re-entry cooldown
    if (game.player._hutEntryCooldown > 0) {
      game.player._hutEntryCooldown -= dt;
    }

    if (game.player.inHut && game.hutInterior) {
      // Only process if this is a dungeon interior (24 cols)
      if (game.hutInterior.gridCols !== INTERIOR_COLS) return;

      const floor = game.hutInterior;

      // Update interior enemies
      for (const enemy of floor.enemies) {
        enemy.target = game.player;
        enemy.update(dt);
      }

      // Process interior enemy deaths
      for (let i = floor.enemies.length - 1; i >= 0; i--) {
        const enemy = floor.enemies[i];
        if (enemy.hp <= 0) {
          game.audioSystem?.playSFX('destroy');
          game.spawnLoot(enemy);

          const enemyDebris = createDebris(
            enemy.position.x + GRID.CELL_SIZE / 2,
            enemy.position.y + GRID.CELL_SIZE / 2,
            4 + Math.floor(Math.random() * 3),
            '#666666'
          );
          for (const piece of enemyDebris) piece.hutPlane = true;
          game.debris.push(...enemyDebris);
          for (const piece of enemyDebris) game.physicsSystem.addEntity(piece);

          game.physicsSystem.removeEntity(enemy);
          floor.enemies.splice(i, 1);
        }
      }

      // Update background objects
      for (const obj of floor.backgroundObjects) obj.update(dt);

      this.checkStairs();
    } else if (!game.player.inHut) {
      this.checkDoorEntry();
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  _overlapsCell(player, cellPixelX, cellPixelY) {
    const px = player.position.x;
    const py = player.position.y;
    const pw = GRID.CELL_SIZE;
    const ph = GRID.CELL_SIZE;
    return (
      px < cellPixelX + pw &&
      px + pw > cellPixelX &&
      py < cellPixelY + ph &&
      py + ph > cellPixelY
    );
  }
}
