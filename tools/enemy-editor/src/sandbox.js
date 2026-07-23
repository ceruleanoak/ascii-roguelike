// Live behavioral sandbox. Instantiates the REAL Enemy class against a minimal
// game ctx + dummy player and steps its AI (enemy.update at ENEMY_TIMER_RATE)
// and PhysicsSystem exactly like the surface combat loop, then renders glyph,
// telegraphs, status blinks, and the attacks it emits. Errors during a frame
// are surfaced (not swallowed) so broken configs are diagnosable.
import { Enemy } from '../../../src/entities/Enemy.js';
import { PhysicsSystem } from '../../../src/systems/PhysicsSystem.js';
import { ENEMIES } from '../../../src/data/enemies.js';
import { GRID, PHYSICS } from '../../../src/game/GameConfig.js';
import { updateEnemyMeleeAttack, syncWindupVisual, attackHitsBox, telegraphRenderCells } from '../../../src/game/Telegraph.js';

const CELL = GRID.CELL_SIZE;
const FONT = "px 'Unifont', monospace";

export class Sandbox {
  constructor(canvas, onError) {
    this.canvas = canvas;
    this.ctx2d = canvas.getContext('2d');
    canvas.width = GRID.WIDTH;
    canvas.height = GRID.HEIGHT;
    this.physics = new PhysicsSystem();
    this.onError = onError;

    this.depth = 0;
    this.paused = false;
    this.mouseFollow = true;
    this.showRanges = true;
    this.keys = {};

    this.player = this.makePlayer();
    this.enemies = [];      // [main, ...spawned children]
    this.attacks = [];      // emitted attack/projectile visuals
    this.floaters = [];     // floating damage numbers
    // Walls give mouse-follow + pathfinding + line-of-sight something to work
    // against: duck behind one to break the enemy's sight and watch it fall
    // back on a memory mark. collisionMap[row][col] truthy = wall (read by both
    // PhysicsSystem and Enemy.hasLineOfSight).
    this.collisionMap = buildCollisionMap();
    this.bgObjects = [];

    this.game = {
      player: this.player,
      currentRoom: { exits: {}, type: 'EXPLORE', collisionMap: this.collisionMap, enemies: this.enemies },
      backgroundObjects: this.bgObjects,
      items: [],
      audioSystem: { playSFX() {} },
      enemySpawnSystem: { queueRequest: (spawner, req) => this.handleSpawnRequest(spawner, req) },
    };

    this.bindInput();
    this.last = performance.now();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  makePlayer() {
    return {
      position: { x: GRID.WIDTH / 2, y: GRID.HEIGHT / 2 },
      velocity: { vx: 0, vy: 0 },
      width: CELL, height: CELL,
      plane: 0, hidden: false, stealthBlessed: false, mossCloakActive: false,
      hp: 10, maxHp: 10, isStaffBlocking: false,
      takeDamage(amount) {
        this.hp = Math.max(0, this.hp - amount);
        return { actualDamage: amount, dodged: false, blocked: false };
      },
      get x() { return this.position.x; },
      get y() { return this.position.y; },
    };
  }

  // Build the main enemy from a def. Injects def into the live ENEMIES registry
  // under its char so Enemy's constructor (which reads ENEMIES[char] and inits
  // mechanics from this.data) picks it up. Preserves position/hp-fraction across
  // rebuilds so live number-tuning isn't jarring.
  loadDef(def) {
    if (!def || !def.char) return;
    const prev = this.enemies[0];
    const keepPos = prev ? { ...prev.position } : { x: GRID.WIDTH * 0.35, y: GRID.HEIGHT * 0.4 };
    const keepFrac = prev && prev.maxHp ? Math.min(1, prev.hp / prev.maxHp) : 1;

    ENEMIES[def.char] = def;
    let enemy;
    try {
      enemy = new Enemy(def.char, keepPos.x, keepPos.y, this.depth);
    } catch (e) {
      this.reportError('construct', e);
      return;
    }
    this.wireEnemy(enemy);
    enemy.hp = Math.max(1, Math.round(enemy.maxHp * keepFrac));

    this.enemies = [enemy];
    this.game.currentRoom.enemies = this.enemies;
    this.attacks = [];
    this.error = null;
  }

  wireEnemy(enemy) {
    enemy.setGame(this.game);
    enemy.setRoom(this.game.currentRoom);
    enemy.setCollisionMap(this.collisionMap);
    enemy.setBackgroundObjects(this.bgObjects);
    enemy.setSteamClouds([]);
    enemy.setTarget(this.player);
  }

  handleSpawnRequest(spawner, req) {
    const count = req.spawnCount || 1;
    for (let i = 0; i < count; i++) {
      const char = req.spawnChar;
      if (!char || !ENEMIES[char]) continue;
      const pos = req.spawnerPosition || spawner.position;
      let child;
      try {
        child = new Enemy(char, pos.x + (Math.random() - 0.5) * CELL * 2,
                                pos.y + (Math.random() - 0.5) * CELL * 2, this.depth);
      } catch { continue; }
      this.wireEnemy(child);
      if (req._splitChildLink && spawner.registerSplitChild) {
        spawner.registerSplitChild(child, req._splitChildLink);
      }
      this.enemies.push(child);
    }
  }

  respawn() {
    const main = this.enemies[0];
    if (main) {
      main.position = { x: GRID.WIDTH * 0.35, y: GRID.HEIGHT * 0.4 };
      main.velocity = { vx: 0, vy: 0 };
      main.hp = main.maxHp;
      main.state = 'idle';
    }
    this.enemies = main ? [main] : [];
    this.game.currentRoom.enemies = this.enemies;
    this.attacks = [];
    this.player.hp = this.player.maxHp;
  }

  bindInput() {
    window.addEventListener('keydown', (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
      this.keys[e.key.toLowerCase()] = true;
      if (e.key === ' ') { this.paused = !this.paused; e.preventDefault(); }
    });
    window.addEventListener('keyup', (e) => { this.keys[e.key.toLowerCase()] = false; });
    const toArena = (e) => {
      const r = this.canvas.getBoundingClientRect();
      return {
        x: (e.clientX - r.left) * (this.canvas.width / r.width),
        y: (e.clientY - r.top) * (this.canvas.height / r.height),
      };
    };
    this.canvas.addEventListener('mousemove', (e) => { this.mouse = toArena(e); });
    // Click drops a memory mark at the cursor (Shift = confirmed sighting).
    this.canvas.addEventListener('mousedown', (e) => {
      const p = toArena(e);
      this.setMemoryMark(p.x, p.y, e.shiftKey);
      e.preventDefault();
    });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // Replicates Enemy's "investigate a point" trigger (the suspected branch of
  // takeDamage): the enemy navigates to the mark with a '?' indicator. Gray '?'
  // = suspected (heard/felt); Shift-click = confirmed sighting (yellow '?').
  setMemoryMark(x, y, confirmed) {
    const e = this.enemies[0];
    if (!e) return;
    e.lastKnownPosition = { x, y };
    e.aggroMemoryActive = true;
    e.memoryMarkSuspected = !confirmed;
    e.memoryChaseTimer = 5.0;
    e.memoryMoveDelayTimer = 0;
    e.memoryMarkPlane = e.plane;
    e.memoryStaleTimer = 2.0;
    e.hadVisualContact = true;
    e.currentDirection = { x: 0, y: 0 };
    if (e.state === 'idle' || e.state === 'wander' || e.state === 'rest') e.state = 'chase';
  }

  cellBlocked(x, y) {
    const col = Math.floor(x / CELL), row = Math.floor(y / CELL);
    return !!(this.collisionMap[row] && this.collisionMap[row][col]);
  }

  updatePlayer(dt) {
    const p = this.player;
    if (this.mouseFollow && this.mouse) {
      const dx = this.mouse.x - p.position.x, dy = this.mouse.y - p.position.y;
      const d = Math.hypot(dx, dy) || 1;
      const sp = Math.min(d / dt, PHYSICS.PLAYER_SPEED);
      p.velocity.vx = (dx / d) * sp;
      p.velocity.vy = (dy / d) * sp;
    } else {
      let vx = 0, vy = 0;
      if (this.keys['a'] || this.keys['arrowleft']) vx -= 1;
      if (this.keys['d'] || this.keys['arrowright']) vx += 1;
      if (this.keys['w'] || this.keys['arrowup']) vy -= 1;
      if (this.keys['s'] || this.keys['arrowdown']) vy += 1;
      const m = Math.hypot(vx, vy) || 1;
      p.velocity.vx = (vx / m) * PHYSICS.PLAYER_SPEED * (m > 0 ? 1 : 0);
      p.velocity.vy = (vy / m) * PHYSICS.PLAYER_SPEED * (m > 0 ? 1 : 0);
      if (vx === 0 && vy === 0) { p.velocity.vx = 0; p.velocity.vy = 0; }
    }
    const nx = clamp(p.position.x + p.velocity.vx * dt, CELL / 2, GRID.WIDTH - CELL / 2);
    const ny = clamp(p.position.y + p.velocity.vy * dt, CELL / 2, GRID.HEIGHT - CELL / 2);
    // Per-axis wall collision so the player slides along walls (and can use them
    // to break the enemy's line of sight).
    if (!this.cellBlocked(nx, p.position.y)) p.position.x = nx;
    if (!this.cellBlocked(p.position.x, ny)) p.position.y = ny;
  }

  loop(now) {
    let dt = (now - this.last) / 1000;
    this.last = now;
    dt = clamp(dt, 0, 0.05);

    if (!this.paused) {
      try {
        this.updatePlayer(dt);
        this.step(dt);
      } catch (e) {
        this.reportError('frame', e);
      }
    }
    this.draw();
    requestAnimationFrame(this.loop);
  }

  step(dt) {
    const aiDt = dt * PHYSICS.ENEMY_TIMER_RATE;
    for (const enemy of [...this.enemies]) {
      enemy._frameUpdateResult = enemy.update(aiDt);
      this.physics.updateEntity(enemy, dt, this.bgObjects, this.game.currentRoom);
      this.handleEnemyAttacks(enemy);
      this.consumeUpdateResult(enemy);
    }
    // remove dead
    this.enemies = this.enemies.filter(e => e.hp > 0 || e === this.enemies[0]);
    this.game.currentRoom.enemies = this.enemies;
    this.stepAttacks(dt);
    this.stepFloaters(dt);
  }

  consumeUpdateResult(enemy) {
    const r = enemy._frameUpdateResult;
    enemy._frameUpdateResult = null;
    if (!r) return;
    if (r.dotDamage) for (const d of r.dotDamage) this.addFloater(d.damage, enemy.position, dotColor(d.effect));
    if (r.sapDamage) {
      const res = this.player.takeDamage(r.sapDamage.damage);
      this.addFloater(res.actualDamage, this.player.position, '#cc4444');
    }
  }

  // Enemy attack emission: the melee windup-visual lifecycle runs through the
  // shared Telegraph module (the same code CombatSystem steps — no mirrored
  // copy to drift), plus canAttack()->createAttack() for everything else.
  handleEnemyAttacks(enemy) {
    syncWindupVisual(enemy, this.attacks);

    if (enemy.canAttack && enemy.canAttack() && !enemy.windupAttackVisual) {
      const data = enemy.createAttack && enemy.createAttack();
      if (data) {
        for (const a of (Array.isArray(data) ? data : [data])) {
          if (a) { a._owner = enemy; a._life = a._life ?? 3; this.attacks.push(a); }
        }
      }
    }
  }

  stepAttacks(dt) {
    const p = this.player;
    const expired = new Set();
    for (const a of this.attacks) {
      if (a.type === 'enemy_melee') {
        // Shared Telegraph lifecycle: timers, windup blink, owner tracking,
        // pulse re-arming — same code the real combat loop runs.
        if (updateEnemyMeleeAttack(a, dt)) { expired.add(a); continue; }
      } else {
        if (a.velocity) {
          a.position.x += a.velocity.vx * dt;
          a.position.y += a.velocity.vy * dt;
        }
        if (a.duration !== undefined) a.duration -= dt;
        if (a.flashTimer !== undefined) a.flashTimer -= dt;
        a._life = (a._life ?? 3) - dt;
      }

      // contact damage to player (windup visuals don't bite)
      if (!a.hasHit && !a.windupPhase && a.damage) {
        const playerBox = { x: p.position.x - CELL / 2, y: p.position.y - CELL / 2, width: CELL, height: CELL };
        const legacyContact = () => {
          const dx = (a.position?.x ?? -999) - p.position.x;
          const dy = (a.position?.y ?? -999) - p.position.y;
          return Math.hypot(dx, dy) < CELL * 0.7;
        };
        if (attackHitsBox(a, playerBox, legacyContact)) {
          const res = p.takeDamage(a.damage);
          this.addFloater(res.actualDamage, p.position, '#cc4444');
          a.hasHit = true;
        }
        // Melee attacks get exactly one test frame per pulse (legacy contract).
        if (a.type === 'enemy_melee') a.hasHit = true;
      }
    }
    this.attacks = this.attacks.filter(a => {
      if (expired.has(a)) return false;
      if (a.type === 'enemy_melee') return true; // lifecycle handled above
      if (a.duration !== undefined && a.duration <= -0.2) return false;
      if (a._life <= 0) return false;
      const x = a.position?.x, y = a.position?.y;
      if (a.velocity && (x < -CELL || x > GRID.WIDTH + CELL || y < -CELL || y > GRID.HEIGHT + CELL)) return false;
      return true;
    });
    if (p.hp <= 0) { p.hp = p.maxHp; this.addFloater('reset', p.position, '#66ccff'); }
  }

  addFloater(text, pos, color) {
    this.floaters.push({ text: String(text), x: pos.x, y: pos.y, life: 0.8, color });
  }
  stepFloaters(dt) {
    for (const f of this.floaters) { f.life -= dt; f.y -= 20 * dt; }
    this.floaters = this.floaters.filter(f => f.life > 0);
  }

  // ── render ────────────────────────────────────────────────────────────────
  draw() {
    const c = this.ctx2d;
    c.fillStyle = '#05060a';
    c.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.drawGrid(c);
    this.drawWalls(c);
    this.drawMemoryMark(c);

    // attacks under entities
    for (const a of this.attacks) this.drawAttack(c, a);

    // player
    c.font = `${CELL}${FONT}`;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = '#00ffff';
    c.fillText('@', this.player.position.x, this.player.position.y);

    // enemies
    for (let i = 0; i < this.enemies.length; i++) this.drawEnemy(c, this.enemies[i], i === 0);

    // floaters
    c.font = `10px monospace`;
    for (const f of this.floaters) {
      c.globalAlpha = clamp(f.life / 0.8, 0, 1);
      c.fillStyle = f.color; c.fillText(f.text, f.x, f.y);
    }
    c.globalAlpha = 1;
  }

  drawGrid(c) {
    c.strokeStyle = '#10131c'; c.lineWidth = 1;
    for (let x = 0; x <= GRID.WIDTH; x += CELL) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, GRID.HEIGHT); c.stroke(); }
    for (let y = 0; y <= GRID.HEIGHT; y += CELL) { c.beginPath(); c.moveTo(0, y); c.lineTo(GRID.WIDTH, y); c.stroke(); }
  }

