import { GRID, ROOM_TYPES } from '../game/GameConfig.js';
import { BackgroundObject } from '../entities/BackgroundObject.js';
import { BARRICADE_FAMILIES, FAMILY_BY_COLOR } from '../data/barricades.js';
import { tickTriggers } from './triggerMachine.js';
import { isExitLetterTile } from './ExitSystem.js';
import { createBurstParticles } from './WorldEffectsSystem.js';

// Barricades stay out of the first two depths of a zone: the shape has to be
// met somewhere it can be answered, and a run two rooms deep is still finding
// its first weapon.
const ORGANIC_MIN_DEPTH = 3;

// Per room, per eligible exit set — often enough to read as a rule of the
// world, rare enough that meeting one is still an event.
const ORGANIC_CHANCE = 0.25;

// Directions a Barricade can be raised across. South is the way back to REST
// and is never gated; a run always keeps its retreat.
const BARRICADEABLE = ['north', 'east', 'west'];

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

    // A Ridge is already a gate, and it is the only one this room is making.
    // Its north lane is the far lip of the ravine — a plug raised there would
    // stand out over the painted drop with nothing to stand on, and the room
    // has stripped its own combat out (noCombat) precisely because crossing is
    // the whole ask. Whatever the run is carrying, the bridge is the answer.
    if (room.type === ROOM_TYPES.RIDGE) return;

    // The streak's own Barricade takes the north exit and outranks any roll:
    // the approach to the source is gated whether or not the room felt like it.
    const forced = game?.threeRoomSystem?.streakBarricade();
    const direction = forced ? 'north' : this._rollDirection(room);
    if (!direction) return;

    const exit = room.exits?.[direction];
    if (!this._isBarricadeable(exit)) return;

    // The exit letter's colour picks the family; the family picks the
    // Barricade. A colour with no family (gray, blue) or an empty one (red)
    // falls back to the streak's material when the streak is what asked for
    // this Barricade, and otherwise raises nothing — so the Three Room
    // approach is gated identically no matter what colour its north came up.
    const descriptor = this._pickFromFamily(exit.color) || forced;
    if (!descriptor) return;

    this._raise(room, direction, descriptor);
  }

  // Nothing to barricade without a way out in that direction. Never the gray
  // zone's own '3' exit: that is the inevitable path, and it stays inevitable.
  // Never a secretBlueZone exit either — Tidefall's chain is a fixed tutorial
  // and has no business asking for a tool the tutorial hasn't handed out.
  _isBarricadeable(exit) {
    return !!exit?.letter && !exit.threeRoom && !exit.secretBlueZone;
  }

  // One roll for the room, then one of its eligible exits at random — so a room
  // never raises two, and which way is blocked is not something the player can
  // predict from the letter alone.
  _rollDirection(room) {
    const { game } = this;
    if ((game?.getCurrentZoneDepth?.() ?? 0) < ORGANIC_MIN_DEPTH) return null;
    if (Math.random() >= ORGANIC_CHANCE) return null;
    const open = BARRICADEABLE.filter(dir => this._isBarricadeable(room.exits?.[dir]));
    if (open.length === 0) return null;
    return open[Math.floor(Math.random() * open.length)];
  }

  _pickFromFamily(color) {
    const family = BARRICADE_FAMILIES[FAMILY_BY_COLOR[color]];
    if (!family?.length) return null;
    return family[Math.floor(Math.random() * family.length)];
  }

  // Stamp a descriptor across one exit lane and record it on the room. The whole
  // footprint is cleared, the notch included: the plug does not stand on the
  // letter's tile, but nothing generation scattered there gets to stand on it
  // either, so a barricaded lane always reads its letter.
  _raise(room, direction, descriptor) {
    const objects = [];
    for (const { col, row } of laneFootprint(direction, descriptor.deep, descriptor.spread)) {
      this._clearCell(room, col, row);
      if (isExitLetterTile(col, row)) continue;
      const obj = this._buildPlug(descriptor, col, row);
      room.backgroundObjects.push(obj);
      objects.push(obj);
    }
    room.barricade = {
      id: descriptor.id,
      shape: descriptor.shape,
      direction,
      objects,
      triggers: [],
      poles: [],
      // Only a 'circuit' Barricade uses this; declared here so every Barricade
      // record has the same shape whatever raised it.
      liveColor: descriptor.liveColor || null,
      cleared: false
    };
    if (descriptor.shape === 'trigger') this._placeTriggers(room, direction, descriptor);
    if (descriptor.shape === 'circuit') this._placePoles(room, direction, descriptor);
  }

  // The plug itself. A 'material' plug is ordinary breakable Background
  // Objects, so the tool that opens it is whatever InteractionSystem's smash
  // rules already say breaks that material, and breaking them IS the clearing.
  // A 'trigger' plug is a Barricade Wall tinted its family's colour — a solid
  // block, the same thing the room's perimeter is drawn as, because no tool
  // touches it and the room in front of it is where the answer is.
  _buildPlug(descriptor, col, row) {
    const cs = GRID.CELL_SIZE;
    // A 'hazard' plug does not block the lane at all — it is terrain laid
    // across it, and the cost of crossing is the damage. Nothing lifts it; the
    // answer is a state the player arrives already carrying.
    if (descriptor.shape === 'hazard') {
      const obj = BackgroundObject.createVariant(descriptor.typeId, col * cs, row * cs);
      obj.structural = true;
      return obj;
    }
    if (descriptor.shape === 'trigger' || descriptor.shape === 'circuit') {
      const obj = BackgroundObject.createVariant('barricade_wall', col * cs, row * cs);
      obj.color = descriptor.plugColor;
      obj.animationColor = descriptor.plugColor;
      obj.structural = true;
      return obj;
    }
    const obj = descriptor.typeId
      ? BackgroundObject.createVariant(descriptor.typeId, col * cs, row * cs)
      : new BackgroundObject(descriptor.char, col * cs, row * cs);
    // Part of a placed structure, not scatter — the same exemption the hut
    // walls and the Graveyard Divider carry, so roomFeatures' stray-object
    // sweep leaves it alone.
    obj.structural = true;
    return obj;
  }

  // Scatter a trigger Barricade's fixtures into the room in front of its plug.
  // A concealed fixture is not built yet — only its cover is, carrying the flag
  // that routes the uncovering back here (see revealTrigger).
  _placeTriggers(room, direction, descriptor) {
    const cs = GRID.CELL_SIZE;
    for (const spec of descriptor.triggers) {
      const { col, row } = laneCell(direction, spec.depth, spec.across);
      this._clearCell(room, col, row);
      if (spec.conceal === 'grass') {
        const cover = new BackgroundObject('|', col * cs, row * cs);
        cover.structural = true;
        cover.barricadeTrigger = spec;
        room.backgroundObjects.push(cover);
        continue;
      }
      this._buildTrigger(room, spec, col, row);
    }
  }

  // A trigger fixture, built to the same contract as a dungeon Puzzle Room's:
  // a switch is a puzzleSignal object (struck without being destroyed, pulsing
  // glitterHit) and carries `kind = 'switch'`, which is also what makes a
  // thrown boomerang chain between them; a panel is inert scenery that reads
  // occupancy. triggerMachine drives both from there.
  _buildTrigger(room, spec, col, row) {
    const cs = GRID.CELL_SIZE;
    const isSwitch = spec.kind === 'switch';
    const char = isSwitch ? '○' : '▭';
    const obj = new BackgroundObject(char, col * cs, row * cs);
    obj.color = '#888888';
    obj.animationChar = char;
    obj.animationColor = '#888888';
    if (isSwitch) {
      obj.puzzleSignal = true;
      obj.indestructible = false;
      obj.hp = 1;
      obj.maxHp = 1;
    }
    obj.structural = true;
    obj.kind = spec.kind;
    obj.activation = spec.activation;
    obj.neutralizeSeconds = spec.neutralizeSeconds;
    obj.active = false;
    obj._timer = 0;
    obj.pulseTimer = 0;
    room.backgroundObjects.push(obj);
    room.barricade.triggers.push(obj);
    return obj;
  }

  /**
   * Stand a circuit Barricade's two poles out past either edge of its plug, one
   * of them already live. Which one is live is recorded on the Barricade rather
   * than flagged on the object: the pole is ordinary scenery that a wire may
   * bite, and the circuit is the Barricade's business, not the pole's.
   */
  _placePoles(room, direction, descriptor) {
    const cs = GRID.CELL_SIZE;
    const barricade = room.barricade;
    for (let i = 0; i < descriptor.poles.length; i++) {
      const spec = descriptor.poles[i];
      const { col, row } = laneCell(direction, spec.depth, spec.across);
      this._clearCell(room, col, row);
      const pole = BackgroundObject.createVariant('electric_pole', col * cs, row * cs);
      pole.structural = true;
      if (i === 0) {
        pole.color = descriptor.liveColor;
        pole.animationColor = descriptor.liveColor;
      }
      room.backgroundObjects.push(pole);
      barricade.poles.push(pole);
    }
  }

  /**
   * Has a tripline been strung between this Barricade's two poles? Measured
   * geometrically rather than by asking the wire what it bit: an end anchored
   * onto a pole records that pole's exact centre, and an end thrown against one
   * comes to rest beside it, so one cell of tolerance accepts both ways of
   * placing a wire and the gate does not care which the player used.
   *
   * The wire's own type is deliberately not checked — any tripline conducts
   * here. What the gate asks for is a line between the two, not a current.
   */
  _circuitClosed(room, barricade) {
    const [a, b] = barricade.poles || [];
    if (!a || !b) return false;
    const reach = GRID.CELL_SIZE;
    const at = (x, y, pole) =>
      Math.hypot(x - (pole.position.x + GRID.CELL_SIZE / 2),
                 y - (pole.position.y + GRID.CELL_SIZE / 2)) <= reach;
    for (const seg of room.triplines || []) {
      const oneWay = at(seg.x1, seg.y1, a) && at(seg.x2, seg.y2, b);
      const other  = at(seg.x1, seg.y1, b) && at(seg.x2, seg.y2, a);
      if (oneWay || other) return true;
    }
    return false;
  }

  /**
   * A concealed fixture's cover has been removed — build the fixture in its
   * place. Called from InteractionSystem's grass-cut resolution, the same route
   * the χ grass reveal takes.
   */
  revealTrigger(cover) {
    const room = this.game?.currentRoom;
    if (!room?.barricade || room.barricade.cleared) return;
    const cs = GRID.CELL_SIZE;
    const col = Math.floor(cover.position.x / cs);
    const row = Math.floor(cover.position.y / cs);
    const obj = this._buildTrigger(room, cover.barricadeTrigger, col, row);
    obj.spawnImmunityTimer = 1.0;
    this.game.renderer?.markBackgroundDirty?.();
  }

  /**
   * Poll the current room's Barricade. Only a 'trigger' Barricade has anything
   * to poll — a material plug is answered by breaking it, which needs no ticker.
   *
   * rest-parity: absent because Barricades only exist across Explore-room exit
   * lanes; REST has no exits to gate.
   */
  update(deltaTime) {
    const room = this.game?.currentRoom;
    const barricade = room?.barricade;
    if (!barricade || barricade.cleared) return;
    if (barricade.shape === 'trigger') {
      if (tickTriggers(barricade.triggers, deltaTime, this.game.player, this.game.companion)) {
        this._lift(room, barricade);
      }
      return;
    }
    if (barricade.shape === 'circuit' && this._circuitClosed(room, barricade)) {
      // The dead pole comes up live as the current reaches it — the one beat of
      // feedback that says the wire, not the wall, was the thing that mattered.
      for (const pole of barricade.poles) {
        pole.color = barricade.liveColor;
        pole.animationColor = barricade.liveColor;
      }
      this._lift(room, barricade);
    }
  }

  // The plug gives way. Objects are spliced out in place rather than filtered
  // into a new array, for the same aliasing reason _clearCell is.
  _lift(room, barricade) {
    const { game } = this;
    const objs = room.backgroundObjects || [];
    for (const plug of barricade.objects) {
      const i = objs.indexOf(plug);
      if (i !== -1) objs.splice(i, 1);
      createBurstParticles(
        game, game.particles,
        plug.position.x + GRID.CELL_SIZE / 2,
        plug.position.y + GRID.CELL_SIZE / 2,
        4, plug.color
      );
    }
    barricade.cleared = true;
    game.audioSystem?.playSFX?.('barricade_lift');
    game.renderer?.markBackgroundDirty?.();
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

/**
 * The footprint: two cells deep into the room, three cells wide across the
 * lane, centred on the exit gap — minus the exit letter's own tile, which is
 * restricted and belongs to the letter (ExitSystem.isExitLetterTile). The
 * letter is the only thing the room says about where that way out leads, and a
 * Barricade that covered it would be refusing to answer a question it had also
 * hidden.
 *
 * Notching that one cell costs nothing, because the lane is sealed in front of
 * it and beside it: the depth-2 row closes the way in, and the depth-1
 * shoulders close the way around. What is left on the letter tile is a pocket
 * with no approach, so the letter stays readable and the exit stays shut.
 *
 * That argument only holds for a plug at least 2 deep — a 1-deep plug notched
 * this way is a doorway — so `deep` is floored at 2 rather than trusted. The
 * width matters for the same reason the depth does: plug materials tend to
 * carry narrow hitboxes (a round rock; a tree's trunk), so a lone cell would
 * leave room to slide past one and still read as standing in the gap (see
 * ExitSystem.isPressingIntoExitGap, which only asks that the player's box
 * overlap the lane at all).
 */
export function laneCells(direction, deep = 2, spread = 1) {
  return laneFootprint(direction, deep, spread)
    .filter(({ col, row }) => !isExitLetterTile(col, row));
}

/**
 * The same block before the notch is cut — every cell the Barricade claims,
 * whether or not it builds there. What the plug fills and what the plug clears
 * are different sets by exactly one tile, and _raise needs both.
 */
export function laneFootprint(direction, deep = 2, spread = 1) {
  const cells = [];
  const reach = Math.max(2, deep);
  for (let depth = 1; depth <= reach; depth++) {
    for (let across = -spread; across <= spread; across++) {
      cells.push(laneCell(direction, depth, across));
    }
  }
  return cells;
}

/**
 * One cell in an exit's own frame of reference, so a Barricade layout can be
 * authored once and raised across any exit. `depth` counts cells inward from
 * the wall the exit is in (1 = the row/column the exit letter sits on);
 * `across` counts sideways from the exit's own column/row, negative one way and
 * positive the other. Which real compass direction "positive across" points is
 * deliberately not fixed — a layout is a shape, and its mirror is the same ask.
 */
export function laneCell(direction, depth, across) {
  const centerX = Math.floor(GRID.COLS / 2);
  const centerY = Math.floor(GRID.ROWS / 2);
  switch (direction) {
    case 'north': return { col: centerX + across, row: depth };
    case 'south': return { col: centerX + across, row: GRID.ROWS - 1 - depth };
    case 'west':  return { col: depth,                row: centerY + across };
    case 'east':  return { col: GRID.COLS - 1 - depth, row: centerY + across };
    default:      return { col: centerX, row: depth };
  }
}
