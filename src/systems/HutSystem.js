import { GRID } from '../game/GameConfig.js';
import { BackgroundObject } from '../entities/BackgroundObject.js';
import { Enemy } from '../entities/Enemy.js';
import { getZoneRandomEnemy } from '../data/enemies.js';
import { createDebris } from '../entities/Debris.js';

/**
 * HutSystem — manages hut interior entry/exit and interior state.
 *
 * When the player steps into a hut door (∩) on the exterior:
 *   - Generates a 24×24 interior grid
 *   - Teleports the player into the interior coordinate space
 *   - Sets player.inHut = true
 *
 * When the player steps on the interior exit door:
 *   - Restores player to exterior position
 *   - Sets player.inHut = false
 *   - Clears game.hutInterior
 *
 * Coordinate contract:
 *   Interior pixel coords: 0–384 (24 cells × 16px)
 *   Canvas offset for rendering: 48px (3 cells × 16px) on each side
 */

// Hut interior is intentionally small — a cozy 10×10 space (playable 8×8 cells).
// Dungeon interiors (DungeonSystem) use the full 24×24 grid.
const INTERIOR_COLS = 10;
const INTERIOR_ROWS = 10;

export class HutSystem {
  constructor(game) {
    this.game = game;
  }

  // ─── Interior Generation ─────────────────────────────────────────────────

  generateHutInterior(hutKind, depth) {
    const cols = INTERIOR_COLS;
    const rows = INTERIOR_ROWS;

    // Build collision map: border solid, interior open
    const collisionMap = [];
    for (let r = 0; r < rows; r++) {
      collisionMap[r] = [];
      for (let c = 0; c < cols; c++) {
        collisionMap[r][c] = (r === 0 || r === rows - 1 || c === 0 || c === cols - 1);
      }
    }

    // Background objects: simple border wall visuals + sparse decor
    const backgroundObjects = [];

    // Interior floor decor (very sparse — hut is small)
    const decorChars = ['n', '*', '8', '%'];
    const decorCount = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < decorCount; i++) {
      const col = 2 + Math.floor(Math.random() * (cols - 4));
      const row = 2 + Math.floor(Math.random() * (rows - 5));
      const char = decorChars[Math.floor(Math.random() * decorChars.length)];
      backgroundObjects.push(new BackgroundObject(char, col * GRID.CELL_SIZE, row * GRID.CELL_SIZE));
    }

    // Enemy list (stub: spawned based on hutKind)
    const enemies = [];
    if (hutKind === 'enemy_encounter') {
      const spawnCount = 1 + Math.floor(Math.random() * 2); // 1–2 (hut is small)
      for (let i = 0; i < spawnCount; i++) {
        const zone = this.game.currentRoom?.zone || 'green';
        const enemyChar = getZoneRandomEnemy(depth, zone);
        if (!enemyChar) continue;
        const col = 2 + Math.floor(Math.random() * (cols - 4));
        const row = 2 + Math.floor(Math.random() * (rows - 6));
        const enemy = new Enemy(enemyChar, col * GRID.CELL_SIZE, row * GRID.CELL_SIZE, depth);
        enemy.setCollisionMap(collisionMap);
        enemy.setBackgroundObjects(backgroundObjects);
        enemies.push(enemy);
      }
    }
    // 'neutral_npc': interior left clear; NPC placeholder reserved for future

    // Interior exit door at south-center border
    const exitCol = Math.floor(cols / 2);
    const exitRow = rows - 1;
    const exitDoor = new BackgroundObject('∩', exitCol * GRID.CELL_SIZE, exitRow * GRID.CELL_SIZE);
    backgroundObjects.push(exitDoor);
    // Open the south-center collision cell so the player can walk to it
    collisionMap[exitRow][exitCol] = false;

    // Player spawn: just inside the south door
    const spawnPoint = {
      x: exitCol * GRID.CELL_SIZE,
      y: (exitRow - 2) * GRID.CELL_SIZE
    };

