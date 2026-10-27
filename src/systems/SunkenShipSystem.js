import { GRID, WATER_COLORS, BACKGROUND_OBJECT_VARIANTS } from '../game/GameConfig.js';
import { BackgroundObject } from '../entities/BackgroundObject.js';
import { flagSunkenGlints } from './SunkenGlintSystem.js';

/**
 * Sunken Ship — the neutral room behind the Pearl pedestal's east exit
 * (PearlSystem). A strip of beach on the west wall, then open sea: every cell
 * past the shallows is deep water, and the wreck lies listing in the middle
 * of it. Nothing in the room says what to do.
 *
 *   - The sea drowns the player on the ordinary wet-pip clock. The answer is
 *     the Flippers, found under the Push Rock every Ocean room keeps on its
 *     sand (PushRockSystem) — the room itself supplies nothing.
 *   - The hold is flooded a darker blue, and glints catch the light in it
 *     (SunkenGlintSystem). One of them, the Slow Glint, blinks five times less
 *     often than the rest. Finding it opens a secret south exit — no message,
 *     only the shockwave and the gap in the wall.
 *
 *   - The secret south leads down into the Sunken Hold, an Inner Room
 *     (NeutralRoomSystem.enterInnerRoom): the wreck's flooded underside, all
 *     deep water and pitch dark (`room.underwater` — torchLight), where SPACE
 *     only swings (`room.interactionsOff`). Only a Lantern lights it.
 *
 * The room is rebuilt from scratch on every entry (NeutralRoomSystem), so
 * what the player has done here lives in the run-scoped `game.sunkenShip`
 * (Reset Registry) and build() replays it: glints spent, south open.
 */

// The wreck's brown (BACKGROUND_OBJECT_VARIANTS.ship_hull) — the south
// exit's shockwave is the ship giving way, so it ripples in the same color.
const SHIP_COLOR = '#7a4a22';
// Deep water inside the hull — darker than the open sea's WATER_COLORS.deep,
// so the hold reads as the inside of something.
const HOLD_WATER_COLOR = '#050d33';
const SEA_BORDER_COLOR = '#1d3f6e';

// Beach: cols 1..BEACH_END_COL are sand, the next column is shallow water,
// and everything east of that is deep.
const BEACH_END_COL = 4;
const SHALLOW_COL = BEACH_END_COL + 1;

// The hull runs stern (west) to bow (east). It lists to port: the deck steps
// down one row every five cells toward the stern, and the keel follows it.
const STERN_COL = 8;
const BOW_COL = 26;
const deckRow = (col) => 9 + Math.floor((BOW_COL - col) / 5);
const keelRow = (col) => 17 + Math.floor((BOW_COL - 1 - col) / 5);

// Where the deck caved in — the way into the hold.
const BREACH_COLS = new Set([13, 14]);
// The broken mast stands off the deck amidships; its spar fell across the bow.
const MAST_COL = 20;
const MAST_TOP_ROW = 6;
const SPAR_CELLS = [{ col: 22, row: 8 }, { col: 23, row: 7 }];
// One porthole in each end wall.
const PORTHOLES = new Set(['8,15', '26,12']);

// The seabed around the wreck: seaweed strands rooted on the bottom (each
// grows `height` cells up from its root, its glyph swinging } { } as it
// rises) and planks the wreck shed. Fixed, like the hull, so the room looks
// the same every visit. All open sea — none in the hold, where the glints
// have to read on bare water, and none in the lane to the secret south.
const SEAWEED_STRANDS = [
  { col: 11, row: 5, height: 3 }, { col: 24, row: 4, height: 2 }, { col: 27, row: 3, height: 2 },
  { col: 6, row: 9, height: 2 },
  { col: 13, row: 21, height: 2 }, { col: 19, row: 23, height: 3 }, { col: 24, row: 22, height: 3 },
  { col: 10, row: 25, height: 3 }, { col: 7, row: 27, height: 2 }, { col: 12, row: 28, height: 2 },
  { col: 18, row: 28, height: 2 }, { col: 21, row: 27, height: 2 }, { col: 27, row: 25, height: 3 }
];
const SEAWEED_GLYPHS = ['}', '{'];
// Two greens, alternating strand by strand, so the bed isn't one flat color.
const SEAWEED_COLORS = ['#2e8b57', '#1f6b44'];
const LOOSE_PLANKS = [
  { col: 9, row: 10 }, { col: 16, row: 21 }, { col: 22, row: 19 },
  { col: 6, row: 18 }, { col: 25, row: 28 }, { col: 23, row: 25 }
];

