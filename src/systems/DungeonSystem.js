import { GRID, PHYSICS } from '../game/GameConfig.js';
import { freezeSurfaceRoom, thawSurfaceRoom } from './PlaneSystem.js';

/**
 * DungeonSystem — dungeon interior lifecycle (6-floor rework, plan Phase 0).
 *
 * This file is the InteriorManager.controllers orchestrator only: enter/
 * exit/ascend/descend transitions, per-tick update dispatch, and SPACE
 * input dispatch. It owns no floor *content* (see DungeonFloorGenerator)
 * and no puzzle/gating logic (see DungeonPuzzleSystem) — both are internal
 * collaborators this file calls directly, per CLAUDE.md's Code Placement
 * Procedure.
 *
 * Floor graph
 * ───────────
 * Floors are addressed either by numeric index (game.dungeonFloors[0..3],
 * the "spine" — Entrance → Corridor → Branch → Pyramid) or by string key
 * (game.dungeonFloors.trapRoom / .keyVault / .companionGate, the Branch
 * floor's three side rooms). Every floor/room object carries its own
 * `descents[]` (down-transitions) and `ascendTo` (up-transition target) as
 * `{ kind: 'numbered', floorIndex } | { kind: 'side', key }` destination
 * descriptors — see DungeonFloorGenerator's file header for the full shape.
 * This is what makes the Branch floor's 3-way fork (and the Companion
 * Gate's onward path to the Pyramid) representable without special-casing
 * floor-index arithmetic the way a strictly linear chain would need.
 *
 * The Pyramid (floor index 3) is the terminal floor for this build — its
 * `descents` is empty by data, not by an explicit floor-count cap. There is
 * no MAX_FLOOR_INDEX constant: the chain ends wherever a floor's own
 * descents[] ends, so extending it later (a real Floor 5/6) is adding a
 * descent, not raising a ceiling.
 *
 * Floor data persists in game.dungeonFloors for the duration of the visit.
 * Cleared by InteriorManager.reset() (room change / REST / death).
 */

const INTERIOR_COLS = 24;

// Proximity radius for door/staircase interaction (px from cell center)
const DOOR_INTERACT_RADIUS = GRID.CELL_SIZE * 2;

export class DungeonSystem {
  constructor(game) {
    this.game = game;
  }

  // ─── Floor Generation (delegated) ─────────────────────────────────────────

  ensureFloorGenerated(destination) {
    const { game } = this;
    const depth = game.getCurrentZoneDepth ? game.getCurrentZoneDepth() : 1;
    if (destination.kind === 'numbered') {
      if (!game.dungeonFloors[destination.floorIndex]) {
        game.dungeonFloors[destination.floorIndex] = game.dungeonFloorGenerator.generateFloor(destination.floorIndex, depth);
      }
      return game.dungeonFloors[destination.floorIndex];
    }
    // Side room — generated fresh only once per visit, keyed by string.
    if (!game.dungeonFloors[destination.key]) {
      const gen = game.dungeonFloorGenerator;
      if (destination.key === 'trapRoom')      game.dungeonFloors.trapRoom      = gen.generateTrapRoom(depth, 2);
      else if (destination.key === 'keyVault')      game.dungeonFloors.keyVault      = gen.generateKeyVault(depth, 2);
      else if (destination.key === 'companionGate') game.dungeonFloors.companionGate = gen.generateCompanionGate(depth, 2);
    }
    return this.getFloorByDest(destination);
  }

  getFloorByDest(destination) {
    const { game } = this;
    return destination.kind === 'numbered'
      ? game.dungeonFloors[destination.floorIndex]
      : game.dungeonFloors[destination.key];
  }

  /** { kind, key/floorIndex } identity for a floor/room object — the inverse of getFloorByDest. */
  _destinationOf(floor) {
    return floor.roomKind === 'numbered'
      ? { kind: 'numbered', floorIndex: floor.floorIndex }
      : { kind: 'side', key: floor.roomKind };
  }

