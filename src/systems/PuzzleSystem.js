import { GRID } from '../game/GameConfig.js';
import { BackgroundObject } from '../entities/BackgroundObject.js';
import { Enemy } from '../entities/Enemy.js';
import { Item } from '../entities/Item.js';
import { Particle } from '../entities/Particle.js';
import { getZoneRandomEnemy } from '../data/enemies.js';
import { PUZZLES, DORMANT_PUZZLE } from '../data/puzzles.js';
import { applyEasing } from './AnimationSystem.js';
import { pushDirection } from './PushRock.js';
import { letterRefusesSide, mutateExitLetter } from './ExitSystem.js';
import { tagLootLayer } from './PlaneSystem.js';

const CS = GRID.CELL_SIZE;
const ARENA_RADIUS = 7;      // cells around room center kept clear of terrain

// The four sides of a Compass Rose ring, clockwise from north — the order a
// ring's tokens are listed in and a quarter turn steps through.
const SIDES = ['north', 'east', 'south', 'west'];
// Unit offsets of those sides from a ring's center, same order.
const CARDINAL_OFFSETS = [[0, -1], [1, 0], [0, 1], [-1, 0]];

// Letters the Rose never borrows to fill a side or a cycle: the ones bound to
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
  // A ring is a stone circle (or, innermost, a diamond) around the center
  // cell. Each stone keeps a home offset from the center and sits `rot`
  // quarter turns clockwise of it; a turn spins the whole ring rigidly about
  // the center. The player who leaned it walks the turn with it — carried
  // round at the same offset from the stone they pushed — so a turning ring
  // never sweeps into them, whether they lean from a corridor or from inside
  // its own gap.
  //
  // The four stones on the cardinals are the ring's markers, one per home
  // side [north, east, south, west]. Only the diamond's markers show their
  // tokens (its corners are the symbols); the letter and cycle rings are
  // plain stone, and what they hold shows on the room's exits alone. Their
  // tokens are read off those exits the first frame the player is in the
  // room (_bindCompassTokens), after every entry-time rewrite (the Compass's
  // forced 'D') has landed.

  _generateCompassRose(room, cfg) {
    const rings = cfg.rings.map(def => {
      const stones = [];
      const markers = [];
      for (const { dx, dy } of this._ringCells(def)) {
        if (dx === def.gap.dx && dy === def.gap.dy) continue;
        const obj = this._placeCompassStone(room, cfg.stoneColor);
        stones.push({ obj, dx, dy });
        const side = CARDINAL_OFFSETS.findIndex(([cx, cy]) => cx * def.radius === dx && cy * def.radius === dy);
        if (side >= 0) markers[side] = obj;
      }
      return {
        kind: def.kind,
        radius: def.radius,
        turnSeconds: def.turnSeconds,
        stones,
        markers,
        tokens: def.tokens ?? null,
        // Rolled unsolved, so every ring asks for at least one turn.
        rot: 1 + Math.floor(Math.random() * 3),
        turn: null,     // { from, dir, t, rider } while a quarter turn plays
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

  // A ring's cells as offsets from the center: a circle is every cell whose
  // distance rounds to the radius, a diamond every cell `radius` steps away.
  // Both are their own quarter turn, so a settled ring lands back on the grid.
  _ringCells(def) {
    const r = def.radius;
    const cells = [];
    for (let dy = -r - 1; dy <= r + 1; dy++) {
      for (let dx = -r - 1; dx <= r + 1; dx++) {
        const onRing = def.shape === 'diamond'
          ? Math.abs(dx) + Math.abs(dy) === r
          : Math.round(Math.hypot(dx, dy)) === r;
        if (onRing) cells.push({ dx, dy });
      }
    }
    return cells;
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

  // An offset turned `quarters` (possibly fractional) quarter turns clockwise.
  _rotateOffset(dx, dy, quarters) {
    const a = quarters * Math.PI / 2;
    return {
      x: dx * Math.cos(a) - dy * Math.sin(a),
      y: dx * Math.sin(a) + dy * Math.cos(a)
    };
  }

  // Put every stone of a ring `quarters` quarter turns clockwise of home. A
  // whole number of quarters is rounded, so a settled ring sits exactly on
  // its cells.
  _placeRing(ring, cfg, quarters) {
    const settled = Number.isInteger(quarters);
    for (const { obj, dx, dy } of ring.stones) {
      let { x, y } = this._rotateOffset(dx, dy, quarters);
      if (settled) { x = Math.round(x); y = Math.round(y); }
      obj.position.x = (cfg.centerCol + x) * CS;
      obj.position.y = (cfg.centerRow + y) * CS;
    }
  }

  /**
   * Read the letter ring's tokens off the room's exits, home side
   * [north, east, south, west], and give each non-S token its four-letter
   * cycle, which the cycle ring steps through. The solved Rose leaves the
   * exits much as they were rolled: S south (out of sight), R north, the
   * rolled east and west letters back on their own sides.
   */
  _bindCompassTokens(puzzle, room) {
    const exits = room.exits || {};
    const letterAt = side => exits[side]?.letter ?? null;

    let letters = ['north', 'east', 'west'].map(letterAt);
    const used = new Set(letters.filter(Boolean));
    // A side that held nothing, R, S, N, or a letter already met (each token
    // keys its own cycle) takes a filler.
    const seen = new Set();
    letters = letters.map(l => {
      const own = l && l !== 'R' && l !== 'S' && l !== 'N' && !seen.has(l) ? l : this._ringFillerLetter(room, used);
      seen.add(own);
      return own;
    });
    // The solved north reads R, so a letter the exit rules placed on purpose
    // (the forced 'B', a guaranteed 'D') moves off north. An Ocean owed east
    // stays put.
    const placed = l => l === 'B' || l === 'D';
    if (placed(letters[0])) {
      const swap = !placed(letters[2]) ? 2 : (!placed(letters[1]) && !exits.east?.oceanOwed ? 1 : -1);
      if (swap > 0) [letters[0], letters[swap]] = [letters[swap], letters[0]];
    }

    // Index 0 of each cycle is what that token shows with the cycle ring
    // solved. The token opposite S cycles R (its solve), its rolled letter,
    // N (North, the red herring: it never becomes R) and a filler; east's and
    // west's keep their rolled letter first, then three fillers. No letter
    // repeats across the three cycles. Where the Ridge refuses the north
    // (the Three Room approach, gate depths), the solve is the rolled letter.
    const filler = () => this._ringFillerLetter(room, used);
    const ridgeRefused = !!this.game.exitSystem?._slotRefuses(0, 'R', room.depth, room.zone);
    const cycles = {
      [letters[0]]: ridgeRefused ? [letters[0], filler(), 'N', filler()] : ['R', letters[0], 'N', filler()],
      [letters[1]]: [letters[1], filler(), filler(), filler()],
      [letters[2]]: [letters[2], filler(), filler(), filler()]
    };

    for (const ring of puzzle.rings) {
      if (ring.kind === 'letters') ring.tokens = [letters[0], letters[1], 'S', letters[2]];
      if (ring.kind === 'cycles') ring.cycles = cycles;
      // The letter and cycle rings stay plain stone: the exits show them.
      if (ring.kind !== 'symbols') continue;
      ring.markers.forEach((marker, home) => {
        marker.char = marker.animationChar = ring.tokens[home];
        marker.color = marker.animationColor = puzzle.cfg.markerColor;
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
   * Rewrite each visible exit's letter: the letter ring sets which token
   * faces its side, and the cycle ring's rotation picks which of that token's
   * four letters it shows. S has no cycle and always reads S. R is never
   * offered off north (nor where the Ridge's own refusals hold), and a letter
   * that refuses its side (O on the west) reads N. Exit colors are left as
   * rolled.
   */
  _writeCompassExits(puzzle, room) {
    const letterRing = puzzle.rings.find(r => r.kind === 'letters');
    const cycleRing = puzzle.rings.find(r => r.kind === 'cycles');
    const exitSystem = this.game.exitSystem;
    SIDES.forEach((side, i) => {
      const exit = room.exits?.[side];
      if (!exit?.letter) return; // south is REST's boolean; a closed side stays closed
      const token = this._tokenOnSide(letterRing, i);
      let letter = cycleRing.cycles[token]?.[cycleRing.rot] ?? token;
      if (letter === 'R') {
        const ridgeOffered = side === 'north' && !exitSystem?._slotRefuses(0, 'R', room.depth, room.zone);
        if (!ridgeOffered) letter = 'N';
      }
      if (letterRefusesSide(letter, side)) letter = 'N';
      mutateExitLetter(exit, letter, { source: 'compass_rose' });
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

    // One ring turns at a time: the player walking a turn leans on nothing else.
    const turning = puzzle.rings.find(r => r.turn);
    if (turning) {
      this._advanceTurn(puzzle, turning, room, dt);
      return;
    }

    for (const ring of puzzle.rings) {
      const sense = this._leanSense(ring, cfg, player);
      if (!sense || sense !== ring.holdSense) {
        ring.hold = 0;
        ring.holdSense = sense;
        continue;
      }
      ring.hold += dt;
      if (ring.hold < cfg.pushHoldSeconds) continue;
      ring.hold = 0;
      ring.turn = { from: ring.rot, dir: sense, t: 0, rider: this._riderOffset(cfg, player) };
      return;
    }
  }

  // The player's center as an offset from the Rose's center, in cells.
  _riderOffset(cfg, player) {
    return {
      dx: (player.position.x + (player.width || CS) / 2) / CS - (cfg.centerCol + 0.5),
      dy: (player.position.y + (player.height || CS) / 2) / CS - (cfg.centerRow + 0.5)
    };
  }

  // Carry the player round with the ring they leaned: their start offset,
  // turned as far as the ring has turned. Their own movement is overruled
  // until the turn settles.
  _carryRider(cfg, rider, quarters) {
    const player = this.game.player;
    const { x, y } = this._rotateOffset(rider.dx, rider.dy, quarters);
    player.position.x = (cfg.centerCol + 0.5 + x) * CS - (player.width || CS) / 2;
    player.position.y = (cfg.centerRow + 0.5 + y) * CS - (player.height || CS) / 2;
    player.velocity.vx = 0;
    player.velocity.vy = 0;
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
    turn.t = Math.min(1, turn.t + dt / ring.turnSeconds);
    const turned = turn.dir * applyEasing(turn.t, 'easeInOut');
    this._placeRing(ring, cfg, turn.from + turned);
    this._carryRider(cfg, turn.rider, turned);
    this.game.renderer?.markBackgroundDirty?.();
    if (turn.t < 1) return;

    ring.turn = null;
    ring.rot = ((turn.from + turn.dir) % 4 + 4) % 4;
    this._placeRing(ring, cfg, ring.rot);
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
    // Every stone, the diamond's symbols too, turns yellow: the solve has to
    // be seen across the whole room, not only at the Compass in the middle.
    for (const ring of puzzle.rings) {
      for (const { obj } of ring.stones) obj.color = obj.animationColor = cfg.solvedStoneColor;
    }
    this.game.renderer?.markBackgroundDirty?.();
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
