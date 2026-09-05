import { GRID } from '../game/GameConfig.js';

// The Graveyard is never empty on a first look, and it thickens from there.
const GRAVEYARD_BASE = 5;
const GRAVEYARD_PER_ROOM = 2;
// A ceiling, so a long cursed run crowds the lower two thirds without turning
// them into a solid block of letters.
const GRAVEYARD_MAX = 40;

/**
 * CursedRunSystem — what a Cursed run does to the rest of the world.
 *
 * The curse starts in the Three Room (ThreeRoomSystem sets `game.cursedRun`
 * when a slot cracks) but it does not stay there. Everything the flag changes
 * OUTSIDE that room is owned here, so the escalation lands in one file instead
 * of scattering conditionals through the orchestrator: REST opening its south
 * wall onto the Graveyard first, and — as the curse runs further — REST going
 * gray, no longer healing, and admitting the Undead.
 *
 * Every method is a no-op on an uncursed run, so call sites stay unconditional.
 */
export class CursedRunSystem {
  constructor() {
    // Rooms explored since the curse landed. System-internal rather than a
    // game.* field, the same shape as ThreeRoomSystem's north streak: nothing
    // outside this system reads it, so it does not belong on the contract
    // surface. hardReset() is its reset home.
    this._roomsExplored = 0;
  }

  /** Full run-scoped reset — death/title. */
  hardReset() {
    this._roomsExplored = 0;
  }

  /**
   * A newly explored room. Only counts while cursed, because the Graveyard is
   * counting what the curse has cost, not how far the run has gone.
   */
  recordRoomExplored(game) {
    if (!game.cursedRun) return;
    this._roomsExplored++;
  }

  /**
   * How many Undead the Graveyard holds right now. It starts already occupied
   * — the curse did not arrive empty-handed — and thickens with every room
   * explored after, up to a ceiling where the lower two thirds read as full.
   */
  graveyardPopulation() {
    return Math.min(GRAVEYARD_BASE + this._roomsExplored * GRAVEYARD_PER_ROOM, GRAVEYARD_MAX);
  }

  /**
   * Fill the Graveyard's lower two thirds, replacing whatever the last visit
   * left. The population is the run's, not the room's, so it is rebuilt from
   * the counter on every entry rather than persisted with the room object.
   */
  populateGraveyard(game) {
    const room = game.currentRoom;
    if (!room?.isGraveyard) return;

    const cs = GRID.CELL_SIZE;
    const firstRow = (room.graveyardDividerRow ?? Math.floor(GRID.ROWS / 3)) + 2;
    const bounds = {
      x: cs * 2,
      y: firstRow * cs,
      w: (GRID.COLS - 4) * cs,
      h: (GRID.ROWS - 2 - firstRow) * cs
    };

    game.undeadSystem.clear();
    game.undeadSystem.fill(game, bounds, this.graveyardPopulation(), { silent: true });
  }

  /**
   * Leaving the Graveyard. Its Undead belong to the room and go with it — the
   * curse itself does not, so `game.cursedRun` is untouched and the next entry
   * rebuilds a thicker crowd from the counter.
   */
  onRoomExit(game, room) {
    if (!room?.isGraveyard) return;
    game.undeadSystem.clear();
  }

  /**
   * Open REST's south wall onto the Graveyard.
   *
   * REST is rebuilt from scratch on every entry, so this runs each time rather
   * than once — the wall is a property of the run's state, not an event. Both
   * halves are needed: the `exits` flag is what RestRenderer's border and the
   * south-crossing check read, and the collision cell is what lets the player
   * actually stand in the gap.
   */
  applyToRest(game, room) {
    if (!game.cursedRun || !room) return;

    room.exits.south = true;
    const centerX = Math.floor(GRID.COLS / 2);
    if (room.collisionMap?.[GRID.ROWS - 1]) room.collisionMap[GRID.ROWS - 1][centerX] = false;
  }
}
