import { GRID } from '../game/GameConfig.js';
import { Player } from '../entities/Player.js';
import { activeInteriorFloor, freezeSurfaceRoom, thawSurfaceRoom } from './PlaneSystem.js';

/**
 * InteriorManager — single host for the interior/second-layer systems
 * (hut, dungeon, maze). See ADR-0001.
 *
 * The three interior systems each used to reimplement the same lifecycle
 * (enter/exit, surface freeze/thaw, per-room reset, active-source accessors,
 * SPACE/SHIFT dispatch, PiP overlay), tied together by scattered
 * `player.inHut || player.inDungeon || player.inMaze` branching. This manager
 * owns that shared lifecycle so each interior is a registered controller and a
 * new interior plugs in without a fourth copy.
 *
 * Data holders (`game.activeFloor`, `game.mazeInterior`, `game.dungeonFloors`,
 * `game.dungeonCurrentFloor`) stay on `game` — the manager owns lifecycle, game
 * holds the data (documented compromise, like trap/companion state).
 *
 * Every Interior is a Freeze layer: the surface room freezes on entry and the
 * Interior owns the frame through its PiP overlay. Hut, dungeon and Aquifer
 * floors all live on `game.activeFloor` (PlaneSystem.activeInteriorFloor); the
 * Maze keeps its own arrays on `game.mazeInterior`. Systems ask "which layer is
 * live" through the accessors below or PlaneSystem.isInteriorActive /
 * activeInteriorFloor — never a hand-written `inHut || inDungeon` list, which
 * silently leaves out the next Interior kind.
 */

// ── Derived interior-membership accessors (ADR-0001) ──────────────────────────
// player.inHut / inDungeon / inMaze / inAquifer are derived over the single
// `player._activeInteriorKind` field so every existing read and write across the
// codebase keeps working unchanged while they can never disagree. Defined on
// the prototype here (not in Player.js) to keep that file within its size budget.
function interiorMembership(kind) {
  return {
    configurable: true,
    get() { return this._activeInteriorKind === kind; },
    set(on) {
      if (on) this._activeInteriorKind = kind;
      else if (this._activeInteriorKind === kind) this._activeInteriorKind = null;
    },
  };
}
Object.defineProperties(Player.prototype, {
  inHut:     interiorMembership('hut'),
  inDungeon: interiorMembership('dungeon'),
  inMaze:    interiorMembership('maze'),
  inAquifer: interiorMembership('aquifer'),
});

export class InteriorManager {
  constructor(game) {
    this.game = game;
    // Dispatch order: dungeon → hut → maze (matches the legacy SPACE priority).
    // update() order is independent — only one interior is ever active at a time.
    this.controllers = [game.dungeonSystem, game.hutSystem, game.mazeSystem];
  }

  /** Register an additional interior controller. */
  register(controller) {
    if (controller && !this.controllers.includes(controller)) {
      this.controllers.push(controller);
    }
  }

  get activeKind() { return this.game.player?._activeInteriorKind ?? null; }
  get isActive() { return this.activeKind !== null; }

  update(dt) {
    for (const c of this.controllers) c.update?.(dt);
  }

  handleSpacePress() {
    for (const c of this.controllers) {
      if (c.handleSpacePress?.()) return true;
    }
    return false;
  }

  handleShiftPress() {
    for (const c of this.controllers) {
      if (c.handleShiftPress?.()) return true;
    }
    return false;
  }

