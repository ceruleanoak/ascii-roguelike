import { GRID } from '../game/GameConfig.js';
import { ENEMIES } from '../data/enemies.js';
import { Enemy } from '../entities/Enemy.js';

/**
 * DeathFightSystem — the Death Fight: what happens behind the Three Room's
 * north door once Death is walking.
 *
 * It is less a battle than a recruitment. Death is the THREE's own figure,
 * and its voice is the THREE's voice; the fight is the invitation to take
 * the Cursed Run. Only an uncursed run reaches it — the door opens on three
 * correctly placed offerings and nothing else, and a crack is the curse — so
 * the fight's CONSUME is always the moment the curse lands.
 *
 * Death Fight Phases, in order:
 *   hunt        — the chase as it always was. One talk word stops Death to
 *                 ask DO YOU FEAR US? (once per fight). After HUNT_SECONDS:
 *                 FIGHT, and the Library Queue starts.
 *   weak        — weak-tier enemies, one at a time, each spawned as the last
 *                 is defeated. Death keeps hunting. On the second spawn it
 *                 says CONSUME (once per run). A bare CONSUME — no true name —
 *                 takes the enemy in front of the player for free, curses the
 *                 run, and Death says the name and GOOD; it then stands and
 *                 watches (Watch) until the weak are gone.
 *   forever     — LIVE FOREVER: the chase again, slower. Normal tier.
 *   horde       — every weak and normal entry again, all at once. Death says
 *                 PURGE! when a wish is left to spend; PURGE then works here,
 *                 with no wish question — the slot it costs is the lesson.
 *   dash        — elite, then boss. Death hovers, a shadow slides along the
 *                 line it is about to take, and it crosses the room on it.
 *   fulfillment — the queue is spent: FULFILLMENT NEARS, SEEK THE CROWN, and
 *                 Death comes for the player fast enough that it arrives.
 *
 * Enemies and Death never touch each other: Death has no collision and
 * enemies target only the player. Every fight spawn rises next to a border
 * wall.
 *
 * Owns Death's movement in every phase. ThreeRoomSystem keeps the cinematic
 * before the fight and Death's killing touch.
 */

const CS = GRID.CELL_SIZE;

// ── Hunt (the chase the room always had) ────────────────────────────────────
// It starts from a standstill and keeps gaining speed until it outruns the
// player's walk (180) — the room is sealed, so running only buys time.
// Striking it is the one answer: it takes no damage, but the blow throws it
// back and its speed starts over from nothing.
const HUNT_ACCEL = 45;          // px/s² gained while it comes
const HUNT_MAX_SPEED = 200;     // px/s ceiling
const KNOCKBACK_SPEED = 260;
const KNOCKBACK_TIME = 0.35;    // seconds thrown back before it comes again
const KNOCKBACK_DECAY = 6;      // knockback velocity bleed-off per second
// Seconds of the plain hunt before the first enemy.
const HUNT_SECONDS = 15;
// Seconds Death stands still for DO YOU FEAR US?.
const TALK_PAUSE_SECONDS = 1.5;

// ── Live Forever ────────────────────────────────────────────────────────────
// Slower than the player's walk: after the recruitment, the hunt is a reminder.
const FOREVER_MAX_SPEED = 120;

// ── Dash ────────────────────────────────────────────────────────────────────
const DASH_FIRST_HOVER = 3;     // seconds it hovers before the first dash
const DASH_INTERVAL = 5;        // seconds from one dash's start to the next
// The shadow's run along the line, ahead of Death — the visible tell
// (reaction-window baseline: ~0.7s seen before the blow).
const DASH_TELEGRAPH = 0.7;
const DASH_SPEED = 900;         // px/s across the room
// Bob while hovering, in px — it is held up, not standing.
const HOVER_BOB = 3;
const HOVER_BOB_RATE = 3;

// ── Fulfillment ─────────────────────────────────────────────────────────────
const FULFILLMENT_ACCEL = 900;
const FULFILLMENT_MAX_SPEED = 900;

// ── Spawns ──────────────────────────────────────────────────────────────────
// Seconds between one enemy's defeat and the next one's arrival.
const NEXT_SPAWN_DELAY = 0.6;
// Spawn iframes, so a swing already in the air doesn't greet the arrival.
const SPAWN_IFRAMES = 0.5;
// A spawn keeps this far from the player.
const SPAWN_MIN_PLAYER_DIST = CS * 4;
// Library Queue order: one tier at a time.
const TIER_ORDER = ['weak', 'normal', 'elite', 'boss'];

