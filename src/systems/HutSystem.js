import { GRID } from '../game/GameConfig.js';
import { BackgroundObject } from '../entities/BackgroundObject.js';
import { Enemy } from '../entities/Enemy.js';
import { Item } from '../entities/Item.js';
import { getZoneRandomEnemy } from '../data/enemies.js';
import { createDebris } from '../entities/Debris.js';
import { WiseFellow } from '../entities/WiseFellow.js';
import { Witch } from '../entities/Witch.js';
import { ErrandCharacter } from '../entities/ErrandCharacter.js';

/**
 * HutSystem — manages hut interior entry/exit and interior state.
 *
 * Entry: player approaches the exterior door (∩) and presses SPACE.
 * Exit:  player approaches the interior exit door (∩) and presses SPACE.
 *
 * Coordinate contract:
 *   Interior pixel coords: 0–160 (10 cells × 16px)
 *   Canvas offset for rendering: 160px each side
 */

// Hut interior is intentionally small — a cozy 10×10 space (playable 8×8 cells).
// Dungeon interiors (DungeonSystem) use the full 24×24 grid.
const INTERIOR_COLS = 10;
const INTERIOR_ROWS = 10;

// Proximity radius for door interaction (px from door center)
const DOOR_INTERACT_RADIUS = GRID.CELL_SIZE * 2;

export class HutSystem {
  constructor(game) {
    this.game = game;
  }

  // ─── Interior Generation ─────────────────────────────────────────────────

  generateHutInterior(hutKind, depth, pressBias = false) {
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

    // Spawn-occupancy helper: rejects walls AND cells already holding a
    // background object or item. Prevents items/decor from rendering on top
    // of fixed objects like the oil press.
    const cellOccupied = (col, row, items = []) => {
      if (collisionMap[row]?.[col]) return true;
      const x = col * GRID.CELL_SIZE;
      const y = row * GRID.CELL_SIZE;
      if (backgroundObjects.some(o => o.position.x === x && o.position.y === y)) return true;
      if (items.some(it => it.position.x === x && it.position.y === y)) return true;
      return false;
    };

    // ── Fixed-position background objects first ──
    // Oil press: P-flagged huts always get one; other huts have a small chance.
    // Placed BEFORE decor/bread so those spawn loops can reject the press cell.
    const hasPress = pressBias || Math.random() < 0.10;
    if (hasPress) {
      backgroundObjects.push(new BackgroundObject(
        '⊓',
        2 * GRID.CELL_SIZE,
        2 * GRID.CELL_SIZE
      ));
    }

    // Interior floor decor (very sparse — hut is small)
    const decorChars = ['n', '*', '8', '%'];
    const decorCount = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < decorCount; i++) {
      for (let attempt = 0; attempt < 12; attempt++) {
        const col = 2 + Math.floor(Math.random() * (cols - 4));
        const row = 2 + Math.floor(Math.random() * (rows - 5));
        if (cellOccupied(col, row)) continue;
        const char = decorChars[Math.floor(Math.random() * decorChars.length)];
        backgroundObjects.push(new BackgroundObject(char, col * GRID.CELL_SIZE, row * GRID.CELL_SIZE));
        break;
      }
    }

    // Enemies and NPCs — populated based on hutKind
    const enemies = [];
    const npcs = [];

