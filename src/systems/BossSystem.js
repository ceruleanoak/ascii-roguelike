/**
 * BossSystem — orchestrates zone boss encounters.
 *
 * Responsibilities:
 *  - Spawn GooDragon + GooHeads into the boss room on activation
 *  - Drive phase transitions based on GooDragon HP
 *  - Drain boss entity pendingBossAttacks → CombatSystem each frame
 *  - Detect reflectable-projectile hits by player melee
 *  - Handle grab-escape when player attacks while grabbed
 *  - Mark zone boss defeated and broadcast zone-lock on kill
 */

import { GooDragon, PHASE2_HP_THRESHOLD, PHASE3_HP_THRESHOLD } from '../entities/GooDragon.js';
import { GooHead } from '../entities/GooHead.js';
import { GRID } from '../game/GameConfig.js';
import { GooBlob } from '../entities/GooBlob.js';
import { LakeBoss, LAKE_BOSS_PHASE2_HP_THRESHOLD } from '../entities/LakeBoss.js';
import { BackgroundObject } from '../entities/BackgroundObject.js';
import { TurtleShell, TURTLE_MAX_HP, TURTLE_PHASE2_HP } from '../entities/TurtleShell.js';
import { Enemy } from '../entities/Enemy.js';
import { TurtleHead } from '../entities/TurtleHead.js';
import { TurtleLeg } from '../entities/TurtleLeg.js';



export class BossSystem {
  constructor(game) {
    this.game = game;
    this.active    = false;
    this.dragon    = null;   // GooDragon (middle head)
    this.heads     = [];     // [GooHead left, GooHead right]
    this.lakeBoss       = null;   // LakeBoss (cyan zone)
    this._iceShockwave  = null;   // expanding shockwave after slam
    this.turtleShell    = null;   // TurtleShell (red zone)
    this.turtleHead     = null;   // TurtleHead (red zone)
    this.turtleLegs     = [];     // TurtleLeg[4] (red zone)
    this.zone      = null;   // which zone this boss represents
    this.bossPhase = 1;
    this.prevBossHp = Infinity;   // HP tracking for audio damage signal
    this.tortoiseWaveSpawned = false;  // 75% HP tortoise wave (red boss)

    // Collision damage cooldown per head (prevents damage spam)
  }

  // ── Activation ─────────────────────────────────────────────────────────────

  /**
   * Called right after a zone-boss room is generated.
   * Adds boss entities to room.enemies so they participate in normal
   * combat, target-setting, and physics registration.
   */
  activate(room, zone) {
    this.active = true;
    this.zone   = zone;
    this.bossPhase = 1;
    this.prevBossHp = Infinity;
    this.tortoiseWaveSpawned = false;

    // Red zone: spawn the Ancient Turtle
    if (zone === 'red') {
      const cx = GRID.WIDTH  / 2;
      const cy = GRID.HEIGHT / 2;
      this.turtleShell = new TurtleShell(cx, cy);
      this.turtleShell.setCollisionMap(room.collisionMap);
      this.turtleShell.setBackgroundObjects(room.backgroundObjects);
      this.turtleHead = new TurtleHead(cx, cy);
      this.turtleHead.shellRef = this.turtleShell;
      this.turtleHead.setCollisionMap(room.collisionMap);
      this.turtleHead.setBackgroundObjects(room.backgroundObjects);

      // Four legs (corners): front-left, front-right, back-left, back-right
      this.turtleLegs = [];
      for (let i = 0; i < 4; i++) {
        const leg = new TurtleLeg(cx, cy, i);
        leg.shellRef = this.turtleShell;
        leg.setCollisionMap(room.collisionMap);
        leg.setBackgroundObjects(room.backgroundObjects);
        this.turtleLegs.push(leg);
      }

      room.enemies.push(this.turtleShell, this.turtleHead, ...this.turtleLegs);
      room.isBossRoom = true;
      return;
    }

    // Cyan zone: spawn the lake boss
    if (zone === 'cyan') {
      const waterTiles = room.backgroundObjects
        .filter(o => !o.destroyed && o.isWater && o.isWater())
        .map(o => ({ x: o.position.x + GRID.CELL_SIZE / 2,
                     y: o.position.y + GRID.CELL_SIZE / 2 }));
      const cx = GRID.WIDTH / 2, cy = GRID.HEIGHT / 2;
      this.lakeBoss = new LakeBoss(cx, cy, waterTiles);
      // Set once here rather than per-frame: the boss is driven by EnemyUpdateSystem
      // before this system runs, so a per-frame assignment would always land a tick
      // late, and the target never changes for the life of the encounter (bug #216).
      this.lakeBoss.setTarget(this.game.player);
      room.enemies.push(this.lakeBoss);
      room.isBossRoom     = true;
      room.isLakeBossRoom = true;
      return;
    }

    const cx = GRID.WIDTH  / 2;
    const cy = GRID.HEIGHT / 2;

    // Middle head — damage target
    this.dragon = new GooDragon(cx, cy);
    this.dragon.setCollisionMap(room.collisionMap);
    this.dragon.setBackgroundObjects(room.backgroundObjects);

    // Side heads — flanking / grab
    const leftHead  = new GooHead(cx - GRID.CELL_SIZE * 4, cy, 'left');
    const rightHead = new GooHead(cx + GRID.CELL_SIZE * 4, cy, 'right');
    for (const h of [leftHead, rightHead]) {
      h.anchorEntity = this.dragon;
      h.setCollisionMap(room.collisionMap);
      h.setBackgroundObjects(room.backgroundObjects);
    }
    this.heads = [leftHead, rightHead];

    // Register in the room enemy array so normal loops pick them up
    room.enemies.push(this.dragon, leftHead, rightHead);
    room.isBossRoom = true;
  }