  /**
   * Clear all interior state. Called on REST entry, room transitions, and
   * cheat-warp room swaps — replaces the duplicated reset blocks in main.js.
   */
  reset() {
    const g = this.game;
    g.activeFloor = null;
    g.mazeInterior = null;
    g.dungeonFloors = [];
    g.dungeonCurrentFloor = -1;
    // Floor 3 Key Vault run-flags (DungeonPuzzleSystem). -1 = skull floor not
    // yet rolled this visit; rolled lazily on dungeon entry.
    g.dungeonKeySkullFloor = -1;
    // An unspent Skull Key doesn't survive leaving the dungeon (matches the
    // pre-Item flag this replaced) — drop it from keyItemInventory rather
    // than let it carry into the next visit.
    g.inventorySystem.consumeKeyItem('⚿');
    g.dungeonKeyUsedThisRun = false;
    g.dungeonRareItemObtainedThisRun = false;
    // Templates already used this visit (dungeonFloorTemplates.js's
    // pickRandomTemplateName excludes these) — a fresh Set per visit so no
    // floor layout repeats within one dungeon until every template has appeared.
    g.dungeonTemplatesUsedThisRun = new Set();
    if (g.player) {
      g.player._activeInteriorKind = null;
      g.player.hutExitPosition = null;
      g.player.mazeExitPosition = null;
      g.player.dungeonExitPosition = null;
      // The Aquifer Current's carry (AquiferSystem) — membership itself is
      // cleared with _activeInteriorKind above.
      g.player.aquiferCurrent = null;
      g.player.plane = 0;
      // Tomb Ghost sap (DungeonGhostSystem) — DungeonSystem's own
      // _activateFloor/_exitDungeon hooks already clear this on the normal
      // room-leave/dungeon-exit paths; this is the defensive third
      // clear-point for every other route through reset() (REST entry,
      // cheat-warp room swaps) so the flag can never survive past an
      // interior reset by some path DungeonSystem didn't anticipate.
      g.player.tombSapped = false;
      g.player._tombSapTimer = 0;
      g.player._tombSappingGhost = null;
    }
  }

  // ── Floor Interior entry / exit ────────────────────────────────────────────
  // The one Freeze-layer transition every floor Interior (hut, Aquifer) goes
  // through, so render, physics and interaction separation come with entry
  // rather than being re-wired per kind. The kind-specific part — which floor,
  // where the player came from, any per-visit bookkeeping — stays with the
  // owning system.

  /**
   * Make `floor` the live layer: freeze the surface room, switch the player
   * (and the camp companion following them) onto the floor's collision map,
   * and place the player at `spawn`.
   */
  enterFloor(kind, floor, spawn) {
    const g = this.game, p = g.player;

    // Wipe surface combat state so in-flight surface projectiles/arrows don't
    // ghost-render at floor coordinates during interior play.
    g.combatSystem.clear();
    g.activeFloor = floor;

    for (const enemy of floor.enemies) g.physicsSystem.addEntity(enemy);

    // Hand pre-seeded floor items (bread) to the live game.items list and tag
    // them hutPlane so exitFloor sweeps any left behind. Drained so a cached
    // re-entry doesn't double-spawn.
    if (floor.items?.length) {
      for (const it of floor.items) {
        it.hutPlane = true;
        g.items.push(it);
        g.physicsSystem.addEntity(it);
      }
      floor.items = [];
    }

    p.setCollisionMap(floor.collisionMap);
    p.position.x = spawn.x;
    p.position.y = spawn.y;
    p._activeInteriorKind = kind;
    freezeSurfaceRoom(g);
    this._syncCombatMusic();

    // Bring the camp companion (if any) along — snap it beside the player and
    // onto the floor's collision map (bug #116).
    g.campNPCSystem?.snapCompanionToPlayer?.();
    if (g.companion) g.companion.collisionMap = floor.collisionMap;

    // Force background redraw so the overlay paints immediately
    g.renderer.backgroundDirty = true;
  }

  /**
   * Leave the live floor for the surface room, restoring the player to
   * `exitPosition` (if given) and thawing the surface. Loot left on the floor
   * (hutPlane) is abandoned.
   */
  exitFloor(exitPosition) {
    const g = this.game, p = g.player;

    // Wipe floor combat state so interior projectiles/arrows don't leak into
    // the surface render at floor coordinates.
    g.combatSystem.clear();

    for (const enemy of g.activeFloor?.enemies ?? []) {
      g.physicsSystem.removeEntity(enemy);
      // Drop the unconsumed tick cache so CombatSystem can't replay stale
      // dot/sap events on re-entry (bug #92)
      enemy._frameUpdateResult = null;
    }

    if (exitPosition) {
      p.position.x = exitPosition.x;
      p.position.y = exitPosition.y;
    }
    p.hookedByMimic = null;
    p.hookedByWhip = null;
    if (g.currentRoom?.collisionMap) p.setCollisionMap(g.currentRoom.collisionMap);

    p._activeInteriorKind = null;
    thawSurfaceRoom(g);

    // Bring the companion back outside beside the player
    g.campNPCSystem?.snapCompanionToPlayer?.();
    if (g.companion && g.currentRoom?.collisionMap) {
      g.companion.collisionMap = g.currentRoom.collisionMap;
    }

    // Golems summoned inside (Wizard Hut — see WizardSystem) are switched onto
    // the floor's collision map/background objects while there; resync every
    // golem back to the surface room so one summoned mid-visit doesn't keep
    // walking against the floor's grid once outside.
    if (g.golems?.length && g.currentRoom?.collisionMap) {
      const bgObjects = g._activeBackgroundObjects() || null;
      for (const golem of g.golems) {
        golem.collisionMap = g.currentRoom.collisionMap;
        golem.backgroundObjects = bgObjects;
      }
    }

    g.ingredients = g.ingredients.filter(i => !i.hutPlane);
    g.items = g.items.filter(i => !i.hutPlane);

    g.activeFloor = null;
    g.renderer.backgroundDirty = true;
    this._syncCombatMusic();
  }