    if (hutKind === 'enemy_encounter') {
      // 1–2 zone-appropriate enemies
      const spawnCount = 1 + Math.floor(Math.random() * 2);
      for (let i = 0; i < spawnCount; i++) {
        const zone = this.game.currentRoom?.zone || 'green';
        const enemyChar = getZoneRandomEnemy(depth, zone);
        if (!enemyChar) continue;
        let col = 2;
        let row = 2;
        for (let attempt = 0; attempt < 12; attempt++) {
          col = 2 + Math.floor(Math.random() * (cols - 4));
          row = 2 + Math.floor(Math.random() * (rows - 6));
          if (!cellOccupied(col, row)) break;
        }
        const enemy = new Enemy(enemyChar, col * GRID.CELL_SIZE, row * GRID.CELL_SIZE, depth);
        enemy.setCollisionMap(collisionMap);
        enemy.setBackgroundObjects(backgroundObjects);
        enemies.push(enemy);
      }

    } else if (hutKind === 'barrel_room') {
      // 3–5 barrels scattered in the interior — no enemies
      const barrelCount = 3 + Math.floor(Math.random() * 3);
      let placed = 0;
      let attempts = 0;
      while (placed < barrelCount && attempts < barrelCount * 6) {
        attempts++;
        const col = 2 + Math.floor(Math.random() * (cols - 4));
        const row = 2 + Math.floor(Math.random() * (rows - 5));
        if (cellOccupied(col, row)) continue;
        backgroundObjects.push(new BackgroundObject('p', col * GRID.CELL_SIZE, row * GRID.CELL_SIZE));
        placed++;
      }

    } else if (hutKind === 'wise_man') {
      // Wise fellow at interior center
      const zone = this.game.currentRoom?.zone || 'green';
      const centerCol = Math.floor(cols / 2);
      const centerRow = Math.floor(rows / 2) - 1;
      const wise = new WiseFellow(centerCol * GRID.CELL_SIZE, centerRow * GRID.CELL_SIZE);
      wise.setHint(zone);
      npcs.push(wise);

    } else if (hutKind === 'witch') {
      // Witch at interior center
      const centerCol = Math.floor(cols / 2);
      const centerRow = Math.floor(rows / 2) - 1;
      npcs.push(new Witch(centerCol * GRID.CELL_SIZE, centerRow * GRID.CELL_SIZE));

    } else if (hutKind === 'neutral_npc') {
      // Placeholder NPC: spawn the errand traveler. Seeds an errand if none active
      // so the room never feels empty.
      const errandSystem = this.game.errandSystem;
      if (errandSystem) {
        if (!errandSystem.activeErrand) errandSystem._pickRequest(this.game.player);
        const errand = errandSystem.activeErrand;
        if (errand) {
          const centerCol = Math.floor(cols / 2);
          const centerRow = Math.floor(rows / 2) - 1;
          npcs.push(new ErrandCharacter(
            centerCol * GRID.CELL_SIZE,
            centerRow * GRID.CELL_SIZE,
            errand.requestedItem,
            errand.stage
          ));
        }
      }
    }

    // Bread loaves: very common in huts (90% chance to spawn, 1–2 loaves).
    // Player picks them up off the floor; pressing the use button later drops
    // a loaf for crows. Items are seeded into activeFloor.items and pushed
    // into game.items on entry by _enterHut (marked hutPlane).
    const breadItems = [];
    if (hutKind !== 'witch' && Math.random() < 0.90) {
      const loafCount = 1 + (Math.random() < 0.45 ? 1 : 0);
      for (let i = 0; i < loafCount; i++) {
        for (let attempt = 0; attempt < 12; attempt++) {
          const col = 2 + Math.floor(Math.random() * (cols - 4));
          const row = 2 + Math.floor(Math.random() * (rows - 5));
          if (cellOccupied(col, row, breadItems)) continue;
          breadItems.push(new Item('⌬', col * GRID.CELL_SIZE, row * GRID.CELL_SIZE));
          break;
        }
      }
    }

    // Interior exit door at south-center border. The door cell stays solid so
    // neither the player nor enemies can walk through the wall — leaving the hut
    // is SPACE-only, and `nearInteriorExit()` uses a 2-cell proximity radius
    // so the player can stand one cell north of the door and still interact.
    const exitCol = Math.floor(cols / 2);
    const exitRow = rows - 1;
    const exitDoor = new BackgroundObject('∩', exitCol * GRID.CELL_SIZE, exitRow * GRID.CELL_SIZE);
    backgroundObjects.push(exitDoor);