  deactivate() {
    this.active    = false;
    this.dragon    = null;
    this.heads     = [];
    this.lakeBoss      = null;
    this._iceShockwave = null;
    this.turtleShell   = null;
    this.turtleHead    = null;
    this.turtleLegs    = [];
    this.zone          = null;
    this.bossPhase = 1;
    this.prevBossHp = Infinity;
  }

  _getBossCurrentHp() {
    if (this.zone === 'red') return this.turtleShell?.hp ?? Infinity;
    if (this.zone === 'cyan') return this.lakeBoss?.hp ?? Infinity;
    return this.dragon?.hp ?? Infinity;
  }

  /**
   * Re-link existing boss entities after a mid-boss revive.
   * Reuses whatever is already in room.enemies rather than spawning new ones.
   */
  reactivate(room) {
    const lb = room.enemies.find(e => e.isBossLakeBoss && e.hp > 0);
    if (lb) { this.lakeBoss = lb; this.zone = 'cyan'; this.active = true; return; }

    const ts = room.enemies.find(e => e instanceof TurtleShell && e.hp > 0) ?? null;
    if (ts) {
      this.turtleShell = ts;
      this.turtleHead  = room.enemies.find(e => e instanceof TurtleHead) ?? null;
      if (this.turtleHead) this.turtleHead.shellRef = ts;
      this.turtleLegs  = room.enemies.filter(e => e.isBossLeg);
      for (const leg of this.turtleLegs) leg.shellRef = ts;
      this.zone    = 'red';
      this.active  = true;
      return;
    }

    this.dragon = room.enemies.find(e => e instanceof GooDragon && e.hp > 0) ?? null;
    this.heads  = room.enemies.filter(e => e instanceof GooHead && e.hp > 0);
    this.zone   = this.game.zoneSystem.currentZone;
    this.active = this.dragon !== null;
  }

  // ── Per-frame update ───────────────────────────────────────────────────────

  update(deltaTime) {
    if (!this.active) return;
    if (this.lakeBoss)    { this._updateLakeBoss(deltaTime); this._trackBossDamage(); return; }
    if (this.turtleShell) { this._updateRedBoss(deltaTime);  this._trackBossDamage(); return; }
    if (!this.dragon) return;

    // Phase transitions
    this._checkPhaseTransitions();

    // Drain attacks queued by boss entities → CombatSystem
    this._drainPendingAttacks(this.dragon);
    for (const head of this.heads) {
      this._drainPendingAttacks(head);
    }

    // Detect grab-escape: player attacks while grabbed
    this._checkGrabEscape();

    // Detect reflectable projectile hits and track reflected ones vs boss
    this._checkReflectableHits();
    this._checkReflectedProjectileBossHits();

    // Check boss defeat
    if (this.dragon.hp <= 0) {
      this._onBossDefeated();
    }

    this._trackBossDamage();
  }

  _trackBossDamage() {
    const currentHp = this._getBossCurrentHp();
    if (currentHp < this.prevBossHp) {
      this.game.audioSystem.onBossDamaged();
    }
    this.prevBossHp = currentHp;
  }

  // ── Lake boss ──────────────────────────────────────────────────────────────