// Talk words answered with the fear question during the hunt.
const TALK_WORDS = new Set(['TALK', 'SPEAK', 'HELLO', 'GREET']);

// The THREE's lines take this long to dissolve in, hold and go (RenderController
// .renderSpellResponse: 120ms a character, 2.2s held, ~0.25s of dissolves);
// a line that follows another waits for it.
const LINE_CHAR_SECONDS = 0.12;
const LINE_HOLD_SECONDS = 2.6;
function lineSeconds(text) { return text.length * LINE_CHAR_SECONDS + LINE_HOLD_SECONDS; }
// Death stands for both closing lines before it comes.
const FULFILLMENT_WORDS_SECONDS = lineSeconds('FULFILLMENT NEARS') + lineSeconds('SEEK THE CROWN');

/**
 * The Library Queue: every enemy that can be fought, weak → normal → elite →
 * boss, registry order inside a tier. Left out: enemies with no true name
 * (nothing for Death to speak), pacifists and the Training Dummy (nothing to
 * defeat), and water-bound enemies (nothing to stand in here).
 * @returns {{char: string, tier: string}[]}
 */
export function buildLibraryQueue() {
  const entries = Object.entries(ENEMIES).filter(([, d]) =>
    d.trueName && TIER_ORDER.includes(d.tier) && !d.pacifist && !d.isDummy && !d.waterBound);
  const queue = [];
  for (const tier of TIER_ORDER) {
    for (const [char, d] of entries) if (d.tier === tier) queue.push({ char, tier });
  }
  return queue;
}

export class DeathFightSystem {
  constructor(game) {
    this.game = game;
    this.reset();
  }

  /** Room-scoped (Reset Registry, and every way out of the Three Room). */
  reset() {
    // Null until the cinematic hands Death over; then the fight's whole state.
    this.fight = null;
  }

  /** True while the Death Fight runs. */
  isActive() {
    return !!this.fight;
  }

  /** The cinematic is over and Death walks: the fight begins in the hunt. */
  _begin() {
    this.fight = {
      phase: 'hunt',
      elapsed: 0,            // seconds in the current phase
      queue: buildLibraryQueue(),
      spawnCount: 0,         // single spawns so far
      current: null,         // the enemy being fought (single spawns)
      horde: [],             // the horde, while it stands
      nextSpawnIn: 0,        // seconds until the next single spawn, when > 0
      pause: 0,              // seconds Death stands still (talk, watch has its own flag)
      talked: false,         // DO YOU FEAR US? asked this fight
      watching: false,       // a free CONSUME was taken in the weak phase
      consumed: false,       // the player has CONSUMEd during this fight
      purgeSpoken: false,    // PURGE! said in the horde
      lines: [],             // the THREE's lines waiting their turn: { text, in }
      lastLine: '',          // the line said most recently, to time the next one
      dash: null,            // { stage, t, from, to, shadow } in the dash phase
    };
  }

  // ── Per frame ───────────────────────────────────────────────────────────────

  /**
   * Called by ThreeRoomSystem once Death walks. Advances the phase, spawns,
   * speaks, and moves Death.
   */
  update(dt, death) {
    const game = this.game;
    const p = game.player;
    if (!p || !death) return;
    if (!this.fight) this._begin();
    const f = this.fight;
    f.elapsed += dt;

    this._tickLines(dt);

    switch (f.phase) {
      case 'hunt':
        if (f.elapsed >= HUNT_SECONDS) {
          this._say('FIGHT');
          this._enter('weak');
          this._spawnNext();
        }
        break;
      case 'weak':
      case 'forever':
      case 'dash':
        this._tickSingles(dt);
        break;
      case 'horde':
        f.horde = f.horde.filter(e => this._alive(e));
        if (!f.horde.length) {
          this._enter('dash');
          this._spawnNext();
        }
        break;
    }

    this._moveDeath(dt, p, death);
  }

  /** The single-spawn phases: wait out the current enemy, then bring the next. */
  _tickSingles(dt) {
    const f = this.fight;
    if (f.current && this._alive(f.current)) return;
    f.current = null;
    if (f.nextSpawnIn <= 0) { f.nextSpawnIn = NEXT_SPAWN_DELAY; return; }
    f.nextSpawnIn -= dt;
    if (f.nextSpawnIn > 0) return;
    f.nextSpawnIn = 0;
    this._spawnNext();
  }