// Glints seeded in the hold; one of them is the Slow Glint, whose blink is
// drawn on a cycle five times as long (SparkleEffects.SLOW_GLINT_CYCLE).
const GLINT_COUNT = 7;

/** The run's record of the Sunken Ship — the Reset Registry's `sunkenShip`. */
export function freshSunkenShipState() {
  return {
    glintCells: null,       // [{ col, row, slow, contents }] — seeded on the first visit
    glintsSpent: [],        // 'col,row' keys of discovered glints
    southOpen: false,
    serpentsSlain: false,   // set by the Sunken Hold's Sea Serpent fight
    moonPearlTaken: false   // the pair's reward, once it is off the floor
  };
}

const cellKey = (col, row) => `${col},${row}`;

export class SunkenShipSystem {
  constructor(game) {
    this.game = game;
  }

  /**
   * The Sunken Ship script's onGenerate. Lays out the beach, the sea and the
   * wreck, then replays the run's record onto the fresh room.
   */
  build(room) {
    const state = this.game.sunkenShip;
    const cs = GRID.CELL_SIZE;
    room.isSunkenShip = true;
    room.borderColor = SEA_BORDER_COLOR;

    const hull = this._hullCells();
    const holdTiles = [];
    const seaTiles = new Map(); // open-sea water by cell key, for the seabed

    for (let row = 1; row < GRID.ROWS - 1; row++) {
      for (let col = 1; col < GRID.COLS - 1; col++) {
        const x = col * cs, y = row * cs;
        const key = cellKey(col, row);
        if (hull.walls.has(key)) {
          const plank = new BackgroundObject(hull.walls.get(key), x, y, { typeId: 'ship_hull' });
          plank.structural = true;
          plank.hasCollision = true;
          room.backgroundObjects.push(plank);
          room.collisionMap[row][col] = 1;
        } else if (col <= BEACH_END_COL) {
          room.backgroundObjects.push(new BackgroundObject('.', x, y));
        } else {
          const deep = col > SHALLOW_COL;
          const water = new BackgroundObject('~', x, y, { deepWater: deep });
          if (hull.hold.has(key)) {
            water.color = HOLD_WATER_COLOR;
            holdTiles.push(water);
          } else if (deep) {
            water.color = WATER_COLORS.deep;
            seaTiles.set(key, water);
          }
          room.backgroundObjects.push(water);
        }
      }
    }

    this._placeSeabed(room, seaTiles);
    this._placeGlints(room, state, holdTiles);
    if (state.southOpen) this._southExit(room);
  }

  /**
   * The Sunken Hold script's onGenerate: the flooded underside of the wreck.
   * Every cell is deep water in the hold's own dark blue, and nothing in it
   * can be interacted with — the dark is the room.
   */
  buildHold(room) {
    const cs = GRID.CELL_SIZE;
    room.isSunkenHold = true;
    room.underwater = true;
    room.interactionsOff = true;
    room.borderColor = SHIP_COLOR;

    for (let row = 1; row < GRID.ROWS - 1; row++) {
      for (let col = 1; col < GRID.COLS - 1; col++) {
        const water = new BackgroundObject('~', col * cs, row * cs, { deepWater: true });
        water.color = HOLD_WATER_COLOR;
        room.backgroundObjects.push(water);
      }
    }

    // Its guardians — or, once they're dead, the Moon Pearl they left.
    this.game.seaSerpentSystem.spawnPair(room);
  }

  /**
   * Per-frame tick while the Sunken Ship is the current room: glints being
   * found.
   */
  update(deltaTime) {
    const game = this.game;
    const room = game.currentRoom;
    if (!room?.isSunkenShip) return;
    const state = game.sunkenShip;

    for (const glint of room.sunkenShipGlints) {
      if (glint.tile.sunkenGlint || state.glintsSpent.includes(glint.key)) continue;
      state.glintsSpent.push(glint.key);
      if (glint.slow) this._openSouth(room, state);
    }
  }