  _updateLakeBoss(deltaTime) {
    const boss = this.lakeBoss;
    // Bug #216 fix: LakeBoss sits in room.enemies, so EnemyUpdateSystem already
    // drove it on the canonical enemy clock earlier this frame. This method is a
    // pure consumer of that tick — it must never call boss.update() again.
    // Its per-frame inputs are staged at the end of this method for the next tick.

    // If the boss entered the slam since we last looked (from its own tick, or from
    // takeDamage() inside CombatSystem), purge delayed ice shots already queued.
    if (boss.enteredSlamming) {
      boss.enteredSlamming = false;
      this.game.combatSystem.cancelPendingAttacksFrom(boss);
    }
    this._drainPendingAttacks(boss);
    this._checkLakePhaseTransition();

    // On Breach: hole the sheet where the boss came up
    if (boss.pendingLead) {
      this._openLead(boss.pendingLead);
      boss.pendingLead = null;
    }

    // On slam impact: start expanding shockwave
    if (boss.pendingIceBreak && boss.slamPosition) {
      // The armed Freeze-Over only commits if the player is standing on water.
      // On land, the Hummock cage raised below would wall the player OUT of the
      // arena in a room whose exits are locked — an unwinnable state. Declining
      // leaves the boss armed, so the flip happens on a later slam instead.
      const flip = boss.pendingFreezeOver && this._isPlayerOverWater();
      const ROOM_DIAG = Math.hypot(GRID.WIDTH, GRID.HEIGHT);
      this._iceShockwave = {
        x:         boss.slamPosition.x,
        y:         boss.slamPosition.y,
        radius:    0,
        maxRadius: ROOM_DIAG,
        speed:     GRID.CELL_SIZE * 22,  // ~352 px/s — crosses room in ~1.4s
        mode:      flip ? 'freeze' : 'thaw',
      };
      boss.pendingIceBreak   = false;
      boss.pendingFreezeOver = false;
      boss.slamPosition      = null;
      if (flip) {
        this._raiseHummocks();
        boss.transitionToPhase(2);
      }
    }

    // Expand shockwave, converting water tiles and knocking back the player.
    // Direction depends on sw.mode: 'thaw' is the phase-1 ice hammer (undo the
    // player's freezes); 'freeze' is the Freeze-Over running that same sweep
    // backwards to flip the whole board to ice.
    if (this._iceShockwave) {
      const sw = this._iceShockwave;
      const freezing = sw.mode === 'freeze';
      const prevRadius = sw.radius;
      sw.radius += sw.speed * deltaTime;

      // Animate and convert water tiles swept by the ring this frame. The annulus
      // test below touches each tile exactly once, so the _shockwaveTouched marker
      // only guards against a tile being converted twice by overlapping sweeps.
      for (const obj of this.game._activeBackgroundObjects()) {
        if (obj.destroyed || !obj.isWater || !obj.isWater()) continue;
        const cx = obj.position.x + GRID.CELL_SIZE / 2;
        const cy = obj.position.y + GRID.CELL_SIZE / 2;
        const dist = Math.hypot(cx - sw.x, cy - sw.y);
        if (dist <= prevRadius || dist > sw.radius) continue;
        // Shake every water tile the ring sweeps over
        obj._playAnimation?.('shake');
        if (obj._shockwaveTouched) continue;
        if (freezing) {
          // Infinity, not a duration: BackgroundObject.update ticks waterStateTimer
          // down and reverts to normal on expiry. The Freeze-Over must not expire —
          // the sheet only ever opens where a Breach holes it.
          // setWaterState itself refuses to refreeze a Lead, so the sweep needs
          // no special case for holes the player has already earned.
          if (obj.getWaterState?.() !== 'frozen') {
            obj.setWaterState('frozen', Infinity);
            obj._shockwaveTouched = true;
          }
        } else if (obj.getWaterState?.() === 'frozen') {
          obj.setWaterState('normal', 0);
          obj._shockwaveTouched = true;
          this.game.combatSystem.createDamageNumber('~', obj.position.x, obj.position.y, '#88ddff');
        }
      }

      // Destroy boss ice projectiles caught inside the expanding ring
      const enemyProjs = this.game.combatSystem.getEnemyProjectiles();
      for (let pi = enemyProjs.length - 1; pi >= 0; pi--) {
        const proj = enemyProjs[pi];
        if (proj.owner !== this.lakeBoss) continue;
        const pcx2 = proj.position.x + (proj.width  || GRID.CELL_SIZE) / 2;
        const pcy2 = proj.position.y + (proj.height || GRID.CELL_SIZE) / 2;
        if (Math.hypot(pcx2 - sw.x, pcy2 - sw.y) <= sw.radius) {
          enemyProjs.splice(pi, 1);
        }
      }

      // Destroy in-flight player arrows swept by the ring
      const playerProjs = this.game.combatSystem.getProjectiles();
      for (let pi = playerProjs.length - 1; pi >= 0; pi--) {
        const proj = playerProjs[pi];
        if (proj.type !== 'arrow') continue;
        const pcx2 = proj.position.x + (proj.width  || GRID.CELL_SIZE) / 2;
        const pcy2 = proj.position.y + (proj.height || GRID.CELL_SIZE) / 2;
        if (Math.hypot(pcx2 - sw.x, pcy2 - sw.y) <= sw.radius) {
          playerProjs.splice(pi, 1);
        }
      }

      // Dislodge stuck arrows within the ring
      const stuckArrows = this.game.combatSystem.getStuckArrows();
      for (let ai = stuckArrows.length - 1; ai >= 0; ai--) {
        const arrow = stuckArrows[ai];
        if (Math.hypot(arrow.position.x - sw.x, arrow.position.y - sw.y) <= sw.radius) {
          stuckArrows.splice(ai, 1);
        }
      }

      // Dissipate particles inside the ring
      for (let pi = this.game.particles.length - 1; pi >= 0; pi--) {
        const p = this.game.particles[pi];
        const px = p.position ? p.position.x : p.x;
        const py = p.position ? p.position.y : p.y;
        if (Math.hypot(px - sw.x, py - sw.y) <= sw.radius) {
          this.game.particles.splice(pi, 1);
        }
      }

      // Push player outward while inside the expanding ring, but only while in liquid.
      // On land the player stands firm — no continued shockwave force.
      const player = this.game.player;
      if (player.inLiquid) {
        const pcx = player.position.x + GRID.CELL_SIZE / 2;
        const pcy = player.position.y + GRID.CELL_SIZE / 2;
        const playerDist = Math.hypot(pcx - sw.x, pcy - sw.y);
        if (playerDist <= sw.radius) {
          this.game.physicsSystem.applyKnockback(player, sw.x, sw.y, 420, 0.1);
        }
      }

      if (sw.radius >= sw.maxRadius) {
        for (const obj of this.game._activeBackgroundObjects()) {
          delete obj._shockwaveTouched;
        }
        this._iceShockwave = null;
      }
    }

    // Stage the boss's per-frame inputs for its next canonical tick. EnemyUpdateSystem
    // drives the boss before this system runs, so anything assigned here is read on the
    // following frame — which is why these are set last rather than first (bug #216).
    boss.shockwaveActive = !!this._iceShockwave;

    if (boss.hp <= 0) this._onLakeBossDefeated();
  }