  // Battle music (layer 2) follows the layer the player is on. Its only other
  // on-switch is room entry, and the per-frame clear check mutes it once the
  // active layer is empty — so without this, entering a floor muted it (the
  // frozen surface reads as cleared) and nothing turned it back on inside or
  // after leaving.
  _syncCombatMusic() {
    const g = this.game;
    g.audioSystem?.setLayer2Enabled(g._countedEnemies(g._activeEnemies()).length > 0);
  }

  // ── Active-layer source accessors ───────────────────────────────────────────
  // The room/objects/enemies/bounds the player currently interacts with: the
  // interior overlay takes priority over the surface room. Maze carries no
  // background objects or standard enemies (its content is mazeObjects/ghosts),
  // so it reports empty for those — matching the legacy main.js behavior exactly.

  get activeRoom() {
    const g = this.game, p = g.player;
    if (p?.inMaze && g.mazeInterior) return g.mazeInterior;
    return activeInteriorFloor(g) ?? g.currentRoom;
  }

  // Maze carries no standard room enemies/background objects (its content is its
  // own object arrays), so it reports empty for those.
  activeBackgroundObjects() {
    const g = this.game, p = g.player;
    if (p?.inMaze && g.mazeInterior) return [];
    const floor = activeInteriorFloor(g);
    if (floor) return floor.backgroundObjects;
    return g.currentRoom ? g.currentRoom.backgroundObjects : [];
  }

  activeEnemies() {
    const g = this.game, p = g.player;
    if (p?.inMaze && g.mazeInterior) return [];
    const floor = activeInteriorFloor(g);
    if (floor) return floor.enemies;
    return g.currentRoom ? g.currentRoom.enemies : [];
  }

  /**
   * The NPCs the player can talk to or trade with on the live layer: the
   * floor's own `npcs` inside a floor Interior, none in the Maze, and the
   * room's neutral characters on the surface. Every NPC interaction scan
   * reads this, so a surface NPC is never reachable from inside an Interior.
   */
  activeNpcs() {
    const g = this.game;
    const floor = activeInteriorFloor(g);
    if (floor) return floor.npcs ?? [];
    if (g.player?.inMaze) return [];
    return g.neutralCharacters ?? [];
  }

  // Strips destroyed entries from the surface room's background-object list
  // (and the active interior floor's, when one is loaded) — both, not just
  // whichever layer is active, since a stray destroyed object on the inactive
  // layer needs cleanup too. In place, NOT `list = list.filter(...)`: enemies
  // cache their room's array by reference once at spawn (Enemy.setBackgroundObjects,
  // read every frame by enemyVision.js's obstructsPoint for vision-blocking
  // checks), so reassigning the array here would silently orphan that
  // reference from that frame on — anything pushed into the list afterward
  // (e.g. Emerald Staff grass cast mid-fight) would never reach an
  // already-spawned enemy's vision check.
  pruneDestroyedBackgroundObjects() {
    const g = this.game;
    this._pruneDestroyed(g.currentRoom.backgroundObjects);
    if (g.activeFloor) this._pruneDestroyed(g.activeFloor.backgroundObjects);
  }

  _pruneDestroyed(list) {
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i].destroyed) list.splice(i, 1);
    }
  }

  activeGridBounds() {
    const g = this.game;
    const f = activeInteriorFloor(g);
    if (f) {
      return { cols: f.gridCols, rows: f.gridRows, collisionMap: f.collisionMap };
    }
    return { cols: GRID.COLS, rows: GRID.ROWS, collisionMap: g.currentRoom?.collisionMap ?? null };
  }
}
