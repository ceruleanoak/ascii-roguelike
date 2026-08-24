import { GRID, PHYSICS } from '../game/GameConfig.js';
import { freezeSurfaceRoom, thawSurfaceRoom } from './PlaneSystem.js';
import { NORTH_ROW, SPINE_ROW, WEST_COL, EAST_COL, STAIRS_COL } from '../data/dungeonFloorTemplates.js';
import { PUZZLE_ROOM_TEMPLATES } from '../data/dungeonPuzzleTemplates.js';

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
 * Floors are addressed either by numeric index (game.dungeonFloors[0..4],
 * the "spine" — Entrance → Corridor → Branch → Pyramid → Vault) or by string key
 * (game.dungeonFloors[templateName], a weighted-random Puzzle Room off
 * Corridor's North descent — the picked template's own name doubles as its
 * storage key, e.g. 'whip_trial'; see DungeonFloorGenerator._generateCorridor
 * and dungeonPuzzleTemplates.js. game.dungeonFloors.trapRoom, off Branch's
 * North descent, is the one remaining bespoke side room). Branch's East descent leads straight back
 * onto the spine, to the Pyramid (numbered floorIndex 3) — gated by Branch's
 * own in-room switch puzzle rather than a separate side room (bug #209:
 * the switches used to live in a side room off Branch, gated on companion
 * status; git-archaeology into the pre-rework implementation showed they
 * were always visible in the same room as the Trap Room door, so that side
 * room was folded back into Branch). Every floor/room object carries its
 * own `descents[]` (down-transitions) and `ascendTo` (up-transition target)
 * as `{ kind: 'numbered', floorIndex } | { kind: 'side', key }` destination
 * descriptors — see DungeonFloorGenerator's file header for the full shape.
 * This is what makes the Branch floor's 3-way fork representable without
 * special-casing floor-index arithmetic the way a strictly linear chain
 * would need.
 *
 * The Pyramid's offering unlocks the North descent into the Vault (floor
 * index 4, the dungeon boss layer's terminal arena). There is still no
 * MAX_FLOOR_INDEX constant: the chain ends wherever a floor's own
 * descents[] ends.
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
    // Side room — generated fresh only once per visit, keyed by string. A
    // key matching a named entry in PUZZLE_ROOM_TEMPLATES is a Puzzle Room
    // (checked first so adding a new template needs no change here — see
    // dungeonPuzzleTemplates.js's file header); 'trapRoom' is the one
    // remaining bespoke, non-template side room.
    if (!game.dungeonFloors[destination.key]) {
      const gen = game.dungeonFloorGenerator;
      if (PUZZLE_ROOM_TEMPLATES[destination.key]) {
        game.dungeonFloors[destination.key] = gen.generatePuzzleRoom(destination.key, depth, 1);
      } else if (destination.key === 'trapRoom') {
        game.dungeonFloors.trapRoom = gen.generateTrapRoom(depth, 2);
      }
    }
    return this.getFloorByDest(destination);
  }

  getFloorByDest(destination) {
    const { game } = this;
    return destination.kind === 'numbered'
      ? game.dungeonFloors[destination.floorIndex]
      : game.dungeonFloors[destination.key];
  }

  /**
   * { kind, key/floorIndex } identity for a floor/room object — the inverse
   * of getFloorByDest. A Puzzle Room's storage key is its own template name
   * (floor.templateName), not its shared roomKind ('puzzleRoom') — every
   * puzzle-pool room carries the same roomKind, so roomKind alone can't
   * distinguish e.g. 'whip_trial' from 'boomerang_trial'.
   */
  _destinationOf(floor) {
    if (floor.roomKind === 'numbered') return { kind: 'numbered', floorIndex: floor.floorIndex };
    const key = floor.roomKind === 'puzzleRoom' ? floor.templateName : floor.roomKind;
    return { kind: 'side', key };
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
    // on exit/re-entry within the same D-room visit). Must be findable
    // before the lock it opens (Corridor's West descent into Branch), so
    // it only rolls onto Entrance or Corridor, never past the gate itself.
    if (game.dungeonKeySkullFloor < 0) {
      game.dungeonKeySkullFloor = Math.floor(Math.random() * 2); // floor 0 or 1
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
   * Every floor/side-room shares the same 24×24 footprint geometry (see
   * dungeonFloorTemplates.js's staircase footprint contract), so a descent's
   * id ('north'/'west'/'east') names the same physical side on every floor.
   * Used by _descend() to land the player near the side of the DESTINATION
   * floor that corresponds to which staircase they took, instead of always
   * the single fixed up-stairs point — so two different descents to the same
   * floor (e.g. Corridor's North + West both → Branch) feel spatially
   * distinct rather than funneling everyone to one identical spawn.
   */
  _landingAnchorFor(id) {
    if (id === 'north') return { row: NORTH_ROW, col: STAIRS_COL };
    if (id === 'west')  return { row: SPINE_ROW, col: WEST_COL };
    if (id === 'east')  return { row: SPINE_ROW, col: EAST_COL };
    return null;
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

    // Tomb Ghost sap has no duration — "leaving the room" is its only escape
    // (see DungeonGhostSystem). Every floor activation, including the very
    // first entry, counts as leaving whatever room the player was just in.
    game.player.tombSapped = false;
    game.player._tombSapTimer = 0;
    game.player._tombSappingGhost = null;

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

    // Pet companions (crows + tamed rats) descend with the player — mortal,
    // no heal on floor swap. CompanionSystem owns the roster logic.
    game.companionSystem?.snapPetsIntoFloor?.(floor);

    // Vault arrival gilds the pets that survived the descent — the dungeon
    // boss layer's Game Changer (claudedocs/dungeon-boss-green.md). The
    // guard keeps a cached-floor re-activation from re-firing it.
    if (floor.isVault && !floor.gildedTriggered) {
      floor.gildedTriggered = true;
      game.companionSystem?.setPetsGilded?.(true);
    }

    // Dungeon boss layer: spawn/resume the vault encounter.
    game.dungeonBossSystem?.onFloorActivated?.(floor);

    game.renderer.backgroundDirty = true;
  }

  _descend(descent) {
    const { game } = this;
    if (!descent.active || descent.locked) return;
    const nextFloor = this.ensureFloorGenerated(descent.destination);
    if (!nextFloor) return;

    // Remember which staircase led here so _ascend() can reverse it exactly,
    // and land near the correspondingly-named footprint on the new floor
    // rather than always its single fixed up-stairs point (bug: Corridor's
    // North + West both → Branch used to funnel to one identical spawn).
    nextFloor._enteredViaId = descent.id;
    const anchor = this._landingAnchorFor(descent.id)
      ?? { row: nextFloor.stairsUpRow, col: nextFloor.stairsUpCol };
    const spawnCell = this._spawnOffsetFor(anchor.row, anchor.col);
    this._activateFloor(nextFloor, {
      x: spawnCell.col * GRID.CELL_SIZE,
      y: spawnCell.row * GRID.CELL_SIZE,
    });
  }

  _ascend() {
    const { game } = this;
    const current = game.activeFloor;
    if (!current) return;
    if (current.stairsUpLocked) return; // e.g. Trap Room mid-clear

    if (!current.ascendTo) {
      this._exitDungeon();
      return;
    }

    // ensureFloorGenerated (not getFloorByDest) — mirrors _descend()'s own
    // generate-on-demand call below. In normal play the floor being ascended
    // to was always already cached (a real descend generates+caches it on
    // the way down), so the two calls were interchangeable here. debugWarpTo
    // breaks that invariant: it jumps straight to a floor without walking
    // its ancestor chain, so ascendTo's target is never cached — getFloorByDest
    // returned undefined, this bailed out with a silent no-op, and SPACE at
    // an unlocked exit did nothing (handleSpacePress still reports handled:
    // true and swallows the keypress, since it commits to calling _ascend()
    // before knowing whether it succeeds).
    const prevFloor = this.ensureFloorGenerated(current.ascendTo);
    if (!prevFloor) return;

    // Land on the exact descent used to enter `current` this visit (set by
    // _descend), not just the first descent that happens to point at the
    // same destination — a floor can have multiple descents to the same
    // destination (e.g. Corridor's North + West both → Branch) that must
    // reverse independently. Falls back to a destination match, then to the
    // floor's up-stairs point, for the should-be-impossible case a floor was
    // activated without going through _descend().
    let origin = prevFloor.descents.find(d => d.id === current._enteredViaId);
    if (!origin) {
      const fromDest = this._destinationOf(current);
      origin = prevFloor.descents.find(d => this.sameDestination(d.destination, fromDest));
    }
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
    game.player.hookedByWhip = null;
    // Leaving the dungeon entirely also clears Tomb Ghost sap (the other
    // half of its only-escape rule — see _activateFloor's per-room clear).
    game.player.tombSapped = false;
    game.player._tombSapTimer = 0;
    game.player._tombSappingGhost = null;
    thawSurfaceRoom(game);
    game.player._hutEntryCooldown = 0.5;

    // Bring the companion back outside beside the player
    game.campNPCSystem?.snapCompanionToPlayer?.();
    if (game.companion) {
      game.companion.commandTarget = null;
      // Restore the surface collision map — the floor-synced map from
      // _activateFloor has different geometry, and carrying it outside makes
      // the companion collide with walls that no longer exist (#141;
      // mirrors HutSystem's own exit path).
      if (game.currentRoom?.collisionMap) {
        game.companion.collisionMap = game.currentRoom.collisionMap;
      }
    }

    // Pet companions: surface coordinates, surface maps, gilded cleared.
    game.companionSystem?.restorePetsFromFloor?.();

    // Dungeon boss layer: tear down any live encounter (no payout on retreat).
    game.dungeonBossSystem?.reset?.();

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

  // ─── Debug Warp (Cheat Menu) ────────────────────────────────────────────

  /**
   * Cheat-menu-only: jump straight to any floor/side room in the dungeon
   * tree from anywhere in the D room (exterior or already inside), bypassing
   * the normal descent chain and any lock gating. `forceRegenerate` always
   * builds a fresh floor and overwrites whatever was cached under
   * `destination`'s key, instead of reusing ensureFloorGenerated's
   * once-per-visit cache — the Puzzle Room and Trap Room entries use it so:
   *   (a) picking a specific puzzle template is a genuine "brute force which
   *       puzzle room generates" rather than replaying Corridor's one
   *       weighted-random pick from first visit, and
   *   (b) re-picking mid-visit resets that room's trigger/gap/solve state
   *       instead of reactivating a stale, already-solved instance.
   * Numbered floors skip forceRegenerate — no reason to nuke Corridor/
   * Branch's enemies/loot for a plain floor jump.
   */
  debugWarpTo(destination, { forceRegenerate = false } = {}) {
    const { game } = this;
    if (!game.currentRoom?.dungeon || !game.player) return false;

    // Mirror _enterDungeon()'s one-time setup when jumping in from outside
    // the interior — same exit-position snapshot + skull-key roll a real
    // door entry would produce, so ascend-to-exterior and the key hunt still
    // behave normally after a debug jump.
    if (!game.player.inDungeon) {
      game.player.dungeonExitPosition = { x: game.player.position.x, y: game.player.position.y };
      if (game.dungeonKeySkullFloor < 0) {
        game.dungeonKeySkullFloor = Math.floor(Math.random() * 2);
      }
    }

    const depth = game.getCurrentZoneDepth ? game.getCurrentZoneDepth() : 1;
    let floor;
    if (forceRegenerate && destination.kind === 'side') {
      const gen = game.dungeonFloorGenerator;
      if (PUZZLE_ROOM_TEMPLATES[destination.key]) {
        floor = gen.generatePuzzleRoom(destination.key, depth, 1);
      } else if (destination.key === 'trapRoom') {
        floor = gen.generateTrapRoom(depth, 2);
      }
      if (!floor) return false;
      game.dungeonFloors[destination.key] = floor;
    } else {
      floor = this.ensureFloorGenerated(destination);
    }
    if (!floor) return false;

    // Entrance is the one floor with no parent descent (reached from the
    // exterior door, not another floor) — land exactly where a real door
    // entry does. Every other floor/side room in this tree has exactly one
    // parent descent, so _debugEntryIdFor's fixed lookup + the existing
    // landing-anchor/offset helpers reproduce a real playthrough's landing
    // spot without needing a live descent object to mirror.
    if (destination.kind === 'numbered' && destination.floorIndex === 0) {
      this._activateFloor(floor, { x: floor.exitCol * GRID.CELL_SIZE, y: (floor.exitRow - 2) * GRID.CELL_SIZE });
      return true;
    }
    const id = this._debugEntryIdFor(destination);
    floor._enteredViaId = id;
    const anchor = this._landingAnchorFor(id) ?? { row: floor.stairsUpRow, col: floor.stairsUpCol };
    const spawnCell = this._spawnOffsetFor(anchor.row, anchor.col);
    this._activateFloor(floor, { x: spawnCell.col * GRID.CELL_SIZE, y: spawnCell.row * GRID.CELL_SIZE });
    return true;
  }

  /**
   * Which descent id canonically leads to `destination` — every floor/side
   * room in the tree has exactly one parent, so this is a fixed lookup
   * (see this file's header for the graph), not a live search over descents.
   */
  _debugEntryIdFor(destination) {
    if (destination.kind === 'numbered') {
      return { 1: 'north', 2: 'west', 3: 'east', 4: 'north' }[destination.floorIndex] ?? null;
    }
    return 'north'; // every side room (Puzzle Room pool + Trap Room) is reached via a north descent
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

      // Dungeon boss encounter (vault floor only; no-ops elsewhere).
      game.dungeonBossSystem?.update?.(dt);

      // Update background objects
      for (const obj of floor.backgroundObjects) obj.update(dt);

      // Tomb Ghosts — bespoke, non-Enemy chasers spawned by opening a Tomb
      // (see DungeonGhostSystem). Independent of floor.enemies: homing +
      // lemniscate movement, contact-sap, and periodic sap damage all live
      // there, not in the enemy loop above.
      game.dungeonGhostSystem.update(floor, dt);
      game.dungeonGhostSystem.tickSap(game.player, dt);

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
    if (transition?.kind === 'ascend' && !game.activeFloor.stairsUpLocked) {
      this._ascend();
      return true;
    }

    return game.dungeonPuzzleSystem.handleSpacePress();
  }

  /**
   * SHIFT inside the dungeon. Today that is exactly one thing: the Gold
   * Breath curse's coin flip — with a slot armed, SHIFT tosses one coin from
   * the wallet (the armed slot renders as a coin while cursed, so this is the
   * same "SHIFT tosses the armed slot" grammar the game-wide Toss follows).
   * Returns true only when a coin actually flew, letting the dispatcher fall
   * through to the normal held-item drop otherwise. Runs before the held-item
   * branch in main.js, so while cursed the armed coin wins over weapon-drop —
   * disarm the slot (weapon number key) to drop items normally.
   */
  handleShiftPress() {
    const { game } = this;
    if (!game.player?.inDungeon || !game.activeFloor?.isVault) return false;
    if ((game.player.selectedConsumableIndex ?? -1) < 0) return false;
    return game.dungeonBossSystem?.dischargeCoin() ?? false;
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
