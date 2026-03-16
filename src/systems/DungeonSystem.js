import { GRID } from '../game/GameConfig.js';
import { BackgroundObject } from '../entities/BackgroundObject.js';
import { Enemy } from '../entities/Enemy.js';
import { Item } from '../entities/Item.js';
import { Particle } from '../entities/Particle.js';
import { getZoneRandomEnemy } from '../data/enemies.js';
import { createDebris } from '../entities/Debris.js';

// Reward weapon chars by floor tier — all mid-to-high tier since the dungeon is tough
const REWARD_TIERS = [
  ['‡', '⊤', '⇒', '♠'],         // floor 0: Flame Sword, Bone Axe, Sky Bow, Acid Blade (3-4 dmg)
  ['⌘', '☠', '⚒', '⚔'],        // floor 1-2: Dragon Blade, Venom Blade, Bone Crusher, Legendary Flame Sword (5-6 dmg)
  ['⚔', '⚒', '☼'],              // floor 3+: top-tier weapons
];

function _getFloorRewardItem(floorIndex) {
  const tier = Math.min(Math.floor(floorIndex / 2), REWARD_TIERS.length - 1);
  const pool = REWARD_TIERS[tier];
  return pool[Math.floor(Math.random() * pool.length)];
}

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
const MAX_FLOOR_INDEX = 2;   // 3 floors total (0, 1, 2)

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

    // Stairs down (v) — only on floors below the cap
    const isLastFloor = floorIndex >= MAX_FLOOR_INDEX;
    const stairsDownRow = floorIndex === 0 ? STAIRS_DOWN_ROW : STAIRS_DEEP_ROW;
    let stairsDown = null;
    if (!isLastFloor) {
      stairsDown = new BackgroundObject('x', STAIRS_COL * GRID.CELL_SIZE, stairsDownRow * GRID.CELL_SIZE);
      stairsDown.char = 'x';
      stairsDown.color = '#cc3333';
      stairsDown.animationChar = 'x';
      stairsDown.animationColor = '#cc3333';
      backgroundObjects.push(stairsDown);
    }

    // Reward item — spawned on the floor as a pickable Item
    const rewardChar = _getFloorRewardItem(floorIndex);
    const rewardItem = new Item(rewardChar, 4 * GRID.CELL_SIZE, 12 * GRID.CELL_SIZE);
    rewardItem.hutPlane = true;

    // Enemies — scale count and difficulty with floor depth
    const enemies = [];
    const spawnCount = 2 + floorIndex + Math.floor(Math.random() * 3);
    for (let i = 0; i < spawnCount; i++) {
      const zone = this.game.currentRoom?.zone || 'gray';
      const enemyChar = getZoneRandomEnemy(depth + floorIndex, zone);
      if (!enemyChar) continue;
      // Keep enemies away from staircase areas and reward item
      const col = 3 + Math.floor(Math.random() * (cols - 6));
      const row = 7 + Math.floor(Math.random() * (rows - 12));
      const enemy = new Enemy(enemyChar, col * GRID.CELL_SIZE, row * GRID.CELL_SIZE, depth + floorIndex);
      enemy.setCollisionMap(collisionMap);
      enemy.setBackgroundObjects(backgroundObjects);
      enemies.push(enemy);
    }

    // Unlock condition — only on floors that have stairs down
    const conditionType = isLastFloor ? null : ['key_enemy', 'glitter_object', 'item_slot'][Math.floor(Math.random() * 3)];
    let unlockCondition = { type: conditionType };

    if (conditionType === null) {
      // Last floor — no stairs, no unlock condition needed
    } else if (conditionType === 'key_enemy' && enemies.length > 0) {
      const keyEnemy = enemies[Math.floor(Math.random() * enemies.length)];
      keyEnemy.hasKey = true;
    } else if (conditionType === 'glitter_object') {
      // Find a bg object with hp to make glitter (non-stairs)
      const candidates = backgroundObjects.filter(o =>
        o !== stairsDown && o.hp !== null && o.maxHp !== null
      );
      if (candidates.length > 0) {
        const target = candidates[Math.floor(Math.random() * candidates.length)];
        target.isGlittering = true;
        target.glitterColor = '#00ffcc';
        // Persistent teal tint so players can identify the target
        target.color = '#00ffcc';
        target.animationColor = '#00ffcc';
        // Monkey-patch takeDamage: object never dies but sets glitterHit flag
        const origTakeDamage = target.takeDamage.bind(target);
        target.takeDamage = (amount, isBlade) => {
          origTakeDamage(amount, isBlade);
          target.hp = target.maxHp; // restore — object never dies
          target.glitterHit = true; // polled in update() to unlock stairs
          return { destroyed: false, effect: null };
        };
      } else {
        // Fallback to item_slot if no valid candidate
        unlockCondition = { type: 'item_slot', col: 20, row: 12, slotItem: null };
      }
    } else if (conditionType === 'item_slot') {
      unlockCondition = { type: 'item_slot', col: 20, row: 12, slotItem: null };
    }

    return {
      floorIndex,
      gridCols: cols,
      gridRows: rows,
      collisionMap,
      backgroundObjects,
      enemies,
      items: [rewardItem],
      ingredients: [],
      npcs: [],
      doors: [],
      // Positions used by checkStairs / checkInteriorExit
      exitRow: floorIndex === 0 ? EXIT_ROW : null,
      exitCol: floorIndex === 0 ? STAIRS_COL : null,
      stairsDownRow: isLastFloor ? null : stairsDownRow,
      stairsDownCol: isLastFloor ? null : STAIRS_COL,
      stairsUpRow: floorIndex === 0 ? null : STAIRS_UP_ROW,
      stairsUpCol: floorIndex === 0 ? null : STAIRS_COL,
      // Lock system
      stairsLocked: !isLastFloor, // last floor has no stairs to lock
      unlockCondition,
      stairsDownObj: stairsDown, // null on last floor
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

    // Stairs (up/down) are now triggered by SPACE, not by walking into them.
    // See handleSpacePress() below.
  }

  /** Returns 'down', 'up', or null depending on which staircase the player is overlapping. */
  nearStairsType() {
    const { game } = this;
    if (!game.player?.inHut || !game.hutInterior) return null;
    if (game.hutInterior.gridCols !== INTERIOR_COLS) return null;
    const floor = game.hutInterior;
    const player = game.player;

    if (floor.stairsDownRow !== null && !floor.stairsLocked) {
      const sxPx = floor.stairsDownCol * GRID.CELL_SIZE;
      const syPx = floor.stairsDownRow * GRID.CELL_SIZE;
      if (this._overlapsCell(player, sxPx, syPx)) return 'down';
    }

    if (floor.stairsUpRow !== null) {
      const sxPx = floor.stairsUpCol * GRID.CELL_SIZE;
      const syPx = floor.stairsUpRow * GRID.CELL_SIZE;
      if (this._overlapsCell(player, sxPx, syPx)) return 'up';
    }

    return null;
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

    // Swap physics entities — enemies
    if (game.hutInterior?.enemies) {
      for (const e of game.hutInterior.enemies) game.physicsSystem.removeEntity(e);
    }
    for (const e of floor.enemies) game.physicsSystem.addEntity(e);

    // Swap floor items + ingredients: save current floor's hutPlane entities, load new floor's
    if (game.hutInterior) {
      const prevFloorIndex = game.dungeonCurrentFloor;
      if (prevFloorIndex >= 0 && game.dungeonFloors[prevFloorIndex]) {
        game.dungeonFloors[prevFloorIndex].items       = game.items.filter(i => i.hutPlane);
        game.dungeonFloors[prevFloorIndex].ingredients = game.ingredients.filter(i => i.hutPlane);
      }
      game.items       = game.items.filter(i => !i.hutPlane);
      game.ingredients = game.ingredients.filter(i => !i.hutPlane);
    }
    for (const item of floor.items) {
      if (!game.items.includes(item)) game.items.push(item);
    }
    for (const ing of (floor.ingredients || [])) {
      if (!game.ingredients.includes(ing)) game.ingredients.push(ing);
    }

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
    if (nextFloorIndex > MAX_FLOOR_INDEX) return; // cap reached

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
          // Key enemy killed → unlock stairs
          if (enemy.hasKey && floor.stairsLocked) {
            floor.stairsLocked = false;
            this._spawnStairsUnlockEffect(floor);
          }

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

      // Glitter object hit check → unlock stairs
      if (floor.stairsLocked && floor.unlockCondition?.type === 'glitter_object') {
        for (const obj of floor.backgroundObjects) {
          if (obj.glitterHit) {
            obj.glitterHit = false;
            floor.stairsLocked = false;
            this._spawnStairsUnlockEffect(floor);
            break;
          }
        }
      }

      // Glitter particle emission (every 3s)
      this._glitterTimer = (this._glitterTimer || 0) + dt;
      if (this._glitterTimer >= 3.0) {
        this._glitterTimer = 0;
        for (const obj of floor.backgroundObjects) {
          if (!obj.isGlittering || obj.destroyed) continue;
          for (let g = 0; g < 3; g++) {
            const p = new Particle(
              obj.position.x + (Math.random() - 0.5) * 8,
              obj.position.y + (Math.random() - 0.5) * 8,
              '*',
              obj.glitterColor || '#00ffcc',
              { vx: (Math.random() - 0.5) * 20, vy: -30 - Math.random() * 20 },
              0.8 + Math.random() * 0.4
            );
            game.particles.push(p);
          }
        }
      }

      // Stairs visual update based on lock state (must update animationChar/animationColor — what getRenderPosition() uses)
      if (floor.stairsDownObj) {
        const lockedColor = '#cc3333';
        const unlockedColor = '#8b7355';
        const stairsChar = floor.stairsLocked ? 'x' : 'v';
        const stairsColor = floor.stairsLocked ? lockedColor : unlockedColor;
        floor.stairsDownObj.char = stairsChar;
        floor.stairsDownObj.color = stairsColor;
        floor.stairsDownObj.animationChar = stairsChar;
        floor.stairsDownObj.animationColor = stairsColor;
      }

      // Update background objects
      for (const obj of floor.backgroundObjects) obj.update(dt);

      this.checkStairs();
    } else if (!game.player.inHut) {
      this.checkDoorEntry();
    }
  }

  // ─── Item Slot Interaction ────────────────────────────────────────────────

  /**
   * SPACE inside dungeon: descend/ascend stairs, or retrieve from sacrifice slot.
   * Returns true if handled (prevents default SPACE behavior).
   */
  handleSpacePress() {
    const { game } = this;
    if (!game.player?.inHut || !game.hutInterior) return false;
    if ((game.player._hutEntryCooldown ?? 0) > 0) return false;

    // Staircase transitions take priority
    const stairsType = this.nearStairsType();
    if (stairsType === 'down') { this._descendFloor(); return true; }
    if (stairsType === 'up')   { this._ascendFloor();  return true; }

    const floor = game.hutInterior;
    const uc = floor.unlockCondition;
    if (uc?.type !== 'item_slot' || !uc.slotItem) return false;

    // Proximity check (2 cells)
    const slotPx = uc.col * GRID.CELL_SIZE;
    const slotPy = uc.row * GRID.CELL_SIZE;
    const dx = game.player.position.x - slotPx;
    const dy = game.player.position.y - slotPy;
    if (Math.sqrt(dx * dx + dy * dy) > GRID.CELL_SIZE * 2) return false;

    // Return item to player quick slots (first empty slot)
    const slots = game.player.quickSlots;
    let placed = false;
    for (let i = 0; i < slots.length; i++) {
      if (!slots[i]) {
        slots[i] = uc.slotItem;
        placed = true;
        break;
      }
    }
    if (!placed) return false; // No empty slot to return to

    uc.slotItem = null;
    floor.stairsLocked = true;
    return true;
  }

  /**
   * SHIFT near item slot: deposit active weapon into sacrifice slot (unlocks stairs).
   * Returns true if handled (prevents default SHIFT behavior).
   */
  handleShiftPress() {
    const { game } = this;
    if (!game.player?.inHut || !game.hutInterior) return false;
    const floor = game.hutInterior;
    const uc = floor.unlockCondition;
    if (uc?.type !== 'item_slot' || uc.slotItem) return false;

    // Proximity check (2 cells)
    const slotPx = uc.col * GRID.CELL_SIZE;
    const slotPy = uc.row * GRID.CELL_SIZE;
    const dx = game.player.position.x - slotPx;
    const dy = game.player.position.y - slotPy;
    if (Math.sqrt(dx * dx + dy * dy) > GRID.CELL_SIZE * 2) return false;

    // Grab active item from player's quick slot
    const slotIndex = game.player.activeSlotIndex;
    const active = game.player.quickSlots[slotIndex];
    if (!active) return false;

    game.player.quickSlots[slotIndex] = null;
    uc.slotItem = active;
    floor.stairsLocked = false;
    this._spawnStairsUnlockEffect(floor);
    return true;
  }

  // ─── Unlock Visual Effect ─────────────────────────────────────────────────

  _spawnStairsUnlockEffect(floor) {
    const { game } = this;
    if (!floor.stairsDownObj) return;
    const sx = floor.stairsDownObj.position.x + GRID.CELL_SIZE / 2;
    const sy = floor.stairsDownObj.position.y + GRID.CELL_SIZE / 2;
    const chars = ['*', '+', '߃', '*', '+'];
    const colors = ['#ffcc00', '#ffffff', '#ffcc00', '#ffffaa', '#ffcc00'];
    for (let i = 0; i < chars.length; i++) {
      const angle = (i / chars.length) * Math.PI * 2;
      const speed = 30 + Math.random() * 30;
      const p = new Particle(
        sx + (Math.random() - 0.5) * 6,
        sy + (Math.random() - 0.5) * 6,
        chars[i],
        colors[i],
        { vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 20 },
        1.0 + Math.random() * 0.5
      );
      game.particles.push(p);
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