  drawWalls(c) {
    for (let r = 0; r < this.collisionMap.length; r++) {
      const row = this.collisionMap[r];
      for (let col = 0; col < row.length; col++) {
        if (!row[col]) continue;
        const x = col * CELL, y = r * CELL;
        c.fillStyle = '#2b3142';
        c.fillRect(x, y, CELL, CELL);
        c.fillStyle = '#3c455c';
        c.fillRect(x, y, CELL, 2);
      }
    }
  }

  drawMemoryMark(c) {
    const e = this.enemies[0];
    if (!e || !e.aggroMemoryActive || !e.lastKnownPosition) return;
    const { x, y } = e.lastKnownPosition;
    c.save();
    c.globalAlpha = 0.7;
    c.strokeStyle = e.memoryMarkSuspected ? '#aaaaaa' : '#ffff00';
    c.setLineDash([3, 3]); c.lineWidth = 1;
    c.beginPath(); c.arc(x, y, CELL * 0.6, 0, Math.PI * 2); c.stroke();
    c.setLineDash([]);
    c.font = `${Math.round(CELL * 0.7)}${FONT}`;
    c.fillStyle = c.strokeStyle;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('?', x, y);
    c.restore();
  }

  drawEnemy(c, enemy, isMain) {
    const x = enemy.position.x, y = enemy.position.y;

    if (this.showRanges && isMain) {
      this.drawRange(c, x, y, enemy.data?.aggroRange, '#2a3a2a');
      this.drawRange(c, x, y, enemy.data?.attackRange, '#4a2a2a');
    }

    let color = enemy.color || '#cccccc';
    try { color = enemy.getIframeFlashColor?.() ?? enemy.getDOTBlinkColor?.() ?? enemy.getNearDeathBlinkColor?.() ?? enemy.color; }
    catch { /* keep base */ }
    if (color == null) color = enemy.color || '#cccccc';

    let glyph = enemy.char;
    if (enemy.collapsed && enemy.data?.riseAgain) glyph = enemy.data.riseAgain.pileChar || glyph;
    if (enemy.inShellForm && enemy.data?.shellCamouflage) glyph = '0';
    if (enemy.data?.mimicMechanic?.enabled && !enemy.mimicRevealed && enemy.disguisedAs) glyph = enemy.disguisedAs;

    const size = enemy.char === 'M' ? CELL * 2.2 : CELL;
    c.font = `${size}${FONT}`;
    c.fillStyle = color;
    c.fillText(glyph, x, y);

    // HP bar
    if (enemy.maxHp > 1) {
      const w = CELL, frac = clamp(enemy.hp / enemy.maxHp, 0, 1);
      c.fillStyle = '#330000'; c.fillRect(x - w / 2, y - CELL, w, 2);
      c.fillStyle = '#cc3333'; c.fillRect(x - w / 2, y - CELL, w * frac, 2);
    }

    // telegraph / state indicators
    const indicators = [];
    for (const g of ['getWindupIndicator', 'getMemoryIndicator', 'getDetectionIndicator',
                     'getTrapLayerIndicator', 'getSpawnIndicator', 'getSappingIndicator', 'getBlindIndicator']) {
      try { const ind = enemy[g]?.(); if (ind && ind.char) indicators.push(ind); } catch { /* skip */ }
    }
    c.font = `${Math.round(CELL * 0.8)}${FONT}`;
    for (const ind of indicators) {
      c.fillStyle = ind.color || '#ffffff';
      c.fillText(ind.char, x + (ind.offsetX || 0), y + (ind.offsetY ?? -CELL));
    }

    if (isMain) {
      c.font = '9px monospace'; c.fillStyle = '#667';
      c.fillText(enemy.state || '', x, y + CELL);
    }
  }