  _enter(phase) {
    const f = this.fight;
    f.phase = phase;
    f.elapsed = 0;
    if (phase === 'dash') {
      f.dash = { stage: 'hover', t: 0, hoverFor: DASH_FIRST_HOVER, from: null, to: null, shadow: null, baseY: null };
    }
  }

  /**
   * Bring the next Library Queue entry, or move the fight on when a tier is
   * spent: weak → LIVE FOREVER, normal → the horde, boss → fulfillment.
   */
  _spawnNext() {
    const f = this.fight;
    const next = f.queue[0];
    const tierDone = !next || (f.phase === 'weak' && next.tier !== 'weak') ||
      (f.phase === 'forever' && next.tier !== 'normal');

    if (tierDone) {
      if (f.phase === 'weak') {
        f.watching = false;
        this._say('LIVE FOREVER');
        this._enter('forever');
        return this._spawnNext();
      }
      if (f.phase === 'forever') return this._beginHorde();
      // The dash phase ran the queue out.
      this._beginFulfillment();
      return;
    }

    f.queue.shift();
    const enemy = this._spawn(next.char);
    if (!enemy) {
      // No room to stand — try again next beat rather than skip the entry.
      f.queue.unshift(next);
      f.nextSpawnIn = NEXT_SPAWN_DELAY;
      return;
    }
    f.current = enemy;
    f.spawnCount++;

    // The second arrival is when the word is offered — once a run, and not to
    // a player who already said it.
    if (f.spawnCount === 2 && !this.game.deathSpokeConsume && !f.consumed) {
      this.game.deathSpokeConsume = true;
      this._say('CONSUME');
    }
  }

  /** Every weak and normal entry at once, all along the walls. */
  _beginHorde() {
    const f = this.fight;
    this._enter('horde');
    const chars = buildLibraryQueue().filter(e => e.tier === 'weak' || e.tier === 'normal');
    const taken = new Set();
    f.horde = [];
    for (const { char } of chars) {
      const enemy = this._spawn(char, taken);
      if (enemy) f.horde.push(enemy);
    }
    // PURGE is only offered to a player who can pay for it.
    if (this.game.wishSystem?.hasWish(this.game)) {
      f.purgeSpoken = true;
      this._say('PURGE!');
    }
  }

  _beginFulfillment() {
    const f = this.fight;
    this._enter('fulfillment');
    f.speed = 0;
    this._say('FULFILLMENT NEARS');
    this._sayAfter('SEEK THE CROWN');
  }

  // ── Spawning ────────────────────────────────────────────────────────────────

  _alive(enemy) {
    if (!enemy || enemy.isDying || enemy.hp <= 0) return false;
    return (this.game._activeEnemies?.() ?? []).includes(enemy);
  }

  /**
   * One enemy at a random border-adjacent cell. Same wiring as the CheatMenu's
   * spawn (CheatMenu.spawnEnemyAtPlayer), enraged so it comes straight on.
   * @param {string} char ENEMIES key
   * @param {Set<string>} [taken] cells already used this frame (the horde)
   */
  _spawn(char, taken = null) {
    const game = this.game;
    const room = game.currentRoom;
    const cell = this._borderCell(taken);
    if (!room || !cell) return null;

    const enemy = new Enemy(char, cell.col * CS, cell.row * CS, game.getCurrentZoneDepth());
    enemy.setCollisionMap(room.collisionMap);
    enemy.setBackgroundObjects(room.backgroundObjects);
    enemy.setSteamClouds(game.steamClouds);
    enemy.setTarget(game.player);
    enemy.setGame(game);
    enemy.setRoom(room);
    enemy.enraged = true;
    enemy.invulnerabilityTimer = SPAWN_IFRAMES;
    enemy.deathFightEnemy = true;
    game.physicsSystem.addEntity(enemy);
    game._activeEnemies().push(enemy);
    return enemy;
  }