  // Every wall cell of the wreck (key → glyph), and the hold cells inside it.
  _hullCells() {
    const walls = new Map();
    const hold = new Set();

    for (let col = STERN_COL; col <= BOW_COL; col++) {
      const deck = deckRow(col);
      if (!BREACH_COLS.has(col)) walls.set(cellKey(col, deck), '=');

      if (col === STERN_COL || col === BOW_COL) {
        // End walls run from under the deck to the keel's corner.
        const inner = col === STERN_COL ? col + 1 : col - 1;
        const bottom = keelRow(inner);
        for (let row = deck + 1; row < bottom; row++) {
          const key = cellKey(col, row);
          walls.set(key, PORTHOLES.has(key) ? 'o' : (col === STERN_COL ? '(' : ')'));
        }
        walls.set(cellKey(col, bottom), col === STERN_COL ? '\\' : '/');
        continue;
      }

      const keel = keelRow(col);
      walls.set(cellKey(col, keel), '_');
      for (let row = deck + 1; row < keel; row++) hold.add(cellKey(col, row));
    }

    for (let row = MAST_TOP_ROW; row < deckRow(MAST_COL); row++) {
      walls.set(cellKey(MAST_COL, row), '|');
    }
    for (const { col, row } of SPAR_CELLS) walls.set(cellKey(col, row), '/');

    return { walls, hold };
  }

  // Seaweed and loose planks over the open sea. Each stands on top of its
  // water tile rather than replacing it: the tile still wets and drowns, and
  // only gives up its glyph (`coveredBy`).
  _placeSeabed(room, seaTiles) {
    const cs = GRID.CELL_SIZE;
    const cover = (col, row, typeId, glyph, color) => {
      const water = seaTiles.get(cellKey(col, row));
      if (!water) return;
      const piece = new BackgroundObject(glyph, col * cs, row * cs, { typeId });
      if (color) piece.color = color;
      water.coveredBy = piece;
      room.backgroundObjects.push(piece);
    };

    SEAWEED_STRANDS.forEach(({ col, row, height }, strand) => {
      const color = SEAWEED_COLORS[strand % SEAWEED_COLORS.length];
      for (let i = 0; i < height; i++) {
        cover(col, row - i, 'seaweed', SEAWEED_GLYPHS[i % SEAWEED_GLYPHS.length], color);
      }
    });
    for (const { col, row } of LOOSE_PLANKS) {
      cover(col, row, 'loose_plank', BACKGROUND_OBJECT_VARIANTS.loose_plank.char, null);
    }
  }

  // The hold's glints sit in the same cells for the whole run; spent ones
  // stay spent.
  _placeGlints(room, state, holdTiles) {
    const cs = GRID.CELL_SIZE;
    if (!state.glintCells) {
      const tiles = flagSunkenGlints(holdTiles, GLINT_COUNT);
      const slowIndex = Math.floor(Math.random() * tiles.length);
      state.glintCells = tiles.map((tile, i) => ({
        col: Math.round(tile.position.x / cs),
        row: Math.round(tile.position.y / cs),
        slow: i === slowIndex,
        contents: i === slowIndex ? null : tile.sunkenContents
      }));
    }

    const byKey = new Map(holdTiles.map(tile =>
      [cellKey(Math.round(tile.position.x / cs), Math.round(tile.position.y / cs)), tile]));
    room.sunkenShipGlints = [];
    for (const { col, row, slow, contents } of state.glintCells) {
      const key = cellKey(col, row);
      const tile = byKey.get(key);
      if (!tile) continue;
      tile.sunkenGlint = !state.glintsSpent.includes(key);
      tile.slowGlint = slow;
      tile.sunkenContents = contents;
      room.sunkenShipGlints.push({ tile, key, slow });
    }
  }

  // The open south wall, and the Sunken Hold it leads down into.
  _southExit(room) {
    room.exits.south = true;
    room.innerExits = { south: 'sunkenHold' };
  }

  // The secret south: no words, just the wall giving way.
  _openSouth(room, state) {
    const game = this.game;
    const cs = GRID.CELL_SIZE;
    state.southOpen = true;
    this._southExit(room);
    game.updateExitCollisions();
    game.renderer.markBackgroundDirty();
    game.playerShockwave = {
      x: Math.floor(GRID.COLS / 2) * cs + cs / 2,
      y: (GRID.ROWS - 2) * cs + cs / 2,
      radius: 0, prevRadius: 0,
      maxRadius: cs * 6,
      speed: cs * 10,
      color: SHIP_COLOR,
      knockback: 0, // a reveal ripple, not a blow
    };
  }
}