    // Player spawn: just inside the south door
    const spawnPoint = {
      x: exitCol * GRID.CELL_SIZE,
      y: (exitRow - 2) * GRID.CELL_SIZE
    };

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
      type: 'HUT_INTERIOR',
      gridCols: cols,
      gridRows: rows,
      collisionMap,
      backgroundObjects,
      enemies,
      npcs,
      items: breadItems,
      doors: [{ col: exitCol, row: exitRow, leadsTo: null }],
      hutKind,
      spawnPoint,
      exitCol,
      exitRow,
      viewport,
    };
  }

  // ─── Proximity Checks ────────────────────────────────────────────────────

  /** Returns true if player is close enough to the exterior hut door to interact. */
  nearExteriorDoor() {
    const { game } = this;
    if (!game.player || game.player.inHut) return false;
    if (!game.currentRoom?.hut?.doorPosition) return false;
    // Witch huts on chicken legs are inaccessible until SIT/SITDOWN lowers them.
    if (game.currentRoom.hut.raised) return false;
    if ((game.player._hutEntryCooldown ?? 0) > 0) return false;
    const { col, row } = game.currentRoom.hut.doorPosition;
    return this._nearCell(game.player, col * GRID.CELL_SIZE, row * GRID.CELL_SIZE);
  }

  /**
   * Lowers a raised witch hut in a stepped descent — one grid cell per beat —
   * removing chicken legs as the hut settles onto them. While the animation
   * plays `hut.raised` stays true so the door stays inaccessible; on the
   * final beat the collision map is rewritten and the hut becomes enterable.
   */
  lowerHut(room) {
    const hut = room?.hut;
    if (!hut?.raised) return false;
    if (hut._loweringInProgress) return false;
    hut._loweringInProgress = true;

    this.game.audioSystem?.playSFX('hut_lower');

    const shift = hut.verticalShift || 2;
    const C = GRID.CELL_SIZE;
    const STEP_DURATION = 0.15;

    // All hut pieces that need to slide down together: walls, door, and the
    // dark interior fill cells. Legs are handled separately (stripped row by
    // row as the hut covers them).
    const movables = [
      ...(hut.wallObjects || []),
      ...(hut.interiorObjects || []),
    ];
    if (hut.doorObject) movables.push(hut.doorObject);

    // Clear the OLD full footprint from the collision map up front so the
    // collision grid doesn't lag behind mid-step pixel positions. The map
    // will be rewritten for the NEW footprint in the finalize callback.
    const { minCol, maxCol, minRow, maxRow } = hut.exteriorBounds;
    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        if (room.collisionMap[r]) room.collisionMap[r][c] = false;
      }
    }

    // If the player is standing in any cell that the hut will occupy after
    // descending, slide them south to clear ground over the descent duration.
    // The lock prevents input/dodge from re-injecting them under the hut.
    const player = this.game.player;
    if (player) {
      const px = Math.floor(player.position.x / C);
      const py = Math.floor(player.position.y / C);
      const newMinRow = minRow + shift;
      const newMaxRow = maxRow + shift;
      const insideFootprint =
        px >= minCol && px <= maxCol &&
        py >= newMinRow - shift && py <= newMaxRow; // covers old + new spans
      if (insideFootprint) {
        const safeCol = hut.doorPosition.col;          // door column = open approach
        const safeRow = newMaxRow + 2;                 // 2 cells south of new south wall
        const totalDuration = STEP_DURATION * shift;
        this.game.animationSystem.play(player, [{
          type: 'moveTo',
          x: safeCol * C,
          y: safeRow * C,
          duration: totalDuration,
          easing: 'easeOut',
        }]);
      }
    }

    /** Removes the topmost remaining leg row (highest on screen = smallest row index). */
    const stripTopLegRow = () => {
      if (!hut.legObjects?.length) return;
      let topRow = Infinity;
      for (const leg of hut.legObjects) {
        const r = Math.round(leg.position.y / C);
        if (r < topRow) topRow = r;
      }
      for (let i = hut.legObjects.length - 1; i >= 0; i--) {
        const leg = hut.legObjects[i];
        if (Math.round(leg.position.y / C) === topRow) {
          const idx = room.backgroundObjects.indexOf(leg);
          if (idx !== -1) room.backgroundObjects.splice(idx, 1);
          hut.legObjects.splice(i, 1);
        }
      }
    };

    /** Snaps every wall + door + interior-fill object down by one full cell. */
    const snapDown = () => {
      for (const obj of movables) obj.position.y += C;
      this.game.renderer.backgroundDirty = true;
    };

    // Build the step sequence: snap → leg-row strip → wait, repeated `shift` times.
    const steps = [];
    for (let i = 0; i < shift; i++) {
      steps.push({ type: 'callback', fn: snapDown });
      steps.push({ type: 'callback', fn: stripTopLegRow });
      steps.push({ type: 'wait', duration: STEP_DURATION });
    }
    steps.push({
      type: 'callback',
      fn: () => {
        // Solidify the entire NEW footprint — walls, door cell, interior
        // fills. Door is impassable for all huts; entry is SPACE-only.
        const newMinRow = minRow + shift;
        const newMaxRow = maxRow + shift;
        for (let r = newMinRow; r <= newMaxRow; r++) {
          for (let c = minCol; c <= maxCol; c++) {
            if (room.collisionMap[r]) room.collisionMap[r][c] = true;
          }
        }
        hut.doorPosition.row += shift;
        hut.exteriorBounds.minRow = newMinRow;
        hut.exteriorBounds.maxRow = newMaxRow;
        hut.raised = false;
        hut.verticalShift = 0;
        hut._loweringInProgress = false;
        this.game.renderer.backgroundDirty = true;
      }
    });

    // AnimationSystem requires a target — use a throwaway host since each
    // callback orchestrates the actual wall/door/leg objects directly.
    const host = { position: { x: 0, y: 0 } };
    this.game.animationSystem.play(host, steps);
    return true;
  }

  /** Returns true if player is close enough to the interior exit door to interact. */
  nearInteriorExit() {
    const { game } = this;
    if (!game.player?.inHut || !game.activeFloor) return false;
    if (game.activeFloor.gridCols !== INTERIOR_COLS) return false;
    const { exitCol, exitRow } = game.activeFloor;
    return this._nearCell(game.player, exitCol * GRID.CELL_SIZE, exitRow * GRID.CELL_SIZE);
  }

  // ─── SPACE Interaction ────────────────────────────────────────────────────

  /**
   * SPACE near hut exterior door: enter the hut.
   * SPACE near interior exit door: exit the hut.
   * Returns true if handled (prevents default SPACE behavior).
   */
  handleSpacePress() {
    const { game } = this;
    if (!game.player) return false;
    if ((game.player._hutEntryCooldown ?? 0) > 0) return false;

    // Entry from exterior
    if (!game.player.inHut && this.nearExteriorDoor()) {
      this._enterHut();
      return true;
    }

    // Exit from interior (hut only — dungeon handled by DungeonSystem)
    if (game.player.inHut && game.activeFloor?.gridCols === INTERIOR_COLS && this.nearInteriorExit()) {
      this._exitHut();
      return true;
    }

    return false;
  }

  // ─── Entry / Exit ────────────────────────────────────────────────────────

  _enterHut() {
    const { game } = this;
    const hut = game.currentRoom.hut;

    // Save exterior position
    game.player.hutExitPosition = {
      x: game.player.position.x,
      y: game.player.position.y
    };

    // Wipe surface combat state on transition into interior so in-flight
    // surface projectiles/arrows don't ghost-render at upper-left of canvas
    // during interior play. Matches the clear pattern of surface room transitions.
    game.combatSystem.clear();

    // Reuse cached interior if the player has been here before in this room
    // visit — preserves broken barrels, defeated enemies, NPC dialogue state, etc.
    if (hut.interiorState) {
      game.activeFloor = hut.interiorState;
    } else {
      const depth = game.getCurrentZoneDepth ? game.getCurrentZoneDepth() : 1;
      game.activeFloor = this.generateHutInterior(hut.hutKind, depth, hut.pressBias === true);
      hut.interiorState = game.activeFloor;
      hut.interiorGenerated = true;
    }

    // Register interior enemies with physics
    for (const enemy of game.activeFloor.enemies) {
      game.physicsSystem.addEntity(enemy);
    }

    // Hand pre-seeded interior items (bread) to the live game.items list and
    // tag them as hutPlane so _exitHut sweeps any unpicked loaves out cleanly.
    // We drain activeFloor.items so cached re-entry doesn't double-spawn.
    if (game.activeFloor.items && game.activeFloor.items.length) {
      for (const it of game.activeFloor.items) {
        it.hutPlane = true;
        game.items.push(it);
        game.physicsSystem.addEntity(it);
      }
      game.activeFloor.items = [];
    }

    // Switch player collision map to interior grid
    game.player.setCollisionMap(game.activeFloor.collisionMap);

    // Teleport player into interior
    game.player.position.x = game.activeFloor.spawnPoint.x;
    game.player.position.y = game.activeFloor.spawnPoint.y;
    game.player.inHut = true;

    // Bring the camp companion (if any) along — snap it beside the player
    game.campNPCSystem?.snapCompanionToPlayer?.();

    // Force background redraw so the overlay paints immediately
    game.renderer.backgroundDirty = true;
  }

  _exitHut() {
    const { game } = this;

    // Wipe interior combat state on exit so interior projectiles/arrows don't
    // leak into the surface render at interior coords.
    game.combatSystem.clear();

    // Remove interior enemies from physics
    if (game.activeFloor?.enemies) {
      for (const enemy of game.activeFloor.enemies) {
        game.physicsSystem.removeEntity(enemy);
      }
    }

    // Restore exact exterior position and set a brief cooldown so
    // proximity checks do not immediately re-trigger on the next frame.
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

    // Bring the companion back outside beside the player
    game.campNPCSystem?.snapCompanionToPlayer?.();

    // Clear hutPlane loot (ingredients/items spawned inside are abandoned on exit)
    game.ingredients = game.ingredients.filter(i => !i.hutPlane);
    game.items = game.items.filter(i => !i.hutPlane);

    game.activeFloor = null;

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

    if (game.player.inHut && game.activeFloor) {
      // Only process if this is a hut interior (10 cols), not a dungeon (24 cols)
      if (game.activeFloor.gridCols !== INTERIOR_COLS) return;

      // Update interior enemies. The return value carries side-effect requests
      // (slime trail, fire/ice trail, goo spew, item attacks, aggro sound) that
      // the surface loop in main.js consumes — interior enemies need the same
      // routing or slime-affinity enemies emit no trail, etc.
      for (const enemy of game.activeFloor.enemies) {
        enemy.target = game.player;
        const r = enemy.update(dt);
        if (!r) continue;
        if (r.justAggrod) game.audioSystem?.playSFX('aggro');
        if (r.itemAttack) game.combatSystem.createEnemyAttack(r.itemAttack);
        if (r.shouldDropSlimeTrail) {
          const t = r.shouldDropSlimeTrail;
          game._dropSlimeTrail(t.x, t.y, t.plane);
        }
        if (r.shouldPlaceTrail && r.trailData) {
          const td = r.trailData;
          game._spawnEnemyTrailPuddle(td.x, td.y, td.type, td.radius, enemy.plane ?? 0);
        }
      }

      // Process interior enemy deaths
      for (let i = game.activeFloor.enemies.length - 1; i >= 0; i--) {
        const enemy = game.activeFloor.enemies[i];
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
          game.activeFloor.enemies.splice(i, 1);
        }
      }

      // Update interior background objects
      for (const obj of game.activeFloor.backgroundObjects) {
        obj.update(dt);
      }

      // Update interior NPCs (WiseFellow, Witch, etc.)
      for (const npc of game.activeFloor.npcs) {
        npc.update(dt, this.game);
      }

      // Poll Witch trigger — activate polymorph on first contact
      for (const npc of game.activeFloor.npcs) {
        if (npc.triggered && !game.player.polymorphed) {
          this.game.polymorphSystem?.activatePolymorph(this.game, true);
        }
      }
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
}
