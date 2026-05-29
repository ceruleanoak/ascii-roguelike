import { GRID } from '../game/GameConfig.js';

const BOULDER_SPEED      = 60;   // px/s
const BOULDER_SPEED_LAVA = 40;   // px/s on lava
const BOULDER_DAMAGE     = 2;
const SPAWN_CHECK_INTERVAL = 2.0;
const WARNING_TIME       = 2.0;  // seconds of warning before first rock spawns
const ROCK_STAGGER       = 0.45; // seconds between each of the 3 rocks
const ROCK_CHARS         = ['O', 'o', '0', 'Q'];
const ROLL_ANIM_INTERVAL = 0.10;
const HIT_COOLDOWN       = 0.5;
const HIT_RADIUS         = GRID.CELL_SIZE * 0.85;

const DIRECTIONS = ['north', 'south', 'east', 'west'];

const DIR_VEC = {
  north: { dx: 0,  dy: -1 },
  south: { dx: 0,  dy: 1  },
  east:  { dx: 1,  dy: 0  },
  west:  { dx: -1, dy: 0  },
};

export class BoulderSystem {
  constructor(game) {
    this.game = game;
    this.rocks = [];        // active single-char rocks
    this.pending = [];      // { delay, lateral } rocks waiting to spawn
    this.warnings = [];     // edge arrow indicators
    this.spawnCheckTimer = 0;
    this.roomDirection = null;
    this._lastRoom = null;
  }

  update(deltaTime) {
    const game = this.game;
    if (!game.currentRoom || game.currentRoom.zone !== 'red') {
      this._reset();
      return;
    }

    if (game.currentRoom !== this._lastRoom) {
      this._lastRoom = game.currentRoom;
      this.roomDirection = DIRECTIONS[Math.floor(Math.random() * DIRECTIONS.length)];
      this.rocks = [];
      this.pending = [];
      this.warnings = [];
      this.spawnCheckTimer = 0;

    }

    // Periodic spawn roll
    this.spawnCheckTimer += deltaTime;
    if (this.spawnCheckTimer >= SPAWN_CHECK_INTERVAL) {
      this.spawnCheckTimer = 0;
      const depth = game.zoneDepths?.red || 0;
      const chance = Math.min(0.20, 0.02 + depth * 0.012);
      if (Math.random() < chance) this._scheduleWarning();
    }

    // Tick warnings
    for (let i = this.warnings.length - 1; i >= 0; i--) {
      this.warnings[i].timer -= deltaTime;
      if (this.warnings[i].timer <= 0) {
        this._queueRocks(this.warnings[i]);
        this.warnings.splice(i, 1);
      }
    }

    // Tick pending rocks → spawn when delay expires
    for (let i = this.pending.length - 1; i >= 0; i--) {
      this.pending[i].delay -= deltaTime;
      if (this.pending[i].delay <= 0) {
        this._spawnRock(this.pending[i]);
        this.pending.splice(i, 1);
      }
    }

    // Update active rocks
    const vec = DIR_VEC[this.roomDirection];
    const inHut = game.player.inHut;
    const inMaze = game.player.inMaze;

    for (let i = this.rocks.length - 1; i >= 0; i--) {
      const r = this.rocks[i];

      // Lava speed check
      const rCol = Math.floor(r.x / GRID.CELL_SIZE);
      const rRow = Math.floor(r.y / GRID.CELL_SIZE);
      let onLava = false;
      for (const obj of game.backgroundObjects) {
        if (obj.char !== '~' || !obj.damaging || !obj.damage) continue;
        if (Math.floor(obj.position.x / GRID.CELL_SIZE) === rCol &&
            Math.floor(obj.position.y / GRID.CELL_SIZE) === rRow) {
          onLava = true;
          break;
        }
      }

      r.x += vec.dx * (onLava ? BOULDER_SPEED_LAVA : BOULDER_SPEED) * deltaTime;
      r.y += vec.dy * (onLava ? BOULDER_SPEED_LAVA : BOULDER_SPEED) * deltaTime;

      r.animTimer += deltaTime;
      if (r.animTimer >= ROLL_ANIM_INTERVAL) {
        r.animTimer = 0;
        r.animFrame = (r.animFrame + 1) % ROCK_CHARS.length;
      }

      // Decay hit cooldowns
      for (const [entity, remaining] of r.hitCooldowns) {
        const next = remaining - deltaTime;
        if (next <= 0) r.hitCooldowns.delete(entity);
        else r.hitCooldowns.set(entity, next);
      }

      // Damage player
      if (!inHut && !inMaze && !r.hitCooldowns.has(game.player)) {
        const dx = (game.player.position.x + GRID.CELL_SIZE / 2) - r.x;
        const dy = (game.player.position.y + GRID.CELL_SIZE / 2) - r.y;
        if (dx * dx + dy * dy < HIT_RADIUS * HIT_RADIUS) {
          game.player.takeDamage(BOULDER_DAMAGE, { type: 'boulder' });
          r.hitCooldowns.set(game.player, HIT_COOLDOWN);
          // Knock player in the rock's travel direction
          game.physicsSystem.applyKnockbackDir(game.player, vec.dx, vec.dy, 250);
        }
      }

      // Damage enemies
      for (const enemy of game.currentRoom.enemies) {
        if (r.hitCooldowns.has(enemy)) continue;
        if (enemy.isBossEntity) continue;   // boss immune to own summoned boulders
        const dx = (enemy.position.x + GRID.CELL_SIZE / 2) - r.x;
        const dy = (enemy.position.y + GRID.CELL_SIZE / 2) - r.y;
        if (dx * dx + dy * dy < HIT_RADIUS * HIT_RADIUS) {
          enemy.takeDamage(BOULDER_DAMAGE, null);
          r.hitCooldowns.set(enemy, HIT_COOLDOWN);
        }
      }

      // Despawn at border
      if (r.x <= GRID.CELL_SIZE || r.x >= (GRID.COLS - 1) * GRID.CELL_SIZE ||
          r.y <= GRID.CELL_SIZE || r.y >= (GRID.ROWS - 1) * GRID.CELL_SIZE) {
        this.rocks.splice(i, 1);
      }
    }
  }

