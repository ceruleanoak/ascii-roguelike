import { GRID } from '../game/GameConfig.js';
import { BackgroundObject } from '../entities/BackgroundObject.js';

/**
 * BarricadeSystem — raises and owns Barricades: the things stamped across an
 * exit lane that ask what the run is carrying and answer by opening or not.
 *
 * Lifted out of ThreeRoomSystem, which raised the only two that existed (rocks
 * on the second north of a streak, Petrified Trees on the third) and said in
 * its own comment that a second caller was the trigger to give the shape a
 * system. ThreeRoomSystem still owns the streak — it is the only thing that
 * knows how many norths in a row the run has taken — and now answers with a
 * descriptor rather than stamping objects itself.
 *
 * All Barricade state lives on `room.barricade`, never on `game`: it dies with
 * the room, so there is no run-scoped field for a reset path to forget.
 */
export class BarricadeSystem {
  constructor(game) {
    this.game = game;
  }

  /**
   * Raise a Barricade in a freshly generated room, if anything asks for one.
   * Called unconditionally from enterExploreState for every room the world
   * builds, so the call site stays free of the conditions; everything that
   * decides whether to place anything is here.
   *
   * A Cursed run is never barricaded. The streak still counts there, but the
   * world has stopped answering the third north — asking for an axe to open a
   * door that is no longer behind it would be a cruelty with nothing on the far
   * side.
   */
  raiseForRoom(room) {
    const { game } = this;
    if (!room) return;
    room.barricade = null;
    if (game?.cursedRun) return;

    const descriptor = game?.threeRoomSystem?.streakBarricade();
    if (!descriptor) return;

    // Nothing to barricade without a way north. Never the gray zone's own '3'
    // exit either: that is the inevitable path, and it stays inevitable.
    const north = room.exits?.north;
    if (!north || north.threeRoom) return;

    this._raise(room, 'north', descriptor);
  }

  // Stamp a descriptor across one exit lane and record it on the room.
  _raise(room, direction, descriptor) {
    const objects = [];
    for (const { col, row } of laneCells(direction)) {
      this._clearCell(room, col, row);
      const obj = this._buildPlug(descriptor, col, row);
      room.backgroundObjects.push(obj);
      objects.push(obj);
    }
    room.barricade = { id: descriptor.id, shape: descriptor.shape, direction, objects };
  }

  // A material plug: ordinary breakable Background Objects, so the tool that
  // opens it is whatever InteractionSystem's smash rules already say breaks
  // that material. Nothing polls these — breaking them IS the clearing.
  _buildPlug(descriptor, col, row) {
    const cs = GRID.CELL_SIZE;
    const obj = descriptor.typeId
      ? BackgroundObject.createVariant(descriptor.typeId, col * cs, row * cs)
      : new BackgroundObject(descriptor.char, col * cs, row * cs);
    // Part of a placed structure, not scatter — the same exemption the hut
    // walls and the Graveyard Divider carry, so roomFeatures' stray-object
    // sweep leaves it alone.
    obj.structural = true;
    return obj;
  }

  /**
   * Whatever generation already left in a Barricade cell gives way to it.
   * Spliced in place rather than filtered into a new array, because the room's
   * list is aliased onto the surface mirror once the swap lands.
   */
  _clearCell(room, col, row) {
    const cs = GRID.CELL_SIZE;
    const objs = room.backgroundObjects || [];
    for (let i = objs.length - 1; i >= 0; i--) {
      const o = objs[i];
      if (Math.floor(o.position.x / cs) === col && Math.floor(o.position.y / cs) === row) {
        objs.splice(i, 1);
      }
    }
  }
}

// The footprint: two cells deep into the room, three cells wide across the
// lane, centred on the exit gap (the same cell EXIT_SLOT_POSITIONS puts the
// letter on). Plug materials tend to carry narrow hitboxes (a round rock; a
// tree's trunk), so a single cell would leave room to slide past one and still
// read as standing in the gap — see ExitSystem.isPressingIntoExitGap, which
// only asks that the player's box overlap the lane at all.
export function laneCells(direction) {
  const centerX = Math.floor(GRID.COLS / 2);
  const centerY = Math.floor(GRID.ROWS / 2);
  const cells = [];
  for (let depth = 1; depth <= 2; depth++) {
    for (let across = -1; across <= 1; across++) {
      switch (direction) {
        case 'north': cells.push({ col: centerX + across, row: depth }); break;
        case 'south': cells.push({ col: centerX + across, row: GRID.ROWS - 1 - depth }); break;
        case 'west':  cells.push({ col: depth,                row: centerY + across }); break;
        case 'east':  cells.push({ col: GRID.COLS - 1 - depth, row: centerY + across }); break;
      }
    }
  }
  return cells;
}
