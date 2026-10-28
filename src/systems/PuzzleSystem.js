import { GRID } from '../game/GameConfig.js';
import { BackgroundObject } from '../entities/BackgroundObject.js';
import { Enemy } from '../entities/Enemy.js';
import { Item } from '../entities/Item.js';
import { Particle } from '../entities/Particle.js';
import { getZoneRandomEnemy } from '../data/enemies.js';
import { PUZZLES, DORMANT_PUZZLE } from '../data/puzzles.js';
import { ZONE_COLORS } from '../data/zones.js';
import { applyEasing } from './AnimationSystem.js';
import { pushDirection } from './PushRock.js';
import { letterRefusesSide, mutateExitLetter, mutateExitColor } from './ExitSystem.js';
import { tagLootLayer } from './PlaneSystem.js';

const CS = GRID.CELL_SIZE;
const ARENA_RADIUS = 7;      // cells around room center kept clear of terrain

// The four sides of a Compass Rose ring, clockwise from north — the order a
// ring's tokens are listed in and a quarter turn steps through.
const SIDES = ['north', 'east', 'south', 'west'];

// Colors a color ring may carry besides gray: the four colored zones.
const RING_COLORS = [ZONE_COLORS.green, ZONE_COLORS.yellow, ZONE_COLORS.red, ZONE_COLORS.cyan];

// Letters a letter ring never borrows to fill an empty side: the ones bound to
// a direction (R, O), the ones the exit rules place on purpose (B, D, S), the
// red herring, and the room itself.
const RING_FILLER_EXCLUDED = new Set(['R', 'O', 'B', 'D', 'S', 'N', 'P']);

// What a Compass Rose stone is: solid, unbreakable, and nothing to harvest.
// Its own data rather than the '0' Rock's, so ninety-odd ring stones are not
// ninety-odd once-per-rock mineral pokes.
const COMPASS_STONE_DATA = {
  name: 'Compass Stone',
  solid: true,
  bulletInteraction: 'block',
  flammability: 'none',
  indestructible: true,
  interactions: { default: { animation: 'clang', message: null } }
};

/**
 * PuzzleSystem — P-room zone puzzles.
 *
 * Owns generation and per-frame logic for the per-zone puzzles defined in
 * data/puzzles.js. Green's is the Compass Rose, which grants the Compass.
 * Zones without a puzzle get a dormant stone circle + normal combat spawns.
 *
 * Puzzle state lives on room.puzzle; nothing persists across runs.
 */
export class PuzzleSystem {
  constructor(game) {
    this.game = game;
  }

  // ── Room generation ───────────────────────────────────────────────────────

  generatePuzzleRoom(room) {
    const gen = this.game.roomGenerator;
    gen.generateBackgroundObjects(room);
    // Zone terrain passes (yellow rivers especially) ignore the template
    // clearingZone — scrub the arena so the puzzle layout reads cleanly.
    const cfg = PUZZLES[room.zone];
    this._clearArena(room, cfg?.clearRadius);

    if (!cfg) {
      this._generateDormantCircle(room);
      this._spawnZoneEnemies(room, gen, 1 + Math.floor(Math.random() * 2));
      return;
    }

    // The Compass Rose spawns no enemies: its exits never close.
    if (cfg.type === 'compass_rose') this._generateCompassRose(room, cfg);
  }

  _clearArena(room, radius = ARENA_RADIUS) {
    const minC = 15 - radius, maxC = 15 + radius;
    const minR = 15 - radius, maxR = 15 + radius;
    room.backgroundObjects = room.backgroundObjects.filter(obj => {
      if (obj.structural) return true;
      const c = Math.round(obj.position.x / CS);
      const r = Math.round(obj.position.y / CS);
      return c < minC || c > maxC || r < minR || r > maxR;
    });
  }

  _placeStone(room, col, row, color, opts = {}) {
    const stone = new BackgroundObject('0', col * CS, row * CS);
    stone.color = color;
    stone.animationColor = color;
    stone.structural = true;
    stone.indestructible = true;
    if (opts.puzzleSignal) {
      // puzzleSignal contract (BackgroundObject.takeDamage): HP preserved,
      // glitterHit pulses true on every hit — same as the dungeon glitter.
      stone.puzzleSignal = true;
    }
    room.backgroundObjects.push(stone);
    return stone;
  }

