import { GRID } from '../game/GameConfig.js';
import { freezeSurfaceRoom, thawSurfaceRoom, isInteriorActive } from './PlaneSystem.js';
import { NORTH_ROW, STAIRS_COL } from '../data/dungeonFloorTemplates.js';
import { pickRandomPuzzleTemplateName, PUZZLE_ROOM_TEMPLATES } from '../data/dungeonPuzzleTemplates.js';
import { getDungeonRecipe } from '../data/dungeonRecipes.js';
import { buildDungeonGraph, validateGraph, edgeInto, skullKeyNodes, DESCENT_ID_FOR } from './dungeonGraphBuilder.js';
import FOOTPRINT_CONTRACT from '../data/dungeon/footprintContract.json';
import { landingCellFor } from '../data/dungeon/footprints.js';
import { SpawnVentSystem } from './SpawnVentSystem.js';

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
 * Each visit rolls a Dungeon Graph (GLOSSARY.md) from the zone's Dungeon
 * Recipe — rollVisit(), on first entry. The graph names every floor as a
 * node (a Floor Kind: entrance, corridor, branch, pyramid, vault, trapRoom,
 * puzzleRoom) and every descent as an edge (footprint dir + Reveal).
 * Every graph runs Entrance → 1-3 corridors (a chain, or a triangle whose
 * open side bypasses the Skull Key door) → Branch → Pyramid → Vault, with
 * the Trial (a Puzzle Room) off a corridor and the Trap Room off whichever
 * floor kinds the recipe allows (dungeonGraphBuilder.js).
 *
 * Floors are generated on demand and stored on interiorState.floors under
 * their node id. Every floor carries its own `descents[]` (destination
 * `{ node }`) and `ascendTo` (`{ node }` of the floor the player came down
 * from, or null on the Entrance), so a floor with several ways in still
 * climbs back to the one the player took.
 *
 * Floor data lives on the host D-room (`room.dungeon.interiorState`, read
 * through this.interiorState) and lasts as long as that room: exit and
 * re-entry, a trip to REST and back, and a character-swap death all come
 * back to the same floors. A new room brings a new Dungeon.
 * InteriorManager.reset() only detaches the live floor (stashActiveFloor).
 */

const INTERIOR_COLS = 24;

// CheatMenu warp entries by Floor Kind (debugWarpItems). Floors without a
// char take their position in the graph as a digit.
const WARP_LOOK = {
  vault:      { color: '#ffcc00' },
  trapRoom:   { char: '!', color: '#ff8844', forceRegenerate: true },
  puzzleRoom: { char: '?', color: '#cc66ff', forceRegenerate: true },
  default:    { color: '#aaaaaa' },
};

// Proximity radius for door/staircase interaction (px from cell center)
const DOOR_INTERACT_RADIUS = GRID.CELL_SIZE * 2;

export class DungeonSystem {
  constructor(game) {
    this.game = game;
    // Spawn Vents exist only on dungeon floors, so their ticker is this
    // system's collaborator rather than a Game-level system.
    this.spawnVentSystem = new SpawnVentSystem(game);
  }

  // ─── Dungeon state (lives on the host room) ──────────────────────────────

  /**
   * The current room's Dungeon state — its floor stack and Skull Key
   * bookkeeping (RoomGenerator builds it with the D-room). Null in any room
   * without a Dungeon.
   */
  get interiorState() {
    return this.game.currentRoom?.dungeon?.interiorState ?? null;
  }

  /** Is `floor` one of the current room's Dungeon floors? */
  ownsFloor(floor) {
    const floors = this.interiorState?.floors;
    return !!floor && !!floors && Object.values(floors).includes(floor);
  }

  /**
   * Is a Skull Key still owed to a Dungeon that is still around — rolled but
   * not yet spent, in the current room, the room REST will restore, or the
   * room a neutral detour returns to? A held '⚿' lasts exactly as long as
   * that; InteriorManager.reset() drops it once it isn't.
   */
  skullKeyOutstanding() {
    const { game } = this;
    const rooms = [game.currentRoom, game.inventorySystem?.savedExploreRoom, game.savedExploreState?.room];
    return rooms.some(room => {
      const state = room?.dungeon?.interiorState;
      return !!state && state.keySkullNode != null && !state.keyUsed;
    });
  }