  drawRange(c, x, y, r, color) {
    if (!r) return;
    c.strokeStyle = color; c.lineWidth = 1;
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.stroke();
  }

  drawAttack(c, a) {
    // Telegraph-shaped attacks draw their rasterized warn/hit cells — the
    // shared module resolves what to show so this matches ExploreRenderer.
    const shaped = telegraphRenderCells(a);
    if (shaped) {
      c.font = `${CELL}${FONT}`;
      c.fillStyle = shaped.color || '#ff5533';
      c.globalAlpha = shaped.alpha;
      for (const cell of shaped.cells) c.fillText(shaped.char, cell.x, cell.y);
      c.globalAlpha = 1;
      return;
    }

    const x = a.position?.x, y = a.position?.y;
    if (x == null) return;
    const glyph = a.char || (a.windupPhase ? '▒' : '█');
    c.font = `${CELL}${FONT}`;
    if (a.windupPhase) c.globalAlpha = 0.45;
    else if (a.flashWhite && a.flashTimer > 0) { c.fillStyle = '#ffffff'; }
    c.fillStyle = a.flashWhite && a.flashTimer > 0 ? '#ffffff' : (a.color || '#ff5533');
    c.fillText(glyph, x, y);
    c.globalAlpha = 1;
  }

  reportError(phase, e) {
    this.error = `${phase}: ${e.message}`;
    this.onError?.(this.error, e);
    console.error(`[sandbox:${phase}]`, e);
  }
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function dotColor(effect) { return { burn: '#ff4400', poison: '#88ff00', zap: '#00ffff' }[effect] || '#ffffff'; }

// Wall rects as [row0, col0, row1, col1] inclusive. Kept clear of the enemy
// start (~col10,row12) and the player start (col15,row15). Four corner pillars
// for cover + two central segments to break sight lines across the middle.
const WALL_RECTS = [
  [6, 6, 7, 7], [6, 22, 7, 23], [22, 6, 23, 7], [22, 22, 23, 23],
  [9, 12, 10, 18], [19, 12, 20, 18],
  [13, 3, 17, 4], [13, 25, 17, 26],
];

function buildCollisionMap() {
  const map = Array.from({ length: GRID.ROWS }, () => new Array(GRID.COLS).fill(0));
  for (const [r0, c0, r1, c1] of WALL_RECTS) {
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (r >= 0 && r < GRID.ROWS && c >= 0 && c < GRID.COLS) map[r][c] = 1;
      }
    }
  }
  return map;
}