  sameDestination(a, b) {
    if (!a || !b || a.kind !== b.kind) return false;
    return a.kind === 'numbered' ? a.floorIndex === b.floorIndex : a.key === b.key;
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

  /**
   * Returns the transition the player is currently overlapping, or null:
   *   { kind: 'descend', descent } | { kind: 'ascend' }
   * A locked descent still reports as overlapping (HutInteriorOverlay uses
   * this to show the right prompt — "SPACE UNLOCK" vs "SPACE DESCEND" —
   * and puzzle-specific unlock handling lives in DungeonPuzzleSystem).
   */
  nearTransition() {
    const { game } = this;
    if (!game.player?.inDungeon || !game.activeFloor) return null;
    if (game.activeFloor.gridCols !== INTERIOR_COLS) return null;
    const floor = game.activeFloor;
    const player = game.player;

    for (const descent of floor.descents) {
      if (!descent.active) continue;
      if (this._overlapsCell(player, descent.obj.position.x, descent.obj.position.y)) {
        return { kind: 'descend', descent };
      }
    }

    if (floor.stairsUpRow !== null) {
      const sxPx = floor.stairsUpCol * GRID.CELL_SIZE;
      const syPx = floor.stairsUpRow * GRID.CELL_SIZE;
      if (this._overlapsCell(player, sxPx, syPx)) return { kind: 'ascend' };
    }

    return null;
  }

  // ─── Entry Detection (exterior → floor 0) ────────────────────────────────

  _enterDungeon() {
    const { game } = this;
    game.player.dungeonExitPosition = {
      x: game.player.position.x,
      y: game.player.position.y
    };

    // One skull key per visit — rolled once, on first entry (not re-rolled
    // on exit/re-entry within the same D-room visit).
    if (game.dungeonKeySkullFloor < 0) {
      game.dungeonKeySkullFloor = Math.floor(Math.random() * 3); // floor 0, 1, or 2
    }

    const entrance = this.ensureFloorGenerated({ kind: 'numbered', floorIndex: 0 });

    // Enter from exterior: spawn near the ∩ exit door.
    const spawn = { x: entrance.exitCol * GRID.CELL_SIZE, y: (entrance.exitRow - 2) * GRID.CELL_SIZE };
    this._activateFloor(entrance, spawn);
  }

  // ─── Floor Transitions ────────────────────────────────────────────────────

  /**
   * Step one cell from a border-adjacent footprint toward the room's
   * interior — direction-agnostic replacement for the old single-corridor
   * "continue direction of travel" spawn logic, since footprints now sit on
   * 3 different sides (top row, left col, right col) rather than one shared
   * north-south spine.
   */
  _spawnOffsetFor(row, col) {
    if (row <= 5) return { row: row + 1, col };                    // North footprint / up-stairs → step south
    if (col <= 5) return { row, col: col + 1 };                    // West footprint → step east
    if (col >= INTERIOR_COLS - 5) return { row, col: col - 1 };     // East footprint → step west
    return { row: row + 1, col };                                  // fallback
  }

  /**
   * Activate a floor, positioning the player at the provided spawn point.
   */
  _activateFloor(floor, spawn) {
    const { game } = this;

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
      const prev = game.activeFloor;
      prev.items       = game.items.filter(i => i.hutPlane);
      prev.ingredients = game.ingredients.filter(i => i.hutPlane);
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
    game.dungeonCurrentFloor = floor.roomKind === 'numbered' ? floor.floorIndex : -1;

    game.player.setCollisionMap(floor.collisionMap);
    game.player.position.x = spawn.x;
    game.player.position.y = spawn.y;

    // Cooldown prevents the staircase we just came from from re-triggering
    game.player._hutEntryCooldown = 0.5;

    if (!game.player.inDungeon) game.player.inDungeon = true;
    freezeSurfaceRoom(game);

    // Bring camp companion (if any) into the dungeon floor
    game.campNPCSystem?.snapCompanionToPlayer?.();
    if (game.companion) {
      game.companion.commandTarget = null;
      // New floor = fresh room → fully sanitize the companion's weapon state.
      game.campNPCSystem?._sanitizeWeaponForCarrier?.(game.companion.weapon);
      game.companion._attackCooldown = 0;
      // Sync collision map to the floor so the companion resolves walls
      // correctly inside the dungeon (surface map has different geometry).
      game.companion.collisionMap = floor.collisionMap;
    }

    game.renderer.backgroundDirty = true;
  }

  _descend(descent) {
    const { game } = this;
    if (!descent.active || descent.locked) return;
    const nextFloor = this.ensureFloorGenerated(descent.destination);
    if (!nextFloor) return;

    const spawnCell = this._spawnOffsetFor(nextFloor.stairsUpRow, nextFloor.stairsUpCol);
    this._activateFloor(nextFloor, {
      x: spawnCell.col * GRID.CELL_SIZE,
      y: spawnCell.row * GRID.CELL_SIZE,
    });
  }

  _ascend() {
    const { game } = this;
    const current = game.activeFloor;
    if (!current) return;

    if (!current.ascendTo) {
      this._exitDungeon();
      return;
    }

    const prevFloor = this.getFloorByDest(current.ascendTo);
    if (!prevFloor) return;

    // Land on the origin descent that points back at the floor we're
    // leaving — the first match wins when a floor has multiple descents to
    // the same destination (e.g. Corridor's North + West both → Branch).
    const fromDest = this._destinationOf(current);
    const origin = prevFloor.descents.find(d => this.sameDestination(d.destination, fromDest));
    const originRow = origin ? origin.row : prevFloor.stairsUpRow;
    const originCol = origin ? origin.col : prevFloor.stairsUpCol;

    const spawnCell = this._spawnOffsetFor(originRow, originCol);
    this._activateFloor(prevFloor, {
      x: spawnCell.col * GRID.CELL_SIZE,
      y: spawnCell.row * GRID.CELL_SIZE,
    });
  }

  _exitDungeon() {
    const { game } = this;

    // Wipe interior combat state on exit so dungeon projectiles/arrows don't
    // leak into surface coords on the return canvas.
    game.combatSystem.clear();

    // Snapshot the current floor's loot before clearing globals, so that
    // re-entering the same D room restores picked-up state correctly.
    if (game.activeFloor) {
      game.activeFloor.items       = game.items.filter(i => i.hutPlane);
      game.activeFloor.ingredients = game.ingredients.filter(i => i.hutPlane);
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
    game.player.hookedByMimic = null;
    thawSurfaceRoom(game);
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
        if (r.justAggrod) game.audioSystem?.playSFX(enemy.data?.sfx?.aggro ?? 'aggro');
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
          game.audioSystem?.playSFX('destroy');
          game.spawnLoot(enemy);

          // Death detritus (goo blobs for slimes, gray debris otherwise);
          // hutPlane so the overlay renders it. Inherits knockback velocity.
          game.worldEffectsSystem.spawnDeathDetritus(enemy, { hutPlane: true });

          game.physicsSystem.removeEntity(enemy);
          floor.enemies.splice(i, 1);
        }
      }

      // Puzzle/gating logic (key vault lock, companion-gate visibility,
      // trap-room clear gate, companion-switch puzzle, compass beep).
      game.dungeonPuzzleSystem.update(floor, dt);

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
    }
  }

  // ─── Input ─────────────────────────────────────────────────────────────────

  /**
   * SPACE near exterior dungeon door: enter the dungeon.
   * SPACE near interior exit door (floor 0): exit the dungeon.
   * SPACE on a descent/up-stairs footprint: descend/ascend.
   * Otherwise delegates to DungeonPuzzleSystem for puzzle-specific SPACE
   * actions (Key Vault unlock, Pyramid offering).
   * Returns true if handled (prevents default SPACE behavior).
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

    const transition = this.nearTransition();
    if (transition?.kind === 'descend' && transition.descent.active && !transition.descent.locked) {
      this._descend(transition.descent);
      return true;
    }
    if (transition?.kind === 'ascend') {
      this._ascend();
      return true;
    }

    return game.dungeonPuzzleSystem.handleSpacePress();
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