  /**
   * Arm the Freeze-Over at the phase-2 HP threshold. Detection only — the flip
   * itself rides the next slam, so the player's position decides when the board
   * turns over. Mirrors _checkPhaseTransitions/_checkTurtlePhaseTransition.
   */
  _checkLakePhaseTransition() {
    const boss = this.lakeBoss;
    if (boss.phase !== 1 || boss.freezeOverArmed) return;
    if (boss.hp <= LAKE_BOSS_PHASE2_HP_THRESHOLD) boss.freezeOverArmed = true;
  }

  /** True when the player is standing over a lake tile (frozen or not). */
  _isPlayerOverWater() {
    const player = this.game.player;
    const pcx = player.position.x + GRID.CELL_SIZE / 2;
    const pcy = player.position.y + GRID.CELL_SIZE / 2;
    const half = GRID.CELL_SIZE / 2;
    for (const obj of this.game._activeBackgroundObjects()) {
      if (obj.destroyed || !obj.isWater || !obj.isWater()) continue;
      if (Math.abs(obj.position.x + half - pcx) < GRID.CELL_SIZE &&
          Math.abs(obj.position.y + half - pcy) < GRID.CELL_SIZE) return true;
    }
    return false;
  }

  /**
   * Raise the Hummock cage: a solid ring of piled ice on every land cell touching
   * the lake. This is what makes the depleting floor a threat rather than an
   * inconvenience — with the shore walled off, the frozen sheet is the only ground,
   * and every Breach takes a piece of it away.
   */
  _raiseHummocks() {
    const objects = this.game._activeBackgroundObjects();
    const CS = GRID.CELL_SIZE;
    const keyOf = obj => `${Math.round(obj.position.x / CS)},${Math.round(obj.position.y / CS)}`;

    // Index occupancy by cell so we can walk the shoreline without rescanning the
    // object list per candidate. `blockers` are cells that already stop the player.
    const waterCells = new Set();
    const occupants  = new Map();
    const blockers   = new Set();
    for (const obj of objects) {
      if (obj.destroyed) continue;
      const key = keyOf(obj);
      occupants.set(key, obj);
      if (obj.isWater && obj.isWater()) { waterCells.add(key); continue; }
      if (obj.data?.solid) blockers.add(key);
    }

    const room = this.game.activeRoom ?? this.game.currentRoom;
    const shore = new Set();
    for (const key of waterCells) {
      const [col, row] = key.split(',').map(Number);
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const c = col + dc, r = row + dr;
        if (c < 1 || r < 1 || c >= GRID.COLS - 1 || r >= GRID.ROWS - 1) continue;
        const nKey = `${c},${r}`;
        if (waterCells.has(nKey) || blockers.has(nKey)) continue;  // already blocks
        if (room.collisionMap?.[r]?.[c]) continue;                 // already a wall
        shore.add(nKey);
      }
    }