  _ringPositions(cfg, count) {
    const positions = [];
    for (let i = 0; i < count; i++) {
      const angle = -Math.PI / 2 + (i * Math.PI * 2) / count;
      positions.push({
        col: Math.round(cfg.centerCol + Math.cos(angle) * cfg.ringRadius),
        row: Math.round(cfg.centerRow + Math.sin(angle) * cfg.ringRadius)
      });
    }
    return positions;
  }

  _generateDormantCircle(room) {
    const cfg = DORMANT_PUZZLE;
    for (const pos of this._ringPositions(cfg, 5)) {
      this._placeStone(room, pos.col, pos.row, cfg.stoneColor);
    }
  }

  // ── Green: the Compass Rose ───────────────────────────────────────────────
  //
  // A ring is a square of stones at `radius` cells from the center. Each stone
  // keeps a home index on the ring's perimeter (clockwise from the top-left
  // corner, 8 × radius cells around) and sits `rot` quarter turns clockwise
  // from it. A quarter turn slides every stone 2 × radius cells along the
  // perimeter — a conveyor around the square rather than a rigid spin, so a
  // turning ring never sweeps into the corridors between the rings.
  //
  // The four stones at the side midpoints are the ring's markers and carry its
  // tokens, one per home side [north, east, south, west]. Tokens for the
  // letter and color rings are read off the room's own exits the first frame
  // the player is in the room (_bindCompassTokens), after every entry-time
  // rewrite (the Compass's forced 'D') has landed.

  _generateCompassRose(room, cfg) {
    const rings = cfg.rings.map(def => {
      const perimeter = 8 * def.radius;
      const stones = [];
      const markers = [];
      for (let home = 0; home < perimeter; home++) {
        if (home === def.gapIndex) continue;
        const obj = this._placeCompassStone(room, cfg.stoneColor);
        stones.push({ obj, home });
        // Side midpoints: north at radius, then every 2 × radius clockwise.
        if (home % (2 * def.radius) === def.radius) markers[(home - def.radius) / (2 * def.radius)] = obj;
      }
      return {
        kind: def.kind,
        radius: def.radius,
        stones,
        markers,
        tokens: def.tokens ?? null,
        // Rolled unsolved, so every ring asks for at least one turn.
        rot: 1 + Math.floor(Math.random() * 3),
        turn: null,     // { from, dir, t } while a quarter turn plays
        hold: 0,        // seconds the current lean has been held
        holdSense: 0    // +1 clockwise / -1 counter-clockwise lean being held
      };
    });

    room.puzzle = {
      type: cfg.type,
      cfg,
      rings,
      tokensBound: false,
      solved: false
    };
    for (const ring of rings) this._placeRing(ring, cfg, ring.rot);
  }

  _placeCompassStone(room, color) {
    const stone = new BackgroundObject('0', 0, 0);
    stone.data = COMPASS_STONE_DATA;
    stone.color = color;
    stone.animationColor = color;
    stone.structural = true;
    stone.indestructible = true;
    room.backgroundObjects.push(stone);
    return stone;
  }

  // Cell offset from the ring's center for a (possibly fractional) perimeter
  // position, clockwise from the top-left corner.
  _perimeterOffset(radius, p) {
    const side = 2 * radius;
    const q = ((p % (4 * side)) + 4 * side) % (4 * side);
    if (q < side)     return { dx: -radius + q,              dy: -radius };
    if (q < 2 * side) return { dx: radius,                   dy: -radius + (q - side) };
    if (q < 3 * side) return { dx: radius - (q - 2 * side),  dy: radius };
    return               { dx: -radius,                  dy: radius - (q - 3 * side) };
  }

  // Put every stone of a ring `quarters` quarter turns clockwise of home.
  _placeRing(ring, cfg, quarters) {
    for (const { obj, home } of ring.stones) {
      const { dx, dy } = this._perimeterOffset(ring.radius, home + quarters * 2 * ring.radius);
      obj.position.x = (cfg.centerCol + dx) * CS;
      obj.position.y = (cfg.centerRow + dy) * CS;
    }
  }

