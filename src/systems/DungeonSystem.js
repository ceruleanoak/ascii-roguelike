import { GRID, PHYSICS } from '../game/GameConfig.js';
import { BackgroundObject } from '../entities/BackgroundObject.js';
import { Enemy } from '../entities/Enemy.js';
import { Item } from '../entities/Item.js';
import { Particle } from '../entities/Particle.js';
import { getZoneRandomEnemy } from '../data/enemies.js';
import { pickRandomTemplateName, applyTemplateToCollisionMap } from '../data/dungeonFloorTemplates.js';

// Reward weapons by floor (1-indexed in design talk, 0-indexed here).
// Only the puzzle floor (index 2) and the deepest hidden floor (index 4) drop a reward;
// the other floors have no weapon pickup, making the dungeon's rewards feel earned.
//   Floor 3 (index 2) — Tier 3: top-tier craftable weapons
//   Floor 5 (index 4) — Tier 4: § Sword of the Letter (uncraftable legendary)
const REWARD_BY_FLOOR = {
  2: ['⚔', '⚒', '☼'],
  4: ['§'],
};

function _getFloorRewardItem(floorIndex) {
  const pool = REWARD_BY_FLOOR[floorIndex];
  if (!pool) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * DungeonSystem — multi-floor dungeon interior system.
 *
 * Uses the shared game.activeFloor / player.inDungeon state so the existing
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

// Proximity radius for door/staircase interaction (px from cell center)
const DOOR_INTERACT_RADIUS = GRID.CELL_SIZE * 2;

const STAIRS_COL      = 12;
const STAIRS_DOWN_ROW = 4;   // v stairs row on floor 0
const STAIRS_UP_ROW   = 3;   // ^ stairs row on floor 1+
const STAIRS_DEEP_ROW = 20;  // v stairs row on floor 1+
const EXIT_ROW        = 23;  // ∩ door row (floor 0 exit to exterior)
const MAX_FLOOR_INDEX = 4;   // 5 floors total (0–4); floors 3–4 are hidden behind floor 2's switch puzzle (green zone)

// Companion-switch puzzle (green-zone floor 2 only)
const SWITCH_ROW   = 11;
const SWITCH_A_COL = 7;
const SWITCH_B_COL = 17;

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

    // ── Interior wall template ───────────────────────────────────────────────
    // Reserve the staircase corridor (col STAIRS_COL between the two stair rows
    // plus the spawn approach) so templates never block reachability. The green
    // companion-switch floor uses the bare 'open' layout — its puzzle assumes
    // a clean playfield.
    const zoneForTemplate = this.game.currentRoom?.zone || 'gray';
    const isCompanionPuzzleFloor = floorIndex === 2 && zoneForTemplate === 'green';
    if (!isCompanionPuzzleFloor) {
      const reserved = [];
      // Col 12 stair corridor (rows 3..21 covers both stair pairs + spawn)
      for (let r = 3; r <= 21; r++) reserved.push({ row: r, col: STAIRS_COL });
      // Side cells of stair rows so the player can step off the stair tile
      const stairRows = [STAIRS_DOWN_ROW, STAIRS_UP_ROW, STAIRS_DEEP_ROW];
      for (const sr of stairRows) {
        reserved.push({ row: sr, col: STAIRS_COL - 1 });
        reserved.push({ row: sr, col: STAIRS_COL + 1 });
      }
      const templateName = pickRandomTemplateName();
      applyTemplateToCollisionMap(collisionMap, templateName, reserved);
    }

    const backgroundObjects = [];

    // Pick a random open cell (not a wall, not the staircase column). Used for
    // decor and enemy spawns so the template's walls don't trap entities.
    const pickOpenCell = (minRow, maxRow, minCol, maxCol) => {
      for (let attempt = 0; attempt < 20; attempt++) {
        const r = minRow + Math.floor(Math.random() * (maxRow - minRow + 1));
        const c = minCol + Math.floor(Math.random() * (maxCol - minCol + 1));
        if (collisionMap[r]?.[c]) continue;
        if (c === STAIRS_COL) continue;
        return { row: r, col: c };
      }
      return null;
    };

    // Sparse dungeon decor (bones, rocks, crystals)
    const decorChars = ['8', '0', '*', '8'];
    const decorCount = 5 + Math.floor(Math.random() * 5);
    for (let i = 0; i < decorCount; i++) {
      const cell = pickOpenCell(6, rows - 5, 2, cols - 3);
      if (!cell) continue;
      const char = decorChars[Math.floor(Math.random() * decorChars.length)];
      backgroundObjects.push(new BackgroundObject(char, cell.col * GRID.CELL_SIZE, cell.row * GRID.CELL_SIZE));
    }

    // Floor 0: ∩ exit door at south border + v stairs near top
    // Floor 1+: ^ stairs near top + v stairs near bottom (no ∩ door)
    if (floorIndex === 0) {
      // Exit door (∩) — border cell stays solid; SPACE proximity handles exit (same pattern as hut).
      // Do NOT open the collision map here — a walkable gap lets the player escape the interior bounds.
      const exitDoor = new BackgroundObject('∩', STAIRS_COL * GRID.CELL_SIZE, EXIT_ROW * GRID.CELL_SIZE);
      backgroundObjects.push(exitDoor);
    } else {
      // Stairs up ('{') — '^' is reserved for tunnel entrances in BACKGROUND_OBJECTS
      const stairsUp = new BackgroundObject('{', STAIRS_COL * GRID.CELL_SIZE, STAIRS_UP_ROW * GRID.CELL_SIZE);
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

    // Reward item — only on floors 2 (puzzle) and 4 (deepest hidden); other floors have no pickup.
    const rewardChar = _getFloorRewardItem(floorIndex);
    const rewardItem = rewardChar
      ? Object.assign(new Item(rewardChar, 4 * GRID.CELL_SIZE, 12 * GRID.CELL_SIZE), { hutPlane: true })
      : null;

    // Enemies — scale count and difficulty with floor depth
    const enemies = [];
    const spawnCount = 2 + floorIndex + Math.floor(Math.random() * 3);
    for (let i = 0; i < spawnCount; i++) {
      const zone = this.game.currentRoom?.zone || 'gray';
      const enemyChar = getZoneRandomEnemy(depth + floorIndex, zone);
      if (!enemyChar) continue;
      // Keep enemies away from staircase areas and reward item
      const cell = pickOpenCell(7, rows - 5, 3, cols - 4);
      if (!cell) continue;
      const enemy = new Enemy(enemyChar, cell.col * GRID.CELL_SIZE, cell.row * GRID.CELL_SIZE, depth + floorIndex);
      enemy.setCollisionMap(collisionMap);
      enemy.setBackgroundObjects(backgroundObjects);
      enemies.push(enemy);
    }

    // Unlock condition — only on floors that have stairs down.
    // Green-zone floor 2 is a fixed companion-switch puzzle (hidden floors 3–4 below).
    const zone = this.game.currentRoom?.zone || 'gray';
    const isCompanionPuzzle = !isLastFloor && floorIndex === 2 && zone === 'green';
    const conditionType = isLastFloor
      ? null
      : (isCompanionPuzzle ? 'companion_switches' : ['key_enemy', 'glitter_object', 'item_slot'][Math.floor(Math.random() * 3)]);
    let unlockCondition = { type: conditionType };

    let switchAObj = null;
    let switchBObj = null;

    if (conditionType === null) {
      // Last floor — no stairs, no unlock condition needed
    } else if (conditionType === 'companion_switches') {
      // Two floor switches that must be pressed simultaneously by player + companion.
      switchAObj = new BackgroundObject('○', SWITCH_A_COL * GRID.CELL_SIZE, SWITCH_ROW * GRID.CELL_SIZE);
      switchAObj.color = '#888888';
      switchAObj.animationChar = '○';
      switchAObj.animationColor = '#888888';
      switchAObj.isPressed = false;
      backgroundObjects.push(switchAObj);

      switchBObj = new BackgroundObject('○', SWITCH_B_COL * GRID.CELL_SIZE, SWITCH_ROW * GRID.CELL_SIZE);
      switchBObj.color = '#888888';
      switchBObj.animationChar = '○';
      switchBObj.animationColor = '#888888';
      switchBObj.isPressed = false;
      backgroundObjects.push(switchBObj);
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
        // puzzleSignal=true is handled in BackgroundObject.takeDamage: HP is preserved,
        // glitterHit pulses true on every hit, and the unlock-condition poll in update()
        // consumes the flag. No runtime method override required.
        // isGlittering drives the sparkle particle visual (shared with K-room key glitter).
        target.isGlittering = true;
        target.puzzleSignal = true;
        target.glitterColor = '#00ffcc';
        // Persistent teal tint so players can identify the target
        target.color = '#00ffcc';
        target.animationColor = '#00ffcc';
      } else {
        // Fallback to item_slot if no valid candidate
        unlockCondition = { type: 'item_slot', col: 20, row: 12, slotItem: null };
      }
    } else if (conditionType === 'item_slot') {
      unlockCondition = { type: 'item_slot', col: 20, row: 12, slotItem: null };
    }

    // Viewport metadata: where the PiP panel renders on the main canvas.
    // Phase A only stores this; Phase B will route ExploreRenderer through it.
    const interiorPxW = cols * GRID.CELL_SIZE;
    const interiorPxH = rows * GRID.CELL_SIZE;
    const viewport = {
      offsetX: Math.floor((GRID.WIDTH  - interiorPxW) / 2),
      offsetY: Math.floor((GRID.HEIGHT - interiorPxH) / 2),
      gridCols: cols,
      gridRows: rows,
      cellSize: GRID.CELL_SIZE,
    };

    return {
      type: 'DUNGEON_FLOOR',
      floorIndex,
      gridCols: cols,
      gridRows: rows,
      collisionMap,
      backgroundObjects,
      enemies,
      items: rewardItem ? [rewardItem] : [],
      ingredients: [],
      npcs: [],
      doors: [],
      viewport,
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
      switchAObj,
      switchBObj,
      puzzleSolved: false,
    };
  }

  // ─── Proximity Checks ────────────────────────────────────────────────────

  /** Returns true if player is close enough to the exterior dungeon door to interact. */
  nearExteriorDoor() {
    const { game } = this;
    if (!game.player || game.player.inDungeon) return false;
    if (!game.currentRoom?.dungeon?.doorPosition) return false;
    if ((game.player._hutEntryCooldown ?? 0) > 0) return false;
    const { col, row } = game.currentRoom.dungeon.doorPosition;
    return this._nearCell(game.player, col * GRID.CELL_SIZE, row * GRID.CELL_SIZE);
  }

  /** Returns true if player is close enough to the floor-0 interior exit door to interact. */
  nearInteriorExit() {
    const { game } = this;
    if (!game.player?.inDungeon || !game.activeFloor) return false;
    if (game.activeFloor.gridCols !== INTERIOR_COLS) return false;
    const floor = game.activeFloor;
    if (floor.exitRow === null || floor.exitCol === null) return false;
    return this._nearCell(game.player, floor.exitCol * GRID.CELL_SIZE, floor.exitRow * GRID.CELL_SIZE);
  }

  // ─── Entry Detection (exterior → floor 0) ────────────────────────────────

  _enterDungeon() {
    const { game } = this;
    game.player.dungeonExitPosition = {
      x: game.player.position.x,
      y: game.player.position.y
    };
    // Surface combat clear happens in _activateFloor (also covers inter-floor transitions)

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

  // ─── Staircase Detection (within dungeon) ─────────────────────────────────

  checkStairs() {
    // Staircase transitions are triggered by SPACE — see handleSpacePress().
    // Exit door is also SPACE — see handleSpacePress().
  }

  /** Returns 'down', 'up', or null depending on which staircase the player is overlapping. */
  nearStairsType() {
    const { game } = this;
    if (!game.player?.inDungeon || !game.activeFloor) return null;
    if (game.activeFloor.gridCols !== INTERIOR_COLS) return null;
    const floor = game.activeFloor;
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

    // Wipe combat state on every floor activation (initial entry + inter-floor).
    // In-flight projectiles/arrows shouldn't carry across context boundaries.
    game.combatSystem.clear();

    // Swap physics entities — enemies
    if (game.activeFloor?.enemies) {
      for (const e of game.activeFloor.enemies) game.physicsSystem.removeEntity(e);
    }
    for (const e of floor.enemies) game.physicsSystem.addEntity(e);

    // Swap floor items + ingredients: save current floor's hutPlane entities, load new floor's
    if (game.activeFloor) {
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

    game.activeFloor = floor;
    game.dungeonCurrentFloor = floorIndex;

    game.player.setCollisionMap(floor.collisionMap);
    game.player.position.x = spawn.x;
    game.player.position.y = spawn.y;

    // Cooldown prevents the staircase we just came from from re-triggering
    game.player._hutEntryCooldown = 0.5;

    if (!game.player.inDungeon) game.player.inDungeon = true;

    // Bring camp companion (if any) into the dungeon floor
    game.campNPCSystem?.snapCompanionToPlayer?.();
    if (game.companion) {
      game.companion.commandTarget = null;
      // New floor = fresh room → fully sanitize the companion's weapon state.
      game.campNPCSystem?._sanitizeWeaponForCarrier?.(game.companion.weapon);
      game.companion._attackCooldown = 0;
    }

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

    // Wipe interior combat state on exit so dungeon projectiles/arrows don't
    // leak into surface coords on the return canvas.
    game.combatSystem.clear();

    // Snapshot the current floor's loot before clearing globals, so that
    // re-entering the same D room restores picked-up state correctly.
    // Floors persist on game.dungeonFloors for the duration of the D-room visit;
    // they are wiped only on room change / REST / death (see main.js).
    const currentFloorIndex = game.dungeonCurrentFloor;
    if (currentFloorIndex >= 0 && game.dungeonFloors[currentFloorIndex]) {
      game.dungeonFloors[currentFloorIndex].items       = game.items.filter(i => i.hutPlane);
      game.dungeonFloors[currentFloorIndex].ingredients = game.ingredients.filter(i => i.hutPlane);
    }

    // Remove current floor enemies from physics (they remain on floor.enemies).
    // Also drop unconsumed tick caches so CombatSystem can't replay stale
    // dot/sap events on re-entry (bug #92).
    if (game.activeFloor?.enemies) {
      for (const e of game.activeFloor.enemies) {
        game.physicsSystem.removeEntity(e);
        e._frameUpdateResult = null;
      }
    }

    // Restore exterior position
    if (game.player.dungeonExitPosition) {
      game.player.position.x = game.player.dungeonExitPosition.x;
      game.player.position.y = game.player.dungeonExitPosition.y;
    }

    // Restore exterior collision map
    if (game.currentRoom?.collisionMap) {
      game.player.setCollisionMap(game.currentRoom.collisionMap);
    }

    game.player.inDungeon = false;
    game.player._hutEntryCooldown = 0.5;

    // Bring the companion back outside beside the player
    game.campNPCSystem?.snapCompanionToPlayer?.();
    if (game.companion) game.companion.commandTarget = null;

    // Clear hutPlane loot from active globals (preserved on floor objects above)
    game.ingredients = game.ingredients.filter(i => !i.hutPlane);
    game.items = game.items.filter(i => !i.hutPlane);

    // Floors persist across exit/re-entry within the same D-room visit.
    // dungeonFloors and dungeonCurrentFloor are NOT cleared here; only activeFloor
    // is detached so exterior physics paths don't see stale interior state.
    game.dungeonCurrentFloor = -1;
    game.activeFloor = null;

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

    if (game.player.inDungeon && game.activeFloor) {
      // Only process if this is a dungeon interior (24 cols)
      if (game.activeFloor.gridCols !== INTERIOR_COLS) return;

      const floor = game.activeFloor;

      // Update interior enemies. Capture the return value so side-effect
      // requests (slime trail, fire/ice trail, aggro sound, item attacks) flow
      // — surface loop in main.js processes the same fields.
      for (const enemy of floor.enemies) {
        if (!game.combatSystem.applyTargetOverrides(enemy, floor.enemies, game.player, game.activeNoiseSource)) {
          enemy.target = game.player;
        }
        // Canonical interior tick (bug #92): 2× rate (enemy timing data is
        // double-seconds), result cached for CombatSystem — which used to be
        // the duplicate second tick and now only consumes.
        const r = enemy.update(dt * PHYSICS.ENEMY_TIMER_RATE);
        enemy._frameUpdateResult = r;
        if (!r) continue;
        if (r.justAggrod) game.audioSystem?.playSFX('aggro');
        if (r.itemAttack) game.combatSystem.createEnemyAttack(r.itemAttack);
        if (r.shouldDropSlimeTrail) {
          const t = r.shouldDropSlimeTrail;
          game._dropSlimeTrail(t.x, t.y, t.plane);
        }
        if (r.shouldPlaceTrail && r.trailData) {
          const td = r.trailData;
          game._spawnEnemyTrailPuddle(td.x, td.y, td.type, td.radius, enemy.plane ?? 0, td.duration);
        }
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

          // Death detritus (goo blobs for slimes, gray debris otherwise);
          // hutPlane so the overlay renders it. Inherits knockback velocity.
          game.worldEffectsSystem.spawnDeathDetritus(enemy, { hutPlane: true });

          game.physicsSystem.removeEntity(enemy);
          floor.enemies.splice(i, 1);
        }
      }

      // Companion-switch puzzle (green-zone floor 2) — must be pressed before glitter/key checks
      if (floor.unlockCondition?.type === 'companion_switches') {
        this._updateCompanionSwitches(floor);
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

      // Clamp player within dungeon interior bounds.
      // High-velocity knockback can cause checkAxisCollision to overshoot the
      // 24-cell collision map (cells 0-23) by landing in cell ≥24, which has no
      // solid entry. This hard clamp prevents the player from escaping the panel.
      const CS = GRID.CELL_SIZE;
      const maxX = (floor.gridCols - 2) * CS;
      const maxY = (floor.gridRows - 2) * CS;
      const p = game.player;
      if (p.position.x < CS) { p.position.x = CS; p.velocity.vx = 0; }
      if (p.position.y < CS) { p.position.y = CS; p.velocity.vy = 0; }
      if (p.position.x > maxX) { p.position.x = maxX; p.velocity.vx = 0; }
      if (p.position.y > maxY) { p.position.y = maxY; p.velocity.vy = 0; }

      this.checkStairs();
    }
  }

  // ─── Item Slot Interaction ────────────────────────────────────────────────

  /**
   * SPACE near exterior dungeon door: enter the dungeon.
   * SPACE near interior exit door (floor 0): exit the dungeon.
   * SPACE on staircase: descend/ascend.
   * Returns true if handled (prevents default SPACE behavior).
   *
   * Note: sacrificed weapons are permanent — there is no SPACE retrieval.
   */
  handleSpacePress() {
    const { game } = this;
    if (!game.player) return false;
    if ((game.player._hutEntryCooldown ?? 0) > 0) return false;

    // Exterior entry
    if (!game.player.inDungeon && this.nearExteriorDoor()) {
      this._enterDungeon();
      return true;
    }

    if (!game.player.inDungeon || !game.activeFloor) return false;
    if (game.activeFloor.gridCols !== INTERIOR_COLS) return false;

    // Interior exit (floor 0 only) — SPACE near the ∩ door
    if (this.nearInteriorExit()) {
      this._exitDungeon();
      return true;
    }

    // Staircase transitions
    const stairsType = this.nearStairsType();
    if (stairsType === 'down') { this._descendFloor(); return true; }
    if (stairsType === 'up')   { this._ascendFloor();  return true; }

    return false;
  }

  /**
   * SHIFT near item slot: deposit active weapon into sacrifice slot (unlocks stairs).
   * Returns true if handled (prevents default SHIFT behavior).
   */
  handleShiftPress() {
    const { game } = this;
    if (!game.player?.inDungeon || !game.activeFloor) return false;
    const floor = game.activeFloor;
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

  // ─── Companion-Switch Puzzle ──────────────────────────────────────────────

  _updateCompanionSwitches(floor) {
    const { game } = this;
    const player = game.player;
    const companion = game.companion;
    const a = floor.switchAObj;
    const b = floor.switchBObj;
    if (!a || !b) return;

    const aPx = a.position.x, aPy = a.position.y;
    const bPx = b.position.x, bPy = b.position.y;

    const playerOnA = this._overlapsCell(player, aPx, aPy);
    const playerOnB = this._overlapsCell(player, bPx, bPy);
    const compOnA = companion ? this._overlapsCell(companion, aPx, aPy) : false;
    const compOnB = companion ? this._overlapsCell(companion, bPx, bPy) : false;

    const aPressed = playerOnA || compOnA;
    const bPressed = playerOnB || compOnB;

    // Visual state — stay "pressed" once puzzle is solved
    this._setSwitchVisual(a, aPressed || floor.puzzleSolved);
    this._setSwitchVisual(b, bPressed || floor.puzzleSolved);

    // First simultaneous press → permanent unlock
    if (!floor.puzzleSolved && aPressed && bPressed) {
      floor.puzzleSolved = true;
      floor.stairsLocked = false;
      this._spawnStairsUnlockEffect(floor);
      if (companion) companion.commandTarget = null;
      return;
    }

    // Dispatch companion to the unoccupied switch while player stands on one.
    if (!floor.puzzleSolved && companion) {
      if (playerOnA && !compOnA) {
        companion.commandTarget = { x: bPx, y: bPy };
      } else if (playerOnB && !compOnB) {
        companion.commandTarget = { x: aPx, y: aPy };
      } else {
        companion.commandTarget = null;
      }
    } else if (companion) {
      companion.commandTarget = null;
    }
  }

  _setSwitchVisual(sw, pressed) {
    const char = pressed ? '●' : '○';
    const color = pressed ? '#ffcc44' : '#888888';
    sw.isPressed = pressed;
    sw.char = char;
    sw.color = color;
    sw.animationChar = char;
    sw.animationColor = color;
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

  _nearCell(player, cellPixelX, cellPixelY) {
    const C = GRID.CELL_SIZE;
    const px = player.position.x + C / 2;
    const py = player.position.y + C / 2;
    const cx = cellPixelX + C / 2;
    const cy = cellPixelY + C / 2;
    const dx = px - cx, dy = py - cy;
    return Math.sqrt(dx * dx + dy * dy) < DOOR_INTERACT_RADIUS;
  }

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