    // The cage must be closed to mean anything. stampWaterBlobs scatters shoreline
    // decoration (rocks, bushes) at exactly these cells, and a non-solid bush would
    // be a hole the player could walk out through — so a decoration standing on a
    // shore cell is replaced by the Hummock rather than skipped. Solid neighbours
    // (rocks, walls) are left alone; they already do the job.
    for (const key of shore) {
      const standing = occupants.get(key);
      if (standing) {
        const at = objects.indexOf(standing);
        if (at !== -1) objects.splice(at, 1);
      }
      const [col, row] = key.split(',').map(Number);
      const hummock = new BackgroundObject('"', col * CS, row * CS);
      hummock.isHummock = true;  // marks it for teardown when the boss dies
      objects.push(hummock);
    }
  }

  /**
   * Open a Lead — a permanent hole in the frozen sheet where the boss breached.
   * Marked `isLead` so nothing can close it again: the boss's own ice stream
   * carries freezesWater, and without the mark it would repair the floor it is
   * supposed to be destroying.
   */
  _openLead(lead) {
    let shattered = 0;
    for (const obj of this.game._activeBackgroundObjects()) {
      if (obj.destroyed || !obj.isWater || !obj.isWater()) continue;
      const cx = obj.position.x + GRID.CELL_SIZE / 2;
      const cy = obj.position.y + GRID.CELL_SIZE / 2;
      if (Math.hypot(cx - lead.x, cy - lead.y) > lead.radius) continue;
      obj.isLead = true;
      if (obj.getWaterState?.() === 'frozen') {
        obj.setWaterState('normal', 0);
        obj._playAnimation?.('shake');
        shattered++;
      }
    }
    if (shattered) this._spawnBreachDebris(lead, shattered);
  }

  /**
   * Ice thrown up by a Breach. The eruption removes a chunk of the only floor the
   * player has left, and that has to land as violence rather than as tiles quietly
   * changing colour — the depleting sheet is the fight's clock, so the player needs
   * to feel each piece go.
   *
   * Scaled by how much sheet actually shattered, so a Breach into open water (a
   * spot already holed) is visibly a lesser event than one that takes fresh ice.
   */
  _spawnBreachDebris(lead, shattered) {
    const SHARDS = ['*', '+', '.', ':', 'o'];  // printable ASCII per the encoding rule
    const count  = Math.min(46, 14 + shattered * 2);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      // Bias outward from the centre so the spray traces the hole's real extent
      const dist  = lead.radius * (0.2 + Math.random() * 0.8);
      const speed = 55 + Math.random() * 95;
      this.game.particles.push({
        x: lead.x + Math.cos(angle) * dist,
        y: lead.y + Math.sin(angle) * dist,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 40,   // upward bias: thrown, not pushed
        life: 0.45 + Math.random() * 0.35,
        maxLife: 0.8,
        char: SHARDS[Math.floor(Math.random() * SHARDS.length)],
        color: Math.random() < 0.5 ? '#ffffff' : '#cceeff',
      });
    }
    // A slower column of spray straight up out of the hole, so the breach point
    // itself stays readable after the outward shards have scattered.
    for (let i = 0; i < 8; i++) {
      this.game.particles.push({
        x: lead.x + (Math.random() - 0.5) * GRID.CELL_SIZE * 2,
        y: lead.y + (Math.random() - 0.5) * GRID.CELL_SIZE * 2,
        vx: (Math.random() - 0.5) * 30,
        vy: -110 - Math.random() * 60,
        life: 0.7, maxLife: 0.7,
        char: ':', color: '#aaddff',
      });
    }
  }

  /**
   * Tear down the arena mutations. Without this the Hummock cage outlives the
   * fight and traps the player in a room whose exits just unlocked.
   */
  _clearLakeArena() {
    const objects = this.game._activeBackgroundObjects();
    for (let i = objects.length - 1; i >= 0; i--) {
      const obj = objects[i];
      if (obj.isHummock) { objects.splice(i, 1); continue; }
      if (obj.isWater?.() && obj.getWaterState?.() === 'frozen') {
        obj.setWaterState('normal', 0);
      }
      delete obj.isLead;
    }
  }

  _onLakeBossDefeated() {
    this._clearLakeArena();
    this.game.zoneSystem.markBossDefeated(this.zone);
    const enemies = this.game._activeEnemies();
    for (let i = enemies.length - 1; i >= 0; i--)
      if (enemies[i] === this.lakeBoss) enemies.splice(i, 1);
    this.game.menuSystem.showPickupMessage('The Frosted Maw is defeated!', '#aaffff', 3.0);
    this._grantBossReward();
    this.lakeBoss = null;
    this.deactivate();
  }

  // ── Phase transitions ──────────────────────────────────────────────────────

  _checkPhaseTransitions() {
    const hp = this.dragon.hp;

    if (this.bossPhase === 1 && hp <= PHASE2_HP_THRESHOLD) {
      this.bossPhase = 2;
      this.dragon.transitionToPhase(2);

    } else if (this.bossPhase === 2 && hp <= PHASE3_HP_THRESHOLD) {
      this.bossPhase = 3;
      this.dragon.transitionToPhase(3);
      this._detachHeads();
    }
  }

  _detachHeads() {
    for (const head of this.heads) {
      head.detach();
    }
  }

  // ── Attack draining ────────────────────────────────────────────────────────

  _drainPendingAttacks(entity) {
    if (!entity.pendingBossAttacks || entity.pendingBossAttacks.length === 0) return;

    for (const atk of entity.pendingBossAttacks) {
      if (atk.type === 'gooBlob') {
        // Spawn a real GooBlob entity that travels then settles as a floor hazard
        const blob = new GooBlob(
          atk.position.x, atk.position.y,
          performance.now(),
          false,
          atk.velocity.vx, atk.velocity.vy,
          atk.decel ?? 2.2
        );
        blob.hutPlane = !!this.game.activeFloor;
        this.game.gooBlobs.push(blob);
        while (this.game.gooBlobs.length > 20) this.game.gooBlobs.shift();
      } else {
        // Regular projectile via CombatSystem
        this.game.combatSystem.createEnemyAttack({
          position:     { x: atk.position.x, y: atk.position.y },
          velocity:     { vx: atk.velocity.vx, vy: atk.velocity.vy },
          damage:       atk.damage,
          char:         atk.char,
          color:        atk.color,
          reflectable:  atk.reflectable,
          reflected:    atk.reflected,
          owner:        atk.owner,
          onHit:        atk.onHit ?? 'slime',
          freezesWater: atk.freezesWater ?? false,
          width:        atk.width,
          height:       atk.height,
          lifetime:     atk.lifetime,
          delay:        atk.delay,
        });
      }
    }
    entity.pendingBossAttacks.length = 0;
  }

  // ── Grab-escape ───────────────────────────────────────────────────────────

  _checkGrabEscape() {
    const player = this.game.player;
    if (!player || !player.grabbed || !player.grabbedBy) return;

    const head = player.grabbedBy;
    // `grabbedBy` is no longer GooHead-exclusive — a regular Enemy's Recover
    // `lockPlayer` variant sets it too, and that root is a plain timer, not a
    // struggle mechanic, so it has no `releaseGrab`/boss `takeDamage` to escape
    // via a melee hit. Without this guard a swing during that lock would throw.
    if (typeof head.releaseGrab !== 'function') return;
    // Check if any active melee attack from the player is facing toward the head
    for (const atk of this.game.combatSystem.getMeleeAttacks()) {
      if (!this._meleeFacingToward(atk, player, head)) continue;
      if (!this._atkOverlapsHead(atk, head)) continue;

      // Hit registered — escape and damage the head
      head.releaseGrab();
      head.takeDamage(atk.damage);
      this.game.combatSystem.createDamageNumber(
        atk.damage,
        head.position.x,
        head.position.y,
        head.color
      );
      break;
    }
  }

  _meleeFacingToward(_atk, player, head) {
    const f = player.facing;
    const dx = head.position.x - player.position.x;
    const dy = head.position.y - player.position.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    // Dot product > 0 means player is facing roughly toward the head
    return (f.x * dx + f.y * dy) / len > 0;
  }

  _atkOverlapsHead(atk, head) {
    const ax = atk.position.x, ay = atk.position.y;
    const aw = atk.width  || GRID.CELL_SIZE;
    const ah = atk.height || GRID.CELL_SIZE;
    const hx = head.position.x, hy = head.position.y;
    const hw = head.width, hh = head.height;
    return ax < hx + hw && ax + aw > hx && ay < hy + hh && ay + ah > hy;
  }

  // ── Reflectable projectile hits ───────────────────────────────────────────

  // Mark reflectable projectiles when struck by player melee
  _checkReflectableHits() {
    const meleeAttacks     = this.game.combatSystem.getMeleeAttacks();
    const enemyProjectiles = this.game.combatSystem.getEnemyProjectiles();

    for (const atk of meleeAttacks) {
      for (const proj of enemyProjectiles) {
        if (!proj.reflectable || proj.reflected) continue;
        if (!this._atkOverlapsProj(atk, proj)) continue;

        // Reflect: reverse velocity, flag, boost damage, recolor
        proj.velocity.vx = -proj.velocity.vx;
        proj.velocity.vy = -proj.velocity.vy;
        proj.reflected    = true;
        proj.color        = '#ffffff';
        proj.char         = '●';
        proj.owner        = this.game.player;
        break; // one reflect per melee swing
      }
    }
  }

  // Each frame: check if any in-flight reflected projectile has hit any boss part.
  // A hit on ANY character (body, neck, or head) stuns the whole creature and
  // deals damage to the dragon (the canonical weak point for HP tracking).
  _checkReflectedProjectileBossHits() {
    if (!this.dragon) return;
    const enemyProjectiles = this.game.combatSystem.getEnemyProjectiles();
    // Include a synthetic hitbox for the rendered body (5-char strip at floatCenter)
    const cs = GRID.CELL_SIZE;
    const bodyHitbox = {
      position: { x: this.dragon.floatCenterX - cs * 2, y: this.dragon.floatCenterY },
      width: cs * 5,
      height: cs
    };
    const allParts = [this.dragon, ...this.heads, bodyHitbox];

    for (let i = enemyProjectiles.length - 1; i >= 0; i--) {
      const proj = enemyProjectiles[i];
      if (!proj.reflected) continue;

      const hit = allParts.some(e => this._projOverlapsEntity(proj, e));
      if (!hit) continue;

      // Damage dragon (HP lives here) and stun the whole composite.
      // Clear i-frames first so a reflected hit always registers regardless of phase state.
      this.dragon.invulnerabilityTimer = 0;
      this.dragon.takeDamage(proj.damage);
      this.game.combatSystem.createDamageNumber(
        proj.damage,
        this.dragon.position.x,
        this.dragon.position.y,
        '#ffffff'
      );
      this.applyStun(6.0);
      enemyProjectiles.splice(i, 1);
    }
  }

  applyStun(duration) {
    if (this.dragon) {
      this.dragon.bossStunTimer     = duration;
      this.dragon.invulnerabilityTimer = 0; // clear i-frames so melee hits land
    }
    for (const head of this.heads) {
      head.bossStunTimer = duration;
    }
  }

  _projOverlapsEntity(proj, entity) {
    const px = proj.position.x,     py = proj.position.y;
    const pw = proj.width  || GRID.CELL_SIZE;
    const ph = proj.height || GRID.CELL_SIZE;
    const ex = entity.position.x,   ey = entity.position.y;
    const ew = entity.width  || GRID.CELL_SIZE;
    const eh = entity.height || GRID.CELL_SIZE;
    return px < ex + ew && px + pw > ex && py < ey + eh && py + ph > ey;
  }

  _atkOverlapsProj(atk, proj) {
    const ax = atk.position.x, ay = atk.position.y;
    const aw = atk.width  || GRID.CELL_SIZE;
    const ah = atk.height || GRID.CELL_SIZE;
    const px = proj.position.x, py = proj.position.y;
    const pw = proj.width  || GRID.CELL_SIZE;
    const ph = proj.height || GRID.CELL_SIZE;
    return ax < px + pw && ax + aw > px && ay < py + ph && ay + ah > py;
  }


  // ── Red zone turtle boss ───────────────────────────────────────────────────

  _updateRedBoss(deltaTime) {
    const shell = this.turtleShell;
    const head  = this.turtleHead;

    // Provide target to both entities
    shell.target = this.game.player;
    if (head) head.target = this.game.player;

    this._checkTurtlePhaseTransition();

    // Handle head reveal: trigger boulder rain + extend head
    if (shell.headRevealPending) {
      shell.headRevealPending = false;
      if (this.game.boulderSystem) {
        this.game.boulderSystem.triggerBoulderRain(3);
      }
      if (head) head.extendHead(shell.chargeTargetAngle);
    }

    // Handle post-fire: retract head
    if (shell.justFired) {
      shell.justFired = false;
      if (head) head.retractHead();
    }

    // Phase 1: position extended head adjacent to shell along charge angle.
    // shell.position is body center; head.position is top-left of 2×2 head,
    // so subtract GRID.CELL_SIZE to convert center→top-left.
    if (shell.bossPhase === 1 && head && head.headState === 'extended') {
      const ext = GRID.CELL_SIZE * 3.0;
      head.position.x = shell.position.x + Math.cos(shell.chargeTargetAngle) * ext - GRID.CELL_SIZE;
      head.position.y = shell.position.y + Math.sin(shell.chargeTargetAngle) * ext - GRID.CELL_SIZE;
    }

    // Update leg positions relative to shell center (always track shell)
    const sx = shell.position.x, sy = shell.position.y;
    const cs = GRID.CELL_SIZE;
    const legs = this.turtleLegs;
    if (legs.length === 4) {
      // Position is top-left of 1×1 leg hitbox; render center = position + cs/2
      // Front row (above body), back row (below body)
      legs[0].position.x = sx - cs * 1.5;  legs[0].position.y = sy - cs * 1.5;  // front-left  /
      legs[1].position.x = sx + cs * 0.5;  legs[1].position.y = sy - cs * 1.5;  // front-right \
      legs[2].position.x = sx - cs * 1.5;  legs[2].position.y = sy + cs * 0.5;  // back-left   \
      legs[3].position.x = sx + cs * 0.5;  legs[3].position.y = sy + cs * 0.5;  // back-right  /
    }

    // Phase 2: ricochet rocks spawn on each wall bounce
    if (shell.ricochetPending) {
      const rc = shell.ricochetPending;
      shell.ricochetPending = null;
      this._spawnRicochetRocks(rc.x, rc.y, rc.vx, rc.vy, shell);
    }

    // Drain attack queues
    this._drainPendingAttacks(shell);
    if (head) this._drainPendingAttacks(head);

    if (shell.hp <= 0) this._onTurtleDefeated();
  }

  _checkTurtlePhaseTransition() {
    const hp = this.turtleShell.hp;

    // 75% HP: passive tortoise wave appears
    if (!this.tortoiseWaveSpawned && hp <= TURTLE_MAX_HP * 0.75) {
      this.tortoiseWaveSpawned = true;
      this._spawnTortoiseWave();
    }

    if (this.bossPhase === 1 && hp <= TURTLE_PHASE2_HP) {
      this.bossPhase = 2;
      this.turtleShell.transitionToPhase(2);
      if (this.turtleHead) this.turtleHead.transitionToPhase(2);
    }
  }

  _spawnTortoiseWave() {
    const room = this.game.currentRoom;
    if (!room) return;
    const cs = GRID.CELL_SIZE;
    // 5 tortoises placed in the outer thirds of the room, away from center
    const cx = GRID.WIDTH / 2, cy = GRID.HEIGHT / 2;
    const candidates = [
      { x: cs * 4,  y: cs * 4  },
      { x: cs * 4,  y: cy      },
      { x: cs * 4,  y: GRID.HEIGHT - cs * 4 },
      { x: cx,      y: cs * 4  },
      { x: cx,      y: GRID.HEIGHT - cs * 4 },
      { x: GRID.WIDTH - cs * 4, y: cs * 4  },
      { x: GRID.WIDTH - cs * 4, y: cy      },
      { x: GRID.WIDTH - cs * 4, y: GRID.HEIGHT - cs * 4 },
      { x: cx,      y: cy + cs * 4 },
      { x: cx - cs * 4, y: cy },
    ];
    // Shuffle and pick 5
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    for (let i = 0; i < 5; i++) {
      const pos = candidates[i];
      const tortoise = new Enemy('t', pos.x, pos.y, 0);
      tortoise.setCollisionMap(room.collisionMap);
      tortoise.setBackgroundObjects(room.backgroundObjects);
      room.enemies.push(tortoise);
      this.game.physicsSystem.addEntity(tortoise);
    }
  }

  _spawnRicochetRocks(x, y, vx, vy, shell) {
    if (!this.game.combatSystem) return;
    // 3 rocks fan outward using the post-bounce velocity direction (already into the room)
    const mag = Math.sqrt(vx * vx + vy * vy) || 1;
    const baseAngle = Math.atan2(vy / mag, vx / mag);
    const SPEED = 90;
    const SPREAD = Math.PI / 6;  // ±30°
    for (let i = -1; i <= 1; i++) {
      const angle = baseAngle + i * SPREAD;
      this.game.combatSystem.createEnemyAttack({
        type: 'enemy_projectile',
        char: '0',
        position: { x, y },
        velocity: { vx: Math.cos(angle) * SPEED, vy: Math.sin(angle) * SPEED },
        damage: 1,
        color: '#996633',
        owner: shell,
        shooterPlane: 0
      });
    }
  }

  _onTurtleDefeated() {
    this.game.zoneSystem.markBossDefeated(this.zone);
    const enemies  = this.game._activeEnemies();
    const bossSet  = new Set([this.turtleShell, this.turtleHead, ...this.turtleLegs]);
    for (let i = enemies.length - 1; i >= 0; i--) {
      if (bossSet.has(enemies[i])) enemies.splice(i, 1);
    }
    this.game.menuSystem.showPickupMessage('The Ancient Shell is defeated!', '#ff8800', 3.0);
    this._grantBossReward();
    this.deactivate();
  }

  // ── Boss defeat ────────────────────────────────────────────────────────────

  _onBossDefeated() {
    // Release any active grab
    for (const head of this.heads) {
      if (head.isGrabbing) head.releaseGrab();
    }

    // Mark zone defeated
    this.game.zoneSystem.markBossDefeated(this.zone);

    // Remove boss entities from enemies array (triggers normal room-clear logic)
    const enemies = this.game._activeEnemies();
    const bossEntities = new Set([this.dragon, ...this.heads]);
    for (let i = enemies.length - 1; i >= 0; i--) {
      if (bossEntities.has(enemies[i])) {
        enemies.splice(i, 1);
      }
    }

    // Announce
    this.game.menuSystem.showPickupMessage('The Goo Dragon is defeated!', '#22ff66', 3.0);
    this._grantBossReward();

    this.deactivate();
  }

  // ── Boss reward ────────────────────────────────────────────────────────────

  /** Grant +1 consumable slot, screen flash, and announce. */
  _grantBossReward() {
    this.game.inventorySystem.unlockConsumableSlot();
    this.game.bossDefeatFlash = { startTime: performance.now(), duration: 600 };
    this.game.menuSystem.showPickupMessage('Your power has grown');
    this.game.audioSystem.playSFX('boss_defeat');
  }

}