    return {
      gridCols: cols,
      gridRows: rows,
      collisionMap,
      backgroundObjects,
      enemies,
      npcs: [],
      items: [],
      doors: [{ col: exitCol, row: exitRow, leadsTo: null }],
      hutKind,
      spawnPoint,
      exitCol,
      exitRow
    };
  }

  // ─── Entry / Exit Detection ───────────────────────────────────────────────

  checkDoorEntry() {
    const { game } = this;
    if (!game.player || game.player.inHut) return;
    if (!game.currentRoom?.hut) return;

    const hut = game.currentRoom.hut;
    const { doorPosition } = hut;
    if (!doorPosition) return;

    const doorPixelX = doorPosition.col * GRID.CELL_SIZE;
    const doorPixelY = doorPosition.row * GRID.CELL_SIZE;

    if ((game.player._hutEntryCooldown ?? 0) > 0) return;

    if (this._overlapsCell(game.player, doorPixelX, doorPixelY)) {
      // Save exterior position
      game.player.hutExitPosition = {
        x: game.player.position.x,
        y: game.player.position.y
      };

      // Generate interior
      const depth = game.getCurrentZoneDepth ? game.getCurrentZoneDepth() : 1;
      game.hutInterior = this.generateHutInterior(hut.hutKind, depth);
      hut.interiorGenerated = true;

      // Register interior enemies with physics
      for (const enemy of game.hutInterior.enemies) {
        game.physicsSystem.addEntity(enemy);
      }

      // Switch player collision map to interior grid
      game.player.setCollisionMap(game.hutInterior.collisionMap);

      // Teleport player into interior
      game.player.position.x = game.hutInterior.spawnPoint.x;
      game.player.position.y = game.hutInterior.spawnPoint.y;
      game.player.inHut = true;

      // Force background redraw so the overlay paints immediately
      game.renderer.backgroundDirty = true;
    }
  }

  checkInteriorExit() {
    const { game } = this;
    if (!game.player?.inHut || !game.hutInterior) return;

    const { exitCol, exitRow } = game.hutInterior;
    const doorPixelX = exitCol * GRID.CELL_SIZE;
    const doorPixelY = exitRow * GRID.CELL_SIZE;

    // Player exits when they step onto the exit door cell (row 23 = rows-1)
    if (game.player.position.y >= exitRow * GRID.CELL_SIZE) {
      this._exitHut();
    }
  }

  _exitHut() {
    const { game } = this;

    // Remove interior enemies from physics
    if (game.hutInterior?.enemies) {
      for (const enemy of game.hutInterior.enemies) {
        game.physicsSystem.removeEntity(enemy);
      }
    }

    // Restore exact exterior position and set a brief cooldown so
    // checkDoorEntry() does not immediately re-trigger on the next frame.
    if (game.player.hutExitPosition) {
      game.player.position.x = game.player.hutExitPosition.x;
      game.player.position.y = game.player.hutExitPosition.y;
    }
    game.player._hutEntryCooldown = 0.5;

    // Restore player collision map to exterior room
    if (game.currentRoom?.collisionMap) {
      game.player.setCollisionMap(game.currentRoom.collisionMap);
    }

    game.player.inHut = false;

    // Clear hutPlane loot (ingredients/items spawned inside are abandoned on exit)
    game.ingredients = game.ingredients.filter(i => !i.hutPlane);
    game.items = game.items.filter(i => !i.hutPlane);

    game.hutInterior = null;

    // Force background redraw
    game.renderer.backgroundDirty = true;
  }

  // ─── Update ───────────────────────────────────────────────────────────────

  update(dt) {
    const { game } = this;
    if (!game.player) return;

    // Tick re-entry cooldown (prevents immediate re-entry after exiting)
    if (game.player._hutEntryCooldown > 0) {
      game.player._hutEntryCooldown -= dt;
    }

    if (game.player.inHut && game.hutInterior) {
      // Only process if this is a hut interior (10 cols), not a dungeon (24 cols)
      if (game.hutInterior.gridCols !== INTERIOR_COLS) return;

      // Update interior enemies
      for (const enemy of game.hutInterior.enemies) {
        enemy.target = game.player;
        enemy.update(dt);
      }

      // Process interior enemy deaths
      for (let i = game.hutInterior.enemies.length - 1; i >= 0; i--) {
        const enemy = game.hutInterior.enemies[i];
        if (enemy.hp <= 0) {
          game.audioSystem?.playSFX('destroy');

          // Spawn loot (LootSystem marks hutPlane when player.inHut)
          game.spawnLoot(enemy);

          // Create debris at enemy position (hutPlane so overlay renders it)
          const enemyDebris = createDebris(
            enemy.position.x + GRID.CELL_SIZE / 2,
            enemy.position.y + GRID.CELL_SIZE / 2,
            4 + Math.floor(Math.random() * 3),
            '#666666'
          );
          for (const piece of enemyDebris) {
            piece.hutPlane = true;
          }
          game.debris.push(...enemyDebris);
          for (const piece of enemyDebris) {
            game.physicsSystem.addEntity(piece);
          }

          game.physicsSystem.removeEntity(enemy);
          game.hutInterior.enemies.splice(i, 1);
        }
      }

      // Update interior background objects
      for (const obj of game.hutInterior.backgroundObjects) {
        obj.update(dt);
      }
      this.checkInteriorExit();
    } else {
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