  /**
   * A random walkable cell one in from the border wall, away from the player.
   * @param {Set<string>} [taken] cells to skip, as `col,row`
   * @returns {{col:number,row:number}|null}
   */
  _borderCell(taken = null) {
    const game = this.game;
    const map = game.currentRoom?.collisionMap;
    const p = game.player.position;
    const cells = [];
    const consider = (col, row) => {
      if (map?.[row]?.[col]) return;
      if (taken?.has(`${col},${row}`)) return;
      if (Math.hypot(col * CS - p.x, row * CS - p.y) < SPAWN_MIN_PLAYER_DIST) return;
      cells.push({ col, row });
    };
    const lastCol = GRID.COLS - 2;
    const lastRow = GRID.ROWS - 2;
    for (let col = 1; col <= lastCol; col++) { consider(col, 1); consider(col, lastRow); }
    for (let row = 2; row < lastRow; row++) { consider(1, row); consider(lastCol, row); }
    if (!cells.length) return null;
    const cell = cells[Math.floor(Math.random() * cells.length)];
    taken?.add(`${cell.col},${cell.row}`);
    return cell;
  }

  // ── The THREE's words ───────────────────────────────────────────────────────

  _say(text) {
    this.game.spellResponse = { text, startTime: performance.now() };
    // A line said now pushes anything still waiting back behind it.
    const f = this.fight;
    if (!f) return;
    if (f.lines.length) f.lines[0].in = Math.max(f.lines[0].in, lineSeconds(text));
    f.lastLine = text;
  }

  /** Say `text` once the line now showing has gone. */
  _sayAfter(text) {
    const f = this.fight;
    const ahead = f.lines.length ? 0 : lineSeconds(f.lastLine);
    f.lines.push({ text, in: ahead });
  }

  _tickLines(dt) {
    const f = this.fight;
    const lines = f.lines;
    if (!lines.length) return;
    lines[0].in -= dt;
    if (lines[0].in > 0) return;
    const { text } = lines.shift();
    this.game.spellResponse = { text, startTime: performance.now() };
    f.lastLine = text;
    if (lines.length) lines[0].in = lineSeconds(text);
  }

  /**
   * Death's answer to a typed word during the fight, or null when the room
   * answers as usual (ThreeVoiceSystem). '' is an answer: a successful action
   * is silent.
   * @param {string} word the matched SPELLS key
   * @returns {string|null}
   */
  answer(word) {
    const f = this.fight;
    if (!f) return null;

    if (TALK_WORDS.has(word) && f.phase === 'hunt' && !f.talked) {
      f.talked = true;
      f.pause = TALK_PAUSE_SECONDS;
      return 'DO YOU FEAR US?';
    }

    if (word === 'CONSUME') return this._consume();

    if ((word === 'PURGE' || word === 'CLEANSE') && f.phase === 'horde' && f.purgeSpoken) {
      return this._purge();
    }
    return null;
  }

  /**
   * CONSUME with no name: the enemy in front of the player is taken, as the
   * true-name CONSUME would take it (ConsumeSystem) but with no wish spent.
   * The run is Cursed by it. In the weak phase Death says the name, then
   * GOOD, and stands to watch.
   */
  _consume() {
    const game = this.game;
    const f = this.fight;
    const target = f.current;
    if (!this._alive(target) || target.data?.tier === 'boss') return null;

    game.consumeSystem.consumeEnemy(target);
    f.current = null;
    f.consumed = true;
    game.cursedRunSystem.begin(game, { spendWish: false });

    if (f.phase !== 'weak') return '';
    f.watching = true;
    const name = `${target.data?.trueName || ''}!`;
    f.lastLine = name;
    this._sayAfter('GOOD.');
    return name;
  }

  /** PURGE in the horde: the wish is spent with no question, and the room is cleared. */
  _purge() {
    const game = this.game;
    if (!game.wishSystem.spend(game)) return null;
    game.wishSystem.executePurge(game);
    this.fight.horde = [];
    return '';
  }

  // ── Death's movement ────────────────────────────────────────────────────────

  _moveDeath(dt, p, death) {
    const f = this.fight;
    if (f.phase === 'dash') return this._moveDash(dt, p, death);

    if (f.phase === 'fulfillment') {
      // It waits for its words, then comes.
      if (f.lines.length || f.elapsed < FULFILLMENT_WORDS_SECONDS) return;
      return this._home(dt, p, death, FULFILLMENT_ACCEL, FULFILLMENT_MAX_SPEED, false);
    }

    if (f.pause > 0) {
      f.pause -= dt;
      death.speed = 0;
      death.glitterHit = false;
      return;
    }
    if (f.watching) {
      death.speed = 0;
      death.glitterHit = false;
      return;
    }
    const max = f.phase === 'hunt' || f.phase === 'weak' ? HUNT_MAX_SPEED : FOREVER_MAX_SPEED;
    this._home(dt, p, death, HUNT_ACCEL, max, true);
  }