  /**
   * Read the letter and color rings' tokens off the room's exits, home side
   * [north, east, south, west], so the solved Rose leaves the exits much as
   * they were rolled: S south (out of sight), gray north, the rolled east and
   * west letters and colors back on their own sides.
   */
  _bindCompassTokens(puzzle, room) {
    const exits = room.exits || {};
    const letterAt = side => exits[side]?.letter ?? null;
    const colorAt = side => exits[side]?.color ?? null;

    let letters = ['north', 'east', 'west'].map(letterAt);
    const used = new Set(letters.filter(Boolean));
    letters = letters.map(l => (!l || l === 'R' || l === 'S' || l === 'N') ? this._ringFillerLetter(room, used) : l);
    // The solved north reads R, so a letter the exit rules placed on purpose
    // (the forced 'B', a guaranteed 'D') moves off north. An Ocean owed east
    // stays put.
    const placed = l => l === 'B' || l === 'D';
    if (placed(letters[0])) {
      const swap = !placed(letters[2]) ? 2 : (!placed(letters[1]) && !exits.east?.oceanOwed ? 1 : -1);
      if (swap > 0) [letters[0], letters[swap]] = [letters[swap], letters[0]];
    }

    const usedColors = new Set([ZONE_COLORS.gray]);
    const zoneColor = ZONE_COLORS[room.zone] ?? ZONE_COLORS.green;
    const takeColor = (...prefs) => {
      const c = [...prefs, ...RING_COLORS].find(x => x && !usedColors.has(x));
      usedColors.add(c);
      return c;
    };
    const eastColor = takeColor(colorAt('east'), zoneColor);
    const westColor = takeColor(colorAt('west'), zoneColor);
    const southColor = takeColor(zoneColor);

    for (const ring of puzzle.rings) {
      if (ring.kind === 'letters') ring.tokens = [letters[0], letters[1], 'S', letters[2]];
      if (ring.kind === 'colors') ring.tokens = [ZONE_COLORS.gray, eastColor, southColor, westColor];
      ring.markers.forEach((marker, home) => {
        if (ring.kind === 'colors') {
          marker.color = marker.animationColor = ring.tokens[home];
        } else {
          marker.char = marker.animationChar = ring.tokens[home];
          marker.color = marker.animationColor = puzzle.cfg.markerColor;
        }
      });
    }
    puzzle.tokensBound = true;
    this._writeCompassExits(puzzle, room);
    this.game.renderer?.markBackgroundDirty?.();
  }

  // A letter for an empty letter-ring side, weighted the way this zone rolls
  // its exits, never one bound to a side or placed by an exit rule.
  _ringFillerLetter(room, used) {
    const weights = this.game.exitSystem?.getLetterWeightsForZone(room.zone, room.depth) ?? {};
    const pool = Object.entries(weights).filter(([l, w]) => w > 0 && !used.has(l) && !RING_FILLER_EXCLUDED.has(l));
    const total = pool.reduce((sum, [, w]) => sum + w, 0);
    let roll = Math.random() * total;
    let letter = pool.length ? pool[pool.length - 1][0] : 'X';
    for (const [l, w] of pool) {
      roll -= w;
      if (roll <= 0) { letter = l; break; }
    }
    used.add(letter);
    return letter;
  }

  // The token a ring shows on a side at its current rotation.
  _tokenOnSide(ring, sideIndex) {
    return ring.tokens[((sideIndex - ring.rot) % 4 + 4) % 4];
  }

  /**
   * Rewrite each visible exit from what the letter and color rings show on its
   * side. Gray makes a letter the Ridge on the north and the North (N) on the
   * east or west — R is never offered off north — but an S keeps its letter;
   * a letter that refuses its side (O on the west) reads N too.
   */
  _writeCompassExits(puzzle, room) {
    const letterRing = puzzle.rings.find(r => r.kind === 'letters');
    const colorRing = puzzle.rings.find(r => r.kind === 'colors');
    const exitSystem = this.game.exitSystem;
    SIDES.forEach((side, i) => {
      const exit = room.exits?.[side];
      if (!exit?.letter) return; // south is REST's boolean; a closed side stays closed
      let letter = this._tokenOnSide(letterRing, i);
      const color = this._tokenOnSide(colorRing, i);
      if (color === ZONE_COLORS.gray && letter !== 'S') {
        // The Ridge's own refusals (the Three Room approach, gate depths) hold here too.
        const ridgeOffered = side === 'north' && !exitSystem?._slotRefuses(0, 'R', room.depth, room.zone);
        letter = ridgeOffered ? 'R' : 'N';
      }
      if (letterRefusesSide(letter, side)) letter = 'N';
      mutateExitLetter(exit, letter, { source: 'compass_rose' });
      mutateExitColor(exit, color, { source: 'compass_rose' });
    });
  }

