import { GRID, COLORS } from '../game/GameConfig.js';
import { ZONE_COLORS } from '../data/zones.js';

// The Graveyard is never empty on a first look, and it thickens from there.
const GRAVEYARD_BASE = 5;
const GRAVEYARD_PER_ROOM = 2;
// A ceiling, so a long cursed run crowds the lower two thirds without turning
// them into a solid block of letters.
const GRAVEYARD_MAX = 40;

// How many rooms the curse has to be carried through before REST itself gives
// way. Long enough that the Graveyard has visibly thickened across several
// visits first — the hub going gray reads as the last thing to fall, not the
// opening move.
const REST_DECAY_ROOMS = 8;

// A decayed REST admits the Undead through its south door one at a time — the
// pace is the point, so the player watches the hub fill while they craft
// rather than turning around to find a crowd already standing there.
const REST_STREAM_INTERVAL = 7.0;
const REST_STREAM_MAX = 12;

// How far in from the door an arrival makes for before it starts milling.
const REST_WALK_IN_CELLS = 6;

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

    // Counts down to the next arrival through REST's south door. Reset on
    // every REST entry (applyToRest) as well as on a full run reset.
    this._streamTimer = REST_STREAM_INTERVAL;
  }

  /** Full run-scoped reset — death/title. */
  hardReset() {
    this._roomsExplored = 0;
    this._streamTimer = REST_STREAM_INTERVAL;
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
   * Has REST itself given way — gray instead of green, no longer healing, and
   * admitting the Undead through its south door?
   *
   * One predicate for all three, so the border, the heal and the spawner can
   * never disagree about which REST the player is standing in.
   */
  isRestDecayed(game) {
    return !!game.cursedRun && this._roomsExplored >= REST_DECAY_ROOMS;
  }

  /**
   * The color REST draws its own chrome in — the border, the crafting
   * brackets, the movement keys and their brackets. Green while the hub is
   * still the hub; the gray zone's own color once the curse has taken it,
   * because gray is what the world is bending toward and REST is the last
   * thing in it to go.
   */
  restChromeColor(game) {
    return this.isRestDecayed(game) ? ZONE_COLORS.gray : COLORS.BORDER;
  }

  /**
   * The HP a rebuilt REST player should start with, or null to let REST heal
   * the way it always has.
   *
   * REST heals as a side effect of reconstructing the Player on entry, so
   * refusing to heal means carrying the wound across that rebuild — the same
   * trick the magic meter already uses. Reads the outgoing Player, so it must
   * be called before the new one replaces it.
   */
  carryRestHp(game, priorPlayer) {
    if (!this.isRestDecayed(game)) return null;
    const hp = priorPlayer?.hp;
    return typeof hp === 'number' && hp > 0 ? hp : null;
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
   * REST's own per-frame tick. Inert until the hub has given way, then it
   * walks one more of the Undead up through the south door on a slow beat,
   * stopping once the room holds as many as it is meant to.
   */
  updateRest(dt, game) {
    if (!this.isRestDecayed(game)) return;
    if (game.undeadSystem.count >= REST_STREAM_MAX) return;

    this._streamTimer -= dt;
    if (this._streamTimer > 0) return;
    this._streamTimer = REST_STREAM_INTERVAL;

    const cs = GRID.CELL_SIZE;
    const doorX = Math.floor(GRID.COLS / 2) * cs;
    const doorY = (GRID.ROWS - 1) * cs;
    game.undeadSystem.enter(game, doorX, doorY, doorX, doorY - cs * REST_WALK_IN_CELLS);
  }

  /**
   * Everything the curse stamps onto REST at the moment it is entered: the
   * south wall opened onto the Graveyard, the door's arrival beat restarted,
   * and — once the hub has given way — the next EXPLORE forced gray.
   *
   * REST is rebuilt from scratch on every entry, so this runs each time rather
   * than once; the wall is a property of the run's state, not an event. Both
   * halves of it are needed: the `exits` flag is what RestRenderer's border and
   * the south-crossing check read, and the collision cell is what lets the
   * player actually stand in the gap.
   */
  applyToRest(game, room) {
    if (!game.cursedRun || !room) return;

    room.exits.south = true;
    const centerX = Math.floor(GRID.COLS / 2);
    if (room.collisionMap?.[GRID.ROWS - 1]) room.collisionMap[GRID.ROWS - 1][centerX] = false;

    // The room is entered empty (enterRestState clears the Undead), so the
    // door's beat starts over with it rather than carrying a stale countdown.
    this._streamTimer = REST_STREAM_INTERVAL;

    // Once REST has given way, EXPLORE is gray from here on. resetOnRest() has
    // just put the zone back to green a few lines above this call, so the force
    // goes in after it — and is re-applied on every entry rather than set once.
    // Only the first room needs it: ZoneSystem keeps gray sticky after that.
    if (this.isRestDecayed(game)) game.zoneSystem.forceNextZone('gray');
  }
}