  /**
   * Hand the live floor's loot, traps and enemies back to the floor object
   * so it is intact when activated again. Shared by every way off a floor
   * (floor swap, the ∩ exit, and InteriorManager.reset() when REST or a
   * death takes the player straight out of the Dungeon).
   */
  stashActiveFloor() {
    const { game } = this;
    const floor = game.activeFloor;
    if (!floor) return;
    floor.items       = game.items.filter(i => i.hutPlane);
    floor.ingredients = game.ingredients.filter(i => i.hutPlane);
    floor.placedTraps = game.trapSystem.takeInteriorTraps();
    game.items       = game.items.filter(i => !i.hutPlane);
    game.ingredients = game.ingredients.filter(i => !i.hutPlane);
    // Floor enemies leave physics (they remain on floor.enemies). Also drop
    // unconsumed tick caches so CombatSystem can't replay stale dot/sap
    // events on re-entry (bug #92).
    for (const e of floor.enemies ?? []) {
      game.physicsSystem.removeEntity(e);
      e._frameUpdateResult = null;
    }
  }

  // ─── Visit roll ─────────────────────────────────────────────────────────

  /**
   * Roll this visit's Dungeon Graph, once, on the first way in (the door or a
   * debug warp): the zone's Dungeon Recipe lays out the floors, the Trial
   * node gets its Puzzle Room template, and the Skull Key picks the floor its
   * bone pile drops on — a floor that can hold it and is reachable before
   * the door it opens. Re-entering the same D-room keeps the roll.
   */
  rollVisit() {
    const state = this.interiorState;
    if (!state || state.graph) return;
    const recipe = getDungeonRecipe(this.game.currentRoom?.zone || 'green');
    const graph = buildDungeonGraph(recipe);
    const errors = validateGraph(graph);
    if (errors.length) console.warn(`[DungeonSystem] rolled an unsound Dungeon Graph: ${errors.join('; ')}`);

    for (const node of Object.values(graph.nodes)) {
      if (node.kind === 'puzzleRoom') node.template = pickRandomPuzzleTemplateName();
    }

    const keyFloors = skullKeyNodes(graph);
    state.graph = graph;
    state.keySkullNode = keyFloors[Math.floor(Math.random() * keyFloors.length)] ?? null;
  }

  // ─── Floor Generation (delegated) ─────────────────────────────────────────

  /** The floor for graph node `nodeId`, generated on first visit this Dungeon. */
  ensureFloorGenerated(nodeId) {
    const { game } = this;
    const state = this.interiorState;
    if (!state?.graph?.nodes[nodeId]) return null;
    game.currentRoom.dungeon.interiorGenerated = true;
    if (!state.floors[nodeId]) {
      const depth = game.getCurrentZoneDepth ? game.getCurrentZoneDepth() : 1;
      state.floors[nodeId] = game.dungeonFloorGenerator.generateNode(nodeId, depth);
    }
    return state.floors[nodeId];
  }

  // ─── Proximity Checks ────────────────────────────────────────────────────

  /** Returns true if player is close enough to the exterior dungeon door to interact. */
  nearExteriorDoor() {
    const { game } = this;
    if (!game.player || isInteriorActive(game)) return false;
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

    this.rollVisit();
    const entrance = this.ensureFloorGenerated('entrance');

    // Enter from exterior: spawn near the ∩ exit door.
    const spawn = { x: entrance.exitCol * GRID.CELL_SIZE, y: (entrance.exitRow - 2) * GRID.CELL_SIZE };
    this._activateFloor(entrance, spawn);
  }

  // ─── Floor Transitions ────────────────────────────────────────────────────

  /**
   * Step one cell from a border-adjacent footprint toward the room's
   * interior. Footprints sit on all 4 sides (North descent top, up-stairs
   * bottom, West/East descents left/right), so the step direction comes from
   * which border band the footprint is on — dungeon/footprints.js owns the
   * geometry, shared with the Progression Solver that proves the landing
   * cell is walkable.
   */
  _spawnOffsetFor(row, col) {
    return landingCellFor(row, col, FOOTPRINT_CONTRACT);
  }

  /**
   * Where a player arriving on `floor` from above lands: beside the floor's
   * own up-stairs, so the way back is the door they came through (the
   * "matching doors are always in the same room position" rule). Every
   * graph floor's up-stairs sits at the South footprint (the node's upDir).
   *
   * Puzzle Rooms are the exception: their up-stairs is the template's locked
   * 'X' exit, placed wherever the author chose, so every puzzle template is
   * authored — and checked by the Progression Solver — around one fixed
   * arrival beside the North footprint.
   */
  _landingAnchorFor(floor) {
    if (floor.kind === 'puzzleRoom') return { row: NORTH_ROW, col: STAIRS_COL };
    return { row: floor.stairsUpRow, col: floor.stairsUpCol };
  }