  _spawnZoneEnemies(room, gen, count) {
    for (let i = 0; i < count; i++) {
      const enemyChar = getZoneRandomEnemy(gen.currentDepth, room.zone);
      if (!enemyChar) continue;
      const pos = gen.getRandomPosition(room.collisionMap, room.enemies, room.playerStartPos, room.backgroundObjects);
      if (!pos) continue;
      const enemy = new Enemy(enemyChar, pos.x, pos.y, gen.currentDepth);
      enemy.setCollisionMap(room.collisionMap);
      enemy.setBackgroundObjects(room.backgroundObjects);
      gen.addEnemyToRoom(room, enemy);
    }
  }

  // ── Per-frame ─────────────────────────────────────────────────────────────

  update(deltaTime) {
    const room = this.game.currentRoom;
    const puzzle = room?.puzzle;
    if (!puzzle) return;

    if (puzzle.solved) return;

    if (puzzle.type === 'compass_rose') this._updateCompassRose(puzzle, room, deltaTime);
  }

  // ── Compass Rose per-frame ────────────────────────────────────────────────

  _updateCompassRose(puzzle, room, dt) {
    if (!puzzle.tokensBound) this._bindCompassTokens(puzzle, room);
    const cfg = puzzle.cfg;
    const player = this.game.player;

    for (const ring of puzzle.rings) {
      if (ring.turn) {
        this._advanceTurn(puzzle, ring, room, dt);
        continue;
      }
      const sense = this._leanSense(ring, cfg, player);
      if (!sense || sense !== ring.holdSense) {
        ring.hold = 0;
        ring.holdSense = sense;
        continue;
      }
      ring.hold += dt;
      if (ring.hold < cfg.pushHoldSeconds) continue;
      ring.hold = 0;
      ring.turn = { from: ring.rot, dir: sense, t: 0 };
    }
  }

  /**
   * Which way a lean on this ring turns it: the torque of the push about the
   * room's center. Leaning down on the right half of the top side turns the
   * ring clockwise, up on it counter-clockwise; a push straight at the center
   * (the side's middle stone, head on) turns nothing. +1 / -1 / 0.
   */
  _leanSense(ring, cfg, player) {
    for (const { obj } of ring.stones) {
      const dir = pushDirection(obj, player);
      if (!dir) continue;
      const dx = Math.round(obj.position.x / CS) - cfg.centerCol;
      const dy = Math.round(obj.position.y / CS) - cfg.centerRow;
      const torque = dx * dir.y - dy * dir.x;
      if (torque) return Math.sign(torque);
    }
    return 0;
  }

  _advanceTurn(puzzle, ring, room, dt) {
    const cfg = puzzle.cfg;
    const turn = ring.turn;
    turn.t = Math.min(1, turn.t + dt / cfg.turnSeconds);
    this._placeRing(ring, cfg, turn.from + turn.dir * applyEasing(turn.t, 'easeInOut'));
    this.game.renderer?.markBackgroundDirty?.();
    if (turn.t < 1) return;

    ring.turn = null;
    ring.rot = ((turn.from + turn.dir) % 4 + 4) % 4;
    this._placeRing(ring, cfg, ring.rot);
    // A player standing in the gap as the ring came round is put back outside it.
    this.game.physicsSystem?.resolveSolidObjectOverlap(this.game.player, this.game._activeBackgroundObjects());
    this._writeCompassExits(puzzle, room);
    this.game.audioSystem?.playSFX?.('puzzle_pulse');

    if (ring.rot === 0) {
      const north = ring.markers[0];
      this._burst(north.position.x, north.position.y, cfg.markerColor, 5);
    }
    if (puzzle.rings.every(r => r.rot === 0 && !r.turn)) this._solveCompassRose(puzzle);
  }

  // Every ring home: the rings stop, and the Compass lies at the center.
  _solveCompassRose(puzzle) {
    const cfg = puzzle.cfg;
    puzzle.solved = true;
    const x = cfg.centerCol * CS;
    const y = cfg.centerRow * CS;
    const compass = tagLootLayer(this.game, new Item(cfg.rewardChar, x, y));
    this.game.items.push(compass);
    this.game.physicsSystem.addEntity(compass);
    this._burst(x, y, cfg.markerColor, 14);
    this.game.audioSystem?.playSFX?.('puzzle_solve');
  }

  // ── Shared ────────────────────────────────────────────────────────────────

  _burst(x, y, color, count) {
    const particles = this.game.particles;
    if (!particles) return;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 20 + Math.random() * 30;
      particles.push(new Particle(
        x + CS / 2, y + CS / 2, '·', color,
        { vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 15 },
        0.5 + Math.random() * 0.3
      ));
    }
  }
}
