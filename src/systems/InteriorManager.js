import { GRID } from '../game/GameConfig.js';
import { Player } from '../entities/Player.js';

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
 * The Aquifer (Quagmire dive) is intentionally NOT an interior here: it is plane-1
 * content laid onto the surface room (reusing the underground render/physics path),
 * not a separate layer with its own collision source. AquiferSystem owns it.
 */

// ── Derived interior-membership accessors (ADR-0001) ──────────────────────────
// player.inHut / inDungeon / inMaze are derived over the single
// `player._activeInteriorKind` field so every existing read and write across the
// codebase keeps working unchanged while the three can never disagree. Defined on
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
    if (g.player) {
      g.player._activeInteriorKind = null;
      g.player.hutExitPosition = null;
      g.player.mazeExitPosition = null;
      g.player.dungeonExitPosition = null;
      // Aquifer is plane-1 content on the surface room, not a registered interior;
      // clear its dive state here alongside the interior resets.
      g.player.inAquifer = false;
      g.player.aquiferExitPosition = null;
      g.player.plane = 0;
    }
  }

  // ── Active-layer source accessors ───────────────────────────────────────────
  // The room/objects/enemies/bounds the player currently interacts with: the
  // interior overlay takes priority over the surface room. Maze carries no
  // background objects or standard enemies (its content is mazeObjects/ghosts),
  // so it reports empty for those — matching the legacy main.js behavior exactly.

  get activeRoom() {
    const g = this.game, p = g.player;
    if (p?.inMaze && g.mazeInterior) return g.mazeInterior;
    if ((p?.inHut || p?.inDungeon) && g.activeFloor) return g.activeFloor;
    return g.currentRoom;
  }

  // Maze carries no standard room enemies/background objects (its content is its
  // own object arrays), so it reports empty for those.
  activeBackgroundObjects() {
    const g = this.game, p = g.player;
    if (p?.inMaze && g.mazeInterior) return [];
    if ((p?.inHut || p?.inDungeon) && g.activeFloor) return g.activeFloor.backgroundObjects;
    return g.currentRoom ? g.currentRoom.backgroundObjects : [];
  }

  activeEnemies() {
    const g = this.game, p = g.player;
    if (p?.inMaze && g.mazeInterior) return [];
    if ((p?.inHut || p?.inDungeon) && g.activeFloor) return g.activeFloor.enemies;
    return g.currentRoom ? g.currentRoom.enemies : [];
  }

  activeGridBounds() {
    const g = this.game, p = g.player;
    const f = g.activeFloor;
    if ((p?.inHut || p?.inDungeon) && f) {
      return { cols: f.gridCols, rows: f.gridRows, collisionMap: f.collisionMap };
    }
    return { cols: GRID.COLS, rows: GRID.ROWS, collisionMap: g.currentRoom?.collisionMap ?? null };
  }
}