  /**
   * Activate a floor, positioning the player at the provided spawn point.
   */
  _activateFloor(floor, spawn) {
    const { game } = this;

    // Wipe combat state on every floor activation (initial entry + inter-floor).
    // In-flight projectiles/arrows shouldn't carry across context boundaries.
    game.combatSystem.clear();
    // Transient world effects (particles, puddles/slime trails, goo blobs,
    // debris, steam clouds) carry no floor/room identity to filter by, so a
    // full clear mirrors the surface's own applyRoomSwap() contract — without
    // this, a puddle dropped on one floor kept rendering and applying contact
    // on every floor descended/ascended to afterward.
    game._resetEnvironmentalEffects();

    // Swap floors: the floor being left keeps its enemies, loot and placed
    // traps (stashActiveFloor), then the new floor's are loaded.
    this.stashActiveFloor();
    for (const e of floor.enemies) game.physicsSystem.addEntity(e);

    for (const item of floor.items) {
      if (!game.items.includes(item)) game.items.push(item);
    }
    for (const ing of (floor.ingredients || [])) {
      if (!game.ingredients.includes(ing)) game.ingredients.push(ing);
    }

    // Placed traps stay on the floor they were set on (stashed above), and
    // every floor is a fresh room for the quick-slotted traps' charges.
    game.placedTraps.push(...(floor.placedTraps ?? []));
    game.trapSystem.resetTrapsForNewRoom();

    game.activeFloor = floor;
    game.dungeonCurrentFloor = floor.nodeId;

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

    // …then let the music follow whatever that produced — ambient on an
    // ordinary floor, the boss track once the Vault encounter is live.
    this.syncDungeonMusic();

    game.renderer.backgroundDirty = true;
  }

  /**
   * Point the music at the track this Dungeon should be playing right now:
   * its Zone's ambient track, or the Dungeon Boss track once the Vault
   * encounter is live and that Dungeon declares one.
   *
   * Safe to call on any state change — AudioSystem no-ops when the chosen
   * track is already playing, so floor swaps don't restart the music. This is
   * the only place the choice is made; DungeonBossSystem re-runs it at the
   * encounter's edges rather than reaching for tracks itself.
   */
  syncDungeonMusic() {
    const { game } = this;
    if (!game.player?.inDungeon) return;
    const music = game.audioSystem.getDungeonMusic(game.currentRoom?.zone || 'green');
    const track = (music.boss && game.dungeonBossSystem?.isEncounterLive())
      ? music.boss
      : music.ambient;
    game.audioSystem.switchToDungeonTrack(track, import.meta.env.BASE_URL);
  }

  _descend(descent) {
    const { game } = this;
    if (!descent.active || descent.locked) return;
    const nextFloor = this.ensureFloorGenerated(descent.destination.node);
    if (!nextFloor) return;

    // Remember which floor and staircase led here so _ascend() can reverse
    // it exactly — a floor reached by more than one descent climbs back to
    // the one the player took — and land beside the new floor's way back up
    // (_landingAnchorFor).
    nextFloor.ascendTo = { node: game.activeFloor.nodeId };
    nextFloor._enteredViaId = descent.id;
    const anchor = this._landingAnchorFor(nextFloor);
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
    const prevFloor = this.ensureFloorGenerated(current.ascendTo.node);
    if (!prevFloor) return;

    // Land on the exact descent used to enter `current` this visit (set by
    // _descend), not just the first descent that happens to point at the
    // same destination — a floor can have multiple descents to the same
    // destination (e.g. two descents into the Branch) that must
    // reverse independently. Falls back to a destination match, then to the
    // floor's up-stairs point, for the should-be-impossible case a floor was
    // activated without going through _descend().
    let origin = prevFloor.descents.find(d => d.id === current._enteredViaId);
    if (!origin) origin = prevFloor.descents.find(d => d.destination.node === current.nodeId);
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
    // Same effect-array clear as _activateFloor — leftover interior puddles/
    // goo/debris must not persist into the surface pass on exit.
    game._resetEnvironmentalEffects();

    // Hand the floor its loot, traps and enemies back before clearing the
    // globals, so re-entering the same D room finds it as it was left.
    this.stashActiveFloor();

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

    // The floors persist on the D-room (interiorState); only the live floor
    // is detached so exterior physics paths don't see stale interior state.
    game.dungeonCurrentFloor = null;
    game.activeFloor = null;

    // Surface music resumes. Forced because currentMusicZone was never touched
    // while the Dungeon override held the output (same contract as the maze).
    game.audioSystem.switchZoneMusic(
      game.currentRoom?.zone || 'green', import.meta.env.BASE_URL, true);

    game.renderer.backgroundDirty = true;
  }

  // ─── Debug Warp (Cheat Menu) ────────────────────────────────────────────

