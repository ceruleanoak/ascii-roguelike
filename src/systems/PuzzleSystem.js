import { GRID } from '../game/GameConfig.js';
import { BackgroundObject } from '../entities/BackgroundObject.js';
import { Enemy } from '../entities/Enemy.js';
import { Particle } from '../entities/Particle.js';
import { PuzzleSpirit } from '../entities/PuzzleSpirit.js';
import { getZoneRandomEnemy } from '../data/enemies.js';
import { PUZZLES, DORMANT_PUZZLE } from '../data/puzzles.js';

const CS = GRID.CELL_SIZE;
const ARENA_RADIUS = 7;      // cells around room center kept clear of terrain
const STRIKE_DELAY = 1.2;    // ambient-strike telegraph time (warning circle)
const MOTE_EMIT_INTERVAL = 0.045;

/**
 * PuzzleSystem — P-room zone puzzles (Level-2 knowledge tier).
 *
 * Owns generation and per-frame logic for the per-zone puzzles defined in
 * data/puzzles.js. Solving a puzzle raises a PuzzleSpirit whose dialogue is a
 * lore hint (see each zone's `spirit.lines`).
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
    // clearingZone — scrub the arena so the puzzle layout reads cleanly and
    // the yellow pools stay electrically disconnected from any river.
    this._clearArena(room);

    const cfg = PUZZLES[room.zone];
    if (!cfg) {
      this._generateDormantCircle(room);
      this._spawnZoneEnemies(room, gen, 1 + Math.floor(Math.random() * 2));
      return;
    }

    if (cfg.type === 'listening_stones') {
      this._generateListeningStones(room, cfg);
    } else if (cfg.type === 'three_conductors') {
      this._generateThreeConductors(room, cfg);
    }
    this._spawnZoneEnemies(room, gen, 2);
  }

  _clearArena(room) {
    const minC = 15 - ARENA_RADIUS, maxC = 15 + ARENA_RADIUS;
    const minR = 15 - ARENA_RADIUS, maxR = 15 + ARENA_RADIUS;
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

  _generateListeningStones(room, cfg) {
    const stones = this._ringPositions(cfg, 5).map(pos =>
      this._placeStone(room, pos.col, pos.row, cfg.stoneColor, { puzzleSignal: true })
    );
    const boulder = this._placeStone(room, cfg.centerCol, cfg.centerRow, '#4a7a4a');

    // The firefly demonstrates this order on loop; distinct stones, rolled once.
    const order = [0, 1, 2, 3, 4].sort(() => Math.random() - 0.5);
    const sequence = order.slice(0, cfg.sequenceLength);

    room.puzzle = {
      type: cfg.type,
      cfg,
      stones,
      boulder,
      sequence,
      progress: 0,
      solved: false,
      spirit: null,
      demo: { phase: 'pause', step: 0, t: 0, emitT: 0 }
    };
  }

  _generateThreeConductors(room, cfg) {
    const conductors = cfg.conductors.map(def => {
      const pool = def.pool.map(cell => {
        const water = new BackgroundObject('~', cell.col * CS, cell.row * CS);
        water.structural = true;
        room.backgroundObjects.push(water);
        return water;
      });
      const rod = new BackgroundObject(cfg.rodChar, def.rod.col * CS, def.rod.row * CS);
      rod.color = cfg.rodColor;
      rod.animationColor = cfg.rodColor;
      rod.structural = true;
      rod.indestructible = true;
      room.backgroundObjects.push(rod);
      return { rod, pool, lit: 0 };
    });

    room.puzzle = {
      type: cfg.type,
      cfg,
      conductors,
      strikeTimer: this._rollStrikeInterval(cfg),
      solved: false,
      spirit: null
    };
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

    // Re-entry self-heal: neutralCharacters reset on every room swap, so a
    // solved room re-registers its spirit.
    if (puzzle.solved && puzzle.spirit && !this.game.neutralCharacters.includes(puzzle.spirit)) {
      this.game.neutralCharacters.push(puzzle.spirit);
    }
    if (puzzle.solved) return;

    if (puzzle.type === 'listening_stones') {
      this._updateListeningStones(puzzle, deltaTime);
    } else if (puzzle.type === 'three_conductors') {
      this._updateThreeConductors(puzzle, deltaTime);
    }
  }

  // ── Green: listening stones ───────────────────────────────────────────────

  _updateListeningStones(puzzle, dt) {
    this._updateFireflyDemo(puzzle, dt);

    // Poll player strikes (glitterHit pulses from the puzzleSignal contract)
    for (const stone of puzzle.stones) {
      if (!stone.glitterHit) continue;
      stone.glitterHit = false;
      const expected = puzzle.stones[puzzle.sequence[puzzle.progress]];
      if (stone === expected) {
        this._litStone(stone, puzzle.cfg);
        puzzle.progress++;
        this.game.audioSystem?.playSFX?.('puzzle_pulse');
        if (puzzle.progress >= puzzle.sequence.length) {
          this._solve(puzzle, puzzle.boulder.position.x, puzzle.boulder.position.y);
          return;
        }
      } else {
        this._fizzle(puzzle, stone);
      }
    }
  }

  _litStone(stone, cfg) {
    stone.color = cfg.stoneLitColor;
    stone.animationColor = cfg.stoneLitColor;
    this._burst(stone.position.x, stone.position.y, cfg.stoneLitColor, 5);
  }

  _fizzle(puzzle, struckStone) {
    const cfg = puzzle.cfg;
    for (const stone of puzzle.stones) {
      stone.color = cfg.stoneColor;
      stone.animationColor = cfg.stoneColor;
      stone.glitterHit = false;
    }
    puzzle.progress = 0;
    puzzle.demo.phase = 'pause';
    puzzle.demo.step = 0;
    puzzle.demo.t = 0;
    this._burst(struckStone.position.x, struckStone.position.y, '#888888', 6);
    this.game.audioSystem?.playSFX?.('puzzle_fizzle');
  }

  // Firefly mote: rests at the boulder, then visits the sequence stones in
  // order (pulsing each), forever — the room demonstrates itself.
  _updateFireflyDemo(puzzle, dt) {
    const demo = puzzle.demo;
    const cfg = puzzle.cfg;
    demo.t += dt;

    if (demo.phase === 'pause') {
      if (demo.t >= cfg.demoPauseSeconds) {
        demo.phase = 'travel';
        demo.step = 0;
        demo.t = 0;
      }
      return;
    }

    // travel: lerp boulder→stone[0]→stone[1]→…
    const from = demo.step === 0
      ? puzzle.boulder.position
      : puzzle.stones[puzzle.sequence[demo.step - 1]].position;
    const to = puzzle.stones[puzzle.sequence[demo.step]].position;
    const t = Math.min(demo.t / cfg.demoStepSeconds, 1);
    const x = from.x + (to.x - from.x) * t + CS / 2;
    const y = from.y + (to.y - from.y) * t + CS / 2;

    demo.emitT += dt;
    if (demo.emitT >= MOTE_EMIT_INTERVAL) {
      demo.emitT = 0;
      this.game.particles?.push(new Particle(
        x, y, '·', '#ccffcc',
        { vx: (Math.random() - 0.5) * 6, vy: -4 - Math.random() * 6 },
        0.35
      ));
    }

    if (t >= 1) {
      this._burst(to.x, to.y, '#ccffcc', 3);
      demo.step++;
      demo.t = 0;
      if (demo.step >= puzzle.sequence.length) {
        demo.phase = 'pause';
        demo.step = 0;
      }
    }
  }

  // ── Yellow: three conductors ──────────────────────────────────────────────

  _updateThreeConductors(puzzle, dt) {
    const cfg = puzzle.cfg;

    // Ambient storm: periodic telegraphed strike at a random pool — the room
    // demonstrates rod-latching without text.
    puzzle.strikeTimer -= dt;
    if (puzzle.strikeTimer <= 0) {
      puzzle.strikeTimer = this._rollStrikeInterval(cfg);
      const target = puzzle.conductors[Math.floor(Math.random() * puzzle.conductors.length)];
      const cx = target.pool.reduce((s, o) => s + o.position.x, 0) / target.pool.length + CS / 2;
      const cy = target.pool.reduce((s, o) => s + o.position.y, 0) / target.pool.length + CS / 2;
      this.game.lightningStrikeSystem?.scheduleStrike({
        x: cx, y: cy,
        radius: CS * 1.5,
        delay: STRIKE_DELAY
      });
    }

    // Rod latching: any electrified pool tile re-arms its rod for latchSeconds.
    let allLit = true;
    for (const cond of puzzle.conductors) {
      const charged = cond.pool.some(o => !o.destroyed && o.waterState === 'electrified');
      cond.lit = charged ? cfg.latchSeconds : Math.max(0, cond.lit - dt);
      const lit = cond.lit > 0;
      const color = lit ? cfg.rodLitColor : cfg.rodColor;
      cond.rod.color = color;
      cond.rod.animationColor = color;
      if (lit && Math.random() < dt * 6) {
        this._burst(cond.rod.position.x, cond.rod.position.y, cfg.rodLitColor, 1);
      }
      if (!lit) allLit = false;
    }

    if (allLit) {
      // Freeze the rods lit and raise the storm spirit at room center.
      for (const cond of puzzle.conductors) cond.lit = Infinity;
      this._solve(puzzle, 15 * CS, 15 * CS);
    }
  }

  _rollStrikeInterval(cfg) {
    return cfg.strikeMinInterval + Math.random() * (cfg.strikeMaxInterval - cfg.strikeMinInterval);
  }

  // ── Shared ────────────────────────────────────────────────────────────────

  _solve(puzzle, x, y) {
    puzzle.solved = true;
    const spirit = new PuzzleSpirit(x, y, puzzle.cfg.spirit);
    puzzle.spirit = spirit;
    this.game.neutralCharacters.push(spirit);
    this._burst(x, y, puzzle.cfg.spirit.color, 14);
    this.game.audioSystem?.playSFX?.('puzzle_solve');
  }

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