  /**
   * A struck Death is thrown straight back from the player, then its speed
   * starts over from nothing; otherwise it homes on the player — straight
   * line, through walls, no leash — a little faster every second.
   */
  _home(dt, p, death, accel, maxSpeed, struckable) {
    const dx = p.position.x - death.position.x;
    const dy = p.position.y - death.position.y;
    const dist = Math.hypot(dx, dy) || 1;
    const kb = death.knockback;

    if (death.glitterHit) {
      death.glitterHit = false;
      if (struckable) {
        kb.vx = -(dx / dist) * KNOCKBACK_SPEED;
        kb.vy = -(dy / dist) * KNOCKBACK_SPEED;
        kb.timer = KNOCKBACK_TIME;
        death.speed = 0;
      }
    }

    if (kb.timer > 0) {
      kb.timer -= dt;
      death.position.x += kb.vx * dt;
      death.position.y += kb.vy * dt;
      const bleed = Math.max(0, 1 - KNOCKBACK_DECAY * dt);
      kb.vx *= bleed;
      kb.vy *= bleed;
      if (kb.timer <= 0) { kb.vx = 0; kb.vy = 0; death.speed = 0; }
      return;
    }

    death.speed = Math.min(death.speed + accel * dt, maxSpeed);
    death.position.x += (dx / dist) * death.speed * dt;
    death.position.y += (dy / dist) * death.speed * dt;
  }

  /**
   * Hover, then a shadow runs the line ahead, then Death crosses on it.
   * Blows land on a hovering Death as anywhere else, but it is not thrown —
   * it is held up by something stronger than the swing.
   */
  _moveDash(dt, p, death) {
    const d = this.fight.dash;
    death.glitterHit = false;
    death.speed = 0;
    d.t += dt;

    if (d.stage === 'hover') {
      if (d.baseY === null) d.baseY = death.position.y;
      death.position.y = d.baseY + Math.sin(d.t * HOVER_BOB_RATE * Math.PI * 2 / 3) * HOVER_BOB;
      if (d.t < d.hoverFor) return;
      death.position.y = d.baseY;
      d.from = { x: death.position.x, y: death.position.y };
      d.to = this._dashEnd(d.from, p.position);
      d.stage = 'telegraph';
      d.t = 0;
      return;
    }

    if (d.stage === 'telegraph') {
      const k = Math.min(d.t / DASH_TELEGRAPH, 1);
      d.shadow = { x: d.from.x + (d.to.x - d.from.x) * k, y: d.from.y + (d.to.y - d.from.y) * k };
      if (k < 1) return;
      d.stage = 'dashing';
      d.t = 0;
      return;
    }

    // Dashing: along the locked line to the far wall.
    const len = Math.hypot(d.to.x - d.from.x, d.to.y - d.from.y) || 1;
    const k = Math.min((d.t * DASH_SPEED) / len, 1);
    death.position.x = d.from.x + (d.to.x - d.from.x) * k;
    death.position.y = d.from.y + (d.to.y - d.from.y) * k;
    if (k < 1) return;
    d.shadow = null;
    d.stage = 'hover';
    d.baseY = death.position.y;
    // The next dash starts DASH_INTERVAL after this one's line was drawn.
    d.hoverFor = Math.max(0, DASH_INTERVAL - DASH_TELEGRAPH - len / DASH_SPEED);
    d.t = 0;
  }

  /**
   * Where a dash ends: from Death, through where the player stood when the
   * line was drawn, on to the room's edge.
   */
  _dashEnd(from, target) {
    const margin = CS * 1.5;
    const dx = target.x - from.x;
    const dy = target.y - from.y;
    const dist = Math.hypot(dx, dy) || 1;
    const ux = dx / dist;
    const uy = dy / dist;
    let t = Infinity;
    if (ux > 0) t = Math.min(t, (GRID.WIDTH - margin - from.x) / ux);
    if (ux < 0) t = Math.min(t, (margin - from.x) / ux);
    if (uy > 0) t = Math.min(t, (GRID.HEIGHT - margin - from.y) / uy);
    if (uy < 0) t = Math.min(t, (margin - from.y) / uy);
    if (!isFinite(t)) t = 0;
    t = Math.max(t, dist);
    return { x: from.x + ux * t, y: from.y + uy * t };
  }

  /** The dash's shadow, where the renderer draws it — null when there is none. */
  shadow() {
    return this.fight?.dash?.stage === 'telegraph' ? this.fight.dash.shadow : null;
  }
}