  /**
   * Cheat-menu-only: jump straight to any floor of this visit's Dungeon Graph
   * from anywhere in the D room (exterior or already inside), bypassing the
   * normal descent chain and any lock gating. `forceRegenerate` always builds
   * a fresh floor and overwrites the cached one, instead of reusing
   * ensureFloorGenerated's once-per-visit cache — the Puzzle Room and Trap
   * Room entries use it so:
   *   (a) picking a specific puzzle template (`template`, written onto the
   *       Trial node) is a genuine "brute force which puzzle room generates"
   *       rather than replaying the visit's one weighted-random pick, and
   *   (b) re-picking mid-visit resets that room's trigger/gap/solve state
   *       instead of reactivating a stale, already-solved instance.
   * Floors on the way to the Vault skip forceRegenerate — no reason to nuke
   * a Corridor's enemies/loot for a plain floor jump.
   */
  debugWarpTo(nodeId, { forceRegenerate = false, template = null } = {}) {
    const { game } = this;
    if (!game.currentRoom?.dungeon || !game.player) return false;

    // Mirror _enterDungeon()'s one-time setup when jumping in from outside
    // the interior — same exit-position snapshot + visit roll a real door
    // entry would produce, so ascend-to-exterior and the key hunt still
    // behave normally after a debug jump.
    if (!game.player.inDungeon) {
      game.player.dungeonExitPosition = { x: game.player.position.x, y: game.player.position.y };
    }
    this.rollVisit();
    const state = this.interiorState;
    const node = state.graph.nodes[nodeId];
    if (!node) return false;

    if (template) node.template = template;
    if (forceRegenerate) delete state.floors[nodeId];
    const floor = this.ensureFloorGenerated(nodeId);
    if (!floor) return false;

    // Entrance is the one floor with no parent descent (reached from the
    // exterior door, not another floor) — land exactly where a real door
    // entry does. Every other floor lands as if it came down the first
    // descent the graph leads into it by.
    if (nodeId === 'entrance') {
      this._activateFloor(floor, { x: floor.exitCol * GRID.CELL_SIZE, y: (floor.exitRow - 2) * GRID.CELL_SIZE });
      return true;
    }
    const entry = edgeInto(state.graph, nodeId);
    floor.ascendTo = { node: entry.from };
    floor._enteredViaId = DESCENT_ID_FOR[entry.dir];
    const anchor = this._landingAnchorFor(floor);
    const spawnCell = this._spawnOffsetFor(anchor.row, anchor.col);
    this._activateFloor(floor, { x: spawnCell.col * GRID.CELL_SIZE, y: spawnCell.row * GRID.CELL_SIZE });
    return true;
  }

  /**
   * CheatMenu dungeon warps: one entry per floor of this visit's Dungeon
   * Graph (rolling the visit if the Dungeon hasn't been entered yet), plus
   * one per named Puzzle Room template aimed at the Trial node. The Trap
   * Room and the templates force-regenerate on each pick (see debugWarpTo).
   * The Vault entry is a one-pick jump to the boss: landing there fires the
   * encounter (_activateFloor → dungeonBossSystem.onFloorActivated).
   */
  debugWarpItems() {
    this.rollVisit();
    const graph = this.interiorState?.graph;
    if (!graph) return [];
    const nodeIds = Object.keys(graph.nodes);
    const floorItems = nodeIds.map((nodeId, i) => {
      const kind = graph.nodes[nodeId].kind;
      const look = WARP_LOOK[kind] ?? WARP_LOOK.default;
      return {
        char: look.char ?? String(i % 10), name: nodeId.toUpperCase(), type: 'dungeon_warp',
        nodeId, forceRegenerate: !!look.forceRegenerate, color: look.color,
      };
    });
    const trial = nodeIds.find(id => graph.nodes[id].kind === 'puzzleRoom');
    const templateItems = trial ? Object.keys(PUZZLE_ROOM_TEMPLATES).map(name => ({
      char: '?', name: name.toUpperCase(), type: 'dungeon_warp',
      nodeId: trial, template: name, forceRegenerate: true, color: '#cc66ff',
    })) : [];
    return [...floorItems, ...templateItems];
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

      // Interior enemies tick and die through the one canonical pipeline,
      // EnemyUpdateSystem.update / removeDeadEnemies, which read the active
      // layer — never a floor-local copy (Bumpers stopped bumping indoors).

      // Dungeon boss encounter (vault floor only; no-ops elsewhere). Runs
      // BEFORE the death sweep (EnemyUpdateSystem.removeDeadEnemies, later
      // in the frame) on purpose: the boss owns its own death beat
      // (authored payout, no generic destroy thud or gray debris), and it
      // removes itself from the roster once paid out.
      game.dungeonBossSystem?.update?.(dt);

      // Spawn Vents — the death sweep ran last frame, so a vent sees its
      // kills gone, and before the puzzle gates so a Shutter never
      // opens on a tick its vent refilled the room.
      // rest-parity: absent because Spawn Vents only exist on dungeon floors.
      this.spawnVentSystem.update(floor, dt);

      // Puzzle/gating logic (key vault lock, companion-gate visibility,
      // trap-room clear gate, companion-switch puzzle, compass beep).
      game.dungeonPuzzleSystem.update(floor, dt);

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