  getRenderData() {
    return { rocks: this.rocks, warnings: this.warnings };
  }

  _scheduleWarning() {
    const dir = this.roomDirection;
    const innerMinPx = 2 * GRID.CELL_SIZE;
    const innerMaxPx = (GRID.COLS - 3) * GRID.CELL_SIZE;
    const lateralPx = innerMinPx + Math.random() * (innerMaxPx - innerMinPx);
    this.warnings.push({ timer: WARNING_TIME, direction: dir, lateralPx });
  }

  _queueRocks(warning) {
    const innerMinPx = 2 * GRID.CELL_SIZE;
    const innerMaxPx = (GRID.COLS - 3) * GRID.CELL_SIZE;
    const spreadPx = 2 * GRID.CELL_SIZE; // ±2 cells in pixels
    for (let i = 0; i < 3; i++) {
      const offset = (Math.random() * 2 - 1) * spreadPx;
      const lateralPx = Math.max(innerMinPx, Math.min(innerMaxPx, warning.lateralPx + offset));
      this.pending.push({ delay: i * ROCK_STAGGER, lateralPx, direction: warning.direction });
    }
  }

  _spawnRock(pending) {
    const { lateralPx, direction } = pending;
    let x, y;
    if (direction === 'north') {
      x = lateralPx;
      y = GRID.CELL_SIZE + GRID.CELL_SIZE / 2;
    } else if (direction === 'south') {
      x = lateralPx;
      y = (GRID.ROWS - 2) * GRID.CELL_SIZE + GRID.CELL_SIZE / 2;
    } else if (direction === 'west') {
      x = GRID.CELL_SIZE + GRID.CELL_SIZE / 2;
      y = lateralPx;
    } else {
      x = (GRID.COLS - 2) * GRID.CELL_SIZE + GRID.CELL_SIZE / 2;
      y = lateralPx;
    }
    this.rocks.push({ x, y, direction, animFrame: 0, animTimer: 0, hitCooldowns: new Map() });

  }

  /**
   * Immediately schedule `count` boulder warnings from distinct random directions.
   * Used by BossSystem to create boss-summoned boulder rains.
   */
  triggerBoulderRain(count) {
    const dirs = ['north', 'south', 'east', 'west'].sort(() => Math.random() - 0.5);
    for (let i = 0; i < count && i < dirs.length; i++) {
      const innerMinPx = 2 * GRID.CELL_SIZE;
      const innerMaxPx = (GRID.COLS - 3) * GRID.CELL_SIZE;
      const lateralPx  = innerMinPx + Math.random() * (innerMaxPx - innerMinPx);
      this.warnings.push({ timer: WARNING_TIME, direction: dirs[i], lateralPx });
    }
  }

  _reset() {
    this.rocks = [];
    this.pending = [];
    this.warnings = [];
    this.spawnCheckTimer = 0;
    this._lastRoom = null;
    this.roomDirection = null;
  }
}
